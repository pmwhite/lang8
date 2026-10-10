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

// The keys over the game: each presses its key of the game's.
for (const key of document.querySelectorAll(".controls .key")) {
  const sym = Number(key.dataset.key);
  if (!sym) continue;
  onTap(key, () => {
    if (key === lookKey) setNight(!document.body.classList.contains("night"));
    typeKeys([sym]);
  });
}

// Sheets over the game: the menu, the guide, the places to pick from, and
// the groups. The game pauses (Pause, held) while any is open, and one
// closes with its button, a tap outside it, or Escape.
const sheets = Object.fromEntries(["menu", "guide", "places", "groups"].map((id) => [id, document.getElementById(id)]));
const sheetOpen = () => Object.values(sheets).some((el) => !el.hidden);
// Whether he has started riding: until then the menu cannot be closed
// without choosing.
let started = false;
const openSheet = (id) => {
  for (const [name, el] of Object.entries(sheets)) el.hidden = name !== id;
  canvas.blur();
  sendKey?.(2, 65299, "");
};
const closeSheets = () => {
  for (const el of Object.values(sheets)) el.hidden = true;
  started = true;
  overlay.hidden = true;
  sendKey?.(3, 65299);
  canvas.focus();
};
// (Closing any sheet but the menu goes back to the menu it came from.)
const closeSheet = (id) => {
  if (id === "menu") {
    if (started) closeSheets();
  } else if (id === "guide" && started) closeSheets();
  else openMenu();
};
for (const [id, el] of Object.entries(sheets)) {
  onTap(el, () => closeSheet(id), (e) => e.target === el);
  onTap(el.querySelector(".close"), () => closeSheet(id));
}
addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const open = Object.entries(sheets).find(([, el]) => !el.hidden);
  if (open) closeSheet(open[0]);
});
onTap(document.querySelector(".how"), () => openSheet("guide"));

// Places: a downhill course is a number; a park is one too, kept negative
// (as the game says them: see run_id in programs/skate/park.l8). Each
// number is always the same place, and each day has a course and a park of
// its own, numbered by its date (as 20261010). The game says what is in
// each of the first few (L8LIST lines), which he is on (L8COURSE), and each
// run's score as it ends (L8FINISH); the best on each is kept here, on the
// device. Going to one types its number to the game, and Enter (a course)
// or Tab (a park).
const PLACES = 24;
// The tutorial's course (see programs/skate/tutorial.l8): where a new
// player starts, until he has left it for another.
const TUTORIAL = 100000000;
const SECTION_NAMES = { KICKERS: "Kickers", RAILS: "Rails", PIPE: "Halfpipe", CLIFF: "Cliff", GAP: "Gap", ROLLERS: "Rollers" };
const THING_NAMES = { KICKER: ["kicker", "kickers"], GAP: ["gap", "gaps"], ROLLERS: ["rollers", "rollers"], RAIL: ["rail", "rails"], BOX: ["box", "boxes"] };
const placeList = new Map();
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
const bests = stored("skate.best", {});
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
  if (id === TUTORIAL) return "the tutorial";
  if (isDaily(id)) return `${id < 0 ? "the daily park" : "the daily downhill"}${Math.abs(id) === today() ? "" : ` of ${dayName(id)}`}`;
  return `${id < 0 ? "park" : "course"} ${Math.abs(id)}`;
};
// What is there: a course's sections in order; a park's things, counted.
const placeText = (id) => {
  const words = placeList.get(id) ?? [];
  if (id > 0) return words.map((k) => SECTION_NAMES[k] ?? k).join(" › ");
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts].map(([w, n]) => (n > 1 ? `${n} ${THING_NAMES[w]?.[1] ?? w}` : THING_NAMES[w]?.[0] ?? w)).join(" · ");
};
const goTo = (id) => {
  closeSheets();
  if (id === placeNow) {
    // (There already: from its start.)
    typeKeys([114]);
    return;
  }
  if (id === TUTORIAL) typeKeys([116]);
  else typeKeys([...String(Math.abs(id))].map((c) => 48 + Number(c)).concat(id < 0 ? 65289 : 65293));
};
const randomPlace = (park) => (park ? -1 : 1) * (PLACES + 1 + Math.floor(Math.random() * 99000));

