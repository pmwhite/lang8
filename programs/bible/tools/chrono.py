#!/usr/bin/env python3
"""The Chronological plan (DESIGN.md §16.4.4): the whole Bible in the order
the events happened, balanced into 365 days.

    python3 -I chrono.py DATA
    python3 -I chrono.py --check DATA

It reads DATA/plans/chrono-order.txt, our own order, which follows George
Townsend's The Old Testament arranged in historical and chronological order
(1821; Boston ed. 1838) and The New Testament arranged in chronological and
historical order (1825; ed. 1837), and A. T. Robertson's A Harmony of the
Gospels for Students of the Life of Christ (1922), all public domain; the
file cites them (archive.org, with the sha256 of what was consulted) and notes
every departure. Each line of it is a block: a passage (GEN 12, GEN 12-14,
MAT 4:1-11, MAT 26:57-27:10, MAT 4:12), or parallel passages joined by "|"
to be read together (2SA 5:1-10 | 1CH 11:1-9); "#" starts a comment.
Standard library only.

It checks that every verse of DATA/bsb.txt is in the order exactly once
(printing any gap or overlap, and then exiting 1 without writing), and
balances the blocks into 365 days by characters (the T and W text of
bsb.txt, as §10.1.1): a block longer than 1.6 days' mean is split at its
chapter boundaries (parallels in one block are never split), and the days
end at block boundaries. A day may read at most 6 passages (consecutive
passages contiguous in one book are one) and at most 2.2 times the mean.

Within those limits the days' ends are chosen together to make the days as
even as they can be (each day's distance from the mean: the least sum of the
squares of their lengths, by dynamic programming over the blocks, each block
kept whole). A day of the Gospels reads its sections a Gospel at a time:
Matthew's parts of them, then Mark's, Luke's and John's, each in the
harmony's order and run together where they follow on (day_spans), so that a
day of several sections is four passages or so rather than four a section,
and the Gospels' 39 days' mean of words take about 40 days (review s16-1,
Minor 1; read a section at a time, 6 passages a day held them to 69 short
days). A day can still be short where the harmony takes two Gospels out of
their own order, so that no neighbour joins it within 6 passages (day 311,
the foretelling of Peter's denial, between the supper's two parts).

It writes DATA/plans/chrono.txt (§16.4.2's format) and prints a summary
(blocks, verses, characters, the mean day, the longest and shortest days,
the most passages in a day) for the commit. With --check DATA it checks the
order's coverage and that chrono.txt is exactly what it would write, and
exits 1 with a message otherwise.
"""
import os
import re
import sys

DAYS = 365
SPLIT = 1.6       # a block longer than this many days' mean is split at chapters
LONGEST = 2.2     # no day longer than this many times the mean
MOST = 6          # passages a day
HEADER = (
    "# Chronological (our own order, from George Townsend's arrangements, 1821 and 1825, "
    "and A. T. Robertson's Harmony of the Gospels, 1922; public domain).\n"
    "# Made by tools/chrono.py from data/plans/chrono-order.txt.\n"
    "@id\tchrono\n"
    "@name\tChronological\n"
    "@blurb\tThe whole Bible in the order the events happened: the prophets with their kings, "
    "the psalms with their occasions, the Gospels side by side, the letters where Acts places them.\n")
PASSAGE = re.compile(r"^([1-3]?[A-Z]{2,3}) (\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$")


