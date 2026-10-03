#!/usr/bin/env python3
"""Build fixed workloads, or measure a pair of compiler-codegen revisions on Linux.

Prepare the fixed source checkout once:
  mkdir -p .build/codegen-perf/source
  git archive f7b4f23 src2 runtime.s stdlib programs/tree-calculus | tar -x -C .build/codegen-perf/source
Then, for each revision:
  python3 tools/codegen_bench/run.py build LABEL --compiler ./l8
Compare adjacent revisions:
  python3 tools/codegen_bench/run.py compare BEFORE AFTER --output tools/codegen_bench/results/CHANGE.json
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import statistics
import struct
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / '.build/codegen-perf'
FIXED = BASE / 'source'
HERE = Path(__file__).resolve().parent
EVENTS = ['cycles:u', 'instructions:u', 'branches:u', 'branch-misses:u']


def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def executable_bytes(p):
    data = p.read_bytes()
    phoff = struct.unpack_from('<Q', data, 32)[0]
    entsize, count = struct.unpack_from('<HH', data, 54)
    return sum(struct.unpack_from('<Q', data, phoff + i * entsize + 32)[0]
               for i in range(count)
               if struct.unpack_from('<II', data, phoff + i * entsize) == (1, 5))


def build(args):
    out = BASE / args.label
    out.mkdir(parents=True, exist_ok=True)
    compiler = Path(args.compiler).resolve()
    sources = {'compiler': FIXED / 'src2/main.l8',
               'tree': FIXED / 'programs/tree-calculus/main.l8',
               'loops': HERE / 'loops.l8', 'fills': HERE / 'fills.l8'}
    for name, source in sources.items():
        subprocess.run([str(compiler), 'build', str(source), '-o', str(out / name)], check=True, cwd=ROOT)
    shutil.copy2(compiler, out / 'pipeline')
    manifest = {'compiler': str(compiler), 'compiler_sha256': digest(compiler),
                'git_head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
                'source_hashes': {str(p.relative_to(ROOT)): digest(p) for p in sorted(FIXED.rglob('*')) if p.is_file()},
                'workload_hashes': {str(p.relative_to(ROOT)): digest(p) for p in HERE.glob('*') if p.is_file()},
                'binaries': {name: {'bytes': (out / name).stat().st_size, 'executable_segment_bytes': executable_bytes(out / name), 'sha256': digest(out / name)} for name in [*sources, 'pipeline']}}
    (out / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


def compare(args):
    labels = [args.before, args.after]
    manifests = {label: json.loads((BASE / label / 'manifest.json').read_text()) for label in labels}
    assert manifests[labels[0]]['source_hashes'] == manifests[labels[1]]['source_hashes']
    for name in ['loops.l8', 'fills.l8', 'fib.ternary', 'fib.expected']:
        key = str((HERE / name).relative_to(ROOT))
        assert manifests[labels[0]]['workload_hashes'][key] == manifests[labels[1]]['workload_hashes'][key]
    os.sched_setaffinity(0, {args.cpu})
    records = []
    for name in (['pipeline'] if args.only_pipeline else ['compiler', 'tree', 'loops', 'fills']):
        measurements = {label: {'wall_seconds': [], 'perf': []} for label in labels}
        expected_hash = {}
        for mode, count in [('warmup', 1), ('wall', args.runs), ('perf', args.counter_runs)]:
            for iteration in range(count):
                for label in labels[iteration % 2:] + labels[:iteration % 2]:
                    executable = BASE / label / name
                    command = [str(executable)]
                    output = BASE / 'compiled-output'
                    payload = b''
                    expected = b''
                    if name in ['compiler', 'pipeline']:
                        command += ['build', str(FIXED / 'src2/main.l8'), '-o', str(output)]
                    elif name == 'tree':
                        command += ['--reference']
                        payload = (HERE / 'fib.ternary').read_bytes()
                        expected = (HERE / 'fib.expected').read_bytes()
                    if mode == 'perf':
                        perf_file = BASE / 'perf.csv'
                        command = ['perf', 'stat', '-x', ';', '-o', str(perf_file), '-e', ','.join(EVENTS), '--'] + command
                    start = time.perf_counter()
                    result = subprocess.run(command, input=payload, capture_output=True, cwd=ROOT, timeout=30)
                    elapsed = time.perf_counter() - start
                    if result.returncode or result.stdout != expected:
                        raise RuntimeError((command, result.returncode, result.stdout, result.stderr))
                    if name in ['compiler', 'pipeline']:
                        h = digest(output)
                        key = label if name == 'pipeline' else 'shared'
                        if key not in expected_hash:
                            expected_hash[key] = h
                        assert h == expected_hash[key], 'compiled output differs between equivalent runs'
                    if mode == 'wall':
                        measurements[label]['wall_seconds'].append(elapsed)
                    if mode == 'perf':
                        counters = {}
                        for line in perf_file.read_text().splitlines():
                            cols = line.split(';')
                            if len(cols) > 4 and cols[2] in EVENTS:
                                counters[cols[2]] = {'count': float(cols[0]), 'running_percent': float(cols[4])}
                        assert set(counters) == set(EVENTS), perf_file.read_text()
                        measurements[label]['perf'].append(counters)
        for label, m in measurements.items():
            m['median_wall_seconds'] = statistics.median(m['wall_seconds'])
            m['median_counters'] = {event: statistics.median(p[event]['count'] for p in m['perf']) for event in EVENTS}
            m['binary'] = manifests[label]['binaries'][name]
        before, after = (measurements[label] for label in labels)
        ratios = {'wall': after['median_wall_seconds'] / before['median_wall_seconds'],
                  'bytes': after['binary']['bytes'] / before['binary']['bytes'],
                  'executable_segment_bytes': after['binary']['executable_segment_bytes'] / before['binary']['executable_segment_bytes']}
        ratios.update({event: after['median_counters'][event] / before['median_counters'][event] for event in EVENTS})
        records.append({'workload': name, 'measurements': measurements, 'after_over_before': ratios})
        print(name, ' '.join(f'{k}: {(v-1)*100:+.1f}%' for k, v in ratios.items()), flush=True)
    report = {'cpu': args.cpu, 'cpuinfo': next(s for s in Path('/proc/cpuinfo').read_text().splitlines() if s.startswith('model name')),
              'system': platform.platform(), 'runs': args.runs, 'counter_runs': args.counter_runs,
              'method': 'Pinned CPU; alternating order; one warmup each; median wall time including process startup and I/O. Counters sampled separately with perf stat, user mode. Output checked every run.',
              'manifests': manifests, 'records': records}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    commands = p.add_subparsers(dest='action', required=True)
    b = commands.add_parser('build')
    b.add_argument('label')
    b.add_argument('--compiler', required=True)
    c = commands.add_parser('compare')
    c.add_argument('before'); c.add_argument('after')
    c.add_argument('--cpu', type=int, default=2)
    c.add_argument('--runs', type=int, default=7)
    c.add_argument('--counter-runs', type=int, default=3)
    c.add_argument('--output', type=Path, required=True)
    c.add_argument('--only-pipeline', action='store_true', help='measure actual compiler throughput on fixed input, including compiler algorithm changes')
    args = p.parse_args()
    if args.action == 'build': build(args)
    else: compare(args)


if __name__ == '__main__':
    main()
