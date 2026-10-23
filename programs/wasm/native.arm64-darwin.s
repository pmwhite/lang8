// Native helpers for the WebAssembly interpreter (programs/wasm): arm64,
// Apple's systems (iOS and its simulator), as native.s is for x86-64
// Linux. AAPCS64: integer arguments in x0-x7, floats in d0-d7, the rest
// on the stack; a result in x0 or d0.
    .section __TEXT,__text,regular,pure_instructions
    .p2align 2

// wasm_mem_map(size): []i8 -- size bytes of zeroed memory that never move
// (an anonymous mapping, committed as touched), as an L8 byte slice: its
// length is the 8 bytes before it. 0 when it cannot be had.
    .globl _wasm_mem_map
_wasm_mem_map:
    stp x29, x30, [sp, #-32]!
    mov x29, sp
    str x19, [sp, #16]
    mov x19, x0
    mov x0, #0
    add x1, x19, #16
    mov x2, #3
    mov x3, #0x1002
    mov x4, #-1
    mov x5, #0
    bl _mmap
    cmn x0, #1
    b.eq Lmap_failed
    str x19, [x0, #8]
    add x0, x0, #16
    ldr x19, [sp, #16]
    ldp x29, x30, [sp], #32
    ret
Lmap_failed:
    mov x0, #0
    ldr x19, [sp, #16]
    ldp x29, x30, [sp], #32
    ret

// wasm_mem_words(m: []i8): []int -- a view of the same memory as words,
// 8 bytes in (its length word is the slice's first 8 bytes).
    .globl _wasm_mem_words
_wasm_mem_words:
    ldur x8, [x0, #-8]
    sub x8, x8, #8
    lsr x8, x8, #3
    str x8, [x0]
    add x0, x0, #8
    ret

// Float bits: the bit pattern of a float, and back.
    .globl _l8_f64_bits
_l8_f64_bits:
    fmov x0, d0
    ret

    .globl _l8_bits_f64
_l8_bits_f64:
    fmov d0, x0
    ret

    .globl _l8_f32_bits
_l8_f32_bits:
    fmov w0, s0
    ret

    .globl _l8_bits_f32
_l8_bits_f32:
    fmov s0, w0
    ret

// wasm_native_call(fp, ints: []int, nints, floats: []f64, nfloats, ret_float): int
// Call a C function: ints[0..7] in x0-x7 (the slice holds at least 8), the
// rest on the stack; floats[0..7] in d0-d7; the result from x0, or from d0
// as bits when ret_float.
    .globl _wasm_native_call
_wasm_native_call:
    stp x29, x30, [sp, #-48]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    stp x21, x22, [sp, #32]
    mov x19, x0
    mov x20, x1
    mov x21, x2
    mov x22, x5
    ldr d0, [x3]
    ldr d1, [x3, #8]
    ldr d2, [x3, #16]
    ldr d3, [x3, #24]
    ldr d4, [x3, #32]
    ldr d5, [x3, #40]
    ldr d6, [x3, #48]
    ldr d7, [x3, #56]
    cmp x21, #8
    b.le Lcall_regs
    sub x8, x21, #8
    lsl x9, x8, #3
    add x9, x9, #15
    lsr x9, x9, #4
    lsl x9, x9, #4
    sub sp, sp, x9
    mov x10, #0
Lcall_copy:
    cmp x10, x8
    b.ge Lcall_regs
    add x11, x10, #8
    lsl x11, x11, #3
    add x11, x20, x11
    ldr x12, [x11]
    lsl x13, x10, #3
    add x13, sp, x13
    str x12, [x13]
    add x10, x10, #1
    b Lcall_copy
Lcall_regs:
    ldp x0, x1, [x20]
    ldp x2, x3, [x20, #16]
    ldp x4, x5, [x20, #32]
    ldp x6, x7, [x20, #48]
    blr x19
    cbz x22, Lcall_done
    fmov x0, d0
Lcall_done:
    mov sp, x29
    ldp x21, x22, [sp, #32]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #48
    ret

// Callbacks: native code calls trampoline k with up to five integer
// arguments; it calls the L8 function given to wasm_native_set_callback
// (its C entry) as callback(k, a0, a1, a2, a3, a4) and returns its result.
    .globl _wasm_native_set_callback
_wasm_native_set_callback:
    adrp x8, wasm_callback_fn@PAGE
    str x0, [x8, wasm_callback_fn@PAGEOFF]
    mov x0, #0
    ret

// wasm_trampoline(k): the address of trampoline k (0..63), 8 bytes each.
    .globl _wasm_trampoline
_wasm_trampoline:
    adrp x8, Lwasm_tramp_0@PAGE
    add x8, x8, Lwasm_tramp_0@PAGEOFF
    lsl x0, x0, #3
    add x0, x8, x0
    ret

Lwasm_tramp_0:
    mov x16, #0
    b Lwasm_tramp_common
Lwasm_tramp_1:
    mov x16, #1
    b Lwasm_tramp_common
Lwasm_tramp_2:
    mov x16, #2
    b Lwasm_tramp_common
Lwasm_tramp_3:
    mov x16, #3
    b Lwasm_tramp_common
Lwasm_tramp_4:
    mov x16, #4
    b Lwasm_tramp_common
Lwasm_tramp_5:
    mov x16, #5
    b Lwasm_tramp_common
Lwasm_tramp_6:
    mov x16, #6
    b Lwasm_tramp_common
Lwasm_tramp_7:
    mov x16, #7
    b Lwasm_tramp_common
Lwasm_tramp_8:
    mov x16, #8
    b Lwasm_tramp_common
Lwasm_tramp_9:
    mov x16, #9
    b Lwasm_tramp_common
Lwasm_tramp_10:
    mov x16, #10
    b Lwasm_tramp_common
Lwasm_tramp_11:
    mov x16, #11
    b Lwasm_tramp_common
Lwasm_tramp_12:
    mov x16, #12
    b Lwasm_tramp_common
Lwasm_tramp_13:
    mov x16, #13
    b Lwasm_tramp_common
Lwasm_tramp_14:
    mov x16, #14
    b Lwasm_tramp_common
Lwasm_tramp_15:
    mov x16, #15
    b Lwasm_tramp_common
Lwasm_tramp_16:
    mov x16, #16
    b Lwasm_tramp_common
Lwasm_tramp_17:
    mov x16, #17
    b Lwasm_tramp_common
Lwasm_tramp_18:
    mov x16, #18
    b Lwasm_tramp_common
Lwasm_tramp_19:
    mov x16, #19
    b Lwasm_tramp_common
Lwasm_tramp_20:
    mov x16, #20
    b Lwasm_tramp_common
Lwasm_tramp_21:
    mov x16, #21
    b Lwasm_tramp_common
Lwasm_tramp_22:
    mov x16, #22
    b Lwasm_tramp_common
Lwasm_tramp_23:
    mov x16, #23
    b Lwasm_tramp_common
Lwasm_tramp_24:
    mov x16, #24
    b Lwasm_tramp_common
Lwasm_tramp_25:
    mov x16, #25
    b Lwasm_tramp_common
Lwasm_tramp_26:
    mov x16, #26
    b Lwasm_tramp_common
Lwasm_tramp_27:
    mov x16, #27
    b Lwasm_tramp_common
Lwasm_tramp_28:
    mov x16, #28
    b Lwasm_tramp_common
Lwasm_tramp_29:
    mov x16, #29
    b Lwasm_tramp_common
Lwasm_tramp_30:
    mov x16, #30
    b Lwasm_tramp_common
Lwasm_tramp_31:
    mov x16, #31
    b Lwasm_tramp_common
Lwasm_tramp_32:
    mov x16, #32
    b Lwasm_tramp_common
Lwasm_tramp_33:
    mov x16, #33
    b Lwasm_tramp_common
Lwasm_tramp_34:
    mov x16, #34
    b Lwasm_tramp_common
Lwasm_tramp_35:
    mov x16, #35
    b Lwasm_tramp_common
Lwasm_tramp_36:
    mov x16, #36
    b Lwasm_tramp_common
Lwasm_tramp_37:
    mov x16, #37
    b Lwasm_tramp_common
Lwasm_tramp_38:
    mov x16, #38
    b Lwasm_tramp_common
Lwasm_tramp_39:
    mov x16, #39
    b Lwasm_tramp_common
Lwasm_tramp_40:
    mov x16, #40
    b Lwasm_tramp_common
Lwasm_tramp_41:
    mov x16, #41
    b Lwasm_tramp_common
Lwasm_tramp_42:
    mov x16, #42
    b Lwasm_tramp_common
Lwasm_tramp_43:
    mov x16, #43
    b Lwasm_tramp_common
Lwasm_tramp_44:
    mov x16, #44
    b Lwasm_tramp_common
Lwasm_tramp_45:
    mov x16, #45
    b Lwasm_tramp_common
Lwasm_tramp_46:
    mov x16, #46
    b Lwasm_tramp_common
Lwasm_tramp_47:
    mov x16, #47
    b Lwasm_tramp_common
Lwasm_tramp_48:
    mov x16, #48
    b Lwasm_tramp_common
Lwasm_tramp_49:
    mov x16, #49
    b Lwasm_tramp_common
Lwasm_tramp_50:
    mov x16, #50
    b Lwasm_tramp_common
Lwasm_tramp_51:
    mov x16, #51
    b Lwasm_tramp_common
Lwasm_tramp_52:
    mov x16, #52
    b Lwasm_tramp_common
Lwasm_tramp_53:
    mov x16, #53
    b Lwasm_tramp_common
Lwasm_tramp_54:
    mov x16, #54
    b Lwasm_tramp_common
Lwasm_tramp_55:
    mov x16, #55
    b Lwasm_tramp_common
Lwasm_tramp_56:
    mov x16, #56
    b Lwasm_tramp_common
Lwasm_tramp_57:
    mov x16, #57
    b Lwasm_tramp_common
Lwasm_tramp_58:
    mov x16, #58
    b Lwasm_tramp_common
Lwasm_tramp_59:
    mov x16, #59
    b Lwasm_tramp_common
Lwasm_tramp_60:
    mov x16, #60
    b Lwasm_tramp_common
Lwasm_tramp_61:
    mov x16, #61
    b Lwasm_tramp_common
Lwasm_tramp_62:
    mov x16, #62
    b Lwasm_tramp_common
Lwasm_tramp_63:
    mov x16, #63
    b Lwasm_tramp_common

Lwasm_tramp_common:
    mov x5, x4
    mov x4, x3
    mov x3, x2
    mov x2, x1
    mov x1, x0
    mov x0, x16
    adrp x8, wasm_callback_fn@PAGE
    ldr x8, [x8, wasm_callback_fn@PAGEOFF]
    br x8

    .section __DATA,__data
    .p2align 3
wasm_callback_fn:
    .quad 0