class Bible:
    """The BSB's verses in order, with their characters."""

    def __init__(self, path):
        self.books = []        # codes in order
        self.chapters = {}     # code -> [[verse numbers] per chapter, from chapter 1]
        self.chars = []        # per verse, in order
        self.index = {}        # (code, c, v) -> position in order
        self.refs = []         # position -> (code, c, v)
        book = None
        for line in open(path, encoding="utf-8"):
            line = line.rstrip("\n")
            kind = line[:1]
            if kind == "B":
                book = line[1:].split(" ", 1)[0]
                self.books.append(book)
                self.chapters[book] = []
            elif kind == "C":
                if int(line[1:]) != len(self.chapters[book]) + 1:
                    sys.exit("bsb.txt: %s chapter %s out of order" % (book, line[1:]))
                self.chapters[book].append([])
            elif kind == "V":
                v = int(line[1:].split(">", 1)[0])
                c = len(self.chapters[book])
                self.chapters[book][-1].append(v)
                self.index[(book, c, v)] = len(self.refs)
                self.refs.append((book, c, v))
                self.chars.append(0)
            elif kind in "TW" and self.chars:
                self.chars[-1] += len(line) - 1
        self.cum = [0]
        for n in self.chars:
            self.cum.append(self.cum[-1] + n)

    def span(self, text):
        """A passage's (first, last) positions; ValueError if it isn't one."""
        m = PASSAGE.match(text.strip())
        if not m or m.group(1) not in self.chapters:
            raise ValueError("not a passage: %r" % text)
        book, c1, v1, x, v2 = m.group(1), int(m.group(2)), m.group(3), m.group(4), m.group(5)
        chs = self.chapters[book]
        if v1 is None:                                   # BOOK C or BOOK C-C2
            if v2 is not None:
                raise ValueError("not a passage: %r" % text)
            c2 = int(x) if x else c1
            v1, v2 = None, None
        elif v2 is not None:                             # BOOK C:V-C2:V2
            c2, v1, v2 = int(x), int(v1), int(v2)
        else:                                            # BOOK C:V-V2 or BOOK C:V
            c2, v1 = c1, int(v1)
            v2 = int(x) if x else v1
        if not (1 <= c1 <= c2 <= len(chs)):
            raise ValueError("%s: no such chapters in %s" % (text, book))
        if v1 is None:
            v1, v2 = chs[c1 - 1][0], chs[c2 - 1][-1]
        if v1 > chs[c1 - 1][-1] or v2 > chs[c2 - 1][-1]:
            raise ValueError("%s: a verse past the chapter's end" % text)
        # The first verse present at or after (c1, v1), the last at or before (c2, v2).
        first = next((v for v in chs[c1 - 1] if v >= v1), None)
        last = next((v for v in reversed(chs[c2 - 1]) if v <= v2), None)
        if first is None or last is None:
            raise ValueError("%s: no verses" % text)
        a, b = self.index[(book, c1, first)], self.index[(book, c2, last)]
        if a > b:
            raise ValueError("%s: ends before it begins" % text)
        return a, b

    def label(self, a, b):
        """A passage's text, whole chapters by chapter only."""
        book, c1, v1 = self.refs[a]
        _, c2, v2 = self.refs[b]
        chs = self.chapters[book]
        if v1 == chs[c1 - 1][0] and v2 == chs[c2 - 1][-1]:
            return "%s %d" % (book, c1) if c1 == c2 else "%s %d-%d" % (book, c1, c2)
        if c1 == c2:
            return "%s %d:%d" % (book, c1, v1) if v1 == v2 else "%s %d:%d-%d" % (book, c1, v1, v2)
        return "%s %d:%d-%d:%d" % (book, c1, v1, c2, v2)

    def size(self, a, b):
        return self.cum[b + 1] - self.cum[a]


def merge(spans, bible):
    """Consecutive spans contiguous in one book made one."""
    out = []
    for a, b in spans:
        if out and out[-1][1] + 1 == a and bible.refs[a][0] == bible.refs[out[-1][1]][0]:
            out[-1] = (out[-1][0], b)
        else:
            out.append((a, b))
    return out


GOSPELS = ("MAT", "MRK", "LUK", "JHN")


def day_spans(blocks, bible):
    """A day's passages from its blocks, in order: the Gospels' parallels of
    its sections read a Gospel at a time (Matthew's parts of the day's
    sections, then Mark's, Luke's, John's, each in the harmony's order, run
    together where they follow on), then contiguous passages in one book
    made one."""
    out, run = [], []

    def flush():
        for book in GOSPELS:
            out.extend(s for s in run if bible.refs[s[0]][0] == book)
        run.clear()
    for _, spans in blocks:
        if all(bible.refs[a][0] in GOSPELS for a, b in spans):
            run.extend(spans)
        else:
            flush()
            out.extend(spans)
    flush()
    return merge(out, bible)


def read_order(path, bible):
    """The order's blocks, each a list of spans, and a list of problems."""
    blocks, bad = [], []
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        text = line.split("#", 1)[0].strip()
        if not text:
            continue
        spans = []
        for part in text.split("|"):
            try:
                spans.append(bible.span(part))
            except ValueError as e:
                bad.append("chrono-order.txt:%d: %s" % (n, e))
        if spans:
            blocks.append((n, spans))
    return blocks, bad


def coverage(blocks, bible):
    """Gaps and overlaps, as printable lines."""
    count = [0] * len(bible.refs)
    for _, spans in blocks:
        for a, b in spans:
            for i in range(a, b + 1):
                count[i] += 1
    out = []
    i = 0
    while i < len(count):
        if count[i] == 1:
            i += 1
            continue
        j = i
        while (j + 1 < len(count) and count[j + 1] == count[i]
               and bible.refs[j + 1][0] == bible.refs[i][0]):
            j += 1
        what = "gap" if count[i] == 0 else "overlap (%d times)" % count[i]
        out.append("%s: %s" % (what, bible.label(i, j)))
        i = j + 1
    return out


def split(blocks, bible, mean):
    """Blocks of one passage longer than SPLIT days' mean, cut at chapters."""
    out = []
    for n, spans in blocks:
        if len(spans) == 1 and bible.size(*spans[0]) > SPLIT * mean:
            a, b = spans[0]
            start = a
            for i in range(a + 1, b + 1):
                if bible.refs[i][1] != bible.refs[i - 1][1]:
                    out.append((n, [(start, i - 1)]))
                    start = i
            out.append((n, [(start, b)]))
        else:
            out.append((n, merge(spans, bible)))
    return out


