# Round 9 review 1: memorization (§13) at 364f9d75, CI run 39441279741

I reviewed the snapshot published by run 39441279741 (`ci-bible-shots` at c131ddae). The
sources were:
- **Shots:** 210–233 and 226b (the `memory` group), and 09, 10 and 130 for the tray.
- **Logs:** `memory-memory.txt`, `memory-console.txt`, `memory-timing.txt`,
  `memory-record.txt`, `memory-transitions.txt` and `memory-hang-sample.txt`.
- **The recording** `memory-transitions.mp4`: sequence 15, marked 8.50–17.29 s from the
  start, 333 frames.
  - I compared every frame with the one before it, and looked at each run of change.
  - The recording now has a 10 s still lead-in (review r8-1 Minor 2's fix).
- **The code:** Round 9's commits c7bbc9e5, c73b56ac, 14651036 and b55f2b76 (and b1e18463,
  the portable part), at HEAD 6f0e2527.
  - `memory.l8` and `test_memory.l8`; `ios_memory.l8`; `ios_practice.l8`; the reminder in
    `ios_daily.l8`; the ESV pins in `esv_cache.l8`, `ios_esv.l8` and `test_store.l8`.
- **The builder's notes,** §13.12 (22 deviations).

## A. The build

**The model and the code** (I read them with a second reader, who ran the tests: `l8c3
test` on `test_memory`, `test_text`, `test_store`, `test_plans` and `test_learn` gives 59
tests, all passing):
- **The Leitner schedule is §13.1.5 exactly:**
  - the gaps; Knew It, Mostly and Not Yet; early practice changing nothing;
  - parts learned and joined; Start Over;
  - dates as civil days in the local calendar.
- **Parts are §13.1.3:**
  - short verses are joined up to 30 words, verses over 40 split, a passage of 30 words or
    fewer is one part, and progress is counted in verses;
  - John 3:16 is 1 part, 3:16–17 is 2, Psalm 23 is 6, Romans 8:28–39 is 12, and Esther
    8:9 is two halves.
- **Words, key letters and hiding are §13.1.2 and §13.1.4:**
  - numbers have their spoken letters;
  - Some is 40%, from a seeded Fisher–Yates shuffle, and only grows level by level;
  - two hidden words never start one of the passage's own lines together. A line that
    wraps on screen can begin with two (216's fourth line). That's the rule as meant: the
    screen's wrapping changes with the text size.
- **Today, New and Later, and `memory_due_on`,** are §13.1.6.
- **`memory.tsv` and `memory-log.tsv`** have the right format, and malformed lines are
  handled.
- **The range parser** reads `isa 52:13-53:12` (with - or –), `ps 23`, `ps 117`, and `rom
  8-9` as 72 verses.
- **The ESV's counting is right:** at most 200 pinned verses, half a book, the 500, the
  refusal toasts, and unpinning.
- **The reminder is right:**
  - 30 days, ids `daily-YYYY-MM-DD`, and old `plan-*` ids removed;
  - the cut at 178 characters with "… and N more";
  - rescheduled on add, delete, Start Over and grade.
- **VoiceOver's labels and custom actions** are §13.3.8.
- **No blocks are used.** No user-facing string has "great", "streak", "score", "%",
  "overdue", "late", "perfect", "congratulations" or "!".

But four faults need fixing (Majors 5–8), and some edges need tidying (Minors 9–15).

**The shots against §13.8.2:**
- **210, 09, 10:** seven actions, Memorize last, every title whole at one fitted size
  ("tray titles at 90 tenths of a point").
- **130:** at the accessibility size the six-and-seven tray is whole, at 8 pt (note 19).
- **211:** "Added to Memory"; the log has "memory added: JHN 3:16-17 bsb (id 4)".
- **212:** Memorizing in accent, its title fitted on its own (note 1); readable.
- **213:**
  - Today: Philippians "To review", Romans "Learning · 4 of 12 verses".
  - New: John 3:16–17. Later: "Psalm 23 · KJV".
  - The toolbar has Practice (centred) and `plus`.
- **214:** "Isaiah 52:13–53:12 · 15 verses", Version, Text, Add enabled.
- **215–218:** the four levels.
  - Some hides 11 of 3:16's 25 words; Letters and Blank keep each word's length.
  - The demo's check of the text rows ("layouts of 215-220: 1 different", one layout hash,
    1446230, for all six) confirms that **nothing moved**.
- **219–221:**
  - 219: "loved" shown with its accent underline.
  - 220: Check, then Again and Next Verse.
  - 221: 3:16–17 joined, then Done. The log has "part … 2 of 2", then "learned … box 1 due
    2026-10-20".
