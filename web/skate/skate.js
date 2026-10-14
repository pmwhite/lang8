// The skate game on a canvas that fills the screen. It shares the block
// game's browser implementation of X11, GLX, and OpenGL (../game/platform.js).
//
// Everything over the game is the game's own, drawn in its own writing (see
// programs/skate/ui.l8): its sheets, its buttons, the tutorial's words. This
// page says what there is to show, a line at a time (see uiSay), and the
// game says what was pressed (L8TAP). The page keeps what a page must: the
// way from page to page, the leaderboards, what is kept on the device, the
// day, and how fast the frames come.
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";
import { startControl } from "../game/control.js";
import { createPacer } from "./pace.js";

const canvas = document.getElementById("screen");
// (The game has stopped: what is left to show is the page's.)
const stopped = (html) => {
  document.getElementById("message").innerHTML = html;
  document.getElementById("overlay").hidden = false;
  document.body.classList.remove("booting");
};

// A person's link is this page with their secret after the # (see the
// leaderboards, below): it is kept, and taken out of the address before
// anything else sees it there.
const linked = location.hash.match(/^#me=([a-z0-9]{24})$/)?.[1] ?? null;
if (linked) {
  try {
    localStorage.setItem("skate.me", JSON.stringify(linked));
    localStorage.removeItem("skate.account");
  } catch {}
  history.replaceState(null, "", location.pathname + location.search);
}

for (const name of ["gesturestart", "gesturechange", "dblclick"]) {
  document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
}
// The whole screen is a control surface: no scrolling, zooming, or (as far
// as a page can stop it) swiping back. If a swipe back gets through anyway,
// it lands on this same page, which steps forward again.
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (!e.target.closest?.("a")) e.preventDefault();
  }, { passive: false });
}
history.pushState({ stay: true }, "", location.href);
addEventListener("popstate", () => history.pushState({ stay: true }, "", location.href));

// (?touch has a desktop browser be one, to try the game as a phone has it.)
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).has("touch");
if (touch) document.body.classList.add("touch");
// Night or day (L): night to begin with where the device is in dark mode,
// unless ?L8_LOOK= says which.
const lookParam = new URLSearchParams(location.search).get("L8_LOOK");
const startNight = lookParam ? lookParam === "n" : matchMedia("(prefers-color-scheme: dark)").matches;
const setNight = (night) => document.body.classList.toggle("night", night);
setNight(startNight);
let sendKey = null;
const typeKeys = (syms) => {
  for (const sym of syms) {
    sendKey?.(2, sym, "");
    sendKey?.(3, sym);
  }
};

// ---- telling the game what to show ----
// Lines for the game (see programs/skate/ui.l8), each of parts parted by
// tabs; sent all together once a frame, as the file ui.txt, and the key
// that says it is there (UI_KEY). Not while the game builds a place, when
// it reads nothing: they wait for it.
const UI_KEY = 65301;
let uiLines = [];
const clean = (v) => String(typeof v === "boolean" ? Number(v) : v ?? "").replace(/[\t\n\r]/g, " ");
const uiSay = (...parts) => uiLines.push(parts.map(clean).join("\t"));
let gameFs = null;
const flushUi = () => {
  if (!uiLines.length || !gameFs || !sendKey) return;
  gameFs.writeFile("ui.txt", uiLines.join("\n") + "\n");
  uiLines = [];
  typeKeys([UI_KEY]);
};
// What is over the game (see programs/skate/ui_chrome.l8), each by its name:
// told again only when it changes.
const chromeSaid = new Map();
const chrome = (name, ...parts) => {
  const line = ["chrome", name, ...parts].map(clean).join("\t");
  if (chromeSaid.get(name) === line) return;
  chromeSaid.set(name, line);
  uiLines.push(line);
};

// ---- the way from page to page ----
// A lesson's steps (see the chrome's steps): read its word (its sheet),
// watch the game ride it (its T), or try it (its R); any, in any order. The
// one he is at is lit. They are up for the lesson the game is at, or is on
// its way to (see lessonNow): from the moment it is picked, loading or not.
// Reading never waits. Watching or trying asked for before the game is
// there and done building is kept, and done the moment it is.
const lessonNow = () => (pageNow() === "lesson" ? TUTORIAL + trail.at(-1)[1] : 0);
let pendingStep = "";
const stepAt = () => (reading ? "read" : pendingStep || (document.body.classList.contains("watching") ? "watch" : "try"));
const syncSteps = () => {
  const lesson = lessonNow() !== 0;
  document.body.classList.toggle("lesson", lesson);
  document.body.classList.toggle("reading", lesson && reading);
};
// The game is at a lesson, built and ready to be told what to do.
const lessonReady = () => headed === null && placeNow === lessonNow() && !document.body.classList.contains("loading");
const doStep = (step) => {
  document.body.classList.remove("over");
  // (As it will be, the moment the game takes the key: see L8RIDE.)
  document.body.classList.toggle("watching", step === "watch");
  typeKeys([step === "watch" ? 116 : 114]);
  syncSteps();
};
const takeStep = (step) => {
  if (!lessonNow()) return;
  // (The lesson's one page, whichever step of it shows: none of them is a
  // page further on.)
  reading = step === "read";
  pendingStep = reading || lessonReady() ? "" : step;
  present();
  if (!reading && !pendingStep) doStep(step);
};
// (Once the game is there and built: see L8COURSE and L8LOAD.)
const stepWhenReady = () => {
  syncSteps();
  if (pendingStep && lessonReady()) {
    const step = pendingStep;
    pendingStep = "";
    doStep(step);
  }
};
// (From the end of his own ride of it, on to today's course; from a
// lesson's end, the next lesson, or the list of them.)
let onwardWord = "";
const onward = () => {
  if (!isLesson(placeNow)) return goTo(today(), true);
  const n = placeNow - TUTORIAL;
  if (n < LESSONS.length) goInstead("lesson", n + 1);
  else goBack();
};
// What the thumbs of the run the game rides are doing (L8HANDS: see
// demo_keys, in tutorial.l8): a keyboard's keys light up for them.
let hands = 0;

// Pages. Home is the root: it is where the page opens, there is nothing to
// go back to from it, and nothing closes it but going on to something. The
// rest are a history back to it (`trail`, home first, the page showing
// last): each a kind and what it is of. Most are sheets over the game,
// which is held (Pause, held) while one is up: the lessons, a lesson read,
// the places to pick from, the days gone by, a place, a person. Three have
// no sheet, the game itself showing: a place ridden ("ride"), a run
// watched ("watch"), and a lesson watched or tried (the lesson's own page,
// when it is not being read: see `reading`).
//
// Two buttons, on every page but home: back, a page; and home.
const SHEETS = new Set(["menu", "lessons", "lesson", "places", "days", "place", "person"]);
const trail = [["menu"]];
const pageNow = () => trail.at(-1)[0];
// (A lesson's page is its sheet only while its word is being read.)
let reading = true;
const sheetNow = () => (SHEETS.has(pageNow()) && (pageNow() !== "lesson" || reading) ? pageNow() : null);
const sheetOpen = () => sheetNow() !== null;
// Behind a sheet the game flies over the place it is at, as a drone
// would, so that no page is a bare one: a key held tells it so (see
// fly_over, in programs/skate/main.l8). But behind a lesson's word, which
// has the lesson's own stretch behind it, as he will ride it.
let previewing = false;
const syncPreview = () => {
  const want = sheetOpen() && pageNow() !== "lesson";
  if (!sendKey || want === previewing) return;
  previewing = want;
  sendKey(want ? 2 : 3, 65300, "");
};
// The game is held while a sheet is up, and goes when none is.
// (How big the scene is drawn: see setSize, in main.)
let sayScale = () => {};
const holdGame = () => {
  const open = sheetOpen();
  sayScale();
  document.body.classList.toggle("sheet", open);
  document.body.classList.toggle("showing", sheetNow() === "place");
  syncPreview();
  syncSteps();
  if (open) sendKey?.(2, 65299, "");
  else sendKey?.(3, 65299);
};
// Show the page he has come to (its sheet coming the way he went: on, or
// back), with its scores as they are now when they come.
let shownLength = 1;
const present = () => {
  const view = trail.at(-1);
  const [id, of] = view;
  if (id === "places" || id === "days") picking = of;
  // (A lesson: the game goes to it, behind its sheet if that is up.)
  if (id === "lesson") {
    lessonOf = of;
    visit(TUTORIAL + of);
  }
  if (id === "place") visit((placeOf = of));
  if (id === "person") personOf = of;
  const motion = trail.length > shownLength ? "push" : trail.length < shownLength ? "pop" : "swap";
  shownLength = trail.length;
  showPage(motion);
  holdGame();
  if (sheetOpen())
    loadScores().then(() => {
      if (trail.at(-1) === view) showPage();
    });
};
const go = (id, of) => {
  if (id === "lesson") {
    reading = true;
    pendingStep = "";
  }
  trail.push([id, of]);
  present();
};
// (In place of the page showing: on from one lesson to the next, or one
// ride to another, back from either being to where they were come to
// from.)
const goInstead = (id, of) => {
  if (trail.length > 1) trail.pop();
  go(id, of);
  // (Not a page further in: the sheet comes in place of the last.)
};
const goHome = () => {
  // (A run being watched is left.)
  if (pageNow() === "watch") typeKeys([65288]);
  trail.length = 1;
  present();
};
// Back a page, by the button in the corner or Escape (not by a tap outside
// a sheet, which is too easily made by mistake). From home there is
// nowhere back to.
const goBack = () => {
  if (trail.length <= 1) return;
  // (From a run being watched: the game leaves it. See L8RIDE.)
  if (trail.pop()[0] === "watch") typeKeys([65288]);
  present();
};
addEventListener("keydown", (e) => {
  if (e.key === "Escape") goBack();
});

