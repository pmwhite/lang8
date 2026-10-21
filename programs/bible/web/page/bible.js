// Smooth Bible on the web: starts the reader (programs/bible/web/app.l8) with
// the page bridge (web/dom.js). The boot script imports this once the
// browser is known to run the module, having started the first paint's
// fetches (window.l8Prefetch, by address), which the bridge takes up.
// build.py puts the assets' hashed names in for the {{...}} and the
// imports' paths.
import { instantiate, runStart } from "../../../../web/l8-runtime.js";
import { domHost } from "../../../../web/dom.js";

window.sbTimes = { module: performance.now() };
window.sbData = { data: "/read/data/{{data}}", icons: "/read/{{icons}}" };

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

const wasm = "/read/{{wasm}}";
const module = await WebAssembly.compileStreaming(window.l8Prefetch?.[wasm] || fetch(wasm));
window.sbTimes.compiled = performance.now();
const dom = domHost();
const { instance } = await instantiate(module, sys, dom.imports);
dom.attach(instance);
runStart(instance);
