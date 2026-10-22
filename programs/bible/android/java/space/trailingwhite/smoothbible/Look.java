package space.trailingwhite.smoothbible;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.text.Layout;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.AlignmentSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.LeadingMarginSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.ReplacementSpan;
import android.text.style.StyleSpan;
import android.text.style.SuperscriptSpan;
import android.text.style.TypefaceSpan;

// The look core says (the look line: SKINS.md), and the reader's styles
// (core/text.l8's STYLE_ and PARA_ numbers) as Android's spans.
final class Look {
  float size = 1, spacing = 1.32f;
  int margin = 28;
  boolean dark, red;
  int bg = 0xFFFBF8F2, ink = 0xFF1E1C19, heading = 0xFF4F4943, faint = 0xFF8A8378,
      accent = 0xFF9C3A2C, rule = 0xFF1E1C19, glossLine = 0x521E1C19;

  // look SIZE SPACING MARGIN DARK RED BG INK HEADING FAINT ACCENT RULE GLOSS
  // (GLOSS: the rule's strength under a glossed word, thousandths)
  void read(Wire w) {
    size = w.num(1) / 1000f;
    spacing = w.num(2) / 1000f;
    margin = w.num(3);
    dark = w.num(4) != 0;
    red = w.num(5) != 0;
    bg = color(w.word(6));
    ink = color(w.word(7));
    heading = color(w.word(8));
    faint = color(w.word(9));
    accent = color(w.word(10));
    rule = color(w.word(11));
    glossLine = alpha(rule, w.num(12) / 1000f);
  }

  static int color(String hex) {
    try {
      return 0xFF000000 | Integer.parseInt(hex, 16);
    } catch (NumberFormatException e) {
      return Color.GRAY;
    }
  }

  // The body's size (sp): the iPhone's 19 points, stepped.
  float textSp() {
    return 19 * size;
  }

  static final int BODY = 0, VERSE = 1, BOOK = 2, NUMERAL = 3, HEAD = 4, SUBHEAD = 5, REF = 6,
      TITLE = 7, MAJOR = 8, RANGE = 9, ACROSTIC = 10, NOTE = 11, BOOKLABEL = 12, CAPS = 13,
      RULE = 14, NUMERAL1 = 15, JESUS = 16, JESUS_CAPS = 17, XREF = 18, SUPPLIED = 19,
      JESUS_SUPPLIED = 20, PASSAGE = 21, ORIG = 22, ORIG_GL = 23, OTITLE = 24, OTITLE_GL = 25,
      QERE = 26, APPARATUS = 27, APP_ENTRY = 28;
  static final int PROSE = 0, Q1 = 1, Q2 = 2, L1 = 3, L2 = 4, CENTER = 5, RIGHT = 6, VERSE_LINE = 7;

