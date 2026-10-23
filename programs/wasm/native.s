# Native helpers for the WebAssembly interpreter (programs/wasm): x86-64
# Linux, in the subset L8's own assembler takes (no xmm moves but movdqu,
# no scaled addressing). native.arm64-darwin.s is the same for iOS.
.section .text

# wasm_mem_map(size): []i8 -- size bytes of zeroed memory that never move
# (mmap, reserved but not committed), as an L8 byte slice: its length is
# the 8 bytes before it. wasm_mem_words gives a second view of the same
# memory as []int, starting 8 bytes in (its length word is the slice's
# first 8 bytes, which a module never uses). 0 when it cannot be had.
.globl wasm_mem_map
wasm_mem_map:
    push %rbx
    mov %rdi, %rbx
    mov $9, %rax
    mov $0, %rdi
    mov %rbx, %rsi
    add $16, %rsi
    mov $3, %rdx
    mov $16418, %r10
    mov $-1, %r8
    mov $0, %r9
    syscall
    cmp $-4095, %rax
    jae .Lmap_failed
    mov %rbx, 8(%rax)
    add $16, %rax
    pop %rbx
    ret
.Lmap_failed:
    mov $0, %rax
    pop %rbx
    ret

# wasm_mem_words(m: []i8): []int
.globl wasm_mem_words
wasm_mem_words:
    mov -8(%rdi), %rax
    sub $8, %rax
    sar $3, %rax
    mov %rax, (%rdi)
    lea 8(%rdi), %rax
    ret

# Float bits: the bit pattern of a float, and back (through the red zone).
.globl l8_f64_bits
l8_f64_bits:
    movdqu %xmm0, -16(%rsp)
    mov -16(%rsp), %rax
    ret

.globl l8_bits_f64
l8_bits_f64:
    mov %rdi, -16(%rsp)
    movdqu -16(%rsp), %xmm0
    ret

.globl l8_f32_bits
l8_f32_bits:
    movdqu %xmm0, -16(%rsp)
    mov -16(%rsp), %rax
    mov $4294967295, %rcx
    and %rcx, %rax
    ret

.globl l8_bits_f32
l8_bits_f32:
    mov %rdi, -16(%rsp)
    movdqu -16(%rsp), %xmm0
    ret

# wasm_native_call(fp, ints: []int, nints, floats: []f64, nfloats, ret_float): int
# Call a C function: ints[0..5] in the integer argument registers, the rest
# on the stack; floats[0..7] in xmm0-7 (the slice holds at least 10); the
# result from rax, or from xmm0 as bits when ret_float. Before the call,
# the callee-saved registers and the stack go into a slot (one per nested
# call), so that wasm_native_abandon, called from deeper native code (an
# uncaught exception's handler), can come back here as if the call had
# returned 0, with wasm_abandoned set.
.globl wasm_native_call
wasm_native_call:
    push %rbp
    mov %rsp, %rbp
    push %rbx
    push %r12
    push %r13
    push %r14
    push %r15
    push %rdi
    mov %rdi, %r11
    mov %rsi, %r12
    mov %rdx, %r13
    mov %r9, %r14
    mov wasm_slot_depth(%rip), %rax
    mov %rax, %r15
    shl $6, %r15
    lea wasm_slots(%rip), %r10
    add %r10, %r15
    mov %rbx, 0(%r15)
    mov %rbp, 8(%r15)
    mov %r12, 16(%r15)
    mov %r13, 24(%r15)
    mov %r14, 32(%r15)
    mov %rsp, 40(%r15)
    mov %r11, 48(%r15)
    add $1, %rax
    mov %rax, wasm_slot_depth(%rip)
    movdqu 0(%rcx), %xmm0
    movdqu 8(%rcx), %xmm1
    movdqu 16(%rcx), %xmm2
    movdqu 24(%rcx), %xmm3
    movdqu 32(%rcx), %xmm4
    movdqu 40(%rcx), %xmm5
    movdqu 48(%rcx), %xmm6
    movdqu 56(%rcx), %xmm7
    mov %r13, %rcx
    sub $6, %rcx
    jle .Lcall_regs
    mov %rcx, %rbx
    and $1, %rbx
    jz .Lcall_push
    sub $8, %rsp
.Lcall_push:
    mov %r13, %rbx
    sub $1, %rbx
.Lcall_push_loop:
    mov %rbx, %rax
    shl $3, %rax
    add %r12, %rax
    mov (%rax), %rax
    push %rax
    sub $1, %rbx
    cmp $6, %rbx
    jge .Lcall_push_loop
.Lcall_regs:
    mov 0(%r12), %rdi
    mov 8(%r12), %rsi
    mov 16(%r12), %rdx
    mov 24(%r12), %rcx
    mov 32(%r12), %r8
    mov 40(%r12), %r9
    mov $8, %rax
    call *%r11
    test %r14, %r14
    jz .Lcall_done
    movdqu %xmm0, -16(%rsp)
    mov -16(%rsp), %rax
.Lcall_done:
    mov wasm_slot_depth(%rip), %rcx
    sub $1, %rcx
    mov %rcx, wasm_slot_depth(%rip)
    lea -48(%rbp), %rsp
    pop %rdi
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbx
    pop %rbp
    ret

# wasm_native_abandon(): back to the innermost wasm_native_call, which
# returns 0 with wasm_abandoned set. Nothing between is unwound.
.globl wasm_native_abandon
wasm_native_abandon:
    mov wasm_slot_depth(%rip), %rax
    test %rax, %rax
    jz .Labandon_none
    sub $1, %rax
    mov %rax, wasm_slot_depth(%rip)
    mov %rax, %r15
    shl $6, %r15
    lea wasm_slots(%rip), %r10
    add %r10, %r15
    mov 0(%r15), %rbx
    mov 8(%r15), %rbp
    mov 16(%r15), %r12
    mov 24(%r15), %r13
    mov 32(%r15), %r14
    mov 40(%r15), %rsp
    mov $1, %rax
    mov %rax, wasm_abandoned_flag(%rip)
    mov $0, %rax
    lea -48(%rbp), %rsp
    pop %rdi
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %rbx
    pop %rbp
    ret
.Labandon_none:
    ret

# wasm_abandoned(): whether the last native call was abandoned (and clear).
.globl wasm_abandoned
wasm_abandoned:
    mov wasm_abandoned_flag(%rip), %rax
    mov $0, %rcx
    mov %rcx, wasm_abandoned_flag(%rip)
    ret

# Callbacks: native code calls trampoline k (1024 of them) with up to five
# integer arguments; it calls the L8 function given to
# wasm_native_set_callback as callback(k, a0, a1, a2, a3, a4) and returns
# its result.
.globl wasm_native_set_callback
wasm_native_set_callback:
    mov %rdi, wasm_callback_fn(%rip)
    mov $0, %rax
    ret

# wasm_trampoline(k): the address of trampoline k (0..1023); the stubs are
# all one size.
.globl wasm_trampoline
wasm_trampoline:
    lea wasm_tramp_0(%rip), %rax
    lea wasm_tramp_1(%rip), %rcx
    sub %rax, %rcx
    imul %rcx, %rdi
    add %rdi, %rax
    ret

wasm_tramp_0:
    mov $0, %rax
    jmp wasm_tramp_common
wasm_tramp_1:
    mov $1, %rax
    jmp wasm_tramp_common
wasm_tramp_2:
    mov $2, %rax
    jmp wasm_tramp_common
wasm_tramp_3:
    mov $3, %rax
    jmp wasm_tramp_common
wasm_tramp_4:
    mov $4, %rax
    jmp wasm_tramp_common
wasm_tramp_5:
    mov $5, %rax
    jmp wasm_tramp_common
wasm_tramp_6:
    mov $6, %rax
    jmp wasm_tramp_common
wasm_tramp_7:
    mov $7, %rax
    jmp wasm_tramp_common
wasm_tramp_8:
    mov $8, %rax
    jmp wasm_tramp_common
wasm_tramp_9:
    mov $9, %rax
    jmp wasm_tramp_common
wasm_tramp_10:
    mov $10, %rax
    jmp wasm_tramp_common
wasm_tramp_11:
    mov $11, %rax
    jmp wasm_tramp_common
wasm_tramp_12:
    mov $12, %rax
    jmp wasm_tramp_common
wasm_tramp_13:
    mov $13, %rax
    jmp wasm_tramp_common
wasm_tramp_14:
    mov $14, %rax
    jmp wasm_tramp_common
wasm_tramp_15:
    mov $15, %rax
    jmp wasm_tramp_common
wasm_tramp_16:
    mov $16, %rax
    jmp wasm_tramp_common
wasm_tramp_17:
    mov $17, %rax
    jmp wasm_tramp_common
wasm_tramp_18:
    mov $18, %rax
    jmp wasm_tramp_common
wasm_tramp_19:
    mov $19, %rax
    jmp wasm_tramp_common
wasm_tramp_20:
    mov $20, %rax
    jmp wasm_tramp_common
wasm_tramp_21:
    mov $21, %rax
    jmp wasm_tramp_common
wasm_tramp_22:
    mov $22, %rax
    jmp wasm_tramp_common
wasm_tramp_23:
    mov $23, %rax
    jmp wasm_tramp_common
wasm_tramp_24:
    mov $24, %rax
    jmp wasm_tramp_common
wasm_tramp_25:
    mov $25, %rax
    jmp wasm_tramp_common
wasm_tramp_26:
    mov $26, %rax
    jmp wasm_tramp_common
wasm_tramp_27:
    mov $27, %rax
    jmp wasm_tramp_common
wasm_tramp_28:
    mov $28, %rax
    jmp wasm_tramp_common
wasm_tramp_29:
    mov $29, %rax
    jmp wasm_tramp_common
wasm_tramp_30:
    mov $30, %rax
    jmp wasm_tramp_common
wasm_tramp_31:
    mov $31, %rax
    jmp wasm_tramp_common
wasm_tramp_32:
    mov $32, %rax
    jmp wasm_tramp_common
wasm_tramp_33:
    mov $33, %rax
    jmp wasm_tramp_common
wasm_tramp_34:
    mov $34, %rax
    jmp wasm_tramp_common
wasm_tramp_35:
    mov $35, %rax
    jmp wasm_tramp_common
wasm_tramp_36:
    mov $36, %rax
    jmp wasm_tramp_common
wasm_tramp_37:
    mov $37, %rax
    jmp wasm_tramp_common
wasm_tramp_38:
    mov $38, %rax
    jmp wasm_tramp_common
wasm_tramp_39:
    mov $39, %rax
    jmp wasm_tramp_common
wasm_tramp_40:
    mov $40, %rax
    jmp wasm_tramp_common
wasm_tramp_41:
    mov $41, %rax
    jmp wasm_tramp_common
wasm_tramp_42:
    mov $42, %rax
    jmp wasm_tramp_common
wasm_tramp_43:
    mov $43, %rax
    jmp wasm_tramp_common
wasm_tramp_44:
    mov $44, %rax
    jmp wasm_tramp_common
wasm_tramp_45:
    mov $45, %rax
    jmp wasm_tramp_common
wasm_tramp_46:
    mov $46, %rax
    jmp wasm_tramp_common
wasm_tramp_47:
    mov $47, %rax
    jmp wasm_tramp_common
wasm_tramp_48:
    mov $48, %rax
    jmp wasm_tramp_common
wasm_tramp_49:
    mov $49, %rax
    jmp wasm_tramp_common
wasm_tramp_50:
    mov $50, %rax
    jmp wasm_tramp_common
wasm_tramp_51:
    mov $51, %rax
    jmp wasm_tramp_common
wasm_tramp_52:
    mov $52, %rax
    jmp wasm_tramp_common
wasm_tramp_53:
    mov $53, %rax
    jmp wasm_tramp_common
wasm_tramp_54:
    mov $54, %rax
    jmp wasm_tramp_common
wasm_tramp_55:
    mov $55, %rax
    jmp wasm_tramp_common
wasm_tramp_56:
    mov $56, %rax
    jmp wasm_tramp_common
