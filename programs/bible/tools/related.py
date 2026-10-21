#!/usr/bin/env python3
"""Related words, for the word study (DESIGN.md §10.4): words used in
similar contexts, from Clear's MACULA Proximity data.

    python3 -I related.py PROXIMITY_TSV DATA

PROXIMITY_TSV is Clear's Proximity.tsv (see fetch.sh, which checks its
sha256; CC BY 4.0, "MACULA Greek Linguistic Datasets, available at
https://github.com/Clear-Bible/macula-greek/"): StrongNumberX1,
StrongNumberX2, Distance, lower nearer (0 to about 0.83). Standard library
only. Keys are made bases as the app's: Aramaic A as H, no leading zeros, no
sense letter (H2416d is H2416). Pairs with either side not a base of
DATA/lang/lexicon.txt, and a key's pairs with itself, are left out; of a
key's pairs with one base the nearest is kept, and of those the 10 nearest
(ties by number). It writes:

  lang/related.bin  per key, G keys then H, each by number (as conc.bin):
                    the key in ASCII, \\0, u8 n, then n x (u16 Strong's
                    number, bit 15: Greek; u8 round(distance * 255)), nearest
                    first. Distances are under 1, so not scaled further.

Review r5-1's rules: a lettered code (H2617a, "reproach") is a homonym of
its base's, so it is folded into the base only when the base has no
unlettered code of its own (H2617 is chesed; H2617a is left out); a few
lettered codes that are MACULA's particles, not the base's word (H2050b
"and", folded into H2050 "to plot"), are left out; pairs farther than
0.75 are noise (Jesus near Barabbas, "one another") and left out; and
function words (the article, pronouns, conjunctions, prepositions,
particles) are not given as anyone's neighbours.

It prints its counts and its checks (G25's first three have G5368; H157's
first five have G25), and exits 1 if one fails. With --check DATA it reads
DATA/lang/related.bin and checks that alone:

    python3 -I related.py --check DATA
"""
import os
import re
import struct
import sys

KEY = re.compile(r"([GHA])0*(\d+)([A-Za-z]?)$")
FAR = 0.75
# MACULA's particles under a lettered code of an unrelated base.
PARTICLES = {"H2050b", "H2050c", "A2050d", "H871a", "A871b", "A1886h", "A1952a", "A1958b",
             "A3807b", "A3509d", "H2967a", "H4478a"}
# Function words: never a neighbour.
FUNCTION = set(
    # The article, pronouns, conjunctions, prepositions and particles.
    ("G%d" % n for n in (3588, 846, 240, 2532, 1161, 3754, 1063, 235, 3767, 1722, 1519, 1537,
                         575, 1909, 4314, 1223, 2596, 3326, 4012, 5259, 5228, 3844, 3361, 3756,
                         5613, 2531, 3778, 1565, 3739, 3748, 1473, 4771, 2249, 5210, 1438, 5100,
                         5101, 1437, 1487, 2443, 3752, 3753, 1510, 3956, 3676))) | set(
    ("H%d" % n for n in (853, 834, 3588, 1931, 1992, 2063, 2088, 428, 5921, 413, 4480, 5973,
                         854, 3808, 408, 369, 589, 595, 859, 3605, 518, 3651, 1571, 637, 4100,
                         4310, 1768, 6925, 5048, 2008, 3541)))


def split(s):
    # A code as (base, lettered), the base as the app's; None if not one.
    m = KEY.match(s.strip())
    if not m:
        return None, False
    return ("H" if m.group(1) == "A" else m.group(1)) + m.group(2), bool(m.group(3))


def norm(s):
    return split(s)[0]


def sort_key(k):
    return (k[0], int(k[1:]))


