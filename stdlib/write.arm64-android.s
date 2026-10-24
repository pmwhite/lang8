// write.s for Android on arm64: l8_std_write(fd, data, n) is write(2).
.section .text
.globl l8_std_write
.p2align 2
l8_std_write:
    b write
