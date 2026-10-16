# Writes the dock as a board file, placed (tools/finish.l8 routes it into
# programs/cad/dock.pcb; make cad-boards does both): the dock that holds
# four handhelds lying flat, under a sliding lid, and charges them without
# wires (see "The dock" in programs/cad/README.md, and dock.l8 for its box).
#
#   python3 programs/cad/tools/dock.py .build/dock-placed.pcb
#
# Its board is a strip, 32 x 80 mm, down the dock's middle under the
# dividers, where neither the transmitters nor their coils are: USB-C at
# its back end, out through the dock's back face; the ESP32-S3 at its
# front end, its antenna at the board's edge. It takes 5 V from USB-C and
# switches each of the four transmitters (Adafruit 2162, 5 V in) on and
# off: it reads what the charger offers from the CC lines (its 5.1k
# pulldowns' voltage: 0.5, 1.5 or 3 A) and what is drawn through a shunt
# (an INA180 amplifies it for an ADC pin), and keeps as many on at once as
# that allows, taking turns when it cannot have all four. The ESP32-S3 can
# also hear the handhelds (ESP-NOW), and its own USB loads its program.
import os
def knob(name, default): return float(os.environ.get("DK_" + name, default))

P = []   # (ref, fp, x, y, rot, value)
def part(ref, fp, x, y, rot=0, value=""): P.append((ref, fp, x, y, rot, value))

BW, BH = 32.0, 80.0
# Where the board's middle is in the dock (the dock's middle at 0, 0): its
# back end 2.1 mm in from the dock's back face, where the USB socket's
# tongue reaches out to it.
BX, BY = 0.0, 60.0

# USB-C, its face flush with the dock's back; its CC pulldowns and ESD
# part in front of it.
part("J1", "usb4105", 0.0, 38.45, 0, "USB4105")
part("R1", "r0603", -3.0, 31.0, 90, "5.1k")
part("R2", "r0603", 3.0, 31.0, 90, "5.1k")
part("U2", "sot23-6", 0.0, 27.0, 90, "USBLC6-2SC6")
# The supply: a 20 milliohm shunt into the switched 5 V (its drop
# amplified 50 times: 1 V an amp), the 3.3 V regulator.
part("R3", "r1206", knob("R3X", 8.5), knob("R3Y", 31.0), 0, "0.02R")
part("U3", "sot23-5i", knob("U3X", 12.5), knob("U3Y", 26.5), 0, "INA180A2")
part("C6", "c0603", 8.0, 25.0, 90, "10u")            # the switched 5 V
part("U4", "sot23-5", -9.5, 29.0, 0, "AP2112K-3.3")
part("C1", "c0603", knob("C1X", -9.5), knob("C1Y", 32.5), int(knob("C1R", 0)), "1u")
part("C2", "c0603", -9.5, 25.0, 0, "1u")
# Four switches, one a transmitter: a P-channel MOSFET from the 5 V, its
# gate held up by 100k and pulled down through an N-channel one when the
# ESP32-S3's pin is high. Left ones for the left transmitters, right for
# the right; the back ones' pads at the board's sides level with their
# boards, the front ones' at its front corners, beside the antenna (their
# wires go down the dock's middle).
ROWS = [(1, -1, 3.0), (3, -1, 15.0), (2, 1, 3.0), (4, 1, 15.0)]
for k, sx, y in ROWS:
    part(f"Q{k}", "sot23", sx * 11.0, y, 90 if sx < 0 else 270, "AO3401A")
    part(f"N{k}", "sot23", sx * 5.0, y, 90 if sx < 0 else 270, "2N7002")
    part(f"R{10 + k}", "r0603", sx * 11.0, y - 3.2, 0, "100k")    # gate up
    part(f"R{20 + k}", "r0603", sx * 5.0, y - 3.2, 0, "100k")     # pin's pulldown
for k, sx, y in [(1, -1, -37.5), (2, 1, -37.5), (3, -1, 19.0), (4, 1, 19.0)]:
    part(f"J{1 + k}", "pads2", sx * 14.3, y, 90, f"TX{k}")
