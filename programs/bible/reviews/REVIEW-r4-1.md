# Round 4 review 1: code 57242d59 (head 890d996f), CI run 39150557447

I reviewed the snapshot at `/tmp/bsb/r4`. RUN.txt confirms 57242d59. The sources were:
- Shots 100–130 and store-7.
- `versions-console.txt` (the place and fixed-line logs, and the cache lines).
- `versions-transitions.mp4` (sequences 10 and 11), frame by frame. The recorder writes
  frames only when the screen changes, so I diffed each frame against the one before it.
- Every Round 1–3 shot, diffed against the r3-1 snapshot. The only changes are the
  expected ones (the Version section in Reading settings, the Study segments, the
  acknowledgements).
- The code: `ios_esv.l8`, `ios_versions.l8`, `ios_compare.l8`, `ios_sheets.l8`,
  `ios_study.l8`, `ios.l8`, `esv_cache.l8`, `worker/worker.js` and `wrangler.toml`.
- The data: each version's record counts and sample verses, and `mhcc.txt` checked
  against CCEL's `mhcc.xml`.

Most of Round 4 is in very good shape:
- **Versions:**
  - The Version row and its footer (100), and the Versions list (101).
  - Switching in place: the place logs are equal before and after (102, 105, 114).
  - In sequence 10, the BSB↔KJV switch with the sheet down is a clean in-place
    cross-fade. No line moves.
- **Data:**
  - The texts are right in every version: John 3:16, Genesis 1:1, Psalm 23:1 (ASV
    "Jehovah"), and KJV Matthew 17:21 and Acts 8:37. WEB Romans 14:25 holds the
    doxology.
  - Italic supplied words show in the KJV (103). YLT has one verse per paragraph (109).
  - The Library quotes "Matthew 17:21 · KJV" (106).
- **Red letters:** the "doesn't mark the words of Jesus" footer for the ASV (110).
- **Compare:**
  - Loading, then the ESV with its footer (111, 112).
  - The chevrons move to the next verse (113), and tapping a version reads in it, with
    the flash (114).
  - With no fixture, Compare simply has no ESV section (store-7). That's the no-server
    path, and it's clean.
- **The ESV in the reader:**
  - The opener and quiet spinner while loading (115).
  - The text arrives with the fixed line unmoved (log: 130 = 130).
  - The footer line under each chapter (117).
  - The offline and busy states are calm and in place (119, 120).
- **ESV search:** the BSB results end with the ESV row, which gives the ESV's results
  (121, 122).
- **Study:** Words, References and Commentary (123–127). References are ranked, with
  Romans 5:8 first.
- **Acknowledgements:** the full ESV notice (128). The code has the KJV Crown line, the
  WEB trademark line, ASV, YLT, OpenBible.info CC BY 4.0 and CCEL, each with the §9.8
  link, plus both Data Changes lines.
- **The cache:**
  - The log never goes above 105 verses.
  - 3 John is kept in memory only, never written to disk.
  - Romans 8, which failed, isn't kept.
- **The Worker:** `no-store` on every reply, observability off, no logging,
  `/status` and `/health`, and the header check.
- **The no-server path:**
  - `esv_listed()` gates Versions, Compare, Search and the acknowledgements' ESV section.
  - A saved version of ESV falls back to the BSB at launch when the ESV isn't listed.
  - An unreachable server leaves `esvAvailable` unchanged.
  - A 200 that isn't the JSON we expect (a parked domain) clears it.

Round 4 is **not approved yet**. There are three Major items.

