// main.ts — "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// make.fun news-image-20261121 entry. Node 22 stdlib only, no network.
// Draws a 1024x1024 newspaper front page procedurally (2x supersampled
// software rasteriser + hand-written PNG encoder) and writes
// /output/entry.png + /output/dossier.json. Deterministic: same bytes
// on every run (no clock, no randomness, no I/O besides the two outputs).
//
// VERIFIED FACTS (live web research, 21 Nov 2026; sources in dossier.json):
// - LEAD: COP31 climate talks in Antalya, Turkiye, missed their scheduled
//   Friday finish and ran into overtime on Saturday 21 Nov 2026. The latest
//   draft (published Thursday by co-host Australia) drops every mention of
//   fossil fuels and drops the $120bn-a-year adaptation finance figure.
//   Nearly 200 countries; a new draft was due Saturday morning. (AP, CNN,
//   Reuters, BBC live, 21 Nov 2026)
// - POLAND: two Russian missiles and a suspected jet-powered drone came down
//   in Poland on Friday 20 Nov during the mass attack on Ukraine. A Kh-101
//   cruise missile fell near Nowy Lipowiec; NATO chief Mark Rutte called it
//   a "grave violation"; PM Donald Tusk called it a provocation. No one was
//   hurt in Poland. (AP, Reuters, 20 Nov 2026)
// - KYIV: Russia fired 84 cruise missiles and 404 drones at Ukraine in one
//   overnight barrage; three Dnipro bridges in Kyiv were damaged, and parts
//   of the capital lost power, heat and water. At least 8 killed.
//   (Kyiv Independent, AP, BBC, 20 Nov 2026)
// - MARKETS: US stocks fell Friday 20 Nov — S&P 500 down 3.7% into
//   correction, Nasdaq down 5.3% and negative for the year, Nvidia down 14%,
//   as the AI trade unwound. (AP/NPR, CNN, WSJ, Investopedia, 20 Nov 2026)
// - IN BRIEF: Cyclone Akvan landfall near Gopalpur, Odisha — 370,000
//   evacuated, no deaths reported (IMD); rights groups press for action
//   after the ICJ found Myanmar guilty of Rohingya genocide (19 Nov ruling);
//   France seeks a UN Security Council meeting over the Kyiv strikes
//   (Reuters, 20 Nov); Estonia to shut its road border with Russia from
//   1 December after an alleged arson attack (Reuters, 20 Nov); cricket —
//   Jaiswal 85 and Rahul 52 not out, 130-run stand, India 159/1 replying to
//   New Zealand's 368 in Wellington (Cricbuzz, 20 Nov).

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------- canvas
const W = 1024;
const H = 1024;
const SS = 2; // supersample factor (draw at 2048, downsample to 1024)

type RGB = [number, number, number];
type Pt = [number, number];

const PAPER: RGB = [246, 241, 230];
const INK: RGB = [25, 23, 19];
const RED: RGB = [179, 38, 30];
const SKY: RGB = [216, 231, 241];
const OCEAN: RGB = [47, 109, 163];
const LAND: RGB = [87, 167, 115];
const SUN: RGB = [232, 134, 46];
const WOOD: RGB = [107, 79, 53];
const RIVER: RGB = [127, 168, 201];
const GREY: RGB = [154, 149, 138];
const LGREY: RGB = [201, 194, 178];
const NIGHT: RGB = [34, 53, 77];
const WHITE: RGB = [253, 252, 248];
const GRID: RGB = [227, 221, 208];

const buf = new Uint8Array(W * SS * H * SS * 3);
const BW = W * SS;

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= BW || y >= H * SS) return;
  const i = (y * BW + x) * 3;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
}

// Filled disc, centre/radius in 2x pixels.
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const r2 = r * r;
  const y0 = Math.max(0, Math.ceil(cy - r));
  const y1 = Math.min(H * SS - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dx = Math.sqrt(Math.max(0, r2 - dy * dy));
    const x0 = Math.max(0, Math.ceil(cx - dx));
    const x1 = Math.min(BW - 1, Math.floor(cx + dx));
    let i = (y * BW + x0) * 3;
    for (let x = x0; x <= x1; x++) {
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      i += 3;
    }
  }
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.round(x * SS);
  const y0 = Math.round(y * SS);
  const x1 = Math.round((x + w) * SS);
  const y1 = Math.round((y + h) * SS);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}

