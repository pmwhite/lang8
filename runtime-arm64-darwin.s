// L8 runtime for Apple's systems on AArch64 (iOS, and its simulator), for
// `l8 arm64 --target ios` (see src2/arm64.l8). The same entry points as
// runtime.s, over Apple's C library (libSystem) rather than system calls:
// programs there must not make raw system calls.
//
// C's main is the entry; it calls L8's main (here _l8_main). Some of the
// runtime's names are the C library's too but not its meanings: they are
// _l8rt_NAME here (malloc, open, clock_gettime, getrusage, syscall, len,
// rdtsc; see arm_sym). Programs pass Linux's numbers for open's flags and
// clock_gettime's clocks; these take Linux's and give Apple's.
//
// Calls follow AAPCS64. These helpers never touch x19-x29 (x28 is L8's
// stack pointer) beyond their own frames, and those marked "keeps x9" leave
// L8's rax as it was.

    .globl _main
    .globl _l8rt_malloc
    .globl _l8rt_open
    .globl _open_nul
    .globl _l8rt_len
    .globl _l8rt_clock_gettime
    .globl _l8rt_getrusage
    .globl _l8rt_syscall
    .globl _l8rt_rdtsc
    .globl _l8_os_write
    .globl _l8_exit
    .globl _l8_memcpy
    .globl _l8_clock_gettime
    .globl _l8_poll
    .globl _l8_recv
    .globl _l8_send
    .globl _l8_getrandom
    .globl _l8_shutdown
    .globl _l8_socket
    .globl _l8_connect
    .globl _l8_bind
    .globl _l8_listen
    .globl _l8_accept4
    .globl _l8_setsockopt
    .globl _l8_getsockopt
    .globl _l8_fork
    .globl _l8_waitpid
    .globl _l8_ioctl
    .globl _l8_ioctl_value
    .globl _l8_fcntl
    .globl _l8_setsid
    .globl _l8_dup2
    .globl _l8_execve
    .globl _l8_kill
    .globl _l8_environment
    .globl _l8_time
    .globl _l8_try_begin
    .globl _l8_try_end
    .globl _l8_raise
    .globl _l8_exc_tag
    .globl _l8_exc_ptr
    .globl _l8_heap_mark
    .globl _l8_heap_used
    .globl _l8_heap_reset
    .globl _l8_region_push
    .globl _l8_region_pop
    .globl _l8_exc_malloc
    .globl _l8_as_int
    .globl _l8_call
    .globl _l8_load64
    .globl _l8_str_eq
    .globl _l8_opt_str_eq
    .globl _l8_cstr
    .globl _l8_bytes
    .globl _l8rt_argc
    .globl _l8rt_argv
    .globl _l8_msg_hfa
    .globl _l8_run_loop_common_modes
    .globl _l8_msg_hfa_super

    .section __DATA,__data
    .p2align 3
heap_ptr:  .quad 0
heap_base: .quad 0
heap_end:  .quad 0
initial_envp: .quad 0
// C's argc and argv, for UIApplicationMain.
_l8_c_argc: .quad 0
_l8_c_argv: .quad 0
_l8_exc_tag: .quad 0
_l8_exc_ptr: .quad 0
l8_handler_top: .quad 0
l8_region_n: .quad 0
l8_region_marks: .space 512
l8_try_rn: .quad 0
l8_try_regions: .space 512


    .section __DATA,__bss
    .p2align 3
l8_args_header: .space 8
l8_args_values: .space 32768
l8_args_text: .space 4194304
l8_env_header: .space 8
l8_env_values: .space 32768
l8_env_text: .space 4194304
l8_env_ready: .space 8
heap_storage: .space 268435456

    .section __TEXT,__text,regular,pure_instructions
    .p2align 2

