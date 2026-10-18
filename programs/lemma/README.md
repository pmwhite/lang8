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

A level is **a goal and a hand of moves**. The facts (*You have*, newest
at the bottom) and the goal (*Show*, big when there is room) sit in the
middle of the room between the picture and the hand; when they no longer
fit, the goal is pinned above the hand and the facts scroll above it. A
fact used by a move shrinks to one small line after the next move, one
not touched for three moves to one line. A level with no picture shows
its words as a soft card at the top. One
statement is focused (outlined orange), and the hand holds its moves, each
a pudgy row that says what kind of move it is and shows **what it gives**:
the statement as it will be (the changed part tinted), a new fact (blue), or
a gold row that closes the goal.

- **Tap a statement** to focus it. With the whole of it focused, the hand
  has its own moves (*Take any ε*, *Assume it*, *Split*, *Choose …*, *Get N*,
  *Use with …*, *Apply it*, a theorem you proved) and every rewrite
  anywhere inside it that does not make it bigger (tidying, a known fact,
  opening a definition).
- **Swipe sideways** on the board (or tap the ‹ › nubs, or tap a part) to
  move the cursor through the parts of the focused statement, outside in.
  At a part, the hand has every rewrite of it, the growing ones too
  (`b` to `e · b`, `e` to `□⁻¹ · □`). Nothing on the board opens a menu.
- **Tap a row** to play it. One that needs a term shows chips (`ε / 2`,
  `max(N, N₁)`, `a`) in place of the hand; tap one.
- Three rows show, then *More moves*: under it go the rest, *Suppose not*
  and *Flip sides* (unless the level's written proof uses them), and moves
  that would give back a state the proof was already in.
- **Undo** (top right) takes back the last move. The **bulb** shows the
  written proof's next move (the row glows, a ghost finger points), or, off
  its path, how many undos get back on it; held, it plays the whole proof
  (Watch), then says *Your turn* and starts the level afresh (watching
  does not solve it).

After a move the focus goes to what it made (a new fact with moves, or the
changed goal). A new fact flies from its row to its card, and the changed
part of a rewritten goal flies to the block it becomes, each carrying its
writing. Goals that are something known, both sides the same, or (where
the region has it) arithmetic close by themselves: the card flashes gold
and, its writing shrinking with it, flies into its pip at the top. Words
for a moment (*Undo 1 to get back on the book's path*, *Your turn*) show
just under the bar. Under the title, a dot for each
move of par fills as moves are made, grey past par; a pip for each goal
fills as it closes. The last goal closes with the theorem stamped Q.E.D.,
its stars (par or better: three), and its proof written out as a book
would.

The picture above a level shows the goal on an example, and follows the
proof. For limits: the sequences, with the band each hypothesis says they
stay in from its N on (the N found from the example), the goal's limit
when it is worked out (A + 1, 2 · A), and an ε handle that can be
dragged. A band asked for less than ε narrows to it; the goal's gate
slides to where it is chosen; once it is chosen, a dot past it that its
sequence's band does not yet hold (choosing N where max(N, N₁) is needed)
turns red and jiggles. For groups: a letter train, each side of the goal
a row of tiles (a⁻¹ hollow in a's color, e faint); how a product is
grouped is how close its tiles sit, a pair x⁻¹ · x side by side glows,
tiles slide, swell in and pop as the goal changes, and when the sides are
the same the rows slide together into one.

## Playing in pictures (hooks)

- `L8_LEVEL=k` opens map level k (logic 0-8, groups 9-16, limits 17-21);
  `L8_WATCH=1` plays its written proof (`L8_WATCH_PACE` in hundredths: 30
  is quick).
- `L8_TAPS="x,y;x,y"` taps those places (the game's pixels), one every
  `L8_TAP_GAP` hundredths of a second (default 70), from 1.7 s on (the
  level's title card is gone by then). `x,y>x2,y2` swipes, `x,y+ms` holds
  (`348,30+700` holds the bulb: Watch); `-1,0` undoes, `-2,0` waits.
- `L8_KEYS="right;1;right;right;1;a"` presses keys the same way, after the
  taps: `left`/`right` move the cursor, `up`/`down` the focus; `1` to `4`
  play a row (the one after the rows shown is *More*); while chips show, a
  letter or digit picks the k-th chip (`a` or `1` the first); `enter` plays
  the hinted row (or the first), `u` (or `back`) undoes, `h` asks for a
  hint, `w` watches, `esc` backs out (from the chips, from *More moves*).
  The same keys work on a computer and on the page. `h;enter` repeated
  follows the written proof (a letter after it where it needs a term).

For example, Cancel on the left by keys (seven moves, par):

```sh
L8_LEVEL=12 L8_TAP_GAP=50 L8_KEYS="right;1;right;right;1;a;1;1;1;1;1" .build/lemma
```

Adding limits by the book up to Choose, then choosing `N` alone (the
fourth chip): the dots of b between N and N₁ go red.

```sh
L8_LEVEL=20 L8_TAP_GAP=40 L8_KEYS="h;enter;h;enter;h;enter;h;enter;a;h;enter;h;enter;h;enter;a;h;enter;h;enter;d" .build/lemma
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
notation, the rulebook (`assume`), definitions, and levels, each with
`show:`, `par:`, a `kit:` if it needs witnesses built, `tools:` (earlier
levels' lemmas it may use), and a `proof:` (which the tests play). Add it
to `region_files` in `app.l8` and `FILES` in `web/lemma/lemma.js`. A
`picture` needs code in `picture.l8`; `calculate` needs `calc` roles.

## Not built yet

The Foundations region (constructing ℕ, ℤ, ℚ, ℝ and proving each
rulebook is satisfied); Calculate replaying a certificate through the
kernel instead of being trusted; ghost-finger first-time demos; holding a
row to preview it; a new fact landing before it closes the goal it
matches; chapter covers and a winding map; the Book as a collection of
earned theorems; sequence notation (`aₙ` rather than `λn.`); more regions
(topology, linear algebra); the logic region's picture; a torus.
