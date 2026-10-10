// The skate game on a canvas that fills the screen. It shares the block
// game's browser implementation of X11, GLX, and OpenGL (../game/platform.js).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";
import { startControl } from "../game/control.js";

const canvas = document.getElementById("screen");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const show = (html) => {
  message.innerHTML = html;
  overlay.hidden = false;
};

for (const name of ["gesturestart", "gesturechange", "dblclick"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
// The whole screen is a control surface: no scrolling, zooming, or (as far
// as a page can stop it) swiping back. If a swipe back gets through anyway,
// it lands on this same page, which steps forward again.
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (!e.target.closest?.("a, .guide")) e.preventDefault();
  }, { passive: false });
}
history.pushState({ stay: true }, "", location.href);
addEventListener("popstate", () => history.pushState({ stay: true }, "", location.href));

const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
if (touch) document.body.classList.add("touch");
// The mode button (Tab) goes to the park, or back to the course; the
// screen is the controls in either.
const modeKey = document.querySelector(".key.mode");
const setMode = (park) => {
  document.body.classList.toggle("park", park);
  modeKey.textContent = park ? "Course" : "Park";
};
setMode(new URLSearchParams(location.search).has("L8_PARK"));
// Night or day (L): night to begin with where the device is in dark mode,
// unless ?L8_LOOK= says which.
const lookKey = document.querySelector(".key.look");
const lookParam = new URLSearchParams(location.search).get("L8_LOOK");
const startNight = lookParam ? lookParam === "n" : matchMedia("(prefers-color-scheme: dark)").matches;
const setNight = (night) => {
  document.body.classList.toggle("night", night);
  lookKey.textContent = night ? "Day" : "Night";
};
setNight(startNight);
let sendKey = null;
for (const key of document.querySelectorAll(".controls .key")) {
  const sym = Number(key.dataset.key);
  if (!sym) continue;
  if (key === modeKey) key.addEventListener("pointerdown", () => setMode(!document.body.classList.contains("park")));
  if (key === lookKey) key.addEventListener("pointerdown", () => setNight(!document.body.classList.contains("night")));
  let held = false;
  const up = () => {
    if (!held) return;
    held = false;
    key.classList.remove("held");
    sendKey?.(3, sym);
  };
  key.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    key.setPointerCapture(e.pointerId);
    held = true;
    key.classList.add("held");
    sendKey?.(2, sym, "");
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) key.addEventListener(name, up);
}

// The guide to the course: the How button opens it, and the game pauses
// (holding Pause) until it closes, with its button, a tap outside it, or
// Escape.
const guide = document.getElementById("guide");
const openGuide = () => {
  guide.hidden = false;
  canvas.blur();
  sendKey?.(2, 65299, "");
};
const closeGuide = () => {
  guide.hidden = true;
  sendKey?.(3, 65299);
  canvas.focus();
};
document.querySelector(".how").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  openGuide();
});
guide.addEventListener("pointerdown", (e) => {
  if (e.target === guide || e.target.closest(".close")) {
    e.preventDefault();
    closeGuide();
  }
});
addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !guide.hidden) closeGuide();
  if (e.key === "Escape" && !courses.hidden) closeCourses();
});

// The courses: the game says what is on each of the first few (L8LIST
// lines), which one he is on (L8COURSE), and each run's score as it ends
// (L8FINISH); the best on each is kept here, on the device. Picking one
// types its number to the game, and Enter.
const COURSES = 24;
const SECTION_NAMES = { KICKERS: "Kickers", RAILS: "Rails", PIPE: "Halfpipe", CLIFF: "Cliff", GAP: "Gap", ROLLERS: "Rollers" };
const courseList = new Map();
let courseNow = 0;
const stored = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};
const bests = stored("skate.best", {});

