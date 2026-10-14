#!/usr/bin/env python3
"""Make programs/skate/font.l8: the skate game's writing, as a picture.

    python3 programs/skate/tools/font.py

The writing is Rubik (tools/fonts, under the SIL Open Font License), in two
weights: Medium, for what is read, and ExtraBold, for what is called out.
Each character of each is drawn large, and turned into a picture of how far
each point is from the character's edge, inside or out (a "distance
field"), which drawn at any size gives a clean edge, and can be drawn
bolder or lighter, or with a soft shadow, from the one picture. The
pictures are packed into one, and written out as l8 with where each is in
it, how it sits on the line, how far the pen goes on after it, and how
much nearer or further apart the pairs of characters that need it go.
Needs fonttools, pillow, numpy, and scipy (pip install them).
"""
import subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from scipy.ndimage import distance_transform_edt

FACES = ["programs/skate/tools/fonts/Rubik-Medium.ttf", "programs/skate/tools/fonts/Rubik-ExtraBold.ttf"]
EM = 40          # the size the characters are kept at, in pixels to the em
FINE = 8         # how many times finer they are drawn, to measure from
SPREAD = 6       # how far from an edge the distance is kept, in pixels
WIDE = 1024      # the picture's width
# The characters: the printable ASCII ones, and a few more that are written
# (each after the ASCII ones, in this order).
EXTRAS = [0xB7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0xD7, 0x2022, 0xB0]
CODES = list(range(32, 127)) + EXTRAS
ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+-"
DIGITS = "0123456789"


