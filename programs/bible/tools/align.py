#!/usr/bin/env python3
"""Verse timings for the recorded readings (DESIGN.md §12.2), by forced
alignment of each recording to the app's own spoken text.

    VENV=~/.cache/smooth-bible-align/venv
    $VENV/bin/python -I align.py try READER FILE BOOK C [--letters]
    $VENV/bin/python -I align.py run [READER ...] [--jobs 2] [--threads 2]
    $VENV/bin/python -I align.py finish
    $VENV/bin/python -I align.py --check [READER ...]

READER is souer, hays, gilbert (the BSB, openbible.com) or henson (the
WEB, eBible.org). Run from the repository's root; the venv has CPU-only
torch and torchaudio 2.8 and num2words.

`try` aligns one chapter's file and prints each verse's start, end, score
and letters a second (and with --letters what the model hears at each
start), for looking at.

`run` is the whole job, resumable: it fetches each recording politely (one
download at a time, a zip a recording where there is one, otherwise a file
at a time with a pause; curl -C - resumes), keeps the audio in
~/.cache/smooth-bible-audio/ (outside the repository), aligns each chapter
as soon as it is there, writes its line to WORK/<reader>.tim.partial and
its details to WORK/<reader>.detail.jsonl at once (WORK is
~/.cache/smooth-bible-align/work), and deletes the chapter's audio. A
chapter already in the partial file is skipped. Progress is logged to
WORK/run.log.

`finish` makes programs/bible/data/audio/<reader>.tim from the partial
files: it checks the three BSB readers against one another (a verse whose
share of its chapter in one reader is far from the others' flags that
reader's chapter), flags a chapter not yet done `missing`, and prints the
report (chapters flagged per reader, and the spot transcriptions'
character error rate per reader).

--check asks each chapter's file for its Content-Length and Last-Modified
(HEAD, one a second) and lists the chapters whose recording changed since
the timing file was made.

The text comes from tools/spoken.l8 (text.l8's speak_text), never from
rules of its own. The model is torchaudio's WAV2VEC2_ASR_BASE_960H
(fairseq's, MIT-licensed), English letters.
"""
import json
import math
import os
import queue
import random
import re
import shutil
import subprocess
import sys
import threading
import time
import unicodedata
import urllib.parse

VERSION = 1
MODEL = "WAV2VEC2_ASR_BASE_960H"
AGENT = "SmoothBible/1.0 (verse timings for a Bible reader; https://smoothbible.com)"
AUDIO = os.path.expanduser("~/.cache/smooth-bible-audio")
WORK = os.path.expanduser("~/.cache/smooth-bible-align/work")
DATA = "programs/bible/data"

BOOKS = ("GEN EXO LEV NUM DEU JOS JDG RUT 1SA 2SA 1KI 2KI 1CH 2CH EZR NEH EST JOB PSA PRO "
         "ECC SNG ISA JER LAM EZK DAN HOS JOL AMO OBA JON MIC NAM HAB ZEP HAG ZEC MAL MAT MRK "
         "LUK JHN ACT ROM 1CO 2CO GAL EPH PHP COL 1TH 2TH 1TI 2TI TIT PHM HEB JAS 1PE 2PE 1JN "
         "2JN 3JN JUD REV").split()
# openbible.com's names for them (DESIGN.md §12.0.1).
ABBRS = ("Gen Exo Lev Num Deu Jos Jdg Rut 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Neh Est Job Psa Pro "
         "Ecc Sng Isa Jer Lam Ezk Dan Hos Jol Amo Oba Jon Mic Nam Hab Zep Hag Zec Mal Mat Mrk "
         "Luk Jhn Act Rom 1Co 2Co Gal Eph Php Col 1Th 2Th 1Ti 2Ti Tts Phm Heb Jas 1Pe 2Pe 1Jn "
         "2Jn 3Jn Jud Rev").split()

READERS = {
    "souer": {"text": "bsb", "base": "https://openbible.com/audio/souer/", "suffix": "",
              "zips": ["BSB_00_Souer_NT.zip", "BSB_00_Souer_OT.zip"]},
    "hays": {"text": "bsb", "base": "https://openbible.com/audio/hays/", "suffix": "_H",
             "zips": ["BSB_00_Chapters_Hays.zip"]},
    "gilbert": {"text": "bsb", "base": "https://openbible.com/audio/gilbert/", "suffix": "_G",
                "zips": []},
    "henson": {"text": "web", "base": "https://ebible.org/eng-web/audio/", "suffix": None,
               "zips": ["eng-web_audio.zip"]},
}
BSB_READERS = ("souer", "hays", "gilbert")

