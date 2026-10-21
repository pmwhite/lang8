# Writes the handheld (~/src/handheld) as a board file: its parts placed,
# as small as its screen and buttons allow, and its nets. Placement and pin
# assignment follow the ESP32-S3 module's pins; see "The handheld" in
# programs/cad/README.md. tools/finish.l8 routes it into
# programs/cad/handheld.pcb, the whole design (make cad-boards does both):
#
#   python3 programs/cad/tools/handheld.py .build/handheld-placed.pcb
#
# The board is 79 x 86 mm, its middle at 0, 0. A 2.8 inch screen lies on
# its side across the top (over the ESP32-S3 and most of the rest), the
# buttons below it, the power at the top right; the case's bolts go
# through the board's corners, so its rim is thin all round.
import os
# (Overrides, for trying layouts: HH_MX=-3.5 and the like in the
# environment.)
def knob(name, default): return float(os.environ.get("HH_" + name, default))


P = []   # (ref, fp, x, y, rot, value)
def part(ref, fp, x, y, rot=0, value=""): P.append((ref, fp, x, y, rot, value))

BW, BH = 79.0, 86.0
# The screen module's middle (its picture is 2.75 mm left of that); its
# flex leaves its right end. Set so that its picture is in the middle,
# across, of the board and the case: the same margin each side (its metal
# 1.65 mm from the module's antenna; 2.65 mm of wood outside its flex's
# fold).
SX, SY = 2.75, 11.0

