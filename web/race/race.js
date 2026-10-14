// The racing game on a canvas that fills the screen, on the block game's
// browser implementation of X11, GLX, and OpenGL (../game/platform.js).
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "../game/platform.js";

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
for (const name of ["touchstart", "touchmove"]) {
  document.addEventListener(name, (e) => {
    if (!e.target.closest?.("a, button, .order")) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
if (touch) document.body.classList.add("touch");

// ---- the others ----
// The room: everyone on the track now (see web/race-room/worker.js). The
// game says where its car is, and that goes to the room; the room says
// where the others' cars are, and that goes to the game, as key events
// whose key syms are numbers packed together (see net_key, in
// programs/race/net.l8, for how). The page keeps the list of who is here,
// and in a race, of who is ahead.
const NET_A = 2 ** 50, NET_B = 2 ** 51, NET_RACE = 2 ** 52;
// What the page tells the game with plain key syms (see PAGE_MENU, in
// programs/race/main.l8): that the menu is up, that the car is to be
// driven alone, and its place in a race.
const PAGE_MENU = 90000, PAGE_ALONE = 90001, PAGE_PLACE = 90100, PAGE_COURSE = 90010;
// The computer drivers' names, by their places on the grid (see
// programs/race/bots.l8).
const BOT_NAMES = ["Vera", "Otto", "Mab", "Finn", "Ines", "Tobe", "Zuri"];
// How good they can be asked to be, by the game's numbers for it (the last:
// as good as the player makes them).
const SKILLS = ["EASY", "MEDIUM", "HARD", "ADAPTIVE"];
const CAR_COLORS = ["#e6382e", "#2b6edb", "#fab847", "#54c2a8"];
const stored = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};
// A name: twelve letters at most, none of them unseen.
const tidyName = (text) => (text ?? "").replace(/[\p{C}]/gu, "").trim().slice(0, 12).trim();
// A time, as the game writes them: 1:07.42.
const clock = (ms) => {
  const cs = Math.round(ms / 10);
  return `${Math.floor(cs / 6000)}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
// ---- ghosts ----
// A ghost is the best lap driven in a kind of car, for the game to drive
// again as a car that is only seen (see programs/race/ghost.l8). The game
// writes each new one as a line, which is kept on the device; and as the
// game starts, the ones kept are given back to it, as key events whose key
// syms are numbers packed together (see ghost_key there for how). They
// are of the track as it is: TRACK is changed when the track is, and the
// old ones are left behind. (As it is when the cars are made slower, or
// faster: a ghost of a lap that cannot be driven now is no use.)
const TRACK = "3";
const GHOST_KEY = 2n ** 60n;
const ghosts = {
  // (Each course has its own: under this name, for a kind of car.)
  name(course, kind) {
    return course === 0 ? `race.ghost.${TRACK}.${kind}` : `race.ghost.${TRACK}.c${course}h.${kind}`;
  },
  wrote(line) {
    if (!line.startsWith("L8GHOST ")) return false;
    const kind = Number(line.slice(8).split(" ", 1)[0]);
    if (kind >= 0 && kind < 4) store(this.name(flow.course, kind), line.slice(8));
    return true;
  },
  // The ghosts kept of a course, to the game (which has that course
  // built, and no ghosts).
  give(platform, course) {
    const within = (v, lo, hi) => BigInt(Math.min(Math.max(Math.round(v), lo), hi));
    const turn = 2 * Math.PI * 1000;
    for (let kind = 0; kind < 4; kind++) {
      const words = (stored(this.name(course, kind)) ?? "").split(" ").map(Number);
      const [k, ms, n] = words;
      if (k !== kind || !(n > 1) || words.length !== 3 + n * 4 || !words.every(Number.isFinite)) continue;
      const of = GHOST_KEY + (BigInt(kind) << 57n);
      platform.key(2, of + (1n << 59n) + within(ms, 0, 16777215));
      for (let i = 0; i < n; i++) {
        const [x, z, yaw, slip] = words.slice(3 + i * 4, 7 + i * 4);
        platform.key(2, of + (within(slip / 10 + 64, 0, 127) << 48n) + (within(((((yaw % turn) + turn) % turn) / turn) * 4096, 0, 4095) << 36n)
          + (within(z + 131072, 0, 262143) << 18n) + within(x + 131072, 0, 262143));
      }
    }
  },
};

// ---- the link ----
// The game is played from a link: the page's address with a key after its
// #. The key is asked of the game's server (see web/race-room/worker.js)
// before the game starts, and is kept on the device, so that the page
// opens the game again without it.
const atHome = location.hostname.endsWith("trailingwhite.space");
const link = {
  // Where the game's server is: where the address says (?net=), or beside
  // the page where it is at home, or on the machine the page came from.
  at: new URLSearchParams(location.search).get("net") ?? (atHome ? `wss://${location.host}/race/api` : `ws://${location.hostname}:8787`),
  key: (location.hash.slice(1) || stored("race.key") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40),
  // Whether the key opens the game: "yes", "no", or (the server not to be
  // reached) "lost". Away from home, where there may be no server at all,
  // the game is open without one.
  async opens() {
    try {
      const answer = await fetch(`${this.at.replace(/^ws/, "http")}/check?key=${this.key}`, { cache: "no-store" });
      if (answer.ok) {
        if (this.key) store("race.key", this.key);
        return "yes";
      }
      return answer.status === 403 ? "no" : atHome ? "lost" : "yes";
    } catch {
      return atHome ? "lost" : "yes";
    }
  },
};

// ---- the courses ----
// The game says what courses there are as it starts, a line each (see
// say_course, in programs/race/main.l8): which, how long its lap is and
// how far it climbs, in metres, what its road is, and its middle line as
// points; then its name. Each is a card in the menu, in a row, to choose it by: its shape
// and its name; and under the row, those two numbers of the one chosen. (COURSES: how many there are, as
// programs/race/track.l8 has it.)
const COURSES = 3;
const courses = {
  all: [],
  wrote(line) {
    if (!line.startsWith("L8COURSE ")) return false;
    const words = line.slice(9).trim().split(" ");
    const [k, length, climb, road, n] = words.slice(0, 5).map(Number);
    const points = [];
    for (let i = 0; i < n; i++) points.push([Number(words[5 + i * 2]), Number(words[6 + i * 2])]);
    this.all[k] = { name: words.slice(5 + n * 2).join(" "), length, climb, road, points };
    this.draw();
    return true;
  },
  draw() {
    const cards = document.getElementById("cards");
    cards.textContent = "";
    this.all.forEach((course, k) => {
      const card = document.createElement("button");
      card.className = k === flow.course ? "card chosen" : "card";
      // (Its shape, fitted into the picture.)
      const xs = course.points.map((p) => p[0]), zs = course.points.map((p) => p[1]);
      const x0 = Math.min(...xs), z0 = Math.min(...zs);
      const by = Math.min(104 / Math.max(Math.max(...xs) - x0, 1), 54 / Math.max(Math.max(...zs) - z0, 1));
      const ox = (120 - (Math.max(...xs) - x0) * by) / 2, oz = (70 - (Math.max(...zs) - z0) * by) / 2;
      const at = course.points.map(([x, z]) => `${(ox + (x - x0) * by).toFixed(1)},${(oz + (z - z0) * by).toFixed(1)}`);
      card.innerHTML = `<svg viewBox="0 0 120 70" aria-hidden="true"><polygon points="${at.join(" ")}" fill="none" stroke="rgba(20,12,6,0.55)" stroke-width="6" stroke-linejoin="round"/>`
        + `<polygon points="${at.join(" ")}" fill="none" stroke="#fff8ec" stroke-width="3" stroke-linejoin="round"/><circle cx="${at[0].split(",")[0]}" cy="${at[0].split(",")[1]}" r="3.4" fill="#ffd866" stroke="rgba(20,12,6,0.7)"/></svg>`;
      const name = document.createElement("span");
      name.textContent = course.name;
      card.append(name);
      card.setAttribute("aria-pressed", String(k === flow.course));
      card.addEventListener("click", () => flow.pick(k));
      cards.append(card);
    });
    const chosen = this.all[flow.course];
    // (What its road is, by the game's number for the ground.)
    const roads = { 0: "tarmac", 3: "snow", 5: "dirt and mud" };
    document.getElementById("course-facts").textContent = chosen ? `${roads[chosen.road] ?? "road"}  ·  ${(chosen.length / 1000).toFixed(1)} km  ·  ${chosen.climb} m of climb` : "";
  },
};

const room = {
  socket: null,
  platform: null,
  // Me, and the others by their seats: of each, a name, the kind of car,
  // how far it has come (metres from the start line), and its time in the
  // race, if it has finished.
  me: { seat: -1, name: tidyName(stored("race.name")) || `Driver ${10 + Math.floor(Math.random() * 90)}`, kind: 0, far: 0, done: null },
  others: new Map(),
  // The computer drivers in the race, if any (the game says where they
  // are: see wrote).
  bots: [],
  // Whether a race has been called (it is, until the next, or the menu).
  racing: false,
  list: document.getElementById("order"),
  // The room: the one the address names (?room=), or everyone's; and
  // each course has a room of its own, so that those in a room are all on
  // one course.
  base: "track",
  course: 0,
  live: null,
  hurry: false,
  join(platform, params, course) {
    this.platform = platform;
    this.base = (params.get("room") ?? "track").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20) || "track";
    this.course = course;
    setInterval(() => this.show(), 300);
    this.open();
  },
  // To another course's room: this one is left (see the socket's onclose),
  // and that one joined at once.
  move(course) {
    if (course === this.course) return;
    this.course = course;
    if (this.live) {
      this.hurry = true;
      this.live.close();
    }
  },
  open() {
    let socket;
    try {
      socket = new WebSocket(`${link.at}/room/${this.base}${this.course > 0 ? `-${this.course}` : ""}?key=${link.key}`);
    } catch {
      return;
    }
    this.live = socket;
    socket.onopen = () => {
      this.socket = socket;
      this.send(`name ${this.me.name}`);
      this.show();
    };
    socket.onmessage = (e) => this.heard(String(e.data));
    // (No room, or the room lost: the others are gone, and it is tried
    // again in a while.)
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (this.live === socket) this.live = null;
      for (const seat of [...this.others.keys()]) this.gone(seat);
      this.show();
      setTimeout(() => this.open(), this.hurry ? 0 : 4000);
      this.hurry = false;
    };
    socket.onerror = () => socket.close();
  },
  send(text) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
  },
  // Another name for me.
  rename() {
    const name = tidyName(prompt("Your name", this.me.name));
    if (!name) return;
    this.me.name = name;
    store("race.name", name);
    this.send(`name ${name}`);
    this.show();
  },
  // A race is on: of so many laps, to start in `wait` thousandths of a
  // second, with so many computer drivers. The game is told, with the
  // car's place on the grid: behind the computer drivers; or, among
  // others, in the order of their seats.
  race(wait, laps, bots, skill = 1) {
    const seats = [this.me.seat, ...this.others.keys()].sort((a, b) => a - b);
    const place = bots > 0 ? bots : Math.max(seats.indexOf(this.me.seat), 0);
    const tenths = Math.min(Math.max(Math.round(wait / 100), 0), 255);
    this.platform.key(2, NET_RACE + skill * 1048576 + bots * 65536 + tenths * 256 + Math.min(Math.max(laps | 0, 1), 15) * 16 + place);
    this.racing = true;
    this.bots = Array.from({ length: bots }, (_, k) => ({ seat: 100 + k, name: BOT_NAMES[k] ?? `Driver ${k + 1}`, kind: 0, far: -100 - k, done: null }));
    for (const who of [this.me, ...this.others.values()]) who.done = null;
    if (bots > 0) this.me.far = -1000;
    this.show();
  },
  // What the game wrote: where its car is, or that it has finished.
  wrote(line) {
    if (line.startsWith("L8AT ")) {
      const place = line.slice(5);
      const words = place.split(" ");
      this.me.kind = Number(words[6]);
      // (Against computer drivers, how far it has come is said with theirs.)
      if (!(this.racing && this.bots.length)) this.me.far = Number(words[7]);
      this.send(place);
      return true;
    }
    if (line.startsWith("L8DONE ")) {
      this.me.done = Number(line.slice(7));
      this.send(`done ${this.me.done}`);
      this.show();
      flow.finished();
      return true;
    }
    // (Where the computer drivers are: how many; and of each, its kind of
    // car, how far it has come, and its time if it has finished, or -1.)
    // (Where the list may start, down the window: under the game's map,
    // which is in the same corner. See hud_list, in programs/race/hud.l8.)
    if (line.startsWith("L8LIST ")) {
      this.list.style.top = `${Number(line.slice(7)) / 10}%`;
      return true;
    }
    if (line.startsWith("L8BOTS ")) {
      const words = line.slice(7).split(" ").map(Number);
      if (this.racing && this.bots.length) this.me.far = words[1];
      this.bots.forEach((bot, k) => {
        if (k >= words[0]) return;
        bot.kind = words[2 + k * 3];
        bot.far = words[3 + k * 3];
        bot.done = words[4 + k * 3] >= 0 ? words[4 + k * 3] : null;
      });
      return true;
    }
    return false;
  },
  other(seat) {
    if (!this.others.has(seat)) this.others.set(seat, { seat, name: `Driver ${seat + 1}`, kind: 0, far: 0, done: null });
    return this.others.get(seat);
  },
  gone(seat) {
    this.platform.key(2, NET_B + seat * 2 ** 40 + 1);
    this.others.delete(seat);
    this.show();
  },
  heard(text) {
    const words = text.split(" ");
    if (words[0] === "you") {
      this.me.seat = Number(words[1]);
      return;
    }
    if (words[0] === "race") {
      // A race, called by someone here: everyone is in it.
      flow.race(Number(words[1]), Number(words[2]), 0);
      return;
    }
    const seat = Number(words[0]);
    if (!(seat >= 0 && seat < 16)) return;
    if (words[1] === "gone") return this.gone(seat);
    if (words[1] === "name") {
      this.other(seat).name = tidyName(words.slice(2).join(" ")) || `Driver ${seat + 1}`;
      return this.show();
    }
    if (words[1] === "done") {
      this.other(seat).done = Number(words[2]);
      return this.show();
    }
    const [x, z, yaw, at, slip, speed, kind, far, when] = words.slice(1).map(Number);
    if (![x, z, yaw, at, slip, speed, kind, far].every(Number.isFinite)) return;
    // (When this was, by its device's clock, in hundredths of a second;
    // or, from a page that does not say, when it came.)
    const stamp = (Number.isFinite(when) ? Math.round(when) : Math.round(performance.now() / 10)) & 255;
    const clamp = (v, lo, hi) => Math.min(Math.max(Math.round(v), lo), hi);
    const turn = 2 * Math.PI * 1000;
    const a = NET_A + stamp * 2 ** 42 + seat * 2 ** 38 + clamp(kind, 0, 3) * 2 ** 36 + clamp(x + 131072, 0, 262143) * 2 ** 18 + clamp(z + 131072, 0, 262143);
    const b = NET_B + seat * 2 ** 40 + clamp(((((yaw % turn) + turn) % turn) / turn) * 4096, 0, 4095) * 2 ** 28 + clamp(at, 0, 4095) * 2 ** 16
      + clamp(slip / 10 + 64, 0, 127) * 2 ** 9 + clamp(speed / 25, 0, 255) * 2;
    this.platform.key(2, a);
    this.platform.key(2, b);
    const who = this.other(seat);
    who.kind = clamp(kind, 0, 3);
    who.far = far;
  },
  // Everyone in the order they are in: in a race, those who have
  // finished, by their times, then the rest, by how far they have come;
  // out of one, by their seats.
  order() {
    const all = [this.me, ...(this.socket ? this.others.values() : []), ...(this.racing ? this.bots : [])];
    if (this.racing) {
      all.sort((a, b) => (a.done !== null && b.done !== null ? a.done - b.done : a.done !== null ? -1 : b.done !== null ? 1 : b.far - a.far));
    } else all.sort((a, b) => a.seat - b.seat);
    return all;
  },
  // A list of them, into a list on the page.
  fill(list, rows) {
    while (list.children.length > rows.length) list.lastChild.remove();
    while (list.children.length < rows.length) {
      const row = document.createElement("li");
      for (const part of ["place", "dot", "name", "time"]) {
        const span = document.createElement("span");
        span.className = part;
        row.append(span);
      }
      list.append(row);
    }
    rows.forEach((who, k) => {
      const row = list.children[k];
      row.className = who === this.me ? "me" : "";
      row.children[0].textContent = this.racing ? String(k + 1) : "";
      row.children[1].style.background = CAR_COLORS[who.kind] ?? CAR_COLORS[0];
      row.children[2].textContent = who.name;
      row.children[3].textContent = this.racing && who.done !== null ? clock(who.done) : "";
    });
  },
  // The lists as they are now: at the side, who is here, and in a race,
  // who is ahead (alone and not racing, nobody); and the same wherever
  // else the page shows it (see flow). In a race the game is told the
  // car's place, for it to show.
  show() {
    const all = this.order();
    this.fill(this.list, all.length > 1 || this.racing ? all : []);
    for (const list of document.querySelectorAll(".order.copy")) this.fill(list, all);
    if (this.racing && this.platform) this.platform.key(2, PAGE_PLACE + (all.indexOf(this.me) + 1) * 32 + Math.min(all.length, 31));
    flow.shown(all);
  },
};