def make():
    tsv, data = sys.argv[1:3]
    lang = os.path.join(data, "lang")
    have = set(line[1:].strip() for line in open(os.path.join(lang, "lexicon.txt"), encoding="utf-8")
               if line.startswith("@"))
    near = {}  # key -> {other: distance}
    rows = dropped = selfs = homonyms = far = function = 0
    top = 0.0
    lines = [line.split("\t")[:3] for line in
             open(tsv, encoding="utf-8-sig").read().split("\n")[1:] if line.strip()]
    # The bases with an unlettered code of their own.
    plain = set()
    for a, b, _ in lines:
        for x in (a, b):
            k, lettered = split(x)
            if k and not lettered:
                plain.add(k)
    for a, b, d in lines:
        rows += 1
        d = float(d)
        top = max(top, d)
        if a.strip() in PARTICLES or b.strip() in PARTICLES:
            homonyms += 1
            continue
        (a, la), (b, lb) = split(a), split(b)
        if la and a in plain or lb and b in plain:
            homonyms += 1
            continue
        if a not in have or b not in have:
            dropped += 1
            continue
        if d > FAR:
            far += 1
            continue
        if b in FUNCTION:
            function += 1
            continue
        if a == b:
            selfs += 1
            continue
        m = near.setdefault(a, {})
        if b not in m or d < m[b]:
            m[b] = d
    if top > 1:
        raise SystemExit("a distance over 1 (%g): scale them" % top)
    out = bytearray()
    lists = {}
    dists = {}
    for k in sorted(near, key=sort_key):
        best = sorted(near[k].items(), key=lambda kv: (kv[1], sort_key(kv[0])))[:10]
        lists[k] = [o for o, _ in best]
        dists[k] = [round(d * 255) for _, d in best]
        out += k.encode() + b"\0" + bytes([len(best)])
        for o, d in best:
            out += struct.pack("<HB", int(o[1:]) | (0x8000 if o[0] == "G" else 0), round(d * 255))
    open(os.path.join(lang, "related.bin"), "wb").write(bytes(out))
    print("rows %d, largest distance %.4f, dropped (not in the lexicon) %d, self-pairs %d" %
          (rows, top, dropped, selfs))
    print("left out: homonyms and particles %d, farther than %.2f %d, function words %d" %
          (homonyms, FAR, far, function))
    print("keys %d, related.bin %d bytes" % (len(lists), len(out)))
    sys.exit(0 if tests(lists, dists) else 1)


def read(path):
    # related.bin as {key: [other, nearest first]}.
    b = open(path, "rb").read()
    lists = {}
    dists = {}
    i = 0
    while i < len(b):
        j = b.index(b"\0", i)
        k = b[i:j].decode()
        n = b[j + 1]
        i = j + 2
        lists[k] = []
        dists[k] = []
        for _ in range(n):
            x, d = struct.unpack_from("<HB", b, i)
            lists[k].append(("G" if x & 0x8000 else "H") + str(x & 0x7fff))
            dists[k].append(d)
            i += 3
    return lists, dists


def tests(lists, dists=None):
    ok = True
    for k, n, want in (("G25", 3, "G5368"), ("H157", 5, "G25")):
        got = lists.get(k, [])[:n]
        good = want in got
        ok = ok and good
        print("%s: %s's first %d: %s" % ("ok" if good else "FAIL", k, n, " ".join(got)))
    # Chesed (H2617): mercy or faithfulness first, no shame (its homonym
    # H2617a's).
    got = lists.get("H2617", [])
    shame = {"H7036", "H7022", "G3681", "H2781", "H3639"}
    good = bool({"H7356", "H530", "H571", "G1656"} & set(got[:3])) and not shame & set(got)
    ok = ok and good
    print("%s: H2617's: %s" % ("ok" if good else "FAIL", " ".join(got)))
    bad = [k for k, l in lists.items() if FUNCTION & set(l)]
    good = not bad
    ok = ok and good
    print("%s: function words as neighbours: %s" % ("ok" if good else "FAIL", " ".join(bad[:5]) or "none"))
    if dists is not None:
        worst = max((d for l in dists.values() for d in l), default=0)
        good = worst <= round(FAR * 255)
        ok = ok and good
        print("%s: farthest kept %d/255 (%.3f)" % ("ok" if good else "FAIL", worst, worst / 255))
    return ok


def main():
    if sys.argv[1] == "--check":
        lists, dists = read(os.path.join(sys.argv[2], "lang", "related.bin"))
        keys = list(lists)
        order = keys == sorted(keys, key=sort_key)
        print("related.bin: %d keys%s" % (len(keys), "" if order else ", FAIL: not in order"))
        sys.exit(0 if tests(lists, dists) and order else 1)
    make()


main()
