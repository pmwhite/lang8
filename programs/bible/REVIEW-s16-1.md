# §16 review 1: a plan's day in a reader of its own, and several plans at once, at b02af5dfe (run 39523012543)

I reviewed the snapshot of run 39523012543 (`ci-bible-shots` at f3fd11a73). The sources
were:
- **Shots:** 430–459b, and the changed 144, 145 and 148.
- **Logs:** `plans-days.txt`, `plans-notify.txt` and `plans-days-record.txt`.
- **The code and data:**
  - `test_plans.l8`: 13 tests, all passing;
  - `python3 -I tools/chrono.py --check data`: "chrono.txt: as made", with its summary
    (below);
  - `data/plans/` (`mcheyne.txt`, `chrono-order.txt`, `chrono.txt`) and their headers'
    sources;
  - `plans.l8`'s format and migration, and `ios_day.l8`.
- **The builder's notes,** §16.12.

## A. The build

§16 and §16.11 are built as designed. A plan's day is one quiet page, Mark Read is always
there, and several plans live side by side without touching each other. **No Blocker and
no Major: approved**, with three Minors. Fix Minor 1 before this goes to TestFlight.

**The day's reader:**
- **433:** Chronological day 114 opens with "DAY 114 / Chronological", the first passage's
  heading, the title "Psalm 22" over "Day 114 · Chronological", Done, Aa, and Mark Read at
  the bottom right.
- **434 and 435:** crossing to Psalm 16 changes the title, and Mark Read reads "Read".
- **436–438:**
  - the end panel's Mark Day 114 as Read, then "Day 114 is read" with the toast "Day 114
    Done";
  - Next opens day 115.
- **439:** the tray over the day.
- **440 and 441:** a preview's Open in Reader leaves the day (the reader at Psalm 108,
  "‹ Day 115"), and the capsule returns to it.
- **442 and 443:** Listen names "Psalm 60 · Day 115". Mark Read rides above the mini
  player, and Listen crosses into Psalm 108.
- **444:** M'Cheyne's day 1, with "Started M'Cheyne's Calendar".
- **445:** "1 Samuel 23:24–24:22" starts at verse 24 with no opener.
- **446:** the reminder opens the day.
- **447:** an ESV day: Genesis 1 shown, Matthew 1 still arriving, in its own place.
- **448:** a 1.0 `plan.tsv` reads as before ("plans migrated 1" in the log).
- **449:** the ribbon untouched, and the reader where it was.
- **450:** Night.
- **451:** the largest size, with the capsule image-only.
- **452:** the title opens the plan's days, on today.
- **453:** Old and New Together, "Genesis 1–2; Matthew 1; Psalm 1".
- **454:** relaunched into the open day.

**Several plans (§16.11):**
- **455:** Go To's "Reading Plans" has two compact rows (Chronological · Day 114 of 365;
  M'Cheyne's Calendar · Day 1 of 365), then the list.
- **456:** the list's Following section, in the order started.
- **457 and 458:** "Also today: M'Cheyne's Calendar · Day 1" at Chronological's end, and it
  opens.
- **459b:** Start Plan, not Start Instead.
- **The reminder** (log): "Today's Reading | Chronological: Psalm 60; Psalm 108; 2 Samuel
  9–10; 1 Chronicles 19; Psalms 20–21 / M'Cheyne's Calendar: Genesis 2; …". It is opened
  per plan file ("reminder opened, plan file 4").
- **144, 145 and 148** changed as expected: Go To's plan row, the day's end, and the
  authorization alert over a plan's days.

**The data:**
- **`mcheyne.txt`** passes the calendar's rule: the Old Testament once, and the New
  Testament and Psalms twice. Day 220's five passages are the calendar's own (note).
- **`chrono.txt`** covers every verse exactly once.
- **`test_plans`** covers each file's rule, the migration, `DONE`/`UNDONE` and 1.0's `READ`
  lines, one plan's marks never another's, the reminder for one plan, two plans, and plans
  with Memory, and Also today.

