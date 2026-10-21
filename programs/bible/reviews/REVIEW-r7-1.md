# Round 7 review 1: code 57affdef (head 57affdef), CI run 39217868639

I reviewed the snapshot at `/tmp/r7r`. The sources were:
- Shots 190–203 (the `listen` group, with 194b, 196b, 201b, 201c and 202b), 80, the
  Round 6 shots 172, 176, 179 and 180 (for r6-1 items 8 and 9d), and the rest for
  regressions.
- `listen-console.txt`, `listen-listen.txt`, `listen-log.txt` (os_log), `read-console.txt`
  (the push and status-bar logs), and every `*-log.txt` for the layout warning.
- `listen-transitions.mp4`, sequence 14 (marked 0.71–18.4 s). The file is variable frame
  rate: 189 frames, each written only when the screen changed. I looked at every frame
  against the one before it. I also looked at `reading-` and `plans-transitions.mp4`
  (sequences 13 and 12) for single-frame changes.
- The code: `git diff 07d833a7..57affdef -- programs/bible`, in particular `audio.l8`,
  `ios_listen.l8` (the player engine, polling, fallback), `ios_audio.l8` (Voice,
  downloads, reachability), `ios_demo7.l8`, `simulate.sh`, `worker/worker.js` and
  `test.mjs`, the privacy page and `PrivacyInfo.xcprivacy`; and 00665c74 and 57affdef for
  the r6-1 items. d6133800 (the §11 revision to ribbons) is design only and isn't built
  yet, so it isn't reviewed here.
- `make bible-test` passes (bible tests, worker tests, data checks, spoken text). The
  Worker's 18 tests pass on their own as well.
- The timing files: `data/audio/*.tim`. I spot-checked Souer's John 3 against the real
  recording, `BSB_43_Jhn_003.mp3`, fetched once from openbible.com.

## A. Round 7

The app side of Round 7 is faithful to §12. Two things are wrong at the edges (Majors 1
and 2), and the data isn't finished (Major 3).

- **The listen group matches §12.7 shot for shot.**
  - **190:** "Listen from John 3:14", Speed, "Voice · Bob Souer", and no footer.
  - **191:** BSB with Bob Souer ✓ and the 85/45 MB footer. The WEB section begins below
    it.
  - **192:** Best Available ✓, then Standard voices. No novelty voices: `voiceTraits`
    bits 1 and 2 are both excluded, which is right.
  - **193:** "John 3:16 · Bob Souer", with 16 washed. The log has "from 3:14 at 14.70 s"
    (deviation 10).
  - **194/194b:** "John 3 · Loading…", then "John 3:3 · Bob Souer".
  - **195:** "John 3:7 · Barry Hays". The log has "switched to hays at JHN 3:5".
  - **196/196b:** rate 1.25, then 3:19 two seconds on.
  - **197:** "John 4:1", the title "John 4", "chapter heard JHN 3" and "listen next JHN
    4".
  - **198:** "John 3:16 · iPhone Voice · Offline", and the fallback line.
  - **199:** "John 3 · David Cochran Heath", with no wash, the fixture line and "seek
    estimate cs 1334". The text is the fixture's WEB, as §9.4.10 says.
  - **200:** KJV, "Voice · iPhone Voice", and the one-time footer.
  - **201–201c:** sizes from the timing file, John's ring, then its checkmark, then
    "John · Bob Souer · 99 MB".
  - **202/202b:** the Audio section's three rows, and "ESV Audio" above the verbatim
    footer.
  - **203:** the rows and footers wrap at AX5.
  - **80:** reads "Bob Souer", the one expected change.
- **The engine is §12.3, with no blocks:**
  - Items, KVO on `currentItem`, `timeControlStatus` and `status`, and observers removed
    before release.
  - Selector notifications, and a 10 Hz poll in common modes that runs only in the
    foreground.
  - CMTime is read with `getValue:size:`. Seeks pass three 24-byte CMTimes by address.
  - Fetch-ahead fetches 10 on Wi-Fi, one at a time: the log shows JHN 4–13.
  - Book downloads are one at a time, kept outside the cache, and marked not to be backed
    up.
  - The ESV is never cached.
  - Now Playing logs its dictionary at 193, 195, 196 and 197. The artwork uses the
    deprecated block-free initializer, as the log says. The remote commands are
    target-action.
