# CAD

A tool for designing things to make, drawn the way the games here are: the
picture is the interface (no HTML or CSS on its page). It designs the
whole of a small electronic thing, mobile first: its board (a PCB
designer, with the computer doing the routing), the case it goes into
(a stack of laser-cut plywood layers, and the bolts that hold them), and
what to send to whom so that it all arrives (**Make it**). Its parts
library starts with the parts of the handheld game controller
(`~/src/handheld`), and the board it opens with is the handheld's.

```sh
make cad && .build/cad [BOARD...]    # the handheld and its dock if none
make cad-test                        # programs/cad/test_board.l8
make web                             # the page is .build/web/cad/
```

The editor has its designs open together (the boards given, or the
handheld and its dock): a tap on the title opens their menu, and there
too *The set*, the dock in 3D with four handhelds lying in it, its lid on
or slid off: the product as it is to be seen. Each design is written back
to its file as it is left. The page keeps each in `localStorage`, with
the version of the file it began from: when the site has a newer one,
that is what opens.

## Using it

There are three modes, along the bottom: **Place**, **Route** and **Case**.
In any,
a finger on empty board moves the view (let go mid-swipe and it glides), two
fingers pinch to zoom, and a double tap zooms in. The mouse wheel zooms;
off a page, the middle or right button drags the view.

- **Place**: drag a part to move it (it snaps to the grid shown, which
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
- **Case**: the case, a layer at a time, over the board (Up and Down step
  through them; the holes show the board through them). Drag the screen
  (in the layers it lies in) or the battery to move it; the layers follow.
  A board with no case has a button to make one. **3D** shows the whole
  thing (the layers, the buttons' discs, the board and its parts, the
  screen, the battery, the bolts): drag to turn it, pinch or wheel to come
  closer; **Explode** (or a double tap) pulls it all apart, everything in
  a place of its own in the order it goes together (the nuts, the back,
  the battery's layers and the battery, the board's layer, the board, its
  domes, each layer above with its discs, and over it all the bolts); **Flat**
  goes back to the layers.
- **Make it** (top right, bright once nothing is left to do): who makes
  or sells each part of the thing, what to send them, and a way to their
  page. See *Making it*, below.
- The layer button switches between top and bottom copper; undo and redo
  keep 200 steps; the corners button fits the board; **+** opens the parts.
- Top right: the problems the check finds. A tap goes to each in turn.

Keys: `1`, `2` and `3` the modes, `[` and `]` the case's layers, `t` 3D,
`e` explode, `m` Make it, `r` rotate, Delete delete, `z` undo, `y` redo,
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
routes, from `tools/handheld.py` (change that, not the board file). The
board files kept are the whole design, routed: `make cad-boards` runs each
generator (`tools/handheld.py`, `tools/dock.py`), which places the parts
and lists the nets, then `tools/finish.l8`, which presses Route all on it
as the editor would (pouring ground first) and writes it with its copper,
failing if anything is left to connect or any rule is broken. The routing
comes out the same every time; the tests check that each board as kept is
whole and clean, and that it routes whole and clean again from bare.
`tests/sketch.pcb` is the first sketch, as `design.ml` placed it, kept only
as a hard board for the router's tests. It follows `design.md`: the display at the top, a D-pad on the left, A and B on
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

The new layout is as small as its screen and buttons allow: 77 x 86 mm.
A 2.8 inch screen (Newhaven NHD-2.8-240320AF-CSXP-F, 240 x 320, its flex
leaving its right end) lies on its side across the top half; the buttons
are below it. The bolts go through the board's corners, so the case's rim
is thin all round.

- The computer is an ESP32-S3 module (ESP32-S3-WROOM-1-N16R8: Wi-Fi,
  Bluetooth LE, its own USB, 16 MB of flash and 8 MB of PSRAM inside), so
  programs can be loaded over the air, and handhelds can talk to each
  other directly, with no network between (ESP-NOW, or Bluetooth): that
  is the software's to do, the board needs nothing more. It lies on its
  side at the left edge, its antenna's end at the board's edge, out past
  the screen's side; nothing may be under the antenna (its footprint's
  keepout: no tracks, vias or pour on either side).
