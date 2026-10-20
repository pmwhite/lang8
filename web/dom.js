// The page for L8 programs: the host side of programs/web/dom.l8.
//
//   const dom = domHost();
//   const { instance } = await instantiate(module, sys, dom.imports);
//   dom.attach(instance);   // before _start
//   runStart(instance);     // main sets the page up; callbacks go on after
//
// Nodes and other host objects are kept in a table and named by index (a
// handle; 0 is none, 1 to 7 are the window, document, body, head, root
// element, location and history). A node remembers its own handle, so an
// event's target can be named by the nearest node L8 holds. Callbacks are
// L8 function values (indices in the module's table) called with the data
// they were given, the event record filled first.

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const HANDLE = Symbol("l8 handle");

export function domHost() {
  let mem = null;
  let instance = null;
  let heapBase = Infinity;
  // The event record (dom_setup): addresses of its ints, floats and text.
  let rec = { ints: 0, floats: 0, text: 0, textCap: 0 };
  let current = null;

  const objects = [null, window, document, document.body, document.head, document.documentElement, location, history];
  const free = [];
  const FIXED = objects.length;
  objects.forEach((o, h) => {
    try {
      if (o) o[HANDLE] = h;
    } catch {}
  });
  const hold = (o) => {
    if (o == null) return 0n;
    if (o[HANDLE] !== undefined && objects[o[HANDLE]] === o) return BigInt(o[HANDLE]);
    const h = free.length ? free.pop() : objects.length;
    objects[h] = o;
    try {
      o[HANDLE] = h;
    } catch {}
    return BigInt(h);
  };
  const obj = (h) => objects[Number(h)];
  const release = (h) => {
    h = Number(h);
    if (h < FIXED || objects[h] == null) return;
    const o = objects[h];
    if (o[HANDLE] === h) delete o[HANDLE];
    objects[h] = null;
    free.push(h);
  };
  // The nearest node to n (itself or an ancestor) with a handle.
  const known = (n) => {
    while (n && n[HANDLE] === undefined) n = n.parentNode;
    return n || null;
  };

  // Strings: literals (below the heap) never change, so they are decoded once.
  const literals = new Map();
  const str = (p) => {
    p = Number(p);
    if (p < heapBase) {
      let s = literals.get(p);
      if (s === undefined) literals.set(p, (s = decoder.decode(mem.counted(p))));
      return s;
    }
    return decoder.decode(mem.counted(p));
  };
  const range = (b, start, end) => {
    const p = Number(b);
    return decoder.decode(mem.bytes().subarray(p + Number(start), p + Number(end)));
  };
  // UTF-8 of s into the []i8 at out, as much as fits: its whole length.
  const give = (s, out) => {
    const data = typeof s === "string" ? encoder.encode(s) : s;
    const p = Number(out);
    const cap = Number(mem.view().getBigInt64(p - 8, true));
    mem.bytes().set(data.subarray(0, Math.min(cap, data.length)), p);
    return BigInt(data.length);
  };
  const words = (out, list) => {
    const v = mem.view();
    const p = Number(out);
    const cap = Number(v.getBigInt64(p - 8, true));
    list.slice(0, cap).forEach((x, i) => v.setBigInt64(p + 8 * i, BigInt(Math.trunc(x)), true));
  };
  const doubles = (out, list) => {
    const v = mem.view();
    const p = Number(out);
    const cap = Number(v.getBigInt64(p - 8, true));
    list.slice(0, cap).forEach((x, i) => v.setFloat64(p + 8 * i, x, true));
  };

  // The record filled, then f(data) called.
  const call = (f, data, fill) => {
    const v = mem.view();
    for (let i = 0; i < 16; i++) v.setBigInt64(rec.ints + 8 * i, 0n, true);
    for (let i = 0; i < 8; i++) v.setFloat64(rec.floats + 8 * i, 0, true);
    fill(v);
    try {
      instance.exports.table.get(Number(f))(BigInt(data));
    } catch (e) {
      console.error("l8 callback failed", e);
    }
  };
  const setInt = (v, i, x) => v.setBigInt64(rec.ints + 8 * i, BigInt(Math.trunc(x)), true);
  const setFloat = (v, i, x) => v.setFloat64(rec.floats + 8 * i, x, true);
  const setText = (v, type, key) => {
    const t = encoder.encode(type).subarray(0, 64);
    const k = encoder.encode(key || "").subarray(0, rec.textCap - t.length);
    mem.bytes().set(t, rec.text);
    mem.bytes().set(k, rec.text + t.length);
    setInt(v, 7, t.length);
    setInt(v, 8, k.length);
  };
  const fillEvent = (id, e) => (v) => {
    setInt(v, 0, id);
    setInt(v, 1, Number(hold(known(e.target))));
    setInt(v, 2, Number(hold(e.currentTarget)));
    setInt(v, 3, (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0));
    setInt(v, 4, e.button ?? 0);
    setInt(v, 5, e.buttons ?? 0);
    setInt(v, 6, e.detail ?? 0);
    setText(v, e.type, e.key);
    setFloat(v, 0, e.clientX ?? 0);
    setFloat(v, 1, e.clientY ?? 0);
    setFloat(v, 2, e.deltaX ?? 0);
    setFloat(v, 3, e.deltaY ?? 0);
    setFloat(v, 4, e.timeStamp ?? 0);
  };

  // Listeners, timers, frames, fetches and media queries share one id space.
  let nextId = 1;
  const listeners = new Map();
  const timers = new Map();
  const fetches = new Map();

  // A text position as the nearest node with a handle and the UTF-8 length
  // of its text before the position.
  const position = (node, offset) => {
    const owner = known(node);
    if (!owner) return [0, 0];
    const r = document.createRange();
    r.setStart(owner, 0);
    r.setEnd(node, offset);
    return [Number(hold(owner)), encoder.encode(r.toString()).length];
  };
  // The text node and UTF-16 offset at byte `bytes` of node's text.
  const locate = (node, bytes) => {
    const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let last = null;
    for (let t = walk.nextNode(); t; t = walk.nextNode()) {
      last = t;
      const n = encoder.encode(t.data).length;
      if (bytes <= n) {
        let i = 0;
        let b = 0;
        while (i < t.data.length && b < bytes) {
          const c = t.data.codePointAt(i);
          b += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
          i += c >= 0x10000 ? 2 : 1;
        }
        return [t, i];
      }
      bytes -= n;
    }
    return last ? [last, last.data.length] : [node, 0];
  };

  const env = {
    dom_setup(ints, floats, text) {
      rec = { ints: Number(ints), floats: Number(floats), text: Number(text), textCap: Number(this.view().getBigInt64(Number(text) - 8, true)) };
      return 0n;
    },
    dom_log(s) {
      console.log(str(s));
      return 0n;
    },
    dom_log_of(b, start, end) {
      console.log(range(b, start, end));
      return 0n;
    },

    dom_create: (tag) => hold(document.createElement(str(tag))),
    dom_create_svg: (tag) => hold(document.createElementNS("http://www.w3.org/2000/svg", str(tag))),
    dom_text: (s) => hold(document.createTextNode(str(s))),
    dom_text_of: (b, start, end) => hold(document.createTextNode(range(b, start, end))),
    dom_fragment: () => hold(document.createDocumentFragment()),
    dom_by_id: (id) => hold(document.getElementById(str(id))),
    dom_query: (h, sel) => hold(obj(h)?.querySelector(str(sel))),
    dom_parent: (h) => hold(obj(h)?.parentNode),
    dom_append(parent, child) {
      obj(parent).appendChild(obj(child));
      return 0n;
    },
    dom_insert(parent, child, before) {
      obj(parent).insertBefore(obj(child), obj(before) || null);
      return 0n;
    },
    dom_remove(h) {
      obj(h)?.remove();
      return 0n;
    },
    dom_clear(h) {
      const n = obj(h);
      for (const c of n.childNodes) freeTree(c);
      n.replaceChildren();
      return 0n;
    },
    dom_free(h) {
      release(h);
      return 0n;
    },
    dom_free_tree(h) {
      const n = obj(h);
      if (n) freeTree(n);
      return 0n;
    },
    dom_handles: () => BigInt(objects.length - FIXED - free.length),

    dom_set_text(h, s) {
      obj(h).textContent = str(s);
      return 0n;
    },
    dom_set_text_of(h, b, start, end) {
      obj(h).textContent = range(b, start, end);
      return 0n;
    },
    dom_get_text: (h, out) => give(obj(h)?.textContent ?? "", out),
    dom_set_html(h, s) {
      obj(h).innerHTML = str(s);
      return 0n;
    },
    dom_set_html_of(h, b, start, end) {
      obj(h).innerHTML = range(b, start, end);
      return 0n;
    },
    dom_insert_html_of(h, where, b, start, end) {
      const n = obj(h);
      const w = Number(where);
      const html = range(b, start, end);
      const at = [n.previousElementSibling, n.firstElementChild, n.lastElementChild, n.nextElementSibling][w];
      n.insertAdjacentHTML(["beforebegin", "afterbegin", "beforeend", "afterend"][w], html);
      // The first element put in: the one after what was there before.
      const first = w === 0 ? (at ? at.nextElementSibling : n.parentElement.firstElementChild)
        : w === 1 ? n.firstElementChild
        : w === 2 ? (at ? at.nextElementSibling : n.firstElementChild)
        : n.nextElementSibling;
      return first === n || first === at ? 0n : hold(first);
    },
    dom_set_attr(h, name, value) {
      obj(h).setAttribute(str(name), str(value));
      return 0n;
    },
    dom_set_attr_of(h, name, b, start, end) {
      obj(h).setAttribute(str(name), range(b, start, end));
      return 0n;
    },
    dom_set_attr_int(h, name, value) {
      obj(h).setAttribute(str(name), String(value));
      return 0n;
    },
    dom_remove_attr(h, name) {
      obj(h).removeAttribute(str(name));
      return 0n;
    },
    dom_get_attr(h, name, out) {
      const v = obj(h)?.getAttribute(str(name));
      return v == null ? -1n : give(v, out);
    },
    dom_set_class(h, names) {
      obj(h).className = str(names);
      return 0n;
    },
    dom_add_class(h, name) {
      obj(h).classList.add(str(name));
      return 0n;
    },
    dom_remove_class(h, name) {
      obj(h).classList.remove(str(name));
      return 0n;
    },
    dom_toggle_class(h, name, on) {
      obj(h).classList.toggle(str(name), on !== 0n);
      return 0n;
    },
    dom_class_all(h, selector, name, on) {
      const list = obj(h).querySelectorAll(str(selector));
      const k = str(name);
      for (const e of list) e.classList.toggle(k, on !== 0n);
      return BigInt(list.length);
    },
    dom_count: (h, selector) => BigInt(obj(h).querySelectorAll(str(selector)).length),
    dom_set_style(h, property, value) {
      const v = str(value);
      if (v === "") obj(h).style.removeProperty(str(property));
      else obj(h).style.setProperty(str(property), v);
      return 0n;
    },

    dom_set_prop(h, name, value) {
      const o = obj(h);
      const k = str(name);
      o[k] = typeof o[k] === "boolean" ? value !== 0 : value;
      return 0n;
    },
    dom_set_prop_s(h, name, value) {
      obj(h)[str(name)] = str(value);
      return 0n;
    },
    dom_set_prop_of(h, name, b, start, end) {
      obj(h)[str(name)] = range(b, start, end);
      return 0n;
    },
    dom_get_prop(h, name) {
      const v = obj(h)?.[str(name)];
      return typeof v === "boolean" ? (v ? 1 : 0) : Number(v) || 0;
    },
    dom_get_prop_s(h, name, out) {
      const v = obj(h)?.[str(name)];
      return typeof v === "string" ? give(v, out) : -1n;
    },
    dom_has_prop: (h, name) => (str(name) in obj(h) ? 1n : 0n),
    dom_prop_handle(h, name) {
      const v = obj(h)?.[str(name)];
      return v !== null && (typeof v === "object" || typeof v === "function") ? hold(v) : 0n;
    },
    dom_call(h, name) {
      return result(obj(h)[str(name)]());
    },
    dom_call_s(h, name, arg) {
      return result(obj(h)[str(name)](str(arg)));
    },

    dom_rect(h, out) {
      const r = obj(h).getBoundingClientRect();
      doubles(out, [r.x, r.y, r.width, r.height]);
      return 0n;
    },
    dom_scroll(h, out) {
      const o = obj(h);
      if (o === window) {
        const d = document.documentElement;
        doubles(out, [scrollX, scrollY, d.scrollWidth, d.scrollHeight, innerWidth, innerHeight]);
      } else doubles(out, [o.scrollLeft, o.scrollTop, o.scrollWidth, o.scrollHeight, o.clientWidth, o.clientHeight]);
      return 0n;
    },
    dom_rects(h, out) {
      const list = [...obj(h).getClientRects()];
      doubles(out, list.flatMap((r) => [r.x, r.y, r.width, r.height]));
      return BigInt(list.length);
    },
    dom_point(x, y, selector) {
      const e = document.elementFromPoint(x, y);
      const sel = str(selector);
      return hold(e && sel ? e.closest(sel) : e);
    },
    dom_scroll_to(h, x, y, smooth) {
      obj(h).scrollTo({ left: x, top: y, behavior: smooth ? "smooth" : "instant" });
      return 0n;
    },
    dom_scroll_into_view(h, block, smooth) {
      obj(h).scrollIntoView({ block: ["start", "center", "end", "nearest"][Number(block)] || "start", behavior: smooth ? "smooth" : "instant" });
      return 0n;
    },

    dom_listen(h, type, flags, f, data) {
      const id = nextId++;
      const fl = Number(flags);
      const target = obj(h);
      const handler = (e) => {
        if (fl & 1) e.preventDefault();
        const was = current;
        current = e;
        call(f, data, fillEvent(id, e));
        current = was;
      };
      const options = { passive: (fl & 2) !== 0, capture: (fl & 4) !== 0, once: (fl & 8) !== 0 };
      target.addEventListener(str(type), handler, options);
      listeners.set(id, () => target.removeEventListener(str(type), handler, options));
      return BigInt(id);
    },
    dom_unlisten(id) {
      listeners.get(Number(id))?.();
      listeners.delete(Number(id));
      return 0n;
    },
    dom_event_attr(name, out) {
      const k = str(name);
      const e = current?.target?.closest?.(`[${CSS.escape(k)}]`);
      return e ? give(e.getAttribute(k), out) : -1n;
    },
    dom_event_closest: (selector) => hold(current?.target?.closest?.(str(selector))),
    dom_prevent_default() {
      current?.preventDefault();
      return 0n;
    },
    dom_stop_propagation() {
      current?.stopPropagation();
      return 0n;
    },

    dom_selection(out) {
      const s = getSelection();
      if (!s || s.rangeCount === 0) {
        words(out, [0, 0, 0, 0]);
        return 0n;
      }
      const r = s.getRangeAt(0);
      words(out, [...position(r.startContainer, r.startOffset), ...position(r.endContainer, r.endOffset)]);
      return r.collapsed ? 1n : 2n;
    },
    dom_selection_text: (out) => give(getSelection()?.toString() ?? "", out),
    dom_select(a, start, b, end) {
      const r = document.createRange();
      r.setStart(...locate(obj(a), Number(start)));
      r.setEnd(...locate(obj(b), Number(end)));
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
      return 0n;
    },
    dom_select_none() {
      getSelection()?.removeAllRanges();
      return 0n;
    },

    dom_push_state(url) {
      history.pushState(null, "", str(url));
      return 0n;
    },
    dom_replace_state(url) {
      history.replaceState(null, "", str(url));
      return 0n;
    },
    dom_push_state_of(b, start, end) {
      history.pushState(null, "", range(b, start, end));
      return 0n;
    },
    dom_replace_state_of(b, start, end) {
      history.replaceState(null, "", range(b, start, end));
      return 0n;
    },

    dom_push(url, un, state, sn) {
      history.pushState(range(state, 0, sn), "", range(url, 0, un));
      return 0n;
    },
    dom_replace(url, un, state, sn) {
      history.replaceState(range(state, 0, sn), "", range(url, 0, un));
      return 0n;
    },
    dom_state: (out) => (typeof history.state === "string" ? give(history.state, out) : -1n),

    dom_fetch: (url, f, data) => fetchInto(str(url), f, data, false),
    dom_fetch_gz: (url, f, data) => fetchInto(str(url), f, data, true),
    dom_fetch_take(id, out, at) {
      const body = fetches.get(Number(id)) ?? new Uint8Array(0);
      fetches.delete(Number(id));
      const p = Number(out);
      const cap = Number(mem.view().getBigInt64(p - 8, true)) - Number(at);
      const n = Math.max(0, Math.min(cap, body.length));
      mem.bytes().set(body.subarray(0, n), p + Number(at));
      return BigInt(n);
    },

    dom_fetch_body(id) {
      const body = fetches.get(Number(id)) ?? new Uint8Array(0);
      fetches.delete(Number(id));
      return BigInt(mem.newCounted(body));
    },

    dom_store_get(key, out) {
      const v = localStorage.getItem(str(key));
      return v == null ? -1n : give(v, out);
    },
    dom_store_set(key, value, n) {
      const p = Number(value);
      localStorage.setItem(str(key), decoder.decode(mem.bytes().subarray(p, p + Number(n))));
      return 0n;
    },
    dom_store_set_s(key, value) {
      localStorage.setItem(str(key), str(value));
      return 0n;
    },
    dom_store_remove(key) {
      localStorage.removeItem(str(key));
      return 0n;
    },
    dom_store_count: () => BigInt(localStorage.length),
    dom_store_key(i, out) {
      const k = localStorage.key(Number(i));
      return k == null ? -1n : give(k, out);
    },

    dom_now: () => performance.now(),
    dom_date_now: () => Date.now(),
    dom_timeout(ms, f, data) {
      const id = nextId++;
      timers.set(id, ["t", setTimeout(() => {
        timers.delete(id);
        call(f, data, (v) => setInt(v, 0, id));
      }, ms)]);
      return BigInt(id);
    },
    dom_interval(ms, f, data) {
      const id = nextId++;
      timers.set(id, ["i", setInterval(() => call(f, data, (v) => setInt(v, 0, id)), ms)]);
      return BigInt(id);
    },
    dom_frame(f, data) {
      const id = nextId++;
      timers.set(id, ["f", requestAnimationFrame((t) => {
        timers.delete(id);
        call(f, data, (v) => {
          setInt(v, 0, id);
          setFloat(v, 5, t);
        });
      })]);
      return BigInt(id);
    },
    dom_cancel(id) {
      const t = timers.get(Number(id));
      if (t) {
        if (t[0] === "t") clearTimeout(t[1]);
        else if (t[0] === "i") clearInterval(t[1]);
        else cancelAnimationFrame(t[1]);
        timers.delete(Number(id));
      }
      return 0n;
    },

    dom_wake_lock(on) {
      if (!navigator.wakeLock) return 0n;
      wakeWanted = on !== 0n;
      if (wakeWanted) wake();
      else {
        wakeLock?.release();
        wakeLock = null;
      }
      return 1n;
    },

    dom_media: (query) => (matchMedia(str(query)).matches ? 1n : 0n),
    dom_media_listen(query, f, data) {
      const id = nextId++;
      const m = matchMedia(str(query));
      const handler = () => call(f, data, (v) => {
        setInt(v, 0, id);
        setInt(v, 9, m.matches ? 1 : 0);
      });
      m.addEventListener("change", handler);
      listeners.set(id, () => m.removeEventListener("change", handler));
      return BigInt(id);
    },
  };

  // A GET, its body kept until the program takes it; unzipped if gz.
  const fetchInto = (url, f, data, gz) => {
    const id = nextId++;
    const done = (status, body) => {
      fetches.set(id, body);
      call(f, data, (v) => {
        setInt(v, 0, id);
        setInt(v, 9, status);
        setInt(v, 10, body.length);
      });
    };
    fetch(url)
      .then(async (r) => {
        if (!r.ok || !gz) return done(r.status, new Uint8Array(await r.arrayBuffer()));
        const plain = r.body.pipeThrough(new DecompressionStream("gzip"));
        done(r.status, new Uint8Array(await new Response(plain).arrayBuffer()));
      })
      .catch(() => done(0, new Uint8Array(0)));
    return BigInt(id);
  };

  let wakeWanted = false;
  let wakeLock = null;
  const wake = () => {
    if (!wakeWanted || wakeLock || document.visibilityState !== "visible") return;
    navigator.wakeLock.request("screen").then((l) => {
      wakeLock = l;
      l.addEventListener("release", () => {
        if (wakeLock === l) wakeLock = null;
      });
    }).catch(() => {});
  };
  document.addEventListener("visibilitychange", wake);

  const freeTree = (n) => {
    if (n[HANDLE] !== undefined) release(n[HANDLE]);
    for (const c of n.childNodes) freeTree(c);
  };
  const result = (v) => {
    if (v && typeof v.then === "function") {
      v.catch((e) => console.warn("l8 dom_call:", e));
      return 0;
    }
    return typeof v === "boolean" ? (v ? 1 : 0) : Number(v) || 0;
  };

  // A call into a missing node logs and answers 0, rather than unwinding
  // through the module (which would leave its stack pointer moved).
  for (const [name, f] of Object.entries(env)) {
    env[name] = function (...args) {
      try {
        mem ??= this;
        return f.apply(this, args);
      } catch (e) {
        console.error(`l8 ${name} failed`, e);
        return name === "dom_get_prop" || name === "dom_call" || name === "dom_call_s" || name.startsWith("dom_now") || name === "dom_date_now" ? 0 : -1n;
      }
    };
  }
  return {
    imports: env,
    // Literals lie below the heap as it is before _start.
    attach(inst) {
      instance = inst;
      heapBase = Number(inst.exports.l8_heap.value);
    },
    objects,
  };
}