wasm_tramp_57:
    mov $57, %rax
    jmp wasm_tramp_common
wasm_tramp_58:
    mov $58, %rax
    jmp wasm_tramp_common
wasm_tramp_59:
    mov $59, %rax
    jmp wasm_tramp_common
wasm_tramp_60:
    mov $60, %rax
    jmp wasm_tramp_common
wasm_tramp_61:
    mov $61, %rax
    jmp wasm_tramp_common
wasm_tramp_62:
    mov $62, %rax
    jmp wasm_tramp_common
wasm_tramp_63:
    mov $63, %rax
    jmp wasm_tramp_common
wasm_tramp_64:
    mov $64, %rax
    jmp wasm_tramp_common
wasm_tramp_65:
    mov $65, %rax
    jmp wasm_tramp_common
wasm_tramp_66:
    mov $66, %rax
    jmp wasm_tramp_common
wasm_tramp_67:
    mov $67, %rax
    jmp wasm_tramp_common
wasm_tramp_68:
    mov $68, %rax
    jmp wasm_tramp_common
wasm_tramp_69:
    mov $69, %rax
    jmp wasm_tramp_common
wasm_tramp_70:
    mov $70, %rax
    jmp wasm_tramp_common
wasm_tramp_71:
    mov $71, %rax
    jmp wasm_tramp_common
wasm_tramp_72:
    mov $72, %rax
    jmp wasm_tramp_common
wasm_tramp_73:
    mov $73, %rax
    jmp wasm_tramp_common
wasm_tramp_74:
    mov $74, %rax
    jmp wasm_tramp_common
wasm_tramp_75:
    mov $75, %rax
    jmp wasm_tramp_common
wasm_tramp_76:
    mov $76, %rax
    jmp wasm_tramp_common
wasm_tramp_77:
    mov $77, %rax
    jmp wasm_tramp_common
wasm_tramp_78:
    mov $78, %rax
    jmp wasm_tramp_common
wasm_tramp_79:
    mov $79, %rax
    jmp wasm_tramp_common
wasm_tramp_80:
    mov $80, %rax
    jmp wasm_tramp_common
wasm_tramp_81:
    mov $81, %rax
    jmp wasm_tramp_common
wasm_tramp_82:
    mov $82, %rax
    jmp wasm_tramp_common
wasm_tramp_83:
    mov $83, %rax
    jmp wasm_tramp_common
wasm_tramp_84:
    mov $84, %rax
    jmp wasm_tramp_common
wasm_tramp_85:
    mov $85, %rax
    jmp wasm_tramp_common
wasm_tramp_86:
    mov $86, %rax
    jmp wasm_tramp_common
wasm_tramp_87:
    mov $87, %rax
    jmp wasm_tramp_common
wasm_tramp_88:
    mov $88, %rax
    jmp wasm_tramp_common
wasm_tramp_89:
    mov $89, %rax
    jmp wasm_tramp_common
wasm_tramp_90:
    mov $90, %rax
    jmp wasm_tramp_common
wasm_tramp_91:
    mov $91, %rax
    jmp wasm_tramp_common
wasm_tramp_92:
    mov $92, %rax
    jmp wasm_tramp_common
wasm_tramp_93:
    mov $93, %rax
    jmp wasm_tramp_common
wasm_tramp_94:
    mov $94, %rax
    jmp wasm_tramp_common
wasm_tramp_95:
    mov $95, %rax
    jmp wasm_tramp_common
wasm_tramp_96:
    mov $96, %rax
    jmp wasm_tramp_common
wasm_tramp_97:
    mov $97, %rax
    jmp wasm_tramp_common
wasm_tramp_98:
    mov $98, %rax
    jmp wasm_tramp_common
wasm_tramp_99:
    mov $99, %rax
    jmp wasm_tramp_common
wasm_tramp_100:
    mov $100, %rax
    jmp wasm_tramp_common
wasm_tramp_101:
    mov $101, %rax
    jmp wasm_tramp_common
wasm_tramp_102:
    mov $102, %rax
    jmp wasm_tramp_common
wasm_tramp_103:
    mov $103, %rax
    jmp wasm_tramp_common
wasm_tramp_104:
    mov $104, %rax
    jmp wasm_tramp_common
wasm_tramp_105:
    mov $105, %rax
    jmp wasm_tramp_common
wasm_tramp_106:
    mov $106, %rax
    jmp wasm_tramp_common
wasm_tramp_107:
    mov $107, %rax
    jmp wasm_tramp_common
wasm_tramp_108:
    mov $108, %rax
    jmp wasm_tramp_common
wasm_tramp_109:
    mov $109, %rax
    jmp wasm_tramp_common
wasm_tramp_110:
    mov $110, %rax
    jmp wasm_tramp_common
wasm_tramp_111:
    mov $111, %rax
    jmp wasm_tramp_common
wasm_tramp_112:
    mov $112, %rax
    jmp wasm_tramp_common
wasm_tramp_113:
    mov $113, %rax
    jmp wasm_tramp_common
wasm_tramp_114:
    mov $114, %rax
    jmp wasm_tramp_common
wasm_tramp_115:
    mov $115, %rax
    jmp wasm_tramp_common
wasm_tramp_116:
    mov $116, %rax
    jmp wasm_tramp_common
wasm_tramp_117:
    mov $117, %rax
    jmp wasm_tramp_common
wasm_tramp_118:
    mov $118, %rax
    jmp wasm_tramp_common
wasm_tramp_119:
    mov $119, %rax
    jmp wasm_tramp_common
wasm_tramp_120:
    mov $120, %rax
    jmp wasm_tramp_common
wasm_tramp_121:
    mov $121, %rax
    jmp wasm_tramp_common
wasm_tramp_122:
    mov $122, %rax
    jmp wasm_tramp_common
wasm_tramp_123:
    mov $123, %rax
    jmp wasm_tramp_common
wasm_tramp_124:
    mov $124, %rax
    jmp wasm_tramp_common
wasm_tramp_125:
    mov $125, %rax
    jmp wasm_tramp_common
wasm_tramp_126:
    mov $126, %rax
    jmp wasm_tramp_common
wasm_tramp_127:
    mov $127, %rax
    jmp wasm_tramp_common
wasm_tramp_128:
    mov $128, %rax
    jmp wasm_tramp_common
wasm_tramp_129:
    mov $129, %rax
    jmp wasm_tramp_common
wasm_tramp_130:
    mov $130, %rax
    jmp wasm_tramp_common
wasm_tramp_131:
    mov $131, %rax
    jmp wasm_tramp_common
wasm_tramp_132:
    mov $132, %rax
    jmp wasm_tramp_common
wasm_tramp_133:
    mov $133, %rax
    jmp wasm_tramp_common
wasm_tramp_134:
    mov $134, %rax
    jmp wasm_tramp_common
wasm_tramp_135:
    mov $135, %rax
    jmp wasm_tramp_common
wasm_tramp_136:
    mov $136, %rax
    jmp wasm_tramp_common
wasm_tramp_137:
    mov $137, %rax
    jmp wasm_tramp_common
wasm_tramp_138:
    mov $138, %rax
    jmp wasm_tramp_common
wasm_tramp_139:
    mov $139, %rax
    jmp wasm_tramp_common
wasm_tramp_140:
    mov $140, %rax
    jmp wasm_tramp_common
wasm_tramp_141:
    mov $141, %rax
    jmp wasm_tramp_common
wasm_tramp_142:
    mov $142, %rax
    jmp wasm_tramp_common
wasm_tramp_143:
    mov $143, %rax
    jmp wasm_tramp_common
wasm_tramp_144:
    mov $144, %rax
    jmp wasm_tramp_common
wasm_tramp_145:
    mov $145, %rax
    jmp wasm_tramp_common
wasm_tramp_146:
    mov $146, %rax
    jmp wasm_tramp_common
wasm_tramp_147:
    mov $147, %rax
    jmp wasm_tramp_common
wasm_tramp_148:
    mov $148, %rax
    jmp wasm_tramp_common
wasm_tramp_149:
    mov $149, %rax
    jmp wasm_tramp_common
wasm_tramp_150:
    mov $150, %rax
    jmp wasm_tramp_common
wasm_tramp_151:
    mov $151, %rax
    jmp wasm_tramp_common
wasm_tramp_152:
    mov $152, %rax
    jmp wasm_tramp_common
wasm_tramp_153:
    mov $153, %rax
    jmp wasm_tramp_common
wasm_tramp_154:
    mov $154, %rax
    jmp wasm_tramp_common
wasm_tramp_155:
    mov $155, %rax
    jmp wasm_tramp_common
wasm_tramp_156:
    mov $156, %rax
    jmp wasm_tramp_common
wasm_tramp_157:
    mov $157, %rax
    jmp wasm_tramp_common
wasm_tramp_158:
    mov $158, %rax
    jmp wasm_tramp_common
wasm_tramp_159:
    mov $159, %rax
    jmp wasm_tramp_common
wasm_tramp_160:
    mov $160, %rax
    jmp wasm_tramp_common
wasm_tramp_161:
    mov $161, %rax
    jmp wasm_tramp_common
wasm_tramp_162:
    mov $162, %rax
    jmp wasm_tramp_common
wasm_tramp_163:
    mov $163, %rax
    jmp wasm_tramp_common
wasm_tramp_164:
    mov $164, %rax
    jmp wasm_tramp_common
wasm_tramp_165:
    mov $165, %rax
    jmp wasm_tramp_common
wasm_tramp_166:
    mov $166, %rax
    jmp wasm_tramp_common
wasm_tramp_167:
    mov $167, %rax
    jmp wasm_tramp_common
wasm_tramp_168:
    mov $168, %rax
    jmp wasm_tramp_common
wasm_tramp_169:
    mov $169, %rax
    jmp wasm_tramp_common
wasm_tramp_170:
    mov $170, %rax
    jmp wasm_tramp_common
wasm_tramp_171:
    mov $171, %rax
    jmp wasm_tramp_common
wasm_tramp_172:
    mov $172, %rax
    jmp wasm_tramp_common
wasm_tramp_173:
    mov $173, %rax
    jmp wasm_tramp_common
wasm_tramp_174:
    mov $174, %rax
    jmp wasm_tramp_common
wasm_tramp_175:
    mov $175, %rax
    jmp wasm_tramp_common
wasm_tramp_176:
    mov $176, %rax
    jmp wasm_tramp_common
wasm_tramp_177:
    mov $177, %rax
    jmp wasm_tramp_common
wasm_tramp_178:
    mov $178, %rax
    jmp wasm_tramp_common
wasm_tramp_179:
    mov $179, %rax
    jmp wasm_tramp_common
wasm_tramp_180:
    mov $180, %rax
    jmp wasm_tramp_common
wasm_tramp_181:
    mov $181, %rax
    jmp wasm_tramp_common
wasm_tramp_182:
    mov $182, %rax
    jmp wasm_tramp_common
wasm_tramp_183:
    mov $183, %rax
    jmp wasm_tramp_common
wasm_tramp_184:
    mov $184, %rax
    jmp wasm_tramp_common
wasm_tramp_185:
    mov $185, %rax
    jmp wasm_tramp_common
wasm_tramp_186:
    mov $186, %rax
    jmp wasm_tramp_common
wasm_tramp_187:
    mov $187, %rax
    jmp wasm_tramp_common
wasm_tramp_188:
    mov $188, %rax
    jmp wasm_tramp_common
wasm_tramp_189:
    mov $189, %rax
    jmp wasm_tramp_common
wasm_tramp_190:
    mov $190, %rax
    jmp wasm_tramp_common
wasm_tramp_191:
    mov $191, %rax
    jmp wasm_tramp_common
wasm_tramp_192:
    mov $192, %rax
    jmp wasm_tramp_common
wasm_tramp_193:
    mov $193, %rax
    jmp wasm_tramp_common
wasm_tramp_194:
    mov $194, %rax
    jmp wasm_tramp_common
wasm_tramp_195:
    mov $195, %rax
    jmp wasm_tramp_common
