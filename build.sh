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

# All examples as one timed step (avoids a noisy per-file timing table).
run_examples() {
  local tool="$1"
  example "$tool" hello   programs/examples/hello.l8   'Hi'
  example "$tool" fib     programs/examples/fib.l8     '55'
  example "$tool" logic   programs/examples/logic.l8   'YYYY'
  example "$tool" string  programs/examples/string.l8  'Hi'
  example "$tool" i8      programs/examples/i8.l8      'Hi'
  example "$tool" bool    programs/examples/bool.l8    'TY10'
  example "$tool" enum    programs/examples/enum.l8    '9 10 0 3 0'
  example "$tool" forward programs/examples/forward.l8 '7'
  example "$tool" null    programs/examples/null.l8    'YYYY'
  example "$tool" narrow  programs/examples/narrow.l8  'YYYY'
  example "$tool" imports programs/examples/imports/main.l8 'Hi'
  example "$tool" byte    programs/examples/byte.l8    'YYYYY'
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
  example "$tool" callback-basic programs/callbacks/basic.l8 'callbacks OK'
  example "$tool" callback-native programs/callbacks/native.l8 'native fn OK'
  example "$tool" callback-effects programs/callbacks/effects.l8 'fn effects OK'
  example "$tool" or programs/examples/or.l8 'YYYY'
  example_exit "$tool" intmatch programs/examples/intmatch.l8 0
  "./$tool" fmt programs/examples/intmatch.l8 >"$BUILD/intmatch-formatted.l8"
  "./$tool" fmt "$BUILD/intmatch-formatted.l8" >"$BUILD/intmatch-formatted-again.l8"
  cmp -s "$BUILD/intmatch-formatted.l8" "$BUILD/intmatch-formatted-again.l8" || die 'integer match formatting is not stable'
  example_exit "$tool" intmatch-formatted "$BUILD/intmatch-formatted.l8" 0
  "./$tool" fmt programs/examples/match_format.l8 >"$BUILD/match-format.l8"
  "./$tool" fmt "$BUILD/match-format.l8" >"$BUILD/match-format-again.l8"
  cmp -s "$BUILD/match-format.l8" "$BUILD/match-format-again.l8" || die 'match arm reduction is not stable'
  grep -q 'Value v -> v.data;' "$BUILD/match-format.l8" || die 'single expression match arm kept its braces'
  grep -q '1 -> return 9;' "$BUILD/match-format.l8" || die 'single return match arm kept its braces'
  grep -q 'Value v -> {' "$BUILD/match-format.l8" || die 'scoped declaration match arm lost its braces'
  grep -q '^        1 -> {$' "$BUILD/match-format.l8" || die 'commented match arm lost its braces'
  grep -q 'Keep this comment with its block' "$BUILD/match-format.l8" || die 'match arm comment was lost'
  example_exit "$tool" match-format "$BUILD/match-format.l8" 0
  "./$tool" fmt programs/examples/control_format.l8 >"$BUILD/control-format.l8"
  "./$tool" fmt "$BUILD/control-format.l8" >"$BUILD/control-format-again.l8"
  cmp -s "$BUILD/control-format.l8" "$BUILD/control-format-again.l8" || die 'control body reduction is not stable'
  grep -q 'if (true) value = 1; else value = 2;' "$BUILD/control-format.l8" || die 'single if body kept its braces'
  grep -q 'while (false) value = 9;' "$BUILD/control-format.l8" || die 'single while body kept its braces'
  grep -q 'for i in 0..1 value = value + i;' "$BUILD/control-format.l8" || die 'single for body kept its braces'
  grep -q 'if (false) {' "$BUILD/control-format.l8" || die 'nested if lost its protective braces'
  grep -q 'if (true) local: int = value;' "$BUILD/control-format.l8" || die 'scoped declaration kept its braces'
  grep -q '^    if (true) {$' "$BUILD/control-format.l8" || die 'commented control body lost its braces'
  grep -q 'Keep this comment with its block' "$BUILD/control-format.l8" || die 'commented control body lost its comment'
  example_exit "$tool" control-format-source programs/examples/control_format.l8 0
  example_exit "$tool" control-format "$BUILD/control-format.l8" 0
  example_exit "$tool" control-scope programs/examples/control_scope.l8 0
  example_compile_fail "$tool" control-scope-if-leak programs/examples/control_scope_if_leak.l8 'undefined variable'
  example_compile_fail "$tool" control-scope-else-leak programs/examples/control_scope_else_leak.l8 'undefined variable'
  example_compile_fail "$tool" control-scope-while-leak programs/examples/control_scope_while_leak.l8 'undefined variable'
  example_compile_fail "$tool" intmatch-duplicate programs/examples/intmatch_duplicate.l8 'duplicate match arm'
  example_compile_fail "$tool" intmatch-missing-wildcard programs/examples/intmatch_missing_wildcard.l8 'integer match requires a wildcard arm'
  example_compile_fail "$tool" intmatch-range programs/examples/intmatch_range.l8 'match literal out of range'
  example "$tool" noreturn programs/examples/noreturn.l8 'Hi'
  example "$tool" global programs/examples/global.l8 'YYYYYY'
  example "$tool" bitwise programs/examples/bitwise.l8 'YYYYYYYYYYYY'
  example "$tool" float programs/examples/float.l8 'YYYYYYYYYYYYYY'
  example "$tool" manyf programs/examples/manyf.l8 'YYYYYYYYYYYYYYYY'
  example "$tool" i32 programs/examples/i32.l8 'YYYYYYYYYYYYY'
  example_compile_fail "$tool" mixfloat programs/examples/mixfloat.l8 'arithmetic type mismatch'
  example_compile_fail "$tool" mixnum programs/examples/mixnum.l8 'arithmetic type mismatch'
  example "$tool" expr programs/examples/expr.l8 'YYYYYYYYYYY'
  example "$tool" mlstr programs/examples/mlstr.l8 $'A\nB\nxy'
  check_retwarn "$tool"
  example "$tool" newarr programs/examples/newarr.l8 'Hi'
  example "$tool" offset programs/examples/offset.l8 'YYY'
  example "$tool" counted programs/examples/counted.l8 'YYYYYYY'
  example "$tool" str programs/examples/str.l8 'YYYYYYYYYYYY'
  example_compile_fail "$tool" strnul programs/examples/strnul.l8 'string literal cannot contain NUL'
  example_exit "$tool" cstrnul programs/examples/cstrnul.l8 1
  example_exit "$tool" strsentinel programs/examples/strsentinel.l8 1
  example "$tool" optslice programs/examples/optslice.l8 'YYYYY'
  example "$tool" narrowfill programs/examples/narrowfill.l8 'YYYY'
  example_compile_fail "$tool" narrowasgn programs/examples/narrowasgn.l8 'assignment type mismatch'
  example_compile_fail "$tool" optsliceidx programs/examples/optsliceidx.l8 'index of optional slice'
  example_compile_fail "$tool" optslicelen programs/examples/optslicelen.l8 'len of optional slice'
  example "$tool" for programs/examples/for.l8 'YYYYYYY'
  example "$tool" forrange programs/examples/forrange.l8 'YYYYYYYYY'
  example "$tool" forz programs/examples/forz.l8 ''
  example_compile_fail "$tool" forint programs/examples/forint.l8 'for requires str'
  example_compile_fail "$tool" forrangebad programs/examples/forrangebad.l8 'range end must be int'
  example_compile_fail "$tool" ptrindex programs/examples/ptrindex.l8 'pointer indexing is not allowed'
  example_compile_fail "$tool" usebefore programs/examples/usebefore.l8 'use of uninitialized local'
  example_compile_fail "$tool" newnofill programs/examples/newnofill.l8 'requires an initial value'
  example_compile_fail "$tool" bareglobal programs/examples/bareglobal.l8 'global requires an initializer'
  example_compile_fail "$tool" writeptr programs/examples/writeptr.l8 'of \*i8 is one byte'
  example_compile_fail "$tool" readstr programs/examples/readstr.l8 'buf must be mutable'
  example_compile_fail "$tool" strbytes programs/examples/strbytes.l8 'argument type mismatch'
  example_compile_fail "$tool" stackaddr programs/examples/stackaddr.l8 'address of local cannot escape'
  example_compile_fail "$tool" stash programs/examples/stash.l8 'use @immortal'
  example_compile_fail "$tool" stalenarrow programs/examples/stalenarrow.l8 'dereferencing optional pointer'
  example_compile_fail "$tool" nullalias programs/examples/nullalias.l8 'dereferencing optional pointer'
  example_compile_fail "$tool" zstore programs/examples/zstore.l8 'cannot assign through str'
  example_compile_fail "$tool" unknownfn programs/examples/unknownfn.l8 'unknown function'
  example_compile_fail "$tool" syscall programs/examples/syscall.l8 'unknown function'
  example_compile_fail "$tool" badopen programs/examples/badopen.l8 'argument type mismatch'
  example "$tool" local programs/examples/local.l8 'YYYYY'
  example "$tool" immortal programs/examples/immortal.l8 'Y'
  example "$tool" manyargs programs/examples/manyargs.l8 'YYYY'
  example_compile_fail "$tool" localesc programs/examples/localesc.l8 'address of local cannot escape'
  example_compile_fail "$tool" localbox programs/examples/localbox.l8 'cannot escape'
  example_compile_fail "$tool" atret programs/examples/atret.l8 'expected lifetime bound after @'
  example_compile_fail "$tool" retnew programs/examples/retnew.l8 'return of new requires @new'
  example_compile_fail "$tool" immparam programs/examples/immparam.l8 'omit bound'
  example_compile_fail "$tool" retbound programs/examples/retbound.l8 'return bound is @new'
  example "$tool" struct programs/examples/struct.l8 '3 12 13'
  example "$tool" clayout programs/examples/clayout.l8 'YYYYYYYYY'
  example "$tool" enumtag programs/examples/enumtag.l8 'YYYYYYYYYYYYY'
  example_compile_fail "$tool" enumtagdup programs/examples/enumtagdup.l8 'duplicate variant tag'
  example "$tool" arrlit programs/examples/arrlit.l8 'YYYYY'
  example_compile_fail "$tool" arrlitempty programs/examples/arrlitempty.l8 'array literal cannot be empty'
  example_compile_fail "$tool" arrlitmix programs/examples/arrlitmix.l8 'array element type mismatch'
  example "$tool" fixarr programs/examples/fixarr.l8 'YYYYYYYYYYYYYY'
  example_compile_fail "$tool" fixarr0 programs/examples/fixarr0.l8 'array length must be positive'
  example_compile_fail "$tool" fixarrlen programs/examples/fixarrlen.l8 'array literal length must match'
  example "$tool" aggcopy programs/examples/aggcopy.l8 'YYYYY'
  example "$tool" dynlink programs/examples/dynlink.l8 'Y'
  example "$tool" nestsum programs/examples/nestsum.l8 '1 2 3 9 4 5 6 7'
  example "$tool" exc programs/examples/exc.l8 'Hi'
  example "$tool" immheap programs/examples/immheap.l8 'Y'
  example_compile_fail "$tool" immheapmiss programs/examples/immheapmiss.l8 'missing noregion'
  example_compile_fail "$tool" immheapbad programs/examples/immheapbad.l8 'unnecessary noregion'
  example_compile_fail "$tool" immold programs/examples/immold.l8 'function mark is noregion'
  example "$tool" region programs/examples/region.l8 'YYYYYYY'
  example "$tool" exc_region programs/examples/exc_region.l8 'YYY'
  example_compile_fail "$tool" exc_regionbad programs/examples/exc_regionbad.l8 'exception payload cannot hold a region pointer'
  example_compile_fail "$tool" region_outer programs/examples/region_outer.l8 'region pointer cannot escape'
  example_compile_fail "$tool" region_ret programs/examples/region_ret.l8 'region pointer cannot escape'
  example_compile_fail "$tool" region_glob programs/examples/region_glob.l8 'region pointer cannot escape'
  example_compile_fail "$tool" region_inner programs/examples/region_inner.l8 'region pointer cannot escape'
  example_compile_fail "$tool" region_callimm programs/examples/region_callimm.l8 'cannot call from a region'
  example_compile_fail "$tool" region_badchild programs/examples/region_badchild.l8 'region pointer cannot escape'
  example_compile_fail "$tool" region_wrapstack programs/examples/region_wrapstack.l8 'address of local cannot escape'
  example_compile_fail "$tool" colonz programs/examples/colonz.l8 'expected a slice or fixed-array type'
  example_compile_fail "$tool" uninitkw programs/examples/uninitkw.l8 'undefined variable'
  example_exit "$tool" sliceoob programs/examples/sliceoob.l8 1
  example_exit "$tool" writeoob programs/examples/writeoob.l8 1
  example_exit "$tool" newwrap programs/examples/newwrap.l8 1
  check_tags "$tool"
}

