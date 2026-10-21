# Round 6 review 1: code d3bd0412 (head d3bd0412), CI run 39194255685

I reviewed the snapshot at `/tmp/r6r`. The sources were:
- Shots 160–182 (the `reading` group), the re-pointed plans shots 140–149b and 158, the
  bar shots 01, 06 and 15c–15l, and every other shot diffed against the r5-1 snapshot.
- `reading-console.txt`, `reading-reading.txt` (the walk), `read-console.txt` (the title
  push and the status bar), `versions-glide.txt`, and every `*-console.txt` for "offset
  write while moving" (none).
- `reading-transitions.mp4` sequence 13 (0.78–23.41 s) and `plans-transitions.mp4`
  sequence 12, at 20 frames a second, each frame diffed against the one before it.
- The code: `git diff 4fca841c..d3bd0412 -- programs/bible`, in particular `readings.l8`,
  `test_readings.l8`, `ios_reading.l8`, `ios_daily.l8` (Continue Reading, removal,
  reminder), `ios_sheets.l8` (opening position), `ios.l8` (`set_offset`'s refusal, the
  status bar, `tap_receives`), `tools/related.py` and `tools/senses.py`; and the commits
  ec7f50d8..59e78394, 987bccb8 and 015e863a for part B.
- `make bible-test` passes, including `test_readings` and both data checks.

## A. Round 6

Round 6 is faithful to §11. It reads as one list with two kinds:
- **The walk (160–182) matches §11.4 shot for shot.** The log tells the same story:
  - Seeding gives one reading, Acts 10:9; Psalm 23 alone seeds nothing (160).
  - Romans 1 read starts "Romans 2" (161).
  - Search, a preview's Open in Reader and Compare start nothing. The log has "chapter
    read 1CO 13" and no start (162).
  - Romans 2 read, then a rest at 3:9, gives "Romans 3:9" (163).
  - A grid jump to Romans 8 with 25 s of rest moves nothing (164).
  - John 13 and 14 give "John 15" (165).
  - The tap returns to 3:9 exactly, with no flash and "‹ John 14" (166).
  - Genesis 1 and 2 as the plan's day 1 start no Genesis reading (167).
  - Show All appears at 5 (168). Reading shows all the rows and its footer (169).
  - "readings met at JHN 17" (170). Philippians 4 goes on to "Colossians 1", with no
    toast (171).
  - Remove writes `CLEARED` (171b).
  - The title menu (173), the sheet (174), "Reading from Mark 1" without moving (175),
    the grid's toolbar (177), and A Chapter a Day with the "will stop" footer (178).
  - The preview's circles are faint and inert (179). "Hebrews, a Chapter a Day · Day 1 of
    13", and `plans-done.tsv` gets its lines (180).
  - The plan's row removed, its reminder off (181). "Jude · Now" by choice (182).
- **The rules are §11.1's** (with deviation 1). `chapter_read` picks the nearest reading
  behind. `rg_move` merges every reading it passes and keeps the earlier STARTED. Rule 2
  runs on its own 20 s timer, which a scroll, jump or sheet stops. Rests count only after
  `rd_scrolled`, which every jump clears.
- **Recent drops a reading's chapter** (165: no Romans 3). Go To opens at its top with
  something to continue; with nothing, it opens at the current book (`books_layout`).
- **Principle 6.**
  - Go To is built in `viewWillAppear:`, with no row appearing after it lands.
  - Removal is one update: Automatic for the row, Fade for the fifth reading coming in,
    and Show All's count reloaded or deleted. It is verified frame by frame in sequence 13
    (6 → 5, then Show All gone).
  - Begin At dims over 0.2 s.
  - A Chapter a Day is inserted or deleted with Fade, and the footer fades.
  - A reading's tap: the 0.6 s re-placing (deviation 8) shows no step after the dismissal.
