// Phase (a)'s flows (WEB.md §W3.9, §W14.3, §W14.4): each checks what the
// design asks of the reader and takes its shots. drive.mjs runs them.
import fs from "node:fs";
import path from "node:path";
import { decodePNG, differ, sleep } from "./pixels.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const AXE = path.join(here, "node_modules", "axe-core", "axe.min.js");

// In the page: the verse at the reading line (under the bar), its chapter,
// and how far the line is into it, in px; the window's chapters.
const READING = `(() => {
  const bar = document.querySelector(".bar").offsetHeight;
  const main = document.querySelector("main").getBoundingClientRect();
  const y = bar + 1;
  const arts = [...document.querySelectorAll("main article.ch")];
  const art = arts.filter((a) => a.getBoundingClientRect().top <= y).pop() || arts[0];
  let v = null;
  for (let k = y; !v && k > y - 240; k -= 6) v = document.elementFromPoint(main.x + main.width * 0.25, k)?.closest("[data-v]");
  if (v && !art.contains(v)) v = null;
  const spans = v ? [...art.querySelectorAll('[data-v="' + v.dataset.v + '"]')] : [];
  const top = spans.length ? Math.min(...spans.map((s) => s.getBoundingClientRect().top)) : art.getBoundingClientRect().top;
  const line = parseFloat(getComputedStyle(art.querySelector("p") || art).lineHeight) || 24;
  return { c: +art.dataset.c, v: v ? +v.dataset.v : 0, into: y - top, line, chapters: arts.map((a) => +a.dataset.c),
    title: document.querySelector(".bar .t:not(.out)")?.textContent, path: location.pathname, history: history.length, y: scrollY };
})()`;

const reading = (page) => page.eval(READING);

// Scrolled by step px a frame for frames frames, in the page; then at rest.
// Each frame, the element at the reading line must have moved by exactly
// the step (the text never jumps), and the window held at most 12
// chapters; the verses at the line come in order.
const SCROLL = (step, frames) => `new Promise((done) => {
  const bar = document.querySelector(".bar").offsetHeight;
  const main = document.querySelector("main");
  const at = () => { const r = main.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width * 0.25, bar + 1); return e && e !== main ? e : null; };
  const key = (e) => { const a = e?.closest("article.ch"); const v = e?.closest("[data-v]"); return a && v ? +a.dataset.c * 1000 + +v.dataset.v : null; };
  const out = { jumps: [], most: 0, keys: [], stuck: false };
  let k = 0;
  const frame = () => {
    const e = at();
    const before = e ? e.getBoundingClientRect().top : null;
    const y0 = scrollY;
    scrollBy(0, ${step});
    requestAnimationFrame(() => {
      const moved = scrollY !== y0;
      if (e && e.isConnected && before !== null && moved) {
        const d = e.getBoundingClientRect().top - before;
        if (Math.abs(d + (scrollY - y0)) > 1 && Math.abs(d + ${step}) > 1) out.jumps.push([before, d, scrollY - y0]);
      }
      if (!moved) out.stuck = true;
      out.most = Math.max(out.most, document.querySelectorAll("main article.ch").length);
      const kk = key(at());
      if (kk !== null) out.keys.push(kk);
      if (++k < ${frames} && moved) frame(); else done(out);
    });
  };
  frame();
})`;

const ordered = (keys, down) => keys.every((k, i) => i === 0 || (down ? k >= keys[i - 1] : k <= keys[i - 1]));

// The bar's collapse and the title's text.
const BAR = `({ p: Number(getComputedStyle(document.querySelector(".bar")).getPropertyValue("--p")), title: document.querySelector(".bar .t:not(.out)")?.textContent })`;

// The reading line's element must not move across a rest (the app's work at
// rest moves the scroll by what it adds or takes above).
async function restStill(page) {
  const before = await page.eval(`(() => { const bar = document.querySelector(".bar").offsetHeight; const r = document.querySelector("main").getBoundingClientRect(); window.__still = document.elementFromPoint(r.x + r.width * 0.25, bar + 1); return window.__still?.getBoundingClientRect().top; })()`);
  await page.rest();
  const after = await page.eval(`window.__still?.isConnected ? window.__still.getBoundingClientRect().top : null`);
  return before === undefined || before === null || after === null || Math.abs(after - before) <= 1;
}

async function setSettings(page, base, pathname, settings) {
  await page.open(base + pathname, false);
  await page.eval(`localStorage.setItem("sb.settings", ${JSON.stringify(settings)}); localStorage.removeItem("sb.place")`);
  await page.open(base + pathname);
  await page.rest();
}

async function axe(ctx, what) {
  if (!fs.existsSync(AXE)) {
    ctx.log("axe-core is not installed (npm ci in web/bible/test): skipped " + what);
    return;
  }
  await ctx.page.eval(fs.readFileSync(AXE, "utf8") + ";0");
  const r = await ctx.page.eval(`axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }).then((r) => r.violations.map((v) => v.id + " (" + v.nodes.length + "): " + v.nodes[0].target.join(" ")))`);
  ctx.check("accessible: " + what, r.length === 0, r.join("; "));
}

// The contrast of two CSS colours.
const CONTRAST = `((a, b) => {
  const rgb = (c) => { const m = c.match(/[\\d.]+/g).map(Number); return m.slice(0, 3); };
  const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
})`;

