package space.trailingwhite.smoothbible;

import android.content.Context;
import android.text.Layout;
import android.text.SpannableStringBuilder;
import android.util.SparseArray;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AbsListView;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;

// The reader (SKINS.md, a view a skin makes itself): every chapter, a row
// each, scrolled continuously; each chapter's text and runs asked of core
// when it is first wanted (want C), and the place at the top told back
// (place C V FRAC).
final class Reader extends ListView {
  final Look look;
  int count;
  // Each chapter's text as core gave it, and its verses (number, start, end).
  final SparseArray<SpannableStringBuilder> texts = new SparseArray<>();
  final SparseArray<int[]> verses = new SparseArray<>();
  // Each chapter's links (A, B, KIND, ARG each: a footnote's mark, 0; a
  // reference, 1; a word of the original's, 2), as core gave them.
  final SparseArray<long[]> links = new SparseArray<>();
  final SparseArray<Boolean> asked = new SparseArray<>();
  int topInset;
  // A jump not yet made exactly: to verse jumpV of chapter jumpC, once it
  // is laid out.
  int jumpC = -1, jumpV;
  private int saidC = -1, saidV = -1, saidF = -1;
  // The verses selected (of chapter selC, -1 none), in order: core's tray
  // shows what can be done with them.
  int selC = -1;
  final java.util.TreeSet<Integer> sel = new java.util.TreeSet<>();

  Reader(Context c, Look look) {
    super(c);
    this.look = look;
    setDivider(null);
    setSelector(android.R.color.transparent);
    setAdapter(adapter);
    // (A tap on a verse selects it, or lets it go.)
    GestureDetector taps = new GestureDetector(c, new GestureDetector.SimpleOnGestureListener() {
      @Override
      public boolean onSingleTapUp(MotionEvent e) {
        tapped(e.getX(), e.getY());
        return false;
      }
    });
    setOnTouchListener((v, e) -> {
      taps.onTouchEvent(e);
      return false;
    });
    setOnScrollListener(new OnScrollListener() {
      @Override
      public void onScrollStateChanged(AbsListView v, int state) {}

      @Override
      public void onScroll(AbsListView v, int first, int n, int total) {
        tellPlace();
      }
    });
  }

  void setCount(int n) {
    count = n;
    forget();
  }

  // Every chapter laid out again (the settings, or the version, changed).
  void forget() {
    texts.clear();
    verses.clear();
    links.clear();
    asked.clear();
    adapter.notifyDataSetChanged();
  }

