# Standalone Linux x86-64 kernel, specialized from ../reduce.s.
# Arrays point to data, with element count at -8. IDs fit in 23 bits.
# Machine: nodes=0, count=8, node_cache=16, memo=24, stack=32, top=40, cold=48.
# Node=packed(u,v):8 bytes; Frame=packed(a,b,tag):8.
# Frame tags: bit63=memoize, bit62=compute/apply, neither=apply-to.
# IDs fit in 23 bits, so the tags never overlap either packed ID.
# Cache entries={packed(a,b),result}:16. The first ID occupies the low lane.
# All IDs originate in the checked parser or immutable node constructor.
# Node and frame arrays have stable addresses and checked maximum capacities.
.section .text
.globl tc_apply

# Bounded node sharing: check the whole key, allocate on a cache miss.
# Eviction loses sharing, never invalidates an existing node or a memo result.
# Check arena capacity before committing a new node.
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
    cmp $NODE_LIMIT, %rax
    jae arena_error
    mov %r11, (%r9,%rax,8)
    mov %r11, (%r8)
    mov %rax, 8(%r8)
    lea 1(%rax), %rcx
    mov %rcx, 8(%rdi)
    ret
.Ltc_leaf:
    mov $1, %rax
    ret

# Private VM: r12=next node ID, r13=nodes, r14=a, r15=b, rbp=frames,
# rbx=frame count. No calls or process-stack traffic inside the reduction loop.
# Internal ABI: evaluation starts with an empty continuation stack; the CLI
# never calls this recursively. rdi retains the cold-counter address on lookup.
# Preserve the input loop's registers only at this outer entry/exit boundary.
tc_apply:
    push %rbp
    push %rbx
    push %r12
    push %r13
    push %r14
    push %r15
    mov %rsi, %r14
    mov %rdx, %r15
    mov machine(%rip), %r13
    mov machine+32(%rip), %rbp
    mov machine+8(%rip), %r12
    xor %ebx, %ebx
.Ltc_reduce:
    cmp $STACK_LIMIT-2, %rbx
    ja stack_error
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
# Memo-table hashing uses SSE4.2 CRC32C on the ordered pair. Exact keys are
# still checked: collisions affect sharing only. Constructor hashing is unchanged.
.Ltc_lookup:
    mov %r14, %rax
    mov machine+48(%rip), %rdi
    and $65535, %eax
    add %rax, %rdi
    movzbl (%rdi), %eax
    cmp $64, %eax
    jb .Ltc_do_lookup
    inc %eax
    mov %al, (%rdi)
    cmp $80, %eax
    jb .Ltc_schedule
.Ltc_do_lookup:
    mov %r14, %rax
    shl $32, %rax
    or %r15, %rax
    xor %ecx, %ecx
    crc32 %rax, %rcx
    mov %ecx, %eax
    mov machine+24(%rip), %r8
    and $65535, %eax
    shl $4, %rax
    mov %r8, %rcx
    add %rax, %rcx
    mov %r15, %rax
    shl $32, %rax
    or %r14, %rax
    cmp (%rcx), %rax
    jne .Ltc_miss
    movb $0, (%rdi)
    mov 8(%rcx), %rax
    jmp .Ltc_dispatch
.Ltc_miss:
    movzbl (%rdi), %eax
    cmp $64, %rax
    jae .Ltc_cold_reset
    add $1, %rax
    jmp .Ltc_cold_store
.Ltc_cold_reset:
    mov $64, %rax
.Ltc_cold_store:
    mov %al, (%rdi)
    # MEMOIZE(a,b): exact pair in low 56 bits, bit63 is the frame tag.
    mov %r15, %rcx
    shl $32, %rcx
    or %r14, %rcx
    bts $63, %rcx
    mov %rcx, (%rbp,%rbx,8)
    inc %rbx
.Ltc_schedule:
    test %r11d, %r11d
    je .Ltc_s
    test %edx, %edx
    je .Ltc_triage_stem
    # fork argument: apply(apply(y, b.u), b.v)
    mov %rdx, (%rbp,%rbx,8)
    inc %rbx
    mov %r9d, %r14d
    mov %esi, %r15d
    jmp .Ltc_reduce
