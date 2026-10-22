package space.trailingwhite.smoothbible;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;

// Views in lines as wide as it is, a gap apart and a gap between lines;
// right to left if asked (the interlinear's tiles in the Hebrew's order).
final class Flow extends ViewGroup {
  private final int gap, lineGap;
  private final boolean rtl;

  Flow(Context c, int gap, int lineGap, boolean rtl) {
    super(c);
    this.gap = gap;
    this.lineGap = lineGap;
    this.rtl = rtl;
  }

  @Override
  protected void onMeasure(int wSpec, int hSpec) {
    int width = MeasureSpec.getSize(wSpec);
    int room = width - getPaddingLeft() - getPaddingRight();
    int x = 0, y = 0, line = 0;
    for (int i = 0; i < getChildCount(); i++) {
      View v = getChildAt(i);
      v.measure(MeasureSpec.makeMeasureSpec(room, MeasureSpec.AT_MOST),
          MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED));
      if (x > 0 && x + v.getMeasuredWidth() > room) {
        y += line + lineGap;
        x = 0;
        line = 0;
      }
      x += v.getMeasuredWidth() + gap;
      line = Math.max(line, v.getMeasuredHeight());
    }
    setMeasuredDimension(width, y + line + getPaddingTop() + getPaddingBottom());
  }

  @Override
  protected void onLayout(boolean changed, int l, int t, int r, int b) {
    int room = r - l - getPaddingLeft() - getPaddingRight();
    int x = 0, y = getPaddingTop(), line = 0;
    for (int i = 0; i < getChildCount(); i++) {
      View v = getChildAt(i);
      int w = v.getMeasuredWidth(), h = v.getMeasuredHeight();
      if (x > 0 && x + w > room) {
        y += line + lineGap;
        x = 0;
        line = 0;
      }
      int left = rtl ? getPaddingLeft() + room - x - w : getPaddingLeft() + x;
      v.layout(left, y, left + w, y + h);
      x += w + gap;
      line = Math.max(line, h);
    }
  }
}
