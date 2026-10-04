/* SysV x86-64 equivalent of bounds_graph_search; same layouts as search.c.
 * Keep the queue cursors, budget, edge, and distances in registers.
 * No calls, SIMD, prefetch, extra assumptions about weights, or new algorithm.
 */
.text
.globl kernel_search
.type kernel_search,@function
kernel_search:
    push %rbx
    push %r12
    push %r13
    push %r14
    push %r15
    mov %rdx,%r12
    mov %rcx,%r13
    mov %r8,%r14
    mov 48(%rdi),%rbx
    mov -8(%rbx),%r15
    mov 64(%rdi),%r10
    mov 40(%rdi),%rax
    movabs $1000000000000000000,%r11
    xor %ecx,%ecx
.Lreset:
    cmp %r10,%rcx
    jge .Lseed
    mov %r11,16(%rax)
    movb $0,24(%rax)
    add $32,%rax
    inc %rcx
    jmp .Lreset
.Lseed:
    mov 72(%rdi),%r11
    add %r10,%r11
    inc %r11
    shl $6,%r11
    cmp $262144,%r11
    jle .Lbudget
    mov $262144,%r11
.Lbudget:
    xor %r8d,%r8d
    xor %r9d,%r9d
    test %rsi,%rsi
    jz .Llengths
    movq $0,16(%rsi)
    movb $1,24(%rsi)
    mov %rsi,(%rbx)
    inc %r9
    cmp %r15,%r9
    jl .Lstart
    xor %r9d,%r9d
    jmp .Lstart
.Llengths:
    mov (%rdi),%rax
    mov 40(%rdi),%rcx
.Llength:
    test %r10,%r10
    jle .Lstart
    cmpb $0,16(%rax)
    je .Lnext_length
    movq $0,16(%rcx)
    movb $1,24(%rcx)
    mov %rcx,(%rbx,%r9,8)
    inc %r9
    cmp %r15,%r9
    jl .Lnext_length
    xor %r9d,%r9d
.Lnext_length:
    add $24,%rax
    add $32,%rcx
    dec %r10
    jmp .Llength
.Lstart:
    cmp %r12,%rsi
    jne .Lrun
    test %r14b,%r14b
    jz .Lrun
    test %r13,%r13
    jns .Lfalse
.Lrun:
    movabs $-1000000000000000000,%rdi
.Lqueue:
    cmp %r9,%r8
    je .Ldone
    test %r11,%r11
    jle .Lfalse
    mov (%rbx,%r8,8),%rcx
    inc %r8
    cmp %r15,%r8
    jl .Lpopped
    xor %r8d,%r8d
.Lpopped:
    movb $0,24(%rcx)
    mov 16(%rcx),%rsi
    mov 8(%rcx),%rcx
.Ledge:
    test %rcx,%rcx
    jz .Lqueue
    test %r11,%r11
    jle .Lqueue
    dec %r11
    mov (%rcx),%rdx
    mov 8(%rcx),%rax
    add %rsi,%rax
    cmp 16(%rdx),%rax
    jge .Lnext_edge
    cmp %rdi,%rax
    jle .Lnext_edge
    mov %rax,16(%rdx)
    cmp %r12,%rdx
    jne .Lenqueue
    test %r14b,%r14b
    jz .Lenqueue
    cmp %r13,%rax
    jle .Lfalse
.Lenqueue:
    cmpb $0,24(%rdx)
    jne .Lnext_edge
    mov %rdx,(%rbx,%r9,8)
    inc %r9
    cmp %r15,%r9
    jl .Lqueued
    xor %r9d,%r9d
.Lqueued:
    movb $1,24(%rdx)
.Lnext_edge:
    mov 16(%rcx),%rcx
    jmp .Ledge
.Ldone:
    xor %eax,%eax
    test %r11,%r11
    setg %al
    jmp .Lreturn
.Lfalse:
    xor %eax,%eax
.Lreturn:
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbx
    ret
.size kernel_search,.-kernel_search
.section .note.GNU-stack,"",@progbits
