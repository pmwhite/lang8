package space.trailingwhite.smoothbible;

import android.os.Handler;
import android.os.Looper;
import java.nio.charset.StandardCharsets;

// Smooth Bible's L8 (libsmoothbible.so, see glue.c): lines to it, and what
// it says, which is acted on here, on the main thread (SKINS.md, the wire).
final class Native {
  static {
    System.loadLibrary("smoothbible");
  }

  private static native void push(byte[] line);

  static native void start();

  static void send(String line) {
    push(line.getBytes(StandardCharsets.UTF_8));
  }

  private static final Handler main = new Handler(Looper.getMainLooper());

  static Bible app;

  // (From L8's thread: lines, newline-ended.)
  static void said(byte[] lines) {
    String s = new String(lines, StandardCharsets.UTF_8);
    main.post(() -> {
      if (app != null) app.said(s);
    });
  }
}
