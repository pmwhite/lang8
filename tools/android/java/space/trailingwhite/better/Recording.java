package space.trailingwhite.better;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.IBinder;

// While recording: a foreground service, so that Better keeps measuring
// with the screen off or another app in front (Android allows it location
// then, as the app was in front when it began). Its notification says so,
// and opens Better.
public final class Recording extends Service {
  static void want(Context c, boolean on) {
    Intent i = new Intent(c, Recording.class);
    if (on && App.allowed()) {
      try {
        c.startForegroundService(i);
      } catch (Exception e) {
        // (Not now: the app not in front. It is asked for again on the
        // next start.)
      }
    } else c.stopService(i);
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int id) {
    NotificationManager nm = getSystemService(NotificationManager.class);
    nm.createNotificationChannel(
        new NotificationChannel("recording", "Recording", NotificationManager.IMPORTANCE_LOW));
    PendingIntent open = PendingIntent.getActivity(this, 0,
        new Intent(this, Better.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_IMMUTABLE);
    Notification n = new Notification.Builder(this, "recording")
        .setContentTitle("Recording")
        .setContentText("Better is measuring your distance and speed")
        .setSmallIcon(R.drawable.note)
        .setOngoing(true)
        .setContentIntent(open)
        .build();
    startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
    App.watch();
    return START_NOT_STICKY;
  }

  @Override
  public IBinder onBind(Intent i) {
    return null;
  }
}
