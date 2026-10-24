.section .text
.globl l8_std_write
l8_std_write:
    mov $1, %rax
    syscall
    ret
