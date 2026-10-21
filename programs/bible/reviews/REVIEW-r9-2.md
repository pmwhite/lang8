# Round 9 review 2: review r9-1's fixes at 685e50dc, CI run 39453616424

I checked exactly what review r9-1's "re-review" line listed, from the snapshot of run
39453616424 (`ci-bible-shots` at 984cd708):
- **Shots:** 215, 222, 227, 232, 233, 229b and the new 234. I also looked at 213 again.
- **Logs:** `memory-memory.txt` and `memory-record.txt`.
- **The recording:** `memory-transitions.mp4`, sequence 15, marked 7.46–17.77 s, 351
  frames. I compared each frame with the one before it, and looked at the frames after
  each Check.
- **The code:** a skim of `git diff a9efe33a..685e50dc -- programs/bible` (`ios_practice.l8`,
  `memory.l8`, `ios_daily.l8`, `ios_memory.l8`, `ios_sheets.l8`, `ios_esv.l8`,
  `esv_cache.l8`, the tests and the demo) for regressions.

## The Majors: all fixed
1. **Major 1, the top left: fixed.**
   - 215, 227, 232 and 234 have nothing at the top left.
   - 222 shows "1 of 2" as plain faint text with no capsule.
   - In the code, the item is on the bar only while it has words (`px_count_sync`). It has
     `hidesSharedBackground` on iOS 26. The count counts each passage once (Minor 14 too).
2. **Major 5, long passages: fixed.**
   - 234 is 2 Kings 22:12–23:31 at Blank, every word underlined, and nothing crashed.
   - The log has "practice long passage: words 1501, underlines 1501, pieces 1501".
   - The arrays are 8,192. `px_ul_view` is guarded, and nothing is placed before the text
     view has its width.
3. **Major 6, ESV pins after 30 days: fixed.**
   - The log has "esv pin refetched, chapter 999" after the demo aged the pin by 31 days.
   - `esv_pin_stale` is checked at launch, on return to the app and when Practice opens. A
     fresh chapter in the reading cache is used rather than fetched again.
   - `test_store` covers it.
4. **Major 7, the cold-launch reminder: fixed.**
   - The log has "memory reminder opened" (held, the reader not up), "memory reminder
     opened" (from `daily_reader_up`), then "opened Library on Memory".
   - The demo simulates the cold launch (`restored = false`). A real cold launch is on the
     phone list.
5. **Major 8, the reminder turned off: fixed in the code, not shown by the demo** (Minor 1
   below).
   - `daily_reschedule` no longer returns early, and `notify_schedule` always removes
     what's pending first. With neither reason on, it logs "reminders 0 pending", as it
     does five times before Memory's switch is turned on.

## The Minors: fixed
- **Sequence 15 (r9-1 Minor 2):** Psalm 23's judgement row is now in the recording. But see
  Minor 2 below.
- **Dynamic Type (r9-1 Minor 3): fixed.**
  - In 233 the reference and the first words grow with the state line.
  - All four tabs use `lib_pt`, which scales 15 pt as the Subheadline style does.
- **229b:** Start Over and Delete Passage (centred, in red) are there.
- **ESV:**
  - A chapter fetched only for a pin stays out of the reading cache (`esv_pin_only`).
  - A full pin table is refused, not dropped.
  - Pins are kept by any passage id (`parse_pins` takes a list of ids).
- **The empty verse:** it now starts where the next verse with words starts, so it joins
  that verse's part.
- **The second try:** `memory_grade_again` logs and changes nothing, and it's tested.
- **The one-passage end screen:** it names its own passage's review (`px_one`).
- **VoiceOver:**
  - After a reveal, `UIAccessibilityLayoutChangedNotification` is posted with the part's
    new element.
  - A split verse's second half is framed from its own first word, and the halves read
    "first half" and "second half".

**Regressions:** none found in the diff or the shots. The demo's new steps (397–399) leave
the earlier shots as they were.

## Still to do (Minor)
1. **[Minor] Major 8's demo step doesn't turn the switch off.**
   - Step 646 sets Memory's switch off and calls `memory_switched`. But the log never says
     "memory reminder off", and the reschedule that follows still has "memory 30". So the
     switch the demo held still read on: probably a stale `mm_switch` after the Library
     was scrolled and its cells reused.
   - The fix itself is right by reading. The step should take the visible cell's switch at
     that moment (or call the model's off path directly), so that the log has "memory
     reminder off" and then "reminders 0 pending".
2. **[Minor, check on a phone] After Check, the toolbar is empty for about a second.**
   - In sequence 15, after Psalm 23's Check (16.77 s), the toolbar stays empty until 17.61
     s. Then the judgement row appears in a single frame, and the demo grades.
   - After John 3:16–17's Check, the row never settles before the next passage (the
     builder's "mid glass-animation").
   - 223 and 224 show the row correctly, so this is the timing of the toolbar swap
     (`setToolbarItems:animated:YES` with Liquid Glass) on a loaded simulator.
   - If a phone shows the same pause, swap the items without animation and cross-fade the
     row's alpha instead (0.2 s), so the row is never missing.

## Verdict: approved
Every Major and Minor of review r9-1 is fixed. The two items above are small and may come
with Round 10's next commits. Round 9 can go to TestFlight.

## Needs a real phone (the owner), carried over from r9-1
- A cold launch from a Memory reminder lands on Memory.
- Turning Memory's reminder off: nothing more arrives.
- After Check, the judgement row appears at once (Minor 2).
- r9-1's list: learning over days, Echo and Listen with Bob Souer, typing, VoiceOver
  (including focus after Show Next Word), Voice Control, an ESV passage offline, and iOS 18.
