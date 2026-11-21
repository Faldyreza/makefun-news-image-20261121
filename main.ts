// news-image-20261121 v12 — "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// Fresh build from the brief. Node 22 stdlib only, no network.
// Writes /output/entry.png (1024x1024 PNG, deterministic) + dossier.json.
// Fixes vs v11: (a) Poland flag pole moved well left of the house, flag flies LEFT
// away from the roof so its right edge cannot touch it; (b) missile smoke-trail
// puffs much bigger and darker for thumbnail readability; (c) Kyiv smoke column
// shifted right of the fire and flames drawn in front, so the flames show fully.
//
// Facts (verified, 21 Nov 2026):
// LEAD — COP31 Antalya overtime Sat 21 Nov: Friday deadline missed, draft drops
// fossil-fuel mentions + $120bn/yr adaptation, ~200 nations, new draft due Sat.
// SECONDARY — Russian Kh-101 missile down in Poland (Nowy Lipowiec, NATO "grave
// violation", no one hurt); Kyiv barrage (84 cruise missiles + 404 drones, 3 Dnipro
// bridges damaged, power/heat/water cut); US AI sell-off (S&P -3.7% into correction,
// Nasdaq -5.3%, Nvidia -14%).
// IN BRIEF — Cyclone Akvan (370,000 fled Odisha, no deaths); World Court action
// after Myanmar ruling; France seeks UNSC meeting on Kyiv; Estonia to shut Russia
// border from 1 Dec.

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

// ---------------------------------------------------------------- palette
type RGB = [number, number, number];
const PAPER: RGB = [247, 243, 233];
const INK: RGB = [26, 24, 20];
const INKSOFT: RGB = [74, 68, 58];
const RED: RGB = [178, 39, 30];
const WALL1: RGB = [239, 228, 205];
const WALL2: RGB = [226, 210, 178];
const WOOD: RGB = [138, 106, 72];
const WOODDARK: RGB = [107, 74, 47];
const TABLETOP: RGB = [125, 90, 56];

// ---------------------------------------------------------------- raster
const W = 1024;
const H = 1024;
const buf = Buffer.alloc(W * H * 4);

function setPix(x: number, y: number, c: RGB): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;
  const i = (yi * W + xi) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 4;
    for (let xx = x0; xx < x1; xx++) {
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
      i += 4;
    }
  }
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= rr) setPix(x, y, c);
    }
  }
}
function thickLine(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / Math.max(1, w * 0.35)));
  const r = w / 2;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x1 + dx * t, y1 + dy * t, r, c);
  }
}
function fillPoly(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPix(x, y, c);
    }
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const t = (y - cy) / ry;
    const dx = rx * Math.sqrt(Math.max(0, 1 - t * t));
    fillRect(cx - dx, y, dx * 2, 1, c);
  }
}
function ellipseStroke(cx: number, cy: number, rx: number, ry: number, w: number, c: RGB): void {
  const n = 72;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    disc(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, w / 2, c);
  }
}
function lerpC(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}
function vgrad(x: number, y: number, w: number, h: number, c1: RGB, c2: RGB): void {
  for (let yy = 0; yy < h; yy++) {
    fillRect(x, y + yy, w, 1, lerpC(c1, c2, yy / Math.max(1, h - 1)));
  }
}
function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillRect(x, y + r, w, h - 2 * r, c);
  disc(x + r, y + r, r, c);
  disc(x + w - r, y + r, r, c);
  disc(x + r, y + h - r, r, c);
  disc(x + w - r, y + h - r, r, c);
}

