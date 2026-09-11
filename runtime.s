# L8 minimal runtime for Linux x86-64
# Provides: _start, syscall, malloc, read, write, open, open_nul, close, exit, len
#           clock_gettime, getrusage, rdtsc
# Exceptions: l8_try_begin, l8_try_end, l8_raise, l8_exc_tag, l8_exc_ptr

.globl _start
.globl syscall
.globl malloc
.globl read
.globl write
.globl open
.globl open_nul
.globl close
.globl exit
.globl len
.globl clock_gettime
.globl getrusage
.globl l8_memcpy
.globl l8_try_begin
.globl l8_try_end
.globl l8_raise
.globl l8_exc_tag
.globl l8_exc_ptr
.globl l8_heap_mark
.globl l8_heap_reset
.globl l8_region_push
.globl l8_region_pop
.globl l8_exc_malloc
.globl rdtsc
.globl l8_as_int
.globl l8_call
.globl l8_load64

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
# Nested region marks (heap_ptr at each enter). Raise pops down to the
# catcher's snapshot so a caught exception still rewinds those heaps.
l8_region_n: .skip 8
l8_region_marks: .skip 512
# region_n at each try_begin, parallel to the handler stack (jmp_buf stays 72)
l8_try_rn: .skip 8
l8_try_regions: .skip 512

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

    # mmap, not brk: libc malloc also uses the program break, and a
    # dynlinked need "libX11" / libGL process will corrupt Mesa's
    # FBConfig list if we steal brk for the bump heap.
    mov $0, %rdi
    mov $0, %rsi
    lea HEAP_SIZE(%rsi), %rsi
    mov $3, %rdx           # PROT_READ|PROT_WRITE
    mov $34, %r10          # MAP_PRIVATE|MAP_ANONYMOUS
    mov $-1, %r8
    mov $0, %r9
    mov $9, %rax           # mmap
    syscall
    mov %rax, heap_ptr(%rip)
    lea HEAP_SIZE(%rax), %rdi
    mov %rdi, heap_end(%rip)

    pop %rsi
    pop %rdi
    # Counted argv: length word at -8 so main(argc, argv: [][z]i8) can use len.
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

# long l8_heap_mark(void) — current bump pointer
l8_heap_mark:
    mov heap_ptr(%rip), %rax
    ret

# void l8_heap_reset(long mark) — rewind the bump allocator
l8_heap_reset:
    mov %rdi, heap_ptr(%rip)
    ret

# void l8_region_push(long mark) — record a region enter
l8_region_push:
    mov l8_region_n(%rip), %rax
    cmp $63, %rax
    ja 1f
    lea l8_region_marks(%rip), %rcx
    mov %rax, %rdx
    shl $3, %rdx
    add %rdx, %rcx
    mov %rdi, 0(%rcx)
    add $1, %rax
    mov %rax, l8_region_n(%rip)
    ret
1:
    mov $1, %rdi
    mov $60, %rax
    syscall

# void l8_region_pop(void) — leave one region and rewind
l8_region_pop:
    mov l8_region_n(%rip), %rax
    test %rax, %rax
    jz 1f
    sub $1, %rax
    mov %rax, l8_region_n(%rip)
    lea l8_region_marks(%rip), %rcx
    mov %rax, %rdx
    shl $3, %rdx
    add %rdx, %rcx
    mov 0(%rcx), %rdi
    mov %rdi, heap_ptr(%rip)
1:
    ret

# void *l8_exc_malloc(long size) — bump down from heap_end so region rewind
# cannot free an in-flight exception payload.
l8_exc_malloc:
    add $7, %rdi
    and $-8, %rdi
    mov heap_end(%rip), %rax
    sub %rdi, %rax
    mov heap_ptr(%rip), %rcx
    cmp %rax, %rcx
    ja 1f
    mov %rax, heap_end(%rip)
    ret
1:
    mov $0, %rax
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

# void l8_memcpy(void *dst, void *src, long n) — rdi, rsi, rdx
# Word then byte. ja after cmp $7 so n>=8 without jae (bootstrap as has no jae).
# Named l8_memcpy so it does not collide with a user memcpy in src1.
l8_memcpy:
    mov %rdx, %rcx