# The checks' limits (§12.2.5). SCORE_MIN is the mean log-probability a
# letter below which a verse is doubted; set from the test chapters' and
# the first runs' distribution (the bottom 1% or so of verses).
MIN_SECONDS = 0.4
RATE_MIN = 2.5
RATE_MAX = 30.0
SCORE_MIN = -1.6
DOUBTED_MAX = 3
SHARE_OFF = 0.5
SHARE_SECONDS = 1.5
SPOT_SHARE = 300 / 31100

BLOCK_SECONDS = 300
WINDOW_MARGIN = 20
STAR_SCORE = 0.0

FRAME = 320 / 16000


def log(msg):
    os.makedirs(WORK, exist_ok=True)
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    print(line, flush=True)
    with open(os.path.join(WORK, "run.log"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


# ---- the text ----

def spoken_lines(text):
    """{(book, c): [(v, said, written)]} from tools/spoken.l8."""
    os.makedirs(WORK, exist_ok=True)
    exe = os.path.join(WORK, "spoken")
    src = "programs/bible/tools/spoken.l8"
    if not os.path.exists(exe) or os.path.getmtime(exe) < max(
            os.path.getmtime(src), os.path.getmtime("programs/bible/text.l8")):
        subprocess.run(["./l8c3", "build", src, "-o", exe], check=True)
    out = subprocess.run([exe, os.path.join(DATA, text + ".txt")], check=True,
                         capture_output=True).stdout.decode("utf-8")
    chapters = {}
    order = []
    for line in out.split("\n"):
        if not line:
            continue
        book, c, v, said, written = line.split("\t")
        key = (book, int(c))
        if key not in chapters:
            chapters[key] = []
            order.append(key)
        chapters[key].append((int(v), said, written))
    return order, chapters


def number_words(m):
    from num2words import num2words
    n = int(m.group(0).replace(",", ""))
    return " " + num2words(n).replace(" and ", " ").replace("-", " ").replace(",", "") + " "


def letters(text):
    """What the model's letters should be for text: A-Z, ' and | between
    words."""
    t = unicodedata.normalize("NFKD", text)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.replace("’", "'").replace("‘", "'").replace("ʼ", "'")
    t = re.sub(r"\d[\d,]*\d|\d", number_words, t)
    t = t.upper()
    t = re.sub(r"[^A-Z' ]+", " ", t)
    # (An apostrophe only inside a word: a quote mark's is not said.)
    t = re.sub(r"(?<![A-Z])'|'(?![A-Z])", " ", t)
    words = t.split()
    return "|".join(words)


def henson_words(written):
    """Henson reads the Classic WEB: LORD, and GOD in small capitals, are
    "Yahweh" (§12.0.2 decision 3), and "the LORD" is "Yahweh" alone ("Yahweh
    is my shepherd")."""
    t = re.sub(r"\b[Tt]he LORD\b", "Yahweh", written)
    t = re.sub(r"\bLORD\b", "Yahweh", t)
    t = re.sub(r"\bGOD\b", "Yahweh", t)
    return t


def verse_letters(reader, verses):
    out = []
    for v, said, written in verses:
        out.append((v, letters(henson_words(written) if reader == "henson" else said)))
    return out


# ---- the model ----

_model = None
_labels = None


def model():
    global _model, _labels
    if _model is None:
        import torch
        import torchaudio
        bundle = getattr(torchaudio.pipelines, MODEL)
        _model = bundle.get_model().eval()
        _labels = bundle.get_labels()
    return _model, _labels


def decode(path):
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", path, "-ac", "1", "-ar",
                          "16000", "-f", "f32le", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def emissions(wave):
    """Log-probabilities a 20 ms frame, from 30 s windows 2 s apart in
    their overlap, joined."""
    import torch
    m, _ = model()
    win = 30 * 16000
    hop = 28 * 16000
    edge = 50
    parts = []
    s = 0
    n = len(wave)
    with torch.inference_mode():
        while True:
            chunk = torch.from_numpy(wave[s:s + win]).unsqueeze(0)
            if chunk.shape[1] < 400:
                break
            e, _ = m(chunk)
            e = torch.log_softmax(e[0], dim=-1)
            last = s + win >= n
            lo = 0 if s == 0 else edge
            hi = e.shape[0] if last else e.shape[0] - edge
            parts.append(e[lo:hi])
            if last:
                break
            s += hop
    return torch.cat(parts)


def greedy(em):
    _, labels = model()
    ids = em.argmax(dim=-1).tolist()
    out = []
    prev = -1
    for i in ids:
        if i != prev and i != 0:
            out.append(labels[i])
        prev = i
    return "".join(out).replace("|", " ").strip()


def cer(a, b):
    a = a.replace("|", " ")
    b = b.replace("|", " ")
    if not a:
        return 0.0 if not b else 1.0
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i] + [0] * len(b)
        for j, cb in enumerate(b, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb))
        prev = cur
    return prev[len(b)] / len(a)


