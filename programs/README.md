# Libraries and applications

Each directory owns one library or application. Runnable demonstrations live in
[`examples/`](examples/); library tests stay beside their implementation.

| Directory | Entry point | Public tag | Purpose |
|---|---|---|---|
| `gl/` | `gl.l8` | `gl` | OpenGL/GLX bindings; imports X11 |
| `x11/` | `x.l8` | `x11` | X11 types and bindings |
| `freetype/` | `ft.l8` | `freetype` | Font loading, glyph atlases, and text vertices |
| `http/` | `http.l8` | `http` | HTTP/1.1 client, server, and streaming APIs |
| `block-game/` | `block-game.l8` | — | Game, editor, level model, and assets |

Import the entry point relative to your source file, then activate the public
tag with `use_tag`. Tags do not propagate through imports: GL applications using
X11 declarations also need `use_tag x11;`.

HTTP and FreeType files carry `http_internal` and `freetype_internal`; only
intentional API declarations also carry their public tag. Internal tags are for
implementation and white-box tests, not application dependencies. The GL and X11
libraries are raw bindings, so their foreign functions and ABI types are their
public API. Game implementation and level declarations share the application-only
`block_game` tag.

FreeType exports `Font`, `Glyph`, `FT_FIRST`, `FT_LAST`, `load_font`,
`load_default_font`, `load_mono_font`, and `emit_text`. Its foreign bindings, ABI
layouts, atlas defaults, and construction helpers remain internal. See
[`http/README.md`](http/README.md) for the HTTP API.

From the repository root:

```sh
./build.sh game
.build/block-game                         # programs/block-game/world.txt
./build.sh http
./build.sh http-test
./l8 build programs/examples/tri.l8 -o .build/tri
./l8 build programs/examples/balls.l8 -o .build/balls
./l8 build programs/examples/xwin.l8 -o .build/xwin
```

The graphical programs require an X11 display (including XWayland). The HTTP
examples are `programs/examples/http-client.l8` and `programs/examples/http-server.l8`; build output
remains `.build/http/client` and `.build/http/server`.
