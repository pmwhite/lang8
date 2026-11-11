package space.trailingwhite.smoothbible;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.InputType;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.text.style.BackgroundColorSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.StyleSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.BaseAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;
import java.util.ArrayList;
import java.util.HashMap;

// Core's screens (SKINS.md: present, push, update, pop, dismiss), a group
// of them: the sheet's over the page (group 0), or the panel's beside it
// (group 1, core/beside.l8's). Each is a stack, the top one shown, each a
// title and a list of its rows drawn with Android's own widgets, and what
// is around it (its field and scopes, segments, filter, sort, confirm, the
// buttons at its foot). Every action goes back to core as it is (act ID
// ACTION ARG VALUE; text ID ACTION ARG WORDS for a field's). The sheet's
// Back pops, and core is told (closed ID); the panel's tells core which of
// its screens shows (panelanchor ID), or, on its first, closes it (tap
// shelf). A screen of the panel's that says `reader` is the panel's
// reader (pane 1) in place of its rows.
final class Panel extends FrameLayout {
  // The groups, as core numbers them.
  static final int SHEET = 0, BESIDE = 1;

  final Look look;
  final int group;
  // Every screen core has built (the sheet's and the panel's), by id.
  final HashMap<Integer, Screen> screens;
  final ArrayList<Integer> stack = new ArrayList<>();
  // The panel's reader (pane 1; null for the sheet's).
  private final Reader reader;
  private final LinearLayout page;
  private final TextView title, subtitle, back, full, button, sortButton, empty;
  private final ListView list;
  private final Rows rows = new Rows();
  // The screen's field (Go To's): what is typed goes to core as it is
  // (query ID TEXT), Go as submit ID.
  private final EditText field;
  private int fieldFor = -1;
  private boolean filling;
  // The field's scopes (Search's All, OT, NT and the book); the screen's
  // segments and its filter by color; the buttons at its foot.
  private final LinearLayout scopes, segments, foot;
  private final HorizontalScrollView filterBox;
  private final LinearLayout filter;
  // What is typed, waiting for typing to rest (the screen's wait).
  private final android.os.Handler later = new android.os.Handler(android.os.Looper.getMainLooper());
  private Runnable pending;
  // Each screen's field row (New Ribbon's name), kept across its updates
  // so that typing in it goes on.
  private final HashMap<Integer, EditText> rowFields = new HashMap<>();
  // A screen that takes letters (Practice's typing: keys ACTION): the
  // keyboard up for this, each letter typed sent as its action.
  private final EditText trap;
  // A document on its way to the panel's reader: its hairline along the
  // row's foot (SKINS.md, Panes: Arriving).
  final Hairline hairline;