// Places: a downhill course is a number; a park is one too, kept negative
// (as the game says them: see run_id in programs/skate/park.l8). Each
// number is always the same place, and each day has a course and a park of
// its own, numbered by its date (as 20261010). The game says which he is
// on (L8COURSE), and each run's score as it ends (L8FINISH); his runs on
// each are kept here, on the device. Going to one types its number to the
// game, and Enter (a course) or Tab (a park).
const PLACES = 5;
// The tutorial's course (see programs/skate/tutorial.l8): where a new
// player starts, until he has left it for another.
const TUTORIAL = 100000000;
// The tutorial's lessons, TUTORIAL + 1 on: each a stretch of its course
// with one thing on it (see programs/skate/tutorial.l8), with a word
// before it (of thumbs, on a phone; of keys, otherwise), and of the
// scoring it bears on.
const LESSONS = [
  {
    title: "Steering",
    thumbs: "Your left thumb steers. Slide it toward the side you want to go: the further from the middle, the more he heads across the hill. Lift it, and he keeps his heading. Ride the run to the finish.",
    keys: "The Left and Right arrows steer: hold one, and he turns further across the hill. Let go, and he keeps his heading. Ride the run to the finish.",
    scoring: "A run's score is the sum of its tricks. Steering scores nothing, but it gets you to the jumps, and onto the line for them.",
  },
  {
    title: "The ramp",
    thumbs: "Put your right thumb down early, and he crouches. Slide it up to set a frontflip: the further you slide, the more flips. Let go, and he jumps. A bigger trick needs longer in the air to finish, and the later you let go, the more air you get. The ramp glows green where letting go lands the trick you've set clean: the bigger the trick, the less green there is.",
    keys: "Hold Space early, and he crouches. Tap Up to set a frontflip: each tap adds a flip. Let go, and he jumps. A bigger trick needs longer in the air to finish, and the later you let go, the more air you get. The ramp glows green where letting go lands the trick you've set clean: the bigger the trick, the less green there is.",
    scoring: "A flip is 600; two are 900, three 1100. A kicker pays flips double. A trick that hasn't finished when he lands is sketchy, and scores nothing.",
  },
  {
    title: "Backflip and grab",
    thumbs: "The same trick twice scores half, so set another: slide down for a backflip. In the air, thumb down again to grab the board. Holding the grab slows his flip, so let go of it in time for the flip to finish before he lands.",
    keys: "The same trick twice scores half, so set another: tap Down for a backflip. In the air, hold Space again to grab the board. Holding the grab slows his flip, so let go of it in time for the flip to finish before he lands.",
    scoring: "A repeat scores half, then a quarter. A grab adds 300 to 500, more the longer you hold it.",
  },
  {
    title: "The box",
    thumbs: "Line up early with a box or a rail and ride straight onto it to grind. Keep the steering gentle to stay on, and ride off its end.",
    keys: "Line up early with a box or a rail and ride straight onto it to grind. Keep the steering gentle to stay on, and ride off its end.",
    scoring: "A grind is 300, plus 150 for each second on it.",
  },
  {
    title: "The halfpipe",
    thumbs: "Steer up a wall and he rides it. Slide sideways to set a spin: further for a bigger one, a half turn at a time. Let go on the green near the top, where there's air enough for it. Then the other wall.",
    keys: "Steer up a wall and he rides it. Hold Space and tap Left or Right to set a spin: each tap adds a half turn. Let go on the green near the top, where there's air enough for it. Then the other wall.",
    scoring: "A 180 is 200, a 360 is 350, a 540 is 480, a 720 is 580. A halfpipe pays spins double. Landing switch, facing backward, scores half again.",
  },
  {
    title: "The gap",
    thumbs: "A big jump has room for more. Slide up and across for a flip and a spin at once. Together they need more air than either alone, so let go right at the lip, and clear the gap: landing short scores nothing.",
    keys: "A big jump has room for more. Hold Space, tap Up and Right for a flip and a spin at once. Together they need more air than either alone, so let go right at the lip, and clear the gap: landing short scores nothing.",
    scoring: "A gap pays a flip with a spin half again. Each kind of jump favors one kind of trick, so mix them up: set the trick early, and let go late.",
  },
];
const isLesson = (id) => id > TUTORIAL && id <= TUTORIAL + LESSONS.length;
const inTutorial = (id) => id === TUTORIAL || isLesson(id);

// Big air's places are numbered from here (big air 3 is BIG_AIR + 3): see
// lay_big_air, in programs/skate/layout.l8.
const BIG_AIR = 200000000;
const isBigAir = (id) => id > BIG_AIR && id < BIG_AIR + 100000000;
let placeNow = 0;
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
// His own runs on each place, kept on the device: the latest few and the
// best few, each a score and when.
const KEEP_RECENT = 20;
const KEEP_BEST = 10;
const KEEP_PLACES = 60;
const myRuns = stored("skate.runs", {});
// The tutorial's lessons he has finished (riding them himself to the end).
const lessonsDone = stored("skate.lessons", {});
const noteRun = (id, score) => {
  const mine = (myRuns[id] ??= { recent: [], best: [] });
  const run = [score, Date.now()];
  mine.recent = [run, ...mine.recent].slice(0, KEEP_RECENT);
  mine.best = [...mine.best, run].sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, KEEP_BEST);
  // (Only so many places' worth: those longest unridden go.)
  const ids = Object.keys(myRuns).sort((a, b) => myRuns[b].recent[0][1] - myRuns[a].recent[0][1]);
  for (const old of ids.slice(KEEP_PLACES)) delete myRuns[old];
  store("skate.runs", myRuns);
};
// How long ago, in a word or two.
const ago = (at) => {
  const s = Math.max(0, (Date.now() - at) / 1000);
  if (s < 90) return "now";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
// The day's places: the date in one time zone for everyone, so that they
// are the same for all of them, and change for all at once.
const DAILY_ZONE = "America/New_York";
const today = (at = Date.now()) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: DAILY_ZONE }).format(new Date(at)).replace(/-/g, ""));
const isDaily = (id) => Math.abs(id) >= 20000101 && Math.abs(id) <= 29991231;
// How long the day's places are open for: until midnight where the day is
// kept (see DAILY_ZONE); and that, in words.
const dayLeft = (at = Date.now()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: DAILY_ZONE, hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" }).formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  return 86400000 - ((Number(parts.hour) * 60 + Number(parts.minute)) * 60 + Number(parts.second)) * 1000;
};
const leftText = (ms) => {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 120 ? `${Math.floor(m / 60)} h ${m % 60} min` : m >= 60 ? `1 h ${m % 60} min` : `${m} min`;
};
// A day's place, as a number, some days ago.
const dayAgo = (days) => today(Date.now() - days * 86400000);

// (A day's name is its month and day, as "Oct 9", with the year when it
// is not this one.)
const dayName = (id) => {
  const n = Math.abs(id);
  const year = Math.floor(n / 10000);
  return new Date(Date.UTC(year, (Math.floor(n / 100) % 100) - 1, n % 100)).toLocaleDateString("en-US", { timeZone: "UTC", day: "numeric", month: "short", ...(year === Math.floor(today() / 10000) ? {} : { year: "numeric" }) });
};
// The first day there were daily places.
const FIRST_DAY = 20261010;
// The first few slopestyles and parks have names; the rest, numbers.
const SLOPE_NAMES = ["Haystack", "Pinewood", "Lantern", "Clover", "Fox Run"];
const PARK_NAMES = ["Pebble", "Sundial", "Mossy", "Birdbath", "Thistle"];
const placeName = (id) => {
  if (id === TUTORIAL) return "Tutorial";
  if (isLesson(id)) return `Lesson ${id - TUTORIAL}: ${LESSONS[id - TUTORIAL - 1].title}`;
  if (id >= 1 && id <= SLOPE_NAMES.length) return SLOPE_NAMES[id - 1];
  if (id <= -1 && id >= -PARK_NAMES.length) return PARK_NAMES[-id - 1];
  if (isBigAir(id)) return id === BIG_AIR + 1 ? "Big air" : `Big air ${id - BIG_AIR}`;
  // (A day gone by is named by its day: "Slopestyle Oct 9", "Park Oct 9".)
  if (isDaily(id)) return Math.abs(id) === today() ? (id < 0 ? "Daily park" : "Daily slopestyle") : `${id < 0 ? "Park" : "Slopestyle"} ${dayName(id)}`;
  return `${id < 0 ? "Park" : "Slopestyle"} ${Math.abs(id)}`;
};
// (Picked before the game is up: it starts there instead. See main.)
let wanted = null;
// Where the game has been asked to go, until it says it is there.
let headed = null;
// (Asked for outright, as one key the game knows a page by: 2000000000 and
// the place's number. Typed as a number and Enter, as on a keyboard, it
// could be lost: Enter means other things to the game at times. The game
// keeps the picture of the place it is leaving while it builds the next,
// and fades from one to the other.)
const typePlace = (id) => {
  headed = id;
  pendingStep = "";
  syncSteps();
  typeKeys([2000000000 + id]);
};
// Have the game go there, the page's sheets left as they are (see
// showPlace).
const visit = (id) => {
  if (!sendKey) wanted = id;
  else if (id !== (headed ?? placeNow)) typePlace(id);
};
// Ride there: from its start, if the game is there already. (A page of its
// own; or, `instead`, in place of the ride he is on.)
const goTo = (id, instead = false) => {
  if (instead && pageNow() === "ride") goInstead("ride", id);
  else go("ride", id);
  if (!sendKey) wanted = id;
  // (Already there: from the top; and in the tutorial, which starts with
  // the game riding it, that again.)
  else if (id === (headed ?? placeNow)) typeKeys([id === TUTORIAL ? 116 : 114]);
  else typePlace(id);
};
const randomPlace = (kind) => (kind === "parks" ? -1 : 1) * (PLACES + 1 + Math.floor(Math.random() * 99000));

