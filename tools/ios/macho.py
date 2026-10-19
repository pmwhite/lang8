#!/usr/bin/env python3
"""Look inside an arm64 Mach-O executable (an iOS app's), on any system:

  macho.py info EXE        its load commands, segments and sections
  macho.py imports EXE     each imported symbol and the library it is from
                           (from LC_DYLD_CHAINED_FIXUPS), a line each
  macho.py fixups EXE      every chained fixup: address, then rebase target
                           or bound import
  macho.py check EXE       checks the code signature's page hashes (and the
                           fixup chains' shape); exits 1 if one is wrong

The L8 compiler's Mach-O writer (src2/macho.l8) is checked with it, and the
symbol table of imports (tools/ios/imports.txt) was first made with it from
an executable Apple's linker made.
"""
import hashlib
import struct
import sys

LC_NAMES = {
    0x19: "LC_SEGMENT_64", 0x2: "LC_SYMTAB", 0xB: "LC_DYSYMTAB", 0xE: "LC_LOAD_DYLINKER",
    0xC: "LC_LOAD_DYLIB", 0x1B: "LC_UUID", 0x32: "LC_BUILD_VERSION", 0x2A: "LC_SOURCE_VERSION",
    0x80000028: "LC_MAIN", 0x2C: "LC_ENCRYPTION_INFO_64", 0x26: "LC_FUNCTION_STARTS",
    0x29: "LC_DATA_IN_CODE", 0x1D: "LC_CODE_SIGNATURE", 0x80000034: "LC_DYLD_CHAINED_FIXUPS",
    0x80000033: "LC_DYLD_EXPORTS_TRIE", 0x80000022: "LC_DYLD_INFO_ONLY",
}


def cstr(b, off):
    end = b.index(b"\0", off)
    return b[off:end].decode()


class MachO:
    def __init__(self, data):
        self.b = data
        magic, cpu, sub, ftype, ncmds, size, flags, _ = struct.unpack_from("<IiiIIIII", data, 0)
        assert magic == 0xFEEDFACF, "not a 64-bit Mach-O"
        self.cpu, self.sub, self.ftype, self.flags = cpu, sub, ftype, flags
        self.ncmds, self.sizeofcmds = ncmds, size
        self.cmds = []
        self.segments = []
        self.dylibs = []
        off = 32
        for _ in range(ncmds):
            cmd, cs = struct.unpack_from("<II", data, off)
            self.cmds.append((cmd, off, cs))
            if cmd == 0x19:
                name = data[off + 8:off + 24].rstrip(b"\0").decode()
                vm, vs, fo, fs, mx, ini, ns, fl = struct.unpack_from("<QQQQiiII", data, off + 24)
                secs = []
                for k in range(ns):
                    so = off + 72 + 80 * k
                    sn = data[so:so + 16].rstrip(b"\0").decode()
                    sg = data[so + 16:so + 32].rstrip(b"\0").decode()
                    addr, sz, sof, al, rel, nrel, sfl, r1, r2, r3 = struct.unpack_from(
                        "<QQIIIIIIII", data, so + 32)
                    secs.append(dict(name=sn, seg=sg, addr=addr, size=sz, off=sof, align=al,
                                     flags=sfl, r1=r1, r2=r2))
                self.segments.append(dict(name=name, vmaddr=vm, vmsize=vs, fileoff=fo,
                                          filesize=fs, maxprot=mx, initprot=ini, flags=fl,
                                          sections=secs))
            if cmd in (0xC, 0x80000018, 0x1F):
                noff, _, cur, compat = struct.unpack_from("<IIII", data, off + 8)
                self.dylibs.append((cstr(data, off + noff), cur, compat))
            off += cs

    def cmd(self, kind):
        for c, off, cs in self.cmds:
            if c == kind:
                return off, cs
        return None

    def seg_of_offset(self, off):
        for s in self.segments:
            if s["fileoff"] <= off < s["fileoff"] + s["filesize"]:
                return s
        return None

    def chained(self):
        """(imports, fixups): imports as (lib ordinal, weak, name); fixups as
        (vmaddr, 'rebase', target) or (vmaddr, 'bind', import index, addend)."""
        c = self.cmd(0x80000034)
        if c is None:
            return [], []
        dataoff, datasize = struct.unpack_from("<II", self.b, c[0] + 8)
        h = self.b[dataoff:dataoff + datasize]
        ver, starts_off, imp_off, sym_off, imp_count, imp_fmt, sym_fmt = struct.unpack_from(
            "<IIIIIII", h, 0)
        assert ver == 0, ver
        imports = []
        for i in range(imp_count):
            if imp_fmt == 1:
                v, = struct.unpack_from("<I", h, imp_off + 4 * i)
                ordinal = v & 0xFF
                if ordinal >= 0xF0:
                    ordinal -= 0x100
                weak = (v >> 8) & 1
                name_off = v >> 9
            else:
                raise SystemExit(f"imports format {imp_fmt} not read")
            imports.append((ordinal, weak, cstr(h, sym_off + name_off)))
        fixups = []
        seg_count, = struct.unpack_from("<I", h, starts_off)
        for si in range(seg_count):
            so, = struct.unpack_from("<I", h, starts_off + 4 + 4 * si)
            if so == 0:
                continue
            base = starts_off + so
            size, page_size, fmt, seg_offset, max_valid, page_count = struct.unpack_from(
                "<IHHQIH", h, base)
            seg = self.segments[si]
            for p in range(page_count):
                start, = struct.unpack_from("<H", h, base + 22 + 2 * p)
                if start == 0xFFFF:
                    continue
                assert not start & 0x8000, "multiple starts not read"
                off = seg["fileoff"] + p * page_size + start
                while True:
                    v, = struct.unpack_from("<Q", self.b, off)
                    addr = seg["vmaddr"] + off - seg["fileoff"]
                    if fmt in (2, 6):  # DYLD_CHAINED_PTR_64(_OFFSET)
                        bind = v >> 63
                        nxt = (v >> 51) & 0xFFF
                        if bind:
                            fixups.append((addr, "bind", v & 0xFFFFFF, (v >> 24) & 0xFF))
                        else:
                            target = v & 0xFFFFFFFFF
                            high8 = (v >> 36) & 0xFF
                            if fmt == 6:
                                target += 0x100000000 if False else 0
                            fixups.append((addr, "rebase", target | (high8 << 56)))
                        stride = 4
                    else:
                        raise SystemExit(f"pointer format {fmt} not read")
                    if nxt == 0:
                        break
                    off += nxt * stride
        return imports, fixups

    def header_info(self):
        c = self.cmd(0x80000034)
        if c is None:
            return None
        dataoff, datasize = struct.unpack_from("<II", self.b, c[0] + 8)
        h = self.b[dataoff:dataoff + datasize]
        out = dict(zip(["version", "starts", "imports", "symbols", "count", "imports_format",
                        "symbols_format"], struct.unpack_from("<IIIIIII", h, 0)))
        starts_off = out["starts"]
        seg_count, = struct.unpack_from("<I", h, starts_off)
        segs = []
        for si in range(seg_count):
            so, = struct.unpack_from("<I", h, starts_off + 4 + 4 * si)
            if so:
                size, page_size, fmt, seg_offset, max_valid, page_count = struct.unpack_from(
                    "<IHHQIH", h, starts_off + so)
                segs.append(dict(seg=self.segments[si]["name"], size=size, page_size=page_size,
                                 format=fmt, segment_offset=seg_offset, max_valid=max_valid,
                                 pages=page_count))
        out["segments"] = segs
        return out