  // chapter C's lines: its text, then span and verse lines, to end.
  void chapter(int c, String text, java.util.List<Wire> lines) {
    SpannableStringBuilder s = new SpannableStringBuilder(text);
    int em = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, look.textSp(),
        getResources().getDisplayMetrics());
    int[] vs = new int[lines.size() * 3];
    int nv = 0;
    int paraEnd = -1;
    for (Wire w : lines) {
      if (w.word(0).equals("span")) {
        int a = Math.min(w.num(1), s.length()), b = Math.min(w.num(2), s.length());
        if (b > a) look.style(s, a, b, w.num(3));
        int para = w.num(4);
        if (para != Look.PROSE && a >= paraEnd) {
          int pa = a;
          while (pa > 0 && s.charAt(pa - 1) != '\n') pa--;
          // (A run that ends with its newline ends its paragraph there.)
          int pb = b;
          if (pb == a || s.charAt(pb - 1) != '\n') {
            while (pb < s.length() && s.charAt(pb) != '\n') pb++;
            if (pb < s.length()) pb++;
          }
          look.para(s, pa, pb, para, em);
          paraEnd = pb;
        }
      } else if (w.word(0).equals("verse")) {
        vs[nv * 3] = w.num(1);
        vs[nv * 3 + 1] = w.num(2);
        vs[nv * 3 + 2] = w.num(3);
        nv++;
      }
    }
    texts.put(c, s);
    verses.put(c, java.util.Arrays.copyOf(vs, nv * 3));
    java.util.ArrayList<long[]> ls = new java.util.ArrayList<>();
    for (Wire w : lines) {
      if (!w.word(0).equals("link")) continue;
      long arg;
      try {
        arg = Long.parseLong(w.word(4));
      } catch (NumberFormatException e) {
        continue;
      }
      ls.add(new long[] {w.num(1), w.num(2), w.num(3), arg});
    }
    long[] lk = new long[ls.size() * 4];
    for (int i = 0; i < ls.size(); i++) System.arraycopy(ls.get(i), 0, lk, i * 4, 4);
    links.put(c, lk);
    // (What is marked: a highlight's color behind its verse.)
    for (Wire w : lines) {
      if (!w.word(0).equals("mark") || w.word(2).equals("-")) continue;
      int[] r = range(c, w.num(1));
      if (r != null) s.setSpan(new android.text.style.BackgroundColorSpan(
          Look.alpha(Look.color(w.word(2)), look.dark ? 0.32f : 0.4f)), r[0], r[1],
          android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
    if (c == selC) markSelection(c);
    changed();
    if (c == jumpC) post(this::finishJump);
  }

  // The rows' heights changed: the row at the place kept where it is (a
  // chapter above it coming in taller than its guess must not move it).
  private void changed() {
    int at = -1, top = 0;
    for (int k = 0; k < getChildCount(); k++) {
      View r = getChildAt(k);
      if (r.getBottom() > topInset) {
        at = getFirstVisiblePosition() + k;
        top = r.getTop();
        break;
      }
    }
    adapter.notifyDataSetChanged();
    if (at >= 0 && jumpC < 0) setSelectionFromTop(at, top);
  }

  void jump(int c, int v) {
    if (c < 0 || c >= count) return;
    jumpC = c;
    jumpV = v;
    setSelectionFromTop(c, topInset);
    want(c);
    post(this::finishJump);
  }

  // The jump made exact, to its verse, once its chapter is laid out.
  private void finishJump() {
    int c = jumpC;
    if (c < 0 || texts.get(c) == null) return;
    View row = childFor(c);
    if (row == null) {
      setSelectionFromTop(c, topInset);
      post(this::finishJump);
      return;
    }
    TextView tv = (TextView) row;
    Layout l = tv.getLayout();
    if (l == null) {
      post(this::finishJump);
      return;
    }
    int y = 0;
    int[] vs = verses.get(c);
    if (jumpV > 0 && vs != null) {
      for (int i = 0; i < vs.length; i += 3) {
        if (vs[i] == jumpV) {
          y = l.getLineTop(l.getLineForOffset(vs[i + 1])) + tv.getPaddingTop();
          break;
        }
      }
    }
    jumpC = -1;
    setSelectionFromTop(c, topInset - y);
  }

  // Verse v's place in chapter c's text (null: not there).
  private int[] range(int c, int v) {
    int[] vs = verses.get(c);
    SpannableStringBuilder s = texts.get(c);
    if (vs == null || s == null) return null;
    for (int i = 0; i < vs.length; i += 3) {
      if (vs[i] == v) {
        int a = Math.min(vs[i + 1], s.length()), b = Math.min(vs[i + 2], s.length());
        return b > a ? new int[] {a, b} : null;
      }
    }
    return null;
  }

  // A tap at x, y: the verse there selected, or let go; core told the
  // verses selected now (none: the tray away).
  private void tapped(float x, float y) {
    int c = pointToPosition((int) x, (int) y);
    View row = c == INVALID_POSITION ? null : childFor(c);
    if (!(row instanceof TextView)) return;
    TextView tv = (TextView) row;
    Layout l = tv.getLayout();
    int[] vs = verses.get(c);
    if (l == null || vs == null) return;
    int line = l.getLineForVertical((int) y - row.getTop() - tv.getPaddingTop());
    int off = l.getOffsetForHorizontal(line, x - tv.getPaddingLeft());
    // (A footnote's mark or a reference under the finger, give or take a
    // letter: core's, not a selection.)
    long[] lk = links.get(c);
    if (lk != null) {
      for (int i = 0; i + 3 < lk.length; i += 4) {
        if (off >= lk[i] - 1 && off <= lk[i + 1] && lk[i + 2] != 2) {
          Native.send(lk[i + 2] == 0 ? "footnote " + c + " " + lk[i + 3] : "preview " + lk[i + 3]);
          return;
        }
      }
    }
    int v = 0;
    for (int i = 0; i < vs.length; i += 3) if (off >= vs[i + 1] && off < vs[i + 2]) v = vs[i];
    if (v <= 0) return;
    if (c != selC) clearSelection();
    selC = c;
    if (!sel.remove(v)) sel.add(v);
    markSelection(c);
    changed();
    StringBuilder b = new StringBuilder("select " + c);
    for (int k : sel) b.append(' ').append(k);
    Native.send(b.toString());
    if (sel.isEmpty()) selC = -1;
  }

  // The selection washed (an underline of the accent's color under it).
  static final class Sel extends android.text.style.BackgroundColorSpan {
    Sel(int color) {
      super(color);
    }
  }

  private void markSelection(int c) {
    SpannableStringBuilder s = texts.get(c);
    if (s == null) return;
    for (Sel o : s.getSpans(0, s.length(), Sel.class)) s.removeSpan(o);
    if (c != selC) return;
    for (int v : sel) {
      int[] r = range(c, v);
      if (r != null) s.setSpan(new Sel(Look.alpha(look.accent, 0.18f)), r[0], r[1],
          android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
  }

  // The selection let go (core's clear_selection, or another chapter's).
  void clearSelection() {
    int c = selC;
    sel.clear();
    selC = -1;
    if (c >= 0) {
      markSelection(c);
      changed();
    }
  }

  // Chapter c asked for again (what is marked on it changed).
  void reask(int c) {
    if (c < 0 || c >= count) return;
    asked.remove(c);
    want(c);
  }

  private View childFor(int c) {
    int first = getFirstVisiblePosition();
    if (c < first || c >= first + getChildCount()) return null;
    return getChildAt(c - first);
  }

  private void want(int c) {
    if (c < 0 || c >= count || asked.get(c) != null) return;
    asked.put(c, true);
    Native.send("want " + c);
  }

  // The place at the top, told when it changes: its chapter, the verse
  // whose text is there, and how far into it (thousandths of an em).
  void tellPlace() {
    if (getChildCount() == 0 || jumpC >= 0) return;
    int c = getFirstVisiblePosition();
    View row = getChildAt(0);
    for (int k = 0; k < getChildCount(); k++) {
      View r = getChildAt(k);
      if (r.getBottom() > topInset) {
        c = getFirstVisiblePosition() + k;
        row = r;
        break;
      }
    }
    if (!(row instanceof TextView)) return;
    TextView tv = (TextView) row;
    Layout l = tv.getLayout();
    int[] vs = verses.get(c);
    int v = 0, f = 0;
    if (l != null && vs != null && vs.length > 0) {
      int y = topInset - row.getTop() - tv.getPaddingTop();
      int line = l.getLineForVertical(Math.max(0, y));
      int at = l.getLineStart(line);
      for (int i = 0; i < vs.length; i += 3) {
        if (vs[i + 1] <= at) v = vs[i];
        if (vs[i + 1] <= at) {
          float em = tv.getTextSize();
          int vy = l.getLineTop(l.getLineForOffset(vs[i + 1]));
          f = (int) ((y - vy) * 1000 / Math.max(1f, em));
        }
      }
    }
    if (c != saidC || v != saidV || Math.abs(f - saidF) > 400) {
      saidC = c;
      saidV = v;
      saidF = f;
      Native.send("place " + c + " " + v + " " + Math.max(0, f));
    }
  }

  private final BaseAdapter adapter = new BaseAdapter() {
    @Override
    public int getCount() {
      return count;
    }

    @Override
    public Object getItem(int i) {
      return null;
    }

    @Override
    public long getItemId(int i) {
      return i;
    }

    @Override
    public View getView(int i, View old, ViewGroup parent) {
      TextView tv = old instanceof TextView ? (TextView) old : new TextView(getContext());
      int m = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, look.margin,
          getResources().getDisplayMetrics());
      tv.setPadding(m, (int) (m * 0.8f), m, (int) (m * 0.8f));
      tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, look.textSp());
      tv.setLineSpacing(0, look.spacing);
      tv.setTextColor(look.ink);
      tv.setTypeface(android.graphics.Typeface.SERIF);
      tv.setTextIsSelectable(false);
      SpannableStringBuilder s = texts.get(i);
      if (s == null) {
        want(i);
        // (A guess at its height until it comes: about a chapter's.)
        tv.setText("\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n");
      } else tv.setText(s);
      // (The chapters near it asked for too, ahead of the scroll.)
      want(i + 1);
      want(i - 1);
      return tv;
    }
  };
}
