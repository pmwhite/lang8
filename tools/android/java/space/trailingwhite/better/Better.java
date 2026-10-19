package space.trailingwhite.better;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.BaseInputConnection;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.view.inputmethod.InputMethodManager;
import android.widget.FrameLayout;

// Better's one screen: a surface L8 draws on (see android.l8), taking a
// finger, and a view that is unseen but for the keyboard it brings up.
public final class Better extends Activity {
  private SurfaceView view;
  private Keys keys;
  private float density;

  @Override
  protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    App.activity = this;
    density = getResources().getDisplayMetrics().density;
    getWindow().setDecorFitsSystemWindows(false);
    getWindow().setStatusBarColor(Color.TRANSPARENT);
    getWindow().setNavigationBarColor(Color.TRANSPARENT);
    FrameLayout root = new FrameLayout(this);
    keys = new Keys(this);
    root.addView(keys, new FrameLayout.LayoutParams(1, 1));
    view = new SurfaceView(this);
    root.addView(view);
    setContentView(root);
    // (Its first lines: its scale, whether the phone is dark, its edges.)
    Native.push("says 5 " + Math.round(density * 500));
    dark(getResources().getConfiguration());
    view.getHolder().addCallback(new SurfaceHolder.Callback() {
      @Override
      public void surfaceCreated(SurfaceHolder h) {}

      @Override
      public void surfaceChanged(SurfaceHolder h, int format, int w, int ht) {
        Native.surface(h.getSurface());
      }

      @Override
      public void surfaceDestroyed(SurfaceHolder h) {
        Native.surface(null);
      }
    });
    view.setOnApplyWindowInsetsListener((v, insets) -> {
      android.graphics.Insets i = insets.getInsets(
          WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
      Native.push("says 1 " + Math.round(i.top / density));
      Native.push("says 2 " + Math.round(i.bottom / density));
      Native.push("says 3 " + Math.round(i.left / density));
      Native.push("says 4 " + Math.round(i.right / density));
      return insets;
    });
    view.setOnTouchListener((v, e) -> {
      int k = -1;
      switch (e.getActionMasked()) {
        case MotionEvent.ACTION_DOWN: k = 0; break;
        case MotionEvent.ACTION_MOVE: k = 1; break;
        case MotionEvent.ACTION_UP:
        case MotionEvent.ACTION_CANCEL: k = 2; break;
      }
      if (k >= 0) {
        Native.push("touch " + k + " " + Math.round(e.getX(0) * 100 / density) + " "
            + Math.round(e.getY(0) * 100 / density));
      }
      return true;
    });
    App.start(this);
    link(getIntent());
    // (For a test, adb shell am start ...: a made-up course K times as fast,
    // --ei sim K; another worker, --es api URL; a made-up account, --es
    // people demo.)
    int sim = getIntent().getIntExtra("sim", 0);
    if (sim > 0) Native.push("sim " + sim);
    String api = getIntent().getStringExtra("api");
    if (api != null) Native.push("api " + api);
    String people = getIntent().getStringExtra("people");
    if (people != null) Native.push("people " + people);
  }

  @Override
  protected void onNewIntent(Intent i) {
    super.onNewIntent(i);
    link(i);
  }

  // Opened with a link: better://link#c=CODE, or (from before codes) the
  // personal link, better://link#me=SECRET.
  private void link(Intent i) {
    Uri u = i == null ? null : i.getData();
    if (u != null && "better".equals(u.getScheme())) Native.push("link " + u.toString());
  }

  @Override
  protected void onResume() {
    super.onResume();
    App.activity = this;
    App.now();
    Native.push("shown");
    App.watch();
  }

  @Override
  protected void onPause() {
    super.onPause();
    Native.push("hidden");
  }

  @Override
  protected void onDestroy() {
    if (App.activity == this) App.activity = null;
    super.onDestroy();
  }

  @Override
  public void onConfigurationChanged(Configuration c) {
    super.onConfigurationChanged(c);
    dark(c);
  }

  private void dark(Configuration c) {
    boolean d = (c.uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    Native.push("says 12 " + (d ? 1 : 0));
  }

  @Override
  @SuppressWarnings("deprecation")
  public void onBackPressed() {
    Native.push("back");
  }

  // ---- what L8 says, for the screen ----
  void said(String[] w) {
    switch (w[0]) {
      case "L8BACK":
        moveTaskToBack(true);
        break;
      case "L8BARS": {
        int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
        getWindow().getInsetsController().setSystemBarsAppearance(
            w[1].equals("dark") ? light : 0, light);
        getWindow().getDecorView().setBackgroundColor(
            w[1].equals("dark") ? 0xfff4f4f1 : 0xff121317);
        break;
      }
      case "L8FIELDKIND":
        keys.kind(w[1]);
        break;
      case "L8KEYS": {
        InputMethodManager im = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (w[1].equals("1")) {
          keys.requestFocus();
          im.showSoftInput(keys, 0);
        } else {
          im.hideSoftInputFromWindow(keys.getWindowToken(), 0);
        }
        break;
      }
    }
  }

  void keepOn(boolean on) {
    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }

  // ---- sending ----
  // The chooser, with the text; once it is gone, L8 is told (says 13).
  void share(String text) {
    Intent send = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text);
    try {
      startActivityForResult(Intent.createChooser(send, null), SHARE);
    } catch (Exception e) {
      Native.push("says 13 0");
    }
  }

