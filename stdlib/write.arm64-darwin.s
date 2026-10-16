// write.s for Apple's systems on arm64: l8_std_write(fd, data, n) is write(2).
.section __TEXT,__text,regular,pure_instructions
.globl _l8_std_write
.p2align 2
_l8_std_write:
    b _write
