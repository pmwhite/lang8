# Loose sand

The editor has two independent sand brushes:

- **Z** paints the ground material, with blended borders like dirt and grass.
- **Shift+Z** selects **Loose sand**, a shallow layer resting on top of the ground.
  Space deposits sand; Shift+Space starts a rectangle and Space finishes it.
  Backspace/X removes loose sand without changing the painted ground underneath.
  S saves as usual. New deposits have rounded, irregularly tapered borders and
  raised centers and overlapping rounded heaps, rather than a uniform layer.
  The extra deposited volume can be pushed into larger banks. Repainting a stroke is
  deterministic and does not endlessly add height.

In play, ground-level blocks and the player plow the loose layer into banks at
its front and sides. The displaced amount is conserved; steep banks spill into
nearby cells until their slope is roughly the angle of repose. Cleared paths
expose the underlying surface. Stationary objects do not churn the layer, so
tracks remain. Sand does not change puzzle movement, block support, or gravity.
Plants and walls obstruct the piles, and sand cannot enter water. Painting a
wall or water over loose sand removes it there.

This is a shallow granular height field, not individual grain particles. It has
8 samples per tile. The raised mesh joins sample centers into a continuous
surface, with smoothly shaded slopes and density-based, antialiased edges. Thin
remnants blend into the underlying ground instead of covering opaque squares.
A ragged fringe, small shifts in the outline, and broad surface undulations soften
straight brush/track boundaries. This visual variation stays fixed in world
space and also applies to existing deposits. Lighting follows the slopes of the
rendered relief so the mounds read as raised volume. Repaint older flat deposits
to give them the new brush's fuller mound profile.
Transport uses short sweeps along the animated movement so even a quick block
push cannot skip sand. Motion does not allocate memory. Only disturbed areas
settle; undo/reset does not restore sand, and teleports do not plow a connecting
trail. The sparse field holds 32,768 occupied samples (512 fully covered tiles;
leave some space for spreading). At capacity sand stays in place rather than
being discarded. Empty sample slots are reclaimed during painting and movement.

Editor saves embed `loose <sample-x> <sample-z> <amount>` records in the level or
world. Sample coordinates are in eighths of a tile; amounts are height units of
1/4096 tile. Room movement/rotation and column insertion/deletion carry the
layer with the terrain.

Displacement and tracks last for the current play session only. Quitting does
not save the simulation; the next launch starts from the editor's authored
deposits. No `.sand` companion file is read or written (older files are ignored).
Editor saves still preserve placed sand in the level/world itself; quitting the
editor without S discards edits.

Build and test:

```sh
./l8 build programs/block-game/block-game.l8 -o .build/block-game
./l8 build programs/block-game/test_loose_sand.l8 -o .build/test-loose-sand
.build/test-loose-sand
```

The test requires an X/GL display and covers brush independence, conservative
transport, session tracks, obstructions, room/column transforms, save/load,
empty saves, ignored legacy sidecars, and the raised mesh/shaders. It writes fixtures under `.build/`.
