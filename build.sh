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

verify_same() {
  cmp -s "$1" "$2" || die "$1 and $2 differ (src2 is not at fixpoint)"
}

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

declare -a EXPECT_SOURCES=()

expect_source() {
  EXPECT_SOURCES+=("$2")
}

flush_expect_sources() {
  local tool="$1"
  if [[ "${#EXPECT_SOURCES[@]}" -gt 0 ]]; then
    python3 tools/expect.py "./$tool" "$BUILD/expect" "${EXPECT_SOURCES[@]}"
    EXPECT_SOURCES=()
  fi
}

fmt_src2() {
  local tool="$1"
  local f
  for f in src2/*.l8; do
    "./$tool" fmt -w "$f"
  done
}

check_fmt_src2() {
  local tool="$1"
  local f
  for f in src2/*.l8; do
    "./$tool" fmt "$f" >"$BUILD/fmt.check"
    cmp -s "$f" "$BUILD/fmt.check" || die "fmt is not stable: $f"
  done
}

# Bootstrap-compatible examples as one timed step.
run_bootstrap_tests() {
  local tool="$1"
  python3 tools/expect.py "./$tool" "$BUILD/expect" --discover tests/compiler --bootstrap-only
}

example_compile_fail() {
  local tool="$1" name="$2" src="$3" needle="$4"
  if "./$tool" compile "$src" >"$BUILD/${name}.s" 2>"$BUILD/${name}.err"; then
    die "$name should fail to compile"
  fi
  grep -q "$needle" "$BUILD/${name}.err" || die "expected '$needle' in $name"
}

check_optional_semis() {
  local tool="$1" declaration
  cat >"$BUILD/optional-semi.l8" <<'EOF'
tag example;

exception Stop;
type Choice = | A | B

id(): int { return 3 }
done() { if (true) return else return }
stop() raises Stop { raise Stop }

main(): int {
    value: int = 0;
    { value = value + 1 }
    { scratch: int = 1 }
    if (false) value = 9 else value = value + 1;
    while (false) { value = 9 }
    for i in 0..0 { value = 9 }
    match value { 2 -> value = value + 1; _ -> value = 9 }
    if (value != id()) return 1;
    0
}
EOF
  example_exit "$tool" optional-semi "$BUILD/optional-semi.l8" 0
  "./$tool" fmt "$BUILD/optional-semi.l8" >"$BUILD/optional-semi-formatted.l8"
  grep -q '^tag example;$' "$BUILD/optional-semi-formatted.l8" || die 'file tag lost its required semicolon'
  grep -q '^    return 3$' "$BUILD/optional-semi-formatted.l8" || die 'final return kept its semicolon'
  grep -q '^    if (true) return else return$' "$BUILD/optional-semi-formatted.l8" || die 'return before else kept its semicolon'
  grep -q '^        2 -> value = value + 1;$' "$BUILD/optional-semi-formatted.l8" || die 'non-final match arm lost its semicolon'
  grep -q '^        _ -> value = 9$' "$BUILD/optional-semi-formatted.l8" || die 'final match arm kept its semicolon'
  grep -q '^    0$' "$BUILD/optional-semi-formatted.l8" || die 'final expression kept its semicolon'
  example_exit "$tool" optional-semi-formatted "$BUILD/optional-semi-formatted.l8" 0
  for declaration in 'value: int = 1' 'extern foreign(): int' 'exception Empty' 'need "libnothing.so"' 'import "unused.l8"' 'type Choice = | A | B'; do
    printf 'tag example;\nmain(): int { 0; }\n%s\n' "$declaration" >"$BUILD/optional-semi-eof.l8"
    "./$tool" fmt "$BUILD/optional-semi-eof.l8" >"$BUILD/optional-semi-eof-formatted.l8"
    if tail -n 1 "$BUILD/optional-semi-eof-formatted.l8" | grep -q ';$'; then die "EOF semicolon kept for $declaration"; fi
  done
  printf 'tag example;\nmain(): int { value: int = 1 value }\n' >"$BUILD/optional-semi-required.l8"
  example_compile_fail "$tool" optional-semi-required "$BUILD/optional-semi-required.l8" 'unexpected token'
}

example_exit() {
  local tool="$1" name="$2" src="$3" want="$4"
  "./$tool" build "$src" -o "$BUILD/${name}"
  local rc=0
  "$BUILD/${name}" || rc=$?
  if [[ "$rc" -ne "$want" ]]; then die "$name exited $rc, expected $want"; fi
}

# Full annotated suite and specialized stage-2 checks.
run_compiler_tests() {
  local tool="$1"
  python3 tools/expect.py "./$tool" "$BUILD/expect" --discover tests/compiler --discover tests/callbacks
  "./$tool" fmt tests/compiler/intmatch.l8 >"$BUILD/intmatch-formatted.l8"
  "./$tool" fmt "$BUILD/intmatch-formatted.l8" >"$BUILD/intmatch-formatted-again.l8"
  cmp -s "$BUILD/intmatch-formatted.l8" "$BUILD/intmatch-formatted-again.l8" || die 'integer match formatting is not stable'
  expect_source "$tool" "$BUILD/intmatch-formatted.l8"
  "./$tool" fmt tests/compiler/match_format.l8 >"$BUILD/match-format.l8"
  "./$tool" fmt "$BUILD/match-format.l8" >"$BUILD/match-format-again.l8"
  cmp -s "$BUILD/match-format.l8" "$BUILD/match-format-again.l8" || die 'match arm reduction is not stable'
  grep -q 'Value v -> v.data;' "$BUILD/match-format.l8" || die 'single expression match arm kept its braces'
  grep -q '1 -> return 9;' "$BUILD/match-format.l8" || die 'single return match arm kept its braces'
  grep -q 'Value v -> {' "$BUILD/match-format.l8" || die 'scoped declaration match arm lost its braces'
  grep -q '^        1 -> {$' "$BUILD/match-format.l8" || die 'commented match arm lost its braces'
  grep -q 'Keep this comment with its block' "$BUILD/match-format.l8" || die 'match arm comment was lost'
  expect_source "$tool" "$BUILD/match-format.l8"
  "./$tool" fmt tests/compiler/control_format.l8 >"$BUILD/control-format.l8"
  "./$tool" fmt "$BUILD/control-format.l8" >"$BUILD/control-format-again.l8"
  cmp -s "$BUILD/control-format.l8" "$BUILD/control-format-again.l8" || die 'control body reduction is not stable'
  grep -q 'if (true) value = 1 else value = 2;' "$BUILD/control-format.l8" || die 'single if body kept its braces'
  grep -q 'while (false) value = 9;' "$BUILD/control-format.l8" || die 'single while body kept its braces'
  grep -q 'for i in 0..1 value = value + i;' "$BUILD/control-format.l8" || die 'single for body kept its braces'
  grep -q 'if (false) {' "$BUILD/control-format.l8" || die 'nested if lost its protective braces'
  grep -q 'if (true) local: int = value;' "$BUILD/control-format.l8" || die 'scoped declaration kept its braces'
  grep -q '^    if (true) {$' "$BUILD/control-format.l8" || die 'commented control body lost its braces'
  grep -q 'Keep this comment with its block' "$BUILD/control-format.l8" || die 'commented control body lost its comment'
  expect_source "$tool" "$BUILD/control-format.l8"
  check_optional_semis "$tool"
  "./$tool" forlint tests/compiler/forlint.l8 2>"$BUILD/forlint.err"
  grep -q 'while loop can use for i in 0..end' "$BUILD/forlint.err" || die 'missing ranged for suggestion'
  grep -q 'while loop can use for item in xs' "$BUILD/forlint.err" || die 'missing collection for suggestion'
  [[ "$(grep -c 'while loop can use' "$BUILD/forlint.err")" -eq 2 ]] || die 'unexpected for-loop suggestion'
  check_retwarn "$tool"
  flush_expect_sources "$tool"
  check_tags "$tool"
}

check_tags() {
  local tool="$1" name f
  "./$tool" build tests/compiler/tags/untagged_unused.l8 -o "$BUILD/tags-untagged-unused" 2>"$BUILD/tags-compile.err"
  if grep -q 'unused function' "$BUILD/tags-compile.err"; then die 'ordinary build emitted an unused function warning'; fi
  if "./$tool" build tests/compiler/tags/untagged_call.l8 -o "$BUILD/tags-invalid" 2>"$BUILD/tags-build.err"; then
    die 'build accepted an untagged reference'
  fi
  grep -q 'declaration has no tags' "$BUILD/tags-build.err" || die 'missing build tag diagnostic'
  if "./$tool" browse tests/compiler/tags/untagged_import.l8 -o "$BUILD/tags-invalid.html" 2>"$BUILD/tags-browse.err"; then
    die 'browse accepted an untagged reference'
  fi
  grep -q 'untagged_import.l8:6:5:' "$BUILD/tags-browse.err" || die 'missing referring source location'
  # These are separate programs over one shared library, so unused-function
  # reachability must be the union of all of their entry points.
  local -a unused_entries=(
    tests/compiler/tags/declaration_only.l8
    tests/compiler/tags/import_only.l8
    tests/compiler/tags/late_file.l8
    tests/compiler/tags/untagged_unused.l8
    tests/compiler/tags/main.l8
    tests/compiler/tags/used.l8
    tests/compiler/tags/implicit.l8
    tests/compiler/tags/global.l8
    tests/compiler/tags/shadow.l8
  )
  "./$tool" unused "${unused_entries[@]}" 2>"$BUILD/tags-unused.err"
  grep -q 'warning: tests/compiler/tags/untagged_unused.l8:1:1: unused function unused' "$BUILD/tags-unused.err" || die 'expected project-wide unused function warning'
  if grep -q 'unused function tag_' "$BUILD/tags-unused.err"; then die 'function used by another entry point was reported unused'; fi

  # Format each file without following imports, then compile the formatted graph.
  mkdir -p "$BUILD/tags-fmt"
  for f in tests/compiler/tags/*.l8; do
    name="${f##*/}"
    case "$name" in
      nested.l8|qualified_definition.l8|duplicate.l8|duplicate_kind.l8|builtin_collision.l8|invalid_modifier.l8|dangling_modifier.l8) continue ;;
    esac
    "./$tool" fmt "$f" >"$BUILD/tags-fmt/$name"
    "./$tool" fmt "$BUILD/tags-fmt/$name" >"$BUILD/tags-fmt/check"
    cmp -s "$BUILD/tags-fmt/$name" "$BUILD/tags-fmt/check" || die "tag formatting is not stable: $f"
  done
  expect_source "$tool" "$BUILD/tags-fmt/declaration_only.l8"
  expect_source "$tool" "$BUILD/tags-fmt/late_file.l8"
  expect_source "$tool" "$BUILD/tags-fmt/untagged_unused.l8"
  expect_source "$tool" "$BUILD/tags-fmt/main.l8"
  expect_source "$tool" "$BUILD/tags-fmt/used.l8"
  expect_source "$tool" "$BUILD/tags-fmt/implicit.l8"
  expect_source "$tool" "$BUILD/tags-fmt/global.l8"
  expect_source "$tool" "$BUILD/tags-fmt/shadow.l8"
  "./$tool" browse tests/compiler/tags/main.l8 -o "$BUILD/tags-browse.html"
  grep -q 'parser::' "$BUILD/tags-browse.html" || die 'browse lost tag qualifier'
  grep -q 'data-s=' "$BUILD/tags-browse.html" || die 'tag browse missing references'

  # Qualified calls retain the same link names in both compiler backends.
  "./$tool" compile tests/compiler/tags/main.l8 >"$BUILD/tags-main.s"
  "./$tool" as -o "$BUILD/tags-main.o" "$BUILD/tags-main.s" runtime.s
  "./$tool" elfpack "$BUILD/tags-main.o" -o "$BUILD/tags-asm"
  run_expect "$BUILD/tags-asm" 'tags'
  flush_expect_sources "$tool"
}

