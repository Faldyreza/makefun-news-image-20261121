// news-image-20261121 v4 — "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// Fresh build (no source copied from v1/v2/v3). Node 22 stdlib only, no network.
// Writes one 1024x1024 PNG to $MAKEFUN_OUTPUT_DIR/entry.png (default /output)
// plus a deterministic dossier.json. Runs twice byte-identical.
//
// Facts (verified live during v1–v3 research; unchanged for v4, per task brief):
//  Lead: COP31 Antalya in overtime Sat 21 Nov — Friday deadline missed, draft drops
//        every mention of fossil fuels + the $120bn-a-year adaptation figure, ~200 nations.
//  Poland: Russian Kh-101 missile down at Nowy Lipowiec; NATO "grave violation"; no casualties.
//  Ukraine: Kyiv hit by 84 cruise missiles + 404 drones; 3 Dnipro bridges damaged;
//        power, heat, water cut.
//  Markets: US AI sell-off — S&P 500 -3.7% (enters correction), Nasdaq -5.3%, Nvidia -14%.
//  In brief: Cyclone Akvan — 370,000 evacuated in Odisha, no deaths reported;
//        World Court — states act after the Myanmar ruling;
//        France seeks a UN Security Council meeting on the Kyiv strikes;
//        Estonia to close its border with Russia from 1 December.
//
// v4 fixes vs v3 (the three requested improvements):
//  (a) Small text is now BOLD: body and IN BRIEF bullets use a heavy stroke weight
//      (0.20 of cap height) while headline/masthead keep the elegant thin stroke.
//  (b) The red "S&P -3.7%" label in the MARKETS thumbnail moved to the top-right
//      corner, far clear of the falling chart line (line is low on the right).
//  (c) The red strike on the DRAFT document is now ONE single clean straight
//      horizontal line across "FOSSIL FUELS".

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

type RGB = [number, number, number];

// ---------------------------------------------------------------- palette
const PAPER: RGB = [247, 240, 223];
const INK: RGB = [27, 23, 18];
const RED: RGB = [176, 32, 32];
const BLUE: RGB = [31, 78, 121];
const TEAL: RGB = [15, 118, 110];
const GOLD: RGB = [138, 109, 0];
const WALL: RGB = [234, 217, 172];
const FLOOR: RGB = [216, 190, 133];
const WOOD: RGB = [169, 113, 58];
const WOOD_DARK: RGB = [122, 78, 34];
const WOOD_RIM: RGB = [95, 58, 23];
const WHITE: RGB = [255, 253, 245];

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePNG(w: number, h: number, rgb: Buffer): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- rasteriser
// Renders at 2x supersampling, then box-downsamples to 1024x1024.
const SS = 2;
const W = 1024;
const H = 1024;

