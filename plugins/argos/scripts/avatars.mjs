// Argos avatars: each author's GitHub picture redrawn as a 16×16 vector mosaic, since the pane's
// Svg drops embedded images. PNG is decoded here with zlib, JPEG (most people's photos) with the
// vendored jpeg-js decoder; anything else gets the pane's letter. Mosaics are cached by picture URL.
//
// Usage: node avatars.mjs --self-test
import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import decodeJpegData from "./vendor/jpeg-decoder.cjs";
import { isMain } from "./is-main.mjs";

const N = 16;

// A PNG's pixels as RGBA: 8 or 16 bits, not interlaced (what GitHub's resizer writes); else null.
export function decodePng(buf) {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  for (let i = 8; i + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(i);
    const name = buf.toString("latin1", i + 4, i + 8);
    const data = buf.subarray(i + 8, i + 8 + len);
    if (name === "IHDR") [w, h, depth, type, interlace] = [data.readUInt32BE(0), data.readUInt32BE(4), data[8], data[9], data[12]];
    else if (name === "PLTE") palette = data;
    else if (name === "tRNS") trns = data;
    else if (name === "IDAT") idat.push(data);
    else if (name === "IEND") break;
    i += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (![8, 16].includes(depth) || (depth === 16 && type === 3) || interlace || !channels || !w || !h) return null;
  // bytes a pixel takes: 16-bit samples read their high byte
  const bpp = channels * (depth / 8);
  const at = (i) => px[i * (depth / 8)];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0;
      const b = y ? px[(y - 1) * stride + x] : 0;
      const c = y && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter] ?? 0;
      px[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  const rgba = (x, y) => {
    const o = y * w * channels + x * channels;
    if (type === 6) return [at(o), at(o + 1), at(o + 2), at(o + 3)];
    if (type === 2) return [at(o), at(o + 1), at(o + 2), 255];
    if (type === 4) return [at(o), at(o), at(o), at(o + 1)];
    if (type === 0) return [at(o), at(o), at(o), 255];
    const k = at(o);
    return [palette?.[k * 3] ?? 0, palette?.[k * 3 + 1] ?? 0, palette?.[k * 3 + 2] ?? 0, trns?.[k] ?? 255];
  };
  return { w, h, rgba };
}

// A JPEG's pixels as RGBA, or null; capped small, since an avatar is asked for at 16px.
export function decodeJpeg(buf) {
  if (buf.length < 3 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  try {
    const { width: w, height: h, data } = decodeJpegData(buf, { maxResolutionInMP: 4, maxMemoryUsageInMB: 64 });
    return { w, h, rgba: (x, y) => [...data.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)] };
  } catch {
    return null;
  }
}

// The picture as N×N cells (box-averaged), one path per colour (4 bits a channel, #rgb), runs
// merged per row; cut to a circle for a person, a rounded square for a machine.
export function mosaic(img, shape = "circle") {
  const hex = (v) => Math.min(15, Math.round(v / 17)).toString(16);
  const c = (N - 1) / 2;
  const r = 3;
  const inside = (x, y) =>
    shape === "circle"
      ? (x - c) ** 2 + (y - c) ** 2 <= (N / 2) ** 2
      : Math.max(r - x, x - (N - 1 - r), 0) ** 2 + Math.max(r - y, y - (N - 1 - r), 0) ** 2 <= r * r;
  const cell = (cx, cy) => {
    const [x0, x1] = [Math.floor((cx * img.w) / N), Math.max(Math.floor(((cx + 1) * img.w) / N), Math.floor((cx * img.w) / N) + 1)];
    const [y0, y1] = [Math.floor((cy * img.h) / N), Math.max(Math.floor(((cy + 1) * img.h) / N), Math.floor((cy * img.h) / N) + 1)];
    const sum = [0, 0, 0, 0];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.rgba(x, y).forEach((v, i) => (sum[i] += v));
    const n = (x1 - x0) * (y1 - y0);
    // transparent cells take the dark ground, as GitHub draws them on a dark page
    const a = sum[3] / n / 255;
    return a < 0.5 ? null : `#${hex(sum[0] / n)}${hex(sum[1] / n)}${hex(sum[2] / n)}`;
  };
  const paths = new Map();
  for (let y = 0; y < N; y++) {
    let run = null;
    const flush = (end) => {
      if (run) paths.set(run.col, (paths.get(run.col) ?? "") + `M${run.x} ${y}h${end - run.x}v1H${run.x}z`);
      run = null;
    };
    for (let x = 0; x < N; x++) {
      const col = inside(x, y) ? cell(x, y) : null;
      if (run && col === run.col) continue;
      flush(x);
      if (col) run = { col, x };
    }
    flush(N);
  }
  return [...paths].map(([col, d]) => `<path fill="${col}" d="${d}"/>`).join("");
}

// Mosaics for every author with a picture: { login: paths }, fetched only when the URL changed.
export async function avatars(authors, cacheFile) {
  let cache = {};
  try {
    cache = JSON.parse(readFileSync(cacheFile, "utf8"));
  } catch {}
  const out = {};
  await Promise.all(
    authors.map(async ({ login, url, isMachine }) => {
      if (!url) return;
      const key = `${url}|${isMachine ? "square" : "circle"}`;
      if (!(key in cache)) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
          const buf = res.ok ? Buffer.from(await res.arrayBuffer()) : null;
          const img = buf && (decodePng(buf) ?? decodeJpeg(buf));
          cache[key] = img ? mosaic(img, isMachine ? "square" : "circle") : "";
        } catch {
          return; // offline: try again next round
        }
      }
      if (cache[key]) out[login] = cache[key];
    }),
  );
  writeFileSync(cacheFile, JSON.stringify(cache));
  return out;
}

// a 1×1 grey (128) baseline JPEG, written by Pillow
const GREY_JPEG =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/ACv/2Q==";

function selfTest() {
  // a 2×2 RGBA PNG: red, green / blue, transparent
  const chunk = (name, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(name, 4, "latin1");
    data.copy(b, 8);
    return b;
  };
  const ihdr = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
  // row 1 unfiltered, row 2 with the Up filter (each byte minus the one above)
  const rows = Buffer.from([0, 255, 0, 0, 255, 0, 255, 0, 255, 2, 1, 0, 255, 0, 0, 1, 0, 1]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
  const img = decodePng(png);
  assert.deepEqual([img.w, img.h, img.rgba(0, 0), img.rgba(1, 0), img.rgba(0, 1), img.rgba(1, 1)[3]], [2, 2, [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], 0]);
  const svg = mosaic(img, "square");
  assert.match(svg, /fill="#f00"/);
  assert.match(svg, /fill="#00f"/);
  assert.doesNotMatch(svg, /M15 15/); // the rounded corner and the transparent cell stay empty
  assert.equal(decodePng(Buffer.from([0xff, 0xd8, 0xff])), null); // a JPEG is not a PNG
  assert.equal(decodeJpeg(Buffer.from([0xff, 0xd8, 0xff])), null); // a broken JPEG: no mosaic
  const jpg = decodeJpeg(Buffer.from(GREY_JPEG, "base64"));
  assert.deepEqual([jpg.w, jpg.h], [1, 1]);
  assert.ok(Math.abs(jpg.rgba(0, 0)[0] - 128) < 4 && jpg.rgba(0, 0)[3] === 255);
  console.log("self-test ok");
}

if (isMain(import.meta.url) && process.argv.includes("--self-test")) selfTest();
