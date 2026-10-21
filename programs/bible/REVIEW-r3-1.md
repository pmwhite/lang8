# Round 3 review 1: commit 8952bafa, CI run 39101060969

I reviewed the snapshot at `/tmp/bsb/review-r3-1` (RUN.txt confirms 8952bafa):
- Shots 60–88.
- store-1…6.
- The seven `-ios18` shots.
- `plain-launch.png` and `store-plain-launch.txt`.
- `notes-export.md`.
- Recording sequences 7 and 9, frame by frame for large frame-to-frame changes.
- All Round 1 and Round 2 shots, for regressions.

Round 3 is in very good shape:
- **Previews:**
  - Accent heading references (60).
  - The medium preview sheet (61).
  - The footnote link and the popover handoff (62, 63; the recording shows the popover
    fading before the sheet rises).
  - Open in Reader with the flash and "‹ Genesis 1:3" (64).
  - Previews pushed inside sheets (65, 66).
  - The 80-verse cap (67).
- **History** groups by day, with times and the red Clear History menu (69–71).
- **Chapter notes:**
  - The compose button (72, 73).
  - The glyph after "JOHN" (74).
  - Chapter notes ordered first in Library (75).
- **Export:** the share sheet (76), and `notes-export.md` matches §8.5.
- **Filter:** the chips fade, and the empty state is right (77, 78; recording sequence 9).
- **Listen:**
  - The entry in the Aa sheet (79).
  - The mini player and the verse wash (80, 81).
  - The tray stacked above the player (82).
- **Accessibility:** the AX sizes have no clipping (85–88).
- **iOS 18.6** matches iOS 26 apart from system chrome.
- **Store shots** are clean, at 9:41.
- **Diagnostics:** a plain launch prints 0 `bible:` lines (the only line is the
  simulator's own PID echo).

## Required changes
1. **[Major] Filled accent buttons are illegible in the dark themes.** Screenshot:
   28-night-ios18 (the Aa sheet in Night). The same applies to the Highlights "All" chip
   in Night and Black.
   - What's wrong: white text on Night's accent `#DC8873` is about 2.6:1. That fails the
     HIG and WCAG minimum of 4.5:1 for text.
   - What it should be: in Night and Black, every **filled** accent control sets its
     configuration's `baseForegroundColor` to the theme's `bg` (`#1B1A18` or `#000000`):
     the Listen button, the "All" chip, and any other filled accent button. That gives
     6.5:1 and 7.1:1. Light themes keep white text on `#9C3A2C` and `#8E4426` (both above
     6:1).
   - Add `79b-listen-entry-night` (the Aa sheet in Night) to the `more` group as evidence.

2. **[Minor] Red letter colors verse numbers.** Screenshots: 83, 84.
   - What's wrong: inside Jesus's words, the verse numbers ("3", "4", …) are accent too.
   - What it should be: only W **words** take the accent. Verse numbers stay faint,
     footnote marks keep their accent, and spaces and punctuation outside the quotation
     follow their own run's style.

3. **[Minor] The heading reference punctuation isn't faint.** Screenshot: 60.
   - What's wrong: the semicolon between "John 1:1–5" and "Hebrews 11:1–3" renders in
     accent, joined to the reference run.
   - What it should be (§8.1): only the reference text itself is accent. The parentheses,
     semicolons and separating spaces are faint `STYLE_REF`.

4. **[Minor] The icon appearances aren't verified.** (§8.9.6)
   - What's wrong: the dark and tinted icon files look right (I checked them). What isn't
     proven is that actool compiled them into the app.
   - What it should be: in the build step, after actool, run
     `xcrun --sdk iphoneos assetutil --info build/SmoothBible.app/Assets.car | grep -iE '"Appearance"|AppIcon'`
     and keep its output in `store-build.log`. It must list the AppIcon entries with
     `UIAppearanceDark` and the tinted appearance. If they're missing, report that light
     only ships, as the spec allows.

## Deviations: decisions
All of them are accepted:
- **In-text links:** a custom attribute plus the existing tap recognizers, instead of
  `NSLinkAttributeName`. It previews correctly and avoids scene routing.
- **Style names:** STYLE_XREF for the reference text, with STYLE_REF for the punctuation.
  Item 3 asks only that the punctuation actually renders faint.
- **Popover handoff:** a 0.3 s NSTimer.
- **History Clear:** a custom-view bar button with a UIButton menu. It's pending the
  device check, like the sort menu.
- **Listen frameworks:** dlopen at first use (no launch cost).
- **Shot 67:** the cap is reached at Matthew 6:32. The cap and "Continues in the reader"
  are proven.
- **Export:** runs split where a verse also has a note or bookmark, and the quotes follow
  the BSB's own punctuation (John 3:5's open quotation is correct).
- **store-3:** shows John 3:14–15 in green.
- **Shot 23:** the Listen section moves the theme row lower at the medium detent. This is
  correct per §8.7, and 23 remains a valid settings shot.
- **Recording sequence 8:** a timer-driven wash, because the simulator's audio timing is
  meaningless.

## Regressions
None found in shots 01–53. The 9-170→171 jump in the recording is a recording frame drop:
the Library sheet presents with `animated:YES` in code, and the dismissal at 281–285 is
smooth.

## Pending owner device checks (not blocking)
- The long-press menu shows Highlight, Note and Study.
- The Library sort menu and History's Clear menu fire on a real tap.
- Listen continues with the screen locked, and the lock-screen controls work.
- The idle timer behaves as specified, on a phone with auto-lock set to 30 s.
- iOS 16 and 17 can't be checked in CI.
