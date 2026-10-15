# CAD

A tool for designing things to make, drawn the way the games here are: the
picture is the interface (no HTML or CSS on its page). The first part of it
is a PCB designer, mobile first. Its parts library starts with the parts of
the handheld game controller (`~/src/handheld`), and the board it opens with
is the handheld's: its placement and netlist from `design.ml`, with almost no
copper laid yet.

```sh
make cad && .build/cad [BOARD]       # programs/cad/handheld.pcb if none
make cad-test                        # programs/cad/test_board.l8
make web                             # the page is .build/web/cad/
```

The page keeps the board in `localStorage`; `?fresh` starts from the
handheld's again, and `?board=FILE` from another file beside the page.

## Using it

There are two modes, along the bottom: **Arrange** and **Route**. In either,
a finger on empty board moves the view (let go mid-swipe and it glides), two
fingers pinch to zoom, and a double tap zooms in. The mouse wheel zooms;
off a page, the middle or right button drags the view.

- **Arrange**: drag a part to move it (it snaps to the grid shown, which
  follows the zoom). A tap picks a part; its card can rotate or delete it,
  and its connections are lit.
- **Route**: routing is said, not drawn. The computer finds the copper
  (`route.l8`); you give it intent, and help where it is stuck.
  - Tap a line of the ratsnest: that connection is routed, the shortest
    clean way in straight runs and 45-degree turns, changing layer by vias
    where it must.
  - Drag a ratsnest line, or a picked route's copper, to pull out a
    waypoint; the route goes through it, found again as you move it. Tap a
    waypoint to pick it (Take out removes it).
  - A picked route can go to the other layer, be **locked** (routing will go
    round it and never move it), or be taken up.
  - **Route all** routes every connection, a few each frame (pouring a net
    called GND on the bottom first, if nothing is poured yet).
    Free routes may be pushed aside (taken up and routed again) to let a
    later one through; locked ones never are. What finds no way is left as
    a red dashed line to steer by hand.
  - **Guide**: draw a stroke from one part to another, and the connections
    between them are routed side by side along it, in lanes.
  - **Clear** starts over, as far as you choose: the free routes, all
    routes (locked ones too), or all copper (routes, hand-laid tracks and
    vias, and pours: a bare board with its parts where they are). Each
    shows how much it would take up; undo brings it back.
  - Tap a pad to light its net; its card routes the whole net, or **pours**
    it on the bottom (a copper fill with a via in each of its top pads).
- The layer button switches between top and bottom copper; undo and redo
  keep 200 steps; the corners button fits the board; **+** opens the parts.
- Top right: the problems the check finds. A tap goes to each in turn.

Keys: `1` and `2` the modes, `r` rotate, Delete delete, `z` undo, `y` redo,
`f` fit, `v` the layer (of the picked route, or for new ones), `k` lock,
`w` route all, `g` guide, `c` clear, `p` next problem, `a` the parts, `+`/`-` zoom,
Escape to let go of what is picked (or stop Route all).

## The router

A route is a pin, any waypoints, and a pin; it would rather be on one
layer, and is free or locked. Its copper is found on a grid of 0.1 mm cells
on both layers at once (A*, leaning toward the goal): a step costs its
length (more on the other layer), a turn a little (sharper than 90 degrees
never), a via as much as 2 mm of track. Every other net's copper, a hole,
and the board's edge keep cells from it by the clearance. A search looks
near the two ends first, then wider, and gives up after 150,000 cells, so a
connection with no way costs a bounded time.

Things a person would do, it does:

