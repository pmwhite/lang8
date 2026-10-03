#!/usr/bin/env python3
"""Run the shared oracle suite plus standalone CLI, buffering, and I/O checks."""
import argparse
import os
from pathlib import Path
import resource
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('binary', nargs='?', type=Path, default=ROOT / '.build/tree-calculus-asm')
    parser.add_argument('--upstream', type=Path)
    args = parser.parse_args()
    binary = str(args.binary.resolve())
    command = [sys.executable, str(HERE.parent / 'test.py'), binary, '--single-backend']
    if args.upstream:
        command += ['--upstream', str(args.upstream.resolve())]
    subprocess.run(command, check=True)
    checked = 0

    def check(payload, expected):
        nonlocal checked
        p = subprocess.run([binary], input=payload, capture_output=True, timeout=10)
        assert p.returncode == 0 and p.stdout == expected and not p.stderr, p
        checked += 1

    # Exercise pending applications of leaf, stem(leaf), and constants.
    # The independent oracle checks the full expression, including the eager
    # evaluation of y b before the continuation combines it with x b.
    sys.path.insert(0, str(HERE.parent))
    from test import encode, reduce_apply
    leaf = ()
    stem = (leaf,)
    fork = (leaf, leaf)
    identity = ((stem,), leaf)
    functions = [leaf, stem, (leaf, leaf), (leaf, stem),
                 (leaf, fork), (leaf, identity)]
    for x in functions:
        for y in [leaf, stem, fork, identity, (leaf, identity)]:
            for b in [leaf, stem, fork]:
                a = ((x,), y)
                expected = encode(reduce_apply(a, b, [10000]))
                check((encode(a) + '\n' + encode(b) + '\n').encode(),
                      (expected + '\n').encode())

    # D = S I I self-applies. S stem(leaf) D applied to D must still evaluate
    # the divergent D D before it could return its saved argument.
    duplicate = ((identity,), identity)
    strict = ((stem,), duplicate)
    try:
        reduce_apply(strict, duplicate, [200])
    except (TimeoutError, RecursionError):
        pass
    else:
        raise AssertionError('strictness fixture unexpectedly terminated')
    payload = (encode(strict) + '\n' + encode(duplicate) + '\n').encode()
    try:
        p = subprocess.run([binary], input=payload, capture_output=True, timeout=0.25)
    except subprocess.TimeoutExpired as exc:
        assert not exc.stdout, exc.stdout
    else:
        assert p.returncode == 1 and not p.stdout and b'exhausted' in p.stderr, p
    checked += 1

    for size in [8191, 8192, 8193, 16384]:
        tree = b'1' * (size - 1) + b'0'
        check(tree + b'\n', tree + b'\n')
        check(tree, tree + b'\n')
    check(b'21100\n' * 10000, b'21100\n')
    check(b'2\r1\r0\r0\r\n', b'2100\n')

    # Force fragmented writes into stdin, rather than relying on communicate's
    # normal pipe chunking. The child must preserve the partial line across reads.
    tree = b'1' * 32768 + b'0'
    child = subprocess.Popen([binary], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, bufsize=0)
    try:
        payload = tree + b'\n'
        offset = 0
        sizes = [1, 7, 127, 4093]
        while offset < len(payload):
            piece = payload[offset:offset + sizes[offset % len(sizes)]]
            written = child.stdin.write(piece)
            assert written
            offset += written
        child.stdin.close()
        child.stdin = None
        out, err = child.communicate(timeout=10)
        assert child.returncode == 0 and out == tree + b'\n' and not err
        checked += 1
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()

    for argv in [['--reference'], ['--help'], ['one', 'two']]:
        p = subprocess.run([binary, *argv], capture_output=True, timeout=10)
        assert p.returncode == 1 and b'usage:' in p.stderr and not p.stdout, p
        checked += 1
    p = subprocess.run([binary], input=b'0' * (16777216 + 1), capture_output=True, timeout=10)
    assert p.returncode == 1 and b'input line too long' in p.stderr, p
    checked += 1
    p = subprocess.run([binary], stdin=subprocess.DEVNULL, capture_output=True,
                       preexec_fn=lambda: os.close(0), timeout=10)
    assert p.returncode == 1 and b'input/output error' in p.stderr, p
    checked += 1
    with open('/dev/full', 'wb') as full:
        p = subprocess.run([binary], input=b'0\n', stdout=full, stderr=subprocess.PIPE, timeout=10)
    assert p.returncode == 1 and b'input/output error' in p.stderr, p
    checked += 1

    def limit_memory():
        resource.setrlimit(resource.RLIMIT_AS, (64 * 1024 * 1024, 64 * 1024 * 1024))

    p = subprocess.run([binary], input=b'0\n', capture_output=True,
                       preexec_fn=limit_memory, timeout=10)
    assert p.returncode == 1 and b'allocation failed' in p.stderr, p
    checked += 1
    print(f'PASS: {checked} standalone reduction, buffering, CLI, limit and I/O checks')


if __name__ == '__main__':
    main()
