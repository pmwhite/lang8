# Standalone Linux x86-64 kernel, specialized from ../reduce.s.
# Arrays point to data, with element count at -8. IDs fit in 23 bits.
# Machine: nodes=0, count=8, node_cache=16, memo=24, stack=32, top=40, cold=48.
# Node=packed(u,v):8 bytes; Frame={kind,a,b}:24;
# Cache entries={packed(a,b),result}:16. The first ID occupies the low lane.
# All IDs originate in the checked parser or immutable node constructor.
# Slow paths call the standalone assembly capacity-management routines.
.section .text
.globl tc_apply

# Bounded node sharing: check the whole key, allocate on a cache miss.
# Eviction loses sharing, never invalidates an existing node or a memo result.
# Preserve argument registers for the slow-path tail call; check arena capacity
# before committing a new node.
tc_intern:
    test %rsi, %rsi
    je .Ltc_leaf
    mov %rsi, %rax
    shl $32, %rax
    or %rdx, %rax
    mov $-7046029254386353131, %r10
    imul %r10, %rax
    mov %rax, %r10
    sar $32, %r10
    xor %r10, %rax
    mov 16(%rdi), %r8
    mov -8(%r8), %rcx
    sub $1, %rcx
    and %rcx, %rax
    shl $4, %rax
    add %rax, %r8
    mov %rdx, %r11
    shl $32, %r11
    or %rsi, %r11
    mov (%r8), %r10
    cmp %r10, %r11
    jne .Ltc_new_node
    mov 8(%r8), %rax
    ret
.Ltc_new_node:
    mov 8(%rdi), %rax
    mov 0(%rdi), %r9
    mov -8(%r9), %r10
    cmp %r10, %rax
    jae .Ltc_intern_slow
    mov %r11, (%r9,%rax,8)
    mov %r11, (%r8)
    mov %rax, 8(%r8)
    lea 1(%rax), %rcx
    mov %rcx, 8(%rdi)
    ret
.Ltc_leaf:
    mov $1, %rax
    ret
.Ltc_intern_slow:
    jmp native_intern_grow

# Callee-saved state: r12=machine, r13=nodes, r14=a, r15=b,
# rbp=frame storage, rbx=frame count. (%rsp) holds the caller's frame count.
# Six saved registers and 24 local bytes align the stack before every call.
# 8(%rsp) saves the cold-counter address across memo key comparisons.
tc_apply:
    push %rbp
    push %rbx
    push %r12
    push %r13
    push %r14
    push %r15
    sub $24, %rsp
    mov %rdi, %r12
    mov %rsi, %r14
    mov %rdx, %r15
    mov 0(%r12), %r13
    mov 32(%r12), %rbp
    mov 40(%r12), %rbx
    mov %rbx, (%rsp)
.Ltc_reduce:
    lea 2(%rbx), %rax
    mov -8(%rbp), %rdi
    cmp %rdi, %rax
    ja .Ltc_grow_stack
    mov (%r13,%r14,8), %r8d
    test %r8d, %r8d
    je .Ltc_stem
    mov 4(%r13,%r14,8), %r9d
    test %r9d, %r9d
    je .Ltc_fork
    mov (%r13,%r8,8), %r10d
    test %r10d, %r10d
    je .Ltc_constant
    mov 4(%r13,%r8,8), %r11d
    # Only triage inspects b's children; S needs neither load.
    test %r11d, %r11d
    je .Ltc_lookup
    mov (%r13,%r15,8), %esi
    test %esi, %esi
    je .Ltc_triage_leaf
    mov 4(%r13,%r15,8), %edx
# Per-function miss counters: after 64 misses, sample one in 16 lookups.
# A hit resets the counter. Skipping a cache lookup only repeats reduction work.
.Ltc_lookup:
    mov %r14, %rax
    mov 48(%r12), %rdi
    mov -8(%rdi), %rcx
    sub $1, %rcx
    and %rcx, %rax
    add %rax, %rdi
    mov %rdi, 8(%rsp)
    movzbl (%rdi), %eax
    cmp $64, %rax
    jae .Ltc_cold_skip
    jmp .Ltc_do_lookup
