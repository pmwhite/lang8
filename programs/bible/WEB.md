# Smooth Bible on the web: design specification

> 2026-10-21: Bible test suites, browser checks and simulator screenshot
> automation were removed at the owner's request. Test/screenshot instructions
> below are historical; current build commands are in README.md.

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
the Manual's pages). WEB.md says how each feature takes its web form, and what is different
on the web and why. **Where WEB.md is silent, DESIGN.md's behaviour and wording hold**,
with three standing translations: "tap" in the copy becomes "click or tap" only where a
mouse is likely (the manual's web text, §W14.4); UIKit's controls become the HTML
controls named in §W1.4; and an SF Symbol becomes the web icon named in §W1.7.

**Status.** Written 2026-10-20. The builder's phase 0 (9befcaab) built the bridge
(`programs/web/dom.l8`, `web/dom.js`), ran the portable modules' tests in wasm, and drew
John 3 in a spike; §W1 and §W3 (phase a) were pushed first so the work can follow them.
Phases (a)–(f) are specified; none is built.

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
9. **It works offline once visited** (phase f).

### A visit, start to finish (what the design adds up to)

A friend sends a link: `smoothbible.com/read/bsb/john/3#16`. On her phone the page shows
John 3 within a second, in the iPhone app's paper colour and serif type, verse 16 a third
of the way down with a faint wash that fades; the bar above reads "John 3". She scrolls,
and John 4 follows without a break, the bar tucking
itself into a small "John 4" while the address bar says `/read/bsb/john/4`. She taps
verse 24; it takes a dotted wash and a tray rises from the bottom with its reference,
five colours and Copy, Share, Bookmark, Note, Study, Compare and Memorize. She picks
yellow. She taps the title, Go To opens as a sheet, she types "ps 23", presses Go, and is
in Psalm 23; a capsule at the bottom left says "‹ John 4", and her phone's Back does the
same. Aa gives her the six themes and the type, changing the page live under the sheet.

At her desk the next day she opens `smoothbible.com/read/` on her laptop: a different
browser, so it starts fresh (there's no sync), at Genesis 1. The column is the same 34 em
in a wide window, quiet margins on both sides. She presses G and types "rom 8", / and
searches "more than conquerors"; Study on a verse opens beside the text on the right and
stays there while she reads on. Before closing the tab she chooses Back Up… in Reading
settings, and keeps the file. On her phone she later adds the page to the Home Screen; it
opens like an app, without the browser's bars, and reads on a plane with no connection.

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
**Chrome and Edge 137**, **Firefox 131**, or later. The boot script tests support with
`WebAssembly.validate` on a 30-byte module using `try_table`; on an older browser the page
says so in one plain line (§W1.8).

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
| The sizes table's tool | `programs/bible/tools/sizes.l8` (native, build time) | **New** (§W1.8); `prerender.l8` is deleted |
| The Worker | `programs/bible/worker/` | Two small changes: serving `/read/` (§W2.1) and the web's share of the ESV budget (§W12.6) |

**Moving shared screen logic.** When a web screen needs logic the iPhone keeps inside an
`ios_*.l8` file (the copy and share format of §3.3.6, the reference label "John 3:16, 18",
which tray actions show, Go To's sections and their order, a
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
  (or the `_of` form, straight from L8's buffer): one string per chapter, which the
  window (§W3.3) adds and removes whole.
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
chapter as an `<article>`.

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
  in print, each led by its mark's letter and reference ("a  John 3:3 Or born from
  above…"; REVIEW-web-a1 m2).
- **Marks** are classes and two small inline elements. `html_chapter` takes the
  chapter's marks and writes them into the HTML of every chapter the app adds; a mark
  made while reading is added with `dom_class_all`. They are: `hl-yellow` …
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
  for prose only, limited to words of 8 letters or more and never two lines in a row
  (`hyphenate-limit-chars: 8 4 4`; Safari's `-webkit-hyphenate-limit-before/after: 4`
  and `-webkit-hyphenate-limit-lines: 1`), the nearest the web has to the iPhone's 0.3
  factor; poetry, lists and centred lines `hyphens: manual` (amended in REVIEW-web-a1,
  m5).
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

### W1.8 No prerendered pages: one shell, and the place's book first (owner, 2026-10-20)

The owner, 2026-10-20: "the static page thing isn't too important, and seems a little error
prone. It's not like we need search engines to index the Bible one more time." So there
are **no prerendered chapter pages, no takeover of a static page, and no reading without
JavaScript.** (This replaces the first design's prerendered pages, prerenderer and
adoption.)

**Every path under `/read/` is answered by the Worker with the same app shell**
(`read/shell.html`), with the page's title filled in (§W2.1a). The only exception is the
About page (`/read/about`), which is a hand-written static page with no Bible text in it
(§W12.8). The shell holds:
- the boot script (inline, §W3.2);
- the stylesheet link;
- the bar, with its title already set to the place's name by the Worker;
- an empty `<main>`;
- `<noscript>`, saying: "Smooth Bible needs JavaScript to show the Bible.";
- the credit line.

On a browser below the floor (§W1.1), the boot script puts one plain line in `<main>`:
"Smooth Bible needs a newer browser: Safari 18.4, Chrome 137 or Firefox 131, or later."

**First paint: the place's book, not the whole version.** The whole version is 1.3–1.45 MB
gzipped, too much to wait for. So each version is also served **book by book**:
- **The files:**
  - `read/data/<D>/<v>/<book>.gz`: exactly that book's lines of the version file. Psalms
    is the largest at 88 KB gzipped, John is 37 KB and 2 John 1 KB.
  - `read/data/<D>/<v>.sizes.gz`: a table of each chapter's measures (characters,
    paragraphs, poetry and list lines, headings), about 6 KB, written at build time by a
    small native L8 tool, `tools/sizes.l8`, from `layout_chapter`.
  - `<D>` is the data's hash, given to the page in `<meta name="sb-data">`, so these
    names are immutable without a manifest.
- **What the boot script starts at once,** before any other script runs, all in
  parallel:
  - it reads the path and maps the book's slug to its code (a 66-entry table in
    `boot.js`);
  - it fetches that book's file, the sizes table, the CSS (already in the head) and the
    wasm, and leaves the fetches on `window.sbFirst` for the app.
- **`text.l8` gains `text_load_book(t, book, buf, n)`:**
  - text t then holds one book, with **chapter keys that are global** (0–1,188, the same
    as with the whole version) and every other book's chapters absent;
  - the app lays out and shows the place's chapter from it, and the window (§W3.3) works
    within that book;
  - tested in `test_text.l8`: John 3's layout and keys are the same from the book as from
    the whole version.
- **The whole version is fetched next,** at low priority, as soon as the first chapter is
  on screen.
  - When it arrives, `text_load` replaces the single book. The keys don't change, and
    nothing in the DOM is redrawn.
  - Until then, the window may reach the book's end. The neighbouring book's file is
    fetched when the reading line is within three screens of it. Search (b) and other
    versions wait for the whole text, showing "Getting the Berean Standard Bible…".
- **The height table before the whole text** (§W3.3 item 2) is estimated from the sizes
  table. That is nearly as good as from the runs, because it carries the same measures.
  - When the whole text arrives, the estimates are refined, and every refinement follows
    §W3.3 item 3: the anchor never moves.
  - `pos[0]`'s slack starts at 5% of the estimated height above the place, plus one
    screen.
- **The budget** (§W13), on the CI's 4G profile:
  - First visit: **text on screen ≤ 1.5 s**. The worst first paint carries about 140 KB:
    shell 3, CSS 5, scripts 10, wasm 26, Psalms 88, sizes 6.
  - Slow 4G (report-only): ≤ 3 s.
  - A second visit (HTTP cache) ≤ 0.8 s.
  - The whole text's arrival is not budgeted. Nothing a reader starts with waits for it.

**What a fragment does:** `#16` is applied by the app when it first places the chapter
(verse 16 a third of the way down, flashed). There's no earlier placement to do.

**Go To in (a).** Without book index pages, phase (a) needs a way to go to a chapter. The
title opens a first Go To: the books with their chapters (§W5.2's list, without the
field or Recent), which (b) completes.

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
| `programs/bible/tools/sizes.l8` | The chapters' measures for first paint (§W1.8) |
| `web/bible/bible.js` | Starts the module (begun) |
| `web/bible/page.html` | The shell (§W1.8) |
| `web/bible/about.html` | The About page, static (§W12.8) |
| `web/bible/read.css` | §W1.6 |
| `web/bible/icons.svg` | The sprite (§W1.7) |
| `web/bible/sw.js`, `manifest.webmanifest` | Phase f |
| `web/bible/fonts/` | The subsets (§W1.6), with their licences |
| `web/bible/test/` | The CDP driver and the shot list (§W14) |

`make bible-web` (begun; it builds `.build/bible-web` today) grows to build the whole site to deploy, in `.build/bible-site/`: a copy of `programs/bible/site/` (the
marketing pages, unchanged) plus `read/`: the shell (`read/shell.html`), `read/about`,
`read/app.<hash>.wasm`, `read/bible.<hash>.js`, `read/dom.<hash>.js`, `read/read.<hash>.css`,
`read/icons.<hash>.svg`, `read/data/<D>/…` (§W1.8, §W12.1), `read/sw.js`,
`read/manifest.webmanifest`, and `robots.txt`. Hashed names are cached
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

### W2.1a The Worker's changes, exactly (REVIEW-web-a1, 2026-10-20)

**Part 1, for phase (a): `/read/`.** One commit, "Smooth Bible: worker — /read/", made by
the web builder; deploying it is the owner's step.
1. **Routing,** in `fetch`, after the `www` redirect and before the API:
   - `/read` → `301` to `/read/`.
   - A path starting `/read/` → `read(request, env, url)`:
     1. `r = await env.ASSETS.fetch(request)`.
     2. If `r.status === 404` and the path matches `READER`, answer the shell
        (`env.ASSETS.fetch(new Request(new URL("/read/shell", url), request))`) with
        status 200, its head filled for the path (below). After the amendment of
        2026-10-20 (no prerendered pages, §W1.8) this is how **every** reader path is
        answered; only files, the shell itself and `/read/about` exist as assets.
     3. Otherwise `r` as it is (a file, the About page, or the site's 404 page with status
        404).
   - `READER = /^\/read\/(?:(?:bsb|kjv|web|asv|ylt|esv)(?:\/[a-z0-9-]+(?:\/\d{1,3})?)?\/?|search|plans\/[a-z0-9-]+\/\d{1,3}|manual(?:\/[a-z0-9-]+)?|[A-Za-z0-9.:%-]{1,40})?$/`:
     `/read/` itself, a version's chapter or book, search, a plan's day, the manual, or
     one short passage-like segment (`/read/jn3%3A16`) for the app to make canonical.
   - **The shell's head, per path,** with `HTMLRewriter` (no Bible text, no other
     reading of data): for `/read/<v>/<book>/<n>`, `<title>` "John 3 · BSB · Smooth
     Bible", `og:title` "John 3 · Smooth Bible", `og:description` "John 3 in the Berean
     Standard Bible.", `og:url` the address; and the bar's title text "John 3" (so the
     first frame names the place). The names come from a table of the 66 slugs and names
     and the six versions' names in `worker/books.js`, made from `versecounts.js`'s
     `BOOKS` and the BSB's names. Anything else: "Smooth Bible", no description. Psalms'
     chapters read "Psalm 23".
   - **`X-Robots-Tag: noindex`** on every answer under `/read/` (§W2.5).