def balance(blocks, bible, total):
    """Each day's last block (exclusive), or None with a reason."""
    mean = total / DAYS
    nb = len(blocks)
    cum = [0]
    for _, spans in blocks:
        cum.append(cum[-1] + sum(bible.size(a, b) for a, b in spans))
    # reach[i]: the ends j > i a day starting at boundary i may have (its
    # passages counted as day_spans reads them).
    reach = []
    for i in range(nb):
        ends = []
        for j in range(i + 1, nb + 1):
            if cum[j] - cum[i] > LONGEST * mean and j > i + 1:
                break
            if len(day_spans(blocks[i:j], bible)) > MOST:
                if j > i + 1 and len(day_spans(blocks[i:j], bible)) > MOST + 8:
                    break
                continue
            ends.append(j)
        reach.append(ends)
    # Each day's cost is its length squared (the total is fixed, so that is the
    # spread about the mean); ends further than 60 days' mean from total*d/365
    # are not considered, to keep it quick.
    window = 60 * mean
    best = {0: (0, None)}
    back = []
    for d in range(1, DAYS + 1):
        target = total * d / DAYS
        nxt = {}
        for i, (cost, _) in best.items():
            for j in reach[i] if i < nb else ():
                if abs(cum[j] - target) > window or (d < DAYS and j == nb) or (d == DAYS and j != nb):
                    continue
                c = cost + (cum[j] - cum[i]) ** 2
                if j not in nxt or c < nxt[j][0]:
                    nxt[j] = (c, i)
        if not nxt:
            return None, "no way to make day %d within %d passages and %.1f times the mean" % (d, MOST, LONGEST)
        back.append(nxt)
        best = nxt
    ends, j = [], nb
    for d in range(DAYS, 0, -1):
        ends.append(j)
        j = back[d - 1][j][1]
    return ends[::-1], None


def make_days(data):
    """(days, summary lines) or (None, problems)."""
    bible = Bible(os.path.join(data, "bsb.txt"))
    blocks, bad = read_order(os.path.join(data, "plans", "chrono-order.txt"), bible)
    if bad:
        return None, bad
    problems = coverage(blocks, bible)
    if problems:
        return None, problems
    total = bible.cum[-1]
    mean = total / DAYS
    pieces = split(blocks, bible, mean)
    ends, why = balance(pieces, bible, total)
    if ends is None:
        return None, [why]
    days, start = [], 0
    for end in ends:
        days.append(day_spans(pieces[start:end], bible))
        start = end
    sizes = [sum(bible.size(a, b) for a, b in day) for day in days]
    over = [d + 1 for d in range(DAYS) if sizes[d] > LONGEST * mean]
    if over:
        return None, ["day %d is over %.1f times the mean (a block that can't be split)" % (d, LONGEST)
                      for d in over]
    lead, done = [], 0
    for d in range(DAYS):
        done += sizes[d]
        lead.append((done - total * (d + 1) / DAYS) / mean)
    gospels = [d for d in range(DAYS) if any(bible.refs[a][0] in ("MAT", "MRK", "LUK", "JHN") for a, b in days[d])]
    longest = max(range(DAYS), key=lambda d: sizes[d])
    shortest = min(range(DAYS), key=lambda d: sizes[d])
    most = max(len(day) for day in days)

    def show(d):
        return "day %d, %.2f of the mean (%s)" % (d + 1, sizes[d] / mean,
                                                  "; ".join(bible.label(a, b) for a, b in days[d]))
    summary = [
        "chrono-order.txt: %d blocks (%d after splitting long ones at chapters)" % (len(blocks), len(pieces)),
        "verses: %d, each once" % len(bible.refs),
        "characters: %d; mean day %.0f" % (total, mean),
        "longest: " + show(longest),
        "shortest: " + show(shortest),
        "days over 1.5 times the mean: %d; under half: %d" % (
            sum(s > 1.5 * mean for s in sizes), sum(s < 0.5 * mean for s in sizes)),
        "most passages in a day: %d (%d days)" % (most, sum(len(day) == most for day in days)),
        "the Gospels: days %d-%d (%d days), %.2f of the mean a day" % (
            gospels[0] + 1, gospels[-1] + 1, len(gospels),
            sum(sizes[d] for d in gospels) / len(gospels) / mean),
        "the days' ends against total*d/365: at most %.1f days' mean ahead (day %d), %.1f behind (day %d)" % (
            max(lead), lead.index(max(lead)) + 1, -min(lead), lead.index(min(lead)) + 1),
    ]
    text = HEADER + "".join(
        "%d\t%s\n" % (d + 1, "\t".join(bible.label(a, b) for a, b in day)) for d, day in enumerate(days))
    return text, summary


def main():
    check = len(sys.argv) == 3 and sys.argv[1] == "--check"
    if not check and len(sys.argv) != 2:
        sys.exit(__doc__)
    data = sys.argv[-1]
    text, lines = make_days(data)
    for line in lines:
        print(line)
    if text is None:
        sys.exit(1)
    out = os.path.join(data, "plans", "chrono.txt")
    if check:
        have = open(out, encoding="utf-8").read() if os.path.exists(out) else None
        if have != text:
            sys.exit("FAILED: %s is not what tools/chrono.py makes from chrono-order.txt" % out)
        print("chrono.txt: as made")
        return
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote " + out)


if __name__ == "__main__":
    main()