.Ltc_cold_skip:
    add $1, %rax
    mov %al, (%rdi)
    cmp $80, %rax
    jae .Ltc_do_lookup
    jmp .Ltc_no_memo
.Ltc_do_lookup:
    mov %r14, %rax
    shl $32, %rax
    or %r15, %rax
    mov $-7046029254386353131, %rcx
    imul %rcx, %rax
    mov %rax, %rcx
    sar $32, %rcx
    xor %rcx, %rax
    mov 24(%r12), %r8
    mov -8(%r8), %rcx
    sub $1, %rcx
    and %rcx, %rax
    shl $4, %rax
    mov %r8, %rcx
    add %rax, %rcx
    mov %r15, %rax
    shl $32, %rax
    or %r14, %rax
    mov (%rcx), %rdi
    cmp %rdi, %rax
    jne .Ltc_miss
    mov 8(%rsp), %rdi
    movb $0, (%rdi)
    mov 8(%rcx), %rax
    jmp .Ltc_dispatch
.Ltc_miss:
    mov 8(%rsp), %rdi
    movzbl (%rdi), %eax
    cmp $64, %rax
    jae .Ltc_cold_reset
    add $1, %rax
    jmp .Ltc_cold_store
.Ltc_cold_reset:
    mov $64, %rax
.Ltc_cold_store:
    mov %al, (%rdi)
    # Push MEMOIZE(a,b). y=r9, u.u=r10, u.v=r11, b.u=rsi, b.v=rdx.
    lea (%rbx,%rbx,2), %rcx
    lea (%rbp,%rcx,8), %rcx
    movq $2, (%rcx)
    mov %r14, 8(%rcx)
    mov %r15, 16(%rcx)
    add $1, %rbx
.Ltc_schedule:
    test %r11, %r11
    je .Ltc_s
    test %rdx, %rdx
    je .Ltc_triage_stem
    # fork argument: apply(apply(y, b.u), b.v)
    movq $0, 24(%rcx)
    mov %rdx, 32(%rcx)
    movq $0, 40(%rcx)
    add $1, %rbx
    mov %r9, %r14
    mov %rsi, %r15
    jmp .Ltc_reduce
.Ltc_triage_stem:
    mov %r11, %r14
    mov %rsi, %r15
    jmp .Ltc_reduce
.Ltc_s:
    # Evaluate y b, then x b, then apply the latter to the former.
    movq $1, 24(%rcx)
    mov %r10, 32(%rcx)
    mov %r15, 40(%rcx)
    add $1, %rbx
    mov %r9, %r14
    jmp .Ltc_reduce
.Ltc_no_memo:
    lea (%rbx,%rbx,2), %rcx
    lea (%rbp,%rcx,8), %rcx
    sub $24, %rcx
    jmp .Ltc_schedule
.Ltc_stem:
    mov %r15, %rsi
    xor %rdx, %rdx
    jmp .Ltc_construct
.Ltc_fork:
    mov %r8, %rsi
    mov %r15, %rdx
.Ltc_construct:
    mov %r12, %rdi
    call tc_intern
    mov 0(%r12), %r13
    jmp .Ltc_dispatch
.Ltc_constant:
    mov %r9, %rax
    jmp .Ltc_dispatch
.Ltc_triage_leaf:
    mov %r10, %rax
.Ltc_dispatch:
    mov (%rsp), %rdi
    cmp %rdi, %rbx
    je .Ltc_done
    sub $1, %rbx
    lea (%rbx,%rbx,2), %rcx
    lea (%rbp,%rcx,8), %rcx
    mov (%rcx), %r8
    cmp $2, %r8
    je .Ltc_remember
    test %r8, %r8
    je .Ltc_apply_to
    # COMPUTE_AND_APPLY -> APPLY_TO(result), reusing the same frame.
    mov 8(%rcx), %r14
    mov 16(%rcx), %r15
    movq $0, (%rcx)
    mov %rax, 8(%rcx)
    movq $0, 16(%rcx)
    add $1, %rbx
    jmp .Ltc_reduce
.Ltc_apply_to:
    mov %rax, %r14
    mov 8(%rcx), %r15
    jmp .Ltc_reduce
