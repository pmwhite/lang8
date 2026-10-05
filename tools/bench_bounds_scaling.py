#!/usr/bin/env python3
"""Measure verifier growth with independent sections and loops.

Each section has a local interval, two branches, and a result assignment.
Locals cease to be used after their section. No functions are split and no
proof budgets are changed. The loop-locals case puts the sections inside a
loop; the nested case measures repeated loop analysis. Fixed locals keep
many constant-length allocations live together, then prove accesses to each.
Record returns measure inference growth when many fields share one input.
Report verifier time separately from parsing and
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


def fixed_local_source(size: int) -> str:
    lines = ["main(argc: int, argv: []str): int {", "result: int = 0;"]
    lines += [f"values{i}: []int = new int[4](0);" for i in range(size)]
    lines += ["index: int = argc & 3;"]
    lines += [f"result = result + values{i}[index];" for i in range(size)]
    return "\n".join(lines + ["result", "}", ""])


def record_return_source(size: int) -> str:
    fields = ";\n".join(f"field{i}: int" for i in range(size))
    values = ", ".join(f"field{i}: n" for i in range(size))
    return (f"tag scaling;\ntype Many = {{\n{fields}\n}}\n"
            f"make(n: int): Many {{ Many {{ {values} }} }}\n"
            f"main(argc: int): int {{ result: Many = make(argc); result.field{size - 1} }}\n")


def loop_local_source(size: int) -> str:
    body = source(size).splitlines()[2:-2]
    return "\n".join([
        "main(argc: int, argv: []str): int {", "result: int = 0;",
        "for _iteration in 0..2 {", *body, "}", "result", "}", "",
    ])


def nested_source(depth: int) -> str:
    lines = ["main(): int {", "result: int = 0;"]
    for i in range(depth):
        lines += [f"index{i}: int = 0;", f"while (index{i} < 2) {{"]
    lines += ["result = result + 1;"]
    for i in reversed(range(depth)):
        lines += [f"index{i} = index{i} + 1", "}"]
    return "\n".join(lines + ["result", "}", ""])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("compiler", type=pathlib.Path)
    parser.add_argument("--baseline", type=pathlib.Path)
    parser.add_argument("--sizes", type=int, nargs="+", default=None)
    parser.add_argument("--shape", choices=["independent", "nested", "loop-locals", "fixed-locals", "record-returns"], default="independent")
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--cpu", type=int)
    args = parser.parse_args()
    if args.sizes is None:
        if args.shape == "nested":
            args.sizes = [2, 4, 6, 8, 10]
        elif args.shape == "record-returns":
            args.sizes = [8, 16, 32, 64, 128]
        else:
            args.sizes = [32, 64, 128, 256, 512]
    phase = "inference" if args.shape == "record-returns" else "validation"
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
            generator = {"nested": nested_source, "independent": source,
                         "loop-locals": loop_local_source,
                         "fixed-locals": fixed_local_source,
                         "record-returns": record_return_source}[args.shape]
            root.write_text(generator(size))
            samples = {name: [] for name in compilers}
            for run in range(args.runs + 1):
                for name in list(compilers)[::1 if run % 2 == 0 else -1]:
                    result = subprocess.run(
                        prefix + [str(compilers[name]), "build", "-p", str(root),
                                  "-o", str(directory / "program")],
                        capture_output=True, text=True, check=True,
                    )
                    match = re.search(rf"^profile: bounds {phase} ([\d.]+) ms",
                                      result.stderr, re.MULTILINE)
                    if match is None:
                        raise ValueError(f"missing bounds {phase} profile")
                    if run:
                        samples[name].append(float(match.group(1)))
            timings = ", ".join(f"{name} {statistics.median(values):.3f} ms"
                                for name, values in samples.items())
            print(f"{size} {args.shape} ({phase}): {timings}", flush=True)


if __name__ == "__main__":
    main()
