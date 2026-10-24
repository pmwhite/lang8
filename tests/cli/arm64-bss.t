Mach-O reserves static backing as zero-fill memory. BSS must not inflate the
file or overlap __LINKEDIT's virtual mapping, and its symbols name __bss.

  $ cat > bss.l8 <<'EOF_L8'
  > tag demo;
  > values: []i8 = static_buffer([2097152]i8);
  > main(): int { values[0] = 7i8; values[0] as int - 7 }
  > EOF_L8
  $ l8 arm64 --target ios-sim --exe --imports "$TESTDIR/../../tools/ios/imports.txt" bss.l8 -o bss
  $ python3 - "$TESTDIR/../../tools/ios/macho.py" <<'PY'
  > import contextlib, importlib.util, io, struct, sys
  > from pathlib import Path
  > spec = importlib.util.spec_from_file_location('macho', sys.argv[1])
  > module = importlib.util.module_from_spec(spec)
  > spec.loader.exec_module(module)
  > raw = Path('bss').read_bytes()
  > m = module.MachO(raw)
  > data = next(s for s in m.segments if s['name'] == '__DATA')
  > link = next(s for s in m.segments if s['name'] == '__LINKEDIT')
  > bss = next(s for s in data['sections'] if s['name'] == '__bss')
  > assert bss['size'] >= 2097152 and bss['flags'] & 255 == 1 and bss['off'] == 0
  > assert data['filesize'] < data['vmsize'] and len(raw) < 1048576
  > assert link['vmaddr'] >= data['vmaddr'] + data['vmsize']
  > assert link['fileoff'] >= data['fileoff'] + data['filesize']
  > sections = [s for seg in m.segments for s in seg['sections']]
  > bss_index = sections.index(bss) + 1
  > symcmd = m.cmd(2)[0]
  > offset, count, _, _ = struct.unpack_from('<IIII', raw, symcmd + 8)
  > found = 0
  > for i in range(count):
  >     _, typ, sect, _, addr = struct.unpack_from('<IBBHQ', raw, offset + i * 16)
  >     if typ & 14 == 14 and bss['addr'] <= addr < bss['addr'] + bss['size']:
  >         assert sect == bss_index, (sect, bss_index, addr)
  >         found += 1
  > assert found
  > with contextlib.redirect_stdout(io.StringIO()):
  >     assert not module.check_signature(m)
  > m.chained()
  > print('Mach-O zero-fill, symbols, fixups and signature: OK')
  > PY
  Mach-O zero-fill, symbols, fixups and signature: OK
