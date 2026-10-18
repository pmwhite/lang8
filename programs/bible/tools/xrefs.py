#!/usr/bin/env python3
"""OpenBible.info's cross references, for the Study sheet's References
(DESIGN.md §9.6).

    python3 -I xrefs.py ZIP DATA     (ZIP: cross-references.zip)

The zip is https://a.openbible.info/data/cross-references.zip (see fetch.sh,
which checks its sha256), licensed CC BY 4.0: pairs From, To, Votes, with
OSIS-style references (Gen.1.1, ranges Rom.1.19-Rom.1.20). Pairs with no
positive vote are left out. It reads DATA/bsb.txt for the BSB's verses, and
writes:

  xref_index.bin  u32 per BSB verse, in bsb.txt's order (as lang/verses.bin):
                  where its targets begin in xrefs.bin (in targets); then
                  one more, the count
  xrefs.bin       each verse's targets, by votes, most first; 4 bytes each,
                  little-endian: bits 0-10 the chapter index (Genesis 1 = 0),
                  11-18 the first verse, 19-26 the last (0: one verse), 27
                  the last is in the next chapter, 28-31 min(15, log2 votes)

A range that goes on past the next chapter is cut at that chapter's end.
3 John 1:15 is given at 1:14, as the BSB numbers it.
"""
import io
import math
import os
import struct
import sys
import zipfile

OSIS = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth "
        "Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab "
        "Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess "
        "2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev").split()


def bsb_verses(path):
    # Chapter indexes by (book, number), each chapter's verses, and every
    # verse in order.
    order = []
    chapter = {}
    verses = {}
    b = -1
    c = -1
    for line in open(path, encoding="utf-8"):
        k = line[:1]
        if k == "B":
            b += 1
        elif k == "C":
            c += 1
            chapter[(b, int(line[1:]))] = c
            verses[c] = []
        elif k == "V":
            v = int(line[1:])
            verses[c].append(v)
            order.append((c, v))
    return order, chapter, verses


def main():
    zpath, data = sys.argv[1], sys.argv[2]
    order, chapter, verses = bsb_verses(os.path.join(data, "bsb.txt"))
    index = {cv: i for i, cv in enumerate(order)}
    book = {name: i for i, name in enumerate(OSIS)}
    with zipfile.ZipFile(zpath) as z:
        name = [n for n in z.namelist() if n.endswith(".txt")][0]
        text = io.TextIOWrapper(z.open(name), encoding="utf-8").read()
    unknown = {}

    def ref(s):
        # (chapter index, verse), the BSB's numbering, or None.
        b, c, v = s.split(".")
        b, c, v = book[b], int(c), int(v)
        if b == 63 and c == 1 and v == 15:
            v = 14
        ci = chapter.get((b, c))
        if ci is None or v not in verses[ci]:
            unknown[s] = unknown.get(s, 0) + 1
            return None
        return ci, v

    targets = {}
    pairs = 0
    kept = 0
    ranges = 0
    across = 0
    for line in text.split("\n")[1:]:
        if not line.strip():
            continue
        f, t, votes = line.split("\t")[:3]
        pairs += 1
        votes = int(votes)
        if votes < 1:
            continue
        a = ref(f)
        first, _, last = t.partition("-")
        x = ref(first)
        if a is None or x is None:
            continue
        ci, v1 = x
        v2 = 0
        nxt = 0
        if last:
            ranges += 1
            y = ref(last)
            if y is None:
                continue
            if y[0] == ci:
                v2 = y[1] if y[1] > v1 else 0
            else:
                across += 1
                nxt = 1
                # (Past the next chapter: to its end.)
                v2 = y[1] if y[0] == ci + 1 else verses[ci + 1][-1]
        tier = min(15, int(math.log2(votes)))
        word = ci | v1 << 11 | v2 << 19 | nxt << 27 | tier << 28
        targets.setdefault(index[a], []).append((votes, len(targets.get(index[a], [])), word))
        kept += 1
    idx = bytearray()
    out = bytearray()
    n = 0
    for i in range(len(order)):
        idx += struct.pack("<I", n)
        for _, _, word in sorted(targets.get(i, []), key=lambda t: (-t[0], t[1])):
            out += struct.pack("<I", word)
            n += 1
    idx += struct.pack("<I", n)
    with open(os.path.join(data, "xref_index.bin"), "wb") as f:
        f.write(idx)
    with open(os.path.join(data, "xrefs.bin"), "wb") as f:
        f.write(out)
    print("pairs %d, kept %d (votes >= 1), ranges %d, across a chapter %d" % (pairs, kept, ranges, across))
    print("not the BSB's verses: " + (", ".join("%s (%d)" % kv for kv in sorted(unknown.items())) or "none"))
    names = OSIS

    def show(i):
        c, v = order[i]
        out_ = []
        for votes, _, w in sorted(targets.get(i, []), key=lambda t: (-t[0], t[1]))[:5]:
            ci = w & 2047
            b = max(b for (b, cn), cc in chapter.items() if cc == ci)
            cn = [cn for (bb, cn), cc in chapter.items() if cc == ci][0]
            out_.append("%s.%d.%d (%d)" % (names[b], cn, w >> 11 & 255, votes))
        return ", ".join(out_)
    print("John 3:16: " + show(index[(chapter[(42, 3)], 16)]))
    print("Genesis 1:1: " + show(index[(chapter[(0, 1)], 1)]))


main()
