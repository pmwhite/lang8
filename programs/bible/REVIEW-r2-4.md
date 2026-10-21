# Round 2 review 4: commit 984231dc (data check)

I re-ran both review-r2-3 greps on `programs/bible/data/lang/lexicon.txt`. Both print 0, and
so does the two-letter sense-letter variant. The multi-word names now read correctly, e.g.
**Another spelling of** אֲרַם נַהֲרַיִם *’ăram nahărayim* “Mesopotamia” · H763. No STEP dotted
transliterations remain. Both review-r2-3 items are **fixed**.

## Required change
1. **[Minor] Cantillation marks remain in Hebrew inside definition text (328 marks).**
   - What's wrong: the lemma fields and `forms.txt` are clean, but Hebrew quoted inside
     definitions and cross-reference notes still carries accents. Most of them are 308 ole
     marks (U+05AB, ֫). Others are atnah (U+0591, 16), and one each of sof pasuq (U+05C3),
     U+059C and U+059D. For example, "**Another spelling of** אֲחִימֶ֫לֶךְ …".
   - This breaks acceptance criterion 11 (§7.11: "Hebrew has no cantillation") on the
     Definition screens.
   - What it should be: apply the same display cleanup as `forms.txt` (§7.1) to all Hebrew
     in `lexicon.txt`. Strip U+0591–U+05AF, U+05C0 and U+05C3. Keep vowel points, dagesh,
     the shin and sin dots, and maqaf. Add a line saying so to Changes to the Lexicon Data,
     if the existing cantillation line doesn't already cover definitions.
   - Check: `python3 -I -c "import re;print(len(re.findall('[֑-֯׀׃]',open('programs/bible/data/lang/lexicon.txt',encoding='utf-8').read())))"`
     must print 0.

This is a data-tool fix with no UI change. The grep is enough evidence.
