#!/usr/bin/env python3
"""Each word's meaning in its verse, and its semantic domain, from the
United Bible Societies' open dictionaries (DESIGN.md §14.10b.3, §14.11):

    python3 -I ubs.py UBS_DIR DATA

UBS_DIR has, as fetch.sh names them, from github.com/ubsicap/ubs-open-license
(CC BY-SA 4.0): UBSGreekNTDic-v1.1-en.JSON, the UBS Dictionary of the
Greek New Testament (adapted from Louw and Nida's lexicon), and
UBSHebrewDic-v0.9.3-en.JSON with UBSHebrewDicLexicalDomains-v0.9.3-en.JSON,
the UBS Dictionary of Biblical Hebrew (from SDBH, about nine words in ten
so far). DATA is the app's data/ (bsb.txt, orig.txt, lang/words.bin,
verses.bin). Standard library only. It writes, CC BY-SA 4.0 as their
source is, apart from the rest of the data:

  lang/meanings.bin  a u16 per words.bin word: its meaning (a line of
                     meanings.txt, from 1; 0 none known).
  lang/meanings.txt  a meaning a line: L<TAB>CODE<TAB>DOMAIN<TAB>SUBDOMAIN
                     <TAB>DEFINITION<TAB>GLOSSES<TAB>STRONGS, L G or H;
                     CODE the domain it is grouped by (Louw and Nida's
                     subdomain, 025B; SDBH's lexical domain,
                     002003003005); DOMAIN and SUBDOMAIN their names
                     (Attitudes and Emotions, Love, Affection, Compassion;
                     for Hebrew the domain above SDBH's and SDBH's own);
                     DEFINITION the short definition; GLOSSES its glosses
                     joined by "; "; STRONGS the entry's numbers (G25,
                     H157 …, by "," ). Its first line is the credit.

UBS gives every occurrence of a meaning as BBBCCCVVVSSWWW (book, chapter,
verse, a word's place). A verse's occurrences of a Strong's number are
given to words.bin's words of that number in that verse in the original
order (the Hebrew's verses by their Hebrew numbers, orig.txt's N records;
a psalm's title is its verse 1). Where the counts differ, those in order
up to the fewer, and the verse is counted.

It prints its coverage (of the words of each testament, names included)
and John 3:16's ἠγάπησεν and Genesis 1:1's בָּרָא; it exits 1 if a check
fails (Greek coverage under 90%, Hebrew under 75%, ἠγάπησεν not 25.43).
--check DATA checks the files so, without UBS's:

    python3 -I ubs.py --check DATA
"""
import collections
import json
import os
import re
import struct
import sys

CREDIT = ("UBS Dictionary of the Greek New Testament, © United Bible Societies 2023 (adapted from "
          "Semantic Dictionary of Biblical Greek © United Bible Societies 2018-2023, adapted from "
          "Louw and Nida, Greek-English Lexicon of the New Testament Based on Semantic Domains, "
          "© United Bible Societies 1988, 1989); UBS Dictionary of Biblical Hebrew, © United Bible "
          "Societies 2023 (adapted from Semantic Dictionary of Biblical Hebrew © 2000-2023 United "
          "Bible Societies). CC BY-SA 4.0, https://github.com/ubsicap/ubs-open-license. Changed: "
          "each meaning given to the words of the text it names, its markup made plain, by Smooth Bible (tools/ubs.py); "
          "this file and meanings.bin are shared under the same licence.")


def chapters(path):
    out = []
    book = None
    for line in open(path, encoding="utf-8"):
        if line[:1] == "B":
            book = line[1:4]
        elif line[:1] == "C":
            out.append((book, int(line[1:])))
    return out


def book_codes(path):
    return [line[1:4] for line in open(path, encoding="utf-8") if line[:1] == "B"]


