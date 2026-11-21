// NEWS-IMAGE-20261121 V9 — FRESH BUILD
// THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026
// NODE 22 STDLIB ONLY, NO NETWORK, DETERMINISTIC.
// ALL TEXT IS ALL CAPS: THE STROKE FONT BELOW ONLY HAS CAPITAL GLYPHS.
// FIXES VS V8: (A) KYIV SMOKE IS ORGANIC IRREGULAR PUFFS, NO BRIGHT CIRCLE
// HIGHLIGHTS, NO HARD CIRCLE OUTLINES; (B) POLAND SMOKE IS A RISING,
// SPREADING, FEATHERY PLUME, DARK AT THE BASE, NEVER A NEAT EGG;
// (C) DELEGATE 1 HAIR HAS A SHARP SIDE PART, UNEVEN STRANDS AND A
// JAGGED, WAVY EDGE, NEVER ONE SMOOTH SOLID CAP.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
type RGB = [number, number, number];
const NAVY: RGB = [22, 40, 63];
const INK: RGB = [24, 28, 34];
const RED: RGB = [178, 34, 34];
const PAPER: RGB = [246, 241, 227];
const CREAM: RGB = [252, 248, 238];

// ---------- FRAMEBUFFER ----------
const fb = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) { fb[i * 3] = PAPER[0]; fb[i * 3 + 1] = PAPER[1]; fb[i * 3 + 2] = PAPER[2]; }
function px(x: number, y: number, c: RGB): void {
  const xi = Math.round(x); const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = (yi * W + xi) * 3; fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2];
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x)); const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)); const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const o = (yy * W + xx) * 3; fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2];
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  if (r <= 0) return;
  const y0 = Math.max(0, Math.ceil(cy - r)); const y1 = Math.min(H - 1, Math.floor(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / r; const dx = r * Math.sqrt(Math.max(0, 1 - dy * dy));
    const x0 = Math.max(0, Math.ceil(cx - dx)); const x1 = Math.min(W - 1, Math.floor(cx + dx));
    for (let x = x0; x <= x1; x++) { const o = (y * W + x) * 3; fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2]; }
  }
}
function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  if (rx <= 0 || ry <= 0) return;
  const y0 = Math.max(0, Math.ceil(cy - ry)); const y1 = Math.min(H - 1, Math.floor(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry; const dx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const x0 = Math.max(0, Math.ceil(cx - dx)); const x1 = Math.min(W - 1, Math.floor(cx + dx));
    for (let x = x0; x <= x1; x++) { const o = (y * W + x) * 3; fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2]; }
  }
}
function fillPoly(pts: [number, number][], c: RGB): void {
  if (pts.length < 3) return;
  let minY = H; let maxY = 0;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.max(0, Math.ceil(minY)); y <= Math.min(H - 1, Math.floor(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]; const b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((m, n) => m - n);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k])); const x1 = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) { const o = (y * W + x) * 3; fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2]; }
    }
  }
}
function thickLine(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB): void {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, c);
  }
}
function thinLine(x1: number, y1: number, x2: number, y2: number, c: RGB): void {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(d * 2));
  for (let i = 0; i <= steps; i++) { const t = i / steps; px(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, c); }
}
function circleOutline(cx: number, cy: number, r: number, w: number, c: RGB): void {
  const steps = Math.max(24, Math.ceil(r * 6));
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w / 2, c);
  }
}
function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  fillRect(x + r, y, w - 2 * r, h, c); fillRect(x, y + r, w, h - 2 * r, c);
  fillCircle(x + r, y + r, r, c); fillCircle(x + w - r, y + r, r, c);
  fillCircle(x + r, y + h - r, r, c); fillCircle(x + w - r, y + h - r, r, c);
}