// Groups (see ../skate-board/worker.js): a group shares a leaderboard, and
// whoever opens its link (?group=<code>) is in it from then on. His best
// runs are posted to every group he is in, under his name (his in a group
// once posted there: a token kept here says it is this device). One group's
// scores are the ones shown. Anyone's run can be watched: the game is
// handed it as a file, and V.
const api = location.hostname.endsWith("trailingwhite.space") ? "/skate/api" : "https://trailingwhite.space/skate/api";
const validCode = (code) => typeof code === "string" && /^[a-z0-9]{8,24}$/.test(code);
let groups = stored("skate.groups", []).filter((g) => validCode(g?.code));
// (The one board of before there were groups.)
const oldBoard = stored("skate.board", null);
if (validCode(oldBoard) && !groups.some((g) => g.code === oldBoard)) groups.push({ code: oldBoard, title: "" });
let shownCode = stored("skate.group", null);
const saveGroups = () => {
  if (!groups.some((g) => g.code === shownCode)) shownCode = groups[0]?.code ?? null;
  store("skate.groups", groups);
  store("skate.group", shownCode);
};
let playerName = stored("skate.name", "");
let playerToken = stored("skate.token", null);
if (!playerToken) {
  playerToken = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  store("skate.token", playerToken);
}
// Each group's scores, as last fetched, by its code.
const boards = new Map();
const shown = () => boards.get(shownCode) ?? null;
const shownTitle = () => groups.find((g) => g.code === shownCode)?.title || "your group";
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
const loadBoard = async (code) => {
  try {
    const r = await fetch(`${api}/board/${code}`);
    if (r.status === 404) return false;
    if (!r.ok) return null;
    const data = await r.json();
    boards.set(code, data);
    const group = groups.find((g) => g.code === code);
    if (group && group.title !== data.title) {
      group.title = data.title;
      saveGroups();
    }
    return true;
  } catch {
    return null;
  }
};
const loadBoards = () => Promise.all(groups.map((g) => loadBoard(g.code)));
// Join the group with this code (or in this link): true if there is one.
const joinGroup = async (text) => {
  const code = (text.match(/[?&](?:group|board)=([a-z0-9]+)/)?.[1] ?? text).trim();
  if (!validCode(code)) return false;
  if (!groups.some((g) => g.code === code)) {
    const found = await loadBoard(code);
    if (found === false) return false;
    groups.push({ code, title: boards.get(code)?.title ?? "" });
  }
  shownCode = code;
  saveGroups();
  return true;
};
const scoresOn = (id) => shown()?.courses?.[id] ?? [];
const myBest = (id) => scoresOn(id).find((e) => e.name === playerName)?.score ?? 0;
const postable = (id) => (Math.abs(id) >= 1 && Math.abs(id) <= PLACES) || Math.abs(id) === today();
// A run just finished, as the game wrote it: post it to his groups, if it
// is his best there (on this device, or by what the group shown has).
let newBest = false;
const postRun = async (version, id, score, replay) => {
  const post = newBest || score > myBest(id);
  newBest = false;
  if (groups.length === 0 || score <= 0 || !postable(id) || !post) return;
  if (!playerName) {
    toast("Set your name under Your groups to post scores");
    return;
  }
  let said = false;
  for (const group of groups) {
    try {
      const r = await fetch(`${api}/board/${group.code}/score`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: playerName, token: playerToken, course: id, score, version, replay }),
      });
      const body = await r.json();
      if (!r.ok) {
        if (!said) toast(`Not posted to ${group.title || "your group"}: ${body.error}`);
        said = true;
        continue;
      }
      await loadBoard(group.code);
      if (body.posted && group.code === shownCode) {
        const place = scoresOn(id).findIndex((e) => e.name === playerName) + 1;
        toast(place > 0 ? `#${place} in ${shownTitle()} on ${placeName(id)}` : "Posted");
        said = true;
      }
    } catch {
      if (!said) toast("Not posted: no connection");
      said = true;
    }
  }
};
const watchRun = async (id, name) => {
  try {
    const r = await fetch(`${api}/board/${shownCode}/replay?course=${id}&name=${encodeURIComponent(name)}`);
    const run = await r.json();
    if (!r.ok) throw new Error(run.error);
    gameFs.writeFile("watch.txt", `${run.version} ${run.course} ${run.score} ${run.name.replace(/ /g, "_")} ${run.replay}`);
    closeSheets();
    typeKeys([118]);
  } catch {
    toast("Could not load that run");
  }
};
const gameSays = (line) => {
  const words = line.trim().split(/\s+/);
  if (words[0] === "L8LIST") placeList.set(Number(words[1]), words.slice(2));
  else if (words[0] === "L8VERSION") gameVersion = Number(words[1]);
  else if (words[0] === "L8REPLAY") postRun(Number(words[1]), Number(words[2]), Number(words[3]), words.slice(4).join(" "));
  else if (words[0] === "L8COURSE") {
    placeNow = Number(words[1]);
    document.body.classList.toggle("park", placeNow < 0);
    if (placeNow !== TUTORIAL) {
      store("skate.course", placeNow);
      store("skate.tutorial", true);
    }
  } else if (words[0] === "L8FINISH") {
    const [id, score] = [Number(words[1]), Number(words[2])];
    newBest = score > (bests[id] ?? 0);
    if (newBest) {
      bests[id] = score;
      store("skate.best", bests);
    }
  } else return false;
  return true;
};

