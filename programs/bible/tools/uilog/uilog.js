// A UI-change log for Smooth Bible's web page (README.md beside this):
// injected by rig.mjs before the page's own scripts
// (Page.addScriptToEvaluateOnNewDocument), never part of the site. While
// it is on (window.__uilog.start() ... stop()), every animation frame it
// measures the elements a person sees as things (bars, buttons, rows,
// sheets, panes, hairlines, toasts, blocks of text), compares them with
// the frame before, and keeps an event for each visible change; input
// events are kept too, so check.mjs can tell what the app did from what a
// hand did. __uilog.dump() gives the events as JSON lines (format: README).
//
// Positions: `r` is [x, y, w, h] in CSS pixels in the viewport. A move is
// reported when an element moves within what holds it (the nearest tracked
// element or scroll container), so a sliding sheet is one move, not one
// per row, and a page that scrolls is a `scroll`, not a move of every
// paragraph. A paragraph that moves on the page and on the screen (a
// layout shift the scroll doesn't make up for) is a move.
(() => {
  if (window.__uilog) return;

  // What an element is, by the skin's classes (read.css), in this order.
  const KINDS = [
    ["bar", ".bar, .pbar, .ptools, .pbartools, .tray, .capsule, .player"],
    ["sheet", ".panel, .menu, [role=dialog], dialog, .card, .popover"],
    ["toast", ".toast, .announce"],
    ["hairline", ".arrival, hr"],
    ["row", ".row, .tile, .gcell, .grid .cell, .menu button"],
    ["button", "button, [role=button], input, select, textarea, .tool, .dot, .switch, .info, .more"],
    ["heading", ".phead, h1, h2, h3, .hero"],
  ];
  // Kinds whose appearing or going all at once (in one frame) is a pop.
  const PHRASING = new Set(["SPAN", "A", "B", "I", "EM", "STRONG", "SUP", "SUB", "MARK", "SMALL", "BR", "WBR", "LABEL", "ABBR", "CODE"]);
  const SKIPPED = new Set(["SCRIPT", "STYLE", "TEMPLATE", "HEAD", "META", "LINK", "TITLE", "NOSCRIPT", "svg", "SVG", "use", "path"]);
  // A frame without a visible change, this many in a row, is rest: then
  // the on-screen elements' rectangles are written once (overlap,
  // alignment and clipping are judged at rest).
  const REST_FRAMES = 18;
  const DESCRIPTOR_TEXT = 30;
  const EVENT_TEXT = 60;

  const ids = new WeakMap();
  let nextId = 1;
  const idOf = (el) => {
    let id = ids.get(el);
    if (!id) ids.set(el, (id = nextId++));
    return id;
  };

  const tracked = new Map(); // element -> its record (kind, descriptor, last state)
  const scrollers = new Set();
  const textDirty = new Set();
  let events = [];
  let on = false;
  let t0 = 0;
  let frameRequest = 0;
  let quietFrames = 0;
  let restWritten = false;
  let pointerDown = false;
  let lastMoveInputFrame = -1;
  let wheelPending = null;
  let frameNumber = 0;
  const now = () => Math.round((performance.now() - t0) * 10) / 10;
  const emit = (e) => events.push(Object.assign({ t: now() }, e));
  const round = (x) => Math.round(x * 10) / 10;

  const collapse = (s) => s.replace(/\s+/g, " ").trim();
  const shortText = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

  // ---- which elements, and what each is ----
  function directText(el) {
    for (let n = el.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && /\S/.test(n.data)) return true;
    return false;
  }

  function kindOf(el) {
    if (SKIPPED.has(el.tagName) || el.closest("svg")) return null;
    for (const [kind, selector] of KINDS) if (el.matches(selector)) return kind;
    // (Links and spans inside text are part of their paragraph.)
    if (PHRASING.has(el.tagName)) return null;
    const style = getComputedStyle(el);
    if (/(auto|scroll|overlay)/.test(style.overflowY) || /(auto|scroll|overlay)/.test(style.overflowX)) return "pane";
    // (A block of text: its own words, or only words and inline elements
    // inside it, as a paragraph of verses is.)
    const leafBlock = [...el.children].every((c) => PHRASING.has(c.tagName) || c.tagName === "svg") && /\S/.test(el.textContent);
    if (style.display !== "inline" && style.display !== "contents" && (leafBlock || directText(el))) return el.closest("#reader, .preader") ? "para" : "text";
    return null;
  }

  function describe(el, kind) {
    let d = el.tagName.toLowerCase();
    if (el.id) d += "#" + el.id;
    const classes = [...el.classList].slice(0, 2);
    if (classes.length) d += "." + classes.join(".");
    const role = el.getAttribute("role");
    if (role && role !== "button") d += `[${role}]`;
    const label = el.getAttribute("aria-label");
    if (label) d += ` [${shortText(label, 24)}]`;
    if (kind !== "pane" && kind !== "sheet" && kind !== "bar") {
      const text = collapse(el.textContent || "");
      if (text) d += ` "${shortText(text, DESCRIPTOR_TEXT)}"`;
    }
    return d;
  }

  function consider(el) {
    // (The page's own scroller is tracked from start to stop, whatever its
    // style: a sheet that stops the page scrolling doesn't make it go.)
    if (el.nodeType !== 1 || el === document.scrollingElement || el === document.documentElement || el === document.body) return;
    const kind = kindOf(el);
    const record = tracked.get(el);
    if (kind && !record) tracked.set(el, { id: idOf(el), kind, d: describe(el, kind), state: null, anchor: undefined });
    else if (kind && record && record.kind !== kind) record.kind = kind;
    else if (!kind && record) forget(el, record);
    if (kind === "pane") scrollers.add(el);
  }

  function forget(el, record) {
    if (record.state && record.state.shown) emit({ e: "remove", id: record.id, d: record.d });
    tracked.delete(el);
    scrollers.delete(el);
  }

  function scanSubtree(root) {
    if (root.nodeType !== 1) return;
    consider(root);
    for (const el of root.querySelectorAll("*")) consider(el);
  }

  // The nearest tracked ancestor whose text includes el's.
  function owner(node) {
    for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) if (tracked.has(el)) return el;
    return null;
  }

  const observer = new MutationObserver((records) => {
    for (const m of records) {
      if (m.type === "childList") {
        for (const n of m.addedNodes) scanSubtree(n);
        const o = owner(m.target);
        if (o) textDirty.add(o);
        for (const r of tracked.values()) r.anchor = undefined;
      } else if (m.type === "characterData") {
        const o = owner(m.target);
        if (o) textDirty.add(o);
      } else if (m.type === "attributes") {
        consider(m.target);
        const record = tracked.get(m.target);
        if (record && m.attributeName === "aria-label") record.d = describe(m.target, record.kind);
      }
    }
  });

  // ---- measuring ----
  // What holds el: the nearest tracked ancestor or scroll container (the
  // document's scroller if none), cached until the tree changes.
  function anchorOf(el, record) {
    if (record.anchor !== undefined) return record.anchor;
    // (Fixed or sticky itself: held by the screen.)
    if (/^(fixed|sticky)$/.test(getComputedStyle(el).position)) return (record.anchor = null);
    let a = el.parentElement;
    while (a && !tracked.has(a) && !scrollers.has(a)) {
      if (getComputedStyle(a).position === "fixed") {
        a = null;
        break;
      }
      a = a.parentElement;
    }
    if (a === null && el.parentElement && getComputedStyle(el).position !== "fixed") {
      // (No holder, not fixed: on the page, which scrolls.)
      let fixed = false;
      for (let p = el.parentElement; p; p = p.parentElement) if (getComputedStyle(p).position === "fixed") fixed = true;
      a = fixed ? null : document.scrollingElement;
    }
    if (a === document.documentElement || a === document.body) a = document.scrollingElement;
    record.anchor = a;
    return a;
  }

  const styles = new WeakMap();
  const styleOf = (el) => {
    let s = styles.get(el);
    if (!s) styles.set(el, (s = getComputedStyle(el)));
    return s;
  };

  function measure(el, record, frame) {
    const style = styleOf(el);
    const box = el.getBoundingClientRect();
    const shown = el.isConnected && (box.width > 0 || box.height > 0) && style.visibility !== "hidden";
    // Opacity: its own and its ancestors', up to and including what holds it.
    let opacity = parseFloat(style.opacity);
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const known = frame.opacity.get(p);
      if (known !== undefined) {
        opacity *= known;
        break;
      }
      opacity *= parseFloat(styleOf(p).opacity);
    }
    frame.opacity.set(el, opacity);
    const r = [round(box.left), round(box.top), round(box.width), round(box.height)];
    const onScreen = shown && box.right > 0 && box.bottom > 0 && box.left < innerWidth && box.top < innerHeight;
    return { shown, r, opacity: Math.round(opacity * 100) / 100, onScreen, box };
  }

  // el's rectangle within what holds it (in its content, for a scroller).
  function relative(el, record, state, frame) {
    const a = anchorOf(el, record);
    if (a === null) return state.r;
    if (a === document.scrollingElement) return [state.r[0] + scrollX, round(state.r[1] + scrollY), state.r[2], state.r[3]];
    let ab = frame.boxes.get(a);
    if (!ab) frame.boxes.set(a, (ab = a.getBoundingClientRect()));
    const sx = scrollers.has(a) ? a.scrollLeft : 0;
    const sy = scrollers.has(a) ? a.scrollTop : 0;
    return [round(state.r[0] - ab.left + sx), round(state.r[1] - ab.top + sy), state.r[2], state.r[3]];
  }

  const textOf = (el) => collapse(el.textContent || "");

  // Whether el's text is cut off: wider than its box where it hides the
  // overflow (an ellipsis among them), or more lines than a line clamp.
  function clipped(el) {
    const s = styleOf(el);
    const hides = s.overflowX !== "visible" || s.textOverflow === "ellipsis";
    if (hides && el.scrollWidth > el.clientWidth + 1) return true;
    const clamp = s.webkitLineClamp && s.webkitLineClamp !== "none";
    return Boolean(clamp && el.scrollHeight > el.clientHeight + 1);
  }

  function scrollPosition(el) {
    return el === document.scrollingElement ? [Math.round(scrollX), Math.round(scrollY)] : [Math.round(el.scrollLeft), Math.round(el.scrollTop)];
  }

  // ---- each frame ----
  function frameTick() {
    frameRequest = 0;
    if (!on) return;
    const started = performance.now();
    frameNumber++;
    if (wheelPending) {
      emit(wheelPending);
      wheelPending = null;
    }
    const before = events.length;
    const frame = { opacity: new Map(), boxes: new Map() };
    const measured = [];
    for (const [el, record] of tracked) {
      if (!el.isConnected) {
        forget(el, record);
        continue;
      }
      measured.push([el, record, measure(el, record, frame)]);
    }
    for (const [el, record, state] of measured) {
      const old = record.state;
      const textChanged = !old || textDirty.has(el);
      state.text = textChanged ? (record.kind === "pane" || record.kind === "sheet" || record.kind === "bar" ? "" : textOf(el)) : old.text;
      state.rel = state.shown ? relative(el, record, state, frame) : null;
      if (scrollers.has(el) || el === document.scrollingElement) state.scroll = scrollPosition(el);
      record.state = state;
      if (!old || !old.shown) {
        if (state.shown) {
          const e = { e: "add", id: record.id, k: record.kind, d: record.d, r: state.r, o: state.opacity };
          if (state.text) e.tx = shortText(state.text, EVENT_TEXT);
          if (!state.onScreen) e.off = 1;
          if (!old && frameNumber === 1) e.base = 1;
          if (state.scroll) e.s = state.scroll;
          // (What holds it: its id, and whether that is a scroll container.)
          const a = anchorOf(el, record);
          if (a) {
            e.a = tracked.get(a)?.id ?? idOf(a);
            if (scrollers.has(a)) e.sc = 1;
          }
          emit(e);
        }
        continue;
      }
      if (!state.shown) {
        emit({ e: "remove", id: record.id, d: record.d, r: old.r });
        continue;
      }
      const visible = state.onScreen || old.onScreen;
      if (visible) {
        const [a, b] = [old.rel, state.rel];
        // (Moved within what holds it, and on the screen: a scroll alone
        // moves it only on the screen, and a change above it that the
        // page's scroll makes up for only within the page.)
        const differs = (p, q) => Math.abs(p[0] - q[0]) >= 0.5 || Math.abs(p[1] - q[1]) >= 0.5 || Math.abs(p[2] - q[2]) >= 0.5 || Math.abs(p[3] - q[3]) >= 0.5;
        const moved = differs(a, b) && differs(old.r, state.r);
        if (moved) emit({ e: "move", id: record.id, d: record.d, r: state.r, dx: round(b[0] - a[0]), dy: round(b[1] - a[1]), dw: round(b[2] - a[2]), dh: round(b[3] - a[3]) });
        if (Math.abs(old.opacity - state.opacity) >= 0.02) emit({ e: "fade", id: record.id, d: record.d, from: old.opacity, to: state.opacity });
        if (old.text !== state.text) emit({ e: "text", id: record.id, d: record.d, from: shortText(old.text, EVENT_TEXT), to: shortText(state.text, EVENT_TEXT) });
      }
      if (state.scroll && old.scroll && (state.scroll[0] !== old.scroll[0] || state.scroll[1] !== old.scroll[1])) {
        const e = { e: "scroll", id: record.id, d: record.d, from: old.scroll[1], to: state.scroll[1] };
        if (state.scroll[0] !== old.scroll[0]) Object.assign(e, { fromx: old.scroll[0], tox: state.scroll[0] });
        // (Out of sight before and after, as a panel laid out past the
        // window's edge: kept, but not seen.)
        if (!visible) e.off = 1;
        emit(e);
      }
    }
    textDirty.clear();
    writePanes();
    const changed = events.length > before && events.slice(before).some((e) => e.e !== "input");
    quietFrames = changed ? 0 : quietFrames + 1;
    if (changed) restWritten = false;
    if (!restWritten && quietFrames >= REST_FRAMES) {
      restWritten = true;
      writeRest(measured);
    }
    emit({ e: "f", c: round(performance.now() - started) });
    frameRequest = requestAnimationFrame(frameTick);
  }

  // At rest: each on-screen, visible element's rectangle, whether its text
  // is clipped, and the rectangle of what clips it (its scroll container),
  // so the checker can judge overlap, alignment and clipping.
  function writeRest(measured) {
    const items = [];
    for (const [el, record, state] of measured) {
      if (!state.shown || !state.onScreen || state.opacity < 0.05) continue;
      const item = [record.id, ...state.r];
      const textual = record.kind !== "pane" && record.kind !== "sheet" && record.kind !== "bar" && record.kind !== "hairline";
      item.push(textual && state.text && clipped(el) ? 1 : 0);
      // (The visible part of it: inside its scroll containers and the viewport.)
      let [l, t, r, b] = [state.box.left, state.box.top, state.box.right, state.box.bottom];
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (scrollers.has(p)) {
          const pb = p.getBoundingClientRect();
          [l, t, r, b] = [Math.max(l, pb.left), Math.max(t, pb.top), Math.min(r, pb.right), Math.min(b, pb.bottom)];
        }
      }
      [l, t, r, b] = [Math.max(l, 0), Math.max(t, 0), Math.min(r, innerWidth), Math.min(b, innerHeight)];
      if (r - l < 1 || b - t < 1) continue;
      // (Covered by something over it, as the page under a sheet: left out.)
      const hit = document.elementFromPoint((l + r) / 2, (t + b) / 2);
      if (hit && !el.contains(hit) && !hit.contains(el)) continue;
      item.push([round(l), round(t), round(r - l), round(b - t)]);
      // (Where its words begin, for alignment: the first line's first glyph.)
      item.push(textual ? textStart(el) : null);
      items.push(item);
    }
    emit({ e: "rest", items });
  }

  // ---- the two panes, linked ----
  // While the panel reads beside the page, each frame either pane's scroll
  // changed (and the frame after, which shows it stopped): both offsets
  // and the place at each one's reading line (skin.js's lineY: a third of
  // the way down below the bar on the page, the top of the panel's list),
  // as CHAPTER:VERSE.FRACTION, so the checker can measure how the follower
  // keeps up with the leader.
  let lastPanes = null;
  let panesMoving = false;
  function writePanes() {
    const list = [...document.querySelectorAll(".panel .plist")].find((l) => l.querySelector(".preader") && l.getClientRects().length);
    if (!list) {
      lastPanes = null;
      return;
    }
    const offsets = [Math.round(scrollY * 10) / 10, Math.round(list.scrollTop * 10) / 10];
    const moved = !lastPanes || offsets[0] !== lastPanes[0] || offsets[1] !== lastPanes[1];
    if (!moved && !panesMoving) return;
    panesMoving = moved;
    lastPanes = offsets;
    const bar = document.querySelector(".bar").getBoundingClientRect().bottom;
    const listBox = list.getBoundingClientRect();
    emit({ e: "panes", p: offsets, at: [placeAt(document.querySelector("#reader"), bar + 0.333 * (innerHeight - bar)), placeAt(list, listBox.top + 1)] });
  }

  // The verse (or a commentary's comment, data-l) at height y of what holds
  // a reader, and how far through it: "C:V.FF", or null.
  function placeAt(box, y) {
    const r = box.getBoundingClientRect();
    for (const dy of [0, 3, -3, 8, -8, 14]) {
      for (const x of [r.left + 60, r.left + r.width / 2, r.left + 30]) {
        const hit = document.elementFromPoint(x, y + dy);
        const v = hit && hit.closest && box.contains(hit) ? hit.closest("[data-v], [data-l]") : null;
        if (!v) continue;
        const section = v.closest("section");
        const attribute = v.dataset.v !== undefined ? "data-v" : "data-l";
        const value = v.getAttribute(attribute);
        let top = Infinity;
        let bottom = -Infinity;
        for (const piece of (section || box).querySelectorAll(`[${attribute}="${value}"]`))
          for (const rect of piece.getClientRects()) {
            top = Math.min(top, rect.top);
            bottom = Math.max(bottom, rect.bottom);
          }
        const fraction = bottom > top ? Math.min(0.99, Math.max(0, (y - top) / (bottom - top))) : 0;
        return `${section ? section.dataset.c : "?"}:${attribute === "data-l" ? "l" : ""}${value}${fraction.toFixed(2).slice(1)}`;
      }
    }
    return null;
  }

  function textStart(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/\S/.test(n.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const node = walker.nextNode();
    if (!node) return null;
    const range = document.createRange();
    const at = node.data.search(/\S/);
    range.setStart(node, at);
    range.setEnd(node, at + 1);
    const rect = range.getClientRects()[0];
    return rect ? round(rect.left) : null;
  }

  // ---- input ----
  // Which pane an input is in: 1 the panel, 0 the page.
  const paneOf = (e) => (e.target && e.target.closest && e.target.closest(".panel") ? 1 : 0);
  function inputTarget(e) {
    const o = e.target && e.target.nodeType ? owner(e.target) : null;
    return o ? tracked.get(o).d : undefined;
  }
  const listeners = {
    pointerdown: (e) => {
      pointerDown = true;
      emit({ e: "input", type: "pointerdown", x: Math.round(e.clientX), y: Math.round(e.clientY), pane: paneOf(e), on: inputTarget(e) });
    },
    pointerup: (e) => {
      pointerDown = false;
      emit({ e: "input", type: "pointerup", x: Math.round(e.clientX), y: Math.round(e.clientY) });
    },
    pointermove: (e) => {
      if (!pointerDown || lastMoveInputFrame === frameNumber) return;
      lastMoveInputFrame = frameNumber;
      emit({ e: "input", type: "pointermove", x: Math.round(e.clientX), y: Math.round(e.clientY), pane: paneOf(e) });
    },
    touchstart: (e) => emit({ e: "input", type: "touchstart", n: e.touches.length, pane: paneOf(e), on: inputTarget(e) }),
    touchend: (e) => emit({ e: "input", type: "touchend", n: e.touches.length }),
    touchmove: (e) => {
      if (lastMoveInputFrame === frameNumber) return;
      lastMoveInputFrame = frameNumber;
      emit({ e: "input", type: "touchmove", pane: paneOf(e) });
    },
    wheel: (e) => {
      if (wheelPending) wheelPending.dy += e.deltaY;
      else wheelPending = { e: "input", type: "wheel", x: Math.round(e.clientX), y: Math.round(e.clientY), dy: e.deltaY, pane: paneOf(e), on: inputTarget(e) };
    },
    keydown: (e) => emit({ e: "input", type: "key", key: e.key }),
    click: (e) => emit({ e: "input", type: "click", on: inputTarget(e) }),
  };

  // ---- the controls ----
  function start() {
    if (on) return;
    events = [];
    t0 = performance.now();
    frameNumber = 0;
    quietFrames = 0;
    restWritten = false;
    on = true;
    emit({ e: "meta", platform: "web", viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, url: location.href, build: buildNames(), time: new Date().toISOString() });
    tracked.clear();
    scrollers.clear();
    scrollers.add(document.scrollingElement);
    tracked.set(document.scrollingElement, { id: idOf(document.scrollingElement), kind: "pane", d: "page (document scroll)", state: null, anchor: null });
    scanSubtree(document.body);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "style", "aria-label", "role", "open"] });
    for (const [type, f] of Object.entries(listeners)) addEventListener(type, f, { capture: true, passive: true });
    frameRequest = requestAnimationFrame(frameTick);
  }

  function stop() {
    if (!on) return;
    on = false;
    observer.disconnect();
    for (const [type, f] of Object.entries(listeners)) removeEventListener(type, f, { capture: true });
    if (frameRequest) cancelAnimationFrame(frameRequest);
    frameRequest = 0;
    emit({ e: "stop" });
  }

  // The site's hashed file names (which build this is).
  function buildNames() {
    const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || "";
    const css = [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.getAttribute("href")).join(" ");
    return { app: meta("sb-app"), wasm: meta("sb-wasm"), data: meta("sb-data"), css };
  }

  window.__uilog = {
    start,
    stop,
    // A note in the log (a steps file's step), and an input that is not a
    // DOM event (a line sent to core standing for a tap).
    mark: (label) => emit({ e: "mark", label }),
    input: (type, detail) => emit({ e: "input", type, detail }),
    count: () => events.length,
    // The events from index `from`, `count` of them, as JSON lines.
    dump: (from = 0, count = events.length) =>
      events
        .slice(from, from + count)
        .map((e) => JSON.stringify(e))
        .join("\n"),
  };
})();