// His best run on the place he is at, for the game's corner (which knows
// only this visit's): as the leaderboards have it, if he is someone, or
// else as this device does. Told as a key, 300000000 and the score, when
// he arrives, and again when the leaderboards come.
const tellBest = () => {
  if (!sendKey || !placeNow || inTutorial(placeNow)) return;
  const local = myRuns[placeNow]?.best?.[0]?.[0] ?? 0;
  const posted = account ? (bestsOn(placeNow).find((run) => run.id === account.id)?.score ?? 0) : 0;
  const best = Math.max(local, posted);
  if (best > 0) typeKeys([300000000 + best]);
};

// The leaderboards (see ../skate-board/worker.js). There is nothing here to
// join or sign up to: whoever looks after them makes each person a link
// (this page, with their secret after its #: see `linked`, above), and
// decides who sees whom. Whoever opens a link plays as that person from
// then on, on that device, and sees the scores of those they may: each
// one's best on a place, and their latest runs there. A best run can be
// watched: the game is handed it as a file, and V.
// (?api= points a page on localhost at a worker run there, to try one.)
const localApi = location.hostname === "localhost" && new URLSearchParams(location.search).get("api");
const api = localApi || (location.hostname.endsWith("trailingwhite.space") ? "/skate/api" : "https://trailingwhite.space/skate/api");
let mySecret = stored("skate.me", null);
// Who he is, and the scores of those he sees, as last fetched: kept on the
// device too, so that they show at once the next time, before they are
// fetched again (which nothing waits for).
let account = mySecret ? stored("skate.account", null) : null;
// The game's rules, by their number (see L8VERSION): as they were when it
// last ran here, until it says.
let gameVersion = stored("skate.rules", 0) || 0;

