# Standalone Linux x86-64 tree-calculus evaluator. No libc or L8 runtime.
# The private kernel uses the same immutable node IDs, bounded caches and
# eager reduction rules as the L8-backed executable.
# Routines follow SysV except private process_line; _start has an aligned stack.
.equ HEAP_SIZE, 768*1024*1024
.equ LINE_LIMIT, 16777216
.equ NODE_LIMIT, 8388608
.equ STACK_LIMIT, 16777216

.section .bss
.balign 8
machine: .skip 56
heap_next: .skip 8
heap_end: .skip 8
input: .skip 8192
output: .skip 8192

.section .rodata
usage_message: .ascii "usage: tree-calculus-asm\n"
.set usage_length, .-usage_message
input_message: .ascii "invalid ternary tree\n"
.set input_length, .-input_message
line_message: .ascii "input line too long\n"
.set line_length, .-line_message
arena_message: .ascii "tree arena exhausted\n"
.set arena_length, .-arena_message
stack_message: .ascii "evaluation stack exhausted\n"
.set stack_length, .-stack_message
memory_message: .ascii "tree machine allocation failed\n"
.set memory_length, .-memory_message
io_message: .ascii "input/output error\n"
.set io_length, .-io_message

.section .text
.globl _start
_start:
    cld
    cmpq $1, (%rsp)
    jne usage_error
    mov $9, %eax
    xor %edi, %edi
    mov $HEAP_SIZE, %esi
    mov $3, %edx
    mov $34, %r10d
    mov $-1, %r8
    xor %r9d, %r9d
    syscall
    test %rax, %rax
    js native_oom
    mov %rax, heap_next(%rip)
    add $HEAP_SIZE, %rax
    mov %rax, heap_end(%rip)
    call init_machine
    # Identity = fork(stem(stem(leaf)), leaf).
    lea machine(%rip), %rdi
    mov $1, %esi
    xor %edx, %edx
    call tc_intern
    lea machine(%rip), %rdi
    mov %rax, %rsi
    xor %edx, %edx
    call tc_intern
    lea machine(%rip), %rdi
    mov %rax, %rsi
    mov $1, %edx
    call tc_intern
    mov %rax, %r15
    mov $8192, %edi
    call malloc
    test %rax, %rax
    je native_oom
    mov %rax, %r12              # line buffer
    xor %r13d, %r13d            # line length
    mov $8192, %r14d            # line capacity
.read:
    xor %eax, %eax
    xor %edi, %edi
    lea input(%rip), %rsi
    mov $8192, %edx
    syscall
    cmp $-4, %rax               # EINTR: retry without dropping buffered input
    je .read
    test %rax, %rax
    js io_error
    je .eof
    mov %rax, %rbp
    xor %ebx, %ebx
.scan:
    lea input(%rip), %rax
    movzbl (%rax,%rbx), %ecx
    cmp $10, %ecx
    je .line
    cmp $13, %ecx
    je .next
    cmp %r14, %r13
    jb .append
    cmp $LINE_LIMIT, %r14
    jae line_error
    add %r14, %r14
    mov %r14, %rdi
    call malloc
    test %rax, %rax
    je native_oom
    mov %rax, %rdi
    mov %r12, %rsi
    mov %r13, %rcx
    rep movsb
    mov %rax, %r12
.append:
    lea input(%rip), %rax
    movzbl (%rax,%rbx), %ecx
    mov %cl, (%r12,%r13)
    inc %r13
.next:
    inc %rbx
    cmp %rbp, %rbx
    jb .scan
    jmp .read
.line:
    test %r13, %r13
    je .next
    call process_line
    xor %r13d, %r13d
    jmp .next
.eof:
    test %r13, %r13
    je .print
    call process_line
.print:
    lea machine(%rip), %rdi
    mov %r15, %rsi
    call print_tree
    xor %edi, %edi
    mov $60, %eax
    syscall

# Called only by _start: line in r12/r13, running result in r15. Other saved
# registers remain live across this helper. Its only non-SysV result is r15.
process_line:
    sub $8, %rsp
    lea machine(%rip), %rdi
    mov %r12, %rsi
    mov %r13, %rdx
    call parse_tree
    mov %rax, (%rsp)
    lea machine(%rip), %rdi
    call native_grow_caches
    lea machine(%rip), %rdi
    mov %r15, %rsi
    mov (%rsp), %rdx
    call tc_apply
    mov %rax, %r15
    add $8, %rsp
    ret

