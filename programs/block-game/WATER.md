# Water

In the editor, press `a` to select water, then Space to paint. Shift+Space
paints a rectangle, and Backspace erases water to dirt. Dirt, grass, or
flagstone can replace water. Water replaces both grass and flagstone in a cell.

Water blocks the player at every height and blocks pushed pieces, including
all linked and stacked pieces. It is decorative impassable terrain: there is
no swimming, sinking, or bridge mechanic. Automatic room reset positions
avoid water. As with walls, place explicit starts and puzzle objects on land.

Water saves as `f <column> <row> water` in levels and worlds. It follows room
moves and rotations and uses the existing ground capacity (8192 painted cells).
No existing world is changed automatically.

The ground shader draws muted teal water, a soft shallow shoreline, and slow
world-space ripples lit by the existing moon and lamps. Adjacent cells share a
continuous surface. Water reflects a procedural evening sky plus blocks, walls,
ramps, and lamps through a cached 480×288 reflection target. The extra scene
draw is skipped when water is offscreen or the reflected scene is unchanged.
Grass, particles, ground, and editor overlays are omitted from that reflection.
See `LIGHTING.md` for material and contact-shading details.

Tests: `test_water.l8` covers editing, storage, transforms, collisions, and
terrain masks; `test_undo_memory.l8` covers blocked pushes and undo near water.
