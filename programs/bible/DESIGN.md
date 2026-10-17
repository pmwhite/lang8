# Smooth Bible: design specification

The product designer writes this, the builder implements it exactly as written, and the
designer reviews CI screenshots against it. If something here can't be built under the
constraints in `/tmp/bsb/brief.md`, the builder says so in the commit message and builds
the nearest equivalent. The builder doesn't silently invent a different design.

Status: **Round 1 is the work now** (§0.5–§6). **Round 2 (language tools and complete notes)
is fully specified in §7** and starts after Round 1 passes review. Rounds 3 and 4 are
outlined in §1. The owner's priorities, in order: distraction-free reading, note-taking,
language tools. Above all: iPhone-native, HIG-proper, predictable UI.

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
6. **No blocks in Round 1.** Every API chosen below works with target-action, delegates or
   selector-based commands. Where a feature truly needs a block, it's flagged
   **[BLOCK SHIM]** and deferred.

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
1. **The bar title shows while the chapter opener is visible.** In 01 ("Genesis 1" above a
   visible "Genesis / 1"), 04 and 06, the title is at full alpha. It must be **alpha 0**
   while any part of the current chapter's opener (label, numeral or book title) is below
   the bar's bottom edge. It fades to 1 over the next 1.2 em of scrolling once the
   numeral's baseline has passed under the bar.
   - Don't estimate the opener's height from em constants, as `title_fade` does now. Measure
     it: record the numeral's character offset when building the attributed string, then
     get its rect with `firstRectForRange:` on the row's text view (or, if the row isn't
     laid out yet, use `layoutManager boundingRectForGlyphRange:`). Convert it to table
     coordinates and compare it with `contentOffset.y + adjustedContentInset.top`.
   - Also call the fade after `go()`, after relayout, and on `viewDidAppear`. The title
     button must start at alpha 0. Don't let `sizeToFit` or `setConfiguration:` reset the
     alpha: set it on the button's container, the `titleView`, not the button.
   - When scrolling upward into the previous chapter, the title switches to that chapter
     immediately, at alpha 1, because its opener is off-screen above.
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

### Round 3: reading and notes, deepened
In priority order:
1. **R3.1 Passage previews (cross-references).** The heading ranges (R lines), footnote
   references ("See Revelation 7:17") and lexicon references become links. Tapping one
   opens a medium-detent sheet that renders the passage in the reader's style, with an
   **Open** button (`arrow.up.right`, top right) that jumps there and pushes history. This
   is the system's own peek pattern applied as a sheet. No new data is needed.
2. **R3.2 Export notes and highlights.** Library's nav bar gets a share item
   (`square.and.arrow.up`). It writes a Markdown file (notes and highlights by book, with
   verse text) and offers it through UIActivityViewController.
3. **R3.3 Chapter notes.** A note on a whole chapter, from the chapter opener's context
   menu (`UIContextMenuInteraction` with a delegate; its actions are `UICommand`s). It's
   listed in Library → Notes under the chapter's reference.
4. **R3.4 History.** The full navigation history (the last 50 places) appears in the
   passage picker as "Recent" → "Show All", pushing a list.
5. **R3.5 Keep screen awake** while reading (`idleTimerDisabled` while the reader is
   foremost). Settings → Reading → switch, off by default.
6. **R3.6 Listen.** `AVSpeechSynthesizer` reads the chapter aloud (delegate-based, no
   blocks), with Play/Pause in a bottom toolbar while playing, and the word being spoken
   underlined. Audio session category: playback.
7. **R3.7 Words of Jesus in red** (from `\wj` in the new USFM): a settings switch, off by
   default. It uses accent at 85%, not pure red.
8. **R3.8 Highlight filters.** Library highlights can be filtered by color with the scope
   bar.

### Round 4 and later
- **R4.1 Per-verse cross-references** from openbible.info (CC BY, credited in
  Acknowledgements), shown in the passage preview.
- **R4.2 Semantic domains** from Clear-Bible MACULA in word study (CC BY).
- **R4.3 Extended Strong's senses** (TAHOT/TAGNT, e.g. H7462B), so word study shows the
  exact sense and not only the base number.
- **R4.4 Reading plans,** computed from the chapter list: Bible in a Year, New Testament in
  90 Days, Psalms and Proverbs in a Month.
- **R4.5 Share as Image.** Selected verses on a themed card, drawn with
  `UIGraphicsBeginImageContextWithOptions` (the renderer API needs a block).
- **R4.6 Verse of the Day.** This needs new data (366 curated references). Its daily
  notification needs the **[BLOCK SHIM]** (the authorization completion handler).
- **Out of scope.** Widgets, Live Activities and App Intents (these need Swift or app
  extensions), SwiftUI, sync and accounts, other translations, and audio recordings.

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

### 2.7 Motion
| What | How |
|---|---|
| Bars hide/show | `setNavigationBarHidden:animated:YES` plus the status bar (`preferredStatusBarUpdateAnimation` = fade) |
| Tray in | Translate from +(tray height + 24) to 0 with a CASpringAnimation (the §0 parameters), plus opacity 0→1 over 0.18 s |
| Tray out | Translate down plus opacity to 0 over 0.2 s ease-in; hide on finish (timer at 0.22 s) |
| Verse select wash | Immediate (no animation). The selection haptic carries the feel |
| Jump-to-verse flash | The target verse gets `selection` × 2.5 alpha. After 0.9 s it's removed by an NSTimer, with a 0.4 s cross-fade done by setting the attributed text inside `beginAnimations` with `UIViewAnimationTransitionNone`. If a fade is impractical, just remove it at 1.2 s |
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
  - **Title view**: the title button (existing behavior: it fades in once the chapter opener
    has scrolled under the bar) → Passage picker.
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
   the text container): if a selection exists, clear it; otherwise **toggle the bars**.

#### 3.1.4 Bars on scroll
Keep "scrolling down through the text hides the bars". **Add: a deliberate upward drag of
more than 40 pt shows them again** (like Safari and Books), as does reaching the top.
While verses are selected, the bars don't auto-hide. The status bar hides with the nav
bar, as now.

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
- A `UIButton` with `UIButtonConfiguration` `grayButtonConfiguration`-style or `filled`,
  using background `cellBg` with a shadow (opacity 0.12, radius 12, y 4) and corner style
  capsule (`cornerStyle = 4`).
- Title "Psalm 23" (the chapter name, plus `:v` when the origin was verse-precise).
- Tapping it jumps back (and pushes the current place, so you can return).
- It hides as described in §2.7, and while the tray is visible.

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
  - `Copy with Reference` → `bibleCopyRef:`
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
- `navigationItem.titleView` = a `UISegmentedControl` ["Highlights", "Notes", "Bookmarks"],
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
- **Scope bar** (`searchBar.scopeButtonTitles`): "All", "Old Testament", "New Testament",
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
8. The bars hide on scroll down and return on scroll up. The status bar follows them.
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
26. In `01-genesis-1`, `06-psalm-23`, `08-john-3-16` (if the opener is visible) and
    `31-link-romans-8`, **the bar shows no title** while the opener is on screen. In
    `02-chapter-divider` and `15`/`16`, the title is visible and names the chapter at the top
    of the screen.
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
