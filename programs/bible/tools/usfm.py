#!/usr/bin/env python3
"""A Bible's USFM as the app's text: the Berean Standard Bible, or one of
the public-domain versions bundled beside it (DESIGN.md §9.2).

    python3 -I usfm.py VERSION USFM_DIR OUT

VERSION is bsb, kjv, web, asv or ylt; USFM_DIR the version's zip, unpacked:
bereanbible.com's bsb_usfm.zip, or eBible.org's eng-kjv2006, engwebp,
eng-asv and engylt (see fetch.sh, which checks their sha256). All are in
the public domain. OUT is one record a line: a letter saying what, then its
text, in order through the Bible:

    B<CODE> <name>   a book (GEN Genesis)
    C<n>             a chapter
    M<text>          a major section (BOOK I), m its range (Psalms 1-41)
    S<text>          a section heading, s a lesser one
    R<text>          the passages a heading points to
    D<text>          a psalm's title (d: more of it, after a footnote in it)
    A<text>          an acrostic letter (Aleph)
    P<k>             a paragraph: m plain, o opening, 1 2 poetry,
                     l L a list, c centered, r to the right
    _                a break between stanzas
    V<n>             a verse begins
    T<text>          words
    W<text>          words of Jesus (laid out as T)
    I<text>          words supplied by the translators (KJV, ASV: italic)
    J<text>          supplied words inside the words of Jesus
    F<text>          a footnote, where it is marked

Words have no space at their end; at their start only where they follow
other words or a footnote's mark in the same line of text. data/bsb.txt
comes out of the bsb profile byte for byte as it did out of bsb.py.
"""
import os
import re
import sys

VERSIONS = ("bsb", "kjv", "web", "asv", "ylt")
PARA = {"m": "m", "pmo": "o", "q1": "1", "q2": "2", "li1": "l", "li2": "L",
        "pc": "c", "qr": "r", "p": "m", "q": "1"}
# (The other versions' paragraphs, as the nearest of the BSB's.)
PARA_MORE = {"pi1": "m", "nb": "m", "mi": "2", "q3": "2", "qc": "c"}
LINE = {"ms1": "M", "ms": "M", "mr": "m", "s1": "S", "s2": "s", "r": "R",
        "d": "D", "qa": "A", "sp": "s"}
# Names the books go by here, where \h is short.
NAMES = {"SNG": "Song of Solomon", "PSA": "Psalms"}
SKIP = {"id", "h", "toc1", "toc2", "toc3", "mt1", "mt", "mt2", "usfm",
        "mt3", "mt4", "ide", "cl", "rem"}
BOOKS = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA "
         "PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC "
         "MAL MAT MRK LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM "
         "HEB JAS 1PE 2PE 1JN 2JN 3JN JUD REV").split()

profile = "bsb"

# Slips in the publisher's USFM (2026-03-08), mended: a table's marker
# left in the text, and two words run together.
FIXES = [("she named vvv him", "she named him"), ("“evenif you", "“even if you")]


def clean(text):
    if profile == "bsb":
        for a, b in FIXES:
            text = text.replace(a, b)
    else:
        text = clean_ebible(text)
    text = re.sub(r"\\w ([^|\\]*)\|[^\\]*\\w\*", r"\1", text)
    text = re.sub(r"\\\+?it\*?", "", text)
    # A reference's visible text only: \ref John 3:16|JHN 3:16\ref*
    text = re.sub(r"\\ref ([^|\\]*)(?:\|[^\\]*)?\\ref\*", r"\1", text)
    # A verse's number inside a footnote: the number and a space.
    text = re.sub(r"\\fv (\d+)\\fv\*", r"\1 ", text)
    # Em dashes unspaced, as the BSB prints them.
    text = re.sub(r"[ \t]*—[ \t]*", "—", text)
    if profile != "bsb":
        # (But not into a verse's number, which a dash may begin after.)
        text = re.sub(r"(\\v \d+)—", r"\1 —", text)
    # A psalm's title holding verse 1's marker (\d \v 1 A Psalm of David.):
    # the title, and the verse after it, where its first line begins.
    text = re.sub(r"\\d \\v (\d+) ([^\n]*)\n((?:\\b *\n)?\\[a-z0-9]+)", r"\\d \2\n\3 \\v \1", text)
    # An acrostic's letter is named only (ALEPH), as before.
    text = re.sub(r"\\qa [\u05d0-\u05ea]\s*\n", "", text)
    # A line after the text, set apart (Habakkuk 3:19's last words).
    text = text.replace("\\mr ", "\\pc ")
    # A range after a major section (\ms BOOK I, \d Psalms 1–41).
    text = re.sub(r"(\\ms [^\n]*\n)\\d ", r"\1\\mr ", text)
    return text


