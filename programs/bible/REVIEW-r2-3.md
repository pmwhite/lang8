# Round 2 review 3: commit 3ddb46bd, CI run 39094913944

I reviewed the snapshot at `/tmp/bsb/review-r2-3` (RUN.txt confirms 3ddb46bd) and grepped
`programs/bible/data/lang/lexicon.txt`.

**42b passes.** It shows "**Also means:** רֹעִי *rō·‘î* “to shepherd” · H7473", exactly as
required. The rest of the screen is unchanged and correct.

The data still has two leftovers of the same kind, so the item isn't fully closed.

## Required changes
1. **[Minor] Multi-word cross-references are still raw (51 occurrences).**
   - What's wrong: the `cross_style` pass handles one-word names only. Names of several
     words keep STEP's form, with dotted ASCII transliterations, straight quotes and
     zero-padded numbers. Examples from `lexicon.txt`:
     - `Another spelling of _a.ram na.ha.ra.yim_ (אֲרַם נַהֲרַיִם "Mesopotamia" H07…)`
     - `Also named: _me.ro.dakh bal.a.dan_ (מְרֹדַךְ בַּלְאֲדָן "Merodach-baladan" …)`
     - `Another name of _ra.mot gi.l.ad_ (רָמֹת "Ramoth" …)` and `_qir.yat ye.a.rim_`
       and `_bet ha.a.ra.vah_`
   - What it should be: the same style as the one-word case. If the forms table has no
     tables-style transliteration for a multi-word name, omit the transliteration rather
     than show STEP's.
   - Check: `grep -cE "_[a-z’'‘]+(\.[a-z’'‘]+)+( [a-z’'‘.]+)*_ \(" lexicon.txt` must
     print 0.

2. **[Minor] Strong's numbers elsewhere in definitions keep zeros and sense letters (about
   1,990 occurrences).**
   - What's wrong: the genealogy and relationship notes in name entries read like "Ehud
     (H0164H)", "Ahaz (H0271)" and "Abiud (G0010)". The cross-reference lines on the same
     screens now say "H7473", so the two styles meet on one page.
   - What it should be: every Strong's number in displayed lexicon text uses the app's
     form, with no leading zeros and no sense letter: "Ehud (H164)", "Abiud (G10)". This
     applies everywhere in definitions, not only in cross-reference notes.
   - Check: `grep -cE "\b[HG]0[0-9]{3}|\b[HG][0-9]{1,4}[A-Z]\b" lexicon.txt` must print
     0. Watch for false positives in the regex, such as Greek grammar abbreviations, and
     report what remains if anything.

## Optional
- Abbott-Smith's abbreviation "l.with" (307 occurrences, e.g. "(Ps, l.with)") is the
  source's own shorthand. It's harmless, but if it's an HTML-to-text artifact (for
  example `<i>l.</i> with`), restore the space: "l. with".

Both required items are data-tool fixes (`tools/bsb_lang.py`) with no UI change. A grep
check is enough evidence; there's no need to re-shoot unless the builder wants to.
