#!/usr/bin/env python3
"""Alternate warm game builds with original, C and assembly search kernels.

python3 tools/verifier_kernel/bench.py .build/verifier-kernel --cpu 2 --runs 15
Writes individual samples and median wall/profile times to timing.json.
For counters, use tools/bench_perf.py with the generated compiler variants.
"""
import argparse
import json
from pathlib import Path
import re
import statistics
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--cpu', type=int, default=2)
    parser.add_argument('--runs', type=int, default=15)
    parser.add_argument('--source', default='programs/block-game/block-game.l8')
    args = parser.parse_args()
    if args.runs < 1:
        parser.error('--runs must be positive')
    directory = args.directory.resolve()
    binaries = ['compiler', 'compiler-c', 'compiler-asm']
    rows = {name: [] for name in binaries}
    expected = None
    for iteration in range(args.runs + 1):
        # Rotate every round so each variant occupies every position.
        order = binaries[iteration % 3:] + binaries[:iteration % 3]
        for name in order:
            output = directory / 'benchmark-output'
            start = time.perf_counter()
            result = subprocess.run(['taskset', '-c', str(args.cpu), str(directory / name),
                                     'build', '-p', args.source, '-o', str(output)],
                                    capture_output=True, text=True, check=True)
            elapsed = 1000 * (time.perf_counter() - start)
            code = output.read_bytes()
            if expected is None:
                expected = code
            assert code == expected, f'{name} changed compiled output'
            if iteration:
                row = {k: float(v) for k, v in re.findall(
                    r'^profile: (.*?) ([\d.]+) ms', result.stderr, re.M)}
                row['wall'] = elapsed
                rows[name].append(row)
    medians = {name: {key: statistics.median(row[key] for row in samples)
                     for key in samples[0]} for name, samples in rows.items()}
    report = {'source': args.source, 'cpu': args.cpu, 'samples': rows, 'medians': medians}
    (directory / 'timing.json').write_text(json.dumps(report, indent=2) + '\n')
    for name, values in medians.items():
        print(f'{name}: {values["wall"]:.3f} ms')


if __name__ == '__main__':
    main()
