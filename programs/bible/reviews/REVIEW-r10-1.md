# Round 10 review 1: Greek and Hebrew foundations (§14.1–§14.10) at 1bc99603, CI run 39468127400

I reviewed the snapshot of run 39468127400 (`ci-bible-shots` at c38e7e60). The sources were:
- **Shots:** 240–269 and 256a (the `languages` group), with 34 and 43 for comparison.
- **The recording** `languages-transitions.mp4`: sequence 16, marked 3.22–22.20 s, 199
  frames. I compared each frame with the one before it, and looked at each run of change.
- **Logs:** `languages-languages.txt` and `languages-record.txt`.
- **The data checks:**
  - `python3 -I tools/learn.py --check data` passes ("vocab.bin: Greek 138088 words, 5337
    numbers; Hebrew 301206 words, 8539 numbers; letters.txt 32 Greek, 57 Hebrew").
  - It is in `make bible-test`'s data checks.
  - `l8c3 test programs/bible/test_learn.l8` gives 11 tests, all passing (run from the
    repository's root, as the Makefile does).
- **The code:** `learn.l8`, the card table and `sched_would` in `memory.l8`,
  `ios_cards.l8`, and parts of `ios_learn.l8`, `ios_study.l8` and `lang.l8`.
- **The builder's notes,** §14.10a (15 deviations, and the data notes).

The run's one red job (store+memory) is Round 9's reminder-switch step ("demo no memory
switch"), fixed in d2bdf16d. It isn't Round 10's.

## A. The build

The round is faithful to §14 and to the owner's approvals. What you know changes what you
see, without moving anything. Every figure shown is the data's own. **No Blocker and no
Major: approved**, with the Minors below.

**The data and the model:**
- `vocab.bin` matches §14.0.3. The builder's notes account for the small differences, and
  my throwaway count was the less careful one:
  - 643 verses readable at 300 words, not 651;
  - 7,941 New Testament verses with words;
  - a few equal-count words in a different order.
- The Greek total leaves out 43 Aramaic-tagged words, which is how 138,088 comes out.
- **Known** is §14.1.3 exactly (`word_known`, `learn.l8:541`):
  - a word is known through its card, or as a name once the alphabet is known, or when it
    has no Strong's number;
  - Hebrew also needs each joined part's card known;
  - Aramaic is never known.
- **Coverage** is the known lemmas' occurrences over the language's total, rounded down,
  with names never counted (`learn_coverage`). "In the chapters you've read" counts word
  by word.
- **Cards share §13's schedule:**
  - `sched_would` is the one rule for passages and cards: Not Yet's two boxes down, an early
    Knew It or Mostly changing nothing, and the gaps.
  - Mark as Known gives box 4, due in 7–14 days, spread by key.
- **`cards.tsv`** is written whole. Malformed lines, unknown kinds and keys, and a key's
  second line are skipped. A review card needs a box and a due date. A new card with none
  is due today.
- **`letters.txt`:** `learn.py --check` proves every example is that lemma's form in that
  verse.

**The shots against §14.9.2:**
- **240 and 241:** "Learn Greek" under the tiles. The page's sentence comes from
  `vocab.bin`: "138,088 words … 4,775 … 120 most common make up 67%".
- **242:** the Alphabet, each example with its letter in accent, and Learn 8 Letters and I
  Know These in the toolbar.
- **243–245:** a new letter shown with its answer; then hidden, its space kept; then the
  judgement row with nothing tinted.
- **246 and 247:**
  - Add Words offers "John 3 · 153 words to learn" and "Philippians 4:6–7 (memorizing)".
  - The preview reads "These 10 words make up 37% of the New Testament".
- **248 and 249:**
  - ὁ new, in Philippians 4:7, with ἡ in semibold and "the" in the BSB's verse (note 15).
  - λέγω in John 1:29, with no transliteration and the answer's space empty.
- **250:** "You know 120 words. They make up 67% … this month, you know 79% of the words";
  Practice "14 to review"; Verses You Can Read "102".
- **251 and 252:**
  - English is hidden under the known words. It's shown under ὥστε and μονογενῆ.
  - There's no transliteration, and the tiles are in 240's places.
  - A tap shows "loved" with its accent underline, and its transliteration.
- **253:** Forms "43 forms" and Your Words "Known · next review 2 November".
- **254 and 255:**
  - ἀγαπάω's grids with counts, "—" where the Bible has no form, and the right forms
    (ἀγαπᾷ as subjunctive too).
  - The concordance by form: "ἠγάπησεν · aorist active indicative 3rd singular — 12 times".
- **256a and 256:** the three choices with their descriptions and footer; then the Sound
  column in Koine (β "v", δ "th as in this", η "e as in they").
- **257 and 258:**
  - "From What You've Read" (John 1:10, 1:44 …), then Elsewhere.
  - Names count as known (John 1:44's Φίλιππος, Βηθσαϊδά).
  - The verse opens with every English line hidden.
- **259 and 260:** Today's "Greek Words · 14 to review"; Languages "120 words · 67% of the
  New Testament"; and a passage's "Greek Words · 12 to learn".
- **261:** Hebrew's vowels on bet, with clean points.
- **263:** exactly §14.9.2's expectation. English is hidden under לְדָוִד, יְהוָה, רֹעִי and
  לֹא, and shown under מִזְמוֹר and אֶחְסָר, right to left in 43's places.
- **264:** אָמַר's Qal Perfect by person.
- **265:** "Hebrew 300 words · 64% of the Old Testament".
- **266:** a Night card.
- **267 and 268:** the large sizes stacked, with the Forms columns labelled.
- **269:** Practise Reading, Μηδὲν / *Mēden*.

**Sequence 16:**
- Each tile's English fades in over 8–10 frames (7.04 s, 7.84 s), and no tile moves.
- English Order and back are cross-fades. The verse change is a cross-fade of the two
  verses (9.48–9.63 s), and the new verse starts hidden.
- The card's Check fades the answer into its kept space (10.40–10.93 s), and the judgement
  row comes in.
- See Minor 5 for what's missing at its end.

**Calm:** no streak, score, badge, chart or praise anywhere. Coverage is one sentence.

### Required changes (Minor)
1. **[Minor] Cards' second showings break the Not Yet rules** (`ios_cards.l8:158–162`,
   `:591–602`).
   - A new card's return for its first judgement is marked `px_back`, like a Not Yet's
     retry. So a new card judged Not Yet at that return doesn't come back at the end of the
     session.
   - Meanwhile a Not Yet card's retry grades again (`learn_grade`), so Not Yet twice drops
     four boxes. That's the case review r9-1 Minor 12 ruled on for passages: the retry
     changes nothing.
   - Fix:
     - Tell the two kinds of return apart. A new card's return grades normally, and
       queues the card once more on Not Yet.
     - A Not Yet retry grades nothing, and logs "again, nothing changed" (as
       `memory_grade_again`).
   - Add a test of each.
2. **[Minor] The one-time line on a letter card asks for a meaning** (243).
   - "Say what it means, then Check." fits a word, not a letter.
   - Letter cards: "Say its name and sound, then Check." Joined words may keep the word's
     line.
3. **[Minor] The וְ card's example is a consecutive waw** (262).
   - The card's glyph is the conjunction וְ, and its example is Genesis 1:3's וַיֹּאמֶר.
     That's the consecutive form, with patach and a doubled letter after it, which a
     learner should meet as its own thing.
   - Choose an example with וְ (Genesis 1:2's וְהָאָרֶץ).
4. **[Minor] STEP's gloss shows its colon form** (261's "son: child"). The same happens
   wherever such a lemma's gloss is shown: "land: country/planet", "house: home".
   - STEP writes "gloss: sense" for a word whose sense was split.
   - On the Alphabet, cards and word lists, show the part before the colon ("son"). Keep
     the whole on the word study's Meaning row.
5. **[Minor] Sequence 16 ends with the judgement row still up.** §14.9.2 asks for the row
   "in and out". Grade in the recording, and leave 1.5 s of rest after it.

### Not changes
- **Tapped tiles stay shown after English Order and back** (sequence 16 at 7.84 s). That's
  §14.5.1's rule ("what's shown stays shown while the verse is on screen"). The sequence's
  "(hiding restored)" in §14.9.2 was mine and was wrong. A new verse starts hidden, as it
  does.
- **The Koine column's η.** §14.3.3 and §14.4.1 disagreed. The builder followed §14.4.1 with
  a reason (note 3). Accepted.

### Deviations (§14.10a): decisions
1. Joined words learned from the Alphabet page's own section, not counting toward "the
   alphabet is known": **accepted.** §14.3 gave them no screen.
2. `letters.txt`'s bracketed letter and section lines: **accepted**, and checked by the tool.
3. Koine η "e as in they": **accepted** (above).
4. The counter counts items once: **accepted** (as Round 9's).
5. A new card's first showing counts as a showing, so its judgement comes in a new verse:
   **accepted.**
6. Hebrew nouns' Forms in one column: **accepted.**
7. 256 split into 256a and 256: **accepted.**
8. Memory with no passages lists its sections in that order: **accepted.**
9. `cards.tsv` read at launch only if present, with the data it needs: **accepted.** Launch
   with no cards reads nothing more.
10. Empty toolbars rather than hidden ones: **accepted.**
11. Practise Reading's words from the 500 commonest lemmas, with no joined word: **accepted.**
12. The interlinear's state put back when one pushed over it is popped: **accepted.**
13. No Forms for names or uninflected words: **accepted.**
14. The group's place on the versions job's Mac: **accepted.**
15. ὁ's first verse Philippians 4:7 (4:6's ὁ isn't translated): **accepted.**
- **The data notes** (643, 7,941, the ranks, `vocab.bin` at 111 KB): **accepted.** §14.0.3
  stands as a design estimate. The tool's print is the authority.

## B. Needs a real phone (the owner)
- **Install the Greek and Hebrew voices** (Settings › Accessibility › Spoken Content ›
  Voices):
  - the letters' names and examples;
  - Practise Reading;
  - whether the modern Greek voice helps or confuses beside the Erasmian table, in each
    pronunciation;
  - whether Hebrew is read well from its points.
- **A week of the Greek alphabet and the first 30 words, then John 1:1–5** in Greek Order
  with Hide What I Know. Say whether reading the original this way works, and whether
  anything feels like a game.
- **VoiceOver** in Greek and Hebrew (cards, tiles, Forms); Show Meaning on a hidden tile.
- **Your Words:** the row menu's Mark as Known and Delete, and swipe to delete.
- **Forms:** whether the columns line up under Singular and Plural on your phone's width.
- **The reminder:** on a day with cards due, its text ends "… and 14 Greek words".
