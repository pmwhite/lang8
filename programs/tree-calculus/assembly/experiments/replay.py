#!/usr/bin/env python3
"""Rebuild experimental binaries from their recorded base revision and patches."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]


def main():
    manifest = json.loads((HERE / 'manifest.json').read_text())
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / '.build/tree-calculus-tricks')
    parser.add_argument('--check-hashes', action='store_true', help='require original binutils output')
    parser.add_argument('variants', nargs='*', help='default: all variants, including base')
    args = parser.parse_args()
    names = args.variants or list(manifest['variants'])
    if any(n not in manifest['variants'] for n in names):
        parser.error('unknown variant')
    source = {}
    for name in ['main.s', 'kernel.s']:
        source[name] = subprocess.check_output(
            ['git', 'show', manifest['base_commit'] + ':programs/tree-calculus/assembly/' + name],
            cwd=ROOT)
    for name in names:
        variant = manifest['variants'][name]
        destination = (args.output / name).resolve()
        destination.mkdir(parents=True, exist_ok=True)
        for filename, content in source.items():
            (destination / filename).write_bytes(content)
        if variant['patch']:
            subprocess.run(['patch', '--batch', '--silent', '-p4', '-i', str(HERE / variant['patch'])],
                           cwd=destination, check=True)
        subprocess.run(['as', '--64', *variant['assembler_flags'], '-I', str(destination),
                        '-o', str(destination / 'code.o'), str(destination / 'main.s')], check=True)
        subprocess.run(['ld', '-static', '--build-id=none', '-z', 'noexecstack', '-s',
                        '-o', str(destination / 'run'), str(destination / 'code.o')], check=True)
        actual = hashlib.sha256((destination / 'run').read_bytes()).hexdigest()
        if args.check_hashes and actual != variant['sha256']:
            raise RuntimeError(f'{name}: binary hash differs; check assembler/linker versions')
        print(name, actual)


if __name__ == '__main__':
    main()
