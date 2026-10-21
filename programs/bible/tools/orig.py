#!/usr/bin/env python3
"""The Hebrew Bible and the Greek New Testament as a version of the reader,
"Hebrew and Greek" (DESIGN.md §14.11.1).

    python3 -I orig.py STEP_DIR DATA

STEP_DIR has STEP Bible's amalgamated texts as fetch.sh names them
(TAHOT-*.txt, TAGNT-*.txt; CC BY 4.0, www.STEPBible.org); DATA is the app's
data/ (bsb.txt, lang/words.bin, verses.bin, forms.txt, morph.txt, as
bsb_lang.py made them). Standard library only. It writes:

  orig.txt             the 66 books in bsb.txt's record format, the Hebrew
                       Bible then the Greek New Testament: B, C, P (a
                       paragraph: the BSB's at a verse's start, the Hebrew's
                       petuha and setuma, and in the poetic books every
                       verse), _, V (the BSB's numbers), D (a psalm's title,
                       its words), N<c>:<v> (the Hebrew's own number of the
                       verse after it, where it differs), and the words:
                       H<text> Hebrew, X<text> Aramaic (laid out right to
                       left), T<text> Greek. A verse's words are one record,
                       a space between words, a maqaf joining two without
                       one; the Hebrew is pointed, its cantillation and paseq
                       taken out, sof pasuq kept, the Qere read.
  lang/orig-words.bin  12 bytes a word, in reading order (a title's before
                       its verse 1's): u16 strongs (bit 15 Greek), u16 morph
                       (a line of morph.txt), u8 sense (as senses.bin), u8
                       flags (1 a name, 2 Aramaic, 4 Qere, 8 joined by maqaf
                       to the next), u16 its length in the text's bytes
                       (with its punctuation and a maqaf after it: a word
                       may hold a space, a maqaf, or two lemmas, as STEP
                       has it), u32 the same word's index in
                       words.bin (0xFFFFFFFF: the BSB's tables have none, as
                       for a variant). morph.txt gains the lines it needs.
  lang/orig-ketiv.txt  REF\tWORD\tKETIV: a Qere word (its index in
                       orig-words.bin) and its Ketiv, pointed as STEP points
                       it.
  lang/orig-accents.txt  each Hebrew word with its cantillation, a line a
                       word, in the order of the Hebrew words of
                       orig-words.bin.

The Greek is TAGNT's words in NA28 (the edition the BSB follows), with
their punctuation; the Hebrew TAHOT's, the Leningrad Codex's, but its
words restored from the LXX (X) left out. Each verse's words are put in the
BSB's verse that its words are in, by the BSB's tables (words.bin): a run
of words STEP numbers alike goes to whichever of STEP's two numberings
(or the verse before, for a sentence the BSB joins to it) holds most of
them. Words are joined to words.bin's as senses.py joins them, by base
Strong's number in original order.

It prints the counts, the verses whose Hebrew number differs, the morph
lines added, and its checks; it exits 1 if one fails: a BSB verse without
words, a verse's NA28 words not in TAGNT's text line in order, or a word
of the tests (John 3:16's 25 words and its third, ἠγάπησεν, G25
V-AIA-3S; Genesis 1:1's first word בְּרֵאשִׁית, Prep-b; Psalm 23:1's title;
Malachi 4:1, Hebrew 3:19; Daniel 2:4's Aramaic) not as it should be.
--check DATA checks the files so, without STEP's:

    python3 -I orig.py --check DATA
"""
import collections
import glob
import os
import re
import struct
import sys
import unicodedata

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
REF = re.compile(r"([0-9A-Za-z]+)\.(\d+)\.(\d+)(?:[(\[{](\d+)\.(\d+)[)\]}])?#(\d+)=(\S+)")
CODE = re.compile(r"([HG])(\d{4})([A-Za-z]*)")
# The poetic books, set a verse a line (Job from 3:1 to 42:6).
POETRY = {"PSA", "PRO", "SNG", "LAM"}
NAME_POS = ("N:", "N-")