# Eight-byte-aligned bump allocation. Retain old array capacities until exit,
# with the same heap budget as L8. Anonymous mmap supplies initially zero pages.
malloc:
    mov heap_next(%rip), %rax
    add $7, %rdi
    jc .allocation_failed
    and $-8, %rdi
    mov %rax, %rcx
    add %rdi, %rcx
    jc .allocation_failed
    cmp heap_end(%rip), %rcx
    ja .allocation_failed
    mov %rcx, heap_next(%rip)
    ret
.allocation_failed:
    xor %eax, %eax
    ret

init_machine:
    sub $8, %rsp
    mov $512, %edi
    call tc_nodes
    mov %rax, machine(%rip)
    movq $2, machine+8(%rip)
    mov $512, %edi
    call tc_cache
    mov %rax, machine+16(%rip)
    mov $512, %edi
    call tc_cache
    mov %rax, machine+24(%rip)
    mov $256, %edi
    call tc_frames
    mov %rax, machine+32(%rip)
    mov $512, %edi
    call tc_buffer
    mov %rax, machine+48(%rip)
    add $8, %rsp
    ret

# The kernel publishes its live continuation count before calling this routine.
native_stack_grow:
    push %r12
    push %r13
    push %r14
    mov %rdi, %r12
    mov 32(%r12), %r13
    mov -8(%r13), %r14
    cmp $STACK_LIMIT, %r14
    jae stack_error
    lea (%r14,%r14), %rdi
    call tc_frames
    mov %rax, 32(%r12)
    mov %rax, %rdi
    mov %r13, %rsi
    mov %r14, %rdx
    call tc_copy_frames
    pop %r14
    pop %r13
    pop %r12
    ret

# Preserve the constructor arguments while relocating the arena and caches.
native_intern_grow:
    push %rbx
    push %rbp
    push %r12
    push %r13
    push %r14
    push %r15
    sub $8, %rsp
    mov %rdi, %r12
    mov %rsi, %r13
    mov %rdx, %r14
    mov (%r12), %r15
    mov -8(%r15), %rbp
    cmp %rbp, 8(%r12)
    jb .arena_ready
    cmp $NODE_LIMIT, %rbp
    jae arena_error
    lea (%rbp,%rbp), %rdi
    call tc_nodes
    mov %rax, %rbx
    mov %rax, %rdi
    mov %r15, %rsi
    mov %rbp, %rdx
    call tc_copy_nodes
    mov %rbx, (%r12)
.arena_ready:
    mov %r12, %rdi
    call native_grow_caches
    mov %r12, %rdi
    mov %r13, %rsi
    mov %r14, %rdx
    add $8, %rsp
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbp
    pop %rbx
    jmp tc_intern

native_grow_caches:
    push %r12
    push %r13
    push %r14
    mov %rdi, %r12
    mov 16(%r12), %r13
    mov -8(%r13), %r14
.grow_nodes_cache:
    cmp $16384, %r14
    jae .node_cache_ready
    cmp 8(%r12), %r14
    jae .node_cache_ready
    add %r14, %r14
    jmp .grow_nodes_cache
.node_cache_ready:
    cmp -8(%r13), %r14
    je .memo_cache
    mov %r14, %rdi
    call tc_cache
    mov %rax, 16(%r12)
    mov %rax, %rsi
    mov %r13, %rdi
    call tc_recache
.memo_cache:
    mov 24(%r12), %r13
    mov -8(%r13), %r14
.grow_memo_cache:
    cmp $65536, %r14
    jae .memo_cache_ready
    cmp 8(%r12), %r14
    jae .memo_cache_ready
    add %r14, %r14
    jmp .grow_memo_cache
.memo_cache_ready:
    cmp -8(%r13), %r14
    je .caches_done
    mov %r14, %rdi
    call tc_cache
    mov %rax, 24(%r12)
    mov %rax, %rsi
    mov %r13, %rdi
    call tc_recache
    mov %r14, %rdi
    call tc_buffer
    mov %rax, 48(%r12)
.caches_done:
    pop %r14
    pop %r13
    pop %r12
    ret

# Reverse prefix parsing: reuse packed continuation storage as an ID stack.
# Parser/printer entries have no tag bits set.
parse_tree:
    push %rbx
    push %rbp
    push %r12
    push %r13
    push %r14
    push %r15
    sub $8, %rsp
    mov %rdi, %r12
    mov %rsi, %r13
    mov %rdx, %r14
    mov 32(%r12), %rbp
    xor %r15d, %r15d
