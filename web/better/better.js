// Better (programs/better) on a canvas that fills the screen, on the block
// game's browser implementation of X11, GLX, and OpenGL
// (../game/platform.js). Better draws everything; the page starts it, passes
// it fingers, keys, the phone's safe edges and the time, watches where the
// phone is while it asks, keeps the screen on while it records, and keeps
// its log.
//
// Where the phone is: Better says L8GPS 1 while it wants to know (while
// recording, and on Record, ready to), and L8GPS 0 when not; L8GPSRETRY
// asks again after it was refused (`gps denied`). Each fix is passed on
// only as how far it is east and north of the one before, and how much
// higher, in centimeters, with how sure it is and the speed the phone
// measured: `fix T DX DY ACC SPEED DZ ZACC`. The fix before is the only
// position the page holds, in this closure, and it is dropped when Better
// stops asking; no position or height is passed on, written, or saved:
// what is kept is how far was gone, how fast, and how much it climbed and
// descended along the way. Lines for Better go in /inbox.txt (it reads and
// empties it when told, key 20).
//
// The log: Better writes /log.txt after each change, and /live.txt (a
// recording under way) every few seconds. Both are kept in this browser
// (IndexedDB, store.js), and, once signed in, the log is also kept by the
// log's worker (../better-log/worker.js), the same on every device signed
// in to the account and only there. Logs changed in two places are put
// together (each activity is kept once; one deleted in either stays
// deleted). A recording under way is kept in this browser only.
//
// Signing in: Better asks the worker itself (programs/better/people.l8),
// by way of this page: it says L8HTTP METHOD PATH with the body in
// /http.txt, and is told the answer's status (14) once it is in
// /http-answer.txt (with this device's token). A code signed in with gives
// a token, which Better passes on (L8ME TOKEN) to be kept here and the log
// kept with (L8ME -: forgotten, with the log); and whose account it is
// (L8ACCOUNT ID ADMIN NAME), kept here and said back to Better when it
// starts (account ...). A link with a code (#c=CODE) is taken out of the
// address at once and passed on (code CODE), for Better to look at and
// ask a tap to use; a personal link (#me=SECRET, from before codes) still
// signs in. Better says L8SHARE TEXT (\n a new line) to send something:
// the phone's share sheet, or the clipboard (13: 1 shared or closed, 2
// copied, 0 neither).
//
// Better is told how the log is kept (11): on this device only (0), saved
// (1), being saved (2), offline (3), or on this device only because its
// token is not one the worker knows (4, signed out elsewhere); that a newer
// log is in its file (10); whether the phone is set dark (12, and L8_DARK
// to begin with); and that the page is looked at again (15). Light or dark
// as picked on this device is kept here (L8_THEME to begin with; Better
// says L8THEME PICK light|dark when it changes).
//
// Each sport's goal pace and whether chimes are wanted are kept here too
// (Better says L8GOALS RUN RIDE WALK CUES when they change: mm a second,
// less than 0 when off; L8_GOAL_RUN and so on to begin with), and Better
// says L8CUE K for a chime to be played (1 faster, 2 ease off, 3 back on
// it: see chime below).
//
// The fields are drawn by Better, but a phone's keyboard comes up only
// for a real text field touched by a finger: so Better says where its field
// is and what is written in it (L8FIELD x0 y0 x1 y1 TEXT, in CSS pixels
// from the canvas's corner, or L8FIELD -), and what kind it is before
// (L8FIELDKIND code|name|plain), and an unseen <input> is laid over it.
// What is typed there goes to Better as keys; it says L8BLUR when it is
// done with it.
//
// ?fresh starts with an empty log (kept nowhere); ?api=URL uses another
// worker; ?sim=K records a made-up course K times as fast as the clock
// (no location asked for); ?people=demo (or many, alone, offline) makes up
// an account and friends, with no worker (nothing is kept or sent). Keys
// from the page are 1000000000 + 1000 * what + number (see page_says in
// app.l8).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";
import { kept, keptBefore } from "./store.js";