// Thick line (1024-space coords, width in 1024 px) with round caps.
function line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
  const ax = x1 * SS;
  const ay = y1 * SS;
  const bx = x2 * SS;
  const by = y2 * SS;
  const r = Math.max(0.75, (w * SS) / 2);
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const step = Math.max(1, r * 0.55);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    disc(ax + dx * t, ay + dy * t, r, c);
  }
}

function polyline(pts: Pt[], w: number, c: RGB, close: boolean): void {
  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  }
  if (close && n > 2) line(pts[n - 1][0], pts[n - 1][1], pts[0][0], pts[0][1], w, c);
}

// Even-odd scanline polygon fill (1024-space coords).
function poly(pts: Pt[], c: RGB): void {
  const p = pts.map(([x, y]): Pt => [x * SS, y * SS]);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of p) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H * SS - 1, Math.ceil(maxY));
  for (let y = y0; y <= y1; y++) {
    const xs: number[] = [];
    for (let i = 0; i < p.length; i++) {
      const [x1, y1p] = p[i];
      const [x2, y2p] = p[(i + 1) % p.length];
      if ((y1p <= y && y2p > y) || (y2p <= y && y1p > y)) {
        xs.push(x1 + ((y - y1p) / (y2p - y1p)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(BW - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) setPx(x, y, c);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  const cx2 = cx * SS;
  const cy2 = cy * SS;
  const rx2 = rx * SS;
  const ry2 = ry * SS;
  const y0 = Math.max(0, Math.ceil(cy2 - ry2));
  const y1 = Math.min(H * SS - 1, Math.floor(cy2 + ry2));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy2) / ry2;
    const dx = rx2 * Math.sqrt(Math.max(0, 1 - dy * dy));
    const x0 = Math.max(0, Math.ceil(cx2 - dx));
    const x1 = Math.min(BW - 1, Math.floor(cx2 + dx));
    for (let x = x0; x <= x1; x++) setPx(x, y, c);
  }
}

function ring(cx: number, cy: number, r: number, w: number, c: RGB): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  polyline(pts, w, c, true);
}

// Four-point burst star (impact marker).
function star4(cx: number, cy: number, r: number, c: RGB): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.32;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  poly(pts, c);
}