- **Sequence 14 shows what §12.7 asks**, once the action begins (at 7.64 s; see Minor 5):
  - The wash cross-fades 30 → 31 → … → 36. Each change is a 0.2–0.3 s cluster of frames,
    0.8 s apart at Faster.
  - There's one follow-scroll (9.33–9.79 s).
  - John 4's opener scrolls to the top with the title push (12.0–12.7 s). The label
    becomes "John 4".
  - "Bob Souer" → "Barry Hays" cross-fades (15.40–15.60 s), and so does "Paused"
    (17.57–17.79 s). Nothing changes in one frame.
  - **One exception:** the first wash is on verse 29 under a "John 3:30" label, before it
    fades to 30 (Major 2).
- **Calm and accessibility:**
  - The state line cross-fades. "Loading…" is held at least 0.5 s after 0.5 s of waiting.
  - The one-time footer is set before the sheet lands.
  - The mini player's label joins both lines ("John 3:14, Bob Souer").
  - Reader rows have the selected trait. Voice wraps at AX5 (203).
  - The download ring has a label but no value (Minor 7).
- **Licences and credits:**
  - The BSB readers are credited as CC0 1.0 (bereanbible.com's own statement).
  - Henson is credited as public domain, linked to eBible.org's audio page.
  - "Verse Timings" carries the "a moment early or late" caveat. The Changes screen
    says "Recordings are played as published…".
  - The ESV Audio row names Heath and the ESV API from Crossway, above the unchanged
    copyright footer. Now Playing's album is "English Standard Version".
  - The KJV recording isn't used (§12.9 question 2 stands).
- **Privacy:**
  - The privacy page's Listening paragraphs say what §12.5 asks: the three hosts, what
    they receive, the ESV address asked of smoothbible.com with only counts kept,
    downloads on the iPhone, and the voice on the device. They match the app.
  - The Worker logs nothing. Its new D1 table holds passage → address only, not anything
    about a person.
  - `PrivacyInfo.xcprivacy`'s comment names the hosts. Info.plist is unchanged.
  - The App Store answer stays Data Not Collected.
- **No network in CI:**
  - Every group installs the audio fixture.
  - `net_reachable` and `net_cellular` short-circuit in fixture mode.
  - The ESV's audio comes from the fixture's JSON. The `listen` group's ESV is the
    fixture's (`esv_off` is cleared only with it).
  - No console names openbible.com, ebible.org or audio.esv.org.
- **The Worker (§12.6) is as specified:**
  - Validation as for chapters.
  - The D1 address is answered first, with no budget spent.
  - `redirect: "manual"`, with `Location` checked against `^https://audio\.esv\.org/`.
  - Audio is refused at 45/800/4,000.
  - The key is in no reply.
  - `esvAudio` is in the status.
  - Refused requests still count (Minor 9).
- **The timing files, as far as they go, are good.**
  - Souer's John 3 line has the recording's exact size, 4,357,958 bytes, and its
    duration, 272.25 s.
  - An onset test: quiet (below 2.5× the 20th-percentile level) for 0.25 s before the
    start, and speech after it. 32 of the 36 verse starts pass outright. A random
    position passes 6.5% of the time.
  - Three of the other four (3:3, 3:5, 3:13) have the onset 0.01–0.07 s earlier.
  - 3:36 starts 0.55 s before its onset: Souer runs 35 into 36, so there's no pause to
    find. That is inside the 0.3 s seek lead plus the wash's cross-fade, and the
    recording, not the aligner, decides it.
  - John 3 was aligned at 2× (Matthew and Mark 1–11 were at 1×). This supports
    deviation 1.
  - Whisper was too slow to finish on the laptop while the aligner runs, so this onset
    check stands in for listening.
- **Regressions: none** outside the listen group and 80. The Round 6 shots are unchanged
  apart from the r6-1 fixes (172's icons, 176/179/180's indicators gone).

## B. Review r6-1's Minor items

1. **Done.** A reading's tap in the chapter on screen gives no capsule and no history.
   The log says "reading opened in the chapter on screen (no capsule)".
2. **Done.** The plan's days open at today from day 8 (`td > 7`) when nothing is behind.
3. **Done.** `status_top` calls `reading_jumped()`.
4. **Done.** `test_readings` has Genesis 5 / John 13–14 → "John 15", Genesis 5 kept, and
   Romans 16 / 1 Corinthians 2–3 → "1 Corinthians 4", Romans 16 kept.
5. **Done.** The push line has d, p, t, both chapters and offsets, the old title's alpha,
   and settled. "status bar landed at 999, off its top by x10 0" is on one line.
6. **Done.** An estimated landing is corrected with `set_offset_animated`, and logged.
   CI landed exactly (0 and 0).
7. **Done.**
   - Sequences 12 and 13 are set up in steps 341/342 before their marks. The
     single-frame candidates in both recordings are mid-motion frames of sheets and
     pushes that the recorder sampled sparsely, not steps.
   - Start Reading opens at Mark 1 (the Book list from Mark, "16").
8. **Done.** 17-point row icons use `configurationWithTextStyle:` and grow at AX5 (172).
9. **Partly done:**
   - **9a: done.** "Chapter 3 of 16, just now", with no "read", and tests updated.
   - **9b: not done.** raḥam's gloss. Deferring it is accepted, but it stays open (Minor
     8).
   - **9c: claimed, but not resolved.** The warning is still logged once in the plans
     group (08:04:14) and the reading group (08:01:05) (Minor 6).
   - **9d: resolved without a change.** 176, 179 and 180 show no scroll indicator in this
     run.
