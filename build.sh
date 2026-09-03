#!/usr/bin/env bash
# Build, test, self-host, and promote L8 bootstrap snapshots.
# See BOOTSTRAP.md for the two-stage source model.
set -euo pipefail

cd "$(dirname "$0")"

BUILD="${BUILD:-.build}"
FORCE=0

declare -a STEP_NAMES=()
declare -a STEP_MS=()

now_ms() {
  echo $(( $(date +%s%N) / 1000000 ))
}

# Record a timed step. Progress is one line; timings go to the final summary.
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
  "./$1" "$2" >"$3"
}

# Assemble program + runtime into one .o (no undefs). Pack with elfpack → ET_EXEC.
# Host as/gcc only for: bootstrap.s → l8c0, and first l8as + elfpack binaries.
host_assemble_rt() {
  local asm="$1" obj="$2"
  as -o "$obj" "$asm" runtime.s
}

assemble_rt() {
  local asm="$1" obj="$2"
  ensure_l8as
  ./l8as -o "$obj" "$asm" runtime.s
}

host_gcc_link() {
  local obj="$1" bin="$2"
  gcc -nostdlib -static -o "$bin" "$obj"
}

obj_for() {
  echo "$BUILD/$(basename "$1").o"
}

pack_l8() {
  local obj="$1" bin="$2"
  ensure_elfpack
  ./elfpack "$obj" -o "$bin"
}

# Convenience for examples (timing is batched at the suite level).
link_l8() {
  local asm="$1" bin="$2"
  local obj
  obj="$(obj_for "$bin")"
  assemble_rt "$asm" "$obj"
  pack_l8 "$obj" "$bin"
}

build_l8as() {
  [[ -f l8as.l8 ]] || die "l8as.l8 missing"
  [[ -x ./l8c0 ]] || die "l8c0 missing (run bootstrap first)"
  ./l8c0 l8as.l8 >"$BUILD/l8as.s"
  host_assemble_rt "$BUILD/l8as.s" "$BUILD/l8as.o"
  host_gcc_link "$BUILD/l8as.o" l8as
}

ensure_l8as() {
  if [[ -x ./l8as ]]; then
    return 0
  fi
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap
  build_l8as
}

build_elfpack() {
  [[ -f elfpack.l8 ]] || die "elfpack.l8 missing"
  [[ -x ./l8c0 ]] || die "l8c0 missing (run bootstrap first)"
  ./l8c0 elfpack.l8 >"$BUILD/elfpack.s"
  host_assemble_rt "$BUILD/elfpack.s" "$BUILD/elfpack.o"
  host_gcc_link "$BUILD/elfpack.o" elfpack
}

ensure_elfpack() {
  if [[ -x ./elfpack ]]; then
    return 0
  fi
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap
  build_elfpack
}

run_expect() {
  local got
  got="$("$1")"
  if [[ "$got" != "$2" ]]; then
    die "$1 printed $(printf %q "$got"), expected $(printf %q "$2")"
  fi
}

# compile + link + run.
example() {
  local compiler="$1" name="$2" src="$3" expected="$4"
  local asm="$BUILD/${name}.s" bin="$BUILD/${name}"
  compile_l8 "$compiler" "$src" "$asm"
  link_l8 "$asm" "$bin"
  run_expect "$bin" "$expected"
}

# All examples as one timed step (avoids a noisy per-file timing table).
run_examples() {
  local c="$1"
  example "$c" hello   examples/hello.l8   'Hi'
  example "$c" fib     examples/fib.l8     '55'
  example "$c" logic   examples/logic.l8   'YYYY'
  example "$c" struct  examples/struct.l8  '3 12 13'
  example "$c" string  examples/string.l8  'Hi'
  example "$c" i8      examples/i8.l8      'Hi'
  example "$c" bool    examples/bool.l8    'TY10'
  example "$c" enum    examples/enum.l8    '9 10 0 3 0'
  example "$c" forward examples/forward.l8 '7'
  example "$c" null    examples/null.l8    'YYYY'
  example "$c" newarr  examples/newarr.l8  'Hi'
  example "$c" narrow  examples/narrow.l8  'YYYY'
  example "$c" nestsum examples/nestsum.l8 '1 2 3 9 4 5 6 7'
  example "$c" noreturn examples/noreturn.l8 'Hi'
  example "$c" exc     examples/exc.l8     'Hi'
}

