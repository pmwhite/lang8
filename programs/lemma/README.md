# Lemma

A puzzle game made of real proofs. Each level is a theorem; the player
proves it from the ground up with gestures on the formulas themselves,
and every move is checked by a small kernel. A solved level becomes a
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

## Playing: the formulas are the controls

There is no list of moves anywhere. What is in scope is what is on the
board: the facts (*You have*), the goal (*Show*), and the shelf at the
bottom. Every symbol is one of two physical things:

| Surface | Look | Gesture | Meaning |
|---|---|---|---|
| **Key** | a raised, pudgy keycap on a statement's outermost symbol | tap it | open it: always safe |
| **Notch** | a hollow socket where the binder's name was, after the binder | drop a name into it | I choose this one |

| Symbol | On the goal | On a fact |
|---|---|---|
| ∀y. ∀n≥N. ∀ε>0. | key: a fresh *any* name (white, ringed orange) goes onto the shelf; a bound's `n ≥ N` drops into the facts | notch: a new fact for that name (the general one stays); a bound's side condition shows a moment as a small grey chip with a check when arithmetic closes it, else it is a goal |
| ∃x. | notch: the goal becomes the body for that name | key: a *some* name (blue) pops onto the shelf, the body is the fact |
| ∧ | key: two goals | key: two facts (*Take both parts*, a rule proved in hol.txt) |
| ⟶ | key: P drops into the facts | flat: used by dragging it |
| a defined symbol (→ for limits) | key: it opens to its definition | key: the same |
| = | swipe the goal sideways: flipped | grip a face (below) |

Binders inside a statement that will be keys once the ones round them
are opened show as dimmed rims (pressed in), so the plan is in sight.
A binder's name is the one the level wrote (`∀y. P(y)`, a `y` token), so
the difference between names is the lesson (*drop y into x*).

Drags (pick up a whole card, a name, or a tile's face; the thing rides
above the finger):

- **A fact onto the goal**: the same, it closes; one whose conclusion
  fits (`P ⟶ Q` onto `Q`, a for-all fact, `¬P` onto anything) leaves
  what it still needs; one that needs a name leaves a socket on the goal,
  *Drop a name into the slot*, filled by dropping or tapping a name.
- **A name into a notch** (the whole card counts as its notch).
- **An equation's face onto a part of the goal: like on like.** Rules
  (the rulebook), proved lemmas that are equations, and equation facts
  are two-faced tiles with a seam (a notch in each edge). Grip one face,
  drop it on a part that looks like it, and the part becomes the other
  face: the `□` face of `e · □ = □` onto `b` gives `e · b`; the `e` face
  of `□⁻¹ · □ = e` onto `e` gives `□⁻¹ · □` with a socket (ringed
  orange) for the name. Rule variables are grey hollow slots, never letters. A for-all
  equation fact (`∀x. f · x = x`) is gripped the same way: its face
  onto `f · e` uses it with `e` and rewrites, one gesture.
- **A lemma's tile onto the goal** (*Only one inverse*): its conclusion
  the goal, its premises what is left.
- **A name onto a kit tile** (`□ / 2`, `max(□, □)`, `|□ − □| / 2`):
  it fills the next hole; full, the name it builds (`ε / 2`) goes onto
  the shelf, cream. Witnesses are built, never picked from a list.
- **The goal swiped sideways**: flipped (an equation). **The goal dragged
  up into the facts**: Suppose not; over the facts it shows as its
  opposite.

