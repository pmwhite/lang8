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
python3 web/serve.py 8000   # then open http://localhost:8000/
```

`web/serve.py` serves `.build/web` like `python3 -m http.server`, and also
collects the game's telemetry (below) in `.build/telemetry.jsonl`.

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

The page holds only the game, filling the screen (up to 2.4:1 wide or 1.6:1
tall). The game keeps its HUD and world at a fixed size in its own window
pixels and learns the window's size from X `ConfigureNotify` events, so the
page chooses that size: the screen's shape, at a size where a window pixel
covers at least 0.85 CSS pixels (`?zoom=1.1` sets another minimum). A phone
therefore shows fewer cells of the world, each larger, instead of shrinking
the whole 1200 by 720 view until text and blocks are hard to read. The
canvas has at most as many pixels as a 1200 by 720 window, before the
adaptive resolution below. Browser touch gestures are off, so taps do not zoom. A Home Screen
bookmark opens it full screen through the web app manifest. Touch devices get
an on-screen D-pad with Undo, Restart, Travel, and OK keys, and an FPS key in
the corner; swipes on the game move too. They inject X11 key events, pressed and released like a keyboard's,
so holding a direction keeps walking. With touch controls the room's name
moves to the top left, out from under the D-pad (`L8_TITLE_TOP`).

The world file is kept in an in-memory file system and saved to `localStorage`
whenever the game writes it.

Frame rate: the game draws its blocks and its wall bricks as instances, one
draw per pass for blocks and one per run of visible wall chunks for bricks.
Bricks use a lighter bevel than blocks, and the shadow map draws both as plain
boxes, since bevels do not show in it. Together this took the game from about
3,500 GL calls and 1.4 million vertices per frame to about 1,350 calls and
250,000 vertices. The host also skips uniform updates that repeat a location's
current value. What remains is mostly the per-pixel cost of the
ground's shading, so the page adapts the render resolution: when frames are
slow while the game's own work (its code and GL calls) leaves time to spare,
the GPU is the limit, so it renders the window at a smaller size (down to
half) and scales it up, and raises the size again when frames have headroom.
Frames slow from the game's own work keep their size, since fewer pixels
would not help; on an iPhone, telemetry shows WebGL calls take under a
millisecond a frame, so that work is the game's code. A step down that does
not speed frames up is undone, as is one a browser frame-rate cap (such as
iOS Low Power Mode) defeats.

The game's own frame-time view (frame rate, frame and work times, and heap
size) opens with F3, as in the native game, with the FPS key, or with `?fps`. On a
short window, as on a phone, its panels are magnified up to 1.5 times and share
the width, so their text stays legible.

Telemetry: every five seconds the page posts a frame report to `/telemetry`
on its server: the frame rate and frame-time spread, and how a frame's time
divides into GL calls, the game's own code, and time outside the game (the
browser, and waiting on the GPU), with the costliest GL functions, the render
size, and the GPU's name. `?probe` first spends about 50 seconds measuring fixed render sizes, the
frame-time view open, the player walking (holding each arrow in turn), and
frames with the shadow map, grass, or all drawing left out, and posts the
results; the differences show what each part costs on the device. It starts
from the original world and saves nothing, so the walking changes no
progress. Reports also say whether the frame-time view was open and how many
keys were pressed. A server without the endpoint
turns the posts off, and `?notelemetry` turns off them and the GL timing.

Query parameters: `?stats` shows the frame rate, the game's work time per frame,
and the render size; `?scale=0.6` fixes the render size; `?glcheck` reports
failing GL calls and `?glstats` counts and times them, with the vertices each
framebuffer, program, and drawing function produces, and the bytes each buffer
function uploads (see `l8Game.callCounts()`
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
