# Height-field water

Water now uses a continuous, GPU-simulated surface instead of particle-fluid
reconstruction. An undisturbed pond starts exactly flat. Moving submerged blocks
and the player displace water, producing waves that propagate, reflect off banks,
and damp out. There are no decorative oscillations keeping a still pond moving.

## Painting and game rules

In the editor, **A** selects water, Space paints, Shift+Space paints a rectangle,
and Backspace erases water to dirt. Grass, stone, and dirt replace water.

- The pond bottom is one block below land (logical layer -1). The resting surface
  is just below the bank, at -0.08.
- Unsupported blocks fall to the bottom. A sunk cube's top is at ground level,
  so the player can walk onto it from the bank or another stepping stone.
- Without a block underneath, the player falls into the pond and wades normally
  along the bottom. There is no swimming, drowning, or automatic bank climbing.
- A correctly oriented ramp is required to climb from the bottom onto the bank
  or a submerged block. Existing ramp mounting and pushing rules still apply.
- Linked shapes retain their identity and room ownership. Unsupported members
  and their stacks settle using the existing puzzle gravity rules.
- Undo and room rewind preserve below-ground positions without enlarging the
  packed pose payload. Save/load supports layer -1 in both levels and worlds.
- Painting water beneath objects settles them. Filling an occupied pond cell
  raises its column onto land; filling is refused if it would exceed the maximum
  stack height. The editor can erase submerged cubes and ramps.

Water saves as `f <column> <row> water` and follows room moves and rotations.
Automatic room starts avoid water. Existing worlds are not edited automatically.

## Try it

```sh
./l8 build programs/block-game/block-game.l8 -o .build/block-game
./l8 build programs/block-game/test_water.l8 -o .build/test-water
.build/test-water
.build/block-game play .build/water-interaction-demo.txt
```

In the interaction fixture, press Right three times: push the cube into the
pond, step onto it, then step off into the water. Down twice and Left twice
mounts the submerged ramp and exits onto land. Backspace undoes each action.
The test also generates small, 24-, 64-, 128-, and 256-cell pond fixtures;
`.build/water-256-demo.txt` contains a fully simulated 16-by-16 pond.

- **F7:** toggle simulation; disabled water is flat but keeps the visible basin
  and translucent surface. Resident simulation state is retained.
- **F8:** generate a ripple near the player/editor cursor; enables simulation.
- **F3:** frame-duration/FPS charts. **V:** vsync toggle.
- `L8_WATER_STATIC=1`: start with simulation disabled.
- `L8_WATER_SPLASH=1`: disturb each newly initialized resident basin.
- `L8_WATER_STRESS=1`: generate an impulse every half-second of simulated time.
- `L8_WATER_STATS=1`: log resident tiles, interacting bodies, simulation steps,
  and dropped catch-up time every 120 active water frames.

## Solver and rendering

A persistent 32-by-32-tile window contains eight-by-eight simulation samples per
tile: a 256-by-256 height/flux grid. All painted water in that window is simulated,
including offscreen parts of a visible pond. There is no separate 256-tile cap;
256 tiles is the tested large-pond fixture, not the grid's maximum capacity.

Each fixed 1/120-second step updates solid displacement, accelerates horizontal
flux from surface-height differences and available depth, then updates elevation
from flux divergence. Dry edges have no outward flux. Damping removes motion.
The two state buffers occupy 2 MiB total; an R32F occupancy target adds 256 KiB.
Small masks/body lists and a retained 1 MiB initialization array are also
preallocated. There is no runtime particle storage, surface extraction, fullscreen
reconstruction filtering, GPU readback, or per-frame application heap allocation.

Animated cubes, ramps, and the player rasterize submerged volume into the
occupancy target. Differences in occupancy move water out of entering bodies and
back into vacated space. Ramps use wedge volume; cubes/player use approximate
box footprints. This is one-way coupling: puzzle gravity determines object
motion; water does not exert buoyancy or move puzzle pieces.

The renderer directly draws a continuous mesh from the height grid, with averaged
vertex elevations and smooth gradient normals. It draws the basin floor and
exposed banks, then translucent water over submerged objects. Moonlight, warm
lamp highlights, Fresnel sky reflection, and the cached scene-reflection target
remain in use. The reflection omits grass, ground, and editor overlays, as before.

OpenGL 4.3 and at least three vertex-stage storage-buffer bindings are required.
Unsupported hardware uses the older static reflective terrain fallback. That
fallback does not render the cut-out underwater basin.

## Bounds and tradeoffs

- This is a height-field fluid, not volumetric particle fluid. It cannot form
  detached droplets, overhangs, or breaking waves. It is intended for ponds.
- Banks are closed boundaries; shore spray and flowing water over land are not
  simulated. Extreme elevation/velocity clamps prevent unstable forcing, but
  are not a conservative overflow/spill model. Ordinary block entry/removal is
  checked for volume conservation.
- Water settles toward a level surface appropriate to the displaced volume,
  which can be above its initial height. Static objects present at initialization
  start with flat water, without a startup splash.
- Body volume approximates bevels and tilted cargo. Small ripples are limited
  by the eight-samples-per-tile grid, not individual visible particles.
- Up to 16 fixed steps run per frame. Catch-up debt is retained up to 250 ms;
  excess after a long stall is discarded and reported. Offscreen water pauses
  without catch-up bursts. There is no per-pond sleeping optimization yet.
- Panning over dry land and F7 preserve resident state. Moving to water outside
  the window or changing water terrain reinitializes the resident grid. Water
  outside that window uses static reflective terrain.
- Fluid state itself is not added to undo history. Undo restores gameplay
  positions and the water reacts to the resulting animated displacement.

The older CPU/GPU particle experiments and their tests remain as reference
modules, but the main game no longer allocates or runs those simulations.

## Performance and verification

On the Intel UHD 620 / Mesa development machine, the 256-tile stress fixture
measured **14.7 ms mean**, **16.7 ms p95**, **17.7 ms maximum** synchronized
whole-frame work, with no dropped simulation time. The previous particle
experiment measured roughly 22–30 ms depending on reconstruction settings.
These are local measurements, not a frame-rate guarantee; camera coverage,
other GPU workloads, and hardware affect results.

The diagnostic helper disables vsync, finishes pending GPU work, warms up for
80 frames, measures 240 frames, and exits its own game process:

```sh
cc -shared -fPIC -O2 programs/block-game/water-frame-probe.c -o .build/water-frame-probe.so -ldl
L8_WATER_STATS=1 L8_WATER_STRESS=1 LD_PRELOAD="$PWD/.build/water-frame-probe.so" .build/block-game play .build/water-256-demo.txt
```

Run benchmarks sequentially. Use F3 for normal presented-frame durations.

`test_height_water.l8` checks exact unforced flatness, all 256 resident pond tiles,
block displacement and volume recovery, wave propagation beyond the impact,
player and ramp submerged volumes, toggling, no application heap growth, and GL
errors. GPU readback is test-only. `test_water.l8` covers editing, signed-layer
save/load, linked/stacked sinking, stepping stones, bottom movement, blocked bank
exits, and the complete ramp-exit sequence. `test_undo_memory.l8` checks repeated
water-entry/undo restoration without allocation growth. Existing particle,
material, grass, lighting, shadow, held-movement, and frame-time regressions are
also retained.