- **Fan-out**: from a pad whose neighbours are too close for a track to pass
  (a QFN's), the route first goes straight out along the pad, as wide as
  the pad, until it is clear of the part's pads. Each such pin's way out is
  kept for its own net. A wide (power) track is necked down to what the
  pitch allows.
- **Straps**: two pins of one part on the same net are joined straight
  across, pad to pad, when nothing is between.
- **Pushing aside**: when the near ways are taken, it searches again
  letting itself cross free routes at a cost, takes up the ones it
  crosses, and routes them again after (a few times at most).
- **Lanes**: a guide stroke is squared to 45-degree runs, and each
  connection gets waypoints offset from it by its place in the row; the
  one farthest along the way the bus sets off is routed first.

Route all also routes in the order a person would:

- **Buses** first: three or more signals between the same two parts are
  routed together in lanes, along a guide of its own from the middle of
  one end's pins to the other's. Those that meet the far part on its far
  side get a guide that goes round it, on the side that crosses nothing
  (a flash's far row). Lanes keep the order the pins have round the part
  they leave, so no two lines cross.
- **Under-links**: power between two of a chip's pins with other lines
  leaving between them (VREG_VOUT to DVDD, across the USB pair) can only
  go under those lines. They go first, on the bottom, so their vias land
  where they fit.
- **Fan-outs**: the lines out of each side of a chip, in the order that
  lets each go round the one before: those turning right from the
  rightmost pin in, those turning left from the leftmost. A chip's
  crowded pin keeps its way out clear for a little past its stub, so no
  line of another net runs across right in front of it.
- Then the other signals, shortest first; power (a long power link goes
  on the bottom, under the signals); then a poured net's drops (a stub to
  the nearest place a via can go down into the pour). If the pour is left
  in pieces, its pieces are joined by tracks.

A route pushes aside only routes of its own priority or after. Tracks to
a 0.4 mm-pitch part are 0.2 mm wide, so neighbours can run side by side
out of it. A fan-out that is blocked tries the other way, in under the
part. The ratsnest joins a chip's power pins each to its own cap, not
round the chip to one another. When a connection finds no way, the
ratsnest is made again joining its pins some other way (through a part
that joins them inside, such as the USB ESD part's flow-through lines)
and it is tried again, pass after pass while each leaves fewer
unrouted. Then, if only a few are left, each gets a try at routing its
corner of the board again, itself first, kept only if that leaves fewer
unrouted; one try a frame.

## The check

After every change (and while a part is dragged) the board is checked
(`check.l8`): which copper touches which, each layer apart, through holes and
vias joining them; then for each net the connections still to make (Prim's
tree between its islands of copper: the thin lines); and the problems:
copper of different nets nearer than the clearance, or touching (a short),
courtyards that overlap (round parts have round ones), copper within
0.3 mm of the edge, tracks thinner than 0.1 mm, and copper under a part it
has no business with: a track on the top inside a part's courtyard, or a
via through it, that is on none of that part's nets (a part's own nets may
go in to reach its pads, as `~/src/handheld/design.md` asks). The router
keeps to the same rule, so it goes round parts on the top, or under them on
the bottom. And no part has copper on the top between its pads, under its
body, whatever the net: between the rows of a SOT-23, an SOIC, an 0603 or a
crystal, behind a connector's row, or inside a QFN's ring (where solder
paste on its middle pad bridges, and the mask is a sliver). Copper comes to
a part's pads from outside it; the one thing that may cross in is a strap
from a pin into the part's own middle pad on the same net (a ground pin
into the ground pad). Pads a part joins inside itself, or that are joined
beyond the board (the display's ground pins, one ground on its flex), need
no copper between them. The title shows how many nets are joined.

On the handheld's board it finds one problem: the one track `design.ml`
routes, from the battery connector to the PTC, runs through J2's ground pad.
Pours join what they touch of their net.

## The handheld

`handheld.pcb` is the handheld (`~/src/handheld`) laid out again so that it
routes, from `tools/handheld.py` (change that, not the board file).
`handheld-sketch.pcb` is the first sketch, as `design.ml` placed it. It
follows `design.md`: the display at the top, a D-pad on the left, A and B on
the right thumb's arc, Back and Home in the bottom corners, USB-C on the
bottom edge, the power switch on the top edge. (So eight buttons, as the
spec says; `design.ml` had added X and Y.)

What was hard about the sketch is the RP2040's pinout against where its
partners were: QSPI on the edge away from the flash, USB on the edge away
from the connector, the LCD's GPIOs at the chip's far corner and in the
reverse of the connector's order, half the buttons on the side away from
them, the crystal on the wrong side, and decoupling caps far from their
pins. Its USB-C connector also faced into the board, its contacts squeezed
against the edge. Every connection fought for the narrow ring round a
0.4 mm-pitch chip.

The new layout turns the RP2040 half round, so that each side faces what
it joins, and picks GPIOs in the order of what they reach:

- USB comes off the bottom edge and goes straight down the middle to the
  connector.
- GPIO17-21 face up and left, to the display connector, in its pin order:
  SPI0 SCK 18, MOSI 19, DC 20, RESET 21 down the chip's left side, and
  CS 17 at its top-left corner. The backlight's gate is on 23, below them.
- The flash sits below and to the right, turned so that its near row
  faces the right half of the QSPI pins in their order (SD2, SD1, SS).
  The left half (SD3, SCLK, SD0) goes down its left side and round under
  it to the far row, outside the others, in order too.
- GPIO24-28 (the D-pad and Back) leave the left side, and GPIO0-2 (Home,
  B, A) the right.
- XIN and XOUT, SWD and RUN leave the top edge, up and to the right, to
  the crystal and the test pads, each round the one before.
- Each decoupling cap sits by its own pin, between groups of lines that
  head different ways. The 1 uF cap of VREG_VOUT is straight below it, and
  the 10 uF of VREG_VIN and ADC_AVDD beyond it, so their lines do not
  cross. The USB-C connector faces the edge, and the ESD part is turned to
  meet its pins.
- Added: 27 ohm USB series resistors (by the ESD part: at full speed a
  line this long is electrically short, and there the pair runs the
  board's length in one piece), SWD, RUN and BOOTSEL test pads in the
  order their pins leave the chip, a 1 uF cap on DVDD and a 100 nF one by
  its other DVDD pin.

Route all (which pours ground on the bottom first) then joins all 42 of
its nets with no rule broken, in a few seconds; the sketch gets 26 of 40.

## The board file

One thing to a line, in millimetres, y up, the board's middle at 0, 0.
`#` starts a comment.

```
board W H CORNER NAME...
rules CLEARANCE TRACK VIA_DIAMETER VIA_DRILL
part REF FOOTPRINT X Y ROTATION [VALUE]      rotation in degrees, a multiple of 90
net NAME WIDTH REF.PAD REF.PAD ...           width 0: the rules' track width
route NET WIDTH top|bottom free|locked POINT...
pour NET top|bottom
track NET top|bottom WIDTH X0 Y0 X1 Y1 [ROUTE LEG]   NET is - for none
via NET X Y DIAMETER DRILL [ROUTE]
```

A route's points are pins (`REF.PAD`) and waypoints (`X Y`, with `t` or
`b` after if it must be on the top or bottom there). Its copper is written
as tracks and vias tagged with the route's number (and the leg, between
which two points), so a board reads back exactly as it was; a pour's vias
are made again with it.

