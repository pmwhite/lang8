package space.trailingwhite.smoothbible;

import android.animation.ValueAnimator;
import android.content.Context;
import android.os.SystemClock;
import android.text.Layout;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.OverScroller;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

// One of the two panes a document is read in (SKINS.md, "Panes"): the page
// (pane 0) or the panel's reader (pane 1), the same reader made twice. Core
// decides where each goes; this lays out what it is sent and says where it
// is read.
//
// Its document comes a part at a time (`part P C K N` and its lines), as it
// asks for the parts near what it shows (`want P C K`). It shows a window
// of them: each part a TextView of its own, laid out and measured as it
// comes in (`measured`: its height and where each of its anchors begins),
// one after another, each at a place in the window's own coordinates that
// doesn't change while it is there. Parts come in ahead of the screen at
// either end and go far behind it; one coming in above, or one above the
// screen sent again taller or shorter, moves those above it, never what is
// in sight. Scrolling is the view's own (its children moved, not laid out
// again), so that core's `scroll` on every frame is cheap.
//
// Its units for core are hundredths of a pixel. Where it is read is its
// reading line (`line P THOUSANDTHS` of the way down what of it is in
// sight), told as it moves (`at P C K Y HOW`, at most once a frame), with
// a finger's first move (`moving`) and its rests (`rest`).
final class Reader extends ViewGroup {
  // The panes, as core numbers them.
  static final int PAGE = 0, PANEL = 1;

  // How a pane was moved, as an `at` says it (core/panes.l8's PANE_).
  private static final int MOVED_BY_APP = 0, DRAGGED = 1, GLIDING_AFTER_FINGER = 2;

  // A part key's places past every part a chapter has: none (the document's
  // end or start), or the chapter before not known yet.
  private static final long NONE = -1, CHAPTER_BEFORE_UNKNOWN = -2;

  // How long a part asked for waits for its answer before it may be asked
  // for again (core answers at once; a pane without a document doesn't).
  private static final long ASK_AGAIN_MS = 3000;

  // How many parts it keeps out of the window, by when each was used.
  private static final int STORE_MOST = 48;

  // A glide core asks for (`scroll ... 1`), and a key's page.
  private static final long GLIDE_MS = 300;

  final int pane;
  final Look look;
  private int chapters;
  // Its reading line, a fraction of what of it is in sight.
  private float readingLine;
  // What of the view is out of sight: under the bar above it, under the
  // system's bar below.
  private int insetTop, insetBottom;

  // A part as core sent it, and, while it is in the window, laid out.
  static final class Part {
    // Its chapter (in a run of chapters a commentary says nothing on, the
    // run's first), its index, and how many parts its chapter has (0: not
    // known yet, a commentary opening).
    final int c, k, parts;
    // The run's last chapter (-1: not a run).
    final int runTo;
    // It only holds its place until it has been read (sent again then); set
    // right to left (the Hebrew).
    final boolean coming, rtl;
    final SpannableStringBuilder text;
    // Its anchors (its verse lines), in order: each one's verse, and where
    // its words begin and end (UTF-16).
    final int[] verses;
    // Its links: A, B, KIND, ARG each (KIND 0 a footnote's mark, 1 a
    // reference, 2 a word of the original's, 3 the ESV's line).
    final long[] links;
    // What core has said since (`forget`): shown until it is sent again.
    boolean stale;
    // Laid out: its view, the width it was laid out for, its height and
    // where each anchor begins, and its top in the window's coordinates.
    TextView view;
    int laidWidth = -1, height;
    int[] anchorY = new int[0];
    double top;

    Part(int c, int k, int parts, int runTo, boolean coming, boolean rtl,
        SpannableStringBuilder text, int[] verses, long[] links) {
      this.c = c;
      this.k = k;
      this.parts = parts;
      this.runTo = runTo;
      this.coming = coming;
      this.rtl = rtl;
      this.text = text;
      this.verses = verses;
      this.links = links;
    }

    double bottom() {
      return top + height;
    }

    // Whether it is the last of its chapter (or of its run).
    boolean endsChapter() {
      return k + 1 >= Math.max(parts, 1);
    }

    // Verse v's place in its words (null: not here).
    int[] range(int v) {
      for (int i = 0; i < verses.length; i += 3) {
        if (verses[i] == v) {
          int a = Math.min(verses[i + 1], text.length()), b = Math.min(verses[i + 2], text.length());
          return b > a ? new int[] {a, b} : null;
        }
      }
      return null;
    }
  }

  // A chapter's parts as core said them: how many (0: not known yet), the
  // run of chapters without comments it is in (-1: none), and every anchor
  // of the chapter in order with the part it is in.
  private static final class Chapter {
    int parts;
    int runFrom = -1, runTo = -1;
    int[] verses = new int[0], verseParts = new int[0];
  }

  // Where a jump or a scroll puts the reading line, waiting until its part
  // is here and laid out.
  private abstract static class Target {
    // The part it is in, and how far down it (pixels); null if it isn't
    // here yet (what is wanted asked for).
    abstract Part part(Reader r);

    abstract double y(Reader r, Part p);
  }

  // A verse (0: the chapter's top), frac thousandths of the way through it
  // (`jump`).
  private static final class VerseTarget extends Target {
    final int c, verse, frac;

    VerseTarget(int c, int verse, int frac) {
      this.c = c;
      this.verse = verse;
      this.frac = frac;
    }

