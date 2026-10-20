// Phase (a)'s flows (WEB.md §W3.9, §W14.3, §W14.4): each checks what the
// design asks of the reader and takes its shots. drive.mjs runs them.
import fs from "node:fs";
import path from "node:path";
import { differ, sleep } from "./pixels.mjs";

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
  // §W3.9 item 1: the page without the app.
  async noscript(ctx) {
    const { page, base } = ctx;
    await page.size(...ctx.SIZES.phone);
    await page.send("Emulation.setScriptExecutionDisabled", { value: true });
    await page.open(base + "/read/bsb/john/3", false);
    const r = await page.eval(`({ h2: document.querySelector("h2.op").textContent, h3: !!document.querySelector("h3.s"), sc: document.querySelectorAll(".sc").length,
      fns: getComputedStyle(document.querySelector(".fns")).display, fnLink: document.querySelector("a.fn").getAttribute("href"),
      noteThere: !!document.getElementById(document.querySelector("a.fn").getAttribute("href").slice(1)), pager: [...document.querySelectorAll(".pager a")].map((a) => a.getAttribute("href")),
      app: document.documentElement.classList.contains("app"), aa: getComputedStyle(document.querySelector(".aa")).visibility, q: getComputedStyle(document.querySelector(".ch .q1, .ch .p")).paddingLeft })`);
    ctx.check("the text, its headings and notes without scripts", r.h2 === "John 3" && r.h3 && r.fns !== "none" && r.noteThere && !r.app && r.aa === "hidden", JSON.stringify(r));
    ctx.check("the pager's links", r.pager.join() === "/read/bsb/john/2,/read/bsb/john/4", r.pager.join());
    await ctx.shot("wa-01-john3-noscript-phone-paper");
    await page.open(base + "/read/bsb/psalms/23", false);
    const p = await page.eval(`({ sc: document.querySelectorAll(".sc").length, q: getComputedStyle(document.querySelector(".ch .q1")).paddingLeft })`);
    ctx.check("poetry indents and small capitals without scripts", p.sc > 0 && p.q !== "0px", JSON.stringify(p));
    await page.send("Emulation.setScriptExecutionDisabled", { value: false });
  },

  // §W3.9 items 2 and 7: adopting changes no pixel of the text; a verse in
  // the address is placed a third down and flashed, before and after.
  async adopt(ctx) {
    const { page, base } = ctx;
    for (const [what, url] of [["John 3", "/read/bsb/john/3"], ["John 3:16", "/read/bsb/john/3#16"]]) {
      await page.size(...ctx.SIZES.phone);
      await page.send("Fetch.enable", { patterns: [{ urlPattern: "*app.*.wasm", requestStage: "Request" }] });
      let held = null;
      const h = (m) => {
        if (m.method === "Fetch.requestPaused") held = m.params.requestId;
      };
      page.on(h);
      await page.send("Page.navigate", { url: "about:blank" });
      await sleep(100);
      await page.send("Page.navigate", { url: base + url });
      for (let t = 0; !held && t < 1000; t++) await sleep(20);
      if (!held) throw new Error("the app's module was never asked for");
      await page.waitFor(`document.readyState === "complete" && document.fonts.status === "loaded"`);
      await sleep(1400);
      await page.frames(3);
      const before = await page.png();
      const placed = await page.eval(`(() => { const s = document.querySelector('[data-v="16"]').getBoundingClientRect(); const bar = document.querySelector(".bar").offsetHeight; return { at: (s.top - bar) / (innerHeight - bar), flash: document.querySelectorAll(".flash").length }; })()`);
      await page.send("Fetch.continueRequest", { requestId: held });
      page.off(h);
      await page.send("Fetch.disable");
      await page.waitFor("window.sbReady > 0");
      await sleep(1400);
      await page.frames(3);
      const after = await page.png();
      const scale = page.dims.scale;
      const n = differ(before, after, (44 + 20) * scale);
      ctx.check(`${what} adopted with no pixel of the text changed`, n === 0, n + " pixels differ");
      if (what === "John 3:16") {
        ctx.check("verse 16 a third down, flashed, before the app", Math.abs(placed.at - 1 / 3) < 0.05 && placed.flash > 0, JSON.stringify(placed));
        const kept = await page.eval(`(() => { const s = document.querySelector('article[data-c="999"] [data-v="16"]').getBoundingClientRect(); const bar = document.querySelector(".bar").offsetHeight; return (s.top - bar) / (innerHeight - bar); })()`);
        ctx.check("and still there with the app", Math.abs(kept - 1 / 3) < 0.05, kept.toFixed(3));
      }
      if (what === "John 3") await ctx.shot("wa-02-john3-adopted-phone-paper");
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
    const atRest = async () => {
      restOk = (await restStill(page)) && restOk;
      const r = await reading(page);
      titles.add(r.title);
      if (!r.path.endsWith("/" + r.title.toLowerCase().replace(/ /g, "/").replace("psalm/", "psalms/"))) {
        urlsOk = false;
        urlBad.push(r.title + " " + r.path);
      }
      const i = r.chapters.indexOf(r.c);
      const above = i;
      const below = r.chapters.length - 1 - i;
      if (r.chapters.length > 12 || (above < 2 && r.chapters[0] > 0) || (below < 3 && r.chapters.at(-1) < 1188)) windowOk = false;
      return r;
    };
    let r = start;
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
    ctx.check("the title named every chapter on the way", titles.size >= 20, titles.size + " titles");
    ctx.check("the address follows the title", urlsOk, urlBad.slice(0, 4).join("; "));
    ctx.check("the history's length unchanged", r.history === start.history, `${start.history} → ${r.history}`);
    ctx.check("the window never more than 12 chapters", most <= 12, "at most " + most);
    ctx.check("at rest, two chapters above and three below", windowOk);
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
    await page.eval(`document.querySelector(".bar").style.setProperty("--p", "0")`);
    await page.frames(3);
    const b = await page.png();
    const n = differ(a, b, (44 + 20) * 2);
    ctx.check("the bar's state moves no pixel of the text", n === 0, n + " pixels differ");
    await page.eval("scrollBy(0, -60)");
    await page.rest();
    const q = await page.eval(`getComputedStyle(document.querySelector(".bar")).getPropertyValue("--p")`);
    ctx.check("reading back up expands it", Number(q) === 0, "--p " + q);
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
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (9e6 / 8) | 0, uploadThroughput: (1.5e6 / 8) | 0 });
    await page.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `window.__lcp = 0; window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });` });
    await page.open(base + "/read/bsb/john/3");
    await sleep(500);
    const r = await page.eval(`({ lcp: Math.round(__lcp), cls: __cls, ready: Math.round(sbReady) })`);
    await page.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    ctx.check("the text on screen in 1.5 s or less (LCP)", r.lcp > 0 && r.lcp <= 1500, r.lcp + " ms");
    ctx.check("no layout shift (CLS 0.01 or less)", r.cls <= 0.01, r.cls.toFixed(4));
    ctx.check("the app ready in 3.5 s or less", r.ready <= 3500, r.ready + " ms");
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
          ["13", "psalm119", "/read/bsb/psalms/119"], ["14", "jude", "/read/bsb/jude/1"], ["15", "index", "/read/bsb/"]]) {
          await page.open(base + url, what !== "index");
          if (what !== "index") await page.rest();
          await ctx.shot(`wa-${n}-${what}-${size}-${theme}`);
          if (size === "phone" && !dark && (what === "john3" || what === "index")) await axe(ctx, what);
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
    await page.eval(`localStorage.clear()`);
    await page.size(320, 640, 2, true);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(function big() { if (document.documentElement) document.documentElement.style.fontSize = "200%"; else requestAnimationFrame(big); })()` });
    await page.open(base + "/read/bsb/john/3");
    await page.rest();
    const wide = await page.eval(`document.documentElement.scrollWidth <= innerWidth`);
    ctx.check("320 px at 200% text: nothing wider than the screen", wide);
    await ctx.shot("wa-19-narrow-200-phone-paper");
    const old = await ctx.newPage();
    await old.size(...ctx.SIZES.phone);
    await old.send("Page.addScriptToEvaluateOnNewDocument", { source: "delete window.WebAssembly" });
    await old.open(base + "/read/bsb/john/3", false);
    await sleep(500);
    const line = await old.eval(`!document.querySelector(".old").hidden && !document.documentElement.classList.contains("app")`);
    ctx.check("an old browser: the page, and its one line at the end", line);
    await old.eval(`scrollTo(0, 1e6)`);
    await old.frames(2);
    fs.writeFileSync(path.join(ctx.out, "wa-20-old-browser-phone-paper.png"), await old.png());
    await old.close();
  },
};
