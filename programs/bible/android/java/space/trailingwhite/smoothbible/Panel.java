package space.trailingwhite.smoothbible;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.HashMap;

// Core's screens, over the reader (SKINS.md: present, push, update, pop,
// dismiss): a stack of them, the top one shown, each a title and a list
// of its rows drawn with Android's own widgets. Every action goes back to
// core as it is (act ID ACTION ARG VALUE); Back pops, and core is told
// (closed ID).
final class Panel extends FrameLayout {
  final Look look;
  final HashMap<Integer, Screen> screens = new HashMap<>();
  final ArrayList<Integer> stack = new ArrayList<>();
  private final LinearLayout page;
  private final TextView title, back, button, empty;
  private final ListView list;
  private final Rows rows = new Rows();

  Panel(Context c, Look look) {
    super(c);
    this.look = look;
    page = new LinearLayout(c);
    page.setOrientation(LinearLayout.VERTICAL);
    LinearLayout bar = new LinearLayout(c);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(8), 0, dp(16), 0);
    back = new TextView(c);
    back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
    back.setPadding(dp(12), dp(8), dp(16), dp(8));
    back.setOnClickListener(v -> back());
    title = new TextView(c);
    title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
    title.setTypeface(Typeface.DEFAULT_BOLD);
    title.setSingleLine();
    title.setEllipsize(TextUtils.TruncateAt.END);
    button = new TextView(c);
    button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
    button.setPadding(dp(12), dp(8), dp(4), dp(8));
    button.setOnClickListener(v -> commands());
    bar.addView(back, new LinearLayout.LayoutParams(-2, dp(56)));
    bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    bar.addView(button);
    page.addView(bar, new LinearLayout.LayoutParams(-1, dp(56)));
    list = new ListView(c);
    list.setAdapter(rows);
    list.setDivider(null);
    list.setOnItemClickListener((p, v, i, id) -> tapped(i));
    list.setOnItemLongClickListener((p, v, i, id) -> held(v, i));
    page.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
    empty = new TextView(c);
    empty.setGravity(Gravity.CENTER);
    empty.setPadding(dp(32), dp(32), dp(32), dp(32));
    empty.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    page.addView(empty, new LinearLayout.LayoutParams(-1, 0, 1));
    addView(page, new LayoutParams(-1, -1));
    setVisibility(GONE);
  }

  int dp(float n) {
    return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, n,
        getResources().getDisplayMetrics());
  }

  boolean shown() {
    return getVisibility() == VISIBLE && !stack.isEmpty();
  }

  @Override
  public void setVisibility(int v) {
    super.setVisibility(v);
    if (Native.app != null) Native.app.panelShown(v == VISIBLE);
  }

  void present(int id) {
    stack.clear();
    stack.add(id);
    show();
  }

  void push(int id) {
    stack.add(id);
    show();
  }

  void update(int id) {
    if (!stack.isEmpty() && stack.get(stack.size() - 1) == id) show();
  }

  void dismiss() {
    stack.clear();
    setVisibility(GONE);
  }

  // Back: the top screen let go, and core told.
  boolean back() {
    if (stack.isEmpty()) return false;
    int id = stack.remove(stack.size() - 1);
    Native.send("closed " + id);
    if (stack.isEmpty()) setVisibility(GONE);
    else show();
    return true;
  }

  void restyle() {
    setBackgroundColor(look.bg);
    title.setTextColor(look.ink);
    back.setTextColor(look.accent);
    button.setTextColor(look.accent);
    empty.setTextColor(look.faint);
    rows.notifyDataSetChanged();
  }

  private void show() {
    Screen s = screens.get(stack.get(stack.size() - 1));
    if (s == null) return;
    title.setText(s.title);
    button.setText(s.button);
    button.setVisibility(s.button.isEmpty() ? GONE : VISIBLE);
    button.setEnabled(!s.commands.isEmpty());
    button.setAlpha(s.commands.isEmpty() ? 0.4f : 1);
    boolean none = true;
    for (Screen.Section sec : s.sections) if (!sec.rows.isEmpty()) none = false;
    boolean showEmpty = none && !s.emptyTitle.isEmpty();
    empty.setText(showEmpty ? s.emptyTitle + "\n\n" + s.emptyLine : "");
    empty.setVisibility(showEmpty ? VISIBLE : GONE);
    list.setVisibility(showEmpty ? GONE : VISIBLE);
    back.setText(stack.size() > 1 ? "‹" : "✕");
    back.setContentDescription(stack.size() > 1 ? "Back" : "Close");
    rows.set(s);
    restyle();
    setVisibility(VISIBLE);
  }

  private void tapped(int i) {
    Object o = rows.getItem(i);
    if (!(o instanceof Screen.Row)) return;
    Screen.Row r = (Screen.Row) o;
    if (r.flag('d')) return;
    if (r.kind.equals("item") || r.kind.equals("button")) act(r, 0);
    else if (r.kind.equals("toggle")) act(r, r.flag('o') ? 0 : 1);
  }

  // The screen's button: its commands in a menu.
  private void commands() {
    Screen s = rows.screen;
    if (s == null || s.commands.isEmpty()) return;
    android.widget.PopupMenu m = new android.widget.PopupMenu(getContext(), button);
    for (int i = 0; i < s.commands.size(); i++) m.getMenu().add(0, i, i, s.commands.get(i).title);
    m.setOnMenuItemClickListener(item -> {
      Screen.Command c = s.commands.get(item.getItemId());
      Native.send("act " + s.id + " " + c.action + " " + c.arg + " 0");
      return true;
    });
    m.show();
  }

  // A row held: Delete, if it can be (Android's lists don't swipe).
  private boolean held(View v, int i) {
    Object o = rows.getItem(i);
    if (!(o instanceof Screen.Row) || ((Screen.Row) o).deleteAction == 0) return false;
    Screen.Row r = (Screen.Row) o;
    android.widget.PopupMenu m = new android.widget.PopupMenu(getContext(), v);
    m.getMenu().add("Delete");
    m.setOnMenuItemClickListener(item -> {
      Native.send("act " + rows.screen.id + " " + r.deleteAction + " " + r.arg + " 0");
      return true;
    });
    m.show();
    return true;
  }

  private void act(Screen.Row r, int value) {
    Native.send("act " + rows.screen.id + " " + r.action + " " + r.arg + " " + value);
  }

  // The rows of the screen shown, sections' headers and footers among them.
  private final class Rows extends BaseAdapter {
    Screen screen;
    final ArrayList<Object> items = new ArrayList<>();

    void set(Screen s) {
      screen = s;
      items.clear();
      for (Screen.Section sec : s.sections) {
        items.add(new Header(sec.header));
        items.addAll(sec.rows);
        if (!sec.footer.isEmpty()) items.add(new Footer(sec.footer));
      }
      notifyDataSetChanged();
    }

    @Override
    public int getCount() {
      return items.size();
    }

    @Override
    public Object getItem(int i) {
      return items.get(i);
    }

    @Override
    public long getItemId(int i) {
      return i;
    }

    @Override
    public boolean isEnabled(int i) {
      Object o = items.get(i);
      return o instanceof Screen.Row && !((Screen.Row) o).flag('d');
    }

    @Override
    public View getView(int i, View old, ViewGroup parent) {
      Object o = items.get(i);
      Context c = getContext();
      if (o instanceof Header) {
        TextView t = new TextView(c);
        String h = ((Header) o).text;
        t.setText(h.toUpperCase());
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setTextColor(look.faint);
        t.setPadding(dp(20), dp(h.isEmpty() ? 8 : 20), dp(20), dp(6));
        return t;
      }
      if (o instanceof Footer) {
        TextView t = new TextView(c);
        t.setText(((Footer) o).text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setTextColor(look.faint);
        t.setPadding(dp(20), dp(4), dp(20), dp(12));
        return t;
      }
      return row((Screen.Row) o);
    }

    private View row(Screen.Row r) {
      Context c = getContext();
      LinearLayout line = new LinearLayout(c);
      line.setGravity(Gravity.CENTER_VERTICAL);
      line.setPadding(dp(20), dp(10), dp(20), dp(10));
      line.setMinimumHeight(dp(52));
      line.setAlpha(r.flag('d') ? 0.4f : 1);
      // (What TalkBack says for it, as core words it.)
      if (!r.label.isEmpty()) line.setContentDescription(r.label);
      LinearLayout words = new LinearLayout(c);
      words.setOrientation(LinearLayout.VERTICAL);
      TextView t = new TextView(c);
      t.setText(r.title);
      t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
      t.setTextColor(r.flag('x') ? look.accent : r.flag('f') ? look.faint : look.ink);
      words.addView(t);
      boolean valueDetail = r.flag('v');
      if (!r.detail.isEmpty() && !valueDetail) {
        TextView d = new TextView(c);
        d.setText(r.detail);
        d.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        d.setTextColor(look.faint);
        words.addView(d);
      }
      boolean slider = r.kind.equals("slider");
      if (slider) {
        line.setOrientation(LinearLayout.VERTICAL);
        line.setGravity(Gravity.NO_GRAVITY);
      }
      line.addView(words, slider ? new LinearLayout.LayoutParams(-1, -2)
          : new LinearLayout.LayoutParams(0, -2, 1));
      if (!r.trailing.isEmpty()) {
        TextView tr = new TextView(c);
        tr.setText(r.trailing);
        tr.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        tr.setTextColor(look.faint);
        tr.setPadding(dp(12), 0, 0, 0);
        line.addView(tr);
      }
      if (r.kind.equals("item")) {
        if (!r.detail.isEmpty() && valueDetail) {
          TextView d = new TextView(c);
          d.setText(r.detail);
          d.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
          d.setTextColor(look.faint);
          d.setPadding(dp(12), 0, dp(4), 0);
          line.addView(d);
        }
        String mark = r.acc.equals("check") ? "✓" : r.acc.equals("more") ? "›" : "";
        if (!mark.isEmpty()) {
          TextView a = new TextView(c);
          a.setText(mark);
          a.setTextSize(TypedValue.COMPLEX_UNIT_SP, r.acc.equals("check") ? 18 : 22);
          a.setTextColor(r.acc.equals("check") ? look.accent : look.faint);
          a.setPadding(dp(8), 0, 0, 0);
          line.addView(a);
        }
      } else if (r.kind.equals("toggle")) {
        Switch sw = new Switch(c);
        sw.setChecked(r.flag('o'));
        sw.setClickable(false);
        sw.setFocusable(false);
        line.addView(sw);
      } else if (slider) {
        SeekBar bar = new SeekBar(c);
        bar.setMax(r.hi - r.lo);
        bar.setProgress(r.value - r.lo);
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
          @Override
          public void onProgressChanged(SeekBar b, int p, boolean user) {}

          @Override
          public void onStartTrackingTouch(SeekBar b) {}

          @Override
          public void onStopTrackingTouch(SeekBar b) {
            act(r, b.getProgress() + r.lo);
          }
        });
        line.addView(bar, new LinearLayout.LayoutParams(-1, -2));
      } else if (r.kind.equals("choice")) {
        String[] labels = r.options.split("\\|");
        Spinner sp = new Spinner(c);
        ArrayAdapter<String> a = new ArrayAdapter<String>(c, android.R.layout.simple_spinner_item,
            labels) {
          // (The choice in the theme's ink, not the platform theme's.)
          @Override
          public View getView(int i, View old, ViewGroup parent) {
            View v = super.getView(i, old, parent);
            if (v instanceof TextView) ((TextView) v).setTextColor(look.faint);
            return v;
          }
        };
        a.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        sp.setAdapter(a);
        sp.setSelection(Math.max(0, Math.min(r.value, labels.length - 1)), false);
        sp.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
          @Override
          public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
            if (pos != r.value) act(r, pos);
          }

          @Override
          public void onNothingSelected(AdapterView<?> p) {}
        });
        line.addView(sp);
      }
      return line;
    }
  }

  private static final class Header {
    final String text;

    Header(String t) {
      text = t;
    }
  }

  private static final class Footer {
    final String text;

    Footer(String t) {
      text = t;
    }
  }
}
