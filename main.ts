// news-image-20261121 v8 — fresh procedural front page, Node 22 stdlib only.
// 1024x1024, software rasterizer (2x supersampled) + stroke vector font + PNG encoder.
// No network, no Date, no randomness: two runs are byte-identical.
//
// FACTS (verified live in v1-v7, unchanged):
// LEAD: COP31 Antalya overtime Sat 21 Nov — Friday deadline missed, draft drops
//   fossil-fuel mentions + $120bn/yr adaptation, ~200 nations, new draft due Saturday.
// SECONDARY: Russian Kh-101 missile down in Poland (Nowy Lipowiec, NATO "grave
//   violation", no one hurt); Kyiv barrage (84 missiles + 404 drones, 3 Dnipro bridges
//   damaged, power/heat/water cut); US AI sell-off (S&P -3.7% into correction,
//   Nasdaq -5.3%, Nvidia -14%).
// IN BRIEF: Cyclone Akvan (370,000 fled Odisha, no deaths); World Court action after
//   Myanmar ruling; France seeks UNSC meeting on Kyiv; Estonia shuts Russia border
//   from 1 Dec.
//
// v8 FIXES vs v7: (a) wall clock moved to the FAR LEFT of the hall wall, OVERTIME badge
//   alone at top right, globe far below on the side table — "OVERTIME" fully visible
//   at 480 with clear space; (b) Poland thumbnail redrawn concrete: field + pine
//   trees + farmhouse + Polish flag + a recognisable cruise missile nose-down in a
//   crater; (c) Kyiv smoke rebuilt as wide soft billowing columns of overlapping
//   round puffs, no pointed tips.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

const W = 1024, H = 1024, SS = 2, W2 = W * SS, H2 = H * SS;
const buf = new Uint8Array(W2 * H2 * 4);

// ---------- colour ----------
function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const PAPER = rgb("#f6f1e4");
const INK = rgb("#1b1813");
const RED = rgb("#b3271e");
const BLUE = rgb("#1f4e79");
const GOLD = rgb("#c9a227");
const CREAM = rgb("#eadfc6");
const WOOD = rgb("#6e4a26");
const WOODL = rgb("#8a5f36");

// ---------- low-level pixels (SS coords) ----------
function setPx(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W2 || y >= H2) return;
  const i = (y * W2 + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
}
function fillRect(x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  const x0 = Math.max(0, Math.round(x * SS)), y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(W2, Math.round((x + w) * SS)), y1 = Math.min(H2, Math.round((y + h) * SS));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
}
function stamp(cx: number, cy: number, r: number, c: [number, number, number]): void {
  const rr = r * r;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W2 - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H2 - 1, Math.ceil(cy + r));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dx = xx - cx, dy = yy - cy;
    if (dx * dx + dy * dy <= rr) setPx(xx, yy, c);
  }
}
function circle(cx: number, cy: number, r: number, c: [number, number, number]): void {
  stamp(cx * SS, cy * SS, r * SS, c);
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: [number, number, number]): void {
  const x0 = Math.max(0, Math.floor((cx - rx) * SS)), x1 = Math.min(W2 - 1, Math.ceil((cx + rx) * SS));
  const y0 = Math.max(0, Math.floor((cy - ry) * SS)), y1 = Math.min(H2 - 1, Math.ceil((cy + ry) * SS));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const dx = (xx / SS - cx) / rx, dy = (yy / SS - cy) / ry;
    if (dx * dx + dy * dy <= 1) setPx(xx, yy, c);
  }
}
function line(x0: number, y0: number, x1: number, y1: number, w: number, c: [number, number, number]): void {
  const dx = (x1 - x0) * SS, dy = (y1 - y0) * SS;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len));
  const r = Math.max(0.6, (w * SS) / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    stamp(x0 * SS + dx * t, y0 * SS + dy * t, r, c);
  }
}
function polyline(pts: number[], w: number, c: [number, number, number], closed = false): void {
  const n = pts.length / 2;
  for (let i = 0; i < n - 1; i++) line(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], w, c);
  if (closed && n > 2) line(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], pts[0], pts[1], w, c);
}
function polyFill(pts: number[], c: [number, number, number]): void {
  const P: number[][] = [];
  for (let i = 0; i < pts.length; i += 2) P.push([pts[i] * SS, pts[i + 1] * SS]);
  let minY = Infinity, maxY = -Infinity;
  for (const p of P) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const n = P.length;
  for (let y = Math.max(0, Math.floor(minY)); y <= Math.min(H2 - 1, Math.ceil(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(W2 - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c);
    }
  }
}
function roundRect(x: number, y: number, w: number, h: number, r: number, c: [number, number, number]): void {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillRect(x, y + r, w, h - 2 * r, c);
  circle(x + r, y + r, r, c); circle(x + w - r, y + r, r, c);
  circle(x + r, y + h - r, r, c); circle(x + w - r, y + h - r, r, c);
}
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, step = 0.12): number[] {
  const pts: number[] = [];
  for (let a = a0; a <= a1 + 1e-6; a += step) pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  return pts;
}