- Its right end faces the screen's connector, level with it. The screen
  (an ST7789VI inside) is on its 8-bit parallel interface (8080 style:
  IM0 high, IM1 and IM2 low), which the ESP32-S3's LCD peripheral drives
  by DMA: about 97 full frames a second at the controller's fastest
  write, twice what its SPI allows, for software 3D. Its eleven lines go
  straight across from the module's twelve pins there, in the
  connector's order: chip select IO3, data/command IO46, write IO9,
  DB8-DB15 on IO10-14, IO21, IO47, IO48, reset IO45. (IO3, IO46 and IO45
  are strapping pins: the screen's inputs leave them be at reset, and
  IO45's pulldown holds the screen in reset until the program starts.)
  Its tearing signal goes to IO38, to draw between refreshes; its unused
  serial input, read strobe and DB0-DB7 are tied high. The backlight's
  switch is on IO39.
- Its bottom row faces the D-pad and Back (IO4-7, IO15) and Home, B and
  A (IO16-18). IO0 (low at reset: load by the serial port), EN, TX and RX
  have test pads. IO2 reads the battery's voltage, halved.
- There is no USB socket: programs come over the air and charging is
  wireless. For the first program, or to recover from a bad one, USB
  (IO19, IO20) and 5 V for the charger are on test pads, for a clip-on
  jig with the case open.
- The backlight's four LEDs run from the switched battery supply through
  one 6.8 ohm resistor (160 mA at most), switched by a transistor.
- Power is at the top right: the side switch on the top edge (C&K
  PCM12SMTR, 0.3 A), the 3.3 V regulator, the charger, its fuse, the
  battery's socket and a hole for its wire. (Two things the first sketch
  had wrong, which would have kept it from working: its regulator's
  footprint had EN and NC the other way round, so EN floated; and the
  charger's THERM and PROG3 floated, where its datasheet wants 10k for no
  thermistor and a resistor to end charging: 100k, 10 mA.)
- Charging: from a Qi pad (or the dock), through a wireless receiver
  (Adafruit 1901, 5 V at 500 mA) lying against the back under the
  buttons, its two wires soldered up into pads in the board, and a
  Schottky diode (so the jig's 5 V does not feed back into it).
- Charge lights, between the D-pad and A and B, through five holes in
  the front: four for the battery's level and one for full. They need no
  program, and light only on a charger: run from the charger's input, a
  quad comparator (LM339) weighs the battery, halved by its own divider,
  against four steps of a 2.5 V reference (LM4040): 3.6, 3.75, 3.9 and
  4.05 V, as the battery reads while charging. Full is the charger's own
  STAT2.

Route all (which pours ground on both sides first) joins all 58 of
its nets with no rule broken, in a few seconds; the sketch gets 27
of 40.

Its case (`case 3.2 2.5 2.75 11 0.5 17 90`, `qi 0 -22`) is 82 x 90.5 mm and
25.6 mm thick: eight layers of 3.2 mm birch ply and forty discs, held by
four M2.5 x 20 bolts through the board's corners; the battery is
Adafruit's 1200 mAh one (34 x 62 x 5 mm), on its side under the top half,
and the wireless receiver beside it under the bottom half.

## The dock

`dock.pcb` (from `tools/dock.py`) is a box that holds four handhelds lying
flat, two by two, under a lid, and charges them without wires. It is the
second design open (the title's menu); its board file's `dock` line, instead of
`case`, makes its box (`dock.l8`), 241 x 204 x 48 mm of 3.2 mm birch ply,
from the bottom:

- a base, held on by six M2.5 x 6 bolts (their heads under it, between
  four wooden feet; their nuts in hexes in the first cavity), so it comes
  off to reach the electronics;
- two cavities, for the dock's board, the four Qi transmitters (Adafruit
  2162: 5 V in, 5 W at most, each its board and a 53 mm coil) and the
  transmitters' wires' ways; the coils stand on the first cavity, up
  through the second and the floor, 2.4 mm under the pockets' floor and
  about 6 mm from the handhelds' receivers (Adafruit give 2 to 8 mm);
- the floor, then the walls round four pockets, each a handheld's case and
  0.3 mm each side, its coil under the handheld's receiver (they go in
  buttons to the front); the lowest three walls have the dividers, the
  rest go only round the outside, and each pocket has a finger's notch at
  its outer end, to lift the handheld out;
