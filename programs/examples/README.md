# Runnable examples

These programs demonstrate L8 applications and APIs. The compiler's functional
fixtures live in [`../../tests/compiler/`](../../tests/compiler/) and are run by
`make`.

`tri.l8`, `balls.l8`, and `xwin.l8` demonstrate graphics. The HTTP and WebSocket
client/server pairs demonstrate the corresponding libraries; see their library
READMEs for build and run instructions.

The triangle and balls examples use inline locals and fixed-capacity arrays for
their L8 storage, including a 4096-byte shader diagnostic buffer and ten balls.
Their X11/OpenGL dependencies and legacy startup still allocate externally to
that storage model; they are not certified static entry points yet.