// ---------- stroke vector font (grid 0..8 x 0..12) ----------
type Glyph = { w: number; s: number[][]; dot?: boolean };
const G: Record<string, Glyph> = {
  "A": { w: 9, s: [[0, 12, 4, 0, 8, 12], [2.2, 8, 5.8, 8]] },
  "B": { w: 9, s: [[1, 0, 6, 0, 8, 2, 8, 4.5, 6, 6, 1, 6], [6, 6, 8, 7.5, 8, 10, 6, 12, 1, 12, 1, 0]] },
  "C": { w: 9, s: [[8, 2, 6, 0, 2, 0, 0, 2, 0, 10, 2, 12, 6, 12, 8, 10]] },
  "D": { w: 9, s: [[1, 0, 5, 0, 8, 3, 8, 9, 5, 12, 1, 12, 1, 0]] },
  "E": { w: 9, s: [[8, 0, 1, 0, 1, 12, 8, 12], [1, 6, 6, 6]] },
  "F": { w: 9, s: [[8, 0, 1, 0, 1, 12], [1, 6, 6, 6]] },
  "G": { w: 9, s: [[8, 2, 6, 0, 2, 0, 0, 2, 0, 10, 2, 12, 6, 12, 8, 10, 8, 6, 4.5, 6]] },
  "H": { w: 9, s: [[1, 0, 1, 12], [7, 0, 7, 12], [1, 6, 7, 6]] },
  "I": { w: 5, s: [[2.5, 0, 2.5, 12], [0.5, 0, 4.5, 0], [0.5, 12, 4.5, 12]] },
  "J": { w: 8, s: [[6, 0, 6, 10, 4.5, 12, 2, 12, 0.8, 10.5], [3, 0, 6, 0]] },
  "K": { w: 9, s: [[1, 0, 1, 12], [7.5, 0, 1, 6, 7.5, 12]] },
  "L": { w: 8, s: [[1, 0, 1, 12, 7, 12]] },
  "M": { w: 10, s: [[1, 12, 1, 0, 5, 7, 9, 0, 9, 12]] },
  "N": { w: 9, s: [[1, 12, 1, 0, 7, 12, 7, 0]] },
  "O": { w: 9, s: [[2, 0, 6, 0, 8, 2, 8, 10, 6, 12, 2, 12, 0, 10, 0, 2, 2, 0]] },
  "P": { w: 9, s: [[1, 12, 1, 0, 6, 0, 8, 2, 8, 5, 6, 6, 1, 6]] },
  "Q": { w: 9, s: [[2, 0, 6, 0, 8, 2, 8, 10, 6, 12, 2, 12, 0, 10, 0, 2, 2, 0], [5, 8, 8, 12]] },
  "R": { w: 9, s: [[1, 12, 1, 0, 6, 0, 8, 2, 8, 5, 6, 6, 1, 6], [5, 6, 8, 12]] },
  "S": { w: 9, s: [[8, 1.5, 6, 0, 2, 0, 0, 2, 0, 5, 2.5, 6, 6, 6, 8, 7.5, 8, 10, 6, 12, 2, 12, 0, 10.5]] },
  "T": { w: 9, s: [[0.5, 0, 7.5, 0], [4, 0, 4, 12]] },
  "U": { w: 9, s: [[1, 0, 1, 10, 2, 12, 6, 12, 7, 10, 7, 0]] },
  "V": { w: 9, s: [[1, 0, 4, 12, 7, 0]] },
  "W": { w: 11, s: [[1, 0, 2.5, 12, 5.5, 6, 8.5, 12, 10, 0]] },
  "X": { w: 9, s: [[1, 0, 7, 12], [7, 0, 1, 12]] },
  "Y": { w: 9, s: [[1, 0, 4, 6, 7, 0], [4, 6, 4, 12]] },
  "Z": { w: 9, s: [[1, 0, 7, 0, 1, 12, 7, 12]] },
  "0": { w: 9, s: [[2, 0, 6, 0, 8, 2, 8, 10, 6, 12, 2, 12, 0, 10, 0, 2, 2, 0]] },
  "1": { w: 6, s: [[2, 2.5, 4, 0, 4, 12], [1, 12, 6.5, 12]] },
  "2": { w: 9, s: [[1, 2, 3, 0, 6, 0, 8, 2, 8, 5, 1, 12, 8, 12]] },
  "3": { w: 9, s: [[1.5, 1, 4, 0, 6.5, 1, 8, 3, 8, 5, 5, 6], [5, 6, 8, 7, 8, 10, 6, 12, 2, 12, 0.5, 11]] },
  "4": { w: 9, s: [[6, 0, 6, 12], [1, 8, 7, 8], [6, 0, 0.5, 8]] },
  "5": { w: 9, s: [[8, 0, 1, 0, 1, 6, 6, 6, 8, 8, 8, 10, 6, 12, 1, 12]] },
  "6": { w: 9, s: [[8, 0.5, 4, 0, 1, 3, 1, 9, 2, 12, 6, 12, 8, 10, 8, 7, 6, 5, 2, 5]] },
  "7": { w: 9, s: [[1, 0, 7, 0, 3.5, 12]] },
  "8": { w: 9, s: [[3, 0, 6, 0, 8, 2, 8, 5, 6, 6, 2, 6, 0, 5, 0, 2, 2, 0], [6, 6, 8, 8, 8, 10, 6, 12, 2, 12, 0, 10, 0, 8, 2, 6]] },
  "9": { w: 9, s: [[2, 12, 6, 12, 8, 10, 8, 3, 6, 0, 2, 0, 0, 2, 0, 5, 2, 6, 6, 6]] },
  " ": { w: 4, s: [] },
  ".": { w: 4, s: [[2, 10.8, 2, 12]] },
  ",": { w: 4, s: [[2, 10, 2, 11.5, 1, 12.6]] },
  ":": { w: 4, s: [[2, 3.5, 2, 5], [2, 10, 2, 11.5]] },
  ";": { w: 4, s: [[2, 3.5, 2, 5], [2, 10, 2, 11.5, 1, 12.6]] },
  "-": { w: 8, s: [[1, 6, 7, 6]] },
  "–": { w: 9, s: [[0.5, 6, 7.5, 6]] },
  "—": { w: 11, s: [[0, 6, 8, 6]] },
  "−": { w: 8, s: [[1, 6, 7, 6]] },
  "'": { w: 4, s: [[2, 0, 1.5, 3]] },
  '"': { w: 7, s: [[1.5, 0, 1, 3], [5.5, 0, 5, 3]] },
  "!": { w: 4, s: [[2, 0, 2, 8], [2, 10.5, 2, 12]] },
  "?": { w: 9, s: [[2, 1.5, 4, 0, 6.5, 0.5, 7.5, 2.5, 7.5, 4, 5.5, 6, 4, 7, 4, 9], [4, 10.8, 4, 12]] },
  "$": { w: 9, s: [[7.5, 1.5, 5.5, 0, 2.5, 0, 0.8, 1.8, 0.8, 4.5, 2.5, 6, 5.5, 6, 7.2, 7.5, 7.2, 10, 5.5, 12, 2.5, 12, 0.8, 10.5], [4, -0.5, 4, 12.5]] },
  "%": { w: 11, s: [[0.8, 1.4, 1.4, 0.8, 3, 0.8, 3.6, 1.4, 3.6, 3, 3, 3.6, 1.4, 3.6, 0.8, 3, 0.8, 1.4], [7.4, 8.4, 8, 7.8, 9.6, 7.8, 10.2, 8.4, 10.2, 10, 9.6, 10.6, 8, 10.6, 7.4, 10, 7.4, 8.4], [10, 0.5, 1, 11.5]] },
  "&": { w: 10, s: [[5, 0.5, 2.5, 0.5, 1, 2, 1, 4.5, 2.5, 6, 5.5, 6, 7, 4.5, 7, 2, 5, 0.5], [6.8, 0.8, 2, 10.5, 3.2, 12, 6.5, 12, 7.8, 10.5]] },
  "(": { w: 5, s: [[4, 0, 2, 2, 1, 6, 2, 10, 4, 12]] },
  ")": { w: 5, s: [[1, 0, 3, 2, 4, 6, 3, 10, 1, 12]] },
  "/": { w: 7, s: [[6, 0, 1, 12]] },
  "+": { w: 9, s: [[4, 2, 4, 10], [1, 6, 7, 6]] },
  "=": { w: 8, s: [[1, 4, 7, 4], [1, 8, 7, 8]] },
  "•": { w: 6, s: [], dot: true },
};
function glyph(ch: string): Glyph {
  if (G[ch]) return G[ch];
  if (ch === "’" || ch === "‘") return G["'"];
  if (ch === "“" || ch === "”") return G['"'];
  return { w: 9, s: [] };
}
function textWidth(str: string, size: number, track = 0): number {
  const s = size / 12;
  let w = 0;
  for (const ch of str) w += glyph(ch).w * s + track;
  return w - (str.length ? track : 0);
}
function drawText(str: string, x: number, y: number, size: number, c: [number, number, number], o: { weight?: number; track?: number; align?: string } = {}): number {
  const weight = o.weight || 1, track = o.track || 0;
  const w = textWidth(str, size, track);
  let pen = x;
  if (o.align === "center") pen = x - w / 2;
  else if (o.align === "right") pen = x - w;
  const s = size / 12;
  const lw = Math.max(0.9, size * 0.13 * weight);
  for (const ch of str) {
    const g = glyph(ch);
    if (g.dot) circle(pen + 3 * s, y + 6 * s, Math.max(1.1, size * 0.085), c);
    else for (const st of g.s) {
      const pts: number[] = [];
      for (let i = 0; i < st.length; i += 2) pts.push(pen + st[i] * s, y + st[i + 1] * s);
      polyline(pts, lw, c);
    }
    pen += g.w * s + track;
  }
  return w;
}
function wrap(str: string, maxW: number, size: number, track = 0): string[] {
  const words = str.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const test = cur ? cur + " " + wd : wd;
    if (textWidth(test, size, track) <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- PNG ----------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  // downsample 2x2 box average
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = ((y * 2 + dy) * W2 + (x * 2 + dx)) * 4;
        r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; a += buf[i + 3];
      }
      const o = y * (1 + W * 4) + 1 + x * 4;
      raw[o] = Math.round(r / 4); raw[o + 1] = Math.round(g / 4); raw[o + 2] = Math.round(b / 4); raw[o + 3] = Math.round(a / 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 6 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- scene helpers ----------
function archWindow(x0: number, x1: number, yTop: number, yBot: number, sun: boolean): void {
  const r = (x1 - x0) / 2, cx = (x0 + x1) / 2, cy = yTop + r;
  const cols = ["#d95d2e", "#e5723a", "#e8854a", "#ec9a5e", "#f0ab70", "#f4bc82", "#eec27f", "#f2cf8f", "#f6dc9f", "#f9e6ae", "#fbeec0", "#fdf3cf"];
  const n = cols.length;
  for (let i = 0; i < n; i++) {
    const ya = yTop + ((yBot - yTop) * i) / n, yb = yTop + ((yBot - yTop) * (i + 1)) / n;
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
      let hw: number;
      if (y < cy) { const dy = cy - y; hw = Math.sqrt(Math.max(0, r * r - dy * dy)); } else hw = r;
      fillRect(cx - hw, y, hw * 2, 1, rgb(cols[i]));
    }
  }
  if (sun) {
    circle(cx, 215, 38, rgb("#ffd970"));
    circle(cx, 215, 30, rgb("#ffcf3d"));
    circle(cx, 215, 24, rgb("#ffe27a"));
  }
  // frame: arch outline + sides + sill + mullions (kept clear of the sun)
  const frame = rgb("#4a3220");
  polyline(arcPts(cx, cy, r, Math.PI, 2 * Math.PI), 3, frame);
  line(x0, cy, x0, yBot, 3, frame);
  line(x1, cy, x1, yBot, 3, frame);
  fillRect(x0 - 4, yBot, (x1 - x0) + 8, 6, frame);
  line(cx - 45, yTop + 40, cx - 45, yBot, 2, frame);
  line(cx + 45, yTop + 40, cx + 45, yBot, 2, frame);
  line(x0, 252, x1, 252, 2, frame);
}

function drawDelegate(cx: number, hy: number, skin: string, hair: string, suit: string, style: string): void {
  const SK = rgb(skin), HR = rgb(hair), SU = rgb(suit);
  const DARK = rgb("#241d16");
  // long back hair first
  if (style === "long") {
    polyFill([cx - 16, hy - 8, cx - 14, hy - 18, cx, hy - 21, cx + 14, hy - 18, cx + 16, hy - 8, cx + 19, hy + 34, cx + 10, hy + 34, cx + 12, hy + 4, cx - 12, hy + 4, cx - 10, hy + 34, cx - 19, hy + 34], HR);
  }
  // shoulders, shirt, tie
  polyFill([cx - 36, hy + 54, cx - 27, hy + 18, cx + 27, hy + 18, cx + 36, hy + 54], SU);
  polyFill([cx - 9, hy + 18, cx + 9, hy + 18, cx, hy + 42], rgb("#f2ede0"));
  polyFill([cx - 3.5, hy + 22, cx + 3.5, hy + 22, cx + 4.5, hy + 44, cx, hy + 50, cx - 4.5, hy + 44], RED);
  // neck + head + ears
  fillRect(cx - 6, hy + 8, 12, 12, SK);
  ellipse(cx, hy - 2, 15, 18, SK);
  circle(cx - 15, hy, 3, SK); circle(cx + 15, hy, 3, SK);
  // hair cap / styles
  if (style === "sweep") {
    polyFill([cx - 15, hy - 4, cx - 15, hy - 12, cx - 8, hy - 19, cx + 2, hy - 21, cx + 12, hy - 17, cx + 15, hy - 6, cx + 13, hy - 12, cx + 6, hy - 17, cx - 2, hy - 18, cx - 10, hy - 15, cx - 13, hy - 8], HR);
    polyline([cx - 10, hy - 16, cx - 4, hy - 11, cx + 2, hy - 16], 1.6, rgb("#5a4632"));
    polyline([cx - 6, hy - 13, cx - 6, hy - 8], 1.4, rgb("#5a4632"));
    polyline([cx - 2, hy - 14, cx - 2, hy - 9], 1.4, rgb("#5a4632"));
  } else if (style === "curls") {
    const pts = arcPts(cx, hy - 2, 16, Math.PI * 1.08, Math.PI * 1.92, 0.28);
    for (let i = 0; i < pts.length; i += 2) circle(pts[i], pts[i + 1], 4.2, HR);
    circle(cx - 13, hy - 8, 4, HR); circle(cx + 13, hy - 8, 4, HR);
  } else if (style === "fringe") {
    polyFill([cx - 15, hy - 6, cx - 15, hy - 14, cx - 8, hy - 18, cx + 8, hy - 18, cx + 15, hy - 14, cx + 15, hy - 6, cx + 10, hy - 10, cx + 4, hy - 12, cx - 4, hy - 12, cx - 10, hy - 10], HR);
  } else if (style === "long") {
    polyFill([cx - 15, hy - 4, cx - 15, hy - 12, cx - 8, hy - 19, cx + 2, hy - 21, cx + 12, hy - 17, cx + 15, hy - 6, cx + 13, hy - 12, cx + 6, hy - 17, cx - 2, hy - 18, cx - 10, hy - 15, cx - 13, hy - 8], HR);
    polyline([cx - 14, hy - 2, cx - 15, hy + 22], 2.5, HR);
    polyline([cx + 14, hy - 2, cx + 15, hy + 22], 2.5, HR);
  } else {
    polyFill([cx - 15, hy - 4, cx - 15, hy - 12, cx - 8, hy - 19, cx + 2, hy - 21, cx + 12, hy - 17, cx + 15, hy - 6, cx + 13, hy - 12, cx + 6, hy - 17, cx - 2, hy - 18, cx - 10, hy - 15, cx - 13, hy - 8], HR);
  }
  // face: white eyes + dark pupils + highlights, brows, L nose, mouth
  ellipse(cx - 6, hy - 4, 3, 2.2, rgb("#ffffff"));
  ellipse(cx + 6, hy - 4, 3, 2.2, rgb("#ffffff"));
  circle(cx - 6, hy - 4, 1.3, DARK); circle(cx + 6, hy - 4, 1.3, DARK);
  circle(cx - 5.4, hy - 4.7, 0.6, rgb("#ffffff")); circle(cx + 6.6, hy - 4.7, 0.6, rgb("#ffffff"));
  line(cx - 9.5, hy - 9, cx - 2.5, hy - 10, 1.4, DARK);
  line(cx + 2.5, hy - 10, cx + 9.5, hy - 9, 1.4, DARK);
  polyline([cx, hy - 2, cx, hy + 4, cx + 2.5, hy + 4], 1.3, DARK);
  polyline([cx - 3.5, hy + 9, cx, hy + 10.5, cx + 3.5, hy + 9], 1.4, DARK);
  if (style === "fringe") {
    circle(cx - 6, hy - 4, 5.5, DARK); circle(cx + 6, hy - 4, 5.5, DARK);
    circle(cx - 6, hy - 4, 4.4, SK); circle(cx + 6, hy - 4, 4.4, SK);
    ellipse(cx - 6, hy - 4, 3, 2.2, rgb("#ffffff"));
    ellipse(cx + 6, hy - 4, 3, 2.2, rgb("#ffffff"));
    circle(cx - 6, hy - 4, 1.3, DARK); circle(cx + 6, hy - 4, 1.3, DARK);
    line(cx - 11.5, hy - 4, cx - 0.5, hy - 4, 1.2, DARK);
    line(cx - 11.5, hy - 4, cx - 15, hy - 6, 1.2, DARK);
    line(cx + 11.5, hy - 4, cx + 15, hy - 6, 1.2, DARK);
  }
}

// soft smoke: wide billowing column of overlapping round puffs, round wide top
function smokeColumn(bx: number, by: number, puffs: [number, number, number][]): void {
  const outer = rgb("#aab2bb"), mid = rgb("#c3c9cf"), inner = rgb("#dde1e4");
  for (const [dx, dy, r] of puffs) {
    circle(bx + dx, by + dy, r, outer);
    circle(bx + dx + r * 0.12, by + dy - r * 0.1, r * 0.72, mid);
    circle(bx + dx, by + dy - r * 0.18, r * 0.45, inner);
  }
}
function flame(cx: number, by: number, h: number): void {
  polyFill([cx - 5, by, cx - 4, by - h * 0.55, cx, by - h, cx + 4, by - h * 0.55, cx + 5, by], rgb("#e8722a"));
  polyFill([cx - 2.6, by - 1, cx - 2, by - h * 0.5, cx, by - h * 0.72, cx + 2, by - h * 0.5, cx + 2.6, by - 1], rgb("#f2c230"));
}
function pine(cx: number, by: number, h: number): void {
  const g = rgb("#2e5d33"), g2 = rgb("#3a7040"), tr = rgb("#5a3a22");
  fillRect(cx - 2, by - 10, 4, 10, tr);
  polyFill([cx - h * 0.32, by - 8, cx, by - h, cx + h * 0.32, by - 8], g);
  polyFill([cx - h * 0.4, by - 2, cx, by - h * 0.62, cx + h * 0.4, by - 2], g2);
  polyFill([cx - h * 0.46, by, cx, by - h * 0.3, cx + h * 0.46, by], g);
}

// ---------- compose ----------
function draw(): void {
  fillRect(0, 0, W, H, PAPER);

  // ===== masthead =====
  fillRect(24, 12, 976, 2, INK);
  drawText("THE WORLD", 512, 20, 56, INK, { weight: 1.7, track: 1, align: "center" });
  drawText("SATURDAY, 21 NOVEMBER 2026", 24, 88, 14, INK, { weight: 1.3 });
  drawText("— ONE DAY, ONE PAGE —", 512, 88, 14, RED, { weight: 1.2, align: "center" });
  drawText("IN ONE IMAGE", 1000, 88, 14, INK, { weight: 1.3, align: "right" });
  fillRect(24, 110, 976, 2, INK);

  // ===== lead scene: COP31 hall =====
  const SX = 24, SY = 124, SW = 976, SH = 344;
  fillRect(SX, SY, SW, SH, CREAM);
  fillRect(SX, SY + 288, SW, SH - 288, rgb("#b99a6b"));
  // bunting across the top (stops well short of the OVERTIME badge)
  const buntingCols = ["#b3271e", "#1f4e79", "#2e6b34", "#c9a227"];
  const bpts: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    bpts.push(52 + t * 748, 138 + 14 * Math.sin(t * Math.PI));
  }
  polyline(bpts, 1.6, INK);
  for (let i = 0; i < 14; i++) {
    const t = (i + 0.5) / 14;
    const fx = 52 + t * 748, fy = 138 + 14 * Math.sin(t * Math.PI);
    polyFill([fx - 9, fy + 1, fx + 9, fy + 1, fx, fy + 17], rgb(buntingCols[i % 4]));
  }
  // wall clock — FAR LEFT, nowhere near the OVERTIME badge
  circle(92, 208, 27, rgb("#3a2e22"));
  circle(92, 208, 24, rgb("#fdfaf2"));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    line(92 + 19 * Math.sin(a), 208 - 19 * Math.cos(a), 92 + 22 * Math.sin(a), 208 - 22 * Math.cos(a), 1.6, INK);
  }
  line(92, 208, 92 + 3, 208 - 13, 2.4, INK);      // hour hand, near 12
  line(92, 208, 92 - 17, 208 - 11, 2, INK);       // minute hand, 11:55
  circle(92, 208, 2.4, RED);
  // OVERTIME badge — top RIGHT, alone, clear of clock and globe
  roundRect(826, 132, 164, 30, 6, RED);
  drawText("OVERTIME", 908, 139, 19, rgb("#ffffff"), { weight: 1.5, track: 0.5, align: "center" });
  // arched windows with sunset + whole sun in the middle one
  archWindow(120, 300, 176, 316, false);
  archWindow(420, 600, 176, 316, true);
  archWindow(720, 900, 176, 316, false);
  // delegates behind the table
  drawDelegate(150, 292, "#eab98c", "#2e2118", "#2b3a55", "sweep");
  drawDelegate(320, 292, "#d9a06f", "#8a8a86", "#33302c", "curls");
  drawDelegate(490, 292, "#eec39a", "#1d1712", "#1f4d4a", "fringe");
  drawDelegate(660, 292, "#c98d5f", "#241d16", "#5c2e35", "neat");
  drawDelegate(830, 292, "#e8b98d", "#3a2a1a", "#4a4a48", "long");
  // long table
  polyFill([50, 340, 900, 340, 920, 372, 30, 372], WOODL);
  fillRect(30, 372, 890, 96, WOOD);
  for (let i = 0; i < 9; i++) line(60 + i * 100, 380, 60 + i * 100, 464, 1.2, rgb("#5a3a1e"));
  // DRAFT sheet on the table top, one clean strikethrough
  polyFill([575, 342, 735, 342, 750, 370, 590, 370], rgb("#fdfaf2"));
  drawText("DRAFT", 662, 346, 13, INK, { weight: 1.4, align: "center" });
  line(592, 366, 740, 348, 2, RED);
  line(600, 364, 700, 364, 1, rgb("#8a8a80"));
  // microphones + name plates
  for (const mx of [250, 490, 730]) {
    line(mx, 368, mx, 336, 1.8, INK);
    circle(mx, 333, 4.5, INK);
    circle(mx, 333, 2, rgb("#666666"));
  }
  for (const nx of [150, 320, 490, 660, 830]) {
    fillRect(nx - 24, 384, 48, 13, rgb("#fdfaf2"));
    line(nx - 19, 390, nx + 19, 390, 1, rgb("#8a8a80"));
  }
  // side table + globe, far right and far below the badge
  ellipse(950, 404, 42, 8, rgb("#3a2e22"));
  fillRect(946, 404, 8, 58, rgb("#3a2e22"));
  ellipse(950, 464, 26, 5, rgb("#3a2e22"));
  circle(950, 380, 21, rgb("#2f6fb2"));
  polyFill([934, 372, 942, 384, 940, 366, 934, 362, 940, 372, 950, 372, 958, 380, 966, 372, 962, 364, 956, 372], rgb("#3a8a4c"));
  polyFill([944, 392, 962, 384, 966, 394, 952, 398], rgb("#3a8a4c"));
  line(950, 401, 950, 394, 2, rgb("#c9a227"));
  // scene frame
  polyline([SX, SY, SX + SW, SY, SX + SW, SY + SH, SX, SY + SH, SX, SY], 2, INK);

  // ===== lead headline + body =====
  drawText("COP31 • ANTALYA — CLIMATE SUMMIT", 24, 478, 15, RED, { weight: 1.4, track: 0.5 });
  drawText("CLIMATE TALKS RUN INTO OVERTIME", 24, 498, 42, INK, { weight: 1.6, track: 0.5 });
  const leadBody = wrap("FRIDAY'S DEADLINE PASSED WITH NO DEAL. THE DRAFT DROPS FOSSIL-FUEL PLEDGES AND OFFERS $120BN A YEAR FOR ADAPTATION. NEARLY 200 NATIONS IN ANTALYA AWAIT A NEW TEXT ON SATURDAY.", 976, 16, 0.4);
  leadBody.forEach((ln, i) => drawText(ln, 24, 548 + i * 20, 16, INK, { weight: 1.25, track: 0.4 }));
  fillRect(24, 602, 976, 2, INK);

  // ===== secondary stories =====
  const cols = [
    { x: 24, kick: "POLAND", head: "RUSSIAN MISSILE FALLS IN POLAND", body: "A KH-101 CAME DOWN AT NOWY LIPOWIEC. NATO CALLS IT A 'GRAVE VIOLATION'. NO ONE WAS HURT." },
    { x: 352, kick: "UKRAINE", head: "84 MISSILES, 404 DRONES HIT KYIV", body: "THREE BRIDGES OVER THE DNIPRO DAMAGED. POWER, HEAT AND WATER CUT ACROSS KYIV." },
    { x: 680, kick: "MARKETS", head: "AI SELL-OFF HITS U.S. STOCKS", body: "THE S&P 500 FELL 3.7% INTO CORRECTION. THE NASDAQ LOST 5.3%; NVIDIA FELL 14%." },
  ];
  for (const col of cols) {
    drawText(col.kick, col.x, 612, 13, RED, { weight: 1.5, track: 0.5 });
    const ox = col.x, oy = 632, tw = 320, th = 112;
    if (col.kick === "POLAND") {
      // concrete rural Poland: sky, farmhouse, pines, field, crater, missile, flag
      fillRect(ox, oy, tw, 52, rgb("#cfd8de"));
      polyFill([ox, oy + 40, ox + 120, oy + 28, ox + 240, oy + 38, ox + 320, oy + 30, ox + 320, oy + 52, ox, oy + 52], rgb("#8a9a7a"));
      fillRect(ox + 18, oy + 34, 34, 18, rgb("#f2e6c8"));
      polyFill([ox + 14, oy + 34, ox + 35, oy + 22, ox + 56, oy + 34], rgb("#a03a28"));
      fillRect(ox + 30, oy + 40, 8, 8, rgb("#3a2e22"));
      fillRect(ox, oy + 52, tw, 60, rgb("#5d8a3c"));
      for (let i = 0; i < 5; i++) line(ox + 10 + i * 64, oy + 56, ox + 40 + i * 64, oy + 112, 1.4, rgb("#4c7530"));
      pine(ox + 10, oy + 52, 30); pine(ox + 308, oy + 52, 34); pine(ox + 296, oy + 52, 22);
      // crater
      ellipse(ox + 165, oy + 92, 58, 15, rgb("#6b4a2f"));
      ellipse(ox + 165, oy + 92, 44, 10, rgb("#4a2f1c"));
      ellipse(ox + 165, oy + 88, 30, 6, rgb("#2e1c0e"));
      for (const [dx, dy] of [[-52, -6], [-38, 4], [48, -4], [58, 2], [20, -10], [-14, 8]] as [number, number][]) {
        circle(ox + 165 + dx, oy + 92 + dy, 2.2, rgb("#3a2412"));
      }
      // cruise missile, nose down-right into the crater
      line(ox + 105, oy + 58, ox + 185, oy + 92, 17, rgb("#6e747c"));
      line(ox + 105, oy + 58, ox + 185, oy + 92, 12, rgb("#b9bec4"));
      polyFill([ox + 178, oy + 84, ox + 196, oy + 96, ox + 184, oy + 100], rgb("#8a8f96")); // nose cone
      polyFill([ox + 126, oy + 66, ox + 142, oy + 46, ox + 138, oy + 72], rgb("#8a8f96")); // swept wing
      polyFill([ox + 99, oy + 51, ox + 112, oy + 49, ox + 106, oy + 61], rgb("#5a5f66")); // tail fin
      line(ox + 112, oy + 62, ox + 178, oy + 90, 1.2, rgb("#7a7f86"));
      // smoke wisp rising from the crater, grey overlapping puffs
      ellipse(ox + 168, oy + 76, 13, 8, rgb("#c9c9c9"));
      ellipse(ox + 176, oy + 64, 11, 7, rgb("#c9c9c9"));
      ellipse(ox + 168, oy + 54, 9, 6, rgb("#d6d6d6"));
      // Polish flag on a pole
      line(ox + 272, oy + 28, ox + 272, oy + 98, 2.2, rgb("#5a4632"));
      polyFill([ox + 272, oy + 30, ox + 312, oy + 30, ox + 308, oy + 39, ox + 272, oy + 39], rgb("#ffffff"));
      polyFill([ox + 272, oy + 39, ox + 308, oy + 39, ox + 312, oy + 48, ox + 272, oy + 48], rgb("#dc143c"));
    } else if (col.kick === "UKRAINE") {
      // Kyiv: dusk skyline, golden dome, river, broken bridge, soft smoke, calm flames
      fillRect(ox, oy, tw, 112, rgb("#7a6a72"));
      fillRect(ox, oy + 52, tw, 20, rgb("#d99a5e"));
      const sky = rgb("#4a3a48");
      fillRect(ox + 8, oy + 42, 26, 30, sky); fillRect(ox + 40, oy + 30, 20, 42, sky);
      fillRect(ox + 96, oy + 38, 30, 34, sky); fillRect(ox + 200, oy + 34, 24, 38, sky);
      fillRect(ox + 232, oy + 44, 34, 28, sky); fillRect(ox + 276, oy + 28, 22, 44, sky);
      fillRect(ox + 62, oy + 46, 14, 26, rgb("#5a4a52"));
      circle(ox + 69, oy + 42, 10, GOLD);
      line(ox + 69, oy + 32, ox + 69, oy + 26, 1.6, GOLD);
      fillRect(ox, oy + 88, tw, 24, rgb("#4a6a8a"));
      line(ox + 10, oy + 96, ox + 310, oy + 96, 1.4, rgb("#7a9ab2"));
      line(ox + 40, oy + 104, ox + 200, oy + 104, 1.2, rgb("#7a9ab2"));
      // bridge: deck left + right, middle span collapsed in a V, leaning pylon, slack cables
      line(ox + 10, oy + 78, ox + 140, oy + 78, 5, rgb("#e8e2d2"));
      line(ox + 180, oy + 78, ox + 310, oy + 78, 5, rgb("#e8e2d2"));
      line(ox + 140, oy + 78, ox + 160, oy + 100, 4, rgb("#c8bfa8"));
      line(ox + 180, oy + 78, ox + 160, oy + 100, 4, rgb("#c8bfa8"));
      line(ox + 140, oy + 78, ox + 128, oy + 30, 4, rgb("#8a7a68"));
      polyline([ox + 128, oy + 30, ox + 138, oy + 52, ox + 140, oy + 78], 1.4, rgb("#a89a86"));
      polyline([ox + 128, oy + 30, ox + 160, oy + 58, ox + 180, oy + 78], 1.4, rgb("#a89a86"));
      // soft wide smoke columns — round overlapping puffs, wide rounded tops
      smokeColumn(ox + 148, oy + 66, [[0, 0, 8], [-3, -10, 11], [3, -20, 13], [-2, -31, 15], [2, -42, 14]]);
      smokeColumn(ox + 176, oy + 70, [[0, 0, 7], [2, -9, 10], [-2, -18, 12], [1, -28, 13]]);
      // calm flames at the break
      flame(ox + 152, oy + 82, 12);
      flame(ox + 168, oy + 84, 10);
    } else {
      // markets: dark panel, grid, falling line, chips kept clear of the line
      fillRect(ox, oy, tw, 112, rgb("#16233a"));
      for (let i = 1; i < 5; i++) line(ox, oy + i * 22, ox + tw, oy + i * 22, 1, rgb("#2a3a55"));
      for (let i = 1; i < 7; i++) line(ox + i * 46, oy, ox + i * 46, oy + 112, 1, rgb("#2a3a55"));
      const bars = [26, 34, 30, 44, 38, 52, 60, 72];
      bars.forEach((bh, i) => fillRect(ox + 14 + i * 38, oy + 112 - bh, 16, bh, i < 5 ? rgb("#3a5a8a") : rgb("#8a3a34")));
      polyline([ox + 15, oy + 28, ox + 70, oy + 38, ox + 120, oy + 52, ox + 175, oy + 62, ox + 230, oy + 78, ox + 300, oy + 96], 3, rgb("#e05a4e"));
      for (const [px, py] of [[15, 28], [70, 38], [120, 52], [175, 62], [230, 78], [300, 96]] as [number, number][]) circle(ox + px, oy + py, 2.6, rgb("#ff8a7a"));
      roundRect(ox + 212, oy + 8, 100, 20, 4, rgb("#fdfaf2"));
      drawText("S&P −3.7%", ox + 262, oy + 13, 12, RED, { weight: 1.5, align: "center" });
      roundRect(ox + 8, oy + 88, 108, 18, 4, rgb("#fdfaf2"));
      drawText("NASDAQ −5.3%", ox + 62, oy + 92, 11, INK, { weight: 1.4, align: "center" });
      roundRect(ox + 128, oy + 90, 96, 18, 4, rgb("#fdfaf2"));
      drawText("NVIDIA −14%", ox + 176, oy + 94, 11, INK, { weight: 1.4, align: "center" });
    }
    polyline([ox, oy, ox + tw, oy, ox + tw, oy + th, ox, oy + th, ox, oy], 1.6, INK);
    const headLines = wrap(col.head, tw, 20, 0.3);
    headLines.forEach((ln, i) => drawText(ln, ox, 754 + i * 24, 20, INK, { weight: 1.5, track: 0.3 }));
    const bodyLines = wrap(col.body, tw, 13, 0.3);
    bodyLines.forEach((ln, i) => drawText(ln, ox, 806 + i * 17, 13, INK, { weight: 1.25, track: 0.3 }));
  }
  fillRect(24, 852, 976, 2, INK);

  // ===== footer: IN BRIEF =====
  drawText("IN BRIEF", 24, 862, 16, RED, { weight: 1.5, track: 0.5 });
  const briefs: [string, string][] = [
    ["CYCLONE AKVAN", "370,000 FLED THE ODISHA COAST; NO DEATHS REPORTED."],
    ["WORLD COURT", "STATES MOVE TO ACT AFTER THE COURT'S RULING ON MYANMAR."],
    ["FRANCE", "PARIS SEEKS AN URGENT U.N. SECURITY COUNCIL MEETING ON KYIV."],
    ["ESTONIA", "TALLINN WILL SHUT ITS BORDER WITH RUSSIA FROM 1 DECEMBER."],
  ];
  briefs.forEach(([lead, text], i) => {
    const bx = 24 + i * 244;
    drawText(lead, bx, 890, 13, INK, { weight: 1.6, track: 0.3 });
    const lines = wrap(text, 232, 13, 0.3);
    lines.forEach((ln, j) => drawText(ln, bx, 910 + j * 17, 13, INK, { weight: 1.2, track: 0.3 }));
  });
  fillRect(24, 968, 976, 1.5, INK);
  drawText("THE WORLD — ONE DAY, ONE PAGE — SATURDAY, 21 NOVEMBER 2026", 512, 982, 11, rgb("#5a544a"), { weight: 1.1, align: "center" });
}

// ---------- main ----------
function main(): void {
  for (let i = 0; i < W2 * H2; i++) {
    buf[i * 4] = PAPER[0]; buf[i * 4 + 1] = PAPER[1]; buf[i * 4 + 2] = PAPER[2]; buf[i * 4 + 3] = 255;
  }
  draw();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  const dossier = {
    title: "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026",
    date: "2026-11-21",
    width: W,
    height: H,
    bytes: png.length,
    sha256: sha,
  };
  fs.writeFileSync(path.join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
}

main();
