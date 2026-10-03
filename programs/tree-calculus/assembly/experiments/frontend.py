#!/usr/bin/env python3
"""Measure decoded-instruction-cache and legacy-decoder activity on the rules workload."""
from pathlib import Path
import subprocess, json, os, statistics, sys, random
D = Path(os.environ.get('TREE_TRICKS_BUILD', '.build/tree-calculus-tricks')).resolve()
sys.path.insert(0, str(Path.cwd() / 'programs/tree-calculus'))
from bench import cases
os.sched_setaffinity(0, {2})
_, terms, expected = next((c for c in cases(Path(os.environ.get('TREE_CALCULUS_UPSTREAM', '/tmp/lang8-tree-calculus-reference'))) if c[0] == 'exercise-rules'))
payload = ('\n'.join(terms) + '\n').encode()
expected = (expected + '\n').encode()
events = ['cycles:u', 'idq.dsb_uops:u', 'idq.mite_uops:u', 'dsb2mite_switches.penalty_cycles:u']
names = ['base', 'crc-leaf', 'crc-leaf-align16', 'jcc-pad']
samples = {n: [] for n in names}
rng = random.Random(81)
for _ in range(5):
    order = names.copy()
    rng.shuffle(order)
    for n in order:
        p = subprocess.run(['perf', 'stat', '-x', ';', '-o', str(D / 'frontend.csv'), '-e', ','.join(events), '--', str(D / n / 'run')], input=payload, capture_output=True, timeout=10)
        assert p.returncode == 0 and p.stdout == expected
        c = {}
        for l in (D / 'frontend.csv').read_text().splitlines():
            s = l.split(';')
            if len(s) > 4 and s[2] in events:
                assert float(s[4]) >= 99.9, s
                c[s[2]] = float(s[0])
        assert len(c) == 4, c
        samples[n].append(c)
report = {'workload': 'exercise-rules', 'cpu': 2, 'runs': 5, 'samples': samples, 'medians': {n: {e: statistics.median((s[e] for s in v)) for e in events} for n, v in samples.items()}}
(D / 'frontend.json').write_text(json.dumps(report, indent=2) + '\n')
print(report['medians'])