// ---------------------------------------------------------------- font
// Hand-authored stroke font: each glyph is polylines on a 6-wide, 10-tall
// grid (y=0 top, y=10 baseline; descenders may reach y=12). All image text
// is uppercase, so only capitals, digits and the punctuation used below.
const GLYPHS: Record<string, Pt[][]> = {
  A: [[[0, 10], [3, 0], [6, 10]], [[1.7, 6.6], [4.3, 6.6]]],
  B: [[[0, 10], [0, 0], [4, 0], [5.4, 1.4], [5.4, 3.6], [4, 5], [0, 5]], [[4, 5], [5.4, 6.4], [5.4, 8.6], [4, 10], [0, 10]]],
  C: [[[5.4, 1.6], [4, 0], [2, 0], [0.6, 1.4], [0.6, 8.6], [2, 10], [4, 10], [5.4, 8.4]]],
  D: [[[0, 10], [0, 0], [3.6, 0], [5.4, 1.8], [5.4, 8.2], [3.6, 10], [0, 10]]],
  E: [[[5.4, 0], [0, 0], [0, 10], [5.4, 10]], [[0, 5], [4, 5]]],
  F: [[[0, 10], [0, 0], [5.4, 0]], [[0, 5], [4, 5]]],
  G: [[[5.4, 1.6], [4, 0], [2, 0], [0.6, 1.4], [0.6, 8.6], [2, 10], [4, 10], [5.4, 8.4], [5.4, 5.4], [3.2, 5.4]]],
  H: [[[0, 0], [0, 10]], [[6, 0], [6, 10]], [[0, 5], [6, 5]]],
  I: [[[3, 0], [3, 10]], [[1.4, 0], [4.6, 0]], [[1.4, 10], [4.6, 10]]],
  J: [[[5.4, 0], [5.4, 8.4], [4, 10], [2, 10], [0.6, 8.4]]],
  K: [[[0, 0], [0, 10]], [[5.4, 0], [0.6, 5], [5.4, 10]]],
  L: [[[0, 0], [0, 10], [5.4, 10]]],
  M: [[[0, 10], [0, 0], [3, 4.6], [6, 0], [6, 10]]],
  N: [[[0, 10], [0, 0], [6, 10], [6, 0]]],
  O: [[[1.6, 0], [4.4, 0], [5.8, 1.4], [5.8, 8.6], [4.4, 10], [1.6, 10], [0.2, 8.6], [0.2, 1.4], [1.6, 0]]],
  P: [[[0, 10], [0, 0], [4, 0], [5.4, 1.4], [5.4, 3.6], [4, 5], [0, 5]]],
  Q: [[[1.6, 0], [4.4, 0], [5.8, 1.4], [5.8, 8.6], [4.4, 10], [1.6, 10], [0.2, 8.6], [0.2, 1.4], [1.6, 0]], [[3.8, 7], [6.2, 10.6]]],
  R: [[[0, 10], [0, 0], [4, 0], [5.4, 1.4], [5.4, 3.6], [4, 5], [0, 5]], [[3.6, 5], [6, 10]]],
  S: [[[5.4, 1.6], [4, 0], [2, 0], [0.6, 1.4], [0.6, 3.4], [2, 4.8], [4, 4.8], [5.4, 6.2], [5.4, 8.6], [4, 10], [2, 10], [0.6, 8.4]]],
  T: [[[0, 0], [6, 0]], [[3, 0], [3, 10]]],
  U: [[[0, 0], [0, 8.6], [1.6, 10], [4.4, 10], [6, 8.6], [6, 0]]],
  V: [[[0, 0], [3, 10], [6, 0]]],
  W: [[[0, 0], [1.5, 10], [3, 4.2], [4.5, 10], [6, 0]]],
  X: [[[0, 0], [6, 10]], [[6, 0], [0, 10]]],
  Y: [[[0, 0], [3, 4.6], [6, 0]], [[3, 4.6], [3, 10]]],
  Z: [[[0, 0], [6, 0], [0, 10], [6, 10]]],
  "0": [[[1.6, 0], [4.4, 0], [5.8, 1.4], [5.8, 8.6], [4.4, 10], [1.6, 10], [0.2, 8.6], [0.2, 1.4], [1.6, 0]], [[1.6, 8.4], [4.4, 1.6]]],
  "1": [[[1.6, 2.2], [3, 0], [3, 10]], [[1.4, 10], [4.6, 10]]],
  "2": [[[0.6, 2.2], [1.6, 0.6], [4.4, 0.6], [5.4, 2], [5.4, 3.6], [0.4, 10], [5.6, 10]]],
  "3": [[[0.6, 1.6], [2, 0], [4, 0], [5.4, 1.4], [5.4, 3.6], [4, 5], [2, 5]], [[4, 5], [5.4, 6.4], [5.4, 8.6], [4, 10], [2, 10], [0.6, 8.4]]],
  "4": [[[4.6, 0], [0.2, 7.4], [5.6, 7.4]], [[4.6, 0], [4.6, 10]]],
  "5": [[[5.4, 0], [0.6, 0], [0.6, 4.4], [4, 4.4], [5.4, 5.8], [5.4, 8.6], [4, 10], [1.6, 10], [0.6, 8.4]]],
  "6": [[[5.4, 1.6], [4, 0], [2, 0], [0.6, 1.8], [0.2, 5], [0.2, 8.6], [1.6, 10], [4, 10], [5.4, 8.6], [5.4, 6.4], [4, 5], [1.6, 5]]],
  "7": [[[0, 0], [6, 0], [3, 10]]],
  "8": [[[1.6, 0], [4.4, 0], [5.6, 1.4], [5.6, 3.4], [4.4, 5], [1.6, 5], [0.4, 3.4], [0.4, 1.4], [1.6, 0]], [[1.6, 5], [4.4, 5], [5.6, 6.6], [5.6, 8.6], [4.4, 10], [1.6, 10], [0.4, 8.6], [0.4, 6.6], [1.6, 5]]],
  "9": [[[0.6, 8.4], [2, 10], [4, 10], [5.4, 8.2], [5.8, 5], [5.8, 1.4], [4.4, 0], [1.6, 0], [0.4, 1.4], [0.4, 3.6], [1.6, 5], [4.4, 5]]],
  ".": [[[2.8, 9.4], [3.2, 9.4]]],
  ",": [[[2.8, 9.4], [3.2, 9.4]], [[3, 9.6], [2, 11.8]]],
  ":": [[[2.8, 3.4], [3.2, 3.4]], [[2.8, 9.4], [3.2, 9.4]]],
  ";": [[[2.8, 3.4], [3.2, 3.4]], [[3, 9.2], [2.2, 11.6]]],
  "'": [[[3.6, 0], [2.6, 3]]],
  "-": [[[0.6, 5], [5.4, 5]]],
  "—": [[[0, 5], [6, 5]]],
  "·": [[[2.8, 4.8], [3.2, 4.8]]],
  "(": [[[4.6, 0], [2.4, 2], [2.4, 8], [4.6, 10]]],
  ")": [[[1.4, 0], [3.6, 2], [3.6, 8], [1.4, 10]]],
  "/": [[[1.4, 10], [4.6, 0]]],
  "%": [[[1, 1], [2, 1], [2.6, 1.6], [2.6, 2.6], [2, 3.2], [1, 3.2], [0.4, 2.6], [0.4, 1.6], [1, 1]], [[4, 6.8], [5, 6.8], [5.6, 7.4], [5.6, 8.4], [5, 9], [4, 9], [3.4, 8.4], [3.4, 7.4], [4, 6.8]], [[5.4, 0.6], [0.6, 9.4]]],
  "!": [[[3, 0], [3, 6.8]], [[2.8, 9.2], [3.2, 9.2]]],
  "?": [[[1.4, 2.6], [1.8, 0.8], [4.2, 0.8], [5, 2.4], [5, 3.2], [3, 5.6], [3, 7]], [[2.8, 9.2], [3.2, 9.2]]],
};