// ---------------------------------------------------------------- stroke font
// Glyphs as polylines on a 10-wide grid; y=0 top of caps, y=10 baseline,
// y=13 descender bottom. [advance, path]
const GLYPHS: Record<string, [number, string]> = {
  A: [11, 'M0,10 L5,0 L10,10 M2.5,6.5 L7.5,6.5'],
  B: [10.5, 'M0,10 L0,0 L6,0 L9,2 L6,4 L0,4 M6,4 L9,6 L9,8 L6,10 L0,10'],
  C: [10.5, 'M9,2 L7,0 L3,0 L0,3 L0,7 L3,10 L7,10 L9,8'],
  D: [11, 'M0,10 L0,0 L6,0 L10,3 L10,7 L6,10 L0,10'],
  E: [10, 'M10,0 L0,0 L0,10 L10,10 M0,5 L7,5'],
  F: [10, 'M0,10 L0,0 L10,0 M0,5 L7,5'],
  G: [11, 'M9,2 L7,0 L3,0 L0,3 L0,7 L3,10 L7,10 L10,7 L10,4 L6,4'],
  H: [11, 'M0,0 L0,10 M10,0 L10,10 M0,5 L10,5'],
  I: [6, 'M5,0 L5,10 M2,0 L8,0 M2,10 L8,10'],
  J: [9, 'M8,0 L8,8 L5,10 L2,8 L1,6'],
  K: [11, 'M0,0 L0,10 M9,0 L0,5 L9,10'],
  L: [10, 'M0,0 L0,10 L10,10'],
  M: [12, 'M0,10 L0,0 L5,6 L10,0 L10,10'],
  N: [11, 'M0,10 L0,0 L10,10 L10,0'],
  O: [11, 'M3,0 L7,0 L10,3 L10,7 L7,10 L3,10 L0,7 L0,3 L3,0'],
  P: [10.5, 'M0,10 L0,0 L7,0 L10,3 L7,6 L0,6'],
  Q: [11, 'M3,0 L7,0 L10,3 L10,7 L7,10 L3,10 L0,7 L0,3 L3,0 M7,7 L10,10'],
  R: [11, 'M0,10 L0,0 L7,0 L10,3 L7,6 L0,6 M6,6 L10,10'],
  S: [10.5, 'M9,2 L7,0 L3,0 L1,2 L1,4 L9,6 L9,8 L7,10 L3,10 L1,8'],
  T: [10, 'M0,0 L10,0 M5,0 L5,10'],
  U: [11, 'M0,0 L0,7 L3,10 L7,10 L10,7 L10,0'],
  V: [11, 'M0,0 L5,10 L10,0'],
  W: [13, 'M0,0 L2.5,10 L5,4 L7.5,10 L10,0'],
  X: [11, 'M0,0 L10,10 M10,0 L0,10'],
  Y: [11, 'M0,0 L5,5 L10,0 M5,5 L5,10'],
  Z: [10.5, 'M0,0 L10,0 L0,10 L10,10'],
  a: [10, 'M2,4 L8,4 L9,5 L9,8 L8,10 L2,10 L1,8 L1,6 L2,4 M9,4 L9,10'],
  b: [10, 'M1,0 L1,10 M1,6 L7,6 L9,8 L8,10 L2,10 L1,9'],
  c: [9.5, 'M9,5 L7,4 L3,4 L1,6 L1,8 L3,10 L7,10 L9,9'],
  d: [10, 'M1,4 L7,4 L9,6 L9,8 L7,10 L1,10 L1,8 M9,0 L9,10'],
  e: [10, 'M9,7 L2,7 L1,6 L1,5 L3,4 L7,4 L9,6 L9,8 L7,10 L3,10 L1,8'],
  f: [8, 'M7,0 L4,1 L3,3 L3,10 M3,5 L8,5'],
  g: [10, 'M1,4 L7,4 L9,6 L9,8 L7,10 L1,10 L1,6 M9,10 L9,12 L7,13 L4,13 L3,12'],
  h: [10, 'M1,0 L1,10 M1,6 L7,6 L9,8 L9,10'],
  i: [5, 'M5,1 L5,2 M5,4 L5,10'],
  j: [7, 'M6,1 L6,2 M7,4 L7,11 L5,13 L3,12'],
  k: [10, 'M1,0 L1,10 M8,4 L1,7 L8,10'],
  l: [5, 'M5,0 L5,10'],
  m: [13, 'M1,10 L1,4 L4,4 L5,6 L6,4 L9,4 L9,10'],
  n: [10, 'M1,10 L1,4 L7,4 L9,6 L9,10'],
  o: [10, 'M3,4 L7,4 L9,6 L9,8 L7,10 L3,10 L1,8 L1,6 L3,4'],
  p: [10, 'M1,4 L1,13 M1,7 L7,7 L9,8 L8,10 L2,10 L1,9'],
  q: [10, 'M9,4 L9,13 M9,7 L3,7 L1,8 L2,10 L8,10 L9,9'],
  r: [8, 'M1,10 L1,4 L7,4 L9,6'],
  s: [9.5, 'M9,5 L7,4 L3,4 L1,6 L1,7 L9,8 L9,9 L7,10 L3,10 L1,9'],
  t: [8, 'M5,0 L5,10 M2,4 L8,4 M5,10 L8,10'],
  u: [10, 'M1,4 L1,8 L3,10 L7,10 L9,8 L9,4'],
  v: [10, 'M1,4 L5,10 L9,4'],
  w: [12, 'M1,4 L2.5,10 L5,6 L7.5,10 L9,4'],
  x: [10, 'M1,4 L9,10 M9,4 L1,10'],
  y: [10, 'M1,4 L5,10 L9,4 M5,10 L5,13 L3,13'],
  z: [9.5, 'M1,4 L9,4 L1,10 L9,10'],
  '0': [11, 'M3,0 L7,0 L10,3 L10,7 L7,10 L3,10 L0,7 L0,3 L3,0'],
  '1': [8, 'M3,2 L6,0 L6,10 M3,10 L9,10'],
  '2': [10.5, 'M1,2 L3,0 L7,0 L9,2 L9,4 L1,10 L9,10'],
  '3': [10.5, 'M1,2 L3,0 L7,0 L9,2 L9,4 L7,6 L9,8 L7,10 L3,10 L1,8'],
  '4': [10.5, 'M1,7 L7,0 L7,10 M1,7 L9,7'],
  '5': [10.5, 'M9,0 L1,0 L1,4 L7,4 L9,6 L9,8 L7,10 L3,10 L1,8'],
  '6': [10.5, 'M9,2 L7,0 L3,0 L0,3 L0,7 L3,10 L7,10 L9,8 L9,6 L7,4 L3,4'],
  '7': [10, 'M1,0 L9,0 L5,10'],
  '8': [10.5, 'M3,0 L7,0 L9,2 L7,4 L3,4 L1,2 L3,0 M3,4 L7,4 L9,6 L9,8 L7,10 L3,10 L1,8 L1,6 L3,4'],
  '9': [10.5, 'M2,3 L8,3 L9,5 L9,8 L7,10 L3,10 L1,8 L1,5 L3,3 M9,3 L9,10'],
  ' ': [5, ''],
  '.': [5, 'M5,9 L5,10'],
  ',': [5, 'M5,9 L5,10 M5,10 L4,12'],
  ':': [5, 'M5,3 L5,4 M5,8 L5,9'],
  ';': [5, 'M5,3 L5,4 M5,8 L5,10 M5,10 L4,12'],
  '!': [6, 'M5,0 L5,7 M5,9 L5,10'],
  '?': [10, 'M2,2 L4,0 L7,0 L9,2 L9,4 L7,6 L5,6 M5,9 L5,10'],
  "'": [5, 'M6,0 L5,2'],
  '"': [8, 'M3,0 L2,2 M7,0 L6,2'],
  '-': [8, 'M1,5 L9,5'],
  '\u2013': [8, 'M1,5 L9,5'],
  '\u2014': [11, 'M0,5 L10,5'],
  '\u2212': [8, 'M1,5 L9,5'],
  '(': [7, 'M8,0 L5,2 L5,8 L8,10'],
  ')': [7, 'M2,0 L5,2 L5,8 L2,10'],
  $: [10.5, 'M5,0 L5,11 M9,2 L7,0 L3,0 L1,2 L1,4 L9,6 L9,8 L7,10 L3,10 L1,8'],
  '%': [11, 'M1,1 L9,9 M1,0 L3,0 L3,2 L1,2 M7,8 L9,8 L9,10 L7,10'],
  '&': [11, 'M8,2 L7,0 L4,0 L2,2 L2,4 L5,6 L9,10 M2,8 L4,10 L7,10 L9,8'],
  '/': [8, 'M8,0 L2,10'],
  '+': [10, 'M5,2 L5,8 M2,5 L8,5'],
  '=': [10, 'M1,4 L9,4 M1,7 L9,7'],
  '\u00b7': [5, 'M5,5 L5,6'],
  '\u2022': [6, 'M4,4 L6,4 L6,6 L4,6'],
  '~': [10, 'M1,6 L3,4 L5,6 L7,4 L9,6'],
  '*': [10, 'M5,1 L5,9 M1,3 L9,7 M9,3 L1,7'],
};

