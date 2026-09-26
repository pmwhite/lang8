#!/usr/bin/env python3
"""Measure strict bounds analysis on identical roots with one or two compilers."""

import argparse
import pathlib
import re
import statistics
import subprocess
import time


def measure(compiler: pathlib.Path, source: pathlib.Path, runs: int) -> tuple[float, float]:
    walls = []
    proofs = []
    for _ in range(runs):
        start = time.perf_counter()
        result = subprocess.run(
            [str(compiler.resolve()), "compile", "--verify-bounds", "-p", str(source)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            check=True,
        )
        walls.append(1000 * (time.perf_counter() - start))
        phases = re.findall(r"^profile: bounds .*? ([0-9.]+) ms", result.stderr, re.MULTILINE)
        if not phases:
            raise ValueError(f"{compiler} did not report bounds phase timings")
        proofs.append(sum(float(phase) for phase in phases))
    return statistics.median(walls), statistics.median(proofs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("compiler", type=pathlib.Path)
    parser.add_argument("--baseline", type=pathlib.Path)
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--root", type=pathlib.Path, action="append")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be positive")
    for root in args.root or [pathlib.Path("src1/main.l8")]:
        print(root)
        for name, compiler in [("baseline", args.baseline), ("current", args.compiler)]:
            if compiler is None:
                continue
            wall, proof = measure(compiler, root, args.runs)
            print(f"  {name}: wall {wall:.2f} ms, bounds {proof:.2f} ms (median of {args.runs})")


if __name__ == "__main__":
    main()
