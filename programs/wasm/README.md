# A WebAssembly interpreter in L8

A library that runs the modules `l8 wasm` writes, natively, on any platform
the native compiler targets: the heart of hot reload where there is no
JavaScript engine (an iPhone app; see `RELOAD.md`). It is agnostic to the
platform: a host gives it the imports and a transport, it gives the host
instances, calls, memory and the transfer of persistent state.

| File | What it is |
|---|---|
| `module.l8` | The decoder: a module's types, imports, functions, table, memory, globals, exports, data, tags, and the `name` and `l8persist` sections |
| `interp.l8` | The interpreter: each function decoded once into words (an operation and its immediates, branches resolved to a target and a stack height), then run in a loop; frames, operands and exception handlers of its own; memory one mapped region read as bytes and as words |
| `sys.l8` | The standard imports (`web/README.md`, "Host interface"), natively: files, output, clocks, the environment, `qsort` through the module's comparator, the `l8 test` protocol on fd 3; helpers for a host's own imports (`wasm_str_at`, `wasm_new_bytes`, `wasm_alloc`) |
| `persist.l8` | Persistent globals across instances: the manifest, which old value a new type can take, and the copy (`wasm_transfer`), as `web/reload.js` does it |
| `native.s` | What L8 cannot say: memory that never moves (mmap), float bit casts, a call of a native function by address with integer and float arguments, and 64 callback trampolines (x86-64 Linux; `native.arm64-darwin.s` for iOS) |
| `run.l8` | `wasmrun module.wasm [args...]`: a module run from the command line, as `node web/run.mjs` runs one |
| `tests/reload.l8` | The reload check: `web/tests/reload_v1.l8` carried into `reload_v2.l8` natively; its output is `tests/reload.expected`, the same text the JavaScript check expects |

## Using it

```l8
import "programs/wasm/sys.l8";

host(inst: *WasmInstance, imp: int, args: []int, n: int) noregion: int {
    name: []i8 = inst.m.imports[imp].name;
    if (streq(name, "my_import")) return args[0] + 1;   // floats arrive as their bits
    wasm_sys_host(inst, imp, args, n)                   // the rest
}

m: *WasmModule = wasm_decode(wasm_read_file("app.wasm"));
inst: *WasmInstance = wasm_instantiate(m, 256, &host);   // 256 MB reserved
status: int = wasm_start(inst);                          // _start; or wasm_call_export
```

A host import gets the arguments as ints, and a str or slice argument is
an address in `inst.mem8` with its length 8 bytes before it. `wasm_exit`
ends the run with a status; a trap (`wasm_trapped`, `wasm_trap_message`)
ends it too. The module's `--async` pause works as in the browser: the
import sets the `l8_async_state` global and returns, `_start` returns, and
the host calls it again with the state set to 2 (`tests/reload.l8`).

`WASMTRACE=1 wasmrun ...` prints every call and import.

## Checks (`make wasm-test`)

Every compiler fixture runs through it (`l8 test --wasm --runner
.build/wasmrun`), the compiler built as a module rebuilds itself under it
byte for byte (7 s, against a quarter of a second under Node's JIT and a
fifth natively), and `tests/reload.l8` carries the reload fixture.

## Limits

The instruction set is what `l8 wasm` emits plus the rest of the numeric
instructions; `try_table` takes one `catch` clause; there is one memory,
one table, one data segment. An exception thrown in a callback from native
code with its handler outside that callback traps. Callbacks through the
trampolines take up to five integer arguments.
