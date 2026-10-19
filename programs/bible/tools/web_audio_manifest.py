#!/usr/bin/env python3
"""The paths of Winfred Henson's WEB recording on eBible.org, a chapter a
line (DESIGN.md §12.2.4).

    python3 -I web_audio_manifest.py DATA      (DATA: programs/bible/data)
    python3 -I web_audio_manifest.py --check DATA

It reads the 66 book listings under https://ebible.org/eng-web/audio/
(3 s apart; a 403 is tried again after 30 s), reads each file's chapter from
its spelled-out name ("Psalms-One Hundred Nineteen"), checks every book's
count against the BSB's (DATA/bsb.txt), and writes DATA/audio/henson.paths:
BOOK, chapter, the percent-encoded path under the address above, and the
file's size in bytes, tab-separated. Where a chapter has two files (Psalm
71 and Luke 17 have a "... (1).mp3"), the line has both paths, the second
after a space, for tools/align.py to choose between.

--check reads the paths file and checks it against the BSB's chapters,
without the network.
"""
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://ebible.org/eng-web/audio/"
AGENT = "SmoothBible/1.0 (verse timings for a Bible reader; https://smoothbible.com)"

ONES = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13,
    "fourteen": 14, "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
    "nineteen": 19,
}
TENS = {
    "twenty": 20, "thirty": 30, "forty": 40, "fourty": 40, "fifty": 50, "sixty": 60,
    "seventy": 70, "eighty": 80, "ninety": 90,
}


def words_number(words):
    """'One Hundred Twenty One' -> 121; None if they are not a number."""
    n = 0
    seen = False
    ws = [w for w in re.split(r"[\s-]+", words.strip().lower()) if w]
    # ("Thirteen 1": a take's number after the spelled one, not part of it.)
    if len(ws) > 1 and ws[-1].isdigit() and not ws[0].isdigit():
        ws = ws[:-1]
    for w in ws:
        if not w or w == "and":
            continue
        if w.isdigit():
            n += int(w)
        elif w in ONES:
            n += ONES[w]
        elif w in TENS:
            n += TENS[w]
        elif w == "hundred":
            n = (n or 1) * 100
        else:
            return None
        seen = True
    return n if seen else None


def chapter_of(name):
    """A file's chapter from its name: '0999 John-Chapter Three.mp3' -> 3,
    '0597 Psalms-One Hundred Nineteen.mp3' -> 119,
    '01_01_Genesis_Chapter_One.mp3' -> 1, 'Jude.mp3' -> 1."""
    stem = re.sub(r"\.mp3$", "", name, flags=re.I)
    stem = re.sub(r"\s*\(\d+\)$", "", stem)
    stem = re.sub(r"^(\d+\s+)+", "", stem.replace("_", " "))
    m = re.search(r"chapter\s+(.+)$", stem, re.I)
    if m:
        return words_number(m.group(1))
    if "-" in stem:
        n = words_number(stem.split("-", 1)[1])
        if n is not None:
            return n
    return 1


def bsb_chapters(data):
    books = []
    counts = {}
    book = None
    for line in open(os.path.join(data, "bsb.txt"), encoding="utf-8"):
        if line[:1] == "B":
            book = line[1:4]
            books.append(book)
            counts[book] = 0
        elif line[:1] == "C":
            counts[book] += 1
    return books, counts


LISTINGS = os.path.expanduser("~/.cache/smooth-bible-audio/listings")


def fetch(url):
    # (Each listing kept, outside the repository, so a second run asks
    # eBible.org for nothing it has already answered.)
    kept = os.path.join(LISTINGS, urllib.parse.quote(url, safe="") + ".html")
    if os.path.exists(kept):
        return open(kept, encoding="utf-8").read()
    text = fetch_now(url)
    os.makedirs(LISTINGS, exist_ok=True)
    with open(kept, "w", encoding="utf-8") as f:
        f.write(text)
    return text


def fetch_now(url):
    while True:
        req = urllib.request.Request(url, headers={"User-Agent": AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code != 403:
                raise
            print("403 for %s; trying again in 30 s" % url, file=sys.stderr)
            time.sleep(30)


def book_dirs(index):
    return re.findall(r'href="(\d\d_[^"/]+/)"', index)


def listing_files(listing):
    # (href, size): an nginx index, a file a line.
    out = []
    for m in re.finditer(r'<a href="([^"]+\.mp3)">[^<]*</a>\s+\S+\s+\S+\s+(\d+)', listing):
        out.append((m.group(1), int(m.group(2))))
    return out


def check(data, lines):
    books, counts = bsb_chapters(data)
    seen = {}
    for line in lines:
        f = line.rstrip("\n").split("\t")
        if len(f) != 4:
            raise SystemExit("henson.paths: a line without four fields: %r" % line)
        seen[(f[0], int(f[1]))] = f
    bad = []
    for b in books:
        for c in range(1, counts[b] + 1):
            if (b, c) not in seen:
                bad.append("%s %d" % (b, c))
    if len(seen) != sum(counts.values()) or bad:
        raise SystemExit("henson.paths: %d chapters, missing %s" % (len(seen), " ".join(bad[:20])))
    return len(seen)


def main():
    args = sys.argv[1:]
    only_check = False
    if args and args[0] == "--check":
        only_check = True
        args = args[1:]
    if len(args) != 1:
        raise SystemExit(__doc__)
    data = args[0]
    out = os.path.join(data, "audio", "henson.paths")
    if only_check:
        n = check(data, open(out, encoding="utf-8"))
        print("henson.paths: %d chapters" % n)
        return
    books, counts = bsb_chapters(data)
    dirs = book_dirs(fetch(BASE))
    if len(dirs) != 66:
        raise SystemExit("expected 66 books, found %d" % len(dirs))
    lines = []
    for i, d in enumerate(dirs):
        if not os.path.exists(os.path.join(LISTINGS, urllib.parse.quote(BASE + d, safe="") + ".html")):
            time.sleep(3)
        book = books[i]
        files = listing_files(fetch(BASE + d))
        by = {}
        for href, size in files:
            name = urllib.parse.unquote(href)
            c = chapter_of(name)
            if c is None:
                raise SystemExit("%s: cannot read a chapter from %r" % (d, name))
            by.setdefault(c, []).append((d + href, size))
        if sorted(by) != list(range(1, counts[book] + 1)):
            raise SystemExit("%s: chapters %s, the BSB has %d" % (d, sorted(by), counts[book]))
        for c in sorted(by):
            paths = by[c]
            # (The plain name first, "... (1).mp3" after it.)
            paths.sort(key=lambda p: ("%28" in p[0] or "(" in p[0], p[0]))
            lines.append("%s\t%d\t%s\t%d\n" % (book, c, " ".join(p for p, _ in paths), paths[0][1]))
            if len(paths) > 1:
                print("%s %d: %d files" % (book, c, len(paths)), file=sys.stderr)
        print("%s: %d chapters" % (book, len(by)), file=sys.stderr)
    check(data, lines)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print("wrote %s: %d chapters" % (out, len(lines)))


if __name__ == "__main__":
    main()
