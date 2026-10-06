// Frame-time telemetry for the block game, posted as JSON to /telemetry on
// the page's own server (web/serve.py), which appends it to a log. A server
// without the endpoint turns it off after the first post.
//
// Every few seconds it reports the frame rate and frame-time spread, and how
// a frame's time divides: inside GL calls, in the game's own code (the rest
// of its work), and outside the game (the browser, compositing, waiting for
// the next frame). With `probe`, it first runs each configuration in PROBE
// for a few seconds: fixed render sizes, the frame-time view open, the player
// walking, and some draws left out, so the differences show what each part
// costs on the device. The page starts a probe from the original world and
// does not save it, so the walking changes nothing.

const REPORT_MS = 5000;
const SETTLE_MS = 1500;
const STEP_MS = 5000;

// The shadow map is framebuffer 44; programs 3 and 12 draw the world and the
// grass. These names follow the order the game creates GL objects in.
const PROBE = [
  { name: "full size", scale: 1, skip: [] },
  { name: "half size", scale: 0.5, skip: [] },
  { name: "full, frame-time view", scale: 1, skip: [], view: true },
  { name: "full, walking", scale: 1, skip: [], walk: true },
  { name: "half, walking", scale: 0.5, skip: [], walk: true },
  { name: "full, walking, frame-time view", scale: 1, skip: [], walk: true, view: true },
  { name: "half, walking, no draws", scale: 0.5, skip: ["all"], walk: true },
  { name: "half, no shadow map", scale: 0.5, skip: ["fb44"] },
  { name: "half, no grass", scale: 0.5, skip: ["prog12"] },
  { name: "half, no draws", scale: 0.5, skip: ["all"] },
];

const F3 = 65472;
// Walking holds each arrow in turn, long enough for the game's key repeat:
// right, left, down, up, so the player ends near where it started.
const WALK = [65363, 65361, 65364, 65362];
const WALK_HOLD_MS = 900;

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
    presses: platform.keyPresses(),
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
    // Milliseconds per frame in each part the game marks (code and GL).
    const phases = {};
    for (const key of Object.keys(gl.phases)) {
      const ms = (gl.phases[key] - (w.gl.phases[key] ?? 0)) / n;
      if (ms > 0.01) phases[key] = +ms.toFixed(2);
    }
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
      phases,
      topGl: Object.fromEntries(Object.entries(glMs).sort((a, b) => b[1] - a[1]).slice(0, 8)),
      scale: platform.scale(),
      canvas: platform.canvasSize(),
      window: platform.windowSize(),
      heapMB: round(platform.heapBytes() / 1048576),
      hidden: document.hidden,
      // Key presses in the window (walking), and the frame-time view.
      presses: platform.keyPresses() - w.presses,
      frameView: platform.frameView(),
    };
  };

  let window_ = begin();
  let last = 0;
  let step = probe ? 0 : -1;
  let stepStart = 0;
  const results = [];
  // The arrow held while walking, and since when.
  let held = 0;
  let heldSince = 0;
  let walkIndex = 0;
  const release = () => {
    if (held) platform.key(3, held);
    held = 0;
  };
  const setView = (on) => {
    if (platform.frameView() !== on) {
      platform.key(2, F3);
      platform.key(3, F3);
    }
  };
  const configure = (p) => {
    platform.setScale(p.scale);
    platform.setSkip(p.skip);
    setView(!!p.view);
    if (!p.walk) release();
  };
  const walk = (now) => {
    if (held && now - heldSince < WALK_HOLD_MS) return;
    release();
    held = WALK[walkIndex++ % WALK.length];
    heldSince = now;
    platform.key(2, held);
  };
  if (probe) configure(PROBE[0]);

  // Frames slower than SLOW_MS, with their parts' milliseconds, sent with
  // the next report: what an average hides.
  const SLOW_MS = 22;
  let slow = [];
  let lastPhases = {};
  let lastWork = platform.workMs();
  let lastPresses = platform.keyPresses();
  const frameParts = (interval) => {
    const totals = platform.phaseTotals();
    const work = platform.workMs();
    if (interval > SLOW_MS && slow.length < 20) {
      const parts = {};
      for (const key of Object.keys(totals)) {
        const ms = totals[key] - (lastPhases[key] ?? 0);
        if (ms > 0.3) parts[key] = +ms.toFixed(1);
      }
      slow.push({ interval: +interval.toFixed(1), work: +(work - lastWork).toFixed(1), keys: platform.keyPresses() - lastPresses, parts });
    }
    lastPhases = { ...totals };
    lastWork = work;
    lastPresses = platform.keyPresses();
  };
  const takeSlow = () => {
    const s = slow.sort((a, b) => b.interval - a.interval).slice(0, 10);
    slow = [];
    return s;
  };

  return {
    session,
    post,
    probing: () => step >= 0,
    // Post a frame report for the frames since the last one, and return it.
    reportNow() {
      const s = summary(window_);
      if (s) s.slow = takeSlow();
      if (s) post("frames", s);
      window_ = begin();
      return s;
    },
    // Called once per game frame.
    frame(now) {
      if (last) {
        window_.intervals.push(now - last);
        frameParts(now - last);
      }
      last = now;
      if (step >= 0) {
        if (!stepStart) stepStart = now;
        const elapsed = now - stepStart;
        const p = PROBE[step];
        show(`Measuring ${step + 1}/${PROBE.length}: ${p.name}`);
        if (p.walk) walk(now);
        if (elapsed < SETTLE_MS) {
          window_ = begin();
          return;
        }
        if (elapsed < STEP_MS) return;
        results.push({ name: p.name, ...summary(window_) });
        step++;
        stepStart = now;
        if (step < PROBE.length) configure(PROBE[step]);
        else {
          step = -1;
          configure({ scale: 1, skip: [] });
          post("probe", { results });
          show(null);
        }
        window_ = begin();
        return;
      }
      if (now - window_.start >= REPORT_MS) {
        const s = summary(window_);
        if (s) {
          s.slow = takeSlow();
          post("frames", s);
        }
        window_ = begin();
      }
    },
  };
}
