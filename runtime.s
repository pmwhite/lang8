# L8 minimal runtime for Linux x86-64
# Provides: _start, syscall, malloc, loadb, storeb, read, write, open, close, exit

.globl _start
.globl syscall
.globl malloc
.globl loadb
.globl storeb
.globl read
.globl write
.globl open
.globl close
.globl exit
.globl len

.section .bss
.align 8
heap_ptr:  .skip 8
heap_end:  .skip 8
.equ HEAP_SIZE, 64*1024*1024

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

# int loadb(int addr)
loadb:
    movzb (%rdi), %rax
    ret

# int storeb(int addr, int val)
storeb:
    mov %sil, (%rdi)
    mov $0, %rax
    ret


# long len(string s) — length prefix at s-8
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
