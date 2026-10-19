#!/usr/bin/env python3
"""Check the compiler's own arm64 assembler and linker (src2/a64asm.l8,
src2/a64link.l8) against LLVM's, instruction for instruction:

  check.py linux FILE.l8...   each program for Linux: `l8 arm64 --exe` and
                              llvm-mc + ld.lld, laid out alike (a linker
                              script puts each section where the compiler
                              put it); every section's bytes must match
  check.py fuzz [N [SEED]]    N random instructions of the kinds the
                              compiler and runtimes write (immediates of
                              every size, logical immediates, offsets...),
                              assembled by both (`l8 arm64 --asm`); the
                              words must match
  check.py ios FILE.l8...     each program for iOS: every instruction's
                              encoding (llvm-mc -show-encoding, the bits it
                              knows before relocation) must match the
                              compiler's Mach-O's __text, and every
                              relocated field must reach its symbol: a
                              label's address, or an import's stub or GOT
                              slot bound to that import (macho.py reads the
                              fixups)

The compiler is ./l8c3 unless $L8; llvm-mc, ld.lld from $LLVM_BIN (default
/usr/lib/llvm-14/bin, and the lld unpacked beside qemu, see
tools/arm64/linux.sh). Exits 1 on a difference, printing the first few.
"""
import os
import re
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOP = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(TOP, "tools", "ios"))
import macho  # noqa: E402

L8 = os.environ.get("L8", os.path.join(TOP, "l8c3"))
LLVM = os.environ.get("LLVM_BIN", "/usr/lib/llvm-14/bin")
LLD = os.environ.get("L8_ARM64_LD", "/tmp/a64tools/usr/lib/llvm-14/bin/ld.lld")


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, **kw)
    if r.returncode != 0:
        sys.stderr.write(r.stderr.decode(errors="replace"))
        raise SystemExit(f"failed: {' '.join(cmd)}")
    return r


def elf_sections(path):
    b = open(path, "rb").read()
    shoff, = struct.unpack_from("<Q", b, 40)
    shnum, shstrndx = struct.unpack_from("<HH", b, 60)
    hdrs = [struct.unpack_from("<IIQQQQIIQQ", b, shoff + 64 * i) for i in range(shnum)]
    names = hdrs[shstrndx]
    out = {}
    for h in hdrs:
        start = names[4] + h[0]
        name = b[start:b.index(b"\0", start)].decode()
        data = b"" if h[1] == 8 else b[h[4]:h[4] + h[5]]
        out[name] = dict(addr=h[3], size=h[5], data=data, type=h[1])
    return out


def check_linux(src, tmp):
    s = os.path.join(tmp, "a.s")
    mine = os.path.join(tmp, "mine")
    run([L8, "arm64", "--target", "linux", src, "-o", s])
    run([L8, "arm64", "--target", "linux", "--exe", src, "-o", mine])
    secs = elf_sections(mine)
    o = os.path.join(tmp, "a.o")
    run([os.path.join(LLVM, "llvm-mc"), "-triple=aarch64-linux-gnu", "-filetype=obj", s, "-o", o])
    script = os.path.join(tmp, "a.ld")
    with open(script, "w") as f:
        f.write("SECTIONS {\n")
        for name in (".text", ".rodata", ".data", ".bss"):
            f.write(f"  . = {secs[name]['addr']:#x}; {name} : {{ *({name}) }}\n")
        f.write("}\n")
    theirs = os.path.join(tmp, "theirs")
    env = dict(os.environ)
    lib = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(LLD))), "x86_64-linux-gnu")
    env["LD_LIBRARY_PATH"] = lib + ":" + os.path.join(os.path.dirname(os.path.dirname(LLD)), "lib")
    run([LLD, "-static", "--no-relax", "--warn-unresolved-symbols", "-T", script, o, "-o", theirs], env=env)
    ref = elf_sections(theirs)
    bad = 0
    for name in (".text", ".rodata", ".data"):
        a, b = secs[name], ref.get(name, dict(addr=0, size=0, data=b""))
        if a["size"] != b["size"] or a["data"] != b["data"]:
            bad += 1
            print(f"{src}: {name} differs ({a['size']} bytes, LLVM's {b['size']})")
            for k in range(0, min(len(a["data"]), len(b["data"])), 4):
                if a["data"][k:k + 4] != b["data"][k:k + 4]:
                    print(f"  first at {a['addr'] + k:#x}: {a['data'][k:k + 4].hex()} "
                          f"LLVM {b['data'][k:k + 4].hex()}")
                    break
    if secs[".bss"]["size"] != ref[".bss"]["size"]:
        bad += 1
        print(f"{src}: .bss size {secs['.bss']['size']}, LLVM's {ref['.bss']['size']}")
    return bad