# ---- alignment ----

def align_block(em, lo, hi, verses):
    """verses [(v, letters)] against frames lo..hi of em, with a star (any
    audio, or none) before, between and after them: each verse's (start,
    end) frame of its letters and mean log-probability a letter."""
    import torch
    import torchaudio.functional as F
    _, labels = model()
    index = {ch: i for i, ch in enumerate(labels)}
    star = len(labels)
    part = em[lo:hi]
    part = torch.cat([part, torch.full((part.shape[0], 1), STAR_SCORE)], dim=1)
    tokens = [star]
    owner = [-1]
    for k, (v, text) in enumerate(verses):
        if not text:
            continue
        for ch in text:
            tokens.append(index[ch])
            owner.append(k)
        tokens.append(star)
        owner.append(-1)
    targets = torch.tensor([tokens], dtype=torch.int32)
    path, scores = F.forced_align(part.unsqueeze(0), targets, blank=0)
    # Every target is said at least once, in order: a span each.
    spans = F.merge_tokens(path[0], scores[0])
    if len(spans) != len(tokens):
        raise RuntimeError("%d spans for %d tokens" % (len(spans), len(tokens)))
    sc = scores[0].tolist()
    res = [[None, None, 0.0, 0] for _ in verses]
    for i, sp in enumerate(spans):
        k = owner[i]
        if k < 0 or labels[tokens[i]] == "|":
            continue
        r = res[k]
        if r[0] is None:
            r[0] = lo + sp.start
        r[1] = lo + sp.end
        r[2] += sum(sc[sp.start:sp.end]) / (sp.end - sp.start)
        r[3] += 1
    return [(r[0], r[1], r[2] / r[3] if r[3] else None) for r in res]


def align_chapter(em, verses):
    """[(v, letters)] -> [(start_frame, end_frame, score)] for the whole
    chapter, in blocks of at most about five minutes."""
    total = em.shape[0]
    seconds = total * FRAME
    chars = [len(t) for _, t in verses]
    if seconds <= BLOCK_SECONDS * 1.1:
        return align_block(em, 0, total, verses)
    nblocks = math.ceil(seconds / BLOCK_SECONDS)
    # Split by character share, at verses.
    all_chars = sum(chars) or 1
    groups = []
    cur = []
    acc = 0
    for k, n in enumerate(chars):
        cur.append(k)
        acc += n
        if acc >= all_chars * (len(groups) + 1) / nblocks and len(groups) < nblocks - 1:
            groups.append(cur)
            cur = []
    if cur:
        groups.append(cur)
    out = [None] * len(verses)
    start = 0
    left_chars = all_chars
    for gi, g in enumerate(groups):
        g_chars = sum(chars[k] for k in g)
        span = (total - start) * g_chars / max(left_chars, 1)
        end = total if gi == len(groups) - 1 else min(total, int(start + span + WINDOW_MARGIN / FRAME))
        got = align_block(em, start, end, [verses[k] for k in g])
        for k, r in zip(g, got):
            out[k] = r
        ends = [r[1] for r in got if r[1] is not None]
        if ends:
            start = max(0, max(ends) - int(0.3 / FRAME))
        left_chars -= g_chars
    return out