- **222–224:**
  - 222: "1 of 2". Typing shows one dotted miss ("in"), the current word's accent
    underline, and Hide Keyboard above the keys (note 3).
  - 223: Check came by itself, with Mostly suggested.
  - 224: the touch-down line reads "Next review 2 November": box 3 → 4, 14 days from 19
    October.
- **225–226b:**
  - 225: Romans' warm-up of 28–31 at Letters, "2 of 2".
  - 226: 8:32 at Full, the learned parts faint, the wash on 32 during Echo.
  - 226b: the pause, with the heard verse's words underlined in accent.
- **227:** "That's all for today." and "Next review: Tuesday".
- **228:**
  - Today is empty, so there's no Practice button.
  - Later reads Psalm 23 "2 November", John "Tuesday", Romans "Learning · 5 of 12 verses ·
    tomorrow", Philippians "26 October". This is Bible order under the Library's Bible
    Order sort (note 2).
- **229:** the KJV text, Version KJV, "Next review 2 November", Open in Reader. Start Over
  and Delete Passage are below the fold (Minor 4).
- **230:**
  - Remind Me to Practise is on, the Time is 7:00 AM, and the footer is there.
  - The log has "reminders 30 days from 2026-10-20 07:00 (plan 0, memory 30)", and the first
    request's content is "Memory | To review: John 3:16–17, Romans 8:28–39".
- **231:** Night at Letters: the underlines in the dark `rule`, and the current word in
  accent.
- **232:** the judgement row stacked, with the page's color behind it (note 21); nothing is
  clipped.
- **233:** rows wrap and the state lines are whole, but see Minor 3.

**The logged grades follow §13.1.5:**
- "PHP 4:6-7 mostly box 3→3 due 2026-10-26": due, so today + 7.
- "JHN 3:16-17 mostly box 1→1 due 2026-10-20".
- "PSA 23:1-6 mostly box 4→4 due 2026-11-02": the demo made it due for 232, so today + 14.

**Calm:** no streak, count, percentage or praise in any shot or string.

**Sequence 15 (the recording):**
- The level steps (Full → Some at 10.67–10.87 s; → Letters at 11.45–11.66; → Blank at
  12.30–12.47) are cross-fades of 10 to 14 frames each.
- Check's reveal (13.99–14.17, and Psalm 23's at 16.49–16.61) and Next Passage
  (14.79–15.26) are cross-fades. Nothing moves; only colors change.
- The end screen fades in (17.23–17.45).
- But the judgement row never appears: see Minor 2.

### Required changes
1. **[Major] Practice's bar always has a left item, and with one passage it's an empty
   glass circle.**
   - Where: `ios_practice.l8:188–194` sets the counter label as the left bar item at
     every open, and `:354` only empties the label's text when `px_qn` is 1.
   - What you see: on iOS 26 a custom-view bar item gets the shared glass background, so
     215–221, 227, 231 (an outlined circle in Night) and 232 show an empty round "button"
     at the top left. It looks like a control and does nothing, which principle 2 forbids.
   - With several passages, "1 of 2" sits inside a glass capsule (222–226), where §13.3.2
     asks for a plain faint label.
   - Fix:
     - With one passage, set no left item: `setLeftBarButtonItem:nil`, or the item's
       `hidden` on iOS 16+.
     - For the counter, set `hidesSharedBackground = YES` on iOS 26, so it's plain text.
   - Check: 215–221, 227 and 231 have nothing at the top left. 222 shows "1 of 2" as faint
     text with no capsule.
2. **[Minor] Sequence 15 never shows the judgement row.**
   - After each Check (14.17 s for John 3:16–17, 16.61 s for Psalm 23), the toolbar is
     empty until the next passage or the end screen. Nothing changes between 14.17 and
     14.79 s.
   - The log has "checked … suggested mostly", then "graded … mostly" at once. So the demo
     grades before the row is ever on screen, or the row isn't set on this path.
   - §13.8.2 asks the sequence for "the judgement row in and out", and 223 shows that the
     row works when tapped normally.
   - Fix: in the sequence, wait 1.2 s after Check before grading (through the button's
     action). If the row is missing on that path, fix the path.
   - Check: the re-recorded sequence shows the row cross-fade in, stay, and go.
3. **[Minor] The Library's rows don't follow Dynamic Type (233).**
   - The reference (`sans(15, 0.3)`) and the first words (`body(15)`) are fixed sizes
     (`ios_memory.l8:410`, `:431`), while the state line (`preferredFontForTextStyle:`) and
     the headers scale. At the largest size, "To review" is twice the height of the
     passage's own name.
   - The other segments' rows do the same (`ios_sheets.l8:1809–1841`), so this predates
     Round 9.
   - Fix all four segments together: scale the 15 pt fonts with `UIFontMetrics`
     (`metricsForTextStyle:` Subheadline, `scaledFontForFont:`).
   - Check: 233 shows the reference and first words larger than in 213, in proportion with
     the state line.
