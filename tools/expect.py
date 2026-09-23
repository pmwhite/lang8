#!/usr/bin/env python3
"""Run L8 examples with expectations stored in trailing //% comments.

Usage: python3 tools/expect.py COMPILER BUILD_DIR FILE [FILE ...]
       python3 tools/expect.py COMPILER BUILD_DIR --discover DIR [--discover DIR ...]

    //% test: run
    //% stdout: "Hi\n"
    //% stderr: ""
    //% exit: 0
    //% bootstrap: true

    //% test: compile-fail
    //% error-contains: "assignment type mismatch"

Strings use JSON escapes. A run expects empty stderr unless specified. Compiler
diagnostics from a successful build are displayed but do not fail a run test;
warning-specific tests remain in build.sh.
"""

import difflib
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys


def expectations(path: pathlib.Path) -> dict[str, object]:
    result: dict[str, object] = {}
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.startswith("//% "):
            continue
        key, separator, raw = line[4:].partition(": ")
        if not separator or key not in {"test", "stdout", "stderr", "exit", "error-contains", "bootstrap"}:
            raise ValueError(f"{path}:{number}: invalid expectation")
        if key in result:
            raise ValueError(f"{path}:{number}: duplicate {key} expectation")
        try:
            value = raw if key == "test" else json.loads(raw)
        except json.JSONDecodeError as error:
            raise ValueError(f"{path}:{number}: invalid JSON: {error.msg}") from error
        result[key] = value
    mode = result.get("test")
    if type(result.get("bootstrap", False)) is not bool:
        raise ValueError(f"{path}: bootstrap must be true or false")
    if mode == "run":
        if "stdout" not in result or "exit" not in result or "error-contains" in result:
            raise ValueError(f"{path}: run needs stdout and exit, without error-contains")
        if not isinstance(result["stdout"], str) or not isinstance(result["stderr"] if "stderr" in result else "", str):
            raise ValueError(f"{path}: stdout and stderr must be strings")
        if type(result["exit"]) is not int or not 0 <= result["exit"] <= 255:
            raise ValueError(f"{path}: exit must be an integer from 0 to 255")
    elif mode == "compile-fail":
        if set(result) - {"test", "error-contains", "bootstrap"} or "error-contains" not in result or not isinstance(result["error-contains"], str) or not result["error-contains"]:
            raise ValueError(f"{path}: compile-fail needs one nonempty error-contains string")
    else:
        raise ValueError(f"{path}: missing or unknown test mode")
    return result


def discover(roots: list[pathlib.Path], bootstrap_only: bool = False) -> list[pathlib.Path]:
    sources: set[pathlib.Path] = set()
    for root in roots:
        if not root.is_dir():
            raise ValueError(f"{root}: discovery root is not a directory")
        for path in root.rglob("*.l8"):
            if any(line.startswith("//% ") for line in path.read_text(encoding="utf-8").splitlines()):
                if not bootstrap_only or expectations(path).get("bootstrap", False):
                    sources.add(path)
    if not sources:
        raise ValueError("no tests discovered")
    return sorted(sources)


def show_diff(label: str, wanted: str, actual: str) -> str:
    diff = "".join(difflib.unified_diff(
        wanted.splitlines(keepends=True), actual.splitlines(keepends=True),
        fromfile=f"expected {label}", tofile=f"actual {label}",
    ))
    if diff:
        return diff
    return f"expected {label} {wanted!r}, got {actual!r}"


def check_equal(label: str, wanted: object, actual: object) -> None:
    if wanted != actual:
        raise ValueError(f"expected {label} {wanted!r}, got {actual!r}")


def check_stream(label: str, wanted: str, actual: bytes) -> None:
    wanted_bytes = wanted.encode("utf-8")
    if wanted_bytes != actual:
        diff = show_diff(label, wanted, actual.decode("utf-8", errors="replace"))
        raise ValueError(f"{diff}\nexpected bytes {wanted_bytes!r}, got {actual!r}")


def run_one(compiler: pathlib.Path, build_dir: pathlib.Path, source: pathlib.Path) -> None:
    expect = expectations(source)
    if expect["test"] == "compile-fail":
        proc = subprocess.run([str(compiler), "compile", str(source)], capture_output=True)
        if proc.returncode == 0:
            raise ValueError("compilation succeeded; expected an error")
        error = proc.stderr.decode("utf-8", errors="replace")
        if "error:" not in error or expect["error-contains"] not in error:
            raise ValueError(f"expected error containing {expect['error-contains']!r}; got:\n{error}")
        return

    source_id = hashlib.sha256(str(source).encode("utf-8")).hexdigest()[:12]
    output = build_dir / f"{source.stem}-{source_id}"
    output.parent.mkdir(parents=True, exist_ok=True)
    build = subprocess.run([str(compiler), "build", str(source), "-o", str(output)], capture_output=True)
    if build.returncode:
        raise ValueError(f"build exited {build.returncode}:\n{build.stderr.decode('utf-8', errors='replace')}")
    if build.stderr:
        sys.stderr.buffer.write(build.stderr)
    proc = subprocess.run([str(output)], capture_output=True)
    check_equal("exit status", expect["exit"], proc.returncode)
    check_stream("stdout", expect["stdout"], proc.stdout)
    check_stream("stderr", expect.get("stderr", ""), proc.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("compiler", type=pathlib.Path)
    parser.add_argument("build_dir", type=pathlib.Path)
    parser.add_argument("files", nargs="*", type=pathlib.Path)
    parser.add_argument("--discover", action="append", type=pathlib.Path, default=[], metavar="DIR")
    parser.add_argument("--bootstrap-only", action="store_true")
    parser.add_argument("--list", action="store_true", help="list selected tests without running them")
    args = parser.parse_args()
    compiler = args.compiler.resolve()
    build_dir = args.build_dir
    try:
        sources = sorted(set(args.files) | set(discover(args.discover, args.bootstrap_only) if args.discover else []))
        if not sources:
            raise ValueError("no test files specified")
        if args.bootstrap_only and not args.discover:
            sources = [p for p in sources if expectations(p).get("bootstrap", False)]
            if not sources:
                raise ValueError("no bootstrap tests selected")
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    if args.list:
        for source in sources:
            print(source)
        return 0
    failures = 0
    for source in sources:
        try:
            run_one(compiler, build_dir, source)
        except (OSError, ValueError) as error:
            print(f"FAIL {source}: {error}", file=sys.stderr)
            failures += 1
    if failures:
        print(f"{failures} expectation(s) failed", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
