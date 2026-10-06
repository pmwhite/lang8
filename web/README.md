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
  are translated from GLSL 1.20 and 3.30 to GLSL ES 3.00. The version query
  reports 3.3, so the water solver runs as fragment passes over float textures
  instead of compute shaders (see `programs/block-game/WATER.md`). That needs
  `EXT_color_buffer_float`; without `EXT_float_blend`, the blended displacement
  target uses half floats.
- The game is built with `--async glXSwapBuffers` (see below), so each swap
  pauses the module until the next animation frame and the game's own
  blocking event loop drives the page. This needs no JSPI.
- Key events become X11 `KeyPress` and `KeyRelease` events with X keysyms.
- FreeType glyphs are rasterized with a 2D canvas into the `FT_GlyphSlot`
  fields the bindings read.

The page holds only the game, scaled to the largest 5:3 box that fits the
screen. Browser touch gestures are off, so taps do not zoom. A Home Screen
bookmark opens it full screen through the web app manifest. Touch devices get
an on-screen D-pad with Undo, Restart, Travel, and OK keys, and an FPS key in
the corner; swipes on the game move too. They inject X11 key events, pressed and released like a keyboard's,
so holding a direction keeps walking.

The world file is kept in an in-memory file system and saved to `localStorage`
whenever the game writes it.

Frame rate: the game draws its blocks with one instanced draw per pass, and
only the chunks of its wall mesh that a pass can see, which together took it
from about 3,500 GL calls and 1.4 million vertices per frame to about 950 calls
and 690,000 vertices. The host also skips uniform updates that repeat a
location's current value. What remains is mostly the per-pixel cost of the
ground's shading, so the page adapts the render resolution: when frames are slow while the game's own
work per frame leaves time to spare, the GPU is the limit, so it renders the
window at a smaller size (down to half) and scales it up, and raises the size
again when frames have headroom. A step down that does not speed frames up is
undone, since a browser frame-rate cap (such as iOS Low Power Mode) is not
helped by fewer pixels.

The game's own frame-time view (frame rate, frame and work times, and heap
size) opens with F3, as in the native game, with the FPS key, or with `?fps`.

Query parameters: `?stats` shows the frame rate, the game's CPU time per frame,
and the render size; `?scale=0.6` fixes the render size; `?glcheck` reports
failing GL calls and `?glstats` counts and times them, with the vertices each
framebuffer, program, and drawing function produces (see `l8Game.callCounts()`
on the console); `?skip=fb44,prog3` drops those draws, to measure their cost;
and `L8_` parameters such as `?L8_WATER_STATIC` set the game's
environment variables.

## Pausing and resuming

`l8 wasm --async NAME` lets import `NAME` pause the module, in any browser.
Every function that can reach `NAME` becomes resumable: it keeps its locals
in its shadow-stack frame instead of wasm locals. To pause, the import sets the
exported `l8_async_state` to 1 and returns; each resumable function on the
stack records its frame and the call it was in, and returns, so `_start`
returns to the host. To resume, the host sets the state to 2 and calls
`_start` again. Each function takes its frame back and skips forward to that
call, without running the statements before it, entering only the branch,
loop body, or match arm that contains it. The call is made again, and the
import clears the state and returns. In `l8-runtime.js`, `pausing()`
implements such an import and `runResumable(instance, wait)` runs a module,
awaiting `wait()` at each pause.

A call that can pause must be a statement of its own (`f(x)`, `y = f(x)`, or
`y: T = f(x)`), not inside `try`, and not through a function value; the
compiler rejects other uses. `web/tests/resume.l8` pauses in loops, branches,
match arms, a region, and a nested function, and `make wasm-test` checks that
it prints the same as a build without `--async`.

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
