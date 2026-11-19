# Tumbledown

The block guy (`programs/blockguy`) runs down a causeway of basalt pillars
into the sea and jumps the gaps between them. It is the skate game on foot: the same thumbs, and
the same rules for tricks.

## Playing

```
make tumbledown && .build/tumbledown
make tumbledown-web     # the site, with the page: .build/web/tumbledown/
```

He stands at the top until moved. The arrows (or WASD) move him, up being
the way the camera looks: he turns toward where they point, quickly when
slow, and runs (3.4 m/s on a shelf, faster down a ramp); let go, he slows
to a stop and stands. Space is the trick pad: held, he gathers (runs lower), and each
arrow pressed while it is held adds a turn (up a front flip, down a back
flip, a side a half turn); let go, he jumps into the trick. Within 0.7 m of
a lip the jump is a kick-off, higher and further; run off a lip without it
and he drops, and a let go just after still kicks. Held in the air (or X)
he tucks, and turns faster. Flips and spins turn about him, whichever way
the camera looks. R starts over; Escape quits. On a phone the left half
of the screen is a stick: a thumb down anywhere there takes hold of the
knob, and sliding it pulls him that way, a little to walk, half way to
jog, all the way to run; let go, the knob springs back and he stops. The
right half is the trick pad: press, slide to choose, let go to jump
(skate's `touch.l8`; the stick and pads drawn by the game: see `hud.l8`).

The hill is a causeway of rock going down to the sea, in rows 5-9 m long:
each row three to five pillars across, 3-5 m wide and each a little
higher or lower than its neighbour, standing up out of the sea. Most rows
(85%) are across a gap 1-1.8 m wide from the last, a slot down to the
water (every gap can be cleared by running off it); the rest drop onto
the next. The tops are basalt columns, hexagons drawn by the shader, a
fifth of them under turf; where a row drops, its edge is broken into
columns stepping down. The sea is on the right, past a low wall of
columns; thin sea stacks stand off the coast; the grassy hillside rises
on the left. Three or four times down the hill a tower stands 2.5 m over
its row at the sea's side, come to up a ramp, over a 5-6 m drop onto a
wide landing (the row before it falls toward the tower's side, so that he
can get across to the ramp). The last row is a headland, and the run ends
with a dive off its 8 m cliff into the sea. Come down in a gap's water,
and he is on the next row at once, slowed.

A trick he lands upright and finished scores (skate's points, the tuck in
the grab's place); so do a clean landing from a drop of a metre or more
(60 a metre) and clearing a gap (250). Landing crooked is a stumble and
scores nothing. Down a drop of 2.3 m or more he lands deep, slowed for a
moment; of 3 m or more he rolls, head over heels, and runs on. He never
falls, nor stops. Into the sea, the trick scores if it is done (else a
splash) and the dive scores as a drop. Let go of the pad a moment late, off
an edge, and he does as much of the trick as the air allows, or nothing;
a press in the air, or just after landing, is a tuck's, and never a jump.
The run ends in the sea, about 65 s down.

The camera follows behind him, 7 m back and 2.8 m up, and turns round
after the way he faces, about 0.7 s behind, never snapping. He is a sixth
of a phone's height (a fifth on a wide screen), and stays that size.
Coming to a lip it rises and tips down toward the row he will land on
(sooner and higher before a big drop), the horizon at least 12% down on a
phone (8% on a wide screen) unless that would put his feet out of the
picture: his feet first. It never goes into the hill, nor lets it hide him
(it rises first, then comes in toward him), never looks down more than 45
degrees, and never lurches. Off the last cliff it goes, over 0.4 s, to a
fixed view from the sea at his side, looking at where he will go in; the
splash is held a second before the score.

## Files

- `hill.l8`: the hill laid out from a seed (rows of blocks, gaps, towers,
  ramps, banks, the meadows), its heights, and its meshes.
- `runner.l8`: running, steering, jumping, the air, landing.
- `score.l8`: what scores.
- `gait.l8`: his motion, as a blockguy pose each frame: the run cycle with
  planted feet, the air's poses, landings, the roll and the stumble.
- `pilot.l8`: a run played by itself (`L8_AUTO`), for looking at.
- `stage.l8`: the stage (`L8_STAGE=run`, ...), him alone on ruled ground.
- `render.l8`, `hud.l8`, `main.l8`: drawing, writing over it, the window.

`main.l8` lists the `L8_` variables for looking at the game (`L8_SEED`,
`L8_AUTO`, `L8_FREEZE`, `L8_LOOK`, `L8_STAGE`, `L8_TOUCH`, `L8_SIZE`,
`L8_SOLE`, `L8_UNCAPPED`, `L8_TRACE`).

## Known duplication

Imported from the skate game unchanged: `math.l8`, `font.l8`, `paint.l8`,
`touch.l8`, and `mover.l8` (for its `Keys`). `touch.l8` and `paint.l8`
read a few of skate's names (`screen_w`, `screen_h`, `hud_touch`,
`frost_live`, `mini`); this game defines them, tagged `skate` as well.

Copied from `programs/skate` and trimmed, because there they are tied to
skate's game state; each should become shared when the two games settle:

- `render.l8`: the world's, shadows' and sky's shaders, cut down to one day
  look (no lamps, night, looks, grass tufts, glows, frosted glass or small
  drawing), and with stone faces; the painting shaders unchanged; the GL
  helpers (`compile_shader`, `link_program`, `with_prelude`,
  `require_whole`, `upload`, `bind_vertices`), the noise and font textures,
  the paint index, `fit_shadow`, `draw_paint` and `with_guy` (here
  `with_guy_defines`: the figure's numbers come from blockguy's
  `guy_glsl_defines`) (from `render.l8`).
- `runner.l8`: the trick rules (`start_trick`, `trick_fit`,
  `trick_turned`, `predict_air`, the aim from the pad) and keeping to the
  ground (from `slope.l8`).
- `score.l8`: the flip and spin points, the air's time factor and halving a
  repeated trick (from `judge.l8`).
- `hud.l8`: writing with a halo, trick names, putting a place on the
  screen, the thumb's dot and the trick pad's rings (from `hud.l8`).
- `hill.l8`: the banks' rise (`course_bank`, in `course.l8`).
- `main.l8`: the X11 window, the keys, the lens and picture shift for tall
  windows, the chase camera's measures (from `main.l8`); the guy's
  material codes `MAT_SOFT` and `MAT_BODY` (`mesh.l8`). The `L8_`
  variables are read with `programs/env`, as skate's are.
- `gait.l8` (builder 1's): `DEG` (skate's `moves.l8`; blockguy's
  `DEGREE`), and the landing's spring (skate's `pose.l8`).
