package space.trailingwhite.smoothbible;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Rect;
import android.graphics.drawable.ColorDrawable;
import android.os.SystemClock;
import android.text.Layout;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.BackgroundColorSpan;
import android.util.Log;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalDouble;
import java.util.TreeSet;

// One of the two panes a document is read in (SKINS.md, Panes): the page
// (pane 0) or the panel's reader (pane 1), the same reader made twice.
//
// It is the platform's list (a ListView: its fling, its scrolling for
// TalkBack, a TextView a part, so that TalkBack reads each part and its
// words can be selected) of a window of parts: those near what it shows,
// asked for (`want P C K`) as either end comes near and let go far away.
// Each part in the window is measured as it comes in, by a TextView set up
// as the list's are, so that where each of its anchors begins is known
// exactly in the window's own coordinates (its content: pixels down from
// the window's first part) whether it is on the screen or not. A part
// coming in above, or sent again, never moves what is at the reading line.
//
// It speaks to core in places, never in pixels: where its reading line is
// (`at P C I FRAC`, as the anchor there changes and at rest), a finger's
// first move (`moving`), its rests (`rest`); and it goes where core says
// (`go P C I FRAC MODE`). Linked, Linking moves it frame by frame by
// core's rules (Follow) when the other pane leads.
final class Reader extends ListView {
  // The panes, as core numbers them.
  static final int PAGE = 0, PANEL = 1;

  // A part key's places past every part a chapter has: none (the document's
  // end or start), or the chapter before not known yet.
  private static final long NONE = -1, CHAPTER_BEFORE_UNKNOWN = -2;

  // How long a part asked for waits for its answer before it may be asked
  // for again (core answers at once; a pane without a document doesn't).
  private static final long ASK_AGAIN_MS = 3000;

  // How many parts it keeps out of the window, by when each was used.
  private static final int STORE_MOST = 48;

  // A glide (`go ... 1`, a key's page, following by comment): its time,
  // and how far it may go (in screens; farther, it is there at once).
  private static final long GLIDE_MS = 300;
  private static final float GLIDE_REACH_SCREENS = 1.5f;

  // How long after it was last moved by following it is at rest.
  private static final long REST_AFTER_MS = 250;

  // The window kept about the reading line: parts brought in a screen and
  // a half behind and two and a half ahead, let go three and four away.
  private static final float BEHIND_SCREENS = 1.5f, AHEAD_SCREENS = 2.5f, LET_GO_BEHIND = 3,
      LET_GO_AHEAD = 4;

  // What moves the panes together (Linking): told as this one moves.
  interface Moves {
    // A finger (or a key) began to move it: it leads.
    void moving(Reader r);

    // It moved (each frame it moves).
    void moved(Reader r);

    // A finger, a fling or a key's page let it rest.
    void rested(Reader r);

    // Core sent it somewhere (`go`, its MODE): a jump, which the other makes
    // too.
    void jumped(Reader r, int mode);
  }

  final int pane;
  final Look look;
  private Moves moves;
  private int chapters;
  // Its reading line, a fraction of what of it is in sight.
  private float readingLine;
  // Whether core's screen says it is linked with the page (the panel's
  // reader's `reader 1`, while it shows).
  private boolean linkedShown;

  // A part as core sent it, and, while it is in the window, measured.
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
    // The chapter's index of its first anchor (anchors are in their parts'
    // order).
    final int firstAnchor;
    // Its links: A, B, KIND, ARG each (KIND 0 a footnote's mark, 1 a
    // reference, 2 a word of the original's, 3 the ESV's line).
    final long[] links;
    // What core has said since (`forget`): shown until it is sent again.
    boolean stale;
    // Measured: for what (the width, the height a part that holds a place
    // is given, the look), its height and where each anchor begins, and its
    // top in the window's coordinates.
    int laidWidth = -1, laidHolding = -1, laidLook = -1, height;
    int[] anchorY = new int[0];
    double top;

    Part(int c, int k, int parts, int runTo, boolean coming, boolean rtl,
        SpannableStringBuilder text, int[] verses, int firstAnchor, long[] links) {
      this.c = c;
      this.k = k;
      this.parts = parts;
      this.runTo = runTo;
      this.coming = coming;
      this.rtl = rtl;
      this.text = text;
      this.verses = verses;
      this.firstAnchor = firstAnchor;
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
    // How many bytes into its part each anchor is, and how many bytes each
    // part is (core's `anchor V K AT` and `sizes`: following guesses where
    // parts not laid out would be by them; empty: not told).
    int[] verseOffsets = new int[0], sizes = new int[0];
  }

  // A place in the document (SKINS.md, Panes: Places): a chapter, an
  // anchor of it (-1: above its first) and thousandths through its span.
  static final class Place {
    final int c, i, frac;

    Place(int c, int i, int frac) {
      this.c = c;
      this.i = i;
      this.frac = frac;
    }
  }

  // Where it is going and stays until a hand moves it: a place core said
  // (`go`), Listen's verse, or one following by comment chose. Held, it is
  // put there again as parts come in about it (until they have, the list's
  // ends would hold it short). Until it has arrived (its part here, laid
  // out and not still coming) it says nothing of where it is.
  private static final class Target {
    final int c, frac;
    // Its anchor (-1: the chapter's top); or, for Listen's (verse > 0),
    // the verse's first anchor, known once the chapter's anchors are.
    final int anchor, verse;
    // Brought there: a glide if it is near.
    final boolean glides;
    // Chosen by following (the skin's own), not by core.
    final boolean following;
    boolean arrived;

    Target(int c, int anchor, int verse, int frac, boolean glides, boolean following) {
      this.c = c;
      this.anchor = anchor;
      this.verse = verse;
      this.frac = frac;
      this.glides = glides;
      this.following = following;
    }
  }

  // A spot in the window that stays as parts come and go about it: a part
  // and how far down it (pixels).
  static final class Spot {
    final long key;
    final double into;

    Spot(long key, double into) {
      this.key = key;
      this.into = into;
    }
  }

  // A glide of its own (the list's own is a fling's): from a spot to a
  // spot, eased, over GLIDE_MS.
  private static final class Glide {
    final Spot from, to;
    final long start;

    Glide(Spot from, Spot to, long start) {
      this.from = from;
      this.to = to;
      this.start = start;
    }
  }

  // The window, in the document's order.
  private final ArrayList<Part> window = new ArrayList<>();
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
  private Target held;
  private Glide glide;
  // The list's views and the one that measures parts as they would be.
  private final Parts adapter = new Parts();
  private final TextView measurer;
  // The look's layout as last measured by (a part measured for an older
  // one is measured again).
  private int lookGeneration;
  private String lookLaid = "", lookColored = "";
  // Between asking the list to put a part somewhere and its laying itself
  // out, the window's coordinate at the view's top as asked; after, as it
  // is.
  // The part asked for and its top in the view, given to the list as it
  // lays itself out (its padding, which placing is measured from, is
  // brought up to date only as it is measured).
  private boolean placing;
  private double placedViewTop;
  // Inside its own layout (what the list says of where it is waits until
  // the layout is done).
  private boolean laying;
  private int placeIndex = -1, placeChildTop;

