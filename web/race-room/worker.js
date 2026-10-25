// The racing game's rooms: a Cloudflare Worker at /race/api/, and a Durable
// Object for each room.
//
// A room is the people driving the same track at the same time. Each
// device works out its own car, and says where it is several times a
// second; the room passes that on to everyone else in it. It passes on
// their names the same way, and that each has finished a race. It keeps
// what a race is to be, for everyone in it (the course, the laps, and how
// many computer drivers, and how good), which anyone may change; and when
// anyone calls a race, it tells everyone, at once, that one starts in a
// few seconds, as it is to be, and whose device is to drive the computer
// drivers (the caller's): that device says where they are, and the room
// passes it on as it does a car's. That is all it does. It keeps nothing
// but who is in which seat and what they are called, and what a race is
// to be, and checks nothing but that what is said is short and of the
// right shape: nobody runs into anybody, and laps and times are each
// device's own affair.
//
// But it does not take anyone out of a race they are still driving. A
// race called while someone is in one they have not finished (as each
// device says, with where its car is) is held: everyone is told that it
// waits, and on whom; and it is called once they have all finished (a
// moment after the last, to see how it came out), or have left it, or
// after a while at most. Any device still racing then lets it go, and
// joins the next. One who asked for it may ask no more, and if nobody
// else asked, it is not called. And a seat nothing has been heard from for
// a while (a page that went without closing) is let go too.
//
// Nor does a race lose its computer drivers when the device that drives
// them leaves it (for the menu, or another race, or its page is hidden, or
// it goes): they are given to another device still in it, which drives
// them on from where they were (see steer).
//
// The game is not for everyone: it is played from a link, which has a key
// after its #. The keys that open it are the Worker's secret KEYS (a list,
// with commas or spaces between: `npx wrangler secret put KEYS`). The page
// asks whether its key is one of them before it starts the game, and a
// room lets nobody in without one. (With no KEYS at all, as when it is
// tried on one's own machine, everyone is let in.)
//
//   GET /check?key=KEY          whether the key opens the game: 200, or 403
//   GET /room/NAME?key=KEY      (a WebSocket)
//
// Over the socket, as text:
//   to a device, once:    "you SEAT NOW"        its seat in the room, and the room's clock
//                                               (thousandths of a second since 1970)
//   from a device:        "X Z YAW AT SLIP SPEED KIND FAR WHEN RACE"   where its car is, and when
//                                               (whole numbers), and the race it is in (0: none)
//   to the others:        "SEAT X Z YAW AT SLIP SPEED KIND FAR WHEN RACE"
//   from a device:        "name NAME"           what its driver is called
//   to the others:        "SEAT name NAME"      (and to a device as it joins, of those there)
//   from a device:        "offer C L B S"       what a race is to be, as it has it, on joining
//   from a device:        "set C L B S"         what a race is to be, changed: a course, laps,
//                                               computer drivers, and how good they are
//   to a device / everyone: "set C L B S"       what the room has it be (to one that offers, if
//                                               others are there; to everyone, when it is set)
//   from a device:        "race"                call a race
//   from a device:        "unrace"              it no longer asks for the race held
//   to everyone:          "wait SEATS"          a race called is held for those seats (a bit
//                                               each), still racing; or, with none, about to be
//                                               called; "wait -1": none is held (and to a device
//                                               as it joins, if one is)
//   to everyone:          "race MS LAPS B S SEAT C NOW"   one starts in MS thousandths of a second:
//                                               so many laps, B computer drivers so good, driven
//                                               by SEAT's device, on course C; called at NOW by
//                                               the room's clock (so that a device asleep as it
//                                               came can tell, when it wakes, that it is late)
//   from a device:        "bots WHEN N ..."     where its race's computer drivers are: 8 numbers each
//   to the others:        "SEAT bots WHEN N ..."
//   from a device:        "botdone K MS"        computer driver K has finished, in MS
//   to the others:        "SEAT botdone K MS"
//   from a device:        "botskill S ..."      how good each is (thousandths), now and then
//   to the others:        "SEAT botskill S ..."
//                                               (all three only from the device that drives
//                                               the computer drivers of the race it is in)
//   to everyone:          "drive SEAT RACE"     the computer drivers of race RACE (numbered
//                                               as the pages number races) are driven by
//                                               SEAT's device from now on
//   from a device:        "done MS"             it has finished the race, in MS
//   to the others:        "SEAT done MS"
//   from a device:        "hi"                  that it is still there (every so often, even
//                                               while its page is hidden)
//   from a device:        "away"                that its page is hidden (till it next says
//                                               where its car is)
//   to the others:        "SEAT gone"           when it leaves
import { DurableObject } from "cloudflare:workers";
import { HUMAN_SEATS as SEATS } from "../race/protocol.js";