const ADV = 0.68; // advance per glyph, as a fraction of cap-height size

function textW(s: string, size: number, track: number): number {
  if (s.length === 0) return 0;
  return s.length * (ADV * size + track) - track;
}

function drawGlyph(ch: string, x: number, y: number, size: number, c: RGB): void {
  const g = GLYPHS[ch];
  if (!g) return;
  const u = size / 10;
  const w = Math.max(2.5, size * 0.17);
  for (const stroke of g) {
    const pts: Pt[] = stroke.map(([gx, gy]): Pt => [x + gx * u, y + gy * u]);
    if (pts.length === 1) {
      disc(pts[0][0] * SS, pts[0][1] * SS, (w * SS) / 2, c);
    } else {
      polyline(pts, w, c, false);
    }
  }
}

function drawText(
  s: string,
  x: number,
  y: number,
  size: number,
  c: RGB,
  align: "left" | "center" | "right",
  track: number,
): void {
  const w = textW(s, size, track);
  let sx = x;
  if (align === "center") sx = x - w / 2;
  if (align === "right") sx = x - w;
  let cx = sx;
  for (const ch of s) {
    if (ch !== " ") drawGlyph(ch, cx, y, size, c);
    cx += ADV * size + track;
  }
}

// Greedy word wrap; returns lines that fit maxW at size.
function wrap(s: string, maxW: number, size: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur === "" ? word : cur + " " + word;
    if (textW(trial, size, 0) <= maxW || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- png
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
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

function encodePNG(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function downsample(): Uint8Array {
  const out = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (let dy = 0; dy < SS; dy++) {
          for (let dx = 0; dx < SS; dx++) {
            s += buf[((y * SS + dy) * BW + (x * SS + dx)) * 3 + ch];
          }
        }
        out[(y * W + x) * 3 + ch] = Math.round(s / (SS * SS));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- scenes
function drawLeadArt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  // Sun, top right.
  const sx = x + w - 69;
  const sy = y + 55;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    line(
      sx + Math.cos(a) * 30, sy + Math.sin(a) * 30,
      sx + Math.cos(a) * 42, sy + Math.sin(a) * 42,
      4, SUN,
    );
  }
  disc(sx * SS, sy * SS, 26 * SS, SUN);
  // Globe, left.
  const gx = x + 185;
  const gy = y + 88;
  const gr = 72;
  disc(gx * SS, gy * SS, gr * SS, OCEAN);
  poly(
    [[x + 140, y + 60], [x + 170, y + 40], [x + 205, y + 45], [x + 215, y + 70], [x + 195, y + 95], [x + 160, y + 95], [x + 138, y + 80]],
    LAND,
  );
  poly(
    [[x + 225, y + 108], [x + 248, y + 106], [x + 248, y + 118], [x + 235, y + 130], [x + 220, y + 128], [x + 218, y + 115]],
    LAND,
  );
  // Meridian + equator hints.
  line(gx, gy - gr, gx, gy + gr, 2, [127, 176, 212]);
  line(gx - gr, gy, gx + gr, gy, 2, [127, 176, 212]);
  ring(gx, gy, gr, 3, INK);
  // Conference table along the bottom.
  fillRect(x, y + h - 30, w, 30, WOOD);
  fillRect(x, y + h - 30, w, 3, [90, 66, 44]);
  // Microphones on the table.
  for (const mx of [x + 350, x + 440, x + 530]) {
    line(mx, y + h - 30, mx, y + h - 48, 3, INK);
    disc(mx * SS, (y + h - 52) * SS, 5 * SS, INK);
  }
  // Draft document, right: the fossil-fuel clause struck out.
  const dx = x + 570;
  const dy = y + 32;
  fillRect(dx, dy, 300, 96, WHITE);
  polyline(
    [[dx, dy], [dx + 300, dy], [dx + 300, dy + 96], [dx, dy + 96]],
    2, INK, true,
  );
  drawText("DRAFT", dx + 16, dy + 10, 20, INK, "left", 2);
  fillRect(dx + 16, dy + 36, 200, 5, LGREY);
  fillRect(dx + 16, dy + 47, 258, 5, LGREY);
  fillRect(dx + 16, dy + 58, 180, 5, LGREY);
  drawText("FOSSIL FUELS", dx + 16, dy + 68, 22, RED, "left", 1);
  line(dx + 12, dy + 80, dx + 196, dy + 80, 3, RED);
  // Panel border.
  polyline(
    [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
    2, INK, true,
  );
}

function drawPolandArt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, NIGHT);
  fillRect(x, y + h - 18, w, 18, [58, 63, 69]);
  // Missile arc with flame.
  polyline([[x + 8, y + 52], [x + 75, y + 30], [x + 135, y + 14]], 3, WHITE, false);
  disc((x + 8) * SS, (y + 52) * SS, 4 * SS, SUN);
  disc((x + 135) * SS, (y + 14) * SS, 3 * SS, WHITE);
  // Three impact bursts on the ground.
  star4(x + 45, y + 58, 7, RED);
  star4(x + 85, y + 60, 7, RED);
  star4(x + 125, y + 56, 7, RED);
  polyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 1, LGREY, true);
}

