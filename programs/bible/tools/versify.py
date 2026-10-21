#!/usr/bin/env python3
"""Every bundled version's chapters and verses beside the BSB's (DESIGN.md
§9.1.1), and data/refs.txt from them.

    python3 -I versify.py DATA      (DATA: programs/bible/data)

It prints the verses each version has that the BSB hasn't, and those it
lacks; fails if any version's chapters are not the BSB's; and writes
DATA/refs.txt, a line for each chapter where some version's last verse is
past the BSB's (BOOK, chapter, that verse, tab-separated), which the app
reads so that a mark there is kept (store.l8's ref_last).
"""
import os
import sys

VERSIONS = ("kjv", "web", "asv", "ylt")


def verses_of(path):
    # (book, chapter) in order, and each one's verses.
    chapters = []
    verses = {}
    book = None
    c = None
    for line in open(path, encoding="utf-8"):
        k = line[:1]
        if k == "B":
            book = line[1:4]
        elif k == "C":
            c = (book, int(line[1:]))
            chapters.append(c)
            verses[c] = set()
        elif k == "V":
            verses[c].add(int(line[1:].split(">")[0]))
    return chapters, verses


def name(ref):
    return "%s %d:%d" % ref


def main():
    data = sys.argv[1]
    base_ch, base = verses_of(os.path.join(data, "bsb.txt"))
    last = {c: max(v) for c, v in base.items()}
    ok = True
    for ver in VERSIONS:
        chapters, verses = verses_of(os.path.join(data, ver + ".txt"))
        if chapters != base_ch:
            print("%s: chapters differ from the BSB's" % ver.upper())
            ok = False
            continue
        extra = []
        missing = []
        for c in base_ch:
            extra += [(c[0], c[1], v) for v in sorted(verses[c] - base[c])]
            missing += [(c[0], c[1], v) for v in sorted(base[c] - verses[c])]
            if verses[c] and max(verses[c]) > last[c]:
                last[c] = max(verses[c])
        n = sum(len(v) for v in verses.values())
        print("%s: %d verses; %d not in the BSB: %s" % (ver.upper(), n, len(extra),
              ", ".join(map(name, extra)) or "none"))
        print("%s: %d of the BSB's missing: %s" % (ver.upper(), len(missing),
              ", ".join(map(name, missing)) or "none"))
    if not ok:
        raise SystemExit(1)
    lines = ["%s\t%d\t%d" % (c[0], c[1], last[c]) for c in base_ch if last[c] > max(base[c])]
    with open(os.path.join(data, "refs.txt"), "w", encoding="utf-8") as f:
        f.write("".join(l + "\n" for l in lines))
    print("refs.txt: " + "; ".join(l.replace("\t", " ") for l in lines))


main()
