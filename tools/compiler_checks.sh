#!/usr/bin/env bash
# Specialized compiler checks that are not single-file fixtures:
#   tools/compiler_checks.sh GROUP TOOL
# GROUP is format, lint, asm, tags, or browse. Groups use separate output
# files, so make can run them concurrently. Fixture-style outputs they
# produce are checked with tools/expect.py at the end of each group.
set -euo pipefail

group="$1"
tool="$2"
BUILD="${BUILD:-.build}"
mkdir -p "$BUILD"

die() { echo "error: $*" >&2; exit 1; }

run_expect() {
  local got
  got="$("$1")"
  if [[ "$got" != "$2" ]]; then
    die "$1 printed $(printf %q "$got"), expected $(printf %q "$2")"
  fi
}

declare -a EXPECT_SOURCES=()

expect_source() {
  EXPECT_SOURCES+=("$2")
}

flush_expect_sources() {
  local tool="$1"
  if [[ "${#EXPECT_SOURCES[@]}" -gt 0 ]]; then
    python3 tools/expect.py "./$tool" "$BUILD/expect-$group" "${EXPECT_SOURCES[@]}"
    EXPECT_SOURCES=()
  fi
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

//% test: run
//% stdout: ""
//% exit: 0
//% compiler-warnings: ["unused local i in main", "unused local scratch in main", "unnecessary return in id"]
EOF
  expect_source "$tool" "$BUILD/optional-semi.l8"
  "./$tool" fmt "$BUILD/optional-semi.l8" >"$BUILD/optional-semi-formatted.l8"
  grep -q '^tag example;$' "$BUILD/optional-semi-formatted.l8" || die 'file tag lost its required semicolon'
  grep -q '^    return 3$' "$BUILD/optional-semi-formatted.l8" || die 'final return kept its semicolon'
  grep -q '^    if (true) return else return$' "$BUILD/optional-semi-formatted.l8" || die 'return before else kept its semicolon'
  grep -q '^        2 -> value = value + 1;$' "$BUILD/optional-semi-formatted.l8" || die 'non-final match arm lost its semicolon'
  grep -q '^        _ -> value = 9$' "$BUILD/optional-semi-formatted.l8" || die 'final match arm kept its semicolon'
  grep -q '^    0$' "$BUILD/optional-semi-formatted.l8" || die 'final expression kept its semicolon'
  expect_source "$tool" "$BUILD/optional-semi-formatted.l8"
  for declaration in 'value: int = 1' 'extern foreign(): int' 'exception Empty' 'need "libnothing.so"' 'import "unused.l8"' 'type Choice = | A | B'; do
    printf 'tag example;\nmain(): int { 0; }\n%s\n' "$declaration" >"$BUILD/optional-semi-eof.l8"
    "./$tool" fmt "$BUILD/optional-semi-eof.l8" >"$BUILD/optional-semi-eof-formatted.l8"
    if tail -n 1 "$BUILD/optional-semi-eof-formatted.l8" | grep -q ';$'; then die "EOF semicolon kept for $declaration"; fi
  done
  printf 'tag example;\nmain(): int { value: int = 1 value }\n' >"$BUILD/optional-semi-required.l8"
  example_compile_fail "$tool" optional-semi-required "$BUILD/optional-semi-required.l8" 'unexpected token'
}