  // ---- how it is moving ----
  private enum Motion {
    STILL,
    // A finger on it, dragging; flung (or scrolled by TalkBack); a key's
    // page: it leads.
    DRAGGED,
    FLUNG,
    PAGED,
    // A glide to where it is going (core's `go`, or following by comment).
    GLIDING,
    // Moved frame by frame following the other pane.
    FOLLOWING
  }

  private Motion motion = Motion.STILL;
  private int scrollState = OnScrollListener.SCROLL_STATE_IDLE;
  // A finger on it now; whether `moving` was said for it (a rest is said
  // when it stops); whether its touch caught it moving (not a tap).
  private boolean touching, saidMoving, caught;
  private final DecelerateInterpolator ease = new DecelerateInterpolator(1.6f);
  private final GestureDetector taps;
  // The anchor at the reading line last told (`at`).
  private int atC = -1, atI;

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
    // (Selectable, as the list's are: a selectable TextView lays its words
    // out as editable ones are, to the same pixel.)
    measurer = new PartView(context);
    setAdapter(adapter);
    setDivider(null);
    setDividerHeight(0);
    setSelector(new ColorDrawable(0));
    setCacheColorHint(0);
    setItemsCanFocus(true);
    setClipToPadding(false);
    setVerticalScrollBarEnabled(false);
    setOverScrollMode(OVER_SCROLL_NEVER);
    setOnScrollListener(new OnScrollListener() {
      @Override
      public void onScrollStateChanged(AbsListView view, int state) {
        scrollStateChanged(state);
      }

      @Override
      public void onScroll(AbsListView view, int first, int count, int total) {
        moved();
      }
    });
    taps = new GestureDetector(context, new GestureDetector.SimpleOnGestureListener() {
      @Override
      public boolean onSingleTapUp(MotionEvent e) {
        if (!caught) tapped(e.getX(), e.getY());
        return false;
      }
    });
  }

  void setMoves(Moves m) {
    moves = m;
  }

  // ---- core's lines ----
  // `chapters P N`: its document's chapters (core's `forget` lets go of
  // what it shows, as its document changes).
  void setChapters(int n) {
    chapters = n;
  }

  // `line P THOUSANDTHS`.
  void setReadingLine(int thousandths) {
    double at = lineY();
    readingLine = thousandths / 1000f;
    placeLine(at);
  }

  // What of it is out of sight above and below (the page's bar, the
  // system's): what is at the reading line kept there.
  void setInsets(int top, int bottom) {
    if (top == getPaddingTop() && bottom == getPaddingBottom()) return;
    Spot keep = spotAtLine();
    setPadding(0, top, 0, bottom);
    remeasureAndKeep(keep, null);
  }

  // `part P C K N` and its lines (to `end`): kept, in the window in place of
  // the one shown, and where it is going made.
  void part(int c, int k, int parts, String words, List<Wire> lines) {
    Part p = read(c, k, parts, words, lines);
    long key = key(p.c, p.k);
    asked.remove(key);
    if (p.runTo >= 0) for (int x = p.c; x <= p.runTo; x++) asked.remove(key(x, 0));
    store.put(key, p);
    int at = indexOf(p.c, p.k);
    if (at >= 0) {
      // (Measured now, or as the pane is shown.)
      Spot keep = spotAtLine();
      measure(p);
      window.set(at, p);
      keepInOrder(keep);
      commit(keep);
    }
    resolveHeld();
    fill();
  }

  // `go P C I FRAC MODE`: the reading line to anchor i of chapter c (-1:
  // its top), frac thousandths through its span; MODE 1 brought there
  // (a glide if it is near). Not while a finger holds it: core's line
  // from before the finger came.
  void go(int c, int i, int frac, int mode) {
    if (touching || c < 0 || c >= chapters) return;
    goTo(new Target(c, i, 0, Math.max(0, Math.min(999, frac)), mode == 1, false));
    if (moves != null) moves.jumped(this, mode);
  }

  // `halt P`: its glide (or fling) stopped where it is, as the other pane
  // is taken by a finger. (Not a glide following chose: that came after
  // the finger, and core's halt from before it.)
  void halt() {
    if (held != null && held.following) return;
    if (motion == Motion.FLUNG) {
      // (Its rest is said as the list stops.)
      stopMoving();
      return;
    }
    if (glide == null) return;
    stopMoving();
    held = null;
    motion = Motion.STILL;
    sayRest();
  }

  // `forget P C`: chapter c's parts (-1: every chapter's) to be asked for
  // again, those shown kept until they come.
  void forget(int c) {
    if (c < 0) {
      store.clear();
      chapterInfo.clear();
      asked.clear();
      measuredHeight = 0;
      measuredBytes = 0;
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
    for (int n = 0; n < getChildCount(); n++) {
      View child = getChildAt(n);
      Part p = (Part) child.getTag();
      if (p == null || p.c != c || !(child instanceof TextView)) continue;
      int[] r = p.range(v);
      Layout l = ((TextView) child).getLayout();
      if (r == null || l == null) continue;
      int y = child.getTop() + ((TextView) child).getTotalPaddingTop()
          + l.getLineTop(l.getLineForOffset(r[0]));
      if (y > getPaddingTop() && y < getHeight() - getPaddingBottom() - dp(80)) return;
    }
    goTo(new Target(c, -1, v, 0, false, false));
  }

  // A page down (d 1) or up (-1), less three lines: a key's, leading.
  void page(int d) {
    if (window.isEmpty()) return;
    double line = textPx() * look.spacing;
    double seen = Math.max(line, visibleHeight() - 3 * line);
    stopMoving();
    held = null;
    sayMoving();
    motion = Motion.PAGED;
    double from = lineY();
    double to = Math.max(window.get(0).top,
        Math.min(window.get(window.size() - 1).bottom() - 1, from + d * seen));
    if (animatorsOn()) startGlide(spotAt(from), spotAt(to));
    else {
      placeLine(to);
      motion = Motion.STILL;
      sayRest();
      if (moves != null) moves.rested(this);
    }
  }

  // The look as it may have changed (its screen shown, the look line):
  // what it is laid out by measured again if that changed (core sends its
  // parts again too), its colors shown if they did.
  void restyle() {
    setBackgroundColor(look.bg);
    String laid = look.textSp() + " " + look.spacing + " " + look.font + " " + look.margin + " "
        + look.column;
    String colored = look.ink + " " + look.accent;
    if (!laid.equals(lookLaid)) {
      lookLaid = laid;
      lookColored = colored;
      lookGeneration++;
      remeasureAndKeep(spotAtLine(), placeAtLine());
    } else if (!colored.equals(lookColored)) {
      lookColored = colored;
      adapter.notifyDataSetChanged();
    }
  }

  // Whether core's screen says it is linked (pane 1's, while it shows).
  void setLinkedShown(boolean linked) {
    linkedShown = linked;
  }

  boolean linkedShown() {
    return linkedShown;
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
    ArrayList<Integer> anchorVerses = new ArrayList<>(), anchorParts = new ArrayList<>(),
        anchorOffsets = new ArrayList<>(), partSizes = new ArrayList<>();
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
          anchorOffsets.add(w.num(3));
          break;
        case "sizes":
          for (int i = 1; !w.word(i).isEmpty(); i++) partSizes.add(w.num(i));
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
    // (Its chapter's parts and anchors; a run's every chapter.)
    Chapter ch = new Chapter();
    ch.parts = parts;
    ch.verses = new int[anchorVerses.size()];
    ch.verseParts = new int[anchorParts.size()];
    ch.verseOffsets = new int[anchorOffsets.size()];
    ch.sizes = new int[partSizes.size()];
    for (int i = 0; i < ch.sizes.length; i++) ch.sizes[i] = partSizes.get(i);
    int first = 0;
    for (int i = 0; i < ch.verses.length; i++) {
      ch.verses[i] = anchorVerses.get(i);
      ch.verseParts[i] = anchorParts.get(i);
      ch.verseOffsets[i] = anchorOffsets.get(i);
      if (ch.verseParts[i] < k) first = i + 1;
    }
    Part p = new Part(c, k, parts, runTo, coming, rtl, s, java.util.Arrays.copyOf(vs, nv * 3),
        runFrom >= 0 ? 0 : first, lk);
    // (What is marked: a highlight's color behind its verse.)
    for (Wire w : lines) {
      if (!w.word(0).equals("mark") || look.wash(w.word(2)) == 0) continue;
      int[] r = p.range(w.num(1));
      if (r != null) s.setSpan(new BackgroundColorSpan(look.wash(w.word(2))), r[0], r[1],
          Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
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

  private int indexOf(long key) {
    return indexOf((int) (key >> 32), (int) key);
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

  // The window kept about the reading line: parts brought in (from those
  // kept, or asked for) ahead and behind, and let go far away; parts
  // forgotten asked for again. (A screen, for a pane shorter than the
  // window, the window's height: a commentary's next comments are
  // measured before the page comes to their verses.)
  private void fill() {
    if (window.isEmpty() || contentWidth() <= 0) return;
    double h = Math.max(visibleHeight(), getRootView().getHeight());
    for (Part p : window) if (p.stale) want(p.c, p.k);
    Spot keep = spotAtLine();
    double line = lineY();
    boolean changed = false;
    for (int guard = 0; guard < 24; guard++) {
      Part last = window.get(window.size() - 1);
      if (last.bottom() > line + h * AHEAD_SCREENS) break;
      long next = nextKey(last);
      if (next == NONE) break;
      Part p = fresh((int) (next >> 32), (int) next, true);
      if (p == null) break;
      measure(p);
      p.top = last.bottom();
      window.add(p);
      changed = true;
    }
    for (int guard = 0; guard < 24; guard++) {
      Part first = window.get(0);
      if (first.top < line - h * BEHIND_SCREENS) break;
      long before = prevKey(first);
      if (before == NONE) break;
      if (before == CHAPTER_BEFORE_UNKNOWN) {
        want(first.c - 1, 0);
        break;
      }
      Part p = fresh((int) (before >> 32), (int) before, true);
      if (p == null) break;
      measure(p);
      p.top = first.top - p.height;
      window.add(0, p);
      changed = true;
    }
    Part reading = keep == null ? null : window.get(Math.max(0, indexOf(keep.key)));
    Part going = heldPart();
    while (window.size() > 1 && window.get(0) != reading && window.get(0) != going
        && window.get(0).bottom() < line - h * LET_GO_BEHIND) {
      window.remove(0);
      changed = true;
    }
    while (window.size() > 1 && window.get(window.size() - 1) != reading
        && window.get(window.size() - 1) != going
        && window.get(window.size() - 1).top > line + h * LET_GO_AHEAD) {
      window.remove(window.size() - 1);
      changed = true;
    }
    if (changed) commit(keep);
  }

  private final Runnable fillLater = this::fill;

  private void fillSoon() {
    removeCallbacks(fillLater);
    post(fillLater);
  }

  // The window kept one part after another (a part sent again may say its
  // chapter has more parts or fewer): those out of order let go, from the
  // part at the reading line out.
  private void keepInOrder(Spot keep) {
    int r = keep == null ? 0 : Math.max(0, indexOf(keep.key));
    for (int i = r; i + 1 < window.size(); i++) {
      Part a = window.get(i), b = window.get(i + 1);
      if (nextKey(a) != key(b.c, b.k)) {
        while (window.size() > i + 1) window.remove(window.size() - 1);
        break;
      }
    }
    for (int i = Math.min(r, window.size() - 1); i > 0; i--) {
      Part a = window.get(i - 1), b = window.get(i);
      if (nextKey(a) != key(b.c, b.k)) {
        for (int j = 0; j < i; j++) window.remove(0);
        break;
      }
    }
  }

  // The window changed (parts in, out, or sent again): each part's top
  // from the first's, the list told, and the reading line where it was
  // (at the spot keep), or where it is going.
  private void commit(Spot keep) {
    double y = 0;
    for (Part p : window) {
      p.top = y;
      y += p.height;
    }
    adapter.notifyDataSetChanged();
    OptionalDouble at = held != null && glide == null ? heldY() : OptionalDouble.empty();
    if (!at.isPresent()) at = spotY(keep);
    if (at.isPresent()) placeLine(at.getAsDouble());
    else if (!window.isEmpty()) placeLine(lineOffset());
  }

  // Every part of the window measured again (a width, a height or the look
  // changed): the place at the reading line kept (as far through its
  // anchor's span, if place is given; else at the same spot).
  private void remeasureAndKeep(Spot keep, Place place) {
    if (contentWidth() <= 0) return;
    for (Part p : window) measure(p);
    commit(keep);
    if (place != null && held == null) {
      OptionalDouble y = placeY(place.c, place.i, place.frac);
      if (y.isPresent()) placeLine(y.getAsDouble());
    }
    fillSoon();
  }

  // ---- measuring a part ----
  private float textPx() {
    return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, look.textSp(),
        getResources().getDisplayMetrics());
  }

  private int dp(float n) {
    return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, n,
        getResources().getDisplayMetrics());
  }

  private int contentWidth() {
    return getWidth() - getPaddingLeft() - getPaddingRight();
  }

  // Whether part p only holds a place (coming: a module still opening, the
  // ESV's chapter loading; a run): as tall as what of the pane is in sight.
  private boolean holding(Part p) {
    return p.coming || p.runTo >= 0;
  }

  // A view set up to show part p: the list's, or the one that measures. A
  // chapter's first part has room above it and its last below.
  private void dress(TextView tv, Part p) {
    int w = contentWidth();
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
    tv.setHighlightColor(Look.alpha(look.accent, 0.3f));
    tv.setTypeface(look.face());
    tv.setTextDirection(p.rtl ? View.TEXT_DIRECTION_RTL : View.TEXT_DIRECTION_FIRST_STRONG);
    tv.setMinHeight(holding(p) ? visibleHeight() : 0);
    markSelection(p);
    markHeard(p);
    tv.setText(p.text);
  }

  // Part p measured for the list's width (if it isn't): its height and
  // where each anchor begins, exactly as the list will lay it out.
  private void measure(Part p) {
    int w = contentWidth();
    int holdingHeight = holding(p) ? visibleHeight() : 0;
    if (w <= 0 || (p.laidWidth == w && p.laidHolding == holdingHeight && p.laidLook == lookGeneration))
      return;
    dress(measurer, p);
    measurer.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY),
        MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
    p.height = measurer.getMeasuredHeight();
    // (How tall a byte of its source is, for guessing: guessParts.)
    int bytes = partBytes(p.c, p.k);
    if (bytes > 0 && p.runTo < 0 && !p.coming) {
      measuredHeight += p.height;
      measuredBytes += bytes;
    }
    p.laidWidth = w;
    p.laidHolding = holdingHeight;
    p.laidLook = lookGeneration;
    p.anchorY = anchorsOf(measurer, p);
  }

  private static int[] anchorsOf(TextView tv, Part p) {
    Layout l = tv.getLayout();
    int[] ys = new int[p.verses.length / 3];
    for (int i = 0; i < ys.length && l != null; i++)
      ys[i] = tv.getTotalPaddingTop() + l.getLineTop(l.getLineForOffset(
          Math.min(p.verses[i * 3 + 1], p.text.length())));
    return ys;
  }

  // The list's views: a part each.
  private final class Parts extends BaseAdapter {
    @Override
    public int getCount() {
      return window.size();
    }

    @Override
    public Object getItem(int i) {
      return window.get(i);
    }

    @Override
    public long getItemId(int i) {
      Part p = window.get(i);
      return key(p.c, p.k);
    }

    @Override
    public boolean hasStableIds() {
      return true;
    }

    @Override
    public View getView(int i, View convert, ViewGroup parent) {
      TextView tv = convert instanceof PartView ? (TextView) convert : new PartView(getContext());
      Part p = window.get(i);
      dress(tv, p);
      tv.setTag(p);
      return tv;
    }
  }

  // A part's view: its words selectable (the platform's selection, its
  // menu), read by TalkBack.
  private static final class PartView extends TextView {
    PartView(Context c) {
      super(c);
      setLayoutParams(new AbsListView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.WRAP_CONTENT));
      setTextIsSelectable(true);
    }
  }

  // (A selection's handle, or a view taking the focus, asks the list to
  // bring its words into sight: what is read is the reader's to move, not
  // theirs. TalkBack's asking to show a part is let through.)
  @Override
  public boolean requestChildRectangleOnScreen(View child, Rect r, boolean immediate) {
    android.view.accessibility.AccessibilityManager a = (android.view.accessibility.AccessibilityManager)
        getContext().getSystemService(Context.ACCESSIBILITY_SERVICE);
    if (a != null && a.isTouchExplorationEnabled())
      return super.requestChildRectangleOnScreen(child, r, immediate);
    return false;
  }

  // The list laid out: where it was asked to be put, there; else (the
  // list's own ideas in a layout: a selection brought back as keys come,
  // focus given to a part) what was at the reading line kept there.
  @Override
  protected void layoutChildren() {
    Spot keep = placing || getChildCount() == 0 ? null : spotAtLine();
    laying = true;
    try {
      applyPlace();
      super.layoutChildren();
      placing = false;
      if (getChildCount() > 0) placedViewTop = viewTop();
      if (keep != null) {
        OptionalDouble y = spotY(keep);
        if (y.isPresent() && Math.abs(y.getAsDouble() - lineY()) >= 1) {
          placeLine(y.getAsDouble());
          applyPlace();
          super.layoutChildren();
          placing = false;
          if (getChildCount() > 0) placedViewTop = viewTop();
        }
      }
    } finally {
      laying = false;
    }
    moved();
    // (Each part's view as tall as it was measured: if one isn't, its
    // measure is the one laid out, and what is read kept where it is.)
    for (int n = 0; n < getChildCount(); n++) {
      View child = getChildAt(n);
      Part p = (Part) child.getTag();
      if (p == null || child.getHeight() == p.height || !(child instanceof TextView)) continue;
      Log.w("SmoothBible", "pane " + pane + ": part " + p.c + ":" + p.k + " measured " + p.height
          + ", laid out " + child.getHeight());
      Spot at = spotAtLine();
      p.height = child.getHeight();
      p.anchorY = anchorsOf((TextView) child, p);
      post(() -> commit(at));
      break;
    }
  }

  // The place asked for given to the list, now that its padding is
  // measured.
  private void applyPlace() {
    if (placeIndex >= 0 && placeIndex < window.size())
      setSelectionFromTop(placeIndex, placeChildTop - getPaddingTop());
    placeIndex = -1;
  }

  // (Keys are core's, the activity's to send it (`key`): the list's own,
  // moving a selection, would move what is read.)
  @Override
  public boolean onKeyDown(int keyCode, android.view.KeyEvent e) {
    return false;
  }

  @Override
  public boolean onKeyUp(int keyCode, android.view.KeyEvent e) {
    return false;
  }

  @Override
  public boolean onKeyMultiple(int keyCode, int count, android.view.KeyEvent e) {
    return false;
  }

  // ---- where it is ----
  private int visibleHeight() {
    return Math.max(1, getHeight() - getPaddingTop() - getPaddingBottom());
  }

  // The reading line, down from the view's top.
  private double lineOffset() {
    return getPaddingTop() + readingLine * visibleHeight();
  }

  // The window's coordinate at the view's top.
  private double viewTop() {
    if (placing || getChildCount() == 0) return placedViewTop;
    int first = getFirstVisiblePosition();
    if (first < 0 || first >= window.size()) return placedViewTop;
    return window.get(first).top - getChildAt(0).getTop();
  }

  // The reading line in the window's coordinates.
  double lineY() {
    return viewTop() + lineOffset();
  }

  // The text's em (pixels).
  double em() {
    return textPx();
  }

  // The index of the part at y (the nearest, if it is outside the window;
  // -1: no window).
  private int indexAt(double y) {
    for (int i = 0; i < window.size(); i++) if (window.get(i).bottom() > y) return i;
    return window.size() - 1;
  }

  private Spot spotAt(double y) {
    int i = indexAt(y);
    if (i < 0) return null;
    Part p = window.get(i);
    return new Spot(key(p.c, p.k), y - p.top);
  }

  private Spot spotAtLine() {
    return spotAt(lineY());
  }

  private OptionalDouble spotY(Spot s) {
    if (s == null) return OptionalDouble.empty();
    int i = indexOf(s.key);
    if (i < 0) return OptionalDouble.empty();
    Part p = window.get(i);
    return OptionalDouble.of(p.top + Math.max(0, Math.min(p.height, s.into)));
  }

  // The reading line put at y (the window's coordinates), the list asked
  // to lay itself out there.
  private void placeLine(double y) {
    int i = indexAt(y);
    if (i < 0 || contentWidth() <= 0) return;
    Part p = window.get(i);
    int childTop = (int) Math.round(p.top - (y - lineOffset()));
    placing = true;
    placedViewTop = p.top - childTop;
    placeIndex = i;
    placeChildTop = childTop;
    requestLayout();
  }

  // The reading line moved to y by a little, as the list moves itself (a
  // frame of a glide, or of following).
  private void nudgeLine(double y) {
    if (placing || getChildCount() == 0) {
      placeLine(y);
      return;
    }
    double by = y - lineY();
    if (Math.abs(by) > visibleHeight() / 2.0) placeLine(y);
    else {
      int px = (int) Math.round(by);
      if (px != 0) scrollListBy(px);
    }
  }

  // ---- places ----
  // Where anchor i of chapter c begins (-1: the chapter's top; its count:
  // its end), if its part is here and measured.
  private OptionalDouble anchorStart(int c, int i) {
    Chapter ch = chapterInfo.get(c);
    if (ch == null) return OptionalDouble.empty();
    if (i < 0) return chapterTop(c);
    if (i >= ch.verses.length) return chapterEnd(c);
    Part p = inWindow(c, ch.verseParts[i]);
    if (p == null || p.stale || p.laidWidth < 0) return OptionalDouble.empty();
    int j = i - p.firstAnchor;
    if (j < 0 || j >= p.anchorY.length) return OptionalDouble.empty();
    return OptionalDouble.of(p.top + p.anchorY[j]);
  }

  private OptionalDouble chapterTop(int c) {
    Chapter ch = chapterInfo.get(c);
    if (ch == null) return OptionalDouble.empty();
    Part p = inWindow(ch.runFrom >= 0 ? ch.runFrom : c, 0);
    return p == null ? OptionalDouble.empty() : OptionalDouble.of(p.top);
  }

  // (A chapter of a commentary's run without comments ends at the run's
  // part's top, but for the run's last, which ends at its end:
  // core/follow.l8's ChapterShape.)
  private OptionalDouble chapterEnd(int c) {
    Chapter ch = chapterInfo.get(c);
    if (ch == null) return OptionalDouble.empty();
    Part p = ch.runFrom >= 0 ? inWindow(ch.runFrom, 0) : inWindow(c, Math.max(ch.parts, 1) - 1);
    if (p == null) return OptionalDouble.empty();
    return OptionalDouble.of(ch.runFrom >= 0 && c != ch.runTo ? p.top : p.bottom());
  }

  // Where a place is in the window (empty: its part isn't here). Its span's
  // end not here (the next part not come yet), its part's end stands for
  // it.
  private OptionalDouble placeY(int c, int i, int frac) {
    OptionalDouble a = anchorStart(c, i);
    if (!a.isPresent()) return a;
    OptionalDouble b = anchorStart(c, i + 1);
    double end = b.isPresent() ? b.getAsDouble() : window.get(indexAt(a.getAsDouble())).bottom();
    return OptionalDouble.of(a.getAsDouble() + (end - a.getAsDouble()) * frac / 1000.0);
  }

  // The place at y (null: not here, or forgotten).
  private Place placeAt(double y) {
    int at = indexAt(y);
    if (at < 0) return null;
    Part p = window.get(at);
    Chapter ch = chapterInfo.get(p.c);
    if (p.stale || ch == null) return null;
    int j = -1;
    while (j + 1 < p.anchorY.length && p.top + p.anchorY[j + 1] <= y) j++;
    int i = p.firstAnchor + j;
    // (Its span: from where its anchor begins, or the part's top for one
    // in a part before it not here; to where the next begins, or the
    // part's bottom.)
    OptionalDouble a = anchorStart(p.c, i), b = anchorStart(p.c, i + 1);
    double from = a.isPresent() ? a.getAsDouble() : p.top;
    double to = b.isPresent() ? b.getAsDouble() : p.bottom();
    int frac = to > from ? (int) Math.round(1000 * (y - from) / (to - from)) : 0;
    return new Place(p.c, i, Math.max(0, Math.min(999, frac)));
  }

  // Where its reading line is (null: not known yet).
  Place placeAtLine() {
    if (window.isEmpty()) return null;
    return placeAt(lineY());
  }

  // Where it is going, if it is (else where it is read): what following
  // by comment takes as its place.
  Place aim() {
    if (held != null && held.verse == 0) return new Place(held.c, held.anchor, held.frac);
    return placeAtLine();
  }

  // A chapter's run of chapters without comments, its first and last (-1:
  // not in one, or not known).
  int runFrom(int c) {
    Chapter ch = chapterInfo.get(c);
    return ch == null ? -1 : ch.runFrom;
  }

  int runTo(int c) {
    Chapter ch = chapterInfo.get(c);
    return ch == null ? -1 : ch.runTo;
  }

  // Whether any of chapter c's parts is here.
  boolean hasChapter(int c) {
    for (Part p : window) if (!p.stale && (p.c == c || p.runTo >= 0 && c >= p.c && c <= p.runTo)) return true;
    return false;
  }

  // ---- following (Linking's) ----
  // A spot at y in the window (null: none), and where a spot is now.
  Spot followSpot(double y) {
    return spotAt(y);
  }

  OptionalDouble followSpotY(Spot s) {
    return spotY(s);
  }

  // Every part of chapters fromC to toC past the window's measured ones,
  // where it would begin and how tall it would be: as tall for its length
  // as the measured ones are on average (core's `sizes`, each part's bytes;
  // a chapter's not told yet, their mean height), the parts between it and
  // the window counted too, however many (a commentary's chapter may be
  // hundreds; at most GUESS_WALK_MOST walked each way). Following goes by
  // anchors not laid out as well (core/follow.l8; how far a guess was out
  // is closed as the leader moves).
  static final int GUESS_WALK_MOST = 4000;

  static final class Guess {
    final java.util.ArrayList<long[]> parts = new java.util.ArrayList<>();
    final java.util.ArrayList<double[]> spans = new java.util.ArrayList<>();
    double mean, perByte;
  }

  // How tall every part of its document measured so far is in all, and how
  // many bytes of source they are (a few parts' say varies).
  private double measuredHeight;
  private long measuredBytes;

  private int partBytes(int c, int k) {
    Chapter ch = chapterInfo.get(c);
    return ch == null || k < 0 || k >= ch.sizes.length ? 0 : ch.sizes[k];
  }

  private double guessHeight(Guess g, int c, int k) {
    Part known = measuredAhead(c, k);
    if (known != null) return known.height;
    int b = partBytes(c, k);
    return b > 0 && g.perByte > 0 ? b * g.perByte : g.mean;
  }

  Guess guessParts(int fromC, int toC) {
    Guess g = new Guess();
    g.mean = visibleHeight();
    Part first = null, last = null;
    double total = 0;
    int counted = 0;
    for (Part p : window) {
      if (p.stale || p.laidWidth < 0) continue;
      if (first == null) first = p;
      last = p;
      if (p.runTo < 0 && !p.coming) {
        total += p.height;
        counted++;
      }
    }
    if (last == null) return g;
    if (counted > 0) g.mean = total / counted;
    if (measuredBytes > 0) g.perByte = measuredHeight / measuredBytes;
    int c = last.runTo >= 0 ? last.runTo : last.c, k = last.k;
    double y = last.bottom();
    for (int n = 0; n < GUESS_WALK_MOST; n++) {
      Chapter ch = chapterInfo.get(c);
      if (ch != null && ch.runFrom < 0 && k + 1 < ch.parts) k++;
      else {
        if (c + 1 >= chapters || c + 1 > toC) break;
        c++;
        k = 0;
        Chapter next = chapterInfo.get(c);
        if (next != null && next.runFrom >= 0) c = next.runFrom;
      }
      double h = guessHeight(g, c, k);
      if (c >= fromC) {
        g.parts.add(new long[] {c, k});
        g.spans.add(new double[] {y, h});
      }
      y += h;
      Chapter at = chapterInfo.get(c);
      if (at != null && at.runTo >= 0) c = at.runTo;
    }
    c = first.c;
    k = first.k;
    y = first.top;
    for (int n = 0; n < GUESS_WALK_MOST; n++) {
      if (k > 0) k--;
      else {
        if (c <= 0 || c - 1 < fromC) break;
        c--;
        Chapter ch = chapterInfo.get(c);
        if (ch != null && ch.runFrom >= 0) {
          c = ch.runFrom;
          k = 0;
        } else k = ch == null ? 0 : Math.max(ch.parts, 1) - 1;
      }
      double h = guessHeight(g, c, k);
      y -= h;
      if (c <= toC) {
        g.parts.add(new long[] {c, k});
        g.spans.add(new double[] {y, h});
      }
    }
    return g;
  }

  // Chapter c as following takes it: its anchors not laid out where they
  // would be by guess (their bytes into their part, or spread through it),
  // its top and end too (not a run of chapters without comments: one part,
  // there or not).
  Follow.ChapterShape shapeGuessed(int c, Guess g) {
    Follow.ChapterShape laid = shape(c);
    Chapter ch = chapterInfo.get(c);
    if (ch == null || ch.runFrom >= 0) return laid;
    int n = laid.starts.length;
    double[] starts = laid.starts.clone();
    boolean[] known = laid.known.clone();
    double top = laid.top, end = laid.end;
    boolean topKnown = laid.topKnown, endKnown = laid.endKnown;
    // (Each part's first anchor, at once: a long chapter has many.)
    int parts = Math.max(ch.parts, 1);
    int[] firstOf = new int[parts + 1];
    java.util.Arrays.fill(firstOf, n);
    for (int i = n - 1; i >= 0; i--) if (ch.verseParts[i] >= 0 && ch.verseParts[i] < parts) firstOf[ch.verseParts[i]] = i;
    for (int k = parts - 1; k >= 0; k--) firstOf[k] = Math.min(firstOf[k], firstOf[k + 1]);
    for (int x = 0; x < g.parts.size(); x++) {
      if (g.parts.get(x)[0] != c) continue;
      int k = (int) g.parts.get(x)[1];
      double y = g.spans.get(x)[0], h = g.spans.get(x)[1];
      int bytes = partBytes(c, k);
      if (k == 0 && !topKnown) {
        top = y;
        topKnown = true;
      }
      if (k + 1 >= Math.max(ch.parts, 1) && !endKnown) {
        end = y + h;
        endKnown = true;
      }
      int from = k < parts ? firstOf[k] : n;
      int to = k + 1 < parts ? firstOf[k + 1] : n;
      Part measured = measuredAhead(c, k);
      for (int i = from; i < to; i++) {
        if (known[i]) continue;
        if (measured != null && i - measured.firstAnchor >= 0 && i - measured.firstAnchor < measured.anchorY.length) {
          starts[i] = y + measured.anchorY[i - measured.firstAnchor];
          known[i] = true;
          continue;
        }
        double into = bytes > 0 && i < ch.verseOffsets.length ? Math.min(1.0, ch.verseOffsets[i] / (double) bytes)
            : (i - from) / (double) (to - from);
        starts[i] = y + h * into;
        known[i] = true;
      }
    }
    return new Follow.ChapterShape(starts, known, top, topKnown, end, endKnown, laid.em);
  }

  // ---- parts measured ahead ----
  // While the panes rest, the parts of the chapters following goes by that
  // aren't in the window are measured out of sight, nearest first (each
  // asked for first if it isn't here), so that a flick finds them known,
  // not guessed. Nothing shown moves: only the guesses change.
  Part measuredAhead(int c, int k) {
    Part p = store.get(key(c, k));
    return p != null && !p.stale && p.laidWidth == contentWidth() && p.laidLook == lookGeneration ? p : null;
  }

  // The nearest part of chapters fromC to toC not in the window nor
  // measured, measured (or asked for); whether one was.
  boolean aheadNext(int fromC, int toC) {
    Part first = null, last = null;
    for (Part p : window) {
      if (p.stale || p.laidWidth < 0) continue;
      if (first == null) first = p;
      last = p;
    }
    if (last == null || contentWidth() <= 0) return false;
    int onC = last.runTo >= 0 ? last.runTo : last.c, onK = last.k, backC = first.c, backK = first.k;
    boolean on = true, back = true;
    for (int n = 0; n < GUESS_WALK_MOST && (on || back); n++) {
      if (on) {
        Chapter ch = chapterInfo.get(onC);
        if (ch != null && ch.runFrom < 0 && onK + 1 < ch.parts) onK++;
        else if (onC + 1 >= chapters || onC + 1 > toC) on = false;
        else {
          onC++;
          onK = 0;
        }
        if (on && onC >= fromC && aheadWanted(onC, onK)) return true;
      }
      if (back) {
        if (backK > 0) backK--;
        else if (backC <= 0 || backC - 1 < fromC) back = false;
        else {
          backC--;
          Chapter ch = chapterInfo.get(backC);
          backK = ch == null || ch.runFrom >= 0 ? 0 : Math.max(ch.parts, 1) - 1;
        }
        if (back && backC <= toC && aheadWanted(backC, backK)) return true;
      }
    }
    return false;
  }

  // Part k of chapter c measured now (or asked for), if it is to be: not in
  // the window, not measured, not a run's or one still coming.
  private boolean aheadWanted(int c, int k) {
    Chapter ch = chapterInfo.get(c);
    if (ch != null && ch.runFrom >= 0 || indexOf(c, k) >= 0 || measuredAhead(c, k) != null) return false;
    Part p = store.get(key(c, k));
    if (p == null || p.stale) {
      Long at = asked.get(key(c, k));
      if (at != null && SystemClock.uptimeMillis() - at < ASK_AGAIN_MS) return true;
      want(c, k);
      return true;
    }
    if (p.coming || p.runTo >= 0) return false;
    measure(p);
    return true;
  }

  // Whether it is still (no finger, glide or following under way).
  boolean resting() {
    return motion == Motion.STILL && !touching;
  }

  // Chapter c as it is laid out here, for following.
  Follow.ChapterShape shape(int c) {
    Chapter ch = chapterInfo.get(c);
    int n = ch == null ? 0 : ch.verses.length;
    double[] starts = new double[n];
    boolean[] known = new boolean[n];
    for (int i = 0; i < n; i++) {
      OptionalDouble y = anchorStart(c, i);
      known[i] = y.isPresent();
      if (known[i]) starts[i] = y.getAsDouble();
    }
    OptionalDouble top = chapterTop(c), end = chapterEnd(c);
    return new Follow.ChapterShape(starts, known, top.orElse(0), top.isPresent(), end.orElse(0),
        end.isPresent(), em());
  }

  // ---- going somewhere ----
  static boolean animatorsOn() {
    return ValueAnimator.areAnimatorsEnabled();
  }

  private void goTo(Target t) {
    stopMoving();
    motion = Motion.STILL;
    held = t;
    resolveHeld();
  }

  // The part where it is going (null: none, or not here).
  private Part heldPart() {
    if (held == null) return null;
    Chapter ch = chapterInfo.get(held.c);
    if (ch == null) return null;
    if (ch.runFrom >= 0) return inWindow(ch.runFrom, 0);
    int i = heldAnchor(ch);
    return inWindow(held.c, i < 0 || i >= ch.verseParts.length ? 0 : ch.verseParts[i]);
  }

  // Where it is going's anchor (Listen's verse's first, or the last before
  // it).
  private int heldAnchor(Chapter ch) {
    if (held.verse <= 0) return held.anchor;
    int best = -1;
    for (int i = 0; i < ch.verses.length; i++) {
      if (ch.verses[i] == held.verse) return i;
      if (ch.verses[i] < held.verse) best = i;
    }
    return best;
  }

  // Where it is going made, as far as it can be: its chapter's parts and
  // its own asked for; the window begun again at its part if it isn't
  // there; the reading line there (gliding, brought there from near); and,
  // once its part is here and has come, its place told and at rest.
  private void resolveHeld() {
    Target t = held;
    if (t == null || contentWidth() <= 0 || getHeight() <= 0) return;
    Chapter ch = chapterInfo.get(t.c);
    if (ch == null) {
      want(t.c, 0);
      return;
    }
    int anchor = ch.runFrom >= 0 ? -1 : heldAnchor(ch);
    Part p = ch.runFrom >= 0 ? fresh(ch.runFrom, 0, true)
        : fresh(t.c, anchor < 0 || anchor >= ch.verseParts.length ? 0 : ch.verseParts[anchor], true);
    if (p == null) return;
    boolean here = window.contains(p);
    if (!here) {
      measure(p);
      window.clear();
      window.add(p);
      commitWindowOnly();
    }
    OptionalDouble y = placeY(ch.runFrom >= 0 ? ch.runFrom : t.c, anchor, ch.runFrom >= 0 ? 0 : t.frac);
    if (!y.isPresent()) return;
    if (!t.arrived && t.glides && here && animatorsOn()
        && Math.abs(y.getAsDouble() - lineY()) <= GLIDE_REACH_SCREENS * visibleHeight()) {
      motion = Motion.GLIDING;
      startGlide(spotAtLine(), spotAt(y.getAsDouble()));
    } else if (glide == null) placeLine(y.getAsDouble());
    fillSoon();
    if (p.coming || t.arrived) return;
    t.arrived = true;
    if (glide == null) arrived();
  }

  // The window's tops and the list told, without placing anything.
  private void commitWindowOnly() {
    double y = 0;
    for (Part p : window) {
      p.top = y;
      y += p.height;
    }
    adapter.notifyDataSetChanged();
  }

  // Where it is going in the window (empty: not here yet).
  private OptionalDouble heldY() {
    Target t = held;
    Chapter ch = t == null ? null : chapterInfo.get(t.c);
    if (ch == null) return OptionalDouble.empty();
    return ch.runFrom >= 0 ? placeY(ch.runFrom, -1, 0) : placeY(t.c, heldAnchor(ch), t.frac);
  }

  // There: its place told, and at rest.
  private void arrived() {
    motion = Motion.STILL;
    sendAt(true);
    sayRest();
  }

  // ---- following (Linking's) ----
  // The top of what of it is in sight, down the window, and how tall that
  // is (following's sight: SKINS.md, Panes: Linked).
  double sightTop() {
    return viewTop() + getPaddingTop();
  }

  double sightHeight() {
    return visibleHeight();
  }

  // Its sight's top put at top, following (a frame of a glide, or at once).
  void followSight(double top) {
    followTo(top - getPaddingTop() + lineOffset());
  }

  // Whether chapter c's anchors are known (its parts said), its first part
  // asked for if not (which says them).
  boolean chapterKnown(int c) {
    Chapter ch = chapterInfo.get(c);
    if (ch != null && ch.parts > 0) return true;
    want(c, 0);
    return false;
  }

  // The chapter at the top of its sight (-1: none here).
  int chapterAtSight() {
    if (window.isEmpty()) return -1;
    Part p = window.get(indexAt(sightTop()));
    return p.c;
  }

  // Its reading line to y, following, at once.
  void followTo(double y) {
    if (touching) return;
    if (glide != null) stopMoving();
    held = null;
    motion = Motion.FOLLOWING;
    nudgeLine(y);
    restSoon();
  }

  // Brought to anchor i of chapter c (-1: its top), following by comment
  // (or a version not laid out there yet): a glide if it is near, at once
  // if not (or if glides is false); nothing if it is going there already.
  void bring(int c, int i, boolean glides) {
    if (touching) return;
    if (held != null && held.verse == 0 && held.c == c && held.anchor == i) return;
    stopMoving();
    motion = Motion.STILL;
    held = new Target(c, i, 0, 0, glides, true);
    resolveHeld();
  }

  // ---- gliding ----
  private void startGlide(Spot from, Spot to) {
    if (from == null || to == null) return;
    glide = new Glide(from, to, SystemClock.uptimeMillis());
    postOnAnimation(glideFrame);
  }

  private final Runnable glideFrame = this::glideStep;

  private void glideStep() {
    Glide g = glide;
    if (g == null) return;
    OptionalDouble from = spotY(g.from), to = spotY(g.to);
    float t = (SystemClock.uptimeMillis() - g.start) / (float) GLIDE_MS;
    if (!from.isPresent() || !to.isPresent() || t >= 1) {
      glide = null;
      OptionalDouble end = held != null ? heldY() : to;
      if (end.isPresent()) nudgeLine(end.getAsDouble());
      Motion was = motion;
      motion = Motion.STILL;
      if (held != null && held.arrived || was == Motion.PAGED) arrived();
      if (was == Motion.PAGED && moves != null) moves.rested(this);
      return;
    }
    nudgeLine(from.getAsDouble() + (to.getAsDouble() - from.getAsDouble()) * ease.getInterpolation(t));
    postOnAnimation(glideFrame);
  }

  // Its glide, or the list's fling, stopped.
  private void stopMoving() {
    glide = null;
    removeCallbacks(glideFrame);
    if (scrollState == OnScrollListener.SCROLL_STATE_FLING) smoothScrollBy(0, 0);
  }

  // ---- telling core ----
  // It moved (the list scrolled, or laid itself out): the window kept, the
  // anchor at the reading line told if it changed, and what follows it
  // told.
  private void moved() {
    if (laying || contentWidth() <= 0 || window.isEmpty()) return;
    fillSoon();
    sendAt(false);
    if (moves != null) moves.moved(this);
  }

  // `at P C I FRAC`, if the anchor at the reading line changed since it was
  // told (or always: at rest). Not while it is going somewhere it hasn't
  // come to.
  private void sendAt(boolean always) {
    if (held != null && !held.arrived) return;
    Place p = placeAtLine();
    if (p == null) return;
    if (!always && p.c == atC && p.i == atI) return;
    atC = p.c;
    atI = p.i;
    say("at " + pane + " " + p.c + " " + p.i + " " + p.frac);
  }

  private void sayMoving() {
    saidMoving = true;
    cancelRest();
    say("moving " + pane + " " + now());
    if (moves != null) moves.moving(this);
  }

  // `rest P ENDS_HI MS`: the last chapter whose end is in sight (-1 none).
  private void sayRest() {
    saidMoving = false;
    cancelRest();
    if (window.isEmpty()) return;
    sendAt(true);
    double top = viewTop() + getPaddingTop(), bottom = viewTop() + getHeight() - getPaddingBottom();
    int endsHi = -1;
    for (Part p : window) {
      if (p.endsChapter() && p.bottom() >= top && p.bottom() <= bottom + 1)
        endsHi = Math.max(endsHi, p.runTo >= 0 ? p.runTo : p.c);
    }
    say("rest " + pane + " " + endsHi + " " + now());
  }

  // Moved by following: at rest once it has stayed still a moment.
  private final Runnable restLater = () -> {
    if (motion == Motion.FOLLOWING) motion = Motion.STILL;
    sayRest();
  };

  private void restSoon() {
    removeCallbacks(restLater);
    postDelayed(restLater, REST_AFTER_MS);
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
  }

  // The skin's clock for core (ms).
  static long now() {
    return SystemClock.uptimeMillis();
  }

  // ---- a finger ----
  private void scrollStateChanged(int state) {
    scrollState = state;
    if (state == OnScrollListener.SCROLL_STATE_TOUCH_SCROLL) {
      takenByHand();
      motion = Motion.DRAGGED;
    } else if (state == OnScrollListener.SCROLL_STATE_FLING) {
      // (After a finger, a fling; without one, TalkBack's scroll: either
      // leads.)
      if (motion != Motion.DRAGGED) takenByHand();
      motion = Motion.FLUNG;
    } else if (motion == Motion.DRAGGED || motion == Motion.FLUNG) {
      motion = Motion.STILL;
      if (!touching) rested();
    }
  }

  // A hand moves it: where it was going let go, and it leads.
  private void takenByHand() {
    held = null;
    glide = null;
    removeCallbacks(glideFrame);
    if (!saidMoving) sayMoving();
  }

  private void rested() {
    sayRest();
    if (moves != null) moves.rested(this);
  }

  @Override
  public boolean dispatchTouchEvent(MotionEvent e) {
    int action = e.getActionMasked();
    if (action == MotionEvent.ACTION_DOWN) {
      touching = true;
      // (A finger on it moving stops it, and holds it: it leads, and it is
      // not a tap.)
      caught = glide != null || motion == Motion.FLUNG || motion == Motion.PAGED;
      held = null;
      if (caught) {
        glide = null;
        removeCallbacks(glideFrame);
        motion = Motion.DRAGGED;
        sayMoving();
      } else if (motion == Motion.FOLLOWING) motion = Motion.STILL;
    } else if (action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL) touching = false;
    taps.onTouchEvent(e);
    boolean took = super.dispatchTouchEvent(e);
    if ((action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_CANCEL)
        && scrollState == OnScrollListener.SCROLL_STATE_IDLE && saidMoving) {
      motion = Motion.STILL;
      rested();
    }
    return took;
  }

  // ---- taps ----
  // A tap: on the page, a footnote's mark, a word of the original, the
  // ESV's line or a reference (core's, give or take a letter), else the
  // verse there (core toggles it and says the selection) or nothing; in the
  // panel's reader, a reference, previewed. (A tap that lets the text's
  // own selection go does only that.)
  private void tapped(float x, float y) {
    TextView tv = null;
    for (int n = 0; n < getChildCount(); n++) {
      View child = getChildAt(n);
      if (child instanceof TextView && y >= child.getTop() && y < child.getBottom()) tv = (TextView) child;
    }
    Part p = tv == null ? null : (Part) tv.getTag();
    if (p == null || tv.getLayout() == null) {
      if (pane == PAGE) say("tapnone");
      return;
    }
    if (tv.hasSelection()) return;
    int off = tv.getOffsetForPosition(x - tv.getLeft(), y - tv.getTop());
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
    for (int i = 0; i < p.verses.length; i += 3)
      if (off >= p.verses[i + 1] && off < p.verses[i + 2]) v = p.verses[i];
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
    redrawChapters(c, was);
  }

  void clearSelection() {
    int c = selC;
    sel.clear();
    selC = -1;
    redrawChapters(c, c);
  }

  // The parts in sight of chapters a and b shown again (what is washed on
  // them changed; their heights are the same).
  private void redrawChapters(int a, int b) {
    for (int n = 0; n < getChildCount(); n++) {
      View child = getChildAt(n);
      Part p = (Part) child.getTag();
      if (p == null || (p.c != a && p.c != b) || !(child instanceof TextView)) continue;
      markSelection(p);
      markHeard(p);
      ((TextView) child).setText(p.text);
    }
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
    redrawChapters(c, was);
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
  protected void onSizeChanged(int w, int h, int oldW, int oldH) {
    // (What was at the reading line kept there: as far through its
    // anchor's span, for a new width.)
    double before = viewTop() + getPaddingTop() + readingLine
        * Math.max(1, oldH - getPaddingTop() - getPaddingBottom());
    Spot keep = window.isEmpty() ? null : spotAt(before);
    Place place = w != oldW && !window.isEmpty() ? placeAt(before) : null;
    super.onSizeChanged(w, h, oldW, oldH);
    if (w <= 0 || h <= 0) return;
    remeasureAndKeep(keep, place);
    resolveHeld();
  }
}