  Panel(Context c, Look look, HashMap<Integer, Screen> screens, int group, Reader reader) {
    super(c);
    this.look = look;
    this.screens = screens;
    this.group = group;
    this.reader = reader;
    page = new LinearLayout(c);
    page.setOrientation(LinearLayout.VERTICAL);
    LinearLayout bar = new LinearLayout(c);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(8), 0, dp(16), 0);
    back = new TextView(c);
    back.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
    back.setPadding(dp(12), dp(8), dp(16), dp(8));
    back.setOnClickListener(v -> {
      // (The screen's own left button, a note's Cancel; else Back.)
      Screen s = rows.screen;
      if (s != null && !s.left.isEmpty()) Native.send("act " + s.id + " " + s.leftAction + " 0 0");
      else back();
    });
    title = new TextView(c);
    title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
    title.setTypeface(Typeface.DEFAULT_BOLD);
    title.setSingleLine();
    title.setEllipsize(TextUtils.TruncateAt.END);
    // (What a reading is of, under its title: a version's, a commentary's.)
    subtitle = new TextView(c);
    subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
    subtitle.setSingleLine();
    subtitle.setEllipsize(TextUtils.TruncateAt.END);
    LinearLayout titles = new LinearLayout(c);
    titles.setOrientation(LinearLayout.VERTICAL);
    titles.addView(title);
    titles.addView(subtitle);
    // (The panel's: filling the screen, or beside the page again.)
    full = new TextView(c);
    full.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
    full.setPadding(dp(12), dp(8), dp(4), dp(8));
    full.setOnClickListener(v -> Native.send("tap full"));
    full.setVisibility(group == BESIDE ? VISIBLE : GONE);
    sortButton = new TextView(c);
    sortButton.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    sortButton.setPadding(dp(12), dp(8), dp(4), dp(8));
    sortButton.setOnClickListener(v -> sorts());
    button = new TextView(c);
    button.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
    button.setPadding(dp(12), dp(8), dp(4), dp(8));
    button.setOnClickListener(v -> barButton());
    bar.addView(back, new LinearLayout.LayoutParams(-2, dp(56)));
    bar.addView(titles, new LinearLayout.LayoutParams(0, -2, 1));
    bar.addView(sortButton);
    bar.addView(button);
    bar.addView(full);
    page.addView(bar, new LinearLayout.LayoutParams(-1, dp(56)));
    field = new EditText(c);
    field.setSingleLine();
    field.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
    field.setImeOptions(EditorInfo.IME_ACTION_GO);
    field.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
    field.addTextChangedListener(new TextWatcher() {
      @Override
      public void beforeTextChanged(CharSequence s, int a, int b, int n) {}

      @Override
      public void onTextChanged(CharSequence s, int a, int b, int n) {}

      @Override
      public void afterTextChanged(Editable e) {
        if (filling || rows.screen == null) return;
        Screen s = rows.screen;
        String text = e.toString();
        if (pending != null) later.removeCallbacks(pending);
        pending = () -> {
          pending = null;
          Native.send("query " + s.id + " " + Wire.escape(text));
        };
        if (s.wait > 0 && !text.isEmpty()) later.postDelayed(pending, s.wait);
        else pending.run();
      }
    });
    field.setOnEditorActionListener((v, action, ev) -> {
      if (rows.screen == null) return false;
      flush();
      Native.send("submit " + rows.screen.id);
      return true;
    });
    LinearLayout.LayoutParams fp = new LinearLayout.LayoutParams(-1, -2);
    fp.setMargins(dp(16), 0, dp(16), dp(4));
    page.addView(field, fp);
    scopes = new LinearLayout(c);
    scopes.setPadding(dp(16), 0, dp(16), dp(6));
    page.addView(scopes, new LinearLayout.LayoutParams(-1, -2));
    segments = new LinearLayout(c);
    segments.setPadding(dp(16), dp(2), dp(16), dp(6));
    page.addView(segments, new LinearLayout.LayoutParams(-1, -2));
    filterBox = new HorizontalScrollView(c);
    filterBox.setHorizontalScrollBarEnabled(false);
    filter = new LinearLayout(c);
    filter.setGravity(Gravity.CENTER_VERTICAL);
    filter.setPadding(dp(16), 0, dp(16), dp(8));
    filterBox.addView(filter);
    page.addView(filterBox, new LinearLayout.LayoutParams(-1, -2));
    list = new ListView(c);
    list.setAdapter(rows);
    list.setDivider(null);
    list.setItemsCanFocus(true);
    list.setOnItemClickListener((p, v, i, id) -> tapped(i));
    list.setOnItemLongClickListener((p, v, i, id) -> held(v, i));
    page.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
    empty = new TextView(c);
    empty.setGravity(Gravity.CENTER);
    empty.setPadding(dp(32), dp(32), dp(32), dp(32));
    empty.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    page.addView(empty, new LinearLayout.LayoutParams(-1, 0, 1));
    if (reader != null) {
      reader.setVisibility(GONE);
      page.addView(reader, new LinearLayout.LayoutParams(-1, 0, 1));
    }
    // (The buttons at a screen's foot: Start Plan, Practice, Export.)
    foot = new LinearLayout(c);
    foot.setGravity(Gravity.CENTER_VERTICAL);
    foot.setPadding(dp(8), 0, dp(8), 0);
    page.addView(foot, new LinearLayout.LayoutParams(-1, -2));
    addView(page, new LayoutParams(-1, -1));
    hairline = new Hairline(c, look);
    LayoutParams line = new LayoutParams(-1, Math.max(1, dp(1)), Gravity.TOP);
    line.topMargin = dp(56) - Math.max(1, dp(1));
    addView(hairline, line);
    trap = new EditText(c);
    trap.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD);
    trap.setAlpha(0);
    trap.setCursorVisible(false);
    trap.addTextChangedListener(new TextWatcher() {
      @Override
      public void beforeTextChanged(CharSequence s, int a, int b, int n) {}

      @Override
      public void onTextChanged(CharSequence s, int a, int b, int n) {}

      @Override
      public void afterTextChanged(Editable e) {
        if (e.length() == 0) return;
        Screen s = top();
        String typed = e.toString();
        e.clear();
        if (s == null || s.keys == 0) return;
        typed.codePoints().forEach(ch -> {
          if (ch > 32) Native.send("act " + s.id + " " + s.keys + " " + ch + " 0");
        });
      }
    });
    addView(trap, new LayoutParams(1, 1));
    // (The sheet over the selection's tray, which stays under it; away until
    // a screen comes.)
    if (group == SHEET) {
      setElevation(dp(24));
      setVisibility(GONE);
    }
  }

  // The screen on top (null: none).
  Screen top() {
    return stack.isEmpty() || getVisibility() != VISIBLE ? null : screens.get(stack.get(stack.size() - 1));
  }

  boolean isKeyTrap(View v) {
    return v == trap;
  }

  // The keyboard up for a screen that takes letters, or away from it.
  private void keys(Screen s) {
    android.view.inputmethod.InputMethodManager m = (android.view.inputmethod.InputMethodManager)
        getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
    if (s.keys > 0) {
      if (!trap.hasFocus()) {
        trap.requestFocus();
        trap.post(() -> {
          if (m != null) m.showSoftInput(trap, 0);
        });
      }
    } else if (trap.hasFocus()) {
      trap.clearFocus();
      if (m != null) m.hideSoftInputFromWindow(getWindowToken(), 0);
    }
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
    if (Native.app != null) Native.app.backChanged();
  }

  // The panel's button as the panel fills the screen or not.
  void filling(boolean filling) {
    full.setText(filling ? "\u2921" : "\u2922");
    full.setContentDescription(filling ? "Beside the Page" : "Full Screen");
  }

  // The sheet's first screen (`present`), or the panel's (`panel`).
  void present(int id) {
    stack.clear();
    stack.add(id);
    show(true);
  }

  void push(int id) {
    stack.add(id);
    show(true);
  }

  void update(int id) {
    if (stack.isEmpty() || stack.get(stack.size() - 1) != id) return;
    // (While its field is being typed in, made again once the typing
    // rests: a list made again under the field loses letters the keyboard
    // is composing.)
    EditText f = rowFields.get(id);
    long since = android.os.SystemClock.uptimeMillis() - typed;
    if (f != null && f.hasFocus() && since < 600) {
      later.removeCallbacks(rest);
      later.postDelayed(rest, 600 - since);
      return;
    }
    boolean typing = f != null && f.hasFocus();
    show(false);
    // (Still taking the keys, where they were.)
    if (typing) {
      int at = f.getSelectionStart(), to = f.getSelectionEnd();
      f.post(() -> {
        f.requestFocus();
        if (at >= 0 && to <= f.getText().length()) f.setSelection(at, to);
      });
    }
  }

  // The focus row's words brought into sight, the list moving as little as
  // it can (Practice's words practised, the word being typed). After the
  // list lays out its rows again.
  void reveal(int id) {
    if (stack.isEmpty() || stack.get(stack.size() - 1) != id) return;
    Screen s = screens.get(id);
    if (s == null || s.focusFrom < 0 || rows.focusItem < 0) return;
    int item = rows.focusItem, from = s.focusFrom, to = Math.max(s.focusFrom + 1, s.focusTo);
    list.post(() -> {
      int child = item - list.getFirstVisiblePosition();
      if (child < 0 || child >= list.getChildCount()) {
        // (Its row out of sight: brought in, then its words.)
        list.setSelectionFromTop(item, dp(16));
        list.post(() -> revealIn(item, from, to));
        return;
      }
      revealIn(item, from, to);
    });
  }

  private void revealIn(int item, int from, int to) {
    int child = item - list.getFirstVisiblePosition();
    if (child < 0 || child >= list.getChildCount()) return;
    View v = list.getChildAt(child);
    if (!(v instanceof TextView)) return;
    android.text.Layout layout = ((TextView) v).getLayout();
    if (layout == null) return;
    int n = ((TextView) v).getText().length();
    int top = v.getTop() + ((TextView) v).getTotalPaddingTop()
        + layout.getLineTop(layout.getLineForOffset(Math.min(from, n)));
    int bottom = v.getTop() + ((TextView) v).getTotalPaddingTop()
        + layout.getLineBottom(layout.getLineForOffset(Math.min(to - 1, n)));
    int margin = dp(16), by = 0;
    if (top - margin < 0) by = top - margin;
    else if (bottom + margin > list.getHeight()) by = Math.min(bottom + margin - list.getHeight(), top - margin);
    if (by != 0) list.smoothScrollBy(by, 200);
  }

  // When a row's field was last typed in, and the screen made again once
  // its typing rests.
  private long typed;
  private final Runnable rest = () -> {
    if (!stack.isEmpty()) update(stack.get(stack.size() - 1));
  };

  // Its screens let go (the sheet's dismissed, the panel closed).
  void dismiss() {
    stack.clear();
    rowFields.clear();
    keyboardAway();
    if (group == SHEET) setVisibility(GONE);
    else if (Native.app != null) Native.app.backChanged();
  }

  // Back to screen id (Add Words' Add: the language page): those over it
  // let go (core has let them go already).
  void popTo(int id) {
    if (!stack.contains(id)) return;
    while (stack.get(stack.size() - 1) != id) rowFields.remove(stack.remove(stack.size() - 1));
    show(false);
  }

  // (What waits sent now: Return, or a scope chosen.)
  private void flush() {
    if (pending == null) return;
    later.removeCallbacks(pending);
    pending.run();
  }

  // The field given the screen's words (a recent search chosen).
  void retext(int id) {
    Screen s = screens.get(id);
    if (s == null || rows.screen == null || rows.screen.id != id) return;
    filling = true;
    field.setText(s.searchText);
    field.setSelection(field.getText().length());
    // (And a field row's words as core has them: emptied for the next
    // answer.)
    EditText f = rowFields.get(id);
    Screen.Row r = fieldRow(s);
    if (f != null && r != null) f.setText(r.detail);
    filling = false;
    // (A field that keeps the keys takes them again: the next answer.)
    if (f != null && r != null && r.flag('e')) {
      final EditText ff = f;
      ff.requestFocus();
      ff.post(() -> {
        android.view.inputmethod.InputMethodManager m = (android.view.inputmethod.InputMethodManager)
            getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        if (m != null) m.showSoftInput(ff, 0);
      });
    }
  }

  void blur() {
    keyboardAway();
  }

  private void keyboardAway() {
    android.view.inputmethod.InputMethodManager m = (android.view.inputmethod.InputMethodManager)
        getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
    if (m != null) m.hideSoftInputFromWindow(getWindowToken(), 0);
    field.clearFocus();
  }

  // Back: the top screen let go, and core told (its field's words first).
  // The panel's: the screen under it shown (core told which), or, its
  // first, the panel closed.
  boolean back() {
    if (stack.isEmpty()) return false;
    int id = stack.get(stack.size() - 1);
    commitField(id);
    if (group == BESIDE) {
      if (stack.size() == 1) {
        Native.send("tap shelf");
        return true;
      }
      stack.remove(stack.size() - 1);
      rowFields.remove(id);
      Native.send("panelanchor " + stack.get(stack.size() - 1));
      show(false);
      return true;
    }
    stack.remove(stack.size() - 1);
    rowFields.remove(id);
    Native.send("closed " + id);
    if (stack.isEmpty()) {
      keyboardAway();
      setVisibility(GONE);
    } else show(false);
    return true;
  }

  void restyle() {
    setBackgroundColor(look.bg);
    title.setTextColor(look.ink);
    subtitle.setTextColor(look.faint);
    full.setTextColor(look.accent);
    if (reader != null) reader.restyle();
    back.setTextColor(look.accent);
    button.setTextColor(look.accent);
    sortButton.setTextColor(look.accent);
    field.setTextColor(look.ink);
    field.setHintTextColor(look.faint);
    empty.setTextColor(look.faint);
    Screen top = rows.screen;
    if (top != null) {
      showSegments(top);
      showFilter(top);
      showTools(top);
    }
    rows.notifyDataSetChanged();
  }

  // The top screen shown (fresh: just opened, at its focus).
  // The screen shown last.
  private int shown = -1;

  private void show(boolean fresh) {
    Screen s = screens.get(stack.get(stack.size() - 1));
    if (s == null) return;
    field.setVisibility(s.search.isEmpty() ? GONE : VISIBLE);
    // (The keyboard away as another screen shows, unless its field wants
    // it; not as the same one is made again, where a row's field may be
    // taking the keys: its letters being composed would be lost.)
    if (s.id != shown && (s.search.isEmpty() || !s.focusField)) keyboardAway();
    shown = s.id;
    field.setHint(s.search);
    field.setImeOptions(s.go ? EditorInfo.IME_ACTION_GO : EditorInfo.IME_ACTION_SEARCH);
    if (s.id != fieldFor) {
      // (Another screen's field: its words as core has them, without
      // telling core.)
      if (pending != null) later.removeCallbacks(pending);
      pending = null;
      filling = true;
      field.setText(s.searchText);
      field.setSelection(field.getText().length());
      filling = false;
      fieldFor = s.id;
      if (s.focusField) {
        field.requestFocus();
        field.post(() -> {
          android.view.inputmethod.InputMethodManager m = (android.view.inputmethod.InputMethodManager)
              getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
          if (m != null) m.showSoftInput(field, 0);
        });
      }
    }
    showScopes(s);
    title.setText(s.title);
    // (At the top right: its confirm, New Ribbon's Add; else its button.)
    String bt = !s.confirm.isEmpty() ? s.confirm : s.button;
    button.setText(bt);
    button.setVisibility(bt.isEmpty() ? GONE : VISIBLE);
    boolean on = !s.confirm.isEmpty() ? !s.confirmOff : !s.commands.isEmpty();
    button.setEnabled(on);
    button.setAlpha(on ? 1 : 0.4f);
    button.setTypeface(!s.confirm.isEmpty() ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
    sortButton.setVisibility(s.sorts.length == 0 ? GONE : VISIBLE);
    if (s.sorts.length > 0) sortButton.setText(s.sorts[Math.max(0, Math.min(s.sort,
        s.sorts.length - 1))] + " ▾");
    boolean none = true;
    for (Screen.Section sec : s.sections) if (!sec.rows.isEmpty()) none = false;
    boolean showEmpty = none && !s.emptyTitle.isEmpty() && !s.reader;
    empty.setText(showEmpty ? s.emptyTitle + "\n\n" + s.emptyLine : "");
    empty.setVisibility(showEmpty ? VISIBLE : GONE);
    // (The panel's reader in place of its rows.)
    boolean reading = s.reader && reader != null;
    list.setVisibility(showEmpty || reading ? GONE : VISIBLE);
    if (reader != null) {
      reader.setVisibility(reading ? VISIBLE : GONE);
      reader.setLinkedShown(reading && s.readerLinked);
    }
    subtitle.setText(s.subtitle);
    subtitle.setVisibility(s.subtitle.isEmpty() ? GONE : VISIBLE);
    // (The panel's reader's title, drawn as the page's bar's is: the
    // chapter, the document's name faint and smaller after it, its tap Go
    // To aimed at the panel.)
    boolean named = s.reader && !s.left.isEmpty();
    if (named) {
      String tail = "  " + s.left;
      android.text.SpannableString t = new android.text.SpannableString(s.title + tail);
      int from = t.length() - tail.length();
      t.setSpan(new android.text.style.ForegroundColorSpan(look.faint), from, t.length(),
          android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      t.setSpan(new android.text.style.RelativeSizeSpan(0.75f), from, t.length(),
          android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      back.setText(t);
      title.setText("");
    } else back.setText(!s.left.isEmpty() ? s.left : stack.size() > 1 ? "‹" : "✕");
    back.setTextSize(TypedValue.COMPLEX_UNIT_SP, named ? 18 : s.left.isEmpty() ? 22 : 17);
    back.setTypeface(named ? Typeface.create(Typeface.SERIF, Typeface.BOLD) : Typeface.DEFAULT);
    back.setContentDescription(named ? s.title + ", " + s.left : !s.left.isEmpty() ? s.left : stack.size() > 1 ? "Back" : "Close");
    rows.set(s);
    restyle();
    keys(s);
    if (fresh && rows.focusItem >= 0) list.setSelectionFromTop(rows.focusItem, dp(160));
    else if (fresh) list.setSelection(0);
    if (group == SHEET) setVisibility(VISIBLE);
    else if (Native.app != null) Native.app.backChanged();
  }

  // The screen's scopes, as a row of words, the one chosen in the accent.
  private void showScopes(Screen s) {
    scopes.removeAllViews();
    scopes.setVisibility(s.scopes.length == 0 ? GONE : VISIBLE);
    for (int i = 0; i < s.scopes.length; i++) {
      final int n = i;
      TextView t = choiceWord(s.scopes[i], i == s.scope);
      if (i < s.scopeLabels.length) t.setContentDescription(s.scopeLabels[i]);
      t.setOnClickListener(v -> {
        flush();
        Native.send("scope " + s.id + " " + n);
      });
      scopes.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
    }
  }

  private TextView choiceWord(String words, boolean on) {
    TextView t = new TextView(getContext());
    t.setText(words);
    t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    t.setGravity(Gravity.CENTER);
    t.setPadding(dp(4), dp(8), dp(4), dp(8));
    t.setTextColor(on ? look.accent : look.faint);
    t.setTypeface(on ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
    t.setSelected(on);
    return t;
  }

  // Its segments (the Library's Highlights, Notes, ...), as its scopes are.
  private void showSegments(Screen s) {
    segments.removeAllViews();
    segments.setVisibility(s.segments.length == 0 ? GONE : VISIBLE);
    for (int i = 0; i < s.segments.length; i++) {
      final int n = i;
      TextView t = choiceWord(s.segments[i], i == s.segment);
      t.setOnClickListener(v -> Native.send("act " + s.id + " " + s.segmentsAction + " 0 " + n));
      segments.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
    }
  }

  // Its filter by color: All, then a circle each color.
  private void showFilter(Screen s) {
    filter.removeAllViews();
    filterBox.setVisibility(s.filterColors.length == 0 ? GONE : VISIBLE);
    if (s.filterColors.length == 0) return;
    TextView all = choiceWord("All", s.filter < 0);
    all.setOnClickListener(v -> Native.send("act " + s.id + " " + s.filterAction + " 0 -1"));
    filter.addView(all);
    for (int i = 0; i < s.filterColors.length; i++) {
      final int n = i;
      View dot = circle(Look.color(s.filterColors[i]), i == s.filter, 28);
      if (i < s.filterLabels.length) dot.setContentDescription(s.filterLabels[i]);
      dot.setOnClickListener(v -> Native.send("act " + s.id + " " + s.filterAction + " 0 " + n));
      LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(28), dp(28));
      lp.setMargins(dp(10), 0, 0, 0);
      filter.addView(dot, lp);
    }
  }

  // A circle of a color (chosen: ringed in ink).
  private View circle(int color, boolean chosen, int size) {
    View v = new View(getContext());
    GradientDrawable g = new GradientDrawable();
    g.setShape(GradientDrawable.OVAL);
    g.setColor(color);
    if (chosen) g.setStroke(dp(3), look.ink);
    v.setBackground(g);
    v.setSelected(chosen);
    return v;
  }

  // The buttons at its foot: those at the left, then (spaced) the middle
  // ones, then those at the right.
  private void showTools(Screen s) {
    foot.removeAllViews();
    foot.setVisibility(s.tools.isEmpty() ? GONE : VISIBLE);
    boolean middle = false;
    for (Screen.Tool t : s.tools) if (t.place == 1) middle = true;
    for (int place = 0; place < 3; place++) {
      if (place > 0) foot.addView(new View(getContext()), new LinearLayout.LayoutParams(0, 1, 1));
      for (Screen.Tool t : s.tools) {
        if (t.place != place) continue;
        if (t.style == 4) {
          // (Segments: the interlinear's order; the item's ARG the value.)
          String[] items = t.menu.split("\\|");
          for (String it : items) {
            int colon = it.indexOf(':');
            String v = colon < 0 ? "0" : it.substring(0, colon);
            TextView w = choiceWord(colon < 0 ? it : it.substring(colon + 1), v.equals(
                String.valueOf(t.arg)));
            w.setPadding(dp(8), dp(12), dp(8), dp(12));
            w.setOnClickListener(x -> Native.send("act " + s.id + " " + t.action + " " + t.arg + " "
                + v));
            foot.addView(w);
          }
          continue;
        }
        TextView b = new TextView(getContext());
        b.setText(!t.title.isEmpty() ? t.title : glyph(t.icon, t.label));
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, t.title.isEmpty() ? 22 : 17);
        b.setPadding(dp(12), dp(12), dp(12), dp(12));
        b.setTextColor(t.style == 2 ? 0xffd32f2f : look.accent);
        b.setTypeface(t.style == 1 ? Typeface.DEFAULT_BOLD : Typeface.DEFAULT);
        b.setAlpha(t.style == 3 ? 0.4f : 1);
        if (!t.label.isEmpty()) b.setContentDescription(t.label);
        b.setOnClickListener(v -> tool(s, t, b));
        foot.addView(b);
      }
      if (place == 1 && !middle) continue;
    }
  }

  private void tool(Screen s, Screen.Tool t, View anchor) {
    if (t.style == 3) return;
    if (t.menu.isEmpty()) {
      Native.send("act " + s.id + " " + t.action + " " + t.arg + " 0");
      return;
    }
    // (A menu instead: I Know These' Mark All 24 as Known.)
    PopupMenu m = new PopupMenu(getContext(), anchor);
    String[] items = t.menu.split("\\|");
    for (int i = 0; i < items.length; i++) {
      int colon = items[i].indexOf(':');
      m.getMenu().add(0, i, i, colon < 0 ? items[i] : items[i].substring(colon + 1));
    }
    m.setOnMenuItemClickListener(item -> {
      String it = items[item.getItemId()];
      int colon = it.indexOf(':');
      Native.send("act " + s.id + " " + t.action + " " + (colon < 0 ? "0" : it.substring(0, colon))
          + " 0");
      return true;
    });
    m.show();
  }

  // An icon's name as a character Android's fonts have (core names the
  // iPhone's symbols), or its label.
  private static String glyph(String icon, String label) {
    switch (icon) {
      case "play.fill":
        return "\u25B6";
      case "repeat":
        return "\u21BB";
      case "keyboard":
      case "keyboard.chevron.compact.down":
        return "\u2328";
      case "speaker.wave.2":
        return "\uD83D\uDD08";
      case "plus":
        return "+";
      case "square.and.arrow.up":
        return "⇪";
      case "square.and.pencil":
        return "✎";
      case "chevron.up":
        return "⌃";
      case "chevron.down":
        return "⌄";
      case "ellipsis":
        return "⋯";
      default:
        return label.isEmpty() ? icon : label;
    }
  }

  private void tapped(int i) {
    Object o = rows.getItem(i);
    if (!(o instanceof Screen.Row)) return;
    Screen.Row r = (Screen.Row) o;
    if (r.flag('d')) return;
    if (r.kind.equals("item") || r.kind.equals("button")) act(r, 0);
    else if (r.kind.equals("toggle")) act(r, r.flag('o') ? 0 : 1);
    else if (r.kind.equals("time")) time(r);
  }

  // A time chosen: the platform's dialog, its minutes the action's value.
  private void time(Screen.Row r) {
    new android.app.TimePickerDialog(getContext(), (p, h, m) -> act(r, h * 60 + m),
        r.value / 60, r.value % 60, android.text.format.DateFormat.is24HourFormat(getContext()))
        .show();
  }

  // The bar's button: its confirm (the field's words sent first), or its
  // commands in a menu.
  private void barButton() {
    Screen s = rows.screen;
    if (s == null) return;
    if (!s.confirm.isEmpty()) {
      if (s.confirmOff) return;
      commitField(s.id);
      Native.send("act " + s.id + " " + s.confirmAction + " 0 0");
      return;
    }
    if (s.commands.isEmpty()) return;
    PopupMenu m = new PopupMenu(getContext(), button);
    for (int i = 0; i < s.commands.size(); i++) m.getMenu().add(0, i, i, s.commands.get(i).title);
    m.setOnMenuItemClickListener(item -> {
      Screen.Command c = s.commands.get(item.getItemId());
      Native.send("act " + s.id + " " + c.action + " " + c.arg + " 0");
      return true;
    });
    m.show();
  }

  // Its sort, chosen from a menu.
  private void sorts() {
    Screen s = rows.screen;
    if (s == null || s.sorts.length == 0) return;
    PopupMenu m = new PopupMenu(getContext(), sortButton);
    for (int i = 0; i < s.sorts.length; i++) m.getMenu().add(0, i, i, s.sorts[i]);
    m.setOnMenuItemClickListener(item -> {
      Native.send("act " + s.id + " " + s.sortAction + " 0 " + item.getItemId());
      return true;
    });
    m.show();
  }

  // A row held: its actions (VoiceOver's on the iPhone) and Delete, if it
  // can be (Android's lists don't swipe).
  private boolean held(View v, int i) {
    Object o = rows.getItem(i);
    if (!(o instanceof Screen.Row)) return false;
    Screen.Row r = (Screen.Row) o;
    if (r.actions.isEmpty() && r.deleteAction == 0) return false;
    menu(r, v);
    return true;
  }

  // A row's actions as a menu (its Delete among them, or after them).
  private void menu(Screen.Row r, View anchor) {
    Screen s = rows.screen;
    PopupMenu m = new PopupMenu(getContext(), anchor);
    boolean delete = r.deleteAction != 0;
    for (int j = 0; j < r.actions.size(); j++) {
      m.getMenu().add(0, j, j, r.actions.get(j).title);
      if (r.actions.get(j).action == r.deleteAction) delete = false;
    }
    if (delete) m.getMenu().add(0, -1, r.actions.size(), "Delete");
    m.setOnMenuItemClickListener(item -> {
      int a = item.getItemId() < 0 ? r.deleteAction : r.actions.get(item.getItemId()).action;
      Native.send("act " + s.id + " " + a + " " + r.arg + " 0");
      return true;
    });
    m.show();
  }

  private void act(Screen.Row r, int value) {
    Native.send("act " + rows.screen.id + " " + r.action + " " + r.arg + " " + value);
  }

  // Screen id's field row's words to core (its editing ended).
  private void commitField(int id) {
    EditText f = rowFields.get(id);
    Screen s = screens.get(id);
    if (f == null || s == null) return;
    Screen.Row r = fieldRow(s);
    if (r == null || r.flag('l')) return;
    Native.send("text " + id + " " + r.action + " " + r.arg + " " + Wire.escape(f.getText().toString()));
  }

  private static Screen.Row fieldRow(Screen s) {
    for (Screen.Section sec : s.sections)
      for (Screen.Row r : sec.rows) if (r.kind.equals("field")) return r;
    return null;
  }

  // The rows of the screen shown, sections' headers and footers among them.
  private final class Rows extends BaseAdapter {
    Screen screen;
    final ArrayList<Object> items = new ArrayList<>();
    // Where the screen's focus row is among the items (-1: none).
    int focusItem = -1;

    void set(Screen s) {
      screen = s;
      items.clear();
      focusItem = -1;
      int n = 0;
      if (!s.hero.isEmpty()) items.add(new Hero());
      if (!s.intro.isEmpty()) items.add(new Intro(look.rich(s.intro, s.introRuns)));
      for (Screen.Section sec : s.sections) {
        items.add(sec);
        if (s.grid) {
          // (A grid: its rows one item of square buttons.)
          if (!sec.rows.isEmpty()) items.add(new Grid(sec));
          n += sec.rows.size();
        } else for (Screen.Row r : sec.rows) {
          if (n++ == s.focus) focusItem = items.size();
          items.add(r);
        }
        if (!sec.footer.isEmpty()) items.add(new Footer(sec.footer));
        Wire credit = look.credits.get(sec.credit);
        if (credit != null) items.add(new Credit(credit));
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
      if (o instanceof Screen.Section) return header((Screen.Section) o);
      if (o instanceof Hero) return hero(screen);
      if (o instanceof Grid) {
        Flow flow = new Flow(c, dp(10), dp(10), false);
        flow.setPadding(dp(20), dp(12), dp(20), dp(24));
        Screen s = screen;
        for (Screen.Row r : ((Grid) o).section.rows) {
          TextView b = new TextView(c);
          b.setText(String.valueOf(r.value));
          b.setGravity(Gravity.CENTER);
          b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
          boolean chosen = r.acc.equals("check");
          b.setTextColor(chosen ? look.bg : look.ink);
          GradientDrawable g = new GradientDrawable();
          g.setCornerRadius(dp(14));
          g.setColor(chosen ? look.accent : (look.faint & 0x00ffffff) | 0x22000000);
          b.setBackground(g);
          b.setContentDescription(r.title);
          b.setOnClickListener(v -> Native.send("act " + s.id + " " + r.action + " " + r.arg + " 0"));
          b.setLayoutParams(new ViewGroup.LayoutParams(dp(56), dp(56)));
          flow.addView(b);
        }
        return flow;
      }
      if (o instanceof Intro) {
        TextView t = new TextView(c);
        t.setText(((Intro) o).text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTextColor(screen.introQuote ? look.faint : (look.ink & 0x00ffffff) | 0xcc000000);
        t.setPadding(dp(20), dp(16), dp(20), dp(4));
        if (screen.introQuote) {
          // (A quote: an accent's bar beside it.)
          t.setMaxLines(4);
          t.setEllipsize(TextUtils.TruncateAt.END);
          t.setPadding(dp(14), dp(2), 0, dp(2));
          LinearLayout q = new LinearLayout(c);
          q.setPadding(dp(20), dp(16), dp(20), dp(12));
          View bar = new View(c);
          bar.setBackgroundColor(look.accent);
          q.addView(bar, new LinearLayout.LayoutParams(dp(3), -1));
          q.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
          return q;
        }
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
      if (o instanceof Credit) {
        // (Its words, then its link.)
        Wire credit = ((Credit) o).line;
        TextView t = new TextView(c);
        t.setText(credit.field(1) + credit.field(2));
        t.setContentDescription(credit.field(4));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setTextColor(look.accent);
        t.setPadding(dp(20), dp(4), dp(20), dp(12));
        t.setOnClickListener(v -> {
          try {
            getContext().startActivity(new android.content.Intent(
                android.content.Intent.ACTION_VIEW, android.net.Uri.parse(credit.field(3))));
          } catch (RuntimeException e) {
            // (No browser.)
          }
        });
        return t;
      }
      return row((Screen.Row) o);
    }

    private View header(Screen.Section sec) {
      Context c = getContext();
      LinearLayout box = new LinearLayout(c);
      box.setOrientation(LinearLayout.VERTICAL);
      LinearLayout line = new LinearLayout(c);
      line.setGravity(Gravity.BOTTOM);
      TextView t = new TextView(c);
      String h = sec.header;
      SpannableString words = new SpannableString(h.toUpperCase() + sec.headerSuffix);
      if (!sec.headerSuffix.isEmpty()) words.setSpan(new ForegroundColorSpan(look.faint), h.length(),
          words.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      t.setText(words);
      t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
      t.setTextColor(look.faint);
      t.setPadding(dp(20), dp(h.isEmpty() && sec.headerSuffix.isEmpty() ? 8 : 20), dp(20), dp(6));
      line.addView(t, new LinearLayout.LayoutParams(0, -2, 1));
      if (!sec.button.isEmpty()) {
        // (With its button: Recent Searches' Clear.)
        TextView b = new TextView(c);
        b.setText(sec.button);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTextColor(look.accent);
        b.setPadding(dp(12), dp(12), dp(20), dp(6));
        Screen s = screen;
        b.setOnClickListener(v -> Native.send("act " + s.id + " " + sec.buttonAction + " 0 0"));
        line.addView(b);
      }
      box.addView(line);
      if (sec.columns.length > 0) {
        // (Over a grid's cells, their columns' names.)
        LinearLayout cols = new LinearLayout(c);
        cols.setPadding(dp(20), 0, dp(20), dp(4));
        cols.addView(new View(c), new LinearLayout.LayoutParams(0, 1, 0.36f * sec.columns.length
            / 0.64f));
        for (String name : sec.columns) {
          TextView n = new TextView(c);
          n.setText(name);
          n.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
          n.setTextColor(look.faint);
          n.setGravity(Gravity.CENTER);
          cols.addView(n, new LinearLayout.LayoutParams(0, -2, 1));
        }
        box.addView(cols);
      }
      return box;
    }

    // A word as the heading: large in its script, its transliteration, its
    // line.
    private View hero(Screen s) {
      Context c = getContext();
      LinearLayout box = new LinearLayout(c);
      box.setOrientation(LinearLayout.VERTICAL);
      box.setPadding(dp(20), dp(24), dp(20), dp(12));
      TextView w = new TextView(c);
      w.setText(s.hero);
      w.setTextSize(TypedValue.COMPLEX_UNIT_SP, s.heroLarge ? 80 : 36);
      w.setTypeface(Typeface.SERIF);
      w.setTextColor(look.ink);
      box.addView(w);
      TextView sub = new TextView(c);
      sub.setText(s.heroSub);
      sub.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
      sub.setTypeface(Typeface.DEFAULT, Typeface.ITALIC);
      sub.setTextColor(look.faint);
      box.addView(sub);
      TextView line = new TextView(c);
      line.setText(look.rich(s.heroLine, s.heroRuns));
      line.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
      line.setTextColor((look.ink & 0x00ffffff) | 0xcc000000);
      line.setPadding(0, dp(8), 0, 0);
      box.addView(line);
      return box;
    }

    private View row(Screen.Row r) {
      Context c = getContext();
      if (r.kind.equals("field")) return fieldRow(r);
      if (r.kind.equals("text")) return textRow(r);
      if (r.kind.equals("tiles")) return tilesRow(r);
      if (!r.cells.isEmpty()) return gridRow(r);
      if (r.custom == CUSTOM_SWATCHES) return swatches(r);
      if (r.custom == CUSTOM_CARD) return cardRow(r);
      LinearLayout line = new LinearLayout(c);
      line.setGravity(Gravity.CENTER_VERTICAL);
      line.setPadding(dp(20), dp(10), dp(20), dp(10));
      line.setMinimumHeight(dp(52));
      line.setAlpha(r.flag('d') ? 0.4f : 1);
      // (What TalkBack says for it, as core words it.)
      if (!r.label.isEmpty()) line.setContentDescription(r.label);
      if (r.circle > 0) {
        // (A day's circle: read, partly, not; dimmed and inert, k.)
        TextView ci = new TextView(c);
        ci.setText(r.circle == 3 ? "●" : r.circle == 2 ? "◐" : "○");
        ci.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        ci.setTextColor(r.circle == 1 ? look.faint : look.accent);
        ci.setPadding(0, 0, dp(14), 0);
        boolean off = r.flag('k');
        ci.setAlpha(off ? 0.4f : 1);
        if (!off) ci.setOnClickListener(v -> Native.send("act " + screen.id + " " + r.circleAction
            + " " + r.arg + " 0"));
        line.addView(ci);
      } else if (!r.icon.isEmpty() || r.custom == CUSTOM_DOWNLOAD) {
        // (Something coming: its progress as a circle filling, in the
        // icon's place, so its words never move.)
        String g = r.custom == CUSTOM_DOWNLOAD ? ring(r.value) : icon(r.icon);
        if (!g.isEmpty()) {
          TextView ic = new TextView(c);
          ic.setText(g);
          ic.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
          ic.setTextColor(!r.iconColor.isEmpty() ? Look.color(r.iconColor) : r.flag('g') ? look.faint
              : look.accent);
          ic.setPadding(0, 0, dp(14), 0);
          ic.setMinWidth(dp(36));
          line.addView(ic);
        }
      }
      if (!r.lead.isEmpty()) {
        // (A letter: its glyph in a column of its own.)
        TextView g = new TextView(c);
        g.setText(r.lead);
        g.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        g.setTypeface(Typeface.SERIF);
        g.setTextColor(look.ink);
        g.setGravity(Gravity.CENTER);
        line.addView(g, new LinearLayout.LayoutParams(dp(56), -2));
      }
      LinearLayout words = new LinearLayout(c);
      words.setOrientation(LinearLayout.VERTICAL);
      TextView t = new TextView(c);
      boolean hit = r.custom == CUSTOM_HIT;
      CharSequence tt = r.truns.length > 0 ? look.rich(r.title, r.truns) : r.title;
      if (!r.suffix.isEmpty()) {
        SpannableString ts = new SpannableString(tt + r.suffix);
        ts.setSpan(new ForegroundColorSpan(look.faint), tt.length(), ts.length(),
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        tt = ts;
      }
      t.setText(tt);
      t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
      t.setTextColor(r.flag('x') || r.flag('t') ? look.accent : r.flag('f') ? look.faint : look.ink);
      if (r.kind.equals("button")) t.setGravity(Gravity.CENTER_HORIZONTAL);
      if (r.custom == CUSTOM_FONT) t.setTypeface(Look.faceOf((int) r.arg));
      if (r.titleLines > 0) {
        t.setMaxLines(r.titleLines);
        t.setEllipsize(TextUtils.TruncateAt.END);
      }
      // (Strong: the row to go to, or the book being read.)
      if (r.flag('b')) t.setTypeface(Typeface.DEFAULT_BOLD);
      // (A verse found: its reference small, in the accent.)
      if (hit) {
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        t.setTextColor(look.accent);
        t.setTypeface(Typeface.DEFAULT_BOLD);
      }
      words.addView(t);
      boolean valueDetail = r.flag('v');
      if (!r.detail.isEmpty() && !valueDetail) {
        TextView d = new TextView(c);
        d.setText(r.runs.length > 0 ? look.rich(r.detail, r.runs) : marked(r));
        d.setTextSize(TypedValue.COMPLEX_UNIT_SP, hit ? 16 : r.flag('m') ? 13 : 14);
        d.setTextColor(hit ? (look.ink & 0x00ffffff) | 0xcc000000 : look.faint);
        if (hit) {
          // (Its words as the reader's, up to four lines; a verse in its
          // own script whole.)
          d.setTypeface(Typeface.SERIF);
          d.setLineSpacing(0, 1.15f);
          if (r.runs.length == 0) {
            d.setMaxLines(4);
            d.setEllipsize(TextUtils.TruncateAt.END);
          }
          d.setPadding(0, dp(3), 0, 0);
        } else if (r.flag('s') || r.lines > 0) {
          // (The Bible's words: a line, or two for the row to go to; or
          // as many as the row says.)
          d.setMaxLines(r.lines > 0 ? r.lines : r.flag('b') ? 2 : 1);
          d.setEllipsize(TextUtils.TruncateAt.END);
        }
        words.addView(d);
      }
      if (!r.note.isEmpty()) {
        TextView n = new TextView(c);
        n.setText(r.note);
        n.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        n.setTextColor(look.faint);
        n.setPadding(0, dp(3), 0, 0);
        words.addView(n);
      }
      boolean slider = r.kind.equals("slider");
      if (slider) {
        line.setOrientation(LinearLayout.VERTICAL);
        line.setGravity(Gravity.NO_GRAVITY);
      }
      line.addView(words, slider ? new LinearLayout.LayoutParams(-1, -2)
          : new LinearLayout.LayoutParams(0, -2, 1));
      if (!r.side.isEmpty()) {
        // (Words at its end: a letter's example, its letter stressed, over
        // its gloss.)
        LinearLayout side = new LinearLayout(c);
        side.setOrientation(LinearLayout.VERTICAL);
        side.setGravity(Gravity.END);
        TextView sw = new TextView(c);
        sw.setText(look.rich(r.side, r.sruns));
        sw.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        sw.setTypeface(Typeface.SERIF);
        sw.setTextColor(look.ink);
        sw.setGravity(Gravity.END);
        side.addView(sw);
        TextView sn = new TextView(c);
        sn.setText(r.sideNote);
        sn.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        sn.setTextColor(look.faint);
        sn.setGravity(Gravity.END);
        side.addView(sn);
        side.setPadding(dp(12), 0, 0, 0);
        line.addView(side);
      }
      if (r.flag('w')) {
        ProgressBar spin = new ProgressBar(c);
        spin.setIndeterminate(true);
        line.addView(spin, new LinearLayout.LayoutParams(dp(24), dp(24)));
      }
      if (!r.trailing.isEmpty()) {
        TextView tr = new TextView(c);
        tr.setText(r.trailing);
        tr.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        tr.setTextColor(r.flag('a') ? look.accent : look.faint);
        tr.setPadding(dp(12), 0, 0, 0);
        line.addView(tr);
      }
      if (r.kind.equals("item") || r.kind.equals("button") || r.kind.equals("custom")) {
        if (!r.detail.isEmpty() && valueDetail) {
          TextView d = new TextView(c);
          d.setText(r.detail);
          d.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
          d.setTextColor(look.faint);
          d.setPadding(dp(12), 0, dp(4), 0);
          line.addView(d);
        }
        boolean done = r.acc.equals("done");
        String mark = r.acc.equals("check") || done ? "✓" : r.acc.equals("more") ? "›"
            : r.acc.equals("link") ? "↗" : "";
        if (!mark.isEmpty()) {
          TextView a = new TextView(c);
          a.setText(mark);
          a.setTextSize(TypedValue.COMPLEX_UNIT_SP, r.acc.equals("more") ? 22 : 18);
          a.setTextColor(r.acc.equals("check") ? look.accent : look.faint);
          a.setPadding(dp(8), 0, 0, 0);
          if (look.accessories.containsKey(r.acc)) a.setContentDescription(look.accessories.get(r.acc));
          line.addView(a);
        }
        if (r.infoAction != 0) {
          // (Its ⓘ: a ribbon's own screen, a plan's days.)
          TextView inf = new TextView(c);
          inf.setText("ⓘ");
          inf.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
          inf.setTextColor(look.accent);
          inf.setPadding(dp(12), dp(4), 0, dp(4));
          inf.setContentDescription("Details");
          inf.setOnClickListener(v -> Native.send("act " + screen.id + " " + r.infoAction + " "
              + r.arg + " 0"));
          line.addView(inf);
        }
        if (r.flag('u') && !r.actions.isEmpty()) {
          // (Its actions as a menu at its end: a word's.)
          TextView more = new TextView(c);
          more.setText("⋯");
          more.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
          more.setTextColor(look.accent);
          more.setPadding(dp(12), dp(4), 0, dp(4));
          more.setContentDescription("More");
          more.setOnClickListener(v -> menu(r, v));
          line.addView(more);
        }
      } else if (r.kind.equals("toggle")) {
        Switch sw = new Switch(c);
        sw.setChecked(r.flag('o'));
        sw.setClickable(false);
        sw.setFocusable(false);
        line.addView(sw);
      } else if (r.kind.equals("time")) {
        TextView tv = new TextView(c);
        tv.setText(String.format(java.util.Locale.ROOT, "%d:%02d", r.value / 60, r.value % 60));
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        tv.setTextColor(look.accent);
        line.addView(tv);
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

    // The interlinear's words: a tile each (its English, the original, its
    // transliteration, its code; what it hides kept clear), wrapped in lines
    // (right to left for the Hebrew's order); a tap does its action, a long
    // press offers its actions.
    private View tilesRow(Screen.Row r) {
      Context c = getContext();
      // (Large: an exercise's word and its choices.)
      boolean big = (r.value & 2) != 0;
      Flow flow = new Flow(c, dp(big ? 10 : 6), dp(14), (r.value & 1) != 0);
      flow.setPadding(dp(14), dp(6), dp(14), dp(6));
      Screen sc = screen;
      for (Screen.Cell cl : r.cells) {
        // (A choice offered: its words alone, on a washed button.)
        if ((cl.flags & Screen.TILE_OPTION) != 0) {
          TextView o = tileLine(cl.sub, big ? 22 : 19, false, look.ink);
          o.setPadding(dp(big ? 18 : 14), dp(12), dp(big ? 18 : 14), dp(12));
          o.setMinWidth(dp(big ? 72 : 64));
          o.setBackground(tileWash((cl.flags & Screen.TILE_SELECTED) != 0));
          o.setContentDescription(cl.label);
          o.setOnClickListener(v -> Native.send("act " + sc.id + " " + cl.action + " " + cl.arg + " 0"));
          flow.addView(o);
          continue;
        }
        LinearLayout t = new LinearLayout(c);
        t.setOrientation(LinearLayout.VERTICAL);
        t.setGravity(Gravity.CENTER_HORIZONTAL);
        t.setPadding(dp(8), dp(6), dp(8), dp(6));
        if ((cl.flags & Screen.TILE_SELECTED) != 0) t.setBackground(tileWash(true));
        boolean added = (cl.flags & Screen.TILE_ADDED) != 0;
        int subColor = (cl.flags & Screen.TILE_WRONG) != 0 ? 0xffc0392b : look.ink;
        TextView sub = tileLine(cl.sub, big ? 21 : added || (cl.flags & Screen.TILE_FAINT_SUB) != 0 ? 12 : 15,
            added || (cl.flags & Screen.TILE_FAINT_SUB) != 0, subColor);
        if ((cl.flags & Screen.TILE_HIDE_SUB) != 0) sub.setAlpha(0);
        if ((cl.flags & Screen.TILE_HELPED) != 0) sub.setPaintFlags(sub.getPaintFlags()
            | android.graphics.Paint.UNDERLINE_TEXT_FLAG);
        t.addView(sub);
        if (!added) {
          TextView o = tileLine(cl.text, big ? 44 : 21, false, look.ink);
          o.setTypeface(Typeface.SERIF);
          t.addView(o);
          TextView tr = tileLine(cl.tr, 12, true, look.faint);
          if ((cl.flags & Screen.TILE_HIDE_TR) != 0) tr.setAlpha(0);
          if ((cl.flags & Screen.TILE_WRONG) != 0) tr.setPaintFlags(tr.getPaintFlags()
              | android.graphics.Paint.STRIKE_THRU_TEXT_FLAG);
          t.addView(tr);
          TextView code = tileLine(cl.count, 11, false, look.faint);
          code.setTypeface(Typeface.MONOSPACE);
          t.addView(code);
          Screen s = screen;
          t.setContentDescription(cl.label);
          t.setOnClickListener(v -> Native.send("act " + s.id + " " + cl.action + " " + cl.arg + " 0"));
          if (!cl.actions.isEmpty()) t.setOnLongClickListener(v -> {
            PopupMenu m = new PopupMenu(c, v);
            for (int j = 0; j < cl.actions.size(); j++) m.getMenu().add(0, j, j, cl.actions.get(j).title);
            m.setOnMenuItemClickListener(item -> {
              Native.send("act " + s.id + " " + cl.actions.get(item.getItemId()).action + " "
                  + cl.arg + " 0");
              return true;
            });
            m.show();
            return true;
          });
        }
        flow.addView(t);
      }
      return flow;
    }

    // A tile's wash: the ink faintly, rounded; ringed in the accent if it is
    // the one chosen for.
    private android.graphics.drawable.GradientDrawable tileWash(boolean ringed) {
      android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
      d.setCornerRadius(dp(10));
      d.setColor((look.ink & 0x00ffffff) | 0x12000000);
      if (ringed) d.setStroke(dp(2), look.accent);
      return d;
    }

    private TextView tileLine(String words, int sp, boolean italic, int color) {
      TextView l = new TextView(getContext());
      l.setText(words);
      l.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
      if (italic) l.setTypeface(Typeface.DEFAULT, Typeface.ITALIC);
      l.setTextColor(italic ? look.faint : color);
      l.setGravity(Gravity.CENTER);
      return l;
    }

    // A page's paragraph: its words by their runs, selectable, its links
    // doing their actions; a heading larger and bold, with room above it.
    private View textRow(Screen.Row r) {
      Context c = getContext();
      TextView t = new TextView(c);
      CharSequence words = look.rich(r.title, r.truns);
      android.text.SpannableStringBuilder s = new android.text.SpannableStringBuilder(words);
      Screen sc = screen;
      // (A Practice passage: in the reader's type, its links its words'
      // own color, a hidden word's tap showing it.)
      boolean practice = false, scripture = false;
      for (int j = 1; j < r.truns.length; j += 2) {
        if (r.truns[j] >= Look.RUN_PRACTICE) practice = true;
        // (Words set in the reader's styles, a passage's preview: in its
        // type too.)
        if (r.truns[j] < 100) scripture = true;
      }
      boolean plainLinks = practice;
      for (int j = 0; j + 3 < r.links.length; j += 4) {
        int b = (int) Math.max(0, Math.min(r.links[j], s.length()));
        int e = (int) Math.max(b, Math.min(r.links[j + 1], s.length()));
        int action = (int) r.links[j + 2];
        long arg = r.links[j + 3];
        s.setSpan(new android.text.style.ClickableSpan() {
          @Override
          public void onClick(View v) {
            Native.send("act " + sc.id + " " + action + " " + arg + " 0");
          }

          @Override
          public void updateDrawState(android.text.TextPaint p) {
            if (!plainLinks) p.setColor(look.accent);
          }
        }, b, e, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      }
      if (r.value > 0 || r.lo > 0) {
        // (Its indent and hang, tenths of an em: a definition's sense.)
        int em = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, 16,
            getResources().getDisplayMetrics());
        s.setSpan(new android.text.style.LeadingMarginSpan.Standard(r.value * em / 10,
            (r.value + r.lo) * em / 10), 0, s.length(), Spanned.SPAN_INCLUSIVE_INCLUSIVE);
      }
      t.setText(s);
      if (r.links.length > 0) t.setMovementMethod(android.text.method.LinkMovementMethod.getInstance());
      t.setTextIsSelectable(true);
      t.setTextColor(look.ink);
      t.setTextSize(TypedValue.COMPLEX_UNIT_SP, practice || scripture ? look.textSp() : r.flag('h') ? 18 : 16);
      if (practice || scripture) t.setTypeface(Typeface.SERIF);
      if (r.flag('h')) {
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setAccessibilityHeading(true);
      }
      t.setLineSpacing(0, practice || scripture ? look.spacing : 1.2f);
      if (practice) {
        // (Not selectable: a tap on a word is a link's; no wash as it is
        // pressed.)
        t.setTextIsSelectable(false);
        t.setMovementMethod(android.text.method.LinkMovementMethod.getInstance());
        t.setHighlightColor(0);
      }
      t.setPadding(dp(20), dp(r.flag('h') ? 20 : 0), dp(20), dp(r.flag('h') ? 6 : 10));
      if (!r.label.isEmpty()) t.setContentDescription(r.label);
      return t;
    }

    // A field (New Ribbon's name, Add Passage's reference): its title the
    // placeholder, its detail the words in it. Kept across updates.
    private View fieldRow(Screen.Row r) {
      Context c = getContext();
      Screen s = screen;
      EditText f = rowFields.get(s.id);
      if (f == null) {
        f = new EditText(c);
        f.setSingleLine();
        f.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        f.setText(r.detail);
        if (r.fieldKind == 2) {
          // (Many lines: a note's.)
          f.setSingleLine(false);
          f.setMinLines(6);
          f.setGravity(Gravity.TOP);
        }
        // (Letters as typed: no capitals, no suggestions, nothing corrected.)
        f.setInputType(r.fieldKind == 2 ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
            | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES : r.fieldKind == 1 ? InputType.TYPE_CLASS_TEXT
            | InputType.TYPE_TEXT_FLAG_CAP_WORDS | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            : r.fieldKind == 3 ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            : InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        f.setImeOptions(r.flag('r') ? EditorInfo.IME_ACTION_DONE : EditorInfo.IME_ACTION_DONE);
        final EditText ff = f;
        if (r.flag('l')) {
          // (Its words to core as they are typed.)
          f.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence x, int a, int b, int n) {}

            @Override
            public void onTextChanged(CharSequence x, int a, int b, int n) {}

            @Override
            public void afterTextChanged(Editable e) {
              typed = android.os.SystemClock.uptimeMillis();
              Screen.Row now = Panel.fieldRow(s);
              if (now != null) Native.send("text " + s.id + " " + now.action + " " + now.arg + " "
                  + Wire.escape(e.toString()));
            }
          });
        }
        f.setOnEditorActionListener((v, action, ev) -> {
          // (The screen as core last made it: its row and confirm may have
          // changed since the field was made, as an exercise's Check
          // becomes Next.)
          Screen cur = screens.containsKey(s.id) ? screens.get(s.id) : s;
          Screen.Row now = Panel.fieldRow(cur);
          if (now == null) return false;
          if (!now.flag('l')) Native.send("text " + s.id + " " + now.action + " " + now.arg + " "
              + Wire.escape(ff.getText().toString()));
          // (A field that keeps the keys: the screen's submit, typing on.)
          if (now.flag('e')) Native.send("submit " + s.id);
          else if (now.flag('r') && !cur.confirm.isEmpty()) Native.send("act " + s.id + " "
              + cur.confirmAction + " 0 0");
          else keyboardAway();
          return true;
        });
        rowFields.put(s.id, f);
        if (s.focus >= 0) f.post(ff::requestFocus);
      }
      f.setHint(r.title);
      f.setTextColor(look.ink);
      f.setHintTextColor(look.faint);
      if (!r.label.isEmpty()) f.setContentDescription(r.label);
      // (Its box the same view each time the screen is made again: the
      // list keeps a view it is given back focused, the keyboard's typing
      // going on into it; a new parent would take its focus, and what is
      // typed meanwhile would be lost.)
      if (f.getParent() instanceof FrameLayout && "field".equals(((View) f.getParent()).getTag()))
        return (View) f.getParent();
      if (f.getParent() instanceof ViewGroup) ((ViewGroup) f.getParent()).removeView(f);
      FrameLayout box = new FrameLayout(c);
      box.setTag("field");
      box.setPadding(dp(16), dp(4), dp(16), dp(4));
      box.addView(f, new FrameLayout.LayoutParams(-1, -2));
      return box;
    }

    // A grid's row: its label in a column of its own, then its cells, each
    // a form over what it does and its count (a tap: its concordance), or
    // a faint "—".
    private View gridRow(Screen.Row r) {
      Context c = getContext();
      LinearLayout line = new LinearLayout(c);
      line.setGravity(Gravity.CENTER_VERTICAL);
      line.setPadding(dp(20), dp(6), dp(20), dp(6));
      TextView label = new TextView(c);
      label.setText(r.title);
      label.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
      label.setTextColor(look.faint);
      label.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
      line.addView(label, new LinearLayout.LayoutParams(0, -2, 0.36f * r.cells.size() / 0.64f));
      for (Screen.Cell cl : r.cells) {
        LinearLayout col = new LinearLayout(c);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_HORIZONTAL);
        col.setPadding(dp(2), dp(6), dp(2), dp(6));
        TextView f = new TextView(c);
        f.setText(cl.text);
        f.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        f.setTypeface(cl.script != 0 ? Typeface.SERIF : Typeface.DEFAULT);
        f.setTextColor(cl.script != 0 ? look.ink : look.faint);
        f.setGravity(Gravity.CENTER);
        col.addView(f);
        if (!cl.sub.isEmpty()) {
          TextView sb = new TextView(c);
          sb.setText(cl.sub);
          sb.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
          sb.setTypeface(Typeface.DEFAULT, Typeface.ITALIC);
          sb.setTextColor((look.ink & 0x00ffffff) | 0xcc000000);
          sb.setGravity(Gravity.CENTER);
          sb.setMaxLines(2);
          col.addView(sb);
        }
        if (!cl.count.isEmpty()) {
          TextView n = new TextView(c);
          n.setText(cl.count);
          n.setTextSize(TypedValue.COMPLEX_UNIT_SP, 11);
          n.setTextColor(look.faint);
          n.setGravity(Gravity.CENTER);
          col.addView(n);
        }
        col.setContentDescription(cl.label);
        if (cl.action != 0) col.setOnClickListener(v -> Native.send("act " + screen.id + " "
            + cl.action + " " + cl.arg + " 0"));
        line.addView(col, new LinearLayout.LayoutParams(0, -2, 1));
      }
      return line;
    }

    // Share as Image's card (core's CUSTOM_CARD), drawn at its pixels and
    // shown as large as fits, its corners rounded.
    private View cardRow(Screen.Row r) {
      Context c = getContext();
      android.widget.ImageView iv = new android.widget.ImageView(c);
      android.graphics.Bitmap b = Card.draw(r, look.face());
      if (b != null) iv.setImageBitmap(b);
      iv.setAdjustViewBounds(true);
      iv.setScaleType(android.widget.ImageView.ScaleType.FIT_CENTER);
      iv.setMaxHeight(getResources().getDisplayMetrics().heightPixels / 2);
      iv.setClipToOutline(true);
      iv.setOutlineProvider(new android.view.ViewOutlineProvider() {
        @Override
        public void getOutline(View v, android.graphics.Outline o) {
          o.setRoundRect(0, 0, v.getWidth(), v.getHeight(), dp(12));
        }
      });
      iv.setElevation(dp(4));
      iv.setContentDescription(r.label);
      FrameLayout box = new FrameLayout(c);
      box.setPadding(dp(24), dp(16), dp(24), dp(16));
      box.addView(iv, new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL));
      return box;
    }

    // The ribbons' colors (core's CUSTOM_SWATCHES): a circle each (its hex
    // in the row's options, its name in its detail), the chosen ringed.
    private View swatches(Screen.Row r) {
      Context c = getContext();
      LinearLayout line = new LinearLayout(c);
      line.setPadding(dp(20), dp(12), dp(20), dp(12));
      String[] hex = Screen.split(r.options), names = Screen.split(r.detail);
      for (int j = 0; j < hex.length; j++) {
        final int n = j;
        View dot = circle(Look.color(hex[j]), j == r.value, 30);
        if (j < names.length) dot.setContentDescription(names[j]);
        dot.setOnClickListener(v -> act(r, n));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(30), dp(30));
        lp.setMargins(0, 0, dp(12), 0);
        line.addView(dot, lp);
      }
      return line;
    }
  }

  // A download's progress (thousandths) as a circle filling: empty, a
  // quarter, a half, three quarters, full.
  private static String ring(int value) {
    String[] quarters = {"○", "◔", "◑", "◕", "●"};
    int q = Math.max(0, Math.min(4, (value + 125) / 250));
    return quarters[q];
  }

  // An icon core names (the iPhone's symbol) as a character, where one
  // reads as it ("" for those left out).
  private static String icon(String name) {
    switch (name) {
      case "arrow.down.circle":
        return "↓";
      case "checkmark.circle":
        return "✓";
      case "exclamationmark.circle":
        return "!";
      case "ribbon":
        return "▮";
      case "plus":
        return "+";
      case "circle":
        return "○";
      case "circle.lefthalf.filled":
        return "◐";
      case "checkmark.circle.fill":
        return "●";
      case "clock.arrow.circlepath":
        return "↺";
      case "globe":
        return "⊕";
      case "arrow.right":
      case "arrow.right.circle.fill":
        return "→";
      case "square.and.arrow.up":
        return "⇪";
      case "text.quote":
        return "\u201C";
      case "book.closed":
        return "\uD83D\uDCD6";
      case "brain":
        return "✦";
      case "doc.on.doc":
        return "⧉";
      case "square.and.pencil":
      case "note.text":
        return "✎";
      case "bookmark":
      case "bookmark.fill":
        return "\uD83D\uDD16";
      default:
        return "";
    }
  }

  // A row's detail, its marks stressed (in full ink, bold, washed), the
  // divine name's letters core marks in small capitals.
  private CharSequence marked(Screen.Row r) {
    if (r.marks.length < 2 && r.caps.length < 2) return r.detail;
    SpannableString s = new SpannableString(r.detail);
    for (int i = 0; i + 1 < r.caps.length; i += 2) {
      int b = Math.max(0, Math.min(r.caps[i], s.length()));
      int e = Math.max(b, Math.min(r.caps[i + 1], s.length()));
      s.setSpan(new android.text.style.RelativeSizeSpan(0.8f), b, e, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
    for (int i = 0; i + 1 < r.marks.length; i += 2) {
      int b = Math.max(0, Math.min(r.marks[i], s.length()));
      int e = Math.max(b, Math.min(r.marks[i + 1], s.length()));
      int f = Spanned.SPAN_EXCLUSIVE_EXCLUSIVE;
      s.setSpan(new StyleSpan(Typeface.BOLD), b, e, f);
      s.setSpan(new ForegroundColorSpan(look.ink), b, e, f);
      s.setSpan(new BackgroundColorSpan((look.accent & 0x00ffffff) | 0x26000000), b, e, f);
    }
    return s;
  }

  // core/skin.l8's CUSTOM_FONT (a font, in its own face), CUSTOM_HIT (a
  // verse a search found), CUSTOM_SWATCHES (colors to choose) and
  // CUSTOM_CARD (Share as Image's card).
  static final int CUSTOM_FONT = 4, CUSTOM_HIT = 5, CUSTOM_SWATCHES = 6, CUSTOM_DOWNLOAD = 7,
      CUSTOM_CARD = 11;

  private static final class Hero {}

  private static final class Grid {
    final Screen.Section section;

    Grid(Screen.Section s) {
      section = s;
    }
  }

  // A section's credit (core's credit line: K WORDS LINK ADDRESS LABEL).
  private static final class Credit {
    final Wire line;

    Credit(Wire line) {
      this.line = line;
    }
  }

  private static final class Intro {
    final CharSequence text;

    Intro(CharSequence t) {
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
