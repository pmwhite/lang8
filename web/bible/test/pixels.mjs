// Helpers shared by the driver and its flows: waiting, and comparing
// screenshots pixel by pixel.
import zlib from "node:zlib";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A PNG's pixels (8-bit RGB or RGBA, not interlaced, as Chrome writes).
export function decodePNG(buf) {
  let p = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat = [];
  while (p < buf.length) {
    const n = buf.readUInt32BE(p);
    const kind = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + n);
    if (kind === "IHDR") {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      type = data[9];
    } else if (kind === "IDAT") idat.push(data);
    p += 12 + n;
  }
  const bpp = type === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(w * h * 4);
  const stride = w * bpp;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 3; k++) px[(y * w + x) * 4 + k] = line[x * bpp + k];
      px[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px };
}

// How many pixels differ between two pictures in rows y0 to y1 (device px).
export function differ(a, b, y0, y1 = Infinity) {
  const A = decodePNG(a);
  const B = decodePNG(b);
  if (A.w !== B.w || A.h !== B.h) return Infinity;
  let n = 0;
  for (let y = Math.max(0, y0); y < Math.min(A.h, y1); y++)
    for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * 4;
      if (A.px[i] !== B.px[i] || A.px[i + 1] !== B.px[i + 1] || A.px[i + 2] !== B.px[i + 2]) n++;
    }
  return n;
}

