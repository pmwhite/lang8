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
// (The game has stopped: it is not loading.)
const stopped = (html) => {
  document.body.classList.remove("loading");
  show(html);
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
    if (!e.target.closest?.("a, .guide, #perf")) e.preventDefault();
  }, { passive: false });
}
history.pushState({ stay: true }, "", location.href);
addEventListener("popstate", () => history.pushState({ stay: true }, "", location.href));

const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
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

// A button is tapped, not just touched: pressed, and let go still on it,
// without having moved far (a finger that moves is scrolling, or has
// thought better of it). While it is pressed it shows it, the color
// easing in (see .pressed, in index.html), so that the start of a drag,
// which begins as a press does, shows hardly at all. `accepts` says
// whether a press is the button's (as for a sheet's backdrop, which is
// only where nothing else is).
const TAP_SLOP = 10;
const onTap = (el, act, accepts = () => true) => {
  let press = null;
  const end = () => {
    press = null;
    el.classList.remove("pressed");
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.button > 0 || !accepts(e)) return;
    // (A button inside another, as a run to watch on a course's card: the
    // press is the inner one's alone.)
    e.stopPropagation();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
    el.classList.add("pressed");
    // A mouse held down is followed off the button and back (a finger
    // already is).
    if (e.pointerType === "mouse") el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) end();
  });
  el.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.id) return;
    const r = el.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    end();
    if (!inside) return;
    e.preventDefault();
    act(e);
  });
  // (The browser takes the touch for a scroll.)
  el.addEventListener("pointercancel", end);
};

// The buttons over the game: night or day (the game's L), and watching the
// run just finished again (its P), which the game says when to offer
// (L8OVER).
// (A mouse pressed on one does not take the keyboard from the game.)
for (const el of document.querySelectorAll(".look, .replay, .again, .back, .perf .key, #perf .auto")) el.addEventListener("mousedown", (e) => e.preventDefault());
onTap(document.querySelector(".look"), () => {
  setNight(!document.body.classList.contains("night"));
  typeKeys([108]);
});
onTap(document.querySelector(".replay"), () => {
  document.body.classList.remove("over");
  typeKeys([112]);
});
// (And riding it again, from the top: the game's R.)
onTap(document.querySelector(".again"), () => {
  document.body.classList.remove("over");
  typeKeys([114]);
});

