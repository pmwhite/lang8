# L8 minimal runtime for Linux x86-64
# Provides: _start, syscall, malloc, read, l8_os_write, open, open_nul, close, exit, len
#           l8_str_eq, l8_opt_str_eq, l8_cstr, l8_bytes
#           clock_gettime, getrusage, rdtsc
# Exceptions: l8_try_begin, l8_try_end, l8_raise, l8_exc_tag, l8_exc_ptr

.globl _start
.globl syscall
.globl malloc
.globl read
.globl l8_os_write
.globl open
.globl open_nul
.globl close
.globl exit
.globl len
.globl clock_gettime
.globl getrusage
.globl l8_memcpy
.globl l8_clock_gettime
.globl l8_poll
.globl l8_recv
.globl l8_send
.globl l8_getrandom
.globl l8_shutdown
.globl l8_socket
.globl l8_connect
.globl l8_bind
.globl l8_listen
.globl l8_accept4
.globl l8_setsockopt
.globl l8_getsockopt
.globl l8_fork
.globl l8_waitpid
.globl l8_ioctl
.globl l8_ioctl_value
.globl l8_fcntl
.globl l8_setsid
.globl l8_dup2
.globl l8_execve
.globl l8_kill
.globl l8_environment
.globl l8_time
.globl l8_try_begin
.globl l8_try_end
.globl l8_raise
.globl l8_exc_tag
.globl l8_exc_ptr
.globl l8_heap_mark
.globl l8_heap_used
.globl l8_heap_reset
.globl l8_region_push
.globl l8_region_pop
.globl l8_exc_malloc
.globl rdtsc
.globl l8_as_int
.globl l8_call
.globl l8_load64
.globl l8_str_eq
.globl l8_opt_str_eq
.globl l8_cstr
.globl l8_bytes
.globl l8_arena_new
.globl l8_arena_drop
.globl l8_arena_live
.globl l8_own_enter
.globl l8_own_commit
.globl l8_borrow_enter
.globl l8_alloc_enter
.globl l8_arena_suspend
.globl l8_arena_resume
.globl l8_reserve_bytes
.globl l8_region_depth
.globl l8_region_unwind

.section .bss
.align 8
heap_ptr:  .skip 8
heap_base: .skip 8
heap_end:  .skip 8
initial_envp: .skip 8
.equ HEAP_SIZE, 768*1024*1024

# Current exception (set by l8_raise, read by catch codegen)
l8_exc_tag: .skip 8
l8_exc_ptr: .skip 8
# Top of handler stack (pointer to jmp_buf), or 0
l8_handler_top: .skip 8
# Nested region marks (heap_ptr at each enter). Raise pops down to the
# catcher's snapshot so a caught exception still rewinds those heaps.
l8_region_n: .skip 8
# Frames are 32 bytes: kind, a, b, saved chunk. Kinds: 0 region (b the heap's
# mark), 1 own, 2 allocate, 3 borrow, 4 suspend, 5 a region entered in an arena
# (a the arena, suspended while it lasts; b the heap's mark). 64 frames.
l8_region_marks: .skip 2048
l8_arena_current: .skip 8
l8_arena_count: .skip 8
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
    mov %rdi, %rax
    shl $3, %rax
    add %rsp, %rax
    add $16, %rax
    mov %rax, initial_envp(%rip)
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
    mov %rax, heap_base(%rip)
    lea HEAP_SIZE(%rax), %rdi
    mov %rdi, heap_end(%rip)

    pop %r13              # raw argv
    pop %r12              # argc

    # Build []str argv. Each element has its own length prefix and trailing NUL;
    # the outer slice has the usual length prefix.
    mov %r12, %rax
    add %rax, %rax
    add %rax, %rax
    add %rax, %rax
    add $8, %rax
    mov %rax, %rdi
    call malloc
    test %rax, %rax
    jz .Lalloc_fail
    mov %r12, 0(%rax)
    lea 8(%rax), %r15     # argv slice data
    xor %rbx, %rbx
.Largv_next:
    cmp %r12, %rbx
    je .Largv_done
    mov 0(%r13), %r10
    add $8, %r13
    xor %r11, %r11
    mov %r10, %r8
.Largv_len:
    movzb 0(%r8), %rax
    cmp $0, %rax
    je .Largv_have_len
    add $1, %r8
    add $1, %r11
    jmp .Largv_len
