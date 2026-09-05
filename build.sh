#!/usr/bin/env bash
# Build, test, self-host, and promote the L8 bootstrap executable.
# See BOOTSTRAP.md for the two-stage source model.
set -euo pipefail

cd "$(dirname "$0")"

BUILD="${BUILD:-.build}"
FORCE=0
REPEAT=1
BENCH_REPEAT=10

declare -a STEP_NAMES=()
declare -a STEP_MS=()

now_ms() {
  echo $(( $(date +%s%N) / 1000000 ))
}

# Record a timed step. Progress is one line; timings go to the final summary.
# With --bench, run the command REPEAT times and record the average.
step() {
  local name="$1"
  shift
  local start end elapsed i total=0
  printf '→ %s\n' "$name"
  for ((i = 1; i <= REPEAT; i++)); do
    start=$(now_ms)
    if [[ "$i" -eq 1 ]]; then
      "$@"
    else
      "$@" >/dev/null
    fi
    end=$(now_ms)
    total=$((total + end - start))
  done
  elapsed=$(( (total + REPEAT / 2) / REPEAT ))
  STEP_NAMES+=("$name")
  STEP_MS+=("$elapsed")
}

print_summary() {
  local i width=0 name ms total=0
  echo
  if [[ "$REPEAT" -gt 1 ]]; then
    echo "========== timings (avg of ${REPEAT}) =========="
  else
    echo '========== timings =========='
  fi
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

run_expect() {
  local got
  got="$("$1")"
  if [[ "$got" != "$2" ]]; then
    die "$1 printed $(printf %q "$got"), expected $(printf %q "$2")"
  fi
}

example() {
  local tool="$1" name="$2" src="$3" expected="$4"
  local bin="$BUILD/${name}"
  "./$tool" build "$src" -o "$bin"
  run_expect "$bin" "$expected"
}

# All examples as one timed step (avoids a noisy per-file timing table).
run_examples() {
  local tool="$1"
  example "$tool" hello   examples/hello.l8   'Hi'
  example "$tool" fib     examples/fib.l8     '55'
  example "$tool" logic   examples/logic.l8   'YYYY'
  example "$tool" struct  examples/struct.l8  '3 12 13'
  example "$tool" string  examples/string.l8  'Hi'
  example "$tool" i8      examples/i8.l8      'Hi'
  example "$tool" bool    examples/bool.l8    'TY10'
  example "$tool" enum    examples/enum.l8    '9 10 0 3 0'
  example "$tool" forward examples/forward.l8 '7'
  example "$tool" null    examples/null.l8    'YYYY'
  example "$tool" narrow  examples/narrow.l8  'YYYY'
  example "$tool" nestsum examples/nestsum.l8 '1 2 3 9 4 5 6 7'
  example "$tool" exc     examples/exc.l8     'Hi'
  example "$tool" imports examples/imports/main.l8 'Hi'
  example "$tool" byte    examples/byte.l8    'YYYYY'
}

example_compile_fail() {
  local tool="$1" name="$2" src="$3" needle="$4"
  if "./$tool" compile "$src" >"$BUILD/${name}.s" 2>"$BUILD/${name}.err"; then
    die "$name should fail to compile"
  fi
  grep -q "$needle" "$BUILD/${name}.err" || die "expected '$needle' in $name"
}

example_exit() {
  local tool="$1" name="$2" src="$3" want="$4"
  "./$tool" build "$src" -o "$BUILD/${name}"
  local rc=0
  "$BUILD/${name}" || rc=$?
  if [[ "$rc" -ne "$want" ]]; then die "$name exited $rc, expected $want"; fi
}

# Examples that need stage-2 syntax (not yet in bootstrap).
run_examples_selfhost() {
  local tool="$1"
  run_examples "$tool"
  example "$tool" or examples/or.l8 'YYYY'
  example "$tool" noreturn examples/noreturn.l8 'Hi'
  example "$tool" global examples/global.l8 'YYYYYY'
  example "$tool" bitwise examples/bitwise.l8 'YYYYYYYYYYYY'
  example "$tool" expr examples/expr.l8 'YYYYYYYYYYY'
  check_retwarn "$tool"
  example "$tool" newarr examples/newarr.l8 'Hi'
  example "$tool" offset examples/offset.l8 'YYY'
  example "$tool" counted examples/counted.l8 'YYYYYYY'
  example_compile_fail "$tool" ptrindex examples/ptrindex.l8 'pointer indexing is not allowed'
  example_compile_fail "$tool" usebefore examples/usebefore.l8 'use of uninitialized local'
  example_compile_fail "$tool" newnofill examples/newnofill.l8 'requires an initial value'
  example_compile_fail "$tool" bareglobal examples/bareglobal.l8 'global requires an initializer'
  example_compile_fail "$tool" writeptr examples/writeptr.l8 'of \*i8 is one byte'
  example_compile_fail "$tool" stackaddr examples/stackaddr.l8 'address of local cannot escape'
  example_compile_fail "$tool" stash examples/stash.l8 'address of local cannot escape'
  example_compile_fail "$tool" stalenarrow examples/stalenarrow.l8 'dereferencing optional pointer'
  example_compile_fail "$tool" stalewalk examples/stalewalk.l8 'C-string index not walked'
  example_compile_fail "$tool" nullalias examples/nullalias.l8 'dereferencing optional pointer'
  example_compile_fail "$tool" walkalias examples/walkalias.l8 'C-string index not walked'
  example_compile_fail "$tool" zstore examples/zstore.l8 'cannot assign through C-string'
  example_compile_fail "$tool" unknownfn examples/unknownfn.l8 'unknown function'
  example_compile_fail "$tool" syscall examples/syscall.l8 'unknown function'
  example_compile_fail "$tool" badopen examples/badopen.l8 'argument type mismatch'
  example "$tool" local examples/local.l8 'YYYYY'
  example_compile_fail "$tool" localesc examples/localesc.l8 'address of local cannot escape'
  example_compile_fail "$tool" localbox examples/localbox.l8 'address of local cannot escape'
  example_compile_fail "$tool" localparam examples/localparam.l8 'local mode is only valid on parameters'
  example_compile_fail "$tool" colonz examples/colonz.l8 'expected a slice or C-string type'
  example_compile_fail "$tool" uninitkw examples/uninitkw.l8 'undefined variable'
  example_exit "$tool" sliceoob examples/sliceoob.l8 1
  example_exit "$tool" writeoob examples/writeoob.l8 1
  example_exit "$tool" newwrap examples/newwrap.l8 1
}

check_retwarn() {
  local tool="$1"
  local err="$BUILD/retwarn.err"
  local bin="$BUILD/retwarn"
  "./$tool" build examples/retwarn.l8 -o "$bin" 2>"$err" || die "retwarn compile failed"
  grep -q 'warning: unnecessary return in id' "$err" || die "expected unnecessary return in id"
  grep -q 'warning: ignored return value in drop' "$err" || die "expected ignored return value in drop"
  grep -q 'warning: unnecessary return in both' "$err" || die "expected unnecessary return in both"
  if grep -q 'unnecessary return in early' "$err"; then die "unexpected unnecessary return in early"; fi
  if grep -q 'ignored return value in side' "$err"; then die "unexpected ignored value on assignment"; fi
  if grep -q 'ignored return value in callp' "$err"; then die "unexpected ignored value on procedure call"; fi
  if grep -q 'ignored return value in id2' "$err"; then die "unexpected ignored value on last statement"; fi
  run_expect "$bin" 'YYYYYYY'
}

require_bootstrap() {
  [[ -f bootstrap ]] || die "bootstrap executable missing (see BOOTSTRAP.md)"
}

do_clean() {
  rm -f l8c0 l8c1 l8c2 l8c3 l8
  rm -f examples/hello examples/fib examples/logic examples/struct examples/string examples/i8 examples/bool examples/enum examples/forward examples/null examples/newarr examples/narrow examples/nestsum examples/noreturn examples/exc
  rm -f examples/*.s
  rm -rf "$BUILD"
  echo 'cleaned'
}

do_bootstrap() {
  require_bootstrap
  ensure_build_dir
  step 'install bootstrap (l8c0)' bootstrap_install_l8c0
}

bootstrap_install_l8c0() {
  cp bootstrap l8c0
  chmod +x l8c0
}

do_examples() {
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap
  step 'examples [l8c0]' run_examples l8c0
}

print_compiler_phases() {
  ./l8c3 build -p src2/main.l8 -o "$BUILD/l8-profile" 2>&1
}

# Every stage builds directly with no generated .s or .o intermediates.
do_selfhost() {
  ensure_build_dir
  [[ -x ./l8c0 ]] || do_bootstrap
  [[ -f src1/main.l8 ]] || die "src1/main.l8 missing"
  [[ -f src2/main.l8 ]] || die "src2/main.l8 missing"

  step 'stage1 direct (l8c0 → src1)' ./l8c0 build src1/main.l8 -o l8c1
  step 'stage2 direct (l8c1 → src2)' ./l8c1 build src2/main.l8 -o l8c2
  step 'stage3 direct (l8c2 → src2)' ./l8c2 build src2/main.l8 -o l8c3
  step 'verify stage2 exe == stage3 exe' cmp -s l8c2 l8c3

  step 'examples [l8c3]' run_examples_selfhost l8c3
  step 'compiler phases [l8c3]' print_compiler_phases
  cp l8c3 l8
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

do_promote_bin1() {
  need_artifact "l8c1" "./build.sh selfhost"
  confirm_promote "bootstrap executable (from stage-1 / src1)"
  cp l8c1 bootstrap
  chmod +x bootstrap
  echo "updated bootstrap executable from l8c1"
  echo "Next: review diff, then commit only the snapshot (see BOOTSTRAP.md)."
}

do_promote_bin2() {
  need_artifact "l8c3" "./build.sh selfhost"
  confirm_promote "bootstrap executable (from stage-2 fixpoint / src2)"
  cp l8c3 bootstrap
  chmod +x bootstrap
  echo "updated bootstrap executable from l8c3"
  echo "Next: review diff, then commit only the snapshot (see BOOTSTRAP.md)."
}

do_promote_source() {
  [[ -f src2/main.l8 ]] || die "src2/main.l8 missing"
  confirm_promote "src1/ (from src2/)"
  rm -rf src1
  cp -R src2 src1
  echo "updated src1/ from src2/"
  echo "Bootstrap was not changed. Use promote-bin2 or promote if the seed should move too."
}

do_promote() {
  need_artifact "l8c3" "./build.sh selfhost"
  confirm_promote "src1/ and bootstrap executable (full stage-2 promote)"
  rm -rf src1
  cp -R src2 src1
  cp l8c3 bootstrap
  chmod +x bootstrap
  echo "updated src1/ and bootstrap executable from stage-2 fixpoint"
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
Usage: ./build.sh [command] [--force] [--bench]

Commands:
  all             Install bootstrap, examples, two-stage self-host (default)
  bootstrap       Copy the saved bootstrap executable → l8c0
  examples        Run example programs via l8c0
  selfhost        direct src1 → l8c1; src2 → l8c2; fixpoint l8c2==l8c3; examples; phases
  promote-bin1    Copy the stage-1 executable → bootstrap
  promote-bin2    Copy the stage-2 fixpoint executable → bootstrap
  promote-source  Replace src1/ with src2/ (no bootstrap change)
  promote         promote-source + promote-bin2
  clean           Remove build artifacts
  help            Show this help

--force   Skip the interactive promote confirmation (still requires artifacts).
--bench   Run each timed step 10 times and report average milliseconds.

Compilation, assembly, ELF packing, and direct executable building are
subcommands of every stage binary. The build script uses the direct path.
The saved bootstrap is directly executable; cold start needs no host compiler.
EOF
}

# Parse args: command plus optional --force / --bench anywhere
cmd="all"
args=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --bench) REPEAT=$BENCH_REPEAT ;;
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
  promote-bin1)     do_promote_bin1 ;;
  promote-bin2)     do_promote_bin2 ;;
  promote-source)   do_promote_source ;;
  promote)          do_promote ;;
  clean)            do_clean ;;
  help|-h|--help)   usage ;;
  *)                die "unknown command: $cmd (try ./build.sh help)" ;;
esac
