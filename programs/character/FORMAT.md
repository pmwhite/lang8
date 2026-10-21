# Figures as text

A figure is one text file: its materials, its skeleton, the layers of shapes
that make its surfaces, the stickers on them, its poses, its animations, and
how it goes over the ground.
The viewer (`main.l8`, and `web/character` round it) reads the file, bakes each
layer into a mesh, and shows it. [`running-back.txt`](running-back.txt) is a
whole figure to read alongside this.

```sh
make character
.build/character                      # programs/character/running-back.txt
.build/character my-figure.txt
```

## The text

One statement to a line; `#` starts a comment; words are separated by spaces.
Lengths are metres, angles degrees. Everything is placed in the **rest pose**:
y up, the figure facing +z, its left side at +x, the ground at y = 0.

A line that starts a block (`layer`, `sticker`, `pose`, `anim`) owns the lines
after it, up to the next such line. Indenting is only for the reader.

**Sides.** A bone named `thigh.l` gets a mirrored twin `thigh.r`. A shape on a
`.l` bone is made again, mirrored, on the `.r` bone; so is a sticker named
`.l`. A pose line can name a pair without its side (`turn thigh -40 0 0`) to
move both sides, the right mirrored.

```
figure Running back         # its name
use motion/cmu-run.txt      # another file's lines, read after these (beside this one)
cell 0.006                  # the mesh's cell, unless a layer says its own
```

## Materials

```
material NAME  r g b  [FINISH]
```

A color (0 to 1) and how it takes the light: `matte` (the default), `skin`,
`cloth`, `gloss`, `metal`, `leather`, or `rubber`.

## Skeleton

```
bone NAME PARENT  x y z  [hinge ax ay az]
```

A joint, where it is at rest, and the bone it hangs from (`-` for the first,
the root). A `hinge` is the axis its `bend` turns about, by the right-hand rule:
an elbow, a knee, a knuckle. There can be 48 bones.

## Layers

```
layer NAME MATERIAL [cell c] [blend k] [skin s] [bind BONE] [hidden]
```

A layer is one surface: a body, a shirt, a helmet. Its lines are worked through
in order, each changing the solid made so far.

| Option | Meaning |
|---|---|
| `cell c` | The size of its mesh's cells. Thin things need small ones. |
| `blend k` | The blend its shapes get unless they say (0.02). |
| `skin s` | How far apart two shapes' surfaces can be and still share a vertex between their bones (0.04). |
| `bind BONE` | The whole layer moves with one bone: a helmet, a ball. |
| `hidden` | Not drawn: only for other layers to `grow`, `clip`, and `carve` with. |

### Shapes

```
ball BONE  x y z  r                          [options]
cone BONE  x y z  r   x y z  r               [options]
egg  BONE  x y z  rx ry rz                   [options]
box  BONE  x y z  hx hy hz                   [options]
```

A `cone` runs between two balls of different sizes: a limb, a muscle, a bar.
An `egg` is an ellipsoid; a `box` is given by its half sizes. Each shape moves
with its bone.

| Option | Meaning |
|---|---|
| `blend k` | How wide a fillet joins it to what is there. 0 leaves a crease. |
| `cut` | Take it away from the solid, instead of adding it. |
| `keep` | Keep only what is inside it. |
| `mat M` | Its own material, where it is the surface. |
| `to BONE` | A cone's second end moves with another bone, the skin between shared. |
| `flat f [ax ay az]` | A cone squashed to `f` of its thickness along an axis (z unless given). |
| `turn rx ry rz` | An egg or box turned about y, then z, then x. |
| `round r` | A box's edges rounded. |
| `both` | On a middle bone: made again mirrored. |

Shapes join by a smooth minimum of their distance fields, so a chain of cones
blends into a limb with no seams. The order matters only for `cut` and `keep`:
a shape after a cut is not cut by it.

```
part NAME
```

names the shapes that follow, so the viewer can pick them out.

### Layers made from layers

```
grow  LAYER t        # add LAYER's solid, t thicker all round
clip  LAYER          # keep only what is inside LAYER
carve LAYER [t]      # take LAYER (grown by t) away
fine  LAYER c        # inside LAYER, mesh this layer with cell c instead
```