ENC = re.compile(r"encoding: \[([^\]]*)\]")


def mc_encodings(s):
    """Each instruction's (known value, mask of known bits, source text),
    in order, for the text sections; and the text's sections in order."""
    r = run([os.path.join(LLVM, "llvm-mc"), "-triple=arm64-apple-ios16.0", "-show-encoding", s])
    out = []
    section = "__text"
    for line in r.stdout.decode().split("\n"):
        t = line.strip()
        if t.startswith(".section"):
            section = t.split(",")[1].strip() if "," in t else t
            continue
        m = ENC.search(line)
        if not m:
            continue
        val = 0
        mask = 0
        for i, byte in enumerate(m.group(1).split(",")):
            byte = byte.strip()
            if "'" in byte:
                # (0xNN'A': a byte a fixup also fills, not checked here.)
                continue
            if byte.startswith("0x"):
                val |= int(byte, 16) << (8 * i)
                mask |= 0xFF << (8 * i)
            elif byte.startswith("0b"):
                bits = byte[2:]
                for j, ch in enumerate(reversed(bits)):
                    if ch in "01":
                        mask |= 1 << (8 * i + j)
                        val |= int(ch) << (8 * i + j)
            # (A: bits a fixup fills.)
        if section == "__text":
            out.append((val, mask, line.split("//")[0].split(";")[0].strip()))
    return out


def check_ios(src, tmp):
    s = os.path.join(tmp, "a.s")
    exe = os.path.join(tmp, "app")
    run([L8, "arm64", "--target", "ios", src, "-o", s])
    imports = os.path.join(TOP, "tools", "ios", "imports.txt")
    cmd = [L8, "arm64", "--target", "ios-sim", "--exe", src, "-o", exe]
    if os.path.exists(imports):
        cmd[5:5] = ["--imports", imports]
    run(cmd)
    m = macho.MachO(open(exe, "rb").read())
    text = None
    stubs = None
    for seg in m.segments:
        for x in seg["sections"]:
            if x["name"] == "__text":
                text = x
            if x["name"] == "__stubs":
                stubs = x
    code = m.b[text["off"]:text["off"] + text["size"]]
    words = struct.unpack_from(f"<{len(code) // 4}I", code)
    encs = mc_encodings(s)
    bad = 0
    if len(encs) != len(words) - words.count(0xD503201F) + sum(
            1 for e in encs if e[0] == 0xD503201F):
        # (Alignment nops are in the code, not among llvm-mc's encodings.)
        pass
    # Walk both: skip nops in the code that llvm-mc did not list.
    k = 0
    for val, mask, text_line in encs:
        while k < len(words) and words[k] == 0xD503201F and val != 0xD503201F:
            k += 1
        if k >= len(words):
            print(f"{src}: the code ends before {text_line}")
            return bad + 1
        if words[k] & mask != val:
            bad += 1
            if bad <= 10:
                print(f"{src}: {text_line}: {words[k]:08x}, LLVM {val:08x} (mask {mask:08x})")
        k += 1
    # The relocated fields, decoded, against the symbols.
    bad += check_targets(src, s, m, text, stubs, words)
    return bad


def sym_addresses(m):
    """Defined symbols' addresses from the symbol table."""
    c = m.cmd(0x2)
    symoff, nsyms, stroff, strsize = struct.unpack_from("<IIII", m.b, c[0] + 8)
    out = {}
    for i in range(nsyms):
        strx, typ, sect, desc, value = struct.unpack_from("<IBBHQ", m.b, symoff + 16 * i)
        name = macho.cstr(m.b, stroff + strx)
        if typ & 0xE == 0xE:
            out[name] = value
    return out


def sext(v, bits):
    return v - (1 << bits) if v & (1 << (bits - 1)) else v


