// Reads a UI-change log (uilog.js's on the web, ios/uilog.l8's from the
// iPhone; README.md) and reports the moments a designer should look at:
// layout jumps, flicker, pops, scroll jumps, late settling, dropped
// frames, overlap, misalignment, clipped text, and how the two linked
// panes keep together.
//
//   node programs/bible/tools/uilog/check.mjs LOG [--timeline [FROM-TO]] [--all]
//
// LOG is a .jsonl file or the development server's
// http://HOST:8777/uilog/latest. --timeline prints what changed, frame
// by frame condensed, between FROM and TO ms (all of it if not given);
// --all lists every occurrence of a finding instead of the first few.
import fs from "node:fs";

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith("--") && !/^\d+(-\d+)?$/.test(a));
if (!source) {
  console.error("usage: node check.mjs LOG.jsonl|URL [--timeline [FROM-TO]] [--all]");
  process.exit(2);
}
const text = /^https?:/.test(source) ? await (await fetch(source)).text() : fs.readFileSync(source, "utf8");
const events = [];
for (const line of text.split("\n")) {
  if (!line.trim()) continue;
  try {
    events.push(JSON.parse(line));
  } catch {
    console.error(`not JSON, skipped: ${line.slice(0, 80)}`);
  }
}
const meta = events.find((e) => e.e === "meta") || { platform: "?" };
const ios = meta.platform === "ios";

// ---- thresholds (CSS pixels on the web, points on the iPhone) ----
const T = {
  jumpAfterAddMs: 300, // a move this soon after appearing, with no input, is a layout jump...
  jumpMinPx: 3, // ...of at least this much...
  jumpMaxFrames: 2, // ...done in at most this many frames (more is an animation)
  flickerMs: 250, // gone and back (or text changed and back) within this
  popKinds: new Set(["sheet", "toast", "bar", "pane", "menu"]),
  scrollJumpPx: 40, // a scroll this far in one frame...
  scrollJumpQuietMs: 100, // ...with no input this recently
  lateSettleMs: 600, // visible change this long after the hand stopped
  frameGapMs: 50, // a frame this late while something moves
  overlapMinPx: 3, // overlapping by this much both ways
  misalignMinPx: ios ? 0.5 : 1,
  misalignMaxPx: ios ? 3 : 4,
  // Linked panes.
  linkEpisodeGapMs: 150, // panes records further apart than this begin another episode
  spikeFactor: 2.5, // a follower step this many times the leader's typical step (and...)
  spikeMinPx: 12, // ...at least this far from the follower's own previous step) is a spike
  reverseMinPx: 2, // a follower step back at least this far is a reversal
};

// ---- the elements, as the log builds them ----
const elements = new Map(); // id -> {d, k, a, sc, r, o, shown}
for (const e of events) if (e.e === "add") elements.set(e.id, { d: e.d, k: e.k, a: e.a, sc: e.sc, tx: Boolean(e.tx) || e.k === "para" || e.k === "text" });
const desc = (id) => elements.get(id)?.d ?? `#${id}`;
const kind = (id) => elements.get(id)?.k;
// What holds id, and what holds that, outwards.
function ancestors(id) {
  const out = new Set();
  for (let a = elements.get(id)?.a; a && !out.has(a); a = elements.get(a)?.a) out.add(a);
  return out;
}
// The nearest sheet (panel, menu, dialog) holding id (0: none).
function sheetOf(id) {
  for (const a of ancestors(id)) if (kind(a) === "sheet") return a;
  return 0;
}
// The scroll container id moves with (0: none, fixed on the screen).
function scrollerOf(id) {
  for (let x = id, seen = 0; x && seen < 50; seen++) {
    const e = elements.get(x);
    if (!e) return 0;
    if (e.sc) return e.a;
    x = e.a;
  }
  return 0;
}

const inputs = events.filter((e) => e.e === "input");
// (A wire line that flicks a pane, the iPhone's `!flick page DY` or
// `!flick panel DY`, is a hand in that pane.)
for (const i of inputs) {
  const flick = i.type === "wire" && /^!flick (page|panel)\b/.exec(i.detail || "");
  if (flick) i.pane = flick[1] === "panel" ? 1 : 0;
}
const handInputs = inputs.filter((e) => !/^(decel-end|drag-end)$/.test(e.type));
// The latest input at or before t (binary search over times).
const inputTimes = handInputs.map((e) => e.t);
function lastInputBefore(t) {
  let lo = 0;
  let hi = inputTimes.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (inputTimes[mid] <= t) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best < 0 ? null : handInputs[best];
}
const sinceInput = (t) => {
  const i = lastInputBefore(t);
  return i ? t - i.t : Infinity;
};
const ms = (x) => `${Math.round(x)} ms`;
const at = (t) => `${(t / 1000).toFixed(2)}s`;

