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

It prints its counts and its checks (G25's first three have G5368; H157's
first five have G25), and exits 1 if one fails. With --check DATA it reads
DATA/lang/related.bin and checks that alone:

    python3 -I related.py --check DATA
"""
import os
import re
import struct
import sys

KEY = re.compile(r"([GHA])0*(\d+)[A-Za-z]?$")


def norm(s):
    m = KEY.match(s.strip())
    if not m:
        return None
    return ("H" if m.group(1) == "A" else m.group(1)) + m.group(2)


def sort_key(k):
    return (k[0], int(k[1:]))


def make():
    tsv, data = sys.argv[1:3]
    lang = os.path.join(data, "lang")
    have = set(line[1:].strip() for line in open(os.path.join(lang, "lexicon.txt"), encoding="utf-8")
               if line.startswith("@"))
    near = {}  # key -> {other: distance}
    rows = dropped = selfs = 0
    top = 0.0
    lines = open(tsv, encoding="utf-8-sig").read().split("\n")
    for line in lines[1:]:
        if not line.strip():
            continue
        a, b, d = line.split("\t")[:3]
        rows += 1
        d = float(d)
        top = max(top, d)
        a, b = norm(a), norm(b)
        if a not in have or b not in have:
            dropped += 1
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
    for k in sorted(near, key=sort_key):
        best = sorted(near[k].items(), key=lambda kv: (kv[1], sort_key(kv[0])))[:10]
        lists[k] = [o for o, _ in best]
        out += k.encode() + b"\0" + bytes([len(best)])
        for o, d in best:
            out += struct.pack("<HB", int(o[1:]) | (0x8000 if o[0] == "G" else 0), round(d * 255))
    open(os.path.join(lang, "related.bin"), "wb").write(bytes(out))
    print("rows %d, largest distance %.4f, dropped (not in the lexicon) %d, self-pairs %d" %
          (rows, top, dropped, selfs))
    print("keys %d, related.bin %d bytes" % (len(lists), len(out)))
    sys.exit(0 if tests(lists) else 1)


def read(path):
    # related.bin as {key: [other, nearest first]}.
    b = open(path, "rb").read()
    lists = {}
    i = 0
    while i < len(b):
        j = b.index(b"\0", i)
        k = b[i:j].decode()
        n = b[j + 1]
        i = j + 2
        lists[k] = []
        for _ in range(n):
            x, _ = struct.unpack_from("<HB", b, i)
            lists[k].append(("G" if x & 0x8000 else "H") + str(x & 0x7fff))
            i += 3
    return lists


def tests(lists):
    ok = True
    for k, n, want in (("G25", 3, "G5368"), ("H157", 5, "G25")):
        got = lists.get(k, [])[:n]
        good = want in got
        ok = ok and good
        print("%s: %s's first %d: %s" % ("ok" if good else "FAIL", k, n, " ".join(got)))
    return ok


def main():
    if sys.argv[1] == "--check":
        lists = read(os.path.join(sys.argv[2], "lang", "related.bin"))
        keys = list(lists)
        order = keys == sorted(keys, key=sort_key)
        print("related.bin: %d keys%s" % (len(keys), "" if order else ", FAIL: not in order"))
        sys.exit(0 if tests(lists) and order else 1)
    make()


main()
