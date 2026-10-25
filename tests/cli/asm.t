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

Vector registers and indirect-call operands are not interchangeable:

  $ printf 'call %%xmm0\n' > bad.s; l8 as -o bad.o bad.s
  l8as: bad jump target
  [1]
  $ printf 'movdqu (%%rax), *%%rax\n' > bad.s; l8 as -o bad.o bad.s
  l8as: bad movdqu operands
  [1]

Repeated word copies preserve every word, and repeated stores zero them:

  $ cat > rep.s <<'ASM'
  > .section .data
  > source:
  > .quad -1
  > .quad 42
  > target:
  > .quad 0
  > .quad 0
  > .section .text
  > .globl _start
  > _start:
  > lea source(%rip), %rsi
  > lea target(%rip), %rdi
  > mov $2, %rcx
  > cld
  > rep movsq
  > lea target(%rip), %rsi
  > mov (%rsi), %rax
  > cmp $-1, %rax
  > jne bad
  > mov 8(%rsi), %rax
  > cmp $42, %rax
  > jne bad
  > lea target(%rip), %rdi
  > xor %rax, %rax
  > mov $2, %rcx
  > rep stosq
  > mov (%rsi), %rax
  > cmp $0, %rax
  > jne bad
  > mov 8(%rsi), %rax
  > cmp $0, %rax
  > jne bad
  > xor %rdi, %rdi
  > mov $60, %rax
  > syscall
  > bad:
  > mov $1, %rdi
  > mov $60, %rax
  > syscall
  > ASM
  $ l8 as -o rep.o rep.s
  $ l8 elfpack rep.o -o rep
  $ ./rep
