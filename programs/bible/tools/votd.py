#!/usr/bin/env python3
"""The Verse of the Day's candidates (DESIGN.md §10.2.1).

    python3 -I votd.py ZIP DATA     (ZIP: cross-references.zip)
    python3 -I votd.py --check DATA

The zip is OpenBible.info's cross references (see fetch.sh and xrefs.py;
CC BY 4.0). Every BSB verse (DATA/bsb.txt) is scored by the votes of the
references to it (positive votes only; a ranged target, Rom.1.19-Rom.1.20,
counts for its first verse only, the one it points at). Standard library
only. In score order (ties in the Bible's order), a verse is a candidate
when:

  - it ends with "," ":" ";" or a dash (after any closing quotes) and so is
    joined with the verses after it in its chapter, up to three in all,
    until one doesn't (else it is left out);
  - its text (T and W records, as text.l8 joins them; the verses joined
    with a space) is 40 to 320 characters;
  - it doesn't begin with And, Then, So, Now, But or Therefore (after an
    opening quote), or with a closing quote;
  - it isn't in Numbers 1-4, 7, 26; 1 Chronicles 1-9; Ezra 2; Nehemiah 7;
    nor in a range already taken;
  - there aren't yet 30 from Psalms, 20 from Proverbs, 12 from its book.

The 210 best of the Old Testament and of the New are taken, and alternate,
the Old first: no two days are from the same book. It writes
DATA/votd-candidates.txt (the 420), and, if there is none, DATA/votd.txt
(the first 366, until the designer curates it, by hand: then it is kept), a
line each: BOOK \\t C \\t V [\\t V_END].

--check checks DATA/votd.txt: 366 lines of that form, of the BSB's verses,
no book twice running; and the date mapping: line = the day of the year, Feb
29 day 60, and in common years a day from Mar 1 on one more (Mar 1 always
line 61). It prints the entry for 2026-10-19, and exits 1 on a failure.
"""
import datetime
import io
import os
import re
import sys
import zipfile

OSIS = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth "
        "Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab "
        "Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess "
        "2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev").split()
BOOKS = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA "
         "PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC "
         "MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM "
         "HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV").split()
OT = set(BOOKS[:39])
LISTS = {"NUM": {1, 2, 3, 4, 7, 26}, "1CH": set(range(1, 10)), "EZR": {2}, "NEH": {7}}
CAP = {"PSA": 30, "PRO": 20}
OTHER_CAP = 12
EACH = 210
DAYS = 366
OPENERS = {"and", "then", "so", "now", "but", "therefore"}
CLOSING = "”’»"
OPENING = "“‘«"
JOIN_END = ",:;—–"


def read_bsb(path):
    # [(book, chapter, verse)], {ref: text}, as text.l8 joins a verse's words.
    order = []
    text = {}
    book = None
    c = 0
    cur = None
    broke = False
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        k, t = line[:1], line[1:]
        if k == "B":
            book = t[:3]
            cur = None
        elif k == "C":
            c = int(t)
            cur = None
        elif k == "V":
            cur = (book, c, int(t))
            order.append(cur)
            text[cur] = ""
            broke = False
            continue
        elif k in "TW" and cur:
            s = text[cur]
            if broke and s and s[-1] != " " and t[:1] != " ":
                t = " " + t
            text[cur] = s + t
        broke = k not in "TWFV"
    return order, text


def date_line(month, day, leap):
    # The line (from 1) of votd.txt for a date.
    n = datetime.date(2000 if leap else 2001, month, day).timetuple().tm_yday
    return n + 1 if not leap and month >= 3 else n


def check(data):
    order, _ = read_bsb(os.path.join(data, "bsb.txt"))
    have = set(order)
    fails = []
    lines = open(os.path.join(data, "votd.txt"), encoding="utf-8").read().split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    if len(lines) != DAYS:
        fails.append("%d lines, not %d" % (len(lines), DAYS))
    prev = None
    entries = []
    for i, line in enumerate(lines):
        f = line.split("\t")
        ok = len(f) in (3, 4) and f[0] in BOOKS and all(re.match(r"[1-9]\d*$", x) for x in f[1:])
        if ok:
            b, c, v = f[0], int(f[1]), int(f[2])
            end = int(f[3]) if len(f) == 4 else v
            ok = end >= v and all((b, c, x) in have for x in range(v, end + 1)) and \
                (len(f) == 3 or end > v)
        if not ok:
            fails.append("line %d: %r" % (i + 1, line))
            entries.append(None)
            continue
        if b == prev:
            fails.append("line %d: %s again" % (i + 1, b))
        prev = b
        entries.append(line)
    # The date mapping.
    leap = [date_line(d.month, d.day, True) for d in
            (datetime.date(2000, 1, 1) + datetime.timedelta(n) for n in range(366))]
    common = [date_line(d.month, d.day, False) for d in
              (datetime.date(2001, 1, 1) + datetime.timedelta(n) for n in range(365))]
    if sorted(leap) != list(range(1, 367)):
        fails.append("leap years' dates don't take every line once")
    if sorted(common) != [n for n in range(1, 367) if n != 60]:
        fails.append("common years' dates don't take every line but Feb 29's once")
    for (m, d), want in (((2, 28), 59), ((2, 29), 60), ((3, 1), 61), ((12, 31), 366), ((1, 1), 1)):
        for lp in (True, False):
            if (m, d) == (2, 29) and not lp:
                continue
            if date_line(m, d, lp) != want:
                fails.append("%d-%d (%s) is not line %d" % (m, d, "leap" if lp else "common", want))
    n = date_line(10, 19, False)
    e = entries[n - 1] if n - 1 < len(entries) else None
    print("votd.txt: %d lines; 2026-10-19 is line %d: %s" % (len(lines), n, (e or "?").replace("\t", " ")))
    for f in fails[:20]:
        print("FAIL: " + f)
    if not fails:
        print("ok: votd.txt and the date mapping")
    sys.exit(1 if fails else 0)


