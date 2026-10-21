# Round 2 review 2: commit a10c54c9, CI run 39093183351

I reviewed the snapshot at `/tmp/bsb/review-r2-2` (RUN.txt confirms a10c54c9): all 63 shots,
`collapse-diff.txt`, the timing files, and the transitions frames. I examined sequence 1
(scroll), sequence 3 (search) and sequence 6 (collapsing bar) frame by frame.

## The 17 items from REVIEW-r2-1
| Item | Status | Evidence |
|---|---|---|
| A1 Back capsule after a concordance jump | **Fixed** | 40: "‹ John 3:16" |
| A2 Lazy language data | **Fixed** | Launch at 0.951 and 0.981 of Round 1 (medians of 8) |
| A3 References in app style | **Fixed** | 35, 37: "Rom 8:37", "John 3:35", "1 John 2:15", "Matt 5:43" |
| A4 Hebrew outline definitions | **Fixed** | 42b: a beautiful nested outline with italic stems. 42 and 45: top-level preview joined with " · " |
| A5 Suffix in grammar | **Fixed** | 42: "… masculine singular construct + suffix 1st person common singular" |
| A6 Interlinear verse number | **Fixed** | 33, 43, 44 |
| A7 Build number | **Fixed** | 52: "1.0 (34)" |
| A8 Tiles never truncate | **Fixed** | 43b: "He makes me lie down" fits, and the columns stay even |
| B1 Notes read mode | **Fixed** | 46: a live "Ezekiel 36:25–27" link, Done and Edit. 47: the editor with trash and Done |
| B2 Study in the long-press menu | **Fixed** | 13, 41: Study · Highlight · Note · Copy · › |
| B3 Add to Note | **Fixed** | 48: the line appended, with the cursor at the end |
| B4 Library search and sort | **Fixed** | 49: the match in semibold. 50: the system Sort By menu with a checkmark. 51: Newest First with "Today" |
| B5 Grammar screen | **Fixed** | 36: plain, jargon-free explanations |
| B6 Concordance filter | **Fixed** | 39, 39b: the filter field works, and the section counts update |
| C1/C2 Bar and search without flicker | **Fixed** | Sequence 3: the field text, clear button, scopes and results are all present from the sheet's first visible frame. Nothing pops in |
| C3 Transitions recording | **Done** | `transitions.*` |
| C4 Abrupt-change audit | **Fixed** | The title fade settles. In sequences 1–6 the only discontinuities are demo-hook state sets (e.g. seq 6, frames 119→120), not app behavior |
| R2-17 Collapsing bar | **Fixed** | See below |

### R2-17 in detail
I compared the collapsing bar against the owner's Safari reference, and it behaves as
specified:
- **No text movement.** `collapse-diff.txt` shows 0 differing pixels below the bar and its
  fade between 15a and 15. The 22,495 differing pixels are the fade strip itself, which
  moves with the bar by design.
- **Proportional.** In sequence 6 (4 pt/frame), the buttons fade over about 6 frames
  (≈ 24 pt, which is p = 0.5), and the bar keeps shrinking until 48 pt. In sequence 1
  (20 pt/frame) the same mapping completes in about 2.5 frames, as it should at that
  speed.
- **Hysteresis.** The 12 pt upward correction leaves the bar collapsed. The reveal then
  tracks the further upward travel.
- **No duplicate chapter name.**
  - The compact "John 3" appears only after the opener has gone under the band (15, and
    sequence 1, frames 13–38).
  - With John 4's opener on screen, the band is empty (15c). The chapter at the band
    line is already John 4, so f = 0. This is correct, though the builder's note
    described it differently.
  - The empty midpoint is visible in 15b.
- **Reveals.** A tap (16b), a sheet opened from collapsed (16c: the bar behind the sheet
  is expanded), the top (sequence 1, frames 62–77), and a scroll up (16).
- **The status bar stays** throughout. The resting state reads calmly: one small grey
  line beside the island, and full lines of text below it.

## Required changes
1. **[Minor] Raw STEP cross-reference text in definitions.** Screenshot: 42b.
   - What's wrong: the line `Also means: ro.i ("רֹעִי" "to shepherd" H7473)` shows
     STEP's internal ASCII transliteration ("ro.i") and straight quotes.
   - What it should be, for STEP's "Also means", "Combined with", "Also called" and
     similar notes: the label in semibold, then the original word (inline Hebrew or Greek
     size), then the tables-style transliteration in italic faint (only if the forms
     table has one; otherwise omit it), then the gloss in curly quotes, then the Strong's
     number in monospaced faint. For example: **Also means:** רֹעִי *rō·‘î* “to shepherd”
     · H7473.
   - STEP's dotted ASCII transliterations ("ro.i", "chi.ram") never appear anywhere in
     the app.
   - Check the Greek entries for the same pattern.

## Carried forward (not blocking)
- **The device checks the owner will do on the next TestFlight build.** Build the
  fallbacks only if a check fails:
  - Round 1 item 8, and Study in the long-press menu (§3.3.5 and §7.2).
  - Whether a real tap on the Library sort menu's commands fires. If it doesn't, build the
    toggle fallback from §7.9.
- **The pre-iOS 26 path is untested in CI.**
- **The demo's diagnostic prints** should be removed or gated before the App Store build.

## Optional polish
- The Library search shows the system Cancel button, while the Bible search sheet (per
  the owner's flicker fix) doesn't. Both are acceptable system behavior. Consider
  removing Cancel from Library search too, for consistency.
- Round 1 polish remains open: library dot alignment, dark-yellow luminance, and the
  swatch haptic.
