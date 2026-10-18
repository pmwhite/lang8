#!/usr/bin/env python3
"""Each original word's exact sense, for the word study (DESIGN.md §10.3).

    python3 -I senses.py STEP_DIR DATA

STEP_DIR has STEP Bible's amalgamated texts as fetch.sh names them
(TAHOT-*.txt, TAGNT-*.txt; CC BY 4.0, www.STEPBible.org); DATA is the app's
data/ (bsb.txt, lang/words.bin, verses.bin, lexicon.txt, conc.bin, as
bsb_lang.py made them). Standard library only. It writes:

  lang/senses.bin  a u8 per words.bin entry: k, the word's sense as the k-th
                   line (from 1) of its base's @ block in lexicon.txt, the
                   one whose code is the word's dStrong (an unlettered one:
                   the line with no code); 1 when the base has one line,
                   whatever STEP says or if it has no word for it; 0 not
                   known (DESIGN.md's "0: the main entry" is not used: the
                   main entry is line 1). A dStrong no line has (TAHOT's
                   unlettered H3064, TAGNT's G3708) is given the one line
                   whose gloss is the word's own sense gloss, if one is.

A STEP word's dStrongs (H9003/{H7225G}, G1473=P-1NS + G2532=CONJ) give a word
each, but for the prefixes and suffixes (H9000 and up). A verse's STEP words
are matched in their order with the verse's words in words.bin, by base
number: each takes the first unused word of the verse, in original order
(words.bin's order), with its base. STEP numbers verses as English Bibles
do, and the BSB too, but for a psalm's title (verse 0: the BSB's verse 1,
as in words.bin); words left over are tried at STEP's other numbering (the
Hebrew's, in parentheses, or the brackets of TAGNT).

It prints the coverage (of the words with a Strong's), Genesis 1:1's "God"
and Exodus 20:3's "gods",
and checks that each base's senses' counts sum to its count in conc.bin; it
exits 1 if a check fails (under 95%, God not the sense glossed "God", gods
not H430J, the counts). --check DATA checks DATA/lang/senses.bin so, without STEP's files:

    python3 -I senses.py --check DATA
"""
import collections
import glob
import os
import re
import struct
import sys

STEP_BOOKS = {
    "gen": "GEN", "exo": "EXO", "lev": "LEV", "num": "NUM", "deu": "DEU", "jos": "JOS",
    "jdg": "JDG", "rut": "RUT", "1sa": "1SA", "2sa": "2SA", "1ki": "1KI", "2ki": "2KI",
    "1ch": "1CH", "2ch": "2CH", "ezr": "EZR", "neh": "NEH", "est": "EST", "job": "JOB",
    "psa": "PSA", "pro": "PRO", "ecc": "ECC", "sng": "SNG", "sol": "SNG", "isa": "ISA",
    "jer": "JER", "lam": "LAM", "ezk": "EZK", "eze": "EZK", "dan": "DAN", "hos": "HOS",
    "jol": "JOL", "joe": "JOL", "amo": "AMO", "oba": "OBA", "jon": "JON", "mic": "MIC",
    "nam": "NAM", "nah": "NAM", "hab": "HAB", "zep": "ZEP", "hag": "HAG", "zec": "ZEC",
    "mal": "MAL", "mat": "MAT", "mrk": "MRK", "mar": "MRK", "luk": "LUK", "jhn": "JHN",
    "joh": "JHN", "act": "ACT", "rom": "ROM", "1co": "1CO", "2co": "2CO", "gal": "GAL",
    "eph": "EPH", "php": "PHP", "phi": "PHP", "col": "COL", "1th": "1TH", "2th": "2TH",
    "1ti": "1TI", "2ti": "2TI", "tit": "TIT", "phm": "PHM", "heb": "HEB", "jas": "JAS",
    "1pe": "1PE", "2pe": "2PE", "1jn": "1JN", "2jn": "2JN", "3jn": "3JN", "jud": "JUD",
    "jude": "JUD", "rev": "REV",
}
REF = re.compile(r"([0-9A-Za-z]+)\.(\d+)\.(\d+)(?:[(\[{](\d+)\.(\d+)[)\]}])?#")
CODE = re.compile(r"([HG])(\d{4})([A-Za-z]*)")


def chapters(path):
    # (book, chapter) of each chapter index.
    out = []
    book = None
    for line in open(path, encoding="utf-8"):
        if line[:1] == "B":
            book = line[1:4]
        elif line[:1] == "C":
            out.append((book, int(line[1:])))
    return out


def lexicon(path):
    # base -> [code of each line], and base -> [gloss of each line]
    lex = {}
    glosses = {}
    cur = None
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if line.startswith("@"):
            cur = lex[line[1:]] = []
            gl = glosses[line[1:]] = []
        elif cur is not None:
            f = line.split("\t")
            cur.append(f[0])
            gl.append(f[4] if len(f) > 4 else "")
    return lex, glosses


