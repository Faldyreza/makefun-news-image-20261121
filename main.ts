// news-image-20261121 v14 — fresh procedural front page, Node 22+ stdlib only.
// "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// Draws a 1024x1024 RGB PNG deterministically (no Date, no Math.random;
// jitter comes from a fixed-seed PRNG). Writes $MAKEFUN_OUTPUT_DIR/entry.png.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG out
const W = 1024, H = 1024;
const img = new Uint8Array(W * H * 3); // RGB

function crc32(buf: Uint8Array): number {
  let table = (crc32 as unknown as { t?: Uint32Array }).t;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    (crc32 as unknown as { t: Uint32Array }).t = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePNG(): Buffer {
  const raw = new Uint8Array(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  const idat = deflateSync(raw, { level: 9 });
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0)),
  ];
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

// ---------------------------------------------------------------- raster
type RGB = [number, number, number];
function px(x: number, y: number, c: RGB): void {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = Math.max(0, Math.round(y)); j < Math.min(H, Math.round(y + h)); j++)
    for (let i = Math.max(0, Math.round(x)); i < Math.min(W, Math.round(x + w)); i++) px(i, j, c);
}
function hline(x0: number, x1: number, y: number, c: RGB, w = 1): void {
  for (let j = 0; j < w; j++) for (let i = Math.round(x0); i <= Math.round(x1); i++) px(i, Math.round(y) + j, c);
}
function vline(x: number, y0: number, y1: number, c: RGB, w = 1): void {
  for (let i = 0; i < w; i++) for (let j = Math.round(y0); j <= Math.round(y1); j++) px(Math.round(x) + i, j, c);
}
function disc(cx: number, cy: number, r: number, c: RGB): void {
  const rr = Math.round(r);
  for (let j = -rr; j <= rr; j++)
    for (let i = -rr; i <= rr; i++)
      if (i * i + j * j <= rr * rr) px(cx + i, cy + j, c);
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, yLo = -1e9, yHi = 1e9): void {
  for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) {
    const y = cy + j;
    if (y < yLo || y > yHi) continue;
    const hw = rx * Math.sqrt(Math.max(0, 1 - (j * j) / (ry * ry)));
    for (let i = -Math.ceil(hw); i <= Math.ceil(hw); i++) px(cx + i, y, c);
  }
}
function poly(pts: [number, number][], c: RGB): void {
  let minY = 1e9, maxY = -1e9;
  for (const [, y] of pts) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let k = 0; k < pts.length; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2)
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) px(x, y, c);
  }
}
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const dx = x1 - x0, dy = y1 - y0;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  for (let k = 0; k <= n; k++) disc(x0 + (dx * k) / n, y0 + (dy * k) / n, w / 2, c);
}
function frame(x: number, y: number, w: number, h: number, c: RGB, t = 2): void {
  rect(x, y, w, t, c); rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c); rect(x + w - t, y, t, h, c);
}

// Deterministic jitter (fixed seed).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261121);

