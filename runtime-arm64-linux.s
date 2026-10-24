// L8 runtime for Linux on AArch64 (arm64): the same entry points as
// runtime.s, for `l8 arm64 --target linux` (see src2/arm64.l8). Mostly a
// testing target: it lets the arm64 code generator run the compiler's tests
// under qemu-aarch64 without an arm64 machine.
//
// Calls follow AAPCS64: arguments in x0-x7, the result in x0. These helpers
// never touch x19-x29 (x28 is L8's stack pointer) or sp beyond their own
// frames, and those marked "keeps x9" leave L8's rax as it was.

    .globl _start
    .globl syscall
    .globl malloc
    .globl read
    .globl l8_os_write
    .globl open
    .globl open_nul
    .globl close
    .globl exit
    .globl l8_exit
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

    .section .bss
    .p2align 3
heap_ptr:  .space 8
heap_base: .space 8
heap_end:  .space 8
initial_envp: .space 8
// Transitional legacy heap is executable-owned BSS, with no startup mmap.
heap_storage: .space 268435456
l8_args_header: .space 8
l8_args_values: .space 32768
l8_args_text: .space 4194304
l8_env_header: .space 8
l8_env_values: .space 32768
l8_env_text: .space 4194304
l8_env_ready: .space 8
// The current exception (set by l8_raise, read by the catch).
l8_exc_tag: .space 8
l8_exc_ptr: .space 8
// The innermost try's buffer, or 0.
l8_handler_top: .space 8
// Nested region marks, and the region depth at each try (as runtime.s).
l8_region_n: .space 8
l8_region_marks: .space 512
l8_try_rn: .space 8
l8_try_regions: .space 512

// A try's buffer (72 bytes), as runtime.s's with arm64's registers:
//   0 x19 (rbx)   8 x29 (rbp)  16 x20 (r12)  24 x21 (r13)  32 x22 (r14)
//  40 x23 (r15)  48 x28 (rsp)  56 x30 (where l8_try_begin returns)
//  64 the previous buffer

    .section .text

// The kernel starts us with sp at argc, then argv, a 0, then envp.
_start:
    ldr x19, [sp]               // argc
    add x20, sp, #8             // raw argv
    add x0, x20, x19, lsl #3
    add x0, x0, #8
    adrp x1, initial_envp
    str x0, [x1, :lo12:initial_envp]
    adrp x0, heap_storage
    add x0, x0, :lo12:heap_storage
    adrp x1, heap_ptr
    str x0, [x1, :lo12:heap_ptr]
    adrp x1, heap_base
    str x0, [x1, :lo12:heap_base]
    mov x2, #0x10000000
    add x0, x0, x2
    adrp x1, heap_end
    str x0, [x1, :lo12:heap_end]
    mov x0, x20
    mov x1, x19
    adrp x2, l8_args_header
    add x2, x2, :lo12:l8_args_header
    adrp x3, l8_args_text
    add x3, x3, :lo12:l8_args_text
    bl .Lbounded_process_strings
    mov x1, x0
    mov x0, x19
    mov x28, sp
    bl main
    mov x8, #93
    svc #0
.Lalloc_fail:
    mov x0, #1
    mov x8, #93
    svc #0

