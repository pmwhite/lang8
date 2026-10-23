// Hot reload for modules from `l8 wasm` (RELOAD.md). A reload starts a new
// instance of the program from a new module; the program's `persistent`
// globals keep their values, copied from the old instance's memory into the
// new one's before it starts, so its initializers leave them be. Everything
// else starts over, as the program's own startup makes it.
//
//   const r = new Reloader({ sys, imports, run: (instance) => runStart(instance) });
//   await r.load(bytes);            // the first build: instantiate and run
//   await r.load(newerBytes);       // a reload: carry the persistent state, run
//   watchBuilds("http://laptop:8777", (bytes) => r.load(bytes));   // from web/dev.mjs
//
// A module may be reloaded only while none of its code is on the stack:
// after main returned (a program that lives on in callbacks), or paused in
// an `--async` import (`l8_async_state` is 1). `Reloader.load` checks the
// latter and refuses otherwise.
import { instantiate } from "./l8-runtime.js";

const decoder = new TextDecoder();

// The kinds in the `l8persist` section (src2/persist.l8).
const INT = 1;
const UINT = 2;
const FLOAT = 3;
const BOOL = 4;
const STR = 5;
const OPTSTR = 6;
const PTR = 7;
const OPTPTR = 8;
const SLICE = 9;
const OPTSLICE = 10;
const ARRAY = 11;
const RECORD = 12;
const ENUM = 13;

// ---- the l8persist section ----
// { types: [{kind, size, elem?, n?, name?, fields?, variants?, tagSize?}],
//   globals: [{name, address, flag, type}] }, or null for a module without
// persistent globals.
export function persistManifest(module) {
  const sections = WebAssembly.Module.customSections(module, "l8persist");
  if (!sections.length) return null;
  const b = new Uint8Array(sections[0]);
  let i = 0;
  const uleb = () => {
    let r = 0;
    let shift = 0;
    let c;
    do {
      c = b[i++];
      r += (c & 127) * 2 ** shift;
      shift += 7;
    } while (c & 128);
    return r;
  };
  const sleb = () => {
    let r = 0;
    let shift = 0;
    let c;
    do {
      c = b[i++];
      r += (c & 127) * 2 ** shift;
      shift += 7;
    } while (c & 128);
    return c & 64 ? r - 2 ** shift : r;
  };
  const name = () => {
    const n = uleb();
    const s = decoder.decode(b.subarray(i, i + n));
    i += n;
    return s;
  };
  const fields = () => {
    const n = uleb();
    const out = [];
    for (let k = 0; k < n; k++) out.push({ name: name(), offset: uleb(), type: uleb() });
    return out;
  };
  const version = uleb();
  if (version !== 1) throw new Error(`l8persist: version ${version}`);
  const ntypes = uleb();
  const types = [];
  for (let t = 0; t < ntypes; t++) {
    const kind = b[i++];
    switch (kind) {
      case INT:
      case UINT:
      case FLOAT:
      case BOOL:
      case STR:
      case OPTSTR:
        types.push({ kind, size: uleb() });
        break;
      case PTR:
      case OPTPTR:
      case SLICE:
      case OPTSLICE:
        types.push({ kind, elem: uleb(), size: 8 });
        break;
      case ARRAY: {
        // An element's entry precedes its array's.
        const elem = uleb();
        const n = uleb();
        types.push({ kind, elem, n, size: n * types[elem].size });
        break;
      }
      case RECORD:
        types.push({ kind, name: name(), size: uleb(), fields: fields() });
        break;
      case ENUM: {
        const t = { kind, name: name(), size: uleb(), tagSize: uleb(), variants: [] };
        const n = uleb();
        for (let k = 0; k < n; k++) t.variants.push({ name: name(), tag: sleb(), offset: uleb(), fields: fields() });
        types.push(t);
        break;
      }
      default:
        throw new Error(`l8persist: type kind ${kind}`);
    }
  }
  const nglobals = uleb();
  const globals = [];
  for (let g = 0; g < nglobals; g++) globals.push({ name: name(), address: uleb(), flag: uleb(), type: uleb() });
  return { version, types, globals };
}