// ---------------------------------------------------------------- 5x7 font
const F: Record<string, string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  b: ['10000', '10000', '11110', '10001', '10001', '10001', '11110'],
  c: ['00000', '00000', '01110', '10001', '10000', '10001', '01110'],
  d: ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01000', '01000', '11110', '01000', '01000', '01000'],
  g: ['00000', '01111', '10001', '10001', '01111', '00001', '01110'],
  h: ['10000', '10000', '11110', '10001', '10001', '10001', '10001'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  j: ['00010', '00000', '00110', '00010', '00010', '10010', '01100'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  p: ['00000', '11110', '10001', '10001', '11110', '10000', '10000'],
  q: ['00000', '00000', '01111', '10001', '10001', '01111', '00001'],
  r: ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  s: ['00000', '00000', '01111', '10000', '01110', '00001', '11110'],
  t: ['01000', '01000', '11100', '01000', '01000', '01000', '00110'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
  v: ['00000', '00000', '10001', '10001', '10001', '01010', '00100'],
  w: ['00000', '00000', '10001', '10101', '10101', '10101', '01010'],
  x: ['00000', '00000', '10001', '01010', '00100', '01010', '10001'],
  y: ['00000', '00000', '10001', '10001', '01111', '00001', '01110'],
  z: ['00000', '00000', '11111', '00010', '00100', '01000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '—': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
};
function textW(s: string, scale: number, adv?: number): number {
  const a = adv ?? 6 * scale;
  return s.length * a - (a - 5 * scale);
}
function drawText(s: string, x: number, y: number, scale: number, c: RGB, align: 'left' | 'center' | 'right' = 'left', adv?: number): void {
  const a = adv ?? 6 * scale;
  let x0 = x;
  if (align === 'center') x0 = x - textW(s, scale, a) / 2;
  if (align === 'right') x0 = x - textW(s, scale, a);
  for (let k = 0; k < s.length; k++) {
    const g = F[s[k]] ?? F[' '];
    const gx = x0 + k * a;
    for (let r = 0; r < 7; r++)
      for (let col = 0; col < 5; col++)
        if (g[r][col] === '1') rect(gx + col * scale, y + r * scale, scale, scale, c);
  }
}

// ---------------------------------------------------------------- palette
const INK: RGB = [26, 26, 26];
const PAPER: RGB = [243, 233, 211];
const WALL: RGB = [234, 223, 198];
const RED: RGB = [169, 31, 24];
const RED2: RGB = [192, 39, 31];
const GOLD: RGB = [212, 160, 40];
const BROWN: RGB = [107, 74, 42];
const TABLEC: RGB = [122, 82, 48];
const SKY1: RGB = [207, 230, 242];
const SKY2: RGB = [168, 200, 222];
const SUN: RGB = [245, 184, 30];
const NAVY: RGB = [44, 74, 124];
const CHARCOAL: RGB = [58, 58, 58];
const MAROON: RGB = [107, 45, 63];
const GREEN: RGB = [47, 107, 74];
const BLUE2: RGB = [47, 90, 168];

// ---------------------------------------------------------------- page
rect(0, 0, W, H, PAPER);
frame(4, 4, W - 8, H - 8, INK, 3);
frame(12, 12, W - 24, H - 24, INK, 1);

// Masthead
drawText('THE WORLD', 512, 16, 12, INK, 'center');
drawText('IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026', 512, 108, 3, INK, 'center');
hline(24, 116, 117, INK, 2); hline(908, 1000, 117, INK, 2);
hline(24, 1000, 132, INK, 2); hline(24, 1000, 137, INK, 1);

// Headline + subhead
drawText('COP31 TALKS RUN INTO OVERTIME', 512, 146, 5, INK, 'center');
drawText('ANTALYA DRAFT DROPS FOSSIL-FUEL MENTIONS AND $120BN-A-YEAR', 512, 190, 2, INK, 'center');
drawText('ADAPTATION FUNDS — NEARLY 200 NATIONS AWAIT A NEW TEXT SATURDAY', 512, 210, 2, INK, 'center');

// ---------------------------------------------------------------- scene
const SX = 14, SY = 228, SW = 996, SH = 364; // scene box
rect(SX, SY, SW, SH, WALL);
frame(SX, SY, SW, SH, INK, 2);

// Arched window: sky = ellipse top + rect body, centre (512,300), rx 175, ry 62
for (let y = 238; y <= 578; y++) {
  const t = (y - 238) / (578 - 238);
  const c: RGB = [
    Math.round(SKY1[0] + (SKY2[0] - SKY1[0]) * t),
    Math.round(SKY1[1] + (SKY2[1] - SKY1[1]) * t),
    Math.round(SKY1[2] + (SKY2[2] - SKY1[2]) * t),
  ];
  if (y < 300) ellipse(512, 300, 175, 62, c, y, y);
  else rect(337, y, 351, 1, c);
}
// Sun (whole, clear of the middle delegate's head) + rays BEHIND the mullions
const SUNX = 560, SUNY = 295;
for (let k = 0; k < 12; k++) {
  const a0 = (k / 12) * Math.PI * 2 + 0.26;
  const a1 = a0 + 0.10;
  const r0 = 40, r1 = k % 2 === 0 ? 74 : 60;
  poly([
    [SUNX + Math.cos(a0) * r0, SUNY + Math.sin(a0) * r0],
    [SUNX + Math.cos(a1) * r0, SUNY + Math.sin(a1) * r0],
    [SUNX + Math.cos((a0 + a1) / 2) * r1, SUNY + Math.sin((a0 + a1) / 2) * r1],
  ], [247, 205, 90]);
}
disc(SUNX, SUNY, 32, SUN);
// Mullions + arch frame (drawn over the rays)
vline(420, 248, 578, BROWN, 9); vline(512, 240, 578, BROWN, 9); vline(603, 248, 578, BROWN, 9);
hline(337, 688, 385, BROWN, 9); hline(337, 688, 470, BROWN, 9);
// arch outline: polyline over the ellipse top, then down both sides
{
  const pts: [number, number][] = [];
  for (let d = 180; d >= 0; d -= 3) {
    const a = (d * Math.PI) / 180;
    pts.push([512 + 178 * Math.cos(a), 300 - 64 * Math.sin(a)]);
  }
  for (let k = 0; k + 1 < pts.length; k++) thickLine(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 7, BROWN);
  vline(334, 300, 578, BROWN, 7); vline(688, 300, 578, BROWN, 7);
}

// COP31 plaque (left) + OVERTIME banner (right)
rect(44, 240, 146, 44, INK);
drawText('COP31', 117, 246, 3, [245, 245, 245], 'center');
drawText('ANTALYA', 117, 267, 2, GOLD, 'center');
rect(748, 240, 232, 34, RED);
drawText('OVERTIME', 864, 245, 3, [255, 255, 255], 'center');

// ---------------------------------------------------------------- delegates
type Hair = 'dark' | 'grey' | 'blonde' | 'curly' | 'black';
function delegate(cx: number, headY: number, suit: RGB, skin: RGB, hair: Hair): void {
  const shoulderY = headY + 48;
  // suit torso (trapezoid) + shirt + tie
  poly([[cx - 52, shoulderY], [cx + 52, shoulderY], [cx + 70, 578], [cx - 70, 578]], suit);
  poly([[cx - 15, shoulderY + 2], [cx + 15, shoulderY + 2], [cx + 8, shoulderY + 36], [cx - 8, shoulderY + 36]], [248, 248, 246]);
  poly([[cx - 6, shoulderY + 4], [cx + 6, shoulderY + 4], [cx + 8, shoulderY + 42], [cx - 8, shoulderY + 42]], [40, 40, 40]);
  // lapels
  thickLine(cx - 16, shoulderY + 4, cx - 30, shoulderY + 44, 2, [0, 0, 0]);
  thickLine(cx + 16, shoulderY + 4, cx + 30, shoulderY + 44, 2, [0, 0, 0]);
  // neck + head
  rect(cx - 10, headY + 30, 20, 20, skin);
  disc(cx - 33, headY, 6, skin); disc(cx + 33, headY, 6, skin);
  ellipse(cx, headY, 33, 37, skin);
  // hair
  if (hair === 'dark' || hair === 'black') {
    ellipse(cx, headY - 16, 34, 22, hair === 'dark' ? [40, 28, 20] : [20, 20, 20], headY - 38, headY - 4);
    rect(cx - 34, headY - 20, 68, 10, hair === 'dark' ? [40, 28, 20] : [20, 20, 20]);
  } else if (hair === 'grey') {
    ellipse(cx, headY - 18, 34, 20, [150, 150, 150], headY - 38, headY - 8);
    rect(cx - 34, headY - 12, 8, 26, [150, 150, 150]); rect(cx + 26, headY - 12, 8, 26, [150, 150, 150]);
  } else if (hair === 'blonde') {
    ellipse(cx, headY - 14, 36, 26, [232, 196, 90], headY - 40, headY - 2);
    ellipse(cx, headY - 30, 30, 12, [232, 196, 90]);
  } else {
    // curly: bumps on top
    for (const [bx, by, br] of [[-22, -26, 11], [-8, -32, 12], [8, -32, 12], [22, -26, 11]] as const)
      disc(cx + bx, headY + by, br, [30, 22, 16]);
    ellipse(cx, headY - 18, 34, 18, [30, 22, 16], headY - 36, headY - 6);
  }
  // eyes: natural — white, dark pupil, brow line
  for (const s of [-1, 1]) {
    ellipse(cx + s * 12, headY - 2, 6, 4, [255, 255, 255]);
    disc(cx + s * 12, headY - 2, 2, [20, 20, 20]);
    thickLine(cx + s * 12 - 6, headY - 10, cx + s * 12 + 6, headY - 11, 2, [60, 40, 30]);
  }
  // nose + mouth
  thickLine(cx, headY + 4, cx - 2, headY + 12, 2, [180, 130, 100]);
  thickLine(cx - 6, headY + 20, cx + 6, headY + 20, 2, [120, 70, 60]);
}
delegate(132, 432, NAVY, [222, 178, 140], 'dark');
delegate(288, 432, CHARCOAL, [232, 196, 160], 'grey');
// FIX (a): middle delegate RAISED (head 405) and shoulders wider than the
// DRAFT paper, so suit + shirt + tie stay visible above and beside it.
delegate(512, 405, BLUE2, [205, 160, 125], 'grey');
delegate(668, 432, MAROON, [238, 205, 170], 'blonde');
delegate(852, 432, GREEN, [190, 145, 110], 'curly');

// Table + mics + cups
rect(SX, 578, SW, 14, TABLEC);
hline(SX, SX + SW, 578, [90, 58, 32], 3);
for (const mx of [205, 360, 660, 780]) {
  vline(mx, 560, 578, INK, 2); disc(mx, 558, 4, INK);
}
rect(60, 562, 14, 16, [240, 240, 240]); rect(240, 562, 14, 16, [240, 240, 240]);
rect(700, 562, 14, 16, [240, 240, 240]);

// Globe on the side table (right)
disc(935, 540, 26, [52, 110, 180]);
disc(927, 532, 8, [70, 160, 90]); disc(944, 548, 7, [70, 160, 90]); disc(938, 528, 5, [70, 160, 90]);
vline(935, 566, 576, [90, 60, 30], 4); rect(922, 574, 26, 4, [90, 60, 30]);

// ---------------------------------------------------------------- DRAFT paper
// FIX (a): paper narrower (448–578) than the middle delegate's shoulders
// (440–584), so the suit shows at both sides and above the paper top.
rect(446, 496, 134, 86, [255, 255, 255]);
frame(446, 496, 134, 86, INK, 2);
rect(448, 498, 130, 82, [255, 255, 255]);
drawText('DRAFT', 513, 503, 3, RED2, 'center', 17);
drawText('fossil fuels', 513, 530, 2, INK, 'center', 10);
drawText('adaptation', 513, 548, 2, INK, 'center', 10);
drawText('$120bn/yr', 513, 564, 2, INK, 'center', 10);
// FIX (d): the red strike crosses ONLY the "fossil fuels" line —
// the draft drops the fossil-fuel mention, not the adaptation money.
thickLine(450, 538, 512, 536, 3, RED2);
thickLine(512, 536, 576, 539, 3, RED2);
thickLine(452, 541, 574, 540, 2, RED2);

// ---------------------------------------------------------------- thumbnails
function thumbHead(x: number, w: number, label: string): void {
  rect(x, 598, w, 30, INK);
  drawText(label, x + 12, 605, 2, [255, 255, 255], 'left');
}
// --- Kyiv (left): x 16–502, picture y 630–712
thumbHead(14, 490, 'KYIV UNDER FIRE');
{
  const x0 = 16, x1 = 502, y0 = 630, y1 = 712;
  // dusk sky bands
  const bands: RGB[] = [[232, 160, 92], [214, 128, 84], [170, 92, 100], [110, 74, 110], [74, 62, 96]];
  for (let b = 0; b < bands.length; b++) rect(x0, y0 + b * 12, x1 - x0, 12, bands[b]);
  // river
  rect(x0, 690, x1 - x0, 22, [46, 90, 138]);
  hline(x0 + 20, x1 - 60, 698, [120, 170, 210], 2); hline(x0 + 90, x1 - 30, 705, [120, 170, 210], 2);
  // golden dome (left)
  rect(52, 668, 22, 14, [240, 220, 180]);
  ellipse(63, 668, 13, 12, GOLD, 656, 668);
  disc(63, 654, 3, GOLD);
  // bridge: leaning pylon + deck + cables
  thickLine(330, 712, 352, 638, 6, [42, 42, 42]);
  thickLine(20, 672, 180, 654, 5, [216, 216, 216]);
  thickLine(180, 654, 330, 666, 5, [216, 216, 216]);
  thickLine(330, 666, 490, 652, 5, [216, 216, 216]);
  for (const [cx2, cy2] of [[180, 654], [260, 660], [420, 656], [490, 652]] as const)
    thickLine(352, 640, cx2, cy2, 1, [30, 30, 30]);
  // big fire (left-centre) + glow
  disc(115, 686, 26, [240, 120, 40]);
  poly([[100, 700], [108, 668], [116, 682], [124, 664], [132, 700]], [245, 140, 30]);
  poly([[106, 700], [112, 678], [118, 690], [124, 676], [128, 700]], [250, 200, 60]);
  // anchored smoke plume above the fire: round puffs
  const plume: [number, number, number, RGB][] = [
    [100, 656, 12, [154, 154, 154]], [118, 648, 14, [181, 181, 181]],
    [105, 638, 10, [170, 170, 170]], [128, 640, 9, [154, 154, 154]],
    [112, 630, 8, [190, 190, 190]],
  ];
  for (const [px2, py2, pr, pc] of plume) disc(px2, py2, pr, pc);
  // FIX (b): missile smoke TRAIL as a chain of round, textured, irregular
  // puffs arcing across the sky — never a flat bar. Kept sparse and small
  // so the bridge deck stays visible beneath it.
  const trailCols: RGB[] = [[230, 230, 230], [210, 210, 210], [188, 188, 188], [224, 224, 224]];
  for (let k = 0; k < 11; k++) {
    const t = k / 10;
    const tx = 168 + t * 296 + (rnd() - 0.5) * 12;
    const ty = 640 - Math.sin(t * Math.PI) * 14 + (rnd() - 0.5) * 8;
    const tr = 7 + rnd() * 5;
    disc(tx, ty, tr, trailCols[k % trailCols.length]);
  }
  // a few darker puffs tucked under the trail for texture
  for (let k = 0; k < 3; k++) {
    const t = 0.2 + k * 0.3;
    disc(180 + t * 280 + (rnd() - 0.5) * 10, 646 - Math.sin(t * Math.PI) * 10 + 7, 5 + rnd() * 3, [160, 160, 160]);
  }
  // second smaller fire (right)
  disc(428, 694, 14, [240, 120, 40]);
  poly([[418, 702], [424, 682], [430, 692], [436, 680], [440, 702]], [245, 150, 40]);
  poly([[422, 702], [427, 688], [432, 694], [436, 686], [438, 702]], [250, 205, 70]);
  disc(428, 676, 7, [170, 170, 170]); disc(436, 670, 6, [190, 190, 190]);
  frame(14, 598, 490, 168, INK, 2);
}
drawText('84 MISSILES, 404 DRONES', 259, 716, 2, INK, 'center');
drawText('3 DNIPRO BRIDGES HIT', 259, 733, 2, INK, 'center');
drawText('POWER, HEAT, WATER CUT', 259, 750, 2, INK, 'center');

// --- Poland (right): x 522–1008, picture y 630–712
thumbHead(520, 490, 'MISSILE DOWN IN POLAND');
{
  const x0 = 522, x1 = 1008, y0 = 630, y1 = 712;
  rect(x0, y0, x1 - x0, 42, [207, 228, 242]); // sky
  rect(x0, 672, x1 - x0, 40, [93, 162, 74]); // field
  for (let s = 0; s < 4; s++) rect(x0 + s * 122, 676, 60, 36, [110, 178, 88]);
  // house with red gable roof
  rect(600, 656, 88, 56, [245, 234, 208]);
  poly([[596, 656], [644, 632], [692, 656]], [176, 48, 36]);
  rect(632, 682, 16, 30, [120, 80, 40]);
  rect(662, 664, 14, 12, [90, 140, 200]);
  // pines (right)
  for (const tx of [946, 972]) {
    poly([[tx - 12, 712], [tx, 668], [tx + 12, 712]], [30, 90, 50]);
    rect(tx - 2, 706, 4, 6, [90, 60, 30]);
  }
  // crater
  ellipse(790, 700, 44, 11, [74, 47, 29]);
  ellipse(790, 700, 30, 7, [46, 28, 16]);
  for (let k = 0; k < 10; k++) disc(748 + rnd() * 84, 688 + rnd() * 10, 2, [74, 47, 29]);
  // Polish flag on its pole — clear of the roof
  vline(905, 632, 712, [60, 60, 60], 3);
  rect(908, 634, 46, 12, [255, 255, 255]);
  rect(908, 646, 46, 12, [220, 40, 50]);
  // FIX (c): BIG Kh-101 — pointed nose, swept wings, tail fins — diving
  // nose-down-left toward the crater, with sparse smoke puffs behind it.
  const N: [number, number] = [745, 674]; // nose tip
  const T: [number, number] = [858, 638]; // tail
  const dx = T[0] - N[0], dy = T[1] - N[1];
  const L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L; // along body, nose -> tail
  const px2 = -uy, py2 = ux; // perpendicular
  const P = (along: number, perp: number): [number, number] => [N[0] + ux * along + px2 * perp, N[1] + uy * along + py2 * perp];
  // fuselage + nose cone
  poly([N, P(24, 8), P(L, 8), P(L, -8), P(24, -8)], [74, 74, 74]);
  poly([N, P(26, 9), P(26, -9)], [42, 42, 42]);
  thickLine(P(30, 5)[0], P(30, 5)[1], P(L - 6, 5)[0], P(L - 6, 5)[1], 2, [140, 140, 140]);
  // swept main wings
  poly([P(58, 7), P(74, 7), P(92, 32), P(80, 8)], [51, 51, 51]);
  poly([P(58, -7), P(74, -7), P(92, -32), P(80, -8)], [51, 51, 51]);
  // tail fins
  poly([P(L - 16, 7), P(L - 4, 7), P(L - 8, 20), P(L - 18, 8)], [51, 51, 51]);
  poly([P(L - 16, -7), P(L - 4, -7), P(L - 8, -20), P(L - 18, -8)], [51, 51, 51]);
  // sparse exhaust puffs behind the tail
  disc(P(L + 14, 2)[0], P(L + 14, 2)[1], 7, [220, 220, 220]);
  disc(P(L + 30, -2)[0], P(L + 30, -2)[1], 6, [205, 205, 205]);
  disc(P(L + 46, 2)[0], P(L + 46, 2)[1], 5, [220, 220, 220]);
  frame(520, 598, 490, 168, INK, 2);
}
drawText('KH-101 DOWN IN NOWY LIPOWIEC', 765, 716, 2, INK, 'center');
drawText('NATO: "GRAVE VIOLATION"', 765, 733, 2, INK, 'center');
drawText('NO CASUALTIES', 765, 750, 2, INK, 'center');

// ---------------------------------------------------------------- AI strip
frame(14, 772, 996, 80, INK, 2);
drawText('AI SELL-OFF', 30, 782, 4, RED, 'left');
drawText('HITS WALL STREET', 30, 816, 3, INK, 'left');
// chart: pink fill under a jagged falling red line
rect(330, 782, 310, 60, [255, 255, 255]);
frame(330, 782, 310, 60, INK, 1);
hline(330, 640, 802, [225, 225, 225], 1); hline(330, 640, 822, [225, 225, 225], 1);
{
  const pts: [number, number][] = [];
  for (let k = 0; k <= 11; k++) {
    const x = 340 + (k / 11) * 290;
    const y = 792 + (k / 11) * 42 + (rnd() - 0.5) * 7 - (k === 0 ? 0 : 0);
    pts.push([x, y]);
  }
  const fill: [number, number][] = [...pts, [630, 842], [340, 842]];
  poly(fill, [243, 193, 193]);
  for (let k = 0; k + 1 < pts.length; k++)
    thickLine(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 3, RED);
}
drawText('S&P 500', 700, 780, 3, INK, 'left');
drawText('-3.7%', 995, 780, 3, INK, 'right');
drawText('NASDAQ', 700, 804, 3, INK, 'left');
drawText('-5.3%', 995, 804, 3, INK, 'right');
drawText('NVIDIA', 700, 828, 3, RED, 'left');
drawText('-14%', 995, 828, 3, RED, 'right');

// ---------------------------------------------------------------- IN BRIEF
drawText('IN BRIEF', 16, 866, 4, INK, 'left');
hline(16, 1008, 900, INK, 2);
function brief(x: number, lines: string[]): void {
  for (let k = 0; k < lines.length; k++) {
    if (k === 0) rect(x, 912 + k * 18 + 3, 8, 8, RED);
    drawText(lines[k], x + 16, 910 + k * 18, 2, INK, 'left');
  }
}
brief(16, ['CYCLONE AKVAN:', '370,000 FLED ODISHA;', 'NO DEATHS REPORTED']);
brief(268, ['WORLD COURT', 'ACTS AFTER', 'MYANMAR RULING']);
brief(520, ['FRANCE SEEKS UN', 'SECURITY COUNCIL', 'MEETING ON KYIV']);
brief(772, ['ESTONIA TO SHUT', 'RUSSIA BORDER', 'FROM 1 DECEMBER']);

// ---------------------------------------------------------------- write
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG());
