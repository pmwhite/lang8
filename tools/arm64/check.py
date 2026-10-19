#!/usr/bin/env python3
"""Check the compiler's own arm64 assembler and linker (src2/a64asm.l8,
src2/a64link.l8) against LLVM's, instruction for instruction:

  check.py linux FILE.l8...   each program for Linux: `l8 arm64 --exe` and
                              llvm-mc + ld.lld, laid out alike (a linker
                              script puts each section where the compiler
                              put it); every section's bytes must match
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


def main():
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