// What a device may say: where its car is (a few whole numbers), a name,
// and a time.
const PLACE = /^-?\d{1,7}( -?\d{1,7}){7,9}$/;
const NAME = /^name ([^\s\p{C}][^\p{C}]{0,11})$/u;
const DONE = /^done (\d{1,8})$/;
// (A race called; what a race is to be; and where the computer drivers
// are, and that one has finished.)
const RACE = /^race(?: [1-9])?$/;
const CONFIG = /^(set|offer) ([0-7]) ([1-9]) ([0-7]) ([0-3])$/;
const BOTS = /^bots \d{1,3} [0-7]( -?\d{1,7}){0,56}$/;
const BOTDONE = /^botdone [0-6] \d{1,8}$/;
const BOTSKILL = /^botskill( \d{1,4}){1,7}$/;
const HI = /^hi$/;
const AWAY = /^away$/;
const UNRACE = /^unrace$/;

// A race: how long from its being called to its start, how many laps, and
// how long before another can be called.
const RACE_WAIT = 6000;
const RACE_LAPS = 3;
const RACE_APART = 8000;

// A race held for those still racing: how long at most, how long after
// the last has finished, and how often it is looked at. (One not heard
// from in RACE_QUIET is not waited on: its page may be hidden.)
const RACE_HOLD = 60000;
const RACE_AFTER = 7000;
const RACE_LOOK = 500;
const RACE_QUIET = 4000;

// A seat not heard from in this long is let go (a hidden page says it is
// still there twice a minute or so: see STILL_HERE in web/race/race.js),
// looked for at most this often.
const QUIET_SEAT = 120000;
const QUIET_LOOK = 15000;

// The computer drivers of a race are given to another device when the one
// that drives them has not been heard from in this long; or, if it never
// took the race up, this long after it was called.
const BOTS_QUIET = 2000;
const BOTS_TAKE = RACE_WAIT + 3000;

// A race's number, as the pages have it, by when it was called (see the
// "race" message in web/race/race.js): from 1 to 126.
const raceOf = (now) => 1 + (Math.floor(now / 1000) % 126);

export class Room extends DurableObject {
  // What was last heard from each device, by its socket: when, the race it
  // said it is in (0: none), whether it has finished that one, and whether
  // its page is hidden. (Kept only while the room is awake; it is heard
  // again soon enough.)
  heard = new Map();

  // A race held (see RACE_HOLD): who called it, when, the seats last said
  // to be waited on, and when nobody was left racing (or 0); and the timer
  // that looks at it.
  held = null;

  // The races with computer drivers, by their numbers: of each, the seat
  // whose device drives them, when it was called, and whether that device
  // has been heard to be in it. (Kept only while the room is awake, as
  // `heard` is: a room asleep has nobody racing.)
  drivers = new Map();

  // Those in the room: all but those let go.
  there() {
    return this.ctx.getWebSockets().filter((ws) => !ws.deserializeAttachment()?.gone);
  }

  // What was heard from a device, as of now.
  of(ws, now) {
    let it = this.heard.get(ws);
    if (!it) this.heard.set(ws, (it = { at: now, race: 0, done: false, away: false }));
    return it;
  }

