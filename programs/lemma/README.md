# Lemma

A puzzle game made of real proofs. Each level is a theorem; the player
proves it from the ground up by playing moves from a hand, and every move
is checked by a small kernel. A solved level becomes a
tool for the levels after it, so the map of a region is the dependency
graph of its subject.

```sh
make lemma && .build/lemma [PROGRESS]   # PROGRESS: .build/lemma-progress.txt
make lemma-test                         # the engine's tests, and every level played
make lemma-web                          # the page, in .build/web/lemma (after make web)
```

Off a page the window is phone shaped (`L8_W`, `L8_H`, `L8_UI` change
it). On the page, `?fresh` starts with nothing proved, and `L8_` query
parameters are passed on.

## Playing

A level is **a goal and a hand of moves**. The screen is laid out from
the bottom: the hand, the goal (*Show*, big when there is room) pinned
just above it, the facts (*You have*, newest at the bottom) above that,
and the picture takes all the room left (in logic, a card with the
level's words and its letters as tiles: lit when you hold one as a fact,
soft when it is inside one, ringed when the goal wants it). When the
board does not fit, the picture is a strip and the facts scroll. A
fact used by a move shrinks to one small line after the next move, one
not touched for three moves to one line (two with five facts or more,
one with seven, so the goal stays in sight). One
statement is focused (outlined orange), and the hand holds its moves, each
a pudgy row that says what kind of move it is and shows **what it gives**:
the statement as it will be (the changed part tinted), a new fact (blue), or
a gold row that closes the goal, showing the goal as the move leaves it
(`c = c`, both sides gold; *by arithmetic* beside the check when
arithmetic closes it, the writing left readable). A move that gives back a
state the proof was already in (the way out of a mistake) is a soft grey
row, *Back*, after the others; the *Nothing to tidy here* line shows only
when the hand has no row at all, and only for a statement with moves at
its parts; the ‹ › nubs show only on a statement with moves at its parts
(or with the cursor on a part already); a statement with none says to
tap another. A goal that cannot be shown (off the written proof, a
comparison of whole numbers such as `N₁ ≤ n`, or any comparison a *Use
with* left as its side condition, such as `A > 0`, with no move anywhere
in it, that arithmetic does not close from the facts) is a dead end: it is
focused as soon as a move leaves it, and the hand says *Can't be shown
from what you have* over one row, *Undo k* (the hint's k), that rewinds
to where the proof went wrong in one tap (`1` or `enter` by keys).

- **Tap a statement** to focus it. With the whole of it focused, the hand
  has its own moves (*Take any ε*, *Assume it*, *Split*, *Choose …*, *Get N*,
  *Use with …*, *Apply it*, a theorem you proved) and every rewrite
  anywhere inside it that does not make it bigger (tidying, a known fact,
  opening a definition). The goal's hand also has, first, each fact that
  says something of every x (`∀x. f · x = x`, or bounded, `∀ε>0. …`) whose
  instance closes the goal, its term picked by matching: *Use the fact
  with e* (the fact's own *Use with* move, the term already in; the fact
  is still where that move is learnt: such a row does not draw the focus
  to the goal).
- **Swipe sideways** on the board (or tap the ‹ › nubs, or tap a part) to
  move the cursor through the parts of the focused statement, outside in.
  At a part, the hand has every rewrite of it, the growing ones too
  (`b` to `e · b`, `e` to `□⁻¹ · □`). Nothing on the board opens a menu.
- **Tap a row** to play it. A row that needs a term shows what it gives
  with a hole `□` where the term goes (*pick a term*): for *Use with* on a
  fact, the fact it gives (`∃N. ∀n≥N. |aₙ − A| < □`), not its side
  condition. Tapped, the hand
  becomes the terms, each a full-width row: the term on the left, the
  statement as that term makes it on the right with the term tinted
  (gold, with a check, if it closes the goal). Terms that close the goal
  come first, then those that leave nothing new open, then the rest; the
  level's names, a region's own (e), and the parts of the board are
  offered. Among equals the name just taken (an `n` with `n ≥ max(N, N₁)`)
  comes first, and when it fits best it shows alone. A kit is never filled
  with such a name (no `max(n, N)`), and a two-hole kit filled the other
  way round (`max(N₁, N)`) is offered once. Three show, then *More
  terms*; a term the kernel will not take is not offered. A term for a
  fact's *Use with* whose side condition arithmetic cannot close from the
  facts (`A` for `∀ε>0. …` needs `A > 0`) goes last, under *More terms*,
  dimmed, with what it needs (*needs A > 0*) in red; so by default only the
  terms that work show.
- Three rows show, then *More moves*: under it go the rest, and *Suppose
  not* and *Flip sides* (unless the level's written proof uses them). When
  no row shows (*Nothing to tidy here*), the button says *Other ideas*.
- **Undo** (top right) takes back the last move. The **bulb** shows the
  written proof's next move (the row glows, a ghost finger points), or, off
  its path, how many undos get back on it (that word and the undo
  button's pulse go at the next move or undo); held, it plays the whole proof
  (Watch), then says *Your turn* and starts the level afresh (watching
  does not solve it).

A level starts with the goal focused if it has moves, or if its written
proof starts by putting something into the goal (Only one e, Cancel on
the left); else the first fact with moves.
After a move the focus goes to what it made (a new fact with moves, or the
changed goal). A new fact flies from its row to its card, and the changed
part of a rewritten goal flies to the block it becomes, each carrying its
writing. Goals that are something known, both sides the same, or (where
the region has it) arithmetic close by themselves, staged: the goal card
first morphs to what the move made of it (`e · c = c` to `c = c`); a new
fact drops in, pulses, and a copy of it flies into the goal; then the card
flashes gold and, its writing shrinking with it, flies into its pip at the
top. A Split whose parts are both known is staged as two goals: the card
divides in two, a second pip pops in, and each part closes in turn. A
side condition arithmetic closes as the move is made (`0 < ε/2` for
*Use with ε/2*, `N ≤ n`) is never a goal of its own: no pip, no close; a
small gold chip with it ticks at the end of the new fact's card. When
a statement changes, its writing moves piece by piece: what leaves
shrinks and fades where it was, then what stays slides, and the part a
row brought flies in and becomes its block. When the goal's whole shape
changes (`∀n≥max(N, N₁).` comes off and it goes from two lines to one at
another size) it is not torn apart: its new writing fades in on the card. Words
for a moment (*Undo 1 to get back on the book's path*, *Your turn*) show
just under the bar, and go by shrinking away, pill and words together. Under the title, a dot for each
move of par fills as moves are made, grey past par; apart from them, on a
soft pill, a square for each goal fills as it closes. The last goal closes with the theorem stamped Q.E.D.: as the move is
made the hand slides down and away, and as the goal flashes the facts
fade and slide down; then the statement rises as a trophy card (a statement too
long for a line is broken after a ⟹, each line holding as many premises
as fit, before any binder is broken; on a line of its own under it, the
stamp), with its stars (par or better: three)
on a card under it, the pair in the middle of the screen, and *Next* big
and bobbing in the thumb's reach (it goes to the next level not solved
after this one on the map, round to the first only if there is none),
and *Read the proof*, its proof written out as a book would. A theorem later levels use is a new
move: the finish card says so and its card flies into the Book (the book
button), which holds the rulebook, the theorems proved (each with its
stars and the levels it is used in) and those still to prove.

The first time a level that brings in a control is played, a ghost
finger shows it once (`demo:` in its region file): a row tapped (Take
what you need), the goals' squares at the top (Both at once), a term
picked (For every one), the cursor swiped across the goal (Only one e).
A demo goes when the player does it (or asks for a hint) and is kept as
seen in the progress file (`seen KIND`).

The first time a level of a chapter that has a `chapter "..."` line
(Groups, Limits) is opened from the map or by Next, the chapter's page
comes first: CHAPTER k, its title, its cover picture, its one sentence,
and its rulebook as tiles popping in (Groups: the five rules; Limits,
whose rules are Calculate's: the definition and a Calculate tile), with
*Begin* bobbing. Any tap or key puts it away (kept as `seen REGION` in the
progress file) and the level's title card follows.

The map is a chapter for each region: a cover strip with its picture and
how much is proved, then its levels as pudgy round nodes along a winding
path, stars under each, the next to play bobbing.

On the screen a sequence is written by its terms (`(aₙ + 1) → A + 1`, not
`λn. a n + 1`) and an inverse of an inverse bracketed (`(a⁻¹)⁻¹`); proof
scripts and the tests see terms as the printer writes them without this
(`show_display` in show.l8).

The picture above a level shows the goal on an example, and follows the
proof. For limits: the sequences, with the band each hypothesis says they
stay in from its N on (the N found from the example), the goal's limit
when it is worked out (A + 1, 2 · A), and an ε handle that can be
dragged. A band asked for less than ε narrows to it; the goal's gate
slides to where it is chosen; once it is chosen, a dot past it that its
sequence's band does not yet hold (choosing N where max(N, N₁) is needed)
turns red and jiggles. A taken n is drawn past its lower bound (at or past
every gate), whatever is said at it; a fact said at n (`|aₙ − A| < ε/2`)
is a band of its own, not the sequence's gated one; gates in one place
have their names one under another. Only a name's gate (N, N₁, n) or
the goal's chosen one is drawn: a fact used with a term (`max(N, N₁)`)
adds none. While the goal is `X ≤ n` (the side condition a Use with left),
the picture stays on the goal it was for (its ε band, n, the red dots;
so does any side condition a Use with left, `A > 0`),
and if X is past n in the example, X's gate is red with a red bracket
from n to it: n is not far enough. For groups: a letter train, each side of the goal
a row of tiles (a⁻¹ hollow in a's color, e faint, f purple); how a product is
grouped is how close its tiles sit, a pair x⁻¹ · x side by side glows,
tiles slide, swell in and pop as the goal changes, and when the sides are
the same the rows slide together into one; tiles leaving shrink and fade
first, then those that stay slide, then new ones swell in (as the
writing does). For a level about a relation R x y (Someone for
everyone): R as a grid of x rows and y columns, the row the fact gives
lit, the column of a y taken ringed.

## Playing in pictures (hooks)

- `L8_LEVEL=k` opens map level k (logic 0-8, groups 9-16, limits 17-21);
  the progress file the rig uses is the game's argument (seen demos and
  solved levels change what shows);
  `L8_WATCH=1` plays its written proof (`L8_WATCH_PACE` in hundredths: 30
  is quick). `L8_CHAPTER=1` shows its chapter's page first, as the map
  does the first time (if the progress file has not seen it); the first
  tap or key then puts it away, so add one to the front of `L8_TAPS` or
  `L8_KEYS` (`L8_LEVEL=9 L8_CHAPTER=1 L8_KEYS="enter;h;enter"`).
- `L8_TAPS="x,y;x,y"` taps those places (the game's pixels), one every
  `L8_TAP_GAP` hundredths of a second (default 70), from 1.7 s on (the
  level's title card is gone by then). `x,y>x2,y2` swipes, `x,y+ms` holds
  (`348,30+700` holds the bulb: Watch); `-1,0` undoes, `-2,0` waits.
- `L8_KEYS="right;1;right;right;1;a"` presses keys the same way, after the
  taps: `left`/`right` move the cursor, `up`/`down` the focus; `1` to `4`
  play a row (the one after the rows shown is *More*), `0` opens *More
  moves* (or, while chips show, *More terms*); while chips show, a
  letter or digit picks the k-th chip (`a` or `1` the first; `h` is the
  hint, not the eighth), `enter` the hinted chip (or the first); `enter`
  plays the hinted row (or the first), `u` (or `back`) undoes, `h` asks for a
  hint, `w` watches, `esc` backs out (from the chips, from *More moves*).
  The same keys work on a computer and on the page. `h;enter` repeated
  follows the written proof to the end (chips too); on the finish card
  `enter` is Next, so give no more pairs than the proof needs. The
  demos show only while unseen: start from a progress file without
  `seen` lines to see them.

For example, Cancel on the left by keys (seven moves, par):

```sh
L8_LEVEL=12 L8_TAP_GAP=50 L8_KEYS="right;1;right;right;1;a;1;1;1;1;1" .build/lemma
```

Adding limits by the book up to Choose (eleven `h;enter` pairs: a step
with a term takes two), then choosing `N` alone (the third term, after
`max(N, N₁)` and `N₁`): the dots of b (teal) between N and N₁ go red; with
`;1` after it (Take any n), n is drawn just past N and the b dots between
n and N₁ stay red. By the book (`max(N, N₁)`) no dot goes red.

```sh
L8_LEVEL=20 L8_TAP_GAP=40 L8_KEYS="$(for i in $(seq 11); do printf 'h;enter;'; done)c" .build/lemma
```

The chapter page of Groups, then its first level:

```sh
L8_LEVEL=9 L8_CHAPTER=1 L8_TAPS="200,400" .build/lemma
```

A mistake and its way back: `e` put on the right (`b · e = c`), the hand
shows *Back · b = c*; the hint says *Undo 1*; undo and hint again, and the
words and the undo pulse are gone:

```sh
L8_LEVEL=12 L8_KEYS="right;2;h;u;h" .build/lemma
```

Only one e closed from the goal's hand: `e` put on the right (`f · e =
e`), then the first row, *Use the fact with e*:

```sh
L8_LEVEL=11 L8_KEYS="right;2;1" .build/lemma
```

Shifted at its first Use with: only `ε` shows; `0` opens *More terms*
(`A`, `A + 1` dimmed, *needs A > 0*); `2` instead of `0` picks `A` all the
same, and the goal `A > 0` is a dead end (*Undo 1*), the ε band still
drawn:

```sh
L8_LEVEL=18 L8_TAP_GAP=30 L8_KEYS="h;enter;h;enter;h;enter;h;enter;0" .build/lemma
```

Both at once, its Split staged as two goals (frames from 1.9 s to 4 s):

```sh
L8_LEVEL=1 L8_KEYS="1" .build/lemma
```

A dead end in Adding limits: `N` alone chosen, n taken, b's fact used
with n; the goal `N₁ ≤ n` cannot be shown, the hand says so with *Undo
3*, the N₁ gate is red with a bracket from n (add `;1` to undo the
three):

```sh
L8_LEVEL=20 L8_TAP_GAP=40 L8_KEYS="$(for i in $(seq 11); do printf 'h;enter;'; done)c;1;1;c" .build/lemma
```

Adding limits to its Q.E.D. by hints alone (17 pairs):

```sh
L8_LEVEL=20 L8_TAP_GAP=30 L8_KEYS="$(for i in $(seq 17); do printf 'h;enter;'; done)" .build/lemma
```

## How it is built

- `kernel.l8`: the only code that makes theorems. Pure, Isabelle's
  meta-logic: simply typed λ-terms with ⋀, ⟹ and ≡, hash-consed and kept
  in β-normal η-short form, so equal terms are equal numbers. The rules
  are LCF style; axioms come only from the logic's file.
- `hol.txt`: classical higher-order logic, declared in Pure as natural
  deduction rules, with the derived rules (flip sides, using a bounded
  for-all, taking any x with a condition) proved by their own moves.
- `regions/*.txt`: the subjects. A region adds no axioms: it fixes symbols
  (free variables) and assumes its rulebook, so its theorems hold for
  anything satisfying the rulebook. Definitions are hypotheses
  `name ≡ term`. `theory.l8` reads these files (format at its top);
  `syntax.l8`, `read.l8` and `show.l8` are the notation, the reader (with
  type inference and overloading by type: ≤ on ℝ and ℕ) and the printer.
- `match.l8`, `goal.l8`, `moves.l8`: matching (with ?P x patterns), goals
  and the proof tree, and the moves. Every move applies a rule: what the
  goal, the hypothesis or the part fixes is matched, the rest is a witness;
  each move makes a step theorem the kernel checks at once.
- `arith.l8`: Calculate, linear arithmetic over an ordered field
  (Fourier-Motzkin over exact fractions; |x|, max and ≠ by cases; the
  naturals' order by chaining). It is the one oracle: theorems that lean
  on it are marked, and it cites the whole rulebook.
- `english.l8`: a finished proof written out; each rule says how it reads
  (`says` in the files); rewrites of an equation read as a calculation.
- `play.l8`: proofs written in the files (`proof:`), the same moves a
  player makes, played by the tests, by Watch, and to prove given lemmas.
- The app: `paint.l8` (from the recipe book), `font.l8` (Rubik with Noto
  Sans Math, made by `tools/font.py`), `boxes.l8` (terms as nested blocks
  that morph on springs), `hand.l8` (the focus, the cursor's places, and
  the hand: each candidate tried on the proof and taken back, to show what
  it gives and drop what the kernel refuses), `app.l8` (state, moves,
  hints and Watch), `pages.l8`, `picture.l8`, `touch.l8`, `main.l8`;
  `web/lemma` runs it in a browser.

A region's theorem can be exported (`export_theorem` in moves.l8): its
rulebook discharged, its symbols quantified and its carrier types made
any types, it is a theorem with no hypotheses at all, ready to be used of
any structure that obeys the rulebook. The test shows (a·b)⁻¹ = b⁻¹·a⁻¹
exported so; that is what the Foundations region will instantiate.

## Adding a region

Write `regions/NAME.txt`: `region`, the types and fixed symbols with their
notation, a `chapter "..."` sentence for its first page if it wants one, the rulebook (`assume`), definitions, and levels, each with
`show:`, `par:`, a `kit:` if it needs witnesses built, `tools:` (earlier
levels' lemmas it may use), a `demo:` if it brings in a control, and a `proof:` (which the tests play). Add it
to `region_files` in `app.l8` and `FILES` in `web/lemma/lemma.js`. A
`picture` needs code in `picture.l8`; `calculate` needs `calc` roles.

## Not built yet

The Foundations region (constructing ℕ, ℤ, ℚ, ℝ and proving each
rulebook is satisfied); Calculate replaying a certificate through the
kernel instead of being trusted; holding a row to preview it; a tilted
Q.E.D. stamp (the painter has no rotation); more regions
(topology, linear algebra); a torus.
