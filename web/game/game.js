// Load the block game module and run it on the page's canvas. The world file
// lives in an in-memory file system and is saved to localStorage whenever the
// game writes it.
import { instantiate, runResumable, MemFS } from "../l8-runtime.js";
import { createPlatform } from "./platform.js";

// Levels the page offers; each keeps its own saved copy.
const LEVELS = {
  world: { file: "world.txt", title: "World" },
  pond: { file: "pond.txt", title: "Pond" },
  grove: { file: "grove-demo.txt", title: "Canopy walk" },
};
const params = new URLSearchParams(location.search);
const level = LEVELS[params.get("level")] ? params.get("level") : "world";
const WORLD = `/programs/block-game/${LEVELS[level].file}`;
const STORAGE_KEY = level === "world" ? "l8-block-game-world" : `l8-block-game-${level}`;

const canvas = document.getElementById("screen");
const overlay = document.getElementById("overlay");
const message = document.getElementById("message");
const logBox = document.getElementById("log");
const editing = params.has("edit");

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

const picker = document.getElementById("level");
for (const [key, { title }] of Object.entries(LEVELS)) picker.add(new Option(title, key, false, key === level));
picker.addEventListener("change", () => {
  const next = new URLSearchParams({ level: picker.value });
  if (editing) next.set("edit", "");
  location.search = next.toString().replace(/=$/, "");
});
const modeLink = document.getElementById("mode");
modeLink.href = `?level=${level}${editing ? "" : "&edit"}`;
if (editing) {
  modeLink.textContent = "Play";
  document.getElementById("hint").textContent = "Editor: keys are listed on screen; q quits";
}
document.getElementById("reset").addEventListener("click", () => {
  if (!confirm(`Forget saved progress and edits to ${LEVELS[level].title}?`)) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});

async function main() {
  const [module, world] = await Promise.all([
    WebAssembly.compileStreaming(fetch("block-game.wasm")),
    fetch(LEVELS[level].file).then((r) => r.text()),
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

  const platform = createPlatform(canvas, { log: fail, checkErrors: params.has("glcheck") });
  window.l8Game = platform;
  const { instance, mem } = await instantiate(module, sys, platform.imports);
  platform.attach(instance, mem);

  show("Click the game to start");
  canvas.addEventListener("focus", () => (overlay.hidden = true));
  canvas.addEventListener("blur", () => show("Click the game to continue"));
  canvas.addEventListener("pointerdown", () => canvas.focus());
  canvas.focus();

  const status = await runResumable(instance, platform.nextFrame);
  canvas.blur();
  show(`The game exited${status ? ` with status ${status}` : ""}.<br><a href="">Play again</a>`);
  overlay.style.pointerEvents = "auto";
}

main().catch((e) => {
  fail(`${e.name}: ${e.message}`);
  show(`The game stopped: ${e.message}`);
});
