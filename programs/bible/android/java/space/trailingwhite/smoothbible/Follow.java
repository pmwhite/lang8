package space.trailingwhite.smoothbible;

import java.util.OptionalDouble;

// Following, frame by frame (SKINS.md, Panes: Linked): where the follower's
// reading line goes for the leader's, by a chapter's link map and the two
// panes' own geometry. A port of core/follow.l8, the rules every skin
// follows by; tests/FollowCheck.java checks it against the cases
// programs/bible/tools/link_cases.l8 writes from them (make
// bible-follow-test). Nothing here knows Android: positions are numbers
// down each pane's own content, in its own unit.
final class Follow {
  private Follow() {}

  // How a chapter's anchors go with the other pane's (`link C MODE`):
  // verse by verse (two versions), or comment by comment (a commentary in
  // either).
  static final int BY_VERSE = 0, BY_COMMENT = 1;

  // A chapter's link map (core's `link C MODE` and its `match I0 I1 J`
  // lines): the page's anchors i0[k] to i1[k] go with the panel's anchor
  // j[k], in order.
  static final class LinkMap {
    final int mode;
    final int[] i0, i1, j;

    LinkMap(int mode, int[] i0, int[] i1, int[] j) {
      if (i0.length != j.length || i1.length != j.length)
        throw new IllegalArgumentException("a link map's matches have three numbers each");
      this.mode = mode;
      this.i0 = i0;
      this.i1 = i1;
      this.j = j;
    }
  }

  // One pane's chapter as it is laid out: where each of its anchors begins
  // (known[i]: whether it is laid out), where the chapter begins and ends
  // (each, known or not), and its em.
  static final class ChapterShape {
    final double[] starts;
    final boolean[] known;
    final double top, end, em;
    final boolean topKnown, endKnown;

    ChapterShape(double[] starts, boolean[] known, double top, boolean topKnown, double end,
        boolean endKnown, double em) {
      if (starts.length != known.length)
        throw new IllegalArgumentException("each anchor's start is known or not");
      this.starts = starts;
      this.known = known;
      this.top = top;
      this.topKnown = topKnown;
      this.end = end;
      this.endKnown = endKnown;
      this.em = em;
    }
  }

  // The pairs a version follows by: the leader's (x) and the follower's (y)
  // positions of each matched pair's first anchors, the chapter's top and
  // its end, in order and each going forward on both sides (one that
  // doesn't, as a verse moved by versification, left out).
  static final class Pairs {
    final double[] x, y;
    int n;

    Pairs(int most) {
      x = new double[most];
      y = new double[most];
    }

    void add(double leader, double follower) {
      if (n > 0 && (leader <= x[n - 1] || follower < y[n - 1])) return;
      x[n] = leader;
      y[n] = follower;
      n++;
    }
  }

  // The pairs, the page leading (pageLeads) or the panel.
  static Pairs pairs(LinkMap map, ChapterShape page, ChapterShape panel, boolean pageLeads) {
    Pairs pairs = new Pairs(map.j.length + 2);
    ChapterShape leader = pageLeads ? page : panel, follower = pageLeads ? panel : page;
    if (page.topKnown && panel.topKnown) pairs.add(leader.top, follower.top);
    for (int k = 0; k < map.j.length; k++) {
      int a = map.i0[k], b = map.j[k];
      if (a >= 0 && a < page.known.length && b >= 0 && b < panel.known.length && page.known[a]
          && panel.known[b]) {
        if (pageLeads) pairs.add(page.starts[a], panel.starts[b]);
        else pairs.add(panel.starts[b], page.starts[a]);
      }
    }
    if (page.endKnown && panel.endKnown) pairs.add(leader.end, follower.end);
    return pairs;
  }

  // How many pairs either side of the leader's the steady line is fitted
  // through, how far (in the leader's em) a pair's weight halves and
  // more, and how far (in the follower's em) the follower may be from the
  // curve.
  static final int FIT_PAIRS = 5;
  static final double REACH_EM = 9, SLACK_EM = 0.5;

  // A version following, the leader's reading line at line (in the
  // leader's positions): through each pair, between them along a monotone
  // cubic (Fritsch and Carlson's, its slope at each pair the harmonic mean
  // of the ratios either side), then steadied: a line fitted through the
  // pairs about the leader's (weighted 1 / (1 + (x / 9 em))², x from the
  // line, em the leader's), the follower placed d / (1 + |d| / (0.5 em))
  // from the curve, d the line's distance from it, em the follower's.
  // Empty: it can't be told from what is laid out.
  static OptionalDouble byVerse(Pairs pairs, double line, double leaderEm, double followerEm) {
    int n = pairs.n;
    // (The pair at or before the line, with one after it.)
    int k = -1;
    for (int x = 0; x < n; x++) if (pairs.x[x] <= line) k = x;
    if (k < 0 || k + 1 >= n) return OptionalDouble.empty();
    double exact = curve(pairs, k, line);
    // (The steady line: weighted least squares, its value at the line.)
    double reach = leaderEm * REACH_EM;
    double sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    int from = Math.max(0, k - FIT_PAIRS), to = Math.min(n, k + FIT_PAIRS + 2);
    for (int x = from; x < to; x++) {
      double d = pairs.x[x] - line;
      double u = d / reach;
      double w = 1 / ((1 + u * u) * (1 + u * u));
      sw += w;
      sx += w * d;
      sy += w * pairs.y[x];
      sxx += w * d * d;
      sxy += w * d * pairs.y[x];
    }
    double det = sw * sxx - sx * sx;
    if (sw <= 0 || det <= 0.000001 * sw * sw) return OptionalDouble.of(exact);
    double slope = (sw * sxy - sx * sy) / det;
    if (slope <= 0) return OptionalDouble.of(exact);
    double steady = (sy - slope * sx) / sw;
    double slack = followerEm * SLACK_EM;
    double d = steady - exact;
    return OptionalDouble.of(exact + d / (1 + Math.abs(d) / slack));
  }