Footprints (`parts.l8`): `rp2040`, `w25q16`, `mcp73871`, `sot23-5`, `sot23-6`,
`sot23`, `xtal3225`, `r0603`, `c0603`, `ptc1206`, `usb4105`, `fpc14`,
`ss12d00`, `jst-ph2`, `dome6`, `tp1`, `r0805`, `c0805`, `led0603`. The
handheld's are transcribed from its OCaml footprint modules (same pad
centers and shapes).

The same text is the editor's undo history: each change keeps the board's
text from before it.

## How it is built

`paint.l8` draws everything as quads one shader shapes per pixel (round
boxes, round-ended lines, arcs, the board with its grid, and Rubik from
`../skate/font.l8`), so edges are clean at every zoom. `draw.l8` draws the
board with level of detail: part names once readable, then pin names in
their pads. `view.l8` is the camera, `touch.l8` turns fingers into taps,
drags and pinches, `edit.l8` is the modes, router, and undo, and `ui.l8` the
title, toolbar, card, toasts and parts drawer; `route.l8` the router and
routes, `pour.l8` the pours (a mask on the router's grid, drawn as a
texture). With nothing moving the page stops redrawing.

## Not built yet

Gerber, drill and BOM output; a schematic or netlist editor (nets come
from the file); thermal reliefs on pours; length matching or differential
pairs (USB); telling you why a connection has no way (which pins of a bus
cross); swapping pins (an RP2040's GPIOs) to uncross a bus; parts on the
bottom side; board outline editing; the enclosure.
