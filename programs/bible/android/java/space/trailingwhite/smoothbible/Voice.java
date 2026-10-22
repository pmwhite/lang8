package space.trailingwhite.smoothbible;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.ArrayList;
import java.util.Locale;

// Listen by the device's voice (SKINS.md): core's session says what to say
// (say C V RATE WORDS VOICE, an utterance each, the chapter's title as
// verse 0) and this says it, telling core as each begins (spoke C V MS)
// and ends (spoken C V). Core is told the device's voices as the engine
// knows them (voices Q:LANG:NAME ...). Paused, what was still to be said
// is kept and said again from its start on resuming.
final class Voice {
  private TextToSpeech tts;
  private boolean ready;
  // What is to be said, in order (id "C:V", words, rate, voice), the first
  // being said now.
  private final ArrayList<String[]> queue = new ArrayList<>();
  private boolean paused;

  Voice(Context c) {
    tts = new TextToSpeech(c, status -> {
      if (status != TextToSpeech.SUCCESS) return;
      tts.setLanguage(Locale.US);
      tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
        @Override
        public void onStart(String id) {
          Native.send("spoke " + id.replace(':', ' ') + " " + Reader.now());
        }

        @Override
        public void onDone(String id) {
          done(id);
        }

        @Override
        public void onError(String id) {
          done(id);
        }

        @Override
        public void onStop(String id, boolean interrupted) {
          // (Stopped, or paused: not done.)
        }
      });
      ready = true;
      tellVoices();
      if (!paused) for (String[] w : queue) speak(w);
    });
  }

  private void done(String id) {
    synchronized (queue) {
      if (!queue.isEmpty() && queue.get(0)[0].equals(id)) queue.remove(0);
    }
    Native.send("spoken " + id.replace(':', ' '));
  }

  // The device's voices, to core: quality 2 for the better ones, else 1;
  // those not installed left out.
  private void tellVoices() {
    StringBuilder b = new StringBuilder("voices");
    try {
      for (android.speech.tts.Voice v : tts.getVoices()) {
        if (v.getFeatures() != null && v.getFeatures().contains(
            TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)) continue;
        b.append('\t').append(v.getQuality() >= android.speech.tts.Voice.QUALITY_HIGH ? 2 : 1)
            .append(':').append(v.getLocale().toLanguageTag()).append(':')
            .append(v.getName().replace('\t', ' ').replace('\n', ' '));
      }
    } catch (RuntimeException e) {
      return;
    }
    Native.send(b.toString());
  }

  // Words to say, after those before; id "C:V".
  void say(String id, String words, float rate, String voice) {
    String[] w = {id, words, String.valueOf(rate), voice};
    synchronized (queue) {
      queue.add(w);
    }
    if (ready && !paused) speak(w);
  }

  private void speak(String[] w) {
    try {
      tts.setSpeechRate(Float.parseFloat(w[2]));
    } catch (NumberFormatException e) {
      tts.setSpeechRate(1);
    }
    if (!w[3].isEmpty()) {
      for (android.speech.tts.Voice v : tts.getVoices()) {
        if (v.getName().equals(w[3])) {
          tts.setVoice(v);
          break;
        }
      }
    }
    tts.speak(w[1], TextToSpeech.QUEUE_ADD, null, w[0]);
  }

  void pause() {
    paused = true;
    if (ready) tts.stop();
  }

  void resume() {
    if (!paused) return;
    paused = false;
    if (!ready) return;
    ArrayList<String[]> again;
    synchronized (queue) {
      again = new ArrayList<>(queue);
    }
    for (String[] w : again) speak(w);
  }

  void stop() {
    paused = false;
    synchronized (queue) {
      queue.clear();
    }
    if (ready) tts.stop();
  }
}