10. **Done.** `moved_at` is set only while `isTracking || isDecelerating`.

## Required changes
1. **[Major] Reachability is read by host name on the main thread, which can block for
   seconds in exactly the dead spots Round 7 is for.**
   - What's wrong:
     - `reach_read()` uses `SCNetworkReachabilityCreateWithName(0, "openbible.com")` and
       then `SCNetworkReachabilityGetFlags` synchronously. It runs from `net_reachable` /
       `net_cellular` at every chapter start and fetch-ahead decision.
     - For a name target, GetFlags resolves DNS synchronously. Apple warns that it can
       block for a long time (tens of seconds) when the interface is up but nothing
       answers: a tunnel, a train, captive Wi-Fi.
     - In that time the reader freezes, mid-wash and mid-scroll. Principle 6 and
       acceptance 4 ("never stopping for the network") fail on the device, and CI can't
       see it because the fixture skips reachability.
     - This is the designer's error: §12.3.3 prescribed the name form.
   - What it should be:
     - Use an address target with no DNS: `SCNetworkReachabilityCreateWithAddress` with a
       zeroed 16-byte `sockaddr_in` (`sin_len` 16, `sin_family` AF_INET 2, address
       0.0.0.0). Read the same flags (reachable 2, connection-required 4, `IsWWAN`
       1 << 18) and make it once.
     - It still answers "Wi-Fi or cellular" and "any network at all", which is all
       `audio_effective` and fetch-ahead need. Whether openbible.com itself answers is
       already handled by the item failing (§12.3.4).
     - The designer will amend §12.3.3. Log the flags once per decision
       (`bible: net flags 0x…`).
2. **[Major] Listen from verse v washes verse v−1 first.**
   - What's wrong:
     - `audio_time_of` seeks to v's start − 0.30 s, and `audio_verse_at` adds only
       0.15 s. The first polls after the seek find v−1: `ts[v−2] ≤ t + 0.15 < ts[v−1]`.
     - In sequence 14 (Listen from 3:30), frames 1–29 show verse 29 washed under a "John
       3:30" label, before it cross-fades to 30. On a phone it's about 0.15 s of the
       wrong verse, plus two cross-fades, the label flicking to 3:29 and back, and the
       follow-scroll aimed at v−1. It happens on every Listen from a verse, every reader
       switch (§12.3.6), and every resume. That's against principle 6 and §12.3.2.
     - The fixture's 1 s verses show it plainly. The designer's numbers in §12.1 caused it.
   - What it should be:
     - In `ap_poll_once`, while `ap_seek_v > 1` and t is below that verse's start, hold
       the verse at `ap_seek_v` (clear the hold once t reaches the start, or on a
       scrub/next/previous).
     - Or set the seek lead and the look-ahead equal, but the hold keeps "the verse
       asked for is the verse shown" exact for any lead.
     - Add a `test_audio` case: time_of(30), then verse_at, gives 30 (with the hold's
       rule as a pure function in `audio.l8`). Re-record sequence 14: its first wash is
       30.
