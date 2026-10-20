// Inlined in every page's head (WEB.md §W3.2): the settings on <html>
// before the first paint, /read/ sent to the place, the app started where
// the browser can run it, and a verse in the address placed and flashed.
(() => {
  const d = document.documentElement;
  const s = new URLSearchParams(localStorage.getItem("sb.settings") || "");
  for (const k of ["theme", "font", "spacing", "margins", "vn", "heads", "fns", "red"]) if (s.has(k)) d.dataset[k] = s.get(k);
  const steps = [0.82, 0.9, 1, 1.1, 1.2, 1.32, 1.46, 1.62];
  if (s.has("step")) d.style.setProperty("--step", steps[+s.get("step")] || 1);
  const bg = { paper: "#FBF8F2", white: "#FFFFFF", sepia: "#F4ECDD", night: "#1B1A18", black: "#000000" };
  const theme = () => (d.dataset.theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper") : d.dataset.theme);
  document.querySelector('meta[name="theme-color"]').content = bg[theme()] || bg.paper;
  if (/^\/read\/?$/.test(location.pathname)) {
    const at = (localStorage.getItem("sb.place") || "").split(" ")[0];
    location.replace(at.startsWith("/read/") ? at : "/read/bsb/genesis/1");
    return;
  }
  // try_table (exception handling), which L8's modules use.
  const wasm = typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 31, 64, 0, 11, 11]));
  if (wasm) import("/read/{{js}}");
  addEventListener("DOMContentLoaded", () => {
    if (!wasm) document.querySelector(".old")?.removeAttribute("hidden");
    const m = /^#(\d+)(?:-(\d+))?$/.exec(location.hash);
    const ch = document.querySelector("main article");
    if (!m || !ch) return;
    const spans = [];
    for (let v = +m[1]; v <= +(m[2] || m[1]); v++) spans.push(...ch.querySelectorAll(`[data-v="${v}"]`));
    if (!spans.length) return;
    const bar = document.querySelector(".bar")?.offsetHeight || 44;
    scrollTo(0, spans[0].getBoundingClientRect().top + scrollY - bar - (innerHeight - bar) / 3);
    for (const e of spans) e.classList.add("flash");
    d.dataset.placed = m[0];
  });
})();
