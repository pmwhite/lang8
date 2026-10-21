# Round 11 review 1: the Hebrew and Greek in the reader (§14.11, R11.0) at 1484cf8f, CI run 39605448327

I reviewed the snapshot of run 39605448327 (`ci-bible-shots` at fef119e3, trunk's first run;
the builders' green run 39597935856 at 5604476b7 has the same Round 11 code). The sources were:
- **Shots:**
  - 270–296b, with 291b, 294b, 295b, 296 and 296b (the `original` group);
  - 503b and 503c (the ipad group);
  - the languages group's shots that Round 11 changed (249b, 253, 258, 470);
  - 163, 211 and 222 for comparison.
- **The recording** `original-transitions.mp4`: sequence 17, all 124 frames (it records
  only on change), each compared with the one before.
- **Logs:** `original-original.txt`, `original-log.txt` and `original-timing.txt` (253 s).
- **The data checks:** `orig.py`, `ubs.py`, `learn.py` and `senses.py --check` all pass:
  - 31,086 verses and 443,372 words;
  - 1,309 Qere, each with its Ketiv;
  - 99.84% joined to `words.bin`;
  - meanings for 91.6% of the Greek and 86.3% of the Hebrew.
- **My own count over `meanings.bin`:** a throwaway script in `~/work-r11review`. It finds
  Major 1.
- **The tests:** `l8c3 test` on `test_lang.l8`, `test_text.l8`, `test_learn.l8` and
  `test_memory.l8` gives 72 tests, all passing.
- **The code:**
  - `orig.l8`: what is glossed, the gloss, the search;
  - `ios_orig.l8`: Glosses, the popover, the letter keyboard;
  - `text.l8`'s apparatus;
  - `tools/ubs.py`'s `clean` and `check`;
  - the toast;
  - the card's meaning;
  - the acknowledgements and the bundled `meanings-LICENSE.txt`.
- **The builders' notes,** §14.11.11 (deviations 1–36). I read them against §15.11 (no tips
  anywhere: none in Round 11's text) and §16.13 (296's day reader has the one Mark Read).

## A. The build

This is the round the language work was for, and most of it is right:
- the Leningrad Codex and NA28 set as a reader's edition;
- Hebrew right to left with clean points;
- the Qere's ° and its Ketiv;
- the Hebrew's own numbers;
- glosses only for what you haven't learned, and a learned word dropping out at once;
- every reader feature working in it.

The calm is kept: one faint dotted line, one faint line of glosses, nothing that counts or
praises. Three things are wrong underneath it:
- a share of UBS's meanings are given to the wrong words (Major 1);
- Latin-letter search finds one form of a word, not the word (Major 2);
- Memorize's toast has gone since the toast moved (Major 3).

**Three Majors and eight Minors: approve with fixes.**

**The text and the data:**
- `orig.py --check` prints exactly §14.11.1's tests:
  - John 3:16 has 25 words, the 3rd ἠγάπησεν G25 `V-AIA-3S`;
  - Genesis 1:1's בְּרֵאשִׁית has `Prep-b`;
  - Psalm 23's title is a `D` record;
  - Malachi 4:1 is Hebrew 3:19;
  - Daniel 2:4 runs `H` then `X`.
- Sof pasuq follows its word with no space in `orig.txt` (the gap in 276 is SF Hebrew's side
  bearing).
- `meanings-LICENSE.txt` says what was changed and that the two files are CC BY-SA. It is in
  the app's resources.

**The shots against §14.11.9:**
- **270:** Original Languages with its one row and secondary line.
- **271 and 272:** John 1 glossed by words you haven't learned, then by rare words. The
  apparatus is faint and after each paragraph, and a lemma glossed twice is listed once.
- **273–275:**
  - the popover from μονογενοῦς, with the verse, the form, the transliteration, the gloss,
    UBS's meaning and subdomain, and the parsing;
  - Learn This Word turning into "Learning · in your next practice", with the toast;
  - John 3 afterwards with μονογενῆ and μονογενοῦς no longer glossed.
  - The log agrees: "learn card G3439 knew …", then "orig relaid after cards changed", then
    John 1 going from 144 glossed to 142.
- **276–278:** Genesis 1 and Psalm 23 right to left, with the verse numbers at the right; the
  title and poetry by verse; Show Accents.