# ---- the BSB, and its tables' words ----
def read_bsb(path):
    """Books (code, name), and the verses in order: (book, c, v, chapter
    index, paragraph kind at its start or None, a stanza break before it)."""
    books = []
    verses = []
    titled = set()
    ci = -1
    book = None
    pend_p = None
    pend_gap = False
    ch = 0
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        k = line[:1]
        if k == "B":
            book = line[1:4]
            books.append((book, line[5:]))
        elif k == "C":
            ch = int(line[1:])
            ci += 1
            pend_p = None
            pend_gap = False
        elif k == "P":
            pend_p = line[1:2] or "m"
        elif k == "_":
            pend_gap = True
        elif k == "D":
            titled.add(ci)
        elif k == "V":
            v = int(line[1:].split(">")[0])
            verses.append((book, ch, v, ci, pend_p, pend_gap))
            pend_p = None
            pend_gap = False
        elif k in "TWIJ":
            # (Words before a verse's number end any paragraph pending: a
            # break in the middle of a verse is dropped.)
            pend_p = None
            pend_gap = False
    return books, verses, titled


def read_words(data):
    lang = os.path.join(data, "lang")
    words = open(os.path.join(lang, "words.bin"), "rb").read()
    vb = open(os.path.join(lang, "verses.bin"), "rb").read()
    nw = len(words) // 12
    nv = len(vb) // 8 - 1
    wl = []
    for i in range(nw):
        s, m, _, o, _, _, f = struct.unpack_from("<HHBBBBI", words, i * 12)
        wl.append((s, m, o, f))
    return wl, vb, nv


def lines_of(path):
    return open(path, encoding="utf-8").read().split("\n")[:-1]


# ---- STEP's words ----
def hebrew_plain(s):
    # Cantillation (U+0591-U+05AF) and paseq out; the rest kept.
    return re.sub("[֑-֯׀]", "", s)


class Word:
    __slots__ = ("ref", "alt", "kind", "lang", "text", "accents", "after", "num", "codes", "morph",
                 "qere", "ketiv", "aramaic", "maqaf", "para", "title", "pos", "translit")


def step_words(step_dir, stats):
    """Every word of the text, in STEP's order, Hebrew then Greek."""
    for path in sorted(glob.glob(os.path.join(step_dir, "TAHOT-*.txt")), key=tahot_order) + \
            sorted(glob.glob(os.path.join(step_dir, "TAGNT-*.txt")), key=tagnt_order):
        greek = os.path.basename(path).startswith("TAGNT")
        for line in open(path, encoding="utf-8-sig"):
            m = REF.match(line)
            if not m:
                continue
            book = STEP_BOOKS.get(m.group(1).lower())
            if not book:
                continue
            f = line.rstrip("\n").split("\t")
            w = Word()
            w.ref = (book, int(m.group(2)), int(m.group(3)))
            w.alt = (book, int(m.group(4)), int(m.group(5))) if m.group(4) else None
            kind = m.group(7)
            w.kind = kind[:1]
            if greek:
                if "NA28" not in f[5].split("+"):
                    stats["Greek words not in NA28, left out"] += 1
                    continue
                g = f[1].split(" (")[0]
                tr = f[1].split(" (")[1].rstrip(")") if " (" in f[1] else ""
                g = unicodedata.normalize("NFC", g.replace("¶", "").replace("[", "").replace("]", "")
                                          .replace("¬", "").replace(" ", ""))
                # (Its punctuation: what follows its last letter.)
                j = len(g)
                while j > 0 and not g[j - 1].isalpha():
                    j -= 1
                w.lang = "G"
                w.text = g[:j]
                w.after = g[j:]
                w.accents = ""
                first = f[3].split(" + ")[0]
                code = first.split("=")[0]
                w.morph = first.split("=", 1)[1] if "=" in first else ""
                cm = CODE.match(code)
                w.num = int(cm.group(2)) if cm else 0
                w.codes = code
                w.qere = False
                w.ketiv = ""
                w.aramaic = False
                w.maqaf = False
                w.para = ""
                w.translit = tr
                lemma = f[4]
                w.pos = ""
            else:
                if kind.startswith("X"):
                    stats["Hebrew words from the LXX (X), left out"] += 1
                    continue
                heb = f[1]
                segs = heb.split("\\")
                word = segs[0]
                after = ""
                para = ""
                maqaf = False
                for s in segs[1:]:
                    if s == "־":
                        maqaf = True
                    elif s == "׃":
                        after += "׃"
                    elif s in ("פ", "ס"):
                        para = s
                    elif s in (" ", "׀", "׆"):
                        pass
                    elif any("א" <= ch <= "ת" for ch in s):
                        # (A word STEP split at a mark: Gen 14:17's.)
                        word += s.replace("׀", "").replace(" ", "")
                        stats["Hebrew words with letters after a mark"] += 1
                word = word.replace("/", "")
                word = unicodedata.normalize("NFC", word)
                if not any("\u05d0" <= ch <= "\u05ea" for ch in word):
                    # (Written, not read: a Ketiv with no Qere.)
                    stats["Hebrew words written but not read, left out"] += 1
                    continue
                w.lang = "H"
                w.accents = word
                w.text = unicodedata.normalize("NFC", hebrew_plain(word))
                w.after = after
                w.maqaf = maqaf
                w.para = para
                w.codes = f[4]
                main = re.search(r"\{([HG]\d{4}[A-Za-z]*)\}", f[4])
                cm = CODE.match(main.group(1)) if main else None
                w.num = int(cm.group(2)) if cm else 0
                if w.num >= 9000:
                    w.num = 0
                w.morph = f[5]
                w.aramaic = f[5].startswith("A")
                w.qere = kind.startswith("Q")
                w.ketiv = ""
                if w.qere:
                    km = re.search(r"K= [^(]*\(([^)]*)\)", f[6]) if len(f) > 6 else None
                    if not km and len(f) > 7:
                        km = re.search(r"K= ([^ ;¦]+)", f[7])
                    if km:
                        w.ketiv = unicodedata.normalize("NFC", hebrew_plain(km.group(1).replace("/", "")
                                                                            .split("\\")[0]))
                    else:
                        stats["Qere words without a Ketiv found"] += 1
                w.translit = f[2] if len(f) > 2 else ""
                w.pos = ""
            yield w


