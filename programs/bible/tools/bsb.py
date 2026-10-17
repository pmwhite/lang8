#!/usr/bin/env python3
"""The Berean Standard Bible, from ebible.org's USFM, as the app's text.

    bsb.py USFM_DIR OUT          (USFM_DIR: engbsb_usfm.zip, unpacked)

The BSB is in the public domain. OUT is one record a line: a letter saying
what, then its text, in order through the Bible:

    B<CODE> <name>   a book (GEN Genesis)
    C<n>             a chapter
    M<text>          a major section (BOOK I), m its range (Psalms 1-41)
    S<text>          a section heading, s a lesser one
    R<text>          the passages a heading points to
    D<text>          a psalm's title
    A<text>          an acrostic letter (Aleph)
    P<k>             a paragraph: m plain, o opening, 1 2 poetry,
                     l L a list, c centered, r to the right
    _                a break between stanzas
    V<n>             a verse begins
    T<text>          words
    F<text>          a footnote, where it is marked
"""
import os
import re
import sys

PARA = {"m": "m", "pmo": "o", "q1": "1", "q2": "2", "li1": "l", "li2": "L",
        "pc": "c", "qr": "r", "p": "m", "q": "1"}
LINE = {"ms1": "M", "mr": "m", "s1": "S", "s2": "s", "r": "R", "d": "D",
        "qa": "A"}
# Names the books go by here, where \h is short.
NAMES = {"SNG": "Song of Solomon"}
SKIP = {"id", "h", "toc1", "toc2", "toc3", "mt1", "mt"}


def clean(text):
    text = re.sub(r"\\w ([^|\\]*)\|[^\\]*\\w\*", r"\1", text)
    text = re.sub(r"\\\+?it\*?", "", text)
    return text


def convert(path, out):
    src = clean(open(path, encoding="utf-8").read())
    code = re.search(r"\\id (\w+)", src).group(1)
    name = re.search(r"\\h ([^\n]*)", src).group(1).strip()
    out.append("B%s %s" % (code, NAMES.get(code, name)))
    words = []

    def flush():
        t = re.sub(r"\s+", " ", "".join(words))
        words.clear()
        if t.strip():
            if out[-1][0] in "PV_" or out[-1][0] == "F":
                t = t if out[-1][0] in "F" else t.lstrip()
            out.append("T" + t)

    # Footnotes out of the way first: \f + \fr 1:3 \ft text\f*
    pieces = re.split(r"(\\f .*?\\f\*)", src, flags=re.S)
    for piece in pieces:
        if piece.startswith("\\f "):
            flush()
            m = re.search(r"\\ft (.*?)\\f\*", piece, re.S)
            note = re.sub(r"\\f[a-z]+\*? ?", "", m.group(1) if m else "")
            out.append("F" + re.sub(r"\s+", " ", note).strip())
            continue
        for tok in re.split(r"(\\[a-z0-9]+\*?)", piece):
            if not tok.startswith("\\"):
                words.append(tok)
                continue
            mark = tok[1:]
            rest_needed = mark in LINE or mark in SKIP or mark in ("c", "v")
            if not rest_needed and mark in PARA:
                flush()
                out.append("P" + PARA[mark])
            elif mark == "b":
                flush()
                out.append("_")
            elif rest_needed:
                flush()
                words.append("\0" + mark + "\0")
            else:
                raise SystemExit("%s: unknown marker %s" % (path, tok))
    flush()


def lines_of(records):
    # Markers that own the rest of their line, or a number (\c, \v), were
    # left as \0mark\0 inside T records: split them out.
    out = []
    for r in records:
        if r[0] != "T" or "\0" not in r:
            out.append(r)
            continue
        parts = r[1:].split("\0")
        if parts[0].strip():
            out.append("T" + parts[0])
        i = 1
        while i < len(parts):
            mark, text = parts[i], parts[i + 1]
            i += 2
            if mark in ("c", "v"):
                n, _, text = text.strip().partition(" ")
                out.append(("C" if mark == "c" else "V") + n)
                if text.strip():
                    out.append("T" + text.lstrip())
            elif mark in LINE:
                body, nl, after = text.partition("\n")
                out.append(LINE[mark] + body.strip())
                if after.strip():
                    out.append("T" + after.strip())
            elif mark in SKIP:
                _, _, after = text.partition("\n")
                if after.strip():
                    out.append("T" + after.strip())
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    records = []
    for f in sorted(os.listdir(src)):
        if f.endswith(".usfm"):
            convert(os.path.join(src, f), records)
    records = lines_of(records)
    # Words have no space at their end; at their start only after a
    # footnote's mark, where a space follows it in the text (the app puts a
    # space before each verse but a paragraph's first).
    fixed = []
    for r in records:
        if r[0] == "T":
            body = re.sub(r"\s+", " ", r[1:]).rstrip()
            if not (fixed and fixed[-1][0] == "F"):
                body = body.lstrip()
            if not body:
                continue
            r = "T" + body
        fixed.append(r.rstrip())
    with open(dst, "w", encoding="utf-8") as f:
        f.write("\n".join(fixed) + "\n")


main()