function drawKyivArt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, SKY);
  fillRect(x, y + h - 22, w, 22, RIVER);
  // Smoke rising from the broken span.
  disc((x + 72) * SS, (y + 26) * SS, 6 * SS, GREY);
  disc((x + 68) * SS, (y + 16) * SS, 5 * SS, GREY);
  disc((x + 76) * SS, (y + 10) * SS, 4 * SS, GREY);
  // Bridge deck, middle span broken and dipped into the river.
  line(x + 8, y + 34, x + 68, y + 34, 4, [110, 106, 96]);
  line(x + 68, y + 34, x + 75, y + 48, 4, [110, 106, 96]);
  line(x + 75, y + 48, x + 82, y + 34, 4, [110, 106, 96]);
  line(x + 82, y + 34, x + 142, y + 34, 4, [110, 106, 96]);
  line(x + 30, y + 34, x + 30, y + 50, 3, [110, 106, 96]);
  line(x + 120, y + 34, x + 120, y + 50, 3, [110, 106, 96]);
  disc((x + 75) * SS, (y + 44) * SS, 3 * SS, SUN);
  polyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 1, LGREY, true);
}

function drawMarketsArt(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, WHITE);
  line(x, y + 24, x + w, y + 24, 1, GRID);
  line(x, y + 48, x + w, y + 48, 1, GRID);
  polyline(
    [[x + 12, y + 14], [x + 50, y + 26], [x + 88, y + 38], [x + 128, y + 58]],
    3, RED, false,
  );
  poly([[x + 128, y + 58], [x + 118, y + 52], [x + 120, y + 62]], RED);
  drawText("-3.7%", x + 12, y + 52, 18, RED, "left", 0);
  polyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 1, LGREY, true);
}

