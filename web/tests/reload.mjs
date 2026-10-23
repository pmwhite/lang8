#!/usr/bin/env node
// node web/tests/reload.mjs v1.wasm v2.wasm
// Run reload_v1.l8 (built with `--async l8_pause`) until it pauses, reload
// it as reload_v2.l8, and require v2 to see v1's persistent state as its
// own types take it, then run to its end.
import fs from "node:fs";
import { runResumable, pausing } from "../l8-runtime.js";
import { Reloader } from "../reload.js";

const out = [];
const logs = [];
const sys = {
  args: ["reload"],
  env: [],
  write: (fd, data) => (out.push(new TextDecoder().decode(data)), data.length),
  read: () => new Uint8Array(0),
  open: () => -2,
  close: () => 0,
};
// Each build's pauses wait on a gate of its own; v1's is never opened.
const gates = new Map();
let status = null;
const r = new Reloader({
  sys,
  imports: { l8_pause: pausing(() => 0n) },
  run: (instance, mem, generation) => runResumable(instance, () => new Promise((resolve) => gates.set(generation, resolve))).then((s) => (status = { generation, s })),
  log: (m) => logs.push(m),
});

await r.load(fs.readFileSync(process.argv[2]));
const v1 = out.join("");
out.length = 0;
if (v1 !== "v1 ready\n") fail(`v1 printed ${JSON.stringify(v1)}`);
if (!r.idle()) fail("v1 is not paused");

const { report } = await r.load(fs.readFileSync(process.argv[3]));
gates.get(2)();
await new Promise((resolve) => setTimeout(resolve, 0));
const v2 = out.join("");
const want = `node: 1
label: []
node: 2
label: []
node: 3
label: []
shared: yes
cycle: yes
book: 43
chapter: 3
verse: 0
John 3
marks: 2
at book: 19
color: 3
none
size x4: 5
true
Serif
Charis
counts: 24
extra: null
opened: 2
counter: 41
fresh
added: 77
small: 5
ratio x2: 5
yes
second
false
v2 ready
v2 resumed
`;
if (v2 !== want) fail(`v2 printed:\n${v2}\nwanted:\n${want}`);
if (!status || status.generation !== 2 || status.s !== 7) fail(`v2 ended ${JSON.stringify(status)}`);
const wantReport = {
  carried: ["flag", "word", "maybe", "ratio", "small", "counter", "opened"],
  migrated: ["settings", "marks", "place", "shared", "list"],
  initialized: ["added", "changes_type"],
  dropped: ["gone"],
};
for (const k of Object.keys(wantReport)) {
  const have = [...report[k]].sort().join(",");
  const w = [...wantReport[k]].sort().join(",");
  if (have !== w) fail(`${k}: ${have}, wanted ${w}`);
}
const wantLogs = ["added: new; its initializer runs", "changes_type: its type changed so that the value cannot follow; its initializer runs", "gone: gone; dropped", "list: carried into its changed type", "marks: carried into its changed type", "place: carried into its changed type", "reloaded: 12 persistent globals carried, 2 initialized, 1 dropped", "settings: carried into its changed type", "shared: carried into its changed type"];
const haveLogs = [...logs].sort().join("\n");
if (haveLogs !== wantLogs.join("\n")) fail(`log:\n${haveLogs}\nwanted:\n${wantLogs.join("\n")}`);
console.log(`reloaded: ${report.carried.length} carried, ${report.migrated.length} migrated, ${report.initialized.length} initialized, ${report.dropped.length} dropped; same output`);

function fail(msg) {
  console.error("reload test failed:", msg);
  process.exit(1);
}
