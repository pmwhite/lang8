#!/usr/bin/env python3
"""Differential and CLI tests; no external checkout or Python packages required."""
import argparse
import itertools
from pathlib import Path
import random
import subprocess


def encode(t):
    return str(len(t)) + ''.join(map(encode, t))


def reduce_apply(a, b, fuel):
    fuel[0] -= 1
    if fuel[0] < 0:
        raise TimeoutError
    if not a:
        return (b,)
    if len(a) == 1:
        return (a[0], b)
    u, y = a
    if not u:
        return y
    if len(u) == 1:
        return reduce_apply(reduce_apply(u[0], b, fuel),
                            reduce_apply(y, b, fuel), fuel)
    w, x = u
    if not b:
        return w
    if len(b) == 1:
        return reduce_apply(x, b[0], fuel)
    return reduce_apply(reduce_apply(y, b[0], fuel), b[1], fuel)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('binary', nargs='?', default='.build/tree-calculus')
    parser.add_argument('--upstream', type=Path, help='also check other sizes of upstream workloads')
    args = parser.parse_args()
    checked = 0

    def check(text, expected=None):
        nonlocal checked
        for options in ([], ['--reference']):
            p = subprocess.run([args.binary, *options], input=text, text=True,
                               capture_output=True, timeout=10)
            if expected is None:
                assert p.returncode != 0 and p.stderr, (text[:100], options, p)
            else:
                assert p.returncode == 0 and p.stdout == expected + '\n', (
                    options, text[:100], expected[:100], p.returncode,
                    p.stdout[:100], p.stderr)
            checked += 1

    # All trees of at most five nodes, paired exhaustively. This covers all
    # seven primitive rules, plus compositions and nested S/triage reductions.
    sizes = {1: [()]}
    for size in range(2, 6):
        sizes[size] = [(t,) for t in sizes[size - 1]]
        for left in range(1, size - 1):
            sizes[size] += list(itertools.product(sizes[left], sizes[size - 1 - left]))
    trees = sum(sizes.values(), [])
    for a, b in itertools.product(trees, repeat=2):
        check(encode(a) + '\n' + encode(b), encode(reduce_apply(a, b, [10000])))

    rng = random.Random(8128)

    def tree(depth):
        arity = rng.randrange(3) if depth else 0
        return tuple(tree(depth - 1) for _ in range(arity))

    accepted = 0
    for _ in range(400):
        terms = [tree(5) for _ in range(rng.randrange(2, 6))]
        result = ((((),),), ())  # 21100, the suite's identity
        try:
            fuel = [20000]
            for t in terms:
                result = reduce_apply(result, t, fuel)
            expected = encode(result)
        except (TimeoutError, RecursionError):
            continue  # Unbounded random terms need not terminate.
        if len(expected) <= 100000:
            check('\n'.join(map(encode, terms)) + '\n', expected)
            accepted += 1
    assert accepted >= 200, accepted

    check('', '21100')
    check('\n\n', '21100')
    check('21100\r\n\r\n2100\r\n', '2100')
    for text in ['1', '2', '20', '00', '10x', ' 0', '3', '0\n1\n', '\x00']:
        check(text)
    # Exercise read boundaries, parser/output stack growth, arena growth and
    # rehashing under the normal OS stack limit, with and without final LF.
    for text in ['1' * 30000 + '0', '20' * 20000 + '0']:
        check(text, text)
        check('21100\n' + text + '\n', text)
    # F_0 = K leaf; F_(n+1) = S leaf F_n. F_n leaf is an n-cell
    # fork spine. Unlike parsing alone this forces native continuation growth.
    depth = 12000
    check('210' * depth + '200\n0\n', '20' * depth + '0')
    if args.upstream:
        from bench import cases, natural
        programs = {name: terms[0] for name, terms, _ in cases(args.upstream)}
        for n in [0, 1, 12, 26]:
            a, b = 1, 1
            for _ in range(n):
                a, b = b, a + b
            check(programs['recursive-fib'] + '\n' + natural(n), natural(a))
        for n in [0, 1, 9, 17]:
            check(programs['silly-exp'] + '\n' + natural(n), natural(2 ** n))
        for n in [0, 1, 257, 250000]:
            check(programs['exercise-rules'] + '\n' + natural(n), '10')
        def sequence(values):
            return ''.join('2' + natural(n) for n in values) + '0'
        for values in [[7, 0, 7, 3], list(range(4000, 0, -1))]:
            check(programs['merge-sort'] + '\n' + sequence(values), sequence(sorted(values)))
    print(f'PASS: {checked} cases ({accepted} random terminating programs)')


if __name__ == '__main__':
    main()