// ---------- STROKE FONT (CAPITALS ONLY) ----------
// GLYPH GRID: X 0..6, Y 0..8 (TOP TO BOTTOM). EACH GLYPH IS A LIST OF POLYLINES.
type Pt = [number, number];
const G: Record<string, Pt[][]> = {
  A: [[[0, 8], [3, 0], [6, 8]], [[1.6, 5.4], [4.4, 5.4]]],
  B: [[[0, 0], [0, 8]], [[0, 0], [4, 0], [5, 1], [5, 3], [4, 4], [0, 4]], [[0, 4], [4, 4], [5, 5], [5, 7], [4, 8], [0, 8]]],
  C: [[[5, 1], [4, 0], [1, 0], [0, 1], [0, 7], [1, 8], [4, 8], [5, 7]]],
  D: [[[0, 0], [0, 8]], [[0, 0], [4, 0], [6, 2], [6, 6], [4, 8], [0, 8]]],
  E: [[[5, 0], [0, 0], [0, 8], [5, 8]], [[0, 4], [4, 4]]],
  F: [[[5, 0], [0, 0], [0, 8]], [[0, 4], [4, 4]]],
  G: [[[5, 1], [4, 0], [1, 0], [0, 1], [0, 7], [1, 8], [4, 8], [5, 7], [5, 4], [3, 4]]],
  H: [[[0, 0], [0, 8]], [[6, 0], [6, 8]], [[0, 4], [6, 4]]],
  I: [[[3, 0], [3, 8]], [[1, 0], [5, 0]], [[1, 8], [5, 8]]],
  J: [[[5, 0], [5, 7], [4, 8], [1, 8], [0, 7]]],
  K: [[[0, 0], [0, 8]], [[5, 0], [0, 4], [5, 8]]],
  L: [[[0, 0], [0, 8], [5, 8]]],
  M: [[[0, 8], [0, 0], [3, 4.5], [6, 0], [6, 8]]],
  N: [[[0, 8], [0, 0], [6, 8], [6, 0]]],
  O: [[[3, 0], [5, 1], [6, 3], [6, 5], [5, 7], [3, 8], [1, 7], [0, 5], [0, 3], [1, 1], [3, 0]]],
  P: [[[0, 8], [0, 0]], [[0, 0], [4, 0], [5, 1], [5, 3], [4, 4], [0, 4]]],
  Q: [[[3, 0], [5, 1], [6, 3], [6, 5], [5, 7], [3, 8], [1, 7], [0, 5], [0, 3], [1, 1], [3, 0]], [[3.6, 5], [6, 8]]],
  R: [[[0, 8], [0, 0]], [[0, 0], [4, 0], [5, 1], [5, 3], [4, 4], [0, 4]], [[3, 4], [6, 8]]],
  S: [[[5, 1], [4, 0], [1, 0], [0, 1], [0, 3], [1, 4], [4, 4], [5, 5], [5, 7], [4, 8], [1, 8], [0, 7]]],
  T: [[[0, 0], [6, 0]], [[3, 0], [3, 8]]],
  U: [[[0, 0], [0, 7], [1, 8], [5, 8], [6, 7], [6, 0]]],
  V: [[[0, 0], [3, 8], [6, 0]]],
  W: [[[0, 0], [1.5, 8], [3, 4], [4.5, 8], [6, 0]]],
  X: [[[0, 0], [6, 8]], [[6, 0], [0, 8]]],
  Y: [[[0, 0], [3, 4], [6, 0]], [[3, 4], [3, 8]]],
  Z: [[[0, 0], [6, 0], [0, 8], [6, 8]]],
  '0': [[[3, 0], [5, 1], [6, 3], [6, 5], [5, 7], [3, 8], [1, 7], [0, 5], [0, 3], [1, 1], [3, 0]]],
  '1': [[[1.5, 1.5], [3, 0], [3, 8]], [[1, 8], [5, 8]]],
  '2': [[[0, 1], [1, 0], [5, 0], [6, 1], [6, 3], [0, 8], [6, 8]]],
  '3': [[[0, 0], [4, 0], [6, 2], [5, 4], [6, 6], [4, 8], [0, 8]]],
  '4': [[[4, 0], [0, 6], [6, 6]], [[4, 0], [4, 8]]],
  '5': [[[5, 0], [0, 0], [0, 4], [4, 4], [6, 6], [5, 8], [1, 8], [0, 7]]],
  '6': [[[5, 1], [4, 0], [1, 0], [0, 2], [0, 7], [1, 8], [5, 8], [6, 7], [6, 5], [5, 4], [0, 4]]],
  '7': [[[0, 0], [6, 0], [3, 8]]],
  '8': [[[2, 0], [4, 0], [5, 1], [5, 3], [4, 4], [2, 4], [1, 3], [1, 1], [2, 0]], [[2, 4], [4, 4], [5, 5], [5, 7], [4, 8], [2, 8], [1, 7], [1, 5], [2, 4]]],
  '9': [[[0, 7], [0, 3], [1, 1], [2, 0], [5, 0], [6, 1], [6, 5], [5, 6], [0, 6]], [[5, 6], [5, 8], [4, 8]]],
  '-': [[[0.5, 4], [5.5, 4]]],
  '—': [[[0, 4], [6, 4]]],
  '/': [[[1, 8], [5, 0]]],
  '(': [[[4, 0], [2, 2], [2, 6], [4, 8]]],
  ')': [[[2, 0], [4, 2], [4, 6], [2, 8]]],
  '+': [[[3, 1], [3, 7]], [[0, 4], [6, 4]]],
  '=': [[[0, 3], [6, 3]], [[0, 5.5], [6, 5.5]]],
  "'": [[[3, 0], [2.4, 2.4]]],
  '!': [[[3, 0], [3, 5.5]]],
  '?': [[[1, 1], [2, 0], [5, 0], [6, 1], [6, 3], [3, 5], [3, 6]]],
  '$': [[[5, 1], [4, 0], [1, 0], [0, 1], [0, 3], [1, 4], [4, 4], [5, 5], [5, 7], [4, 8], [1, 8], [0, 7]], [[3, -0.6], [3, 8.6]]],
};
const WIDE: Record<string, number> = { I: 3.6, ' ': 4, '.': 3, ',': 3, ':': 3, ';': 3, '!': 3, '?': 6, '%': 7, '(': 4, ')': 4, "'": 3, '-': 6, '—': 7.5, '/': 6, '+': 6, '=': 6, '$': 6 };
function charW(ch: string, size: number, track: number): number {
  const u = size / 8;
  const wu = WIDE[ch] ?? 6;
  return (wu + 1.4) * u + track;
}
function textW(s: string, size: number, track: number): number {
  let w = 0; for (const ch of s) w += charW(ch, size, track); return w - track;
}
function drawGlyph(ch: string, x: number, yTop: number, size: number, sw: number, c: RGB): void {
  const u = size / 8;
  if (ch === ' ') return;
  if (ch === '.' || ch === '•') { fillCircle(x + 3 * u, yTop + 7.4 * u, Math.max(1.4, sw * 0.62), c); return; }
  if (ch === ',') { fillCircle(x + 3 * u, yTop + 7.4 * u, Math.max(1.4, sw * 0.62), c); thickLine(x + 3 * u, yTop + 7.6 * u, x + 1.8 * u, yTop + 9 * u, sw * 0.8, c); return; }
  if (ch === ':') { fillCircle(x + 3 * u, yTop + 2.4 * u, Math.max(1.3, sw * 0.55), c); fillCircle(x + 3 * u, yTop + 6.8 * u, Math.max(1.3, sw * 0.55), c); return; }
  if (ch === ';') { fillCircle(x + 3 * u, yTop + 2.4 * u, Math.max(1.3, sw * 0.55), c); fillCircle(x + 3 * u, yTop + 6.8 * u, Math.max(1.3, sw * 0.55), c); thickLine(x + 3 * u, yTop + 7 * u, x + 1.8 * u, yTop + 9 * u, sw * 0.8, c); return; }
  if (ch === '!') { thickLine(x + 3 * u, yTop + 0.2 * u, x + 3 * u, yTop + 5.2 * u, sw, c); fillCircle(x + 3 * u, yTop + 7.2 * u, Math.max(1.3, sw * 0.55), c); return; }
  if (ch === '%') {
    circleOutline(x + 1.9 * u, yTop + 1.9 * u, 1.35 * u, Math.max(1.2, sw * 0.8), c);
    circleOutline(x + 4.6 * u, yTop + 6.1 * u, 1.35 * u, Math.max(1.2, sw * 0.8), c);
    thickLine(x + 5.4 * u, yTop + 0.4 * u, x + 1.2 * u, yTop + 7.6 * u, sw * 0.85, c);
    return;
  }
  const glyph = G[ch]; if (!glyph) return;
  for (const line of glyph) {
    if (line.length === 1) { fillCircle(x + line[0][0] * u, yTop + line[0][1] * u, sw / 2, c); continue; }
    for (let i = 0; i + 1 < line.length; i++) {
      thickLine(x + line[i][0] * u, yTop + line[i][1] * u, x + line[i + 1][0] * u, yTop + line[i + 1][1] * u, sw, c);
    }
  }
}
function drawText(s: string, x: number, yTop: number, size: number, c: RGB, align: 'l' | 'c' | 'r' = 'l', track = 0, swMul = 0.19): void {
  const w = textW(s, size, track);
  let cx = x; if (align === 'c') cx = x - w / 2; if (align === 'r') cx = x - w;
  const sw = Math.max(1.1, size * swMul);
  let cur = cx;
  for (const ch of s) { drawGlyph(ch, cur, yTop, size, sw, c); cur += charW(ch, size, track); }
}
function wrap(s: string, maxW: number, size: number, track = 0): string[] {
  const words = s.split(' '); const lines: string[] = []; let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (textW(t, size, track) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------- ORGANIC SMOKE (FIX A + B) ----------
// KYIV: OVERLAPPING IRREGULAR BLOBS IN VARIED GREYS, NO BRIGHT CIRCLE
// HIGHLIGHT, NO HARD CIRCLE OUTLINE.
function kyivSmoke(cx: number, cy: number, s: number): void {
  const g1: RGB = [88, 84, 80]; const g2: RGB = [112, 108, 103]; const g3: RGB = [138, 134, 128]; const g4: RGB = [164, 160, 153];
  fillEllipse(cx, cy + 6 * s, 26 * s, 13 * s, g1);
  fillEllipse(cx - 16 * s, cy + 2 * s, 18 * s, 11 * s, g2);
  fillEllipse(cx + 15 * s, cy + 3 * s, 19 * s, 12 * s, g2);
  fillEllipse(cx - 6 * s, cy - 6 * s, 20 * s, 12 * s, g3);
  fillEllipse(cx + 12 * s, cy - 8 * s, 15 * s, 10 * s, g3);
  fillEllipse(cx - 20 * s, cy - 5 * s, 11 * s, 8 * s, g4);
  fillEllipse(cx + 2 * s, cy - 13 * s, 14 * s, 8 * s, g4);
  fillEllipse(cx + 22 * s, cy - 11 * s, 9 * s, 6 * s, g4);
  fillEllipse(cx - 2 * s, cy - 18 * s, 9 * s, 5 * s, g3);
  fillEllipse(cx + 10 * s, cy - 17 * s, 7 * s, 4.5 * s, g4);
  thickLine(cx - 24 * s, cy - 8 * s, cx - 34 * s, cy - 16 * s, 3.5 * s, g3);
  thickLine(cx + 24 * s, cy - 10 * s, cx + 33 * s, cy - 19 * s, 3 * s, g4);
  thickLine(cx + 4 * s, cy - 19 * s, cx + 8 * s, cy - 27 * s, 2.6 * s, g3);
}
// POLAND: RISING PLUME, WIDENS AND SPREADS UPWARD, DARK AT BASE,
// FEATHERY RAGGED TOP. NEVER A NEAT EGG.
function polandSmoke(bx: number, by: number, s: number): void {
  const d: RGB = [74, 72, 70]; const m: RGB = [104, 102, 99]; const l: RGB = [134, 132, 128]; const p: RGB = [164, 161, 156];
  fillEllipse(bx, by, 22 * s, 9 * s, d);
  fillEllipse(bx - 8 * s, by - 9 * s, 24 * s, 11 * s, d);
  fillEllipse(bx + 10 * s, by - 10 * s, 26 * s, 12 * s, m);
  fillEllipse(bx - 16 * s, by - 20 * s, 28 * s, 13 * s, m);
  fillEllipse(bx + 14 * s, by - 22 * s, 30 * s, 13 * s, l);
  fillEllipse(bx - 4 * s, by - 32 * s, 30 * s, 13 * s, l);
  fillEllipse(bx + 20 * s, by - 33 * s, 20 * s, 10 * s, p);
  fillEllipse(bx - 26 * s, by - 30 * s, 16 * s, 9 * s, p);
  fillEllipse(bx - 30 * s, by - 40 * s, 8 * s, 5 * s, p);
  fillEllipse(bx - 12 * s, by - 44 * s, 9 * s, 5 * s, l);
  fillEllipse(bx + 6 * s, by - 45 * s, 8 * s, 5 * s, p);
  fillEllipse(bx + 24 * s, by - 42 * s, 9 * s, 5 * s, l);
  fillEllipse(bx + 36 * s, by - 36 * s, 7 * s, 4 * s, p);
  thickLine(bx - 34 * s, by - 34 * s, bx - 44 * s, by - 44 * s, 3 * s, l);
  thickLine(bx + 30 * s, by - 38 * s, bx + 40 * s, by - 48 * s, 2.6 * s, p);
  thickLine(bx + 2 * s, by - 44 * s, bx + 0 * s, by - 54 * s, 2.4 * s, p);
}

// ---------- DELEGATES ----------
// FIX C: DELEGATE 1 HAIR — SHARP SIDE PART, UNEVEN STRANDS, JAGGED WAVY
// LOWER EDGE, NEVER ONE SMOOTH SOLID CAP.
function hairParted(cx: number, cy: number, r: number, col: RGB, light: RGB): void {
  const edge: [number, number][] = [];
  const n = 15;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const rr = r * (1 + (i % 2 === 0 ? 0.02 : -0.06));
    edge.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92 - r * 0.06]);
  }
  const fringe: [number, number][] = [];
  for (let i = 0; i <= 10; i++) {
    const fx = cx - r + (i / 10) * 2 * r;
    const fy = cy - r * 0.28 + (i % 2 === 0 ? 0 : r * 0.22) + (i / 10) * r * 0.18;
    fringe.push([fx, fy]);
  }
  fillPoly([...edge, ...fringe.reverse()], col);
  thickLine(cx - r * 0.34, cy - r * 0.92, cx - r * 0.18, cy - r * 0.12, 2.2, light);
  const strands: [number, number, number, number][] = [
    [-0.62, -0.72, -0.78, -0.05], [-0.42, -0.80, -0.52, -0.02], [-0.20, -0.86, -0.22, 0.02],
    [0.02, -0.88, 0.10, -0.06], [0.24, -0.84, 0.38, -0.10], [0.46, -0.76, 0.66, -0.14],
    [0.64, -0.62, 0.82, -0.22], [-0.72, -0.55, -0.88, 0.02], [0.30, -0.70, 0.44, 0.06],
  ];
  for (const s of strands) thickLine(cx + s[0] * r, cy + s[1] * r, cx + s[2] * r, cy + s[3] * r, 1.8, light);
  thickLine(cx - r * 0.05, cy - r * 0.9, cx + r * 0.05, cy - r * 0.3, 1.6, col);
  thickLine(cx + r * 0.42, cy - r * 0.78, cx + r * 0.55, cy - r * 0.2, 1.6, [30, 24, 20]);
}
function face(cx: number, cy: number, r: number, skin: RGB, opts: { glasses?: boolean; beard?: boolean } = {}): void {
  fillCircle(cx, cy, r, skin);
  fillCircle(cx - r * 0.36, cy - r * 0.08, r * 0.13, [255, 255, 255]);
  fillCircle(cx + r * 0.36, cy - r * 0.08, r * 0.13, [255, 255, 255]);
  fillCircle(cx - r * 0.36, cy - r * 0.08, r * 0.06, INK);
  fillCircle(cx + r * 0.36, cy - r * 0.08, r * 0.06, INK);
  thickLine(cx - r * 0.55, cy - r * 0.32, cx - r * 0.18, cy - r * 0.36, 1.8, [60, 45, 35]);
  thickLine(cx + r * 0.18, cy - r * 0.36, cx + r * 0.55, cy - r * 0.32, 1.8, [60, 45, 35]);
  thickLine(cx, cy + r * 0.02, cx - r * 0.06, cy + r * 0.34, 1.8, [150, 105, 80]);
  thickLine(cx - r * 0.26, cy + r * 0.55, cx + r * 0.26, cy + r * 0.55, 2, [120, 60, 50]);
  if (opts.beard) {
    fillEllipse(cx, cy + r * 0.62, r * 0.72, r * 0.42, [90, 80, 75]);
    thickLine(cx - r * 0.26, cy + r * 0.55, cx + r * 0.26, cy + r * 0.55, 2, [60, 45, 40]);
  }
  if (opts.glasses) {
    circleOutline(cx - r * 0.36, cy - r * 0.08, r * 0.24, 1.6, INK);
    circleOutline(cx + r * 0.36, cy - r * 0.08, r * 0.24, 1.6, INK);
    thickLine(cx - r * 0.12, cy - r * 0.08, cx + r * 0.12, cy - r * 0.08, 1.6, INK);
  }
}
function delegate(x: number, suit: RGB, skin: RGB, hair: 'parted' | 'grey' | 'bald' | 'bob' | 'curly', opts: { glasses?: boolean; beard?: boolean } = {}): void {
  const hy = 402; const r = 24;
  fillPoly([[x - 46, 560], [x - 38, 448], [x + 38, 448], [x + 46, 560]], suit);
  fillPoly([[x - 12, 448], [x, 470], [x + 12, 448], [x + 8, 446], [x, 452], [x - 8, 446]], [250, 250, 248]);
  fillPoly([[x - 5, 452], [x, 458], [x + 5, 452], [x + 7, 478], [x, 512], [x - 7, 478]], RED);
  fillRect(x - 9, hy + 14, 18, 16, skin);
  fillCircle(x - r - 1, hy + 2, 5, skin); fillCircle(x + r + 1, hy + 2, 5, skin);
  face(x, hy, r, skin, opts);
  if (hair === 'parted') hairParted(x, hy, r + 2, [52, 38, 28], [122, 96, 66]);
  else if (hair === 'grey') {
    fillPoly([[x - r - 1, hy - 2], [x - r, hy - r - 2], [x + r, hy - r - 2], [x + r + 1, hy - 2], [x + r * 0.6, hy - r * 0.42], [x - r * 0.6, hy - r * 0.42]], [168, 164, 158]);
    thickLine(x - r * 0.3, hy - r * 0.9, x - r * 0.2, hy - r * 0.4, 1.6, [210, 206, 198]);
    thickLine(x + r * 0.2, hy - r * 0.9, x + r * 0.3, hy - r * 0.4, 1.6, [210, 206, 198]);
  } else if (hair === 'bald') {
    fillPoly([[x - r, hy - 2], [x - r - 1, hy - r * 0.5], [x - r * 0.7, hy - r * 0.7], [x - r * 0.4, hy - r * 0.3]], [200, 196, 190]);
    fillPoly([[x + r, hy - 2], [x + r + 1, hy - r * 0.5], [x + r * 0.7, hy - r * 0.7], [x + r * 0.4, hy - r * 0.3]], [200, 196, 190]);
  } else if (hair === 'bob') {
    fillPoly([[x - r - 6, hy + 26], [x - r - 4, hy - r], [x + r + 4, hy - r], [x + r + 6, hy + 26], [x + r, hy + 22], [x + r, hy - r * 0.3], [x - r, hy - r * 0.3], [x - r, hy + 22]], [40, 30, 24]);
    fillCircle(x, hy - r * 0.2, r + 1, [40, 30, 24]);
    face(x, hy + 2, r, skin, opts);
    thickLine(x - r * 0.4, hy - r * 0.8, x - r * 0.3, hy - r * 0.2, 1.6, [110, 88, 62]);
  } else {
    for (let i = -3; i <= 3; i++) fillCircle(x + i * r * 0.28, hy - r * 0.82 + Math.abs(i) * r * 0.1, r * 0.26, [28, 22, 18]);
    fillEllipse(x, hy - r * 0.55, r * 0.95, r * 0.5, [28, 22, 18]);
  }
}

