#!/usr/bin/env bash
# tools/format_src2.sh write|check TOOL
# write: rewrite src2 files whose formatting changes, leaving the others
#        (and their timestamps) alone.
# check: fail if any src2 file differs from the formatter's output.
set -euo pipefail

mode="$1"
tool="$2"
out="${BUILD:-.build}/format-src2.tmp"
for f in src2/*.l8; do
  "./$tool" fmt "$f" >"$out"
  if ! cmp -s "$f" "$out"; then
    if [[ "$mode" == write ]]; then
      cp "$out" "$f"
      echo "formatted $f"
    else
      echo "fmt is not stable: $f (run make fmt)" >&2
      exit 1
    fi
  fi
done
