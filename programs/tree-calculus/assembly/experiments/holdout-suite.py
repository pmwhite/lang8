#!/usr/bin/env python3
"""Additional workloads used to validate the selected optimization combination."""
from pathlib import Path
import sys, random, os
sys.path.insert(0, str(Path.cwd() / 'programs/tree-calculus'))
from bench import cases, natural
programs = {name: terms[0] for name, terms, _ in cases(Path(os.environ.get('TREE_CALCULUS_UPSTREAM', '/tmp/lang8-tree-calculus-reference')))}

def sequence(values):
    return ''.join(('2' + natural(n) for n in values)) + '0'
suite = []
a, b = (1, 1)
for _ in range(26):
    a, b = (b, a + b)
suite.append(('fib-26', [programs['recursive-fib'], natural(26)], natural(a)))
suite.append(('exp-17', [programs['silly-exp'], natural(17)], natural(2 ** 17)))
suite.append(('rules-500000', [programs['exercise-rules'], natural(500000)], '10'))
rng = random.Random(93)
for name, values in [('descending-4000', list(range(4000, 0, -1))), ('random-2000', [rng.randrange(4096) for _ in range(2000)]), ('ascending-2000', list(range(2000))), ('duplicates-2000', [rng.randrange(16) for _ in range(2000)])]:
    suite.append((name, [programs['merge-sort'], sequence(values)], sequence(sorted(values))))