// ---------- LAYOUT ----------
fillRect(0, 0, W, 10, NAVY); fillRect(0, H - 10, W, 10, NAVY);
fillRect(0, 0, 10, H, NAVY); fillRect(W - 10, 0, 10, H, NAVY);
fillRect(24, 24, W - 48, 2, NAVY);

// MASTHEAD
drawText('THE WORLD', 512, 36, 66, NAVY, 'c', 6, 0.17);
drawText('IN ONE IMAGE', 512, 106, 19, RED, 'c', 8, 0.2);
fillRect(180, 114, 130, 2, NAVY); fillRect(714, 114, 130, 2, NAVY);
// DATELINE
fillRect(30, 138, 964, 2, NAVY);
drawText('SATURDAY, 21 NOVEMBER 2026', 512, 146, 21, INK, 'c', 3, 0.2);
fillRect(30, 172, 964, 2, NAVY);

// HEADLINE BAND
fillRect(30, 180, 964, 76, NAVY);
drawText('COP31 IN OVERTIME AS DRAFT', 512, 187, 30, CREAM, 'c', 1, 0.17);
drawText('DROPS FOSSIL-FUEL PLEDGE', 512, 222, 30, [255, 214, 130], 'c', 1, 0.17);
// SUBHEAD
drawText('DEADLINE MISSED IN ANTALYA - NEW DRAFT DUE SATURDAY', 512, 264, 15, RED, 'c', 0.5, 0.22);
drawText('$120BN A YEAR FOR ADAPTATION - NEARLY 200 NATIONS AT THE TABLE', 512, 284, 15, INK, 'c', 0.5, 0.22);

