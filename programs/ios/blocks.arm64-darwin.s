// Blocks for UIKit and Foundation (block.l8): the code a block runs, for a
// block made by hand. A block's record, as block.l8 makes it, is ten words:
//
//   0  isa: _NSConcreteGlobalBlock (the runtime never copies or frees it)
//   1  flags: BLOCK_IS_GLOBAL | BLOCK_HAS_SIGNATURE
//   2  invoke: one of the shims below
//   3  descriptor: the record's own words 7 to 9
//   4  handler: an L8 function, by the address C calls it at (its C entry;
//      under hot reload, a trampoline into the module)
//   5  context: a word given to the handler first
//   6  objects: which of the block's arguments are objects (bit 0 the
//      first), kept while a call waits for the main thread
//   7  descriptor's reserved word
//   8  descriptor's size: 56, the block's words 0 to 6
//   9  descriptor's signature: its Objective-C type encoding
//
// A shim calls the handler with the context and then the block's own
// arguments (up to four, whole numbers or objects): handler(context, a,
// b, c, d). Floating-point arguments are not passed on.

    .section __TEXT,__text,regular,pure_instructions
    .p2align 2

    .globl _l8_block_call
    .globl _l8_block_call_double
    .globl _l8_block_call_main
    .globl _l8_block_main_entry
    .globl _l8_block_invoke
    .globl _l8_block_invoke_double
    .globl _l8_block_f64_bits

// The handler called with the block's arguments, its result (a whole
// number, an object, or none) the block's.
_l8_block_call:
    ldr x16, [x0, #32]
    ldr x0, [x0, #40]
    br x16

// The handler called, its result the bits of a double (l8_block_f64_bits): the
// block's result is that double (a sheet's height for a detent, say).
_l8_block_call_double:
    stp x29, x30, [sp, #-16]!
    mov x29, sp
    ldr x16, [x0, #32]
    ldr x0, [x0, #40]
    blr x16
    fmov d0, x0
    ldp x29, x30, [sp], #16
    ret

// A block whose handler must run on the main thread (the app's code runs
// nowhere else) though the block is called on another (a completion
// handler on a framework's queue): on the main thread, the handler called
// at once; elsewhere, the call kept (handler, context, arguments and the
// objects mask, the objects among them retained) and made on the main
// queue (l8_block_main_entry), the block returning at once. Its result is
// none.
_l8_block_call_main:
    stp x29, x30, [sp, #-64]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    stp x0, x1, [sp, #32]
    stp x2, x3, [sp, #48]
    mov x19, x4
    bl _pthread_main_np
    cbz w0, .Lmain_elsewhere
    // (On the main thread: called now, as l8_block_call calls it.)
    ldp x0, x1, [sp, #32]
    ldp x2, x3, [sp, #48]
    mov x4, x19
    ldr x16, [x0, #32]
    ldr x0, [x0, #40]
    blr x16
    b .Lmain_done
.Lmain_elsewhere:
    // (The call, kept in seven words: handler, context, a, b, c, d,
    // objects.)
    mov x0, #56
    bl _malloc
    cbz x0, .Lmain_done
    mov x20, x0
    ldr x16, [sp, #32]
    ldr x9, [x16, #32]
    ldr x10, [x16, #40]
    stp x9, x10, [x20]
    ldp x9, x10, [sp, #40]
    stp x9, x10, [x20, #16]
    ldr x9, [sp, #56]
    stp x9, x19, [x20, #32]
    ldr x9, [x16, #48]
    str x9, [x20, #48]
    // (Its objects retained, for as long as the call waits.)
    mov x0, x20
    bl l8_block_objects_retain
    adrp x0, __dispatch_main_q@GOTPAGE
    ldr x0, [x0, __dispatch_main_q@GOTPAGEOFF]
    mov x1, x20
    adrp x2, _l8_block_main_entry@PAGE
    add x2, x2, _l8_block_main_entry@PAGEOFF
    bl _dispatch_async_f
.Lmain_done:
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #64
    ret

// A kept call (l8_block_call_main) made, on the main queue: the handler
// called, the call's objects released and its words freed.
_l8_block_main_entry:
    stp x29, x30, [sp, #-32]!
    mov x29, sp
    str x19, [sp, #16]
    mov x19, x0
    ldp x16, x0, [x19]
    ldp x1, x2, [x19, #16]
    ldp x3, x4, [x19, #32]
    blr x16
    mov x0, x19
    bl l8_block_objects_release
    mov x0, x19
    bl _free
    ldr x19, [sp, #16]
    ldp x29, x30, [sp], #32
    ret

// The objects among a kept call's arguments (x0: its words; the mask at
// word 6, bit k for argument k at word 2 + k) retained, or released.
l8_block_objects_retain:
    stp x29, x30, [sp, #-32]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    mov x19, x0
    mov x20, #0
.Lretain_next:
    ldr x9, [x19, #48]
    lsr x9, x9, x20
    and x9, x9, #1
    cbz x9, .Lretain_skip
    lsl x10, x20, #3
    add x10, x10, x19
    ldr x0, [x10, #16]
    bl _objc_retain
.Lretain_skip:
    add x20, x20, #1
    cmp x20, #4
    b.ne .Lretain_next
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #32
    ret

l8_block_objects_release:
    stp x29, x30, [sp, #-32]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    mov x19, x0
    mov x20, #0
.Lrelease_next:
    ldr x9, [x19, #48]
    lsr x9, x9, x20
    and x9, x9, #1
    cbz x9, .Lrelease_skip
    lsl x10, x20, #3
    add x10, x10, x19
    ldr x0, [x10, #16]
    bl _objc_release
.Lrelease_skip:
    add x20, x20, #1
    cmp x20, #4
    b.ne .Lrelease_next
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #32
    ret

// l8_block_invoke(block, a, b, c): a block called as C calls it, with up
// to three whole-number or object arguments, its result a whole number or
// an object (a block given to the app, or one of its own, tried).
_l8_block_invoke:
    ldr x16, [x0, #16]
    br x16

// l8_block_invoke_double(block, a): a block called whose result is a
// double.
_l8_block_invoke_double:
    ldr x16, [x0, #16]
    br x16

// l8_block_f64_bits(x): a double's bits as a whole number (a double handler's
// result, for l8_block_call_double).
_l8_block_f64_bits:
    fmov x0, d0
    ret
