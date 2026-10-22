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
  FrameLayout root;
  LinearLayout bar;
  TextView title, version, settings;
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
    version = button("", "versions");
    settings = button("Aa", "settings");
    settings.setContentDescription("Settings");
    bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    bar.addView(version);
    bar.addView(settings);
    root.addView(bar, new FrameLayout.LayoutParams(-1, dp(52), Gravity.TOP));
    reader.topInset = dp(52);
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

  private void copyVersions(File dir) {
    long apk = new File(getApplicationInfo().sourceDir).lastModified();
    for (String name : VERSIONS) {
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

  void restyle() {
    root.setBackgroundColor(look.bg);
    // (Over the status bar too, the page's color.)
    reader.setBackgroundColor(look.bg);
    bar.setBackgroundColor(look.bg);
    title.setTextColor(look.ink);
    version.setTextColor(look.accent);
    settings.setTextColor(look.accent);
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
        section = new Screen.Section();
        section.header = w.field(1);
        section.footer = w.field(2);
        building.sections.add(section);
      } else if (word.equals("row") && section != null) section.rows.add(Screen.row(w));
      else if (word.equals("empty")) {
        building.emptySymbol = w.field(1);
        building.emptyTitle = w.field(2);
        building.emptyLine = w.field(3);
      } else if (word.equals("focus")) building.focus = w.num(1);
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
      case "dismiss":
        panel.dismiss();
        break;
      case "reader":
        reader.setCount(w.num(1));
        break;
      case "jump":
        reader.jump(w.num(1), w.num(2));
        break;
      case "goto":
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
