# Web review a2: phase (a) rebuilt, at 5860fb03, CI run 39531334054

I reviewed:
- **the run's snapshot:** `ci-bible-web-shots` with `RUN.txt` naming 5860fb032; all 61
  shots, the print PDF, `checks.json` (102 of 102), and `estimates-phone.txt` and
  `estimates-desktop.txt`;
- **the code** that changed since REVIEW-web-a1: the Worker's `/read/` handling
  (`worker.js` `read`, `fillShell`, the headers), `books.js`, `boot_hash.js`, and the
  scroller in `web_reader.l8`;
- **the builder's notes,** as the coordinator relayed them.

## A. The verdict

**Approved.** Phase (a) now does what WEB.md asks, as amended for the height-table
scroller (§W3.3) and for no prerendered pages (§W1.8):
- The owner's two findings are answered at their causes:
  - **the jump** was the iPhone's address bar being treated as a resize; now only a width
    change relays out, and never with a finger down;
  - **the end of the page** can no longer be reached, because the page is the whole
    Bible.
- **The CI shows both.** Slow drags with pauses, and with the height changing mid-drag,
  across John 3/4, Psalms 118–120 and Malachi 4/Matthew 1, move the text exactly with the
  scroll and write nothing. Flings at 8,000 and 20,000 px/s never reach the end.
- **Every budget is met with room** (B).
- **REVIEW-web-a1's Majors are fixed or moot,** and its Minors are in (D).

**One fix before the Worker is deployed** (M1 below, a line or two and a test). Going live
is the owner's step, with consent; nothing else here needs to wait for it. Five Minors go
with phase (b).

## B. Budgets and sizes (§W1.8, §W13)

| Measure | Budget | Measured |
|---|---|---|
| Text on screen, first visit, 4G at 4× CPU | ≤ 1.5 s | 1,032 ms |
| App ready | ≤ 1.8 s | 1,010 ms |
| Layout shift | ≤ 0.01 | 0 |
| Second visit | ≤ 0.8 s | 512 ms |
| Slow 4G (report-only) | ≤ 3 s | 1,748 ms |
| Estimates, phone: mean / worst / signed above John 3 | 2% / 6% / 1.5% | 0.53% / 3.5% / 0.10% |
| Estimates, desktop | 2% / 6% / 1.5% | 0.24% / 5.5% / 0.06% |

The sizes table is 13 KB rather than about 6 KB, because it keeps every block kind's
counts. **Accepted:** it's what makes the estimates this good, and it still fits the first
paint easily.

## C. Findings

### Major (before deploying the Worker)

**M1. The shell is fetched with the visitor's conditional headers.**
- **The code:** `read()` asks for the shell with `new Request(new URL("/read/shell",
  url), request)`, which copies every header of the visitor's request, including
  `If-None-Match` and `If-Modified-Since`. `fillShell` then reads the answer's body.
- **The risk:** if the assets answer `304` (a `Last-Modified` kept from an earlier
  answer is enough), `await shell.text()` is empty, and the visitor gets a blank page
  with status 200.
- **The fix:**
  - ask for the shell with a plain `GET` and no request headers
    (`new Request(new URL("/read/shell", url))`);
  - also delete `last-modified` from the filled response, as `etag` already is.
- **The test in `test.mjs`:** a reader path requested with `If-None-Match: "x"` and
  `If-Modified-Since` gets the full, filled shell.

### Minor (with phase b)

- **m1. Dialogs focus Done when opened by a click** (wa-15, wa-16: the ring shows).
  - **The rule:** the first focus goes to what the dialog is for:
    - Go To: the current chapter's cell in (a), and its field from (b) on a device with a
      fine pointer (§W5.2);
    - Reading settings: the size slider.
  - Done keeps its place in the tab order. A ring then shows only when the keyboard
    opened the dialog.
- **m2. Go To on desktop is about half the window's height** (wa-15 desktop: about 450 of
  900 px). With John centred, both testaments' headers and most of the list are out of
  sight.
  - **The fix:** the panel is up to 88 vh tall (§W1.4).
  - Each testament's header stays at the top of its column while that column is in view
    (`position: sticky`).
- **m3. wa-21, the mid-fling shot, shows the page at rest.**
  - **The fix:** capture during the gesture (a screencast frame taken while
    `synthesizeScrollGesture` runs), so the shot shows placeholders if any are on screen.
    The checks already prove the end is never reached; the shot is for the eye.
