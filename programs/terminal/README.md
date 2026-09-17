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
shell with `-c`. The shell inherits the current directory, locale, and environment,
with `TERM=xterm-256color` and `COLORTERM=truecolor`. The parser and OpenGL renderer
support the standard 16 colors, the xterm 256-color palette, and RGB foregrounds
and backgrounds.
Closing the window closes the PTY and terminates/reaps the shell; the window also
closes when the PTY reaches EOF. The PTY supplies terminal echo, line editing,
foreground process groups, and signal handling, including Ctrl-C and Ctrl-Z.

The primary font must contain fixed-width ASCII glyphs; supported sizes are 8–32
pixels. The default is `/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf`.
Glyphs are loaded into a 2048×2048 grayscale atlas when their Unicode codepoints
first appear. If installed, Symbola supplies monochrome fallback glyphs for
symbols and emoji absent from the primary font. `--font` can select a font with
other script coverage. Cell backgrounds and glyphs are batched into one vertex
upload and OpenGL draw per changed frame.

The terminal has **no direct libc or libutil dependency**. `pty.l8` opens
`/dev/ptmx`, unlocks and opens its slave with ioctls, forks, creates the child's
session/controlling terminal, duplicates the slave onto standard streams, and
calls `execve`. Typed syscall adapters and a counted copy of the initial process
environment live in `runtime.s`. This replaces `forkpty`, `execl`, `setenv`, and
the libc syscall wrappers. The installed X11/OpenGL/FreeType libraries still
depend on libc indirectly; the graphical executable is not fully libc-free.

Supported output includes streaming UTF-8, combining marks, common East Asian and
emoji double-width ranges, CR/LF, backspace, tabs, deferred wrapping, cursor
movement and save/restore, erase operations, insert/delete characters and lines,
scrolling regions, reverse index, ANSI, 256, and true colors, bold/bright and
reverse video, alternate screen buffers, cursor visibility, application cursor
keys, DECSCUSR blinking/steady block, underline, and bar cursors, smooth cursor
movement, a steady-block default, and status/cursor-position replies. Malformed
UTF-8 displays U+FFFD and
resynchronizes at the next byte. Escape sequences can span reads. OSC and DCS
strings are consumed without displaying their contents. Oversized CSI sequences
are discarded, and numeric parameters and grid dimensions are bounded.

Typing supports ASCII, Latin-1 and X11 Unicode keysyms from the current keyboard
layout, encoded as UTF-8, plus control characters, arrows,
Home/End, Insert/Delete, Page Up/Down, Backspace, and F1–F4. Window resizing updates
both screen buffers and the PTY dimensions, which sends SIGWINCH to the foreground
process group. The grid ranges from 2×2 to 240×120 cells; resizing preserves the
overlapping area without reflow. Input uses a bounded 64 KiB queue and nonblocking
partial writes, so a busy child does not block window events.

This is a basic VT-style emulator, not a complete VT100/xterm implementation.
There is no complex-script shaping, bidirectional layout, multi-mark grapheme
storage, emoji ZWJ clustering, input-method composition, scrollback,
selection/clipboard, mouse reporting, Alt-key encoding, custom tab stops, or DEC
graphics character set. The width table covers common current terminal ranges
rather than every historical Unicode width exception. Missing font glyphs use
the primary font's replacement glyph, and unsupported control sequences are
ignored. `screen.l8` owns UTF-8 decoding and the codepoint grid, `render.l8` owns
OpenGL and the dynamic font atlas, `pty.l8` owns PTY setup and shell execution,
and `terminal.l8` connects window events, keyboard encoding, output parsing, and
cleanup. The `terminal` tag is internal to this application and its tests.

`test.l8` runs without a display and checks screen operations, fragmented and
malformed escapes and UTF-8, combining/wide cells, resize behavior, and 100,000
deterministic arbitrary bytes.
`test_pty.l8` builds as a static executable and checks PTY setup, environment
inheritance/overrides, canonical input, dimensions, exit status, and startup with
closed standard streams, without a display or shared libraries.
`test_integration.py` uses Python's standard library and libX11 to test a real
PTY, synthetic key events, status replies, SIGWINCH, child exit, and window close.
It skips when no display is available. For a virtual display, use
`xvfb-run -a ./build.sh terminal-test` if Xvfb is installed.