check_retwarn() {
  local tool="$1"
  local err="$BUILD/retwarn.err"
  local bin="$BUILD/retwarn"
  "./$tool" build tests/compiler/retwarn.l8 -o "$bin" 2>"$err" || die "retwarn compile failed"
  grep -q 'warning: tests/compiler/retwarn.l8:9:5: unnecessary return in id' "$err" || die "expected located unnecessary return in id"
  grep -q 'warning: tests/compiler/retwarn.l8:17:5: ignored return value in drop' "$err" || die "expected located ignored return value in drop"
  grep -q 'warning: tests/compiler/retwarn.l8:39:16: unnecessary return in both' "$err" || die "expected located unnecessary return in both"

  local boolint_err="$BUILD/boolint.err"
  "./$tool" boolint tests/compiler/boolint.l8 2>"$boolint_err"
  grep -q 'int field enabled is used only as a boolean; use bool' "$boolint_err" || die 'expected bool-int field warning'
  grep -q 'int local on is used only as a boolean; use bool' "$boolint_err" || die 'expected bool-int parameter warning'
  grep -q 'int return value of choose is used only as a boolean; use bool' "$boolint_err" || die 'expected bool-int return warning'
  if grep -q 'count is used only as a boolean' "$boolint_err"; then die 'numeric int reported as boolean'; fi
  local paths_err="$BUILD/unreachable.err"
  "./$tool" unreachable tests/compiler/unreachable.l8 2>"$paths_err"
  grep -q 'unreachable if branch' "$paths_err" || die 'expected dead if branch'
  grep -q 'unreachable else branch' "$paths_err" || die 'expected dead else branch'
  grep -q 'unreachable while body' "$paths_err" || die 'expected dead while body'
  grep -q 'unreachable for body' "$paths_err" || die 'expected empty for body'
  grep -q 'unreachable statement' "$paths_err" || die 'expected dead statement'
  [[ "$(grep -c 'unreachable ' "$paths_err")" -eq 6 ]] || die 'unexpected unreachable warning'
  local fields_err="$BUILD/unusedfields.err"
  "./$tool" unusedfields tests/compiler/unusedfields.l8 2>"$fields_err"
  grep -q 'record field Inner.spare_inner is never read' "$fields_err" || die 'expected unused nested field'
  grep -q 'record field Flags.spare is never read' "$fields_err" || die 'expected unused field'
  grep -q 'record field Flags.write_only is never read' "$fields_err" || die 'expected write-only field'
  [[ "$(grep -c 'record field' "$fields_err")" -eq 3 ]] || die 'unexpected unused field warning'
  "./$tool" boolint tests/compiler/unusedfields.l8 2>"$boolint_err"
  grep -q 'int field enabled is used only as a boolean; use bool' "$boolint_err" || die 'expected bool-int record field warning'
  local assignments_err="$BUILD/unusedassign.err"
  "./$tool" unusedassign tests/compiler/unusedassign.l8 2>"$assignments_err"
  grep -q 'value assigned to first is overwritten before being read' "$assignments_err" || die 'expected dead initializer'
  [[ "$(grep -c 'value assigned to second is overwritten before being read' "$assignments_err")" -eq 2 ]] || die 'expected both dead writes'
  grep -q 'value assigned to nested is overwritten before being read' "$assignments_err" || die 'expected nested dead write'
  [[ "$(grep -c 'overwritten before being read' "$assignments_err")" -eq 4 ]] || die 'unexpected unused assignment warning'
  grep -q 'declaration of delayed can be combined with its first assignment' "$assignments_err" || die 'expected delayed declaration suggestion'
  grep -q 'declaration of branched can be combined with its first assignment' "$assignments_err" || die 'expected if declaration suggestion'
  grep -q 'declaration of matched can be combined with its first assignment' "$assignments_err" || die 'expected match declaration suggestion'
  [[ "$(grep -c 'can be combined with its first assignment' "$assignments_err")" -eq 3 ]] || die 'unexpected declaration suggestion'
  if grep -q 'unnecessary return in early' "$err"; then die "unexpected unnecessary return in early"; fi
  if grep -q 'ignored return value in side' "$err"; then die "unexpected ignored value on assignment"; fi
  if grep -q 'ignored return value in callp' "$err"; then die "unexpected ignored value on procedure call"; fi
  if grep -q 'ignored return value in id2' "$err"; then die "unexpected ignored value on last statement"; fi
}

