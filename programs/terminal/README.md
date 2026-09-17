# L8 Terminal

A small terminal emulator written in L8, using OpenGL for rendering, FreeType
for antialiased monospace glyphs, and Linux system calls for the pseudoterminal.
Requires Linux x86-64 (4.13+), libX11, libGL, libfreetype, and an X11 display with
GLX (XWayland works). The default font is DejaVu Sans Mono at 18 pixels.

From the repository root:

```sh
./build.sh terminal
.build/terminal                       # interactive shell from $SHELL
.build/terminal 'exec bash --norc'     # choose another shell
.build/terminal 'ls -l; sleep 5'       # run a shell command
.build/terminal --font-size 22
.build/terminal --font /path/to/monospace.ttf --font-size 18
./build.sh terminal-test
```

The terminal runs the absolute path in `$SHELL`, falling back to `/bin/sh` when
the variable is missing, malformed, or cannot be executed. With no command it
starts that shell interactively; the optional argument is passed to the same
shell with `-c`. The shell inherits the current directory and environment, with
`TERM=xterm-256color`, `COLORTERM=truecolor`, and `LC_ALL=C`. The parser and OpenGL
renderer support the standard 16 colors, the xterm 256-color palette, and RGB
foregrounds and backgrounds.
Closing the window closes the PTY and terminates/reaps the shell; the window also
closes when the PTY reaches EOF. The PTY supplies terminal echo, line editing,
foreground process groups, and signal handling, including Ctrl-C and Ctrl-Z.

The font must contain fixed-width ASCII glyphs; supported sizes are 8–32 pixels.
The default file is `/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf`.
The renderer uses a grayscale glyph atlas, integer cell positions, an 8-pixel
window inset, and double buffering. Cell backgrounds and glyphs are batched into
one vertex upload and OpenGL draw per changed frame.

The terminal has **no direct libc or libutil dependency**. `pty.l8` opens
`/dev/ptmx`, unlocks and opens its slave with ioctls, forks, creates the child's
session/controlling terminal, duplicates the slave onto standard streams, and
calls `execve`. Typed syscall adapters and a counted copy of the initial process
environment live in `runtime.s`. This replaces `forkpty`, `execl`, `setenv`, and
the libc syscall wrappers. The installed X11/OpenGL/FreeType libraries still
depend on libc indirectly; the graphical executable is not fully libc-free.

Supported output includes ASCII text, CR/LF, backspace, tabs, deferred wrapping,
cursor movement and save/restore, erase operations, insert/delete characters and
lines, scrolling regions, reverse index, ANSI, 256, and true colors, bold/bright and reverse
video, alternate screen buffers, cursor visibility, application cursor keys, and
status/cursor-position replies. Escape sequences can span reads. OSC and DCS
strings are consumed without displaying their contents. Oversized CSI sequences
are discarded, and numeric parameters and grid dimensions are bounded.

Typing supports the current X keyboard layout, control characters, arrows,
Home/End, Insert/Delete, Page Up/Down, Backspace, and F1–F4. Window resizing updates
both screen buffers and the PTY dimensions, which sends SIGWINCH to the foreground
process group. The grid ranges from 2×2 to 240×120 cells; resizing preserves the
overlapping area without reflow. Input uses a bounded 64 KiB queue and nonblocking
partial writes, so a busy child does not block window events.

This is a basic VT-style emulator, not a complete VT100/xterm implementation.
There is no Unicode rendering, scrollback, selection/clipboard, mouse reporting,
Alt-key encoding, custom tab stops, or DEC graphics character set. Non-ASCII bytes
display as `?`; unsupported control sequences are ignored. `screen.l8` owns the
parser/grid, `render.l8` owns OpenGL and the font
atlas, `pty.l8` owns PTY setup and shell execution, and `terminal.l8` connects
window events, keyboard encoding, output parsing, and cleanup. The `terminal`
tag is internal to this application and its tests.

`test.l8` runs without a display and checks screen operations, fragmented and
malformed escapes, resize behavior, and 100,000 deterministic arbitrary bytes.
`test_pty.l8` builds as a static executable and checks PTY setup, environment
inheritance/overrides, canonical input, dimensions, exit status, and startup with
closed standard streams, without a display or shared libraries.
`test_integration.py` uses Python's standard library and libX11 to test a real
PTY, synthetic key events, status replies, SIGWINCH, child exit, and window close.
It skips when no display is available. For a virtual display, use
`xvfb-run -a ./build.sh terminal-test` if Xvfb is installed.
