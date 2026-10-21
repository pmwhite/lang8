#!/usr/bin/env python3
"""Matthew Henry's Concise Commentary, for the Study sheet's Commentary
(DESIGN.md §9.7).

    python3 -I mhcc.py XML BSB OUT  (XML: CCEL's ThML, mhcc.xml; BSB: bsb.txt)

The ThML is https://ccel.org/ccel/henry/mhcc.xml (see fetch.sh, which
checks its sha256), in the public domain. OUT is one record a line:

    B<CODE>                  a book; its introduction follows as p lines
    C<n>                     a chapter
    O<text>\t<v1>[-<v2>]     a line of the chapter's outline
    K<c>:<v>-<c2>:<v2>       a section of comment on those verses
    p<text>                  a paragraph

In p and O, [[JHN.3.16|ch. 3:16]] is a reference (its text as Henry wrote
it; [[JHN.3.1-3.8|…]] a range) and _words_ are italic; every other tag is
dropped. A section's verses run on to the next section's in its chapter
(CCEL's John 3:1-8 holds the comment on 3:9-21, as its outline says). A
chapter with one comment is written by CCEL as the chapter's own <p>s,
with no Commentary div: it is one section, the whole chapter (its last
verse from bsb.txt), its bold summary line the first paragraph, italic.
"""
import html
import re
import sys

OSIS = ("Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth "
        "Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab "
        "Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess "
        "2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev").split()
CODES = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA "
         "PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC "
         "MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM "
         "HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV").split()
CODE = dict(zip(OSIS, CODES))


def ref_code(osis, passage):
    # [[CODE.c.v|…]] or [[CODE.c.v-c2.v2|…]] for an osisRef (CCEL parses
    # "Jud" as Judges; it is Jude); None if it isn't one.
    m = re.match(r"Bible:([1-3A-Za-z]+)\.(\d+)\.(\d+)(?:-([1-3A-Za-z]+)\.(\d+)\.(\d+))?$", osis or "")
    if not m or m.group(1) not in CODE:
        return None
    code = CODE[m.group(1)]
    if passage.startswith("Jud ") and code == "JDG":
        code = "JUD"
    c, v = int(m.group(2)), int(m.group(3))
    # (3 John 1:15 is 1:14, as the BSB numbers it.)
    if code == "3JN" and c == 1 and v == 15:
        v = 14
    s = "%s.%d.%d" % (code, c, v)
    if m.group(4):
        c2, v2 = int(m.group(5)), int(m.group(6))
        if (c2, v2) > (c, v):
            s += "-%d.%d" % (c2, v2)
    return s


def inline(x):
    # A paragraph's inside as the app's markup.
    def scrip(m):
        attrs, text = m.group(1), m.group(2)
        osis = re.search(r'osisRef="([^"]*)"', attrs)
        passage = re.search(r'passage="([^"]*)"', attrs)
        text = re.sub(r"<[^>]*>", "", text)
        r = ref_code(osis and osis.group(1), passage.group(1) if passage else "")
        return "[[%s|%s]]" % (r, text) if r else text
    x = re.sub(r"<scripRef([^>]*)>(.*?)</scripRef>", scrip, x, flags=re.S)
    x = re.sub(r"<scripRef[^>]*/>", "", x)
    x = re.sub(r"</?(?:i|em)(?: [^>]*)?>", "_", x)
    x = re.sub(r"<br\s*/?>", " ", x)
    x = re.sub(r"<[^>]*>", "", x)
    x = html.unescape(x)
    x = re.sub(r"\s+", " ", x).strip()
    x = x.replace("_ _", " ").replace("__", "")
    return x


def paragraphs(x):
    return [inline(p) for p in re.findall(r"<p(?: [^>]*)?>(.*?)</p>", x, flags=re.S)]


