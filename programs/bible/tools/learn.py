#!/usr/bin/env python3
"""How often each word of the original text occurs, for learning Greek and
Hebrew (DESIGN.md §14.7).

    python3 -I learn.py DATA

DATA is the app's data/ (bsb.txt, and lang/words.bin, verses.bin,
morph.txt, lexicon.txt, forms.txt, as bsb_lang.py made them); no download.
Standard library only. It writes:

  lang/vocab.bin  u32 greek_total (every Greek word of the text, names
                  included, Aramaic-tagged ones left out), u32 hebrew_total
                  (the same for Hebrew: words of no Strong's number counted,
                  Aramaic ones left out), u16 n_greek, u16 n_hebrew; then
                  n_greek records, then n_hebrew, each u16 Strong's number,
                  u16 flags (1 a name, 2 Aramaic), u32 count; by count, most
                  first, then by number. A name is a number whose main
                  lexicon entry's part of speech begins "N:", Aramaic "A:".

It prints DESIGN.md §14.0.3's table (coverage by the most common words,
names aside; the words needed for 50%, 75% and 90%; the verses where every
word is known at 120 and 300 known words, names known), a few words'
ranks (§14.9.2's), the joined words' counts (§14.1.2), and each letter
card's example candidates (the most common lemmas with the letter, the
vowel, the pair or the joined word, and the first verse where the lemma's
own form occurs), from which data/lang/letters.txt's examples were chosen
by hand. With --check DATA it reads vocab.bin and letters.txt and checks
them: G3588 first, the names flagged (G2424), every letter a sound in each
of its language's pronunciations, every example a lemma of vocab.bin's,
its form marked and its verse holding it; it exits 1 if one fails.

    python3 -I learn.py --check DATA
"""
import collections
import os
import struct
import sys
import unicodedata

PGN = {"1cs", "2ms", "2fs", "3ms", "3fs", "1cp", "2mp", "2fp", "3mp", "3fp"}
PREFIX = {"Conj-w": "w", "Art": "art", "Prep-b": "b", "Prep-l": "l", "Prep-k": "k",
          "Prep-m": "m"}
# A bare preposition (a word of no number: לוֹ) read from its letter.
PREP_LETTER = {"ל": "l", "ב": "b", "כ": "k", "מ": "m"}
SOUNDS = {"G": 3, "H": 2}


def chapters(path):
    # Each chapter's book code and number, in order.
    out = []
    book = None
    for line in open(path, encoding="utf-8"):
        if line[:1] == "B":
            book = line[1:4]
        elif line[:1] == "C":
            out.append((book, int(line[1:].strip())))
    return out


