#!/usr/bin/env python3
"""The original-language data for Smooth Bible's study screens.

    python3 -I bsb_lang.py TABLES TBESH TBESG BSB_TXT OUT_DIR

TABLES is the Berean Bible Translation Tables (bsb_tables.tsv, public
domain); TBESH and TBESG are STEP Bible's brief Hebrew and Greek lexicons
(CC BY 4.0, www.STEPBible.org); BSB_TXT is the app's text (data/bsb.txt, made
by usfm.py from the same revision of the BSB as the tables). See fetch.sh for
where each comes from and its sha256. Standard library only.

OUT_DIR gets (all little-endian; see DESIGN.md §7.1):

  words.bin     12 bytes per original word, in the BSB's English order:
                u16 strongs (bit 15: Greek), u16 morph (line of morph.txt),
                u8 ntok (English tokens of the verse this word's chunk
                covers), u8 order (its place in the original order, from 0),
                u8 flags (1 untranslated "-", 2 rendered with a neighbour
                "vvv", 4 no English, 8 that neighbour is the one before),
                u8 token (where its chunk begins among the verse's tokens),
                u32 form (line of forms.txt)
  verses.bin    8 bytes per verse of bsb.txt, in order: u32 first word,
                u16 chapter index (0 = Genesis 1), u16 verse (bit 15: not
                aligned, so not to be studied); then a sentinel, the words'
                count and zeros
  supplied.bin  8 bytes per run of English the translators supplied ([x] in
                the tables): u32 verse index, u8 first token, u8 tokens,
                u16 flags (1: not part of any original word's chunk)
  forms.txt     original \\t transliteration, a line per distinct form
                (Hebrew without cantillation, paseq, sof pasuq or the
                paragraph mark after it)
  morph.txt     code \\t description, a line per parsing
  conc.bin      per Strong's key (G keys then H, by number): the key, \\0,
                LEB128 words, LEB128 deltas of (verse index + 1), \\0
  lexicon.txt   per base Strong's key used: @KEY, then a line per STEP entry
                (the main one first): lemma \\t transliteration \\t part of
                speech \\t gloss \\t definition (**bold**, _italic_,
                [[MAT.5.43|Mat 5:43]], and \\n between paragraphs)

The verses' tokens (the English words, as the regex TOKEN finds them) are
compared with the tables' chunks: a verse is aligned when they are the same.
A psalm's title (bsb.txt's D lines) counts as the start of its verse 1.
It prints its counts and the verses not aligned.
"""
import collections
import csv
import html
import os
import re
import struct
import unicodedata
import sys

TOKEN = re.compile(r"[A-Za-z0-9]+(?:[’'][A-Za-z]+)*")
csv.field_size_limit(10 ** 9)


def tokens(s):
    return [(m.start(), m.group().lower().replace("'", "’")) for m in TOKEN.finditer(s)]


# ---- the app's text: its verses, and their tokens ----
def read_bsb(path):
    verses = []  # (book code, chapter number, verse, chapter index, text)
    titles = {}  # chapter index -> a psalm's title
    book = None
    ci = -1
    cn = 0
    v = 0
    broke = False
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        k, t = line[:1], line[1:]
        # (Words on a new line, as poetry's, after a space: as text.l8's
        # verse_text joins them.)
        if k in "TW" and v and broke and verses[-1][4] and verses[-1][4][-1] != " " and t[:1] != " ":
            t = " " + t
        broke = k not in "TWF" and not (k == "V")
        if k == "V":
            broke = False
        if k == "B":
            book = t[:3]
        elif k == "C":
            ci += 1
            cn = int(t)
            v = 0
        elif k == "V":
            v = int(t)
            verses.append([book, cn, v, ci, ""])
        elif k in "Dd" and v == 0:
            titles[ci] = titles.get(ci, "") + t
        elif k in "TW" and v:
            verses[-1][4] += t
    return verses, titles


# ---- Hebrew for display ----
def hebrew_clean(s):
    s = s.strip()
    s = re.sub("׃\\s*[פס]$", "׃", s)
    s = re.sub("[֑-֯׀׃]", "", s)
    return s.strip()


def strip_html(s):
    return re.sub(r"<[^>]*>", "", s)


