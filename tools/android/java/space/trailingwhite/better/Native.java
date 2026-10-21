package space.trailingwhite.better;

import android.os.Handler;
import android.os.Looper;
import android.view.Surface;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

// Better's L8 (libbetter.so, see glue.c): lines to it, its window, and what
// it says, which is acted on here, on the main thread.
final class Native {
  static {
    System.loadLibrary("better");
  }

  static native void push(String line);

  static native void surface(Surface s);

  static native void start();

  static native void httpDone(int status, byte[] body);

  private static final Handler main = new Handler(Looper.getMainLooper());

  // (From L8's thread.)
  static void said(String line) {
    main.post(() -> App.said(line));
  }

  // A request to the worker, made on a thread of its own; its answer goes
  // back as a line (http STATUS) and its body.
  static void http(String method, String url, String auth, byte[] body) {
    new Thread(() -> {
      int status = 0;
      byte[] got = new byte[0];
      try {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setRequestMethod(method);
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestProperty("Authorization", auth);
        if (body != null) {
          c.setDoOutput(true);
          c.setRequestProperty("Content-Type", "application/json");
          try (OutputStream o = c.getOutputStream()) {
            o.write(body);
          }
        }
        status = c.getResponseCode();
        InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in != null) {
          ByteArrayOutputStream all = new ByteArrayOutputStream();
          byte[] b = new byte[16384];
          for (int k; (k = in.read(b)) > 0; ) all.write(b, 0, k);
          in.close();
          got = all.toByteArray();
        }
        c.disconnect();
      } catch (Exception e) {
        status = 0;
      }
      android.util.Log.i("better", "sync " + method + " answered " + status + ", " + got.length + " bytes");
      httpDone(status, got);
    }).start();
  }
}