def hebrew_numbers(path):
    """(book, Hebrew c, Hebrew v) -> the BSB's (book, c, v), from orig.txt's
    N records (a verse without one is numbered alike); a title's Hebrew
    number is its psalm's verse 1."""
    out = {}
    book = None
    c = 0
    hn = None
    for line in open(path, encoding="utf-8"):
        k = line[:1]
        if k == "B":
            book = line[1:4]
        elif k == "C":
            c = int(line[1:])
        elif k == "N":
            a, b = line[1:].strip().split(":")
            hn = (int(a), int(b))
        elif k == "D":
            if hn:
                out.setdefault((book,) + hn, (book, c, 1))
            hn = None
        elif k == "V":
            v = int(line[1:])
            h = hn or (c, v)
            out.setdefault((book,) + h, (book, c, v))
            if not hn:
                out.setdefault((book, c, v), (book, c, v))
            hn = None
    return out


# The books' names in order (bsb.txt's), for a reference in a definition.
BOOK_NAMES = []


def ref_name(code):
    """BBBCCCVVV… (UBS's books 1 to 66) as "Revelation 20:3"."""
    b, c, v = int(code[0:3]), int(code[3:6]), int(code[6:9])
    if not 1 <= b <= len(BOOK_NAMES):
        return ""
    name = "Psalm" if BOOK_NAMES[b - 1] == "Psalms" else BOOK_NAMES[b - 1]
    return "%s %d:%d" % (name, c, v) if v else "%s %d" % (name, c)


def clean(s):
    """UBS's markup made plain: a note's mark ({N:001}) dropped, as the notes
    aren't kept; a verse ({S:06602000300012}) named, Revelation 20:3; a
    Louw–Nida entry ({D:11.55}) as LN 11.55; a word linked ({L:…<…>}, its
    homograph's [a] after it) and the rest ({A:MT}) as their text."""
    s = re.sub(r"\s*\{N:[^}]*\}", "", s or "")
    s = re.sub(r"\{S:(\d{9,})\}", lambda m: ref_name(m.group(1)), s)
    s = re.sub(r"\{D:([^}]*)\}", r"LN \1", s)
    s = re.sub(r"\{L:([^<}]*)(<[^>]*>)?\}(\[[a-z]\])?", r"\1", s)
    s = re.sub(r"\{[A-Z]:([^<}]*)(<[^>]*>)?\}", r"\1", s)
    s = re.sub(r"(?<=[^\x00-\x7f])\[[a-z]\]", "", s)
    s = re.sub(r"^=\s*", "", s.strip())
    return " ".join(s.replace("\t", " ").split())


def numbers(codes):
    out = []
    for c in codes or []:
        m = re.match(r"([GH])0*(\d+)", c)
        if m:
            out.append(m.group(1) + m.group(2))
    return out


def domain_names(path):
    d = json.load(open(path, encoding="utf-8"))
    out = {}
    for x in d:
        loc = [l for l in x.get("SemanticDomainLocalizations") or [] if l.get("LanguageCode") == "en"]
        if loc:
            out[x["Code"]] = loc[0]["Label"]
    return out


def meanings_of(path, lang, hdomains):
    """Each meaning of the dictionary: (fields, strongs, refs)."""
    d = json.load(open(path, encoding="utf-8"))
    for e in d:
        nums = numbers(e.get("StrongCodes"))
        for bf in e.get("BaseForms") or []:
            for m in bf.get("LEXMeanings") or []:
                sense = next((s for s in m.get("LEXSenses") or [] if s.get("LanguageCode") == "en"), None)
                if not sense:
                    continue
                doms = m.get("LEXDomains") or []
                subs = m.get("LEXSubDomains") or []
                if lang == "G":
                    dom = doms[0]["Domain"] if doms else ""
                    sub = subs[0]["Domain"] if subs else dom
                    code = (subs[0]["DomainCode"] if subs else doms[0]["DomainCode"] if doms else "")
                else:
                    code = doms[0]["DomainCode"] if doms else ""
                    sub = doms[0]["Domain"] if doms else ""
                    dom = hdomains.get(code[:-3], "") if len(code) > 3 else ""
                fields = [lang, code, clean(dom), clean(sub), clean(sense.get("DefinitionShort")),
                          "; ".join(clean(g) for g in sense.get("Glosses") or [] if clean(g)),
                          ",".join(nums)]
                yield fields, nums, m.get("LEXReferences") or []


