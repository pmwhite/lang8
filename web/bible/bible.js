// Smooth Bible on the web: starts the reader (programs/bible/web.l8) with
// the page bridge (../dom.js). The boot script imports this once the
// browser is known to run the module. build.py puts the assets' hashed
// names in for the {{...}} and the imports' paths.
import { instantiate, runStart } from "../l8-runtime.js";
import { domHost } from "../dom.js";

window.sbData = {
  bsb: "{{data_bsb}}", kjv: "{{data_kjv}}", web: "{{data_web}}", asv: "{{data_asv}}", ylt: "{{data_ylt}}",
  icons: "{{icons}}",
};

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

const module = await WebAssembly.compileStreaming(fetch("{{wasm}}"));
const dom = domHost();
const { instance } = await instantiate(module, sys, dom.imports);
dom.attach(instance);
runStart(instance);
