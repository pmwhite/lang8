// L8 runtime for Android on AArch64 (arm64), for `l8 arm64 --target
// android` (see src2/arm64.l8): runtime-arm64-darwin.s's, as ELF and over
// Android's C library (bionic), in a shared library (libbetter.so) that
// the app's Java loads. Its glue (tools/android/glue.c) calls
// l8_android_main on a thread of its own, which runs L8's main. As on
// Apple's systems, the runtime's names that are the C library's too but
// not its meanings are l8rt_NAME here (see arm_sym). Android is Linux:
// open's flags and clock_gettime's clocks are as programs pass them.
//
// Calls follow AAPCS64. These helpers never touch x19-x29 (x28 is L8's
// stack pointer) beyond their own frames, and those marked "keeps x9" leave
// L8's rax as it was.

    .globl l8_android_main
    .globl l8rt_malloc
    .globl l8rt_open
    .globl open_nul
    .globl l8rt_len
    .globl l8rt_clock_gettime
    .globl l8rt_getrusage
    .globl l8rt_syscall
    .globl l8rt_rdtsc
    .globl l8_os_write
    .globl l8_exit
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
    .globl l8_as_int
    .globl l8_call
    .globl l8_load64
    .globl l8_str_eq
    .globl l8_opt_str_eq
    .globl l8_cstr
    .globl l8_bytes
    .globl l8rt_argc
    .globl l8rt_argv

    .section .data
    .p2align 3
heap_ptr:  .quad 0
heap_base: .quad 0
heap_end:  .quad 0
initial_envp: .quad 0
// C's argc and argv, for UIApplicationMain.
l8_c_argc: .quad 0
l8_c_argv: .quad 0
l8_exc_tag: .quad 0
l8_exc_ptr: .quad 0
l8_handler_top: .quad 0
l8_region_n: .quad 0
l8_region_marks: .space 2048
l8_try_rn: .quad 0
l8_try_regions: .space 512

    .section .data
    .p2align 3
l8_arena_state:
    .quad 0
    .quad 0
    .quad heap_ptr
    .quad heap_end
    .quad l8_region_n
    .quad l8_region_marks

    .section .text
    .p2align 2

