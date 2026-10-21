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
verse, a word's place). A word takes its place's meaning (the Hebrew's
verses by their Hebrew numbers, orig.txt's N records; a psalm's title is
its verse 1) only when the meaning's entry lists the word's Strong's
number, or a known variant of it (VARIANTS: one lemma numbered apart);
the rest of a verse's occurrences of a number go to its words of that
number not yet given one, in the original order. A word with neither has
no meaning (the app gives the BSB's gloss alone): a neighbour's meaning,
from a place counted wrong, is worse than none.

It prints its coverage (of the words of each testament, names included),
how many meanings are another word's (the entry doesn't list the word's
number or a variant), and some words' meanings (John 3:16's ἠγάπησεν,
Genesis 1:7's אֲשֶׁר and הָיָה, Ezekiel 37:23's עַם, Jeremiah 51:64's
דִּבְרֵי); it exits 1 if a check fails (Greek coverage under 90%, Hebrew
under 75%, more than 0.2% of either testament's meanings another word's,
UBS's markup or a Louw–Nida reference left in meanings.txt, or one of
those words' meanings not its own).
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
    Louw–Nida entry ({D:11.55}) dropped with what only points to it (a
    reader has no Louw–Nida to look in: "(derivative of ἀγαπάω 'to love,'
    {D:25.43})" is "(derivative of ἀγαπάω 'to love')", "(see {D:11.67})"
    and "; see {D:93.32}" go); a word linked ({L:…<…>}, its homograph's [a]
    after it) and the rest ({A:MT}) as their text; SDBH's marks (◄ ► ≈
    between a definition's parts, "hence: =", |i…|i* round a Latin name, +
    before a detail) as plain punctuation."""
    s = re.sub(r"\s*\{N:[^}]*\}", "", s or "")
    s = re.sub(r"\{S:(\d{9,})\}", lambda m: ref_name(m.group(1)), s)
    ln = r"\{D:[^}]*\}"
    lns = ln + r"(?:\s*,?\s*(?:and|or|;)?\s*" + ln + r")*"
    s = re.sub(r",([’'])\s*" + lns, r"\1", s)
    s = re.sub(r"\s*\((?:see |cf\. |compare )?(?:also )?(?:discussion (?:at|in) )?" + lns + r"\)", "", s)
    s = re.sub(r"\s*[;,]?\s*(?:but\s+)?(?:\(?(?:see|compare|cf\.)\s+(?:also\s+)?(?:discussion (?:at|in) )?)" + lns, "", s)
    s = re.sub(r"\s*(?:[;,]|\b(?:at|in))\s*" + lns + r"(?=\s*[,()])", "", s)
    s = re.sub(r"\s*" + lns, "", s)
    s = re.sub(r"\{L:([^<}]*)(<[^>]*>)?\}(\[[a-z]\])?", r"\1", s)
    s = re.sub(r"\{[A-Z]:([^<}]*)(<[^>]*>)?\}", r"\1", s)
    s = re.sub(r"(?<=[^\x00-\x7f])\[[a-z]\]", "", s)
    s = re.sub(r"\|i(.*?)\|i\*", r"\1", s)
    s = re.sub(r"^\s*=\s*", "", s)
    s = re.sub(r"\s*[;,]?\s*[◄►≈]\s*[;,]?\s*", "; ", s)
    s = re.sub(r"(?<=[:;])\s*=\s+", " ", s)
    s = re.sub(r"\s*,?\s+\+\s+(?=[a-z])", ", ", s)
    s = re.sub(r"^[;\s]+|[;\s]+$", "", s)
    s = re.sub(r"\(\s*;\s*", "(", s)
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
                          "; ".join(clean(g) for g in sense.get("Glosses") or [] if clean(g) and not g.startswith("[Glosses")),
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


# Known variants of one word: (our Strong's number, one UBS's entry lists),
# where the BSB tables (or STEP) number a lemma or one of its forms apart
# from UBS. Found where a verse's places line up and the two disagree at
# one place between agreeing ones, three times or more, and each read: the
# rest of that list are a place's neighbour (a shift), not one word.
VARIANTS = frozenset(tuple(p.split("/")) for p in """
    G4771/G4675 G4771/G4572 G4771/G4674 G4771/G5212
    G1473/G2257 G3165/G2257 G1473/G2504 G1473/G1699 G1473/G1683
    G1510/G2258 G1511/G2258 G3778/G5023 G2036/G3004 G2046/G2036 G2400/G3708
    G2411/G2413 G4413/G4412 G2419/G2414 G2068/G5315 G3440/G3441 G2112/G2117
    G5225/G5224 G3361/G3756 G3361/G3379 G5037/G2532 G4459/G4458 G3403/G3415
    G3063/G3062 G2448/G2455 G4113/G4116 G848/G846 G2548/G2532 G2532/G2579
    G2532/G2547 G2532/G2548 G5101/G5100 G4057/G4056 G2207/G2208 G4118/G4183
    G4119/G4183 G4712/G4172 G687/G686 G4225/G4226 G681/G680 G159/G158
    G4252/G4251 G2908/G2909
    H582/H376 H2396/H3169 H7417/H7416 H6177/H6176 H8577/H8568 H4147/H4149
    H6032/H6030 H7921/H7909 H7654/H7653 H7843/H4889 H2334/H2971 H7034/H7033
    H3919/H3918 H2361/H2438 H1247/H1248 H8322/H8292 H4430/H4428 H5705/H5704
    H2493/H2494 H6992/H6991 H1219/H1208 H6252/H6253 H2655/H2654 H8076/H8074
    H2189/H2113 H1364/H1362 H3826/H3820
