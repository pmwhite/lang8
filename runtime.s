# L8 minimal runtime for Linux x86-64
# Provides: _start, syscall, malloc, read, write, open, close, exit, len
# Exceptions: l8_try_begin, l8_try_end, l8_raise, l8_exc_tag, l8_exc_ptr

.globl _start
.globl syscall
.globl malloc
.globl read
.globl write
.globl open
.globl close
.globl exit
.globl len
.globl l8_try_begin
.globl l8_try_end
.globl l8_raise
.globl l8_exc_tag
.globl l8_exc_ptr
.globl rdtsc

.section .bss
.align 8
heap_ptr:  .skip 8
heap_end:  .skip 8
.equ HEAP_SIZE, 64*1024*1024

# Current exception (set by l8_raise, read by catch codegen)
l8_exc_tag: .skip 8
l8_exc_ptr: .skip 8
# Top of handler stack (pointer to jmp_buf), or 0
l8_handler_top: .skip 8

#
# l8_jmp_buf layout (72 bytes), pointed to by l8_handler_top:
#   offset  0: rbx
#   offset  8: rbp
#   offset 16: r12
#   offset 24: r13
#   offset 32: r14
#   offset 40: r15
#   offset 48: rsp   (value after returning from l8_try_begin)
#   offset 56: rip   (return address into caller of l8_try_begin)
#   offset 64: prev  (previous l8_handler_top)
#

.section .text

# _start: call main(argc, argv), then exit with its return value
_start:
    mov (%rsp), %rdi       # argc
    lea 8(%rsp), %rsi      # argv
    push %rdi
    push %rsi

    mov $12, %rax          # brk
    mov $0, %rdi
    syscall
    mov %rax, heap_ptr(%rip)
    lea HEAP_SIZE(%rax), %rdi
    mov %rdi, heap_end(%rip)
    mov $12, %rax
    syscall

    pop %rsi
    pop %rdi
    # Counted argv: length word at -8 so main(argc, argv: [][z]i8) can use len.
    # View-style [argc][z]i8 still works; it ignores the prefix and uses argc.
    push %rdi
    push %rsi
    mov %rdi, %rax
    add %rax, %rax
    add %rax, %rax
    add %rax, %rax
    add $8, %rax
    mov %rax, %rdi
    call malloc
    pop %rsi
    pop %rdi
    mov %rdi, 0(%rax)
    lea 8(%rax), %rdx
    push %rdi
    push %rdx
    mov %rdi, %rcx
.Largv_copy:
    cmp $0, %rcx
    je .Largv_done
    mov 0(%rsi), %r8
    mov %r8, 0(%rdx)
    add $8, %rsi
    add $8, %rdx
    sub $1, %rcx
    jmp .Largv_copy
.Largv_done:
    pop %rsi
    pop %rdi
    call main
    mov %rax, %rdi
    mov $60, %rax          # exit
    syscall

# long syscall(long nr, long a1, long a2, long a3, long a4, long a5)
# Sixth syscall arg is always 0. Enough for open/read/write/close/exit.
syscall:
    mov %rdi, %rax
    mov %rsi, %rdi
    mov %rdx, %rsi
    mov %rcx, %rdx
    mov %r8, %r10
    mov %r9, %r8
    mov $0, %r9
    syscall
    ret

# void *malloc(long size) — bump allocator, 8-byte aligned
malloc:
    mov heap_ptr(%rip), %rax
    add $7, %rdi
    and $-8, %rdi
    mov %rax, %rcx
    add %rdi, %rcx
    cmp heap_end(%rip), %rcx
    ja 1f
    mov %rcx, heap_ptr(%rip)
    ret
1:
    mov $0, %rax
    ret

# long len(*i8 s) — length prefix at s-8 (for length-prefixed literals / strdup)
len:
    mov -8(%rdi), %rax
    ret

# long read(long fd, void *buf, long n)
read:
    mov $0, %rax
    syscall
    ret

# long write(long fd, void *buf, long n)
write:
    mov $1, %rax
    syscall
    ret

# long open(char *path, long flags, long mode)
open:
    mov $2, %rax
    syscall
    ret

# long close(long fd)
close:
    mov $3, %rax
    syscall
    ret

# void exit(long code) — does not return
exit:
    mov $60, %rax
    syscall

# int l8_try_begin(void *buf) — like setjmp; returns 0 first time, nonzero on catch
# rdi = buf (l8_jmp_buf)
l8_try_begin:
    mov %rbx, 0(%rdi)
    mov %rbp, 8(%rdi)
    mov %r12, 16(%rdi)
    mov %r13, 24(%rdi)
    mov %r14, 32(%rdi)
    mov %r15, 40(%rdi)
    # rsp after ret = current rsp + 8
    lea 8(%rsp), %rax
    mov %rax, 48(%rdi)
    # return address
    mov (%rsp), %rax
    mov %rax, 56(%rdi)
    # push onto handler stack
    mov l8_handler_top(%rip), %rax
    mov %rax, 64(%rdi)
    mov %rdi, l8_handler_top(%rip)
    mov $0, %rax
    ret

# void l8_try_end(void) — pop handler if still on top
l8_try_end:
    mov l8_handler_top(%rip), %rdi
    test %rdi, %rdi
    jz 1f
    mov 64(%rdi), %rax
    mov %rax, l8_handler_top(%rip)
1:
    ret

# void l8_raise(long tag, void *ptr) — noreturn
# Sets globals and longjmps to top handler; if none, exit(1).
l8_raise:
    mov %rdi, l8_exc_tag(%rip)
    mov %rsi, l8_exc_ptr(%rip)
    mov l8_handler_top(%rip), %rdi
    test %rdi, %rdi
    jz 2f
    # pop this handler
    mov 64(%rdi), %rax
    mov %rax, l8_handler_top(%rip)
    # restore callee-saved + stack
    mov 0(%rdi), %rbx
    mov 8(%rdi), %rbp
    mov 16(%rdi), %r12
    mov 24(%rdi), %r13
    mov 32(%rdi), %r14
    mov 40(%rdi), %r15
    mov 56(%rdi), %rcx       # rip
    mov 48(%rdi), %rsp
    mov $1, %rax             # nonzero = catch
    jmp *%rcx
2:
    mov $1, %rdi
    mov $60, %rax
    syscall

# int rdtsc(): invariant TSC in rax. Encoded with .byte so older assemblers can
# parse this file.  rdtsc; shl $32, %rdx; or %rdx, %rax
rdtsc:
    .byte 15,49
    .byte 72,193,226,32
    .byte 72,9,208
    ret
