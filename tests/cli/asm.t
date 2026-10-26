The textual backend and the built-in assembler agree with the direct
backend. Bulk stores assemble from `compile` output and run. The built-in
assembler does not cover every SSE instruction, so leave out the fixture's
test, which imports the standard library:

  $ R=$TESTDIR/../..
  $ sed -e '/stdlib\/print.l8/d' -e '/^test "main"/,$d' $R/tests/compiler/codegen_bulk_assembly.l8 > bulk.l8
  $ l8 compile bulk.l8 > bulk.s
  $ l8 as -o bulk.o bulk.s $R/runtime.s
  $ l8 elfpack bulk.o -o bulk
  $ ./bulk; echo "exit $?"
  exit 0

Byte-sized enum tags preserve their payloads through textual assembly too:

  $ sed -e '/stdlib\/print.l8/d' -e '/^test "main"/,$d' $R/tests/compiler/codegen_byte_enum_tags.l8 > byte-enum.l8
  $ l8 compile byte-enum.l8 > byte-enum.s
  $ l8 as -o byte-enum.o byte-enum.s $R/runtime.s
  $ l8 elfpack byte-enum.o -o byte-enum
  $ ./byte-enum; echo "exit $?"
  exit 0

Vector registers and indirect-call operands are not interchangeable:

  $ printf 'call %%xmm0\n' > bad.s; l8 as -o bad.o bad.s
  l8as: bad jump target
  [1]
  $ printf 'movdqu (%%rax), *%%rax\n' > bad.s; l8 as -o bad.o bad.s
  l8as: bad movdqu operands
  [1]