# ---- parsings: the word's own part, for its part of speech ----
def pos_class(code):
    parts = [p.strip() for p in code.split("|")]
    for p in parts:
        if p.startswith("V-") or p == "V":
            return "V"
        if p.startswith("N-proper"):
            return "P"
        if p.startswith("N-"):
            return "N"
        if p.startswith("Adj"):
            return "A"
    return "O"


def step_class(code):
    if code.startswith("N:"):
        return "P"
    if code.endswith(":V") or ":V " in code:
        return "V"
    if ":N" in code:
        return "N"
    if ":A" in code and ":Adv" not in code and ":ADV" not in code:
        return "A"
    return "O"


# ---- STEP's lexicon entries, as the app's markup ----
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
SINGLE = {"OBA", "PHM", "2JN", "3JN", "JUD"}


def step_ref(target, have):
    m = re.match(r"\s*([1-3]?[A-Za-z]+)\.(\d+)(?:\.(\d+))?", target)
    if not m:
        return None
    book = STEP_BOOKS.get(m.group(1).lower())
    if not book:
        return None
    c, v = int(m.group(2)), m.group(3)
    if v is None:
        if book not in SINGLE:
            return None
        c, v = 1, c
    v = int(v)
    if (book, c, v) not in have:
        return None
    return "%s.%d.%d" % (book, c, v)


def flatten_refs(s, have, stats):
    # <ref='Mat.5.43'>Mat.5:43;</ref>, perhaps with refs inside: the
    # outermost one's target, and all its text (punctuation at its end left
    # outside the link).
    out = []
    i = 0
    while True:
        j = s.find("<ref=", i)
        if j < 0:
            out.append(s[i:])
            break
        out.append(s[i:j])
        depth = 0
        k = j
        while k < len(s):
            if s.startswith("<ref=", k):
                depth += 1
                k = s.index(">", k) + 1
            elif s.startswith("</ref>", k):
                depth -= 1
                k += 6
                if depth == 0:
                    break
            else:
                k += 1
        whole = s[j:k]
        target = re.match(r"<ref='([^']*)'", whole)
        text = re.sub(r"</?ref[^>]*>", "", whole)
        text = strip_html(text)
        tail = re.search(r"[\s;,.:]*$", text).group()
        text = text[:len(text) - len(tail)]
        ref = step_ref(target.group(1), have) if target else None
        if ref and text.strip():
            out.append("[[%s|%s]]%s" % (ref, text.replace("|", "/").replace("]", ")"), tail))
            stats["lexicon refs"] += 1
        else:
            out.append(text + tail)
            stats["lexicon refs unlinked"] += 1
        i = k
    return "".join(out)


def markup(defn, have, stats):
    s = defn
    s = flatten_refs(s, have, stats)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</?p[^>]*>", "\n", s)
    s = re.sub(r"(?i)<b>(.*?)</b>", r"**\1**", s, flags=re.S)
    s = re.sub(r"(?i)<(i|em)>(.*?)</\1>", r"_\2_", s, flags=re.S)
    s = strip_html(s)
    s = html.unescape(s)
    # STEP's indents (__1., __(a)) are only for its own layout.
    s = re.sub(r"_{2,}", "", s)
    s = s.replace("\t", " ").replace("\r", "")
    # (Emphasis that spans a paragraph's end is closed and opened again.)
    paras = []
    for p in s.split("\n"):
        p = re.sub(r"[  ]+", " ", p).strip()
        if p.count("**") % 2:
            p = p.replace("**", "")
        if not p:
            continue
        paras.append(p)
    text = cross_style("\\n".join(paras), stats)
    # (Hebrew without its accents, as forms.txt has it: the points stay.)
    text = re.sub("[\u0591-\u05af\u05c0\u05c3]", "", text)
    if "<" in text and re.search(r"<[a-zA-Z/]", text):
        stats["lexicon html left"] += 1
    return text


# STEP's cross-references to other words ("Also means: _ro.i_ (רֹעִי "to
# shepherd" H7473)", "Another name of _ev.ya.saph_ (אֶבְיָסָף, אֲבִיאָסָף
# ...)", or the gloss first) in the app's style: the word, its
# transliteration as the tables write them (never STEP's dotted one), the
# gloss in curly quotes, and the number as the app shows it (H7473).
ORIG = "\u0590-\u05ff\u0370-\u03ff\u1f00-\u1fff"
CROSS = re.compile(r'_([^_]+)_ \(([' + ORIG + r'][^()"]*?)(?: "([^"]*)")? ([HG])0*(\d+)[A-Za-z]{0,2}\)')
CROSS_GLOSS_FIRST = re.compile(r'"([^"]*)" \(_([^_]+)_ ([' + ORIG + r'][^()"]*?) ([HG])0*(\d+)[A-Za-z]{0,2}\)')