// ---- findings, grouped ----
const findings = new Map();
function find(rule, key, t, message) {
  const k = `${rule}\u0000${key}`;
  if (!findings.has(k)) findings.set(k, { rule, t, message, times: [] });
  findings.get(k).times.push(t);
}

// The motion events (what a person sees change), on screen.
const visibleChange = (e) => (e.e === "move" || e.e === "fade" || e.e === "text" || (e.e === "scroll" && !e.off) || (e.e === "add" && !e.off && !e.base) || e.e === "remove");

// 1. A layout jump after appearing: moved soon after it appeared, in one
// or two frames, with no input in between.
{
  const added = new Map();
  const movesOf = new Map();
  for (const e of events) {
    if (e.e === "add" && !e.base && !e.off) added.set(e.id, e.t);
    if (e.e === "move") {
      if (!movesOf.has(e.id)) movesOf.set(e.id, []);
      movesOf.get(e.id).push(e);
    }
  }
  for (const [id, moves] of movesOf) {
    const tAdd = added.get(id);
    if (tAdd === undefined) continue;
    const soon = moves.filter((m) => m.t > tAdd && m.t - tAdd <= T.jumpAfterAddMs);
    if (!soon.length) continue;
    const input = lastInputBefore(soon[soon.length - 1].t);
    if (input && input.t > tAdd) continue;
    const biggest = soon.reduce((m, x) => (Math.hypot(x.dx, x.dy, x.dw, x.dh) > Math.hypot(m.dx, m.dy, m.dw, m.dh) ? x : m));
    const size = Math.max(Math.abs(biggest.dx), Math.abs(biggest.dy), Math.abs(biggest.dw), Math.abs(biggest.dh));
    if (soon.length > T.jumpMaxFrames || size < T.jumpMinPx) continue;
    const what = [biggest.dx && `x ${sign(biggest.dx)}`, biggest.dy && `y ${sign(biggest.dy)}`, biggest.dw && `width ${sign(biggest.dw)}`, biggest.dh && `height ${sign(biggest.dh)}`].filter(Boolean).join(", ");
    find("layout jump after appearing", `${desc(id)}|${what}`, soon[0].t, `${desc(id)} jumped (${what}) ${ms(soon[0].t - tAdd)} after it appeared, no input between`);
  }
}

function sign(x) {
  return (x > 0 ? "+" : "") + (Math.round(x * 10) / 10);
}

// 2. Flicker: gone and back, back and gone, text changed and back, faded
// down and up, within T.flickerMs; or an element replaced by a new one
// like it a frame or more later.
{
  const last = new Map();
  const removedByDesc = new Map();
  for (const e of events) {
    if (e.e === "remove") {
      last.set(e.id, { type: "remove", t: e.t });
      if (!e.off) removedByDesc.set(e.d, { t: e.t, r: e.r, id: e.id });
    } else if (e.e === "add" && !e.base) {
      const was = last.get(e.id);
      if (was && was.type === "remove" && e.t - was.t <= T.flickerMs && !e.off) find("flicker", `${e.d}|gone`, was.t, `${e.d} vanished for ${ms(e.t - was.t)} and came back`);
      const twin = removedByDesc.get(e.d);
      if (twin && twin.id !== e.id && e.t - twin.t > 12 && e.t - twin.t <= T.flickerMs && !e.off && sameRect(twin.r, e.r)) find("flicker", `${e.d}|replaced`, twin.t, `${e.d} was taken away and a new one put in its place ${ms(e.t - twin.t)} later (blank between)`);
      last.set(e.id, { type: "add", t: e.t });
    } else if (e.e === "text") {
      const was = last.get(`text${e.id}`);
      if (was && was.to === e.to) {
        // (nothing: unchanged)
      }
      if (was && was.from === e.to && e.t - was.t <= T.flickerMs) find("flicker", `${desc(e.id)}|text`, was.t, `${desc(e.id)} text "${was.from}" → "${was.to}" → back within ${ms(e.t - was.t)}`);
      last.set(`text${e.id}`, { t: e.t, from: e.from, to: e.to });
    } else if (e.e === "fade") {
      const was = last.get(`fade${e.id}`);
      if (was && was.down && e.to > e.from && e.t - was.t <= T.flickerMs && was.from - was.low >= 0.3) find("flicker", `${desc(e.id)}|dip`, was.t, `${desc(e.id)} dipped in opacity (${was.from} → ${was.low} → up) within ${ms(e.t - was.t)}`);
      if (was && was.down && e.to < e.from) was.low = e.to;
      else last.set(`fade${e.id}`, { t: e.t, down: e.to < e.from, from: e.from, low: e.to });
    }
  }
}