const segCache = new Map<string, Array<[number, number, number, number]>>();
function glyphSegs(path: string): Array<[number, number, number, number]> {
  const hit = segCache.get(path);
  if (hit) return hit;
  const segs: Array<[number, number, number, number]> = [];
  let cx = 0;
  let cy = 0;
  for (const tok of path.split(' ')) {
    if (!tok) continue;
    const cmd = tok[0];
    const parts = tok.slice(1).split(',');
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (cmd === 'M') { cx = x; cy = y; }
    else if (cmd === 'L') { segs.push([cx, cy, x, y]); cx = x; cy = y; }
  }
  segCache.set(path, segs);
  return segs;
}

function measureText(s: string, size: number, tracking = 0): number {
  const scale = size / 10;
  let w = 0;
  const chars = [...s];
  for (const ch of chars) {
    const g = GLYPHS[ch];
    w += (g ? g[0] : 5) * scale;
  }
  if (chars.length > 1) w += tracking * (chars.length - 1);
  return w;
}

interface TextOpts { weight?: number; align?: 'left' | 'center' | 'right'; tracking?: number; }
function drawText(s: string, x: number, baselineY: number, size: number, c: RGB, o: TextOpts = {}): void {
  const scale = size / 10;
  const sw = Math.max(1, size * (o.weight ?? 0.13));
  const tracking = o.tracking ?? 0;
  const chars = [...s];
  let cx = x;
  if (o.align === 'center') cx = x - measureText(s, size, tracking) / 2;
  else if (o.align === 'right') cx = x - measureText(s, size, tracking);
  for (let ci = 0; ci < chars.length; ci++) {
    const ch = chars[ci];
    const g = GLYPHS[ch];
    if (g) {
      for (const seg of glyphSegs(g[1])) {
        thickLine(
          cx + seg[0] * scale, baselineY + (seg[1] - 10) * scale,
          cx + seg[2] * scale, baselineY + (seg[3] - 10) * scale,
          sw, c,
        );
      }
      cx += g[0] * scale;
    } else {
      cx += 5 * scale;
    }
    if (ci < chars.length - 1) cx += tracking;
  }
}

