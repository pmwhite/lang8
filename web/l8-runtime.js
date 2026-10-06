// Host runtime for modules from `l8 wasm`. It works in browsers and in
// Node: the caller supplies a `sys` object for files and output.
//
// Every extern is an import from "env" named by its link name. Integers and
// pointers arrive as BigInt (i64), floats as numbers. Imports this host does
// not implement fail with -ENOSYS.
//
// sys: {
//   args: string[], env: string[],
//   write(fd, bytes) -> count | -errno,
//   read(fd, count) -> Uint8Array | -errno,
//   open(path, flags, mode) -> fd | -errno,
//   close(fd) -> 0 | -errno,
// }

export const ENOENT = 2;
export const EBADF = 9;
export const ENOSYS = 38;

// Thrown by the `exit` import; unwinds out of the module.
export class Exit extends Error {
  constructor(status) {
    super(`exit ${status}`);
    this.status = status;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Instantiate an L8 module. `extra` adds or overrides imports; each is
// called with the memory helpers as `this`.
export async function instantiate(module, sys, extra = {}) {
  let instance = null;
  const view = () => new DataView(instance.exports.memory.buffer);
  const bytes = () => new Uint8Array(instance.exports.memory.buffer);
  const mem = {
    view,
    bytes,
    // A counted str or []i8: data address with the length 8 bytes before it.
    counted(ptr) {
      const p = Number(ptr);
      const n = Number(view().getBigInt64(p - 8, true));
      return bytes().subarray(p, p + n);
    },
    string(ptr) {
      return decoder.decode(mem.counted(ptr));
    },
    alloc(size) {
      const p = Number(instance.exports.l8_malloc(BigInt(size)));
      if (p === 0) throw new Error("l8: out of memory");
      return p;
    },
    // A new []i8 or str (with a trailing NUL) holding data.
    newCounted(data) {
      const p = mem.alloc(8 + data.length + 1);
      view().setBigInt64(p, BigInt(data.length), true);
      bytes().set(data, p + 8);
      bytes()[p + 8 + data.length] = 0;
      return p + 8;
    },
    newStrings(list) {
      const outer = mem.alloc(8 + 8 * list.length);
      const items = list.map((s) => mem.newCounted(encoder.encode(s)));
      const v = view();
      v.setBigInt64(outer, BigInt(list.length), true);
      items.forEach((p, i) => v.setBigInt64(outer + 8 + 8 * i, BigInt(p), true));
      return BigInt(outer + 8);
    },
  };

  // Output written to fds 1 and 2, for `l8 test` expectation offsets.
  let outputOffset = 0n;
  const write = (fd, data) => {
    const n = sys.write(fd, data);
    if (n > 0 && (fd === 1 || fd === 2)) outputOffset += BigInt(n);
    return n;
  };
  const record = (a, b) => {
    const buf = new DataView(new ArrayBuffer(16));
    buf.setBigInt64(0, a, true);
    buf.setBigInt64(8, b, true);
    sys.write(3, new Uint8Array(buf.buffer));
  };
  const start = typeof performance !== "undefined" ? performance.now() : Date.now();
  const nowNs = () =>
    BigInt(Math.round(((typeof performance !== "undefined" ? performance.now() : Date.now()) - start) * 1e6));

  const env = {
    exit(code) {
      throw new Exit(Number(BigInt.asIntN(32, code)));
    },
    read(fd, ptr, n) {
      const r = sys.read(Number(fd), Number(n));
      if (typeof r === "number") return BigInt(r);
      bytes().set(r, Number(ptr));
      return BigInt(r.length);
    },
    l8_argv() {
      return mem.newStrings(sys.args);
    },
    l8_environment() {
      return mem.newStrings(sys.env || []);
    },
    open(path, flags, mode) {
      return BigInt(sys.open(mem.string(path), Number(flags), Number(mode)));
    },
    close(fd) {
      return BigInt(sys.close(Number(fd)));
    },
    l8_std_write(fd, ptr, n) {
      const p = Number(ptr);
      return BigInt(write(Number(fd), bytes().slice(p, p + Number(n))));
    },
    clock_gettime(_clock, ts) {
      const ns = nowNs();
      const v = view();
      v.setBigInt64(Number(ts), ns / 1000000000n, true);
      v.setBigInt64(Number(ts) + 8, ns % 1000000000n, true);
      return 0n;
    },
    getrusage(buf) {
      const p = Number(buf);
      bytes().fill(0, p, p + 144);
      return 0n;
    },
    rdtsc() {
      return nowNs();
    },
    l8_exit(code) {
      throw new Exit(Number(BigInt.asIntN(32, code)));
    },
    l8_os_write(fd, ptr, n) {
      return env.l8_std_write(fd, ptr, n);
    },
    l8_memcpy(dst, src, n) {
      bytes().copyWithin(Number(dst), Number(src), Number(src) + Number(n));
      return dst;
    },
    l8_heap_used() {
      return instance.exports.l8_heap.value - heapBase;
    },
    l8_time() {
      return BigInt(Math.floor(Date.now() / 1000));
    },
    l8_clock_gettime(clock, ts) {
      return env.clock_gettime(clock, ts);
    },
    l8_getrandom(ptr, n) {
      const p = Number(ptr);
      const out = bytes().subarray(p, p + Number(n));
      for (let i = 0; i < out.length; i += 65536) crypto.getRandomValues(out.subarray(i, i + 65536));
      return n;
    },
    // qsort through an L8 comparator: a function value is a table index.
    qsort(base, count, width, compare) {
      const n = Number(count);
      const w = Number(width);
      const b = Number(base);
      const cmp = instance.exports.table.get(Number(compare));
      const order = Array.from({ length: n }, (_, i) => i);
      order.sort((i, j) => Number(BigInt.asIntN(32, cmp(BigInt(b + i * w), BigInt(b + j * w)))));
      const copy = bytes().slice(b, b + n * w);
      order.forEach((from, to) => bytes().set(copy.subarray(from * w, from * w + w), b + to * w));
      return 0n;
    },
    l8_test_index() {
      const arg = sys.args[1];
      return arg !== undefined && /^[0-9]+$/.test(arg) ? BigInt(arg) : -1n;
    },
    l8_test_record(a, b) {
      record(a, b);
    },
    l8_test_expect(id) {
      record(id, outputOffset);
    },
  };

  // The C math library, for programs that `need "libm.so.6"`.
  for (const name of ["sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "exp", "log", "log2", "log10",
    "sqrt", "cbrt", "floor", "ceil", "round", "trunc", "fabs"]) {
    const f = name === "fabs" ? Math.abs : Math[name];
    env[name] = f;
    env[name + "f"] = (x) => Math.fround(f(x));
  }
  for (const [name, f] of [["pow", Math.pow], ["atan2", Math.atan2], ["fmod", (a, b) => a % b], ["hypot", Math.hypot]]) {
    env[name] = f;
    env[name + "f"] = (a, b) => Math.fround(f(a, b));
  }

  const imports = { env: {} };
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.kind !== "function") continue;
    const own = extra[imp.name] || env[imp.name];
    imports[imp.module] ??= {};
    // Functions see the memory helpers as `this`; WebAssembly.Suspending
    // wrappers pass through unchanged.
    imports[imp.module][imp.name] = typeof own === "function" ? own.bind(mem) : own ?? (() => BigInt(-ENOSYS));
  }
  instance = await WebAssembly.instantiate(module, imports);
  const heapBase = instance.exports.l8_heap.value;
  return { instance, mem };
}