// ---- types across versions ----
// A type a new field can be given a value of without the old program's
// help: zero, an empty string or slice, null, or such fields. A new `*T`
// cannot (null is not a value of it).
function defaultable(m, ti, seen = new Set()) {
  const t = m.types[ti];
  switch (t.kind) {
    case PTR:
      return false;
    case ARRAY:
      return defaultable(m, t.elem, seen);
    case RECORD:
      if (seen.has(ti)) return true;
      seen.add(ti);
      return t.fields.every((f) => defaultable(m, f.type, seen));
    case ENUM:
      if (seen.has(ti)) return true;
      seen.add(ti);
      return t.variants[0].fields.every((f) => defaultable(m, f.type, seen));
    default:
      return true;
  }
}

// Whether a value of the old type oi can be the new type ni's: "same",
// "migrate" (records and variants matched by name: fields that went are
// dropped, new ones given defaults, tags renumbered, a value made optional)
// or null. Recursive types are assumed compatible while being compared.
function compat(om, oi, nm, ni, memo) {
  const key = `${oi}:${ni}`;
  if (memo.has(key)) return memo.get(key);
  memo.set(key, "same");
  const o = om.types[oi];
  const n = nm.types[ni];
  let r = null;
  if (o.kind === n.kind) {
    switch (n.kind) {
      case INT:
      case UINT:
      case FLOAT:
      case BOOL:
        r = o.size === n.size ? "same" : null;
        break;
      case STR:
      case OPTSTR:
        r = "same";
        break;
      case PTR:
      case OPTPTR:
      case SLICE:
      case OPTSLICE:
        r = compat(om, o.elem, nm, n.elem, memo);
        break;
      case ARRAY:
        r = o.n === n.n ? compat(om, o.elem, nm, n.elem, memo) : null;
        break;
      case RECORD:
        r = compatFields(om, o.fields, nm, n.fields, memo);
        break;
      case ENUM: {
        r = o.tagSize === n.tagSize ? "same" : "migrate";
        for (const ov of o.variants) {
          const nv = n.variants.find((v) => v.name === ov.name);
          if (!nv) {
            r = null;
            break;
          }
          const f = compatFields(om, ov.fields, nm, nv.fields, memo);
          if (!f) {
            r = null;
            break;
          }
          if (f === "migrate" || nv.tag !== ov.tag || nv.offset !== ov.offset) r = "migrate";
        }
        break;
      }
    }
  } else if ((o.kind === STR && n.kind === OPTSTR) || (o.kind === PTR && n.kind === OPTPTR) || (o.kind === SLICE && n.kind === OPTSLICE)) {
    // A value may become optional, never the reverse: null is not a value
    // of the non-optional type.
    r = o.kind === STR ? "migrate" : compat(om, o.elem, nm, n.elem, memo) && "migrate";
  }
  memo.set(key, r);
  return r;
}

function compatFields(om, ofields, nm, nfields, memo) {
  let r = "same";
  for (const f of nfields) {
    const g = ofields.find((x) => x.name === f.name);
    if (!g) {
      if (!defaultable(nm, f.type)) return null;
      r = "migrate";
      continue;
    }
    const c = compat(om, g.type, nm, f.type, memo);
    if (!c) return null;
    if (c === "migrate" || g.offset !== f.offset) r = "migrate";
  }
  if (ofields.some((g) => !nfields.find((f) => f.name === g.name))) r = "migrate";
  return r;
}

// ---- memory ----
// Views of an instance's memory, made again after it grows.
function memory(instance) {
  const exports = instance.exports;
  let buffer = null;
  let view = null;
  let bytes = null;
  const fresh = () => {
    if (exports.memory.buffer !== buffer) {
      buffer = exports.memory.buffer;
      view = new DataView(buffer);
      bytes = new Uint8Array(buffer);
    }
  };
  return {
    bytes() {
      fresh();
      return bytes;
    },
    i64(a) {
      fresh();
      return Number(view.getBigInt64(a, true));
    },
    setI64(a, v) {
      fresh();
      view.setBigInt64(a, BigInt(v), true);
    },
    int(a, size) {
      fresh();
      if (size === 1) return view.getInt8(a);
      if (size === 4) return view.getInt32(a, true);
      return Number(view.getBigInt64(a, true));
    },
    setInt(a, size, v) {
      fresh();
      if (size === 1) view.setInt8(a, v);
      else if (size === 4) view.setInt32(a, v, true);
      else view.setBigInt64(a, BigInt(v), true);
    },
    zero(a, n) {
      fresh();
      bytes.fill(0, a, a + n);
    },
    alloc(size) {
      const p = Number(exports.l8_malloc(BigInt(size)));
      if (p === 0) throw new Error("l8: out of memory");
      return p;
    },
  };
}