def check_targets(src, s, m, text, stubs, words):
    """Each instruction naming a symbol in the source (an adrp, a branch, a
    page offset) must reach it: compare with the symbol's address."""
    addrs = sym_addresses(m)
    imports, fixups = m.chained()
    got_binds = {f[0]: imports[f[2]][2] for f in fixups if f[1] == "bind"}

    def stub_target(addr):
        k = (addr - stubs["addr"]) // 4
        off = stubs["off"] + 4 * k
        w0, w1 = struct.unpack_from("<II", m.b, off)
        page = sext(((w0 >> 29) & 3) | (((w0 >> 5) & 0x7FFFF) << 2), 21)
        slot = ((addr & ~4095) + (page << 12)) + ((w1 >> 10) & 0xFFF) * 8
        return got_binds.get(slot)

    bad = 0
    checked = 0
    pc = text["addr"]
    lines = [ln.split("//")[0].strip() for ln in open(s)]
    k = 0
    insn_re = re.compile(r"^(?:[\w.$]+:\s*)*([a-z][\w.]*)\s*(.*)$")
    section = "__text"
    page_of = {}
    for ln in lines:
        if not ln:
            continue
        if ln.startswith(".section"):
            section = ln.split(",")[1].strip()
            continue
        if section != "__text":
            continue
        mm = insn_re.match(ln)
        if not mm or ln.startswith("."):
            if ln.startswith(".p2align"):
                n = 1 << int(ln.split()[1])
                while (pc + 4 * k - text["addr"]) % n:
                    k += 1
            continue
        op, args = mm.group(1), mm.group(2)
        w = words[k]
        here = text["addr"] + 4 * k
        k += 1
        sym = re.search(r"([A-Za-z_.$][\w.$]*)@(PAGE|PAGEOFF|GOTPAGE|GOTPAGEOFF)\b", args)
        if op in ("b", "bl") and re.fullmatch(r"_[\w.$]+", args.strip()):
            name = args.strip()
            target = here + sext(w & 0x3FFFFFF, 26) * 4
            checked += 1
            if name in addrs:
                ok = target == addrs[name]
            else:
                ok = stub_target(target) == name
            if not ok:
                bad += 1
                if bad <= 10:
                    print(f"{src}: {ln}: reaches {target:#x}")
        elif op == "adrp" and sym:
            page = sext(((w >> 29) & 3) | (((w >> 5) & 0x7FFFF) << 2), 21)
            page_of[(w & 31)] = ((here & ~4095) + (page << 12), sym.group(1), sym.group(2))
        elif sym and sym.group(2) in ("PAGEOFF", "GOTPAGEOFF"):
            base_reg = int(re.search(r"x(\d+)", args.split(",")[1]).group(1))
            got = page_of.get(base_reg)
            lo = (w >> 10) & 0xFFF
            if op in ("ldr", "str"):
                lo *= 8 if args.strip().startswith("x") or args.strip().startswith("d") else 4
            if got is None or got[1] != sym.group(1):
                continue
            addr = got[0] + lo
            name = sym.group(1)
            checked += 1
            if sym.group(2) == "GOTPAGEOFF":
                ok = got_binds.get(addr) == name
            else:
                ok = addrs.get(name) == addr
            if not ok and name in addrs or sym.group(2) == "GOTPAGEOFF" and not ok:
                bad += 1
                if bad <= 10:
                    print(f"{src}: {ln}: reaches {addr:#x}, {name} is at "
                          f"{addrs.get(name, 0):#x}")
    print(f"{src}: {checked} symbol references checked")
    return bad


def elf_text_of_object(path):
    secs = elf_sections(path)
    return secs[".text"]["data"]