def clean_ebible(text):
    # eBible.org's markup, down to the BSB's: words' Strong's numbers (and
    # words nested in other markup, \+w) to their text; cross references
    # dropped (the app has its own, §9.6); the divine name in capitals;
    # Selah as words after a space; character styles to their text.
    text = re.sub(r"\\x .*?\\x\*", "", text, flags=re.S)
    text = re.sub(r"\\(\+?)w ([^|\\]*)(?:\|[^\\]*)?\\\1w\*", r"\2", text)
    text = re.sub(r"\\\+?nd (.*?)\\\+?nd\*", lambda m: m.group(1).upper(), text, flags=re.S)
    text = re.sub(r"\\qs (.*?)\\qs\*", r" \1", text)
    # Psalm 119's letters (KJV: \s1 \tl א ALEPH.\tl*), named as the BSB's.
    text = re.sub(r"\\s1 \\tl\s+[\u05d0-\u05ea]\s*([A-Z]+)\.?\\tl\*", r"\\qa \1", text)
    # (Supplied words in a heading's line, as in KJV's subscriptions, are
    # the heading's.)
    text = re.sub(r"(?m)^(\\(?:s[0-9]?|d|sp|ms[0-9]?) .*)$",
                  lambda m: re.sub(r"\\\+?add(?:\*| )", "", m.group(1)), text)
    text = re.sub(r"\\\+?(?:sc|bd|it|tl|k|bk|wh|em) ", "", text)
    text = re.sub(r"\\\+?(?:sc|bd|it|tl|k|bk|wh|em)\*", "", text)
    # (KJV: the translators' paragraph marks, which its paragraphs already
    # are.)
    text = re.sub(r"(\\v \d+ )¶ ?", r"\1", text)
    text = text.replace("¶", "")
    # KJV: an epistle's subscription, a heading after its last verse, is a
    # lesser line.
    last = text.rfind("\\v ")
    if last >= 0:
        text = text[:last] + text[last:].replace("\\s1 ", "\\s2 ")
    if profile == "ylt":
        # The YLT is printed a verse a paragraph: one for each.
        text = re.sub(r"\\p[ \t]*\n", "", text)
        text = re.sub(r"\\v (\d+)", r"\\p\n\\v \1", text)
    return text


def convert(path, out):
    src = clean(open(path, encoding="utf-8").read())
    code = re.search(r"\\id (\w+)", src).group(1)
    if code not in BOOKS:
        return
    name = re.search(r"\\h ([^\n]*)", src).group(1).strip()
    out.append("B%s %s" % (code, NAMES.get(code, name)))
    words = []
    jesus = [False]
    added = [False]
    # (eBible's character markers own the one space after them.)
    eat = [False]
    ebible = profile != "bsb"

    def flush():
        t = re.sub(r"[ \t\r]+", " ", "".join(words))
        words.clear()
        if ebible and t == " ":
            # (A space between a note and markup after it, as "\f* \wj Satan":
            # the next words' own.)
            words.append(" ")
            return
        if t.strip():
            if added[0]:
                out.append(("J" if jesus[0] else "I") + t)
            else:
                out.append(("W" if jesus[0] else "T") + t)

    # Footnotes out of the way first: \f + \fr 1:3 \ft text\f*
    pieces = re.split(r"(\\f .*?\\f\*)", src, flags=re.S)
    for piece in pieces:
        if piece.startswith("\\f "):
            flush()
            note = re.sub(r"^\\f \S*\s*", "", piece[:-3])
            note = re.sub(r"\\fr [^\\]*", "", note)
            note = re.sub(r"\\\+?f[a-z]+\*? ?", " ", note)
            if ebible:
                note = re.sub(r"\\\+?(?:add|wj)\*? ?", "", note)
            note = re.sub(r"\s+", " ", note).strip()
            note = re.sub(r" ([;,.:)])", r"\1", note)
            out.append("F" + note)
            continue
        split = r"(\\\+?[a-z0-9]+\*?)" if ebible else r"(\\[a-z0-9]+\*?)"
        for tok in re.split(split, piece):
            if not tok.startswith("\\"):
                if eat[0] and tok.startswith(" "):
                    tok = tok[1:]
                eat[0] = False
                words.append(tok)
                continue
            eat[0] = False
            mark = tok[1:]
            if ebible:
                mark = mark.lstrip("+")
            rest_needed = mark in LINE or mark in SKIP or mark in ("c", "v")
            if mark in ("wj", "wj*"):
                flush()
                jesus[0] = mark == "wj"
                eat[0] = ebible and jesus[0]
            elif ebible and mark in ("add", "add*"):
                flush()
                added[0] = mark == "add"
                eat[0] = added[0]
            elif not rest_needed and (mark in PARA or ebible and mark in PARA_MORE):
                flush()
                out.append("P" + PARA.get(mark, PARA_MORE.get(mark)))
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
    # left as \0mark\0 inside T (or W) records: split them out.
    out = []
    for r in records:
        if r[0] not in "TWIJ" or "\0" not in r:
            out.append(r)
            continue
        kind = r[0]
        parts = r[1:].split("\0")
        if parts[0].strip():
            out.append(kind + parts[0])
        i = 1
        while i < len(parts):
            mark, text = parts[i], parts[i + 1]
            i += 2
            if mark in ("c", "v"):
                # (eBible's words keep the space before the markup after
                # them.)
                text = text.lstrip(" ") if profile != "bsb" else text.strip(" ")
                n, _, text = text.partition(" ")
                n = n.strip()
                out.append(("C" if mark == "c" else "V") + n)
                if text.strip():
                    out.append(kind + text.lstrip())
            elif mark in LINE:
                body, nl, after = text.partition("\n")
                out.append(LINE[mark] + body.strip())
                if after.strip():
                    out.append(kind + after.strip())
            elif mark in SKIP:
                _, _, after = text.partition("\n")
                if after.strip():
                    out.append(kind + after.strip())
    return out


