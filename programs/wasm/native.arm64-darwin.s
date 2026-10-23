// Native helpers for the WebAssembly interpreter (programs/wasm): arm64,
// Apple's systems (iOS and its simulator), as native.s is for x86-64
// Linux. AAPCS64: integer arguments in x0-x7, floats in d0-d7, the rest
// on the stack; a result in x0 or d0.
    .section __TEXT,__text,regular,pure_instructions
    .p2align 2

// wasm_mem_map(size): []i8 -- size bytes of zeroed memory that never move
// (an anonymous mapping, committed as touched), as an L8 byte slice: its
// length is the 8 bytes before it. 0 when it cannot be had.
    .globl _wasm_mem_map
_wasm_mem_map:
    stp x29, x30, [sp, #-32]!
    mov x29, sp
    str x19, [sp, #16]
    mov x19, x0
    mov x0, #0
    add x1, x19, #16
    mov x2, #3
    mov x3, #0x1002
    mov x4, #-1
    mov x5, #0
    bl _mmap
    cmn x0, #1
    b.eq Lmap_failed
    str x19, [x0, #8]
    add x0, x0, #16
    ldr x19, [sp, #16]
    ldp x29, x30, [sp], #32
    ret
Lmap_failed:
    mov x0, #0
    ldr x19, [sp, #16]
    ldp x29, x30, [sp], #32
    ret

// wasm_mem_words(m: []i8): []int -- a view of the same memory as words,
// 8 bytes in (its length word is the slice's first 8 bytes).
    .globl _wasm_mem_words
_wasm_mem_words:
    ldur x8, [x0, #-8]
    sub x8, x8, #8
    lsr x8, x8, #3
    str x8, [x0]
    add x0, x0, #8
    ret

// Float bits: the bit pattern of a float, and back.
    .globl _l8_f64_bits
_l8_f64_bits:
    fmov x0, d0
    ret

    .globl _l8_bits_f64
_l8_bits_f64:
    fmov d0, x0
    ret

    .globl _l8_f32_bits
_l8_f32_bits:
    fmov w0, s0
    ret

    .globl _l8_bits_f32
_l8_bits_f32:
    fmov s0, w0
    ret

// wasm_native_call(fp, ints: []int, nints, floats: []f64, nfloats, ret_float): int
// Call a C function: ints[0..7] in x0-x7 (the slice holds at least 8), the
// rest on the stack; floats[0..7] in d0-d7; the result from x0, or from d0
// as bits when ret_float.
// Before the call, the callee-saved registers and the stack go into a
// slot (one per nested call), so that wasm_native_abandon, called from
// deeper native code (an uncaught exception's handler), can come back here
// as if the call had returned 0, with wasm_abandoned set.
    .globl _wasm_native_call
_wasm_native_call:
    stp x29, x30, [sp, #-48]!
    mov x29, sp
    stp x19, x20, [sp, #16]
    stp x21, x22, [sp, #32]
    mov x19, x0
    mov x20, x1
    mov x21, x2
    mov x22, x5
    adrp x8, wasm_slot_depth@PAGE
    ldr x9, [x8, wasm_slot_depth@PAGEOFF]
    add x10, x9, #1
    str x10, [x8, wasm_slot_depth@PAGEOFF]
    lsl x9, x9, #8
    adrp x10, wasm_slots@PAGE
    add x10, x10, wasm_slots@PAGEOFF
    add x10, x10, x9
    stp x19, x20, [x10]
    stp x21, x22, [x10, #16]
    stp x23, x24, [x10, #32]
    stp x25, x26, [x10, #48]
    stp x27, x28, [x10, #64]
    mov x11, sp
    stp x29, x11, [x10, #80]
    stp d8, d9, [x10, #96]
    stp d10, d11, [x10, #112]
    stp d12, d13, [x10, #128]
    stp d14, d15, [x10, #144]
    ldr d0, [x3]
    ldr d1, [x3, #8]
    ldr d2, [x3, #16]
    ldr d3, [x3, #24]
    ldr d4, [x3, #32]
    ldr d5, [x3, #40]
    ldr d6, [x3, #48]
    ldr d7, [x3, #56]
    cmp x21, #8
    b.le Lcall_regs
    sub x8, x21, #8
    lsl x9, x8, #3
    add x9, x9, #15
    lsr x9, x9, #4
    lsl x9, x9, #4
    sub sp, sp, x9
    mov x10, #0
Lcall_copy:
    cmp x10, x8
    b.ge Lcall_regs
    add x11, x10, #8
    lsl x11, x11, #3
    add x11, x20, x11
    ldr x12, [x11]
    lsl x13, x10, #3
    add x13, sp, x13
    str x12, [x13]
    add x10, x10, #1
    b Lcall_copy
Lcall_regs:
    ldp x0, x1, [x20]
    ldp x2, x3, [x20, #16]
    ldp x4, x5, [x20, #32]
    ldp x6, x7, [x20, #48]
    blr x19
    cbz x22, Lcall_done
    fmov x0, d0
Lcall_done:
    adrp x8, wasm_slot_depth@PAGE
    ldr x9, [x8, wasm_slot_depth@PAGEOFF]
    sub x9, x9, #1
    str x9, [x8, wasm_slot_depth@PAGEOFF]
    mov sp, x29
    ldp x21, x22, [sp, #32]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #48
    ret

// wasm_native_abandon(): back to the innermost wasm_native_call, which
// returns 0 with wasm_abandoned set. Nothing between is unwound.
    .globl _wasm_native_abandon
_wasm_native_abandon:
    adrp x8, wasm_slot_depth@PAGE
    ldr x9, [x8, wasm_slot_depth@PAGEOFF]
    cbz x9, Labandon_none
    sub x9, x9, #1
    str x9, [x8, wasm_slot_depth@PAGEOFF]
    lsl x9, x9, #8
    adrp x10, wasm_slots@PAGE
    add x10, x10, wasm_slots@PAGEOFF
    add x10, x10, x9
    ldp x19, x20, [x10]
    ldp x21, x22, [x10, #16]
    ldp x23, x24, [x10, #32]
    ldp x25, x26, [x10, #48]
    ldp x27, x28, [x10, #64]
    ldp x29, x11, [x10, #80]
    mov sp, x11
    ldp d8, d9, [x10, #96]
    ldp d10, d11, [x10, #112]
    ldp d12, d13, [x10, #128]
    ldp d14, d15, [x10, #144]
    adrp x8, wasm_abandoned_flag@PAGE
    mov x12, #1
    str x12, [x8, wasm_abandoned_flag@PAGEOFF]
    mov x0, #0
    mov sp, x29
    ldp x21, x22, [sp, #32]
    ldp x19, x20, [sp, #16]
    ldp x29, x30, [sp], #48
    ret
Labandon_none:
    ret

// wasm_abandoned(): whether the last native call was abandoned (and clear).
    .globl _wasm_abandoned
_wasm_abandoned:
    adrp x8, wasm_abandoned_flag@PAGE
    ldr x0, [x8, wasm_abandoned_flag@PAGEOFF]
    str xzr, [x8, wasm_abandoned_flag@PAGEOFF]
    ret

// Callbacks: native code calls trampoline k with up to five integer
// arguments; it calls the L8 function given to wasm_native_set_callback
// (its C entry) as callback(k, a0, a1, a2, a3, a4) and returns its result.
    .globl _wasm_native_set_callback
_wasm_native_set_callback:
    adrp x8, wasm_callback_fn@PAGE
    str x0, [x8, wasm_callback_fn@PAGEOFF]
    mov x0, #0
    ret

// wasm_trampoline(k): the address of trampoline k (0..1023), 8 bytes each.
    .globl _wasm_trampoline
_wasm_trampoline:
    adrp x8, Lwasm_tramp_0@PAGE
    add x8, x8, Lwasm_tramp_0@PAGEOFF
    lsl x0, x0, #3
    add x0, x8, x0
    ret

Lwasm_tramp_0:
    mov x16, #0
    b Lwasm_tramp_common
Lwasm_tramp_1:
    mov x16, #1
    b Lwasm_tramp_common
Lwasm_tramp_2:
    mov x16, #2
    b Lwasm_tramp_common
Lwasm_tramp_3:
    mov x16, #3
    b Lwasm_tramp_common
Lwasm_tramp_4:
    mov x16, #4
    b Lwasm_tramp_common
Lwasm_tramp_5:
    mov x16, #5
    b Lwasm_tramp_common
Lwasm_tramp_6:
    mov x16, #6
    b Lwasm_tramp_common
Lwasm_tramp_7:
    mov x16, #7
    b Lwasm_tramp_common
Lwasm_tramp_8:
    mov x16, #8
    b Lwasm_tramp_common
Lwasm_tramp_9:
    mov x16, #9
    b Lwasm_tramp_common
Lwasm_tramp_10:
    mov x16, #10
    b Lwasm_tramp_common
Lwasm_tramp_11:
    mov x16, #11
    b Lwasm_tramp_common
Lwasm_tramp_12:
    mov x16, #12
    b Lwasm_tramp_common
Lwasm_tramp_13:
    mov x16, #13
    b Lwasm_tramp_common
Lwasm_tramp_14:
    mov x16, #14
    b Lwasm_tramp_common
Lwasm_tramp_15:
    mov x16, #15
    b Lwasm_tramp_common
Lwasm_tramp_16:
    mov x16, #16
    b Lwasm_tramp_common
Lwasm_tramp_17:
    mov x16, #17
    b Lwasm_tramp_common
Lwasm_tramp_18:
    mov x16, #18
    b Lwasm_tramp_common
Lwasm_tramp_19:
    mov x16, #19
    b Lwasm_tramp_common
Lwasm_tramp_20:
    mov x16, #20
    b Lwasm_tramp_common
Lwasm_tramp_21:
    mov x16, #21
    b Lwasm_tramp_common
Lwasm_tramp_22:
    mov x16, #22
    b Lwasm_tramp_common
Lwasm_tramp_23:
    mov x16, #23
    b Lwasm_tramp_common
Lwasm_tramp_24:
    mov x16, #24
    b Lwasm_tramp_common
Lwasm_tramp_25:
    mov x16, #25
    b Lwasm_tramp_common
Lwasm_tramp_26:
    mov x16, #26
    b Lwasm_tramp_common
Lwasm_tramp_27:
    mov x16, #27
    b Lwasm_tramp_common
Lwasm_tramp_28:
    mov x16, #28
    b Lwasm_tramp_common
Lwasm_tramp_29:
    mov x16, #29
    b Lwasm_tramp_common
Lwasm_tramp_30:
    mov x16, #30
    b Lwasm_tramp_common
Lwasm_tramp_31:
    mov x16, #31
    b Lwasm_tramp_common
Lwasm_tramp_32:
    mov x16, #32
    b Lwasm_tramp_common
Lwasm_tramp_33:
    mov x16, #33
    b Lwasm_tramp_common
Lwasm_tramp_34:
    mov x16, #34
    b Lwasm_tramp_common
Lwasm_tramp_35:
    mov x16, #35
    b Lwasm_tramp_common
Lwasm_tramp_36:
    mov x16, #36
    b Lwasm_tramp_common
Lwasm_tramp_37:
    mov x16, #37
    b Lwasm_tramp_common
Lwasm_tramp_38:
    mov x16, #38
    b Lwasm_tramp_common
Lwasm_tramp_39:
    mov x16, #39
    b Lwasm_tramp_common
Lwasm_tramp_40:
    mov x16, #40
    b Lwasm_tramp_common
Lwasm_tramp_41:
    mov x16, #41
    b Lwasm_tramp_common
Lwasm_tramp_42:
    mov x16, #42
    b Lwasm_tramp_common
Lwasm_tramp_43:
    mov x16, #43
    b Lwasm_tramp_common
Lwasm_tramp_44:
    mov x16, #44
    b Lwasm_tramp_common
Lwasm_tramp_45:
    mov x16, #45
    b Lwasm_tramp_common
Lwasm_tramp_46:
    mov x16, #46
    b Lwasm_tramp_common
Lwasm_tramp_47:
    mov x16, #47
    b Lwasm_tramp_common
Lwasm_tramp_48:
    mov x16, #48
    b Lwasm_tramp_common
Lwasm_tramp_49:
    mov x16, #49
    b Lwasm_tramp_common
Lwasm_tramp_50:
    mov x16, #50
    b Lwasm_tramp_common
Lwasm_tramp_51:
    mov x16, #51
    b Lwasm_tramp_common
Lwasm_tramp_52:
    mov x16, #52
    b Lwasm_tramp_common
Lwasm_tramp_53:
    mov x16, #53
    b Lwasm_tramp_common
Lwasm_tramp_54:
    mov x16, #54
    b Lwasm_tramp_common
Lwasm_tramp_55:
    mov x16, #55
    b Lwasm_tramp_common
Lwasm_tramp_56:
    mov x16, #56
    b Lwasm_tramp_common
Lwasm_tramp_57:
    mov x16, #57
    b Lwasm_tramp_common
Lwasm_tramp_58:
    mov x16, #58
    b Lwasm_tramp_common
Lwasm_tramp_59:
    mov x16, #59
    b Lwasm_tramp_common
Lwasm_tramp_60:
    mov x16, #60
    b Lwasm_tramp_common
Lwasm_tramp_61:
    mov x16, #61
    b Lwasm_tramp_common
Lwasm_tramp_62:
    mov x16, #62
    b Lwasm_tramp_common
Lwasm_tramp_63:
    mov x16, #63
    b Lwasm_tramp_common
Lwasm_tramp_64:
    mov x16, #64
    b Lwasm_tramp_common
Lwasm_tramp_65:
    mov x16, #65
    b Lwasm_tramp_common
Lwasm_tramp_66:
    mov x16, #66
    b Lwasm_tramp_common
Lwasm_tramp_67:
    mov x16, #67
    b Lwasm_tramp_common
Lwasm_tramp_68:
    mov x16, #68
    b Lwasm_tramp_common
Lwasm_tramp_69:
    mov x16, #69
    b Lwasm_tramp_common
Lwasm_tramp_70:
    mov x16, #70
    b Lwasm_tramp_common
Lwasm_tramp_71:
    mov x16, #71
    b Lwasm_tramp_common
Lwasm_tramp_72:
    mov x16, #72
    b Lwasm_tramp_common
Lwasm_tramp_73:
    mov x16, #73
    b Lwasm_tramp_common
Lwasm_tramp_74:
    mov x16, #74
    b Lwasm_tramp_common
Lwasm_tramp_75:
    mov x16, #75
    b Lwasm_tramp_common
Lwasm_tramp_76:
    mov x16, #76
    b Lwasm_tramp_common
Lwasm_tramp_77:
    mov x16, #77
    b Lwasm_tramp_common
Lwasm_tramp_78:
    mov x16, #78
    b Lwasm_tramp_common
Lwasm_tramp_79:
    mov x16, #79
    b Lwasm_tramp_common
Lwasm_tramp_80:
    mov x16, #80
    b Lwasm_tramp_common
Lwasm_tramp_81:
    mov x16, #81
    b Lwasm_tramp_common
Lwasm_tramp_82:
    mov x16, #82
    b Lwasm_tramp_common
Lwasm_tramp_83:
    mov x16, #83
    b Lwasm_tramp_common
Lwasm_tramp_84:
    mov x16, #84
    b Lwasm_tramp_common
Lwasm_tramp_85:
    mov x16, #85
    b Lwasm_tramp_common
Lwasm_tramp_86:
    mov x16, #86
    b Lwasm_tramp_common
Lwasm_tramp_87:
    mov x16, #87
    b Lwasm_tramp_common
Lwasm_tramp_88:
    mov x16, #88
    b Lwasm_tramp_common
Lwasm_tramp_89:
    mov x16, #89
    b Lwasm_tramp_common
Lwasm_tramp_90:
    mov x16, #90
    b Lwasm_tramp_common
Lwasm_tramp_91:
    mov x16, #91
    b Lwasm_tramp_common
Lwasm_tramp_92:
    mov x16, #92
    b Lwasm_tramp_common
Lwasm_tramp_93:
    mov x16, #93
    b Lwasm_tramp_common
Lwasm_tramp_94:
    mov x16, #94
    b Lwasm_tramp_common
Lwasm_tramp_95:
    mov x16, #95
    b Lwasm_tramp_common
Lwasm_tramp_96:
    mov x16, #96
    b Lwasm_tramp_common
Lwasm_tramp_97:
    mov x16, #97
    b Lwasm_tramp_common
Lwasm_tramp_98:
    mov x16, #98
    b Lwasm_tramp_common
Lwasm_tramp_99:
    mov x16, #99
    b Lwasm_tramp_common
Lwasm_tramp_100:
    mov x16, #100
    b Lwasm_tramp_common
Lwasm_tramp_101:
    mov x16, #101
    b Lwasm_tramp_common
Lwasm_tramp_102:
    mov x16, #102
    b Lwasm_tramp_common
Lwasm_tramp_103:
    mov x16, #103
    b Lwasm_tramp_common
Lwasm_tramp_104:
    mov x16, #104
    b Lwasm_tramp_common
Lwasm_tramp_105:
    mov x16, #105
    b Lwasm_tramp_common
Lwasm_tramp_106:
    mov x16, #106
    b Lwasm_tramp_common
Lwasm_tramp_107:
    mov x16, #107
    b Lwasm_tramp_common
Lwasm_tramp_108:
    mov x16, #108
    b Lwasm_tramp_common
Lwasm_tramp_109:
    mov x16, #109
    b Lwasm_tramp_common
Lwasm_tramp_110:
    mov x16, #110
    b Lwasm_tramp_common
Lwasm_tramp_111:
    mov x16, #111
    b Lwasm_tramp_common
Lwasm_tramp_112:
    mov x16, #112
    b Lwasm_tramp_common
Lwasm_tramp_113:
    mov x16, #113
    b Lwasm_tramp_common
Lwasm_tramp_114:
    mov x16, #114
    b Lwasm_tramp_common
Lwasm_tramp_115:
    mov x16, #115
    b Lwasm_tramp_common
Lwasm_tramp_116:
    mov x16, #116
    b Lwasm_tramp_common
Lwasm_tramp_117:
    mov x16, #117
    b Lwasm_tramp_common
Lwasm_tramp_118:
    mov x16, #118
    b Lwasm_tramp_common
Lwasm_tramp_119:
    mov x16, #119
    b Lwasm_tramp_common
Lwasm_tramp_120:
    mov x16, #120
    b Lwasm_tramp_common
Lwasm_tramp_121:
    mov x16, #121
    b Lwasm_tramp_common
Lwasm_tramp_122:
    mov x16, #122
    b Lwasm_tramp_common
Lwasm_tramp_123:
    mov x16, #123
    b Lwasm_tramp_common
Lwasm_tramp_124:
    mov x16, #124
    b Lwasm_tramp_common
Lwasm_tramp_125:
    mov x16, #125
    b Lwasm_tramp_common
Lwasm_tramp_126:
    mov x16, #126
    b Lwasm_tramp_common
Lwasm_tramp_127:
    mov x16, #127
    b Lwasm_tramp_common
Lwasm_tramp_128:
    mov x16, #128
    b Lwasm_tramp_common
Lwasm_tramp_129:
    mov x16, #129
    b Lwasm_tramp_common
Lwasm_tramp_130:
    mov x16, #130
    b Lwasm_tramp_common
Lwasm_tramp_131:
    mov x16, #131
    b Lwasm_tramp_common
Lwasm_tramp_132:
    mov x16, #132
    b Lwasm_tramp_common
Lwasm_tramp_133:
    mov x16, #133
    b Lwasm_tramp_common
Lwasm_tramp_134:
    mov x16, #134
    b Lwasm_tramp_common
Lwasm_tramp_135:
    mov x16, #135
    b Lwasm_tramp_common
Lwasm_tramp_136:
    mov x16, #136
    b Lwasm_tramp_common
Lwasm_tramp_137:
    mov x16, #137
    b Lwasm_tramp_common
Lwasm_tramp_138:
    mov x16, #138
    b Lwasm_tramp_common
Lwasm_tramp_139:
    mov x16, #139
    b Lwasm_tramp_common
Lwasm_tramp_140:
    mov x16, #140
    b Lwasm_tramp_common
Lwasm_tramp_141:
    mov x16, #141
    b Lwasm_tramp_common
Lwasm_tramp_142:
    mov x16, #142
    b Lwasm_tramp_common
Lwasm_tramp_143:
    mov x16, #143
    b Lwasm_tramp_common
Lwasm_tramp_144:
    mov x16, #144
    b Lwasm_tramp_common
Lwasm_tramp_145:
    mov x16, #145
    b Lwasm_tramp_common
Lwasm_tramp_146:
    mov x16, #146
    b Lwasm_tramp_common
Lwasm_tramp_147:
    mov x16, #147
    b Lwasm_tramp_common
Lwasm_tramp_148:
    mov x16, #148
    b Lwasm_tramp_common
Lwasm_tramp_149:
    mov x16, #149
    b Lwasm_tramp_common
Lwasm_tramp_150:
    mov x16, #150
    b Lwasm_tramp_common
Lwasm_tramp_151:
    mov x16, #151
    b Lwasm_tramp_common
Lwasm_tramp_152:
    mov x16, #152
    b Lwasm_tramp_common
Lwasm_tramp_153:
    mov x16, #153
    b Lwasm_tramp_common
Lwasm_tramp_154:
    mov x16, #154
    b Lwasm_tramp_common
Lwasm_tramp_155:
    mov x16, #155
    b Lwasm_tramp_common
Lwasm_tramp_156:
    mov x16, #156
    b Lwasm_tramp_common
Lwasm_tramp_157:
    mov x16, #157
    b Lwasm_tramp_common
Lwasm_tramp_158:
    mov x16, #158
    b Lwasm_tramp_common
Lwasm_tramp_159:
    mov x16, #159
    b Lwasm_tramp_common
Lwasm_tramp_160:
    mov x16, #160
    b Lwasm_tramp_common
Lwasm_tramp_161:
    mov x16, #161
    b Lwasm_tramp_common
Lwasm_tramp_162:
    mov x16, #162
    b Lwasm_tramp_common
Lwasm_tramp_163:
    mov x16, #163
    b Lwasm_tramp_common
Lwasm_tramp_164:
    mov x16, #164
    b Lwasm_tramp_common
Lwasm_tramp_165:
    mov x16, #165
    b Lwasm_tramp_common
Lwasm_tramp_166:
    mov x16, #166
    b Lwasm_tramp_common
Lwasm_tramp_167:
    mov x16, #167
    b Lwasm_tramp_common
Lwasm_tramp_168:
    mov x16, #168
    b Lwasm_tramp_common
Lwasm_tramp_169:
    mov x16, #169
    b Lwasm_tramp_common
Lwasm_tramp_170:
    mov x16, #170
    b Lwasm_tramp_common
Lwasm_tramp_171:
    mov x16, #171
    b Lwasm_tramp_common
Lwasm_tramp_172:
    mov x16, #172
    b Lwasm_tramp_common
Lwasm_tramp_173:
    mov x16, #173
    b Lwasm_tramp_common
Lwasm_tramp_174:
    mov x16, #174
    b Lwasm_tramp_common
Lwasm_tramp_175:
    mov x16, #175
    b Lwasm_tramp_common
Lwasm_tramp_176:
    mov x16, #176
    b Lwasm_tramp_common
Lwasm_tramp_177:
    mov x16, #177
    b Lwasm_tramp_common
Lwasm_tramp_178:
    mov x16, #178
    b Lwasm_tramp_common
Lwasm_tramp_179:
    mov x16, #179
    b Lwasm_tramp_common
Lwasm_tramp_180:
    mov x16, #180
    b Lwasm_tramp_common
Lwasm_tramp_181:
    mov x16, #181
    b Lwasm_tramp_common
Lwasm_tramp_182:
    mov x16, #182
    b Lwasm_tramp_common
Lwasm_tramp_183:
    mov x16, #183
    b Lwasm_tramp_common
Lwasm_tramp_184:
    mov x16, #184
    b Lwasm_tramp_common
Lwasm_tramp_185:
    mov x16, #185
    b Lwasm_tramp_common
Lwasm_tramp_186:
    mov x16, #186
    b Lwasm_tramp_common
Lwasm_tramp_187:
    mov x16, #187
    b Lwasm_tramp_common
Lwasm_tramp_188:
    mov x16, #188
    b Lwasm_tramp_common
Lwasm_tramp_189:
    mov x16, #189
    b Lwasm_tramp_common
Lwasm_tramp_190:
    mov x16, #190
    b Lwasm_tramp_common
Lwasm_tramp_191:
    mov x16, #191
    b Lwasm_tramp_common
Lwasm_tramp_192:
    mov x16, #192
    b Lwasm_tramp_common
Lwasm_tramp_193:
    mov x16, #193
    b Lwasm_tramp_common
Lwasm_tramp_194:
    mov x16, #194
    b Lwasm_tramp_common
Lwasm_tramp_195:
    mov x16, #195
    b Lwasm_tramp_common
Lwasm_tramp_196:
    mov x16, #196
    b Lwasm_tramp_common
Lwasm_tramp_197:
    mov x16, #197
    b Lwasm_tramp_common
Lwasm_tramp_198:
    mov x16, #198
    b Lwasm_tramp_common
Lwasm_tramp_199:
    mov x16, #199
    b Lwasm_tramp_common
Lwasm_tramp_200:
    mov x16, #200
    b Lwasm_tramp_common
Lwasm_tramp_201:
    mov x16, #201
    b Lwasm_tramp_common
Lwasm_tramp_202:
    mov x16, #202
    b Lwasm_tramp_common
Lwasm_tramp_203:
    mov x16, #203
    b Lwasm_tramp_common
Lwasm_tramp_204:
    mov x16, #204
    b Lwasm_tramp_common
Lwasm_tramp_205:
    mov x16, #205
    b Lwasm_tramp_common
Lwasm_tramp_206:
    mov x16, #206
    b Lwasm_tramp_common
Lwasm_tramp_207:
    mov x16, #207
    b Lwasm_tramp_common
Lwasm_tramp_208:
    mov x16, #208
    b Lwasm_tramp_common
Lwasm_tramp_209:
    mov x16, #209
    b Lwasm_tramp_common
Lwasm_tramp_210:
    mov x16, #210
    b Lwasm_tramp_common
Lwasm_tramp_211:
    mov x16, #211
    b Lwasm_tramp_common
Lwasm_tramp_212:
    mov x16, #212
    b Lwasm_tramp_common
Lwasm_tramp_213:
    mov x16, #213
    b Lwasm_tramp_common
Lwasm_tramp_214:
    mov x16, #214
    b Lwasm_tramp_common
Lwasm_tramp_215:
    mov x16, #215
    b Lwasm_tramp_common
Lwasm_tramp_216:
    mov x16, #216
    b Lwasm_tramp_common
Lwasm_tramp_217:
    mov x16, #217
    b Lwasm_tramp_common
Lwasm_tramp_218:
    mov x16, #218
    b Lwasm_tramp_common
Lwasm_tramp_219:
    mov x16, #219
    b Lwasm_tramp_common
Lwasm_tramp_220:
    mov x16, #220
    b Lwasm_tramp_common
Lwasm_tramp_221:
    mov x16, #221
    b Lwasm_tramp_common
Lwasm_tramp_222:
    mov x16, #222
    b Lwasm_tramp_common
Lwasm_tramp_223:
    mov x16, #223
    b Lwasm_tramp_common
Lwasm_tramp_224:
    mov x16, #224
    b Lwasm_tramp_common
Lwasm_tramp_225:
    mov x16, #225
    b Lwasm_tramp_common
Lwasm_tramp_226:
    mov x16, #226
    b Lwasm_tramp_common
Lwasm_tramp_227:
    mov x16, #227
    b Lwasm_tramp_common
Lwasm_tramp_228:
    mov x16, #228
    b Lwasm_tramp_common
Lwasm_tramp_229:
    mov x16, #229
    b Lwasm_tramp_common
Lwasm_tramp_230:
    mov x16, #230
    b Lwasm_tramp_common
Lwasm_tramp_231:
    mov x16, #231
    b Lwasm_tramp_common
Lwasm_tramp_232:
    mov x16, #232
    b Lwasm_tramp_common
Lwasm_tramp_233:
    mov x16, #233
    b Lwasm_tramp_common
Lwasm_tramp_234:
    mov x16, #234
    b Lwasm_tramp_common
Lwasm_tramp_235:
    mov x16, #235
    b Lwasm_tramp_common
Lwasm_tramp_236:
    mov x16, #236
    b Lwasm_tramp_common
Lwasm_tramp_237:
    mov x16, #237
    b Lwasm_tramp_common
Lwasm_tramp_238:
    mov x16, #238
    b Lwasm_tramp_common
Lwasm_tramp_239:
    mov x16, #239
    b Lwasm_tramp_common
Lwasm_tramp_240:
    mov x16, #240
    b Lwasm_tramp_common
Lwasm_tramp_241:
    mov x16, #241
    b Lwasm_tramp_common
Lwasm_tramp_242:
    mov x16, #242
    b Lwasm_tramp_common
Lwasm_tramp_243:
    mov x16, #243
    b Lwasm_tramp_common
Lwasm_tramp_244:
    mov x16, #244
    b Lwasm_tramp_common
Lwasm_tramp_245:
    mov x16, #245
    b Lwasm_tramp_common
Lwasm_tramp_246:
    mov x16, #246
    b Lwasm_tramp_common
Lwasm_tramp_247:
    mov x16, #247
    b Lwasm_tramp_common
Lwasm_tramp_248:
    mov x16, #248
    b Lwasm_tramp_common
Lwasm_tramp_249:
    mov x16, #249
    b Lwasm_tramp_common
Lwasm_tramp_250:
    mov x16, #250
    b Lwasm_tramp_common
Lwasm_tramp_251:
    mov x16, #251
    b Lwasm_tramp_common
Lwasm_tramp_252:
    mov x16, #252
    b Lwasm_tramp_common
Lwasm_tramp_253:
    mov x16, #253
    b Lwasm_tramp_common
Lwasm_tramp_254:
    mov x16, #254
    b Lwasm_tramp_common
Lwasm_tramp_255:
    mov x16, #255
    b Lwasm_tramp_common
Lwasm_tramp_256:
    mov x16, #256
    b Lwasm_tramp_common
Lwasm_tramp_257:
    mov x16, #257
    b Lwasm_tramp_common
Lwasm_tramp_258:
    mov x16, #258
    b Lwasm_tramp_common
Lwasm_tramp_259:
    mov x16, #259
    b Lwasm_tramp_common
Lwasm_tramp_260:
    mov x16, #260
    b Lwasm_tramp_common
Lwasm_tramp_261:
    mov x16, #261
    b Lwasm_tramp_common
Lwasm_tramp_262:
    mov x16, #262
    b Lwasm_tramp_common
Lwasm_tramp_263:
    mov x16, #263
    b Lwasm_tramp_common
Lwasm_tramp_264:
    mov x16, #264
    b Lwasm_tramp_common
Lwasm_tramp_265:
    mov x16, #265
    b Lwasm_tramp_common
Lwasm_tramp_266:
    mov x16, #266
    b Lwasm_tramp_common
Lwasm_tramp_267:
    mov x16, #267
    b Lwasm_tramp_common
Lwasm_tramp_268:
    mov x16, #268
    b Lwasm_tramp_common
Lwasm_tramp_269:
    mov x16, #269
    b Lwasm_tramp_common
Lwasm_tramp_270:
    mov x16, #270
    b Lwasm_tramp_common
Lwasm_tramp_271:
    mov x16, #271
    b Lwasm_tramp_common
Lwasm_tramp_272:
    mov x16, #272
    b Lwasm_tramp_common
Lwasm_tramp_273:
    mov x16, #273
    b Lwasm_tramp_common
Lwasm_tramp_274:
    mov x16, #274
    b Lwasm_tramp_common
Lwasm_tramp_275:
    mov x16, #275
    b Lwasm_tramp_common
Lwasm_tramp_276:
    mov x16, #276
    b Lwasm_tramp_common
Lwasm_tramp_277:
    mov x16, #277
    b Lwasm_tramp_common
Lwasm_tramp_278:
    mov x16, #278
    b Lwasm_tramp_common
Lwasm_tramp_279:
    mov x16, #279
    b Lwasm_tramp_common
Lwasm_tramp_280:
    mov x16, #280
    b Lwasm_tramp_common
Lwasm_tramp_281:
    mov x16, #281
    b Lwasm_tramp_common
Lwasm_tramp_282:
    mov x16, #282
    b Lwasm_tramp_common
Lwasm_tramp_283:
    mov x16, #283
    b Lwasm_tramp_common
Lwasm_tramp_284:
    mov x16, #284
    b Lwasm_tramp_common
Lwasm_tramp_285:
    mov x16, #285
    b Lwasm_tramp_common
Lwasm_tramp_286:
    mov x16, #286
    b Lwasm_tramp_common
Lwasm_tramp_287:
    mov x16, #287
    b Lwasm_tramp_common
Lwasm_tramp_288:
    mov x16, #288
    b Lwasm_tramp_common
Lwasm_tramp_289:
    mov x16, #289
    b Lwasm_tramp_common
Lwasm_tramp_290:
    mov x16, #290
    b Lwasm_tramp_common
Lwasm_tramp_291:
    mov x16, #291
    b Lwasm_tramp_common
Lwasm_tramp_292:
    mov x16, #292
    b Lwasm_tramp_common
Lwasm_tramp_293:
    mov x16, #293
    b Lwasm_tramp_common
Lwasm_tramp_294:
    mov x16, #294
    b Lwasm_tramp_common
Lwasm_tramp_295:
    mov x16, #295
    b Lwasm_tramp_common
Lwasm_tramp_296:
    mov x16, #296
    b Lwasm_tramp_common
Lwasm_tramp_297:
    mov x16, #297
    b Lwasm_tramp_common
Lwasm_tramp_298:
    mov x16, #298
    b Lwasm_tramp_common
Lwasm_tramp_299:
    mov x16, #299
    b Lwasm_tramp_common
Lwasm_tramp_300:
    mov x16, #300
    b Lwasm_tramp_common
Lwasm_tramp_301:
    mov x16, #301
    b Lwasm_tramp_common
Lwasm_tramp_302:
    mov x16, #302
    b Lwasm_tramp_common
Lwasm_tramp_303:
    mov x16, #303
    b Lwasm_tramp_common
Lwasm_tramp_304:
    mov x16, #304
    b Lwasm_tramp_common
Lwasm_tramp_305:
    mov x16, #305
    b Lwasm_tramp_common
Lwasm_tramp_306:
    mov x16, #306
    b Lwasm_tramp_common
Lwasm_tramp_307:
    mov x16, #307
    b Lwasm_tramp_common
Lwasm_tramp_308:
    mov x16, #308
    b Lwasm_tramp_common
Lwasm_tramp_309:
    mov x16, #309
    b Lwasm_tramp_common
Lwasm_tramp_310:
    mov x16, #310
    b Lwasm_tramp_common
Lwasm_tramp_311:
    mov x16, #311
    b Lwasm_tramp_common
Lwasm_tramp_312:
    mov x16, #312
    b Lwasm_tramp_common
Lwasm_tramp_313:
    mov x16, #313
    b Lwasm_tramp_common
Lwasm_tramp_314:
    mov x16, #314
    b Lwasm_tramp_common
Lwasm_tramp_315:
    mov x16, #315
    b Lwasm_tramp_common
Lwasm_tramp_316:
    mov x16, #316
    b Lwasm_tramp_common
Lwasm_tramp_317:
    mov x16, #317
    b Lwasm_tramp_common
Lwasm_tramp_318:
    mov x16, #318
    b Lwasm_tramp_common
Lwasm_tramp_319:
    mov x16, #319
    b Lwasm_tramp_common
Lwasm_tramp_320:
    mov x16, #320
    b Lwasm_tramp_common
Lwasm_tramp_321:
    mov x16, #321
    b Lwasm_tramp_common
Lwasm_tramp_322:
    mov x16, #322
    b Lwasm_tramp_common
Lwasm_tramp_323:
    mov x16, #323
    b Lwasm_tramp_common
Lwasm_tramp_324:
    mov x16, #324
    b Lwasm_tramp_common
Lwasm_tramp_325:
    mov x16, #325
    b Lwasm_tramp_common
Lwasm_tramp_326:
    mov x16, #326
    b Lwasm_tramp_common
Lwasm_tramp_327:
    mov x16, #327
    b Lwasm_tramp_common
Lwasm_tramp_328:
    mov x16, #328
    b Lwasm_tramp_common
Lwasm_tramp_329:
    mov x16, #329
    b Lwasm_tramp_common
Lwasm_tramp_330:
    mov x16, #330
    b Lwasm_tramp_common
Lwasm_tramp_331:
    mov x16, #331
    b Lwasm_tramp_common
Lwasm_tramp_332:
    mov x16, #332
    b Lwasm_tramp_common
Lwasm_tramp_333:
    mov x16, #333
    b Lwasm_tramp_common
Lwasm_tramp_334:
    mov x16, #334
    b Lwasm_tramp_common
Lwasm_tramp_335:
    mov x16, #335
    b Lwasm_tramp_common
Lwasm_tramp_336:
    mov x16, #336
    b Lwasm_tramp_common
Lwasm_tramp_337:
    mov x16, #337
    b Lwasm_tramp_common
Lwasm_tramp_338:
    mov x16, #338
    b Lwasm_tramp_common
Lwasm_tramp_339:
    mov x16, #339
    b Lwasm_tramp_common
Lwasm_tramp_340:
    mov x16, #340
    b Lwasm_tramp_common
Lwasm_tramp_341:
    mov x16, #341
    b Lwasm_tramp_common
Lwasm_tramp_342:
    mov x16, #342
    b Lwasm_tramp_common
Lwasm_tramp_343:
    mov x16, #343
    b Lwasm_tramp_common
Lwasm_tramp_344:
    mov x16, #344
    b Lwasm_tramp_common
Lwasm_tramp_345:
    mov x16, #345
    b Lwasm_tramp_common
Lwasm_tramp_346:
    mov x16, #346
    b Lwasm_tramp_common
Lwasm_tramp_347:
    mov x16, #347
    b Lwasm_tramp_common
Lwasm_tramp_348:
    mov x16, #348
    b Lwasm_tramp_common
Lwasm_tramp_349:
    mov x16, #349
    b Lwasm_tramp_common
Lwasm_tramp_350:
    mov x16, #350
    b Lwasm_tramp_common
Lwasm_tramp_351:
    mov x16, #351
    b Lwasm_tramp_common
Lwasm_tramp_352:
    mov x16, #352
    b Lwasm_tramp_common
Lwasm_tramp_353:
    mov x16, #353
    b Lwasm_tramp_common
Lwasm_tramp_354:
    mov x16, #354
    b Lwasm_tramp_common
Lwasm_tramp_355:
    mov x16, #355
    b Lwasm_tramp_common
Lwasm_tramp_356:
    mov x16, #356
    b Lwasm_tramp_common
Lwasm_tramp_357:
    mov x16, #357
    b Lwasm_tramp_common
Lwasm_tramp_358:
    mov x16, #358
    b Lwasm_tramp_common
Lwasm_tramp_359:
    mov x16, #359
    b Lwasm_tramp_common
Lwasm_tramp_360:
    mov x16, #360
    b Lwasm_tramp_common
Lwasm_tramp_361:
    mov x16, #361
    b Lwasm_tramp_common
Lwasm_tramp_362:
    mov x16, #362
    b Lwasm_tramp_common
Lwasm_tramp_363:
    mov x16, #363
    b Lwasm_tramp_common
Lwasm_tramp_364:
    mov x16, #364
    b Lwasm_tramp_common
Lwasm_tramp_365:
    mov x16, #365
    b Lwasm_tramp_common
Lwasm_tramp_366:
    mov x16, #366
    b Lwasm_tramp_common
Lwasm_tramp_367:
    mov x16, #367
    b Lwasm_tramp_common
Lwasm_tramp_368:
    mov x16, #368
    b Lwasm_tramp_common
Lwasm_tramp_369:
    mov x16, #369
    b Lwasm_tramp_common
Lwasm_tramp_370:
    mov x16, #370
    b Lwasm_tramp_common
Lwasm_tramp_371:
    mov x16, #371
    b Lwasm_tramp_common
Lwasm_tramp_372:
    mov x16, #372
    b Lwasm_tramp_common
Lwasm_tramp_373:
    mov x16, #373
    b Lwasm_tramp_common
Lwasm_tramp_374:
    mov x16, #374
    b Lwasm_tramp_common
Lwasm_tramp_375:
    mov x16, #375
    b Lwasm_tramp_common
Lwasm_tramp_376:
    mov x16, #376
    b Lwasm_tramp_common
Lwasm_tramp_377:
    mov x16, #377
    b Lwasm_tramp_common
Lwasm_tramp_378:
    mov x16, #378
    b Lwasm_tramp_common
Lwasm_tramp_379:
    mov x16, #379
    b Lwasm_tramp_common
Lwasm_tramp_380:
    mov x16, #380
    b Lwasm_tramp_common
Lwasm_tramp_381:
    mov x16, #381
    b Lwasm_tramp_common
Lwasm_tramp_382:
    mov x16, #382
    b Lwasm_tramp_common
Lwasm_tramp_383:
    mov x16, #383
    b Lwasm_tramp_common
Lwasm_tramp_384:
    mov x16, #384
    b Lwasm_tramp_common
Lwasm_tramp_385:
    mov x16, #385
    b Lwasm_tramp_common
Lwasm_tramp_386:
    mov x16, #386
    b Lwasm_tramp_common
Lwasm_tramp_387:
    mov x16, #387
    b Lwasm_tramp_common
Lwasm_tramp_388:
    mov x16, #388
    b Lwasm_tramp_common
Lwasm_tramp_389:
    mov x16, #389
    b Lwasm_tramp_common
Lwasm_tramp_390:
    mov x16, #390
    b Lwasm_tramp_common
Lwasm_tramp_391:
    mov x16, #391
    b Lwasm_tramp_common
Lwasm_tramp_392:
    mov x16, #392
    b Lwasm_tramp_common
Lwasm_tramp_393:
    mov x16, #393
    b Lwasm_tramp_common
Lwasm_tramp_394:
    mov x16, #394
    b Lwasm_tramp_common
Lwasm_tramp_395:
    mov x16, #395
    b Lwasm_tramp_common
Lwasm_tramp_396:
    mov x16, #396
    b Lwasm_tramp_common
Lwasm_tramp_397:
    mov x16, #397
    b Lwasm_tramp_common
Lwasm_tramp_398:
    mov x16, #398
    b Lwasm_tramp_common
Lwasm_tramp_399:
    mov x16, #399
    b Lwasm_tramp_common
Lwasm_tramp_400:
    mov x16, #400
    b Lwasm_tramp_common
Lwasm_tramp_401:
    mov x16, #401
    b Lwasm_tramp_common
Lwasm_tramp_402:
    mov x16, #402
    b Lwasm_tramp_common
Lwasm_tramp_403:
    mov x16, #403
    b Lwasm_tramp_common
Lwasm_tramp_404:
    mov x16, #404
    b Lwasm_tramp_common
Lwasm_tramp_405:
    mov x16, #405
    b Lwasm_tramp_common
Lwasm_tramp_406:
    mov x16, #406
    b Lwasm_tramp_common
Lwasm_tramp_407:
    mov x16, #407
    b Lwasm_tramp_common
Lwasm_tramp_408:
    mov x16, #408
    b Lwasm_tramp_common
Lwasm_tramp_409:
    mov x16, #409
    b Lwasm_tramp_common
Lwasm_tramp_410:
    mov x16, #410
    b Lwasm_tramp_common
Lwasm_tramp_411:
    mov x16, #411
    b Lwasm_tramp_common
Lwasm_tramp_412:
    mov x16, #412
    b Lwasm_tramp_common
Lwasm_tramp_413:
    mov x16, #413
    b Lwasm_tramp_common
Lwasm_tramp_414:
    mov x16, #414
    b Lwasm_tramp_common
Lwasm_tramp_415:
    mov x16, #415
    b Lwasm_tramp_common
Lwasm_tramp_416:
    mov x16, #416
    b Lwasm_tramp_common
Lwasm_tramp_417:
    mov x16, #417
    b Lwasm_tramp_common
Lwasm_tramp_418:
    mov x16, #418
    b Lwasm_tramp_common
Lwasm_tramp_419:
    mov x16, #419
    b Lwasm_tramp_common
Lwasm_tramp_420:
    mov x16, #420
    b Lwasm_tramp_common
Lwasm_tramp_421:
    mov x16, #421
    b Lwasm_tramp_common
Lwasm_tramp_422:
    mov x16, #422
    b Lwasm_tramp_common
Lwasm_tramp_423:
    mov x16, #423
    b Lwasm_tramp_common
Lwasm_tramp_424:
    mov x16, #424
    b Lwasm_tramp_common
Lwasm_tramp_425:
    mov x16, #425
    b Lwasm_tramp_common
Lwasm_tramp_426:
    mov x16, #426
    b Lwasm_tramp_common
Lwasm_tramp_427:
    mov x16, #427
    b Lwasm_tramp_common
Lwasm_tramp_428:
    mov x16, #428
    b Lwasm_tramp_common
Lwasm_tramp_429:
    mov x16, #429
    b Lwasm_tramp_common
Lwasm_tramp_430:
    mov x16, #430
    b Lwasm_tramp_common
Lwasm_tramp_431:
    mov x16, #431
    b Lwasm_tramp_common
Lwasm_tramp_432:
    mov x16, #432
    b Lwasm_tramp_common
Lwasm_tramp_433:
    mov x16, #433
    b Lwasm_tramp_common
Lwasm_tramp_434:
    mov x16, #434
    b Lwasm_tramp_common
Lwasm_tramp_435:
    mov x16, #435
    b Lwasm_tramp_common
Lwasm_tramp_436:
    mov x16, #436
    b Lwasm_tramp_common
Lwasm_tramp_437:
    mov x16, #437
    b Lwasm_tramp_common
Lwasm_tramp_438:
    mov x16, #438
    b Lwasm_tramp_common
Lwasm_tramp_439:
    mov x16, #439
    b Lwasm_tramp_common
Lwasm_tramp_440:
    mov x16, #440
    b Lwasm_tramp_common
Lwasm_tramp_441:
    mov x16, #441
    b Lwasm_tramp_common
Lwasm_tramp_442:
    mov x16, #442
    b Lwasm_tramp_common
Lwasm_tramp_443:
    mov x16, #443
    b Lwasm_tramp_common
Lwasm_tramp_444:
    mov x16, #444
    b Lwasm_tramp_common
Lwasm_tramp_445:
    mov x16, #445
    b Lwasm_tramp_common
Lwasm_tramp_446:
    mov x16, #446
    b Lwasm_tramp_common
Lwasm_tramp_447:
    mov x16, #447
    b Lwasm_tramp_common
Lwasm_tramp_448:
    mov x16, #448
    b Lwasm_tramp_common
Lwasm_tramp_449:
    mov x16, #449
    b Lwasm_tramp_common
Lwasm_tramp_450:
    mov x16, #450
    b Lwasm_tramp_common
Lwasm_tramp_451:
    mov x16, #451
    b Lwasm_tramp_common
Lwasm_tramp_452:
    mov x16, #452
    b Lwasm_tramp_common
Lwasm_tramp_453:
    mov x16, #453
    b Lwasm_tramp_common
Lwasm_tramp_454:
    mov x16, #454
    b Lwasm_tramp_common
Lwasm_tramp_455:
    mov x16, #455
    b Lwasm_tramp_common
Lwasm_tramp_456:
    mov x16, #456
    b Lwasm_tramp_common
Lwasm_tramp_457:
    mov x16, #457
    b Lwasm_tramp_common
Lwasm_tramp_458:
    mov x16, #458
    b Lwasm_tramp_common
Lwasm_tramp_459:
    mov x16, #459
    b Lwasm_tramp_common
Lwasm_tramp_460:
    mov x16, #460
    b Lwasm_tramp_common
Lwasm_tramp_461:
    mov x16, #461
    b Lwasm_tramp_common
Lwasm_tramp_462:
    mov x16, #462
    b Lwasm_tramp_common
Lwasm_tramp_463:
    mov x16, #463
    b Lwasm_tramp_common
Lwasm_tramp_464:
    mov x16, #464
    b Lwasm_tramp_common
Lwasm_tramp_465:
    mov x16, #465
    b Lwasm_tramp_common
Lwasm_tramp_466:
    mov x16, #466
    b Lwasm_tramp_common
Lwasm_tramp_467:
    mov x16, #467
    b Lwasm_tramp_common
Lwasm_tramp_468:
    mov x16, #468
    b Lwasm_tramp_common
Lwasm_tramp_469:
    mov x16, #469
    b Lwasm_tramp_common
Lwasm_tramp_470:
    mov x16, #470
    b Lwasm_tramp_common
Lwasm_tramp_471:
    mov x16, #471
    b Lwasm_tramp_common
Lwasm_tramp_472:
    mov x16, #472
    b Lwasm_tramp_common
Lwasm_tramp_473:
    mov x16, #473
    b Lwasm_tramp_common
Lwasm_tramp_474:
    mov x16, #474
    b Lwasm_tramp_common
Lwasm_tramp_475:
    mov x16, #475
    b Lwasm_tramp_common
Lwasm_tramp_476:
    mov x16, #476
    b Lwasm_tramp_common
Lwasm_tramp_477:
    mov x16, #477
    b Lwasm_tramp_common
Lwasm_tramp_478:
    mov x16, #478
    b Lwasm_tramp_common
Lwasm_tramp_479:
    mov x16, #479
    b Lwasm_tramp_common
Lwasm_tramp_480:
    mov x16, #480
    b Lwasm_tramp_common
Lwasm_tramp_481:
    mov x16, #481
    b Lwasm_tramp_common
Lwasm_tramp_482:
    mov x16, #482
    b Lwasm_tramp_common
Lwasm_tramp_483:
    mov x16, #483
    b Lwasm_tramp_common
Lwasm_tramp_484:
    mov x16, #484
    b Lwasm_tramp_common
Lwasm_tramp_485:
    mov x16, #485
    b Lwasm_tramp_common
Lwasm_tramp_486:
    mov x16, #486
    b Lwasm_tramp_common
Lwasm_tramp_487:
    mov x16, #487
    b Lwasm_tramp_common
Lwasm_tramp_488:
    mov x16, #488
    b Lwasm_tramp_common
Lwasm_tramp_489:
    mov x16, #489
    b Lwasm_tramp_common
Lwasm_tramp_490:
    mov x16, #490
    b Lwasm_tramp_common
Lwasm_tramp_491:
    mov x16, #491
    b Lwasm_tramp_common
Lwasm_tramp_492:
    mov x16, #492
    b Lwasm_tramp_common
Lwasm_tramp_493:
    mov x16, #493
    b Lwasm_tramp_common
Lwasm_tramp_494:
    mov x16, #494
    b Lwasm_tramp_common
Lwasm_tramp_495:
    mov x16, #495
    b Lwasm_tramp_common
Lwasm_tramp_496:
    mov x16, #496
    b Lwasm_tramp_common
Lwasm_tramp_497:
    mov x16, #497
    b Lwasm_tramp_common
Lwasm_tramp_498:
    mov x16, #498
    b Lwasm_tramp_common
Lwasm_tramp_499:
    mov x16, #499
    b Lwasm_tramp_common
Lwasm_tramp_500:
    mov x16, #500
    b Lwasm_tramp_common
Lwasm_tramp_501:
    mov x16, #501
    b Lwasm_tramp_common
Lwasm_tramp_502:
    mov x16, #502
    b Lwasm_tramp_common
Lwasm_tramp_503:
    mov x16, #503
    b Lwasm_tramp_common
Lwasm_tramp_504:
    mov x16, #504
    b Lwasm_tramp_common
Lwasm_tramp_505:
    mov x16, #505
    b Lwasm_tramp_common
Lwasm_tramp_506:
    mov x16, #506
    b Lwasm_tramp_common
Lwasm_tramp_507:
    mov x16, #507
    b Lwasm_tramp_common
Lwasm_tramp_508:
    mov x16, #508
    b Lwasm_tramp_common
Lwasm_tramp_509:
    mov x16, #509
    b Lwasm_tramp_common
Lwasm_tramp_510:
    mov x16, #510
    b Lwasm_tramp_common
Lwasm_tramp_511:
    mov x16, #511
    b Lwasm_tramp_common
Lwasm_tramp_512:
    mov x16, #512
    b Lwasm_tramp_common
Lwasm_tramp_513:
    mov x16, #513
    b Lwasm_tramp_common
Lwasm_tramp_514:
    mov x16, #514
    b Lwasm_tramp_common
Lwasm_tramp_515:
    mov x16, #515
    b Lwasm_tramp_common
Lwasm_tramp_516:
    mov x16, #516
    b Lwasm_tramp_common
Lwasm_tramp_517:
    mov x16, #517
    b Lwasm_tramp_common
Lwasm_tramp_518:
    mov x16, #518
    b Lwasm_tramp_common
Lwasm_tramp_519:
    mov x16, #519
    b Lwasm_tramp_common
Lwasm_tramp_520:
    mov x16, #520
    b Lwasm_tramp_common
Lwasm_tramp_521:
    mov x16, #521
    b Lwasm_tramp_common
Lwasm_tramp_522:
    mov x16, #522
    b Lwasm_tramp_common
Lwasm_tramp_523:
    mov x16, #523
    b Lwasm_tramp_common
Lwasm_tramp_524:
    mov x16, #524
    b Lwasm_tramp_common
Lwasm_tramp_525:
    mov x16, #525
    b Lwasm_tramp_common
Lwasm_tramp_526:
    mov x16, #526
    b Lwasm_tramp_common
Lwasm_tramp_527:
    mov x16, #527
    b Lwasm_tramp_common
Lwasm_tramp_528:
    mov x16, #528
    b Lwasm_tramp_common
Lwasm_tramp_529:
    mov x16, #529
    b Lwasm_tramp_common
Lwasm_tramp_530:
    mov x16, #530
    b Lwasm_tramp_common
Lwasm_tramp_531:
    mov x16, #531
    b Lwasm_tramp_common
Lwasm_tramp_532:
    mov x16, #532
    b Lwasm_tramp_common
Lwasm_tramp_533:
    mov x16, #533
    b Lwasm_tramp_common
Lwasm_tramp_534:
    mov x16, #534
    b Lwasm_tramp_common
Lwasm_tramp_535:
    mov x16, #535
    b Lwasm_tramp_common
Lwasm_tramp_536:
    mov x16, #536
    b Lwasm_tramp_common
Lwasm_tramp_537:
    mov x16, #537
    b Lwasm_tramp_common
Lwasm_tramp_538:
    mov x16, #538
    b Lwasm_tramp_common
Lwasm_tramp_539:
    mov x16, #539
    b Lwasm_tramp_common
Lwasm_tramp_540:
    mov x16, #540
    b Lwasm_tramp_common
Lwasm_tramp_541:
    mov x16, #541
    b Lwasm_tramp_common
Lwasm_tramp_542:
    mov x16, #542
    b Lwasm_tramp_common
Lwasm_tramp_543:
    mov x16, #543
    b Lwasm_tramp_common
Lwasm_tramp_544:
    mov x16, #544
    b Lwasm_tramp_common
Lwasm_tramp_545:
    mov x16, #545
    b Lwasm_tramp_common
Lwasm_tramp_546:
    mov x16, #546
    b Lwasm_tramp_common
Lwasm_tramp_547:
    mov x16, #547
    b Lwasm_tramp_common
Lwasm_tramp_548:
    mov x16, #548
    b Lwasm_tramp_common
Lwasm_tramp_549:
    mov x16, #549
    b Lwasm_tramp_common
Lwasm_tramp_550:
    mov x16, #550
    b Lwasm_tramp_common
Lwasm_tramp_551:
    mov x16, #551
    b Lwasm_tramp_common
Lwasm_tramp_552:
    mov x16, #552
    b Lwasm_tramp_common
Lwasm_tramp_553:
    mov x16, #553
    b Lwasm_tramp_common
Lwasm_tramp_554:
    mov x16, #554
    b Lwasm_tramp_common
Lwasm_tramp_555:
    mov x16, #555
    b Lwasm_tramp_common
Lwasm_tramp_556:
    mov x16, #556
    b Lwasm_tramp_common
Lwasm_tramp_557:
    mov x16, #557
    b Lwasm_tramp_common
Lwasm_tramp_558:
    mov x16, #558
    b Lwasm_tramp_common
Lwasm_tramp_559:
    mov x16, #559
    b Lwasm_tramp_common
Lwasm_tramp_560:
    mov x16, #560
    b Lwasm_tramp_common
Lwasm_tramp_561:
    mov x16, #561
    b Lwasm_tramp_common
Lwasm_tramp_562:
    mov x16, #562
    b Lwasm_tramp_common
Lwasm_tramp_563:
    mov x16, #563
    b Lwasm_tramp_common
Lwasm_tramp_564:
    mov x16, #564
    b Lwasm_tramp_common
Lwasm_tramp_565:
    mov x16, #565
    b Lwasm_tramp_common
Lwasm_tramp_566:
    mov x16, #566
    b Lwasm_tramp_common
Lwasm_tramp_567:
    mov x16, #567
    b Lwasm_tramp_common
Lwasm_tramp_568:
    mov x16, #568
    b Lwasm_tramp_common
Lwasm_tramp_569:
    mov x16, #569
    b Lwasm_tramp_common
Lwasm_tramp_570:
    mov x16, #570
    b Lwasm_tramp_common
Lwasm_tramp_571:
    mov x16, #571
    b Lwasm_tramp_common
Lwasm_tramp_572:
    mov x16, #572
    b Lwasm_tramp_common
Lwasm_tramp_573:
    mov x16, #573
    b Lwasm_tramp_common
Lwasm_tramp_574:
    mov x16, #574
    b Lwasm_tramp_common
Lwasm_tramp_575:
    mov x16, #575
    b Lwasm_tramp_common
Lwasm_tramp_576:
    mov x16, #576
    b Lwasm_tramp_common
Lwasm_tramp_577:
    mov x16, #577
    b Lwasm_tramp_common
Lwasm_tramp_578:
    mov x16, #578
    b Lwasm_tramp_common
Lwasm_tramp_579:
    mov x16, #579
    b Lwasm_tramp_common
Lwasm_tramp_580:
    mov x16, #580
    b Lwasm_tramp_common
Lwasm_tramp_581:
    mov x16, #581
    b Lwasm_tramp_common
Lwasm_tramp_582:
    mov x16, #582
    b Lwasm_tramp_common
Lwasm_tramp_583:
    mov x16, #583
    b Lwasm_tramp_common
Lwasm_tramp_584:
    mov x16, #584
    b Lwasm_tramp_common
Lwasm_tramp_585:
    mov x16, #585
    b Lwasm_tramp_common
Lwasm_tramp_586:
    mov x16, #586
    b Lwasm_tramp_common
Lwasm_tramp_587:
    mov x16, #587
    b Lwasm_tramp_common
Lwasm_tramp_588:
    mov x16, #588
    b Lwasm_tramp_common
Lwasm_tramp_589:
    mov x16, #589
    b Lwasm_tramp_common
Lwasm_tramp_590:
    mov x16, #590
    b Lwasm_tramp_common
Lwasm_tramp_591:
    mov x16, #591
    b Lwasm_tramp_common
Lwasm_tramp_592:
    mov x16, #592
    b Lwasm_tramp_common
Lwasm_tramp_593:
    mov x16, #593
    b Lwasm_tramp_common
Lwasm_tramp_594:
    mov x16, #594
    b Lwasm_tramp_common
Lwasm_tramp_595:
    mov x16, #595
    b Lwasm_tramp_common
Lwasm_tramp_596:
    mov x16, #596
    b Lwasm_tramp_common
Lwasm_tramp_597:
    mov x16, #597
    b Lwasm_tramp_common
Lwasm_tramp_598:
    mov x16, #598
    b Lwasm_tramp_common
Lwasm_tramp_599:
    mov x16, #599
    b Lwasm_tramp_common
Lwasm_tramp_600:
    mov x16, #600
    b Lwasm_tramp_common
Lwasm_tramp_601:
    mov x16, #601
    b Lwasm_tramp_common
Lwasm_tramp_602:
    mov x16, #602
    b Lwasm_tramp_common
Lwasm_tramp_603:
    mov x16, #603
    b Lwasm_tramp_common
Lwasm_tramp_604:
    mov x16, #604
    b Lwasm_tramp_common
Lwasm_tramp_605:
    mov x16, #605
    b Lwasm_tramp_common
Lwasm_tramp_606:
    mov x16, #606
    b Lwasm_tramp_common
Lwasm_tramp_607:
    mov x16, #607
    b Lwasm_tramp_common
Lwasm_tramp_608:
    mov x16, #608
    b Lwasm_tramp_common
Lwasm_tramp_609:
    mov x16, #609
    b Lwasm_tramp_common
Lwasm_tramp_610:
    mov x16, #610
    b Lwasm_tramp_common
Lwasm_tramp_611:
    mov x16, #611
    b Lwasm_tramp_common
Lwasm_tramp_612:
    mov x16, #612
    b Lwasm_tramp_common
Lwasm_tramp_613:
    mov x16, #613
    b Lwasm_tramp_common
Lwasm_tramp_614:
    mov x16, #614
    b Lwasm_tramp_common
Lwasm_tramp_615:
    mov x16, #615
    b Lwasm_tramp_common
Lwasm_tramp_616:
    mov x16, #616
    b Lwasm_tramp_common
Lwasm_tramp_617:
    mov x16, #617
    b Lwasm_tramp_common
Lwasm_tramp_618:
    mov x16, #618
    b Lwasm_tramp_common
Lwasm_tramp_619:
    mov x16, #619
    b Lwasm_tramp_common
Lwasm_tramp_620:
    mov x16, #620
    b Lwasm_tramp_common
Lwasm_tramp_621:
    mov x16, #621
    b Lwasm_tramp_common
Lwasm_tramp_622:
    mov x16, #622
    b Lwasm_tramp_common
Lwasm_tramp_623:
    mov x16, #623
    b Lwasm_tramp_common
Lwasm_tramp_624:
    mov x16, #624
    b Lwasm_tramp_common
Lwasm_tramp_625:
    mov x16, #625
    b Lwasm_tramp_common
Lwasm_tramp_626:
    mov x16, #626
    b Lwasm_tramp_common
Lwasm_tramp_627:
    mov x16, #627
    b Lwasm_tramp_common
Lwasm_tramp_628:
    mov x16, #628
    b Lwasm_tramp_common
Lwasm_tramp_629:
    mov x16, #629
    b Lwasm_tramp_common
Lwasm_tramp_630:
    mov x16, #630
    b Lwasm_tramp_common
Lwasm_tramp_631:
    mov x16, #631
    b Lwasm_tramp_common
Lwasm_tramp_632:
    mov x16, #632
    b Lwasm_tramp_common
Lwasm_tramp_633:
    mov x16, #633
    b Lwasm_tramp_common
Lwasm_tramp_634:
    mov x16, #634
    b Lwasm_tramp_common
Lwasm_tramp_635:
    mov x16, #635
    b Lwasm_tramp_common
Lwasm_tramp_636:
    mov x16, #636
    b Lwasm_tramp_common
Lwasm_tramp_637:
    mov x16, #637
    b Lwasm_tramp_common
Lwasm_tramp_638:
    mov x16, #638
    b Lwasm_tramp_common
Lwasm_tramp_639:
    mov x16, #639
    b Lwasm_tramp_common
Lwasm_tramp_640:
    mov x16, #640
    b Lwasm_tramp_common
Lwasm_tramp_641:
    mov x16, #641
    b Lwasm_tramp_common
Lwasm_tramp_642:
    mov x16, #642
    b Lwasm_tramp_common
Lwasm_tramp_643:
    mov x16, #643
    b Lwasm_tramp_common
Lwasm_tramp_644:
    mov x16, #644
    b Lwasm_tramp_common
Lwasm_tramp_645:
    mov x16, #645
    b Lwasm_tramp_common
Lwasm_tramp_646:
    mov x16, #646
    b Lwasm_tramp_common
Lwasm_tramp_647:
    mov x16, #647
    b Lwasm_tramp_common
Lwasm_tramp_648:
    mov x16, #648
    b Lwasm_tramp_common
Lwasm_tramp_649:
    mov x16, #649
    b Lwasm_tramp_common
Lwasm_tramp_650:
    mov x16, #650
    b Lwasm_tramp_common
Lwasm_tramp_651:
    mov x16, #651
    b Lwasm_tramp_common
Lwasm_tramp_652:
    mov x16, #652
    b Lwasm_tramp_common
Lwasm_tramp_653:
    mov x16, #653
    b Lwasm_tramp_common
Lwasm_tramp_654:
    mov x16, #654
    b Lwasm_tramp_common
Lwasm_tramp_655:
    mov x16, #655
    b Lwasm_tramp_common
Lwasm_tramp_656:
    mov x16, #656
    b Lwasm_tramp_common
Lwasm_tramp_657:
    mov x16, #657
    b Lwasm_tramp_common
Lwasm_tramp_658:
    mov x16, #658
    b Lwasm_tramp_common
Lwasm_tramp_659:
    mov x16, #659
    b Lwasm_tramp_common
Lwasm_tramp_660:
    mov x16, #660
    b Lwasm_tramp_common
Lwasm_tramp_661:
    mov x16, #661
    b Lwasm_tramp_common
Lwasm_tramp_662:
    mov x16, #662
    b Lwasm_tramp_common
Lwasm_tramp_663:
    mov x16, #663
    b Lwasm_tramp_common
Lwasm_tramp_664:
    mov x16, #664
    b Lwasm_tramp_common
Lwasm_tramp_665:
    mov x16, #665
    b Lwasm_tramp_common
Lwasm_tramp_666:
    mov x16, #666
    b Lwasm_tramp_common
Lwasm_tramp_667:
    mov x16, #667
    b Lwasm_tramp_common
Lwasm_tramp_668:
    mov x16, #668
    b Lwasm_tramp_common
Lwasm_tramp_669:
    mov x16, #669
    b Lwasm_tramp_common
Lwasm_tramp_670:
    mov x16, #670
    b Lwasm_tramp_common
Lwasm_tramp_671:
    mov x16, #671
    b Lwasm_tramp_common
Lwasm_tramp_672:
    mov x16, #672
    b Lwasm_tramp_common
Lwasm_tramp_673:
    mov x16, #673
    b Lwasm_tramp_common
Lwasm_tramp_674:
    mov x16, #674
    b Lwasm_tramp_common
Lwasm_tramp_675:
    mov x16, #675
    b Lwasm_tramp_common
Lwasm_tramp_676:
    mov x16, #676
    b Lwasm_tramp_common
Lwasm_tramp_677:
    mov x16, #677
    b Lwasm_tramp_common
Lwasm_tramp_678:
    mov x16, #678
    b Lwasm_tramp_common
Lwasm_tramp_679:
    mov x16, #679
    b Lwasm_tramp_common
Lwasm_tramp_680:
    mov x16, #680
    b Lwasm_tramp_common
Lwasm_tramp_681:
    mov x16, #681
    b Lwasm_tramp_common
Lwasm_tramp_682:
    mov x16, #682
    b Lwasm_tramp_common
Lwasm_tramp_683:
    mov x16, #683
    b Lwasm_tramp_common
Lwasm_tramp_684:
    mov x16, #684
    b Lwasm_tramp_common
Lwasm_tramp_685:
    mov x16, #685
    b Lwasm_tramp_common
Lwasm_tramp_686:
    mov x16, #686
    b Lwasm_tramp_common
Lwasm_tramp_687:
    mov x16, #687
    b Lwasm_tramp_common
Lwasm_tramp_688:
    mov x16, #688
    b Lwasm_tramp_common
Lwasm_tramp_689:
    mov x16, #689
    b Lwasm_tramp_common
Lwasm_tramp_690:
    mov x16, #690
    b Lwasm_tramp_common
Lwasm_tramp_691:
    mov x16, #691
    b Lwasm_tramp_common
Lwasm_tramp_692:
    mov x16, #692
    b Lwasm_tramp_common
Lwasm_tramp_693:
    mov x16, #693
    b Lwasm_tramp_common
Lwasm_tramp_694:
    mov x16, #694
    b Lwasm_tramp_common
Lwasm_tramp_695:
    mov x16, #695
    b Lwasm_tramp_common
Lwasm_tramp_696:
    mov x16, #696
    b Lwasm_tramp_common
Lwasm_tramp_697:
    mov x16, #697
    b Lwasm_tramp_common
Lwasm_tramp_698:
    mov x16, #698
    b Lwasm_tramp_common
Lwasm_tramp_699:
    mov x16, #699
    b Lwasm_tramp_common
Lwasm_tramp_700:
    mov x16, #700
    b Lwasm_tramp_common
Lwasm_tramp_701:
    mov x16, #701
    b Lwasm_tramp_common
Lwasm_tramp_702:
    mov x16, #702
    b Lwasm_tramp_common
Lwasm_tramp_703:
    mov x16, #703
    b Lwasm_tramp_common
Lwasm_tramp_704:
    mov x16, #704
    b Lwasm_tramp_common
Lwasm_tramp_705:
    mov x16, #705
    b Lwasm_tramp_common
Lwasm_tramp_706:
    mov x16, #706
    b Lwasm_tramp_common
Lwasm_tramp_707:
    mov x16, #707
    b Lwasm_tramp_common
Lwasm_tramp_708:
    mov x16, #708
    b Lwasm_tramp_common
Lwasm_tramp_709:
    mov x16, #709
    b Lwasm_tramp_common
Lwasm_tramp_710:
    mov x16, #710
    b Lwasm_tramp_common
Lwasm_tramp_711:
    mov x16, #711
    b Lwasm_tramp_common
Lwasm_tramp_712:
    mov x16, #712
    b Lwasm_tramp_common
Lwasm_tramp_713:
    mov x16, #713
    b Lwasm_tramp_common
Lwasm_tramp_714:
    mov x16, #714
    b Lwasm_tramp_common
Lwasm_tramp_715:
    mov x16, #715
    b Lwasm_tramp_common
Lwasm_tramp_716:
    mov x16, #716
    b Lwasm_tramp_common
Lwasm_tramp_717:
    mov x16, #717
    b Lwasm_tramp_common
Lwasm_tramp_718:
    mov x16, #718
    b Lwasm_tramp_common
Lwasm_tramp_719:
    mov x16, #719
    b Lwasm_tramp_common
Lwasm_tramp_720:
    mov x16, #720
    b Lwasm_tramp_common
Lwasm_tramp_721:
    mov x16, #721
    b Lwasm_tramp_common
Lwasm_tramp_722:
    mov x16, #722
    b Lwasm_tramp_common
Lwasm_tramp_723:
    mov x16, #723
    b Lwasm_tramp_common
Lwasm_tramp_724:
    mov x16, #724
    b Lwasm_tramp_common
Lwasm_tramp_725:
    mov x16, #725
    b Lwasm_tramp_common
Lwasm_tramp_726:
    mov x16, #726
    b Lwasm_tramp_common
Lwasm_tramp_727:
    mov x16, #727
    b Lwasm_tramp_common
Lwasm_tramp_728:
    mov x16, #728
    b Lwasm_tramp_common
Lwasm_tramp_729:
    mov x16, #729
    b Lwasm_tramp_common
Lwasm_tramp_730:
    mov x16, #730
    b Lwasm_tramp_common
Lwasm_tramp_731:
    mov x16, #731
    b Lwasm_tramp_common
Lwasm_tramp_732:
    mov x16, #732
    b Lwasm_tramp_common
Lwasm_tramp_733:
    mov x16, #733
    b Lwasm_tramp_common
Lwasm_tramp_734:
    mov x16, #734
    b Lwasm_tramp_common
Lwasm_tramp_735:
    mov x16, #735
    b Lwasm_tramp_common
Lwasm_tramp_736:
    mov x16, #736
    b Lwasm_tramp_common
Lwasm_tramp_737:
    mov x16, #737
    b Lwasm_tramp_common
Lwasm_tramp_738:
    mov x16, #738
    b Lwasm_tramp_common
Lwasm_tramp_739:
    mov x16, #739
    b Lwasm_tramp_common
Lwasm_tramp_740:
    mov x16, #740
    b Lwasm_tramp_common
Lwasm_tramp_741:
    mov x16, #741
    b Lwasm_tramp_common
Lwasm_tramp_742:
    mov x16, #742
    b Lwasm_tramp_common
Lwasm_tramp_743:
    mov x16, #743
    b Lwasm_tramp_common
Lwasm_tramp_744:
    mov x16, #744
    b Lwasm_tramp_common
Lwasm_tramp_745:
    mov x16, #745
    b Lwasm_tramp_common
Lwasm_tramp_746:
    mov x16, #746
    b Lwasm_tramp_common
Lwasm_tramp_747:
    mov x16, #747
    b Lwasm_tramp_common
Lwasm_tramp_748:
    mov x16, #748
    b Lwasm_tramp_common
Lwasm_tramp_749:
    mov x16, #749
    b Lwasm_tramp_common
Lwasm_tramp_750:
    mov x16, #750
    b Lwasm_tramp_common
Lwasm_tramp_751:
    mov x16, #751
    b Lwasm_tramp_common
Lwasm_tramp_752:
    mov x16, #752
    b Lwasm_tramp_common
Lwasm_tramp_753:
    mov x16, #753
    b Lwasm_tramp_common
Lwasm_tramp_754:
    mov x16, #754
    b Lwasm_tramp_common
Lwasm_tramp_755:
    mov x16, #755
    b Lwasm_tramp_common
Lwasm_tramp_756:
    mov x16, #756
    b Lwasm_tramp_common
Lwasm_tramp_757:
    mov x16, #757
    b Lwasm_tramp_common
Lwasm_tramp_758:
    mov x16, #758
    b Lwasm_tramp_common
Lwasm_tramp_759:
    mov x16, #759
    b Lwasm_tramp_common
Lwasm_tramp_760:
    mov x16, #760
    b Lwasm_tramp_common
Lwasm_tramp_761:
    mov x16, #761
    b Lwasm_tramp_common
Lwasm_tramp_762:
    mov x16, #762
    b Lwasm_tramp_common
Lwasm_tramp_763:
    mov x16, #763
    b Lwasm_tramp_common
Lwasm_tramp_764:
    mov x16, #764
    b Lwasm_tramp_common
Lwasm_tramp_765:
    mov x16, #765
    b Lwasm_tramp_common
Lwasm_tramp_766:
    mov x16, #766
    b Lwasm_tramp_common
Lwasm_tramp_767:
    mov x16, #767
    b Lwasm_tramp_common
Lwasm_tramp_768:
    mov x16, #768
    b Lwasm_tramp_common
Lwasm_tramp_769:
    mov x16, #769
    b Lwasm_tramp_common
Lwasm_tramp_770:
    mov x16, #770
    b Lwasm_tramp_common
Lwasm_tramp_771:
    mov x16, #771
    b Lwasm_tramp_common
Lwasm_tramp_772:
    mov x16, #772
    b Lwasm_tramp_common
Lwasm_tramp_773:
    mov x16, #773
    b Lwasm_tramp_common
Lwasm_tramp_774:
    mov x16, #774
    b Lwasm_tramp_common
Lwasm_tramp_775:
    mov x16, #775
    b Lwasm_tramp_common
Lwasm_tramp_776:
    mov x16, #776
    b Lwasm_tramp_common
Lwasm_tramp_777:
    mov x16, #777
    b Lwasm_tramp_common
Lwasm_tramp_778:
    mov x16, #778
    b Lwasm_tramp_common
Lwasm_tramp_779:
    mov x16, #779
    b Lwasm_tramp_common
Lwasm_tramp_780:
    mov x16, #780
    b Lwasm_tramp_common
Lwasm_tramp_781:
    mov x16, #781
    b Lwasm_tramp_common
Lwasm_tramp_782:
    mov x16, #782
    b Lwasm_tramp_common
Lwasm_tramp_783:
    mov x16, #783
    b Lwasm_tramp_common
Lwasm_tramp_784:
    mov x16, #784
    b Lwasm_tramp_common
Lwasm_tramp_785:
    mov x16, #785
    b Lwasm_tramp_common
Lwasm_tramp_786:
    mov x16, #786
    b Lwasm_tramp_common
Lwasm_tramp_787:
    mov x16, #787
    b Lwasm_tramp_common
Lwasm_tramp_788:
    mov x16, #788
    b Lwasm_tramp_common
Lwasm_tramp_789:
    mov x16, #789
    b Lwasm_tramp_common
Lwasm_tramp_790:
    mov x16, #790
    b Lwasm_tramp_common
Lwasm_tramp_791:
    mov x16, #791
    b Lwasm_tramp_common
Lwasm_tramp_792:
    mov x16, #792
    b Lwasm_tramp_common
Lwasm_tramp_793:
    mov x16, #793
    b Lwasm_tramp_common
Lwasm_tramp_794:
    mov x16, #794
    b Lwasm_tramp_common
Lwasm_tramp_795:
    mov x16, #795
    b Lwasm_tramp_common
Lwasm_tramp_796:
    mov x16, #796
    b Lwasm_tramp_common
Lwasm_tramp_797:
    mov x16, #797
    b Lwasm_tramp_common
Lwasm_tramp_798:
    mov x16, #798
    b Lwasm_tramp_common
Lwasm_tramp_799:
    mov x16, #799
    b Lwasm_tramp_common
Lwasm_tramp_800:
    mov x16, #800
    b Lwasm_tramp_common
Lwasm_tramp_801:
    mov x16, #801
    b Lwasm_tramp_common
Lwasm_tramp_802:
    mov x16, #802
    b Lwasm_tramp_common
Lwasm_tramp_803:
    mov x16, #803
    b Lwasm_tramp_common
Lwasm_tramp_804:
    mov x16, #804
    b Lwasm_tramp_common
Lwasm_tramp_805:
    mov x16, #805
    b Lwasm_tramp_common
Lwasm_tramp_806:
    mov x16, #806
    b Lwasm_tramp_common
Lwasm_tramp_807:
    mov x16, #807
    b Lwasm_tramp_common
Lwasm_tramp_808:
    mov x16, #808
    b Lwasm_tramp_common
Lwasm_tramp_809:
    mov x16, #809
    b Lwasm_tramp_common
Lwasm_tramp_810:
    mov x16, #810
    b Lwasm_tramp_common
Lwasm_tramp_811:
    mov x16, #811
    b Lwasm_tramp_common
Lwasm_tramp_812:
    mov x16, #812
    b Lwasm_tramp_common
Lwasm_tramp_813:
    mov x16, #813
    b Lwasm_tramp_common
Lwasm_tramp_814:
    mov x16, #814
    b Lwasm_tramp_common
Lwasm_tramp_815:
    mov x16, #815
    b Lwasm_tramp_common
Lwasm_tramp_816:
    mov x16, #816
    b Lwasm_tramp_common
Lwasm_tramp_817:
    mov x16, #817
    b Lwasm_tramp_common
Lwasm_tramp_818:
    mov x16, #818
    b Lwasm_tramp_common
Lwasm_tramp_819:
    mov x16, #819
    b Lwasm_tramp_common
Lwasm_tramp_820:
    mov x16, #820
    b Lwasm_tramp_common
Lwasm_tramp_821:
    mov x16, #821
    b Lwasm_tramp_common
Lwasm_tramp_822:
    mov x16, #822
    b Lwasm_tramp_common
Lwasm_tramp_823:
    mov x16, #823
    b Lwasm_tramp_common
Lwasm_tramp_824:
    mov x16, #824
    b Lwasm_tramp_common
Lwasm_tramp_825:
    mov x16, #825
    b Lwasm_tramp_common
Lwasm_tramp_826:
    mov x16, #826
    b Lwasm_tramp_common
Lwasm_tramp_827:
    mov x16, #827
    b Lwasm_tramp_common
Lwasm_tramp_828:
    mov x16, #828
    b Lwasm_tramp_common
Lwasm_tramp_829:
    mov x16, #829
    b Lwasm_tramp_common
Lwasm_tramp_830:
    mov x16, #830
    b Lwasm_tramp_common
Lwasm_tramp_831:
    mov x16, #831
    b Lwasm_tramp_common
Lwasm_tramp_832:
    mov x16, #832
    b Lwasm_tramp_common
Lwasm_tramp_833:
    mov x16, #833
    b Lwasm_tramp_common
Lwasm_tramp_834:
    mov x16, #834
    b Lwasm_tramp_common
Lwasm_tramp_835:
    mov x16, #835
    b Lwasm_tramp_common
Lwasm_tramp_836:
    mov x16, #836
    b Lwasm_tramp_common
Lwasm_tramp_837:
    mov x16, #837
    b Lwasm_tramp_common
Lwasm_tramp_838:
    mov x16, #838
    b Lwasm_tramp_common
Lwasm_tramp_839:
    mov x16, #839
    b Lwasm_tramp_common
Lwasm_tramp_840:
    mov x16, #840
    b Lwasm_tramp_common
Lwasm_tramp_841:
    mov x16, #841
    b Lwasm_tramp_common
Lwasm_tramp_842:
    mov x16, #842
    b Lwasm_tramp_common
Lwasm_tramp_843:
    mov x16, #843
    b Lwasm_tramp_common
Lwasm_tramp_844:
    mov x16, #844
    b Lwasm_tramp_common
Lwasm_tramp_845:
    mov x16, #845
    b Lwasm_tramp_common
Lwasm_tramp_846:
    mov x16, #846
    b Lwasm_tramp_common
Lwasm_tramp_847:
    mov x16, #847
    b Lwasm_tramp_common
Lwasm_tramp_848:
    mov x16, #848
    b Lwasm_tramp_common
Lwasm_tramp_849:
    mov x16, #849
    b Lwasm_tramp_common
Lwasm_tramp_850:
    mov x16, #850
    b Lwasm_tramp_common
Lwasm_tramp_851:
    mov x16, #851
    b Lwasm_tramp_common
Lwasm_tramp_852:
    mov x16, #852
    b Lwasm_tramp_common
Lwasm_tramp_853:
    mov x16, #853
    b Lwasm_tramp_common
Lwasm_tramp_854:
    mov x16, #854
    b Lwasm_tramp_common
Lwasm_tramp_855:
    mov x16, #855
    b Lwasm_tramp_common
Lwasm_tramp_856:
    mov x16, #856
    b Lwasm_tramp_common
Lwasm_tramp_857:
    mov x16, #857
    b Lwasm_tramp_common
Lwasm_tramp_858:
    mov x16, #858
    b Lwasm_tramp_common
Lwasm_tramp_859:
    mov x16, #859
    b Lwasm_tramp_common
Lwasm_tramp_860:
    mov x16, #860
    b Lwasm_tramp_common
Lwasm_tramp_861:
    mov x16, #861
    b Lwasm_tramp_common
Lwasm_tramp_862:
    mov x16, #862
    b Lwasm_tramp_common
Lwasm_tramp_863:
    mov x16, #863
    b Lwasm_tramp_common
Lwasm_tramp_864:
    mov x16, #864
    b Lwasm_tramp_common
Lwasm_tramp_865:
    mov x16, #865
    b Lwasm_tramp_common
Lwasm_tramp_866:
    mov x16, #866
    b Lwasm_tramp_common
Lwasm_tramp_867:
    mov x16, #867
    b Lwasm_tramp_common
Lwasm_tramp_868:
    mov x16, #868
    b Lwasm_tramp_common
Lwasm_tramp_869:
    mov x16, #869
    b Lwasm_tramp_common
Lwasm_tramp_870:
    mov x16, #870
    b Lwasm_tramp_common
Lwasm_tramp_871:
    mov x16, #871
    b Lwasm_tramp_common
Lwasm_tramp_872:
    mov x16, #872
    b Lwasm_tramp_common
Lwasm_tramp_873:
    mov x16, #873
    b Lwasm_tramp_common
Lwasm_tramp_874:
    mov x16, #874
    b Lwasm_tramp_common
Lwasm_tramp_875:
    mov x16, #875
    b Lwasm_tramp_common
Lwasm_tramp_876:
    mov x16, #876
    b Lwasm_tramp_common
Lwasm_tramp_877:
    mov x16, #877
    b Lwasm_tramp_common
Lwasm_tramp_878:
    mov x16, #878
    b Lwasm_tramp_common
Lwasm_tramp_879:
    mov x16, #879
    b Lwasm_tramp_common
Lwasm_tramp_880:
    mov x16, #880
    b Lwasm_tramp_common
Lwasm_tramp_881:
    mov x16, #881
    b Lwasm_tramp_common
Lwasm_tramp_882:
    mov x16, #882
    b Lwasm_tramp_common
Lwasm_tramp_883:
    mov x16, #883
    b Lwasm_tramp_common
Lwasm_tramp_884:
    mov x16, #884
    b Lwasm_tramp_common
Lwasm_tramp_885:
    mov x16, #885
    b Lwasm_tramp_common
Lwasm_tramp_886:
    mov x16, #886
    b Lwasm_tramp_common
Lwasm_tramp_887:
    mov x16, #887
    b Lwasm_tramp_common
Lwasm_tramp_888:
    mov x16, #888
    b Lwasm_tramp_common
Lwasm_tramp_889:
    mov x16, #889
    b Lwasm_tramp_common
Lwasm_tramp_890:
    mov x16, #890
    b Lwasm_tramp_common
Lwasm_tramp_891:
    mov x16, #891
    b Lwasm_tramp_common
Lwasm_tramp_892:
    mov x16, #892
    b Lwasm_tramp_common
Lwasm_tramp_893:
    mov x16, #893
    b Lwasm_tramp_common
Lwasm_tramp_894:
    mov x16, #894
    b Lwasm_tramp_common
Lwasm_tramp_895:
    mov x16, #895
    b Lwasm_tramp_common
Lwasm_tramp_896:
    mov x16, #896
    b Lwasm_tramp_common
Lwasm_tramp_897:
    mov x16, #897
    b Lwasm_tramp_common
Lwasm_tramp_898:
    mov x16, #898
    b Lwasm_tramp_common
Lwasm_tramp_899:
    mov x16, #899
    b Lwasm_tramp_common
Lwasm_tramp_900:
    mov x16, #900
    b Lwasm_tramp_common
Lwasm_tramp_901:
    mov x16, #901
    b Lwasm_tramp_common
Lwasm_tramp_902:
    mov x16, #902
    b Lwasm_tramp_common
Lwasm_tramp_903:
    mov x16, #903
    b Lwasm_tramp_common
Lwasm_tramp_904:
    mov x16, #904
    b Lwasm_tramp_common
Lwasm_tramp_905:
    mov x16, #905
    b Lwasm_tramp_common
Lwasm_tramp_906:
    mov x16, #906
    b Lwasm_tramp_common
Lwasm_tramp_907:
    mov x16, #907
    b Lwasm_tramp_common
Lwasm_tramp_908:
    mov x16, #908
    b Lwasm_tramp_common
Lwasm_tramp_909:
    mov x16, #909
    b Lwasm_tramp_common
Lwasm_tramp_910:
    mov x16, #910
    b Lwasm_tramp_common
Lwasm_tramp_911:
    mov x16, #911
    b Lwasm_tramp_common
Lwasm_tramp_912:
    mov x16, #912
    b Lwasm_tramp_common
Lwasm_tramp_913:
    mov x16, #913
    b Lwasm_tramp_common
Lwasm_tramp_914:
    mov x16, #914
    b Lwasm_tramp_common
Lwasm_tramp_915:
    mov x16, #915
    b Lwasm_tramp_common
Lwasm_tramp_916:
    mov x16, #916
    b Lwasm_tramp_common
Lwasm_tramp_917:
    mov x16, #917
    b Lwasm_tramp_common
Lwasm_tramp_918:
    mov x16, #918
    b Lwasm_tramp_common
Lwasm_tramp_919:
    mov x16, #919
    b Lwasm_tramp_common
Lwasm_tramp_920:
    mov x16, #920
    b Lwasm_tramp_common
Lwasm_tramp_921:
    mov x16, #921
    b Lwasm_tramp_common
Lwasm_tramp_922:
    mov x16, #922
    b Lwasm_tramp_common
Lwasm_tramp_923:
    mov x16, #923
    b Lwasm_tramp_common
Lwasm_tramp_924:
    mov x16, #924
    b Lwasm_tramp_common
Lwasm_tramp_925:
    mov x16, #925
    b Lwasm_tramp_common
Lwasm_tramp_926:
    mov x16, #926
    b Lwasm_tramp_common
Lwasm_tramp_927:
    mov x16, #927
    b Lwasm_tramp_common
Lwasm_tramp_928:
    mov x16, #928
    b Lwasm_tramp_common
Lwasm_tramp_929:
    mov x16, #929
    b Lwasm_tramp_common
Lwasm_tramp_930:
    mov x16, #930
    b Lwasm_tramp_common
Lwasm_tramp_931:
    mov x16, #931
    b Lwasm_tramp_common
Lwasm_tramp_932:
    mov x16, #932
    b Lwasm_tramp_common
Lwasm_tramp_933:
    mov x16, #933
    b Lwasm_tramp_common
Lwasm_tramp_934:
    mov x16, #934
    b Lwasm_tramp_common
Lwasm_tramp_935:
    mov x16, #935
    b Lwasm_tramp_common
Lwasm_tramp_936:
    mov x16, #936
    b Lwasm_tramp_common
Lwasm_tramp_937:
    mov x16, #937
    b Lwasm_tramp_common
Lwasm_tramp_938:
    mov x16, #938
    b Lwasm_tramp_common
Lwasm_tramp_939:
    mov x16, #939
    b Lwasm_tramp_common
Lwasm_tramp_940:
    mov x16, #940
    b Lwasm_tramp_common
Lwasm_tramp_941:
    mov x16, #941
    b Lwasm_tramp_common
Lwasm_tramp_942:
    mov x16, #942
    b Lwasm_tramp_common
Lwasm_tramp_943:
    mov x16, #943
    b Lwasm_tramp_common
Lwasm_tramp_944:
    mov x16, #944
    b Lwasm_tramp_common
Lwasm_tramp_945:
    mov x16, #945
    b Lwasm_tramp_common
Lwasm_tramp_946:
    mov x16, #946
    b Lwasm_tramp_common
Lwasm_tramp_947:
    mov x16, #947
    b Lwasm_tramp_common
Lwasm_tramp_948:
    mov x16, #948
    b Lwasm_tramp_common
Lwasm_tramp_949:
    mov x16, #949
    b Lwasm_tramp_common
Lwasm_tramp_950:
    mov x16, #950
    b Lwasm_tramp_common
Lwasm_tramp_951:
    mov x16, #951
    b Lwasm_tramp_common
Lwasm_tramp_952:
    mov x16, #952
    b Lwasm_tramp_common
Lwasm_tramp_953:
    mov x16, #953
    b Lwasm_tramp_common
Lwasm_tramp_954:
    mov x16, #954
    b Lwasm_tramp_common
Lwasm_tramp_955:
    mov x16, #955
    b Lwasm_tramp_common
Lwasm_tramp_956:
    mov x16, #956
    b Lwasm_tramp_common
Lwasm_tramp_957:
    mov x16, #957
    b Lwasm_tramp_common
Lwasm_tramp_958:
    mov x16, #958
    b Lwasm_tramp_common
Lwasm_tramp_959:
    mov x16, #959
    b Lwasm_tramp_common
Lwasm_tramp_960:
    mov x16, #960
    b Lwasm_tramp_common
Lwasm_tramp_961:
    mov x16, #961
    b Lwasm_tramp_common
Lwasm_tramp_962:
    mov x16, #962
    b Lwasm_tramp_common
Lwasm_tramp_963:
    mov x16, #963
    b Lwasm_tramp_common
Lwasm_tramp_964:
    mov x16, #964
    b Lwasm_tramp_common
Lwasm_tramp_965:
    mov x16, #965
    b Lwasm_tramp_common
Lwasm_tramp_966:
    mov x16, #966
    b Lwasm_tramp_common
Lwasm_tramp_967:
    mov x16, #967
    b Lwasm_tramp_common
Lwasm_tramp_968:
    mov x16, #968
    b Lwasm_tramp_common
Lwasm_tramp_969:
    mov x16, #969
    b Lwasm_tramp_common
Lwasm_tramp_970:
    mov x16, #970
    b Lwasm_tramp_common
Lwasm_tramp_971:
    mov x16, #971
    b Lwasm_tramp_common
Lwasm_tramp_972:
    mov x16, #972
    b Lwasm_tramp_common
Lwasm_tramp_973:
    mov x16, #973
    b Lwasm_tramp_common
Lwasm_tramp_974:
    mov x16, #974
    b Lwasm_tramp_common
Lwasm_tramp_975:
    mov x16, #975
    b Lwasm_tramp_common
Lwasm_tramp_976:
    mov x16, #976
    b Lwasm_tramp_common
Lwasm_tramp_977:
    mov x16, #977
    b Lwasm_tramp_common
Lwasm_tramp_978:
    mov x16, #978
    b Lwasm_tramp_common
Lwasm_tramp_979:
    mov x16, #979
    b Lwasm_tramp_common
Lwasm_tramp_980:
    mov x16, #980
    b Lwasm_tramp_common
Lwasm_tramp_981:
    mov x16, #981
    b Lwasm_tramp_common
Lwasm_tramp_982:
    mov x16, #982
    b Lwasm_tramp_common
Lwasm_tramp_983:
    mov x16, #983
    b Lwasm_tramp_common
Lwasm_tramp_984:
    mov x16, #984
    b Lwasm_tramp_common
Lwasm_tramp_985:
    mov x16, #985
    b Lwasm_tramp_common
Lwasm_tramp_986:
    mov x16, #986
    b Lwasm_tramp_common
Lwasm_tramp_987:
    mov x16, #987
    b Lwasm_tramp_common
Lwasm_tramp_988:
    mov x16, #988
    b Lwasm_tramp_common
Lwasm_tramp_989:
    mov x16, #989
    b Lwasm_tramp_common
Lwasm_tramp_990:
    mov x16, #990
    b Lwasm_tramp_common
Lwasm_tramp_991:
    mov x16, #991
    b Lwasm_tramp_common
Lwasm_tramp_992:
    mov x16, #992
    b Lwasm_tramp_common
Lwasm_tramp_993:
    mov x16, #993
    b Lwasm_tramp_common
Lwasm_tramp_994:
    mov x16, #994
    b Lwasm_tramp_common
Lwasm_tramp_995:
    mov x16, #995
    b Lwasm_tramp_common
Lwasm_tramp_996:
    mov x16, #996
    b Lwasm_tramp_common
Lwasm_tramp_997:
    mov x16, #997
    b Lwasm_tramp_common
Lwasm_tramp_998:
    mov x16, #998
    b Lwasm_tramp_common
Lwasm_tramp_999:
    mov x16, #999
    b Lwasm_tramp_common
Lwasm_tramp_1000:
    mov x16, #1000
    b Lwasm_tramp_common
Lwasm_tramp_1001:
    mov x16, #1001
    b Lwasm_tramp_common
Lwasm_tramp_1002:
    mov x16, #1002
    b Lwasm_tramp_common
Lwasm_tramp_1003:
    mov x16, #1003
    b Lwasm_tramp_common
Lwasm_tramp_1004:
    mov x16, #1004
    b Lwasm_tramp_common
Lwasm_tramp_1005:
    mov x16, #1005
    b Lwasm_tramp_common
Lwasm_tramp_1006:
    mov x16, #1006
    b Lwasm_tramp_common
Lwasm_tramp_1007:
    mov x16, #1007
    b Lwasm_tramp_common
Lwasm_tramp_1008:
    mov x16, #1008
    b Lwasm_tramp_common
Lwasm_tramp_1009:
    mov x16, #1009
    b Lwasm_tramp_common
Lwasm_tramp_1010:
    mov x16, #1010
    b Lwasm_tramp_common
Lwasm_tramp_1011:
    mov x16, #1011
    b Lwasm_tramp_common
Lwasm_tramp_1012:
    mov x16, #1012
    b Lwasm_tramp_common
Lwasm_tramp_1013:
    mov x16, #1013
    b Lwasm_tramp_common
Lwasm_tramp_1014:
    mov x16, #1014
    b Lwasm_tramp_common
Lwasm_tramp_1015:
    mov x16, #1015
    b Lwasm_tramp_common
Lwasm_tramp_1016:
    mov x16, #1016
    b Lwasm_tramp_common
Lwasm_tramp_1017:
    mov x16, #1017
    b Lwasm_tramp_common
Lwasm_tramp_1018:
    mov x16, #1018
    b Lwasm_tramp_common
Lwasm_tramp_1019:
    mov x16, #1019
    b Lwasm_tramp_common
Lwasm_tramp_1020:
    mov x16, #1020
    b Lwasm_tramp_common
Lwasm_tramp_1021:
    mov x16, #1021
    b Lwasm_tramp_common
Lwasm_tramp_1022:
    mov x16, #1022
    b Lwasm_tramp_common
Lwasm_tramp_1023:
    mov x16, #1023
    b Lwasm_tramp_common

Lwasm_tramp_common:
    mov x5, x4
    mov x4, x3
    mov x3, x2
    mov x2, x1
    mov x1, x0
    mov x0, x16
    adrp x8, wasm_callback_fn@PAGE
    ldr x8, [x8, wasm_callback_fn@PAGEOFF]
    br x8

    .section __DATA,__data
    .p2align 3
wasm_callback_fn:
    .quad 0
wasm_slot_depth:
    .quad 0
wasm_abandoned_flag:
    .quad 0
    .p2align 4
wasm_slots:
    .skip 16384