check_tags() {
  local tool="$1" name f
  example "$tool" tags-declaration-only programs/examples/tags/declaration_only.l8 'declaration'
  example "$tool" tags-import-only programs/examples/tags/import_only.l8 'declaration'
  example "$tool" tags-late-file programs/examples/tags/late_file.l8 'late'
  example "$tool" tags-untagged-unused programs/examples/tags/untagged_unused.l8 'unused' 2>"$BUILD/tags-compile.err"
  if grep -q 'unused function' "$BUILD/tags-compile.err"; then die 'ordinary build emitted an unused function warning'; fi
  for name in call import use global type enum extern exception recursive; do
    example_compile_fail "$tool" "tags-untagged-$name" "programs/examples/tags/untagged_$name.l8" 'declaration has no tags'
  done
  example_compile_fail "$tool" tags-untagged-qualified programs/examples/tags/untagged_qualified.l8 'does not have tag app'
  if "./$tool" build programs/examples/tags/untagged_call.l8 -o "$BUILD/tags-invalid" 2>"$BUILD/tags-build.err"; then
    die 'build accepted an untagged reference'
  fi
  grep -q 'declaration has no tags' "$BUILD/tags-build.err" || die 'missing build tag diagnostic'
  if "./$tool" browse programs/examples/tags/untagged_import.l8 -o "$BUILD/tags-invalid.html" 2>"$BUILD/tags-browse.err"; then
    die 'browse accepted an untagged reference'
  fi
  grep -q 'untagged_import.l8:6:5:' "$BUILD/tags-browse.err" || die 'missing referring source location'
  example "$tool" tags-main programs/examples/tags/main.l8 'tags'
  example "$tool" tags-used programs/examples/tags/used.l8 'used'
  example "$tool" tags-implicit programs/examples/tags/implicit.l8 'implicit'
  example "$tool" tags-global programs/examples/tags/global.l8 'global'
  example "$tool" tags-shadow programs/examples/tags/shadow.l8 'shadow'
  # These are separate programs over one shared library, so unused-function
  # reachability must be the union of all of their entry points.
  local -a unused_entries=(
    programs/examples/tags/declaration_only.l8
    programs/examples/tags/import_only.l8
    programs/examples/tags/late_file.l8
    programs/examples/tags/untagged_unused.l8
    programs/examples/tags/main.l8
    programs/examples/tags/used.l8
    programs/examples/tags/implicit.l8
    programs/examples/tags/global.l8
    programs/examples/tags/shadow.l8
  )
  "./$tool" unused "${unused_entries[@]}" 2>"$BUILD/tags-unused.err"
  grep -q 'warning: programs/examples/tags/untagged_unused.l8:1:1: unused function unused' "$BUILD/tags-unused.err" || die 'expected project-wide unused function warning'
  if grep -q 'unused function tag_' "$BUILD/tags-unused.err"; then die 'function used by another entry point was reported unused'; fi
  for name in hidden_call hidden_global hidden_type hidden_literal hidden_enum \
      hidden_new hidden_sizeof hidden_raises hidden_raise hidden_catch local_leak \
      import_leak qualified_leak forward_hidden; do
    example_compile_fail "$tool" "tags-$name" "programs/examples/tags/$name.l8" 'is not in scope'
  done
  example_compile_fail "$tool" tags-wrong_tag programs/examples/tags/wrong_tag.l8 'does not have tag parser'
  example_compile_fail "$tool" tags-duplicate programs/examples/tags/duplicate.l8 'duplicate declaration same_name'
  example_compile_fail "$tool" tags-duplicate_kind programs/examples/tags/duplicate_kind.l8 'duplicate declaration SameName'
  example_compile_fail "$tool" tags-qualified_local programs/examples/tags/qualified_local.l8 'undefined variable'
  example_compile_fail "$tool" tags-qualified_builtin programs/examples/tags/qualified_builtin.l8 'does not have tag missing'
  example_compile_fail "$tool" tags-nested programs/examples/tags/nested.l8 'exactly two names'
  example_compile_fail "$tool" tags-qualified_definition programs/examples/tags/qualified_definition.l8 'expected unqualified declaration name'
  example_compile_fail "$tool" tags-builtin_collision programs/examples/tags/builtin_collision.l8 'cannot declare a builtin'
  example_compile_fail "$tool" tags-invalid_modifier programs/examples/tags/invalid_modifier.l8 'must precede a definition'
  example_compile_fail "$tool" tags-dangling_modifier programs/examples/tags/dangling_modifier.l8 'must precede a definition'

  # Format each file without following imports, then compile the formatted graph.
  mkdir -p "$BUILD/tags-fmt"
  for f in programs/examples/tags/*.l8; do
    name="${f##*/}"
    case "$name" in
      nested.l8|qualified_definition.l8|duplicate.l8|duplicate_kind.l8|builtin_collision.l8|invalid_modifier.l8|dangling_modifier.l8) continue ;;
    esac
    "./$tool" fmt "$f" >"$BUILD/tags-fmt/$name"
    "./$tool" fmt "$BUILD/tags-fmt/$name" >"$BUILD/tags-fmt/check"
    cmp -s "$BUILD/tags-fmt/$name" "$BUILD/tags-fmt/check" || die "tag formatting is not stable: $f"
  done
  example "$tool" tags-fmt-declaration "$BUILD/tags-fmt/declaration_only.l8" 'declaration'
  example "$tool" tags-fmt-late "$BUILD/tags-fmt/late_file.l8" 'late'
  example "$tool" tags-fmt-unused "$BUILD/tags-fmt/untagged_unused.l8" 'unused'
  example "$tool" tags-fmt-main "$BUILD/tags-fmt/main.l8" 'tags'
  example "$tool" tags-fmt-used "$BUILD/tags-fmt/used.l8" 'used'
  example "$tool" tags-fmt-implicit "$BUILD/tags-fmt/implicit.l8" 'implicit'
  example "$tool" tags-fmt-global "$BUILD/tags-fmt/global.l8" 'global'
  example "$tool" tags-fmt-shadow "$BUILD/tags-fmt/shadow.l8" 'shadow'
  "./$tool" browse programs/examples/tags/main.l8 -o "$BUILD/tags-browse.html"
  grep -q 'parser::' "$BUILD/tags-browse.html" || die 'browse lost tag qualifier'
  grep -q 'data-s=' "$BUILD/tags-browse.html" || die 'tag browse missing references'

  # Qualified calls retain the same link names in both compiler backends.
  "./$tool" compile programs/examples/tags/main.l8 >"$BUILD/tags-main.s"
  "./$tool" as -o "$BUILD/tags-main.o" "$BUILD/tags-main.s" runtime.s
  "./$tool" elfpack "$BUILD/tags-main.o" -o "$BUILD/tags-asm"
  run_expect "$BUILD/tags-asm" 'tags'
}

