#!/usr/bin/env python3
"""Build experimental verifier kernels without changing the installed compiler.

Linux x86-64; requires cc (GCC), objcopy and readelf. From the repository root:
  python3 tools/verifier_kernel/build.py --output .build/verifier-kernel
  python3 tools/bench_perf.py .build/verifier-kernel/compiler-asm \
      --baseline .build/verifier-kernel/compiler --cpu 2 --runs 5

Only bounds_graph_search bytes are replaced. All other code/data addresses stay
fixed. Native kernels use the existing L8 layout and exact search budget/order.
Re-run after compiler changes: layout or ABI changes may require kernel updates.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys


def run(*args, **kwargs):
    return subprocess.run([str(a) for a in args], check=True, **kwargs)


def file_offset(data, address, size):
    assert data[:6] == b'\x7fELF\x02\x01', 'expected little-endian ELF64'
    assert struct.unpack_from('<H', data, 18)[0] == 62, 'expected x86-64'
    phoff = struct.unpack_from('<Q', data, 32)[0]
    entsize, count = struct.unpack_from('<HH', data, 54)
    for i in range(count):
        kind, flags, offset, vaddr, _, filesz, _, _ = struct.unpack_from(
            '<IIQQQQQQ', data, phoff + i * entsize)
        if kind == 1 and flags & 1 and vaddr <= address and address + size <= vaddr + filesz:
            return offset + address - vaddr
    raise ValueError('search function is not inside an executable load segment')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--compiler', default='./l8')
    parser.add_argument('--output', default='.build/verifier-kernel')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    compiler = Path(args.compiler).resolve()
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=True)
    kernels = Path(__file__).resolve().parent
    source = root / 'src2/main.l8'
    run(compiler, 'build', source, '-o', out / 'compiler')
    with (out / 'compiler.s').open('w') as f:
        run(compiler, 'compile', source, stdout=f)
    assembly = (out / 'compiler.s').read_text()
    reference = '.text\n'
    for name in ('bounds_queue_next', 'bounds_graph_search'):
        start = assembly.index('.globl ' + name + '\n')
        end = assembly.find('\n.globl ', start + 1)
        assert end >= 0
        reference += assembly[start:end] + '\n'
    reference += '.section .note.GNU-stack,"",@progbits\n'
    (out / 'reference.s').write_text(reference)
    run('cc', '-shared', '-fPIC', '-Wl,-Bsymbolic', out / 'reference.s', '-o', out / 'reference.so')

    # Instrument a separate packer to recover addresses in the stripped ELF.
    shutil.copytree(root / 'src2', out / 'src2', dirs_exist_ok=True)
    shutil.copytree(root / 'stdlib', out / 'stdlib', dirs_exist_ok=True)
    packer = out / 'src2/elfpack.l8'
    text = packer.read_text()
    needle = '        pack_sym_addr[pack_i] = pack_addr;\n'
    assert text.count(needle) == 1
    text = text.replace(needle, '        if (pack_i < 0 || pack_i >= len(pack_sym_addr)) pack_fail("map index");\n' + needle)
    needle = '        if (pack_streq(pack_symbols.items[pack_i].as_name, "_start")) pack_entry = pack_addr;\n'
    assert text.count(needle) == 1
    text = text.replace(needle, needle + '''        if (sym.as_sec == as_SEC_TEXT && as_is_globl(sym.as_name)) {
            raw::raw_write(2, "MAP "); emit_num_fd(2, pack_addr);
            raw::raw_write(2, " "); raw::raw_write_bytes(2, sym.as_name);
            raw::raw_write(2, "\\n")
        }
''')
    packer.write_text(text)
    run(compiler, 'build', out / 'src2/main.l8', '-o', out / 'mapper')
    with (out / 'symbols.log').open('w') as f:
        run(out / 'mapper', 'build', source, '-o', out / 'mapped', stderr=f)
    original = (out / 'compiler').read_bytes()
    assert original == (out / 'mapped').read_bytes(), 'instrumented packer changed output'
    symbols = [(int(a), n) for a, n in re.findall(r'^MAP (\d+) (\S+)$', (out / 'symbols.log').read_text(), re.M)]
    address = next(a for a, n in symbols if n == 'bounds_graph_search')
    size = min(a for a, _ in symbols if a > address) - address
    offset = file_offset(original, address, size)
    sizes = {'l8': size}
    for name, source_name in [('c', 'search.c'), ('asm', 'search.S')]:
        flags = [] if name == 'asm' else ['-O2', '-fwrapv', '-fno-strict-aliasing',
            '-fno-tree-vectorize', '-fno-tree-loop-distribute-patterns', '-fno-builtin',
            '-fno-stack-protector', '-fno-asynchronous-unwind-tables']
        obj = out / (name + '.o')
        run('cc', '-c', *flags, kernels / source_name, '-o', obj)
        relocs = run('readelf', '-r', obj, capture_output=True, text=True).stdout
        assert 'There are no relocations' in relocs, relocs
        run('cc', '-shared', obj, '-o', out / (name + '.so'))
        binary = out / (name + '.bin')
        run('objcopy', '-O', 'binary', '--only-section=.text', obj, binary)
        code = binary.read_bytes()
        assert 0 < len(code) <= size, 'replacement does not fit original function'
        sizes[name] = len(code)
        patched = original[:offset] + code + b'\x90' * (size - len(code)) + original[offset + size:]
        executable = out / ('compiler-' + name)
        executable.write_bytes(patched)
        executable.chmod(0o755)
    run(sys.executable, kernels / 'check.py', out)
    (out / 'sizes.json').write_text(json.dumps(sizes, indent=2) + '\n')
    print('Search function bytes:', sizes)
    print('Experimental compilers:', out)


if __name__ == '__main__':
    main()
