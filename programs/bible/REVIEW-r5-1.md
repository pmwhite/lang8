# Round 5 review 1: code dc834e38 (head dc834e38), CI run 39171697881

I reviewed the snapshot at `/tmp/r5`. The sources were:
- Shots 140–158 (the plans group, Share as Image, the senses and related words), and
  every earlier shot diffed against the r4-1 snapshot.
- `plans-console.txt` (the notification log) and `versions-console.txt` (the ESV glide's
  place, asked/visible, fixed-line and placeholder logs).
- `transitions.mp4` sequence 12 (the plans), frame by frame, each frame diffed against the
  one before it.
- The code: `git diff 3af02409..dc834e38 -- programs/bible`, in particular `ios_daily.l8`,
  `ios_share.l8`, `ios_study.l8`, `ios_esv.l8`, `ios.l8` (every writer of the reader's
  offset), `ios_listen.l8`, `plans.l8`, `tools/senses.py`, `tools/related.py`,
  `ios/simulate.sh` and `ios/Info.plist`.
- The data: senses spot-checked against STEP's TAHOT/TAGNT, related words for a dozen
  words, the distance distribution, and MACULA's `LICENSE.md` at the pinned commit. All
  bible tests and both data checks (`senses.py --check`, `related.py --check`) pass.

Most of Round 5 is in very good shape:
- **The Verse of the Day is gone.** No trace remains in the UI, data, tools, CI, the site,
  the README or Info.plist. (Note: most `.l8` files hold escaped non-ASCII bytes, so a sweep
  needs `grep -a`.) A few stale lines remain in DESIGN.md (item 9).
- **Plans:**
  - Today shows "Reading Plans ›" and Recent (140).
  - The plan list, detail, Catch Up and Day Done match §10.1 (141–147).
  - The plans are computed exactly as §10.1.1 says. `test_plans` checks the year's day 1,
    pspr day 26, the longest day within 2.2× the mean, and the labels.
  - Stopping appends PLAN, READ and END lines to `plans-done.tsv`.
  - Day Done comes once a day, with its haptic.
  - Dwell is not counted while a sheet is up.
- **The reminder:**
  - Off by default. The footers match the amendment word for word.
  - The permission is asked from the switch, not at launch.
  - When the user denies it, pending requests are removed, the switch turns off with
    animation, and the section fades to "Open Settings" in accent.
  - When the user grants it, 30 requests (`plan-YYYY-MM-DD`, thread `plan`) are
    scheduled, and the Time row fades in (149).
  - Opening a reminder goes to that day's first unread chapter and calls the completion
    handler (log: "reminder opened, day 2", "completion handler called").
  - Every path calls `removeAllPendingNotificationRequests` first.
- **Share as Image:**
  - The card is 1080×1080 and 1080×1350. The text steps down from 64 px in steps of 2,
    with a 110 px margin.
  - The reference is semibold accent with " BSB" regular and faint, which reads well in
    Paper, Sepia, Night and Black (150–155).
  - Red letters use each theme's accent. The ESV, when not offline, falls back to BSB
    text with the BSB label.
  - The swatches and preview have accessibility labels. The limits are 8 verses and
    700 characters.
  - `NSPhotoLibraryAddUsageDescription` is present.
- **Senses:**
  - 99.70% confirmed. Every spot check matches STEP's own tagging: Gen 1:1 H430G, Gen 1:2
    H7307G, Ps 82:6 H1121G, John 20:28 G2962G against Luke 12:36 G2962H, Matt 8:16 G4151G,
    and Ps 110:1 H3068G.
  - The H430G definition's bare `"God" Another name of…` comes from TBESH's own `<BR>`.
    The line is unchanged since Round 4 (polish only, item 10).
- **Related words:**
  - Good neighbours where the data is dense. G25 gives H2245, G27, G5368, H160. G2316 gives
    H433, H426, H410. H7965 gives G1515. G4102 gives H539. G1343 gives H6665.