// A list of the top few runs on a place in the group shown, each to watch
// (if this game can still play it); or null if there are none.
const scoreList = (id, most) => {
  const runs = scoresOn(id);
  if (runs.length === 0) return null;
  const list = document.createElement("ol");
  runs.slice(0, most).forEach((run, i) => {
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
      watch.textContent = "▶";
      watch.title = "Watch this run";
      onTap(watch, () => watchRun(id, run.name));
      li.append(watch);
    }
    list.append(li);
  });
  return list;
};

// The menu: what to play. Each day's places say what is in them, his best
// there, and who leads his group.
const showMenu = () => {
  const el = sheets.menu;
  el.querySelector(".close").hidden = !started;
  const item = (go) => el.querySelector(`.item[data-go="${go}"]`);
  const fresh = !stored("skate.tutorial", false) && !stored("skate.course", 0);
  item("tutorial").classList.toggle("first", fresh);
  item("tutorial").querySelector("i").textContent = fresh ? "Start here" : "";
  const resume = item("resume");
  resume.hidden = fresh || placeNow === 0;
  resume.querySelector("span").textContent = `On ${placeName(placeNow)}`;
  const day = today();
  for (const [go, id] of [["daily", day], ["dailypark", -day]]) {
    const text = placeText(id);
    item(go).querySelector("span").textContent = `${dayName(id)} · ${id < 0 ? "60 seconds · " : ""}${text || "the same for everyone"}`;
    const lines = [];
    if (bests[id]) lines.push(`Your best ${bests[id]}`);
    const lead = scoresOn(id)[0];
    if (lead) lines.push(`${lead.name} ${lead.score}`);
    item(go).querySelector("i").textContent = lines.join("\n");
  }
  const count = (park) => Object.keys(bests).filter((k) => Number(k) !== 0 && Number(k) < 0 === park && Math.abs(Number(k)) <= PLACES).length;
  item("courses").querySelector("i").textContent = count(false) ? `${count(false)} of ${PLACES} ridden` : "";
  item("parks").querySelector("i").textContent = count(true) ? `${count(true)} of ${PLACES} ridden` : "";
  item("groups").querySelector("span").textContent = groups.length
    ? `${groups.map((g) => g.title || "a group").join(", ")}${playerName ? ` · playing as ${playerName}` : " · set your name to post scores"}`
    : "Share a leaderboard with friends, and watch each other's runs";
};
const openMenu = () => {
  showMenu();
  openSheet("menu");
  // (The groups' scores as they are now, when they come.)
  loadBoards().then(() => {
    if (!sheets.menu.hidden) showMenu();
  });
};
for (const el of sheets.menu.querySelectorAll(".item")) {
  onTap(el, () => {
    const go = el.dataset.go;
    if (go === "resume") closeSheets();
    if (go === "tutorial") goTo(TUTORIAL);
    if (go === "daily") goTo(today());
    if (go === "dailypark") goTo(-today());
    if (go === "courses") openPlaces(false);
    if (go === "parks") openPlaces(true);
    if (go === "groups") openGroups();
  });
}
onTap(document.querySelector(".pick"), () => openMenu());

