#!/usr/bin/env bash
# Run one build step: tools/step.sh NAME COMMAND [ARG ...]
# Prints one line with the step's wall time. Full output goes to
# .build/logs/NAME.log and is shown if the step fails. With V=1, output
# is also streamed.
set -uo pipefail

name="$1"
shift
logs="${BUILD:-.build}/logs"
mkdir -p "$logs"
log="$logs/${name// /-}.log"
{
  printf 'step: %s\ncommand:' "$name"
  printf ' %q' "$@"
  printf '\n'
} >"$log"

start=$(date +%s%N)
if [[ "${V:-0}" == 1 ]]; then
  "$@" 2>&1 | tee -a "$log"
  status=${PIPESTATUS[0]}
else
  "$@" >>"$log" 2>&1
  status=$?
fi
elapsed=$(( ($(date +%s%N) - start) / 1000000 ))

if [[ "$status" -ne 0 ]]; then
  printf '%-20s FAIL (%d)\n' "$name" "$status" >&2
  [[ "${V:-0}" == 1 ]] || cat "$log" >&2
  printf 'log: %s\n' "$log" >&2
  exit "$status"
fi
printf '%-20s %6dms\n' "$name" "$elapsed"