def cross_style(text, stats):
    def word(orig, tr, gloss, kind, num):
        first = orig.split(",")[0].strip()
        if kind == "H":
            # (A name of several words, transliterated a word at a time.)
            tr = " ".join(hebrew_translit(x) for x in first.split())
        else:
            tr = tr.replace(".", "")
        out = orig.strip() + " _" + tr + "_"
        gloss = (gloss or "").strip().lstrip(":").strip()
        if gloss:
            out += " \u201c" + gloss + "\u201d"
        stats["lexicon cross-references styled"] += 1
        return out + " \u00b7 " + kind + num

    text = CROSS.sub(lambda m: word(m.group(2), m.group(1), m.group(3), m.group(4), m.group(5)), text)
    text = CROSS_GLOSS_FIRST.sub(lambda m: word(m.group(3), m.group(2), m.group(1), m.group(4), m.group(5)),
                                 text)
    # (The label a cross-reference begins its line with, in bold: "Also
    # means:", "Another name of".)
    text = re.sub(r"(^|\\n)((?:Also|Another|Aramaic|Group|Combined|A grammatical|A name|A shortened)"
                  r"[A-Za-z ]{0,40}?:?)(?= [" + ORIG + r"][^\\]*? \u00b7 [HG]\d)",
                  lambda m: m.group(1) + "**" + m.group(2) + "**", text)
    # Every other Strong's number in the text as the app shows them: no
    # leading zeros, no sense letter ("Ehud (H0164H)" reads "Ehud (H164)").
    text = re.sub(r"\b([HG])0*([0-9]{1,4})[A-Za-z]{0,2}\b", r"\1\2", text)
    if re.search(r"_[a-z]+\.[a-z.]+_ \([" + ORIG + "]", text):
        stats["lexicon dotted transliterations left"] += 1
    return text


def read_step(paths):
    lex = collections.defaultdict(list)
    for p in paths:
        for line in open(p, encoding="utf-8-sig"):
            f = line.rstrip("\n").split("\t")
            if len(f) < 8 or not re.match(r"[HG]\d{4}[a-zA-Z]?$", f[0]):
                continue
            base = f[0][0] + str(int(f[0][1:5]))
            lex[base].append(f)
    return lex


# ---- Hebrew transliterated (for lemmas the tables have no form of), in
# the tables' own way: tsere ê, holem with waw ōw, shureq ū, a quiet aleph
# or shva not written ----
CONS = {"א": "’", "ב": "ḇ", "ג": "ḡ", "ד": "ḏ", "ה": "h", "ו": "w", "ז": "z", "ח": "ḥ",
        "ט": "ṭ", "י": "y", "כ": "ḵ", "ך": "ḵ", "ל": "l", "מ": "m", "ם": "m", "נ": "n",
        "ן": "n", "ס": "s", "ע": "‘", "פ": "p̄", "ף": "p̄", "צ": "ṣ", "ץ": "ṣ", "ק": "q",
        "ר": "r", "ש": "š", "ת": "ṯ"}
HARD = {"ב": "b", "ג": "g", "ד": "d", "כ": "k", "ך": "k", "פ": "p", "ף": "p", "ת": "t"}
VOWEL = {"\u05b1": "ĕ", "\u05b2": "ă", "\u05b3": "ŏ", "\u05b4": "i", "\u05b5": "ê",
         "\u05b6": "e", "\u05b7": "a", "\u05b8": "ā", "\u05b9": "ō", "\u05ba": "ō",
         "\u05bb": "u", "\u05c7": "o"}
LONG = set("āêōîûūē")