// What goes wrong on a device, and how fast its frames come, told to the
// leaderboards' worker (POST /report: see ../skate-board/worker.js), so
// that when the game misbehaves for someone there is something to go on. A
// report says what happened and what the device is (its browser, screen,
// and graphics chip); the worker notes whose link the device has, if it
// has one, and keeps it for a while. A copy of the page on this machine,
// being tried out, reports only to a worker run here too (?api=).
const session = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
const reporting = location.hostname !== "localhost" || !!localApi;
let reportsLeft = 30;
// (Its graphics chip can be asked of the game's own context, once it has one.)
let gameDrawn = false;
let chip = null;
// (And how many samples its pixels are made of: see antialias, in main.)
let samples = undefined;
const device = () => {
  if (gameDrawn && chip === null) {
    try {
      const gl = canvas.getContext("webgl2");
      const named = gl.getExtension("WEBGL_debug_renderer_info");
      chip = String(gl.getParameter(named ? named.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 120);
      samples = gl.getParameter(gl.SAMPLES);
    } catch {
      chip = "?";
    }
  }
  return {
    host: location.host + location.pathname,
    built: document.lastModified,
    view: [innerWidth, innerHeight, devicePixelRatio],
    canvas: [canvas.width, canvas.height],
    touch,
    cores: navigator.hardwareConcurrency,
    memory: navigator.deviceMemory,
    gpu: chip ?? undefined,
    samples,
    place: placeNow,
    rules: gameVersion,
    night: document.body.classList.contains("night"),
    up: Math.round(performance.now() / 1000),
  };
};
const report = (kind, data) => {
  if (!reporting || reportsLeft <= 0) return;
  reportsLeft--;
  try {
    fetch(`${api}/report`, {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json", ...(mySecret ? { authorization: `Bearer ${mySecret}` } : {}) },
      body: JSON.stringify({ kind, session, data: { ...device(), ...data } }),
    }).catch(() => {});
  } catch {}
};
// Something has gone wrong: told once, however often it happens, and only
// the first few different things.
const faults = new Set();
const stackOf = (e) => (typeof e?.stack === "string" ? e.stack.slice(0, 1500) : undefined);
const fault = (what, message, more = {}) => {
  const said = `${what}: ${message}`.slice(0, 300);
  if (faults.has(said) || faults.size >= 8) return;
  faults.add(said);
  report("error", { what, message: String(message).slice(0, 300), ...more });
};
addEventListener("error", (e) => fault("error", e.message, { where: `${e.filename}:${e.lineno}:${e.colno}`, stack: stackOf(e.error) }));
addEventListener("unhandledrejection", (e) => fault("rejection", e.reason?.message ?? String(e.reason), { stack: stackOf(e.reason) }));
canvas.addEventListener("webglcontextlost", () => fault("context", "graphics context lost"));
// How the frames have come while he rides (not behind a sheet, or while a
// place is built): how many, over how long; how many were late (half as
// long again as the screen's own beat, or more) and how many a hitch (a
// tenth of a second, or more), and the worst; how many came at each of a
// few rates (under 15 a second, 25, 35, 50, 70, and over); how long each
// place took to build; and how long the page took to its first frame. Told
// early in a visit, every so often after, and when the page is put away.
const FRAME_RATES = [15, 25, 35, 50, 70];
const frames = { n: 0, ms: 0, slow: 0, hitches: 0, worst: 0, by: [0, 0, 0, 0, 0, 0], loads: [], how: [], boot: 0, skip: true, told: 0, drawn: 0, work: 0 };
// (What the frames are paced by, and at what resolution: see main. And how
// many the game has drawn, and how long it has spent working them out, for
// the milliseconds of its own work that a frame takes: cpu.)
// How the time a place takes to build goes: the game works for a few
// milliseconds, then stops to let the page breathe (see main's end, and
// programs/skate/breathe.l8), over and over. So of each build: how long the
// game was working, how long the page took over its breaths, and how many
// there were; and the game's own word on each stage, where it gives it
// (L8_TRACE). A device slow to build is slow in one of these, and which
// says why.
const building = { work: 0, wait: 0, breaths: 0, since: 0, stages: [], done: null };
let frameState = () => ({});
let frameWork = () => [0, 0];
const reportFrames = (why) => {
  // (Too little to go on is not worth telling.)
  if (frames.ms < 5000) return;
  const [drawn, work] = frameWork();
  const cpu = drawn > frames.drawn ? Math.round(((work - frames.work) / (drawn - frames.drawn)) * 10) / 10 : undefined;
  Object.assign(frames, { drawn, work });
  report("perf", {
    cpu,
    why,
    secs: Math.round(frames.ms / 1000),
    frames: frames.n,
    fps: Math.round((frames.n * 10000) / frames.ms) / 10,
    slow: frames.slow,
    hitches: frames.hitches,
    worst: Math.round(frames.worst),
    by: frames.by,
    loads: frames.loads,
    how: frames.how,
    boot: frames.boot,
    ...frameState(),
  });
  Object.assign(frames, { n: 0, ms: 0, slow: 0, hitches: 0, worst: 0, by: [0, 0, 0, 0, 0, 0], loads: [], how: [], told: frames.told + 1 });
};
const frameCame = (gap, refresh) => {
  // (Not the first after a pause: it is as long as the pause was.)
  if (frames.skip || gap > 2000) {
    frames.skip = false;
    return;
  }
  frames.n++;
  frames.ms += gap;
  if (gap > 1.5 * refresh) frames.slow++;
  if (gap > 100) frames.hitches++;
  frames.worst = Math.max(frames.worst, gap);
  const rate = 1000 / gap;
  let i = 0;
  while (i < FRAME_RATES.length && rate >= FRAME_RATES[i]) i++;
  frames.by[i]++;
  if (frames.ms >= (frames.told === 0 ? 20000 : 120000)) reportFrames("riding");
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) reportFrames("hidden");
});
addEventListener("pagehide", () => reportFrames("leaving"));
// A word that comes and goes, near the top (see ui_chrome.l8).
const toast = (text) => uiLines.push(["chrome", "toast", text].map(clean).join("\t"));
// Fetch them: one fetch at a time, and (unless `fresh` asks for them as
// they are now) none if they were fetched in the last while. True if they
// came, false if he is nobody (no link, or one that works no longer), null
// if the leaderboards could not be reached.
const ACCOUNT_FRESH = 20000;
let accountLoad = null;
let accountLoaded = 0;
const loadMe = (fresh = true) => {
  if (!mySecret) return Promise.resolve(false);
  if (!fresh && Date.now() - accountLoaded < ACCOUNT_FRESH) return Promise.resolve(true);
  // (One already on its way may be from before what he wants to see.)
  if (accountLoad) return fresh ? accountLoad.then(() => loadMe()) : accountLoad;
  accountLoad = (async () => {
    try {
      const r = await fetch(`${api}/me`, { headers: { authorization: `Bearer ${mySecret}` } });
      if (r.status === 401) {
        // (His link has been replaced by another: here he is nobody again.)
        mySecret = null;
        account = null;
        localStorage.removeItem("skate.me");
        localStorage.removeItem("skate.account");
        toast("Your link no longer works");
        return false;
      }
      if (!r.ok) {
        fault("api", `me: ${r.status}`);
        return null;
      }
      account = await r.json();
      accountLoaded = Date.now();
      store("skate.account", account);
      tellBest();
      return true;
    } catch {
      return null;
    }
  })().finally(() => (accountLoad = null));
  return accountLoad;
};
const loadScores = () => loadMe(false);
// Their bests on a place (one each, best first), and their latest runs
// there (newest first). A best under older rules than this game's is left
// out, as it is not one to beat (the next run its rider posts takes its
// place); the latest runs are a record of what was ridden, whatever the
// rules were.
const current = (run) => gameVersion === 0 || run.version >= gameVersion;
const bestsOn = (id) => (account?.courses?.[id] ?? []).filter(current);
const recentOn = (id) => account?.recent?.[id] ?? [];
// A place the leaderboards keep scores of (so there is a board to see);
// and one a run may be posted to now: a day's place only on its day, as
// everyone has the same day to ride it in.
const boarded = (id) => (Math.abs(id) >= 1 && Math.abs(id) <= PLACES) || (isDaily(id) && Math.abs(id) <= today() && Math.abs(id) >= FIRST_DAY) || (isBigAir(id) && id - BIG_AIR <= PLACES);
const postable = (id) => boarded(id) && (!isDaily(id) || Math.abs(id) === today());
// A run just finished, as the game wrote it: posted, to be logged, and
// kept if it is his best there.
const postRun = async (version, id, score, replay) => {
  if (!mySecret || score <= 0 || !postable(id)) return;
  try {
    const r = await fetch(`${api}/score`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${mySecret}` },
      body: JSON.stringify({ course: id, score, version, replay }),
    });
    const body = await r.json();
    if (!r.ok) fault("api", `score: ${r.status} ${body.error ?? ""}`, { course: id, score, long: replay.length });
    await loadMe();
    // (Where a new best puts him, among those he sees.)
    const place = r.ok && body.best && account ? bestsOn(id).findIndex((e) => e.id === account.id) + 1 : 0;
    if (place > 0 && bestsOn(id).length > 1) toast(`You're #${place} on ${placeName(id)}`);
  } catch {
    toast("Couldn't post score");
  }
  showOpen();
};
const watchRun = async (person, id) => {
  if (!sendKey) return;
  try {
    const r = await fetch(`${api}/replay?person=${person}&course=${id}`, { headers: { authorization: `Bearer ${mySecret}` } });
    const run = await r.json();
    if (!r.ok) throw new Error(run.error);
    gameFs.writeFile("watch.txt", `${run.version} ${run.course} ${run.score} ${run.name.replace(/ /g, "_")} ${run.replay}`);
    // (Going back from the run, or its end, comes back to this sheet:
    // see L8RIDE.)
    go("watch");
    typeKeys([118]);
  } catch {
    toast("Couldn't load that run");
  }
};
// The tutorial (see programs/skate/tutorial.l8). The game rides a run of
// it itself, with thumbs of its own on the controls, and says what it is
// doing (L8SAY, with what kind of thing it is: a line of that run, 1; its
// last, the run being over, 2; a word to him as he rides the course
// himself, 3; or nothing, 0). Of those, the game shows his own words (3)
// over the scene, and how a lesson went (4: see sayVerdict); the rest only
// steer what else is shown.
// What he did on a lesson, as the game tells it at the end (L8HITS: see
// main.l8), and the word on how it went, judged by the lesson.
let lessonHits = [];
let verdict = "";
let teach = { kind: 0, text: "", ok: false };
const HIT_AIR = 0, HIT_RAIL = 2, HIT_BOX = 3;
const FEATURE_PIPE = 2;
// Whether he did the lesson's thing, and that said plainly.
const judgeLesson = (n, hits) => {
  const clean = hits.filter((h) => h.kind === HIT_AIR);
  const tell = (ok, yes, no) => ({ ok, text: ok ? yes : no });
  if (n === 1) return tell(true, "You reached the finish.", "");
  if (n === 2) return tell(clean.some((h) => h.flips !== 0), "You landed the flip.", "No flip landed.");
  if (n === 3) return tell(clean.some((h) => h.flips !== 0 && h.grab), "You landed a flip with a grab.", "No flip with a grab landed.");
  if (n === 4) return tell(hits.some((h) => h.kind === HIT_RAIL || h.kind === HIT_BOX), "You grinded the box.", "You missed the box.");
  if (n === 5) return tell(clean.some((h) => h.item === FEATURE_PIPE && h.halves !== 0), "You landed a spin off the wall.", "No spin landed off the wall.");
  if (n === 6) return tell(clean.some((h) => h.flips !== 0 && h.halves !== 0), "You landed a flip with a spin.", "No flip with a spin landed.");
  return tell(false, "", "");
};
const sayVerdict = () => {
  const n = placeNow - TUTORIAL;
  const { ok, text } = judgeLesson(n, lessonHits);
  verdict = text;
  // (A lesson is done once he has done its thing.)
  if (ok && !lessonsDone[n]) {
    lessonsDone[n] = true;
    store("skate.lessons", lessonsDone);
  }
  if (verdict) teach = { kind: 4, text: verdict, ok };
};
const say = (kind, text) => {
  // (That the game rides is told apart: see L8RIDE. Its ride over, the
  // next step asks to be taken.)
  document.body.classList.toggle("nudge", kind === 2);
  // (The word on how a lesson went stays up while nothing else is said.)
  if (kind === 0 && verdict) return;
  if (kind !== 0) verdict = "";
  teach = { kind, text: kind === 0 ? "" : text, ok: false };
};

const gameSays = (line) => {
  const words = line.trim().split(/\s+/);
  if (words[0] === "L8TAP") onTap(line.trim().slice(6));
  else if (words[0] === "L8CURSOR") canvas.style.cursor = words[1] === "1" ? "pointer" : "";
  else if (words[0] === "L8VERSION") {
    gameVersion = Number(words[1]);
    // (His runs under other rules are not ones to beat under these.)
    if (stored("skate.rules", 1) !== gameVersion) {
      for (const id of Object.keys(myRuns)) delete myRuns[id];
      store("skate.runs", myRuns);
      store("skate.rules", gameVersion);
    }
    showPage();
  }
  else if (words[0] === "L8LOAD") {
    // (How long the place took to build is one of the things reported;
    // and how that time went: see building.)
    const now = performance.now();
    if (words[1] === "1") {
      gameSays.loading = now;
      Object.assign(building, { work: 0, wait: 0, breaths: 0, since: now, stages: [] });
    } else if (gameSays.loading) {
      building.work += now - building.since;
      const how = [Math.round(now - gameSays.loading), Math.round(building.work), Math.round(building.wait), building.breaths];
      if (frames.loads.length < 8) {
        frames.loads.push(how[0]);
        frames.how.push(how.slice(1));
      }
      building.done?.({ ms: how[0], work: how[1], wait: how[2], breaths: how[3], stages: building.stages });
    }
    document.body.classList.toggle("loading", words[1] === "1");
    stepWhenReady();
  }
  else if (words[0] === "L8OVER") document.body.classList.toggle("over", words[1] === "1");
  else if (words[0] === "L8SAY") say(Number(words[1]), words.slice(2).join(" "));
  else if (words[0] === "L8HITS") lessonHits = words.slice(1).map((w) => w.split(":").map(Number)).map(([kind, item, flips, halves, grab, short]) => ({ kind, item, flips, halves, grab: !!grab, short: !!short }));
  else if (words[0] === "L8HANDS") hands = Number(words[1]);
  else if (words[0] === "L8RIDE") {
    // What he is doing: riding (0), at the end of a run (1), or watching
    // one, his own (2) or someone's (3). The thumb panels show only while
    // he rides; a run being watched has a button to go back from it, and
    // one of someone's ends back on the sheet it was picked from.
    const ride = Number(words[1]);
    document.body.classList.toggle("done", ride === 1);
    document.body.classList.toggle("watching", ride === 4);
    syncSteps();
    // (A lesson ridden to its end: a word on how it went.)
    if (ride === 1 && isLesson(placeNow) && !document.body.classList.contains("watching")) sayVerdict();
    if (ride !== 1) {
      verdict = "";
      if (teach.kind === 4) teach = { kind: 0, text: "", ok: false };
    }
    if (ride === 1) onwardWord = isLesson(placeNow) ? (placeNow - TUTORIAL < LESSONS.length ? "Next lesson" : "All lessons") : "Daily slopestyle";
    const replaying = ride === 2 || ride === 3;
    document.body.classList.toggle("replaying", replaying);
    // A run being watched is a page: come to by the game's own key, it
    // is noted; and over, it is left, for the page before it.
    if (replaying && pageNow() !== "watch" && !sheetOpen()) {
      trail.push(["watch"]);
      shownLength = trail.length;
    }
    if (!replaying && pageNow() === "watch") {
      trail.pop();
      present();
    }
  }
  else if (words[0] === "L8REPLAY") postRun(Number(words[1]), Number(words[2]), Number(words[3]), words.slice(4).join(" "));
  else if (words[0] === "L8COURSE") {
    placeNow = Number(words[1]);
    if (placeNow === headed) headed = null;
    tellBest();
    document.body.classList.toggle("park", placeNow < 0);
    document.body.classList.toggle("tutorial", inTutorial(placeNow));
    stepWhenReady();
    if (!inTutorial(placeNow)) {
      store("skate.course", placeNow);
      store("skate.tutorial", true);
    }
  } else if (words[0] === "L8FINISH") {
    const [id, score] = [Number(words[1]), Number(words[2])];
    if (score > 0) noteRun(id, score);
  } else return false;
  return true;
};

// ---- what is pressed ----
// Each thing that can be pressed is named by what it does (see the sheets,
// below): the game says the name (L8TAP), and here it is done. The things
// over the game have names of their own (see ui_chrome.l8).
const onTap = (name) => {
  const [what, ...rest] = name.split(":");
  const arg = rest.join(":");
  if (what === "back") goBack();
  else if (what === "home") goHome();
  else if (what === "look") {
    setNight(!document.body.classList.contains("night"));
    typeKeys([108]);
  } else if (what === "stats") toggleStats?.();
  // (A lesson's steps; a run to watch is "watch" and whose.)
  else if ((what === "read" || what === "watch" || what === "try") && rest.length === 0) takeStep(what);
  else if (what === "replay") {
    document.body.classList.remove("over");
    go("watch");
    typeKeys([112]);
  } else if (what === "again") {
    // (Riding it again, from the top: the game's R.)
    document.body.classList.remove("over");
    typeKeys([114]);
  } else if (what === "onward") onward();
  else if (what === "go") {
    const [page, of] = [rest[0], rest.slice(1).join(":")];
    if (page === "lessons") go("lessons");
    else if (page === "places" || page === "days") go(page, of);
    else if (page === "place") go("place", Number(of));
    else if (page === "lesson") go("lesson", Number(of));
    else if (page === "person") go("person", of);
  } else if (what === "random") go("place", randomPlace(arg));
  else if (what === "me") {
    if (account) go("person", account.name);
  } else if (what === "play") goTo(placeOf);
  else if (what === "who") {
    store("skate.who", (tabWho = arg));
    showPage();
  } else if (what === "what") {
    tabWhat = arg;
    showPage();
  } else if (what === "pwhat") {
    personWhat = arg;
    showPage();
  } else if (what === "month") {
    const by = Number(arg);
    const [y, m] = [Math.floor(calendarMonth / 100), calendarMonth % 100];
    calendarMonth = m + by < 1 ? (y - 1) * 100 + 12 : m + by > 12 ? (y + 1) * 100 + 1 : y * 100 + m + by;
    showPage();
  } else if (what === "watch") watchRun(rest[0], Number(rest[1]));
};
let toggleStats = null;

// ---- the sheets ----
// Each sheet as the game is to show it (see programs/skate/ui_page.l8):
// where it goes (in the middle; or docked, at the bottom of a tall screen
// and at the right of a wide one, with the game behind it), how wide it may
// be, how much room it leaves below it, and its blocks, a line each.
//
// A run, as a row: what pressing it does (if anything), whether it is his,
// and its cells, each a kind, what pressing it does, and its words.
const row = (tap, mine, ...cells) => ["row", tap, mine ? 1 : 0, ...cells.flat()];
// (A best run can be watched, if this game can still play it.)
const watchCell = (run, id) => (run.version === gameVersion ? [["watch", `watch:${run.id}:${id}`, ""]] : []);
const nameCell = (run) => ["who", `go:person:${run.name}`, run.name];
const BELOW = touch ? 66 : 58;
// A list of runs has room for a few, however few it has, so that the sheet
// keeps its shape (and its tabs their place) from one list to the next.
const LIST_ROWS = 4;
const listRoom = (rows) => ["gap", Math.max(0, LIST_ROWS - Math.max(rows.length, 0.6)) * (touch ? 46 : 42)];

// What those he sees have been riding, newest first.
const feed = () =>
  Object.entries(account?.recent ?? {})
    .flatMap(([course, list]) => list.map((run) => ({ ...run, course: Number(course) })))
    .sort((a, b) => b.at - a.at);
// Someone's best on each place they have ridden: the day's first, then the
// courses, the parks, and days gone by.
const placeRank = (id) => {
  const n = Math.abs(id);
  const park = id < 0 ? 0.5 : 0;
  if (isDaily(id)) return n === today() ? park : 1e8 - n + park;
  if (isBigAir(id)) return 2000 + id - BIG_AIR;
  return (id < 0 ? 1000 : 10) + n;
};
const bestsOf = (name) =>
  Object.entries(account?.courses ?? {})
    .flatMap(([course, list]) => list.filter((run) => run.name === name && current(run)).map((run) => ({ ...run, course: Number(course) })))
    .sort((a, b) => placeRank(a.course) - placeRank(b.course));

// Home: what to play, who he is (if someone: see `linked`), and what those
// he sees have been riding. A run there goes to its place; its rider's
// name, to them. (For someone, even with nothing ridden yet, the feed's
// space is kept, a few runs high, so that home keeps its shape.)
const FEED = 30;
const showMenu = () => {
  const fresh = !stored("skate.tutorial", false) && !stored("skate.course", 0);
  const blocks = [["title", "", "Home"]];
  if (mySecret) blocks.push(["me", "me", account?.name ?? "You"]);
  blocks.push(["item", "go:lessons", "Tutorial", fresh ? "Start here" : "", fresh ? "first" : "plain"]);
  blocks.push(["item", "go:places:courses", "Slopestyle", "", "plain"]);
  blocks.push(["item", "go:places:parks", "Park", "", "plain"]);
  // (One big air is enough.)
  blocks.push(["item", `go:place:${BIG_AIR + 1}`, "Big air", "", "plain"]);
  if (mySecret) {
    blocks.push(["head", "Activity"], ["feed", 4]);
    const runs = feed().slice(0, FEED);
    if (account && runs.length === 0) blocks.push(["empty", "No runs yet"]);
    for (const run of runs) blocks.push(row(`go:place:${run.course}`, run.name === account?.name, nameCell(run), ["what", "", placeName(run.course)], ["score", "", run.score], ["when", "", ago(run.at)]));
    blocks.push(["/feed"]);
  }
  return { wide: 520, blocks };
};

// The tutorial's lessons, each to its word before it is watched (or to be
// taken up again, done or not). The first not yet done is the one to take
// next: marked so.
const showLessons = () => {
  const next = LESSONS.findIndex((_, i) => !lessonsDone[i + 1]) + 1;
  const blocks = [["title", "", "Tutorial"], ["para", "Six short lessons. Each shows you a run, then it's your turn. Take them in order, or pick one.", "dim"], ["gap", 4]];
  LESSONS.forEach((lesson, i) => {
    const done = !!lessonsDone[i + 1];
    blocks.push(["item", `go:lesson:${i + 1}`, `${i + 1}. ${lesson.title}`, done ? "" : i + 1 === next ? "Next" : "", done ? "done" : i + 1 === next ? "first" : "plain"]);
  });
  return { wide: 440, blocks };
};
let lessonOf = 1;
// A lesson's word: on a sheet docked clear of its stretch of course, which
// lies behind it as he will ride it, and above its steps.
const showLesson = () => {
  const lesson = LESSONS[lessonOf - 1];
  return {
    place: "dock",
    wide: 440,
    below: touch ? 86 : 78,
    blocks: [["title", `LESSON ${lessonOf} OF ${LESSONS.length}`, lesson.title], ["para", touch ? lesson.thumbs : lesson.keys], ["box", "SCORING", lesson.scoring]],
  };
};

// The places to pick from: the slopestyles or the parks, the day's first
// (with how long it is open for), the days gone by, and one at random.
let picking = "courses";
const showPlaces = () => {
  const kind = picking;
  const sign = kind === "parks" ? -1 : 1;
  const blocks = [["title", "", { courses: "Slopestyle", parks: "Park" }[kind]]];
  blocks.push(["card", `go:place:${sign * today()}`, `Daily ${kind === "parks" ? "park" : "slopestyle"}`, `${leftText(dayLeft())} left`, 1, "daily"]);
  blocks.push(["card", `go:days:${kind}`, "Past days", "", 1, "past"]);
  for (let n = 1; n <= PLACES; n++) blocks.push(["card", `go:place:${sign * n}`, placeName(sign * n), "", 0, "plain"]);
  blocks.push(["card", `random:${kind}`, "Random", "", 0, "plain"]);
  return { wide: 440, blocks };
};

// The days gone by, of slopestyles or of parks: a calendar, a month at a
// time, with every day since the first (up to yesterday) to pick from.
// Their boards stand for good, but a run on them is not posted, the day
// being over (see postable).
let calendarMonth = null;
const showDays = () => {
  const sign = picking === "parks" ? -1 : 1;
  const first = FIRST_DAY;
  const last = dayAgo(1);
  const now = today();
  const monthOf = (n) => Math.floor(n / 100);
  if (calendarMonth === null || calendarMonth > monthOf(now) || calendarMonth < monthOf(first)) calendarMonth = monthOf(last);
  const [y, m] = [Math.floor(calendarMonth / 100), calendarMonth % 100];
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  const blocks = [["title", "", `Past ${picking === "parks" ? "parks" : "slopestyles"}`], ["month", calendarMonth > monthOf(first) ? "month:-1" : "", label, calendarMonth < monthOf(now) ? "month:1" : ""]];
  const start = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let i = 0; i < start; i++) blocks.push(["day", "", "", "blank"]);
  for (let d = 1; d <= days; d++) {
    const n = calendarMonth * 100 + d;
    const on = n >= first && n <= last;
    blocks.push(["day", on ? `go:place:${sign * n}` : "", d, n === now ? "today" : on ? "on" : "off"]);
  }
  return { wide: 380, blocks };
};

