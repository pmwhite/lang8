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
Bricks use a lighter bevel than blocks. Together this took the game from about
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
keys were pressed. Reports also time each part of a frame the game marks with GL debug
groups (`frame_phase`): wind, wind upload, block prep, lighting, shadow map, reflection, water and
sand, grass, walls, blocks, plants, HUD, the frame-time view, and the update
before drawing.

Remote control: an open game page polls the server about once a second for
commands, runs those addressed to it, and logs the results with the
telemetry, so a page left open on a phone can be driven from the
development machine:

```sh
python3 web/control.py clients                       # pages polling now
python3 web/control.py probe --target iPhone         # reload with ?probe
python3 web/control.py reload '?fresh' --target iPhone  # original world, never saved
python3 web/control.py reload '?scale=0.5' --target iPhone
python3 web/control.py set '{"view": true}'          # also scale, skip
python3 web/control.py keys '[[2, 65363, 900], [3, 65363]]'
python3 web/control.py report                        # a frame report now
python3 web/control.py eval 'return platform.windowSize()'
python3 web/control.py capture '{"frames": 60, "scale": 0.5}'  # frames to .build/captures/ID/
```

`?fresh&world=FILE` starts from another world file in the game's directory,
such as a copy of the world that starts the player next to what to test.
Frame capture copies each finished frame, before it is shown, into a JPEG
and posts it to the server, so the frames show what the device drew.

Anyone who can reach the server can run code in those pages, so serve it
only on a private network. A server without the endpoints
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

## Character viewer

The site's `character/` page runs `programs/character` on the same platform,
with a page round it: the figure's poses, animations, and routes over the ground, its layers and parts
to show, hide, and pick out, the views, and the figure's text
([format](../programs/character/FORMAT.md)) to change and bake again. The
viewer writes lines starting `CHR` that the page reads, and takes the page's
commands as key codes from 1000000000 up (see `character.js`). A phone bakes
a coarser mesh unless `?detail=100` asks for the finest.

## CAD

The site's `cad/` page runs `programs/cad` (see its README) on the same
platform, with every finger passed to it as a button and the wheel as zoom.
Everything on the page is drawn by the viewer. It has both designs open,
`/handheld.pcb` and `/dock.pcb`, and goes between them (and the set, the
dock with its handhelds in it) from its title's menu. It does not change
them (they are made by their generators: see the CAD README), and the
page keeps nothing of them: what opens is what the site has. The page
tells the viewer the
phone's safe edges as keys (1000000000 + 1000 * what + pixels). A tap that
opens another site or saves a file has to be the page's own, so the editor
says where its buttons for those are (`CADLINKS n`, then `n` lines of
`CADLINK ID x0 y0 x1 y1 open URL` or `... save PATH NAME`, in its
pixels), and the page lays unseen links over them; a file is read from the
editor's memory when its link is tapped, and the editor is told which was
tapped (key 6, the ID), to say what it did.

## People

The games share one set of people: the worker in `people-api/` (Cloudflare
D1 at `trailingwhite.space/people/api`) keeps each person (a name, and the
secret in their link, `#me=SECRET`, the same for every game), the groups
that decide who sees whom, and saves for a game with no worker of its own.
A game's worker binds the same database as `PEOPLE` and asks it who is who
(`people-api/people.js`); the skate leaderboards do. In the browser,
`people/people.js` takes a link out of the address and keeps everyone who
has played on the device and which of them plays now, for every page on
the site: the skate page lets another of them be picked (Players, from the
name on its home sheet), and the block game keeps the levels solved for
whoever plays, merged with those solved on their other devices. People and
groups are made on `people/admin.html`, opened once with the admin secret
after its `#` and kept on the device (`people-api/admin.sh link`).
`?people=URL` points a page on localhost at a people worker run there.
