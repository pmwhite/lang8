"""Run L8 library tests with compiler-instrumented inline expectations."""

import argparse
import difflib
import json
import pathlib
import re
import subprocess
import sys
import tempfile


DIRECTIVE = re.compile(rb'^([ \t]*//% expect: )(.*)(\r?\n?)$')
STDERR_DIRECTIVE = re.compile(rb'^([ \t]*//% stderr: )(.*)(\r?\n?)$')
MARKER = re.compile(rb'\x1e[\x00-\xff]{7}')


def expectations(source: pathlib.Path) -> tuple[list[int], dict[int, str], list[bytes], dict[int, str]]:
    lines = source.read_bytes().splitlines(keepends=True)
    order: list[int] = []
    values: dict[int, str] = {}
    labels: dict[int, str] = {}
    offset = 0
    for line_number, line in enumerate(lines, 1):
        match = DIRECTIVE.fullmatch(line)
        if match:
            position = offset + line.index(b"//% expect:")
            try:
                value = json.loads(match.group(2).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise ValueError(f"{source}:{line_number}: invalid JSON string: {error}") from error
            if not isinstance(value, str):
                raise ValueError(f"{source}:{line_number}: expected value must be a JSON string")
            order.append(position)
            values[position] = value
            labels[position] = f"{source}:{line_number}"
        elif b"//% expect:" in line:
            raise ValueError(f"{source}:{line_number}: malformed expectation")
        offset += len(line)
    if not order:
        raise ValueError(f"{source}: no inline expectations")
    return order, values, lines, labels


def stderr_expectation(lines: list[bytes], source: pathlib.Path) -> str | None:
    expected = None
    for line_number, line in enumerate(lines, 1):
        match = STDERR_DIRECTIVE.fullmatch(line)
        if match:
            if expected is not None:
                raise ValueError(f"{source}:{line_number}: duplicate stderr expectation")
            try:
                expected = json.loads(match.group(2).decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise ValueError(f"{source}:{line_number}: invalid JSON string: {error}") from error
            if not isinstance(expected, str):
                raise ValueError(f"{source}:{line_number}: stderr must be a JSON string")
        elif b"//% stderr:" in line:
            raise ValueError(f"{source}:{line_number}: malformed stderr expectation")
    return expected


def checkpoint_output(stdout: bytes) -> list[tuple[int, str]]:
    result: list[tuple[int, str]] = []
    position = 0
    for marker in MARKER.finditer(stdout):
        offset = int.from_bytes(marker.group()[1:], "little")
        try:
            value = stdout[position:marker.start()].decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError(f"checkpoint output is not UTF-8: {error}") from error
        result.append((offset, value))
        position = marker.end()
    if stdout[position:]:
        raise ValueError(f"uncheckpointed trailing stdout: {stdout[position:]!r}")
    return result


def compare(
    order: list[int], expected: dict[int, str], actual: list[tuple[int, str]],
    labels: dict[int, str] | None = None,
) -> list[str]:
    positions = [position for position, _ in actual]
    if positions != order:
        def label(position: int) -> str:
            return (labels or {}).get(position, f"byte {position}")
        raise ValueError(
            "checkpoint order mismatch: expected " + repr([label(p) for p in order])
            + ", got " + repr([label(p) for p in positions])
        )
    failures = []
    for position, value in actual:
        if expected[position] != value:
            name = (labels or {}).get(position, f"byte {position}")
            failures.append("".join(difflib.unified_diff(
                [json.dumps(expected[position], ensure_ascii=False) + "\n"],
                [json.dumps(value, ensure_ascii=False) + "\n"],
                fromfile=f"{name} expected", tofile=f"{name} actual",
            )))
    return failures


def accept(lines: list[bytes], values: dict[int, str], source: pathlib.Path,
           stderr: str | None = None) -> None:
    updated = []
    offset = 0
    for line in lines:
        match = DIRECTIVE.fullmatch(line)
        if match:
            position = offset + line.index(b"//% expect:")
            updated.append(match.group(1) + json.dumps(values[position], ensure_ascii=True).encode()
                           + match.group(3))
        elif stderr is not None and (match := STDERR_DIRECTIVE.fullmatch(line)):
            updated.append(match.group(1) + json.dumps(stderr, ensure_ascii=True).encode()
                           + match.group(3))
        else:
            updated.append(line)
        offset += len(line)
    source.write_bytes(b"".join(updated))


def discover(sources: list[pathlib.Path], directories: list[pathlib.Path]) -> list[pathlib.Path]:
    found = {path.resolve() for path in sources}
    for directory in directories:
        for path in directory.rglob("*.l8"):
            if b"//% expect:" in path.read_bytes():
                found.add(path.resolve())
    if not found:
        raise ValueError("no inline expectation tests found")
    return sorted(found)


def run(source: pathlib.Path, compiler: pathlib.Path, update: bool) -> None:
    source = source.resolve()
    compiler = compiler.resolve()
    order, expected, lines, labels = expectations(source)
    expected_stderr = stderr_expectation(lines, source)
    with tempfile.TemporaryDirectory(prefix="l8-lib-expect-") as directory:
        binary = pathlib.Path(directory) / "test"
        build = subprocess.run(
            [str(compiler), "build", "--expect", str(source), "-o", str(binary)],
            capture_output=True,
        )
        if build.returncode:
            raise ValueError(f"build failed:\n{build.stderr.decode(errors='replace')}")
        execution = subprocess.run([str(binary)], capture_output=True)
    if execution.returncode:
        raise ValueError(
            f"test exited {execution.returncode}; stderr:\n{execution.stderr.decode(errors='replace')}"
        )
    try:
        actual_stderr = execution.stderr.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"stderr is not UTF-8: {error}") from error
    if expected_stderr is None and actual_stderr:
        raise ValueError(f"unexpected stderr:\n{actual_stderr}")
    actual = checkpoint_output(execution.stdout)
    differences = compare(order, expected, actual, labels)
    if expected_stderr is not None and expected_stderr != actual_stderr:
        differences.append("stderr: expected " + json.dumps(expected_stderr)
                           + ", got " + json.dumps(actual_stderr))
    if differences and update:
        accept(lines, dict(actual), source,
               actual_stderr if expected_stderr is not None else None)
        print(f"accepted {len(differences)} changed expectation(s) in {source}")
    elif differences:
        raise ValueError("\n".join(differences) + f"\nRun with --accept to update {source}.")
    else:
        print(f"ok: {source} ({len(order)} checkpoints)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path, nargs="*")
    parser.add_argument("--discover", type=pathlib.Path, action="append", default=[],
                        help="find L8 sources with inline expectations recursively")
    parser.add_argument("--compiler", type=pathlib.Path, default=pathlib.Path("./l8c3"))
    parser.add_argument("--accept", action="store_true", help="update changed snapshots after a successful run")
    args = parser.parse_args()
    try:
        for source in discover(args.source, args.discover):
            run(source, args.compiler, args.accept)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