// Sheets over the game: home, the guide, the places to pick from, a place,
// and a person. The game pauses (Pause, held) while any is open.
const sheets = Object.fromEntries(["menu", "guide", "places", "place", "person"].map((id) => [id, document.getElementById(id)]));
const sheetOpen = () => Object.values(sheets).some((el) => !el.hidden);
// Whether he has started riding: until then home cannot be left without
// choosing.
let started = false;
// The sheets he has come through, the one showing last: each a sheet's
// name and what it is of (a place's number, a person's name, whether the
// places are parks). Going on to another adds one; going back takes one
// off, down to the game.
const trail = [];
// (The page's buttons know of it: with a sheet open, the one that goes back
// from it takes home's place, unless there is nowhere to go back to.)
const sheetsChanged = () => {
  const open = Object.keys(sheets).find((id) => !sheets[id].hidden);
  document.body.classList.toggle("sheet", !!open);
  document.body.classList.toggle("showing", open === "place");
  document.body.classList.toggle("canback", !!open && (trail.length > 1 || started));
  syncPreview();
};
// While a place's sheet is up the game shows the place off: a key held
// tells it so (see fly_over, in programs/skate/main.l8).
let previewing = false;
const syncPreview = () => {
  const want = !sheets.place.hidden;
  if (!sendKey || want === previewing) return;
  previewing = want;
  sendKey(want ? 2 : 3, 65300, "");
};
const openSheet = (id) => {
  for (const [name, el] of Object.entries(sheets)) el.hidden = name !== id;
  sheetsChanged();
  canvas.blur();
  sendKey?.(2, 65299, "");
};
const closeSheets = () => {
  for (const el of Object.values(sheets)) el.hidden = true;
  trail.length = 0;
  started = true;
  sheetsChanged();
  overlay.hidden = true;
  sendKey?.(3, 65299);
  canvas.focus();
};
// Show the sheet he has come to (or the game, if there is none), with its
// scores as they are now when they come.
const present = () => {
  const view = trail.at(-1);
  if (!view) return closeSheets();
  const [id, of] = view;
  if (id === "places") pickingParks = of;
  if (id === "place") visit((placeOf = of));
  if (id === "person") personOf = of;
  showOpen(id);
  openSheet(id);
  loadScores().then(() => {
    if (trail.at(-1) === view) showOpen(id);
  });
};
const go = (id, of) => {
  trail.push([id, of]);
  present();
};
const goHome = () => {
  trail.length = 0;
  go("menu");
};
// A sheet is left by the button in the corner that goes back, or Escape
// (not by a tap outside it, which is too easily made by mistake).
const goBack = () => {
  // (From a replay: the game leaves it. See L8RIDE.)
  if (trail.length === 0 && document.body.classList.contains("replaying")) typeKeys([65288]);
  if (trail.length === 0 || (trail.length === 1 && !started)) return;
  trail.pop();
  present();
};
onTap(document.querySelector(".back"), goBack);
addEventListener("keydown", (e) => {
  if (e.key === "Escape") goBack();
});
onTap(document.querySelector(".how"), () => go("guide"));

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
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
};
// The day's places: the date in one time zone for everyone, so that they
// are the same for all of them, and change for all at once.
const DAILY_ZONE = "America/New_York";
const today = (at = Date.now()) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: DAILY_ZONE }).format(new Date(at)).replace(/-/g, ""));
const isDaily = (id) => Math.abs(id) >= 20000101 && Math.abs(id) <= 29991231;
const dayName = (id) => {
  const n = Math.abs(id);
  return new Date(Date.UTC(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
};
const placeName = (id) => {
  if (id === TUTORIAL) return "Tutorial";
  if (isDaily(id)) return `${id < 0 ? "Daily park" : "Daily course"}${Math.abs(id) === today() ? "" : `, ${dayName(id)}`}`;
  return `${id < 0 ? "Park" : "Course"} ${Math.abs(id)}`;
};
// (Picked before the game is up: it starts there instead. See main.)
let wanted = null;
// Where the game has been asked to go, until it says it is there.
let headed = null;
const typePlace = (id) => {
  headed = id;
  if (id === TUTORIAL) typeKeys([116]);
  else typeKeys([...String(Math.abs(id))].map((c) => 48 + Number(c)).concat(id < 0 ? 65289 : 65293));
};
// Have the game go there, the page's sheets left as they are (see
// showPlace).
const visit = (id) => {
  if (!sendKey) wanted = id;
  else if (id !== (headed ?? placeNow)) typePlace(id);
};
// Ride there: from its start, if the game is there already.
const goTo = (id) => {
  closeSheets();
  if (!sendKey) wanted = id;
  else if (id === (headed ?? placeNow)) typeKeys([114]);
  else typePlace(id);
};
const randomPlace = (park) => (park ? -1 : 1) * (PLACES + 1 + Math.floor(Math.random() * 99000));

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
let gameFs = null;
const toast = (text) => {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.classList.add("on");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("on"), 3500);
};
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
      if (!r.ok) return null;
      account = await r.json();
      accountLoaded = Date.now();
      store("skate.account", account);
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
const postable = (id) => (Math.abs(id) >= 1 && Math.abs(id) <= PLACES) || Math.abs(id) === today();
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
    await loadMe();
    // (Where a new best puts him, among those he sees.)
    const place = r.ok && body.best && account ? bestsOn(id).findIndex((e) => e.id === account.id) + 1 : 0;
    if (place > 0 && bestsOn(id).length > 1) toast(`You're #${place} on ${placeName(id)}`);
  } catch {
    toast("Couldn't post score");
  }
  showOpen();
};
// The sheets a run being watched was reached through, to go back to after.
let watchedFrom = null;
const watchRun = async (person, id) => {
  if (!sendKey) return;
  try {
    const r = await fetch(`${api}/replay?person=${person}&course=${id}`, { headers: { authorization: `Bearer ${mySecret}` } });
    const run = await r.json();
    if (!r.ok) throw new Error(run.error);
    gameFs.writeFile("watch.txt", `${run.version} ${run.course} ${run.score} ${run.name.replace(/ /g, "_")} ${run.replay}`);
    // (Going back from the run comes back to this sheet: see L8RIDE.)
    watchedFrom = trail.slice();
    closeSheets();
    typeKeys([118]);
  } catch {
    toast("Couldn't load that run");
  }
};
const gameSays = (line) => {
  const words = line.trim().split(/\s+/);
  if (words[0] === "L8VERSION") {
    gameVersion = Number(words[1]);
    // (His runs under other rules are not ones to beat under these.)
    if (stored("skate.rules", 1) !== gameVersion) {
      for (const id of Object.keys(myRuns)) delete myRuns[id];
      store("skate.runs", myRuns);
      store("skate.rules", gameVersion);
    }
    showOpen();
  }
  else if (words[0] === "L8LOAD") document.body.classList.toggle("loading", words[1] === "1");
  else if (words[0] === "L8OVER") document.body.classList.toggle("over", words[1] === "1");
  else if (words[0] === "L8RIDE") {
    // What he is doing: riding (0), at the end of a run (1), or watching
    // one, his own (2) or someone's (3). The thumb panels show only while
    // he rides; a run being watched has a button to go back from it, and
    // one of someone's ends back on the sheet it was picked from.
    const ride = Number(words[1]);
    document.body.classList.toggle("done", ride === 1);
    document.body.classList.toggle("replaying", ride >= 2);
    if (ride < 2 && watchedFrom) {
      const back = watchedFrom;
      watchedFrom = null;
      if (trail.length === 0 && back.length > 0) {
        trail.push(...back);
        present();
      }
    }
  }
  else if (words[0] === "L8REPLAY") postRun(Number(words[1]), Number(words[2]), Number(words[3]), words.slice(4).join(" "));
  else if (words[0] === "L8COURSE") {
    placeNow = Number(words[1]);
    if (placeNow === headed) headed = null;
    document.body.classList.toggle("park", placeNow < 0);
    document.body.classList.toggle("tutorial", placeNow === TUTORIAL);
    if (placeNow !== TUTORIAL) {
      store("skate.course", placeNow);
      store("skate.tutorial", true);
    }
  } else if (words[0] === "L8FINISH") {
    const [id, score] = [Number(words[1]), Number(words[2])];
    if (score > 0) noteRun(id, score);
  } else return false;
  return true;
};