def tahot_order(p):
    return ["Gen-Deu", "Jos-Est", "Job-Sng", "Isa-Mal"].index(os.path.basename(p)[6:-4])


def tagnt_order(p):
    return ["Mat-Jhn", "Act-Rev"].index(os.path.basename(p)[6:-4])


def greek_lines(step_dir):
    """Each TAGNT verse's text line: ref -> its words (plain, NFC)."""
    out = {}
    for path in glob.glob(os.path.join(step_dir, "TAGNT-*.txt")):
        for line in open(path, encoding="utf-8-sig"):
            if not line.startswith("# ") and not line.startswith("#_") or line.startswith("#_") and \
                    not re.match(r"#_[0-9A-Za-z]+\.\d", line):
                continue
            f = line.rstrip("\n").split("\t")
            m = re.match(r"#[ _]([0-9A-Za-z]+)\.(\d+)\.(\d+)", f[0])
            if not m or m.group(1).lower() not in STEP_BOOKS:
                continue
            ref = (STEP_BOOKS[m.group(1).lower()], int(m.group(2)), int(m.group(3)))
            out.setdefault(ref, []).extend(plain_greek(x) for x in f[1:] if x.strip())
    return out


def plain_greek(s):
    s = unicodedata.normalize("NFC", s.strip())
    return "".join(ch for ch in s if ch.isalpha())


# ---- morphology: STEP's codes as the tables' (morph.txt) ----
def morph_map(pairs):
    """STEP's code -> the tables' commonest code for it."""
    by = collections.defaultdict(collections.Counter)
    for step, ours in pairs:
        by[step][ours] += 1
    return {s: c.most_common(1)[0][0] for s, c in by.items()}


HEB_STEM = {"q": "Qal", "N": "Nifal", "p": "Piel", "P": "Pual", "h": "Hifil", "H": "Hofal",
            "t": "Hitpael", "o": "Polel", "O": "Polal", "r": "Hitpolel", "m": "Poel",
            "M": "Poal", "k": "Palel", "K": "Pulal", "Q": "Qal Passive", "l": "Pilpel",
            "L": "Polpal", "f": "Hitpalpel", "D": "Nitpael", "j": "Pealal", "i": "Pilel",
            "u": "Hotpaal", "c": "Tiphil", "v": "Hishtafel", "w": "Nitpael", "y": "Hitpoel"}
HEB_FORM = {"p": "Perf", "q": "ConjPerf", "i": "Imperf", "w": "ConsecImperf", "h": "Cohort",
            "j": "Imperf.Jus", "v": "Imp", "r": "Prtcpl", "s": "Prtcpl", "a": "InfAbs",
            "c": "Inf"}
