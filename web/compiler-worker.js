// Runs the L8 compiler (l8.wasm) and the programs it builds, off the page's
// main thread. Messages in: {type: "run" | "format", source}. Messages out:
// {type: "ready"}, {type: "output", fd, text}, {type: "compiled", ms, size},
// {type: "done", status, ms}, {type: "formatted", source}, {type: "failed", message}.
import { instantiate, runStart, MemFS } from "./l8-runtime.js";

const STDLIB = ["print.l8", "write.l8", "raw_write.l8", "write.s"];

const decoder = new TextDecoder();
let compiler = null;
let stdlib = {};

const ready = (async () => {
  const [module, ...files] = await Promise.all([
    WebAssembly.compileStreaming(fetch("l8.wasm")),
    ...STDLIB.map((name) => fetch(`stdlib/${name}`).then((r) => r.text())),
  ]);
  compiler = module;
  STDLIB.forEach((name, i) => (stdlib[`/stdlib/${name}`] = files[i]));
  postMessage({ type: "ready" });
})();

// Output in batches, so a program writing one byte at a time stays fast.
function outputSink() {
  let pending = { 1: "", 2: "" };
  let last = performance.now();
  const flush = () => {
    for (const fd of [1, 2]) {
      if (pending[fd]) postMessage({ type: "output", fd, text: pending[fd] });
      pending[fd] = "";
    }
    last = performance.now();
  };
  const write = (fd, data) => {
    pending[fd] += decoder.decode(data, { stream: true });
    if (performance.now() - last > 30 || pending[fd].length > 65536) flush();
  };
  return { write, flush };
}

// Run the compiler with args over a file system holding main.l8 and the
// standard library. Returns the file system and the compiler's status.
async function compile(source, args, onOutput) {
  const fs = new MemFS({ ...stdlib, "/main.l8": source });
  fs.onOutput = onOutput;
  const { instance } = await instantiate(compiler, fs.sys(["l8", ...args]));
  return { fs, status: runStart(instance) };
}

async function run(source) {
  const sink = outputSink();
  let t0 = performance.now();
  const { fs, status } = await compile(source, ["wasm", "main.l8", "-o", "main.wasm"], sink.write);
  sink.flush();
  if (status !== 0) {
    postMessage({ type: "done", status, ms: performance.now() - t0, compileFailed: true });
    return;
  }
  const bytes = fs.readFile("/main.wasm");
  postMessage({ type: "compiled", ms: performance.now() - t0, size: bytes.length });
  t0 = performance.now();
  const program = await WebAssembly.compile(bytes);
  const runFs = new MemFS();
  runFs.onOutput = sink.write;
  const { instance } = await instantiate(program, runFs.sys(["main"]));
  let result;
  try {
    result = runStart(instance);
  } catch (e) {
    sink.flush();
    postMessage({ type: "output", fd: 2, text: `${e.name}: ${e.message}\n` });
    result = 134;
  }
  sink.flush();
  postMessage({ type: "done", status: result, ms: performance.now() - t0 });
}

async function format(source) {
  let out = "";
  let err = "";
  const { status } = await compile(source, ["fmt", "main.l8"], (fd, data) => {
    if (fd === 1) out += decoder.decode(data);
    else err += decoder.decode(data);
  });
  if (status === 0) postMessage({ type: "formatted", source: out });
  else postMessage({ type: "failed", message: err });
}

onmessage = async (e) => {
  try {
    await ready;
    if (e.data.type === "run") await run(e.data.source);
    else if (e.data.type === "format") await format(e.data.source);
  } catch (err) {
    postMessage({ type: "failed", message: `${err.name}: ${err.message}` });
  }
};
