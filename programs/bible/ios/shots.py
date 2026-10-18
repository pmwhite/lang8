# The CI's screenshots, finished (Python with Pillow and PyAV):
#   shots.py DIR
# DIR holds every group's screenshots, and the notes group's screen
# recording (transitions.mp4, and transitions.txt: a line a sequence, its
# number and its start and end in seconds). It writes:
# - collapse-diff.txt: how many pixels of the text differ between
#   15a-before-collapse.png and 15-collapsed.png below the expanded bar
#   (S + 44 points, S from the read group's console: "bible: bar S N"),
#   which must be 0, since collapsing the bar never moves the text;
# - transitions/: the recording's frames at 30 fps, during the sequences
#   (JPEG, half size);
# - transitions-sheet.png: a row a sequence, every 3rd frame, at a quarter
#   size.
import os, re, sys
from PIL import Image, ImageChops

d = sys.argv[1]

def collapse_diff():
    a, b = os.path.join(d, "15a-before-collapse.png"), os.path.join(d, "15-collapsed.png")
    if not (os.path.exists(a) and os.path.exists(b)):
        return "missing shots"
    s = 59
    for name in ("read-console.txt", "console.txt"):
        p = os.path.join(d, name)
        if os.path.exists(p):
            m = re.findall(r"bible: bar S (\d+)", open(p, errors="replace").read())
            if m:
                s = int(m[-1])
                break
    ia, ib = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    scale = round(ia.width / 400.0)
    out = []
    # Below the expanded bar, and below the fade under it (whose 18 points
    # follow the bar up as it collapses, by design): only the second is
    # nothing but the text, which must not have moved.
    for name, pts in (("below S + 44", s + 44), ("below S + 44 + 18 (the fade)", s + 62)):
        top = pts * scale
        box = (0, top, ia.width, ia.height)
        diff = ImageChops.difference(ia.crop(box), ib.crop(box))
        n = diff.convert("L").point(lambda v: 255 if v else 0).histogram()[255]
        out.append("%s: %d pixels differ (y >= %d px)" % (name, n, top))
    return "S %d pt, scale %d; " % (s, scale) + "; ".join(out)

def transitions():
    video = os.path.join(d, "transitions.mp4")
    times = os.path.join(d, "transitions.txt")
    if not (os.path.exists(video) and os.path.exists(times)):
        return "no recording"
    import av
    seqs = []
    for line in open(times):
        k = line.split()
        if len(k) == 3:
            seqs.append((int(k[0]), float(k[1]) - 0.2, float(k[2]) + 0.3))
    container = av.open(video)
    stream = container.streams.video[0]
    decoded = []
    for frame in container.decode(stream):
        if frame.time is None:
            continue
        decoded.append((frame.time, frame.to_image()))
    if not decoded:
        return "no frames"
    t0 = decoded[0][0]
    # When the screen changed (to trim each sequence to what moved in it:
    # the script's times include the notifications' own delays).
    changes = []
    prev = None
    for t, im in decoded:
        small = im.convert("L").resize((100, 216))
        if prev is not None and ImageChops.difference(small, prev).getbbox():
            changes.append(t - t0)
        prev = small
    trimmed = []
    for n, a, b in seqs:
        moved = [t for t in changes if a <= t <= b + 0.5]
        if moved:
            a, b = max(a, moved[0] - 0.3), moved[-1] + 0.3
        trimmed.append((n, a, b))
    seqs = trimmed
    os.makedirs(os.path.join(d, "transitions"), exist_ok=True)
    rows = []
    for n, a, b in seqs:
        # Each 1/30 s, the latest frame shown by then.
        frames = []
        t = a
        j = 0
        while t <= b:
            while j + 1 < len(decoded) and decoded[j + 1][0] - t0 <= t:
                j += 1
            frames.append(decoded[j][1])
            t += 1.0 / 30
        for i, im in enumerate(frames):
            small = im.resize((im.width // 2, im.height // 2))
            small.save(os.path.join(d, "transitions", "%d-%03d.jpg" % (n, i)), quality=70)
        thumbs = [im.resize((im.width // 4, im.height // 4)) for im in frames[::3]]
        if thumbs:
            w, h = thumbs[0].size
            row = Image.new("RGB", (w * len(thumbs), h + 4), "white")
            for i, im in enumerate(thumbs):
                row.paste(im, (i * w, 0))
            rows.append(row)
    if not rows:
        return "no sequences"
    width = max(r.width for r in rows)
    sheet = Image.new("RGB", (width, sum(r.height for r in rows)), "white")
    y = 0
    for r in rows:
        sheet.paste(r, (0, y))
        y += r.height
    sheet.save(os.path.join(d, "transitions-sheet.png"))
    return "%d sequences, %d decoded frames" % (len(rows), len(decoded))

with open(os.path.join(d, "collapse-diff.txt"), "w") as f:
    r = collapse_diff()
    print(r)
    f.write(r + "\n")
try:
    print(transitions())
except Exception as e:
    print("transitions failed:", e)