GRK_TENSE = {"P": "P", "I": "I", "F": "F", "A": "A", "R": "R", "L": "L", "2A": "A", "2F": "F",
             "2R": "R", "2L": "L", "2P": "P", "2I": "I"}


def convert_morph(code, greek):
    """A code the tables never pair with STEP's: the nearest by rule."""
    if greek:
        m = re.match(r"V-(2?[A-Z])([A-Z])([A-Z])(?:-(.*))?$", code)
        if m:
            t, v, mood, rest = m.groups()
            out = "V-" + GRK_TENSE.get(t, t[-1]) + mood + v
            return out + ("-" + rest if rest else "")
        return code
    out = []
    for p in code[1:].replace("//", "/").split("/"):
        if not p:
            continue
        if p.startswith("V") and len(p) >= 3:
            s = "V-" + HEB_STEM.get(p[1], p[1]) + "-" + HEB_FORM.get(p[2], p[2])
            if len(p) > 3:
                s += "-" + p[3:]
            out.append(s)
        elif p in ("C", "c"):
            out.append("Conj-w")
        elif p == "R":
            out.append("Prep")
        elif p in ("Td", "Ta"):
            out.append("Art")
        elif p.startswith("S") and len(p) >= 5:
            out.append(p[2:])
        elif p[:2] in ("Nc", "Ng", "Np", "Aa"):
            pgn = p[2:]
            if pgn.endswith("a"):
                pgn = pgn[:-1]
            out.append(("Adj-" if p[0] == "A" else "N-") + pgn)
        else:
            out.append(p)
    return " | ".join(out)