check_retwarn() {
  local tool="$1"
  local err="$BUILD/retwarn.err"
  local bin="$BUILD/retwarn"
  "./$tool" build tests/compiler/retwarn.l8 -o "$bin" 2>"$err" || die "retwarn compile failed"
  grep -q 'warning: tests/compiler/retwarn.l8:11:5: unnecessary return in id' "$err" || die "expected located unnecessary return in id"
  grep -q 'warning: tests/compiler/retwarn.l8:19:5: ignored return value in drop' "$err" || die "expected located ignored return value in drop"
  grep -q 'warning: tests/compiler/retwarn.l8:41:16: unnecessary return in both' "$err" || die "expected located unnecessary return in both"

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
  grep -q 'warning: tests/compiler/tags/untagged_unused.l8:3:1: unused function unused' "$BUILD/tags-unused.err" || die 'expected project-wide unused function warning'
  if grep -q 'unused function tag_' "$BUILD/tags-unused.err"; then die 'function used by another entry point was reported unused'; fi

  # Format each file without following imports, then compile the formatted graph.
  mkdir -p "$BUILD/tags-fmt"
  for f in tests/compiler/tags/*.l8; do
    name="${f##*/}"
    case "$name" in
      nested.l8|qualified_definition.l8|duplicate.l8|duplicate_kind.l8|builtin_collision.l8|invalid_modifier.l8|dangling_modifier.l8) continue ;;
    esac
    "./$tool" fmt "$f" >"$BUILD/tags-fmt/$name"
    sed -i 's|../../../stdlib/raw_write.l8|../../stdlib/raw_write.l8|' "$BUILD/tags-fmt/$name"
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
  "./$tool" as -o "$BUILD/tags-main.o" "$BUILD/tags-main.s" runtime.s stdlib/write.s
  "./$tool" elfpack "$BUILD/tags-main.o" -o "$BUILD/tags-asm"
  run_expect "$BUILD/tags-asm" 'tags'
  flush_expect_sources "$tool"
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

check_format() {
  local tool="$1"
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
  "./$tool" fmt tests/compiler/bounds_index_forms.l8 >"$BUILD/index-forms-formatted.l8"
  "./$tool" fmt "$BUILD/index-forms-formatted.l8" >"$BUILD/index-forms-formatted-again.l8"
  cmp -s "$BUILD/index-forms-formatted.l8" "$BUILD/index-forms-formatted-again.l8" || die 'index formatting is not stable'
  grep -Fq '&a[i]' "$BUILD/index-forms-formatted.l8" || die 'indexed address was not formatted'
  grep -Fq 'row[j]' "$BUILD/index-forms-formatted.l8" || die 'nested indexing was not formatted'
  expect_source "$tool" "$BUILD/index-forms-formatted.l8"
  check_optional_semis "$tool"
  flush_expect_sources "$tool"
}

check_lint() {
  local tool="$1"
  "./$tool" forlint tests/compiler/forlint.l8 2>"$BUILD/forlint.err"
  grep -q 'while loop can use for i in 0..end' "$BUILD/forlint.err" || die 'missing ranged for suggestion'
  grep -q 'while loop can use for item in xs' "$BUILD/forlint.err" || die 'missing collection for suggestion'
  [[ "$(grep -c 'while loop can use' "$BUILD/forlint.err")" -eq 2 ]] || die 'unexpected for-loop suggestion'
  check_retwarn "$tool"
  flush_expect_sources "$tool"
}

check_asm() {
  local tool="$1"
  # Bulk stores have equivalent encodings through text and direct backends.
  "./$tool" compile tests/compiler/codegen_bulk_assembly.l8 >"$BUILD/bulk-fill.s"
  "./$tool" as -o "$BUILD/bulk-fill.o" "$BUILD/bulk-fill.s" runtime.s
  "./$tool" elfpack "$BUILD/bulk-fill.o" -o "$BUILD/bulk-fill-asm"
  run_expect "$BUILD/bulk-fill-asm" ''
  # Vector registers and indirect-call operands must not be confused.
  local invalid_insn
  for invalid_insn in 'call %xmm0' 'movdqu (%rax), *%rax'; do
    printf '%s\n' "$invalid_insn" >"$BUILD/invalid-operand.s"
    if "./$tool" as -o "$BUILD/invalid-operand.o" "$BUILD/invalid-operand.s" >"$BUILD/invalid-operand.log" 2>&1; then
      die "assembler accepted invalid operand: $invalid_insn"
    fi
  done
}

case "$group" in
  format) check_format "$tool" ;;
  lint) check_lint "$tool" ;;
  asm) check_asm "$tool" ;;
  tags) check_tags "$tool" ;;
  browse) check_browse "$tool" ;;
  *) die "unknown check group: $group" ;;
esac
