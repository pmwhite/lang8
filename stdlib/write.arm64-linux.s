// write.s for Linux on arm64: l8_std_write(fd, data, n) is write(2).
.section .text
.globl l8_std_write
l8_std_write:
    mov x8, #64
    svc #0
    ret

// Read-only str span: fd, text, offset, count.
.globl l8_std_write_text_at
l8_std_write_text_at:
    add x1, x1, x2
    mov x2, x3
    b l8_std_write
