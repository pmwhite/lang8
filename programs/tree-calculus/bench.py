#!/usr/bin/env python3
"""Run the upstream mini suite, verifying every timed invocation's output."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import resource
import shlex
import subprocess
import time


def natural(n):
    bits = []
    while n:
        bits.append('210' if n & 1 else '20')
        n >>= 1
    return ''.join(bits) + '0'


def cases(root):
    source = (root / 'benchmark/run.sh').read_text()

    def tree(name):
        match = re.search(r"^" + name + r"='([012]+)'", source, re.M)
        if not match:
            raise ValueError(f'upstream benchmark no longer defines {name}')
        return match[1]

    def number(name):
        match = re.search(r'^' + name + r'=(\d+)', source, re.M)
        if not match:
            raise ValueError(f'upstream benchmark no longer defines {name}')
        return int(match[1])

    def sequence(values):
        return ''.join('2' + natural(n) for n in values) + '0'

    n = number('FIB_N')
    a, b = 1, 1
    for _ in range(n):
        a, b = b, a + b
    exp = number('SILLY_EXP_N')
    size = number('MERGE_SORT_N')
    return [
        ('size', [tree('SIZE_TERNARY')] * 2, tree('SIZE_EXPECTED')),
        ('recursive-fib', [tree('FIB_TERNARY'), natural(n)], natural(a)),
        ('silly-exp', [tree('SILLY_EXP_TERNARY'), natural(exp)], natural(2 ** exp)),
        ('exercise-rules', [tree('EXERCISE_RULES_TERNARY'),
                            natural(number('EXERCISE_RULES_N'))], '10'),
        ('merge-sort', [tree('MERGE_SORT_TERNARY'), sequence(range(size, 0, -1))],
         sequence(range(1, size + 1))),
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('upstream', type=Path, help='lambada-llc/tree-calculus checkout')
    parser.add_argument('--binary', default='.build/tree-calculus')
    parser.add_argument('--json', type=Path, help='save every sample and status as JSON')
    parser.add_argument('--runs', type=int, default=5)
    parser.add_argument('--timeout', type=float, default=2)
    parser.add_argument('--compare-minbin', action='append', default=[], metavar='LABEL=COMMAND',
                        help='also time a minimal-binary protocol executable; repeatable')
    parser.add_argument('--compare', action='append', default=[], metavar='LABEL=COMMAND',
                        help='also time a stdin/ternary executable; repeatable')
    args = parser.parse_args()
    if args.runs < 1 or args.timeout <= 0:
        parser.error('--runs and --timeout must be positive')
    commands = [('L8', [args.binary], 'ternary')]
    for spec, protocol in [(s, 'ternary') for s in args.compare] + [(s, 'minbin') for s in args.compare_minbin]:
        label, sep, command = spec.partition('=')
        if not sep or not label or not shlex.split(command):
            parser.error('--compare requires LABEL=COMMAND')
        commands.append((label, shlex.split(command), protocol))
    # Match upstream run-one.sh: recursive competitors get the OS hard limit.
    _, hard = resource.getrlimit(resource.RLIMIT_STACK)
    resource.setrlimit(resource.RLIMIT_STACK, (hard, hard))
    try:
        suite = cases(args.upstream)
    except (OSError, ValueError) as exc:
        parser.error(str(exc))
    failed = False
    records = []
    print(f'Best of {args.runs}; seconds including process startup and I/O')
    for name, terms, expected in suite:
        measurements = [dict(label=label, command=command, protocol=protocol, seconds=[], status='PASS')
                        for label, command, protocol in commands]
        payload = '\n'.join(terms) + '\n'
        tr = str.maketrans({'0': '1', '1': '01', '2': '001'})
        minbin = '0' * (len(terms) - 1) + ''.join(t.translate(tr) for t in terms) + '\n'
        minbin_expected = expected.translate(tr)
        for trial in range(args.runs):
            # Interleave variants, rotating who runs first to reduce clock and
            # temperature bias from timing one whole batch before the next.
            offset = trial % len(measurements)
            order = measurements[offset:] + measurements[:offset]
            for measurement in order:
                if measurement['status'] != 'PASS':
                    continue
                status = 'PASS'
                data = minbin if measurement['protocol'] == 'minbin' else payload
                answer = minbin_expected if measurement['protocol'] == 'minbin' else expected
                start = time.perf_counter()
                try:
                    p = subprocess.run(measurement['command'], input=data,
                                       text=True, capture_output=True, timeout=args.timeout)
                    measurement['seconds'].append(time.perf_counter() - start)
                    if p.returncode:
                        status = f'FAIL exit {p.returncode}: {p.stderr.strip()[:120]}'
                    elif p.stdout.rstrip('\n') != answer:
                        status = 'FAIL incorrect output'
                except subprocess.TimeoutExpired:
                    status = 'FAIL timeout'
                except OSError as exc:
                    status = f'FAIL {exc}'
                measurement['status'] = status
                failed |= status != 'PASS'
        for measurement in measurements:
            status = measurement['status']
            best = min(measurement['seconds']) if status == 'PASS' else None
            measurement['best_seconds'] = best
            timing = f'{best:.6f}s' if best is not None else '-'
            print(f"{name:16} {measurement['label']:28} {status:6} {timing}", flush=True)
        records.append(dict(workload=name, input_sha256=hashlib.sha256(payload.encode()).hexdigest(),
                            measurements=measurements))
    if args.json:
        report = dict(runs=args.runs, timeout=args.timeout, records=records,
                      upstream_source_sha256=hashlib.sha256(
                          (args.upstream / 'benchmark/run.sh').read_bytes()).hexdigest())
        args.json.write_text(json.dumps(report, indent=2) + '\n')

    return int(failed)


if __name__ == '__main__':
    raise SystemExit(main())