    @Override
    Part part(Reader r) {
      Chapter ch = r.chapterInfo.get(c);
      if (ch == null) {
        r.want(c, 0);
        return null;
      }
      if (ch.runFrom >= 0) return r.fresh(ch.runFrom, 0, true);
      int i = verse > 0 ? anchorFor(ch, verse) : -1;
      return r.fresh(c, i >= 0 ? ch.verseParts[i] : 0, true);
    }

    @Override
    double y(Reader r, Part p) {
      if (verse <= 0 || p.runTo >= 0) return 0;
      // (The verse, or the last before it the part has.)
      int j = -1;
      for (int i = 0; i < p.verses.length; i += 3) {
        if (p.verses[i] == verse) {
          j = i / 3;
          break;
        }
        if (p.verses[i] < verse) j = i / 3;
      }
      if (j < 0 || j >= p.anchorY.length) return 0;
      double a = p.anchorY[j], b = j + 1 < p.anchorY.length ? p.anchorY[j + 1] : p.height;
      return a + (b - a) * frac / 1000.0;
    }

    // The first anchor of the verse in the chapter, or the last before it
    // (-1: none).
    private static int anchorFor(Chapter ch, int v) {
      int best = -1;
      for (int i = 0; i < ch.verses.length; i++) {
        if (ch.verses[i] == v) return i;
        if (ch.verses[i] < v) best = i;
      }
      return best;
    }
  }

  // A place y pixels down part k of chapter c (`scroll`, its part gone from
  // the window).
  private static final class SpotTarget extends Target {
    final int c, k;
    final double y;

    SpotTarget(int c, int k, double y) {
      this.c = c;
      this.k = k;
      this.y = y;
    }

    @Override
    Part part(Reader r) {
      return r.fresh(c, k, true);
    }

    @Override
    double y(Reader r, Part p) {
      return y;
    }
  }