Clothing is the body grown and clipped: a sock is `grow body 0.003` then `clip`
to a hidden layer holding a box round the shins. It fits, whatever the body's
shape, and takes its vertices' bones from the body under it. Shapes of its own
(pads, soles) join it like any others.

A layer may only use layers written before it.

Where one layer lies just inside another that is showing (skin under cloth), it
is not drawn; hide the outer layer and it is.

## Stickers

```
sticker NAME LAYER  x y z  fx fy fz  width height [depth d] [roll deg]
```

A flat picture projected onto a layer: centered at a point near the surface,
facing a direction, reaching `depth` (0.06) to either side of that point. It
moves with the surface it lies on. Its marks are drawn in order, in metres from
its middle, x to the right and y up as read from in front:

```
disc   x y  r        MATERIAL
oval   x y  rx ry    MATERIAL
line   x0 y0 x1 y1 w MATERIAL
rect   x0 y0 x1 y1   MATERIAL [round r]
digits TEXT  x y  h  MATERIAL [edge MATERIAL w]
```

There can be 32 stickers, each drawn at 256 by 256.

## Poses

```
pose NAME
```

A pose changes the rest pose, line by line:

| Line | Meaning |
|---|---|
| `turn BONE rx ry rz` | Turn the bone in its parent's frame: about y first, then z, then x. Right-handed, so `turn chest 15 0 0` leans it forward and a hanging limb swings back with +x. |
| `bend BONE deg` | Turn it about its hinge. |
| `curl BONE amount` | Bend every hinge below it: a hand's fingers, 0 to 1. |
| `move BONE dx dy dz` | Shift it from where it rests. |
| `reach BONE x y z [pole px py pz] [on BONE]` | Turn the two bones above it so its joint comes to the point: a hand or a foot. The middle joint bends toward the pole, or the way its hinge bends. With `on`, the points are given in the rest pose and ride on that bone: a hand at a spot on the chest, wherever the chest is. |
| `level BONE` | Hold it upright: a foot flat on the ground. |
| `like POSE [mirror]` | Start from another pose, or its mirror image. |
| `hide LAYER` | Do not draw a layer in this pose. |

Turns, bends, and moves are made first, then reaches and levels in the order
written. The viewer stands every pose on the ground.

## Animations

```
anim NAME seconds
  key SHARE POSE [mirror]
```

A loop of that many seconds through its keys, each a pose at a share (0 to 1)
of the loop. Between keys the bones follow a smooth curve.

## Gaits

Poses and animations are drawn by hand, one stride at a time. A gait is not: it
says how the figure carries itself over the ground, and the viewer works out
every frame's pose from where the figure is going. One gait runs straight, runs
sideways, cuts, and spins.

```
gait NAME
  like  POSE              # the pose for all the gait does not move (the arms, say)
  root  BONE              # the hips
  spine BONE [BONE]       # the back and chest: they lean, and turn against the hips
  head  BONE
  feet  PAIR [PAIR]       # the feet, and their toes: named without a side
  arm   UPPER FOREARM     # an arm that swings (once for each that does)
  match TAKE ...           # takes of motion to go over the ground with (see Matching)
  cycles TAKE ...          # one-stride takes at a range of speeds, to steer from (see Steering)
  keys  CHOP PLANT DRIVE PIVOT READY  # key poses for steering, each with the right foot down
  hold  BONE ...            # bones kept as the `like` pose has them (the arm with the ball)
```

and then any of its numbers, each with a default:

