# §17 review 1: iPad, and Study beside the text, at 277be25c7 (run 39544870211)

I reviewed the snapshot of run 39544870211 (`ci-bible-shots` at ae46ba7b4). The sources were:
- **Shots:**
  - 460–489 (iPad), 490–491 (iPhone landscape), 492–503 (Study beside the text);
  - store-ipad-1 to 5;
  - four iPhone portrait shots (09, 10, 213, 215), compared with the earlier run's below
    the status bar: mean pixel differences of 0–0.2 levels, so layout is unchanged.
- **The recording** `ipad-transitions.mp4`: sequences 22 (3.73–23.0 s) and 23 (32.14–47.96
  s), 592 frames, each compared with the one before.
- **Logs:**
  - `ipad-ipad.txt`, `ipad-rotate.txt`, `ipad-landscape.txt`;
  - the width lines ("width 1032 → 1376, kept JHN 3:16 +0.00, column 340 tenths of an
    em");
  - "study beside: …", "menu Go: …; View: …", "key go to", "key study".
- **The code:**
  - `ios_beside.l8` and the root container;
  - `ios_ipad.l8` (key commands, menus, hover);
  - the sheet and popover presentations;
  - `help.txt`'s new parts.
- **The tests:** `l8c3 test` on `test_help.l8` and `test_text.l8` gives 32 tests, all
  passing.
- **The builder's notes,** §17.11.

## A. The build

It's an iPad app now, and a calm one. The page keeps its column at every width. The verse
holds through every rotation and resize, and Study beside the text does what the owner
asked. **One Major (the settings popover in Night) and two Minors: approve with fixes.**

**The column and the place:**
- **460 and 461:** portrait and landscape, with the column centred at 34 em.
- **462:** the largest size, with a wider column and the same characters a line.
- **490 and 491:** iPhone landscape, the column of 34 em with about 104 pt margins.
- **The width lines keep the verse every time:**
  - 1032 → 1376 → 1032, at JHN 3:16 +0.00;
  - 985 → 900 → 985, at JHN 3:21 +5.10;
  - 1376 → 375 → 1376, at PSA 23 +3.68;
  - the column goes from 34 em to 30.7 em at 641 pt, and 16.7 em at 375 pt.
- The width is detected in the container's layout pass, so `objc.l8` is unchanged (note).

**Screens at regular width:**
- 464–466 are form sheets: Go To with its tip, the 7-column grid, and Search.
- 467 is the settings popover, undimmed.
- 469–472: Study, word study, Compare, the Library's Memory.
- 473–475: Practice, a card, the Greek page with Verses You Can Read first.
- 476: the day reader full screen, Mark Read at the column's corner.
- 477 and 478: the capsule at the column's corner, the mini player centred.
- 481 and 482: the narrow stand-in at 375 pt, with page sheets and the iPhone tray.
- 484, 488 and 489: a preview, the note editor (form sheets), and Share as a popover.
- 485: the manual's "With a keyboard".
- 486 and 487: Night, and Sepia at the largest size.

**Study beside the text (492–503):**
- **492:** the panel at the right, the divider, the bar's Study button selected, and the
  tray's action reading Studying. The column is unchanged.
- **493 and 494:** a word's study pushed in the panel; known words hidden in Greek Order.
- **495 and 496:** selecting 3:17 moves the panel; scrolling to John 4 leaves it on 3:17.
- **497:** Show in Text, with "‹ John 4" at the column's corner.
- **498:** References.
- **499:** 13-inch portrait, still beside, the column narrowed.
- **500 and 501:** narrowed (hidden, "study beside: hidden (width)"), then back.
- **502:** beside the day reader.
- **503:** closed by ⌥⌘I, with the verse kept.

**Keys and menus:** the log lists Go (Go To…, Search…, Next Chapter, Previous Chapter, Back,
Library) and View (Reading Settings, Listen / Pause, Show Study). ⌘L and ⌥⌘I are exercised.
Hover uses `hoverStyle` on our controls.

**The recordings:**
- The rotations are the system's.
- The panel's push of a word study, the selection's change and the scroll show no
  reflowing jump at the recording's resolution.
- The narrow stand-in's resize is a single change, which is expected: it's a stand-in, not
  a user's drag.

**App Store screenshots:** store-ipad-1 to 5 are all landscape, 2752 × 2064: the reader, Go
To, Study beside the text, Practice and the Greek page. Landscape is accepted. Portrait isn't
needed.

### Required changes
1. **[Major] The Reading settings popover stays light in Night and Black** (468).
   - The popover's glass is light while its rows take the dark theme's colors, so
     "Version", "Speed", "Voice" and the slider's ends are nearly invisible.
   - On the iPhone the settings sheet follows the theme (`overrideUserInterfaceStyle`,
     §3.7).
   - Fix: set the presented navigation controller's `overrideUserInterfaceStyle` (and the
     popover's `backgroundColor`, before iOS 26) from the theme **before** presenting, and
     again when the theme changes while it's open. The glass then takes the dark
     appearance.
   - Check: 468 shows a dark popover with legible rows.
2. **[Minor] Study beside drops its stack when it hides for width.**
   - 501 returns at its verse, as the note says, but not on the word study that was pushed.
   - §17.3.8 asked for the same verse and stack.
   - Keep the panel's navigation controller (only remove it from the container) while the
     window is narrow. If it's opened as a sheet meanwhile, the sheet takes it, and its
     stack is what comes back.
3. **[Minor] ↑ and ↓ don't scroll a line.** §17.4.1 lists them as the system's, but they
   aren't built (note).
   - On iOS 17 and later, `allowsKeyboardScrolling` on the reader's table gives arrows and
     Space by itself once the table is focused.
   - Set it, and make the table the default focus (`preferredFocusEnvironments`) when no
     sheet is up. Otherwise leave it to the phone list.

### Deviations (§17.11): decisions
1. Rotation through Simulator's Device menu, with `shots.py upright`: **accepted.**
2. Width changes detected in the container's layout pass, `objc.l8` unchanged: **accepted.**
   The log shows the place kept every time.
3. Keys on the app delegate; keys and menu bar on iPad only: **accepted.** An iPhone with a
   keyboard is rare, and can be added later.
4. A panel too narrow drops its stack, and Study opens as a sheet, returning at its verse:
   **accepted for the sheet**, with Minor 2 for the stack.
5. Practice's keyboard sentence in Reading's "With a keyboard": **accepted.**
6. "Wide" meaning regular in both directions, so a Pro Max in landscape gets page sheets:
   **accepted.** Its height is compact.
7. ⌘, in the View menu: **accepted.**
8. ↑/↓ line scrolling not built: see Minor 3.
9. The mini player at most 360 pt: **accepted.** It's a player, not a column.
10. The narrow stand-in resizing the window with compact traits: **accepted.**
11. iPad icons added to `assets.sh`/`build.sh`, catalogs regenerated: **accepted.**

## B. CI balance
Jobs: notes/listen/help/ipad 21.7 min (ipad 8.4), languages/versions/more 18.1,
ribbons/study/ios18 17.2, store/memory 12.8, read/plans 10.0.

Move `help` back to read/plans, and `more` to store/memory. That gives about:
- notes/listen/ipad 19;
- languages/versions 15;
- ribbons/study/ios18 17;
- store/memory/more 16;
- read/plans/help 13.

The spread falls from 11.7 to about 6 minutes. Booting the iPad early made things worse
(as noted), so boot it after the job's iPhone groups, as now.

## C. On a real iPad (the owner and the iPad user)
- **Split View and Slide Over** beside another app: the iPhone layout, with sheets as page
  sheets.
- **Stage Manager:** resize slowly across Study beside's width, with Study open. The panel
  goes and comes back, and the verse stays (and, after Minor 2, its stack).
- **Rotation** of an 11-inch with Study open: portrait hides it, landscape brings it back.
- **A Magic Keyboard:**
  - ⌘L, ⌘F, ⌘] and ⌘[, ⌘←, ⌘⇧P, ⌥⌘I;
  - Space to page;
  - Tab between the page and the panel;
  - the menu bar and the ⌘ overlay;
  - Practice's Return and ⌘1–⌘3.
- **The trackpad's hover** on the capsules, tiles and the tray.
- **Pencil:** Scribble into Go To and a note.
- **Reading a chapter with Study beside it:** helpful, or busy? Is 390 pt the right width?
- **VoiceOver:** the page first, then "Study, John 3:16"; focus moves into the panel when
  it opens.
- **Reading settings in Night,** after the fix.
