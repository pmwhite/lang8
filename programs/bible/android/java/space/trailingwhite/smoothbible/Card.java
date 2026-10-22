package space.trailingwhite.smoothbible;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import java.util.ArrayList;

// Share as Image's card (core/share.l8's CUSTOM_CARD row, SKINS.md), drawn
// at its pixels: core gives the words and their runs (RUN_CARD + the
// piece's kind: 0 words, 1 supplied, 2 His words, 3 both, 4 a verse's
// number; + 8 an indented line, 16 Greek, 32 Hebrew, 64 small capitals),
// the colors and its measures (W H MARGIN GAP REF VERSION MOST LEAST
// STEP); the words are set at the largest size that fits above the
// reference, centered with it.
final class Card {
  static final int RUN_CARD = 300;

  private static final class Part {
    String text;
    int st;

    Part(String t, int s) {
      text = t;
      st = s;
    }
  }

  private static final class Atom {
    final ArrayList<Part> parts = new ArrayList<>();
    boolean brk, indent;
    float w;
  }

  private static final class Line {
    final ArrayList<Atom> atoms = new ArrayList<>();
    float w, ind;
    boolean end;
  }

  static Bitmap draw(Screen.Row r, Typeface body) {
    int[] m = Screen.nums(r.trailing, ' ');
    if (m.length < 9) return null;
    int W = m[0], H = m[1], margin = m[2], gap = m[3], refSize = m[4], versionSize = m[5];
    String[] cs = Screen.split(r.options);
    int bg = cs.length > 0 ? Look.color(cs[0]) : 0xFFFBF8F2;
    int ink = cs.length > 1 ? Look.color(cs[1]) : 0xFF1E1C19;
    int faint = cs.length > 2 ? Look.color(cs[2]) : 0xFF8A8378;
    int accent = cs.length > 3 ? Look.color(cs[3]) : 0xFF9C3A2C;
    // The pieces, then the words (split after a space; lines broken where
    // core breaks them).
    ArrayList<Part> pieces = new ArrayList<>();
    int at = 0;
    for (int i = 0; i + 1 < r.runs.length; i += 2) {
      int end = Math.min(r.runs[i], r.detail.length());
      if (end > at) pieces.add(new Part(r.detail.substring(at, end), r.runs[i + 1] - RUN_CARD));
      at = Math.max(at, end);
    }
    if (at < r.detail.length()) pieces.add(new Part(r.detail.substring(at), 0));
    boolean rtl = false;
    for (Part p : pieces) if ((p.st & 32) != 0) rtl = true;
    ArrayList<Atom> atoms = new ArrayList<>();
    Atom atom = new Atom();
    for (Part p : pieces) {
      int i = 0;
      String t = p.text;
      while (i < t.length()) {
        char ch = t.charAt(i);
        if (ch == '\n') {
          if (!atom.parts.isEmpty()) atoms.add(atom);
          atom = new Atom();
          atom.brk = true;
          i++;
        } else if (ch == ' ') {
          if (!atom.parts.isEmpty()) {
            atom.parts.get(atom.parts.size() - 1).text += " ";
            atoms.add(atom);
            atom = new Atom();
          }
          i++;
        } else {
          int j = i;
          while (j < t.length() && t.charAt(j) != ' ' && t.charAt(j) != '\n') j++;
          if (atom.parts.isEmpty()) atom.indent = (p.st & 8) != 0;
          atom.parts.add(new Part(t.substring(i, j), p.st));
          i = j;
        }
      }
    }
    if (!atom.parts.isEmpty()) atoms.add(atom);
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    float w = W - 2 * margin;
    float refH = refSize * 1.25f;
    float room = H - 2 * margin - gap - refH;
    float s = m[6];
    ArrayList<Line> lines = lay(atoms, s, w, paint, body);
    while (s > m[7] && height(lines, s, rtl) > room) {
      s -= m[8];
      lines = lay(atoms, s, w, paint, body);
    }
    float lh = s * (rtl ? 1.5f : 1.35f);
    float textH = height(lines, s, rtl);
    float top = Math.max(margin, (H - textH - gap - refH) / 2);
    Bitmap b = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
    Canvas c = new Canvas(b);
    c.drawColor(bg);
    float y = top;
    for (Line line : lines) {
      float base = y + lh * 0.78f;
      float x = rtl ? W - margin - line.ind : margin + line.ind;
      for (Atom a : line.atoms) {
        ArrayList<Part> ps = new ArrayList<>(a.parts);
        if (rtl) java.util.Collections.reverse(ps);
        for (Part p : ps) {
          font(paint, p.st, s, body);
          int k = p.st & 7;
          paint.setColor(k == 4 ? faint : k == 2 || k == 3 ? accent : ink);
          float pw = paint.measureText(p.text);
          if (rtl) x -= pw;
          c.drawText(p.text, x, k == 4 ? base - s * 0.3f : base, paint);
          if (!rtl) x += pw;
        }
      }
      y += lh + (line.end ? s * 0.25f : 0);
    }
    // The reference, then the version (at the right under Hebrew).
    float ry = top + textH + gap + refSize;
    String version = " " + r.suffix.trim();
    paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
    paint.setTextSize(refSize);
    float rw = paint.measureText(r.title);
    paint.setTypeface(Typeface.SANS_SERIF);
    paint.setTextSize(versionSize);
    float vw = paint.measureText(version);
    float x = rtl ? W - margin - rw - vw : margin;
    paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
    paint.setTextSize(refSize);
    paint.setColor(accent);
    c.drawText(r.title, x, ry, paint);
    paint.setTypeface(Typeface.SANS_SERIF);
    paint.setTextSize(versionSize);
    paint.setColor(faint);
    c.drawText(version, x + rw, ry, paint);
    return b;
  }

  private static void font(Paint p, int st, float s, Typeface body) {
    int k = st & 7;
    if (k == 4) {
      p.setTypeface(Typeface.SANS_SERIF);
      p.setTextSize(s * 0.6f);
      return;
    }
    Typeface face = (st & 32) != 0 ? Typeface.SANS_SERIF : (st & 16) != 0 ? Typeface.SERIF : body;
    p.setTypeface(Typeface.create(face, k == 1 || k == 3 ? Typeface.ITALIC : Typeface.NORMAL));
    p.setTextSize((st & 64) != 0 ? s * 0.8f : (st & 32) != 0 ? s * 1.15f : s);
  }

  private static ArrayList<Line> lay(ArrayList<Atom> atoms, float s, float w, Paint paint,
      Typeface body) {
    ArrayList<Line> lines = new ArrayList<>();
    Line line = null;
    for (Atom a : atoms) {
      float aw = 0;
      for (Part p : a.parts) {
        font(paint, p.st, s, body);
        aw += paint.measureText(p.text);
      }
      a.w = aw;
      float ind = a.indent ? 40 : 0;
      if (line == null || a.brk || (line.w + aw > w - line.ind && !line.atoms.isEmpty())) {
        if (line != null && a.brk) line.end = true;
        Line next = new Line();
        next.ind = line != null && !a.brk ? line.ind : ind;
        line = next;
        lines.add(line);
      }
      line.atoms.add(a);
      line.w += aw;
    }
    return lines;
  }

  private static float height(ArrayList<Line> lines, float s, boolean rtl) {
    float h = lines.size() * s * (rtl ? 1.5f : 1.35f);
    for (Line l : lines) if (l.end) h += s * 0.25f;
    return h;
  }
}
