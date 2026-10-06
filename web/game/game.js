// Load the block game module and run it on the page's canvas. The world file
// lives in an in-memory file system and is saved to localStorage whenever the
// game writes it.
import { instantiate, runStartAsync, MemFS } from "../l8-runtime.js";
import { createPlatform } from "./platform.js";

const WORLD = "/programs/block-game/world.txt";
const STORAGE_KEY = "l8-block-game-world";

const canvas = document.getElementById("screen");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const logBox = document.getElementById("log");
const editing = new URLSearchParams(location.search).has("edit");

const log = (text) => {
  logBox.textContent += text.endsWith("\n") ? text : text + "\n";
  logBox.scrollTop = logBox.scrollHeight;
};
const fail = (text) => {
  log(text);
  document.getElementById("logbox").open = true;
};
const show = (html) => {
  message.innerHTML = html;
  overlay.hidden = false;
};

if (editing) {
  document.getElementById("mode").textContent = "Play";
  document.getElementById("mode").href = "./";
  document.getElementById("hint").textContent = "Editor: keys are listed on screen; q quits";
}
document.getElementById("reset").addEventListener("click", () => {
  if (!confirm("Forget saved progress and edits to the world?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

async function main() {
  if (typeof WebAssembly.Suspending !== "function") {
    show("This page needs WebAssembly JavaScript Promise Integration (JSPI).<br>" +
      "Use a recent Chrome, Edge, or Firefox.");
    return;
  }
  const [module, world] = await Promise.all([
    WebAssembly.compileStreaming(fetch("block-game.wasm")),
    fetch("world.txt").then((r) => r.text()),
  ]);
  const fs = new MemFS({ [WORLD]: localStorage.getItem(STORAGE_KEY) ?? world });
  const decoder = new TextDecoder();
  fs.onOutput = (_fd, data) => log(decoder.decode(data));
  const sys = fs.sys(["block-game", editing ? "edit" : "play", WORLD.slice(1)]);
  const close = sys.close;
  sys.close = (fd) => {
    const file = fs.fds.get(fd);
    const status = close(fd);
    if (file?.writable && file.path === WORLD) localStorage.setItem(STORAGE_KEY, decoder.decode(fs.readFile(WORLD)));
    return status;
  };

  const platform = createPlatform(canvas, { log: fail });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);

  show("Click the game to start");
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => show("Click the game to continue"));
  canvas.addEventListener("pointerdown", () => canvas.focus());
  canvas.focus();

  const status = await runStartAsync(instance);
  canvas.blur();
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
  overlay.style.pointerEvents = "auto";
}

main().catch((e) => {
  fail(`${e.name}: ${e.message}`);
  show(`The game stopped: ${e.message}`);
});