# ---- the whole ----
def build(step_dir, data):
    stats = collections.Counter()
    books, verses, titled = read_bsb(os.path.join(data, "bsb.txt"))
    have = {(b, c, v) for b, c, v, _, _, _ in verses}
    vindex = {(b, c, v): i for i, (b, c, v, _, _, _) in enumerate(verses)}
    wl, vb, nv = read_words(data)
    lang = os.path.join(data, "lang")
    morphs = lines_of(os.path.join(lang, "morph.txt"))
    morph_code = [m.split("\t")[0] for m in morphs]
    forms = lines_of(os.path.join(lang, "forms.txt"))
    names = name_numbers(os.path.join(lang, "lexicon.txt"))
    # words.bin's words of each verse (vb is in verses' order), original
    # order.
    vwords = {}
    for vi in range(nv):
        first, ci, vn = struct.unpack_from("<IHH", vb, vi * 8)
        nxt = struct.unpack_from("<I", vb, vi * 8 + 8)[0]
        b, c, v = verses[vi][:3]
        vwords[(b, c, v)] = sorted(range(first, nxt), key=lambda i: wl[i][2])
    words = list(step_words(step_dir, stats))
    # Runs of words numbered alike: each to the BSB verse that holds most of
    # its words.
    runs = []
    for w in words:
        key = (w.ref, w.alt, w.kind == "R")
        if runs and runs[-1][0] == key:
            runs[-1][1].append(w)
        else:
            runs.append((key, [w]))
    used = set()
    placed = collections.defaultdict(list)  # BSB verse -> its words, in order
    title_words = collections.defaultdict(list)  # (book, c) -> a psalm title's words
    for (ref, alt, _), ws in runs:
        if ref[2] == 0:
            # A psalm's title (STEP's verse 0): the BSB's D record.
            title_words[(ref[0], ref[1])].extend(ws)
            continue
        near = [(ref[0], ref[1], ref[2] - 1), (ref[0], ref[1], ref[2] + 1)] if ref not in have else []
        # (A verse the tables have no words for keeps STEP's: Nehemiah 7:68,
        # restored from Ezra 2:66.)
        cands = [ref] if ref in have and not vwords.get(ref) else \
            [r for r in [ref, alt] + near if r and r in have]
        if not cands:
            stats["runs of words with no BSB verse"] += 1
            print("no BSB verse for", ref, alt, len(ws))
            continue
        best = cands[0]
        best_n = -1
        for r in cands:
            pool = collections.Counter(wl[i][0] for i in vwords.get(r, ()))
            n = 0
            for w in ws:
                k = w.num | (0x8000 if w.lang == "G" else 0)
                if pool[k] > 0:
                    pool[k] -= 1
                    n += 1
            if n > best_n:
                best, best_n = r, n
        if best != ref:
            stats["runs put in the BSB's other numbering"] += 1
            if best not in (alt,):
                print("words of %s %d:%d put in %d:%d" % (ref[0], ref[1], ref[2], best[1], best[2]))
        placed[best].extend(ws)
    # A title's words are in its verse 1 in words.bin.
    # Join each word to words.bin's (by base number, the first unused).
    join = {}
    pairs = []

    def join_in(ref, ws):
        # By base number, the first unused; then those left by their form
        # (STEP numbers some forms by their lemma: ἡμῶν G3165, the tables
        # G2257), in order.
        pool = vwords.get(ref, [])
        left = []
        for w in ws:
            j = None
            for i in pool:
                if i not in used and (wl[i][0] & 0x7FFF) == w.num and \
                        bool(wl[i][0] & 0x8000) == (w.lang == "G"):
                    j = i
                    break
            if j is None:
                left.append(w)
            else:
                used.add(j)
                join[id(w)] = j
                pairs.append((w.morph, morph_code[wl[j][1]]))
        for w in left:
            for i in pool:
                if i not in used and bare(form_text(forms, wl[i][3])) == bare(w.text):
                    used.add(i)
                    join[id(w)] = i
                    pairs.append((w.morph, morph_code[wl[i][1]]))
                    stats["words joined by their form"] += 1
                    break
    for (b, c), ws in title_words.items():
        join_in((b, c, 1), ws)
    for ref in sorted(placed, key=lambda r: vindex[r]):
        join_in(ref, placed[ref])
    # Each verse's NA28 words are in its text line, in order.
    lines = greek_lines(step_dir)
    bad = []
    by_ref = collections.defaultdict(list)
    for w in words:
        if w.lang == "G":
            by_ref[w.ref].append(plain_greek(w.text))
    for ref, ws in by_ref.items():
        line = lines.get(ref, [])
        i = 0
        for x in line:
            if i < len(ws) and x == ws[i]:
                i += 1
        if i < len(ws):
            bad.append("%s %d:%d (%s)" % (ref + (ws[i],)))
    print("Greek verses whose NA28 words are not in their text line: %d %s" % (len(bad), "; ".join(bad[:20])))
    stats["Greek verses checked against their text line"] = len(by_ref)
    r_bad = bad
    stats["words"] = len(words)
    stats["words joined to the BSB's tables"] = len(join)
    mmap = morph_map(pairs)
    added = []
    code_line = {c: i for i, c in enumerate(morph_code)}
    descs = dict(m.split("\t", 1) for m in morphs)

    def morph_index(w):
        j = join.get(id(w))
        if j is not None:
            return wl[j][1]
        ours = mmap.get(w.morph) or convert_morph(w.morph, w.lang == "G")
        if w.morph not in mmap and w.lang == "H" and "//" in w.morph:
            # (Two words STEP writes as one: each as the tables have it.)
            ours = " | ".join(mmap.get("H" + x.lstrip("H"), convert_morph("H" + x.lstrip("H"), False))
                              for x in w.morph.split("//"))
        if w.morph not in mmap:
            stats["unjoined words of a code never joined"] += 1
            print("morph %s -> %s" % (w.morph, ours))
        if ours not in code_line:
            code_line[ours] = len(morph_code)
            morph_code.append(ours)
            added.append(ours)
        return code_line[ours]
    # The Hebrew numbers that differ, by BSB verse.
    heb_num = {}
    for ref, ws in placed.items():
        alts = [w.alt for w in ws if w.alt]
        if ref[0] in BOOKS_OT and alts:
            a = alts[0]
            if (a[1], a[2]) != (ref[1], ref[2]):
                heb_num[ref] = (a[1], a[2])
    for (b, c), ws in title_words.items():
        pass
    return dict(stats=stats, books=books, verses=verses, titled=titled, placed=placed,
                title_words=title_words, join=join, morph_index=morph_index, added=added,
                morph_code=morph_code, descs=descs, heb_num=heb_num, wl=wl, forms=forms,
                names=names, have=have, bad_lines=r_bad)


BOOKS_OT = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA "
            "PRO ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC "
            "MAL").split()


def form_text(forms, f):
    return forms[f].split("\t")[0] if f < len(forms) else ""