def checks(rows):
    """A chapter's reasons to doubt it (an empty list: trusted), from its
    verses' (v, letters, start, end, score); frames."""
    reasons = []
    doubted = 0
    last = -1
    for v, n, st, e, sc in rows:
        if not n:
            continue
        if st is None:
            reasons.append("%d: not found" % v)
            continue
        if st <= last:
            reasons.append("%d: starts before the one before" % v)
        last = st
        dur = (e - st) * FRAME
        if dur < MIN_SECONDS:
            reasons.append("%d: %.2f s" % (v, dur))
        rate = n / max(dur, 0.01)
        # (A very short verse may be said quickly or slowly: only the long
        # ones' rates are judged.)
        if n >= 20 and (rate < RATE_MIN or rate > RATE_MAX):
            reasons.append("%d: %.1f letters/s" % (v, rate))
        if sc is not None and sc < SCORE_MIN:
            doubted += 1
    if doubted > DOUBTED_MAX:
        reasons.append("%d verses below the score" % doubted)
    return reasons


def rows_of(vl, got):
    return [(v, len(t.replace("|", "")), st, e, sc) for (v, t), (st, e, sc) in zip(vl, got)]


def starts_line(book, c, verses, got, centis, size, flag):
    """The chapter's line (§12.2.1): verses 1..N's starts (verse 0, a
    psalm's title, is before verse 1 and not counted), then the end."""
    nums = []
    if flag != "missing":
        vs = [(v, t, r) for (v, t), r in zip(verses, got) if v > 0]
        starts = []
        end = None
        for v, t, (s, e, sc) in vs:
            starts.append(s)
            if e is not None:
                end = e
        # (An empty verse, such as one the BSB leaves out, starts where the
        # next does: it is never washed.)
        nxt = end
        for i in range(len(starts) - 1, -1, -1):
            if starts[i] is None:
                starts[i] = nxt
            nxt = starts[i]
        cs = [int(round(f * FRAME * 100)) for f in starts] + [int(round(end * FRAME * 100))]
        prev = 0
        for i, x in enumerate(cs):
            nums.append(x if i == 0 else x - prev)
            prev = x
    return "%s\t%d\t%d\t%d\t%s%s" % (book, c, centis, size, flag,
                                     "\t" + " ".join(str(n) for n in nums) if nums else "")


def align_file(reader, path, book, c, verses, spot_seed=None):
    """One chapter: its line's parts and details."""
    wave = decode(path)
    seconds = len(wave) / 16000
    em = emissions(wave)
    vl = verse_letters(reader, verses)
    got = align_chapter(em, vl)
    reasons = checks(rows_of(vl, got))
    detail = {"reader": reader, "book": book, "c": c, "seconds": round(seconds, 2),
              "verses": [[v, n, st, e, None if sc is None else round(sc, 3)]
                         for v, n, st, e, sc in rows_of(vl, got)],
              "reasons": reasons, "spots": []}
    # Spot transcriptions: about 300 verses a reader, cut at their timings.
    rnd = random.Random("%s %s %d" % (reader, book, c))
    import torch
    for (v, text), (s, e, sc) in zip(vl, got):
        if v == 0 or not text or s is None or rnd.random() >= SPOT_SHARE:
            continue
        cut = wave[int(s * 320):int(e * 320) + 160]
        if len(cut) < 800:
            continue
        m, _ = model()
        with torch.inference_mode():
            ce, _ = m(torch.from_numpy(cut.copy()).unsqueeze(0))
        heard = greedy(torch.log_softmax(ce[0], dim=-1))
        detail["spots"].append([v, round(cer(text.replace("|", " "), heard), 3), heard])
    return seconds, vl, got, reasons, detail


# ---- `try` ----

def chapter_verses(reader, book, c):
    order, chapters = spoken_lines(READERS[reader]["text"])
    return chapters[(book, c)]


