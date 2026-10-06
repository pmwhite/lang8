// Browser implementations of the X11, GLX, OpenGL, and FreeType functions the
// block game imports, on a WebGL2 canvas. Pointers and integers arrive as
// BigInt; see ../l8-runtime.js for the module conventions.
//
// glXSwapBuffers suspends the module until the next animation frame through
// JS Promise Integration, so the game's own event loop drives the page.

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

export function createPlatform(canvas, { log = console.log, checkErrors = false } = {}) {
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
  const keyEvent = (type) => (e) => {
    if (e.ctrlKey || e.metaKey) return;
    if (e.code !== "F5" && e.code !== "F11" && e.code !== "F12") e.preventDefault();
    const text = e.key.length === 1 ? e.key : TEXT_KEYS[e.code] ?? "";
    events.push({ type, keysym: keysym(e), text });
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
  const uniforms = [null];
  const programUniforms = new Map();
  let unpackAlignment = 4;
  let boundFramebuffer = null;

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
      gl.linkProgram(obj(p));
      if (!gl.getProgramParameter(obj(p), gl.LINK_STATUS)) log(`link: ${gl.getProgramInfoLog(obj(p))}`);
      return 0n;
    },
    glGetProgramiv(p, pname, out) {
      const value = gl.getProgramParameter(obj(p), n(pname));
      view().setInt32(n(out), typeof value === "boolean" ? Number(value) : value ?? 0, true);
      return 0n;
    },
    glUseProgram: (p) => (gl.useProgram(obj(p)), 0n),
    glGetUniformLocation(p, nameStr) {
      const key = `${n(p)}:${mem.string(nameStr)}`;
      if (!programUniforms.has(key)) {
        const loc = gl.getUniformLocation(obj(p), mem.string(nameStr));
        programUniforms.set(key, loc ? (uniforms.push(loc), uniforms.length - 1) : -1);
      }
      return BigInt(programUniforms.get(key));
    },
    glUniform1i: (l, v) => (l >= 0n && gl.uniform1i(uniforms[n(l)], i32(v)), 0n),
    glUniform1f: (l, x) => (l >= 0n && gl.uniform1f(uniforms[n(l)], x), 0n),
    glUniform2f: (l, x, y) => (l >= 0n && gl.uniform2f(uniforms[n(l)], x, y), 0n),
    glUniform3f: (l, x, y, z) => (l >= 0n && gl.uniform3f(uniforms[n(l)], x, y, z), 0n),
    glUniform4f: (l, x, y, z, w) => (l >= 0n && gl.uniform4f(uniforms[n(l)], x, y, z, w), 0n),
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
    glViewport: (x, y, w, h) => (gl.viewport(n(x), n(y), n(w), n(h)), 0n),
    glScissor: (x, y, w, h) => (gl.scissor(n(x), n(y), n(w), n(h)), 0n),
    glClearColor: (r, g, b, a) => (gl.clearColor(r, g, b, a), 0n),
    glClear: (mask) => (gl.clear(n(mask)), 0n),
    glDrawArrays: (mode, first, count) => (gl.drawArrays(n(mode), n(first), n(count)), 0n),
    glDrawArraysInstanced: (mode, first, count, k) => (gl.drawArraysInstanced(n(mode), n(first), n(count), n(k)), 0n),
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
      gl.bindFramebuffer(n(target), boundFramebuffer);
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
    XCreateWindow(_d, _p, _x, _y, w, h) {
      canvas.width = n(w);
      canvas.height = n(h);
      return 2n;
    },
    XCreateSimpleWindow(_d, _p, _x, _y, w, h) {
      canvas.width = n(w);
      canvas.height = n(h);
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
    glXSwapBuffers: new WebAssembly.Suspending(() => {
      const now = performance.now();
      if (resumed) work += now - resumed;
      return new Promise((resolve) =>
        requestAnimationFrame(() => {
          frames++;
          resumed = performance.now();
          resolve(0n);
        })
      );
    }),
    getenv: () => 0n,
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
    frames: () => frames,
    workMs: () => work,
  };
}