.Largv_have_len:
    lea 9(%r11), %rdi
    call malloc
    test %rax, %rax
    jz .Lalloc_fail
    mov %r11, 0(%rax)
    lea 8(%rax), %r9
    mov %r9, 0(%r15)
    add $8, %r15
    xor %rdx, %rdx
.Largv_string_copy:
    movzb 0(%r10), %rax
    mov %al, 0(%r9)
    cmp %r11, %rdx
    je .Largv_string_done
    add $1, %r10
    add $1, %r9
    add $1, %rdx
    jmp .Largv_string_copy
.Largv_string_done:
    add $1, %rbx
    jmp .Largv_next
.Largv_done:
    mov %r12, %rdi
    mov %r15, %rsi
    mov %r12, %rax
    add %rax, %rax
    add %rax, %rax
    add %rax, %rax
    sub %rax, %rsi
    call main
    mov %rax, %rdi
    mov $60, %rax          # exit
    syscall
.Lalloc_fail:
    mov $1, %rdi
    mov $60, %rax
    syscall

# long syscall(long nr, long a1, long a2, long a3, long a4, long a5)
# Sixth syscall arg is always 0. Typed adapters below cover the wider OS surface
# used by bundled programs.
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

# Linux x86-64 system-call adapters.  Keeping these in the runtime gives L8
# programs typed entry points without routing basic OS services through libc.
l8_clock_gettime:
    mov $228, %rax
    syscall
    ret
l8_poll:
    mov $7, %rax
    syscall
    ret
l8_recv:
    mov %rcx, %r10
    xor %r8, %r8
    xor %r9, %r9
    mov $45, %rax          # recvfrom(fd, buf, len, flags, NULL, NULL)
    syscall
    ret
l8_send:
    mov %rcx, %r10
    xor %r8, %r8
    xor %r9, %r9
    mov $44, %rax          # sendto(fd, buf, len, flags, NULL, 0)
    syscall
    ret
l8_getrandom:
    mov $318, %rax
    syscall
    ret
l8_shutdown:
    mov $48, %rax
    syscall
    ret
l8_socket:
    mov $41, %rax
    syscall
    ret
l8_connect:
    mov $42, %rax
    syscall
    ret
l8_bind:
    mov $49, %rax
    syscall
    ret
l8_listen:
    mov $50, %rax
    syscall
    ret
l8_accept4:
    mov %rcx, %r10
    mov $288, %rax
    syscall
    ret
l8_setsockopt:
    mov %rcx, %r10
    mov $54, %rax
    syscall
    ret
l8_getsockopt:
    mov %rcx, %r10
    mov $55, %rax
    syscall
    ret
l8_fork:
    mov $57, %rax
    syscall
    ret
l8_waitpid:
    xor %r10, %r10         # wait4(pid, status, options, NULL)
    mov $61, %rax
    syscall
    ret
l8_ioctl:
l8_ioctl_value:
    mov $16, %rax
    syscall
    ret
l8_fcntl:
    mov $72, %rax
    syscall
    ret
l8_setsid:
    mov $112, %rax
    syscall
    ret
l8_dup2:
    mov $33, %rax
    syscall
    ret
l8_execve:
    mov $59, %rax
    syscall
    ret
l8_kill:
    mov $62, %rax
    syscall
    ret

# []str l8_environment() -- counted copies of the initial process environment.
# Caller owns the result in its current region; raw envp remains on the initial stack.
l8_environment:
    push %rbx
    push %r12
    push %r13
    push %r14
    push %r15
    mov initial_envp(%rip), %r12
    xor %r13, %r13
.Lenv_count:
    mov %r13, %rax
    shl $3, %rax
    add %r12, %rax
    mov 0(%rax), %rax
    test %rax, %rax
    jz .Lenv_alloc
    add $1, %r13
    jmp .Lenv_count
.Lenv_alloc:
    mov %r13, %rdi
    shl $3, %rdi
    add $8, %rdi
    call malloc
    test %rax, %rax
    jz .Lalloc_fail
    mov %r13, 0(%rax)
    lea 8(%rax), %r14
    xor %r15, %r15
.Lenv_next:
    cmp %r13, %r15
    je .Lenv_done
    mov %r15, %rbx
    shl $3, %rbx
    add %r12, %rbx
    mov 0(%rbx), %rbx
    xor %rdx, %rdx
.Lenv_length:
    mov %rbx, %rax
    add %rdx, %rax
    movzb 0(%rax), %rax
    test %rax, %rax
    jz .Lenv_string
    add $1, %rdx
    jmp .Lenv_length