.Ltc_remember:
    mov 8(%rcx), %rsi
    mov 16(%rcx), %rdx
    mov %rsi, %r8
    shl $32, %r8
    or %rdx, %r8
    mov $-7046029254386353131, %r9
    imul %r9, %r8
    mov %r8, %r9
    sar $32, %r9
    xor %r9, %r8
    mov 24(%r12), %r10
    mov -8(%r10), %r9
    sub $1, %r9
    and %r9, %r8
    shl $4, %r8
    add %r8, %r10
    shl $32, %rdx
    or %rsi, %rdx
    mov %rdx, (%r10)
    mov %rax, 8(%r10)
    jmp .Ltc_dispatch
.Ltc_grow_stack:
    mov %rbx, 40(%r12)
    mov %r12, %rdi
    call native_stack_grow
    mov 32(%r12), %rbp
    jmp .Ltc_reduce
.Ltc_done:
    mov %rbx, 40(%r12)
    add $24, %rsp
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbx
    pop %rbp
    ret

# Copy count packed nodes. Internal caller has allocated a larger destination.
.globl tc_copy_nodes
tc_copy_nodes:
    mov %rdx, %rcx
    # rep movsq: L8's source assembler has no mnemonic for string instructions.
    .byte 243, 72, 165
    xor %rax, %rax
    ret

# Copy count frames, each consisting of three words.
.globl tc_copy_frames
tc_copy_frames:
    imul $3, %rdx
    jmp tc_copy_nodes

# Allocate an ordinary zeroed L8 slice on the runtime region/bump heap.
# Every call comes from a checked capacity doubling, bounded at 2^24 elements.
.globl tc_nodes
.globl tc_frames
tc_nodes:
    mov %rdi, %rsi
    jmp .Ltc_allocate
tc_frames:
    mov %rdi, %rsi
    imul $3, %rsi
.Ltc_allocate:
    push %rbx
    push %rbp
    sub $8, %rsp
    mov %rdi, %rbx
    mov %rsi, %rbp
    mov %rsi, %rdi
    shl $3, %rdi
    add $8, %rdi
    call malloc
    test %rax, %rax
    je .Ltc_oom
    mov %rbx, (%rax)
    lea 8(%rax), %rdx
    mov %rdx, %rdi
    mov %rbp, %rcx
    xor %rax, %rax
    # rep stosq: zero exactly the allocated payload; header holds element count.
    .byte 243, 72, 171
    mov %rdx, %rax
    add $8, %rsp
    pop %rbp
    pop %rbx
    ret
.Ltc_oom:
    call native_oom

# Grow a bounded cache, preserving useful entries; conflicts may replace entries.
# Pairs have their first child/argument in the low lane.
.globl tc_recache
tc_recache:
    mov -8(%rdi), %rcx
    mov -8(%rsi), %r8
    sub $1, %r8
.Ltc_recache_loop:
    test %rcx, %rcx
    je .Ltc_recache_done
    mov (%rdi), %rdx
    test %rdx, %rdx
    je .Ltc_recache_next
    mov %rdx, %rax
    shl $32, %rax
    mov %rdx, %r9
    sar $32, %r9
    or %r9, %rax
    mov $-7046029254386353131, %r9
    imul %r9, %rax
    mov %rax, %r9
    sar $32, %r9
    xor %r9, %rax
    and %r8, %rax
    shl $4, %rax
    add %rsi, %rax
    mov %rdx, (%rax)
    mov 8(%rdi), %r9
    mov %r9, 8(%rax)
.Ltc_recache_next:
    add $16, %rdi
    sub $1, %rcx
    jmp .Ltc_recache_loop
.Ltc_recache_done:
    xor %rax, %rax
    ret
.globl tc_cache
tc_cache:
    mov %rdi, %rsi
    shl $1, %rsi
    jmp .Ltc_allocate

# Byte buffers use a padded payload so bulk zeroing stays within the allocation.
.globl tc_buffer
tc_buffer:
    lea 7(%rdi), %rsi
    sar $3, %rsi
    jmp .Ltc_allocate
