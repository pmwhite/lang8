# Profile explorer

A trace viewer in the style of the Chrome DevTools performance panel, written
in L8. It shows every thread of a trace on one zoomable timeline: each thread
is a track, and each track is a flame chart of the spans that were running,
outermost at the top. It runs on X11 (XWayland works) with OpenGL and FreeType.

```sh
make profile-explorer
.build/profile-explorer trace.json                 # Chrome trace event JSON
perf record -g -F 5000 ./program
perf script | .build/profile-explorer -            # perf samples, from stdin
.build/profile-explorer --dump trace.json          # threads and top self times, no window
```

## Input

The file's first non-blank byte selects the format.

- **Chrome trace event JSON** (`{` or `[`): the format written by DevTools'
  "Save profile", `chrome://tracing`, Perfetto's JSON export, and many other
  tools. Either `{"traceEvents": [...]}` or a bare array. An unterminated
  array is accepted, as Chrome's own loader does. Complete (`X`) and
  begin/end (`B`/`E`) events become spans, and instant events (`i`, `I`,
  `R`) are zero-length marks. A begin with no end runs to the end of the
  trace. `thread_name` and `process_name` metadata label the tracks; string
  process and thread ids are accepted. Async, flow, counter, and sample events
  are skipped.
- **`perf script` output** (anything else): each sample's call stack is
  compared with the thread's previous one. Frames they share continue, the
  rest end, and new frames begin, so a function that stays on the stack across
  consecutive samples becomes one span. A gap of more than ten sampling
  intervals ends every open frame: the thread was idle or descheduled. Symbol
  offsets (`+0x1f`) are dropped, and unknown symbols are named by their library.
  Spans start and end on sample times, so their lengths are only as precise as
  the sampling rate.

Times are shown from the earliest event. An L8 program built with `l8 build`
has no symbols, so perf shows only addresses. For function names, assemble and
link the program's `l8 compile` output yourself. For example, for the compiler
(add the other `native` assembly files a program declares):

```sh
./l8 compile src2/main.l8 > /tmp/l8.s
as -o /tmp/l8.o /tmp/l8.s && as -o /tmp/rt.o runtime.s && as -o /tmp/w.o stdlib/write.s
ld -o /tmp/l8sym /tmp/l8.o /tmp/rt.o /tmp/w.o
perf record -g -F 5000 /tmp/l8sym build programs/terminal/terminal.l8 -o /tmp/t
perf script | .build/profile-explorer -
```

## Using it

From top to bottom, the window shows a toolbar, an overview of the whole trace
(how many threads are busy, with the visible window highlighted), a time ruler,
the tracks, and a panel.

| Input | Action |
|---|---|
| Wheel, `W`/`S`, `+`/`-` | Zoom around the pointer |
| Drag, `A`/`D`, arrows ←/→, horizontal wheel | Pan; dragging also scrolls tracks |
| Shift+wheel, ↑/↓, Page Up/Down | Scroll tracks |
| Click or drag in the overview | Move the visible window there |
| Drag in the ruler, or Shift+drag anywhere | Select a time range |
| Click a span | Select it; Escape clears |
| Click a track's header, `C` | Collapse or expand one track, or all |
| `F` | Fit the selected span or range |
| `/`, Ctrl+F | Find spans whose names contain text (ASCII case ignored) |
| Enter while finding, `N` | Select the next match and bring it into view |
| `0`, Home | Show the whole trace |
| `Q` | Quit |

Hovering over a span shows its name and duration. With a span selected, the
panel shows its duration, self time (its duration less its children's), start,
depth, category, thread, the stack of spans enclosing it, and its JSON
arguments. Otherwise the panel lists the names with the most self time in the
selected range, or else in the visible window, over the expanded tracks.
Collapsing idle threads therefore focuses the summary on the others.

## Implementation

`trace.l8` reads both formats into one model: interned names, events with a
track, start, duration, depth, and parent, and per-row event lists sorted by
start time. Events on one row never overlap, so finding the first visible
event, the event under the pointer, or a span's children is a binary search.
`view.l8` draws each frame as one batch of quads, solid or textured from the
FreeType glyph atlas. Rows skip spans that would land on pixels already drawn,
so a frame's cost follows the window's size rather than the trace's.
`profile-explorer.l8` owns the X11 window and event loop and redraws only after
input. `dump.l8` prints the text summary used by `--dump`.

The whole file is kept in memory along with the parsed events: Chromium's
startup trace (49 MB, 168,000 events, 89 threads) loads in about two seconds.

## Static storage limits

One trace context owns a 256 MiB source buffer, 1,048,576 event slots, 8,192
track slots, 131,072 interned-name entries and a 262,144-entry name hash table.
Name bytes use declared 32/256/4,096/65,536-byte slot classes (65,536/65,536/
4,096/128 slots respectively). Names and views remain live until
`trace_release`, which returns the context's slots for reuse.

The context has sixteen 64 KiB text builders, eight 65,536-entry integer
lists, eight 1,048,577-entry sorting/row work buffers, and two summaries of at
most 128 names. The viewer owns one vertex buffer with 120,000 quads, fixed
search/collapse flags and a 16,384-column overview. Exhaustion terminates with
`profile-explorer: static storage exhausted`; oversized/read-failed input files
return the existing file-read error. Capacity checks precede writes.

Trace parsing, sorting, summaries and viewer state use no L8 heap allocation.
Process startup, X11/OpenGL and FreeType's own native allocations remain separate
boundaries in the ongoing migration. Font data owned by L8 uses the static
slots documented in `../freetype/README.md`.
