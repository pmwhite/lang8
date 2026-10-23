# Native helpers for the WebAssembly interpreter (programs/wasm): x86-64
# Linux, in the subset L8's own assembler takes (no xmm moves but movdqu,
# no scaled addressing). native.arm64-darwin.s is the same for iOS.
.section .text

# wasm_mem_map(size): []i8 -- size bytes of zeroed memory that never move
# (mmap, reserved but not committed), as an L8 byte slice: its length is
# the 8 bytes before it. wasm_mem_words gives a second view of the same
# memory as []int, starting 8 bytes in (its length word is the slice's
# first 8 bytes, which a module never uses). 0 when it cannot be had.
.globl wasm_mem_map
wasm_mem_map:
    push %rbx
    mov %rdi, %rbx
    mov $9, %rax
    mov $0, %rdi
    mov %rbx, %rsi
    add $16, %rsi
    mov $3, %rdx
    mov $16418, %r10
    mov $-1, %r8
    mov $0, %r9
    syscall
    cmp $-4095, %rax
    jae .Lmap_failed
    mov %rbx, 8(%rax)
    add $16, %rax
    pop %rbx
    ret
.Lmap_failed:
    mov $0, %rax
    pop %rbx
    ret

# wasm_mem_words(m: []i8): []int
.globl wasm_mem_words
wasm_mem_words:
    mov -8(%rdi), %rax
    sub $8, %rax
    sar $3, %rax
    mov %rax, (%rdi)
    lea 8(%rdi), %rax
    ret

# Float bits: the bit pattern of a float, and back (through the red zone).
.globl l8_f64_bits
l8_f64_bits:
    movdqu %xmm0, -16(%rsp)
    mov -16(%rsp), %rax
    ret

.globl l8_bits_f64
l8_bits_f64:
    mov %rdi, -16(%rsp)
    movdqu -16(%rsp), %xmm0
    ret

.globl l8_f32_bits
l8_f32_bits:
    movdqu %xmm0, -16(%rsp)
    mov -16(%rsp), %rax
    mov $4294967295, %rcx
    and %rcx, %rax
    ret

.globl l8_bits_f32
l8_bits_f32:
    mov %rdi, -16(%rsp)
    movdqu -16(%rsp), %xmm0
    ret

# wasm_native_call(fp, ints: []int, nints, floats: []f64, nfloats, ret_float): int
# Call a C function: ints[0..5] in the integer argument registers, the rest
# on the stack; floats[0..7] in xmm0-7 (the slice holds at least 10); the
# result from rax, or from xmm0 as bits when ret_float.
.globl wasm_native_call
wasm_native_call:
    push %rbp
    mov %rsp, %rbp
    push %rbx
    push %r12
    push %r13
    push %r14
    mov %rdi, %r11
    mov %rsi, %r12
    mov %rdx, %r13
    mov %r9, %r14
    movdqu 0(%rcx), %xmm0
    movdqu 8(%rcx), %xmm1
    movdqu 16(%rcx), %xmm2
    movdqu 24(%rcx), %xmm3
    movdqu 32(%rcx), %xmm4
    movdqu 40(%rcx), %xmm5
    movdqu 48(%rcx), %xmm6
    movdqu 56(%rcx), %xmm7
    mov %r13, %rcx
    sub $6, %rcx
    jle .Lcall_regs
    mov %rcx, %rbx
    and $1, %rbx
    jz .Lcall_push
    sub $8, %rsp
.Lcall_push:
    mov %r13, %rbx
    sub $1, %rbx
.Lcall_push_loop:
    mov %rbx, %rax
    shl $3, %rax
    add %r12, %rax
    mov (%rax), %rax
    push %rax
    sub $1, %rbx
    cmp $6, %rbx
    jge .Lcall_push_loop
.Lcall_regs:
    mov 0(%r12), %rdi
    mov 8(%r12), %rsi
    mov 16(%r12), %rdx
    mov 24(%r12), %rcx
    mov 32(%r12), %r8
    mov 40(%r12), %r9
    mov $8, %rax
    call *%r11
    test %r14, %r14
    jz .Lcall_done
    movdqu %xmm0, -16(%rsp)
    mov -16(%rsp), %rax
.Lcall_done:
    lea -32(%rbp), %rsp
    pop %r14
    pop %r13
    pop %r12
    pop %rbx
    pop %rbp
    ret

# Callbacks: native code calls trampoline k with up to five integer
# arguments; it calls the L8 function given to wasm_native_set_callback as
# callback(k, a0, a1, a2, a3, a4) and returns its result.
.globl wasm_native_set_callback
wasm_native_set_callback:
    mov %rdi, wasm_callback_fn(%rip)
    mov $0, %rax
    ret

# wasm_trampoline(k): the address of trampoline k (0..63); the stubs are
# all one size.
.globl wasm_trampoline
wasm_trampoline:
    lea wasm_tramp_0(%rip), %rax
    lea wasm_tramp_1(%rip), %rcx
    sub %rax, %rcx
    imul %rcx, %rdi
    add %rdi, %rax
    ret

wasm_tramp_0:
    mov $0, %rax
    jmp wasm_tramp_common
wasm_tramp_1:
    mov $1, %rax
    jmp wasm_tramp_common
wasm_tramp_2:
    mov $2, %rax
    jmp wasm_tramp_common
wasm_tramp_3:
    mov $3, %rax
    jmp wasm_tramp_common
wasm_tramp_4:
    mov $4, %rax
    jmp wasm_tramp_common