def cmd_try(args):
    show_letters = "--letters" in args
    args = [a for a in args if a != "--letters"]
    reader, path, book, c = args[0], args[1], args[2], int(args[3])
    verses = chapter_verses(reader, book, c)
    t0 = time.time()
    seconds, vl, got, reasons, detail = align_file(reader, path, book, c, verses)
    print("%s %s %d: %.1f s of audio in %.1f s" % (reader, book, c, seconds, time.time() - t0))
    for (v, text), (s, e, sc) in zip(vl, got):
        if s is None:
            print("%4d  (none)" % v)
            continue
        n = len(text.replace("|", ""))
        dur = (e - s) * FRAME
        print("%4d %8.2f %8.2f %6.2f %5.1f/s  %s" % (v, s * FRAME, e * FRAME,
                                                      sc if sc is not None else 0, n / max(dur, .01),
                                                      text[:50]))
    for v, er, heard in detail["spots"]:
        print("spot %d: CER %.2f  %s" % (v, er, heard[:70]))
    print("flag:", "chapter (%s)" % "; ".join(reasons) if reasons else "ok")


# ---- `run` ----

def openbible_name(reader, book, c):
    b = BOOKS.index(book)
    return "BSB_%02d_%s_%03d%s.mp3" % (b + 1, ABBRS[b], c, READERS[reader]["suffix"])


def henson_paths():
    out = {}
    for line in open(os.path.join(DATA, "audio", "henson.paths"), encoding="utf-8"):
        f = line.rstrip("\n").split("\t")
        out[(f[0], int(f[1]))] = f[2].split(" ")
    return out


def done_chapters(reader):
    p = os.path.join(WORK, reader + ".tim.partial")
    done = set()
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            f = line.split("\t")
            done.add((f[0], int(f[1])))
    return done


