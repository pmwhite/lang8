# Climbable groves

Trees and shrubs are rooted, solid scenery. Their trunks block movement and
their foliage supports the player, ramps, cubes, and linked shapes. Build ramp
routes onto crowns, connect neighboring trees, or use the ground beneath the
outer branches as another route through a puzzle.

| Editor key | Plant | Height | Walkable crown |
| --- | --- | --- | --- |
| H | Hedge shrub | 1 | One cell; paint a row to make a hedge |
| T | Young oak | 2 | Five cells in a cross |
| Shift+T | Broad oak | 3 | Nine cells in a 3×3 square |
| Y | Birch | 3 | One cell, with pale striped bark and light foliage |
| K | Pine | 3 | Four surrounding ledges at height 2 and a central top at 3 |

Keys are case-insensitive except Shift+T. Space places the selected plant;
Shift+Space paints a rectangle and Backspace erases. These brushes also appear
in the expanded palette. The selected plant's name appears above the palette.
The existing I key still inserts a column in the standalone level editor.

A trunk occupies its central grid cell. Canopy cells occupy only their stated
height, leaving space underneath the oak's outer branches. Invisible walkable
support stays level and at exact block heights, while the visible crown is
irregular foliage. There are no drawn canopy tiles or platform caps: climbing
is something to discover, rather than the tree's advertised shape. Feet and
cargo can nestle into the leaves. An unobstructed crown cell is a normal flat
support, so ramp climbing and pushing cargo use the existing movement rules.

Plants cannot be pushed and are excluded from room rewind. Walking on them is
recorded in the usual undo log. A small stippled cutaway opens through foliage
between the camera and player; shadows and reflections retain the whole tree.
Starts placed in a trunk cell resolve to its top. Starts under an outer crown
remain on the ground.

## Editor and persistence

Plants require dry soil beneath the trunk. Their crowns can overhang water.
Placement checks the entire solid volume, so crowns cannot intersect blocks,
ramps, or other trees at the same height. Different canopy heights can overlap
horizontally. Painting water beneath an existing trunk is refused.

Repainting a root changes species if the new volume fits. Repainting a neighboring
canopy cell does not move the tree. With a plant brush, erasing any of a tree's
canopy cells removes the whole plant and settles the cargo it supported. Ordinary
block/ramp erasers preserve vegetation. Rectangle painting skips placements that
would intersect earlier plants, creating naturally spaced groves.

Plants follow their roots when rooms move or rotate. Species and appearance stay
stable after transforms and save/load. Files store one object per plant:

```
v <column> <row> <species 0..4> <variant 0..3>
```

Species follow the table order. Variants are seeded from placement coordinates
and stored explicitly. The shared world object limit is 2,048, including movable
blocks and plants. Animation history and player motion storage use that full
capacity, with a separate slot for the player.

## Rendering and cost

Oaks have crooked, tapering forks, buttress roots and overlapping leafy crowns.
Birches have slender pale branches, irregular dark bark marks and smaller airy
leaf sprays. Pines use a continuous leader and tapered whorls of toothed needle
sprays, rather than round foliage clusters. Seeded branch lengths, angles,
heights and gaps break up radial symmetry, and the leader leans slightly.
This variation is baked into the same four pine meshes; collision is unchanged.
Shrubs have branching stems under
rounded leafy growth. Individual opaque leaf polygons break up the silhouettes;
smaller interior masses keep crowns full without large exposed smooth blobs.
The palette and placement cursor draw the actual tree meshes.

Twenty procedural meshes (five species, four variants) are built once at startup.
Instanced batches reuse them, rebuilding instance data only after visible plants
or their properties change. Plants use opaque geometry, moon shadows, warm lamp
lighting, contact shading at their roots, and cached water reflections. Small
foliage motion is omitted from reflection-cache invalidation.

Geometry storage is a fixed 11.44 MiB GPU buffer; maximum instance storage is
32 KiB on each of the CPU and GPU. Mesh generation uses temporary startup memory.
The additional animation capacity adds about 448 KiB of persistent CPU history
plus small motion arrays. There is no application heap allocation during plant
rendering or gameplay/undo updates. At most 20 plant batches are drawn per pass,
and empty/offscreen groups are skipped. This is camera-dependent culling, not a
promise that all 2,048 trees can be shown cheaply at once. There is no distant
impostor or lower-detail mesh system yet.

On the Intel UHD 620 / Mesa development machine, a sequential comparison of the
grove fixture measured 13.4 ms mean / 15.2 ms p95 for the previous tile-like trees
and 12.2 ms mean / 13.3 ms p95 for the revised trees. Extra geometry replaces the
old per-fragment foliage noise; this sample indicates comparable frame cost,
not a guaranteed speedup. These are whole-scene measurements at the normal play
camera, not isolated vegetation costs or measurements with every tree visible.
The frame probe disables vsync, warms up for 80 frames, and samples 240 frames.
The revised 2,048-plant fixture measured 17.5 ms mean / 19.7 ms p95 with offscreen
plants culled; it does not display every tree at once.

## Try the canopy route

```sh
./l8 build programs/block-game/block-game.l8 -o .build/block-game
.build/block-game play programs/block-game/grove-demo.txt
```

Move Right seven times to climb from the ground, over the shrub and young oak,
and across the broad oak. Backspace walks the action history back. The demo also
contains a birch grove, pines, a hedge, lanterns, and a pond. It does not change
the main world.

`test_plants.l8` covers solid volumes, headroom, immovable roots, cargo support,
placement/erasure, starts, level/world round trips, room transforms, and the full
climbing route. `test_plant_render.l8` checks mesh heights, finite geometry, non-platform crowns,
batch invalidation/culling, all 2,048 instance slots, allocation stability, and
OpenGL errors. `test_undo_memory.l8` checks canopy climbing/undo and movement at
the full object capacity. It also generates `.build/plants-capacity-demo.txt`
for a large-world smoke test.