- **MACULA licence:**
  - Only `sources/Clear/synonyms/Proximity.tsv` is used (pinned sha256 matches). MACULA's
    `LICENSE.md` lists it among Clear's own datasets, © Biblica, CC BY 4.0.
  - No Louw–Nida, MARBLE, `@ln` or `@domain` data is anywhere in `data/` or `tools/`.
  - The acknowledgements and README carry the required attribution exactly as §10.8 says
    (ios_study.l8:1792–1794). The related words' footer says "from MACULA".
- **Nothing abrupt (sequence 12):** every change in the recording is gradual. That covers
  the push and pop, the circle cross-fade, the switch, the Time row's fade and the toast.
  No frame jumps.
- **§9.4.11, the ESV glide:**
  - 160 frames with 0 off. JHN 5 is asked at rest and its row is seen 13 log lines later.
  - In `esv_arrived`, `esv_rest`, `esv_refresh_due` and `inset_changed`, nothing writes
    the offset while `reader_moving()` (tracking, decelerating or the demo's glide).
    Arrivals are pended and handled in one update at rest.
  - `scrollViewWillEndDragging:` asks for the target's window before the fling lands.
- **Regressions:** none. Diffed against r4-1, the only changes are expected:
  - The picker opens at Today (03, 69).
  - The r4 fixes (104, 118, 122, 125–128).
  - Senses (42, 42b), credits (52, 53), and listen and history (70, 71, 81, 82).
  - store-7, which is covered by item 8.

Two Majors, both in the language data, so Round 5 is not yet approved.

## Required changes
1. **[Major] "gods" shows as "God".** Screenshot: none (Exodus 20:3, Psalm 82:1b and 82:6).
   - What's wrong:
     - STEP tags "gods" as H0430J (239 TAHOT lines, 215 BSB words). TBESH has no J line,
       so those words get sense 0.
     - `study_set` (ios_study.l8:692–700) then falls back to the first entry. So "other
       gods" in Exodus 20:3 shows Meaning "God", with the definition "Another name of יהוה
       LORD".
     - §10.3.1's test expected exactly this not to happen ("not 'gods'"). 10.7a-1 records
       the gap but not what the user sees.
   - What it should be:
     - A word whose sense is 0 must never show a particular sense's meaning. Show the
       base entry's gloss with no sense line (or "sense not tagged").
     - In addition, synthesize an H430J entry in `bsb_lang.py`: gloss "gods", definition
       "gods (of the nations); other gods", count 215. Then 82:1b and 82:6 read right.
     - Add a test that Exodus 20:3's word shows "gods".
     - Check the other 396 unknown dStrongs take the same no-sense path.
2. **[Major] Chesed's related words are about shame.** Screenshot: none (H2617, e.g. Psalm
   136:1).
   - What's wrong:
     - H2617 "loving devotion" lists dishonor 0.373, disgrace 0.388, reproach 0.475 and
       shame 0.522, plus G3681 "disgrace".
     - They come from Proximity's `H2617a`, the homonym "reproach". `related.py` folds it
       into H2617 by dropping the letter.
     - The same folding touches 748 bases. For 512 of them the top five mix homonyms.
       Chesed is among the words a reader is most likely to study.
   - What it should be:
     - When a base has an unlettered key, use only its pairs. Fold lettered keys only
       when the base has none.
     - Add a test that H2617's first three include a word of mercy or faithfulness (H7356,
       H530, H571 or G1656) and none of the shame words.
3. **[Minor] Related words have no distance cutoff.** Screenshot: 157.
   - What's wrong:
     - Beyond about 0.70 the lists turn to noise: G2424 Jesus gives Barabbas, αὐτός, ὁ
       and Suah; G25 gives "one another". The distances have no clean knee (median 0.70,
       max 0.83).
   - What it should be:
     - Drop pairs over 0.75. That keeps 53,426 pairs and leaves 2,079 keys with no
       section, which simply isn't shown.
     - Also drop function words (G3588, G846, G240 and their Hebrew counterparts) as
       neighbours.
