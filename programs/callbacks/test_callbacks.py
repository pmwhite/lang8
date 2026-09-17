"""Function value and C ABI tests. Run through ./build.sh callback-test."""
import os
from pathlib import Path
import shlex
import subprocess
import sys
import unittest

COMPILER = str(Path(sys.argv.pop(1)).resolve())
BUILD = Path(sys.argv.pop(1)).resolve()
BUILD.mkdir(parents=True, exist_ok=True)
ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'programs/callbacks'
ENV = {**os.environ, 'LD_LIBRARY_PATH': str(BUILD) + ':' + os.environ.get('LD_LIBRARY_PATH', '')}


def run(*args, **kwargs):
    return subprocess.run(args, cwd=ROOT, capture_output=True, timeout=30, **kwargs)


class Callbacks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = run(*shlex.split(os.environ.get('CC', 'cc')), '-std=c11', '-Wall', '-Wextra',
                     '-Werror', '-O2', '-shared', '-fPIC', str(FIXTURES / 'helper.c'),
                     '-o', str(BUILD / 'libcallback-test.so'))
        if result.returncode:
            raise AssertionError(result.stderr.decode())

    def compile(self, name, source):
        path = BUILD / (name + '.l8')
        path.write_text(source)
        output = BUILD / name
        result = run(COMPILER, 'build', str(path), '-o', str(output))
        return path, output, result

    def require_ok(self, result):
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors='replace'))

    def test_library_and_language(self):
        for name, expected in [('basic', b'callbacks OK\n'), ('abi', b'C ABI OK\n'),
                               ('native', b'native fn OK\n'), ('effects', b'fn effects OK\n')]:
            with self.subTest(name=name):
                source = (FIXTURES / (name + '.l8')).read_text()
                path, binary, result = self.compile(name, source)
                self.require_ok(result)
                self.assertNotIn(b'unused function compare', result.stderr)
                result = run(str(binary), env=ENV)
                self.require_ok(result)
                self.assertEqual(result.stdout, expected)
                formatted = run(COMPILER, 'fmt', str(path))
                self.require_ok(formatted)
                path.write_bytes(formatted.stdout)
                self.assertEqual(run(COMPILER, 'fmt', str(path)).stdout, formatted.stdout)
                self.require_ok(run(COMPILER, 'build', str(path), '-o', str(binary)))
                self.require_ok(run(str(binary), env=ENV))
                # The textual code generator is checked with GNU as, which
                # supports the full SSE instruction set emitted by compile.
                assembly = BUILD / (name + '.s')
                emitted = run(COMPILER, 'compile', str(path))
                self.require_ok(emitted)
                assembly.write_bytes(emitted.stdout)
                obj = BUILD / (name + '.o')
                self.require_ok(run('as', str(assembly), 'runtime.s', '-o', str(obj)))
                args = ['cc', '-nostartfiles', '-no-pie', '-Wl,-e,_start', str(obj),
                        '-o', str(binary)]
                args += ['-L' + str(BUILD), '-lcallback-test'] if name == 'abi' else ['-lc']
                self.require_ok(run(*args))
                result = run(str(binary), env=ENV)
                self.require_ok(result)
                self.assertEqual(result.stdout, expected)

    def test_builtin_assembler_indirect_call(self):
        path, binary, result = self.compile('static', '''tag test;
sum(a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int): int {
    a + b * 2 + c * 3 + d * 4 + e * 5 + f * 6 + g * 7 + h * 8;
}
one(): int { 1; }
main(): int {
    cb: fn(a: int, b: int, c: int, d: int, e: int, f: int, g: int, h: int): int = &sum;
    if (cb(one(), 2, 3, 4, 5, 6, 7, 8) != 204) { return 1; }
    0;
}
''')
        self.require_ok(result)
        self.require_ok(run(str(binary)))
        emitted = run(COMPILER, 'compile', str(path))
        self.require_ok(emitted)
        assembly, obj = BUILD / 'static.s', BUILD / 'static.o'
        assembly.write_bytes(emitted.stdout)
        self.require_ok(run(COMPILER, 'as', '-o', str(obj), str(assembly), 'runtime.s'))
        self.require_ok(run(COMPILER, 'elfpack', str(obj), '-o', str(binary)))
        self.require_ok(run(str(binary)))

    def test_forward_nullable_shadow_and_exception(self):
        path, binary, result = self.compile('flow', '''tag test;
exception Test;
thrower() raises Test: int { raise Test; }
caught(): int { try { thrower(); } with Test -> { 42; } }
apply(f: fn(x: int): int, n: int): int { f(n); }
global: fn(value: int): int = &later;
main(): int {
    later: fn(x: int): int = &increment;
    cb: ?fn(n: int): int = if (true) { &increment; } else { null; };
    if (cb == null) { return 1; }
    if (cb(4) != 5 || later(5) != 6 || global(6) != 12 || apply(&increment, 7) != 8) { return 2; }
    safe: fn(): int = &caught;
    if (safe() != 42) { return 3; }
    cb = &increment;
    while (cb != null) { cb = null; }
    0;
}
later(value: int): int { value * 2; }
increment(value: int): int { value + 1; }
''')
        self.require_ok(result)
        self.require_ok(run(str(binary)))

    def test_rejections(self):
        cases = {
            'argument_type': ('f(x: i32): i32 { x; } main(): int { cb: fn(x: int): i32 = &f; 0; }', 'type mismatch'),
            'result_type': ('f(x: int): i32 { x trunc i32; } main(): int { cb: fn(x: int): int = &f; 0; }', 'type mismatch'),
            'argument_count': ('f(x: int): int { x; } main(): int { cb: fn(x: int): int = &f; cb(); }', 'number of function arguments'),
            'call_type': ('f(x: int): int { x; } main(): int { cb: fn(x: int): int = &f; cb(1i32); }', 'function argument type mismatch'),
            'uninitialized': ('main(): int { cb: fn(): int; cb(); }', 'uninitialized'),
            'null_call': ('main(): int { cb: ?fn(): int = null; cb(); }', 'must be narrowed'),
            'null_assign': ('main(): int { cb: fn(): int = null; 0; }', 'type mismatch'),
            'void_result': ('f() {} main(): int { cb: fn() = &f; n: int = cb(); n; }', 'type mismatch'),
            'cast_address': ('main(): int { cb: fn(): int = 42 as fn(): int; cb(); }', 'invalid as'),
            'aggregate': ('type S = { n: int; }; extern register(cb: fn(s: S)): int; main(): int { 0; }', 'foreign callbacks require'),
            'aggregate_result': ('type S = { n: int; }; extern register(cb: fn(): S): int; main(): int { 0; }', 'result must be'),
            'slice': ('extern register(cb: fn(s: []i8)): int; main(): int { 0; }', 'foreign callbacks require'),
            'string': ('extern register(cb: fn(s: str)): int; main(): int { 0; }', 'foreign callbacks require'),
            'raises': ('exception E; f() raises E { raise E; } main(): int { cb: fn() = &f; 0; }', 'type mismatch'),
            'noregion': ('g: ?*int = null; f() noregion { g = new int[1](1); } main(): int { cb: fn() = &f; 0; }', 'type mismatch'),
            'heap_bound': ('extern register(cb: fn(p: *int@new)): int; main(): int { 0; }', 'cannot use @new'),
            'unknown_bound': ('main(): int { cb: ?fn(p: *int@missing) = null; 0; }', 'unknown lifetime bound'),
            'retention_mismatch': ('g: ?*int = null; f(p: *int@immortal) { g = p; } main(): int { cb: fn(p: *int) = &f; 0; }', 'type mismatch'),
            'borrow_escape': ('id(p: *int): *int@p { p; } bad(): *int { x: int = 1; cb: fn(p: *int): *int@p = &id; cb(&x); } main(): int { 0; }', 'escape'),
            'stored_listener': ('type L = { cb: fn(); }; extern save(p: *L@immortal): int; f() {} main(): int { l: L = L { cb: &f }; save(&l); 0; }', 'escape'),
            'extern_address': ('extern f(): int; main(): int { cb: fn(): int = &f; 0; }', 'extern function address'),
            'duplicate_parameter': ('main(): int { cb: ?fn(x: int, x: int) = null; 0; }', 'duplicate'),
            'nonfunction': ('main(): int { x: int = 1; x(); }', 'requires a fn'),
            'uncaught_indirect': ('exception E; f() raises E { raise E; } main(): int { cb: fn() raises E = &f; cb(); 0; }', 'exception not in raises'),
            'indirect_region': ('g: ?*int = null; f() noregion { g = new int[1](1); } main(): int { cb: fn() noregion = &f; region { cb(); } 0; }', 'cannot call from a region'),
            'foreign_raises': ('exception E; extern register(cb: fn() raises E): int; main(): int { 0; }', 'cannot raise'),
            'foreign_noregion': ('extern register(cb: fn() noregion): int; main(): int { 0; }', 'cannot require noregion'),
            'foreign_nested_field': ('type L = { cb: fn(s: []i8); next: ?*L; }; type Outer = { l: *L; }; extern register(p: *Outer): int; main(): int { 0; }', 'foreign callbacks require'),
            'foreign_nested_result': ('extern get(): fn(): fn(s: str); main(): int { 0; }', 'foreign callbacks require'),
            'foreign_nested_param': ('extern register(cb: fn(inner: fn(s: str))): int; main(): int { 0; }', 'foreign callbacks require'),
            'region_escape': ('allocate(): []int@new { new int[2](1); } main(): int { cb: fn(): []int@new = &allocate; xs: []int; region { xs = cb(); } xs[0]; }', 'escape'),
            'hidden_region_effect': ('g: ?*int = null; f(x: int): int { x; } get() noregion: fn(x: int): int { g = new int[1](1); &f; } main(): int { region { get()(1); } 0; }', 'cannot call from a region'),
        }
        for name, (source, diagnostic) in cases.items():
            with self.subTest(name=name):
                _, _, result = self.compile('reject-' + name, 'tag test;\n' + source)
                self.assertNotEqual(result.returncode, 0, 'invalid callback accepted')
                self.assertIn(diagnostic.encode(), result.stderr)

    def test_recursive_foreign_contract(self):
        _, binary, result = self.compile('recursive', '''tag test;
type Link = { next: ?*Link; callback: fn(node: *Link); };
extern register(node: *Link): int;
handle(node: *Link) { node.next = null; }
main(): int {
    node: Link = Link { next: null, callback: &handle };
    node.callback(&node);
    0;
}
''')
        self.require_ok(result)
        self.require_ok(run(str(binary)))

    def test_tags_and_browse(self):
        library = BUILD / 'library.l8'
        library.write_text('tag hidden;\ntag public\nhandle(n: int): int { n + 1; }\n')
        source = '''tag client;
import "library.l8";
main(): int {
    cb: fn(n: int): int = &public::handle;
    if (cb(41) != 42) { return 1; }
    0;
}
'''
        path, binary, result = self.compile('tags', source)
        self.require_ok(result)
        self.require_ok(run(str(binary)))
        formatted = run(COMPILER, 'fmt', str(path))
        self.require_ok(formatted)
        self.assertIn(b'&public::handle', formatted.stdout)
        path.write_bytes(formatted.stdout)
        self.require_ok(run(COMPILER, 'build', str(path), '-o', str(binary)))
        html = BUILD / 'callbacks.html'
        self.require_ok(run(COMPILER, 'browse', str(path), '-o', str(html)))
        self.assertIn(b'data-s=', html.read_bytes())
        self.assertIn(b'public::', html.read_bytes())
        for expression in ('&handle', '&missing::handle'):
            _, _, result = self.compile('hidden', source.replace('&public::handle', expression))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b'tag', result.stderr)


if __name__ == '__main__':
    unittest.main()