// The places to pick from: the courses, or the parks.
let pickingParks = false;
const showPlaces = () => {
  const el = sheets.places;
  const park = pickingParks;
  el.querySelector("h2").textContent = park ? "Parks" : "Downhill courses";
  el.querySelector(".about").textContent = park
    ? "Each number is always the same park. A run is sixty seconds: score what you can. Your best in each is kept on this device."
    : "Each number is always the same course. Ride from the top to the finish, scoring on the way. Your best on each is kept on this device.";
  const bar = el.querySelector(".boardbar");
  bar.hidden = groups.length === 0;
  bar.querySelector(".title").textContent = shownTitle();
  bar.querySelector("small").textContent = playerName ? "" : "Set your name under Your groups to post yours.";
  const grid = el.querySelector(".grid");
  grid.textContent = "";
  const card = (id, title, text) => {
    const div = document.createElement("div");
    div.className = "course" + (id !== 0 && id === placeNow ? " now" : "");
    div.innerHTML = `<b></b><span></span>${bests[id] ? "<i></i>" : ""}`;
    div.querySelector("b").textContent = title;
    div.querySelector("span").textContent = text;
    if (bests[id]) div.querySelector("i").textContent = `Best ${bests[id]}`;
    const list = id !== 0 && scoreList(id, 5);
    if (list) div.append(list);
    onTap(div, () => goTo(id === 0 ? randomPlace(park) : id));
    grid.append(div);
  };
  const sign = park ? -1 : 1;
  for (let n = 1; n <= PLACES; n++) card(sign * n, `${park ? "Park" : "Course"} ${n}`, placeText(sign * n));
  if (placeNow !== TUTORIAL && placeNow < 0 === park && Math.abs(placeNow) > PLACES && !isDaily(placeNow)) card(placeNow, `${park ? "Park" : "Course"} ${Math.abs(placeNow)}`, "The one you are on");
  card(0, "Random", park ? "Another park, laid out afresh" : "Another course, laid out afresh");
};
const openPlaces = (park) => {
  pickingParks = park;
  showPlaces();
  openSheet("places");
  loadBoards().then(() => {
    if (!sheets.places.hidden) showPlaces();
  });
};