def load_words(data):
    lang = os.path.join(data, "lang")
    words = open(os.path.join(lang, "words.bin"), "rb").read()
    vb = open(os.path.join(lang, "verses.bin"), "rb").read()
    nw = len(words) // 12
    nv = len(vb) // 8 - 1
    chap = chapters(os.path.join(data, "bsb.txt"))
    key = []
    order = []
    for i in range(nw):
        s, _, _, o = struct.unpack_from("<HHBB", words, i * 12)
        n = s & 0x7FFF
        key.append(("G" if s & 0x8000 else "H") + str(n) if n else "")
        order.append(o)
    vwords = {}
    for vi in range(nv):
        first, ci, v = struct.unpack_from("<IHH", vb, vi * 8)
        nxt = struct.unpack_from("<I", vb, vi * 8 + 8)[0]
        b, c = chap[ci]
        vwords[(b, c, v & 0x7FFF)] = sorted(range(first, nxt), key=lambda i: order[i])
    return nw, key, vwords


# Prefixes a Hebrew word's parsing begins with (morph.txt's), each a word
# of its own to UBS.
PREFIXES = ("Conj", "Art", "Prep", "Interrog")


def prefix_count(code):
    parts = code.split(" | ")
    k = 0
    for p in parts[:-1]:
        items = p.split(", ")
        if all(x.split("-")[0] in PREFIXES for x in items):
            k += len(items)
        else:
            break
    return k


def orig_verses(data):
    """orig.txt's verses: (the BSB's (book, c, v), UBS's (book, c, v): the
    Hebrew's own number, a title its own, [(words.bin index or -1, strongs
    key, UBS's place)])."""
    lang = os.path.join(data, "lang")
    recs = open(os.path.join(lang, "orig-words.bin"), "rb").read()
    morph = [x.split("\t")[0] for x in open(os.path.join(lang, "morph.txt"), encoding="utf-8").read().split("\n")[:-1]]
    out = []
    book = None
    c = 0
    hn = None
    k = 0
    for line in open(os.path.join(data, "orig.txt"), encoding="utf-8"):
        line = line.rstrip("\n")
        t = line[:1]
        if t == "B":
            book = line[1:4]
        elif t == "C":
            c = int(line[1:])
        elif t == "N":
            a, b = line[1:].split(":")
            hn = (int(a), int(b))
        elif t in "DV":
            v = 1 if t == "D" else int(line[1:])
            out.append([(book, c, v), (book,) + (hn or (c, v)), [], 0])
            hn = None
        if t in "DHXT":
            b = line[1:].encode()
            i = 0
            while i < len(b):
                if b[i] == 32:
                    i += 1
                    continue
                s, m, _, _, n, j = struct.unpack_from("<HHBBHI", recs, k * 12)
                i += n
                k += 1
                x = out[-1]
                if s & 0x8000:
                    x[3] += 2
                else:
                    x[3] += 2 * (prefix_count(morph[m]) + 1)
                key = ("G" if s & 0x8000 else "H") + str(s & 0x7FFF)
                x[2].append((j if j != 0xFFFFFFFF else -1, key, x[3]))
    return out


