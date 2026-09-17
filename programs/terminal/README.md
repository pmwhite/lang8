# L8 Terminal

A small terminal emulator written in L8, using OpenGL for rendering, FreeType
for antialiased monospace glyphs, and Linux system calls for the pseudoterminal.
Runs directly on Wayland using xdg-shell and EGL, with no X11 or XWayland
connection. Requires Linux x86-64 (4.13+), libwayland-client, libwayland-egl,
libwayland-cursor, libEGL, libOpenGL, libxkbcommon, libc, and libfreetype.
The default font is DejaVu Sans Mono at 18 pixels.

From the repository root:

```sh
./build.sh selfhost                   # rebuild the compiler after pulling
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
upload and OpenGL draw per changed frame. The renderer retains the previous grid
and animates changes over 120 ms. It compares vertical shifts within rectangular
regions and recursively splits them when independent motion explains more of the changed
text. This handles side-by-side, stacked, and nested panes, including multiple
panes scrolling in different directions, without requiring specific divider
characters. Shift scoring compares only surviving rows: incoming text and shared
prefixes cannot favor a stationary fragment just because it has more rows to
match. Stationary neighbors and styled status lines remain fixed; status counters
and mode labels update in place even when their text changes. Blank or
coincidentally repeated lines inside a scrolling pane remain part of its rigid
plane. Terminal scroll-region operations provide a fallback when too little
text survives to infer motion. Repeated line-number digits follow the surrounding
text even when cursor-line styling or status labels differ down that column.

Within non-scrolling regions, a longest-common-subsequence match makes surviving
text slide apart or together around insertions and deletions. New cells and
non-scroll deletions fade at the inferred edit location. Scrolling cells remain
opaque, and both incoming and departing glyphs are clipped to their own pane's
rectangle. Interrupted animations continue from their currently displayed
positions and retain their clipping boundaries through unrelated repaints. During
held scrolling, accumulated motion is bounded to the pane height; the whole plane
catches up together, and visible departing text is retained until it leaves the
clip. This prevents animation backlog from emptying the viewport during key
repeat. Repaints replace glyphs within the moving plane, and inferred edge changes
retain the previous pane's displacement, keeping old and new rows aligned without
stacking duplicate characters. Resizing resets animation geometry to the new grid.

PTY output waits for a 4 ms quiet interval before presentation, with a 16 ms cap
for continuously arriving output. This joins redraws split across writes, such
as an editor painting its insert-mode label before restoring the cursor. Hidden
cursor positions and incomplete escape sequences do not become animation targets;
ordinary visible cursor moves still animate over 75 ms.

PTY handling remains independent of libc and libutil. `pty.l8` opens
`/dev/ptmx`, unlocks and opens its slave with ioctls, forks, creates the child's
session/controlling terminal, duplicates the slave onto standard streams, and
calls `execve`. Typed syscall adapters and a counted copy of the initial process
environment live in `runtime.s`. The Wayland library uses libc for keymap mapping,
locale lookup, and error reporting; the graphical executable is dynamically linked.

[`../wayland/`](../wayland/README.md) owns the Wayland connection, typed L8
listeners, xdg-shell lifecycle, EGL context, and xkbcommon input. Configure events
are acknowledged before attaching buffers. Frame callbacks pace drawing, and the
Wayland socket is polled alongside the PTY with paired prepare/read/cancel calls.
Closing the compositor connection also closes the PTY and reaps the child.
Server-side decorations are requested when xdg-decoration is available; otherwise
window management uses the compositor's shortcuts. Buffers currently use scale 1
(the compositor scales them on HiDPI outputs); fractional-scale rendering and
client-side decorations are not implemented.

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

Typing uses the compositor-provided xkbcommon keymap and modifiers, with UTF-8,
dead-key/Compose sequences, compositor-configured key repeat, control characters,
and arrows,
Home/End, Insert/Delete, Page Up/Down, Backspace, and F1–F4. Window resizing updates
both screen buffers and the PTY dimensions, which sends SIGWINCH to the foreground
process group. The grid ranges from 2×2 to 240×120 cells; resizing preserves the
overlapping area without reflow. Input uses a bounded 64 KiB queue and nonblocking
partial writes, so a busy child does not block window events.

This is a basic VT-style emulator, not a complete VT100/xterm implementation.
Scene matching is a visual heuristic because terminal protocols provide updated
cells rather than edit intent; complex simultaneous rewrites may therefore fade
instead of finding the motion a program intended. Color changes are immediate.
There is no complex-script shaping, bidirectional layout, multi-mark grapheme
storage, emoji ZWJ clustering, text-input/IME protocols, scrollback,
selection/clipboard, mouse reporting, Alt-key encoding, custom tab stops, or DEC
graphics character set. The width table covers common current terminal ranges
rather than every historical Unicode width exception. Missing font glyphs use
the primary font's replacement glyph, and unsupported control sequences are
ignored. `screen.l8` owns UTF-8 decoding and the codepoint grid, `scene.l8` owns
region inference and animation state, `presentation.l8` owns redraw settling and
cursor motion, `render.l8` owns OpenGL, pane clipping, and the dynamic font atlas, `pty.l8` owns PTY setup and shell execution,
and `terminal.l8` connects window events, keyboard encoding, output parsing, and
cleanup. The `terminal` tag is internal to this application and its tests.

`test.l8` runs without a display and checks screen operations, fragmented and
malformed escapes and UTF-8, combining/wide cells, resize behavior, and 100,000
deterministic arbitrary bytes.
`test_scene.l8` also runs without a display. It checks full-screen and split-pane
scrolling, nested and borderless layouts, independent directions, stationary
chrome, protocol hints, interrupted motion, wide/combining cells, ordinary edits,
and resizing, including sixteen panes at the maximum grid size. Regression cases
also cover repeated prefixes, coincidentally identical incoming code lines, and
changing status counters. Held-scroll tests check that each cell is covered exactly
once throughout repeated half-page and full-page animations, in both directions
and in split panes, including concurrent edits, changing pane edges, reversals,
and line-number gutters above fixed status rows.
`test_presentation.l8` checks split insert-mode redraws, hidden and incomplete
cursor updates, smooth final movement, and the bounded output settling delay.
`test_pty.l8` builds as a static executable and checks PTY setup, environment
inheritance/overrides, canonical input, dimensions, exit status, and startup with
closed standard streams, without a display or shared libraries.
`test_integration.py` starts its own headless Sway compositor with XWayland
disabled and `DISPLAY` empty. It tests a real PTY, virtual-keyboard input,
Compose and repeat, status replies, SIGWINCH, child exit, and window close. A
Wayland screencopy verifies rendered pixels and saves `.build/terminal-wayland.png`
(or `TERMINAL_SCREENSHOT`). Continuous-scroll screenshots also verify that the
content stays visible during key repeat and save `.build/terminal-scroll-wayland.png`.
These graphical tests require `sway`, `swaymsg`,
Mesa software EGL/OpenGL, and the font; they skip if Sway is not installed.
They do not send input to your desktop session. Startup, screen, and PTY tests
run without a compositor.
