package space.trailingwhite.better;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import java.util.TimeZone;

// What outlives the activity (which comes and goes): where the phone is
// being watched, and what L8 has said it wants.
final class App {
  static Context context;
  static Better activity;
  static boolean gpsWanted, recording;

  static void start(Context c) {
    if (context != null) return;
    context = c.getApplicationContext();
    Native.push("files " + context.getFilesDir().getAbsolutePath());
    now();
    Native.start();
  }

  static void now() {
    long ms = System.currentTimeMillis();
    Native.push("now " + ms + " " + TimeZone.getDefault().getOffset(ms) / 60000);
  }

  // What L8 says (see android.l8).
  static void said(String line) {
    String[] w = line.split(" ");
    switch (w[0]) {
      case "L8GPS":
        gpsWanted = w[1].equals("1");
        watch();
        break;
      case "L8GPSRETRY":
        if (activity != null) activity.askAgain();
        break;
      case "L8WAKE":
        recording = w[1].equals("1");
        if (activity != null) {
          activity.keepOn(recording);
          if (recording) activity.askForNotes();
        }
        Recording.want(context, recording);
        break;
      case "L8CUE":
        Chime.play(context, Integer.parseInt(w[1]));
        break;
      default:
        if (activity != null) activity.said(w);
    }
  }

  // ---- where the phone is ----
  // Each fix passed on only as how far it is east and north of the one
  // before (centimeters), and how much higher; only that one is held, and
  // it is dropped when the watching stops.
  private static Location prev;
  private static boolean watching;

  static boolean allowed() {
    return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
        == PackageManager.PERMISSION_GRANTED;
  }

  private static final LocationListener listener = new LocationListener() {
    @Override
    public void onLocationChanged(Location l) {
      fix(l);
    }

    @Override
    public void onProviderEnabled(String p) {}

    @Override
    public void onProviderDisabled(String p) {}

    @Override
    public void onStatusChanged(String p, int s, Bundle b) {}
  };

  static void watch() {
    LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
    boolean want = gpsWanted || recording;
    if (want && !watching) {
      if (!allowed()) {
        if (activity != null) activity.askForLocation();
        return;
      }
      if (lm == null || !lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        Native.push("gps none");
        return;
      }
      try {
        lm.requestLocationUpdates(
            LocationManager.GPS_PROVIDER, 1000, 0, listener, Looper.getMainLooper());
        watching = true;
        Native.push("gps on");
      } catch (SecurityException e) {
        Native.push("gps denied");
      }
    } else if (!want && watching) {
      lm.removeUpdates(listener);
      watching = false;
      prev = null;
    }
  }

  static void fix(Location l) {
    long dx = 0, dy = 0, dz = 0;
    if (prev != null) {
      double rad = Math.PI / 180, earth = 6371008.8;
      dy = Math.round((l.getLatitude() - prev.getLatitude()) * rad * earth * 100);
      dx = Math.round((l.getLongitude() - prev.getLongitude()) * rad * earth
          * Math.cos((l.getLatitude() + prev.getLatitude()) * 0.5 * rad) * 100);
    }
    long zacc = -1;
    if (l.hasAltitude() && Build.VERSION.SDK_INT >= 26 && l.hasVerticalAccuracy()) {
      zacc = Math.round(l.getVerticalAccuracyMeters() * 10);
      if (prev != null && prev.hasAltitude())
        dz = Math.round((l.getAltitude() - prev.getAltitude()) * 100);
    }
    long spd = l.hasSpeed() ? Math.round(l.getSpeed() * 100) : -1;
    prev = l;
    Native.push("fix " + l.getTime() + " " + dx + " " + dy + " "
        + Math.round(l.getAccuracy() * 10) + " " + spd + " " + dz + " " + zacc);
  }
}