  // The window, in the document's order, and where the view's top is in its
  // coordinates (pixels).
  private final ArrayList<Part> window = new ArrayList<>();
  private double scroll;
  // Parts core sent, by their key (the window's among them), the one used
  // longest ago let go first.
  private final LinkedHashMap<Long, Part> store = new LinkedHashMap<Long, Part>(64, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<Long, Part> eldest) {
      return size() > STORE_MOST;
    }
  };
  private final HashMap<Integer, Chapter> chapterInfo = new HashMap<>();
  // Parts asked for and not answered yet, and when.
  private final HashMap<Long, Long> asked = new HashMap<>();
  // A jump or scroll waiting for its part (null: none), and the part it was
  // last put at (a part still coming: put there again once it has come).
  private Target pending;
  private Part pendingShown;
  // Views of parts let go, to be used again.
  private final ArrayList<TextView> pool = new ArrayList<>();

  // ---- how it is moving ----
  private enum Motion {
    STILL(MOVED_BY_APP),
    DRAGGED_BY_FINGER(DRAGGED),
    FLUNG(GLIDING_AFTER_FINGER),
    // A glide core asked for (`scroll ... 1`).
    GLIDING(MOVED_BY_APP),
    // A page down or up, a key's.
    PAGED(DRAGGED);

    final int how;

    Motion(int how) {
      this.how = how;
    }
  }

  private Motion motion = Motion.STILL;
  private final OverScroller scroller;
  private final int touchSlop, minFling, maxFling;
  private VelocityTracker velocity;
  private float downY, lastY;
  // A finger on it now; whether `moving` was said for it (a rest is said
  // when it lets go); whether its touch stopped a glide (not a tap).
  private boolean touching, saidMoving, caughtGlide;
  private double glideFrom, glideTo;
  private long glideStart;
  private final DecelerateInterpolator ease = new DecelerateInterpolator(1.6f);
  private final GestureDetector taps;
  // The reading line last told (`at`), as its part and hundredths down it.
  private int atC = -1, atK, atY;
  private boolean framePosted;

  // ---- what is shown on its verses (the page's) ----
  // The verses selected (of chapter selC, -1 none), core's; the verse
  // heard (Listen's; chapter -1 none).
  int selC = -1;
  private final TreeSet<Integer> sel = new TreeSet<>();
  private int heardC = -1, heardV;

  Reader(Context context, Look look, int pane) {
    super(context);
    this.look = look;
    this.pane = pane;
    readingLine = pane == PAGE ? 0.333f : 0;
    ViewConfiguration vc = ViewConfiguration.get(context);
    touchSlop = vc.getScaledTouchSlop();
    minFling = vc.getScaledMinimumFlingVelocity();
    maxFling = vc.getScaledMaximumFlingVelocity();
    scroller = new OverScroller(context);
    taps = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
      @Override
      public boolean onSingleTapUp(MotionEvent e) {
        if (!caughtGlide) tapped(e.getX(), e.getY());
        return true;
      }
    });
  }

  // ---- core's lines ----
  // `reader N`: the Bible's chapters; what it had let go.
  void setChapters(int n) {
    chapters = n;
    forget(-1);
  }

  // `line P THOUSANDTHS`.
  void setReadingLine(int thousandths) {
    double at = lineAt();
    readingLine = thousandths / 1000f;
    scroll = at - lineOffset();
    position();
  }

  // What of it is out of sight above and below (the page's bar, the
  // system's): what is at the reading line kept there.
  void setInsets(int top, int bottom) {
    if (top == insetTop && bottom == insetBottom) return;
    double at = lineAt();
    insetTop = top;
    insetBottom = bottom;
    scroll = at - lineOffset();
    clamp();
    position();
    sayView();
    frameNeeded();
  }

  // `part P C K N` and its lines (to `end`): kept, in the window in place of
  // the one shown, and a jump waiting for it made.
  void part(int c, int k, int parts, String words, List<Wire> lines) {
    Part p = read(c, k, parts, words, lines);
    long key = key(p.c, p.k);
    asked.remove(key);
    if (p.runTo >= 0) for (int x = p.c; x <= p.runTo; x++) asked.remove(key(x, 0));
    store.put(key, p);
    int at = indexOf(p.c, p.k);
    if (at >= 0) replace(at, p);
    resolvePending();
    fill();
    frameNeeded();
  }

  // `jump P C V FRAC`.
  void jump(int c, int v, int frac) {
    if (c < 0 || c >= chapters) return;
    stopMotion();
    pending = new VerseTarget(c, v, frac);
    pendingShown = null;
    resolvePending();
  }

  // `scroll P C K Y GLIDE`: the reading line to y hundredths down part k of
  // chapter c, at once or gliding. (Not while a finger holds it: core's
  // lines from before the finger came.)
  void scrollTo(int c, int k, int y, boolean glide) {
    if (touching) return;
    Part p = inWindow(c, k);
    if (p == null) {
      stopMotion();
      pending = new SpotTarget(c, k, y / 100.0);
      pendingShown = null;
      resolvePending();
      return;
    }
    double to = p.top + y / 100.0 - lineOffset();
    stopMotion();
    if (glide && ValueAnimator.areAnimatorsEnabled()) glide(to, Motion.GLIDING);
    else {
      moveTo(to);
      restSoon();
    }
  }

  // `halt P`: its glide stopped where it is.
  void halt() {
    if (motion == Motion.STILL || motion == Motion.DRAGGED_BY_FINGER) return;
    stopMotion();
    sayRest();
  }

  // `forget P C`: chapter c's parts (-1: every chapter's) to be asked for
  // again, those shown kept until they come.
  void forget(int c) {
    if (c < 0) {
      store.clear();
      chapterInfo.clear();
      asked.clear();
    } else {
      store.keySet().removeIf(key -> (int) (key >> 32) == c);
      asked.keySet().removeIf(key -> (int) (key >> 32) == c);
      chapterInfo.remove(c);
    }
    for (Part p : window) if (c < 0 || p.c == c) p.stale = true;
    fill();
  }

  // Chapter c's parts asked for again (what is marked on its verses
  // changed).
  void reask(int c) {
    if (c < 0) return;
    store.keySet().removeIf(key -> (int) (key >> 32) == c);
    for (Part p : window) {
      if (p.c != c) continue;
      asked.remove(key(p.c, p.k));
      want(p.c, p.k);
    }
  }

  // Listen's verse followed: the page to it if it isn't in sight (and no
  // finger is on it).
  void follow(int c, int v) {
    if (touching || c < 0 || c >= chapters) return;
    for (Part p : window) {
      if (p.c != c || p.view == null) continue;
      int[] r = p.range(v);
      if (r == null) continue;
      Layout l = p.view.getLayout();
      if (l == null) break;
      double y = p.top + p.view.getTotalPaddingTop() + l.getLineTop(l.getLineForOffset(r[0])) - scroll;
      if (y > insetTop && y < getHeight() - insetBottom - dp(80)) return;
      break;
    }
    jump(c, v, 0);
  }

  // A page down (d 1) or up (-1), less three lines: a key's, leading.
  void page(int d) {
    if (window.isEmpty()) return;
    double line = textPx() * look.spacing;
    double seen = Math.max(line, visibleHeight() - 3 * line);
    stopMotion();
    sayMoving();
    if (ValueAnimator.areAnimatorsEnabled()) glide(scroll + d * seen, Motion.PAGED);
    else {
      moveTo(scroll + d * seen);
      sendAt();
      sayRest();
    }
  }

  // `view P HEIGHT EM`, said as they change (and at `start`).
  void sayView() {
    if (getHeight() <= 0 || !live) return;
    String view = "view " + pane + " " + hundredths(visibleHeight()) + " " + hundredths(textPx());
    if (view.equals(saidView)) return;
    saidView = view;
    say(view);
  }

  private String saidView = "";

  // The look changed: its em told (core lays every part out again).
  void restyle() {
    setBackgroundColor(look.bg);
    sayView();
  }

  // ---- a part read ----
  private Part read(int c, int k, int parts, String words, List<Wire> lines) {
    // (Its last newline left out: parts follow one another as paragraphs
    // do, without an empty line at the end of each.)
    String body = words.endsWith("\n") ? words.substring(0, words.length() - 1) : words;
    SpannableStringBuilder s = new SpannableStringBuilder(body);
    int em = (int) textPx();
    int n = s.length();
    int[] vs = new int[lines.size() * 3];
    int nv = 0;
    ArrayList<long[]> links = new ArrayList<>();
    ArrayList<Integer> anchorVerses = new ArrayList<>(), anchorParts = new ArrayList<>();
    int runFrom = -1, runTo = -1;
    boolean coming = false, rtl = false;
    int paraEnd = -1;
    for (Wire w : lines) {
      switch (w.word(0)) {
        case "span": {
          int a = Math.min(w.num(1), n), b = Math.min(w.num(2), n);
          if (b > a) look.style(s, a, b, w.num(3));
          int para = w.num(4);
          if (para != Look.PROSE && a >= paraEnd) {
            int pa = a;
            while (pa > 0 && s.charAt(pa - 1) != '\n') pa--;
            // (A run that ends with its newline ends its paragraph there.)
            int pb = b;
            if (pb == a || pb == 0 || s.charAt(pb - 1) != '\n') {
              while (pb < n && s.charAt(pb) != '\n') pb++;
              if (pb < n) pb++;
            }
            if (pb > pa) look.para(s, pa, pb, para, em);
            paraEnd = pb;
          }
          break;
        }
        case "verse":
          vs[nv * 3] = w.num(1);
          vs[nv * 3 + 1] = w.num(2);
          vs[nv * 3 + 2] = w.num(3);
          nv++;
          break;
        case "link":
          try {
            links.add(new long[] {w.num(1), w.num(2), w.num(3), Long.parseLong(w.word(4))});
          } catch (NumberFormatException e) {
            // (Not a number: no link.)
          }
          break;
        case "anchor":
          anchorVerses.add(w.num(1));
          anchorParts.add(w.num(2));
          break;
        case "gap":
          runFrom = w.num(1);
          runTo = w.num(2);
          break;
        case "coming":
          coming = true;
          break;
        case "layout":
          rtl = w.num(2) != 0;
          break;
        default:
          break;
      }
    }
    long[] lk = new long[links.size() * 4];
    for (int i = 0; i < links.size(); i++) System.arraycopy(links.get(i), 0, lk, i * 4, 4);
    Part p = new Part(c, k, parts, runTo, coming, rtl, s, java.util.Arrays.copyOf(vs, nv * 3), lk);
    // (What is marked: a highlight's color behind its verse.)
    for (Wire w : lines) {
      if (!w.word(0).equals("mark") || look.wash(w.word(2)) == 0) continue;
      int[] r = p.range(w.num(1));
      if (r != null) s.setSpan(new BackgroundColorSpan(look.wash(w.word(2))), r[0], r[1],
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
    // (Its chapter's parts and anchors; a run's every chapter.)
    Chapter ch = new Chapter();
    ch.parts = parts;
    ch.verses = new int[anchorVerses.size()];
    ch.verseParts = new int[anchorParts.size()];
    for (int i = 0; i < ch.verses.length; i++) {
      ch.verses[i] = anchorVerses.get(i);
      ch.verseParts[i] = anchorParts.get(i);
    }
    chapterInfo.put(c, ch);
    if (runFrom >= 0) {
      for (int x = runFrom; x <= runTo; x++) {
        Chapter in = x == c ? ch : new Chapter();
        in.parts = 1;
        in.runFrom = runFrom;
        in.runTo = runTo;
        chapterInfo.put(x, in);
      }
    }
    return p;
  }

  // ---- the window ----
  static long key(int c, int k) {
    return ((long) c << 32) | (k & 0xffffffffL);
  }

  private int indexOf(int c, int k) {
    for (int i = 0; i < window.size(); i++) {
      Part p = window.get(i);
      if (p.c == c && p.k == k) return i;
    }
    return -1;
  }

  private Part inWindow(int c, int k) {
    int i = indexOf(c, k);
    return i < 0 ? null : window.get(i);
  }

  // Part k of chapter c as core last sent it, not forgotten since (null: it
  // isn't here; asked for, if ask).
  private Part fresh(int c, int k, boolean ask) {
    Part p = store.get(key(c, k));
    if (p == null || p.stale) {
      p = inWindow(c, k);
      if (p != null && p.stale) p = null;
    }
    if (p == null && ask) want(c, k);
    return p;
  }

  void want(int c, int k) {
    if (c < 0 || c >= chapters || k < 0) return;
    long key = key(c, k);
    long now = SystemClock.uptimeMillis();
    Long at = asked.get(key);
    if (at != null && now - at < ASK_AGAIN_MS) return;
    asked.put(key, now);
    say("want " + pane + " " + c + " " + k);
  }

  // The part after p in the document (NONE: p is its last).
  private long nextKey(Part p) {
    if (p.k + 1 < Math.max(p.parts, 1)) return key(p.c, p.k + 1);
    int after = (p.runTo >= 0 ? p.runTo : p.c) + 1;
    if (after >= chapters) return NONE;
    Chapter ch = chapterInfo.get(after);
    return key(ch != null && ch.runFrom >= 0 ? ch.runFrom : after, 0);
  }

  // The part before p (NONE: p is the first; CHAPTER_BEFORE_UNKNOWN: the
  // chapter before's parts not known yet).
  private long prevKey(Part p) {
    if (p.k > 0) return key(p.c, p.k - 1);
    int before = p.c - 1;
    if (before < 0) return NONE;
    Chapter ch = chapterInfo.get(before);
    if (ch == null) return CHAPTER_BEFORE_UNKNOWN;
    if (ch.runFrom >= 0) return key(ch.runFrom, 0);
    return key(before, Math.max(ch.parts, 1) - 1);
  }

  // The window kept around what is in sight: parts brought in (from those
  // kept, or asked for) two and a half screens ahead and a screen and a
  // half behind, and let go three and four screens away; parts forgotten
  // asked for again. (A screen, for a pane shorter than the window, the
  // window's height: a commentary's next comments are laid out, and so
  // measured, before the page comes to their verses.)
  private void fill() {
    if (window.isEmpty() || getWidth() <= 0) return;
    int h = Math.max(getHeight(), getRootView().getHeight());
    for (Part p : window) if (p.stale) want(p.c, p.k);
    for (int guard = 0; guard < 24; guard++) {
      Part last = window.get(window.size() - 1);
      if (last.bottom() > scroll + h * 2.5) break;
      long next = nextKey(last);
      if (next == NONE) break;
      Part p = fresh((int) (next >> 32), (int) next, true);
      if (p == null) break;
      layOut(p);
      p.top = last.bottom();
      attach(p, window.size());
    }
    for (int guard = 0; guard < 24; guard++) {
      Part first = window.get(0);
      if (first.top < scroll - h * 1.5) break;
      long before = prevKey(first);
      if (before == NONE) break;
      if (before == CHAPTER_BEFORE_UNKNOWN) {
        want(first.c - 1, 0);
        break;
      }
      Part p = fresh((int) (before >> 32), (int) before, true);
      if (p == null) break;
      layOut(p);
      p.top = first.top - p.height;
      attach(p, 0);
    }
    Part reading = window.get(lineIndex());
    while (window.size() > 1 && window.get(0) != reading && window.get(0).bottom() < scroll - h * 3) detach(0);
    while (window.size() > 1 && window.get(window.size() - 1) != reading
        && window.get(window.size() - 1).top > scroll + h * 4) detach(window.size() - 1);
  }

  private void attach(Part p, int at) {
    window.add(at, p);
    addViewInLayout(p.view, -1, p.view.getLayoutParams(), true);
    p.view.setTranslationY((float) Math.round(p.top - scroll));
    sayMeasured(p);
  }

  private void detach(int at) {
    Part p = window.remove(at);
    if (p.view == null) return;
    removeViewInLayout(p.view);
    pool.add(p.view);
    p.view = null;
    p.laidWidth = -1;
    invalidate();
  }

  private void clearWindow() {
    while (!window.isEmpty()) detach(window.size() - 1);
  }

  // Part at of the window sent again as p: in its place, those above it
  // moved by the change in its height if it is above what is in sight, else
  // those below it.
  private void replace(int at, Part p) {
    Part old = window.get(at);
    layOut(p);
    double change = p.height - old.height;
    boolean above = old.bottom() <= scroll + insetTop;
    p.top = above ? old.top - change : old.top;
    if (above) for (int i = 0; i < at; i++) window.get(i).top -= change;
    else for (int i = at + 1; i < window.size(); i++) window.get(i).top += change;
    // (Its view given to the new one.)
    TextView v = old.view;
    old.view = null;
    old.laidWidth = -1;
    window.set(at, p);
    if (v != null) {
      removeViewInLayout(v);
      pool.add(v);
    }
    addViewInLayout(p.view, -1, p.view.getLayoutParams(), true);
    sayMeasured(p);
    keepInOrder();
    position();
  }

  // The window kept one part after another (a part sent again may say its
  // chapter has more parts or fewer): those out of order let go, from the
  // part at the reading line out.
  private void keepInOrder() {
    int r = lineIndex();
    for (int i = r; i + 1 < window.size(); i++) {
      Part a = window.get(i), b = window.get(i + 1);
      if (nextKey(a) != key(b.c, b.k)) {
        while (window.size() > i + 1) detach(window.size() - 1);
        break;
      }
    }
    for (int i = Math.min(r, window.size() - 1); i > 0; i--) {
      Part a = window.get(i - 1), b = window.get(i);
      if (nextKey(a) != key(b.c, b.k)) {
        for (int j = 0; j < i; j++) detach(0);
        break;
      }
    }
  }

  // A jump or scroll waiting made, once its part is here and the view has
  // its size: the reading line there (the window begun again at it if it
  // isn't in it), told, and at rest. A part still coming is shown, and the
  // jump made again once it has come.
  private void resolvePending() {
    if (pending == null || getWidth() <= 0) return;
    Part p = pending.part(this);
    if (p == null || p == pendingShown) return;
    layOut(p);
    if (window.indexOf(p) < 0) {
      clearWindow();
      p.top = 0;
      attach(p, 0);
    }
    moveTo(p.top + pending.y(this, p) - lineOffset());
    fill();
    if (p.coming) {
      pendingShown = p;
      return;
    }
    pending = null;
    pendingShown = null;
    sendAt(true);
    sayRest();
  }

  // The index of the part at the reading line (the nearest, if it is
  // outside the window).
  private int lineIndex() {
    double y = lineAt();
    for (int i = 0; i < window.size(); i++) if (window.get(i).bottom() > y) return i;
    return Math.max(0, window.size() - 1);
  }

  // ---- laying a part out ----
  private float textPx() {
    return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, look.textSp(),
        getResources().getDisplayMetrics());
  }

  private int dp(float n) {
    return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, n,
        getResources().getDisplayMetrics());
  }

  // Part p laid out for the view's width (if it isn't): its view, height
  // and anchors' places. A chapter's first part has room above it and its
  // last below; one that only holds a place (coming, a run, the ESV's
  // waiting line) is as tall as what is in sight.
  private void layOut(Part p) {
    int w = getWidth();
    if (w <= 0 || (p.view != null && p.laidWidth == w)) return;
    TextView tv = p.view;
    if (tv == null) {
      tv = pool.isEmpty() ? new TextView(getContext()) : pool.remove(pool.size() - 1);
      p.view = tv;
    }
    int m = dp(look.margin);
    float em = textPx();
    // (The text's column never wider than the look's: wider margins on a
    // wide window.)
    int side = Math.max(m, (int) ((w - look.column * em) / 2));
    int pad = (int) (m * 0.8f);
    tv.setPadding(side, p.k == 0 ? pad : 0, side, p.endsChapter() ? pad : 0);
    tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, look.textSp());
    tv.setLineSpacing(0, look.spacing);
    tv.setTextColor(look.ink);
    tv.setTypeface(look.face());
    tv.setTextIsSelectable(false);
    tv.setTextDirection(p.rtl ? View.TEXT_DIRECTION_RTL : View.TEXT_DIRECTION_FIRST_STRONG);
    boolean holding = p.coming || p.runTo >= 0 || (pane == PAGE && p.verses.length == 0);
    tv.setMinHeight(holding ? visibleHeight() : 0);
    markSelection(p);
    markHeard(p);
    tv.setText(p.text);
    tv.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
    int h = tv.getMeasuredHeight();
    // (Its size set without asking for a layout: it is laid out here.)
    ViewGroup.LayoutParams lp = tv.getLayoutParams();
    if (lp == null) tv.setLayoutParams(new LayoutParams(w, h));
    else {
      lp.width = w;
      lp.height = h;
    }
    tv.layout(0, 0, w, h);
    p.height = h;
    p.laidWidth = w;
    Layout l = tv.getLayout();
    p.anchorY = new int[p.verses.length / 3];
    for (int i = 0; i < p.anchorY.length && l != null; i++)
      p.anchorY[i] = tv.getTotalPaddingTop() + l.getLineTop(l.getLineForOffset(
          Math.min(p.verses[i * 3 + 1], p.text.length())));
  }

  // `measured P C K H Y...`.
  private void sayMeasured(Part p) {
    StringBuilder b = new StringBuilder("measured ").append(pane).append(' ').append(p.c).append(' ')
        .append(p.k).append(' ').append(hundredths(p.height));
    for (int y : p.anchorY) b.append(' ').append(hundredths(y));
    say(b.toString());
  }

  // Part p's words shown again (what is washed on them changed): its
  // height is the same.
  private void redraw(Part p) {
    if (p.view == null) return;
    markSelection(p);
    markHeard(p);
    p.view.setText(p.text);
    int w = p.view.getWidth();
    p.view.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(p.height, MeasureSpec.EXACTLY));
    p.view.layout(0, 0, w, p.height);
  }

  // Every part laid out again for a new width: the part at the reading line
  // kept there, as far through the span of its anchor there as it was (from
  // where that anchor begins to where the next does), and the others around
  // it.
  private void relayAll(double lineBefore) {
    if (window.isEmpty()) return;
    int r = window.size() - 1;
    for (int i = 0; i < window.size(); i++) if (window.get(i).bottom() > lineBefore) {
      r = i;
      break;
    }
    Part at = window.get(r);
    double y = lineBefore - at.top;
    int span = spanAt(at, y);
    double through = (y - spanTop(at, span)) / Math.max(1, spanBottom(at, span) - spanTop(at, span));
    for (Part p : window) {
      layOut(p);
      sayMeasured(p);
    }
    for (int i = r + 1; i < window.size(); i++) window.get(i).top = window.get(i - 1).bottom();
    for (int i = r - 1; i >= 0; i--) window.get(i).top = window.get(i + 1).top - window.get(i).height;
    double top = spanTop(at, span);
    scroll = at.top + top + through * (spanBottom(at, span) - top) - lineOffset();
    clamp();
    position();
  }

  // The span of part p y down it: the index of the anchor it is after (-1:
  // before the first), and where that span begins and ends.
  private static int spanAt(Part p, double y) {
    int j = -1;
    while (j + 1 < p.anchorY.length && p.anchorY[j + 1] <= y) j++;
    return j;
  }

  private static double spanTop(Part p, int j) {
    return j < 0 ? 0 : p.anchorY[j];
  }

  private static double spanBottom(Part p, int j) {
    return j + 1 < p.anchorY.length ? p.anchorY[j + 1] : p.height;
  }

  // ---- where it is ----
  private int visibleHeight() {
    return Math.max(1, getHeight() - insetTop - insetBottom);
  }

  // The reading line, down from the view's top; and in the window's
  // coordinates.
  private double lineOffset() {
    return insetTop + readingLine * visibleHeight();
  }

  private double lineAt() {
    return scroll + lineOffset();
  }

  static int hundredths(double px) {
    return (int) Math.round(px * 100);
  }

  // Its parts placed for the scroll (moved, not laid out again).
  private void position() {
    for (Part p : window) if (p.view != null) p.view.setTranslationY((float) Math.round(p.top - scroll));
  }

  // The scroll kept within the document's ends where the window reaches
  // them (whether it had to be).
  private boolean clamp() {
    if (window.isEmpty()) return false;
    Part first = window.get(0), last = window.get(window.size() - 1);
    boolean atStart = first.c == 0 && first.k == 0;
    boolean atEnd = nextKey(last) == NONE;
    double least = first.top - insetTop;
    double most = last.bottom() - (getHeight() - insetBottom);
    if (atStart && most < least) most = least;
    if (atEnd && scroll > most) {
      scroll = most;
      return true;
    }
    if (atStart && scroll < least) {
      scroll = least;
      return true;
    }
    return false;
  }

  private void moveTo(double to) {
    scroll = to;
    clamp();
    position();
    fill();
    frameNeeded();
  }

  // ---- telling core ----
  private void frameNeeded() {
    if (framePosted) return;
    framePosted = true;
    postOnAnimation(frame);
  }

  private final Runnable frame = () -> {
    framePosted = false;
    step();
  };

  // A frame: a fling or a glide moved on, the window kept, and the reading
  // line told if it moved.
  private void step() {
    boolean more = false, ended = false;
    Motion was = motion;
    if (motion == Motion.FLUNG) {
      if (scroller.computeScrollOffset()) {
        scroll = scroller.getCurrY();
        if (clamp()) {
          scroller.forceFinished(true);
          ended = true;
        } else more = true;
      } else ended = true;
      position();
    } else if (motion == Motion.GLIDING || motion == Motion.PAGED) {
      float t = (SystemClock.uptimeMillis() - glideStart) / (float) GLIDE_MS;
      if (t >= 1) {
        scroll = glideTo;
        ended = true;
      } else {
        scroll = glideFrom + (glideTo - glideFrom) * ease.getInterpolation(t);
        more = true;
      }
      if (clamp()) {
        ended = true;
        more = false;
      }
      position();
    }
    fill();
    sendAt();
    if (ended) {
      motion = Motion.STILL;
      if (was == Motion.GLIDING) restSoon();
      else sayRest();
    }
    if (more) frameNeeded();
  }

  // `at P C K Y HOW`, if the reading line moved since it was told (or,
  // after a jump, always: core waits for it).
  private void sendAt() {
    sendAt(false);
  }

  private void sendAt(boolean always) {
    if (window.isEmpty() || pending != null) return;
    Part p = window.get(lineIndex());
    if (p.stale) return;
    int y = hundredths(Math.max(0, Math.min(p.height - 1, lineAt() - p.top)));
    if (!always && p.c == atC && p.k == atK && y == atY) return;
    atC = p.c;
    atK = p.k;
    atY = y;
    say("at " + pane + " " + p.c + " " + p.k + " " + y + " " + motion.how);
  }

  private void sayMoving() {
    saidMoving = true;
    cancelRest();
    say("moving " + pane + " " + now());
  }

  // `rest P ENDS_HI MS`: the last chapter whose end is in sight (-1 none).
  private void sayRest() {
    saidMoving = false;
    cancelRest();
    if (window.isEmpty()) return;
    sendAt();
    double top = scroll + insetTop, bottom = scroll + getHeight() - insetBottom;
    int endsHi = -1;
    for (Part p : window) {
      if (p.endsChapter() && p.bottom() >= top && p.bottom() <= bottom + 1)
        endsHi = Math.max(endsHi, p.runTo >= 0 ? p.runTo : p.c);
    }
    say("rest " + pane + " " + endsHi + " " + now());
  }

  // Moved by core at once: at rest once it has stayed still a moment.
  private final Runnable restLater = this::sayRest;

  private void restSoon() {
    removeCallbacks(restLater);
    postDelayed(restLater, 250);
  }

  private void cancelRest() {
    removeCallbacks(restLater);
  }

  // A line to core, once the app has begun (before it, core's host takes
  // only where the app's files are).
  private boolean live;

  private void say(String line) {
    if (live) Native.send(line);
  }

  // The app begun (`start` said): its lines to core from now on.
  void begin() {
    live = true;
    sayView();
  }

  // The skin's clock for core (ms).
  static long now() {
    return SystemClock.uptimeMillis();
  }

  // ---- moving ----
  private void stopMotion() {
    scroller.forceFinished(true);
    motion = Motion.STILL;
  }

  private void glide(double to, Motion how) {
    glideFrom = scroll;
    glideTo = to;
    glideStart = SystemClock.uptimeMillis();
    motion = how;
    frameNeeded();
  }

  @Override
  public boolean onInterceptTouchEvent(MotionEvent e) {
    return true;
  }

  @Override
  public boolean onTouchEvent(MotionEvent e) {
    if (velocity == null) velocity = VelocityTracker.obtain();
    velocity.addMovement(e);
    taps.onTouchEvent(e);
    switch (e.getActionMasked()) {
      case MotionEvent.ACTION_DOWN:
        touching = true;
        downY = lastY = e.getY();
        // (A finger on a glide stops it, and holds the pane: not a tap.)
        caughtGlide = motion != Motion.STILL;
        stopMotion();
        if (caughtGlide) sayMoving();
        return true;
      case MotionEvent.ACTION_MOVE: {
        float y = e.getY();
        if (motion != Motion.DRAGGED_BY_FINGER) {
          if (Math.abs(y - downY) < touchSlop) return true;
          motion = Motion.DRAGGED_BY_FINGER;
          lastY = y;
          getParent().requestDisallowInterceptTouchEvent(true);
          if (!saidMoving) sayMoving();
        }
        moveTo(scroll + (lastY - y));
        lastY = y;
        return true;
      }
      case MotionEvent.ACTION_UP:
      case MotionEvent.ACTION_CANCEL: {
        touching = false;
        boolean flung = false;
        if (motion == Motion.DRAGGED_BY_FINGER && e.getActionMasked() == MotionEvent.ACTION_UP) {
          velocity.computeCurrentVelocity(1000, maxFling);
          float vy = velocity.getYVelocity();
          if (Math.abs(vy) > minFling) {
            scroller.fling(0, (int) Math.round(scroll), 0, (int) -vy, 0, 0,
                Integer.MIN_VALUE / 2, Integer.MAX_VALUE / 2);
            motion = Motion.FLUNG;
            flung = true;
            frameNeeded();
          }
        }
        if (!flung) {
          motion = Motion.STILL;
          if (saidMoving) {
            sendAt();
            sayRest();
          }
        }
        velocity.recycle();
        velocity = null;
        return true;
      }
      default:
        return true;
    }
  }

  // ---- taps ----
  // The part at y down the view, and the place in its words at x (null:
  // none).
  private Part partAt(float y) {
    double at = scroll + y;
    for (Part p : window) if (p.view != null && at >= p.top && at < p.bottom()) return p;
    return null;
  }

  // A tap: on the page, a footnote's mark, a word of the original, the
  // ESV's line or a reference (core's, give or take a letter), else the
  // verse there (core toggles it and says the selection) or nothing; in the
  // panel's reader, a reference, previewed.
  private void tapped(float x, float y) {
    Part p = partAt(y);
    Layout l = p == null ? null : p.view.getLayout();
    if (l == null) {
      if (pane == PAGE) say("tapnone");
      return;
    }
    int line = l.getLineForVertical((int) (scroll + y - p.top) - p.view.getTotalPaddingTop());
    int off = l.getOffsetForHorizontal(line, x - p.view.getTotalPaddingLeft());
    for (int i = 0; i + 3 < p.links.length; i += 4) {
      if (off < p.links[i] - 1 || off > p.links[i + 1]) continue;
      long kind = p.links[i + 2], arg = p.links[i + 3];
      if (pane == PANEL) {
        if (kind == 1) say("preview " + arg);
        return;
      }
      say(kind == 0 ? "footnote " + p.c + " " + arg : kind == 2 ? "word " + arg
          : kind == 3 ? "esvact " + arg + " " + p.c : "preview " + arg);
      return;
    }
    if (pane != PAGE) return;
    int v = 0;
    for (int i = 0; i < p.verses.length; i += 3) if (off >= p.verses[i + 1] && off < p.verses[i + 2]) v = p.verses[i];
    say(v > 0 ? "tapverse " + p.c + " " + v : "tapnone");
  }

  // ---- the selection and the verse heard (the page's) ----
  // Core's selection (its chapter, -1 none, then its verses), painted.
  void selection(String words) {
    String[] w = words.trim().split(" ");
    int c = -1;
    try {
      c = Integer.parseInt(w[0]);
    } catch (NumberFormatException e) {
      // (None.)
    }
    int was = selC;
    sel.clear();
    selC = c;
    for (int i = 1; i < w.length && c >= 0; i++) {
      try {
        sel.add(Integer.parseInt(w[i]));
      } catch (NumberFormatException e) {
        // (Not a verse.)
      }
    }
    for (Part p : window) if (p.c == c || p.c == was) redraw(p);
  }

  void clearSelection() {
    int c = selC;
    sel.clear();
    selC = -1;
    for (Part p : window) if (p.c == c) redraw(p);
  }

  // The selection washed in the accent.
  static final class Sel extends BackgroundColorSpan {
    Sel(int color) {
      super(color);
    }
  }

  private void markSelection(Part p) {
    for (Sel o : p.text.getSpans(0, p.text.length(), Sel.class)) p.text.removeSpan(o);
    if (p.c != selC) return;
    for (int v : sel) {
      int[] r = p.range(v);
      if (r != null) p.text.setSpan(new Sel(Look.alpha(look.accent, 0.18f)), r[0], r[1],
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
  }

  // The verse being heard (Listen's), washed; chapter -1, none.
  static final class Heard extends BackgroundColorSpan {
    Heard(int color) {
      super(color);
    }
  }

  void hearing(int c, int v) {
    int was = heardC;
    heardC = c;
    heardV = v;
    for (Part p : window) if (p.c == c || p.c == was) redraw(p);
  }

  private void markHeard(Part p) {
    for (Heard o : p.text.getSpans(0, p.text.length(), Heard.class)) p.text.removeSpan(o);
    if (p.c != heardC || heardV <= 0) return;
    int[] r = p.range(heardV);
    if (r != null) p.text.setSpan(new Heard(Look.alpha(look.accent, 0.12f)), r[0], r[1],
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
  }

  // ---- its size ----
  @Override
  protected void onMeasure(int wSpec, int hSpec) {
    setMeasuredDimension(getDefaultSize(0, wSpec), getDefaultSize(0, hSpec));
  }

  @Override
  protected void onLayout(boolean changed, int l, int t, int r, int b) {
    for (Part p : window) if (p.view != null) p.view.layout(0, 0, p.view.getMeasuredWidth(), p.height);
  }

  @Override
  protected void onSizeChanged(int w, int h, int oldW, int oldH) {
    super.onSizeChanged(w, h, oldW, oldH);
    // (What was at the reading line kept there.)
    double before = scroll + insetTop + readingLine * Math.max(1, oldH - insetTop - insetBottom);
    scroll = before - lineOffset();
    clamp();
    position();
    // (A new width: every part laid out again after this layout pass, which
    // would lay their views out again.)
    post(() -> {
      if (getWidth() != w || getHeight() != h) return;
      if (w != oldW) relayAll(lineAt());
      sayView();
      resolvePending();
      fill();
      frameNeeded();
    });
  }
}