- **279–281:** Genesis 27:3's צָיִד with "Read as shown (Qere); written צֵידָה (Ketiv)";
  "Malachi 4:1 · Hebrew 3:19"; Daniel 2 glossed throughout, with the Qere's ° visible after
  לְעַבְדָךְ.
- **282 and 283:** Version, Glosses and Show Accents together. Listen is the disabled "No
  recording of the original yet." (§14.10b.1).
- **285–287:**
  - Letters in Hebrew, right to left, the key letters with their points;
  - the Israeli and Greek layouts in §14.11.5's order;
  - Listen and Echo greyed.
- **288 and 289:**
  - the search results, Greek with the app's match style;
  - Hebrew matches semibold only, which reads clearly at this size (ruling below).
- **290:** the Hebrew and Greek first, as the version read.
- **291 and 291b:** the Hebrew share card set at the right, its English reference under it.
- **292 and 293:** Night is legible, glosses included. At the largest size the apparatus
  scales (but see Minor 4).
- **294 and 294b:** Read in Greek, "John 3, where you are", opening John 3.
- **295:** the BSB's highlight on John 3:16 in Greek.
- **296 and 296b:** M'Cheyne's day 1 in the day reader, with Genesis 1's end and Matthew 1
  each glossed, and a popover there.
- **503b and 503c:** the iPad with Study beside the Greek, and a popover pointing at ὥστε's
  entry. The column and panel are as §17 has them.
- **Changed elsewhere (deviations 23 and 24):**
  - 253 and 470: the Meaning row's "Here: … · Love, Affection, Compassion";
  - 249b: the card's meaning (Minor 8);
  - 258: Verses You Can Read opening John 1:10 in the reader with "‹ John 3".

**Sequence 17** (0–22.5 s):
- BSB → Hebrew and Greek is a cross-fade over 4.61–4.79 s, with John 3:16 still selected.
- The scroll into John 4 comes as two whole-screen changes, because the demo moves the offset
  and the recorder writes frames only on change.
- The popover fades in. Learn This Word becomes the card's line. "Added to Greek Words"
  stands over the popover, and the popover fades away.
- There's rest at the end.

**Calm:**
- There is no count of glossed words, no badge, and no progress.
- The Glosses footer is plain.
- The disabled Listen row says what is missing and nothing more.

### Required changes
1. **[Major] About 4,200 Hebrew words (and about 220 Greek) have another word's meaning.**
   - Over `meanings.bin` I compared each word's Strong's number with the numbers its meaning's
     entry lists in `meanings.txt`'s last field.
   - The disagreements of the known kinds are fine: STEP's and UBS's numbering of one lemma,
     such as G1473/G2257 (2,173), G4771/G4675 and H582/H376.
   - Pairs seen fewer than five times are another thing: 4,198 Hebrew words in 3,455 pairs,
     and 218 Greek. They are shifts, where one place miscounted moves every meaning after it
     by a word:
     - **Genesis 1:7:**
       - אֲשֶׁר (H834) gets "water";
       - עַל (H5921) gets "that; which";
       - הָיָה (H1961) gets "firmament";
       - the second מַיִם and רָקִיעַ get none.
     - **Ezekiel 37:23:** עַם (H5971) gets "I".
     - **Jeremiah 51:64:** דִּבְרֵי (H1697) gets "Jeremiah".
     - **1 Kings 2:7:** פְּנֵי (H6440) gets "Absalom".
     - **Genesis 1:12:** וַיַּרְא (H7200) gets "God".
   - These show as fact in the popover, in the word study's "Here:" line, on cards, and in In
     the Same Domain.
   - The cause is deviation 8's "or when most of the verse's numbers agree", which lets a
     shifted place through.
   - **Fix:**
     - In `ubs.py`, take a place's meaning only when the entry lists the word's number, or
       when the two numbers are a known variant of one lemma. Known variants are the pairs
       that also agree by place where the verse's places line up (the long tail above
       doesn't).
     - Otherwise, go by number in order, as now.
     - A word with neither has no meaning. That's better than a wrong one.
   - **Check (`ubs.py --check`):**
     - Print the count of meanings whose entry doesn't list the word's number, outside the
       variant pairs. Fail above a small figure (say 0.2%), listing the worst verses.
     - Show Genesis 1:7's אֲשֶׁר ("that; which") and הָיָה, and Ezekiel 37:23's עַם
       ("people").