// The groups: his name; each group, with its link to pass on; and joining
// another.
const showGroups = () => {
  const el = sheets.groups;
  const taken = playerName && [...boards.values()].some((b) => Object.values(b.courses).some((list) => list.some((e) => e.name === playerName)));
  el.querySelector(".name small").textContent = playerName ? (taken ? "Your runs post as this name." : "Your best runs will post as this name.") : "Type a name to post your scores.";
  const list = el.querySelector(".list");
  list.textContent = "";
  if (groups.length === 0) {
    const p = document.createElement("p");
    p.textContent = "You are not in a group yet. Ask a friend for their group's link, and open it or paste it below.";
    list.append(p);
  }
  for (const group of groups) {
    const div = document.createElement("div");
    div.className = "group" + (group.code === shownCode ? " shown" : "");
    div.innerHTML = `<b></b><span class="btn show"></span><span class="btn copy">Copy invite link</span><span class="btn leave">Leave</span><small></small>`;
    div.querySelector("b").textContent = group.title || "A group";
    const board = boards.get(group.code);
    const names = new Set(Object.values(board?.courses ?? {}).flat().map((e) => e.name));
    div.querySelector("small").textContent = board ? (names.size ? `${names.size} riding: ${[...names].slice(0, 8).join(", ")}` : "No runs posted yet") : "";
    const show = div.querySelector(".show");
    show.textContent = group.code === shownCode ? "Showing its scores" : "Show its scores";
    show.hidden = groups.length < 2;
    onTap(show, () => {
      shownCode = group.code;
      saveGroups();
      showGroups();
    });
    onTap(div.querySelector(".copy"), async () => {
      const link = `${location.origin}${location.pathname}?group=${group.code}`;
      try {
        await navigator.clipboard.writeText(link);
        toast("Invite link copied");
      } catch {
        prompt("Copy this link to invite someone:", link);
      }
    });
    onTap(div.querySelector(".leave"), () => {
      if (!confirm(`Leave ${group.title || "this group"}? Your runs stay on its board.`)) return;
      groups = groups.filter((g) => g !== group);
      saveGroups();
      showGroups();
    });
    list.append(div);
  }
};
const openGroups = () => {
  showGroups();
  openSheet("groups");
  loadBoards().then(() => {
    if (!sheets.groups.hidden) showGroups();
  });
};
const nameBox = sheets.groups.querySelector(".name input");
nameBox.value = playerName;
nameBox.addEventListener("change", () => {
  playerName = cleanName(nameBox.value);
  nameBox.value = playerName;
  store("skate.name", playerName);
  showGroups();
});
const joinBox = sheets.groups.querySelector(".join input");
const join = async () => {
  if (!joinBox.value.trim()) return;
  const ok = await joinGroup(joinBox.value);
  toast(ok ? `Joined ${shownTitle()}` : "No group with that link or code");
  if (ok) joinBox.value = "";
  showGroups();
};
onTap(sheets.groups.querySelector(".join .btn"), join);
for (const box of [nameBox, joinBox]) {
  box.addEventListener("pointerdown", (e) => e.stopPropagation());
  box.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      box.blur();
      if (box === joinBox) join();
    }
  });
}

async function main() {
  const params = new URLSearchParams(location.search);
  const module = await WebAssembly.compileStreaming(fetch("skate.wasm"));
  const fs = new MemFS({});
  gameFs = fs;
  // The page opened with a group's link: in it.
  const link = params.get("group") ?? params.get("board");
  if (link && (await joinGroup(link))) toast(`Joined ${shownTitle()}`);
  saveGroups();
  loadBoards();
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
  // The game loads the place he was last at (an earlier day's becoming
  // today's; and for someone new, the tutorial), and says what is in the
  // first few courses and parks, and the day's.
  const last = stored("skate.course", 0) || 0;
  let start = last === 0 && !stored("skate.tutorial", false) ? TUTORIAL : last || 1;
  if (isDaily(start)) start = Math.sign(start) * today();
  if (!params.has("L8_SEED")) {
    params.set("L8_SEED", String(Math.abs(start)));
    if (start < 0) params.set("L8_PARK", "1");
  }
  if (touch) params.set("L8_TOUCH", "1");
  params.set("L8_COURSES", String(PLACES));
  params.set("L8_PARKS", String(PLACES));
  params.set("L8_DAILY", String(today()));
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
  canvas.addEventListener("keydown", (e) => {
    if (e.code === "KeyL" && !e.repeat) setNight(!document.body.classList.contains("night"));
    if (e.code === "KeyM" && !e.repeat) openMenu();
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
  // The menu to begin with (the game held behind it); ?play goes straight
  // in.
  overlay.hidden = true;
  if (params.has("play")) closeSheets();
  else openMenu();
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => {
    if (!touch && !sheetOpen()) show("Click to continue");
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
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
