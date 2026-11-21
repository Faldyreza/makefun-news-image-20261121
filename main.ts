// news-image-20261121 v6 — fresh procedural front page, Node 22 stdlib only.
// 1024x1024, pure software rasterizer + stroke vector font + PNG encoder.
// No network, no Date, no randomness: two runs are byte-identical.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const img = new Uint8ClampedArray(W * H * 4);

type RGB = [number, number, number];
const PAPER: RGB = [246, 241, 231];
const INK: RGB = [26, 26, 26];
const RED: RGB = [178, 38, 30];
const BLUE: RGB = [31, 78, 121];
const WOOD: RGB = [138, 90, 51];
const WOOD_D: RGB = [107, 66, 34];

// ---------------------------------------------------------------- rasterizer
function lerpC(a: RGB, b: RGB, t: number): RGB {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
}
function setPx(x: number, y: number, c: RGB, a = 1): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 4;
  if (a >= 1) { img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255; return; }
  img[i] = Math.round(img[i] * (1 - a) + c[0] * a);
  img[i + 1] = Math.round(img[i + 1] * (1 - a) + c[1] * a);
  img[i + 2] = Math.round(img[i + 2] * (1 - a) + c[2] * a);
  img[i + 3] = 255;
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c, a);
}
function fillRectGrad(x: number, y: number, w: number, h: number, cTop: RGB, cBot: RGB): void {
  for (let yy = 0; yy < Math.round(h); yy++) {
    fillRect(x, y + yy, w, 1, lerpC(cTop, cBot, yy / Math.max(1, h - 1)));
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const rr = Math.max(0.5, r);
  const y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(H - 1, Math.ceil(cy + rr));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const dx = Math.sqrt(Math.max(0, rr * rr - dy * dy));
    const x0 = Math.max(0, Math.ceil(cx - dx)), x1 = Math.min(W - 1, Math.floor(cx + dx));
    for (let x = x0; x <= x1; x++) setPx(x, y, c, a);
  }
}
function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const t = (y - cy) / ry;
    const dx = rx * Math.sqrt(Math.max(0, 1 - t * t));
    const x0 = Math.max(0, Math.ceil(cx - dx)), x1 = Math.min(W - 1, Math.floor(cx + dx));
    for (let x = x0; x <= x1; x++) setPx(x, y, c, a);
  }
}
// Even-odd scanline polygon fill, optional vertical gradient (yTop->yBot).
function fillPoly(pts: number[][], cTop: RGB, cBot: RGB = cTop, yTop = 0, yBot = 1): void {
  let yMin = Infinity, yMax = -Infinity;
  for (const p of pts) { yMin = Math.min(yMin, p[1]); yMax = Math.max(yMax, p[1]); }
  const lo = Math.max(0, Math.floor(yMin)), hi = Math.min(H - 1, Math.ceil(yMax));
  for (let y = lo; y <= hi; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
    }
    xs.sort((a, b) => a - b);
    const t = yBot === yTop ? 0 : Math.min(1, Math.max(0, (y - yTop) / (yBot - yTop)));
    const c = lerpC(cTop, cBot, t);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c);
    }
  }
}
function strokeSeg(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (w / 2), ny = (dx / len) * (w / 2);
  fillPoly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]], c);
  fillCircle(x1, y1, w / 2, c);
  fillCircle(x2, y2, w / 2, c);
}
function strokePoly(pts: number[][], w: number, c: RGB, closed = false): void {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    strokeSeg(a[0], a[1], b[0], b[1], w, c);
  }
}
function ring(cx: number, cy: number, r: number, w: number, c: RGB): void {
  const pts: number[][] = [];
  for (let a = 0; a <= 360; a += 12) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
  }
  strokePoly(pts, w, c, true);
}
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, step = 12): number[][] {
  const pts: number[][] = [];
  for (let a = a0; a <= a1; a += step) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(rad), cy + ry * Math.sin(rad)]);
  }
  return pts;
}

