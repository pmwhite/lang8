// The racing game on a canvas that fills the screen, on the block game's
// browser implementation of X11, GLX, and OpenGL (../game/platform.js).
//
// The game draws its own menus (see programs/race/ui.l8). What this page
// does for it is what a page must: it holds the link that opens the game;
// it carries word between the game and the others on the track; and it
// keeps, from one visit to the next, what the game asks to have kept.
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
    if (!e.target.closest?.("a")) e.preventDefault();
  }, { passive: false });
}
const touch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

// ---- the others ----
// The room: everyone on the track now (see web/race-room/worker.js). The
// game says where its car is, and that goes to the room; the room says
// where the others' cars are, what they are called, and how they finish,
// and that goes to the game, as key events whose key syms are numbers
// packed together (see net_key and more_key, in programs/race/net.l8, for
// how).
const NET_A = 2 ** 50, NET_B = 2 ** 51, NET_RACE = 2 ** 52;
const NET_NAME = 2n ** 54n, NET_DONE = 2n ** 55n, NET_FAR = 2n ** 56n;
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
    if (kind >= 0 && kind < 4) store(this.name(room.course, kind), line.slice(8));
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

const room = {
  socket: null,
  platform: null,
  // Me, and the others by their seats: of each, its name.
  me: { seat: -1, name: tidyName(stored("race.name")) || `Driver ${10 + Math.floor(Math.random() * 90)}` },
  others: new Map(),
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
    };
    socket.onmessage = (e) => this.heard(String(e.data));
    // (No room, or the room lost: the others are gone, and it is tried
    // again in a while.)
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null;
      if (this.live === socket) this.live = null;
      for (const seat of [...this.others.keys()]) this.gone(seat);
      setTimeout(() => this.open(), this.hurry ? 0 : 4000);
      this.hurry = false;
    };
    socket.onerror = () => socket.close();
  },
  send(text) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(text);
  },
  // A name, to the game: whose (a seat, or 31 for me), and its twelve
  // characters by their codes, six at a time. (The game's font has the
  // plain ones only: any other is a question mark.)
  name(seat, name) {
    const text = name.padEnd(12).slice(0, 12);
    for (let half = 0; half < 2; half++) {
      let packed = 0n;
      for (let i = 0; i < 6; i++) {
        const code = text.charCodeAt(half * 6 + i);
        packed = packed * 128n + BigInt(code >= 32 && code <= 126 ? code : 63);
      }
      this.platform.key(2, NET_NAME + (BigInt(seat) << 43n) + (BigInt(half) << 42n) + packed);
    }
  },
  // Another name for me: asked for here, and told to the game and the
  // room.
  rename() {
    const name = tidyName(prompt("Your name", this.me.name));
    canvas.focus();
    if (!name) return;
    this.me.name = name;
    store("race.name", name);
    this.send(`name ${name}`);
    this.name(31, name);
  },
  // A race is on, the room says: of so many laps, to start in `wait`
  // thousandths of a second. The game is told, with the car's place on
  // the grid: in the order of the seats.
  race(wait, laps) {
    const seats = [this.me.seat, ...this.others.keys()].sort((a, b) => a - b);
    const place = Math.max(seats.indexOf(this.me.seat), 0);
    const tenths = Math.min(Math.max(Math.round(wait / 100), 0), 255);
    this.platform.key(2, NET_RACE + tenths * 256 + Math.min(Math.max(laps | 0, 1), 15) * 16 + Math.min(place, 15));
  },
  // What the game wrote: where its car is, that it has finished, that a
  // race is asked for, that it is in another course's room, that the
  // player would change the name, or something to keep. Whether the line
  // was one of those.
  wrote(line) {
    if (line.startsWith("L8AT ")) {
      this.send(line.slice(5));
      return true;
    }
    if (line.startsWith("L8DONE ")) {
      this.send(`done ${Number(line.slice(7))}`);
      return true;
    }
    if (line.startsWith("L8RACE ")) {
      this.send(`race ${Number(line.slice(7))}`);
      return true;
    }
    if (line.startsWith("L8ROOM ")) {
      const course = Number(line.slice(7));
      this.move(course);
      ghosts.give(this.platform, course);
      return true;
    }
    if (line === "L8NAME") {
      this.rename();
      return true;
    }
    if (line.startsWith("L8SAVE ")) {
      const [key, value] = line.slice(7).split(" ");
      if (/^[a-z]+$/.test(key)) store(`race.${key}`, value);
      return true;
    }
    return false;
  },
  gone(seat) {
    this.platform.key(2, NET_B + seat * 2 ** 40 + 1);
    this.others.delete(seat);
  },
  heard(text) {
    const words = text.split(" ");
    if (words[0] === "you") {
      this.me.seat = Number(words[1]);
      return;
    }
    if (words[0] === "race") return this.race(Number(words[1]), Number(words[2]));
    const seat = Number(words[0]);
    if (!(seat >= 0 && seat < 16)) return;
    if (words[1] === "gone") return this.gone(seat);
    if (!this.others.has(seat)) this.others.set(seat, { far: 0 });
    if (words[1] === "name") return this.name(seat, tidyName(words.slice(2).join(" ")) || `Driver ${seat + 1}`);
    if (words[1] === "done") {
      this.platform.key(2, NET_DONE + (BigInt(seat) << 28n) + BigInt(Math.min(Math.max(Math.round(Number(words[2])) || 0, 0), 2 ** 28 - 1)));
      return;
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
    // (And how far round it is, when that has changed by a metre.)
    const who = this.others.get(seat);
    if (Math.abs(far - who.far) >= 1) {
      who.far = far;
      this.platform.key(2, NET_FAR + (BigInt(seat) << 20n) + BigInt(clamp(far + 1000, 0, 2 ** 20 - 1)));
    }
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
  // (What the game writes comes in pieces: a line at a time from here.)
  let written = "";
  fs.onOutput = (_fd, data) => {
    written += decoder.decode(data);
    const lines = written.split("\n");
    written = lines.pop();
    for (const line of lines) {
      if (!room.wrote(line) && !ghosts.wrote(line) && line.trim()) console.log(line.trimEnd());
    }
  };
  const sys = fs.sys(["race"]);
  // What was kept is where the game starts, unless the address says
  // otherwise: the car and the course last driven, and what a race was
  // last to be (laps, computer drivers, and how good).
  const kept = (name, most, usual) => {
    const n = Math.round(Number(stored(`race.${name}`) ?? usual));
    return n >= 0 && n <= most ? n : usual;
  };
  if (!params.has("L8_CAR")) params.set("L8_CAR", String(kept("car", 3, 0)));
  if (!params.has("L8_COURSE")) params.set("L8_COURSE", String(kept("course", 2, 0)));
  if (!params.has("L8_SET")) params.set("L8_SET", `${kept("laps", 9, 3)},${kept("drivers", 7, 5)},${kept("skill", 3, 3)}`);
  const course = Number(params.get("L8_COURSE")) || 0;
  // (There is a room to tell where the car is; the menu is up; and
  // whether thumbs drive.)
  params.set("L8_NET", "1");
  params.set("L8_MENU", "1");
  if (touch) params.set("L8_TOUCH", "1");
  sys.env = [...params].filter(([k]) => k.startsWith("L8_")).map(([k, v]) => `${k}=${v}`);
  const env = Object.fromEntries([...params].filter(([k]) => k.startsWith("L8_")));
  const platform = createPlatform(canvas, { log: (text) => console.warn(text), checkErrors: params.has("glcheck"), scale: 1, zoom: 0.85, env, pointers: true, maxTall: 2.4, maxPixels: 2.2e6 });
  // The edges a phone keeps for itself (its notch, and the bar at its
  // foot) are told to the game, in its window's pixels (which are as the
  // platform makes them: no smaller than 0.85 of a CSS pixel), so that it
  // draws nothing to be pressed there. See ui_page_key, in
  // programs/race/ui.l8.
  const edges = document.createElement("div");
  edges.style.cssText = "position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(edges);
  const sayEdges = () => {
    const w = Math.min(innerWidth, innerHeight * 2.4), h = Math.min(innerHeight, innerWidth * 2.4);
    const s = Math.max(Math.min(w / 1200, h / 720), 0.85);
    const style = getComputedStyle(edges);
    const side = (name) => BigInt(Math.min(Math.max(Math.round((parseFloat(style[name]) || 0) / s), 0), 1023));
    platform.key(2, 2n ** 58n + (side("paddingTop") << 30n) + (side("paddingRight") << 20n) + (side("paddingBottom") << 10n) + side("paddingLeft"));
  };
  addEventListener("resize", () => setTimeout(sayEdges, 50));
  sayEdges();
  window.l8Game = platform;
  window.l8Race = { room };
  room.join(platform, params, course);
  room.name(31, room.me.name);
  ghosts.give(platform, course);
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);
  overlay.hidden = true;
  addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.("a")) canvas.focus();
  });
  canvas.focus();
  const status = await runResumable(instance, () => platform.nextFrame());
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
}

main().catch((e) => {
  console.error(e);
  show(`The game stopped: ${e.message}`);
});