function sameRect(a, b) {
  return a && b && Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2 && Math.abs(a[2] - b[2]) < 2 && Math.abs(a[3] - b[3]) < 2;
}

// 3. Pops: a sheet, toast, bar or pane appearing or going all at once, at
// full opacity, with no movement or fade around it (only the outermost of
// what appears together is reported).
{
  const byFrame = new Map();
  for (const e of events) if (e.e === "add" || e.e === "remove") {
    if (!byFrame.has(e.t)) byFrame.set(e.t, new Set());
    byFrame.get(e.t).add(e.id);
  }
  const animated = (id, from, to) => events.some((x) => x.id === id && (x.e === "move" || x.e === "fade") && x.t >= from && x.t <= to);
  for (const e of events) {
    if ((e.e !== "add" && e.e !== "remove") || e.base || e.off || !T.popKinds.has(kind(e.id))) continue;
    const together = [...byFrame.entries()].filter(([t]) => Math.abs(t - e.t) <= 20).flatMap(([, ids]) => [...ids]);
    if ([...ancestors(e.id)].some((a) => together.includes(a))) continue;
    if (e.e === "add" && (e.o ?? 1) >= 0.9 && !animated(e.id, e.t, e.t + 250)) find("pop", `${e.d}|in`, e.t, `${e.d} appeared at full opacity in one frame (no fade or slide)`);
    if (e.e === "remove" && !animated(e.id, e.t - 250, e.t)) find("pop", `${e.d}|out`, e.t, `${e.d} vanished in one frame (no fade or slide)`);
  }
  for (const e of events)
    if (e.e === "fade" && T.popKinds.has(kind(e.id)) && Math.abs(e.to - e.from) >= 0.8) find("pop", `${desc(e.id)}|fade`, e.t, `${desc(e.id)} opacity ${e.from} → ${e.to} in a single frame`);
}

// 4. Scroll jumps: far in one frame with no input just before.
for (const e of events) {
  if (e.e !== "scroll" || e.off) continue;
  const by = e.to - e.from;
  const quiet = sinceInput(e.t);
  if (Math.abs(by) > T.scrollJumpPx && quiet > T.scrollJumpQuietMs) {
    const i = lastInputBefore(e.t);
    find("scroll jump", `${desc(e.id)}`, e.t, `${desc(e.id)} jumped ${sign(by)} in one frame (${e.from} → ${e.to})${i ? `, ${ms(quiet)} after the last input (${i.type}${i.detail ? " " + i.detail : ""})` : ", no input"}`);
  }
}

// 5. Late settling: visible change going on long after the hand let go.
// A pane's own glide (its scroll continuing frame after frame from the
// input) belongs to the hand; settling is measured from its end.
{
  const changes = events.filter(visibleChange);
  const scrollsOf = new Map();
  for (const e of events) if (e.e === "scroll") (scrollsOf.get(e.id) || scrollsOf.set(e.id, []).get(e.id)).push(e.t);
  for (let i = 0; i < handInputs.length; i++) {
    const input = handInputs[i];
    const next = handInputs[i + 1]?.t ?? Infinity;
    if (next - input.t < 50) continue; // a burst: judged from its last input
    // The hand's glide: any pane's scroll running on, frame to frame, from the input.
    let handEnd = input.t;
    for (const times of scrollsOf.values()) {
      let k = times.findIndex((t) => t >= input.t);
      if (k < 0 || times[k] - input.t > 60) continue;
      let end = times[k];
      while (k + 1 < times.length && times[k + 1] - times[k] < 60 && times[k + 1] < next) end = times[++k];
      handEnd = Math.max(handEnd, end);
    }
    const after = changes.filter((c) => c.t > input.t && c.t < next);
    if (!after.length) continue;
    const lastChange = after[after.length - 1];
    if (lastChange.t - handEnd <= T.lateSettleMs) continue;
    const late = after.filter((c) => c.t > handEnd + T.lateSettleMs);
    const what = [...new Set(late.map((c) => `${c.e} ${desc(c.id) || c.d}`))].slice(0, 4).join("; ");
    find("late settle", `${input.t}`, input.t, `still changing ${ms(lastChange.t - handEnd)} after the ${handEnd > input.t ? "glide ended" : `input (${input.type}${input.detail ? " " + input.detail : ""})`}: ${late.length} changes after ${ms(T.lateSettleMs)}, last at ${at(lastChange.t)} — ${what}`);
  }
}

