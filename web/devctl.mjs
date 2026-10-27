#!/usr/bin/env node
// A command for the device running the hot reload host (RELOAD.md), through
// web/dev.mjs:
//   node web/devctl.mjs [--server http://localhost:8777] shot       a screenshot, its file printed
//   node web/devctl.mjs notify NAME                                 a Darwin notification posted
//   node web/devctl.mjs scroll DY                                  the first scroll view moved by DY points
//   node web/devctl.mjs wire LINE [| LINE...]                       lines for the app's core (as a skin sends: tap shelf)
//   node web/devctl.mjs reload | exit | say TEXT
//   node web/devctl.mjs log                                         the device's lines so far
const argv = process.argv.slice(2);
let server = "http://localhost:8777";
if (argv[0] === "--server") {
  server = argv[1];
  argv.splice(0, 2);
}
const cmd = argv.join(" ");
if (!cmd) {
  console.error("usage: node web/devctl.mjs [--server URL] shot | notify NAME | scroll DY | wire LINE | reload | exit | say TEXT | log");
  process.exit(2);
}
if (argv[0] === "wire") {
  const lines = argv.slice(1).join(" ").split("|").map((l) => l.trim()).join("\n");
  const r = await (await fetch(`${server}/wire`, { method: "POST", body: lines })).json();
  console.log(`wire ${r.id} queued`);
  process.exit(0);
}
if (cmd === "log") {
  process.stdout.write(await (await fetch(`${server}/log`)).text());
  process.exit(0);
}
const before = cmd === "shot" ? (await (await fetch(`${server}/shots/latest`)).json()).shot : 0;
const r = await (await fetch(`${server}/control`, { method: "POST", body: cmd })).json();
if (cmd !== "shot") {
  console.log(`command ${r.id} queued`);
  process.exit(0);
}
for (let i = 0; i < 60; i++) {
  await new Promise((d) => setTimeout(d, 500));
  const latest = await (await fetch(`${server}/shots/latest`)).json();
  if (latest.shot > before) {
    console.log(latest.file);
    process.exit(0);
  }
}
console.error("no screenshot came within 30 s");
process.exit(1);