# The computer: an ESP32-S3 module (Wi-Fi, Bluetooth LE, USB of its own,
# flash and PSRAM inside), on its side at the left edge, its antenna's end
# at the board's edge, out past the screen's side (nothing metal over it,
# no copper under it). Its right end faces the screen's connector, level
# with it: the screen's eleven parallel lines go straight across from its
# twelve pins there, in the connector's order (see the nets). Its bottom
# row faces the arrows (IO4-7, IO15, and Back), Home, B and A (IO16-18),
# and USB (IO19, IO20, at its right end, as the module has them). Its top
# row: the battery's voltage (IO2, an ADC pin), the screen's tearing
# signal (IO38), the backlight's brightness (IO39) and the serial port.
MX, MY = knob("MX", -26.75), knob("MY", 11.0)
part("U1", "esp32s3", MX, MY, 90, "ESP32-S3")
# Its supply's caps and its enable's RC (10k up, 1 uF down: it starts once
# the 3.3 V is up), left of its bottom row's 3V3 and EN, under the antenna's
# end (but not under the antenna).
part("C2", "c0603", -35.0, -0.6, 0, "10u")
part("C3", "c0603", -35.0, -2.1, 0, "100n")
part("R1", "r0603", -35.0, -3.6, 0, "10k")
part("C1", "c0603", -35.0, -5.1, 0, "1u")
# A way out of a hung program, whatever it does: Power held 7.5 s pulls
# EN low for 0.4 s (a push-button reset timer, TPS3422: 0.25 uA, its own
# pull-up on the button's line, its output open drain onto the RC above),
# and the module starts again. Its bypass beside it.
part("U10", "uson6", -35.0, -7.0, 0, "TPS3422")
part("C23", "c0603", -35.0, -8.8, 0, "100n")
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
# current sink: Q1 (a logic-level MOSFET) and a 1 ohm (1%) sense resistor,
# held by an op-amp at 99 mA (the screen's pin table gives 100 mA, its
# electrical table 160 most: the lower, for the LEDs' life) however the
# supply goes (5 V on a charger, the battery's 3.4 to 4.2 V; below about
# 3.6 V it dims a little, the LEDs wanting up to 3.4 V). IO39 high sets it
# (through a divider, 20k and 620R: 3.3 V to 0.099 V), and PWM on it dims it; with the
# op-amp off the gate is pulled down. Its feedback through 1k, with 4.7 nF
# from the op-amp's output back to it, keeps the loop steady with the
# MOSFET's gate on it. The op-amp is powered from a pin (IO1, one that
# holds in deep sleep): off, it draws nothing, and its offset cannot leave
# the LEDs glowing. Above the connector's LED pins.
QX, QY = knob("QX", -5.5), knob("QY", 0.0)
part("R2", "r1206", JX + QX, JY + 15.5 + QY, 270, "1R")
part("Q1", "sot23", JX + QX, JY + 20.0 + QY, 270, "AO3400A")
part("U9", "sot23-5o", JX + QX - 4.0, JY + 20.0 + QY, 0, "LMV321")
part("C18", "c0603", JX + QX - 4.0, JY + 23.0 + QY, 0, "100n")
part("R3", "r0603", JX + QX - 7.5, JY + 21.5 + QY, 90, "20k")      # IO39 to the setting
part("R26", "r0603", JX + QX - 7.5, JY + 18.0 + QY, 90, "620R")    # the setting to ground
part("R27", "r0603", JX + QX - 2.0, JY + 24.5 + QY, 0, "100k")     # the gate down when off
part("R28", "r0603", JX + QX - 4.0, JY + 16.3 + QY, 0, "100R")     # the op-amp into the gate
part("R30", "r0603", JX + QX - 10.0, JY + 21.0 + QY, 90, "1k")      # the sense back to it
part("C21", "c0603", JX + QX - 10.0, JY + 17.5 + QY, 90, "4.7n")     # its output back to it
# Power, all at the top right: the LDO; the charger, its fuse and the
# battery's socket under it; the battery's wire, and its plug, up through
# a slot in the board over the battery. The LDO (TLV75533 in WSON-6, its
# pad to ground: on a charger it drops 1.7 V, a few hundred mW with Wi-Fi
# busy; 25 uA) is always on: "off" is the module's deep sleep (about
# 0.1 mA in all: over a year on the battery), woken by the power button on
# the front (below).
part("U4", "wson6", 14.0, 39.0, 0, "TLV75533")
part("C17", "c0603", 17.5, 39.0, 90, "1u")               # LDO in
part("C11", "c0603", 10.5, 39.0, 90, "1u")               # LDO out
part("U3", "mcp73871", knob("U3X", 28.0), knob("U3Y", 31.0), int(knob("U3R", 180)), "MCP73871")
part("R6", "r0603", knob("R6X", 24.0), knob("R6Y", 29.9), 270, "2k")
# (Its THERM to a 10k thermistor over the battery, on the board's top: it
# stops charging outside about 3 to 44 C (the board, the battery under it,
# warmed by a dock or the sun); PROG3, 100k, ends charging at 10 mA.)
part("RT1", "r0603", knob("RTX", -8.0), knob("RTY", 24.0), 0, "NTC10k")
part("R25", "r0603", knob("R25X", 24.0), knob("R25Y", 33.0), 90, "100k")
part("C10", "c0603", knob("C10X", 26.2), knob("C10Y", 35.4), 0, "100n")             # VSYS
part("C14", "c0603", knob("C14X", 26.2), knob("C14Y", 37.0), 0, "10u")              # VSYS bulk
# (The charger's input and battery pins each bypassed, as its datasheet
# asks: 4.7 uF at least.)
part("C19", "c0603", knob("C19X", 28.3), knob("C19Y", 26.6), int(knob("C19R", 180)), "10u")
part("R31", "r0603", knob("R31X", 30.2), knob("R31Y", 35.4), 90, "270k")   # VPCC's divider
part("R32", "r0603", knob("R32X", 31.8), knob("R32Y", 35.4), 90, "100k")
part("C20", "c0603", knob("C20X", 23.9), knob("C20Y", 26.6), 0, "10u")
part("F1", "ptc1206", knob("F1X", 21.5), knob("F1Y", 38.5), 0, "1.1A")   # holds 1.1 A: Wi-Fi's bursts and the backlight
# (The battery's socket lies down, its plug going in from below, from
# over the hole its wire comes up through: 4.6 mm tall, under the screen;
# surface mount, so nothing of it goes through the board to the battery.)
part("J2", "jst-ph2sm", knob("J2X", 18.8), knob("J2Y", 31.8), 0, "JST-PH")
part("WH1", "wirehole", knob("WHX", 19.0), knob("WHY", 23.5), 0, "")   # the battery's wire and plug up
# No USB socket: programs come over the air, and charging is wireless.
# USB (and 5 V for the charger) is on the test points above.
# The wireless charging receiver's two wires, up through the board from
# where it lies against the back (the `qi` line below), straight to the
# charger through Q2, a P-channel MOSFET (its body diode toward the
# charger, and on, its gate pulled down: a diode that drops nearly
# nothing, the charger wanting 4.35 V at least to start). A jig's 5 V
# comes in through a Schottky diode, and turns Q2 off, so it does not feed
# back into the receiver.
part("J4", "pads2", -5.27, -10.0, 0, "QI")   # soldered from below: the wires come straight up into it
part("Q2", "sot23", knob("Q2X", 0.5), knob("Q2Y", -10.0), int(knob("Q2R", 270)), "AO3401A")
part("R29", "r0603", knob("R29X", 0.5), knob("R29Y", -13.0), 0, "100k")
part("C22", "c0603", knob("C22X", 26.5), knob("C22Y", -8.0), 0, "10n")   # the jig's pin, against a spark
part("D2", "sod123", knob("D2X", 26.5), knob("D2Y", -5.5), int(knob("D2R", 0)), "B5819W")
# The battery's voltage, halved for an ADC pin, by the charger (1M each:
# little back into the module when it is off; the module's pin leaks 50 nA
# at most, 25 mV here).
part("R9", "r0603", 28.0, 17.5, 90, "1M")
part("R10", "r0603", 26.5, 17.5, 90, "1M")
part("C4", "c0603", 25.0, 17.5, 90, "100n")
# The charge lights, between the arrows and A and B, up through holes in
# the front: four for the battery's level and one for full. They need no
# program: run from the charger's input, they light only on a charger.
# Two dual comparators (LM393, in JLCPCB's basic library) weigh the battery (halved, by its own divider: the
# ADC's would be pulled down by the ESP32-S3 when it is off) against four
# steps of a 2.5 V reference (3.6, 3.75, 3.9 and 4.05 V, as the battery
# reads while charging); each lights its LED as the battery passes it.
# Full is the charger's own STAT2.
LX = [-7.0, -3.5, 0.0, 3.5, 7.0]
for i, x in enumerate(LX):
    part(f"D{3 + i}", "led0603", x, -31.0, 0, "white")
    part(f"R{11 + i}", "r0603", x, -28.6, 90, "1k")