.Lmemcpy_words:
    cmp $7, %rcx
    ja .Lmemcpy_word
    jmp .Lmemcpy_bytes
.Lmemcpy_word:
    mov 0(%rsi), %rax
    mov %rax, 0(%rdi)
    add $8, %rsi
    add $8, %rdi
    sub $8, %rcx
    jmp .Lmemcpy_words
.Lmemcpy_bytes:
    cmp $0, %rcx
    je .Lmemcpy_done
    movzb 0(%rsi), %rax
    mov %al, 0(%rdi)
    add $1, %rsi
    add $1, %rdi
    sub $1, %rcx
    jmp .Lmemcpy_bytes
.Lmemcpy_done:
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

# long open_nul(char *path, long flags, long mode) — same as open; []i8 data pointer
open_nul:
    jmp open

# long clock_gettime(long clk, struct timespec *ts)
clock_gettime:
    mov $228, %rax
    syscall
    ret

# long getrusage(void *buf) — RUSAGE_SELF into buf (struct rusage)
getrusage:
    mov %rdi, %rsi
    mov $0, %rdi
    mov $98, %rax
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

# void l8_exit(long code) — same syscall; name does not collide with libc exit
l8_exit:
    mov $60, %rax
    syscall
    jmp l8_exit

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
    # region depth at this try — raise pops regions entered after it
    mov l8_try_rn(%rip), %rax
    cmp $63, %rax
    ja 2f
    lea l8_try_regions(%rip), %rcx
    mov %rax, %rdx
    shl $3, %rdx
    add %rdx, %rcx
    mov l8_region_n(%rip), %rdx
    mov %rdx, 0(%rcx)
    add $1, %rax
    mov %rax, l8_try_rn(%rip)
    # push onto handler stack
    mov l8_handler_top(%rip), %rax
    mov %rax, 64(%rdi)
    mov %rdi, l8_handler_top(%rip)
    mov $0, %rax
    ret
2:
    mov $1, %rdi
    mov $60, %rax
    syscall

# void l8_try_end(void) — pop handler if still on top
l8_try_end:
    mov l8_handler_top(%rip), %rdi
    test %rdi, %rdi
    jz 1f
    mov 64(%rdi), %rax
    mov %rax, l8_handler_top(%rip)
    mov l8_try_rn(%rip), %rax
    test %rax, %rax
    jz 1f
    sub $1, %rax
    mov %rax, l8_try_rn(%rip)
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
    # rewind regions entered after this try (payload lives at heap_end)
    mov l8_try_rn(%rip), %rax
    test %rax, %rax
    jz .Lraise_unw_done
    sub $1, %rax
    mov %rax, l8_try_rn(%rip)
    lea l8_try_regions(%rip), %rcx
    mov %rax, %rdx
    shl $3, %rdx
    add %rdx, %rcx
    mov 0(%rcx), %r8
.Lraise_unw:
    mov l8_region_n(%rip), %rax
    cmp %r8, %rax
    ja .Lraise_unw_pop
    jmp .Lraise_unw_done
.Lraise_unw_pop:
    sub $1, %rax
    mov %rax, l8_region_n(%rip)
    lea l8_region_marks(%rip), %rcx
    mov %rax, %rdx
    shl $3, %rdx
    add %rdx, %rcx
    mov 0(%rcx), %r9
    mov %r9, heap_ptr(%rip)
    jmp .Lraise_unw
.Lraise_unw_done:
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

# int l8_as_int(*i8): identity, so a slice data pointer can be stored in int
# (glShaderSource's const char **, GLX proc addresses, …).
l8_as_int:
    mov %rdi, %rax
    ret

# int l8_load64(*i8, off): *(int *)(p + off)
l8_load64:
    add %rsi, %rdi
    mov (%rdi), %rax
    ret

# l8_call(fn, a0, a1, a2, a3, a4): tail-call fn with those five GPRs.
# For addresses from glXGetProcAddress. Extra args are not supported.
l8_call:
    mov %rdi, %r11
    mov %rsi, %rdi
    mov %rdx, %rsi
    mov %rcx, %rdx
    mov %r8, %rcx
    mov %r9, %r8
    mov $0, %r9
    jmp *%r11