// A row of tabs: one more, lit if it is the one picked; picking it shows
// the sheet again.
const addTab = (row, label, on, pick, reshow) => {
  const t = document.createElement("span");
  t.className = "tab" + (on ? " on" : "");
  t.textContent = label;
  onTap(t, () => {
    pick();
    reshow();
  });
  row.append(t);
};
// A list of runs, a row each: its cells in order, each [class, text, what
// a tap on it does (if anything)]; and what a tap on the rest of the row
// does. A row is lit if the run is his own.
const runList = (el, runs, cells, tap) => {
  el.textContent = "";
  if (runs.length === 0) {
    const p = document.createElement("p");
    p.textContent = "No runs yet";
    el.append(p);
    return;
  }
  const ol = document.createElement("ol");
  ol.className = "runs";
  runs.forEach((run, i) => {
    const li = document.createElement("li");
    if (run.name && run.name === account?.name) li.className = "mine";
    for (const [cls, text, act] of cells(run, i)) {
      const span = document.createElement("span");
      span.className = cls + (act ? " link" : "");
      span.textContent = text;
      if (act) onTap(span, act);
      li.append(span);
    }
    if (tap) {
      li.classList.add("link");
      onTap(li, () => tap(run));
    }
    ol.append(li);
  });
  el.append(ol);
};
// (A best run can be watched, if this game can still play it.)
const watchCell = (run, id) => (run.version === gameVersion ? [["watch", "▶", () => watchRun(run.id, id)]] : []);

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
  return (id < 0 ? 1000 : 10) + n;
};
const bestsOf = (name) =>
  Object.entries(account?.courses ?? {})
    .flatMap(([course, list]) => list.filter((run) => run.name === name && current(run)).map((run) => ({ ...run, course: Number(course) })))
    .sort((a, b) => placeRank(a.course) - placeRank(b.course));

