# Libraries and applications

Each directory owns one library or application. Runnable demonstrations live in
[`examples/`](examples/); compiler and callback fixtures live in [`../tests/`](../tests/).

| Directory | Entry point | Public tag | Purpose |
|---|---|---|---|
| `gl/` | `gl.l8`, `core.l8` | `gl` | OpenGL bindings; `gl.l8` adds GLX/X11, `core.l8` is platform-independent |
| `x11/` | `x.l8` | `x11` | X11 types and bindings |
| `freetype/` | `ft.l8` | `freetype` | Font loading, glyph atlases, and text vertices |
| `http/` | `http.l8` | `http` | HTTP/1.1 client, server, and streaming APIs |
| `websocket/` | `websocket.l8` | `websocket` | RFC 6455 client, server, and message APIs; imports HTTP |
| `block-game/` | `block-game.l8` | — | Game, editor, level model, and assets |
| `wayland/` | `wayland.l8` | `wayland` | Native Wayland/xdg-shell windows, EGL, xkbcommon, and typed protocol bindings |
| `terminal/` | `terminal.l8` | — | Wayland/EGL/OpenGL/FreeType terminal with a syscall-backed PTY shell |

Import the entry point relative to your source file, then activate the public
tag with `use_tag`. Tags do not propagate through imports: GL applications using
X11 declarations also need `use_tag x11;`.

HTTP, WebSocket, and FreeType files carry `http_internal`, `websocket_internal`,
and `freetype_internal`; only
intentional API declarations also carry their public tag. Internal tags are for
implementation and white-box tests, not application dependencies. The GL and X11
libraries are raw bindings, so their foreign functions and ABI types are their
public API. Game implementation and level declarations share the application-only
`block_game` tag.

FreeType exports `Font`, `CachedFont`, `Glyph`, `FT_FIRST`, `FT_LAST`, `load_font`,
`load_cached_font`, `cached_font_glyph`, `close_cached_font`, `load_default_font`,
`load_mono_font`, and `emit_text`. Its foreign bindings, ABI layouts, atlas
defaults, and construction helpers remain internal. See
[`http/README.md`](http/README.md) for the HTTP API.

HTTP uses direct Linux x86-64 system calls and builds as a static executable with
no libc dependency. FreeType, X11, and OpenGL remain shared-library integrations;
programs using these bindings do not need to request libc directly, though those
system libraries normally depend on it themselves. The terminal uses these
graphics libraries and direct syscalls for PTY setup and shell execution; see its
[`README`](terminal/README.md) for usage and supported terminal features.

From the repository root:

```sh
./build.sh game
./build.sh game-test
.build/block-game                         # programs/block-game/world.txt
./build.sh terminal
.build/terminal
./build.sh terminal-test
./build.sh http
./build.sh http-test
./build.sh websocket
./build.sh websocket-test
./l8 build programs/examples/tri.l8 -o .build/tri
./l8 build programs/examples/balls.l8 -o .build/balls
./l8 build programs/examples/xwin.l8 -o .build/xwin
```

The graphical programs require an X11 display (including XWayland). The HTTP
examples are `programs/examples/http-client.l8` and `programs/examples/http-server.l8`; build output
remains `.build/http/client` and `.build/http/server`. WebSocket follows the
same layout with `programs/examples/websocket-{client,server}.l8` and
`.build/websocket/{client,server}`; see [`websocket/README.md`](websocket/README.md).