def bare(s):
    """A word without its accents, breathings and points, final forms and
    case, to compare."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if ch.isalpha() and not unicodedata.combining(ch))
    return s.lower().replace("ς", "σ").translate(FINALS)


FINALS = str.maketrans("ךםןףץ", "כמנפצ")


def name_numbers(path):
    """The Strong's numbers whose main entry is a name (N: part of speech)."""
    out = set()
    cur = None
    first = False
    for line in open(path, encoding="utf-8"):
        if line.startswith("@"):
            cur = line.strip()[1:]
            first = True
        elif cur and first:
            f = line.rstrip("\n").split("\t")
            if len(f) > 3 and f[3].startswith("N:"):
                out.add(cur)
            first = False
    return out


def senses_of(data):
    return open(os.path.join(data, "lang", "senses.bin"), "rb").read()


def write(step_dir, data):
    r = build(step_dir, data)
    stats = r["stats"]
    verses, placed, title_words, join = r["verses"], r["placed"], r["title_words"], r["join"]
    sens = senses_of(data)
    names = r["names"]
    out = []
    recs = bytearray()
    ketiv = []
    accents = []
    missing = []
    nword = 0
    cur_book = None
    cur_c = None
    para_next = False  # a petuha or setuma ended the verse before
    for b, c, v, ci, pk, gap in verses:
        if b != cur_book:
            cur_book = b
            out.append("B%s %s" % (b, dict(r["books"])[b]))
            cur_c = None
        if c != cur_c:
            cur_c = c
            out.append("C%d" % c)
            para_next = True
            ws = title_words.get((b, c))
            if ws and v == 1:
                if ws[0].alt:
                    out.append("N%d:%d" % ws[0].alt[1:])
                text, n = words_record(ws, out, recs, ketiv, accents, nword, r, sens, names, b, c, 0)
                out.append("D" + joined(text))
                nword = n
                stats["psalm titles"] += 1
        ws = placed.get((b, c, v), [])
        if not ws:
            missing.append((b, c, v))
        ot = b in BOOKS_OT
        poetry = b in POETRY or b == "JOB" and (3, 1) <= (c, v) <= (42, 6)
        kind = pk
        if ot and (para_next or poetry) and not kind:
            kind = "m"
        if poetry:
            kind = "1"
        if kind and kind in "12" and not poetry and not ot:
            pass
        if gap and kind:
            out.append("_")
        if kind:
            # (Indents of poetry kept; a list's or a centred line's as a
            # paragraph.)
            out.append("P" + (kind if kind in "12" else "m"))
        hn = r["heb_num"].get((b, c, v))
        if hn:
            out.append("N%d:%d" % hn)
        out.append("V%d" % v)
        if ws:
            text, n = words_record(ws, out, recs, ketiv, accents, nword, r, sens, names, b, c, v)
            nword = n
            # (A record a run of one language: Hebrew, Aramaic, Greek; a run
            # after another begins with the space between them.)
            at = 0
            for k in range(1, len(ws) + 1):
                if k == len(ws) or ws[k].aramaic != ws[at].aramaic:
                    run = joined(text[at:k])
                    if at > 0 and not text[at - 1].endswith("־"):
                        run = " " + run
                    out.append(("X" if ws[at].aramaic else "H" if ot else "T") + run)
                    at = k
            para_next = any(w.para for w in ws[-1:])
        else:
            para_next = False
    lang = os.path.join(data, "lang")
    open(os.path.join(data, "orig.txt"), "w", encoding="utf-8").write("\n".join(out) + "\n")
    open(os.path.join(lang, "orig-words.bin"), "wb").write(bytes(recs))
    open(os.path.join(lang, "orig-ketiv.txt"), "w", encoding="utf-8").write(
        "".join("%d\t%s\t%s\n" % k for k in ketiv))
    open(os.path.join(lang, "orig-accents.txt"), "w", encoding="utf-8").write(
        "".join(a + "\n" for a in accents))
    if r["added"]:
        with open(os.path.join(lang, "morph.txt"), "a", encoding="utf-8") as f:
            for code in r["added"]:
                f.write("%s\t%s\n" % (code, describe(code, r["descs"])))
    for k, n in sorted(stats.items()):
        print("%s: %d" % (k, n))
    print("words written: %d (%d bytes)" % (nword, len(recs)))
    print("morph lines added: %d %s" % (len(r["added"]), " ".join(r["added"][:30])))
    print("verses whose Hebrew number differs: %d" % len(r["heb_num"]))
    for ref in sorted(r["heb_num"], key=lambda x: r_index(verses, x))[:400]:
        hn = r["heb_num"][ref]
        print("  %s %d:%d = Hebrew %d:%d" % (ref[0], ref[1], ref[2], hn[0], hn[1]))
    ok = True
    if r["bad_lines"]:
        print("FAIL: Greek verses whose NA28 words are not in their text line")
        ok = False
    if missing:
        print("FAIL: BSB verses without words: %d %s" % (len(missing), missing[:20]))
        ok = False
    return ok


