package space.trailingwhite.smoothbible;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import java.util.ArrayList;
import java.util.Locale;

// Listen by the device's voice (SKINS.md): core's session says what to say
// (say C V WORDS, an utterance each, the chapter's title as verse 0); this
// says it, and tells core as each begins (spoke C V) and ends (spoken C V).
final class Voice {
  private TextToSpeech tts;
  private boolean ready;
  // What core gave before the engine was ready: said once it is.
  private final ArrayList<String[]> waiting = new ArrayList<>();

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
          Native.send("spoken " + id.replace(':', ' '));
        }

        @Override
        public void onError(String id) {
          Native.send("spoken " + id.replace(':', ' '));
        }
      });
      ready = true;
      for (String[] w : waiting) say(w[0], w[1]);
      waiting.clear();
    });
  }

  // Words to say, queued after those before; id "C:V".
  void say(String id, String words) {
    if (!ready) {
      waiting.add(new String[] {id, words});
      return;
    }
    tts.speak(words, TextToSpeech.QUEUE_ADD, null, id);
  }

  void stop() {
    waiting.clear();
    if (ready) tts.stop();
  }
}