- **Data integrity.**
  - Both files are written atomically (`writeToFile:atomically:`).
  - Malformed lines are skipped. Two lines for one chapter merge on load, keeping the
    later place and the earlier start.
  - `read.tsv` keeps 300 lines and moves a re-read chapter's line to the end.
  - `CLEARED` holds one time, the latest.
  - Seeding runs once (`readingsSeeded`) and only when there's no file.
  - The test file checks the exact bytes of both files.
- **Accessibility.**
  - Reading rows: label, hint, and the Remove custom action (selector-based).
  - The plan row: Mark as Read/Unread, Remove and Plan Details.
  - Start Reading: button and selected traits, and "Plan Details" on ⓘ. The title has
    "Start Reading Here".
  - Rows wrap at accessibility sizes (172, 158).
- **Regressions: none.** Diffed against r5-1, the only changes are expected:
  - Go To and the plans group (03, 69, 140–158).
  - The title push and "never empty" (01, 06, 15c–15l and every reader shot's title).
  - The r5 fixes: 35's dashed definition, 117b, 154b, 156/156b, 157 and store-7.
  - The acknowledgements' ESV section is left out with the server off in CI (52, by
    `esv_listed`).
  - 81/82 pause one verse earlier (timing only).

## B. 1.0 (14) without a re-review

**Every r5-1 finding is resolved:**
1. **"gods":** 154b shows Meaning "gods", H430J, "gods (of the nations); other gods",
   and 215 in this sense. Genesis 1:1 still shows God (42, 154).
2. **Chesed:** 156b shows raḥam, ḥannûn, ḥāsîḏ, ḥānan, ʾahăḇāh, agapē and chrēstotēs, with
   no shame words. A lettered code folds in only when the base has no unlettered key.
3. **Cutoff:** `FAR = 0.75`, and the function words are dropped, with a check in
   `related.py --check`.
4. **Writers while moving:** `set_offset`, `set_offset_animated` and `go` refuse while
   `reader_moving()` and count it. Relayout and text size wait for rest. Every console
   has 0 refused writes.
5. **The glide check:**
   - One arrival is visible while moving, (1000, 1, 1, 0), and one is above, (1001, …, 1).
   - The fixed line compares real values (−1453/−1453).
   - The worst in the glide is 6.0% (< 10%). It lands in John 5.
6. **Plan start/stop:** one faded update. Sequence 12 changes gently, except for the
   demo's own dismissals (item 7 below).
7. **The reminder:** `reminder_off()` on stop and on another start (149b shows the switch
   off). At launch, with the switch off or no plan, pending requests are removed and the
   verse of the day's delivered ones put away.
8. **store-7:** Compare with no ESV.
9. **Stale VOTD lines in DESIGN.md:** struck.
10. **Data polish:**
    - The definition's paragraphs are joined with a dash (35).
    - Unlettered senses are matched by gloss (99.78%).
    - §10.3.1 is amended.
    - `plans-done.tsv` is appended (`append_file`).
11. **Go To without a plan:** opens at the current book (now: with nothing to continue).

Deviation 6's addition (faint inert circles) is in place (142, 179).

**The title push (987bccb8):**
- The title is never empty: Genesis 1's top says "Genesis 1" (15j).
- A jump's chapter is the one named: "Psalm 23", not 22 (06).
- The push is continuous at both scales (15c–15i): the log's distance walks one point
  per step, from −30 through 0 to 119.
- Accepted. See item 5 for its CI log.

**The status-bar tap:**
- It goes to the current chapter's top, then to the previous one's (15k, 15l): "landed
  at 999", then 998.
- Sheets keep the system's behavior.
- Accepted. See items 3 and 6.

**The touch that stops a flick (015e863a):**
- `gestureRecognizer:shouldReceiveTouch:` declines the reader's tap while decelerating
  or within 0.12 s of the last `scrollViewDidScroll:`, and only for the reader's taps.
- This is how UIKit's own lists behave. Accepted (see item 10).

No Blocker or Major. **Round 6 approved.** The r5-1 fixes are verified, so Round 5 is
approved too. The items below are Minor; fold them into Round 7's builder pass.

