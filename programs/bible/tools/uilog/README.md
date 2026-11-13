# uilog: a timeline of Smooth Bible's visible UI changes

A designer reviewing motion can't watch a video, so these tools write down
every visible change, frame by frame, with timestamps. A checker then
reports the moments worth critiquing: layout jumps, flicker, pops, scroll
jumps, late settling, dropped frames, overlap, misalignment, clipped text,
and how the two linked panes keep together.

| File | What it is |
|---|---|
| `uilog.js` | The web logger. The rig injects it; the site never ships it |
| `rig.mjs` | Runs a steps file in headless Chromium and writes the log |
| `steps/*.mjs` | Example steps: Go To, linked flicks, Swap Panes, opening and closing the panel |
| `check.mjs` | Reads a log and prints the report or a timeline |

## On the web

Build the site with `make bible-web` and serve it on port 8491. The server
is often already running (`ss -ltnp | grep 8491`).

```sh
node programs/bible/web/page/serve.mjs .build/bible-site 8491
node programs/bible/tools/uilog/rig.mjs programs/bible/tools/uilog/steps/linked.mjs
node programs/bible/tools/uilog/check.mjs /tmp/ux/uilog/linked.jsonl
```

Rig options: `--out FILE.jsonl` (default `/tmp/ux/uilog/STEPS.jsonl`),
`--url` (default `http://127.0.0.1:8491/read/?debug`), `--size WxH`
(default 1200x800), `--mobile` (touch and 3x pixels, for example with
`--size 402x874`), and `--shot FILE.png`. Each run uses its own port, 9533,
and a fresh profile, so a stale service worker cannot serve a blank page.
The rig refuses to start if another Chromium already holds port 9533; kill
that one by its PID. Logging runs from the moment the reader shows until the
steps finish. The log's first line names the site's hashed files (`build`),
which identifies the build you ran against.

A steps file's default export receives these helpers:

- `send(line)` sends a line to core. The log records it as an input,
  since it stands for a tap.
- `clickOn(selector, /text/)` clicks like a mouse. If the element is out
  of sight it is scrolled into view first, and the log records that too.
- `click(x, y)` clicks at a point.
- `flick(x, y, dy, speed)` scrolls smoothly, the way a trackpad does
  (positive `dy` moves down the page).
- `wheel(x, y, dy, n)` sends wheel steps without smoothing. `drag` sends
  touch moves.
- `type(text)` and `key("Escape")` type into the focused element.
- `mark(label)` adds a step name, which the report and timeline show.
- `until(js, ms)` waits until an expression is true. `ev(js)` evaluates in
  the page. `sleep`, `shot`, `log`, and `cmd` (raw CDP) are also available.
- `start()` and `stop()` turn logging on and off within a run.