.Lenv_string:
    lea 9(%rdx), %rdi
    call malloc
    test %rax, %rax
    jz .Lalloc_fail
    mov %rdx, 0(%rax)
    lea 8(%rax), %rcx
    mov %r15, %rax
    shl $3, %rax
    add %r14, %rax
    mov %rcx, 0(%rax)
    xor %r8, %r8
.Lenv_copy:
    mov %rbx, %r9
    add %r8, %r9
    movzb 0(%r9), %rax
    mov %rcx, %r9
    add %r8, %r9
    mov %al, 0(%r9)
    cmp %rdx, %r8
    je .Lenv_copied
    add $1, %r8
    jmp .Lenv_copy
.Lenv_copied:
    add $1, %r15
    jmp .Lenv_next
.Lenv_done:
    mov %r14, %rax
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbx
    ret
l8_time:
    xor %rdi, %rdi
    mov $201, %rax
    syscall
    ret

# long l8_heap_mark(void) — bump of the current allocation destination
l8_heap_mark:
    mov l8_arena_current(%rip), %rax
    test %rax, %rax
    jz 1f
    mov 8(%rax), %rax
    ret
1:
    mov heap_ptr(%rip), %rax
    ret

l8_region_depth:
    mov l8_region_n(%rip), %rax
    ret

# Runtime recovery for native callbacks abandoned by a signal or exception.
l8_region_unwind:
    push %rbx
    mov %rdi, %rbx
1:
    mov l8_region_n(%rip), %rax
    cmp %rbx, %rax
    jbe 2f
    call l8_region_pop
    jmp 1b
2:
    pop %rbx
    ret

# Frame stack. l8_frame_push(kind, a, b) clobbers caller-saved regs.
l8_frame_push:
    mov %rcx, %r8
    mov l8_region_n(%rip), %rax
    cmp $63, %rax
    ja 1f
    lea l8_region_marks(%rip), %rcx
    mov %rax, %r11
    shl $5, %r11
    add %r11, %rcx
    mov %rdi, 0(%rcx)
    mov %rsi, 8(%rcx)
    mov %rdx, 16(%rcx)
    mov %r8, 24(%rcx)
    add $1, %rax
    mov %rax, l8_region_n(%rip)
    ret
1:
    mov $1, %rdi
    mov $60, %rax
    syscall

.Larena_msg_borrowed:
    .byte 97, 114, 101, 110, 97, 32, 105, 115, 32, 98, 111, 114, 114, 111, 119, 101, 100, 10
.Larena_msg_empty:
    .byte 97, 114, 101, 110, 97, 32, 105, 115, 32, 101, 109, 112, 116, 121, 10

l8_arena_fail_borrowed:
    mov $1, %rdi
    lea .Larena_msg_borrowed(%rip), %rsi
    mov $18, %rdx
    mov $1, %rax
    syscall
    mov $1, %rdi
    mov $60, %rax
    syscall

l8_arena_fail_empty:
    mov $1, %rdi
    lea .Larena_msg_empty(%rip), %rsi
    mov $15, %rdx
    mov $1, %rax
    syscall
    mov $1, %rdi
    mov $60, %rax
    syscall

# mmap(size) -> rax, or 0. Size in rdi. Anonymous private.
l8_arena_mmap:
    mov %rdi, %rsi
    xor %rdi, %rdi
    mov $3, %rdx
    mov $34, %r10
    mov $-1, %r8
    xor %r9, %r9
    mov $9, %rax
    syscall
    cmp $-4096, %rax
    ja 1f
    ret
1:
    xor %rax, %rax
    ret

# void l8_arena_free(header). Borrow count must be zero.
l8_arena_free:
    push %rbx
    mov %rdi, %rbx
    test %rbx, %rbx
    jz 2f
    mov 0(%rbx), %rax
    test %rax, %rax
    jne l8_arena_fail_borrowed
    mov 24(%rbx), %rdi
1:
    test %rdi, %rdi
    jz 3f
    mov 0(%rdi), %r11
    mov 8(%rdi), %rsi
    push %r11
    mov $11, %rax
    syscall
    pop %rdi
    jmp 1b
3:
    mov %rbx, %rdi
    mov $4096, %rsi
    mov $11, %rax
    syscall
    mov l8_arena_count(%rip), %rax
    sub $1, %rax
    mov %rax, l8_arena_count(%rip)
