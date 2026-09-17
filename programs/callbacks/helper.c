/* Test fixture only: exercises the actual C/L8 ABI in both directions. */
#include <stdint.h>
#include <stddef.h>

typedef double (*mixed_fn)(int32_t, double, int64_t, float, uint32_t,
                          double, int64_t, int64_t, int64_t, int64_t,
                          double, double, double, double, double, double, double);
typedef int64_t (*unary_fn)(int64_t);
struct listener {
    void (*notify)(int32_t *, uint32_t, float);
    unary_fn calculate;
    void (*optional)(void);
};
static const struct listener *saved;

int64_t cb_register(const struct listener *listener) {
    saved = listener;
    return 0;
}

int64_t cb_dispatch(int32_t *state) {
    if (!saved || saved->optional || saved->calculate(21) != 42) return 1;
    saved->notify(state, 17, 2.0f);
    return *state == 19 ? 0 : 2;
}

int64_t cb_mixed(mixed_fn f) {
    double value = f(-3, 1.5, 11, 2.5f, 4000000000U, 3.5, 13, 17, 19, 23,
                     4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5);
    return value == 4000000140.0 ? 0 : 1;
}

static int64_t plus_three(int64_t n) { return n + 3; }
unary_fn cb_get(void) { return plus_three; }

/* Check preservation of every callee-saved general register, and stack
 * alignment on a call from the L8 callback back into foreign code. */
int64_t cb_registers(unary_fn f);
int64_t cb_alignment(void);
__asm__(
    ".text\n"
    ".globl cb_alignment\n"
    "cb_alignment:\n"
    "mov %rsp, %rax\n"
    "and $15, %rax\n"
    "ret\n"
    ".globl cb_registers\n"
    "cb_registers:\n"
    "push %rbp\n"
    "push %rbx\n"
    "push %r12\n"
    "push %r13\n"
    "push %r14\n"
    "push %r15\n"
    "sub $8, %rsp\n"
    "mov %rdi, %rax\n"
    "mov $101, %rbp\n"
    "mov $102, %rbx\n"
    "mov $103, %r12\n"
    "mov $104, %r13\n"
    "mov $105, %r14\n"
    "mov $106, %r15\n"
    "mov $9, %rdi\n"
    "call *%rax\n"
    "cmp $8, %rax\n"
    "jne 1f\n"
    "cmp $101, %rbp\n"
    "jne 1f\n"
    "cmp $102, %rbx\n"
    "jne 1f\n"
    "cmp $103, %r12\n"
    "jne 1f\n"
    "cmp $104, %r13\n"
    "jne 1f\n"
    "cmp $105, %r14\n"
    "jne 1f\n"
    "cmp $106, %r15\n"
    "jne 1f\n"
    "xor %eax, %eax\n"
    "jmp 2f\n"
    "1: mov $1, %eax\n"
    "2: add $8, %rsp\n"
    "pop %r15\n"
    "pop %r14\n"
    "pop %r13\n"
    "pop %r12\n"
    "pop %rbx\n"
    "pop %rbp\n"
    "ret\n");