2. **Headers** on every `/read/` answer (copied into a new `Response`; a 304 keeps them
   too):
   - All: `X-Content-Type-Options: nosniff`, `Referrer-Policy:
     strict-origin-when-cross-origin`, `Permissions-Policy: screen-wake-lock=(self),
     camera=(), microphone=(), geolocation=()`.
   - HTML (`content-type` `text/html`): §W12.7's `Content-Security-Policy` with
     `'${BOOT_HASH}'`, and `Cache-Control: public, max-age=0, must-revalidate`.
   - Hashed files (the path ends `.<10 hex>.css|js|wasm|svg|gz|woff2`) and everything
     under `/read/data/` and `/read/fonts/`: `Cache-Control: public, max-age=31536000,
     immutable`.
   - `/read/sw.js` (phase f): `Cache-Control: no-cache` and `Service-Worker-Allowed: /read/`.
   - Pages outside `/read/` (the marketing site) and `/api/` keep exactly what they send
     now.
3. **The boot script is the same in every build,** so its CSP hash can be committed:
   - The page carries the hashed names in its head:
     `<meta name="sb-app" content="bible.<hash>.js">`.
   - The boot script imports `"/read/" + that meta's content`, not a name filled in by
     the build.
   - `build.py` inlines `web/bible/boot.js` byte for byte, and writes
     `programs/bible/worker/boot_hash.js` (`export const BOOT_HASH = "sha256-…";`), which
     is committed.
   - `test.mjs` recomputes the hash from `boot.js` and fails if the two differ.
4. **`wrangler.toml`:** `[assets] directory = "../../../.build/bible-site"`. `build.py`
   copies `programs/bible/site/` into it, leaving out `DESIGN.md`.
5. **`test.mjs` cases** (with an `ASSETS` stand-in as `serve.mjs` has):
   - `/read` gives 301;
   - the shell carries the CSP and `must-revalidate`;
   - `/read/bsb/john/3`, `/read/esv/john/3` and `/read/kjv/ps/23` give the shell, 200,
     `noindex`, with the titles above (`kjv/ps/23`: "Smooth Bible", since `ps` isn't a
     slug; the app makes it canonical);
   - `/read/a/b/c/d` gives 404;
   - a hashed `.wasm` is `immutable`;
   - `/` and `/api/v1/status` are unchanged.
6. **`serve.mjs`** drops its own routing in front of the Worker.

**Part 2, for phase (b), before the web offers the ESV: the web's share of the budget**
(§W12.6).
- **Who is the web:** a request whose `X-Smooth-Bible` begins `web ` is the web's.
- **Counting:** `spend` counts a web request in the shared buckets as now, and in one
  more bucket in the same `INSERT`:
  - `w:YYYY-MM-DD` for text, `x:YYYY-MM-DD` for audio;
  - both prefixes are two characters, so the day's clean-up (`substr(bucket, 3, 10)`)
    still covers them.
- **Limits:** `WEB_BUDGET = { day: 1500 }` and `WEB_AUDIO_BUDGET = { day: 1000 }`. Past
  them, a web request gets `503 daily_limit`, with `retry` to the day's end.
- **Tests:** the 1,501st web text request of a day gets `daily_limit` while an iPhone
  request still passes, and the same for audio at 1,001.

### W2.2 The URLs

| URL | What | Made by |
|---|---|---|
Every one is the shell (§W1.8), with its title set by the Worker, except `/read/about`:

| URL | What |
|---|---|
| `/read/` | Your place (or Genesis 1 in the BSB the first time): the boot script replaces the URL with the place's before the first paint |
| `/read/bsb/john/3` | John 3 in the BSB |
| `/read/bsb/john/3#16` | John 3, verse 16 one third down, flashed (§4.4) |
| `/read/bsb/john/3#16-18` | A range, the first verse placed, the range flashed |
| `/read/kjv/…`, `/read/web/…`, `/read/asv/…`, `/read/ylt/…`, `/read/esv/…` | The other versions |
| `/read/bsb/` | Go To opened over the version's Genesis 1 (or the place, if in this version) |
| `/read/search?q=born+again` | Search, its query in the URL so a search can be shared and Back returns to it (phase b) |
| `/read/plans/mcheyne/32` | A plan's day in the day reader (§16, phase c) |
| `/read/manual/`, `/read/manual/ribbons` | The manual (§15) opened in its dialog over the place (phase c) |
| `/read/about` | Acknowledgements, the ESV's copyright page, credits, Privacy link (§W12.8): a static page |

- **Book names** are the BSB's names in lower case with hyphens: `genesis`, `1-samuel`,
  `song-of-solomon`, `psalms`, `1-john`, `revelation` (REVIEW-web-a1). A one-chapter book still has `/1`
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
- **The shell's head, filled by the Worker per path** (§W2.1a): `<title>` "John 3 · BSB ·
  Smooth Bible"; `og:title` "John 3 · Smooth Bible"; `og:description` "John 3 in the
  Berean Standard Bible."; `og:url`; `og:image` the icon; `og:site_name` "Smooth Bible".
  No verse text. A path that isn't a passage gets "Smooth Bible" and no description.

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
- **Nothing under `/read/` is indexed:** every answer there carries `X-Robots-Tag:
  noindex`. `robots.txt` doesn't disallow `/read/`, because a crawler has to fetch a page
  to see its `noindex`, and link previews need it. It disallows `/api/`. There's no
  sitemap for the app.

---

## W3. Phase (a): the reader alone

**What it is:** the whole Bible in the five bundled versions as a continuous page with the
iPhone's typography, themes and settings, at every width, with URLs, the place kept, the
bar, footnotes, and the first paint from the place's book (§W1.8). **Worth having alone:**
it is already a better way to read the Bible on the web than most, and links to it can be
shared. Navigation in (a) is a first Go To (books and chapters, §W1.8) and the chapter
keys; Go To is completed in (b).

### W3.1 In phase (a)
1. The bridge and `web.l8`'s start (§W1.3); the boot script; the shell; the first paint
   from the place's book (§W1.8).
2. `html.l8` and `test_html.l8`; the per-book files, `tools/sizes.l8` and
   `text_load_book`; the first Go To; `make bible-web`.
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
4. Tests WebAssembly support (§W1.1), then loads the app as a module, its hashed name read
   from `<meta name="sb-app">` so the script itself never changes between builds
   (§W2.1a).
5. Starts the first paint's fetches: the place's book, the sizes table and the wasm
   (§W1.8).

### W3.3 Continuous scroll: the Bible laid out by a height table (amended 2026-10-20)

**Why it changed.** The owner, on an iPhone, on phase (a) as first built: "there is an
issue when scrolling intentionally around chapter boundaries. Sometimes the position jumps
suddenly", and "I was able to scroll so fast I got to the book list at the bottom of the
DOM". Both come from the first design:
- it added and removed chapters in the page's flow and wrote the scroll position to make
  up for them "at rest";
- on iOS a pause with the finger still down looks like rest, and a write then jumps;
- a page made only of the chapters held has an end a fling can reach.

The owner proposed the answer, and it is the right one for a fixed text: **never move the
scroll position to make up for content; place the content where the scroll position says
it is.**

**The model.**
1. **One scroller, the whole Bible in the version read.**
   - `<main>` holds a spacer whose height is the whole Bible's: `pos[0]` (the space above
     Genesis 1), plus every chapter's height, plus the 120 px after Revelation 22.
   - Each chapter in the DOM is an `<article>` positioned absolutely at `top: pos[c]`
     (`contain: layout paint`).
   - The document is the scroller, as before (§W3.2), so the browser's own scrolling,
     address bar, keys and scroll bar all work, and the bar's thumb now shows the place in
     the whole Bible.
   - The pager and the credit line come after the spacer, so they can only be reached
     after Revelation 22.
