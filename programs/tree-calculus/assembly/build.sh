#!/usr/bin/env bash
set -euo pipefail
here=$(cd -- "$(dirname -- "$0")" && pwd)
root=$(cd -- "$here/../../.." && pwd)
out=${1:-"$root/.build/tree-calculus-asm"}
if [[ $# -gt 1 ]]; then
    echo "usage: $0 [output]" >&2
    exit 1
fi
mkdir -p -- "$(dirname -- "$out")"
obj=$(mktemp)
trap 'rm -f -- "$obj"' EXIT
# Keep fused branches within decode-cache boundaries as the hot loop changes.
as --64 -mbranches-within-32B-boundaries -I "$here" -o "$obj" "$here/main.s"
ld -static --build-id=none -z noexecstack -s -o "$out" "$obj"