def hebrew_translit(word):
    w = hebrew_clean(word).replace("\u05bd", "")
    if w.replace("\u05b9", "") in ("יְהוָה", "יֱהוִה"):
        return "Yahweh"
    units = []
    for ch in w:
        if "\u05d0" <= ch <= "\u05ea":
            units.append({"c": ch, "dagesh": False, "v": "", "dot": ""})
        elif ch == "\u05bc" and units:
            units[-1]["dagesh"] = True
        elif (ch in VOWEL or ch == "\u05b0") and units:
            units[-1]["v"] = ch
        elif ch in "\u05c1\u05c2" and units:
            units[-1]["dot"] = ch
        elif ch in "\u05be- ":
            units.append({"c": "-" if ch != " " else " "})
    out = []
    prev = ""  # the vowel written after the unit before ("" if none)
    start = True
    for i, u in enumerate(units):
        c = u["c"]
        if c in "- ":
            out.append(c)
            prev = ""
            start = True
            continue
        nxt = units[i + 1] if i + 1 < len(units) and "v" in units[i + 1] else None
        last = nxt is None
        v = u["v"]
        marked = i > 0 and "v" in units[i - 1] and bool(units[i - 1]["v"])
        # (A consonant before a waw that is a vowel carries that vowel.)
        vowel_waw = nxt is not None and nxt["c"] == "ו" and not nxt["v"] == "" and nxt["v"] == "\u05b9" or \
            nxt is not None and nxt["c"] == "ו" and nxt["dagesh"] and not nxt["v"]
        # Waw as a vowel: holem (ōw), shureq (ū).
        if c == "ו" and not start:
            if v == "\u05b9" and not marked:
                out.append("ōw")
                prev = "ō"
                continue
            if u["dagesh"] and not v and not marked:
                out.append("ū")
                prev = "ū"
                continue
        if c == "ו" and start and u["dagesh"] and not v:
            out.append("ū")
            prev = "ū"
            start = False
            continue
        # Yod after i or e, and a final he after a vowel: letters for the
        # vowel.
        if c == "י" and not v and not u["dagesh"] and prev in ("i", "ê", "e") and not start:
            if prev != "e":
                out[-1] = out[-1][:-1] + ("î" if prev == "i" else "ê")
            prev = out[-1][-1]
            continue
        if c == "ה" and last and not v and not u["dagesh"]:
            out.append("h" if prev else "")
            continue
        if c == "א" and not v and not start and not vowel_waw:
            continue
        if c == "י" and not v and prev == "ā" and nxt is not None and nxt["c"] == "ו" and \
                i + 2 == len(units) and not nxt["v"] and not nxt["dagesh"]:
            continue
        if c == "ש":
            cons = "ś" if u["dot"] == "\u05c2" else "š"
        elif u["dagesh"] and c in HARD:
            cons = HARD[c]
        else:
            cons = CONS[c]
        if u["dagesh"] and not start and prev and prev != "ə" and c not in "הא":
            cons = cons + cons
        if v == "\u05b0":
            vocal = start or (u["dagesh"] and not start) or (not prev and not start) or prev in LONG
            vowel = "ə" if vocal and not last else ""
        else:
            vowel = VOWEL.get(v, "")
        if last and vowel == "a" and c in "חע":
            out.append("a" + cons)
            prev = ""
            continue
        out.append(cons + vowel)
        prev = vowel
        start = False
    return unicodedata.normalize("NFC", "".join(out).strip())