// int main(int argc, char **argv, char **envp)
_main:
    stp x29, x30, [sp, #-96]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    stp x21, x22, [sp, #32]
    stp x23, x24, [sp, #48]
    stp x25, x26, [sp, #64]
    stp x27, x28, [sp, #80]
    mov x19, x0
    mov x20, x1
    adrp x8, _l8_c_argc@PAGE
    str x0, [x8, _l8_c_argc@PAGEOFF]
    adrp x8, _l8_c_argv@PAGE
    str x1, [x8, _l8_c_argv@PAGEOFF]
    adrp x8, initial_envp@PAGE
    str x2, [x8, initial_envp@PAGEOFF]
    // Transitional legacy backing is statically reserved zero-fill memory.
    adrp x0, heap_storage@PAGE
    add x0, x0, heap_storage@PAGEOFF
    adrp x8, heap_ptr@PAGE
    str x0, [x8, heap_ptr@PAGEOFF]
    adrp x8, heap_base@PAGE
    str x0, [x8, heap_base@PAGEOFF]
    mov x1, #0x10000000
    add x0, x0, x1
    adrp x8, heap_end@PAGE
    str x0, [x8, heap_end@PAGEOFF]
    mov x0, x20
    mov x1, x19
    adrp x2, l8_args_header@PAGE
    add x2, x2, l8_args_header@PAGEOFF
    adrp x3, l8_args_text@PAGE
    add x3, x3, l8_args_text@PAGEOFF
    bl .Lbounded_process_strings
    mov x1, x0
    mov x0, x19
    sub sp, sp, #16
    mov x28, sp                 // L8's stack starts here
    bl _l8_main
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
    bl _exit

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
    adrp x1, .Lprocess_storage_message@PAGE
    add x1, x1, .Lprocess_storage_message@PAGEOFF
    mov x2, #37
    bl _write
    b .Lalloc_fail
.Lprocess_storage_message:
    .byte 108, 56, 58, 32, 112, 114, 111, 99, 101, 115, 115, 32, 115, 116, 97, 116, 105, 99, 32, 115, 116, 111, 114, 97, 103, 101, 32, 101, 120, 104, 97, 117, 115, 116, 101, 100, 10
    .p2align 2

// ---- the C library, with Linux's meanings ----
// open(path, flags, mode): Linux's O_ flags made Apple's.
_l8rt_open:
_open_nul:
    and x3, x1, #3              // O_RDONLY, O_WRONLY, O_RDWR alike
    tst x1, #64                 // O_CREAT
    b.eq 1f
    orr x3, x3, #0x200
1:
    tst x1, #128                // O_EXCL
    b.eq 1f
    orr x3, x3, #0x800
1:
    tst x1, #512                // O_TRUNC
    b.eq 1f
    orr x3, x3, #0x400
1:
    tst x1, #1024               // O_APPEND
    b.eq 1f
    orr x3, x3, #0x8
1:
    tst x1, #2048               // O_NONBLOCK
    b.eq 1f
    orr x3, x3, #0x4
1:
    tst x1, #0x80000            // O_CLOEXEC
    b.eq 1f
    orr x3, x3, #0x1000000
1:
    mov x1, x3
    // (open is variadic on Apple's systems: its mode goes on the stack.)
    sub sp, sp, #32
    stp x29, x30, [sp, #16]
    add x29, sp, #16
    str x2, [sp]
    bl _open
    ldp x29, x30, [sp, #16]
    add sp, sp, #32
    ret
// clock_gettime(clock, ts): Linux's clocks made Apple's.
_l8rt_clock_gettime:
_l8_clock_gettime:
    cmp x0, #1                  // CLOCK_MONOTONIC
    b.ne 1f
    mov x0, #6
    b _clock_gettime
1:
    cmp x0, #2                  // CLOCK_PROCESS_CPUTIME_ID
    b.ne 1f
    mov x0, #12
1:
    b _clock_gettime
// getrusage(buf): RUSAGE_SELF.
_l8rt_getrusage:
    mov x1, x0
    mov x0, #0
    b _getrusage
// No raw system calls here.
_l8rt_syscall:
    mov x0, #-38                // -ENOSYS
    ret
_l8rt_rdtsc:
    mrs x0, cntvct_el0
    ret
_l8_os_write:
    b _write
_l8_exit:
    b _exit
_l8_poll:
    b _poll
_l8_recv:
    b _recv
_l8_send:
    b _send
// getrandom(buf, n, flags): n random bytes.
_l8_getrandom:
    stp x29, x30, [sp, #-32]!
    str x1, [sp, #16]
    bl _arc4random_buf
    ldr x0, [sp, #16]
    ldp x29, x30, [sp], #32
    ret
_l8_shutdown:
    b _shutdown
_l8_socket:
    b _socket
_l8_connect:
    b _connect
_l8_bind:
    b _bind
_l8_listen:
    b _listen
_l8_accept4:
    mov x3, #0
    b _accept
_l8_setsockopt:
    b _setsockopt
_l8_getsockopt:
    b _getsockopt
_l8_fork:
    mov x0, #-1                 // not on iOS
    ret
_l8_waitpid:
    b _waitpid
_l8_ioctl:
_l8_ioctl_value:
    b _ioctl
_l8_fcntl:
    b _fcntl
_l8_setsid:
    b _setsid
_l8_dup2:
    b _dup2
_l8_execve:
    mov x0, #-1                 // not on iOS
    ret
_l8_kill:
    b _kill
_l8_time:
    mov x0, #0
    b _time

// A permanent counted snapshot; repeated reads do not consume any heap.
_l8_environment:
    adrp x1, l8_env_ready@PAGE
    ldr x0, [x1, l8_env_ready@PAGEOFF]
    cbz x0, .Lbounded_env_init
    adrp x0, l8_env_values@PAGE
    add x0, x0, l8_env_values@PAGEOFF
    ret
.Lbounded_env_init:
    stp x29, x30, [sp, #-16]!
    mov x29, sp
    adrp x0, initial_envp@PAGE
    ldr x0, [x0, initial_envp@PAGEOFF]
    mov x1, #-1
    adrp x2, l8_env_header@PAGE
    add x2, x2, l8_env_header@PAGEOFF
    adrp x3, l8_env_text@PAGE
    add x3, x3, l8_env_text@PAGEOFF
    bl .Lbounded_process_strings
    adrp x1, l8_env_ready@PAGE
    mov x2, #1
    str x2, [x1, l8_env_ready@PAGEOFF]
    ldp x29, x30, [sp], #16
    ret

_l8_heap_mark:
    adrp x0, heap_ptr@PAGE
    ldr x0, [x0, heap_ptr@PAGEOFF]
    ret
_l8_heap_used:
    adrp x0, heap_ptr@PAGE
    ldr x0, [x0, heap_ptr@PAGEOFF]
    adrp x1, heap_base@PAGE
    ldr x1, [x1, heap_base@PAGEOFF]
    sub x0, x0, x1
    ret
_l8_heap_reset:
    adrp x1, heap_ptr@PAGE
    str x0, [x1, heap_ptr@PAGEOFF]
    ret
_l8_region_push:
    adrp x1, l8_region_n@PAGE
    ldr x2, [x1, l8_region_n@PAGEOFF]
    cmp x2, #63
    b.hi 1f
    adrp x3, l8_region_marks@PAGE
    add x3, x3, l8_region_marks@PAGEOFF
    str x0, [x3, x2, lsl #3]
    add x2, x2, #1
    str x2, [x1, l8_region_n@PAGEOFF]
    ret
1:
    mov x0, #1
    bl _exit
_l8_region_pop:
    adrp x1, l8_region_n@PAGE
    ldr x2, [x1, l8_region_n@PAGEOFF]
    cbz x2, 1f
    sub x2, x2, #1
    str x2, [x1, l8_region_n@PAGEOFF]
    adrp x3, l8_region_marks@PAGE
    add x3, x3, l8_region_marks@PAGEOFF
    ldr x4, [x3, x2, lsl #3]
    adrp x5, heap_ptr@PAGE
    str x4, [x5, heap_ptr@PAGEOFF]
1:
    ret
_l8_exc_malloc:
    add x0, x0, #7
    and x0, x0, #-8
    adrp x1, heap_end@PAGE
    ldr x2, [x1, heap_end@PAGEOFF]
    sub x2, x2, x0
    adrp x3, heap_ptr@PAGE
    ldr x3, [x3, heap_ptr@PAGEOFF]
    cmp x3, x2
    b.hi 1f
    str x2, [x1, heap_end@PAGEOFF]
    mov x0, x2
    ret
1:
    mov x0, #0
    ret
// void *malloc(size): bump, 8-byte aligned; 0 when the heap is full.
_l8rt_malloc:
    adrp x1, heap_ptr@PAGE
    ldr x2, [x1, heap_ptr@PAGEOFF]
    add x0, x0, #7
    and x0, x0, #-8
    add x3, x2, x0
    adrp x4, heap_end@PAGE
    ldr x4, [x4, heap_end@PAGEOFF]
    cmp x3, x4
    b.hi 1f
    str x3, [x1, heap_ptr@PAGEOFF]
    mov x0, x2
    ret
1:
    mov x0, #0
    ret
_l8rt_len:
    ldur x0, [x0, #-8]
    ret
_l8_opt_str_eq:
    cbz x0, 1f
    cbz x1, .Lstr_ne
    b _l8_str_eq
1:
    cbz x1, .Lstr_yes
    b .Lstr_ne
_l8_str_eq:
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
_l8_cstr:
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
    bl _l8rt_malloc
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
    bl _exit
_l8_bytes:
    stp x29, x30, [sp, #-32]!
    stp x19, x20, [sp, #16]
    mov x19, x0
    ldur x20, [x19, #-8]
    add x0, x20, #8
    bl _l8rt_malloc
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
_l8_memcpy:
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
_l8_try_begin:
    str x19, [x0, #0]
    str x29, [x0, #8]
    str x20, [x0, #16]
    str x21, [x0, #24]
    str x22, [x0, #32]
    str x23, [x0, #40]
    str x28, [x0, #48]
    str x30, [x0, #56]
    adrp x1, l8_try_rn@PAGE
    ldr x2, [x1, l8_try_rn@PAGEOFF]
    cmp x2, #63
    b.hi 1f
    adrp x3, l8_try_regions@PAGE
    add x3, x3, l8_try_regions@PAGEOFF
    adrp x4, l8_region_n@PAGE
    ldr x4, [x4, l8_region_n@PAGEOFF]
    str x4, [x3, x2, lsl #3]
    add x2, x2, #1
    str x2, [x1, l8_try_rn@PAGEOFF]
    adrp x1, l8_handler_top@PAGE
    ldr x2, [x1, l8_handler_top@PAGEOFF]
    str x2, [x0, #64]
    str x0, [x1, l8_handler_top@PAGEOFF]
    mov x0, #0
    ret
1:
    mov x0, #1
    bl _exit
_l8_try_end:
    adrp x1, l8_handler_top@PAGE
    ldr x0, [x1, l8_handler_top@PAGEOFF]
    cbz x0, 1f
    ldr x2, [x0, #64]
    str x2, [x1, l8_handler_top@PAGEOFF]
    adrp x1, l8_try_rn@PAGE
    ldr x2, [x1, l8_try_rn@PAGEOFF]
    cbz x2, 1f
    sub x2, x2, #1
    str x2, [x1, l8_try_rn@PAGEOFF]
1:
    ret
_l8_raise:
    adrp x2, _l8_exc_tag@PAGE
    str x0, [x2, _l8_exc_tag@PAGEOFF]
    adrp x2, _l8_exc_ptr@PAGE
    str x1, [x2, _l8_exc_ptr@PAGEOFF]
    adrp x2, l8_handler_top@PAGE
    ldr x0, [x2, l8_handler_top@PAGEOFF]
    cbz x0, 9f
    adrp x3, l8_try_rn@PAGE
    ldr x4, [x3, l8_try_rn@PAGEOFF]
    cbz x4, 3f
    sub x4, x4, #1
    str x4, [x3, l8_try_rn@PAGEOFF]
    adrp x5, l8_try_regions@PAGE
    add x5, x5, l8_try_regions@PAGEOFF
    ldr x6, [x5, x4, lsl #3]
    adrp x7, l8_region_n@PAGE
    add x7, x7, l8_region_n@PAGEOFF
    adrp x10, l8_region_marks@PAGE
    add x10, x10, l8_region_marks@PAGEOFF
    adrp x11, heap_ptr@PAGE
    add x11, x11, heap_ptr@PAGEOFF
1:
    ldr x4, [x7]
    cmp x4, x6
    b.ls 3f
    sub x4, x4, #1
    str x4, [x7]
    ldr x12, [x10, x4, lsl #3]
    str x12, [x11]
    b 1b
3:
    ldr x4, [x0, #64]
    str x4, [x2, l8_handler_top@PAGEOFF]
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
    bl _exit

_l8_as_int:
    ret
_l8_load64:
    ldr x0, [x0, x1]
    ret
_l8_call:
    mov x16, x0
    mov x0, x1
    mov x1, x2
    mov x2, x3
    mov x3, x4
    mov x4, x5
    mov x5, #0
    br x16

// C's argc and argv, kept by main (for UIApplicationMain).
_l8rt_argc:
    adrp x0, _l8_c_argc@PAGE
    ldr x0, [x0, _l8_c_argc@PAGEOFF]
    ret
_l8rt_argv:
    adrp x0, _l8_c_argv@PAGE
    ldr x0, [x0, _l8_c_argv@PAGEOFF]
    ret

// ---- Objective-C ----
// l8_msg_hfa(out, receiver, selector, a, b, c): objc_msgSend(receiver,
// selector, a, b, c), for a method that returns up to four doubles (a
// CGPoint, a CGSize, a CGRect, UIEdgeInsets...), which come back in d0-d3:
// stored at out. L8 can receive one float result, but not four.
_l8_msg_hfa:
    stp x29, x30, [sp, #-32]!
    mov x29, sp
    str x0, [sp, #16]
    mov x0, x1
    mov x1, x2
    mov x2, x3
    mov x3, x4
    mov x4, x5
    bl _objc_msgSend
    ldr x16, [sp, #16]
    stp d0, d1, [x16]
    stp d2, d3, [x16, #16]
    ldp x29, x30, [sp], #32
    ret
// l8_msg_hfa_super: the same through objc_msgSendSuper (receiver is a
// struct objc_super *).
_l8_msg_hfa_super:
    stp x29, x30, [sp, #-32]!
    mov x29, sp
    str x0, [sp, #16]
    mov x0, x1
    mov x1, x2
    mov x2, x3
    mov x3, x4
    mov x4, x5
    bl _objc_msgSendSuper
    ldr x16, [sp, #16]
    stp d0, d1, [x16]
    stp d2, d3, [x16, #16]
    ldp x29, x30, [sp], #32
    ret

// NSRunLoopCommonModes, the object (the run loop knows the common modes by
// that object, not by its text).
_l8_run_loop_common_modes:
    adrp x0, _NSRunLoopCommonModes@GOTPAGE
    ldr x0, [x0, _NSRunLoopCommonModes@GOTPAGEOFF]
    ldr x0, [x0]
    ret

// The C library's math functions that L8 programs declare come from
// libSystem itself (sqrtf, floorf).