def build(ubs_dir, data):
    books = book_codes(os.path.join(data, "bsb.txt"))
    BOOK_NAMES[:] = [line[5:].strip() for line in open(os.path.join(data, "bsb.txt"), encoding="utf-8")
                     if line[:1] == "B"]
    nw, key, vwords = load_words(data)
    hnum = hebrew_numbers(os.path.join(data, "orig.txt"))
    hdomains = domain_names(os.path.join(ubs_dir, "UBSHebrewDicLexicalDomains-v0.9.3-en.JSON"))
    lines = []
    # A place's meaning (the first given for it) and its numbers; and each
    # BSB verse's places by number, for the words a place didn't give.
    at = {}
    occ = collections.defaultdict(list)
    stats = collections.Counter()
    for path, lang in (("UBSGreekNTDic-v1.1-en.JSON", "G"), ("UBSHebrewDic-v0.9.3-en.JSON", "H")):
        for fields, nums, refs in meanings_of(os.path.join(ubs_dir, path), lang, hdomains):
            lines.append(fields)
            mid = len(lines)
            for r in refs:
                if len(r) != 14:
                    continue
                b, c, v, w = int(r[0:3]), int(r[3:6]), int(r[6:9]), int(r[11:14])
                if not w or b < 1 or b > 66:
                    continue
                place = (books[b - 1], c, v, w)
                if place not in at:
                    at[place] = (mid, set(nums))
                else:
                    continue
                ref = (books[b - 1], c, v)
                if lang == "H":
                    ref = hnum.get(ref)
                    if ref is None:
                        stats["Hebrew references to no verse"] += 1
                        continue
                for n in nums:
                    occ[(ref, n)].append(((c, v), w, mid, place))
    mean = [0] * nw
    taken = set()
    # By place: a word whose number is the place's; or any word of a verse
    # most of whose words agree (STEP and UBS number some forms apart: σου
    # G4771, G4675).
    for bsb, uref, ws, _ in orig_verses(data):
        hits = [(j, k, p) for j, k, p in ws if uref + (p,) in at]
        agree = sum(1 for j, k, p in hits if k in at[uref + (p,)][1])
        trust = hits and agree >= 0.7 * len(hits)
        for j, k, p in hits:
            mid, nums = at[uref + (p,)]
            if j >= 0 and (k in nums or trust):
                mean[j] = mid
                taken.add(uref + (p,))
                stats["words given a meaning by place" + ("" if k in nums else ", their numbers apart")] += 1
    # The rest by number, in order.
    for (ref, n), xs in occ.items():
        xs = sorted(x for x in xs if x[3] not in taken)
        ws = [i for i in vwords.get(ref, ()) if key[i] == n and not mean[i]]
        for i, x in zip(ws, xs):
            mean[i] = x[2]
            stats["words given a meaning by number, in order"] += 1
    return lines, mean, stats


def write(ubs_dir, data):
    lines, mean, stats = build(ubs_dir, data)
    lang = os.path.join(data, "lang")
    with open(os.path.join(lang, "meanings.txt"), "w", encoding="utf-8") as f:
        f.write("# " + CREDIT + "\n")
        for x in lines:
            f.write("\t".join(x) + "\n")
    open(os.path.join(lang, "meanings.bin"), "wb").write(struct.pack("<%dH" % len(mean), *mean))
    for k, n in sorted(stats.items()):
        print("%s: %d" % (k, n))
    print("meanings: %d" % len(lines))


def check(data):
    lang = os.path.join(data, "lang")
    nw, key, vwords = load_words(data)
    mb = open(os.path.join(lang, "meanings.bin"), "rb").read()
    lines = open(os.path.join(lang, "meanings.txt"), encoding="utf-8").read().split("\n")[1:-1]
    ok = True
    if len(mb) != 2 * nw:
        print("FAIL: meanings.bin has %d bytes for %d words" % (len(mb), nw))
        return False
    mean = struct.unpack("<%dH" % nw, mb)
    if max(mean) > len(lines):
        print("FAIL: a meaning past meanings.txt's lines")
        ok = False
    for lg, floor in (("G", 0.90), ("H", 0.75)):
        ws = [i for i in range(nw) if key[i][:1] == lg]
        have = sum(1 for i in ws if mean[i])
        print("%s: %d of %d words with a meaning (%.1f%%)" % (lg, have, len(ws), 100.0 * have / len(ws)))
        if have < floor * len(ws):
            print("FAIL: under %d%%" % (floor * 100))
            ok = False

    def show(ref, n):
        ws = [i for i in vwords[ref] if key[i] == n]
        m = mean[ws[0]] if ws else 0
        f = lines[m - 1].split("\t") if m else []
        print("%s %d:%d %s: %s" % (ref + (n, " · ".join(f[1:6]) if f else "none")))
        return f
    f = show(("JHN", 3, 16), "G25")
    if not f or f[1] != "025B" and "Love" not in f[3]:
        print("FAIL: John 3:16's ἠγάπησεν is not in Love, Affection, Compassion")
        ok = False
    show(("GEN", 1, 1), "H1254")
    show(("PSA", 23, 1), "H7462")
    return ok


def main():
    if sys.argv[1] == "--check":
        sys.exit(0 if check(sys.argv[2]) else 1)
    write(sys.argv[1], sys.argv[2])
    sys.exit(0 if check(sys.argv[2]) else 1)


main()
