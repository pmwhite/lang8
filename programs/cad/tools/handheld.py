# Writes the handheld (~/src/handheld) as a board file: its parts placed,
# as small as its screen and buttons allow, and its nets. Placement and pin
# assignment follow the ESP32-S3 module's pins; see "The handheld" in
# programs/cad/README.md. tools/finish.l8 routes it into
# programs/cad/handheld.pcb, the whole design (make cad-boards does both):
#
#   python3 programs/cad/tools/handheld.py .build/handheld-placed.pcb
#
# The board is 77 x 86 mm, its middle at 0, 0. A 2.8 inch screen lies on
# its side across the top (over the ESP32-S3 and most of the rest), the
# buttons below it, the power at the top right; the case's bolts go
# through the board's corners, so its rim is thin all round.
import os
# (Overrides, for trying layouts: HH_MX=-3.5 and the like in the
# environment.)
def knob(name, default): return float(os.environ.get("HH_" + name, default))


P = []   # (ref, fp, x, y, rot, value)
def part(ref, fp, x, y, rot=0, value=""): P.append((ref, fp, x, y, rot, value))

BW, BH = 77.0, 86.0
# The screen module's middle (its window is 2.75 mm left of that); its flex
# leaves its right end. Set 1.85 mm right of where the window would be in
# the middle (as far as the case's side allows), to keep its metal 2.6 mm
# from the module's antenna.
SX, SY = 4.6, 11.0

