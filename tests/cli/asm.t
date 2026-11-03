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

Dense integer dispatch also works through the textual assembler path:

  $ sed -e '/stdlib\/print.l8/d' -e '/^test /,$d' $R/tests/compiler/codegen_dense_match.l8 > dense.l8
  $ l8 compile dense.l8 > dense.s
  $ l8 as -o dense.o dense.s $R/runtime.s
  $ l8 elfpack dense.o -o dense
  $ ./dense; echo "exit $?"
  exit 0

Vector registers and indirect-call operands are not interchangeable:

  $ printf 'call %%xmm0\n' > bad.s; l8 as -o bad.o bad.s
  l8as: bad jump target
  [1]
  $ printf 'movdqu (%%rax), *%%rax\n' > bad.s; l8 as -o bad.o bad.s
  l8as: bad movdqu operands
  [1]

Indexed addresses preserve extended register bits, displacements, byte loads
and stores, and cmp takes a memory operand in AT&T order:

  $ cat > indexed.s <<'ASM'
  > .section .data
  > words:
  > .quad 11
  > .quad 22
  > .quad 33
  > .section .text
  > .globl _start
  > _start:
  > lea words(%rip), %r13
  > mov $2, %r12
  > lea (%r13,%r12,8), %rax
  > mov (%rax), %rax
  > cmp $33, %rax
  > jne bad
  > mov -8(%r13,%r12,8), %r14
  > cmp $22, %r14
  > jne bad
  > movzb (%r13,%r12,8), %r15
  > cmp $33, %r15
  > jne bad
  > mov %r13, %rbp
  > mov (%rbp,%r12,4), %rax
  > cmp $22, %rax
  > jne bad
  > mov $77, %r15
  > mov %r15, (%r13,%r12,8)
  > mov 16(%r13), %rax
  > cmp $77, %rax
  > jne bad
  > cmp 8(%r13), %r12
  > jae bad
  > mov $30, %r14
  > cmp 8(%r13), %r14
  > jb bad
  > xor %rdi, %rdi
  > mov $60, %rax
  > syscall
  > bad:
  > mov $1, %rdi
  > mov $60, %rax
  > syscall
  > ASM
  $ l8 as -o indexed.o indexed.s; l8 elfpack indexed.o -o indexed
  $ ./indexed; echo "exit $?"
  exit 0
  $ printf 'lea (%%rax,%%rcx,3), %%rax\n' > bad.s; l8 as -o bad.o bad.s
  l8as: address scale must be 1, 2, 4 or 8
  [1]
  $ printf 'lea (%%rax,%%rsp,8), %%rax\n' > bad.s; l8 as -o bad.o bad.s
  l8as: bad indexed address register
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
