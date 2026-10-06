#!/usr/bin/env node
// Run a module from `l8 wasm` under Node: node web/run.mjs module.wasm [args...]
// File descriptors are the process's own, so `l8 test` can run tests here.
import fs from "node:fs";
import { instantiate, runStart, ENOENT, EBADF } from "./l8-runtime.js";

const [path, ...rest] = process.argv.slice(2);
if (!path) {
  process.stderr.write("usage: node web/run.mjs module.wasm [args...]\n");
  process.exit(2);
}

const errno = (e, fallback = EBADF) => -(e && typeof e.errno === "number" ? Math.abs(e.errno) : fallback);
const sys = {
  args: [path, ...rest],
  env: Object.entries(process.env).map(([k, v]) => `${k}=${v}`),
  write(fd, data) {
    try {
      return fs.writeSync(fd, data);
    } catch (e) {
      return errno(e);
    }
  },
  read(fd, n) {
    const buf = new Uint8Array(n);
    try {
      return buf.subarray(0, fs.readSync(fd, buf, 0, n, null));
    } catch (e) {
      return errno(e);
    }
  },
  open(p, flags, mode) {
    try {
      return fs.openSync(p, flags, mode);
    } catch (e) {
      return errno(e, ENOENT);
    }
  },
  close(fd) {
    try {
      fs.closeSync(fd);
      return 0;
    } catch (e) {
      return errno(e);
    }
  },
};

const module = await WebAssembly.compile(fs.readFileSync(path));
const { instance } = await instantiate(module, sys);
process.exitCode = runStart(instance);