`steps/common.mjs` puts a Bible (the World English Bible) or a commentary
(Clarke's, downloaded through the Worker in a few seconds) in the panel, the
way a person would through Go To.

## The log

The log is JSON lines. `t` is milliseconds since logging began.
Rectangles `r` are `[x, y, w, h]`: CSS pixels on the web, points on the
iPhone. Only the web has a logger now; the iPhone's fields below are the
format an iPhone logger writes, which `check.mjs` still reads.

| `e` | Fields |
|---|---|
| `meta` | `platform` (`web` or `ios`), `viewport`, `dpr`, and on the web `url` and `build` |
| `add` | `id`, `k` (kind), `d` (descriptor), `r`, `o` (opacity, ancestors' included), `tx` (text), `a` (the id of what holds it), `sc` (what holds it scrolls), `off` (out of sight), `base` (already there when logging began), `pv` (iPhone: a presented controller's view), `s` (a list's scroll offset) |
| `remove` | `id`, `d`, `r` |
| `move` | `id`, `d`, `r`, `dx dy dw dh`: moved within what holds it *and* on the screen. A list scrolling isn't a move of its rows, and a change above the reading line that the scroll makes up for isn't a move either |
| `fade` | `id`, `d`, `from`, `to` |
| `text` | `id`, `d`, `from`, `to` (cut to 60 characters) |
| `scroll` | `id`, `d`, `from`, `to` (and `fromx`, `tox`), `off` (out of sight before and after, as a panel laid out past the window's edge) |
| `panes` | While the panel's reader shows, in each frame where either pane's offset changed (plus the frame after): `p` is both offsets `[page, panel]`. `at` is each pane's place at its reading line. On the web that is `CHAPTER:VERSE.FRACTION` (`l` before a comment's number). On the iPhone it is `CHAPTER:aANCHOR.FRACTION`, from `win_place` |
| `input` | `type`: `pointerdown`, `pointermove`, `wheel` (`dy`), `touchstart`, `touchend`, `key`, `click`, `wire` (`detail`), `drag-start`, `drag-end`, `decel-start`, `decel-end`. `pane` is 0 for the page and 1 for the panel. `on` names the element that was touched |
| `rest` | After 18 frames without a change: `items` lists `[id, x, y, w, h, clipped, visible rect, text start]` for everything in sight and not covered, back to front. On the iPhone `clipped` is 1 for words cut off where the label ends, 2 for words shortened with "…" |
| `f` | A frame. `c` is the logger's own cost in ms |
| `value` | A number the app keeps that shapes what shows, as it changes: `n` its name, `v` its value. On the iPhone from iOS 26, `page-inset` (the page's bottom inset, set as the panel's sheet settles), `sheet-cover` (how much of the window's foot the panel's sheet covers, each frame it moves) and `gap-top` (the top of the page-colored cover under the floating sheet, -1 when there is none) |
| `mark`, `stop`, `walk` | A step's name, the end, and a walk stopped at its limit (`capped`; `presented`: the presented views looked for stopped at their limit) |
| `zoom` | iPhone: the next sheet presented grows from its control (iOS 26's zoom), which the walk can't see |

Kinds: `bar`, `sheet`, `toast`, `hairline`, `row`, `button`, `heading`,
`text`, `para` (reader text), `pane` (a scroll container), and `cover`
(the iPhone's picture of a pane, over it while what it reads changes:
`check.mjs` doesn't count what comes and goes under a cover while it is
there).

## The checker

```sh
node check.mjs LOG                   # the report
node check.mjs LOG --all             # every occurrence, not just the first twelve
node check.mjs LOG --timeline 2000-4000   # what changed, frame by frame, in that window (ms)
node check.mjs LOG --sheets          # each presented sheet: its rect as it moves, rows added late
                                     # (a height going back less than 6 in all is a spring settling,
                                     # not "turned back")
```

Repeated identical findings are grouped, with their count and times. The
thresholds sit at the top of `check.mjs`:

- **Layout jump after appearing.** An element moves or resizes by 3 or more
  within 300 ms of appearing, in at most two frames, with no input in
  between. More frames than that is an animation.
- **Flicker.** An element goes and comes back within 250 ms, is replaced by
  a twin a frame or more later, or dips in opacity and recovers. A list
  blanks: three or more of its rows and headers on screen go in one frame
  with none put in their place, and rows come back into it within 250 ms.
  A flip, judged by place: what is drawn at a place (a kind of view at a
  rect, to the point) changes, to other words or none, and comes back
  within two frames, unless the same words are drawn within 2 of the
  place in that frame (a row easing a point at a time crosses the
  rounding of its place without anything going). By place, not by view, because on a reload UIKit
  hands a reused cell or header another row's place and words, which no
  one sees; a view moving away and back for a frame is a flip of the place
  it left. Not judged while a hand moves a list (from a touch or a drag to
  its end, and through the list's glide after it), under a pane's cover,
  or in a zoomed sheet as it comes. A flip while the list cross-fades (an
  update's or a typed refill's 0.15–0.2 s fade) is blended on the screen,
  so it shows milder than the log's frame says; it is still reported.
- **Pop.** A sheet, toast, bar, or pane appears or goes at full opacity in
  one frame, with no fade or slide nearby. Only the outermost of elements
  that appear together is reported. A presented sheet that moves or
  changes its height by 20 or more in one frame, not moving in the frames
  around it, jumped (a height set without animation) and is a pop too.
  Not pops: a zoomed sheet's coming and going and its moves within a second
  of coming (UIKit's hand-over at the zoom's end: listed apart as zoomed),
  and a presented sheet hidden while a later one covers it (UIKit's).
- **Scroll jump.** A container in sight scrolls more than 40 in one frame
  with no input in the 100 ms before.
- **Late settle.** Visible changes continue more than 600 ms after the hand
  stopped. A pane's own glide after a flick counts as the hand's, so the
  measure starts when the glide ends.
- **Dropped frames.** A frame gap over 50 ms while something moves, minus
  the logger's own cost.
- **At rest:**
  - **Overlap.** Words overlap a bar or other words, both in the same
    scroller and sheet, with neither containing the other. What a
    presented sheet covers (the part of anything walked before it, under
    its rect and outside it) is not in sight for these checks.
  - **Misalignment.** Stacked labels or rows in one column start their words
    1–4 px apart. On the iPhone the label's left edge is used, and the
    range is 0.5–3 points.
  - **Clipped text.** On the web, text wider than its overflow-hidden box
    or past its line clamp. On the iPhone, a one-line label narrower than
    its words and cut where it ends; one shortened with "…" (its line break
    mode truncates) is listed apart, as shortened with an ellipsis.
- **Linked panes.** Each episode of pane motion is measured. The leader is
  the pane the last input was in; on the iPhone a `!flick` line counts.
  The report gives:
  - **start lag** and **typical lag**: the shift, in frames, that best
    correlates the follower's per-frame steps with the leader's.
  - the per-frame steps of both panes.
  - **smoothness**: the RMS change of step from frame to frame, follower
    against leader.
  - **follower spikes**: steps over 2.5 times the leader's typical step.
  - **snap-back**: steps against the leader's direction, while it moves
    and after it stops.
  - **catch-up** after the leader stops.
  - **off**: the follower's place minus the leader's at the reading lines,
    in verses (iPhone: anchors, which match verses only between two
    Bibles).
  - **jumps**: Go To, Swap Panes, and other moves of a few frames get a
    single line.

## Limits

- **Web.**
  - The logger measures elements of the kinds above plus leaf blocks of
    text. Inline spans, such as verse numbers, links and words, count as
    part of their paragraph.
  - It costs about 2–3 ms a frame in headless Chromium.
  - Headless Chromium has no GPU and no real vsync, so its frame timing is
    only a guide.
  - `flick` is a mouse-source scroll gesture. With 1200×800 and no touch
    emulation, touch-source gestures don't scroll the page. The browser
    turns it into smooth wheel steps, so the log calls the hand `wheel`.