# (The left one for the two lower lights, the right one for the two upper.)
part("U7", "soic8", knob("U7X", -3.0), knob("U7Y", -21.5), int(knob("U7R", 90)), "LM393")
part("U11", "soic8", knob("U11X", 3.0), knob("U11Y", -21.5), int(knob("U7R", 90)), "LM393")
part("C5", "c0603", knob("C5X", -6.6), knob("C5Y", -21.5), 90, "100n")
part("C24", "c0603", knob("C24X", 6.8), knob("C24Y", -24.0), 90, "100n")
# (A TL431, its reference tied to its cathode: 2.5 V, 1% at worst. It
# wants 1 mA at least: 2 mA through 1k from the charger's input, only on
# a charger.)
part("U8", "sot23k", 8.0, -16.0, 0, "CJ431")
part("R16", "r0603", 8.0, -12.8, 0, "1k")         # the reference's bias, from the charger's input
part("R17", "r0603", 7.5, -20.0, 90, "20k")        # 2.5 V down to the steps
part("R18", "r0603", 9.0, -20.0, 90, "3k")
part("R19", "r0603", 10.5, -20.0, 90, "3k")
part("R20", "r0603", 12.0, -20.0, 90, "3k")
part("R21", "r0603", 13.5, -20.0, 90, "75k")
RLX, RLY = knob("RLX", 17.0), knob("RLY", -18.0)
# (330k each, 6 uA: the four inputs' bias, 250 nA at most, moves it 41 mV
# at the worst, 4 mV as they usually are.)
part("R22", "r0603", RLX, RLY, 90, "330k")     # the battery, halved, for the lights
part("R23", "r0603", RLX + 1.5, RLY, 90, "330k")
# The case's bolts, through the board's corners (40.6 up and down: their
# nuts' hexes in the screen's layer clear its pocket by 1.8 mm).
for i, (x, y) in enumerate([(-36.0, 40.6), (36.0, 40.6), (-36.0, -40.6), (36.0, -40.6)]):
    part(f"H{i + 1}", "mh25", x, y, 0, "")