function wrap(s: string, maxW: number, size: number, tracking = 0): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (measureText(t, size, tracking) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  // anti-orphan: never leave a lone short word on the last line
  if (lines.length > 1) {
    const last = lines[lines.length - 1];
    if (!last.includes(' ') && last.length <= 8) {
      const prev = lines[lines.length - 2].split(' ');
      const moved = prev.pop() as string;
      const a = prev.join(' ');
      const b = moved + ' ' + last;
      if (measureText(b, size, tracking) <= maxW) {
        lines[lines.length - 2] = a;
        lines[lines.length - 1] = b;
      }
    }
  }
  return lines;
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  // scanlines with Sub filter (1) for good compression, deterministic
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W * 3);
    raw[rowStart] = 1;
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4;
      const di = rowStart + 1 + x * 3;
      for (let k = 0; k < 3; k++) {
        const v = buf[si + k];
        const left = x > 0 ? buf[si - 4 + k] : 0;
        raw[di + k] = (v - left) & 0xff;
      }
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), iend]);
}

// ---------------------------------------------------------------- scene
const FRAME: RGB = [58, 46, 34];

function drawArchWindow(x0: number, x1: number, cy: number, r: number, yBottom: number, cTop: RGB, cBot: RGB): void {
  // frame: slightly larger arch in dark wood
  const cx = (x0 + x1) / 2;
  for (let y = Math.floor(cy - r - 6); y <= yBottom + 6; y++) {
    let half = (x1 - x0) / 2 + 6;
    if (y < cy) {
      const dy = cy - y;
      half = Math.sqrt(Math.max(0, (r + 6) * (r + 6) - dy * dy));
    }
    fillRect(cx - half, y, half * 2, 1, FRAME);
  }
  // glass: sunset gradient inside the arch
  for (let y = Math.floor(cy - r); y <= yBottom; y++) {
    let half = (x1 - x0) / 2;
    if (y < cy) {
      const dy = cy - y;
      half = Math.sqrt(Math.max(0, r * r - dy * dy));
    }
    const t = (y - (cy - r)) / (yBottom - (cy - r));
    fillRect(cx - half, y, half * 2, 1, lerpC(cTop, cBot, t));
  }
}
function inArch(x: number, y: number, x0: number, x1: number, cy: number, r: number, yBottom: number): boolean {
  const cx = (x0 + x1) / 2;
  if (x < x0 || x > x1 || y > yBottom) return false;
  if (y >= cy) return true;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function drawMullions(x0: number, x1: number, cy: number, r: number, yBottom: number): void {
  const w = x1 - x0;
  const b1 = x0 + w / 3;
  const b2 = x0 + (2 * w) / 3;
  for (let y = Math.floor(cy - r); y <= yBottom; y++) {
    let half = w / 2;
    if (y < cy) {
      const dy = cy - y;
      half = Math.sqrt(Math.max(0, r * r - dy * dy));
    }
    const cx = (x0 + x1) / 2;
    if (y >= cy || true) {
      // vertical bars only where the arch is wide enough
      if (Math.abs(b1 - cx) <= half - 4) fillRect(b1 - 3.5, y, 7, 1, FRAME);
      if (Math.abs(b2 - cx) <= half - 4) fillRect(b2 - 3.5, y, 7, 1, FRAME);
    }
  }
  // horizontal bar
  fillRect(x0, 330, w, 7, FRAME);
  // arch rib following the curve
  for (let a = 0; a <= 24; a++) {
    const ang = Math.PI + (a / 24) * Math.PI;
    disc((x0 + x1) / 2 + Math.cos(ang) * (r - 4), cy + Math.sin(ang) * (r - 4), 3, FRAME);
  }
}

function drawLead(): void {
  // hall wall
  vgrad(28, 146, 968, 454, WALL1, WALL2);
  // wood wainscot
  fillRect(28, 520, 968, 80, WOOD);
  for (let x = 28; x < 996; x += 48) fillRect(x, 520, 2, 80, WOODDARK);
  fillRect(28, 520, 968, 4, WOODDARK);

  // arched windows (sunset)
  const SUNSET_TOP: RGB = [255, 217, 122];
  const SUNSET_BOT: RGB = [198, 91, 124];
  drawArchWindow(64, 300, 278, 118, 440, SUNSET_TOP, SUNSET_BOT);
  drawArchWindow(724, 960, 278, 118, 440, SUNSET_TOP, SUNSET_BOT);

  // sun + rays in the RIGHT window, rays drawn BEFORE the mullions
  const sunCx = 842;
  const sunCy = 240;
  // rays: fan upward, clipped to the window arch
  const RAY: RGB = [255, 207, 110];
  for (let i = 0; i < 13; i++) {
    const ang = (-168 + i * 14) * Math.PI / 180;
    const len = 96;
    const ex = sunCx + Math.cos(ang) * len;
    const ey = sunCy + Math.sin(ang) * len;
    const steps = 40;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = sunCx + (ex - sunCx) * t;
      const py = sunCy + (ey - sunCy) * t;
      if (inArch(px, py, 724, 960, 278, 118, 440)) disc(px, py, 2.6, RAY);
    }
  }
  disc(sunCx, sunCy, 42, [255, 223, 138]);
  disc(sunCx, sunCy, 30, [255, 246, 201]);

  // mullions over the glass and rays
  drawMullions(64, 300, 278, 118, 440);
  drawMullions(724, 960, 278, 118, 440);

  // bunting: 16 flags strung between the windows
  const FLAGCOLS: RGB[] = [[178, 39, 30], [46, 111, 176], [46, 139, 87], [224, 160, 48]];
  const bx0 = 306;
  const bx1 = 718;
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = bx0 + (bx1 - bx0) * t;
    const y = 172 + 26 * Math.sin(Math.PI * t);
    disc(x, y, 1.6, FRAME);
  }
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16;
    const x = bx0 + (bx1 - bx0) * t;
    const y = 172 + 26 * Math.sin(Math.PI * t);
    const col = FLAGCOLS[i % 4];
    fillPoly([[x - 8, y], [x + 8, y], [x, y + 19]], col);
  }

  // OVERTIME badge, top centre
  roundRect(452, 150, 120, 24, 6, RED);
  drawText('OVERTIME', 512, 167, 14, [255, 255, 255], { weight: 0.16, align: 'center', tracking: 1 });

  // wall clock, near midnight
  disc(512, 208, 22, [250, 246, 236]);
  ellipseStroke(512, 208, 22, 22, 3, FRAME);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    thickLine(512 + Math.cos(a) * 17, 208 + Math.sin(a) * 17, 512 + Math.cos(a) * 20, 208 + Math.sin(a) * 20, 2, FRAME);
  }
  // hands at 11:58 — hour hand just short of 12, minute hand at 58 minutes
  thickLine(512, 208, 512 + Math.cos(-Math.PI / 2 - 0.06) * 11, 208 + Math.sin(-Math.PI / 2 - 0.06) * 11, 3, INK);
  thickLine(512, 208, 512 + Math.cos(-Math.PI / 2 - 0.21) * 16, 208 + Math.sin(-Math.PI / 2 - 0.21) * 16, 2.5, INK);
  disc(512, 208, 2.5, INK);

  // five delegates, torsos above the table; middle one raised on a riser
  const delegates = [
    { x: 150, headY: 462, suit: [43, 58, 85] as RGB, tie: [178, 39, 30] as RGB, skin: [232, 185, 138] as RGB, hair: [120, 120, 120] as RGB, hairStyle: 'side' },
    { x: 300, headY: 458, suit: [61, 61, 61] as RGB, tie: [30, 78, 130] as RGB, skin: [210, 164, 122] as RGB, hair: [30, 24, 20] as RGB, hairStyle: 'short' },
    { x: 512, headY: 446, suit: [39, 75, 143] as RGB, tie: [178, 39, 30] as RGB, skin: [232, 185, 138] as RGB, hair: [88, 60, 38] as RGB, hairStyle: 'side' },
    { x: 724, headY: 458, suit: [31, 78, 95] as RGB, tie: [120, 40, 40] as RGB, skin: [198, 150, 110] as RGB, hair: [210, 180, 120] as RGB, hairStyle: 'short' },
    { x: 874, headY: 462, suit: [110, 43, 43] as RGB, tie: [30, 60, 90] as RGB, skin: [224, 176, 130] as RGB, hair: [52, 40, 32] as RGB, hairStyle: 'side' },
  ];
  for (const d of delegates) {
    const torsoTop = d.headY + 30;
    // torso: shoulders wide, tapering to the table
    fillPoly([[d.x - 62, 570], [d.x - 52, torsoTop + 6], [d.x + 52, torsoTop + 6], [d.x + 62, 570]], d.suit);
    // white shirt + tie
    fillPoly([[d.x - 14, torsoTop + 8], [d.x + 14, torsoTop + 8], [d.x, torsoTop + 58]], [250, 246, 236]);
    fillPoly([[d.x - 6, torsoTop + 10], [d.x + 6, torsoTop + 10], [d.x + 8, torsoTop + 34], [d.x, torsoTop + 52], [d.x - 8, torsoTop + 34]], d.tie);
    // head
    disc(d.x, d.headY, 26, d.skin);
    // hair cap
    for (let a = Math.PI; a <= Math.PI * 2; a += 0.08) {
      disc(d.x + Math.cos(a) * 26, d.headY - 3 + Math.sin(a) * 24, 4.5, d.hair);
    }
    if (d.hairStyle === 'side') {
      // side part: a few hair strokes
      thickLine(d.x - 20, d.headY - 16, d.x - 8, d.headY - 24, 3, d.hair);
      thickLine(d.x - 14, d.headY - 18, d.x - 2, d.headY - 25, 3, d.hair);
    }
    // face: eyes with pupils + highlight, brows, nose, mouth
    disc(d.x - 9, d.headY - 2, 2.6, [30, 24, 20]);
    disc(d.x + 9, d.headY - 2, 2.6, [30, 24, 20]);
    disc(d.x - 8.2, d.headY - 2.8, 0.9, [255, 255, 255]);
    disc(d.x + 9.8, d.headY - 2.8, 0.9, [255, 255, 255]);
    thickLine(d.x - 13, d.headY - 9, d.x - 5, d.headY - 10, 2, d.hair);
    thickLine(d.x + 5, d.headY - 10, d.x + 13, d.headY - 9, 2, d.hair);
    thickLine(d.x, d.headY + 1, d.x - 2, d.headY + 8, 2, [150, 110, 80]);
    thickLine(d.x - 2, d.headY + 8, d.x + 2, d.headY + 8, 2, [150, 110, 80]);
    thickLine(d.x - 6, d.headY + 14, d.x + 6, d.headY + 14, 2.4, [120, 70, 60]);
  }

  // conference table
  fillRect(28, 570, 968, 10, TABLETOP);
  fillRect(28, 580, 968, 20, WOODDARK);
  for (let x = 60; x < 996; x += 90) fillRect(x, 580, 2, 20, [88, 60, 38]);

  // DRAFT paper on the table in front of the middle delegate
  fillRect(447, 540, 130, 32, [210, 200, 185]);
  fillRect(445, 538, 130, 32, [252, 249, 240]);
  drawText('DRAFT', 510, 552, 13, RED, { weight: 0.16, align: 'center', tracking: 1 });
  drawText('fossil fuels', 510, 566, 11, INKSOFT, { align: 'center' });
  // one clean strikethrough through "fossil fuels"
  thickLine(470, 562, 550, 562, 2, RED);

  // globe on a small side table, far right
  fillRect(905, 566, 86, 6, WOODDARK);
  fillRect(910, 572, 5, 28, WOODDARK);
  fillRect(981, 572, 5, 28, WOODDARK);
  disc(948, 540, 19, [127, 179, 213]);
  ellipse(940, 534, 7, 5, [93, 168, 95]);
  ellipse(954, 548, 6, 4, [93, 168, 95]);
  ellipseStroke(948, 540, 19, 19, 1.6, [60, 110, 150]);
  ellipseStroke(948, 540, 9, 19, 1.4, [60, 110, 150]);
  thickLine(929, 540, 967, 540, 1.4, [60, 110, 150]);
  fillPoly([[938, 559], [958, 559], [954, 566], [942, 566]], [90, 70, 50]);
}

