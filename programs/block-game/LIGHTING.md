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
