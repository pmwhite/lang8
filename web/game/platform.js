// Browser implementations of the X11, GLX, OpenGL, and FreeType functions the
// block game imports, on a WebGL2 canvas. Pointers and integers arrive as
// BigInt; see ../l8-runtime.js for the module conventions.
//
// glXSwapBuffers pauses the module until the next animation frame (the module
// is built with `l8 wasm --async glXSwapBuffers`), so the game's own event
// loop drives the page.

const n = (v) => Number(v);
const i32 = (v) => Number(BigInt.asIntN(32, v));
const decoder = new TextDecoder();

// Keysyms for KeyboardEvent.code: XLookupKeysym(event, 0) is unshifted.
const SPECIAL_KEYS = {
  ArrowLeft: 65361, ArrowUp: 65362, ArrowRight: 65363, ArrowDown: 65364,
  Backspace: 65288, Tab: 65289, Enter: 65293, NumpadEnter: 65421, Escape: 65307,
  ShiftLeft: 65505, ShiftRight: 65506, ControlLeft: 65507, ControlRight: 65508,
  AltLeft: 65513, AltRight: 65514, Delete: 65535, Home: 65360, End: 65367,
  PageUp: 65365, PageDown: 65366, Insert: 65379, Space: 32,
  Minus: 45, Equal: 61, BracketLeft: 91, BracketRight: 93, Backslash: 92,
  Semicolon: 59, Quote: 39, Comma: 44, Period: 46, Slash: 47, Backquote: 96,
};
const TEXT_KEYS = { Enter: "\r", NumpadEnter: "\r", Backspace: "\b", Tab: "\t", Escape: "\x1b" };

function keysym(e) {
  if (e.code in SPECIAL_KEYS) return SPECIAL_KEYS[e.code];
  let m = e.code.match(/^Key([A-Z])$/);
  if (m) return m[1].toLowerCase().charCodeAt(0);
  m = e.code.match(/^(?:Digit|Numpad)([0-9])$/);
  if (m) return 48 + Number(m[1]);
  m = e.code.match(/^F([0-9]+)$/);
  if (m) return 65470 + Number(m[1]) - 1;
  return e.key.length === 1 ? e.key.charCodeAt(0) : 0;
}

// Words reserved in GLSL ES 3.00 that GLSL 1.20 code may use as names.
const RESERVED = /\b(patch|sample|smooth|flat|centroid|layout|filter|input|output|common|partition|active|half|fixed|long|short|double|unsigned|superp|union|enum|class|template|this|packed|goto|inline|noinline|volatile|public|static|extern|external|interface|namespace|using|cast|sizeof|resource|coherent|restrict|readonly|writeonly|subroutine|noperspective|buffer|shared)\b/g;

