# Round 4 review 2: code efdf64e7, CI run 39156762482

I checked `origin/ci-bible-shots` (RUN.txt: efdf64e7, run 39156762482). The sources were:
- Shots 104, 109, 112b, 117, 118, 121b, 122b–d, 125–127, 129 and 130.
- `versions-esv-search.txt` and `versions-console.txt`.
- `versions-transitions.mp4`, sequence 11 (8.53–17.21 s). I diffed every frame against
  the one before it.
- The diff ccc20a96..efdf64e7: `mhcc.py`, `mhcc.txt`, `ios.l8`, `ios_bar.l8`,
  `ios_esv.l8`, `ios_sheets.l8`, `ios_preview.l8`, `ios_study2.l8`, `simulate.sh`,
  `make_fixtures.mjs` and `test_lang.l8`.

**Round 4 approved.** All three Majors are fixed. Two small items carry into Round 5.

## The findings
1. **[Major] Commentary missing for 316 chapters: fixed.**
   - `mhcc.txt` now has Psalm 23 as `K23:1-23:6`. Its first `p` is
     `_Confidence in God's grace and care._`, and the joining dash is gone.
   - 3,684 `K` lines. An independent awk pass finds **0** chapters with no section.
   - There's a `test_lang` case for Psalm 23:1 → `23:1-23:6`.
   - The last verse comes from `bsb.txt`, as asked.
2. **[Major] ESV search past 500: fixed.**
   - Each answer clears `esv_sr_n` and the texts, and `esv_sr_c`/`esv_sr_v` hold only
     100.
   - The log reads 12, 100, 100, 17 ("most shown at once: 100"), and `simulate.sh` now
     exits non-zero above 100.
   - 122b is page 1 from its top, with no Previous row.
   - 122c is page 2, with "Previous Results" first, as an accent row, centered.
   - 122d is page 3: no Show More, and "(ESV) · esv.org" is the last row.
3. **[Major] Bar title broken at AX sizes: fixed.**
   - 129 and 130 show "John 3 ⌄" on one line at bar size, with the AX content below it
     at full size.
   - `maximumContentSizeCategory = Large`, `titleLineBreakMode` is tail, and
     `showsLargeContentViewer` and `largeContentTitle` are set on the title and on all
     three bar buttons. `UILargeContentViewerInteraction` is on the bar.
   - The width is measured from the 17 pt string rather than `sizeThatFits:`. The comment
     explains why (the configuration applies at the next layout), and with the cap at
     Large the two agree. Accepted. 104's "Matthew 17" is whole.
4. **[Minor] Bookmark glyph: mostly fixed.**
   - U+2060 + U+202F hold the glyph to the number, and 104 shows them together, with
     "21" in accent.
   - **Still open:** the number is accent but not **semibold**. `chapter_text` sets only
     the color. Add the semibold weight (§2's table). Carry to Round 5.
5. **[Minor] ESV list footer: fixed.** It's a last row (122d), and it scrolls with the
   results.
6. **[Minor] ESV popping into open sheets: fixed in code.**
   - `esv_set_listed` uses `insertSections:`/`deleteSections:` with
     `UITableViewRowAnimationFade` (0), on the Versions and Acknowledgements tables
     only.
   - It can't be seen in CI, which is acceptable.
7. **[Minor] ESV row under No Results: verified.** 121b shows "No Results" and then the
   ESV row on its own.
8. **[Minor] Preview fallback: fixed.**
   - 125 (Romans 5:8) and 127 (John 1:13) show ESV fixture text ending in
     "(ESV) · esv.org".
   - `preview_esv_failed` takes the state, and the line is offline, busy, or just
     "Shown in the BSB."
9. **[Minor] Spinner off center: fixed.** It's centered on the table's width (117,
   John 5).
10. **[Minor] Shots and sequence: fixed.**
    - 118 shows verses 14 and 15 washed together above the tray "3 John 14–15".
    - Sequence 11 opens on John 3:33. John 3's end, "(ESV) · esv.org", the divider,
      "JOHN 4" and a centered spinner are all on screen. The frame diffs change only the
      spinner's 20 pt box (y ≈ 2069–2129 px) until the text arrives below the opener.
      Nothing above it moves. The log's fixed line is 108 = 108.
    - 112b is Compare in Night: dark cells, readable ESV text, and the accent link. It's
      clean.
11. **[Minor] Data typography: fixed.**
    - WEB Psalm 119 has `AALEPH`.
    - `ylt.txt` has 0 straight `'` or `"`. 109 shows ‘Let light be;’.
12. **[Minor] Commentary header gap: fixed.** In 126, "Verses 1–21" is about 20–24 pt
    under the verse (the inset is +12 on the header's 8).
13. **[Minor] Privacy page: open, as a release gate** (as ruled in r4-1). It doesn't
    block the round. It does block the next TestFlight upload.

Also verified: the "Open esv.org" VoiceOver custom action on ESV chapter rows (§9.10a,
note 9 / 17).

## New issues
- **[Nit, CI only]** The "light" search fixture runs poetry lines together with no space:
  "is life.His favor", "is sweet,and", "darkened,and" (122c). `make_fixtures.mjs`
  concatenates `T/W/I/J` lines with `words += line.slice(1)`. Join them with a space
  (and collapse doubles). The real API's text isn't affected, but the shots should be
  clean.
- No regressions seen in the shots I checked. The Compare restyle on Auto → Night
  (`style_sheets`) is right.

## Ruling on §9.10a, note 14
**Accepted.** In Isaiah 36, 37 and 39, CCEL's one-line pointer to 2 Kings is the
commentary Henry gave there. Showing it as the chapter's section is more honest and more
useful than "No Commentary Here". 36 and 39 already carry tappable references. For 37,
"This chapter is the same as II Kin. 19." has none. If `mhcc.py` can make it a
`[[2KI.19.1-19.37|II Kin. 19]]` reference cheaply, do it in Round 5. It's optional.

## Carried to Round 5
- Semibold on a bookmarked verse's number (item 4).
- The fixture's space between poetry lines (nit above).
- The privacy page live before the next TestFlight (item 13).
- Optional: Isaiah 37's pointer as a reference.