2:
    pop %rbx
    ret

# owned header *l8_arena_new(void)
l8_arena_new:
    push %rbx
    mov $4096, %rdi
    call l8_arena_mmap
    test %rax, %rax
    jz 1f
    mov %rax, %rbx
    movq $0, 0(%rbx)
    movq $0, 32(%rbx)
    mov $65536, %rdi
    call l8_arena_mmap
    test %rax, %rax
    jz 2f
    movq $0, 0(%rax)
    movq $65536, 8(%rax)
    mov %rax, 24(%rbx)
    lea 16(%rax), %rcx
    mov %rcx, 8(%rbx)
    lea 65536(%rax), %rcx
    mov %rcx, 16(%rbx)
    mov l8_arena_count(%rip), %rax
    add $1, %rax
    mov %rax, l8_arena_count(%rip)
    mov %rbx, %rax
    pop %rbx
    ret
2:
    mov %rbx, %rdi
    mov $4096, %rsi
    mov $11, %rax
    syscall
    xor %rax, %rax
1:
    pop %rbx
    ret

# long l8_arena_live(void)
l8_arena_live:
    mov l8_arena_count(%rip), %rax
    ret

# Reserve zeroed bytes without touching every page. Owned destinations track
# the mapping as a full chunk; the next allocation starts a fresh chunk.
l8_reserve_bytes:
    push %rbx
    push %r12
    push %r13
    mov %rdi, %r12
    test %r12, %r12
    jl 2f
    mov $9223372036854771712, %rax
    cmp %rax, %r12
    ja 2f
    lea 4119(%r12), %r13
    and $-4096, %r13
    mov l8_arena_current(%rip), %rbx
    mov %r13, %rdi
    call l8_arena_mmap
    test %rax, %rax
    jz 2f
    mov %r13, 8(%rax)
    mov %r12, 16(%rax)
    test %rbx, %rbx
    jz 1f
    mov 24(%rbx), %rdx
    mov %rdx, 0(%rax)
    mov %rax, 24(%rbx)
    lea 0(%rax), %rdx
    add %r13, %rdx
    mov %rdx, 8(%rbx)
    mov %rdx, 16(%rbx)
1:
    add $24, %rax
    jmp 3f
2:
    xor %rax, %rax
3:
    pop %r13
    pop %r12
    pop %rbx
    ret

# void l8_arena_drop(header) — null is a no-op
l8_arena_drop:
    test %rdi, %rdi
    jz 1f
    call l8_arena_free
1:
    ret

# void l8_own_enter(header)
l8_own_enter:
    mov l8_arena_current(%rip), %rsi
    mov %rsi, %rdx
    mov %rdi, %rsi
    mov %rdi, l8_arena_current(%rip)
    mov $1, %rdi
    jmp l8_frame_push

# void l8_own_commit(header, root) — pop the own frame without freeing
l8_own_commit:
    mov %rsi, 32(%rdi)
    mov l8_region_n(%rip), %rax
    test %rax, %rax
    jz 1f
    sub $1, %rax
    mov %rax, l8_region_n(%rip)
    lea l8_region_marks(%rip), %rcx
    shl $5, %rax
    add %rax, %rcx
    mov 16(%rcx), %rax
    mov %rax, l8_arena_current(%rip)
1:
    ret

# void l8_borrow_enter(header)
l8_borrow_enter:
    test %rdi, %rdi
    jz l8_arena_fail_empty
    mov 0(%rdi), %rax
    add $1, %rax
    mov %rax, 0(%rdi)
    mov %rdi, %rsi
    xor %rdx, %rdx
    mov $3, %rdi
    jmp l8_frame_push

# void l8_alloc_enter(header)
l8_alloc_enter:
    test %rdi, %rdi
    jz l8_arena_fail_empty
    mov l8_arena_current(%rip), %rdx
    mov %rdi, l8_arena_current(%rip)
    mov %rdi, %rsi
    mov $2, %rdi
    jmp l8_frame_push

# void l8_arena_suspend(void) — process heap across a native call. Keeps args and rax.
l8_arena_suspend:
    push %rax
    push %rdi
    push %rsi
    push %rdx
    push %rcx
    push %r8
    push %r9
    mov l8_arena_current(%rip), %rdx
    movq $0, l8_arena_current(%rip)
    xor %rsi, %rsi
    mov $4, %rdi
    call l8_frame_push
    pop %r9
    pop %r8
    pop %rcx
    pop %rdx
    pop %rsi
    pop %rdi
    pop %rax
    ret

