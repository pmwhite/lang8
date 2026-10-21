# Round 2 review 1: checkpoint 3ff255fe, CI run 39085199527 (TestFlight build 3)

I reviewed the new shots (32–35, 37, 38, 40, 42–45, 52, 53) and re-checked the Round 1 shots
on the new text. The coordinator's flicker fix (a4a8b574) isn't in this shot set. I judged
it from its description, and it's accepted in principle (see C1).

The language tools are a strong start:
- Greek and Hebrew render beautifully, with clean pointing (42–45).
- Right-to-left Hebrew order is correct (43).
- The word study header and rows are right (35, 42, 45).
- The concordance's emphasis and side index are right (38).
- The STEP credit is present and linked (37, 52).

The required work is the deferred §7 items, plus a handful of fixes.

DESIGN.md changes made with this review:
- A new principle 6, **"Nothing changes abruptly"**.
- A **Transitions** screen-recording section before §6.
- §7.10a **amendments**: what's accepted, what's cut, references in app style, and Hebrew
  outline definitions.

Severity levels:
- **Blocker**: must be fixed before the next TestFlight build.
- **Major**: required for Round 2 approval.
- **Minor**: required, but small.

## A. Fixes to the checkpoint (ranked)
1. **[Blocker] No back capsule after a concordance jump.** Screenshot: 40.
   - Every jump pushes history and shows the capsule (§3.1.6). A jump from inside a sheet
     stack is no exception.
   - Show the capsule after the dismissal finishes. Present it from `viewDidAppear:` of the
     reader, or from the dismissal's transition-coordinator hook through a delegate, not
     when the jump is requested.
   - The origin is the place before the sheet opened (John 3:16 here).

