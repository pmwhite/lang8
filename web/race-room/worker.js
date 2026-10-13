// The racing game's rooms: a Cloudflare Worker at /race/api/, and a Durable
// Object for each room.
//
// A room is the people driving the same track at the same time. Each
// device works out its own car, and says where it is several times a
// second; the room passes that on to everyone else in it. It passes on
// their names the same way, and that each has finished a race; and when
// anyone calls a race, it tells everyone, at once, that one starts in a
// few seconds. That is all it does. It keeps nothing but who is in which
// seat and what they are called, and checks nothing but that what is said
// is short and of the right shape: nobody runs into anybody, and laps and
// times are each device's own affair.
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
//   to a device, once:    "you SEAT"            its seat in the room
//   from a device:        "X Z YAW AT SLIP SPEED KIND FAR WHEN"   where its car is, and when (whole numbers)
//   to the others:        "SEAT X Z YAW AT SLIP SPEED KIND FAR WHEN"
//   from a device:        "name NAME"           what its driver is called
//   to the others:        "SEAT name NAME"      (and to a device as it joins, of those there)
//   from a device:        "race LAPS"           call a race (of so many laps; or "race": of three)
//   to everyone:          "race MS LAPS"        one starts in MS thousandths of a second
//   from a device:        "done MS"             it has finished the race, in MS
//   to the others:        "SEAT done MS"
//   to the others:        "SEAT gone"           when it leaves
import { DurableObject } from "cloudflare:workers";

// How many can be in a room (the game has as many seats: MAX_OTHERS in
// programs/race/net.l8, and one's own).
const SEATS = 16;

// What a device may say: where its car is (a few whole numbers), a name,
// and a time.
const PLACE = /^-?\d{1,7}( -?\d{1,7}){7,8}$/;
const NAME = /^name ([^\s\p{C}][^\p{C}]{0,11})$/u;
const DONE = /^done (\d{1,8})$/;
// (A race called: of so many laps, if it says.)
const RACE = /^race(?: ([1-9]))?$/;

// A race: how long from its being called to its start, how many laps, and
// how long before another can be called.
const RACE_WAIT = 6000;
const RACE_LAPS = 3;
const RACE_APART = 8000;

export class Room extends DurableObject {
  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("a WebSocket, please", { status: 426 });
    // The lowest seat nobody is in.
    const there = this.ctx.getWebSockets();
    const taken = new Set(there.map((ws) => ws.deserializeAttachment()?.seat));
    let seat = 0;
    while (taken.has(seat)) seat++;
    if (seat >= SEATS) return new Response("the room is full", { status: 503 });
    const pair = new WebSocketPair();
    // (Accepted this way, the room can sleep between messages.)
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ seat });
    pair[1].send(`you ${seat}`);
    for (const ws of there) {
      const who = ws.deserializeAttachment();
      if (who?.name) pair[1].send(`${who.seat} name ${who.name}`);
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  tell(text, but = null) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === but) continue;
      try {
        ws.send(text);
      } catch {}
    }
  }

  webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 80) return;
    const who = ws.deserializeAttachment();
    if (PLACE.test(message)) return this.tell(`${who.seat} ${message}`, ws);
    const name = message.match(NAME);
    if (name) {
      ws.serializeAttachment({ ...who, name: name[1].trim() });
      return this.tell(`${who.seat} name ${name[1].trim()}`, ws);
    }
    if (DONE.test(message)) return this.tell(`${who.seat} ${message}`, ws);
    const race = message.match(RACE);
    if (race) {
      // (One at a time: a second call just after the first is the same
      // race.)
      const now = Date.now();
      if (now - (this.raced ?? 0) < RACE_APART) return;
      this.raced = now;
      this.tell(`race ${RACE_WAIT} ${race[1] ?? RACE_LAPS}`);
    }
  }

  webSocketClose(ws) {
    this.tell(`${ws.deserializeAttachment().seat} gone`, ws);
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