  // Whether a device may say where the computer drivers of the race it is
  // in are (and how they finish, and how good they are): it drives them, or
  // the room does not know who does.
  drives(seat, race) {
    const d = this.drivers.get(race);
    return !d || d.seat === seat;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("a WebSocket, please", { status: 426 });
    // The lowest seat nobody is in.
    const there = this.there();
    const taken = new Set(there.map((ws) => ws.deserializeAttachment()?.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    if (seat >= SEATS) return new Response("the room is full", { status: 503 });
    const pair = new WebSocketPair();
    // (Accepted this way, the room can sleep between messages.)
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ seat });
    pair[1].send(`you ${seat} ${Date.now()}`);
    for (const ws of there) {
      const who = ws.deserializeAttachment();
      if (who?.name) pair[1].send(`${who.seat} name ${who.name}`);
    }
    if (this.held) pair[1].send(`wait ${this.held.seats}`);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  tell(text, but = null) {
    for (const ws of this.there()) {
      if (ws === but) continue;
      try {
        ws.send(text);
      } catch {}
    }
  }

  // What a race is to be: as it was last set (kept, as the room may sleep).
  async config() {
    return (await this.ctx.storage.get("config")) ?? { course: 0, laps: RACE_LAPS, bots: 0, skill: 1 };
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 640) return;
    const who = ws.deserializeAttachment();
    if (!who || who.gone) return;
    const now = Date.now();
    const it = this.of(ws, now);
    it.at = now;
    this.sweep(now);
    if (BOTS.test(message) || BOTDONE.test(message) || BOTSKILL.test(message)) {
      if (this.drives(who.seat, it.race)) this.tell(`${who.seat} ${message}`, ws);
      return;
    }
    if (message.length > 80) return;
    if (PLACE.test(message)) {
      // (The race it is in, if it says: a new one is not finished. And
      // saying where its car is, its page is seen.)
      const race = Number(message.split(" ")[9] ?? 0) || 0;
      if (race !== it.race) {
        it.race = race;
        it.done = false;
      }
      it.away = false;
      this.tell(`${who.seat} ${message}`, ws);
      return this.steer(now);
    }
    if (HI.test(message)) return;
    if (AWAY.test(message)) {
      it.away = true;
      if (this.held) this.look();
      return this.steer(now);
    }
    if (UNRACE.test(message)) {
      // (Asked for no more, it is waited on again if it is racing; and if
      // nobody else asked for the race held, it is not called: see look.)
      if (!this.held) return;
      this.held.asked.delete(ws);
      if (this.held.by === ws) this.held.by = null;
      return this.look();
    }
    const config = message.match(CONFIG);
    if (config) {
      const said = { course: Number(config[2]), laps: Number(config[3]), bots: Number(config[4]), skill: Number(config[5]) };
      const said_text = `set ${said.course} ${said.laps} ${said.bots} ${said.skill}`;
      // (An offer is taken only by a room with nobody else in it: else the
      // one offering is told what the room has.)
      if (config[1] === "offer" && this.there().length > 1) {
        const c = await this.config();
        try {
          ws.send(`set ${c.course} ${c.laps} ${c.bots} ${c.skill}`);
        } catch {}
        return;
      }
      await this.ctx.storage.put("config", said);
      return this.tell(said_text);
    }
    const name = message.match(NAME);
    if (name) {
      ws.serializeAttachment({ ...who, name: name[1].trim() });
      return this.tell(`${who.seat} name ${name[1].trim()}`, ws);
    }
    if (DONE.test(message)) {
      it.done = true;
      return this.tell(`${who.seat} ${message}`, ws);
    }
    if (RACE.test(message)) {
      // (One at a time: a second call just after the first, or while one
      // is held, is the same race; but one who is waited on, asking for
      // it, is not waited on any more.)
      if (this.held) {
        this.held.asked.add(ws);
        return this.look();
      }
      if (now - (this.raced ?? 0) < RACE_APART) return;
      this.held = { by: ws, asked: new Set([ws]), since: now, seats: -1, free: 0, timer: null };
      return this.look();
    }
  }

  // The seats still racing, but for those that asked for the race held (a
  // bit each): each in a race it has not finished, and heard from lately.
  // And of those, the ones that have finished it since.
  racing(held, now, done = false) {
    let seats = 0;
    for (const ws of this.there()) {
      const it = this.heard.get(ws);
      const seat = ws.deserializeAttachment().seat;
      if (done) {
        if (held.seats > 0 && held.seats & (1 << seat) && it?.done) seats |= 1 << seat;
      } else if (!held.asked.has(ws) && it && it.race !== 0 && !it.done && !it.away && now - it.at < RACE_QUIET) seats |= 1 << seat;
    }
    return seats;
  }

  // A race held: called, if nobody is left racing (a moment after the last
  // has finished, if any of them did; at once, if they left their race, or
  // asked for this one), or it has been held long enough; else held on,
  // and everyone told on whom it waits, when that changes. (Nobody racing
  // as it is called, it is called at once, with nothing said of waiting.)
  async look() {
    const held = this.held;
    if (!held) return;
    const now = Date.now();
    // (If whoever called it has gone, it is called by another who asked
    // for it; and if all of them have, so has the race.)
    const there = this.there();
    if (!there.includes(held.by)) held.by = [...held.asked].find((ws) => there.includes(ws));
    if (!held.by) return this.unhold("wait -1");
    const seats = this.racing(held, now);
    if (seats === 0 && held.seats === -1) return this.call(held.by, now);
    if (seats === 0 && !held.free) {
      if (this.racing(held, now, true) === 0) return this.call(held.by, now);
      held.free = now;
    }
    if (seats !== 0) held.free = 0;
    if ((held.free && now - held.free >= RACE_AFTER) || now - held.since >= RACE_HOLD) return this.call(held.by, now);
    if (seats !== held.seats) {
      held.seats = seats;
      this.tell(`wait ${seats}`);
    }
    held.timer ??= setInterval(() => this.look(), RACE_LOOK);
  }