def fuzz_lines(n, seed):
    import random
    rnd = random.Random(seed)
    lines = []

    def x():
        return f"x{rnd.randrange(0, 31)}"

    def w():
        return f"w{rnd.randrange(0, 31)}"

    def reg(wide):
        return x() if wide else w()

    def imm64():
        k = rnd.randrange(6)
        if k == 0:
            return rnd.randrange(0, 65536) << (16 * rnd.randrange(4))
        if k == 1:
            return ~(rnd.randrange(0, 65536) << (16 * rnd.randrange(4)))
        if k == 2:
            return rnd.randrange(-300, 300)
        size = rnd.choice([2, 4, 8, 16, 32, 64])
        ones = rnd.randrange(1, size)
        elt = ((1 << ones) - 1)
        r = rnd.randrange(size)
        elt = ((elt >> r) | (elt << (size - r))) & ((1 << size) - 1)
        v = 0
        for i in range(64 // size):
            v |= elt << (i * size)
        return v - (1 << 64) if v >> 63 else v

    def logical_ok(v, wide):
        width = 64 if wide else 32
        mask = (1 << width) - 1
        v &= mask
        if v in (0, mask):
            return False
        for size in (2, 4, 8, 16, 32, 64):
            if size > width:
                break
            elt = v & ((1 << size) - 1)
            rep = 0
            for i in range(width // size):
                rep |= elt << (i * size)
            if rep != v:
                continue
            for r in range(size):
                rot = ((elt << r) | (elt >> (size - r))) & ((1 << size) - 1)
                ones = bin(rot).count("1")
                if rot == (1 << ones) - 1:
                    return True
            return False
        return False

    def mov_ok(v, wide):
        width = 64 if wide else 32
        mask = (1 << width) - 1
        u = v & mask
        for k in range(width // 16):
            if u & ~(0xFFFF << (16 * k)) & mask == 0 or (~u & mask) & ~(0xFFFF << (16 * k)) == 0:
                return True
        return logical_ok(v, wide)

    for _ in range(n):
        k = rnd.randrange(22)
        wide = rnd.random() < 0.7
        if k == 0:
            v = imm64() if wide else imm64() & 0xFFFFFFFF
            if mov_ok(v, wide):
                lines.append(f"mov {reg(wide)}, #{v}")
        elif k == 1:
            v = imm64()
            op = rnd.choice(["and", "orr", "eor", "ands"])
            if logical_ok(v, wide):
                vv = v if wide else (v & 0xFFFFFFFF)
                lines.append(f"{op} {reg(wide)}, {reg(wide)}, #{vv}")
                lines.append(f"tst {reg(wide)}, #{vv}")
        elif k == 2:
            op = rnd.choice(["add", "sub", "adds", "subs"])
            v = rnd.randrange(0, 4096)
            sh = rnd.choice(["", ", lsl #12"])
            lines.append(f"{op} {reg(wide)}, {reg(wide)}, #{v}{sh}")
            lines.append(f"cmp {reg(wide)}, #{rnd.randrange(0, 4096)}")
            lines.append(f"cmn {reg(wide)}, #{rnd.randrange(0, 4096)}")
        elif k == 3:
            op = rnd.choice(["add", "sub", "adds", "subs", "and", "orr", "eor", "ands", "bic", "orn"])
            sh = rnd.choice(["", f", lsl #{rnd.randrange(64 if wide else 32)}",
                             f", lsr #{rnd.randrange(64 if wide else 32)}",
                             f", asr #{rnd.randrange(64 if wide else 32)}"])
            lines.append(f"{op} {reg(wide)}, {reg(wide)}, {reg(wide)}{sh}")
        elif k == 4:
            size = rnd.choice([0, 1, 2, 3])
            names = {0: ("ldrb", "strb", "w"), 1: ("ldrh", "strh", "w"), 2: ("ldr", "str", "w"),
                     3: ("ldr", "str", "x")}
            ld, st, r = names[size]
            off = rnd.choice([rnd.randrange(0, 4096) << size, rnd.randrange(-256, 256)])
            op = ld if rnd.random() < 0.5 else st
            un = off < 0 or off % (1 << size) or off >> size >= 4096
            if un:
                op = op.replace("ldr", "ldur").replace("str", "stur")
            lines.append(f"{op} {r}{rnd.randrange(31)}, [{x()}, #{off}]")
        elif k == 5:
            r = rnd.choice(["x", "w"])
            off = rnd.randrange(-256, 256)
            op = rnd.choice(["ldr", "str", "ldrb", "strb"])
            rr = "w" if op.endswith("b") else r
            # (A written-back base other than the data register.)
            lines.append(f"{op} {rr}{rnd.randrange(20)}, [x{rnd.randrange(20, 31)}, #{off}]!")
            lines.append(f"{op} {rr}{rnd.randrange(20)}, [x{rnd.randrange(20, 31)}], #{off}")
        elif k == 6:
            op = rnd.choice(["ldr", "str", "ldrb", "strb", "ldrsw", "ldrh", "strh"])
            r = "w" if op in ("ldrb", "strb", "ldrh", "strh") else rnd.choice(["x", "w"]) if op in ("ldr", "str") else "x"
            size = {"ldrb": 0, "strb": 0, "ldrh": 1, "strh": 1, "ldrsw": 2}.get(op, 3 if r == "x" else 2)
            sh = rnd.choice(["", f", lsl #{size}"]) if size else ""
            lines.append(f"{op} {r}{rnd.randrange(31)}, [{x()}, {x()}{sh}]")
        elif k == 7:
            fr = rnd.choice(["x", "d", "w", "s"])
            scale = 3 if fr in "xd" else 2
            op = rnd.choice(["ldp", "stp"])
            off = rnd.randrange(-64, 64) << scale
            form = rnd.choice([f"[x{rnd.randrange(20, 31)}, #{off}]", f"[x{rnd.randrange(20, 31)}, #{off}]!",
                               f"[x{rnd.randrange(20, 31)}], #{off}", "[sp]", f"[sp, #{off}]!"])
            # (Two different registers, neither the base.)
            t1 = rnd.randrange(10)
            lines.append(f"{op} {fr}{t1}, {fr}{t1 + 1 + rnd.randrange(9)}, {form}")
        elif k == 8:
            d = rnd.choice(["d", "s"])
            op = rnd.choice(["fadd", "fsub", "fmul", "fdiv"])
            lines.append(f"{op} {d}{rnd.randrange(32)}, {d}{rnd.randrange(32)}, {d}{rnd.randrange(32)}")
            op = rnd.choice(["fsqrt", "fabs", "fneg", "frintm", "fmov", "frintz"])
            lines.append(f"{op} {d}{rnd.randrange(32)}, {d}{rnd.randrange(32)}")
            lines.append(f"fcmp {d}{rnd.randrange(32)}, {d}{rnd.randrange(32)}")
        elif k == 9:
            g = rnd.choice(["x", "w"])
            d = rnd.choice(["d", "s"])
            lines.append(f"scvtf {d}{rnd.randrange(32)}, {g}{rnd.randrange(31)}")
            lines.append(f"fcvtzs {g}{rnd.randrange(31)}, {d}{rnd.randrange(32)}")
            lines.append(f"fcvt d{rnd.randrange(32)}, s{rnd.randrange(32)}")
            lines.append(f"fcvt s{rnd.randrange(32)}, d{rnd.randrange(32)}")
            lines.append(f"fmov d{rnd.randrange(32)}, x{rnd.randrange(31)}")
            lines.append(f"fmov x{rnd.randrange(31)}, d{rnd.randrange(32)}")
            lines.append(f"fmov s{rnd.randrange(32)}, w{rnd.randrange(31)}")
            lines.append(f"fmov w{rnd.randrange(31)}, s{rnd.randrange(32)}")
        elif k == 10:
            size = 64 if wide else 32
            op = rnd.choice(["lsl", "lsr", "asr"])
            lines.append(f"{op} {reg(wide)}, {reg(wide)}, #{rnd.randrange(size)}")
            lines.append(f"{op} {reg(wide)}, {reg(wide)}, {reg(wide)}")
        elif k == 11:
            op = rnd.choice(["mul", "sdiv", "udiv"])
            lines.append(f"{op} {reg(wide)}, {reg(wide)}, {reg(wide)}")
            op = rnd.choice(["madd", "msub"])
            lines.append(f"{op} {reg(wide)}, {reg(wide)}, {reg(wide)}, {reg(wide)}")
        elif k == 12:
            cond = rnd.choice(["eq", "ne", "hs", "lo", "mi", "pl", "hi", "ls", "ge", "lt", "gt", "le"])
            lines.append(f"cset {reg(wide)}, {cond}")
            lines.append(f"csel {reg(wide)}, {reg(wide)}, {reg(wide)}, {cond}")
        elif k == 13:
            lines.append(f"mov {x()}, sp")
            lines.append(f"mov sp, {x()}")
            lines.append(f"mov {reg(wide)}, {reg(wide)}")
            lines.append(f"add sp, sp, #{rnd.randrange(4096)}")
            lines.append(f"sub sp, sp, #{rnd.randrange(4096)}")
            v = -(16 << rnd.randrange(8))
            lines.append(f"and sp, {x()}, #{v}")
        elif k == 14:
            hw = rnd.randrange(4 if wide else 2)
            op = rnd.choice(["movz", "movn", "movk"])
            sh = f", lsl #{16 * hw}" if hw or rnd.random() < 0.3 else ""
            lines.append(f"{op} {reg(wide)}, #{rnd.randrange(65536)}{sh}")
        elif k == 15:
            lines.append(f"sxtw {x()}, {w()}")
            lines.append(f"neg {reg(wide)}, {reg(wide)}")
            lines.append(f"mvn {reg(wide)}, {reg(wide)}")
        elif k == 16:
            lines.append(f"br {x()}")
            lines.append(f"blr {x()}")
            lines.append("ret")
            lines.append(f"ret {x()}")
        elif k == 17:
            lines.append(f"add {x()}, sp, {x()}")
            lines.append(f"sub sp, sp, {x()}")
            lines.append(f"cmp sp, {x()}")
        elif k == 18:
            r = rnd.choice(["d", "s"])
            scale = 3 if r == "d" else 2
            off = rnd.randrange(0, 4096) << scale
            op = rnd.choice(["ldr", "str"])
            lines.append(f"{op} {r}{rnd.randrange(32)}, [{x()}, #{off}]")
            op = rnd.choice(["ldur", "stur"])
            lines.append(f"{op} {r}{rnd.randrange(32)}, [{x()}, #{rnd.randrange(-256, 256)}]")
        elif k == 19:
            lines.append(f"svc #{rnd.randrange(65536)}")
            lines.append("mrs x3, cntvct_el0")
            lines.append("nop")
        elif k == 20:
            lines.append(f"strb wzr, [{x()}, {x()}]")
            lines.append(f"str xzr, [{x()}, #{rnd.randrange(0, 4096) * 8}]")
            lines.append(f"cmp {reg(wide)}, {reg(wide)}")
            lines.append(f"tst {reg(wide)}, {reg(wide)}")
        else:
            lines.append(f"ldrsb {reg(wide)}, [{x()}]")
            lines.append(f"ldrsh {reg(wide)}, [{x()}, #{rnd.randrange(0, 4096) * 2}]")
            lines.append(f"uxtb {w()}, {w()}")
            lines.append(f"uxth {w()}, {w()}")
            lines.append(f"sxtb {reg(wide)}, {w()}")
            lines.append(f"sxth {reg(wide)}, {w()}")
    return lines


def check_fuzz(n, seed, tmp):
    lines = fuzz_lines(n, seed)
    s = os.path.join(tmp, "f.s")
    with open(s, "w") as f:
        f.write(".section .text\n.globl _start\n_start:\n")
        for ln in lines:
            f.write("    " + ln + "\n")
    o = os.path.join(tmp, "f.o")
    run([os.path.join(LLVM, "llvm-mc"), "-triple=aarch64-linux-gnu", "-filetype=obj", s, "-o", o])
    mine = os.path.join(tmp, "f")
    run([L8, "arm64", "--target", "linux", "--exe", "--asm", s, "-o", mine])
    a = elf_sections(mine)[".text"]["data"]
    b = elf_text_of_object(o)
    bad = 0
    # (Each line is one instruction.)
    for i, ln in enumerate(lines):
        x, y = a[4 * i:4 * i + 4], b[4 * i:4 * i + 4]
        if x != y:
            bad += 1
            if bad <= 20:
                print(f"fuzz: {ln}: {x.hex()} LLVM {y.hex()}")
    if len(a) != len(b):
        print(f"fuzz: {len(a)} bytes, LLVM's {len(b)}")
        bad += 1
    print(f"fuzz: {len(lines)} instructions, seed {seed}")
    return bad


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "fuzz":
        n = int(sys.argv[2]) if len(sys.argv) > 2 else 20000
        seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as tmp:
            sys.exit(1 if check_fuzz(n, seed, tmp) else 0)
    if len(sys.argv) < 3 or sys.argv[1] not in ("linux", "ios"):
        print(__doc__)
        sys.exit(2)
    bad = 0
    for src in sys.argv[2:]:
        with tempfile.TemporaryDirectory(dir=os.environ.get("TMPDIR")) as tmp:
            n = check_linux(src, tmp) if sys.argv[1] == "linux" else check_ios(src, tmp)
            print(f"{src}: {'ok' if n == 0 else f'{n} differences'}")
            bad += n
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