// void l8_android_main(char **envp): L8's main, on the caller's thread
// (Better's own, with a big stack: see tools/android/glue.c), with no
// arguments and the environment given.
l8_android_main:
    stp x29, x30, [sp, #-96]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    stp x21, x22, [sp, #32]
    stp x23, x24, [sp, #48]
    stp x25, x26, [sp, #64]
    stp x27, x28, [sp, #80]
    adrp x8, initial_envp
    str x0, [x8, :lo12:initial_envp]
    // The heap: one anonymous mapping that malloc bumps through.
    mov x0, #0
    mov x1, #0x10000000         // 256 MiB
    mov x2, #3                  // PROT_READ|PROT_WRITE
    mov x3, #0x22               // MAP_PRIVATE|MAP_ANONYMOUS
    mov x4, #-1
    mov x5, #0
    bl mmap
    cmn x0, #1
    b.eq .Lalloc_fail
    adrp x8, heap_ptr
    str x0, [x8, :lo12:heap_ptr]
    adrp x8, heap_base
    str x0, [x8, :lo12:heap_base]
    mov x1, #0x10000000
    add x0, x0, x1
    adrp x8, heap_end
    str x0, [x8, :lo12:heap_end]
    // argv: an empty []str.
    mov x0, #8
    bl l8rt_malloc
    cbz x0, .Lalloc_fail
    str xzr, [x0]
    add x1, x0, #8
    mov x0, #0
    sub sp, sp, #16
    mov x28, sp                 // L8's stack starts here
    bl l8_main
    mov sp, x29
    ldp x27, x28, [sp, #80]
    ldp x25, x26, [sp, #64]
    ldp x23, x24, [sp, #48]
    ldp x21, x22, [sp, #32]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #96
    ret
.Lalloc_fail:
    mov x0, #1
    bl exit

// ---- the C library, with Linux's meanings ----
// open(path, flags, mode) and clock_gettime(clock, ts): Linux's own.
l8rt_open:
open_nul:
    b open
l8rt_clock_gettime:
l8_clock_gettime:
    b clock_gettime
// getrusage(buf): RUSAGE_SELF.
l8rt_getrusage:
    mov x1, x0
    mov x0, #0
    b getrusage
// No raw system calls here.
l8rt_syscall:
    mov x0, #-38                // -ENOSYS
    ret
l8rt_rdtsc:
    mrs x0, cntvct_el0
    ret
l8_os_write:
    b write
l8_exit:
    b exit
l8_poll:
    b poll
l8_recv:
    b recv
l8_send:
    b send
// getrandom(buf, n, flags): n random bytes.
l8_getrandom:
    stp x29, x30, [sp, #-32]!
    str x1, [sp, #16]
    bl arc4random_buf
    ldr x0, [sp, #16]
    ldp x29, x30, [sp], #32
    ret
l8_shutdown:
    b shutdown
l8_socket:
    b socket
l8_connect:
    b connect
l8_bind:
    b bind
l8_listen:
    b listen
l8_accept4:
    b accept4
l8_setsockopt:
    b setsockopt
l8_getsockopt:
    b getsockopt
l8_fork:
    mov x0, #-1                 // not here
    ret
l8_waitpid:
    b waitpid
l8_ioctl:
l8_ioctl_value:
    b ioctl
l8_fcntl:
    b fcntl
l8_setsid:
    b setsid
l8_dup2:
    b dup2
l8_execve:
    mov x0, #-1                 // not here
    ret
l8_kill:
    b kill
l8_time:
    mov x0, #0
    b time

// []str l8_environment(): counted copies of the environment.
l8_environment:
    stp x29, x30, [sp, #-64]!
    stp x19, x20, [sp, #16]
    stp x21, x22, [sp, #32]
    stp x23, x24, [sp, #48]
    adrp x19, initial_envp
    ldr x19, [x19, :lo12:initial_envp]
    mov x20, #0
1:
    ldr x0, [x19, x20, lsl #3]
    cbz x0, 2f
    add x20, x20, #1
    b 1b
2:
    lsl x0, x20, #3
    add x0, x0, #8
    bl l8rt_malloc
    cbz x0, .Lalloc_fail
    str x20, [x0]
    add x21, x0, #8
    mov x22, #0
3:
    cmp x22, x20
    b.eq 7f
    ldr x23, [x19, x22, lsl #3]
    mov x24, #0
4:
    ldrb w0, [x23, x24]
    cbz w0, 5f
    add x24, x24, #1
    b 4b
5:
    add x0, x24, #9
    bl l8rt_malloc
    cbz x0, .Lalloc_fail
    str x24, [x0]
    add x1, x0, #8
    str x1, [x21, x22, lsl #3]
    mov x2, #0
6:
    ldrb w3, [x23, x2]
    strb w3, [x1, x2]
    cmp x2, x24
    add x2, x2, #1
    b.ne 6b
    add x22, x22, #1
    b 3b
7:
    mov x0, x21
    ldp x23, x24, [sp, #48]
    ldp x21, x22, [sp, #32]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #64
    ret

// ---- the bump heap and regions (as runtime.s); these keep x9 ----
l8_heap_mark:
    b .Larm_arena_heap_mark
l8_heap_used:
    adrp x0, heap_ptr
    ldr x0, [x0, :lo12:heap_ptr]
    adrp x1, heap_base
    ldr x1, [x1, :lo12:heap_base]
    sub x0, x0, x1
    ret
l8_heap_reset:
    adrp x1, heap_ptr
    str x0, [x1, :lo12:heap_ptr]
    ret
l8_region_push:
    b .Larm_arena_region_push
l8_region_pop:
    b .Larm_arena_region_pop
l8_exc_malloc:
    add x0, x0, #7
    and x0, x0, #-8
    adrp x1, heap_end
    ldr x2, [x1, :lo12:heap_end]
    sub x2, x2, x0
    adrp x3, heap_ptr
    ldr x3, [x3, :lo12:heap_ptr]
    cmp x3, x2
    b.hi 1f
    str x2, [x1, :lo12:heap_end]
    mov x0, x2
    ret
1:
    mov x0, #0
    ret
// void *malloc(size): bump, 8-byte aligned; 0 when the heap is full.
l8rt_malloc:
    adrp x1, l8_arena_state
    add x1, x1, :lo12:l8_arena_state
    ldr x1, [x1]
    cbnz x1, .Larm_arena_malloc
    adrp x1, heap_ptr
    ldr x2, [x1, :lo12:heap_ptr]
    add x0, x0, #7
    and x0, x0, #-8
    add x3, x2, x0
    adrp x4, heap_end
    ldr x4, [x4, :lo12:heap_end]
    cmp x3, x4
    b.hi 1f
    str x3, [x1, :lo12:heap_ptr]
    mov x0, x2
    ret
1:
    mov x0, #0
    ret
l8rt_len:
    ldur x0, [x0, #-8]
    ret
l8_opt_str_eq:
    cbz x0, 1f
    cbz x1, .Lstr_ne
    b l8_str_eq
1:
    cbz x1, .Lstr_yes
    b .Lstr_ne
l8_str_eq:
    ldur x2, [x0, #-8]
    ldur x3, [x1, #-8]
    cmp x2, x3
    b.ne .Lstr_ne
1:
    cbz x2, .Lstr_yes
    ldrb w4, [x0], #1
    ldrb w5, [x1], #1
    cmp w4, w5
    b.ne .Lstr_ne
    sub x2, x2, #1
    b 1b
.Lstr_yes:
    mov x0, #1
    ret
.Lstr_ne:
    mov x0, #0
    ret
l8_cstr:
    stp x29, x30, [sp, #-32]!
    stp x19, x20, [sp, #16]
    mov x19, x0
    ldur x20, [x19, #-8]
    mov x2, #0
1:
    cmp x2, x20
    b.eq 2f
    ldrb w3, [x19, x2]
    cbz w3, .Lcstr_invalid
    add x2, x2, #1
    b 1b
2:
    add x0, x20, #9
    bl l8rt_malloc
    cbz x0, .Lcstr_invalid
    str x20, [x0]
    add x0, x0, #8
    mov x2, #0
3:
    cmp x2, x20
    b.eq 4f
    ldrb w3, [x19, x2]
    strb w3, [x0, x2]
    add x2, x2, #1
    b 3b
4:
    strb wzr, [x0, x2]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #32
    ret
.Lcstr_invalid:
    mov x0, #1
    bl exit
l8_bytes:
    stp x29, x30, [sp, #-32]!
    stp x19, x20, [sp, #16]
    mov x19, x0
    ldur x20, [x19, #-8]
    add x0, x20, #8
    bl l8rt_malloc
    cbz x0, .Lcstr_invalid
    str x20, [x0]
    add x0, x0, #8
    mov x2, #0
1:
    cmp x2, x20
    b.eq 2f
    ldrb w3, [x19, x2]
    strb w3, [x0, x2]
    add x2, x2, #1
    b 1b
2:
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #32
    ret
l8_memcpy:
1:
    cmp x2, #8
    b.lo 2f
    ldr x3, [x1], #8
    str x3, [x0], #8
    sub x2, x2, #8
    b 1b
2:
    cbz x2, 3f
    ldrb w3, [x1], #1
    strb w3, [x0], #1
    sub x2, x2, #1
    b 2b
3:
    ret

// ---- exceptions (as runtime-arm64-linux.s) ----
l8_try_begin:
    str x19, [x0, #0]
    str x29, [x0, #8]
    str x20, [x0, #16]
    str x21, [x0, #24]
    str x22, [x0, #32]
    str x23, [x0, #40]
    str x28, [x0, #48]
    str x30, [x0, #56]
    adrp x1, l8_try_rn
    ldr x2, [x1, :lo12:l8_try_rn]
    cmp x2, #63
    b.hi 1f
    adrp x3, l8_try_regions
    add x3, x3, :lo12:l8_try_regions
    adrp x4, l8_region_n
    ldr x4, [x4, :lo12:l8_region_n]
    str x4, [x3, x2, lsl #3]
    add x2, x2, #1
    str x2, [x1, :lo12:l8_try_rn]
    adrp x1, l8_handler_top
    ldr x2, [x1, :lo12:l8_handler_top]
    str x2, [x0, #64]
    str x0, [x1, :lo12:l8_handler_top]
    mov x0, #0
    ret
1:
    mov x0, #1
    bl exit
l8_try_end:
    adrp x1, l8_handler_top
    ldr x0, [x1, :lo12:l8_handler_top]
    cbz x0, 1f
    ldr x2, [x0, #64]
    str x2, [x1, :lo12:l8_handler_top]
    adrp x1, l8_try_rn
    ldr x2, [x1, :lo12:l8_try_rn]
    cbz x2, 1f
    sub x2, x2, #1
    str x2, [x1, :lo12:l8_try_rn]
1:
    ret
l8_raise:
    adrp x2, l8_exc_tag
    str x0, [x2, :lo12:l8_exc_tag]
    adrp x2, l8_exc_ptr
    str x1, [x2, :lo12:l8_exc_ptr]
    adrp x2, l8_handler_top
    ldr x0, [x2, :lo12:l8_handler_top]
    cbz x0, 9f
    adrp x3, l8_try_rn
    ldr x4, [x3, :lo12:l8_try_rn]
    cbz x4, 3f
    sub x4, x4, #1
    str x4, [x3, :lo12:l8_try_rn]
    adrp x5, l8_try_regions
    add x5, x5, :lo12:l8_try_regions
    ldr x6, [x5, x4, lsl #3]
    bl .Larm_arena_unwind
3:
    ldr x4, [x0, #64]
    str x4, [x2, :lo12:l8_handler_top]
    ldr x19, [x0, #0]
    ldr x29, [x0, #8]
    ldr x20, [x0, #16]
    ldr x21, [x0, #24]
    ldr x22, [x0, #32]
    ldr x23, [x0, #40]
    ldr x28, [x0, #48]
    ldr x30, [x0, #56]
    sub x16, x28, #64
    and sp, x16, #-16
    mov x0, #1
    ret
9:
    mov x0, #1
    bl exit

l8_as_int:
    ret
l8_load64:
    ldr x0, [x0, x1]
    ret
l8_call:
    mov x16, x0
    mov x0, x1
    mov x1, x2
    mov x2, x3
    mov x3, x4
    mov x4, x5
    mov x5, #0
    br x16

// C's argc and argv: none here (iOS's UIApplicationMain wants them).
l8rt_argc:
    adrp x0, l8_c_argc
    ldr x0, [x0, :lo12:l8_c_argc]
    ret
l8rt_argv:
    adrp x0, l8_c_argv
    ldr x0, [x0, :lo12:l8_c_argv]
    ret


    .section .text
    .p2align 2
    .globl l8_arena_new
    .globl l8_reserve_bytes
l8_reserve_bytes:
    b .Larm_arena_reserve_bytes
l8_arena_new:
    b .Larm_arena_new
    .globl l8_arena_drop
l8_arena_drop:
    b .Larm_arena_free
    .globl l8_arena_live
l8_arena_live:
    b .Larm_arena_live
    .globl l8_own_enter
l8_own_enter:
    b .Larm_arena_own_enter
    .globl l8_own_commit
l8_own_commit:
    b .Larm_arena_own_commit
    .globl l8_borrow_enter
l8_borrow_enter:
    b .Larm_arena_borrow_enter
    .globl l8_alloc_enter
l8_alloc_enter:
    b .Larm_arena_alloc_enter
    .globl l8_arena_suspend
l8_arena_suspend:
    b .Larm_arena_suspend
    .globl l8_arena_resume
l8_arena_resume:
    b .Larm_arena_region_pop
    .globl l8_region_unwind
l8_region_unwind:
    mov x6, x0
    b .Larm_arena_unwind
    .globl l8_region_depth
l8_region_depth:
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    ldr x0, [x15, #32]
    ldr x0, [x0]
    ldp x9, x30, [sp], #16
    ret
.Larm_arena_state_address:
    adrp x15, l8_arena_state
    add x15, x15, :lo12:l8_arena_state
    ret
.Larm_arena_map:
    stp x9, x30, [sp, #-16]!
    mov x1, x0
    mov x0, #0
    mov x2, #3
    mov x3, #34
    mov x4, #-1
    mov x5, #0
    bl mmap
    cmn x0, #1
    b.ne 1f
    mov x0, #0
1:
    ldp x9, x30, [sp], #16
    ret
.Larm_arena_unmap:
    b munmap
.Larm_arena_fail:
    mov x0, #1
    b exit