function drawMasthead(): void {
  fillRect(12, 12, 1000, 2, INK);
  fillRect(12, 1010, 1000, 2, INK);
  fillRect(12, 12, 2, 1000, INK);
  fillRect(1010, 12, 2, 1000, INK);
  drawText('THE WORLD', 512, 84, 62, INK, { weight: 0.16, align: 'center', tracking: 7 });
  fillRect(28, 98, 968, 3, INK);
  drawText('SATURDAY, 21 NOVEMBER 2026 \u00b7 IN ONE IMAGE', 512, 124, 18, INKSOFT, { weight: 0.13, align: 'center', tracking: 1.5 });
  fillRect(28, 136, 968, 1, INKSOFT);
}

function drawHeadlineAndBody(): void {
  drawText('COP31 TALKS RUN INTO OVERTIME', 512, 642, 30, INK, { weight: 0.16, align: 'center', tracking: 2 });
  fillRect(28, 654, 968, 1, INKSOFT);
  const body = "The Friday deadline passed with no deal in Antalya. Some 200 nations haggle over a draft that drops fossil-fuel mentions and pledges $120bn a year for adaptation. A new draft is due on Saturday.";
  const lines = wrap(body, 968, 17);
  let y = 674;
  for (const ln of lines) {
    drawText(ln, 512, y, 17, INK, { align: 'center', weight: 0.12 });
    y += 22;
  }
  fillRect(28, 750, 968, 2, INK);
}