| Line | Meaning |
|---|---|
| `cadence a b most least` | Steps a second: `a`, and `b` more for each m/s, to at most, and never fewer than `least`: a slow run is long slow steps, not short quick ones. |
| `straight k` | How near to straight a leg gets (1: quite straight). A runner's never quite does. |
| `contact a b least` | The share of a stride each foot is down, the same way. Under a half, there is a moment both feet are in the air. |
| `width w` | How far to its side of his middle a foot lands. |
| `plant k` | How far ahead of him a foot lands, as a share of the ground he covers over it. |
| `catch k` | How far out a foot lands against a push, in metres per m/s2: what makes a cut plant wide. |
| `kick a b most` | How high the ankle comes up behind, as `cadence`. |
| `bounce h` | How far the hips rise and fall with each step. |
| `sink a b` | How far the hips ride below standing: `a`, and `b` per m/s. |
| `crouch k` | And further for each m/s2 he pushes. |
| `lean a b most` | Degrees he leans forward, as `cadence`. |
| `drive k` | How much he leans into speeding up. Slowing, he sits back only a quarter as far: he brakes with his legs. |
| `bank d` | Degrees his trunk leans into a turn, for each m/s2. It is small: turning, the legs lean under him and the trunk hardly does. |
| `twist d`, `counter k` | Degrees the hips turn with the legs; and how far the chest turns back, in twists. |
| `roll d` | Degrees the hips drop on the side of the foot in the air. |
| `pump f b` | Degrees an arm swings forward and back. |
| `elbow f b` | Degrees its elbow is bent at the front of its swing, and at the back, where it opens. |
| `spread f b` | Degrees it hangs out from his side, at the front and at the back (less than 0: across him). |
| `cross d` | Degrees it turns in at the front: the hand comes up to his face. |
| `hunch k` | How much more than the hips the chest leans. |
| `sway d` | Degrees the chest tips over the foot that is down. |
| `toes a b c` | Degrees the heel is up as a foot lands, in the middle of its time down, and as it leaves. A runner is on the balls of his feet; only standing is he flat on them. |
| `top v` | His top speed, m/s. He speeds up hardest from slow, and less the nearer he is to it. |
| `quick k` | Steps a second more for each m/s2 he is speeding up: a burst is short quick steps that lengthen. |
| `grip a` | The hardest he can push sideways, m/s2: how much a corner slows him. |
| `burst a`, `brake a` | How fast he can speed up and slow down, m/s2. |
| `sole h` | What a shoe's sole adds under the ankle. |

A foot that is down stays exactly where it was put, and rolls up onto its toe as
the body leaves it; the legs reach from the hips to the ankles, as a pose's
`reach` does.

### Matching

A gait that names takes with `match` does not work its pose out by the rules
above: it plays real motion. Those takes must say where the figure was in each
frame (see Takes). A few times a second the viewer looks through every frame of
them for the one whose next half second goes where the route goes (three
points ahead, and which way he faces at each) and whose feet are placed and
moving most as his are now, and that is not too far from his speed. If it is
clearly better than what is playing, the motion goes over to it, the difference
dying away over a third of a second. The take is played faster or slower to
cover his ground, and turned to go his way; a foot the take has down is pinned
where it came down, the leg reaching to it.

The rule-based numbers above still set how fast he may go round a corner and
speed up (`grip`, `burst`, `brake`, `top`).

## Routes

```
route NAME GAIT [steered]
  from x z
  to   x z [speed v] [corner r] [spin deg] [face deg | face path]
```

A `steered` route has no points: the viewer drives it (W A S D or the arrows,
Shift to jog; on a touch screen a finger on the left of the picture is a stick,
pushed half over to jog and right over to run flat out), the way relative to
the camera. See Steering.

