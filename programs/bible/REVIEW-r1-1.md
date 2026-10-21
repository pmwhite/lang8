# Round 1 review 1: commit d0562a75, CI run 39075798401

I reviewed all 31 screenshots against DESIGN.md's Round 1 spec (§0.5–§6) and its acceptance
criteria.

Much of this round is already very good:
- The reading typography, the poetry indents and the opener design.
- The title fade, which is now correct in 01, 06 and 31.
- The selection wash and dotted underline.
- The verse tray.
- The picker, the chapter grid, the note editor, search results, the library and the live
  settings sheet.
- The place is kept across text size changes and relaunch (28→29→30).

The remaining problems are concentrated in one area: **the navigation bar and what sits
under it**. That is what makes the app look unfinished today.

Severity levels:
- **Blocker**: must be fixed before TestFlight.
- **Major**: must be fixed this round.
- **Minor**: must be fixed this round, but it's small.

DESIGN.md has been amended where an item changes the spec (§2.7 flash, §3.1.6 capsule,
§3.3.5 edit menu, §3.6 scope titles).

## Required changes

1. **[Blocker] The opener is clipped under the bar on launch.** Screenshots: 01 (and the
   first launch generally).
   - What's wrong: "Genesis" is cut off at the top by the bar. The table isn't resting at
     its top. The offset must be `-adjustedContentInset.top`, and it's a few points
     lower than that.
   - What it should be: on first launch, and on any jump to a chapter top, the opener is
     fully visible. The space between the bar's bottom edge and the top of the opener's
     first glyph equals the chapter gap (§2.4). Restore the place only after the first
     layout pass, and compute it from `adjustedContentInset`, which isn't final until
     `viewDidLayoutSubviews` or `viewDidAppear`.