  private static final int SHARE = 13;

  @Override
  protected void onActivityResult(int code, int result, Intent data) {
    super.onActivityResult(code, result, data);
    if (code == SHARE) Native.push("says 13 1");
  }

  // ---- asking for the phone's location ----
  void askForLocation() {
    requestPermissions(new String[] {Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION}, 1);
  }

  // Recording: its notification may be shown (asked the first time; it
  // records either way).
  void askForNotes() {
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
        != android.content.pm.PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] {Manifest.permission.POST_NOTIFICATIONS}, 2);
    }
  }

  // After it was refused: asked again, or (when Android will not ask any
  // more) the app's settings opened.
  void askAgain() {
    if (App.allowed()) {
      App.watch();
    } else if (shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)) {
      askForLocation();
    } else {
      startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.fromParts("package", getPackageName(), null)));
    }
  }

  @Override
  public void onRequestPermissionsResult(int code, String[] names, int[] results) {
    // (Notes allowed while recording: its notification shown, as it was
    // not before.)
    if (code == 2) {
      if (App.recording) Recording.want(this, true);
      return;
    }
    if (App.allowed()) App.watch();
    else Native.push("gps denied");
  }

  // The keyboard's view: what is typed goes to L8 as it would from keys. Its
  // kind is the field's (L8FIELDKIND): a name of anything, a code
  // (capitals, no suggestions), or a person's name.
  static final class Keys extends View {
    private String kind = "plain";

    Keys(Context c) {
      super(c);
      setFocusable(true);
      setFocusableInTouchMode(true);
    }

    void kind(String k) {
      if (k.equals(kind)) return;
      kind = k;
      InputMethodManager im = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
      im.restartInput(this);
    }

    // Keys the keyboard passes on as they are (and a hardware keyboard's).
    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
      if (code == KeyEvent.KEYCODE_DEL) Native.push("key 65288");
      else if (code == KeyEvent.KEYCODE_ENTER) Native.push("key 65293");
      else {
        int c = e.getUnicodeChar();
        if (c < 32 || c >= 127) return super.onKeyDown(code, e);
        Native.push("type " + (char) c);
      }
      return true;
    }

    @Override
    public boolean onCheckIsTextEditor() {
      return true;
    }

    @Override
    public InputConnection onCreateInputConnection(EditorInfo info) {
      info.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS
          | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS;
      if (kind.equals("code")) {
        // (Keyboards suggest words anyway, except for what looks like a
        // password shown as it is typed; Better shows the code in
        // capitals whatever the keys are.)
        info.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
            | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS | InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD;
      } else if (kind.equals("name")) {
        info.inputType = InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_WORDS
            | InputType.TYPE_TEXT_VARIATION_PERSON_NAME;
      }
      info.imeOptions = EditorInfo.IME_ACTION_DONE | EditorInfo.IME_FLAG_NO_EXTRACT_UI;
      return new BaseInputConnection(this, false) {
        // (A word being written, as the keyboard has it so far: already
        // in Better's field, and replaced as it changes.)
        private String composing = "";

        private void replace(CharSequence text) {
          for (int i = 0; i < composing.length(); i++) Native.push("key 65288");
          if (text.length() > 0) Native.push("type " + text);
        }

        @Override
        public boolean setComposingText(CharSequence text, int cursor) {
          replace(text);
          composing = text.toString();
          return true;
        }

        @Override
        public boolean finishComposingText() {
          composing = "";
          return true;
        }

        @Override
        public boolean commitText(CharSequence text, int cursor) {
          replace(text);
          composing = "";
          return true;
        }

        @Override
        public boolean deleteSurroundingText(int before, int after) {
          composing = "";
          for (int i = 0; i < Math.max(before, 1); i++) Native.push("key 65288");
          return true;
        }

        // (Capitals for a code, as the keyboard asks where it is.)
        @Override
        public int getCursorCapsMode(int reqModes) {
          if (kind.equals("code")) return InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS;
          return super.getCursorCapsMode(reqModes);
        }

        @Override
        public boolean performEditorAction(int action) {
          Native.push("key 65293");
          return true;
        }

        @Override
        public boolean sendKeyEvent(KeyEvent e) {
          if (e.getAction() == KeyEvent.ACTION_DOWN) {
            if (e.getKeyCode() == KeyEvent.KEYCODE_DEL) Native.push("key 65288");
            else if (e.getKeyCode() == KeyEvent.KEYCODE_ENTER) Native.push("key 65293");
            else {
              int c = e.getUnicodeChar();
              if (c >= 32 && c < 127) Native.push("type " + (char) c);
            }
          }
          return true;
        }
      };
    }
  }
}