A path over a field (x to his left, z ahead up the field, as he stands at rest;
the field's lines are fixed, every five yards, so he is seen to cover ground), run in a
gait, round and round: each time round starts where the last ended, heading as
it ended, so a route that ends heading the way it began goes on for ever.

For the leg that arrives at each `to`: `speed` is how fast he would like to go
(the gait's grip, burst, and brake decide how fast he can); `corner` is how
wide the corner at that point is, and a tight one makes him slow, plant, and
push off; `spin` turns him that many degrees more as he covers the leg; `face`
has him face a fixed heading (0 is the way the route began) while he goes
another way, where `face path`, the default, faces the way he goes.

### Steering

A route that is `steered` (see Routes) is driven by the viewer. His body is
moved by physics: he is a point (his centre of mass) on feet, and while a
foot is down the ground pushes along the leg, from the foot to him (a half
sine up through the contact, leaning to its start or end), so he can never
push in a way that would topple him; in the air he falls. As each foot lands
the viewer chooses the next step: where the foot goes, how long it is down,
how hard it pushes and how its push leans. It tries some hundreds of steps,
each run through the physics within his limits (the leg's reach, grip,
the hardest push, how fast he can add speed, how quickly a leg can swing
through, how far out a foot can go), and keeps the one that leaves him best
placed: its own time and how far it carries him off the line the stick
points along, plus the time on from where it leaves him to going that way,
read from the gait's `steering` values. Those were solved beforehand
(motion/gen/dp2.py) for every speed, angle off the stick, height, fall and
which foot is next, so the step chosen sees the whole move ahead: braking
steps, one plant, a launch, as the physics makes quickest; arcs and rounded
cuts for small turns.

```
steering GAIT
  targets v ...      # the stick speeds solved for (0: stopping)
  speeds v ...       # his speed as a foot lands
  heights y ...      # his centre of mass's height then
  falls vy ...       # and how fast it is falling
  angles N STEP      # how far round the stick's way is, every STEP degrees
  drift SECONDS      # what a metre off the stick's line costs
  value t ...        # N solved times, for each target, foot (outside of the
                     # turn, then inside), speed, height, and fall in turn
```

The gait's `cycles` say how his body moves over the steps: each a take of one
stride (the right foot landing at its first frame), its root going over the
ground at that cycle's speed. His body is the cycles', at his speed and the
point of the stride his steps are at, its centre of mass put where the
physics has it; the foot down held on its spot, the foot in the air carried
to where it lands.

The gait's `keys` are poses struck by hand for what the cycles cannot show:
braking chop steps, a cut's plant, driving out of a cut or turn, a turn's
pivot, and standing ready. Each is written with the right foot down (the
cut to his left, the turn to his right); for the left foot it is mirrored,
all but the arms, since the ball stays in its arm. Through each such step his
trunk, head, arms, the height of his hips, the free leg, and the way the
planted knee points move to the key and back: from just before the foot lands,
fully by a third of its contact, and away as it leaves.

## Takes

```
take NAME GAIT frames-a-second
  like  POSE          # the pose for what it does not move (fingers, what is hidden)
  hands PAIR          # the hands: the arms are the two bones above each
  at  ...48 numbers   # one line for each frame
```

A take is a real movement, followed frame by frame from footage: where a gait
works a pose out, a take replays one that was seen. Each frame is sixteen
directions as the camera saw them (x to the picture's right, y up, z toward the
camera): the hips' left and up, the chest's left and up, the head's left and
where its nose points; each upper arm and forearm, left then right; each thigh
and shin; and each foot from heel to toe. The figure's bones are turned to
match, taking the gait's `root`, `spine`, `head`, and `feet`, so it strikes the
pose with its own proportions; and since the directions are the camera's, a
viewer looking straight at it sees what the camera saw.

Takes are made outside this program: from a clip, by a pose tracker; or from
motion capture. A frame may go on past its 48 directions with six numbers more:
where the root (the hips) is, x y z in metres with y its height over the
ground, the way it faces (radians, 0 = +z), and whether the left and right feet
are down (1 or 0). A take whose frames have them can be matched by a gait. One
without plays in place, stood on the ground.

`motion/cmu-run.txt` is 21 trials of the CMU Graphics Lab Motion Capture
Database (mocap.cs.cmu.edu; made with funding from NSF EIA-0196217), each also
mirrored, scaled to this figure's legs: runs, veers, turns, side steps, a stop,
a start, a figure of eight, and spin moves. `motion/footage.txt` is a sprint
followed from broadcast footage of the NFL Combine.

## How a figure is baked

Each layer's field is sampled on a grid in the rest pose, only near its surface,
and meshed by surface nets (`bake.l8`). Each vertex takes up to four bones and
their weights from the shapes that make the surface there, its color from their
materials, and a shading for how closed in it is. The vertex shader then moves
it by its bones' matrices (`pose.l8`, `render.l8`), so a pose or an animation
costs nothing more to show.