// ---- the transfer ----
// Copy the old instance's persistent globals into the new instance, which
// must not have started (its heap is empty and its initializers have not
// run). What one global points to is copied once, so sharing and cycles
// survive. Returns { carried, migrated, initialized, dropped } (names), and
// says what happened to each global through log.
export function transferState(oldInstance, oldManifest, newInstance, newManifest, log = () => {}) {
  const report = { carried: [], migrated: [], initialized: [], dropped: [] };
  if (!newManifest) return report;
  const old = memory(oldInstance);
  const neu = memory(newInstance);
  const om = oldManifest || { types: [], globals: [] };
  const nm = newManifest;
  const map = new Map();
  const memo = new Map();

  function copy(oi, oa, ni, na) {
    const o = om.types[oi];
    const n = nm.types[ni];
    switch (n.kind) {
      case INT:
      case UINT:
      case FLOAT:
      case BOOL:
        neu.bytes().set(old.bytes().subarray(oa, oa + n.size), na);
        break;
      case STR:
      case OPTSTR: {
        const p = old.i64(oa);
        if (p === 0) {
          neu.setI64(na, 0);
          break;
        }
        const key = `${p}:${ni}`;
        let np = map.get(key);
        if (np === undefined) {
          const len = old.i64(p - 8);
          np = neu.alloc(8 + len + 1);
          neu.setI64(np, len);
          np += 8;
          neu.bytes().set(old.bytes().subarray(p, p + len), np);
          neu.bytes()[np + len] = 0;
          map.set(key, np);
        }
        neu.setI64(na, np);
        break;
      }
      case PTR:
      case OPTPTR: {
        const p = old.i64(oa);
        if (p === 0) {
          neu.setI64(na, 0);
          break;
        }
        const key = `${p}:${ni}`;
        let np = map.get(key);
        if (np === undefined) {
          np = neu.alloc(Math.max(nm.types[n.elem].size, 8));
          map.set(key, np);
          copy(o.elem, p, n.elem, np);
        }
        neu.setI64(na, np);
        break;
      }
      case SLICE:
      case OPTSLICE: {
        const p = old.i64(oa);
        if (p === 0) {
          neu.setI64(na, 0);
          break;
        }
        const key = `${p}:${ni}`;
        let np = map.get(key);
        if (np === undefined) {
          const len = old.i64(p - 8);
          const oe = om.types[o.elem];
          const ne = nm.types[n.elem];
          np = neu.alloc(8 + len * ne.size);
          neu.setI64(np, len);
          np += 8;
          map.set(key, np);
          for (let k = 0; k < len; k++) copy(o.elem, p + k * oe.size, n.elem, np + k * ne.size);
        }
        neu.setI64(na, np);
        break;
      }
      case ARRAY: {
        const oe = om.types[o.elem];
        const ne = nm.types[n.elem];
        for (let k = 0; k < n.n; k++) copy(o.elem, oa + k * oe.size, n.elem, na + k * ne.size);
        break;
      }
      case RECORD:
        copyFields(o.fields, oa, n.fields, na);
        break;
      case ENUM: {
        const tag = old.int(oa, o.tagSize);
        const ov = o.variants.find((v) => v.tag === tag);
        const nv = n.variants.find((v) => v.name === ov.name);
        neu.setInt(na, n.tagSize, nv.tag);
        copyFields(ov.fields, oa + ov.offset, nv.fields, na + nv.offset);
        break;
      }
    }
  }

  function copyFields(ofields, oa, nfields, na) {
    for (const f of nfields) {
      const g = ofields.find((x) => x.name === f.name);
      if (g) copy(g.type, oa + g.offset, f.type, na + f.offset);
      else dflt(f.type, na + f.offset);
    }
  }

  // A new field's value: zero, "" or [] where zero is no value.
  function dflt(ni, na) {
    const n = nm.types[ni];
    neu.zero(na, n.size);
    switch (n.kind) {
      case STR:
      case SLICE: {
        const key = `empty:${ni}`;
        let np = map.get(key);
        if (np === undefined) {
          np = neu.alloc(9) + 8;
          map.set(key, np);
        }
        neu.setI64(na, np);
        break;
      }
      case ARRAY:
        for (let k = 0; k < n.n; k++) dflt(n.elem, na + k * nm.types[n.elem].size);
        break;
      case RECORD:
        for (const f of n.fields) dflt(f.type, na + f.offset);
        break;
      case ENUM: {
        const v = n.variants[0];
        neu.setInt(na, n.tagSize, v.tag);
        for (const f of v.fields) dflt(f.type, na + v.offset + f.offset);
        break;
      }
    }
  }

  for (const g of nm.globals) {
    const o = om.globals.find((x) => x.name === g.name);
    if (!o) {
      report.initialized.push(g.name);
      log(`${g.name}: new; its initializer runs`);
      continue;
    }
    const c = compat(om, o.type, nm, g.type, memo);
    if (!c) {
      report.initialized.push(g.name);
      log(`${g.name}: its type changed so that the value cannot follow; its initializer runs`);
      continue;
    }
    copy(o.type, o.address, g.type, g.address);
    if (g.flag) neu.setI64(g.flag, 1);
    if (c === "same") report.carried.push(g.name);
    else {
      report.migrated.push(g.name);
      log(`${g.name}: carried into its changed type`);
    }
  }
  for (const o of om.globals) {
    if (!nm.globals.find((g) => g.name === o.name)) {
      report.dropped.push(o.name);
      log(`${o.name}: gone; dropped`);
    }
  }
  return report;
}