2. **[Blocker] The bar isn't themed, and it shows a band and a hairline.** Screenshots: 01,
   02, 06–16, 24–31.
   - What's wrong, in Paper: the bar area is a lighter white-grey block, separated from
     the page by a hairline, with a second lighter band below it before the page color
     starts (see the crops of 01 and 25).
   - In Sepia (24, 25): the bar is paper-white over a sepia page.
   - In Night and Black (26, 28–31): the bar is a mid-grey slab, not the page color.
     Text is cut at a hard edge.
   - This breaks the calm-page principle on every screen.
   - What it should be: **the page runs edge to edge under the bar and the status bar,
     in the theme's `bg`.**
     - Set the window, the navigation controller's view, the reader VC's view, the table
       and its cells to `bg`, so nothing untinted can show through.
     - The table must extend under the bar: `edgesForExtendedLayout` = all, and
       `contentInsetAdjustmentBehavior` automatic.
     - On iOS 26, accept Liquid Glass (deviation 1), but configure it:
       - `standardAppearance`, `scrollEdgeAppearance` and `compactAppearance` all use
         `configureWithTransparentBackground`, with `shadowColor` = clear (no hairline in
         any state), and the title color ink.
       - Leave the material to the system's scroll-edge effect. Set the table's
         `topEdgeEffect` style to `soft` if that property exists (`respondsToSelector:`).
     - At rest at the top, the bar region is indistinguishable from the page. While text
       scrolls under it, the text fades softly into the bar, with no slab and no line.
     - On iOS 16–18, keep §3.1.1's appearance as written, but its background must be the
       theme's `bg`, with a `rule` shadow only when content is under it.
   - Acceptance: in 01, 25, 26 and 28, sampling the pixel at (20, 100) in points gives
     the theme `bg` within ±3 per channel, both at rest and when the content is under
     the bar (allowing for the glass's softness).

3. **[Major] A ghost band remains where the hidden bar was.** Screenshot: 15.
   - What's wrong: with the bars hidden, a lighter rectangle remains from about y = 50–75
     pt across the top.
   - What it should be: with the bars hidden, the page is pure `bg` from the top edge
     down, with text scrolling up to the edge under the Dynamic Island. (This is likely
     the same cause as item 2. Verify it separately.)

4. **[Major] Jumping to a chapter shows the divider under the bar.** Screenshots: 06, 31.
   - What's wrong: after a jump to a chapter top, the chapter divider hairline sits just
     below the bar, with a large empty gap before "PSALM" or "ROMANS". The divider
     belongs to the boundary between two chapters, not to the top of a page.
   - What it should be: `go(c, 0)` scrolls so that the **chapter label** (or the book
     title for chapter 1) sits one chapter-gap below the bar. The divider and its space
     stay scrolled off above, exactly as the Genesis 1 opener looks in a corrected 01.
     Restoring a saved place is unaffected.

5. **[Major] The space around the chapter divider is unbalanced.** Screenshot: 02.
   - What's wrong: the space above the divider (from the last line of Genesis 1) is about
     5 em. Below it, the space down to "GENESIS" is about 2 em. The divider floats too
     low and looks like part of the next chapter.
   - What it should be: §2.4 as written. The space from the previous chapter's last line
     box to the hairline is 2.4 em. The space from the hairline to the top of the label's
     cap height is 2.0 em. The last chapter's paragraph spacing must not be added on top
     (set the last paragraph's `paragraphSpacing` to 0, or subtract it from the row
     inset).

6. **[Major] The search scope titles are truncated.** Screenshots: 17, 18, 19.
   - What's wrong: they read "Old Testam…" and "New Testa…". Truncated controls aren't
     acceptable.
   - What it should be: scope titles **"All", "OT", "NT", and the current book's
     name**. Book names longer than 10 characters use the short form from the alias
     table ("1 Thess", "Song"). Give the segments accessibility labels with the full
     names ("Old Testament" and "New Testament").

7. **[Major] The back capsule is nearly invisible in dark themes, and isn't native on iOS
   26.** Screenshots: 31 (Night: dark grey on near-black, barely visible); 06, 08 (light:
   acceptable, but a flat white chip).
   - What it should be:
     - On iOS 26, use `UIButtonConfiguration glassButtonConfiguration` (check with
       `respondsToSelector:`), with the title and image in ink. The system draws the glass
       and the shadow.
     - On earlier iOS versions, use a `UIVisualEffectView` capsule (`systemThickMaterial`)
       with the shadow from §3.1.6.
     - In every theme, the capsule must be clearly visible against the page: about 3:1
       against `bg` at its edge, which the glass or material gives.

8. **[Major] The edit menu path isn't verified on a device** (deviation 2).
   - What's wrong: shot 13 uses a demo-only interaction, so CI doesn't prove that a real
     long-press shows the app's commands.
   - What it should be:
     - Keep the demo interaction for the screenshot.
     - Add a one-time console log, `bible: edit menu delegate`, the first time
       `textView:editMenuForTextInRange:suggestedActions:` runs.
     - The coordinator asks the owner to long-press a word on the next TestFlight build
       and confirm that Highlight and Note appear.
     - If they don't, implement the `UIMenuController` fallback from §3.3.5.
   - This item is closed by the owner's confirmation, not by a screenshot.

9. **[Minor] Trim the edit menu so the app's commands don't crowd the system's**
   (deviation 3, with Round 2's decision brought forward).
   - What it should be: the menu is **Highlight, Note**, followed by the system's
     suggested actions. Remove "Copy with Reference" and "Share" from the edit menu (the
     system's Copy and Share remain, and the verse tray has the reference-aware ones).
   - iOS 26 paging after those is the system's behavior: accepted.

10. **[Minor] The jump flash looks like a Pink highlight.** Screenshot: 08.
    - What's wrong: an accent wash at 2.5× alpha reads as a saved pink highlight.
    - What it should be: the flash is a neutral wash of **ink at 9% (light themes) or 14%
      (dark themes)**, with no underline, and removed after 1.2 s (6 s in demo mode is
      fine).

11. **[Minor] The Auto theme swatch's "Aa" is half invisible.** Screenshot: 23.
    - What's wrong: the dark half covers the right side of "Aa", leaving black on black.
    - What it should be: the Auto swatch shows no text, only the diagonal split (Paper
      top-left, Night bottom-right) with the 1 pt `rule` border. Its caption "Auto"
      below is enough.

12. **[Minor] The picker matches "jn" to Jonah.** Screenshot: 04.
    - What it should be: books match only if the typed text (spaces and periods removed)
      is a prefix of the book's name or of one of its aliases. "jn" matches only John (an
      alias). Order the matches with exact alias matches first, then canonical order.

13. **[Minor] LORD isn't in small caps outside the reader.** Screenshots: 17, 18 (Judges
    13:8 "the LORD").
    - What it should be: search results, library previews, the note quote, and the
      picker's verse previews all use the same small-caps treatment for LORD and GOD as
      the reader.

14. **[Minor] The Recent Searches clock icon is too heavy.** Screenshot: 19.
    - What's wrong: the clock is ink, at text weight.
    - What it should be: `clock.arrow.circlepath` in faint, as in the picker's Recent rows
      (§3.2).

15. **[Minor] Verse-per-line numbers are superscript in the gutter.** Screenshot: 27.
    - What it should be: in verse-per-line mode, the hanging verse number sits **on the
      first line's baseline** (no baseline offset), at 0.62 em, faint, with tabular
      digits and right-aligned in the 1.6 em gutter (a right tab stop at 1.3 em, then a
      left tab at 1.6 em for the text).
    - Highlights and selection start at the text (the tab position), not at the number,
      so the wash's left edges align.

## Deviations: decisions
1. **iOS 26 Liquid Glass for the bar and tray:** accepted, on the conditions in item 2.
   The tray's glass (09, 10) looks right.
2. **Edit menu demo interaction:** accepted for CI. Verification on a device is required
   (item 8).
3. **Edit menu paging:** accepted as system behavior. The app's own commands are trimmed
   (item 9).
4. **No diacritic folding in search:** accepted.
5. **Small calls:**
   - The divider space as a row inset: accepted, but the spacing must match the spec
     (item 5).
   - Faked small caps for Iowan, Charter and Georgia: accepted.
   - Psalm 1 without a PSALM label: accepted.
   - The library title area showing only the segmented control: accepted.
6. **Demo-only timings:** accepted.
7. **The keyboard tip in 14:** accepted. It's simulator chrome.

## Optional polish (not required for approval)
- When scrolling stops with the title partly faded (11 shows it at about 40%), it reads as
  a disabled control. Consider settling the alpha to 0 or 1 when deceleration ends,
  with a 0.15 s fade.
- Library rows (20–22): align the leading color dot or icon with the reference line,
  not the vertical center of the cell.
- Dark highlight washes (26, 28) read slightly olive on near-black. A touch more
  luminance would help: Yellow `#EDCB4E` at 34%.
- The tray could add `UISelectionFeedbackGenerator` on swatch touch-down, so the color
  choice feels physical.

## Next review
After these changes, re-run CI with the same 31 steps. Additionally:
- Add a step after step 1 that scrolls up by 1 pt and back, to show the at-rest bar over
  the page (`01b-bar-at-rest`).
- Add a step for item 3 (`15` should now show a clean top).