class Canvas {
  buf = new Float32Array(W * SS * H * SS * 3);
  constructor() {
    for (let i = 0; i < W * SS * H * SS; i++) {
      this.buf[i * 3] = PAPER[0];
      this.buf[i * 3 + 1] = PAPER[1];
      this.buf[i * 3 + 2] = PAPER[2];
    }
  }
  set(ix: number, iy: number, c: RGB): void {
    if (ix < 0 || iy < 0 || ix >= W * SS || iy >= H * SS) return;
    const o = (iy * W * SS + ix) * 3;
    this.buf[o] = c[0]; this.buf[o + 1] = c[1]; this.buf[o + 2] = c[2];
  }
  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const ix0 = Math.max(0, Math.floor(x * SS));
    const ix1 = Math.min(W * SS - 1, Math.ceil((x + w) * SS));
    const iy0 = Math.max(0, Math.floor(y * SS));
    const iy1 = Math.min(H * SS - 1, Math.ceil((y + h) * SS));
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = (iy + 0.5) / SS;
      if (py < y || py >= y + h) continue;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = (ix + 0.5) / SS;
        if (px >= x && px < x + w) this.set(ix, iy, c);
      }
    }
  }
  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    const ix0 = Math.max(0, Math.floor((cx - r) * SS));
    const ix1 = Math.min(W * SS - 1, Math.ceil((cx + r) * SS));
    const iy0 = Math.max(0, Math.floor((cy - r) * SS));
    const iy1 = Math.min(H * SS - 1, Math.ceil((cy + r) * SS));
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = (iy + 0.5) / SS;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = (ix + 0.5) / SS;
        const dx = (px - cx) / r;
        const dy = (py - cy) / r;
        if (dx * dx + dy * dy <= 1) this.set(ix, iy, c);
      }
    }
  }
  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    const ix0 = Math.max(0, Math.floor((cx - rx) * SS));
    const ix1 = Math.min(W * SS - 1, Math.ceil((cx + rx) * SS));
    const iy0 = Math.max(0, Math.floor((cy - ry) * SS));
    const iy1 = Math.min(H * SS - 1, Math.ceil((cy + ry) * SS));
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = (iy + 0.5) / SS;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = (ix + 0.5) / SS;
        const dx = (px - cx) / rx;
        const dy = (py - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(ix, iy, c);
      }
    }
  }
  fillPoly(pts: [number, number][], c: RGB): void {
    let minY = Infinity, maxY = -Infinity;
    for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const iy0 = Math.max(0, Math.floor(minY * SS));
    const iy1 = Math.min(H * SS - 1, Math.ceil(maxY * SS));
    for (let iy = iy0; iy <= iy1; iy++) {
      const y = (iy + 0.5) / SS;
      const xs: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        if ((y1 > y) !== (y2 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ix0 = Math.max(0, Math.ceil(xs[k] * SS - 0.5));
        const ix1 = Math.min(W * SS - 1, Math.floor(xs[k + 1] * SS - 0.5));
        for (let ix = ix0; ix <= ix1; ix++) this.set(ix, iy, c);
      }
    }
  }
  strokeSeg(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
    const r = w / 2 + 0.8;
    const ix0 = Math.max(0, Math.floor((Math.min(x1, x2) - r) * SS));
    const ix1 = Math.min(W * SS - 1, Math.ceil((Math.max(x1, x2) + r) * SS));
    const iy0 = Math.max(0, Math.floor((Math.min(y1, y2) - r) * SS));
    const iy1 = Math.min(H * SS - 1, Math.ceil((Math.max(y1, y2) + r) * SS));
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = (iy + 0.5) / SS;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = (ix + 0.5) / SS;
        let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const ddx = px - (x1 + t * dx);
        const ddy = py - (y1 + t * dy);
        if (ddx * ddx + ddy * ddy <= (w / 2) * (w / 2)) this.set(ix, iy, c);
      }
    }
  }
  strokePoly(pts: [number, number][], w: number, c: RGB, closed = false): void {
    const n = pts.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % n];
      this.strokeSeg(x1, y1, x2, y2, w, c);
    }
    for (const [x, y] of pts) this.fillCircle(x, y, w / 2, c);
  }
  strokeCircle(cx: number, cy: number, r: number, w: number, c: RGB): void {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    this.strokePoly(pts, w, c, true);
  }
  // Arched window interior: rows filled with the band colour for that y.
  fillArch(cx: number, topY: number, hw: number, botY: number, band: (y: number) => RGB): void {
    const iy0 = Math.max(0, Math.floor(topY * SS));
    const iy1 = Math.min(H * SS - 1, Math.ceil(botY * SS));
    for (let iy = iy0; iy <= iy1; iy++) {
      const y = (iy + 0.5) / SS;
      let half: number;
      if (y < topY + hw) {
        const dy = y - (topY + hw);
        half = Math.sqrt(Math.max(0, hw * hw - dy * dy));
      } else half = hw;
      const col = band(y);
      const ix0 = Math.max(0, Math.ceil((cx - half) * SS - 0.5));
      const ix1 = Math.min(W * SS - 1, Math.floor((cx + half) * SS - 0.5));
      for (let ix = ix0; ix <= ix1; ix++) this.set(ix, iy, col);
    }
  }
  downsample(): Buffer {
    const out = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < SS; dy++) {
          for (let dx = 0; dx < SS; dx++) {
            const o = (((y * SS + dy) * W * SS) + (x * SS + dx)) * 3;
            r += this.buf[o]; g += this.buf[o + 1]; b += this.buf[o + 2];
          }
        }
        const o = (y * W + x) * 3;
        out[o] = Math.round(r / (SS * SS));
        out[o + 1] = Math.round(g / (SS * SS));
        out[o + 2] = Math.round(b / (SS * SS));
      }
    }
    return out;
  }
}

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// ---------------------------------------------------------------- stroke font
// Vector glyphs on a 5-wide x 7-tall grid (x 0..4, y 0..6, baseline y=6).
// All text is uppercase by design. Weight = stroke width as fraction of cap height:
// thin (0.055–0.075) for masthead/headlines, heavy (0.20) for small body text.
type Glyph = [number, number][][];
const GLYPHS: Record<string, Glyph> = {
  A: [[[0, 6], [2, 0], [4, 6]], [[1, 4], [3, 4]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
  D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
  E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
  F: [[[0, 0], [0, 6]], [[4, 0], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[0, 0], [4, 0]], [[0, 6], [4, 6]]],
  J: [[[4, 0], [4, 5], [3, 6], [1, 6], [0, 5]]],
  K: [[[0, 0], [0, 6]], [[4, 0], [0, 3], [4, 6]]],
  L: [[[0, 0], [0, 6], [4, 6]]],
  M: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  N: [[[0, 6], [0, 0], [4, 6], [4, 0]]],
  O: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  P: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
  Q: [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]], [[2.5, 4], [4, 6]]],
  R: [[[0, 6], [0, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]], [[2, 3], [4, 6]]],
  S: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  T: [[[0, 0], [4, 0]], [[2, 0], [2, 6]]],
  U: [[[0, 0], [0, 5], [1, 6], [3, 6], [4, 5], [4, 0]]],
  V: [[[0, 0], [2, 6], [4, 0]]],
  W: [[[0, 0], [1, 6], [2, 3], [3, 6], [4, 0]]],
  X: [[[0, 0], [4, 6]], [[4, 0], [0, 6]]],
  Y: [[[0, 0], [2, 3], [4, 0]], [[2, 3], [2, 6]]],
  Z: [[[0, 0], [4, 0], [0, 6], [4, 6]]],
  "0": [[[1, 0], [3, 0], [4, 1], [4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0]]],
  "1": [[[1, 1], [2, 0], [2, 6]], [[0, 6], [4, 6]]],
  "2": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [0, 6], [4, 6]]],
  "3": [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]], [[3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  "4": [[[3, 0], [0, 4], [4, 4]], [[3, 0], [3, 6]]],
  "5": [[[4, 0], [0, 0], [0, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]]],
  "6": [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 6], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 4]]],
  "7": [[[0, 0], [4, 0], [2, 6]]],
  "8": [[[1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0]], [[1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3]]],
  "9": [[[1, 0], [3, 0], [4, 1], [4, 6], [3, 6]], [[0, 1], [0, 3], [1, 4], [3, 4]]],
  ".": [[[0.8, 5.7], [0.8, 6.3]]],
  ",": [[[0.8, 5.5], [0.8, 6.2], [-0.2, 7]]],
  ":": [[[0.8, 1.7], [0.8, 2.3]], [[0.8, 4.7], [0.8, 5.3]]],
  ";": [[[0.8, 1.7], [0.8, 2.3]], [[0.8, 4.5], [0.8, 5.5], [-0.2, 6.8]]],
  "'": [[[1.2, 0], [0.8, 1.8]]],
  '"': [[[0.6, 0], [0.6, 1.8]], [[2.2, 0], [2.2, 1.8]]],
  "!": [[[1, 0], [1, 4]], [[1, 5.7], [1, 6.3]]],
  "?": [[[0.5, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [2, 3.2]], [[2, 5.7], [2, 6.3]]],
  "-": [[[0, 3], [4, 3]]],
  "—": [[[0, 3], [6, 3]]],
  "(": [[[2, 0], [1, 1], [1, 5], [2, 6]]],
  ")": [[[0, 0], [1, 1], [1, 5], [0, 6]]],
  "/": [[[4, 0], [0, 6]]],
  "%": [[[1, 0], [3, 6]], [[0.4, 0.6], [1.2, 1.4]], [[2.8, 4.6], [3.6, 5.4]]],
  "&": [[[3, 0], [2, 0], [1, 1], [1, 2], [2, 3], [4, 3]], [[2, 3], [4, 6]], [[0, 5], [2, 6], [4, 5]]],
  $: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 2], [1, 3], [3, 3], [4, 4], [4, 5], [3, 6], [1, 6], [0, 5]], [[2, -1], [2, 7]]],
  "•": [[[2, 2.5], [2.5, 3], [2, 3.5], [1.5, 3], [2, 2.5]]],
  "+": [[[2, 1], [2, 5]], [[0, 3], [4, 3]]],
  "=": [[[0, 2], [4, 2]], [[0, 4], [4, 4]]],
};
const NARROW_ADV: Record<string, number> = {
  ".": 2, ",": 2, ":": 2.2, ";": 2.2, "'": 1.8, '"': 3, "!": 2.5, "(": 2.5, ")": 2.5, "•": 3,
};
function normChar(ch: string): string {
  if (ch === "’" || ch === "‘") return "'";
  if (ch === "−" || ch === "–") return "-";
  return ch;
}
function advance(ch: string): number {
  const c = normChar(ch);
  if (c === " ") return 2.5;
  if (c === "—") return 7;
  if (c === "I" || c === "1") return 3.5;
  if (c in NARROW_ADV) return NARROW_ADV[c];
  return 5;
}
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += advance(ch) * (size / 7);
  return w;
}
function drawText(cv: Canvas, x: number, y: number, s: string, size: number, weight: number, c: RGB, align: "l" | "c" | "r" = "l"): void {
  const w = textWidth(s, size);
  let cx = align === "c" ? x - w / 2 : align === "r" ? x - w : x;
  const scale = size / 7;
  const lw = Math.max(1.1, size * weight);
  for (const raw of s) {
    const ch = normChar(raw);
    const g = GLYPHS[ch];
    if (g) {
      for (const stroke of g) {
        const pts: [number, number][] = stroke.map(([gx, gy]) => [cx + gx * scale, y - 6 * scale + gy * scale]);
        cv.strokePoly(pts, lw, c);
      }
    }
    cx += advance(raw) * scale;
  }
}
function wrap(s: string, size: number, maxW: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (textWidth(t, size) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- scene
const SUNSET: RGB = [249, 192, 74];
const SUNSET2: RGB = [243, 154, 46];
const SUNSET3: RGB = [232, 111, 53];
const SUN: RGB = [255, 242, 174];
const SKYLINE: RGB = [74, 50, 32];
const MULLION: RGB = [122, 90, 48];
const ARCH: RGB = [90, 64, 38];
const SKIN1: RGB = [232, 185, 138];
const SKIN2: RGB = [224, 172, 120];
const SKIN3: RGB = [210, 150, 100];
const HAIR_BLACK: RGB = [30, 24, 20];
const HAIR_GREY: RGB = [176, 176, 176];
const NAVY: RGB = [38, 58, 96];
const CHARCOAL: RGB = [58, 58, 60];
const MAROON: RGB = [122, 44, 44];
const TIE_RED: RGB = [176, 32, 32];
const TIE_BLUE: RGB = [31, 78, 121];
const TIE_GOLD: RGB = [200, 150, 40];

function drawWindow(cv: Canvas, cx: number, topY: number, hw: number, botY: number): void {
  cv.fillArch(cx, topY, hw, botY, (y) => (y < topY + 60 ? SUNSET : y < topY + 115 ? SUNSET2 : SUNSET3));
  // sun
  cv.fillCircle(cx, topY + hw + 42, 26, SUN);
  // skyline silhouettes
  const blds: [number, number, number, number][] = [
    [-70, 478, 30, 27], [-38, 466, 26, 39], [-8, 476, 34, 29], [30, 464, 28, 41], [62, 480, 24, 25],
  ];
  for (const [dx, by, bw, bh] of blds) {
    const bx = cx + dx;
    const x0 = Math.max(cx - hw + 2, bx);
    const x1 = Math.min(cx + hw - 2, bx + bw);
    if (x1 > x0) cv.fillRect(x0, by, x1 - x0, botY - by, SKYLINE);
  }
  // mullions
  cv.strokeSeg(cx, topY + 12, cx, botY, 3, MULLION);
  cv.strokeSeg(cx - hw + 2, topY + hw + 22, cx + hw - 2, topY + hw + 22, 3, MULLION);
  // arch outline
  const outline: [number, number][] = [[cx - hw, botY], [cx - hw, topY + hw], ...arcPts(cx, topY + hw, hw, Math.PI, 2 * Math.PI, 24), [cx + hw, botY]];
  cv.strokePoly(outline, 4, ARCH);
}

function drawDelegate(cv: Canvas, cx: number, suit: RGB, tie: RGB, kind: "black" | "grey" | "hijab" | "bald", skin: RGB): void {
  // body (shoulders) — lower part will be covered by the table
  cv.fillPoly([[cx - 40, 542], [cx - 32, 484], [cx + 32, 484], [cx + 40, 542]], suit);
  // shirt + tie
  cv.fillPoly([[cx - 10, 485], [cx + 10, 485], [cx, 506]], WHITE);
  cv.fillPoly([[cx - 4, 488], [cx + 4, 488], [cx + 6, 504], [cx, 518], [cx - 6, 504]], tie);
  if (kind === "hijab") {
    cv.fillCircle(cx, 450, 31, TEAL);
    cv.fillPoly([[cx - 31, 448], [cx - 35, 496], [cx - 22, 500], [cx - 24, 456]], TEAL);
    cv.fillPoly([[cx + 31, 448], [cx + 35, 496], [cx + 22, 500], [cx + 24, 456]], TEAL);
  }
  // head
  cv.fillCircle(cx, 452, kind === "hijab" ? 23 : 27, skin);
  if (kind === "black") {
    cv.fillPoly(arcPts(cx, 452, 27, Math.PI, 2 * Math.PI, 20), HAIR_BLACK);
  } else if (kind === "grey") {
    cv.fillPoly(arcPts(cx, 452, 27, Math.PI, 2 * Math.PI, 20), HAIR_GREY);
  }
  // eyes + smile
  cv.fillCircle(cx - 9, 449, 2.2, INK);
  cv.fillCircle(cx + 9, 449, 2.2, INK);
  cv.strokePoly(arcPts(cx, 456, 7, 0.25, Math.PI - 0.25, 10), 2, INK);
  if (kind === "grey") {
    cv.fillEllipse(cx, 463, 9, 3.5, [107, 107, 107]); // moustache
  }
  if (kind === "bald") {
    cv.strokeCircle(cx - 9, 449, 7, 2, INK);
    cv.strokeCircle(cx + 9, 449, 7, 2, INK);
    cv.strokeSeg(cx - 2, 449, cx + 2, 449, 2, INK);
  }
}

function drawScene(cv: Canvas): void {
  // wall + floor
  cv.fillRect(28, 314, 968, 270, WALL);
  cv.fillRect(28, 505, 968, 79, FLOOR);
  // bunting: 16 flags on a sagging string
  const flagCols: RGB[] = [[192, 32, 32], [31, 78, 121], [46, 125, 50], [232, 134, 11], [123, 45, 139], [15, 118, 110]];
  const strPts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    strPts.push([36 + t * 952, 322 + 14 * Math.sin(Math.PI * t)]);
  }
  cv.strokePoly(strPts, 2, INK);
  for (let i = 0; i < 16; i++) {
    const t = (i + 0.5) / 16;
    const x = 36 + t * 952;
    const y = 322 + 14 * Math.sin(Math.PI * t);
    cv.fillPoly([[x - 7, y + 1], [x + 7, y + 1], [x, y + 17]], flagCols[i % flagCols.length]);
  }
  // COP31 logo (left of first window)
  drawText(cv, 48, 388, "COP31", 32, 0.2, BLUE);
  drawText(cv, 50, 410, "ANTALYA", 15, 0.2, INK);
  // three arched sunset windows
  drawWindow(cv, 260, 335, 85, 505);
  drawWindow(cv, 512, 335, 85, 505);
  drawWindow(cv, 764, 335, 85, 505);
  // wall clock, near midnight + OVERTIME
  cv.fillCircle(912, 372, 34, WHITE);
  cv.strokeCircle(912, 372, 34, 3, INK);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x1 = 912 + 28 * Math.sin(a), y1 = 372 - 28 * Math.cos(a);
    const x2 = 912 + 31 * Math.sin(a), y2 = 372 - 31 * Math.cos(a);
    cv.strokeSeg(x1, y1, x2, y2, 2, INK);
  }
  // 11:58 — hour hand just before 12, minute hand at 58 minutes
  cv.strokeSeg(912, 372, 912 - 18 * Math.sin(0.02), 372 - 18 * Math.cos(0.02), 3, INK);
  cv.strokeSeg(912, 372, 912 - 26 * Math.sin(0.21), 372 - 26 * Math.cos(0.21), 3, INK);
  cv.fillCircle(912, 372, 3, INK);
  drawText(cv, 912, 428, "OVERTIME", 17, 0.2, RED, "c");
  // four faced delegates
  drawDelegate(cv, 300, NAVY, TIE_RED, "black", SKIN1);
  drawDelegate(cv, 458, CHARCOAL, TIE_BLUE, "grey", SKIN2);
  drawDelegate(cv, 616, TEAL, WHITE, "hijab", SKIN3);
  drawDelegate(cv, 774, MAROON, TIE_GOLD, "bald", SKIN1);
  // round wooden table
  cv.fillEllipse(512, 548, 385, 40, WOOD_DARK);
  cv.fillEllipse(512, 544, 385, 36, WOOD);
  // DRAFT document — single clean straight red strike across FOSSIL FUELS
  cv.fillRect(215, 518, 120, 44, WHITE);
  cv.strokePoly([[215, 518], [335, 518], [335, 562], [215, 562], [215, 518]], 1.5, INK);
  drawText(cv, 225, 536, "DRAFT", 15, 0.2, INK);
  drawText(cv, 223, 555, "FOSSIL FUELS", 12, 0.2, INK);
  cv.strokeSeg(220, 550.5, 330, 550.5, 3, RED); // ONE clean straight line
  // small papers + microphones on the table
  cv.fillRect(455, 526, 64, 24, WHITE);
  cv.strokeSeg(462, 534, 512, 534, 1.5, [150, 150, 150]);
  cv.strokeSeg(462, 542, 505, 542, 1.5, [150, 150, 150]);
  cv.fillRect(655, 526, 64, 24, WHITE);
  cv.strokeSeg(662, 534, 712, 534, 1.5, [150, 150, 150]);
  cv.strokeSeg(662, 542, 705, 542, 1.5, [150, 150, 150]);
  cv.strokeSeg(395, 516, 395, 538, 2.5, INK);
  cv.fillCircle(395, 513, 5, INK);
  cv.strokeSeg(625, 516, 625, 538, 2.5, INK);
  cv.fillCircle(625, 513, 5, INK);
  // globe on a small side table at the far right, clear of the delegates
  cv.fillRect(906, 546, 58, 8, WOOD_DARK);
  cv.fillRect(912, 554, 5, 30, WOOD_DARK);
  cv.fillRect(953, 554, 5, 30, WOOD_DARK);
  cv.fillCircle(935, 520, 26, [46, 111, 176]);
  cv.fillEllipse(928, 512, 9, 6, [88, 164, 71]);
  cv.fillEllipse(942, 528, 7, 5, [88, 164, 71]);
  cv.fillEllipse(930, 532, 5, 4, [88, 164, 71]);
  cv.strokePoly(arcPts(935, 520, 18, 0.5, Math.PI - 0.5, 12), 1.5, [200, 225, 240]);
}