// The leaderboard (see ../skate-board/worker.js): the page opened with a board's
// link (?board=<code>) is on that board from then on. A run that beats his
// best there is posted, under his name (his on that board once posted: a
// token kept here says it is this device). Anyone's run can be watched: the
// game is handed it as a file, and V.
const api = location.hostname.endsWith("trailingwhite.space") ? "/skate/api" : "https://trailingwhite.space/skate/api";
const boardParam = new URLSearchParams(location.search).get("board");
if (boardParam && /^[a-z0-9]{8,24}$/.test(boardParam)) store("skate.board", boardParam);
const boardCode = stored("skate.board", null);
let playerName = stored("skate.name", "");
let playerToken = stored("skate.token", null);
if (!playerToken) {
  playerToken = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  store("skate.token", playerToken);
}
let board = null;
let gameVersion = 0;
let gameFs = null;
const toast = (text) => {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("on"), 3500);
};
const cleanName = (text) => text.toUpperCase().replace(/[^A-Z0-9 ]/g, "").replace(/ +/g, " ").trim().slice(0, 12).trim();
const loadBoard = async () => {
  if (!boardCode) return;
  try {
    const r = await fetch(`${api}/board/${boardCode}`);
    if (r.ok) board = await r.json();
  } catch {}
};
// The day's course: its number is the date (as 20261010), in one time zone
// for everyone, so that it is the same course for all of them, and changes
// for all at once.
const DAILY_ZONE = "America/New_York";
const dailyCourse = (at = Date.now()) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: DAILY_ZONE }).format(new Date(at)).replace(/-/g, ""));
const isDaily = (n) => n >= 20000101 && n <= 29991231;
const dayName = (n) =>
  new Date(Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
const myBest = (course) => board?.courses?.[course]?.find((e) => e.name === playerName)?.score ?? 0;
// A run just finished, as the game wrote it: post it, if it is his best
// there.
const postRun = async (version, course, score, replay) => {
  if (!boardCode || score <= 0 || !((course >= 1 && course <= COURSES) || course === dailyCourse())) return;
  if (!playerName) {
    toast("Set your name under Courses to post scores");
    return;
  }
  if (score <= myBest(course)) return;
  try {
    const r = await fetch(`${api}/board/${boardCode}/score`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: playerName, token: playerToken, course, score, version, replay }),
    });
    const body = await r.json();
    if (!r.ok) {
      toast(`Not posted: ${body.error}`);
      return;
    }
    await loadBoard();
    const place = (board?.courses?.[course] ?? []).findIndex((e) => e.name === playerName) + 1;
    if (body.posted) toast(place > 0 ? `Posted: #${place} on ${isDaily(course) ? "today's course" : `course ${course}`}` : "Posted");
  } catch {
    toast("Not posted: no connection");
  }
};
const watchRun = async (course, name) => {
  try {
    const r = await fetch(`${api}/board/${boardCode}/replay?course=${course}&name=${encodeURIComponent(name)}`);
    const run = await r.json();
    if (!r.ok) throw new Error(run.error);
    gameFs.writeFile("watch.txt", `${run.version} ${run.course} ${run.score} ${run.name.replace(/ /g, "_")} ${run.replay}`);
    closeCourses();
    setMode(false);
    typeKeys([118]);
  } catch {
    toast("Could not load that run");
  }
};
const gameSays = (line) => {
  const words = line.trim().split(/\s+/);
  if (words[0] === "L8LIST") courseList.set(Number(words[1]), words.slice(2));
  else if (words[0] === "L8VERSION") gameVersion = Number(words[1]);
  else if (words[0] === "L8REPLAY") postRun(Number(words[1]), Number(words[2]), Number(words[3]), words.slice(4).join(" "));
  else if (words[0] === "L8COURSE") {
    courseNow = Number(words[1]);
    store("skate.course", courseNow);
  } else if (words[0] === "L8FINISH") {
    const [n, score] = [Number(words[1]), Number(words[2])];
    if (score > (bests[n] ?? 0)) {
      bests[n] = score;
      store("skate.best", bests);
    }
  } else return false;
  return true;
};
const courses = document.getElementById("courses");
const typeKeys = (syms) => {
  for (const sym of syms) {
    sendKey?.(2, sym, "");
    sendKey?.(3, sym);
  }
};
const closeCourses = () => {
  courses.hidden = true;
  sendKey?.(3, 65299);
  canvas.focus();
};
const pickCourse = (n) => {
  closeCourses();
  setMode(false);
  // Its digits and Enter; or N, for a new one at random.
  if (n > 0) typeKeys([...String(n)].map((c) => 48 + Number(c)).concat(65293));
  else typeKeys([110]);
};
const showCourses = () => {
  const grid = courses.querySelector(".grid");
  grid.textContent = "";
  const bar = courses.querySelector(".boardbar");
  bar.hidden = !boardCode;
  if (boardCode) {
    bar.querySelector(".title").textContent = board?.title ?? "...";
    const taken = board && playerName && Object.values(board.courses).some((list) => list.some((e) => e.name === playerName));
    bar.querySelector("small").textContent = playerName ? (taken ? "Your runs post as this name." : "Your best runs will post as this name.") : "Type a name to post your scores.";
  }
  const card = (n, title, text) => {
    const el = document.createElement("div");
    el.className = "course" + (n === courseNow ? " now" : "");
    el.innerHTML = `<b></b><span></span>${n > 0 && bests[n] ? "<i></i>" : ""}`;
    el.querySelector("b").textContent = title;
    el.querySelector("span").textContent = text;
    if (n > 0 && bests[n]) el.querySelector("i").textContent = `Best ${bests[n]}`;
    // The board's runs on it: the top few, each to watch (if this game can
    // still play it).
    const runs = (n > 0 && board?.courses?.[n]) || [];
    if (runs.length > 0) {
      const list = document.createElement("ol");
      runs.slice(0, 5).forEach((run, i) => {
        const li = document.createElement("li");
        if (run.name === playerName) li.className = "me";
        li.innerHTML = `<span></span><span class="who"></span><span></span>`;
        const [place, who, score] = li.children;
        place.textContent = `${i + 1}.`;
        who.textContent = run.name;
        score.textContent = String(run.score);
        if (run.version === gameVersion) {
          const watch = document.createElement("span");
          watch.className = "watch";
          watch.textContent = "\u25b6";
          watch.title = "Watch this run";
          watch.addEventListener("pointerdown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            watchRun(n, run.name);
          });
          li.append(watch);
        }
        list.append(li);
      });
      el.append(list);
    }
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      pickCourse(n);
    });
    grid.append(el);
  };
  // The day's course first; and who won yesterday's.
  const today = dailyCourse();
  const kindsOf = (n) => (courseList.get(n) ?? []).map((k) => SECTION_NAMES[k] ?? k).join(" \u203a ");
  const yesterday = board?.courses?.[dailyCourse(Date.now() - 24 * 60 * 60 * 1000)]?.[0];
  card(today, `Daily \u00b7 ${dayName(today)}`, (kindsOf(today) || "Today's course, the same for everyone") + (yesterday ? ` \u00b7 Yesterday: ${yesterday.name} ${yesterday.score}` : ""));
  for (const [n] of courseList) if (!isDaily(n)) card(n, `Course ${n}`, kindsOf(n));
  if (courseNow > COURSES && courseNow !== today) card(courseNow, isDaily(courseNow) ? `Daily \u00b7 ${dayName(courseNow)}` : `Course ${courseNow}`, "The one you are on");
  card(0, "Random", "A new course, laid out afresh");
};
const openCourses = () => {
  showCourses();
  courses.hidden = false;
  canvas.blur();
  sendKey?.(2, 65299, "");
  // (The board as it is now, when it comes.)
  loadBoard().then(() => {
    if (!courses.hidden) showCourses();
  });
};
const nameBox = courses.querySelector(".boardbar input");
nameBox.value = playerName;
nameBox.addEventListener("pointerdown", (e) => e.stopPropagation());
nameBox.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") nameBox.blur();
});
nameBox.addEventListener("change", () => {
  playerName = cleanName(nameBox.value);
  nameBox.value = playerName;
  store("skate.name", playerName);
  showCourses();
});
document.querySelector(".pick").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  openCourses();
});
courses.addEventListener("pointerdown", (e) => {
  if (e.target === courses || e.target.closest(".close")) {
    e.preventDefault();
    closeCourses();
  }
});