// 6. Dropped frames: a long gap between frames while something moves.
{
  const frames = events.filter((e) => e.e === "f");
  const motionTimes = events.filter((e) => e.e === "move" || e.e === "scroll" || e.e === "fade" || e.e === "panes").map((e) => e.t);
  const moving = (t0, t1) => motionTimes.some((t) => t >= t0 - 40 && t <= t0) && motionTimes.some((t) => t > t1 && t <= t1 + 40);
  let gaps = [];
  for (let i = 1; i < frames.length; i++) {
    const gap = frames[i].t - frames[i - 1].t;
    // (A frame the logger itself made slow is not the app's.)
    const own = frames[i - 1].c ?? 0;
    if (gap > T.frameGapMs && gap - own > T.frameGapMs && moving(frames[i - 1].t, frames[i].t)) gaps.push({ t: frames[i - 1].t, gap, own });
  }
  // (Grouped by second.)
  const bySecond = new Map();
  for (const g of gaps) {
    const s = Math.floor(g.t / 1000);
    if (!bySecond.has(s)) bySecond.set(s, []);
    bySecond.get(s).push(g);
  }
  for (const [, list] of bySecond) {
    const worst = list.reduce((a, b) => (b.gap > a.gap ? b : a));
    find("dropped frames", `${list[0].t}`, list[0].t, `${list.length} frame gap${list.length > 1 ? "s" : ""} over ${ms(T.frameGapMs)} while moving, worst ${ms(worst.gap)} at ${at(worst.t)}${worst.own > 5 ? ` (logger's own work ${ms(worst.own)})` : ""}`);
  }
}

// 7–9. At rest: overlap, misalignment, clipped text.
{
  const textual = new Set(["text", "para", "row", "button", "heading"]);
  const seenRest = new Set();
  for (const rest of events.filter((e) => e.e === "rest")) {
    const items = rest.items.map(([id, x, y, w, h, clip, vis, textX]) => ({ id, x, y, w, h, clip, vis: vis || [x, y, w, h], textX }));
    const fingerprint = items.map((i) => `${i.id}:${Math.round(i.x)}:${Math.round(i.y)}`).join(",");
    if (seenRest.has(fingerprint)) continue;
    seenRest.add(fingerprint);
    // Overlap: text over a bar (not content scrolling beneath it), or two
    // pieces of text over each other, neither holding the other.
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        const ka = kind(a.id);
        const kb = kind(b.id);
        const barPair = (ka === "bar") !== (kb === "bar");
        const textPair = textual.has(ka) && textual.has(kb);
        if (!barPair && !textPair) continue;
        // (Words over something: at least one of the two shows words.)
        if (!elements.get(a.id)?.tx && !elements.get(b.id)?.tx) continue;
        // (Content scrolling under a bar is by design: only what moves
        // together is compared.)
        if (scrollerOf(a.id) !== scrollerOf(b.id) || sheetOf(a.id) !== sheetOf(b.id)) continue;
        if (barPair) {
          const other = ka === "bar" ? a : b;
          if (!textual.has(kind(other.id)) || elements.get(other.id)?.sc) continue;
        }
        const [ax, ay, aw, ah] = a.vis;
        const [bx, by, bw, bh] = b.vis;
        const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
        const oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
        if (ox < T.overlapMinPx || oy < T.overlapMinPx) continue;
        const contains = (p, q) => p[0] <= q[0] + 1 && p[1] <= q[1] + 1 && p[0] + p[2] >= q[0] + q[2] - 1 && p[1] + p[3] >= q[1] + q[3] - 1;
        if (contains(a.vis, b.vis) || contains(b.vis, a.vis)) continue;
        if (ancestors(a.id).has(b.id) || ancestors(b.id).has(a.id)) continue;
        find("overlap", `${desc(a.id)}|${desc(b.id)}`, rest.t, `${desc(a.id)} and ${desc(b.id)} overlap by ${Math.round(ox)}×${Math.round(oy)} at rest`);
      }
    }
    // Misalignment: where words begin, a little apart, among text in the
    // same column (overlapping horizontally, stacked) of the same sheet (on
    // the web, where the first glyph is; on the iPhone, the label's left).
    const lefts = items.filter((i) => textual.has(kind(i.id)) && i.w > 8 && (ios || i.textX != null)).map((i) => ({ ...i, left: i.textX ?? i.x }));
    for (let i = 0; i < lefts.length; i++) {
      for (let j = i + 1; j < lefts.length; j++) {
        const a = lefts[i];
        const b = lefts[j];
        if (sheetOf(a.id) !== sheetOf(b.id)) continue;
        const d = Math.abs(a.left - b.left);
        if (d < T.misalignMinPx || d > T.misalignMaxPx) continue;
        const stacked = a.y + a.h <= b.y + 2 || b.y + b.h <= a.y + 2;
        const sameColumn = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 20;
        if (!stacked || !sameColumn) continue;
        if (Math.abs(a.y - b.y) > 200) continue; // (near each other, where the eye compares them)
        // (Reader paragraphs are indented by design; only labels and rows.)
        if (kind(a.id) === "para" && kind(b.id) === "para") continue;
        find("misalignment", `${desc(a.id)}|${desc(b.id)}`, rest.t, `words begin at ${Math.round(a.left * 10) / 10} vs ${Math.round(b.left * 10) / 10} (${Math.round(d * 10) / 10} apart): ${desc(a.id)} / ${desc(b.id)}`);
      }
    }
    for (const i of items) if (i.clip) find("clipped text", `${desc(i.id)}`, rest.t, `${desc(i.id)} is cut off (its text is wider than its box)`);
  }
}