### Required changes (Minor)
1. **[Minor, before TestFlight] Chronological's days are uneven.**
   - `chrono.py --check` prints:
     - longest day 1.78 × the mean (day 135), shortest 0.14 (day 320: a few verses of the
       burial and the empty tomb);
     - 38 days under half the mean;
     - the Gospels over 69 days at 0.58 of the mean;
     - day-ends up to 24 days' worth ahead of an even pace (day 231).
   - A reader meets that as a run of long Old Testament days, then ten weeks of short
     Gospel days. It doesn't feel like one plan.
   - The parallels are rightly kept together. But the balance should aim at **even days**,
     not at tracking an even pace.
   - Fix: choose the 365 day-ends by dynamic programming over block boundaries, minimizing
     Σ (day − mean)². Keep a block (and a block of parallels) whole, and §16.4.4's split
     of an over-long block at chapter ends.
   - Expected: the Gospels in about 40 days, and no day under 0.4 × the mean unless a
     single block forces it. `chrono.py --check` should print the new spread, and the
     commit should carry it.
2. **[Minor] Passage labels repeat the book.**
   - Day 3 reads "Genesis 8–9; Genesis 11:1–9; Genesis 10; Genesis 11:10–26", and day 114
     "Psalm 22; Psalm 16; Psalm 118; Psalm 110; …".
   - Name the book only when it changes: "Genesis 8–9; 11:1–9; 10; 11:10–26" and "Psalms
     22; 16; 118; 110; 2 Samuel 8; 1 Chronicles 18".
   - Apply this wherever a day is labelled: Go To's row, the lists, the end panel's Next,
     and the reminder.
   - Test the two examples.
3. **[Minor] The end panel's check doesn't grow with the text** (451: "Day 4 is read" at the
   largest size, its `checkmark.circle.fill` still small). Size it from the label's font
   (a symbol configuration with that font's text style).

### Deviations (§16.12): decisions
1. The day's reader as a second table in the reader's navigation view, sliding by snapshot:
   **accepted.** It behaves as specified (433–454). The slide and Reduce Motion's
   cross-fade go on the phone list.
2. Chronological balanced by choosing all day-ends together: **accepted as the direction,
   not the result.** See Minor 1.
3. Some Chronological days read parts of one chapter twice (Genesis 11:1–9, then 10, then
   11:10–26): **accepted.** That's the chronology. Minor 2 makes their labels read better.
4. M'Cheyne's day 220 with five passages: **accepted**, as it is the calendar's.
5. `READ` lines rewritten only for partial passages: **accepted.**
6. The demo at day 114, not 32: **accepted.**
7. Used-flags so the day tips are skipped once used: **accepted.**
8. The reminder's lines with full plan names, and the plans' part cut at 120 characters when
   Memory follows: **accepted.**
9. 144, 145 and 148 changed: **accepted.**
10. Help moved to the notes job: **accepted.**

## B. CI balance
Today's jobs: read+plans 17 min, notes/listen/help 9, languages/versions/more 16,
store+memory 21, ribbons/study/ios18 22.

**When §17 is built, put the `ipad` group on the notes/listen/help job,** not the study job
as §17.8.2 says. That gives about 14 minutes there, and the study job stays as it is. I'll
amend §17.8.2 accordingly. If ribbons/study/ios18 stays near 22 for two more runs, move
`ios18` to the notes job too.

## C. Needs a real phone (the owner)
- **A week of two plans:** does each day's page feel right? Is Mark Read where your thumb
  is? Do "Also today" and the one reminder with two lines work for you?
- **The slide** into and out of a day, and the cross-fade under Reduce Motion.
- **Listen through a day** with Bob Souer, across a partial chapter (1 Samuel 23:24–24:22):
  it starts and stops on the right verses.
- **An ESV day** offline and online.
- **The reminder** on a cold launch: it opens the first plan's day.
- **A plan started in 1.0** (if you still have one): after updating, it's there with its
  marks.
- **VoiceOver:** passage headings in the rotor, and Mark Read's label naming the passage.
