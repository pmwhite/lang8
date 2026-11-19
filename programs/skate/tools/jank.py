#!/usr/bin/env python3
"""Look for jank in a run of the skate game: watch it again with the jank
meter on (see programs/skate/jank.l8), and lay out what it found.

    python3 programs/skate/tools/jank.py RUN [--out DIR] [--size WxH]
        [--least 0.004] [--kink 0.03] [--jitter 0.3] [--no-shots]

RUN is a run as the page keeps it (a file of "version course score name
steps...", as watch.txt has it), or one sent from a phone to the run
catcher (programs/skate/tools/runs.mjs), as JSON. The game (.build/skate)
watches it from behind him, as he rode it, one frame every 60th of a
second of the run whatever the frames take (L8_FRAME_DT), so a run comes
out the same every time; it needs an X display (DISPLAY, or --display),
of a real GPU. Into DIR (default: next to RUN, named after it):

    report.txt   each incident (frames of jank close together), worst first:
                 what snapped or kinked, how far (a share of the screen's
                 height at 60 frames a second, and in the world), when in
                 the run, and what he was doing; and what the phone said,
                 for a run from one.
    NNN.png      the frames about each incident, two before to two after,
                 side by side, the jank's frame marked.
    lines.txt    every L8JANK line the game said.

Needs ImageMagick (convert, montage).
"""
import argparse
import json
import os
import re
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))


def read_run(path):
    """The run as watch.txt has it, and what came with it (or {})."""
    text = open(path).read().strip()
    if text.startswith("{"):
        sent = json.loads(text)
        run = sent["run"]
        watch = f"{run['version']} {run['course']} {run['score']} {sent.get('name', 'PHONE')} {run['replay']}"
        return watch, sent
    return text, {}


def parse_line(line):
    words = line.split()
    if len(words) < 2 or words[0] != "L8JANK":
        return None
    out = {"kind": words[1], "flags": []}
    for w in words[2:]:
        if "=" in w:
            k, v = w.split("=", 1)
            try:
                out[k] = float(v) if k not in ("what", "on") else v
            except ValueError:
                out[k] = v
        else:
            out["flags"].append(w)
    return out


def incidents(events, gap=6):
    """Jank close together (within gap frames) is one incident."""
    found = []
    for e in sorted(events, key=lambda e: e["frame"]):
        if found and e["frame"] - found[-1][-1]["frame"] <= gap:
            found[-1].append(e)
        else:
            found.append([e])
    return found