4. **[Minor] Three writers can still move the reader while it is moving.** (§9.4.11,
   principle 6)
   - What's wrong: the rule is kept by each caller, not in one place, and three callers
     don't keep it. `moving_write` only counts writes in the demo; it doesn't block them.
     - `listen_follow` (ios_listen.l8:296–318) checks only `isTracking`, not
       `isDecelerating`. A verse change during a fling (after the 8 s grace, or when
       `forced`) calls `setContentOffset:animated:` directly, uncounted.
     - `relayout()` (ios.l8:953) does a reloadData and `go_place` on a theme or look
       change. Auto dark switching mid-fling jumps the reader.
     - `text_size_changed` (ios.l8:1500) does the same on a Dynamic Type change.
   - What it should be:
     - Guard all three with `reader_moving()`. While moving, set a flag and run them from
       `reader_rested`.
     - Route `listen_follow` through `set_offset` so the demo's counter sees it.
     - Better still: make `set_offset` and `go` refuse while `reader_moving()` and log
       "bible: offset write while moving". Then the CI check covers every path.
5. **[Minor] The glide check doesn't test the cases the fix is for.** Screenshot: 117b.
   - What's wrong:
     - Both arrivals during the glide (1001, 1002) were "visible 0". The visible-while-
       moving path (`esv_fill` without animation) and the pending-above path at rest never
       run in CI.
     - Check 4 ("nothing above the reading line to keep") passes vacuously. There are no
       fixed-line logs at rest.
     - One placeholder was 15.7% off, above §9.4.11's "a few lines" goal (the others were
       3.5–6.0%).
     - 9.4.11a-4 says the glide "passes into John 5", but the log says "glide lands in
       1000" (John 4).
   - What it should be:
     - Delay one chapter's answer so that it arrives while its placeholder is on screen
       mid-glide. Delay another so it arrives after its row has scrolled above.
     - Make check 4 fail when it has nothing to compare. Assert ≥ 1 "visible 1" arrival
       while moving and ≥ 1 pending-above row handled at rest.
     - Fix the note or the glide's length so they agree.
     - Seed the placeholder ratio from the BSB chapter (`esv_learn` before the first
       answer), or report the worst error and require < 10%.
6. **[Minor] Starting or stopping a plan reloads the whole table.** Screenshot: 147.
   (principle 6)
   - What's wrong:
     - `detail_changed` does a reloadData under a 0.25 s layer fade. It's gentle, but the
       whole list cross-fades, and the scroll position can jump when the section count
       changes.
   - What it should be: insert or delete the header line and reload only the changed rows
     with `.fade` inside beginUpdates/endUpdates, as §10.1.2 says.
7. **[Minor] The reminder outlives its plan.** Screenshot: 149.
   - What's wrong:
     - `planReminder` stays on after Stop. The next plan started schedules 30 reminders at
       once, without the user turning them on for it.
     - The amendment says the reminder is the plan's.
     - Leftover `votd-*` requests from a build that had them aren't cleared, because
       `daily_reschedule` returns early when the switch is off. They would fire for up to
       30 days and open nothing.
   - What it should be:
     - Stopping a plan sets `planReminder` off. Starting one shows the switch off.
     - At launch, when `planReminder` is off, remove all pending requests once.