// Home: what to play, who he is (if someone: see `linked`), and what those
// he sees have been riding. A run there goes to its place; its rider's
// name, to them.
const FEED = 30;
const showMenu = () => {
  const el = sheets.menu;
  const item = (go) => el.querySelector(`.item[data-go="${go}"]`);
  const fresh = !stored("skate.tutorial", false) && !stored("skate.course", 0);
  item("tutorial").classList.toggle("first", fresh);
  item("tutorial").querySelector("i").textContent = fresh ? "Start here" : "";
  // (Laid out for someone from the first, before who he is has come: see
  // the script after the menu, in index.html.)
  el.classList.toggle("someone", !!mySecret);
  if (account) el.querySelector(".me b").textContent = account.name;
  // (For someone, even with nothing ridden yet, its space is kept; and
  // until what has been ridden has come, it is left empty.)
  const runs = feed().slice(0, FEED);
  const list = el.querySelector(".feed");
  if (!account) list.textContent = "";
  else
    runList(
      list,
      runs,
      (run) => [["who", run.name, () => go("person", run.name)], ["what", placeName(run.course)], ["score", String(run.score)], ["when", ago(run.at)]],
      (run) => go("place", run.course)
    );
};
for (const el of sheets.menu.querySelectorAll(".item")) {
  onTap(el, () => {
    const to = el.dataset.go;
    if (to === "tutorial") goTo(TUTORIAL);
    if (to === "daily") go("place", today());
    if (to === "dailypark") go("place", -today());
    if (to === "courses") go("places", false);
    if (to === "parks") go("places", true);
  });
}
onTap(sheets.menu.querySelector(".me"), () => {
  if (account) go("person", account.name);
});
onTap(document.querySelector(".pick"), goHome);

// The places to pick from: the courses, or the parks, and one at random.
let pickingParks = false;
const showPlaces = () => {
  const el = sheets.places;
  const park = pickingParks;
  el.querySelector("h2").textContent = park ? "Parks" : "Courses";
  const grid = el.querySelector(".grid");
  grid.textContent = "";
  const card = (title, id) => {
    const div = document.createElement("div");
    div.className = "course";
    div.textContent = title;
    onTap(div, () => go("place", id || randomPlace(park)));
    grid.append(div);
  };
  for (let n = 1; n <= PLACES; n++) card(`${park ? "Park" : "Course"} ${n}`, park ? -n : n);
  card("Random", 0);
};

// A place, before he rides it. The game goes there and shows it off behind
// the sheet (see fly_over, in programs/skate/main.l8); the sheet has a
// button to ride it, and its scores: everyone's he sees (if he is someone,
// and it is a place scores are kept of), or his own, kept on this device;
// either the best (of everyone's, one each, with the run to watch) or the
// latest. A rider's name there goes to them.
let placeOf = 0;
let tabWho = stored("skate.who", null);
let tabWhat = "best";
const showPlace = () => {
  const el = sheets.place;
  const id = placeOf;
  el.querySelector("h2").textContent = placeName(id);
  // Whose: everyone's (until he picks), or his own.
  const shared = !!account && postable(id);
  const who = shared && tabWho !== "me" ? "all" : "me";
  const whos = el.querySelector(".tabs.who");
  whos.textContent = "";
  whos.hidden = !shared;
  const pickWho = (which) => () => store("skate.who", (tabWho = which));
  addTab(whos, "Everyone", who === "all", pickWho("all"), showPlace);
  addTab(whos, "You", who === "me", pickWho("me"), showPlace);
  const whats = el.querySelector(".tabs.what");
  whats.textContent = "";
  addTab(whats, "Best", tabWhat === "best", () => (tabWhat = "best"), showPlace);
  addTab(whats, "Recent", tabWhat === "recent", () => (tabWhat = "recent"), showPlace);
  // The runs: a score each, and whose or when.
  const best = tabWhat === "best";
  const list = el.querySelector(".list");
  if (who === "me") {
    const runs = (myRuns[id]?.[tabWhat] ?? []).map(([score, at]) => ({ score, at }));
    runList(list, runs, (run, i) => [...(best ? [["n", `${i + 1}.`]] : []), ["who", ago(run.at)], ["score", String(run.score)]]);
    return;
  }
  const name = (run) => ["who", run.name, () => go("person", run.name)];
  if (best) runList(list, bestsOn(id), (run, i) => [["n", `${i + 1}.`], name(run), ["score", String(run.score)], ...watchCell(run, id)]);
  else runList(list, recentOn(id), (run) => [name(run), ["when", ago(run.at)], ["score", String(run.score)]]);
};
onTap(sheets.place.querySelector(".play"), () => goTo(placeOf));

// A person (himself, from home; or anyone he sees, by their name on a
// run): their best on each place they have ridden, each to watch, or their
// latest runs. A run goes to its place.
let personOf = "";
let personWhat = "best";
const showPerson = () => {
  const el = sheets.person;
  const name = personOf;
  el.querySelector("h2").textContent = name;
  const whats = el.querySelector(".tabs.what");
  whats.textContent = "";
  addTab(whats, "Best", personWhat === "best", () => (personWhat = "best"), showPerson);
  addTab(whats, "Recent", personWhat === "recent", () => (personWhat = "recent"), showPerson);
  const list = el.querySelector(".list");
  const place = (run) => go("place", run.course);
  if (personWhat === "best") runList(list, bestsOf(name), (run) => [["who", placeName(run.course)], ["score", String(run.score)], ...watchCell(run, run.course)], place);
  else runList(list, feed().filter((run) => run.name === name), (run) => [["who", placeName(run.course)], ["when", ago(run.at)], ["score", String(run.score)]], place);
};