// A place, before he rides it. The game goes there and shows it off behind
// the sheet (see fly_over, in programs/skate/main.l8); the sheet has a
// button to ride it, and its scores: everyone's he sees (if he is someone,
// and it is a place scores are kept of), or his own (as the leaderboards
// have them, there; else as kept on this device); either the best (of
// everyone's, one each, with the run to watch) or the latest. A rider's
// name there goes to them.
let placeOf = 0;
let tabWho = stored("skate.who", null);
let tabWhat = "best";
const showPlace = () => {
  const id = placeOf;
  const blocks = [["title", "", placeName(id), "play", "Play"]];
  // A day's place: how long it is open for, or that it is over.
  if (isDaily(id)) blocks.push(["note", Math.abs(id) === today() ? `Open for ${leftText(dayLeft())} more` : "This day is over: runs here are not posted", "gold"]);
  // Whose: everyone's (until he picks), or his own.
  const shared = !!account && boarded(id);
  const who = shared && tabWho !== "me" ? "all" : "me";
  if (shared) blocks.push(["tabs", who === "all" ? 0 : 1, "who:all", "Everyone", "who:me", "You"]);
  blocks.push(["tabs", tabWhat === "best" ? 0 : 1, "what:best", "Best", "what:recent", "Recent"]);
  // (The runs scroll under the rest, which stays put.)
  blocks.push(["scroll"]);
  // The runs: a score each, and whose or when.
  const best = tabWhat === "best";
  let rows = [];
  if (who === "me") {
    // His own. Where the leaderboards keep this place's, as they have
    // them: what he sees of himself is then what others see of him, on
    // whichever device he rides, and nothing ridden before the device had
    // his link is among them. (His best there can be watched; the rest of
    // the best are of his latest.) Otherwise, as this device has them.
    let runs = (myRuns[id]?.[tabWhat] ?? []).map(([score, at]) => ({ score, at }));
    if (shared) {
      runs = recentOn(id).filter((run) => run.name === account.name);
      if (best) {
        const top = bestsOn(id).find((run) => run.id === account.id);
        const rest = runs.filter((run) => current(run) && !(top && run.at === top.at && run.score === top.score));
        runs = [...(top ? [{ ...top, top: true }] : []), ...rest].sort((a, b) => b.score - a.score || a.at - b.at);
      }
    }
    rows = runs.map((run, i) => row("", false, ...(best ? [["n", "", `${i + 1}.`]] : []), ["what", "", ago(run.at)], ["score", "", run.score], ...(run.top ? watchCell(run, id) : [])));
  } else if (best) rows = bestsOn(id).map((run, i) => row("", run.name === account?.name, ["n", "", `${i + 1}.`], nameCell(run), ["score", "", run.score], ...watchCell(run, id)));
  else rows = recentOn(id).map((run) => row("", run.name === account?.name, nameCell(run), ["when", "", ago(run.at)], ["score", "", run.score]));
  blocks.push(["gap", 4], ...(rows.length ? rows : [["empty", "No runs yet"]]), listRoom(rows));
  return { place: "dock", wide: 440, blocks };
};

