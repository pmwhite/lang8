# Web review a1: phase (a), the reader alone, at e9c7b357, CI run 39514583731

I reviewed the snapshot of run 39514583731 (`ci-bible-web-shots`, `RUN.txt` naming
e9c7b357f). The sources were:
- **Shots:** all 64 PNGs (wa-01 to wa-20 at phone, tablet and desktop, Paper and Night,
  the other themes once) and the print PDF `wa-07-print-john3.pdf` (its text read with
  `pdftotext`).
- **Checks and log:** `checks.json` (65 checks, all passed) and `drive.log`.
- **The code:** `html.l8`, `prerender.l8`, `web.l8`, `web_reader.l8`, `web/bible/boot.js`,
  `page.html`, `read.css`, `build.py`, `about.html`, `web/bible/test/serve.mjs` and
  `flows.mjs`, and the bridge's wake lock in `web/dom.js`.
- **The builder's notes:** the deviations and three questions, as the coordinator relayed
  them.

## A. The verdict

Phase (a) is close to what §W3 asks for, and in places better:
- the text is on screen in 472 ms on the 4G profile, with no layout shift;
- adoption changes no pixel;
- the window, the place and the history behave as specified through every scripted flow;
- the type and themes match §2 and §W1.6;
- it reads well with scripts off.

**No Blocker. Three Majors, all small to fix: approved once they are fixed.** I'll check
the fixing run's shots wa-05, wa-10 (tablet) and wa-15, and the new checks named below. No
second full review is needed. Eight Minors and two Nits can land with the fixes or with
(b).

## B. Timings and sizes against §W13 and §W3.9

| Measure | Budget | Measured |
|---|---|---|
| Text on screen (LCP), 4G profile | ≤ 1.5 s | 472 ms |
| Layout shift | ≤ 0.01 | 0.0000 |
| App ready | ≤ 3.5 s | 2,403 ms |
| wasm, gzipped | ≤ 150 KB | 26 KB |
| CSS | ≤ 16 KB | 5 KB |
| Scripts | ≤ 15 KB | 10 KB |
| John 3's page | ≤ 20 KB | 4.5 KB |

All are well inside. §W3.9's twelve acceptance items each have a passing check (item 11 by
print styles; see the ruling in E). Two defects below got past the checks, and each Major
adds the check that would have caught it.

## C. Findings

### Major

**M1. A chapter added above the reader collapses the bar** (wa-10 tablet Paper). The shot
should show John 3's opener under an expanded bar titled "John 3". Instead the bar is
collapsed and titled **"John 2"**, with John 2's last line under it.
- **Cause:** `add_above` and `drop_first` move the page with `scroll_by` to keep the text
  still. The next frame's `follow_scroll` then reads that move as reading down
  (`dy > 0`), so `p` goes to 1. The title then names the chapter at the collapsed bar's
  bottom, which is John 2.
- **The rule (§W3.3, §3.1.4):** the app's own compensating scrolls are not the reader's.
  The bar's state must not change because of them.
- **The fix:** `scroll_by` adds `dy` to `last_y`, so the next frame sees no movement.
  Jumps' scrolls are already followed by `expand_bar`.
- **Check:** in the adopt and scroll flows, `--p` and the title are the same before and
  after `settle_window` at rest, at all three sizes.

**M2. The book index page is overwritten with Genesis 1** (wa-15 at every size). On
`/read/bsb/` the app starts as on a chapter page: `adopt()` finds no `article.ch`, calls
`rebuild(0)` and writes Genesis 1 into `main` above the book list. The shot shows "Books"
over Genesis 1.
- **The rule:** the reader starts only on a page with a chapter. On a page without one
  (the book index, About, the manual from (c)), the app does the settings, the keys that
  aren't the reader's (`,` and `?`) and the theme, and nothing else.
- **Check:** after the app is ready on `/read/bsb/` there is no `article.ch` and the first
  link in `main` is Genesis 1's chapter link. Add an index shot after the app is ready
  (wa-15 waits for it).

