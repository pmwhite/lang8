// Inlined in every page's head (WEB.md §W3.2, §W1.8): the settings on
// <html> before the first paint, /read/ made the place's address, and the
// first paint's files fetched at once and the app started, where the
// browser can run it (else one line says so).
// It is the same in every build (the app's name is in <meta name="sb-app">),
// so the Worker's CSP can name its hash (worker/boot_hash.js, §W2.1a).
(() => {
  const d = document.documentElement;
  const s = new URLSearchParams(localStorage.getItem("sb.settings") || "");
  for (const k of ["theme", "font", "spacing", "margins", "vn", "heads", "fns", "red"]) if (s.has(k)) d.dataset[k] = s.get(k);
  const steps = [0.82, 0.9, 1, 1.1, 1.2, 1.32, 1.46, 1.62];
  if (s.has("step")) d.style.setProperty("--step", steps[+s.get("step")] || 1);
  const bg = { paper: "#FBF8F2", white: "#FFFFFF", sepia: "#F4ECDD", night: "#1B1A18", black: "#000000" };
  const theme = () => (d.dataset.theme === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "paper") : d.dataset.theme);
  document.querySelector('meta[name="theme-color"]').content = bg[theme()] || bg.paper;
  // The place: the address's, or for /read/ the place kept (the address
  // made its, no reload).
  let path = location.pathname;
  if (/^\/read\/?$/.test(path)) {
    const at = (localStorage.getItem("sb.place") || "").split(" ")[0];
    path = /^\/read\/[a-z]+\/[a-z0-9-]+\/\d+$/.test(at) ? at : "/read/bsb/genesis/1";
    history.replaceState(null, "", path + location.hash);
  }
  // try_table (exception handling), which L8's modules use; else one line.
  const wasm = typeof WebAssembly === "object" && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 2, 1, 0, 10, 8, 1, 6, 0, 31, 64, 0, 11, 11]));
  if (!wasm) {
    addEventListener("DOMContentLoaded", () => {
      document.getElementById("text").innerHTML = "<p class=\"note\">Smooth Bible needs a newer browser: Safari 18.4, Chrome 137 or Firefox 131, or later.</p>";
    });
    return;
  }
  // The first paint's files, all at once (WEB.md §W1.8): the place's book,
  // the version's sizes table and the app; the app takes them up
  // (l8Prefetch, by address).
  const meta = (n) => document.querySelector(`meta[name="${n}"]`).content;
  const pre = (window.l8Prefetch = {});
  const get = (u) => (pre[u] = fetch(u));
  const m = /^\/read\/(bsb|kjv|web|asv|ylt)\/(?:([a-z0-9-]+)(?:\/\d+)?)?\/?$/.exec(path);
  if (m) {
    d.dataset.version = m[1];
    const books = Object.fromEntries("genesis:GEN,exodus:EXO,leviticus:LEV,numbers:NUM,deuteronomy:DEU,joshua:JOS,judges:JDG,ruth:RUT,1-samuel:1SA,2-samuel:2SA,1-kings:1KI,2-kings:2KI,1-chronicles:1CH,2-chronicles:2CH,ezra:EZR,nehemiah:NEH,esther:EST,job:JOB,psalms:PSA,proverbs:PRO,ecclesiastes:ECC,song-of-solomon:SNG,isaiah:ISA,jeremiah:JER,lamentations:LAM,ezekiel:EZK,daniel:DAN,hosea:HOS,joel:JOL,amos:AMO,obadiah:OBA,jonah:JON,micah:MIC,nahum:NAM,habakkuk:HAB,zephaniah:ZEP,haggai:HAG,zechariah:ZEC,malachi:MAL,matthew:MAT,mark:MRK,luke:LUK,john:JHN,acts:ACT,romans:ROM,1-corinthians:1CO,2-corinthians:2CO,galatians:GAL,ephesians:EPH,philippians:PHP,colossians:COL,1-thessalonians:1TH,2-thessalonians:2TH,1-timothy:1TI,2-timothy:2TI,titus:TIT,philemon:PHM,hebrews:HEB,james:JAS,1-peter:1PE,2-peter:2PE,1-john:1JN,2-john:2JN,3-john:3JN,jude:JUD,revelation:REV".split(",").map((s) => s.split(":")));
    let code = books[m[2]];
    if (!code) {
      const at = (localStorage.getItem("sb.place") || "").split("/");
      code = at[2] === m[1] ? books[at[3]] || "GEN" : "GEN";
    }
    const data = "/read/data/" + meta("sb-data");
    get(`${data}/${m[1]}/${code}.gz`);
    get(`${data}/${m[1]}.sizes.gz`);
  }
  get("/read/" + meta("sb-wasm"));
  // (A hidden letter in the reading font and its italic, so the browser
  // fetches their faces now, where the device has none of its own.)
  const f = document.createElement("span");
  f.className = "fontload";
  f.setAttribute("aria-hidden", "true");
  f.innerHTML = "a<i>a</i>";
  d.appendChild(f);
  import("/read/" + meta("sb-app"));
})();