// ---------------------------------------------------------------- thumbnails
function drawPolandThumb(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, [20, 31, 51]);
  const stars: [number, number][] = [
    [40, 8], [90, 20], [150, 6], [210, 16], [260, 10], [60, 40], [180, 34], [240, 42],
    [110, 52], [280, 30], [30, 60], [200, 58], [150, 78], [90, 82], [250, 70],
  ];
  for (const [sx, sy] of stars) cv.fillCircle(x + sx, y + sy, 1.6, [240, 240, 230]);
  // moon
  cv.fillCircle(x + 284, y + 18, 10, [245, 240, 220]);
  cv.fillCircle(x + 281, y + 15, 2.5, [210, 205, 190]);
  cv.fillCircle(x + 287, y + 21, 2, [210, 205, 190]);
  // missile trail + missile
  cv.strokeSeg(x + 67, y + 62, x + 282, y + 17, 2.5, [245, 197, 66]);
  for (const t of [0.25, 0.45, 0.65, 0.85]) {
    const px = x + 67 + (282 - 67) * t;
    const py = y + 62 + (17 - 62) * t;
    cv.fillCircle(px, py, 2.5, [245, 197, 66]);
  }
  cv.fillEllipse(x + 286, y + 16, 9, 5, [255, 253, 245]);
  // explosion glow at Nowy Lipowiec
  cv.fillCircle(x + 67, y + 62, 13, [242, 140, 40]);
  cv.fillCircle(x + 67, y + 62, 8, [246, 197, 66]);
  cv.fillCircle(x + 67, y + 62, 4, [255, 243, 176]);
  drawText(cv, x + 8, y + 92, "NOWY LIPOWIEC", 14, 0.2, WHITE);
}
function drawUkraineThumb(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, 62, [51, 38, 26]);
  cv.fillRect(x, y + 62, w, h - 62, [46, 90, 136]);
  // bridge band with three arches over the Dnipro
  cv.fillRect(x, y + 28, w, 34, [23, 19, 15]);
  for (const ax of [54, 156, 258]) {
    cv.fillCircle(x + ax, y + 62, 20, [46, 90, 136]);
  }
  // explosions on the bridge
  cv.fillCircle(x + 84, y + 34, 11, [242, 140, 40]);
  cv.fillCircle(x + 84, y + 34, 6, [246, 197, 66]);
  cv.fillCircle(x + 229, y + 30, 13, [242, 140, 40]);
  cv.fillCircle(x + 229, y + 30, 7, [246, 197, 66]);
  drawText(cv, x + 8, y + 92, "KYIV", 14, 0.2, WHITE);
}
function drawMarketsThumb(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, WHITE);
  for (let gx = 38; gx < w; gx += 38) cv.strokeSeg(x + gx, y, x + gx, y + h, 1, [232, 226, 210]);
  for (let gy = 24; gy < h; gy += 24) cv.strokeSeg(x, y + gy, x + w, y + gy, 1, [232, 226, 210]);
  // falling chart line — high at left, low at right
  const pts: [number, number][] = [
    [x + 12, y + 24], [x + 46, y + 32], [x + 76, y + 27], [x + 106, y + 44],
    [x + 136, y + 40], [x + 166, y + 62], [x + 196, y + 60], [x + 226, y + 77],
    [x + 256, y + 84], [x + 288, y + 94],
  ];
  cv.strokePoly(pts, 3, RED);
  cv.fillPoly([[x + 294, y + 96], [x + 280, y + 88], [x + 284, y + 102]], RED);
  // (b) label moved to the TOP-RIGHT, far clear of the falling line (line is low there)
  drawText(cv, x + w - 14, y + 24, "S&P −3.7%", 17, 0.2, RED, "r");
  drawText(cv, x + 8, y + 92, "NASDAQ −5.3%", 14, 0.2, INK);
}

