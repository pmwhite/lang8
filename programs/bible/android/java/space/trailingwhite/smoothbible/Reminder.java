package space.trailingwhite.smoothbible;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

// Daily reminders (SKINS.md): core says each one (notify AT PLAN MEMORY
// TITLE BODY, AT seconds since 1970) after notify_clear; this sets an alarm
// for each, which shows it as a notification at its time; one opened opens
// the app, which tells core (reminded PLAN MEMORY). The alarms are set
// again each time the app begins (core says them again).
public final class Reminder extends BroadcastReceiver {
  static final String CHANNEL = "daily";

  private static PendingIntent alarm(Context c, int i, Intent extras) {
    Intent in = new Intent(c, Reminder.class);
    if (extras != null) in.putExtras(extras);
    return PendingIntent.getBroadcast(c, i, in,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  private static SharedPreferences kept(Context c) {
    return c.getSharedPreferences("reminders", Context.MODE_PRIVATE);
  }

  // Those set before, let go.
  static void clear(Context c) {
    AlarmManager am = c.getSystemService(AlarmManager.class);
    int n = kept(c).getInt("n", 0);
    for (int i = 0; i < n; i++) am.cancel(alarm(c, i, null));
    kept(c).edit().putInt("n", 0).apply();
  }

  static void add(Context c, long at, int plan, int memory, String title, String body) {
    if (at * 1000 < System.currentTimeMillis()) return;
    int i = kept(c).getInt("n", 0);
    Intent x = new Intent();
    x.putExtra("title", title);
    x.putExtra("body", body);
    x.putExtra("plan", plan);
    x.putExtra("memory", memory);
    AlarmManager am = c.getSystemService(AlarmManager.class);
    // (At its minute where the phone allows exact alarms; else within ten
    // minutes of it.)
    PendingIntent p = alarm(c, i, x);
    if (am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at * 1000, p);
    else am.setWindow(AlarmManager.RTC_WAKEUP, at * 1000, 10 * 60 * 1000, p);
    kept(c).edit().putInt("n", i + 1).apply();
  }

  static void channel(Context c) {
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(
        new NotificationChannel(CHANNEL, "Daily Reminder", NotificationManager.IMPORTANCE_DEFAULT));
  }

  @Override
  public void onReceive(Context c, Intent in) {
    channel(c);
    Intent open = new Intent(c, Bible.class);
    open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    open.putExtra("remindedPlan", in.getIntExtra("plan", 0));
    open.putExtra("remindedMemory", in.getIntExtra("memory", 0));
    PendingIntent tap = PendingIntent.getActivity(c, 1, open,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    String body = in.getStringExtra("body");
    Notification n = new Notification.Builder(c, CHANNEL)
        .setSmallIcon(R.drawable.notify)
        .setContentTitle(in.getStringExtra("title"))
        .setContentText(body)
        .setStyle(new Notification.BigTextStyle().bigText(body))
        .setContentIntent(tap)
        .setAutoCancel(true)
        .build();
    c.getSystemService(NotificationManager.class).notify(1, n);
  }
}