// 10. The linked panes: how the follower keeps up with the leader.
const linkReport = [];
{
  const records = events.filter((e) => e.e === "panes");
  const episodes = [];
  // (Each episode begins with the record before it, where the panes
  // were at rest, so its first frame's steps are seen.)
  let previous = null;
  for (const r of records) {
    const last = episodes[episodes.length - 1];
    if (last && r.t - last[last.length - 1].t <= T.linkEpisodeGapMs) last.push(r);
    else episodes.push(previous ? Object.assign([previous, r], { begins: 1 }) : Object.assign([r], { begins: 0 }));
    previous = r;
  }
  const placeValue = (s) => {
    const m = s && /^(-?\d+):(l|a)?(-?\d+)\.(\d+)$/.exec(s);
    return m ? { c: +m[1], comment: m[2] === "l", anchor: m[2] === "a", x: +m[3] + +m[4] / 100 } : null;
  };
  for (const ep of episodes) {
    if (ep.length < 4) continue;
    const t0 = ep[ep.begins].t;
    const t1 = ep[ep.length - 1].t;
    // The leader: the pane the hand was last in.
    const hand = [...handInputs].reverse().find((i) => i.t <= t0 + 60 && i.pane !== undefined);
    const leader = hand ? hand.pane : 0;
    const follower = 1 - leader;
    const name = ["page", "panel"];
    const L = ep.map((r) => r.p[leader]);
    const F = ep.map((r) => r.p[follower]);
    const steps = (s) => s.slice(1).map((y, i) => y - s[i]);
    const dL = steps(L);
    const dF = steps(F);
    const moved = (d) => d.findIndex((x) => Math.abs(x) >= 0.5);
    const lastMoved = (d) => {
      for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]) >= 0.5) return i;
      return -1;
    };
    const lFirst = moved(dL);
    const fFirst = moved(dF);
    const lLast = lastMoved(dL);
    const fLast = lastMoved(dF);
    if (lFirst < 0 && fFirst < 0) continue;
    const lines = [];
    // (A jump, as Go To's, not a glide: a few frames.)
    const movingFrames = dL.filter((x, i) => Math.abs(x) >= 0.5 || Math.abs(dF[i]) >= 0.5).length;
    if (movingFrames < 5) {
      const lastAt = ep[ep.length - 1].at || [];
      linkReport.push(`${at(t0)}: both panes jumped (page ${sign(Math.round(ep[ep.length - 1].p[0] - ep[0].p[0]))}, panel ${sign(Math.round(ep[ep.length - 1].p[1] - ep[0].p[1]))}) in ${movingFrames} frame(s); places then: page ${lastAt[0]}, panel ${lastAt[1]}`);
      continue;
    }
    lines.push(`${at(t0)}–${at(t1)}: ${name[leader]} leads (${hand ? hand.type : "no input seen"}), ${name[follower]} follows; ${ep.length} frames; leader moved ${Math.round(L[L.length - 1] - L[0])}, follower ${Math.round(F[F.length - 1] - F[0])}`);
    if (lFirst < 0) {
      lines.push(`  only the follower moved (${Math.round(F[F.length - 1] - F[0])}): a correction with the leader at rest`);
    } else if (fFirst < 0) {
      lines.push(`  the follower never moved (not linked, or it didn't follow)`);
    } else {
      // Lag: frames from the leader's first move to the follower's; and the
      // best-matching shift of the two step sequences.
      if (fFirst < lFirst) lines.push(`  the follower moved first (still settling from before)`);
      else lines.push(`  start lag: follower first moved ${fFirst - lFirst} frame(s) (${ms(ep[fFirst + 1].t - ep[lFirst + 1].t)}) after the leader`);
      // (Pearson's correlation of the two step sequences, the follower's
      // shifted k frames later, over the leader's motion.)
      let best;
      const scores = [];
      const span = dL.slice(Math.max(0, lFirst), lLast + 1);
      for (let k = 0; k <= 6; k++) {
        const fs = dF.slice(Math.max(0, lFirst) + k, lLast + 1 + k);
        const n = Math.min(span.length, fs.length);
        if (n < 4) {
          scores.push(-Infinity);
          continue;
        }
        const ma = span.slice(0, n).reduce((a, b) => a + b, 0) / n;
        const mb = fs.slice(0, n).reduce((a, b) => a + b, 0) / n;
        let sab = 0;
        let saa = 0;
        let sbb = 0;
        for (let i = 0; i < n; i++) {
          sab += (span[i] - ma) * (fs[i] - mb);
          saa += (span[i] - ma) ** 2;
          sbb += (fs[i] - mb) ** 2;
        }
        scores.push(saa && sbb ? sab / Math.sqrt(saa * sbb) : -Infinity);
      }
      const top = Math.max(...scores);
      best = { k: scores.findIndex((x) => x >= 0.9 * top), score: top };
      if (best.score > 0.3) lines.push(`  typical lag: ${best.k} frame(s) (the follower's steps match the leader's best ${best.k} frame(s) later, correlation ${best.score.toFixed(2)})`);
      else lines.push(`  typical lag: unclear (the follower's steps don't track the leader's changes of speed; best correlation ${best.score.toFixed(2)})`);
      // Jerk: the follower's steps against the leader's, while the leader moves.
      const active = [];
      for (let i = Math.max(0, lFirst); i <= lLast; i++) active.push(i);
      const typicalL = median(active.map((i) => Math.abs(dL[i])).filter((x) => x > 0)) || 1;
      const accel = (d, idx) => idx.slice(1).map((i, k) => Math.abs(d[i] - d[idx[k]]));
      const aL = accel(dL, active);
      const aF = accel(dF, active.map((i) => Math.min(i + best.k, dF.length - 1)));
      const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / Math.max(1, a.length));
      const show = (d) => d.slice(Math.max(0, lFirst), Math.max(0, lFirst) + 24).map((x) => Math.round(x)).join(" ");
      lines.push(`  steps a frame, leader:   ${show(dL)}`);
      lines.push(`  steps a frame, follower: ${show(dF)}`);
      lines.push(`  smoothness while the leader moves: frame-to-frame change of step, leader RMS ${rms(aL).toFixed(1)}, follower RMS ${rms(aF).toFixed(1)} (${(rms(aF) / Math.max(0.1, rms(aL))).toFixed(1)}×)`);
      const spikes = [];
      for (let i = 1; i < active.length; i++) {
        const k = Math.min(active[i] + best.k, dF.length - 1);
        const prev = Math.min(active[i - 1] + best.k, dF.length - 1);
        if (Math.abs(dF[k]) > T.spikeFactor * typicalL && Math.abs(dF[k] - dF[prev]) >= T.spikeMinPx) spikes.push({ t: ep[k + 1].t, step: dF[k], lead: dL[active[i]] });
      }
      if (spikes.length) lines.push(`  follower spikes: ${spikes.length} (steps over ${T.spikeFactor}× the leader's typical ${typicalL.toFixed(1)}/frame): ${spikes.slice(0, 5).map((s) => `${at(s.t)} ${sign(Math.round(s.step))} vs leader ${sign(Math.round(s.lead))}`).join(", ")}`);
      // Reversals: the follower stepping against the leader's direction.
      const direction = Math.sign(L[lLast + 1] - L[lFirst]);
      const reversals = [];
      for (let i = 0; i < dF.length; i++) if (direction && Math.sign(dF[i]) === -direction && Math.abs(dF[i]) >= T.reverseMinPx) reversals.push({ t: ep[i + 1].t, step: dF[i], leaderAtRest: i > lLast });
      if (reversals.length) {
        const during = reversals.filter((r) => !r.leaderAtRest);
        const afterRest = reversals.filter((r) => r.leaderAtRest);
        if (during.length) lines.push(`  snap-back while the leader moves: ${during.length} step(s) backwards, total ${Math.round(during.reduce((s, r) => s + Math.abs(r.step), 0))}: ${during.slice(0, 5).map((r) => `${at(r.t)} ${sign(Math.round(r.step))}`).join(", ")}`);
        if (afterRest.length) lines.push(`  snap-back after the leader stopped: ${afterRest.length} step(s) backwards, total ${Math.round(afterRest.reduce((s, r) => s + Math.abs(r.step), 0))}: ${afterRest.slice(0, 5).map((r) => `${at(r.t)} ${sign(Math.round(r.step))}`).join(", ")}`);
      }
      // Catch-up: the follower still moving after the leader stopped.
      if (fLast > lLast) {
        const catchUp = F[fLast + 1] - F[lLast + 1];
        lines.push(`  catch-up: follower kept moving ${ms(ep[fLast + 1].t - ep[lLast + 1].t)} (${fLast - lLast} frames, ${sign(Math.round(catchUp))}) after the leader stopped`);
      }
    }
    // Off: the follower's place against the leader's, in verses.
    const offs = [];
    for (const r of ep) {
      const a = placeValue(r.at?.[leader]);
      const b = placeValue(r.at?.[follower]);
      if (a && b && !a.comment && !b.comment && a.c === b.c) offs.push(b.x - a.x);
    }
    if (offs.length) {
      const end = offs[offs.length - 1];
      const unit = ep.some((r) => /:a/.test(r.at?.[0] || "")) ? "anchors (the same as verses only for two Bibles)" : "verses";
      lines.push(`  off (follower − leader at the reading lines, in ${unit}): mean |${(offs.reduce((s, x) => s + Math.abs(x), 0) / offs.length).toFixed(2)}|, worst ${sign(offs.reduce((m, x) => (Math.abs(x) > Math.abs(m) ? x : m), 0).toFixed(2))}, at the end ${sign(end.toFixed(2))} (${ep[ep.length - 1].at[leader]} vs ${ep[ep.length - 1].at[follower]})`);
    } else {
      const lastAt = ep[ep.length - 1].at;
      if (lastAt) lines.push(`  places at the end: ${name[leader]} ${lastAt[leader]}, ${name[follower]} ${lastAt[follower]}`);
    }
    linkReport.push(lines.join("\n"));
  }
}

