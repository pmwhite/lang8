#!/usr/bin/env python3
"""Screen recorded variants with interleaved timings and checked hardware counters."""
from pathlib import Path
import sys, subprocess, os, json, time, random, statistics, hashlib, struct
ROOT = Path.cwd()
D = Path(os.environ.get('TREE_TRICKS_BUILD', str(ROOT / '.build/tree-calculus-memory')))
sys.path.insert(0, str(ROOT / 'programs/tree-calculus'))
from bench import cases
os.sched_setaffinity(0, {2})
output = sys.argv[1]
names = sys.argv[2:]
runs = int(os.environ.get('RUNS', '9'))
events = ['cycles:u', 'instructions:u', 'branches:u', 'branch-misses:u']
report = {'runs': runs, 'cpu': 2, 'source_base_commit': json.loads((Path(__file__).parent / 'manifest.json').read_text())['base_commit'], 'measurement_checkout': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(), 'records': [], 'binaries': {}}
for n in names:
    data = (D / n / 'run').read_bytes()
    phoff = struct.unpack_from('<Q', data, 32)[0]
    entsize, count = struct.unpack_from('<HH', data, 54)
    size = sum((struct.unpack_from('<Q', data, phoff + i * entsize + 32)[0] for i in range(count) if struct.unpack_from('<II', data, phoff + i * entsize) == (1, 5)))
    report['binaries'][n] = {'sha256': hashlib.sha256(data).hexdigest(), 'file_bytes': len(data), 'code_bytes': size}
suite = cases(Path(os.environ.get('TREE_CALCULUS_UPSTREAM', '/tmp/lang8-tree-calculus-reference')))
if os.environ.get('HOLDOUT'):
    ns = {}
    exec((Path(__file__).parent / 'holdout-suite.py').read_text(), ns)
    suite = ns['suite']
for name, terms, answer in suite:
    payload = ('\n'.join(terms) + '\n').encode()
    expected = (answer + '\n').encode()
    rec = {'workload': name, 'measurements': {}}
    for n in names:
        rec['measurements'][n] = {'seconds': [], 'perf': []}

    def run(n, perf=False):
        cmd = [str(D / n / 'run')]
        if perf:
            cmd = ['perf', 'stat', '-x', ';', '-o', str(D / 'perf.csv'), '-e', ','.join(events), '--'] + cmd
        start = time.perf_counter()
        p = subprocess.run(cmd, input=payload, capture_output=True, timeout=10)
        elapsed = time.perf_counter() - start
        assert p.returncode == 0 and p.stdout == expected, (name, n, p.returncode, p.stderr[:200], p.stdout[:100])
        if perf:
            c = {}
            for l in (D / 'perf.csv').read_text().splitlines():
                s = l.split(';')
                if len(s) > 4 and s[2] in events:
                    assert float(s[4]) >= 99.9, s
                    c[s[2]] = float(s[0])
            assert len(c) == 4, c
            rec['measurements'][n]['perf'].append(c)
        else:
            rec['measurements'][n]['seconds'].append(elapsed)
    for n in names:
        run(n)
    for n in names:
        rec['measurements'][n]['seconds'] = []
    rng = random.Random(21)
    for trial in range(runs):
        order = names.copy()
        rng.shuffle(order)
        for n in order:
            run(n)
    for trial in range(3):
        order = names.copy()
        rng.shuffle(order)
        for n in order:
            run(n, True)
    for n, m in rec['measurements'].items():
        m['best'] = min(m['seconds'])
        m['median'] = statistics.median(m['seconds'])
        m['counters'] = {e: statistics.median((p[e] for p in m['perf'])) for e in events}
    base = rec['measurements'][names[0]]
    print(name, flush=True)
    for n, m in rec['measurements'].items():
        print(' ', n, 'best %.3f ms' % (1000 * m['best']), 'median %+.1f%%' % (100 * (m['median'] / base['median'] - 1)), 'cycles %+.1f%%' % (100 * (m['counters']['cycles:u'] / base['counters']['cycles:u'] - 1)), flush=True)
    report['records'].append(rec)
    (D / output).write_text(json.dumps(report, indent=2) + '\n')
