# Round 8 review 1: ribbons (§11 revised) at 2b4664cf, CI run 39285064590; review r7-1's fixes

I reviewed the snapshot at `/tmp/r8r`. The sources were:
- Shots 160–182 and 178a (the `ribbons` group), the `plans` group's 140–149b and 158,
  70-history, and 190–203 for the Round 7 fixes (191b, 191c and 192 in particular).
- `ribbons-ribbons.txt`, `ribbons-console.txt`, `ribbons-timing.txt`, and every
  `*-console.txt` and `*-log.txt`, searched for the layout warning and for "off the window".
- The recordings, as frames with their times:
  - `ribbons-transitions.mp4`: sequence 13, marked 0.75–19.26 s, 200 frames.
  - `plans-transitions.mp4`: sequence 12, marked 0.65–16.01 s, 305 frames.
  - `listen-transitions.mp4`: sequence 14, marked 4.01–17.52 s, 182 frames.

  I compared every frame with the one before it. Then I looked at each change that
  happened in a single frame, with nothing changing just before or after it.
- The code: `git diff 7e1a716a..2b4664cf -- programs/bible`, in particular `ribbons.l8`,
  `ios_ribbons.l8`, `ios_daily.l8` (Go To, the plans, `on_window`), the jump and capsule
  paths in `ios_select.l8` and `ios.l8`, and 236e7d64 and 5882522f for review r7-1.
- Tests: `l8c3 test` on `test_ribbons.l8`, `test_plans.l8` and `test_audio.l8` gives 23
  tests, all passing. The Worker's 19 tests pass, including "refused audio never eats the
  text's share".

## A. The ribbons revision (§11)

The build is faithful to §11 and to principle 6. The model is exact, and migration is
right. Nothing is automatic. **No Blocker and no Major: approved.**

- **The model (`ribbons.l8`) is §11.1, rule for rule:**
  - M1 is "either way", with the read-chapter exception. Revelation 22 keeps its place.
  - M2 moves the ribbon only when K.c = c.
  - P1 puts the ribbon down without measuring. P2 is a rest, then a put-down.
  - P4 is kept beside the capsule. It's cleared by another jump, by deleting the ribbon,
    or by picking it up or moving it some other way.
  - Move Ribbon Here puts the other ribbon down first. Rename to empty keeps the name.
    Deleting the carried ribbon ends carrying.
  - `test_ribbons` covers every example in §11.1.4 and every case in §11.1.7 and §11.4.
- **Every jump passes through `ribbons_jump`, before the reader moves:**
  - `jump()`: Go To, search, links, a preview's Open, Compare, the reminder and a plan's
    start.
  - `ribbon_place_go`, the capsule (`back_tapped`, kind 1, then
    `ribbons_capsule_arrived`), and the status bar (kind 2).
  - The other callers of `go_place`/`go_verse`/`go_top` are relayout, a version switch and
    Listen's following, which aren't jumps.
- **`ribbons.tsv` is sound:**
  - It's written whole through `write_file`, one line per ribbon in the order made, then
    `CARRIED` and `NEXT`.
  - Names are cleaned on input and on parse, so a tab or newline can't break a line.
  - Duplicate ids keep the first. A stray `CARRIED` is ignored. A 13th line is skipped.
- **Migration is §11.4:**
  - It runs only when `readings.tsv` exists and `ribbons.tsv` doesn't. It takes the newest
    three of the last 14 days, newest first, named by the default rule, and none is
    carried.
  - Then it writes `ribbons.tsv`, moves `readings.tsv` to `readings-r6.tsv`, and removes
    `readingsSeeded`.
  - The log has "ribbons migrated 3 of 4" and "readings-r6.tsv there 1". Psalm 24 (20 days
    old) and the `CLEARED` line are dropped. 160 shows Romans "Today", Acts "Yesterday"
    and John "Friday", and Recent doesn't list their chapters.
  - A second launch reads `ribbons.tsv`. That file always exists after migration, even
    with no ribbons, because `NEXT` is written.
- **The shots match §11.6, as amended by §11.9:**
  - **161 and 164:** the menus, with "Reading with Morning" as the header.
  - **162 and 178a:** placeholder "Mark", then "Jude" with Chapter dimmed. The keyboard is
    up.
  - **165–167:** Mark 2:5, then 2:3, then "Mark 3".
  - **168:** Morning stays at "Mark 3" after the search jump. The log has no "moved" after
    the put-down.
  - **169:** the capsule picks it up again ("(back)").
  - **170:** the preview and the Library don't put it down.
  - **171:** Acts 10:9 exactly, with "‹ Mark 3" and the toast.
  - **172:** "Acts 11 · Now".
  - **173:** "Acts left at Acts 11", by the M1 exception at Acts 10's end (note 3).
  - **174:** "Reading with Romans".
  - **175 and 176:** Ribbon, then "With Anna".
  - **177:** three ribbons are left.
  - **178:** Jude, with "‹ Romans 8" and the toast.
  - **179:** wraps at AX5.
  - **180–182:** Plans with From a Book, A Chapter a Day for Hebrews 1–13, then Go To
    with the Reading Plan section. The log has "put down: Jude".