# The computer: an ESP32-S3 module (Wi-Fi, Bluetooth LE, USB of its own,
# flash and PSRAM inside), on its side at the left edge, its antenna's end
# at the board's edge, out past the screen's side (nothing metal over it,
# no copper under it). Its right end faces the screen's connector, level
# with it: the screen's eleven parallel lines go straight across from its
# twelve pins there, in the connector's order (see the nets). Its bottom
# row faces the D-pad (IO4-7, IO15, and Back), Home, B and A (IO16-18),
# and USB (IO19, IO20, at its right end, as the module has them). Its top
# row: the battery's voltage (IO2, an ADC pin), the screen's tearing
# signal (IO38), the backlight's brightness (IO39) and the serial port.
MX, MY = knob("MX", -25.75), knob("MY", 11.0)
part("U1", "esp32s3", MX, MY, 90, "ESP32-S3")
# Its supply's caps and its enable's RC (10k up, 1 uF down: it starts once
# the 3.3 V is up), left of its bottom row's 3V3 and EN, under the antenna's
# end (but not under the antenna).
part("C2", "c0603", -34.0, -0.6, 0, "10u")
part("C3", "c0603", -34.0, -2.1, 0, "100n")
part("R1", "r0603", -34.0, -3.6, 0, "10k")
part("C1", "c0603", -34.0, -5.1, 0, "1u")
# Test points, for a jig of pogo pins from under the case (through a window
# in its back, under a sticker): to load the first program, or to recover
# from a bad one. Away from the screen and from the battery's and the
# receiver's pockets, two rows of four, 2.54 mm apart: 5V, GND, D+, D- and
# EN, BOOT (IO0: low at reset to load by the serial port), TX, RX.
TPX, TPY = knob("TPX", 30.0), knob("TPY", -5.5)
for i, (ref, name) in enumerate([("TP8", "5V"), ("TP4", "GND"), ("TP6", "D+"), ("TP7", "D-"),
                                  ("TP1", "EN"), ("TP5", "BOOT"), ("TP2", "TX"), ("TP3", "RX")]):
    part(ref, "tph", TPX + (i // 4) * 2.54, TPY - (i % 4) * 2.54, 0, name)

# The screen's connector, where the end of its flex comes once folded back
# under the module (about 28 mm in from the module's right end), its pins
# facing the ESP32-S3, contact 1 at the bottom: its busy end (reset, the
# interface straps, the backlight) at the top. Its unused read and data
# pins are tied high, as its driver allows: one block of 3.3 V.
JX, JY = knob("JX", SX + 10.25), SY
part("J3", "fpc40", JX, JY, 90, "NHD-2.8")
# Backlight: its four LEDs (160 mA together at 3.1 V) from the system
# supply, their cathodes together (side by side on the connector) through a
# current sink: Q1 (a logic-level MOSFET) and a 1 ohm sense resistor, held
# by an op-amp at 157 mA however the supply goes (5 V on a charger, 3.4 to
# 4.2 V on the battery). IO39 high sets it (through a divider: 3.3 V to
# 0.157 V), and PWM on it dims it; with the 3.3 V off the gate is pulled
# down. Above the connector's LED pins.
QX, QY = knob("QX", -5.5), knob("QY", 0.0)
part("R2", "r1206", JX + QX, JY + 15.5 + QY, 270, "1R")
part("Q1", "sot23", JX + QX, JY + 20.0 + QY, 270, "AO3400A")
part("U9", "sot23-5o", JX + QX - 4.0, JY + 20.0 + QY, 0, "LMV321")
part("C18", "c0603", JX + QX - 4.0, JY + 23.0 + QY, 0, "100n")
part("R3", "r0603", JX + QX - 7.5, JY + 21.5 + QY, 90, "20k")      # IO39 to the setting
part("R26", "r0603", JX + QX - 7.5, JY + 18.0 + QY, 90, "1k")      # the setting to ground
part("R27", "r0603", JX + QX - 2.0, JY + 24.5 + QY, 0, "100k")     # the gate down when off
part("R28", "r0603", JX + QX - 4.0, JY + 16.3 + QY, 0, "100R")     # the op-amp into the gate
# Power, all at the top right: the switch on the top edge, the LDO beside
# it; the charger, its fuse and the battery's socket under them; the
# battery's wire, and its plug, up through a slot in the board over the
# battery. The switch only turns the LDO on and off (its EN to the system
# supply, or to ground): it carries no current to speak of.
part("SW1", "pcm12", 23.5, 41.35, 0, "PCM12")  # its knob 0.3 mm in from the case's side, in the rim's slot
part("U4", "sot23-5", 14.0, 39.0, 0, "AP2112K-3.3")
part("C17", "c0603", 17.5, 39.0, 90, "1u")               # LDO in
part("C11", "c0603", 10.5, 39.0, 90, "1u")               # LDO out
part("U3", "mcp73871", 28.0, 31.0, int(knob("U3R", 180)), "MCP73871")
part("R6", "r0603", 23.0, 34.0, 90, "2k")
# (Its THERM and PROG3 must not float: 10k for "no thermistor", as its
# datasheet asks, and 100k to end charging at 10 mA.)
part("R24", "r0603", knob("R24X", 25.8), knob("R24Y", 35.8), 0, "10k")
part("R25", "r0603", knob("R25X", 32.0), knob("R25Y", 34.5), 0, "100k")
part("C10", "c0603", 23.0, 30.5, 90, "100n")             # VSYS
part("C14", "c0603", 21.5, 30.5, 90, "10u")              # VSYS bulk
# (The charger's input and battery pins each bypassed, as its datasheet
# asks: 4.7 uF at least.)
part("C19", "c0603", knob("C19X", 24.0), knob("C19Y", 27.0), 90, "10u")
part("C20", "c0603", knob("C20X", 36.5), knob("C20Y", 23.0), 0, "10u")
part("F1", "ptc1206", 33.5, 25.5, 90, "1.1A")            # holds 1.1 A: Wi-Fi's bursts and the backlight
part("J2", "jst-ph2", 35.5, 30.0, 90, "JST-PH")
part("WH1", "wirehole", 28.5, 23.5, 0, "")                # the battery's wire and plug up
# No USB socket: programs come over the air, and charging is wireless.
# USB (and 5 V for the charger) is on the test points above.
# The wireless charging receiver's two wires, up through the board from
# where it lies against the back (the `qi` line below), and a Schottky
# diode, so that a jig's 5 V does not feed back into it.
part("J4", "pads2", -5.27, -10.0, 0, "QI")   # soldered from below: the wires come straight up into it
part("D2", "sod123", 2.0, -10.0, 0, "B5819W")
# The battery's voltage, halved for an ADC pin, by the charger (1M each:
# little back into the module when it is off).
part("R9", "r0603", 31.0, 17.5, 90, "1M")
part("R10", "r0603", 29.5, 17.5, 90, "1M")
part("C4", "c0603", 28.0, 17.5, 90, "100n")
# The charge lights, between the D-pad and A and B, up through holes in
# the front: four for the battery's level and one for full. They need no
# program: run from the charger's input, they light only on a charger.
# A quad comparator weighs the battery (halved, by its own divider: the
# ADC's would be pulled down by the ESP32-S3 when it is off) against four
# steps of a 2.5 V reference (3.6, 3.75, 3.9 and 4.05 V, as the battery
# reads while charging); each lights its LED as the battery passes it.
# Full is the charger's own STAT2.
LX = [-7.0, -3.5, 0.0, 3.5, 7.0]
for i, x in enumerate(LX):
    part(f"D{3 + i}", "led0603", x, -31.0, 0, "green")
    part(f"R{11 + i}", "r0603", x, -28.6, 90, "1k")
part("U7", "soic14", 0.0, -21.5, 180, "LM339")   # its outputs down to the lights, its inputs up to the steps
part("C5", "c0603", 4.8, -20.2, 90, "100n")
part("U8", "sot23r", 8.0, -16.0, 0, "LM4040-2.5")
part("R16", "r0603", 8.0, -12.8, 0, "10k")         # the reference's bias, from the charger's input
part("R17", "r0603", 7.5, -20.0, 90, "20k")        # 2.5 V down to the steps
part("R18", "r0603", 9.0, -20.0, 90, "3k")
part("R19", "r0603", 10.5, -20.0, 90, "3k")
part("R20", "r0603", 12.0, -20.0, 90, "3k")
part("R21", "r0603", 13.5, -20.0, 90, "75k")
RLX, RLY = knob("RLX", 17.0), knob("RLY", -18.0)
part("R22", "r0603", RLX, RLY, 90, "1M")       # the battery, halved, for the lights
part("R23", "r0603", RLX + 1.5, RLY, 90, "1M")
# The case's bolts, through the board's corners.
for i, (x, y) in enumerate([(-35.0, 39.5), (35.0, 39.5), (-35.0, -39.5), (35.0, -39.5)]):
    part(f"H{i + 1}", "mh25", x, y, 0, "")
# Buttons: the D-pad and A, B under the screen's ends, Back and Home low
# between them.
def dpad(dx, dy): return (-24.0 + dx * 7.0, -27.5 + dy * 7.0)
for ref, name, (dx, dy) in [("SW2", "UP", (0, 1)), ("SW3", "DOWN", (0, -1)),
                            ("SW4", "LEFT", (-1, 0)), ("SW5", "RIGHT", (1, 0))]:
    x, y = dpad(dx, dy); part(ref, "dome6", x, y, 0, name)
part("SW6", "dome6", 28.0, -24.0, 0, "A")
part("SW7", "dome6", 17.0, -31.0, 0, "B")
part("SW8", "dome6", -9.5, -37.0, 0, "BACK")
part("SW9", "dome6", 9.5, -37.0, 0, "HOME")

N = []
def net(name, w, *pins): N.append((name, w, list(pins)))
net("EN", 0, "U1.EN", "R1.2", "C1.1", "TP1.1")
net("BOOT", 0, "U1.IO0", "TP5.1")
net("TXD0", 0, "U1.TXD0", "TP2.1")
net("RXD0", 0, "U1.RXD0", "TP3.1")
# (The screen on its 8-bit parallel interface, 8080 style, which the
# ESP32-S3's LCD peripheral drives by DMA: about twice the frames a second
# of its SPI. Straight across from the module's end, in the connector's
# order: chip select, data/command, write, then its DB8-DB15, then reset.
# Three of these are the module's strapping pins (IO3, IO46, IO45): the
# screen's inputs leave them be at reset, and reset held low by IO45's
# pulldown until the program starts is as wanted.)
LCD = [("LCD_CS", 3, "CSX"), ("LCD_DC", 46, "DCX"), ("LCD_WR", 9, "WRX")] + [
    (f"LCD_D{i}", g, f"DB{8 + i}") for i, g in enumerate([10, 11, 12, 13, 14, 21, 47, 48])] + [
    ("LCD_RESET", 45, "RES")]
for name, g, pin in LCD:
    net(name, 0, f"U1.IO{g}", f"J3.{pin}")
# (Its tearing signal, to draw between its refreshes; the backlight's
# switch: from the module's top row.)
net("LCD_TE", 0, "U1.IO38", "J3.TE")
net("BL_PWM", 0, "U1.IO39", "R3.1")
net("BL_SET", 0, "R3.2", "R26.1", "U9.IN+")
net("BL_DRIVE", 0, "U9.OUT", "R28.1")
net("BL_GATE", 0, "R28.2", "Q1.G", "R27.1")
net("BL_S", 0.3, "Q1.S", "R2.1", "U9.IN-")
net("BAT_SENSE", 0, "U1.IO2", "R9.2", "R10.1", "C4.1")
net("BL_K", 0.3, "J3.LEDK1", "J3.LEDK2", "J3.LEDK3", "J3.LEDK4", "Q1.D")
net("USB_DP", 0, "U1.IO20", "TP6.1")
net("USB_DM", 0, "U1.IO19", "TP7.1")
net("VBAT", 0.4, "J2.VBAT", "F1.1")
net("VBAT_F", 0.4, "F1.2", "U3.VBAT14", "U3.VBAT15", "U3.VBAT_SENSE", "R9.1", "R22.1", "C20.1")
net("VQI", 0.4, "J4.V", "D2.A")
# (The charger's input: the receiver's, or a jig's 5 V; and what lights
# the charge lights.)
net("CHG_IN", 0.4, "D2.K", "TP8.1", "U3.IN18", "U3.IN19", "U3.VPCC", "U3.CE", "U3.PROG2",
    "U7.VCC", "C5.1", "R16.1", "C19.1", *[f"R{11 + i}.1" for i in range(5)])
net("VREF", 0, "R16.2", "U8.K", "R17.1")
# (The comparators in the order their outputs meet the lights, left to
# right: 4, 3, 2, 1; so the steps go to them that way round.)
net("T4", 0, "R17.2", "R18.1", "U7.IN1+")
net("T3", 0, "R18.2", "R19.1", "U7.IN2+")
net("T2", 0, "R19.2", "R20.1", "U7.IN3+")
net("T1", 0, "R20.2", "R21.1", "U7.IN4+")
net("BAT_LVL", 0, "R22.2", "R23.1", "U7.IN1-", "U7.IN2-", "U7.IN3-", "U7.IN4-")
for i in range(5):
    net(f"LED{i + 1}", 0, f"R{11 + i}.2", f"D{3 + i}.A")
net("LVL1", 0, "D3.K", "U7.OUT4")
net("LVL2", 0, "D4.K", "U7.OUT3")
net("LVL3", 0, "D5.K", "U7.OUT2")
net("LVL4", 0, "D6.K", "U7.OUT1")
net("FULL", 0, "D7.K", "U3.STAT2")
# (The system supply: the LDO's input, and the backlight's anode, straight
# up from the screen's connector to it.)
net("VSYS", 0.4, "U3.OUT1", "U3.OUT20", "C14.1", "C10.1", "U4.VIN", "C17.1", "J3.LEDA", "SW1.1")
net("PWR_EN", 0, "SW1.COM", "U4.EN")
net("PROG1", 0, "U3.PROG1", "R6.1")
net("THERM", 0, "U3.THERM", "R24.1")
net("PROG3", 0, "U3.PROG3", "R25.1")
net("3V3", 0.4, "U4.VOUT", "C11.1", "U1.3V3", "C2.1", "C3.1", "R1.1", "U9.VCC", "C18.1",
    "J3.VDD", "J3.VDDI", "J3.RDX", "J3.SDA", "J3.IM0", *[f"J3.DB{i}" for i in range(8)])
gnd = ["U1.GND1", "U1.GND40", "U1.GND41", "C1.2", "C2.2", "C3.2", "C4.2", "R10.2", "TP4.1",
       "J3.GND1", "J3.IM1", "J3.IM2", "J3.MP1", "J3.MP2", "R2.2", "U9.GND", "C18.2", "R26.2", "R27.2",
       "SW1.3", "C19.2", "C20.2",
       "U7.GND", "U8.A", "R24.2", "R25.2", "R21.2", "R23.2", "C5.2", "U3.VSS10", "U3.VSS11", "U3.EP", "U3.SEL", "U3.TE",
       "R6.2", "U4.GND", "J2.GND", "J4.GND"]
# (The screen's second ground pin, 39, is joined to its first on its flex:
# the board leaves it be, and its backlight's anode beside it has the way
# out.)
gnd += [f"C{i}.2" for i in (10, 11, 14, 17)]
for i in range(2, 10):
    gnd += [f"SW{i}.{p}" for p in ("GN", "GE", "GS", "GW")]
net("GND", 0.4, *gnd)
# (The buttons' lines leave the bottom row in the order they fan out:
# the D-pad's and Back's left of Home's, B's and A's.)
LEFT_SIDE = [["LEFT", "UP", "DOWN", "RIGHT", "BACK"], ["UP", "LEFT", "DOWN", "RIGHT", "BACK"],
             ["LEFT", "DOWN", "UP", "RIGHT", "BACK"]][int(knob("GP", 0))]
RIGHT_SIDE = [["HOME", "B", "A"], ["A", "B", "HOME"], ["B", "HOME", "A"]][int(knob("GR", 0))]
SW_OF = {"UP": "SW2", "DOWN": "SW3", "LEFT": "SW4", "RIGHT": "SW5", "BACK": "SW8",
         "HOME": "SW9", "B": "SW7", "A": "SW6"}
for name, g in list(zip(LEFT_SIDE, [4, 5, 6, 7, 15])) + list(zip(RIGHT_SIDE, [16, 17, 18])):
    net(f"BTN_{name}", 0, f"U1.IO{g}", f"{SW_OF[name]}.SIG")

def mm(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s
out = ["# The handheld game controller (~/src/handheld), laid out again for",
       "# routing, as small as its screen and buttons allow (see",
       "# programs/cad/README.md). Written by tools/handheld.py: change that,",
       "# not this.",
       f"board {mm(BW)} {mm(BH)} 4 Handheld",
       "rules 0.15 0.25 0.6 0.3",
       # The case: 3.2 mm birch ply, a 2.5 mm rim (its bolts go through the
       # board), the screen's middle, the battery on its side under the top
       # half of the board.
       f"case 3.2 2.5 {mm(SX)} {mm(SY)} 0.5 17 90",
       # The wireless charging receiver, against the back under the
       # buttons, clear of the battery.
       "qi 0 -22"]
for ref, fp, x, y, rot, val in P:
    out.append(f"part {ref} {fp} {mm(x)} {mm(y)} {rot} {val}".rstrip())
for name, w, pins in N:
    out.append(f"net {name} {w:g} " + " ".join(pins))
import sys
open(sys.argv[1], "w").write("\n".join(out) + "\n")