def tidy(records):
    # A footnote marked inside a heading line (a psalm's title): the line
    # goes on after it as more of the title (d).
    fixed = []
    for i, r in enumerate(records):
        if r[0] in "TWIJ" and len(fixed) >= 2 and fixed[-1][0] == "F" and fixed[-2][0] in "Dd" \
                and "\n" not in r[1:].rstrip() and (i + 1 >= len(records) or records[i + 1][0] not in "TWIJ"):
            fixed.append("d" + r[1:])
            continue
        fixed.append(r)
    # Words have no space at their end; at their start only after a
    # footnote's mark or other words, where a space was between them (the
    # app puts a space before each verse but a paragraph's first).
    out = []
    for i, r in enumerate(fixed):
        if r[0] in "TWIJd":
            body = re.sub(r"\s+", " ", r[1:])
            if body.endswith(" ") and i + 1 < len(fixed) and fixed[i + 1][0] in "TWIJ" \
                    and not fixed[i + 1][1:2].isspace():
                fixed[i + 1] = fixed[i + 1][0] + " " + fixed[i + 1][1:]
            body = body.rstrip()
            if not (out and out[-1][0] in "FTWIJd" and r[0] != "d"):
                body = body.lstrip()
            if r[0] == "d":
                body = " " + body.lstrip() if body[:1] not in ",.;:" else body
            if not body.strip():
                continue
            r = r[0] + body
        out.append(r.rstrip())
    return out


def no_empty_verses(records):
    # A verse with no words (the ASV's Matthew 17:21, only a footnote; the
    # WEB's Romans 16:25-27, given at 14:24-26) is not one, as the BSB
    # leaves out a verse it gives in a footnote: its note stays where it is,
    # after the verse before.
    out = []
    for i, r in enumerate(records):
        if r[0] == "V":
            j = i + 1
            while j < len(records) and records[j][0] not in "VCBTWIJ":
                j += 1
            if j >= len(records) or records[j][0] not in "TWIJ":
                continue
        out.append(r)
    return out


def main():
    global profile
    profile, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    if profile not in VERSIONS:
        raise SystemExit("usfm.py: VERSION is one of " + ", ".join(VERSIONS))
    records = []
    for f in sorted(os.listdir(src)):
        if f.endswith(".usfm") or f.endswith(".SFM"):
            convert(os.path.join(src, f), records)
    records = tidy(lines_of(records))
    if profile != "bsb":
        records = no_empty_verses(records)
    # The books in the Bible's order (the files are by name).
    books = {}
    cur = None
    for r in records:
        if r[0] == "B":
            cur = r[1:4]
            books[cur] = []
        books[cur].append(r)
    missing = [b for b in BOOKS if b not in books]
    if missing:
        raise SystemExit("usfm.py: no " + " ".join(missing))
    with open(dst, "w", encoding="utf-8") as f:
        for b in BOOKS:
            f.write("\n".join(books[b]) + "\n")


main()
