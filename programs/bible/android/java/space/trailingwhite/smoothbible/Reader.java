package space.trailingwhite.smoothbible;

import android.content.Context;
import android.text.Layout;
import android.text.SpannableStringBuilder;
import android.util.SparseArray;
import android.util.TypedValue;
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
  final SparseArray<Boolean> asked = new SparseArray<>();
  int topInset;
  // A jump not yet made exactly: to verse jumpV of chapter jumpC, once it
  // is laid out.
  int jumpC = -1, jumpV;
  private int saidC = -1, saidV = -1, saidF = -1;

  Reader(Context c, Look look) {
    super(c);
    this.look = look;
    setDivider(null);
    setSelector(android.R.color.transparent);
    setAdapter(adapter);
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
