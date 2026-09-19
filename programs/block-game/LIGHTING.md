# Scene lighting

The scene uses a fixed directional moon, not a camera-following point light.
Its direction is `(4, 11, 3)`. The cool diffuse light and ambient fill keep
unlit puzzles readable. The orthographic shadow map follows the visible volume
but is snapped to world-space texels; camera movement does not move the moon.

In the editor:

- `l`: low lantern; `Shift+l`: shaded lamp post.
- Space paints; Backspace erases the selected brush. Rectangle painting works.
- Both styles are decorative and non-blocking. They follow room moves/rotations.
- Save normally. Both canonical worlds and standalone levels store
  `lamp <column> <row> <style>` (0 lantern, 1 post), up to 256 fixtures.

Lanterns make six-cell-radius warm pools; posts use eight. The glass is dim
amber, with no bloom or animated flicker. Lamp illumination is deliberately a
soft diffuse field, not a shadow-casting point light: walls do not occlude these
warm pools. Fixtures themselves cast moon shadows. Per-lamp occlusion would be
a separate rendering feature.

The field is a preallocated 512-square luminance texture covering 128 cells,
rebuilt after lamp edits or when the camera crosses its cache margin. Sampling
cost does not depend on the number of fixtures, and overlapping pools saturate
rather than blowing out the scene. `block-game-lighting.l8` owns the field and
fixtures; moon/ambient colors and lamp tint are in the fragment shaders.

Regression tests: `test_lighting.l8`, `test_shadows.l8`, `test_undo_memory.l8`.

## Material response and depth

The main materials now combine a cool upper-hemisphere ambient fill, a dim
earth-colored lower fill, moon diffuse light, and restrained view-dependent
highlights. Stone has broad highlights, dry dirt stays matte, and banks next
to visible water darken and catch more light. Four nearby lanterns/posts supply
directional specular highlights; the cached diffuse field still includes all
fixtures. These highlights share the diffuse lamps' lack of wall occlusion.

Grass has broad patches of height and color variation, subtle blade highlights,
and backlit translucency. The patch value is computed with the existing CPU
instance cache and packed alongside its wind seed, so instance storage does not
grow. A faint distance haze separates distant terrain without obscuring puzzles.

Sand is a paintable base terrain (`z` in the editor). Its warm beige color uses
soft dirt-like variation and fine grain, filtered at distance to prevent
shimmer. Sand darkens along wet banks and supports the independent flagstone
overlay. It stores as `f <column> <row> sand [stone]`; rectangle painting and
erasing work like other ground brushes. Sand does not spawn grass blades.
Dry ground materials blend over a softly irregular band at their boundaries,
using decoded dirt/grass/sand weights. Water cells are excluded from that blend
to keep basin geometry and shoreline color aligned; flagstones remain an
independent overlay on the blended ground.
Wet-bank shading uses distance to nearby water tiles, including diagonal
corners, so dampness remains continuous between adjacent ground tiles.

A 512-square world-space contact texture shades ground and grass roots near
blocks, the player, walls, and fixtures. Its two CPU buffers are preallocated;
the static field is cached, and moving footprints use interpolated positions.
Unchanged frames do not rasterize or upload it. This is an inexpensive ground
contact approximation, not full ambient occlusion: upper stacks use a subtle
material-base darkening rather than a geometry-aware occlusion solution.

Water reflects a fixed procedural evening sky and actual blocks, walls, ramps,
and fixtures through a shared 480×288 planar reflection. The plane matches the
ground surface at y=-0.02. Ripples perturb reflection sampling, with stronger
reflection at grazing angles and an artistic minimum for the elevated camera.
The reflection omits grass, particles, ground, and editor overlays. It renders
only when a water cell is visible and its camera, objects, or lighting changes;
ripples continue animating over a cached reflection. No reflection image is
allocated per frame. Reflection rendering clips geometry below the water plane.

GPU/cache regression coverage: `test_materials.l8`, `test_grass.l8`. Run with
an X11 display, after building with `./l8 build <test> -o .build/<test-name>`.