- **m4. Before the whole text arrives, estimates from the sizes table alone err up to
  7.7% for about a second.** **Accepted:** the anchor never moves, and corrections land
  above or below it.
  - **One check to add:** in that second, the signed error above the place stays inside
    `pos[0]`'s slack, so Genesis 1 can't be pushed below zero.
- **m5. REVIEW-web-a1's m7 and m8:**
  - **m7** (the fling preparation) is **closed.** §W3.3's window reaching ahead with the
    fling's speed replaced it, and the fling checks pass.
  - **m8** (an axe run per theme family and per state) moves to (b), as the builder
    proposes.

### Nit

- **n1.** Prose still hyphenates now and then ("sepa-rated" in Genesis 1:4). That is
  within the amended rule (words of 8 letters or more, never two lines in a row), and
  poetry no longer hyphenates (Psalm 23 has none). Kept.

## D. REVIEW-web-a1, closed

| Item | Now |
|---|---|
| M1 (the bar collapsed by the window's writes) | Gone with §W3.3; checked at three sizes ("the bar expanded and named John 3 after the window settled"); wa-10 tablet is right |
| M2 (the book index page) | Moot: no index pages; `/read/bsb/` opens Go To over the place (checked) |
| M3 (the bar showing the text under it) | Fixed: wa-05 and wa-04 show a plain bar, and its backdrop is checked against Paper's `bg` |
| m1 verse-per-line indents | Fixed (wa-18; checked: no line of Psalm 23 starts left of its verse's words) |
| m2 the notes' list | In, for print |
| m3 the tap highlight | Fixed (wa-06: no blue box on the mark) |
| m4 Home as a scroll | Fixed (checked: no history entry) |
| m5 hyphenation | Fixed (Psalm 23 has none; prose rarely) |
| m6 Done's padding | Fixed (rounded, padded; the ring itself is m1 above) |
| m7, m8 | C m5 above |

## E. Rulings on the deviations

| Deviation | Ruling |
|---|---|
| The shell's head filled by string replacement, not `HTMLRewriter` | **Accepted.** The shell is ours and small, the values are escaped (`esc`; every value goes into a double-quoted attribute or text), names come from `books.js`, and it runs under Node's tests. M1 applies to how the shell is fetched, not how it's filled |
| `text_load_book` takes an allocation argument | **Accepted** (the caller owns the memory, as with the iPhone's mapped files) |
| New general bridge calls: computed style as a number, px on many children, low-priority and early fetches, memory that is kept | **Accepted.** They are general, not Bible-specific. `web/README.md`'s list of what `dom.l8` covers should name them; add that with (b) if it isn't there |
| Footnote marks numbered per chapter (`f<c>-<n>`), not by byte offset | **Accepted:** stable across versions' layouts and unique in the window |

## F. The shots, looked at

- **First paint (wa-02):** John 3 from John's file alone, with the opener, heading, range,
  footnote marks and the faint `faint` numbers, and the bar named by the Worker. The same
  frame 3 s later is identical.
- **No JavaScript and an old browser (wa-01, wa-20):** one plain line each, centred and
  faint, with the bar's title already "John 3" and the credit line with About. Calm and
  right.
- **The bar (wa-04, wa-05):** opaque; the collapsed title reads clearly over nothing.
- **Go To:**
  - phone (wa-15): the books as rows with counts and chevrons, John open, chapter 3 in
    accent; as §W5.2 and §3.2;
  - desktop: two columns, as §W5.2, with m2's height to fix.
- **Footnote (wa-06):** placed above the mark, on `cellBg`, with no tap highlight.
- **Settings (wa-16, wa-17):** as REVIEW-web-a1 found them, with the Done fix.
- **The rest:** themes, Genesis 1, Psalms 23 and 119, Jude at all three sizes, and 320 px
  at 200%: unchanged from a1's approval of them, or better.

## G. Going live

Once M1 is in and green:
1. `make bible-web`;
2. deploy the Worker (`npx wrangler deploy` from `programs/bible/worker/`), with the
   owner's consent;
3. on the owner's iPhone in Safari, the device list of REVIEW-web-a1 §G. The fling and
   boundary checks are already answered by the CI and WebKit 27.2; what's left for the
   phone is rotation, Find, Keep the Screen On, and a first visit on cellular.

The home page's sentence and link (§W2.5) can go with the deploy or after it; the owner
approved the wording.
