#!/usr/bin/env python3
"""Make programs/race/font.l8: the racing game's writing, as a picture.

    python3 programs/race/tools/font.py [FONT.ttf]

Each character of a font (Quicksand Bold, unless another is named) is drawn
large with ImageMagick's `convert`, and turned into a picture of how far each
point is from the character's edge, inside or out (a "distance field"): which,
drawn at any size, gives a clean edge. The pictures are packed into one, and
written out as l8, with where each character is in it and how it sits on the
line. Needs ImageMagick and numpy.
"""
import re
import subprocess
import sys
import numpy as np

FONT = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/quicksand/Quicksand-Bold.ttf"
EM = 32          # the size the characters are kept at, in pixels to the em
FINE = 4         # how many times finer they are drawn, to measure from
SPREAD = 4       # how far from an edge the distance is kept, in pixels
PAD = SPREAD + 1
WIDE = 512       # the picture's width
CODES = range(32, 127)
DIGITS = "0123456789"
ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-"


def quoted(ch):
    return {"%": "%%", "\\": "\\\\", "@": "\\@"}.get(ch, ch)


def metrics(ch):
    if ch == " ":
        # (A space alone is not measured: it is as much as it adds between two letters.)
        asc, desc, wide, _ = metrics("a a")
        return asc, desc, wide - metrics("aa")[2], 0.0
    out = subprocess.run(["convert", "-size", "10x10", "xc:black", "-font", FONT, "-pointsize", str(EM * 10), "-debug", "annotate",
                          "-annotate", "+0+0", quoted(ch), "null:"], capture_output=True, text=True).stderr
    m = re.search(r"ascent: (-?[\d.]+); descent: (-?[\d.]+);.*?bounds: (-?[\d.]+),(-?[\d.]+)\s+(-?[\d.]+),(-?[\d.]+); origin: (-?[\d.]+)", out)
    asc, desc, x0, y0, x1, y1, adv = (float(v) / 10 for v in m.groups())
    return asc, -desc, adv, y1


def field(ch, asc, desc, adv):
    """The character's distance field at EM pixels to the em: values 0 to 1, a half at its edge."""
    w = int(np.ceil(adv)) + 2 * PAD
    h = int(np.ceil(asc + desc)) + 2 * PAD
    W, H = w * FINE, h * FINE
    raw = subprocess.run(["convert", "-size", f"{W}x{H}", "xc:black", "-fill", "white", "-font", FONT, "-pointsize", str(EM * FINE),
                          "-annotate", f"+{PAD * FINE}+{int(round((PAD + asc) * FINE))}", quoted(ch), "-depth", "8", "gray:-"],
                         capture_output=True).stdout
    ink = np.frombuffer(raw, np.uint8).reshape(H, W) >= 128
    reach = SPREAD * FINE
    far = float(reach)
    out_d = np.full((H, W), far)   # for a point outside: how far the nearest ink is
    in_d = np.full((H, W), far)    # for a point inside: how far the nearest paper is
    big = np.pad(ink, reach, constant_values=False)
    for dy in range(-reach, reach + 1):
        for dx in range(-reach, reach + 1):
            d = (dx * dx + dy * dy) ** 0.5
            if d > reach:
                continue
            there = big[reach + dy:reach + dy + H, reach + dx:reach + dx + W]
            np.minimum(out_d, np.where(there, d, far), out=out_d)
            np.minimum(in_d, np.where(there, far, d), out=in_d)
    signed = np.where(ink, in_d - 0.5, 0.5 - out_d) / FINE   # more than 0 inside, in pixels at EM
    value = np.clip(0.5 + signed / (2 * SPREAD), 0, 1)
    return value.reshape(h, FINE, w, FINE).mean(axis=(1, 3))