- right of the pockets, past a wall all the way up, the stowage: 48 mm
  across, the pockets' length and depth (28.8 mm under the lid), for the
  charger and its cable: Qualtek's QFWC-18-12-USCR (in the cart: 18 W
  USB-C, 5 V at 3 A among its voltages, its 1.2 m cable attached, a
  folding US plug), lying down, its cable coiled beside it. (Any USB-C
  charger that gives 5 V at 3 A will do, if it is under 28 mm one way.);
- the lid: it slides in a channel from the front, under a lip over its
  sides and back, so it cannot lift off, nor fall out tipped up. A strip
  glued on its front fills the lip's front. The catch is a wooden tab on
  a bolt through that strip and the lid (its nut in a hex in the lid, its
  head on the tab, tight enough to hold where it is turned): turned into a
  notch in the lip's right side, the lid cannot slide; turned back, over
  the lid, it slides out.

Its board is a strip down the dock's middle, under the dividers, where
neither the transmitters nor their coils are. USB-C comes in at the back,
flush with the dock's back face on the board's tongue; the ESP32-S3 is at
the front, its antenna at the board's edge. It takes 5 V from USB-C, reads
what the charger offers from the CC lines (the voltage on its 5.1k
pulldowns: 0.5, 1.5 or 3 A) and what is drawn through a 20 milliohm shunt
(an INA180 amplifies it for an ADC pin), and switches each transmitter
with a P-channel MOSFET: its program keeps as many on as that allows (a 3
A charger runs all four, near enough; less, and they take turns), and can
hear the handhelds over ESP-NOW. Its own USB loads its program. Each
transmitter's two wires are soldered into pads on the board (at their
other end, to its USB-A port's 5 V and ground, which are its input's too).
Route all joins its 25 nets with no rule broken.

The program for the dock, and the handhelds', is not written yet: this is
the hardware.

## The case