wasm_tramp_196:
    mov $196, %rax
    jmp wasm_tramp_common
wasm_tramp_197:
    mov $197, %rax
    jmp wasm_tramp_common
wasm_tramp_198:
    mov $198, %rax
    jmp wasm_tramp_common
wasm_tramp_199:
    mov $199, %rax
    jmp wasm_tramp_common
wasm_tramp_200:
    mov $200, %rax
    jmp wasm_tramp_common
wasm_tramp_201:
    mov $201, %rax
    jmp wasm_tramp_common
wasm_tramp_202:
    mov $202, %rax
    jmp wasm_tramp_common
wasm_tramp_203:
    mov $203, %rax
    jmp wasm_tramp_common
wasm_tramp_204:
    mov $204, %rax
    jmp wasm_tramp_common
wasm_tramp_205:
    mov $205, %rax
    jmp wasm_tramp_common
wasm_tramp_206:
    mov $206, %rax
    jmp wasm_tramp_common
wasm_tramp_207:
    mov $207, %rax
    jmp wasm_tramp_common
wasm_tramp_208:
    mov $208, %rax
    jmp wasm_tramp_common
wasm_tramp_209:
    mov $209, %rax
    jmp wasm_tramp_common
wasm_tramp_210:
    mov $210, %rax
    jmp wasm_tramp_common
wasm_tramp_211:
    mov $211, %rax
    jmp wasm_tramp_common
wasm_tramp_212:
    mov $212, %rax
    jmp wasm_tramp_common
wasm_tramp_213:
    mov $213, %rax
    jmp wasm_tramp_common
wasm_tramp_214:
    mov $214, %rax
    jmp wasm_tramp_common
wasm_tramp_215:
    mov $215, %rax
    jmp wasm_tramp_common
wasm_tramp_216:
    mov $216, %rax
    jmp wasm_tramp_common
wasm_tramp_217:
    mov $217, %rax
    jmp wasm_tramp_common
wasm_tramp_218:
    mov $218, %rax
    jmp wasm_tramp_common
wasm_tramp_219:
    mov $219, %rax
    jmp wasm_tramp_common
wasm_tramp_220:
    mov $220, %rax
    jmp wasm_tramp_common
wasm_tramp_221:
    mov $221, %rax
    jmp wasm_tramp_common
wasm_tramp_222:
    mov $222, %rax
    jmp wasm_tramp_common
wasm_tramp_223:
    mov $223, %rax
    jmp wasm_tramp_common
wasm_tramp_224:
    mov $224, %rax
    jmp wasm_tramp_common
wasm_tramp_225:
    mov $225, %rax
    jmp wasm_tramp_common
wasm_tramp_226:
    mov $226, %rax
    jmp wasm_tramp_common
wasm_tramp_227:
    mov $227, %rax
    jmp wasm_tramp_common
wasm_tramp_228:
    mov $228, %rax
    jmp wasm_tramp_common
wasm_tramp_229:
    mov $229, %rax
    jmp wasm_tramp_common
wasm_tramp_230:
    mov $230, %rax
    jmp wasm_tramp_common
wasm_tramp_231:
    mov $231, %rax
    jmp wasm_tramp_common
wasm_tramp_232:
    mov $232, %rax
    jmp wasm_tramp_common
wasm_tramp_233:
    mov $233, %rax
    jmp wasm_tramp_common
wasm_tramp_234:
    mov $234, %rax
    jmp wasm_tramp_common
wasm_tramp_235:
    mov $235, %rax
    jmp wasm_tramp_common
wasm_tramp_236:
    mov $236, %rax
    jmp wasm_tramp_common
wasm_tramp_237:
    mov $237, %rax
    jmp wasm_tramp_common
wasm_tramp_238:
    mov $238, %rax
    jmp wasm_tramp_common
wasm_tramp_239:
    mov $239, %rax
    jmp wasm_tramp_common
wasm_tramp_240:
    mov $240, %rax
    jmp wasm_tramp_common
wasm_tramp_241:
    mov $241, %rax
    jmp wasm_tramp_common
wasm_tramp_242:
    mov $242, %rax
    jmp wasm_tramp_common
wasm_tramp_243:
    mov $243, %rax
    jmp wasm_tramp_common
wasm_tramp_244:
    mov $244, %rax
    jmp wasm_tramp_common
wasm_tramp_245:
    mov $245, %rax
    jmp wasm_tramp_common
wasm_tramp_246:
    mov $246, %rax
    jmp wasm_tramp_common
wasm_tramp_247:
    mov $247, %rax
    jmp wasm_tramp_common
wasm_tramp_248:
    mov $248, %rax
    jmp wasm_tramp_common
wasm_tramp_249:
    mov $249, %rax
    jmp wasm_tramp_common
wasm_tramp_250:
    mov $250, %rax
    jmp wasm_tramp_common
wasm_tramp_251:
    mov $251, %rax
    jmp wasm_tramp_common
wasm_tramp_252:
    mov $252, %rax
    jmp wasm_tramp_common
wasm_tramp_253:
    mov $253, %rax
    jmp wasm_tramp_common
wasm_tramp_254:
    mov $254, %rax
    jmp wasm_tramp_common
wasm_tramp_255:
    mov $255, %rax
    jmp wasm_tramp_common
wasm_tramp_256:
    mov $256, %rax
    jmp wasm_tramp_common
wasm_tramp_257:
    mov $257, %rax
    jmp wasm_tramp_common
wasm_tramp_258:
    mov $258, %rax
    jmp wasm_tramp_common
wasm_tramp_259:
    mov $259, %rax
    jmp wasm_tramp_common
wasm_tramp_260:
    mov $260, %rax
    jmp wasm_tramp_common
wasm_tramp_261:
    mov $261, %rax
    jmp wasm_tramp_common
wasm_tramp_262:
    mov $262, %rax
    jmp wasm_tramp_common
wasm_tramp_263:
    mov $263, %rax
    jmp wasm_tramp_common
wasm_tramp_264:
    mov $264, %rax
    jmp wasm_tramp_common
wasm_tramp_265:
    mov $265, %rax
    jmp wasm_tramp_common
wasm_tramp_266:
    mov $266, %rax
    jmp wasm_tramp_common
wasm_tramp_267:
    mov $267, %rax
    jmp wasm_tramp_common
wasm_tramp_268:
    mov $268, %rax
    jmp wasm_tramp_common
wasm_tramp_269:
    mov $269, %rax
    jmp wasm_tramp_common
wasm_tramp_270:
    mov $270, %rax
    jmp wasm_tramp_common
wasm_tramp_271:
    mov $271, %rax
    jmp wasm_tramp_common
wasm_tramp_272:
    mov $272, %rax
    jmp wasm_tramp_common
wasm_tramp_273:
    mov $273, %rax
    jmp wasm_tramp_common
wasm_tramp_274:
    mov $274, %rax
    jmp wasm_tramp_common
wasm_tramp_275:
    mov $275, %rax
    jmp wasm_tramp_common
wasm_tramp_276:
    mov $276, %rax
    jmp wasm_tramp_common
wasm_tramp_277:
    mov $277, %rax
    jmp wasm_tramp_common
wasm_tramp_278:
    mov $278, %rax
    jmp wasm_tramp_common
wasm_tramp_279:
    mov $279, %rax
    jmp wasm_tramp_common
wasm_tramp_280:
    mov $280, %rax
    jmp wasm_tramp_common
wasm_tramp_281:
    mov $281, %rax
    jmp wasm_tramp_common
wasm_tramp_282:
    mov $282, %rax
    jmp wasm_tramp_common
wasm_tramp_283:
    mov $283, %rax
    jmp wasm_tramp_common
wasm_tramp_284:
    mov $284, %rax
    jmp wasm_tramp_common
wasm_tramp_285:
    mov $285, %rax
    jmp wasm_tramp_common
wasm_tramp_286:
    mov $286, %rax
    jmp wasm_tramp_common
wasm_tramp_287:
    mov $287, %rax
    jmp wasm_tramp_common
wasm_tramp_288:
    mov $288, %rax
    jmp wasm_tramp_common
wasm_tramp_289:
    mov $289, %rax
    jmp wasm_tramp_common
wasm_tramp_290:
    mov $290, %rax
    jmp wasm_tramp_common
wasm_tramp_291:
    mov $291, %rax
    jmp wasm_tramp_common
wasm_tramp_292:
    mov $292, %rax
    jmp wasm_tramp_common
wasm_tramp_293:
    mov $293, %rax
    jmp wasm_tramp_common
wasm_tramp_294:
    mov $294, %rax
    jmp wasm_tramp_common
wasm_tramp_295:
    mov $295, %rax
    jmp wasm_tramp_common
wasm_tramp_296:
    mov $296, %rax
    jmp wasm_tramp_common
wasm_tramp_297:
    mov $297, %rax
    jmp wasm_tramp_common
wasm_tramp_298:
    mov $298, %rax
    jmp wasm_tramp_common
wasm_tramp_299:
    mov $299, %rax
    jmp wasm_tramp_common
wasm_tramp_300:
    mov $300, %rax
    jmp wasm_tramp_common
wasm_tramp_301:
    mov $301, %rax
    jmp wasm_tramp_common
wasm_tramp_302:
    mov $302, %rax
    jmp wasm_tramp_common
wasm_tramp_303:
    mov $303, %rax
    jmp wasm_tramp_common
wasm_tramp_304:
    mov $304, %rax
    jmp wasm_tramp_common
wasm_tramp_305:
    mov $305, %rax
    jmp wasm_tramp_common
wasm_tramp_306:
    mov $306, %rax
    jmp wasm_tramp_common
wasm_tramp_307:
    mov $307, %rax
    jmp wasm_tramp_common
wasm_tramp_308:
    mov $308, %rax
    jmp wasm_tramp_common
wasm_tramp_309:
    mov $309, %rax
    jmp wasm_tramp_common
wasm_tramp_310:
    mov $310, %rax
    jmp wasm_tramp_common
wasm_tramp_311:
    mov $311, %rax
    jmp wasm_tramp_common
wasm_tramp_312:
    mov $312, %rax
    jmp wasm_tramp_common
wasm_tramp_313:
    mov $313, %rax
    jmp wasm_tramp_common
wasm_tramp_314:
    mov $314, %rax
    jmp wasm_tramp_common
wasm_tramp_315:
    mov $315, %rax
    jmp wasm_tramp_common
wasm_tramp_316:
    mov $316, %rax
    jmp wasm_tramp_common
wasm_tramp_317:
    mov $317, %rax
    jmp wasm_tramp_common
wasm_tramp_318:
    mov $318, %rax
    jmp wasm_tramp_common
wasm_tramp_319:
    mov $319, %rax
    jmp wasm_tramp_common
wasm_tramp_320:
    mov $320, %rax
    jmp wasm_tramp_common
wasm_tramp_321:
    mov $321, %rax
    jmp wasm_tramp_common
wasm_tramp_322:
    mov $322, %rax
    jmp wasm_tramp_common
wasm_tramp_323:
    mov $323, %rax
    jmp wasm_tramp_common
wasm_tramp_324:
    mov $324, %rax
    jmp wasm_tramp_common
wasm_tramp_325:
    mov $325, %rax
    jmp wasm_tramp_common
wasm_tramp_326:
    mov $326, %rax
    jmp wasm_tramp_common
wasm_tramp_327:
    mov $327, %rax
    jmp wasm_tramp_common
wasm_tramp_328:
    mov $328, %rax
    jmp wasm_tramp_common
wasm_tramp_329:
    mov $329, %rax
    jmp wasm_tramp_common
wasm_tramp_330:
    mov $330, %rax
    jmp wasm_tramp_common
wasm_tramp_331:
    mov $331, %rax
    jmp wasm_tramp_common
wasm_tramp_332:
    mov $332, %rax
    jmp wasm_tramp_common
wasm_tramp_333:
    mov $333, %rax
    jmp wasm_tramp_common
wasm_tramp_334:
    mov $334, %rax
    jmp wasm_tramp_common