def r_index(verses, ref):
    for i, x in enumerate(verses):
        if x[:3] == ref:
            return i
    return 0


def describe(code, descs):
    """A description for a code added, in morph.txt's words, from the
    descriptions of its parts where morph.txt has them."""
    parts = code.split(" | ")
    out = []
    for p in parts:
        d = descs.get(p)
        if d is None:
            for c, dd in descs.items():
                if c.endswith(" | " + p):
                    d = dd.split(" | ")[-1]
                    break
        out.append(d or p)
    return " | ".join(out)


def words_record(ws, out, recs, ketiv, accents, nword, r, sens, names, b, c, v):
    """A verse's words as its text, and their records."""
    text = []
    for k, w in enumerate(ws):
        j = r["join"].get(id(w))
        # (Joined, the tables' number: the lexicon's and the cards'.)
        num = r["wl"][j][0] & 0x7FFF if j is not None else w.num
        flags = 0
        key = ("G" if w.lang == "G" else "H") + str(num)
        if num and key in names:
            flags |= 1
        if w.aramaic:
            flags |= 2
        if w.qere:
            flags |= 4
        if w.maqaf and k + 1 < len(ws):
            flags |= 8
        sense = sens[j] if j is not None else 0
        word = w.text + w.after + ("־" if flags & 8 else "")
        recs += struct.pack("<HHBBHI", num | (0x8000 if w.lang == "G" else 0), r["morph_index"](w),
                            sense, flags, len(word.encode()), j if j is not None else 0xFFFFFFFF)
        if w.qere and w.ketiv:
            ketiv.append((nword, w.text, w.ketiv))
        if w.lang == "H":
            accents.append(w.accents + w.after)
        text.append(word)
        nword += 1
    return text, nword


def joined(words):
    """Words as a record's text: a space between two, none after a maqaf."""
    return "".join(x + ("" if x.endswith("־") or k + 1 == len(words) else " ") for k, x in enumerate(words))


def main():
    if sys.argv[1] == "--check":
        sys.exit(0 if check(sys.argv[2]) else 1)
    ok = write(sys.argv[1], sys.argv[2])
    ok = check(sys.argv[2]) and ok
    sys.exit(0 if ok else 1)


def read_orig(data, recs):
    """orig.txt's verses in order: (book, c, v, words, hebrew number, kinds
    of their records), a title's words as verse 0 of its chapter; each
    record's words cut by their lengths in orig-words.bin. None if a record
    is not its words (the lengths don't fall at spaces and its end)."""
    out = []
    book = None
    c = 0
    hn = None
    k = 0
    nrec = len(recs) // 12
    for line in open(os.path.join(data, "orig.txt"), encoding="utf-8"):
        line = line.rstrip("\n")
        t = line[:1]
        if t == "B":
            book = line[1:4]
        elif t == "C":
            c = int(line[1:])
        elif t == "N":
            hn = line[1:]
        elif t == "V":
            out.append([book, c, int(line[1:]), [], hn, ""])
            hn = None
        elif t in "DHXT":
            if t == "D":
                out.append([book, c, 0, [], hn, ""])
                hn = None
            b = line[1:].encode()
            i = 0
            while i < len(b):
                if b[i] == 32:
                    i += 1
                    continue
                if k >= nrec:
                    return None
                n = struct.unpack_from("<H", recs, k * 12 + 6)[0]
                w = b[i:i + n]
                i += n
                if n == 0 or i < len(b) and b[i] != 32 and not w.decode().endswith("־"):
                    print("a word's length is not its text's: %s %d:%d %r" % (book, c, out[-1][2], w))
                    return None
                out[-1][3].append(w.decode())
                k += 1
            out[-1][5] += t
    if k != nrec:
        print("orig.txt has %d words, orig-words.bin %d" % (k, nrec))
        return None
    return out