- **The plans group follows the restored list:**
  - 140 is New Ribbon… with its footer, then Reading Plans, with no headers.
  - 141 is From a Book. 142 is Start Plan in the toolbar. 143 has the plan row and
    Reading Plans.
  - 144–149b are as in Round 6, with 149b started again with its reminder off.
  - 70-history shows History again (note 18).
- **The glyph** reads as a narrow, curved, forked strip, plainly not `bookmark.fill`, in
  rows, menus and the toast. Its row size follows Dynamic Type (179).
- **Accessibility:**
  - A row's label is "Name. Romans, chapter 8. Read …." Its hint is "Opens here. Moves on
    as you read." Its custom actions are Ribbon Details and Delete.
  - With 12 ribbons, New Ribbon… has the not-enabled trait.
  - The title has the value "Reading with …" and the actions New Ribbon Here and Leave …
    Here.
- **Principle 6:**
  - Go To is built in `viewWillAppear:`. Deletion is Automatic, the last ribbon fades its
    section, and New Ribbon… fades back in at 12 → 11.
  - New Ribbon's field becomes first responder in `viewWillAppear:`.
  - Sequences 12 and 13 have no abrupt change that I could find. Their only single-frame
    changes are mid-motion samples of pushes and sheets, as in review r7-1 item 7. The one
    exception is the deletion, which isn't recorded at all (Minor 2).
- **Strings:** no "track", "progress", "streak", "resume" or "Continue Reading".
- **Review r7-1 Minor 6 is resolved:**
  - No `UITableViewAlertForLayoutOutsideViewHierarchy` in any group's log.
  - Step 261's Versions and Acknowledgements updates are logged "off the window, not
    updated" (two of each) and reloaded whole instead.
- **Regressions:** none seen outside the listed groups.

### Required changes (Minor)
1. **[Minor] The title menu's "New Ribbon Here…" subtitle shows a stale verse after a
   jump.**
   - What's wrong:
     - The menu is built ahead of time from `here_name()` = `place_name(cur, place_v)`.
       `arrive()` and `ribbon_place_go` change `cur` but don't measure.
     - So after the grid jump to Romans 8 (step 304), the log has "New Ribbon Here… ·
       Romans 8:5": the verse 5 is left from the rest at Acts 11:5. Meanwhile 174 shows
       Romans 8 at its top.
     - The actions themselves measure first, so only the words are wrong.
   - Fix: call `measure_place()` before building the title's menus in
     `title_menus_refresh`/`title_menu_set`. Or call `measure_place(); title_menus_refresh()`
     at the end of `jump_settle`, `reading_settle` and `back_tapped`.
   - Check: step 304's menu line reads "· Romans 8".
2. **[Minor] Sequence 13's first act (the swipe Delete) is in no frame.**
   - What's wrong:
     - The recorder writes nothing for about its first 4.7 s. Sequence 13 has frame 1 at
       0.00 and frame 2 at 4.95, with Acts already gone and the rows below already moved.
       Sequence 14 is the same: 0.00, then 4.73.
     - So the deletion's animation can't be checked, though the code uses Automatic.
   - Fix: hold a still lead-in of at least 6 s after recording starts before the first
     act of every sequence. Mark from the step's logged start ("at unix ms"), not from
     the send.
   - Re-record sequence 13. Its delete should show the row sliding away over several
     frames.
3. **[Minor] Footer and limit at 12 ribbons.**
   - What's wrong: at 12 → 11, the footer's text is set to nil, but its height stays until
     the next reload. That leaves an empty gap under New Ribbon…. Nothing in CI reaches 12
     ribbons.
   - Fix:
     - After clearing the text, run an empty `beginUpdates`/`endUpdates`, so the footer's
       height animates away.
     - Add a log-only demo step that makes 12 ribbons. It should check "12 ribbons is the
       most.", New Ribbon… disabled, the menu's disabled item, then one delete. Logs are
       enough; no shot is needed.
4. **[Minor] Shots.**
   - **163 has no toast:** "waiter late, state 293". Take 163 when the toast's log line
     appears.
   - **158 is scrolled too high:** it shows New Ribbon… and its footer, and the Reading
     Plan section is below the fold. Scroll so the plan's row and Reading Plans are in the
     shot.
