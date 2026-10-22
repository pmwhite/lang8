package space.trailingwhite.smoothbible;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;

// Listen on the phone's own player (SKINS.md: core's player line, TITLE
// STATE PLAYING READER VERSION): a media session, which headsets' buttons
// and the system's controls use, and its notification while Listen plays;
// their play, pause, previous, next and stop are core's (listenplay ...).
public final class Session extends BroadcastReceiver {
  static final String CHANNEL = "listen";
  private static MediaSession session;

  private static PendingIntent button(Context c, String line, int i) {
    Intent in = new Intent(c, Session.class);
    in.putExtra("line", line);
    return PendingIntent.getBroadcast(c, 10 + i, in,
        PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  @Override
  public void onReceive(Context c, Intent in) {
    String line = in.getStringExtra("line");
    if (line != null) Native.send(line);
  }

  static void show(Context c, String title, boolean playing, String reader, String version) {
    if (session == null) {
      session = new MediaSession(c, "Smooth Bible");
      session.setCallback(new MediaSession.Callback() {
        @Override
        public void onPlay() {
          Native.send("listenplay");
        }

        @Override
        public void onPause() {
          Native.send("listenpause");
        }

        @Override
        public void onSkipToNext() {
          Native.send("listennext");
        }

        @Override
        public void onSkipToPrevious() {
          Native.send("listenprev");
        }

        @Override
        public void onStop() {
          Native.send("listenstop");
        }
      });
    }
    session.setMetadata(new MediaMetadata.Builder()
        .putString(MediaMetadata.METADATA_KEY_TITLE, title)
        .putString(MediaMetadata.METADATA_KEY_ARTIST, reader)
        .putString(MediaMetadata.METADATA_KEY_ALBUM, version)
        .build());
    session.setPlaybackState(new PlaybackState.Builder()
        .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE
            | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT
            | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
        .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
            PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1)
        .build());
    session.setActive(true);
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(
        new NotificationChannel(CHANNEL, "Listen", NotificationManager.IMPORTANCE_LOW));
    Intent open = new Intent(c, Bible.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    Notification n = new Notification.Builder(c, CHANNEL)
        .setSmallIcon(R.drawable.notify)
        .setContentTitle(title)
        .setContentText(reader + " · " + version)
        .setOngoing(playing)
        .setContentIntent(PendingIntent.getActivity(c, 2, open, PendingIntent.FLAG_IMMUTABLE))
        .addAction(new Notification.Action.Builder(null, "Previous", button(c, "listenprev", 0)).build())
        .addAction(new Notification.Action.Builder(null, playing ? "Pause" : "Play",
            button(c, playing ? "listenpause" : "listenplay", 1)).build())
        .addAction(new Notification.Action.Builder(null, "Next", button(c, "listennext", 2)).build())
        .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken())
            .setShowActionsInCompactView(0, 1, 2))
        .build();
    try {
      nm.notify(2, n);
    } catch (SecurityException e) {
      // (Notifications not allowed: the session alone.)
    }
  }

  static void hide(Context c) {
    if (session != null) {
      session.setActive(false);
      session.release();
      session = null;
    }
    c.getSystemService(NotificationManager.class).cancel(2);
  }
}