def main():
    glyphs = {}
    for code in CODES:
        ch = chr(code)
        asc, desc, adv, _ = metrics(ch)
        f = field(ch, asc, desc, adv) if ch != " " else np.zeros((1, 1))
        ys, xs = np.nonzero(f > 0.004)
        if len(xs) == 0:
            box = (0, 0, 0, 0)
            crop = np.zeros((0, 0))
        else:
            x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            crop = f[y0:y1, x0:x1]
            box = (x0 - PAD, y0 - PAD - asc, x1 - x0, y1 - y0)
        glyphs[ch] = {"adv": adv, "ox": box[0], "oy": box[1], "w": box[2], "h": box[3], "crop": crop}
    # (How wide the widest figure is: a time is written with every figure in that much room, so that it does not shift as it runs.)
    room = max(glyphs[d]["adv"] for d in DIGITS)
    cap = metrics("H")[3]
    # Pack them in rows.
    x = y = row = 0
    for ch, g in glyphs.items():
        if x + g["w"] + 1 > WIDE:
            x, y, row = 0, y + row + 1, 0
        g["x"], g["y"] = x, y
        x += g["w"] + 1
        row = max(row, g["h"])
    high = y + row + 1
    atlas = np.zeros((high, WIDE))
    for g in glyphs.values():
        if g["w"]:
            atlas[g["y"]:g["y"] + g["h"], g["x"]:g["x"] + g["w"]] = g["crop"]
    levels = np.round(atlas * 63).astype(int)
    name = subprocess.run(["fc-scan", "--format", "%{family} %{style}", FONT], capture_output=True, text=True).stdout.strip() or FONT
    lines = ["tag race;", "",
             f"// The game's writing: {name} (which is under the SIL Open Font",
             "// License), each character as a picture of how far each point is from",
             "// its edge. Made by programs/race/tools/font.py: not to be changed by",
             "// hand. See hud.l8 for how it is written with, and render.l8 for how it",
             "// is drawn.",
             "//",
             "// The size the characters are kept at, in pixels to the em; how tall a",
             "// capital is at that size; how far from an edge the distance is kept",
             "// (a point that far outside is 0, one that far inside is 63, and the",
             "// edge is between); and the picture's size.",
             f"const FONT_EM: f32 = {EM:.1f};", "", f"const FONT_CAP: f32 = {cap:.3f};", "", f"const FONT_SPREAD: f32 = {SPREAD:.1f};", "",
             "// How far the pen goes on for the widest of the figures (see text_even,",
             "// in hud.l8).",
             f"const FONT_FIGURE: f32 = {room:.3f};", "",
             f"const FONT_W: int = {WIDE};", "", f"const FONT_H: int = {high};", "",
             "// Each character, from the space on, by its code: where it is in the",
             "// picture (x, y, and how wide and tall); where that box's top left corner",
             "// goes, from the pen on the line (y down); and how far the pen goes on.",
             "const FONT_FIRST: int = 32;", "", "const FONT_GLYPHS: int = 95;", "", "const GLYPH_FLOATS: int = 7;", ""]
    nums = []
    for code in CODES:
        g = glyphs[chr(code)]
        nums += [f"{g['x']:.1f}", f"{g['y']:.1f}", f"{g['w']:.1f}", f"{g['h']:.1f}", f"{g['ox']:.3f}", f"{g['oy']:.3f}", f"{g['adv']:.3f}"]
    lines += ["font_glyphs: []f32 = [" + ", ".join(nums) + "];", "",
              "// The picture, a row at a time from the top: each point one character,",
              "// its place in FONT_LEVELS being how far inside the edge it is.",
              f'FONT_LEVELS: str = "{ALPHABET}";', "", "font_rows: []str = ["]
    lines += [",\n".join('    "' + "".join(ALPHABET[v] for v in r) + '"' for r in levels) + "];", ""]
    open("programs/race/font.l8", "w").write("\n".join(lines))
    # (As the formatter would have it: the commit hook asks that of every source.)
    subprocess.run(["./l8c3", "fmt", "-w", "programs/race/font.l8"], check=False)
    print(f"{name}: {len(glyphs)} characters, a picture {WIDE} by {high}, capitals {cap:.1f} tall")


main()
