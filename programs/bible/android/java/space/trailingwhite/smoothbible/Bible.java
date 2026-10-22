package space.trailingwhite.smoothbible;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;

// Smooth Bible on Android: a skin (SKINS.md). The app is core's, in L8
// (android/main.l8); this draws what it says with Android's own views, and
// tells it what is done: the reader (Reader), the bar, and core's screens
// over them (Panel).
public final class Bible extends Activity {
  final Look look = new Look();
  Reader reader;
  Panel panel;
  Tray tray;
  // The way back (core's capsule): its words, at the reader's foot.
  TextView capsule;
  // Listen: the voice, and the small player (core's words, and Stop).
  Voice voice;
  LinearLayout player;
  TextView playerTitle, playerState;
  FrameLayout root;
  LinearLayout bar;
  TextView title, version, settings, library;
  android.widget.ImageView search;
  // A screen or a chapter being said (between its first line and end).
  Screen building;
  Screen.Section section;
  int chapterC = -1;
  String chapterText;
  final ArrayList<Wire> chapterLines = new ArrayList<>();

  // (The versions bundled, as assets, copied to the app's files once.)
  static final String[] VERSIONS = {"bsb.txt", "kjv.txt", "web.txt", "asv.txt", "ylt.txt"};

  @Override
  protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    Native.app = this;
    root = new FrameLayout(this);
    reader = new Reader(this, look);
    root.addView(reader, new FrameLayout.LayoutParams(-1, -1));
    bar = new LinearLayout(this);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    bar.setPadding(dp(16), 0, dp(8), 0);
    title = new TextView(this);
    title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
    title.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD));
    title.setSingleLine();
    title.setEllipsize(TextUtils.TruncateAt.END);
    title.setPadding(0, dp(12), dp(12), dp(12));
    title.setOnClickListener(v -> Native.send("tap goto"));
    // (A long press: the title's menu, core's: New Ribbon Here, the
    // ribbon carried's Leave Here, Move Here.)
    title.setOnLongClickListener(v -> {
      menuWanted = true;
      Native.send("titlemenu");
      return true;
    });
    version = button("", "versions");
    settings = button("Aa", "settings");
    settings.setContentDescription("Settings");
    // (The Library: what is kept, Memory, and the languages.)
    library = button("☰", "library");
    library.setContentDescription("Library");
    search = new android.widget.ImageView(this);
    search.setImageResource(android.R.drawable.ic_menu_search);
    search.setPadding(dp(10), dp(10), dp(10), dp(10));
    search.setContentDescription("Search");
    search.setOnClickListener(v -> Native.send("tap search"));
    bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    bar.addView(library);
    bar.addView(search, new LinearLayout.LayoutParams(dp(44), dp(44)));
    bar.addView(version);
    bar.addView(settings);
    root.addView(bar, new FrameLayout.LayoutParams(-1, dp(52), Gravity.TOP));
    reader.topInset = dp(52);
    player = new LinearLayout(this);
    player.setOrientation(LinearLayout.HORIZONTAL);
    player.setGravity(Gravity.CENTER_VERTICAL);
    player.setPadding(dp(16), dp(8), dp(8), dp(8));
    player.setVisibility(View.GONE);
    LinearLayout words = new LinearLayout(this);
    words.setOrientation(LinearLayout.VERTICAL);
    playerTitle = new TextView(this);
    playerTitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
    playerTitle.setTypeface(Typeface.DEFAULT_BOLD);
    playerState = new TextView(this);
    playerState.setTextSize(TypedValue.COMPLEX_UNIT_SP, 12);
    words.addView(playerTitle);
    words.addView(playerState);
    player.addView(words, new LinearLayout.LayoutParams(0, -2, 1));
    TextView stop = new TextView(this);
    stop.setText("\u25A0");
    stop.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
    stop.setPadding(dp(16), dp(8), dp(16), dp(8));
    stop.setContentDescription("Stop Listening");
    stop.setOnClickListener(v -> {
      if (voice != null) voice.stop();
      player.setVisibility(View.GONE);
      Native.send("listenstop");
    });
    player.addView(stop);
    FrameLayout.LayoutParams pp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
    root.addView(player, pp);
    capsule = new TextView(this);
    capsule.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
    capsule.setTypeface(Typeface.DEFAULT_BOLD);
    capsule.setPadding(dp(16), dp(10), dp(16), dp(10));
    capsule.setVisibility(View.GONE);
    capsule.setContentDescription("Go back");
    capsule.setOnClickListener(v -> {
      capsule.setVisibility(View.GONE);
      Native.send("back");
    });
    FrameLayout.LayoutParams cp = new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.START);
    cp.setMargins(dp(16), 0, 0, dp(16));
    root.addView(capsule, cp);
    tray = new Tray(this, look);
    root.addView(tray, new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM));
    panel = new Panel(this, look);
    root.addView(panel, new FrameLayout.LayoutParams(-1, -1));
    setContentView(root);
    // (Edge to edge: the bar below the status bar, the reader's ends clear
    // of the system's bars.)
    root.setOnApplyWindowInsetsListener((v, insets) -> {
      android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars());
      FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) bar.getLayoutParams();
      lp.height = bars.top + dp(52);
      bar.setLayoutParams(lp);
      bar.setPadding(dp(16), bars.top, dp(8), 0);
      reader.topInset = bars.top + dp(52);
      reader.setPadding(0, 0, 0, bars.bottom);
      reader.setClipToPadding(false);
      panel.setPadding(0, bars.top, 0, bars.bottom);
      tray.setPadding(dp(16), dp(10), dp(16), dp(10) + bars.bottom);
      ((FrameLayout.LayoutParams) capsule.getLayoutParams()).bottomMargin = dp(16) + bars.bottom;
      player.setPadding(dp(16), dp(8), dp(8), dp(8) + bars.bottom);
      return insets;
    });
    restyle();
    new Thread(() -> {
      File dir = getFilesDir();
      copyVersions(dir);
      runOnUiThread(() -> begin(dir));
    }).start();
  }

  private TextView button(String text, String tap) {
    TextView b = new TextView(this);
    b.setText(text);
    b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
    b.setPadding(dp(12), dp(12), dp(12), dp(12));
    b.setOnClickListener(v -> Native.send("tap " + tap));
    return b;
  }

  int dp(float n) {
    return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, n,
        getResources().getDisplayMetrics());
  }

  // (And the language data, the cross references, the commentary, the
  // Manual.)
  static final String[] DATA = {"xref_index.bin", "xrefs.bin", "mhcc.txt", "help.txt", "orig.txt",
      "plans/mcheyne.txt", "plans/chrono.txt"};

  private void copyVersions(File dir) {
    long apk = new File(getApplicationInfo().sourceDir).lastModified();
    ArrayList<String> names = new ArrayList<>(java.util.Arrays.asList(VERSIONS));
    names.addAll(java.util.Arrays.asList(DATA));
    try {
      String[] lang = getAssets().list("lang");
      if (lang != null) for (String n : lang) names.add("lang/" + n);
    } catch (java.io.IOException e) {
      android.util.Log.w("smoothbible", "listing lang: " + e);
    }
    new File(dir, "lang").mkdirs();
    new File(dir, "plans").mkdirs();
    for (String name : names) {
      File f = new File(dir, name);
      if (f.exists() && f.lastModified() >= apk) continue;
      try (InputStream in = getAssets().open(name); OutputStream out = new FileOutputStream(f)) {
        byte[] b = new byte[65536];
        for (int k; (k = in.read(b)) > 0; ) out.write(b, 0, k);
      } catch (Exception e) {
        android.util.Log.w("smoothbible", "copying " + name + ": " + e);
      }
    }
  }

  private void begin(File dir) {
    Native.send("files " + dir.getAbsolutePath());
    Native.start();
    android.util.DisplayMetrics m = getResources().getDisplayMetrics();
    Native.send("start " + (int) (m.widthPixels / m.density) + " " + (int) (m.heightPixels / m.density)
        + " " + (int) (m.density * 100) + " " + (systemDark() ? 1 : 0));
  }

  boolean systemDark() {
    return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
        == Configuration.UI_MODE_NIGHT_YES;
  }

  @Override
  public void onConfigurationChanged(Configuration c) {
    super.onConfigurationChanged(c);
    Native.send("dark " + (systemDark() ? 1 : 0));
  }

  @Override
  protected void onPause() {
    super.onPause();
    Native.send("away");
  }

  // Back closes the screens first (the system's Back, with predictive
  // back, asks a callback only while one is registered: while screens show).
  private final android.window.OnBackInvokedCallback backCallback = () -> panel.back();
  private boolean backRegistered;

  void panelShown(boolean shown) {
    if (shown == backRegistered) return;
    backRegistered = shown;
    android.window.OnBackInvokedDispatcher d = getOnBackInvokedDispatcher();
    if (shown) d.registerOnBackInvokedCallback(
        android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
    else d.unregisterOnBackInvokedCallback(backCallback);
  }

  // The title's menu asked for, and its model coming (core's screen 0).
  boolean menuWanted, titleMenuNext;

  void showTitleMenu(Screen s) {
    android.widget.PopupMenu m = new android.widget.PopupMenu(this, title);
    int n = 0;
    final ArrayList<Screen.Row> rows = new ArrayList<>();
    for (Screen.Section sec : s.sections)
      for (Screen.Row r : sec.rows) {
        if (r.action == 0) continue;
        m.getMenu().add(0, n, n, r.detail.isEmpty() ? r.title : r.title + "  " + r.detail);
        rows.add(r);
        n++;
      }
    m.setOnMenuItemClickListener(item -> {
      Screen.Row r = rows.get(item.getItemId());
      Native.send("menuact " + r.action + " " + r.arg);
      return true;
    });
    m.show();
  }

  private final Runnable capsuleAway = () -> capsule.setVisibility(View.GONE);

  void restyle() {
    root.setBackgroundColor(look.bg);
    // (Over the status bar too, the page's color.)
    reader.setBackgroundColor(look.bg);
    bar.setBackgroundColor(look.bg);
    title.setTextColor(look.ink);
    version.setTextColor(look.accent);
    settings.setTextColor(look.accent);
    library.setTextColor(look.accent);
    search.setColorFilter(look.accent);
    Window w = getWindow();
    w.setStatusBarColor(look.bg);
    w.setNavigationBarColor(look.bg);
    View d = w.getDecorView();
    int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    d.setSystemUiVisibility(look.dark ? 0 : flags);
    panel.restyle();
  }

  // What core said: lines, each acted on, a screen's or a chapter's
  // gathered to its end first.
  void said(String lines) {
    int p = 0;
    while (p < lines.length()) {
      int e = lines.indexOf('\n', p);
      if (e < 0) e = lines.length();
      line(new Wire(lines.substring(p, e)));
      p = e + 1;
    }
  }

  private void line(Wire w) {
    String word = w.word(0);
    if (building != null) {
      if (word.equals("section")) {
        section = Screen.section(w);
        building.sections.add(section);
      } else if (word.equals("row") && section != null) section.rows.add(Screen.row(w));
      else if (word.equals("cell") && section != null && !section.rows.isEmpty())
        section.rows.get(section.rows.size() - 1).cells.add(Screen.cell(w));
      else if (word.equals("empty")) {
        building.emptySymbol = w.field(1);
        building.emptyTitle = w.field(2);
        building.emptyLine = w.field(3);
      } else if (word.equals("focus")) {
        building.focus = w.num(1);
        building.focusSelect = w.num(2) == 1;
      } else if (word.equals("intro")) {
        building.intro = w.field(1);
        building.introRuns = Screen.runs(w.field(2));
        building.introQuote = w.fieldNum(3) == 1;
      } else if (word.equals("left")) {
        building.leftAction = w.fieldNum(1);
        building.left = w.field(2);
        building.leftDestructive = w.fieldNum(4) == 2;
      } else if (word.equals("hero")) {
        building.hero = w.field(1);
        building.heroScript = w.fieldNum(2);
        building.heroSub = w.field(3);
        building.heroLine = w.field(4);
        building.heroRuns = Screen.runs(w.field(5));
      } else if (word.equals("tool")) building.tools.add(Screen.tool(w));
      else if (word.equals("confirm")) {
        building.confirmAction = w.fieldNum(1);
        building.confirm = w.field(2);
        building.confirmOff = w.fieldNum(3) == 1;
      } else if (word.equals("segments")) {
        building.segmentsAction = w.fieldNum(1);
        building.segment = w.fieldNum(2);
        building.segments = Screen.split(w.field(3));
      } else if (word.equals("filter")) {
        building.filterAction = w.fieldNum(1);
        building.filter = w.fieldNum(2);
        building.filterColors = Screen.split(w.field(3));
        building.filterLabels = Screen.split(w.field(4));
      } else if (word.equals("sort")) {
        building.sortAction = w.fieldNum(1);
        building.sort = w.fieldNum(2);
        building.sorts = Screen.split(w.field(3));
      }
      else if (word.equals("field")) {
        building.searchText = w.field(1);
        building.wait = w.fieldNum(2);
        building.go = w.field(3).contains("g");
        building.focusField = w.field(3).contains("f");
      } else if (word.equals("scopes")) {
        building.scope = w.fieldNum(1);
        building.scopes = w.field(2).split("\\|");
        building.scopeLabels = w.field(3).split("\\|");
      } else if (word.equals("plain")) building.plain = true;
      else if (word.equals("grid")) building.grid = true;
      else if (word.equals("button")) building.button = w.field(1);
      else if (word.equals("command")) {
        Screen.Command c = new Screen.Command();
        c.action = w.fieldNum(1);
        c.arg = w.fieldNum(2);
        c.title = w.field(3);
        c.destructive = w.field(4).contains("x");
        building.commands.add(c);
      }
      else if (word.equals("end")) {
        panel.screens.put(building.id, building);
        if (titleMenuNext) {
          titleMenuNext = false;
          menuWanted = false;
          showTitleMenu(building);
        }
        building = null;
        section = null;
      }
      return;
    }
    if (chapterC >= 0) {
      if (word.equals("end")) {
        reader.chapter(chapterC, chapterText, chapterLines);
        chapterC = -1;
        chapterLines.clear();
      } else chapterLines.add(w);
      return;
    }
    switch (word) {
      case "screen":
        if (w.num(1) == 0 && menuWanted) titleMenuNext = true;
        building = new Screen();
        building.id = w.num(1);
        building.kind = w.num(2);
        building.arg = w.num(3);
        building.title = w.field(1);
        building.search = w.field(2);
        break;
      case "chapter":
        chapterC = w.num(1);
        chapterText = w.field(1);
        break;
      case "present":
        panel.present(w.num(1));
        break;
      case "push":
        panel.push(w.num(1));
        break;
      case "update":
      case "refill":
        panel.update(w.num(1));
        break;
      case "pop":
        panel.back();
        break;
      case "present_over":
        panel.push(w.num(1));
        break;
      case "close":
        panel.back();
        break;
      case "pop_to":
        panel.popTo(w.num(1));
        break;
      case "url":
        // (A page outside the app, in the browser.)
        try {
          startActivity(new android.content.Intent(android.content.Intent.ACTION_VIEW,
              android.net.Uri.parse(w.field(1))));
        } catch (RuntimeException e) {
          // (No browser: nothing.)
        }
        break;
      case "retext":
        panel.retext(w.num(1));
        break;
      case "blur":
        panel.blur();
        break;
      case "dismiss":
        panel.dismiss();
        break;
      case "refresh":
        // (What is kept changed: every screen shown made again.)
        Native.send("refresh");
        break;
      case "study_verse":
        // (The tray's Study: core's screen of the verse.)
        tray.hide();
        reader.clearSelection();
        Native.send("versestudy " + w.num(1) + " " + w.num(2));
        break;
      case "tray":
        tray.show(panel.screens.get(0));
        break;
      case "tray_away":
        tray.hide();
        break;
      case "clear_selection":
        reader.clearSelection();
        tray.hide();
        break;
      case "highlighted":
        reader.reask(reader.selC);
        break;
      case "bookmarked":
        reader.reask(reader.selC);
        android.widget.Toast.makeText(this, w.num(1) == 1 ? "Bookmarked" : "Bookmark Removed",
            android.widget.Toast.LENGTH_SHORT).show();
        break;
      case "copy": {
        android.content.ClipboardManager cb = (android.content.ClipboardManager)
            getSystemService(CLIPBOARD_SERVICE);
        if (cb != null) cb.setPrimaryClip(android.content.ClipData.newPlainText("Verses", w.field(1)));
        android.widget.Toast.makeText(this, "Copied", android.widget.Toast.LENGTH_SHORT).show();
        break;
      }
      case "share": {
        android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(android.content.Intent.EXTRA_TEXT, w.field(1));
        startActivity(android.content.Intent.createChooser(i, null));
        break;
      }
      case "toast":
        android.widget.Toast.makeText(this, w.field(1), android.widget.Toast.LENGTH_SHORT).show();
        break;
      case "back": {
        // (The capsule: back to the place left, for 12 s.)
        String words = w.field(1);
        capsule.removeCallbacks(capsuleAway);
        if (words.isEmpty()) {
          capsule.setVisibility(View.GONE);
          break;
        }
        capsule.setText("\u2039 " + words);
        android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
        g.setCornerRadius(dp(20));
        g.setColor(look.dark ? 0xF24A4744 : 0xEBFFFFFF);
        capsule.setBackground(g);
        capsule.setTextColor(look.ink);
        capsule.setElevation(dp(4));
        capsule.setVisibility(View.VISIBLE);
        capsule.postDelayed(capsuleAway, 12000);
        break;
      }
      case "place":
        // (The reader to a place: chapter, verse, how far into it.)
        panel.dismiss();
        reader.jump(w.num(1), w.num(2) / 1000);
        break;
      case "say":
        if (voice == null) voice = new Voice(this);
        voice.say(w.num(1) + ":" + w.num(2), w.field(1));
        break;
      case "player": {
        playerTitle.setText(w.field(1));
        playerState.setText(w.field(2));
        player.setBackgroundColor(look.bg);
        playerTitle.setTextColor(look.ink);
        playerState.setTextColor(look.faint);
        ((TextView) player.getChildAt(1)).setTextColor(look.accent);
        player.setElevation(dp(8));
        player.setVisibility(View.VISIBLE);
        break;
      }
      case "listen_stop":
        if (voice != null) voice.stop();
        player.setVisibility(View.GONE);
        break;
      case "follow":
        reader.follow(w.num(1), w.num(2));
        break;
      case "wake":
        try {
          reader.wake(Long.parseLong(w.word(1)));
        } catch (NumberFormatException e) {
          // (Not a time: no tick.)
        }
        break;
      case "memorized":
        android.widget.Toast.makeText(this, "Added to Memory", android.widget.Toast.LENGTH_SHORT).show();
        break;
      case "reader":
        reader.setCount(w.num(1));
        break;
      case "jump":
        reader.jump(w.num(1), w.num(2));
        break;
      case "goto":
        // (A jump the reader is moved by: the carried ribbon put down.)
        Native.send("jumped 0");
        panel.dismiss();
        reader.jump(w.num(1), w.num(2));
        break;
      case "relayout":
        reader.forget();
        break;
      case "look":
        look.read(w);
        restyle();
        break;
      case "title":
        title.setText(w.field(1));
        break;
      case "version":
        version.setText(w.field(1));
        version.setContentDescription("Version: " + w.field(1));
        break;
      default:
        break;
    }
  }
}