class Data:
    def __init__(self, data):
        lang = os.path.join(data, "lang")
        self.chap = chapters(os.path.join(data, "bsb.txt"))
        wb = open(os.path.join(lang, "words.bin"), "rb").read()
        self.words = [struct.unpack_from("<HHBBBBI", wb, i * 12) for i in range(len(wb) // 12)]
        vb = open(os.path.join(lang, "verses.bin"), "rb").read()
        nv = len(vb) // 8 - 1
        self.verses = [struct.unpack_from("<IHH", vb, i * 8) for i in range(nv + 1)]
        self.morph = [l.rstrip("\n").split("\t")[0]
                      for l in open(os.path.join(lang, "morph.txt"), encoding="utf-8")]
        self.forms = [l.rstrip("\n").split("\t")
                      for l in open(os.path.join(lang, "forms.txt"), encoding="utf-8")]
        self.lex = {}
        key = None
        for line in open(os.path.join(lang, "lexicon.txt"), encoding="utf-8"):
            if line.startswith("@"):
                key = line[1:].strip()
            elif key and key not in self.lex:
                f = line.rstrip("\n").split("\t")
                # (code, lemma, translit, part of speech, gloss)
                self.lex[key] = f
        self.parts = [joined_parts(m) for m in self.morph]

    def key(self, s):
        return ("G" if s & 0x8000 else "H") + str(s & 0x7FFF)

    def pos(self, key):
        e = self.lex.get(key)
        return e[3] if e else ""

    def flags(self, key):
        p = self.pos(key)
        return (1 if p.startswith("N:") else 0) | (2 if p.startswith("A:") else 0)

    def verse_of_words(self):
        out = [0] * len(self.words)
        for vi in range(len(self.verses) - 1):
            for w in range(self.verses[vi][0], self.verses[vi + 1][0]):
                out[w] = vi
        return out

    def ref(self, vi):
        c, v = self.verses[vi][1], self.verses[vi][2] & 0x7FFF
        b, n = self.chap[c]
        return "%s.%d.%d" % (b, n, v)

    def form(self, w):
        return self.forms[self.words[w][6]][0]


def joined_parts(code):
    # A Hebrew parsing's joined words: its prefixes (before the main part)
    # and endings (a person-gender-number part after it, or Pro-3mp); and
    # whether it has a bare preposition.
    parts = code.split(" | ")
    main = len(parts) - 1
    while main > 0 and ending(parts[main]):
        main -= 1
    out = []
    bare = False
    for p in parts[:main]:
        for q in p.split(", "):
            if q in PREFIX:
                out.append(PREFIX[q])
            elif q == "Prep":
                bare = True
    for p in parts[main + 1:]:
        e = ending(p)
        if e:
            out.append(e)
    # (A main part that is an ending of its own: Prep-l | Pro-3mp.)
    if parts[main].startswith("Pro-") and parts[main][4:] in PGN and main > 0:
        out.append(parts[main][4:])
    return out, bare


def ending(p):
    if p in PGN:
        return p
    if p.startswith("Pro-") and p[4:] in PGN:
        return None
    return None


def word_parts(d, w):
    # Word w's joined words (Hebrew), as card keys.
    s, m = d.words[w][0], d.words[w][1]
    if s & 0x8000:
        return []
    out, bare = d.parts[m]
    out = list(out)
    if bare and (s & 0x7FFF) == 0:
        # (The preposition's letter: the form's first, past a ו of "and".)
        letters = [c for c in d.form(w) if "א" <= c <= "ת"]
        if "w" in out and letters:
            letters = letters[1:]
        if letters and letters[0] in PREP_LETTER:
            out.append(PREP_LETTER[letters[0]])
    return out


def counts(d):
    total = {"G": 0, "H": 0}
    count = {"G": collections.Counter(), "H": collections.Counter()}
    for s, *_ in d.words:
        lang = "G" if s & 0x8000 else "H"
        num = s & 0x7FFF
        if num == 0:
            total[lang] += 1
            continue
        key = d.key(s)
        count[lang][num] += 1
        if not d.flags(key) & 2:
            total[lang] += 1
    return total, count


def ordered(d, lang, count):
    return sorted(count.items(), key=lambda kv: (-kv[1], kv[0]))


def make(data):
    d = Data(data)
    total, count = counts(d)
    out = bytearray()
    order = {}
    for lang in "GH":
        order[lang] = ordered(d, lang, count[lang])
    out += struct.pack("<IIHH", total["G"], total["H"], len(order["G"]), len(order["H"]))
    for lang in "GH":
        for num, n in order[lang]:
            out += struct.pack("<HHI", num, d.flags(lang + str(num)), n)
    path = os.path.join(data, "lang", "vocab.bin")
    with open(path, "wb") as f:
        f.write(out)
    print("vocab.bin: %d bytes; Greek %d words, %d numbers; Hebrew %d words, %d numbers"
          % (len(out), total["G"], len(order["G"]), total["H"], len(order["H"])))
    report(d, total, order)
    candidates(d, order, data)


def learnable(d, lang, order):
    return [(num, n) for num, n in order[lang] if d.flags(lang + str(num)) == 0]


def report(d, total, order):
    vw = d.verse_of_words()
    for lang, name in (("G", "New Testament (Greek)"), ("H", "Old Testament (Hebrew)")):
        lst = learnable(d, lang, order)
        t = total[lang]
        names = sum(n for num, n in order[lang] if d.flags(lang + str(num)) == 1)
        nos = sum(1 for s, *_ in d.words if not s & 0x8000 and s == 0) if lang == "H" else 0
        print("%s: %d words; names %.1f%%; %d different words, names aside%s"
              % (name, t, names * 100.0 / t, len(lst),
                 ", and %d words of no number" % nos if nos else ""))
        acc = 0
        need = {}
        cover = {}
        for i, (num, n) in enumerate(lst):
            acc += n
            for p in (50, 75, 80, 90):
                if p not in need and acc * 100 >= p * t:
                    need[p] = i + 1
            if i + 1 in (10, 50, 120, 300, 500, 1000, 2000):
                cover[i + 1] = acc
        print("  the most common: " + ", ".join(
            "%d %.1f%% (%d%%)" % (k, v * 100.0 / t, v * 100 // t) for k, v in sorted(cover.items())))
        print("  words needed: " + ", ".join("%d%% %s" % (p, need.get(p, "-")) for p in (50, 75, 80, 90)))
        print("  first ten: " + ", ".join(d.lex.get(lang + str(num), ["", "?"])[1] for num, _ in lst[:10]))
        rank = {num: i + 1 for i, (num, _) in enumerate(lst)}
        for at in (120, 300):
            known = set(num for num, _ in lst[:at])
            r, near, vs = readable(d, lang, known, vw, joined=True)
            print("  verses readable at %d known words (names known%s): %d of %d, and %d more with one unknown"
                  % (at, ", the joined words too" if lang == "H" else "", r, vs, near))
            if lang == "G" and at == 120:
                vi = next(i for i in range(len(d.verses) - 1) if d.ref(i) == "JHN.3.16")
                a, b = d.verses[vi][0], d.verses[vi + 1][0]
                un = [d.form(w) for w in range(a, b) if not known_word(d, lang, known, w, True)]
                print("  John 3:16 at 120: %d words, %d not known (%s)" % (b - a, len(un), ", ".join(un)))
        for k in ((5620, 3439, 622, 166, 2316, 25) if lang == "G" else (7462, 3808, 4210, 2637, 559)):
            print("  rank %s%d %s: %s" % (lang, k, d.lex.get(lang + str(k), ["", "?"])[1], rank.get(k, "-")))
    # The joined words: how many words carry each.
    jc = collections.Counter()
    for w in range(len(d.words)):
        for p in word_parts(d, w):
            jc[p] += 1
    print("joined words: " + ", ".join("%s %d" % kv for kv in jc.most_common()))


def known_word(d, lang, known, w, joined):
    s = d.words[w][0]
    num = s & 0x7FFF
    key = d.key(s)
    fl = d.flags(key) if num else 0
    if fl & 2:
        return False
    ok = num == 0 or fl & 1 or num in known
    if ok and lang == "H" and not joined and word_parts(d, w):
        return False
    return bool(ok)


def readable(d, lang, known, vw, joined):
    r = near = vs = 0
    for vi in range(len(d.verses) - 1):
        a, b = d.verses[vi][0], d.verses[vi + 1][0]
        if b <= a or bool(d.words[a][0] & 0x8000) != (lang == "G"):
            continue
        vs += 1
        if b - a < 3:
            continue
        unknown = sum(1 for w in range(a, b) if not known_word(d, lang, known, w, joined))
        if unknown == 0:
            r += 1
        elif unknown == 1:
            near += 1
    return r, near, vs


def strip(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if not unicodedata.combining(c))


def candidates(d, order, data):
    # Each letter card's example candidates (§14.4.1): the most common
    # lemmas, names aside, beginning with the letter (or holding the vowel,
    # the pair or the breathing), each with the first verse where its own
    # form occurs; and for a joined word the commonest forms carrying it.
    first = {}
    vw = d.verse_of_words()
    common = collections.Counter()
    for w, (s, *_rest) in enumerate(d.words):
        k = (d.key(s), d.form(w))
        common[k] += 1
        if k not in first:
            first[k] = vw[w]
    path = os.path.join(data, "lang", "letters.txt")
    if not os.path.exists(path):
        return
    for lang, ident, test in letter_tests(path):
        got = []
        if ident.startswith("j-"):
            part = ident[2:]
            seen = collections.Counter()
            for w in range(len(d.words)):
                if not d.words[w][0] & 0x8000 and part in word_parts(d, w):
                    seen[(d.key(d.words[w][0]), d.form(w))] += 1
            for (key, form), n in seen.most_common(3):
                got.append("%s %s (%d, %s)" % (form, key, n, d.ref(first[(key, form)])))
        else:
            for num, n in learnable(d, lang, order):
                e = d.lex.get(lang + str(num))
                if e and test(e[1]):
                    vi = first.get((lang + str(num), e[1]))
                    got.append("%s %s %s (%d%s)" % (e[1], e[4][:16], lang + str(num), n,
                                                    ", " + d.ref(vi) if vi is not None else ""))
                    if len(got) == 3:
                        break
        print("%s %-13s %s" % (lang, ident, " | ".join(got)))


VOWEL_MARKS = {"qamets": "\u05B8", "patach": "\u05B7", "tsere": "\u05B5", "segol": "\u05B6",
               "hireq": "\u05B4", "holem": "\u05B9", "holem-vav": "\u05D5\u05B9",
               "shureq": "\u05D5\u05BC", "qibbuts": "\u05BB", "sheva": "\u05B0",
               "hatef-patach": "\u05B2", "hatef-segol": "\u05B1", "hatef-qamets": "\u05B3",
               "hireq-yod": "\u05B4\u05D9", "tsere-yod": "\u05B5\u05D9"}


def letter_tests(path):
    for line in open(path, encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if len(f) < 9 or f[0].startswith("#"):
            continue
        lang, ident, glyph = f[0], f[1], f[2]
        if lang == "G":
            low = glyph.split()[1] if " " in glyph else glyph
            if ident == "rough":
                yield lang, ident, lambda s: "\u0314" in unicodedata.normalize("NFD", s)
            elif len(low) == 2:
                yield lang, ident, (lambda b: lambda s: b in strip(s).lower())(low)
            else:
                yield lang, ident, (lambda b: lambda s: strip(s).lower().startswith(b))(strip(low))
        elif ident in VOWEL_MARKS:
            yield lang, ident, (lambda m: lambda s: m in s)(VOWEL_MARKS[ident])
        elif ident.endswith("-dagesh"):
            yield lang, ident, (lambda c: lambda s: s.startswith(c))(glyph)
        else:
            yield lang, ident, (lambda c: lambda s: s.startswith(c))(glyph.split()[0])


def check(data):
    lang_dir = os.path.join(data, "lang")
    vb = open(os.path.join(lang_dir, "vocab.bin"), "rb").read()
    gt, ht, ng, nh = struct.unpack_from("<IIHH", vb, 0)
    recs = {"G": [], "H": []}
    p = 12
    for lang, n in (("G", ng), ("H", nh)):
        for _ in range(n):
            recs[lang].append(struct.unpack_from("<HHI", vb, p))
            p += 8
    bad = []
    if p != len(vb):
        bad.append("vocab.bin's length")
    if not recs["G"] or recs["G"][0][0] != 3588:
        bad.append("G3588 is not first")
    flags = {(lang, r[0]): r[1] for lang in "GH" for r in recs[lang]}
    if flags.get(("G", 2424)) != 1:
        bad.append("G2424 is not a name")
    for lang in "GH":
        c = [r[2] for r in recs[lang]]
        if c != sorted(c, reverse=True):
            bad.append(lang + " not by count")
    d = Data(data)
    forms_of = collections.defaultdict(set)
    vw = d.verse_of_words()
    for w, (s, *_r) in enumerate(d.words):
        forms_of[(d.key(s), d.ref(vw[w]))].add(d.form(w))
    n = {"G": 0, "H": 0}
    for line in open(os.path.join(lang_dir, "letters.txt"), encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        if not line.strip() or f[0].startswith("#"):
            continue
        if len(f) != 9:
            bad.append("letters.txt: %d fields: %s" % (len(f), line.strip()))
            continue
        lang, ident, glyph, name, sounds, speak, key, form, ref = f
        n[lang] += 1
        joined = ident.startswith("j-")
        if not joined and len(sounds.split("|")) != SOUNDS[lang]:
            bad.append("%s %s: %d sounds" % (lang, ident, len(sounds.split("|"))))
        if not all(x.strip() for x in sounds.split("|")) or not name or not speak:
            bad.append("%s %s: an empty field" % (lang, ident))
        num = int(key[1:]) if key[1:].isdigit() else -1
        if key[:1] != lang or (lang, num) not in flags:
            bad.append("%s %s: %s is not one of vocab.bin's lemmas" % (lang, ident, key))
        if form.count("[") != 1 or form.count("]") != 1 or form.index("[") > form.index("]"):
            bad.append("%s %s: %s has no [mark]" % (lang, ident, form))
        plain = form.replace("[", "").replace("]", "")
        if plain not in forms_of.get((key, ref), set()):
            bad.append("%s %s: %s is not %s's form in %s (%s)" % (
                lang, ident, plain, key, ref, ", ".join(sorted(forms_of.get((key, ref), [])))))
    if n["G"] != 32:
        bad.append("Greek letter cards: %d, not 32" % n["G"])
    if n["H"] != 57:
        bad.append("Hebrew letter and joined cards: %d, not 41 and 16" % n["H"])
    print("vocab.bin: Greek %d words, %d numbers; Hebrew %d words, %d numbers; letters.txt %d Greek, %d Hebrew"
          % (gt, ng, ht, nh, n["G"], n["H"]))
    for b in bad:
        print("FAILED: " + b)
    return not bad


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--check":
        sys.exit(0 if check(sys.argv[2]) else 1)
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    make(sys.argv[1])
