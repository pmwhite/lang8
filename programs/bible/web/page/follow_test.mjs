// The web's following checked against core/follow.l8's cases:
//   node programs/bible/web/page/follow_test.mjs .build/link-cases.txt
import fs from "node:fs";
import { newLinks, addLinks, bottomMove, topMove, glide, placeY, linePlace } from "./follow.js";

const lines = fs.readFileSync(process.argv[2], "utf8").split("\n");
const nums = (l) => l.trim().split(/\s+/).slice(1);
const shape = (l) => {
  const w = nums(l).map((x) => (x === "-" ? null : Number(x)));
  return { top: w[0], end: w[1], starts: w.slice(2) };
};
const map = (l, mode, comments) => {
  const w = nums(l).map(Number);
  const m = { mode, comments, i0: [], i1: [], j: [] };
  for (let k = 0; k + 2 < w.length; k += 3) {
    m.i0.push(w[k]);
    m.i1.push(w[k + 1]);
    m.j.push(w[k + 2]);
  }
  return m;
};
let n = 0;
let bad = 0;
const fail = (what, got, want) => {
  bad++;
  if (bad <= 10) console.error(`case ${n} (${what}): got ${got}, want ${want}`);
};
const show = (y) => (y === null ? "stay" : `to ${y}`);
const same = (got, want) => (want === "stay" ? got === null : got !== null && Math.abs(got - Number(want.slice(3))) <= 0.01);
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.startsWith("bottom ") || l.startsWith("top ")) {
    const w = nums(l).map(Number);
    const [mode, comments] = w;
    const links = newLinks();
    while (/^map( |$)/.test(lines[i + 1])) {
      addLinks(links, map(lines[i + 1], mode, comments), shape(lines[i + 2]), shape(lines[i + 3]));
      i += 3;
    }
    const want = lines[i + 1].slice(7);
    const got = l.startsWith("bottom ") ? bottomMove(links, w[2], w[3], w[4]) : topMove(links, w[2], w[3], w[4], w[5]);
    n++;
    if (!same(got, want)) fail(l.split(" ")[0], show(got), want);
    i += 1;
  } else if (l.startsWith("glide ")) {
    const [at, to, velocity, s] = nums(l).map(Number);
    const [wantAt, wantVelocity] = nums(lines[i + 1]).map(Number);
    n++;
    const got = glide(at, to, velocity, s);
    if (Math.abs(got.at - wantAt) > 0.01 || Math.abs(got.velocity - wantVelocity) > 0.01) fail("glide", `${got.at} ${got.velocity}`, `${wantAt} ${wantVelocity}`);
    i += 1;
  } else if (l.startsWith("place ")) {
    const [pi, frac] = nums(l).map(Number);
    const s = shape(lines[i + 1]);
    const want = Number(lines[i + 2].slice(7));
    n++;
    const got = placeY(s, pi, frac);
    if (Math.abs(got - want) > 0.01) fail("place", got, want);
    i += 2;
  } else if (l.startsWith("at ")) {
    const [line] = nums(l).map(Number);
    const s = shape(lines[i + 1]);
    const want = lines[i + 2].slice(7);
    n++;
    const p = linePlace(s, line);
    const got = `${p.i} ${p.frac}`;
    if (got !== want) fail("at", got, want);
    i += 2;
  }
}
if (bad) {
  console.error(`${bad} of ${n} cases differ`);
  process.exit(1);
}
console.log(`${n} cases match`);