  unhold(text) {
    if (this.held?.timer) clearInterval(this.held.timer);
    this.held = null;
    if (text) this.tell(text);
  }

  // A race called, by the device `by`: to start in RACE_WAIT, as the room
  // has it to be, with that device driving its computer drivers. (Being
  // told it, a device knows the race no longer waits.)
  async call(by, now) {
    this.unhold(null);
    this.raced = now;
    const c = await this.config();
    const seat = by.deserializeAttachment().seat;
    if (c.bots > 0) this.drivers.set(raceOf(now), { seat, since: now, seen: false });
    this.tell(`race ${RACE_WAIT} ${c.laps} ${c.bots} ${c.skill} ${seat} ${c.course} ${now}`);
  }

  // The computer drivers of each race: if the device that drives them has
  // left it (for the menu, or another race), or its page is hidden, or
  // nothing has been heard from it for a while, they are given to another
  // device still in it: the lowest seat of those still racing, or, if all
  // of them have finished, of those. Everyone is told, and that device
  // drives them on from where they were last said to be. (The one first
  // given them has a while to take the race up.) A race nobody is in any
  // more is forgotten.
  steer(now) {
    if (this.drivers.size === 0) return;
    const there = this.there();
    const seat = (ws) => ws.deserializeAttachment().seat;
    for (const [race, d] of this.drivers) {
      const inIt = (ws) => {
        const it = this.heard.get(ws);
        return it && it.race === race && !it.away && now - it.at < BOTS_QUIET;
      };
      const host = there.find((ws) => seat(ws) === d.seat);
      if (host && inIt(host)) {
        d.seen = true;
        continue;
      }
      if (!d.seen && now - d.since < BOTS_TAKE) continue;
      const next = there.filter(inIt).sort((a, b) => this.heard.get(a).done - this.heard.get(b).done || seat(a) - seat(b))[0];
      if (!next) {
        this.drivers.delete(race);
        continue;
      }
      d.seat = seat(next);
      d.seen = true;
      this.tell(`drive ${d.seat} ${race}`);
    }
  }

  // Seats nothing has been heard from in QUIET_SEAT are let go, as if they
  // had left (looked for at most every QUIET_LOOK). (One the room has not
  // heard from since it last woke is counted from now.)
  sweep(now) {
    if (now - (this.swept ?? 0) < QUIET_LOOK) return;
    this.swept = now;
    for (const ws of this.there()) {
      if (now - this.of(ws, now).at < QUIET_SEAT) continue;
      this.leave(ws);
      try {
        ws.close(1000, "quiet");
      } catch {}
    }
  }

  // A device has left: the others are told, once, and the room forgets it.
  leave(ws) {
    const who = ws.deserializeAttachment();
    this.heard.delete(ws);
    if (!who || who.gone) return;
    try {
      ws.serializeAttachment({ ...who, gone: true });
    } catch {}
    this.tell(`${who.seat} gone`, ws);
    if (this.held) this.look();
    this.steer(Date.now());
  }

  webSocketClose(ws) {
    this.leave(ws);
    try {
      ws.close();
    } catch {}
  }

  webSocketError(ws) {
    this.webSocketClose(ws);
  }
}

// Whether a key opens the game.
function opens(env, key) {
  const keys = (env.KEYS ?? "").split(/[\s,]+/).filter(Boolean);
  return keys.length === 0 || (typeof key === "string" && keys.includes(key));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ok = opens(env, url.searchParams.get("key"));
    if (url.pathname.endsWith("/check")) {
      // (Asked from the page, which on one's own machine is somewhere
      // else: so anyone may read the answer.)
      return new Response(ok ? "yes" : "no", { status: ok ? 200 : 403, headers: { "access-control-allow-origin": "*", "cache-control": "no-store" } });
    }
    const room = url.pathname.match(/\/room\/([a-z0-9-]{1,24})$/);
    if (!room) return new Response("no such thing", { status: 404 });
    if (!ok) return new Response("this needs its link", { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(room[1])).fetch(request);
  },
};
