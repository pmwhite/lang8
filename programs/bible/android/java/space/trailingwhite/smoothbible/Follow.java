package space.trailingwhite.smoothbible;

import java.util.OptionalDouble;

// Following (SKINS.md, Panes: Linked): which pane moves, and to where, so
// that the section at the top pane's top edge has one linked with it in
// sight in the bottom pane. A port of core/follow.l8, the rules every skin
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

  // The panes (core's PANE_PAGE and PANE_PANEL).
  static final int PAGE = 0, PANEL = 1;

  // A chapter's link map (core's `link C MODE COMMENTS` and its `match I0
  // I1 J` lines): by verse, the page's anchors i0[k] (i1[k] the same) go
  // with the panel's anchor j[k]; by comment, the version's anchors i0[k]
  // to i1[k] go with the commentary's anchor j[k], the commentary in pane
  // comments (0 the page, 1 the panel); in order.
  static final class LinkMap {
    final int mode;
    final int comments;
    final int[] i0, i1, j;

    LinkMap(int mode, int comments, int[] i0, int[] i1, int[] j) {
      if (i0.length != j.length || i1.length != j.length)
        throw new IllegalArgumentException("a link map's matches have three numbers each");
      this.mode = mode;
      this.comments = comments;
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

  // The links following goes by: pairs of a section of the top pane (the
  // page) and a section of the bottom pane (the panel) linked with it.
  static final class Links {
    double[] topFrom = new double[64], topTo = new double[64], bottomFrom = new double[64],
        bottomTo = new double[64];
    int n;

    void put(double tf, double tt, double bf, double bt) {
      if (n == topFrom.length) {
        topFrom = java.util.Arrays.copyOf(topFrom, 2 * n);
        topTo = java.util.Arrays.copyOf(topTo, 2 * n);
        bottomFrom = java.util.Arrays.copyOf(bottomFrom, 2 * n);
        bottomTo = java.util.Arrays.copyOf(bottomTo, 2 * n);
      }
      topFrom[n] = tf;
      topTo[n] = tt;
      bottomFrom[n] = bf;
      bottomTo[n] = bt;
      n++;
    }

    // A chapter's links added (core's follow_links_add): by verse, each
    // match's verses; by comment, a version on the page: each verse a
    // comment is on with that comment; a commentary on the page: each
    // comment with its run of verses; a chapter of a commentary's run
    // without comments: the version's chapter with the run's part.
    void add(LinkMap map, ChapterShape page, ChapterShape panel) {
      if (map.mode == BY_VERSE) {
        for (int k = 0; k < map.j.length; k++) link(page, map.i0[k], map.i0[k], panel, map.j[k], map.j[k]);
        return;
      }
      if (map.j.length == 0) {
        if (page.topKnown && page.endKnown && panel.topKnown && panel.endKnown && page.end > page.top
            && panel.end > panel.top) put(page.top, page.end, panel.top, panel.end);
        return;
      }
      boolean versionOnPage = map.comments == PANEL;
      for (int k = 0; k < map.j.length; k++) {
        if (versionOnPage) for (int i = map.i0[k]; i <= map.i1[k]; i++) link(page, i, i, panel, map.j[k], map.j[k]);
        else link(page, map.j[k], map.j[k], panel, map.i0[k], map.i1[k]);
      }
    }

    private void link(ChapterShape page, int i0, int i1, ChapterShape panel, int j0, int j1) {
      double[] top = section(page, i0, i1), bottom = section(panel, j0, j1);
      if (top != null && bottom != null) put(top[0], top[1], bottom[0], bottom[1]);
    }
  }

  private static double[] section(ChapterShape s, int i0, int i1) {
    int n = s.starts.length;
    if (i0 < 0 || i1 < i0 || i1 >= n || !s.known[i0]) return null;
    boolean toKnown = i1 + 1 < n ? s.known[i1 + 1] : s.endKnown;
    double to = i1 + 1 < n ? s.starts[i1 + 1] : s.end;
    if (!toKnown || to <= s.starts[i0]) return null;
    return new double[] {s.starts[i0], to};
  }

  // How far from where it should be a pane may be and still count as there,
  // how near two distances are to be one section's, and a glide's time.
  static final double SLACK = 0.5, SAME = 0.001, GLIDE_SECONDS = 0.05;
  // How long a glide may go on after its place was last new (s).
  static final double GLIDE_MOST = 0.3;

  private static double[] range(double from, double to, double height) {
    double a = to - height;
    return a < from ? new double[] {a, from} : new double[] {from, a};
  }

  private static double clamp(double x, double[] r) {
    return Math.max(r[0], Math.min(r[1], x));
  }

  private static double distance(double from, double to, double at) {
    return at < from ? from - at : at >= to ? at - to + SLACK : 0;
  }

  private static double nearest(Links l, double edge) {
    double best = -1;
    for (int k = 0; k < l.n; k++) {
      double d = distance(l.topFrom[k], l.topTo[k], edge);
      if (best < 0 || d < best) best = d;
    }
    return best;
  }

  // The top pane moved: the bottom pane's new top (empty: it stays).
  static OptionalDouble bottomMove(Links l, double topEdge, double bottomTop, double bottomHeight) {
    double near = nearest(l, topEdge);
    if (near < 0) return OptionalDouble.empty();
    double best = bottomTop;
    boolean found = false;
    for (int k = 0; k < l.n; k++) {
      if (distance(l.topFrom[k], l.topTo[k], topEdge) > near + SAME) continue;
      double to = clamp(bottomTop, range(l.bottomFrom[k], l.bottomTo[k], bottomHeight));
      if (!found || Math.abs(to - bottomTop) < Math.abs(best - bottomTop)) best = to;
      found = true;
    }
    return Math.abs(best - bottomTop) <= SLACK ? OptionalDouble.empty() : OptionalDouble.of(best);
  }

  private static boolean inSight(Links l, int k, double bottomTop, double bottomHeight) {
    return Math.abs(clamp(bottomTop, range(l.bottomFrom[k], l.bottomTo[k], bottomHeight)) - bottomTop) <= SLACK;
  }

  private static double topFor(Links l, int k, double topTop, double topHeight) {
    double from = l.topFrom[k], to = l.topTo[k];
    return clamp(topTop, new double[] {from, to - topHeight > from ? to - topHeight : from});
  }

  private static double overlap(double a, double b, double c, double d) {
    double low = Math.max(a, c), high = Math.min(b, d);
    return high > low ? high - low : 0;
  }

  // The bottom pane moved: the top pane's new top (empty: it stays).
  static OptionalDouble topMove(Links l, double topTop, double topHeight, double bottomTop,
      double bottomHeight) {
    double near = nearest(l, topTop);
    if (near < 0) return OptionalDouble.empty();
    for (int k = 0; k < l.n; k++)
      if (distance(l.topFrom[k], l.topTo[k], topTop) <= near + SAME && inSight(l, k, bottomTop, bottomHeight))
        return OptionalDouble.empty();
    double best = topTop;
    boolean found = false;
    for (int k = 0; k < l.n; k++) {
      if (!inSight(l, k, bottomTop, bottomHeight)) continue;
      double to = topFor(l, k, topTop, topHeight);
      if (!found || Math.abs(to - topTop) < Math.abs(best - topTop)) best = to;
      found = true;
    }
    if (!found) {
      double most = 0;
      for (int k = 0; k < l.n; k++) most = Math.max(most, overlap(l.bottomFrom[k], l.bottomTo[k], bottomTop, bottomTop + bottomHeight));
      for (int k = 0; k < l.n; k++) {
        if (!(most > 0 && overlap(l.bottomFrom[k], l.bottomTo[k], bottomTop, bottomTop + bottomHeight) >= most - SLACK)) continue;
        double to = topFor(l, k, topTop, topHeight);
        if (!found || Math.abs(to - topTop) < Math.abs(best - topTop)) best = to;
        found = true;
      }
    }
    return !found || Math.abs(best - topTop) <= SLACK ? OptionalDouble.empty() : OptionalDouble.of(best);
  }

  // A pane gliding to its place: where it is after seconds more, there by
  // left seconds from now at the latest (core's follow_glide).
  static double glide(double at, double to, double seconds, double left) {
    double dt = Math.max(0, seconds);
    if (left <= dt) return to;
    double x = dt / GLIDE_SECONDS;
    double grown = 1 + x + x * x / 2 + x * x * x / 6;
    double after = (left - dt) / left;
    double kept = Math.min(after * after * after, 1 / grown);
    double next = to + (at - to) * kept;
    return Math.abs(next - to) <= SLACK ? to : next;
  }

  // A pane's place and its reading line's position, each way (core's
  // follow_place_y and follow_line_place): a pane sent to a place tells it
  // back. Anchor i's span runs from its start to the next's (the
  // chapter's top before the first, its end after the last).
  static final double PLACE_SLACK = 1;

  static double placeY(ChapterShape s, int i, int frac) {
    double a = i < 0 ? s.top : s.starts[i];
    double b = i + 1 < s.starts.length ? s.starts[i + 1] : s.end;
    return a + (b - a) * frac / 1000.0;
  }

  // The place at line: {anchor (-1 above the first), thousandths through}.
  static int[] linePlace(ChapterShape s, double line) {
    int i = -1;
    for (int k = 0; k < s.starts.length; k++) if (s.starts[k] <= line + PLACE_SLACK) i = k;
    double a = i < 0 ? s.top : s.starts[i];
    double b = i + 1 < s.starts.length ? s.starts[i + 1] : s.end;
    int frac = b - a < 1 ? 0 : (int) ((line - a) / (b - a) * 1000 + 0.5);
    return new int[] {i, Math.max(0, Math.min(999, frac))};
  }
}