// GLSL to GLSL ES 3.00. Version 330 shaders (the water solver's fragment
// passes) only need the ES header. Version 120 shaders use attribute/varying,
// texture2D, shadow2D, and gl_FragColor, and may use ES keywords as names.
export function translateShader(source, fragment) {
  const version = Number((source.match(/^\s*#version\s+(\d+)/) ?? [0, 120])[1]);
  let s = source.replace(/^\s*#version[^\n]*\n/, "");
  let head = "#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n" +
    "precision highp sampler2DShadow;\n";
  if (version >= 300) return head + s;
  s = s.replace(RESERVED, "$1_l8");
  s = s.replace(/\btexture2DLod\s*\(/g, "textureLod(").replace(/\btexture2D\s*\(/g, "texture(");
  s = s.replace(/\bshadow2D\s*\(/g, "l8_shadow2D(");
  if (fragment) {
    s = s.replace(/\bvarying\b/g, "in").replace(/\bgl_FragColor\b/g, "l8_FragColor");
    head += "out vec4 l8_FragColor;\nvec4 l8_shadow2D(sampler2DShadow s, vec3 c) { return vec4(texture(s, c)); }\n";
  } else {
    s = s.replace(/\battribute\b/g, "in").replace(/\bvarying\b/g, "out");
  }
  return head + s;
}

// scale renders the window at that fraction of its size. env answers getenv.
export function createPlatform(canvas, { log = console.log, checkErrors = false, countCalls = false, timing = false, skip = new Set(), scale = 1, zoom = 0.85, env = {} } = {}) {
  let mem = null;
  let instance = null;
  const gl = canvas.getContext("webgl2", { antialias: false, depth: true, stencil: false, alpha: false });
  if (!gl) throw new Error("This browser does not support WebGL2.");
  // Float render targets let the water solver run as fragment passes. Its
  // displacement target blends; without float blending it uses half floats.
  const floatTargets = !!gl.getExtension("EXT_color_buffer_float");
  const floatBlend = !!gl.getExtension("EXT_float_blend");
  if (!floatTargets) log("WebGL2 cannot render to float textures; the water stays still.");
  const view = () => new DataView(instance.exports.memory.buffer);
  const bytes = () => new Uint8Array(instance.exports.memory.buffer);
  const cstring = (ptr) => {
    const b = bytes();
    let end = n(ptr);
    while (b[end] !== 0) end++;
    return decoder.decode(b.subarray(n(ptr), end));
  };
  const zeroed = (size) => {
    const p = mem.alloc(size);
    bytes().fill(0, p, p + size);
    return p;
  };

  // ---- keyboard ----

  const events = [];
  // Key events for the game, with what the telemetry reports about them:
  // presses (repeats included), and whether F3's frame-time view is open.
  let presses = 0;
  let frameView = false;
  const pushKey = (type, sym, text) => {
    if (type === 2) {
      presses++;
      if (sym === 65472) frameView = !frameView;
    }
    events.push({ type, keysym: sym, text });
  };
  const keyEvent = (type) => (e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.code !== "F5" && e.code !== "F11" && e.code !== "F12") e.preventDefault();
    const text = e.key.length === 1 ? e.key : TEXT_KEYS[e.code] ?? "";
    // A held key's repeats toggle nothing in the game; skip them for F3.
    if (e.repeat && keysym(e) === 65472) return;
    pushKey(type, keysym(e), text);
  };
  canvas.addEventListener("keydown", keyEvent(2));
  canvas.addEventListener("keyup", keyEvent(3));
  canvas.addEventListener("blur", () => {
    // Release held keys so nothing stays pressed while the page is unfocused.
    for (const code of [65361, 65362, 65363, 65364, 65505, 65506]) events.push({ type: 3, keysym: code, text: "" });
  });
  // The XEvent buffer is 192 bytes; its last word is free for the keysym.
  const EVENT_KEYSYM = 184;
  const EVENT_TEXT = 176;

  // ---- GL objects: integer names for WebGL objects ----

  const objects = [null];
  const name = (obj) => {
    objects.push(obj);
    return objects.length - 1;
  };
  const obj = (id) => objects[n(id)] ?? null;
  const genObjects = (count, ptr, create) => {
    const v = view();
    for (let i = 0; i < n(count); i++) v.setUint32(n(ptr) + 4 * i, name(create()), true);
    return 0n;
  };
  const shaders = new Map();
  // Uniform locations get integer names. The game sets most uniforms to the
  // value they already hold, so each location remembers its last value and
  // only changes reach WebGL.
  const uniforms = [null];
  const uniformProgram = [0];
  const uniformValues = [null];
  let currentProgram = -1;
  // Debug-group timing: names by message address, the open groups (name,
  // start), and total milliseconds by name.
  const phaseNames = new Map();
  const phaseStack = [];
  const phaseMs = {};
  // Draws to leave out, to measure what they cost: "fb44" or "prog3" for one
  // framebuffer or program, "offscreen" for every framebuffer but the
  // window's, or "all".
  const skipped = () =>
    skip.size > 0 &&
    (skip.has("all") || skip.has(`fb${boundFramebufferId}`) || skip.has(`prog${currentProgram}`) ||
      (boundFramebufferId !== 0 && skip.has("offscreen")));
  const changed = (l, ...values) => {
    if (l < 0n) return false;
    const id = n(l);
    const old = uniformValues[id];
    if (old && old.length === values.length && old.every((v, i) => v === values[i])) return false;
    uniformValues[id] = values;
    return true;
  };
  const programUniforms = new Map();
  let unpackAlignment = 4;
  let boundFramebuffer = null;
  let boundFramebufferId = 0;
  // The game's window takes the page's shape, up to MAX_WIDE wide or MAX_TALL
  // tall (a taller view looks past the world's edge), at a size
  // where one of its pixels covers at least `zoom` CSS pixels. The game keeps
  // its text and world at a fixed size in its own pixels, so a small screen
  // sees less of the world rather than an illegibly small view of all of it.
  // The game learns the size from ConfigureNotify events.
  const MAX_WIDE = 2.4;
  const MAX_TALL = 1.6;
  let windowSize = [1200, 720];
  // Canvas pixels per window pixel at full resolution: the screen's pixels,
  // but no more in all than a 1200 by 720 window has.
  let density = 1;
  const layout = () => {
    const w = Math.min(innerWidth, innerHeight * MAX_WIDE);
    const h = Math.min(innerHeight, innerWidth * MAX_TALL);
    const s = Math.max(Math.min(w / 1200, h / 720), zoom);
    const size = [Math.round(w / s), Math.round(h / s)];
    canvas.style.width = `${Math.round(w)}px`;
    canvas.style.height = `${Math.round(h)}px`;
    density = Math.min((devicePixelRatio || 1) * s, Math.sqrt((1200 * 720) / (size[0] * size[1])));
    if (size[0] !== windowSize[0] || size[1] !== windowSize[1]) {
      windowSize = size;
      events.push({ type: 22, keysym: 0, text: "", width: size[0], height: size[1] });
    }
    resize();
  };
  addEventListener("resize", layout);
  // The window renders at `scale` of that resolution: the game's viewport and
  // scissor rectangles on the default framebuffer shrink with it.
  let viewport = [0, 0, 1200, 720];
  let scissor = [0, 0, 1200, 720];
  const applyViewport = () => {
    const k = boundFramebuffer ? 1 : density * scale;
    const r = (box) => box.map((v) => Math.round(v * k));
    gl.viewport(...r(viewport));
    gl.scissor(...r(scissor));
  };
  const resize = () => {
    canvas.width = Math.round(windowSize[0] * density * scale);
    canvas.height = Math.round(windowSize[1] * density * scale);
    applyViewport();
  };

  const pixelView = (type, ptr, w, h, channels) => {
    if (ptr === 0n) return null;
    const p = n(ptr);
    if (type === gl.FLOAT) return new Float32Array(instance.exports.memory.buffer, p, w * h * channels);
    if (type === gl.UNSIGNED_INT) return new Uint32Array(instance.exports.memory.buffer, p, w * h * channels);
    const row = Math.ceil((w * channels) / unpackAlignment) * unpackAlignment;
    return bytes().subarray(p, p + row * h);
  };
  const channelsOf = (format) =>
    ({ [gl.RGBA]: 4, [gl.RGB]: 3, [gl.LUMINANCE_ALPHA]: 2, [gl.RG]: 2 })[format] ?? 1;

  const GL = {
    glCreateShader(kind) {
      const id = name(gl.createShader(n(kind)));
      shaders.set(id, { fragment: n(kind) === gl.FRAGMENT_SHADER, log: "" });
      return BigInt(id);
    },
    glShaderSource(sh, count, strings, lengths) {
      const v = view();
      let source = "";
      for (let i = 0; i < n(count); i++) {
        const p = Number(v.getBigInt64(n(strings) + 8 * i, true));
        const len = lengths === 0n ? -1 : v.getInt32(n(lengths) + 4 * i, true);
        source += len < 0 ? cstring(BigInt(p)) : decoder.decode(bytes().subarray(p, p + len));
      }
      const info = shaders.get(n(sh));
      gl.shaderSource(obj(sh), translateShader(source, info.fragment));
      return 0n;
    },
    glCompileShader(sh) {
      gl.compileShader(obj(sh));
      const info = shaders.get(n(sh));
      info.log = (gl.getShaderInfoLog(obj(sh)) || "").replace(/\0/g, "");
      if (!gl.getShaderParameter(obj(sh), gl.COMPILE_STATUS)) log(`shader: ${info.log}`);
      return 0n;
    },
    glGetShaderiv(sh, pname, out) {
      const value = n(pname) === gl.COMPILE_STATUS
        ? (gl.getShaderParameter(obj(sh), gl.COMPILE_STATUS) ? 1 : 0)
        : shaders.get(n(sh)).log.length + 1;
      view().setInt32(n(out), value, true);
      return 0n;
    },
    glGetShaderInfoLog(sh, max, lenPtr, buf) {
      const text = new TextEncoder().encode(shaders.get(n(sh)).log).subarray(0, Math.max(0, n(max) - 1));
      bytes().set(text, n(buf));
      bytes()[n(buf) + text.length] = 0;
      if (lenPtr !== 0n) view().setInt32(n(lenPtr), text.length, true);
      return 0n;
    },
    glCreateProgram: () => BigInt(name(gl.createProgram())),
    glAttachShader: (p, s) => (gl.attachShader(obj(p), obj(s)), 0n),
    glBindAttribLocation(p, index, nameStr) {
      gl.bindAttribLocation(obj(p), n(index), mem.string(nameStr));
      return 0n;
    },
    glLinkProgram(p) {
      // Linking resets the program's uniforms.
      uniformProgram.forEach((owner, id) => owner === n(p) && (uniformValues[id] = null));
      gl.linkProgram(obj(p));
      if (!gl.getProgramParameter(obj(p), gl.LINK_STATUS)) log(`link: ${gl.getProgramInfoLog(obj(p))}`);
      return 0n;
    },
    glGetProgramiv(p, pname, out) {
      const value = gl.getProgramParameter(obj(p), n(pname));
      view().setInt32(n(out), typeof value === "boolean" ? Number(value) : value ?? 0, true);
      return 0n;
    },
    glUseProgram(p) {
      if (n(p) !== currentProgram) {
        currentProgram = n(p);
        gl.useProgram(obj(p));
      }
      return 0n;
    },
    glGetUniformLocation(p, nameStr) {
      const key = `${n(p)}:${mem.string(nameStr)}`;
      if (!programUniforms.has(key)) {
        const loc = gl.getUniformLocation(obj(p), mem.string(nameStr));
        if (loc) {
          uniforms.push(loc);
          uniformProgram.push(n(p));
          uniformValues.push(null);
        }
        programUniforms.set(key, loc ? uniforms.length - 1 : -1);
      }
      return BigInt(programUniforms.get(key));
    },
    glUniform1i: (l, v) => (changed(l, i32(v)) && gl.uniform1i(uniforms[n(l)], i32(v)), 0n),
    glUniform1f: (l, x) => (changed(l, x) && gl.uniform1f(uniforms[n(l)], x), 0n),
    glUniform2f: (l, x, y) => (changed(l, x, y) && gl.uniform2f(uniforms[n(l)], x, y), 0n),
    glUniform3f: (l, x, y, z) => (changed(l, x, y, z) && gl.uniform3f(uniforms[n(l)], x, y, z), 0n),
    glUniform4f: (l, x, y, z, w) => (changed(l, x, y, z, w) && gl.uniform4f(uniforms[n(l)], x, y, z, w), 0n),
    glUniformMatrix4fv(l, count, transpose, ptr) {
      if (l < 0n) return 0n;
      const data = new Float32Array(instance.exports.memory.buffer, n(ptr), 16 * n(count));
      gl.uniformMatrix4fv(uniforms[n(l)], transpose !== 0n, data);
      return 0n;
    },
    glGenVertexArrays: (count, ptr) => genObjects(count, ptr, () => gl.createVertexArray()),
    glBindVertexArray: (a) => (gl.bindVertexArray(obj(a)), 0n),
    glGenBuffers: (count, ptr) => genObjects(count, ptr, () => gl.createBuffer()),
    glBindBuffer: (target, b) => (n(target) !== 37074 && gl.bindBuffer(n(target), obj(b)), 0n),
    glBufferData(target, size, data, usage) {
      if (n(target) === 37074) return 0n;
      if (data === 0n) gl.bufferData(n(target), n(size), n(usage));
      else gl.bufferData(n(target), bytes().subarray(n(data), n(data) + n(size)), n(usage));
      return 0n;
    },
    glBufferSubData(target, offset, size, data) {
      gl.bufferSubData(n(target), n(offset), bytes().subarray(n(data), n(data) + n(size)));
      return 0n;
    },
    // Compute shaders (OpenGL 4.3) do not exist in WebGL2; the game only uses
    // them after checking the version, which reports 3.0.
    glBindBufferBase: () => 0n,
    glDispatchCompute: () => 0n,
    glMemoryBarrier: () => 0n,
    glLogicOp: () => 0n,
    glGetIntegerv(pname, out) {
      // OpenGL 3.3: no compute shaders, but enough for fragment-pass water.
      const values = { 33307: 3, 33308: 3 };
      view().setInt32(n(out), values[n(pname)] ?? 0, true);
      return 0n;
    },
    glVertexAttribPointer(index, size, type, normalized, stride, offset) {
      gl.vertexAttribPointer(n(index), n(size), n(type), normalized !== 0n, n(stride), n(offset));
      return 0n;
    },
    glVertexAttrib4f: (index, x, y, z, w) => (gl.vertexAttrib4f(n(index), x, y, z, w), 0n),
    glEnableVertexAttribArray: (i) => (gl.enableVertexAttribArray(n(i)), 0n),
    glDisableVertexAttribArray: (i) => (gl.disableVertexAttribArray(n(i)), 0n),
    glVertexAttribDivisor: (i, d) => (gl.vertexAttribDivisor(n(i), n(d)), 0n),
    glViewport(x, y, w, h) {
      viewport = [n(x), n(y), n(w), n(h)];
      applyViewport();
      return 0n;
    },
    glScissor(x, y, w, h) {
      scissor = [n(x), n(y), n(w), n(h)];
      applyViewport();
      return 0n;
    },
    glClearColor: (r, g, b, a) => (gl.clearColor(r, g, b, a), 0n),
    glClear: (mask) => (gl.clear(n(mask)), 0n),
    // The game marks parts of a frame with debug groups; with timing, their
    // milliseconds go to the telemetry.
    glPushDebugGroup(_source, _id, length, message) {
      if (!timing) return 0n;
      const key = Number(message);
      let label = phaseNames.get(key);
      if (label === undefined) {
        label = decoder.decode(bytes().subarray(key, key + n(length)));
        phaseNames.set(key, label);
      }
      phaseStack.push(label, performance.now());
      return 0n;
    },
    glPopDebugGroup() {
      if (!timing || phaseStack.length < 2) return 0n;
      const t = phaseStack.pop();
      const label = phaseStack.pop();
      phaseMs[label] = (phaseMs[label] ?? 0) + performance.now() - t;
      return 0n;
    },
    glDrawArrays: (mode, first, count) => (skipped() || gl.drawArrays(n(mode), n(first), n(count)), 0n),
    glDrawArraysInstanced: (mode, first, count, k) => (skipped() || gl.drawArraysInstanced(n(mode), n(first), n(count), n(k)), 0n),
    glEnable: (cap) => (gl.enable(n(cap)), 0n),
    glDisable: (cap) => (gl.disable(n(cap)), 0n),
    glBlendFunc: (s, d) => (gl.blendFunc(n(s), n(d)), 0n),
    glDepthMask: (flag) => (gl.depthMask(flag !== 0n), 0n),
    glCullFace: (mode) => (gl.cullFace(n(mode)), 0n),
    glPolygonOffset: (factor, units) => (gl.polygonOffset(factor, units), 0n),
    glGenTextures: (count, ptr) => genObjects(count, ptr, () => gl.createTexture()),
    glBindTexture: (target, t) => (gl.bindTexture(n(target), obj(t)), 0n),
    glActiveTexture: (unit) => (gl.activeTexture(n(unit)), 0n),
    glTexParameteri: (target, pname, value) => (gl.texParameteri(n(target), n(pname), n(value)), 0n),
    glPixelStorei(pname, value) {
      if (n(pname) === gl.UNPACK_ALIGNMENT) unpackAlignment = n(value);
      gl.pixelStorei(n(pname), n(value));
      return 0n;
    },
    glTexImage2D(target, level, internal, w, h, border, format, type, pixels) {
      if (n(internal) === gl.R32F && pixels === 0n && !floatBlend) {
        gl.texImage2D(n(target), n(level), gl.R16F, n(w), n(h), n(border), n(format), gl.HALF_FLOAT, null);
        return 0n;
      }
      const data = pixelView(n(type), pixels, n(w), n(h), channelsOf(n(format)));
      gl.texImage2D(n(target), n(level), n(internal), n(w), n(h), n(border), n(format), n(type), data);
      return 0n;
    },
    glTexSubImage2D(target, level, x, y, w, h, format, type, pixels) {
      const data = pixelView(n(type), pixels, n(w), n(h), channelsOf(n(format)));
      gl.texSubImage2D(n(target), n(level), n(x), n(y), n(w), n(h), n(format), n(type), data);
      return 0n;
    },
    glGenFramebuffers: (count, ptr) => genObjects(count, ptr, () => gl.createFramebuffer()),
    glBindFramebuffer(target, fb) {
      boundFramebuffer = obj(fb);
      boundFramebufferId = n(fb);
      gl.bindFramebuffer(n(target), boundFramebuffer);
      applyViewport();
      return 0n;
    },
    glFramebufferTexture2D(target, attachment, textarget, tex, level) {
      gl.framebufferTexture2D(n(target), n(attachment), n(textarget), obj(tex), n(level));
      return 0n;
    },
    glGenRenderbuffers: (count, ptr) => genObjects(count, ptr, () => gl.createRenderbuffer()),
    glBindRenderbuffer: (target, rb) => (gl.bindRenderbuffer(n(target), obj(rb)), 0n),
    glRenderbufferStorage: (target, internal, w, h) => (gl.renderbufferStorage(n(target), n(internal), n(w), n(h)), 0n),
    glFramebufferRenderbuffer(target, attachment, rbtarget, rb) {
      gl.framebufferRenderbuffer(n(target), n(attachment), n(rbtarget), obj(rb));
      return 0n;
    },
    glCheckFramebufferStatus: (target) => BigInt(gl.checkFramebufferStatus(n(target))),
    // glDrawBuffer(GL_BACK) applies to the default framebuffer and NONE or a
    // color attachment to a framebuffer object.
    glDrawBuffer(buf) {
      gl.drawBuffers([boundFramebuffer ? n(buf) : n(buf) === 0 ? gl.NONE : gl.BACK]);
      return 0n;
    },
    glReadBuffer(buf) {
      gl.readBuffer(boundFramebuffer ? n(buf) : n(buf) === 0 ? gl.NONE : gl.BACK);
      return 0n;
    },
    glGetError: () => BigInt(gl.getError()),
  };

  // With checkErrors, report the first few GL calls that fail.
  if (checkErrors) {
    let reported = 0;
    for (const [key, f] of Object.entries(GL)) {
      GL[key] = (...args) => {
        const result = f(...args);
        const error = gl.getError();
        if (error && reported++ < 20) log(`GL error ${error} in ${key}(${args.join(", ")})`);
        return result;
      };
    }
  }

  // With countCalls, count GL calls by name, and those that repeat the
  // previous call with the same first argument (a uniform location, a
  // capability, or a binding target).
  const calls = {};
  const repeats = {};
  const callMs = {};
  const drawSites = {};
  const vertexCounts = {};
  // Bytes uploaded by each buffer function.
  const uploads = {};
  if (countCalls) {
    const last = new Map();
    for (const [key, f] of Object.entries(GL)) {
      GL[key] = (...args) => {
        calls[key] = (calls[key] ?? 0) + 1;
        const slot = `${key}:${args[0]}`;
        const text = args.join(",");
        if (last.get(slot) === text) repeats[key] = (repeats[key] ?? 0) + 1;
        last.set(slot, text);
        if (key === "glBufferData" && args[2] !== 0n) uploads[key] = (uploads[key] ?? 0) + n(args[1]);
        if (key === "glBufferSubData") uploads[key] = (uploads[key] ?? 0) + n(args[2]);
        if (key === "glDrawArrays" || key === "glDrawArraysInstanced") {
          // Vertices drawn per framebuffer and program, and debug skips.
          const target = `fb${boundFramebufferId} prog${currentProgram}`;
          const verts = n(args[2]) * (key === "glDrawArraysInstanced" ? n(args[3]) : 1);
          vertexCounts[target] = (vertexCounts[target] ?? 0) + verts;
          // The L8 functions that draw, from the stack (the module names them).
          const site = new Error().stack.split("\n").filter((line) => line.includes("wasm-function")).slice(0, 2)
            .map((line) => line.replace(/^\s*at\s+/, "").replace(/\s*\(.*$/, "")).join(" < ");
          drawSites[site] = (drawSites[site] ?? 0) + n(args[2]) * (key === "glDrawArraysInstanced" ? n(args[3]) : 1);
        }
        const t = performance.now();
        const result = f(...args);
        callMs[key] = (callMs[key] ?? 0) + performance.now() - t;
        return result;
      };
    }
  }

  // With timing, the milliseconds spent in each GL function and its calls.
  // Safari's clock is coarse, but its error averages out over many calls.
  const glMs = {};
  const glCalls = {};
  if (timing) {
    for (const [key, f] of Object.entries(GL)) {
      glMs[key] = 0;
      glCalls[key] = 0;
      GL[key] = (...args) => {
        const t = performance.now();
        const result = f(...args);
        glMs[key] += performance.now() - t;
        glCalls[key]++;
        return result;
      };
    }
  }

  // ---- X11 and GLX ----

  // Frames shown, and the milliseconds the game spent computing them.
  let frames = 0;
  let work = 0;
  let resumed = 0;
  const X = {
    XOpenDisplay: () => BigInt(zeroed(64)),
    XDefaultScreen: () => 0n,
    XRootWindow: () => 1n,
    XBlackPixel: () => 0n,
    XWhitePixel: () => 16777215n,
    XCreateColormap: () => 1n,
    // The window gets the page's size, whatever the game asks for.
    XCreateWindow() {
      layout();
      return 2n;
    },
    XCreateSimpleWindow() {
      layout();
      return 2n;
    },
    XStoreName(_d, _w, title) {
      document.title = mem.string(title);
      return 0n;
    },
    XInternAtom: () => 1n,
    XPending: () => BigInt(events.length),
    XNextEvent(_d, ev) {
      const e = events.shift() ?? { type: 0, keysym: 0, text: "" };
      const v = view();
      bytes().fill(0, n(ev), n(ev) + 192);
      v.setInt32(n(ev), e.type, true);
      // XConfigureEvent's width and height.
      if (e.type === 22) {
        v.setInt32(n(ev) + 56, e.width, true);
        v.setInt32(n(ev) + 60, e.height, true);
      }
      v.setBigInt64(n(ev) + EVENT_KEYSYM, BigInt(e.keysym), true);
      const text = new TextEncoder().encode(e.text).subarray(0, 7);
      bytes().set(text, n(ev) + EVENT_TEXT);
      return 0n;
    },
    XLookupKeysym: (ev) => view().getBigInt64(n(ev) + EVENT_KEYSYM, true),
    XLookupString(ev, buf, nbytes, keysymPtr) {
      const b = bytes();
      let len = 0;
      while (len < 7 && b[n(ev) + EVENT_TEXT + len] !== 0) len++;
      len = Math.min(len, n(nbytes));
      b.copyWithin(n(buf), n(ev) + EVENT_TEXT, n(ev) + EVENT_TEXT + len);
      if (keysymPtr !== 0n) view().setBigInt64(n(keysymPtr), view().getBigInt64(n(ev) + EVENT_KEYSYM, true), true);
      return BigInt(len);
    },
    glXChooseVisual() {
      const p = zeroed(64);
      view().setInt32(p + 20, 24, true);
      return BigInt(p);
    },
    glXCreateContext: () => 1n,
    glXMakeCurrent: () => 1n,
    glXDestroyContext: () => 0n,
    glXSwapIntervalEXT: () => 0n,
    // The module is built with `--async glXSwapBuffers`: a swap pauses it
    // until nextFrame resolves, then it resumes after the swap.
    glXSwapBuffers() {
      const state = instance.exports.l8_async_state;
      if (state.value === 2n) {
        state.value = 0n;
        return 0n;
      }
      if (resumed) work += performance.now() - resumed;
      state.value = 1n;
      return 0n;
    },
    getenv(name) {
      const value = env[mem.string(name)];
      return value === undefined ? 0n : BigInt(mem.newCounted(new TextEncoder().encode(String(value))));
    },
  };

  // ---- FreeType, rasterized with a 2D canvas ----

  const faces = new Map();
  const glyphCanvas = new OffscreenCanvas(128, 128);
  const g2d = glyphCanvas.getContext("2d", { willReadFrequently: true });
  // FT_FaceRec.glyph is at 152; the FT_GlyphSlot fields the bindings read
  // end with bitmap_top at 196.
  const FT = {
    FT_Init_FreeType(out) {
      view().setBigInt64(n(out), BigInt(zeroed(16)), true);
      return 0n;
    },
    FT_New_Face(_lib, path, _index, out) {
      const face = zeroed(160);
      const slot = zeroed(256);
      view().setBigInt64(face + 152, BigInt(slot), true);
      const mono = /mono/i.test(mem.string(path));
      faces.set(face, { slot, px: 16, family: mono ? '"DejaVu Sans Mono", monospace' : '"DejaVu Sans", sans-serif' });
      view().setBigInt64(n(out), BigInt(face), true);
      return 0n;
    },
    FT_Set_Pixel_Sizes(face, w, h) {
      faces.get(n(face)).px = n(h) || n(w);
      return 0n;
    },
    FT_Get_Char_Index: (_face, code) => (code > 0n ? code : 0n),
    FT_Load_Char(face, code) {
      const f = faces.get(n(face));
      const ch = String.fromCodePoint(n(code));
      g2d.font = `${f.px}px ${f.family}`;
      const m = g2d.measureText(ch);
      const left = Math.floor(-m.actualBoundingBoxLeft);
      const top = Math.ceil(m.actualBoundingBoxAscent);
      const width = Math.max(0, Math.ceil(m.actualBoundingBoxRight) - left);
      const rows = Math.max(0, top + Math.ceil(m.actualBoundingBoxDescent));
      let buffer = 0;
      if (width > 0 && rows > 0) {
        g2d.clearRect(0, 0, 128, 128);
        g2d.fillStyle = "#fff";
        g2d.textBaseline = "alphabetic";
        g2d.fillText(ch, 4 - left, 4 + top);
        const rgba = g2d.getImageData(4, 4, width, rows).data;
        buffer = mem.alloc(width * rows);
        const out = bytes();
        for (let i = 0; i < width * rows; i++) out[buffer + i] = rgba[4 * i + 3];
      }
      const v = view();
      const s = f.slot;
      v.setBigInt64(s + 128, BigInt(Math.round(m.width * 64)), true);
      v.setBigInt64(s + 136, 0n, true);
      v.setUint32(s + 152, rows, true);
      v.setUint32(s + 156, width, true);
      v.setInt32(s + 160, width, true);
      v.setBigInt64(s + 168, BigInt(buffer), true);
      v.setInt32(s + 192, left, true);
      v.setInt32(s + 196, top, true);
      return 0n;
    },
    FT_Done_Face: () => 0n,
    FT_Done_FreeType: () => 0n,
  };

  return {
    imports: { ...GL, ...X, ...FT },
    attach(i, m) {
      instance = i;
      mem = m;
    },
    // Inject a key event, as from on-screen controls: type 2 presses, 3 releases.
    key(type, sym, text = "") {
      pushKey(type, sym, text);
    },
    keyPresses: () => presses,
    frameView: () => frameView,
    nextFrame: () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          frames++;
          resumed = performance.now();
          resolve();
        })
      ),
    // The GPU and the features the game depends on.
    glInfo() {
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
        vendor: gl.getParameter(debug ? debug.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        floatTargets,
        floatBlend,
      };
    },
    canvasSize: () => [canvas.width, canvas.height],
    windowSize: () => [...windowSize],
    setSkip(names) {
      skip = new Set(names);
    },
    // Totals since the start: GL time and calls by function (with timing).
    glTiming: () => ({ ms: { ...glMs }, calls: { ...glCalls }, phases: { ...phaseMs } }),
    // The running per-part totals themselves, for per-frame differences.
    phaseTotals: () => phaseMs,
    frames: () => frames,
    // The fraction of the window's size the canvas renders at.
    scale: () => scale,
    setScale(k) {
      if (k === scale) return;
      scale = k;
      resize();
    },
    callCounts: () => ({ calls: { ...calls }, repeats: { ...repeats }, ms: { ...callMs }, sites: { ...drawSites }, vertices: { ...vertexCounts }, uploads: { ...uploads } }),
    workMs: () => work,
    // The module's heap top, to watch for growth.
    heapBytes: () => Number(instance.exports.l8_heap.value),
  };
}
