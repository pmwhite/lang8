#!/usr/bin/env python3
"""Time the workloads we care about with one compiler, or compare two.

Workloads:
  self   build the compiler (src2/main.l8)
  game   build the block game
  fmt    format every src2 file (to stdout; sources are not changed)

Runs alternate between compilers so drift affects both equally. Reported
times are medians. --phases adds the compiler's own `build -p` phase medians;
--counters adds user-mode cycles and instructions from `perf stat`, which are
much steadier than wall time on a busy machine.

Examples:
  tools/profile.py                              # ./l8, all workloads
  tools/profile.py game --phases
  tools/profile.py --baseline .build/l8-before --counters --cpu 3
"""

import argparse
import pathlib
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKLOADS = {
    "self": "src2/main.l8",
    "game": "programs/block-game/block-game.l8",
    "fmt": None,
}
PHASE = re.compile(r"^profile: (.+?) ([0-9.]+) ms", re.MULTILINE)


def command(compiler: pathlib.Path, workload: str, output: pathlib.Path, phases: bool) -> list[list[str]]:
    if workload == "fmt":
        return [[str(compiler), "fmt", str(path)] for path in sorted((ROOT / "src2").glob("*.l8"))]
    flags = ["-p"] if phases else []
    return [[str(compiler), "build", *flags, WORKLOADS[workload], "-o", str(output)]]


def run(commands: list[list[str]], pin: list[str]) -> tuple[float, str]:
    start = time.perf_counter()
    stderr = []
    for argv in commands:
        result = subprocess.run(pin + argv, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode:
            sys.exit(f"error: {' '.join(argv)} exited {result.returncode}\n{result.stderr}")
        stderr.append(result.stderr)
    return 1000 * (time.perf_counter() - start), "".join(stderr)


def counters(commands: list[list[str]], pin: list[str]) -> dict[str, float]:
    # Count one repetition; a multi-file workload runs in one shell.
    script = " && ".join(" ".join(f"'{part}'" for part in argv) + " >/dev/null" for argv in commands)
    result = subprocess.run(
        ["perf", "stat", "-x,", "-e", "cycles:u,instructions:u", *pin, "sh", "-c", script],
        cwd=ROOT, capture_output=True, text=True,
    )
    values: dict[str, float] = {}
    for line in result.stderr.splitlines():
        fields = line.split(",")
        if len(fields) > 2 and fields[0].replace(".", "").isdigit():
            values[fields[2].split(":")[0]] = float(fields[0])
    if result.returncode or not values:
        sys.exit(f"error: perf stat failed:\n{result.stderr}")
    return values


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("workloads", nargs="*", metavar="WORKLOAD", help="self, game, fmt (default: all)")
    parser.add_argument("--compiler", type=pathlib.Path, default=ROOT / "l8")
    parser.add_argument("--baseline", type=pathlib.Path, help="compare against this compiler")
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--phases", action="store_true", help="report compiler phase medians")
    parser.add_argument("--counters", action="store_true", help="report perf cycles and instructions")
    parser.add_argument("--cpu", help="pin runs to this CPU with taskset")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be positive")
    if args.counters and not shutil.which("perf"):
        parser.error("--counters needs perf")
    workloads = args.workloads or list(WORKLOADS)
    for workload in workloads:
        if workload not in WORKLOADS:
            parser.error(f"unknown workload {workload}; choose from {', '.join(WORKLOADS)}")
    compilers = {"current": args.compiler.resolve()}
    if args.baseline:
        compilers = {"baseline": args.baseline.resolve(), **compilers}
    for path in compilers.values():
        if not path.is_file():
            parser.error(f"{path}: no such compiler")
    pin = ["taskset", "-c", args.cpu] if args.cpu else []

    with tempfile.TemporaryDirectory(prefix="l8-profile-") as scratch:
        output = pathlib.Path(scratch) / "out"
        for workload in workloads:
            walls: dict[str, list[float]] = {name: [] for name in compilers}
            phases: dict[str, dict[str, list[float]]] = {name: {} for name in compilers}
            for name, compiler in compilers.items():
                run(command(compiler, workload, output, False), pin)  # warm caches
            for _ in range(args.runs):
                for name, compiler in compilers.items():
                    wall, stderr = run(command(compiler, workload, output, args.phases), pin)
                    walls[name].append(wall)
                    for label, ms in PHASE.findall(stderr):
                        phases[name].setdefault(label, []).append(float(ms))
            print(f"{workload} (median of {args.runs})")
            base = statistics.median(walls["baseline"]) if args.baseline else None
            for name in compilers:
                wall = statistics.median(walls[name])
                change = f"  {100 * (wall - base) / base:+.1f}%" if base and name != "baseline" else ""
                print(f"  {name:8} {wall:8.1f} ms  (min {min(walls[name]):.1f}){change}")
            if args.counters:
                counts: dict[str, dict[str, list[float]]] = {name: {} for name in compilers}
                for _ in range(args.runs):
                    for name, compiler in compilers.items():
                        for key, value in counters(command(compiler, workload, output, False), pin).items():
                            counts[name].setdefault(key, []).append(value)
                for name in compilers:
                    cells = []
                    for key, values in counts[name].items():
                        value = statistics.median(values)
                        cell = f"{key} {value / 1e6:.1f}M"
                        if args.baseline and name != "baseline":
                            before = statistics.median(counts["baseline"][key])
                            cell += f" ({100 * (value - before) / before:+.1f}%)"
                        cells.append(cell)
                    print(f"  {name:8} " + "  ".join(cells))
            if args.phases and workload != "fmt":
                labels = list(phases["current"])
                print("  phase" + "".join(f"{name:>12}" for name in compilers))
                for label in labels:
                    cells = "".join(f"{statistics.median(phases[name].get(label, [0])):12.1f}" for name in compilers)
                    print(f"    {label:22}{cells}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