wasm_tramp_335:
    mov $335, %rax
    jmp wasm_tramp_common
wasm_tramp_336:
    mov $336, %rax
    jmp wasm_tramp_common
wasm_tramp_337:
    mov $337, %rax
    jmp wasm_tramp_common
wasm_tramp_338:
    mov $338, %rax
    jmp wasm_tramp_common
wasm_tramp_339:
    mov $339, %rax
    jmp wasm_tramp_common
wasm_tramp_340:
    mov $340, %rax
    jmp wasm_tramp_common
wasm_tramp_341:
    mov $341, %rax
    jmp wasm_tramp_common
wasm_tramp_342:
    mov $342, %rax
    jmp wasm_tramp_common
wasm_tramp_343:
    mov $343, %rax
    jmp wasm_tramp_common
wasm_tramp_344:
    mov $344, %rax
    jmp wasm_tramp_common
wasm_tramp_345:
    mov $345, %rax
    jmp wasm_tramp_common
wasm_tramp_346:
    mov $346, %rax
    jmp wasm_tramp_common
wasm_tramp_347:
    mov $347, %rax
    jmp wasm_tramp_common
wasm_tramp_348:
    mov $348, %rax
    jmp wasm_tramp_common
wasm_tramp_349:
    mov $349, %rax
    jmp wasm_tramp_common
wasm_tramp_350:
    mov $350, %rax
    jmp wasm_tramp_common
wasm_tramp_351:
    mov $351, %rax
    jmp wasm_tramp_common
wasm_tramp_352:
    mov $352, %rax
    jmp wasm_tramp_common
wasm_tramp_353:
    mov $353, %rax
    jmp wasm_tramp_common
wasm_tramp_354:
    mov $354, %rax
    jmp wasm_tramp_common
wasm_tramp_355:
    mov $355, %rax
    jmp wasm_tramp_common
wasm_tramp_356:
    mov $356, %rax
    jmp wasm_tramp_common
wasm_tramp_357:
    mov $357, %rax
    jmp wasm_tramp_common
wasm_tramp_358:
    mov $358, %rax
    jmp wasm_tramp_common
wasm_tramp_359:
    mov $359, %rax
    jmp wasm_tramp_common
wasm_tramp_360:
    mov $360, %rax
    jmp wasm_tramp_common
wasm_tramp_361:
    mov $361, %rax
    jmp wasm_tramp_common
wasm_tramp_362:
    mov $362, %rax
    jmp wasm_tramp_common
wasm_tramp_363:
    mov $363, %rax
    jmp wasm_tramp_common
wasm_tramp_364:
    mov $364, %rax
    jmp wasm_tramp_common
wasm_tramp_365:
    mov $365, %rax
    jmp wasm_tramp_common
wasm_tramp_366:
    mov $366, %rax
    jmp wasm_tramp_common
wasm_tramp_367:
    mov $367, %rax
    jmp wasm_tramp_common
wasm_tramp_368:
    mov $368, %rax
    jmp wasm_tramp_common
wasm_tramp_369:
    mov $369, %rax
    jmp wasm_tramp_common
wasm_tramp_370:
    mov $370, %rax
    jmp wasm_tramp_common
wasm_tramp_371:
    mov $371, %rax
    jmp wasm_tramp_common
wasm_tramp_372:
    mov $372, %rax
    jmp wasm_tramp_common
wasm_tramp_373:
    mov $373, %rax
    jmp wasm_tramp_common
wasm_tramp_374:
    mov $374, %rax
    jmp wasm_tramp_common
wasm_tramp_375:
    mov $375, %rax
    jmp wasm_tramp_common
wasm_tramp_376:
    mov $376, %rax
    jmp wasm_tramp_common
wasm_tramp_377:
    mov $377, %rax
    jmp wasm_tramp_common
wasm_tramp_378:
    mov $378, %rax
    jmp wasm_tramp_common
wasm_tramp_379:
    mov $379, %rax
    jmp wasm_tramp_common
wasm_tramp_380:
    mov $380, %rax
    jmp wasm_tramp_common
wasm_tramp_381:
    mov $381, %rax
    jmp wasm_tramp_common
wasm_tramp_382:
    mov $382, %rax
    jmp wasm_tramp_common
wasm_tramp_383:
    mov $383, %rax
    jmp wasm_tramp_common
wasm_tramp_384:
    mov $384, %rax
    jmp wasm_tramp_common
wasm_tramp_385:
    mov $385, %rax
    jmp wasm_tramp_common
wasm_tramp_386:
    mov $386, %rax
    jmp wasm_tramp_common
wasm_tramp_387:
    mov $387, %rax
    jmp wasm_tramp_common
wasm_tramp_388:
    mov $388, %rax
    jmp wasm_tramp_common
wasm_tramp_389:
    mov $389, %rax
    jmp wasm_tramp_common
wasm_tramp_390:
    mov $390, %rax
    jmp wasm_tramp_common
wasm_tramp_391:
    mov $391, %rax
    jmp wasm_tramp_common
wasm_tramp_392:
    mov $392, %rax
    jmp wasm_tramp_common
wasm_tramp_393:
    mov $393, %rax
    jmp wasm_tramp_common
wasm_tramp_394:
    mov $394, %rax
    jmp wasm_tramp_common
wasm_tramp_395:
    mov $395, %rax
    jmp wasm_tramp_common
wasm_tramp_396:
    mov $396, %rax
    jmp wasm_tramp_common
wasm_tramp_397:
    mov $397, %rax
    jmp wasm_tramp_common
wasm_tramp_398:
    mov $398, %rax
    jmp wasm_tramp_common
wasm_tramp_399:
    mov $399, %rax
    jmp wasm_tramp_common
wasm_tramp_400:
    mov $400, %rax
    jmp wasm_tramp_common
wasm_tramp_401:
    mov $401, %rax
    jmp wasm_tramp_common
wasm_tramp_402:
    mov $402, %rax
    jmp wasm_tramp_common
wasm_tramp_403:
    mov $403, %rax
    jmp wasm_tramp_common
wasm_tramp_404:
    mov $404, %rax
    jmp wasm_tramp_common
wasm_tramp_405:
    mov $405, %rax
    jmp wasm_tramp_common
wasm_tramp_406:
    mov $406, %rax
    jmp wasm_tramp_common
wasm_tramp_407:
    mov $407, %rax
    jmp wasm_tramp_common
wasm_tramp_408:
    mov $408, %rax
    jmp wasm_tramp_common
wasm_tramp_409:
    mov $409, %rax
    jmp wasm_tramp_common
wasm_tramp_410:
    mov $410, %rax
    jmp wasm_tramp_common
wasm_tramp_411:
    mov $411, %rax
    jmp wasm_tramp_common
wasm_tramp_412:
    mov $412, %rax
    jmp wasm_tramp_common
wasm_tramp_413:
    mov $413, %rax
    jmp wasm_tramp_common
wasm_tramp_414:
    mov $414, %rax
    jmp wasm_tramp_common
wasm_tramp_415:
    mov $415, %rax
    jmp wasm_tramp_common
wasm_tramp_416:
    mov $416, %rax
    jmp wasm_tramp_common
wasm_tramp_417:
    mov $417, %rax
    jmp wasm_tramp_common
wasm_tramp_418:
    mov $418, %rax
    jmp wasm_tramp_common
wasm_tramp_419:
    mov $419, %rax
    jmp wasm_tramp_common
wasm_tramp_420:
    mov $420, %rax
    jmp wasm_tramp_common
wasm_tramp_421:
    mov $421, %rax
    jmp wasm_tramp_common
wasm_tramp_422:
    mov $422, %rax
    jmp wasm_tramp_common
wasm_tramp_423:
    mov $423, %rax
    jmp wasm_tramp_common
wasm_tramp_424:
    mov $424, %rax
    jmp wasm_tramp_common
wasm_tramp_425:
    mov $425, %rax
    jmp wasm_tramp_common
wasm_tramp_426:
    mov $426, %rax
    jmp wasm_tramp_common
wasm_tramp_427:
    mov $427, %rax
    jmp wasm_tramp_common
wasm_tramp_428:
    mov $428, %rax
    jmp wasm_tramp_common
wasm_tramp_429:
    mov $429, %rax
    jmp wasm_tramp_common
wasm_tramp_430:
    mov $430, %rax
    jmp wasm_tramp_common
wasm_tramp_431:
    mov $431, %rax
    jmp wasm_tramp_common
wasm_tramp_432:
    mov $432, %rax
    jmp wasm_tramp_common
wasm_tramp_433:
    mov $433, %rax
    jmp wasm_tramp_common
wasm_tramp_434:
    mov $434, %rax
    jmp wasm_tramp_common
wasm_tramp_435:
    mov $435, %rax
    jmp wasm_tramp_common
wasm_tramp_436:
    mov $436, %rax
    jmp wasm_tramp_common
wasm_tramp_437:
    mov $437, %rax
    jmp wasm_tramp_common
wasm_tramp_438:
    mov $438, %rax
    jmp wasm_tramp_common
wasm_tramp_439:
    mov $439, %rax
    jmp wasm_tramp_common
wasm_tramp_440:
    mov $440, %rax
    jmp wasm_tramp_common
wasm_tramp_441:
    mov $441, %rax
    jmp wasm_tramp_common
wasm_tramp_442:
    mov $442, %rax
    jmp wasm_tramp_common
wasm_tramp_443:
    mov $443, %rax
    jmp wasm_tramp_common
wasm_tramp_444:
    mov $444, %rax
    jmp wasm_tramp_common
wasm_tramp_445:
    mov $445, %rax
    jmp wasm_tramp_common
wasm_tramp_446:
    mov $446, %rax
    jmp wasm_tramp_common
wasm_tramp_447:
    mov $447, %rax
    jmp wasm_tramp_common
wasm_tramp_448:
    mov $448, %rax
    jmp wasm_tramp_common
wasm_tramp_449:
    mov $449, %rax
    jmp wasm_tramp_common
wasm_tramp_450:
    mov $450, %rax
    jmp wasm_tramp_common
wasm_tramp_451:
    mov $451, %rax
    jmp wasm_tramp_common
wasm_tramp_452:
    mov $452, %rax
    jmp wasm_tramp_common
wasm_tramp_453:
    mov $453, %rax
    jmp wasm_tramp_common
wasm_tramp_454:
    mov $454, %rax
    jmp wasm_tramp_common
wasm_tramp_455:
    mov $455, %rax
    jmp wasm_tramp_common
wasm_tramp_456:
    mov $456, %rax
    jmp wasm_tramp_common
wasm_tramp_457:
    mov $457, %rax
    jmp wasm_tramp_common
wasm_tramp_458:
    mov $458, %rax
    jmp wasm_tramp_common
wasm_tramp_459:
    mov $459, %rax
    jmp wasm_tramp_common
wasm_tramp_460:
    mov $460, %rax
    jmp wasm_tramp_common
wasm_tramp_461:
    mov $461, %rax
    jmp wasm_tramp_common
wasm_tramp_462:
    mov $462, %rax
    jmp wasm_tramp_common
wasm_tramp_463:
    mov $463, %rax
    jmp wasm_tramp_common
wasm_tramp_464:
    mov $464, %rax
    jmp wasm_tramp_common
wasm_tramp_465:
    mov $465, %rax
    jmp wasm_tramp_common
wasm_tramp_466:
    mov $466, %rax
    jmp wasm_tramp_common
wasm_tramp_467:
    mov $467, %rax
    jmp wasm_tramp_common
wasm_tramp_468:
    mov $468, %rax
    jmp wasm_tramp_common
wasm_tramp_469:
    mov $469, %rax
    jmp wasm_tramp_common
wasm_tramp_470:
    mov $470, %rax
    jmp wasm_tramp_common
wasm_tramp_471:
    mov $471, %rax
    jmp wasm_tramp_common
wasm_tramp_472:
    mov $472, %rax
    jmp wasm_tramp_common
wasm_tramp_473:
    mov $473, %rax
    jmp wasm_tramp_common