def plain(g):
    # A gloss as compared: TBESG's "to see: see" is its sense's "see".
    g = g.split(":")[-1] if ":" in g else g
    return " ".join(re.sub(r"[^a-z ]", " ", g.lower()).split())


def step_gloss(f, greek, code):
    # A STEP word's own sense gloss: TAGNT's meaning before the "»"
    # (": see»to see|1_see"); TAHOT's from its expansion, the part of
    # CODE=lemma=gloss»... for its main word.
    if greek:
        return plain(f[9].split("»")[0]) if len(f) > 9 else ""
    last = next((x for x in reversed(f) if "=" in x), "")
    for part in re.split(r"[/{}]", last):
        bits = part.split("=")
        if len(bits) >= 3 and CODE.fullmatch(bits[0]) and \
                bits[0][0] + str(int(bits[0][1:5])) + bits[0][5:] == code:
            return plain(bits[2].split("»")[0])
    return ""


def conc_counts(path):
    b = open(path, "rb").read()
    out = {}
    i = 0

    def leb():
        nonlocal i
        n = s = 0
        while True:
            x = b[i]
            i += 1
            n |= (x & 127) << s
            s += 7
            if not x & 128:
                return n
    while i < len(b):
        j = b.index(b"\0", i)
        k = b[i:j].decode()
        i = j + 1
        out[k] = leb()
        while b[i]:
            leb()
        i += 1
    return out


def step_words(step_dir):
    # In order: ((book, c, v), alternative (book, c, v) or None, code, base).
    for path in sorted(glob.glob(os.path.join(step_dir, "TAHOT-*.txt"))) + \
            sorted(glob.glob(os.path.join(step_dir, "TAGNT-*.txt"))):
        greek = os.path.basename(path).startswith("TAGNT")
        for line in open(path, encoding="utf-8-sig"):
            m = REF.match(line)
            if not m:
                continue
            book = STEP_BOOKS.get(m.group(1).lower())
            if not book:
                continue
            ref = (book, int(m.group(2)), int(m.group(3)))
            alt = (book, int(m.group(4)), int(m.group(5))) if m.group(4) else None
            f = line.rstrip("\n").split("\t")
            if len(f) < 5:
                continue
            col = f[3] if greek else f[4]
            for lang, num, suf in CODE.findall(col):
                n = int(num)
                if lang == "H" and n >= 9000:
                    continue
                code = lang + str(n) + suf
                yield ref, alt, code, lang + str(n), step_gloss(f, greek, code)


def load(data):
    lang = os.path.join(data, "lang")
    chap = chapters(os.path.join(data, "bsb.txt"))
    words = open(os.path.join(lang, "words.bin"), "rb").read()
    vb = open(os.path.join(lang, "verses.bin"), "rb").read()
    nw = len(words) // 12
    nv = len(vb) // 8 - 1
    base = []
    order = []
    for i in range(nw):
        s, _, _, o = struct.unpack_from("<HHBB", words, i * 12)
        n = s & 0x7fff
        base.append(("G" if s & 0x8000 else "H") + str(n) if n else "")
        order.append(o)
    vwords = {}  # (book, c, v) -> word indexes in original order
    for vi in range(nv):
        first, ci, v = struct.unpack_from("<IHH", vb, vi * 8)
        nxt = struct.unpack_from("<I", vb, vi * 8 + 8)[0]
        b, c = chap[ci]
        vwords[(b, c, v & 0x7fff)] = sorted(range(first, nxt), key=lambda i: order[i])
    lex, glosses = lexicon(os.path.join(lang, "lexicon.txt"))
    return lang, nw, base, vwords, lex, glosses