3. **[Major] The timing files aren't finished, so acceptance 2 isn't met yet.**
   - What's wrong:
     - Souer has 209 of 1,189 chapters `ok` (Matthew through Hebrews in part). Hays,
       Gilbert and Henson have none: every line is `chapter`, with duration 0.
     - So Round 7 follows verse by verse in under 5% of what it plays. The commit that
       finishes the run, with chapters flagged and CER per reader, doesn't exist yet.
     - The aligner is still running (`align.py run souer henson hays gilbert`), so this
       is expected. But the round can't be approved on it.
   - What it should be:
     - Let the run finish, then `align.py finish`. Commit the four files with the report
       in the commit message, as §12.8 says: chapters flagged per reader, CER per reader,
       the across-reader check's counts, and the spot transcriptions above 25%.
     - Expected: under 1% `chapter` per reader.
     - Re-review needs only the data: the report, `make bible-test`'s data checks, and a
       spot check of one OT chapter per reader (Psalm 119 and 1 Chronicles 1 included).
4. **[Minor] Now Playing's elapsed time is 0 after a seek on an item that's already
   ready.**
   - What's wrong:
     - In sequence 14 (the chapter downloaded at 201, so the item is ready at once), the
       log has `duration: 40.1, elapsed: 0.0, rate: 1.25` after the seek to 30.70.
     - Nothing updates it until the chapter ends. The lock screen would show 0:00 and
       run on from there, 30 s wrong, for that whole chapter.
     - `ap_ready` reads `currentTime` right after `seekToTime:`, before the seek lands.
   - What it should be: while a seek is in flight, use its target as the elapsed time in
     `now_playing` (keep the target until a poll sees time at or past it). Or call
     `now_playing()` from the first poll whose time differs from the one before the seek.
5. **[Minor] Sequence 14's marks and setup.**
   - What's wrong:
     - Nothing changes on screen from the mark (0.71 s) until 7.64 s. The step's
       Listen begins about 7 s into the marked span.
     - `demo7_listen` calls `go_place(john3(), 30, 100)` inside step 340, so the page
       moves from the 3:28 setup to 3:30 in one frame inside the marks (frame 0 → 1).
     - The pause lands at 17.6 s, leaving less than a second before the end at 18.4 s.
   - What it should be:
     - Do all the placing in step 339 (3:30, offset 100), so step 340 only starts Listen.
     - Mark the start when the app logs the step's start (or after `wait_done` for
       339), not before sending 340.
     - Give the step 2 s more, so the pause's cross-fade and a second of rest are inside
       the marks.
6. **[Minor] r6-1 9c isn't resolved: one `UITableViewAlertForLayoutOutsideViewHierarchy`
   per group is still logged.**
   - Where: plans group 08:04:14, reading group 08:01:05.
   - What's wrong:
     - The guards added cover `today_remove`, `rdl_remove`, the plan's days and
       `remind_rows_changed`. Something else still updates a table off the window.
     - Note that the plan's-days guard calls `reloadData` on an off-window table. That
       is harmless, but it's not needed if `viewWillAppear:` reloads.
   - What it should be: log the table's name next to each `insertRows…`, `deleteRows…`,
     `reloadSections…` and `reloadData` while `window` is nil (demo only). Find the one
     at those times and guard it the same way.
   - These groups' Go To and plans screens change with the §11 revision, so do this as
     part of that build if it's simpler.