// ---- running one program through its builds ----
// sys and imports as instantiate() takes them; run(instance, mem, generation)
// starts a freshly instantiated module the host's way (runStart, or
// runResumable with the host's wait) and need not wait for it to end.
export class Reloader {
  constructor({ sys, imports = {}, run, log = (m) => console.log("l8 reload:", m) }) {
    this.sys = sys;
    this.imports = imports;
    this.run = run;
    this.log = log;
    this.current = null;
    this.generation = 0;
  }

  // Whether the running instance can be replaced now.
  idle() {
    const c = this.current;
    if (!c) return true;
    const state = c.instance.exports.l8_async_state;
    // A paused module is between callbacks; one whose main returned is
    // idle whenever the host's own code runs.
    return !c.running || state.value === 1n;
  }

  // The instance running now, or null.
  instance() {
    return this.current?.instance ?? null;
  }

  // Whether instance is the one running now (a callback from an older
  // instance should do nothing).
  isCurrent(instance) {
    return this.current?.instance === instance;
  }

  // Instantiate bytes (a module from `l8 wasm`) and run it; if a build was
  // running, carry its persistent globals over first. Resolves to
  // { generation, report }.
  async load(bytes) {
    if (!this.idle()) throw new Error("l8 reload: the program is running; reload between its callbacks");
    const module = bytes instanceof WebAssembly.Module ? bytes : await WebAssembly.compile(bytes);
    const manifest = persistManifest(module);
    const { instance, mem } = await instantiate(module, this.sys, this.imports);
    let report = null;
    const old = this.current;
    if (old) {
      report = transferState(old.instance, old.manifest, instance, manifest, this.log);
      const n = report.carried.length + report.migrated.length;
      this.log(`reloaded: ${n} persistent global${n === 1 ? "" : "s"} carried` + (report.initialized.length ? `, ${report.initialized.length} initialized` : "") + (report.dropped.length ? `, ${report.dropped.length} dropped` : ""));
    }
    this.generation++;
    const generation = this.generation;
    const current = { module, instance, mem, manifest, running: true };
    this.current = current;
    const done = () => {
      current.running = false;
    };
    const result = this.run(instance, mem, generation);
    if (result && typeof result.then === "function") result.then(done, done);
    else done();
    return { generation, report };
  }
}

// ---- builds from the development server (web/dev.mjs) ----
// Wait on base (http://host:port) for each build after `since`, and give
// each successful one's module bytes to onBuild (awaited; one at a time).
// A failed build's compiler output goes to log. Returns a function that
// stops watching.
export function watchBuilds(base, onBuild, { log = (m) => console.log("l8 dev:", m), since = 0 } = {}) {
  let stopped = false;
  let build = since;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  (async () => {
    while (!stopped) {
      try {
        const r = await fetch(`${base}/wait?since=${build}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status}`);
        const info = await r.json();
        if (stopped || info.build === build) continue;
        build = info.build;
        if (!info.ok) {
          log(`build ${info.build} failed:\n${info.log}`);
          continue;
        }
        const w = await fetch(`${base}/build.wasm?b=${build}`, { cache: "no-store" });
        if (!w.ok) throw new Error(`${w.status}`);
        await onBuild(new Uint8Array(await w.arrayBuffer()), info);
      } catch (e) {
        if (!stopped) {
          log(`${e.message || e}; retrying`);
          await sleep(1000);
        }
      }
    }
  })();
  return () => {
    stopped = true;
  };
}
