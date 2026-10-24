# Lemma

A puzzle game made of real proofs. Each level is a theorem; the player
proves it from the ground up with gestures on the formulas themselves,
and every move is checked by a small kernel. A solved level becomes a
tool for the levels after it, so the map of a region is the dependency
graph of its subject.

```sh
make lemma && .build/lemma [PROGRESS]   # PROGRESS: .build/lemma-progress.txt
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
| **Notch** | a hollow socket where the binder's name was, after the binder | tap a name and the notch (either first), or drop a name into it | I choose this one |

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

Two things brought together: **two taps, in either order** (the main
way), or a drag. The first tapped is held: it lifts a little where it is,
its edge drawn in quiet grey (a name ringed; a fact card, a tile's face,
a kit tile, a fact's notch, or a part of the goal outlined). Tapping its
partner makes the move, with the same morph a drop makes: tap the part
`e · a`, then the `e · □` face, or the face, then the part; tap y, then
the notch, or the notch, then y. Tapping the held thing again, or nothing,
lets it go; tapping another of the same sort (another name, another face,
another place) moves the hold to it; a partner that does not fit leaves
the first held (the second time, the grey words say why). Nothing lights
up to list what fits. On the goal a tap holds the deepest part under the
finger; tapped again inside it, the part round it; from the whole goal
(its edge, or its notch), it lets go. A face tapped second goes onto the
deepest part it fits under the finger. While the partner is pressed, a
card shows what the move would make (*The goal becomes ...*, *A new
fact*, *That shows the goal*, *Then a name for its slot*) where the
finger is not: over the board's top, or over the shelf when the finger is
high; the move is made as the finger comes up. Keys are single taps and
open at once; the swipe and Suppose not are drags. A drag picks up a
whole card, a name, or a tile's face, which rides well above the
fingertip; the same card shows what it would make, and the goal stays as
it is under the finger (the part a face would change tinted).

- **A fact onto the goal**: the same, it closes; one whose conclusion
  fits (`P ⟶ Q` onto `Q`, a for-all fact, `¬P` onto anything) leaves
  what it still needs; one that needs a name leaves a socket on the goal,
  *Drop a name into the slot*, filled by tapping a name (or the goal
  and then a name, or dropping one).
- **A name into a notch** (the whole card counts as its notch).
- **An equation's face onto a part of the goal: like on like.** Rules
  (the rulebook), proved lemmas that are equations, and equation facts
  are two-faced tiles with a seam (a notch in each edge). Tap one face
  and a part that looks like it (or drag the face there), and the part
  becomes the other face: the `□` face of `e · □ = □` onto `b` gives `e · b`; the `e` face
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

Held over a place it fits (or a partner pressed), the place leans toward
it and the card over the board shows what it would become; the goal's
parts show as faint blocks only while a face is dragged. In Someone for
everyone the grid follows: the row lights only once x is got from the
fact, the cell (x, y) is ringed when the goal asks for it, (y, y) soft
red. The picture follows the other chapters too: in Groups the tiles take
the shape the face would give (a new `e` tile, a regrouping), the new ones
faint (would be, not is), and spring back; in Limits a name over a fact's
notch brings the band it would give in faint, and N over the goal's notch
slides the goal's gate to N.
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
says *Open it first* at once. While a thing is dragged, the places it fits have a
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

Each key tap, drop or second tap is a move (counted, kept in the progress file, not
shown; a level's `par:` bounds the dead-end search); a socket's name, kit
building and the game's own closes are free. There is no score. A level's
`demo:` (key, goalkey, drag, token, notch, some; face, flip; def, kit,
suppose) is performed once by the ghost hand the first time the level
is played: the book's first gestures made by a puppet finger (the key
tapped and the name going to the shelf, the name tapped and then its
notch, held down a moment so what it makes shows) and taken back, twice, with one small grey line of
words; a gesture that would finish the level is only shown. A touch
stops it.

The language's words (`word:` in a level: and, if, all, ex, eq, def, kit,
not): the first time a level brings one in, the Book gains its page
under THE LANGUAGE (first in Logic, after the rules elsewhere; the
chapter's own words first); nothing pops. A word is known once seen, or
once a level that brings it in (or a later one in its chapter) is solved,
so older progress has its words: the symbol on the goal and on a fact,
each gesture played over and over by a little finger (`words.l8`).

The bulb's ghost hand performs the book's next gesture (taps the key, or
taps the thing, a grey ring left round it, then its place); off the book's path it says *Undo k*.
Held, the bulb plays the whole proof as ghost-hand gestures, two taps
each (Watch),
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

## Groups: beads and a tile

The Groups chapter has no formulas on its board (`beads.l8` makes its
moves, `beadboard.l8` is its board). Its statements are the same HOL as
anywhere, and every move is the kernel's; the beads are a view of them.

**The tile** (the first four levels). A cream square with a flag on it,
its shadow beside it (where it must get to), and a slot under them for
each move the level asks for. Tap the tile: a quarter turn; swipe it
sideways: it flips over. Each move fills the next slot with its icon.
Above, a little map of where the tile has been: each place it has lain
(a small tile in that pose), the roads it took (dotted), the shadow's
place ringed; places not yet found are faint dots. Every walk level
starts from the same place, so the map grows across them (the eight
symmetries of a square and the two moves: its Cayley graph, though no
word says so). *The other way round* asks for a quarter turn back in
three moves: three turns, or a flip, a turn and a flip (the book's way).
A level whose shadow was got by a longer walk (*A short cut*) shows that
walk faint on the map. Out of moves and not there, the
tile greys, *It can't get there in the moves left* on the card's edge,
and an *Undo k* pill on its corner. Proved, the tile slides onto its
shadow and *Read the proof* and *Next* take the slots' place in the card.

In the kernel the square is concrete: `sq(a, b, c, d)` is the tile by its
corners, and the region's two rules say what a move does to them
(`act(turn, sq(a, b, c, d)) = sq(d, a, b, c)`, `act(flip, sq(a, b, c, d))
= sq(b, a, d, c)`). A walk level is `∃x. ∃y. act(y, act(x, S)) = T`;
each move chooses the next ∃ (Choose, `exI`) with `turn` or `flip`, and
the game rewrites by the two rules till the tile is a `sq(...)` again;
when the slots are full and the sides are the same, it closes.

**Beads** (the rest). A product is a string of beads on a cord: `a · b⁻¹
· c` is three beads; `b⁻¹` is the `b` bead turned over (the same color,
its face the other way about: pale, a rim and the letter in its color).
No brackets (a string), no `e` (no bead: an empty cord is nothing), no
`⁻¹`. The goal is two strings, one over the other, in a card; it is
proved when they are the same, and the lower slides up into the upper.
Facts are stamps: a blue card with a string on each side of a seam; *X*
on a stamp (a hollow bead) is any beads at all, even none. When a level
has a fact, the shelf at the foot holds each name's bead both ways up.

| Two taps (either first), or a drag | Move |
|---|---|
| a bead, then its turned-over twin beside it; or a bead dragged onto it | the pair pops (`a · a⁻¹ = e`, `a⁻¹ · a = e`) |
| a bead, then the bead beside it (or a drag along beads: a pinch) | the stretch grows, held (lifted, a grey edge) |
| a stretch, then a stamp's face (or the face, then a bead) | the stretch becomes the stamp's other face; face first, the shortest stretch through that bead it fits |
| a shelf bead, then a gap (or a bead: the gap on the finger's side) | it and its twin come out of nothing there (the inverse rules backwards) |
| a stamp's empty face, then a gap | its other face comes out there; if that has X, the gap opens with two hollow beads, *Tap a bead below for X*, and a shelf bead fills it |
| the strings swiped sideways | both turned round, every bead turned over (`x⁻¹ = y⁻¹` is enough for `x = y`) |

Tapping what is held, or nothing, lets go; a gap held shows as a thin
caret with the beads parted. While the partner is pressed, or a thing
carried hovers where it fits, the goal card tints and a card away from
the finger (over the stamps, or over the shelf when the finger is high)
shows what the strings would become. A pop is a soft squish; new beads
swell in; turned strings swing round, each bead turning over. Refusals
are the board's (*Doesn't match* the second time). Dead ends are not
looked for in beads (the bulb says *Undo k* off the book's path).

Behind it the goal is kept in order by the game's own kernel moves:
right-nested, no `e`, inverses on names only, by Regroup, e on the left
and right and three lemmas groups.txt proves from the rulebook (`inv_mul`,
`inv_inv`, `inv_e`; with `inv_unique` and `turn_round`, these are
`lemma`s with written proofs, not levels). A move on a stretch regroups
the string so the stretch is one part (assoc backwards), makes it the
term the equation names (its normal form taken back: `f` into `f · e`),
rewrites it by the rule or fact (a for-all stamp by the instance `Use
with` gives, X read off the stretch), and puts the whole in order again.
The first kernel step is the player's move, the rest the game's (so undo
takes the whole gesture back, and the move count is one); the level's
first ordering, before any move, is never undone. A proof written out
reads as a calculation through every step.

Proofs in groups.txt are written as these gestures: `walk turn`, `walk
flip`; `pop top 1` (beads 1 and 2); `pair "a⁻¹" top 0` (that bead and its
twin at gap 0); `stamp 0 face 1 top 1 2` (fact 0's face 1 onto top beads
1, 2; 0 beads is a gap); `stamp 0 face 1 bottom 4 0 with "b"` (x given);
`turn`. The hint, Watch and the first-time demos (`walk`, `flipwalk`,
`pop`, `stamp`, `pair`, `turn`) play them by the ghost hand as two taps,
a tap on the tile, or a swipe.

The level's words sit quietly at the top of its board. The levels: *A
quarter turn* (two taps), *Over* (a flip, then a turn: the other order
does not get there), *The other way round*, *A short cut* (a flip and
three turns is a turn and a flip), *Pop*, *A stamp* (`a · b = c ⟹ a⁻¹ · c
= b`), *Out of nothing* (cancelling: `a · b = a · c ⟹ b = c`), *Turned
around* (if a and b can swap, so can their inverses), *Does nothing*
(`(∀x. f · x = x) ⟹ f = e`: X is nothing) and *Twice is nothing*
(`(∀x. x · x = e) ⟹ a · b = b · a`).

The chapter's first page has no rulebook: its cover (the tile and a few
beads) and three small pictures with a line each. Its Book says what the
pictures stand for in the words books use (a bead turned over is its
inverse, no bead is e, ...), each with its rule written out, then the
theorems proved, each as beads and as books write it, and those still to
prove as beads only.

Limits is off the map for now (`region_shown` in `app.l8`: set it true to
show it); its files and tests stay.

## Playing in pictures (hooks)

- `L8_LEVEL=k` opens map level k (logic 0-10, groups 11-20: the tile
  11-14, beads 15-20; limits, when it is on the map, 21-25);
  the progress file the rig uses is the game's argument (seen demos and
  solved levels change what shows; without `seen KIND` lines the demos
  play). `L8_WATCH=1` plays its written proof as ghost-hand gestures
  (`L8_WATCH_PACE` in hundredths: 40 is quick). `L8_CHAPTER=1` shows its
  chapter's page first, as the map does the first time. `L8_BOOK=r` opens
  chapter r's Book (from 0).
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
  | `tap token N`, `tap fact K [face L]`, `tap rule K face L`, `tap lemma K`, `tap kit K` | a tap on a thing (held, or the held one's partner: the move) |
  | `tap part "T"`, `tap goal`, `tap notch goal`, `tap notch fact K` | a tap on a place: the goal's part shown as T (on it, not on a part inside it), the whole goal (by its edge), a notch |
  | `undo`, `hint`, `enter`, `wait` | as the keys |
  | `tile`, `swipe` | the tile tapped (a turn); the tile, or the strings, swiped |
  | `tap bead top I`, `tap gap bottom I`, `tap stamp J face F`, `tap shelf a`, `tap shelf a'`, `tap tile` | beads: a tap on a bead, a gap (before bead I), a stamp's face, a shelf bead (`a'` or `"a⁻¹"` turned over) |
  | `pop top I`, `pinch top I J` | bead I dragged onto bead I + 1; beads I to J pinched |
  | `shelf a' > top I`, `stamp J face F > top I`, `stamp J face F > gap top I` | carried to gap I, onto bead I, onto gap I |

  Each step starts `L8_DO_GAP` hundredths (default 90) after the last
  ends; carries take `L8_DO_MS` (600). `L8_DO_STOP=k` holds step k (from
  1) over its place and stops there (the preview; for a tap, the finger
  stays down: what the move would make shows). A script's gesture is the
  player's: a demo playing stops.
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