// ---- secondary panels ----
function panelLabel(x: number, label: string, swatch: RGB): void {
  fillRect(x, 760, 11, 11, swatch);
  drawText(label, x + 18, 772, 15, INK, { weight: 0.16, tracking: 1 });
}

function drawKyivPanel(): void {
  const x0 = 34;
  const x1 = 332;
  const y0 = 778;
  const y1 = 868;
  // dusk sky + glow near the horizon
  vgrad(x0, y0, x1 - x0, y1 - y0, [46, 58, 85], [122, 90, 122]);
  // far buildings
  fillRect(x0, 828, 60, 40, [38, 44, 62]);
  fillRect(x0 + 200, 824, 70, 44, [38, 44, 62]);
  fillRect(x0 + 240, 818, 34, 50, [44, 50, 70]);
  // golden dome on the right
  fillRect(x0 + 244, 812, 26, 12, [52, 56, 76]);
  disc(x0 + 257, 808, 9, [212, 164, 60]);
  thickLine(x0 + 257, 800, x0 + 257, 792, 2, [212, 164, 60]);
  // river
  fillRect(x0, 852, x1 - x0, 16, [58, 90, 122]);
  fillRect(x0 + 20, 858, 90, 2, [150, 180, 205]);
  fillRect(x0 + 170, 860, 110, 2, [150, 180, 205]);
  // V bridge: two decks meeting at the centre pier
  const cx = 183;
  thickLine(x0 + 4, 830, cx, 852, 5, [30, 32, 40]);
  thickLine(x1 - 4, 830, cx, 852, 5, [30, 32, 40]);
  fillRect(cx - 4, 848, 8, 20, [30, 32, 40]);
  // leaning pylon + cables
  thickLine(150, 838, 172, 798, 5, [40, 42, 52]);
  thickLine(172, 798, 120, 832, 1.6, [200, 200, 210]);
  thickLine(172, 798, 210, 834, 1.6, [200, 200, 210]);
  thickLine(172, 798, 250, 832, 1.6, [200, 200, 210]);

  // (c) SMOKE FIRST, offset well right of the fire, so flames stay uncovered
  const SMOKE: RGB = [96, 96, 96];
  const SMOKED: RGB = [70, 70, 70];
  const puffs: Array<[number, number, number]> = [
    [142, 824, 10], [148, 810, 12], [155, 796, 12], [162, 784, 9],
  ];
  for (const p of puffs) {
    disc(p[0], p[1], p[2], SMOKE);
    disc(p[0] - 2, p[1] - 2, p[2] * 0.55, SMOKED);
  }
  // (c) FIRE LAST, in front: three tongues, fully visible, left deck
  const fx = 96;
  const fy = 834;
  fillPoly([[fx - 16, fy], [fx - 8, fy - 22], [fx - 2, fy - 12], [fx + 4, fy - 26], [fx + 10, fy - 12], [fx + 16, fy]], [255, 110, 0]);
  fillPoly([[fx - 11, fy], [fx - 5, fy - 15], [fx, fy - 8], [fx + 5, fy - 18], [fx + 11, fy]], [255, 190, 0]);
  fillPoly([[fx - 6, fy], [fx - 2, fy - 10], [fx + 2, fy - 6], [fx + 6, fy - 11], [fx + 6, fy]], [255, 236, 120]);
  disc(fx, fy - 2, 12, [255, 120, 0]);
  disc(fx, fy - 1, 7, [255, 190, 0]);
  // embers
  disc(fx - 20, fy - 8, 1.6, [255, 180, 60]);
  disc(fx + 22, fy - 14, 1.6, [255, 180, 60]);

  panelLabel(28, 'KYIV UNDER FIRE', RED);
  drawText('84 MISSILES, 404 DRONES', 28, 890, 13.5, INK, { weight: 0.16 });
  drawText('Three Dnipro bridges hit;', 28, 905, 12, INKSOFT, { weight: 0.12 });
  drawText('power, heat and water cut.', 28, 920, 12, INKSOFT, { weight: 0.12 });
}