function median(a) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

// ---- the report ----
const timelineIndex = args.indexOf("--timeline");
if (timelineIndex >= 0) {
  const range = /^(\d+)-(\d+)$/.exec(args[timelineIndex + 1] || "");
  printTimeline(range ? +range[1] : 0, range ? +range[2] : Infinity);
  process.exit(0);
}

const frames = events.filter((e) => e.e === "f");
const cost = frames.map((f) => f.c ?? 0).sort((a, b) => a - b);
const end = events[events.length - 1]?.t ?? 0;
console.log(`${meta.platform} log, ${(end / 1000).toFixed(1)} s, ${frames.length} frames, ${events.filter((e) => e.e === "input").length} inputs${meta.viewport ? `, viewport ${meta.viewport.join("×")}` : ""}${meta.build ? `, build ${Object.values(meta.build).filter(Boolean).join(" ")}` : ""}`);
if (cost.length) console.log(`logger's own work a frame: median ${cost[cost.length >> 1]} ms, worst ${cost[cost.length - 1]} ms`);
const marks = events.filter((e) => e.e === "mark");
if (marks.length) console.log(`steps: ${marks.map((m) => `${at(m.t)} ${m.label}`).join(" | ")}`);
const order = ["layout jump after appearing", "flicker", "pop", "scroll jump", "late settle", "dropped frames", "overlap", "misalignment", "clipped text"];
const all = args.includes("--all");
let any = false;
for (const rule of order) {
  const list = [...findings.values()].filter((f) => f.rule === rule).sort((a, b) => a.t - b.t);
  if (!list.length) continue;
  any = true;
  console.log(`\n${rule.toUpperCase()} (${list.length})`);
  for (const f of all ? list : list.slice(0, 12)) {
    const times = f.times.length > 1 ? ` [${f.times.length}×: ${f.times.slice(0, 6).map(at).join(", ")}${f.times.length > 6 ? ", …" : ""}]` : "";
    console.log(`  ${at(f.t)}  ${f.message}${times}`);
  }
  if (!all && list.length > 12) console.log(`  … ${list.length - 12} more (--all)`);
}
if (linkReport.length) {
  any = true;
  console.log(`\nLINKED PANES (${linkReport.length} episode${linkReport.length > 1 ? "s" : ""})`);
  for (const r of linkReport) console.log(r);
}
if (!any) console.log("\nnothing awkward found");

