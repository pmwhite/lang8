# Round 10 review 2: §14.10b, written pronunciation and meaning first, at e9e240c79 (run 39500813671)

I reviewed the snapshot of run 39500813671 (`ci-bible-shots` at 83ad8ffac). The sources were:
- **Shots:** the changed 241, 242, 256a, 243–245, 248, 249, 262, 266, 267, 254, 264 and 269,
  and the new 246b and 249b.
- **The log:** `languages-languages.txt`.
- **The code:**
  - `LEARN_SPEECH` and the places behind it (`ios_learn.l8`, `ios_cards.l8`);
  - `simulate.sh`'s new guard;
  - `learn.py --check`'s "as in";
  - the card's answer, related words and renderings in `learn.l8` and `lang.l8`.
- **The tests:**
  - `python3 -I tools/learn.py --check data` passes;
  - `l8c3 test` on `test_learn.l8` and `test_help.l8` gives 20 tests, all passing. That
    includes "a session's returns (review r10-1 Minor 1)", "a word card's answer" and
    "related to words you know".
- **The builder's notes,** §14.10b.7.

## A. The build

§14.10b is built as written. Nothing speaks Greek or Hebrew, every sound is written
against an English word, and the cards now ask what a word means where it stands. **No
Blocker and no Major: approved**, with one Minor.

**Written, not spoken:**
- `LEARN_SPEECH` is false, and every place that spoke checks it. With it off,
  `ln_can_speak` and `ln_voice_of` answer at once, so no voice is even looked for.
- The log has no "learn voice" or "learn speak" line, and `simulate.sh` now fails the group
  if one appears.
- **241:** the language page has only Hide What I Know under Settings. The Speak switches
  are gone.
- **242:** the Alphabet's end has Sounds Written As, "Erasmian", with its footer. Every sound
  reads "as in": "oi as in oil", "ow as in cow", "eu as in feud", "oo as in food", "h as in
  hat, before the vowel". `learn.py --check` requires it for the Erasmian and Israeli
  columns.
- **256a:** the list, pushed from there, with its reworded footer (note 7).
- **243–245:**
  - the letter card's line is "Say its name and sound, then Check." (review r10-1 Minor 2
    done);
  - there's no speaker on any letter card.
- **269:** Practise Reading says "Read it to yourself, then Check.", and its Check shows
  *Mēden* with "transliteration, a guide to the letters". Nothing speaks.

**Meaning first:**
- **248:** ὁ's card shows "What does it mean here?" and then **the** large (the BSB's word
  in Philippians 4:7). It has the verse with "the" in bold, and the faint "ho ·
  the/this/who · 19,889 times". There's no "Here:", since ὁ has one sense.
- **249 and 249b:** λέγω in John 1:29, then **said**, "Here: to say", the verse with "said"
  in bold, the faint line, and "Related: ἀποκρίνω to answer". See Minor 1.
- **266 and 267:** ἀγαπάω's **loved** in John 3:19, in Night and at the largest size, with
  the judgement row stacked there.
- **262:** the וְ card's example is now Genesis 1:2's וְהָאָרֶץ (review r10-1 Minor 3 done),
  with "and", and "Now the earth" in bold in the verse.
- **246b:** Related to Words You Know, "254 words", in its own headerless section after Most
  Common (note 4).
- **254 and 264:**
  - Forms show what each form does: ἀγαπῶ *I love*, ἀγαπῶμεν *we love*, ἀγαπᾷ *loves*;
  - אָמַר's Qal perfect *says*, *she said*, *said*, *you said*;
  - the counts are smaller. They're computed only when Forms opens (note 5).
- **Review r10-1's other Minors are done:**
  - a new card's first judgement and a Not Yet's retry are told apart (tested);
  - STEP's colon glosses are split (note 2).

### Required change (Minor)
1. **[Minor] "Here:" repeats the gloss** (249b: "Here: to say" over the faint "legō · to say ·
   1,177 times").
   - §14.10b.2 meant "Here:" to name which of several senses this is. When its words are
     the lemma's own gloss, which the faint line already says, it adds nothing.
   - Leave "Here:" out when it equals the BSB's words in the verse (as now), **or** the
     gloss shown in the faint line.
   - It stays for a real sense ("Here: child" under בֵּן; "Here: gods" in Exodus 20:3).
   - Add the λέγω case to "a word card's answer".

### Deviations (§14.10b.7): decisions
1. "What does it mean here?" on the session's first word card, replacing the old line:
   **accepted.**
2. "Here:" from the gloss after the colon, left out when it repeats the BSB's words:
   **accepted**, with Minor 1's second case.
3. Related words of the card's own language only: **accepted.** A Hebrew neighbour on a Greek
   card would teach the wrong language.
4. Related to Words You Know as a headerless section, logged `from related`: **accepted.**
5. Renderings computed when Forms opens, lower case unless a capital mid-sentence:
   **accepted.**
6. The transliteration labelled only on Practise Reading's Check: **accepted.** That's where
   it's the thing to check against.
7. The Sounds Written As footer reworded: **accepted.**
8. Alphabet rows read "Beta: b as in bat. Example: …": **accepted.**
9. Koine and modern Greek's unaspirated κ, π, τ ("k as in skip"), and the Tiberian joined
   words' spellings, with only the Erasmian and Israeli columns checked: **accepted.**
10. 242 scrolled to the end, 249b's "said", and ἀποκρίνομαι marked known; 246b after 250:
    **accepted.**

## B. help.txt's quotes (review s15-1 Minor 1): done in this commit
- `data/help.txt`'s text now has typographic quotes and apostrophes ("“jn 3:16”",
  "you’re"). Comment lines are as they were. There are 55 lines in all, with no other change.
- `test_help.l8`'s search test expected the old text. Its six expected lines now have the
  new quotes, and the search's window is three letters shorter where a curly quote is longer
  in bytes. The search still finds "you'd" typed with a straight apostrophe, through ’ = '.
- `test_help.l8` gives 6 tests, all passing.

## C. Needs a real phone (the owner)
- Nothing in Greek or Hebrew speaks anywhere: the Alphabet, cards, Practise Reading. CI has
  no Greek or Hebrew voice, so it couldn't have spoken there.
- The written sounds: are the "as in" words clear, and does the Erasmian table read right?
- A week of cards: is "What does it mean here?", answered by the BSB's own words, the right
  question? Are the related words helpful or noise?
- Forms with renderings, at your text size.
- VoiceOver on a card after Check.