  private static void span(SpannableStringBuilder s, Object o, int a, int b) {
    s.setSpan(o, a, b, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
  }

  // A run of style from a to b.
  void style(SpannableStringBuilder s, int a, int b, int style) {
    switch (style) {
      case VERSE:
        span(s, new SuperscriptSpan(), a, b);
        span(s, new RelativeSizeSpan(0.6f), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        span(s, new TypefaceSpan("sans-serif"), a, b);
        break;
      case BOOK:
        span(s, new RelativeSizeSpan(1.5f), a, b);
        span(s, new ForegroundColorSpan(heading), a, b);
        break;
      case NUMERAL:
      case NUMERAL1:
        span(s, new RelativeSizeSpan(2.2f), a, b);
        span(s, new ForegroundColorSpan(heading), a, b);
        break;
      case HEAD:
      case PASSAGE:
      case ACROSTIC:
        span(s, new StyleSpan(Typeface.BOLD), a, b);
        span(s, new TypefaceSpan("sans-serif"), a, b);
        span(s, new RelativeSizeSpan(0.88f), a, b);
        span(s, new ForegroundColorSpan(heading), a, b);
        break;
      case SUBHEAD:
      case TITLE:
        span(s, new StyleSpan(Typeface.ITALIC), a, b);
        span(s, new ForegroundColorSpan(heading), a, b);
        break;
      case REF:
      case RANGE:
        span(s, new StyleSpan(Typeface.ITALIC), a, b);
        span(s, new RelativeSizeSpan(0.82f), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      case MAJOR:
        span(s, new RelativeSizeSpan(0.82f), a, b);
        span(s, new StyleSpan(Typeface.BOLD), a, b);
        span(s, new ForegroundColorSpan(heading), a, b);
        break;
      case NOTE:
        span(s, new SuperscriptSpan(), a, b);
        span(s, new RelativeSizeSpan(0.6f), a, b);
        span(s, new ForegroundColorSpan(accent), a, b);
        break;
      case BOOKLABEL:
        span(s, new RelativeSizeSpan(0.75f), a, b);
        span(s, new TypefaceSpan("sans-serif"), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      case CAPS:
        span(s, new RelativeSizeSpan(0.8f), a, b);
        break;
      case JESUS_CAPS:
        span(s, new RelativeSizeSpan(0.8f), a, b);
        if (red) span(s, new ForegroundColorSpan(accent), a, b);
        break;
      case JESUS:
        if (red) span(s, new ForegroundColorSpan(accent), a, b);
        break;
      case JESUS_SUPPLIED:
        span(s, new StyleSpan(Typeface.ITALIC), a, b);
        if (red) span(s, new ForegroundColorSpan(accent), a, b);
        break;
      case SUPPLIED:
        span(s, new StyleSpan(Typeface.ITALIC), a, b);
        break;
      case XREF:
        span(s, new ForegroundColorSpan(accent), a, b);
        break;
      case RULE:
        span(s, new Rule(rule), a, b);
        break;
      case ORIG_GL:
      case OTITLE_GL:
        // (A glossed word: a thin underline in the rule's color.)
        span(s, new Glossed(glossLine), a, b);
        if (style == OTITLE_GL) span(s, new ForegroundColorSpan(heading), a, b);
        break;
      case OTITLE:
        span(s, new ForegroundColorSpan(heading), a, b);
        break;
      case QERE:
      case APPARATUS:
      case APP_ENTRY:
        // (The apparatus: small, in the sans face, faint.)
        span(s, new RelativeSizeSpan(0.78f), a, b);
        span(s, new TypefaceSpan("sans-serif"), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      default:
        break;
    }
  }

  // core/ui.l8's runs beyond the reader's styles: a verse's number, a verse
  // a version lacks, Greek and Hebrew (faint or not), a transliteration, a
  // code, faint, strong, plain, small, the reader's face, italic, accent.
  static final int RUN_NUMBER = 100, RUN_MISSING = 101, RUN_GREEK = 102, RUN_HEBREW = 103,
      RUN_TRANSLIT = 104, RUN_CODE = 105, RUN_FAINT = 106, RUN_STRONG = 107, RUN_PLAIN = 108,
      RUN_SMALL = 109, RUN_GREEK_FAINT = 110, RUN_HEBREW_FAINT = 111, RUN_READING = 112,
      RUN_ITALIC = 113, RUN_ACCENT = 114, RUN_SYMBOL = 115, RUN_SYMBOL_BOLD = 116,
      RUN_SCRIPTURE = 117, RUN_PRACTICE = 200;

  // Words set by their runs (END, STYLE pairs; END in UTF-16 units, as
  // Java counts): the reader's styles, or core's RUN_.
  CharSequence rich(String text, int[] runs) {
    if (runs.length < 2) return text;
    SpannableStringBuilder s = new SpannableStringBuilder(text);
    int from = 0;
    for (int i = 0; i + 1 < runs.length; i += 2) {
      int e = Math.max(from, Math.min(runs[i], s.length()));
      if (e > from) run(s, from, e, runs[i + 1]);
      from = e;
    }
    return s;
  }

  private void run(SpannableStringBuilder s, int a, int b, int st) {
    if (st < 100) {
      style(s, a, b, st);
      return;
    }
    if (st >= RUN_PRACTICE && st < RUN_PRACTICE + 256) {
      practice(s, a, b, st - RUN_PRACTICE);
      return;
    }
    switch (st) {
      case RUN_NUMBER:
        span(s, new RelativeSizeSpan(0.78f), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      case RUN_MISSING:
      case RUN_TRANSLIT:
        span(s, new StyleSpan(Typeface.ITALIC), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      case RUN_GREEK:
      case RUN_HEBREW:
      case RUN_READING:
        span(s, new TypefaceSpan("serif"), a, b);
        span(s, new ForegroundColorSpan(ink), a, b);
        break;
      case RUN_GREEK_FAINT:
      case RUN_HEBREW_FAINT:
        span(s, new TypefaceSpan("serif"), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      case RUN_CODE:
        span(s, new TypefaceSpan("monospace"), a, b);
        break;
      case RUN_FAINT:
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      case RUN_STRONG:
        span(s, new StyleSpan(Typeface.BOLD), a, b);
        span(s, new ForegroundColorSpan(ink), a, b);
        break;
      case RUN_PLAIN:
        span(s, new ForegroundColorSpan(ink), a, b);
        break;
      case RUN_SMALL:
        span(s, new RelativeSizeSpan(0.87f), a, b);
        span(s, new ForegroundColorSpan(faint), a, b);
        break;
      case RUN_ITALIC:
        span(s, new StyleSpan(Typeface.ITALIC), a, b);
        span(s, new ForegroundColorSpan(ink), a, b);
        break;
      case RUN_ACCENT:
        span(s, new ForegroundColorSpan(accent), a, b);
        break;
      case RUN_SCRIPTURE:
        span(s, new TypefaceSpan("serif"), a, b);
        span(s, new ForegroundColorSpan(ink), a, b);
        break;
      case RUN_SYMBOL:
      case RUN_SYMBOL_BOLD:
        // (An iPhone symbol, by name: here a small mark in its place.)
        span(s, new Mark(ink), a, b);
        break;
      default:
        break;
    }
  }

  // A Practice passage's run (core/ui.l8's RUN_PRACTICE): its color (clear,
  // ink, learned, faint), its underline (the rule, the accent, half the
  // accent, the accent dotted), the verse heard washed, its script. An
  // underlined run draws itself, so that its line shows under clear
  // letters.
  private void practice(SpannableStringBuilder s, int a, int b, int look) {
    int color = look & 3, under = (look >> 2) & 7;
    int c = color == 0 ? 0 : color == 1 ? ink : color == 2 ? alpha(ink, 0.35f) : faint;
    int wash = (look & 32) != 0 ? alpha(accent, 0.16f) : 0;
    if ((look & 192) != 0) span(s, new TypefaceSpan("serif"), a, b);
    if (under == 0) {
      span(s, new ForegroundColorSpan(c), a, b);
      if (wash != 0) span(s, new android.text.style.BackgroundColorSpan(wash), a, b);
      return;
    }
    int line = under == 1 ? alpha(rule, 0.3f) : under == 3 ? alpha(accent, 0.5f) : accent;
    span(s, new Under(c, line, under == 4, wash), a, b);
  }

  static int alpha(int color, float a) {
    return (Math.round(a * 255) << 24) | (color & 0xFFFFFF);
  }

  // Words drawn in their color (none: clear, their room kept) with a line
  // under them, solid or dotted, on the wash.
  static final class Under extends ReplacementSpan {
    final int color, line, wash;
    final boolean dotted;

    Under(int color, int line, boolean dotted, int wash) {
      this.color = color;
      this.line = line;
      this.dotted = dotted;
      this.wash = wash;
    }

    @Override
    public int getSize(Paint p, CharSequence t, int a, int b, Paint.FontMetricsInt fm) {
      if (fm != null) {
        Paint.FontMetricsInt m = p.getFontMetricsInt();
        fm.ascent = m.ascent;
        fm.descent = m.descent;
        fm.top = m.top;
        fm.bottom = m.bottom;
        fm.leading = m.leading;
      }
      return Math.round(p.measureText(t, a, b));
    }

    @Override
    public void draw(Canvas c, CharSequence t, int a, int b, float x, int top, int y, int bottom,
        Paint p) {
      float w = p.measureText(t, a, b);
      int was = p.getColor();
      float stroke = p.getStrokeWidth();
      if (wash != 0) {
        p.setColor(wash);
        c.drawRect(x, top, x + w, bottom, p);
      }
      if (color != 0) {
        p.setColor(color);
        c.drawText(t, a, b, x, y, p);
      }
      p.setColor(line);
      float thick = Math.max(1.5f, p.getTextSize() / 14);
      float uy = y + p.getTextSize() * 0.2f;
      if (dotted) {
        for (float d = x; d < x + w; d += thick * 3) c.drawCircle(d + thick / 2, uy, thick / 2, p);
      } else c.drawRect(x, uy - thick / 2, x + w, uy + thick / 2, p);
      p.setColor(was);
      p.setStrokeWidth(stroke);
    }
  }

  // A paragraph of kind para over a to b (whole lines).
  void para(SpannableStringBuilder s, int a, int b, int para, int em) {
    switch (para) {
      case Q1:
      case L1:
        span(s, new LeadingMarginSpan.Standard(em, em), a, b);
        break;
      case Q2:
      case L2:
        span(s, new LeadingMarginSpan.Standard(em * 2, em * 2), a, b);
        break;
      case VERSE_LINE:
        span(s, new LeadingMarginSpan.Standard(0, em), a, b);
        break;
      case CENTER:
        span(s, new AlignmentSpan.Standard(Layout.Alignment.ALIGN_CENTER), a, b);
        break;
      case RIGHT:
        span(s, new AlignmentSpan.Standard(Layout.Alignment.ALIGN_OPPOSITE), a, b);
        break;
      default:
        break;
    }
  }

  // A symbol core names, drawn as a small ring.
  static final class Mark extends ReplacementSpan {
    final int color;

    Mark(int color) {
      this.color = color;
    }

    @Override
    public int getSize(Paint p, CharSequence t, int a, int b, Paint.FontMetricsInt fm) {
      return (int) p.measureText(" \u25CB ");
    }

    @Override
    public void draw(Canvas c, CharSequence t, int a, int b, float x, int top, int y, int bottom,
        Paint p) {
      int was = p.getColor();
      p.setColor(color);
      c.drawText(" \u25CB ", x, y, p);
      p.setColor(was);
    }
  }

  // The divider between chapters (an object character in the text): a
  // short line across the middle of its line.
  static final class Glossed extends android.text.style.CharacterStyle {
    final int color;

    Glossed(int color) {
      this.color = color;
    }

    @Override
    public void updateDrawState(android.text.TextPaint tp) {
      // (Its own stroke, as a suggestion's: not the ink's underline.)
      tp.underlineColor = color;
      tp.underlineThickness = Math.max(1f, tp.getTextSize() / 18f);
    }
  }

  static final class Rule extends ReplacementSpan {
    final int color;

    Rule(int color) {
      this.color = color;
    }

    @Override
    public int getSize(Paint p, CharSequence t, int a, int b, Paint.FontMetricsInt fm) {
      return (int) (p.getTextSize() * 6);
    }

    @Override
    public void draw(Canvas c, CharSequence t, int a, int b, float x, int top, int y, int bottom,
        Paint p) {
      int was = p.getColor();
      float w = p.getStrokeWidth();
      p.setColor(color);
      p.setAlpha(40);
      p.setStrokeWidth(Math.max(1, p.getTextSize() / 16));
      float mid = (top + bottom) / 2f;
      c.drawLine(x, mid, x + p.getTextSize() * 6, mid, p);
      p.setColor(was);
      p.setStrokeWidth(w);
    }
  }
}
