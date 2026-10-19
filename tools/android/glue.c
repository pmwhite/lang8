// Better's glue on Android: between its Java (Native.java) and its L8
// (programs/better/android.l8), which runs on a thread of its own.
//
// Java passes lines (Native.push), its window (Native.surface) and the
// worker's answers (Native.httpDone); they wait here, under a lock, until
// L8's loop takes them (and_take, and_wait). L8 passes lines to Java
// (and_say: Native.said) and requests to the worker (and_http:
// Native.http). OpenGL ES 3 is set up here, on L8's thread: one context
// for the app's life, and a surface for each window it is given.
#include <EGL/egl.h>
#include <android/log.h>
#include <android/native_window_jni.h>
#include <jni.h>
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

extern void l8_android_main(char **envp);
extern char **environ;

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "better", __VA_ARGS__)

static JavaVM *vm;
static jclass native_class;
static jmethodID said_method, http_method;
static JNIEnv *l8_env;

static pthread_mutex_t mu = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t came = PTHREAD_COND_INITIALIZER;
static pthread_cond_t taken = PTHREAD_COND_INITIALIZER;
static char *inbox;
static size_t in_n, in_cap;
// The window given and not yet taken up (changed: one was given, or taken
// away).
static ANativeWindow *window_given;
static int window_changed;
static char *http_got;
static long http_got_n;
static int started;

static EGLDisplay display = EGL_NO_DISPLAY;
static EGLContext context = EGL_NO_CONTEXT;
static EGLConfig config;
static EGLSurface surface = EGL_NO_SURFACE;
static ANativeWindow *window;

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

JNIEXPORT void JNICALL Java_space_trailingwhite_better_Native_push(JNIEnv *env, jclass c,
                                                                   jstring line) {
  const char *s = (*env)->GetStringUTFChars(env, line, 0);
  pthread_mutex_lock(&mu);
  put(s, strlen(s));
  pthread_mutex_unlock(&mu);
  (*env)->ReleaseStringUTFChars(env, line, s);
}

// A window to draw on, or none (null): waits until L8's thread has let go
// of the one before, as a window taken away must be before this returns.
JNIEXPORT void JNICALL Java_space_trailingwhite_better_Native_surface(JNIEnv *env, jclass c,
                                                                      jobject s) {
  ANativeWindow *w = s ? ANativeWindow_fromSurface(env, s) : 0;
  pthread_mutex_lock(&mu);
  if (window_changed && window_given) ANativeWindow_release(window_given);
  window_given = w;
  window_changed = 1;
  pthread_cond_broadcast(&came);
  if (started) {
    struct timespec until;
    clock_gettime(CLOCK_REALTIME, &until);
    until.tv_sec += 2;
    while (window_changed && pthread_cond_timedwait(&taken, &mu, &until) == 0) {
    }
  }
  pthread_mutex_unlock(&mu);
}

