# Writes programs/cad/handheld.pcb: the handheld (~/src/handheld) laid out
# for routing. Placement and pin assignment follow the RP2040's pinout;
# see "The handheld" in programs/cad/README.md.
#
#   python3 programs/cad/tools/handheld.py programs/cad/handheld.pcb
P = []   # (ref, fp, x, y, rot, value)
def part(ref, fp, x, y, rot=0, value=""): P.append((ref, fp, x, y, rot, value))

# The MCU, turned half round so that each side faces what it joins: its
# USB and QSPI edge down (USB straight down the middle to the connector,
# the flash below and to the right), GPIO17-29 up and to the left (the
# display, then the D-pad), GPIO0-11 right (A, B, Home), and XIN/XOUT,
# SWD and RUN along the top.
MX, MY = 0.0, 20.0
part("U1", "rp2040", MX, MY, 180, "RP2040")
# The display's connector above and to the left: SPI0 leaves the chip's
# left side and top-left corner in the connector's own order (RESET 21,
# RS 20, MOSI 19, SCK 18, CS 17).
JX, JY = -4.5, 38.0
part("J3", "fpc14", JX, JY, 0, "ER-TFT020-3")
part("C15", "c0603", JX + 7.5, JY - 1.0, 90, "100n")      # display supply
# Backlight: switch and resistor to the left of the connector, under its
# LED pins.
part("Q1", "sot23", JX - 6.0, JY - 4.6, 0, "2N7002")
part("R2", "r0603", JX - 1.75, JY - 5.6, 90, "10R")       # LED+ to 3V3
part("R3", "r0603", JX - 9.0, JY - 4.6, 90, "100k")       # gate pulldown
# The flash below and to the right, its near row facing the right half of
# the QSPI pins in their order (SD2, SD1, SS straight down to IO2, DO, CS);
# the left half (SD3, SCLK, SD0) goes down its left side and round under it
# to the far row, in order too: no line crosses another.
part("U2", "w25q16", MX + 5.4, MY - 13.5, 270, "W25Q16")
part("C9", "c0603", MX + 9.0, MY - 16.4, 90, "100n")       # by VCC, bottom right
part("C13", "c0603", MX + 10.5, MY - 16.4, 90, "10u")
part("TP5", "tp1", MX + 9.2, MY - 9.4, 0, "BOOT")         # QSPI_SS, past CS
# USB series resistors, side by side by the ESD part (at full speed a line
# this long is electrically short), D- on the left as the pair comes down.
part("R7", "r0603", -1.0, -45.0, 270, "27R")                # D-
part("R8", "r0603", 1.0, -45.0, 270, "27R")                 # D+
# The crystal to the right of XIN/XOUT, half turned so that XIN (along the
# top edge, past the unused GPIO12-15) comes to XTAL1 from below and XOUT
# (up, and over) to XTAL2 from the left; its load caps by them.
part("Y1", "xtal3225", MX + 6.8, MY + 6.0, 180, "12MHz")
part("C1", "c0603", MX + 10.6, MY + 5.15, 0, "12p")         # XIN
part("C2", "c0603", MX + 2.6, MY + 5.5, 0, "12p")          # XOUT, under its line
# Above them, the caps of the top edge's power pins (IOVDD22, DVDD23), and
# above those the SWD and RUN test pads: the lines leave the top edge up and
# turn right, the rightmost first, so each comes to the nearer one.
part("C5", "c0603", MX + 2.6, MY + 8.4, 0, "100n")       # IOVDD22
part("C18", "c0603", MX + 2.6, MY + 9.9, 0, "100n")      # DVDD23
part("TP3", "tp1", MX + 1.0, MY + 12.0, 0, "SWCLK")
part("TP2", "tp1", MX + 3.0, MY + 12.6, 0, "SWDIO")
part("TP1", "tp1", MX + 5.0, MY + 13.2, 0, "RUN")
part("TP4", "tp1", MX + 7.0, MY + 13.8, 0, "GND")
part("R1", "r0603", MX + 5.0, MY + 15.6, 90, "1k")
# The rest of the decoupling, each by its own pins, in the gaps between
# groups of lines.
part("C4", "c0603", MX - 7.4, MY - 6.8, 90, "100n")      # IOVDD33 (left; by a via, GPIO22 below it being free)
part("C7", "c0603", MX + 6.4, MY + 1.0, 0, "100n")       # IOVDD10 (right)
part("C6", "c0603", MX + 6.4, MY - 3.6, 0, "100n")       # IOVDD1 (right, low)
part("C8", "c0603", MX - 0.1, MY - 8.2, 270, "100n")     # USB_VDD, IOVDD49 (below, between the USB pair and the flash lines)
part("C16", "c0603", MX - 2.9, MY - 6.8, 270, "1u")      # VREG_VOUT, straight below it
part("C12", "c0603", MX - 4.4, MY - 6.8, 270, "10u")     # VREG_VIN, ADC_AVDD (their lines pass left of C16)
part("C3", "c0603", MX - 5.9, MY - 6.8, 270, "100n")     # IOVDD42 (below left)
# Power: the switch on the top edge, the LDO under it, top-left.
part("SW1", "ss12d00", -22.0, 61.0, 0, "SS-12D00")
part("U4", "sot23-5", -18.0, 48.0, 0, "AP2112K-3.3")
part("C11", "c0603", -14.5, 48.0, 90, "1u")              # LDO out
part("C17", "c0603", -21.5, 48.0, 90, "1u")              # LDO in
# Charging and USB, along the bottom.
part("J1", "usb4105", 0.0, -60.4, 180, "USB4105")
part("U6", "sot23-6", 0.0, -50.5, 90, "USBLC6-2SC6")
part("R4", "r0603", 5.0, -54.0, 90, "5.1k")
part("R5", "r0603", -5.0, -54.0, 90, "5.1k")
part("U3", "mcp73871", -12.0, -48.0, 0, "MCP73871")
part("R6", "r0603", -7.0, -44.5, 0, "2k")
part("C10", "c0603", -16.5, -52.5, 0, "100n")            # VSYS
part("C14", "c0603", -16.5, -55.0, 0, "10u")             # VSYS bulk
part("F1", "ptc1206", -20.0, -44.0, 0, "500mA")
part("J2", "jst-ph2", -27.0, -44.0, 0, "JST-PH")
# Buttons: D-pad left, A and B on the right thumb's arc, Back and Home in the
# bottom corners.
def dpad(dx, dy): return (-24.0 + dx * 6.0, -4.0 + dy * 6.0)
for ref, name, (dx, dy) in [("SW2", "UP", (0, 1)), ("SW3", "DOWN", (0, -1)),
                            ("SW4", "LEFT", (-1, 0)), ("SW5", "RIGHT", (1, 0))]:
    x, y = dpad(dx, dy); part(ref, "dome6", x, y, 0, name)
