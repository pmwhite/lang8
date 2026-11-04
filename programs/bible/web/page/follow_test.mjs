// The web's following checked against core/follow.l8's cases:
//   node programs/bible/web/page/follow_test.mjs .build/link-cases.txt
import fs from "node:fs";
import { followPairs, followByVerse, commentFromVerses, versesFromComment, runChapter } from "./follow.js";

const lines = fs.readFileSync(process.argv[2], "utf8").split("\n");
const nums = (l) => l.trim().split(/\s+/).slice(1);
const shape = (l, em) => {
  const w = nums(l).map((x) => (x === "-" ? null : Number(x)));
  return { top: w[0], end: w[1], starts: w.slice(2), em };
};
const map = (l) => {
  const w = nums(l).map(Number);
  const m = { i0: [], i1: [], j: [] };
  for (let k = 0; k + 2 < w.length; k += 3) {
    m.i0.push(w[k]);
    m.i1.push(w[k + 1]);
    m.j.push(w[k + 2]);
  }
  return m;
};
const step = (s) => (s === null ? "stay" : `go ${s}`);
let n = 0;
let bad = 0;
const fail = (what, got, want) => {
  bad++;
  if (bad <= 10) console.error(`case ${n} (${what}): got ${got}, want ${want}`);
};
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.startsWith("verse ")) {
    const [pl, lem, fem, line] = nums(l).map(Number);
    const m = map(lines[i + 1]);
    const page = shape(lines[i + 2]);
    const panel = shape(lines[i + 3]);
    const want = lines[i + 4].slice(7);
    const got = followByVerse(followPairs(m, page, panel, pl === 1), line, lem, fem);
    n++;
    if (want === "none" ? got !== null : got === null || Math.abs(got - Number(want)) > 0.01) fail("verse", got, want);
    i += 4;
  } else if (l.startsWith("map ") && lines[i + 1]?.startsWith("panel ")) {
    const m = map(l);
    const panel = shape(lines[i + 1]);
    const [pi, pj, line] = nums(lines[i + 2]).map(Number);
    const want = lines[i + 3].slice(7);
    n++;
    const got = step(commentFromVerses(m, pi, pj, panel, line));
    if (got !== want) fail("frompage", got, want);
    i += 3;
  } else if (l.startsWith("run ")) {
    const [from, to, pageC] = nums(l).map(Number);
    const want = lines[i + 1].slice(7);
    n++;
    const c = runChapter(from, to, pageC);
    const got = c === null ? "stay" : `go ${c}`;
    if (got !== want) fail("run", got, want);
    i += 1;
  } else if (l.startsWith("map ") && lines[i + 1]?.startsWith("frompanel ")) {
    const m = map(l);
    const [pj, pi] = nums(lines[i + 1]).map(Number);
    const want = lines[i + 2].slice(7);
    n++;
    const got = step(versesFromComment(m, pj, pi));
    if (got !== want) fail("frompanel", got, want);
    i += 2;
  }
}
if (bad) {
  console.error(`${bad} of ${n} cases differ`);
  process.exit(1);
}
console.log(`${n} cases match`);
