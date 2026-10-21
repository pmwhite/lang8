# §15 review 1: the manual and quick tips at 6ca5d5d2, CI run 39491063292

I reviewed the snapshot of run 39491063292 (`ci-bible-shots` at 7ca5b558). The sources were:
- **Shots:** 400–419 and 414b (the `help` group).
- **Logs:** `help-tips.txt` and `help-record.txt`.
- **The recording** `help-transitions.mp4`: sequence 20, marked 3.69–18.40 s, 322 frames.
  I compared each frame with the one before it, and looked at each run of change.
- **The code:** `help.l8`, `ios_help.l8` (the tip's cell, its VoiceOver, Reduce Motion, the
  page's headers and links) and `test_help.l8`.
  - `l8c3 test programs/bible/test_help.l8` gives 6 tests, all passing: the file and its
    checks, markup, §15.2.3's rule, the state's words, and the Manual's search.
- **The builder's notes,** §15.10.
- **`data/help.txt` as it stands at 135a99b8d.**

## A. The build

§15 is built as designed, and it reads calm: one quiet row, plain words, no counts.
**No Blocker and no Major: approved**, with two Minors.

**help.txt and my edits:**
- **aefd76fb was my mistake.** My script cut §16's page in at `= versions\t`, which first
  matched the Notes page's part `== versions\tIn every version`. That's what duplicated the
  Ribbons, Reading Plans and Versions pages.
- **The builder's repair is right** (note 1):
  - Round 10's Reading Plans page is shown, since the manual describes the app as built;
  - §16's page is kept as `#16` comment lines for §16's builder;
  - the `plan` tip has its current wording;
  - `test_help.l8` caught the duplicate ids, as §15.6 meant it to.
- **135a99b8d (§14.10b) did not repeat it.** It replaced two whole lines (the alphabet and
  Add Words paragraphs), matched by their own starts. The file now has twelve unique pages.
- But that edit describes §14.10b's behaviour before it's built (Minor 2).

**The shots against §15.7:**
- **400:** Go To at its top, with the tip "Type a reference here, …" with a faint
  lightbulb, More and Next, then New Ribbon…, Reading Plans and the books.
- **401–403:**
  - Next goes to tap-select;
  - closing and reopening keeps it ("day 2026-10-19");
  - the next day moves on (highlight, "day 2026-10-20").
- **404:** after a highlight, the log has "tips skipped tap-select (highlight), highlight
  (highlight) …", and the tip is note.
- **405 and 406:**
  - the action New Ribbon… pushes New Ribbon with the place (John 3:12);
  - More opens Ribbons at "Making one", its heading washed.
- **407:** Reading settings' Help section: Manual (`book.closed`), Show Tips on, and its
  footer.
- **408:** the twelve pages with their symbols and parts.
- **409:** Selecting Verses, with the symbols drawn inline in the text's size and color, and
  the links in accent.
- **410:** Memory at "Choosing a passage", washed (note 8's link).
- **411:** "ribbon" finds Going Places' "ribbons" and Ribbons' four parts, the matches in
  semibold.
- **412:** Show Tips off: no tip, and Go To opens scrolled to the current book, as before.
- **413:** on again: the tip that was current (ribbon-new, with its action).
- **414 and 414b:** Night.
- **415:** at the largest size the tip wraps, and the buttons stack, nothing clipped.
- **416:** a page at the largest size.
- **417 and 418:** the Greek and Hebrew and Memory pages describe Rounds 10 and 9. 417 is
  6ca5d5d2's text, before §14.10b's edit.
- **419:** after every tip, a tip is still there (the first unskipped), with no "all done".

**Sequence 20:**
- Go To slides up (4.41–4.78 s).
- Each Next cross-fades the tip's words. The second Next's longer tip grows the row over 14
  frames (6.66–6.83 s), with New Ribbon… moving only by that height.
- More's push (7.89–8.38 s), the pop (9.62–10.44 s) and the close (10.76–11.23 s) are the
  system's.
- Nothing jumps.

**The code:**
- **The rule (§15.2.3) is tested case by case:** a fresh start, Next, skipping, the same
  day, the next day, wrapping, and an unknown `tipCurrent`.
- **The state** (`tipCurrent`, `tipDay`, `tipSeen`, `helpUsed`) is kept in defaults, and
  `helpUsed` is set by each feature's first use ("help used …").
- **VoiceOver:**
  - the tip reads "Tip: …", with Next Tip, More and its action as custom actions;
  - a page's headings carry `UIAccessibilityTraitHeader`;
  - each paragraph is one element, its symbols read by name, its links as actions.
- **Reduce Motion** removes the tip's cross-fade, the wash, and the animated scroll to a
  part.

### Required changes (Minor)
1. **[Minor] help.txt uses straight quotes and apostrophes.**
   - 400 shows `"jn 3:16"`, and the pages have "you're", "Library's" and so on. The rest
     of the app sets them curly: Go To's own field reads “jn 3:16”.
   - The words are mine, so I'll make them typographic (“ ” ’) in the next design commit
     touching `help.txt`.
   - The builder needs only to keep the checks working with them: §15.6's ". " rule and
     the search's ’ = ' already do.
2. **[Minor] The manual is ahead of the app on Greek and Hebrew.**
   - My §14.10b edit (135a99b8d) already describes Sounds Written As, Related to Words You
     Know and the meaning-first card, which §14.10b's round will build.
   - That's fine if §14.10b is built next, as planned. If it slips behind another release,
     keep the built text and put the new lines as `#14.10b` comments, as note 1 did for
     §16.

### Deviations (§15.10): decisions
1. help.txt restored, with §16's page as `#16` lines: **accepted, with thanks.** The
   mistake was mine (above).
2. §16's tips under an always-true `unbuilt`: **accepted.** §16's builder removes it and
   restores their MOREs, as the comment says.
3. The Manual's search matching plurals, with quoted words matched as words: **accepted.**
   A phrase search isn't worth its code in twelve short pages. I'll amend §15.3.2's
   "Search's rules" to say so in the next design commit.
4. Symbols' VoiceOver names, and links as actions: **accepted.**
5. Fixed tip columns at 28 and 56.5 pt: **accepted.** A point or two off at the larger
   standard sizes doesn't show, and the measured alternatives cut tips.
6. Pushes in the sheet's own stack; TextKit 1; the demo's 6 s wash (1 s in the app):
   **accepted.**
7. The logs: **accepted.**
8. 414/414b, 410's link, the steps, and `help`'s place between `read` and `plans`:
   **accepted.**

## B. CI balance
The jobs now run 12.1 min (read+help+plans), 14.9 (notes+listen), 14.5
(ribbons+study+ios18), 16.5 (store+memory) and 16–25.5 (languages+versions+more).

What's coming:
- §14.10b changes some shots, not their number;
- §16 adds about 25 steps to `plans`, which puts read+help+plans near 16;
- §17 adds the `ipad` group to the study job, which puts ribbons+study+ios18 near 20.

So, when §17 is built:
- move `more` from the languages job to notes+listen. That makes languages+versions about
  16–20 and notes+listen about 19–21.
- If the languages job still swings by 10 minutes, compare the `*-timing.txt` of a slow run
  and a fast one, and see whether the boot or the groups take the difference, before
  moving anything else.

## C. Needs a real phone (the owner)
- **VoiceOver:**
  - the rotor's Headings moves by part on a manual page;
  - symbols are read by name ("the bookmark button");
  - a link is an action ("Open Memory");
  - the tip reads "Tip: …", with Next Tip and More.
- **Links:** tapping a link in a page goes to it, and long-pressing selects text. Neither
  gets in the other's way.
- **Dynamic Type:** change the size while Go To or a page is open. The tip and the page
  reflow, nothing clipped.
- **Reduce Motion:** no cross-fade on Next, no wash.
- **The wash:** at 1 s, does it read as a calm "here", or too quick?
- **The actions that leave Go To** (Open Search, Open Memory, Greek): Go To closes, then the
  other sheet opens, with no flash between.
- **The tip over a week:** does once a day feel right, and does skipping what you already do
  feel like the app noticing, or like the app watching?