wasm_tramp_474:
    mov $474, %rax
    jmp wasm_tramp_common
wasm_tramp_475:
    mov $475, %rax
    jmp wasm_tramp_common
wasm_tramp_476:
    mov $476, %rax
    jmp wasm_tramp_common
wasm_tramp_477:
    mov $477, %rax
    jmp wasm_tramp_common
wasm_tramp_478:
    mov $478, %rax
    jmp wasm_tramp_common
wasm_tramp_479:
    mov $479, %rax
    jmp wasm_tramp_common
wasm_tramp_480:
    mov $480, %rax
    jmp wasm_tramp_common
wasm_tramp_481:
    mov $481, %rax
    jmp wasm_tramp_common
wasm_tramp_482:
    mov $482, %rax
    jmp wasm_tramp_common
wasm_tramp_483:
    mov $483, %rax
    jmp wasm_tramp_common
wasm_tramp_484:
    mov $484, %rax
    jmp wasm_tramp_common
wasm_tramp_485:
    mov $485, %rax
    jmp wasm_tramp_common
wasm_tramp_486:
    mov $486, %rax
    jmp wasm_tramp_common
wasm_tramp_487:
    mov $487, %rax
    jmp wasm_tramp_common
wasm_tramp_488:
    mov $488, %rax
    jmp wasm_tramp_common
wasm_tramp_489:
    mov $489, %rax
    jmp wasm_tramp_common
wasm_tramp_490:
    mov $490, %rax
    jmp wasm_tramp_common
wasm_tramp_491:
    mov $491, %rax
    jmp wasm_tramp_common
wasm_tramp_492:
    mov $492, %rax
    jmp wasm_tramp_common
wasm_tramp_493:
    mov $493, %rax
    jmp wasm_tramp_common
wasm_tramp_494:
    mov $494, %rax
    jmp wasm_tramp_common
wasm_tramp_495:
    mov $495, %rax
    jmp wasm_tramp_common
wasm_tramp_496:
    mov $496, %rax
    jmp wasm_tramp_common
wasm_tramp_497:
    mov $497, %rax
    jmp wasm_tramp_common
wasm_tramp_498:
    mov $498, %rax
    jmp wasm_tramp_common
wasm_tramp_499:
    mov $499, %rax
    jmp wasm_tramp_common
wasm_tramp_500:
    mov $500, %rax
    jmp wasm_tramp_common
wasm_tramp_501:
    mov $501, %rax
    jmp wasm_tramp_common
wasm_tramp_502:
    mov $502, %rax
    jmp wasm_tramp_common
wasm_tramp_503:
    mov $503, %rax
    jmp wasm_tramp_common
wasm_tramp_504:
    mov $504, %rax
    jmp wasm_tramp_common
wasm_tramp_505:
    mov $505, %rax
    jmp wasm_tramp_common
wasm_tramp_506:
    mov $506, %rax
    jmp wasm_tramp_common
wasm_tramp_507:
    mov $507, %rax
    jmp wasm_tramp_common
wasm_tramp_508:
    mov $508, %rax
    jmp wasm_tramp_common
wasm_tramp_509:
    mov $509, %rax
    jmp wasm_tramp_common
wasm_tramp_510:
    mov $510, %rax
    jmp wasm_tramp_common
wasm_tramp_511:
    mov $511, %rax
    jmp wasm_tramp_common
wasm_tramp_512:
    mov $512, %rax
    jmp wasm_tramp_common
wasm_tramp_513:
    mov $513, %rax
    jmp wasm_tramp_common
wasm_tramp_514:
    mov $514, %rax
    jmp wasm_tramp_common
wasm_tramp_515:
    mov $515, %rax
    jmp wasm_tramp_common
wasm_tramp_516:
    mov $516, %rax
    jmp wasm_tramp_common
wasm_tramp_517:
    mov $517, %rax
    jmp wasm_tramp_common
wasm_tramp_518:
    mov $518, %rax
    jmp wasm_tramp_common
wasm_tramp_519:
    mov $519, %rax
    jmp wasm_tramp_common
wasm_tramp_520:
    mov $520, %rax
    jmp wasm_tramp_common
wasm_tramp_521:
    mov $521, %rax
    jmp wasm_tramp_common
wasm_tramp_522:
    mov $522, %rax
    jmp wasm_tramp_common
wasm_tramp_523:
    mov $523, %rax
    jmp wasm_tramp_common
wasm_tramp_524:
    mov $524, %rax
    jmp wasm_tramp_common
wasm_tramp_525:
    mov $525, %rax
    jmp wasm_tramp_common
wasm_tramp_526:
    mov $526, %rax
    jmp wasm_tramp_common
wasm_tramp_527:
    mov $527, %rax
    jmp wasm_tramp_common
wasm_tramp_528:
    mov $528, %rax
    jmp wasm_tramp_common
wasm_tramp_529:
    mov $529, %rax
    jmp wasm_tramp_common
wasm_tramp_530:
    mov $530, %rax
    jmp wasm_tramp_common
wasm_tramp_531:
    mov $531, %rax
    jmp wasm_tramp_common
wasm_tramp_532:
    mov $532, %rax
    jmp wasm_tramp_common
wasm_tramp_533:
    mov $533, %rax
    jmp wasm_tramp_common
wasm_tramp_534:
    mov $534, %rax
    jmp wasm_tramp_common
wasm_tramp_535:
    mov $535, %rax
    jmp wasm_tramp_common
wasm_tramp_536:
    mov $536, %rax
    jmp wasm_tramp_common
wasm_tramp_537:
    mov $537, %rax
    jmp wasm_tramp_common
wasm_tramp_538:
    mov $538, %rax
    jmp wasm_tramp_common
wasm_tramp_539:
    mov $539, %rax
    jmp wasm_tramp_common
wasm_tramp_540:
    mov $540, %rax
    jmp wasm_tramp_common
wasm_tramp_541:
    mov $541, %rax
    jmp wasm_tramp_common
wasm_tramp_542:
    mov $542, %rax
    jmp wasm_tramp_common
wasm_tramp_543:
    mov $543, %rax
    jmp wasm_tramp_common
wasm_tramp_544:
    mov $544, %rax
    jmp wasm_tramp_common
wasm_tramp_545:
    mov $545, %rax
    jmp wasm_tramp_common
wasm_tramp_546:
    mov $546, %rax
    jmp wasm_tramp_common
wasm_tramp_547:
    mov $547, %rax
    jmp wasm_tramp_common
wasm_tramp_548:
    mov $548, %rax
    jmp wasm_tramp_common
wasm_tramp_549:
    mov $549, %rax
    jmp wasm_tramp_common
wasm_tramp_550:
    mov $550, %rax
    jmp wasm_tramp_common
wasm_tramp_551:
    mov $551, %rax
    jmp wasm_tramp_common
wasm_tramp_552:
    mov $552, %rax
    jmp wasm_tramp_common
wasm_tramp_553:
    mov $553, %rax
    jmp wasm_tramp_common
wasm_tramp_554:
    mov $554, %rax
    jmp wasm_tramp_common
wasm_tramp_555:
    mov $555, %rax
    jmp wasm_tramp_common
wasm_tramp_556:
    mov $556, %rax
    jmp wasm_tramp_common
wasm_tramp_557:
    mov $557, %rax
    jmp wasm_tramp_common
wasm_tramp_558:
    mov $558, %rax
    jmp wasm_tramp_common
wasm_tramp_559:
    mov $559, %rax
    jmp wasm_tramp_common
wasm_tramp_560:
    mov $560, %rax
    jmp wasm_tramp_common
wasm_tramp_561:
    mov $561, %rax
    jmp wasm_tramp_common
wasm_tramp_562:
    mov $562, %rax
    jmp wasm_tramp_common
wasm_tramp_563:
    mov $563, %rax
    jmp wasm_tramp_common
wasm_tramp_564:
    mov $564, %rax
    jmp wasm_tramp_common
wasm_tramp_565:
    mov $565, %rax
    jmp wasm_tramp_common
wasm_tramp_566:
    mov $566, %rax
    jmp wasm_tramp_common
wasm_tramp_567:
    mov $567, %rax
    jmp wasm_tramp_common
wasm_tramp_568:
    mov $568, %rax
    jmp wasm_tramp_common
wasm_tramp_569:
    mov $569, %rax
    jmp wasm_tramp_common
wasm_tramp_570:
    mov $570, %rax
    jmp wasm_tramp_common
wasm_tramp_571:
    mov $571, %rax
    jmp wasm_tramp_common
wasm_tramp_572:
    mov $572, %rax
    jmp wasm_tramp_common
wasm_tramp_573:
    mov $573, %rax
    jmp wasm_tramp_common
wasm_tramp_574:
    mov $574, %rax
    jmp wasm_tramp_common
wasm_tramp_575:
    mov $575, %rax
    jmp wasm_tramp_common
wasm_tramp_576:
    mov $576, %rax
    jmp wasm_tramp_common
wasm_tramp_577:
    mov $577, %rax
    jmp wasm_tramp_common
wasm_tramp_578:
    mov $578, %rax
    jmp wasm_tramp_common
wasm_tramp_579:
    mov $579, %rax
    jmp wasm_tramp_common
wasm_tramp_580:
    mov $580, %rax
    jmp wasm_tramp_common
wasm_tramp_581:
    mov $581, %rax
    jmp wasm_tramp_common
wasm_tramp_582:
    mov $582, %rax
    jmp wasm_tramp_common
wasm_tramp_583:
    mov $583, %rax
    jmp wasm_tramp_common
wasm_tramp_584:
    mov $584, %rax
    jmp wasm_tramp_common
wasm_tramp_585:
    mov $585, %rax
    jmp wasm_tramp_common
wasm_tramp_586:
    mov $586, %rax
    jmp wasm_tramp_common
wasm_tramp_587:
    mov $587, %rax
    jmp wasm_tramp_common
wasm_tramp_588:
    mov $588, %rax
    jmp wasm_tramp_common
wasm_tramp_589:
    mov $589, %rax
    jmp wasm_tramp_common
wasm_tramp_590:
    mov $590, %rax
    jmp wasm_tramp_common
wasm_tramp_591:
    mov $591, %rax
    jmp wasm_tramp_common
wasm_tramp_592:
    mov $592, %rax
    jmp wasm_tramp_common
wasm_tramp_593:
    mov $593, %rax
    jmp wasm_tramp_common
wasm_tramp_594:
    mov $594, %rax
    jmp wasm_tramp_common
wasm_tramp_595:
    mov $595, %rax
    jmp wasm_tramp_common
wasm_tramp_596:
    mov $596, %rax
    jmp wasm_tramp_common
wasm_tramp_597:
    mov $597, %rax
    jmp wasm_tramp_common
wasm_tramp_598:
    mov $598, %rax
    jmp wasm_tramp_common
wasm_tramp_599:
    mov $599, %rax
    jmp wasm_tramp_common
wasm_tramp_600:
    mov $600, %rax
    jmp wasm_tramp_common
wasm_tramp_601:
    mov $601, %rax
    jmp wasm_tramp_common
wasm_tramp_602:
    mov $602, %rax
    jmp wasm_tramp_common
wasm_tramp_603:
    mov $603, %rax
    jmp wasm_tramp_common
wasm_tramp_604:
    mov $604, %rax
    jmp wasm_tramp_common
wasm_tramp_605:
    mov $605, %rax
    jmp wasm_tramp_common
wasm_tramp_606:
    mov $606, %rax
    jmp wasm_tramp_common
wasm_tramp_607:
    mov $607, %rax
    jmp wasm_tramp_common
wasm_tramp_608:
    mov $608, %rax
    jmp wasm_tramp_common
wasm_tramp_609:
    mov $609, %rax
    jmp wasm_tramp_common
wasm_tramp_610:
    mov $610, %rax
    jmp wasm_tramp_common
wasm_tramp_611:
    mov $611, %rax
    jmp wasm_tramp_common
wasm_tramp_612:
    mov $612, %rax
    jmp wasm_tramp_common