def field(font, ch):
    """The character's distance field at EM pixels to the em (0 to 1, a half
    at its edge), and where its top left corner goes from the pen on the
    line (y down), in pixels at EM."""
    left, top, right, bottom = font.getbbox(ch, anchor="ls")
    if right <= left or bottom <= top:
        return None, 0, 0
    pad = SPREAD * FINE
    # (The box's corner on the coarse pixels' grid, so that they sample it
    # where they will be drawn.)
    x0 = int(np.floor(left / FINE)) * FINE - pad
    y0 = int(np.floor(top / FINE)) * FINE - pad
    x1 = int(np.ceil(right / FINE)) * FINE + pad
    y1 = int(np.ceil(bottom / FINE)) * FINE + pad
    img = Image.new("L", (x1 - x0, y1 - y0), 0)
    ImageDraw.Draw(img).text((-x0, -y0), ch, font=font, fill=255, anchor="ls")
    ink = np.asarray(img) >= 128
    inside = distance_transform_edt(ink)
    outside = distance_transform_edt(~ink)
    signed = np.where(ink, inside - 0.5, 0.5 - outside) / FINE
    value = np.clip(0.5 + signed / (2 * SPREAD), 0.0, 1.0)
    h, w = value.shape
    coarse = value.reshape(h // FINE, FINE, w // FINE, FINE).mean(axis=(1, 3))
    return coarse, x0 // FINE, y0 // FINE


def pair_kerning(tt, scale):
    """How much nearer (less than 0) or further apart each pair of glyphs
    goes, by glyph names, in pixels at EM: from the font's kern feature."""
    gpos = tt["GPOS"].table
    lookups = set()
    for rec in gpos.FeatureList.FeatureRecord:
        if rec.FeatureTag == "kern":
            lookups.update(rec.Feature.LookupListIndex)
    pairs = {}
    for li in sorted(lookups):
        lookup = gpos.LookupList.Lookup[li]
        for sub in lookup.SubTable:
            kind = lookup.LookupType
            if kind == 9:
                kind = sub.ExtensionLookupType
                sub = sub.ExtSubTable
            if kind != 2:
                continue
            if sub.Format == 1:
                firsts = sub.Coverage.glyphs
                for i, pset in enumerate(sub.PairSet):
                    for rec in pset.PairValueRecord:
                        v = rec.Value1.XAdvance if rec.Value1 and hasattr(rec.Value1, "XAdvance") else 0
                        if v:
                            pairs.setdefault((firsts[i], rec.SecondGlyph), v * scale)
            elif sub.Format == 2:
                firsts = sub.Coverage.glyphs
                c1 = sub.ClassDef1.classDefs
                c2 = sub.ClassDef2.classDefs
                for a in firsts:
                    row = sub.Class1Record[c1.get(a, 0)]
                    for b, k2 in list(c2.items()) + [(None, 0)]:
                        if b is None:
                            continue
                        rec = row.Class2Record[k2]
                        v = rec.Value1.XAdvance if rec.Value1 and hasattr(rec.Value1, "XAdvance") else 0
                        if v:
                            pairs.setdefault((a, b), v * scale)
    return pairs


def main():
    faces = []
    for path in FACES:
        tt = TTFont(path)
        upm = tt["head"].unitsPerEm
        scale = EM / upm
        cmap = tt.getBestCmap()
        font = ImageFont.truetype(path, EM * FINE)
        glyphs = []
        for code in CODES:
            name = cmap[code]
            adv = tt["hmtx"][name][0] * scale
            coarse, ox, oy = field(font, chr(code))
            if coarse is not None:
                # (Rows and columns with nothing in them are left off.)
                ys, xs = np.nonzero(coarse > 0.004)
                ya, yb, xa, xb = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
                coarse = coarse[ya:yb, xa:xb]
                ox, oy = ox + xa, oy + ya
            glyphs.append({"name": name, "adv": adv, "crop": coarse, "ox": ox, "oy": oy})
        kerns = pair_kerning(tt, scale)
        index = {cmap[c]: i for i, c in enumerate(CODES)}
        kern = sorted((index[a], index[b], v) for (a, b), v in kerns.items() if a in index and b in index)
        os2 = tt["OS/2"]
        faces.append({"glyphs": glyphs, "kern": kern, "ascent": tt["hhea"].ascent * scale, "descent": -tt["hhea"].descent * scale,
                      "cap": os2.sCapHeight * scale, "x": os2.sxHeight * scale,
                      "figure": max(glyphs[CODES.index(ord(d))]["adv"] for d in DIGITS),
                      "family": subprocess.run(["fc-scan", "--format", "%{fullname}", path], capture_output=True, text=True).stdout.strip()})
    # Pack them all in rows, tallest first.
    every = [g for f in faces for g in f["glyphs"] if g["crop"] is not None]
    x = y = row = 0
    for g in sorted(every, key=lambda g: -g["crop"].shape[0]):
        h, w = g["crop"].shape
        if x + w + 1 > WIDE:
            x, y, row = 0, y + row + 1, 0
        g["x"], g["y"] = x, y
        x += w + 1
        row = max(row, h)
    high = y + row + 1
    atlas = np.zeros((high, WIDE))
    for g in every:
        h, w = g["crop"].shape
        atlas[g["y"]:g["y"] + h, g["x"]:g["x"] + w] = g["crop"]
    levels = np.round(atlas * 63).astype(int)
    f0 = faces[0]
    lines = ["tag skate;", "",
             f"// The game's writing: {faces[0]['family']} and {faces[1]['family']} (which are",
             "// under the SIL Open Font License: see tools/fonts), each character as a",
             "// picture of how far each point is from its edge. Made by",
             "// programs/skate/tools/font.py: not to be changed by hand. See ui.l8 for",
             "// how it is written with, and render.l8 for how it is drawn.",
             "//",
             "// The size the characters are kept at, in pixels to the em; how far from",
             "// an edge the distance is kept (a point that far outside is 0, one that",
             "// far inside is 63, and the edge is between); the line's ascent and",
             "// descent, and how tall a capital and a small letter are, at that size;",
             "// and the picture's size.",
             f"const FONT_EM: f32 = {EM:.1f};", "", f"const FONT_SPREAD: f32 = {SPREAD:.1f};", "",
             f"const FONT_ASCENT: f32 = {f0['ascent']:.3f};", "", f"const FONT_DESCENT: f32 = {f0['descent']:.3f};", "",
             f"const FONT_CAP: f32 = {f0['cap']:.3f};", "", f"const FONT_X: f32 = {f0['x']:.3f};", "",
             f"const FONT_W: int = {WIDE};", "", f"const FONT_H: int = {high};", "",
             "// The faces (0 Medium, 1 ExtraBold); the characters of each, the ASCII",
             "// ones from the space on and then those in font_more, by their code",
             "// points.",
             f"const FONT_FACES: int = {len(faces)};", "", "const FONT_FIRST: int = 32;", "",
             f"const FONT_GLYPHS: int = {len(CODES)};", "", "const GLYPH_FLOATS: int = 7;", "",
             "font_more: []int = [" + ", ".join(str(c) for c in EXTRAS) + "];", "",
             "// How far the pen goes on for the widest of the figures, in each face (a",
             "// number that changes is written with each figure in that much room).",
             "font_figure: []f32 = [" + ", ".join(f"{f['figure']:.3f}" for f in faces) + "];", "",
             "// Each character of each face, in order: where it is in the picture (x,",
             "// y, and how wide and tall); where that box's top left corner goes, from",
             "// the pen on the line (y down); and how far the pen goes on.",
             ]
    nums = []
    for f in faces:
        for g in f["glyphs"]:
            if g["crop"] is None:
                nums += ["0.0", "0.0", "0.0", "0.0", "0.0", "0.0", f"{g['adv']:.3f}"]
            else:
                h, w = g["crop"].shape
                nums += [f"{g['x']:.1f}", f"{g['y']:.1f}", f"{w:.1f}", f"{h:.1f}", f"{g['ox']:.1f}", f"{g['oy']:.1f}", f"{g['adv']:.3f}"]
    lines += ["font_glyphs: []f32 = [" + ", ".join(nums) + "];", ""]
    # Kerning: each pair as one number (the face, then the two characters'
    # places among them), in order, and how much the pen moves between them.
    keys, vals = [], []
    for fi, f in enumerate(faces):
        for a, b, v in f["kern"]:
            keys.append((fi * 256 + a) * 256 + b)
            vals.append(v)
    order = sorted(range(len(keys)), key=lambda i: keys[i])
    lines += ["// The pairs that go nearer together (or further apart) than their",
              "// characters' own widths say: each as (face * 256 + first) * 256 +",
              "// second, by their places among the characters, in order; and by how",
              "// much, in pixels at FONT_EM.",
              "font_kern_pairs: []int = [" + ", ".join(str(keys[i]) for i in order) + "];", "",
              "font_kern_by: []f32 = [" + ", ".join(f"{vals[i]:.2f}" for i in order) + "];", "",
              "// The picture, a row at a time from the top: each point one character,",
              "// its place in FONT_LEVELS being how far inside the edge it is.",
              f'FONT_LEVELS: str = "{ALPHABET}";', "", "font_rows: []str = ["]
    lines += [",\n".join('    "' + "".join(ALPHABET[v] for v in r) + '"' for r in levels) + "];", ""]
    open("programs/skate/font.l8", "w").write("\n".join(lines))
    # (As the formatter would have it: the commit hook asks that of every source.)
    subprocess.run(["./l8c3", "fmt", "-w", "programs/skate/font.l8"], check=False)
    print(f"{len(faces)} faces, {len(CODES)} characters, a picture {WIDE} by {high}, {len(keys)} kerning pairs")


main()