// A person (himself, from home; or anyone he sees, by their name on a
// run): their best on each place they have ridden, each to watch, or their
// latest runs. A run goes to its place.
let personOf = "";
let personWhat = "best";
const showPerson = () => {
  const name = personOf;
  const blocks = [["title", "", name], ["tabs", personWhat === "best" ? 0 : 1, "pwhat:best", "Best", "pwhat:recent", "Recent"], ["scroll"], ["gap", 4]];
  const runs = personWhat === "best" ? bestsOf(name) : feed().filter((run) => run.name === name);
  const rows = runs.map((run) => row(`go:place:${run.course}`, false, ["what", "", placeName(run.course)], ...(personWhat === "best" ? [["score", "", run.score], ...watchCell(run, run.course)] : [["when", "", ago(run.at)], ["score", "", run.score]])));
  blocks.push(...(rows.length ? rows : [["empty", "No runs yet"]]), listRoom(rows));
  return { wide: 440, blocks };
};

// The sheet up (or none), told to the game: the same sheet again (its
// scores have come, say) as it is, in place; another, coming the way he
// went (motion).
const SHOW = { menu: showMenu, lessons: showLessons, lesson: showLesson, places: showPlaces, days: showDays, place: showPlace, person: showPerson };
const showPage = (motion = "swap") => {
  const id = sheetNow();
  if (!id) {
    uiSay("page", "none", motion, "none", 440, BELOW);
    uiSay("end");
    return;
  }
  const sheet = SHOW[id]();
  uiSay("page", `${id}:${trail.at(-1)[1] ?? ""}`, motion, sheet.place ?? "center", sheet.wide ?? 440, sheet.below ?? BELOW);
  for (const block of sheet.blocks) uiSay(...block);
  uiSay("end");
};
// (A day's place says how long it is open for: told again each minute.)
setInterval(() => {
  if (sheetNow() === "places" || (sheetNow() === "place" && isDaily(placeOf))) showPage();
}, 15000);

// What is over the game, as it is now (see programs/skate/ui_chrome.l8):
// told each frame, but only what has changed.
let overlayWord = "";
let statsWords = "";
let statsRoom = "";
let statsOn = false;
const HELP = "Arrows steer · hold Space, tap arrows, let go to jump · Space in the air grabs · R restart · H home";
const syncChrome = () => {
  const body = document.body.classList;
  const sheet = sheetOpen();
  const tutorial = body.contains("tutorial");
  const replaying = body.contains("replaying");
  const lesson = lessonNow() !== 0;
  chrome("back", trail.length > 1);
  chrome("look", true);
  chrome("night", body.contains("night"));
  chrome("stats", true, statsOn, statsWords, statsRoom);
  chrome("steps", lesson, ["read", "watch", "try"].indexOf(stepAt()), body.contains("nudge"));
  chrome("ends", body.contains("over") && !sheet && !replaying, !tutorial, !tutorial, tutorial ? onwardWord : "", lesson);
  // (Of the tutorial's words, only how a lesson went: nothing is said over
  // the course as he rides it himself.)
  chrome("teach", sheet || teach.kind !== 4 ? 0 : 4, teach.text, teach.ok);
  chrome("caps", !touch && !sheet && teach.kind === 1, hands);
  chrome("pads", touch && !sheet && !replaying && !body.contains("done"), body.contains("watching"));
  // (Under a sheet, that a place is loading matters only where the sheet
  // shows the place off: there, out of the way at the bottom.)
  chrome("load", sheet ? (sheetNow() === "place" ? 2 : 0) : 1);
  chrome("overlay", overlayWord);
  // (The keys' help, where there is room for it along the top.)
  chrome("help", !touch && !sheet && !lesson && innerWidth >= 760, HELP);
};