# The computer, its antenna at the front edge; its supply's caps, its
# enable's RC, test pads for its serial port, boot and enable.
part("U1", "esp32s3", 0.0, -27.25, 180, "ESP32-S3")
part("C3", "c0603", 11.8, -31.0, 90, "10u")
part("C4", "c0603", 11.8, -28.0, 90, "100n")
part("R4", "r0603", 11.8, -25.0, 90, "10k")
part("C5", "c0603", 11.8, -22.0, 90, "1u")
part("TP1", "tp1", -10.5, -9.0, 0, "BOOT")
part("TP2", "tp1", -7.5, -9.0, 0, "TX")
part("TP3", "tp1", -4.5, -9.0, 0, "RX")
part("TP4", "tp1", -1.5, -9.0, 0, "EN")
part("TP5", "tp1", 1.5, -9.0, 0, "GND")

N = []
def net(name, w, *pins): N.append((name, w, list(pins)))
net("VBUS", 0.6, "J1.A4", "J1.A9", "J1.B4", "J1.B9", "U2.VBUS", "R3.1", "U3.IN+", "U4.VIN",
    "U4.EN", "C1.1")
net("V5", 0.6, "R3.2", "U3.IN-", "U3.VS", "C6.1", *[f"Q{k}.S" for k in range(1, 5)],
    *[f"R{10 + k}.1" for k in range(1, 5)])
net("3V3", 0.4, "U4.VOUT", "C2.1", "U1.3V3", "C3.1", "C4.1", "R4.1")
net("EN", 0, "U1.EN", "R4.2", "C5.1", "TP4.1")
net("BOOT", 0, "U1.IO0", "TP1.1")
net("TXD0", 0, "U1.TXD0", "TP2.1")
net("RXD0", 0, "U1.RXD0", "TP3.1")
net("USB_DP", 0, "J1.A6", "J1.B6", "U2.IO1", "U2.IO1'", "U1.IO20")
net("USB_DM", 0, "J1.A7", "J1.B7", "U2.IO2", "U2.IO2'", "U1.IO19")
net("CC1", 0, "J1.CC1", "R1.2", "U1.IO4")
net("CC2", 0, "J1.CC2", "R2.2", "U1.IO5")
net("ISENSE", 0, "U3.OUT", "U1.IO9")
EN_PIN = {1: 10, 2: 11, 3: 12, 4: 13}
for k in range(1, 5):
    net(f"GATE{k}", 0, f"Q{k}.G", f"R{10 + k}.2", f"N{k}.D")
    net(f"ON{k}", 0, f"U1.IO{EN_PIN[k]}", f"N{k}.G", f"R{20 + k}.1")
    net(f"TX{k}", 0.6, f"Q{k}.D", f"J{1 + k}.V")
gnd = ["J1.A1", "J1.A12", "J1.B1", "J1.B12", "J1.SH1", "J1.SH2", "J1.SH3", "J1.SH4",
       "R1.1", "R2.1", "U2.GND", "U3.GND", "U4.GND", "C1.2", "C2.2", "C3.2", "C4.2",
       "C5.2", "C6.2", "U1.GND1", "U1.GND40", "U1.GND41", "TP5.1"]
gnd += [f"N{k}.S" for k in range(1, 5)] + [f"R{20 + k}.2" for k in range(1, 5)]
gnd += [f"J{1 + k}.GND" for k in range(1, 5)]
net("GND", 0.6, *gnd)

def mm(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s
out = ["# The dock for four handhelds (see programs/cad/README.md). Written by",
       "# tools/dock.py: change that, not this.",
       f"board {mm(BW)} {mm(BH)} 2 Dock",
       "rules 0.15 0.25 0.6 0.3",
       # Its box: 3.2 mm birch ply; the handhelds' cases, 82 x 90.5 x 25.6,
       # their receivers 22 mm down from their middles; the board's middle.
       f"dock 3.2 82 90.5 25.6 -22 {mm(BX)} {mm(BY)}"]
for ref, fp, x, y, rot, val in P:
    out.append(f"part {ref} {fp} {mm(x)} {mm(y)} {rot} {val}".rstrip())
for name, w, pins in N:
    out.append(f"net {name} {w:g} " + " ".join(pins))
import sys
open(sys.argv[1], "w").write("\n".join(out) + "\n")