def chapter(out, code, n, ch, last):
    # Chapter n's outline and sections, onto out: how many sections (last:
    # the chapter's last verse in the BSB).
    sections = 0
    out.append("C%d" % n)
    table = re.search(r"<table.*?</table>", ch, flags=re.S)
    if table:
        for row in re.findall(r"<tr[^>]*>(.*?)</tr>", table.group(0), flags=re.S):
            cells = re.findall(r"<td[^>]*>(.*?)</td>", row, flags=re.S)
            if len(cells) != 2:
                continue
            text = inline(cells[0])
            vs = []
            for r in re.findall(r'osisRef="Bible:[1-3A-Za-z]+\.\d+\.(\d+)(?:-[1-3A-Za-z]+\.\d+\.(\d+))?"', cells[1]):
                vs.append(int(r[0]))
                if r[1]:
                    vs.append(int(r[1]))
            if text and vs:
                lo, hi = min(vs), max(vs)
                out.append("O%s\t%d%s" % (text, lo, "-%d" % hi if hi > lo else ""))
    divs = re.findall(r'<div class="Commentary" id="Bible:[1-3A-Za-z]+\.(\d+)\.(\d+)(?:-[1-3A-Za-z]+\.(\d+)\.(\d+))?">(.*?)</div>',
                      ch, flags=re.S)
    ranges = []
    for c1, v1, c2, v2, body in divs:
        c1, v1 = int(c1), int(v1)
        c2, v2 = (int(c2), int(v2)) if c2 else (c1, v1)
        ranges.append([c1, v1, c2, v2, body])
    for i, r in enumerate(ranges):
        # (On to the verse before the next section, in its chapter.)
        if i + 1 < len(ranges) and ranges[i + 1][0] == r[2] and ranges[i + 1][1] - 1 > r[3]:
            r[3] = ranges[i + 1][1] - 1
    if not ranges:
        # (One comment: the chapter's paragraphs after its outline.)
        rest = ch[table.end():] if table else ch
        ps = re.findall(r"<p(?: [^>]*)?>(.*?)</p>", rest, flags=re.S)
        ps = [p for p in ps if inline(p)]
        if not ps:
            return 0
        out.append("K%d:1-%d:%d" % (n, n, last))
        for i, p in enumerate(ps):
            if i == 0 and re.fullmatch(r"\s*<b>(.*?)</b>\s*", p, flags=re.S):
                p = "<i>" + re.fullmatch(r"\s*<b>(.*?)</b>\s*", p, flags=re.S).group(1) + "</i>"
            elif i <= 1:
                # (The summary's dash: "—The Lord is my shepherd.")
                p = re.sub(r"^\s*—", "", p)
            out.append("p" + inline(p))
        return 1
    for c1, v1, c2, v2, body in ranges:
        if code == "3JN":
            v1, v2 = min(v1, 14), min(v2, 14)
        out.append("K%d:%d-%d:%d" % (c1, v1, c2, v2))
        sections += 1
        for p in paragraphs(re.sub(r"<h3.*?</h3>", "", body, flags=re.S)):
            if p:
                out.append("p" + p)
    return sections


def last_verses(bsb):
    # Each book's chapters' last verses, from bsb.txt: {code: [last, …]}.
    last, code = {}, None
    for line in open(bsb, encoding="utf-8"):
        if line[0] == "B":
            code = line[1:4]
            last[code] = []
        elif line[0] == "C":
            last[code].append(0)
        elif line[0] == "V":
            last[code][-1] = max(last[code][-1], int(re.match(r"V(\d+)", line).group(1)))
    return last


def main():
    src, bsb, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    last = last_verses(bsb)
    s = open(src, encoding="utf-8").read()
    out = []
    sections = 0
    books = re.split(r"(?=<div1 )", s)
    b = 0
    for part in books:
        m = re.match(r'<div1 title="([^"]*)"', part)
        if not m or m.group(1) in ("Title Page", "Indexes"):
            continue
        code = CODES[b]
        b += 1
        out.append("B" + code)
        first = part.find("<div2 ")
        head = part[:first]
        # (2 Kings 1 and 2 Chronicles 1 are not chapters of their own in
        # the ThML, but the book's first lines.)
        lone = re.search(r"<table|<div class=\"Commentary\"", head)
        for p in paragraphs(head[:lone.start()] if lone else head):
            if p:
                out.append("p" + p)
        if lone:
            sections += chapter(out, code, 1, head[lone.start():], last[code][0])
        elif code == "2CH":
            # (2 Chronicles 1's comment is the book's first lines, under a
            # title of their own, with no verses given: all 17 of them.)
            del out[len(out) - len([p for p in paragraphs(head) if p]):]
            out.append("C1")
            out.append("K1:1-1:17")
            sections += 1
            for p in paragraphs(head)[1:]:
                out.append("p" + p)
        for ch in re.split(r"(?=<div2 )", part[first:])[1:]:
            n = int(re.match(r'<div2 title="Chapter (\d+)"', ch).group(1))
            sections += chapter(out, code, n, ch, last[code][n - 1])
    with open(dst, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print("books %d, sections %d" % (b, sections))
    bare = []
    book = None
    for i, r in enumerate(out):
        if r[0] == "B":
            book = r[1:]
        elif r[0] == "C":
            j = i + 1
            while j < len(out) and out[j][0] == "O":
                j += 1
            if j == len(out) or out[j][0] != "K":
                bare.append("%s %s" % (book, r[1:]))
    print("chapters with no section %d: %s" % (len(bare), ", ".join(bare)))
    jhn = out.index("BJHN")
    c = out.index("C3", jhn)
    print("John 3: " + ", ".join(r for r in out[c:out.index("C4", c)] if r[0] == "K"))


main()