def main():
    tables, tbesh, tbesg, bsbtxt, outdir = sys.argv[1:6]
    os.makedirs(outdir, exist_ok=True)
    stats = collections.Counter()
    verses, titles = read_bsb(bsbtxt)
    vindex = {}
    for i, (b, c, v, ci, t) in enumerate(verses):
        vindex[(b, c, v)] = i
    have = set(vindex)
    book_codes = []
    for b, c, v, ci, t in verses:
        if not book_codes or book_codes[-1] != b:
            book_codes.append(b)
    # The tables, verse by verse.
    names = []
    rows = collections.defaultdict(list)
    f = open(tables, encoding="utf-8-sig", newline="")
    r = csv.reader(f, delimiter="\t", quoting=csv.QUOTE_NONE)
    next(r)
    cur = None
    for row in r:
        row += [""] * (23 - len(row))
        if row[12].strip():
            m = re.match(r"(.+) (\d+):(\d+)$", row[12].strip())
            nm = m.group(1)
            if not names or names[-1] != nm:
                names.append(nm)
            cur = (book_codes[len(names) - 1], int(m.group(2)), int(m.group(3)))
        orig = row[5].strip()
        eng = row[18].strip()
        end = strip_html(row[22]).strip()
        if re.search("[A-Za-z0-9]", end):
            eng = (eng + " " + end).strip()
            stats["chunks with end text"] += 1
        if not orig and not TOKEN.search(eng):
            continue
        rows[cur].append(row[:23] + [eng])
    missing = [k for k in rows if k not in vindex]
    stats["table verses not in the text"] = len(missing)
    morph = {}
    forms = {}
    words = bytearray()
    vrecs = bytearray()
    supplied = bytearray()
    conc = collections.defaultdict(list)
    conc_words = collections.Counter()
    unaligned = []
    lemma_forms = collections.defaultdict(collections.Counter)
    pos_votes = collections.defaultdict(collections.Counter)
    nwords = 0
    for vi, (b, c, v, ci, text) in enumerate(verses):
        key = (b, c, v)
        title = titles.get(ci, "") if v == 1 else ""
        want = [t for _, t in tokens(title + " " + text if title else text)]
        first = nwords
        got = []
        flags_tok = []
        recs = []
        depth = 0
        vrows = rows.get(key, [])
        for i, row in enumerate(vrows):
            orig = row[5].strip()
            eng = row[23]
            flags = 0
            if eng == "-":
                flags = 1
                eng = ""
            elif eng == "vvv":
                flags = 2
                eng = ""
            else:
                if "vvv" in eng:
                    eng = re.sub(r"\bvvv\b", "", eng)
                    stats["vvv artifacts fixed"] += 1
                if "<" in eng:
                    eng = strip_html(eng)
                    stats["html artifacts fixed"] += 1
            toks = tokens(eng)
            # Which of the chunk's tokens are inside [brackets] (which may
            # open in one chunk and close in a later one).
            marks = []
            p = 0
            for pos, t in toks:
                for chx in eng[p:pos]:
                    if chx == "[":
                        depth += 1
                    elif chx == "]":
                        depth = max(0, depth - 1)
                marks.append(depth > 0)
                p = pos
            for chx in eng[p:]:
                if chx == "[":
                    depth += 1
                elif chx == "]":
                    depth = max(0, depth - 1)
            start = len(got)
            got.extend(t for _, t in toks)
            if not orig:
                flags_tok.extend([2] * len(toks))
                continue
            flags_tok.extend(1 if mk else 0 for mk in marks)
            if not toks and flags == 0:
                flags = 4
            lang = "G" if row[4].startswith("G") else "H"
            s = row[11].strip() if lang == "G" else row[10].strip()
            num = int(s) if s.isdigit() else 0
            code = row[8].strip()
            if code not in morph:
                morph[code] = (len(morph), row[9].strip())
            form = (hebrew_clean(orig) if lang == "H" else orig) + "\t" + row[7].strip()
            if form not in forms:
                forms[form] = len(forms)
            sort = row[0] if lang == "H" else row[1]
            try:
                sortkey = float(sort)
            except ValueError:
                sortkey = 1e12 + i
            recs.append([num | (0x8000 if lang == "G" else 0), morph[code][0], len(toks),
                         sortkey, flags, start, forms[form], i])
            if num:
                k = lang + str(num)
                conc_words[k] += 1
                if not conc[k] or conc[k][-1] != vi:
                    conc[k].append(vi)
                lemma_forms[k][form] += 1
                pos_votes[k][pos_class(code)] += 1
        # (vvv: with the word after it, if that has English, else before.)
        for j, rec in enumerate(recs):
            if rec[4] == 2:
                nxt = recs[j + 1] if j + 1 < len(recs) else None
                if not (nxt and nxt[2] > 0):
                    rec[4] |= 8
        order = sorted(range(len(recs)), key=lambda j: (recs[j][3], j))
        rank = [0] * len(recs)
        for o, j in enumerate(order):
            rank[j] = o
        aligned = got == want
        if not aligned:
            unaligned.append(key)
            if os.environ.get("SHOW_UNALIGNED") and len(unaligned) <= int(os.environ["SHOW_UNALIGNED"]):
                import difflib
                ops = [(" ".join(want[a:b2]), " ".join(got[c2:d])) for op, a, b2, c2, d in
                       difflib.SequenceMatcher(None, want, got, autojunk=False).get_opcodes() if op != "equal"]
                print("unaligned %s %d:%d" % key, ops[:4])
        for j, rec in enumerate(recs):
            if rec[5] > 255 or rank[j] > 255:
                raise SystemExit("verse too long for a byte: %s" % (key,))
            words += struct.pack("<HHBBBBI", rec[0], rec[1], min(rec[2], 255), rank[j], rec[4],
                                 rec[5], rec[6])
            nwords += 1
        vrecs += struct.pack("<IHH", first, ci, v | (0 if aligned else 0x8000))
        # Supplied runs.
        j = 0
        while j < len(flags_tok):
            if flags_tok[j]:
                k = j
                while k < len(flags_tok) and flags_tok[k] == flags_tok[j]:
                    k += 1
                supplied += struct.pack("<IBBH", vi, j, k - j, 1 if flags_tok[j] == 2 else 0)
                stats["supplied runs"] += 1
                j = k
            else:
                j += 1
    vrecs += struct.pack("<IHH", nwords, 0, 0)
    stats["words"] = nwords
    stats["verses"] = len(verses)
    stats["aligned verses"] = len(verses) - len(unaligned)
    stats["forms"] = len(forms)
    stats["parsings"] = len(morph)
    stats["strongs keys"] = len(conc)
    # The concordance.
    cb = bytearray()

    def leb(n):
        while True:
            x = n & 127
            n >>= 7
            cb.append(x | (128 if n else 0))
            if not n:
                break

    for k in sorted(conc, key=lambda k: (k[0], int(k[1:]))):
        cb += k.encode() + b"\0"
        leb(conc_words[k])
        prev = 0
        for vi in conc[k]:
            leb(vi + 1 - prev)
            prev = vi + 1
        cb.append(0)
    # The lexicon: entries of each base key used, the main one first.
    lex = read_step([tbesh, tbesg])
    lines = []
    translit_from = collections.Counter()
    for k in sorted(conc, key=lambda k: (k[0], int(k[1:]))):
        entries = lex.get(k)
        if not entries:
            stats["keys without a lexicon entry"] += 1
            continue
        want_class = pos_votes[k].most_common(1)[0][0] if pos_votes[k] else "O"

        def rank_entry(e):
            suffix = e[0][5:]
            return (0 if step_class(e[5]) == want_class else 1, 0 if not suffix else 1, suffix.lower())

        entries = sorted(entries, key=rank_entry)
        lines.append("@" + k)
        for e in entries:
            lemma = hebrew_clean(e[3]) if k[0] == "H" else e[3].strip()
            tr = e[4].strip()
            if k[0] == "H":
                # The tables' own transliteration of the lemma's form, if a
                # word has it; else made from its points.
                best = None
                for form, n in lemma_forms[k].most_common():
                    o, t = form.split("\t")
                    if o.replace("ֽ", "") == lemma.replace("ֽ", ""):
                        best = t.replace("·", "")
                        break
                if best:
                    tr = best
                    translit_from["tables"] += 1
                else:
                    tr = hebrew_translit(lemma)
                    translit_from["made"] += 1
            gloss = e[6].strip()
            defn = markup(e[7], have, stats)
            lines.append("\t".join([lemma, tr, e[5].strip(), gloss, defn]))
    stats["lemma translits from the tables"] = translit_from["tables"]
    stats["lemma translits made"] = translit_from["made"]
    w = lambda name, data, mode="wb": open(os.path.join(outdir, name), mode).write(data)
    w("words.bin", bytes(words))
    w("verses.bin", bytes(vrecs))
    w("supplied.bin", bytes(supplied))
    w("conc.bin", bytes(cb))
    w("forms.txt", "\n".join(forms) + "\n", "w")
    w("morph.txt", "\n".join("%s\t%s" % (c, d) for c, (i, d) in
                             sorted(morph.items(), key=lambda x: x[1][0])) + "\n", "w")
    w("lexicon.txt", "\n".join(lines) + "\n", "w")
    for k, n in sorted(stats.items()):
        print("%s: %d" % (k, n))
    print("G26 occurrences: %d in %d verses" % (conc_words["G26"], len(conc["G26"])))
    print("G25 occurrences: %d in %d verses" % (conc_words["G25"], len(conc["G25"])))
    print("unaligned: " + ", ".join("%s %d:%d" % k for k in unaligned))
    if missing:
        print("table verses not in the text: " + ", ".join("%s %d:%d" % k for k in missing))


main()