## Required changes
1. **[Major] The commentary is missing for 316 chapters, including Psalm 23.**
   - What's wrong: CCEL writes a chapter that has only one comment as plain `<p>`s inside
     the chapter's `<div2>`, with no `<div class="Commentary">`. `tools/mhcc.py` reads
     only Commentary divs, so those chapters get a `C` line and nothing else. 319
     chapters in `mhcc.txt` have no `K` section, and 316 of them have commentary text in
     the XML. Examples: Psalm 23 ("Confidence in God's grace and care. —'The Lord is my
     shepherd.'…"), Genesis 38, Leviticus 19 and 1 Chronicles 17. Today they all show
     "No Commentary Here".
   - What it should be: when a chapter `<div2>` has no Commentary div, `mhcc.py` writes
     one section `K<c>:1-<c>:<last>` (the last verse from `bsb.txt`) holding the
     chapter's paragraphs after its outline table. The bold summary line ("Confidence in
     God's grace and care.") becomes the first `p`, in italics (`_…_`).
   - Add a `test_text`/`lang` case: Psalm 23:1 → `K23:1-23:6`.
   - Print the count of chapters with no section. It should drop to the 3 that truly
     have none.

2. **[Major] ESV search results can go past the terms' 500 verses on one page.**
   - What's wrong: Show More appends each page (`esv_sr_c` holds 1,000). A common word
     reaches 500+ ESV verses in one list after five taps. That breaks §9.4.1 item 2 (at
     most 500 verses, or half a book, shown on one page).
   - What it should be:
     - Show More **replaces** the section with the next page, so at most 100 results
       show at a time (the API's own page).
     - The rows are "Show More" (at the end) and "Previous Results" (at the top), both
       accent text rows.
     - The section reloads with the 0.2 s fade already used, and scrolls to its top.
   - Add a demo assertion: the log line `esv search shown N` must never exceed 100.

3. **[Major] At accessibility sizes, the bar's title breaks in the middle of the word.**
   Screenshots: 129, 130 ("Joh / n 3").
   - What's wrong: `set_title` sizes the title view from the 17 pt attributed string. A
     configuration button scales its title for Dynamic Type, so at AX sizes the text no
     longer fits the frame and wraps.
   - Every chapter change calls `set_title`, so an AX user sees this all the time. Shot
     85 escaped it only because no chapter changed after the size changed.
   - What it should be: do what system navigation bars do.
     - The title doesn't grow: `title_button.maximumContentSizeCategory =
       UIContentSizeCategoryLarge`.
     - `showsLargeContentViewer = YES`, with `UILargeContentViewerInteraction` on the
       bar, so a long press shows the title large.
     - The title is a single line with `NSLineBreakByTruncatingTail`.
     - The width comes from `sizeThatFits:` of the configured button.
   - The search, Library and Aa buttons get the large content viewer too.
   - Re-shoot 129 and 130.

4. **[Minor] The bookmark glyph comes loose from its verse number, and the number isn't
   accent.** Screenshot: 104.
   - What's wrong: the glyph ends the line after "unto you." and "21" starts the next
     line, in faint. The space after the glyph is U+200A, which allows a line break.
     §2's table says a bookmarked verse number is semibold accent; that's not
     implemented anywhere. It's an old gap that this shot exposed.
   - What it should be:
     - Join the glyph to the number with U+2060 WORD JOINER plus U+202F (narrow
       no-break space), in place of U+200A.
     - Style the number of a bookmarked verse semibold accent.

5. **[Minor] The ESV list footer floats over the results.** Screenshot: 122.
   - What's wrong: "(ESV) · esv.org" is a section footer in a plain table, so it sticks
     to the bottom and cuts John 3:7 in half.
   - What it should be: make it the section's last row (a non-selectable cell with the
     same button). Then it scrolls with the list and comes after the last result.

6. **[Minor] The ESV appears abruptly in open sheets.** (principle 6)
   - What's wrong: when the status answer arrives while Versions or Acknowledgements is
     on screen, `reloadData` pops the Online section in.
   - What it should be: `insertSections:withRowAnimation:UITableViewRowAnimationFade` (or
     `deleteSections:` when it goes), with no change to the other sections.

7. **[Minor] The "Search the ESV" row is missing when the BSB has no results.**
   - What's wrong: `esv_search_row()` requires `sr_n > 0`.
   - What it should be (§9.4.8): under "No Results", the ESV row is the only row.

8. **[Minor] The ESV preview falls back with the wrong message, and is untested.**
   Screenshots: 125, 127.
   - What's wrong: both show "The ESV needs a connection." when the real cause is that
     the fixture has no file for that chapter. So CI never shows an ESV preview with its
     footer, although §9.11 requires it.
   - What it should be:
     - Add fixtures for ROM 5 and JHN 1 (WEB words, a "Fixture:" heading), so that 125
       and 127 show ESV text ending in "(ESV) · esv.org".
     - The fallback line names the state. "Shown in the BSB. The ESV needs a connection."
       is for offline only. Busy: "Shown in the BSB. The ESV is busy just now."
       Unavailable or daily: "Shown in the BSB."

9. **[Minor] The spinner is off center in a chapter that loads below another.**
   Screenshot: 117 (John 5's spinner is about 37 pt left of center; 115's is centered).
   - What it should be: center it on the row's width when the row is laid out, not when
     the spinner is made.

10. **[Minor] Two shots and one sequence don't show what they are for.**
    - 118: verses 14–15 are off screen. Scroll so that both washed verses are above the
      tray.
    - Sequence 11: John 4 arrives below the screen, and the logged fixed line is −2942.
      Go to John 3:33 instead of 3:30, so that John 3's end, the divider, John 4's
      opener and the spinner are all on screen, with a fixed line on screen.
    - Add `112b-compare-esv-night` (Compare with the ESV, in Night). No Round 4 screen
      has been checked in a dark theme.

11. **[Minor] Data typography.**
    - WEB Psalm 119's letters ("ALEPH"…) are `D` records, so they're set as italic psalm
      titles. Map them to `A`, as the KJV and BSB do.
    - The YLT uses straight quotes and apostrophes (8,864 lines; "God's", 'Let light
      be;'). Curl them in the `ylt` profile:
      - letter'letter → ’
      - ' after a space, start of line, `[`, `(` or `—` → ‘
      - any other ' → ’
      - " the same way, with “ ”

      This is typography, not wording (the KJV/WEB/ASV sources are curly already).

12. **[Minor] The commentary's range header sits too close to the verse.** Screenshot: 126.
    - What's wrong: "Verses 1–21" is about 8 pt below the verse.
    - What it should be: 20 pt above, per §9.7.2.

13. **[Minor] The Privacy row opens a page that doesn't exist yet.**
    - What's wrong: `https://smoothbible.com/privacy/` isn't deployed, so today the row
      is dead UI.
    - What it should be: this is a release gate, not a code change. The page must be
      live before the next TestFlight. Until the owner sets up smoothbible.com, publish
      it on the owner's existing blog and point the row (and App Store Connect) there.

## Deviations (§9.10a): decisions
1. **Verses with no words are left out:** accepted. That's how the BSB treats a
   footnoted verse. Update §9.1.1 and §9.1.2's example (KJV, WEB, YLT) in the same
   commit as the fixes.
2. **KJV ¶ marks dropped:** accepted.
3. **Commentary sections run on to the next section** ("Verses 1–21"): accepted. That's
   CCEL's own grouping. Item 1 is a separate, real loss.
4. **`verse_num` holds the key and `verse_shown` the number shown:** accepted.
5. **ESV prose always `Pm`:** accepted. It matches the BSB.
6. **Study opens for every verse, with "No Interlinear":** accepted.
7. **Listen restarts at once on a switch:** accepted. It's simpler, and it doesn't
   leave the old version speaking over the new page.
8. **The ESV acknowledgement shows only while the ESV is listed:** accepted. No ESV text
   can be shown when it isn't listed.
9. **"esv.org" in the reader is a tap target, not a link:** accepted, with one addition.
   Give each ESV chapter row an `accessibilityCustomActions` entry, "Open esv.org", so
   VoiceOver users can reach the link that the terms require.
10. **The fixture answers a two-chapter request with one chapter:** accepted (CI only).
11. **"3 John 14–15":** accepted. It's the app's form for one-chapter books.
12. **A chapter the fixture has no file for stays "coming":** accepted for the reader.
    For previews, see item 8.
13. **The space kept after a footnote before markup:** accepted.

## After the fixes
Re-run the `versions` group. I'll check:
- `mhcc.txt` (Psalm 23).
- 104, 118, 122, 125, 127, 129, 130 and `112b`.
- Sequence 11.
- The `esv search shown` log line.

If items 1–3 are fixed, Round 4 is approved. The minor items may ride along with Round 5.