2. **[Major] Search by a word finds one of its forms** (288; `orig.l8:600–624`; `test_learn.l8`
   "the original searched").
   - §14.11.7 asks that "agape" find ἀγάπη, ἀγάπην, ἀγάπης …. The manual promises the same:
     "the word in Latin letters as it sounds ('agape', 'shalom')", `help.txt:40`.
   - Matching is on each form's whole transliteration, so the tests' own figures show what a
     reader gets:
     - "agape" finds 56 verses (the nominative and dative only; the noun occurs 116 times);
     - "theos" finds 287 (θεός occurs about 1,300 times);
     - "chesed" finds 65 (חֶסֶד occurs about 245 times);
     - "shalom" finds 103 while "שלום" finds 120. The two disagree, and neither finds בְּשָׁלוֹם,
       לְשָׁלוֹם or Genesis 29:6's הֲשָׁלוֹם.
   - **Fix:** a query word also matches every word whose lemma it names:
     - Latin letters against the lemma's transliteration, folded as now;
     - Greek or Hebrew letters against the lemma's letters, folded.
     - So "agape", "ἀγάπη" and "αγαπη" find every form of ἀγάπη, and "shalom" and "שלום" every
       שָׁלוֹם, prefixed or not.
     - A form typed that is not a lemma ("agapen") still finds that form, and `*` and quotes
       work as now. The words matched are semibold as now.
   - **Tests:**
     - "agape" finds every verse with the noun, John 13:35's ἀγάπην among them;
     - "shalom" and "שלום" give the same count, Psalm 4:8's בְּשָׁלוֹם among them;
     - "theos" finds John 1:1 (θεόν, θεός).
   - The first-letter skip (note 28) works the same on lemmas. Time it, and log it in the
     search's line (Minor 10).