wasm_tramp_5:
    mov $5, %rax
    jmp wasm_tramp_common
wasm_tramp_6:
    mov $6, %rax
    jmp wasm_tramp_common
wasm_tramp_7:
    mov $7, %rax
    jmp wasm_tramp_common
wasm_tramp_8:
    mov $8, %rax
    jmp wasm_tramp_common
wasm_tramp_9:
    mov $9, %rax
    jmp wasm_tramp_common
wasm_tramp_10:
    mov $10, %rax
    jmp wasm_tramp_common
wasm_tramp_11:
    mov $11, %rax
    jmp wasm_tramp_common
wasm_tramp_12:
    mov $12, %rax
    jmp wasm_tramp_common
wasm_tramp_13:
    mov $13, %rax
    jmp wasm_tramp_common
wasm_tramp_14:
    mov $14, %rax
    jmp wasm_tramp_common
wasm_tramp_15:
    mov $15, %rax
    jmp wasm_tramp_common
wasm_tramp_16:
    mov $16, %rax
    jmp wasm_tramp_common
wasm_tramp_17:
    mov $17, %rax
    jmp wasm_tramp_common
wasm_tramp_18:
    mov $18, %rax
    jmp wasm_tramp_common
wasm_tramp_19:
    mov $19, %rax
    jmp wasm_tramp_common
wasm_tramp_20:
    mov $20, %rax
    jmp wasm_tramp_common
wasm_tramp_21:
    mov $21, %rax
    jmp wasm_tramp_common
wasm_tramp_22:
    mov $22, %rax
    jmp wasm_tramp_common
wasm_tramp_23:
    mov $23, %rax
    jmp wasm_tramp_common
wasm_tramp_24:
    mov $24, %rax
    jmp wasm_tramp_common
wasm_tramp_25:
    mov $25, %rax
    jmp wasm_tramp_common
wasm_tramp_26:
    mov $26, %rax
    jmp wasm_tramp_common
wasm_tramp_27:
    mov $27, %rax
    jmp wasm_tramp_common
wasm_tramp_28:
    mov $28, %rax
    jmp wasm_tramp_common
wasm_tramp_29:
    mov $29, %rax
    jmp wasm_tramp_common
wasm_tramp_30:
    mov $30, %rax
    jmp wasm_tramp_common
wasm_tramp_31:
    mov $31, %rax
    jmp wasm_tramp_common
wasm_tramp_32:
    mov $32, %rax
    jmp wasm_tramp_common
wasm_tramp_33:
    mov $33, %rax
    jmp wasm_tramp_common
wasm_tramp_34:
    mov $34, %rax
    jmp wasm_tramp_common
wasm_tramp_35:
    mov $35, %rax
    jmp wasm_tramp_common
wasm_tramp_36:
    mov $36, %rax
    jmp wasm_tramp_common
wasm_tramp_37:
    mov $37, %rax
    jmp wasm_tramp_common
wasm_tramp_38:
    mov $38, %rax
    jmp wasm_tramp_common
wasm_tramp_39:
    mov $39, %rax
    jmp wasm_tramp_common
wasm_tramp_40:
    mov $40, %rax
    jmp wasm_tramp_common
wasm_tramp_41:
    mov $41, %rax
    jmp wasm_tramp_common
wasm_tramp_42:
    mov $42, %rax
    jmp wasm_tramp_common
wasm_tramp_43:
    mov $43, %rax
    jmp wasm_tramp_common
wasm_tramp_44:
    mov $44, %rax
    jmp wasm_tramp_common
wasm_tramp_45:
    mov $45, %rax
    jmp wasm_tramp_common
wasm_tramp_46:
    mov $46, %rax
    jmp wasm_tramp_common
wasm_tramp_47:
    mov $47, %rax
    jmp wasm_tramp_common
wasm_tramp_48:
    mov $48, %rax
    jmp wasm_tramp_common
wasm_tramp_49:
    mov $49, %rax
    jmp wasm_tramp_common
wasm_tramp_50:
    mov $50, %rax
    jmp wasm_tramp_common
wasm_tramp_51:
    mov $51, %rax
    jmp wasm_tramp_common
wasm_tramp_52:
    mov $52, %rax
    jmp wasm_tramp_common
wasm_tramp_53:
    mov $53, %rax
    jmp wasm_tramp_common
wasm_tramp_54:
    mov $54, %rax
    jmp wasm_tramp_common
wasm_tramp_55:
    mov $55, %rax
    jmp wasm_tramp_common
wasm_tramp_56:
    mov $56, %rax
    jmp wasm_tramp_common
wasm_tramp_57:
    mov $57, %rax
    jmp wasm_tramp_common
wasm_tramp_58:
    mov $58, %rax
    jmp wasm_tramp_common
wasm_tramp_59:
    mov $59, %rax
    jmp wasm_tramp_common
wasm_tramp_60:
    mov $60, %rax
    jmp wasm_tramp_common
wasm_tramp_61:
    mov $61, %rax
    jmp wasm_tramp_common
wasm_tramp_62:
    mov $62, %rax
    jmp wasm_tramp_common
wasm_tramp_63:
    mov $63, %rax
    jmp wasm_tramp_common

wasm_tramp_common:
    mov %r8, %r9
    mov %rcx, %r8
    mov %rdx, %rcx
    mov %rsi, %rdx
    mov %rdi, %rsi
    mov %rax, %rdi
    mov wasm_callback_fn(%rip), %r11
    jmp *%r11

.section .data
.align 8
wasm_callback_fn:
    .quad 0
