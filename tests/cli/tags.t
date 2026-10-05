Tags control which declarations a reference can see. These commands only read
the fixtures, so run them from the repository root:

  $ cd $TESTDIR/../..

An ordinary compile does not report unused functions, even untagged ones:

  $ l8 compile tests/compiler/tags/untagged_unused.l8 > /dev/null

A reference to an untagged declaration is an error in builds and in browse,
located at the reference:

  $ l8 compile tests/compiler/tags/untagged_call.l8 > /dev/null
  error: tests/compiler/tags/untagged_call.l8:7:5: declaration hidden is not in scope; declaration has no tags; add a file tag or declaration tag
  [1]
  $ l8 browse tests/compiler/tags/untagged_import.l8 -o $OLDPWD/invalid.html
  error: tests/compiler/tags/untagged_import.l8:6:5: declaration hidden is not in scope; declaration has no tags; add a file tag or declaration tag
  [1]

These are separate programs over one shared library, so unused-function
reachability is the union of all of their entry points and tests:

  $ l8 unused tests/compiler/tags/declaration_only.l8 tests/compiler/tags/import_only.l8 \
  >     tests/compiler/tags/late_file.l8 tests/compiler/tags/untagged_unused.l8 \
  >     tests/compiler/tags/main.l8 tests/compiler/tags/used.l8 tests/compiler/tags/implicit.l8 \
  >     tests/compiler/tags/global.l8 tests/compiler/tags/shadow.l8 2>&1 | grep -v ' stdlib/'
  warning: tests/compiler/tags/untagged_unused.l8:3:1: unused function unused

Browse keeps tag qualifiers and links references:

  $ l8 browse tests/compiler/tags/main.l8 -o $OLDPWD/main.html
  $ grep -o 'parser::' $OLDPWD/main.html | head -n 1
  parser::
  $ grep -c 'data-s=' $OLDPWD/main.html | sed 's/^[1-9][0-9]*$/some/'
  some

Formatting each file on its own (without following imports) is stable, and the
formatted files pass their tests. Copy the repository layout so relative
imports resolve:

  $ cd - > /dev/null
  $ ln -s $TESTDIR/../../stdlib stdlib && mkdir -p tests/compiler/tags && cd tests/compiler/tags
  $ for f in $TESTDIR/../compiler/tags/*.l8; do
  >     name=${f##*/}
  >     case $name in
  >         nested.l8|qualified_definition.l8|duplicate.l8|duplicate_kind.l8|builtin_collision.l8|invalid_modifier.l8|dangling_modifier.l8) continue ;;
  >     esac
  >     l8 fmt $f > $name
  >     l8 fmt $name | cmp - $name || echo "$name is not stable"
  > done
  $ l8 test declaration_only.l8 late_file.l8 untagged_unused.l8 main.l8 used.l8 implicit.l8 global.l8 shadow.l8
  8 files, 8 tests

Qualified calls keep the same link names through the textual backend. The
built-in assembler does not cover every SSE instruction, so leave out the
test, which imports the standard library:

  $ sed -e '/stdlib\/print.l8/d' -e '/^test "main"/,$d' main.l8 > asm_main.l8
  $ l8 compile asm_main.l8 > main.s
  $ l8 as -o main.o main.s $TESTDIR/../../runtime.s $TESTDIR/../../stdlib/write.s
  $ l8 elfpack main.o -o main && ./main
  tags
