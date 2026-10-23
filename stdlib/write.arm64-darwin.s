// write.s for Apple's systems on arm64: l8_std_write(fd, data, n) is write(2).
.section __TEXT,__text,regular,pure_instructions
.globl _l8_std_write
.p2align 2
_l8_std_write:
    b _write

// Read-only str span: fd, text, offset, count.
.globl _l8_std_write_text_at
_l8_std_write_text_at:
    add x1, x1, x2
    mov x2, x3
    b _l8_std_write