.parse_next:
    test %r14, %r14
    je .parse_done
    dec %r14
    movzbl (%r13,%r14), %ecx
    mov $1, %eax
    cmp $48, %ecx
    je .parse_push
    cmp $49, %ecx
    je .parse_unary
    cmp $50, %ecx
    jne input_error
    cmp $2, %r15
    jb input_error
.parse_unary:
    test %r15, %r15
    je input_error
    dec %r15
    mov (%rbp,%r15,8), %rsi
    xor %edx, %edx
    cmp $50, %ecx
    jne .parse_construct
    dec %r15
    mov (%rbp,%r15,8), %rdx
.parse_construct:
    mov %r12, %rdi
    call tc_intern
.parse_push:
    cmp -8(%rbp), %r15
    jb .parse_store
    mov %rax, %rbx
    mov %r15, 40(%r12)
    mov %r12, %rdi
    call native_stack_grow
    mov 32(%r12), %rbp
    mov %rbx, %rax
.parse_store:
    mov %rax, (%rbp,%r15,8)
    inc %r15
    jmp .parse_next
.parse_done:
    cmp $1, %r15
    jne input_error
    mov (%rbp), %rax
    movq $0, 40(%r12)
    add $8, %rsp
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbp
    pop %rbx
    ret

# Iterative preorder traversal. Printing needs no new nodes. Reserve one extra
# frame before popping, so a fork's two pushes cannot overrun the stack.
print_tree:
    push %rbx
    push %rbp
    push %r12
    push %r13
    push %r14
    push %r15
    sub $8, %rsp
    mov %rdi, %r12
    mov (%r12), %rbx
    mov 32(%r12), %rbp
    mov %rsi, (%rbp)
    mov $1, %r15d
    xor %r14d, %r14d
.print_next:
    test %r15, %r15
    je .print_done
    lea 1(%r15), %rax
    cmp -8(%rbp), %rax
    jbe .print_pop
    mov %r15, 40(%r12)
    mov %r12, %rdi
    call native_stack_grow
    mov 32(%r12), %rbp
.print_pop:
    dec %r15
    mov (%rbp,%r15,8), %rax
    mov (%rbx,%rax,8), %r13
    mov $48, %r8d
    mov %r13d, %edx
    test %edx, %edx
    je .print_byte
    mov $49, %r8d
    mov %r13, %rax
    shr $32, %rax
    test %rax, %rax
    je .print_child
    mov $50, %r8d
    mov %rax, (%rbp,%r15,8)
    inc %r15
.print_child:
    mov %rdx, (%rbp,%r15,8)
    inc %r15
.print_byte:
    lea output(%rip), %rax
    mov %r8b, (%rax,%r14)
    inc %r14
    cmp $8192, %r14
    jne .print_next
    mov $1, %edi
    lea output(%rip), %rsi
    mov %r14, %rdx
    call write_all
    xor %r14d, %r14d
    jmp .print_next
.print_done:
    lea output(%rip), %rsi
    movb $10, (%rsi,%r14)
    lea 1(%r14), %rdx
    mov $1, %edi
    call write_all
    movq $0, 40(%r12)
    add $8, %rsp
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbp
    pop %rbx
    ret

# Retry interrupted and partial writes; never silently truncate output.
write_all:
    test %rdx, %rdx
    je .write_done
.write_more:
    mov $1, %eax
    syscall
    cmp $-4, %rax
    je .write_more
    test %rax, %rax
    jle io_error
    add %rax, %rsi
    sub %rax, %rdx
    jne .write_more
.write_done:
    ret

usage_error:
    lea usage_message(%rip), %rsi
    mov $usage_length, %edx
    jmp fatal
input_error:
    lea input_message(%rip), %rsi
    mov $input_length, %edx
    jmp fatal
line_error:
    lea line_message(%rip), %rsi
    mov $line_length, %edx
    jmp fatal
arena_error:
    lea arena_message(%rip), %rsi
    mov $arena_length, %edx
    jmp fatal
stack_error:
    lea stack_message(%rip), %rsi
    mov $stack_length, %edx
    jmp fatal
native_oom:
    lea memory_message(%rip), %rsi
    mov $memory_length, %edx
    jmp fatal
io_error:
    lea io_message(%rip), %rsi
    mov $io_length, %edx
fatal:
    mov $2, %edi
    mov $1, %eax
    syscall
    mov $1, %edi
    mov $60, %eax
    syscall

# Single translation unit: tc_intern stays private, and growth/allocation
# calls resolve to the assembly routines above. No L8 objects are linked.
.include "kernel.s"
.section .note.GNU-stack,"",@progbits