part("SW6", "dome6", 27.0, -1.0, 0, "A")
part("SW7", "dome6", 19.0, -7.0, 0, "B")
part("SW8", "dome6", -24.0, -30.0, 0, "BACK")
part("SW9", "dome6", 24.0, -30.0, 0, "HOME")

N = []
def net(name, w, *pins): N.append((name, w, list(pins)))
net("QSPI_SS", 0, "U1.QSPI_SS", "U2.CS", "TP5.1")
net("QSPI_SCLK", 0, "U1.QSPI_SCLK", "U2.CLK")
net("QSPI_SD0", 0, "U1.QSPI_SD0", "U2.DI")
net("QSPI_SD1", 0, "U1.QSPI_SD1", "U2.DO")
net("QSPI_SD2", 0, "U1.QSPI_SD2", "U2.IO2")
net("QSPI_SD3", 0, "U1.QSPI_SD3", "U2.IO3")
net("XIN", 0, "U1.XIN", "Y1.XTAL1", "C1.1")
net("XOUT", 0, "U1.XOUT", "Y1.XTAL2", "C2.1")
net("SWCLK", 0, "U1.SWCLK", "TP3.1")
net("SWDIO", 0, "U1.SWD", "TP2.1")
net("RUN", 0, "U1.RUN", "R1.2", "TP1.1")
net("LCD_SCK", 0, "U1.GPIO18", "J3.SCK")
net("LCD_SDA", 0, "U1.GPIO19", "J3.SDA")
net("LCD_RS", 0, "U1.GPIO20", "J3.RS")
net("LCD_RESET", 0, "U1.GPIO21", "J3.RESET")
net("LCD_CS", 0, "U1.GPIO17", "J3.CS")
net("BL_GATE", 0, "U1.GPIO23", "Q1.G", "R3.1")
net("BL_A", 0, "J3.LED+", "R2.2")
net("BL_K", 0, "J3.LED-", "Q1.D")
net("USB_DP", 0, "R8.1", "U1.USB_DP")
net("USB_DM", 0, "R7.1", "U1.USB_DM")
net("USB_DP_C", 0, "J1.A6", "J1.B6", "U6.IO1", "U6.IO1'", "R8.2")
net("USB_DM_C", 0, "J1.A7", "J1.B7", "U6.IO2", "U6.IO2'", "R7.2")
net("CC1", 0, "J1.CC1", "R4.2")
net("CC2", 0, "J1.CC2", "R5.2")
net("VBAT", 0.4, "J2.VBAT", "F1.1")
net("VBAT_F", 0.4, "F1.2", "U3.VBAT14", "U3.VBAT15", "U3.VBAT_SENSE")
net("VBUS", 0.4, "J1.A4", "J1.A9", "J1.B4", "J1.B9", "U6.VBUS", "U3.IN18", "U3.IN19", "U3.VPCC", "U3.CE", "U3.PROG2")
net("VSYS", 0.4, "U3.OUT1", "U3.OUT20", "SW1.COM", "C14.1", "C10.1")
net("VSW", 0.4, "SW1.1", "U4.VIN", "U4.EN", "C17.1")
net("DVDD", 0.3, "U1.VREG_VOUT", "U1.DVDD23", "U1.DVDD50", "C16.1", "C18.1")
net("PROG1", 0, "U3.PROG1", "R6.1")
net("3V3", 0.4, "U4.VOUT", "C11.1", "U1.IOVDD1", "U1.IOVDD10", "U1.IOVDD22", "U1.IOVDD33",
    "U1.IOVDD42", "U1.IOVDD49", "U1.USB_VDD", "U1.ADC_AVDD", "U1.VREG_VIN", "U2.VCC",
    "J3.VDD", "J3.IOVDD", "R1.1", "R2.1", "C3.1", "C4.1", "C5.1", "C6.1", "C7.1", "C8.1",
    "C9.1", "C12.1", "C13.1", "C15.1")
