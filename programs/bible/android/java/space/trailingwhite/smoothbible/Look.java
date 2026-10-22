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
      accent = 0xFF9C3A2C, rule = 0xFF1E1C19;

  // look SIZE SPACING MARGIN DARK RED BG INK HEADING FAINT ACCENT RULE
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
      JESUS_SUPPLIED = 20, PASSAGE = 21;
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
      default:
        break;
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

  // The divider between chapters (an object character in the text): a
  // short line across the middle of its line.
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