// ---------------------------------------------------------------- layout
function drawFrontPage(): void {
  fillRect(0, 0, W, H, PAPER);
  // Frame.
  polyline([[14, 14], [1010, 14], [1010, 1010], [14, 1010]], 3, INK, true);

  // Masthead.
  drawText("THE WORLD", 512, 30, 108, INK, "center", 14);
  drawText("SATURDAY, 21 NOVEMBER 2026 — IN ONE IMAGE", 512, 160, 24, INK, "center", 1);
  fillRect(30, 192, 964, 5, INK);
  fillRect(30, 200, 964, 2, INK);

  // Lead story.
  drawText("CLIMATE — ANTALYA, TURKIYE", 30, 212, 22, RED, "left", 1);
  drawText("CLIMATE TALKS RUN PAST", 512, 242, 46, INK, "center", 10);
  drawText("DEADLINE — STILL NO DEAL", 512, 296, 46, INK, "center", 10);
  drawLeadArt(30, 360, 964, 166);
  const deck = [
    "NEARLY 200 NATIONS MISS THE FRIDAY DEADLINE IN ANTALYA.",
    "THE DRAFT DROPS EVERY MENTION OF FOSSIL FUELS.",
    "ADAPTATION CASH OF 120BN A YEAR IS CUT TOO. NEW TEXT DUE SATURDAY.",
  ];
  deck.forEach((ln, i) => drawText(ln, 30, 538 + i * 25, 20, INK, "left", 0));
  fillRect(30, 620, 964, 2, INK);

  // Secondary stories: three rows, small art left, headline + facts right.
  const rows = [
    {
      art: drawPolandArt,
      head: "RUSSIAN MISSILES LAND IN POLAND",
      body: "KH-101 CRUISE MISSILE DOWN NEAR NOWY LIPOWIEC. NATO CALLS IT A GRAVE VIOLATION. NO ONE IS HURT.",
    },
    {
      art: drawKyivArt,
      head: "KYIV BRIDGES HIT IN MASS BARRAGE",
      body: "84 CRUISE MISSILES AND 404 DRONES IN ONE NIGHT. THREE DNIPRO BRIDGES DAMAGED. POWER, HEAT AND WATER CUT.",
    },
    {
      art: drawMarketsArt,
      head: "AI SELL-OFF SINKS US STOCKS",
      body: "US STOCKS FALL 3.7% INTO CORRECTION AS AI SHARES SLIDE. NASDAQ DROPS 5.3%. NVIDIA SINKS 14%.",
    },
  ];
  rows.forEach((row, i) => {
    const ry = 630 + i * 86;
    row.art(30, ry, 150, 72);
    drawText(row.head, 196, ry + 2, 25, INK, "left", 0);
    const lines = wrap(row.body, 798, 19);
    lines.forEach((ln, j) => drawText(ln, 196, ry + 32 + j * 22, 19, INK, "left", 0));
    if (i < 2) fillRect(30, ry + 79, 964, 1, LGREY);
  });

  // Footer: in-brief strip.
  fillRect(30, 886, 964, 2, INK);
  fillRect(30, 877, 118, 18, PAPER);
  drawText("IN BRIEF", 34, 877, 18, RED, "left", 1);
  const briefs = [
    "CYCLONE AKVAN: 370,000 EVACUATED IN ODISHA. NO DEATHS REPORTED.",
    "WORLD COURT: ACTION URGED AFTER MYANMAR GENOCIDE RULING.",
    "FRANCE SEEKS UN SECURITY COUNCIL MEETING OVER KYIV STRIKES.",
    "ESTONIA TO SHUT ITS BORDER WITH RUSSIA FROM 1 DECEMBER.",
    "CRICKET: JAISWAL 85, RAHUL 52 NOT OUT IN WELLINGTON.",
  ];
  briefs.forEach((b, i) => {
    const by = 898 + i * 19;
    fillRect(30, by + 5, 8, 8, RED);
    drawText(b, 46, by, 18, INK, "left", 0);
  });
}