def check(lang, nw, base, vwords, lex, senses):
    # Coverage, Genesis 1:1's God, and the counts; False if one fails.
    known = sum(1 for k in senses if k)
    with_base = sum(1 for b in base if b)
    cov = known / with_base
    print("coverage: %.2f%% of the words with a Strong's have a sense (%d)" % (100 * cov, known))
    ok = True
    if cov < 0.95:
        print("FAIL: coverage under 95%")
        ok = False
    # Genesis 1:1's God.
    g = [i for i in vwords[("GEN", 1, 1)] if base[i] == "H430"]
    k = senses[g[0]] if g else 0
    code = lex["H430"][k - 1] if k else "?"
    gloss = ""
    if k:
        cur = None
        for line in open(os.path.join(lang, "lexicon.txt"), encoding="utf-8"):
            if line.startswith("@"):
                cur = line.strip()[1:]
                n = 0
            elif cur == "H430":
                n += 1
                if n == k:
                    gloss = line.split("\t")[4]
    print("Genesis 1:1 God: sense %d, %s, %r" % (k, code, gloss))
    if gloss != "God":
        print("FAIL: Genesis 1:1's God is not the sense glossed God")
        ok = False
    # Exodus 20:3's "other gods": H430J, the sense made for it (review r5-1).
    g = [i for i in vwords[("EXO", 20, 3)] if base[i] == "H430"]
    k = senses[g[0]] if g else 0
    code = lex["H430"][k - 1] if k else "?"
    print("Exodus 20:3 gods: sense %d, %s" % (k, code))
    if code != "H430J":
        print("FAIL: Exodus 20:3's gods is not H430J")
        ok = False
    # Each base's senses' counts sum to its count; no sense past its lines.
    per = collections.defaultdict(collections.Counter)
    for i in range(nw):
        if base[i]:
            per[base[i]][senses[i]] += 1
    conc = conc_counts(os.path.join(lang, "conc.bin"))
    bad = [b for b in per if sum(per[b].values()) != conc.get(b, -1)]
    past = [b for b in per if max(per[b]) > len(lex.get(b, []))]
    known_sum = sum(n for b in per for k, n in per[b].items() if k)
    print("bases %d: senses' counts sum to conc.bin's: %s; senses past the lexicon's lines: %s" %
          (len(per), "yes" if not bad else "no " + ", ".join(bad[:10]),
           ", ".join(past[:10]) or "none"))
    print("known senses' counts sum to %d (the known words: %d)" % (known_sum, known))
    if bad or past or known_sum != known:
        print("FAIL: the senses' counts")
        ok = False
    many = sum(1 for b in per if len([k for k in per[b] if k]) > 1)
    print("bases with more than one sense in use: %d" % many)
    return ok


def main():
    if sys.argv[1] == "--check":
        lang, nw, base, vwords, lex, _ = load(sys.argv[2])
        senses = open(os.path.join(lang, "senses.bin"), "rb").read()
        if len(senses) != nw:
            print("FAIL: senses.bin has %d bytes for %d words" % (len(senses), nw))
            sys.exit(1)
        sys.exit(0 if check(lang, nw, base, vwords, lex, senses) else 1)
    step_dir, data = sys.argv[1:3]
    lang, nw, base, vwords, lex, glosses = load(data)

    def sense(code, b, gloss):
        lines = lex.get(b)
        if not lines:
            return 0
        if len(lines) == 1:
            return 1
        suf = code[len(b):]
        for k, c in enumerate(lines):
            if (c == code) if suf else (c == "" or c == b):
                return k + 1
        if suf:
            for k, c in enumerate(lines):
                if c.upper() == code.upper():
                    return k + 1
        # No line has STEP's code (TAHOT's unlettered H3064, TAGNT's G3708):
        # the one line whose gloss is the word's own, or ends it ("those of
        # Judah", "of Judah"), before giving 0.
        if gloss:
            mine = [plain(g) for g in glosses[b]]
            for same in (lambda g: g == gloss, lambda g: g and (gloss.endswith(" " + g) or g.endswith(" " + gloss))):
                hits = [k for k, g in enumerate(mine) if same(g)]
                if len(hits) == 1:
                    stats["sense by its gloss"] += 1
                    return hits[0] + 1
        return 0

    senses = bytearray(nw)
    used = bytearray(nw)
    stats = collections.Counter()
    unmatched_codes = collections.Counter()
    left = []

    def place(ref, code, b, gloss):
        if ref[2] == 0:
            ref = (ref[0], ref[1], 1)
        for i in vwords.get(ref, ()):
            if not used[i] and base[i] == b:
                used[i] = 1
                k = sense(code, b, gloss)
                senses[i] = k
                if not k:
                    unmatched_codes[code] += 1
                return True
        return False

    for ref, alt, code, b, gloss in step_words(step_dir):
        stats["step words"] += 1
        if place(ref, code, b, gloss):
            stats["matched"] += 1
        else:
            left.append((alt, code, b, gloss))
    for alt, code, b, gloss in left:
        if alt and place(alt, code, b, gloss):
            stats["matched at the other numbering"] += 1
    # (A base of one line: known, though STEP's word wasn't found.)
    for i in range(nw):
        if not used[i] and len(lex.get(base[i], ())) == 1:
            senses[i] = 1
            stats["not found, of a base of one line"] += 1
    for k, n in sorted(stats.items()):
        print("%s: %d" % (k, n))
    print("words %d, with a Strong's %d, not given a STEP word %d" %
          (nw, sum(1 for b in base if b), sum(1 for i in range(nw) if base[i] and not used[i])))
    print("dStrongs not in the lexicon's codes: %d (most: %s)" % (
        sum(unmatched_codes.values()),
        ", ".join("%s %d" % kv for kv in unmatched_codes.most_common(8))))
    ok = check(lang, nw, base, vwords, lex, senses)
    open(os.path.join(lang, "senses.bin"), "wb").write(bytes(senses))
    print("senses.bin: %d bytes" % nw)
    sys.exit(0 if ok else 1)


main()
