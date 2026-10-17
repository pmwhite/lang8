# CAD

The designs of a small electronic thing, and a viewer for them drawn the
way the games here are: the picture is the interface (no HTML or CSS on
its page), mobile first. A design is the whole of the thing: its board
(placed and routed, the computer doing the routing), the case it goes
into (a stack of laser-cut plywood layers, and the bolts that hold them),
and what to send to whom so that it all arrives (**Make it**). There are
two: the handheld game console (`~/src/handheld`) and the dock that holds
and charges four of them.

The designs are made by their generators, `tools/handheld.py` and
`tools/dock.py` (where every part goes, and every net), and routed by
`tools/finish.l8`: `make cad-boards` runs them and writes the board files
kept here, which are the whole design. To change a design, change its
generator. The editor shows them, for looking over and reviewing; it does
not change them.

```sh
make cad && .build/cad [BOARD...]    # the handheld and its dock if none
make cad-boards                      # the designs, from their generators
make cad-test                        # programs/cad/test_board.l8
make web                             # the page is .build/web/cad/
```

The viewer has its designs open together (the boards given, or the
handheld and its dock): a tap on the title opens their menu, and there
too *The set*, the dock in 3D with four handhelds lying in it, its lid on
or lifted off: the product as it is to be seen.

## Using it

There are three ways of looking, along the bottom: **Parts**, **Copper**
and **Case**. In any, a finger on the board moves the view (let go
mid-swipe and it glides), two fingers pinch to zoom, and a double tap
zooms in. The mouse wheel zooms; off a page, the middle or right button
drags the view.

- **Parts**: a tap picks a part: its card says what it is, its package,
  and what it is bought as (the manufacturer's part and LCSC's number, or
  that it is not put on by the board house), and its connections are lit.
- **Copper**: the routed copper of both sides. A tap on a track, a via or
  a pin lights its net and says what it is (a track's width and layer, a
  route's length and vias, a net's pins). The layer button puts the other
  side on top.
- **Case**: the case, a layer at a time, over the board (Up and Down step
  through them; the holes show the board through them). **3D** shows the
  whole thing (the layers, the buttons' discs, the board and its parts,
  the screen, the battery, the bolts): drag to turn it, pinch or wheel to
  come closer; **Explode** (or a double tap) pulls it all apart, everything
  in a place of its own in the order it goes together; **Steps** puts it
  together step by step, as *Putting it together* says (below), each
  step's pieces coming down into place in turn, turned face down for the
  steps done face down (Next and Back, or the arrow keys); **Flat** goes
  back to the layers. It is lit as a room is, to read its depth: a lamp
  above it casting shadows on it and on the floor under it, a softer
  light from the other side and from above; the ply's faces pale birch
  with a grain, its laser-cut edges charred brown with the sheets' seams
  in them, the engravings burnt in, the metal and the screen's glass
  reflecting the room.
- **Make it** (top right): who makes or sells each part of the thing,
  what to send them, and a way to their page. See *Making it*, below.
- The corners button fits the board. Top right: the problems the check
  finds (none, as kept); a tap goes to each in turn.

Keys: `1`, `2` and `3` the ways of looking, `[` and `]` the case's
layers, `t` 3D, `e` explode, `s` the steps (in 3D; the arrows or space
go through them), `m` Make it, `f` fit, `v` the layer on top, `p` next
problem, `+`/`-` zoom; Escape shuts what is open (or lets go of what is
picked), `q` quits.

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
  kept for its own net. A wide (power) track goes out as a stub as wide as
  its pad, a track's width farther than a thin one would, and on at its
  full width from there; only if it cannot is it necked down all the way
  to what the pitch allows.
- **Straps**: two pins of one part on the same net are joined straight
  across, pad to pad, when nothing is between.
- **Pushing aside**: when the near ways are taken, it searches again
  letting itself cross free routes at a cost, takes up the ones it
  crosses, and routes them again after (a few times at most).
- **Lanes**: a guide stroke is squared to 45-degree runs, and each
  connection gets waypoints offset from it by its place in the row; the
  one farthest along the way the bus sets off is routed first.

Route all also routes in the order a person would:

- **The generator's own routes** first: a design's generator may give
  routes that matter more than the rest, locked, with no copper yet (a
  supply's trunk, wide and straight from its source to its load; a sense
  line from a shunt's own pad, carrying no current), and they are laid
  before anything is in their way.
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

When a board is read the board is checked
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

Pours join what they touch of their net.

## The handheld

`handheld.pcb` is the handheld (`~/src/handheld`), from
`tools/handheld.py`. The board files kept are the whole design, routed:
`make cad-boards` runs each generator (`tools/handheld.py`,
`tools/dock.py`), which places the parts, lists the nets and gives the
routes that must be laid first, then `tools/finish.l8`, which presses
Route all on it (laying those, and pouring ground, first) and writes it
with its copper, failing if anything is left to connect or any rule is
broken. The routing comes out the same every time; the tests check that
each board as kept is whole and clean, and that it routes whole and
clean again from the generator's placing. `tests/sketch.pcb` is the first
sketch, as `design.ml` placed it, kept only as a hard board for the
router's tests.

The board is 79 x 86 mm and 1.2 mm thick, as small as its screen and
buttons allow (the thickness sets the buttons' room: see below). A 2.8
inch screen (Newhaven NHD-2.8-240320AF-CSXP-F, 240 x 320, its flex
leaving its right end and folding back under it to its connector) lies
on its side across the top half; the buttons are below it. The bolts go
through the board's corners, so the case's rim is thin all round.

- The computer is an ESP32-S3 module (ESP32-S3-WROOM-1-N16R8: Wi-Fi,
  Bluetooth LE, its own USB, 16 MB of flash and 8 MB of PSRAM inside), so
  programs can be loaded over the air, and handhelds can talk to each
  other directly, with no network between (ESP-NOW, or Bluetooth): that
  is the software's to do, the board needs nothing more. It lies on its
  side at the left edge, its antenna's end at the board's edge, out past
  the screen's side; nothing may be under the antenna (its footprint's
  keepout: no tracks, vias or pour on either side). The screen is set so
  its picture is in the middle of the case, across, so its metal is
  1.65 mm from the antenna; the battery, under the board, is 2 mm from
  it. Espressif ask for 15 mm from metal: in a handheld this
  size it cannot have that, so its range will be shorter than a dev
  board's. A 3.3 V trunk, 0.5 mm wide, goes straight from the regulator
  to the module (its Wi-Fi draws 0.5 A in bursts), laid first.
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
  serial input, read strobe and DB0-DB7 are tied high. Its flex, folded
  back under it, brings its contact 1 to the low end of the connector,
  which is pin 1's (the connector takes contacts on either face).
- Its bottom row faces the arrows and Back (IO4-7, IO15), Home, B and A
  (IO16-18) and power (IO8). IO2 reads the battery's voltage, halved (1M
  each, so little goes back into the module when it is off: the pin
  leaks 50 nA at most, 25 mV).
- The buttons are tactile switches (XKB's TS-1187A, 5.1 mm square, 160
  gf, 1.7 mm tall: -B-C-B), put on by the board house. Power is one of them: a small flush button at the
  right end of the bottom row (Back, Home, power), a ring engraved round
  it. There is no power switch: "off" is the module's deep sleep (the
  program's to do: held, the button puts it to sleep; pressed, it wakes
  it, IO8 being one it can wake on, its pull-up kept in sleep). Asleep it
  draws about 0.1 mA: the regulator (25 uA), the charger's own leak from
  the battery (30 uA), the dividers (8 uA), the module (10 to 30) and the
  screen told to sleep (the program's to do; its datasheet gives no
  figure: tens of uA, to be measured) - over a year on the battery. To keep it for longer, unplug the battery
  (which takes the case apart: the battery is under the board). The
  program should put it to sleep, too, below about 3.55 V: Wi-Fi's bursts
  through the fuse and the charger pull the 3.3 V down near the module's
  brown-out below that. Held 7.5 s, whatever the program is doing, the
  button restarts it: a push-button reset timer on its line (TI's
  TPS3422, 0.25 uA, its own pull-up) pulls EN low for 0.4 s. (The
  program should sleep on a shorter hold, a second or two.)
- There is no USB socket: programs come over the air and charging is
  wireless. For the first program, or to recover from a bad one, there
  are eight test points, plated holes in two rows of four at the lower
  right: 5V (into the charger), GND, D+, D- (USB, IO20 and IO19); EN,
  BOOT (IO0: low at reset to load by the serial port), TX, RX. A window
  through the case's back and battery layers reaches them, for a jig of
  pogo pins with the case shut (a sticker over it).
- The backlight's four LEDs (160 mA most, together, at 3.1 V) run from
  the system supply through a current sink: an LMV321 op-amp holds a
  logic-level MOSFET (AO3400A) at 99 mA (Newhaven's pin table says 100
  mA, its electrical table 160 most: the lower, for the LEDs' life, and
  bright enough indoors) through a 1 ohm (1%) sense
  resistor, however the supply goes (5 V on a charger, the battery's 3.4
  to 4.2 V; below about 3.6 V it dims a little, the LEDs wanting up to
  3.4 V). IO39 high sets it, through a divider (3.3 V to 0.099 V); PWM on
  it dims it. The op-amp is powered from IO1 (one that holds in deep
  sleep): with it low the op-amp draws nothing and the gate is pulled
  down, so the LEDs are truly off (an op-amp left on would hold them at
  its offset, a few mA's glow). Its feedback comes back through 1k with
  4.7 nF from the op-amp's output, so the loop is steady with the
  MOSFET's gate on it; the MOSFET's drain has a wide track to shed its
  heat (0.17 W on a charger).
- Power is at the top right: the 3.3 V regulator (always on; TI's
  TLV75533 in WSON-6, its middle pad soldered to ground: on a charger it
  drops 1.7 V, a few hundred mW with Wi-Fi busy, and that package sheds
  it at 100 C/W where a SOT-23-5 would at 230), the charger
  (MCP73871) with its input and battery each bypassed (10 uF, as its
  datasheet asks; nine vias in its exposed pad take its heat, up to 0.9 W
  charging, to the ground pour on the back), its fuse (1.1 A hold: Wi-Fi's
  bursts and the backlight; the charger senses the battery through it, so
  its 0.1 V at full current ends the constant current a little early,
  and the taper finishes the charge at 4.2 V all the same), and left of
  the charger, beside its battery pins, the
  battery's socket (JST PH, side entry, surface mount, 4.6 mm tall,
  under the screen,
  its plug going in from over the hole its wire comes up through, a
  5.5 x 7.5 mm slot in the board over the battery). The charger's THERM
  has a 10k thermistor over the battery, on the board's top, away from
  the backlight's MOSFET: it stops charging outside about 3 to 44 C (a
  warm dock, the sun); PROG3's 100k ends the charge at 10 mA; its safety
  timer is off (TE high): played on a pad for hours, the handheld would
  use most of the 500 mA, and the timer would end the charge unfinished.
  Its VPCC holds its input at 4.55 V at least (270k and 100k): if the
  receiver sags under the load, the charge current falls back, rather
  than the charger stopping and starting.