// What changed, frame by frame, condensed: each frame's events on one or
// a few lines; moves of many elements in one frame summarised.
function printTimeline(from, to) {
  const inRange = events.filter((e) => e.t >= from && e.t <= to && e.e !== "f" && e.e !== "meta" && !(e.e === "add" && e.off));
  const byT = new Map();
  for (const e of inRange) {
    const key = Math.round(e.t);
    if (!byT.has(key)) byT.set(key, []);
    byT.get(key).push(e);
  }
  for (const [t, list] of byT) {
    const parts = [];
    const moves = list.filter((e) => e.e === "move");
    if (moves.length > 4) {
      const dy = median(moves.map((m) => m.dy));
      parts.push(`move ×${moves.length} (median dy ${sign(dy)}; e.g. ${moves[0].d})`);
    } else for (const m of moves) parts.push(`move ${m.d} ${[m.dx && `dx ${sign(m.dx)}`, m.dy && `dy ${sign(m.dy)}`, m.dw && `dw ${sign(m.dw)}`, m.dh && `dh ${sign(m.dh)}`].filter(Boolean).join(" ")}`);
    const adds = list.filter((e) => e.e === "add");
    if (adds.length > 4) parts.push(`add ×${adds.length} (e.g. ${adds.slice(0, 3).map((a) => a.d).join("; ")})`);
    else for (const a of adds) parts.push(`add ${a.d}${a.o !== undefined && a.o < 1 ? ` o ${a.o}` : ""} at ${a.r.map(Math.round).join(",")}`);
    const removes = list.filter((e) => e.e === "remove");
    if (removes.length > 4) parts.push(`remove ×${removes.length} (e.g. ${removes.slice(0, 3).map((a) => a.d).join("; ")})`);
    else for (const r of removes) parts.push(`remove ${r.d}`);
    for (const e of list) {
      if (e.e === "fade") parts.push(`fade ${e.d} ${e.from}→${e.to}`);
      else if (e.e === "text") parts.push(`text ${e.d}: "${e.from}" → "${e.to}"`);
      else if (e.e === "scroll") parts.push(`scroll ${e.d} ${e.from}→${e.to} (${sign(e.to - e.from)})`);
      else if (e.e === "input") parts.push(`INPUT ${e.type}${e.detail ? " " + e.detail : ""}${e.key ? " " + e.key : ""}${e.dy ? " dy " + e.dy : ""}${e.pane !== undefined ? " pane " + e.pane : ""}${e.on ? " on " + e.on : ""}`);
      else if (e.e === "mark") parts.push(`== ${e.label} ==`);
      else if (e.e === "panes") parts.push(`panes page ${e.p[0]} panel ${e.p[1]} at ${e.at ? e.at.join(" / ") : "?"}`);
      else if (e.e === "rest") parts.push(`(rest: ${e.items.length} on screen)`);
      else if (e.e === "walk") parts.push(`(walk ${e.views} views ${e.ms} ms)`);
    }
    if (parts.length) console.log(`${(t / 1000).toFixed(3)}  ${parts.join(" | ")}`);
  }
}