2. **The height table:** `height[c]` for the 1,189 chapters, with `pos[c+1] = pos[c] +
   height[c]`. Each height is either *estimated* or *measured*.
   - **Estimated,** by the app in L8 from the chapter's laid-out runs (`layout_chapter`)
     and two measured constants:
     - the column's characters per line, from one sample paragraph set at the current
       font, size and width;
     - the line height.
     The estimate is the opener and dividers, plus each heading's lines and margins, plus,
     for each paragraph, `ceil(characters / per line)` lines (poetry and list lines each
     count their own wrap) and its spacing. Estimating the whole table takes a few
     milliseconds and is done once per version and settings.
   - **Measured** exactly, three ways:
     - when a chapter enters the DOM, in the same task, before paint;
     - in the background, by writing chapters into a hidden measuring box (`position:
       absolute; visibility: hidden; contain: strict`, the column's width) one chapter per
       slice of at most 8 ms, outward from the place in both directions, only while
       nothing scrolls and no finger or button is down;
     - from storage: the table is kept in `localStorage` (`sb.heights`, the three most
       recent keys). The key is the version, the column's width in CSS px, the font,
       size step, spacing and margins, the show switches, verse-per-line, and the root
       font size (the browser's text size).
   - **Thrown away and re-estimated** on any change of those, and when web fonts finish
     loading (`document.fonts` `loadingdone`).
3. **The anchor:** the chapter holding the reading line. **A correction never moves the
   anchor.** When a chapter's measured height differs from its estimate by `d`:
   - **above the anchor,** the chapter keeps its bottom: it and every chapter above it
     move up by `d` (`pos[k] −= d` for k up to it). The space above Genesis 1 (`pos[0]`)
     takes up the error;
   - **below the anchor** (or the anchor itself), the chapter keeps its top: every chapter
     after it moves by `d`, and the spacer grows or shrinks at its end.

   Nothing on screen moves except what was a placeholder becoming text of the same place.
4. **The window:** the chapters overlapping two screens above the viewport and three
   below are in the DOM, written by `html_chapter` (and kept if they hold a selection,
   text or verse). At most two chapters are written per animation frame. While the page
   moves fast, the window reaches ahead in the direction of motion by the distance the
   page will cover in 0.4 s at its current speed. Chapters leave the DOM when they're more
   than four screens away. Adding and removing never changes the layout of anything else,
   so it can happen at any time, mid-fling or mid-drag.
5. **Placeholders,** so a fling never shows emptiness or the page's end:
   - The spacer's own background is the page colour with faint lines at the text's line
     height (`repeating-linear-gradient` of `rule`, inset by the margins).
   - Every chapter's opener ("JOHN / 4") is drawn on it at `pos[c]`, a small absolutely
     positioned element written for the whole Bible at once (1,189 elements of two
     words, cheap).
   - A chapter not written yet therefore shows its name and its lines at its place, and
     its text arrives over them.
6. **When the scroll position is written,** and only then. Each time, the place
   (chapter, verse, fraction) is placed at the reading line in the same frame:
   1. **The first placement** of the place's chapter, once (below).
   2. **A jump:** Go To, a link, `]` `[`, Back and Forward, Home.
   3. **A relayout** after a resize or rotation, a settings change, a version change, or
      fonts loading. The table is re-estimated, the anchor is kept, and the write waits
      until no finger is down and nothing has scrolled for 300 ms.
   4. **Taking up the surplus above Genesis 1:**
      - only when `pos[0]` differs from its exact value by more than half a screen, all
        chapters above the anchor have been measured, and the reader is at **true rest**
        (no pointer or touch down, nothing scrolled for 500 ms);
      - in one frame: everything moves by the surplus and the scroll by the same amount;
      - it is rare, since background measuring makes the table exact before a reader
        could scroll that far.

   The bridge logs every write with its reason (`scroll write: jump`). Any write during a
   touch, a drag or momentum is a defect, and the CI fails on one.
7. **The first placement:**
   - the app builds the table from the sizes table (§W1.8), writes the place's chapter,
     measures it, and sets the scroll so the place sits at the reading line, before the
     first paint of any text;
   - `pos[0]` starts with slack, 5% of the estimated height above the chapter plus one
     screen, so corrections above never push Genesis 1 below zero.
8. **The size limit.** Browsers cap an element's height: Firefox about 17.9 million px,
   Chrome and WebKit about 33.5 million. The whole Bible is about 3.5 million px on a
   phone at the default size, and about 10–14 million at the largest step with a large
   browser text size.
   - When the estimated total passes **12 million px,** the scroller holds one testament.
   - When a testament passes it, the scroller holds one book.
   - Crossing between them is a jump at a boundary, made by a link at the end of the
     scroller ("Matthew 1 ›", or the next book). The CI covers this at the largest step
     with a 200% root size.
9. **What follows from it:**
   - **The title and the address** come from the table (a binary search of `pos` for the
     reading line), with no DOM measuring, so they're right over placeholders too.
   - **History places** stay (chapter, verse, fraction); a position is computed from the
     table when one is restored.
   - **Find in page** finds only the chapters in the window (about the five around the
     place). Search (b) finds anything. The manual says so in one line.
   - **Text selection:** a chapter holding the selection stays in the window until the
     selection is cleared, so a selection can't lose its end.
   - **Anchoring:** `overflow-anchor: none` on the document, so the browser's anchoring
     never adds writes of its own.
   - **Print:** on `beforeprint` the chapter read is put back in the flow with nothing
     else, and on `afterprint` returned to its place (§W3.8).
   - **Keyboard and screen readers:**
     - Space and Page Down scroll the document natively, and the window follows.
     - Each window end has a visually hidden link, "Continue to John 5" (the next chapter
       beyond the window, a real link). Swiping or tabbing past the window's last element
       reaches it, and following it is a jump.
     - VoiceOver's own scrolling to the next element moves the page, and the window
       follows, as for any scroll.
   - **The bar:** writes of the scroll position never count as the reader's movement
     (`last_y` takes them), so a write never collapses or expands the bar by itself
     (REVIEW-web-a1 M1).
10. **What replaces the old limits:** "two chapters above, three below, at most 12" becomes
    the window of item 4. §W3.9's items 3 and 4 become the checks below.

**CI checks for this section** (replacing §W3.9 items 3 and 4):
- **Slow, intentional scrolling across chapter boundaries:** CDP touch drags of 40–200 px
  with pauses of 0.3–1.5 s while the finger stays down, then lifted, across John 3/4,
  Psalms 118/119/120 and Malachi 4/Matthew 1. The first visible verse's top moves exactly
  by the scroll each frame (to 1 px), and no scroll position is written.
- **Fast flings** (`Input.synthesizeScrollGesture` at 8,000 and 20,000 px/s, both
  directions, for 3 s): no frame shows the page's end, the pager or the credit line
  before Revelation, and none shows a strip with neither text nor placeholder.
  Placeholders may show; the shot list gains one mid-fling shot.
- **The first paint:** no pixel of the first chapter moves after it first appears (the
  CI compares the first frame with text against one taken 3 s later, with the whole text
  arrived in between).
- **The estimates:** after calibration, the CI logs estimated against measured heights
  for all 1,189 BSB chapters at phone and desktop widths. The mean error must be at most
  2%, the largest at most 6%, and the sum of signed errors above John 3 at most 1.5% of
  their total.
- **A pause with the finger down over an unmeasured chapter** above the anchor, while its
  measurement lands: nothing visible moves.
- **The size limit:** step 7 with a 200% root size keeps the scroller under 12 million px,
  or uses the testament scroller, and its boundary link works.

### W3.4 The bar

§3.1.4's behaviour, in CSS transforms:
- **Expanded:** 44 px (plus the top safe area): Search on the left, the title in the
  middle ("John 3" with a small chevron, opening Go To: its first form in (a), §W1.8,
  complete from (b)), Library and Aa on the right (Library from phase c). 17 px semibold title,
  icons in ink at 85%, 44 × 44 px targets. A backdrop of the theme's `bg`, **opaque**,
  with no blur (amended in REVIEW-web-a1, M3: at 92% the lines under it stayed legible
  and fought the compact title), and an 18 px fade below it from `bg` to transparent; a
  `rule` hairline when collapsed.
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
  line. Restoring is one of §W3.3 item 6's writes, made only when no finger is down and
  nothing has scrolled for 300 ms.
- On the first paint the place is the fragment's verse, or the chapter's top.

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

Phases add their rows in the iPhone's places: Listen first (d), Version (b), Help with the
Manual and Keyboard Shortcuts' list (c), and This Browser (§W12.4, c).

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
1. `/read/bsb/john/3` shows John 3 styled (headings, poetry indents, small caps, footnote
   marks) from John's file alone, before the whole text arrives (the CI holds the whole
   text's response); with JavaScript off, the `noscript` line; with WebAssembly off, the
   newer-browser line.
2. The first paint: no pixel of the first chapter moves after it appears, as the whole text
   arrives and the window fills (§W3.3's check).
3. Scrolling from John 3 to Acts 1 and back by script passes through every chapter with
   the title changing in place, the URL following with `replaceState`, the history length
   unchanged, and no frame where the text jumps (the CI records the verse at the reading
   line every frame; it must change monotonically with the scroll).
4. §W3.3's CI checks (slow scrolling with pauses, fast flings, estimates, the size limit).
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
| **(a) The reader alone** | The five bundled versions as a continuous page, first paint from the place's book, URLs, the bar, the place, footnotes, settings, print, a first Go To | The bridge, `html.l8` | §W3 |
| **(b) Navigation, search and versions** | Go To with Recent, the back capsule, passage previews, History, Search, verse selection and the tray (Copy, Share, Compare), version switching, the ESV, Compare | Storage of history (IndexedDB from here) | §W5 |
| **(c) Marks, notes and the rest** | Highlights, bookmarks, notes and chapter notes, the Library, export and backup and restore, ribbons, plans and the day reader, the Manual, multi-tab safety | §W12.2–§W12.4 | §W6 |
| **(d) Listen and Study** | Recordings with verse following, the device's voice, the ESV's audio, Media Session, the mini player; Study (Words, References, Commentary), word study, definition, concordance, Study beside the text | The language data (§W12.1) | §W7 |
| **(e) Memory and languages** | Memorize, Practice, the Library's Memory; Greek and Hebrew foundations as §14.10b has them | (d)'s data | §W8 |
| **(f) Offline and installing** | The Service Worker, the manifest, installing, storage persistence, quiet updates | Everything before | §W9 |

Offline comes last, as the owner listed it, and that is safe: from (a) every data file has
a hashed name and a year's `immutable` cache header, so a returning visitor's browser
already holds the app and the text and loads them without the network's round trips;
(f) adds working with no network at all.

---

## W5. Phase (b): navigation, search and versions

**What it adds:** going anywhere (Go To, Back, History, previews), finding anything
(Search), selecting verses with the tray's first actions, and every version (switching,
the ESV, Compare). **Worth having alone:** with (a), a complete reading and study-by-
reading site, still with nothing of the reader's own kept beyond the place, history and
recent searches.

### W5.1 In phase (b)
1. Go To (§W5.2), the back capsule (§W2.3), History (§8.3) pushed from Recent.
2. Passage previews (§8.1): headings' ranges and footnotes' references.
3. Search (§3.6), with the ESV's search row (§9.4.8).
4. Verse selection and the tray with Copy, Share and Compare (§W5.5); the colours,
   Bookmark, Note, Study and Memorize join it in (c), (d) and (e).
5. Versions: the Version row and screen, switching in place (§9.3), the ESV (§W5.7),
   Compare (§9.5).
6. The app reads any passage-like URL under `/read/` (§W2.2).
7. IndexedDB storage begins (§W12.2), for `history.tsv` and recent searches.

### W5.2 Go To

A dialog (§W1.4: a full-screen sheet when narrow, a centred panel otherwise), title "Go
To", Done on the right, opened by the title and by **G**.
- **The field** (`<input type=search>`, placeholder `Book, chapter or verse — "jn 3:16"`,
  no autocorrect or capitalisation, `enterkeyhint="go"`) sits at the top, under the title,
  always visible. It takes focus when the dialog opens on a device with a fine pointer
  (a keyboard is likely); on touch it doesn't, so the keyboard doesn't cover the list
  (§3.2's iPhone sheet doesn't raise it either).
- **Sections with an empty query,** in §11.2.1's order: Ribbons (c) ·
  Reading Plan (c) · Recent · Old Testament · New Testament. Recent as §3.2 and §8.3 (up to
  4, Show All pushes History).
- **Books** are rows that open in place: a book's row is a `<details>` whose `<summary>`
  is "John" with "21" (its chapter count, faint) and a chevron that turns; opening it shows
  its chapters below it as a grid of links (56 × 56 px cells, 10 px apart, as §3.2), the
  current chapter filled with accent. Opening one book closes the one open before. A
  one-chapter book's row is a link straight to its chapter. This replaces the iPhone's
  pushed chapter grid: on the web a disclosure keeps the list where it is, and every
  chapter is a link that can be opened in a new tab. On widths of 900 px and more the
  dialog is 720 px wide and the two testaments sit side by side as two columns.
- **On opening,** the current book's row is open and scrolled to the middle, unless
  there is a ribbon or a plan, which keeps Go To at its top (§11.2.1).
- **With a query:** "Go to" (one row, §3.2) and up to 8 matching books (§3.2's matching),
  each a link. **Enter** goes to the first row; **↓/↑** move a highlight through the rows
  (the field is a combobox: `role="combobox"`, `aria-activedescendant` on the
  highlighted row), Enter goes to it. "No Matches" as §3.2.
- **Every jump** closes the dialog (its history entry replaced by the jump, §W2.3), goes
  to the place, flashes a verse-precise one, and shows the capsule.

### W5.3 Previews

A reference inside text (a heading's range, a footnote's reference; notes and definitions
from c and d) is a link; a plain click previews it, as §8.1:
- **Wider than 600 px:** a popover beside the link, 420 px wide and up to 60 vh tall, with
  the passage in the reader's type at 0.9 em, its reference as the header, and **Open in
  Reader** (a link to the place) at its foot. It scrolls inside itself.
- **Narrow:** a sheet from the bottom, half the screen's height, the page dimmed, with the
  same contents.
- Escape or a click outside closes it. Inside a footnote's popover, a reference's preview
  replaces the footnote (one popover at a time).

### W5.4 Search

A dialog, title "Search", opened by the search icon and **/**. Its query is in the URL
(`/read/search?q=…`, replaced as you type, pushed when you open a result), so a search can
be shared, bookmarked and returned to with Back.
- The field at the top (focused on open, on every device: searching means typing),
  `enterkeyhint="search"`; under it the scope as a group of four segments: All, OT, NT and
  the current book's name.
- Queries, the "Go to" row, results (one link per verse, the reference in accent, the
  verse with matched words in `<b>` on the selection wash), "1000+", recent searches with
  Clear, empty and no-result states: all §3.6, word for word.
- **Speed:** the search runs in the app (`search` in `text.l8`), debounced 0.2 s. The CI
  measures it on the throttled profile (§W13); if "the" over All takes more than 50 ms,
  the builder moves search into a Web Worker running a second instance of the module with
  its own copy of the text, and says so.
- **The ESV:** as §9.4.8: the BSB is searched; the last row offers "Search the ESV for
  “…”", which makes one request and shows one page of up to 100 results with the footer
  "(ESV) · esv.org".

### W5.5 Selecting verses, and the tray

**Selecting** (§3.3.1's model: a set of verses in one chapter):
- **A click or tap on a verse's text toggles it**, unless it made a text selection (a drag,
  a double-click's word, a long press) or landed on a link, a footnote mark or a note
  glyph. On touch, a tap while the page is still moving only stops it (the browser does
  this by itself).
- **A text selection** (the browser's own: drag, double-click, long-press on touch) that
  lies in the text **selects the verses it touches**, and the tray shows for them; the
  browser's own selection handles and menu stay as they are (we add nothing to them, and
  on iPhone and Android the system's menu appears above the selection while our tray sits
  at the bottom). Clearing the text selection keeps the verse selection until a click
  elsewhere or Escape.
- **From the keyboard** (§W10.1): with the text focused, **Enter** selects the verse at the
  reading line; **↓/↑** then move the selection verse by verse (scrolling to keep it in
  view), **Shift+↓/↑** extend it, **Escape** clears it, and **Tab** moves into the tray.
  Without a selection, the arrow keys scroll as always.
- Selected verses get class `sel`: the `selection` wash and a dotted underline in accent at
  70% (§3.3.2).

**The tray** (§3.3.3): a `<div role="toolbar">` labelled with its reference, fixed at the
bottom, centred under the column (12 px from the edges when narrow; at most 34 em + 24 px
wide), `cellBg` at 92% with `backdrop-filter: blur(20px)`, radius 26 px, §3.3.3's shadow,
above the bottom safe area. It rises with the §2.7 motion (a translate and fade; a fade
under reduced motion) and falls when the selection empties.
- **Header:** the reference ("John 3:16–18", §3.3.3's rules), and a close button (`x`,
  28 px circle, label "Clear Selection").
- **Colours row** (from c): five 34 px swatches and, when needed, `circle-slash`, as §3.3.3.
- **Actions row:** the actions present, equal widths, icon above an 11 px label: **Copy**,
  **Share**, **Bookmark** (c), **Note** (c), **Study** (d), **Compare**, **Memorize** (e).
  In (b) it's Copy, Share and Compare.
- **Copy** writes §3.3.6's text and reference to the clipboard (`navigator.clipboard`),
  clears the selection and shows the toast "Copied".
- **Share** uses `navigator.share({ text, url })` with §3.3.6's text and the verse's link
  (§W2.4). Where the browser has no share (desktop Firefox, some others), it copies the
  text, reference and link on three lines and shows "Copied with Link".
- **Compare** opens Compare (§W5.8).
- With a text selection that is one word, **Study** reads "Study ‘loved’" and opens that
  word's study (§7.2's word path) instead of the verse's (d).
- The tray never covers the verse it acts on: when a selected verse would sit under it,
  the page scrolls it up just enough, once, at the selection (`scroll-padding-bottom` is
  the tray's height while it shows, so keyboard focus and Find also stay clear of it,
  WCAG 2.4.11).

### W5.6 Versions

- **Reading settings' Version row** (§9.3.1), above the text size: "Version · Berean
  Standard Bible", pushing the Versions screen (§9.3.2) inside the sheet or popover:
  BSB, ESV, KJV, WEB, ASV, YLT with their full names and §9.3.2's one-line descriptions, a
  check on the current one. Without a connection the ESV row says "Needs a connection"
  (faint) and stays selectable.
- **Switching in place** (§9.3.3): the page fades to 0 over 0.15 s, the window is redrawn in
  the new version, the place kept by reference (a verse the version lacks goes to the
  nearest before it), and it fades back in 0.15 s. The URL is replaced
  (`/read/kjv/john/3`), not pushed: a setting is not a journey. The version is saved as the
  reader's (`sb.version`), used for `/read/` and passage URLs without a version.
- **A version's text arrives on first choice** (about 1.3–1.45 MB each, §W12.1): the row
  shows "Getting the King James Version…" with a small spinner in place of its check, and
  the switch happens when it has arrived. It's kept for next time (the HTTP cache, then
  the Service Worker, f).
- **A shared link in another version** (§W3.2 step 3) is shown in its version without
  changing the reader's.

### W5.7 The ESV

Everything §9.4 says about the reader under the ESV holds, through the same Worker, with
these web specifics (the terms are §W12.6):
- **Drawn in the browser** like every version; the chapter is fetched
  (`/api/v1/esv/chapters?book=JHN&chapter=3&count=2`, header `X-Smooth-Bible: web
  (<build>)`) and drawn by `html_chapter` as any version once its records are in
  `text.l8` (`esv_build`, as on the iPhone).
- **Placeholders** (§9.4.6): a chapter not yet here is its opener and a spinner (after
  0.4 s), as tall as the BSB's same chapter laid out at the current settings, so the page
  length is believable. When it arrives below the reading line it replaces the
  placeholder at once; above it, at rest only, with the height difference scrolled away in
  the same frame (§W3.3).
- **Requests start early** (§9.4.11): for the window's chapters as soon as the window
  decides it wants them, not when they come into view.
- **The window under the ESV** holds no more than `esv_cache.l8` allows the page to show:
  at most 500 ESV verses and never more than half of any book (a one-chapter book only
  while its chapter is on screen). In Ruth (85 verses) that is one chapter at a time,
  with Judges and 1 Samuel around it; the next chapter of Ruth replaces the last as you
  read. The CI checks the count at every step of a scroll through Ruth and through Psalm
  119's neighbours.
- **States and messages** (offline, busy, resting for today, unavailable) are §9.4.6's, in
  the page, in the reader's type; "Read in the BSB" switches the version in place.
- **Each ESV chapter ends with** "(ESV) · esv.org", the link opening
  `https://www.esv.org/John+3/` in a new tab (`rel="noopener"`).
- **Copy and Share** say "John 3:16 ESV"; Share's link is the ESV URL.
- **The cache** (`esv_cache.l8`'s rules over IndexedDB's `esv` store, §W12.2) holds at most
  500 verses with the page; nothing of the ESV is written anywhere else (the Worker sends
  `no-store`, and the Service Worker never caches `/api/`).

### W5.8 Compare

As §9.5: a dialog with the selection's reference as its title, the verses in each version
(the current first, then BSB, ESV, KJV, WEB, ASV, YLT), "· Reading" after the current
one's name, previous and next (`chevron-up`, `chevron-down`, also **K** and **J**) in its
footer. Versions not yet loaded fill in as they arrive, each section showing "Getting the
King James Version…" until then (all five public-domain texts are about 7 MB together,
fetched only the first time Compare is used). The ESV section follows §9.5's states.

### W5.9 Phase (b) acceptance
1. Go To by typing (`jn 3:16`, `ps 23`, `1 cor 13`, `jude 3`, `john 30`: §4.2's table) and by
   books and chapters; each jump flashes, shows the capsule, and Back returns to the exact
   verse; Forward goes again.
2. Back closes each dialog; a jump from a dialog leaves no dialog entry behind (history
   length checked).
3. Ctrl/⌘-click and middle-click on a book's chapter, a search result and Recent open a
   new tab at that place (CDP: a new target appears) and the dialog stays.
4. Search: "born again" with and without quotes, scopes, the ESV row against the mock;
   `/read/search?q=born+again` opens with the results.
5. Selecting by click, by a dragged text selection and by keyboard; the tray's Copy (the
   clipboard's text checked), Share's fallback, Compare.
6. Switching version keeps the verse (John 3:16 → KJV → ESV (mock) → BSB).
7. The ESV against the Worker's fixtures: placeholders, arrival above and below the
   reading line with no pixel moving, offline and busy states, the footer link, no more
   than 500 verses or half a book in the DOM at any step.
8. `/read/jn3:16` and `/read/kjv/ps/23` become their canonical URLs.

---

## W6. Phase (c): marks, notes, ribbons, plans and the rest

**What it adds:** everything of the reader's own: highlights, bookmarks, notes and chapter
notes, the Library, ribbons, reading plans and the day reader, the Manual, and
the ways to take it all out and back in. **Worth having alone:** the owner's second
priority, notes, complete.

### W6.1 In phase (c)
1. Storage for all of it (§W12.2), several tabs (§W12.3), backup and restore (§W12.4).
2. The tray's colours, Bookmark and Note; marks in the text (§W1.5); the edit-menu path
   of §3.3.5 becomes the text-selection path of §W5.5.
3. The note editor (§3.4, §7.9) and chapter notes (§8.4).
4. The Library (§3.5, §7.9, §8.5, §8.6).
5. Ribbons (§11).
6. Plans, a plan's days and the day reader (§10.1, §11.3, §16).
7. The Manual (§15.3) with the web's words (§W14.4); no quick tips (owner, 2026-10-21).
8. Reading settings' Help and This Browser sections.

### W6.2 Highlights and bookmarks
As §3.3.3–§3.3.4: a swatch colours every selected verse and clears the selection; the
checked swatch or `circle-slash` removes it; the last colour is remembered. Bookmark toggles
the first selected verse's bookmark. Marks appear by class with no movement of the text
above (§W3.3). The toasts are §3.3.3's.

### W6.3 Notes
- **The editor** (§3.4) is a dialog: the reference as its title; the verse quoted (0.85 em,
  faint, at most 4 lines, a 3 px accent bar at its left); a hairline; a `<textarea>`
  filling the rest in the body font at 1.0 em, placeholder "Write a note…", focused on
  open. It **saves as you type** (0.5 s after the last key) and on close. Done closes it;
  an empty note is deleted.
- **Deleting** an existing note is a `trash-2` button in the header's left; it deletes at
  once and closes, and the toast reads "Note deleted · Undo" for 6 s (the web has the
  confirmation the iPhone couldn't make without blocks, but an Undo is calmer than a
  question).
- **Read mode** (§7.9): an existing note opens readable, its references as links (a plain
  click previews, §W5.3), with Edit in the header; Edit turns it into the textarea at the
  same scroll.
- **Chapter notes** (§8.4): the glyph after the chapter label; created from the Library's
  Notes tab with a compose button (`square-pen`, "New Chapter Note") at the top right of
  the tab, for the chapter at the reading line.
- **The note glyph** in the text is a button (§W1.5); a click opens the note.

### W6.4 The Library
A dialog, title "Library", opened by its bar button and **B**:
- **Tabs** under the title (`role="tablist"`): Highlights, Notes, Bookmarks, and Memory
  from (e). The last chosen is remembered. Under Highlights, the colour filter (§8.6) as
  six small round toggles.
- A **search field** (§7.9) and **Sort** (Bible Order, Newest) as a small `<select>` beside
  it.
- **Rows** as §3.5, grouped by book with headers; each row is a link to its place (notes
  open the note instead). A **delete button** (`trash-2`, faint, label "Delete highlight,
  John 3:16") at each row's end: shown on hover and focus with a mouse, always shown on
  touch. Deleting removes the row (its height closes over 0.2 s) and shows "Highlight
  deleted · Undo" for 6 s. No swipe gestures: a swipe in a web list conflicts with the
  browser's own back swipe and scrolling.
- **Export** (§8.5): a button at the foot of every tab, "Export Notes and Highlights",
  downloading `Smooth Bible Notes 2026-10-20.md` in §8.5's format (a Blob and
  `<a download>`), or, where `navigator.share` takes files (phones), offering it to the
  share sheet as the iPhone does.
- **Empty states** as §3.5's, word for word ("Tap a verse while reading…" reads
  naturally with a mouse too).
- **The foot of the Library** holds one faint line: "Kept in this browser on this device.
  Back up from Reading settings." (§W12.4), linking to that section. It is the only place
  the web reminds anyone of anything about their data, and it never changes or flashes.

### W6.5 Ribbons
As §11, with one change of place: the iPhone keeps "New Ribbon Here…", "Leave Morning
Here" and "Reading with Morning" in the title's long-press menu, and a long press isn't a
web gesture. On the web they all live in **Go To's Ribbons section**, which already holds
New Ribbon…:
- A ribbon's row (§11.2.1) is a link that opens it; its trailing `ellipsis` button (label
  "Ribbon options, Morning") opens the Ribbon screen (§11.2.4: rename, delete, move here),
  pushed inside the dialog.
- **While carrying one,** its row is first, with the secondary text "Reading with it now"
  and a trailing text button **Leave Here** (which puts it down at the place and closes Go
  To with the toast "Morning left at Romans 8").
- **New Ribbon…** pushes New Ribbon (§11.2.3) with a text field for the name.
- Carrying, putting down by a jump, the capsule's undo picking it up again, the toast
  "Reading with Morning", the 12-ribbon limit: all §11, unchanged.

### W6.6 Plans and the day reader
- **Go To's Reading Plan section, Plans, a plan's days, Start Plan** (§11.3, §16.1) are
  screens pushed inside Go To, as on the iPhone.
- **The day reader** (§16) is the reader in a mode, with its own URL:
  `/read/plans/chronological/32`. Opening a day pushes that URL; the page's window is
  replaced by the day (with §16.1's slide up, or a fade under reduced motion), and
  **Done** (a text button at the bar's left, in place of Search) or **Back** returns to the
  main reader exactly as it was. Reloading the URL reopens the day.
- **The page** is §16.2.1's, written by `html.l8` from `layout_day` (`html_day`): the day's
  opener, each passage under its heading, the page's end with **Mark Day 32 as Read**. The
  window of §W3.3 doesn't apply: a day is short enough to be one page (the longest
  M'Cheyne day is about 4 chapters). Under the ESV, §16's per-passage fetches, within the
  page limits (§W12.6).
- **The bar:** the passage's name as the title, "Day 32 · Chronological" under it (12 px,
  faint), Aa on the right; the collapsed bar keeps the passage's name.
- **Mark Read** is the floating capsule at the bottom right (§16.0.5), always shown, also
  **M** on the keyboard; passages mark themselves by §16.0.6's rule.
- References that leave the day (§16.0.3) push the main reader's URL; its capsule reads
  "‹ Day 32", and Back reopens the day at the same place.
- **No reminder** on the web (§W15.1).

### W6.7 The Manual (no quick tips)
- **No quick tips.** The owner removed them from the app on 2026-10-21 ("it's clutter"),
  so the web has none: no tip row in Go To, no Show Tips setting, no tip conditions or
  "once a day" state. `help.txt`'s `tip` lines, while they remain in the file, are
  ignored by the web.
- **The Manual stays,** as a dialog (the contents, a page, its search field, as §15.3)
  written by `html.l8` from `help.txt` with the web's paragraphs (§W14.4), opened from
  Reading settings' Help without leaving the reader; each page has its address (`/read/manual/<page>`), which
  opens the dialog over the place; the page's address is shown as a link
  "Open in a new tab".
- **Reading settings' Help section:** Manual, and Keyboard Shortcuts (the list, §W10.1).

### W6.8 Phase (c) acceptance
1. Highlights, bookmarks and notes are made, shown, edited, deleted with Undo, survive a
   reload, and appear in a second tab within a second without a reload (§W12.3).
2. The Library: tabs, filter, search, sort, rows as links (new tab with a modifier),
   delete and Undo, Export's Markdown matches §8.5 for the fixture marks byte for byte.
3. Backup, Erase Everything and Restore bring back every record (§W12.4); Restore into a
   browser with other marks merges by the rules, the counts shown before adding.
4. A note containing HTML shows as text; a backup with a crafted note restores as text
   (§W1.4).
5. Ribbons: New Ribbon Here, carrying across chapters, put down by a jump, picked up by the
   capsule, Leave Here, the limit of 12.
6. A plan started, a day opened by its URL, Mark Read, the page's end, the day's ESV
   passages against the mock, Done and Back returning to the main reader's exact place.
7. The Manual opens from Help and from its address, its search finds a word on every page,
   its links move between pages, and its pages pass the accessibility checks; nothing of
   the quick tips appears anywhere.

---

## W7. Phase (d): Listen and Study

### W7.1 Listen

**Entry and controls** are §8.7 and §12.4: Reading settings' first section (the Listen
button naming the verse at the reading line, Speed), the mini player above the bottom
edge (the verse, the reader's name, play and pause, close; the label goes to the verse),
and **L** to listen or pause.

**Sources** (§12.0.2's table, unchanged):

| Version | Web source | How |
|---|---|---|
| BSB | Bob Souer (default) · Barry Hays · Jordan Gilbert · Device Voice | `<audio>` from openbible.com, verse by verse with the bundled timings |
| WEB | Winfred Henson · Device Voice | `<audio>` from eBible.org, verse by verse |
| ESV | David Cochran Heath · Device Voice | the Worker's `/api/v1/esv/audio` answers the address; `<audio>` plays it from audio.esv.org; by chapter |
| KJV, ASV, YLT | Device Voice | the Web Speech API (`speechSynthesis`), verse by verse as §8.7 |

- **Playing across origins:** an `<audio>` element plays from another site without CORS,
  and every host answers range requests with `audio/mpeg` (checked 2026-10-20: openbible.com,
  ebible.org and audio.esv.org all answer 206 and none sends `Access-Control-Allow-Origin`).
  So the web streams exactly as the iPhone does. Without CORS the page can't read the
  bytes, so it can't cache or download recordings (§W15.2), and can't route them through
  Web Audio (not needed). The `<audio>` has `referrerpolicy="no-referrer"` and
  `preload="metadata"` until played.
- **Following the verse:** the timings (`souer.tim`, `hays.tim`, `gilbert.tim`,
  `henson.tim`, about 130 KB each raw) load with the first Listen in that voice. While the
  page is visible, the verse is read from `currentTime` once per animation frame and the
  wash follows (§8.7); while hidden, on `timeupdate`.
- **The next chapter** plays from a second `<audio>` element prepared when 30 s remain
  (the browser's own buffering is the "fetch ahead"); at `ended` the two swap. If that
  fails while the page is hidden (a phone locked), the player says "Paused" and
  continuing is one tap; the CI can't see this, so it's on the phone list (§W14.6).
- **When a recording can't play** (offline, error), Listen goes on in the device's voice
  from the same verse, "Device Voice · Offline" in the player (§12.0.2 decision 2), and
  returns to the recording at the next chapter when it can.
- **The device's voice** ("Device Voice", the web's name for "iPhone Voice"): the best
  English voice `speechSynthesis.getVoices()` offers, preferring local voices, then
  en-US; the Voice screen lists the English voices by name to choose from. Its quality
  depends on the device; the web has no "download a better voice" path to point to, so
  there's no such line.
- **Speed:** Slower, Normal, Faster: `playbackRate` 0.85, 1.0, 1.25 with pitch preserved
  for recordings; speech rates 0.85, 1.0, 1.15 (the Web Speech API's scale).
- **The lock screen and media keys:** the Media Session API with §12.0.2 decision 10's
  metadata (title "John 3:14", artist the reader, album the version, artwork the app
  icon) and actions play, pause, previous and next chapter, and seeking for recordings.
- **Changing the narrator or the version while listening keeps the verse** (§12.11).
- **The ESV is stream-only**, as on the iPhone.

### W7.2 Study

A dialog (or the panel beside the text, §W7.3) titled with the verse, with **tabs** Words,
References, Commentary (§9.6.2) and §9.6.2's previous and next in its footer (also **K**
and **J**).
- **Words:** the interlinear (§7.4) with its English order and original order switch, each
  word a button opening its **word study** (§7.5) pushed inside; from there the
  **definition** (§7.6), the **concordance** (§7.7), exact senses (§10.3) and related
  words (§10.4), each pushed inside, each with "‹" back. Concordance rows are links.
  Greek in Gentium Plus (`lang="grc"`), Hebrew in Ezra SIL (`lang="hbo" dir="rtl"`) at
  §7.3's sizes in px, transliteration in the chrome font's italic.
- **References** (§9.6.3) and **Commentary** (§9.7.2): as the iPhone, references as links
  that preview, "Verses shown in the BSB." under the ESV.
- **Add to Note** (R2.10, §7.5) from word study adds the line to the verse's note.
- **The tray's Study** opens it at the selected verse; with a one-word text selection,
  "Study ‘loved’" opens that word's study (§W5.5).
- **Data** loads on first use, per tab (§W12.1): Words needs the language data (about 6 MB
  compressed, once), References the cross references (about 0.5 MB), Commentary Matthew
  Henry (about 1.2 MB). Until it's here the tab shows the verse header and, under it, one
  faint line with a thin progress bar: "Getting the Greek and Hebrew data (6 MB, once)…".
  It's kept for next time (the HTTP cache, then the Service Worker). If the CI's 4G profile
  makes the first Words wait more than 4 s, the builder splits `words.bin` by book (the
  format is the builder's to change, `lang.l8` reading it) and says so.

### W7.3 Study beside the text

§17.3.8 on the web: when the window is wide enough for a **400 px panel** beside a column
of at least 28 em with its margins (`400 + 1 + 2 × margin + 28 em`, about 990 px at the
default size), Study opens as an `<aside>` on the right, the full height under the bar,
and stays while you read; otherwise as a dialog.
- The column re-centres in the space left, the verse at the reading line kept (§W3.5),
  the panel sliding in over 0.25 s (a fade under reduced motion).
- It stays on the verse chosen; selecting another verse moves it (§17.3.8's decision; the
  owner's question 6 there applies here too). Its `x` closes it; **I** shows and hides it
  where it fits.
- Recomputed at every resize and size change; when it no longer fits, it closes, and
  returns as it was when it fits again.
- The tray stays at the column's foot; the panel scrolls on its own.
- The panel is fixed at 400 px (§17.10 question 7 answered for the iPad holds; a divider is
  not offered).

### W7.4 About, complete
The About page (§W12.8) gains the study and recording credits with this phase, the STEP
Bible credit and change record, and the fonts.

### W7.5 Phase (d) acceptance
1. Listen in each source against local fixture recordings (a short silent MP3 per source,
   served by the test server in place of the hosts) and their timings: the wash follows,
   the chapter's end moves on, Speed, pause and resume, the device voice for the KJV (in
   Chromium headless, `speechSynthesis` is checked for being called with the right text,
   not for sound).
2. A recording failing falls back to the device voice at the same verse.
3. The Media Session metadata and actions are set (read back through CDP).
4. Study's three tabs, word study, definition, concordance (rows as links), in Greek and
   Hebrew; the coverage test of the bundled faces.
5. Study beside the text at 1280 and 1440 px, as a dialog at 900 px; resizing across the
   threshold keeps the verse.
6. The first Words on the CI's 4G profile within 4 s, or the split made.

---

## W8. Phase (e): Memory and languages

### W8.1 Memory (§13)
- **Memorize** joins the tray; **Memorizing** opens the passage's Practice (§13.2.1). Add
  Passage… (§13.2.2) is in the Library's Memory tab.
- **The Library's Memory tab** (§13.4): Today, New, Later, then Languages (§14.3.1), and
  Practice at the tab's foot. The passage screen (§13.4.1) is pushed inside the dialog.
- **Practice** (§13.3) is a dialog, full screen on narrow widths and a centred panel 720
  px wide otherwise: the passage at the reader's measure and type, the level segments
  (Full, Some, Letters, Blank) above it, the toolbar (Listen, Echo, Type, the main button)
  at its foot.
  - **Hidden letters keep their space** (§13.3.3): each word is a `<span>` whose letters
    are drawn in transparent ink with the hidden-letter underline, so changing the level
    changes only colours, never the layout. A click or tap on a hidden word shows it.
  - **Type** (§13.3.6): on touch, a visible one-line field at the foot raises the keyboard;
    with a keyboard attached (a fine pointer), Practice takes first letters as soon as it
    opens, and **Type** isn't needed (it toggles the field for those who want it).
  - **Keys inside Practice** (they don't need the global shortcuts switch, because they
    act only while Practice has focus, WCAG 2.1.4's exception): Enter is the main button;
    1, 2, 3 are Not Yet, Mostly, Knew It while the judgement row shows; Escape closes.
  - **Listen and Echo** (§13.3.7) use §W7.1's recordings and timings, and the device's
    voice where there are none.
  - "That's all for today." and the next review's date, as §13.0.2 decision 12.
- **The ESV in Memory** (§13.6): pinned verses in IndexedDB's `esv` store, counted in the
  500, at most 200 pinned.
- **No reminder** on the web (§W15.1): Today in the Memory tab is where due passages show.

### W8.2 Greek and Hebrew (§14, Round 10 as §14.10b amends it)
Everything Round 10 builds, as amended on 2026-10-20: the language pages (from the Memory
tab and the end of the interlinear), the Alphabet with **Sounds Written As** (nothing
speaks: the web has no Greek or Hebrew recordings either), Your Words, Add Words (including
Related to Words You Know), word cards asking "What does it mean here?" with the BSB's
words in this verse first, Forms with the BSB's renderings, Verses You Can Read, hiding
what you know in the interlinear's original order, coverage in one plain sentence. Each
is a screen pushed inside the Library dialog (or Study's, from the interlinear), built
from `learn.l8` as the iPhone's are.
- The language pages' Settings section has Hide What I Know; there are no Speak switches
  and no voice paths (§14.10b.1).
- Cards practise in Practice, with the same keys.
- Rounds 11–14 (the original text in the reader, the courses, Aramaic) come to the web
  after the iPhone has them, by the same pattern (§W15.2).

### W8.3 Phase (e) acceptance
1. A passage memorized from the tray in the BSB and one in the ESV (the mock); Practice at
   every level with no layout change (the CI compares word positions between levels);
   typing first letters; the three judgements by click and by keys; the schedule's next
   date.
2. The language page, the Alphabet, adding ten words, a card's meaning-first answer,
   Forms, Verses You Can Read, hiding in the interlinear: each shot at 390 and 1280 px.
3. No speech is attempted anywhere in the language screens.

---

## W9. Phase (f): offline, and installing

### W9.1 The Service Worker
`/read/sw.js`, scope `/read/`, registered by the app after it has started (never during
the first paint).
- **On install** it caches the shell: `read/shell.html`, the CSS, the scripts, the wasm,
  the icon sprite, the About page and the manual. About 400 KB compressed.
- **Data** (versions, language data, commentary, cross references, timings, fonts) is
  cached the first time the app uses it, by its hashed name, and served from the cache
  ever after. A version or the language data is never fetched twice.
- **Navigations under `/read/`** are answered from the cache with the shell, which draws the
  chapter from the cached text: so after one visit every chapter of every version used
  opens with no network. When the shell isn't cached yet, the network answers.
- **Never cached:** `/api/` (the ESV's text and audio addresses), and any recording.
- **Updates are quiet.** A new build's Service Worker installs in the background and takes
  over the next time the app is opened with no tab of it open (the browser's default). No
  "update available" banner, no reload prompt. Old caches are deleted when the new one
  activates.

### W9.2 The manifest and installing
`/read/manifest.webmanifest`: name "Smooth Bible", short name "Smooth Bible", `start_url`
`/read/`, `scope` `/read/`, `display` `standalone`, `background_color` Paper's `bg`,
`theme_color` Paper's `bg`, the icon at 192 and 512 px and a maskable version. No install
prompt of our own: browsers offer installing in their own menus. The manual's Reading part
gains a paragraph, "On the Home Screen", saying in two sentences how to add it in Safari
and Chrome and that it then works offline.

### W9.3 Is it worth it?
**Yes.** The Service Worker and manifest are about 150 lines and one JSON file. They give:
reading with no connection after one visit (the whole Bible in every version used, and
Study once opened), instant opening on later visits, an app on the Home Screen with no
browser bars, and on iPhones the one way to keep a site's data from Safari's clearing
(§W9.4).

### W9.4 Keeping the data
- Safari deletes a site's storage (IndexedDB, `localStorage`, caches) after **seven days of
  Safari use without visiting the site**, unless the site has been added to the Home
  Screen. A reader who comes back weekly keeps everything; one who doesn't loses it. The
  design answers with what it can: the backup (§W12.4), the Library's one line, This
  Browser's paragraph (below), and the manual's "On the Home Screen".
- The app asks the browser to keep its storage (`navigator.storage.persist()`) when the
  first highlight, note, bookmark, ribbon, plan or passage is made, in browsers that
  decide without asking the person (Chromium, Safari). Firefox asks the person, so there
  it's asked only from This Browser's **Keep This Browser's Data** button.
- **Reading settings → This Browser** (the last section, from c): the paragraph "Notes,
  highlights and the rest are kept in this browser on this device." and, in Safari when
  not on the Home Screen, "Safari may clear them after a week without a visit, unless
  Smooth Bible is on the Home Screen."; then **Back Up…**, **Restore from Backup…**,
  **Downloaded Data** (the versions and study data kept, their sizes, each removable) and
  **Erase Everything in This Browser…**.

### W9.5 Phase (f) acceptance
1. After one visit (John 3, then Romans 8 by Go To, a search, Study opened once), with the
   network off (CDP): reloading, Go To to any chapter in the BSB, a search, Study's three
   tabs, a highlight and a note all work; the ESV shows its offline message.
2. A second visit's text on screen within 1 s on the CI's profile.
3. A new build installs and takes over on the next opening, with no prompt; old caches are
   gone.
4. The manifest passes Chromium's installability check (CDP
   `Page.getInstallabilityErrors` is empty).

---

## W10. Keyboard, mouse and touch

### W10.1 Keys
**The page** (when no field has focus and no dialog is open), while Keyboard Shortcuts is
on (the default; Reading settings turns it off, WCAG 2.1.4):

| Key | Does | iPad's |
|---|---|---|
| G | Go To | ⌘L |
| / | Search | ⌘F |
| ] and [ | The next and previous chapter's start (a jump) | ⌘] ⌘[ |
| B | The Library | ⌘⇧B |
| , | Reading settings | ⌘, |
| L | Listen or pause | ⌘⇧P |
| I | Study beside the text, where it fits | ⌥⌘I |
| Home | The top of the chapter read, then the previous chapter's (§W3.4) | (the status bar tap) |
| Enter, ↓ ↑, Shift+↓ ↑, Escape | Select and move the verse selection (§W5.5) | |
| M | Mark Read, in the day reader | ⌘D |
| ? | The list of keys (a small dialog) | ⌘ held |

**Never taken:** ⌘/Ctrl with any letter (the browser's: Find, the address bar, Print,
reload, tabs), Space and Shift+Space, Page Up and Down, End, the arrows without a
selection, Alt+arrows (history), Tab. The browser's Back (Alt+←, ⌘[) is the app's Back.
The iPad's ⌘ shortcuts are not used because on the web every one of them belongs to the
browser.

**In dialogs:** Escape closes (and goes Back, §W2.3); Tab moves through the dialog only
(the native modal dialog makes the page behind inert); Enter in Go To or Search goes to
the first row; ↓ ↑ move through suggestions; K and J are previous and next in Compare and
Study when no field has focus; Practice's keys are §W8.1's.

### W10.2 Mouse and trackpad
- Hover gives buttons, rows and swatches a background of `ink` at 6% (0.1 s); links in
  text get no underline on hover (they're accent already) but the cursor is a pointer.
- The text keeps the text cursor: it's text to select, and a click on a verse selects it.
- The right-click menu is the browser's, everywhere.
- Scrolling is the browser's (wheel, trackpad, scroll bar); the bar's collapse follows it
  the same way.

### W10.3 Touch
- A tap on a verse selects it; a long press is the browser's text selection (§W5.5); no
  other gestures: no swipes between chapters (the page is continuous), no swipe to delete
  (§W6.4), nothing that competes with the browser's back swipe.
- Every target is at least 44 × 44 px (WCAG 2.5.8 asks 24).
- `touch-action: manipulation` on buttons and the tray (no double-tap zoom delay on them);
  the text keeps double-tap and pinch zoom. **Zoom is never disabled** (no
  `user-scalable=no`, no `maximum-scale`).

---

## W11. Accessibility (WCAG 2.2 AA)

- **Structure:** the landmarks of §W3.2; one hidden `h1`, chapters `h2`, sections `h3`;
  a "Skip to the text" link as the first focusable element (visible on focus); dialogs
  labelled by their titles; the tray a labelled toolbar; tabs as tab lists; the Go To
  field a combobox.
- **Focus:** always visible, a 2 px accent outline 2 px outside the element (accent passes
  3:1 against every theme's `bg`); never hidden by the bar, the tray or the mini player
  (`scroll-padding` top and bottom follow them, 2.4.11); returned to the opener when a
  dialog or popover closes.
- **Text contrast** 4.5:1 for all text, including verse numbers and faint labels (§W1.6's
  table); icons and control edges 3:1.
- **Screen readers:**
  - The text reads as text: verse numbers as numbers, LORD as "Lord" (the small caps are
    styling), footnote marks as buttons named "Footnote".
  - A verse's marks are said after its number in visually hidden text ("16, highlighted
    yellow, bookmarked"), and its note glyph is a button "Note on John 3:16".
  - Selecting a verse announces "John 3:16 selected" through a polite live region; toasts
    are `role="status"`.
  - Listen's verse wash isn't announced (it would talk over the recording).
- **Reduced motion:** every slide and scale becomes a 0.15 s fade or nothing; the bar's
  settle, the jump flash's fade and theme cross-fade are kept as fades.
- **Forced colours** (Windows' contrast themes): the washes vanish there, so highlights
  gain a 2 px underline in `Mark`, selection keeps its dotted underline, and the swatches
  show their names on hover and focus.
- **Reflow and zoom:** usable at 320 px wide and at 400% zoom (1.4.10): the column fills
  the width, the bar keeps one row (the title truncates with an ellipsis), dialogs become
  sheets. Text spacing overrides (1.4.12) clip nothing (no fixed heights on text).
- **Languages:** `lang="en"` on the page, `grc` on Greek, `hbo` on Hebrew with `dir="rtl"`.
- **Checked by** axe-core on every shot's state in CI (§W14.4), and by hand on the phone
  list (VoiceOver on iPhone and Mac, TalkBack, NVDA).

---

## W12. Data

### W12.1 What loads, and when

Every data file is served gzipped under a hashed name (`read/data/bsb.<hash>.gz`) with a
year's `immutable` cache, fetched by the app, decompressed with `DecompressionStream`, and
kept in L8's memory as on the iPhone.

| Data | Raw | Gzipped | When |
|---|---|---|---|
| The app (wasm), phase a / e | — | about 150 / 350 KB | Every visit (cached) |
| CSS, scripts, icons | — | about 40 KB | Every visit (cached) |
| The shell | 6 KB | 3 KB | Every page (revalidated) |
| The place's book (`<v>/<book>.gz`) and the sizes table | 3 KB–280 KB; 15 KB | 1–88 KB; 6 KB | First paint (§W1.8) |
| The reader's version text (`bsb.txt` and the others) | 4.4–4.6 MB | 1.3–1.45 MB | Right after the first paint, at low priority |
| `refs.txt`, `help.txt` | 23 KB | 8 KB | With the text |
| Other versions | 4.4 MB each | about 1.35 MB each | On choosing one, or the first Compare |
| Language data (`data/lang/`, Study's Words, word study, Learn) | about 16 MB | about 6.2 MB | First use of Words, word study or a language page |
| Cross references (`xrefs.bin`, `xref_index.bin`) | 1.5 MB | about 0.5 MB | First References tab |
| Matthew Henry (`mhcc.txt`) | 3.95 MB | about 1.2 MB | First Commentary tab |
| Verse timings (`*.tim`, `henson.paths`) | 130 KB each | about 40 KB each | First Listen in that voice |
| Fonts (only where the device lacks them) | — | 80–90 KB a face pair; Greek and Hebrew about 150 KB | When first drawn |

Each version is served both whole and book by book (§W1.8): the book for the first paint,
the whole for everything after.

### W12.2 Storage

- **`localStorage`** (synchronous, small, there before the first paint): the settings
  (`sb.settings`, one line of `key=value` pairs), the place and version (`sb.place`,
  `sb.version`), recent searches, the remembered tab and segment choices. These are what
  the iPhone keeps in `NSUserDefaults`.
- **IndexedDB**, database `smoothbible`:
  - store **`files`**: one record per file, keyed by the iPhone's file name
    (`highlights.tsv`, `bookmarks.tsv`, `notes.tsv`, `history.tsv`, the ribbons', plan's,
    memory's and cards' files, §4.3, §11.1.6, §13.1.7, §14.1.9, §16.5), the value the
    file's UTF-8 text in exactly the iPhone's format. `store.l8` and the other modules
    read and write those formats already, so the web adds no format and no code to parse
    one; a backup is these files (§W12.4), and a later iPhone import would read them as
    its own.
  - store **`esv`**: the ESV cache's records and index, as §9.4.5's files, governed by
    `esv_cache.l8`.
- **Writing:** each file is rewritten whole after a change (as §4.3), 0.3 s after the last
  change, and at once on `visibilitychange` to hidden and on `pagehide`.

### W12.3 Several tabs
Two tabs of the app must not overwrite each other's work (whole-file writes would lose the
other tab's newest change):
- Each write holds a Web Lock (`navigator.locks`, "smoothbible-files") for its file, and
  **re-reads the file inside the lock, applies its own change to what it read, and writes
  that**. A change is therefore a small operation (add this highlight, delete that note)
  applied to the newest file, not a stale copy written back. `store.l8` gains the few
  functions this needs (apply one change to a file's text), tested.
- After writing, it posts the file's name on a BroadcastChannel ("smoothbible"); other
  tabs re-read that file and redraw what it shows (marks in the window, an open Library).
- Settings changed in one tab reach the others through the `storage` event, and are
  applied as if chosen there (keeping each tab's place).

### W12.4 Moving data in and out

**Back Up…** (Reading settings → This Browser) downloads `Smooth Bible backup
2026-10-20.txt`: plain UTF-8 text, readable in any editor:

```
# Smooth Bible backup 1 · web · 2026-10-20 14:03 · smoothbible.com
== highlights.tsv
JHN	3	16	yellow	1792252800
…
== notes.tsv
…
== settings
theme=paper
…
```

Every file of §W12.2 is in it, and the settings. No ESV text (the terms, §W12.6): Memory's
ESV passages are listed by reference and fetched again after a restore.

**Restore from Backup…** opens a file picker; the chosen file is read (in L8, by a new
portable `backup.l8`, tested) and a sheet says what it holds: "214 highlights, 31 notes,
12 bookmarks, 3 ribbons, a reading plan, 12 passages and 140 words", with **Add to This
Browser** and Cancel. Adding **merges**, so nothing here is lost:
- Highlights, bookmarks, notes: by verse (a note by its verse and range); where both have
  one, the newer (by its time) is kept.
- Ribbons: by name; a same-named ribbon keeps the newer place; beyond 12, the oldest added
  are left out and the sheet says how many.
- The reading plan: added only if no plan is followed here; otherwise it's left out and the
  sheet says so.
- Memory passages and cards: by reference and by word; the one reviewed more recently wins.
- History: joined and trimmed to its 200.
- Settings are not applied (they belong to each device), unless the browser has none.
- Deletions don't travel: a note deleted here but in the backup comes back. The sheet says
  so in its footer: "Notes or marks deleted since this backup was made will return."

**Export Notes and Highlights** (the Library) is the iPhone's Markdown, for reading, not
restoring.

**Erase Everything in This Browser…** asks once (a dialog: "Erase all notes, highlights,
bookmarks, ribbons, plans, passages and words in this browser? This can't be undone."
with Erase and Cancel) and deletes the database, the settings and the caches.

### W12.5 The Bible texts' licences on the web (checked 2026-10-20)
- **BSB:** "dedicated to the public domain as of April 30, 2023. All uses are freely
  permitted" (berean.bible/terms.htm); the attribution is "appreciated but not required",
  and the About page gives it. The publisher asks that a text that "varies from the
  official text" not use the Berean name: the builder confirms in the phase (a) commit that
  the converted text's words are the publisher's (layout only); any word-level fix listed
  in `tools/usfm.py` is named on the About page.
- **WEB:** public domain; the name is eBible.org's trademark for the unchanged text, which
  ours is (§9.8's line).
- **KJV:** the Crown's patent concerns printing and importing printed copies in the United
  Kingdom; it has no bearing on a website. §9.8's line stays.
- **ASV, YLT:** public domain.

### W12.6 The ESV on the web
Crossway's terms (api.esv.org, read 2026-10-20) are written for websites first ("Crossway
allows you to access the ESV Bible text from our server and include it on your website,
free of charge for non-commercial use"). What they require, and how the design meets it:

| Term (quoted) | Design |
|---|---|
| "You may not display more than 500 verses or one-half of any book (whichever is less) on any page." | The window of chapters is limited by `esv_cache.l8`'s rules (§W5.7): never more than 500 ESV verses or half a book in the DOM; a one-chapter book only while on screen. Compare shows at most one selection; search one page of 100 |
| "You may not locally store more than 500 verses or one-half of any book…" | IndexedDB's `esv` store under the same rules, counted together with the page; nothing in `localStorage`, the HTTP cache (`no-store`) or the Service Worker; backups hold references, not text |
| "Each page on which you use the text must include a link to www.esv.org." and "identify the passages as coming from the ESV" | Every ESV chapter ends "(ESV) · esv.org" with the link; previews, Compare's section, search results and Memory's practice end with it too |
| "On a "copyright" page of your website, you need to include one of the following…" | `/read/about#esv`, with §9.8's notice verbatim, linked from every ESV chapter's footer line and from Reading settings |
| "You must use the text for non-commercial purposes, and your website must be non-commercial." | The whole of smoothbible.com is free, with no ads, sponsors or donation requests (the owner's rule already) |
| "You won't be able to access the service using only HTML." / "You may not … share, or publish your access key." | The browser calls our Worker; the key stays its secret |
| "You may not change any of the words in the text." | `esv.js` converts markup only, as for the iPhone |

**Search engines and the budget.** The terms' 5,000 queries a day are shared by every
reader of both apps through one key. The web must not spend them on crawlers or let a
busy day on the web starve the iPhone:
- Nothing under `/read/` is indexed (`X-Robots-Tag: noindex`), and `/api/` is disallowed
  in `robots.txt`.
- **The Worker gives the web a share** (its one budget change): requests whose
  `X-Smooth-Bible` begins `web ` count in the shared budget as now and also in a web count
  of their own, which stops at **1,500 a day** for text and **1,000** for audio, answering
  `daily_limit` beyond it (the reader's existing calm message). One constant each, in
  `worker.js`, tested in `test.mjs`.
- The web asks for two chapters per request (`count=2`) like the iPhone.

### W12.7 Security headers (set by the Worker on `/read/`)
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'
  'sha256-<the boot script>'; style-src 'self'; style-src-attr 'unsafe-inline';
  img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'
  https://openbible.com https://ebible.org https://audio.esv.org; frame-ancestors 'none';
  base-uri 'none'; form-action 'self'` (`style-src-attr` because settings and positions
  are set as custom properties on elements; the builder adds a media host if a redirect
  needs it, and says so).
- `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`,
  `Permissions-Policy: screen-wake-lock=(self), camera=(), microphone=(), geolocation=()`.

### W12.8 The About page (`/read/about`)
A static page, written by hand (`web/bible/about.html`), `noindex`; the web's Acknowledgements (§7.8, §9.8, §12.5):
1. **Text:** each version's line and link (§9.8).
2. **English Standard Version** (`#esv`): ESV.org and the notice, verbatim.
3. **Original languages and lexicons:** STEP Bible's credit as its licence asks ("STEP
   Bible" linked to www.STEPBible.org) and the record of changes (the iPhone's "Changes to
   the Lexicon Data", as a section); MACULA Greek's line "MACULA Greek Linguistic
   Datasets, available at https://github.com/Clear-Bible/macula-greek/"; the others as
   §7.8.
4. **Study:** OpenBible.info's cross references (CC BY 4.0, our changes named), Matthew
   Henry (CCEL, public domain).
5. **Recordings:** §12.5's credits.
6. **Fonts and icons:** Source Serif 4, Charis SIL, Gentium Plus, Ezra SIL (SIL Open Font
   License), Lucide (ISC).
7. **Privacy policy** and **Contact** (the site's pages), and the build.

The CC BY credits are met by this page being linked from every reader page (the credit
line at each page's foot, §W1.8) and from Reading settings, which CC BY 4.0's "any
reasonable manner" allows.

---

## W13. Performance

**Server rendering: no** (owner, 2026-10-20; §W1.8). The first paint comes from the place's
book, about 140 KB in all at worst.

**The CI's profile** for budgets: 9 Mbps down, 1.5 Mbps up, 150 ms round trips, the CPU
slowed 4× (a mid-range phone on good 4G), a cold cache. A second, report-only profile:
1.6 Mbps, 150 ms (slow 4G).

| Measure | Budget (first visit) | Second visit |
|---|---|---|
| The text on screen (Largest Contentful Paint: the first paragraph) | ≤ 1.5 s (slow 4G, report-only: ≤ 3 s) | ≤ 0.8 s (f: from the Service Worker, offline too) |
| Layout shift (CLS) | ≤ 0.01 (the text never moves) | the same |
| The app ready (a verse tap shows the tray; the window works within the book) | ≤ 1.8 s | ≤ 1.0 s |
| The whole version arrived (Search, other books) | reported, not budgeted | |
| A chapter added to the window (main-thread task) | ≤ 16 ms; Psalm 119 ≤ 50 ms, at rest | |
| A search over All | ≤ 50 ms or in a Worker (§W5.4) | |
| Version switch (text cached) | ≤ 300 ms to the fade back in | |
| First Words in Study | ≤ 4 s (§W7.2) | ≤ 0.5 s |

**Sizes** (gzipped): a chapter page ≤ 20 KB; CSS ≤ 16 KB; scripts ≤ 15 KB; wasm ≤ 150 KB
in phase (a) and ≤ 350 KB by (e) (the compiler doesn't strip unused functions yet; if it
learns to, these fall). Fonts never on Apple devices.

**Order of loading:** the HTML and CSS (render-blocking, small); the boot script (inline);
`bible.js` and `dom.js` as modules (deferred); the wasm compiled while streaming
(`WebAssembly.compileStreaming`); the version text after the `load` event with
`fetch(…, { priority: "low" })`. Nothing else until a feature asks.

**Memory:** the text of one version is about 4.5 MB in wasm memory; Study's data 16 MB more;
Compare's five versions 22 MB more. All well inside a phone browser's limits.

---

## W14. Testing and CI

### W14.1 Unit tests
- `test_html.l8` (new): the markup for Genesis 1, Psalm 23, Psalm 119:1–8, John 3 and
  Jude (openers, poetry, footnotes, small caps, red letters, a verse across paragraphs);
  marks written into a chapter; escaping (§W1.4); the manual's paragraphs; a passage
  range for the day reader.
- `test_store.l8` gains the change-applying functions (§W12.3); `test_backup.l8` (new):
  writing and reading a backup, every merge rule of §W12.4, a malformed file refused
  with a plain message.
- All `test_*.l8` run natively and with `--wasm` (`make bible-test`,
  `make bible-wasm-test`, both in `make check`, as built).
- `test_text.l8`: a chapter laid out from its book's file alone has the same keys and
  layout as from the whole version (§W1.8); `tools/sizes.l8`'s table matches the runs.

### W14.2 The driver
`web/bible/test/drive.mjs`: Node, Chrome DevTools Protocol over the global WebSocket (no
dependencies), after the rig the repo used for Better and the race game (`drive.mjs` in
`/var/tmp/race/`, which the builder copies into the repo and keeps there):
- It starts headless Chrome (`--headless=new`, the runner's preinstalled Google Chrome in
  CI) and `web/bible/test/serve.mjs`, which **runs the real `worker.js`** in Node with an
  `ASSETS` stand-in reading `.build/bible-site/` and `UPSTREAM` pointed at a mock ESV API
  serving the worker's existing fixtures (as `test.mjs` does), plus fixture recordings in
  place of the audio hosts. So the CI tests the Worker's routing, headers and budget as
  deployed, with no key and no network.
- Each flow is one CDP session, with `Emulation.setDeviceMetricsOverride` set first, the
  cache disabled where a flow needs a cold start, `Network.emulateNetworkConditions` and
  `Emulation.setCPUThrottlingRate` for the performance flows, a fixed date (the app
  reads "today" through one function, which the test server's page sets to 2026-10-19
  08:00, as the iPhone's demo clock), and its steps: url, wait, tap, click, key, type, scroll (smooth, by script),
  eval, shot, pdf, offline.
- It logs every request (a request to any host outside the test server fails the run),
  every console error (fails the run), and, during scripted scrolls, the verse at the
  reading line each frame (§W3.9 item 3).

### W14.3 Shots
Three sizes: **phone** 390 × 844 at 2× (touch emulation on), **tablet** 820 × 1180 at 2×,
**desktop** 1440 × 900 at 1×. Paper and Night for every shot, the other themes once.
Named `w<phase>-<nn>-<what>-<size>-<theme>.png`, pushed by CI to the branch
**`ci-bible-web-shots`** (its own branch, so the web job and the iPhone jobs never race
to push), with a `RUN.txt` naming the run and commit, as `ci-bible-shots` has.

Per phase, at least:
- **(a)** John 3 at its first paint (the whole text held back); Genesis 1; Psalm 23 and
  119; Jude; a chapter boundary mid-scroll with the bar half collapsed; the bar
  collapsed; mid-fling with placeholders; the footnote popover; the first Go To; Reading
  settings open (each section); every theme; verse-per-line; 320 px wide at 200% text;
  the print PDF's first page; the `noscript` and newer-browser lines.
- **(b)** Go To empty, with a book open, with a query; the capsule; History; a preview
  (popover and sheet); Search with results, with no results, the ESV row and page; the
  tray with one and several verses; Copy's toast; Versions; the KJV, the ESV loading,
  loaded, offline and resting; Compare.
- **(c)** Highlights in five colours and a run; bookmark and note glyphs; the note editor,
  read mode, chapter note; the Library's tabs, filter, search, empty states, the delete
  Undo; ribbons in Go To and New Ribbon; Plans, a plan's days, the day reader with Mark
  Read and the day's end; the Manual (contents, a page, its search); This Browser; the
  restore sheet.
- **(d)** The mini player in each state; Voice; Study's three tabs; word study, definition,
  concordance in Greek and Hebrew; Study beside the text at 1440 px.
- **(e)** Memory tab; Practice at each level and Type; a word card's answer; the language
  page; the Alphabet; Forms; Verses You Can Read.
- **(f)** Offline: John 3, a jump, Study; the installed look (standalone display mode).

### W14.4 Checks and the manual's web text
- **Accessibility:** axe-core (pinned in `web/bible/test/package.json`, installed by `npm
  ci` in CI only, never shipped) runs at each shot's state; any violation at WCAG 2.2 A or
  AA fails the run. The contrast check of §W3.9 item 8.
- **Performance:** §W13's budgets, measured with `PerformanceObserver` (LCP, layout
  shift, long tasks) under the profile; a budget missed fails the run in the phase that
  set it.
- **The text never moves:** §W3.9's frame-by-frame check, run in (a) and again with marks
  (c) and the ESV (b).
- **`help.txt` on the web:** a paragraph may begin `@ios ` or `@web ` to be shown on one
  platform only (iPhone gestures and settings paths in one, clicks, keys and Home Screen
  words in the other); `help.l8` skips the other platform's, and `test_help.l8` checks
  both renderings (links, anchors, conditions, actions; every `{sym:…}` has a web icon,
  §W1.7). The iPhone's paragraphs are unchanged by this; the web designer writes the
  `@web` paragraphs with the phase that needs them.

### W14.5 The CI job
A job **`web`** in `.github/workflows/bible.yml`, on `ubuntu-latest` (cheap; no Mac),
run when `programs/bible/**`, `programs/web/**`, `web/**` or the workflow changes:
1. Build the compiler (as the other Linux job).
2. `make bible-web` (the shell, wasm, data whole and by book, the sizes tables).
3. Unit tests natively and in wasm (already in `make check`; run again only if `check`
   isn't).
4. `npm ci` in `web/bible/test/`, then the flows and shots of every built phase (about 5
   minutes with three sizes; split into two parallel jobs if it passes 10).
5. Push the shots to `ci-bible-web-shots`.

### W14.6 What needs a real device (the owner's list)
The CI's Chrome can't show Safari's behaviour, sound or a locked screen. Before each phase
is approved, on the owner's iPhone in Safari (and once Added to the Home Screen) and on a
laptop's Safari and Firefox:
- (a) A fast fling up and down through several chapters: no stop, no jump; the address bar
  shrinking with the bar; rotation keeping the verse; Find in page.
- (b) Back by the edge swipe closing a dialog and undoing a jump; Share to Messages; the
  ESV live.
- (c) A note typed with the keyboard up (the sheet stays above it); two tabs at once.
- (d) Listen with the screen locked, through a chapter's end; the lock screen's controls;
  the device voice for the KJV; VoiceOver on the page and the tray.
- (f) Reading in flight mode after one visit; installed to the Home Screen.

---

## W15. Out of scope, deferred, and iPhone-only

### W15.1 Out of scope (as the owner set it)
- **Sync** of anything between the iPhone and the web, or between browsers; **accounts**.
- **Anything server-side beyond what the Worker does,** except the two small changes
  (§W2.1's `/read/` routing and headers, §W12.6's web share of the ESV budget).
- **Reminders and notifications** (the plan's and Memory's daily reminder): on the web
  they need push messages from a server, which is out. Memory's Today and Go To's plan
  row are where the day's work shows.
- Analytics, logging of readers, cookies.

### W15.2 Deferred (worth doing later, in this order)
1. **Verse previews in shared links** (the verse's text in a link's preview): the Worker
   would read the chapter page and put the verse into the head (`HTMLRewriter`).
2. **Rounds 11–14** (the original text in the reader, the Greek and Hebrew courses,
   Aramaic): each comes to the web after the iPhone has it, by the same pattern.
3. **Share as Image** (§10.5): drawing the verse on a canvas with the reader's fonts.
4. **Downloaded recordings for offline listening**: the hosts send no CORS headers, so the
   recordings would have to be served from our own origin; the BSB's are CC0 and the
   WEB's public domain, so it's allowed, but it's bandwidth and storage the owner should
   decide on (§W16).
5. **Importing a web backup on the iPhone**: the backup is the iPhone's own files, so it's
   a small iPhone feature when wanted.

### W15.3 iPhone-only for now
The daily reminder; downloaded recordings and the 500 MB listening cache; Share as Image;
haptics; Keep the Screen On's per-app behaviour where the browser lacks Wake Lock;
VoiceOver's rotor actions (the web has its own equivalents); the iPad's menu bar.

---

## W16. Questions only the owner can answer

Each is decided above; the owner may overrule.
1. **The home page's change** (§W2.5): "a free Bible reader for iPhone and the web" and a
   closing sentence linking to smoothbible.com/read. Or no change, or other words.
2. **Where it lives** (§W2.1): `smoothbible.com/read/` (decided), or the root, or
   `read.smoothbible.com`.
3. **The ESV on the web from the start** (decided: yes), with the web's own share of the
   daily budget (1,500 text, 1,000 audio queries a day; §W12.6). Or the ESV left out of the
   web until the budget is understood.
4. **The `faint` colour** (§W1.6): darkened on the web for WCAG AA (decided). Should the
   iPhone take the same values? (Default: no change on the iPhone; a note for its
   designer.)
5. **Downloaded fonts** where the device lacks the iPhone's (§W1.6): Source Serif 4 and
   Charis SIL (decided), or system fonts only (the site's own rule, which would leave
   Windows and Android with Times-like serifs).
6. ~~Prerendering all five versions~~ **Answered by the owner (2026-10-20): no prerendered
   pages** (§W1.8).
7. **The privacy policy** stays as it is, covering the web app (decided: it already speaks
   of "the app and site" broadly).
8. **Restore merges** (decided) rather than replacing everything.
9. **Single-key shortcuts on by default** (G, /, [, ], B, L, I), with a switch to turn them
   off (decided).
10. **Iowan offered only where the device has it** (decided), or not on the web at all.
11. **Hyphenation on** (decided; the browser's own, which can't be tuned as the iPhone's
    0.3 factor), or off.
12. **Offline recordings** (§W15.2 item 4): later, served from smoothbible.com, or never.
13. **No reminders on the web** (decided; they'd need push messages from a server).