const LOG = "/log.txt";
const LIVE = "/live.txt";
const INBOX = "/inbox.txt";
const ASKED = "/http.txt";
const ANSWER = "/http-answer.txt";
const $ = (id) => document.getElementById(id);
const canvas = $("screen");
const input = $("type");
const show = (html) => {
  $("message").innerHTML = html;
  $("overlay").hidden = false;
};
const decoder = new TextDecoder();

for (const name of ["gesturestart", "gesturechange", "dblclick", "contextmenu"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (e.target !== input) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
const nowLine = () => `now ${Date.now()} ${-new Date().getTimezoneOffset()}`;

// What was kept before: in localStorage at first, then in IndexedDB, both
// under Tempo's name. Moved over, once.
async function moveOver() {
  if (localStorage.getItem("better:moved")) return;
  const keys = ["log", "live", "me", "rev", "dirty"];
  const before = await keptBefore("tempo", keys);
  for (const key of keys) {
    let v = before[key];
    const s = localStorage.getItem("tempo:" + key);
    if (v === undefined && s !== null) v = key === "rev" ? Number(s) : key === "dirty" ? s === "1" : s;
    if (v !== undefined && (await kept.get(key)) === undefined) await kept.set(key, v);
  }
  const theme = localStorage.getItem("tempo:theme");
  if (theme !== null && localStorage.getItem("better:theme") === null) localStorage.setItem("better:theme", theme);
  localStorage.setItem("better:moved", "1");
}

// A code in the address (#c=CODE): taken out of it at once, so that it is
// not left there or in the history.
function codeInLink() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const code = hash.get("c");
  if (code === null) return null;
  hash.delete("c");
  const rest = hash.toString();
  history.replaceState(null, "", location.pathname + location.search + (rest ? `#${rest}` : ""));
  return code.replace(/[^A-Za-z0-9]/g, "");
}

// Whose account it is, as Better is told it.
const accountLine = (a) => `account ${a?.id || "-"} ${a?.admin ? 1 : 0} ${a?.name || ""}`;

async function main() {
  const params = new URLSearchParams(location.search);
  const people = params.get("people") ?? params.get("L8_PEOPLE");
  const fresh = params.has("fresh");
  const sim = Number(params.get("sim") || 0);
  const code = codeInLink();
  const modulePromise = WebAssembly.compileStreaming(fetch("better.wasm"));
  // (A made-up account: nothing kept, or sent.)
  sync.fresh = fresh || people !== null;
  if (!fresh && people === null) await moveOver();
  const log = fresh ? "" : people !== null ? (await kept.get("log")) || "" : await startLog(params);
  const live = fresh ? "" : (await kept.get("live")) || "";
  const module = await modulePromise;
  let inbox = nowLine() + "\n";
  if (people !== null) inbox += `people ${people}\n`;
  else if (sync.secret) inbox += accountLine(await kept.get("account")) + "\n";
  if (code) inbox += `code ${code}\n`;
  const fs = new MemFS({ [LOG]: log, [LIVE]: live, [INBOX]: inbox });
  let platform = null;
  let pending = "";
  fs.onOutput = (_fd, data) => {
    pending += decoder.decode(data);
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      const [word, arg] = line.split(" ");
      if (word === "L8FIELD") placeField(line.split(" ").slice(1));
      else if (word === "L8FIELDKIND") fieldKind(arg);
      // (A made-up account asks nothing, and keeps nothing.)
      else if (word === "L8HTTP") people === null && ask(arg, line.split(" ")[2]);
      else if (word === "L8ME") people === null && signedIn(arg);
      else if (word === "L8ACCOUNT") people === null && keepAccount(line.split(" "));
      else if (word === "L8SHARE") share(line.slice(8).replace(/\\(n|\\)/g, (_, c) => (c === "n" ? "\n" : "\\")));
      else if (word === "L8BLUR") input.blur();
      else if (word === "L8GPSRETRY") gps.retry();
      else if (word === "L8GPS") gps.want(arg === "1" && !sim);
      else if (word === "L8WAKE") wake.want(arg === "1");
      else if (word === "L8THEME") look.set(arg, line.split(" ")[2] === "dark");
      else if (word === "L8GOALS") localStorage.setItem("better:goals", line.slice(8));
      else if (word === "L8CUE") chime(Number(arg));
      else console.log(line);
    }
  };
  const sys = fs.sys(["better", LOG, LIVE]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path === LOG) saved(decoder.decode(fs.readFile(LOG)));
    if (file?.writable && file.path === LIVE && !sync.fresh) {
      const text = decoder.decode(fs.readFile(LIVE));
      if (text) kept.set("live", text);
      else kept.remove("live");
    }
    return status;
  };
  const env = { L8_PAGE: "1", L8_THEME: localStorage.getItem("better:theme") || "0", L8_DARK: phoneDark.matches ? "1" : "0" };
  const goals = (localStorage.getItem("better:goals") || "").split(" ");
  if (goals.length === 4) {
    ["L8_GOAL_RUN", "L8_GOAL_RIDE", "L8_GOAL_WALK", "L8_CUES"].forEach((k, i) => (env[k] = goals[i]));
  }
  if (touch) env.L8_TOUCH = "1";
  if (sim > 0) env.L8_SIM = String(Math.round(sim));
  // (Kilometers, where miles are not what is used.)
  if (!/^en-(US|GB|LR|MM)/.test(navigator.language || "en-US")) env.L8_KM = "1";
  for (const [k, v] of params) if (k.startsWith("L8_")) env[k] = v;
  sys.env = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  platform = createPlatform(canvas, {
    log: (t) => console.warn(t),
    checkErrors: params.has("glcheck"),
    zoom: 0.85,
    env,
    pointers: true,
    wheel: true,
    maxTall: 2.4,
    maxPixels: 3.2e6,
  });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  const send = (what, n) => platform.key(2, 1000000000 + 1000 * what + Math.max(0, Math.min(999, Math.round(n))));
  // A line for Better: added to what it has not read yet.
  const post = (line) => {
    fs.writeFile(INBOX, decoder.decode(fs.readFile(INBOX)) + line + "\n");
    send(20, 0);
  };
  gps.post = post;
  sync.send = send;
  sync.post = post;
  if (people !== null) window.betterPost = post;
  // (Another link with a code, while open.)
  addEventListener("hashchange", () => {
    const more = codeInLink();
    if (more) post(`code ${more}`);
  });

  // Better's requests to the worker (see people.l8): the answer written for
  // it, and its status said (0: none came).
  async function ask(method, path) {
    let status = 0;
    let text = "";
    try {
      const body = method === "POST" ? decoder.decode(fs.readFile(ASKED)) : undefined;
      const r = await fetch(sync.api + path, {
        method,
        headers: { ...(sync.secret ? { authorization: `Bearer ${sync.secret}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
        body: body || undefined,
        signal: AbortSignal.timeout(15000),
      });
      status = r.status;
      text = await r.text();
      // (Not known any more: signed out elsewhere. What is here waits for
      // the next sign in.)
      if (status === 401 && !path.startsWith("/code/") && path !== "/signout") {
        sync.unknown = true;
        await kept.set("dirty", true);
        sync.set(4);
      }
    } catch (e) {
      console.warn(e);
    }
    fs.writeFile(ANSWER, text);
    send(14, status);
  }

  // The keyboard for the field Better is about to say is there.
  function fieldKind(kind) {
    const attrs = {
      code: { autocapitalize: "characters", autocomplete: "one-time-code" },
      name: { autocapitalize: "words", autocomplete: "off" },
      plain: { autocapitalize: "sentences", autocomplete: "off" },
    }[kind] ?? {};
    for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
    input.spellcheck = false;
  }

  // Sent: the share sheet, or (on a computer) the clipboard.
  async function share(text) {
    let how = 0;
    if (navigator.share && (!navigator.canShare || navigator.canShare({ text }))) {
      try {
        await navigator.share({ text });
        how = 1;
      } catch (e) {
        if (e.name === "AbortError") how = 1;
        else console.warn(e);
      }
    }
    if (how === 0) {
      try {
        await navigator.clipboard.writeText(text);
        how = 2;
      } catch (e) {
        // (An older way, where the clipboard is not allowed.)
        const t = document.createElement("textarea");
        t.value = text;
        document.body.append(t);
        t.select();
        if (document.execCommand("copy")) how = 2;
        t.remove();
        canvas.focus({ preventScroll: true });
      }
    }
    send(13, how);
  }
  sync.reload = (text) => {
    fs.writeFile(LOG, text);
    send(10, 0);
  };
  sync.tell();
  phoneDark.addEventListener("change", () => send(12, phoneDark.matches ? 1 : 0));

  // Better's pixels are the page's: how many window pixels to one, and the
  // phone's own edges (its notch, its home bar), measured each frame and
  // told when they change.
  let told = "";
  const sendSafe = () => {
    const s = getComputedStyle($("safe"));
    const width = canvas.getBoundingClientRect().width;
    if (!width) return;
    const k = Math.round((platform.windowSize()[0] / width) * 500);
    const edges = ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"].map((p) => Math.round(parseFloat(s[p]) || 0));
    const now = [k, ...edges].join(" ");
    if (now === told) return;
    told = now;
    send(5, k);
    edges.forEach((v, i) => send(1 + i, v));
  };
  const watch = () => {
    sendSafe();
    requestAnimationFrame(watch);
  };
  requestAnimationFrame(watch);
  sendSafe();
  send(20, 0);
  // (The time, now and then: a phone's clock may be set while it runs.
  // Not in a simulation, whose clock runs fast.)
  if (!sim) setInterval(() => post(nowLine()), 60000);

  // The name field: the unseen input over it, and what is typed in it.
  let fieldAt = null;
  let fieldText = "";
  let typed = "";
  function placeField(words) {
    fieldAt = words[0] === "-" ? null : words.slice(0, 4).map(Number);
    if (!fieldAt) {
      if (document.activeElement !== input) input.hidden = true;
      return;
    }
    fieldText = words.slice(4).join(" ");
    if (document.activeElement === input && fieldText !== typed) input.value = typed = fieldText;
    const r = canvas.getBoundingClientRect();
    const [x0, y0, x1, y1] = fieldAt;
    Object.assign(input.style, {
      left: `${r.left + x0}px`,
      top: `${r.top + y0}px`,
      width: `${x1 - x0}px`,
      height: `${y1 - y0}px`,
    });
    input.hidden = false;
  }
  input.addEventListener("focus", () => {
    input.value = typed = fieldText;
    send(6, 1);
  });
  input.addEventListener("blur", () => {
    send(6, 0);
    if (!fieldAt) input.hidden = true;
    canvas.focus({ preventScroll: true });
  });
  // (What changed, as backspaces and then letters.)
  input.addEventListener("input", () => {
    const now = input.value;
    let same = 0;
    while (same < typed.length && same < now.length && typed[same] === now[same]) same++;
    for (let i = same; i < typed.length; i++) platform.key(2, 65288);
    for (const ch of now.slice(same)) {
      const c = ch.charCodeAt(0);
      if (c >= 32 && c < 127) platform.key(2, c);
    }
    typed = now;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      platform.key(2, e.key === "Escape" ? 65307 : 65293);
      input.blur();
    }
  });

  canvas.focus({ preventScroll: true });
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("booting")));
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`Better stopped${status ? ` with status ${status}` : ""}.<br><a href="">Start again</a>`);
}

// ---- where the phone is ----
// Only while Better asks; each fix as a step from the one before.
const EARTH = 6371008.8;
const RAD = Math.PI / 180;
const gps = {
  post: null,
  id: null,
  wanted: false,
  // The fix before: the one position held, and only while watching.
  prev: null,
  want(on) {
    if (on === this.wanted) return;
    this.wanted = on;
    if (on) this.start();
    else {
      this.stop();
      this.prev = null;
    }
  },
  start() {
    if (this.id !== null) return;
    if (!window.isSecureContext) {
      this.post?.("gps insecure");
      return;
    }
    if (!navigator.geolocation) {
      this.post?.("gps none");
      return;
    }
    this.post?.("gps on");
    this.id = navigator.geolocation.watchPosition(
      (p) => this.fix(p),
      (e) => {
        console.warn(`location: ${e.code} ${e.message}`);
        if (e.code === 1) {
          this.post?.("gps denied");
          this.stop();
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
  },
  // Asked again (refused before: the settings may have changed since).
  retry() {
    this.stop();
    if (this.wanted) this.start();
  },
  stop() {
    if (this.id !== null) navigator.geolocation.clearWatch(this.id);
    this.id = null;
  },
  fix(p) {
    const { latitude, longitude, accuracy, speed, altitude, altitudeAccuracy } = p.coords;
    const known = (v) => v !== null && v !== undefined && !Number.isNaN(v);
    let dx = 0;
    let dy = 0;
    // (How much higher than the fix before that had a height; -1 for
    // how sure, if this one has none.)
    let dz = 0;
    let zacc = -1;
    if (this.prev) {
      dy = (latitude - this.prev.lat) * RAD * EARTH;
      dx = (longitude - this.prev.lon) * RAD * EARTH * Math.cos(((latitude + this.prev.lat) / 2) * RAD);
    }
    if (known(altitude)) {
      if (known(this.prev?.alt)) dz = altitude - this.prev.alt;
      zacc = known(altitudeAccuracy) ? altitudeAccuracy : 30;
    }
    this.prev = { lat: latitude, lon: longitude, alt: known(altitude) ? altitude : this.prev?.alt };
    const cm = (v) => Math.round(v * 100);
    const s = !known(speed) || speed < 0 ? -1 : cm(speed);
    this.post?.(`fix ${Math.round(p.timestamp)} ${cm(dx)} ${cm(dy)} ${Math.round(accuracy * 10)} ${s} ${cm(dz)} ${zacc < 0 ? -1 : Math.round(zacc * 10)}`);
  },
};
// (A phone may stop the watch while the page is away: watched again on
// coming back, from the same fix before.)
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !gps.wanted) return;
  gps.stop();
  gps.start();
});

// ---- light or dark ----
// The page's own background and the phone's bar over it are Better's: dark
// in the dark theme, and while recording (the recording is always dark).
// The pick (0 as the phone is, 1 light, 2 dark) is kept on this device.
const phoneDark = matchMedia("(prefers-color-scheme: dark)");
const look = {
  dark: document.documentElement.classList.contains("dark"),
  set(pick, dark) {
    localStorage.setItem("better:theme", pick);
    this.dark = dark;
    this.paint();
  },
  paint() {
    const dark = this.dark || wake.wanted;
    document.documentElement.classList.toggle("dark", dark);
    document.querySelector('meta[name="theme-color"]').content = dark ? "#121317" : "#f4f4f1";
  },
};

// ---- the screen kept on while recording ----
const wake = {
  wanted: false,
  lock: null,
  async want(on) {
    this.wanted = on;
    look.paint();
    if (!on) {
      this.lock?.release().catch(() => {});
      this.lock = null;
      return;
    }
    if (this.lock || !navigator.wakeLock || document.visibilityState !== "visible") return;
    try {
      this.lock = await navigator.wakeLock.request("screen");
      this.lock.addEventListener("release", () => (this.lock = null));
    } catch (e) {
      console.warn(e);
    }
  },
};
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wake.wanted) wake.want(true);
});

// ---- chimes ----
// Soft struck notes (a sine, with a little of its octave and twelfth that
// fade sooner), as the iPhone app makes them: faster is G up to C, ease
// off C down to G, back on it one quieter A. A browser lets a page make
// sound only after a touch, so the first touch wakes it; and it asks to
// mix with the phone's other sound, not stop it.
let audio = null;
function wakeAudio() {
  if (!audio) {
    try {
      if (navigator.audioSession) navigator.audioSession.type = "transient";
      audio = new AudioContext();
    } catch (e) {
      console.warn(e);
      return;
    }
  }
  if (audio.state === "suspended") audio.resume().catch(() => {});
}
document.addEventListener("pointerdown", wakeAudio, { capture: true });
function note(f, at, loud) {
  const t0 = audio.currentTime + 0.02 + at;
  const out = audio.createGain();
  out.connect(audio.destination);
  for (const [k, a, fade] of [[1, 1, 0.16], [2, 0.3, 0.06], [3, 0.1, 0.04]]) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = f * k;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(loud * a, t0 + 0.008);
    g.gain.setTargetAtTime(0, t0 + 0.008, fade);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 0.9);
  }
}
function chime(k) {
  wakeAudio();
  if (!audio) return;
  if (k === 1) {
    note(783.99, 0, 0.32);
    note(1046.5, 0.15, 0.32);
  }
  if (k === 2) {
    note(1046.5, 0, 0.32);
    note(783.99, 0.15, 0.32);
  }
  if (k === 3) note(880, 0, 0.22);
}

// ---- keeping the log ----
const sync = {
  api: "https://trailingwhite.space/better/api",
  secret: "",
  state: 0,
  send: null,
  post: null,
  reload: null,
  timer: 0,
  unknown: false,
  tell() {
    this.send?.(11, this.state);
  },
  set(state) {
    this.state = state;
    this.tell();
  },
};

// A log, as its units, its activities (by when they started: each its
// lines), and those deleted.
function parseLog(text) {
  const out = { units: null, acts: new Map(), gone: new Set() };
  let at = null;
  for (const line of text.split("\n")) {
    const w = line.split(" ");
    if (w[0] === "units") out.units = line;
    else if (w[0] === "gone") out.gone.add(w[1]);
    else if (w[0] === "act") {
      at = w[1];
      out.acts.set(at, [line]);
    } else if (at && line) out.acts.get(at).push(line);
  }
  return out;
}

// Two logs as one: every activity in either, once (this device's copy if
// both have it), less any deleted in either; this device's units.
function mergeLogs(here, there) {
  const a = parseLog(here);
  const b = parseLog(there);
  const gone = new Set([...a.gone, ...b.gone]);
  const acts = new Map([...b.acts, ...a.acts]);
  const lines = [a.units || b.units || "units mi"];
  for (const k of [...acts.keys()].sort((x, y) => Number(x) - Number(y))) if (!gone.has(k)) lines.push(...acts.get(k));
  for (const k of gone) lines.push(`gone ${k}`);
  return lines.join("\n") + "\n";
}

const call = async (path, body, keepalive = false) => {
  const r = await fetch(sync.api + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${sync.secret}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    keepalive,
    signal: keepalive ? undefined : AbortSignal.timeout(15000),
  });
  if (r.status === 401) {
    sync.unknown = true;
    await kept.set("dirty", true);
  }
  if (r.status === 409) return { conflict: true, ...(await r.json()) };
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};

// The log to start with: this device's, put together with the worker's.
async function startLog(params) {
  if (params.get("api")) sync.api = params.get("api");
  const me = new URLSearchParams(location.hash.slice(1)).get("me");
  if (me && me !== (await kept.get("me"))) {
    // (Another link: another log.)
    await kept.set("me", me);
    await kept.set("rev", 0);
  }
  sync.secret = (await kept.get("me")) || "";
  const local = (await kept.get("log")) || "";
  if (!sync.secret) return local;
  try {
    const there = await call("/log");
    return await joined(local, there, false);
  } catch (e) {
    console.warn(e);
    sync.state = sync.unknown ? 4 : 3;
    if (!sync.unknown) setTimeout(push, 15000);
    return local;
  }
}

// Signed in with a code: the token Better was given, kept (and the log
// with it, as a new device's: what is here goes with the account's); or
// signed out (-): the token forgotten, and the account's log.
async function signedIn(token) {
  clearTimeout(sync.timer);
  sync.unknown = false;
  if (token === "-") {
    sync.secret = "";
    for (const key of ["me", "rev", "dirty", "account"]) await kept.remove(key);
    await kept.set("log", "");
    sync.set(0);
    return;
  }
  sync.secret = token;
  await kept.set("me", token);
  await kept.set("rev", 0);
  await kept.set("dirty", true);
  sync.set(2);
  push();
}

async function keepAccount(words) {
  const account = { id: words[1] === "-" ? "" : words[1], admin: words[2] === "1", name: words.slice(3).join(" ") };
  await kept.set("account", account);
}

// Whose account it is, as the worker says (with the log): kept, and Better
// told, if that is news.
async function heard(there) {
  if (typeof there.name !== "string") return;
  const account = { id: there.id || "", admin: there.admin === 1, name: there.name };
  const was = await kept.get("account");
  if (was && was.id === account.id && was.admin === account.admin && was.name === account.name) return;
  await kept.set("account", account);
  sync.post?.(accountLine(account));
}

// The worker's log and this device's as one; saved back if this device's
// had changes the worker has not. The log to go on with.
async function joined(local, there, reload) {
  await heard(there);
  let log = there.text;
  if ((await kept.get("dirty")) || (!there.text && local)) {
    log = mergeLogs(local, there.text);
    await kept.set("dirty", true);
    sync.state = 2;
    setTimeout(push, 0);
  } else sync.state = 1;
  await kept.set("log", log);
  await kept.set("rev", there.rev);
  if (reload && log !== local) sync.reload?.(log);
  sync.tell();
  return log;
}

// Better saved its log: kept here, and soon with the worker.
async function saved(text) {
  if (sync.fresh) return;
  await kept.set("log", text);
  await kept.set("dirty", true);
  if (!sync.secret) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(push, 1200);
  if (sync.state !== 2) sync.set(2);
}

async function push(keepalive = false) {
  clearTimeout(sync.timer);
  if (!sync.secret || !(await kept.get("dirty"))) return;
  const text = (await kept.get("log")) || "";
  try {
    const r = await call("/log", { text, base: (await kept.get("rev")) || 0 }, keepalive);
    if (r.conflict) {
      // (Saved from elsewhere since: the two put together, and that saved.)
      const now = (await kept.get("log")) || "";
      const both = mergeLogs(now, r.text);
      await kept.set("rev", r.rev);
      await kept.set("log", both);
      if (both !== now) sync.reload?.(both);
      sync.timer = setTimeout(push, 0);
      return;
    }
    await kept.set("rev", r.rev);
    // (Changed again while it was on its way: that goes next.)
    if ((await kept.get("log")) === text) {
      await kept.set("dirty", false);
      sync.set(1);
    } else sync.timer = setTimeout(push, 1200);
  } catch (e) {
    console.warn(e);
    sync.set(sync.unknown ? 4 : 3);
    if (!sync.unknown) sync.timer = setTimeout(push, 15000);
  }
}

// Looked at again: what was saved from elsewhere since.
async function pull() {
  if (!sync.secret || !sync.reload) return;
  if (await kept.get("dirty")) return push();
  try {
    const there = await call("/log");
    if (there.rev !== ((await kept.get("rev")) || 0) && !(await kept.get("dirty"))) await joined((await kept.get("log")) || "", there, true);
    else {
      await heard(there);
      sync.set(1);
    }
  } catch (e) {
    console.warn(e);
    sync.set(sync.unknown ? 4 : 3);
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    pull();
    sync.send?.(15, 1);
  } else push(true);
});
addEventListener("online", () => push());
setInterval(() => {
  if (document.visibilityState === "visible") pull();
}, 120000);

main().catch((e) => {
  console.error(e);
  document.body.classList.remove("booting");
  show(`Better stopped: ${e.message}`);
});
