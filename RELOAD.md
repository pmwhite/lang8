# Hot reload

A program built as a WebAssembly module can be replaced by its next build
while it runs: the host instantiates the new module, carries the program's
`persistent` globals from the old instance's memory into the new one, and
starts the new one. Everything else begins again, as the program's own
startup makes it. The program needs no save-and-restore code; it declares
what survives.

```l8
persistent current_chapter: int = 1;

persistent place: Place = Place { book: 43, chapter: 3, verse: 0 };

cached_layout: Layout = empty_layout();
```

After a reload, `current_chapter` and `place` have the values they had;
`cached_layout` is initialized again, like every ordinary global. In a
program that is never reloaded (any native build, or a module run once),
`persistent` changes nothing: the global is initialized once, before main,
and read and written like any other.

## The contract

A persistent global holds data: scalars, `bool`, `str`, `?str`, records,
enums, fixed arrays, slices, and pointers (`*T`, `?*T`) to such. It may not
hold a function value (code the reload replaces) or an exception value; the
compiler rejects those. A `const` is never persistent.

What the value points to comes along: the records a list of pointers
reaches, the elements of a slice, the bytes of a string. Each object is
copied once, so sharing and cycles survive. Pointers to the old program's
globals or locals point at copies of them afterwards. Native resources (a
view, an open file, a request under way) are the host's, not the program's,
and must be made again at startup from what is persistent.

When the new build declares a persistent global that the old one had, the
value follows its type:

| Change | What the reload does |
|---|---|
| The same type | The value is carried |
| A record or variant gained fields | Carried; the new fields are zero, `""` or `[]` (a new `*T` field cannot be: see below) |
| A record or variant lost fields | Carried; those fields are dropped |
| Fields or variants reordered, variants added or tags renumbered | Carried: fields and variants match by name |
| `*T`, `[]T` or `str` made optional | Carried |
| Anything else (a scalar's width, an array's length, a variant gone, `?*T` made `*T`, a new `*T` field) | The initializer runs; the host says why |
| A new persistent global | The initializer runs |
| A persistent global gone | Its value is dropped |

Initializers run only for globals that were not carried. An ordinary
global's initializer may read a persistent one and sees the carried value,
so derived state is rebuilt from it.

A module is reloaded between callbacks, when none of its code is on the
stack: after main returned in a program that lives on in callbacks, or at
a pause in a module built with `--async` (the Bible's `bw_wait`). The
reloader refuses otherwise.

## What the compiler emits

The checker admits only data in a persistent type (`src2/globals.l8`). The
WebAssembly backend gives each dynamically initialized persistent global a
word before it, which the host sets once it has restored the value, and
`l8_init_globals` skips the initializer of a global whose word is set. The
module carries a custom section, `l8persist` (`src2/persist.l8`): a table of
the types the persistent globals reach (scalars with their sizes; pointers,
slices and arrays with their element types; records and enums with their
names, sizes, fields' names and offsets, variants' names, tags and payload
offsets), then each global's name, address, word and type. A module with no
persistent globals has no section. Native backends are unchanged.

## The host: `web/reload.js`

`persistManifest(module)` reads the section. `transferState(oldInstance,
oldManifest, newInstance, newManifest, log)` copies the globals into an
instance that has not started, deciding each by the table above, allocating
with the new instance's `l8_malloc`, and reports what it did. `Reloader`
runs one program through its builds:

```js
import { runResumable, pausing } from "./l8-runtime.js";
import { Reloader, watchBuilds } from "./reload.js";

const r = new Reloader({
  sys, imports,
  run: (instance) => runResumable(instance, waitForInput),   // or runStart
  log: (m) => console.log("reload:", m),
});
await r.load(await (await fetch("http://laptop:8777/build.wasm")).arrayBuffer());
watchBuilds("http://laptop:8777", (bytes) => {
  resetTheSkin();          // what the host itself holds for the old instance
  return r.load(bytes);    // the new instance starts, its persistent state restored
});
```

`r.isCurrent(instance)` lets a callback from an older instance (a timer, a
fetch that completed late) do nothing. `web/tests/reload.mjs` is the check:
`make wasm-test` builds `web/tests/reload_v1.l8`, runs it to its pause,
reloads it as `reload_v2.l8` (the same program edited: fields added,
reordered and made optional, a variant inserted, a global gone, one whose
type changed, one new) and compares what v2 sees.

## The development server: `web/dev.mjs`

```sh
node web/dev.mjs -- --async bw_wait programs/bible/web/main.l8 -o .build/dev/bible.wasm
```

It builds the program, watches every file in its import graph, rebuilds on
a change, and serves each build: `GET /build.wasm` is the latest module,
`GET /wait?since=N` answers once there is a build after N (a long poll,
which any host can make over plain HTTP), `GET /build` the latest build's
status and compiler output. CORS is open, so a page served from anywhere,
or an app on a phone on the same network, can ask. It prints the address to
use. `--port`, `--l8` and `--serve DIR` (static files beside the builds)
are its options.

The web skin of the Bible takes `?dev` (`?dev=http://host:8777` for a
server elsewhere): it loads core from the server instead of the site's
module and reloads it as builds come, resetting its own views each time, so
the app restarts from its kept files and its persistent state on every save
of a core source. The page's CSP allows only its own origin, so serve the
site with `SB_DEV=1 node programs/bible/web/page/serve.mjs` (which lets the
page reach any `http:` address) and open
`http://127.0.0.1:8470/read/?dev=http://127.0.0.1:8777`.

## Native hosts: the interpreter in L8

Where there is no JavaScript engine, `programs/wasm/` (its README) runs the
same modules: a decoder, an interpreter, the standard imports, and the
transfer of persistent globals in L8 (`wasm_transfer`), agreeing with
`web/reload.js` line for line on the reload fixture. `make wasm-test` runs
every compiler fixture through it (`l8 test --wasm --runner`) and has the
compiler, as a module, rebuild itself under it. A native app (the
iPhone's) holds the contract by importing it: its externs proxied to the
platform by the module's `l8imports` section (each argument a number, a
float, a pointer into the module's memory or a function value), and the
same reload over its instances' memories.
