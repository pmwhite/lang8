// Frame-time telemetry for the block game, posted as JSON to /telemetry on
// the page's own server (web/serve.py), which appends it to a log. A server
// without the endpoint turns it off after the first post.
//
// Every few seconds it reports the frame rate and frame-time spread, and how
// a frame's time divides: inside GL calls, in the game's own code (the rest
// of its work), and outside the game (the browser, compositing, waiting for
// the next frame). With `probe`, it first runs each configuration in PROBE
// for a few seconds, at fixed render sizes and with some draws left out, so
// the differences show what each part costs on the device.

const REPORT_MS = 5000;
const SETTLE_MS = 1500;
const STEP_MS = 5000;

// The shadow map is framebuffer 44; programs 3 and 12 draw the world and the
// grass. These names follow the order the game creates GL objects in.
const PROBE = [
  { name: "full size", scale: 1, skip: [] },
  { name: "half size", scale: 0.5, skip: [] },
  { name: "quarter size", scale: 0.25, skip: [] },
  { name: "half, no shadow map", scale: 0.5, skip: ["fb44"] },
  { name: "half, no offscreen passes", scale: 0.5, skip: ["offscreen"] },
  { name: "half, no grass", scale: 0.5, skip: ["prog12"] },
  { name: "half, no world pass", scale: 0.5, skip: ["prog3"] },
  { name: "half, no draws", scale: 0.5, skip: ["all"] },
];

export function createTelemetry(platform, { probe = false, show = () => {} } = {}) {
  const session = Math.random().toString(36).slice(2, 10);
  let enabled = true;
  const post = (kind, data) => {
    if (!enabled) return;
    const body = JSON.stringify({ session, kind, t: Date.now(), ...data });
    fetch("/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
      .then((r) => {
        if (!r.ok) enabled = false;
      })
      .catch(() => (enabled = false));
  };

  post("info", {
    url: location.href,
    ua: navigator.userAgent,
    dpr: devicePixelRatio,
    screen: [screen.width, screen.height],
    viewport: [innerWidth, innerHeight],
    gl: platform.glInfo(),
  });

  // A measurement window: frame intervals, and work and GL time since it began.
  const begin = () => ({
    start: performance.now(),
    intervals: [],
    work: platform.workMs(),
    gl: platform.glTiming(),
  });
  const summary = (w) => {
    const n = w.intervals.length;
    if (n === 0) return null;
    const sorted = [...w.intervals].sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / n;
    const gl = platform.glTiming();
    const glMs = {};
    let glTotal = 0;
    let calls = 0;
    for (const key of Object.keys(gl.ms)) {
      const ms = (gl.ms[key] - (w.gl.ms[key] ?? 0)) / n;
      glTotal += ms;
      calls += (gl.calls[key] - (w.gl.calls[key] ?? 0)) / n;
      if (ms > 0.05) glMs[key] = +ms.toFixed(2);
    }
    const work = (platform.workMs() - w.work) / n;
    const round = (x) => +x.toFixed(2);
    return {
      frames: n,
      fps: round(1000 / mean),
      interval: { mean: round(mean), p50: round(sorted[Math.floor(n / 2)]), p95: round(sorted[Math.floor(n * 0.95)]), max: round(sorted[n - 1]) },
      // Per frame: the game's work, split into GL calls and its own code,
      // and the rest of the frame interval.
      work: round(work),
      gl: round(glTotal),
      code: round(work - glTotal),
      outside: round(mean - work),
      calls: Math.round(calls),
      topGl: Object.fromEntries(Object.entries(glMs).sort((a, b) => b[1] - a[1]).slice(0, 8)),
      scale: platform.scale(),
      canvas: platform.canvasSize(),
      window: platform.windowSize(),
      heapMB: round(platform.heapBytes() / 1048576),
      hidden: document.hidden,
    };
  };

  let window_ = begin();
  let last = 0;
  let step = probe ? 0 : -1;
  let stepStart = 0;
  const results = [];
  if (probe) {
    platform.setScale(PROBE[0].scale);
    platform.setSkip(PROBE[0].skip);
  }

  // Called once per game frame.
  return {
    probing: () => step >= 0,
    frame(now) {
      if (last) window_.intervals.push(now - last);
      last = now;
      if (step >= 0) {
        if (!stepStart) stepStart = now;
        const elapsed = now - stepStart;
        const p = PROBE[step];
        show(`Measuring ${step + 1}/${PROBE.length}: ${p.name}`);
        if (elapsed < SETTLE_MS) {
          window_ = begin();
          return;
        }
        if (elapsed < STEP_MS) return;
        results.push({ name: p.name, ...summary(window_) });
        step++;
        stepStart = now;
        if (step < PROBE.length) {
          platform.setScale(PROBE[step].scale);
          platform.setSkip(PROBE[step].skip);
        } else {
          step = -1;
          platform.setSkip([]);
          platform.setScale(1);
          post("probe", { results });
          show(null);
        }
        window_ = begin();
        return;
      }
      if (now - window_.start >= REPORT_MS) {
        const s = summary(window_);
        if (s) post("frames", s);
        window_ = begin();
      }
    },
  };
}
