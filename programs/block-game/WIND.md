# Wind and weather

The scene uses a deterministic, camera-centered horizontal wind field. It moves
grass, rooted trees, and the visible water surface. It does not change collision,
puzzles, or particles. Water responds through bulk surface stress and a finer
ripple simulation.

The weather state is the large-scale driver. It chooses a prevailing direction,
average speed, gust strength, and turbulence from a seeded sequence, then eases
toward each new regime over roughly twenty seconds. Two broad traveling fronts
vary the speed across the world. A smooth curl term adds eddies without creating
local sources or sinks. This produces coherent changes without a full humidity,
temperature, cloud, or precipitation simulation.

Local airflow lives on a 64-by-64 grid centered on the camera. Every 50 ms the
solver:

1. advects the previous velocity field;
2. relaxes it toward the current world-space weather forcing;
3. marks wall cells as solid;
4. projects the field to reduce divergence and route flow around those walls;
5. clamps extreme speeds.

When the camera crosses a cell boundary, overlapping world cells are copied
exactly and only the newly exposed edge is initialized. The field therefore
stays anchored in world space instead of visibly following the camera. A frame
hitch can run at most four catch-up steps. All solver buffers are allocated at
startup, and updates do not allocate.

The CPU field is encoded into a linearly filtered 64-by-64 RGBA texture. Grass,
plant vertex shaders and water compute shaders sample the same texture. A broad visual gust
envelope travels along that flow, leaving a quiet baseline between stronger
fronts, so a single gust can be followed across all three materials. Tree wood
bends gradually from its fixed root, while foliage travels farther and adds
quicker flutter. Water converts the field and gust envelope into physical
surface stress in its height-field solver. Gravity, continuity, and basin edges
turn that stress into slopes and waves while conserving liquid volume.
A separate sixteen-cells-per-block ripple simulation receives a spectrum of
short directional pressure waves. It stores wave height and momentum, reflects
at dry banks, and decays after a gust. Its heights displace the water mesh and
its fine slopes drive reflection normals.
Shader animation time is measured from wind startup rather than absolute system
uptime, preserving frame-scale precision on machines that have run for days.
Vegetation binds wind on texture unit 5 and water binds it on unit 7 immediately
before its simulation passes.

Press `F6` in play or edit mode to show a sparse flow overlay. Orange squares are
sample points; cyan component bars show the local horizontal velocity. `F7` and
`F8` retain their water controls.

`test_wind.l8` checks deterministic evolution, finite bounded velocities, wall
blocking and deflection, camera-window preservation, normalized weather,
long-uptime visual-clock precision, and zero heap growth during updates. Plant
and material GPU tests compile the vertex texture path and exercise texture
creation under an X11 OpenGL context. `test_height_water.l8` verifies that wind
creates water flux and short-wave slopes without changing liquid volume.
It also checks calm water, free propagation near a bank, persistence after wind
stops, damping, dry-cell isolation, and no per-frame allocation.