`case.l8` works the case out from the board and a few numbers (the board
file's `case` line), again after every change: a stack of plywood layers
the board's outline and a rim bigger, held by bolts through all of them
(M2.5, through the board's mounting holes if it has them, else through the
rim; each head sunk in the front, each nut in a hex in the first battery
layer). The back and the front are glued on, as the bolts' ends are inside
them: the rest comes apart. From the back: the back; two layers with a
pocket for the battery (and a way for its wire to the board: through a
hole in the board if it has one, else a channel to its edge; and room
under the board for the pins of through-hole parts), and in the first a
pocket for a wireless charging receiver, if there is one (the board
file's `qi` line), its coil against the back, with a way for its wires
up to their pads; the board's own layer; a spacer, open over the board's
parts; a shelf the screen rests on; the
screen's layer; the front, with the window onto the screen. A part that
stands taller than a layer gets a hole in the layers it reaches into.
A part reached through the case's side (a USB socket, a side switch)
sits flush with the outside: the board reaches out under it in a tongue
across the rim (thin there, 2 mm), and the wood is notched round the
tongue and the part, in each layer the part stands up into. (The layers
are 3.2 mm and the board sits halfway up one, so a USB socket, 3.3 mm
tall, leaves a 1.5 mm slot over it.) An LED's light comes up through a
small hole in every layer over it. The tongues are part of the board's
outline everywhere: its drawing, the edge check, the Gerber outline. Each button is a stack of discs over its dome
(a stem, a flange that stops it under the front, a cap that stands out of
it), as wide as its neighbours leave room for: the D-pad's as small as a
cap may be, the rest all one size.

The check also finds wood too thin to hold together (under 1.5 mm between
holes, or a hole and the edge), and says which layer.

The cut file is an SVG of every piece, as Ponoko asks for it:
millimetres, cuts in blue hairlines, made bigger or smaller by half the
laser's kerf (0.2 mm), and a few engraved dots on each layer saying its
place in the stack. The pieces go in rows on sheets of Ponoko's biggest
size (790 x 384 mm): the handheld's fit one, the dock's take six, and
then the cut file is a zip of a file a sheet.

## Making it

The *Make it* panel lists who makes or sells each part of the thing:

| What | Who | What is sent |
| --- | --- | --- |
| The board, made and its parts put on | JLCPCB | `fab.l8`'s zip: Gerbers (top and bottom copper, mask, paste, silkscreen, outline), plated and unplated drill files, the parts list (`Comment, Designator, Footprint, LCSC Part #`) and their places (`Designator, Mid X, Mid Y, Layer, Rotation`) |
| The case, laser cut | Ponoko | the cut file |
| Screen, bolts, nuts, battery, domes, wireless receiver (the dock: transmitters, charger, bolts, nuts) | DigiKey | a cart filled by its FastAdd link (`order.l8`) |

Each part on the board has a manufacturer's and an LCSC part number
(`sourcing.l8`, found in JLCPCB's parts library and in stock on
2026-10-15). None of these lets a program pay, so the panel goes as far
as there is to go: each button opens the site with what to send or buy,
and paying is yours.

On the page, a tap that opens another site or saves a file must be the
page's own, so the editor tells the page where those buttons are
(`CADLINK` lines) and the page lays unseen links over them. Off a page,
the buttons write `fab.zip` and `case.svg` beside where the editor was
started, and print the sites' addresses.

Still to check by hand before ordering: the parts' turns in JLCPCB's
placement preview (`SRC_ROT` is all 0 until each is checked), the
screen's visual area against a real module, and the DigiKey numbers made
by pattern (the 20 mm bolts, the screen, the wireless receiver) in the
cart. The PCM12 switch's body depth is from its land pattern, not
measured.

## The board file

One thing to a line, in millimetres, y up, the board's middle at 0, 0.
`#` starts a comment.

```
board W H CORNER NAME...
rules CLEARANCE TRACK VIA_DIAMETER VIA_DRILL
case PLY RIM SCREEN_X SCREEN_Y BATTERY_X BATTERY_Y [90]    the case: plywood thickness (as measured), rim width, where the screen's and battery's middles are (90: the battery on its side)
qi X Y                                       a wireless charging receiver against the case's back, its middle there
dock PLY SLOT_W SLOT_H SLOT_T QI_DY BX BY    instead of case: a dock for four of a thing SLOT_W x SLOT_H x SLOT_T (its receiver QI_DY up from its middle), this board's middle at BX, BY in it
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
texture). `case.l8` is the case (its layers, drawn as a texture too, and
its cut file), `view3d.l8` the 3D view (each layer of wood drawn as
slices of its mask, so its holes go through it), `fab.l8` the files for
the board house, `sourcing.l8` the
parts' numbers, and `order.l8` the *Make it* panel. With nothing moving
the page stops redrawing.

## Not built yet

Ordering through an API (none of the makers lets a program pay); text
on the silkscreen; a 3D view of the case; a schematic or netlist editor (nets come
from the file); thermal reliefs on pours; length matching or differential
pairs (USB); telling you why a connection has no way (which pins of a bus
cross); swapping pins (an RP2040's GPIOs) to uncross a bus; parts on the
bottom side; board outline editing; the enclosure.