check_retwarn() {
  local tool="$1"
  local err="$BUILD/retwarn.err"
  local bin="$BUILD/retwarn"
  "./$tool" build programs/examples/retwarn.l8 -o "$bin" 2>"$err" || die "retwarn compile failed"
  grep -q 'warning: programs/examples/retwarn.l8:9:5: unnecessary return in id' "$err" || die "expected located unnecessary return in id"
  grep -q 'warning: programs/examples/retwarn.l8:17:5: ignored return value in drop' "$err" || die "expected located ignored return value in drop"
  grep -q 'warning: programs/examples/retwarn.l8:39:16: unnecessary return in both' "$err" || die "expected located unnecessary return in both"

  local boolint_err="$BUILD/boolint.err"
  "./$tool" boolint programs/examples/boolint.l8 2>"$boolint_err"
  grep -q 'int field enabled is used only as a boolean; use bool' "$boolint_err" || die 'expected bool-int field warning'
  grep -q 'int local on is used only as a boolean; use bool' "$boolint_err" || die 'expected bool-int parameter warning'
  grep -q 'int return value of choose is used only as a boolean; use bool' "$boolint_err" || die 'expected bool-int return warning'
  if grep -q 'count is used only as a boolean' "$boolint_err"; then die 'numeric int reported as boolean'; fi
  if grep -q 'unnecessary return in early' "$err"; then die "unexpected unnecessary return in early"; fi
  if grep -q 'ignored return value in side' "$err"; then die "unexpected ignored value on assignment"; fi
  if grep -q 'ignored return value in callp' "$err"; then die "unexpected ignored value on procedure call"; fi
  if grep -q 'ignored return value in id2' "$err"; then die "unexpected ignored value on last statement"; fi
  run_expect "$bin" 'YYYYYYY'
}

