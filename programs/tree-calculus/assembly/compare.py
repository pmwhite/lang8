#!/usr/bin/env python3
"""Build and compare standalone assembly, L8/native, and L8/reference evaluators."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import statistics
import struct
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
from bench import cases

EVENTS = ['cycles:u', 'instructions:u', 'branches:u', 'branch-misses:u']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('upstream', type=Path)
    p.add_argument('--cpu', type=int)
    p.add_argument('--baseline', type=Path, help='also compare a saved earlier assembly executable')
    p.add_argument('--runs', type=int, default=7)
    p.add_argument('--counter-runs', type=int, default=3)
    p.add_argument('--output', type=Path, default=HERE / 'benchmark-results.json')
    args = p.parse_args()
    if args.runs < 1 or args.counter_runs < 1:
        p.error('run counts must be positive')
    cpu = min(os.sched_getaffinity(0)) if args.cpu is None else args.cpu
    os.sched_setaffinity(0, {cpu})
    build = ROOT / '.build/tree-calculus-assembly'
    build.mkdir(parents=True, exist_ok=True)
    native = build / 'l8'
    assembly = build / 'assembly'
    subprocess.run([str(ROOT / 'bootstrap'), 'build', str(HERE.parent / 'main.l8'), '-o', str(native)], check=True, cwd=ROOT)
    subprocess.run([str(HERE / 'build.sh'), str(assembly)], check=True, cwd=ROOT)
    upstream = args.upstream.resolve()
    wall_report = build / 'wall.json'
    commands = {'L8': [str(native)], 'Assembly': [str(assembly)],
                'L8 reference': [str(native), '--reference']}
    if args.baseline:
        commands['Assembly before'] = [str(args.baseline.resolve())]
    bench_command = [sys.executable, str(HERE.parent / 'bench.py'), str(upstream),
                     '--binary', str(native), '--runs', str(args.runs), '--json', str(wall_report)]
    for label in list(commands)[1:]:
        bench_command += ['--compare', label + '=' + shlex.join(commands[label])]
    subprocess.run(bench_command, check=True, cwd=ROOT)
    report = json.loads(wall_report.read_text())
    suite = {name: ('\n'.join(terms) + '\n', answer) for name, terms, answer in cases(upstream)}
    for record in report['records']:
        payload, expected = suite[record['workload']]
        samples = {label: [] for label in commands}
        labels = list(commands)
        for trial in range(args.counter_runs):
            offset = trial % len(labels)
            for label in labels[offset:] + labels[:offset]:
                raw = build / 'perf.csv'
                command = ['perf', 'stat', '-x', ';', '-o', str(raw), '-e', ','.join(EVENTS), '--', *commands[label]]
                result = subprocess.run(command, input=payload, text=True, capture_output=True, timeout=15, cwd=ROOT)
                if result.returncode or result.stdout != expected + '\n':
                    raise RuntimeError((command, result.returncode, result.stdout[:100], result.stderr))
                counters = {}
                for line in raw.read_text().splitlines():
                    cols = line.split(';')
                    if len(cols) > 4 and cols[2] in EVENTS:
                        counters[cols[2]] = {'count': float(cols[0]), 'running_percent': float(cols[4])}
                if set(counters) != set(EVENTS):
                    raise RuntimeError(raw.read_text())
                samples[label].append(counters)
        for m in record['measurements']:
            m['median_seconds'] = statistics.median(m['seconds'])
            m['perf_samples'] = samples[m['label']]
            m['median_counters'] = {event: statistics.median(s[event]['count'] for s in samples[m['label']]) for event in EVENTS}
    report['environment'] = {'system': platform.platform(), 'cpu_affinity': [cpu],
        'cpu_model': next(s for s in Path('/proc/cpuinfo').read_text().splitlines() if s.startswith('model name')),
        'lang8_base_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'upstream_commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=upstream, text=True).strip(),
        'assembler': subprocess.check_output(['as', '--version'], text=True).splitlines()[0],
        'linker': subprocess.check_output(['ld', '--version'], text=True).splitlines()[0]}
    report['method'] = 'Pinned CPU; rotating interleaved order; wall times include process startup and I/O. Best and median recorded. Separate user-mode hardware-counter runs; input supplied afresh and output verified on every invocation.'
    report['counter_runs'] = args.counter_runs
    report['binaries'] = {}
    binaries = [('L8', native), ('Assembly', assembly)]
    if args.baseline:
        binaries.append(('Assembly before', args.baseline.resolve()))
    for label, path in binaries:
        data = path.read_bytes()
        phoff = struct.unpack_from('<Q', data, 32)[0]
        entsize, count = struct.unpack_from('<HH', data, 54)
        text_size = sum(struct.unpack_from('<Q', data, phoff + i * entsize + 32)[0]
                        for i in range(count) if struct.unpack_from('<II', data, phoff + i * entsize) == (1, 5))
        report['binaries'][label] = {'file_bytes': len(data), 'executable_segment_bytes': text_size, 'sha256': sha(path)}
    sources = [*HERE.parent.glob('*.l8'), HERE.parent / 'reduce.s', HERE / 'main.s', HERE / 'kernel.s', HERE / 'build.sh', ROOT / 'bootstrap']
    report['source_sha256'] = {str(path.relative_to(ROOT)): sha(path) for path in sources}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print('Saved', args.output)


if __name__ == '__main__':
    main()