// ---------- MAIN SCENE: COP31 HALL (Y 306..566) ----------
fillRect(30, 306, 964, 260, [232, 214, 178]);
fillRect(30, 540, 964, 26, [176, 132, 88]);
function archedWindow(cx: number, top: number, w: number, h: number, mid: boolean): void {
  const r = w / 2; const springY = top + r;
  fillPoly([[cx - r, springY], [cx - r, top + h], [cx + r, top + h], [cx + r, springY]], [240, 178, 110]);
  fillCircle(cx, springY, r, [240, 178, 110]);
  fillRect(cx - r, springY + 40, w, 60, [226, 140, 82]);
  fillRect(cx - r, springY + 100, w, 60, [214, 112, 66]);
  if (mid) {
    // DISTANT SKYLINE IS SKIPPED FOR THE MIDDLE WINDOW
  } else {
    fillRect(cx - r + 8, springY + 96, 22, 64, [120, 70, 55]);
    fillRect(cx - r + 36, springY + 76, 18, 84, [140, 84, 62]);
    fillRect(cx + r - 34, springY + 88, 26, 72, [120, 70, 55]);
  }
  thickLine(cx - r, springY, cx - r, top + h, 6, [90, 58, 36]);
  thickLine(cx + r, springY, cx + r, top + h, 6, [90, 58, 36]);
  thickLine(cx - r, top + h, cx + r, top + h, 6, [90, 58, 36]);
  circleOutline(cx, springY, r, 6, [90, 58, 36]);
  thickLine(cx, top + 2, cx, top + h, 5, [90, 58, 36]);
  thickLine(cx - r, springY + 70, cx + r, springY + 70, 5, [90, 58, 36]);
  if (mid) {
    // WHOLE SUN, HIGH IN THE ARCH, CLEAR OF THE DELEGATES, DRAWN LAST
    // SO NO MULLION CUTS THROUGH IT
    fillCircle(cx, springY - 42, 30, [255, 205, 110]);
    fillCircle(cx, springY - 42, 21, [255, 222, 138]);
  }
}
archedWindow(196, 322, 150, 168, false);
archedWindow(512, 322, 150, 168, true);
archedWindow(828, 322, 150, 168, false);
// BUNTING: 16 FLAGS
const flagCols: RGB[] = [[178, 34, 34], [240, 196, 25], [46, 134, 193], [39, 174, 96], [230, 126, 34], [142, 68, 173], [22, 160, 133], [203, 67, 53]];
for (let i = 0; i < 16; i++) {
  const fx = 60 + i * 58;
  const fy = 312 + Math.sin((i / 15) * Math.PI) * 10;
  fillPoly([[fx, fy], [fx + 34, fy], [fx + 17, fy + 22]], flagCols[i % 8]);
  if (i < 15) thinLine(fx + 34, fy, 60 + (i + 1) * 58, 312 + Math.sin(((i + 1) / 15) * Math.PI) * 10, [90, 58, 36]);
}
// WALL CLOCK, NEAR MIDNIGHT (11:58)
fillCircle(352, 330, 25, [252, 248, 238]);
circleOutline(352, 330, 25, 3, INK);
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  fillCircle(352 + Math.sin(a) * 20, 330 - Math.cos(a) * 20, 1.6, INK);
}
thickLine(352, 330, 352 - 3, 330 - 13, 3, INK);
thickLine(352, 330, 352 - 5, 330 - 19, 2.4, INK);
fillCircle(352, 330, 2.6, RED);
// OVERTIME BADGE, TOP RIGHT, WHOLE
roundRect(838, 306, 156, 30, 6, RED);
drawText('OVERTIME', 916, 312, 19, [255, 255, 255], 'c', 1, 0.22);
// SIDE TABLE + GLOBE, RIGHT
fillRect(852, 500, 118, 8, [122, 82, 46]);
fillRect(860, 508, 8, 52, [96, 62, 34]); fillRect(954, 508, 8, 52, [96, 62, 34]);
fillCircle(911, 468, 27, [46, 134, 193]);
fillEllipse(902, 462, 12, 7, [39, 174, 96]); fillEllipse(918, 478, 9, 6, [39, 174, 96]); fillEllipse(912, 452, 6, 4, [39, 174, 96]);
circleOutline(911, 468, 27, 2.5, NAVY);
thickLine(911, 495, 911, 500, 3, NAVY);
fillRect(894, 492, 34, 5, NAVY);
// DELEGATES (5, DETAILED FACES)
delegate(330, [38, 58, 92], [222, 178, 142], 'parted');
delegate(420, [92, 38, 44], [198, 152, 118], 'grey', { glasses: true });
delegate(512, [30, 70, 52], [232, 190, 152], 'bald', { beard: true });
delegate(604, [70, 44, 84], [240, 200, 168], 'bob');
delegate(694, [52, 52, 58], [210, 166, 130], 'curly');
// ROUND TABLE
fillEllipse(512, 512, 268, 40, [122, 82, 46]);
fillRect(244, 512, 536, 44, [96, 62, 34]);
fillEllipse(512, 556, 268, 14, [80, 50, 26]);
// MICROPHONES + GLASSES ON THE TABLE
for (const mx of [300, 400, 624, 724]) {
  thickLine(mx, 512, mx, 492, 2.4, INK); fillCircle(mx, 488, 5, INK);
}
fillRect(452, 500, 10, 12, [200, 220, 230]); fillRect(566, 500, 10, 12, [200, 220, 230]);
// DRAFT DOCUMENT, DRAWN AFTER THE TABLE SO IT SITS ON TOP OF IT,
// FOSSIL FUELS CROSSED WITH ONE CLEAN LINE
fillPoly([[468, 482], [548, 476], [556, 516], [476, 522]], [255, 255, 255]);
drawText('DRAFT', 512, 480, 9, RED, 'c', 1, 0.22);
drawText('FOSSIL FUELS', 512, 494, 10.5, INK, 'c', 0.5, 0.22);
thickLine(474, 502, 550, 497, 3, RED);
fillRect(478, 508, 66, 2, [160, 160, 160]); fillRect(478, 513, 52, 2, [160, 160, 160]);
// CAPTION UNDER THE SCENE
drawText('ANTALYA, TURKIYE - DELEGATES WAIT FOR A NEW DRAFT AS THE CLOCK NEARS MIDNIGHT', 512, 568, 12, [90, 80, 66], 'c', 0.5, 0.2);

