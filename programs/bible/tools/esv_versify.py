#!/usr/bin/env python3
"""The ESV's verse numbering beside the BSB's (DESIGN.md §9.4.9), through
the deployed proxy: run by hand, with the owner's consent, once the key is
set.

    python3 -I esv_versify.py DATA [BASE]
        (DATA: programs/bible/data; BASE: https://smoothbible.com/api/v1/)

It asks the proxy for the chapters where versions are known to differ, one
at a time, compares each one's verses with the BSB's, and prints what
differs. It keeps no text: only the verse numbers are read from the records.
The expected differences are 3 John 1:15 (keyed 14) and Revelation 12:18
(keyed 17); any other means a mapping to add to worker/esv.js and its verse
counts (worker/make_versecounts.mjs).
"""
import json
import os
import sys
import time
import urllib.request

CHAPTERS = [("3JN", 1), ("REV", 12), ("REV", 13), ("ROM", 16), ("2CO", 13), ("ACT", 19),
            ("MAL", 4), ("JOL", 2), ("JOL", 3), ("PSA", 51), ("NEH", 4), ("DAN", 4),
            ("NUM", 16), ("MAT", 17), ("MRK", 9), ("LUK", 17)]


def bsb_verses(path):
    verses = {}
    book = None
    c = 0
    for line in open(path, encoding="utf-8"):
        k = line[:1]
        if k == "B":
            book = line[1:4]
        elif k == "C":
            c = int(line[1:])
            verses[(book, c)] = set()
        elif k == "V":
            verses[(book, c)].add(int(line[1:]))
    return verses


def main():
    data = sys.argv[1]
    base = sys.argv[2] if len(sys.argv) > 2 else "https://smoothbible.com/api/v1/"
    bsb = bsb_verses(os.path.join(data, "bsb.txt"))
    found = []
    for book, c in CHAPTERS:
        url = "%sesv/chapters?book=%s&chapter=%d&count=1" % (base, book, c)
        req = urllib.request.Request(url, headers={"X-Smooth-Bible": "versify (1)", "User-Agent": "SmoothBible-versify/1"})
        with urllib.request.urlopen(req, timeout=20) as r:
            body = json.load(r)
        records = body["chapters"][0]["records"].split("\n")
        shown = set()
        keyed = []
        for rec in records:
            if rec[:1] == "V":
                n, _, k = rec[1:].partition(">")
                shown.add(int(n))
                if k:
                    keyed.append("%s %d:%s>%s" % (book, c, n, k))
        del records, body
        extra = sorted(shown - bsb[(book, c)])
        missing = sorted(bsb[(book, c)] - shown)
        print("%s %d: extra %s, missing %s, keyed %s" % (book, c, extra or "none",
              missing or "none", ", ".join(keyed) or "none"))
        found += ["%s %d:%d" % (book, c, v) for v in extra]
        # (Well inside the proxy's 30 a minute.)
        time.sleep(2.5)
    print("verses the ESV has and the BSB does not: " + (", ".join(found) or "none"))


main()
