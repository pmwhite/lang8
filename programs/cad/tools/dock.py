# Writes the dock as a board file, placed (tools/finish.l8 routes it into
# programs/cad/dock.pcb; make cad-boards does both): the dock that holds
# four handhelds lying flat, under a sliding lid, and charges them without
# wires (see "The dock" in programs/cad/README.md, and dock.l8 for its box).
#
#   python3 programs/cad/tools/dock.py .build/dock-placed.pcb
#
# Its board is a strip, 32 mm wide and the dock's length, down its middle
# under the dividers, where neither the transmitters nor their coils are:
# USB-C and the ESP32-S3 at its back end (the antenna out through the
# dock's back), the lights at its front, out through the front face. It
# takes 5 V from USB-C and
# switches each of the four transmitters (Adafruit 2162, 5 V in) on and
# off: it reads what the charger offers from the CC lines (its 5.1k
# pulldowns' voltage: 0.5, 1.5 or 3 A) and what is drawn through a shunt
# (an INA180 amplifies it for an ADC pin), and keeps as many on at once as
# that allows, taking turns when it cannot have all four. (A transmitter
# is rated to draw up to 2 A; charging a handheld's receiver, at its 2.5 W,
# nearer 0.8 A: the program measures, and on a 3 A charger runs two or
# three at once, or one, as it finds.) A thermistor in the middle tells it
# how warm the box is. The ESP32-S3 can also hear the handhelds (ESP-NOW),
# and its own USB loads its program.
import os
def knob(name, default): return float(os.environ.get("DK_" + name, default))

P = []   # (ref, fp, x, y, rot, value)
def part(ref, fp, x, y, rot=0, value=""): P.append((ref, fp, x, y, rot, value))

# The dock's sizes, as dock.l8 works them out (keep the two the same): the
# pockets a handheld's case and 0.75 mm each side, 6 mm between, a rim of
# 10 mm at the sides, 14 at the front and 13.5 at the back.
SLOT_W, SLOT_H, FIT, DIV, RIM, FRONT, BACK = 84.0, 93.5, 0.75, 6.0, 10.0, 14.0, 13.5
PH = SLOT_H + 2 * FIT
IH = 2 * PH + DIV
YF, YB = -IH / 2 - FRONT, IH / 2 + BACK         # the dock's front and back faces
TX_Y = [-(PH + DIV) / 2 + PH / 2 - 19.5, (PH + DIV) / 2 + PH / 2 - 19.5]   # front, back

# The board: a strip the dock's length, down its middle under the dividers
# (the transmitters and coils are either side of it), 2.1 mm in from its
# front and back faces, where its tongues reach out to them. Its middle in
# the dock's coordinates; parts below in the board's own.
BW = 32.0
BX, BY = 0.0, (YF + YB) / 2
BH = (YB - 2.1) - (YF + 2.1)
TOP, BOT = BH / 2, -BH / 2
def dy(y): return y - BY     # a dock y on the board

# At the back: USB-C, its face flush with the dock's back on the board's
# tongue; its CC pulldowns and ESD part in front of it. Beside it the
# ESP32-S3, its antenna at the board's end, out through the dock's back.
J1X = knob("J1X", 10.6)
part("J1", "usb4105", J1X, TOP + 2.1 - 3.65, 0, "USB4105")
# (Out to the sides, to leave a wide way down from each VBUS pad.)
part("R1", "r0603", J1X - knob("R1D", 4.4), TOP - 9.5, 90, "5.1k")
part("R2", "r0603", J1X + knob("R1D", 4.4), TOP - 9.5, 90, "5.1k")
part("U2", "sot23-6", J1X, TOP - 10.5, 90, "USBLC6-2SC6")
MX = knob("MX", -4.5)
part("U1", "esp32s3", MX, TOP - 12.75, 0, "ESP32-S3")
# The supply, right of the module: a 10 milliohm shunt into the switched
# 5 V (its drop amplified 50 times: 0.5 V an amp, 1.5 V at 3 A), the 3.3 V
# regulator (TI's TLV75533 in WSON-6, as the handheld's: from 5 V it drops
# 1.7 V at the module's 0.1 to 0.2 A, and that package sheds it at 100 C/W,
# where a SOT-23-5 would at 250). The amplifier reads the shunt at its own pads (routes laid
# first, below, that carry no current), bypassed at its supply, and its
# output goes to the module through 1k (were it to swing to 5 V on a
# short, the module's pin takes a milliamp, not more).
part("R3", "r1206", knob("R3X", 12.0), TOP - knob("R3Y", 30.0), int(knob("R3R", 270)), "0.01R")
part("U3", "sot23-5i", knob("U3X", 7.0), TOP - knob("U3Y", 30.0), int(knob("U3R", 0)), "INA180A2")
part("C7", "c0603", knob("C7X", 7.0), TOP - knob("C7Y", 33.0), 0, "100n")
part("R5", "r0603", knob("R5X", 3.0), TOP - knob("R5Y", 30.0), 90, "1k")
part("C6", "c0603", knob("C6X", 12.0), TOP - knob("C6Y", 35.0), 90, "10u")      # the switched 5 V
part("U4", "wson6", knob("U4X", 8.0), TOP - knob("U4Y", 18.5), int(knob("U4R", 0)), "TLV75533")
part("C1", "c0603", knob("C1X", 9.5), TOP - knob("C1Y", 15.0), 0, "1u")
part("C2", "c0603", 8.0, TOP - 22.0, 0, "1u")
# Under the module: its supply's caps, its enable's RC, test pads for its
# serial port, boot and enable.
MB = TOP - 25.5 - 3.5
part("C3", "c0603", MX - 9.0, MB, 0, "10u")
part("C4", "c0603", MX - 6.0, MB, 0, "100n")
part("R4", "r0603", MX - 9.0, MB - 2.5, 0, "10k")
part("C5", "c0603", MX - 6.0, MB - 2.5, 0, "1u")
for i, (ref, name) in enumerate([("TP1", "BOOT"), ("TP2", "TX"), ("TP3", "RX"), ("TP4", "EN"), ("TP5", "GND")]):
    part(ref, "tp1", -9.0 + 3.0 * i, MB - 7.0, 0, name)