## Required changes (all Minor)
1. **[Minor] A reading's tap at the chapter already on screen pushes a capsule back to the
   same chapter.** Screenshot: none (sequence 13, about 14.5 s: "‹ Jude" while reading
   Jude).
   - What's wrong: tapping the Jude reading while in Jude pushes history and shows
     "‹ Jude".
   - What it should be:
     - When the kept place is in `cur`, scroll there without a capsule or history entry,
       as Start Reading Here does when the reader is already in the chapter (§11.2.5).
     - Or push history only when the chapter differs.
2. **[Minor] The plan's days open at the top even when today is far down.** Screenshot:
   147.
   - What's wrong: 9de24dfd opens at the top unless days are unfinished. Round 5 opened
     at today. On day 200 the reader now scrolls 28 weeks to find today.
   - What it should be: open at today's row when today is beyond the first screen (day
     > 7), else at the top, so the Daily Reminder is in sight early in a plan.
3. **[Minor] A status-bar tap counts as a scroll rest.** `status_top` calls
   `reading_scrolled()`.
   - What's wrong:
     - A reading kept at John 3:14 is reset to John 3's top by a tap that only went to
       look at the heading.
     - §11.1.1 counts the finger's and Listen's scrolls only, and this isn't recorded as
       a deviation.
   - What it should be: treat the status bar's scroll as a jump for readings (clear
     `rd_scrolled`), or record and justify it in §11.3a.
4. **[Minor] Deviation 1 has no test of the case it exists for.**
   - What's wrong: no test covers a reading at Genesis 5 with John 13 and 14 read.
   - What it should be: add that test. It should leave Genesis 5 where it is and start
     "John 15". Also add one with Romans 16's reading and 1 Corinthians 2 and 3 read: a
     new reading at 1 Corinthians 4, Romans 16 kept.
5. **[Minor] The push log is thinner than §5 asks.**
   - What's wrong: `read-console.txt` has only `bible: push d x10 N`. §5 asks for `t`,
     both names' chapters, offsets and the old title's alpha, so CI can't check the
     cross-fade.
   - What it should be: log them. Also log "off its top by" on the same line as "status
     bar landed at" (it's on the next line now).
6. **[Minor] The status bar's correction at the end of the scroll can jump.**
   - What's wrong: when the previous chapter's row was only estimated,
     `scroll_animated_end` calls `set_offset(y)` unanimated. That is a visible step, and
     principle 6 forbids it. CI landed exactly only because John 2 was laid out.
   - What it should be: make the target row exact before animating. Lay out
     `view_of(c)` (or `scrollToRowAtIndexPath:` with no animation off screen first), so
     the end needs no correction. Or, if it must be corrected, animate it over 0.2 s.
7. **[Minor] The recordings include the demo's own unanimated dismissals.**
   - What's wrong: the Go To sheet vanishes in one frame inside the marked span: sequence
     13 at 4.4 s, and sequence 12 at 3.0 s and 8.45 s. `demo_dismiss` uses
     `animated:NO`. These aren't the app's behaviour, but they make the frame check fail
     by eye.
   - What it should be: do the setup before marking the sequence's start, or dismiss
     animated within the sequence.
   - Also: sequence 13 opens Start Reading at Jude, so "Change Book to Jude (A Chapter a
     Day fades out)" is never exercised. Open it from a many-chapter book (e.g. Mark 1)
     and then choose Jude.
8. **[Minor] Row images don't scale with Dynamic Type.** Screenshots: 172, 158.
   - What's wrong: the circle, `book` and `plus` stay 17 pt beside 40 pt text. This is
     pre-existing in Recent, but more visible now.
   - What it should be: make the symbol configuration from the body text style
     (`configurationWithTextStyle:`), so the icons grow with the text, as system lists'
     do.