check_browse() {
  local tool="$1"
  local hello="$BUILD/browse-hello.html"
  local html="$BUILD/l8.html"
  "./$tool" browse programs/examples/hello.l8 -o "$hello" || die "browse hello failed"
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
  rm -f programs/examples/hello programs/examples/fib programs/examples/logic programs/examples/struct programs/examples/string programs/examples/i8 programs/examples/bool programs/examples/enum programs/examples/forward programs/examples/null programs/examples/newarr programs/examples/narrow programs/examples/nestsum programs/examples/noreturn programs/examples/exc
  rm -f programs/examples/*.s
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

do_examples() {
  ensure_build_dir
  build_stage1
  step 'examples [l8c1]' run_examples l8c1
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
  step 'Function values and C callbacks [l8c1]' python3 programs/callbacks/test_callbacks.py ./l8c1 "$BUILD/callbacks"
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
  "$tool" build programs/websocket/tests/unit.l8 -o "$BUILD/websocket/unit"
}

do_websocket() {
  ensure_build_dir
  if [[ -z "${L8C:-}" ]]; then build_stage1; fi
  step 'WebSocket client and server' build_websocket
}

do_websocket_test() {
  ensure_build_dir
  if [[ -z "${L8C:-}" ]]; then build_stage1; fi
  step 'WebSocket client, server, and unit test' build_websocket
  step 'WebSocket protocol, visibility, and TCP tests' env WEBSOCKET_BUILD="$BUILD/websocket" python3 -m unittest discover -s programs/websocket/tests -v
  step 'WebSocket codec vectors' "$BUILD/websocket/unit"
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

  step 'examples [l8c3]' run_examples_selfhost l8c3
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
  do_examples
  do_selfhost
  step 'block game [l8]' build_game l8
  print_summary
  echo 'OK'
}

usage() {
  cat <<'EOF'
Usage: ./build.sh [command] [--force] [--bench]

Commands:
  all             Install bootstrap, examples, two-stage self-host (default)
  bootstrap       Copy the saved bootstrap executable → l8c0
  examples        Build stage 1 and run example programs via l8c1
  game            Build programs/block-game/block-game.l8 → .build/block-game
  terminal        Build programs/terminal/terminal.l8 → .build/terminal
  terminal-test   Run terminal screen, PTY, and isolated headless Wayland tests
  callback-test   Test function values, lifetimes, and the C ABI (requires cc/as)
  http            Build programs/http client and server → .build/http/
  http-test       Verify downloaded specifications and run the HTTP test suite
  websocket       Build WebSocket client and server → .build/websocket/
  websocket-test  Run WebSocket codec, API visibility, and TCP tests
  selfhost        direct src1 → l8c1; src2 → l8c2; fmt src2; src2 → l8c3/l8c4; fixpoint l8c3==l8c4; examples; browse; phases
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