JNIEXPORT void JNICALL Java_space_trailingwhite_better_Native_httpDone(JNIEnv *env, jclass c,
                                                                       jint status,
                                                                       jbyteArray body) {
  jsize n = body ? (*env)->GetArrayLength(env, body) : 0;
  pthread_mutex_lock(&mu);
  free(http_got);
  http_got = malloc(n + 1);
  if (n > 0) (*env)->GetByteArrayRegion(env, body, 0, n, (jbyte *)http_got);
  http_got_n = n;
  char line[32];
  int k = snprintf(line, sizeof line, "http %d", status);
  put(line, k);
  pthread_mutex_unlock(&mu);
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
JNIEXPORT void JNICALL Java_space_trailingwhite_better_Native_start(JNIEnv *env, jclass c) {
  pthread_mutex_lock(&mu);
  int was = started;
  started = 1;
  pthread_mutex_unlock(&mu);
  if (was) return;
  (*env)->GetJavaVM(env, &vm);
  native_class = (*env)->NewGlobalRef(env, c);
  said_method = (*env)->GetStaticMethodID(env, c, "said", "(Ljava/lang/String;)V");
  http_method = (*env)->GetStaticMethodID(
      env, c, "http", "(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;[B)V");
  pthread_attr_t attr;
  pthread_attr_init(&attr);
  pthread_attr_setstacksize(&attr, 64 << 20);
  pthread_t t;
  pthread_create(&t, &attr, run, 0);
}

// ---- what L8 calls ----
long and_wait(long ms) {
  pthread_mutex_lock(&mu);
  if (in_n == 0 && !window_changed) {
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
  char *s = malloc(n + 1);
  memcpy(s, text, n);
  s[n] = 0;
  jstring js = (*l8_env)->NewStringUTF(l8_env, s);
  (*l8_env)->CallStaticVoidMethod(l8_env, native_class, said_method, js);
  (*l8_env)->DeleteLocalRef(l8_env, js);
  free(s);
  return 0;
}

static int egl_start(void) {
  display = eglGetDisplay(EGL_DEFAULT_DISPLAY);
  if (!eglInitialize(display, 0, 0)) return 0;
  const EGLint want[] = {EGL_RENDERABLE_TYPE, 0x40 /* EGL_OPENGL_ES3_BIT */, EGL_SURFACE_TYPE,
                         EGL_WINDOW_BIT, EGL_RED_SIZE, 8, EGL_GREEN_SIZE, 8, EGL_BLUE_SIZE, 8,
                         EGL_ALPHA_SIZE, 8, EGL_DEPTH_SIZE, 0, EGL_NONE};
  EGLint n = 0;
  if (!eglChooseConfig(display, want, &config, 1, &n) || n < 1) return 0;
  const EGLint ver[] = {EGL_CONTEXT_CLIENT_VERSION, 3, EGL_NONE};
  context = eglCreateContext(display, config, EGL_NO_CONTEXT, ver);
  LOG("OpenGL ES context %p", context);
  return context != EGL_NO_CONTEXT;
}

// Whether there is a window to draw on: its surface current, its size.
long and_gl(int *size) {
  pthread_mutex_lock(&mu);
  if (window_changed) {
    if (surface != EGL_NO_SURFACE) {
      eglMakeCurrent(display, EGL_NO_SURFACE, EGL_NO_SURFACE, EGL_NO_CONTEXT);
      eglDestroySurface(display, surface);
      surface = EGL_NO_SURFACE;
    }
    if (window) ANativeWindow_release(window);
    window = window_given;
    window_given = 0;
    window_changed = 0;
    if (window) {
      if (context == EGL_NO_CONTEXT && !egl_start()) LOG("no OpenGL ES 3");
      if (context != EGL_NO_CONTEXT) {
        surface = eglCreateWindowSurface(display, config, window, 0);
        if (surface == EGL_NO_SURFACE || !eglMakeCurrent(display, surface, surface, context)) {
          LOG("no surface: %x", eglGetError());
          surface = EGL_NO_SURFACE;
        }
      }
    }
    pthread_cond_broadcast(&taken);
  }
  pthread_mutex_unlock(&mu);
  if (surface == EGL_NO_SURFACE) return 0;
  EGLint w = 0, h = 0;
  eglQuerySurface(display, surface, EGL_WIDTH, &w);
  eglQuerySurface(display, surface, EGL_HEIGHT, &h);
  size[0] = w;
  size[1] = h;
  return w > 0 && h > 0;
}

long and_swap(void) {
  if (surface != EGL_NO_SURFACE) eglSwapBuffers(display, surface);
  return 0;
}

// (An L8 str: its length is the word before it.)
static jstring java_str(const char *s, long n) {
  char *c = malloc(n + 1);
  memcpy(c, s, n);
  c[n] = 0;
  jstring j = (*l8_env)->NewStringUTF(l8_env, c);
  free(c);
  return j;
}

long and_http(const char *method, const char *url, long url_n, const char *auth, long auth_n,
              const char *body, long n) {
  jstring m = java_str(method, ((const long *)method)[-1]);
  jstring u = java_str(url, url_n);
  jstring a = java_str(auth, auth_n);
  jbyteArray b = 0;
  if (n > 0) {
    b = (*l8_env)->NewByteArray(l8_env, n);
    (*l8_env)->SetByteArrayRegion(l8_env, b, 0, n, (const jbyte *)body);
  }
  (*l8_env)->CallStaticVoidMethod(l8_env, native_class, http_method, m, u, a, b);
  (*l8_env)->DeleteLocalRef(l8_env, m);
  (*l8_env)->DeleteLocalRef(l8_env, u);
  (*l8_env)->DeleteLocalRef(l8_env, a);
  if (b) (*l8_env)->DeleteLocalRef(l8_env, b);
  return 0;
}

long and_http_body(char *buf, long cap) {
  pthread_mutex_lock(&mu);
  long n = http_got_n < cap ? http_got_n : cap;
  if (http_got) memcpy(buf, http_got, n);
  pthread_mutex_unlock(&mu);
  return n;
}
