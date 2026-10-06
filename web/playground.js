// The playground page: an editor, examples, and a worker that compiles and
// runs programs (see compiler-worker.js).
const EXAMPLES = [
  ["hello", "Hello, world"],
  ["primes", "Sieve of Eratosthenes"],
  ["shapes", "Records, enums, and match"],
  ["exceptions", "Checked exceptions"],
  ["mandelbrot", "Mandelbrot in ASCII"],
  ["bounds", "A bounds proof that fails"],
];
const STORAGE_KEY = "l8-playground-source";
const MAX_OUTPUT = 1 << 20;

const $ = (id) => document.getElementById(id);
const source = $("source");
const gutter = $("gutter");
const output = $("output");
const status = $("status");
const runButton = $("run");
const stopButton = $("stop");
const formatButton = $("format");
const examples = $("examples");

let worker = null;
let busy = false;
let shown = 0;

// ---- editor ----

function updateGutter() {
  const lines = source.value.split("\n").length;
  if (gutter.dataset.lines !== String(lines)) {
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
    gutter.dataset.lines = String(lines);
  }
  gutter.scrollTop = source.scrollTop;
}

function updateCursor() {
  const before = source.value.slice(0, source.selectionStart);
  const line = before.split("\n").length;
  const col = before.length - before.lastIndexOf("\n");
  $("cursor").textContent = `${line}:${col}`;
}

function setSource(text) {
  source.value = text;
  updateGutter();
  updateCursor();
  localStorage.setItem(STORAGE_KEY, text);
}

// Select line:col in the editor.
function reveal(line, col) {
  const lines = source.value.split("\n");
  let at = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) at += lines[i].length + 1;
  const end = at + (lines[line - 1] ?? "").length;
  at = Math.min(at + col - 1, end);
  source.focus();
  source.setSelectionRange(at, end);
  const lineHeight = parseFloat(getComputedStyle(source).lineHeight);
  source.scrollTop = Math.max(0, (line - 4) * lineHeight);
  updateGutter();
  updateCursor();
}

source.addEventListener("input", () => {
  updateGutter();
  updateCursor();
  localStorage.setItem(STORAGE_KEY, source.value);
});
source.addEventListener("scroll", updateGutter);
source.addEventListener("click", updateCursor);
source.addEventListener("keyup", updateCursor);
source.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    run();
  } else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    document.execCommand("insertText", false, "    ");
  } else if (e.key === "Enter") {
    // Keep the current line's indentation.
    const start = source.selectionStart;
    const lineStart = source.value.lastIndexOf("\n", start - 1) + 1;
    const indent = source.value.slice(lineStart, start).match(/^ */)[0];
    const opens = /[{(\[]\s*$/.test(source.value.slice(lineStart, start));
    e.preventDefault();
    document.execCommand("insertText", false, "\n" + indent + (opens ? "    " : ""));
  }
});

// ---- output ----

function clearOutput() {
  output.textContent = "";
  shown = 0;
}

function append(text, cls) {
  if (shown > MAX_OUTPUT) return;
  shown += text.length;
  if (shown > MAX_OUTPUT) text += "\n[output truncated]\n";
  const span = document.createElement("span");
  if (cls) span.className = cls;
  // Diagnostics name main.l8:line:col; make those jump to the source.
  const parts = text.split(/(main\.l8:\d+:\d+)/);
  for (const part of parts) {
    const m = part.match(/^main\.l8:(\d+):(\d+)$/);
    if (m) {
      const a = document.createElement("a");
      a.className = "loc";
      a.textContent = part;
      a.addEventListener("click", () => reveal(Number(m[1]), Number(m[2])));
      span.append(a);
    } else span.append(part);
  }
  const atBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 4;
  output.append(span);
  if (atBottom) output.scrollTop = output.scrollHeight;
}

// ---- the worker ----

function setBusy(on) {
  busy = on;
  runButton.disabled = on || !worker;
  formatButton.disabled = on || !worker;
  stopButton.disabled = !on;
}

function startWorker() {
  worker = new Worker("compiler-worker.js", { type: "module" });
  setBusy(true);
  stopButton.disabled = true;
  status.textContent = "Loading the compiler…";
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "ready") {
      status.textContent = "Ready.";
      setBusy(false);
    } else if (m.type === "output") {
      append(m.text, m.fd === 2 ? "err" : "");
    } else if (m.type === "compiled") {
      status.textContent = "Running…";
      $("timing").textContent = `compiled in ${m.ms.toFixed(0)} ms · ${(m.size / 1024).toFixed(1)} KiB wasm`;
    } else if (m.type === "done") {
      if (m.compileFailed) {
        status.textContent = "Compilation failed.";
        $("timing").textContent = `${m.ms.toFixed(0)} ms`;
      } else {
        append(`\n[exited with status ${m.status}]\n`, m.status === 0 ? "note" : "err");
        status.textContent = `Finished in ${m.ms.toFixed(0)} ms.`;
      }
      setBusy(false);
    } else if (m.type === "formatted") {
      setSource(m.source);
      status.textContent = "Formatted.";
      setBusy(false);
    } else if (m.type === "failed") {
      append(m.message.endsWith("\n") ? m.message : m.message + "\n", "err");
      status.textContent = "Failed.";
      setBusy(false);
    }
  };
  worker.onerror = (e) => {
    append(`worker error: ${e.message}\n`, "err");
    status.textContent = "The compiler could not start.";
  };
}

function run() {
  if (busy || !worker) return;
  clearOutput();
  $("timing").textContent = "";
  status.textContent = "Compiling…";
  setBusy(true);
  worker.postMessage({ type: "run", source: source.value });
}

runButton.addEventListener("click", run);
formatButton.addEventListener("click", () => {
  if (busy || !worker) return;
  clearOutput();
  status.textContent = "Formatting…";
  setBusy(true);
  worker.postMessage({ type: "format", source: source.value });
});
stopButton.addEventListener("click", () => {
  worker.terminate();
  append("\n[stopped]\n", "err");
  startWorker();
});

// ---- examples ----

for (const [name, title] of EXAMPLES) {
  const option = document.createElement("option");
  option.value = name;
  option.textContent = title;
  examples.append(option);
}
const custom = document.createElement("option");
custom.value = "";
custom.textContent = "Your program";
custom.hidden = true;
examples.append(custom);

async function loadExample(name) {
  const text = await (await fetch(`examples/${name}.l8`)).text();
  setSource(text);
  clearOutput();
  $("timing").textContent = "";
}

examples.addEventListener("change", () => {
  if (examples.value) loadExample(examples.value);
});
source.addEventListener("input", () => (examples.value = ""));

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  setSource(saved);
  examples.value = "";
} else loadExample("hello");
startWorker();