7. **[Minor] The download ring tells VoiceOver nothing about progress.**
   - What's wrong: the ring button says "Downloading John" but has no value. Its
     progress is only visible.
   - What it should be: in `ring_set`, set `accessibilityValue` to the percent ("40
     percent"), with the updates-frequently trait while it runs. When the book completes,
     post `UIAccessibilityAnnouncementNotification` "John downloaded".
8. **[Minor] Words and shots.**
   - **The voice list's title is "Voice", pushed from a row named "Voice" on a screen
     named "Voice"** (192: "‹ Voice   Voice"). Title the list "iPhone Voice", which is
     its section's name. The row stays "Voice".
   - **191 shows only the BSB section.** At the sheet's medium detent, the WEB's
     "Yahweh" footer, the ESV section, the iPhone Voice footer with the Settings path, and
     Downloads (the switch and "Downloaded Books · 99 MB") appear in no shot.
     - Add 191b (Voice scrolled to the WEB and ESV) and 191c (to the iPhone Voice footer
       and Downloads), or open Voice at the large detent.
     - The Settings path's wording is the one string the owner must check on iOS 26.
   - **r6-1 9b (raḥam glossed "womb")** is deferred. That's accepted: it needs each
     number's dominant BSB rendering in `related.bin`. Carry it to the next data pass.
9. **[Minor] The Worker counts the audio requests it refuses.**
   - What's wrong:
     - `spend()` adds one to the minute, hour and day buckets before it compares, and
       `audio()` calls it with `AUDIO_BUDGET`.
     - Past 4,000 in a day, every refused audio request (one per chapter per ESV
       listener, since the app asks again at each chapter) still adds to the day's
       count. That eats the 800 kept for text until text is refused too.
     - The same happens per minute: refused audio at 45+ pushes text past 55.
     - §12.6 counts upstream calls, and a refused request makes none.
   - What it should be:
     - For audio, read the three counts first and refuse without adding when any is at
       audio's limit. Add only when the call goes upstream, or take the one back on
       refusal.
     - Add a test: a day at 4,000, then 900 audio requests (all refused), then a text
       request is served.

## Deviations (§12.10): decisions
1. **The aligner at 2× (`atempo=2`): accepted.**
   - 0.02 s median and 0.04 s p90 against 1× on three readers' test chapters.
   - My onset check of a 2× chapter (John 3) agrees: 35 of 36 starts are within 0.07 s
     of an onset, or there's no pause to find.
   - 3× was measured and rejected.
2. **Whisper cuts as the ear's stand-in for starts: accepted.**
3. **An unaligned chapter is `chapter`, not `missing`: accepted.** It plays the person,
   not the voice. That's the point of the round. The designer will amend §12.2.1's flags.
4. **A start for every verse key; empty verses share the next start; a psalm's title
   aligned but not written: accepted.** It matches `speak_v` indexing and §12.1's
   "verses that start together go to the last".
5. **Henson's "the LORD" → "Yahweh": accepted.** It's what the Classic WEB reads.
6. **The check limits (2.5–30 letters a second for verses of 20 or more letters, a floor
   of −2.6 a letter, more than 3 below flags) re-applied by `finish`: accepted.** The
   report in Major 3 must give the counts they produce.
7. **7-Zip for the zips; Gilbert one file a second: accepted.**
8. **`audio_verse_at` / `audio_time_of` and `ap_…` names: accepted.**
9. **A one-chapter book asked by its name ("Jude"): accepted.** It's the API's
   behaviour, and §12.6 is amended by it.
10. **193's log at 14.70 s: accepted.** The designer's arithmetic was wrong. 193 shows
    3:16 rather than 3:17 for the same reason.
11. **Stop Downloading as the ring's menu (a destructive `UICommand`), not an action
    sheet: accepted.** UIAlertAction needs a block. The menu is titled with the
    question.
12. **The preview's fade as 20 Hz volume steps: accepted.**
13. **The fixture's network always up; slow mode at 6 s; every group with the audio
    fixture: accepted.** This is what keeps CI off the network.
14. **SystemConfiguration linked for reachability: accepted, but Major 1 changes how it's
    called.**
15. **`nowplaying.png` = `AppIcon.png`: accepted.**
16. **A queue-begun chapter scrolls its opener to the top (animated): accepted.** It
    reads well in 197 and sequence 14.
17. **ESV audio offered only with `esvAudio` (or the fixture): accepted.** That's §12.6.

No Blocker. **Three Majors: Round 7 is not approved yet.**
- Majors 1 and 2 are small code changes, and each starts from a mistake in the
  designer's own numbers or API choice. The designer will amend §12.1 and §12.3.3.
- Major 3 is the alignment run finishing.
- Fold the Minors into the same pass. Review r7-2 checks the fixes, the re-recorded
  sequence 14, and the finished timing files.

## After the fixes
- `reach_read` uses a zero-address target, and no host name is resolved on the main
  thread.
- Sequence 14's first wash is 3:30. A `test_audio` case shows the hold.
- Four finished `.tim` files are committed with the alignment report. Fewer than 1% of
  lines are `chapter` per reader.
- Now Playing's elapsed time is right after a seek on a ready item.
- Sequence 14 starts acting at its mark, with no unanimated placing inside it.
- No layout-outside-hierarchy warning in any group.
- The download ring speaks its percent.
- Refused audio requests don't count against the text's budget (a test).
- The voice list is titled "iPhone Voice". 191b/191c show the rest of Voice.
