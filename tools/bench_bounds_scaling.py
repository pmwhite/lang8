#!/usr/bin/env python3
"""Measure verifier growth as independent sections accumulate in one function.

Each section has a local interval, two branches, and a result assignment.
Locals cease to be used after their section. No functions are split and no
proof budgets are changed. Report validation time separately from parsing and
code generation, which have their own scaling behavior.
"""

import argparse
import pathlib
import re
import statistics
import subprocess
import tempfile


def source(size: int) -> str:
    lines = ["main(argc: int, argv: []str): int {", "result: int = 0;"]
    for i in range(size):
        lines += [
            f"v{i}: int = {i};",
            f"if (argc > {i}) v{i} = {i + 1};",
            f"if (v{i} > {i}) result = {i};",
        ]
    return "\n".join(lines + ["result", "}", ""])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("compiler", type=pathlib.Path)
    parser.add_argument("--baseline", type=pathlib.Path)
    parser.add_argument("--sizes", type=int, nargs="+", default=[32, 64, 128, 256, 512])
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--cpu", type=int)
    args = parser.parse_args()
    if args.runs < 1 or any(size < 1 for size in args.sizes):
        parser.error("sizes and runs must be positive")
    compilers = {"current": args.compiler.resolve()}
    if args.baseline:
        compilers = {"baseline": args.baseline.resolve(), **compilers}
    prefix = [] if args.cpu is None else ["taskset", "-c", str(args.cpu)]
    with tempfile.TemporaryDirectory(prefix="l8-bounds-scaling-") as temporary:
        directory = pathlib.Path(temporary)
        for size in args.sizes:
            root = directory / "scaling.l8"
            root.write_text(source(size))
            samples = {name: [] for name in compilers}
            for run in range(args.runs + 1):
                for name in list(compilers)[::1 if run % 2 == 0 else -1]:
                    result = subprocess.run(
                        prefix + [str(compilers[name]), "build", "-p", str(root),
                                  "-o", str(directory / "program")],
                        capture_output=True, text=True, check=True,
                    )
                    match = re.search(r"^profile: bounds validation ([\d.]+) ms",
                                      result.stderr, re.MULTILINE)
                    if match is None:
                        raise ValueError("missing bounds validation profile")
                    if run:
                        samples[name].append(float(match.group(1)))
            timings = ", ".join(f"{name} {statistics.median(values):.3f} ms"
                                for name, values in samples.items())
            print(f"{size} sections: {timings}", flush=True)


if __name__ == "__main__":
    main()
