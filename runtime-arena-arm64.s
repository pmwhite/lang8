// Shared owned-arena runtime for AArch64. Platform runtimes provide the
// state address, map/unmap, and failure adapters. All allocation metadata
// remains outside user allocations. Header: borrows, bump, end, chunks, root.
    .p2align 2
.Larm_arena_frame_push:
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    ldr x4, [x15, #32]
    ldr x5, [x4]
    cmp x5, #64
    b.hs .Larm_arena_fail
    ldr x6, [x15, #40]
    add x6, x6, x5, lsl #5
    stp x0, x1, [x6]
    stp x2, x3, [x6, #16]
    add x5, x5, #1
    str x5, [x4]
    ldp x9, x30, [sp], #16
    ret

.Larm_arena_new:
    stp x19, x30, [sp, #-32]!
    str x20, [sp, #16]
    mov x0, #4096
    bl .Larm_arena_map
    cbz x0, 3f
    mov x19, x0
    mov x0, #65536
    bl .Larm_arena_map
    cbz x0, 2f
    mov x20, x0
    str xzr, [x20]
    mov x1, #65536
    str x1, [x20, #8]
    str xzr, [x19]
    str xzr, [x19, #32]
    str x20, [x19, #24]
    add x0, x20, #16
    str x0, [x19, #8]
    add x0, x20, #65536
    str x0, [x19, #16]
    bl .Larm_arena_state_address
    ldr x0, [x15, #8]
    add x0, x0, #1
    str x0, [x15, #8]
    mov x0, x19
    b 3f
2:
    mov x0, x19
    mov x1, #4096
    bl .Larm_arena_unmap
    mov x0, #0
3:
    ldr x20, [sp, #16]
    ldp x19, x30, [sp], #32
    ret

.Larm_arena_live:
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    ldr x0, [x15, #8]
    ldp x9, x30, [sp], #16
    ret

.Larm_arena_reserve_bytes:
    stp x19, x30, [sp, #-48]!
    stp x20, x21, [sp, #16]
    str x22, [sp, #32]
    mov x19, x0
    cmp x19, #0
    b.lt 2f
    add x20, x19, #4095
    adds x20, x20, #24
    b.vs 2f
    and x20, x20, #-4096
    bl .Larm_arena_state_address
    ldr x21, [x15]
    mov x0, x20
    bl .Larm_arena_map
    cbz x0, 2f
    stp x20, x19, [x0, #8]
    cbz x21, 1f
    ldr x1, [x21, #24]
    str x1, [x0]
    str x0, [x21, #24]
    add x1, x0, x20
    stp x1, x1, [x21, #8]
1:
    add x0, x0, #24
    b 3f
2:
    mov x0, #0
3:
    ldr x22, [sp, #32]
    ldp x20, x21, [sp, #16]
    ldp x19, x30, [sp], #48
    ret

.Larm_arena_free:
    cbz x0, 4f
    stp x19, x30, [sp, #-48]!
    stp x20, x21, [sp, #16]
    str x22, [sp, #32]
    mov x19, x0
    ldr x1, [x19]
    cbnz x1, .Larm_arena_fail
    ldr x20, [x19, #24]
1:
    cbz x20, 2f
    ldr x21, [x20]
    ldr x1, [x20, #8]
    mov x0, x20
    bl .Larm_arena_unmap
    mov x20, x21
    b 1b
2:
    mov x0, x19
    mov x1, #4096
    bl .Larm_arena_unmap
    bl .Larm_arena_state_address
    ldr x0, [x15, #8]
    sub x0, x0, #1
    str x0, [x15, #8]
    ldr x22, [sp, #32]
    ldp x20, x21, [sp, #16]
    ldp x19, x30, [sp], #48
4:
    ret

// x0=size, x1=header. Normal allocation has already checked the size.
.Larm_arena_malloc:
    stp x19, x30, [sp, #-48]!
    stp x20, x21, [sp, #16]
    str x22, [sp, #32]
    mov x19, x1
    add x20, x0, #7
    and x20, x20, #-8
    ldr x0, [x19, #8]
    add x2, x0, x20
    ldr x3, [x19, #16]
    cmp x2, x3
    b.hi 1f
    str x2, [x19, #8]
    b 3f
1:
    add x22, x20, #16
    mov x2, #65536
    cmp x22, x2
    b.hs 2f
    mov x22, x2
2:
    add x22, x22, #4095
    and x22, x22, #-4096
    mov x0, x22
    bl .Larm_arena_map
    cbz x0, 3f
    ldr x1, [x19, #24]
    stp x1, x22, [x0]
    str x0, [x19, #24]
    add x1, x0, x22
    str x1, [x19, #16]
    add x0, x0, #16
    add x1, x0, x20
    str x1, [x19, #8]
3:
    ldr x22, [sp, #32]
    ldp x20, x21, [sp, #16]
    ldp x19, x30, [sp], #48
    ret

.Larm_arena_own_enter:
    cbz x0, .Larm_arena_fail
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    ldr x2, [x15]
    str x0, [x15]
    mov x1, x0
    mov x0, #1
    mov x3, #0
    bl .Larm_arena_frame_push
    ldp x9, x30, [sp], #16
    ret

.Larm_arena_own_commit:
    str x1, [x0, #32]
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    ldr x2, [x15, #32]
    ldr x3, [x2]
    sub x3, x3, #1
    str x3, [x2]
    ldr x4, [x15, #40]
    add x4, x4, x3, lsl #5
    ldr x5, [x4, #16]
    str x5, [x15]
    ldp x9, x30, [sp], #16
    ret

.Larm_arena_borrow_enter:
    cbz x0, .Larm_arena_fail
    ldr x1, [x0]
    add x1, x1, #1
    str x1, [x0]
    mov x1, x0
    mov x0, #3
    mov x2, #0
    mov x3, #0
    b .Larm_arena_frame_push

.Larm_arena_alloc_enter:
    cbz x0, .Larm_arena_fail
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    ldr x2, [x15]
    str x0, [x15]
    mov x1, x0
    mov x0, #2
    mov x3, #0
    bl .Larm_arena_frame_push
    ldp x9, x30, [sp], #16
    ret

// A region is always on the process heap: entered in an arena (frame kind
// 5), the arena is suspended until it ends, so what an allocate of that
// arena adds within it stays.
.Larm_arena_region_push:
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    mov x2, x0
    ldr x1, [x15]
    mov x3, #0
    mov x0, #0
    cbz x1, 1f
    ldr x2, [x15, #16]
    ldr x2, [x2]
    str xzr, [x15]
    mov x0, #5
1:
    bl .Larm_arena_frame_push
    ldp x9, x30, [sp], #16
    ret

// Preserve the expression result (x9), and the native-call result (x0).
.Larm_arena_region_pop:
    stp x0, x30, [sp, #-80]!
    stp x9, x19, [sp, #16]
    stp x20, x21, [sp, #32]
    stp x22, x23, [sp, #48]
    bl .Larm_arena_state_address
    mov x19, x15
    ldr x4, [x19, #32]
    ldr x5, [x4]
    cbz x5, 9f
    sub x5, x5, #1
    str x5, [x4]
    ldr x20, [x19, #40]
    add x20, x20, x5, lsl #5
    ldp x0, x21, [x20]
    ldp x22, x23, [x20, #16]
    cbz x0, 4f
    cmp x0, #1
    b.eq 5f
    cmp x0, #3
    b.eq 6f
    cmp x0, #5
    b.eq 7f
    str x22, [x19]
    b 9f
4:
    ldr x0, [x19, #16]
    str x22, [x0]
    b 9f
7:
    ldr x0, [x19, #16]
    str x22, [x0]
    str x21, [x19]
    b 9f
5:
    str x22, [x19]
    mov x0, x21
    bl .Larm_arena_free
    b 9f
6:
    ldr x0, [x21]
    sub x0, x0, #1
    str x0, [x21]
9:
    ldp x22, x23, [sp, #48]
    ldp x20, x21, [sp, #32]
    ldp x9, x19, [sp, #16]
    ldp x0, x30, [sp], #80
    ret

.Larm_arena_heap_mark:
    stp x9, x30, [sp, #-16]!
    bl .Larm_arena_state_address
    ldr x0, [x15]
    cbz x0, 1f
    ldr x0, [x0, #8]
    b 2f
1:
    ldr x0, [x15, #16]
    ldr x0, [x0]
2:
    ldp x9, x30, [sp], #16
    ret

.Larm_arena_suspend:
    stp x0, x1, [sp, #-96]!
    stp x2, x3, [sp, #16]
    stp x4, x5, [sp, #32]
    stp x6, x7, [sp, #48]
    stp x8, x9, [sp, #64]
    str x30, [sp, #80]
    bl .Larm_arena_state_address
    ldr x2, [x15]
    str xzr, [x15]
    mov x0, #4
    mov x1, #0
    mov x3, #0
    bl .Larm_arena_frame_push
    ldr x30, [sp, #80]
    ldp x8, x9, [sp, #64]
    ldp x6, x7, [sp, #48]
    ldp x4, x5, [sp, #32]
    ldp x2, x3, [sp, #16]
    ldp x0, x1, [sp], #96
    ret

// Exception unwinding passes its target frame depth in x6. Keep the
// exception-handler address in x0 and its global's address in x2 intact.
.Larm_arena_unwind:
    stp x0, x30, [sp, #-48]!
    stp x2, x19, [sp, #16]
    str x20, [sp, #32]
    mov x20, x6
    bl .Larm_arena_state_address
    ldr x19, [x15, #32]
1:
    ldr x4, [x19]
    cmp x4, x20
    b.ls 2f
    bl .Larm_arena_region_pop
    b 1b
2:
    ldr x20, [sp, #32]
    ldp x2, x19, [sp, #16]
    ldp x0, x30, [sp], #48
    ret