wasm_tramp_613:
    mov $613, %rax
    jmp wasm_tramp_common
wasm_tramp_614:
    mov $614, %rax
    jmp wasm_tramp_common
wasm_tramp_615:
    mov $615, %rax
    jmp wasm_tramp_common
wasm_tramp_616:
    mov $616, %rax
    jmp wasm_tramp_common
wasm_tramp_617:
    mov $617, %rax
    jmp wasm_tramp_common
wasm_tramp_618:
    mov $618, %rax
    jmp wasm_tramp_common
wasm_tramp_619:
    mov $619, %rax
    jmp wasm_tramp_common
wasm_tramp_620:
    mov $620, %rax
    jmp wasm_tramp_common
wasm_tramp_621:
    mov $621, %rax
    jmp wasm_tramp_common
wasm_tramp_622:
    mov $622, %rax
    jmp wasm_tramp_common
wasm_tramp_623:
    mov $623, %rax
    jmp wasm_tramp_common
wasm_tramp_624:
    mov $624, %rax
    jmp wasm_tramp_common
wasm_tramp_625:
    mov $625, %rax
    jmp wasm_tramp_common
wasm_tramp_626:
    mov $626, %rax
    jmp wasm_tramp_common
wasm_tramp_627:
    mov $627, %rax
    jmp wasm_tramp_common
wasm_tramp_628:
    mov $628, %rax
    jmp wasm_tramp_common
wasm_tramp_629:
    mov $629, %rax
    jmp wasm_tramp_common
wasm_tramp_630:
    mov $630, %rax
    jmp wasm_tramp_common
wasm_tramp_631:
    mov $631, %rax
    jmp wasm_tramp_common
wasm_tramp_632:
    mov $632, %rax
    jmp wasm_tramp_common
wasm_tramp_633:
    mov $633, %rax
    jmp wasm_tramp_common
wasm_tramp_634:
    mov $634, %rax
    jmp wasm_tramp_common
wasm_tramp_635:
    mov $635, %rax
    jmp wasm_tramp_common
wasm_tramp_636:
    mov $636, %rax
    jmp wasm_tramp_common
wasm_tramp_637:
    mov $637, %rax
    jmp wasm_tramp_common
wasm_tramp_638:
    mov $638, %rax
    jmp wasm_tramp_common
wasm_tramp_639:
    mov $639, %rax
    jmp wasm_tramp_common
wasm_tramp_640:
    mov $640, %rax
    jmp wasm_tramp_common
wasm_tramp_641:
    mov $641, %rax
    jmp wasm_tramp_common
wasm_tramp_642:
    mov $642, %rax
    jmp wasm_tramp_common
wasm_tramp_643:
    mov $643, %rax
    jmp wasm_tramp_common
wasm_tramp_644:
    mov $644, %rax
    jmp wasm_tramp_common
wasm_tramp_645:
    mov $645, %rax
    jmp wasm_tramp_common
wasm_tramp_646:
    mov $646, %rax
    jmp wasm_tramp_common
wasm_tramp_647:
    mov $647, %rax
    jmp wasm_tramp_common
wasm_tramp_648:
    mov $648, %rax
    jmp wasm_tramp_common
wasm_tramp_649:
    mov $649, %rax
    jmp wasm_tramp_common
wasm_tramp_650:
    mov $650, %rax
    jmp wasm_tramp_common
wasm_tramp_651:
    mov $651, %rax
    jmp wasm_tramp_common
wasm_tramp_652:
    mov $652, %rax
    jmp wasm_tramp_common
wasm_tramp_653:
    mov $653, %rax
    jmp wasm_tramp_common
wasm_tramp_654:
    mov $654, %rax
    jmp wasm_tramp_common
wasm_tramp_655:
    mov $655, %rax
    jmp wasm_tramp_common
wasm_tramp_656:
    mov $656, %rax
    jmp wasm_tramp_common
wasm_tramp_657:
    mov $657, %rax
    jmp wasm_tramp_common
wasm_tramp_658:
    mov $658, %rax
    jmp wasm_tramp_common
wasm_tramp_659:
    mov $659, %rax
    jmp wasm_tramp_common
wasm_tramp_660:
    mov $660, %rax
    jmp wasm_tramp_common
wasm_tramp_661:
    mov $661, %rax
    jmp wasm_tramp_common
wasm_tramp_662:
    mov $662, %rax
    jmp wasm_tramp_common
wasm_tramp_663:
    mov $663, %rax
    jmp wasm_tramp_common
wasm_tramp_664:
    mov $664, %rax
    jmp wasm_tramp_common
wasm_tramp_665:
    mov $665, %rax
    jmp wasm_tramp_common
wasm_tramp_666:
    mov $666, %rax
    jmp wasm_tramp_common
wasm_tramp_667:
    mov $667, %rax
    jmp wasm_tramp_common
wasm_tramp_668:
    mov $668, %rax
    jmp wasm_tramp_common
wasm_tramp_669:
    mov $669, %rax
    jmp wasm_tramp_common
wasm_tramp_670:
    mov $670, %rax
    jmp wasm_tramp_common
wasm_tramp_671:
    mov $671, %rax
    jmp wasm_tramp_common
wasm_tramp_672:
    mov $672, %rax
    jmp wasm_tramp_common
wasm_tramp_673:
    mov $673, %rax
    jmp wasm_tramp_common
wasm_tramp_674:
    mov $674, %rax
    jmp wasm_tramp_common
wasm_tramp_675:
    mov $675, %rax
    jmp wasm_tramp_common
wasm_tramp_676:
    mov $676, %rax
    jmp wasm_tramp_common
wasm_tramp_677:
    mov $677, %rax
    jmp wasm_tramp_common
wasm_tramp_678:
    mov $678, %rax
    jmp wasm_tramp_common
wasm_tramp_679:
    mov $679, %rax
    jmp wasm_tramp_common
wasm_tramp_680:
    mov $680, %rax
    jmp wasm_tramp_common
wasm_tramp_681:
    mov $681, %rax
    jmp wasm_tramp_common
wasm_tramp_682:
    mov $682, %rax
    jmp wasm_tramp_common
wasm_tramp_683:
    mov $683, %rax
    jmp wasm_tramp_common
wasm_tramp_684:
    mov $684, %rax
    jmp wasm_tramp_common
wasm_tramp_685:
    mov $685, %rax
    jmp wasm_tramp_common
wasm_tramp_686:
    mov $686, %rax
    jmp wasm_tramp_common
wasm_tramp_687:
    mov $687, %rax
    jmp wasm_tramp_common
wasm_tramp_688:
    mov $688, %rax
    jmp wasm_tramp_common
wasm_tramp_689:
    mov $689, %rax
    jmp wasm_tramp_common
wasm_tramp_690:
    mov $690, %rax
    jmp wasm_tramp_common
wasm_tramp_691:
    mov $691, %rax
    jmp wasm_tramp_common
wasm_tramp_692:
    mov $692, %rax
    jmp wasm_tramp_common
wasm_tramp_693:
    mov $693, %rax
    jmp wasm_tramp_common
wasm_tramp_694:
    mov $694, %rax
    jmp wasm_tramp_common
wasm_tramp_695:
    mov $695, %rax
    jmp wasm_tramp_common
wasm_tramp_696:
    mov $696, %rax
    jmp wasm_tramp_common
wasm_tramp_697:
    mov $697, %rax
    jmp wasm_tramp_common
wasm_tramp_698:
    mov $698, %rax
    jmp wasm_tramp_common
wasm_tramp_699:
    mov $699, %rax
    jmp wasm_tramp_common
wasm_tramp_700:
    mov $700, %rax
    jmp wasm_tramp_common
wasm_tramp_701:
    mov $701, %rax
    jmp wasm_tramp_common
wasm_tramp_702:
    mov $702, %rax
    jmp wasm_tramp_common
wasm_tramp_703:
    mov $703, %rax
    jmp wasm_tramp_common
wasm_tramp_704:
    mov $704, %rax
    jmp wasm_tramp_common
wasm_tramp_705:
    mov $705, %rax
    jmp wasm_tramp_common
wasm_tramp_706:
    mov $706, %rax
    jmp wasm_tramp_common
wasm_tramp_707:
    mov $707, %rax
    jmp wasm_tramp_common
wasm_tramp_708:
    mov $708, %rax
    jmp wasm_tramp_common
wasm_tramp_709:
    mov $709, %rax
    jmp wasm_tramp_common
wasm_tramp_710:
    mov $710, %rax
    jmp wasm_tramp_common
wasm_tramp_711:
    mov $711, %rax
    jmp wasm_tramp_common
wasm_tramp_712:
    mov $712, %rax
    jmp wasm_tramp_common
wasm_tramp_713:
    mov $713, %rax
    jmp wasm_tramp_common
wasm_tramp_714:
    mov $714, %rax
    jmp wasm_tramp_common
wasm_tramp_715:
    mov $715, %rax
    jmp wasm_tramp_common
wasm_tramp_716:
    mov $716, %rax
    jmp wasm_tramp_common
wasm_tramp_717:
    mov $717, %rax
    jmp wasm_tramp_common
wasm_tramp_718:
    mov $718, %rax
    jmp wasm_tramp_common
wasm_tramp_719:
    mov $719, %rax
    jmp wasm_tramp_common
wasm_tramp_720:
    mov $720, %rax
    jmp wasm_tramp_common
wasm_tramp_721:
    mov $721, %rax
    jmp wasm_tramp_common
wasm_tramp_722:
    mov $722, %rax
    jmp wasm_tramp_common
wasm_tramp_723:
    mov $723, %rax
    jmp wasm_tramp_common
wasm_tramp_724:
    mov $724, %rax
    jmp wasm_tramp_common
wasm_tramp_725:
    mov $725, %rax
    jmp wasm_tramp_common
wasm_tramp_726:
    mov $726, %rax
    jmp wasm_tramp_common
wasm_tramp_727:
    mov $727, %rax
    jmp wasm_tramp_common
wasm_tramp_728:
    mov $728, %rax
    jmp wasm_tramp_common
wasm_tramp_729:
    mov $729, %rax
    jmp wasm_tramp_common
wasm_tramp_730:
    mov $730, %rax
    jmp wasm_tramp_common
wasm_tramp_731:
    mov $731, %rax
    jmp wasm_tramp_common
wasm_tramp_732:
    mov $732, %rax
    jmp wasm_tramp_common
wasm_tramp_733:
    mov $733, %rax
    jmp wasm_tramp_common
wasm_tramp_734:
    mov $734, %rax
    jmp wasm_tramp_common
wasm_tramp_735:
    mov $735, %rax
    jmp wasm_tramp_common
wasm_tramp_736:
    mov $736, %rax
    jmp wasm_tramp_common
wasm_tramp_737:
    mov $737, %rax
    jmp wasm_tramp_common
wasm_tramp_738:
    mov $738, %rax
    jmp wasm_tramp_common
wasm_tramp_739:
    mov $739, %rax
    jmp wasm_tramp_common
wasm_tramp_740:
    mov $740, %rax
    jmp wasm_tramp_common
wasm_tramp_741:
    mov $741, %rax
    jmp wasm_tramp_common
wasm_tramp_742:
    mov $742, %rax
    jmp wasm_tramp_common
wasm_tramp_743:
    mov $743, %rax
    jmp wasm_tramp_common
wasm_tramp_744:
    mov $744, %rax
    jmp wasm_tramp_common
wasm_tramp_745:
    mov $745, %rax
    jmp wasm_tramp_common
wasm_tramp_746:
    mov $746, %rax
    jmp wasm_tramp_common
wasm_tramp_747:
    mov $747, %rax
    jmp wasm_tramp_common
wasm_tramp_748:
    mov $748, %rax
    jmp wasm_tramp_common
wasm_tramp_749:
    mov $749, %rax
    jmp wasm_tramp_common
wasm_tramp_750:
    mov $750, %rax
    jmp wasm_tramp_common
wasm_tramp_751:
    mov $751, %rax
    jmp wasm_tramp_common
wasm_tramp_752:
    mov $752, %rax
    jmp wasm_tramp_common
