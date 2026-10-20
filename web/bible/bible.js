// Smooth Bible on the web (programs/bible/web.l8): the module started with
// the page bridge (../dom.js). Main sets the page up and returns; the
// reader lives on in its callbacks. #html builds chapters as one string of
// HTML instead of nodes (to compare); #bench=N builds one N times.
import { instantiate, runStart } from "../l8-runtime.js";
import { domHost } from "../dom.js";

const hash = new URLSearchParams(location.hash.slice(1));
window.l8_html = hash.has("html") ? 1 : 0;
window.l8_bench = Number(hash.get("bench") || 0);

const decoder = new TextDecoder();
const sys = {
  args: ["bible"],
  env: [],
  write(fd, data) {
    (fd === 2 ? console.error : console.log)(decoder.decode(data));
    return data.length;
  },
  read: () => -9,
  open: () => -2,
  close: () => -9,
};

const t0 = performance.now();
const module = await WebAssembly.compileStreaming(fetch("bible.wasm"));
window.l8_compile_ms = performance.now() - t0;
const dom = domHost();
const { instance } = await instantiate(module, sys, dom.imports);
dom.attach(instance);
window.l8_start_ms = performance.now();
runStart(instance);