# Four switches, one a transmitter: a P-channel MOSFET from the 5 V, its
# gate held up by 100k and pulled down through an N-channel one when the
# ESP32-S3's pin is high, through 10k, with 100 nF from gate to source: it
# turns on over about a millisecond, not at once, so the transmitter's
# input does not draw a step from the charger (and off over a few, through
# the 100k: brief, at the transmitters' currents). Left ones for the left transmitters, right for
# the right; each one's pads at the board's side, level with its
# transmitter's board, its wires straight across.
# (The back ones' below their pads, clear of the module.)
for k, sx, ty, up in [(1, -1, TX_Y[0], 1), (2, 1, TX_Y[0], 1), (3, -1, TX_Y[1] - 17.0, -1), (4, 1, TX_Y[1] - 17.0, -1)]:
    y = dy(ty)
    part(f"Q{k}", "sot23", sx * 10.0, y + up * 6.0, 90 if sx < 0 else 270, "AO3401A")
    part(f"N{k}", "sot23", sx * 4.5, y + up * 6.0, 90 if sx < 0 else 270, "2N7002")
    part(f"R{10 + k}", "r0603", sx * 10.0, y + up * 9.5, 0, "100k")    # gate up
    part(f"R{20 + k}", "r0603", sx * 4.5, y + up * 9.5, 0, "100k")     # pin's pulldown
    part(f"R{40 + k}", "r0603", sx * 4.5, y + up * knob("CGY", 12.5), 0, "10k")   # gate down, slowly
    part(f"C{10 + k}", "c0603", sx * 10.0, y + up * knob("CGY", 12.5), 0, "100n")   # gate to source
    part(f"J{1 + k}", "pads2", sx * 14.3, y, 90, f"TX{k}")
# At the front: the lights, side-looking, at the board's front edge, each
# shining out through its own slot of the wood (on a tongue of the board)
# to the dock's front face: the four pockets' (left to right as they lie:
# front left, back left, back right, front right) and, in the middle,
# power. 330 ohms: 4 mA from a pin.
LEDS = [("D1", "TX1", -14.0), ("D2", "TX3", -7.0), ("D5", "PWR", 0.0), ("D3", "TX4", 7.0), ("D4", "TX2", 14.0)]
for ref, what, x in LEDS:
    part(ref, "ledside", x, BOT + 0.95, 0, "green")
    part(f"R{30 + int(ref[1:])}", "r0603", x, BOT + 4.0, 90, "330R")
# The box's warmth: a thermistor in the middle, between the pockets, its
# divider's middle to an ADC pin, powered from another pin (high while it
# reads: no current the rest of the time).
part("RT1", "r0603", knob("RTX", 0.0), knob("RTY", 0.0), 0, "NTC10k")
part("R6", "r0603", knob("R6X", 0.0), knob("R6Y", 2.0), 0, "10k")
# Holes for the bolts that hold the board to the base.
for i, (x, y) in enumerate([(knob("H1X", 0.0), knob("H1Y", BOT + 12.0)), (knob("H2X", 0.0), knob("H2Y", -6.0)),
                            (knob("H3X", 0.0), knob("H3Y", 38.0))]):
    part(f"H{i + 1}", "mh25", x, y, 0, "")

N = []
def net(name, w, *pins): N.append((name, w, list(pins)))
net("VBUS", 0.6, "J1.A4", "J1.A9", "J1.B4", "J1.B9", "U2.VBUS", "R3.1", "U3.IN+", "U4.VIN",
    "U4.EN", "C1.1")
net("V5", 0.6, "R3.2", "U3.IN-", "U3.VS", "C6.1", "C7.1", *[f"Q{k}.S" for k in range(1, 5)],
    *[f"R{10 + k}.1" for k in range(1, 5)], *[f"C{10 + k}.1" for k in range(1, 5)])