// ---------------------------------------------------------------- stroke font
// Grid: x 0..~8, y 0 (baseline) .. 8 (cap top); descenders negative.
type Glyph = { w: number; s: number[][][] };
const F: Record<string, Glyph> = {
  A: { w: 6.2, s: [[[0, 0], [3, 8], [6, 0]], [[1.3, 3.2], [4.7, 3.2]]] },
  B: { w: 6.2, s: [[[0, 0], [0, 8], [4, 8], [5.6, 6.6], [5.6, 5.2], [4, 4], [0, 4]], [[4, 4], [5.6, 4], [5.6, 1.6], [4, 0], [0, 0]]] },
  C: { w: 6.0, s: [[[5.6, 6.4], [4, 8], [1.6, 8], [0, 6.2], [0, 1.8], [1.6, 0], [4, 0], [5.6, 1.6]]] },
  D: { w: 6.4, s: [[[0, 0], [0, 8], [3.6, 8], [6, 6], [6, 2], [3.6, 0], [0, 0]]] },
  E: { w: 5.8, s: [[[5.4, 8], [0, 8], [0, 0], [5.4, 0]], [[0, 4], [4, 4]]] },
  F: { w: 5.8, s: [[[0, 0], [0, 8], [5.4, 8]], [[0, 4.4], [4.2, 4.4]]] },
  G: { w: 6.4, s: [[[5.6, 6], [4, 8], [1.6, 8], [0, 6.2], [0, 1.8], [1.6, 0], [4, 0], [6, 1.6], [6, 3.6], [3.6, 3.6]]] },
  H: { w: 6.4, s: [[[0, 0], [0, 8]], [[6, 0], [6, 8]], [[0, 4], [6, 4]]] },
  I: { w: 3.6, s: [[[1.8, 0], [1.8, 8]], [[0, 8], [3.6, 8]], [[0, 0], [3.6, 0]]] },
  J: { w: 5.6, s: [[[4.6, 8], [4.6, 1.6], [3.2, 0], [1.2, 0], [0.2, 1.2]]] },
  K: { w: 6.2, s: [[[0, 0], [0, 8]], [[5.6, 8], [0.6, 4], [6, 0]]] },
  L: { w: 5.6, s: [[[0, 8], [0, 0], [5.4, 0]]] },
  M: { w: 7.2, s: [[[0, 0], [0, 8], [3.2, 4.4], [6.4, 8], [6.4, 0]]] },
  N: { w: 6.8, s: [[[0, 0], [0, 8], [6, 0], [6, 8]]] },
  O: { w: 6.6, s: [[[1.6, 8], [4.4, 8], [6, 6], [6, 2], [4.4, 0], [1.6, 0], [0, 2], [0, 6], [1.6, 8]]] },
  P: { w: 6.2, s: [[[0, 0], [0, 8], [4.4, 8], [5.8, 6.6], [5.8, 5], [4.4, 3.6], [0, 3.6]]] },
  Q: { w: 6.6, s: [[[1.6, 8], [4.4, 8], [6, 6], [6, 2], [4.4, 0], [1.6, 0], [0, 2], [0, 6], [1.6, 8]], [[3.6, 1.2], [6.4, -1.4]]] },
  R: { w: 6.2, s: [[[0, 0], [0, 8], [4.4, 8], [5.8, 6.6], [5.8, 5], [4.4, 3.6], [0, 3.6]], [[4.4, 3.6], [6, 0]]] },
  S: { w: 6.0, s: [[[5.4, 6.4], [4, 8], [1.6, 8], [0.2, 6.4], [0.2, 5], [2, 4], [4, 4], [5.8, 3], [5.8, 1.6], [4.4, 0], [1.6, 0], [0.2, 1.6]]] },
  T: { w: 6.2, s: [[[0, 8], [6, 8]], [[3, 8], [3, 0]]] },
  U: { w: 6.4, s: [[[0, 8], [0, 2], [1.6, 0], [4.4, 0], [6, 2], [6, 8]]] },
  V: { w: 6.4, s: [[[0, 8], [3, 0], [6, 8]]] },
  W: { w: 8.8, s: [[[0, 8], [2, 0], [4, 4.2], [6, 0], [8, 8]]] },
  X: { w: 6.2, s: [[[0, 8], [6, 0]], [[6, 8], [0, 0]]] },
  Y: { w: 6.2, s: [[[0, 8], [3, 4], [6, 8]], [[3, 4], [3, 0]]] },
  Z: { w: 6.0, s: [[[0, 8], [6, 8], [0, 0], [6, 0]]] },
  a: { w: 5.8, s: [[[1.2, 5], [4, 5], [5.2, 3.8], [5.2, 1.6], [4, 0], [1.2, 0], [0.2, 1.6], [0.2, 3.8], [1.2, 5]], [[5.2, 5], [5.2, 0]]] },
  b: { w: 5.8, s: [[[0, 0], [0, 8]], [[0, 0], [3, 0], [5.2, 1.4], [5.2, 3.6], [3, 5], [0, 5]]] },
  c: { w: 5.4, s: [[[5.2, 3.6], [4, 5], [1.6, 5], [0.2, 3.6], [0.2, 1.4], [1.6, 0], [4, 0], [5.2, 1.4]]] },
  d: { w: 5.8, s: [[[5.4, 8], [5.4, 0]], [[5.4, 0], [2.4, 0], [0.4, 1.4], [0.4, 3.6], [2.4, 5], [5.4, 5]]] },
  e: { w: 5.6, s: [[[5, 1.6], [4, 0], [1.6, 0], [0.2, 1.4], [0.2, 3.6], [1.6, 5], [4, 5], [5.2, 3.6], [5.2, 2.4], [0.2, 2.4]]] },
  f: { w: 4.2, s: [[[1, 0], [1, 6.6], [1.8, 8], [3.8, 8], [4.6, 6.4]], [[0.4, 5.4], [4.2, 5.4]]] },
  g: { w: 5.8, s: [[[1.2, 5], [4.2, 5], [5.4, 3.6], [5.4, 1.4], [4.2, 0], [1.2, 0], [0, 1.4], [0, 3.6], [1.2, 5]], [[5.4, 0], [5.4, -2.4], [3.4, -3.2], [1.4, -3.2], [0.4, -2.2]]] },
  h: { w: 5.8, s: [[[0, 8], [0, 0]], [[0, 5], [2.4, 5], [4.4, 3.4], [4.4, 0]]] },
  i: { w: 3.0, s: [[[1.5, 0], [1.5, 5]], [[1.2, 7], [1.8, 7]]] },
  j: { w: 3.4, s: [[[2.6, 5], [2.6, -1.6], [1.2, -3], [0, -2.4]], [[2.3, 7], [2.9, 7]]] },
  k: { w: 5.6, s: [[[0, 8], [0, 0]], [[4.8, 5], [1, 2.4], [5.2, 0]]] },
  l: { w: 3.0, s: [[[1.5, 8], [1.5, 0]], [[0.6, 0], [2.6, 0]]] },
  m: { w: 7.6, s: [[[0, 0], [0, 5], [1.8, 5], [3.4, 3.6], [3.4, 0]], [[3.4, 5], [5.2, 5], [6.8, 3.6], [6.8, 0]]] },
  n: { w: 5.8, s: [[[0, 0], [0, 5]], [[0, 5], [2.6, 5], [4.8, 3.4], [4.8, 0]]] },
  o: { w: 5.6, s: [[[1.4, 5], [4, 5], [5.2, 3.6], [5.2, 1.4], [4, 0], [1.4, 0], [0.2, 1.4], [0.2, 3.6], [1.4, 5]]] },
  p: { w: 5.8, s: [[[0, -3], [0, 5]], [[0, 5], [3, 5], [5.2, 3.6], [5.2, 1.4], [3, 0], [0, 0]]] },
  q: { w: 5.8, s: [[[5.4, -3], [5.4, 5]], [[5.4, 5], [2.4, 5], [0.2, 3.6], [0.2, 1.4], [2.4, 0], [5.4, 0]]] },
  r: { w: 4.4, s: [[[0, 0], [0, 5]], [[0, 5], [1.8, 5], [3.4, 4], [4, 3]]] },
  s: { w: 5.4, s: [[[4.6, 4], [3.6, 5], [1.6, 5], [0.4, 4], [0.4, 3], [2, 2.5], [3.6, 2.5], [5, 2], [5, 1], [3.6, 0], [1.6, 0], [0.4, 1]]] },
  t: { w: 4.2, s: [[[2.2, 8], [2.2, 0]], [[0.6, 5.4], [4, 5.4]], [[1.2, 0], [3.4, 0]]] },
  u: { w: 5.8, s: [[[0, 5], [0, 1.4], [1.4, 0], [4, 0], [5.2, 1.4], [5.2, 5]]] },
  v: { w: 5.6, s: [[[0, 5], [2.6, 0], [5.2, 5]]] },
  w: { w: 8.0, s: [[[0, 5], [1.8, 0], [3.6, 3.2], [5.4, 0], [7.2, 5]]] },
  x: { w: 5.6, s: [[[0, 5], [5.2, 0]], [[5.2, 5], [0, 0]]] },
  y: { w: 5.6, s: [[[0, 5], [2.6, 0], [5.2, 5]], [[2.6, 0], [2.6, -2.6], [0.8, -3.2]]] },
  z: { w: 5.4, s: [[[0, 5], [5.2, 5], [0, 0], [5.2, 0]]] },
  '0': { w: 6.4, s: [[[1.6, 8], [4.4, 8], [6, 6], [6, 2], [4.4, 0], [1.6, 0], [0, 2], [0, 6], [1.6, 8]]] },
  '1': { w: 4.0, s: [[[1.2, 6.6], [2.6, 8], [2.6, 0]], [[0.8, 0], [4.4, 0]]] },
  '2': { w: 6.0, s: [[[0.6, 6.4], [1.6, 8], [4.4, 8], [5.4, 6.4], [5.4, 5], [0.4, 0], [5.8, 0]]] },
  '3': { w: 6.0, s: [[[0.6, 6.4], [2, 8], [4.4, 8], [5.4, 6.4], [5.2, 4.6], [3, 4], [5.2, 3.4], [5.4, 1.6], [4, 0], [1.6, 0], [0.6, 1.6]]] },
  '4': { w: 6.2, s: [[[4.4, 8], [4.4, 0]], [[0.4, 4.6], [5.8, 4.6]], [[0.4, 4.6], [4.4, 8]]] },
  '5': { w: 6.0, s: [[[5.6, 8], [0.6, 8], [0.6, 4.6], [3, 4.6], [5, 3.6], [5, 1.6], [3.6, 0], [1.2, 0], [0.2, 1.2]]] },
  '6': { w: 6.2, s: [[[5.4, 6.6], [4, 8], [1.6, 8], [0.2, 6.2], [0.2, 2], [1.6, 0], [4.4, 0], [5.6, 1.6], [5.6, 3.6], [4.2, 5], [1.6, 5], [0.4, 3.6]]] },
  '7': { w: 6.0, s: [[[0.4, 8], [5.8, 8], [2.8, 0]]] },
  '8': { w: 6.2, s: [[[1.6, 8], [4.4, 8], [5.6, 6.6], [4.4, 5], [1.6, 5], [0.4, 6.6], [1.6, 8]], [[4.4, 5], [5.6, 3.6], [5.6, 1.6], [4.2, 0], [1.8, 0], [0.4, 1.6], [0.4, 3.6], [1.6, 5]]] },
  '9': { w: 6.2, s: [[[0.6, 1.6], [1.6, 0], [4.4, 0], [5.8, 2], [5.8, 6], [4.4, 8], [1.6, 8], [0.4, 6.4], [0.4, 4.6], [1.6, 3], [4.4, 3], [5.6, 4.6]]] },
  '.': { w: 3.0, s: [[[1.2, 0], [1.8, 0]]] },
  ',': { w: 3.0, s: [[[1.6, 0], [1.2, -1.4], [0.4, -2.4]]] },
  ':': { w: 3.0, s: [[[1.2, 5], [1.8, 5]], [[1.2, 0], [1.8, 0]]] },
  ';': { w: 3.2, s: [[[1.2, 5], [1.8, 5]], [[1.8, 0], [1.4, -1.4], [0.6, -2.4]]] },
  "'": { w: 2.8, s: [[[1.8, 8], [1.2, 6.4]]] },
  '"': { w: 4.6, s: [[[1.2, 8], [0.8, 6.6]], [[3.4, 8], [3, 6.6]]] },
  '-': { w: 5.2, s: [[[0.6, 3], [4.6, 3]]] },
  '–': { w: 6.4, s: [[[0.4, 3.6], [6, 3.6]]] },
  '—': { w: 8.2, s: [[[0.2, 3.6], [8, 3.6]]] },
  '−': { w: 5.2, s: [[[0.6, 4.2], [4.6, 4.2]]] },
  '(': { w: 3.8, s: [[[3.2, 8], [1.4, 6], [1.4, 2], [3.2, 0]]] },
  ')': { w: 3.8, s: [[[0.6, 8], [2.4, 6], [2.4, 2], [0.6, 0]]] },
  '/': { w: 5.2, s: [[[1, 0], [4.6, 8]]] },
  '~': { w: 6.4, s: [[[0.4, 4.6], [1.6, 5.8], [2.8, 5.8], [3.8, 4.6], [4.8, 4.6], [6, 5.8]]] },
  '+': { w: 6.0, s: [[[3, 0.6], [3, 7.4]], [[0.4, 4], [5.6, 4]]] },
  '$': { w: 6.0, s: [[[3, 8.6], [3, -0.6]], [[5.2, 6.4], [4, 8], [1.6, 8], [0.4, 6.6], [0.4, 5.4], [2, 4.4], [4, 4.4], [5.6, 3.4], [5.6, 1.8], [4.2, 0], [1.6, 0], [0.4, 1.4]]] },
  '!': { w: 3.2, s: [[[1.6, 8], [1.6, 2.4]], [[1.3, 0], [1.9, 0]]] },
  '?': { w: 6.0, s: [[[1, 6], [1.8, 8], [4.2, 8], [5.2, 6.6], [5.2, 5.2], [3, 3.6], [3, 2.2]], [[2.7, 0], [3.3, 0]]] },
  '=': { w: 6.0, s: [[[0.6, 5.4], [5.4, 5.4]], [[0.6, 2.6], [5.4, 2.6]]] },
  // v6: '&' — one bold, simple, decisive stroke (figure-eight path, no tiny knot).
  '&': { w: 7.6, s: [[[5.2, 7.8], [4, 8.2], [2, 8], [1, 6.4], [1.2, 4.8], [2.6, 4], [4.4, 4], [5.4, 3], [5.4, 1.6], [4, 0.2], [2, 0.2], [0.6, 1.4], [1, 3], [2.4, 4.6], [4, 6.2], [5.4, 7.8]]] },
};