def check_signature(m):
    """The code signature's CodeDirectory hashes, checked against the file."""
    c = m.cmd(0x1D)
    if c is None:
        return ["no LC_CODE_SIGNATURE"]
    dataoff, datasize = struct.unpack_from("<II", m.b, c[0] + 8)
    sb = m.b[dataoff:dataoff + datasize]
    magic, length, count = struct.unpack_from(">III", sb, 0)
    errors = []
    if magic != 0xFADE0CC0:
        return [f"superblob magic {magic:#x}"]
    for i in range(count):
        typ, off = struct.unpack_from(">II", sb, 12 + 8 * i)
        mg, = struct.unpack_from(">I", sb, off)
        if mg != 0xFADE0C02:
            continue
        (ver, flags, hash_off, ident_off, nspecial, ncode, limit, hsize, htype, platform,
         pshift) = struct.unpack_from(">IIIIIIIBBBB", sb, off + 8)
        page = 1 << pshift
        for k in range(ncode):
            start = k * page
            got = hashlib.sha256(m.b[start:min(start + page, limit)]).digest()
            want = sb[off + hash_off + k * hsize:off + hash_off + (k + 1) * hsize]
            if got[:hsize] != want:
                errors.append(f"page {k} hash differs")
        if limit != dataoff:
            errors.append(f"code limit {limit} is not the signature's offset {dataoff}")
        ident = cstr(sb, off + ident_off)
        print(f"code directory: version {ver:#x} flags {flags:#x} ident {ident} pages {ncode} "
              f"special {nspecial} limit {limit}")
    return errors


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    what, path = sys.argv[1:]
    m = MachO(open(path, "rb").read())
    if what == "info":
        print(f"cpu {m.cpu:#x} sub {m.sub:#x} type {m.ftype} flags {m.flags:#x} "
              f"ncmds {m.ncmds} sizeofcmds {m.sizeofcmds}")
        for c, off, cs in m.cmds:
            print(f"{LC_NAMES.get(c, hex(c))} size {cs}")
        for s in m.segments:
            print(f"segment {s['name']} vm {s['vmaddr']:#x}+{s['vmsize']:#x} file "
                  f"{s['fileoff']:#x}+{s['filesize']:#x} prot {s['maxprot']}/{s['initprot']} "
                  f"flags {s['flags']:#x}")
            for x in s["sections"]:
                print(f"  {x['seg']},{x['name']} {x['addr']:#x}+{x['size']:#x} off {x['off']:#x} "
                      f"align {x['align']} flags {x['flags']:#x} r1 {x['r1']} r2 {x['r2']}")
        for d, cur, compat in m.dylibs:
            print(f"dylib {d} {cur >> 16}.{(cur >> 8) & 255}.{cur & 255} "
                  f"{compat >> 16}.{(compat >> 8) & 255}.{compat & 255}")
        print("chained fixups", m.header_info())
    elif what == "imports":
        imports, _ = m.chained()
        for ordinal, weak, name in imports:
            lib = m.dylibs[ordinal - 1][0] if ordinal > 0 else f"special {ordinal}"
            print(f"{name} {lib}" + (" weak" if weak else ""))
    elif what == "fixups":
        imports, fixups = m.chained()
        for f in fixups:
            if f[1] == "bind":
                print(f"{f[0]:#x} bind {imports[f[2]][2]} +{f[3]}")
            else:
                print(f"{f[0]:#x} rebase {f[2]:#x}")
    elif what == "check":
        errors = check_signature(m)
        imports, fixups = m.chained()
        print(f"{len(imports)} imports, {len(fixups)} fixups")
        for e in errors:
            print("error:", e)
        sys.exit(1 if errors else 0)
    else:
        print(__doc__)
        sys.exit(2)


if __name__ == "__main__":
    main()