  // The monotone cubic between pairs k and k + 1, at line.
  private static double curve(Pairs pairs, int k, double line) {
    double x1 = pairs.x[k], x2 = pairs.x[k + 1], y1 = pairs.y[k], y2 = pairs.y[k + 1];
    double h = x2 - x1;
    double m = (y2 - y1) / h;
    double d1 = k > 0 ? mean(ratio(pairs, k - 1), m) : m;
    double d2 = k + 2 < pairs.n ? mean(m, ratio(pairs, k + 1)) : m;
    double t = (line - x1) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * y1 + (t3 - 2 * t2 + t) * h * d1 + (-2 * t3 + 3 * t2) * y2
        + (t3 - t2) * h * d2;
  }

  // The ratio of the follower's span to the leader's between pairs k and
  // k + 1.
  private static double ratio(Pairs pairs, int k) {
    return (pairs.y[k + 1] - pairs.y[k]) / (pairs.x[k + 1] - pairs.x[k]);
  }

  // The harmonic mean of two slopes (0 if either isn't forward).
  private static double mean(double a, double b) {
    return a <= 0 || b <= 0 ? 0 : 2 * a * b / (a + b);
  }

  // ---- by comment ----
  // What a follower moving by comment does: stays, or goes to an anchor of
  // its (-1: its chapter's top).
  static final class CommentStep {
    static final CommentStep STAY = new CommentStep(true, 0);
    final boolean stays;
    // (Only for one that goes.)
    final int anchor;

    private CommentStep(boolean stays, int anchor) {
      this.stays = stays;
      this.anchor = anchor;
    }

    static CommentStep goTo(int anchor) {
      return new CommentStep(false, anchor);
    }

    @Override
    public String toString() {
      return stays ? "stay" : "go " + anchor;
    }
  }

  // (Anchors not laid out come after every one that is, by how many
  // anchors away.)
  private static final double UNLAID = 1.0e12;

  // The page leading a commentary: the page's anchor at its reading line
  // (pageI, -1 above the first) and the commentary's at its own (panelJ,
  // -1 above the first): it stays while a comment there covers the page's
  // verse; else it goes to the comment covering it nearest its reading
  // line (by its laid-out starts; one not laid out, as far as its index is
  // from panelJ), or to its chapter's top above the page's first verse.
  static CommentStep commentFromPage(LinkMap map, int pageI, int panelJ, ChapterShape panel,
      double panelLine) {
    if (pageI < 0) return panelJ < 0 ? CommentStep.STAY : CommentStep.goTo(-1);
    if (covers(map, panelJ, pageI)) return CommentStep.STAY;
    int best = -1;
    double bestD = 0;
    for (int k = 0; k < map.j.length; k++) {
      int j = map.j[k];
      if (map.i0[k] <= pageI && pageI <= map.i1[k]) {
        double d = j < panel.known.length && panel.known[j] ? Math.abs(panel.starts[j] - panelLine)
            : UNLAID + Math.abs(j - panelJ);
        if (best < 0 || d < bestD) {
          best = j;
          bestD = d;
        }
      }
    }
    // (No comment on the verse: it stays where it is.)
    return best < 0 ? CommentStep.STAY : CommentStep.goTo(best);
  }

  // Whether the commentary's anchor j covers the page's anchor i.
  static boolean covers(LinkMap map, int j, int i) {
    if (j < 0) return false;
    for (int k = 0; k < map.j.length; k++) if (map.j[k] == j && map.i0[k] <= i && i <= map.i1[k]) return true;
    return false;
  }

  // A commentary leading the page: the commentary's anchor at its reading
  // line (panelJ, -1 above the first) and the page's at its own (pageI):
  // the page stays on a verse that comment covers; else it goes to the
  // first verse the comment covers (its chapter's top above the
  // commentary's first), and stays for a comment covering none.
  static CommentStep pageFromComment(LinkMap map, int panelJ, int pageI) {
    if (panelJ < 0) return pageI < 0 ? CommentStep.STAY : CommentStep.goTo(-1);
    if (pageI >= 0 && covers(map, panelJ, pageI)) return CommentStep.STAY;
    for (int k = 0; k < map.j.length; k++) if (map.j[k] == panelJ) return CommentStep.goTo(map.i0[k]);
    return CommentStep.STAY;
  }

  // A commentary leading the page from a run of chapters it says nothing
  // on (runFrom to runTo): the page in one of them stays (-1); one outside
  // goes to the run's chapter nearest it (core/follow.l8's
  // follow_run_chapter).
  static int runChapter(int runFrom, int runTo, int pageC) {
    if (pageC >= runFrom && pageC <= runTo) return -1;
    return pageC < runFrom ? runFrom : runTo;
  }
}