4. **[Minor] Shots.**
   - **229:** Start Over and Delete Passage are below the fold. Add 229b, scrolled to the
     end.
   - **The hang sample** in this group ("ui content_size … timed out (state 1003, expected
     1002)") shows the app's main thread idle in its run loop. So it was the harness's
     wait, not the app. It needs no fix in the app, but the step should wait for the
     size change's log line rather than a state number.

5. **[Major] Practice can crash on a long passage.**
   - Where: `ios_practice.l8:545–556`, `:584–594`, `:633` (§13.3.3).
   - The underline arrays hold 1,024 entries:
     - words past the 1,024th get no underline at Blank;
     - `px_ul_place` makes one view per line piece, so a word that wraps uses two, and
       `px_ul_view(n)` then writes `px_ul_views[1024]`, past the end.
   - A 40-verse passage within one book can have far more words. The BSB has about 10,600
     such ranges of 1,024 or more words (the longest 1,501), and the KJV about 13,000.
   - Fix: size the arrays at `MW_MOST` (4,096) times two for the pieces, and guard
     `px_ul_view`.
   - Check: a test or demo step opens the BSB's longest 40-verse passage at Blank. It must
     have every underline, and no crash.
6. **[Major] ESV pins are never fetched again after 30 days** (`ios_memory.l8:113–118`;
   §13.6, and Crossway's terms).
   - `esv_pin_wants` is called only from Add, a version change and Practice's wait for
     missing text.
   - Fix: at launch, on return to the app, and when Practice opens, refetch any pin older
     than `ESV_STALE` when online. Offline, keep the held text.
   - Check: a `test_store` case on a pin's age, and a demo log line "esv pin refetched".
7. **[Major] A memory-only reminder does nothing when it launches the app** (`ios_daily.l8:1699–1705`;
   §13.5).
   - `memory_reminder_opened` returns when `!restored` and keeps nothing pending. (The
     plan's path keeps `pending_day`.) So a cold launch opens the reader, not the Library
     on Memory.
   - Fix: keep a pending "open Memory" and act on it after the first layout, as the plan's
     path does.
   - Check: a demo step opens a memory reminder on a cold launch, and logs "opened Library
     on Memory".
8. **[Major] Turning Memory's reminder off can leave its notifications scheduled**
   (`ios_memory.l8:698–702`, `:755` with `ios_daily.l8:1326–1328`).
   - With the plan's reminder off too, `daily_reschedule` returns before
     `removeAllPendingNotificationRequests`. So up to 30 memory reminders still come
     until the next launch.
   - Fix: always remove the pending requests first, then return if neither reason is on.
   - Check: the demo turns the switch off and logs "reminders 0 pending".
9. **[Minor] ESV chapters fetched for a pin also go into the reading cache**
   (`ios_esv.l8:668–671`).
   - So the pinned verses count twice, and other cached chapters can be pushed out.
   - Keep only the passage's verses, as §13.6 says.
10. **[Minor] ESV pins can be dropped without a word** (`esv_cache.l8:497–566`).
    - The pin table holds 128 chapter runs, and `esv_pin_add` still reports success when
      it's full.
    - `mm_keep` is `bool[4096]`, so a passage with an id of 4,096 or more loses its pins
      at every launch.
    - Fix: report a full table as the 200-verse refusal, and key `mm_keep` by the pin's
      id, not an array index.
11. **[Minor] A verse with no letters breaks the parts** (`memory.l8:1214–1224`, `:1354`).
    - It gets `mv_w0 = mv_w1 = mw_n`. In a passage over 30 words, the join loop then takes
      every later verse, and `mpt_add` drops them.
    - No such verse exists in the BSB, KJV or WEB. The ESV is untested.
    - Guard it: skip a verse with no words.
12. **[Minor] Not Yet twice in one session drops a passage four boxes** (`ios_practice.l8:972–979`).
    - The end-of-session repeat grades again, so box 5 → 3 → 1.
    - **Ruling:** the repeat is a second try, not a second review. Its Knew It and Mostly
      already change nothing (it's due tomorrow by then). Make its Not Yet change nothing
      too.
    - Add a test.
13. **[Minor] The end of a one-passage session can name the wrong date** (`ios_practice.l8:1040`).
    - After a Not Yet the queue is 2 long, so the end shows the soonest review of all
      passages, not this passage's (§13.3.5 step 5).
    - Decide by the session's kind (one passage, or Today), not by the queue's length.
14. **[Minor] The counter grows** (`ios_practice.l8:343–353`).
    - A Not Yet appended turns "2 of 3" into "3 of 4". Round 10 fixed this for cards;
      count each passage once here too.
15. **[Minor] VoiceOver after a reveal, and split verses** (`ios_practice.l8:730`,
    `:1390–1445`).
    - Every repaint rebuilds `accessibilityElements` without posting
      `UIAccessibilityLayoutChangedNotification` (with the element), so focus is probably
      lost after Show Next Word or Show Verse.
    - The second half of a split verse is framed from the verse's start (`:1405`). It
      should start at `mw_b[mpt_w0[k]]`.
    - Both halves read "Verse 9, hidden". Make them "Verse 9, first half, hidden" and "…
      second half …".
- **Not a change: uneven splits** (`memory.l8:1369–1378`). Any of ; : . ? ! — beats a comma,
  however far from the middle, so Esther 8:9 splits 44/25. That's §13.1.3 as written, and
  a 44-word half is still learnable. **Accepted as built.**

### Deviations (§13.12): decisions
1. The state titles fitted on their own: **accepted** (212 is readable, and the six
   others keep one size).
2. Sort in Memory: **accepted.** §13.4 itself says Sort orders New and Later, so Later in
   Bible order under Bible Order is the spec read literally. Today keeps its own order.
3. `keyboardLayoutGuide`, and Hide Keyboard above the keys: **accepted** (222).
4. The touch-down line above the toolbar: **accepted** (224).
5. Verse 1's number shown: **accepted.** It's the tap target.
6. Next after the warm-up's Check: **accepted.**
7. The last part recorded before the joined step: **accepted** (principle 4).
8. Nothing due shows the end screen at once: **accepted** (227).
9. The suggestion's tint set to the accent explicitly: **accepted** (223).
10. ESV pins as `PIN` lines read as `TEXT_PIN`: **accepted** (see A for the limits).
11. VoiceOver elements framed by glyph ranges: **accepted.**
12. `daily-YYYY-MM-DD` ids, and `plan-*` removed: **accepted.**
13. "memory started" in the console only: **accepted.**
14. Echo's "your turn" underlines at every level: **accepted** (226b).
15. Solid underlines as thin views, TextKit 1 from the start: **accepted.** 216–218 show
    whole underlines with no gaps, and the layout hash is unchanged.
16. Underlines at 2.5× the rule's alpha, 1 pt: **accepted** (218, and 231 in Night).
17. The group on the store Mac, the ROM 8 fixture timing, and 231/232 over the Library:
    **accepted.**
18. Scrolling a new part into sight: **accepted** (226).
19. 8 pt tray titles at the accessibility sizes: **accepted**, as the floor; the images
    and VoiceOver labels carry the meaning (130).
20. The current word's underline only while the keys are up: **accepted.**
21. The page's color behind the stacked judgement row: **accepted** (232).
22. The one-time line kept on a rebuild: **accepted.**

## Verdict: approve with fixes
Round 9 is faithful to §13: the model, the schedule, the screens and the calm. The text
never moves.

There are no Blockers. **Majors 1 and 5–8 must be fixed before the next TestFlight
build.** The Minors may come in the same commits.

Re-review r9-2 needs only these:
- 215, 222 and 227 at the top left;
- the long-passage step (Major 5);
- the logs for Majors 6–8;
- sequence 15 re-recorded with the judgement row (Minor 2);
- 233 at the larger size (Minor 3);
- 229b.

## Needs a real phone (the owner)
- **Learn a passage over several days** (Psalm 23 in the BSB, a verse a day). Say whether
  the parts, the joining and the gaps feel right, and whether anything feels like a game.
- **Echo and Listen with Bob Souer:** each starts and stops on the passage's verses, the
  pause is long enough to say the verse, and playback pauses when the app goes to the
  background.
- **Type:** first letters on the iPhone keyboard and on a hardware keyboard.
  - The keyboard shows its dictation key. Dictated text should be ignored like any other
    non-letter. Check that it doesn't mark words.
  - Hide Keyboard brings the toolbar back.
- **VoiceOver:**
  - Each level's element labels ("First letters: F, G, s …"; "Verse 16, hidden").
  - Show Next Word and Show Verse.
  - "Missed: …" announced while typing.
  - "Passage 2 of 3".
- **Voice Control:** "Tap Check", "Tap Knew It".
- **The reminder:**
  - With the plan's reminder on too, one notification at 7:00 that names both.
  - With only Memory's: a notification only on days something is due.
  - Opening it shows the Library on Memory, without starting Practice.
- **An ESV passage:** added online, practised in airplane mode, and refused past 200
  verses with the toast.
- **iOS 18:** the tray's seven titles and Practice's bars. The `memory` group runs on iOS
  26 only.