// Where the game starts: the place he was last at (an earlier day's
// becoming today's; and for someone new, the tutorial).
const startPlace = () => {
  const last = stored("skate.course", 0) || 0;
  const start = last === 0 && !stored("skate.tutorial", false) ? TUTORIAL : last || 1;
  return isDaily(start) ? Math.sign(start) * today() : start;
};
// A sheet's contents, as they now are: the one named, or else whichever is
// open (its scores have come).
const showOpen = (id = Object.keys(sheets).find((name) => !sheets[name].hidden)) => {
  if (id === "menu") showMenu();
  if (id === "places") showPlaces();
  if (id === "place") showPlace();
  if (id === "person") showPerson();
};

async function main() {
  const params = new URLSearchParams(location.search);
  // Nothing here waits for anyone's scores, or for the game: the menu
  // is up at once (?play goes straight in), with the scores as they were
  // last time, and what he picks from it before the game has loaded is
  // where the game starts.
  if (!params.has("L8_SEED")) placeNow = startPlace();
  if (params.has("play")) {
    sheets.menu.hidden = true;
    sheetsChanged();
  } else goHome();
  // (Opened by his link: who he is, once the leaderboards say.)
  if (linked) {
    loadMe().then((ok) => {
      if (ok) toast(`Playing as ${account.name}`);
      showOpen();
    });
  }
  const module = await WebAssembly.compileStreaming(fetch("skate.wasm"));
  const fs = new MemFS({});
  gameFs = fs;
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
    timing: params.has("gputime"), gpuTiming: params.has("gputime"), countCalls: params.has("glstats"),
    skip: new Set((params.get("skip") ?? "").split(",").filter(Boolean)) });
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyL" && !e.repeat) setNight(!document.body.classList.contains("night"));
    if ((e.code === "KeyH" || e.code === "KeyM") && !e.repeat) goHome();
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
  // The game is held behind a sheet that is open (see openSheet).
  overlay.hidden = true;
  if (sheetOpen()) sendKey(2, 65299, "");
  else closeSheets();
  syncPreview();
  // (Picked while the game was starting somewhere else.)
  if (wanted !== null && wanted !== placeNow) visit(wanted);
  wanted = null;
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", (e) => {
    // (Not for the panel of the frames' rate: its slider takes the keyboard
    // for a moment, and gives it back.)
    if (!touch && !sheetOpen() && !document.getElementById("perf").contains(e.relatedTarget)) show("Click to continue");
  });
  addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(".ui")) return;
    canvas.focus();
    overlay.hidden = true;
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
  // On a device that cannot keep up, the picture is drawn smaller, and
  // stretched to the screen: frames that come slowly for a few seconds
  // take it down a step, to half its size at the least. Slowly is by the
  // rate the browser gives frames at all, found while the game is held
  // behind a sheet and draws nothing: a phone saving its battery gives
  // half as many, and no size of picture brings more. A step that does not
  // bring the frames faster is followed by another (they come only at
  // whole divisions of that rate, so one step may not show); if none down
  // to the least does, the size is put back and no more are tried: it is
  // not the picture's size that holds the device up. Where it got to is
  // kept for the next time, which starts a step above it, so that one bad
  // spell does not last for good. ?scale= fixes it instead.
  const PACE_SLOW = 1.45, PACE_FOR = 3000, PACE_STEP = 0.85, PACE_LEAST = 0.5, PACE_TRIAL = 4000, PACE_GAIN = 0.92;
  // (Or he sets it himself, with the slider under the frames' rate: then
  // it is left where he put it, until he hands it back.)
  const kept = Math.min(1, Math.max(PACE_LEAST, stored("skate.scale", 1) || 1));
  let own = stored("skate.scale.own", false);
  const pace = { on: !params.has("scale") && !own, slow: 0, last: 0, quiet: 0, mean: 16, trial: null, refresh: 1000 / 60 };
  if (pace.on) platform.setScale(Math.min(1, kept / PACE_STEP));
  else if (!params.has("scale")) platform.setScale(kept);

  // How fast the frames come, top right, if he asks to see it: counted
  // over each half second. Beside it, a button for a panel that says what
  // it is, with the picture's resolution to trade for speed.
  const perf = document.querySelector(".perf");
  const panel = document.getElementById("perf");
  const slider = panel.querySelector("input");
  const rate = { frames: 0, since: performance.now(), text: perf.querySelector(".rate b") };
  const showScale = () => {
    slider.value = String(Math.round(platform.scale() * 20) * 5);
    panel.querySelector("output").textContent = `${Math.round(platform.scale() * 100)}%`;
    panel.querySelector(".auto").classList.toggle("on", !own);
    panel.querySelector(".cap").textContent = lowPower() ? `This device looks to be in Low Power Mode, which holds the game to about ${Math.round(1000 / pace.refresh)} frames a second whatever the resolution.` : "";
  };
  // Whether the device is saving its battery, as far as can be told: the
  // browser gives far fewer frames than sixty a second even to a game that
  // draws nothing (a phone in Low Power Mode gives thirty).
  const lowPower = () => 1000 / pace.refresh < 50;
  perf.classList.toggle("on", stored("skate.fps", false));
  onTap(perf.querySelector(".rate"), () => {
    store("skate.fps", perf.classList.toggle("on"));
    panel.hidden = true;
  });
  onTap(perf.querySelector(".what"), () => {
    showScale();
    panel.hidden = !panel.hidden;
  });
  slider.addEventListener("input", () => {
    pace.on = false;
    pace.trial = null;
    platform.setScale(Number(slider.value) / 100);
    store("skate.scale", platform.scale());
    store("skate.scale.own", (own = true));
    showScale();
  });
  slider.addEventListener("change", () => canvas.focus());
  onTap(panel.querySelector(".auto"), () => {
    // (Back to full, and down again from there if it must.)
    pace.on = !params.has("scale");
    pace.slow = 0;
    pace.trial = null;
    platform.setScale(1);
    store("skate.scale", 1);
    store("skate.scale.own", (own = false));
    showScale();
  });

  const paced = async () => {
    await platform.nextFrame();
    const now = performance.now();
    rate.frames++;
    if (now - rate.since >= 500) {
      rate.text.textContent = `${Math.round((rate.frames * 1000) / (now - rate.since))} fps${lowPower() ? " · low power" : ""}`;
      rate.frames = 0;
      rate.since = now;
      if (!panel.hidden) showScale();
    }
    const gap = now - pace.last;
    pace.last = now;
    // (Held behind a sheet, with no place shown off, the game draws
    // nothing: the frames come as fast as the browser gives them.)
    const body = document.body.classList;
    if (body.contains("sheet") && !body.contains("showing")) {
      if (gap < 100) pace.refresh += (gap - pace.refresh) * 0.05;
      pace.quiet = now + 1500;
      return;
    }
    if (!pace.on) return;
    // (Not the frames after a pause, or the first few after a place is
    // built: those are slow whatever the device.)
    if (gap > 250 || document.hidden) pace.quiet = now + 1500;
    if (now < pace.quiet) return;
    pace.mean += (gap - pace.mean) * 0.05;
    if (pace.trial) {
      // Steps down are on trial: kept if the frames now come faster; else
      // another is tried, down to the least, and then all are taken back.
      if (now < pace.trial.until) return;
      if (pace.mean <= pace.trial.mean * PACE_GAIN) store("skate.scale", platform.scale());
      else if (platform.scale() > PACE_LEAST) {
        platform.setScale(Math.max(PACE_LEAST, platform.scale() * PACE_STEP));
        pace.trial.until = now + PACE_TRIAL;
        return;
      } else {
        platform.setScale(pace.trial.scale);
        pace.on = false;
      }
      pace.trial = null;
      pace.slow = 0;
      return;
    }
    pace.slow = gap > PACE_SLOW * pace.refresh ? pace.slow + gap : Math.max(0, pace.slow - 2 * gap);
    if (pace.slow < PACE_FOR || platform.scale() <= PACE_LEAST) return;
    pace.trial = { scale: platform.scale(), mean: pace.mean, until: now + PACE_TRIAL };
    platform.setScale(Math.max(PACE_LEAST, platform.scale() * PACE_STEP));
  };
  const status = await runResumable(instance, () => {
    if (!document.body.classList.contains("loading")) return paced();
    pace.quiet = performance.now() + 1500;
    return breathed();
  });
  stopped(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  stopped(`The game stopped: ${e.message}`);
});