function advOf(ch: string): number {
  if (ch === ' ') return 3.4;
  if (ch === '%') return 8.8;
  if (ch === '•') return 4.0;
  const g = F[ch];
  return g ? g.w : 6;
}
function textWidth(str: string, size: number, track = 0.6): number {
  const sc = size / 8;
  let w = 0;
  for (const ch of str) w += (advOf(ch) + track) * sc;
  return w - track * sc;
}
interface TextOpts { align?: 'left' | 'center' | 'right'; track?: number; sw?: number; bold?: boolean }
function drawGlyph(ch: string, x: number, yBase: number, size: number, color: RGB, sw: number, bold: boolean): void {
  const sc = size / 8;
  if (ch === ' ') return;
  if (ch === '•') { fillCircle(x + 2 * sc, yBase - 2.6 * sc, Math.max(1.2, size * 0.17), color); return; }
  if (ch === '%') {
    // v6: two decisive rings + one thick diagonal.
    const yTop = yBase - size;
    ring(x + 6.4 * sc, yTop + 1.9 * sc, 1.9 * sc, Math.max(1.4, sw * 1.35), color);
    ring(x + 2.6 * sc, yTop + size - 1.9 * sc, 1.9 * sc, Math.max(1.4, sw * 1.35), color);
    strokeSeg(x + 1.1 * sc, yTop + size - 0.7 * sc, x + 7.9 * sc, yTop + 0.7 * sc, Math.max(1.6, sw * 1.5), color);
    return;
  }
  const g = F[ch];
  if (!g) return;
  // v6: '&' is drawn much bolder than the surrounding body text.
  const w = ch === '&' ? sw * 1.6 : (bold ? sw * 1.45 : sw);
  for (const stroke of g.s) {
    const pts = stroke.map(([u, v]) => [x + u * sc, yBase - v * sc]);
    strokePoly(pts, Math.max(1, w), color);
  }
}
function drawText(str: string, x: number, yTop: number, size: number, color: RGB, o: TextOpts = {}): void {
  const track = o.track ?? 0.6;
  const sw = Math.max(1, size * (o.sw ?? 0.14));
  const sc = size / 8;
  const total = textWidth(str, size, track);
  let cx = x;
  if (o.align === 'center') cx = x - total / 2;
  if (o.align === 'right') cx = x - total;
  const yBase = yTop + size;
  for (const ch of str) {
    drawGlyph(ch, cx, yBase, size, color, sw, !!o.bold);
    cx += (advOf(ch) + track) * sc;
  }
}
// v6 (a): left-aligned, whole-word wrap only — NEVER justified, NEVER hyphenated,
// so word gaps stay even and tight and no word (e.g. "Lipowiec") is ever split.
function wrapLines(text: string, maxW: number, size: number, track = 0.6): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const word of words) {
    const test = cur ? cur + ' ' + word : word;
    if (textWidth(test, size, track) <= maxW || !cur) cur = test;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawLines(lines: string[], x: number, yTop: number, size: number, lh: number, color: RGB, o: TextOpts = {}): void {
  lines.forEach((ln, i) => drawText(ln, x, yTop + i * lh, size, color, o));
}
interface RichWord { t: string; bold: boolean }
function wrapRich(segs: RichWord[], maxW: number, size: number, track = 0.6): RichWord[][] {
  const lines: RichWord[][] = [];
  let cur: RichWord[] = [];
  let curW = 0;
  for (const w of segs) {
    const ww = textWidth(w.t, size, track);
    const sp = cur.length ? textWidth(' ', size, track) : 0;
    if (curW + sp + ww <= maxW || !cur.length) { cur.push(w); curW += sp + ww; }
    else { lines.push(cur); cur = [w]; curW = ww; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
function drawRichLines(lines: RichWord[][], x: number, yTop: number, size: number, lh: number, color: RGB, track = 0.6): void {
  lines.forEach((line, li) => {
    let cx = x;
    line.forEach((w, wi) => {
      if (wi > 0) cx += textWidth(' ', size, track);
      drawText(w.t, cx, yTop + li * lh, size, color, { track, sw: 0.15, bold: w.bold });
      cx += textWidth(w.t, size, track);
    });
  });
}

// ---------------------------------------------------------------- PNG encoder
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t.push(c >>> 0);
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
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    Buffer.from(img.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- lead scene
function archPts(cx: number, ySpring: number, r: number, yBot: number): number[][] {
  const pts: number[][] = [];
  for (let a = 180; a >= 0; a -= 10) {
    const rad = (a * Math.PI) / 180;
    pts.push([cx + r * Math.cos(rad), ySpring - r * Math.sin(rad)]);
  }
  pts.push([cx + r, yBot], [cx - r, yBot]);
  return pts;
}
function drawWindow(cx: number, withSun: boolean): void {
  const ySpring = 399, r = 95, yBot = 468;
  const shape = archPts(cx, ySpring, r, yBot);
  fillPoly(shape, [255, 207, 94], [198, 91, 124], 304, yBot);
  if (!withSun) {
    // Low skyline silhouettes at the bottom of the side windows only —
    // the middle window stays clear so the sun is never covered.
    const bx = cx - r;
    fillRect(bx + 12, 432, 42, 36, [107, 58, 86]);
    fillRect(bx + 62, 420, 30, 48, [96, 52, 80]);
    fillCircle(bx + 128, 436, 15, [107, 58, 86]);
    fillRect(bx + 113, 436, 30, 32, [107, 58, 86]);
    fillRect(bx + 152, 440, 30, 28, [96, 52, 80]);
  } else {
    fillCircle(cx, 352, 46, [255, 233, 168], 0.28);
    fillCircle(cx, 352, 38, [255, 233, 168], 0.4);
    fillCircle(cx, 352, 30, [255, 246, 191]);
    ring(cx, 352, 30, 2, [240, 200, 90]);
  }
  strokePoly(shape, 5, [91, 58, 41], true);
  strokeSeg(cx, 312, cx, yBot, 3, [91, 58, 41]);
  strokeSeg(cx - r, ySpring, cx + r, ySpring, 3, [91, 58, 41]);
}
function drawDelegate(cx: number, style: number): void {
  const skin: RGB = [[233, 185, 140], [216, 159, 109], [240, 196, 156], [201, 141, 94]][style - 1] as RGB;
  const hair: RGB = [[58, 42, 26], [154, 154, 154], [28, 28, 28], [46, 46, 46]][style - 1] as RGB;
  const suit: RGB = [[31, 58, 95], [61, 61, 61], [91, 42, 42], [31, 77, 58]][style - 1] as RGB;
  const fy = 442; // face centre y
  // shoulders + neck (table ellipse later covers their bottoms)
  fillEllipse(cx, 522, 54, 36, suit);
  fillRect(cx - 8, 468, 16, 20, skin);
  // hair behind face (long-hair back mass for style 3)
  if (style === 3) fillEllipse(cx, 452, 37, 50, hair);
  // face
  fillEllipse(cx, fy, 29, 33, skin);
  // hair cap OVER the top of the face — a visible hairline. (v6 fix: the old
  // cap sat behind the face, so delegates looked bald.)
  fillEllipse(cx, 412, 31, 20, hair);
  // hair details on top of the face
  if (style === 1) {
    // zigzag fringe across the forehead
    const zz: number[][] = [];
    for (let i = 0; i <= 6; i++) zz.push([cx - 27 + i * 9, i % 2 === 0 ? 438 : 449]);
    strokePoly(zz, 7, hair);
  } else if (style === 2) {
    // textured grey curls along the hairline
    for (const dx of [-26, -18, -9, 0, 9, 18, 26]) {
      fillCircle(cx + dx, 418 + (dx * dx) / 90, 6.5, hair);
    }
    fillCircle(cx - 28, 432, 5, hair);
    fillCircle(cx + 28, 432, 5, hair);
  } else if (style === 3) {
    // long hair framing the face, down to the shoulders
    fillPoly([[cx - 31, 418], [cx - 20, 418], [cx - 23, 506], [cx - 33, 506]], hair);
    fillPoly([[cx + 31, 418], [cx + 20, 418], [cx + 23, 506], [cx + 33, 506]], hair);
  } else {
    // side-swept fringe
    strokePoly([[cx - 28, 424], [cx - 6, 436], [cx + 12, 440], [cx + 27, 432]], 8, hair);
  }
  // strong brows, simple nose, natural smile
  strokeSeg(cx - 17, 437, cx - 6, 435, 2.6, INK);
  strokeSeg(cx + 6, 435, cx + 17, 437, 2.6, INK);
  fillCircle(cx - 11, 446, 2.6, INK);
  fillCircle(cx + 11, 446, 2.6, INK);
  strokePoly([[cx, 450], [cx + 2, 458], [cx - 1, 460]], 2, [120, 80, 50]);
  strokePoly(arcPts(cx, 472, 9, 6, 15, 165), 2.2, [120, 60, 40]);
  if (style === 4) {
    ring(cx - 11, 446, 8, 2.4, INK);
    ring(cx + 11, 446, 8, 2.4, INK);
    strokeSeg(cx - 3, 446, cx + 3, 446, 2, INK);
    strokeSeg(cx - 19, 445, cx - 28, 442, 2, INK);
    strokeSeg(cx + 19, 445, cx + 28, 442, 2, INK);
  }
  // shirt + tie
  fillPoly([[cx - 10, 492], [cx + 10, 492], [cx, 514]], [250, 250, 248]);
  fillPoly([[cx - 4, 496], [cx + 4, 496], [cx + 3, 514], [cx - 3, 514]], RED);
}
function drawLead(): void {
  const X = 36, Y = 316, Wd = 952, Ht = 264;
  fillRectGrad(X, Y, Wd, Ht, [234, 217, 184], [217, 196, 154]);
  drawWindow(210, false);
  drawWindow(512, true);
  drawWindow(814, false);
  // bunting: 16 flags on a sagging string
  const flagCols: RGB[] = [[192, 57, 43], [36, 113, 163], [30, 132, 73], [212, 172, 13], [248, 249, 249]];
  const strPts: number[][] = [];
  for (let i = 0; i <= 15; i++) {
    const x = 60 + (i * 904) / 15;
    const y = 322 + 12 * Math.sin((Math.PI * i) / 15);
    strPts.push([x, y]);
  }
  strokePoly(strPts, 2, [80, 60, 40]);
  for (let i = 0; i < 16; i++) {
    const x = 60 + (i * 904) / 15;
    const y = 322 + 12 * Math.sin((Math.PI * i) / 15);
    fillPoly([[x - 9, y + 1], [x + 9, y + 1], [x, y + 25]], flagCols[i % 5]);
  }
  // wall clock near midnight + OVERTIME placard (left wall, clear of windows)
  fillCircle(76, 352, 24, [250, 248, 240]);
  ring(76, 352, 24, 3, INK);
  for (let a = 0; a < 12; a++) {
    const rad = (a * Math.PI) / 6;
    strokeSeg(76 + 19 * Math.sin(rad), 352 - 19 * Math.cos(rad), 76 + 22 * Math.sin(rad), 352 - 22 * Math.cos(rad), 1.6, INK);
  }
  strokeSeg(76, 352, 76 - 2, 352 - 15, 3, INK); // hour hand, just before 12
  strokeSeg(76, 352, 76 - 11, 352 - 18, 2, INK); // minute hand at 11:55
  fillCircle(76, 352, 2.4, INK);
  fillRect(40, 384, 72, 17, [34, 34, 34]);
  drawText('OVERTIME', 76, 387.5, 9.5, [250, 248, 240], { align: 'center', track: 0.8, sw: 0.16 });
  // delegates behind the round wooden table
  drawDelegate(300, 1);
  drawDelegate(440, 2);
  drawDelegate(580, 3);
  drawDelegate(720, 4);
  // round wooden table
  fillEllipse(512, 542, 340, 38, WOOD);
  fillEllipse(512, 538, 340, 34, [156, 106, 62]);
  // papers, microphones, DRAFT document on the table
  fillPoly([[360, 520], [450, 516], [452, 540], [362, 544]], [250, 250, 246]);
  fillRect(372, 524, 66, 2, [170, 170, 165]);
  fillRect(372, 530, 56, 2, [170, 170, 165]);
  fillPoly([[486, 524], [556, 520], [558, 542], [488, 546]], [250, 250, 246]);
  fillRect(496, 528, 50, 2, [170, 170, 165]);
  fillRect(496, 534, 40, 2, [170, 170, 165]);
  for (const mx of [330, 470, 800]) {
    strokeSeg(mx, 528, mx, 512, 2.4, [60, 60, 60]);
    fillCircle(mx, 509, 5, [40, 40, 40]);
  }
  // DRAFT document: "FOSSIL FUELS" struck by ONE clean straight red line
  fillRect(620, 510, 140, 44, [252, 252, 248]);
  strokePoly([[620, 510], [760, 510], [760, 554], [620, 554]], 1.4, [150, 150, 145], true);
  drawText('DRAFT', 628, 514, 11, RED, { track: 1.2, sw: 0.16, bold: true });
  fillRect(628, 528, 90, 2, [170, 170, 165]);
  const ff = 'FOSSIL FUELS';
  drawText(ff, 628, 534, 12, INK, { track: 0.3, sw: 0.16, bold: true });
  const ffW = textWidth(ff, 12, 0.3);
  strokeSeg(626, 541.5, 628 + ffW + 2, 541.5, 2.5, RED);
  // small side table, far right end, with a globe
  fillRect(912, 512, 68, 6, WOOD_D);
  fillRect(918, 518, 5, 42, WOOD_D);
  fillRect(969, 518, 5, 42, WOOD_D);
  fillCircle(946, 488, 19, [46, 109, 164]);
  fillEllipse(940, 484, 7, 5, [90, 164, 105]);
  fillEllipse(952, 494, 6, 4, [90, 164, 105]);
  strokePoly(arcPts(946, 488, 19, 19, 200, 340, 10), 1.4, [200, 220, 235]);
  strokeSeg(946, 469, 946, 507, 1.4, [200, 220, 235]);
  fillRect(941, 505, 10, 7, [120, 90, 50]);
  // frame
  strokePoly([[X, Y], [X + Wd, Y], [X + Wd, Y + Ht], [X, Y + Ht]], 2, INK, true);
}

// ---------------------------------------------------------------- thumbnails
function thumbFrame(tx: number, ty: number): void {
  strokePoly([[tx, ty], [tx + 296, ty], [tx + 296, ty + 140], [tx, ty + 140]], 2, INK, true);
}
function drawThumbPoland(tx: number, ty: number): void {
  fillRectGrad(tx, ty, 296, 140, [207, 216, 230], [232, 226, 208]);
  fillRect(tx, ty + 96, 296, 44, [138, 154, 91]);
  fillRect(tx, ty + 118, 296, 8, [107, 91, 74]);
  fillPoly([[tx + 30, ty + 96], [tx + 44, ty + 66], [tx + 58, ty + 96]], [52, 74, 52]);
  fillPoly([[tx + 250, ty + 96], [tx + 262, ty + 72], [tx + 274, ty + 96]], [52, 74, 52]);
  fillRect(tx + 180, ty + 78, 34, 18, [120, 100, 80]);
  fillPoly([[tx + 180, ty + 78], [tx + 197, ty + 66], [tx + 214, ty + 78]], [90, 60, 50]);
  // missile trail: bright arc from the impact point up to the missile
  const trail: number[][] = [[tx + 80, ty + 116], [tx + 140, ty + 94], [tx + 190, ty + 64], [tx + 252, ty + 22]];
  strokePoly(trail, 5, [245, 240, 230]);
  strokePoly(trail, 2, [255, 154, 60]);
  // missile silhouette, nose down-left along the trail
  fillPoly([[tx + 246, ty + 12], [tx + 262, ty + 20], [tx + 252, ty + 30], [tx + 240, ty + 22]], [40, 42, 48]);
  fillPoly([[tx + 240, ty + 22], [tx + 232, ty + 18], [tx + 238, ty + 30]], [40, 42, 48]);
  // impact smoke + flash
  fillCircle(tx + 80, ty + 112, 12, [125, 128, 134]);
  fillCircle(tx + 68, ty + 100, 9, [150, 153, 158]);
  fillCircle(tx + 94, ty + 102, 8, [140, 143, 148]);
  fillCircle(tx + 80, ty + 114, 5, [255, 154, 60]);
  thumbFrame(tx, ty);
}
function drawThumbKyiv(tx: number, ty: number): void {
  // v6: concrete Dnipro bridge — dusk sky, Kyiv skyline, river, deck with a
  // collapsed middle span (V into the water), tilted pylon, smoke + fire.
  fillRectGrad(tx, ty, 296, 140, [51, 65, 94], [217, 123, 79]);
  // skyline silhouettes: blocks, a golden-domed church, a bell tower, monument
  fillRect(tx + 6, ty + 62, 34, 33, [31, 36, 51]);
  fillRect(tx + 46, ty + 70, 26, 25, [31, 36, 51]);
  fillRect(tx + 78, ty + 58, 30, 37, [31, 36, 51]);
  fillCircle(tx + 93, ty + 56, 9, [217, 164, 65]);
  strokeSeg(tx + 93, ty + 48, tx + 93, ty + 40, 2, [217, 164, 65]);
  fillRect(tx + 150, ty + 66, 30, 29, [31, 36, 51]);
  fillRect(tx + 186, ty + 52, 16, 43, [31, 36, 51]);
  fillRect(tx + 184, ty + 46, 20, 6, [31, 36, 51]);
  fillRect(tx + 208, ty + 72, 34, 23, [31, 36, 51]);
  fillRect(tx + 248, ty + 78, 12, 17, [31, 36, 51]);
  fillRect(tx + 252, ty + 62, 4, 16, [31, 36, 51]);
  fillCircle(tx + 254, ty + 60, 3, [31, 36, 51]);
  fillRect(tx + 266, ty + 68, 26, 27, [31, 36, 51]);
  // river
  fillRect(tx, ty + 105, 296, 35, [22, 50, 79]);
  fillRect(tx + 20, ty + 116, 90, 2, [44, 90, 134]);
  fillRect(tx + 170, ty + 124, 110, 2, [44, 90, 134]);
  fillRect(tx + 60, ty + 130, 70, 2, [36, 76, 116]);
  // bridge deck: left + right spans intact, middle span collapsed into a V.
  // v6: deck drawn LIGHT + thick so it reads instantly against the dusk sky.
  const DECK: RGB = [205, 209, 216];
  strokeSeg(tx, ty + 88, tx + 118, ty + 88, 8, DECK);
  strokeSeg(tx + 178, ty + 88, tx + 296, ty + 88, 8, DECK);
  strokeSeg(tx + 118, ty + 88, tx + 148, ty + 122, 8, DECK);
  strokeSeg(tx + 178, ty + 88, tx + 148, ty + 122, 8, DECK);
  // jagged broken girder ends at the break
  strokePoly([[tx + 118, ty + 88], [tx + 112, ty + 94], [tx + 120, ty + 98], [tx + 114, ty + 104]], 3, DECK);
  strokePoly([[tx + 178, ty + 88], [tx + 184, ty + 94], [tx + 176, ty + 98], [tx + 182, ty + 104]], 3, DECK);
  // deck railings on the intact spans
  for (let x = 8; x < 112; x += 16) strokeSeg(tx + x, ty + 88, tx + x, ty + 80, 1.6, [20, 22, 28]);
  for (let x = 186; x < 292; x += 16) strokeSeg(tx + x, ty + 88, tx + x, ty + 80, 1.6, [20, 22, 28]);
  // tilted pylon + sagging cables
  strokeSeg(tx + 196, ty + 88, tx + 208, ty + 52, 6, DECK);
  strokeSeg(tx + 208, ty + 52, tx + 178, ty + 88, 1.6, [220, 224, 230]);
  strokeSeg(tx + 208, ty + 52, tx + 240, ty + 88, 1.6, [220, 224, 230]);
  // fire glow at the break + bold smoke columns rising from it (kept clear
  // of the collapsed V so the break itself stays visible)
  fillCircle(tx + 148, ty + 118, 9, [255, 140, 40]);
  fillCircle(tx + 148, ty + 118, 5, [255, 220, 90]);
  fillCircle(tx + 136, ty + 96, 10, [125, 130, 140]);
  fillCircle(tx + 128, ty + 78, 13, [141, 146, 154]);
  fillCircle(tx + 120, ty + 60, 15, [157, 161, 168]);
  fillCircle(tx + 158, ty + 92, 9, [125, 130, 140]);
  fillCircle(tx + 166, ty + 74, 12, [141, 146, 154]);
  thumbFrame(tx, ty);
}
function drawThumbMarkets(tx: number, ty: number): void {
  fillRect(tx, ty, 296, 140, [251, 248, 241]);
  for (let gx = 40; gx < 296; gx += 40) fillRect(tx + gx, ty, 1, 140, [229, 221, 204]);
  for (let gy = 28; gy < 140; gy += 28) fillRect(tx, ty + gy, 296, 1, [229, 221, 204]);
  strokeSeg(tx + 8, ty + 8, tx + 8, ty + 128, 2, INK);
  strokeSeg(tx + 8, ty + 128, tx + 288, ty + 128, 2, INK);
  // falling chart, kept clear of both corner labels
  const line: number[][] = [[tx + 14, ty + 34], [tx + 52, ty + 48], [tx + 88, ty + 42], [tx + 128, ty + 66], [tx + 168, ty + 60], [tx + 208, ty + 92], [tx + 248, ty + 100], [tx + 286, ty + 122]];
  strokePoly(line, 4, RED);
  for (const p of line) fillCircle(p[0], p[1], 3, RED);
  // labels: S&P top-right, NASDAQ bottom-left — both far from the line
  drawText('S&P −3.7%', tx + 288, ty + 8, 15, RED, { align: 'right', track: 0.3, sw: 0.16, bold: true });
  drawText('NASDAQ −5.3%', tx + 8, ty + 120, 15, RED, { track: 0.3, sw: 0.16, bold: true });
  thumbFrame(tx, ty);
}

// ---------------------------------------------------------------- page
function main(): void {
  for (let i = 0; i < W * H; i++) { img[i * 4] = PAPER[0]; img[i * 4 + 1] = PAPER[1]; img[i * 4 + 2] = PAPER[2]; img[i * 4 + 3] = 255; }

  // Masthead
  drawText('THE WORLD', 512, 26, 96, INK, { align: 'center', track: 0.9, sw: 0.06 });
  drawText('SATURDAY, 21 NOVEMBER 2026', 512, 140, 16, INK, { align: 'center', track: 1.4, sw: 0.13 });
  fillRect(36, 168, 952, 2, INK);
  fillRect(36, 172, 952, 1, INK);

  // Kicker + headline + deck (deck lines centred individually)
  drawText('CLIMATE SUMMIT • ANTALYA', 512, 186, 15, RED, { align: 'center', track: 1.6, sw: 0.14, bold: true });
  drawText('COP31 TALKS RUN INTO OVERTIME', 512, 206, 36, INK, { align: 'center', track: 0.5, sw: 0.075 });
  drawText("Friday's deadline passed with no deal. A new draft drops", 512, 250, 17, [42, 42, 42], { align: 'center', track: 0.6, sw: 0.15 });
  drawText('fossil-fuel language and offers $120bn a year for adaptation —', 512, 271, 17, [42, 42, 42], { align: 'center', track: 0.6, sw: 0.15 });
  drawText("as ~200 nations wait for Saturday's text.", 512, 292, 17, [42, 42, 42], { align: 'center', track: 0.6, sw: 0.15 });

  // Lead illustration
  drawLead();

  // Secondary stories
  const cols = [
    { x: 36, kicker: 'POLAND • MISSILE', h1: 'MISSILE DOWN', h2: 'IN POLAND', body: "Russian Kh-101 missile down in Poland — Nowy Lipowiec. NATO calls it a 'grave violation'; no one hurt.", thumb: drawThumbPoland },
    { x: 348, kicker: 'KYIV • WAR', h1: 'KYIV BARRAGE CUTS', h2: 'POWER, HEAT, WATER', body: '84 cruise missiles and 404 drones hit the capital. Three Dnipro bridges damaged; power, heat and water cut.', thumb: drawThumbKyiv },
    { x: 660, kicker: 'MARKETS • WALL STREET', h1: 'AI SELL-OFF', h2: 'HITS WALL ST', body: "S&P slides 3.7% into correction; Nasdaq drops 5.3% as Nvidia plunges 14% on AI fears.", thumb: drawThumbMarkets },
  ];
  const checks: string[] = [];
  for (const c of cols) {
    c.thumb(c.x, 596);
    drawText(c.kicker, c.x, 744, 13, RED, { track: 1.2, sw: 0.15, bold: true });
    drawText(c.h1, c.x, 762, 19, INK, { track: 0.3, sw: 0.15, bold: true });
    drawText(c.h2, c.x, 785, 19, INK, { track: 0.3, sw: 0.15, bold: true });
    const lines = wrapLines(c.body, 296, 15, 0.6);
    drawLines(lines, c.x, 812, 15, 19.5, [42, 42, 42], { track: 0.6, sw: 0.15 });
    const maxW = Math.max(...lines.map((l) => textWidth(l, 15, 0.6)));
    checks.push(`${c.kicker}: ${lines.length} lines, maxW ${maxW.toFixed(1)}/296 | ${lines.join(' / ')}`);
  }

  // Footer: IN BRIEF
  fillRect(36, 894, 952, 2, INK);
  drawText('IN BRIEF', 36, 904, 15, INK, { track: 1.6, sw: 0.14, bold: true });
  fillRect(150, 911, 838, 1, [150, 145, 135]);
  const briefs: { x: number; lead: string; rest: string }[] = [
    { x: 36, lead: 'CYCLONE AKVAN — ', rest: '370,000 fled Odisha; no deaths reported.' },
    { x: 276, lead: 'WORLD COURT — ', rest: 'New action filed after the Myanmar ruling.' },
    { x: 516, lead: 'FRANCE — ', rest: 'Paris seeks an urgent UNSC meeting on Kyiv.' },
    { x: 756, lead: 'ESTONIA — ', rest: 'To shut its Russia border from 1 December.' },
  ];
  for (const b of briefs) {
    const leadWords = b.lead.trim().split(' ');
    const all: RichWord[] = (b.lead + b.rest).split(' ').map((t, i) => ({ t, bold: i < leadWords.length && t !== '—' }));
    const lines = wrapRich(all, 226, 13, 0.6);
    drawRichLines(lines, b.x, 928, 13, 17.5, [42, 42, 42], 0.6);
    const maxW = Math.max(...lines.map((ln) => ln.reduce((s, w, i) => s + textWidth(w.t, 13, 0.6) + (i ? textWidth(' ', 13, 0.6) : 0), 0)));
    checks.push(`BRIEF ${b.lead.trim()}: ${lines.length} lines, maxW ${maxW.toFixed(1)}/226`);
  }

  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
  console.log(`PNG ${png.length} bytes (limit 1048576): ${png.length < 1048576 ? 'OK' : 'TOO BIG'}`);
  for (const c of checks) console.log(c);
  console.log(`headline W: ${textWidth('COP31 TALKS RUN INTO OVERTIME', 36, 0.5).toFixed(1)}/952`);
  console.log(`masthead W: ${textWidth('THE WORLD', 96, 0.9).toFixed(1)}/952`);
  console.log(`deck L2 W: ${textWidth('fossil-fuel language and offers $120bn a year for adaptation —', 17, 0.6).toFixed(1)}/952`);
}

main();