# void l8_arena_resume(void) — preserves rax
l8_arena_resume:
    jmp l8_region_pop

# long l8_heap_used(void) — bytes allocated from the bump base
l8_heap_used:
    mov heap_ptr(%rip), %rax
    mov heap_base(%rip), %rcx
    sub %rcx, %rax
    ret

# void l8_heap_reset(long mark) — rewind the bump allocator
l8_heap_reset:
    mov %rdi, heap_ptr(%rip)
    ret

# void l8_region_push(long mark) — checkpoint the process heap. A region is
# always on the process heap: entered in an arena, the arena is suspended
# until it ends, so what an allocate of that arena adds within it stays.
l8_region_push:
    mov l8_arena_current(%rip), %rsi
    xor %rcx, %rcx
    test %rsi, %rsi
    jne 1f
    mov %rdi, %rdx
    xor %rdi, %rdi
    jmp l8_frame_push
1:
    mov heap_ptr(%rip), %rdx
    movq $0, l8_arena_current(%rip)
    mov $5, %rdi
    jmp l8_frame_push

# void l8_region_pop(void) — leave one frame. Preserves rax.
# Own frames abandoned here are freed. Borrow frames release.
l8_region_pop:
    push %rax
    mov l8_region_n(%rip), %rax
    test %rax, %rax
    jz 9f
    sub $1, %rax
    mov %rax, l8_region_n(%rip)
    lea l8_region_marks(%rip), %rcx
    shl $5, %rax
    add %rax, %rcx
    mov 0(%rcx), %rax
    mov 8(%rcx), %rsi
    mov 16(%rcx), %rdx
    cmp $0, %rax
    je .Lpop_region
    cmp $1, %rax
    je .Lpop_own
    cmp $3, %rax
    je .Lpop_borrow
    cmp $5, %rax
    je .Lpop_arena_region
    mov %rdx, l8_arena_current(%rip)
    jmp 9f
.Lpop_region:
    mov %rdx, heap_ptr(%rip)
    jmp 9f
.Lpop_arena_region:
    mov %rdx, heap_ptr(%rip)
    mov %rsi, l8_arena_current(%rip)
    jmp 9f
.Lpop_own:
    mov %rdx, l8_arena_current(%rip)
    mov %rsi, %rdi
    call l8_arena_free
    jmp 9f
.Lpop_borrow:
    mov 0(%rsi), %rcx
    sub $1, %rcx
    mov %rcx, 0(%rsi)
9:
    pop %rax
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

# void *malloc(long size) — bump allocator, 8-byte aligned.
# An owned arena, when current, bumps its own chunks.
malloc:
    mov l8_arena_current(%rip), %rax
    test %rax, %rax
    jne .Lmalloc_arena
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
.Lmalloc_arena:
    # (As the heap's path does, only rax, rcx and rdi change: the runtime's
    # own callers, l8_cstr and l8_bytes, keep values in the others, and a
    # chunk's growth is a system call.)
    push %rbx
    push %r12
    push %rdx
    push %rsi
    push %r8
    push %r9
    push %r10
    push %r11
    mov %rax, %rbx
    add $7, %rdi
    and $-8, %rdi
    mov 8(%rbx), %rax
    mov %rax, %rcx
    add %rdi, %rcx
    mov 16(%rbx), %r11
    cmp %r11, %rcx
    ja .Lmalloc_arena_grow
    mov %rcx, 8(%rbx)
    jmp .Lmalloc_arena_done
.Lmalloc_arena_grow:
    mov %rdi, %r12
    mov %r12, %rcx
    add $16, %rcx
    cmp $65536, %rcx
    jae 2f
    mov $65536, %rcx
2:
    add $4095, %rcx
    and $-4096, %rcx
    push %rcx
    mov %rcx, %rdi
    call l8_arena_mmap
    pop %rcx
    test %rax, %rax
    jz .Lmalloc_arena_done
    mov 24(%rbx), %rdx
    mov %rdx, 0(%rax)
    mov %rcx, 8(%rax)
    mov %rax, 24(%rbx)
    lea 16(%rax), %rdx
    mov %rdx, %r11
    add %r12, %rdx
    mov %rdx, 8(%rbx)
    add %rcx, %rax
    mov %rax, 16(%rbx)
    mov %r11, %rax
