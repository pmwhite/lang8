# WebAssembly

`l8 wasm file.l8 -o file.wasm` compiles a program to a WebAssembly 3.0
module (it uses exception handling, bulk memory, and sign-extension
instructions). `l8-runtime.js` is the host for those modules in browsers and
Node, and `run.mjs` runs one under Node:

```sh
./l8 wasm hello.l8 -o .build/hello.wasm
node web/run.mjs .build/hello.wasm
./l8 test --wasm tests/compiler/fib.l8   # build tests as modules, run them under Node
make wasm-test                           # every suite, and the wasm compiler fixpoint
```

## Playground

`make web` builds a static site in `.build/web`: an editor page with the
compiler as a module (`l8.wasm`), the standard library, and the examples in
`examples/`. A worker runs the compiler on the page's source, then runs the
module it wrote, so a long-running program does not block the page and Stop
can end it. Serve the directory over HTTP, since browsers load workers and
modules only from a server:

```sh
make web
python3 -m http.server -d .build/web 8000   # then open http://localhost:8000/
```

Programs import the standard library as `"stdlib/print.l8"`; the editor's
file is `/main.l8` beside `/stdlib`.

## Block game

The site's `game/` page runs `programs/block-game` unchanged. `game/platform.js`
implements the X11, GLX, OpenGL, and FreeType functions it imports on a
WebGL2 canvas:

- OpenGL calls map to WebGL2, with integer names for WebGL objects. Shaders
  are translated from GLSL 1.20 to GLSL ES 3.00. The version query reports
  3.0, so the game skips its OpenGL 4.3 compute-shader water simulation.
- `glXSwapBuffers` suspends the module until the next animation frame using
  JavaScript Promise Integration (`WebAssembly.Suspending`), so the game's own
  blocking event loop drives the page. Browsers without JSPI get a message.
- Key events become X11 `KeyPress` and `KeyRelease` events with X keysyms.
- FreeType glyphs are rasterized with a 2D canvas into the `FT_GlyphSlot`
  fields the bindings read.

The world file is kept in an in-memory file system and saved to
`localStorage` whenever the game writes it. `?edit` opens the editor.

## Modules

The backend (`src2/wasm.l8`) lowers the same typed AST as the x86 backend
and keeps its data layout, so records, enums, and arrays have the same sizes
and offsets on both targets:

- Every scalar is an `i64` on the wasm stack; `f32` and `f64` values are
  their bit patterns, as in an x86 general register. Records and enums over
  eight bytes and fixed arrays are addresses. L8 functions take and return
  `i64`s, with a hidden result address first when the result is an aggregate.
- Linear memory starts with a 16MiB shadow stack that grows down from
  `0x1010000`. Frames use the x86 backend's slot offsets; scalar locals
  whose address is never taken live in wasm locals. String literals and
  globals follow the stack, and then a bump heap that grows memory as
  needed. A region rewinds the heap when it ends.
- `raise` records the exception's tag and payload and throws the module's
  one wasm tag. A `try` catches it with `try_table`, resets the shadow stack
  to its own frame, and leaves the regions entered since the try.
- Function values are indices in the exported function table.

The module exports `memory`, `table`, `_start`, `l8_malloc` (so the host can
build values such as `argv`), and the heap pointer `l8_heap`. Its `name`
section gives functions their link names in stack traces and profiles.

## Host interface

Every `extern` is an import from module `env` named by its link name.
Integers, pointers, and slices cross as `i64` (a JavaScript `BigInt`), and
`f32`/`f64` as numbers. Slices and strings are addresses whose length is the
`i64` eight bytes before them. `l8-runtime.js` implements:

| Import | Behavior |
|---|---|
| `exit`, `l8_exit` | Stop the module with a status (throws `Exit`) |
| `l8_argv`, `l8_environment` | Build `[]str` values for `main` and the environment |
| `open`, `read`, `close`, `l8_std_write`, `l8_os_write` | Files and output through the caller's `sys` object |
| `clock_gettime`, `l8_clock_gettime`, `rdtsc`, `l8_time`, `getrusage` | Clocks; `getrusage` reports zeros |
| `l8_memcpy`, `l8_heap_used`, `l8_getrandom`, `qsort` | Runtime helpers; `qsort` calls an L8 comparator |
| `sin`, `cosf`, `sqrt`, `pow`, ... | The C math library |
| `l8_test_index`, `l8_test_record`, `l8_test_expect` | The `l8 test` protocol on fd 3 |

Other imports return `-ENOSYS`. `instantiate(module, sys, extra)` accepts
extra imports, and `MemFS` is an in-memory file system for browsers.