// ---------------------------------------------------------------- compose
function main(): void {
  const cv = new Canvas();
  const M = 28;
  // rules
  cv.fillRect(M, 14, 968, 2, INK);
  cv.fillRect(M, 152, 968, 3, INK);
  cv.fillRect(M, 306, 968, 2, INK);
  cv.fillRect(M, 594, 968, 2, INK);
  cv.fillRect(M, 876, 968, 2, INK);
  cv.fillRect(M, 1002, 968, 2, INK);
  // masthead + dateline — elegant thin stroke
  drawText(cv, 512, 116, "THE WORLD", 92, 0.055, INK, "c");
  drawText(cv, M, 140, "SATURDAY, 21 NOVEMBER 2026", 22, 0.13, INK);
  drawText(cv, 996, 140, "IN ONE IMAGE", 22, 0.13, INK, "r");
  // lead headline + deck
  drawText(cv, 512, 208, "COP31 TALKS RUN INTO OVERTIME", 46, 0.07, INK, "c");
  drawText(cv, 512, 238, "ANTALYA — WITH FRIDAY'S DEADLINE MISSED, NEARLY 200 NATIONS", 20, 0.11, INK, "c");
  drawText(cv, 512, 264, "RACE TO PRODUCE A NEW DRAFT THAT DROPS EVERY MENTION", 20, 0.11, INK, "c");
  drawText(cv, 512, 290, "OF FOSSIL FUELS — AND THE $120BN-A-YEAR ADAPTATION FIGURE.", 20, 0.11, INK, "c");
  // lead scene
  drawScene(cv);
  // secondary stories
  const cols = [M, 356, 684];
  const kickers: [string, RGB][] = [["POLAND", RED], ["UKRAINE", BLUE], ["MARKETS", GOLD]];
  for (let i = 0; i < 3; i++) drawText(cv, cols[i], 620, kickers[i][0], 23, 0.2, kickers[i][1]);
  drawPolandThumb(cv, cols[0], 628, 312, 98);
  drawUkraineThumb(cv, cols[1], 628, 312, 98);
  drawMarketsThumb(cv, cols[2], 628, 312, 98);
  for (let i = 0; i < 3; i++) {
    cv.strokePoly([[cols[i], 628], [cols[i] + 312, 628], [cols[i] + 312, 726], [cols[i], 726], [cols[i], 628]], 2, INK);
  }
  const headlines: [string, string][] = [
    ["RUSSIAN MISSILE FALLS", "IN POLAND"],
    ["KYIV HIT BY MISSILES", "AND DRONES"],
    ["AI SELL-OFF DRAGS US", "STOCKS DOWN"],
  ];
  for (let i = 0; i < 3; i++) {
    drawText(cv, cols[i], 752, headlines[i][0], 22, 0.11, INK);
    drawText(cv, cols[i], 778, headlines[i][1], 22, 0.11, INK);
  }
  // (a) body text — HEAVY weight so it stays readable when shrunk
  const bodies = [
    "KH-101 COMES DOWN AT NOWY LIPOWIEC. NATO: A 'GRAVE VIOLATION'. NO CASUALTIES.",
    "84 CRUISE MISSILES AND 404 DRONES. THREE DNIPRO BRIDGES DAMAGED. POWER, HEAT, WATER CUT.",
    "S&P 500 DOWN 3.7%, ENTERING CORRECTION. NASDAQ DOWN 5.3%. NVIDIA FALLS 14%.",
  ];
  for (let i = 0; i < 3; i++) {
    const lines = wrap(bodies[i], 18, 312);
    console.log(`body[${i}] lines=${lines.length} ${JSON.stringify(lines)}`);
    lines.slice(0, 4).forEach((ln, j) => drawText(cv, cols[i], 802 + j * 20, ln, 18, 0.2, INK));
  }
  // footer IN BRIEF — label on its own line, clear gap, then 4 heavy-weight columns
  drawText(cv, M, 904, "IN BRIEF", 24, 0.11, INK);
  const briefs = [
    "CYCLONE AKVAN — 370,000 EVACUATED IN ODISHA. NO DEATHS REPORTED.",
    "WORLD COURT — STATES ACT AFTER THE MYANMAR RULING.",
    "FRANCE SEEKS A UN SECURITY COUNCIL MEETING ON THE KYIV STRIKES.",
    "ESTONIA TO CLOSE ITS BORDER WITH RUSSIA FROM 1 DECEMBER.",
  ];
  const bx = [M, 273, 518, 763];
  for (let i = 0; i < 4; i++) {
    const bulletW = textWidth("• ", 17);
    const lines = wrap(briefs[i], 17, 233 - bulletW);
    console.log(`brief[${i}] lines=${lines.length} ${JSON.stringify(lines)}`);
    lines.slice(0, 4).forEach((ln, j) => {
      if (j === 0) drawText(cv, bx[i], 928, "•", 17, 0.2, INK);
      drawText(cv, bx[i] + (j === 0 ? bulletW : bulletW), 928 + j * 20, ln, 17, 0.2, INK);
    });
  }
  // output
  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(W, H, cv.downsample());
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  const dossier = {
    competition: "news-image-20261121",
    edition: "v4",
    date: "SATURDAY, 21 NOVEMBER 2026",
    size: [1024, 1024],
    bytes: png.length,
    sha256: crypto.createHash("sha256").update(png).digest("hex"),
    fixes_vs_v3: [
      "small body + IN BRIEF text uses heavy stroke weight 0.20 (was thin)",
      "S&P -3.7% label moved to top-right of MARKETS thumbnail, clear of chart line",
      "DRAFT strike is one single clean straight red line across FOSSIL FUELS",
    ],
    stories: [
      "COP31 Antalya overtime — Friday deadline missed, draft drops fossil-fuel mentions + $120bn-a-year adaptation figure, ~200 nations",
      "Russian Kh-101 missile down at Nowy Lipowiec, Poland — NATO 'grave violation', no casualties",
      "Kyiv hit by 84 cruise missiles + 404 drones — 3 Dnipro bridges damaged, power/heat/water cut",
      "US AI sell-off — S&P 500 -3.7% (correction), Nasdaq -5.3%, Nvidia -14%",
      "In brief: Cyclone Akvan (370,000 evacuated in Odisha, no deaths); World Court acts after Myanmar ruling; France seeks UN Security Council meeting on Kyiv strikes; Estonia to close Russia border from 1 December",
    ],
  };
  fs.writeFileSync(path.join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
  console.log(`entry.png ${png.length} bytes sha256=${dossier.sha256}`);
}

main();