// ---------------------------------------------------------------- main
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  drawFrontPage();
  const png = encodePNG(W, H, downsample());
  const sha = createHash("sha256").update(png).digest("hex");
  writeFileSync(join(outDir, "entry.png"), png);
  const dossier = {
    title: "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026",
    date: "2026-11-21",
    format: "1024x1024 PNG",
    lead: {
      headline: "CLIMATE TALKS RUN PAST DEADLINE — STILL NO DEAL",
      facts: [
        "COP31 in Antalya, Turkiye, missed its scheduled Friday finish and ran into overtime on Saturday 21 Nov 2026.",
        "The latest draft drops every mention of fossil fuels (coal, oil, gas).",
        "The draft also drops the $120bn-a-year adaptation finance figure.",
        "Nearly 200 countries are negotiating; a new draft was due Saturday morning.",
      ],
      sources: ["Associated Press", "CNN", "Reuters", "BBC live"],
    },
    secondaries: [
      {
        headline: "RUSSIAN MISSILES LAND IN POLAND",
        facts: [
          "A Kh-101 cruise missile came down near Nowy Lipowiec on Friday 20 Nov 2026; two more objects fell nearby.",
          "NATO Secretary-General Mark Rutte called it a grave violation of Polish airspace.",
          "PM Donald Tusk called it a likely intentional provocation. No one was hurt in Poland.",
        ],
        sources: ["Associated Press", "Reuters"],
      },
      {
        headline: "KYIV BRIDGES HIT IN MASS BARRAGE",
        facts: [
          "Russia fired 84 cruise missiles and 404 drones at Ukraine in one overnight barrage.",
          "Three bridges over the Dnipro in Kyiv were damaged; parts of the capital lost power, heat and water.",
          "At least 8 people were killed.",
        ],
        sources: ["Kyiv Independent", "Associated Press", "BBC"],
      },
      {
        headline: "AI SELL-OFF SINKS US STOCKS",
        facts: [
          "The S&P 500 fell 3.7% on Friday 20 Nov 2026, entering correction territory.",
          "The Nasdaq fell 5.3% and turned negative for the year.",
          "Nvidia sank 14% in a day as the AI trade unwound.",
        ],
        sources: ["Associated Press", "CNN", "Wall Street Journal", "Investopedia"],
      },
    ],
    briefs: [
      "Cyclone Akvan: 370,000 evacuated in Odisha; landfall near Gopalpur; no deaths reported (IMD).",
      "Rights groups press for action after the ICJ found Myanmar guilty of Rohingya genocide (ruling 19 Nov 2026).",
      "France seeks a UN Security Council meeting over the Kyiv strikes (Reuters, 20 Nov 2026).",
      "Estonia to shut its road border with Russia from 1 December after an alleged arson attack (Reuters, 20 Nov 2026).",
      "Cricket: Jaiswal 85 and Rahul 52 not out share a 130-run stand; India 159/1 reply to New Zealand's 368 in Wellington (Cricbuzz, 20 Nov 2026).",
    ],
    png_sha256: sha,
    png_bytes: png.length,
  };
  writeFileSync(join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
  console.log(`entry.png ${png.length} bytes sha256 ${sha}`);
  console.log("dossier.json written");
}

main();