3. **[Major] Memorize's toast no longer shows** (284, and the memory group's 211).
   - Both logs say "toast Added to Memory".
   - Review r9-1 saw 211's toast, and 163 (a ribbon's) and 274 (Learn This Word's) still
     show theirs.
   - Both missing toasts come from the tray's Memorize. It clears the selection, then calls
     `toast_symbol` (`ios_memory.l8:320–327`).
   - Since note 31, `toast_image` (`ios_select.l8:681–690`) adds the label to "the window of
     the view controller on top". With the tray going away at that moment, that's the likely
     cause.
   - **Fix:** add the toast to the window of a controller that is staying. Take
     `top_presented()` only when it isn't being dismissed (`isBeingDismissed`), else the app's
     window.
   - **Check:** 211 and 284 show "Added to Memory".
4. **[Minor] Apparatus entries break between the word and its gloss, and lines begin with
   "·"** (271's "κατέλαβεν / overcome"; 275's "· ὕψωσεν"; 293 at the largest size; 503b).
   - In `text.l8:1250–1259`, put a no-break space (U+00A0) between the form and its gloss, and
     before each separator's "·", so the dot ends a line and the next entry starts one.
   - A long gloss may still wrap within itself.
5. **[Minor] A gloss can carry a neighbour's English** (275 and 294b: "ἀπόληται shall not
   perish"; 503b's interlinear shows μὴ "(with next)").
   - The BSB's tables render μὴ ἀπόληται together, and the gloss takes the whole chunk, so it
     teaches that ἀπόληται has "not" in it.
   - The tables join 3,276 Greek and 1,573 Hebrew words this way (`words.bin`'s flag 2).
   - **Fix:** when the glossed word's English is shared with a neighbour (its neighbour has
     "with next" or "with previous"), the entry shows both forms as in the text: "μὴ ἀπόληται
     shall not perish". The popover's form does the same.
   - Other mismatches come from the BSB's word order, such as Psalm 23:2's "דֶּשֶׁא in green"
     and Matthew 1:1's "Βίβλος this is the record". They are the tables' own, and stay.
6. **[Minor] The gloss's capital is lowered where it shouldn't be** (`orig.l8:236–257`).
   - Examples:
     - 281 and the test's expectation have "מַלְכָּא o king";
     - "I am", "I will" become "i am", "i will" (`keeps_capital` keeps "I" only alone or
       before an apostrophe);
     - Psalm 23 reads "he makes me lie down" beside "He leads me" (277).
   - **Rule (as deviation 5's for Forms):** lower a sentence's first letter only when the BSB
     writes that word lower case elsewhere in the chapter. Never lower "I", "O", or a word in
     capitals throughout (LORD, GOD).
   - Fix the test's "o king".
7. **[Minor] UBS's "≈" is shown as is** (1,314 Hebrew definitions, such as Psalm 23:1's
   shepherd, "… for grass … in the field, ≈ often extended to denote …").
   - In `clean`, write SDBH's ≈ as "; " ("…; often extended to denote …").
   - `ubs.py --check` fails on any "≈", "{" or "}" left in `meanings.txt` (the markup check
     the tool doesn't yet make).
8. **[Minor] The card's meaning is set as large and dark as the answer** (249b,
   `ios_cards.l8:370–379`).
   - "to speak or talk, with apparent focus upon the content of what is said · Speak, Talk"
     is 17 pt in ink, between "said" and the verse, so it competes with both.
   - Set it as the word study does: "Here:" and the definition, in the meta line's color, at
     15 pt scaled. The BSB's word stays the answer.
9. **[Minor] The word's popover doesn't follow the text size** (`ios_orig.l8:380–420`).
   - Its sizes are fixed (gloss 19 pt, meaning 14, parsing 13). The footnote popover scales
     with the reader (0.88 em, 15–22 pt, `ios.l8:1524–1528`), so at 293's size the popover
     would be the smallest text on the screen.
   - Use the footnote's rule for the gloss, and the same ratio for the smaller lines. Keep
     the form's hero size.
10. **[Minor] The shots and logs:**
    - 295b's verse 2, the selection right to left that note 35 adds it for, is under the
      tray. Go to Psalm 23:1 with the verses mid-screen, so verse 2 is above the tray.
    - 284 has neither selection nor toast (Major 3).
    - "bible: orig search found, ms 5600555" packs two numbers into one (56 verses, 555 ms,
      `ios_sheets.l8:1029`). Write "orig search found 56 verses, 555 ms".
    - The log has one "Attempt to present <L8Sheet> … whose view is not in the window
      hierarchy" at 13:20:47 (the steps around 603–604). Say which step it is, and keep it
      out of the app if it isn't the demo's.
11. **[Minor] The acknowledgement for UBS lacks the licence's link and the change**
    (`ios_study.l8:2412`).
    - CC BY-SA asks for the licence's address where practicable and a note of changes.
    - Add "CC BY-SA 4.0 (creativecommons.org/licenses/by-sa/4.0); the dictionaries'
      meanings given to each word by Smooth Bible" and the source's address, as
      `meanings-LICENSE.txt` already says.
    - Give STEP's CC BY 4.0 row the licence's address too.

### The two rulings
- **"LN 25.43" references: drop them.**
  - A reader of this app has no Louw–Nida volume, and nothing in the app follows the number.
  - In a popover or a card it is a scholar's apparatus inside a plain definition. In the Same
    Domain already gives the domain in words.
  - In `clean`:
    - drop ", LN n.n" after a quoted gloss: "(derivative of ἀγαπάω 'to love')";
    - drop parenthesised references ("(LN 61.7)", "(see LN 11.67 and LN 11.68)");
    - drop clauses that are only a reference ("; see LN 93.32", "compare LN …").
  - `ubs.py --check` fails on any "LN " left (1,033 lines have one now). Change the licence
    file's line about it.
  - Take it off the real-phone list.
- **Hebrew search matches: semibold alone is enough.** Keep it, and draw no background.
  - At 1.15 em, SF Hebrew's semibold is plainly heavier (289).
  - A background drawn in pieces round the points was worse than none.
  - Greek keeps the app's match style, as English does: there it draws whole.
  - Night is for the phone list.

### Not changes
- **The red glow under the letter keyboard's Return** (286, 287) is Practice's Next button
  through the keyboard's glass. The system keyboard shows the same (222). Not this round's.
- **"Many, Few [Countables]" and "[Ordinals]"** are Louw–Nida's own subdomain names. They stay.
- **The BSB-order glosses** (Minor 5's last point) stay as the tables give them.

### Deviations (§14.11.11): decisions
1. The Greek as TAGNT's NA28 word lines with their punctuation, checked in order:
   **accepted.**
2. LXX-restored words and Ketiv without Qere left out: **accepted.**
3. Sof pasuq kept: **accepted.**
4. Aramaic as `X` records, the Hebrew numbers as `N` records: **accepted.**
5. Each word's length in `orig-words.bin`'s spare u16: **accepted.**
6. A joined word takes the tables' number and parsing, the rest STEP's: **accepted.**
7. Petuha and setuma also break paragraphs: **accepted.**
8. UBS's places mapped by place, then number: **accepted as a method.** "Most of the verse's
   numbers agree" must go (Major 1).
9. `fetch.sh` failing on eBible.org's and OpenBible's republished zips: **accepted for this
   round.** Re-pin those sums (or pin dated copies) before any round that rebuilds those
   texts.
10. Glosses and Show Accents under Version: **accepted.**
11. A gloss lowered only at a sentence's start: **accepted, with Minor 6.**
12. The apparatus a left-to-right line in Hebrew chapters, Hebrew forms isolated:
    **accepted.**
13. The dotted line at 0.32 (0.4 dark), painted after washes: **accepted.**
14. `og_wanted`'s rules: **accepted.**
15. The popover's contents and Word Study's route: **accepted, with Minor 9.**
16. Listen disabled with "No recording of the original yet.": **accepted** (§14.10b.1).
17. The letter keyboard as a `UIInputView`: **accepted.**
18. Practice's key letters as written, maqaf words as two: **accepted.**
19. Latin folding: **accepted.** The matching is Major 2.
20. Compare's order, Copy as shown, Share's fonts: **accepted.**
21. "Psalm 23 · Hebrew" where a passage is named, "Hebrew and Greek" where the version is:
    **accepted.**
22. Read in Greek after Verses You Can Read, by the first ribbon in that testament:
    **accepted.**
23. Verses You Can Read opens the reader: **accepted.**
24. R11.0 in Study and cards: **accepted, with Minor 8.**
25. The apparatus read as written, the transliteration as the form's hint: **accepted for
    now.** VoiceOver without the voices is on the phone list.
26. 282 and 283 as Reading settings, 294 split: **accepted.**
27. A Qere's popover without a transliteration: **accepted.**
28. The first Latin search slow on CI (about 0.5 s): **accepted.** Time it again after Major 2.
29. Demo steps up to 649: **accepted.**
30. Learn This Word's place becomes the card's line: **accepted.**
31. The toast over a popover: **accepted for the popover.** The tray case is Major 3.
32. The Hebrew share card set at the right: **accepted.**
33. Hebrew matches semibold only: **accepted** (ruling above).
34. 270 scrolled to Original Languages: **accepted.**
35. Shots 295b, 296, 296b, 503b and 503c: **accepted, with Minor 10's retake of 295b.**
36. UBS's markup made plain: **accepted, with the LN ruling and Minor 7.**

## B. Needs a real phone (the owner)
- **The Hebrew at every text size and in every theme:**
  - the points;
  - the dotted line under pointed words;
  - the apparatus at arm's length.
- **Selection, a highlight and a note's mark in a Hebrew verse:** the wash and the selection's
  line right to left.
- **The letter keyboard:**
  - its feel, its clicks, and its height beside the system's on your iPhone and on the iPad;
  - delete has no repeat;
  - with a hardware keyboard, which bypasses it: say whether Latin keys should type Greek
    and Hebrew letters by their places.
- **VoiceOver** on a Greek and a Hebrew verse, with and without those voices installed. Also
  on the apparatus and the popover (deviation 25).
- **Search by Latin letters:** its first-query time, after Major 2.
- **The Hebrew share card**, sent to someone.
- **A toast over the popover** (Learn This Word), and Memorize's toast after Major 3.
- **Hebrew search matches** semibold alone, in Night and Sepia.
- **The popover on the iPad**, by finger and by pointer.
- **A week reading John and a Psalm this way:** whether the glosses carry you, and whether
  any gloss misleads you (Minors 5 and 6; the BSB-order ones).

(The "LN 25.43" question is ruled above, and off this list.)