// ---- the menus ----
// What the page is showing: the menu (the car waits at the start, to be
// chosen), driving alone against the clock ("trial"), or a race. The game
// is told as each begins (see PAGE_MENU, in programs/race/main.l8).
const el = (id) => document.getElementById(id);
const flow = {
  scene: "menu",
  platform: null,
  // Whether the pause sheet is up, and whether the game stands still under
  // it (it does, with nobody else to wait for).
  paused: false,
  held: false,
  // How many computer drivers the race on now has (none: it is against
  // the others here).
  bots: 0,
  // What the player chose: the course; how many laps a race is; and for a
  // race against computer drivers, how many of them, and how good (see
  // SKILLS). They are remembered.
  course: 0,
  laps: 3,
  drivers: 5,
  skill: 3,
  choose(laps, drivers, skill) {
    this.laps = Math.min(Math.max(Math.round(laps) || 3, 1), 9);
    this.drivers = Math.min(Math.max(Math.round(drivers) || 1, 1), BOT_NAMES.length);
    this.skill = ((Math.round(skill) || 0) + SKILLS.length) % SKILLS.length;
    store("race.laps", String(this.laps));
    store("race.drivers", String(this.drivers));
    store("race.skill", String(this.skill));
    el("laps").textContent = String(this.laps);
    el("drivers").textContent = String(this.drivers);
    el("skill").textContent = SKILLS[this.skill];
    el("laps-fewer").disabled = this.laps <= 1;
    el("laps-more").disabled = this.laps >= 9;
    el("fewer").disabled = this.drivers <= 1;
    el("more").disabled = this.drivers >= BOT_NAMES.length;
  },
  // A course is chosen (see courses): the game builds it, its room is
  // joined, and its ghosts given.
  pick(course) {
    canvas.focus();
    if (course === this.course || this.scene !== "menu") return;
    this.course = course;
    store("race.course", String(course));
    this.platform.key(2, PAGE_COURSE + course);
    room.move(course);
    ghosts.give(this.platform, course);
    courses.draw();
  },
  set(scene) {
    this.scene = scene;
    document.body.dataset.scene = scene;
    this.results(false);
    this.resume();
    canvas.focus();
  },
  // The menu: no race, the car at the start.
  menu() {
    room.racing = false;
    room.bots = [];
    this.platform.key(2, PAGE_MENU);
    this.set("menu");
    room.show();
  },
  // Driving alone.
  trial() {
    room.racing = false;
    room.bots = [];
    this.platform.key(2, PAGE_ALONE);
    this.set("trial");
    room.show();
  },
  // Race: against the others, if anyone else is here (the room tells
  // everyone, me too: see heard); or else against computer drivers.
  call() {
    if (room.socket && room.others.size > 0) room.send(`race ${this.laps}`);
    else this.race(5000, this.laps, this.drivers, this.skill);
  },
  race(wait, laps, bots, skill = this.skill) {
    this.bots = bots;
    this.set("race");
    room.race(wait, laps, bots, skill);
  },
  // The race is run: in a moment, how it came out.
  finished() {
    if (this.scene !== "race") return;
    setTimeout(() => {
      if (this.scene === "race" && room.me.done !== null) this.results(true);
    }, 1400);
  },
  // (With the results up, the list at the side is not: they are the same.)
  results(up) {
    el("results").hidden = !up;
    document.body.classList.toggle("done", up);
  },
  // (What the lists say, each time they change: the place and time at the
  // head of the results, and who is here, in the menu.)
  shown(all) {
    const place = all.indexOf(room.me) + 1;
    const ends = ["th", "st", "nd", "rd"];
    el("came").textContent = room.me.done === null ? "" : `${place}${ends[place % 10 < 4 && (place % 100 < 11 || place % 100 > 13) ? place % 10 : 0]} of ${all.length}  ·  ${clock(room.me.done)}`;
    el("name").textContent = room.me.name;
    const others = room.socket ? room.others.size : 0;
    el("options").classList.toggle("others", others > 0);
    el("here").textContent = others === 0 ? "Nobody else is here: a race is against computer drivers." : `${others === 1 ? "1 other is" : `${others} others are`} here: a race is against ${others === 1 ? "them" : "them all"}.`;
  },
  // The pause sheet. Alone, the game stands still under it: as if its
  // Pause key were held.
  pause() {
    if (this.scene === "menu" || this.paused) return;
    this.paused = true;
    this.held = !(this.scene === "race" && this.bots === 0);
    if (this.held) this.platform.key(2, 65299);
    el("pause").hidden = false;
  },
  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.held) this.platform.key(3, 65299);
    el("pause").hidden = true;
    canvas.focus();
  },
  again() {
    if (this.scene === "race") this.call();
    else this.trial();
  },
};