# Posts beside them, as tall as the gap to the wood over the board (2 mm,
# the board being 1.2 mm thick): the foam on the battery presses the board
# up against them, so it cannot rattle between the case's layers.
for i, (x, y) in enumerate([(-30.0, 40.0), (30.0, 40.0), (-35.5, -35.0), (33.5, -32.0)]):
    part(f"M{i + 1}", "post4020", knob(f"M{i + 1}X", x), knob(f"M{i + 1}Y", y), 0, "POST")
# Buttons, tactile switches put on by the board house: the four arrows
# and A, B under the screen's ends, Back and Home low between them. The
# arrows are four buttons of their own, in a cross 7.5 mm from its middle
# (not one rocking cross: in plywood its play and its pivot are hard to
# make true; four stacks press as surely as A and B do).
def arrow(dx, dy): return (-24.0 + dx * 7.5, knob("AY", -28.0) + dy * 7.5)
for ref, name, (dx, dy) in [("SW2", "UP", (0, 1)), ("SW3", "DOWN", (0, -1)),
                            ("SW4", "LEFT", (-1, 0)), ("SW5", "RIGHT", (1, 0))]:
    x, y = arrow(dx, dy); part(ref, "tact5h", x, y, 0, name)
# (All on switches 1.7 mm tall: the gap over the board is 2, and less play
# rattles less. A and B's middle as far right as the arrows' is left.)
part("SW6", "tact5h", 29.5, -24.0, 0, "A")
part("SW7", "tact5h", 18.5, -31.0, 0, "B")
# (Back and Home low and either side of the middle, 13 mm from B: not hit
# by a thumb on B or the arrows.)
# (Small and flush, as power is, in a row with it along the bottom.)
part("SW8", "tact5h", -6.0, -39.5, 0, "BACK")
part("SW9", "tact5h", 6.0, -39.5, 0, "HOME")
# Power: a small flush button low on the right, under B and A, out of a
# thumb's way, as far right as the arrows' middle is left: its pin (IO8,
# one the module can wake from deep sleep on) held down wakes the
# handheld; held while on, it sleeps.
part("SW10", "tact5h", knob("PWX", 24.0), knob("PWY", -39.5), 0, "POWER")

N = []
def net(name, w, *pins): N.append((name, w, list(pins)))
net("EN", 0, "U1.EN", "R1.2", "C1.1", "TP1.1", "U10.RST")
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
net("BL_DRIVE", 0, "U9.OUT", "R28.1", "C21.1")
net("BL_GATE", 0, "R28.2", "Q1.G", "R27.1")
net("BL_S", 0.3, "Q1.S", "R2.1", "R30.1")
net("BL_FB", 0, "R30.2", "U9.IN-", "C21.2")
net("BAT_SENSE", 0, "U1.IO2", "R9.2", "R10.1", "C4.1")
net("BL_K", 0.5, "J3.LEDK1", "J3.LEDK2", "J3.LEDK3", "J3.LEDK4", "Q1.D")
net("USB_DP", 0, "U1.IO20", "TP6.1")
net("USB_DM", 0, "U1.IO19", "TP7.1")
net("VBAT", 0.4, "J2.VBAT", "F1.1")
net("VBAT_F", 0.4, "F1.2", "U3.VBAT14", "U3.VBAT15", "U3.VBAT_SENSE", "R9.1", "R22.1", "C20.1")
net("VQI", 0.4, "J4.V", "Q2.D")
net("JIG_5V", 0.4, "TP8.1", "D2.A", "Q2.G", "R29.1", "C22.1")
# (The charger's input held at 4.55 V at least (VPCC, 1.23 V): if the
# receiver sags under the load, the charge current falls back, rather than
# the charger stopping and starting.)
net("VPCC", 0, "U3.VPCC", "R31.2", "R32.1")
# (The charger's input: the receiver's, or a jig's 5 V; and what lights
# the charge lights.)
net("CHG_IN", 0.4, "Q2.S", "D2.K", "U3.IN18", "U3.IN19", "R31.1", "U3.CE", "U3.PROG2",
    "U7.VCC", "U11.VCC", "C5.1", "C24.1", "R16.1", "C19.1", *[f"R{11 + i}.1" for i in range(5)])
