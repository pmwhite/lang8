.section .text
.globl l8_std_write
l8_std_write:
    mov $1, %rax
    syscall
    ret

# Read-only str span: fd, text, offset, count. Validation is in raw_write.l8.
.globl l8_std_write_text_at
l8_std_write_text_at:
    add %rdx, %rsi
    mov %rcx, %rdx
    jmp l8_std_write