.Ltc_triage_stem:
    mov %r11d, %r14d
    mov %esi, %r15d
    jmp .Ltc_reduce
.Ltc_s:
    # COMPUTE_AND_APPLY(x,b), tagged in bit62.
    mov %r15, %rcx
    shl $32, %rcx
    or %r10, %rcx
    bts $62, %rcx
    mov %rcx, (%rbp,%rbx,8)
    inc %rbx
    mov %r9d, %r14d
    jmp .Ltc_reduce
.Ltc_stem:
    mov %r15, %rsi
    xor %rdx, %rdx
    jmp .Ltc_construct
.Ltc_fork:
    mov %r8, %rsi
    mov %r15, %rdx
.Ltc_construct:
    # u=esi is nonzero on both construction paths; v=edx may be zero.
    # Inline exact-pair sharing, with the allocation cursor kept in r12.
    mov %rdx, %r9
    shl $32, %r9
    or %rsi, %r9
    mov %r9, %rax
    rol $32, %rax
    mov $-7046029254386353131, %rcx
    imul %rcx, %rax
    mov %rax, %rcx
    shr $32, %rcx
    xor %rcx, %rax
    and $16383, %eax
    shl $4, %rax
    mov machine+16(%rip), %r8
    add %rax, %r8
    cmp (%r8), %r9
    jne .Ltc_construct_new
    mov 8(%r8), %rax
    jmp .Ltc_dispatch
.Ltc_construct_new:
    cmp $NODE_LIMIT, %r12
    jae arena_error
    mov %r9, (%r13,%r12,8)
    mov %r9, (%r8)
    mov %r12, 8(%r8)
    mov %r12, %rax
    inc %r12
    jmp .Ltc_dispatch
.Ltc_constant:
    mov %r9, %rax
    jmp .Ltc_dispatch
.Ltc_triage_leaf:
    mov %r10, %rax
.Ltc_dispatch:
    test %rbx, %rbx
    je .Ltc_done
    dec %rbx
    mov (%rbp,%rbx,8), %rcx
    test %rcx, %rcx
    js .Ltc_remember
    bt $62, %rcx
    jnc .Ltc_apply_to
    # COMPUTE_AND_APPLY -> APPLY_TO(result), reusing the same word.
    btr $62, %rcx
    mov %ecx, %r14d
    shr $32, %rcx
    mov %ecx, %r15d
    mov %rax, (%rbp,%rbx,8)
    inc %rbx
    jmp .Ltc_reduce
.Ltc_apply_to:
    mov %rax, %r14
    mov %ecx, %r15d
    jmp .Ltc_reduce
.Ltc_remember:
    btr $63, %rcx
    mov %rcx, %r8
    rol $32, %r8
    xor %r9d, %r9d
    crc32 %r8, %r9
    mov %r9d, %r8d
    mov machine+24(%rip), %r10
    and $65535, %r8d
    shl $4, %r8
    add %r8, %r10
    mov %rcx, (%r10)
    mov %rax, 8(%r10)
    jmp .Ltc_dispatch
.Ltc_done:
    mov %r12, machine+8(%rip)
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbx
    pop %rbp
    ret

# Allocate a zeroed slice from fresh anonymous-mapping storage.
# The only callers reserve fixed, bounded capacities during initialization.
.globl tc_nodes
.globl tc_frames
tc_nodes:
    mov %rdi, %rsi
    jmp .Ltc_allocate
tc_frames:
    mov %rdi, %rsi
.Ltc_allocate:
    # Private malloc preserves rdx. Fresh bump storage is already zero from
    # anonymous mmap and is never reused: no explicit clearing is necessary.
    mov %rdi, %rdx
    lea 8(,%rsi,8), %rdi
    call malloc
    test %rax, %rax
    je .Ltc_oom
    mov %rdx, (%rax)
    add $8, %rax
    ret
.Ltc_oom:
    call native_oom

.globl tc_cache
tc_cache:
    mov %rdi, %rsi
    shl $1, %rsi
    jmp .Ltc_allocate

# Byte buffers round their payload up to a whole word.
.globl tc_buffer
tc_buffer:
    lea 7(%rdi), %rsi
    sar $3, %rsi
    jmp .Ltc_allocate