check_browse() {
  local tool="$1"
  local hello="$BUILD/browse-hello.html"
  local html="$BUILD/l8.html"
  "./$tool" browse tests/compiler/hello.l8 -o "$hello" || die "browse hello failed"
  grep -q 'id="files"' "$hello" || die "browse html missing file list"
  grep -q 'class="file' "$hello" || die "browse html missing code view"
  grep -q 'data-s=' "$hello" || die "browse html missing symbol spans"
  grep -q 'data-t=' "$hello" || die "browse html missing hover types"
  grep -q 'Go to definition' "$hello" || die "browse html missing go to definition"
  grep -q 'Find references' "$hello" || die "browse html missing find references"
  grep -q 'putchar' "$hello" || die "browse html missing hello source"
  "./$tool" browse src2/main.l8 -o "$html" || die "browse compiler failed"
  grep -q 'src2/compiler.l8' "$html" || die "browse compiler html missing compiler.l8"
  grep -q 'src2/parse.l8' "$html" || die "browse compiler html missing parse.l8"
  grep -q 'src2/check.l8' "$html" || die "browse compiler html missing check.l8"
  grep -q 'src2/codegen.l8' "$html" || die "browse compiler html missing codegen.l8"
  grep -q 'src2/browse.l8' "$html" || die "browse compiler html missing browse.l8"
}