9. **[Minor] Words and data polish.**
   - A reading started by choice and never read says "Mark 1, chapter 1 of 16, read just
     now". Say "started just now" while STARTED = LAST and nothing has moved it, or drop
     "read" from the sentence ("…, just now").
   - raḥam (H7356) is glossed "womb" in chesed's related words (156b). In the BSB it's
     nearly always "compassion" or "mercy". Use the dominant BSB rendering as the gloss
     for the related list when it differs from TBESH's base gloss.
   - The run logs one `UITableViewAlertForLayoutOutsideViewHierarchy` warning at 03:37:32
     (steps 180–182). Find the table laid out off the window (probably Go To's section
     updated after its sheet went) and guard it.
   - Shots 176, 179 and 180 show the vertical scroll indicator 6 s after the sheet came
     up, and the earlier Go To shots don't. Confirm nothing scrolls Go To or the preview
     after it lands.
10. **[Minor] The flick-stop window also eats taps after programmatic scrolls.**
    - What's wrong: `moved_at` is set by every `scrollViewDidScroll:`, including Listen's
      animated following and the bar's settle. A verse tap during Listen's follow is
      ignored.
    - What it should be: set `moved_at` only while the user's scroll is tracking or
      decelerating (`isTracking || isDecelerating` in `scrolled`).

## Deviations (§11.3a): decisions
1. **"Two in a row" carries only a reading in x−1's book: accepted. It is the right
   reading of the owner's intent, and the spec's text was wrong.**
   - The owner asked for this so he could keep "multiple books concurrently". Read
     literally, rule 3 let a reading anywhere behind (Genesis 5) jump to John 15 when he
     read John 13–14. That loses the Genesis place: it breaks the very case Round 6
     exists for, and principle 4 too.
   - With the book bound, a skip ahead within a book still carries (Romans 8 → 12, 13 →
     14), which is "going through a book".
   - Reading on across a boundary is still covered: x = R.c + 1 and x = R.c move a
     reading from Romans 16 into 1 Corinthians, so "from one book into the next" is
     kept.
   - A skip into another book (Romans 14, then 1 Corinthians 5 and 6) starts a new
     reading instead of carrying the old one. That loses nothing. The two merge by rule 5
     if he later reads on from Romans into 1 Corinthians 7.
   - The designer will amend §11.1.3 rule 3 to say this. Item 4 adds the tests.
2. **Rule 2's own timer:** accepted. History's dwell doesn't fire for history's newest
   chapter, so it couldn't serve.
3. **A chapter counted read begins again:** accepted. Without a plan's mark, nothing else
   stops one chapter counting every few seconds.
4. **Only `demo_read` counts in the demo:** accepted. The real signal was exercised in
   Round 5 and is unchanged apart from running without a plan. The owner checks it on the
   device (§11.6.1).
5. **A one-chapter book's row reads "Jude" over "Now":** accepted. That's what §11.2.1
   meant. The spoken time words read well.
6. **The followed plan shows "Day 4" in place of ⓘ:** accepted. Its days are one tap
   away in Continue Reading.
7. **The footer fades by reloading the Plans section:** accepted. A footer's text can't
   change otherwise, and the rows are re-made unchanged.
8. **A reading's tap placed again 0.6 s later:** accepted. No step is visible in sequence
   13.
9. **The preview's header is the description only; "will be kept" moves to the footer:**
   accepted.
10. **One-chapter Chapter row "1", dimmed; Book list with counts:** accepted.
11. **Demo stand-ins:** accepted. Each calls the function the tap reaches.
12. **Sequence 13 starts with a plan and six readings:** accepted, with item 7.
13. **Sequence 12's first step is VoiceOver's Mark as Read; the plan followed by the
    demo:** accepted, with item 7.

## After the fixes
- A reading tapped in the chapter on screen shows no capsule.
- Day 200 of a plan opens at today.
- A status-bar tap leaves a reading's place alone.
- `test_readings` has the Genesis 5 / John 13–14 and the Romans 16 / 1 Corinthians 2–3
  cases.
- The push log shows `t`, names and alpha. The status bar's landing is exact with an
  estimated row, or reaches it by animation.
- Sequences 12 and 13 have no one-frame change inside their marks, and sequence 13 shows
  A Chapter a Day fading out.
- 172 and 158 show the row icons at the text's size.
- No layout-outside-hierarchy warning.
