package space.trailingwhite.smoothbible;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

// The tray (SKINS.md): what can be done with the verses selected, as core
// describes it (its screen 0, SCR_TRAY): their reference, the highlight's
// colors (and Remove), then a button each (Copy, Share, Bookmark, Note,
// Study, Compare, Memorize). A tap is core's (trayact ACTION VALUE).
final class Tray extends LinearLayout {
  final Look look;
  private final TextView ref;
  private final LinearLayout swatches, buttons;

  Tray(Context c, Look look) {
    super(c);
    this.look = look;
    setOrientation(VERTICAL);
    setPadding(dp(16), dp(10), dp(16), dp(10));
    ref = new TextView(c);
    ref.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
    addView(ref);
    swatches = new LinearLayout(c);
    swatches.setGravity(Gravity.CENTER_VERTICAL);
    swatches.setPadding(0, dp(8), 0, dp(4));
    addView(swatches);
    HorizontalScrollView scroll = new HorizontalScrollView(c);
    scroll.setHorizontalScrollBarEnabled(false);
    buttons = new LinearLayout(c);
    scroll.addView(buttons);
    addView(scroll);
    setVisibility(GONE);
  }

  int dp(float n) {
    return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, n,
        getResources().getDisplayMetrics());
  }

  // Core's tray shown.
  void show(Screen s) {
    if (s == null) return;
    Context c = getContext();
    setBackgroundColor(look.bg);
    setElevation(dp(8));
    ref.setText(s.title);
    ref.setTextColor(look.faint);
    swatches.removeAllViews();
    buttons.removeAllViews();
    for (Screen.Section sec : s.sections) {
      for (Screen.Row r : sec.rows) {
        if (r.kind.equals("custom")) {
          // (The highlight's colors: a circle each, the one all the verses
          // have ringed; an empty one, Remove.)
          String[] hex = r.options.split("\\|", -1);
          String[] labels = r.detail.split("\\|", -1);
          for (int j = 0; j < hex.length; j++) {
            final int k = j;
            Dot d = new Dot(c, hex[j].isEmpty() ? 0 : Look.color(hex[j]), j == r.value, look);
            if (j < labels.length) d.setContentDescription(labels[j]);
            d.setOnClickListener(v -> Native.send("trayact " + r.action + " " + (hex[k].isEmpty() ? 5 : k)));
            swatches.addView(d, new LayoutParams(dp(40), dp(40)));
          }
          continue;
        }
        TextView b = new TextView(c);
        b.setText(r.title);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        boolean off = r.flag('d');
        b.setTextColor(off ? look.faint : r.flag('t') ? look.accent : look.ink);
        if (r.flag('t')) b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setPadding(dp(12), dp(10), dp(12), dp(10));
        if (!r.label.isEmpty()) b.setContentDescription(r.label);
        b.setEnabled(!off);
        b.setOnClickListener(v -> Native.send("trayact " + r.action + " 0"));
        buttons.addView(b);
      }
    }
    setVisibility(VISIBLE);
  }

  void hide() {
    setVisibility(GONE);
  }

  // A highlight's color, as a circle (ringed when chosen; none, Remove: a
  // ring crossed).
  static final class Dot extends View {
    final int color;
    final boolean chosen;
    final Look look;
    final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

    Dot(Context c, int color, boolean chosen, Look look) {
      super(c);
      this.color = color;
      this.chosen = chosen;
      this.look = look;
    }

    @Override
    protected void onDraw(Canvas c) {
      float w = getWidth(), h = getHeight(), r = Math.min(w, h) / 2 - 6;
      p.setStyle(Paint.Style.FILL);
      if (color != 0) {
        p.setColor(color);
        c.drawCircle(w / 2, h / 2, r - 3, p);
      }
      p.setStyle(Paint.Style.STROKE);
      p.setStrokeWidth(3);
      p.setColor(color == 0 ? look.faint : chosen ? look.ink : 0);
      if (color == 0 || chosen) c.drawCircle(w / 2, h / 2, r, p);
      if (color == 0) c.drawLine(w / 2 - r * 0.7f, h / 2 + r * 0.7f, w / 2 + r * 0.7f, h / 2 - r * 0.7f, p);
    }
  }
}
