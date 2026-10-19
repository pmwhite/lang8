package space.trailingwhite.better;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.os.Handler;
import android.os.Looper;

// The goal's chimes (see pace.l8), made as the iPhone app makes them: soft
// struck notes, a sine with a little of its octave and twelfth that fade
// sooner. Faster: G up to C; ease off: C down to G; back on it: one
// quieter A. Other sound (music, a podcast) is ducked for the moment.
final class Chime {
  private static final int RATE = 22050;
  private static final Handler main = new Handler(Looper.getMainLooper());
  private static AudioTrack track;
  private static AudioFocusRequest focus;

  private static void note(float[] pcm, double f, double at, double loud) {
    int from = (int) (at * RATE);
    double[] k = {1, 2, 3}, a = {1, 0.3, 0.1}, fade = {0.16, 0.06, 0.04};
    for (int i = from; i < pcm.length; i++) {
      double t = (i - from) / (double) RATE;
      double env = Math.min(t / 0.008, 1) * loud;
      double v = 0;
      for (int p = 0; p < 3; p++)
        v += a[p] * Math.exp(-t / fade[p]) * Math.sin(2 * Math.PI * f * k[p] * t);
      pcm[i] += (float) (env * v);
    }
  }

  static void play(Context c, int k) {
    double secs = k == 3 ? 0.6 : 0.75;
    float[] pcm = new float[(int) (secs * RATE)];
    if (k == 1) {
      note(pcm, 783.99, 0, 0.32);
      note(pcm, 1046.5, 0.15, 0.32);
    } else if (k == 2) {
      note(pcm, 1046.5, 0, 0.32);
      note(pcm, 783.99, 0.15, 0.32);
    } else note(pcm, 880, 0, 0.22);
    short[] s = new short[pcm.length];
    for (int i = 0; i < pcm.length; i++) {
      double fadeOut = Math.min((pcm.length - i) / (0.02 * RATE), 1);
      s[i] = (short) Math.round(Math.max(-1, Math.min(1, pcm[i] * fadeOut)) * 32767);
    }
    AudioAttributes attrs = new AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build();
    AudioManager am = (AudioManager) c.getSystemService(Context.AUDIO_SERVICE);
    if (focus != null) am.abandonAudioFocusRequest(focus);
    focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attrs)
        .build();
    am.requestAudioFocus(focus);
    if (track != null) track.release();
    track = new AudioTrack.Builder()
        .setAudioAttributes(attrs)
        .setAudioFormat(new AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build())
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setBufferSizeInBytes(s.length * 2)
        .build();
    track.write(s, 0, s.length);
    track.play();
    AudioFocusRequest mine = focus;
    main.postDelayed(() -> {
      if (focus == mine) {
        am.abandonAudioFocusRequest(focus);
        focus = null;
      }
    }, (long) (secs * 1000) + 300);
  }
}
