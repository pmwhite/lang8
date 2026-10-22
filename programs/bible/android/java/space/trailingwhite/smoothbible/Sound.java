package space.trailingwhite.smoothbible;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.os.Handler;
import android.os.Looper;

// Listen's recordings (SKINS.md): core says what to play (audio_play TOK C
// FROM TO RATE URL: centiseconds, TO -1 the end) and this plays it, telling
// core where it is (audiotime TOK CS DURATION) and when it ends or can't
// (audioended TOK, audiofailed TOK). The token tells this play from those
// before it.
final class Sound {
  private MediaPlayer mp;
  private int tok, to = -1;
  private boolean paused;
  private final Handler main = new Handler(Looper.getMainLooper());
  private final Runnable tell = this::tell;

  void play(int tok, int from, int to, float rate, String url) {
    stop();
    this.tok = tok;
    this.to = to;
    paused = false;
    MediaPlayer m = new MediaPlayer();
    mp = m;
    m.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
    m.setOnPreparedListener(p -> {
      if (p != mp) return;
      if (from > 0) p.seekTo(from * 10);
      try {
        p.setPlaybackParams(new PlaybackParams().setSpeed(rate));
      } catch (RuntimeException e) {
        // (A speed it can't: as it is.)
      }
      if (!paused) p.start();
      main.removeCallbacks(tell);
      main.postDelayed(tell, 250);
    });
    m.setOnCompletionListener(p -> {
      if (p != mp) return;
      main.removeCallbacks(tell);
      Native.send("audioended " + this.tok);
    });
    m.setOnErrorListener((p, what, extra) -> {
      if (p == mp) failed();
      return true;
    });
    try {
      m.setDataSource(url);
      m.prepareAsync();
    } catch (Exception e) {
      failed();
    }
  }

  private void failed() {
    int t = tok;
    stop();
    Native.send("audiofailed " + t);
  }

  private void tell() {
    MediaPlayer m = mp;
    if (m == null) return;
    int t;
    try {
      t = m.getCurrentPosition() / 10;
    } catch (IllegalStateException e) {
      return;
    }
    if (to >= 0 && t >= to) {
      int k = tok;
      stop();
      Native.send("audioended " + k);
      return;
    }
    if (m.isPlaying()) Native.send("audiotime " + tok + " " + t + " " + m.getDuration() / 10);
    main.postDelayed(tell, 250);
  }

  void pause() {
    paused = true;
    try {
      if (mp != null && mp.isPlaying()) mp.pause();
    } catch (IllegalStateException e) {
      // (Not yet prepared: it waits.)
    }
  }

  void resume() {
    paused = false;
    try {
      if (mp != null && !mp.isPlaying()) mp.start();
    } catch (IllegalStateException e) {
      // (Not yet prepared: it starts once it is.)
    }
  }

  void stop() {
    main.removeCallbacks(tell);
    MediaPlayer m = mp;
    mp = null;
    if (m != null) {
      try {
        m.stop();
      } catch (IllegalStateException e) {
        // (Never started.)
      }
      m.release();
    }
  }
}
