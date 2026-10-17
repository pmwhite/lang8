# Lemma

A puzzle game made of real proofs. Each level is a theorem; the player
proves it from the ground up by tapping what to work on and picking a
move, and every move is checked by a small kernel. A solved level becomes a
tool for the levels after it, so the map of a region is the dependency
graph of its subject.

```sh
make lemma && .build/lemma [PROGRESS]   # PROGRESS: .build/lemma-progress.txt
make lemma-test                         # the engine's tests, and every level played
make lemma-web                          # the page, in .build/web/lemma (after make web)
```

Off a page the window is phone shaped (`L8_W`, `L8_H`, `L8_UI` change
it). `L8_LEVEL=k` opens map level k; with `L8_WATCH=1` it plays the
level's written proof. `L8_TAPS="x,y;x,y"` taps those places, one every
0.7 s (`L8_TAP_GAP` in hundredths), for pictures of play. On the page,
`?fresh` starts with nothing proved, and `L8_` query parameters are passed
on.

## Playing

The goal to show is the big card; what is known is above it. A tap on
either, or on any part of them (every subterm is its own block), picks it,
and the tray rises with the moves that fit there:

- the goal: the logic's ways in (*Take any ε*, *Assume it*, *Split*,
  *Choose …*), a lemma whose conclusion it is, *Open the definition*;
- something known: the ways out (*Use with …*, *Get N*, *Cases*), a lemma
  it is the first premise of, *Apply it*;
- a part: an equation (of the region's rulebook, a lemma, or something
  known) that rewrites it: the button shows what it becomes.

A move that needs a witness (the N of "there is an N", the ε/2 to use a
limit with) offers the terms on the board and the level's kit of term
shapes (`max(x, y)`, `x / 2`) filled with them. After every move, goals
that are something known, both sides the same, or (where the region has
it) arithmetic, close by themselves. **Undo** takes back the last move;
**Watch** plays the level's written proof as a finger would. A finished
level shows its stars (par or better: three) and its proof written out as
a book would.

The picture above a level shows the goal on an example, and follows the
proof: for limits, the sequences, with the band each hypothesis says they
stay in from its N on (the N found from the example), and an ε handle
that can be dragged; for groups, symmetries of a square, the goal's two
sides drawn as squares.

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
  that morph), `app.l8`, `pages.l8`, `picture.l8`, `touch.l8`, `main.l8`;
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
kernel instead of being trusted; hints beyond Watch; more regions
(topology, linear algebra); the logic region's picture; a torus.