wasm_tramp_753:
    mov $753, %rax
    jmp wasm_tramp_common
wasm_tramp_754:
    mov $754, %rax
    jmp wasm_tramp_common
wasm_tramp_755:
    mov $755, %rax
    jmp wasm_tramp_common
wasm_tramp_756:
    mov $756, %rax
    jmp wasm_tramp_common
wasm_tramp_757:
    mov $757, %rax
    jmp wasm_tramp_common
wasm_tramp_758:
    mov $758, %rax
    jmp wasm_tramp_common
wasm_tramp_759:
    mov $759, %rax
    jmp wasm_tramp_common
wasm_tramp_760:
    mov $760, %rax
    jmp wasm_tramp_common
wasm_tramp_761:
    mov $761, %rax
    jmp wasm_tramp_common
wasm_tramp_762:
    mov $762, %rax
    jmp wasm_tramp_common
wasm_tramp_763:
    mov $763, %rax
    jmp wasm_tramp_common
wasm_tramp_764:
    mov $764, %rax
    jmp wasm_tramp_common
wasm_tramp_765:
    mov $765, %rax
    jmp wasm_tramp_common
wasm_tramp_766:
    mov $766, %rax
    jmp wasm_tramp_common
wasm_tramp_767:
    mov $767, %rax
    jmp wasm_tramp_common
wasm_tramp_768:
    mov $768, %rax
    jmp wasm_tramp_common
wasm_tramp_769:
    mov $769, %rax
    jmp wasm_tramp_common
wasm_tramp_770:
    mov $770, %rax
    jmp wasm_tramp_common
wasm_tramp_771:
    mov $771, %rax
    jmp wasm_tramp_common
wasm_tramp_772:
    mov $772, %rax
    jmp wasm_tramp_common
wasm_tramp_773:
    mov $773, %rax
    jmp wasm_tramp_common
wasm_tramp_774:
    mov $774, %rax
    jmp wasm_tramp_common
wasm_tramp_775:
    mov $775, %rax
    jmp wasm_tramp_common
wasm_tramp_776:
    mov $776, %rax
    jmp wasm_tramp_common
wasm_tramp_777:
    mov $777, %rax
    jmp wasm_tramp_common
wasm_tramp_778:
    mov $778, %rax
    jmp wasm_tramp_common
wasm_tramp_779:
    mov $779, %rax
    jmp wasm_tramp_common
wasm_tramp_780:
    mov $780, %rax
    jmp wasm_tramp_common
wasm_tramp_781:
    mov $781, %rax
    jmp wasm_tramp_common
wasm_tramp_782:
    mov $782, %rax
    jmp wasm_tramp_common
wasm_tramp_783:
    mov $783, %rax
    jmp wasm_tramp_common
wasm_tramp_784:
    mov $784, %rax
    jmp wasm_tramp_common
wasm_tramp_785:
    mov $785, %rax
    jmp wasm_tramp_common
wasm_tramp_786:
    mov $786, %rax
    jmp wasm_tramp_common
wasm_tramp_787:
    mov $787, %rax
    jmp wasm_tramp_common
wasm_tramp_788:
    mov $788, %rax
    jmp wasm_tramp_common
wasm_tramp_789:
    mov $789, %rax
    jmp wasm_tramp_common
wasm_tramp_790:
    mov $790, %rax
    jmp wasm_tramp_common
wasm_tramp_791:
    mov $791, %rax
    jmp wasm_tramp_common
wasm_tramp_792:
    mov $792, %rax
    jmp wasm_tramp_common
wasm_tramp_793:
    mov $793, %rax
    jmp wasm_tramp_common
wasm_tramp_794:
    mov $794, %rax
    jmp wasm_tramp_common
wasm_tramp_795:
    mov $795, %rax
    jmp wasm_tramp_common
wasm_tramp_796:
    mov $796, %rax
    jmp wasm_tramp_common
wasm_tramp_797:
    mov $797, %rax
    jmp wasm_tramp_common
wasm_tramp_798:
    mov $798, %rax
    jmp wasm_tramp_common
wasm_tramp_799:
    mov $799, %rax
    jmp wasm_tramp_common
wasm_tramp_800:
    mov $800, %rax
    jmp wasm_tramp_common
wasm_tramp_801:
    mov $801, %rax
    jmp wasm_tramp_common
wasm_tramp_802:
    mov $802, %rax
    jmp wasm_tramp_common
wasm_tramp_803:
    mov $803, %rax
    jmp wasm_tramp_common
wasm_tramp_804:
    mov $804, %rax
    jmp wasm_tramp_common
wasm_tramp_805:
    mov $805, %rax
    jmp wasm_tramp_common
wasm_tramp_806:
    mov $806, %rax
    jmp wasm_tramp_common
wasm_tramp_807:
    mov $807, %rax
    jmp wasm_tramp_common
wasm_tramp_808:
    mov $808, %rax
    jmp wasm_tramp_common
wasm_tramp_809:
    mov $809, %rax
    jmp wasm_tramp_common
wasm_tramp_810:
    mov $810, %rax
    jmp wasm_tramp_common
wasm_tramp_811:
    mov $811, %rax
    jmp wasm_tramp_common
wasm_tramp_812:
    mov $812, %rax
    jmp wasm_tramp_common
wasm_tramp_813:
    mov $813, %rax
    jmp wasm_tramp_common
wasm_tramp_814:
    mov $814, %rax
    jmp wasm_tramp_common
wasm_tramp_815:
    mov $815, %rax
    jmp wasm_tramp_common
wasm_tramp_816:
    mov $816, %rax
    jmp wasm_tramp_common
wasm_tramp_817:
    mov $817, %rax
    jmp wasm_tramp_common
wasm_tramp_818:
    mov $818, %rax
    jmp wasm_tramp_common
wasm_tramp_819:
    mov $819, %rax
    jmp wasm_tramp_common
wasm_tramp_820:
    mov $820, %rax
    jmp wasm_tramp_common
wasm_tramp_821:
    mov $821, %rax
    jmp wasm_tramp_common
wasm_tramp_822:
    mov $822, %rax
    jmp wasm_tramp_common
wasm_tramp_823:
    mov $823, %rax
    jmp wasm_tramp_common
wasm_tramp_824:
    mov $824, %rax
    jmp wasm_tramp_common
wasm_tramp_825:
    mov $825, %rax
    jmp wasm_tramp_common
wasm_tramp_826:
    mov $826, %rax
    jmp wasm_tramp_common
wasm_tramp_827:
    mov $827, %rax
    jmp wasm_tramp_common
wasm_tramp_828:
    mov $828, %rax
    jmp wasm_tramp_common
wasm_tramp_829:
    mov $829, %rax
    jmp wasm_tramp_common
wasm_tramp_830:
    mov $830, %rax
    jmp wasm_tramp_common
wasm_tramp_831:
    mov $831, %rax
    jmp wasm_tramp_common
wasm_tramp_832:
    mov $832, %rax
    jmp wasm_tramp_common
wasm_tramp_833:
    mov $833, %rax
    jmp wasm_tramp_common
wasm_tramp_834:
    mov $834, %rax
    jmp wasm_tramp_common
wasm_tramp_835:
    mov $835, %rax
    jmp wasm_tramp_common
wasm_tramp_836:
    mov $836, %rax
    jmp wasm_tramp_common
wasm_tramp_837:
    mov $837, %rax
    jmp wasm_tramp_common
wasm_tramp_838:
    mov $838, %rax
    jmp wasm_tramp_common
wasm_tramp_839:
    mov $839, %rax
    jmp wasm_tramp_common
wasm_tramp_840:
    mov $840, %rax
    jmp wasm_tramp_common
wasm_tramp_841:
    mov $841, %rax
    jmp wasm_tramp_common
wasm_tramp_842:
    mov $842, %rax
    jmp wasm_tramp_common
wasm_tramp_843:
    mov $843, %rax
    jmp wasm_tramp_common
wasm_tramp_844:
    mov $844, %rax
    jmp wasm_tramp_common
wasm_tramp_845:
    mov $845, %rax
    jmp wasm_tramp_common
wasm_tramp_846:
    mov $846, %rax
    jmp wasm_tramp_common
wasm_tramp_847:
    mov $847, %rax
    jmp wasm_tramp_common
wasm_tramp_848:
    mov $848, %rax
    jmp wasm_tramp_common
wasm_tramp_849:
    mov $849, %rax
    jmp wasm_tramp_common
wasm_tramp_850:
    mov $850, %rax
    jmp wasm_tramp_common
wasm_tramp_851:
    mov $851, %rax
    jmp wasm_tramp_common
wasm_tramp_852:
    mov $852, %rax
    jmp wasm_tramp_common
wasm_tramp_853:
    mov $853, %rax
    jmp wasm_tramp_common
wasm_tramp_854:
    mov $854, %rax
    jmp wasm_tramp_common
wasm_tramp_855:
    mov $855, %rax
    jmp wasm_tramp_common
wasm_tramp_856:
    mov $856, %rax
    jmp wasm_tramp_common
wasm_tramp_857:
    mov $857, %rax
    jmp wasm_tramp_common
wasm_tramp_858:
    mov $858, %rax
    jmp wasm_tramp_common
wasm_tramp_859:
    mov $859, %rax
    jmp wasm_tramp_common
wasm_tramp_860:
    mov $860, %rax
    jmp wasm_tramp_common
wasm_tramp_861:
    mov $861, %rax
    jmp wasm_tramp_common
wasm_tramp_862:
    mov $862, %rax
    jmp wasm_tramp_common
wasm_tramp_863:
    mov $863, %rax
    jmp wasm_tramp_common
wasm_tramp_864:
    mov $864, %rax
    jmp wasm_tramp_common
wasm_tramp_865:
    mov $865, %rax
    jmp wasm_tramp_common
wasm_tramp_866:
    mov $866, %rax
    jmp wasm_tramp_common
wasm_tramp_867:
    mov $867, %rax
    jmp wasm_tramp_common
wasm_tramp_868:
    mov $868, %rax
    jmp wasm_tramp_common
wasm_tramp_869:
    mov $869, %rax
    jmp wasm_tramp_common
wasm_tramp_870:
    mov $870, %rax
    jmp wasm_tramp_common
wasm_tramp_871:
    mov $871, %rax
    jmp wasm_tramp_common
wasm_tramp_872:
    mov $872, %rax
    jmp wasm_tramp_common
wasm_tramp_873:
    mov $873, %rax
    jmp wasm_tramp_common
wasm_tramp_874:
    mov $874, %rax
    jmp wasm_tramp_common
wasm_tramp_875:
    mov $875, %rax
    jmp wasm_tramp_common
wasm_tramp_876:
    mov $876, %rax
    jmp wasm_tramp_common
wasm_tramp_877:
    mov $877, %rax
    jmp wasm_tramp_common
wasm_tramp_878:
    mov $878, %rax
    jmp wasm_tramp_common
wasm_tramp_879:
    mov $879, %rax
    jmp wasm_tramp_common
wasm_tramp_880:
    mov $880, %rax
    jmp wasm_tramp_common
wasm_tramp_881:
    mov $881, %rax
    jmp wasm_tramp_common
wasm_tramp_882:
    mov $882, %rax
    jmp wasm_tramp_common
wasm_tramp_883:
    mov $883, %rax
    jmp wasm_tramp_common
wasm_tramp_884:
    mov $884, %rax
    jmp wasm_tramp_common
wasm_tramp_885:
    mov $885, %rax
    jmp wasm_tramp_common
wasm_tramp_886:
    mov $886, %rax
    jmp wasm_tramp_common
wasm_tramp_887:
    mov $887, %rax
    jmp wasm_tramp_common
wasm_tramp_888:
    mov $888, %rax
    jmp wasm_tramp_common
wasm_tramp_889:
    mov $889, %rax
    jmp wasm_tramp_common
wasm_tramp_890:
    mov $890, %rax
    jmp wasm_tramp_common
wasm_tramp_891:
    mov $891, %rax
    jmp wasm_tramp_common
