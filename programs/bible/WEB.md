# Smooth Bible on the web: design specification

The web designer writes this. The web builder implements it as written, and the designer
reviews CI screenshots against it (`REVIEW-web-*.md`). The rules are DESIGN.md's (its
opening paragraph): if something here can't be built, the builder says so in the commit
message and builds the nearest equivalent, never a different design in silence.

**What this is.** The owner asked on 2026-10-20 for "a well-designed web equivalent of the
iphone app", one that uses "the web in the most proper way for the web", with no syncing
between the two yet, sharing as much L8 as makes sense, and perhaps "a small wrapper that
allows L8 to control the content of a page". This document is that design.

**How it relates to DESIGN.md.** DESIGN.md stays the specification of every feature: what
it does, its words, its rules (a ribbon's carrying, the ESV's limits, Practice's levels,
the tips' order). WEB.md says how each feature takes its web form, and what is different
on the web and why. **Where WEB.md is silent, DESIGN.md's behaviour and wording hold**,
with three standing translations: "tap" in the copy becomes "click or tap" only where a
mouse is likely (the manual's web text, §W14.4); UIKit's controls become the HTML
controls named in §W1.4; and an SF Symbol becomes the web icon named in §W1.7.

**Status.** Written 2026-10-20. Nothing is built. The builder has started on UI-neutral
groundwork (the bridge and the portable modules in wasm); §W1 and §W3 (phase a) came
first so that work can follow them.

Contents: W0 principles · W1 architecture · W2 URLs, history and the site · W3 phase (a),
the reader alone · W4 phases at a glance · W5 phase (b), navigation, search and versions ·
W6 phase (c), marks, notes, ribbons, plans and the rest · W7 phase (d), Listen and Study ·
W8 phase (e), Memory and languages · W9 phase (f), offline and installing · W10
keyboard, mouse and touch · W11 accessibility · W12 data, storage, export and licences ·
W13 performance · W14 testing and CI · W15 out of scope, deferred and iPhone-only · W16
questions for the owner.

---

## W0. Principles for the web

DESIGN.md §0 carries over, translated. These are the web's versions; each review checks
them.

1. **The text is the interface.** As §0.1: chrome when wanted, quiet otherwise, one accent
   colour, no ornament without meaning.
2. **The web's own way, as the iPhone app is the iPhone's.** DESIGN.md's principle 2 and 5
   ("native first", "the HIG is law") become:
   - **The text is real HTML text:** selectable, found by the browser's Find, read by
     screen readers, zoomed by the browser, printed, translated by the browser.
   - **Every place is a URL and every way to a place is a link** (`<a href>`): a chapter, a
     verse, a search result, a Library row, a reference in a note, a book in Go To. Middle
     click, "open in new tab" and "copy link" work everywhere. The app takes over only a
     plain click (no modifier keys, primary button) and does it in place.
   - **Back is the browser's Back.** Jumps are history entries; dialogs close with Back
     (§W2.3).
   - **The browser's own controls:** `<dialog>`, the `popover` attribute, `<details>`,
     `<input type=search>`, `<input type=range>`, `<select>` where a list is long,
     `<audio>`, `<textarea>`. Restyled only with CSS. Never a drawn imitation of a control.
   - **The browser's keys are never taken:** ⌘/Ctrl with F, L, P, R, T, W, D, K, the arrow
     keys with modifiers, Space and Page Up/Down keep their browser meaning (§W10.1).
3. **Calm motion.** CSS transitions and transforms only, no bounce; `prefers-reduced-motion:
   reduce` replaces every movement with a 0.15 s fade or nothing (as §0.3).
4. **Nothing is lost.** Everything is saved as it changes (§W12.2), in every open tab
   (§W12.3), and **can be taken out from the first day**: a backup file and the iPhone's
   Markdown export (§W12.4), because there is no sync.
5. **Nothing changes abruptly** (§0.6). A dialog is complete before it appears; nothing
   rearranges after it lands; no style swaps at a scroll threshold; the text never moves
   because of the bar, a capsule, a mark appearing or a chapter arriving (§W3.3).
6. **L8 owns the app; JavaScript is the bridge.** The app's state, logic and every screen's
   content are L8, compiled to WebAssembly. JavaScript only carries calls between L8 and
   the browser (§W1). This replaces §0.7 ("no blocks"), which has no web meaning.
7. **No server beyond the Worker we have,** no accounts, no analytics, no third-party
   requests except the audio hosts while listening (§W7.1), no cookies.
8. **Calm, not casino** (the owner's rule, everywhere): no streaks, badges, counts to
   chase, install nags, update banners, "rate us", or attention-seeking motion.
9. **It works offline once visited** (phase f), and reads without JavaScript at all
   (§W1.8), because a Bible page should never be blank.

---

## W1. Architecture (decided)

### W1.1 The decision: L8 in WebAssembly owns the app, through a small DOM bridge

**Decided:** the web app is an L8 program compiled with `l8 wasm`, holding all state and
logic and building every screen's content. A small JavaScript module, **the bridge**,
gives L8 the browser: making and changing elements, events back into L8, scroll and
geometry, the text selection, history, storage, fetch, audio, the clipboard. This is the
owner's suggestion, and it holds up:

1. **The logic is already L8, and portable.** The ten portable modules (`text`, `lang`,
   `plans`, `memory`, `learn`, `ribbons`, `store`, `esv_cache`, `help`, `audio`; 13,500
   lines) have no externs and no file access: data comes in as byte buffers, "today" and
   the time come in as arguments. All nine of their test files pass under
   `l8 test --wasm` today (checked 2026-10-20: 105 tests, each file under a second).
   Calling them from JavaScript instead would mean a JavaScript-facing API over every one
   of them (L8 can export no named functions; strings cross as pointers into linear
   memory), which is more glue than the bridge itself.
2. **One language for the app.** The builder writes L8 and tests it with `l8 test`. Screen
   state (what the tray offers, which Go To sections show, a Practice session's steps) is
   then L8 on both platforms, and can move into portable modules shared with the iPhone
   (§W1.2), which a JavaScript UI would have to re-implement and keep in step.
3. **The web's strengths are kept** because the bridge is thin and the page is real HTML:
   L8 writes HTML (§W1.4), the browser lays it out, finds in it, reads it aloud, prints it.
   Nothing is drawn on a canvas.
4. **It is small.** All ten modules compile to 371 KB of wasm, 82 KB gzipped, before any
   dead-code removal (measured 2026-10-20). The bridge is a few hundred lines.

**Rejected: a JavaScript (or framework) UI calling L8 for logic.** It would split every
feature across two languages, need an export layer the compiler lacks, and share less
with the iPhone, not more. **Rejected: drawing on a canvas** as the games and Better do:
it would lose selection, Find, screen readers, zoom, printing and translation, which are
the point of a reading app on the web.

**What the browser must support** (the floor): WebAssembly with the exception-handling
proposal's `try_table` form (L8's wasm uses it), `DecompressionStream`, `<dialog>`, the
`popover` attribute, IndexedDB, ES modules. That is **Safari 18.4** (iOS and macOS),
**Chrome and Edge 137**, **Firefox 131**, or later. On an older browser the prerendered
page still reads and its links work (§W1.8); the boot script tests support with
`WebAssembly.validate` on a 30-byte module using `try_table` and, failing it, leaves the
page as a plain website with one faint line at the end of the chapter: "This browser can
show the text but not the reader's tools. A newer browser has them." No banner.

### W1.2 What is shared, and what is new

| Part | Where | State |
|---|---|---|
| The ten portable modules | `programs/bible/*.l8` | **Shared, unchanged.** The web calls them as the iPhone does |
| Their tests | `programs/bible/test_*.l8` | Shared; CI runs them natively and under `--wasm` (§W14.1) |
| The data files | `programs/bible/data/` | Shared, unchanged in format; the web serves them gzipped (§W12.1) |
| `html.l8`: text and screens to HTML | `programs/bible/html.l8` (portable, new) | **New**, tested by `test_html.l8` natively and in wasm |
| Screen logic now inside `ios_*.l8` that both need | moved into portable modules as each web screen is built | **Moved, not copied** (below) |
| The web UI | `programs/bible/web.l8` (begun) and `web_*.l8` | **New** (about the size of the iPhone's UI less UIKit's ceremony; an estimate of 12–18 thousand lines over all phases) |
| The bridge | `programs/web/dom.l8` and `web/dom.js` | **Built** (9befcaab), general; small additions per phase (§W1.3) |
| Styles, page template, Service Worker, manifest, icons | `web/bible/` | **New** |
| The prerenderer | `programs/bible/prerender.l8` (native, build time) | **New** (§W1.8) |
| The Worker | `programs/bible/worker/` | Two small changes: serving `/read/` (§W2.1) and the web's share of the ESV budget (§W12.6) |

**Moving shared screen logic.** When a web screen needs logic the iPhone keeps inside an
`ios_*.l8` file (the copy and share format of §3.3.6, the reference label "John 3:16, 18",
which tray actions show, Go To's sections and their order, the tip rule's inputs, a
Practice session's sequence, the day reader's passage list), the builder moves it into a
portable module (an existing one, or `shared.l8`), with a test, and changes the iPhone to
call it. Rules:
- One move per commit, named "Smooth Bible: shared — …", changing no iPhone behaviour.
- The move lands only after the iPhone's CI run on it passes, with its shots unchanged.
- If a move would need a UIKit type in the portable code, it doesn't move; the web writes
  its own and says so in the commit.
- The other designer and the iPhone builders see it in `git log`; nothing else is needed.

Portable modules that read files, a clock or the platform: none do today, and none may
start to. The web and the iPhone fill the same globals (`hlp`, `lw`, the text buffers)
from their own storage.

### W1.3 The bridge

**As built (9befcaab):** `programs/web/dom.l8` declares the calls and `web/dom.js` is their
host, over `web/l8-runtime.js`. It is general (any L8 page can use it), in the manner of
`objc.l8`: nodes and host objects are handles; text goes in as `str` or bytes of a `[]i8`
and comes back into a buffer the caller owns; callbacks are `fn(data: int)` values with an
event record (`dom_ev`, `dom_evf`, `dom_evs`) filled before each call; `main` sets the page
up and returns, and the program lives on in its callbacks. It already has elements, text,
HTML, attributes, classes, styles, any property or no-argument method (so `showModal`,
`showPopover`, `focus`, `play` need no calls of their own), boxes and scrolling,
listeners, the selection, `pushState`/`replaceState`/`popstate`, `fetch`, `localStorage`,
timers and frames, and media queries. **This is the bridge the design builds on;** the
builder's measurement (a call costs about a microsecond; Psalm 119 built node by node in
14 ms, the same as one string of HTML) settles that the bridge's cost is no reason to
prefer one way of making content over the other (§W1.4).

**Rules the design relies on** (from the compiler and the bridge, checked 2026-10-20):
- A callback can't be `noregion` and can't `raise`: each handler catches its own errors
  and logs them (`dom_log`); an uncaught one must not leave the page half-changed.
- Each handler's own allocations are freed at its end (it runs in a region). State that
  lives between events is in globals and immortal buffers, as the portable modules
  already keep it. Big data (a version's text, the language data) is kept as host memory
  (`dom_fetch_body`), as a mapped file is on the iPhone.
- The event record is good until the callback returns or calls into the page in a way
  that dispatches another event: read what's needed first.

**What the later phases add to it** (each a few lines in `dom.js`; names are the
builder's to choose):

| Need | Addition | Phase |
|---|---|---|
| Delegated actions on HTML written as a string (§W1.4) | the nearest ancestor of the event's real target with a given attribute: `dom_event_attr(name, out)` (its value) and `dom_event_closest(selector): int` (a handle to it, on demand) | a |
| Exact Back (§W2.3) | a state string with `pushState`/`replaceState`, and `history.state` read back on `popstate` | a |
| The place (§W3.5) | `dom_point(x, y): int`: `elementFromPoint`, answering the nearest `[data-v]` node at or above it as a handle; and all client rects of a node (a verse that wraps) | a |
| Marks in one call (§W1.5) | `dom_class_all(h, selector, name, on)`: a class on every match under h | a |
| Gzipped data (§W12.1) | a fetch that decompresses with `DecompressionStream("gzip")` before handing the body over | a |
| Files in IndexedDB (§W12.2) | `file_read(name, f, data)`, `file_write(name, bytes)` (queued, whole file, in a Web Lock), `file_list`; a callback when another tab wrote a file (BroadcastChannel) | b |
| Out of the page | `clip_write(text)`, `share(title, text, url)` (0 when `navigator.share` is missing), `download(name, mime, bytes)` (a Blob and an `<a download>`), `file_pick(accept, f, data)` | b, c |
| The device's voice (§W7.1) | `speech_say(text, lang, rate, voice)`, `speech_stop()`, `speech_voices(out)`, and its boundary and end events | d |
| Lock screen controls (§W7.1) | `media_meta(title, artist, album, artwork)` and Media Session actions as events | d |
| Keep the Screen On (§8.2) | `wake_lock(on)` (re-requested when the page becomes visible) | a |
| Storage that stays (§W9.4) | `navigator.storage.persist()` and `estimate()` | f |

### W1.4 How screens are made: L8 writes the text as HTML; screens as the builder finds best

- **The Bible's text is HTML written by `html.l8`** (§W1.5), set with `dom_set_html`
  (or the `_of` form, straight from L8's buffer). It has to be a string because the
  prerendered pages (§W1.8) are the same markup written to files, and the app must adopt
  them unchanged. The same goes for anything else that is also a static page: the book
  index, the manual (§W14.4), the About page.
- **Screens may be built either way:** node by node with handles, or a list's HTML in one
  string. The builder chooses per screen. Where a screen's rows are written as HTML, their
  buttons say what they do in attributes (`data-act="goto.book" data-arg="43"`) and one
  listener on the dialog reads them (`dom_event_attr`), so 66 books need no 66 listeners.
- **Places are links.** Whatever builds them, a row that goes to a place is an
  `<a href="/read/bsb/john/3#16">`. The app listens for clicks on links inside `/read/`
  and handles a plain one in place (§W0.2); with a modifier key or the middle button it
  lets the browser do what it does.
- **Escaping is the one safety rule.** Everything not written by the app itself (note
  text, ribbon names, search queries, a backup's contents, the ESV's text) is escaped when
  it goes into HTML (`h_text`/`h_attr` in `html.l8` escape `& < > " '`), or set as text
  (`dom_set_text`), never as HTML. `test_html.l8` checks it, including a note containing
  `<img src=x onerror=…>` and a ribbon named `"><script>`. The page's Content Security
  Policy backs it up (§W12.7).
- **UIKit's controls, on the web:**

| iPhone | Web |
|---|---|
| Page sheet with a navigation bar | `<dialog>` opened with `showModal()`: full-screen sheet on phone widths, a centred panel at 560 px wide and up to 88 vh tall on wider ones (§W3.2). Its header row holds the title, and Done as a text button on the right |
| Medium-detent sheet left undimmed (Reading settings) | A non-modal `<dialog>` docked at the bottom on phones; a popover under the Aa button on wider screens; the page stays live behind both |
| Popover (footnote, preview) | An element with the `popover` attribute, placed by the bridge next to its anchor (the CSS anchor positioning that would do this isn't in Safari yet) |
| Pushed screen inside a sheet | A stack inside the dialog: the new screen slides in from the right (0.25 s; a fade under reduced motion), a back button "‹ Library" on the left of its header |
| insetGrouped table | `<ul>` of rows inside `<section>`s with an `<h2>` header and a footer `<p>`, styled as grouped cards on `sheetBg`/`cellBg` |
| Segmented control | A `role="tablist"` of buttons (Library, Study), or a group of radio inputs styled as segments (settings' choices) |
| UISwitch | `<input type=checkbox role=switch>` styled as a switch |
| UISlider | `<input type=range>` |
| Swipe to delete | A delete button on the row (shown on hover and focus with a mouse; always shown, faint, on touch), and an Undo toast (§W6.4) |
| UIActivityViewController | `navigator.share` where it exists; otherwise the text and link copied, with the toast "Copied with Link" |
| Toast | A small capsule above the tray's place, `role="status"`, as §3.3.3 |
| UIContentUnavailableConfiguration | An icon, a title and a line, centred, faint |
| Haptics | None (calm; `navigator.vibrate` exists only on Android) |

### W1.5 The text on the page (`html.l8`)

`html.l8` turns what `text.l8` already produces into HTML: `layout_chapter(c)` fills `out`
with runs (`run_style`, `run_para`, `run_arg`, `run_end`) and the verse table
(`verse_num`, `verse_shown`, `verse_begin`, `verse_end`). `html_chapter(c)` writes one
chapter as an `<article>`; the same function serves the browser and the prerenderer
(§W1.8), so the two are byte-identical.

**The markup** (classes are short; this is the contract between `html.l8` and the CSS):

```html
<article class="ch" data-c="1007" data-b="JHN" data-n="3" aria-labelledby="h1007">
  <hr class="div">                                 <!-- STYLE_RULE: not before Genesis 1 -->
  <h2 class="op" id="h1007"><span class="lb">John</span> <span class="nm">3</span></h2>
  <h3 class="s">Jesus and Nicodemus</h3>           <!-- STYLE_HEAD -->
  <p class="r">(<a class="ref" href="/read/bsb/john/1#1-5" data-act="ref">John 1:1–5</a>)</p>
  <p class="p">
    <span class="v" data-v="1"><span class="vn">1</span>Now there was a man …</span>
    <span class="v" data-v="2"><span class="vn">2</span>He came to Jesus …<a class="fn"
      href="#f1007-3" data-act="fn" data-f="12345" role="button" aria-label="Footnote">a</a></span>
  </p>
  <p class="q1">…</p> <p class="q2">…</p>          <!-- poetry; stanza gap: class "gap" -->
  <ol class="fns" aria-label="Footnotes">          <!-- shown in print and without the app -->
    <li id="f1007-3">3 <i>Or</i> born from above</li>
  </ol>
</article>
```

- **Chapter key** `data-c` is `text.l8`'s chapter index; `data-b` and `data-n` its book
  code and number. **Verse key** `data-v` is `verse_num` (the key marks and selection
  use); the number shown is `verse_shown` (the ESV's V15>14 case).
- **A verse that crosses paragraphs is several spans with the same `data-v`.** Marks and
  selection are applied to all of them at once (`dom_class_all(ch, '[data-v="16"]', …)`).
- **Styles map to elements:** STYLE_BOOK (chapter 1's book title) is `<span class="bk">`
  inside the `h2`; STYLE_BOOKLABEL `lb`; STYLE_NUMERAL `nm`, STYLE_NUMERAL1 `nm one`;
  STYLE_HEAD `h3.s`; STYLE_SUBHEAD `h4.ss`; the passage range line `p.r` with each
  STYLE_REF an `a.ref`; STYLE_TITLE (psalm title) `p.d`; STYLE_MAJOR `p.m`, its range
  `p.mr`; STYLE_ACROSTIC `p.ac`; STYLE_CAPS (LORD) `span.sc`; STYLE_JESUS `span.j` (and
  its caps and supplied variants as two classes); STYLE_SUPPLIED `span.su`; STYLE_NOTE
  the footnote mark `a.fn`; STYLE_XREF as `a.ref`.
- **Paragraph kinds:** PARA_PROSE `p.p`, PARA_Q1 `p.q1`, PARA_Q2 `p.q2`, PARA_L1/L2
  `p.l1`/`p.l2`, PARA_CENTER `p.c`, PARA_RIGHT `p.rt`, PARA_VERSE `p.vl`; a kind plus
  KINDS (a stanza's break before it) adds class `gap`.
- **Headings:** each chapter's opener is an `h2` (its text, read aloud, is "John 3";
  chapter 1 reads "Genesis 1", a single-chapter book "Jude"); section headings `h3`,
  sub-headings `h4`. The page has one visually hidden `h1`: the version's name.
- **Verse numbers and footnote marks** have `user-select: none`, so text copied with the
  browser's own Copy is the words alone; they stay in the accessibility tree (a verse
  number reads as its number). Their visibility follows the settings by CSS (§W1.6),
  not by re-rendering.
- **The footnotes** are also listed at the chapter's end in `ol.fns`, which CSS shows only
  in print and when the app isn't running (§W1.8); a mark is a real link to its note, so
  without JavaScript it still works.
- **Marks** are classes and two small inline elements. `html_chapter` takes the
  chapter's marks and writes them into the HTML of every chapter the app adds; on an
  adopted prerendered chapter the app adds them with `dom_class_all` in the same task as
  it adopts it (§W3.3). They are: `hl-yellow` …
  `hl-purple` on a highlighted verse's spans; `hj` on a verse whose highlight runs on into
  the next one in the same colour (it paints the space between them, so a run of verses is
  one wash, §3.3.4); `bm` on a bookmarked verse (CSS puts the bookmark glyph before its
  number and colours the number accent); a note's glyph is an inserted
  `<button class="ng" data-act="note" aria-label="Note on John 3:16">` at the verse's end;
  `sel` on selected verses; `flash` for the jump flash (§2.7). None of these changes a
  line's height except the note glyph and the bookmark glyph, which are sized to sit in
  the line (§W3.3).
- **Verse-per-line** (§3.1.7) is the one setting that re-renders (it needs
  `lay_verse_lines`); everything else is CSS.
- `html.l8` also writes the shared pieces other screens use: a reference as text and as a
  link (`h_ref`), a verse's plain text for rows (`h_verse`), a search result with its
  matches in `<b>` (§3.6), the manual's paragraphs with `{sym:…}` and `[[…]]`
  (§W14.4), and the escaping functions.

### W1.6 Styles: `read.css`

One stylesheet, about 1,500 lines, in sections: tokens, page, text, chrome, dialogs, lists,
each feature, print. No CSS framework, no preprocessor.

**Settings become attributes on `<html>`,** set by the boot script before the first paint
from `localStorage` (§W12.2), so a returning reader never sees the wrong theme or size
flash:

```html
<html lang="en" data-theme="paper" data-font="serif" data-spacing="normal"
      data-margins="normal" data-vn="1" data-heads="1" data-fns="1" data-red="0"
      style="--step: 1">
```

**Themes:** the five themes and Auto as §2.1, as custom properties under
`[data-theme=…]`; Auto is `paper` under `prefers-color-scheme: light` and `night` under
`dark`, switching live. Each theme sets `color-scheme` (light or dark), so the browser's
scroll bars, form controls and dialog backdrops match, and the boot script sets
`<meta name="theme-color">` to the theme's `bg` (Safari and Chrome tint their bars with
it). All of §2.1's tokens and both highlight sets carry over, with **one change for WCAG
2.2 AA** (text contrast 4.5:1; §W11): `faint` is used for verse numbers, references and
labels, which are text, and four of the five themes' `faint` fall short on the web's
terms. The web uses these, the nearest colours of the same hue that pass (computed
2026-10-20; ink, heading and accent already pass in every theme):

| Theme | iPhone `faint` (contrast) | Web `faint` (contrast) |
|---|---|---|
| Paper | `#8A8378` (3.5) | `#767067` (4.6) |
| White | `#8E8E93` (3.3) | `#747479` (4.7) |
| Sepia | `#927F66` (3.3) | `#776753` (4.7) |
| Night | `#8C857A` (4.8) | unchanged |
| Black | `#77716A` (4.4) | `#7B756D` (4.6) |

(§W16 asks whether the iPhone should take the same values; the web uses them either way.)

Where §2.1 says "system" for a sheet's colours (White and Night), the web needs values:
White `sheetBg #F2F2F7`, `cellBg #FFFFFF` (iOS's light grouped colours); Night `sheetBg
#121110`, `cellBg #262421` (its dark grouped colours, warmed to the theme). Popovers and
the tray use `cellBg` in every theme.

**Type** (§2.2–§2.4 in CSS):
- `em` = `calc(1.1875rem * var(--step))`: §2.2's 19 pt as 19 px at the browser's default
  16 px root, times the size step (`0.82, 0.9, 1.0, 1.1, 1.2, 1.32, 1.46, 1.62`). Being in
  `rem`, it follows the browser's own text size setting and zoom, as the iPhone's follows
  Dynamic Type; Reading settings says "Also follows the browser's text size."
- Every size in §2.3's table becomes the same `em` multiple; line height from the spacing
  setting (1.18, 1.32, 1.48); paragraph spacing 0.55 em; `hyphens: auto` with `lang="en"`
  (the browser's hyphenation dictionaries; no factor control exists, so it is on for
  prose and poetry alike, and §W16 lets the owner turn it off if the rag looks wrong).
- Small caps for LORD: `font-variant-caps: small-caps` where the font has them, else
  `font-synthesis-small-caps` (the browser synthesizes them, as §2.2 does for Georgia).
- Verse numbers: the chrome font's tabular figures, 0.58 em, weight 600, `faint`,
  `vertical-align: 0.36em` with `line-height: 0` so they never stretch a line, then a
  narrow no-break space (as now).
- The column: `max-width: 34em`, centred, side padding from the margins setting (20, 28,
  40 px), as §17.2.1. The page's top gap, chapter divider (a 36 px × 1 px `rule`
  hairline, 2.4 em above and 2.0 em below) and the 120 px after Revelation 22 as §2.4.
- Chrome text (bars, lists, buttons) is `system-ui` (San Francisco on Apple devices,
  Segoe UI on Windows, Roboto on Android) at fixed px sizes from §2.5 scaled by `rem`
  (so it follows the browser's text size but not the reading step), as §7.3 rules for UI.

**Fonts.** The iPhone's five are Apple's system fonts; on the web a font is either on the
device or downloaded. Decided:

| Setting | Font stack | Downloaded? |
|---|---|---|
| **Serif** (default; the iPhone's New York) | `ui-serif` (New York on Apple devices), then **Source Serif 4** | Only where `ui-serif` doesn't exist (Windows, Android, Linux): a 2-file Latin subset, regular and italic, about 90 KB woff2 in all, `font-display: swap` |
| **Charter** | `Charter` (Apple devices), then **Charis SIL** (a Charter derivative) | Only where Charter isn't installed: regular and italic, a Latin subset, about 80 KB |
| **Georgia** | `Georgia` (Apple, Windows), then the Serif stack | Never |
| **Iowan** | `"Iowan Old Style"` | Never; offered only where installed (Apple devices; the bridge checks with `document.fonts.check`). Elsewhere the row isn't shown |
| **Sans** (the iPhone's San Francisco) | `system-ui` | Never |

The `@font-face` rules are always in the CSS; a browser downloads a face only when a
character is drawn in it, so an Apple device never fetches Source Serif or Charis. Both are
under the SIL Open Font License, credited on the About page (§W12.8). A setting's row is
set in its own font, as §3.7. The setting is stored by name, so the iPhone's index and the
web's never need to agree.

Greek and Hebrew (§7.3) use bundled faces loaded only when Study or a language page first
needs them (phase d): **Gentium Plus** for Greek and **Ezra SIL** for pointed Hebrew (both
OFL), after `ui-serif` on Apple devices. The builder checks coverage against every
character in `words.bin`, `lexicon.txt` and `letters.txt` (a test lists any character
neither face has) and may substitute another OFL face if one falls short, saying which.

### W1.7 Icons

**SF Symbols can't be used on the web:** Apple's licence allows them only in apps for
Apple's platforms. The web uses **Lucide** (ISC licence, credited on the About page), a
line icon set with close equivalents, inlined as one SVG sprite of the ~40 icons used
(about 8 KB gzipped), drawn at 1.5 px strokes in `currentColor`. The ribbon glyph is our
own (§11.2.6), its path redrawn as SVG. Each §2.6 row maps:

| iPhone (SF Symbol) | Web (Lucide unless noted) |
|---|---|
| `magnifyingglass` | `search` |
| `bookmark` / `bookmark.fill` | `bookmark` / `bookmark` filled with `currentColor` |
| `textformat.size` | `a-large-small` |
| `chevron.down` / `chevron.left` / `chevron.up` | `chevron-down` / `chevron-left` / `chevron-up` |
| `doc.on.doc` | `copy` |
| `square.and.arrow.up` | `share` |
| `square.and.pencil` / `note.text` | `square-pen` / `sticky-note` |
| `xmark` | `x` |
| `circle.slash` | `circle-slash` |
| `checkmark` | `check` |
| `highlighter` | `highlighter` |
| `clock.arrow.circlepath` | `history` |
| `arrow.right.circle.fill` | `circle-arrow-right` (filled) |
| `books.vertical` | `library-big` |
| `character.book.closed` | `book-a` |
| `brain` | `brain` |
| `globe` | `globe` |
| `lightbulb` | `lightbulb` |
| `book.closed` | `book` |
| `calendar` | `calendar` |
| `circle` / `checkmark.circle.fill` / `circle.lefthalf.filled` | `circle` / `circle-check` (filled) / `circle-half` (our own, a half-filled circle) |
| `play.fill` / `pause.fill` / `stop.fill` | `play` / `pause` / `square`, filled |
| `headphones` / `speaker.wave.2` | `headphones` / `volume-2` |
| `keyboard` | `keyboard` |
| `ellipsis.circle` | `ellipsis` |
| `hand.tap` | `pointer` |
| `textformat.abc` | `languages` |
| `trash` | `trash-2` |
| the ribbon | our own SVG |

`help.l8`'s `{sym:name}` takes the SF name; the web maps it with this table (a test fails on
a name with no web icon, §W14.4).

### W1.8 Prerendered pages, and adopting them

**Every chapter of every bundled version is a static HTML page, made at build time by the
same `html.l8`** (5 versions × 1,189 chapters = 5,945 files, about 12 KB each before
compression), plus a book index per version (`/read/bsb/`). Decided because:
1. **The first paint is the text.** A shared link to John 3 on a phone shows John 3 as soon
   as about 15 KB of HTML and CSS arrive, before any wasm or Bible text loads (§W13).
2. **Search engines and link previews** see real chapters with titles and descriptions.
3. **It reads without JavaScript**, on an old browser, or while the app is still loading:
   a plain, accessible, printable website with working links (each chapter's previous and
   next chapter, and the book index).
4. **It costs nothing at run time:** static files from the Worker's assets, no server
   rendering, no CPU limits.

The ESV is never prerendered (§W12.6): its pages are the app's shell, drawn in the browser.

**The prerenderer** (`programs/bible/prerender.l8`) is a native L8 program run by `make bible-web`:
it loads each version with `text_load`, calls `html_chapter` for each chapter, and fills
the page template (`web/bible/page.html`) with the chapter's title, description, canonical
link and neighbours' links. It writes `.build/bible-site/read/<v>/<book>/<n>.html`.

**What a prerendered page holds:** the boot script (inline, about 1 KB, §W3.2), the
stylesheet link, the bar as links (the title links to the book index, the search icon to
`/read/search`, Library and Aa as buttons that do nothing until the app starts and are
hidden until then), the chapter's `<article>` with every verse number, heading and
footnote mark present (the settings hide them by CSS), a pager ("‹ John 2 · John 4 ›",
real links), and the credit line ("Berean Standard Bible · Public Domain · About").

**Adopting.** When the app starts on a prerendered page it doesn't redraw the chapter: it
knows the markup is exactly what `html_chapter` would write for this chapter with the
default layout, so it takes the `<article>` as its own, adds marks by class, hides the
pager and the footnote list, and starts loading the neighbouring chapters (§W3.3). The
only exception is verse-per-line, which re-renders the chapter at once, keeping the
place (§W3.5). The `html` element gets class `app` when the app has taken over; the CSS
shows Library, Aa and the reader's tools only under `.app`.

### W1.9 Files and building

The builder began with `programs/bible/web.l8` and `web/bible/` (9befcaab); the design
keeps those places:

| Path | What |
|---|---|
| `programs/bible/html.l8`, `test_html.l8` | Portable (§W1.5) |
| `programs/web/dom.l8`, `web/dom.js` | The bridge (§W1.3) |
| `programs/bible/web.l8` | `main`: boot, routing, the events' dispatch, settings |
| `programs/bible/web_reader.l8` | The page, the window of chapters, the bar, the place, footnotes |
| `programs/bible/web_*.l8` | One per feature, as phases add them: `goto`, `search`, `tray`, `library`, `note`, `settings`, `versions`, `esv`, `compare`, `ribbons`, `plans`, `day`, `listen`, `study`, `memory`, `practice`, `learn`, `help`, `backup` |
| `programs/bible/prerender.l8` | Build-time pages (§W1.8) |
| `web/bible/bible.js` | Starts the module (begun) |
| `web/bible/page.html` | The page template (prerendered chapters and the shell) |
| `web/bible/read.css` | §W1.6 |
| `web/bible/icons.svg` | The sprite (§W1.7) |
| `web/bible/sw.js`, `manifest.webmanifest` | Phase f |
| `web/bible/fonts/` | The subsets (§W1.6), with their licences |
| `web/bible/test/` | The CDP driver and the shot list (§W14) |

`make bible-web` (begun; it builds `.build/bible-web` today) grows to build the whole site to deploy, in `.build/bible-site/`: a copy of `programs/bible/site/` (the
marketing pages, unchanged) plus `read/`: the shell (`read/shell.html`), the prerendered
pages, `read/app.<hash>.wasm`, `read/bible.<hash>.js`, `read/dom.<hash>.js`, `read/read.<hash>.css`,
`read/icons.<hash>.svg`, `read/data/<name>.<hash>.gz` (§W12.1), `read/sw.js`,
`read/manifest.webmanifest`, `robots.txt` and `sitemap.xml`. Hashed names are cached
forever (`Cache-Control: public, max-age=31536000, immutable`, set by the Worker); the
HTML is revalidated. The Worker's `[assets] directory` becomes `../../../.build/bible-site`
(deploying stays the owner's step, as README's).

---

## W2. URLs, history and the site

### W2.1 Where the app lives: smoothbible.com/read/

**Decided: `https://smoothbible.com/read/`**, on the same origin as the marketing site and
the API:
- **Same origin as `/api/v1`,** so the ESV calls need no CORS and no preflight (the Worker
  sends no CORS headers today, and needn't start).
- **One name to remember and share.** "smoothbible.com/read/john/3" is what a person would
  type; a subdomain adds nothing a visitor wants.
- **The marketing pages stay as they are** (static, no scripts, §site/DESIGN.md), and the
  app's scripts, Service Worker and storage are scoped to `/read/`. The Service Worker's
  scope is `/read/` (§W9).
- Not the root: the home page explains the app (and the iPhone app) in two paragraphs; a
  reader opening `smoothbible.com` should still find that page. Its change is §W2.5.

**The Worker's change** (routing only): for a path under `/read/` with no asset (an ESV
chapter, a manual page, a mistyped book), it answers with `read/shell.html` and status
200 when the path has the shape of a reader URL (§W2.2), else the site's 404 page. It sets
the cache headers of §W1.9 and the security headers of §W12.7 on everything under
`/read/`.

### W2.2 The URLs

| URL | What | Made by |
|---|---|---|
| `/read/` | Your place (or Genesis 1 in the BSB the first time): the boot script replaces the URL with the place's before the first paint | The shell; without JavaScript, the BSB's book index |
| `/read/bsb/john/3` | John 3 in the BSB | Prerendered |
| `/read/bsb/john/3#16` | John 3, scrolled to verse 16 one third down, flashed (§4.4) | Prerendered page; the boot script scrolls before the app starts |
| `/read/bsb/john/3#16-18` | A range, the first verse placed, the range flashed | As above |
| `/read/kjv/…`, `/read/web/…`, `/read/asv/…`, `/read/ylt/…` | The other bundled versions | Prerendered |
| `/read/esv/john/3` | The ESV, drawn from the API | The shell, `noindex` (§W12.6) |
| `/read/bsb/` | The version's books, each with its chapters as links | Prerendered |
| `/read/search?q=born+again` | Search, its query in the URL so a search can be shared and Back returns to it | The shell (phase b) |
| `/read/plans/mcheyne/32` | A plan's day in the day reader (§16, phase c) | The shell |
| `/read/manual/`, `/read/manual/ribbons` | The manual (§15), as pages | Prerendered from `help.txt` (phase c) |
| `/read/about` | Acknowledgements, the ESV's copyright page, credits, Privacy link (§W12.8) | Prerendered |

- **Book names** are lower-case full names with hyphens: `genesis`, `1-samuel`,
  `song-of-songs`, `psalms`, `1-john`, `revelation`. A one-chapter book still has `/1`
  (`/read/bsb/jude/1`); `/read/bsb/jude` goes there.
- **The version is always in the URL,** so a shared link shows what the sharer saw. The
  first-time default is the BSB.
- **Anything else under `/read/` that names a passage is understood** by the app with
  `parse_ref` and replaced with its canonical URL: `/read/jn3:16`, `/read/kjv/ps/23`,
  `/read/john/3` (your version). Phase b.
- **The verse is the fragment** (`#16`), because it is a place within the page: it needs
  no extra file, Back between verses of one chapter is natural, and a chapter page holds
  every verse. The cost is that link previews describe the chapter, not the verse (§W2.4).

### W2.3 History, Back, and the back capsule

- **A jump is a history entry** (`pushState`): Go To, a search result, a Library row, a
  link, a reference's Open in Reader, the next and previous chapter keys. Its state holds
  the place to return to exactly (chapter, verse, fraction; §W3.5).
- **Reading on is not:** as the chapter in the bar changes while you scroll, the URL and
  title change with `replaceState`. So the address bar always names the chapter you're
  reading, and Back never walks through every chapter you scrolled past. On every rest
  (scroll end), the entry's state is updated with the exact place.
- **Back returns to the place before the jump,** at the same verse; Forward goes again.
  `history.scrollRestoration = "manual"`: the app restores places by verse, never by
  pixels, because the pixels change with the width and the text size.
- **The back capsule** (§3.1.6) stays: after a jump it shows "‹ Psalm 23", the previous
  entry's name (kept in the current entry's state), and clicking it does `history.back()`.
  It's the browser's Back made visible and named, and it hides by §2.7's rules. The
  capsule and Back can never disagree, because they are the same step.
- **Dialogs are history entries too** (on every width): opening Go To, Search, the
  Library, a note, Study as a sheet, Compare or Practice pushes an entry with the same URL
  (Search's carries `?q=`), so **Back closes the dialog** (Android's back button, the
  browser's, the iPhone's edge swipe in Safari). Closing it any other way (Done, Escape, a
  click outside a centred dialog) goes back one entry. A screen pushed inside a dialog is
  not an entry; its own "‹" goes back within the dialog. A jump from a dialog replaces the
  dialog's entry with the jump, so Back from the new place returns to the place before it,
  not to the closed dialog.
- **Popovers** (footnotes, previews), the tray and Reading settings are not entries;
  Escape or a click elsewhere closes them.
- **The page title** is the chapter and version: "John 3 · BSB · Smooth Bible"; with a
  dialog open, unchanged; the day reader "Day 32 · Chronological · Smooth Bible"; the
  manual "Ribbons · Manual · Smooth Bible".

### W2.4 Sharing links

- The tray's Share and Copy (phase b) include the link: `https://smoothbible.com/read/bsb/john/3#16`
  after the text and reference (§3.3.6), on its own line.
- **Each prerendered page's head:** `<title>`; `<meta name="description">` with the
  chapter's first verse; `<link rel="canonical">`; Open Graph `og:title` ("John 3 ·
  Berean Standard Bible"), `og:description` (its first verse), `og:url`, `og:image` (the
  icon), `og:site_name` "Smooth Bible". A verse link's preview names the chapter. (A
  preview with the verse itself would need the Worker to read the text: deferred,
  §W15.2.)

### W2.5 The marketing site

- **The home page gains one sentence and a link**, the only change: paragraph 1 begins
  "Smooth Bible is a free Bible reader for iPhone and the web." and paragraph 2 ends "It can
  be read on the web at smoothbible.com/read." with that address a link. Third person,
  plain, as site/DESIGN.md requires. (§W16 question 1; the owner may want it worded
  otherwise, or the link elsewhere.)
- The site's own rules (no scripts, no web fonts, nothing external) stay for the marketing
  pages. The reading app is a separate thing that lives under `/read/`.
- The privacy policy is broad and needs no change for the web (it already covers "the app
  and site"); §W16 question 7 asks the owner to confirm.
- `robots.txt`: allow `/read/`; disallow `/read/esv/`, `/read/search` and `/api/`.
  `sitemap.xml`: the home page, the five versions' book indexes and chapters, the manual.
  The ESV is in neither.

---

## W3. Phase (a): the reader alone

**What it is:** the whole Bible in the five bundled versions as a continuous page with the
iPhone's typography, themes and settings, at every width, with URLs, the place kept, the
bar, footnotes, and the prerendered pages. **Worth having alone:** it is already a better
way to read the Bible on the web than most, and links to it can be shared. Navigation in
(a) is the book index pages and the chapter keys; Go To comes in (b).

### W3.1 In phase (a)
1. The bridge and `web.l8`'s start (§W1.3); the boot script; adopting a prerendered page
   (§W1.8).
2. `html.l8` and `test_html.l8`; the prerenderer; the book index pages; `make bible-web`.
3. The reader: the window of chapters and continuous scroll (§W3.3); the bar and its
   collapse (§W3.4); the title naming the chapter (§0.5 item 1); the place (§W3.5).
4. Footnotes (§W3.6), with their references plain (previews are phase b).
5. Reading settings (§W3.7), less Version (phase b) and Listen (phase d).
6. The keys that scroll and change chapters (§W10.1).
7. Keep the Screen On (§8.2) with the Screen Wake Lock API, a switch in Reading settings,
   off by default as on the iPhone.
8. Print (§W3.8).
9. The Worker's `/read/` routing and headers (§W2.1); the About page (§W12.8).
10. CI's web job, phase (a) shots and checks (§W14).

### W3.2 The page

```
┌───────────────────────────────────────────────┐
│ [search]        John 3 ▾         [bookmark][Aa] │  ← the bar, fixed, 44 px (+ safe area)
├───────────────────────────────────────────────┤
│              ┌──────── 34 em ────────┐          │
│              │          JOHN          │          │
│              │           3            │          │
│              │ Jesus and Nicodemus    │          │
│              │ ¹Now there was a man … │          │
│              │ …                      │          │
│              │         ───            │          │  ← chapter divider
│              │          JOHN          │          │
│              │           4            │          │
│              └────────────────────────┘          │
│ (‹ Psalm 23)                                     │  ← back capsule (phase b)
└───────────────────────────────────────────────┘
```

- **The document scrolls,** not an inner box. This is what makes the web's own behaviour
  work: mobile Safari and Chrome shrink their address bars as you read, Space and Page
  Down page through the text, the scroll bar is the browser's, Find scrolls to matches,
  and the browser keeps the place in a tab that is reloaded.
- **Landmarks:** the bar is `<header>` (banner) holding a `<nav aria-label="Reader">`;
  the text is `<main>`; Study beside the text (phase d) is `<aside>`; the credit line
  `<footer>`.
- `<main>` has `padding-top` equal to the expanded bar's height, constant: the bar
  overlays the text, and collapsing it reveals lines without moving any (§3.1.4's rule).
  `scroll-padding-top` is the same height, so Find, fragment jumps and Page Down keep the
  line under the bar visible.
- **Widths.** One layout that grows, decided by the column, not by device names:
  - **Narrow (under 600 px wide: phones):** the column fills the width less the margins;
    dialogs are full-screen sheets that rise from the bottom; Reading settings is a
    bottom sheet over the lower half, the page live above it.
  - **Medium (600–999 px: tablets, small windows):** the column is 34 em, centred, the
    margins quiet; dialogs are centred panels 560 px wide; Reading settings a popover
    under Aa.
  - **Wide (1000 px and up, and wherever Study beside the text fits, §W7.4):** as medium,
    and Study (phase d) opens beside the page.
  - The bar's buttons and the capsules stay at the window's edges at every width (as the
    iPad's floating controls, §17.2.3); the tray and the mini player are centred under the
    column, at most 34 em + 24 px wide.
- **Safe areas:** `viewport-fit=cover` and `env(safe-area-inset-*)` on the bar, the tray,
  the capsules and the sheets, for the iPhone's notch and home indicator in landscape and
  when installed (phase f).

**The boot script** (inline in the page's head, about 1 KB, its hash in the CSP):
1. Reads the settings from `localStorage` and sets `<html>`'s attributes and `--step`
   (§W1.6), and the theme colour meta.
2. On `/read/`: replaces the URL with the saved place's (or `/read/bsb/genesis/1`) and,
   when that page isn't this one, `location.replace`s to it.
3. On a page whose version isn't the reader's saved version, it does nothing: the URL
   wins (a shared KJV link shows the KJV), and the reader's version becomes the KJV only
   if they then change the version themselves (phase b).
4. Tests WebAssembly support (§W1.1), then loads `bible.<hash>.js` as a module.
5. A fragment (`#16`): once the article is parsed, scrolls verse 16 to one third down the
   space under the bar and adds `flash` (§2.7), so a shared verse link lands right even
   before the app has started.

### W3.3 Continuous scroll in a document: the window of chapters

The iPhone's table holds all 1,189 chapters as rows of estimated height. A web page can't
hold the Bible's 31,000 verses in its DOM without making every phone slow, so the page
holds a **window of chapters** around the place and moves it as you read.

**The window:**
- At rest it holds the chapter at the reading line, **at least two chapters above and
  three below it** (more if they're short: at least 1.5 viewport heights of text above and
  3 below), and at most 12 chapters or 2,000 verses (Psalm 119 is 176). Across a book's
  end it continues into the next book, from Genesis 1 to Revelation 22, without a break,
  as the iPhone.
- Chapters are added by `html_chapter`: one `<article>` made and its HTML set, inserted before or after the window.
- **Adding below never moves anything,** so it happens at once, whenever the reading line
  is within 3 viewport heights of the window's end, mid-scroll or not.
- **Adding above or removing anything above changes the scroll height above the reader,**
  so it happens **only at rest** (scroll end), and in the same frame the app scrolls by
  the height added or removed (`dom_scroll_to` from where it was), measured with `dom_rect` before and after
  in one task, so no pixel moves on screen. This is §9.4.11's lesson: never write the
  scroll position while the page is moving, because on iOS that stops a fling dead.
  (Chrome's and Firefox's scroll anchoring would do this by themselves, but Safari's
  can't be relied on, so the app does it everywhere and sets `overflow-anchor: none` so
  the two never fight.)
- **A fast fling upward can reach the window's top before any rest.** The page then
  stops there, as any page stops at its top, and the chapters above go in at the rest
  (the reader scrolls on into them). To make that rare, the window keeps 1.5 screens above
  at rest, and while the page moves upward faster than 3 viewport heights a second the app
  prepares the next chapters above as HTML strings, so they go in at the first rest without
  delay. The CI counts how often a scripted fling meets the edge (§W14.3).
- **Removing below** (beyond the window's limit) happens at rest too, though it moves
  nothing, so the page's length doesn't jump under a scroll bar being dragged.
- **The scroll bar** is the window's, not the Bible's: its thumb shows your place within
  the dozen chapters held. Accepted: the web's readers know the bar as the page's, and
  Go To is the way to move far.
- **The end and the start:** after Revelation 22, 120 px and nothing else (§2.4); above
  Genesis 1, the top gap only.

**Nothing moves when marks arrive.** Highlights and selection only colour a background. The
bookmark glyph is an inline `::before` on the verse number, 0.55 em tall and
`line-height: 0`, and a note's glyph a 0.62 em inline button at the verse's end; either can
re-wrap the line it sits in. To keep that from moving the text above the reading line,
marks for a newly adopted or added chapter are applied in the same task that adds it (the
app knows them before the HTML goes in: `html_chapter` takes the marks and writes the
classes and glyphs into the HTML itself), and a mark made by the reader re-wraps only its
own verse's lines, below where the eye is.

### W3.4 The bar

§3.1.4's behaviour, in CSS transforms:
- **Expanded:** 44 px (plus the top safe area): Search on the left, the title in the
  middle ("John 3" with a small chevron, linking to the book index in (a) and opening Go
  To from (b)), Library and Aa on the right (Library from phase c). 17 px semibold title,
  icons in ink at 85%, 44 × 44 px targets. A backdrop of `bg` at 92% with
  `backdrop-filter: blur(20px)` and an 18 px fade below it into the page; a `rule`
  hairline when collapsed.
- **Collapsed:** 20 px tall: the title alone, scaled to 12/17 and at 75% ink, centred.
  The icons fade out (`opacity: 1 − 1.6p`, `scale: 1 − 0.5p`) and stop taking clicks
  past `p = 0.5`.
- **`p` follows the scroll** as §3.1.4 says: 48 px of downward reading collapses it; 12 px
  of upward travel before it begins to return, then 48 px; capped by the distance to the
  top, so it is always expanded at the very top; ignoring rubber-banding. It's applied in
  the scroll handler's animation frame as a CSS custom property (`--p`) the bar's
  transforms read; no layout property changes, so it costs nothing per frame.
- **Settling:** at scroll end, a `p` between 0 and 1 eases to the nearer end of the last
  direction in 0.25 s (a CSS transition switched on only for the settle).
- **It expands** on a click on the collapsed title, at the top, when a dialog opens (in
  the same frame), on any jump, and on keyboard focus moving into it (Tab from the page).
  It never collapses while a screen reader is likely in use (`p` stays 0 when focus is in
  the bar, and the bar is always fully present in the accessibility tree).
- **The title's text changes in place** (§0.5 item 1): it names the chapter whose article
  holds the bar's bottom edge, with a 0.18 s cross-fade (an opacity transition on two
  stacked spans), never empty. The URL and the page title change with it (§W2.3). There's
  no status-bar tap on the web; **Home** and **⌘↑** scroll to the page's top in a browser,
  which on our page is the window's top, so the app takes **Home** (when no field has
  focus) to mean §3.1.4's status-bar tap: the top of the chapter read, or the previous
  chapter's if already there (§W10.1).

### W3.5 The place

- **The place is (chapter key, verse key, fraction through the verse) at the reading
  line,** a line just under the expanded bar's bottom (§0.5 item 3). The bridge's
  `dom_point` finds the verse span under that line with `elementFromPoint` at the column's
  centre (falling back to the nearest `[data-v]` above it in a gap or heading), and the
  fraction from the span's client rects.
- **Saved** to `localStorage` (`sb.place`, with the version) at every scroll end, on
  `visibilitychange` to hidden and on `pagehide`; and into the history entry's state at
  every scroll end (§W2.3). Synchronous, so it can't be lost to a closing tab.
- **Restored** after every change that reflows the text: a resize or rotation (after 100
  ms of quiet), a settings change (size, font, spacing, margins, the show switches,
  verse-per-line), a version change, fonts finishing loading (`document.fonts.ready` and
  `loadingdone`), and Back and Forward. The app computes the verse's new top with
  the verse's spans' rects and scrolls so the same fraction of the same verse sits at the reading
  line. Restoring is an instant scroll at rest; during a scroll it waits for the rest.
- On the first paint of a prerendered page the place is the fragment's verse, or the
  chapter's top.

### W3.6 Footnotes

- A mark (§W1.5) is a link to its note in the chapter's list. With the app, a click opens
  a **popover** beside the mark (above it if there's room, else below; 16 px from the
  screen's edges), as §3.1.5: on `cellBg` (§W1.6), a header "Footnote · Genesis 1:3" in 12 px semibold `faint`,
  6 px, the note in the body font at 0.88 em (15–22 px), line height 1.25, at most 300 px
  wide, a shadow as §3.1.6's.
- Escape, a click elsewhere or scrolling the mark off screen closes it. The popover has
  `role="dialog"` and a label "Footnote, Genesis 1:3"; focus moves into it when opened by
  the keyboard and returns to the mark on close.
- References in a note are plain text in (a) and links that preview in (b) (§8.1).

### W3.7 Reading settings in phase (a)

The Aa button opens Reading settings (§3.7) as a non-modal sheet (narrow) or a popover
(wider), the page live behind it so every change is seen at once, as on the iPhone:

1. **Text size:** a range input with the eight steps, smaller and larger buttons at its
   ends (`a-large-small` small and large), the caption "Also follows the browser's text
   size."
2. **Theme:** the six round swatches as §3.7 (Auto split diagonally, each with "Aa" in
   its ink), as a radio group (arrow keys move between them).
3. **Font:** Serif, Charter, Georgia, Iowan (where installed), Sans, each row in its own
   font, a checkmark on the chosen (a radio group).
4. **Layout:** Line Spacing (Compact, Normal, Relaxed) and Margins (Narrow, Normal, Wide)
   as segmented radio groups.
5. **Show:** Verse Numbers, Section Headings, Footnote Marks, One Verse per Line, Words of
   Jesus in Red (§8.8, off), Keep the Screen On (off), as switches.
6. **Keyboard Shortcuts** (on), a switch with the footer "Single keys such as G for Go To
   and / for Search. Turn off if they get in the way." (§W10.1; WCAG 2.1.4).
7. The footer: the version's line ("Berean Standard Bible · Public Domain"), and **About
   Smooth Bible** (a link to `/read/about`).

Phases add their rows in the iPhone's places: Listen first (d), Version (b), Help with Show
Tips and the Manual (c), and This Browser (§W12.4, c).

Every change is applied by setting an attribute on `<html>` (except verse-per-line), saved
to `localStorage` at once, and the place is restored (§W3.5). A theme change cross-fades
the page: the app adds a class that turns on a 0.25 s `background-color` and `color`
transition for that one change (none under reduced motion). Font, size and spacing
changes are instant, keeping the place (§2.7).

### W3.8 Print

`@media print`: the bar, capsules, tray and popovers are hidden; the text is black on
white in the reader's font at 11 pt with the chosen layout; the footnote list is shown at
each chapter's end; highlights print as light washes only if the browser prints
backgrounds. The app prints **the chapter at the reading line** alone: on `beforeprint` it
hides the window's other chapters, and on `afterprint` shows them again. The credit line
prints at the end.

### W3.9 Phase (a) acceptance
1. A prerendered John 3 shows its text, styled, with no JavaScript (scripts disabled in
   the CDP session): headings, poetry indents, small caps, footnote marks linking to the
   notes at the end, the pager's links working.
2. With the app, for a reader with no marks: the same page is adopted with no change of any
   pixel in the text (a screenshot before and after the app starts is identical below the
   bar, scripted with a hold on the wasm's response).
3. Scrolling from John 3 to Acts 1 and back by script passes through every chapter with
   the title changing in place, the URL following with `replaceState`, the history length
   unchanged, and no frame where the text jumps (the CI records the verse at the reading
   line every frame; it must change monotonically with the scroll).
4. The window never holds more than 12 chapters; at rest, never fewer than 2 above and 3
   below (except at the Bible's ends).
5. A resize from 390 to 1280 px wide and back, a font change, a size change to step 7 and
   back, and a theme change each keep the same verse at the reading line (to within one
   line).
6. Reload keeps the place exactly; `/read/` opens at the place.
7. `/read/bsb/john/3#16` places verse 16 one third down and flashes it, before and after
   the app starts.
8. Every theme at 390 and 1280 px matches §2.1 and §W1.6; every text in `faint` passes
   4.5:1 (CI computes it from the computed styles).
9. The bar collapses and expands in step with the scroll, never moving the text (a pixel
   comparison below the bar at `p = 0` and `p = 1` with the content still).
10. Footnote popovers open and close by click, keyboard and Escape.
11. Printing John 3 gives John 3 alone with its footnotes (the CI prints to PDF via CDP's
    `Page.printToPDF` and checks the text).
12. First load on the CI's 4G profile meets §W13's budget for (a).

---

## W4. The phases at a glance

Each phase is worth having on its own and is reviewed before the next (a `REVIEW-web-<x>-1.md`
per phase, as the iPhone's rounds). The order follows the owner's priorities (reading,
then notes, then language tools) with what a web reader needs first:

| Phase | What | Needs | Specified |
|---|---|---|---|
| **(a) The reader alone** | The five bundled versions as a continuous page, prerendered, URLs, the bar, the place, footnotes, settings, print | The bridge, `html.l8` | §W3 |
| **(b) Navigation, search and versions** | Go To with Recent and the tip row's place reserved, the back capsule, passage previews, History, Search, verse selection and the tray (Copy, Share, Compare), version switching, the ESV, Compare | Storage of history (IndexedDB from here) | §W5 |
| **(c) Marks, notes and the rest** | Highlights, bookmarks, notes and chapter notes, the Library, export and backup and restore, ribbons, plans and the day reader, the manual and tips, multi-tab safety | §W12.2–§W12.4 | §W6 |
| **(d) Listen and Study** | Recordings with verse following, the device's voice, the ESV's audio, Media Session, the mini player; Study (Words, References, Commentary), word study, definition, concordance, Study beside the text | The language data (§W12.1) | §W7 |
| **(e) Memory and languages** | Memorize, Practice, the Library's Memory; Greek and Hebrew foundations as §14.10b has them | (d)'s data | §W8 |
| **(f) Offline and installing** | The Service Worker, the manifest, installing, storage persistence, quiet updates | Everything before | §W9 |

Offline comes last, as the owner listed it, and that is safe: from (a) every data file has
a hashed name and a year's `immutable` cache header, so a returning visitor's browser
already holds the app and the text and loads them without the network's round trips;
(f) adds working with no network at all.

*(§W5–§W16 follow.)*