def split_shots(path, out):
    """The frames kept (see jank_shoot) as PNG files, by frame."""
    frames = {}
    if not os.path.exists(path):
        return frames
    with open(path, "rb") as f:
        while True:
            head = f.readline()
            if not head:
                break
            _, n, w, h = head.split()
            n, w, h = int(n), int(w), int(h)
            pixels = f.read(w * h * 3)
            name = os.path.join(out, f"frame-{n}.png")
            subprocess.run(["convert", "-size", f"{w}x{h}", "-depth", "8", "rgb:-", "-flip", name], input=pixels, check=True)
            frames[n] = name
    return frames


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("run")
    ap.add_argument("--out")
    ap.add_argument("--size", help="the window, WxH (default: the phone's, held as it was, else 1280x720)")
    ap.add_argument("--least", type=float, default=0.004)
    ap.add_argument("--kink", type=float, default=0.03)
    ap.add_argument("--display", default=os.environ.get("DISPLAY"))
    ap.add_argument("--no-shots", action="store_true")
    ap.add_argument("--jitter", type=float, default=0.0, help="frames each up to so much longer or shorter (0.3: 30%%), as a phone's come")
    ap.add_argument("--top", type=int, default=40, help="incidents to show pictures of")
    a = ap.parse_args()
    if not a.display:
        sys.exit("jank.py: needs an X display (DISPLAY or --display)")
    watch, sent = read_run(a.run)
    words = watch.split()
    course = int(words[1])
    out = a.out or os.path.splitext(os.path.abspath(a.run))[0] + "-jank"
    os.makedirs(out, exist_ok=True)
    for f in os.listdir(out):
        if f.endswith(".png") or f == "shots.raw":
            os.remove(os.path.join(out, f))
    watch_path = os.path.join(out, "watch.txt")
    open(watch_path, "w").write(watch + "\n")
    # The window: the size asked, or as the phone was held (its shape, at
    # most 1280 either way), or 1280x720.
    w, h = 1280, 720
    view = (sent.get("device") or {}).get("view")
    if a.size:
        w, h = map(int, a.size.split("x"))
    elif view and view[0] > 0 and view[1] > 0:
        k = 1280 / max(view[0], view[1])
        w, h = round(view[0] * k) // 2 * 2, round(view[1] * k) // 2 * 2
    env = dict(os.environ, DISPLAY=a.display, L8_SEED=str(abs(course)), L8_WATCH=watch_path, L8_WATCH_QUIT="1",
               L8_JANK="1", L8_JANK_LEAST=str(a.least), L8_JANK_KINK=str(a.kink), L8_FRAME_DT=str(1 / 60),
               L8_UNCAPPED="1", L8_WINDOW_W=str(w), L8_WINDOW_H=str(h), L8_FRAME_JITTER=str(a.jitter))
    if course < 0:
        env["L8_PARK"] = "1"
    if not a.no_shots:
        env["L8_JANK_SHOTS"] = os.path.join(out, "shots.raw")
    game = os.path.join(ROOT, ".build", "skate")
    r = subprocess.run([game], env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=1800)
    lines = [l for l in r.stdout.splitlines() if l.startswith("L8JANK")]
    open(os.path.join(out, "lines.txt"), "w").write("\n".join(lines) + "\n")
    events = [e for e in map(parse_line, lines) if e and e["kind"] in ("snap", "kink")]
    hitches = [e for e in map(parse_line, lines) if e and e["kind"] == "hitch"]
    frames = {} if a.no_shots else split_shots(os.path.join(out, "shots.raw"), out)
    found = incidents(events)
    found.sort(key=lambda inc: -max(e["seen"] for e in inc))
    report = []
    report.append(f"run: course {course}, score {words[2]}, by {words[3]}; watched at {w}x{h}, 60 frames a second")
    report.append(f"jank: {len(events)} frames ({sum(e['kind'] == 'snap' for e in events)} snaps, "
                  f"{sum(e['kind'] == 'kink' for e in events)} kinks) in {len(found)} incidents; "
                  f"snaps from {a.least * 100:.2f}%, kinks from {a.kink * 100:.2f}% of the screen's height")
    if hitches:
        report.append(f"hitches here (this machine, not the phone): {len(hitches)}")
    report.append("")
    for i, inc in enumerate(found):
        worst = max(inc, key=lambda e: e["seen"])
        n = int(worst["frame"])
        picture = ""
        if i < a.top and not a.no_shots:
            have = [frames[k] for k in range(n - 2, n + 3) if k in frames]
            if have:
                picture = os.path.join(out, f"{i + 1:03d}.png")
                labelled = []
                for k in range(n - 2, n + 3):
                    if k in frames:
                        mark = ["-bordercolor", "red", "-border", "6"] if k == n else ["-bordercolor", "white", "-border", "6"]
                        lab = os.path.join(out, f"tmp-{k}.png")
                        # (About him: a square a third of the screen's height
                        # round where the jank was, at twice its size.)
                        side = h // 3
                        cx = int(w / 2 + worst.get("sx", 0) * h) - side // 2
                        cy = int(h / 2 - worst.get("sy", 0) * h) - side // 2
                        cx, cy = max(0, min(w - side, cx)), max(0, min(h - side, cy))
                        subprocess.run(["convert", frames[k], "-crop", f"{side}x{side}+{cx}+{cy}", "+repage", "-resize", "400x400", *mark,
                                        "-gravity", "North", "-pointsize", "18", "-annotate", "+0+8", f"frame {k}", lab], check=True)
                        labelled.append(lab)
                subprocess.run(["montage", *labelled, "-tile", "5x1", "-geometry", "+2+2", picture], check=True)
                for lab in labelled:
                    os.remove(lab)
        flags = " ".join(worst["flags"])
        others = sorted({e["what"] for e in inc} - {worst["what"]})
        report.append(f"{i + 1:3d}. {worst['kind']} {worst['what']} {worst['seen']:.2f}% ({worst.get('world', 0):.1f} cm) "
                      f"at {worst['t']:.2f} s (step {int(worst['step'])}, frame {n}), d {worst['d']:.1f} x {worst['x']:.1f}: {flags}"
                      + (f"; on {worst['on']}" if "on" in worst else "")
                      + (f"; {len(inc)} frames, also {', '.join(others[:6])}" if len(inc) > 1 else "")
                      + (f"\n     {picture}" if picture else ""))
    for k in frames.values():
        os.remove(k)
    if os.path.exists(os.path.join(out, "shots.raw")):
        os.remove(os.path.join(out, "shots.raw"))
    phone = sent.get("jank") or []
    if phone:
        report.append("")
        report.append(f"what the phone said ({len(phone)} lines):")
        report.extend("  " + l for l in phone)
    open(os.path.join(out, "report.txt"), "w").write("\n".join(report) + "\n")
    print("\n".join(report[:min(len(report), 30)]))
    print(f"... in {out}/report.txt")


if __name__ == "__main__":
    main()
