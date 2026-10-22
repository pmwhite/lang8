// Smooth Bible's glue on Android (SKINS.md): between its Java (Native.java)
// and its L8 (android/main.l8), which runs on a thread of its own, as
// Better's does (tools/android/glue.c), without a window to draw on: the
// Java side draws, with Android's own views, what the L8 says.
//
// Java passes lines (Native.push, UTF-8 bytes); they wait here, under a
// lock, until L8's loop takes them (and_take, and_wait). L8 passes lines
// to Java (and_say: Native.said, UTF-8 bytes too, so that every character
// of the text crosses as it is).
#include <android/log.h>
#include <jni.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

extern void l8_android_main(char **envp);
extern char **environ;

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "smoothbible", __VA_ARGS__)

static JavaVM *vm;
static jclass native_class;
static jmethodID said_method;
static JNIEnv *l8_env;

static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t came = PTHREAD_COND_INITIALIZER;
static char *inbox;
static size_t in_n, in_cap;
static int started;

// (Under the lock.)
static void put(const char *s, size_t n) {
  if (in_n + n + 1 > in_cap) {
    in_cap = (in_n + n + 1) * 2;
    inbox = realloc(inbox, in_cap);
  }
  memcpy(inbox + in_n, s, n);
  in_n += n;
  inbox[in_n++] = '\n';
  pthread_cond_broadcast(&came);
}

JNIEXPORT void JNICALL Java_space_trailingwhite_smoothbible_Native_push(JNIEnv *env, jclass c,
                                                                        jbyteArray line) {
  jsize n = (*env)->GetArrayLength(env, line);
  char *s = malloc(n + 1);
  (*env)->GetByteArrayRegion(env, line, 0, n, (jbyte *)s);
  pthread_mutex_lock(&mu);
  put(s, n);
  pthread_mutex_unlock(&mu);
  free(s);
}

static void *run(void *arg) {
  (*vm)->AttachCurrentThread(vm, &l8_env, 0);
  LOG("starting L8");
  l8_android_main(environ);
  LOG("L8 returned");
  (*vm)->DetachCurrentThread(vm);
  return 0;
}

// Start L8's thread, once (the lines Java has pushed first are its first).
JNIEXPORT void JNICALL Java_space_trailingwhite_smoothbible_Native_start(JNIEnv *env, jclass c) {
  pthread_mutex_lock(&mu);
  int was = started;
  started = 1;
  pthread_mutex_unlock(&mu);
  if (was) return;
  (*env)->GetJavaVM(env, &vm);
  native_class = (*env)->NewGlobalRef(env, c);
  said_method = (*env)->GetStaticMethodID(env, c, "said", "([B)V");
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, 64 << 20);
  pthread_t t;
  pthread_create(&t, &attr, run, 0);
}

// ---- what L8 calls ----
long and_wait(long ms) {
  pthread_mutex_lock(&mu);
  if (in_n == 0) {
    struct timespec until;
    clock_gettime(CLOCK_REALTIME, &until);
    until.tv_sec += ms / 1000;
    until.tv_nsec += (ms % 1000) * 1000000;
    if (until.tv_nsec >= 1000000000) {
      until.tv_sec++;
      until.tv_nsec -= 1000000000;
    }
    pthread_cond_timedwait(&came, &mu, &until);
  }
  pthread_mutex_unlock(&mu);
  return 0;
}

long and_take(char *buf, long cap) {
  pthread_mutex_lock(&mu);
  long n = 0;
  // (Whole lines only.)
  for (long i = 0; i < (long)in_n && i < cap; i++)
    if (inbox[i] == '\n') n = i + 1;
  memcpy(buf, inbox, n);
  memmove(inbox, inbox + n, in_n - n);
  in_n -= n;
  pthread_mutex_unlock(&mu);
  return n;
}

long and_say(const char *text, long n) {
  jbyteArray b = (*l8_env)->NewByteArray(l8_env, n);
  (*l8_env)->SetByteArrayRegion(l8_env, b, 0, n, (const jbyte *)text);
  (*l8_env)->CallStaticVoidMethod(l8_env, native_class, said_method, b);
  (*l8_env)->DeleteLocalRef(l8_env, b);
  return 0;
}

long and_log(const char *text, long n) {
  __android_log_print(ANDROID_LOG_INFO, "smoothbible", "%.*s", (int)n, text);
  return 0;
}

// (Bytes at..at+n of text: what the app said, sent without a copy.)
long and_say_at(const char *text, long at, long n) {
  return and_say(text + at, n);
}
