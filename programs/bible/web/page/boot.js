// Inlined in every page's head: the page's color before the first paint
// (the theme kept in the settings, core's), then the app (skin.js) and its
// module fetched at once, where the browser can run it (else one line says
// so). The same in every build (the app's name is in <meta name="sb-app">),
// so the Worker's CSP can name its hash (worker/boot_hash.js).
(() => {
  const d = document.documentElement;
  const kept = localStorage.getItem("sb.settings.txt") || "";
  const m = /(?:^|\n)theme (\d)/.exec(kept);
  const bg = ["FBF8F2", "FBF8F2", "FFFFFF", "F4ECDD", "1B1A18", "000000"];
  let t = m ? +m[1] : 0;
  if (t === 0 && matchMedia("(prefers-color-scheme: dark)").matches) t = 4;
  d.style.background = "#" + (bg[t] || bg[0]);
  document.querySelector('meta[name="theme-color"]').content = "#" + (bg[t] || bg[0]);
  if (location.pathname === "/read/about") return;
  // try_table (exception handling), which L8's modules use; else one line.
  const wasm = typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 31, 64, 0, 11, 11]));
  if (!wasm) {
    addEventListener("DOMContentLoaded", () => {
      document.getElementById("reader").innerHTML = "<p class=\"note\">Smooth Bible needs a newer browser: Safari 18.4, Chrome 137 or Firefox 131, or later.</p>";
    });
    return;
  }
  const meta = (n) => document.querySelector(`meta[name="${n}"]`).content;
  window.l8Prefetch = { ["/read/" + meta("sb-wasm")]: fetch("/read/" + meta("sb-wasm")) };
  import("/read/" + meta("sb-app"));
})();