require_bootstrap_s() {
  [[ -f bootstrap.s ]] || die "bootstrap.s missing (see BOOTSTRAP.md)"
}

do_clean() {
  rm -f l8c0 l8c1 l8c2 l8c3 elfpack l8as
  rm -f examples/hello examples/fib examples/logic examples/struct examples/string examples/i8 examples/bool examples/enum examples/forward examples/null examples/newarr examples/narrow examples/nestsum examples/noreturn examples/exc
  rm -f examples/*.s
  rm -rf "$BUILD"
  echo 'cleaned'
}

do_bootstrap() {
  require_bootstrap_s
  ensure_build_dir
  step 'link bootstrap (l8c0)' bootstrap_link_l8c0
}

bootstrap_link_l8c0() {
  host_assemble_rt bootstrap.s "$BUILD/l8c0.o"
  host_gcc_link "$BUILD/l8c0.o" l8c0
}

do_examples() {
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap
  step 'examples [l8c0]' run_examples l8c0
}

# Stage-1: bootstrap compiles compiler.l8 → l8c1
# Stage-2: l8c1 compiles compiler2.l8 → l8c2
# Fixpoint: l8c2 recompiles compiler2.l8 → l8c3, then l8c3 recompiles → l8c4;
#           require l8c3.s == l8c4.s (stage-2 compiler converges on compiler2.l8).
# Note: l8c2.s may differ from l8c3.s while compiler.l8 and compiler2.l8 diverge
# (e.g. codegen work in stage-2 only); that is expected until promote.
do_selfhost() {
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap
  [[ -f compiler2.l8 ]] || die "compiler2.l8 missing"
  step 'ensure l8as' ensure_l8as
  step 'ensure elfpack' ensure_elfpack

  step 'stage1 compile  (l8c0 → compiler.l8)' compile_l8 l8c0 compiler.l8 "$BUILD/l8c1.s"
  step 'stage1 assemble (l8c1)'               assemble_rt "$BUILD/l8c1.s" "$(obj_for l8c1)"
  step 'stage1 elfpack  (l8c1)'               pack_l8 "$(obj_for l8c1)" l8c1

  step 'stage2 compile  (l8c1 → compiler2.l8)' compile_l8 l8c1 compiler2.l8 "$BUILD/l8c2.s"
  step 'stage2 assemble (l8c2)'                assemble_rt "$BUILD/l8c2.s" "$(obj_for l8c2)"
  step 'stage2 elfpack  (l8c2)'                pack_l8 "$(obj_for l8c2)" l8c2

  step 'stage3 compile  (l8c2 → compiler2.l8)' compile_l8 l8c2 compiler2.l8 "$BUILD/l8c3.s"
  step 'stage3 assemble (l8c3)'                assemble_rt "$BUILD/l8c3.s" "$(obj_for l8c3)"
  step 'stage3 elfpack  (l8c3)'                pack_l8 "$(obj_for l8c3)" l8c3

  step 'stage4 compile  (l8c3 → compiler2.l8)' compile_l8 l8c3 compiler2.l8 "$BUILD/l8c4.s"
  step 'verify stage3 == stage4'               diff -q "$BUILD/l8c3.s" "$BUILD/l8c4.s"

  step 'examples [l8c3]' run_examples l8c3
}

confirm_promote() {
  local what="$1"
  if [[ "$FORCE" -eq 1 ]]; then
    return 0
  fi
  echo "About to update $what in the working tree."
  echo "Promotes are meant for an isolated commit — not every change."
  read -r -p "Continue? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || die "aborted"
}

need_artifact() {
  local path="$1" hint="$2"
  if [[ ! -f "$path" ]]; then
    if [[ "$FORCE" -eq 1 ]]; then
      die "$path missing (cannot --force without building first)"
    fi
    die "$path missing; run: $hint"
  fi
}

do_promote_asm1() {
  need_artifact "$BUILD/l8c1.s" "./build.sh selfhost"
  confirm_promote "bootstrap.s (from stage-1 / compiler.l8)"
  cp "$BUILD/l8c1.s" bootstrap.s
  echo "updated bootstrap.s from $BUILD/l8c1.s"
  echo "Next: review diff, then commit only the snapshot (see BOOTSTRAP.md)."
}

do_promote_asm2() {
  need_artifact "$BUILD/l8c3.s" "./build.sh selfhost"
  confirm_promote "bootstrap.s (from stage-2 fixpoint / compiler2.l8)"
  cp "$BUILD/l8c3.s" bootstrap.s
  echo "updated bootstrap.s from $BUILD/l8c3.s"
  echo "Next: review diff, then commit only the snapshot (see BOOTSTRAP.md)."
}

do_promote_source() {
  [[ -f compiler2.l8 ]] || die "compiler2.l8 missing"
  confirm_promote "compiler.l8 (from compiler2.l8)"
  cp compiler2.l8 compiler.l8
  echo "updated compiler.l8 from compiler2.l8"
  echo "Asm was not changed. Use promote-asm2 or promote if the bootstrap should move too."
}

do_promote() {
  need_artifact "$BUILD/l8c3.s" "./build.sh selfhost"
  confirm_promote "compiler.l8 and bootstrap.s (full stage-2 promote)"
  cp compiler2.l8 compiler.l8
  cp "$BUILD/l8c3.s" bootstrap.s
  echo "updated compiler.l8 and bootstrap.s from stage-2 fixpoint"
  echo "Next: review diff, then commit this promote alone."
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
Usage: ./build.sh [command] [--force]

Commands:
  all             Link bootstrap.s, examples, two-stage self-host (default)
  bootstrap       Link bootstrap.s + runtime.s → l8c0
  examples        Run example programs via l8c0
  selfhost        compiler.l8 → l8c1; compiler2.l8 → l8c2; fixpoint l8c3==l8c4; examples
  promote-asm1    Copy stage-1 asm → bootstrap.s (isolated snapshot commit)
  promote-asm2    Copy stage-2 fixpoint asm (l8c3.s) → bootstrap.s
  promote-source  Copy compiler2.l8 → compiler.l8 (no asm change)
  promote         promote-source + promote-asm2
  clean           Remove build artifacts
  help            Show this help

--force   Skip the interactive promote confirmation (still requires artifacts).

Linking uses l8as + elfpack (see BOOTSTRAP.md). Host as/gcc are only needed to
link bootstrap.s → l8c0 and the first l8as / elfpack binaries.
EOF
}

# Parse args: command plus optional --force anywhere
cmd="all"
args=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    *) args+=("$a") ;;
  esac
done
if [[ ${#args[@]} -gt 0 ]]; then
  cmd="${args[0]}"
fi
if [[ ${#args[@]} -gt 1 ]]; then
  die "unexpected args (try ./build.sh help)"
fi

case "$cmd" in
  all)              do_all ;;
  bootstrap)        do_bootstrap; print_summary ;;
  examples)         do_examples; print_summary ;;
  selfhost)         do_selfhost; print_summary ;;
  promote-asm1)     do_promote_asm1 ;;
  promote-asm2)     do_promote_asm2 ;;
  promote-source)   do_promote_source ;;
  promote)          do_promote ;;
  clean)            do_clean ;;
  help|-h|--help)   usage ;;
  *)                die "unknown command: $cmd (try ./build.sh help)" ;;
esac