// x0 raw vector, x1 argc (or -1 for env), x2 counted vector, x3 text owner.
.Lbounded_process_strings:
    stp x29, x30, [sp, #-80]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    stp x21, x22, [sp, #32]
    stp x23, x24, [sp, #48]
    stp x25, x26, [sp, #64]
    mov x19, x0
    mov x20, x1
    add x21, x2, #8
    mov x22, x3
    mov x4, #0x400000
    add x23, x3, x4
    mov x7, #4096
    cmp x20, #0
    b.ge .Lbounded_counted
    mov x20, #0
    cbz x19, .Lbounded_counted
.Lbounded_count:
    ldr x0, [x19, x20, lsl #3]
    cbz x0, .Lbounded_counted
    add x20, x20, #1
    cmp x20, x7
    b.hi .Lprocess_storage_full
    b .Lbounded_count
.Lbounded_counted:
    cmp x20, x7
    b.hi .Lprocess_storage_full
    sub x8, x21, #8
    str x20, [x8]
    mov x24, #0
.Lbounded_next:
    cmp x24, x20
    b.eq .Lbounded_done
    ldr x25, [x19, x24, lsl #3]
    mov x26, #0
.Lbounded_length:
    ldrb w0, [x25, x26]
    cbz w0, .Lbounded_string
    add x26, x26, #1
    mov x8, #0x400000
    sub x8, x8, #9
    cmp x26, x8
    b.hi .Lprocess_storage_full
    b .Lbounded_length
.Lbounded_string:
    add x4, x26, #16
    and x4, x4, #-8
    add x5, x22, x4
    cmp x5, x23
    b.hi .Lprocess_storage_full
    str x26, [x22]
    add x6, x22, #8
    str x6, [x21, x24, lsl #3]
    mov x4, #0
.Lbounded_copy:
    ldrb w0, [x25, x4]
    strb w0, [x6, x4]
    cmp x4, x26
    add x4, x4, #1
    b.ne .Lbounded_copy
    mov x22, x5
    add x24, x24, #1
    b .Lbounded_next
.Lbounded_done:
    mov x0, x21
    ldp x25, x26, [sp, #64]
    ldp x23, x24, [sp, #48]
    ldp x21, x22, [sp, #32]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #80
    ret
.Lprocess_storage_full:
    mov x0, #2
    adrp x1, .Lprocess_storage_message
    add x1, x1, :lo12:.Lprocess_storage_message
    mov x2, #37
    mov x8, #64
    svc #0
    b .Lalloc_fail
.Lprocess_storage_message:
    .byte 108, 56, 58, 32, 112, 114, 111, 99, 101, 115, 115, 32, 115, 116, 97, 116, 105, 99, 32, 115, 116, 111, 114, 97, 103, 101, 32, 101, 120, 104, 97, 117, 115, 116, 101, 100, 10
    .p2align 2

// long syscall(nr, a1, a2, a3, a4, a5): Linux's arm64 numbers.
syscall:
    mov x8, x0
    mov x0, x1
    mov x1, x2
    mov x2, x3
    mov x3, x4
    mov x4, x5
    mov x5, #0
    svc #0
    ret

l8_clock_gettime:
clock_gettime:
    mov x8, #113
    svc #0
    ret
// poll(fds, n, timeout_ms) as ppoll with a timespec, or none for a negative timeout.
l8_poll:
    sub sp, sp, #16
    mov x3, #0
    mov x4, #0
    cmp w2, #0
    b.lt 1f
    mov x5, #1000
    udiv x6, x2, x5
    msub x7, x6, x5, x2
    movz x5, #0x4240
    movk x5, #0xf, lsl #16      // 1000000
    mul x7, x7, x5
    stp x6, x7, [sp]
    mov x2, sp
    b 2f
1:
    mov x2, #0
2:
    mov x8, #73
    svc #0
    add sp, sp, #16
    ret
l8_recv:
    mov x4, #0
    mov x5, #0
    mov x8, #207                // recvfrom
    svc #0
    ret
l8_send:
    mov x4, #0
    mov x5, #0
    mov x8, #206                // sendto
    svc #0
    ret
l8_getrandom:
    mov x8, #278
    svc #0
    ret
l8_shutdown:
    mov x8, #210
    svc #0
    ret
l8_socket:
    mov x8, #198
    svc #0
    ret
l8_connect:
    mov x8, #203
    svc #0
    ret
l8_bind:
    mov x8, #200
    svc #0
    ret
l8_listen:
    mov x8, #201
    svc #0
    ret
l8_accept4:
    mov x8, #242
    svc #0
    ret
l8_setsockopt:
    mov x8, #208
    svc #0
    ret
l8_getsockopt:
    mov x8, #209
    svc #0
    ret
// fork as clone(SIGCHLD, 0, 0, 0, 0).
l8_fork:
    mov x0, #17
    mov x1, #0
    mov x2, #0
    mov x3, #0
    mov x4, #0
    mov x8, #220
    svc #0
    ret
l8_waitpid:
    mov x3, #0                  // wait4(pid, status, options, NULL)
    mov x8, #260
    svc #0
    ret
l8_ioctl:
l8_ioctl_value:
    mov x8, #29
    svc #0
    ret
l8_fcntl:
    mov x8, #25
    svc #0
    ret
l8_setsid:
    mov x8, #157
    svc #0
    ret
// dup2 as dup3, which refuses equal descriptors that dup2 allows.
l8_dup2:
    cmp x0, x1
    b.ne 1f
    mov x0, x1
    ret
1:
    mov x2, #0
    mov x8, #24
    svc #0
    ret
l8_execve:
    mov x8, #221
    svc #0
    ret
l8_kill:
    mov x8, #129
    svc #0
    ret
// time(NULL), from clock_gettime(CLOCK_REALTIME).
l8_time:
    sub sp, sp, #16
    mov x0, #0
    mov x1, sp
    mov x8, #113
    svc #0
    ldr x0, [sp]
    add sp, sp, #16
    ret

// A permanent counted snapshot; repeated reads do not consume any heap.
l8_environment:
    adrp x1, l8_env_ready
    ldr x0, [x1, :lo12:l8_env_ready]
    cbz x0, .Lbounded_env_init
    adrp x0, l8_env_values
    add x0, x0, :lo12:l8_env_values
    ret
.Lbounded_env_init:
    stp x29, x30, [sp, #-16]!
    mov x29, sp
    adrp x0, initial_envp
    ldr x0, [x0, :lo12:initial_envp]
    mov x1, #-1
    adrp x2, l8_env_header
    add x2, x2, :lo12:l8_env_header
    adrp x3, l8_env_text
    add x3, x3, :lo12:l8_env_text
    bl .Lbounded_process_strings
    adrp x1, l8_env_ready
    mov x2, #1
    str x2, [x1, :lo12:l8_env_ready]
    ldp x29, x30, [sp], #16
    ret

// The bump heap and regions (as runtime.s). These keep x9.
l8_heap_mark:
    adrp x0, heap_ptr
    ldr x0, [x0, :lo12:heap_ptr]
    ret
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
    adrp x1, l8_region_n
    ldr x2, [x1, :lo12:l8_region_n]
    cmp x2, #63
    b.hi 1f
    adrp x3, l8_region_marks
    add x3, x3, :lo12:l8_region_marks
    str x0, [x3, x2, lsl #3]
    add x2, x2, #1
    str x2, [x1, :lo12:l8_region_n]
    ret
1:
    mov x0, #1
    mov x8, #93
    svc #0
l8_region_pop:
    adrp x1, l8_region_n
    ldr x2, [x1, :lo12:l8_region_n]
    cbz x2, 1f
    sub x2, x2, #1
    str x2, [x1, :lo12:l8_region_n]
    adrp x3, l8_region_marks
    add x3, x3, :lo12:l8_region_marks
    ldr x4, [x3, x2, lsl #3]
    adrp x5, heap_ptr
    str x4, [x5, :lo12:heap_ptr]
1:
    ret
// void *l8_exc_malloc(size): from the heap's far end, so a region's rewind
// cannot free an exception in flight.
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
malloc:
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
len:
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
// str l8_cstr([]i8): checked to have no NUL, copied, NUL appended.
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
    bl malloc
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
    mov x8, #93
    svc #0
// []i8 l8_bytes(str): a mutable counted copy.
l8_bytes:
    stp x29, x30, [sp, #-32]!
    stp x19, x20, [sp, #16]
    mov x19, x0
    ldur x20, [x19, #-8]
    add x0, x20, #8
    bl malloc
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
// l8_memcpy(dst, src, n): words, then bytes.
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
read:
    mov x8, #63
    svc #0
    ret
l8_os_write:
    mov x8, #64
    svc #0
    ret
// open(path, flags, mode) as openat(AT_FDCWD, ...).
open:
open_nul:
    mov x3, x2
    mov x2, x1
    mov x1, x0
    mov x0, #-100
    mov x8, #56
    svc #0
    ret
// getrusage(buf): RUSAGE_SELF.
getrusage:
    mov x1, x0
    mov x0, #0
    mov x8, #165
    svc #0
    ret
close:
    mov x8, #57
    svc #0
    ret
exit:
l8_exit:
    mov x8, #93
    svc #0
    b l8_exit

// int l8_try_begin(buf): 0 now; 1 when a raise comes back to it.
l8_try_begin:
    str x19, [x0, #0]
    str x29, [x0, #8]
    str x20, [x0, #16]
    str x21, [x0, #24]
    str x22, [x0, #32]
    str x23, [x0, #40]
    str x28, [x0, #48]
    str x30, [x0, #56]
    // The region depth at this try: a raise rewinds those entered after it.
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
    mov x8, #93
    svc #0
// l8_try_end(): pop the innermost try. Keeps x9 (a try's value).
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
// l8_raise(tag, payload): back to the innermost try, or exit(1).
l8_raise:
    adrp x2, l8_exc_tag
    str x0, [x2, :lo12:l8_exc_tag]
    adrp x2, l8_exc_ptr
    str x1, [x2, :lo12:l8_exc_ptr]
    adrp x2, l8_handler_top
    ldr x0, [x2, :lo12:l8_handler_top]
    cbz x0, 9f
    // Rewind the regions entered after the try.
    adrp x3, l8_try_rn
    ldr x4, [x3, :lo12:l8_try_rn]
    cbz x4, 3f
    sub x4, x4, #1
    str x4, [x3, :lo12:l8_try_rn]
    adrp x5, l8_try_regions
    add x5, x5, :lo12:l8_try_regions
    ldr x6, [x5, x4, lsl #3]
    adrp x7, l8_region_n
    adrp x10, l8_region_marks
    add x10, x10, :lo12:l8_region_marks
    adrp x11, heap_ptr
1:
    ldr x4, [x7, :lo12:l8_region_n]
    cmp x4, x6
    b.ls 3f
    sub x4, x4, #1
    str x4, [x7, :lo12:l8_region_n]
    ldr x12, [x10, x4, lsl #3]
    str x12, [x11, :lo12:heap_ptr]
    b 1b
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
    mov x8, #93
    svc #0

// int rdtsc(): the virtual counter.
rdtsc:
    mrs x0, cntvct_el0
    ret
l8_as_int:
    ret
l8_load64:
    ldr x0, [x0, x1]
    ret
// l8_call(fn, a0, a1, a2, a3, a4): call fn with those arguments.
l8_call:
    mov x16, x0
    mov x0, x1
    mov x1, x2
    mov x2, x3
    mov x3, x4
    mov x4, x5
    mov x5, #0
    br x16

// The C library's math functions that L8 programs declare (Linux arm64
// builds have no C library).
    .globl sqrtf
    .globl floorf
sqrtf:
    fsqrt s0, s0
    ret
floorf:
    frintm s0, s0
    ret
