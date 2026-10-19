# Smooth Bible: design specification

The product designer writes this, the builder implements it exactly as written, and the
designer reviews CI screenshots against it. If something here can't be built under the
constraints in `/tmp/bsb/brief.md`, the builder says so in the commit message and builds
the nearest equivalent. The builder doesn't silently invent a different design.

Status: Rounds 1–3 are approved and on TestFlight as 1.0 (9). **Round 4 (versions, the
ESV, Compare, cross references and commentary) is the work now, fully specified in §9.**
Round 5 (reading plans and a plan's daily reminder, exact senses, related words, share as
image) follows, specified in §10; the verse of the day was dropped (§10's owner
amendment). Round 6 was built as automatic readings (TestFlight 1.0 (15)); the owner revised it on
2026-10-19 to **ribbons** (named places you carry while you read, made only by you, in Go
To's Ribbons section) with **plans on their own list** again, specified in §11 and to be
built now. Round 7 (recorded readings: Listen reads every version, the BSB and WEB by
human readers streamed from openbible.com and eBible.org and followed verse by verse with
bundled timings, the ESV by its own recording through our Worker, the rest by the
iPhone's best voice) is specified in §12 and follows. Round 1 is
§0.5–§6, Round 2 is §7 and Round 3 is §8. The owner's priorities, in order: distraction-free reading, note-taking, language tools.
Above all: iPhone-native, HIG-proper, predictable UI. The app is **free forever**: no
price, ads, in-app purchases or donation prompts (owner, 2026-10-18).

---

## 0. Principles

1. **The text is the interface.** Chrome appears when it's wanted and gets out of the way
   when it isn't. Every screen is quiet: one accent color, no ornament that doesn't carry
   meaning, no borders where spacing will do.
2. **Native first.** Use UIKit's own controls: navigation bars, sheets with detents,
   insetGrouped tables, search controllers, segmented controls, popovers, the system edit
   menu, and UIActivityViewController. Restyle them only through their public appearance
   APIs. Never draw a fake control.
3. **Calm motion.** Short springs with no bounce, and nothing that moves without a reason.
   Respect Reduce Motion (`UIAccessibilityIsReduceMotionEnabled()`): every animation is
   replaced by a 0.15 s cross-fade or by no animation.
4. **Nothing is lost.** Place, highlights, notes, bookmarks and settings are saved as soon as
   they change.
5. **Apple's Human Interface Guidelines are law.** Use standard controls in their standard
   places, with system gestures and system wording (Done, Edit, Cancel, Search). Where a
   system pattern exists, use it rather than inventing an interaction. One gesture means
   one thing everywhere.
6. **Nothing changes abruptly.** Every visible state change of a bar, a backdrop, a
   search field, a scope bar, a clear button, a toolbar, a title or a material must either
   animate (fade, slide or system-animated change, at least 0.2 s, or the system's own
   duration) or not happen at all.
   - No appearance may swap on a scroll threshold. If a bar looks different scrolled and
     at rest, the difference is a continuous function of the scroll offset; otherwise, it
     looks the same in both states.
   - Controls in a sheet must be in their final state **before** the sheet's presentation
     animation begins. Configure them in `viewDidLoad` or `viewWillAppear:`, never in
     `viewDidAppear:`. A sheet must never visibly rearrange itself after it lands.
   - Disable implicit `CALayer` animations on layers the app drives frame by frame
     (`[CATransaction setDisableActions:YES]`), so they don't lag behind the scroll.
   - Reviews check this with the CI screen recording (§5, "Transitions"), not only the
     still screenshots.
7. **No blocks.** Every API chosen works with target-action, delegates or selector-based
   commands. Where a feature truly needs a block, it's flagged **[BLOCK SHIM]**. The only
   sanctioned shim is §10.2.3's global block, for notification authorization in Round 5.
   Nothing else may use it without a design change here.

### Animation without blocks (applies everywhere)
`+[UIView animateWithDuration:…]` and `UIViewPropertyAnimator` take blocks, so use these
instead:
- **Core Animation**: `CASpringAnimation` / `CABasicAnimation` added to a layer, with the
  model value set first. Spring for panels: `mass 1, stiffness 300, damping 30`
  (critically damped, about 0.35 s). Fades: `CABasicAnimation` on `opacity`, 0.2 s,
  `kCAMediaTimingFunctionEaseInEaseOut`.
- The legacy `+[UIView beginAnimations:context:]` / `setAnimationDuration:` /
  `setAnimationCurve:` / `commitAnimations` also works (deprecated, still functional) and is
  acceptable for alpha and frame changes.
- `setNavigationBarHidden:animated:`, `setContentOffset:animated:`,
  `presentViewController:animated:completion:nil` and `scrollToRowAtIndexPath:…animated:`
  animate by themselves.
- Timers: `+[NSTimer scheduledTimerWithTimeInterval:target:selector:userInfo:repeats:]`.
- Background work, if ever needed: `dispatch_async_f(queue, ctx, fnptr)` (a C function
  pointer, not a block).

## 0.5 Defects seen in the CI run for 019e3ae1 (fix first, in Round 1)
These are confirmed in the continuous-scroll screenshots (run 39066212450). Each one is
also an acceptance criterion (§6, items 26–30).
1. **The bar title shows while the chapter opener is visible.** (Owner amendments
   2026-10-18: the title fade is replaced, because on a real iPhone the title faded
   out while the next chapter's opener came up, "John 3" → nothing → "John 4", a flicker;
   then, the same day, the push made earlier and the title never empty.)
   - **The title never disappears**, at Genesis 1 too: at its top the bar says
     "Genesis 1" (the title is the way into Go To, so it must be there and tappable).
   - It names the chapter being read. While John 4's divider and opener come up the
     page from below, it says "John 3".
   - **Owner amendment 2026-10-19 (replacing the push of 2026-10-18): the title's text
     changes in place.** The title names the chapter whose row (its divider, then its
     opener) holds the bar's current bottom, so its top has reached the bar. When that
     chapter changes, the one title button's text is swapped where it is, with a 0.18 s
     cross-fade (a `CATransition` fade on the button's layer). Under Reduce Motion it
     changes at once. Nothing moves vertically, and there's no second name. Scrolling back
     changes it back the same way. So after a jump to Psalm 23 (its opener just under the
     bar) the bar says "Psalm 23", never the chapter before. Mid-scroll, the bar and the
     opener's numeral may both say "John 4" for a moment; accepted.
   - Built as one title button inside the scaled title view (and the view that fades it as
     the bar collapses); it takes taps and is read by VoiceOver, and the compact band's
     accessibility label follows it. Its frame is set with implicit actions disabled.
   - Jumps (Go To, links, version switch) set the title the same way; a theme or version
     change sets it at once.
   - No text measurement is needed: the row's rect (`rectForRowAtIndexPath:`) gives its
     top. Also update the title after `go()`, after relayout, and on `viewDidAppear`.
2. **John 3 (and every chapter ≥ 2) is missing its book label.** It shows only "3". The
   "JOHN" label (§3.1.2) is required. Psalms correctly show "PSALM".
3. **The place is lost on a text size change.** 10 jumped from John 3 to John 2. After
   `UIContentSizeCategoryDidChangeNotification`, restore the **same verse** at the same
   distance from the top. Store the place as (chapter, verse, offset within verse) rather
   than (chapter, points), because the points change with the size. The same applies to
   every settings change in §3.7.
4. **The place is lost on relaunch.** 11 reopened at Genesis 1 instead of where 10 was.
   Save the place on `applicationDidEnterBackground`, `sceneDidEnterBackground` and
   `willTerminate`, and after every scroll end. Restore it after the table's first layout
   (in `viewDidAppear` or after `layoutIfNeeded`), not before the rows exist.
5. **The demo link step shows the system "Open in Smooth Bible?" prompt** (12). Call
   `open_link` from the demo directly (§5).
6. **The right-hand `list.bullet` books button** is replaced by Library and Aa (§3.1.1).
   The title is the only way into the picker.

---

## 1. Feature set by round

### Round 1: the reading app, made excellent (build now)

| # | Feature | Summary |
|---|---------|---------|
| R1.0 | Fix the §0.5 defects | Title fade, book label, place kept, demo link, bar items |
| R1.1 | Reading view polish | New typography, chapter openers, chapter dividers, and themes applied everywhere (§2, §3.1) |
| R1.2 | Chrome | Nav bar: Search · title · Library · Aa. Hides on scroll down, returns on scroll up (§3.1) |
| R1.3 | Passage picker | Sheet: reference search field ("jn 3:16"), Recent, Books (OT/NT), chapter grid, verse grid (§3.2) |
| R1.4 | Quick reference parser | Book aliases plus chapter, verse and range parsing in `text.l8`, unit-tested (§4.2) |
| R1.5 | Back capsule | After any jump, a "‹ Psalm 23" capsule returns to where you were (§3.1.6) |
| R1.6 | Verse selection | Tap verses to select them. A floating action tray offers highlight in 5 colors, Copy, Share, Bookmark and Note (§3.3) |
| R1.7 | Text-selection edit menu | Long-press selection gets Highlight, Note, Copy with reference and Share added to the system menu (§3.3.5) |
| R1.8 | Highlights, bookmarks, notes | Drawn in the text, stored in files, edited in place (§3.3, §4.3) |
| R1.9 | Note editor | Sheet with the verse quoted and an editable text view, autosaved (§3.4) |
| R1.10 | Library | Sheet with a segmented Highlights / Notes / Bookmarks control, swipe to delete, tap to go, empty states (§3.5) |
| R1.11 | Full-text search | Search sheet, whole-word AND search, scope bar, results in context with matches emphasized, recent searches (§3.6) |
| R1.12 | Reading settings | Sheet: text size, theme (Auto/Paper/White/Sepia/Night/Black), font (5), line spacing, margins, verse numbers, headings, footnote marks, verse-per-line (§3.7) |
| R1.13 | Footnote popover polish | Themed popover with its reference header (§3.1.5) |
| R1.14 | Continue where you left off | Exists but is broken (§0.5 items 3 and 4): fix it, and keep the place across theme, font and size changes |
| R1.15 | Haptics | Selection, highlight, bookmark and copy feedback (§2.8) |
| R1.16 | Demo and CI | Multi-digit demo steps, the full demo list in §5, and no `simctl openurl` |

### Later rounds: priorities
The owner's priorities, in order, are (1) distraction-free reading, (2) note-taking, and
(3) language tools. Round 1 delivers (1) and the core of (2). **Round 2 is the
language-tools round** plus the note-taking depth that can't wait. Round 3 and later are
ordered by the same list. Each Round 2 item is fully specified in §7.

### Round 2: language tools, and notes made complete
| # | Feature | Summary |
|---|---------|---------|
| R2.0 | New text and language data | Switch the text to the publisher's current BSB USFM, and add the word-level data (Translation Tables) and the STEP lexicon (§7.1) |
| R2.1 | Study from a verse | The verse panel gains a fifth action, **Study**, which opens that verse's interlinear (§7.2, §7.4) |
| R2.2 | Study from a word | The long-press edit menu gains **Study** for the selected word, which opens its word study directly (§7.2) |
| R2.3 | Interlinear sheet | English chunks with the original word, transliteration and parsing under each, in English order or original order, with previous/next verse (§7.4) |
| R2.4 | Word study sheet | Original form, transliteration, lemma, gloss, plain-English parsing, a definition preview, occurrence count, "Translated as" (§7.5) |
| R2.5 | Definition screen | The full lexicon entry, with tappable references (§7.6) |
| R2.6 | Concordance | Every verse with that Strong's number, by book, with the English words emphasized, filterable by text, book range and rendering; tap to go (§7.7) |
| R2.7 | Acknowledgements | Settings → Acknowledgements: text and data credits, links, and the required STEP Bible credit and change record (§7.8) |
| R2.8 | Notes: read mode with live references | An existing note opens readable, with verse references as links and a standard Edit button (§7.9) |
| R2.9 | Library search and sort | A search field over highlights, notes and bookmarks, and Bible order or Newest (§7.9) |
| R2.10 | Add to note from study | Word study's toolbar adds "ἀγαπάω (agapaō, G25): to love" to the verse's note (§7.5) |

### Round 3: reading and notes, deepened (fully specified in §8)
In priority order (re-ranked in §8.0):
1. **R3.1 Passage previews.** References in headings, footnotes, definitions and notes open
   a preview, and its Open in Reader button jumps there.
2. **R3.2 Keep the screen on while reading.**
3. **R3.3 History.**
4. **R3.4 Chapter notes**, created with a compose button in Library → Notes.
5. **R3.5 Export notes and highlights** as Markdown.
6. **R3.6 Highlight color filter.**
7. **R3.7 Listen** (AVSpeechSynthesizer, with a mini player).
8. **R3.8 Words of Jesus in red**, off by default.
9. **R3.H Pre-App-Store hygiene.**

### Round 4: versions, and study resources (fully specified in §9)
In build order:
1. **R4.1 One model for many texts.** Marks stay keyed by BSB-numbered reference and show
   in every version that has the verse.
2. **R4.2 KJV, WEB, ASV and YLT,** bundled offline from eBible.org USFM.
3. **R4.3 Version picker** in Reading settings, switching in place with a cross-fade.
4. **R4.4 Compare:** a sixth tray action, the selected verses in every version.
5. **R4.5 The ESV,** online only, through our own Cloudflare Worker that holds the key,
   with a cache that never exceeds Crossway's 500-verse, half-a-book limit.
6. **R4.6 Cross references** (openbible.info, CC BY) in a References segment of Study.
7. **R4.7 Matthew Henry's Concise Commentary** (CCEL, public domain) in a Commentary
   segment of Study.
8. **R4.8 Acknowledgements,** the ESV copyright page, and a privacy page.

### Round 5: daily reading, exact senses, sharing (fully specified in §10)
1. **R5.1 Reading plans,** computed (a year, the NT in 90 days, Psalms and Proverbs in a
   month, the Gospels in 30 days), with a Today section in Go To.
2. ~~R5.2 Verse of the Day~~ **dropped by the owner (2026-10-18)**; what is left of it is an
   optional daily reminder of a plan's reading (the one **[BLOCK SHIM]**; §10, owner
   amendment).
3. **R5.3 Exact senses** (STEP's extended Strong's) in word study and the concordance.
4. **R5.4 Related words** (MACULA proximity, CC BY). This **replaces semantic domains**,
   whose Louw–Nida data isn't licensed to us.
5. **R5.5 Share as Image,** a custom action in the system share sheet.

### Round 6: ribbons, and plans on their own list (fully specified in §11; owner revision 2026-10-19)
1. **R6.1 Ribbons** (replacing 1.0 (15)'s automatic readings and Continue Reading).
   - A **ribbon** is a named place ("Morning", "With Anna"; by default the book's name),
     made only by you: New Ribbon Here… on the reader title's long-press menu, or New
     Ribbon… in Go To.
   - Opening a ribbon picks it up. While carried it follows your rests and the chapters
     you read, Listen included. Any jump puts it down where you were; the back capsule's
     undo picks it up again.
   - Ribbons live in Go To's first section, in the order made, up to 12, with ⓘ to rename
     or delete and a swipe to delete. The Library's verse bookmarks are unchanged.
2. **R6.2 Plans on their own list:** Go To's Reading Plan section (the plan's one row, and
   Reading Plans), Round 5's Plans list and detail with Start Plan restored, A Chapter a Day
   from Plans. The Start Reading sheet is gone.
3. **Migration:** up to three of the newest readings from the last 14 days become ribbons.

### Round 7: recorded readings (fully specified in §12)
1. **R7.1 Every version read aloud.**
   - The BSB by Bob Souer (default), Barry Hays or Jordan Gilbert (CC0), streamed from
     openbible.com.
   - The WEB by Winfred Henson (public domain), from eBible.org.
   - The ESV by David Cochran Heath, through the ESV API via our Worker.
   - The KJV, ASV and YLT by the best installed iPhone voice, with a one-time pointer to
     downloading a better one.
2. **R7.2 Following along with recordings:** verse timings computed offline by forced
   alignment and bundled (about 130 KB a reader). The ESV follows by chapter.
3. **R7.3 Never stopping for the network:** chapters fetched ahead into a 500 MB cache,
   optional book downloads, and a fall-back to the iPhone voice at the same verse.
4. **R7.4 Voice settings, lock-screen controls** (chapter skip, scrubbing, artwork),
   **speed for recordings, credits, and the privacy page's Listening paragraph.**

### Out of scope (all rounds so far)
- Widgets, Live Activities and App Intents (these need Swift or app extensions).
- SwiftUI.
- Sync and accounts.
- Copyrighted versions other than the ESV (NIV, NASB, NLT and others need licences that
  are granted only to organizations).
- SWORD modules.
- Downloadable content, except Listen's recordings (§12).

---

## 2. Visual design language

### 2.1 Themes and colors
Dynamic colors via `colorWithDynamicProvider:` need a block, so **the app holds an explicit
theme table** and reapplies it whenever the theme or the system appearance changes.
- **Auto** is the default theme. It resolves to **Paper** in light mode and **Night** in dark
  mode.
- Detect appearance changes by overriding `traitCollectionDidChange:` on the reader's view
  controller subclass (made at run time), comparing `userInterfaceStyle`.
- After resolving, set `window.overrideUserInterfaceStyle` to Light (1) for
  Paper/White/Sepia or Dark (2) for Night/Black. This keeps system sheets, menus, search
  bars and the keyboard consistent with the page.
- Under Auto, leave the override at Unspecified (0).

Apply the theme to the following:
- The table and cell backgrounds.
- Every attributed-string color (rebuild the chapter attributes and reload visible rows).
- Nav bar appearance.
- The window `tintColor` (= Accent).
- The popover background, the tray tint, and sheet backgrounds. Sheets use system grouped
  backgrounds, except that Paper, Sepia and Black set their own (below).

Keep the four existing named colors (Paper, Ink, Faint, Accent) in the asset catalog for
the launch screen and as Auto's values. Add the named colorsets **Heading**, **Rule** and
**Selection** as well (Auto values in the table).

| Token | Paper (Auto light) | White | Sepia | Night (Auto dark) | Black |
|---|---|---|---|---|---|
| `bg` page | `#FBF8F2` | `#FFFFFF` | `#F4ECDD` | `#1B1A18` | `#000000` |
| `ink` body | `#1E1C19` | `#161616` | `#3A2E21` | `#E6E1D7` | `#D6D1C7` |
| `heading` section heads | `#4F4943` | `#48484A` | `#5C4A36` | `#BDB6AA` | `#A9A399` |
| `faint` verse nos, refs, labels | `#8A8378` | `#8E8E93` | `#927F66` | `#8C857A` | `#77716A` |
| `accent` numerals, note marks, tint | `#9C3A2C` | `#9C3A2C` | `#8E4426` | `#DC8873` | `#D4806C` |
| `rule` chapter divider, hairlines | `#1E1C19` @ 12% | `#000000` @ 10% | `#3A2E21` @ 14% | `#FFFFFF` @ 12% | `#FFFFFF` @ 10% |
| `selection` selected-verse wash | accent @ 10% | accent @ 9% | accent @ 11% | accent @ 18% | accent @ 18% |
| `sheetBg` grouped sheet bg | `#F3EFE7` | system | `#ECE2D0` | system | `#000000` |
| `cellBg` grouped cell bg | `#FFFDF9` | system | `#F8F1E4` | system | `#1A1A1A` |

Highlight colors are background washes painted under the text with
`NSBackgroundColorAttributeName`. There are two sets: light themes (Paper, White, Sepia)
and dark themes (Night, Black).

| Name | Light themes | Dark themes | Swatch (tray circle, solid) |
|---|---|---|---|
| Yellow | `#FFD84D` @ 42% | `#E9C440` @ 30% | `#F5CD3D` |
| Green | `#8FD694` @ 40% | `#5DB466` @ 30% | `#6CC072` |
| Blue | `#8CC4F2` @ 42% | `#4E97DA` @ 32% | `#5AA6E6` |
| Pink | `#F5A3C0` @ 42% | `#D9668F` @ 32% | `#EE84AA` |
| Purple | `#C2A9F0` @ 42% | `#8F72D6` @ 34% | `#A889E8` |

The highlighted text keeps its normal ink. The colors are stored by name, not by hex, so
themes can change them.

### 2.2 Fonts
The body font is chosen in settings. `em` = `UIFontMetrics(Body).scaledValueForValue(19)` ×
the in-app size step (§3.7), rounded to 0.5 pt.

| Setting name | Font | How to get it |
|---|---|---|
| **New York** (default) | system serif | `preferredFontDescriptorWithTextStyle:Body` → `fontDescriptorWithDesign:Serif` |
| **Iowan** | Iowan Old Style | `fontWithName:@"IowanOldStyle-Roman"` (italic `IowanOldStyle-Italic`, bold `IowanOldStyle-Bold`) |
| **Charter** | Charter | `Charter-Roman` / `Charter-Italic` / `Charter-Bold` |
| **Georgia** | Georgia | `Georgia` / `Georgia-Italic` / `Georgia-Bold` |
| **San Francisco** | system sans | `preferredFontDescriptor…Body` (design default) |

If a named font returns nil, fall back to New York. Small caps for LORD/GOD use the
feature-settings trick that already exists. For fonts without a small-caps feature
(Georgia), synthesize it: render the lowercase letters as uppercase at 0.8 em with kern
0.02 em. Chrome, labels and UI text are always **SF Pro** (system font).

### 2.3 Reading typography (sizes relative to em)
Body line height is set with `lineHeightMultiple` from the spacing setting: Compact 1.18,
**Normal 1.32** (default), Relaxed 1.48. Paragraph spacing between prose paragraphs is
0.55 em. Hyphenation (`hyphenationFactor`) is 0.3 for left-aligned text, which helps the
narrow measure without making it ragged.

| Style | Font | Size | Weight / trait | Color | Paragraph |
|---|---|---|---|---|---|
| Body | body font | 1.0 em | regular | ink | left; para spacing 0.55 em |
| Verse number | SF Pro, `monospacedDigitSystemFontOfSize:weight:` | 0.58 em | semibold (0.3) | faint | baseline +0.36 em; followed by a narrow no-break space (U+202F, as now) |
| Verse number, bookmarked | same | same | semibold | accent | preceded by the `bookmark.fill` attachment (§3.3.4) |
| Book title (chapter 1 opener) | body font | 2.0 em | regular | ink | centered; space before 1.6 em, after 0.15 em |
| Book subtitle label (chapter 1 only) | SF Pro | 0.6 em | semibold, kern 0.14 em, uppercase | faint | **Not in Round 1: don't build it.** |
| Chapter label (chapter ≥ 2) | SF Pro | 0.62 em | semibold, kern 0.16 em, uppercase book name ("JOHN"; "PSALM" for Psalms) | faint | centered; before 0, after 0.05 em |
| Chapter numeral | body font, light weight (for New York, use descriptor trait weight −0.2; other fonts use regular) | 2.6 em | light | accent | centered; after 0.9 em |
| Section heading (S) | SF Pro | 0.84 em | semibold (0.4) | heading | left; before 1.5 em, after 0.35 em; line height 1.15 |
| Sub-heading (s) | SF Pro | 0.78 em | medium (0.23) | heading | left; before 1.1 em, after 0.3 em |
| Heading passage range (R) | body font italic | 0.76 em | italic | faint | left; after 0.7 em; R3.1 makes each reference a link in accent |
| Psalm title (D) | body font italic | 0.92 em | italic | faint | left; before 0.2 em, after 0.6 em |
| Major section (M) "BOOK I" | SF Pro | 0.62 em | semibold, kern 0.14 em | faint | centered; before 1.4 em |
| Major range (m) | body font italic | 0.78 em | italic | faint | centered; after 0.6 em |
| Acrostic letter (A) | SF Pro | 0.7 em | semibold, kern 0.12 em | accent | left; before 1.2 em, after 0.3 em |
| Footnote mark | SF Pro | 0.56 em | semibold | accent | baseline +0.38 em; tap target 44 pt (the current slack logic) |
| Poetry q1 / q2 | body | 1.0 em | regular | ink | first indent 0 / 1.2 em, head (wrap) indent 2.4 em; stanza break 0.8 em |
| List l1 / l2 | body | 1.0 em | regular | ink | first 1.0 / 2.0 em, head 2.0 / 3.0 em |
| LORD / GOD | body small caps | 1.0 em | regular | ink | |

Note the poetry change: **q1 starts flush** with prose, and **q2 indents 1.2 em**. Wrapped
lines hang at 2.4 em. This looks better than the current q1 indent of 1 em, and it's
the ESV and Crossway convention.

### 2.4 Layout and measure
- Page margins (left and right text container inset): Narrow 20 pt, **Normal 28 pt**, Wide
  40 pt. Cap the text width at 600 pt: on wider views, the inset becomes
  `(width − 600) / 2`.
- The first chapter's top gap is 0.8 em below the nav bar.
- **Between chapters**:
  - 2.4 em of space.
  - A centered **chapter divider**: a 36 × 1 pt hairline in `rule`, drawn as a
    `NSTextAttachment` image or as a centered paragraph containing `———` in rule
    color. Prefer an attachment with `bounds` 36 × 0.5, a 1 px image filled with
    `rule`.
  - 2.0 em of space.
  - Then the chapter label and numeral.
- Last chapter (Revelation 22): 120 pt of bottom inset after the text, and nothing else.

### 2.5 Chrome typography
- Nav title button: SF Pro 17 semibold (weight 0.4), ink. Then a `chevron.down` symbol at
  10 pt, weight bold, faint, with 4 pt padding.
- Sheet titles: system large titles (default).
- Table rows in sheets: system defaults (`UIListContentConfiguration` cell/valueCell), with
  ink and faint mapped from the theme. Don't override fonts in standard rows.
- Tray labels: SF Pro 11 medium, faint; reference label SF Pro 13 semibold, ink.
- Back capsule: SF Pro 14 semibold, ink. Image `chevron.left` 12 pt semibold.

### 2.6 Iconography (SF Symbols, `UIImageSymbolConfiguration`; nav bar items use 17 pt regular unless noted)
| Use | Symbol |
|---|---|
| Search (nav, leading) | `magnifyingglass` |
| Library (nav, trailing 2) | `bookmark` |
| Reading settings (nav, trailing 1) | `textformat.size` |
| Title chevron | `chevron.down` |
| Back capsule | `chevron.left` |
| Tray: Copy | `doc.on.doc` |
| Tray: Share | `square.and.arrow.up` |
| Tray: Bookmark / bookmarked | `bookmark` / `bookmark.fill` |
| Tray: Note | `square.and.pencil` (existing note: `note.text`) |
| Tray: close | `xmark` 13 pt semibold in a 28 pt circle (`systemFill`) |
| Tray: remove highlight | `circle.slash` in faint, the same size as a swatch |
| Highlight selected (swatch ring) | `checkmark` 12 pt bold, white, centered in the swatch |
| Note glyph in text | `note.text` at 0.62 em, accent |
| Bookmark glyph in text | `bookmark.fill` at 0.55 em, accent |
| Library segments | text only: "Highlights", "Notes", "Bookmarks" |
| Library empty states | `highlighter`, `note.text`, `bookmark` |
| Search empty / no results | `magnifyingglass` |
| Settings theme swatch selected | 2 pt accent ring + `checkmark` |
| Settings size − / + | `textformat.size.smaller` / `textformat.size.larger` |
| Recent (picker) | `clock.arrow.circlepath` |
| Go to reference row | `arrow.right.circle.fill` (accent) |
| Ribbon (Go To rows, title menu, toast; §11.2.6) | the ribbon glyph (drawn in code, template; not `bookmark`) |

### 2.7 Motion
| What | How |
|---|---|
| Bar collapse/expand | Proportional to the scroll while dragging; settles with a 0.25 s ease-out (§3.1.4, R2-17). The status bar never hides |
| Tray in | Translate from +(tray height + 24) to 0 with a CASpringAnimation (the §0 parameters), plus opacity 0→1 over 0.18 s |
| Tray out | Translate down plus opacity to 0 over 0.2 s ease-in; hide on finish (timer at 0.22 s) |
| Verse select wash | Immediate (no animation). The selection haptic carries the feel |
| Jump-to-verse flash | The target verse gets a neutral wash of ink at 9% (light themes) or 14% (dark themes), with no underline (amended in review 1). After 0.9 s it's removed by an NSTimer, with a 0.4 s cross-fade done by setting the attributed text inside `beginAnimations` with `UIViewAnimationTransitionNone`. If a fade is impractical, just remove it at 1.2 s |
| Back capsule | Fades and scales in (0.92→1) over 0.25 s; auto-hides after the user scrolls more than 2 screen heights from the arrival point, or after 12 s |
| Theme change | Cross-fade the whole window: add a `CATransition` (type `kCATransitionFade`, 0.25 s) to `window.layer` before applying |
| Font/size/spacing change | Reload in place, keeping the reading position (the existing restore logic). No animation |

### 2.8 Haptics
- Verse selected/deselected: `UISelectionFeedbackGenerator selectionChanged`.
- Highlight applied or removed: `UIImpactFeedbackGenerator` style Light (0), `impactOccurred`.
- Bookmark added: `UIImpactFeedbackGenerator` Medium (1).
- Copy: `UINotificationFeedbackGenerator notificationOccurred:Success (0)`.
- Note saved with changes: none (quiet).
- Theme swatch tapped: selectionChanged.
- Long jumps (picker, search result): none.

### 2.9 iOS 26 (Liquid Glass): bars, edges and floating controls
(Added 2026-10-19, after the first CI run on iOS 26.2.) The owner keeps iOS 26's look; these
rules make the app's layout sit right under its floating glass, with UIKit's own iOS 26 APIs.
Each is checked with `responds`/`NSClassFromString`, so iOS 16–18 keep their look.
- **Sheets' top edge** (`sheet_edges`, run by the sheets' navigation controller, `L8Sheet`,
  as it appears, lays out, or pushes a screen): each screen's scroll view is named to its
  bars with `setContentScrollView:forEdge:` (top and bottom), so the system's scroll edge
  effect is drawn there even where the scroll view is not the screen's own view (the
  passage preview's text view, the Study sheet's segments, the definition, the note).
  Its `topEdgeEffect` uses `UIScrollEdgeEffectStyle hardStyle`: nearly opaque under the
  title, so no words scrolled up show through a sheet's title or scope bar (shots 67, 68,
  110, 122d, 202b). The reader keeps its own bar and its soft top edge (§3.1.4).
- **Plain lists' headers** (search's "219 verses in the ESV", the concordance's): a
  background of the page's color (`listPlainHeaderFooterConfiguration`), so pinned under
  the bar they cover the rows passing under them.
- **Toolbars' floating buttons** (Open in Reader, ⌃/⌄, Add to Note, Interlinear, Stop
  Plan, the search field at the bottom): the bottom edge's effect (system, soft) is drawn
  under them on the screen's scroll view (as above), and `sheet_edges` makes sure the scroll
  view's bottom inset is at least what the toolbar covers, so the last row scrolls clear
  (raised only if the system's adjusted inset falls short; the console says so).
- **Library segments**: Highlights, Notes, Bookmarks sit on a row of their own at the top
  of the list (the table's header, 16 pt margins, the full width), not in the bar's title,
  where iOS 26's glass buttons left too little room ("Highlig…", "Bookma…"). The bar's
  title is "Library", Sort on the left, Done on the right. The highlights' color filter
  sits under the segments on Highlights. (On every iOS, so all show the same layout.)
- **Back capsule** (§3.1.6): while it is shown, a `UIScrollEdgeElementContainerInteraction`
  (edge bottom) on it draws the reader's bottom edge effect under it, as under the system's
  floating controls; it is let go once the capsule has faded out. The reader's insets never
  change for it (the text does not move when it comes or goes); instead the table's footer
  is 60 pt of room (12 + 36 + 12) after Revelation 22, so the very end can scroll clear above
  it. Anywhere else the text scrolls on under it, as under any floating control.

---

## 3. Screens and states

### 3.1 Reader

#### 3.1.1 Structure
Keep the existing design: a UINavigationController whose root is the reader VC, with one
UITableView where each row is one chapter's UITextView. Changes:
- Make the reader VC a run-time subclass of UIViewController (or UITableViewController) so
  it can override `traitCollectionDidChange:` and `preferredStatusBarStyle`. The status
  bar style follows the theme: dark content on light themes, light content on dark ones.
- Nav bar appearance: `UINavigationBarAppearance`.
  - `standardAppearance`: `configureWithDefaultBackground`, then `backgroundColor` = `bg` at
    80%, with the background effect `systemChromeMaterialLight` or `Dark` matching the
    theme, and a shadow color of `rule`.
  - `scrollEdgeAppearance`: `configureWithTransparentBackground`, background `bg`.
  - Title text attributes: ink.
  - On iOS 26 (where `UIGlassEffect` exists, checked with `NSClassFromString`), don't set a
    background color or effect. Let the system Liquid Glass bar render, and only set the
    tint and title colors.
- Bar items:
  - **Leading**: `magnifyingglass` → Search sheet.
  - **Title view**: the title button (the chapter read, its text changed in place as the
    next one's row reaches the bar, §0.5 item 1) → Passage picker.
  - **Trailing**: `rightBarButtonItems = @[Aa, Library]`. Aa (`textformat.size`) is
    outermost and opens Reading settings. Library (`bookmark`) opens the Library sheet.
  - All bar icons are tinted ink at 85%, not accent, which keeps the page calm. Accent is
    reserved for the text's own marks and for selected states.
  - Accessibility labels: "Search", "Library", "Reading Settings". The title's label is the
    chapter name, with the hint "Choose a book and chapter".

#### 3.1.2 Chapter opener
- Chapter ≥ 2: chapter label (`JOHN`), then the numeral (`3`), then the first heading.
- Chapter 1 of a multi-chapter book: the book title (`Genesis`, 2.0 em, ink), then the
  numeral `1`, smaller than usual (2.0 em, accent, light). There's no chapter label,
  because the title already names the book.
- Single-chapter books (Obadiah, Philemon, 2 John, 3 John, Jude): the book title only, with
  no numeral.
- Psalms: the label `PSALM`, then the numeral, then the psalm title (D) in italic.
  Psalm 1 also shows the book title "Psalms" above, and the major section "BOOK I" with
  its range comes first, as the data has it.

#### 3.1.3 Taps in the text (one UITapGestureRecognizer per text view, as now)
Find the character under the finger (the existing `closestPositionToPoint` logic), then
choose by priority:
1. On a footnote mark (± 16 pt): footnote popover.
2. On a note glyph attachment (± 16 pt): open the Note editor for that verse.
3. Inside a verse's text (body, verse number, LORD caps or poetry): **toggle that verse's
   selection** (§3.3). If the bars are hidden, they stay hidden. The tray is the chrome.
4. Anywhere else (the opener, headings, refs, gaps between chapters, the margins outside
   the text container): if a selection exists, clear it; otherwise nothing. **The bar never toggles on a tap in the text** (owner, 2026-10-18: it follows the scroll alone, §3.1.4; the small title still expands it). **A touch that lands while the text is still moving only stops it** (owner, 2026-10-18): the reader's tap ignores a touch while the table decelerates or within 0.12 s of its last move, as UIKit's own lists do.

#### 3.1.4 The collapsing bar (R2-17, replaces the Round 1 hide/show behavior)
The reader's top bar behaves like Safari's address bar. It **collapses in step with the
scroll** to a compact title under the status bar, and expands again the same way. **The
text never moves** because of the bar.

**Structure (how it's built):**
- The reader's navigation controller keeps its `UINavigationBar` **hidden permanently**.
  Set `navigationBarHidden = YES` once, before the first appearance, unanimated, and never
  change it again. Sheets keep their own standard bars.
- The reader draws its own bar from real controls: a top-pinned container `UIView` (the
  **reader bar**) holding:
  - The page-colored backdrop with its fade (§3.1.1, as built).
  - The three `UIButton`s (`plainButtonConfiguration`; the same SF Symbols, size and ink
    tint as now; 44 × 44 hit areas).
  - The title button (as now).
  - A **compact band button**: a `UIButton` over the compact band that expands the bar
    when tapped. It shows nothing itself: the title button shrinks into the band (owner,
    2026-10-18: "the smaller version should not disappear and then reappear").
- The status bar **stays visible at all times**, as in Safari. `prefersStatusBarHidden`
  is always NO. Hiding it changes the safe area and moves the layout, and the Dynamic
  Island band can't hold text anyway, so keeping it costs no reading lines.

**Geometry:**
- `S` = the status bar height (`view.safeAreaInsets.top`).
- Expanded bar height `E` = 44 pt. Compact bar height `C` = 20 pt.
- Collapse progress `p` runs from 0 (expanded) to 1 (collapsed).
- The bar's visible height is `S + E − (E − C)·p`, so it shrinks by 24 pt.
- The backdrop's height follows it, plus its 18 pt fade.

**No text movement (a hard rule):**
- The table uses `contentInsetAdjustmentBehavior = never`.
- `contentInset.top` and `verticalScrollIndicatorInsets.top` are set to **`S + E`**,
  constant, and recomputed only in `viewSafeAreaInsetsDidChange` and after a text-size
  change.
- The bar **overlays** the text: collapsing reveals the lines that were underneath, and
  expanding covers them again. `contentOffset` is never changed because of the bar.
- `go()`, the saved place and the title all measure against this constant inset, and
  `adjustedContentInset` no longer changes.
- Acceptance: with the content still, changing `p` from 0 to 1 changes no pixel below
  `S + E` points.

**Proportional collapse (while the finger is down):**
- Track the scroll delta while `isTracking` is true, and while decelerating after a
  drag.
- **Downward reading** (content moving up): `p` increases by `delta / 48` (**48 pt of
  scroll fully collapses it**, which is twice the 24 pt the bar loses, so the bar shrinks
  at half the speed of the text and feels attached but calm).
- **Upward scrolling**: reveal begins only after **12 pt of continuous upward travel**,
  a hysteresis that keeps small corrections while rereading a line from shaking the bar.
  After that, `p` decreases by `delta / 48`.
- **Near the top**: `p` is capped at `(contentOffset.y + S + E) / 48`, so the bar
  expands continuously as the text returns to its top, and is always fully expanded at
  the very top.
- Rubber-banding past the top or bottom doesn't change `p`.
- Apply `p` directly (no animation) inside `scrollViewDidScroll:`, with implicit layer
  actions disabled (principle 6). This is direct manipulation, so it never lags.

**Settling (when scrolling stops):**
- When scrolling ends (`scrollViewDidEndDragging:willDecelerate:NO`, or
  `scrollViewDidEndDecelerating:`) with `0 < p < 1`, animate `p` to 1 if the last
  movement was downward, or to 0 if it was upward.
- Use a 0.25 s ease-out (`UIView` legacy animations or a CA spring with no bounce). The
  content isn't touched.
- With Reduce Motion on, use a 0.15 s cross-fade between the two states.

**What happens to each element as `p` goes from 0 to 1:**
| Element | Behavior |
|---|---|
| Search, Library and Aa buttons | alpha `1 − 1.6p` (gone by p = 0.625), and scale `1 − 0.5p` about their centers, so coming back they fade in while growing to full size. `userInteractionEnabled = NO` when p > 0.5 |
| Title button | never fades for `p`: it stays centered in the bar's row and scales `1 − (5/17)p` (17 pt type to 12 pt), ending centered in the compact band (top at `S`, height `C`). Alpha `1 − 0.25p`, so it ends as ink at 75%; its text changes in place (below) at every `p` |
| Backdrop | follows the bar height. The fade's alpha is unchanged |
| Back capsule, verse tray | unaffected |

**The title's text (owner amendment 2026-10-19, replacing the push of 2026-10-18, which
replaced the title fade):**
- The title names the chapter being read: the one whose row holds the **current bar
  bottom**, `S + E − 24p` (§0.5 item 1, as amended). When that changes, its text is
  swapped in place with a 0.18 s cross-fade, at every `p`, with no movement.
- So the title is never gone (Genesis 1 included) and a chapter placed at the top, as
  every jump places it, is the one named.

**Revealing the bar (to p = 0, animated over 0.25 s unless noted):**
- Upward scroll after the 12 pt hysteresis (proportional, as above).
- **Tap on the small title** or anywhere in the compact band.
- Reaching the top (continuous, via the cap).
- **A tap on the status bar** (owner amendment 2026-10-18): the whole Bible is one table,
  so the system's scroll-to-top went all the way to Genesis 1. The reader's
  `scrollViewShouldScrollToTop:` returns NO and instead scrolls, animated
  (`setContentOffset:animated:YES`, the system's own feel), to the **top of the chapter
  read** (its opener under the bar, as `go()` places a chapter); if it is already within
  1 pt of that top, to the **previous chapter's top**. The bar expands with it. A row
  above that was only estimated is made exact when the scroll ends
  (`scrollViewDidEndScrollingAnimation:`). Sheets' tables keep the system's behavior.
- **Opening any sheet** from the reader (search, picker, library, settings, note, study):
  start the expansion animation in the same run-loop turn as the presentation, so the two
  animate together. A sheet never opens over a collapsed bar.
- Any jump (picker, search, link, concordance, back capsule): expand alongside the jump.
- A tap on a non-verse area (§3.1.3, item 4) no longer changes the bar (owner, 2026-10-18).
- **VoiceOver running** (`UIAccessibilityIsVoiceOverRunning()`): the bar never collapses
  (p stays 0).

Selecting verses doesn't change `p`. The tray is independent of the bar.

**The resting reading state is the compact title, not nothing.** This is decided against the
owner's first priority, distraction-free reading:
1. A 12 pt, 75%-ink chapter name in the band beside the Dynamic Island costs **no reading
   lines**, because that band can't hold text.
2. In a continuous scroll through 1,189 chapters with no page breaks, knowing where you
   are is part of calm reading. Without it, the reader has to scroll or tap to find out.
3. Hiding the status bar or the strip would change the layout, which is exactly the
   "lose a few lines" jolt the owner disliked.
4. It's the system's own answer to the same problem (Safari), so it's predictable.

The Round 1 "bars hidden, status bar hidden" state no longer exists.

#### 3.1.5 Footnote popover
The popover stays a popover on a phone (as now). Its background is `cellBg` for the
theme, or `systemBackground` for White and Night. The content is a 16 pt inset vertical
stack:
- A header: "Footnote · Genesis 1:3" in SF Pro 12 semibold, faint, uppercase off.
- 6 pt of space.
- The note text in the body font at 0.88 em (clamped to 15–22 pt), ink, line height 1.25.
- Maximum width 300 pt.
- Notes that cite references ("Cited in 2 Corinthians 4:6") are plain text in Round 1. They
  become links in R3.1.

To get the verse for the header, `text.l8` must know which verse each footnote is in
(§4.1).

#### 3.1.6 Back capsule
When the reader jumps (from the picker, search, the library, a link, or R2 cross-refs), the
place before the jump is pushed onto history and a capsule appears:
- Position: bottom-left, 16 pt from the leading edge and 12 pt above the safe-area bottom.
- Height 36, with horizontal padding 14.
- (Amended in review 1.) On iOS 26, `UIButtonConfiguration glassButtonConfiguration`, with ink
  title and image. Earlier: a `systemThickMaterial` capsule with the shadow below. It must
  be clearly visible in every theme. Originally: a `UIButton` with `UIButtonConfiguration`
  `grayButtonConfiguration`-style or `filled`,
  using background `cellBg` with a shadow (opacity 0.12, radius 12, y 4) and corner style
  capsule (`cornerStyle = 4`).
- Title "Psalm 23" (the chapter name, plus `:v` when the origin was verse-precise).
- Tapping it jumps back (and pushes the current place, so you can return).
- It hides as described in §2.7, and while the tray is visible.
- (iOS 26, §2.9.) The reader's bottom edge effect is drawn under it while it is shown; 60 pt of
  room after Revelation 22 lets the end scroll clear of it, with no change of inset.

#### 3.1.7 Reader in verse-per-line mode (setting)
Each verse starts a new paragraph, with prose paragraphs flattened. The verse number sits
in a hanging margin: first-line indent 0, head indent 1.6 em, and a tab stop at 1.6 em
after the number. Poetry still keeps its relative indents (q2 adds 1.2 em). Headings stay.

### 3.2 Passage picker (sheet)
This is a UINavigationController presented as a page sheet with detents `large` only and
the grabber visible. Its root is a UITableViewController (insetGrouped).
- Title "Go To" (large title). Done button on the right (system Done).
- `navigationItem.searchController`: a UISearchController with no results controller
  (`initWithSearchResultsController:nil`) and `obscuresBackgroundDuringPresentation = NO`.
  `hidesSearchBarWhenScrolling = NO`. Placeholder: `Book, chapter or verse — "jn 3:16"`.
  `searchResultsUpdater` = app delegate (`updateSearchResultsForSearchController:`), which
  filters the same table. The search bar uses `UITextAutocorrectionTypeNo`,
  `autocapitalization None`, and `returnKeyType Go`. `searchBarSearchButtonClicked:` goes
  to the top suggestion.
- **Sections, with an empty query**:
  1. **Recent**, if any (up to 4): rows with image `clock.arrow.circlepath` (faint), text
     "John 3:16", and secondary text with the first ~40 characters of that verse in faint
     (subtitle cell configuration). The list holds distinct chapters from history, newest
     first, excluding the current chapter.
  2. **Old Testament**: 39 book rows (valueCell: book name, chapter count in secondary
     faint, disclosure indicator). The current book's name is in accent semibold.
  3. **New Testament**: 27 rows, the same way.
  - On appear, the list scrolls so the current book is centered (existing behavior), unless
    Recent is visible and the current book is in the first screen.
- **Sections, with a query**:
  1. **Go to**: if the parser yields a reference, one row with image
     `arrow.right.circle.fill` (accent), text "John 3:16" in semibold, and secondary text
     with the verse's opening words (verse-level) or "Chapter 3 · 36 verses"
     (chapter-level). Tapping it goes there. If the parse is a book only, the row reads
     "John" with "21 chapters" and pushes the chapter grid.
  2. **Books**: books whose name or alias begins with the typed letters (case-insensitive;
     "1 c" matches 1 Chronicles and 1 Corinthians), up to 8.
  3. If nothing matches: `UIContentUnavailableConfiguration` (iOS 17+) with
     `magnifyingglass` and "No Matches", or a centered faint label on iOS 16.
- **Chapter grid** (pushed when a book is tapped): a UICollectionViewController with a
  flow layout, title = the book name (large title).
  - Cells are 56 × 56 pt (`(width − 2·20 − 4·10) / 5` per column on a 393 pt screen; compute
    the columns as `floor((w − 40 + 10) / 66)`), 10 pt spacing, 20 pt section insets.
  - Cell: a rounded rect with 14 pt corners, continuous style, `cellBg` fill, and the number
    in SF Pro 19 medium, ink.
  - The current chapter has an **accent fill with white text**.
  - Tapping a cell goes to the top of that chapter. There's no long-press action.
  - Single-chapter books skip the grid and go directly.
- **Verse grid**: no separate screen in Round 1. Verse precision comes from the typed
  reference.
- Every jump dismisses the sheet, scrolls the reader (unanimated, as now), flashes the
  target verse when verse-precise, pushes history, and shows the back capsule.

### 3.3 Verse selection and actions

#### 3.3.1 Model
`selected`: a sorted set of (chapter, verse) pairs, all in **one chapter**. Tapping a verse
in another chapter replaces the selection.

#### 3.3.2 Rendering
- Selected verses get `NSBackgroundColorAttributeName` = `selection`, plus an underline:
  `NSUnderlineStyleAttributeName` = `NSUnderlineStyleSingle | NSUnderlinePatternDot`
  (`0x01 | 0x0100` = `0x0101`), with
  `NSUnderlineColorAttributeName` = accent at 70%.
- The range runs from the verse's number (inclusive) to the end of its text (exclusive of
  the separating space, and inclusive of footnote marks).
- Selecting re-sets the attributed text of that one text view only. Don't reload the table
  row, which would cause a height change and flicker. Use
  `textStorage beginEditing / addAttributes:range: / endEditing`, which doesn't relayout
  heights because the fonts are unchanged.

#### 3.3.3 Action tray
This is a floating panel that appears when the selection becomes non-empty and disappears
when it empties.

Container and placement:
- `UIVisualEffectView` with `UIBlurEffect` style `systemChromeMaterial`
  (`UIBlurEffectStyleSystemChromeMaterial`; look up its enum value in the SDK header), or
  `UIGlassEffect` on iOS 26.
- `layer.cornerRadius` 26, `cornerCurve` continuous, and `clipsToBounds`.
- A shadow: put the effect view in a plain container view with shadow opacity 0.15, radius
  20, y offset 6, and black color.
- 12 pt from the screen's left and right edges, and 8 pt above the safe-area bottom.
- The height is intrinsic, about 132 pt.
- It's added to the navigation controller's view, so it floats above the table.

Contents, as a vertical stack with 14 pt inset and 12 pt spacing:
1. **Header row** (horizontal): the reference label on the left (SF Pro 15 semibold, ink),
   e.g. "John 3:16" or "John 3:16–18" or "John 3:16, 18" (non-contiguous verses are joined
   with commas, and runs collapse to en-dash ranges). On the right, the close button (28
   pt circle, `xmark`).
2. **Color row** (horizontal, equal spacing, centered): five 34 pt swatch circles
   (UIButtons with a filled background in the swatch color, corner radius 17), plus, only
   when any selected verse is highlighted, a sixth `circle.slash` button.
   - If all selected verses share one color, that swatch shows a `checkmark`.
   - Tapping a swatch applies that color to all selected verses, clears the selection, and
     dismisses the tray. Tapping the checked swatch removes the highlight.
   - Each swatch has the accessibility label "Highlight Yellow", etc.
3. **Action row** (a horizontal `UIStackView`, fillEqually, 4 buttons; Round 2 appends a
   fifth, Study, so don't hard-code the count): each button is a
   `UIButtonConfiguration plainButtonConfiguration` with the image on top
   (`imagePlacement` = top (2), `imagePadding` 4), the image at 19 pt regular, the title
   in SF Pro 11 medium, and both the image and title in ink:
   - **Copy** (`doc.on.doc`): copies (see §3.3.6), clears the selection, gives haptic
     success, and shows a 1.2 s toast "Copied" (a small capsule label centered above the
     tray position: SF Pro 14 semibold on `ink` at 90% with `bg` text, fading in and
     out).
   - **Share** (`square.and.arrow.up`): opens a `UIActivityViewController` with the same
     string as Copy. On iPad-style popover presentation, set the sourceView to the
     button. Clear the selection after presenting.
   - **Bookmark** (`bookmark` / `bookmark.fill`, title "Bookmark" / "Bookmarked"):
     toggles a bookmark on the **first selected verse**, clears the selection, and gives
     a medium haptic.
   - **Note** (`square.and.pencil`, or `note.text` with the title "Edit Note" if a note
     exists): opens the Note editor for the selection's range (the note is anchored to
     the first verse and stores the range). Clear the selection when the editor opens.

#### 3.3.4 Marks in the text
- **Highlight**: a background wash over the verse range (the same range as selection),
  without the underline. Adjacent highlighted verses of the same color form one
  continuous wash, including the space between them.
- **Bookmark**: verse numbers of bookmarked verses are in accent, and an `NSTextAttachment`
  with the `bookmark.fill` symbol image (accent, 0.55 em tall, baseline-aligned like the
  verse number) is placed immediately before the number, with a hair space. For verse 1
  (no number), the attachment sits at the paragraph start.
- **Note**: an `NSTextAttachment` with `note.text` (accent, 0.62 em) at the **end** of the
  verse's text, preceded by a thin space. Tapping it opens the note (§3.1.3).
- Attachments shift UTF-16 offsets, so build the attributed string and the verse→range
  table together, accounting for them (§4.1).

#### 3.3.5 System edit menu (long-press text selection)
Native text selection stays available: long-press or double-tap selects words with the
system handles and loupe. Extend its menu without blocks:
- **iOS 16+:** implement the `UITextViewDelegate` method
  `textView:editMenuForTextInRange:suggestedActions:`. The arguments are self, _cmd, tv,
  range.location, range.length and suggestedActions: exactly 6 integer registers. Return
  `[UIMenu menuWithChildren:]` built from an array containing these, in order, followed by
  the `suggestedActions` elements:
  - `[UICommand commandWithTitle:@"Highlight" image:nil action:@selector(bibleHighlight:) propertyList:nil]`
  - `Note` → `bibleNote:`
  - `Copy with Reference` → `bibleCopyRef:` (**removed in review 1**: the menu is Highlight and
    Note, then the system's actions)
  - `Share` → `bibleShare:`

  Use `menuWithTitle:@"" children:` if `menuWithChildren:` is unavailable.
  `UICommand` dispatches through the responder chain from the text view, so implement those
  four selectors on the app delegate object (the chain ends there) and on the reader VC.
  Remember the text view and range from the delegate call in globals.
- Each action maps the character range to the verses it touches, then behaves exactly like
  the tray action with those verses selected:
  - Highlight applies **Yellow**, or the last-used color (stored in defaults under
    `lastHighlight`).
  - Note opens the editor.
  - Copy with Reference copies.
  - Share shares.
  - Afterwards, collapse the text selection (`setSelectedRange:{loc,0}`), and resign first
    responder.
- If the iOS 16 delegate approach fails at run time, fall back to
  `UIMenuController.sharedMenuController.menuItems = @[UIMenuItem…]` with the same
  selectors (deprecated but working).

#### 3.3.6 Copy and share format
A single verse:
```
“For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.”
John 3:16 BSB
```
Multiple verses: the verse texts joined by a space in reading order. In verse-per-line
mode, verse numbers are kept as superscript-free plain numbers ("16 For God… 17 For God
did not…"), wrapped in curly quotes, followed by a newline and "John 3:16–17 BSB".
Footnote marks, attachments and narrow no-break spaces are stripped. LORD is written as
"LORD". Poetry lines are joined with a space.

### 3.4 Note editor (sheet)
This is a UINavigationController (page sheet; detents medium and large, starting at
**large**; grabber visible) with a run-time UIViewController subclass.
- Title: the reference ("John 3:5"), inline (no large title).
- Left: Cancel (system) appears only when the note is new and empty. Right: Done (system,
  bold). Existing notes save automatically on Done or when the sheet is swiped down
  (`presentationControllerDidDismiss:` on the sheet's delegate).
- Content (background `bg` for the theme):
  1. A quote block at the top, inset 20 pt: the verse text in the body font at 0.85 em,
     faint, italic off, line height 1.25, at most 4 lines with a tail ellipsis, and a 3
     pt accent bar on the leading side (a plain UIView, 3 pt wide, corner radius 1.5).
  2. Then a 1 pt `rule` hairline at 16 pt below it.
  3. Then an editable UITextView filling the rest: the body font at 1.0 em, ink, with insets 20/20. A placeholder label "Write a note…" in faint shows
     while it's empty. The keyboard shows on appear (`becomeFirstResponder` in
     `viewDidAppear:`).
- Deleting: when the note exists, put a `trash` bar button item (tinted `systemRed`) on the
  left instead of Cancel. Tapping it deletes the note immediately and dismisses the sheet. No
  confirmation, since UIAlertController actions need blocks.
- Saving an empty note deletes it.

### 3.5 Library (sheet)
This is a UINavigationController (page sheet; detents medium and large, starting at large;
grabber). Its root is a run-time UITableViewController subclass, using the insetGrouped
style.
- (Amended 2026-10-19, §2.9: the segments are on their own row at the top of the list, the
  bar's title "Library".) `navigationItem.titleView` = a `UISegmentedControl` ["Highlights", "Notes", "Bookmarks"],
  width 300, wired with target-action on `UIControlEventValueChanged` (4096). The
  selected segment is remembered in defaults. Done is on the right.
- The table sections are **books in canonical order**, with the header showing the book
  name in the system header style. Rows within a book are in verse order. A "Recent"
  sort is not in Round 1.
- **Highlight row** (subtitle-like custom cell built from a UIListContentConfiguration):
  - Image: a 12 pt circle in the swatch color (`circle.fill` tinted with the swatch
    color).
  - Text: the reference "John 3:16–17" in SF Pro 15 semibold, ink.
  - Secondary text: the verse text in the body font at 15 pt, faint→ink at 80%, at most
    3 lines.
  - Accessory: none.
- **Note row**:
  - Image: `note.text`, accent.
  - Text: the reference.
  - Secondary text: the note text (SF Pro 15, ink, 3 lines).
  - A third line is not needed.
  - Tapping opens the Note editor (over the library: present from the library nav).
- **Bookmark row**:
  - Image: `bookmark.fill`, accent.
  - Text: the reference.
  - Secondary text: the verse's text (2 lines).
  - Tapping goes to the verse.
- Tapping a highlight or bookmark dismisses the library, jumps, flashes the verse, and shows
  the back capsule.
- Swipe to delete: implement `tableView:commitEditingStyle:forRowAtIndexPath:` (this gives
  the standard red Delete swipe without blocks). Delete the record, save, and remove the
  row with `deleteRowsAtIndexPaths:withRowAnimation:` (automatic). If the reader shows
  that chapter, update its marks.
- Empty states (`contentUnavailableConfiguration` on iOS 17+; on iOS 16, a
  `backgroundView` label):
  - Highlights: `highlighter`, "No Highlights", "Tap a verse while reading and choose a
    color."
  - Notes: `note.text`, "No Notes", "Tap a verse and choose Note to write one."
  - Bookmarks: `bookmark`, "No Bookmarks", "Tap a verse and choose Bookmark."

### 3.6 Search (sheet)
This is a UINavigationController (page sheet, large detent, grabber). Its root is a
run-time UITableViewController subclass (plain style, with `bg` as the background, and
`separatorInset` left matching the cell text).
- Title "Search", inline. Done is on the right.
- `navigationItem.searchController` with no results controller, never hidden, and
  placeholder "Search the Bible". It's activated on appear: set `active = YES` and make
  the search bar first responder in `viewDidAppear:`.
- **Scope bar** (`searchBar.scopeButtonTitles`): "All", "OT", "NT" (amended in review 1;
  the accessibility labels give the full names),
  and the current book's name (e.g. "John"). `showsScopeBar = YES`. The scope change
  delegate is `searchBar:selectedScopeButtonIndexDidChange:`.
- Queries:
  - Whole-word matching for each word, case-insensitive. Apostrophes ’ and ' are
    equivalent. Diacritics are folded for ASCII input.
  - A verse matches if it contains **all** words (AND). Words may be a prefix only
    if the query word ends with `*`.
  - A quoted query ("born again") requires the phrase.
  - The search runs over T (verse words) lines only, not headings or notes.
  - Debounce at 0.2 s after typing (NSTimer). Run it on the main thread. The scan is
    linear over 4.5 MB, so measure it; if it takes over 50 ms, use `dispatch_async_f` to
    a global queue and deliver the results with `dispatch_async_f` to the main queue.
  - Cap the results at 1000, and say "1000+".
- **If the query parses as a reference**, the first section is one "Go to John 3:16" row
  (as in the picker).
- **Results**:
  - One section with the header "348 verses" (a system plain header in SF Pro 13
    semibold, faint, uppercase off).
  - Each row is a custom cell. In the cell, the reference ("John 3:3") comes first, in SF
    Pro 13 semibold, accent.
  - Below the reference, 3 pt of space, then the verse text in the body font at 16 pt
    (fixed, not em, but scaled by UIFontMetrics) with a line height of 1.25, in ink at
    80%. **Matched words are in ink at full strength, semibold** (bold body font), and
    have a subtle `selection` background.
  - Long verses: show the whole verse up to 4 lines with a tail ellipsis. If the first
    match falls after line 4, start the text with "… " and the 8 words before the match.
  - Insets: 20 pt horizontal, 12 pt vertical.
- Tapping a result dismisses the sheet, jumps to the verse, flashes it, and shows the back
  capsule. The search text is kept in a global, so reopening search shows the last query
  and its results, scrolled to the top.
- **Empty query**: a "Recent Searches" section (up to 8, stored in defaults) with
  `clock.arrow.circlepath` rows, and a "Clear" button in the section header (a UIButton
  in a custom header view, `plainButtonConfiguration`, accent). If there's no history,
  show `contentUnavailableConfiguration` with `magnifyingglass`, "Search the Bible", and
  "Find words and phrases across all 66 books."
- **No results**: `magnifyingglass`, "No Results for “xyz”", "Check the spelling or try
  fewer words."

### 3.7 Reading settings (sheet)
This is a UINavigationController (page sheet, **medium detent** with the content
scrolling: a custom detent would need `customDetentWithIdentifier:resolver:`, which takes
a block; grabber visible;
`prefersScrollingExpandsWhenScrolledToEdge = NO`;
`largestUndimmedDetentIdentifier = medium` **so the page stays undimmed and changes are
seen live behind the sheet**). The root is a run-time UITableViewController
(insetGrouped). The title "Reading" is inline, with Done on the right. Every change
applies immediately to the reader and is saved to defaults.

Sections and rows:
1. **(no header)** Text size row: a custom cell with a horizontal stack:
   - On the left, a `textformat.size.smaller` button.
   - In the middle, a `UISlider` with 8 discrete steps (snap to an integer on
     `UIControlEventValueChanged`, and apply on change).
   - On the right, a `textformat.size.larger` button.
   - The steps multiply em by `0.82, 0.9, 1.0, 1.1, 1.2, 1.32, 1.46, 1.62` (default index
     2 = 1.0). This sits **on top of** Dynamic Type.
   - Below it, inside the same cell, a caption in SF Pro 12 faint: "Also follows the
     iPhone text size."
2. **Theme**: one custom cell holding six circular swatches of 44 pt, equally spaced, each
   with a caption below in SF Pro 11 (faint, or ink when selected): Auto, Paper, White,
   Sepia, Night, Black.
   - Each swatch is filled with its theme's `bg` color, with a 1 pt `rule` border, and
     shows "Aa" in its theme's ink in the body font at 15 pt.
   - Auto is split diagonally, Paper on one half and Night on the other: two layers, or a
     CAGradientLayer with hard stops at 0.5, start (0,0) and end (1,1).
   - The selected swatch has a 2.5 pt accent ring offset 3 pt outside it, drawn with a
     border on a larger transparent circle.
3. **Font**: five checkmark rows (`UITableViewCellAccessoryCheckmark` on the selected
   one). Each row's title is set **in its own font** at 17 pt: New York, Iowan, Charter,
   Georgia, San Francisco.
4. **Layout**:
   - "Line Spacing": `UISegmentedControl` [Compact, Normal, Relaxed] as the row's
     accessory view (width 220).
   - "Margins": a segmented control [Narrow, Normal, Wide].
5. **Show**: switch rows (`UISwitch` as the accessory view, target-action ValueChanged,
   `onTintColor` accent):
   - "Verse Numbers" (on)
   - "Section Headings" (on). Off hides S, s, R and D and the major sections M and m.
   - "Footnote Marks" (on)
   - "One Verse per Line" (off)
6. Footer text in the last section's footer, SF Pro 12 faint: "Berean Standard Bible ·
   Public Domain".

Rendering the swatches and controls in the sheet requires the sheet to follow the theme's
light or dark appearance (handled by `overrideUserInterfaceStyle`). For Paper and Sepia,
set the table background to `sheetBg` and the cell background to `cellBg`.

---

## 4. Data and logic the builder must add

### 4.1 `text.l8` additions (portable, tested in `test_text.l8`)
- **Verse table for the laid-out chapter**: `verse_count`, `verse_num[i]`,
  `verse_begin[i]` and `verse_end[i]` as byte offsets into `out`. Begin is the start of
  the verse number run (or the first word for verse 1, or for a hidden number). End is
  the end of the verse's last T/F run, excluding the following separator space and
  newline. ios.l8 converts these to UTF-16 (`utf16_count` exists) and accounts for any
  attachments it inserts.
- **Footnote → verse**: STYLE_NOTE runs already carry `p`, so add a function
  `verse_at(p)` that gives the verse number for any record offset in a chapter.
- **Verse plain text**: `verse_text(c, v)` writes the verse's words (T lines joined,
  without notes) into a buffer. It's used for copy, share, the library, recent items and
  search snippets.
- **Layout options**: `lay_verse_numbers`, `lay_headings`, `lay_notes` and
  `lay_verse_lines` (bools read by `layout_chapter`). In verse-per-line mode, each V
  starts a new paragraph line; mark that with a new paragraph kind `PARA_VERSE` (and its
  gap variant). The para table is `STYLES * 2 * KINDS`, so resize it to fit.
- **Chapter divider**: `layout_chapter` emits a STYLE_RULE paragraph at the start of every
  chapter except Genesis 1 (an object replacement character U+FFFC that ios.l8 turns into
  the hairline attachment). Remove the old chapter-1-only book layout, and implement
  §3.1.2 with the new styles STYLE_RULE and STYLE_BOOKLABEL (the chapter label). The
  STYLE_NUMERAL size depends on whether it's chapter 1, so give it its own style:
  STYLE_NUMERAL1.
- **Reference parser** (§4.2): `parse_ref(s) → book, chapter, verse, verse_end`, with
  -1 meaning absent.
- **Search**: `search(query, scope_from_book, scope_to_book)` fills the arrays
  `hit_chapter[]`, `hit_verse[]`, `hit_count` and `hit_more`, plus a function
  `match_ranges(c, v)` that marks the matched byte ranges in the verse text for
  emphasis.
- Tests: parser cases (the list below), verse table offsets for Genesis 1, Psalm 23 and
  John 3, a search count for "born again" (with and without quotes), verse_text for John
  3:16, and verse-per-line layout for Psalm 23.

### 4.2 Reference parsing
- Input: free text, trimmed and case-insensitive. Periods and extra spaces are ignored,
  and "first", "second" and "third" or "i", "ii" and "iii" are accepted before the
  book name.
- Book matching:
  1. An exact alias match.
  2. Otherwise, a unique prefix of a full name with spaces removed ("phil" is ambiguous
     between Philippians and Philemon, so it resolves to **Philippians**; "jud" resolves
     to Judges; "jude" is Jude).
- The alias table (add it to `text.l8` as one string) has these columns: USFM code, full
  name, and common short forms. Examples, which must work:

| Input | Result |
|---|---|
| `jn 3:16` / `jhn 3 16` / `john 3.16` | John 3:16 |
| `ps 23` / `psalm 23` / `psa23` | Psalm 23 |
| `1 cor 13` / `1co 13` / `i corinthians 13` / `first corinthians 13` | 1 Corinthians 13 |
| `gen 1:1-3` / `gn 1:1–3` | Genesis 1:1–3 |
| `rev` | Revelation (book) |
| `song 2` / `sos 2` / `song of songs 2` | Song of Songs 2 |
| `phm` / `philemon 1:4` | Philemon / Philemon 1:4 |
| `jude 3` | Jude 1:3 (single-chapter book: a lone number is a verse) |
| `mt5`, `mk 4`, `lk 2`, `ac 2`, `ro 8`, `heb 11`, `jas 1`, `1jn 4` | as expected |
| `john 30` | John 21 (clamp the chapter), and the verse clamps to the chapter's last verse |

### 4.3 Persistence (Application Support/SmoothBible/, created on first launch)
All files are UTF-8, one record per line, tab-separated. Each file is rewritten whole after
every change (write to `name.tmp`, then `rename`). The files are small enough.
- `highlights.tsv`: `BOOK\tCHAPTER\tVERSE\tCOLOR\tUNIXTIME`, e.g. `JHN\t3\t16\tyellow\t1792252800`.
  There's one line per verse, and ranges are expanded.
- `bookmarks.tsv`: `BOOK\tCHAPTER\tVERSE\tUNIXTIME`
- `notes.tsv`: `BOOK\tCHAPTER\tVERSE\tVERSE_END\tUNIXTIME\tTEXT`, where TEXT escapes `\` as
  `\\`, newline as `\n` and tab as `\t`.
- `history.tsv`: `BOOK\tCHAPTER\tVERSE\tUNIXTIME`, newest last, keeping the last 50.
- NSUserDefaults keys: `theme` (0–5), `font` (0–4), `sizeStep` (0–7), `spacing` (0–2),
  `margins` (0–2), `showVerseNumbers`, `showHeadings`, `showNotes`, `verseLines`
  (bools), `lastHighlight` (string), `librarySegment`, `recentSearches` (array of
  strings), and the existing place keys.
- In memory, keep per-chapter lookups (an array indexed by chapter of
  highlight/bookmark/note lists) so that rendering a row is O(marks in that chapter).

### 4.4 Jump-to-verse
`go_verse(c, v)` scrolls so that the verse's first line sits **one third of the way down
the visible area**, not flush under the bar. It uses the verse's rect via
`firstRectForRange:` on the row's text view after `layoutIfNeeded`. It's followed by the
flash (§2.7).

---

## 5. CI demo (simulate.sh steps and expected screenshots)

General:
- **Parse multi-digit step numbers** (`demoN` with N up to 99).
- Each step must be deterministic from a fresh install.
- Steps that need state set it up themselves through the same functions the UI calls (for
  example, `apply_highlight`), so that the screenshots show real rendering.
- Wait 2 s after each step (3 s after theme or size changes).
- Remove the `simctl openurl` step. Step 30 opens the link through `open_link` directly.
- File names are `NN-name.png`.

| Step | Action in `demo_do` | Screenshot shows |
|---|---|---|
| 1 | (launch) | `01-genesis-1`: Paper theme. Nav bar with Search, the faded-out title, Library and Aa. Opener "Genesis" (2.0 em), accent numeral "1", the heading "The Creation", the italic range, and body text with the new spacing and margins |
| 2 | Scroll Genesis 1 so that the end of Genesis 1 and the start of Genesis 2 are mid-screen | `02-chapter-divider`: the hairline divider, the "GENESIS" label, numeral 2, and the title "Genesis 1" or "2" visible in the bar |
| 3 | Open the passage picker | `03-picker`: the "Go To" sheet, search field with placeholder, Old Testament list with Genesis in accent |
| 4 | Type `jn 3:16` into the picker search (set the search bar text and call the updater) | `04-picker-query`: a "Go to John 3:16" row with the opening words, and a Books section with John |
| 5 | Clear the query and push the Psalms chapter grid | `05-chapters`: the Psalms grid, 5 columns, current chapter none in accent (not reading Psalms) |
| 6 | Go to Psalm 23 | `06-psalm-23`: "PSALM" label, numeral 23, heading, range, italic title, poetry with q1 flush and q2 indented; back capsule "‹ Genesis 2" (or wherever) at the bottom-left |
| 7 | Show the footnote on 23:1 | `07-footnote`: a themed popover with the header "Footnote · Psalm 23:1" and the note text |
| 8 | Dismiss, then go to John 3:16 via the parser | `08-john-3-16`: verse 16 about a third of the way down, flashed (wash visible); back capsule "‹ Psalm 23" |
| 9 | Select verse 16 (call the same toggle as a tap) | `09-selected`: verse 16 washed and dotted-underlined; tray with "John 3:16", 5 swatches and Copy/Share/Bookmark/Note |
| 10 | Also select verse 17 | `10-selected-two`: the tray reads "John 3:16–17" |
| 11 | Apply Yellow to 16–17. Then programmatically: Green on 3:3, a bookmark on 3:1, and a note on 3:5 ("Water and Spirit: compare Ezekiel 36:25–27.") Scroll to show 3:1–3:8 | `11-marks`: green wash on verse 3, accent verse number and bookmark glyph at the start of verse 1 (verse 1 has no number, so the glyph is at the paragraph start), and a note glyph after verse 5 |
| 12 | Scroll to show 3:14–18 | `12-highlight`: the yellow continuous wash over 16–17 |
| 13 | Natively select the words "born again" in 3:3 (set `selectedRange` and become first responder), then present the edit menu (`UIEditMenuInteraction` on iOS 16+, or the delegate path, via `presentEditMenuWithConfiguration:` at the selection rect) | `13-edit-menu`: the system menu with Highlight, Note, Copy with Reference, Share, then Copy, Look Up, … |
| 14 | Dismiss the menu, then open the note editor for 3:5 | `14-note-editor`: the "John 3:5" title, quote block with the accent bar, the note text, the keyboard |
| 15 | Dismiss, then scroll down about 1.5 screens with a simulated drag (`setContentOffset`), then hide the bars | `15-reading-on`: no bars, no status bar, only text |
| 16 | Scroll up 60 pt (the bars return via the scroll-up rule; the demo may call `show_bars(false)` if a drag can't be simulated) | `16-bars-back`: bars visible, with the blurred bar over the text |
| 17 | Open search, type `born again`, and wait for the results | `17-search`: the scope bar, "N verses" header, and results with the bold matches, John 3:3 and 3:7 among the first |
| 18 | Set the search scope to "Old Testament" | `18-search-scope`: fewer or no results; if there are none, the No Results state |
| 19 | Clear the query | `19-search-recent`: "Recent Searches" with "born again" |
| 20 | Dismiss, then open Library (Highlights) | `20-library-highlights`: a JOHN section with 3:3 (green dot) and 3:16–17 (yellow dot) and the verse text |
| 21 | Notes segment | `21-library-notes`: John 3:5 with the note |
| 22 | Bookmarks segment | `22-library-bookmarks`: John 3:1 |
| 23 | Dismiss, then open Reading settings | `23-settings`: the size slider, six theme swatches with Auto selected, the font list with New York checked, and segmented controls; the reader is visible and undimmed behind it (medium detent) |
| 24 | Set Sepia and the Iowan font while the sheet is open | `24-settings-sepia`: the sheet and the page behind it in sepia, with Iowan type in the visible text |
| 25 | Dismiss | `25-sepia-reading`: John 3 in sepia and Iowan, with the highlights visible in light-theme colors |
| 26 | Set Black, New York, Relaxed spacing, and size step 4 | `26-black-large`: black page, larger relaxed text, dark-theme highlight washes |
| 27 | Set One Verse per Line on and Headings off (still Black) | `27-verse-lines`: each verse on its own line with a hanging number |
| 28 | Reset to the defaults (Auto, New York, Normal, step 2, all shows on, verse lines off). The script switches the simulator to **dark** | `28-night`: the Auto→Night theme, John 3 with the dark highlight washes, the accent `#DC8873` |
| 29 | The script sets content size XXL | `29-larger-text`: larger text, place kept |
| 30 | The script terminates and relaunches the app, then sends step 30, which calls `open_link("bsb://ROM/8")` directly | `30-opened-again` (before the step: same place as 29); `31-link-romans-8` (after the step): Romans 8 opener with the back capsule |

Before the relaunch (between 29 and 30), take `30-opened-again`. After step 30, take
`31-link-romans-8`. The script then switches back to light mode and the Large text size for
hygiene.

---

### Collapsing-bar evidence (R2-17)
These replace shots 15 and 15b, and add a few more. The demo drives scrolling with the same
handlers as a real drag: a demo flag makes the handlers treat programmatic
`setContentOffset` steps as tracking.

| Shot | Demo action | Expected |
|---|---|---|
| `15a-before-collapse` | John 3 scrolled so 3:14 is near the top, p = 0, content still | Expanded bar; the text positions are the reference |
| `15-collapsed` | Same offset, then set p = 1 with no scroll (the demo hook) | Compact "John 3" under the status bar; the buttons are gone; the status bar is visible; **every text pixel below S + E is identical to 15a** (the CI script computes the pixel difference of that region and prints it to `log.txt`; it must be 0) |
| `15b-half` | Freeze p = 0.5 | Bar halfway: no button or title visible (both alphas 0), and the backdrop is at the intermediate height |
| `15c-collapsed-opener` | Collapsed, then scroll so that the John 4 opener is visible mid-screen, its row's top 10 pt under the band | The compact band says "John 3" (amended 2026-10-19: the name changes once the row's top reaches the band) |
| `15d-title-before`, `15e-title-after` | Expanded; John 4's row walked up a point at a time until its top is 8 pt below the bar's bottom, then 8 pt past it (owner amendment 2026-10-19) | "John 3", then "John 4", each alone and in the same place. `read-console.txt` has one `bible: title John 4 (was John 3), its row's top past the bar by …, faded` line where it changed, and a `bible: title shows` line at each frame |
| `15f-title-compact-before`, `15g-title-compact-after` | The same at p = 1 | The same, in the compact band, nothing over the status bar |
| `15j-genesis-1-title` | Genesis 1's top, expanded | "Genesis 1" in the bar; the log says it is shown and takes taps |
| `15k-status-bar-chapter-top` | From John 3:14, collapsed, the status bar's tap (the same path, `status_top`) | Expanded, John 3's opener under the bar; the log's `bible: status bar landed at` names John 3, off its top by under 1 pt |
| `15l-status-bar-previous-chapter` | The status bar's tap again | John 2's top, landed exactly |
| `16-bars-back` | From collapsed, simulated upward drag of 8 pt, then a further 60 pt | After 8 pt it's still collapsed (log p); after 68 pt it's expanded |
| `16b-compact-tap` | From collapsed, tap the compact title | Expanded |
| `16c-sheet-from-collapsed` | From collapsed, open search | The sheet is presented and the reader's bar behind it is expanded |

Add a recording sequence 6 to Transitions: from expanded, step the offset down 4 pt per
frame for 30 frames (120 pt), lift (settle), step up 2 pt per frame for 6 frames (12 pt,
no reveal), then 4 pt per frame for 15 frames (reveal), then tap the compact title from a
collapsed state.

The reviewer checks that:
- Over sequence 6, p changes by at most 4/48 per frame while tracking.
- A fixed text line moves by exactly the scroll step every frame (no extra jump).
- No element appears or disappears between two frames, except by the alpha ramps
  above.

### Transitions (screen recording, added in review r2-1)
`simulate.sh` also records the screen (`xcrun simctl io booted recordVideo --codec h264
transitions.mp4`) through these sequences, which run in demo mode and are triggered by
additional notifications:
1. Scroll the reader from the top of John 3 down 600 pt over 1 s, then back up.
2. Hide and show the bars.
3. Open search (with a previous query present) and dismiss it.
4. Open the passage picker and dismiss it.
5. Open the verse panel, and close it.

It then extracts frames at 30 fps with ffmpeg into `transitions/` and a contact sheet,
`transitions-sheet.png` (one row per sequence, every 3rd frame, at 25% scale), and pushes
both with the screenshots. The designer reviews these for abrupt changes (principle 6).

## 6. Acceptance criteria (what the designer checks in review)

### Typography and page
1. Body text fills the measure with 28 pt margins at the default, has comfortable leading
   (about 1.32), and has no widows of single hyphenated fragments that look broken. Poetry
   q1 is flush, q2 is indented, and wrapped poetry lines hang deeper than q2.
2. Verse numbers are small, semibold, faint, raised, and never collide with the preceding
   word. There's a visible space before them and a narrow no-break space after.
3. The chapter opener is centered and balanced: label and numeral (or book title and
   numeral), with clear air above and below. The numeral is accent and light-weight.
   Nothing about the chapter's name appears in both the bar and the visible opener at
   the same time.
4. Chapter dividers are visible but whisper-quiet. Headings are clearly a different voice
   (SF semibold) from the scripture (serif).
5. LORD/GOD appear in small caps in every font.
6. No text is clipped and no row has the wrong height after selection, highlighting,
   theme changes or size changes.

### Chrome and behavior
7. The bar has exactly Search · Title · Library · Aa. The icons are ink-tinted, not red.
   The bar background is translucent over text and invisible at the top.
8. The bar collapses and expands in proportion to the scroll, as specified in §3.1.4 (R2-17). The text never moves because of it. The status bar always stays.
9. The back capsule appears after every jump, reads the origin, and doesn't cover text that
   can't be scrolled out from under it (the last chapter has enough bottom inset).
10. A jump to a verse lands it about a third of the way down, with a visible but brief
    flash.

### Selection and marks
11. A tap selects exactly the tapped verse (from its number to its end). A second tap
    deselects it. The wash and dotted underline are clear in all themes.
12. The tray is a floating, rounded, blurred panel with correct spacing (14 pt inset, 12 pt
    rows), a correct reference string (ranges with en dashes), and no layout overflow at
    XXL text size (the tray uses fixed SF sizes, so it shouldn't grow).
13. Highlights read as soft washes, not saturated blocks. The ink stays legible on every
    color in every theme (the designer checks the dark washes especially). Adjacent
    verses join seamlessly.
14. The bookmark and note glyphs are small, accent-colored, baseline-aligned, and tappable.
15. The extended edit menu shows the app's four commands first, then the system ones.

### Sheets
16. All sheets use system grouped styling, follow the theme (light or dark, with paper and
    sepia tints where specified), have grabbers, and have Done placed consistently on the
    right.
17. Picker: Recent and Books sections. Typing a reference yields a correct "Go to" row.
    The chapter grid is evenly spaced, with the current chapter filled accent.
18. Search: scope bar visible, match emphasis clear, counts correct, and well-designed
    empty and no-results states.
19. Library: segmented control in the title, sections by book, color dots, swipe to
    delete works, and empty states are present.
20. Settings: changes apply live behind an undimmed medium sheet. The swatches are crisp
    circles with an obvious selected ring. Font names are rendered in their own fonts.

### Themes
21. All five themes plus Auto match the hex table. The system UI (keyboard, sheets, menus)
    matches light or dark accordingly. Switching cross-fades without flashing white.
22. Night and Black accent colors are the softened terracottas, not the light-mode red.

### Robustness
23. Place, marks, notes and settings survive a relaunch.
24. No crash reports in CI. `console.txt` has no Objective-C exceptions.
25. VoiceOver labels exist for every icon button and swatch (checked in code review).

### Defects from the 019e3ae1 run
26. (Amended 2026-10-18.) In `01-genesis-1` the bar says "Genesis 1"; in `06-psalm-23`,
    `08-john-3-16` and `31-link-romans-8` it names the chapter jumped to ("Psalm 23").
    In `02-chapter-divider` and `15`/`16`, the title is visible and names the chapter
    read; `15d`–`15g` show the title changed in place (amended 2026-10-19).
27. Every chapter ≥ 2 shows its book label above the numeral.
28. `29-larger-text` shows the same verses at the top as `28-night`.
29. `30-opened-again` shows the same place as `29-larger-text`.
30. No system "Open in…" prompt appears in any screenshot.

---

## 7. Round 2 specification: language tools, and notes made complete

Round 2 starts after Round 1 passes review. It keeps every Round 1 look and behavior,
except where this section explicitly replaces one (the edit menu order in §7.2, and the
note sheet's read mode in §7.9).

### 7.1 Data pipeline (builder)
The sources are the researcher's downloads and prototypes in `/tmp/bsb/lang/` (see its
`REPORT.md`): `berean/bsb_tables.tsv`, `berean/bsb_usfm.zip`, `step/TBESH.txt` and
`step/TBESG.txt`, plus `scripts/proto.py` and `scripts/tight.py` as the starting point.
The downloads aren't committed. The tools record their URLs, and they must send a browser
User-Agent because bereanbible.com blocks curl's.

**1. Switch the text** (`tools/bsb.py`) to the publisher's current USFM,
`https://bereanbible.com/bsb_usfm.zip` (the same revision as the tables). Handle:
- `\d \v 1` inside psalm titles: the title stays a D record, and verse 1 starts after it.
- Spaced em dashes: join them unspaced, as the BSB prints.
- `\ref …\ref*`: keep the visible text only.
- `\wj …\wj*`: emit the words as `W` records instead of `T`. `text.l8` lays out W exactly
  like T in Round 2 (R3.7 colors them later).
- After the switch, Round 1's tests must still pass. Update their expected counts and
  offsets where the new text legitimately differs, and say so in the commit.

**2. Make the word data** with a new tool, `tools/bsb_lang.py` (`python3 -I`, standard
library only). It writes to `programs/bible/data/lang/`:

| File | Format |
|---|---|
| `words.bin` | Little-endian, **12 bytes per original-language word, in BSB English order** (the tables' row order), for every row that has an original word: `u16 strongs` (number; bit 15 set = Greek), `u16 morph` (line in `morph.txt`), `u8 ntok` (the number of English tokens this word's chunk covers in the verse text; 0 for `-`, `vvv`, empty or `. . .`), `u8 order` (position of this word in **original** order within the verse, 0-based, from the Heb/Greek sort column), `u8 flags` (1 = untranslated `-`, 2 = rendered with a neighbour `vvv`, 4 = no English), `u8 0`, `u32 form` (line in `forms.txt`) |
| `verses.bin` | 8 bytes per verse, in canonical order: `u32 first word index`, `u16 chapter index` (as `text.l8` counts, 0 = Genesis 1), `u16 verse`. A final sentinel record holds the word count. Verses with no words (none expected) still get a record |
| `supplied.bin` | 8 bytes per translator-supplied English chunk (`[x]` in the tables): `u32 verse index`, `u8 token start`, `u8 token count`, `u16 0`. These tokens are shown italic in the interlinear and have no original word |
| `forms.txt` | One line per distinct `original \t transliteration`. **Hebrew display cleanup** is done here: strip cantillation (U+0591–U+05AF), paseq U+05C0, sof pasuq U+05C3, and a trailing פ or ס paragraph mark after sof pasuq. Keep vowel points, dagesh, shin/sin dots and maqaf |
| `morph.txt` | One line per parsing: `code \t description` (the prototype's format, e.g. `V-AIA-3S \t Verb - Aorist Indicative Active - 3rd Person Singular`) |
| `conc.bin` | Per Strong's key, in ascending key order: `key` (ASCII, e.g. `G25`), `\0`, LEB128 `occurrences` (word count), then LEB128 deltas of **verse index + 1** (the prototype's first delta can be 0 for Genesis 1:1, which collides with the terminator), then a `\0` terminator |
| `lexicon.txt` | Per base Strong's key: a line `@G25`, then one line per STEP sub-entry: `lemma \t lemma translit \t part of speech code \t gloss \t definition`. The definition is converted from STEP's HTML to a tiny markup: `**bold**`, `_italic_`, `[[MAT.5.43\|Mat 5:43]]` for references (book code as in `bsb.txt`, chapter, verse), and `\n` as a paragraph break. All other tags are dropped and entities decoded. The main entry (an unsuffixed or lowest-letter extended number) comes first |
| `grammar.txt` | `term \t plain explanation` (§7.5.3) |

Alignment rule: tokenize the verse's words (T and W records joined, without notes) with
the regex `[A-Za-z0-9]+(?:[’'][A-Za-z]+)*`. A verse is **aligned** if the sum of `ntok`
plus supplied tokens equals its token count. **A psalm's title (the D record) counts as the
start of verse 1**, because the tables put "A Psalm of David" in Psalm 23:1. Its title
tokens come first in that verse's token sequence, so the title words are studyable too.
Chunks can span several English words ("is my shepherd" is one Hebrew word): selecting any
of those words studies that one word. The researcher expects 31,094 of 31,102.
Fix the 3 `vvv` artifacts and 3 HTML leaks in the tool. The 2 short omissions stay
unaligned. **Study is unavailable in unaligned verses**: the Study action and menu command
are disabled there. The tool prints its counts and the list of unaligned verses, and
the commit message includes them.

Size: about 17 MB raw. Ship it raw in the bundle (the IPA compresses it to about 6 MB),
and `mmap` it at first use, not at launch. Launch time must not change.

**3. Portable logic** goes in a new `programs/bible/lang.l8`, tested by
`test_lang.l8`. It provides:
- Verse lookup.
- The token→word mapping for a verse.
- English-order and original-order sequences.
- Concordance decoding.
- Lexicon lookup.
- A parser for the lexicon markup into styled runs, like `layout_chapter`.
- Parsing → plain English.
- Counting renderings.

Tests:
- Alignment ≥ 31,094.
- John 3:16 "loved" → G25 `V-AIA-3S`.
- Genesis 1:1 "created" → H1254, and its fourth original word in original order is אֵת
  (untranslated).
- The occurrence count of G26 matches what the tool prints.
- Lexicon markup for G25 yields a bold run and a reference run to MAT 5:43.

### 7.2 Gesture model (decided)
The rule is **one gesture, one meaning.** Nothing in Round 1 changes meaning. Study is
reached through the two places where people already look for actions.

| Gesture in the reader | Result |
|---|---|
| Tap a verse | Selects it (Round 1). The panel's fifth action, **Study** (`character.book.closed`), opens the **interlinear** for the first selected verse |
| Long-press or double-tap a word | System text selection (Round 1). The edit menu now reads **Study, Highlight, Note**, then the system's own suggested actions (Copy, Look Up, Translate, Share…). **Study** opens the **word study** of the first selected English token's original word |
| Tap a word in the interlinear | Pushes its word study (in the same sheet) |
| Tap a verse in the concordance, or a reference in a definition | Dismisses the whole sheet stack and jumps there (Round 1 jump: one third down, flash, back capsule) |

- Round 2 removes "Copy with Reference" and the app's own "Share" from the edit menu,
  because the system menu already has Copy and Share and the verse panel has the
  reference-aware ones. This keeps the menu to one page, as the HIG asks.
- Study is disabled (the panel button greyed via `enabled = NO`, and the menu command
  omitted) when the verse is unaligned, or when the selected text contains only
  untranslated or supplied tokens.
- There's no study mode, no new gesture, and no inline interlinear in the reader. The
  reading page stays as it is.

The panel's action row becomes Copy · Share · Bookmark · Note · Study, five equal columns
with the same button style as Round 1.

### 7.3 Original-language typography
| Use | Greek | Hebrew |
|---|---|---|
| Font | New York (the system serif) | System font (SF Hebrew via the system cascade). If the CI screenshot shows dotted circles or broken points, use `TimesNewRomanPSMT` |
| Hero (word study header) | 34 pt | 40 pt |
| Interlinear tile | 21 pt | 25 pt |
| Inline (rows, definitions) | 17 pt | 19 pt |
| Direction | LTR | RTL: set `NSWritingDirection` right-to-left in the paragraph style for Hebrew strings in mixed lines |
| Color | ink | ink |

All sizes scale with `UIFontMetrics` (Body), but not with the in-app reading size step,
because these are UI screens. Transliteration is always SF Pro italic, faint. Strong's
numbers and parsing codes are SF Pro `monospacedDigitSystemFont`, faint.

### 7.4 Interlinear (sheet)
This is a UINavigationController page sheet with detents medium and large, starting at
**medium**, and the grabber visible. It's dimmed behind (standard). The root is a run-time
UIViewController subclass.
- **Nav bar**: inline title = the reference ("John 3:16"). Done is on the right.
- **Bottom toolbar** (`setToolbarHidden:NO`):
  - `chevron.up` (previous verse), a flexible space, a `UISegmentedControl` ["English
    Order", "Greek Order"] (or "Hebrew Order" in the OT; width 240), a flexible space,
    and `chevron.down` (next verse).
  - Previous/next cross chapter boundaries and skip unaligned verses.
  - The order choice is remembered in defaults (`interlinearOrder`).
- **Content**: a vertical UIScrollView (background `bg`):
  1. The verse text as the reader sets it (body font at 0.9 em, ink, line height 1.3,
     with its verse number), inset 20 pt, with 16 pt above.
  2. A 1 pt `rule` hairline, 20 pt inset, with 14 pt above and below.
  3. **Word tiles**, laid out by our own wrapping code (`lang.l8` computes the lines from
     the measured tile widths; ios.l8 positions the views). This avoids depending on
     flow-layout justification.
     - Rows are leading-aligned, with 6 pt between tiles and 14 pt between rows, and 14 pt
       insets.
     - In **Hebrew order**, rows run right-to-left from the trailing edge.
- **Tile**: a run-time `UIControl` subclass, target-action `touchUpInside`, with a vertical
  stack of up to 4 centered labels and padding of 8 pt horizontal and 6 pt vertical:
  1. **English**: the chunk (the verse's tokens, with their attached punctuation trimmed
     at the edges). SF Pro 15, ink.
     - Untranslated: "—" in faint.
     - `vvv`: "(with next)" or "(with previous)" in SF 12 italic, faint.
     - Supplied `[x]` words get their own tile, with the English in italic faint and no
       other lines.
  2. **Original**: the form in the §7.3 font and size, ink.
  3. **Transliteration**: SF Pro 12 italic, faint.
  4. **Code**: "G25 · V-AIA-3S" in SF Pro 11 monospaced, faint.
  - Tile width = the widest label + 16. Corner radius 10, continuous.
  - Background: none. While highlighted, it's `cellBg` (on Paper, Sepia and Black; system
    `secondarySystemFill` on White and Night).
  - In English order, a tile whose English is shared with its neighbour shows a 1 pt
    `rule` hairline joining the pair under the English line.
  - Accessibility label: "loved, Greek ēgapēsen, agapaō, verb, aorist indicative active,
    3rd person singular", with the hint "Shows word study".
- Tapping a tile pushes the **word study** for that word (§7.5). Tiles with no original
  word (supplied) aren't controls.

### 7.5 Word study (pushed, or presented as a sheet from the edit menu)
When presented from the edit menu, it's a page sheet with detents medium and large,
starting at **large**, and the grabber visible. Otherwise it's pushed in the interlinear's
navigation stack. The root is a run-time UITableViewController (insetGrouped, with the
§3.7 sheet background rules).
- **Nav bar**: inline title = the lemma's transliteration ("agapaō"). Done is on the right
  when this is the root.
- **Header** (`tableHeaderView`, centered, 24 pt top and 20 pt bottom):
  1. The form as it appears in this verse, in the hero size (ἠγάπησεν).
  2. 4 pt of space, then the transliteration of the form, in SF Pro 17 italic, faint
     (ēgapēsen).
  3. 8 pt of space, then “**loved**” in John 3:16, in SF Pro 15, ink at 80%, with the
     English chunk in semibold. If the word is untranslated, this line reads "Not
     translated in John 3:16".

#### 7.5.1 Rows
Section 1 (no header): valueCell rows, with the label in ink and the value in faint,
except where noted.
- **Dictionary Form**: the lemma in the original script, inline size, followed by its
  transliteration in parentheses (italic).
- **Meaning**: the gloss ("to love"), in ink.
- **Strong's**: "G25" (monospaced).
- **Grammar**: a subtitle cell. The title is "Grammar". The secondary text is the plain
  parsing on one line, wrapping to 2 if needed ("Verb · aorist · indicative · active ·
  3rd person singular"). It has a disclosure indicator and pushes **Grammar** (§7.5.3).

Section "Definition":
- One cell with the definition rendered from the markup (§7.6 styles), limited to **5
  lines** (`numberOfLines 5`, tail truncation), with a disclosure indicator. It pushes
  **Definition** (§7.6).
- Section footer: "From STEP Bible", in plain system footer style. The linked credit is on
  the Definition screen and in Acknowledgements.

Section "Occurrences":
- **Concordance**: "143 times" (value) with a disclosure indicator. It pushes the
  concordance (all).

Section "Translated As" (only if the word is translated at least once):
- Up to 6 rows of BSB renderings, most frequent first: "love" | "74", "loved" | "22", …
  Each has a disclosure indicator and pushes the concordance filtered to that rendering.
- A rendering is the word's English chunk lowercased, with surrounding punctuation trimmed
  and the initial capital folded.
- If there are more than 6, a final row, "All Renderings", pushes a plain list of every
  rendering with counts.

#### 7.5.2 Toolbar
The toolbar is visible:
- On the left, a text item **Add to Note**. It appends a line "ἀγαπάω (agapaō, G25): to
  love" to this verse's note (creating the note if needed, anchored to this verse) and
  presents the note editor as a sheet over the study, with the cursor at the end.
- On the right, a text item **Interlinear**, only when this word study was not reached from
  the interlinear. It pushes the interlinear for the verse.

#### 7.5.3 Grammar screen
This is a pushed insetGrouped table, with the inline title "Grammar".
- Header label: the form (inline size) and the code, centered, e.g. "ἠγάπησεν ·
  V-AIA-3S".
- Then one subtitle row per term in the parsing, in order. The title is the term (SF 17
  semibold, e.g. "Aorist"), and the secondary text is its plain explanation from
  `grammar.txt`.
- Compound Hebrew parsings ("Conjunctive waw | Noun - feminine singular") become one
  section per part, with the headers "Prefix" and "Word" (and "Suffix" when present).

The builder writes `grammar.txt` with one short, plain-English sentence per term (no
jargon in the explanation), covering at least these terms:
- **Greek tenses**: present, imperfect, future, aorist, perfect, pluperfect.
- **Greek moods**: indicative, subjunctive, optative, imperative, infinitive, participle.
- **Greek voices**: active, middle, passive, middle or passive.
- **Cases**: nominative, genitive, dative, accusative, vocative.
- **Person, number and gender**: 1st, 2nd and 3rd person; singular, plural and dual;
  masculine, feminine, neuter and common.
- **Hebrew stems**: Qal, Niphal, Piel, Pual, Hiphil, Hophal, Hithpael.
- **Hebrew forms**: perfect, imperfect, consecutive imperfect, consecutive perfect,
  imperative, jussive, cohortative, infinitive construct, infinitive absolute,
  participle.
- **Other Hebrew terms**: construct, conjunctive waw, article, the prepositions b, l, k and
  m, direct object marker, pronominal suffix.
- **Parts of speech**: noun, proper noun, verb, adjective, adverb, pronoun, preposition,
  conjunction, particle, interjection.

For example: "Aorist — presents an action simply as a whole, usually in the past, without
describing its progress."

### 7.6 Definition (pushed)
This is a run-time UIViewController with a full-height UITextView (non-editable,
selectable, insets 20 pt, background `bg`). The inline title is "Definition".
- **Headline**: the lemma (hero size, original script); then the transliteration (SF 17
  italic, faint), and "· G25" (monospaced, faint); then the gloss (SF Pro 20 semibold,
  ink) with 6 pt above; then a 1 pt `rule` hairline, 16 pt above and below.
- **Body**: from the markup, with paragraphs in the body font at 16 pt (scaled), ink, line
  height 1.3, and paragraph spacing 0.5 em.
  - `**bold**` is semibold. `_italic_` is italic.
  - Numbered senses ("1.", "__1.", "(a)") get a hanging indent of 1.4 em.
  - Greek and Hebrew inside definitions use the inline sizes from §7.3, falling back
    automatically.
  - References are `NSLinkAttributeName` = `bsb://BOOK/C/V`, in accent, with no underline
    (`linkTextAttributes`). They're handled in `textView:shouldInteractWithURL:inRange:interaction:`,
    which returns NO, dismisses the sheet stack and jumps (R3.1 makes this a preview).
- **Other senses**: if the base number has more sub-entries, each follows under a
  sub-heading (SF 15 semibold, heading color): "Also: (Huram)-abi".
- **Credit** (required by CC BY): at the end, after a hairline, "Source: " followed by
  **STEP Bible** as a link to `https://www.STEPBible.org`, in SF 13, faint, with the link
  in accent. It opens in an `SFSafariViewController` (no block needed; link the
  SafariServices framework, and flag it in the build if a new framework entry is
  required).

### 7.7 Concordance (pushed)
This is a run-time UITableViewController (plain style, background `bg`).
- **Title** (inline): "Concordance", or “loved” when filtered to a rendering.
- **Header** (`tableHeaderView`): a centered SF 13 faint label, inset 20 pt, 10 pt top and
  bottom. It reads "ἀγαπάω · agapaō · G25 — 143 times in 116 verses", or "agapaō
  translated “loved” — 22 times".
- **Search**: `navigationItem.searchController` with no results controller, placeholder
  "Filter Verses", and `hidesSearchBarWhenScrolling = NO`. Filtering is a plain
  case-insensitive substring match over the verse text and the reference.
  - Scope bar: "All" and the current reading book's name ("John"), shown only when the
    word occurs in that book.
- **Sections**: one per book, in canonical order. The header is "John · 12" in system
  header style.
  - `sectionIndexTitlesForTableView:` returns short book names ("Gen", "Ex", …, from the
    alias table) when there are more than 8 sections.
- **Rows**: exactly the Round 1 search-result cell (§3.6). The reference is in SF 13
  semibold accent, and the verse is in the body font at 16 pt. **The English chunk(s) of
  this Strong's number are semibold, in ink, with the `selection` wash**, and the rest of
  the verse is in ink at 80%.
  - Long verses use the same "… " window as search, centred on the first emphasized chunk.
  - Untranslated occurrences add " · not translated" in faint after the reference, with
    no emphasis.
- **Performance**: decode the verse list on push. Compute the emphasis ranges lazily in
  `cellForRowAtIndexPath:`. It must scroll smoothly even for H3068 (about 6,800 verses).
- **Tap**: dismisses the sheet stack (`dismissViewControllerAnimated:` on the reader's
  navigation controller), then jumps to the verse, flashes it, and shows the back
  capsule.

### 7.8 Acknowledgements (pushed from Reading settings)
Reading settings gets a final section with one row, **Acknowledgements** (disclosure
indicator). The existing "Berean Standard Bible · Public Domain" footer moves onto that
section.

The Acknowledgements screen is insetGrouped, with the inline title "Acknowledgements".
Each linked row is a subtitle cell with an `arrow.up.right` accessory image (faint), and
it opens an `SFSafariViewController`.
1. **Text**: "Berean Standard Bible" / "The BSB text is in the public domain." →
   `https://bereanbible.com`
2. **Original Languages**: "Berean Bible Translation Tables" / "Hebrew and Greek words,
   transliterations, parsing and Strong's numbers aligned to the BSB. Public domain." →
   `https://bereanbible.com`
3. **Lexicons**: "STEP Bible" / "Definitions from STEP Bible's brief Hebrew and Greek
   lexicons (TBESH, TBESG), licensed CC BY 4.0." → `https://www.STEPBible.org`.
   - A second row, "Changes to the Lexicon Data" (disclosure indicator), pushes a text
     screen listing what the pipeline changed:
     - The HTML was converted to plain styled text.
     - Entries were grouped by base Strong's number.
     - Hebrew cantillation and paragraph marks were removed for display.
     - Psalm titles were mapped to verse 1.
4. Footer: "Smooth Bible 1.0 (build)", read from `CFBundleShortVersionString` and
   `CFBundleVersion`.

### 7.9 Notes made complete
**Read mode (R2.8).** Opening an **existing** note shows it read-only first:
- The quote block is as in Round 1.
- Below it, a non-editable, selectable UITextView with the note in the body font.
- Verse references in the note text, found with `parse_ref` over word windows (e.g.
  "Ezekiel 36:25–27", "jn 3:16", "Rom 8"), are `bsb://` links in accent. Tapping one
  dismisses the sheet and jumps, with the back capsule.
- The nav bar has **Done** on the left (closes) and the system **Edit** item on the
  right. Edit switches to Round 1's editor in place: the keyboard rises, the right item
  becomes the bold system **Done** (save and return to read mode), and the left item
  becomes `trash`.
- New notes still open directly in edit mode, exactly as in Round 1.

**Library search and sort (R2.9).**
- **Search**: Library gets a `navigationItem.searchController` (no results controller,
  `hidesSearchBarWhenScrolling = YES`). The placeholder follows the segment ("Search
  Highlights", "Search Notes", "Search Bookmarks"). It filters by verse text, note text
  and book name, and matches are semibold in the rows.
- **Sort**: a `UIBarButtonItem` (`arrow.up.arrow.down`, on the left) whose `menu` is a
  `UIMenu` of two `UICommand`s, **Bible Order** and **Newest First**, with the current one
  `state = On`. The commands are handled on the app delegate, through the responder
  chain. This is the system's "Sort By" pattern.
  - Newest First drops the book sections and shows one section with each row's relative
    date ("Today", "Yesterday", or a medium date) as the value text.
  - The choice is remembered (`librarySort`).
  - If `UICommand`s in a bar-button menu don't fire on the CI iOS version, fall back to
    a plain bar button that toggles, titled with the sort that's **not** current, and
    note this in the commit.
- **Add to Note**: see §7.5.2.

### 7.10 CI demo for Round 2 (steps continue after Round 1's)
Number these steps from the step after Round 1's last. The ones below assume Round 1 ended
at step 30, and are renumbered if not. The state is light, Auto theme, and the default
size, set back by the script before step 32.

| Step | Action in `demo_do` | Screenshot shows |
|---|---|---|
| 32 | Go to John 3:16 and select it | `32-panel-study`: the panel with five actions, Study last |
| 33 | Tap Study | `33-interlinear`: the medium sheet "John 3:16", the verse text, the hairline, and English-order tiles ("For", "God", "so", "loved" over ἠγάπησεν …), with the toolbar arrows and "English Order \| Greek Order" |
| 34 | Choose Greek Order and expand to large | `34-interlinear-greek`: tiles in Greek order (Οὕτως first), large detent |
| 35 | Tap the "loved" tile | `35-word-study`: title "agapaō", hero ἠγάπησεν, ēgapēsen, “loved” in John 3:16; rows Dictionary Form ἀγαπάω (agapaō), Meaning "to love", Strong's G25, Grammar "Verb · aorist · indicative · active · 3rd person singular"; definition preview; Concordance count; Translated As rows; the toolbar with Add to Note |
| 36 | Push Grammar | `36-grammar`: rows Verb, Aorist, Indicative, Active, 3rd Person, Singular, each with an explanation |
| 37 | Back, then push Definition | `37-definition`: headline, the gloss, the body with bold senses and accent references, scrolled to the end so the STEP Bible credit link is visible (the step scrolls to the bottom) |
| 38 | Back, then push Concordance | `38-concordance`: header count, book sections (Matthew …) with the index on the right, rows with the emphasized English |
| 39 | Back, then tap the "loved" rendering | `39-concordance-loved`: title “loved”, only rows where agapaō is rendered "loved" |
| 40 | Tap the first row | `40-concordance-jump`: the reader at that verse, flashed, with the back capsule; no sheets |
| 41 | Go to Psalm 23:1, select the word "shepherd", and present the edit menu | `41-edit-menu-study`: the menu reading Study, Highlight, Note, then the system items |
| 42 | Choose Study | `42-word-study-hebrew`: the hero רֹעִי rendered with clean points (no cantillation, no dotted circles), translit rō·‘î (the tables' syllable dots are kept), “is my shepherd” in Psalm 23:1, Dictionary Form רָעָה (rā‘āh), Strong's H7462, the Translated As rows |
| 43 | Tap Interlinear in the toolbar, then switch to Hebrew Order | `43-interlinear-hebrew`: Psalm 23:1 tiles flowing right to left; the LORD tile with יְהוָה |
| 44 | Dismiss, go to Genesis 1:1, open its interlinear in English order | `44-interlinear-untranslated`: the אֵת tile shows "—" English; "In the beginning" is one tile over בְּרֵאשִׁית |
| 45 | Set the Night theme (via the setting), open the word study for "created" (H1254) | `45-word-study-night`: the word study in the dark theme with correct colors |
| 46 | Back to Auto (light). Open the John 3:5 note (Round 1 made it) | `46-note-read`: read mode, "Ezekiel 36:25–27" in accent as a link, Done on the left, Edit on the right |
| 47 | Tap Edit | `47-note-edit`: the editor, keyboard, trash on the left, bold Done on the right |
| 48 | Done; Add to Note from the word study of John 3:16 "loved" | `48-add-to-note`: the editor for John 3:16 with "ἀγαπάω (agapaō, G25): to love" appended |
| 49 | Save, open Library → Notes, and type "agap" in the search | `49-library-search`: filtered notes with the match in semibold |
| 50 | Clear the search and open the sort menu | `50-library-sort`: the menu with Bible Order ✓ and Newest First |
| 51 | Choose Newest First | `51-library-newest`: one section, newest first, with relative dates |
| 52 | Dismiss, open Reading settings, scroll to the end, push Acknowledgements | `52-acknowledgements`: the three sections, the STEP Bible row with the arrow, and the version footer |
| 53 | Push Changes to the Lexicon Data | `53-data-changes`: the list of changes |
| 54 | Go to a known unaligned verse (Exodus 38:28) and select it | `54-study-disabled`: the panel with Study greyed |

### 7.10a Amendments from review r2-1
- **Tiles in columns:** the interlinear's tiles are laid out in an even column grid (as
  built) instead of a width-wrapped flow. This is accepted, provided no tile text is ever
  truncated (a long chunk spans two columns).
- **Supplied words:** the translators' supplied words stay inside their neighbour's tile,
  because that's how the tables record them. Accepted.
- **Step 54 is dropped**, because every verse aligns. Keep the disable logic as a safeguard.
- **Cut from Round 2:** the "All Renderings" screen (show the top 6 renderings only) and the
  concordance's scope bar (keep its filter field).
- **Display references in app style:** references inside definitions are displayed in the
  app's style ("Rom 8:37", "John 3:35", "1 John 2:15"), never in STEP's ("Rom.8:37",
  "Jhn.3:35").
- **Hebrew outline definitions** (BDB style "1) … 1a) … 1a1) …"): each sense starts a new
  line, indented 1.2 em per level (level = the number of alternating digit/letter groups
  minus 1), with the label in faint. The 5-line preview shows the top-level senses only,
  joined with " · ".

### 7.11 Round 2 acceptance criteria
**Data**
1. The pipeline's printed counts appear in the commit message: aligned verses ≥ 31,094,
   with the unaligned list. `test_lang.l8` passes. Round 1 tests pass on the new text.
2. Launch time is unchanged, and the data is mapped on first study use.
3. The text in the reader is the publisher's current BSB. Spot-check: psalm titles are
   correct, and em dashes are unspaced.

**Gestures**
4. A tap selects verses, and long-press selects words, as in Round 1. No gesture changed
   meaning.
5. Study appears in the panel (fifth) and first in the edit menu. The edit menu fits on one
   page with the system items.
6. Study is disabled where data can't support it.

**Interlinear**
7. Tiles wrap cleanly with consistent spacing. The English, original, transliteration and
   code lines are centered within tiles and aligned across a row. Hebrew order flows right
   to left.
8. Untranslated, `vvv` and supplied words are clearly and quietly distinguished.
9. Previous/next verse and the order control work, and the order choice persists.

**Word study and related screens**
10. The header and rows match §7.5 exactly. The parsing is in plain English. The Translated
    As counts add up to the occurrence count minus the untranslated ones.
11. Greek and Hebrew render with correct glyphs and points. Hebrew has no cantillation.
12. The definition has no stray HTML, entities or "__". Senses are hanging-indented.
    References are tappable and jump.
13. The concordance emphasizes exactly the English words for that Strong's number, its
    counts match word study's, and its filter, scope and section index work.
14. The STEP Bible credit is present and linked on the Definition screen and in
    Acknowledgements, with the text exactly "STEP Bible" linking to www.STEPBible.org.

**Notes**
15. Existing notes open in read mode with live references. Edit, Done and trash follow the
    system's placement and wording.
16. Add to Note appends correctly and creates a note when none exists.
17. Library search filters across text and notes. The sort menu uses the system menu,
    shows its checkmark, and persists.

**HIG and consistency**
18. Every Round 2 sheet uses standard bars with Done on the right (Notes read mode is the
    stated exception), the system back button with the previous title, and system list
    styles. There are no custom gestures.
19. All screens follow the theme (light and dark, with paper and sepia tints) and Dynamic
    Type. VoiceOver labels are present on tiles and toolbar items.

---

## 8. Round 3 specification: reading and notes, deepened

Round 2 is approved and shipped (TestFlight build 6, commit dfd9e0e7). Round 3 keeps every
Round 1 and Round 2 behavior, except where this section explicitly replaces one. That
replacement is §8.1: references that used to jump now preview.

### 8.0 Priorities and order (re-ranked)
These are ranked by the owner's priorities: distraction-free reading, then notes, then
language tools. Cheap items that serve reading come early.

| # | Item | Serves | Size |
|---|------|--------|------|
| R3.1 | Passage previews (headings, footnotes, definitions, notes) | Reading and study | M |
| R3.2 | Keep the screen on while reading | Reading | S |
| R3.3 | History | Reading | S–M |
| R3.4 | Chapter notes | Notes | M |
| R3.5 | Export notes and highlights | Notes | S–M |
| R3.6 | Highlight color filter | Notes | S |
| R3.7 | Listen (read aloud) | Reading | L |
| R3.8 | Words of Jesus in red (off by default) | Reading (an option) | S |
| R3.H | Pre-App-Store hygiene (§8.9) | Release | M |

**One rule for references** (new, applies everywhere from Round 3 on):
- **Tapping a reference that sits inside text** (headings, footnotes, definitions, notes)
  **previews it.**
- **Tapping a row in a navigation list** (search, concordance, library, history, picker)
  **goes there.**
- The preview's **Open in Reader** goes there too.

**Nothing in Round 3 needs blocks or the block shim.** The two places one might reach for a
block are handled without one:
- The chapter-note context menu is replaced by a compose button (§8.4).
- The popover-to-sheet handoff uses `performSelector:withObject:afterDelay:` (§8.1).

### 8.1 R3.1 Passage previews
**Link sources and styling:**
1. **Heading passage ranges** (R lines, e.g. "(John 1:1–5; Hebrews 11:1–3)").
   - `text.l8` parses each reference in the line with `parse_ref` and emits a `STYLE_REF`
     run per reference. Its `run_arg` is an encoded reference (`book·2^24 | chapter·2^12 |
     verse`, with verse_end in a parallel array `run_arg2`).
   - The punctuation and parentheses stay `STYLE_RANGE` (faint italic).
   - The references are **accent, italic, no underline.** They're the only accent text in a
     heading, so they're discoverable but quiet.
   - ios.l8 tags them with a new attribute `L8Ref` (an NSNumber of the encoded reference),
     like `L8Link` for footnote marks.
2. **Footnotes.**
   - In the footnote popover, references written as `Book C:V` or `Book C:V–V` with a full
     or alias book name ("Cited in 2 Corinthians 4:6", "See Revelation 7:17", "Cited in
     Matthew 19:4 and Mark 10:6") become accent links.
   - Relative references ("also in verses 7, 8, 14") stay plain.
   - The popover becomes a non-editable, non-scrolling UITextView, so it can carry links
     (`NSLinkAttributeName` = `bsb://BOOK/C/V[-V2]`, and `linkTextAttributes` = accent with
     no underline).
3. **Definitions** (Round 2 §7.6): references already render in app style. They now
   **preview** instead of jumping.
4. **Notes in read mode** (Round 2 §7.9): references **preview** instead of jumping.

**Tap handling:**
- **Reader:** in §3.1.3's tap priority list, insert "**on an `L8Ref` run (± 12 pt) →
  preview**" after footnote marks and before note glyphs.
- **Popover:** handle the tap in the text view delegate
  `textView:shouldInteractWithURL:inRange:interaction:` and return NO. Then:
  1. Dismiss the popover **animated**.
  2. Present the preview from the reader after 0.3 s
     (`performSelector:@selector(showPendingPreview) withObject:nil afterDelay:0.3`), so
     the popover fades before the sheet rises. There's never an instant disappearance.
- **Definitions and notes:** the same delegate method returns NO and **pushes** the preview
  onto the current sheet's navigation stack, keeping the system back button with the
  previous title.

**The Passage view controller** (one run-time class, used presented and pushed):
- **Presented from the reader:**
  - A UINavigationController page sheet, with detents medium and large, starting at
    **medium**, and the grabber visible. It's dimmed behind, and opening it expands the
    collapsing bar (§3.1.4).
  - **Pushed:** it takes the sheet's current detent.
- **Nav bar:**
  - The inline title is the reference in app style ("John 1:1–5", "2 Corinthians 4:6",
    "Matthew 5:1–7:29").
  - Done is on the right when presented. When pushed, there's a system back button.
- **Bottom toolbar:** flexible space, a text item **Open in Reader**, flexible space.
- **Content:** a non-editable, selectable UITextView, background `bg`, with the reader's
  margins and typography (the same attributed-string builder, restricted to the range):
  - The verses of the range, with their verse numbers, poetry indents, the section
    headings inside the range (not the one before it), footnote marks (tappable,
    showing a popover over the preview), and the user's highlights and note glyphs.
  - A range that crosses chapters shows a small chapter label and numeral (0.62 em label
    and 1.6 em numeral, centered) at each chapter start after the first.
  - At most 80 verses. Beyond that, the text ends with a centered faint line "Continues in
    the reader", and Open in Reader is the way on.
  - Single verse: the verse alone, with "John 3:16" as the title.
- **Interaction inside the preview:**
  - Verse taps do nothing: no selection tray in previews.
  - Long-press gives the plain system selection menu: Copy, Look Up, Translate, Share.
    The app's own commands don't appear here.
  - References inside the preview (its headings) push another preview.
- **Open in Reader:** dismisses the whole sheet stack, then jumps to the first verse:
  one third down, the neutral flash, history pushed, and the back capsule shown with the
  origin place.

**Motion:**
- System sheet presentation and push.
- The popover fades out for 0.3 s before the sheet rises.
- The bar expands alongside the sheet (§3.1.4).
- Nothing appears or disappears without animation.

**Demo** (a new CI group, `more`; see §8.10):
| Shot | Action | Expected |
|---|---|---|
| `60-xref-links` | Genesis 1 top | The range line under "The Creation" with "John 1:1–5" and "Hebrews 11:1–3" in accent italic, and the parentheses and semicolon faint |
| `61-preview-xref` | Tap "John 1:1–5" | A medium sheet titled "John 1:1–5": verses 1–5 in reader style, the toolbar with Open in Reader, and Done |
| `62-footnote-link` | Dismiss. Tap the footnote mark on Genesis 1:3 | The popover reading "Cited in **2 Corinthians 4:6**", with the reference in accent |
| `63-preview-footnote` | Tap the reference | The popover gone (faded), and a sheet titled "2 Corinthians 4:6" |
| `64-preview-open` | Tap Open in Reader | The reader at 2 Corinthians 4:6, flashed, with the back capsule "‹ Genesis 1:3"; no sheets |
| `65-preview-in-study` | Open the word study of John 3:16 "loved" → Definition, then tap "Rom 8:37" | The preview pushed in the study sheet: back button "Definition", title "Romans 8:37" |
| `66-preview-from-note` | Open the John 3:5 note (read mode) and tap "Ezekiel 36:25–27" | The preview pushed in the note sheet: back button "John 3:5", three verses |
| `67-preview-cross-chapter` | Preview "Matthew 5:1–7:29" (from the demo hook) | Chapter labels at Matthew 6 and 7, then "Continues in the reader" at verse 80 |

**Acceptance:**
1. Every reference in R lines, footnotes, definitions and notes previews, and nothing in
   those places jumps directly.
2. Lists still go directly.
3. Previews render exactly in reader style, including highlights. Cross-chapter labels and
   the 80-verse cap work.
4. The popover-to-sheet handoff shows no abrupt disappearance (recording sequence 7).
5. Open in Reader lands one third down, with the flash and the back capsule.

### 8.2 R3.2 Keep the screen on while reading
- **Setting:** Reading settings gets a new section **"While Reading"**, placed before
  Acknowledgements, with one switch row, **Keep Screen On** (off by default). Its footer
  (SF 12, faint): "The screen stays on while you read. It turns off as usual after 10
  minutes without scrolling."
- **Behavior:** when the setting is on, set `UIApplication.sharedApplication.idleTimerDisabled
  = YES` while all of these hold: the app is active, the reader is foremost (no sheet
  presented), and the last scroll or tap in the reader was less than **10 minutes**
  ago.
  - Re-arm a single NSTimer (10 minutes) on every scroll end and tap. When it fires, set
    `idleTimerDisabled = NO`.
  - Presenting a sheet, entering the background, or turning the setting off sets it to NO
    immediately.
  - With L8_DEMO only, log `bible: idle timer off` or `bible: idle timer on` on each
    change.
- **Motion:** none (no visible change).
- **Demo:** `68-keep-screen-on`: Reading settings scrolled to While Reading, with the switch
  on and the footer.
- **Acceptance:**
  1. The switch persists (`keepScreenOn` in defaults).
  2. The console (demo) shows "off" after the reader is touched with the setting on, and
     "on" when a sheet opens.
  3. With the setting off, the idle timer is never touched.

### 8.3 R3.3 History
**What's recorded** (`history.tsv`, the same format; keep the **last 200** entries, newest
last):
1. Every jump records its **origin** place (as now) and its **destination**.
2. **Dwell:** when the reader comes to rest (scroll ends) on a chapter different from the
   newest entry's chapter and stays there for **20 s**, record that chapter with the verse
   at the top.
3. **Merging:** a new entry for the same chapter as the newest one replaces it, updating
   the verse and the time. History is a trail of chapters, not of every scroll.

**Picker:**
- The Recent section (§3.2) gets a final row, **Show All** (in accent, no image, with a
  disclosure indicator), when there are more than 4 entries.
- It pushes the **History** screen.

**History screen** (a run-time UITableViewController, insetGrouped; the inline title is
"History"):
- **Sections by day:** "Today", "Yesterday", the weekday name for the last 7 days, then a
  medium date ("12 October 2026"). Newest first.
- **Row:** a subtitle cell. The text is the reference ("John 3:16", or "John 3" for a
  dwell without a precise verse), and the secondary text is the first ~50 characters of
  that verse (faint, small caps for LORD). The accessory is the time ("3:24 PM",
  `UIListContentConfiguration valueCell` style, faint).
- **Tap:** dismisses the picker, then jumps there (history pushed, back capsule).
- **Swipe to delete** via `tableView:commitEditingStyle:forRowAtIndexPath:` (no blocks).
  Rows are removed with `UITableViewRowAnimationAutomatic`. The day section is removed
  when it empties.
- **Clear:**
  - The nav bar's right item is a `UIBarButtonItem` titled **Clear**, whose `menu` is a
    `UIMenu` with one destructive `UICommand`, **Clear History**
    (`attributes = UIMenuElementAttributesDestructive`). The menu is the confirmation
    step, as in Safari.
  - Choosing it empties history and shows the empty state.
  - This uses the same mechanism as the Library sort menu, so it's pending the owner's
    device check. Fallback: put it in edit mode (system **Edit** item), with a toolbar
    item **Clear All** shown in systemRed.
- **Empty state:** `UIContentUnavailableConfiguration` with `clock.arrow.circlepath`, "No
  History", and "Places you read will appear here."

**Motion:** system push, deletion animations, and the menu. When cleared, the rows fade out
(`reloadSections:withRowAnimation:Fade`), then the empty state fades in.

**Demo:**
| Shot | Action | Expected |
|---|---|---|
| `69-picker-show-all` | After the read group's earlier jumps (the demo seeds 8 entries over 3 days with fixed times), open the picker | Recent with 4 rows and Show All |
| `70-history` | Tap Show All | Today, Yesterday and a weekday section, rows with times |
| `71-history-clear-menu` | Tap Clear | The menu with a red "Clear History" |

**Acceptance:**
1. Dwell and merge rules are as specified, and the demo seed shows correct grouping.
2. Swipe to delete and Clear work. The empty state is present.
3. Rows go to their place, with the back capsule.

### 8.4 R3.4 Chapter notes
**Model:** `notes.tsv` rows with `VERSE = 0` and `VERSE_END = 0` are chapter notes. There's
one per chapter at most.

**Creating and opening one** (no context menu, because `UIContextMenuConfiguration`'s
action provider is a block):
1. **Library → Notes** shows a bottom toolbar. A **compose** item (`square.and.pencil`) sits
   on the right, as in the Notes app.
   - It opens the note editor for **the chapter at the top of the reader** (`cur`), or
     the existing note for that chapter.
   - Library's bottom toolbar is shown on every segment, because Export (§8.5) lives there
     too. The compose item is present on the Notes segment only. When the segment
     changes, it's added or removed with `setToolbarItems:animated:YES`, so it fades.
2. **In the reader:** an existing chapter note shows a `note.text` glyph (accent, 0.62 em)
   **after the chapter label**, separated by a thin space ("JOHN ▭"), or after the book
   title for chapter 1.
   - Tapping it (± 16 pt) opens the note in read mode.
   - Add it to §3.1.3's tap priority list next to verse note glyphs.

**Editor** (Round 1 §3.4 and the Round 2 read mode, adapted):
- The title is "John 3".
- The quote block holds the chapter's **first section heading** (SF 15 semibold, heading
  color), or "John 3" if the chapter has none. Under it is the chapter's first verse,
  truncated to 2 lines (faint).
- Everything else (read mode, Edit, trash, links) is as for verse notes.

**Library → Notes:**
- Chapter notes are listed in their book section, **before** that chapter's verse notes.
- The reference is "John 3", the image is `note.text`, and the secondary text is the note.
- Newest First sorting includes them by time.

**Motion:** the toolbar is shown and hidden animated, and the sheets present as usual.

**Demo:**
| Shot | Action | Expected |
|---|---|---|
| `72-library-compose` | Library → Notes | The bottom toolbar with Export on the left and compose on the right |
| `73-chapter-note-editor` | Tap compose (with John 3 at the top of the reader), type "Born from above: anōthen — again or from above." | The editor titled "John 3", the quote "Jesus and Nicodemus" with the first verse, and the text |
| `74-chapter-note-glyph` | Done, dismiss, scroll to the John 3 opener | "JOHN ▭" with the glyph, and the numeral 3 |
| `75-library-chapter-note` | Library → Notes | The JOHN section: "John 3" (chapter note) first, then John 3:5 and John 3:16 |

**Acceptance:**
1. There's one chapter note per chapter. Compose opens the existing one.
2. The glyph appears only when a note exists, and it's tappable.
3. Ordering in Library is correct. Read mode and links work as for verse notes.

### 8.5 R3.5 Export notes and highlights
**Entry:** Library's bottom toolbar (every segment) gets an **Export** item
(`square.and.arrow.up`) on the left. It's disabled when there are no highlights, notes or
bookmarks at all.

**Action:**
1. Write `Smooth Bible Notes YYYY-MM-DD.md` into `NSTemporaryDirectory()`.
2. Present a `UIActivityViewController` with that file's NSURL
   (`initWithActivityItems:applicationActivities:nil`; no completion handler needed). On
   iPad-style presentation, its `popoverPresentationController.barButtonItem` = the Export
   item.

The file exports **everything** (all three kinds), regardless of the segment, filter or
search. Format (UTF-8, LF):
```markdown
# Smooth Bible — Notes and Highlights
Berean Standard Bible · exported 18 October 2026

## John

### John 3
*Chapter note:* Born from above: anōthen — again or from above.

**John 3:1** · Bookmark
> Now there was a man of the Pharisees named Nicodemus, a leader of the Jews.

**John 3:3** · Highlight (green)
> Jesus replied, “Truly, truly, I tell you, no one can see the kingdom of God unless he is born again.”

**John 3:5** · Note
> Jesus answered, “Truly, truly, I tell you, no one can enter the kingdom of God unless he is born of water and the Spirit.”

Water and Spirit: compare Ezekiel 36:25–27.
```
- Books and chapters are in canonical order, and verses in order.
- A verse with several marks gets one entry listing them in the order Highlight, Bookmark,
  Note: "**John 3:16** · Highlight (yellow) · Note".
- Highlight ranges that were stored per verse merge into one entry per contiguous run of
  the same color: "**John 3:16–17** · Highlight (yellow)", with the verses quoted
  together.
- Notes keep their line breaks. Note text is not quoted; the verse is.
- LORD is written as "LORD". There are no footnote marks.

**Motion:** the system activity sheet.

**Demo:**
- `76-export-sheet`: tap Export. The activity sheet shows the file name and a document
  icon.
- The demo also copies the file into the app's Documents directory. `simulate.sh` pulls it
  with `xcrun simctl get_app_container booted space.trailingwhite.smoothbible data` and
  publishes it as `notes-export.md` with the screenshots.

**Acceptance:**
1. `notes-export.md` matches the format exactly for the demo's data: John 3:1 bookmark, 3:3
   green, 3:5 note, 3:16–17 yellow plus the 3:16 note, the John 3 chapter note, and the
   Psalm 23:1 blue highlight (§8.6).
2. Export is disabled when empty. The file name carries the date.

### 8.6 R3.6 Highlight color filter
**UI:** on the Highlights segment only, the table header view is a horizontal row:
- An **All** button: `UIButtonConfiguration` with capsule corners, `filled` with accent when
  selected, `gray` otherwise, titled "All".
- Then **five color circles**: 28 pt `UIButton`s filled with the swatch colors. The
  selected one gets a 2 pt accent ring (offset 2 pt) and a white `checkmark` (11 pt,
  bold).
- Insets are 16 pt horizontal and 8 pt vertical, with 12 pt spacing, leading-aligned.
- Each circle has the accessibility label "Show Yellow Highlights", and so on, plus the
  selected trait.

**Behavior:**
- Tapping a color shows only that color's highlights. Tapping it again, or tapping All,
  shows all of them.
- Search (Round 2) applies on top of the filter.
- The filter resets to All each time Library opens.
- An empty result shows `UIContentUnavailableConfiguration`: `highlighter`, "No Yellow
  Highlights" (using the color name).

**Motion:**
- The rows change with `reloadSections:withRowAnimation:UITableViewRowAnimationFade`.
- The selection ring moves with a 0.15 s fade: the old one fades out as the new one fades
  in, via `CATransition` on the header stack.

**Demo** (the `more` group seeds a **blue** highlight on Psalm 23:1, so three colors exist):
| Shot | Action | Expected |
|---|---|---|
| `77-highlight-filter-all` | Library → Highlights | The chip row with All selected; John 3:3 (green), John 3:16–17 (yellow), Psalm 23:1 (blue) |
| `78-highlight-filter-green` | Tap green | Only John 3:3, with the ring and checkmark on green |

**Acceptance:**
1. The filter works with search, and the empty state names the color.
2. The changes fade (recording sequence 9).

### 8.7 R3.7 Listen (read aloud)
*Round 7 (§12) adds recorded readings: where §12 says otherwise (sources, the voice choice, speed for
recordings, the player's second label, Now Playing and the remote commands), §12 wins.*

**Entry** (no new permanent control on the reading page, for distraction-free reading):
- Reading settings (the Aa sheet) gets a **first section, above the text size row**, with:
  1. A **Listen** button row: a cell whose content is a `UIButton`
     (`filledButtonConfiguration`, accent, `play.fill` image plus the title "Listen from
     John 3:14", full width, 50 pt tall, capsule corners). The title names the verse at
     the top of the reader. Tapping it dismisses the sheet and starts playback from that
     verse.
  2. A **Speed** row: a `UISegmentedControl` [Slower, Normal, Faster] as the accessory,
     with rates of 0.42, 0.50 and 0.56 (as `AVSpeechUtterance.rate`). It's persisted as
     `listenRate`.
- While audio is playing, the Listen button reads **Stop Listening** (`stop.fill`, gray
  configuration).

**Engine** (`AVSpeechSynthesizer`, with a delegate and no blocks):
- **Audio session:** `AVAudioSession.sharedInstance`, category `AVAudioSessionCategoryPlayback`,
  mode `AVAudioSessionModeSpokenAudio`, then `setActive:YES` when playback starts and
  `setActive:NO` (with options 1, notify others) when it stops.
- **Info.plist:** `UIBackgroundModes` = `[audio]`, so listening continues with the screen
  locked.
- **Utterances:** **one per verse**, all queued for the current chapter when playback starts
  or reaches the chapter boundary.
  - Before the first verse of each chapter, queue a short utterance with the chapter's
    spoken name: "John, chapter 4" (or "Psalm 23").
  - Text is `verse_text` with footnotes stripped. "LORD" becomes "Lord", and "GOD" in small
    caps becomes "God". Headings aren't spoken.
- **Voice:** the best installed English voice. Prefer `en-US` with quality Premium (3),
  then Enhanced (2), then the default. Iterate over `AVSpeechSynthesisVoice speechVoices`
  and compare `quality` and `language`.
- **Progress:** in the delegate, `speechSynthesizer:didStartSpeechUtterance:` sets the
  **spoken verse**. Map utterances to verses in a small array keyed by the utterance
  pointer.
  - At the end of the chapter (`didFinishSpeechUtterance:` for the last verse), queue the
    next chapter.
  - Stop after Revelation 22.
- **Interruptions:** observe `AVAudioSessionInterruptionNotification` and pause on a began
  interruption. Don't auto-resume.
- **Remote controls:** `MPRemoteCommandCenter.sharedCommandCenter`. On its
  `playCommand`, `pauseCommand` and `togglePlayPauseCommand`, use **`addTarget:action:`**
  (the target-action form, with no block). The handlers return
  `MPRemoteCommandHandlerStatusSuccess` (0).
  - `MPNowPlayingInfoCenter.defaultCenter.nowPlayingInfo`: title = the chapter name
    ("John 3"), artist = "Berean Standard Bible", album title = "Smooth Bible". Update it
    on each chapter change.
  - Link the **MediaPlayer** and **AVFAudio** frameworks (flag in the build if a new
    framework entry is required).

**On screen while playing:**
- **The spoken verse** gets the `selection` wash (no underline) in the reader, so the
  reader can follow. The wash moves verse to verse with a 0.2 s cross-fade (set attributes
  inside `beginAnimations` on the text view's layer with a `CATransition` fade, or simply
  re-set them with a fade transition on that text view).
- **Follow:** when the spoken verse's first line falls below **70%** of the visible height,
  or above the bar, scroll it to one third down with `setContentOffset:animated:YES`.
  - Programmatic scrolls don't change the bar's collapse state.
  - If the user drags, following pauses for 8 s after the drag ends, then resumes on the
    next verse change.
- **Mini player:** a floating glass capsule, bottom center, 12 pt above the safe area,
  height 48, width min(view − 32, 360). It's a `UIVisualEffectView` with `UIGlassEffect` on
  iOS 26 (`systemThickMaterial` earlier) and capsule corners. It contains:
  - A 36 pt play/pause button (`pause.fill` / `play.fill`, ink).
  - A label "John 3:14" (SF 15 semibold, ink), plus a faint second label "Listening" or
    "Paused" (SF 12).
  - A 28 pt close button (`xmark`) that stops playback.
  - **Tapping the label** scrolls the reader to the spoken verse.
  - The back capsule hides while the mini player is visible.
  - The verse tray, when shown, sits **above** the mini player (move it up by 60 pt with
    the same spring).
- **Motion:** the mini player rises from below with the tray's spring and opacity
  (§2.7), and leaves the same way. The play/pause symbol cross-fades over 0.15 s
  (`setImage:` inside a `CATransition` fade).

**Demo** (`more` group; the simulator speaks into the void, which is fine):
| Shot | Action | Expected |
|---|---|---|
| `79-listen-entry` | Open Reading settings with John 3:14 at the top | The first section with the accent "▶ Listen from John 3:14" button and the Speed control |
| `80-listening` | Tap Listen, wait 4 s | The mini player "John 3:14 · Listening" with pause; the spoken verse washed; no sheet |
| `81-listen-paused` | Tap pause | "Paused", with a play symbol |
| `82-listen-tray` | Select verse 16 while the mini player is up | The tray above the mini player; nothing overlaps |

Also add recording sequence 8: start Listen at John 3:14, record 10 s at Faster (the demo
uses a 2 s utterance limit by setting `postUtteranceDelay` 0 and a fast rate), showing the
wash advancing and one follow-scroll.

**Acceptance:**
1. Playback starts from the top verse and continues across chapters. The wash follows,
   with a cross-fade. The follow-scroll is smooth and pauses after a user drag.
2. The mini player matches the spec and coexists with the tray.
3. Stop, pause, interruption and Reduce Motion are respected.
4. **Pending the owner's device check:** listening continues when the screen locks, and the
   lock-screen play/pause works.

### 8.8 R3.8 Words of Jesus in red
- **Data:** W records (2,497 lines, from `\wj`) already lay out like T. `text.l8` gives W
  words a new style flag (`STYLE_BODY` with `run_jesus = 1`, or a new `STYLE_JESUS` and
  `STYLE_JESUS_CAPS` for LORD inside quotes).
- **Setting:** in Reading settings → Show, a switch **Words of Jesus in Red**, placed after
  Footnote Marks. It's **off** by default and persisted as `redLetter`.
- **Rendering:** when on, W text uses **accent** (each theme's own accent: `#9C3A2C` Paper,
  `#8E4426` Sepia, `#DC8873` Night, and so on) instead of ink. Highlights, selection and the
  Listen wash apply on top as usual. Copy, share and export are unaffected.
- **Motion:** toggling the setting re-renders the visible rows with a 0.2 s cross-fade
  (`CATransition` fade on the table's layer), keeping the place.
- **Demo:**
  - `83-red-letter`: Matthew 5:3–10, setting on, Paper.
  - `84-red-letter-night`: the same verses in Night.
- **Acceptance:**
  1. Off by default.
  2. Only Jesus's words are colored: the narrative ("He said") stays ink.
  3. It's legible in every theme. The accent-on-`bg` contrast is 6.5:1 Paper, 6.0:1 Sepia,
     6.5:1 Night and 7.1:1 Black (all above 4.5:1).

### 8.9 R3.H Pre-App-Store hygiene (required before submission)
1. **Gate the diagnostics:**
   - Every `note()`/`eprint` diagnostic, timing line and "bible: …" log runs only when
     `L8_DEMO` or `L8_TIMING` is set in the environment.
   - The release build prints nothing in normal use, except genuine fatal errors.
   - `launch.sh` (the timing job) sets `L8_TIMING=1`.
   - Acceptance: a plain launch (no environment) in the launch job yields a console with
     **no** `bible:` lines. The job prints the count, which must be 0.
2. **Older iOS check:**
   - Add a CI job that boots an **iOS 18.x** simulator if the runner has a runtime for it
     (`xcrun simctl list runtimes`; GitHub's macos-15 images normally include iOS 18
     runtimes alongside the Xcode 26 default).
   - It runs a subset of the `read` group and saves shots with a suffix of `-ios18`:
     01-genesis-1, 15a and 15, 17-search, 23-settings, 28-night, and 33-interlinear.
   - If no iOS 18 runtime exists, the job prints "no iOS 18 runtime; older-iOS path
     unchecked" and succeeds. The review then notes the gap, and the owner is asked to
     check on any iOS 18 device available.
   - The minimum OS stays 16.0. iOS 16 and 17 aren't checkable in CI and are noted as
     such.
   - (Owner decision, 2026-10-19.) The app is linked with iOS 26.2's SDK, for the
     simulator as for the iPhone (`tools/ios/build-linux.sh`), so on iOS 26 it has iOS
     26's design (Liquid Glass bars, sheets and buttons); the owner keeps that look. Every
     CI group but `ios18` runs on the iOS 26.2 runtime the runners have installed
     (`ios/pick.sh`), so all groups show that design; `ios18` remains the check of the
     older look. (Before 2026-10-19 the simulator's app was linked with iOS 18.5's SDK by
     the runner's default Xcode, and its screenshots showed the pre-26 design.)
3. **Accessibility pass:**
   - Shots at the largest accessibility text size
     (`xcrun simctl ui booted content_size accessibility-extra-extra-extra-large`):
     `85-ax-reader` (John 3), `86-ax-tray` (verse selected), `87-ax-word-study` and
     `88-ax-settings`.
   - Nothing clips or overlaps. Tray labels may wrap to 2 lines but must not truncate.
   - VoiceOver labels exist on every icon button, swatch, chip, tile and mini-player
     control (code review).
4. **Defensive persistence:**
   - Malformed lines in `highlights.tsv`, `bookmarks.tsv`, `notes.tsv` and `history.tsv`
     are skipped, not fatal.
   - Unknown book codes are dropped.
   - The write is atomic (already `rename`).
   - Add a test in `test_text.l8` (or a new `test_store.l8`) that feeds malformed lines and
     checks that the good ones survive.
5. **Privacy manifest and Info.plist:**
   - `PrivacyInfo.xcprivacy` declares `NSPrivacyAccessedAPICategoryUserDefaults` with
     reason `CA92.1`. If file timestamps are read (`stat`, `NSFileModificationDate`),
     it also declares `NSPrivacyAccessedAPICategoryFileTimestamp` with reason `C617.1`.
   - It declares no tracking and no collected data.
   - Info.plist checks:
     - `ITSAppUsesNonExemptEncryption` = false (present).
     - `UIBackgroundModes` = audio (only with R3.7).
     - Portrait only.
     - `CFBundleDisplayName` = "Smooth Bible".
     - The launch screen colors (Paper and Night) are correct.
6. **App icon appearances (iOS 18+):** add **dark** and **tinted** variants to the AppIcon
   set (`appearances` luminosity dark and tinted in `Contents.json`).
   - Dark: the same mark on a near-black ground.
   - Tinted: a grayscale mark on transparency.
   - If `actool` in the build path can't compile them, say so and ship light only.
7. **App Store screenshots:** a CI group `store` on the largest current iPhone simulator
   (6.9", 1320 × 2868; iPhone 17 Pro Max or 16 Pro Max). Light, Paper, default size, with
   no back capsule, tray or diagnostics:
   1. Genesis 1 opener.
   2. Psalm 23.
   3. John 3 with the yellow and green highlights.
   4. The John 3:16 interlinear.
   5. The agapaō word study.
   6. The settings sheet in Sepia.

   They're published as `store-1.png` … `store-6.png`. They contain no simulator chrome
   other than the status bar, with the time set by `xcrun simctl status_bar booted
   override --time 9:41 --batteryState charged --batteryLevel 100`.
8. **Pending owner device checks**, carried forward and not blocking the build. Each has a
   fallback if it fails:
   - The long-press edit menu shows Highlight, Note and Study (fallback: §3.3.5
     `UIMenuController`).
   - The Library sort menu commands fire (fallback: §7.9 toggle).
   - History's Clear menu fires (same mechanism, fallback in §8.3).
   - Listen continues when the screen locks, and the lock-screen controls work (§8.7).

### 8.10 CI for Round 3
- **Add a fourth demo group, `more`,** in `simulate.sh` and the workflow matrix (it runs in
  parallel with `read`, `study` and `notes`).
  - It seeds its own state through demo hooks: the John 3 marks from Round 1, the note, the
    blue Psalm 23:1 highlight, and the 8 history entries with fixed times.
  - It takes shots 60–84 in order. The accessibility shots 85–88 come at the end, after
    `content_size` is set.
- **Add the `store` group** (§8.9.7) and the iOS 18 job (§8.9.2).
- **Extend the transitions recording:**
  - **Sequence 7:** tap a heading reference, the preview rises, dismiss it; then a
    footnote popover, a reference in it, the popover fades, and the sheet rises.
  - **Sequence 8:** Listen at John 3:14, 10 s, with the wash advancing and one follow-scroll.
  - **Sequence 9:** Library → Highlights. Tap green, then All. The rows fade both ways.
- **Publish** `notes-export.md` with the screenshots.

### 8.11 Round 3 acceptance (summary)
Round 3 is approved when:
- The acceptance criteria of §8.1–§8.8 hold.
- The §8.9 items 1–7 are done (or, for 2 and 6, their gaps are explicitly reported).
- The transitions recording shows no abrupt change in sequences 7–9.
- No Round 1 or Round 2 shot regresses.

---

## 9. Round 4 specification: versions, and study resources

Rounds 1–3 are approved and on TestFlight as 1.0 (9) (a5ca7e46). Round 4 keeps every earlier
behavior unless this section explicitly replaces it. The owner decided on 2026-10-18 that
the app is **free forever**: no price, ads, in-app purchases or donation prompts, ever. That
is what makes the ESV possible (§9.4), and it's a constraint on every later round.

**Owner amendments (2026-10-18), after this section was written:**
1. **The server is `smoothbible.com`, not trailingwhite.space.** The ESV proxy's base is
   `https://smoothbible.com/api/v1/` (route `smoothbible.com/api/*`), and the web pages are
   `https://smoothbible.com/` and `https://smoothbible.com/privacy/`. Every address below
   is read with that change. Nothing is deployed yet; the owner has no Cloudflare set up.
2. **The app ships and is fully robust without that server.** The ESV appears in
   Versions, Compare and "Search the ESV" **only after the server has answered a cheap
   status request**, `GET /api/v1/status` → `{"ok":true,"esv":true}`, asked quietly in the
   background at most once a day and whenever the reading settings open; the answer is
   kept (`esvAvailable`). Until then the ESV simply isn't listed: no dead entries and no
   error states for testers. If someone was reading the ESV and the server later can't be
   reached, the calm offline state with "Read in the BSB" applies (§9.4.6). CI's fixture
   mode lists the ESV, so its screens are tested. (`/api/v1/status` replaces §9.4.2's
   `/health`, which stays as an alias.)
3. **Answers to §9.10:** the owner accepts the ESV terms (including the statement of
   faith) and the shared daily limit as the ceiling; the KJV ships everywhere, with the
   Crown-rights credit.

### 9.0 Priorities, order and decisions

| # | Item | Serves | Size |
|---|------|--------|------|
| R4.1 | One model for many texts; marks keyed by reference (§9.1) | Everything below | M |
| R4.2 | KJV, WEB, ASV and YLT bundled offline (§9.2) | Reading | M |
| R4.3 | Version picker, and switching in place (§9.3) | Reading | S–M |
| R4.4 | Compare (tray action, §9.5) | Reading and study | M |
| R4.5 | The ESV, online, through our own proxy (§9.4) | Reading | L |
| R4.6 | Cross references (openbible.info) in Study (§9.6) | Study | M |
| R4.7 | Matthew Henry's Concise Commentary in Study (§9.7) | Study | M |
| R4.8 | Acknowledgements, copyright page and privacy (§9.8) | Release | S |

Build in this order. R4.1–R4.4 need no network and no new server, so they can land and
be reviewed before the ESV.

**Decisions** (the designer's, with reasons):
1. **Bundle every public-domain version; download nothing.** Each converted text is about
   4.4 MB raw and 1.3 MB compressed. The four add about 18 MB installed and about 5.3 MB
   to the download, next to about 19 MB of study data already bundled. On-demand
   downloads would need hosting, a download UI, progress, failure states and storage
   management, all to save 5 MB. The simplest excellent thing is that every version
   works offline on first launch.
2. **The ESV is online only.** Crossway's terms allow at most 500 verses (or half a book,
   whichever is less) to be stored or shown on one page. The app holds a small rolling
   cache within that limit. The API key lives in a Cloudflare Worker, never in the app.
3. **The BSB stays the base.** It's the default, and the interlinear, word study,
   concordance, cross references, commentary and export all use the BSB's versification
   and words. Other versions change only what the reader shows.
4. **Versions chosen:** KJV, WEB, ASV and YLT, plus the ESV online. Darby and the LSV are
   left out:
   - **Darby** adds little that the ASV and YLT don't already give, for the same
     maintenance cost.
   - **The LSV** is CC BY-SA, not public domain. It would be legal to bundle, but the
     share-alike terms are a licence question we don't need to have.
   - Both can come later through the same pipeline at almost no cost.
5. **Study resources chosen:** openbible.info cross references (vote-ranked, and built
   from the Treasury of Scripture Knowledge, so they cover the TSK), and Matthew Henry's
   **Concise** Commentary (CCEL ThML). Left out:
   - Matthew Henry Complete: 15 MB, and the Concise is the same mind in a readable
     length.
   - JFB and Barnes: archaic, and verse-by-verse duplication of what MHCC already gives.
   - Easton's dictionary: lower value than the lexicons we already have.

   None of these uses SWORD. Every resource is converted by our own tool into our own
   format.

### 9.1 R4.1 One model for many texts

#### 9.1.1 Versification (verified)
The designer checked every candidate file against our `bsb.txt` (`/tmp/r4tools/vc.py`, to
be turned into a tool, §9.2.4):
- **Chapters:** eBible.org normalizes its English texts to one versification. KJV, WEB,
  ASV, YLT and Darby all have exactly the BSB's 66 books and 1,189 chapters, with the
  same chapter numbers: Malachi has 4 chapters, Joel 3, and psalm titles are unnumbered
  (D records) in all of them.
- **The chapter index `c`** (Genesis 1 = 0) is therefore the same in every bundled
  version.
- **Extra verses.** The other versions have all of the BSB's 31,086 verses, and some
  of the verses the BSB gives only in footnotes (Matthew 17:21, 18:11, 23:14; Mark 7:16,
  9:44, 9:46, 11:26, 15:28; Luke 17:36, 23:17; John 5:4; Acts 8:37, 15:34, 24:7, 28:29;
  and Romans 16:24). A verse a version itself gives only in a footnote is left out, as
  the BSB does (§9.10a, note 1; accepted in review r4-1):
  - **KJV and YLT:** all 16 (31,102 verses).
  - **WEB:** 12 of them, without Luke 17:36 and Acts 8:37, 15:34 and 24:7 (31,098, with
    the doxology at 14:24–26 below).
  - **ASV:** none of them (31,086): it footnotes all 16.
  - (Darby lacks Acts 8:37, 15:34 and Matthew 23:14.)
- **One placement difference:** the WEB puts the closing doxology at Romans 14:24–26 and
  has no Romans 16:25–27. The BSB, KJV and ASV have it at 16:25–27.
- **The ESV** follows the same English numbering, except:
  - **3 John 1:15**: the ESV's verse 15 is the end of the BSB's verse 14 ("Peace to
    you…").
  - **Revelation 12:18**: the ESV's "And he stood on the sand of the sea" is the end of
    the BSB's 12:17.
  - Like the BSB, the ESV omits the footnoted verses listed above.
  - The builder confirms this list with the real API once the key exists (§9.4.9).

#### 9.1.2 The rule
- **A mark** (highlight, bookmark or note) or a history entry **is a reference in BSB
  numbering**: `BOOK, chapter, verse`, as the files already store it (§4.3). Nothing in
  the files changes, so there's no migration of their format.
- **A mark shows in every version that has that reference.** It doesn't show in versions
  that don't, and it's never moved or dropped:
  - A bookmark on KJV Matthew 17:21 shows in KJV, WEB and YLT, not in the BSB or the
    ASV.
  - A highlight on BSB Romans 16:25 doesn't show in the WEB.
- **A version's own verse numbers are mapped at the record level** (§9.1.4). The only
  mapped verses are the ESV's 3 John 1:15 → 14 and Revelation 12:18 → 17. Selecting or
  marking the ESV's verse 15 marks reference 14, and both ESV verses 14 and 15 wash
  together.
- **Labels use the version's own numbers.** The tray, copy, share and Compare all do:
  "3 John 1:14–15" in the ESV, and "3 John 1:14" in the BSB.

#### 9.1.3 Store change (the one real migration)
- Today, `field_verse` (store.l8) rejects a verse above `ch_verses[c]`, the BSB's last
  verse. Romans 14:24–26 (WEB) would be dropped on the next launch.
- Replace that check with `ref_last(c)`: the highest verse number in any bundled version.
  It's the BSB's `ch_verses[c]`, raised by `data/refs.txt` (one line per chapter where a
  version exceeds the BSB, `ROM\t14\t26`; the tool writes it and, today, it has that one
  line).
- Add a `test_store.l8` case: `ROM 14 25` survives a reload, and `ROM 14 27` is skipped.
- **The Library, export, history and notes quote the verse** with:
  1. The current version's text, if it's offline and has the verse.
  2. Otherwise the BSB's text, if it has the verse.
  3. Otherwise the first bundled version that has it, in Versions order, with that
     version's abbreviation after the reference ("Matthew 17:21 · KJV", in faint).
  - The ESV is never used for these, because they're lists and files that persist
    beyond a page.

#### 9.1.4 `text.l8`: several texts, one layout
- **A text** is a buffer of records (the `bsb.txt` format) plus its index: `book_line`,
  `ch_start`, `ch_end`, `ch_verses`, and the verse offsets.
- Keep today's globals as **the current text**. Add `text_use(t)`, which swaps the
  globals' array references to text `t`'s. Arrays are references, so the swap is O(1).
  - `layout_chapter`, `verse_text`, search and `verse_at` stay unchanged.
  - Every caller that works on a text other than the reader's (Compare, the Library's
    quote rule, search under the ESV) wraps its work in `text_use(t)` … `text_use(cur)`.
- **Text ids:** 0 BSB, 1 KJV, 2 WEB, 3 ASV, 4 YLT, 5 ESV. The ESV's buffer is assembled
  from its cache (§9.4.5). Its chapters that aren't loaded have `ch_start = ch_end = -1`,
  and `layout_chapter` then lays out the **opener only**, plus a placeholder flag that
  the platform reads (§9.4.6).
- **Loading:** the BSB and the current version are indexed at launch, and any other
  version at first use. The launch job's time may grow by at most 40 ms over build 9.
  Load each file with the same open/read path as `load_text` (or `mmap`, as
  `ios_study.l8` does). Never load all five at launch.
- **New record types** (written by the converter, laid out by `text.l8`):
  - `I<text>`: supplied words (KJV and ASV `\add`), laid out like T but **italic**, as
    printed KJVs set them.
  - `J<text>`: supplied words inside the words of Jesus (italic, and red when red
    letters are on).
  - `V<n>>k`: verse n, **keyed as reference k** (only the ESV's two merged verses).
    `verse_num` holds n for display, and `verse_key` holds k for marks and selection.
    Two verses with the same key select, wash and mark as one.
- **Tests** (`test_text.l8`):
  - KJV John 3:16 lays out with "only begotten" as body text.
  - KJV Genesis 1:4 has an `I` run "it was".
  - KJV Matthew 17:21 exists, and the BSB has no verse 21 there (`verse_index` = -1).
  - A synthetic `V15>14` record selects with 14.
  - `ref_last` for ROM 14 is 26.
  - Switching texts and back leaves BSB John 3's layout byte-identical.

### 9.2 R4.2 Public-domain versions, bundled

#### 9.2.1 Sources (checked with curl on 2026-10-18; each is USFM in a zip)
| Abbr. | Name shown | eBible id | URL | sha256 (2026-10-18) | Licence |
|---|---|---|---|---|---|
| KJV | King James Version | `eng-kjv2006` (1769 text, protocanon) | `https://ebible.org/Scriptures/eng-kjv2006_usfm.zip` | `16b08c9248b3600662f66f1e055f61fc3a6c7275e347236ee45feb35dfb20cb3` | Public domain (Crown patent in the UK: see §9.10, question 2) |
| WEB | World English Bible | `engwebp` (WEB Updated, 66 books, "LORD") | `https://ebible.org/Scriptures/engwebp_usfm.zip` | `732c17d3325563fc5d8d98157a6c3d128c887f6b8e5a5ad0f71f58e5d5eebfcb` | Public domain; "World English Bible" is an eBible.org trademark, usable while the text is unchanged |
| ASV | American Standard Version | `eng-asv` (1901) | `https://ebible.org/Scriptures/eng-asv_usfm.zip` | `fa116257643253288c48a46f499faaaa501dfdd8381c78e1c67b745a9e1a999a` | Public domain |
| YLT | Young's Literal Translation | `engylt` (1898) | `https://ebible.org/Scriptures/engylt_usfm.zip` | `63ef17706cc59cdbf7921627a40dc819e59ae2903d6f85ab23efc49d6da723f2` | Public domain |

- **Note on updates:** eBible republishes these zips (ASV's file is dated today), so a
  sum will eventually fail. When it does:
  1. Rerun `make`.
  2. Review `git diff` of the made text.
  3. Update the sum in the same commit.
  - Never skip the check.
- `eng-kjv` (with the Apocrypha) and `eng-web` (the "Yahweh" Classic edition) are **not**
  used.

#### 9.2.2 Converter: `tools/usfm.py` replaces `tools/bsb.py`
1. Generalize `bsb.py` into `usfm.py VERSION USFM_DIR OUT`, with `VERSION` one of `bsb`,
   `kjv`, `web`, `asv` or `ylt`.
   - `bsb.py`'s FIXES and its psalm-title handling become the `bsb` profile.
   - **Acceptance:** `data/bsb.txt` comes out byte-identical to the committed file.
2. **Input:**
   - Only files whose `\id` is one of the 66 codes. Front matter, glossaries and
     introductions (`FRT`, `INT`, `GLO`, `\ip`, `\is1`, `\ib`, `\ili`, `\ide`) are
     skipped.
   - The book name comes from `\h`, with the existing `NAMES` overrides (Psalms, Song of
     Solomon) applied to all versions, so the openers read the same.
3. **Markers** (in addition to `bsb.py`'s):
   - Word markup: `\w text|strong="…"\w*`, and **nested `\+w … \+w*`** inside `\wj`
     (WEB) → the text only.
   - `\add … \add*` → `I` records (`J` inside `\wj`).
   - `\nd LORD\nd*` → the text uppercased (KJV's "LORD" is already caps).
   - `\qs Selah\qs*` → T text, preceded by a space.
   - `\sc`, `\bd`, `\it`, `\tl`, `\k` and `\bk` → their text only.
   - `\x … \x*` cross references → dropped. We have our own (§9.6).
   - `\f … \f*` → F, as now (`\fqa`, `\fq` and `\fr` handled by the existing cleanup).
   - Paragraphs:
     - `\pi1` and `\nb` → `m`. `\nb` continues the paragraph when it starts a chapter.
     - `\mi` and `\q3` → `2`.
     - `\qc` → `c`.
     - `\li1` → `l`.
   - Headings:
     - `\s1` → S.
     - `\ms1` → M.
     - `\sp` (speakers in the Song) → `s`.
     - KJV's epistle subscriptions (a `\s1` after a book's last verse, "The first epistle
       to the Corinthians was written…") → `s`.
     - KJV `\s1 \tl א ALEPH.\tl*` (Psalm 119) → `A` "ALEPH", like the BSB.
   - Unknown markers stop the tool with the file and the marker, as now.
4. **YLT has no paragraphs** (one `\p` per chapter): the `ylt` profile emits `Pm` before
   every verse, which is the printed YLT's own verse-by-verse layout.
5. **Output:** `data/kjv.txt`, `data/web.txt`, `data/asv.txt` and `data/ylt.txt`, in the
   `bsb.txt` format, in canonical book order.
   - About 4.4–4.6 MB each, about 18 MB together.
   - Add them to `ios/resources`, and commit them as `bsb.txt` is.

#### 9.2.3 What each version looks like (expected; the screenshots check it)
| Version | Headings | Footnotes | Words of Jesus | Notes |
|---|---|---|---|---|
| KJV | Few: Psalm 119 letters and the epistle subscriptions | Marginal notes (~6,960, "Heb. between the light…") | Yes | Italic supplied words; paragraphs from the ¶ marks |
| WEB | None (the WEB has no section headings) | ~1,230 | Yes | Poetry at two levels |
| ASV | None | ~16 | No | "Jehovah" in the OT, as printed; italic supplied words |
| YLT | None | None | No | One verse per line |

- **Psalm titles** (D) appear in KJV, WEB and ASV as in the BSB.
- Where a version has no headings, the Section Headings switch simply has nothing to
  hide.
- **Red letters:** when the current version has no W records (ASV, YLT), the Show
  section's footer says "The ASV doesn't mark the words of Jesus." (or "The YLT…"). The
  footer fades with the section reload when the version changes.

#### 9.2.4 Tools
- **`fetch.sh DIR make`** downloads the four zips (into `DIR/ebible/<id>/`, each in its
  own empty directory), checks them against the sums above, and runs `usfm.py` for each
  version.
- **`tools/versify.py`** (`python3 -I`) compares every version's chapter and verse sets
  with the BSB's:
  - It prints the extra and missing verses (the list in §9.1.1 is what's expected).
  - It writes `data/refs.txt`.
  - It fails if any version's chapter list differs from the BSB's.
  - The commit message includes its output.

### 9.3 R4.3 Version picker, and switching in place

#### 9.3.1 Where it lives
**Reading settings (Aa) gets a new first section, "Version"**, above Listen.
- Choosing a translation is a reading setting. Like a theme or a font, it's seen applied
  live behind the medium-detent sheet. It doesn't earn a permanent control on the page,
  which keeps the page distraction-free.
- The bar stays Search · title · Library · Aa.

**The section:** one `UITableViewCellStyleValue1` row:
- Label "Version", ink.
- Value: the abbreviation ("BSB"), faint.
- Disclosure indicator.
- Accessibility label "Version, Berean Standard Bible", hint "Choose a translation".
- The section footer (SF 12, faint, system footer): "Study, the interlinear and the
  concordance always use the BSB."

#### 9.3.2 Versions screen (pushed in the settings sheet)
- A run-time UITableViewController, insetGrouped, with the §3.7 sheet background rules.
- Inline title "Version". Done stays on the right, as on the settings root.

| Section header | Rows (subtitle cells: title = full name in SF 17, ink; secondary = SF 13 faint) |
|---|---|
| On This iPhone | **Berean Standard Bible** · "BSB · Modern, word-for-word and readable" |
| | **King James Version** · "KJV · 1769 · The Authorized Version" |
| | **World English Bible** · "WEB · Modern, public domain" |
| | **American Standard Version** · "ASV · 1901" |
| | **Young's Literal Translation** · "YLT · 1898 · Very literal" |
| Online | **English Standard Version** · "ESV · Needs an internet connection" |

- The Online footer: "The ESV comes from Crossway's ESV API. Only the chapters you're
  reading are kept on this iPhone."
- **The checkmark** (`UITableViewCellAccessoryCheckmark`, accent) marks the current
  version.
- **Tapping a row:**
  - It switches the version **immediately**: the reader behind the sheet cross-fades
    (§9.3.3).
  - It moves the checkmark: deselect animated, and reload the two rows with
    `UITableViewRowAnimationNone` inside a 0.15 s `CATransition` fade.
  - It stays on this screen, as iOS Settings lists do.
  - It gives a selection haptic.
  - Back returns to Reading settings, whose Version value now reads the new
    abbreviation (set in `viewWillAppear:`, so it's never seen changing).
- Persisted as `version` (a string: BSB, KJV, WEB, ASV, YLT or ESV). The default is BSB.
- Accessibility: each row reads "King James Version, KJV, 1769, The Authorized Version",
  plus the selected trait.

#### 9.3.3 Switching in place (motion)
1. Take the place: `(chapter, verse key, fraction into verse)`, as for a size change (§0.5
   item 3).
2. Set the current text, then rebuild and reload the table (heights change).
3. Restore the same verse at the same distance below the bar. If the verse doesn't exist
   in the new version, use the nearest earlier verse that does. If the chapter isn't
   loaded (ESV), restore to the placeholder row's top; the place follows when the text
   arrives (§9.4.6).
4. The visible change is a **0.25 s cross-fade** of the table's layer (`CATransition`
   fade, set before the reload), exactly as for red letters (§8.8). The text never slides
   or jumps.
5. With Reduce Motion, use the 0.15 s cross-fade.
6. Selection is cleared, and the tray (if up) leaves with its spring before the switch.
7. If Listen is playing, it stops at the end of the current utterance and resumes in the
   new version from the same verse.

There's **one place for all versions**. There's no per-version place, because the
reference is the place.

#### 9.3.4 Elsewhere
- **Copy and share** suffix the version: "John 3:16 KJV" (§3.3.6 already ends with
  "BSB").
- **The passage picker's** "Go to John 3:16" row shows the opening words from the current
  version (the BSB under the ESV).
- **The edit menu's Study** (a word) appears **only in the BSB**, because a KJV word
  can't be mapped to the BSB's tokens. In other versions the tray's Study (a verse) is
  the way.
- **Search** searches the current offline version (§9.4.8 for the ESV). The results
  header reads "348 verses in the KJV" (it always names the version, including "in the
  BSB").
- **Previews** (§8.1) render in the current version. Under the ESV, they fetch the
  chapter (§9.4.7).
- **Listen** speaks the current version, and the Now Playing artist is the version's full
  name.
- **Export** keeps quoting by the §9.1.3 rule. Its header line names what it quotes:
  "Berean Standard Bible · exported …", or "King James Version · exported …".

### 9.4 R4.5 The ESV, online

#### 9.4.1 Terms we build to (api.esv.org, read 2026-10-18)
1. Non-commercial use only. A free-forever app with no ads, purchases or donation
   requests qualifies. Use in mobile apps is permitted without asking, provided every
   condition is met.
2. At most **500 verses or half a book, whichever is less**, per query; per page shown;
   and stored. Single- and two-chapter books are excepted for queries.
3. At most **5,000 queries a day, 1,000 an hour and 60 a minute**, for the key (that is,
   for all of our users together).
4. The ESV copyright notice on a copyright page. Passages identified as ESV, and any
   notice sent with the text shown. **Every page using the text links to
   www.esv.org.**
5. No change to the wording (features like headings, footnotes and verse numbers may be
   omitted).
6. The key is never published or shared.
7. Use consistent with Crossway's statement of faith (the owner's own call: §9.10,
   question 1).

#### 9.4.2 The proxy: `programs/bible/worker/` (Cloudflare Worker `smooth-bible-api`)
Files:
- `worker.js` (ES module, no dependencies).
- `esv.js` (the HTML→records converter, a pure function, also imported by tests).
- `wrangler.toml`.
- `schema.sql`.
- `test.mjs` (`node --test`).
- `fixtures/` (§9.4.10).

Its configuration follows `web/tempo-log` in the main repo:
```toml
name = "smooth-bible-api"
main = "worker.js"
compatibility_date = "2026-10-01"
routes = [{ pattern = "smoothbible.com/api/*", zone_name = "smoothbible.com" }]
workers_dev = false
[[d1_databases]]
binding = "DB"
database_name = "smooth-bible-api"
database_id = "(made at deploy)"
[[ratelimits]]          # per client address
name = "PER_IP"
namespace_id = "1101"
simple = { limit = 30, period = 60 }
# Secret: ESV_KEY (wrangler secret put ESV_KEY). Var: UPSTREAM = "https://api.esv.org" (tests point it at a mock).
```
`schema.sql`: `CREATE TABLE usage (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL);`

**Endpoints** (all GET; every response is JSON with `Cache-Control: no-store`; nothing is
cached by Cloudflare, and nothing is stored but the counters):

1. **`/api/v1/esv/chapters?book=JHN&chapter=3&count=2`**
   - **Validation:** `book` must be one of the 66 codes, `chapter` must be within the
     book, and `count` must be 1 or 2.
   - **Limits:** if the requested chapters exceed 500 verses, or half the book's verses
     in a book of more than 2 chapters, `count` is reduced to 1. It's never an error.
     The Worker carries the 1,189 chapter verse counts (`versecounts.js`, generated from
     `bsb.txt` with the ESV's two extra verses).
   - **Upstream:** `GET {UPSTREAM}/v3/passage/html/?q=<Name C[-C2]>` with
     `Authorization: Token {ESV_KEY}` and these options:
     `include-passage-references=false`, `include-verse-numbers=true`,
     `include-first-verse-numbers=true`, `include-footnotes=true`,
     `include-footnote-body=true`, `include-headings=true`, `include-subheadings=true`,
     `include-short-copyright=true`, `include-copyright=false`,
     `include-passage-horizontal-lines=false`, `include-heading-horizontal-lines=false`,
     `include-selahs=true`, `include-css-link=false`, `inline-styles=false`,
     `wrapping-div=false`, `include-book-titles=false`, `include-verse-anchors=false`,
     `include-chapter-numbers=true`, `include-crossrefs=false`,
     `include-surrounding-chapters=false`, `include-surrounding-chapters-below=false`,
     `include-audio-link=false`.
     - HTML, not text, because it keeps poetry lines, indents, headings, psalm titles,
       the words of Christ and footnote placement as structure. The text endpoint
       encodes them as spaces.
   - **200 response:**
     `{"v":1,"version":"ESV","notice":"(ESV)","chapters":[{"book":"JHN","chapter":3,"verses":36,"records":"S…\nPm\nV1\nT…"}]}`
     - `records` is exactly the `bsb.txt` record format (§9.4.3), so `text.l8` lays it out
       unchanged.
     - `notice` is the short copyright the API sent ("(ESV)"), which the app shows
       (§9.4.6).
2. **`/api/v1/esv/search?q=born%20again&page=1`**
   - Upstream: `/v3/passage/search/?q=…&page-size=100&page=…`.
   - Response:
     `{"v":1,"total":12,"page":1,"pages":1,"results":[{"book":"JHN","chapter":3,"verse":3,"key":3,"text":"…"}]}`.
     The Worker parses each `reference` ("John 3:3") into codes and applies the two
     mappings to `key`.
   - The query is at most 100 characters; anything longer is a 400.
3. **`/api/v1/status`** → `{"ok":true,"esv":true}` (`esv` is whether the key is set; owner
   amendment 2; `/api/v1/health` is the same). It makes no upstream call.

**Limits, in order:**
1. `PER_IP` (30 a minute, keyed by `CF-Connecting-IP`).
2. A global budget in D1, kept under the terms with headroom: **55 a minute, 950 an hour
   and 4,800 a day** (UTC), counted for every upstream call.
   - One statement upserts `m:YYYY-MM-DDTHH:MM`, `h:YYYY-MM-DDTHH` and `d:YYYY-MM-DD`,
     and returns the counts. Buckets older than 2 days are deleted by the first request
     of each day.
3. A request must carry the header `X-Smooth-Bible: <version> (<build>)`. Without it, the
   Worker returns 400. This isn't security; it stops casual reuse.

**Error shapes** (always JSON `{"error":"<code>","message":"<English>","retry":<seconds or 0>}`):
| Status | `error` | When | App state |
|---|---|---|---|
| 400 | `bad_request` | Bad book, chapter, count, or a missing header | A bug: the "unavailable" state, and logged in demo |
| 429 | `slow_down` | `PER_IP` exceeded; `retry` = 60 | Busy (§9.4.6) |
| 429 | `busy` | Global minute or hour budget spent; `retry` = seconds to the next bucket | Busy |
| 503 | `daily_limit` | Global day budget spent; `retry` = seconds to 00:00 UTC | Resting for today |
| 502 | `upstream` | ESV answered non-200 (its own 429 maps to `busy`) | Unavailable |
| 504 | `timeout` | No upstream answer within 8 s | Unavailable |

- **Privacy:** the Worker logs nothing of its own (no `console.log` of queries or
  addresses). `[observability]` is off. The ratelimit binding holds addresses only for
  its 60 s window.
- **Residual risk (accepted):** anyone who reads the app's traffic could call the proxy.
  The per-address limit and the global budget keep it within Crossway's terms whatever
  happens. If abuse appears, the next step is App Attest, which needs the block shim of
  §10.

#### 9.4.3 Converter: ESV HTML → records (`esv.js`)
A tolerant tag scanner over the API's known output (no DOM library in Workers):
| ESV HTML | Record |
|---|---|
| `<b class="chapter-num">3:1 </b>` | `C3` (when a request spans two chapters; the first chapter's C is implicit), then `V1`. The number text is dropped |
| `<b class="verse-num">16 </b>` | `V16`. For 3JN 1:15 → `V15>14`; for REV 12:18 → `V18>17` |
| `<h3>` (section heading) | `S` |
| `<h4 class="psalm-title">`, `<h4 class="speaker">` (and other `h4` subheadings: `psalm-acrostic-title` → `A`) | `D` for psalm titles; `s` for speakers and other subheadings |
| `<h3 class="psalm-book">` (BOOK ONE) | `M` |
| `<p>` / `<p class="…">` prose | `Pm` (the first in a chapter `Po` if it follows a heading, as the BSB does) |
| poetry `<p class="block-indent">` with `<span class="line">` and `<span class="indent line">` (and `indent-2`) | `P1` / `P2` per line |
| `<span class="woc">` | W records for its words |
| `<span class="divine-name">Lord</span>` | "LORD" in T (small caps are drawn by `text.l8` as today) |
| `<span class="selah">` | T text |
| `<sup class="footnote"><a href="#fN">` | F, with the body from the `footnotes` block's matching `fN` entry, without its "3:3" reference prefix |
| `<p>(<a class="copyright">ESV</a>)</p>` | Not a record. Its text is returned as `notice` |
| `&nbsp;`, entities, `<br>` | Decoded; spacing as `bsb.py`'s tidy rules |

- **Wording:** every word in the HTML's text nodes is kept, in order. **The converter
  never edits words.** The test asserts that the concatenated T/W text equals the HTML's
  visible text minus verse numbers, headings and footnotes.
- **Verification:** the builder confirms the class names against the first real
  responses, once the key exists, and adjusts only the scanner and the fixture structure.
  Real ESV HTML is **never committed**.

#### 9.4.4 App networking (no blocks)
- **Session:** `NSURLSession sessionWithConfiguration:delegate:delegateQueue:` with a
  run-time delegate class `L8Net`, and `delegateQueue` = `NSOperationQueue mainQueue`, so
  every callback is on the main thread.
- **Configuration:** `ephemeralSessionConfiguration` (no disk cache, no cookies),
  `timeoutIntervalForRequest` 12, `requestCachePolicy` = 1 (reload, ignoring the local
  cache), `URLCache` nil.
- **Tasks:** `dataTaskWithRequest:` (the form without a completion block), then `resume`.
  - The delegate implements `URLSession:dataTask:didReceiveData:` (append to an
    `NSMutableData` kept per task) and `URLSession:task:didCompleteWithError:`.
  - On completion it reads `task.response.statusCode` and parses with
    `NSJSONSerialization JSONObjectWithData:options:error:`.
  - Don't implement `didReceiveResponse:completionHandler:`; the default allows the
    response.
- **Base URL:** `https://smoothbible.com/api/v1/` (owner amendment 1). Header
  `X-Smooth-Bible: 1.0 (12)` (from the bundle).
- **One chapter request in flight at a time.** A newer wanted chapter replaces a queued
  one. A running one is never cancelled, because its result is still useful.
- **Fixture mode (CI, §9.4.10):** when the environment has `L8_ESV_FIXTURE` (a path
  relative to the app's home), the client reads `<path>/<BOOK>-<C>.json` (or
  `search-<q>.json`) after a delay the demo sets (default 0.6 s), instead of using the
  network. `<path>/mode` (`ok`, `offline`, `busy` or `daily`) makes it answer with that
  error instead.

#### 9.4.5 The cache: never more than the terms allow
- **Where:** `Library/Caches/SmoothBible/esv/`. It's the system's purgeable place and
  isn't backed up. One file per chapter, `JHN-3.txt` (the records), plus `index.tsv`
  (`BOOK\tC\tVERSES\tFETCHED\tUSED`).
- **Rules,** checked after every insert:
  1. **Total ≤ 500 verses**, counting everything the reader holds: disk and memory.
  2. **Per book ≤ ⌊book's verses / 2⌋.**
  3. A chapter that can't fit rule 2 even alone (a one- or two-chapter book, such as
     Jude, Philemon or Haggai 2) is **held in memory only while it's on screen**, never
     written to disk, and dropped when the reader leaves it.
  4. **Evict least-recently-used chapters first** (`USED` is updated whenever a chapter
     is shown). Chapters visible now, or in the reader's ±1 neighbours, are pinned.
  5. **Entries older than 30 days are refetched,** as Crossway encourages.
- **Prefetch:** when the reader comes to rest in ESV chapter c and c+1 isn't held,
  request `count=2` starting at c (or `count=1` for c+1 if c is held). Scrolling up into
  c−1 requests it. Nothing else is prefetched. **Superseded by §9.4.11** (owner report
  2026-10-18): the window is c−1..c+2, asked for as a fling begins, not only at rest.
- **Demo log:** `bible: esv cache N verses (JHN 3, JHN 4, …)` after every change.
- **Tests:** the eviction logic is portable `esv_cache.l8`, tested by `test_store.l8`:
  - Visiting 14 Gospel chapters in a row never exceeds 500.
  - Jude is never written.
  - Ruth never holds more than 42 verses.
  - The pinned chapters survive eviction.

#### 9.4.6 The reader under the ESV (states and motion)
- **Loaded chapter:** laid out like any version. At the end of the chapter, after the last
  verse, comes one centered **footer line**, 0.7 em, 24 pt above it:
  - "(ESV) · esv.org", with "(ESV)" in faint and "esv.org" in accent.
  - Tapping "esv.org" (± 12 pt) opens `SFSafariViewController` at
    `https://www.esv.org/<Book>+<C>/` (for example `https://www.esv.org/John+3/`).
  - This one line meets "identify the passage", "show the notice sent" and "link to
    esv.org on each page", for each chapter shown.
  - Accessibility: "ESV. Link: esv.org".
- **Not yet loaded:**
  - The row shows the chapter's **opener** (book label and numeral, from our own data),
    then 48 pt below it a `UIActivityIndicatorView` (medium, color faint). The spinner
    fades in over 0.2 s **only after 0.4 s**, so fast loads never flash it.
  - The row's height is the **BSB's laid-out height of the same chapter**, so the scroll
    position is believable before the text comes.
  - When the text arrives:
    - Rebuild the row's text with a 0.2 s cross-fade (`CATransition` on the text view's
      layer).
    - If the row lies above the reading place, change `contentOffset` by the height
      difference **in the same layout pass**, so no visible line moves (principle 6).
      **Only at rest:** while the table moves, §9.4.11 decides (no offset is written).
    - If the user was waiting at a jump target, restore the jump's verse one third down,
      and flash it.
- **Offline** (the fetch failed with no connection or a timeout):
  - The spinner cross-fades to a centered message, body font 0.9 em, faint, line height
    1.35: "The ESV needs an internet connection." Below it, links in accent: "Try Again ·
    Read in the BSB".
  - **Try Again** refetches. **Read in the BSB** switches the version (§9.3.3) at the
    same place.
  - It retries automatically when the app becomes active, and every 30 s while the row
    is visible (one timer).
- **Busy** (429): "Many people are reading the ESV just now. It will try again in a
  minute." with "Read in the BSB". It retries after `retry` seconds.
- **Resting for today** (`daily_limit`): "The ESV has reached its daily limit for Smooth
  Bible. It will be back tomorrow." with "Read in the BSB". No automatic retry until
  `retry` passes.
- **Unavailable** (400, 502): "The ESV isn't available right now." with "Try Again ·
  Read in the BSB".
- **No alerts, badges or banners.** The message sits in the page where the text would be,
  calm and in the reader's own type.
- **Marks, selection, notes, copy and Listen** work on loaded ESV text exactly as in any
  version.
  - Listen fetches the next chapter at the chapter end. If that fails, it stops with the
    mini player reading "Paused · Offline".
  - Copy and Share say "John 3:16 ESV". A selection is at most one chapter, which is well
    inside the redistribution limit.

#### 9.4.7 Previews, Compare and Study under the ESV
- **Previews** fetch their chapter(s) with the same client, and the result is cached by
  the same rules. While loading, the preview shows the spinner centered.
  - If the fetch fails, the preview shows the passage **in the BSB**, with a faint first
    line: "Shown in the BSB. The ESV needs a connection."
  - The ESV footer line ends every ESV preview.
- **Compare** (§9.5) has its own ESV section states.
- **Study:** the interlinear stays BSB-aligned and says so (§9.6.2). Cross references and
  commentary are BSB-numbered and shown in the BSB when the current version is the ESV.
  The References footer says "Verses shown in the BSB."

#### 9.4.8 Search under the ESV (decided)
- **The search sheet searches the BSB offline**, instantly, as it does today. Results go
  to the reader, which is in the ESV. The header reads "348 verses in the BSB".
- **The last row** of the results (or the only row, under "No Results") is an accent text
  row: "Search the ESV for “born again”" (`globe`).
  - Tapping it makes **one** search request (100 results a page).
  - It replaces the section with the ESV results: header "12 verses in the ESV", the
    same result cells with our matcher's bold applied to the ESV snippet, and a section
    footer "(ESV) · esv.org" (link).
  - **One page at a time** (review r4-1): the API's page of 100 replaces the section, so
    no more than 100 ESV verses are ever shown at once (§9.4.1 item 2). After the first
    page, the first row is "Previous Results"; if there are more pages, the row after
    the last result is "Show More". Both are accent text rows, centered, and each
    reloads the section with the 0.2 s fade and scrolls to its top.
  - "(ESV) · esv.org" is the section's **last row** (not a footer, which would float
    over the results in a plain list), after the last result.
  - Errors show as the row's secondary text, in faint: "No connection", "Busy, try again
    in a minute" or "Resting for today".
- **Why not live ESV search:** the debounce-as-you-type design would spend the shared
  5,000-a-day budget on keystrokes. An explicit tap costs one request per search, and the
  offline BSB search stays instant and complete. ESV results are shown, never stored.

#### 9.4.9 Versification check (builder, once the key exists)
`tools/esv_versify.py` (run by hand, through the deployed proxy, with the owner's
consent):
- It requests these chapters with `count=1`: 3JN 1, REV 12, REV 13, ROM 16, 2CO 13, ACT
  19, MAL 4, JOL 2, JOL 3, PSA 51, NEH 4, DAN 4, NUM 16, MAT 17, MRK 9 and LUK 17.
- It compares their verse sets with the BSB's, and prints the differences. The expected
  ones are the two mapped verses and none other.
- It keeps no text.
- If others appear, add them to the mapping in `esv.js` and to the Worker's verse
  counts, and say so in the commit.

#### 9.4.10 Fixtures and tests (no key in CI, no ESV text in the repo)
- **`worker/fixtures/*.html`** are hand-written in **the ESV API's HTML structure**:
  - The same tags and classes as §9.4.3, with **WEB words** (public domain).
  - Their first heading reads "Fixture: …", so no screenshot can be mistaken for real
    ESV text.
  - Chapters: JHN 3, JHN 4, PSA 23, GEN 1, 3JN 1 (with a verse 15, to exercise
    `V15>14`), and REV 12 (with an 18).
  - Plus `search-born-again.json`, in the upstream search shape.
- **`node --test programs/bible/worker/test.mjs`** (added to the Linux CI job):
  - The converter turns each fixture into the expected records
    (`fixtures/*.records`), and the words-unchanged assertion passes.
  - With `UPSTREAM` pointed at an in-test mock `fetch`:
    - Each limit gives its error code.
    - `count` is reduced for Joel 2–3.
    - Missing headers give 400.
    - The day bucket reset works.
    - Responses carry `no-store`.
- **`worker/make_fixtures.mjs`** runs the converter over the fixtures and writes the
  app's fixture JSON to `programs/bible/ios/esv-fixture/` (committed, WEB text).
  `simulate.sh` copies that directory into the app's data container (`xcrun simctl
  get_app_container … data`) under `Library/esv-fixture`, and launches with
  `SIMCTL_CHILD_L8_ESV_FIXTURE=Library/esv-fixture`.

#### 9.4.11 Scrolling through chapters that haven't arrived (owner report 2026-10-18)
**The report** (a real iPhone, the ESV live): "sometimes the scrolling stops suddenly, I'm
assuming because the verses below aren't loaded yet." A flick through the ESV loses its
momentum at once.

**Measured:** the proxy answers `chapters?…&count=2` in 0.43–0.57 s from a wired laptop
(TLS about 0.08 s of it; the rest is the ESV API). On a phone, expect 0.6–1.5 s. A fling
lasts 1–3 s, so an answer often lands while the table is still gliding.

**Causes found in the code (as of 7f98edbd):**
1. **Every arrival writes the scroll position.**
   - `esv_arrived` (`ios_esv.l8:654–694`) always ends in `go_place(pc, pv, pf)` (line 682),
     or in `go_place`/`go_verse` for a waiting switch or jump (677, 680).
   - `go_place` → `go` (`ios.l8:788–803`) calls `scrollToRowAtIndexPath:…animated:NO`
     twice, then `set_offset` (`ios.l8:805–812`) calls `setContentOffset:animated:NO`
     twice more.
   - Either call stops UIScrollView's deceleration on the spot. It does this even when
     the chapter that came is off screen below, where no offset change is needed at all.
     **This is the stop the owner sees.**
2. **Requests start too late, so answers come mid-fling.**
   - The reader asks for a chapter only when its placeholder cell is made
     (`chapter_cell` → `esv_row_shown`, `ios.l8:593`, `ios_esv.l8:643–648`), that is, once
     it's already on screen, or at rest (`reader_rested` → `esv_reader_wants`,
     `ios.l8:1007`).
   - So in a fling, the request starts when the blank row scrolls in, and its answer
     arrives about 0.5–1.5 s later, while the table is still moving: exactly when cause 1
     does harm.
3. **The work at an arrival is heavy, on the main thread, mid-scroll** (hitches, not the
   stop, but they make it feel worse).
   - `esv_take` → `esv_build` (`ios_esv.l8:531`, `esv_cache.l8:280`) rebuilds all of
     text 5.
   - `esv_refresh_others` (`ios_esv.l8:699–707`) re-sets the attributed text of every
     visible ESV row.
   - `beginUpdates`/`endUpdates` (671–672) re-measures every visible self-sizing row.
   - A placeholder's first appearance also lays out the **BSB** chapter twice, to measure
     it (`esv_placeholder` → `esv_bsb_height`, `ios_esv.l8:921–989`, from inside
     `chapter_cell`).
4. **The placeholder's height is close, but not equal.**
   - It's the BSB chapter's UILabel height (`ios_esv.l8:939`). The filled row is the
     ESV's own wording **plus the footer line**: 0.7 em at 1.35, plus 24 pt, about 40 pt
     that the placeholder never includes.
   - So every fill changes the row's height. Cause 1's correction is then a visible
     jump, or else (without it) a shift.
   - (Ruled out: the content doesn't run out. Every chapter has a row, as tall as the
     BSB's, and nothing calls `reloadData` on arrival.)

**The rule:** **while the reader's table is moving, nothing writes its `contentOffset`,
calls `scrollToRow…`, or reloads it.**
- "Moving" means `isTracking || isDecelerating || demo_moving`, as `inset_changed`
  (`ios.l8:735`) already checks.
- One helper, `reader_moving()`, is used by every path below. `set_offset` and `go` add a
  demo-log counter, `bible: offset written while moving N`, incremented when either is
  called while `reader_moving()`; CI requires it to stay 0.

**1. Prefetch: ask early, for where the reader is going.**
- **The window:** a chapter wanted is any in **L−1 … L+2**, where L is the landing chapter.
  Ask in this order, one request in flight (as now), with `count=2` wherever the server
  allows (it reduces to 1 by itself):
  1. L (with L+1),
  2. L+1 (with L+2),
  3. L+2,
  4. L−1 (`count=1`).
  Skip a chapter already held, and skip one that fails rule 2 of §9.4.5 alone
  (`esv_too_big`: those are asked for only while on screen, as now).
- **When it's asked:**
  - **At the end of a drag that will glide:** implement
    `scrollViewWillEndDragging:withVelocity:targetContentOffset:` (type
    `v@:@{CGPoint=dd}^{CGPoint=dd}`). Read the target's y (the CGPoint the third argument
    points to; read it, never write it). L is the row at `target.y + top_inset + 1`
    (`indexPathForRowAtPoint:`; if nil, the last visible row). The request then starts
    1–3 s before the table lands.
  - **At rest** (`reader_rested`): L = `cur`.
  - **After each arrival** (`esv_next`): the next missing chapter of the same window.
- **The queue:** replace the single `esv_queued` with "recompute the next wanted chapter
  from the current window when the client is idle". The newest window always wins, so a
  fling past ten chapters never queues the ten.
  - `esv_row_shown` still asks for a visible placeholder (a jump or a link can land
    anywhere), but it goes through the same window logic.
- **Limits on the client** (inside the server's 30 a minute per address):
  - At most **20 chapter requests in any 60 s** (a ring of 20 start times). Past that,
    only a chapter on screen is asked for.
  - `esv_hold_until` (busy, resting) is honoured, as now.
  - With `count=2`, reading costs about one request per two chapters, as before. Only
    the two ahead are speculative.
- **The cache (§9.4.5, portable, in `esv_cache.l8`):**
  - `esv_pinned` widens from lo−1..hi+1 to **lo−1..hi+2**, the window.
  - A prefetch (any chapter not on screen) is made only if
    `esv_room_for(c)`: inserting it would not, under rules 1 and 2, evict a chapter in
    lo−1..hi+1. If it would, that prefetch is skipped, never forced.
  - So in Ruth (42 verses at most), with chapter 2 on screen, chapter 3 may come but
    chapter 4 doesn't. In John, the window is about 200 verses, well inside 500.
  - **Tests** (`test_store.l8`, added):
    - Prefetching through 14 Gospel chapters never exceeds 500.
    - Prefetching in Ruth never evicts the visible chapter.
    - A two-chapter book's chapter is never prefetched.
    - The widened pin survives eviction.

**2. Placeholders the size of the text.**
- **Height:** the pad becomes the BSB chapter's height **plus the ESV footer's height**
  (measured once per em and width by `esv_height_of` on a footer string), minus the
  opener's height.
- **Learned ratio:** then scale the part below the opener by `esv_ratio`, the mean of
  (ESV text height ÷ BSB text height) over the chapters filled so far. Start at 1.0, keep
  it in defaults, and clamp it to 0.9–1.1. It's updated at each fill from the two heights
  the code already has.
- **The goal:** the fill changes the row by a few lines at most, not by a footer plus a
  translation's difference.
- **Measuring off the fling:** measure the BSB height when the chapter is **asked for**
  (at drag end or rest, from the window), not in `chapter_cell`. A placeholder made in a
  fling then finds `esv_h[c]` ready. If it isn't ready (an unprefetched jump), measure it
  then, as now.
- **The demo log:** `bible: esv row c placeholder H0 filled H1` at each fill, so the
  error can be read.

**3. A chapter arriving, swapped in without touching the scroll.**
`esv_arrived(c)` does this in place of what it does now:
1. **Always, at once:**
   - Hold the chapter and rebuild text 5, as now. Then tell Compare, previews and Listen.
   - **Defer `esv_refresh_others` until rest** (nothing can be tapped mid-fling; the
     other rows' text is unchanged words).
2. **Row c not visible** (not in `indexPathsForVisibleRows`):
   - Do nothing to the table now. Below the viewport, the row sizes itself when it's
     made.
   - **Above** the viewport, its cached height is stale. Add c to `esv_pending_above` for
     the rest step.
3. **Row c visible, its top at or below the reading top**
   (`row_y(c) ≥ offset + top_inset`):
   - Set the text in place with the 0.2 s cross-fade (`fade_layer` + `setAttributedText:`,
     as now), then `esv_dress`.
   - Then apply the height:
     - **Moving:** `beginUpdates`/`endUpdates` inside `setAnimationsEnabled:NO`. Only
       content below row c's top moves, the offset isn't touched, and the deceleration
       continues.
     - **At rest:** the same, with animations **on** (the system's own row-height
       animation), so a following opener on screen glides by the small difference, not
       jumps (principle 6).
   - **No `go_place`.**
4. **Row c visible, its top above the reading top** (the reader is in it, or past it):
   - **Moving:** put c in `esv_pending_visible`. The row keeps its opener and spinner
     until rest (the spinner was already showing, so nothing appears to stop).
   - **At rest:** do what `esv_arrived` does today. Measure the place, then cross-fade,
     then `beginUpdates`/`endUpdates` with animations off, then `go_place(pc, pv, pf)` in
     the same layout pass, so no visible line moves.
5. **Rest** (`reader_rested`, and `scrollViewDidEndScrollingAnimation:` for an animated
   jump):
   - First, `measure_place()`.
   - Then, for every chapter in `esv_pending_visible` and `esv_pending_above`, with
     animations off: re-set the visible ones' text (cross-fade) and call
     `beginUpdates`/`endUpdates` once. For the rows above, the table re-queries their
     heights in this update, and the visible rows' heights are taken from their cells.
   - Then one `go_place(pc, pv, pf)`.
   - Then `esv_refresh_others`, then the window's next request. Clear both lists.
6. **Waiting places:**
   - `esv_wait_c`/`esv_jump_c` (a switch to the ESV, or a jump, waiting for its chapter)
     are **cleared in `scroll_began`**. Once the reader scrolls, they've moved on, and the
     arrival must not pull them back.
   - Without a drag, they're honoured as now, at rest.

**4. Calm (principle 6):**
- Text appears by the same 0.2 s cross-fade. A placeholder never jumps under a finger.
- A height difference below the reading line is the system's row animation at rest, and
  unseen motion in a glide.
- A difference above it is compensated exactly, and only at rest.
- The spinner rules (0.4 s delay) are unchanged.
- With prefetch, most chapters are held before their row is seen, so in practice the
  reader rarely sees a placeholder at all.

**5. CI check (fixture mode; `simulate.sh` step and `demo_sequence` 7):**
- **Setup:**
  - Empty the ESV cache.
  - Set `esv_fixture_delay` to 1.0 s. The fixture needs JHN 3–8; add JHN 5–8 to
    `worker/fixtures` in WEB words.
  - Switch to the ESV at John 3:1 and wait for it to land.
- **The glide:** frame-driven, like sequence 1.
  - It drags 300 pt over 10 frames, then glides with a decaying step (starting at
    40 pt a frame, ×0.97 a frame, for 150 frames), with `demo_moving = true` throughout.
  - The glide passes through John 4–6 while their answers arrive.
  - Each frame logs `bible: glide y Y`. At each arrival, it logs
    `bible: esv arrived c moving 1 visible V above A`.
- **Checks** (in `simulate.sh`, on `console.txt`):
  1. `offset written while moving` is 0.
  2. Every frame-to-frame step of `glide y` equals the commanded step within 0.5 pt (so
     nothing moved the content under the glide).
  3. A request for JHN 5 (the second of the window) is logged **before** row JHN 5 is
     first visible.
  4. After rest, `esv fixed line before/after` (the existing check) agree within 1 pt.
  5. The cache summary never exceeds 500.
  6. `esv row … placeholder H0 filled H1` is logged, informational: |H1−H0|/H0 for the
     fixture.
- **A real deceleration:** UIKit has no public way to make a real one in the simulator.
  If the builder finds a reliable one (a synthesized touch through XCTest is not in our
  stack), also log `isDecelerating` before and after an arrival. It must stay 1.
  Otherwise, check 1 is the proxy: deceleration only stops if the app writes the offset
  or reloads, and check 1 forbids exactly that.
- **On the device:** the owner's next TestFlight build confirms this with a flick through
  John 10–20 with an empty cache. Momentum must run out on its own.

**Files:**
- `ios_esv.l8`: `esv_arrived`, the window and the queue, the placeholder pad, the pending
  lists.
- `ios.l8`: `reader_moving`, the counter in `set_offset`/`go`, the new delegate method,
  the rest hook, and `scroll_began` clearing the waits.
- `esv_cache.l8`: `esv_pinned`, `esv_room_for`.
- `test_store.l8`, `ios_demo*.l8`, `simulate.sh`, and the new fixtures.

#### 9.4.11a Builder notes (§9.4.11, as built)
1. **`scrollViewWillEndDragging:withVelocity:targetContentOffset:`** gets the target's
   pointer as its third whole-number argument: the velocity, a CGPoint, comes in float
   registers, which an L8 method doesn't receive.
2. **`esv_pending_visible` and `esv_pending_above` are one list** (`esv_pending`): at rest
   both are handled the same way, in one update.
3. **A placeholder on the screen is asked for first,** before the window's chapters, and
   past the 20-a-minute limit; `count=2` only when the next chapter is itself askable.
4. **The glide starts at John 3:33 and steps from 220 pt a frame** (×0.97, 150 frames,
   about 7,600 pt), not the design's 40: John's chapters are 4,000–6,000 pt on a phone, so
   the design's 1,600 pt glide from John 3:1 never left John 3. It passes through John 4
   and lands in John 5 (logged, `glide lands in`, and checked). (Review r5-1: at 160 pt it
   landed in John 4, which the note wrongly called John 5.)
   - **The answers are let go by the demo**, not by a timer (review r5-1): from John 4 on,
     the fixture holds each answer (`esv_fixture_hold_from`) until the glide's frame
     releases it, so that the two cases the design is for are exercised every run: John 4
     arrives while its placeholder is on the screen below the reading line (filled in
     place, moving, without animation), and John 5 once the glide is 200 pt into it (above
     the reading line: kept, and swapped in at rest, `esv rest pending 1`).
   - **The checks** (`glide.txt`) add: it lands in John 5; at least one arrival moving and
     visible below the line; at least one moving and above it; a row kept for rest and
     swapped in there; the fixed line at rest compared (failing if there is nothing to
     compare); and the glide's placeholders within 10% of the filled height. When the
     place is inside a placeholder (no verse yet), the line kept, and compared, is the
     row's top (the opener's offset in text that has not come means nothing); and the
     rest's swap runs once at a time (a jump's own end of scrolling had run it again
     inside itself). Check 1 is
     now "offset write while moving", which `go` and `set_offset` log when they refuse
     (below), counted over every group's run (`moving.txt`).
9. **One guard for every writer** (review r5-1): `go`, `set_offset` and the new
   `set_offset_animated` refuse while `reader_moving()`, and log `bible: offset write while
   moving N`. What must still happen waits for rest (`reader_rested`): a look or theme
   change's `relayout` and a text-size change (`relayout_due`, `text_size_due`), and a
   Listen follow asked for (`ls_follow_due`; Listen's follow now goes through
   `set_offset_animated`, and checks `reader_moving()`, not only `isTracking`). What the
   reader asks for (a jump, the back capsule, a version switch, Listen's name) first stops
   a glide where it is (`stop_moving`), as a touch would. Inside `reader_rested` the reader
   counts as at rest, whatever UIKit's flags still say in `didEndDragging`.
5. **The demo writes the glide's offset itself** (`setContentOffset:` directly, not
   `set_offset`), so its own frames aren't counted as writes while moving; everything
   else's are.
6. **The fixture's missing chapters are not asked for again** (`esv_fixture_none`): a
   chapter it has no file for (John 2, beside John 3) was asked for every second, holding
   the one request in flight.
7. **JHN 5–8's fixtures** are made from `web.txt` by `worker/web_fixture.mjs`, then their
   `.records` by the converter, as `test.mjs` checks every fixture.
8. **No real deceleration is measured**: there's no public way to make one in the
   simulator, so check 1 (no offset written while moving) stands in for it.

### 9.5 R4.4 Compare
**Entry:** the tray's action row gets a sixth action, **Compare** (`books.vertical`), after
Study. The row is 6 across, fillEqually.
- At default text sizes the titles fit on a 375 pt-wide phone (about 53 pt each).
- At accessibility sizes the tray's existing rule applies: titles may wrap to 2 lines
  and must not truncate.
- Accessibility label: "Compare Versions".

**The sheet** (UINavigationController page sheet, detents medium and large, starting
**medium**, grabber; dimmed behind; the bar expands with it as for every sheet):
- **Nav bar:** inline title = the selection's reference in the current version's
  numbering ("John 3:16"). Done is on the right.
- **Bottom toolbar:** `chevron.up`, flexible space, `chevron.down`, as in the interlinear.
  - They move to the previous or next verse; a multi-verse range moves by its own
    length.
  - They cross chapter boundaries.
  - The title updates with a 0.15 s fade.
- **Content:** an insetGrouped UITableView, **one section per version**:
  - The current version first, then BSB, ESV, KJV, WEB, ASV and YLT, without repeating
    the current one.
  - **Header:** the full name ("King James Version"), system header style. The current
    version's header also carries "· Reading" in faint.
  - **One cell:** the verse(s) in the reader's body font at 0.9 em, ink, line height 1.3.
    - Several verses get superscript-free verse numbers in faint, 0.7 em, followed by a
      thin space.
    - Highlights aren't shown.
    - LORD in small caps; red letters if on.
    - Insets 16/14.
    - A verse the version lacks shows "Not in the BSB" (or "…in this version"; for BSB
      Matthew 17:21: "Not in the BSB; see the footnote at Matthew 17:20") in faint
      italic.
  - **The ESV section:**
    - While loading, a cell with a small spinner and "Loading…" (faint), the spinner
      after 0.4 s as in the reader.
    - When loaded, the text, and a section footer "(ESV) · esv.org" (link).
    - Offline: "The ESV needs an internet connection." (faint), with no retry button;
      reopening retries.
- **Tap a section's cell:** dismiss the sheet, then **switch the reader to that version**
  at that verse (§9.3.3), with the flash. This is a list row, so it goes (the Round 3
  rule). Accessibility hint: "Reads in King James Version".
- **Long-press** a cell: the system context menu would need a block, so there isn't one.
  Copy stays in the tray.
- **Cap:** a selection of more than 20 verses compares its first 20, and the sheet's last
  row reads "Compare shows up to 20 verses." in faint.
- **Motion:**
  - System sheet presentation.
  - Chevron moves reload the sections with `UITableViewRowAnimationFade`.
  - The ESV cell's text arrives with a 0.2 s cross-fade, and its height change is
    animated by `beginUpdates`/`endUpdates`.
- **Acceptance:**
  1. Every version's text for John 3:16 is correct.
  2. The ESV loads through the fixture, with its footer.
  3. The cross-version tap lands at the same verse.
  4. Matthew 17:21 shows the "Not in the BSB" line in the BSB section.
  5. The chevrons cross chapters.

### 9.6 R4.6 Cross references in Study

#### 9.6.1 Data
- **Source:** openbible.info "Bible Cross References",
  `https://a.openbible.info/data/cross-references.zip` (sha256
  `3b694f0db9ea81e125c78e88b1845ec18e8b99e63ac94eee3be58ab92cca27f1`, file dated
  2026-10-12). Licence CC BY 4.0. It's seeded from the Treasury of Scripture Knowledge and
  ranked by readers' votes.
- **What's in it:** 344,799 pairs `From\tTo\tVotes`, with OSIS-style references (`Gen.1.1`,
  `Ps.115.15`, ranges `Rom.1.19-Rom.1.20`).
  - Keep votes ≥ 1 (341,295 pairs). 87,437 targets are ranges, and 647 of those cross a
    chapter.
  - The only reference outside the BSB's verses is `3John.1.15` (5 pairs): map it to
    3JN 1:14.
- **Tool:** `tools/xrefs.py ZIP data/` (added to `fetch.sh`) writes:
  - `data/xref_index.bin`: a `u32` offset per BSB verse, in `verses.bin` order (31,086
    verses), plus a sentinel. About 124 KB.
  - `data/xrefs.bin`: for each verse, its targets **sorted by votes descending**, 4 bytes
    each, little-endian:
    - bits 0–10: chapter index.
    - bits 11–18: first verse.
    - bits 19–26: last verse (0 for a single verse).
    - bit 27: the last verse is in the next chapter.
    - bits 28–31: the vote tier min(15, ⌊log2(votes)⌋).
    - Ranges longer than into the next chapter are cut at the end of the next chapter.
    - About 1.4 MB.
  - It prints the counts, and the top 5 for John 3:16 and Genesis 1:1 (for the commit
    message).
- **`lang.l8`:** `xref_count(verse)` and `xref_at(verse, i)`, which decode a target.
  - Test: John 3:16's targets include Romans 5:8 within its first 5.
  - Test: Genesis 1:1's first target is a Psalm, Hebrews or John 1 reference, as ranked.

#### 9.6.2 The Study sheet gains segments
The tray's **Study** opens the same sheet as today, but its nav bar's **titleView** becomes
a `UISegmentedControl` **["Words", "References", "Commentary"]** (width 300, target-action
ValueChanged).
- **The reference moves into the content:** each segment's content begins with the
  **verse header**:
  - The reference ("John 3:16", SF 13 semibold, faint).
  - Then the verse in the reader's body font at 0.9 em, as today's interlinear top,
    16 pt above.
  - In the Words segment, when the current version isn't the BSB, the header shows the
    **BSB's** verse with a faint trailing "BSB" tag, and the Words content ends with the
    footer "The interlinear follows the Berean Standard Bible."
- **The remembered segment** is `studySegment` (0–2) in defaults, set before the sheet is
  presented (principle 6).
- **The bottom toolbar** keeps `chevron.up` and `chevron.down` in every segment.
  - In **Words** they skip unaligned verses (as now), and the order segment stays in the
    middle.
  - In **References** and **Commentary** they move verse by verse, and the middle is a
    flexible space. The toolbar items change with `setToolbarItems:animated:YES` (a
    fade).
- **Switching segments** cross-fades the content container (0.2 s `CATransition` fade).
- **Edit-menu Study** (a word) still opens the word study directly, unchanged.
- **A verse absent from the BSB** (KJV Matthew 17:21), in the Words segment:
  `UIContentUnavailableConfiguration` with `character.book.closed`, "Not in the BSB", and
  "The BSB gives Matthew 17:21 in a footnote. The interlinear follows the BSB." The other
  segments show their own empty states.

#### 9.6.3 The References segment
- **A UITableView** (insetGrouped) under the verse header (`tableHeaderView`).
- **Section** (no header). Footer: "From OpenBible.info, ranked by readers' votes." Under
  the ESV, add "Verses shown in the BSB."
- **Rows:** custom cells, insets 16/12:
  - The reference, SF 15 semibold, accent: "Romans 5:8", or "Psalm 33:6–9" for a range,
    or "John 1:1–2:3" across chapters.
  - 3 pt below it, the first verse of the target in the body font at 16 pt (scaled by
    UIFontMetrics), ink at 80%, at most 3 lines, with a tail ellipsis. The text comes
    from the current version if it's offline, otherwise the BSB.
  - Accessibility: "Romans 5:8. But God proves His love for us…", hint "Shows the
    passage".
- **The first 12 rows,** then a row **"Show All 34"** (accent, centered). Tapping it
  inserts the rest with `insertRowsAtIndexPaths:…Fade`, and the row fades away.
- **Tap a row → push the passage preview** (§8.1) onto the Study sheet's stack. The back
  button reads "John 3:16".
  - This is a deliberate **refinement of the Round 3 rule**: lists of **places** (search,
    history, library, picker, Compare) go there; lists of **related passages**
    (references) preview, because their purpose is reading beside the verse. The
    preview's Open in Reader goes.
- **Empty:** `UIContentUnavailableConfiguration` with `arrow.triangle.branch`, "No Cross
  References", and "OpenBible.info lists none for John 3:16."
- **Motion:** system push; insertions fade.

### 9.7 R4.7 Matthew Henry's Concise Commentary in Study

#### 9.7.1 Data
- **Source:** CCEL ThML, `https://ccel.org/ccel/henry/mhcc.xml` (sha256
  `4a5509ba5064b54572397ae1a796561ff6ce4a1e18f366af0141a09c5d06fcd6` on 2026-10-18;
  7.9 MB). It's public domain (CCEL: "Rights: Public Domain"; it's also the source
  CrossWire's PD module MHCC 2.0 was rebuilt from).
- **Structure:** 3,364 `<div class="Commentary" id="Bible:Gen.1.1-Gen.1.2">` sections,
  each with an `<h3>` "Verses 1–2" and `<p>` paragraphs. 841 chapter-outline tables
  ("Chapter Outline" rows with `scripRef` ranges). Book introductions are the `<p>`s
  before a book's first chapter. 8,417 `scripRef` elements with normalized `osisRef`.
- **Tool:** `tools/mhcc.py XML data/bsb.txt data/mhcc.txt` (in `fetch.sh`) writes records,
  one a line:
  ```
  B<CODE>                  a book; its introduction follows as p lines
  C<n>                     a chapter
  O<text>\t<v1>[-<v2>]     a line of the chapter's outline
  K<c>:<v>-<c2>:<v2>       a section of comment on those verses
  p<text>                  a paragraph
  ```
  - Inside `p` and `O`, use the lexicon's markup (§7.1): `[[JHN.3.16|John 3:16]]` for each
    `scripRef` (the visible text kept as written, e.g. "ver. 5"), and `_italic_` for
    `<i>`/`<em>`. Every other tag is dropped and entities are decoded.
  - KJV versification matches ours; the 3 John 1:15 rule applies if it's ever met.
  - About 3.2 MB raw. The tool prints its section count and the sections for John 3.
- **`lang.l8`:** `mhcc_index()` (at first use) and `mhcc_section(c, v)`. The latter
  returns the section whose range contains (c, v), or the nearest preceding one in the
  chapter, plus its range.
  - Test: John 3:16 → a section that includes verse 16.
  - Test: Genesis 1:1 → `K1:1-1:2`.
  - Test: the markup yields a reference run.

#### 9.7.2 The Commentary segment
- **A non-editable, selectable UITextView** (background `bg`, the reader's margins) under
  the verse header:
  1. The section's range as a small header, "Verses 16–21" (SF 13 semibold, faint, 20 pt
     above).
  2. The paragraphs in the reader's body font at 0.95 em, ink, line height 1.4, with
     12 pt between paragraphs. References are accent with no underline, and **tapping
     one pushes its preview** (the Round 3 rule for references in text).
  3. At the end, a faint attribution at 0.75 em: "Matthew Henry, Concise Commentary on
     the Whole Bible (1706–1721)".
- **Chevrons:** when the next verse is in the **same** section, the text doesn't change
  (no animation; only the verse header updates with a 0.15 s fade). When the section
  changes, the text cross-fades (0.2 s) and scrolls to the top.
- **Long-press** gives the plain system menu (Copy, Look Up, Share), as in previews.
- **Empty** (a verse with no section in its chapter): `text.book.closed`, "No Commentary
  Here", and "Matthew Henry's Concise Commentary has no comment on John 3:16."

### 9.8 R4.8 Acknowledgements, copyright page and privacy
Acknowledgements (§7.8) becomes, in this order:
1. **Text**:
   - BSB (unchanged).
   - "King James Version" / "The 1769 standard text, from eBible.org. Public domain
     outside the United Kingdom, where the rights are vested in the Crown." →
     `https://ebible.org/eng-kjv2006/`
   - "World English Bible" / "Public domain. “World English Bible” is a trademark of
     eBible.org; the text here is unchanged." → `https://ebible.org/engwebp/`
   - "American Standard Version" / "1901. Public domain." → `https://ebible.org/eng-asv/`
   - "Young's Literal Translation" / "1898. Public domain." → `https://ebible.org/engylt/`
2. **English Standard Version** (its own section; this is the copyright page the terms
   require):
   - A row "ESV.org" → `https://www.esv.org`.
   - The section footer, verbatim: "Scripture quotations marked “ESV” are from the ESV®
     Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, a publishing
     ministry of Good News Publishers. Used by permission. All rights reserved. The ESV
     text may not be quoted in any publication made available to the public by a
     Creative Commons license. The ESV may not be translated into any other language.
     Users may not copy or download more than 500 verses of the ESV Bible or more than
     one half of any book of the ESV Bible."
3. **Original Languages** and **Lexicons**: unchanged.
4. **Study**:
   - "Cross References" / "From OpenBible.info, licensed CC BY 4.0. Ranked by votes;
     those without a positive vote are left out." → `https://www.openbible.info/labs/cross-references/`
   - "Matthew Henry's Concise Commentary" / "From the Christian Classics Ethereal Library.
     Public domain." → `https://ccel.org/ccel/henry/mhcc`
   - The "Changes to the Lexicon Data" screen gains two lines: "Cross references to 3
     John 1:15 are given at 1:14, as the BSB numbers it." and "The commentary's markup was
     converted to plain styled text."
5. Footer: version and build (unchanged).

- **Reading settings' Version footer** (§9.3.1) is the only other new text.
- **Privacy:**
  - `PrivacyInfo.xcprivacy` stays "collects nothing". Its comment changes to say the app
    sends ESV chapter requests to our proxy, which keeps nothing.
  - The App Store privacy answer stays **Data Not Collected**.
  - A short privacy page goes at `https://smoothbible.com/privacy/` (owner's
    blog). It says what the proxy receives (a book, a chapter, the client's address for
    one minute of rate limiting) and that nothing is kept.
  - The Acknowledgements footer gets a row "Privacy" → that page.
- **Info.plist:** no change. HTTPS to our own domain needs no ATS exception.

### 9.9 CI for Round 4
**A new demo group, `versions`** (in `simulate.sh` and the workflow matrix, in parallel with
the others). It installs the ESV fixture (§9.4.10) and seeds these marks through the demo
hooks:
- John 3:16–17 yellow, John 3:3 green, and the John 3:5 note.
- A bookmark on **KJV Matthew 17:21** (made while reading the KJV).

Shots, in order:

| Shot | Action | Expected |
|---|---|---|
| `100-settings-version` | John 3:14 at the top; open Aa | The Version section first: "Version · BSB ›", the footer about Study; Listen below |
| `101-versions` | Push Version | "On This iPhone" (five rows, BSB checked) and "Online" (ESV) with its footer |
| `102-kjv-behind` | Tap King James Version (the sheet stays) | The checkmark on KJV; behind the sheet, John 3 in the KJV with **3:14 still at the top** (the log prints the place before and after; they're equal) |
| `103-kjv-john-3` | Dismiss; scroll to 3:16 | KJV text ("only begotten"), the yellow wash on 16–17 and the note glyph after 5; italic supplied words visible in the chapter |
| `104-kjv-matt-17` | Go to Matthew 17:20 | Verse 21 present, with the bookmark glyph and accent number |
| `105-bsb-matt-17` | Switch to the BSB (demo hook through the same function) | Verse 21 absent (the footnote mark at 20), no bookmark shown, same place |
| `106-library-kjv-only` | Library → Bookmarks | "Matthew 17:21 · KJV" with the KJV's text |
| `107-web-psalm-23` | WEB, Psalm 23 | Its psalm title, poetry at two levels, "Yahweh" absent ("LORD") |
| `108-asv-psalm-23` | ASV | "Jehovah is my shepherd", italic supplied words |
| `109-ylt-genesis-1` | YLT, Genesis 1 | One verse per line |
| `110-red-letter-asv` | ASV, Aa scrolled to Show, red letters on | The footer "The ASV doesn't mark the words of Jesus." |
| `111-compare` | BSB, John 3:16 selected → Compare | The sheet at medium: BSB "· Reading" first, then ESV loading (spinner shown after 0.4 s; the fixture delay is 2 s for this step), KJV, WEB… |
| `112-compare-esv` | Wait | The ESV section with fixture text and the "(ESV) · esv.org" footer |
| `112b-compare-esv-night` | The phone's appearance dark (Auto: Night) | 112 in Night: the ESV's text and its line on the sheet's dark background |
| `113-compare-next` | Tap `chevron.down` | Title "John 3:17"; every section shows 3:17 |
| `114-compare-to-kjv` | Tap the KJV cell | The sheet gone; the reader in the KJV at 3:17, flashed |
| `115-esv-loading` | Version → ESV, go to John 4 (fixture delay 3 s) | The John 4 opener and the faint spinner below it; no other change |
| `116-esv-john-4` | Wait | The fixture text in place (heading "Fixture: …"), no jump (the log prints the offset of a fixed line before and after: equal) |
| `117-esv-footer` | Scroll to the end of John 4 | "(ESV) · esv.org" centered under the last verse |
| `118-esv-3john` | 3 John, from verse 12, select ESV verse 15 | Verses 14 and 15 washed together; tray "3 John 1:14–15" |
| `119-esv-offline` | Fixture mode `offline`; go to Romans 8 | The opener, then "The ESV needs an internet connection." with "Try Again · Read in the BSB" in accent |
| `120-esv-busy` | Mode `busy`; Try Again | The busy message |
| `121-esv-search` | Mode `ok`; search "born again" | "N verses in the BSB", then the last row "Search the ESV for “born again”" |
| `122-esv-search-online` | Tap it | "12 verses in the ESV" with bold matches, and the "(ESV) · esv.org" footer |
| `121b-esv-search-none` | Search "qqqz" | "No Results", and under it the ESV's row, the only one |
| `122b-esv-search-light` | Search "light", tap the ESV's row | "217 verses in the ESV", page 1 of 3 (100 results), from its top |
| `122c-esv-search-more` | Show More | Page 2 in place of page 1, "Previous Results" first (the log never says more than 100 shown) |
| `122d-esv-search-last` | Show More, to the end | Page 3's last results, no Show More, "(ESV) · esv.org" the last row |
| `123-study-words` | Under the ESV, Study on John 3:16 | The segmented title [Words · References · Commentary], the BSB verse with the "BSB" tag, the tiles, and the footer line |
| `124-study-references` | References | Rows ranked (Romans 5:8 among the first), "Show All N", and the footer with "Verses shown in the BSB." |
| `125-xref-preview` | Tap Romans 5:8 | The preview pushed, with back "John 3:16" |
| `126-study-commentary` | Back; Commentary | "Verses 16–21", Henry's paragraphs, references in accent, the attribution |
| `127-commentary-preview` | Tap a reference in it | The preview pushed |
| `128-acknowledgements` | Aa → Acknowledgements, scrolled | The Text section's five versions; the ESV section with the full notice in its footer |
| `129-ax-compare` | (accessibility content size) Compare on John 3:16 | Nothing clipped; the headers wrap |
| `130-ax-tray-six` | The tray at that size | Six actions; the titles wrap to two lines, none truncated |

- **Logs checked** (in `log.txt`): the place equalities for 102 and 116, and the cache line
  after the group has visited John 3–4, 3 John and Romans 8 (≤ 500 verses; 3 John never
  written to disk).
- **Transitions recording** (in the `notes` group's recording, or a new one in
  `versions`):
  - **Sequence 10:** switch BSB → KJV → BSB from the Versions screen at John 3:14. Both
    cross-fades show no text movement.
  - **Sequence 11:** the ESV placeholder → text arrival for John 4, read from John 3:33
    (John 3's end, the divider, John 4's opener and spinner on the screen), with a
    fixed line unchanged frame to frame (the log's: John 4's opener).
- **The Linux job** adds `node --test programs/bible/worker/test.mjs` and the new
  `test_text`/`test_store` cases. `make bible-test` runs them.
- **The store group** adds `store-7.png`: Compare on John 3:16 at large detent, light,
  Paper.

### 9.10 Questions only the owner can answer, and what the owner provides
**Questions:**
1. **ESV terms of use.**
   - Crossway allows the API only for uses "consistent with the historic Christian
     understanding of doctrine", per their statement of faith, which the registrant
     affirms.
   - Do you agree to register under those terms? If not, the ESV is dropped and Round 4
     ships without §9.4 (everything else stands).
2. **The KJV in the United Kingdom.** In the UK, the KJV is under Crown letters patent
   held by Cambridge University Press. Options:
   - (a) Write to CUP for permission. Recommended: they routinely permit free use.
   - (b) Ship worldwide as most free Bible apps do.
   - (c) Leave the KJV out of the UK storefront. That's impossible per feature without
     hiding it by region, which we won't do.
   - Until you decide, the build carries the KJV and the credit says the rights are
     vested in the Crown.
3. **Growth.** 5,000 ESV requests a day is shared by every user. With two-chapter
   requests and the cache, that's roughly 1,000–2,000 daily ESV readers. If the app
   outgrows it, Crossway licenses only organizations. Are you content to let the
   "resting for today" state be the ceiling?

**The owner provides:**
1. **An ESV API application:**
   - Log in at `https://api.esv.org/login/`, then go to
     `https://api.esv.org/account/create-application/`.
   - Name: "Smooth Bible". Description: "A free iPhone Bible reader; no ads, purchases or
     donations." Website: `https://smoothbible.com/`.
   - Save the key to `~/.config/smooth-bible/esv-key`. **Don't paste it in chat.** The
     builder runs `npx wrangler secret put ESV_KEY < ~/.config/smooth-bible/esv-key`.
2. **Consent to deploy:**
   - Creating the D1 database `smooth-bible-api`, the Worker and its route
     `smoothbible.com/api/*`.
   - Publishing the two small pages (`https://smoothbible.com/` and `/privacy/`).
3. **On a device:** a check that the ESV loads over cellular, and that turning on
   Airplane Mode shows the calm offline state.

### 9.10a Builder notes (Round 4, as built)
Where the build differs from the text above, and why:
1. **Verses with no words are left out of the other versions** (`usfm.py`): the ASV's
   Matthew 17:21 and the 15 others it gives only in footnotes, and the WEB's Luke 17:36,
   Acts 8:37, 15:34 and 24:7 (footnotes) and Romans 16:25–27 (given at 14:24–26), as the
   BSB leaves out a verse it footnotes. So `versify.py` reports the ASV with exactly the
   BSB's 31,086 verses and the WEB with 31,098, not "all of the BSB's plus the 16"; and a
   bookmark on KJV Matthew 17:21 shows in the KJV, WEB and YLT, not the ASV.
2. **KJV's ¶ marks are dropped**: its paragraphs (eBible's `\p`) are already there, and
   every ¶ begins one.
3. **The commentary's sections run on to the next section** in their chapter: CCEL's John
   3 has sections 1–8 and 22–36 only, the first holding the comment on 9–21 (its outline
   lists 9–21). So John 3:16's header reads "Verses 1–21", not "Verses 16–21". CCEL's 2
   Kings 1 and 2 Chronicles 1 are read from their books' first lines, and Jude's osisRefs
   (which say Judges) as Jude.
4. **`verse_num` holds the key** (what marks and selection use) and `verse_shown` the number
   shown, the reverse of §9.1.4's names (`verse_key` is store.l8's already). The test for
   a verse the BSB lacks uses a new `verse_find` (-1), `verse_index` keeping its
   nearest-before meaning.
5. **ESV prose paragraphs are always `Pm`**: the BSB opens a chapter after a heading with
   `Pm`, not `Po`.
6. **Study opens for every verse**, as its References and Commentary are every verse's. A
   BSB verse without an interlinear shows, in Words, `character.book.closed`, "No
   Interlinear", "John 3:16 isn't aligned with the original words."
7. **Listen, on a switch, starts again at once** at the same verse in the new version,
   rather than at the end of the utterance.
8. **The ESV's acknowledgement section shows only while the ESV is listed** (amendment 2).
9. **The ESV line's "esv.org" is a tap target in the reader's text**, not a system link, so
   VoiceOver reads "(ESV) · esv.org" without the link trait; in lists it is a button with
   the label "ESV. Link: esv.org".
10. **The fixture answers a two-chapter request with its first chapter**; the second is
    asked for on its own, as the reader comes to it.
11. **A one-chapter book's label keeps the app's form**: the ESV's 3 John 1:14–15 reads
    "3 John 14–15", as "Jude 3" does elsewhere.
12. **A chapter the CI fixture has no file for stays "coming"** (its spinner) in the
    reader, and a preview of it shows the BSB's words, so no screenshot shows a failure the
    real server wouldn't give.
13. **`usfm.py` keeps the space between a footnote and markup after it** (WEB, KJV: "…\f*
    \wj Satan"), 118 places where the words would otherwise have run together.
14. **(Review r4-1.) A chapter with one comment** (316 of them, Psalm 23 among them) is
    written by CCEL as the chapter's own `<p>`s, with no Commentary div: `mhcc.py` makes it
    one section, the whole chapter (`K23:1-23:6`, the last verse from `bsb.txt`), its bold
    summary the first paragraph, in italics, and the dash that joins the summary to the
    comment ("—The Lord is my shepherd") dropped. **No chapter is left without a section:**
    Isaiah 36, 37 and 39, which the review counted as having none, each have one line
    pointing to 2 Kings ("See II Kin. 18:17-37, and the commentary thereon."), kept as
    their section, since a reference to the comment is better than "No Commentary Here".
15. **(Review r4-1.) The YLT's quotes are curled** by `usfm.py`'s `ylt` profile, and the
    WEB's Psalm 119 letters (`\d ALEPH`) are `A` records, as the KJV's and BSB's.
16. **(Review r4-1.) The ESV's preview fallback names why:** "Shown in the BSB. The ESV
    needs a connection." (offline), "… The ESV is busy just now." (busy), or "Shown in the
    BSB." (unavailable, resting, or a chapter the fixture has not). The fixture gains ROM 5
    and JHN 1 (for 125 and 127), and "light"'s three search pages (made from the WEB by
    `make_fixtures.mjs`).
17. **(Review r4-1.) An ESV chapter's row has the VoiceOver action "Open esv.org"**
    (`accessibilityCustomActions`, selector-based).

### 9.11 Round 4 acceptance (summary)
Round 4 is approved when:
- `bsb.txt` is byte-identical out of `usfm.py`. The four versions are converted, and
  `versify.py`'s output matches §9.1.1.
- Marks follow references across versions exactly as §9.1.2 says. Romans 14:25 survives a
  reload.
- Switching versions keeps the verse and only cross-fades (recording sequence 10).
- Compare works for all six versions, and its tap reads in the chosen version.
- The ESV:
  - Loads through the proxy (fixture in CI, real on device).
  - The cache never exceeds 500 verses or half a book (test plus log).
  - Every ESV page (chapter, preview, Compare, search results) shows "(ESV) · esv.org".
  - Offline, busy and daily states are calm and in place.
  - The placeholder → text arrival moves nothing (recording sequence 11).
- The Worker's tests pass. The key is only a Worker secret, and nothing is cached
  server-side.
- References and Commentary segments work, with previews, and their data is credited.
- Shots 100–130 match. No Round 1–3 shot regresses.

---

## 10. Round 5 specification: daily reading, exact senses, sharing

Round 5 is the old Round 4 list, re-planned now that versions exist. It keeps everything
from Rounds 1–4.

**Owner amendment (2026-10-18), after Round 5's first build:** the Verse of the Day is
dropped entirely ("isn't really a real thing, a bit frivolous and social-media-y"). Read
§10.1–§10.2 with these changes:
1. **No Verse of the Day anywhere:** not in Go To's Today section (§10.1.3 row 1 goes), not
   in Reading settings (§10.2.2's "Verse of the Day" section goes), not in notifications or
   shares. `data/votd.txt`, `data/votd-candidates.txt` and `tools/votd.py` (§10.2.1) are
   removed. Without a plan, Today is just "Reading Plans ›" (Recent below it, as now).
2. **The daily notification survives only as a plan's reminder,** optional and off by
   default (`planReminder`, `planReminderMinutes`, default 7:00 AM):
   - It exists only while a plan is followed. Stopping the plan removes every pending
     request.
   - **Its switch lives with the plan:** the followed plan's days (§10.1.4) gain a first
     section, a switch row **Daily Reminder**, and when it's on a **Time** row with the
     compact `UIDatePicker` (inserted and removed with a fade). Footer: "A notification each
     day with that day's reading." Denied: the switch animates back off, the footer becomes
     "Notifications are turned off for Smooth Bible in Settings.", and an accent **Open
     Settings** row appears (§10.2.2's behaviour, moved here).
   - **Content:** title the plan's name ("Bible in a Year"); body "Today's reading: John
     4–6" (that day's readings); userInfo `{"day": N}`; thread `plan`; ids
     `plan-YYYY-MM-DD`; 30 dated requests ahead, none past the plan's last day; scheduled
     again on launch, return, switch, time, plan change or progress.
   - **Opening one** goes to that day's first unread chapter (dismissing sheets, the way
     back shown), through the same `L8Notify` delegate and completion handler.
   - Authorization is §10.2.3's, unchanged: the block shim stays, for this reminder only.
3. **CI (§10.6):** 140 shows Today with "Reading Plans ›" and Recent; 147 is the plan's
   Daily Reminder (off, with its footer); 149 its Time row; 150 a reminder opened (Genesis
   4, day 2's first chapter); 148 the authorization alert, from the plan's switch.

### 10.0 Priorities, order and decisions
| # | Item | Serves | Size |
|---|------|--------|------|
| R5.1 | Reading plans (computed; the Go To sheet's new Today section) | Reading | M–L |
| R5.2 | ~~Verse of the Day, and one daily notification~~ a plan's daily reminder (owner amendment) | Reading | M (with the block shim) |
| R5.3 | Exact senses (extended Strong's, STEP TAHOT/TAGNT) | Language tools | M |
| R5.4 | Related words (Clear MACULA proximity), **replacing semantic domains** | Language tools | S–M |
| R5.5 | Share as Image | Sharing | M |

**Decisions:**
1. **Semantic domains are dropped.** MACULA's `@ln`/`@domain` fields are UBS MARBLE data,
   "used with permission" by Clear. That permission is Clear's, not ours, and the
   domain names (Louw–Nida's titles) aren't in the data at all. In their place, R5.4
   uses Clear's own CC BY **Proximity** data, which gives words used in similar
   contexts: the same question ("what else means this?") with a clean licence. See
   §10.7 for the open question.
2. ~~**One daily notification** carries both the verse of the day and, when a plan is
   active, today's reading.~~ Superseded by the owner amendment above: the only
   notification is a followed plan's optional reminder of the day's reading. There are no
   streaks or badges. Calm, not nagging.
3. **The only block in the app is a minimal global-block shim** (§10.2.3), used for the
   notification authorization call. If the shim can't be made to work, R5.2 ships
   in-app only and the notification setting is hidden. Nothing else depends on it.
4. **Plans are computed** from the chapter list, so no plan data is licensed. The
   M'Cheyne and chronological plans are out of scope; they need sourced tables.
5. **Share as Image** lives inside the system share sheet as a custom `UIActivity`. It
   adds no new button to the tray.

**Demo clock:** every date-dependent feature reads "today" through one function,
`today()`. In demo mode it returns the fixed local date **2026-10-19 08:00**, so the
plans and the reminders are deterministic.

### 10.1 R5.1 Reading plans

#### 10.1.1 Plans (portable `plans.l8`, tested by `test_plans.l8`)
Each plan is a list of days. A day is a list of **readings**, and a reading is a contiguous
run of chapters in one book. Days are balanced by **the BSB's character count** of their
chapters (T and W text), greedily: day d ends at the chapter boundary nearest to
`total·d/days`. Each day gets at least one chapter.

| id | Name | Days | Chapters |
|---|---|---|---|
| `year` | Bible in a Year | 365 | Genesis 1 – Revelation 22, in order |
| `nt90` | New Testament in 90 Days | 90 | Matthew 1 – Revelation 22 |
| `pspr` | Psalms and Proverbs in a Month | 31 | Psalms split into 31 balanced days, **plus Proverbs d on day d** (two readings a day) |
| `gospels` | The Gospels in 30 Days | 30 | Matthew 1 – John 21 |

- **Reading labels:** "Genesis 4–6", "Psalm 119", "Psalms 1–6", "Deuteronomy 34; Joshua
  1–2" (two readings when a day crosses a book), "Obadiah".
- **Tests:**
  - Every plan covers its chapters exactly once, in order.
  - `year` has 365 days, and day 1 begins with Genesis 1.
  - Psalm 119 is a day of its own in `pspr`.
  - No `year` day exceeds 2.2 times the mean length.
  - The labels match the examples above.

#### 10.1.2 Progress (`plan.tsv`; one plan active at a time)
- **The file:**
  - Line 1: `PLAN\t<id>\t<start: YYYY-MM-DD, local>`.
  - Then `READ\t<BOOK>\t<C>\t<UNIXTIME>` for each chapter read since the start.
  - Malformed lines are skipped, as in §8.9.4.
- **Day number:** N = (today − start in local days) + 1, capped at the plan's length.
- **A chapter counts as read** when either holds:
  1. The reader has rested in it for **20 s** in total (dwell, as history counts it, §8.3),
     **and** its last verse has been on screen.
  2. Listen finished its last verse.
- **It can also be marked by hand** (§10.1.4).
- **It doesn't matter when or in what version** it was read. Each chapter belongs to the
  one day that contains it.
- **Stopping or replacing a plan** appends the whole file to `plans-done.tsv`, with a line
  `END\t<UNIXTIME>`, then removes `plan.tsv`. Nothing is lost, so no confirmation is
  needed.
- **Day done:** when the reader marks the last unread chapter of **today's** day:
  - Show the toast (§3.3.3's style) "Day 4 Done", with a leading `checkmark`, for 1.6 s.
  - Give a success haptic.
  - It happens once per day.
  - There are no other celebrations, streaks or counts.

#### 10.1.3 The Go To sheet gains a Today section
- It's the **first section**, above Recent, with the header **"Today"**, and present
  whenever there's anything in it.
- **Rows:**
  1. **Verse of the Day** (§10.2): a custom cell, insets 16/12.
     - A caption "Verse of the Day" (SF 12 semibold, faint).
     - The reference in SF 15 semibold, accent.
     - The verse in the body font at 16 pt (scaled), ink at 85%, up to 4 lines.
     - The text is in the current offline version; under the ESV, the BSB.
     - Tap → go there (it's a list row).
  2. **With a plan:** one row per reading of day N.
     - A leading 28 pt button: `circle` (faint) when unread, `checkmark.circle.fill`
       (accent) when every chapter of the reading is read, and `circle.lefthalf.filled`
       (accent) when some are.
     - The title: the reading's label (SF 17, ink).
     - Secondary text: "Bible in a Year · Day 4" (faint).
     - Tap the row → go to the reading's first unread chapter (or its first chapter if
       all are read).
     - Tap the circle → mark every chapter of the reading read, or clear them. The
       symbol cross-fades over 0.15 s, with a selection haptic.
     - Accessibility: "Genesis 4 to 6, Day 4, not read", with a custom action "Mark as
       Read".
  3. **If earlier days are unfinished:** a row **"Catch Up"** (accent text), with the
     secondary "2 earlier days aren't finished" (faint). It pushes the plan's detail
     scrolled to the first unfinished day.
  4. **A last row:**
     - With a plan: "Bible in a Year", value "Day 4 of 365", disclosure → plan detail.
     - Without one: "Reading Plans" (`calendar`, ink), disclosure → Plans.
- **Configuration:** this section is configured in `viewWillAppear:` like everything else
  in the sheet (principle 6). The picker never rearranges after it lands.

#### 10.1.4 Plans and plan detail (pushed in the Go To sheet)
**Plans:**
- insetGrouped, inline title "Reading Plans".
- One row per plan, as a subtitle cell: title = the name; secondary = "365 days · about 3
  chapters a day" (computed: chapters ÷ days, rounded). The active plan's row has the
  value "Day 4" in accent.
- Disclosure → detail.

**Plan detail:**
- insetGrouped, inline title = the plan's name.
- **Header:** a one-paragraph description in SF 15, ink at 80%, insets 20.
  - `year`: "The whole Bible in order, about fifteen minutes a day."
  - `nt90`: "The New Testament in three months."
  - `pspr`: "Five psalms and a chapter of Proverbs a day."
  - `gospels`: "Matthew, Mark, Luke and John in a month."
- **Sections by week** ("Week 1", Days 1–7).
  - Rows: title "Day 1", secondary = the readings ("Genesis 1–3").
  - The leading circle, as in Today, toggles that day's chapters.
  - Today's row has the value "Today" in accent.
  - Tapping a row (not the circle) goes to the day's first unread chapter, dismissing
    the sheet.
- **Toolbar** (centered, one item):
  - No plan active: **Start Plan** (`UIBarButtonItemStyleDone`).
  - Another plan active: **Start Instead**. Its footer row reads "Your progress in Bible
    in a Year will be kept."
  - This plan active: **Stop Plan** (tinted systemRed).
  - After starting, Today shows day 1 the next time Go To appears. The detail scrolls to
    Today with `scrollToRowAtIndexPath:…animated:YES`.
- **Motion:** system push, row reloads with fade, toolbar item changes with
  `setToolbarItems:animated:YES`.

### 10.2 R5.2 Verse of the Day, and the daily notification

#### 10.2.1 Data (`data/votd.txt`, 366 lines `BOOK\tC\tV[\tV_END]`)
1. **Candidates:** `tools/votd.py` scores every BSB verse by the **sum of votes of
   openbible.info cross references pointing at it** (the data from §9.6). Famous verses
   are the most cited.
2. **Filters:**
   - 40–320 characters.
   - It doesn't begin with "And", "Then", "So", "Now", "But" or "Therefore", or with a
     quotation's closing.
   - It isn't a genealogy, list or census chapter (Numbers 1–4, 7, 26; 1 Chronicles
     1–9; Ezra 2; Nehemiah 7).
   - At most 30 from Psalms, 20 from Proverbs and 12 from any other book.
   - Two- or three-verse ranges are allowed where the verse alone is incomplete. The tool
     joins a verse with its successor when the verse ends with ",", ":" or ";".
3. **Order:** it alternates OT and NT, and never puts two from the same book on
   consecutive days.
4. **Curation:** it writes 420 ranked candidates to `data/votd-candidates.txt`. The
   **designer** curates the final 366 in review, committing `data/votd.txt` by hand. The
   builder ships the tool's first 366 as a placeholder until then.
5. **Date → entry:** the day of the year, counting Feb 29 as day 60. In common years,
   days from Mar 1 on add one, so every calendar date always has the same verse.

#### 10.2.2 The notification
- **Setting:** Reading settings gets a section **"Verse of the Day"** after "While
  Reading":
  - A switch row, **Daily Notification** (off by default; `dailyVerse`).
  - When it's on, a row **Time** with a `UIDatePicker` as its accessory
    (`datePickerMode` time, `preferredDatePickerStyle` compact; `dailyVerseMinutes`,
    default 420 = 7:00 AM; target-action ValueChanged). The row is inserted and removed
    with `UITableViewRowAnimationFade`.
  - Footer: "A verse each morning, and today's reading when you follow a plan."
- **Turning it on** requests authorization (§10.2.3).
  - Granted: schedule.
  - Denied:
    - The switch animates back off (`setOn:animated:YES`).
    - The footer becomes "Notifications are turned off for Smooth Bible in Settings."
    - An accent row **Open Settings** appears. It calls `openURL:options:completionHandler:`
      with `UIApplicationOpenSettingsURLString`, an empty dictionary, and a nil handler
      (nil is allowed).
- **Scheduling** (no blocks: `addNotificationRequest:withCompletionHandler:` with nil):
  1. On every launch, become-active, change of the setting or time, plan change or
     version change, call `removeAllPendingNotificationRequests`, then add **30
     requests**, one for each of the next 30 days at the chosen time.
     - Each has a `UNCalendarNotificationTrigger` with year, month, day, hour and minute,
       `repeats:NO`.
     - Each id is `votd-YYYY-MM-DD`.
     - Thirty separate requests are needed because each day's text differs, which a
       repeating trigger can't do. 30 is well under iOS's limit of 64 pending.
  2. **Content** (`UNMutableNotificationContent`):
     - Title "Verse of the Day".
     - Body: the verse text in curly quotes, then " — John 3:16" (cut at 178 characters
       with "…").
     - When a plan is active, the subtitle is "Today: Genesis 4–6" (the readings of that
       future day).
     - userInfo `{"ref":"JHN.3.16"}`. Default sound. Thread identifier `votd`.
     - The text is in the current offline version, or the BSB under the ESV. ESV text is
       never put in a scheduled notification.
  3. Demo log: `bible: scheduled 30 daily verses from 2026-10-20 07:00`.
- **Opening one:**
  - At launch (`application:didFinishLaunchingWithOptions:`, before it returns),
    `UNUserNotificationCenter.currentNotificationCenter.delegate` = a run-time
    `L8Notify` object. It implements
    `userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:`.
  - That method reads the ref, jumps there (dismissing any sheet, history pushed, back
    capsule, flash), then **calls the completion handler** (§10.2.3).
  - `willPresentNotification:` isn't implemented, so a notification arriving in the
    foreground isn't shown. That's fine: the reader is already in the app.

#### 10.2.3 The block shim (`programs/ios/block.l8`; the one sanctioned use)
- **What it builds:** a **global block**, a 32-byte struct in a global `[]int` that is
  never freed:
  - `isa` = `dlsym(RTLD_DEFAULT, "_NSConcreteGlobalBlock")`.
  - `flags` = `1 << 28` (BLOCK_IS_GLOBAL) in the low 32 bits, `reserved` 0.
  - `invoke` = the address of an L8 function.
  - `descriptor` = the address of a global `[0, 32]` (reserved and size).
  - Global blocks have no captures, and `_Block_copy` returns them as they are, so the
    runtime never frees or moves them.
- **`global_block(f)` returns the struct's address,** to pass wherever a block parameter
  is expected.
- **For `requestAuthorizationWithOptions:completionHandler:`** (options alert | sound =
  6), the invoke is `auth_done(block, granted, error)`.
  - It runs **on a background queue**. It must do nothing but store `granted & 255`
    into a global int, set a second global flag, and return.
  - It must not allocate, send messages, or touch regions; mark it so, and say so in its
    comment.
  - A main-thread `NSTimer` (0.2 s, for at most 120 s) watches the flag and then
    continues on the main thread.
- **Calling a block we're given** (the response handler):
  - Read its `invoke` pointer (offset 16) and call it with the block as its only
    argument, through a function-typed value if L8 allows one.
  - If it doesn't, send `invoke` to the block object (`msg(handler, sel("invoke"))`);
    NSBlock responds to it. The builder reports which path was used.
- **On every become-active while the setting is on,** call
  `requestAuthorizationWithOptions:` again. It returns at once without a prompt. If
  permission was revoked in Settings, flip the switch off as above.
- **Fallback:** if the shim crashes or never calls back in CI, ship R5.2 **without the
  notification**: the Today row stays, and the settings section is hidden. Say so in the
  commit message.

### 10.3 R5.3 Exact senses (extended Strong's)

#### 10.3.1 Data
- **Sources:** STEPBible-Data at the commit already pinned in `fetch.sh`
  (`ed476a8ee6e3f7b3a46fc48af6c7dabc02387b1d`), folder `Translators Amalgamated OT+NT/`.
  The licence is CC BY 4.0 (STEP's credit, as for the lexicons).
  - TAHOT: `Gen-Deu`, `Jos-Est`, `Job-Sng` and `Isa-Mal` (about 70 MB).
  - TAGNT: `Mat-Jhn` and `Act-Rev` (about 30 MB).
  - Their sha256s go into `fetch.sh` as the others are.
- **Tool:** `tools/senses.py` (`python3 -I`).
  - For each verse, it reads each word's **disambiguated Strong's** (dStrong: `H7225G`,
    `G2316`, with prefixes like `H9003/` split off; the `{…}` braces mark the main word
    in TAHOT).
  - **Join rule:** align the verse's words with `words.bin`'s words of that verse in
    original order (the `order` field), matching on base Strong's. Where the orders
    differ, take the first unused word in the verse with the same base number.
  - **`data/lang/senses.bin`:** one `u8` per `words.bin` entry. 0 means "not known" only
    (amended, review r5-1, as built: 10.7a-1); k means the k-th sub-entry (1-based) under
    that base's `@` block in `lexicon.txt`. A word of sense 0 never shows a particular
    sense's meaning: Meaning is the gloss its entries share, or "Sense not tagged", and
    the definition's preview lists the senses it may be.
- **`lexicon.txt` format change:** each sub-entry line gains a **first field**, its
  extended code (`H7462B`, or an empty field for an unsuffixed entry). `bsb_lang.py`
  writes it, and `lang.l8`'s parser and `test_lang.l8` are updated.
- **Coverage:** the tool prints the share of words with a known sense. Expect at least
  95%, and say so in the commit. Words whose base has only one sub-entry are trivially
  known.
- **Tests:**
  - Genesis 1:1's "God" maps to the sub-entry whose gloss is "God", not "gods". The tool
    prints its code.
  - Each sense's occurrence count, summed over the senses of a base, equals the base's
    count.

#### 10.3.2 Word study changes (§7.5)
- **Strong's** row: the extended code ("H430G"), monospaced, when the sense is known.
- **Meaning** row: the sense's gloss.
- **Definition** section: the preview shows the verse's sense first.
  - On the Definition screen, a base with several senses lists all of them, as now, but
    the verse's sense comes first.
  - The verse's sense carries a small accent caption above it, "In John 3:16" (SF 12
    semibold).
- **Occurrences:**
  - When the base has more than one sense in use, the Concordance row's value reads "42
    in this sense", and a second row "All Senses" (value "173") follows.
  - **Translated As** counts this sense only, and its footer says "In this sense".
- **Concordance** (§7.7), when pushed from "42 in this sense", filters to that sense. Its
  header gains a `UISegmentedControl` ["This Sense (42)", "All (173)"]. Switching reloads
  the sections with a fade.
- **Accessibility:** the Strong's row reads "Strong's H 430 G".

### 10.4 R5.4 Related words (replaces semantic domains)

#### 10.4.1 Data
- **Source:** `https://raw.githubusercontent.com/Clear-Bible/macula-greek/8423afe47b9e8f24b7772e808af45c7159a6fe7e/sources/Clear/synonyms/Proximity.tsv`
  (sha256 `dd4faa737a91d98b77620f636520d763df60e51c44ed2a1207cc2e98643f586c`; 174,824
  rows; 13,226 keys).
  - Columns: `StrongNumberX1`, `StrongNumberX2`, `Distance`.
  - **Lower distance is nearer.** This was verified: G25's nearest are G27 (agapētos),
    G5368 (phileō), H160 (ahavah) and H2245.
  - The licence is CC BY 4.0, with the required attribution: "MACULA Greek Linguistic
    Datasets, available at https://github.com/Clear-Bible/macula-greek/".
- **Tool:** `tools/related.py`.
  - It normalizes keys: Aramaic `A` → `H`, and drops lowercase sense letters to the
    base, but only for a base with no unlettered key of its own (amended, review r5-1:
    H2617a is a homonym, not chesed); pairs past 0.75 and function-word neighbours are
    dropped (10.7a-2).
  - It drops pairs whose base isn't in our lexicon, dedupes per base keeping the nearest,
    and keeps the 10 nearest per key.
  - It writes `data/lang/related.bin`: per base key ascending, the key in ASCII, `\0`,
    `u8 n`, then n × (`u16` Strong's, bit 15 = Greek; `u8` round(distance·255)).
  - About 0.4 MB.
  - Test: G25's first three include G5368, and H157's first five include G25.

#### 10.4.2 Word study
- **A new section after Translated As.**
- **"Related Words":** up to 5 same-language neighbours, nearest first. Subtitle cells:
  - Title: the lemma in the original font at inline size, then two spaces and the
    transliteration in italic faint ("φιλέω  phileō").
  - Secondary text: the gloss ("to love, be fond of").
  - Value: its occurrence count, faint.
  - Disclosure indicator.
- **"In the Old Testament"** (from a Greek word) or **"In the New Testament"** (from a
  Hebrew one): up to 3 cross-language neighbours, in the same cells.
- **Footer** (the last of these sections): "Words used in similar contexts, from MACULA."
- **Tap → push a lemma study.** This is the word study for a dictionary form, without a
  verse:
  - The header shows the lemma in the hero size, its transliteration, and "143 times"
    instead of the verse line.
  - It has no Grammar row and no Add to Note.
  - Translated As and Concordance cover all senses.
- **Empty:** no section at all (there's no empty state for absence here).

### 10.5 R5.5 Share as Image
- **Entry:** the tray's Share and the edit menu's Share present the system share sheet,
  as now, with `applicationActivities` = @[an `L8ImageActivity`]. That's a run-time
  `UIActivity` subclass:
  - `activityType`: "space.trailingwhite.smoothbible.image".
  - `activityTitle`: "Share as Image".
  - `activityImage`: the SF Symbol `photo`.
  - `+activityCategory`: `UIActivityCategoryAction` (0).
  - `canPerformWithActivityItems:` → YES for at most **8 verses and 700 characters**.
  - `prepareWithActivityItems:` keeps the selection.
  - `activityViewController` returns the composer (UIKit presents it in the share
    sheet's place).
- **The composer** (a UINavigationController):
  - Inline title "Share Image". Cancel on the left; **Share** on the right (bold).
  - Background `secondarySystemBackground`.
  - **Preview:** a `UIImageView` (aspect fit) of the card, with 20 pt margins, corner
    radius 14 (continuous), and a shadow (opacity 0.12, radius 16).
  - **Below the preview:**
    1. A `UISegmentedControl` ["Square", "Portrait"] (1080 × 1080 or 1080 × 1350 px).
    2. A row of five 36 pt theme swatches (Paper, White, Sepia, Night, Black), drawn as
       in §3.7. The selected one has the accent ring.
  - **Defaults:** the reader's theme (Auto resolves to Paper or Night) and Square. Both
    are remembered (`shareShape`, `shareTheme`).
  - **Changing either** re-renders, and the preview cross-fades over 0.15 s.
  - **Share** calls `activityDidFinish:YES` (which dismisses the composer). After 0.35 s
    (`performSelector:withObject:afterDelay:`), the reader presents a
    `UIActivityViewController` with the UIImage, the same handoff as §8.1. **Cancel**
    calls `activityDidFinish:NO`.
- **The card** (drawn with `UIGraphicsBeginImageContextWithOptions(size, YES, 1.0)`,
  then `NSAttributedString drawWithRect:options:context:`, then
  `UIGraphicsGetImageFromCurrentImageContext` and `UIGraphicsEndImageContext`; these are
  C calls, with no block):
  - The fill is the theme's `bg`, with margins of 110 px.
  - **The verse text** in the reader's current font, ink, line height 1.35,
    leading-aligned. Poetry keeps its lines (q2 indented 40 px). LORD is in small caps,
    with red letters if on. There are no footnote marks, highlights or attachments.
    Several verses carry faint verse numbers at 0.6 of the text size.
  - **The size** is the largest from 64 px down to 34 px (in steps of 2) that fits the
    space above the reference.
  - **The reference** 44 px below the text: "John 3:16" in SF Pro semibold 34 px, accent,
    then " BSB" (the version's abbreviation, always present; required for the ESV) in SF
    Pro regular 30 px, faint.
  - The text and reference are a block, vertically centered.
  - **No app name or logo.**
- **Info.plist:** add `NSPhotoLibraryAddUsageDescription` = "Smooth Bible saves the verse
  images you choose to your photo library." This is required, because the share sheet
  offers Save Image.
- **Accessibility:**
  - The preview's label is the verse and reference.
  - The swatches are labelled "Paper Background", and so on.
  - Rendering ignores Dynamic Type: the card is a fixed-size image.

### 10.6 CI for Round 5
**A new demo group, `plans`**, with the demo clock (§10.0). It seeds no plan; the steps
start one. Shots:

| Shot | Action | Expected |
|---|---|---|
| `140-goto-today` | Open Go To | Today: "Reading Plans ›"; then Recent (owner amendment: no Verse of the Day) |
| `141-plans` | Push Reading Plans | Four plans with day and chapter counts |
| `142-plan-detail` | Push Bible in a Year | The description, Week 1 rows (Day 1 "Genesis 1–3"…), toolbar "Start Plan" |
| `143-plan-started` | Start; back to Go To (dismiss and reopen) | Today: "Genesis 1–3 · Bible in a Year · Day 1" with an empty circle, and "Bible in a Year · Day 1 of 365" |
| `144-plan-partial` | Read Genesis 1 (the demo hook dwells 20 s worth and shows the last verse), reopen Go To | Genesis 1–3 with the half-filled circle |
| `145-day-done` | Mark Genesis 2–3 read in the reader the same way | The toast "Day 1 Done" over the reader |
| `146-catch-up` | Demo clock +3 days; open Go To | "Genesis 8–10 · Day 4" (or as computed), and "Catch Up · 2 earlier days aren't finished" |
| `147-plan-reminder` | The plan's days (owner amendment) | Daily Reminder off, and its footer |
| `148-notify-prompt` | Turn it on | The system authorization alert (proof the shim's call ran); the log shows no crash |
| `149-time-row` | (The demo forces the "granted" path through the shim's flag) | The Time row with 7:00 AM; the log line "scheduled 30 daily reminders" |
| `150-reminder-open` | The demo hook opens day 2's reminder | The reader at Genesis 4, day 2's first unread chapter, with the back capsule |
| `151-share-sheet` | Select John 3:16; Share | The system share sheet with "Share as Image" among its actions |
| `152-share-composer` | Choose it | The composer: square Paper card, the segments and swatches |
| `153-share-night-portrait` | Portrait, Night | The re-rendered card |
| `154-word-sense` | Word study of Genesis 1:1 "God" | Strong's with its letter, the Meaning "God", and "N in this sense" plus "All Senses" |
| `155-concordance-sense` | Push "in this sense" | The segmented header "This Sense (N)" and "All (M)" |
| `156-related` | Word study of John 3:16 "loved", scrolled down | "Related Words" with agapētos (G27) and phileō (G5368), and "In the Old Testament" with H2245 and ʾahăḇâ (H160) |
| `157-lemma-study` | Tap φιλέω | The lemma study: no verse line, "N times" |
| `158-ax-goto-today` | (Accessibility size) Go To | Today rows wrap; nothing clipped |

- **Published:** the demo writes the 152 card at full size to Documents, and
  `simulate.sh` publishes it as `share-card.png`. It must be exactly 1080 × 1080.
- **Recording sequence 12:** tap a Today circle (the symbol cross-fades), push Plans and
  back, toggle the plan's Daily Reminder on and off (the Time row fades in and out), and
  stop and start the plan (its rows and the reminder's section fade; review r5-1).
- **Linux:** `test_plans.l8` and the new `test_lang.l8` cases (senses, related, lexicon
  field) in `make bible-test`, and `senses.py --check` and `related.py --check`. (The
  verse of the day's `votd.py` went with it: owner amendment.)

### 10.7 Questions only the owner can answer, and what the owner provides
1. **Semantic domains.** Do you want us to ask UBS (semanticdictionary.org, MARBLE) for
   permission to show Louw–Nida domain names in a free app? If they grant it, domains can
   join Related Words in a later round. If not, R5.4 stands as specified.
2. ~~**The verse-of-the-day list.**~~ (Gone: owner amendment.)
3. **On a device:**
   - Allow notifications, and receive one at the set time (the simulator can't show
     the Allow tap).
   - Tap it, and see the app open at that day's first unread chapter.
   - Save a shared image to Photos.

### 10.7a Builder notes (Round 5, as built)
Where the build differs from the text above, and why:
1. **`senses.bin`'s 0 means only "not known"**; k counts entries from 1, and a base with a
   single entry is k = 1 (known trivially). Review r5-1: `bsb_lang.py` makes the sense
   TBESH lacks, **H430J "gods"** ("gods (of the nations); other gods"; `SYNTH`), so the 215
   words STEP tags so (Exodus 20:3, Psalm 82:1b and 82:6) read "gods"; and `senses.py`
   gives a dStrong no line has (TAHOT's unlettered H3064, TAGNT's G3708) the one line whose
   gloss is the word's own (TAHOT's expansion, TAGNT's meaning column), before 0. Coverage
   is 99.78%; 44 words are left at 0 (people of one name, as Anah, H6034, 12). A word of
   sense 0 shows no particular sense (`meaning_entry`): its Meaning is the gloss all its
   entries share, else "Sense not tagged", and the preview "One of 3 senses, not tagged in
   this verse: …". Genesis 1:1's "God" is H430G, Exodus 20:3's "gods" H430J (tool and
   test). Each sense's count sums to its base's.
2. **`related.bin`** is ordered by (letter, number), G before H; distances run 0–0.75,
   stored as round(d·255); only Proximity's X1 keys are used (no reverse pairs added).
   Review r5-1: a lettered code is folded into its base only when the base has no
   unlettered code of its own (H2617a, "reproach", is not chesed's); a dozen lettered codes
   that are MACULA's particles under an unrelated base (H2050b, "and", under H2050 "to
   plot"; H871a "in") are left out; pairs past 0.75 are dropped; and function words (the
   article, pronouns, conjunctions, prepositions and particles, G3588, G846, G240 and the
   Hebrew H853, H834, H1931…) are never neighbours. 9,884 keys keep a list. Tests:
   H2617's first three include H7356 (no shame word); no function word anywhere; nothing
   past 0.75.
3. (The Verse of the Day's `votd.py` notes are gone with it: owner amendment above.)
4. **Go To opens at its top, Today first, only while a plan is followed** (review r5-1's
   condition): today's reading is a tap away. Without a plan it is scrolled to the book
   being read, as §3.2 says, Today a flick above.
5. **"Your progress in … will be kept"** is a line under the plan's description in its
   header, not a footer row (the last section's footer would be 53 weeks down).
6. **A plan not followed shows its days unread**, and their circles do nothing until it is
   started: they are drawn at the faint color at 40%, the button disabled and without
   VoiceOver's action (review r5-1's condition).
7. **Day Done comes for hand marks too** (a Today or a day's circle finishing today's day),
   once a calendar day (`planDoneDay`); in the demo it stays 6 s, for the screenshot.
8. **Rest is counted between scrolls while no sheet is over the reader**; the demo's hook
   (`demo_read`) shows the chapter's last verse and counts 20 s.
9. **The reminder's open path is checked by the demo:** step 251 opens day 2's reminder
   (`notify_open_day`), and the reader goes to Genesis 4.
10. **The block shim:** the authorization block is a global block (`programs/ios/block.l8`);
    its invoke is the L8 function's C-entry stub, which sets L8's stack from the caller's
    sp and so runs on the system's queue. It stores one word that carries the answer
    (`auth_answered` = 1 + granted) besides `auth_granted`, so the order the two stores are
    seen in cannot matter. **A block we are given is called by sending it `-invoke`**: L8
    has no way to call a C function pointer held in an int. The demo checks both: step 251
    calls a global block of ours through `call_block`, and the log says "completion
    handler called".
11. **The card is measured with a UILabel** (`intrinsicContentSize` at 860 px) and drawn with
    `drawWithRect:options:context:`: `boundingRectWithSize:` takes a CGSize and returns a
    CGRect, a shape objc.l8 cannot send.
12. **In the demo the composer is shown by the demo** (152): UIKit's share sheet cannot be
    tapped, so its action is not chosen; the composer, its Cancel and Share are the same.
13. **The bookmarked verse number was already semibold**: §2's verse-number font is
    `monospacedDigitSystemFontOfSize:weight:` at 0.3 for every number. The bookmarked one now
    sets that font explicitly beside its accent (review r4-2, item 4).
14. **This Sense / All** heads the concordance pushed from "N in this sense" only; Translated
    As, in a sense, filters by the sense and its rendering, without the control.
15. **(1.0 (11)'s crash, and the audit.)** Every global that names a pushed list or its
    controller (History, Study, Grammar, Concordance, Changes, References, Plans, a plan's
    days, and the Versions and Acknowledgements lists) now holds it (`held`, ios_look.l8)
    until its sheet has gone: popped, a list was freed while its global still named it, and
    a theme's change or a timer (History's Clear) messaged it, or another list at the same
    address was taken for it. The `plans` group's step 261 pushes and pops Versions and
    Acknowledgements, then changes the ESV's listing both ways and the theme twice.
16. **The fixture's poetry lines are joined with a space** (`make_fixtures.mjs`, review r4-2).
17. **The authorization alert's shot (148) is the group's last**, not followed by a relaunch:
    the system's alert outlives the app (a relaunch showed it over every later shot), and
    the simulator cannot answer it. 149 comes before it, the shim's flag given "granted" by
    the demo (`demo_grant`), so the Time row and the scheduling are shown without an alert.
    The alert in 148 is the real request's, from the plan's switch.
18. Not done: Isaiah 37's pointer as a reference (optional in review r4-2).
19. **Review r5-1's other fixes:**
    - **Start and Stop** change the plan's days in one `beginUpdates`/`endUpdates`: the
      header set again (its "will be kept" line, the height animated by the update), the
      reminder's section inserted or deleted, and the visible days reloaded, each with
      `UITableViewRowAnimationFade`; no `reloadData`. Sequence 12 now stops and starts the
      plan too.
    - **The reminder is the plan's:** Start (or Start Instead) and Stop turn
      `planReminder` off and remove what is pending; a newly started plan's switch is
      off. At launch, with the switch off or no plan, every pending request is removed (an
      older build's `votd-*` with it), and delivered `votd-*` ones for the last month are
      put away; with it on, the plan's are scheduled again as before. Shot 149b: the plan
      stopped with its reminder on and started again, the switch off.
    - **`plans-done.tsv` is appended to** (`append_file`, an `NSFileHandle` at its end),
      never read back through the 2 MB buffer.
    - **The server off in CI** (`L8_ESV_OFF`) for every group but `versions`: no request is
      made, the status is never asked, so store-7 shows the no-server path again.
    - **The definition's preview** joins TBESH's paragraphs with " — " unless one ends a
      sentence ("God" — Another name of…).
    - New shots: 154b (Exodus 20:3's "gods"), 156b (Psalm 136:1's related words).

### 10.8 Round 5 acceptance (summary)
Round 5 is approved when:
- The plans are computed exactly as §10.1.1 says (tests). Progress counts by dwell,
  Listen and hand. Today, Catch Up and Day Done behave as specified. Stopping keeps the
  history in `plans-done.tsv`.
- (Owner amendment: no verse of the day.) A followed plan's reminder schedules 30 dated
  requests, with the right title and body, never ESV text, and is the plan's alone (off
  when it stops; off for a plan newly started). Opening one goes to that day's first
  unread chapter. Or, if the shim failed, the fallback is reported and the setting is
  hidden.
- Word study shows the exact sense, and counts by it. The concordance filters by sense.
- Related words show and push lemma studies, with MACULA credited in Acknowledgements:
  - A new **Study** row "Related Words" / "From MACULA Greek Linguistic Datasets,
    available at https://github.com/Clear-Bible/macula-greek/ (Clear Bible / Biblica),
    licensed CC BY 4.0."
  - STEP's row adds "Translators Amalgamated Hebrew OT and Greek NT (TAHOT, TAGNT)".
- Share as Image makes the card exactly as specified, at exact pixel sizes. Saving
  works on a device.
- Shots 140–158 match. Recording sequence 12 shows no abrupt change. No earlier shot
  regresses.

---

## 11. Round 6 specification: ribbons, and plans on their own list

> **Owner revision 2026-10-19. This section replaces Round 6's readings model.** Round 6
> as first specified and built (TestFlight 1.0 (15), approved in review r6-1; the text is
> in git at `07d833a7`) kept automatic **readings**: places that started themselves when
> you read a book's first chapter or two chapters in a row, moved by reading, merged when
> they met, and shared one "Continue Reading" list and one Start Reading sheet with plans.
> After using it, the owner wrote:
>
> > "I am starting to think that auto detection of reading patterns to decide where to
> > resume is more confusing for the case where you are indeed setting it automatically.
> > And Continue Reading and Recent have large overlap. I'm starting to think we should
> > have reading plans and a separate concept that matches the semantics of a physical
> > book mark, which is to mark a spot and which moves as you read onward from that
> > spot. Maybe it should be nameable and have its own list, and the plans are being on
> > their own list."
>
> **Owner answers (2026-10-19), built into what follows:**
> 1. The verse **bookmarks** in the Library stay exactly as they are: fixed marks. The new
>    moving marker is a separate thing called a **ribbon**, like the ribbon markers sewn
>    into a printed Bible, with its own list.
> 2. **A ribbon moves when you read on from it.** Opening a ribbon picks it up. It then
>    follows your reading until you jump somewhere else (Go To, a link, search, a
>    preview's Open, Compare's switch, another ribbon, the back capsule). Then it stays
>    where you left it. Putting it down by hand is fine too.
> 3. Ribbons are **explicit and nameable**. Nothing is made automatically. Plans stay on a
>    list of their own.

**What this revision removes** (from the build of 1.0 (15)):
- Automatic readings: the starts by a book's first chapter or two chapters in a row,
  merging, `CLEARED`, "recently read", `read.tsv`, and seeding from History.
- Go To's **Continue Reading** section, its Show All and the pushed **Reading** screen.
- The **Start Reading** sheet (one sheet for both kinds), its "At My Own Pace" pace, the
  title's **Start Reading Here…**, the chapter grid's toolbar ("Start Reading Romans…") and
  the toast "Reading from Romans 3".
- `readingsSeeded`. `readings.tsv` is read once, for migration (§11.4), and then set aside.

**What it keeps:** the read signal (now used by ribbons and plans), the scroll-rest
plumbing, the exact return to a kept place (no flash), the title's long-press menu, the
toast, the plan's one row, A Chapter a Day, the Begin At choosers (Go To's book rows and
§3.2's grid in choose mode), and everything of Rounds 1–5 and 7.

### 11.0 The answer, and the decisions

**A ribbon is a named place that you carry while you read.** It sits in the Bible where you
left it. When you open it, you pick it up; while you read on, it comes with you; when you
go somewhere else, you have set it down where you were. Nothing ever makes, moves or
merges a ribbon behind your back: every ribbon was made by you, and it moves only while
you are reading with it.

**Decisions:**
1. **Three different things, three glyphs, three places.**
   - A **bookmark** marks a verse and never moves (Library, `bookmark.fill`).
   - A **ribbon** marks where you are in something you're reading, and moves on as you read
     from it (Go To's Ribbons section, the ribbon glyph, §11.2.1).
   - A **plan** is a schedule (Go To's Reading Plan section, its circle, §11.3).
   - Recent stays History's trail of places, and it drops the chapters a ribbon shows, so
     nothing is listed twice.
2. **Ribbons live in Go To, not in the Library.** Opening a ribbon is going somewhere to
   read, and Go To is where you go. It's opened by tapping the title, the most-used control
   in the app, and its top is where Continue Reading was, so the habit carries over. The
   Library is for what you've marked in the text (highlights, notes, bookmarks, by book) and
   stays that way. One list in one place: no Ribbons tab in the Library.
3. **Plans are their own list again.** Round 5's Plans list and plan detail come back
   (with Start Plan and Start Instead). The Start Reading sheet is gone, because ribbons and
   plans no longer start the same way. A Chapter a Day stays, as a plan in the Plans list.
4. **Carrying is shown quietly.** Picking up a ribbon shows the toast "Reading with Morning"
   once. While you carry it, the title's long-press menu is headed "Reading with Morning"
   and offers Leave Morning Here. There's no new chrome on the page (principles 1 and 6).
   Putting a ribbon down by a jump is silent, because the rule is simple: it stays where you
   were.
5. **Where you were is your last rest, either way.** While carried, a ribbon takes the place
   of every scroll rest, forward or back. A peek ahead never costs you verses, and a
   glance back costs only a re-read. The one refinement: once a chapter is counted read, its
   end counts as the next chapter's top, so a finished chapter leaves the ribbon at
   "Romans 9", not at "Romans 8:39".
6. **The back capsule undoes a jump.** It puts a carried ribbon down when it takes you
   away, like any jump. But if the jump it undoes put a ribbon down, coming back picks that
   ribbon up again. Following a cross reference and coming back keeps you reading with
   Morning.
7. **Order is the order you made them.** The list never reorders itself, so "Morning" stays
   where it is. There's no reordering in this round (§11.8, question 3).
8. **At most 12 ribbons.** A printed Bible has two or three. Twelve is plenty and keeps the
   section short.
9. **Migration keeps what was likely real:** up to three of the newest readings from the
   last 14 days become ribbons named after their books (§11.4).

### 11.1 Model and rules (portable `ribbons.l8`, tested by `test_ribbons.l8`)

`ribbons.l8` replaces `readings.l8`. It has no UIKit, and times are given by the platform.

#### 11.1.1 Terms
- **Chapters** are numbered through the Bible as in Round 6: 0 is Genesis 1, 1188 is
  Revelation 22, BSB-numbered (R4.1), and x+1 crosses book boundaries.
- A **ribbon** K has:
  - an id (a positive integer, never reused while the file exists);
  - a name (1–40 characters, trimmed, tabs and newlines turned into spaces);
  - a place (K.c, K.v, K.frac), as `measure_place()` gives one: V = 0 means the chapter's
    top;
  - K.made and K.last (unix times). K.last is set when K is made, moved here, or moved
    by reading. It orders nothing; the row shows it as a time word.
- **Carried:** at most one ribbon at a time is carried (`carried` = its id, or 0).
- A **scroll rest** is Round 6's: the reader comes to rest (a scroll ends, the app goes to
  the background, or a sheet is presented) after the finger or Listen's following scroll
  has moved the text since the last jump or pickup. A jump's arrival or its settle isn't
  one.
- A **chapter read** is §10.1.2's signal (20 s of rest in total and its last verse seen),
  or Listen finishing the chapter. It runs whether or not a plan is followed, as Round 6
  built it.
- A **jump** is every arrival that isn't a scroll: Go To (a book, a chapter, a reference, a
  Recent or History row, a plan's row, a ribbon's row), search results, links and cross
  references in the text, a preview's Open in Reader, Compare's switch, a reminder opened,
  the status bar's tap (a jump since review r6-1, item 3) and the back capsule.

#### 11.1.2 Making a ribbon
`ribbon_make(name, c, v, frac, now)`:
- Appends K at the end of the list, with made = last = now, and returns its id.
- An empty name (after trimming) becomes the **default name: the place's book name**
  ("Romans"; Psalms reads "Psalms"). If another ribbon already has that exact name, the
  default becomes "Romans (2)", then "(3)". A name the reader types is kept as typed, even if
  another ribbon has it.
- Refused when there are 12 ribbons (the UI never asks, §11.2.1).
- Ribbons may share a place. Two ribbons at John 3 are two ribbons; nothing merges.
- The log says "bible: ribbon made: Morning at MRK 1".

#### 11.1.3 Picking up and putting down
- **Pick up** K: `carried` = K. It's done by opening K (its row), by making K, by Move
  Ribbon Here, and by the back capsule's undo (rule P4). Picking up doesn't change K's
  place or K.last. The log says "bible: ribbon picked up: Morning".
- **Put down:** `carried` = 0. K keeps the place it has, which is the last rest's (rule M1)
  or a read chapter's next top (M2). Putting down never measures the screen again.
  - P1. Any jump puts the carried ribbon down, **before** the jump moves the reader. Opening
    another ribbon is a jump, so the first ribbon is put down where you were, then the
    other is picked up.
  - P2. **Leave Morning Here** (the title's menu) puts it down. Its place is first made the
    current place, by measuring once (a rest), then it's put down.
  - P3. Deleting the carried ribbon puts it down.
  - P4. **The back capsule's undo.** When P1 puts K down for a jump, the reader remembers K's
    id with that jump's origin, which is the place the capsule returns to. When the
    capsule is tapped and goes back to that origin, it's a jump (so P1 applies to anything
    carried at that moment), and then K is picked up again, with the toast. Any other jump
    replaces the memory (the capsule then points somewhere else), and deleting K, or picking
    it up or moving it by any other way, clears it.
  - The log says "bible: ribbon put down: Morning at MRK 3:7".
- **Sheets don't put a ribbon down.** Library, Search before a result is chosen, Reading
  settings, Study, a passage preview (until Open in Reader), Compare (until a switch), the
  note editor and Go To itself are all over the reader without moving it. Only their jumps
  do.
- **Carrying survives relaunch.** The reader restores its place, and the carried ribbon is
  still carried.

#### 11.1.4 How a carried ribbon moves
Only the carried ribbon K moves, and only by these two rules. A ribbon that isn't carried
never moves, except when you choose Move Ribbon Here.
- **M1. Scroll rest** at (c, v, frac): K takes that place, in any chapter, forward or back,
  across book boundaries too, and K.last = now.
  - **The exception:** if c has been counted read since K was picked up, and c's last
    verse is on screen at the rest, K takes **(c+1, 0, 0)** instead, unless c is
    Revelation 22, which keeps (c, v, frac).
  - The log says "bible: ribbon moved: Morning to MRK 2:5" when the place changes.
- **M2. Chapter c counted read** (by rest or by Listen) while K.c = c: K moves to
  **(c+1, 0, 0)** and K.last = now. Revelation 22 read leaves K where it is. Nothing ends
  or leaves the list.
- **Examples (each tested):**
  - Picked up at Romans 8:12, scrolled and rested at 8:20 → Romans 8:20.
  - Then scrolled back and rested at 8:15 → Romans 8:15 (where you were).
  - Read on into Romans 9 and rested at 9:4 → Romans 9:4.
  - Romans 8 counted read while resting at its end → "Romans 9". A rest there again (its
    end still on screen) keeps "Romans 9". Scrolling up into 8:30 and resting → 8:30.
  - Romans 16 read → "1 Corinthians 1".
  - Listen reads on from Romans 8:12 through to the end of the chapter → "Romans 9"; its
    following scroll's rests move K verse by verse as M1.
  - Picked up at Romans 8, then a cross reference to Psalm 23: K stays at its last rest in
    Romans 8. Rests in Psalm 23 don't move it. The capsule back to Romans 8 picks it up
    (P4), and reading on moves it again.
  - Not carried: reading Romans 8 with a ribbon sitting at Romans 8 moves nothing. That
    ribbon follows only once it's opened (or moved here).

#### 11.1.5 Move Ribbon Here, rename, delete
- `ribbon_move_here(K, c, v, frac, now)`: K takes the current place, K.last = now, and K is
  picked up (the carried one, if another, is put down first, where it is). The log says
  "bible: ribbon moved here: Romans to ROM 8".
- `ribbon_rename(K, name)`: trimmed as §11.1.1. An empty name keeps the old one.
- `ribbon_delete(K)`: the line leaves `ribbons.tsv`. If K was carried, carrying ends. History
  still has the places, so nothing is lost. The log says "bible: ribbon deleted: John".

#### 11.1.6 Files (Application Support/SmoothBible/, §4.3's conventions)
These are UTF-8, tab-separated, one record per line, rewritten whole (`name.tmp`, then
`rename`). Malformed lines are skipped (§8.9.4).
- **`ribbons.tsv`:**
  - `RIBBON\tID\tNAME\tBOOK\tC\tV\tFRAC\tMADE\tLAST`, in list order (the order made).
  - `CARRIED\tID`, at most one line, and only when one is carried.
  - A `CARRIED` naming no ribbon is ignored. Two lines with the same id keep the first.
  - It's written when a ribbon is made, moved, renamed, deleted, picked up or put down.
    That's at most once per rest, the same rate as `save_place`.
- **`plan.tsv`, `plans-done.tsv`** and the plan's defaults are unchanged (§10.1.2, §11.3).
- **`read.tsv`** is no longer written or read. It's left where it is.
- **`readings.tsv`** is read once and renamed `readings-r6.tsv` (§11.4).

#### 11.1.7 Tests (`test_ribbons.l8`, in `make bible-test`; `test_readings.l8` goes)
- Making:
  - Default names: "Romans", then "Romans (2)".
  - A typed name is kept, even as a duplicate.
  - Trimming, tabs turned into spaces, a 41st character dropped.
  - The 13th is refused.
  - Ids are never reused after a delete.
- Every example in §11.1.4.
- Not carried: rests and chapters read move nothing.
- P1: a jump puts down, and a rest after it moves nothing.
- Opening B while A is carried puts A down at its last rest and picks B up.
- P4:
  - The capsule back to the origin picks K up.
  - After a second jump, the capsule (now pointing at the second origin) picks nothing up.
  - Deleting K clears it.
- P2 measures once, then later rests move nothing.
- M1's exception and Revelation 22.
- Move Ribbon Here moves and picks up.
- Rename to empty keeps the name.
- Delete of the carried ribbon ends carrying.
- Files: round trip, malformed lines, a stray `CARRIED`, duplicate ids.
- Migration (§11.4): every case there.

### 11.2 Screens

#### 11.2.1 Go To: the Ribbons section
This replaces Round 6's Continue Reading. Go To's sections with an empty query are now:
1. **Ribbons**
2. **Reading Plan** (§11.3.1)
3. **Recent**
4. **Old Testament**
5. **New Testament**

Everything is configured in `viewWillAppear:` (principle 6), and the sheet never
rearranges after it lands.
- **Header:** "Ribbons" when there's at least one ribbon. With none, the section is the
  "New Ribbon…" row alone, with no header, and the footer (the system footer style) "A
  ribbon keeps your place, and moves on as you read from it." That's the only place the
  idea is explained in the list.
- **A ribbon's row,** one per ribbon, in the order made:
  - A subtitle cell (`UIListContentConfiguration subtitleCellConfiguration`), with insets
    as Recent's rows.
  - Image: **the ribbon glyph** (§11.2.6), accent, 17 pt, in the same column as Recent's
    `clock.arrow.circlepath`.
  - Text: the name, in the body style (SF 17, ink): "Morning".
  - Secondary text (faint): the place, then History's time word for K.last: "Romans 8:12 ·
    Yesterday". "Romans 8" when V < 2; Psalms read "Psalm 41". The time words are Round 6's
    ("Now", "Today", "Yesterday", a weekday, "12 October").
  - Accessory: `UITableViewCellAccessoryDetailButton` (ⓘ), which pushes the Ribbon screen
    (§11.2.4).
- **New Ribbon…**, always last: accent text, image `plus` (accent, 17 pt), no accessory.
  It pushes the New Ribbon screen (§11.2.3) with the place = the reader's current place.
  With 12 ribbons it's disabled (faint), and the section's footer reads "12 ribbons is the
  most."
- **Tap a ribbon** → it's opened. That's a jump (P1 puts any carried ribbon down), done as
  Round 6's `reading_go`:
  - dismiss the sheet;
  - go to (K.c, K.v, K.frac) exactly, **with no flash**;
  - push history and show the back capsule;
  - settle again 0.6 s later unless the reader has scrolled (Round 6, note 8);
  - then pick K up, with the toast "Reading with Morning" (§11.2.5).
  - Tapping the ribbon already carried does the same. You arrive where it is, which is
    where you were.
- **Swipe to delete**, through §3.5's mechanism (`canEditRowAtIndexPath:` YES for ribbon rows
  and the plan row only). Ribbon rows say the system "Delete" (the plan row keeps
  "Remove", §11.3.1).
  - One `beginUpdates`/`endUpdates`, with the row deleted with
    `UITableViewRowAnimationAutomatic`.
  - When the last ribbon goes, reload the section with Fade, so the header goes and the
    footer comes in a fade.
  - At 12 → 11, reload "New Ribbon…" (Fade) so it's enabled again.
  - No confirmation: History keeps the place.
- **Recent** drops any chapter a ribbon's row shows, as Round 6 did.
- **Opening position:** Go To opens at its top when there's a ribbon or a followed plan.
  Otherwise it's scrolled to the current book (§3.2).
- **Accessibility:**
  - Label: "Morning. Romans, chapter 8, verse 12. Read yesterday."
  - Hint: "Opens here. Moves on as you read."
  - Custom actions (selector-based `UIAccessibilityCustomAction`): **Ribbon Details** and
    **Delete**.
  - Rows wrap at accessibility sizes, with nothing clipped.

#### 11.2.2 The reader: the title's long-press menu
The title button (and the compact title, §3.1.4) keeps its tap (Go To) and its `menu`
(Round 6's mechanism: `UIMenu` of selector-based `UICommand`s, rebuilt in `title_place()`
and whenever ribbons change). Its contents:
- **Not carrying:**
  1. **New Ribbon Here…**: the ribbon glyph, with the subtitle "Romans 8:12" (the current
     place). It presents the New Ribbon screen as a sheet with that place.
  2. **Move Ribbon Here**: a submenu (a child `UIMenu` with the ribbon glyph), with one
     command per ribbon in list order: the name, the subtitle its place ("Romans 3 ·
     Yesterday"). It's present only when there's a ribbon. Choosing one is
     `ribbon_move_here` (§11.1.5), then the toast.
- **Carrying Morning:** the menu's title (the `UIMenu`'s own title, shown as its header) is
  **"Reading with Morning"**. Then:
  1. **Leave Morning Here**: the ribbon glyph (P2). Then the toast "Morning left at Romans
     8:20".
  2. **New Ribbon Here…**, as above.
  3. **Move Ribbon Here**, listing the other ribbons only.
- With 12 ribbons, New Ribbon Here… is disabled (`UIMenuElementAttributesDisabled`).
- **Accessibility:**
  - The title's `accessibilityValue` is "Reading with Morning" while carried.
  - Custom actions: **New Ribbon Here**, plus **Leave Morning Here** while carried.
    (Move Ribbon Here is in Go To for VoiceOver users: open the ribbon.)
- **Nothing else changes in the reader:** no button, badge or tray action. (Owner
  amendment 2026-10-19: one exception, the carried ribbon's glyph by the title, below.)
- **Owner amendment 2026-10-19: the carried ribbon by the title.** This answers §11.8
  question 1 the way its fallback offered, so carrying can be seen without long-pressing
  the title.
  - While a ribbon is carried, the ribbon glyph (§11.2.6, 15 pt, accent) sits just left of
    the bar title's name, about 6 pt from it and vertically centered. It's in the title's view,
    so it scales and fades with the title as the bar collapses into the compact band.
  - It fades in on pickup and out on put-down (0.2 s; at once with Reduce Motion).
  - The bar shows no name: it stays quiet. The long-press menu is unchanged. The title's
    VoiceOver value is "Reading with Morning", as before.
  - The title stays centered. Only when a long name ("Song of Solomon 8") leaves no room
    does the title move right, just as far as the glyph needs, and its name is cut at its
    end if it must be. The title doesn't grow past the Large text size, so the largest
    text size changes nothing here (shots 184–189).

#### 11.2.3 New Ribbon
A run-time UITableViewController, insetGrouped, with the inline title **"New Ribbon"**. Its
global is held until its sheet has gone (§10.7a note 15). It's shown two ways:
- **Pushed in Go To** (from "New Ribbon…"): the back button on the left, **Add** on the
  right.
- **Presented from the reader** (New Ribbon Here…): a `UINavigationController` page sheet,
  detent large, with the grabber. System **Cancel** on the left, **Add** on the right.
- Add is `UIBarButtonItemStyleDone` and always enabled.

Everything is configured before the push or presentation begins:
- **Section 1** (no header): one cell holding a `UITextField`, with:
  - insets as a value cell's, and the body font;
  - **placeholder = the default name** ("Mark"), faint, and empty text;
  - `clearButtonMode` WhileEditing, `autocapitalizationType` Words, `returnKeyType` Done
    (Return = Add);
  - and it becomes first responder in `viewWillAppear:`, so the keyboard rises with the
    sheet or the push.
  - Leaving it empty and tapping Add takes the placeholder: the ribbon is called "Mark".
    Typing replaces it ("Morning", "With Anna").
  - Footer: "A ribbon keeps your place, and moves on as you read from it."
- **Section 2, header "Place":** Round 6's Begin At rows, reused:
  - **Book** (value "Mark", disclosure) pushes Go To's book rows in choose mode.
  - **Chapter** (value "1", disclosure) pushes §3.2's grid in choose mode. For a
    one-chapter book it reads "1", dimmed, with no disclosure.
  - The exact verse given (from the reader, or Go To's current place) is kept while
    neither row changes. The Chapter row's value then reads "1:21". Choosing a book or
    chapter makes the place that chapter's top. The placeholder follows the book
    ("Jude"); it changes while the screen is under the pushed chooser, so it's never seen
    changing.
- **Add:**
  1. `ribbon_make` (§11.1.2).
  2. Dismiss the sheet (or Go To).
  3. If the place isn't the reader's current place, jump there exactly, with no flash, with
     history and the capsule (P1 puts any carried ribbon down first). From the reader at
     its own place, the reader doesn't move.
  4. Pick the new ribbon up (the carried one, if another, is put down where it is), and show
     the toast "Reading with Morning".
- **Cancel** (or back, or a swipe down) makes nothing.

#### 11.2.4 Ribbon (pushed by a row's ⓘ)
A run-time UITableViewController, insetGrouped, with the inline title = the name. Its
global is held until its sheet has gone.
- **Section 1, header "Name":** the same text-field cell, with text = the name and no
  first responder. Editing ends with Return or by leaving the screen: the trimmed name is
  saved (principle 4), and the screen's title and Go To's row follow. Empty restores the old
  name.
- **Section 2, header "Place":** one subtitle row, with the text "Romans 8:12" and the
  secondary "Read yesterday" (faint). A disclosure-less row that goes somewhere: a tap
  opens the ribbon exactly as its Go To row does.
- **Section 3:** **Delete Ribbon**, centered, systemRed. It deletes (§11.1.5) and pops. Go
  To's section is set again in its `viewWillAppear:`, under the pop. No confirmation, as
  the swipe.
- Accessibility: the field's label "Name", and the rows as buttons.

#### 11.2.5 The toast, and motion
- The toast is Round 6's (§3.3.3's style, 1.6 s, light impact haptic), with the ribbon glyph
  leading in place of `checkmark`.
  - "Reading with Morning" when a ribbon is picked up by opening, making, Move Ribbon Here
    or the capsule.
  - "Morning left at Romans 8:20" for Leave Here.
  - It's never shown for a put-down by a jump.
- **Motion:**
  - Go To arrives configured.
  - Deletion animates as §11.2.1 says.
  - ⓘ and New Ribbon… are system pushes.
  - The New Ribbon sheet rises with its keyboard (the system's own animation).
  - Opening a ribbon is the existing jump: the sheet's dismissal, an unanimated scroll and
    the capsule fading in, then the toast.
  - The ribbon moving happens with Go To closed, so it's never seen as motion.
  - Reduce Motion: as everywhere.

#### 11.2.6 The ribbon glyph (§2.6 gains a row)
SF Symbols has no ribbon marker, and `bookmark` is taken by the Library and verse
bookmarks, so the ribbon is a **template image drawn once in code** with `UIBezierPath`
inside `UIGraphicsBeginImageContextWithOptions` (as `ios_look.l8` already does), with
`imageWithRenderingMode:` AlwaysTemplate so it takes the tint.
- **Shape (owner amendment 2026-10-19, replacing the curved, forked strip, which read
  too much like the bookmark and was too detailed):**
  - **One straight, narrow, vertical strip**, 0.2 of its height wide (about a third of
    `bookmark.fill`'s width), filled, from 0.06 to 0.94 of the height.
  - A **small V notch** at its foot, 0.16 of the height deep.
  - No curve, no fork, no shading. It's drawn in the ribbon's tint.
- **Sizes:** drawn at the size it is shown, at the screen's scale, with the strip centered:
  the body text's size in Go To's rows, 17 pt in menus, 15 pt by the title, and 13 pt in
  the toast.
- **The test:** at small sizes it reads as "a thin ribbon", not "a bookmark". Shot 183
  shows round 8's glyph and this one at 13, 17 and 28 pt, each beside `bookmark.fill`.
- Add to §2.6's table: "Ribbon (Go To rows, title menu, toast): the ribbon glyph (drawn,
  template)".

#### 11.2.7 Each ribbon's color (owner amendment 2026-10-19)
So the bar's glyph tells which ribbon is carried, each ribbon has its own color.
- **The palette:** like a printed Bible's ribbons, in this order: **Red, Gold, Navy, Green,
  Purple, Brown, Slate**.
  - Each is a solid, deep shade on the light pages (Paper, White), a little deeper on
    Sepia's, and a lighter shade on the dark ones (Night, Black), so it reads on each
    page.
  - As a narrow solid strip, it never looks like a highlight's pale wash.
  - Light: B03A2E, B07D12, 2D4C80, 3A7A4C, 6F4C94, 7C5434, 5C6670. Sepia: A3352A,
    96680C, 2A4574, 346C43, 634387, 6A4628, 525A63. Dark: E8806F, E0B651, 86A8E0,
    82C292, BB9CE0, CFA27A, A8B0BA.
- **Default:** a new ribbon (and a migrated one) gets the first color no ribbon has. With
  all seven taken, it gets the one fewest ribbons have.
- **Choosing:** New Ribbon and Ribbon have a **Color** section (after the name, before
  Place) with one row of seven round swatches (30 pt, 12 pt apart).
  - Each swatch is a button whose VoiceOver label is its color's name. The chosen one has
    a checkmark in the page's color and the selected trait, so VoiceOver reads "Gold,
    selected, button".
  - A tap applies at once: in Ribbon, to the ribbon, kept, and everywhere its glyph is;
    in New Ribbon, to the ribbon Add makes.
  - The check moves with a 0.15 s cross-fade and a selection haptic. The bar's glyph, if
    it's that ribbon's, cross-fades too (0.2 s). There's no motion under Reduce Motion.
- **Where:** the glyph takes the ribbon's color everywhere. That means the bar's glyph,
  Go To's rows, the title menu (Leave … Here, and each Move Ribbon Here item), and the
  toast. On the toast's ink, the glyph uses the other themes' shade.
- **Kept:** `ribbons.tsv`'s `RIBBON` line gains a tenth field, the color's name in lower
  case (`gold`). A line without it (an older file's), or with an unknown name, is given
  the default, in order, and the file is written again. Tested in `test_ribbons.l8`.
- **Shots:** 183a (Go To with several colors), 183b (New Ribbon's swatches), 183c
  (Ribbon's, with Romans changed to Green), 183d and 183e (the bar's glyph green, then
  navy), and 183f and 183g (Night: Go To and the bar).

### 11.3 Plans, on their own list

#### 11.3.1 Go To: the Reading Plan section
The second section, under Ribbons:
- **With a followed plan:**
  - Header **"Reading Plan"**.
  - Row 1 is **Round 6's plan row, unchanged**: the circle image, today's readings ("Genesis
    1–3"), "Bible in a Year · Day 1 of 365" with " · 2 days unfinished" or " · Done", ⓘ →
    the plan's days, a tap → today's first unread chapter (a jump), swipe **Remove** = Stop
    Plan, and VoiceOver's Mark as Read, Remove and Plan Details.
  - Row 2: **Reading Plans**, image `calendar` (faint, 17 pt), ink text, disclosure. It
    pushes the Plans list.
- **Without one:** the **Reading Plans** row alone, with no header (a lone way in needs no
  title).

#### 11.3.2 Plans, and a plan's detail (Round 5's, restored)
These are Round 5's §10.1.4 screens, as built in 1.0 (13). Restore their code from git,
before `9ee1d511`. There are three changes:
1. **Plans** (inline title "Reading Plans") gains a second section, header **"From a
   Book"**, with one subtitle row, **A Chapter a Day**, secondary "One chapter a day
   through a book you choose", and a disclosure. It pushes §11.3.3.
2. **A plan's detail** (not followed) has Round 5's toolbar again: **Start Plan**, or
   **Start Instead** while another plan is followed, with "Your progress in Bible in a Year
   will be kept." under the description (§10.7a note 5). Its circles stay dimmed and
   disabled until it's started (§10.7a note 6). The followed plan's detail (from the row's
   ⓘ or from Plans) is Round 6's days: the reminder, circles that mark, and **Stop Plan**.
3. **Starting** (Start Plan, Start Instead or §11.3.3's Start Plan) is Round 6's start:
   - `plan.tsv` is written, the old plan archived and its reminder off;
   - Go To is dismissed and the reader jumps to day 1's first chapter, with history and
     the capsule (P1 puts a carried ribbon down);
   - then the toast "Started Bible in a Year" (with `checkmark`).

#### 11.3.3 A Chapter a Day (pushed from Plans)
- insetGrouped, with the inline title **"A Chapter a Day"**.
- **Section 1, header "Begin At":** Book and Chapter, the same rows as §11.2.3's Place,
  starting at the reader's current book and chapter.
- **Section 2:** one row (not selectable), with the plan's name "Romans, a Chapter a Day"
  and the secondary "Romans 3–16 · 14 days" (Psalms: "Psalms, a Psalm a Day", "Psalms
  23–150 · 128 days"). It's updated in place as Begin At changes.
- **Toolbar:** Start Plan or Start Instead, as a plan's detail. When the chosen chapter
  leaves fewer than 2 days (the last chapter, or a one-chapter book), the item is disabled
  and section 2's secondary reads "Choose an earlier chapter."
- The plan itself is Round 6's former §11.1.2b (git `07d833a7`): `day1-<BOOK>-<C>` in
  `plans.l8`, unchanged and still tested in `test_plans.l8`.

#### 11.3.4 What stays exactly as it is
- `plan.tsv`, `plans-done.tsv`, `planReminder`, `planReminderMinutes` and `planDoneDay`.
- The reminder and its open path.
- Day Done's toast.
- A plan followed in 1.0 (15) carries over with its progress and reminder.
- Reading a plan's chapters while carrying a ribbon moves the ribbon too (you're reading
  with it). A plan never makes or moves a ribbon on its own.

### 11.4 Migration from 1.0 (15)
At the first launch with this build, when `readings.tsv` exists and `ribbons.tsv` doesn't:
- Of its `READING` lines, take those with LAST in the **last 14 days**, newest LAST first,
  **at most 3**.
- Each becomes a ribbon at its place (C, V, FRAC), with MADE = STARTED and LAST = LAST,
  named after its book by §11.1.2's default rule ("Romans", "John (2)").
- They're listed in that order (newest first), and none is carried.
- Rename `readings.tsv` to `readings-r6.tsv` (kept, never read again; principle 4). Leave
  `read.tsv` alone. Remove the `readingsSeeded` default.
- The log says "bible: ribbons migrated 3 of 5".
- There's no toast or message: the owner opens Go To and finds his places, under a new name.

**Why this and not all or none:** the readings were made automatically, so some are
casual-reading noise. Converting every one would hand the owner a list of ribbons he never
chose, which is the confusion he's asking to remove. Dropping all would lose the places he's
actually reading through (1.0 (15) has been in use only a few days). The newest few from the
last two weeks are almost certainly real, three is what a printed Bible has, and every
dropped place is still in History. A ribbon he doesn't want is one swipe.

**Tests:**
- Five recent lines keep the newest 3.
- A line 15 days old is dropped.
- Two in one book are named "Acts" and "Acts (2)".
- `CLEARED` lines are ignored.
- A second launch does nothing.
- No `readings.tsv` does nothing.

### 11.5 Builder notes (where it goes)
- **`ribbons.l8`** (portable, `tag bible`) holds §11.1: the list, carrying, M1/M2, P1–P4's
  model side (the remembered put-down id lives here, set and cleared by calls from the
  reader), the file lines, migration from readings lines, and the row's words. Reuse
  `readings.l8`'s place and time words (`fput_reading_place`, `fput_when`) and its event
  log. `readings.l8` and `test_readings.l8` go once `ribbons.l8` has their reusable parts.
- **`ios_ribbons.l8`** (renamed from `ios_reading.l8`) keeps:
  - the rest plumbing: `rd_scrolled`, `reading_jumped`/`reading_scrolled`, and
    `reading_rested`/`reading_rest_now`, now calling `ribbon_rest`;
  - `reading_go` (now `ribbon_open`) and its settle;
  - the row cell (now with name and ⓘ);
  - the title's menu functions;
  - the Begin At choosers (`sta_open_books`, the grid's choose mode).

  These go: Round 6's rule 2 dwell timer (`readingDwelt:`), Reading (Show All), Start
  Reading, the grid's toolbar (`grid_will_appear`/`grid_will_go`/`grid_toolbar`) and
  `startReadingHere:`.
- **P1's hook:** every jump already passes through `jump()`/`arrive()` (which call
  `reading_jumped`), and `reading_go` and the capsule have their own paths. Put the
  put-down in one function, `ribbon_jumped(is_capsule)`, called from each, **before** the
  reader moves. The capsule's path calls it, then `ribbon_capsule_back()` after arrival
  for P4. The remembered id is stored beside the capsule's place (the history origin the
  capsule returns to), so it can't drift from what the capsule does.
- **M2:** `chapter_read_now(c)` calls `ribbon_read(c)` in place of `chapter_read`.
  `plan_mark_read` is still called only with a plan. The demo's `demo_read` and Listen's
  `plan_heard` go through it unchanged. M1's exception needs "read since pickup": keep a
  small set of chapters read since the last pickup, cleared at pickup.
- **Go To:** `today_build` makes the Ribbons section (ribbon rows, New Ribbon…) and the
  Reading Plan section (the plan row, Reading Plans). Round 6's kinds for readings, Show All
  and Start Reading… go.
- **The text field cell:** a plain `UITableViewCell` with a `UITextField` added to its
  `contentView`, constrained to the layout margins. Use `delegate` (the app object) for
  `textFieldShouldReturn:` and `textFieldDidEndEditing:`, which is target-action and
  delegate only, with no blocks. Set `adjustsFontForContentSizeCategory`.
- **The title's menu:** the header is `menuWithTitle:children:`'s title. The submenu is
  `menuWithTitle:image:identifier:options:children:` with options 0. Each command's
  `propertyList` is the ribbon's id (an NSNumber), as Round 6 passed the chapter.
- **Strings** are plain: "ribbon", "Reading with", "Leave … Here", "Move Ribbon Here".
  There's no "track", "progress", "streak", "resume" or "Continue Reading" anywhere.
- **§12 (Listen)** is unaffected, except that `plan_heard`'s "moves a reading" now means
  M2 for the carried ribbon.

### 11.6 CI for Round 6 (revised)
**The demo group `reading` becomes `ribbons`,** with the demo clock (§10.0). Shots 160–182
are replaced by these. Before the first launch it seeds:
- a 1.0 (15) `readings.tsv` with four readings: Romans 3 (LAST 2 hours ago), Acts 10:9
  (yesterday 21:20), John 15 (3 days ago) and Psalm 24 (20 days ago), plus a `CLEARED`
  line;
- `readingsSeeded` = true;
- `history.tsv` as before.

There's no plan and no `ribbons.tsv`.

| Shot | Action | Expected |
|---|---|---|
| `160-ribbons-migrated` | Launch; open Go To | "Ribbons": Romans "Romans 3 · Today", Acts "Acts 10:9 · Yesterday", John "John 15 · <weekday>", each with the ribbon glyph and ⓘ; then "New Ribbon…". Then the "Reading Plans" row with no header; Recent without Romans 3, Acts 10 or John 15. The log has "ribbons migrated 3 of 4"; `readings-r6.tsv` exists |
| `161-title-menu` | Jump to Mark 1 by the grid; long-press the title (the demo opens the menu, or logs "title menu: New Ribbon Here… · Mark 1 / Move Ribbon Here: Romans, Acts, John") | "New Ribbon Here…" with "Mark 1", and "Move Ribbon Here ›" |
| `162-new-ribbon` | Choose New Ribbon Here… | The sheet: the field with placeholder "Mark" and the keyboard up; the footer; Place "Mark", "1"; Cancel and Add |
| `163-ribbon-made` | The demo types "Morning"; Add | The reader at Mark 1, not moved; the toast "Reading with Morning" with the ribbon glyph. The log has "ribbon made: Morning at MRK 1" and "picked up: Morning" |
| `164-carried-menu` | Long-press the title | The menu headed "Reading with Morning": Leave Morning Here, New Ribbon Here…, Move Ribbon Here › |
| `165-follows` | `demo_scroll_rest` at Mark 1:21, then at Mark 2:5 (finger scrolls); open Go To | Morning, last in the list: "Mark 2:5 · Now" |
| `166-back-a-little` | Close; `demo_scroll_rest` at Mark 2:1; open Go To | Morning "Mark 2:1 · Now" (where you were, either way) |
| `167-chapter-read` | Close; `demo_scroll_rest` at Mark 2's end; `demo_read` Mark 2; open Go To (a sheet's rest at the end again) | Morning "Mark 3 · Now" (the end of a read chapter is the next one's top) |
| `168-jump-puts-down` | Close; search "love" → the 1 Corinthians 13 result; `demo_scroll_rest` at 1 Corinthians 13:4; open Go To | Morning still "Mark 3". The log has "ribbon put down: Morning at MRK 3" and no "moved" after it |
| `169-capsule-picks-up` | Close; tap the capsule ("‹ Mark 2") | The reader back at Mark 2's end; the toast "Reading with Morning"; the log "picked up: Morning (back)" |
| `170-sheets-keep` | A preview of a cross reference on screen, then close it; the Library, then Done; `demo_scroll_rest` at Mark 3:7; open Go To | Morning "Mark 3:7 · Now" (the preview and the sheet didn't put it down) |
| `171-open-another` | Tap Acts | The reader at Acts 10:9 exactly, no flash, the capsule "‹ Mark 3"; the toast "Reading with Acts". The log has "put down: Morning at MRK 3:7" and "picked up: Acts" |
| `172-listen-carries` | Listen; the demo ends Acts 10 (Listen's chapter-end hook); stop Listen; open Go To | Acts "Acts 11 · Now" |
| `173-leave-here` | Close; the title's menu → Leave Acts Here; `demo_scroll_rest` at Acts 11:5; open Go To | The toast was "Acts left at Acts 11"; Acts still "Acts 11" (not carried, so not moved) |
| `174-move-here` | Close; jump to Romans 8 by the grid; the title's menu → Move Ribbon Here › Romans | The toast "Reading with Romans". The log has "ribbon moved here: Romans to ROM 8" |
| `175-ribbon-details` | Open Go To; tap ⓘ on Morning | Ribbon: title "Morning"; Name "Morning"; Place "Mark 3:7 · Read today"; "Delete Ribbon" in red |
| `176-renamed` | The demo sets the name "With Anna" and ends editing; back | Go To's row reads "With Anna", "Mark 3:7 · Today" |
| `177-deleted` | Delete John (the demo calls `commitEditingStyle:` on its row) | 4 ribbons: Romans, Acts, With Anna. The log has "ribbon deleted: John" |
| `178-new-from-go-to` | New Ribbon… (pushed; placeholder "Romans", Place "Romans", "8"); the demo chooses Book → Jude (Chapter "1" dimmed); Add with the field empty | The reader at Jude; the toast "Reading with Jude"; Go To shows "Jude", "Jude · Now" last |
| `179-ax-goto-ribbons` | (Accessibility size) Go To | The ribbon rows and Reading Plans wrap; nothing clipped |
| `180-plans` | Tap Reading Plans | Reading Plans: the four plans, then "From a Book" with A Chapter a Day |
| `181-chapter-a-day` | Push A Chapter a Day; the demo chooses Hebrews, 1 | Begin At "Hebrews", "1"; "Hebrews, a Chapter a Day · Hebrews 1–13 · 13 days"; the toolbar's Start Plan |
| `182-plan-and-ribbons` | Start Plan; open Go To | The reader went to Hebrews 1 with the toast "Started Hebrews, a Chapter a Day". Go To: Ribbons (Romans, Acts, With Anna, Jude), then "Reading Plan": the plan's row "Hebrews 1 · Hebrews, a Chapter a Day · Day 1 of 13" with ⓘ, and "Reading Plans". The log has "put down: Jude" |

- **Recording sequence 13** (replaced): Go To with four ribbons.
  1. Swipe Delete the second (the row slides away, nothing else jumps).
  2. ⓘ on a ribbon, then back (system pushes).
  3. Tap a ribbon (the sheet dismisses, the reader is at the place, the capsule fades in,
     then the toast).
  4. Long-press the title → New Ribbon Here… (the sheet and its keyboard rise together,
     with nothing appearing after it lands), then Cancel.
- **The `plans` group (§10.6) follows the restored list:**
  - 140: Go To shows "New Ribbon…" with its footer, then "Reading Plans" (no headers).
  - 141: the Plans list, with From a Book.
  - 142: Bible in a Year's detail, with the toolbar's Start Plan.
  - 143: Start Plan → the reader at Genesis 1, then the toast. Go To's "Reading Plan"
    section has the plan's row and Reading Plans.
  - 144 and 146: as in Round 6 (the row's half circle; " · 2 days unfinished").
  - 147–149: through the row's ⓘ.
  - 149b: Stop Plan, then Reading Plans → Bible in a Year → Start Plan again.
  - 158: the section at an accessibility size.
  - The other shots are unchanged.
- **Logs:** every make, pick-up, move, put-down, move-here, rename, delete and migration is
  logged as above, so the walk can be checked from text.
- **Linux:** `test_ribbons.l8` in `make bible-test` (in place of `test_readings.l8`).
  `test_plans.l8` is unchanged.

### 11.7 Round 6 (revised) acceptance
Round 6 (revised) is approved when:
- **Nothing is automatic.** No ribbon is made except by New Ribbon (or migration, once).
  No ribbon moves unless it's carried or chosen for Move Ribbon Here (160, 168, 173).
- **The rules are exactly §11.1's,** and the tests pass:
  - A carried ribbon follows rests both ways (165, 166).
  - A read chapter's end is the next chapter's top (167).
  - Listen carries it (172).
  - Every jump puts it down (168, 171, 182).
  - Sheets and previews don't (170).
  - The capsule's undo picks it up again (169).
- **Bookmarks are untouched.** The Library's three segments, shots 20–22 and 49–51, show
  no change, and the ribbon glyph is plainly not the bookmark (§11.2.6).
- **Go To:**
  - Ribbons, then Reading Plan, then Recent, configured before the sheet lands.
  - The empty state is one row and its footer (140).
  - Recent repeats no ribbon's chapter.
  - Deletion animates as specified.
  - Opening a ribbon returns to its exact place, with no flash, the capsule and the toast
    (171).
- **The reader** gains only the title menu's items and the toast. While carried, the menu
  is headed "Reading with …" (164).
- **New Ribbon and Ribbon:**
  - The placeholder is the default name, and Add with it empty uses it (178).
  - Typed names are kept.
  - Rename is saved as typed (176). Delete works from both the swipe and the screen.
  - The keyboard rises with the sheet.
  - The 12-ribbon limit disables both ways in.
- **Plans are their own list again:**
  - Round 5's Plans and detail, with Start Plan and Start Instead (141, 142).
  - A Chapter a Day from Plans (181).
  - The plan row, its days, the reminder and Day Done are unchanged.
  - A plan followed in 1.0 (15) carries over.
- **Migration** is §11.4's, once (160).
- **VoiceOver:**
  - Ribbon rows read their labels, with Ribbon Details and Delete.
  - The title reads "Reading with Morning" and offers its actions.
  - Accessibility sizes wrap (179, 158).
- Shots 160–182 match and recording sequence 13 shows no abrupt change. No other shot
  regresses, except the `plans` group's 140–149b and 158, as listed in §11.6.

### 11.8 Questions only the owner can answer
These four are decided above; the owner may overrule:
1. **Is "carrying" visible enough?** The pickup toast and the title menu's header are the
   only signs, with no glyph on the page. On a device, check whether you ever wonder if
   Morning is following you. If you do, the fallback is a small ribbon glyph before the
   title's chapter name while carried, cross-faded in and out over 0.2 s.
2. **The capsule's undo** (decision 6): coming back by the capsule from a cross reference
   picks the ribbon up again. Is that what you'd expect, or should only opening the ribbon
   pick it up?
3. **Order:** ribbons stay in the order made, with no reordering. If you want to arrange
   them, the next step is the Ribbon screen's "Move Up" or a system Edit mode in a pushed
   Ribbons list. Say if it's wanted.
4. **Migration:** the newest three readings from the last two weeks become ribbons named
   after their books, and the rest are dropped (still in History). Alternatively, convert
   none and start clean.

The owner left these four to the design (2026-10-19); they're built as decided above.

### 11.9 Builder notes (Round 6 revised, as built)
Where the build differs from the text above, or settles what it left open, and why:
1. **`ribbons.tsv` has a third line kind, `NEXT\tID`** (the next id to give). Without it,
   deleting the newest ribbon and relaunching would give its id again, and §11.1.1 says
   ids are never reused while the file exists. A file without it takes the greatest id plus
   one (tested). Unknown lines are skipped, so the format stays as §11.1.6 says otherwise.
2. **Kinds of jump for P4.** A jump with an origin (Go To, search, links, a preview's Open,
   Compare's switch, a reminder, a plan's start) remembers the ribbon it put down with the
   origin the capsule now points at. The capsule's own jump keeps what it is to pick up for
   its arrival, then remembers what it put down in turn, so tapping the capsule again (it
   toggles) picks that one up. **The status bar's tap, and opening the ribbon of the
   chapter on the screen** (no capsule, no history: review r6-1), put the carried ribbon
   down and remember nothing, as they leave the capsule pointing where it was.
3. **"Read since pickup"** (M1's exception) is kept in memory only, cleared at every pickup;
   a relaunch begins it again. **Leave Here** is a rest, so the exception applies to it
   (173's "Acts left at Acts 11", from the reader at Acts 10's end).
4. **A chapter's end "on screen"** is its row's foot between the bar and the bottom inset.
5. **The demo's times are real** (`time(0)`; only `today()` is the demo clock), so rows
   whose ribbon was moved in the last ten minutes read "Now": 175's Place reads "Read just
   now", and 176's row "Mark 3:7 · Now". The migrated ones read "Today", "Yesterday" and a
   weekday as 160 expects.
6. **166 rests at Mark 2:3, not 2:1:** by §11.2.1's rule a ribbon at verse 1 reads "Mark 2",
   which would not show the step back. 2:3 shows it.
7. **178's placeholder reads "Romans (2)":** the reader is at Romans 8 and a ribbon named
   "Romans" exists, so §11.1.2's default rule gives "Romans (2)". After Book → Jude it reads
   "Jude", and Add with the field empty makes "Jude". A shot **178a** (New Ribbon after
   Book → Jude: placeholder "Jude", Chapter "1" dimmed) is taken before Add; 178 is the
   reader at Jude with the toast.
8. **177 leaves three ribbons** (Romans, Acts, With Anna): John was the fourth. Jude (178)
   makes the four of 182 and of sequence 13.
9. **172's Listen:** the demo starts Listen at Acts 10:9 (the audio fixture), then gives the
   rest its following scroll would end in at Acts 10's end, then calls Listen's
   chapter-end hook (`chapter_heard`; counted in the demo for this group only,
   `demo_heard`, as plan_heard skips it elsewhere in CI), then stops Listen. The log has
   "chapter heard ACT 10" and "ribbon moved: Acts to ACT 11".
10. **161 and 164:** the title's menu is opened through its context-menu interaction where
    the simulator allows it, and always logged whole ("title menu: Reading with Morning
    [Leave Morning Here / New Ribbon Here… · Mark 1 / Move Ribbon Here: Romans, Acts,
    John]"), which `simulate.sh` checks.
11. **From 12 to 11 ribbons**, New Ribbon… is reloaded (faded) in the deletion's update, and
    the footer's "12 ribbons is the most." is cleared with a 0.2 s fade (a row update can't
    reload its section's footer).
12. **The plan row's Remove** reloads the Reading Plan section with a fade, so its header goes
    with the row (Reading Plans stays).
13. **The ribbon glyph** is drawn per size and kept: rows at the body text style's point size
    (so it grows with Dynamic Type, as the 17-point symbols do since review r6-1), menus at
    17, the toast at 13 with a 2-point baseline offset (as a symbol sits).
14. **New Ribbon's keyboard** rises with the sheet or push (the field made first responder
    in `viewWillAppear:` on the first appearance); back from the Book or Chapter chooser,
    UIKit gives the field its focus back, so the keyboard returns with the pop. Add "at the
    reader's own place" compares chapter and verse (verses 0 and 1 are the same top).
15. **Starting a plan** where the reader already is (A Chapter a Day from the chapter on the
    screen) dismisses Go To without a jump, so a carried ribbon stays carried.
16. **Review r7-1, Minor 6.** Go To, back from a screen pushed over it, was set again with
    `reloadSections:withRowAnimation:` in `viewWillAppear:`, while it was not yet on the
    window: the warning's cause in both groups. It now reloads whole (`reloadData`, which
    lays out nothing) while off the window, and in place otherwise. Every in-place update of
    Go To's sections first asks `on_window()`, which logs "table off the window, not
    updated: …" (with the demo's log) and leaves it to that reload. The Plans list, A
    Chapter a Day and New Ribbon reload whole in `viewWillAppear:` too. With each demo
    step's wall-clock time now logged, the plans group's remaining warning was placed in
    step 261: `esv_set_listed` inserted and deleted the ESV's section in the Versions and
    Acknowledgements lists after they had been popped. Off the window they now reload
    whole (logged the same way).
17. The Begin At choosers are shared by New Ribbon's Place and A Chapter a Day's Begin At
    (`bg_*` in `ios_ribbons.l8`); the grid in choose mode is a plain
    `UICollectionViewController`, its toolbar gone with Start Reading.
17b. **Owner amendments 2026-10-19 (after review r8-1):** the glyph is now a straight,
    narrow strip with a V notch (§11.2.6). The carried ribbon's glyph sits by the title
    (§11.2.2). The `ribbons` group adds 183 (the glyph before and after, a card the demo
    draws over the reader with round 8's drawing kept in the demo for it) and 184–189 (Song
    of Solomon 8 with Romans carried, expanded and compact, at the default and the
    largest text, then Leave Here, the glyph faded out). The log has "title ribbon shown
    1/0" and the glyph's and title's places ("bible: title Song of Solomon 8, ribbon
    shown 1, glyph x …, title x … w …").
18. **The `more` group's 70-history** had shown Start Reading since Round 6: its step chose
    Go To's section 0 as Recent's. It now chooses Recent's own section (after Ribbons and
    Reading Plan), so History shows again.
19. **The toast lasts 6 s in the demo** (1.6 s on a phone), so a shot taken after a step
    settles still has it (Round 5's Day Done does the same). It's why the toast still shows
    over sequence 13's title menu.
20. **Review r8-1's fixes:**
    - The title's menus are made again from a measured place after every arrival (a
      jump, the capsule, a ribbon opened, and their settles: `title_menus_fresh`). So New
      Ribbon Here… names the chapter arrived at ("· Romans 8" after the grid's jump, not
      Acts 11:5's verse).
    - Sequences 13 and 14 begin after a 6 s still lead-in, as the recorder writes nothing
      for its first seconds. Sequence 13 is marked from the step's own logged start
      ("at unix ms").
    - Where the video's time 0 falls differs from Mac to Mac: about 4.7 s before the
      recorder says "started" in one run, and about 3.9 s after its launch in another. So
      `*-transitions.txt` gives each sequence's marks twice: from the launch (the first
      line), and from "started" (`from-started`). Either can be a few seconds off. A
      sequence begins where the still lead-in (6 s or more with no change) ends. In
      sequence 13 that is the swipe Delete, which takes several frames either way.
    - At 12 → 11 the footer's emptied text is followed by an empty
      `beginUpdates`/`endUpdates`, so its height animates away. The `ribbons` group's step
      315 (log only) makes twelve ribbons. It logs "limit at 12" (the footer, and New
      Ribbon… not enabled) and the title menu's disabled New Ribbon Here…, deletes one,
      then logs "limit after a delete". `simulate.sh` checks all three.
    - Shot 163 is taken when the toast's log line appears (`step_toast`). Shot 158 is
      scrolled to the Reading Plan section.
    - Now Playing after a seek (§12, review r8-1): the seek's target is the elapsed time
      given until the player's own time is within 0.1 s of it, either way. A backward
      seek no longer clears it at the first poll.

---

## 12. Round 7 specification: recorded readings

Round 7 is one feature, asked for by the owner on 2026-10-18: Listen's computer voice
doesn't sound good, so the Bible should be read by people. The owner's calls, built into
what follows:
1. **Every version is read aloud.** Good recordings where they exist; the iPhone's better
   voices (Enhanced or Premium) where they don't; the standard voice last.
2. **The BSB is read by its CC0 human recordings** (Bob Souer, Barry Hays, Jordan
   Gilbert), **streamed directly from openbible.com**. We host no audio.
3. **The WEB** uses eBible.org's public-domain recording; **the KJV** uses openbible.com's
   only if it's licensed (LibriVox isn't wanted); **the ESV** uses the ESV API's audio
   endpoint, through our Worker; **the ASV and YLT** use iPhone voices.
4. Everything else is the designer's call.

It keeps everything from Rounds 1–6 except where this section replaces §8.7 (Listen).

### 12.0 What was checked (2026-10-18), and the decisions

#### 12.0.1 The recordings (each checked with listings, HEAD requests and the first bytes of sample files; nothing large downloaded)
| Version | Source | Reader | Licence | Files | Quality | Used? |
|---|---|---|---|---|---|---|
| BSB | `https://openbible.com/audio/souer/` | Bob Souer (human, professional) | CC0 1.0 (bereanbible.com/audio: "dedicated to the public domain (CC0 1.0)") | 1,189 chapters, `BSB_<NN>_<Abr>_<CCC>.mp3` | MP3 192 kbps mono 44.1 kHz; 5.1 GB in all, about 85 MB an hour | **Yes, the default** |
| BSB | `https://openbible.com/audio/hays/` | Barry Hays (human) | CC0 1.0 (same statement) | 1,189, `…_<CCC>_H.mp3` | MP3 about 100 kbps VBR mono (re-encoded 2025-10); 3.8 GB, about 45 MB an hour | Yes, a choice |
| BSB | `https://openbible.com/audio/gilbert/` | Jordan Scott Gilbert (human) | CC0 1.0 (same statement) | 1,189, `…_<CCC>_G.mp3` | MP3 192 kbps mono; 5.8 GB, about 85 MB an hour | Yes, a choice |
| WEB | `https://ebible.org/eng-web/audio/` | Winfred W. Henson (human, "a professional voice recording artist") | Public domain ("You may download, copy, and listen to this recording … freely") | 1,189 chapters (plus two duplicates, Psalm 71 and Luke 17, named "… (1).mp3"), irregular names such as `43_John/0999 John-Chapter Three.mp3` | MP3 128 kbps mono, 2016; 5.4 GB, about 58 MB an hour | **Yes** (with one caveat, below) |
| WEB | `https://ebible.org/webaudio/` | Michael Paul Johnson and volunteers | Public domain | 93 files: part of the Psalms and Gospels, whole-book files for the letters, some "plus music" | 2008–2010, stereo, incomplete | No (incomplete, mixed readers, music) |
| KJV | `https://openbible.com/audio/kjv/` | "David" (openbible.com/audio.htm: "KJV - David") | **None stated anywhere** (not on bereanbible.com/audio, which names only the three BSB readers; not in the files' tags) | 1,189, `KJV_<NN>_<Abr>_<CCC>.mp3`, 192 kbps, 7.3 GB, 2025 | "David" sits with the site's new voices (sophia, arabella, frederick_surrey, msb_*), whose names are those of a synthetic-voice library; almost certainly synthetic | **No** (unlicensed; §12.9 question 2) |
| ESV | `GET https://api.esv.org/v3/passage/audio/?q=John+3` | David Cochran Heath (human; the file's tag "Read by: David Cochran Heath", 2008) | Crossway, through the API (the owner's judgement: §12.0.2 decision 5) | One request answered **302** with `Location: https://audio.esv.org/hw/John%203.mp3` (no key and no signature in it; the body empty). That address answers **301** to `https://audio.esv.org/hw/mq/John%203.mp3`, which is **200** `audio/mpeg`, `Accept-Ranges: bytes`, 4.2 MB | MP3 128 kbps mono | **Yes** |
| ASV, YLT | — | — | — | No recording of either exists that is free, complete and human | — | iPhone voices |

What the readers say (checked by transcribing the first 20 s of a few chapters):
- **Section headings are not read** by any reader. **Psalm titles are read** ("Psalm 23. A
  Psalm of David."), as part of the chapter's start.
- **Gilbert announces every chapter** ("John, chapter 3."). Souer and Hays announce only
  the Psalms. So Souer goes from one chapter into the next without a spoken marker; that
  is how the recording is, and the reader's title push (§0.5) marks the change on screen.
- The recordings were made from **earlier BSB revisions**: there are small wording
  differences ("the signs you are doing" in Souer, "were doing" in Gilbert). The
  alignment (§12.2) tolerates them.
- **Henson reads the WEB's Classic edition, which says "Yahweh"** ("Yahweh is my shepherd")
  where our WEB (`engwebp`, §9.2.1) says "LORD". Everything else matches. Decision 3
  covers this.

**openbible.com's book abbreviations** (from the listings; identical for the three BSB
readers, and for the KJV), in book order 01–66: Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa
1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic
Nam Hab Zep Hag Zec Mal Mat Mrk Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tts
Phm Heb Jas 1Pe 2Pe 1Jn 2Jn 3Jn Jud Rev. Chapters are always 3 digits (`BSB_19_Psa_119.mp3`,
`BSB_65_Jud_001.mp3`). So the address is built, not listed:
`https://openbible.com/audio/<souer|hays|gilbert>/BSB_<NN>_<Abr>_<CCC><""|_H|_G>.mp3`.
Every file answered HEAD with `200`, `audio/mpeg`, `Accept-Ranges: bytes` (so AVPlayer can
stream and seek). eBible.org's names are irregular and must come from a manifest (§12.2.4).
eBible.org also answered **403** when its listings were fetched quickly one after another,
so everything that fetches from it in bulk is slow and polite (§12.2.2).

#### 12.0.2 Decisions (the designer's, with reasons)
1. **Sources, per version:**
   | Version | Source (default first) | Follows along |
   |---|---|---|
   | BSB | **Bob Souer** · Barry Hays · Jordan Gilbert · iPhone Voice | Verse by verse |
   | WEB | **Winfred Henson** · iPhone Voice | Verse by verse |
   | ESV | **David Cochran Heath** (ESV API) · iPhone Voice | **By chapter** (decision 4) |
   | KJV, ASV, YLT | iPhone Voice | Verse by verse (as now) |
   - **Bob Souer is the default BSB reader:** the best-known professional of the three,
     the recording the BSB itself leads with, and full 192 kbps. Barry Hays is the choice
     to suggest for cellular data (about half the size). The owner listens to all three
     and may change the default (§12.9 question 1); it's one constant.
   - **The choice is offered**, in one place (Voice, §12.4). People care who reads to
     them, and the three are equally licensed and equally aligned, so it costs only the
     timing files.
2. **When a recording can't play, Listen goes on in the iPhone's voice** from the same
   verse, and says so quietly ("iPhone Voice · Offline" in the player). It returns to the
   recording at the next chapter when the network is back. Listening never just stops
   because of a tunnel.
3. **The WEB is read by Henson despite "Yahweh".** A human reading of the WEB is far better
   than any synthetic one, and the difference is one name, read consistently. The Voice
   screen says so in its WEB footer. The alignment treats LORD/GOD as Yahweh. The text is
   not changed: §9.2's decision to ship `engwebp` stands.
4. **Verse following:**
   - **For the BSB and WEB, verse timings are computed once, offline, by forced
     alignment of each recording to our own text, and bundled** as small timing files
     (§12.2): about 130 KB each, about 520 KB for all four, about 200 KB more in the
     download. The reader then washes and follows the verse being read exactly as Round 3
     does, at no cost on the phone.
   - **The ESV follows by chapter.** Aligning it would mean holding the whole ESV text on
     our machine, past Crossway's 500-verse limit, so it isn't done. The player names the
     chapter ("John 3"), there is no verse wash, and following moves only at each chapter's
     start. Starting from a verse seeks to an estimate (§12.3.5).
   - On-device alignment was considered and rejected: a speech model on the phone, for
     work that never changes, is waste.
5. **The ESV audio goes through our Worker, which returns the address, not the sound.**
   The key stays on the server; the redirect target holds no key, so streaming it from
   audio.esv.org directly is safe and costs us no bandwidth. Each answer is remembered
   by the Worker for 30 days (the address only), so a chapter costs one API query a
   month, not one per listen. Audio queries count in the shared budget, but stop at
   **4,000 a day**, leaving 800 for reading the text (§12.6).
6. **Streaming, with a small cache and optional downloads.** The playing chapter
   streams. The next chapters are fetched ahead into a cache (10 ahead on Wi-Fi, 1 on
   cellular or in Low Data Mode, capped at 500 MB). That covers a commute's dead spots
   with no UI. For flights, a **book can be downloaded** in Voice → Downloads (§12.4.3).
   **The ESV is stream-only**: never cached or downloaded beyond AVPlayer's own buffer.
7. **The engine is AVQueuePlayer, with no blocks:**
   - KVO by `observeValueForKeyPath:ofObject:change:context:`.
   - Notifications by selector.
   - Time by polling a 10 Hz NSTimer in the run loop's common modes. Periodic time
     observers need blocks, so they aren't used.
   - CMTime is read with KVC and `-[NSValue getValue:size:]`, and passed by pointer
     (§12.3.1).
8. **The iPhone voice gets better, not just kept.** Listen picks the best installed English
   voice of any accent (Premium > Enhanced > standard; en-US preferred at equal quality;
   novelty voices excluded), and the user may choose one. When no Enhanced or Premium
   voice is installed, the app says once, calmly, where to download one (§12.4.2). Apple
   provides no public link to that Settings page, so the app gives the path in words.
9. **Speed** keeps its three segments. Recordings play at **0.85×, 1.0× and 1.25×** with
   the time-domain pitch algorithm (Apple's choice for speech). The speech rates stay
   0.42, 0.50 and 0.56.
10. **Lock screen and Control Center:** title, reader, version, artwork, elapsed time and
    duration. Play/pause, **previous/next chapter**, and scrubbing (for recordings).
11. **What isn't in this round:** a sleep timer, CarPlay-specific UI (Now Playing appears
    in CarPlay by itself), AirPlay pickers (Control Center has one), background URL
    sessions (their app-delegate hook needs a block), and audio for the interlinear or
    word study.

### 12.1 Model (portable `audio.l8`, tested by `test_audio.l8`)
- **Sources:** `SRC_SOUER`, `SRC_HAYS`, `SRC_GILBERT`, `SRC_HENSON`, `SRC_ESV` and `SRC_VOICE`.
  Each has:
  - its version;
  - its reader's name ("Bob Souer", "Barry Hays", "Jordan Gilbert", "Winfred Henson",
    "David Cochran Heath", "iPhone Voice");
  - its address rule (`audio_url(src, c)`: built for openbible.com, from the manifest for
    eBible.org, asked of the Worker for the ESV);
  - its timing file (none for the ESV and the voice);
  - whether it may be cached (not the ESV).
- **Chosen source per version:** defaults `listenSourceBSB` = souer, `listenSourceWEB` =
  henson, `listenSourceESV` = esv. The KJV, ASV and YLT are always the voice.
  `audio_source(text)` returns the chosen one.
- **Effective source for a chapter,** `audio_effective(text, c, online)`:
  1. The chosen recording, if the chapter is downloaded or cached, or the network is up and
     the source hasn't failed in the last 60 s.
  2. Otherwise the voice.
  A chapter whose timing line is flagged `missing` uses the voice.
- **Timing lookup:**
  - `verse_at(timing, c, t)` is the verse whose start ≤ t + 0.15 s, by binary search. It
    returns 0 before verse 1 (a psalm's title, Gilbert's "John, chapter 3"): nothing is
    washed, and the player names the chapter.
  - `time_of(timing, c, v)` is verse v's start, minus 0.3 s, clamped at 0.
- **The cache's rules** (`audio_cache_*`, pure functions over an index):
  - The total stays ≤ 500 MB.
  - Least-recently-played goes first.
  - Pinned: the playing chapter and the next two, and every downloaded book (those live
    elsewhere and aren't counted).
- **Tests** (`test_audio.l8`, in `make bible-test`):
  - All 1,189 openbible.com addresses for each reader. Spot-check exact strings:
    `BSB_19_Psa_119.mp3`, `BSB_65_Jud_001_H.mp3`, `BSB_26_Ezk_048_G.mp3`,
    `BSB_57_Phm_001.mp3`.
  - The manifest's 1,189 eBible.org paths parse.
  - `verse_at` at the edges: before verse 1, exactly at a start, past the end.
  - `time_of` clamps.
  - `audio_effective` covers each case.
  - The cache: 30 chapters of Souer never pass 500 MB; pinned chapters survive.
  - The timing files: every chapter's starts are increasing, and every chapter has a line.

### 12.2 Verse timings: the alignment pipeline (offline, run once by the builder on the laptop)

#### 12.2.1 What it makes
`programs/bible/data/audio/<id>.tim`, for `souer`, `hays`, `gilbert` and `henson`. It's
UTF-8 text, one line per chapter in Bible order (1,189 lines), after a header:
```
# smooth-bible timings 1 · souer · BSB · https://openbible.com/audio/souer/ · made 2026-10-19 · align.py 1 · WAV2VEC2_ASR_BASE_960H
GEN	1	27269	6545950	ok	412 655 731 …
```
- The fields are: book, chapter, duration (centiseconds), file size (bytes, for the
  download sizes of §12.4.3), and the flag.
- **Flags:**
  - `ok`: follow by verse.
  - `chapter`: the alignment wasn't trusted, so follow by chapter.
  - `missing`: no recording, so the voice is used.
- Then **N + 1 numbers**, in centiseconds:
  - verse 1's start (absolute);
  - each following verse's start, as the difference from the one before;
  - the end of the last verse's speech, as a difference.
- **Verses** are those of that version's text as `text.l8` lays it out, in record order,
  so the BSB's numbering quirks (3 John 1:15, Revelation 12:18) and the WEB's own are
  what the reader shows.
- Size: about 4 characters a verse × 31,100 verses ≈ 130 KB a file.
- They're bundled in the app's data like the texts.

#### 12.2.2 Getting the audio (polite, temporary)
- **One zip per recording,** not 1,189 requests:
  - Souer: `BSB_00_Souer_OT.zip` (4.2 GB) and `BSB_00_Souer_NT.zip` (0.9 GB).
  - Hays: `BSB_00_Chapters_Hays.zip` (3.7 GB).
  - Henson: `https://ebible.org/eng-web/audio/eng-web_audio.zip` (5.4 GB).
  - Gilbert has no chapter zip in its directory: fetch its 1,189 files one at a time,
    with a 1 s pause, resumable (`gilbert_books/` has book zips if they prove simpler).
- `curl -C -` so interrupted downloads resume.
- Everything goes in `~/.cache/smooth-bible-audio/` (outside the repo), about 20 GB, and
  is deleted when the timing files are committed. Downloaded archives are untrusted:
  unzip into their own empty directory and pass paths as arguments.
- **No audio is ever committed.**

#### 12.2.3 The spoken text (exactly the app's)
- A tiny L8 tool, `tools/spoken.l8` (`make bible-spoken VERSION=bsb`), prints
  `BOOK\tC\tV\ttext` for every verse, using `text.l8`'s own `speak_text`:
  - footnotes stripped;
  - headings left out (no reader reads them);
  - "LORD" as "Lord".
- A psalm's title (`D`) is printed as verse 0, because readers read it.
- Python never re-implements the text rules.

#### 12.2.4 The eBible.org manifest
- `tools/web_audio_manifest.py` reads the 66 book listings (with a 3 s pause between
  them, retrying a 403 after 30 s) and writes `data/audio/henson.paths`: 1,189 lines of
  `BOOK\tC\t<percent-encoded path under https://ebible.org/eng-web/audio/>`.
- Chapter numbers are read from the spelled-out names ("Chapter Twenty One",
  "Psalms-One Hundred Nineteen"). Every book's count is checked against the BSB's
  chapter counts.
- For the two duplicates (Psalm 71, Luke 17), both are aligned and the better-scoring
  one is kept.
- The paths file is bundled (about 60 KB).

#### 12.2.5 The aligner: `tools/align.py`
- **Environment:**
  - Python 3.11 in a venv at `~/.cache/smooth-bible-align/venv`.
  - CPU-only `torch` and `torchaudio`, **pinned at 2.8**, the last with
    `torchaudio.functional.forced_align`. Plus `num2words`.
  - Run with `python -I`.
  - **Model:** `torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H` (fairseq, MIT-licensed;
    English letters). Not the MMS models, whose weights are CC BY-NC.
- **Per chapter:**
  1. **Audio:** ffmpeg decodes to 16 kHz mono. Emissions come from 30 s windows with
     2 s overlap, joined (20 ms frames).
  2. **Text:** each verse's text is lowercased. Numbers become words ("4,000" → "four
     thousand"). Everything but letters, apostrophes and spaces goes, and spaces become
     the word separator `|`.
     - For Henson, "Lord" from LORD, and "God" from small-caps GOD, are read as
       "yahweh". "Lord GOD" is read as "lord yahweh".
     - A **star token** (a wildcard that may match any audio, or none) goes before
       verse 1, between every verse and after the last. It absorbs "John, chapter 3",
       pauses, any heading or word a reader added, and the end-of-file silence.
  3. **Alignment, in blocks of at most 5 minutes of audio:** the chapter's verses are split
     into blocks by character share. Each block is aligned against its audio window
     (estimated, ±20 s), with stars at both ends. The start found for the next block's
     first verse fixes the next window. Psalm 119 (about 25 minutes) is 6 blocks.
     - Short chapters are one block.
     - Memory stays under 2 GB.
  4. **The verse's start** is the first frame of its first letter, and its end is the
     last frame of its last letter.
- **Checks (any failure flags the chapter `chapter`, and the run lists them):**
  1. Starts strictly increase. Each verse lasts at least 0.4 s and has 6–30 letters a
     second.
  2. The mean log-probability per letter over the verse is above a threshold the
     builder sets from the score distribution (expected: the bottom 1% of verses), and
     no more than 3 verses in the chapter are below it.
  3. **Across readers:** the three BSB readers read the same text, so each verse's share
     of its chapter (duration ÷ chapter speech) should agree. A verse whose share in one
     reader differs from the other two's median by more than 50% (and by more than 1.5 s)
     flags that reader's chapter.
  4. **Spot transcription:** 300 random verses per reader are cut at their timings and
     transcribed greedily with the same model. The character error rate against the
     text is reported (expected below 15%; above 25% for any verse prints it for a look).
- **Expected:**
  - Fewer than 1% of chapters flagged `chapter`.
  - Roughly 10 hours of CPU for all four on the laptop. It's resumable: a chapter's line
    is written as soon as it's done, to `<id>.tim.partial`.
- **Re-running:** only when a reader re-records (the files' `Last-Modified` changes) or the
  text changes. `align.py --check` re-reads every `Last-Modified` and `Content-Length`
  with HEAD requests (1 a second) and lists the chapters that changed.

### 12.3 The engine (`ios_listen.l8`, reworked)

#### 12.3.1 Two engines behind one Listen
- Listen keeps its state (`ls_active`, `ls_playing`, the spoken chapter and verse, the
  wash, following, the player) and gains **`ls_engine`**: `ENGINE_PLAYER` or
  `ENGINE_VOICE`.
- **The voice engine is §8.7's synthesizer, unchanged** apart from the voice choice
  (§12.4.2).
- **The player engine:**
  - One `AVQueuePlayer` (AVFoundation, loaded as now), made once:
    - `automaticallyWaitsToMinimizeStalling` YES;
    - `actionAtItemEnd` advance;
    - `allowsExternalPlayback` NO.
  - **Items:** `AVPlayerItem playerItemWithURL:` with a cached or downloaded chapter's file
    URL, else its remote URL. Each item:
    - `audioTimePitchAlgorithm` = `AVAudioTimePitchAlgorithmTimeDomain`;
    - `preferredForwardBufferDuration` 60.
  - A small table maps item → (source, chapter).
  - **KVO** (with the app object as the observer, removed before an item is let go):
    - the player's `currentItem` (a new chapter began: wash, title, Now Playing, the next
      item queued);
    - its `timeControlStatus` (playing, paused, or waiting: "Loading…");
    - each item's `status` (failed, so fall back, §12.3.4).
  - **Notifications** (`addObserver:selector:name:object:`):
    - `AVPlayerItemDidPlayToEndTimeNotification`: a chapter was heard, so call
      `plan_heard` (§10.1.2, which also moves a carried ribbon, §11.1.4 M2);
    - `AVPlayerItemFailedToPlayToEndTimeNotification` and
      `AVPlayerItemPlaybackStalledNotification`: §12.3.4;
    - `AVAudioSessionInterruptionNotification`: pause, as now;
    - `AVAudioSessionRouteChangeNotification` with reason
      `OldDeviceUnavailable` (2): pause, so unplugged headphones don't start the speaker.
  - **Time** (no blocks):
    - `[player valueForKey:@"currentTime"]` gives an NSValue. `getValue:size:` (24 bytes)
      gives a CMTime, and seconds = value ÷ timescale.
    - Seeks build a 24-byte CMTime (value = cs, timescale = 100, flags = 1) and pass its
      address: `seekToTime:toleranceBefore:toleranceAfter:` with zero tolerances. On
      arm64, a struct over 16 bytes is passed by pointer, so `msg3` with three addresses
      is the correct call. **Flag in the build log** if the simulator slice isn't arm64.
    - The duration comes from `[item valueForKey:@"duration"]` the same way.
  - **Polling:** a 10 Hz `NSTimer` (made with `timerWithTimeInterval:…` and added for
    `NSRunLoopCommonModes`, so it fires during scrolling) runs only while playing **and**
    in the foreground.
    - It computes `verse_at`. When the verse changes, it calls `listen_at(c, v)`, so the
      wash, the follow-scroll and the player label work exactly as in §8.7.
    - In the background it stops: nothing is drawn there. Chapters still advance (the
      queue does it) and `currentItem` KVO still keeps Now Playing right.
    - On return to the foreground, a poll runs at once, so the wash is right before the
      first frame.
- **Audio session:** as §8.7 (playback, spoken audio). It's activated before `play`.

#### 12.3.2 Starting, and continuing
- **Listen from verse v of chapter c:**
  1. Choose `audio_effective`.
  2. For the player: make c's item, seek to `time_of(c, v)` (verse 1 → 0, so a psalm's
     title and Gilbert's announcement are heard), then `play` at the speed's rate.
  3. Queue c+1's item at once: AVQueuePlayer buffers it near the end, so chapters join
     without a gap.
- **On each `currentItem` change:**
  - Queue the chapter after it (across books: Malachi 4 → Matthew 1).
  - Nothing after Revelation 22. Its end stops Listen, as now.
- **Following:** as §8.7 (70% / a third / 8 s after a drag). The player's chapter change
  also moves the title, through the reader's own scroll.

#### 12.3.3 Fetching ahead, and the cache
- **Downloader:** `L8Net` (§9.4.4) gains download tasks, `downloadTaskWithRequest:` with
  the delegate's `URLSession:downloadTask:didFinishDownloadingToURL:`. The file is moved
  synchronously in that callback to `Library/Caches/SmoothBible/audio/<src>/<BOOK>-<C>.mp3`.
  `index.tsv` there holds `SRC\tBOOK\tC\tBYTES\tUSED`. The LRU is kept in this index, not
  in file dates, so no required-reason file-timestamp API is touched.
  - A separate session from the ESV text: `defaultSessionConfiguration`, with:
    - `allowsConstrainedNetworkAccess` YES (the app itself fetches only one chapter
      ahead on cellular);
    - `waitsForConnectivity` NO.
  - One download at a time.
- **What's fetched:** while the player engine is playing a cacheable source:
  - the next 10 chapters on Wi-Fi;
  - the next 1 on cellular or in Low Data Mode, unless Download Ahead on Cellular
    (§12.4.3) is on.
  - **Wi-Fi or cellular:** `NWPathMonitor` needs a block, so it isn't used. Before each
    fetch-ahead decision, the app reads `SCNetworkReachability`'s flags synchronously
    (`SCNetworkReachabilityCreateWithName` for "openbible.com", then
    `SCNetworkReachabilityGetFlags`; `kSCNetworkReachabilityFlagsIsWWAN` means
    cellular). No callback is registered.
  - **Low Data Mode** can't be read without a block, so **cellular is always treated as
    constrained** (1 chapter ahead). That's simple and safe.
- **The playing chapter is streamed, not double-fetched.** If it's already cached, it
  plays from the file.
- Cache rules: §12.1. Log `bible: audio cache N MB (souer JHN 4, JHN 5, …)` after every
  change.

#### 12.3.4 Failure and fallback
An item's `status` failed, `FailedToPlayToEndTime`, or a stall that lasts **10 s**
(waiting with no progress) means the source has failed:
1. Mark it failed for 60 s.
2. Switch to the voice engine at the current verse (for the ESV: the verse estimated,
   §12.3.5).
3. The player's state line reads "iPhone Voice · Offline".
4. At the next chapter boundary, if the network answers (the next chapter's item becomes
   ready, or one tiny HEAD succeeds), go back to the recording.

The log reads `bible: listen fell back to voice at JHN 3:16 (souer: offline)` and
`bible: listen back to souer at JHN 4`. A 403 or 404 from openbible.com or eBible.org is
treated as offline. While the voice engine stands in, the wash follows its utterances as
in Round 3.

#### 12.3.5 The ESV
- **Before each chapter,** `GET /api/v1/esv/audio?book=JHN&chapter=3` (§12.6) returns
  `{"v":1,"url":"https://audio.esv.org/hw/John%203.mp3","notice":"(ESV)"}`.
  - Asked when the chapter is about to be queued. For the next chapter, that's as soon
    as the current one begins.
  - Kept in memory for the session only.
  - The item is made from that URL; AVPlayer follows the 301.
- **No timings:**
  - The player names "John 3", with no verse.
  - The wash isn't shown.
  - Following scrolls to the chapter's opener when a new chapter begins (unless paused
    by a drag).
- **Starting from verse v > 1:** seek to (characters of the chapter's spoken text before
  verse v ÷ all of them) × duration, minus 3 s, clamped at 0. The ESV chapter's records
  are already held (§9.4.5) when it's shown.
- **A Worker error** (`daily_limit`, `busy` or offline) falls back to the voice, as in
  §12.3.4. The player reads "iPhone Voice".
- **Never cached or downloaded.**

#### 12.3.6 Switching mid-listen
- **A new reader** (Voice, §12.4.1) or **a new version** (§9.3) while listening:
  1. Note the verse being spoken.
  2. Stop the current engine.
  3. Start the new effective source at that verse (`time_of` in the new reader's timings,
     or §12.3.5's estimate for the ESV).

  There's no pause and no sound but the change of voice. The player's state line
  cross-fades (0.2 s) to the new reader's name.
- **Speed** applies at once: the player's `rate` (and `defaultRate` on iOS 16 or later),
  or the voice's next utterances.
- **Pausing and resuming** keep the place, and resuming re-checks `audio_effective`.

#### 12.3.7 Now Playing and the remote commands
- **`nowPlayingInfo`, set on every chapter change, pause, play, seek and rate change**
  (never polled):
  - title: "John 3";
  - artist: the reader ("Bob Souer", "iPhone Voice");
  - album title: the version's full name ("Berean Standard Bible");
  - `MPMediaItemPropertyPlaybackDuration` and `MPNowPlayingInfoPropertyElapsedPlaybackTime`
    (recordings only);
  - `MPNowPlayingInfoPropertyPlaybackRate`: the rate, or 0 when paused;
  - `MPNowPlayingInfoPropertyDefaultPlaybackRate`: 1;
  - `MPMediaItemPropertyArtwork`: `[[MPMediaItemArtwork alloc] initWithImage:]`, from a
    bundled `nowplaying.png` (1024 × 1024: the app icon's artwork on its paper color).
    This initializer is deprecated but works and needs no block; the build log says so.
    The block form is not used.
- **Commands** (`addTarget:action:`, as now):
  - play, pause, toggle;
  - **`nextTrackCommand`**: the next chapter;
  - **`previousTrackCommand`**: this chapter's start if more than 3 s in, else the
    previous chapter;
  - **`changePlaybackPositionCommand`**: the event's `positionTime`; enabled for
    recordings only, and for the voice disabled (`setEnabled:NO`);
  - `skipForwardCommand` and `skipBackwardCommand` disabled, so the lock screen shows
    chapter skips.
- Each handler returns 0.

### 12.4 Screens

#### 12.4.1 Reading settings: the Listen section
§8.7's section keeps its Listen / Stop Listening button and Speed row, and gains:
- **A third row, "Voice"** (a disclosure row), whose value is the current version's reader
  ("Bob Souer", "Winfred Henson", "David Cochran Heath" or "iPhone Voice"). It pushes
  **Voice** (§12.4.2) in the settings sheet.
- **The Listen button's title** stays "Listen from John 3:14". There's no subtitle,
  because the Voice row names the reader.
- **A footer, only while it applies:** when the current version would be read by the
  iPhone voice **and** no Enhanced or Premium English voice is installed **and** the
  Voice screen has never been opened, the footer reads "This version is read by the
  iPhone's voice. A more natural voice can be downloaded in Voice." Once Voice has been
  opened (`voiceScreenSeen`), it never shows again. It's configured before the sheet
  lands (principle 6).

#### 12.4.2 Voice (pushed; insetGrouped)
The title is "Voice". The sections, in this order (ESV only when `esvAvailable`):
1. **Berean Standard Bible:** checkmark rows "Bob Souer", "Barry Hays", "Jordan Gilbert",
   "iPhone Voice".
   - Footer: "Recordings dedicated to the public domain, streamed from OpenBible.com.
     About 85 MB an hour; Barry Hays about 45 MB."
2. **World English Bible:** "Winfred Henson", "iPhone Voice".
   - Footer: "A public-domain recording, streamed from eBible.org. It reads the Classic
     edition, which says “Yahweh” where this text says “LORD”."
3. **English Standard Version:** "David Cochran Heath", "iPhone Voice".
   - Footer: "Streamed from esv.org through the ESV API. The ESV recording is followed
     chapter by chapter, not verse by verse."
4. **iPhone Voice:** one disclosure row, "Voice", with the value "Best Available" or the
   chosen voice's name. It pushes the voice list.
   - Footer: "Reads the King James Version, the American Standard Version and Young's
     Literal Translation, and any version when a recording can't be reached."
   - When no Enhanced or Premium English voice is installed, the footer adds: "For a more
     natural voice, download an Enhanced or Premium English voice in the Settings app:
     Accessibility › Read & Speak › Voices › English." (The owner confirms the wording of
     the path on iOS 26, §12.8.)
5. **Downloads:** rows "Download Ahead on Cellular" (a switch, off) and "Downloaded
   Books" (a disclosure row, whose value is the total size, "312 MB", or "None").
   - Footer: "On Wi-Fi, the next ten chapters are kept ready, so listening goes on
     without a connection."

- **Choosing a reader** sets the checkmark (the standard cell checkmark, no animation of
  its own) and saves at once. While listening, it switches as §12.3.6.
- **Previews:** tapping a reader's row while *not* listening plays a **5-second preview**
  of that reader (Psalm 23 from its start, or a voice reading "The LORD is my shepherd; I
  shall not want."), faded out over the last 0.5 s with the player's volume ramp. Tapping
  again or leaving the screen stops it. While listening, there's no preview: the change
  is heard in place.
- **The voice list** (pushed): "Best Available" first (checked by default). Then the
  installed English voices in sections "Premium", "Enhanced" and "Standard", each row
  showing the name and the region ("Ava · United States"). Novelty voices aren't listed
  (`voiceTraits` bit 1).
  - Tapping a row selects it (`listenVoiceID`) and speaks the Psalm 23 line.
  - A voice that's later uninstalled falls back to Best Available silently.
  - The voice list is read again in `viewWillAppear`, so a voice just downloaded in
    Settings appears when the user comes back.

#### 12.4.3 Downloaded Books (pushed from Voice)
- **Section "Downloaded":** each downloaded book for the current reader ("John · Bob
  Souer · 96 MB"), with swipe-to-Delete and Edit, the standard way.
  - If none: footer "No books are downloaded."
- **Section "Download a Book":** a row "Download a Book…" pushes the Books list
  (Old/New Testament, as Go To's).
  - Each book shows its size for the chosen reader (from the timing file's bytes) as the
    value.
  - Tapping one starts its download. The row's accessory becomes a small progress ring
    (a `CAShapeLayer` stroke, updated from `didWriteData`), then a checkmark.
  - Tapping a downloading row asks "Stop Downloading John?" (an action sheet: Stop
    Downloading, Cancel).
  - Downloading happens only while the app is running. If it's interrupted, it resumes
    the next time Downloads or Listen is used. The footer says: "Downloads continue while
    Smooth Bible is open or listening."
- **Storage:** `Application Support/SmoothBible/audio/<src>/<BOOK>-<C>.mp3`, marked
  excluded from backup (`NSURLIsExcludedFromBackupKey`). Downloads are pinned: the cache
  rules never touch them.
- **For the voice** (KJV, ASV or YLT, or a version set to iPhone Voice), the screen says:
  "The iPhone's voice works without a connection."
- **The ESV is never offered here.**

#### 12.4.4 The mini player
Its shape, place and motion are §8.7's. Its **second label** changes:
| State | Second label |
|---|---|
| Playing a recording | the reader, "Bob Souer" |
| Playing the voice | "iPhone Voice" |
| Voice standing in after a failure | "iPhone Voice · Offline" |
| Waiting for data for more than 0.5 s (`timeControlStatus` waiting) | "Loading…" |
| Paused | "Paused" |

- Changes cross-fade over 0.2 s.
- "Loading…" never flickers: it appears only after 0.5 s of waiting, and stays at least
  0.5 s.
- **The first label** is the verse ("John 3:14"). Before verse 1, and for the ESV, it's
  the chapter ("John 3").
- The accessibility label joins both ("John 3:14, Bob Souer").
- Everything else is unchanged: play/pause, the label's tap to the verse, close, and the
  tray above it.

### 12.5 Acknowledgements, notices and privacy
- **Acknowledgements (§9.8) gains a section "Audio"** after Text:
  - "Berean Standard Bible" / "Read by Bob Souer, Barry Hays and Jordan Gilbert.
    Dedicated to the public domain (CC0 1.0). Streamed from OpenBible.com." →
    `https://bereanbible.com/audio/`
  - "World English Bible" / "Read by Winfred W. Henson. Public domain. Streamed from
    eBible.org." → `https://ebible.org/eng-web/audio/`
  - "Verse Timings" / "Computed by Smooth Bible from these recordings. They may be a moment
    early or late."
- **The English Standard Version section** gains, above its copyright footer, a row
  "ESV Audio" / "Read by David Cochran Heath. Provided by the ESV API from Crossway." →
  `https://www.esv.org`.
  - The ESV's footer stays verbatim, and the reader's "(ESV) · esv.org" footer line is
    unchanged.
  - Now Playing's album title is "English Standard Version", so the passage is
    identified as ESV wherever it's heard.
- **The "Changes" screen** gains: "Recordings are played as published. Verse timings for
  them were computed by forced alignment."
- **Privacy:**
  - **App Store answer:** stays **Data Not Collected**. Nothing is collected by us, and
    the audio hosts receive only what any web request carries.
  - **`PrivacyInfo.xcprivacy`:** stays "collects nothing". Its comment adds that the app
    streams recordings from openbible.com, ebible.org and audio.esv.org.
  - **The privacy page** (`programs/bible/site/privacy/index.html`) **must be updated
    before Round 7 ships.** The designer hasn't edited it; the builder makes this change.
    A new paragraph, "Listening":
    - Recordings are streamed directly from OpenBible.com (the BSB), eBible.org (the WEB)
      and audio.esv.org (the ESV).
    - Those servers receive your device's address and which chapter's file is asked for,
      as with any web request, under their own policies. We don't send them anything
      else.
    - For the ESV, our server is asked for the recording's address. It receives the book
      and chapter, as for the text, and keeps nothing but counts.
    - Downloaded and cached recordings stay on your iPhone.
    - The iPhone's voice works on the device.
  - **Info.plist:** no change. Every host is HTTPS (checked), and `UIBackgroundModes`
    already has `audio`.

### 12.6 The Worker: `GET /api/v1/esv/audio?book=JHN&chapter=3`
- **Validation:** as for chapters (the 66 codes, the chapter within the book, the
  `X-Smooth-Bible` header, `PER_IP`).
- **Cache first:** a new D1 table in `schema.sql`:
  `CREATE TABLE audio_url (passage TEXT PRIMARY KEY, url TEXT NOT NULL, fetched INTEGER NOT NULL);`
  - A row younger than 30 days answers at once, with **no upstream call and no budget
    spent**.
  - It holds an address, not ESV text, so it doesn't count against the 500 verses.
- **Upstream:** `fetch({UPSTREAM}/v3/passage/audio/?q=<Name C>, { redirect: "manual", headers:
  { authorization } })`. For a one-chapter book, `q` is `Jude 1:1-999`, as the text uses.
  - Accept 301, 302, 303, 307 or 308 whose `Location` matches
    `^https://audio\.esv\.org/`. Anything else is `502 upstream`.
  - The Worker never follows the redirect, never fetches the mp3, and never streams audio.
- **Budget:**
  - Counted in the same `spend()` as text: every upstream call counts in the minute,
    hour and day buckets.
  - **In addition, audio stops at 4,000 a day:** `503 daily_limit` for audio only, while
    text continues to 4,800.
  - On the minute and hour limits, audio is refused first: it's refused at 45 a minute
    and 800 an hour.
- **Reply:** `{"v":1,"url":"<Location>","notice":"(ESV)"}` with `Cache-Control: no-store`.
  It logs nothing, as before.
- **`/api/v1/status`** becomes `{"ok":true,"esv":true,"esvAudio":true}`. The app shows ESV
  audio as a source only when `esvAudio` is true. Until the Worker is redeployed, the ESV
  is read by the iPhone voice, as today.
- **Tests (`test.mjs`):**
  - A mock upstream answering 302 to an `audio.esv.org` address gives 200 and the address.
  - A `Location` on another host gives 502.
  - A second request within 30 days makes no upstream call.
  - A day count of 4,000 refuses audio but serves text.
  - The key never appears in any reply.
- **Deploy** (with the owner's consent, as before): `npx wrangler d1 execute
  smooth-bible-api --remote --command "CREATE TABLE …"`, then `npx wrangler deploy`.

### 12.7 CI for Round 7
- **Fixtures (no network):** `programs/bible/demo/audio/`:
  - **`tone.mp3`:** 40 s, 24 kbps mono, about 120 KB. Made by `make_fixture.sh` with
    ffmpeg from sine tones: a 0.3 s 330 Hz blip at each "verse" start and soft 220 Hz
    hum between, so it's licence-free and its timings are known. It's committed.
  - **`fixture.tim`:** JHN 3 (36 verses, 1.0 s each from 2.0 s; the 2 s before verse 1
    stand for an announcement) and JHN 4 (the same file, its first 38 s, 38 verses not
    all reached), flagged `ok`.
  - **`esv-audio-JHN-3.json` and `esv-audio-JHN-4.json`:** `{"v":1,"url":"file:…/tone.mp3"}`
    (the path filled in by the demo).
- **Fixture mode:** when the environment has `L8_AUDIO_FIXTURE` (a path relative to the
  app's home, like `L8_ESV_FIXTURE`):
  - every recording address becomes the fixture's file URL;
  - timings come from `fixture.tim`;
  - downloads copy the fixture after a 0.3 s delay per chapter;
  - `<path>/mode` (`ok`, `offline` or `slow`) makes items fail (offline) or start after
    2 s of "Loading…" (slow).
  - The demo clock isn't used: AVPlayer plays in real time on the simulator, into the
    void.
  - If the simulator's player never advances `currentTime`, the demo logs
    `bible: audio fixture did not advance` and the shots that depend on it fail
    visibly. They don't fake it.
- **A new demo group, `listen`** (in `simulate.sh` and the workflow matrix). It installs
  both fixtures. Shots:

| Shot | Action | Expected |
|---|---|---|
| `190-listen-section` | Reader at John 3:14 (BSB); open Reading settings | Listen section: "▶ Listen from John 3:14", Speed, and "Voice · Bob Souer"; no footer |
| `191-voice` | Tap Voice | Voice: BSB (Bob Souer ✓, Barry Hays, Jordan Gilbert, iPhone Voice), WEB (Winfred Henson ✓ …, the Yahweh footer), ESV (David Cochran Heath ✓), iPhone Voice (Best Available, with the download path footer, since the simulator has no Enhanced voice), Downloads |
| `192-voice-list` | Tap iPhone Voice › Voice | Best Available ✓, then the simulator's voices by quality; no novelty voices |
| `193-recording` | Back, back; tap Listen; wait until the fixture's time is 18.4 s (verse 17) | Mini player "John 3:17 · Bob Souer"; verse 17 washed; the log has "bible: listen souer JHN 3 from 3:14 at 15.70 s" |
| `194-loading` | `mode` = slow; Listen from John 3:1 | Mini player "John 3 · Loading…" (the chapter, before verse 1), then after 2 s "John 3:1 · Bob Souer" (a second shot `194b`) |
| `195-reader-switched` | While at verse 5, choose Barry Hays in Voice; close the sheet | Still verse 5 (or 6), "Barry Hays"; the log has "bible: listen switched to hays at JHN 3:5" |
| `196-faster` | Speed: Faster | The log has "bible: listen rate 1.25"; the wash moves faster (a second shot after 2 s shows 2–3 verses on) |
| `197-next-chapter` | Listen from John 3:34 at Normal; wait 5 s | Mini player "John 4 · Bob Souer" or "John 4:1"; the title "John 4"; the log has "bible: chapter heard JHN 3" and "bible: listen next JHN 4" |
| `198-offline` | `mode` = offline; Listen from John 3:16 | Mini player "John 3:16 · iPhone Voice · Offline" (two lines as specified); the log has "bible: listen fell back to voice at JHN 3:16 (souer: offline)" |
| `199-esv-chapter` | `mode` = ok; switch to the ESV (fixture); Listen from John 3:16 | Mini player "John 3 · David Cochran Heath"; **no wash**; the log has "bible: esv audio JHN 3 (fixture)" and the seek estimate |
| `200-kjv-voice` | Switch to the KJV; open Reading settings | "Voice · iPhone Voice", and the footer "This version is read by the iPhone's voice. …" (Voice not yet opened in this group's state; the demo clears `voiceScreenSeen` first) |
| `201-downloads` | Voice › Downloaded Books › Download a Book… › John | The Books list with sizes ("John · 96 MB" from the bundled souer timings); John's ring, then its checkmark; back: "Downloaded: John · Bob Souer · 96 MB" |
| `202-ack-audio` | Acknowledgements | The Audio section's three rows; the ESV section's "ESV Audio" row above the unchanged footer |
| `203-ax-voice` | (Accessibility size) Voice | Rows and footers wrap; nothing clipped |

- **Now Playing:** the demo logs `bible: now playing {title: John 3, artist: Bob Souer,
  album: Berean Standard Bible, duration: 40.0, elapsed: 15.7, rate: 1.0, artwork: 1024}`
  at 193, 195, 196 and 197, so the dictionary is checked from text. The lock screen
  itself is a device check.
- **Recording sequence 14:** Listen from John 3:30 at Faster.
  - The wash moves verse to verse with its cross-fade.
  - One follow-scroll.
  - Into John 4: the title push, and the player's label changes.
  - Choose Barry Hays in Voice mid-way (the state line cross-fades), then pause (the
    symbol cross-fades).

  Nothing jumps.
- **Linux:**
  - `test_audio.l8` in `make bible-test`.
  - `node --test` for the Worker.
  - `tools/spoken.l8` builds.
  - The bundled `.tim` files pass the checks of §12.1's tests: 1,189 lines each,
    increasing starts, flags valid.
- **The `more` group's 79–82 (§8.7)** keep passing. 80's second label now reads
  "Bob Souer" (the BSB's recording in fixture mode) where it read "Listening". This is the
  one expected change to an earlier shot.

### 12.8 Acceptance, and what needs a real phone
**Approved when:**
1. **Sources:**
   - Every version is read aloud by §12.0.2's sources, with Souer as the BSB's default.
   - The reader can be chosen per version in Voice, and the choice is kept.
   - KJV, ASV and YLT use the best installed English voice, or the chosen one.
2. **Following:**
   - BSB and WEB recordings wash and follow verse by verse, within about 0.3 s, as Round
     3 did.
   - The ESV follows by chapter, with no false wash.
   - The alignment run's report is committed in the commit message: chapters flagged
     per reader, CER per reader.
3. **Continuing:**
   - Chapters and books join without a gap (sequence 14, 197).
   - Revelation 22's end stops Listen.
   - Chapters heard count for plans and move a carried ribbon.
4. **Never stopping for the network:**
   - Offline falls back to the iPhone voice at the same verse, and returns at a chapter
     boundary (198).
   - Fetching ahead and Downloads follow §12.3.3 and §12.4.3, and the cache stays under
     500 MB (tests).
5. **Lock screen:**
   - The dictionary is as §12.3.7 (logs).
   - Next/previous chapter and scrubbing work.
6. **Switching:** reader, version and speed changes mid-listen keep the verse (195, 196).
7. **Calm:**
   - The player's second label cross-fades.
   - "Loading…" never flickers.
   - The one-time footer appears only as specified.
   - Nothing changes abruptly (sequence 14).
8. **Credits and privacy:**
   - Acknowledgements as §12.5.
   - The privacy page has its Listening paragraph before release.
   - The Worker logs nothing, and the key never leaves it (tests).
9. Shots 190–203 match, and no earlier shot regresses except 80's label.

**On a device (the owner):**
1. **Listen to the three BSB readers** (Psalm 23, John 1, Romans 8) and confirm or change
   the default (§12.9 question 1).
2. With the screen locked:
   - Listening runs through at least two chapter changes.
   - The lock screen shows the title, reader, artwork and progress.
   - Next and previous chapter, scrubbing, and AirPods' double-tap work.
3. **On cellular, in a car or a train:**
   - Listening survives short dead spots (the cache).
   - A long one falls back to the voice and returns.
   - Data use looks like §12.4.2's figures.
4. **Following on real recordings:**
   - The wash lands as each verse begins, including in Psalm 119 and a genealogy
     (1 Chronicles 1).
   - Report any chapter where it drifts. Its line is flagged `chapter` and re-run.
5. **The iPhone voice path:**
   - Download an Enhanced or Premium voice following the footer's words.
   - Confirm the Settings path wording on iOS 26.
   - Confirm it appears in the voice list on return.
6. A phone call and unplugging headphones pause, and nothing resumes by itself.
7. **The ESV**, once the Worker is redeployed: the recording plays, and a chapter skip
   asks the Worker once (D1's `audio_url` gains rows; the budget doesn't move on the
   second listen).

### 12.9 Questions only the owner can answer, and what the owner does
1. **The default BSB reader** (the designer's pick: Bob Souer). It's one constant to
   change after listening.
2. **The KJV recording:** openbible.com's KJV ("David", 2025) has no reader credit or
   licence anywhere, and is very likely synthetic. If the owner wants it, the owner can
   write to the Berean Bible team (berean.bible/contact.htm) and ask whether the KJV
   audio is CC0 like the BSB's, and whether it's human. If it's CC0, it's a fifth source
   (the KJV address pattern is verified: `KJV_<NN>_<Abr>_<CCC>.mp3`), aligned like the
   others. Until then, the KJV is read by the iPhone voice.
3. **The WEB's "Yahweh":** the designer chose Henson anyway (decision 3). If the owner
   would rather the WEB be read exactly as shown, the WEB's default becomes iPhone Voice,
   with Henson still a choice.
4. **The owner does:**
   - Consent to the alignment run's downloads: about 20 GB, temporary, from openbible.com
     and eBible.org, at a polite pace.
   - Redeploy the Worker with the new table (§12.6).
   - Approve the privacy page's new paragraph.
   - Optionally, write a courtesy note to OpenBible.com and eBible.org that the app
     streams from them. Streaming is within what both offer, and no permission is
     needed.

### 12.10 Builder notes (Round 7, as built)
**Done:** the Worker's `/api/v1/esv/audio` is deployed (D1 `audio_url` made from
`schema.sql`, 2026-10-18; `/api/v1/status` answers `{"ok":true,"esv":true,"esvAudio":true}`;
John 3 answers `https://audio.esv.org/hw/John%203.mp3`). The privacy page's Listening
paragraph is published with it.

**Deviations, each with its reason:**
1. **The aligner plays the audio to the model twice as fast** (ffmpeg `atempo=2`, pitch
   kept). On this laptop (shared, often fully loaded) wav2vec2 ran at about real time per
   core, so the four recordings (about 290 hours) would have taken several days, not the
   10 hours §12.2.5 expected. At 2× the starts found on the test chapters (John 3,
   Genesis 1, 1 Chronicles 1; Souer, Henson, Gilbert) differ from those at normal speed by
   0.02 s median, 0.04 s at the 90th percentile; at 3× they did not hold (0.56 s p90), so 2×
   it is. Spot transcriptions are made on the same 2× audio. The first 37 Souer chapters
   (Matthew, Mark 1–11) were aligned at normal speed.
2. **Starts were checked by ear's stand-in:** cuts of 1.2 s before and 1.6 s after a
   start, transcribed with Whisper (base): before each start the end of the verse before,
   after it the verse's first words (John 3:16, 17, 22, 30; Genesis 1:2, 14, 27; Psalm
   119:1, 88, 176; 1 Chronicles 1:22, 33, 54).
3. **A chapter not yet aligned is flagged `chapter`, not `missing`,** with its size from
   the listings (the zips' central directories, eBible.org's listing, openbible.com's
   directory listing). `missing` would hand it to the voice; `chapter` plays the
   recording and follows by chapter. The timing files are committed as the run goes and
   finished when it ends (`align.py finish`).
4. **A timing line has a start for every verse key 1…N** of that version's text, so the
   app indexes it by `speak_v`; an empty verse (one the BSB leaves out, Matthew 17:21)
   starts where the next does and is never washed; a psalm's title (spoken text's verse
   0) is aligned but not written.
5. **Henson's text:** "the LORD" is read "Yahweh" alone (the Classic WEB says "Yahweh is my
   shepherd"), besides LORD and GOD as "Yahweh".
6. **Checks' limits:** 2.5 to 30 letters a second for verses of 20 letters or more
   (genealogies are read slowly), the score floor −2.6 a letter (the bottom 1% of verses at 2×), more than 3 verses below
   it flagging the chapter; `finish` applies them again, so they can be retuned without
   re-aligning.
7. **Zips:** 7-Zip extracts them (Info-ZIP's unzip cannot read Souer's 4.5 GB OT zip).
   Gilbert's chapters are fetched one at a time with a 1 s pause, as specified.
8. **Names:** `verse_at` and `time_of` are `audio_verse_at` and `audio_time_of`
   (`text.l8` has a `verse_at` already). The player's state is `ap_…` (`pl_` is the plans').
9. **The Worker asks the ESV API for a one-chapter book by its name** ("Jude"): the
   audio endpoint answers 400 to "Jude 1:1-999", and "Jude 1" is its first verse alone.
10. **Shot 193's log** reads "from 3:14 at 14.70 s": fixture.tim puts verse 14 at 15.0 s
   (verse 1 at 2.0 s, a second each), so its start less 0.3 s is 14.70, not 15.70.
11. **Stop Downloading John?** is the progress ring's own menu (a destructive command,
   titled with the question, as History's Clear), not an action sheet: UIAlertAction
   takes a block.
12. **The preview's fade** steps the player's volume down at 20 Hz over the last 0.5 s
   (the audio mix's ramp takes a CMTimeRange; this is simpler and sounds the same).
13. **The fixture's network is always up:** in `offline` mode its items fail, so the
   fallback itself is exercised (198); in `slow` mode an item is queued after 6 s (2 s, as §12.7 had it, was over before the screenshot, which comes some seconds after the settling).
   Every CI group has the audio fixture (so 80 reads "Bob Souer", and nothing is fetched
   from openbible.com in CI); `listen` also has the ESV's.
14. **Reachability** reads `SCNetworkReachabilityGetFlags` synchronously, linking
   SystemConfiguration (`ios/frameworks`).
15. **`nowplaying.png`** is `AppIcon.png` (already the artwork on its paper colour, 1024 px).
16. **A new chapter begun by the queue** scrolls its opener to the top (animated), so the
   title moves with it (197); within a chapter, following is §8.7's.
17. **The ESV's recording** is offered only when the status says `esvAudio` (or in the
   fixture).

**Review r6-1's Minor items, done here:** 1 (a reading tapped in the chapter on screen:
no capsule, no history), 2 (the plan's days open at today from day 8), 3 (the status
bar's tap is a jump for readings), 4 (the two tests), 5 (the push and the landing logged
on one line each), 6 (the status bar's correction animated, never a step), 7 (sequences
12 and 13 set up before their marks, pops animated, Start Reading opened at Mark 1 before
Jude is chosen), 8 (17-point row icons follow the body text style), 9a (the reading
sentence without "read"), 9c (Go To and Reading not updated off the window), 10 (the
flick-stop window opened only by the finger's scroll or its glide). **Not done:** 9b
(raḥam's gloss: the related list's gloss would need each number's dominant BSB rendering
computed into `related.bin`, a data pipeline change), 9d (the scroll indicator in 176,
179, 180: not reproduced from the code; left for the next run's shots).

**Review r7-1's fixes (as built):** Major 1, reachability of the zero address (no name
lookup; `bible: net flags 0x…` logged at each read). Major 2, the verse asked for held on
screen until playback reaches it (`audio_verse_shown` / `audio_hold_ended`, tested); the
hold ends at a new chapter or a scrub. Major 3, the timing files committed as the run
goes (this commit: Souer 389 chapters); the finished files follow with their report.
Minors: 4 (Now Playing gives a seek's target as the elapsed time until the player gets
there), 5 (sequence 14 placed in step 339, marked from the app's start of Listen, 1 s of
rest after the pause), 7 (the ring's percent and "John downloaded" for VoiceOver), 8 (the
voice list titled "iPhone Voice"; 191b and 191c), 9 (audio's limits read before counting:
a refused request counts for nothing; tested with 900 refusals). Minor 6 (the
layout-outside-window warning) is left for the §11 ribbons build, which remakes those
screens, as the review allows; 9b (raḥam) stays for the next data pass.

### 12.11 Owner amendment (2026-10-19): changing narrator or version keeps the verse
Changing the narrator (Voice) or the version while listening continues from the verse being
heard, never from the chapter's start:
- **The verse kept** is the one washed; in a recording without verse timings (a chapter
  flagged `chapter`, or not yet aligned), it is the verse whose words' share of the chapter
  matches the player's time (`audio_estimate_verse`).
- **In the new source** it is found by its timings (its start less 0.3 s, held on screen
  until reached: review r7-1, Major 2), or, without timings, by its words' share of the
  recording's length (`audio_estimate_start`), the verse held until the next one's share
  begins; the iPhone voice begins speaking at it.
- **Playing stays playing** (only the buffer's moment between them), the wash staying on
  the verse. **Paused stays paused** at that verse: Play goes on from it, and the lock
  screen shows the new reader and the time.
- **A version change** keeps the verse by reference: a verse the new version lacks goes to
  the nearest before it that it has.
- Tests: `test_audio` ("a verse kept across sources"); CI: the listen group's 197b
  (narrator changed while playing, into a chapter without timings: Gilbert's John 3 is
  left without the fixture's timings for this), 197c (while paused) and 197d (Play), each
  logging the verse before and after.

**Builder notes (CI stalls, 2026-10-19):** two listen runs stalled (24cb4eda at 195: the
app's main thread answered no timer for 44 s after the Reading sheet came up while a
recording played, then went on; 318f2b1b at 201: silent after a download began). Changes:
the iPhone's voices are read once per screen of voices, not again at every cell whenever
the list came back empty (the simulator's voice database fails its queries); the demo's,
downloads' and Listen's own timers run in the run loop's common modes; and a step that
begins before the last settled logs what was pending and the run loop's mode, so a
recurrence names its cause.