// ---------- SECONDARY ROW (Y 592..800) ----------
fillRect(30, 588, 964, 2, NAVY);
function thumbFrame(x: number, y: number, w: number, h: number): void {
  fillRect(x - 2, y - 2, w + 4, h + 4, NAVY);
}
// --- THUMB 1: POLAND ---
thumbFrame(30, 596, 310, 112);
fillRect(30, 596, 310, 112, [214, 226, 238]);
fillRect(30, 664, 310, 44, [96, 148, 74]);
fillRect(30, 690, 310, 18, [74, 120, 58]);
fillPoly([[52, 664], [52, 640], [88, 640], [88, 664]], [250, 248, 240]);
fillPoly([[46, 642], [70, 622], [94, 642]], RED);
fillRect(64, 650, 8, 14, NAVY);
for (const px0 of [110, 128, 146]) {
  fillPoly([[px0, 664], [px0 + 9, 630], [px0 + 18, 664]], [34, 96, 52]);
  fillRect(px0 + 7, 664, 4, 6, [90, 58, 36]);
}
thickLine(300, 664, 300, 612, 3, INK);
fillRect(300, 612, 30, 9, [255, 255, 255]); fillRect(300, 621, 30, 9, RED);
fillEllipse(232, 690, 42, 12, [88, 66, 44]);
fillEllipse(232, 688, 30, 8, [60, 44, 30]);
thickLine(214, 700, 252, 648, 9, [150, 152, 155]);
fillPoly([[252, 648], [262, 640], [258, 654]], [120, 122, 125]);
fillPoly([[226, 678], [214, 668], [222, 684]], [120, 122, 125]);
// POLAND SMOKE — RISING, SPREADING, FEATHERY (FIX B)
polandSmoke(238, 668, 0.62);
// --- THUMB 2: KYIV ---
thumbFrame(357, 596, 310, 112);
fillRect(357, 596, 310, 112, [226, 178, 128]);
fillRect(357, 676, 310, 32, [70, 110, 150]);
fillRect(357, 640, 60, 36, [96, 88, 96]); fillRect(417, 628, 52, 48, [110, 100, 108]);
fillRect(600, 648, 44, 28, [250, 248, 240]);
fillCircle(622, 640, 14, [212, 164, 52]);
fillPoly([[622, 622], [626, 630], [622, 634], [618, 630]], [212, 164, 52]);
thickLine(622, 620, 622, 610, 2, [212, 164, 52]); thickLine(616, 614, 628, 614, 2, [212, 164, 52]);
thickLine(370, 668, 540, 668, 5, [60, 60, 66]);
thickLine(400, 668, 420, 690, 4, [60, 60, 66]); thickLine(440, 668, 420, 690, 4, [60, 60, 66]);
thickLine(470, 668, 480, 640, 5, [60, 60, 66]);
thickLine(480, 640, 500, 668, 2.5, [60, 60, 66]);
thickLine(500, 668, 520, 690, 4, [60, 60, 66]); thickLine(540, 668, 520, 690, 4, [60, 60, 66]);
fillEllipse(420, 672, 16, 6, [230, 120, 40]); fillEllipse(420, 670, 9, 4, [250, 190, 60]);
// KYIV SMOKE — ORGANIC, NO BUBBLE HIGHLIGHTS (FIX A)
kyivSmoke(470, 632, 0.55);
kyivSmoke(580, 640, 0.42);
// --- THUMB 3: MARKETS ---
thumbFrame(684, 596, 310, 112);
fillRect(684, 596, 310, 112, [255, 255, 255]);
fillRect(700, 610, 278, 2, [200, 200, 200]); fillRect(700, 610, 2, 84, [200, 200, 200]);
const chart: [number, number][] = [[800, 622], [830, 634], [856, 628], [884, 652], [912, 646], [940, 672], [966, 690]];
for (let i = 0; i + 1 < chart.length; i++) thickLine(chart[i][0], chart[i][1], chart[i + 1][0], chart[i + 1][1], 4, RED);
for (const p of chart) fillCircle(p[0], p[1], 3.5, RED);
drawText('S&P -3.7%', 700, 604, 15, RED, 'l', 0.5, 0.22);
drawText('NASDAQ -5.3%', 852, 604, 13, INK, 'l', 0.5, 0.22);
// COLUMN TEXT
function column(x: number, kicker: string, head: string, b1: string, b2: string): void {
  drawText(kicker, x, 716, 12, RED, 'l', 2, 0.22);
  const hl = wrap(head, 310, 18, 0.5);
  hl.forEach((ln, i) => drawText(ln, x, 734 + i * 21, 18, NAVY, 'l', 0.5, 0.2));
  const by = 734 + hl.length * 21 + 4;
  const l1 = wrap(b1, 310, 13, 0.3);
  l1.forEach((ln, i) => drawText(ln, x, by + i * 16, 13, INK, 'l', 0.3, 0.22));
  const by2 = by + l1.length * 16 + 2;
  const l2 = wrap(b2, 310, 13, 0.3);
  l2.forEach((ln, i) => drawText(ln, x, by2 + i * 16, 13, INK, 'l', 0.3, 0.22));
}
column(30, 'POLAND', 'RUSSIAN KH-101 FALLS IN POLAND', 'NATO CALLS IT A GRAVE VIOLATION', 'NO CASUALTIES REPORTED');
column(357, 'KYIV', 'KYIV HIT BY 84 MISSILES', '404 DRONES, 3 DNIPRO BRIDGES HIT', 'POWER, HEAT, WATER CUT');
column(684, 'MARKETS', 'AI SELL-OFF DRAGS US STOCKS DOWN', 'S&P -3.7% IN CORRECTION', 'NASDAQ -5.3% - NVDA -14%');

