#!/usr/bin/env python3
"""Compare user-space hardware counters for full builds with two compilers.

Requires Linux perf access. Intel-specific retired-load and stall events are
optional; use `perf list` to check support on the measurement machine.
"""

import argparse
import csv
import json
import os
import pathlib
import statistics
import subprocess
import tempfile


GROUPS = {
    "overall": ["cycles", "instructions", "cache-references", "cache-misses"],
    "l1": ["cycles", "instructions", "L1-dcache-loads", "L1-dcache-load-misses", "L1-dcache-stores"],
    "retired-loads": ["cycles", "instructions", "mem_load_retired.l1_miss", "mem_load_retired.l2_miss", "mem_load_retired.l3_miss"],
    "branches": ["cycles", "instructions", "branches", "branch-misses"],
    "stalls": ["cycles", "instructions", "cycle_activity.stalls_total", "cycle_activity.stalls_l1d_miss", "cycle_activity.stalls_l3_miss"],
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("compiler", type=pathlib.Path)
    parser.add_argument("--baseline", type=pathlib.Path, required=True)
    parser.add_argument("--root", type=pathlib.Path, required=True)
    parser.add_argument("--runs", type=int, default=7)
    parser.add_argument("--cpu", type=int, help="pin each compiler to this logical CPU")
    parser.add_argument("--group", choices=GROUPS, action="append")
    parser.add_argument("--output", type=pathlib.Path, help="save individual samples and medians as JSON")
    args = parser.parse_args()
    if args.runs < 1:
        parser.error("--runs must be positive")
    if args.cpu is not None and args.cpu not in os.sched_getaffinity(0):
        parser.error("--cpu must be in the process's allowed CPU set")
    compilers = {"baseline": str(args.baseline.resolve()), "current": str(args.compiler.resolve())}
    report = {"compilers": compilers, "root": str(args.root.resolve()), "cpu": args.cpu, "groups": {}}
    env = dict(os.environ, LC_ALL="C")
    with tempfile.TemporaryDirectory(prefix="l8-perf-") as output:
        directory = pathlib.Path(output)
        command_prefix = [] if args.cpu is None else ["taskset", "-c", str(args.cpu)]
        builds = {
            name: command_prefix + [compiler, "build", str(args.root), "-o", str(directory / "program")]
            for name, compiler in compilers.items()
        }
        for command in builds.values():
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, env=env)
        for group in args.group or ["overall"]:
            events = GROUPS[group]
            samples = {name: [] for name in compilers}
            counter_file = directory / "counters.csv"
            for run in range(args.runs):
                order = list(compilers)[::1 if run % 2 == 0 else -1]
                for name in order:
                    command = ["perf", "stat", "-x", ",", "-o", str(counter_file), "-e",
                               "{" + ",".join(event + ":u" for event in events) + "}", "--"]
                    subprocess.run(command + builds[name], check=True, stdout=subprocess.DEVNULL, env=env)
                    values = {}
                    for fields in csv.reader(counter_file.read_text().splitlines()):
                        if len(fields) < 5 or fields[0].startswith("#"):
                            continue
                        event = fields[2].removesuffix(":u")
                        if event not in events:
                            continue
                        if not fields[0].isdigit() or float(fields[4]) < 99.9:
                            raise RuntimeError(f"{group}: unavailable or multiplexed counter: {fields}")
                        values[event] = int(fields[0])
                    if set(values) != set(events):
                        raise RuntimeError(f"{group}: incomplete counters: {counter_file.read_text()}")
                    samples[name].append(values)
            medians = {
                name: {event: statistics.median(row[event] for row in rows) for event in events}
                for name, rows in samples.items()
            }
            report["groups"][group] = {"samples": samples, "medians": medians}
            print(group, flush=True)
            for event in events:
                before, after = medians["baseline"][event], medians["current"][event]
                change = f"{100 * (after / before - 1):+.1f}%" if before else "n/a"
                print(f"  {event}: {before:,.0f} -> {after:,.0f} ({change})", flush=True)
            if args.output:
                args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
