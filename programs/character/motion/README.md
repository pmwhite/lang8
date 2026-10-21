# Motion

`run-synth.txt` holds the running back's takes: steady runs at 2.5 to 10 m/s and a burst from
2.2 to 10 m/s. `cycles.txt` holds one stride of the same at every half m/s from 1.5 to 10, which
the viewer steers from (see FORMAT.md, Steering). `moves.txt` holds maneuvers made the same way the
viewer steers: cuts of 45, 60 and 90 degrees, a turn right round, an arc, a stop and a start. All
are generated, not hand-keyed:

    python3 -I programs/character/motion/gen/synth.py programs/character/motion/run-synth.txt
    python3 -I programs/character/motion/gen/cycles.py programs/character/motion/cycles.txt
    python3 -I programs/character/motion/gen/moves.py programs/character/motion/moves.txt

`gen/plan.py` lays a maneuver's steps and `gen/body.py` builds the body over them; steer.l8 does the
same as he goes. `gen/check.py` measures takes (feet sliding, knees, hips, facing, lean), and
`gen/draw.py` draws steps from above.

The scripts read their inputs from `/tmp/chr` (the downloaded datasets are not kept in the
repository): `rbds/` for the running dataset, `mocap/` for CMU's files, `cod/data/` for the
change-of-direction data, `gen/means.pkl` and `gen/cycles.pkl` for the
averaged cycles that `synth.py` builds from them.

## What each part comes from

- **Legs and pelvis, 2.5 to 4.5 m/s**: the mean of 25 runners of the Fukuchi running dataset
  (Fukuchi, Fukuchi and Duarte 2017, PeerJ 5:e3298; figshare 10.6084/m9.figshare.4543435,
  CC BY 4.0), treadmill markers and forces. `gen/rbds.py` fits each runner's segments from the
  markers (hip joint centres by Harrington's method) and finds touchdown and toe-off from the
  force plate; `gen/synth.py` registers the cycles on those events and averages them. All three
  planes are kept: pelvis turn and tilt, where the feet land across, the knees' line.
- **Chest, head and arms**: the mean of CMU Graphics Lab runs (mocap.cs.cmu.edu, NSF
  EIA-0196217), `gen/cmu.py`. The trunk's lean is set from the literature, as the CMU subjects
  lean more than runners do: 8 degrees jogging (Teng and Powers), up to about 12 at full speed.
- **Faster than 4.5 m/s**: the 4.5 m/s cycle reshaped toward sprint values from the literature
  (Nagahara et al. 2014: support distance, support time, step rate; thigh and knee extremes),
  scaled to this figure's legs by Froude number. The hips bounce as in the sine-wave spring-mass
  model (Morin et al. 2005): the ground's push a half sine through support, free fall in flight.
- **Support**: the foot rocks on its heel until flat, then on its ball, the toes lying flat as
  the heel comes up, all on one spot; the leg is solved to that spot, changing the measured bends
  as little as it can. The body slows by up to 8% in each support and gains it back in flight,
  as measured (Cavagna et al.); the treadmill markers show the same shortfall. Sprinters land on
  the ball some 0.3 m ahead of the hips, the knee bent about 25 degrees.
- **Burst**: the same cycles at each moment's speed, the body leaning by atan(a / g).

## Steering by physics

`steering.txt` holds the solved values the viewer steers by (FORMAT.md, Steering). They come from
a physical model of a runner (`gen/solver.py`): a point mass on feet, the ground pushing along the
leg from the foot to his centre of mass, free fall in flight, within human limits (leg reach 1.12
m, grip 1.0 of the push up, a peak push of 4.5 body weights, speed added no faster than
9.5 (1 - v / 10.4) m/s2, a step at least 0.2 s and a swing 0.3 s, a foot at most 0.45 m to the
side). `gen/envelope2.py` maps what one step can do from each speed, height and fall;
`gen/dp2.py` solves, by dynamic programming over (which foot next, speed, angle off the stick,
height, fall), the quickest way to going where the stick points, counting time, effort, every
metre carried off the stick's line (0.4 s), and running low (it is hard work); `export_steer.py`
writes the values. `gen/closed2.py` checks them through the physics, as the viewer runs them.
From top speed a 90-degree turn comes out as braking steps, one plant (at about 3.5 m/s, as
measured cutters plant), and a launch; a 45-degree one as a rounded cut at speed; right round as
a stop, a pivot, and a launch.

The rest of this section is how the earlier, rule-based steering and `moves.txt` were made.

## Changing direction

The steps (gen/plan.py, and steer.l8):

- **Arcs**: the most he can push sideways falls with speed, about 0.9 g at 3 m/s on tight curves
  to 0.4 g near 8 m/s (Chang and Kram 2007, J Exp Biol 210:971; Diaz, Alcantara and Grabowski
  2024, J Exp Biol 227:jeb246649).
- **Cuts**: the speed he can carry into a plant falls with its angle (the angle-velocity
  trade-off, Dos'Santos et al. 2018, Sports Med 48:2235); a 90-degree cut's plant at 3.45 m/s
  from 4.6, mostly braked on the penultimate step (contact 0.20 s), the plant 0.28-0.31 s
  (Dos'Santos et al. 2021, Sports Med 51:1983); a 45-degree cut in one step of about 0.16 s.
  Crossovers on the inside foot for 45 degrees or less. A foot's push along the ground is at
  most 0.7 of the push holding him up, so a plant turns him partway and the steps after finish.
- **Turns right round**: braking over several steps, a long penultimate step (0.38 s) and a pivot
  of 0.48 s, the hips 30-35 cm down (Falch et al. 2020; Harper et al. 2022, Sports Med 52:2321).
- **Braking**: about 3.5 m/s2 near top speed, rising to 7 below 3 m/s (Harper et al. 2022:
  -3.9 early in stopping from a sprint, -6.0 late), the foot landing within the leg's reach.

The body at a plant, from the change-of-direction data of Nitschke et al. 2022 (Zenodo 6949012,
CC BY 4.0: ten athletes' V-cuts, curved and straight runs, markers and force plates;
`gen/cod.py`, `gen/codmk.py` measure them): the plant foot ahead of the hips and only 5-17 cm
out to the side (the leg's line alone would put it two or three times further out, so the
sideways part is scaled to the data); the pelvis turned 45-90 degrees toward the new way by
mid-plant; the trunk leaning toward the cut 10-35 degrees (median 16); the hips about 10 cm
down; the knee from about 20 degrees at touchdown to 55-60.

Video of real players was used only to check the side view, not as a source: one camera cannot
see across, and a tracker's hip points sit at the back of the pelvis.

`gen/stats.py` and `gen/norms.py` measure the dataset's runners in all planes; the viewer's test
(`test_figure.l8`, "routes") measures the figure the same way.