// ---------- FOOTER: IN BRIEF ----------
fillRect(30, 834, 964, 2, NAVY);
drawText('IN BRIEF', 512, 844, 20, NAVY, 'c', 6, 0.2);
fillRect(30, 870, 964, 1, [150, 140, 120]);
function brief(x: number, title: string, body: string): void {
  drawText(title, x, 882, 15, RED, 'l', 1, 0.22);
  const ls = wrap(body, 226, 13, 0.3);
  ls.forEach((ln, i) => drawText(ln, x, 904 + i * 17, 13, INK, 'l', 0.3, 0.22));
}
brief(30, 'CYCLONE AKVAN', '370,000 EVACUATED IN ODISHA. NO DEATHS.');
brief(271, 'WORLD COURT', 'ACTION FOLLOWS MYANMAR RULING.');
brief(512, 'FRANCE', 'SEEKS UN SECURITY COUNCIL MEETING ON KYIV.');
brief(753, 'ESTONIA', 'TO CLOSE RUSSIAN BORDER FROM 1 DEC.');
fillRect(30, 968, 964, 2, NAVY);
drawText('THE WORLD - IN ONE IMAGE - 21 NOVEMBER 2026', 512, 978, 12, [90, 80, 66], 'c', 1, 0.2);

// ---------- PNG ENCODE (DETERMINISTIC) ----------
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii');
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, 'ascii'), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0;
  raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