function drawPolandPanel(): void {
  const x0 = 362;
  const x1 = 662;
  const y0 = 778;
  const y1 = 868;
  // pale sky + field
  vgrad(x0, y0, x1 - x0, 52, [207, 227, 238], [238, 243, 230]);
  fillRect(x0, 830, x1 - x0, 38, [127, 174, 90]);
  fillRect(x0, 830, x1 - x0, 3, [96, 140, 66]);
  // treeline
  for (let x = x0 + 8; x < x0 + 120; x += 18) {
    fillPoly([[x, 832], [x + 8, 812], [x + 16, 832]], [70, 110, 60]);
  }
  // pine trees, left
  const pine = (px: number, base: number, h: number, w: number) => {
    fillRect(px - 2, base - h * 0.35, 4, h * 0.35, [90, 66, 44]);
    fillPoly([[px - w / 2, base - h * 0.3], [px, base - h], [px + w / 2, base - h * 0.3]], [52, 96, 58]);
    fillPoly([[px - w * 0.32, base - h * 0.1], [px, base - h * 0.62], [px + w * 0.32, base - h * 0.1]], [62, 112, 66]);
  };
  pine(392, 852, 44, 26);
  pine(420, 852, 36, 22);
  pine(368, 852, 30, 18);

  // (a) HOUSE on the right; FLAG POLE far left of it, flag flying LEFT —
  // the flag's right edge is the pole itself, 50 px clear of the roof.
  // house
  fillRect(570, 812, 70, 40, [242, 237, 224]);
  fillPoly([[562, 812], [648, 812], [605, 792]], [122, 82, 52]);
  fillRect(598, 828, 14, 24, [90, 66, 44]);
  fillRect(578, 820, 12, 12, [150, 190, 215]);
  fillRect(620, 820, 12, 12, [150, 190, 215]);
  // flag pole at x=520, 50 px left of the house wall (570)
  thickLine(520, 852, 520, 786, 3.5, [70, 66, 60]);
  disc(520, 785, 2.6, [178, 160, 60]);
  // flag flies LEFT from the pole: white over red, x 488..520
  fillRect(488, 788, 32, 12, [250, 250, 248]);
  fillRect(488, 800, 32, 12, [200, 40, 40]);
  thickLine(488, 788, 520, 788, 1.4, [120, 120, 118]);
  thickLine(488, 812, 520, 812, 1.4, [120, 120, 118]);

  // crater
  ellipse(430, 856, 26, 7, [58, 44, 32]);
  ellipse(430, 856, 18, 4.5, [34, 26, 20]);
  // missile, nose down into the crater
  thickLine(392, 800, 438, 852, 7, [58, 58, 62]);
  fillPoly([[438, 852], [430, 842], [446, 844]], [178, 39, 30]);
  fillPoly([[392, 800], [380, 792], [388, 812]], [178, 39, 30]);
  fillPoly([[392, 800], [404, 794], [396, 810]], [178, 39, 30]);
  thickLine(414, 826, 406, 818, 3, [178, 39, 30]);
  thickLine(414, 826, 422, 832, 3, [178, 39, 30]);

  // (b) SMOKE TRAIL: bigger, darker, overlapping puffs behind the missile tail
  const TRAIL: RGB = [74, 74, 74];
  const TRAILD: RGB = [46, 46, 46];
  const trail: Array<[number, number, number]> = [
    [384, 796, 13], [370, 790, 13], [356, 784, 11], [344, 780, 9],
  ];
  for (const p of trail) {
    disc(p[0], p[1], p[2], TRAIL);
    disc(p[0] - 2, p[1] - 2, p[2] * 0.55, TRAILD);
  }

  panelLabel(356, 'POLAND', [30, 78, 130]);
  drawText('MISSILE LANDS IN POLAND', 356, 890, 13.5, INK, { weight: 0.16 });
  drawText('Kh-101 down at Nowy Lipowiec;', 356, 905, 12, INKSOFT, { weight: 0.12 });
  drawText("NATO: 'grave violation'. No one hurt.", 356, 920, 12, INKSOFT, { weight: 0.12 });
}