""".split())


def agrees(k, nums):
    """Whether a meaning whose entry lists nums is our word k's: its number
    is there, or a known variant of it."""
    return k in nums or any((k, n) in VARIANTS for n in nums)


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
                for n in sorted(set(nums) | set(k for k, t in VARIANTS if t in nums)):
                    occ[(ref, n)].append(((c, v), w, mid, place))
    mean = [0] * nw
    taken = set()
    # By place: a word takes its place's meaning only when the entry lists
    # its number, or a known variant of it. A place counted wrong (Genesis
    # 1:7's מִתַּחַת, which UBS counts as two) moves every place after it,
    # so a neighbour's meaning is never taken.
    for bsb, uref, ws, _ in orig_verses(data):
        for j, k, p in ws:
            x = at.get(uref + (p,))
            if j >= 0 and x and not mean[j] and agrees(k, x[1]):
                mean[j] = x[0]
                taken.add(uref + (p,))
                stats["words given a meaning by place" + ("" if k in x[1] else ", a variant's number")] += 1
    # The rest by number (or a variant's), in order, each place once.
    for (ref, n), xs in sorted(occ.items()):
        xs = sorted(x for x in xs if x[3] not in taken)
        ws = [i for i in vwords.get(ref, ()) if key[i] == n and not mean[i]]
        for i, x in zip(ws, xs):
            mean[i] = x[2]
            taken.add(x[3])
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

    # A meaning whose entry doesn't list the word's number (or a known
    # variant's) is another word's: a place counted wrong, its neighbour's.
    ot = set(book_codes(os.path.join(data, "bsb.txt"))[:39])
    where = {}
    for ref, ws in vwords.items():
        for i in ws:
            where[i] = ref
    for lg in "GH":
        ws = [i for i in range(nw) if mean[i] and (key[i][:1] or ("H" if where[i][0] in ot else "G")) == lg]
        bad = [i for i in ws if not agrees(key[i], lines[mean[i] - 1].split("\t")[6].split(","))]
        print("%s: %d of %d meanings another word's (%.2f%%; at most 0.2%%)"
              % (lg, len(bad), len(ws), 100.0 * len(bad) / max(1, len(ws))))
        if len(bad) > 0.002 * len(ws):
            print("FAIL: too many meanings given to the wrong word")
            ok = False
        for ref, n in collections.Counter(where[i] for i in bad).most_common(5):
            print("  %s %d:%d: %d" % (ref + (n,)))
    marks = collections.Counter()
    for x in lines:
        for m in ("≈", "◄", "►", "{", "}", "|i", "LN "):
            if m in x:
                marks[m] += 1
    for m, n in sorted(marks.items()):
        print("FAIL: %d meanings with UBS's markup %r left" % (n, m))
        ok = False

    def show(ref, n, want=None):
        f = []
        for i in [i for i in vwords[ref] if key[i] == n]:
            m = mean[i]
            f = lines[m - 1].split("\t") if m else []
            print("%s %d:%d %s: %s" % (ref + (n, " · ".join(f[1:6]) if f else "none")))
            if want is not None and not (f and agrees(n, f[6].split(",")) and want in f[5]):
                print("FAIL: %s %d:%d's %s is not %r" % (ref + (n, want)))
                return None
        return f
    f = show(("JHN", 3, 16), "G25")
    if not f or f[1] != "025B" and "Love" not in f[3]:
        print("FAIL: John 3:16's ἠγάπησεν is not in Love, Affection, Compassion")
        ok = False
    show(("GEN", 1, 1), "H1254")
    show(("PSA", 23, 1), "H7462")
    for ref, n, want in ((("GEN", 1, 7), "H834", "that; which"), (("GEN", 1, 7), "H1961", "to happen"),
                         (("EZK", 37, 23), "H5971", "people"), (("JER", 51, 64), "H1697", "word")):
        if show(ref, n, want) is None:
            ok = False
    return ok


def main():
    if sys.argv[1] == "--check":
        sys.exit(0 if check(sys.argv[2]) else 1)
    write(sys.argv[1], sys.argv[2])
    sys.exit(0 if check(sys.argv[2]) else 1)


main()