5. **[Minor] Undocumented deviation: the toast lasts 6 s in the demo (1.6 s otherwise).**
   - That's reasonable for shots. But it's why the toast sits over sequence 13's menu for
     about 4.7 s.
   - Add it to §11.9.

### Deviations (§11.9): decisions
1. `NEXT` line: **accepted**. It's needed for "ids never reused".
2. Kinds of jump for P4 (the status bar and the chapter on screen remember nothing):
   **accepted**.
3. "Read since pickup" in memory only, and Leave Here as a rest: **accepted**.
4. A chapter's end "on screen" as the row's foot within the insets: **accepted**.
5. Real times in the demo, so "Now" and "Read just now": **accepted**.
6. 166 at Mark 2:3: **accepted**.
7. 178's "Romans (2)", and 178a: **accepted**. That's the rule working.
8. 177 leaves three ribbons: **accepted**. My spec's "4" was wrong.
9. 172's Listen through `demo_heard`: **accepted**.
   - The first "chapter heard ACT 10" isn't counted, as CI's `plan_heard` skips it. The
     demo's second one moves the ribbon to Acts 11.
10. The title menu opened through its interaction, and logged whole: **accepted**.
11. 12 → 11 handling: **accepted**, with Minor 3.
12. The plan row's Remove fades its section: **accepted**.
13. Glyph sizes (the body size in rows, 17 in menus, 13 in the toast): **accepted**.
14. The keyboard's return from the choosers, and "at its own place" comparing verses 0
    and 1 as the same: **accepted**.
15. Starting a plan at the reader's chapter, with no jump: **accepted**.
16. Off-window reloads, logged: **accepted**. This resolves r7-1 Minor 6.
17. Shared `bg_*` choosers, and the grid's toolbar gone: **accepted**.
18. 70-history choosing Recent's own section: **accepted**.

## B. Review r7-1's fixes (Major 3 not judged)

1. **Major 1: done.**
   - `reach_read` uses `SCNetworkReachabilityCreateWithAddress` with a zeroed
     `sockaddr_in` (len 16, AF_INET), made once. No host name is resolved.
   - "net flags 0x…" is logged, but only on a device: the fixture skips reachability, so
     no CI log has it.
2. **Major 2: done.**
   - `audio_verse_shown` and `audio_hold_ended` are pure, and `test_audio` tests them.
   - `ap_hold_v` is cleared at the hold's end, at the next item, and on a remote scrub.
   - Sequence 14's first wash is 3:30, under "John 3:30". 3:31 and 3:32 follow by
     cross-fade.
3. **Major 3: in progress (the alignment job); not judged.**
4. **Minor 4 (Now Playing after a seek): done for forward seeks.**
   - The log has "elapsed: 14.7", "3.7", "5.7" and "34.7" straight after each seek.
   - It's still wrong for a backward seek: see the new item below.
5. **Minor 5 (sequence 14): done.**
   - The placing happens before the mark. The mark (4.01 s) is close to the first action
     (4.73 s).
   - The pause and more than 2 s of rest are inside the marks: the last change is at
     15.34 s, and the end is 17.52 s.
6. **Minor 6: done** (see A).
7. **Minor 7: done.** The ring has the value "n percent" and the updates-frequently trait,
   and "John downloaded" is announced.
8. **Minor 8: done.**
   - 192 is titled "iPhone Voice". 191b shows the WEB's "Yahweh" footer and the ESV.
   - 191c shows the iPhone Voice footer with the Settings path, and Downloads.
   - 9b (raḥam) stays carried to the next data pass.
9. **Minor 9: done.** A refused audio request adds nothing, and the new test passes.
10. **5882522f (shots published when the pixel check's tools fail): fine.**

**New: [Minor] A backward seek clears `ap_seek_target` at once.**
- What's wrong:
  - `ap_poll_once` clears the target when `t >= target − 5`. Before a backward seek lands,
    the old time is already past the target, so the target is cleared on the first poll.
  - `now_playing()` then posts the time from before the seek. A reader switch to an
    earlier verse, or Previous within a chapter, can leave the lock screen running from
    the wrong time.
- Fix: clear the target only when `|t − target| <= 10` cs. Have `now_playing` use the
  target whenever it's set.

**The fixes are approved.** No Blocker, and no Major apart from Major 3. Round 7 as a whole
stays open until the timing files are finished (Major 3; re-review r7-2 needs only the
data, as review r7-1 says).

## After the fixes
- Step 304's title menu says "· Romans 8". Menus are measured fresh after every arrival.
- Sequence 13 is re-recorded with a lead-in, and its deletion animates over several frames.
- 12 ribbons are covered by a logged demo step. The footer's gap is gone at 12 → 11.
- 163 shows the toast. 158 shows the Reading Plan section at AX size.
- §11.9 names the demo's 6 s toast.
- Now Playing is right after a backward seek.