Held over a place it fits, the place leans toward it and shows what it
would become, morphing glyph by glyph as a move does (what stays slides,
what goes fades before what comes swells in; the changed part tinted; a
small check when it would close the goal). The goal's parts show as faint
blocks only while a face is held. A name held over a fact's notch leaves
the general fact as it is: the new fact it would give slides out under
it as a card of its own, with a plus. In Someone for everyone the grid
follows: the row lights only once x is got from the fact, the cell (x, y)
is ringed when the goal asks for it, (y, y) soft red. The picture follows
a thing held in the other chapters too: in Groups the tiles take the
shape the held face would give (a new `e` tile, a regrouping), the new
ones faint (would be, not is), and spring back; in Limits a name over a
fact's notch brings the band it would give in faint, and N over the
goal's notch slides the goal's gate to N.
Let go elsewhere, it slides gently home; no shake, no sound. The same
refusal twice says why in small grey words (*Doesn't match*, *Not a name
here*, *That needs a name, not a statement*; a fact with an if or a
for-all put on a goal it does not give says what it gives: *P ⟶ Q gives
Q, not R*, or *It gives Q, not R* when that is too wide). A for-all fact
put on a goal that a name dropped into its notch would give (at once, or
once the new fact's key is opened) says *Drop y into ∀ first* the second
time. The words sit over the goal's top edge, right of SHOW (under a fact
for a fact). A card lifted leaves an empty dent where it was, none of its
writing behind. A name dropped on a statement whose key is still shut,
or a fact dropped on the goal that would fit once its key is opened,
says *Open it first* at once. A tap on a thing that moves (a fact, a
name) leans it toward where it fits and back: not a menu, the object
showing that it moves. While a thing is held, the places it fits have a
soft edge (in Logic at once; from Groups on, once it has been held still
1.2 s). Nothing breathes, pulses or hops; there are no sounds or buzzes.

A key pressed sinks a moment before the statement opens; the binder puffs
away, the rest slides over to close the gap (writing on the board is known
by what it writes, so nothing is ever drawn twice), and a name it gives
leaves the key as a ball and arcs to its place on the shelf. An ∧ key
pinches its card like dough: a waist forms at the ∧,
and the halves part into two cards (two goals, or two facts), each with
its writing. The shelf always keeps room for a row of names (an empty
tray, faint), so the board never moves because a name arrived.

Each key tap or drop is a move (counted, kept in the progress file, not
shown; a level's `par:` bounds the dead-end search); a socket's name, kit
building and the game's own closes are free. There is no score. A level's
`demo:` (key, goalkey, drag, token, notch, some; face, flip; def, kit,
suppose) is performed once by the ghost hand the first time the level
is played: the book's first gestures made by a puppet finger (the key
tapped and the name going to the shelf, the name carried into its notch
with the preview) and taken back, twice, with one small grey line of
words; a gesture that would finish the level is only shown. A touch
stops it.

The language's words (`word:` in a level: and, if, all, ex, eq, def, kit,
not): the first time a level brings one in, the Book gains its page
under THE LANGUAGE (first in Logic, after the rules elsewhere; the
chapter's own words first); nothing pops. A word is known once seen, or
once a level that brings it in (or a later one in its chapter) is solved,
so older progress has its words: the symbol on the goal and on a fact,
each gesture played over and over by a little finger (`words.l8`).

The bulb's ghost hand performs the book's next gesture (taps the key or
carries the thing to its place); off the book's path it says *Undo k*.
Held, the bulb plays the whole proof as ghost-hand gestures (Watch),
then says *Your turn*. A dead end: in Logic, after each move off the
book's path, a bounded search with the same gestures (keys opened first,
names from the shelf) decides whether the goal can still be shown; if it
runs out of moves without a proof, the goal card greys, *Can't be shown
from what you have* in small grey words on its top edge, a plain *Undo k*
pill on its corner; the bulb then makes the ghost finger tap that pill.
Someone for everyone's grid is square, the same people (little coloured
figures) down the side as x and along the top as y, a faint diagonal
where each meets themself; the example has no one related to themself
except on the full row, so y's own dot (y, y) is empty: it is ringed soft
red on hover and when stuck, and stuck, the full row's dot in y's column
shows beside it (what you have gives that one, not this). No letter
stands over any one person: until names are taken only a faint *x ↓* and
*y →* sit in the grid's corner; a taken y is its orange ball over its
column, a got x its blue ball beside its row. In Limits a comparison of
indices (`N₁ ≤ n`) or a use's side condition (`A > 0`) that arithmetic
did not close is one (the gate soft red, a bracket from n). Groups says
*Undo k* only when asked. Toasts are a small pale pill with grey words.

