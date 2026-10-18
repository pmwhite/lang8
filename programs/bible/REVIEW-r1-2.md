# Round 1 review 2: commit 27c405e8, CI run 39080525165

I re-reviewed all 33 screenshots (including the new 01b-bar-at-rest and 15b-hidden-clean-top)
against DESIGN.md's Round 1 spec, the acceptance criteria, and the 15 items from review 1.

## The 15 items from review 1
| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Opener clipped on launch | **Fixed** | 01 and 01b: "Genesis / 1" rests fully below the bar, with comfortable air above |
| 2 | Bar not themed, with a band and a hairline | **Fixed** | 01, 01b, 25 (sepia), 26 (black), 28 (night), 31: the page color runs under a clear bar, with no hairline and no slab. Text fades softly under the bar (02, 08, 12). The builder's page-colored backdrop with an 18 pt fade is accepted as the implementation |
| 3 | Ghost band with the bars hidden | **Fixed** | 15 and 15b: pure page from the top edge |
| 4 | Divider shown after a chapter jump | **Fixed** | 06 and 31: the label sits under the bar, and the divider is out of view |
| 5 | Unbalanced divider spacing | **Fixed** | 02: about 2.15 em above and 2.1 em below. It reads as a boundary between chapters |
| 6 | Truncated scope titles | **Fixed** | 17–19: All · OT · NT · John |
| 7 | Back capsule in dark themes | **Fixed** | 31: the glass capsule is legible on Night. In 06 and 08 it's fine on Paper |
| 8 | Edit menu on a real long-press | **Pending the owner's device check** | The log line exists. This item doesn't block approval of the rest (per the coordinator) |
| 9 | Trimmed edit menu | **Fixed** | 13: Highlight · Note · Copy · Look Up · › |
| 10 | Neutral jump flash | **Fixed** | 08: a neutral grey wash, which can't be confused with a highlight |
| 11 | Auto swatch | **Fixed** | 23 and 24: the split only |
| 12 | "jn" matching Jonah | **Fixed** | 04: only John |
| 13 | Small caps in previews | **Fixed** | 17 and 18: "the LORD" in Judges 13:8 |
| 14 | Clock icon weight | **Fixed** | 19 |
| 15 | Verse-per-line numbers | **Fixed** | 27: on the baseline in the gutter, and the wash starts at the text |

## Regression sweep
I found no regressions in 03–05 (picker and grid), 07 (footnote), 09–12 (selection, tray,
marks, highlights), 14 (note editor), 16, 20–22 (library), 23–25 (settings, sepia,
Iowan), 26–30 (black, verse lines, night, larger text, relaunch place). The title fade is
correct in every shot: hidden while the opener is visible (01, 06, 31), and shown
otherwise.

## Required changes
None.

## Carried forward (not blocking)
- **Item 8:** the owner long-presses a word on the TestFlight build and confirms that
  Highlight and Note appear. If they don't, implement the `UIMenuController` fallback in
  §3.3.5 as a Round 1 hotfix.
- **The pre-iOS 26 bar path is untested in CI** (the builder's caveat). It's acceptable
  because the minimum OS is 16, but the next time an iOS 18 simulator runtime is available
  on the runner, add one screenshot of 01 on it.
- **The demo's diagnostic print lines** should be removed, or gated behind `L8_DEMO`,
  before the App Store build. They're harmless for TestFlight.

## Optional polish (unchanged from review 1, still welcome)
- When scrolling stops with the title partly faded (11), settle its alpha to 0 or 1.
- Library rows: align the leading dot or icon with the reference line.
- Dark highlight washes read slightly olive (26, 28). Try Yellow `#EDCB4E` at 34%.
- Swatch touch-down haptic in the tray.

Round 1 is approved. Round 2 (DESIGN.md §7) may begin.