def check(data):
    lang = os.path.join(data, "lang")
    ok = True

    def fail(msg):
        nonlocal ok
        print("FAIL: " + msg)
        ok = False
    recs = open(os.path.join(lang, "orig-words.bin"), "rb").read()
    nrec = len(recs) // 12
    verses = read_orig(data, recs)
    if verses is None:
        fail("orig.txt's words and orig-words.bin's lengths")
        return False
    morphs = lines_of(os.path.join(lang, "morph.txt"))
    codes = [m.split("\t")[0] for m in morphs]
    if len(set(codes)) != len(codes):
        fail("morph.txt has a code twice")
    books, bsb, _ = read_bsb(os.path.join(data, "bsb.txt"))
    keyed = [(b, c, v) for b, c, v, _, _, _ in bsb]
    mine = [(b, c, v) for b, c, v, _, _, _ in verses if v]
    if mine != keyed:
        fail("orig.txt's verses are not the BSB's (%d of %d)" % (len(mine), len(keyed)))
    nwords = sum(len(x[3]) for x in verses)
    print("orig.txt: %d verses, %d words; orig-words.bin: %d" % (len(mine), nwords, nrec))
    if nwords != nrec:
        fail("the text's words and orig-words.bin's differ")
    empty = [x[:3] for x in verses if not x[3]]
    if empty:
        fail("verses without words: %s" % empty[:10])
    # Each word's record, by verse.
    at = {}
    k = 0
    for x in verses:
        at[tuple(x[:3])] = (k, x)
        k += len(x[3])

    def rec(i):
        s, m, sense, flags, _, j = struct.unpack_from("<HHBBHI", recs, i * 12)
        return s, codes[m] if m < len(codes) else "?", sense, flags, j
    for i in range(nrec):
        s, m, _, _, j = rec(i)
        if m == "?":
            fail("word %d's parsing is past morph.txt" % i)
            break
    k, x = at[("JHN", 3, 16)]
    s, m, _, _, _ = rec(k + 2)
    print("John 3:16: %d words; its 3rd %s G%d %s" % (len(x[3]), x[3][2], s & 0x7FFF, m))
    if len(x[3]) != 25 or x[3][2] != "ἠγάπησεν" or s != 0x8000 | 25 or m != "V-AIA-3S":
        fail("John 3:16")
    k, x = at[("GEN", 1, 1)]
    s, m, _, _, _ = rec(k)
    print("Genesis 1:1's 1st: %s H%d %s" % (x[3][0], s, m))
    if x[3][0] != "בְּרֵאשִׁית" or not m.startswith("Prep-b"):
        fail("Genesis 1:1")
    k, x = at[("PSA", 23, 0)]
    print("Psalm 23's title: %s (%s), Hebrew %s" % (" ".join(x[3]), x[5], x[4]))
    if x[5] != "D" or len(x[3]) != 2 or x[4] != "23:1":
        fail("Psalm 23's title")
    k, x = at[("MAL", 4, 1)]
    print("Malachi 4:1: Hebrew %s" % x[4])
    if x[4] != "3:19":
        fail("Malachi 4:1's Hebrew number")
    k, x = at[("DAN", 2, 4)]
    aram = [w for i, w in enumerate(x[3]) if rec(k + i)[3] & 2]
    print("Daniel 2:4: %d words, %d Aramaic (%s), records %s" % (len(x[3]), len(aram), aram[0] if aram else "", x[5]))
    if not aram or len(aram) == len(x[3]) or x[5] != "HX":
        fail("Daniel 2:4's Aramaic")
    qere = sum(1 for i in range(nrec) if rec(i)[3] & 4)
    ket = len(lines_of(os.path.join(lang, "orig-ketiv.txt")))
    acc = len(lines_of(os.path.join(lang, "orig-accents.txt")))
    heb = sum(1 for i in range(nrec) if not rec(i)[0] & 0x8000)
    joined = sum(1 for i in range(nrec) if rec(i)[4] != 0xFFFFFFFF)
    print("Qere words %d, with a Ketiv %d; Hebrew words %d, accented lines %d; joined to words.bin %d (%.2f%%)" %
          (qere, ket, heb, acc, joined, 100.0 * joined / nrec))
    if acc != heb:
        fail("orig-accents.txt has a line for each Hebrew word")
    if joined < 0.99 * nrec:
        fail("under 99% of the words joined")
    return ok


main()