wasm_tramp_892:
    mov $892, %rax
    jmp wasm_tramp_common
wasm_tramp_893:
    mov $893, %rax
    jmp wasm_tramp_common
wasm_tramp_894:
    mov $894, %rax
    jmp wasm_tramp_common
wasm_tramp_895:
    mov $895, %rax
    jmp wasm_tramp_common
wasm_tramp_896:
    mov $896, %rax
    jmp wasm_tramp_common
wasm_tramp_897:
    mov $897, %rax
    jmp wasm_tramp_common
wasm_tramp_898:
    mov $898, %rax
    jmp wasm_tramp_common
wasm_tramp_899:
    mov $899, %rax
    jmp wasm_tramp_common
wasm_tramp_900:
    mov $900, %rax
    jmp wasm_tramp_common
wasm_tramp_901:
    mov $901, %rax
    jmp wasm_tramp_common
wasm_tramp_902:
    mov $902, %rax
    jmp wasm_tramp_common
wasm_tramp_903:
    mov $903, %rax
    jmp wasm_tramp_common
wasm_tramp_904:
    mov $904, %rax
    jmp wasm_tramp_common
wasm_tramp_905:
    mov $905, %rax
    jmp wasm_tramp_common
wasm_tramp_906:
    mov $906, %rax
    jmp wasm_tramp_common
wasm_tramp_907:
    mov $907, %rax
    jmp wasm_tramp_common
wasm_tramp_908:
    mov $908, %rax
    jmp wasm_tramp_common
wasm_tramp_909:
    mov $909, %rax
    jmp wasm_tramp_common
wasm_tramp_910:
    mov $910, %rax
    jmp wasm_tramp_common
wasm_tramp_911:
    mov $911, %rax
    jmp wasm_tramp_common
wasm_tramp_912:
    mov $912, %rax
    jmp wasm_tramp_common
wasm_tramp_913:
    mov $913, %rax
    jmp wasm_tramp_common
wasm_tramp_914:
    mov $914, %rax
    jmp wasm_tramp_common
wasm_tramp_915:
    mov $915, %rax
    jmp wasm_tramp_common
wasm_tramp_916:
    mov $916, %rax
    jmp wasm_tramp_common
wasm_tramp_917:
    mov $917, %rax
    jmp wasm_tramp_common
wasm_tramp_918:
    mov $918, %rax
    jmp wasm_tramp_common
wasm_tramp_919:
    mov $919, %rax
    jmp wasm_tramp_common
wasm_tramp_920:
    mov $920, %rax
    jmp wasm_tramp_common
wasm_tramp_921:
    mov $921, %rax
    jmp wasm_tramp_common
wasm_tramp_922:
    mov $922, %rax
    jmp wasm_tramp_common
wasm_tramp_923:
    mov $923, %rax
    jmp wasm_tramp_common
wasm_tramp_924:
    mov $924, %rax
    jmp wasm_tramp_common
wasm_tramp_925:
    mov $925, %rax
    jmp wasm_tramp_common
wasm_tramp_926:
    mov $926, %rax
    jmp wasm_tramp_common
wasm_tramp_927:
    mov $927, %rax
    jmp wasm_tramp_common
wasm_tramp_928:
    mov $928, %rax
    jmp wasm_tramp_common
wasm_tramp_929:
    mov $929, %rax
    jmp wasm_tramp_common
wasm_tramp_930:
    mov $930, %rax
    jmp wasm_tramp_common
wasm_tramp_931:
    mov $931, %rax
    jmp wasm_tramp_common
wasm_tramp_932:
    mov $932, %rax
    jmp wasm_tramp_common
wasm_tramp_933:
    mov $933, %rax
    jmp wasm_tramp_common
wasm_tramp_934:
    mov $934, %rax
    jmp wasm_tramp_common
wasm_tramp_935:
    mov $935, %rax
    jmp wasm_tramp_common
wasm_tramp_936:
    mov $936, %rax
    jmp wasm_tramp_common
wasm_tramp_937:
    mov $937, %rax
    jmp wasm_tramp_common
wasm_tramp_938:
    mov $938, %rax
    jmp wasm_tramp_common
wasm_tramp_939:
    mov $939, %rax
    jmp wasm_tramp_common
wasm_tramp_940:
    mov $940, %rax
    jmp wasm_tramp_common
wasm_tramp_941:
    mov $941, %rax
    jmp wasm_tramp_common
wasm_tramp_942:
    mov $942, %rax
    jmp wasm_tramp_common
wasm_tramp_943:
    mov $943, %rax
    jmp wasm_tramp_common
wasm_tramp_944:
    mov $944, %rax
    jmp wasm_tramp_common
wasm_tramp_945:
    mov $945, %rax
    jmp wasm_tramp_common
wasm_tramp_946:
    mov $946, %rax
    jmp wasm_tramp_common
wasm_tramp_947:
    mov $947, %rax
    jmp wasm_tramp_common
wasm_tramp_948:
    mov $948, %rax
    jmp wasm_tramp_common
wasm_tramp_949:
    mov $949, %rax
    jmp wasm_tramp_common
wasm_tramp_950:
    mov $950, %rax
    jmp wasm_tramp_common
wasm_tramp_951:
    mov $951, %rax
    jmp wasm_tramp_common
wasm_tramp_952:
    mov $952, %rax
    jmp wasm_tramp_common
wasm_tramp_953:
    mov $953, %rax
    jmp wasm_tramp_common
wasm_tramp_954:
    mov $954, %rax
    jmp wasm_tramp_common
wasm_tramp_955:
    mov $955, %rax
    jmp wasm_tramp_common
wasm_tramp_956:
    mov $956, %rax
    jmp wasm_tramp_common
wasm_tramp_957:
    mov $957, %rax
    jmp wasm_tramp_common
wasm_tramp_958:
    mov $958, %rax
    jmp wasm_tramp_common
wasm_tramp_959:
    mov $959, %rax
    jmp wasm_tramp_common
wasm_tramp_960:
    mov $960, %rax
    jmp wasm_tramp_common
wasm_tramp_961:
    mov $961, %rax
    jmp wasm_tramp_common
wasm_tramp_962:
    mov $962, %rax
    jmp wasm_tramp_common
wasm_tramp_963:
    mov $963, %rax
    jmp wasm_tramp_common
wasm_tramp_964:
    mov $964, %rax
    jmp wasm_tramp_common
wasm_tramp_965:
    mov $965, %rax
    jmp wasm_tramp_common
wasm_tramp_966:
    mov $966, %rax
    jmp wasm_tramp_common
wasm_tramp_967:
    mov $967, %rax
    jmp wasm_tramp_common
wasm_tramp_968:
    mov $968, %rax
    jmp wasm_tramp_common
wasm_tramp_969:
    mov $969, %rax
    jmp wasm_tramp_common
wasm_tramp_970:
    mov $970, %rax
    jmp wasm_tramp_common
wasm_tramp_971:
    mov $971, %rax
    jmp wasm_tramp_common
wasm_tramp_972:
    mov $972, %rax
    jmp wasm_tramp_common
wasm_tramp_973:
    mov $973, %rax
    jmp wasm_tramp_common
wasm_tramp_974:
    mov $974, %rax
    jmp wasm_tramp_common
wasm_tramp_975:
    mov $975, %rax
    jmp wasm_tramp_common
wasm_tramp_976:
    mov $976, %rax
    jmp wasm_tramp_common
wasm_tramp_977:
    mov $977, %rax
    jmp wasm_tramp_common
wasm_tramp_978:
    mov $978, %rax
    jmp wasm_tramp_common
wasm_tramp_979:
    mov $979, %rax
    jmp wasm_tramp_common
wasm_tramp_980:
    mov $980, %rax
    jmp wasm_tramp_common
wasm_tramp_981:
    mov $981, %rax
    jmp wasm_tramp_common
wasm_tramp_982:
    mov $982, %rax
    jmp wasm_tramp_common
wasm_tramp_983:
    mov $983, %rax
    jmp wasm_tramp_common
wasm_tramp_984:
    mov $984, %rax
    jmp wasm_tramp_common
wasm_tramp_985:
    mov $985, %rax
    jmp wasm_tramp_common
wasm_tramp_986:
    mov $986, %rax
    jmp wasm_tramp_common
wasm_tramp_987:
    mov $987, %rax
    jmp wasm_tramp_common
wasm_tramp_988:
    mov $988, %rax
    jmp wasm_tramp_common
wasm_tramp_989:
    mov $989, %rax
    jmp wasm_tramp_common
wasm_tramp_990:
    mov $990, %rax
    jmp wasm_tramp_common
wasm_tramp_991:
    mov $991, %rax
    jmp wasm_tramp_common
wasm_tramp_992:
    mov $992, %rax
    jmp wasm_tramp_common
wasm_tramp_993:
    mov $993, %rax
    jmp wasm_tramp_common
wasm_tramp_994:
    mov $994, %rax
    jmp wasm_tramp_common
wasm_tramp_995:
    mov $995, %rax
    jmp wasm_tramp_common
wasm_tramp_996:
    mov $996, %rax
    jmp wasm_tramp_common
wasm_tramp_997:
    mov $997, %rax
    jmp wasm_tramp_common
wasm_tramp_998:
    mov $998, %rax
    jmp wasm_tramp_common
wasm_tramp_999:
    mov $999, %rax
    jmp wasm_tramp_common
wasm_tramp_1000:
    mov $1000, %rax
    jmp wasm_tramp_common
wasm_tramp_1001:
    mov $1001, %rax
    jmp wasm_tramp_common
wasm_tramp_1002:
    mov $1002, %rax
    jmp wasm_tramp_common
wasm_tramp_1003:
    mov $1003, %rax
    jmp wasm_tramp_common
wasm_tramp_1004:
    mov $1004, %rax
    jmp wasm_tramp_common
wasm_tramp_1005:
    mov $1005, %rax
    jmp wasm_tramp_common
wasm_tramp_1006:
    mov $1006, %rax
    jmp wasm_tramp_common
wasm_tramp_1007:
    mov $1007, %rax
    jmp wasm_tramp_common
wasm_tramp_1008:
    mov $1008, %rax
    jmp wasm_tramp_common
wasm_tramp_1009:
    mov $1009, %rax
    jmp wasm_tramp_common
wasm_tramp_1010:
    mov $1010, %rax
    jmp wasm_tramp_common
wasm_tramp_1011:
    mov $1011, %rax
    jmp wasm_tramp_common
wasm_tramp_1012:
    mov $1012, %rax
    jmp wasm_tramp_common
wasm_tramp_1013:
    mov $1013, %rax
    jmp wasm_tramp_common
wasm_tramp_1014:
    mov $1014, %rax
    jmp wasm_tramp_common
wasm_tramp_1015:
    mov $1015, %rax
    jmp wasm_tramp_common
wasm_tramp_1016:
    mov $1016, %rax
    jmp wasm_tramp_common
wasm_tramp_1017:
    mov $1017, %rax
    jmp wasm_tramp_common
wasm_tramp_1018:
    mov $1018, %rax
    jmp wasm_tramp_common
wasm_tramp_1019:
    mov $1019, %rax
    jmp wasm_tramp_common
wasm_tramp_1020:
    mov $1020, %rax
    jmp wasm_tramp_common
wasm_tramp_1021:
    mov $1021, %rax
    jmp wasm_tramp_common
wasm_tramp_1022:
    mov $1022, %rax
    jmp wasm_tramp_common
wasm_tramp_1023:
    mov $1023, %rax
    jmp wasm_tramp_common

wasm_tramp_common:
    mov %r8, %r9
    mov %rcx, %r8
    mov %rdx, %rcx
    mov %rsi, %rdx
    mov %rdi, %rsi
    mov %rax, %rdi
    mov wasm_callback_fn(%rip), %r11
    jmp *%r11

.section .data
.align 8
wasm_callback_fn:
    .quad 0
wasm_slot_depth:
    .quad 0
wasm_abandoned_flag:
    .quad 0
wasm_slots:
    .skip 4096