8. **[Minor] store-7 now depends on the network.** Screenshot: store-7.
   - What's wrong:
     - The store group installs no fixture, but store-7 now shows the ESV ("esv asked
       9991 / cache 36 verses"): the live server answered from CI.
     - The r4 shot showed the clean no-server path. That path is no longer checked, and
       the store group's output depends on the network.
   - What it should be:
     - Run every group except versions with the server off (an `L8_ESV_OFF` demo flag),
       so store-7 shows the no-server path again.
     - Never let ESV text into App Store shots without Crossway's leave.
9. **[Minor] Stale Verse of the Day lines in DESIGN.md.**
   - What's wrong: these lines are outside the amendment and still describe the VOTD:
     - :8–10, the status line.
     - §10.0 decision 2 (:3447) and the demo-clock note (:3460).
     - §10.6's "`votd.py`'s self-check" (:3841) and sequence 12's "Daily Notification"
       (:3839).
     - §10.8's "The verse of the day matches the date mapping…" (:3916–3918).
   - What it should be: strike them, or point them at the amendment, as R5.2 is.
10. **[Minor] Data polish.**
    - The definition preview joins TBESH's paragraphs with no punctuation (`"God" Another
      name of`). Join with ". " or an em dash, or show the first paragraph alone.
    - Unknown senses: G3708 and G1492 (εἶδον: the BSB numbers it G3708, TAGNT codes it
      G1492H) and H3064 (unlettered in TAHOT). Match by the TAGNT form's base before
      giving 0.
    - Amend §10.3.1 to say 0 means "not known" only, as built (10.7a-1).
    - `plan_archive` rewrites `plans-done.tsv` through the 2 MB buffer, which silently
      truncates. Append instead of rewriting.
11. **[Minor] Go To without a plan.** See deviation 4.

## Deviations (§10.7a, §9.4.11a): decisions
§10.7a:
1. **0 means only "not known":** accepted, with item 1. The coding is fine. What the app
   shows for 0 is not.
2. **related.bin order and X1 keys only:** accepted, with items 2 and 3.
3. (Gone with the VOTD.)
4. **Go To opens at its top, Today first:** accepted **only while a plan is active**.
   - Today is useful then: today's reading is one tap away.
   - Without a plan, Today holds only "Reading Plans ›" and Recent. Opening at the top
     throws away §3.2's centring on the book being read, which is the picker's main job.
   - Without a plan, keep §3.2: scroll to the current book, with Today a flick above.
5. **"Your progress… will be kept" in the header:** accepted. A footer 53 weeks down would
   never be seen.
6. **A plan not followed shows its days unread, circles inert:** accepted, with one
   addition. Draw the inert circles at the faint color (or hide them) until the plan is
   started, so they don't invite a tap that does nothing.
7. **Day Done for hand marks too, once a day:** accepted. The 6 s only applies in the demo.
8. **Rest counted only with no sheet over the reader:** accepted.
9. **The open path checked by the demo:** accepted.
10. **The global-block shim; received blocks called with `-invoke`:** accepted. The
    single-word answer is a sound way to avoid ordering trouble.
11. **Measured with UILabel, drawn with `drawWithRect:`:** accepted.
12. **The composer shown by the demo:** accepted (CI only).
13. **Bookmarked number's font set explicitly:** accepted.
14. **This Sense / All only from "N in this sense":** accepted.
15. **Pushed lists held until their sheet is gone:** accepted. It's the right fix for
    1.0 (11)'s crash, and step 261 exercises it.
16. **Fixture poetry joined with a space:** accepted.
17. **The alert's shot last; 149 by `demo_grant`:** accepted.
18. **Isaiah 37's pointer not done:** accepted (it was optional).

§9.4.11a:
1. **The fling's target from `willEndDragging`:** accepted.
2. **One pending list:** accepted.
3. **On-screen placeholders asked first:** accepted.
4. **The glide from John 3:33, 160 pt a frame:** accepted, but the note's "passes into
   John 5" is wrong and the glide must cover the cases in item 5.
5. **The demo writes the glide's offset itself:** accepted. `demo_moving` makes
   `reader_moving()` true, so the guards are exercised.
6. **Missing fixture chapters not asked again:** accepted.
7. **JHN 5–8 fixtures from `web.txt`:** accepted (CI only, never shipped).
8. **No real deceleration measured:** accepted, given there's no public way to make one.
   That is why item 4's central guard matters: the code, not CI, has to make deceleration
   safe.

## After the fixes
- Re-run the plans, versions, study and store groups.
- Exodus 20:3's word shows "gods" (a new shot), and Genesis 1:1 still shows "God".
- Psalm 136:1's related words show no shame words, and nothing past 0.75 shows anywhere.
- The glide log has ≥ 1 visible arrival while moving and ≥ 1 pending-above row at rest.
  Check 4 compares real fixed-line values. No "offset write while moving" lines appear.
- Stopping a plan turns its reminder off (a shot of the next plan's detail with the
  switch off).
- store-7 shows Compare with no ESV section again.
- Go To with no plan opens on the current book; with a plan, on Today.
- Sequence 12 has no abrupt frame when a plan is started or stopped.
- Then I'll approve Round 5.