async function main() {
  const params = new URLSearchParams(location.search);
  // (Nothing of the game is fetched without the link.)
  const open = await link.opens();
  if (open !== "yes") {
    show(open === "no" ? "This game is played from a link.<br>Open it from yours." : "The game cannot be reached just now.<br><a href=\"\">Try again</a>");
    return;
  }
  // (The game as it is with this script: fetched by the same ?v= as the
  // script was, if any, so that a kept copy of one is never run with a
  // newer copy of the other.)
  const module = await WebAssembly.compileStreaming(fetch(`race.wasm${new URL(import.meta.url).search}`));
  const fs = new MemFS({});
  const decoder = new TextDecoder();
  // (What the game writes comes in pieces: a line at a time from here. A
  // line that says where the car is goes to the room.)
  let written = "";
  fs.onOutput = (_fd, data) => {
    written += decoder.decode(data);
    const lines = written.split("\n");
    written = lines.pop();
    for (const line of lines) {
      if (!room.wrote(line) && !ghosts.wrote(line) && !courses.wrote(line) && line.trim()) console.log(line.trimEnd());
    }
  };
  const sys = fs.sys(["race"]);
  // The car last driven here is the one to start in (the game's L8_CAR),
  // unless the address says which.
  const CARS = 4;
  let car = Number(params.get("L8_CAR") ?? stored("race.car") ?? 0);
  if (!(car >= 0 && car < CARS)) car = 0;
  params.set("L8_CAR", String(car));
  // (And the course last driven.)
  flow.course = Math.min(Math.max(Math.round(Number(params.get("L8_COURSE") ?? stored("race.course") ?? 0)) || 0, 0), COURSES - 1);
  params.set("L8_COURSE", String(flow.course));
  // (There is a room to tell where the car is; and the menu is up.)
  params.set("L8_NET", "1");
  params.set("L8_MENU", "1");
  sys.env = [...params].filter(([k]) => k.startsWith("L8_")).map(([k, v]) => `${k}=${v}`);
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const platform = createPlatform(canvas, { log: (text) => console.warn(text), checkErrors: params.has("glcheck"), scale: 1, zoom: 0.85, env, pointers: true, maxTall: 2.4, maxPixels: 2.2e6 });
  // The steering panel, the veer button, and the brake, placed over the
  // game's view where the game reads them: these fractions match
  // programs/race/touch.l8.
  const STEER_LEFT = 0.04, STEER_RIGHT = 0.47, PANEL_TOP = 0.52, PANEL_BOTTOM = 0.8;
  const BRAKE_LEFT = 0.62, BRAKE_RIGHT = 0.88, BRAKE_TOP = 0.83, BRAKE_BOTTOM = 0.89;
  const steerPanel = document.querySelector(".panel.steer");
  const veerPanel = document.querySelector(".panel.veer");
  const brakePanel = document.querySelector(".panel.brake");
  const placePads = () => {
    const r = canvas.getBoundingClientRect();
    const place = (el, left, right, top, bottom) => {
      el.style.left = `${r.left + r.width * left}px`;
      el.style.width = `${r.width * (right - left)}px`;
      el.style.top = `${r.top + r.height * top}px`;
      el.style.height = `${r.height * (bottom - top)}px`;
    };
    place(steerPanel, STEER_LEFT, STEER_RIGHT, PANEL_TOP, PANEL_BOTTOM);
    place(veerPanel, 1 - STEER_RIGHT, 1 - STEER_LEFT, PANEL_TOP, PANEL_BOTTOM);
    place(brakePanel, BRAKE_LEFT, BRAKE_RIGHT, BRAKE_TOP, BRAKE_BOTTOM);
  };
  new ResizeObserver(placePads).observe(canvas);
  addEventListener("resize", placePads);
  placePads();
  window.l8Game = platform;
  window.l8Race = { flow, room };
  room.join(platform, params, flow.course);
  ghosts.give(platform, flow.course);
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  // The menus (see flow). The car is chosen with the arrows either side
  // of it (or the keyboard's 1 to 4 and Tab), which are the game's own
  // keys for it; and the choice is remembered.
  flow.platform = platform;
  const press = (sym) => {
    platform.key(2, sym);
    platform.key(3, sym);
    canvas.focus();
  };
  const choose = (k) => {
    car = ((k % CARS) + CARS) % CARS;
    store("race.car", String(car));
  };
  const pick = (by) => {
    choose(car + by);
    press(49 + car);
  };
  const on = (id, what) => el(id).addEventListener("click", what);
  on("prev", () => pick(-1));
  on("next", () => pick(1));
  flow.choose(Number(stored("race.laps") ?? 3), Number(stored("race.drivers") ?? 5), Number(stored("race.skill") ?? 3));
  on("laps-fewer", () => flow.choose(flow.laps - 1, flow.drivers, flow.skill));
  on("laps-more", () => flow.choose(flow.laps + 1, flow.drivers, flow.skill));
  on("fewer", () => flow.choose(flow.laps, flow.drivers - 1, flow.skill));
  on("more", () => flow.choose(flow.laps, flow.drivers + 1, flow.skill));
  on("easier", () => flow.choose(flow.laps, flow.drivers, flow.skill - 1));
  on("harder", () => flow.choose(flow.laps, flow.drivers, flow.skill + 1));
  on("go-race", () => flow.call());
  on("go-trial", () => flow.trial());
  on("name", () => room.rename());
  on("menu", () => flow.pause());
  on("resume", () => flow.resume());
  on("restart", () => flow.again());
  on("quit", () => flow.menu());
  on("again", () => flow.again());
  on("leave", () => flow.menu());
  canvas.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.repeat) return;
    if (flow.scene === "menu") {
      if (e.key === "Enter") flow.call();
      if (e.key >= "1" && e.key <= String(CARS)) choose(Number(e.key) - 1);
      if (e.key === "Tab") choose(car + 1);
      if (e.key === "ArrowLeft") pick(-1);
      if (e.key === "ArrowRight") pick(1);
    } else if (e.key === "Escape") {
      if (flow.paused) flow.resume();
      else flow.pause();
    }
  });
  document.body.dataset.scene = "menu";
  room.show();
  overlay.hidden = true;
  addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.("a, button")) canvas.focus();
  });
  canvas.focus();
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