def curl(url, dest):
    """A file fetched (resumed with -C -), politely; True if it came."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    part = dest + ".part"
    for attempt in range(6):
        r = subprocess.run(["curl", "-sS", "-f", "-L", "-A", AGENT, "-C", "-", "--retry", "3",
                            "--retry-delay", "30", "-o", part, url])
        if r.returncode == 0:
            os.replace(part, dest)
            return True
        # (33: the server does not resume; start again.)
        if r.returncode == 33 and os.path.exists(part):
            os.remove(part)
        log("fetch %s failed (curl %d); waiting %d s" % (url, r.returncode, 60 * (attempt + 1)))
        time.sleep(60 * (attempt + 1))
    return False


def unzip_into(zpath, dest):
    """A downloaded archive into its own new, empty directory."""
    if os.path.exists(dest):
        shutil.rmtree(dest)
    os.makedirs(dest)
    subprocess.run(["unzip", "-q", "-o", zpath, "-d", dest], check=True)


def find_files(root):
    out = {}
    for d, _, files in os.walk(root):
        for f in files:
            out[f] = os.path.join(d, f)
    return out


def worker_init(threads):
    import torch
    torch.set_num_threads(threads)
    os.nice(19) if os.getpriority(os.PRIO_PROCESS, 0) < 19 else None
    model()


def worker_task(job):
    reader, key, paths, verses = job
    book, c = key
    best = None
    for path in paths:
        try:
            r = align_file(reader, path, book, c, verses)
        except Exception as e:  # noqa: BLE001 (a chapter's failure is logged, not fatal)
            return reader, key, None, "%s: %r" % (os.path.basename(path), e)
        sc = [x[2] for x in r[2] if x[2] is not None]
        mean = sum(sc) / len(sc) if sc else -99
        if best is None or mean > best[0]:
            best = (mean, path, r)
    _, path, (seconds, vl, got, reasons, detail) = best
    detail["path"] = os.path.basename(path)
    flag = "chapter" if reasons else "ok"
    line = starts_line(book, c, vl, got, int(round(seconds * 100)), os.path.getsize(path), flag)
    return reader, key, (line, detail, paths), None


def cmd_run(args):
    import multiprocessing as mp
    jobs = 2
    threads = 2
    readers = []
    i = 0
    while i < len(args):
        if args[i] == "--jobs":
            jobs = int(args[i + 1])
            i += 2
        elif args[i] == "--threads":
            threads = int(args[i + 1])
            i += 2
        else:
            readers.append(args[i])
            i += 1
    readers = readers or ["souer", "hays", "henson", "gilbert"]
    texts = {}
    for t in ("bsb", "web"):
        texts[t] = spoken_lines(t)
    todo = {r: [k for k in texts[READERS[r]["text"]][0] if k not in done_chapters(r)]
            for r in readers}
    for r in readers:
        log("%s: %d chapters to align" % (r, len(todo[r])))
    ready = queue.Queue(maxsize=0)
    pending = {"n": 0}
    lock = threading.Lock()
    downloads_done = threading.Event()
    hp = henson_paths() if "henson" in readers else {}

    def fetcher():
        for r in readers:
            want = set(todo[r])
            if not want:
                continue
            cfg = READERS[r]
            root = os.path.join(AUDIO, r)
            for z in cfg["zips"]:
                # (The zip's chapters, if any is still wanted.)
                zip_dir = os.path.join(root, z[:-4])
                marker = zip_dir + ".unzipped"
                if not os.path.exists(marker):
                    zpath = os.path.join(AUDIO, "dl", z)
                    if not os.path.exists(zpath):
                        log("fetching %s%s" % (cfg["base"], z))
                        if not curl(cfg["base"] + z, zpath):
                            log("could not fetch %s" % z)
                            continue
                    log("unzipping %s" % z)
                    unzip_into(zpath, zip_dir)
                    os.remove(zpath)
                    open(marker, "w").close()
                files = find_files(zip_dir)
                for key in sorted(want, key=texts[cfg["text"]][0].index):
                    if r == "henson":
                        names = [urllib.parse.unquote(p.split("/")[-1]) for p in hp[key]]
                    else:
                        names = [openbible_name(r, *key)]
                    paths = [files[n] for n in names if n in files]
                    if paths:
                        ready.put((r, key, paths))
                        want.discard(key)
                time.sleep(1)
            # The rest a file at a time (Gilbert has no chapter zip), not too far ahead.
            for key in sorted(want, key=texts[cfg["text"]][0].index):
                while True:
                    with lock:
                        if pending["n"] < 24:
                            break
                    time.sleep(2)
                if r == "henson":
                    urls = [cfg["base"] + p for p in hp[key]]
                else:
                    urls = [cfg["base"] + openbible_name(r, *key)]
                paths = []
                for u in urls:
                    dest = os.path.join(root, "files", urllib.parse.unquote(u.split("/")[-1]))
                    if os.path.exists(dest) or curl(u, dest):
                        paths.append(dest)
                    time.sleep(1)
                if paths:
                    ready.put((r, key, paths))
                else:
                    log("%s %s %d: no audio" % (r, key[0], key[1]))
        downloads_done.set()

    th = threading.Thread(target=fetcher, daemon=True)
    th.start()
    ctx = mp.get_context("spawn")
    pool = ctx.Pool(jobs, initializer=worker_init, initargs=(threads,))
    inflight = 0
    started = time.time()
    count = 0
    results = queue.Queue()

    def collect(res):
        results.put(res)

    while True:
        # Feed the workers, a few ahead.
        while inflight < jobs * 2:
            try:
                r, key, paths = ready.get(timeout=0.5)
            except queue.Empty:
                break
            verses = texts[READERS[r]["text"]][1][key]
            pool.apply_async(worker_task, ((r, key, paths, verses),), callback=collect,
                             error_callback=lambda e: results.put((None, None, None, repr(e))))
            inflight += 1
            with lock:
                pending["n"] += 1
        try:
            r, key, out, err = results.get(timeout=1)
        except queue.Empty:
            if downloads_done.is_set() and inflight == 0 and ready.empty():
                break
            continue
        inflight -= 1
        with lock:
            pending["n"] -= 1
        if err:
            log("%s %s: failed: %s" % (r, key, err))
            continue
        line, detail, paths = out
        with open(os.path.join(WORK, r + ".tim.partial"), "a", encoding="utf-8") as f:
            f.write(line + "\n")
        with open(os.path.join(WORK, r + ".detail.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(detail) + "\n")
        for p in paths:
            if p.startswith(AUDIO):
                os.remove(p)
        count += 1
        flag = line.split("\t")[4]
        log("%s %s %d %s (%.0f s audio; %d done, %.1f h)" % (
            r, key[0], key[1], flag + (" " + "; ".join(detail["reasons"])[:120] if flag != "ok" else ""),
            detail["seconds"], count, (time.time() - started) / 3600))
    pool.close()
    pool.join()
    log("run: done")


# ---- `finish` ----

def sizes_of(reader):
    """Each chapter's file size, from what was listed: the zips' central
    directories (their last bytes, kept in AUDIO/listings), eBible.org's
    listing (henson.paths), else openbible.com's directory listing (sizes
    to a tenth of a megabyte)."""
    import struct
    out = {}
    listings = os.path.join(AUDIO, "listings")
    if reader == "henson":
        for line in open(os.path.join(DATA, "audio", "henson.paths"), encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            out[(f[0], int(f[1]))] = int(f[3])
        return out
    by_name = {}
    order, _ = spoken_lines("bsb")
    for key in order:
        by_name[openbible_name(reader, *key)] = key
    for z in READERS[reader]["zips"]:
        p = os.path.join(listings, z + ".tail")
        if not os.path.exists(p):
            continue
        b = open(p, "rb").read()
        for m in re.finditer(b"PK\x01\x02", b):
            i = m.start()
            if i + 46 > len(b):
                continue
            us = struct.unpack("<I", b[i + 24:i + 28])[0]
            fnl = struct.unpack("<H", b[i + 28:i + 30])[0]
            name = b[i + 46:i + 46 + fnl].decode("utf-8", "replace").split("/")[-1]
            if name in by_name:
                out[by_name[name]] = us
    p = os.path.join(listings, "openbible-%s.html" % reader)
    if os.path.exists(p):
        for m in re.finditer(r'href="([^"]+\.mp3)".*?align="right">\s*([\d.]+)([KMG])<', open(p).read()):
            key = by_name.get(m.group(1))
            if key and key not in out:
                mult = {"K": 1024, "M": 1048576, "G": 1073741824}[m.group(3)]
                out[key] = int(float(m.group(2)) * mult)
    return out


def read_partial(reader):
    lines = {}
    p = os.path.join(WORK, reader + ".tim.partial")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            f = line.rstrip("\n").split("\t")
            lines[(f[0], int(f[1]))] = f
    details = {}
    p = os.path.join(WORK, reader + ".detail.jsonl")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            d = json.loads(line)
            details[(d["book"], d["c"])] = d
    return lines, details


def shares(fields):
    nums = [int(x) for x in fields[5].split()] if len(fields) > 5 else []
    if not nums:
        return None
    abs_ = []
    acc = 0
    for i, n in enumerate(nums):
        acc = n if i == 0 else acc + n
        abs_.append(acc)
    speech = abs_[-1] - abs_[0]
    if speech <= 0:
        return None
    durs = [abs_[i + 1] - abs_[i] for i in range(len(abs_) - 1)]
    return [d / speech for d in durs], speech / 100


def cmd_finish(args):
    made = time.strftime("%Y-%m-%d")
    out_dir = os.path.join(DATA, "audio")
    os.makedirs(out_dir, exist_ok=True)
    texts = {t: spoken_lines(t) for t in ("bsb", "web")}
    parts = {r: read_partial(r) for r in READERS}
    # Across readers: the three BSB readers' shares of each chapter.
    cross = {r: {} for r in BSB_READERS}
    for key in texts["bsb"][0]:
        got = {}
        for r in BSB_READERS:
            f = parts[r][0].get(key)
            if f and f[4] == "ok":
                s = shares(f)
                if s:
                    got[r] = s
        if len(got) < 3:
            continue
        for v in range(len(next(iter(got.values()))[0])):
            dev = {}
            for r in got:
                others = sorted(got[o][0][v] for o in got if o != r)
                med = sum(others) / len(others)
                mine = got[r][0][v]
                off = abs(mine - med)
                if med > 0 and off / med > SHARE_OFF and off * got[r][1] > SHARE_SECONDS:
                    dev[r] = off
            if dev:
                worst = max(dev, key=dev.get)
                cross[worst].setdefault(key, []).append(v + 1)
    report = []
    for r, cfg in READERS.items():
        lines, details = parts[r]
        order = texts[cfg["text"]][0]
        flagged = []
        missing = []
        out = []
        sizes = sizes_of(r)
        for key in order:
            f = lines.get(key)
            if f is None:
                # (Not aligned yet: its recording is there, followed by
                # chapter; missing only if there is no file at all.)
                missing.append(key)
                if key in sizes:
                    out.append("%s\t%d\t0\t%d\tchapter" % (key[0], key[1], sizes[key]))
                else:
                    out.append("%s\t%d\t0\t0\tmissing" % key)
                continue
            d = details.get(key)
            if d:
                # (The checks again, with the limits as they are now.)
                d["reasons"] = checks([tuple(x) for x in d["verses"]])
                f = f[:4] + ["chapter" if d["reasons"] else "ok"] + f[5:]
            if f[4] == "ok" and key in cross.get(r, {}):
                f = f[:4] + ["chapter"] + f[5:]
                details.get(key, {}).setdefault("reasons", []).append(
                    "verses %s far from the other readers'" % cross[r][key][:5])
            if f[4] == "chapter":
                flagged.append(key)
            out.append("\t".join(f))
        base = cfg["base"]
        with open(os.path.join(out_dir, r + ".tim"), "w", encoding="utf-8") as fh:
            fh.write("# smooth-bible timings %d · %s · %s · %s · made %s · align.py %d "
                     "· %s\n" % (1, r, cfg["text"].upper(), base, made, VERSION, MODEL))
            fh.write("\n".join(out) + "\n")
        spots = [s for d in details.values() for s in d.get("spots", [])]
        mean_cer = sum(s[1] for s in spots) / len(spots) if spots else float("nan")
        report.append("%s: %d aligned, %d flagged chapter (%.2f%%), %d not aligned; CER %.3f over %d spot verses"
                      % (r, len(order) - len(missing), len(flagged),
                         100 * len(flagged) / max(1, len(order) - len(missing)), len(missing), mean_cer,
                         len(spots)))
        for key in flagged[:40]:
            d = details.get(key, {})
            report.append("  %s %d: %s" % (key[0], key[1], "; ".join(d.get("reasons", []))[:150]))
        for s in spots:
            if s[1] > 0.25:
                report.append("  look: spot CER %.2f" % s[1])
        if r == "henson":
            # (The duplicates: the path aligned best kept, in the bundled paths.)
            hp_path = os.path.join(out_dir, "henson.paths")
            rows = [l.rstrip("\n").split("\t") for l in open(hp_path, encoding="utf-8")]
            for row in rows:
                d = details.get((row[0], int(row[1])))
                ps = row[2].split(" ")
                if len(ps) > 1 and d and d.get("path"):
                    for p in ps:
                        if urllib.parse.unquote(p.split("/")[-1]) == d["path"]:
                            row[2] = p
            with open(hp_path, "w", encoding="utf-8") as fh:
                fh.write("".join("\t".join(row) + "\n" for row in rows))
    print("\n".join(report))


# ---- --check ----

def cmd_check(args):
    import email.utils
    import urllib.request
    readers = args or list(READERS)
    for r in readers:
        p = os.path.join(DATA, "audio", r + ".tim")
        if not os.path.exists(p):
            continue
        lines = open(p, encoding="utf-8").read().split("\n")
        m = re.search(r"made (\d{4}-\d\d-\d\d)", lines[0])
        made = time.mktime(time.strptime(m.group(1), "%Y-%m-%d")) if m else 0
        hp = henson_paths() if r == "henson" else {}
        changed = []
        for line in lines[1:]:
            if not line:
                continue
            f = line.split("\t")
            key = (f[0], int(f[1]))
            url = READERS[r]["base"] + (hp[key][0] if r == "henson" else openbible_name(r, *key))
            req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": AGENT})
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    size = int(resp.headers.get("Content-Length", "0"))
                    lm = resp.headers.get("Last-Modified")
            except Exception as e:  # noqa: BLE001
                changed.append("%s %d: %r" % (key[0], key[1], e))
                time.sleep(1)
                continue
            when = email.utils.parsedate_to_datetime(lm).timestamp() if lm else 0
            if size != int(f[3]) or when > made:
                changed.append("%s %d: %d bytes (was %s), modified %s" % (key[0], key[1], size, f[3], lm))
            time.sleep(1)
        print("%s: %d changed" % (r, len(changed)))
        for c in changed:
            print("  " + c)


def main():
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    if a[0] == "try":
        cmd_try(a[1:])
    elif a[0] == "run":
        cmd_run(a[1:])
    elif a[0] == "finish":
        cmd_finish(a[1:])
    elif a[0] == "--check":
        cmd_check(a[1:])
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
