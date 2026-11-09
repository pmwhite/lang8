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
// tells it what is done: the page (a Reader, pane 0) and its bar, the
// panel beside it (core's screens of group 1, a Panel, its reader pane 1),
// and core's sheet over them (a Panel of group 0).
public final class Bible extends Activity {
  final Look look = new Look();
  // The two panes: the page, and the panel's reader; and what moves them
  // together, linked.
  Reader reader, besideReader;
  Linking linking;
  // Every screen core has built, by id; the sheet's and the panel's.
  final java.util.HashMap<Integer, Screen> screens = new java.util.HashMap<>();
  Panel sheet, beside;
  // A document on its way to the page: its hairline along the bar's foot
  // (SKINS.md, Panes: Arriving).
  Hairline pageHairline;
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
  String carried = "", titleWords = "", versionWord = "";
  // The card Share as Image draws (core's CUSTOM_CARD row, its last).
  Screen.Row card;
  // What a reminder opened says, once core has begun (-1: none).
  int remindedPlan = -1, remindedMemory;
  // A file being saved (savefile: its words, until a place is chosen).
  String saving;
  FrameLayout root;
  LinearLayout bar;
  TextView title, settings, library, shelf;
  android.widget.ImageView search;
  // A screen or a part being said (between its first line and end): the
  // part's pane (null: one not shown), its chapter, index, count and words.
  Screen building;
  Screen.Section section;
  boolean gatheringPart;
  Reader partPane;
  int partC, partK, partN;
  String partText;
  final ArrayList<Wire> partLines = new ArrayList<>();
  // A chapter's link map being said (`link C MODE`, its `match` lines, to
  // `end`).
  boolean gatheringLink;

  // (The versions bundled, as assets, copied to the app's files once.)
  static final String[] VERSIONS = {"bsb.folio", "kjv.folio", "web.folio", "asv.folio", "ylt.folio",
      "orig.folio", "mhcc.folio"};