net("VREF", 0, "R16.2", "U8.K", "U8.REF", "R17.1")
# (Each comparator's output to the light nearest it: the left chip's to
# the lower two, the right's to the upper two, by the steps' end of it.)
net("T4", 0, "R17.2", "R18.1", "U11.IN2+")
net("T3", 0, "R18.2", "R19.1", "U11.IN1+")
net("T2", 0, "R19.2", "R20.1", "U7.IN2+")
net("T1", 0, "R20.2", "R21.1", "U7.IN1+")
net("BAT_LVL", 0, "R22.2", "R23.1", "U7.IN1-", "U7.IN2-", "U11.IN1-", "U11.IN2-")
for i in range(5):
    net(f"LED{i + 1}", 0, f"R{11 + i}.2", f"D{3 + i}.A")
net("LVL1", 0, "D3.K", "U7.OUT1")
net("LVL2", 0, "D4.K", "U7.OUT2")
net("LVL3", 0, "D5.K", "U11.OUT1")
net("LVL4", 0, "D6.K", "U11.OUT2")
net("FULL", 0, "D7.K", "U3.STAT2")
# (The system supply: the LDO's input, and the backlight's anode, straight
# up from the screen's connector to it.)
# (And the charger's safety timer, off (TE high): played on a pad for
# hours, the handheld would use most of the 500 mA, and the timer would
# end the charge unfinished. The charge still ends at 10 mA, by PROG3.)
net("VSYS", 0.4, "U3.OUT1", "U3.OUT20", "U3.TE", "C14.1", "C10.1", "U4.VIN", "U4.EN", "C17.1", "J3.LEDA")
net("PROG1", 0, "U3.PROG1", "R6.1")
net("THERM", 0, "U3.THERM", "RT1.1")
net("PROG3", 0, "U3.PROG3", "R25.1")
net("BL_ON", 0, "U1.IO1", "U9.VCC", "C18.1")
net("3V3", 0.4, "U4.VOUT", "C11.1", "U1.3V3", "C2.1", "C3.1", "R1.1",
    "U10.VCC", "C23.1", "J3.VDD", "J3.VDDI", "J3.RDX", "J3.SDA", "J3.IM0", *[f"J3.DB{i}" for i in range(8)])
gnd = ["U1.GND1", "U1.GND40", "U1.GND41", "C1.2", "C2.2", "C3.2", "C4.2", "R10.2", "TP4.1",
       "J3.GND1", "J3.IM1", "J3.IM2", "J3.MP1", "J3.MP2", "R2.2", "U9.GND", "C18.2", "R26.2", "R27.2",
       "C19.2", "C20.2", "C22.2", "R32.2",
       "U7.GND", "U11.GND", "C24.2", "U8.A", "RT1.2", "R25.2", "R21.2", "R23.2", "C5.2", "U3.VSS10", "U3.VSS11", "U3.EP", "U3.SEL", "R29.2",
       "R6.2", "U4.GND", "U4.EP", "J2.GND", "J4.GND", "U10.GND", "U10.TS", "U10.TST", "C23.2"]
# (The screen's second ground pin, 39, is joined to its first on its flex:
# the board leaves it be, and its backlight's anode beside it has the way
# out.)
gnd += [f"C{i}.2" for i in (10, 11, 14, 17)]
for i in range(2, 11):
    gnd += [f"SW{i}.GND", f"SW{i}.GND2"]
