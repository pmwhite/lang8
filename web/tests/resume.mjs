#!/usr/bin/env node
// node web/tests/resume.mjs resumable.wasm plain.wasm
// Run resume.l8 built with `--async l8_pause` (pausing at every call) and
// without it, and require the same output and exit status.
import fs from "node:fs";
import { instantiate, runStart, runResumable, pausing } from "../l8-runtime.js";

async function run(path, resumable) {
  const out = [];
  const sys = {
    args: ["resume"],
    env: [],
    write: (fd, data) => (out.push(new TextDecoder().decode(data)), data.length),
    read: () => new Uint8Array(0),
    open: () => -2,
    close: () => 0,
  };
  let pauses = 0;
  const pause = resumable ? pausing(() => 100n) : () => 100n;
  const module = await WebAssembly.compile(fs.readFileSync(path));
  const { instance } = await instantiate(module, sys, { l8_pause: pause });
  const status = resumable
    ? await runResumable(instance, () => new Promise((r) => setTimeout(() => (pauses++, r()), 0)))
    : runStart(instance);
  return { output: out.join(""), status, pauses };
}

const a = await run(process.argv[2], true);
const b = await run(process.argv[3], false);
if (a.output !== b.output || a.status !== b.status || a.status !== 7 || a.pauses !== 12) {
  console.error("resumable run differs:", JSON.stringify(a), JSON.stringify(b));
  process.exit(1);
}
console.log(`${a.pauses} pauses, same output and status`);
