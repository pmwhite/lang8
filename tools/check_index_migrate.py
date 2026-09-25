"""Find inline check_index calls that strict compilation can remove.

Each trial changes one call in a temporary copy of the import graph. A passing
strict compile proves that the inferred contract also holds at its callers in
the selected root. Ordinary compiler runs are unaffected.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
import re
import subprocess
import sys
import tempfile


IMPORT = re.compile(rb'\bimport\s+"([^"\r\n]+)"')
CHECK = re.compile(rb'\bcheck_index\s*\(')
PATH = re.compile(rb'[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*')
INDEX = re.compile(rb'(?:[0-9]+|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)')
CALLER_ERRORS = (
    b"call does not prove inferred array bounds requirement",
    b"call requires distinct record arguments for bounds proof",
    b"index_for array and index arguments must be free of side effects",
)


@dataclass(frozen=True)
class Candidate:
    path: Path
    start: int
    end: int
    index: bytes
    line: int
    column: int


def code_mask(source: bytes) -> bytes:
    """Blank comments and literals without changing byte offsets."""
    out = bytearray(source)
    state = "code"
    i = 0
    while i < len(source):
        c = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else -1
        if state == "code":
            if c == 47 and nxt == 47:
                state = "line"
                out[i] = out[i + 1] = 32
                i += 2
                continue
            if c == 47 and nxt == 42:
                state = "block"
                out[i] = out[i + 1] = 32
                i += 2
                continue
            if c in (34, 39):
                state = "string" if c == 34 else "char"
                out[i] = 32
        elif state == "line":
            if c == 10:
                state = "code"
            else:
                out[i] = 32
        elif state == "block":
            if c == 42 and nxt == 47:
                out[i] = out[i + 1] = 32
                state = "code"
                i += 2
                continue
            if c != 10:
                out[i] = 32
        else:
            if c == 92 and i + 1 < len(source):
                out[i] = out[i + 1] = 32
                i += 2
                continue
            if c == (34 if state == "string" else 39):
                state = "code"
            if c != 10:
                out[i] = 32
        i += 1
    return bytes(out)


def imports(path: Path, source: bytes) -> list[Path]:
    mask = code_mask(source)
    result = []
    for match in IMPORT.finditer(source):
        if mask[match.start():match.start() + 6] == b"import":
            result.append((path.parent / match.group(1).decode()).resolve())
    return result


def import_graph(root: Path, workspace: Path) -> dict[Path, bytes]:
    pending = [root]
    sources: dict[Path, bytes] = {}
    while pending:
        path = pending.pop().resolve()
        if path in sources:
            continue
        if not path.is_relative_to(workspace):
            raise ValueError(f"import leaves workspace: {path}")
        source = path.read_bytes()
        sources[path] = source
        pending.extend(imports(path, source))
    return sources


def call_end(mask: bytes, opening: int) -> tuple[int, int] | None:
    stack: list[int] = []
    comma = -1
    for pos in range(opening + 1, len(mask)):
        c = mask[pos]
        if c in (40, 91, 123):
            stack.append(c)
        elif c in (41, 93, 125):
            if not stack:
                return (comma, pos + 1) if c == 41 and comma >= 0 else None
            if stack.pop() != {41: 40, 93: 91, 125: 123}[c]:
                return None
        elif c == 44 and not stack and comma < 0:
            comma = pos
    return None


def candidates(path: Path, source: bytes) -> list[Candidate]:
    mask = code_mask(source)
    result = []
    for match in CHECK.finditer(mask):
        opening = mask.find(b"(", match.start(), match.end())
        parsed = call_end(mask, opening)
        if parsed is None:
            continue
        comma, end = parsed
        before = mask[:match.start()].rstrip()
        if not before.endswith(b"[") or mask[end:].lstrip()[:1] != b"]":
            continue
        array_match = re.search(rb'[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*$', before[:-1])
        if array_match is None:
            continue
        prefix = before[:array_match.start()].rstrip()
        if prefix and prefix[-1] not in b"(=,:;{[!+-*/%<>|&? \n\r\t":
            continue
        array = array_match.group().strip()
        checked_array = source[opening + 1:comma].strip()
        index = source[comma + 1:end - 1].strip()
        if not PATH.fullmatch(array) or checked_array != array or not INDEX.fullmatch(index):
            continue
        line = source.count(b"\n", 0, match.start()) + 1
        previous = source.rfind(b"\n", 0, match.start())
        result.append(Candidate(path, match.start(), end, index, line, match.start() - previous))
    return result


def strict_compile(compiler: Path, root: Path) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [str(compiler), "compile", "--verify-bounds", str(root)],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )


def replace_one(source: bytes, candidate: Candidate) -> bytes:
    return source[:candidate.start] + candidate.index + source[candidate.end:]


def replace_many(source: bytes, selected: list[Candidate]) -> bytes:
    for candidate in sorted(selected, key=lambda item: item.start, reverse=True):
        source = replace_one(source, candidate)
    return source


def classify(stderr: bytes) -> str:
    return "needs caller change" if any(error in stderr for error in CALLER_ERRORS) else "keep runtime check"


def run(
    root: Path, workspace: Path, compiler: Path, limit: int | None,
    only_file: Path | None, apply: bool,
) -> int:
    sources = import_graph(root, workspace)
    if only_file is not None:
        if only_file not in sources:
            raise ValueError(f"file is not imported by the selected root: {only_file}")
        selected_sources = {only_file: sources[only_file]}
    else:
        selected_sources = sources
    sites = sorted(
        (site for path, source in selected_sources.items() for site in candidates(path, source)),
        key=lambda site: (str(site.path), site.start),
    )
    if limit is not None:
        sites = sites[:limit]
    with tempfile.TemporaryDirectory(prefix="l8-check-migration-") as temporary:
        copy_root = Path(temporary)
        copies: dict[Path, Path] = {}
        for path, source in sources.items():
            copy = copy_root / path.relative_to(workspace)
            copy.parent.mkdir(parents=True, exist_ok=True)
            copy.write_bytes(source)
            copies[path] = copy
        trial_root = copies[root]
        baseline = strict_compile(compiler, trial_root)
        if baseline.returncode:
            sys.stderr.buffer.write(baseline.stderr)
            raise ValueError("baseline strict compilation failed")
        removable: list[Candidate] = []
        counts = {"removable": 0, "needs caller change": 0, "keep runtime check": 0}
        for site in sites:
            copy = copies[site.path]
            copy.write_bytes(replace_one(sources[site.path], site))
            try:
                trial = strict_compile(compiler, trial_root)
            finally:
                copy.write_bytes(sources[site.path])
            status = "removable" if trial.returncode == 0 else classify(trial.stderr)
            counts[status] += 1
            if status == "removable":
                removable.append(site)
            print(f"{site.path.relative_to(workspace)}:{site.line}:{site.column}: {status}", flush=True)
        print(
            f"analyzed {len(sites)} of {sum(len(candidates(path, source)) for path, source in selected_sources.items())} "
            f"candidates: {counts['removable']} removable, "
            f"{counts['needs caller change']} need caller changes, "
            f"{counts['keep runtime check']} keep runtime checks",
            flush=True,
        )
        if not apply or not removable:
            return 0
        grouped: dict[Path, list[Candidate]] = {}
        for site in removable:
            grouped.setdefault(site.path, []).append(site)
        for path, selected in grouped.items():
            copies[path].write_bytes(replace_many(sources[path], selected))
        combined = strict_compile(compiler, trial_root)
        if combined.returncode:
            sys.stderr.buffer.write(combined.stderr)
            raise ValueError("removals did not compile together; no source files changed")
        try:
            for path, selected in grouped.items():
                path.write_bytes(replace_many(sources[path], selected))
            build = subprocess.run([str(workspace / "build.sh"), "all"], cwd=workspace)
            if build.returncode:
                raise ValueError("full build failed after applying removals")
        except BaseException:
            for path in grouped:
                path.write_bytes(sources[path])
            raise
        print(f"applied {len(removable)} removals and passed the full build")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="strict-mode program root")
    parser.add_argument("--compiler", type=Path, default=Path("./l8c3"))
    parser.add_argument("--workspace", type=Path, default=Path.cwd())
    parser.add_argument("--file", type=Path, help="inspect only this imported source file")
    parser.add_argument("--limit", type=int, help="analyze only the first N candidates")
    parser.add_argument("--apply", action="store_true", help="apply removable checks and run ./build.sh all")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 0:
        parser.error("--limit must be nonnegative")
    workspace = args.workspace.resolve()
    root = args.source.resolve()
    compiler = args.compiler.resolve()
    try:
        return run(root, workspace, compiler, args.limit,
                   args.file.resolve() if args.file is not None else None, args.apply)
    except (ValueError, OSError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
