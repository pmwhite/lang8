#!/usr/bin/env bash
# Build, test, and self-host the L8 compiler. Prints per-step timings.
set -euo pipefail

cd "$(dirname "$0")"

CC="${CC:-gcc}"
CFLAGS="${CFLAGS:--Wall -Wextra -std=c11 -O2}"
BUILD="${BUILD:-.build}"

declare -a STEP_NAMES=()
declare -a STEP_MS=()

now_ms() {
  echo $(( $(date +%s%N) / 1000000 ))
}

# Time a named step. Runs the remaining args as a command.
step() {
  local name="$1"
  shift
  local start end elapsed
  printf '→ %s\n' "$name"
  start=$(now_ms)
  "$@"
  end=$(now_ms)
  elapsed=$((end - start))
  STEP_NAMES+=("$name")
  STEP_MS+=("$elapsed")
  printf '  %d ms\n' "$elapsed"
}

print_summary() {
  local i width=0 name ms total=0
  echo
  echo '========== timings =========='
  for name in "${STEP_NAMES[@]}"; do
    (( ${#name} > width )) && width=${#name}
  done
  for i in "${!STEP_NAMES[@]}"; do
    name="${STEP_NAMES[$i]}"
    ms="${STEP_MS[$i]}"
    total=$((total + ms))
    printf "  %-*s  %6d ms\n" "$width" "$name" "$ms"
  done
  printf "  %-*s  %6d ms\n" "$width" "TOTAL" "$total"
  echo '============================='
}

die() { echo "error: $*" >&2; exit 1; }

ensure_build_dir() {
  mkdir -p "$BUILD"
}

compile_l8() {
  # compile_l8 <compiler> <src.l8> <out.s>
  "./$1" "$2" >"$3"
}

link_l8() {
  # link_l8 <asm.s> <binary>
  gcc -nostdlib -static -o "$2" "$1" runtime.s
}

run_expect() {
  # run_expect <binary> <expected-stdout>
  local got
  got="$("$1")"
  if [[ "$got" != "$2" ]]; then
    die "$1 printed $(printf %q "$got"), expected $(printf %q "$2")"
  fi
}

# Compile + link + run an example, checking stdout.
example() {
  local compiler="$1" name="$2" src="$3" expected="$4"
  local asm="$BUILD/${name}.s" bin="$BUILD/${name}"

  compile_l8 "$compiler" "$src" "$asm"
  link_l8 "$asm" "$bin"
  run_expect "$bin" "$expected"
}

do_clean() {
  rm -f l8c0 l8c1 l8c2
  rm -f examples/hello examples/fib examples/logic examples/struct examples/string examples/i8 examples/bool examples/enum examples/forward
  rm -f examples/*.s
  rm -rf "$BUILD"
  echo 'cleaned'
}

do_bootstrap() {
  # shellcheck disable=SC2086
  step 'build bootstrap (l8c0)' $CC $CFLAGS -o l8c0 bootstrap.c
}

do_examples() {
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap

  step 'example hello  [l8c0]'  example l8c0 hello  examples/hello.l8  'Hi'
  step 'example fib    [l8c0]'  example l8c0 fib    examples/fib.l8    '55'
  step 'example logic  [l8c0]'  example l8c0 logic  examples/logic.l8  'YYYY'
  step 'example struct [l8c0]'  example l8c0 struct examples/struct.l8 '3 12 13'
  step 'example string [l8c0]'  example l8c0 string examples/string.l8 'Hi'
  step 'example i8     [l8c0]'  example l8c0 i8     examples/i8.l8     'Hi'
  step 'example bool   [l8c0]'  example l8c0 bool   examples/bool.l8   'TY10'
  step 'example enum   [l8c0]'  example l8c0 enum   examples/enum.l8   '9 10 0 3 0'
  step 'example forward[l8c0]' example l8c0 forward examples/forward.l8 '7'
}

do_selfhost() {
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap

  step 'stage1 compile (l8c0 → compiler.l8)' compile_l8 l8c0 compiler.l8 "$BUILD/l8c1.s"
  step 'stage1 link    (l8c1)'              link_l8 "$BUILD/l8c1.s" l8c1

  step 'stage2 compile (l8c1 → compiler.l8)' compile_l8 l8c1 compiler.l8 "$BUILD/l8c2.s"
  step 'stage2 link    (l8c2)'              link_l8 "$BUILD/l8c2.s" l8c2

  step 'stage3 compile (l8c2 → compiler.l8)' compile_l8 l8c2 compiler.l8 "$BUILD/l8c3.s"

  step 'verify stage2 == stage3'            diff -q "$BUILD/l8c2.s" "$BUILD/l8c3.s"

  step 'example hello  [l8c2]'  example l8c2 hello  examples/hello.l8  'Hi'
  step 'example struct [l8c2]'  example l8c2 struct examples/struct.l8 '3 12 13'
  step 'example string [l8c2]'  example l8c2 string examples/string.l8 'Hi'
  step 'example i8     [l8c2]'  example l8c2 i8     examples/i8.l8     'Hi'
  step 'example bool   [l8c2]'  example l8c2 bool   examples/bool.l8   'TY10'
  step 'example enum   [l8c2]'  example l8c2 enum   examples/enum.l8   '9 10 0 3 0'
  step 'example forward[l8c2]'  example l8c2 forward examples/forward.l8 '7'
}

do_all() {
  do_bootstrap
  do_examples
  do_selfhost
  print_summary
  echo 'OK'
}

usage() {
  cat <<'EOF'
Usage: ./build.sh [command]

Commands:
  all        Build bootstrap, run examples, self-host (default)
  bootstrap  Build l8c0 only
  examples   Run example programs via bootstrap
  selfhost   Three-stage self-host + stage2 examples
  clean      Remove build artifacts
  help       Show this help
EOF
}

cmd="${1:-all}"
case "$cmd" in
  all)              do_all ;;
  bootstrap)        do_bootstrap; print_summary ;;
  examples)         do_examples; print_summary ;;
  selfhost)         do_selfhost; print_summary ;;
  clean)            do_clean ;;
  help|-h|--help)   usage ;;
  *)                die "unknown command: $cmd (try ./build.sh help)" ;;
esac