// Where the game starts: the place he was last at (an earlier day's
// becoming today's; and for someone new, the tutorial).
const startPlace = () => {
  const last = stored("skate.course", 0) || 0;
  const start = last === 0 && !stored("skate.tutorial", false) ? TUTORIAL + 1 : last || 1;
  return isDaily(start) ? Math.sign(start) * today() : start;
};
// A sheet's contents, as they now are (its scores have come).
const showOpen = () => showPage();
// ?diag: find out why places build slowly on this device, and say so, on
// the page and to the leaderboards' reports. It times a small loop of
// arithmetic in WebAssembly, cold and again (which shows whether the
// browser is compiling WebAssembly at all, or only interpreting it: some
// thirty times slower); then has the game build three places, and says of
// each how long the game worked, how long its breaths took, and what the
// game says of each stage.
const loopModule = () => {
  // (func (param n i32) (result f64): a = a * 1.0000001 + i, n times.)
  const k = [...new Uint8Array(new Float64Array([1.0000001]).buffer)];
  const body = [2, 1, 0x7f, 1, 0x7c, 0x02, 0x40, 0x03, 0x40, 0x20, 1, 0x20, 0, 0x4f, 0x0d, 1, 0x20, 2, 0x44, ...k, 0xa2, 0x20, 1, 0xb8, 0xa0, 0x21, 2, 0x20, 1, 0x41, 1, 0x6a, 0x21, 1, 0x0c, 0, 0x0b, 0x0b, 0x20, 2, 0x0b];
  return new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, 1, 6, 1, 0x60, 1, 0x7f, 1, 0x7c, 3, 2, 1, 0, 7, 7, 1, 3, 0x72, 0x75, 0x6e, 0, 0, 10, body.length + 2, 1, body.length, ...body]);
};
const diagnose = async (platform) => {
  const out = document.createElement("pre");
  out.style.cssText = "position:fixed;left:8px;right:8px;top:60px;z-index:9;margin:0;padding:10px;border-radius:10px;background:rgba(8,10,16,0.92);color:#fff8ec;font:12px/1.45 ui-monospace,monospace;white-space:pre-wrap;pointer-events:none";
  document.body.append(out);
  const found = { why: "diag", agent: navigator.userAgent.slice(0, 160), secure: isSecureContext, at: location.origin };
  const say = (line) => (out.textContent += `${line}\n`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  say("diagnosing: leave this open for half a minute");
  say(`${location.origin} (${isSecureContext ? "a secure context" : "NOT a secure context"})`);
  // (What might tell one kind of tab from another: whether this browser
  // has been here before, as its storage says, and how much it may keep,
  // which a private tab is given far less of.)
  try {
    found.visits = Number(localStorage.getItem("skate.diag") || 0) + 1;
    localStorage.setItem("skate.diag", String(found.visits));
    found.keys = localStorage.length;
    found.quota = Math.round(((await navigator.storage?.estimate?.())?.quota ?? 0) / 1e6);
    say(`visit ${found.visits} of this probe here; ${found.keys} things kept; may keep ${found.quota} MB`);
  } catch (e) {
    found.storage = String(e).slice(0, 80);
    say(`storage: ${found.storage}`);
  }
  try {
    // The loop, in one long call (as a build is: long loops in few
    // calls), four times; then in many short calls.
    const t0 = performance.now();
    const { instance } = await WebAssembly.instantiate(loopModule());
    const run = instance.exports.run;
    found.compile = Math.round(performance.now() - t0);
    found.long = [];
    for (let i = 0; i < 4; i++) {
      const t = performance.now();
      run(20000000);
      found.long.push(Math.round(performance.now() - t));
      await sleep(30);
    }
    const t = performance.now();
    for (let i = 0; i < 20000; i++) run(1000);
    found.short = Math.round(performance.now() - t);
    say(`loop of 20M, one call, four times: ${found.long.join(", ")} ms`);
    say(`the same work in 20000 calls: ${found.short} ms`);
    say(found.long[3] > 400 ? "=> WebAssembly is NOT being compiled here (interpreted)" : "=> WebAssembly is compiled here");
  } catch (e) {
    found.loopError = String(e).slice(0, 120);
    say(`loop failed: ${found.loopError}`);
  }
  // The game's own builds: the first (as the page came up), and three more.
  const built = () => new Promise((resolve) => (building.done = resolve));
  const ready = async () => {
    while (!gameDrawn || document.body.classList.contains("loading")) await sleep(100);
  };
  await ready();
  found.boot = frames.boot;
  found.builds = [];
  for (const id of [4, 5, 4]) {
    await sleep(600);
    const done = built();
    typePlace(id);
    const b = await done;
    await ready();
    found.builds.push([b.ms, b.work, b.wait, b.breaths, b.stages.join("; ")]);
    say(`place ${id}: ${b.ms} ms = game ${b.work} + breaths ${b.wait} (${b.breaths})`);
    if (b.stages.length) say(`  ${b.stages.join(", ")}`);
  }
  building.done = null;
  const slow = found.builds.at(-1);
  if (slow) say(slow[1] > 4 * slow[2] ? "=> the time is the game's own work" : slow[2] > 4 * slow[1] ? "=> the time is in the breaths between" : "=> the time is in both");
  // (And an ordinary frame's work, over a couple of seconds of them.)
  const [w0, f0] = [platform.workMs(), platform.frames()];
  await sleep(2000);
  found.frame = Math.round(((platform.workMs() - w0) / Math.max(1, platform.frames() - f0)) * 100) / 100;
  say(`the game's work in a frame: ${found.frame} ms`);
  report("perf", found);
  say("sent. thanks!");
};

async function main() {
  const params = new URLSearchParams(location.search);
  // Nothing here waits for anyone's scores, or for the game: the menu
  // is up at once (?play goes straight in), with the scores as they were
  // last time, and what he picks from it before the game has loaded is
  // where the game starts.
  if (!params.has("L8_SEED")) placeNow = startPlace();
  // (Home; or with ?play, riding where he last was.)
  if (params.has("play")) trail.push(["ride", placeNow]);
  present();
  // (Opened by his link: who he is, once the leaderboards say.)
  if (linked) {
    loadMe().then((ok) => {
      if (ok) toast(`Playing as ${account.name}`);
      showOpen();
    });
  }
  const module = await WebAssembly.compileStreaming(fetch("skate.wasm"));
  const fs = new MemFS({});
  const decoder = new TextDecoder();
  // (What it writes comes in pieces: a line at a time from here.)
  let written = "";
  fs.onOutput = (_fd, data) => {
    written += decoder.decode(data);
    const lines = written.split("\n");
    written = lines.pop();
    for (const line of lines) {
      if (!line.trim() || gameSays(line)) continue;
      // (The game's word on a stage of a build: "stage mesh ms: 260".)
      const stage = line.match(/^stage (.+) ms: (\d+)/);
      if (stage) building.stages.push(`${stage[1]} ${stage[2]}`);
      console.log(line.trimEnd());
    }
  };
  const sys = fs.sys(["skate"]);
  // L8_ parameters are also the game's environment (as L8_SEED=n, L8_PARK=1).
  // (And night or day, as it is by now: he may have changed it already.)
  const night = document.body.classList.contains("night");
  if (night && (!startNight || !params.has("L8_LOOK"))) params.set("L8_LOOK", "n");
  if (!night && startNight) params.delete("L8_LOOK");
  // The game loads the place picked from the menu already, or else the
  // one he was last at.
  const start = wanted ?? startPlace();
  if (wanted !== null || !params.has("L8_SEED")) {
    if (wanted !== null) params.delete("L8_PARK");
    params.set("L8_SEED", String(Math.abs(start)));
    if (start < 0) params.set("L8_PARK", "1");
  }
  if (touch) params.set("L8_TOUCH", "1");
  // (On a page: the game stops for frames while it builds a place, and
  // leaves it to the page to show that it is loading. See L8LOAD.)
  params.set("L8_PAGE", "1");
  // (?diag has the game say how long each stage of a build takes.)
  if (params.has("diag")) params.set("L8_TRACE", "1");
  sys.env = [...params].filter(([k]) => k.startsWith("L8_")).map(([k, v]) => `${k}=${v}`);
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const zoom = Math.min(4, Math.max(0.25, Number(params.get("zoom")) || 0.85));
  const scale = params.has("scale") ? Math.min(1, Math.max(0.25, Number(params.get("scale")) || 1)) : 1;
  const platform = createPlatform(canvas, { log: (text) => console.warn(text), checkErrors: params.has("glcheck"), scale: 1, zoom, env, pointers: true, hover: true, wheel: true, maxTall: 2.4,
    // A phone's screen has far more pixels than the block game's budget,
    // and its GPU to spare: render nearer its own resolution.
    maxPixels: 2.2e6,
    // ?gputime times the frame's parts on the GPU (l8Game.glTiming().gpu);
    // ?skip=prog3 drops a program's draws, to measure what they cost.
    // Edges are smoothed (several samples to a pixel), which shows most
    // where the picture has been made small; ?aa=0 leaves that out.
    antialias: params.get("aa") !== "0",
    timing: params.has("gputime") || params.has("probe"), gpuTiming: params.has("gputime") || params.has("probe"), countCalls: params.has("glstats"),
    skip: new Set((params.get("skip") ?? "").split(",").filter(Boolean)),
    // Fragments are shaded at medium precision, which a phone's GPU does
    // far faster (the shaders keep full precision where it shows: see HP
    // in programs/skate/render.l8); ?precision=highp to compare.
    fragmentPrecision: params.get("precision") === "highp" ? "highp" : "mediump" });
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyL" && !e.repeat) setNight(!document.body.classList.contains("night"));
    if ((e.code === "KeyH" || e.code === "KeyM") && !e.repeat) goHome();
  });
  // While a sheet is up the game is held, and takes only the keys that work
  // the sheet (the arrows, Tab, Enter, and Space: see ui_key, in ui.l8),
  // and L.
  const SHEET_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Enter", "Space", "KeyL"]);
  for (const name of ["keydown", "keyup"]) {
    addEventListener(name, (e) => {
      if (sheetOpen() && !SHEET_KEYS.has(e.code) && e.code !== "Escape" && !e.ctrlKey && !e.metaKey) {
        e.stopPropagation();
        if (e.code !== "F5" && e.code !== "F11" && e.code !== "F12") e.preventDefault();
      }
      if (sheetOpen() && e.code === "Tab") e.preventDefault();
    }, { capture: true });
  }
  window.l8Game = platform;
  // What the game is told of the window (see ui.l8): its size in CSS pixels
  // and the canvas's own, the edges a phone keeps for itself (as far as
  // they fall on the canvas), and whether it is a touch screen. Told
  // before it starts (in the file it reads first), and whenever it changes.
  const safe = document.getElementById("safe");
  const sendView = () => {
    const r = canvas.getBoundingClientRect();
    const s = getComputedStyle(safe);
    const inset = (side, from) => Math.max(0, (parseFloat(s[`padding${side}`]) || 0) - from);
    uiSay("view", r.width, r.height, canvas.width, canvas.height, inset("Top", r.top), inset("Right", innerWidth - r.right), inset("Bottom", innerHeight - r.bottom), inset("Left", r.left), touch, ...platform.windowSize());
  };
  platform.layout();
  sendView();
  new ResizeObserver(sendView).observe(canvas);
  addEventListener("resize", sendView);
  present();
  syncChrome();
  fs.writeFile("ui.txt", uiLines.join("\n") + "\n");
  uiLines = [];
  gameFs = fs;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  sendKey = platform.key;
  // (The game is held behind a sheet that is up: see holdGame.)
  present();
  // (Picked while the game was starting somewhere else.)
  if (wanted !== null && wanted !== placeNow) visit(wanted);
  wanted = null;
  canvas.focus();
  canvas.addEventListener("focus", () => (overlayWord = ""));
  canvas.addEventListener("blur", () => {
    if (!touch && !sheetOpen()) overlayWord = "Click to continue";
  });
  addEventListener("pointerdown", () => {
    canvas.focus();
    overlayWord = "";
  });
  // ?control lets web/control.py drive the page (see ../game/control.js).
  if (params.has("control")) {
    const session = Math.random().toString(36).slice(2, 10);
    const post = (kind, data) =>
      fetch("/telemetry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session, kind, t: Date.now(), ...data }) });
    startControl(platform, { session, post, reportNow: () => null });
  }
  // The game pauses at the end of each frame, until the next. While it is
  // building a place it pauses without having drawn one, only to let the
  // page breathe (see programs/skate/breathe.l8): then it goes straight
  // on, after whatever the page has waiting.
  const breath = new MessageChannel();
  const breathed = () =>
    new Promise((resolve) => {
      breath.port1.onmessage = resolve;
      breath.port2.postMessage(0);
    });
  // The picture is kept to what the device can draw in time (see pace.js):
  // a frame every beat of its screen (every second one, on a screen too
  // fast for that to be worth it), at as fine a picture as that leaves
  // room for, down to a quarter of the size; below that, fewer frames
  // first. Its rungs, from the best: the picture's size, each a little
  // smaller than the last, down to half; then at half with its surfaces
  // colored plainly too (see shade_plain, in the game's render.l8); and
  // so, smaller still by larger steps, down to a tenth. Where it got to
  // (and the frames it found it could aim at) is where the next time
  // starts. ?scale= fixes the size instead.
  const RUNGS = [
    ...[1, 0.92, 0.85, 0.78, 0.72, 0.66, 0.61, 0.56, 0.5].map((size) => ({ size, plain: false })),
    ...[0.5, 0.42, 0.36, 0.31, 0.26, 0.22, 0.19, 0.16, 0.14, 0.12, 0.1].map((size) => ({ size, plain: true })),
  ];
  // The picture's size, of the screen's each way. Riding, down to half the
  // whole of it is made smaller, and the browser stretches it; below that
  // it stays at half, and the game draws its scene smaller within it (see
  // render_scale, in render.l8), so that its words can still be read. With
  // a sheet up, the whole stays at its full size, the sheet as sharp as it
  // can be, and the place behind it, a backdrop that shows through the
  // sheet blurred, is drawn a little smaller (and no larger than riding
  // has it).
  const SIZE_LEAST = 0.1, WHOLE_LEAST = 0.5, SHEET_SIZE = 0.8;
  // The smallest picture tried before fewer frames are: the last rung of
  // a quarter of the size or more.
  const FLOOR = RUNGS.map((r) => r.size >= 0.25).lastIndexOf(true);
  let size = 1;
  let scaleSaid = 0;
  const setSize = (k) => {
    size = Math.min(1, Math.max(SIZE_LEAST, k));
    sayScale();
  };
  sayScale = () => {
    const sheet = sheetOpen();
    const whole = sheet ? 1 : Math.max(size, WHOLE_LEAST);
    const scene = Math.max(1, Math.round((sheet ? Math.min(size, SHEET_SIZE) : size / whole) * 100));
    if (whole !== platform.scale()) {
      platform.setScale(whole);
      // (The game draws its scene by the canvas's pixels: see sendView.)
      sendView();
    }
    if (scene !== scaleSaid) {
      scaleSaid = scene;
      typeKeys([70000 + scene]);
    }
  };
  let plain = false;
  const setPlain = (on) => {
    plain = on;
    typeKeys([on ? 65479 : 65480]);
  };
  const pace = { on: !params.has("scale"), last: 0, quiet: 0 };
  // (What each asks of the device: its pixels, and plainly a little less.)
  const WORK = RUNGS.map((r) => r.size * r.size * (r.plain ? 0.85 : 1));
  const pacer = createPacer({ work: WORK, floor: FLOOR, rung: stored("skate.rung", 0) || 0, beats: stored("skate.beats", 1) || 1 });
  // The picture as a rung has it.
  const toRung = (r) => {
    setSize(RUNGS[r].size);
    if (RUNGS[r].plain !== plain) setPlain(RUNGS[r].plain);
  };
  if (params.has("scale")) setSize(scale);
  else toRung(pacer.state.rung);

  // How the frames come, top right, if he asks to see it: the button
  // widens into the stats (see put_stats, in ui_chrome.l8), counted over
  // each half second: the frames a second the game aims at (the screen's,
  // or every second or third of them), the picture's size, the frames late
  // over the last half second, and that the device is saving its battery
  // (if it is).
  const rate = { frames: 0, late: 0, since: performance.now() };
  const showStats = () => {
    const s = pacer.state;
    const hz = Math.round(1000 / s.beat);
    statsWords = `${Math.round(hz / (pace.on ? s.beats : 1))} fps · ${Math.round(size * 100)}%${plain ? " plain" : ""} · ${rate.late} late${lowPower() ? " · low power" : ""}`;
    // (And the same with each number as wide as it can be, which the pill is
    // as wide as: a number changing moves nothing.)
    statsRoom = `000 fps · 000%${plain ? " plain" : ""} · 00 late${lowPower() ? " · low power" : ""}`;
  };
  // Whether the device is saving its battery, as far as can be told: the
  // browser gives far fewer frames than sixty a second even to a game that
  // draws nothing (a phone in Low Power Mode gives thirty).
  const lowPower = () => 1000 / pacer.state.beat < 50;
  // (Shown, or not, as it was last time.)
  statsOn = !!stored("skate.fps", false);
  showStats();
  toggleStats = () => {
    showStats();
    statsOn = !statsOn;
    store("skate.fps", statsOn);
  };

  frameState = () => ({
    refresh: Math.round(1000 / pacer.state.beat),
    scale: Math.round(size * 100) / 100,
    plain,
    low: lowPower(),
    pacing: pace.on,
    // (What the pacing is at: its rung, the beats to a frame it aims at,
    // the share of frames late whatever is drawn, and how long it waits to
    // try a rung up.)
    rung: pacer.state.rung,
    beats: pacer.state.beats,
    base: Math.round(pacer.state.base * 1000) / 1000,
    hold: Math.round(pacer.state.hold / 1000),
  });
  frameWork = () => [platform.frames(), platform.workMs()];
  // ?probe: a test of what a frame's time goes on, on this device. Once he
  // has ridden a few seconds, parts of the work are left out, each for a
  // moment, and the picture drawn smaller for one, the frames timed through
  // each; and the leaderboards' worker is told what each came to (see
  // report): the milliseconds a frame took, and of them the game's own
  // work. The picture flickers while it runs: it is for finding out why
  // the game is slow somewhere, and is asked for by its link.
  // Each: its name, the draws left out (see setSkip), the part of coloring
  // the world's pixels left out (see shade_less, in render.l8: F9 goes on
  // to the next, and round), and whether surfaces are colored plainly.
  const PROBES = [["base", [], 0], ["noShadows", [], 1], ["noTone", [], 2], ["noStuff", [], 3], ["noHaze", [], 4], ["noShine", [], 5], ["plain", [], 6], ["again", [], 0],
    ["shadow", ["part:shadow"], 0], ["world", ["part:world", "part:sky"], 0], ["grass", ["part:grass"], 0], ["nothing", ["all"], 0], ["small", [], 0], ["plainer", [], 0, true], ["last", [], 0]];
  const SHADES = 7;
  const probe = params.has("probe") ? { at: -1, since: 0, n: 0, ms: 0, drawn: 0, work: 0, wait: 8000, scale: 1, shade: 0, got: {}, gpu0: null } : null;
  const probed = (gap, now) => {
    if (document.body.classList.contains("sheet") || document.hidden || gap > 500) return;
    if (probe.at < 0) {
      // (Not until he has been riding a while, at whatever size it settled on.)
      if ((probe.wait -= gap) > 0) return;
      pace.on = false;
      if (plain) setPlain(false);
      probe.scale = size;
      probe.at = 0;
      probe.since = now;
      probe.gpu0 = JSON.stringify(platform.glTiming().gpu);
      toast("Testing: the picture will flicker");
      return;
    }
    if (probe.at >= PROBES.length) return;
    // Each for two and a half seconds, the first second not counted.
    const into = now - probe.since;
    if (into > 1000) {
      if (probe.n === 0) [probe.drawn, probe.work] = frameWork();
      probe.n++;
      probe.ms += gap;
    }
    if (into < 2500) return;
    const [drawn, work] = frameWork();
    probe.got[PROBES[probe.at][0]] = [Math.round((probe.ms / Math.max(probe.n, 1)) * 10) / 10, Math.round(((work - probe.work) / Math.max(drawn - probe.drawn, 1)) * 10) / 10];
    // (What the graphics chip's own clock says of each part, where the
    // browser lets it be asked: milliseconds a frame, with nothing left out.)
    if (probe.at === 0) {
      const gpu0 = JSON.parse(probe.gpu0);
      probe.got.gpu = Object.fromEntries(Object.entries(platform.glTiming().gpu).map(([k, v]) => [k, Math.round(((v - (gpu0[k] ?? 0)) / Math.max(probe.n, 1)) * 10) / 10]));
    }
    probe.at++;
    Object.assign(probe, { since: now, n: 0, ms: 0 });
    const next = PROBES[probe.at] ?? ["", [], 0];
    platform.setSkip(next[1]);
    setSize(next[0] === "small" ? probe.scale * 0.7 : probe.scale);
    if (!!next[3] !== plain) setPlain(!!next[3]);
    while (probe.shade !== next[2]) {
      typeKeys([65478]);
      probe.shade = (probe.shade + 1) % SHADES;
    }
    if (probe.at < PROBES.length) return;
    reportsLeft = Math.max(reportsLeft, 1);
    report("perf", { why: "probe", probe: probe.got, ...frameState(), scale: probe.scale });
    toast("Test done, thanks");
  };
  const paced = async () => {
    await platform.nextFrame();
    let now = performance.now();
    // Aiming at a frame every second beat (or third), the beats between
    // are waited out, so that the frames come evenly rather than on
    // whichever beat each happens to make: each such wait is a beat of
    // the screen, exactly.
    const body = document.body.classList;
    if (pace.on && !body.contains("sheet") && !document.hidden) {
      for (let k = 1; k < pacer.state.beats; k++) {
        const was = now;
        await platform.nextFrame();
        now = performance.now();
        pacer.idle(now - was);
      }
    }
    if (!gameDrawn) {
      gameDrawn = true;
      frames.boot = Math.round(now);
    }
    // (What is over the game, as it is now; and all that is to be told to
    // the game, at once.)
    syncChrome();
    flushUi();
    const gap = now - pace.last;
    pace.last = now;
    rate.frames++;
    // (Late as the pacing counts it: by half a beat past what it aims at.)
    if (rate.frames > 1 && gap > (pacer.state.beats + 0.5) * pacer.state.beat && gap < 2000) rate.late++;
    if (now - rate.since >= 500) {
      showStats();
      rate.frames = 0;
      rate.late = 0;
      rate.since = now;
    }
    if (body.contains("sheet") || document.hidden) frames.skip = true;
    else frameCame(gap, pacer.state.beats * pacer.state.beat);
    if (probe) probed(gap, now);
    // (Held behind a sheet, with no place shown off, the game draws
    // nothing: the frames come at the screen's own beat.)
    if (body.contains("sheet") && !body.contains("showing")) {
      if (!body.contains("loading")) pacer.idle(gap);
      pace.quiet = now + 1500;
      return;
    }
    if (!pace.on) return;
    // (Not the frames after a pause, or the first few after a place is
    // built: those are slow whatever the device.)
    if (gap > 250 || document.hidden) pace.quiet = now + 1500;
    if (now < pace.quiet) return;
    const [was, aimed] = [pacer.state.rung, pacer.state.beats];
    const rung = pacer.frame(gap, now);
    if (rung !== was) {
      toRung(rung);
      store("skate.rung", rung);
    }
    if (pacer.state.beats !== aimed) store("skate.beats", pacer.state.beats);
  };
  if (params.has("diag")) diagnose(platform);
  const status = await runResumable(instance, async () => {
    // (The game has drawn: the page's plain ground lifts. While its first
    // place is built, it draws what is over it already: see breath_draw.)
    document.body.classList.remove("booting");
    if (!document.body.classList.contains("loading")) return paced();
    pace.quiet = performance.now() + 1500;
    frames.skip = true;
    // (Of a build: the game's work up to this breath, and the breath.)
    const paused = performance.now();
    building.work += paused - building.since;
    building.breaths++;
    await breathed();
    building.since = performance.now();
    building.wait += building.since - paused;
  });
  fault("exited", `status ${status}`);
  stopped(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  fault("stopped", e?.message ?? String(e), { stack: stackOf(e) });
  stopped(`The game stopped: ${e.message}`);
});