net("GND", 0.4, *gnd)
# (The buttons' lines leave the bottom row in the order they fan out:
# the arrows' and Back's left of Home's, B's and A's.)
LEFT_SIDE = [["LEFT", "UP", "DOWN", "RIGHT", "BACK"], ["UP", "LEFT", "DOWN", "RIGHT", "BACK"],
             ["LEFT", "DOWN", "UP", "RIGHT", "BACK"]][int(knob("GP", 0))]
RIGHT_SIDE = [["HOME", "B", "A"], ["A", "B", "HOME"], ["B", "HOME", "A"]][int(knob("GR", 0))]
SW_OF = {"UP": "SW2", "DOWN": "SW3", "LEFT": "SW4", "RIGHT": "SW5", "BACK": "SW8",
         "HOME": "SW9", "B": "SW7", "A": "SW6"}
for name, g in list(zip(LEFT_SIDE, [4, 5, 6, 7, 15])) + list(zip(RIGHT_SIDE, [16, 17, 18])):
    net(f"BTN_{name}", 0, f"U1.IO{g}", f"{SW_OF[name]}.SIG", f"{SW_OF[name]}.SIG2")
net("BTN_POWER", 0, "U1.IO8", "SW10.SIG", "SW10.SIG2", "U10.PB1")

def mm(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s
out = ["# The handheld game controller (~/src/handheld), laid out again for",
       "# routing, as small as its screen and buttons allow (see",
       "# programs/cad/README.md). Written by tools/handheld.py: change that,",
       "# not this.",
       f"board {mm(BW)} {mm(BH)} 4 Handheld",
       "rules 0.15 0.25 0.6 0.3",
       # (1.2 mm thick: the gap over it to the case's spacer is then 2 mm,
       # the buttons' switches 1.7, 0.3 left for the buttons' travel; at
       # 1.6 there would be no room for them.)
       "thickness 1.2",
       # The case: 3.2 mm birch ply, a 2.5 mm rim (its bolts go through the
       # board), the screen's middle, the battery on its side under the top
       # half of the board.
       # (And 5 mm at the bottom, for room under the buttons.)
       f"case 3.2 2.5 {mm(SX)} {mm(SY)} 0.5 17 90 5",
       # The wireless charging receiver, against the back under the
       # buttons, clear of the battery.
       "qi 0 -22"]
for ref, fp, x, y, rot, val in P:
    out.append(f"part {ref} {fp} {mm(x)} {mm(y)} {rot} {val}".rstrip())
for name, w, pins in N:
    out.append(f"net {name} {w:g} " + " ".join(pins))
# Routes laid first, and kept (tools/finish.l8 routes them before the
# rest): the 3.3 V from the regulator straight to the module, wide (its
# Wi-Fi draws 0.5 A in bursts), so the rest of the 3.3 V joins it and not
# the module through the screen's connector.
out.append("route 3V3 0.5 bottom locked U4.VOUT U1.3V3")
# (The reference's ground to the comparator's bypass, beside it: the
# pour under them is cut up by the lights' tracks.)
out.append("route GND 0.25 top locked U8.A C24.2")
# (The reset timer's TS and TST, side by side, to ground together: its
# pads are too small for the pour to reach each.)
out.append("route GND 0.15 top locked U10.TS U10.TST")
# (And its GND, between two signals' pads, out to a via to the back's pour.)
out.append("route GND 0.2 top locked drop U10.GND -36.3 -7")
# (And the charger's TE, up from its pin to the system supply's cap over
# it, before the rest come round the chip.)
out.append("route VSYS 0.25 top locked U3.TE C10.1")
# (And the charger's VPCC to its divider, then its output to the same
# caps, before the rest crowd round the chip: the output round the outside
# of the other.)
out.append("route CHG_IN 0.25 top locked U3.PROG2 R31.1")
out.append("route VPCC 0.25 top locked U3.VPCC R32.1")
out.append("route VSYS 0.4 top locked U3.OUT1 C10.1")
import sys
open(sys.argv[1], "w").write("\n".join(out) + "\n")
