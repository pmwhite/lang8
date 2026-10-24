// write.s for Linux on arm64: l8_std_write(fd, data, n) is write(2).
.section .text
.globl l8_std_write
l8_std_write:
    mov x8, #64
    svc #0
    ret