require_bootstrap() {
  [[ -f bootstrap ]] || die "bootstrap executable missing (see BOOTSTRAP.md)"
}

do_clean() {
  rm -f l8c0 l8c1 l8c2 l8c3 l8c4 l8 l8new l8new2
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

build_stage1() {
  require_bootstrap
  step 'stage1 direct (bootstrap → src1)' ./bootstrap build src1/main.l8 -o l8c1
}

do_bootstrap_tests() {
  ensure_build_dir
  build_stage1
  step 'compiler tests [l8c1]' run_bootstrap_tests l8c1
}

build_game() {
  local tool="$1"
  "./$tool" build programs/block-game/block-game.l8 -o "$BUILD/block-game"
}

do_game() {
  ensure_build_dir
  local tool="l8"
  if [[ ! -x "./$tool" ]]; then
    build_stage1
    tool="l8c1"
  fi
  step "block game [$tool]" build_game "$tool"
}

do_terminal() {
  ensure_build_dir
  local tool="l8"
  if [[ ! -x "./$tool" ]]; then
    build_stage1
    tool="l8c1"
  fi
  step "terminal [$tool]" build_terminal_binary "$tool"
}

build_terminal_binary() {
  local tool="$1"
  # A terminal may be running from the previous output. Build beside it and
  # atomically replace the directory entry instead of rewriting its live inode.
  "./$tool" build programs/terminal/terminal.l8 -o "$BUILD/terminal.next"
  mv -f "$BUILD/terminal.next" "$BUILD/terminal"
}

do_terminal_test() {
  do_terminal
  local tool="l8"
  [[ -x "./$tool" ]] || tool="l8c1"
  step 'terminal screen build' "./$tool" build programs/terminal/test.l8 -o "$BUILD/terminal-test"
  step 'terminal screen tests' "$BUILD/terminal-test"
  step 'terminal scene build' "./$tool" build programs/terminal/test_scene.l8 -o "$BUILD/terminal-scene-test"
  step 'terminal scene tests' "$BUILD/terminal-scene-test"
  step 'terminal presentation build' "./$tool" build programs/terminal/test_presentation.l8 -o "$BUILD/terminal-presentation-test"
  step 'terminal presentation tests' "$BUILD/terminal-presentation-test"
  step 'terminal PTY build' "./$tool" build programs/terminal/test_pty.l8 -o "$BUILD/terminal-pty-test"
  step 'terminal system-shell PTY tests' env SHELL=/bin/bash LC_ALL=C.UTF-8 L8_EXPECT_BASH=yes L8_TERMINAL_TEST='value with spaces' L8_EMPTY_TEST= "$BUILD/terminal-pty-test"
  step 'terminal shell-fallback PTY tests' env SHELL=/definitely/missing LC_ALL=C.UTF-8 L8_EXPECT_BASH= L8_TERMINAL_TEST='value with spaces' L8_EMPTY_TEST= "$BUILD/terminal-pty-test"
  step 'terminal closed-stdio PTY tests' env SHELL=/bin/sh LC_ALL=C.UTF-8 L8_EXPECT_BASH= L8_TERMINAL_TEST='value with spaces' L8_EMPTY_TEST= "$BUILD/terminal-pty-test" --closed-stdio
  step 'terminal Wayland/PTY tests' python3 programs/terminal/test_integration.py "$BUILD/terminal"
}

do_callback_test() {
  ensure_build_dir
  build_stage1
  step 'Function values and C callbacks [l8c1]' python3 tests/callbacks/test_callbacks.py ./l8c1 "$BUILD/callbacks"
}

build_http() {
  local tool="${L8C:-./l8c1}"
  mkdir -p "$BUILD/http"
  "$tool" build programs/examples/http-server.l8 -o "$BUILD/http/server"
  "$tool" build programs/examples/http-client.l8 -o "$BUILD/http/client"
}

do_http() {
  ensure_build_dir
  if [[ -z "${L8C:-}" ]]; then build_stage1; fi
  step 'HTTP client and server' build_http
}

do_http_test() {
  ensure_build_dir
  step 'HTTP specification integrity' python3 programs/http/spec/fetch.py --check
  step 'HTTP protocol, API, and TCP tests' env HTTP_BUILD="$BUILD/http" python3 -m unittest discover -s programs/http/tests -v
}

build_websocket() {
  local tool="${L8C:-./l8c1}"
  mkdir -p "$BUILD/websocket"
  "$tool" build programs/examples/websocket-server.l8 -o "$BUILD/websocket/server"
  "$tool" build programs/examples/websocket-client.l8 -o "$BUILD/websocket/client"
}

do_websocket() {
  ensure_build_dir
  if [[ -z "${L8C:-}" ]]; then build_stage1; fi
  step 'WebSocket client and server' build_websocket
}

do_websocket_test() {
  ensure_build_dir
  local expect_tool="${L8C:-}"
  if [[ -z "$expect_tool" ]]; then
    build_stage1
    expect_tool="$BUILD/websocket/expect-compiler"
    mkdir -p "$BUILD/websocket"
    step 'expect compiler' ./l8c1 build src2/main.l8 -o "$expect_tool"
  fi
  step 'WebSocket client and server' build_websocket
  step 'library expect runner' python3 -m unittest tools.test_lib_expect
  step 'WebSocket protocol, visibility, and TCP tests' env WEBSOCKET_BUILD="$BUILD/websocket" python3 -m unittest discover -s programs/websocket/tests -v
  step 'WebSocket codec vectors' python3 tools/lib_expect.py programs/websocket/tests/unit.l8 --compiler "$expect_tool"
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
  step 'fmt src2 [l8c2]' fmt_src2 l8c2
  step 'fmt src2 stable [l8c2]' check_fmt_src2 l8c2
  step 'stage3 direct (l8c2 → src2)' ./l8c2 build src2/main.l8 -o l8c3
  step 'stage4 direct (l8c3 → src2)' ./l8c3 build src2/main.l8 -o l8c4
  step 'verify stage3 exe == stage4 exe' verify_same l8c3 l8c4

  step 'expect runners' python3 -m unittest tools.test_expect tools.test_lib_expect
  step 'compiler tests [l8c3]' run_compiler_tests l8c3
  step 'browse [l8c3]' check_browse l8c3
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
  do_bootstrap_tests
  do_selfhost
  step 'block game [l8]' build_game l8
  print_summary
  echo 'OK'
}

usage() {
  cat <<'EOF'
Usage: ./build.sh [command] [--force] [--bench]

Commands:
  all             Install bootstrap, compiler tests, two-stage self-host (default)
  bootstrap       Copy the saved bootstrap executable → l8c0
  compiler-test   Build stage 1 and run bootstrap-compatible compiler tests
  game            Build programs/block-game/block-game.l8 → .build/block-game
  terminal        Build programs/terminal/terminal.l8 → .build/terminal
  terminal-test   Run terminal screen, PTY, and isolated headless Wayland tests
  callback-test   Test function values, lifetimes, and the C ABI (requires cc/as)
  http            Build programs/http client and server → .build/http/
  http-test       Verify downloaded specifications and run the HTTP test suite
  websocket       Build WebSocket client and server → .build/websocket/
  websocket-test  Run WebSocket codec, API visibility, and TCP tests
  selfhost        direct src1 → l8c1; src2 → l8c2; fmt src2; src2 → l8c3/l8c4; fixpoint l8c3==l8c4; tests; browse; phases
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
  compiler-test|examples) do_bootstrap_tests; print_summary ;;
  game)             do_game; print_summary ;;
  terminal)         do_terminal; print_summary ;;
  terminal-test)    do_terminal_test; print_summary ;;
  callback-test)    do_callback_test; print_summary ;;
  http)             do_http; print_summary ;;
  http-test)        do_http_test; print_summary ;;
  websocket)        do_websocket; print_summary ;;
  websocket-test)   do_websocket_test; print_summary ;;
  selfhost)         do_selfhost; print_summary ;;
  promote-bin1)     do_promote_bin1 ;;
  promote-bin2)     do_promote_bin2 ;;
  promote-source)   do_promote_source ;;
  promote)          do_promote ;;
  clean)            do_clean ;;
  help|-h|--help)   usage ;;
  *)                die "unknown command: $cmd (try ./build.sh help)" ;;
esac