**M3. The bar shows the text under it, and the compact title competes with it** (wa-05,
wa-04, and the top of every chapter reached by a jump: "a man." in wa-10, "all that He has
done." in wa-12, "forever." in wa-13). This is my design's fault, not the build's. §W3.4's
92% backdrop with a blur leaves the lines under the bar legible enough to read. In the
collapsed state, "John 3" sits on top of "Now there was a man of the".

**Amended (§W3.4):** the bar's backdrop is the theme's `bg`, opaque, over the bar's own
height in both states, with no `backdrop-filter`. The 18 px fade below it goes from `bg`
to transparent, as now. The rule hairline when collapsed stays. Nothing else changes. A
title on a plain field is the calm answer, and it costs no reading lines, since the lines
under the bar weren't readable anyway.
- **Check:** the bar's backdrop pixels in wa-05 are within 2 levels of the theme's `bg`.

### Minor

**m1. One verse per line breaks poetry's indents** (wa-18, Psalm 23).
- **Seen:** lines continuing a verse ("for You are with me;", "You anoint my head with
  oil;") start at 0, left of the verse's first line. The q2 lines sit at 1.2 em from the
  margin instead of 1.2 em in from the words.
- **The rule (§3.1.7):** every line's words start at 1.6 em or more, and poetry keeps its
  relative indents from there.
- **The fix:** in verse-per-line mode, q1 lines get 1.6 em, q2 1.6 + 1.2 em, and their wrap
  hangs at 1.6 + 2.4 em.
- **Check:** in verse-per-line mode, no line in Psalm 23 starts left of its verse's first
  word.

**m2. The footnote list numbers its notes 1, 2, 3 while the marks say a, b, c** (wa-20,
the print PDF: "1. 3 Or born from above").
- **The fix:** the list's marker is the mark's own letter, followed by the reference:
  "a  John 3:3 Or born from above; also in verse 7.", with `list-style: none`.
- **Why:** someone reading the printout or the page without scripts finds note "a" by its
  letter.

**m3. A tapped footnote mark shows the browser's blue tap highlight** (wa-06 Paper and
Night). Set `-webkit-tap-highlight-color: transparent` on the page, and give marks,
buttons and links a pressed state of `ink` at 8% instead.

**m4. Home pushes a history entry.** `home()` calls `jump()`, but §W3.4 makes Home the
status bar's tap, which is a scroll and not a journey.
- **The fix:** Home scrolls (smoothly; at once under reduced motion) to the chapter's top,
  or the previous chapter's, and expands the bar. It updates the entry with
  `replaceState` and shows no capsule.
- **Keys that do stay jumps:** `]` and `[` (§W10.1).

**m5. Hyphenation is too frequent, and breaks poetry.**
- **Seen:** "sur-face", "sepa-rated", "ex-panse" and "sepa-rate" in twelve lines of
  Genesis 1; "val-ley", "com-fort" and "fol-[low]" in Psalm 23.
- **Amended (§W1.6):** poetry, lists and centred lines get `hyphens: manual`. Prose keeps
  `hyphens: auto`, with these limits:
  - `hyphenate-limit-chars: 8 4 4` (Chrome, Firefox);
  - `-webkit-hyphenate-limit-before: 4`, `-webkit-hyphenate-limit-after: 4` and
    `-webkit-hyphenate-limit-lines: 1` (Safari).

  That is the web's nearest equivalent of the iPhone's 0.3 factor: words of 8 letters or
  more, never twice in a row. The owner approved hyphenation on, which this keeps.

**m6. The sheet's Done button has no padding** (wa-16, wa-17, desktop). Its text touches
the right edge of its focus ring, and the ring is square.
- **The fix:** a 44 px tall target with 12 px of horizontal padding, 8 px from the sheet's
  edge, and a focus ring of radius 8 px.
- (The ring showing is right: the shot opened settings with `,`.)

**m7. The fling preparation is not built** (§W3.3; the builder's deviation). It's
deferred to (b), where it must be built with its CI count. The owner's phone check for (a)
(F, item 1) will show whether it's needed sooner.

**m8. Accessibility checks ran on the phone in Paper only.** In (b), add one axe run per
theme family: Night, and Sepia, whose `faint` is nearest the limit. Also add the bar
collapsed and the footnote popover open.

### Nit

- **n1.** The Auto swatch's "Aa" is drawn in Paper's ink across both halves, so it nearly
  vanishes on the Night half. Draw each half's "Aa" in that half's ink (two clipped
  layers), as §3.7's swatch does.
- **n2.** The Jude page's book title sits about 1 em lower than Genesis 1's. That's
  because the divider is above it (accepted, below); fine.

## D. What's right (kept as is)

- **Typography:** §2.3's openers, the poetry's hanging indents, small-capital LORD, the
  acrostic letters in accent, psalm titles, heading ranges in accent italic, verse numbers.
  Source Serif 4 on Linux looks right. The column is 34 em at every width.
- **Themes:** the five themes and Auto, the web `faint` values, Night's popover on
  `#262421`. The theme colour meta is set before the first paint.
- **Reading settings:** a bottom sheet with the page live above it on the phone, and a
  popover under Aa wider than that. The fonts are each set in their own face, Iowan hidden
  on Linux, the switches are proper `role=switch`, and the keyboard shortcuts' footer is
  word for word.
- **The bar:** focus in it expands it and keeps it so. Tucked buttons stay focusable and
  stop taking pointers. The title's `aria-label` follows the chapter.
- **The landmarks** (banner, nav, main, the pager as its own nav, footer), the hidden h1,
  and the skip link.
- **The boot script:** it places a verse link before the app starts, and again once the
  fonts arrive, unless the reader has moved.
- **Wake lock:** it is re-requested on `visibilitychange`.
- **The old-browser line,** exactly §W1.1's words, at the end only.
- **Escaping:** `h_text` covers `& < > " '`, and the About page carries the web's credits
  (Source Serif, Charis, Lucide, the ESV notice).

## E. Rulings on the deviations

| Deviation | Ruling |
|---|---|
| Worker routing and headers left to `serve.mjs` for now | **Accepted as interim.** The Worker change is specified in WEB.md §W2.1a (answer 1 below), and is the web builder's to make |
| Psalm 1: the major section (BOOK I) above the opener "Psalms 1" | **Accepted:** it is DESIGN.md §3.1.2 ("the major section 'BOOK I' with its range comes first, as the data has it") |
| Footnote ids per chapter (`f999-1`) | **Accepted:** unique within the window, which `#f3.2`-style ids wouldn't be |
| Slugs from the books' names (`song-of-solomon`) | **Accepted:** the BSB's names, one table. Aliases such as `song-of-songs` resolve through `parse_ref` in (b) (§W2.2). WEB.md's example is corrected |
| The divider always above a prerendered page's first chapter (not Genesis 1) | **Accepted:** it is what the window shows once the chapter before is added above, so adoption and insertion move nothing. Seen in every shot; it reads as the page's top margin |
| The Search icon hidden in (a) | **Accepted:** `visibility: hidden` keeps the title centred and keeps a dead link out of the tab order. It returns in (b) |
| The print check uses print styles, not the PDF's text | **Accepted:** the PDF is still made. I read its text: John 3 alone, on two pages, its notes and the credit line at the end, no bar |
| The fast-fling preparation and its check not built | **Deferred to (b)** (m7) |
| The web job runs on every non-docs push | **Accepted:** it is cheap and on Linux. If it ever passes 10 minutes, split it as §W14.5 says |
| About's text copied from the iPhone's strings | **Accepted:** with the web's credits added, which they are |

## F. The builder's questions

**1. Who makes the Worker change, and when.**
- **Who:** the web builder makes it, as specified in WEB.md §W2.1a (added with this
  review): `/read` routing to the shell, the security and cache headers, a constant boot
  script whose CSP hash is committed and tested, and the assets directory.
- **One commit:** "Smooth Bible: worker — /read/", with the cases in `test.mjs`.
  `serve.mjs` then drops its own routing in front of the Worker.
- **When:** now, with the Majors' fixes. Deploying it, which puts the web reader live, is
  the owner's step, with consent through the coordinator, after the fixing run is
  approved.
- **The ESV budget split:** §W2.1a's second part, made in (b), before the web offers the
  ESV, and deployed with (b).

**2. The always-visible divider and the Psalm 1 order:** both accepted (E).

**3. `[` at a chapter's start goes to the previous chapter's start:** **yes, as built.**
- **The rule:** `[` goes to the start of the chapter read when you're inside it, and to the
  previous chapter's start when you're already at its top (within 13 px of the reading
  line). Home (m4) has the same rule, as a scroll rather than a jump.
- **Why:** it's the iPad's ⌘[, and a music player's "previous". Pressed twice, it walks
  back chapter by chapter.

## G. On the owner's device list (§W14.6, phase a)

Before the web reader goes live, on the owner's iPhone in Safari:
- a fast fling up and down through several chapters (no stop, no jump; this decides m7's
  urgency);
- the address bar shrinking with our bar;
- rotation keeping the verse;
- Find in page;
- Keep the Screen On holding while reading.

On a Mac in Safari and Firefox:
- the same scroll;
- the settings popover;
- printing a chapter.

## H. Addendum (2026-10-20): what the owner's two later decisions change here

- **The scroll position is never written to make up for content** (§W3.3 rewritten as a
  height table). M1's cause is gone. Its rule stays: the app's own writes never count as
  reading.
- **No prerendered pages** (§W1.8 rewritten; the shell for every path, the first paint
  from the place's book):
  - **Moot:** M2 (there's no book index page); the ruling on the divider above a
    prerendered page's first chapter; the checks "adopted with no pixel changed" and
    "the text without scripts"; the old-browser line at a chapter's end (now one line in
    an empty page).
  - **Still standing:** M3 (the opaque bar); m1 and m3–m8; m2 for print, where the notes'
    list is still shown; the rulings on Psalm 1's order, footnote ids, slugs, the hidden
    Search icon, the print check, the CI trigger and About.
  - **Question 1 (the Worker):** §W2.1a now answers every reader path with the shell, its
    title filled per path, and `noindex` on everything under `/read/`.
