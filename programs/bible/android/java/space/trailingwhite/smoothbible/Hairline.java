package space.trailingwhite.smoothbible;

import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.view.View;

// A document arriving (SKINS.md, Panes: Arriving): one hairline along the
// bottom edge of a pane's bar (the page's bar; the panel's row), 1 dp, in
// ink at 30% (not the accent), filled from the leading edge to how much of
// the document on its way has come. It fades out over 0.2 s once nothing
// arrives (at once where animations are off). The only progress shown.
final class Hairline extends View {
  private final Look look;
  private final Paint paint = new Paint();
  // How much has come (0 to 1), kept as it fades out.
  private float share;

  Hairline(Context c, Look look) {
    super(c);
    this.look = look;
    setAlpha(0f);
  }

  // `arriving P THOUSANDTHS`.
  void arriving(int thousandths) {
    share = Math.max(0f, Math.min(1f, thousandths / 1000f));
    animate().cancel();
    setAlpha(1f);
    invalidate();
  }

  // `arrived P`.
  void arrived() {
    if (ValueAnimator.areAnimatorsEnabled()) animate().alpha(0f).setDuration(200).start();
    else setAlpha(0f);
  }

  @Override
  protected void onDraw(Canvas canvas) {
    if (getAlpha() == 0f) return;
    paint.setColor((look.ink & 0x00FFFFFF) | 0x4D000000);
    float w = getWidth() * share;
    boolean rtl = getLayoutDirection() == LAYOUT_DIRECTION_RTL;
    float left = rtl ? getWidth() - w : 0f;
    canvas.drawRect(left, 0f, left + w, getHeight(), paint);
  }
}