net("3V3", 0.4, "U4.VOUT", "C2.1", "U1.3V3", "C3.1", "C4.1", "R4.1")
net("TEMP_ON", 0, "U1.IO5", "R6.1")
net("EN", 0, "U1.EN", "R4.2", "C5.1", "TP4.1")
net("BOOT", 0, "U1.IO0", "TP1.1")
net("TXD0", 0, "U1.TXD0", "TP2.1")
net("RXD0", 0, "U1.RXD0", "TP3.1")
net("USB_DP", 0, "J1.A6", "J1.B6", "U2.IO1", "U2.IO1'", "U1.IO20")
net("USB_DM", 0, "J1.A7", "J1.B7", "U2.IO2", "U2.IO2'", "U1.IO19")
# (What the charger offers, read on its CC lines; what is drawn: ADC pins.)
net("CC1", 0, "J1.CC1", "R1.2", "U1.IO1")
net("CC2", 0, "J1.CC2", "R2.2", "U1.IO2")
net("ISENSE", 0, "U3.OUT", "R5.1")
net("ISENSE_F", 0, "R5.2", "U1.IO9")
net("TEMP", 0, "R6.2", "RT1.1", "U1.IO4")
EN_PIN = {1: 10, 2: 11, 3: 12, 4: 13}
for k in range(1, 5):
    net(f"GATE{k}", 0, f"Q{k}.G", f"R{10 + k}.2", f"R{40 + k}.1", f"C{10 + k}.2")
    net(f"PULL{k}", 0, f"R{40 + k}.2", f"N{k}.D")
    net(f"ON{k}", 0, f"U1.IO{EN_PIN[k]}", f"N{k}.G", f"R{20 + k}.1")
    net(f"TX{k}", 0.8, f"Q{k}.D", f"J{1 + k}.V")
# (The lights: each from a pin through its resistor.)
LED_PIN = {"D1": 14, "D2": 21, "D3": 47, "D4": 48, "D5": 38}
for ref, what, x in LEDS:
    r = f"R{30 + int(ref[1:])}"
    net(f"LIGHT_{what}", 0, f"U1.IO{LED_PIN[ref]}", f"{r}.1")
    net(f"LED_{what}", 0, f"{r}.2", f"{ref}.A")
gnd = ["J1.A1", "J1.A12", "J1.B1", "J1.B12", "J1.SH1", "J1.SH2", "J1.SH3", "J1.SH4",
       "R1.1", "R2.1", "U2.GND", "U3.GND", "U4.GND", "U4.EP", "C1.2", "C2.2", "C3.2", "C4.2",
       "C5.2", "C6.2", "C7.2", "U1.GND1", "U1.GND40", "U1.GND41", "TP5.1", "RT1.2"]
gnd += [f"N{k}.S" for k in range(1, 5)] + [f"R{20 + k}.2" for k in range(1, 5)]
gnd += [f"J{1 + k}.GND" for k in range(1, 5)] + [f"{ref}.K" for ref, _, _ in LEDS]
net("GND", 0.6, *gnd)

def mm(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s
out = ["# The dock for four handhelds (see programs/cad/README.md). Written by",
       "# tools/dock.py: change that, not this.",
       f"board {mm(BW)} {mm(BH)} 0 Dock",
       "rules 0.15 0.25 0.6 0.3",
       # Its box: 3.2 mm birch ply; the handhelds' cases, 84 x 93.5 x 22.4,
       # their receivers 20.75 mm down from their middles; the board's
       # middle.
       f"dock 3.2 {mm(SLOT_W)} {mm(SLOT_H)} 22.4 -20.75 {mm(BX)} {mm(BY)}"]
for ref, fp, x, y, rot, val in P:
    out.append(f"part {ref} {fp} {mm(x)} {mm(y)} {rot} {val}".rstrip())
for name, w, pins in N:
    out.append(f"net {name} {w:g} " + " ".join(pins))
# Routes laid first, and kept (tools/finish.l8 routes them before the
# rest): the supply's trunk, wide, from both of USB-C's VBUS pads to the
# shunt, and from the shunt to each switch, so that the current goes
# nowhere else (not through the ESD part's or the regulator's pads, nor
# the amplifier's); the regulator's output to the module; and the
# amplifier's inputs from the shunt's pads, thin, carrying nothing.
out.append("route 3V3 0.4 top locked U4.VOUT U1.3V3")
# (The regulator's ground pin strapped into its middle pad.)
out.append("route GND 0.25 top locked U4.GND U4.EP")
# (1.2 mm: 3 A at a 20 C rise, in 1 oz copper.)
for a, b, w in [("J1.A4", "R3.1", 1.2), ("J1.A9", "R3.1", 1.2),
                ("R3.2", "C6.1", 1.2), ("C6.1", "Q4.S", 1.2), ("Q4.S", "Q2.S", 1.2),
                ("C6.1", "Q3.S", 1.2), ("Q3.S", "Q1.S", 1.2),
                ("U3.IN+", "R3.1", 0.25), ("U3.IN-", "R3.2", 0.25)]:
    out.append(f"route {'VBUS' if b in ('R3.1', 'U4.VIN') else 'V5'} {w:g} top locked {a} {b}")
import sys
open(sys.argv[1], "w").write("\n".join(out) + "\n")