// The status a module's exit recorded (main's result, or exit's argument).
const exitStatus = (instance) => Number(BigInt.asIntN(32, instance.exports.l8_exit_status.value));

// Run _start; return the exit status. Exits unwind inside the module, so no
// JavaScript exception crosses wasm frames.
export function runStart(instance) {
  try {
    instance.exports._start();
    return exitStatus(instance);
  } catch (e) {
    if (e instanceof Exit) return e.status;
    throw e;
  }
}

// Run _start through JS Promise Integration, so suspending imports can wait
// for the page; resolve to the exit status.
export async function runStartAsync(instance) {
  try {
    await WebAssembly.promising(instance.exports._start)();
    return exitStatus(instance);
  } catch (e) {
    if (e instanceof Exit) return e.status;
    throw e;
  }
}

// An in-memory file system for browsers: path -> Uint8Array.
export class MemFS {
  constructor(files = {}) {
    this.files = new Map();
    for (const [path, data] of Object.entries(files)) this.writeFile(path, data);
    this.fds = new Map();
    this.nextFd = 3;
    this.out = { 1: [], 2: [] };
    this.onOutput = null;
  }
  static normalize(path) {
    const parts = [];
    for (const part of path.split("/")) {
      if (part === "" || part === ".") continue;
      if (part === "..") parts.pop();
      else parts.push(part);
    }
    return "/" + parts.join("/");
  }
  writeFile(path, data) {
    this.files.set(MemFS.normalize(path), typeof data === "string" ? encoder.encode(data) : data);
  }
  readFile(path) {
    return this.files.get(MemFS.normalize(path));
  }
  sys(args, cwd = "/") {
    const resolve = (p) => MemFS.normalize(p.startsWith("/") ? p : cwd + "/" + p);
    return {
      args,
      env: [],
      write: (fd, data) => {
        if (fd === 1 || fd === 2) {
          this.onOutput?.(fd, data);
          return data.length;
        }
        const f = this.fds.get(fd);
        if (!f || !f.writable) return -EBADF;
        const grown = new Uint8Array(Math.max(f.data.length, f.pos + data.length));
        grown.set(f.data);
        grown.set(data, f.pos);
        f.data = grown;
        f.pos += data.length;
        this.files.set(f.path, f.data);
        return data.length;
      },
      read: (fd, n) => {
        const f = this.fds.get(fd);
        if (!f) return fd === 0 ? new Uint8Array(0) : -EBADF;
        const chunk = f.data.slice(f.pos, f.pos + n);
        f.pos += chunk.length;
        return chunk;
      },
      open: (path, flags) => {
        const full = resolve(path);
        const accmode = flags & 3;
        let data = this.files.get(full);
        if (flags & 512 || (data === undefined && flags & 64)) data = new Uint8Array(0);
        if (data === undefined) return -ENOENT;
        this.files.set(full, data);
        const fd = this.nextFd++;
        this.fds.set(fd, { path: full, data, pos: 0, writable: accmode !== 0 });
        return fd;
      },
      close: (fd) => (this.fds.delete(fd) ? 0 : -EBADF),
    };
  }
}
