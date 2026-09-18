// Diagnostic LD_PRELOAD helper: measures synchronized frame work, excluding swap.
// Exits the instrumented game after 80 warmup + 240 measured frames.
// MATERIAL_GL_CHECK=1 instead keeps running, checking GL errors at every swap.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <unistd.h>
static double stamp(void) {
    struct timespec t; clock_gettime(CLOCK_MONOTONIC, &t);
    return t.tv_sec * 1000.0 + t.tv_nsec / 1000000.0;
}
void glXSwapIntervalEXT(void *d, unsigned long w, int interval) {
    void (*real)(void *, unsigned long, int) = dlsym(RTLD_NEXT,"glXSwapIntervalEXT");
    real(d,w,0);
}
static int cmp(const void *a,const void *b) {
    double x=*(const double*)a,y=*(const double*)b; return (x>y)-(x<y);
}
void glXSwapBuffers(void *d,unsigned long w) {
    static void (*swap)(void*,unsigned long);
    static void (*finish)(void);
    static double last, samples[240];
    static int frame;
    if (!swap) { swap=dlsym(RTLD_NEXT,"glXSwapBuffers"); finish=dlsym(RTLD_NEXT,"glFinish"); }
    finish();
    unsigned (*geterror)(void) = dlsym(RTLD_NEXT,"glGetError");
    unsigned error = geterror();
    if (error) { fprintf(stderr,"FRAME_PROBE GL error 0x%x\n",error); _exit(2); }
    double done=stamp();
    if (frame>=80 && frame<320) samples[frame-80]=done-last;
    swap(d,w);
    last=stamp();
    if (++frame==320 && !getenv("MATERIAL_GL_CHECK")) {
        double sum=0; for(int i=0;i<240;i++) sum+=samples[i];
        qsort(samples,240,sizeof(double),cmp);
        fprintf(stderr,"FRAME_PROBE synchronized CPU+GPU work ms: mean %.3f median %.3f p95 %.3f max %.3f\n",
            sum/240,samples[120],samples[228],samples[239]);
        fflush(stderr); _exit(0);
    }
}