By taps, either order (Someone for everyone with its trap, dead end and
undo; a kit tile, with Limits on the map):

```sh
L8_LEVEL=10 L8_DO='open goal; tap token y; tap notch goal; wait; undo; open fact 0; tap notch goal; tap token x; tap token y; tap fact 0' .build/lemma
L8_LEVEL=23 L8_DO='open goal; open goal; open fact 0; tap token ε; tap kit 0; tap fact 0; tap token "ε / 2"' .build/lemma
```

The tile (two turns; a flip then a turn; a flip twice: can't get there),
and beads (pops, a press showing what it would make, a pair out of
nothing and a stamp, the strings turned round, x x out of nothing and a
pinched stretch):

```sh
L8_LEVEL=11 L8_DO='tile; tile' .build/lemma
L8_LEVEL=12 L8_DO='swipe; tile' .build/lemma
L8_LEVEL=11 L8_DO='swipe; swipe' .build/lemma
L8_LEVEL=15 L8_DO='tap bead top 1; tap bead top 2; pop top 0; tap bead bottom 0; tap bead bottom 1' .build/lemma
L8_LEVEL=15 L8_DO='tap bead top 1; tap bead top 2' L8_DO_STOP=2 .build/lemma   # pressed: the card over the shelf
L8_LEVEL=17 L8_DO="tap shelf a'; tap gap top 0; tap bead top 1; tap bead top 2; tap stamp 0 face 0; pop top 0" .build/lemma
L8_LEVEL=18 L8_DO='swipe; tap stamp 0 face 1; tap bead top 0' .build/lemma
L8_LEVEL=20 L8_DO='tap stamp 0 face 1; tap gap bottom 0; tap shelf a; stamp 0 face 1 > gap bottom 4; tap shelf b; pinch bottom 1 4; tap stamp 0 face 0' .build/lemma
L8_LEVEL=17 L8_WATCH=1 L8_WATCH_PACE=60 .build/lemma
```

Someone for everyone: the trap, its dead end, and the way:

```sh
L8_LEVEL=10 L8_BOXES=1 L8_DO="open goal;token y > goal" .build/lemma
L8_LEVEL=10 L8_DO="open goal;token y > goal;undo;open fact 0;token x > goal;token y > fact 0" .build/lemma
L8_LEVEL=10 L8_DO="open goal;open fact 0;token x > goal;token y > fact 0" L8_DO_STOP=4 .build/lemma   # the preview, it would close
```

With Limits on the map: Doubled with the kit (ε onto `□ / 2`, then `ε /
2` into the notch), Only one limit's Suppose not held over the facts, and
Adding limits' trap (`N` alone; `N₁ ≤ n` is a dead end, *Undo 4*):

```sh
L8_LEVEL=23 L8_DO='open goal; open goal; open fact 0; token ε > kit 0; token "ε / 2" > fact 0;
  open fact 2; token N > goal; open goal; token n > fact 2' .build/lemma
L8_LEVEL=25 L8_DO="suppose" L8_DO_STOP=1 .build/lemma
L8_LEVEL=24 L8_DO_GAP=40 L8_DO="$(for i in $(seq 8); do printf 'hint;enter;'; done)token N > goal; open goal; token n > fact 3; token n > fact 4" .build/lemma
```

A name dropped on the fact whose ∃ key is still shut (*Open it first*),
the new fact a notch would give on the card over the board, a key's
name going to the shelf, and the Book's words (a progress file with
`seen word_and` ... lines):