Goals that are a fact, both sides the same, or (where the region has it)
arithmetic close by themselves, staged: the goal card first morphs to
what the move made of it (`e · c = c` to `c = c`); a new fact drops in,
and a copy of it moves into the goal; then the card shows a small grey
check (and *by arithmetic* under it if that closed it) and fades where it
is. The bar is back, the title (tap: its words again), the bulb and undo;
no counters. When the last goal closes the facts fade away, the shelf
slides down, and the goal card settles where it is into the theorem
proved (its writing morphing from the last goal's); over it *Proved.*
(and *Later levels can use it.* for a theorem later levels use, a new
tile on the shelf there), under it *Read the proof* as a small link
(written out as a book would) and a plain *Next* pill. The Book (a tap on
a chapter's cover on the map) holds the language, the rulebook, the
theorems proved and those still to prove. The first level of a chapter
with a `chapter "..."` line opens on its page (its cover picture, its
sentence, its rulebook as tiles, Begin). The map is a chapter for each
region (*k of n proved*, *Book*), levels as pudgy nodes on a winding
path: a quiet grey check when proved, a thin orange ring on the next.

The picture above a level shows the goal on an example and follows the
proof. Limits: the sequences, the band each hypothesis says they stay in
from its N on, the goal's limit, an ε handle; the goal's gate slides to
where it is chosen, a taken n is drawn past its gates, dots a band does
not yet hold are ringed soft red. Groups: a letter train, grouping as
closeness, `x⁻¹ · x` side by side on a warmer pill. Someone for everyone:
R as a square grid of the same people both ways, the row the fact gives
lit, the column of a y taken ringed, the diagonal drawn. Levels about
properties of one kind of thing (Any one at all, Show me one, One of
them): the same people in a row, a chip for each property under each; a
name stands over a person as its ball, a property a fact gives them lit
(half lit inside an ∧, faint for the fact a name held over a notch would
give), the one the goal wants ringed; proved for any y, every chip is
lit, for some one only theirs.

## Playing in pictures (hooks)

- `L8_LEVEL=k` opens map level k (logic 0-10, groups 11-18, limits 19-23);
  the progress file the rig uses is the game's argument (seen demos and
  solved levels change what shows; without `seen KIND` lines the demos
  play). `L8_WATCH=1` plays its written proof as ghost-hand gestures
  (`L8_WATCH_PACE` in hundredths: 40 is quick). `L8_CHAPTER=1` shows its
  chapter's page first, as the map does the first time.
- `L8_DO` makes gestures by what they are; each is found on the board
  and played as a real drag (or tap) by the puppet finger, every frame
  between, so hovers show:

  | Step | Gesture |
  |---|---|
  | `open goal`, `open fact K` | a key tapped |
  | `token N > goal`, `> fact K`, `> kit K` | name N carried to the notch (or the card), or into the K-th kit tile; quote names with spaces: `token "ε / 2" > fact 0` |
  | `fill N` | name N onto the goal (a socket) |
  | `fact K > goal` | fact K carried onto the goal |
  | `rule K face L > part "T"` | the K-th rule tile's face L (0 left, 1 right) onto the goal's part shown as T |
  | `fact K face L > part "T"` | an equation fact's face onto a part |
  | `lemma K > goal` | the K-th lemma tile onto the goal |
  | `flip`, `suppose` | the goal swiped; dragged up into the facts |
  | `tap fact K`, `tap token N` | a tap (the thing leans toward where it fits) |
  | `undo`, `hint`, `enter`, `wait` | as the keys |

  Each step starts `L8_DO_GAP` hundredths (default 90) after the last
  ends; carries take `L8_DO_MS` (600). `L8_DO_STOP=k` holds step k (from
  1) over its place and stops there (the preview). A script's gesture is
  the player's: a demo playing stops.
- `L8_BOXES=1` prints the board after the title card and after each move
  settles: the goal, its parts, each fact (by number), keys, notches and
  seams, the names on the shelf, the kit, rule and lemma tiles (by item),
  each with its rectangle (`x0,y0 x1,y1`), plus moves, the book's path,
  DEAD, DONE and SOCKET.
- `L8_TAPS="x,y;x,y"` taps those places (the game's pixels), one every
  `L8_TAP_GAP` hundredths (default 70), from 1.7 s on; `x,y>x2,y2`
  swipes, `x,y+ms` holds (`348,30+700` holds the bulb: Watch); `-1,0`
  undoes, `-2,0` waits. `x,y>>x2,y2+ms` is a real drag (picked up, then
  carried every frame); a trailing `!` holds it there.
- `L8_KEYS="h;enter"` presses keys after the taps: `h` the hint (the
  ghost hand shows the gesture), `enter` the hinted gesture made (or the
  book's next; on a dead end, Undo k), `1` Undo k on a dead end, `u`
  undo (or cancels a socket), `w` watch, `esc` back. `h;enter` once per
  par move follows the book to the end, in every chapter.

Someone for everyone: the trap, its dead end, and the way:

```sh
L8_LEVEL=10 L8_BOXES=1 L8_DO="open goal;token y > goal" .build/lemma
L8_LEVEL=10 L8_DO="open goal;token y > goal;undo;open fact 0;token x > goal;token y > fact 0" .build/lemma
L8_LEVEL=10 L8_DO="open goal;open fact 0;token x > goal;token y > fact 0" L8_DO_STOP=4 .build/lemma   # the preview, it would close
```

Cancel on the left by faces (seven moves; step 2 leaves a socket,
step 3 fills it):

```sh
L8_LEVEL=14 L8_DO='rule 1 face 1 > part "b"; rule 3 face 1 > part "e"; fill a;
  rule 0 face 0 > part "(a⁻¹ · a) · b"; fact 0 face 0 > part "a · b";
  rule 0 face 1 > part "a⁻¹ · (a · c)"; rule 3 face 0 > part "a⁻¹ · a";
  rule 1 face 0 > part "e · c"' .build/lemma
L8_LEVEL=14 L8_DO='rule 1 face 1 > part "b"' L8_DO_STOP=1 .build/lemma    # the hover: e · b
```

Only one e (a for-all fact's face), The inverse of the inverse (a swipe
and a lemma tile):

```sh
L8_LEVEL=13 L8_DO='rule 2 face 1 > part "f"; fact 0 face 0 > part "f · e"' .build/lemma
L8_LEVEL=16 L8_DO='flip; lemma 0 > goal; rule 3 face 0 > part "a⁻¹ · a"' .build/lemma
```

Doubled with the kit (ε onto `□ / 2`, then `ε / 2` into the notch), Only
one limit's Suppose not held over the facts, and Adding limits' trap (`N`
alone; `N₁ ≤ n` is a dead end, *Undo 4*):

```sh
L8_LEVEL=21 L8_DO='open goal; open goal; open fact 0; token ε > kit 0; token "ε / 2" > fact 0;
  open fact 2; token N > goal; open goal; token n > fact 2' .build/lemma
L8_LEVEL=23 L8_DO="suppose" L8_DO_STOP=1 .build/lemma
L8_LEVEL=22 L8_DO_GAP=40 L8_DO="$(for i in $(seq 8); do printf 'hint;enter;'; done)token N > goal; open goal; token n > fact 3; token n > fact 4" .build/lemma
```

A name dropped on the fact whose ∃ key is still shut (*Open it first*),
the new fact a notch would give previewed under the general one, a key's
name going to the shelf, and the Book's words (a progress file with
`seen word_and` ... lines):

```sh
L8_LEVEL=10 L8_DO="open goal;token y > fact 0" .build/lemma
L8_LEVEL=10 L8_DO="open goal;token y > goal;hint" .build/lemma         # stuck: the finger taps Undo 1 (from ~6.5 s)
L8_LEVEL=5 L8_DO="open goal;fact 0 > goal;fact 0 > goal" .build/lemma # P ⟶ Q gives Q, not R (~7 s)
L8_LEVEL=20 L8_DO="open goal;open goal;open fact 0;token ε > fact 0" L8_DO_STOP=4 .build/lemma  # the band it would give
L8_LEVEL=6 L8_DO="open goal;token y > fact 0" L8_DO_STOP=2 .build/lemma
L8_LEVEL=6 L8_TAPS=63,757 .build/lemma      # the goal's ∀ key: grab frames from 1.75 s on
L8_LEVEL=6 L8_DO="open goal;fact 0 > goal;fact 0 > goal" .build/lemma  # Drop y into ∀ first (~7.5 s)
L8_TAPS=100,170 .build/lemma                # the map: Logic's cover opens its Book
```

Watch, and a demo (a progress file without `seen` lines):

```sh
L8_LEVEL=23 L8_WATCH=1 L8_WATCH_PACE=60 .build/lemma
grep -v '^seen' .build/lemma-progress.txt > /tmp/p.txt; L8_LEVEL=6 .build/lemma /tmp/p.txt
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
- `play.l8`: proofs written in the files (`proof:`), played by the
  tests and to prove given lemmas. Logic's proofs are written as
  gestures (`open goal`, `open hyp K`, `drop "y" goal`, `drop "y" hyp K`,
  `apply hyp K [with "a"]`); the others as the moves' words (`part "b"
  "e · b"`, `hyp 0 "Use with ..." with "ε"`), which `book_gesture` reads
  as the gesture that makes that move.
- `gesture.l8`: the gestures, each one move of moves.l8 made by the
  kernel: keys (take any, assume, split, get, take both parts, open a
  definition), names into notches (choose; use, with a bound's condition
  at once), a fact onto the goal, a face onto a part (`gs_face`: the
  rewrite at that path by that rule and direction; a for-all equation
  fact is used with the name matching finds, then rewrites), flip,
  Suppose not, a lemma onto the goal; trying one and taking it back; the
  book's steps as gestures (`book_gesture`); and the bounded search that
  says a goal cannot be shown (`gs_dead`: dead only if the search ran out
  of moves, not if it was cut short). The tests play every level by its
  gestures.
- The app: `paint.l8` (from the recipe book), `font.l8` (Rubik with Noto
  Sans Math, made by `tools/font.py`), `boxes.l8` (terms as nested blocks
  that morph on springs; a notch's room in the layout; rule variables as
  hollow slots), `board.l8` (the board as a language: keys, notches, the
  shelf of names, kit, rule and lemma tiles, holding and dropping,
  previews, sockets, refusals, nudges, the swipe, dead ends, the puppet
  finger and ghost hand for hints, Watch and demos, `L8_BOXES`),
  `trial.l8` (what a move made, read off the proof for staging; facts in
  play; Limits' dead ends), `app.l8` (state, moves, demos, Watch),
  `pages.l8`, `picture.l8`, `words.l8` (the words: the Book's pages), `touch.l8`, `main.l8` (`L8_DO` and the other
  hooks); `web/lemma` runs it in a browser.

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

A fact onto a fact (forward); in Groups
tiles a preview would take away vanish rather than ghost; a magnified preview clear of the thumb; long-pressing a part to
pull out a copy; ∨; keyboard navigation of keys and tiles.

The Foundations region (constructing ℕ, ℤ, ℚ, ℝ and proving each
rulebook is satisfied); Calculate replaying a certificate through the
kernel instead of being trusted; holding a row to preview it; more regions
(topology, linear algebra); a torus.
