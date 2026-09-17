#!/usr/bin/env python3
"""Verify vendored RFCs or retrieve the exact pinned copies from the RFC Editor."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--check', action='store_true', help='verify locally; no network access')
    action.add_argument('--download', action='store_true', help='download and verify pinned documents')
    args = parser.parse_args()
    entries = json.loads((HERE / 'SOURCES.json').read_text())
    for item in entries:
        path = HERE / item['file']
        if args.download:
            with urlopen(item['url'], timeout=30) as response:
                data = response.read()
        else:
            data = path.read_bytes()
        actual = hashlib.sha256(data).hexdigest()
        if actual != item['sha256']:
            raise SystemExit(f"{item['file']}: hash mismatch; review the upstream change before updating SOURCES.json")
        if args.download:
            path.write_bytes(data)
        print(f"verified {item['file']}")


if __name__ == '__main__':
    main()
