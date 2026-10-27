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
  // Listen: the voice, the recordings, and the small player (core's
  // words: Previous, Pause or Play, Next, Stop).
  Voice voice;
  final Sound sound = new Sound();
  LinearLayout player;
  TextView playerTitle, playerState, playerToggle;
  boolean playing;
  // The carried ribbon's color (none: no ribbon carried) and the title.
  String carried = "", titleWords = "";
  // The card Share as Image draws (core's CUSTOM_CARD row, its last).
  Screen.Row card;
  // What a reminder opened says, once core has begun (-1: none).
  int remindedPlan = -1, remindedMemory;
  // A file being saved (savefile: its words, until a place is chosen).
  String saving;
  FrameLayout root;
  LinearLayout bar;
  TextView title, version, settings, library, shelf;
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
    // (The Bookshelf: what is read beside the Bible.)
    shelf = button("▤", "shelf");
    shelf.setContentDescription("Bookshelf");
    search = new android.widget.ImageView(this);
    search.setImageResource(android.R.drawable.ic_menu_search);
    search.setPadding(dp(10), dp(10), dp(10), dp(10));
    search.setContentDescription("Search");
    search.setOnClickListener(v -> Native.send("tap search"));
    bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    bar.addView(shelf);
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
    playerButton("\u23EE\uFE0E", "Previous", "listenprev");
    playerToggle = playerButton("\u23F8\uFE0E", "Pause", null);
    playerToggle.setOnClickListener(v -> Native.send(playing ? "listenpause" : "listenplay"));
    playerButton("\u23ED\uFE0E", "Next", "listennext");
    TextView stop = playerButton("\u2715", "Stop Listening", null);
    stop.setOnClickListener(v -> {
      if (voice != null) voice.stop();
      sound.stop();
      player.setVisibility(View.GONE);
      Session.hide(this);
      Native.send("listenstop");
    });
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

  private TextView playerButton(String text, String label, String line) {
    TextView b = new TextView(this);
    b.setText(text);
    b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
    b.setPadding(dp(12), dp(8), dp(12), dp(8));
    b.setContentDescription(label);
    if (line != null) b.setOnClickListener(v -> Native.send(line));
    player.addView(b);
    return b;
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
      "plans/mcheyne.txt", "plans/chrono.txt", "audio/souer.tim", "audio/hays.tim",
      "audio/gilbert.tim", "audio/henson.tim", "audio/henson.paths"};

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
    new File(dir, "audio").mkdirs();
    new File(dir, "http").mkdirs();
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

  // (Core's host: where the app's files are, then where the site's Worker
  // is, for the ESV; then the app begun.)
  private void begin(File dir) {
    Native.send("files " + dir.getAbsolutePath());
    Native.start();
    Native.send("api https://smoothbible.com/api/v1/");
    watchNetwork();
    if (Native.ready) ready();
  }

  // The network's kind, said to core's host as it changes (core/held.l8's
  // NET_: 0 none, 1 not metered, 2 metered).
  private int networkSaid = -1;

  private void watchNetwork() {
    android.net.ConnectivityManager cm = getSystemService(android.net.ConnectivityManager.class);
    if (cm == null) return;
    try {
      cm.registerDefaultNetworkCallback(new android.net.ConnectivityManager.NetworkCallback() {
        @Override
        public void onCapabilitiesChanged(android.net.Network n, android.net.NetworkCapabilities c) {
          networkIs(c.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_METERED) ? 1 : 2);
        }

        @Override
        public void onLost(android.net.Network n) {
          networkIs(0);
        }
      }, new android.os.Handler(android.os.Looper.getMainLooper()));
    } catch (RuntimeException e) {
      // (No callback: the host takes the network as not metered.)
    }
  }

  private void networkIs(int kind) {
    if (kind == networkSaid) return;
    networkSaid = kind;
    Native.send("network " + kind);
  }

  // Where an address core says to play is: kept:NAME (a chapter core
  // holds) its kept file's path, or "" if it is gone (the player fails, and
  // core plays it from online); else the address itself.
  private String playable(String url) {
    if (!url.startsWith("kept:")) return url;
    File f = new File(getFilesDir(), url.substring(5));
    return f.exists() ? f.getAbsolutePath() : "";
  }

  // A recording fetched into a kept file (core's HostIO.fetch): into
  // http/fetch-ID.part, renamed to its kept name once the answer is 200;
  // how much has come said every quarter megabyte.
  private void fetchGet(int id, String url, String name) {
    File part = new File(getFilesDir(), "http/fetch-" + id + ".part");
    File kept = new File(getFilesDir(), name);
    new Thread(() -> {
      int status = 0;
      long size = 0;
      try {
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
        c.setRequestProperty("X-Smooth-Bible", "android (1)");
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        status = c.getResponseCode();
        long total = c.getContentLengthLong();
        if (status == 200) {
          try (InputStream in = c.getInputStream(); OutputStream o = new FileOutputStream(part)) {
            byte[] b = new byte[65536];
            long told = 0;
            for (int k; (k = in.read(b)) > 0; ) {
              o.write(b, 0, k);
              size += k;
              if (size - told >= 262144) {
                told = size;
                Native.send("fetching " + id + " " + size + " " + Math.max(total, 0));
              }
            }
          }
          if (size <= 0 || !part.renameTo(kept)) size = 0;
        }
        c.disconnect();
      } catch (Exception e) {
        status = 0;
        size = 0;
      }
      if (size == 0) part.delete();
      Native.send("fetched " + id + " " + status + " " + size);
    }).start();
  }

  // Core's host ready (the reader's version and what is kept read): the
  // app begun, and a reminder that opened it told.
  private boolean begun;

  private void ready() {
    if (begun) return;
    begun = true;
    // (The voice made now, so core knows the device's voices: Voice's.)
    if (voice == null) voice = new Voice(this);
    android.util.DisplayMetrics m = getResources().getDisplayMetrics();
    Native.send("start " + (int) (m.widthPixels / m.density) + " " + (int) (m.heightPixels / m.density)
        + " " + (int) (m.density * 100) + " " + (systemDark() ? 1 : 0) + " "
        + java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 1000);
    reminded(getIntent());
  }

  // A reminder opened (its extras): core told, once it has begun.
  private void reminded(android.content.Intent in) {
    if (!begun || in == null || !in.hasExtra("remindedPlan")) return;
    Native.send("reminded " + in.getIntExtra("remindedPlan", 0) + " " + in.getIntExtra("remindedMemory", 0));
    in.removeExtra("remindedPlan");
  }

  @Override
  protected void onNewIntent(android.content.Intent in) {
    super.onNewIntent(in);
    setIntent(in);
    reminded(in);
  }

  // ---- what only the platform does (SKINS.md, the contract) ----
  // A GET for core's host: its body to the files' http/ID, then told.
  private void httpGet(int id, String url) {
    File out = new File(getFilesDir(), "http/" + id);
    new Thread(() -> {
      int status = 0;
      long size = 0;
      try {
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
        c.setRequestProperty("X-Smooth-Bible", "android (1)");
        c.setConnectTimeout(12000);
        c.setReadTimeout(12000);
        status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        try (OutputStream o = new FileOutputStream(out)) {
          if (in != null) {
            byte[] b = new byte[65536];
            for (int k; (k = in.read(b)) > 0; ) {
              o.write(b, 0, k);
              size += k;
            }
            in.close();
          }
        }
        c.disconnect();
      } catch (Exception e) {
        status = 0;
        size = 0;
      }
      Native.send("http " + id + " " + status + " " + size);
    }).start();
  }

  // Notifications asked for (a reminder's switch): the answer core's.
  private int notifyWho;

  private void notifyAsk(int who) {
    android.app.NotificationManager nm = getSystemService(android.app.NotificationManager.class);
    if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(
        android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      notifyWho = who;
      requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, 7);
      return;
    }
    Native.send("notifyok " + who + " " + (nm.areNotificationsEnabled() ? 1 : 0));
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
    if (code != 7) return;
    boolean ok = results.length > 0 && results[0] == android.content.pm.PackageManager.PERMISSION_GRANTED;
    Native.send("notifyok " + notifyWho + " " + (ok ? 1 : 0));
  }

  // Share as Image: the card drawn last, as a PNG, to the share sheet.
  private void shareCard() {
    if (card == null) return;
    android.graphics.Bitmap b = Card.draw(card, look.face());
    if (b == null) return;
    String name = (card.title + " " + card.suffix.trim()).replaceAll("[:/\\\\]", "_").trim() + ".png";
    File f = new File(Shared.dir(this), name);
    try (OutputStream o = new FileOutputStream(f)) {
      b.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, o);
    } catch (java.io.IOException e) {
      return;
    }
    android.net.Uri u = Shared.uri(name);
    android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_SEND);
    i.setType("image/png");
    i.putExtra(android.content.Intent.EXTRA_STREAM, u);
    i.setClipData(android.content.ClipData.newRawUri(name, u));
    i.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
    startActivity(android.content.Intent.createChooser(i, null));
  }

  // A file to save (the Library's export): where, the person's choice.
  private void saveFile(String name, String words) {
    saving = words;
    android.content.Intent i = new android.content.Intent(android.content.Intent.ACTION_CREATE_DOCUMENT);
    i.addCategory(android.content.Intent.CATEGORY_OPENABLE);
    // (Its type by its name's ending, so the name is kept as it is.)
    i.setType(name.endsWith(".md") ? "text/markdown" : "text/plain");
    i.putExtra(android.content.Intent.EXTRA_TITLE, name);
    try {
      startActivityForResult(i, 8);
    } catch (RuntimeException e) {
      saving = null;
    }
  }

  @Override
  protected void onActivityResult(int code, int result, android.content.Intent data) {
    super.onActivityResult(code, result, data);
    if (code != 8 || saving == null) return;
    String words = saving;
    saving = null;
    if (result != RESULT_OK || data == null || data.getData() == null) return;
    try (OutputStream o = getContentResolver().openOutputStream(data.getData())) {
      o.write(words.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      android.widget.Toast.makeText(this, "Saved", android.widget.Toast.LENGTH_SHORT).show();
    } catch (Exception e) {
      android.widget.Toast.makeText(this, "Not saved", android.widget.Toast.LENGTH_SHORT).show();
    }
  }

  // The bar's title, the carried ribbon's glyph before it in its color.
  void showTitle() {
    if (carried.isEmpty()) {
      title.setText(titleWords);
      return;
    }
    android.text.SpannableString s = new android.text.SpannableString("\u258E " + titleWords);
    s.setSpan(new android.text.style.ForegroundColorSpan(Look.color(carried)), 0, 1,
        android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    title.setText(s);
  }

  private final android.os.Handler timers = new android.os.Handler(android.os.Looper.getMainLooper());

  boolean systemDark() {
    return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
        == Configuration.UI_MODE_NIGHT_YES;
  }

  @Override
  public void onConfigurationChanged(Configuration c) {
    super.onConfigurationChanged(c);
    Native.send("dark " + (systemDark() ? 1 : 0));
  }

  // A hardware keyboard's keys, to core (key NAME MODS: core/keys.l8 makes
  // them its commands). A field typed in keeps its own keys, but for ⌘'s.
  @Override
  public boolean dispatchKeyEvent(android.view.KeyEvent e) {
    if (e.getAction() == android.view.KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
      int mods = (e.isCtrlPressed() || e.isMetaPressed() ? 1 : 0) | (e.isShiftPressed() ? 2 : 0)
          | (e.isAltPressed() ? 4 : 0);
      String name = keyName(e);
      View f = getCurrentFocus();
      boolean typing = f instanceof android.widget.EditText && !panel.isKeyTrap(f);
      // (A screen that takes letters, Practice's: each one its action.)
      Screen top = panel.top();
      int ch = e.getUnicodeChar();
      if (top != null && top.keys > 0 && !typing && (mods & 1) == 0 && ch > 32) {
        Native.send("act " + top.id + " " + top.keys + " " + ch + " 0");
        return true;
      }
      if (name != null && ((mods & 1) != 0 || !typing)) {
        Native.send("key " + name + " " + mods);
        // (Space is core's page, not the list's too.)
        if (name.equals("space") && !typing) return true;
      }
    }
    return super.dispatchKeyEvent(e);
  }

  static String keyName(android.view.KeyEvent e) {
    switch (e.getKeyCode()) {
      case android.view.KeyEvent.KEYCODE_SPACE: return "space";
      case android.view.KeyEvent.KEYCODE_ENTER: return "return";
      case android.view.KeyEvent.KEYCODE_DPAD_LEFT: return "left";
      case android.view.KeyEvent.KEYCODE_DPAD_UP: return "up";
      case android.view.KeyEvent.KEYCODE_DPAD_DOWN: return "down";
      default: break;
    }
    int ch = e.getUnicodeChar(0);
    if (ch <= 32 || ch >= 127) return null;
    return String.valueOf((char) Character.toLowerCase(ch));
  }

  private final Runnable letScreenGo = () ->
      getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

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
      } else if (word.equals("row") && section != null) {
        Screen.Row r = Screen.row(w);
        section.rows.add(r);
        // (Share as Image's card: the one its Share Image shares.)
        if (r.custom == Panel.CUSTOM_CARD) card = r;
      } else if (word.equals("keys")) building.keys = w.num(1);
      else if (word.equals("cell") && section != null && !section.rows.isEmpty())
        section.rows.get(section.rows.size() - 1).cells.add(Screen.cell(w));
      else if (word.equals("empty")) {
        building.emptySymbol = w.field(1);
        building.emptyTitle = w.field(2);
        building.emptyLine = w.field(3);
      } else if (word.equals("focus")) {
        building.focus = w.num(1);
        building.focusSelect = w.num(2) == 1;
        // (Mode 4: the row's words FROM to TO, UTF-16, kept in sight.)
        if (w.num(2) == 4) {
          building.focusFrom = w.num(3);
          building.focusTo = w.num(4);
        }
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
      case "reveal":
        panel.reveal(w.num(1));
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
      case "selection":
        reader.selection(w.field(1));
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
      case "announce":
        getWindow().getDecorView().announceForAccessibility(w.field(1));
        break;
      case "felt":
        getWindow().getDecorView().performHapticFeedback(w.num(1) == 1
            ? android.view.HapticFeedbackConstants.LONG_PRESS
            : android.view.HapticFeedbackConstants.CLOCK_TICK);
        break;
      case "back": {
        // (back MS SCREENS WORDS HINT: the capsule, back to the place
        // left, for MS.)
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
        capsule.setContentDescription(words + ". " + w.field(2));
        capsule.postDelayed(capsuleAway, w.num(1));
        break;
      }
      case "place":
        // (The reader to a place: chapter, verse, how far into it.)
        panel.dismiss();
        reader.jump(w.num(1), w.num(2));
        break;
      case "say":
        if (voice == null) voice = new Voice(this);
        sound.stop();
        voice.say(w.num(1) + ":" + w.num(2), w.field(1), w.num(3) > 0 ? w.num(3) / 1000f : 1, w.field(2));
        break;
      case "player": {
        playerTitle.setText(w.field(1));
        playerState.setText(w.field(2));
        playing = !w.field(3).equals("0");
        playerToggle.setText(playing ? "\u23F8\uFE0E" : "\u25B6\uFE0E");
        playerToggle.setContentDescription(w.field(6));
        player.setBackgroundColor(look.bg);
        playerTitle.setTextColor(look.ink);
        playerState.setTextColor(look.faint);
        for (int i = 1; i < player.getChildCount(); i++) ((TextView) player.getChildAt(i)).setTextColor(look.accent);
        player.setElevation(dp(8));
        player.setVisibility(View.VISIBLE);
        Session.show(this, w.field(1), playing, w.field(4), w.field(5));
        break;
      }
      case "listen_stop":
        if (voice != null) voice.stop();
        sound.stop();
        player.setVisibility(View.GONE);
        Session.hide(this);
        break;
      case "audio_play":
        if (voice != null) voice.stop();
        sound.play(w.num(1), w.num(3), w.num(4), w.num(5) > 0 ? w.num(5) / 1000f : 1, playable(w.field(1)));
        break;
      case "audio_stop":
        sound.stop();
        break;
      case "speech_stop":
        if (voice != null) voice.stop();
        break;
      case "listen_pause":
        sound.pause();
        if (voice != null) voice.pause();
        break;
      case "listen_resume":
        sound.resume();
        if (voice != null) voice.resume();
        break;
      case "hearing":
        reader.hearing(w.num(1), w.num(2));
        break;
      case "timer": {
        // (Core's timer: told when it is up.)
        String tok = w.word(1);
        timers.postDelayed(() -> Native.send("timer " + tok), Math.max(0, w.num(2)));
        break;
      }
      case "http_get":
        httpGet(w.num(1), w.word(2));
        break;
      case "fetch_get":
        fetchGet(w.num(1), w.word(2), w.word(3));
        break;
      case "notify_ask":
        notifyAsk(w.num(1));
        break;
      case "notify_clear":
        Reminder.clear(this);
        break;
      case "notify":
        try {
          Reminder.add(this, Long.parseLong(w.word(1)), w.num(2), w.num(3), w.field(1), w.field(2));
        } catch (NumberFormatException e) {
          // (Not a time: none.)
        }
        break;
      case "open_settings":
        try {
          startActivity(new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
              .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()));
        } catch (RuntimeException e) {
          // (No such settings: nothing.)
        }
        break;
      case "share_image":
        shareCard();
        break;
      case "savefile":
        saveFile(w.field(1), w.field(2));
        break;
      case "ready":
        Native.ready = true;
        ready();
        break;
      case "carried":
        carried = w.word(1);
        showTitle();
        break;
      case "follow":
        reader.follow(w.num(1), w.num(2));
        break;
      case "next":
        // (A turn core asked for: its work goes on a step at a time, the
        // screen drawn between steps.)
        timers.post(() -> Native.send("next"));
        break;
      case "wake":
        try {
          reader.wake(Long.parseLong(w.word(1)));
        } catch (NumberFormatException e) {
          // (Not a time: no tick.)
        }
        break;
      case "reader":
        reader.setCount(w.num(1));
        break;
      case "jump":
        reader.jump(w.num(1), w.num(2));
        break;
      case "awake": {
        // (Keep Screen On: the screen kept on so long, or let go now.)
        View d = getWindow().getDecorView();
        d.removeCallbacks(letScreenGo);
        long ms = w.num(1);
        if (ms > 0) {
          getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
          d.postDelayed(letScreenGo, ms);
        } else letScreenGo.run();
        break;
      }
      case "page":
        reader.page(w.num(1) == 1 ? 1 : -1);
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
      case "highlights":
        look.readHighlights(w);
        break;
      case "credit":
        look.credits.put(w.num(1), w);
        break;
      case "accessory":
        look.accessories.put(w.word(1), w.field(1));
        break;
      case "look":
        look.read(w);
        restyle();
        break;
      case "title":
        titleWords = w.field(1);
        showTitle();
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
