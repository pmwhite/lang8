#!/usr/bin/env python3
"""Profile load misses, stall indicators and decode-cache activity in separate groups."""
import sys, subprocess, os, json, statistics
from pathlib import Path
sys.path.insert(0, str(Path.cwd() / 'programs/tree-calculus'))
from bench import cases
D = Path(os.environ.get('TREE_TRICKS_BUILD', '.build/tree-calculus-memory')).resolve()
os.sched_setaffinity(0, {2})
groups = [['cycles', 'mem_load_retired.l1_miss', 'mem_load_retired.l2_miss', 'mem_load_retired.l3_miss'], ['cycles', 'cycle_activity.stalls_l1d_miss', 'cycle_activity.stalls_l2_miss', 'cycle_activity.stalls_l3_miss'], ['cycles', 'idq.dsb_uops', 'idq.mite_uops', 'dtlb_load_misses.walk_completed']]
report = {}
for name, terms, answer in cases(Path(os.environ.get('TREE_CALCULUS_UPSTREAM', '/tmp/lang8-tree-calculus-current'))):
    if name == 'size':
        continue
    results = []
    for group in groups:
        events = [e + ':u' for e in group]
        for _ in range(3):
            p = subprocess.run(['perf', 'stat', '-x', ';', '-o', str(D / 'perf.csv'), '-e', ','.join(events), '--', str(D / 'base/run')], input='\n'.join(terms) + '\n', text=True, capture_output=True, timeout=10)
            assert p.returncode == 0 and p.stdout == answer + '\n', p.stderr
            sample = {}
            for line in (D / 'perf.csv').read_text().splitlines():
                cols = line.split(';')
                if len(cols) > 4 and cols[2] in events:
                    assert float(cols[4]) >= 99.9, cols
                    sample[cols[2]] = float(cols[0])
            assert len(sample) == 4, sample
            results.append(sample)
    medians = {e: statistics.median((s[e] for s in results if e in s)) for s in results for e in s}
    report[name] = {'samples': results, 'medians': medians}
    print(name, medians, flush=True)
(D / 'memory-profile.json').write_text(json.dumps(report, indent=2) + '\n')