function drawMarketsPanel(): void {
  const x0 = 692;
  const x1 = 990;
  const y0 = 778;
  const y1 = 868;
  fillRect(x0, y0, x1 - x0, y1 - y0, [253, 252, 248]);
  // grid
  for (let gy = y0 + 18; gy < y1; gy += 18) fillRect(x0, gy, x1 - x0, 1, [232, 230, 224]);
  for (let gx = x0 + 40; gx < x1; gx += 40) fillRect(gx, y0, 1, y1 - y0, [232, 230, 224]);
  // axes
  thickLine(x0, y1 - 6, x1, y1 - 6, 2, INKSOFT);
  thickLine(x0 + 4, y0 + 4, x0 + 4, y1 - 6, 2, INKSOFT);
  // falling line with jags
  const pts: Array<[number, number]> = [
    [700, 792], [740, 800], [770, 796], [810, 820], [850, 828], [890, 842], [930, 838], [982, 858],
  ];
  const area: Array<[number, number]> = [...pts, [982, y1 - 6], [700, y1 - 6]];
  fillPoly(area, [244, 214, 208]);
  for (let i = 0; i + 1 < pts.length; i++) {
    thickLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 4, RED);
  }
  // labels placed clear of the falling line: top-right empty zone, bottom-left
  drawText('S&P \u22123.7%', 986, 800, 14, INK, { weight: 0.16, align: 'right' });
  drawText('NASDAQ \u22125.3%', 986, 818, 14, INK, { weight: 0.16, align: 'right' });
  drawText('NVIDIA \u221214%', 700, 858, 14, RED, { weight: 0.16 });

  panelLabel(686, 'MARKETS', [26, 24, 20]);
  drawText('AI STOCKS SELL OFF', 686, 890, 13.5, INK, { weight: 0.16 });
  drawText('S&P \u22123.7% into correction;', 686, 905, 12, INKSOFT, { weight: 0.12 });
  drawText('Nasdaq \u22125.3%; Nvidia \u221214%.', 686, 920, 12, INKSOFT, { weight: 0.12 });
}

function drawFooter(): void {
  fillRect(28, 928, 968, 2, INK);
  drawText('IN BRIEF', 28, 946, 13, INK, { weight: 0.16, tracking: 3 });
  const cols: Array<[number, string[]]> = [
    [28, ['CYCLONE AKVAN:', '370,000 FLEE', 'ODISHA \u2014 NO DEATHS']],
    [270, ['WORLD COURT', 'ACTION AFTER', 'MYANMAR RULING']],
    [512, ['FRANCE SEEKS', 'UNSC MEETING', 'ON KYIV']],
    [754, ['ESTONIA TO SHUT', 'RUSSIA BORDER', 'FROM 1 DEC']],
  ];
  for (const [cx, lines] of cols) {
    let y = 963;
    for (const ln of lines) {
      drawText(ln, cx, y, 12, INK, { weight: 0.13 });
      y += 15;
    }
  }
}

// ---------------------------------------------------------------- main
function main(): void {
  fillRect(0, 0, W, H, PAPER);
  drawMasthead();
  drawLead();
  drawHeadlineAndBody();
  drawKyivPanel();
  drawPolandPanel();
  drawMarketsPanel();
  drawFooter();

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG());
  writeFileSync(join(outDir, 'dossier.json'), JSON.stringify({
    title: 'THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026',
    version: 12,
    competition: 'news-image-20261121',
    date: '2026-11-21',
    size: [1024, 1024],
  }, null, 2) + '\n');
}

main();