  @Override
  protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    requestWindowFeature(Window.FEATURE_NO_TITLE);
    Native.app = this;
    root = new FrameLayout(this);
    reader = new Reader(this, look, Reader.PAGE);
    root.addView(reader, new FrameLayout.LayoutParams(-1, -1));
    besideReader = new Reader(this, look, Reader.PANEL);
    linking = new Linking(reader, besideReader);
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
    settings = button("Aa", "settings");
    settings.setContentDescription("Settings");
    // (The Library: what is kept, Memory, and the languages.)
    library = button("☰", "library");
    library.setContentDescription("Library");
    // (The panel: what is read beside the page.)
    shelf = button("▤", "shelf");
    shelf.setContentDescription("Panel");
    search = new android.widget.ImageView(this);
    search.setImageResource(android.R.drawable.ic_menu_search);
    search.setPadding(dp(10), dp(10), dp(10), dp(10));
    search.setContentDescription("Search");
    search.setOnClickListener(v -> Native.send("tap search"));
    bar.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
    bar.addView(shelf);
    bar.addView(library);
    bar.addView(search, new LinearLayout.LayoutParams(dp(44), dp(44)));
    bar.addView(settings);
    root.addView(bar, new FrameLayout.LayoutParams(-1, dp(52), Gravity.TOP));
    pageHairline = new Hairline(this, look);
    FrameLayout.LayoutParams line = new FrameLayout.LayoutParams(-1, Math.max(1, dp(1)), Gravity.TOP);
    line.topMargin = dp(52) - Math.max(1, dp(1));
    root.addView(pageHairline, line);
    // (The panel beside the page: at its right after a rule, or under it
    // after a strip its grabber is in.)
    rule = new View(this);
    rule.setVisibility(View.GONE);
    root.addView(rule, new FrameLayout.LayoutParams(1, -1));
    strip = new FrameLayout(this);
    grabber = new View(this);
    strip.addView(grabber, new FrameLayout.LayoutParams(dp(36), dp(5), Gravity.CENTER));
    strip.setVisibility(View.GONE);
    strip.setOnTouchListener(this::stripTouched);
    strip.setContentDescription("Resize the panel");
    root.addView(strip, new FrameLayout.LayoutParams(-1, dp(STRIP_DP)));
    beside = new Panel(this, look, screens, Panel.BESIDE, besideReader);
    beside.setVisibility(View.GONE);
    root.addView(beside, new FrameLayout.LayoutParams(-1, -1));
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
    sheet = new Panel(this, look, screens, Panel.SHEET, null);
    root.addView(sheet, new FrameLayout.LayoutParams(-1, -1));
    setContentView(root);
    // (Edge to edge: the bar below the status bar, the reader's ends clear
    // of the system's bars.)
    root.setOnApplyWindowInsetsListener((v, insets) -> {
      android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars());
      barsTop = bars.top;
      barsBottom = bars.bottom;
      bar.setPadding(dp(16), bars.top, dp(8), 0);
      sheet.setPadding(0, bars.top, 0, bars.bottom);
      tray.setPadding(dp(16), dp(10), dp(16), dp(10) + bars.bottom);
      player.setPadding(dp(16), dp(8), dp(8), dp(8) + bars.bottom);
      arrange();
      return insets;
    });
    // (The page and the panel placed again as the window's size changes.)
    root.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> {
      if (r - l != or - ol || b - t != ob - ot) root.post(this::arrange);
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

  // ---- the panel beside the page (core/beside.l8) ----
  // Whether core wants it open, and filling the screen (`beside OPEN
  // FULL`); whether its screens were asked for (`panelmake`) and haven't
  // come yet; whether it is shown, as core was told (`panelvisible`).
  boolean besideOpen, besideFull, besideMaking, besideShown;
  // The rule at its left (at the page's right), the strip over it (under
  // the page) and the strip's grabber.
  View rule, grabber;
  FrameLayout strip;
  // The system's bars' heights (the app draws under them).
  int barsTop, barsBottom;
  // Its width at the page's right (dp), the least column (em) the page
  // keeps beside it there, and the strip's height (dp).
  static final int PANEL_DP = 390, STRIP_DP = 18;
  static final float PAGE_LEAST_EM = 24;
  // Under the page: its share of the window's height, as the grabber
  // leaves it; the least and most a drag leaves it, and below and above
  // what a drag let go closes it or fills the screen with it.
  float underShare = 0.5f;
  static final float SHARE_LEAST = 0.28f, SHARE_MOST = 0.86f, SHARE_GONE = 0.18f, SHARE_FULL = 0.92f;

  // Whether a window this wide has room for the panel at the page's right.
  private boolean fitsRight(int width) {
    float em = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, look.textSp(),
        getResources().getDisplayMetrics());
    return width >= dp(PANEL_DP) + 1 + 2 * dp(look.margin) + PAGE_LEAST_EM * em;
  }

  // The page and its bar, the panel and what is over them placed for the
  // window: the panel (open, its screens come) at the page's right where a
  // column fits, else under it; filling the screen, the page hidden under
  // it. Core told whether it shows.
  void arrange() {
    int w = root.getWidth(), h = root.getHeight();
    if (w <= 0 || h <= 0 || beside == null) return;
    boolean open = besideOpen && !beside.stack.isEmpty();
    boolean full = open && besideFull;
    boolean right = open && !full && fitsRight(w);
    boolean under = open && !full && !right;
    int panelW = dp(PANEL_DP), stripH = dp(STRIP_DP), underH = Math.round(underShare * h);
    int pageW = right ? w - panelW - 1 : w, pageH = under ? h - underH - stripH : h;
    int topLeft = Gravity.TOP | Gravity.START;
    place(reader, pageW, pageH, topLeft, 0, 0);
    place(bar, pageW, barsTop + dp(52), topLeft, 0, 0);
    reader.setInsets(barsTop + dp(52), under ? 0 : barsBottom);
    reader.setVisibility(full ? View.INVISIBLE : View.VISIBLE);
    bar.setVisibility(full ? View.INVISIBLE : View.VISIBLE);
    rule.setVisibility(right ? View.VISIBLE : View.GONE);
    if (right) place(rule, 1, h, Gravity.TOP | Gravity.END, panelW, 0);
    strip.setVisibility(under ? View.VISIBLE : View.GONE);
    if (under) place(strip, w, stripH, Gravity.BOTTOM, 0, underH);
    if (open) {
      if (full) place(beside, w, h, topLeft, 0, 0);
      else if (right) place(beside, panelW, h, Gravity.TOP | Gravity.END, 0, 0);
      else place(beside, w, underH, Gravity.BOTTOM, 0, 0);
      beside.setPadding(0, under ? 0 : barsTop, 0, barsBottom);
      beside.filling(full);
    }
    beside.setVisibility(open ? View.VISIBLE : View.GONE);
    FrameLayout.LayoutParams cp = (FrameLayout.LayoutParams) capsule.getLayoutParams();
    int capsuleBottom = dp(16) + (under ? underH + stripH : barsBottom);
    if (cp.bottomMargin != capsuleBottom) {
      cp.bottomMargin = capsuleBottom;
      capsule.setLayoutParams(cp);
    }
    if (open != besideShown) {
      besideShown = open;
      Native.send("panelvisible " + (open ? 1 : 0));
    }
    backChanged();
  }

  // View v's size, gravity and margins in the root, if they changed.
  private static void place(View v, int width, int height, int gravity, int endMargin, int bottomMargin) {
    FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) v.getLayoutParams();
    if (lp.width == width && lp.height == height && lp.gravity == gravity
        && lp.getMarginEnd() == endMargin && lp.bottomMargin == bottomMargin) return;
    lp.width = width;
    lp.height = height;
    lp.gravity = gravity;
    lp.setMarginEnd(endMargin);
    lp.bottomMargin = bottomMargin;
    v.setLayoutParams(lp);
  }

  // `beside OPEN FULL`: the panel's screens asked for as it opens, let go
  // as it closes (core has let them go), and laid out.
  private void besideLine(boolean open, boolean full) {
    besideOpen = open;
    besideFull = open && full;
    linking.filling(besideFull);
    if (!open) {
      beside.dismiss();
      besideMaking = false;
    } else if (beside.stack.isEmpty() && !besideMaking) {
      besideMaking = true;
      Native.send("panelmake");
    }
    arrange();
  }

  // The strip's grabber dragged: the panel under the page taller or
  // shorter; let go low, closed, or high, filling the screen (keeping its
  // height for the next time).
  private float stripFrom, stripDownY;

  private boolean stripTouched(View v, android.view.MotionEvent e) {
    float h = Math.max(1, root.getHeight());
    float share = stripFrom - (e.getRawY() - stripDownY) / h;
    switch (e.getActionMasked()) {
      case android.view.MotionEvent.ACTION_DOWN:
        stripDownY = e.getRawY();
        stripFrom = underShare;
        return true;
      case android.view.MotionEvent.ACTION_MOVE:
        underShare = Math.max(0.1f, Math.min(0.96f, share));
        arrange();
        return true;
      case android.view.MotionEvent.ACTION_UP:
      case android.view.MotionEvent.ACTION_CANCEL:
        if (share < SHARE_GONE || share > SHARE_FULL) {
          underShare = stripFrom;
          if (e.getActionMasked() == android.view.MotionEvent.ACTION_UP)
            Native.send(share < SHARE_GONE ? "tap shelf" : "tap full");
        } else underShare = Math.max(SHARE_LEAST, Math.min(SHARE_MOST, share));
        arrange();
        return true;
      default:
        return true;
    }
  }

  // (And the language data, the cross references, the commentary, the
  // Manual.)
  static final String[] DATA = {"xref_index.bin", "xrefs.bin", "help.txt",
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
    // (The panel beside the page always fits: at its right, or under it.)
    Native.send("panelfits 1");
    android.util.DisplayMetrics m = getResources().getDisplayMetrics();
    saidDark = systemDark();
    Native.send("start " + (int) (m.widthPixels / m.density) + " " + (int) (m.heightPixels / m.density)
        + " " + (int) (m.density * 100) + " " + (saidDark ? 1 : 0) + " "
        + java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 1000);
    // (The panes' lines to core from now on.)
    reader.begin();
    besideReader.begin();
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
  // The title: the ribbon carried (a strip of its color), the chapter, and
  // the version, faint and smaller, as the iPhone's title has it.
  void showTitle() {
    String lead = carried.isEmpty() ? "" : "\u258E ";
    String tail = versionWord.isEmpty() ? "" : "  " + versionWord;
    android.text.SpannableString s = new android.text.SpannableString(lead + titleWords + tail);
    if (!carried.isEmpty())
      s.setSpan(new android.text.style.ForegroundColorSpan(Look.color(carried)), 0, 1,
          android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    if (!tail.isEmpty()) {
      int from = s.length() - tail.length();
      s.setSpan(new android.text.style.ForegroundColorSpan(look.faint), from, s.length(),
          android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
      s.setSpan(new android.text.style.RelativeSizeSpan(0.75f), from, s.length(),
          android.text.Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
    title.setText(s);
    title.setContentDescription(versionWord.isEmpty() ? titleWords : titleWords + ", " + versionWord);
  }

  private final android.os.Handler timers = new android.os.Handler(android.os.Looper.getMainLooper());

  boolean systemDark() {
    return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
        == Configuration.UI_MODE_NIGHT_YES;
  }

  @Override
  public void onConfigurationChanged(Configuration c) {
    super.onConfigurationChanged(c);
    // (Said only as it changes: core lays both panes out again for it, and
    // a turn of the phone changes the configuration too.)
    boolean dark = systemDark();
    if (dark == saidDark) return;
    saidDark = dark;
    Native.send("dark " + (dark ? 1 : 0));
  }

  // The system's appearance as core was last told (at `start`, then here).
  private boolean saidDark;

  // A hardware keyboard's keys, to core (key NAME MODS: core/keys.l8 makes
  // them its commands). A field typed in keeps its own keys, but for ⌘'s.
  @Override
  public boolean dispatchKeyEvent(android.view.KeyEvent e) {
    if (e.getAction() == android.view.KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
      int mods = (e.isCtrlPressed() || e.isMetaPressed() ? 1 : 0) | (e.isShiftPressed() ? 2 : 0)
          | (e.isAltPressed() ? 4 : 0);
      String name = keyName(e);
      View f = getCurrentFocus();
      boolean typing = f instanceof android.widget.EditText && !sheet.isKeyTrap(f);
      // (A screen that takes letters, Practice's: each one its action.)
      Screen top = sheet.top();
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

  // Pane p (null: not one).
  private Reader pane(int p) {
    return p == Reader.PAGE ? reader : p == Reader.PANEL ? besideReader : null;
  }

  // Core's wake: a tick at its time (the skin's clock, ms).
  private final Runnable tick = () -> Native.send("tick " + Reader.now());

  private void wake(long at) {
    timers.removeCallbacks(tick);
    timers.postDelayed(tick, Math.max(50, at - Reader.now()));
  }

  private final Runnable letScreenGo = () ->
      getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

  @Override
  protected void onPause() {
    super.onPause();
    Native.send("away");
  }

  // Back closes the sheet's screens first, then puts the panel beside the
  // page again if it fills the screen, then goes back in the panel's (the
  // system's Back, with predictive back, asks a callback only while one is
  // registered: while there is one of these to do).
  private final android.window.OnBackInvokedCallback backCallback = this::backPressed;
  private boolean backRegistered;

  private void backPressed() {
    if (sheet.shown()) sheet.back();
    else if (besideShown && besideFull) Native.send("tap full");
    else if (besideShown && beside.stack.size() > 1) beside.back();
  }

  void backChanged() {
    if (sheet == null || beside == null) return;
    boolean wanted = sheet.shown() || besideShown && (besideFull || beside.stack.size() > 1);
    if (wanted == backRegistered) return;
    backRegistered = wanted;
    android.window.OnBackInvokedDispatcher d = getOnBackInvokedDispatcher();
    if (wanted) d.registerOnBackInvokedCallback(
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
    reader.restyle();
    rule.setBackgroundColor(Look.alpha(look.rule, 0.2f));
    strip.setBackgroundColor(Look.alpha(look.ink, 0.05f));
    android.graphics.drawable.GradientDrawable g = new android.graphics.drawable.GradientDrawable();
    g.setCornerRadius(dp(3));
    g.setColor(Look.alpha(look.ink, 0.25f));
    grabber.setBackground(g);
    bar.setBackgroundColor(look.bg);
    title.setTextColor(look.ink);
    showTitle();
    settings.setTextColor(look.accent);
    library.setTextColor(look.accent);
    shelf.setTextColor(look.accent);
    search.setColorFilter(look.accent);
    Window w = getWindow();
    w.setStatusBarColor(look.bg);
    w.setNavigationBarColor(look.bg);
    View d = w.getDecorView();
    int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
    d.setSystemUiVisibility(look.dark ? 0 : flags);
    sheet.restyle();
    beside.restyle();
  }

  // What core said: lines, each acted on, a screen's or a part's gathered
  // to its end first.
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
        building.heroLarge = w.fieldNum(6) == 1;
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
      else if (word.equals("reader")) {
        building.reader = true;
        building.readerLinked = w.num(1) == 1;
      }
      else if (word.equals("subtitle")) building.subtitle = w.field(1);
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
        screens.put(building.id, building);
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
    if (gatheringLink) {
      if (word.equals("end")) {
        linking.linkEnd();
        gatheringLink = false;
      } else if (word.equals("match")) linking.match(w.num(1), w.num(2), w.num(3));
      return;
    }
    if (gatheringPart) {
      if (word.equals("end")) {
        if (partPane != null) partPane.part(partC, partK, partN, partText, partLines);
        gatheringPart = false;
        partLines.clear();
      } else partLines.add(w);
      return;
    }
    switch (word) {
      case "screen":
        if (w.num(1) == 0 && menuWanted) titleMenuNext = true;
        building = new Screen();
        building.id = w.num(1);
        building.kind = w.num(2);
        building.arg = w.num(3);
        building.group = w.num(4);
        building.title = w.field(1);
        building.search = w.field(2);
        break;
      case "part":
        // (part P C K N, its words, then its lines to end: a pane's.)
        gatheringPart = true;
        partPane = pane(w.num(1));
        partC = w.num(2);
        partK = w.num(3);
        partN = w.num(4);
        partText = w.field(1);
        break;
      case "present":
        sheet.present(w.num(1));
        break;
      case "panel":
        // (The panel's first screen: its stack made again, and shown.)
        besideMaking = false;
        beside.present(w.num(1));
        arrange();
        break;
      case "push":
      case "present_over": {
        // (A screen of the panel's goes on its stack, whichever acted.)
        Screen s = screens.get(w.num(1));
        if (s != null && s.group == Panel.BESIDE) {
          beside.push(w.num(1));
          arrange();
        } else sheet.push(w.num(1));
        break;
      }
      case "update":
      case "refill":
        sheet.update(w.num(1));
        beside.update(w.num(1));
        break;
      case "reveal":
        sheet.reveal(w.num(1));
        beside.reveal(w.num(1));
        break;
      case "pop":
      case "close":
        sheet.back();
        break;
      case "pop_to":
        sheet.popTo(w.num(1));
        beside.popTo(w.num(1));
        break;
      case "beside":
        besideLine(w.num(1) == 1, w.num(2) == 1);
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
        sheet.retext(w.num(1));
        beside.retext(w.num(1));
        break;
      case "blur":
        sheet.blur();
        beside.blur();
        break;
      case "dismiss":
        sheet.dismiss();
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
        tray.show(screens.get(0));
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
        besideReader.reask(reader.selC);
        break;
      case "bookmarked":
        reader.reask(reader.selC);
        besideReader.reask(reader.selC);
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
          wake(Long.parseLong(w.word(1)));
        } catch (NumberFormatException e) {
          // (Not a time: no tick.)
        }
        break;
      case "reader":
        reader.setChapters(w.num(1));
        besideReader.setChapters(w.num(1));
        break;
      case "line": {
        Reader r = pane(w.num(1));
        if (r != null) r.setReadingLine(w.num(2));
        break;
      }
      case "go": {
        // (go P C I FRAC MODE)
        Reader r = pane(w.num(1));
        if (r != null) r.go(w.num(2), w.num(3), w.num(4), w.num(5));
        break;
      }
      case "link":
        // (link C MODE COMMENTS, its match lines, end: a chapter's link map.)
        linking.linkBegin(w.num(1), w.num(2), w.num(3));
        gatheringLink = true;
        break;
      case "halt": {
        Reader r = pane(w.num(1));
        if (r != null) r.halt();
        break;
      }
      case "arriving": {
        // (arriving P THOUSANDTHS: a document on its way to pane P.)
        Hairline h = w.num(1) == 0 ? pageHairline : w.num(1) == 1 ? beside.hairline : null;
        if (h != null) h.arriving(w.num(2));
        break;
      }
      case "arrived": {
        Hairline h = w.num(1) == 0 ? pageHairline : w.num(1) == 1 ? beside.hairline : null;
        if (h != null) h.arrived();
        break;
      }
      case "forget": {
        Reader r = pane(w.num(1));
        if (r != null) r.forget(w.num(2));
        linking.forgetMaps();
        break;
      }
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
        // (The sheets away; a jump of the page's follows, which puts the
        // carried ribbon down.)
        Native.send("jumped 0");
        sheet.dismiss();
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
        versionWord = w.field(1);
        showTitle();
        break;
      default:
        break;
    }
  }
}