async function main() {
  const params = new URLSearchParams(location.search);
  const module = await WebAssembly.compileStreaming(fetch("skate.wasm"));
  const fs = new MemFS({});
  gameFs = fs;
  loadBoard();
  const decoder = new TextDecoder();
  // (What it writes comes in pieces: a line at a time from here.)
  let written = "";
  fs.onOutput = (_fd, data) => {
    written += decoder.decode(data);
    const lines = written.split("\n");
    written = lines.pop();
    for (const line of lines) {
      if (line.trim() && !gameSays(line)) console.log(line.trimEnd());
    }
  };
  const sys = fs.sys(["skate"]);
  // L8_ parameters are also the game's environment (as L8_SEED=n, L8_PARK=1).
  if (startNight && !params.has("L8_LOOK")) params.set("L8_LOOK", "n");
  // He starts on the course he was last on (or the first), and the game
  // says what is on the first few.
  // (An earlier day's course becomes today's.)
  const last = stored("skate.course", 1) || 1;
  if (!params.has("L8_SEED")) params.set("L8_SEED", String(isDaily(last) ? dailyCourse() : last));
  params.set("L8_COURSES", String(COURSES));
  params.set("L8_DAILY", String(dailyCourse()));
  sys.env = [...params].filter(([k]) => k.startsWith("L8_")).map(([k, v]) => `${k}=${v}`);
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const zoom = Math.min(4, Math.max(0.25, Number(params.get("zoom")) || 0.85));
  const scale = params.has("scale") ? Math.min(1, Math.max(0.25, Number(params.get("scale")) || 1)) : 1;
  const platform = createPlatform(canvas, { log: (text) => console.warn(text), checkErrors: params.has("glcheck"), scale, zoom, env, pointers: true, maxTall: 2.4,
    // A phone's screen has far more pixels than the block game's budget,
    // and its GPU to spare: render nearer its own resolution.
    maxPixels: 2.2e6,
    // ?gputime times the frame's parts on the GPU (l8Game.glTiming().gpu);
    // ?skip=prog3 drops a program's draws, to measure what they cost.
    timing: params.has("gputime"), gpuTiming: params.has("gputime"),
    skip: new Set((params.get("skip") ?? "").split(",").filter(Boolean)) });
  // Tab on a keyboard switches too.
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "Tab" && !e.repeat) setMode(!document.body.classList.contains("park"));
    if (e.code === "KeyL" && !e.repeat) setNight(!document.body.classList.contains("night"));
  });
  // The steering and trick panels, placed over the game's view where the
  // game reads them: these fractions match programs/skate/touch.l8.
  const STEER_LEFT = 0.04, STEER_RIGHT = 0.47, PANEL_TOP = 0.52, PANEL_BOTTOM = 0.8;
  const steerPanel = document.querySelector(".panel.steer");
  const trickPanel = document.querySelector(".panel.trick");
  const placePads = () => {
    const r = canvas.getBoundingClientRect();
    const place = (el, left, right) => {
      el.style.left = `${r.left + r.width * left}px`;
      el.style.width = `${r.width * (right - left)}px`;
      el.style.top = `${r.top + r.height * PANEL_TOP}px`;
      el.style.height = `${r.height * (PANEL_BOTTOM - PANEL_TOP)}px`;
    };
    place(steerPanel, STEER_LEFT, STEER_RIGHT);
    place(trickPanel, 1 - STEER_RIGHT, 1 - STEER_LEFT);
  };
  new ResizeObserver(placePads).observe(canvas);
  addEventListener("resize", placePads);
  placePads();
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  sendKey = platform.key;
  show(touch ? "Tap to start" : "Click to start");
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => {
    if (!touch && guide.hidden && courses.hidden) show("Click to continue");
  });
  addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".ui")) return;
    canvas.focus();
    overlay.hidden = true;
  });
  canvas.focus();
  // ?control lets web/control.py drive the page (see ../game/control.js).
  if (params.has("control")) {
    const session = Math.random().toString(36).slice(2, 10);
    const post = (kind, data) =>
      fetch("/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session, kind, t: Date.now(), ...data }) });
    startControl(platform, { session, post, reportNow: () => null });
  }
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