```sh
L8_LEVEL=10 L8_DO="open goal;token y > fact 0" .build/lemma
L8_LEVEL=10 L8_DO="open goal;token y > goal;hint" .build/lemma         # stuck: the finger taps Undo 1 (from ~6.5 s)
L8_LEVEL=5 L8_DO="open goal;fact 0 > goal;fact 0 > goal" .build/lemma # P ⟶ Q gives Q, not R (~7 s)
L8_LEVEL=22 L8_DO="open goal;open goal;open fact 0;token ε > fact 0" L8_DO_STOP=4 .build/lemma  # the band it would give (Limits on)
L8_LEVEL=6 L8_DO="open goal;token y > fact 0" L8_DO_STOP=2 .build/lemma
L8_LEVEL=6 L8_TAPS=63,757 .build/lemma      # the goal's ∀ key: grab frames from 1.75 s on
L8_LEVEL=6 L8_DO="open goal;fact 0 > goal;fact 0 > goal" .build/lemma  # Drop y into ∀ first (~7.5 s)
L8_TAPS=100,170 .build/lemma                # the map: Logic's cover opens its Book
```

Watch, and a demo (a progress file without `seen` lines):

```sh
L8_LEVEL=20 L8_WATCH=1 L8_WATCH_PACE=60 .build/lemma
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
  previews, two taps, sockets, refusals, the swipe, dead ends, the puppet
  finger and ghost hand for hints, Watch and demos, `L8_BOXES`),
  `trial.l8` (what a move made, read off the proof for staging; facts in
  play; Limits' dead ends), `app.l8` (state, moves, demos, Watch),
  `pages.l8`, `picture.l8`, `words.l8` (the words: the Book's pages), `touch.l8`, `main.l8` (`L8_DO` and the other
  hooks); `web/lemma` runs it in a browser.
- `beads.l8` (the engine: strings of beads read off a product, the goal
  kept in order, a stretch exposed, rewritten and put back, pops, pairs,
  stamps, turning round, the tile's walk and its dead end) and
  `beadboard.l8` (Groups' board: beads, stamps, the shelf, the tile, its
  shadow, slots and map, two taps and drags, previews, the ghost hand's
  places, `L8_DO` and `L8_BOXES` for it, the chapter's page and Book);
  `paint.l8`'s `p_quad_xf` draws anything turned, squashed or mirrored.

A region's theorem can be exported (`export_theorem` in moves.l8): the
rules of its rulebook it uses discharged, the symbols it speaks of quantified and its carrier types made
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

A fact onto a fact (forward); long-pressing a part to pull out a copy;
in Groups, a stretch dragged onto a stamp, dead ends among beads, the
map's discoveries kept in the progress file; ∨; keyboard navigation of keys and tiles.

The Foundations region (constructing ℕ, ℤ, ℚ, ℝ and proving each
rulebook is satisfied); Calculate replaying a certificate through the
kernel instead of being trusted; holding a row to preview it; more regions
(topology, linear algebra); a torus.