2. **[Blocker] The data must not be zero-filled at launch** (builder's caveat).
   - What's wrong: allocating and filling about 15 MB at launch costs launch time and
     memory for every reader who never studies.
   - What it should be (§7.1): load or `mmap` the `data/lang/` files **on first use** of
     Study, and never at launch.
   - Acceptance: the launch-to-"bible: up" time in `console.txt` is within 5% of Round 1's.
     Print both numbers in the commit message.

3. **[Major] References in definitions use STEP's abbreviations.** Screenshots: 35, 37.
   - What's wrong: they read "Rom.8:37", "Jhn.3:35", "1Jn.2:15", "Mat.5:43".
   - What it should be: the app's style ("Rom 8:37", "John 3:35", "1 John 2:15", "Matt
     5:43"), using the alias table's short names. Ranges and lists as STEP gives them
     ("Mat.5:43, 44") become "Matt 5:43–44" (an en dash for a range, and a comma kept for a
     list). See §7.10a.

4. **[Major] Hebrew definitions run together.** Screenshots: 42, 45 (preview), and the
   Hebrew Definition screen (not shot).
   - What's wrong: "1) to pasture, tend, graze, feed 1a) (Qal) 1a1) to tend…" is one
     run-on paragraph.
   - What it should be: §7.10a's outline rendering:
     - One sense per line, indented 1.2 em per level, with faint labels.
     - The stem labels "(Qal)", "(Niphal)" and so on in italic.
     - The preview shows the top-level senses only, joined with " · ", e.g. "to pasture,
       tend, graze, feed · to associate with · to be a special friend".
   - Add a demo step and a screenshot of the Hebrew Definition screen, for H7462:
     `42b-definition-hebrew`.

5. **[Major] Grammar for a word with a suffix reads as one list.** Screenshot: 42.
   - What's wrong: "Verb · Qal · participle · masculine singular · construct · 1st person
     common singular" buries the suffix ("my") inside the word's parsing.
   - What it should be: parts are separated by " + " and the suffix is named: "Verb · Qal ·
     participle · masculine singular construct **+ suffix** 1st person common singular". The
     Grammar screen (B2) shows Prefix, Word and Suffix sections.

6. **[Minor] The interlinear's verse number is set wrongly.** Screenshots: 33, 43, 44.
   - What's wrong: "16For God" and "1A Psalm" have the number at text baseline, in a
     different font, touching the word.
   - What it should be: exactly the reader's verse-number style: raised 0.36 em, at 0.58 em
     semibold faint, followed by a narrow no-break space.

7. **[Minor] Acknowledgements shows build 1.** Screenshot: 52.
   - What's wrong: it reads "Smooth Bible 1.0 (1)" on what is TestFlight build 3.
   - What it should be: read `CFBundleVersion` from `[NSBundle mainBundle]
     infoDictionary` at run time. If CI writes the build number into Info.plist after
     compiling, make sure the bundle's own plist is the one read.

8. **[Minor] Interlinear tiles must never truncate** (§7.10a).
   - A chunk too wide for a column spans two columns, or the full row.
   - Add a demo shot of a verse with long chunks, Psalm 23:2 in English order
     (`43b-interlinear-long`), to prove it.

## B. Deferred §7 items: still required for Round 2 (ranked)
Ranked by the owner's priorities (notes first), then by the gesture model:
1. **[Major] Notes read mode with live references** (§7.9, demo 46, 47).
2. **[Major] Study from the long-press menu** (§7.2, demo 41, 42).
   - The menu reads Study, Highlight, Note, then the system items.
   - This depends on the Round 1 item 8 device confirmation. If the owner reports that
     the delegate path doesn't fire, the `UIMenuController` fallback must carry Study
     too.
3. **[Major] Add to Note** (§7.5.2, demo 48).
4. **[Major] Library search and sort** (§7.9, demo 49–51).
5. **[Major] The Grammar explainer screen**, with `grammar.txt` (§7.5.3, demo 36). The
   Grammar row gets its disclosure indicator.
6. **[Minor] The concordance filter field** (§7.7, demo 39 for the rendering filter, plus a
   new `39b-concordance-filter` with "neighbor" typed).

**Cut from Round 2** (DESIGN.md §7.10a): the All Renderings screen, the concordance scope
bar, and demo step 54.

**Accepted builder deviations:**
- Column-grid tiles, conditional on A8.
- Supplied words inside the neighbour's tile.
- Step 54 is impossible.

## C. Owner feedback and the new "nothing abrupt" rule
1. **The bar's transparency flicker** (owner item 1). The coordinator's a4a8b574 approach is
   accepted:
   - The bar is always clear over the page-colored backdrop on every iOS version.
   - The backdrop fades only with the bars.
   - The gradient's implicit actions are disabled.
   - Verify it in the transitions recording (sequences 1 and 2): no frame-to-frame jump in
     the bar region, except the deliberate fade on hide and show.
2. **The search field's x button appears late and the scope bar flickers** (owner item 2).
   The approach is accepted: first responder in `viewWillAppear:`, scopes always shown,
   and no automatic Cancel button.
   - The search sheet keeps **Done** (nav bar, right) as its only dismissal. The keyboard is
     dismissed by scrolling the results (`keyboardDismissMode = onDrag`, which is
     system-animated).
   - When the field is restored with the previous query, set the text before
     presentation, so that the clear button is present in the very first frame.
   - Verify it in the recording (sequence 3).
3. **[Major] Add the transitions recording to CI** (DESIGN.md, "Transitions", before §6).
   Without it, principle 6 can't be reviewed. Push `transitions-sheet.png` and the frames
   with the screenshots.
4. **[Major] Audit everything against principle 6** and fix any abrupt change found. Known
   places to check:
   - The title fade when scrolling stops.
   - The verse tray's appearance.
   - The library's segment switch: reload sections with
     `reloadSections:withRowAnimation:` and fade (`UITableViewRowAnimationFade`), not
     `reloadData`.
   - The search results replacing the recent searches: also use a fade.
   - The interlinear order switch: cross-fade the tiles with a `CATransition` fade,
     0.2 s.

   The Round 1 polish item "settle the title alpha when scrolling stops" is now
   **required** under this principle. Settle it with a 0.15 s fade.

## D. Still optional
- Library row dot alignment.
- Dark-yellow highlight luminance.
- A swatch touch-down haptic.

## Next review
Push a full run with all §7.10 steps (except 54), the new 39b, 42b and 43b, and the
transitions sheet.

## E. Added after the owner's device feedback
**R2-17. [Blocker] A Safari-style collapsing bar** (DESIGN.md §3.1.4, rewritten; evidence in
the new "Collapsing-bar evidence" section before §6).

Owner: "A small scroll suddenly causes me to lose a few lines… should be more like the
address bar in Safari." Today the bars hide all at once after 30 pt. Hiding them changes
the adjusted inset, so the text jumps.

Required:
- **Hide the reader's `UINavigationBar` permanently** and build the reader bar from real
  buttons in a top-pinned view, with a 12 pt semibold compact title.
- **Constant `contentInset.top = S + 44`**, with `contentInsetAdjustmentBehavior =
  never`. The bar overlays the text, and the offset is never changed by the bar.
- **Collapse proportionally**: 48 pt of scroll gives a full collapse (the bar loses 24 pt).
  Reveal starts after 12 pt of upward travel, then is proportional. The bar is always
  expanded at the top. It settles on lift in the last direction, with a 0.25 s
  ease-out.
- **The status bar always stays.** The buttons fade out by p = 0.5. The full title and the
  compact title cross over through an empty midpoint, and both obey the opener fade, so
  there's never a duplicate chapter name.
- **It expands** on an upward scroll, a tap on the compact band, reaching the top, opening
  any sheet, or any jump. A tap on a non-verse area toggles it. It never collapses under
  VoiceOver.
- **The resting reading state is the compact title.** It costs no lines (the Dynamic Island
  band), it orients the reader in a continuous scroll, and it avoids the layout jolt that
  hiding would cause.
- Evidence: shots 15a, 15, 15b, 15c, 16, 16b and 16c, with a **zero-pixel difference** of
  the text region between 15a and 15, and Transitions sequence 6.

This supersedes Round 1's §3.1.4, shots 15 and 15b's "no bars, no status bar" state, and
part of C1 (the backdrop now follows the bar's height continuously).

Updated count: **17 required items.**