def main():
    if sys.argv[1] == "--check":
        return check(sys.argv[2])
    zpath, data = sys.argv[1:3]
    order, text = read_bsb(os.path.join(data, "bsb.txt"))
    index = {r: i for i, r in enumerate(order)}
    with zipfile.ZipFile(zpath) as z:
        name = [n for n in z.namelist() if n.endswith(".txt")][0]
        src = io.TextIOWrapper(z.open(name), encoding="utf-8").read()
    book = {o: BOOKS[i] for i, o in enumerate(OSIS)}
    score = {}
    for line in src.split("\n")[1:]:
        f = line.split("\t")
        if len(f) < 3 or int(f[2]) < 1:
            continue
        b, c, v = f[1].split("-")[0].split(".")
        r = (book[b], int(c), int(v))
        if r == ("3JN", 1, 15):
            r = ("3JN", 1, 14)
        if r in index:
            score[r] = score.get(r, 0) + int(f[2])
    ranked = sorted(score, key=lambda r: (-score[r], index[r]))
    taken = set()
    per_book = {}
    picked = {"OT": [], "NT": []}
    why = {}

    def drop(reason):
        why[reason] = why.get(reason, 0) + 1

    for r in ranked:
        b, c, v = r
        side = "OT" if b in OT else "NT"
        if len(picked[side]) >= EACH:
            continue
        if c in LISTS.get(b, ()):
            drop("list chapters")
            continue
        refs = [r]
        while (text[refs[-1]].rstrip(CLOSING + " ")[-1:] or "x") in JOIN_END:
            nxt = (b, c, refs[-1][2] + 1)
            if len(refs) == 3 or nxt not in index:
                refs = None
                break
            refs.append(nxt)
        if refs is None:
            drop("incomplete")
            continue
        if any(x in taken for x in refs):
            drop("taken")
            continue
        s = " ".join(text[x].strip() for x in refs)
        if not 40 <= len(s) <= 320:
            drop("length")
            continue
        first = s.lstrip(OPENING)
        word = re.match(r"[A-Za-z]*", first).group().lower()
        if s[:1] in CLOSING or word in OPENERS:
            drop("opening")
            continue
        if per_book.get(b, 0) >= CAP.get(b, OTHER_CAP):
            drop("book cap")
            continue
        per_book[b] = per_book.get(b, 0) + 1
        taken.update(refs)
        picked[side].append(refs)
        if len(picked["OT"]) >= EACH and len(picked["NT"]) >= EACH:
            break
    if len(picked["OT"]) < EACH or len(picked["NT"]) < EACH:
        raise SystemExit("too few candidates: %d OT, %d NT" % (len(picked["OT"]), len(picked["NT"])))
    days = []
    for ot, nt in zip(picked["OT"], picked["NT"]):
        days += [ot, nt]

    def fmt(refs):
        b, c, v = refs[0]
        return "%s\t%d\t%d" % (b, c, v) + ("\t%d" % refs[-1][2] if len(refs) > 1 else "")

    out = [fmt(d) for d in days]
    with open(os.path.join(data, "votd-candidates.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    # (votd.txt is the designer's once curated: made only when there is none.)
    if not os.path.exists(os.path.join(data, "votd.txt")):
        with open(os.path.join(data, "votd.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(out[:DAYS]) + "\n")
        print("votd.txt: made, the first %d" % DAYS)
    print("verses with votes %d; left out: %s" % (len(score), ", ".join("%s %d" % kv for kv in sorted(why.items()))))
    print("candidates %d (ranges %d); by book: %s" % (len(days), sum(1 for d in days if len(d) > 1),
          " ".join("%s %d" % kv for kv in sorted(per_book.items(), key=lambda kv: -kv[1])[:12])))
    for d in days[:6]:
        print("  %s (%d): %s" % (fmt(d).replace("\t", " "), score[d[0]], " ".join(text[x].strip() for x in d)[:90]))


main()