- Charging: from a Qi pad (or the dock), through a wireless receiver
  (Adafruit 1901, 5 V at 500 mA) lying against the back under the
  buttons, its two wires soldered up into pads in the board, straight to
  the charger through a P-channel MOSFET used as a diode that drops next
  to nothing (the charger wants 4.35 V at least to start; a Schottky's
  0.45 V would leave it short). The jig's 5 V comes in through a Schottky
  diode, and turns the MOSFET off, so it does not feed back into the
  receiver (10 nF on the jig's pin keeps a spark off the MOSFET's gate).
  The Schottky drops 0.45 to 0.6 V: on the jig the charger's input sits
  near its 4.55 V floor, so it charges slowly there; loading programs is
  not affected.
- Charge lights, between the arrows and A and B, through five holes in
  the front: four for the battery's level and one for full. They need no
  program, and light only on a charger: run from the charger's input, a
  quad comparator (LM339) weighs the battery, halved by its own divider
  (330k each, 6 uA: the four inputs' bias moves it 4 mV as they usually
  are, 41 at the worst), against four
  steps of a 2.5 V reference (LM4040): 3.6, 3.75, 3.9 and 4.05 V, as the
  battery reads while charging. Full is the charger's own STAT2 (which
  also goes low when it stops for heat or cold: too warm on the dock,
  "full" lights though it is not charging; the program can tell, from
  the battery's voltage).
  Engraved over them: a bar over each of the four, taller step by step,
  and a ring round full. Each light shines up a tube of its own through
  the wood (no light reaches its neighbours'), 1.6 mm across and 11 mm
  from the light to the face: seen only nearly head on, as it is. Its top
  6.4 mm (the front and the screen's layer) filled with clear UV resin,
  flush with the front, it carries the light up to the face, which
  glows.

Route all (which lays the generator's routes, and pours ground on both
sides, first) joins all 65 of its nets with no rule broken, in a few
seconds; the sketch gets 30 of 40.

Its case (`case 3.2 2.5 2.75 11 0.5 17 90 5`, `qi 0 -22`) is 84 x 93.5
mm and 22.4 mm thick: seven layers of 3.2 mm birch ply and 33 discs. Its
rim is 2.5 mm, but 5 along the bottom, under the row of small buttons,
so they are not crowded against the edge. Four steel M2.5 x 12 bolts go
up through the board's corners from the back, their heads sunk through
it and the first battery layer, into nuts glued (epoxy) in hexes in the
screen's layer, under the front, bearing on the spacer: the bolts clamp
the battery layers, the board's layer and the spacer, and the front's
block is held by the nuts glued in it. Nothing of them shows on the
front, which is wood, the window and the buttons. (From the heads' seat
to the nuts' top is 11.6 mm, to the front 12.8: a 12 mm bolt goes all
through its nut, and its tip stops 0.8 short of the front. Stack the
second battery layer, the board's layer, the spacer and the screen's
layer dry and measure them: under 12.6 mm, put a thin washer, DIN 433
M2.5, 5 mm across and 0.5 thick (it fits the head's 5.6 mm hole), under
each head. Under 3.15 mm a sheet, the 2 mm posts on the board stand
proud of the gap over it: a seam shows in the side; 1.8 mm posts would
close it.) The battery is Adafruit's
1200 mAh one (34 x 62 x 5 mm), on its side under the top half, its lead
to the right (a bay in its pocket at that end takes the lead's bend and
its slack; the wire lies back over the battery to the slot in the
board), and the wireless receiver beside it under the bottom half. Foam
squares (1.6 mm, sticky both sides) hold the receiver still in its
pocket, and one layer of them on the battery (beside its wire, not on
it), squeezed to 1.4, holds the battery and presses the board up
against its posts.

Its buttons: the four arrows are buttons of their own, in a cross, each
7.5 mm from its middle, with round caps about 6.8 mm across standing 3.2
mm out of the front (not one rocking cross: in plywood, its play and the
pivot it rocks on are hard to make true, and it could catch or press two
at once; four stacks press as surely as A and B). A and B have caps as
wide as there is room (about 7.6 mm), standing out as far, their middle as
far right of the case's middle as the arrows' is left; Back,
Home and power, in a row along the bottom, have small caps (6 mm) flush
with the front, so a thumb passing over them does not press them, nor
takes them for the face buttons; engraved by them, a bar for Back, a dot
for Home, a ring for power, and a small triangle past each arrow,
pointing its way (four round caps alone read as more face buttons). Each button's stems rest on its switch.
With the board 1.2 mm thick the gap from it to the spacer is 2 mm, and
the switches 1.7: each button's flange has 0.3 mm of room under the
front, more than the switch's travel (0.25), little to rattle.
Posts at the board's corners, 2 mm (4 x 4 mm inductors), bear on the
spacer, and the foam on the battery presses the board up against them:
it cannot rattle. Each disc has a 2.2 mm hole in its middle (but a cap's
top disc, which shows: a flush button's one cap disc too): round
toothpicks (2 mm) through a button's discs line them up as they are
glued, cut off flush after. The caps have 0.2 mm round them in the
front.

The window onto the screen is a sheet of 3 mm clear acrylic in a hole its
size in the front, the picture and 1 mm round it: inside the glass's
edge (Newhaven's drawing leaves 1.5 mm of glass outside the picture), so
what shows is an even black border, and the wood's margin, even all
round, hides the glass's edges, the backlight's frame and the room for
the flex; the screen is set so that its picture is in the middle of the
case, across. The screen lies in its own layer under the front, on four
pads of the foam squares (1.6 mm) on the spacer under its corners (the
wood there: its middle is over holes), squeezed to 0.8, which press its
glass up against the front's wood round the window, the acrylic in it
flush with the face: a press cannot push it in, and there is no gap to
rattle in. Glue
the acrylic in with clear epoxy or a UV acrylic adhesive (superglue
would frost its edges). The screen comes out only with the case
unbolted. The back is laid face down, so what is engraved on it is outside: a
ring where the wireless receiver's coil is, to set it on a charging pad
(and the cut file has the back mirrored, so that turned over it fits).
Its edges are square as cut: sanding them round is worth doing.

Putting it together (beside what the cart brings: wood glue, 5-minute
epoxy, clear UV resin and a UV torch, round toothpicks 2 mm across,
clear packing tape, a little wax; and, if the ply is thin, four DIN 433
M2.5 washers). The viewer's **Steps** (in 3D) shows each step:

1. The back block: the wireless receiver in the first battery layer's
   pocket, its coil down against where the back goes, foam over it, its
   wires up through the second's channel; then glue (wood glue) the
   first battery layer on the back (engraving out) and the second on it,
   lined up by their edges and the bolts' holes (bolts through them
   while it sets), sanded flush.
2. The front block: glue the front on the screen's layer the same way.
   Set the acrylic in the window from behind, its back at least 0.1 mm
   inside the front's back face, so the screen's glass bears on wood, not
   on it: if the acrylic is thicker than the ply, let it stand proud of
   the face by the difference (never sand it: that frosts it over the
   picture). Glue it from behind (clear epoxy). Seal the five light
   tubes' walls with a thin coat of the resin, cured; then clear packing
   tape over the front's face, burnished down, turn it over, and fill the
   tubes from behind with UV resin, a toothpick to work out the bubbles,
   in two pours, each cured. Peel the tape: the resin is flush with the
   face.
3. The nuts: epoxy each into its hex in the screen's layer, flush with
   the layer's back face (the spacer's side), not against the front: lay
   on them, waxed, the spacer and the board's layer, then the back
   block, and run the four bolts in as at the end (11.6 mm from head to
   nut, the tip short of the front), drawing each nut flush; leave it
   while it sets (no epoxy on that face, nor in the thread); then out.
4. The buttons: each one's discs glued on toothpicks through their holes,
   the toothpicks cut flush when set (a flush button's at its flange: its
   cap goes on in step 6); the standing caps' top
   edges broken with fine sandpaper, kinder to a thumb.
5. The board, face up: solder the receiver's two wires (the back block
   lying beside it) up into its pads. Their slack lies, when it is
   closed, in a bay in the second battery layer over the receiver.
6. Face down, on a folded towel (the caps stand out of the front): the
   front block; the buttons into their holes (a flush button's cap first,
   dropped into its hole, waxed so it does not glue itself to the front,
   then its flange and stem glued on it from behind); the screen into its layer,
   face down on the window; four foam pads on the screen's back corners;
   the spacer, then the board's layer, over it all.
7. The screen's flex into its connector. Then thread the battery's plug
   up through the slot into its socket (the battery plugged in last,
   after the flex), and turn the board over onto them, like a page, into
   its layer.
8. The battery on the board's back, its lead to the right, its wire in
   the bay at that end and back over it; one layer of foam on it, beside
   the wire; the receiver's wires' slack into their bay. The back block
   lowered over it all, bolts held through it as guides; the four bolts
   in: snug, not tight (the clamp is wood on wood, and the posts are
   under it).

## The dock

`dock.pcb` (from `tools/dock.py`) is a box that holds four handhelds lying
flat, two by two, under a lid, and charges them without wires. It is the
second design open (the title's menu); its board file's `dock` line, instead of
`case`, makes its box (`dock.l8`), 257 x 223.5 x 41.6 mm of 3.2 mm birch ply
(lid on, on its feet 51 mm), from the bottom:

- a base, held on by six steel M2.5 x 12 bolts (their heads under it,
  between four wooden feet), through the first cavity into nuts in hexes
  in the second, so they clamp it to the body; it comes off, the dock's
  board bolted to it (three M2.5 x 8), to reach the electronics. A slot
  in it past each transmitter's board's outer end lets air in from under
  the box;
- holes for two 3 mm dowels through the glued layers, in the side rims
  toward the front, to line them up as they are glued; left standing
  3 mm out of the top, into the lid's frame, they line the lid up too;
- two cavities, for the dock's board, the four Qi transmitters (Adafruit
  2162: 5 V in, 5 W at most, each its board and a 53 mm coil) and the
  transmitters' wires' ways; the coils stand on the first cavity, up
  through the second and the floor, 2.4 mm under the pockets' floor and
  about 6 mm from the handhelds' receivers (Adafruit give 2 to 8 mm). In
  the second, each coil's pocket is joined to its transmitter's: the way
  for its leads, and for the air, which goes on up round the coil (the
  floor's hole is 2.5 mm wider each side) into the pocket. Foam squares
  hold the coils and boards still;
- the floor, then nine walls round four pockets, each a handheld's case
  and 0.75 mm each side, its coil under the handheld's receiver (they go
  in buttons to the front); the lowest three walls have the dividers, the
  rest go only round the outside, and each pocket has a finger's notch at
  its outer end, 22 mm across and 10 mm deep (the front and back rims
  are 14 and 13.5 mm deep for them), and 6 mm on into the floor, under
  the handheld's end: a fingertip goes under it to lift it out.
  On each pocket's floor, at the end the handheld's screen goes, the
  screen's outline is engraved: the way round it charges, its receiver
  over the coil. (Turned round, it does not charge, and shows it: its
  own lights and its pocket's light stay dark. Nothing stops it going in
  that way: its back's one mark that is not the same turned round, the
  test points' window, lies over the coil's hole, where there is no
  wood for a key.) A grille in the lid's top, over the back pockets'
  finger notches (the lid's frame open there too), lets
  out the air the transmitters warm; dust falls into the notches, not on
  the screens. With a handheld lying over its coil the air's way
  is narrow, so the program reads the thermistor on its board and turns
  the transmitters down to keep the box under about 40 C (the handhelds'
  own stop at 44); and the current, and stops a transmitter that draws
  what no handheld would: a coin on its pocket's floor. (The dock's own
  3.3 V, 0.1 to 0.2 A, is drawn before the shunt: the program allows for
  it against what the charger offers.);
- right of the pockets, past a wall all the way up, the stowage: 54 mm
  across, the pockets' length, 32 mm deep under the lid (the walls are
  as many as the charger's 28 mm and 2 to spare need: nine on 3.2 mm
  ply), for the charger and its cable: Qualtek's QFWC-18-12-USCR (in the
  cart: 18 W USB-C, 5 V at 3 A among its voltages, a folding US plug,
  48 x 48 x 28 mm by its datasheet; a USB-C socket, so the cart has a
  1 m USB-C cable for it too, Adafruit's 4199), lying down, its cable
  coiled beside it. In the lowest two walls the stowage is wood but for
  a pocket the charger's shape (3 mm bigger), against the outer wall, a
  round well 42 mm across that the cable's coil sits in, and a channel
  for the cable between them, so neither slides about; a finger's notch
  in the outer wall beside the charger lifts it out. (Any USB-C charger
  that gives 5 V at 3 A will do, if it is under 30 mm one way and fits
  the pocket; and any USB-C to C cable rated 3 A.);
- the lid: it lifts off. A frame (the walls' outline and holes) with a
  top glued on it, 6.4 mm in all, a grille of four slots in the top over
  each back pocket's finger notch, and a third over the stowage's back
  end; four disc magnets (10 x 2 mm,
  magnetized through) in the top wall's front and back rims, and four
  over them in the frame, hidden by the top, hold it down. Each sits at
  the bottom of its hole (on the wall under it, or against the lid's
  top), 1.2 mm in from the faces that meet, so the pairs are 2.4 mm
  apart: a firm hold, not a grip, and the same from one to the next. It
  comes off by the notch under its front edge, in the middle, over the
  lights and between the front pockets, through the top wall and the
  lid's frame: 6.4 mm, a fingertip. Dry-fit a lid's magnets before gluing
  them: if a fingertip at the notch tips the dock before the lid lets go,
  leave a thin shim under the box's four to widen the gap.

The pockets' corners are round as the handhelds' are (7.25 mm, their
6.5 and the gap round them).

Putting it together (beside the cart: wood glue, 5-minute epoxy, two
3 mm wooden dowels cut to 44 mm, a little wax). The viewer's **Steps**
shows each step:

1. The body: the floor and the walls glued up in order, the two dowels
   through their holes to line them up (left standing 3 mm out of the
   top wall, for the lid, and about 9 mm below the floor, where the
   cavities and the base go on them: glue it up on its side, or on a
   scrap with holes for them), sanded flush round the outside. The
   base's and Cavity 1's holes for them are loose: they come off.
2. The box's four magnets into the top wall's holes, epoxied on their
   floors, all the same way up. The lid's top glued on its frame. Mark
   each lid magnet's down face by setting it on its partner; then, the
   lid upside down and away from the box, epoxy each into its hole
   against the top (not set on its partner, whose pull would drag it out
   of its hole while the epoxy is soft).
3. The cavities, the body upside down on its lid (whose frame takes the
   dowels): glue Cavity 2 under the floor;
   epoxy the base bolts' nuts into its hexes, flush with its underside,
   the waxed base laid on them as a jig and its bolts run in while it
   sets.
4. The base: the coils and the transmitters' boards into their pockets
   from below, on foam squares (a coil and its board go in together, the
   leads between them); Cavity 1 laid on them, not glued (the base's
   bolts clamp it, and it comes off to reach the coils); the dock's
   board bolted to the base (three M2.5 x 8), the transmitters' wires
   soldered to its pads with the base lying beside the body; the base
   turned onto it like a page, its six bolts in, and the feet glued
   under it.

Its board is a strip the dock's length, down its middle under the
dividers, where neither the transmitters nor their coils are. At its back
USB-C comes in, flush with the dock's back face on the board's tongue, and
beside it the ESP32-S3, its antenna at the board's end, out through the
back. It takes 5 V from USB-C, reads what the charger offers from the CC
lines (the voltage on its 5.1k pulldowns: 0.5, 1.5 or 3 A) and what is
drawn through a 10 milliohm shunt (an INA180 amplifies it 50 times for an
ADC pin, through 1k: 0.5 V an amp), and switches each transmitter with a
P-channel MOSFET, its gate held up by 100k and pulled down through 10k
by an N-channel one when the module's pin is high, with 100 nF from gate
to source, so it turns on over about a millisecond: the transmitter's input
does not draw a step from the charger. Its 3.3 V regulator is the
handheld's (TLV75533, WSON-6), for the same heat. The supply's trunk is laid first, 1.2 mm wide (3 A at
a 20 C rise; each transmitter's own feed 0.8), from
both of USB-C's VBUS pads to the shunt and from the shunt to each switch,
so the current goes nowhere else; the amplifier reads the shunt at its
own pads, by lines that carry nothing (and is bypassed at its supply). A
transmitter is rated to draw up to 2 A; charging a handheld's receiver,
at its 2.5 W, nearer 0.8 A: the program measures, keeps as many on as
the charger allows (two or three on a 3 A one), and the others take
turns. A thermistor in the board's middle, powered from a pin while it is
read, tells it how warm the box is. At the board's front, five
side-looking lights (330 ohms, 4 mA each) shine out through their own
slots in the dock's front face: each pocket's, left to right as they
lie, and power in the middle, the program's to say what it knows
(charging, waiting its turn, full). It can hear the handhelds over
ESP-NOW; its own USB loads its program. Each transmitter's two wires are
soldered into pads at the board's side level with it, a channel straight
across (at their other end, to its USB-A port's 5 V and ground, which are
its input's too). The lights, left to right on the front face: the
front-left pocket's, the back-left's, power, the back-right's, the
front-right's. Route all joins its 38 nets with no rule broken.

The program for the dock, and the handhelds', is not written yet: this is
the hardware.

## The case

`case.l8` works the case out from the board and a few numbers (the board
file's `case` line): a stack of plywood layers the board's outline and a
rim bigger, held by bolts through them (M2.5, through the board's
mounting holes if it has them, else through the rim; each head sunk in
the back (through it and the first battery layer), each nut in a hex in
the screen's layer, under the front, bearing on the spacer: none in
the front). The front is glued to the layer under it,
and the back and the first battery layer to the second: undo the bolts
and the rest comes apart. From the back: the back; two layers with a
pocket for the battery (and a way for its wire to the board: through a
hole in the board if it has one, else a channel to its edge; and room
under the board for the pins of through-hole parts), and in the first a
pocket for a wireless charging receiver, if there is one (the board
file's `qi` line), its coil against the back, with a way for its wires
up to their pads; the board's own layer; a spacer over the board, holes
in it where a part stands taller than the 2 mm under it, for the
buttons' stems and the lights, for the screen's flex from its fold to
its connector, and for the battery's plug, the screen resting on it;
the screen's layer; the front, with the window onto the screen. A part
that stands taller than a layer gets a hole in the layers it reaches
into.
A part reached through the case's side (a USB socket, a side switch, a
dock's light) sits flush with the outside: the board reaches out under it in a tongue
across the rim (thin there, 2 mm), and the wood is notched round the
tongue and the part, in each layer the part stands up into. (The layers
are 3.2 mm and the board sits halfway up one, so a USB socket, 3.3 mm
tall, leaves a 1.5 mm slot over it.) An LED's light comes up through a
small hole in every layer over it. The tongues are part of the board's
outline everywhere: its drawing, the edge check, the Gerber outline. Each
button is a stack of discs on its switch (a stem, 6 mm, a flange that
stops it under the front, a cap that stands out of it), as wide as its
neighbours leave room for, one size within each kind (the arrows; the
face buttons), the flush ones smaller. (Four arrows with a post in their
middle on the board make one cross that rocks on it, a D-pad, instead.)

The check also finds wood too thin to hold together (under 1.5 mm between
holes, or a hole and the edge), and says which layer; and a hole that
cuts through the edge where it is not meant to (only a tongue's notch, a
slot out to the side, is).

The cut file is an SVG of every piece, as Ponoko asks for it:
millimetres, cuts in blue hairlines, made bigger or smaller by half the
laser's kerf (0.2 mm), engravings in red (not grown), and a few
engraved dots on each layer saying its place in the stack (on its bottom
rim's top face, which the next layer covers; none on the front). The
pieces go in rows on sheets of Ponoko's biggest size (790 x 384 mm), each
material on its own: the handheld's plywood fits one and its acrylic
window another, the dock's take five. More than one sheet, and the cut file is a zip of a
file a sheet, each named for its material (`-ply-1.svg`,
`-acrylic-1.svg`). A piece laid face down (the handheld's back, engraved
outside) is drawn mirrored.

## Making it

The *Make it* panel lists who makes or sells each part of the thing:

| What | Who | What is sent |
| --- | --- | --- |
| The board, made and its parts put on | JLCPCB | `fab.l8`'s zip: Gerbers (top and bottom copper, mask, paste, silkscreen, outline), plated and unplated drill files, the parts list (`Comment, Designator, Footprint, LCSC Part #`) and their places (`Designator, Mid X, Mid Y, Layer, Rotation`) |
| The case, laser cut | Ponoko | the cut file |
| Screen, steel bolts and nuts, battery, foam squares (the dock: transmitters, charger and its USB-C cable, bolts, nuts, the lid's magnets, foam squares) | DigiKey | a cart filled by its FastAdd link (`order.l8`) |
| The handheld's wireless receiver (Adafruit 1901: DigiKey does not carry it; when Adafruit is out of it, Mouser's 485-1901) | Adafruit | its page |

Each part on the board has a manufacturer's and an LCSC part number
(`sourcing.l8`, found in JLCPCB's parts library and in stock on
2026-10-15 and 16). Each DigiKey number was checked on DigiKey's own page,
in stock, on 2026-10-16. None of these lets a program pay, so the panel goes as far
as there is to go: each button opens the site with what to send or buy,
and paying is yours.

On the page, a tap that opens another site or saves a file must be the
page's own, so the editor tells the page where those buttons are
(`CADLINK` lines) and the page lays unseen links over them. Off a page,
the buttons write `fab.zip` and `case.svg` beside where the editor was
started, and print the sites' addresses.

Still to check by hand before ordering (none of it a change to the
design, unless a check fails):

- The parts' turns in JLCPCB's placement preview. `SRC_ROT` is all 0
  until each is checked: JLCPCB's library draws some parts turned from
  the usual (often the SOIC, QFN, SON and SOT parts, and the
  connectors). For each of these, pin 1 in the preview must sit on pin
  1's pad (the silkscreen's dot), or its line in `SRC_ROT` set to the
  turn that puts it there: the handheld's ESP32-S3 (U1), MCP73871 (U3,
  QFN-20), TLV75533 (U4, WSON-6), LM339 (U7, SOIC-14), LM4040 (U8),
  LMV321 (U9), TPS3422 (U10, USON-6), the MOSFETs (Q1, Q2), the
  Schottky (D2), the five lights (their cathodes), the battery's
  socket (J2) and the screen's (J3); the dock's ESP32-S3, regulator,
  INA180, MOSFETs, USB-C socket and side-looking lights (their cathodes
  on the right, lens down, from Lite-On's tape drawing). Resistors,
  capacitors and the switches go either way.
- The screen's reset. It is on IO45, which the module reads at reset to
  choose its flash's voltage: low (its own pull-down) is the 3.3 V its
  flash wants. Newhaven's module must not pull its RES pin up (its
  datasheet shows none): measure a real one's RES to its VDD. If it
  does, the handheld will not start from its flash; the fix is in the
  module, not the board (`espefuse.py set_flash_voltage 3.3V` over the
  test points, once, makes IO45 not matter).
- The battery's plug's polarity against the board's (its + to pin 1):
  Adafruit's are, others' often are not.
- The screen's visual area against a real module.
- The charger's size (48 x 48 x 28 mm, its datasheet's) against a real
  one before the dock's ply is cut.
- The handheld's board is 1.2 mm thick (its `thickness` line): choose
  that in JLCPCB's order form, where 1.6 is the default; at 1.6 the
  buttons have no room to travel.
- The MCP73871 charger is thin at JLC (about 76) and the TPS3422 has
  7,900; the receiver (Adafruit 1901) comes and goes: Mouser's 485-1901
  is the same part.

Known, and left as they are: vias in pads (the stitching in ground
pads, the grid under the charger) are open: if solder wicking under the
charger is a worry, ask JLCPCB for filled and capped vias. The dock's CC
lines go straight to the module's ADC pins, beside their 5.1k pulldowns
(no room for series resistors by the socket): the USB-C socket's
contacts are recessed in the dock's back. A battery too flat to run the
comparators shows no light on a charger until it has charged a little
(a minute or two). Where the ply comes thin (under 3 mm), a thin washer
under each bolt's head keeps it from pulling into the back.

The first program goes in by the test points, with the case shut: a jig
of eight spring pins (pogo pins, 2.54 mm apart in two rows of four,
under the window in the back), its 5V and GND from a USB supply of 5.1
to 5.25 V (the Schottky drops up to 0.6 V; the charger wants 4.35 V),
its D+ and D- to a computer's USB: the ESP32-S3's own USB loads it
(esptool resets it into its loader by USB alone, even with nothing in
its flash). Two buttons on the jig, EN and BOOT to ground, are for a
module that will not: BOOT held while EN is let go starts the loader.

## The board file

One thing to a line, in millimetres, y up, the board's middle at 0, 0.
`#` starts a comment.

```
board W H CORNER NAME...
rules CLEARANCE TRACK VIA_DIAMETER VIA_DRILL
thickness T                                  the board's thickness, if not 1.6
case PLY RIM SCREEN_X SCREEN_Y BATTERY_X BATTERY_Y [90 [BOTTOM]]    the case: plywood thickness (as measured), rim width, where the screen's and battery's middles are (90: the battery on its side; BOTTOM: a wider rim along the bottom)
qi X Y                                       a wireless charging receiver against the case's back, its middle there
dock PLY SLOT_W SLOT_H SLOT_T QI_DY BX BY    instead of case: a dock for four of a thing SLOT_W x SLOT_H x SLOT_T (its receiver QI_DY up from its middle), this board's middle at BX, BY in it
part REF FOOTPRINT X Y ROTATION [VALUE]      rotation in degrees, a multiple of 90
net NAME WIDTH REF.PAD REF.PAD ...           width 0: the rules' track width
route NET WIDTH top|bottom free|locked POINT...   a generator's, locked and with no copper, is laid first
pour NET top|bottom
track NET top|bottom WIDTH X0 Y0 X1 Y1 [ROUTE LEG]   NET is - for none
via NET X Y DIAMETER DRILL [ROUTE]
```

A route's points are pins (`REF.PAD`) and waypoints (`X Y`, with `t` or
`b` after if it must be on the top or bottom there). Its copper is written
as tracks and vias tagged with the route's number (and the leg, between
which two points), so a board reads back exactly as it was; a pour's vias
are made again with it.

Footprints (`parts.l8`): `rp2040`, `w25q16`, `mcp73871`, `sot23-5`,
`sot23-5i`, `sot23-5o`, `sot23-6`, `sot23`, `sot23r`, `xtal3225`, `r0603`,
`c0603`, `r1206`, `ptc1206`, `usb4105`, `fpc14`, `fpc40`, `mh25`,
`wirehole`, `ss12d00`, `pcm12`, `esp32s3`, `sod123`, `pads2`, `jst-ph2`,
`jst-ph2s`, `tact5`, `post3015`, `ledside`, `dome6`, `tp1`, `tph`,
`r0805`, `c0805`, `soic14`, `led0603`. Each is from its datasheet's land
pattern, or KiCad's (turned over to y up: `fp_flip_y`).

## How it is built

`paint.l8` draws everything as quads one shader shapes per pixel (round
boxes, round-ended lines, arcs, the board with its grid, and Rubik from
`../skate/font.l8`), so edges are clean at every zoom. `draw.l8` draws the
board with level of detail: part names once readable, then pin names in
their pads. `view.l8` is the camera, `touch.l8` turns fingers into taps,
drags and pinches, `edit.l8` is the ways of looking and Route all (the
editing it once did is shut off: `VIEW_ONLY`), and `ui.l8` the title,
toolbar, card and toasts; `route.l8` the router and
routes, `pour.l8` the pours (a mask on the router's grid, drawn as a
texture). `case.l8` is the case (its layers, drawn as a texture too, and
its cut file), `view3d.l8` the 3D view (each layer of wood drawn as its
two faces, cut by its mask, and walls along every edge of its outline and
holes where wood meets air; lit by one shader, with a shadow map from the
lamp; built again only when something in it moves), `steps.l8` the steps
of putting it together, `fab.l8` the files for
the board house, `sourcing.l8` the
parts' numbers, and `order.l8` the *Make it* panel. With nothing moving
the page stops redrawing.

## Not built yet

Ordering through an API (none of the makers lets a program pay); text
on the silkscreen; a schematic (nets come from the generators); thermal
reliefs on pours; length matching or differential pairs (USB); parts on
the bottom side; the programs, for the handheld and the dock.
