#!/usr/bin/env python3
"""Inventory explicit allocation syntax; ratchet counts down per file.

This deliberately is not a no-allocation proof. See STATIC_ALLOCATION.md.
"""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
BASELINE = ROOT / 'tools/static-allocation-baseline.json'
METRICS = ('new', 'region', 'bytes', 'cstr')
# Preserve punctuation to distinguish @new contracts from new expressions.
TOKEN = re.compile(r'//[^\n]*|/\*.*?(?:\*/|\Z)|\{\|.*?(?:\|\}|\Z)|'
                   r'"""(?:\\.|(?!""").)*(?:"""|\Z)|'
                   r'"(?:\\.|[^"\\])*(?:"|\Z)|'
                   r"'(?:\\.|[^'\\])*(?:'|\Z)|"
                   r'[A-Za-z_][A-Za-z_0-9]*|[^\s]', re.DOTALL)


def counts(source):
    tokens = [m.group() for m in TOKEN.finditer(source)
              if not m.group().startswith(('//', '/*', '{|', '"', "'"))]
    found = Counter()
    for i, token in enumerate(tokens):
        previous = tokens[i - 1] if i else ''
        following = tokens[i + 1] if i + 1 < len(tokens) else ''
        if token == 'new' and previous != '@':
            found['new'] += 1
        elif token == 'region':
            found['region'] += 1
        elif token in ('bytes', 'cstr') and following == '(':
            found[token] += 1
    return {key: found[key] for key in METRICS if found[key]}


def source_paths():
    # A promoted or pre-commit snapshot has the files and no git metadata.
    if (ROOT / '.git').exists():
        listed = subprocess.check_output(
            ['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '*.l8'],
            cwd=ROOT).decode().split('\0')
        return listed
    skip = {'.build', '.git'}
    found = []
    for path in ROOT.rglob('*.l8'):
        parts = path.relative_to(ROOT).parts
        if skip.intersection(parts):
            continue
        found.append(str(path.relative_to(ROOT)))
    return found


def inventory():
    # Include new source files, excluding ignored build output and vendored data.
    paths = source_paths()
    result = {}
    for name in sorted(set(paths) - {''}):
        path = ROOT / name
        if path.is_file():
            found = counts(path.read_text(encoding='utf-8', errors='surrogateescape'))
            if found:
                result[name] = found
    return result


def group(name):
    if name.startswith('programs/'):
        return '/'.join(name.split('/')[:2])
    return name.split('/')[0]


def report(files, details):
    groups = defaultdict(Counter)
    for name, found in files.items():
        groups[group(name)].update(found)
    print(f'{"source":38} {"new":>7} {"region":>7} {"bytes()":>7} {"cstr()":>7}')
    for name, found in sorted((files if details else groups).items()):
        print(f'{name:38} ' + ' '.join(f'{found.get(k, 0):7}' for k in METRICS))
    total = Counter()
    for found in files.values():
        total.update(found)
    print(f'{"TOTAL (includes bootstrap and fixtures)":38} ' +
          ' '.join(f'{total[k]:7}' for k in METRICS))
    print('Source-site counts only; implicit and foreign allocations are not covered.')


def save(files):
    # One entry per file keeps progress reviews small and readable.
    rows = [f'    {json.dumps(name)}: {json.dumps(found, sort_keys=True)}'
            for name, found in sorted(files.items())]
    BASELINE.write_text('{\n  "version": 1,\n  "files": {\n' +
                        ',\n'.join(rows) + '\n  }\n}\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--details', action='store_true', help='report individual files')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true', help='reject any per-file count increase')
    mode.add_argument('--update', action='store_true', help='explicitly record reviewed counts')
    args = parser.parse_args()
    files = inventory()
    report(files, args.details)
    if args.update:
        save(files)
        print('Updated tools/static-allocation-baseline.json; review the diff.')
    if args.check:
        baseline = json.loads(BASELINE.read_text(encoding='utf-8'))
        if baseline['version'] != 1:
            raise ValueError('unsupported static allocation baseline version')
        failures = []
        for name, found in files.items():
            old = baseline['files'].get(name, {})
            for key, value in found.items():
                if value > old.get(key, 0):
                    failures.append(f'{name}: {key}: {old.get(key, 0)} -> {value}')
        if failures:
            print('Allocation inventory increased:\n' + '\n'.join(failures), file=sys.stderr)
            return 1
        print('Allocation ratchet passed.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