gnd = ["U1.GND", "U1.TESTEN", "U2.GND", "Y1.GND2", "Y1.GND4", "C1.2", "C2.2", "TP4.1",
       "J3.GND2", "J3.GND5", "J3.GND13", "J3.MP1", "J3.MP2", "Q1.S", "R3.2",
       "J1.A1", "J1.A12", "J1.B1", "J1.B12", "J1.SH1", "J1.SH2", "J1.SH3", "J1.SH4",
       "U6.GND", "R4.1", "R5.1", "U3.VSS10", "U3.VSS11", "U3.EP", "U3.SEL", "U3.TE",
       "R6.2", "U4.GND", "J2.GND"]
gnd += [f"C{i}.2" for i in (3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18)]
for i in range(2, 10):
    gnd += [f"SW{i}.{p}" for p in ("GN", "GE", "GS", "GW")]
net("GND", 0.4, *gnd)
for name, g, sw in [("LEFT", 24, "SW4"), ("UP", 25, "SW2"), ("DOWN", 26, "SW3"),
                    ("BACK", 27, "SW8"), ("RIGHT", 28, "SW5"),
                    ("HOME", 0, "SW9"), ("B", 1, "SW7"), ("A", 2, "SW6")]:
    net(f"BTN_{name}", 0, f"U1.GPIO{g}", f"{sw}.SIG")

def mm(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s
out = ["# The handheld game controller (~/src/handheld), laid out again for",
       "# routing: the RP2040 turned so its pins face what they join, GPIOs",
       "# chosen in the order of what they reach (see programs/cad/README.md).",
       "# The first sketch, from design.ml, is handheld-sketch.pcb. Written by",
       "# tools/handheld.py: change that, not this.",
       "board 72 128 4 Handheld",
       "rules 0.15 0.25 0.6 0.3"]
for ref, fp, x, y, rot, val in P:
    out.append(f"part {ref} {fp} {mm(x)} {mm(y)} {rot} {val}".rstrip())
for name, w, pins in N:
    out.append(f"net {name} {w:g} " + " ".join(pins))
import sys
open(sys.argv[1], "w").write("\n".join(out) + "\n")