.Lmalloc_arena_done:
    pop %r11
    pop %r10
    pop %r9
    pop %r8
    pop %rsi
    pop %rdx
    pop %r12
    pop %rbx
    ret

# long len(*i8 s) — length prefix at s-8 (for length-prefixed literals / strdup)
len:
    mov -8(%rdi), %rax
    ret

# bool l8_opt_str_eq(?str a, ?str b) — null-aware string value equality
l8_opt_str_eq:
    test %rdi, %rdi
    jz .Lopt_str_left_null
    test %rsi, %rsi
    jz .Lstr_ne
    jmp l8_str_eq
.Lopt_str_left_null:
    test %rsi, %rsi
    jz .Lstr_yes
    jmp .Lstr_ne

# bool l8_str_eq(str a, str b) — content equality for counted strings
l8_str_eq:
    mov -8(%rdi), %rcx
    mov -8(%rsi), %rdx
    cmp %rdx, %rcx
    jne .Lstr_ne
.Lstr_eq_loop:
    cmp $0, %rcx
    je .Lstr_yes
    movzb 0(%rdi), %rax
    movzb 0(%rsi), %rdx
    cmp %rdx, %rax
    jne .Lstr_ne
    add $1, %rdi
    add $1, %rsi
    sub $1, %rcx
    jmp .Lstr_eq_loop
.Lstr_yes:
    mov $1, %rax
    ret
.Lstr_ne:
    mov $0, %rax
    ret

# str l8_cstr([]i8 bytes) — validate, copy, and append a trailing NUL.
l8_cstr:
    push %rbx
    mov %rdi, %rbx
    mov -8(%rbx), %rdx
    mov %rbx, %r8
    mov %rdx, %r9
.Lcstr_validate:
    cmp $0, %r9
    je .Lcstr_alloc
    movzb 0(%r8), %rax
    cmp $0, %rax
    je .Lcstr_invalid
    add $1, %r8
    sub $1, %r9
    jmp .Lcstr_validate
.Lcstr_alloc:
    lea 9(%rdx), %rdi
    call malloc
    test %rax, %rax
    jz .Lcstr_invalid
    mov %rdx, 0(%rax)
    lea 8(%rax), %rcx
    mov %rcx, %r8
    mov %rdx, %r9
.Lcstr_copy:
    cmp $0, %r9
    je .Lcstr_done
    movzb 0(%rbx), %rax
    mov %al, 0(%r8)
    add $1, %rbx
    add $1, %r8
    sub $1, %r9
    jmp .Lcstr_copy
.Lcstr_done:
    movb $0, 0(%r8)
    mov %rcx, %rax
    pop %rbx
    ret
.Lcstr_invalid:
    mov $1, %rdi
    mov $60, %rax
    syscall

# []i8 l8_bytes(str s) — make a mutable counted copy without the sentinel.
l8_bytes:
    push %rbx
    mov %rdi, %rbx
    mov -8(%rbx), %rdx
    lea 8(%rdx), %rdi
    call malloc
    test %rax, %rax
    jz .Lbytes_invalid
    mov %rdx, 0(%rax)
    lea 8(%rax), %rcx
    mov %rcx, %r8
    mov %rdx, %r9
.Lbytes_copy:
    cmp $0, %r9
    je .Lbytes_done
    movzb 0(%rbx), %rax
    mov %al, 0(%r8)
    add $1, %rbx
    add $1, %r8
    sub $1, %r9
    jmp .Lbytes_copy
.Lbytes_done:
    mov %rcx, %rax
    pop %rbx
    ret
.Lbytes_invalid:
    mov $1, %rdi
    mov $60, %rax
    syscall

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
l8_os_write:
    mov $1, %rax
    syscall
    ret

# long open(char *path, long flags, long mode)
open:
    mov $2, %rax
    syscall
    ret

# Legacy stage-1 bootstrap shim. Stage 2 uses open(str, ...) directly.
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
# Preserves %rax, which holds the value of a try expression's body.
l8_try_end:
    mov l8_handler_top(%rip), %rdi
    test %rdi, %rdi
    jz 1f
    mov 64(%rdi), %rcx
    mov %rcx, l8_handler_top(%rip)
    mov l8_try_rn(%rip), %rcx
    test %rcx, %rcx
    jz 1f
    sub $1, %rcx
    mov %rcx, l8_try_rn(%rip)
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
    jbe .Lraise_unw_done
    push %rdi
    push %r8
    call l8_region_pop
    pop %r8
    pop %rdi
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