export const flows = {
  // §W3.9 item 1: without JavaScript, the noscript line; without
  // WebAssembly (an old browser), the newer-browser line.
  async lines(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.send("Emulation.setScriptExecutionDisabled", { value: true });
    await page.open(base + "/read/bsb/john/3", false);
    const r = await page.eval(`({ text: document.querySelector("main").textContent.trim(), title: document.querySelector(".bar .t").textContent, t: document.title })`);
    ctx.check("without JavaScript: the one line, the bar named by the Worker", r.text === "Smooth Bible needs JavaScript to show the Bible." && r.title === "John 3" && r.t === "John 3 · BSB · Smooth Bible", JSON.stringify(r));
    await ctx.shot("wa-01-noscript-phone-paper");
    await page.send("Emulation.setScriptExecutionDisabled", { value: false });
    const old = await ctx.newPage();
    await old.size(...ctx.SIZES.phone);
    await old.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.WebAssembly" });
    await old.open(base + "/read/bsb/john/3", false);
    await sleep(300);
    const o = await old.eval(`document.querySelector("main").textContent.trim()`);
    ctx.check("an old browser: the one line", o === "Smooth Bible needs a newer browser: Safari 18.4, Chrome 137 or Firefox 131, or later.", o);
    fs.writeFileSync(path.join(ctx.out, "wa-20-old-browser-phone-paper.png"), await old.png());
    await old.close();
  },

  // §W3.9 items 1 and 2: John 3 from John's file alone (the whole text held
  // back), styled; and no pixel of it moves after it first appears, as the
  // whole text arrives and the window fills. John 3:16: a third of the way
  // down, flashed.
  async first(ctx) {
    const { page, base } = ctx;
    for (const [what, url] of [["John 3", "/read/bsb/john/3"], ["John 3:16", "/read/bsb/john/3#16"]]) {
      await page.size(...ctx.SIZES.phone);
      await page.send("Network.setCacheDisabled", { cacheDisabled: true });
      await page.send("Fetch.enable", { patterns: [{ urlPattern: "*/bsb.gz", requestStage: "Request" }] });
      let held = null;
      const h = (m) => {
        if (m.method === "Fetch.requestPaused") held = m.params.requestId;
      };
      page.on(h);
      await page.send("Page.navigate", { url: "about:blank" });
      await sleep(100);
      await page.send("Page.navigate", { url: base + url });
      await page.waitFor("window.sbReady > 0");
      await page.frames(2);
      const before = await page.png();
      const r = await page.eval(`({ whole: !!window.sbWhole, arts: [...document.querySelectorAll("main > article")].map((a) => +a.dataset.c),
        h3: document.querySelector('article[data-c="999"] h3.s')?.textContent, sc: document.querySelectorAll('article[data-c="999"] .sc').length,
        fn: document.querySelectorAll('article[data-c="999"] a.fn').length, ref: document.querySelector('article[data-c="999"] a.ref')?.getAttribute("href"),
        v16: (() => { const s = document.querySelector('article[data-c="999"] [data-v="16"]').getBoundingClientRect(); const bar = document.querySelector(".bar").offsetHeight; return (s.top - bar) / (innerHeight - bar); })(),
        flash: document.querySelectorAll(".flash").length })`);
      if (what === "John 3") {
        ctx.check("John 3 from John's file alone, before the whole text", !r.whole && r.arts.includes(999) && r.arts.every((c) => c >= 998 && c <= 1018) && r.h3 === "Jesus and Nicodemus" && r.fn > 0 && r.ref === "/read/bsb/genesis/22#1-10", JSON.stringify(r));
        await ctx.shot("wa-02-john3-first-paint-phone-paper");
      } else ctx.check("John 3:16: a third of the way down, flashed", Math.abs(r.v16 - 1 / 3) < 0.05 && r.flash > 0, JSON.stringify(r));
      for (let k = 0; !held && k < 100; k++) await sleep(20);
      if (held) await page.send("Fetch.continueRequest", { requestId: held });
      page.off(h);
      await page.send("Fetch.disable");
      await page.waitFor("window.sbWhole > 0");
      await sleep(3000);
      await page.frames(3);
      const after = await page.png();
      // (The flash fades meanwhile: compare John 3 only where it does not.)
      const n = what === "John 3" ? differ(before, after, (44 + 20) * page.dims.scale) : 0;
      if (what === "John 3") ctx.check("no pixel of the first chapter moves as the whole text comes and the window fills", n === 0, n + " pixels differ");
      await page.send("Network.setCacheDisabled", { cacheDisabled: false });
    }
  },

  // §W3.9 items 3 and 4: from John 3 to Acts 1 and back, by script.
  async scroll(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.open(base + "/read/bsb/john/3");
    await page.rest();
    const start = await reading(page);
    let jumps = [];
    let keys = [];
    let most = 0;
    let titles = new Set();
    let urlsOk = true;
    const urlBad = [];
    let restOk = true;
    let windowOk = true;
    let barOk = true;
    const barBad = [];
    const atRest = async () => {
      const b0 = await page.eval(BAR);
      restOk = (await restStill(page)) && restOk;
      const b1 = await page.eval(BAR);
      // (The rest's own work moves neither; a bar caught between its states
      // settles to one, as it should.)
      if (b0.title !== b1.title || (b0.p === 0 || b0.p === 1 ? b1.p !== b0.p : b1.p !== 0 && b1.p !== 1)) {
        barOk = false;
        barBad.push(JSON.stringify([b0, b1]));
      }
      const r = await reading(page);
      titles.add(r.title);
      if (!r.path.endsWith("/" + r.title.toLowerCase().replace(/ /g, "/").replace("psalm/", "psalms/"))) {
        urlsOk = false;
        urlBad.push(r.title + " " + r.path);
      }
      return r;
    };
    let r = start;
    const writes0 = await page.eval("window.sbWrites || 0");
    for (let n = 0; n < 200 && !(r.c >= 1020 && r.v >= 1); n++) {
      const s = await page.eval(SCROLL(70, 30));
      jumps = jumps.concat(s.jumps);
      keys = keys.concat(s.keys);
      most = Math.max(most, s.most);
      r = await atRest();
    }
    ctx.check("down to Acts 1", r.c >= 1020, `at ${r.c}:${r.v}`);
    ctx.check("no frame where the text jumps, going down", jumps.length === 0, JSON.stringify(jumps.slice(0, 5)));
    ctx.check("the verses at the reading line in order, going down", ordered(keys, true));
    const down = keys.length;
    jumps = [];
    keys = [];
    for (let n = 0; n < 200 && r.c > 999; n++) {
      const s = await page.eval(SCROLL(-70, 30));
      jumps = jumps.concat(s.jumps);
      keys = keys.concat(s.keys);
      most = Math.max(most, s.most);
      r = await atRest();
    }
    ctx.check("back up to John 3", r.c <= 999, `at ${r.c}:${r.v}`);
    ctx.check("no frame where the text jumps, going up", jumps.length === 0, JSON.stringify(jumps.slice(0, 5)));
    ctx.check("the verses at the reading line in order, going up", ordered(keys, false));
    ctx.check("nothing moves at rest", restOk);
    ctx.check("the bar and title unchanged by the window's settling at rest", barOk, barBad.slice(0, 3).join(" "));
    ctx.check("the title named every chapter on the way", titles.size >= 20, titles.size + " titles");
    ctx.check("the address follows the title", urlsOk, urlBad.slice(0, 4).join("; "));
    ctx.check("the history's length unchanged", r.history === start.history, `${start.history} → ${r.history}`);
    const writes = (await page.eval("window.sbWrites || 0")) - writes0;
    const why = await page.eval("window.sbLastWrite || ''");
    ctx.check("no scroll position written while scrolling (only the slack at true rest)", writes === 0 || why === "slack", `${writes} writes, the last: ${why}`);
    ctx.check("the window stays small", most <= 14, "at most " + most + " chapters written");
    ctx.log(`${down + keys.length} frames scrolled`);
  },

  // §W3.9 item 5: the same verse at the reading line after a resize, a
  // font, a size and a theme.
  async keep(ctx) {
    const { page, base } = ctx;
    await page.size(390, 844, 2, true);
    await page.open(base + "/read/bsb/john/3#16");
    await page.rest();
    await page.eval("scrollBy(0, 37)");
    await page.rest();
    const same = async (what) => {
      await sleep(250);
      await page.rest();
      const b = await reading(page);
      ctx.check(`the place kept: ${what}`, b.c === a.c && b.v === a.v, `${a.c}:${a.v} → ${b.c}:${b.v}`);
    };
    const a = await reading(page);
    await page.size(1280, 900, 1, false);
    await same("390 to 1280 px");
    await page.size(390, 844, 2, true);
    await same("and back to 390");
    const choose = (name, value) => page.eval(`(() => { const e = document.querySelector('.settings input[name="${name}"]${value ? `[value="${value}"]` : ""}'); e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await page.eval(`document.querySelector(".bar .aa").click()`);
    await page.waitFor(`document.querySelector(".settings")?.open`);
    await choose("font", "georgia");
    await same("Georgia");
    await choose("font", "serif");
    await page.eval(`(() => { const e = document.querySelector('.settings input[name="step"]'); e.value = 7; e.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await same("size step 7");
    await page.eval(`(() => { const e = document.querySelector('.settings input[name="step"]'); e.value = 2; e.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await same("and back");
    await choose("theme", "night");
    await same("Night");
    await choose("spacing", "relaxed");
    await same("relaxed spacing");
    await page.eval(`(() => { const e = document.querySelector('.settings input[name="lines"]'); e.checked = true; e.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await same("a verse a line");
    const s = await page.eval(`localStorage.getItem("sb.settings")`);
    ctx.check("the settings kept", /theme=night/.test(s) && /spacing=relaxed/.test(s) && /lines=1/.test(s), s);
    await page.open(base + "/read/bsb/john/3");
    const html = await page.eval(`[document.documentElement.dataset.theme, document.documentElement.dataset.spacing, document.querySelectorAll(".vl").length > 0]`);
    ctx.check("set before the first paint on the next page, verses a line", html[0] === "night" && html[1] === "relaxed" && html[2], html.join());
    await page.eval(`localStorage.clear()`);
  },

  // §W3.9 item 6: a reload keeps the place; /read/ opens at it.
  async reload(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.open(base + "/read/bsb/john/4");
    await page.rest();
    await page.eval("scrollBy(0, 2400)");
    await page.rest();
    const a = await reading(page);
    await page.send("Page.reload");
    await page.waitFor("window.sbReady > 0");
    await page.rest();
    const b = await reading(page);
    ctx.check("a reload keeps the place", a.c === b.c && a.v === b.v && Math.abs(a.into - b.into) <= 2, `${a.c}:${a.v} ${a.into.toFixed(1)} → ${b.c}:${b.v} ${b.into.toFixed(1)}`);
    const c = await ctx.newPage();
    await c.size(...ctx.SIZES.phone);
    await c.open(base + "/read/");
    await c.rest();
    const d = await reading(c);
    ctx.check("/read/ opens at the place", d.c === a.c && d.v === a.v && Math.abs(a.into - d.into) <= 2, `${d.path} ${d.c}:${d.v}`);
    await c.close();
    // Jumps are entries, Back returns to the place exactly.
    await page.key("]");
    await page.rest();
    const e = await reading(page);
    ctx.check("] goes to the next chapter's start", e.c === a.c + 1 && e.v === 0 && e.history === b.history + 1, `${e.c}:${e.v}, history ${e.history}`);
    await page.eval("history.back()");
    await sleep(300);
    await page.rest();
    const f = await reading(page);
    ctx.check("Back returns to the place", f.c === a.c && f.v === a.v && Math.abs(a.into - f.into) <= 2, `${f.c}:${f.v}`);
    await page.key("Home");
    await sleep(900);
    await page.rest();
    const g = await reading(page);
    ctx.check("Home scrolls to the chapter's top, with no history entry", g.c === a.c && g.v === 0 && g.history === f.history, `${g.c}:${g.v}, history ${f.history} → ${g.history}`);
    await page.eval(`localStorage.clear()`);
  },

  // §W3.9 item 8: every theme, and faint text at 4.5:1.
  async themes(ctx) {
    const { page, base } = ctx;
    for (const size of ["phone", "desktop"]) {
      await page.size(...ctx.SIZES[size]);
      for (const theme of ["paper", "white", "sepia", "night", "black"]) {
        await setSettings(page, base, "/read/bsb/john/3", "theme=" + theme);
        const worst = await page.eval(`(() => { const c = ${CONTRAST}; const bg = getComputedStyle(document.documentElement).backgroundColor;
          return Math.min(...[".ch .vn", ".ch .lb", ".ch .r", ".credit", ".ch .s"].map((s) => c(getComputedStyle(document.querySelector(s)).color, bg))); })()`);
        ctx.check(`${theme} at ${size}: faint text at 4.5:1 or more`, worst >= 4.5, worst.toFixed(2));
        if (size === "phone" || theme === "paper" || theme === "night") await ctx.shot(`wa-03-theme-${size}-${theme}`);
      }
    }
    await page.eval(`localStorage.clear()`);
  },

  // REVIEW-web-a1 M1: the window's settling (chapters added above, the
  // scroll moved by them) leaves the bar as it was, at every size.
  async settle(ctx) {
    const { page, base } = ctx;
    for (const size of ["phone", "tablet", "desktop"]) {
      await page.size(...ctx.SIZES[size]);
      await page.open(base + "/read/bsb/john/3");
      await page.rest();
      const b = await page.eval(BAR);
      const r = await reading(page);
      ctx.check(`John 3 at ${size}: the bar expanded and named John 3 after the window settled`, b.p === 0 && b.title === "John 3" && r.chapters[0] < 999, JSON.stringify({ ...b, chapters: r.chapters }));
    }
  },

  // §W3.3's slow, intentional scrolling (the owner's jump, 2026-10-20): CDP
  // touch drags of 40 to 200 px with pauses of 0.3 to 1.5 s while the finger
  // stays down, then lifted, back and forth across John 3/4, Psalms
  // 118/119/120 and Malachi 4/Matthew 1, with the viewport's height changing
  // mid-drag as Safari's bars do. Every frame, the element at the reading
  // line keeps its place in the document (it moves on screen exactly as
  // the scroll does, to a pixel), and no scroll position is written.
  async boundary(ctx) {
    const { page, base } = ctx;
    const RECORD = `(() => {
      window.__bad = []; window.__on = true;
      let el = null, docTop = 0;
      const f = () => {
        if (!window.__on) return;
        const bar = document.querySelector(".bar").offsetHeight;
        const m = document.querySelector("main").getBoundingClientRect();
        const e = document.elementFromPoint(m.x + m.width * 0.25, bar + 40);
        if (e && e === el && e.isConnected) {
          const d = e.getBoundingClientRect().top + scrollY - docTop;
          if (Math.abs(d) > 1) window.__bad.push(Math.round(d) + " px (" + (e.closest("article")?.dataset.c || "?") + ")");
        }
        if (e) { el = e; docTop = e.getBoundingClientRect().top + scrollY; }
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    })()`;
    for (const [what, c, at] of [["John 3/4", 1000, "john/3"], ["Psalms 118/119/120", 596, "psalms/118"], ["Malachi 4/Matthew 1", 929, "malachi/4"]]) {
      await page.size(390, 760, 2, true);
      await page.open(base + "/read/bsb/" + at);
      await page.rest();
      await page.eval(`(() => { const a = document.querySelector('article[data-c="${c}"]'); if (a) scrollBy(0, a.getBoundingClientRect().top - 380); })()`);
      await sleep(400);
      await page.rest();
      const w0 = await page.eval("window.sbWrites || 0");
      await page.eval(RECORD);
      let y = 0;
      const touch = (type) => page.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x: 200, y }] });
      const drags = [[-1, 40, 300], [1, 120, 900], [-1, 200, 1500], [1, 80, 500], [-1, 160, 700], [1, 200, 300]];
      let k = 0;
      for (const [dir, px, pause] of drags) {
        y = dir < 0 ? 600 : 250;
        await touch("touchStart");
        for (let moved = 0; moved < px + 24; moved += 4) {
          y += dir * 4;
          await touch("touchMove");
          await sleep(16);
          if (moved === 60 && k === 2) await page.size(390, 820, 2, true);
          if (moved === 60 && k === 3) await page.size(390, 760, 2, true);
        }
        await sleep(pause);
        await touch("touchEnd");
        await sleep(400);
        k++;
      }
      await page.eval("window.__on = false");
      const bad = await page.eval("window.__bad");
      const writes = (await page.eval("window.sbWrites || 0")) - w0;
      const why = await page.eval("window.sbLastWrite || ''");
      ctx.check(`slow drags across ${what}: the text moves exactly with the scroll`, bad.length === 0, bad.slice(0, 5).join(", "));
      ctx.check(`slow drags across ${what}: no scroll position written`, writes === 0 || why === "slack", `${writes} (${why})`);
    }
  },

  // §W3.3's fast flings: 8,000 and 20,000 px/s, down and up, 3 s each.
  // No frame shows the page's end, the pager or the credit line before
  // Revelation, or a strip with neither text nor placeholder (the view is
  // always inside the scroller).
  async fling(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.open(base + "/read/bsb/john/3");
    await page.rest();
    const RECORD = `(() => {
      window.__bad = []; window.__on = true; window.__frames = 0;
      const f = () => {
        if (!window.__on) return;
        window.__frames++;
        const b = document.querySelector(".bible").getBoundingClientRect();
        const cr = document.querySelector(".credit").getBoundingClientRect();
        const end = document.querySelector('.bible > article[data-c="1188"]');
        if (!end && (b.bottom < innerHeight || cr.top < innerHeight)) window.__bad.push("the end at frame " + window.__frames);
        if (b.top > document.querySelector(".bar").offsetHeight + 1 && scrollY > 0) window.__bad.push("above the scroller at frame " + window.__frames);
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    })()`;
    let shot = false;
    for (const [speed, dir] of [[8000, -1], [8000, 1], [20000, -1], [20000, 1]]) {
      const w0 = await page.eval("window.sbWrites || 0");
      await page.eval(RECORD);
      const g = page.send("Input.synthesizeScrollGesture", { x: 200, y: 400, yDistance: dir * speed * 3, speed, gestureSourceType: "touch", repeatCount: 1 });
      if (!shot && speed === 20000) {
        await sleep(350);
        await ctx.shot("wa-21-fling-phone-paper");
        shot = true;
      }
      await g;
      await page.eval("window.__on = false");
      const bad = await page.eval("window.__bad");
      const r = await reading(page);
      const writes = (await page.eval("window.sbWrites || 0")) - w0;
      ctx.check(`a fling at ${speed} px/s ${dir < 0 ? "down" : "up"}: never the end, never outside the scroller`, bad.length === 0, bad.slice(0, 3).join("; ") + ` (at ${r.title})`);
      ctx.check(`a fling at ${speed} px/s ${dir < 0 ? "down" : "up"}: no scroll position written`, writes === 0, String(writes));
      await page.rest();
    }
  },

  // §W3.3's estimates: every BSB chapter estimated against its measured
  // height, at phone and desktop widths.
  async estimates(ctx) {
    const { page, base } = ctx;
    for (const size of ["phone", "desktop"]) {
      await page.size(...ctx.SIZES[size]);
      await page.open(base + "/read/bsb/john/3");
      await page.rest();
      await page.waitFor("window.sbWhole > 0");
      await page.eval(`window.sbCheck = ""; dispatchEvent(new Event("sbcheck"))`);
      await page.waitFor("window.sbCheck", 120000);
      const rows = (await page.eval("window.sbCheck")).split(";").filter(Boolean).map((r) => r.split(" ").map(Number));
      let sum = 0, worst = 0, worstC = 0, above = 0, aboveTotal = 0, szSum = 0, szWorst = 0;
      for (const [c, e, m, z] of rows) {
        szSum += Math.abs(z - m) / m;
        szWorst = Math.max(szWorst, Math.abs(z - m) / m);
        const err = Math.abs(e - m) / m;
        sum += err;
        if (err > worst) [worst, worstC] = [err, c];
        if (c < 999) {
          above += e - m;
          aboveTotal += m;
        }
      }
      const mean = sum / rows.length;
      const cum = Math.abs(above) / aboveTotal;
      ctx.log(`${size}: ${rows.length} chapters, mean ${(100 * mean).toFixed(2)}%, worst ${(100 * worst).toFixed(2)}% (chapter ${worstC}), above John 3 ${(100 * cum).toFixed(2)}%; from the sizes table alone (the first paint's, report only): mean ${(100 * szSum / rows.length).toFixed(2)}%, worst ${(100 * szWorst).toFixed(2)}%`);
      fs.writeFileSync(path.join(ctx.out, `estimates-${size}.txt`), rows.map((r) => r.join(" ")).join("\n") + "\n");
      ctx.check(`estimates at ${size}: mean error 2% or less`, mean <= 0.02, (100 * mean).toFixed(2) + "%");
      ctx.check(`estimates at ${size}: worst 6% or less`, worst <= 0.06, (100 * worst).toFixed(2) + "% (chapter " + worstC + ")");
      ctx.check(`estimates at ${size}: signed error above John 3 1.5% or less`, cum <= 0.015, (100 * cum).toFixed(2) + "%");
    }
  },

  // §W3.3's size limit: the largest step and a 200% browser text size keep
  // the scroller under 12 million px (a testament or a book), and its link
  // across works.
  async sizelimit(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(function big() { if (document.documentElement) document.documentElement.style.fontSize = "200%"; else requestAnimationFrame(big); })()` });
    await setSettings(page, base, "/read/bsb/malachi/4", "step=7");
    const h = await page.eval(`document.querySelector(".bible").getBoundingClientRect().height`);
    const across = await page.eval(`document.querySelector(".across:not(.up) a")?.getAttribute("href") || ""`);
    ctx.check("the largest text: the scroller under 12 million px", h < 12e6, Math.round(h) + " px" + (across ? ", across to " + across : ""));
    if (across) {
      await page.eval(`document.querySelector(".across:not(.up) a").click()`);
      await sleep(600);
      await page.rest();
      const r = await reading(page);
      ctx.check("the link across the scroller's end lands there", r.path === across && r.title === "Matthew 1", r.path + " " + r.title);
    }
    await page.eval("localStorage.clear()");
  },

  // The first Go To (§W1.8): the title opens it over the place, John's
  // row open with chapter 3 current; a chapter chosen goes there, the
  // dialog's entry replaced (Back returns to John 3); Back closes it; and
  // /read/bsb/ opens it over the place.
  async goto(ctx) {
    const { page, base } = ctx;
    for (const size of ["phone", "desktop"]) {
      await page.size(...ctx.SIZES[size]);
      await page.open("about:blank", false);
      await page.open(base + "/read/bsb/john/3");
      await page.rest();
      const h0 = await page.eval("history.length");
      await page.eval(`document.querySelector(".bar .title").click()`);
      await page.waitFor(`document.querySelector("dialog.goto")?.open`);
      await page.frames(3);
      const hOpen = await page.eval("history.length");
      const g = await page.eval(`({ open: document.querySelector("dialog.goto details[open] summary span").textContent, cur: document.querySelector("dialog.goto [aria-current]")?.textContent, books: document.querySelectorAll("dialog.goto summary, dialog.goto a.book").length })`);
      ctx.check(`Go To at ${size}: John open, chapter 3 current, 66 books`, g.open === "John" && g.cur === "3" && g.books === 66, JSON.stringify(g));
      await ctx.shot(`wa-15-goto-${size}-paper`);
      if (size === "phone") await axe(ctx, "Go To");
      await page.eval(`(() => { const d = [...document.querySelectorAll("dialog.goto details")].find((x) => x.querySelector("summary span").textContent === "Romans"); d.open = true; d.querySelectorAll("a")[7].click(); })()`);
      await sleep(300);
      await page.rest();
      const r = await reading(page);
      ctx.check(`Go To at ${size}: a chapter chosen goes there`, r.title === "Romans 8" && r.path === "/read/bsb/romans/8" && !(await page.eval(`document.querySelector("dialog.goto").open`)), r.title + " " + r.path);
      const h1 = await page.eval("history.length");
      ctx.check(`Go To at ${size}: it is an entry, which the jump replaces`, hOpen === h0 + 1 && h1 === hOpen, `${h0} → ${hOpen} → ${h1}`);
      await page.eval("history.back()");
      await sleep(400);
      await page.rest();
      const b = await reading(page);
      ctx.check(`Go To at ${size}: Back from the jump returns to John 3`, b.title === "John 3", b.title);
    }
    await page.eval(`document.querySelector(".bar .title").click()`);
    await page.waitFor(`document.querySelector("dialog.goto")?.open`);
    await page.eval("history.back()");
    await sleep(400);
    ctx.check("Back closes Go To", !(await page.eval(`document.querySelector("dialog.goto").open`)));
    await page.open(base + "/read/bsb/");
    await page.waitFor(`document.querySelector("dialog.goto")?.open`);
    const r = await reading(page);
    ctx.check("/read/bsb/ opens Go To over the place", r.title === "John 3", r.title);
    await page.eval("localStorage.clear()");
  },

  // §W3.9 item 9: the bar collapses without moving the text.
  async bar(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.open(base + "/read/bsb/john/3");
    await page.rest();
    await page.eval("scrollBy(0, 300)");
    await page.rest();
    const p = await page.eval(`getComputedStyle(document.querySelector(".bar")).getPropertyValue("--p")`);
    ctx.check("reading down collapses the bar", Number(p) === 1, "--p " + p);
    await ctx.shot("wa-05-bar-collapsed-phone-paper");
    const a = await page.png();
    {
      // (The bar's own field, left of the title, over text: the page's bg.)
      const P = decodePNG(a);
      let worst = 0;
      for (const [x, y] of [[8, 4], [60, 10], [120, 14], [330, 8]]) {
        const i = ((y * 2) * P.w + x * 2) * 4;
        worst = Math.max(worst, Math.abs(P.px[i] - 0xfb), Math.abs(P.px[i + 1] - 0xf8), Math.abs(P.px[i + 2] - 0xf2));
      }
      ctx.check("the collapsed bar's backdrop is Paper's bg", worst <= 2, "off by " + worst);
    }
    await page.eval(`document.querySelector(".bar").style.setProperty("--p", "0")`);
    await page.frames(3);
    const b = await page.png();
    const n = differ(a, b, (44 + 20) * 2);
    ctx.check("the bar's state moves no pixel of the text", n === 0, n + " pixels differ");
    await page.eval("scrollBy(0, -60)");
    await page.rest();
    const q = await page.eval(`getComputedStyle(document.querySelector(".bar")).getPropertyValue("--p")`);
    ctx.check("reading back up expands it", Number(q) === 0, "--p " + q);
    await page.eval("scrollBy(0, 300)");
    await page.rest();
    await page.eval(`document.querySelector(".bar .aa").focus()`);
    await page.rest();
    const f = await page.eval(`getComputedStyle(document.querySelector(".bar")).getPropertyValue("--p")`);
    await page.eval("scrollBy(0, 200)");
    await page.rest();
    const g = await page.eval(`getComputedStyle(document.querySelector(".bar")).getPropertyValue("--p")`);
    ctx.check("focus in the bar expands it, and keeps it so", Number(f) === 0 && Number(g) === 0, `--p ${f}, then ${g}`);
    await page.eval(`document.activeElement.blur()`);
    // A chapter's boundary mid-scroll, the bar half collapsed.
    await page.eval(`(() => { const a = document.querySelector('article[data-c="1000"]'); scrollBy(0, a.getBoundingClientRect().top - 120); })()`);
    await page.rest();
    await page.eval(`document.querySelector(".bar").style.setProperty("--p", "0.5")`);
    await page.frames(2);
    await ctx.shot("wa-04-boundary-half-phone-paper");
  },

  // §W3.9 item 10: footnotes by click, keyboard and Escape.
  async footnote(ctx) {
    const { page, base } = ctx;
    for (const dark of [false, true]) {
      await page.size(...ctx.SIZES.phone);
      await page.theme(dark);
      await page.open(base + "/read/bsb/genesis/1");
      await page.rest();
      const at = await page.eval(`(() => { const r = document.querySelector("a.fn").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
      await page.tap(at[0], at[1]);
      await page.frames(2);
      const r = await page.eval(`({ open: document.querySelector(".fnpop").matches(":popover-open"), head: document.querySelector(".fnpop h2").textContent, text: document.querySelector(".fnpop p").textContent, y: scrollY })`);
      ctx.check("a mark opens its note" + (dark ? " (Night)" : ""), r.open && r.head === "Footnote · Genesis 1:3" && r.text === "Cited in 2 Corinthians 4:6", JSON.stringify(r));
      await ctx.shot(`wa-06-footnote-phone-${dark ? "night" : "paper"}`);
      if (!dark) await axe(ctx, "the footnote");
      await page.key("Escape");
      ctx.check("Escape closes it", !(await page.eval(`document.querySelector(".fnpop").matches(":popover-open")`)));
    }
    await page.theme(false);
    await page.eval(`document.querySelector("a.fn").focus()`);
    await page.key("Enter");
    await page.frames(2);
    const k = await page.eval(`({ open: document.querySelector(".fnpop").matches(":popover-open"), focus: document.activeElement.className })`);
    ctx.check("the keyboard opens it, focus inside", k.open && k.focus === "fnpop", JSON.stringify(k));
    await page.key("Escape");
    await page.frames(2);
    const e = await page.eval(`document.activeElement.className`);
    ctx.check("and Escape returns focus to the mark", e === "fn", e);
  },

  // §W3.9 item 11: John 3 printed alone, with its notes.
  async print(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.desktop);
    await page.open(base + "/read/bsb/john/3");
    await page.rest();
    const pdf = await page.send("Page.printToPDF", { printBackground: false });
    fs.writeFileSync(path.join(ctx.out, "wa-07-print-john3.pdf"), Buffer.from(pdf.data, "base64"));
    await page.eval(`dispatchEvent(new Event("beforeprint"))`);
    await page.send("Emulation.setEmulatedMedia", { media: "print" });
    const r = await page.eval(`({ shown: [...document.querySelectorAll("main article.ch")].filter((a) => getComputedStyle(a).display !== "none").map((a) => +a.dataset.c),
      notes: getComputedStyle(document.querySelector('article[data-c="999"] .fns')).display, bar: getComputedStyle(document.querySelector(".bar")).display })`);
    ctx.check("printing shows John 3 alone, with its notes, without the bar", r.shown.join() === "999" && r.notes !== "none" && r.bar === "none", JSON.stringify(r));
    await page.send("Emulation.setEmulatedMedia", { media: "" });
    await page.eval(`dispatchEvent(new Event("afterprint"))`);
    const back = await page.eval(`[...document.querySelectorAll("main article.unprinted")].length`);
    ctx.check("and after printing, the window is back", back === 0);
  },

  // §W3.9 item 12, §W13: the first visit on the CI's profile.
  async performance(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__lcp = 0; window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });` });
    const visit = async (down, latency, cold) => {
      await page.send("Network.setCacheDisabled", { cacheDisabled: cold });
      await page.send("Network.emulateNetworkConditions", { offline: false, latency, downloadThroughput: (down / 8) | 0, uploadThroughput: (1.5e6 / 8) | 0 });
      await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await page.open("about:blank", false);
      await page.open(base + "/read/bsb/john/3");
      await sleep(600);
      const r = await page.eval(`({ lcp: Math.round(__lcp), cls: __cls, ready: Math.round(sbReady), whole: Math.round(window.sbWhole || -1) })`);
      await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      return r;
    };
    const first = await visit(9e6, 150, true);
    ctx.log(`4G, first visit: text ${first.lcp} ms, ready ${first.ready} ms, the whole text ${first.whole} ms`);
    ctx.check("first visit on 4G: the text on screen in 1.5 s or less (LCP)", first.lcp > 0 && first.lcp <= 1500, first.lcp + " ms");
    ctx.check("first visit on 4G: no layout shift (CLS 0.01 or less)", first.cls <= 0.01, first.cls.toFixed(4));
    ctx.check("first visit on 4G: the app ready in 1.8 s or less", first.ready <= 1800, first.ready + " ms");
    const second = await visit(9e6, 150, false);
    ctx.log(`4G, second visit: text ${second.lcp} ms, ready ${second.ready} ms`);
    ctx.check("second visit on 4G: the text on screen in 0.8 s or less", second.lcp > 0 && second.lcp <= 800, second.lcp + " ms");
    const slow = await visit(1.6e6, 150, true);
    ctx.log(`slow 4G, first visit (report only, 3 s): text ${slow.lcp} ms, ready ${slow.ready} ms, the whole text ${slow.whole} ms`);
    await page.send("Network.setCacheDisabled", { cacheDisabled: false });
  },

  // §W14.3: phase (a)'s shots at three sizes, in Paper and Night, and the
  // pages' accessibility (§W14.4).
  async shots(ctx) {
    const { page, base } = ctx;
    for (const size of ["phone", "tablet", "desktop"]) {
      for (const dark of [false, true]) {
        const theme = dark ? "night" : "paper";
        await page.size(...ctx.SIZES[size]);
        await page.theme(dark);
        for (const [n, what, url] of [["10", "john3", "/read/bsb/john/3"], ["11", "genesis1", "/read/bsb/genesis/1"], ["12", "psalm23", "/read/bsb/psalms/23"],
          ["13", "psalm119", "/read/bsb/psalms/119"], ["14", "jude", "/read/bsb/jude/1"]]) {
          await page.open(base + url);
          await page.rest();
          await ctx.shot(`wa-${n}-${what}-${size}-${theme}`);
          if (size === "phone" && !dark && what === "john3") await axe(ctx, what);
        }
        await page.open(base + "/read/bsb/john/3");
        await page.eval(`document.querySelector(".bar .aa").click()`);
        await page.waitFor(`document.querySelector(".settings")?.open`);
        await page.frames(3);
        await ctx.shot(`wa-16-settings-${size}-${theme}`);
        if (size === "phone" && !dark) await axe(ctx, "Reading settings");
        await page.eval(`document.querySelector(".settings").scrollTop = 1e6`);
        await page.frames(2);
        await ctx.shot(`wa-17-settings-end-${size}-${theme}`);
      }
    }
    await page.theme(false);
    // A verse a line; narrow at 200% text; an old browser.
    await page.size(...ctx.SIZES.phone);
    await setSettings(page, base, "/read/bsb/psalms/23", "lines=1");
    await ctx.shot("wa-18-verse-lines-phone-paper");
    const t = await reading(page);
    ctx.check("a verse a line: the title names the chapter", t.title === "Psalm 23" && t.c === 500, t.title);
    const left = await page.eval(`(() => {
      const art = document.querySelector('article[data-c="500"]');
      const vl = art.querySelector(".vl");
      const words = vl.getBoundingClientRect().left + parseFloat(getComputedStyle(vl).paddingLeft);
      let least = Infinity;
      const walk = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        if (n.parentElement.closest(".vn, .op, .s, .r, .d, .fns") || !n.data.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const b of r.getClientRects()) least = Math.min(least, b.left);
      }
      return least - words;
    })()`);
    ctx.check("a verse a line: no line of Psalm 23 left of its verse's words", left >= -1, left.toFixed(1) + " px");
    await page.eval(`localStorage.clear()`);
    await page.size(320, 640, 2, true);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(function big() { if (document.documentElement) document.documentElement.style.fontSize = "200%"; else requestAnimationFrame(big); })()` });
    await page.open(base + "/read/bsb/john/3");
    await page.rest();
    const wide = await page.eval(`document.documentElement.scrollWidth <= innerWidth`);
    ctx.check("320 px at 200% text: nothing wider than the screen", wide);
    await ctx.shot("wa-19-narrow-200-phone-paper");
  },
};
