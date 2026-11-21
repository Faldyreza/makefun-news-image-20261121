// main.ts — news-image-20261121 v5
// Node 22 stdlib only. Draws a 1024x1024 newspaper front page for
// Saturday, 21 November 2026: COP31 overtime lead, Poland missile,
// Kyiv barrage, Wall Street AI sell-off, IN BRIEF footer.
// Pure procedural Canvas-2D-style rasteriser + hand-authored stroke
// font + pure-stdlib PNG encoder. No network. Deterministic.
// Facts verified live for v1-v4; numbers reused unchanged here.
// Run: MAKEFUN_OUTPUT_DIR=out node main.ts
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { join } from "node:path";

const W = 1024, H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// ---------- palette ----------
const PAPER = [245, 239, 225], INK = [23, 19, 12], TEAL = [13, 85, 96];
const RED = [176, 39, 24], GREY = [110, 100, 84], WALL = [233, 220, 188];
const WOOD = [156, 107, 63], WOOD_D = [110, 74, 40], FLOOR = [138, 106, 68];
const GOLD = [217, 164, 65], GREEN = [63, 122, 78], BLUE = [47, 93, 138];
const SKY1 = [247, 201, 72], SKY2 = [240, 138, 60], SKY3 = [226, 96, 122], SKY4 = [141, 107, 158];
const BLDG = [70, 59, 82], NIGHT = [29, 44, 78], WHITE = [253, 251, 245];

// ---------- framebuffer ----------
const fb = new Uint8Array(W * H * 3);
function fill(c: number[]) { for (let i = 0; i < W * H; i++) { fb[i * 3] = c[0]; fb[i * 3 + 1] = c[1]; fb[i * 3 + 2] = c[2]; } }
function setPx(x: number, y: number, c: number[]) {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const i = (yi * W + xi) * 3; fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2];
}
function rect(x: number, y: number, w: number, h: number, c: number[]) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const i = (yy * W + xx) * 3; fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2];
  }
}
function disc(cx: number, cy: number, r: number, c: number[]) {
  const rr = Math.max(0.5, r), x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(W - 1, Math.ceil(cx + rr));
  const y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(H - 1, Math.ceil(cy + rr));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= rr * rr) setPx(x, y, c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: number[]) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
    const t = 1 - (dy * dy) / (ry * ry); if (t < 0) continue;
    const hw = rx * Math.sqrt(t);
    rect(cx - hw, cy + dy, hw * 2, 1, c);
  }
}
function ring(cx: number, cy: number, r: number, w: number, c: number[]) {
  const n = Math.max(24, Math.ceil(2 * Math.PI * r / Math.max(1, w * 0.4)));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w / 2, c);
  }
}
function seg(x1: number, y1: number, x2: number, y2: number, w: number, c: number[]) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const n = Math.max(1, Math.ceil(len / Math.max(0.8, w * 0.35)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    disc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, c);
  }
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number, w: number, c: number[]) {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / Math.max(1, w * 0.4)));
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, w / 2, c);
  }
}
// Filled polygon (scanline), optional vertical clip [cy0, cy1].
function poly(pts: number[][], c: number[], cy0 = -1e9, cy1 = 1e9) {
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const y0 = Math.max(0, Math.ceil(Math.max(minY, cy0))), y1 = Math.min(H - 1, Math.floor(Math.min(maxY, cy1)));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5, xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
        xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) rect(xs[i], y, xs[i + 1] - xs[i], 1, c);
  }
}
// Arched window outline points (rect + semicircular top).
function archPts(x: number, yTop: number, w: number, h: number): number[][] {
  const r = w / 2, cx = x + r, cyTop = yTop + r, pts: number[][] = [];
  pts.push([x, yTop + h], [x, cyTop]);
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI + (i / 16) * Math.PI;
    pts.push([cx + Math.cos(a) * r, cyTop + Math.sin(a) * r]);
  }
  pts.push([x + w, cyTop], [x + w, yTop + h]);
  return pts;
}

// ---------- stroke font ----------
// Grid: x 0..4, y 0..6 cap, 7 descender. "Ocx,cy,r" = ring (for %, &).
const FONT: Record<string, string> = {
  A: "0,6 2,0 4,6|1,4 3,4", B: "0,0 0,6|0,0 3,0 4,1 4,2 3,3 0,3|3,3 4,4 4,5 3,6 0,6",
  C: "4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5", D: "0,0 0,6 3,6 4,5 4,1 3,0 0,0",
  E: "4,0 0,0 0,6 4,6|0,3 3,3", F: "0,6 0,0 4,0|0,3 3,3",
  G: "4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,3 2,3", H: "0,0 0,6|4,0 4,6|0,3 4,3",
  I: "2,0 2,6|0,0 4,0|0,6 4,6", J: "1,0 4,0|4,0 4,5 3,6 1,6 0,5",
  K: "0,0 0,6|4,0 0,3 4,6", L: "0,0 0,6 4,6", M: "0,6 0,0 2,3 4,0 4,6",
  N: "0,6 0,0 4,6 4,0", O: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0",
  P: "0,6 0,0 3,0 4,1 4,2 3,3 0,3", Q: "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0|3,4 4.5,6",
  R: "0,6 0,0 3,0 4,1 4,2 3,3 0,3|2,3 4,6",
  S: "4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5",
  T: "0,0 4,0|2,0 2,6", U: "0,0 0,5 1,6 3,6 4,5 4,0", V: "0,0 2,6 4,0",
  W: "0,0 1,6 2,3 3,6 4,0", X: "0,0 4,6|4,0 0,6", Y: "0,0 2,3 4,0|2,3 2,6", Z: "0,0 4,0 0,6 4,6",
  a: "3,2 4,3 4,6 3,6 1,6 0,5 0,4 1,3 3,3|4,2 4,6",
  b: "0,0 0,6|0,4 1,3 3,3 4,4 4,5 3,6 1,6 0,5",
  c: "4,3 3,2 1,2 0,3 0,5 1,6 3,6 4,5",
  d: "4,0 4,6|4,4 3,3 1,3 0,4 0,5 1,6 3,6 4,5",
  e: "4,5 3,6 1,6 0,5 0,3 1,2 3,2 4,3 4,4 1,4",
  f: "3,0 2,1 2,6|1,2 3,2",
  g: "4,3 4,6 3,6 1,6 0,5 0,4 1,3 3,3|4,5 4,7 3,7 2,7",
  h: "0,0 0,6|0,3 1,2 3,2 4,3 4,6",
  i: "2,2 2,6|2,0.5 2,0.5", j: "3,2 3,6 2,7 1,7|3,0.5 3,0.5",
  k: "0,0 0,6|4,2 0,4 3,6", l: "2,0 2,6",
  m: "0,6 0,2 1,2 2,3 2,6|2,3 3,2 4,3 4,6",
  n: "0,6 0,2 1,2 3,2 4,3 4,6",
  o: "1,2 3,2 4,3 4,5 3,6 1,6 0,5 0,3 1,2",
  p: "0,7 0,3 1,2 3,2 4,3 4,5 3,6 1,6 0,5",
  q: "4,7 4,3 3,2 1,2 0,3 0,5 1,6 3,6 4,5",
  r: "0,6 0,2 1,2 3,2 3,3",
  s: "4,3 3,2 1,2 0,3 1,4 3,4 4,5 3,6 1,6 0,5",
  t: "2,0 2,6|1,3 3,3|2,6 3,6",
  u: "0,2 0,5 1,6 3,6 4,5 4,2", v: "0,2 2,6 4,2", w: "0,2 1,6 2,3 3,6 4,2",
  x: "0,2 4,6|4,2 0,6", y: "0,2 2,5 4,2|2,5 2,7 1,7", z: "0,2 4,2 0,6 4,6",
  "0": "1,0 3,0 4,1 4,5 3,6 1,6 0,5 0,1 1,0", "1": "1,1 2,0 2,6|0,6 4,6",
  "2": "1,0 3,0 4,1 4,2 3,3 2,4 0,6 4,6", "3": "1,0 3,0 4,1 4,2 3,3 4,4 4,5 3,6 1,6",
  "4": "0,0 0,3 4,3|3,0 3,6", "5": "4,0 0,0 0,3 1,3 3,3 4,4 4,5 3,6 1,6 0,5",
  "6": "4,1 3,0 1,0 0,1 0,5 1,6 3,6 4,5 4,4 3,3 1,3 0,4",
  "7": "0,0 4,0 2,6",
  "8": "1,0 3,0 4,1 4,2 3,3 1,3 0,2 0,1 1,0|1,3 3,3 4,4 4,5 3,6 1,6 0,5 0,4 1,3",
  "9": "0,5 1,6 3,6 4,5 4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4",
  " ": "", ".": "2,6 2,6", ",": "2,6 2,7 1,7", ":": "2,2 2,2|2,5 2,5",
  ";": "2,2 2,2|2,5 2,7 1,7", "-": "0,3 4,3", "—": "0,3 4,3", "–": "0,3 4,3",
  "(": "3,0 2,1 1,3 2,5 3,6", ")": "1,0 2,1 3,3 2,5 1,6", "/": "4,0 0,6",
  "%": "O1.3,1.5,1.35|O3.7,5.1,1.35|4.3,0.3 0.3,6.3",
  "&": "A2.4,2.1,1.45,0.4,5.7|3.9,1.0 0.7,6.3|0.7,6.3 2.0,6.4 3.0,5.9",
  "$": "2,0 2,6|4,1 3,0 1,0 0,1 0,2 1,3 3,3 4,4 4,5 3,6 1,6 0,5",
  "+": "2,0 2,6|0,3 4,3", "=": "0,2 4,2|0,4 4,4",
  "?": "1,1 3,0 4,1 4,2 3,3 2,3 2,4|2,6 2,6", "!": "2,0 2,4|2,6 2,6",
  "'": "2,0 1.6,2", "’": "2,0 1.6,2", '"': "1,0 1,2|3,0 3,2",
  "•": "O2,3,0.8", "·": "2,3 2,3", "#": "1,0 1,6|3,0 3,6|0,2 4,2|0,4 4,4",
  "°": "O2,1,0.8", "*": "2,0 2,6|0,1 4,5|4,1 0,5",
  "[": "1,0 0,0 0,6 1,6", "]": "3,0 4,0 4,6 3,6", "_": "0,6 4,6",
  "<": "4,1 1,3 4,5", ">": "0,1 3,3 0,5", "~": "0,3 1,2 2,3 3,2 4,3",
};
function adv(ch: string, u: number): number {
  if (ch === " " || "ilj.,:;!'".includes(ch)) return 3.6 * u;
  if (ch === "%") return 7 * u;
  if ("MWmw".includes(ch)) return 6.8 * u;
  return 6 * u;
}
function textW(s: string, capH: number): number {
  const u = capH / 7; let w = 0;
  for (const ch of s) w += adv(ch, u);
  return w;
}
function glyph(x: number, yTop: number, ch: string, u: number, sw: number, c: number[]) {
  const g = FONT[ch]; if (g === undefined) return;
  const w = ch === "%" ? sw * 1.35 : ch === "&" ? sw * 1.1 : sw; // bold, assertive % and &
  for (const tok of g.split("|")) {
    if (!tok) continue;
    if (tok[0] === "A") {
      const [cx, cy, r, a0, a1] = tok.slice(1).split(",").map(Number);
      arc(x + cx * u, yTop + cy * u, r * u, a0, a1, w, c);
    } else if (tok[0] === "O") {
      const [cx, cy, r] = tok.slice(1).split(",").map(Number);
      ring(x + cx * u, yTop + cy * u, r * u, w, c);
    } else {
      const pts = tok.split(" ").map((s) => s.split(",").map(Number));
      for (let i = 0; i + 1 < pts.length; i++)
        seg(x + pts[i][0] * u, yTop + pts[i][1] * u, x + pts[i + 1][0] * u, yTop + pts[i + 1][1] * u, w, c);
      if (pts.length === 1) disc(x + pts[0][0] * u, yTop + pts[0][1] * u, w / 2, c);
    }
  }
}
function drawText(x: number, yTop: number, s: string, capH: number, c: number[], bold = false, align: "left" | "center" | "right" = "left") {
  const u = capH / 7, sw = capH * (bold ? 0.2 : 0.15);
  let xx = x;
  if (align === "center") xx = x - textW(s, capH) / 2;
  if (align === "right") xx = x - textW(s, capH);
  for (const ch of s) { glyph(xx, yTop, ch, u, sw, c); xx += adv(ch, u); }
}
function wrap(s: string, capH: number, maxW: number): string[] {
  const words = s.split(" "), lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const t = cur ? cur + " " + wd : wd;
    if (textW(t, capH) <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
// Rich wrap: words with bold flags (for IN BRIEF lead-ins).
function wrapRich(words: { t: string; b: boolean }[], capH: number, maxW: number): { t: string; b: boolean }[][] {
  const u = capH / 7, lines: { t: string; b: boolean }[][] = [];
  let cur: { t: string; b: boolean }[] = [], curW = 0;
  for (const wd of words) {
    const w = textW(wd.t, capH) + (cur.length ? 3.6 * u : 0);
    if (curW + w <= maxW || !cur.length) { cur.push(wd); curW += w; }
    else { lines.push(cur); cur = [wd]; curW = textW(wd.t, capH); }
  }
  if (cur.length) lines.push(cur);
  return lines;
}
function drawRichLine(x: number, yTop: number, words: { t: string; b: boolean }[], capH: number, c: number[]) {
  const u = capH / 7;
  let xx = x;
  for (const wd of words) {
    const sw = capH * (wd.b ? 0.2 : 0.15);
    for (const ch of wd.t) { glyph(xx, yTop, ch, u, sw, c); xx += adv(ch, u); }
    xx += 3.6 * u;
  }
}

// ---------- PNG encoder ----------
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), data])), 8 + data.length);
  return out;
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) { raw[y * (1 + W * 3)] = 0; raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- delegates ----------
function face(cx: number, cy: number, skin: number[], glasses: boolean) {
  // eyes, bold brows, simple nose, natural smile
  disc(cx - 12, cy - 2, 2.6, INK); disc(cx + 12, cy - 2, 2.6, INK);
  seg(cx - 18, cy - 11, cx - 7, cy - 9, 3.4, INK); seg(cx + 7, cy - 9, cx + 18, cy - 11, 3.4, INK);
  seg(cx - 1, cy + 1, cx - 3, cy + 10, 2.4, [120, 80, 50]); seg(cx - 3, cy + 10, cx + 2, cy + 10, 2.2, [120, 80, 50]);
  arc(cx, cy + 12, 9, Math.PI * 0.15, Math.PI * 0.85, 2.4, [90, 40, 30]);
  if (glasses) {
    ring(cx - 12, cy - 2, 7, 2, INK); ring(cx + 12, cy - 2, 7, 2, INK);
    seg(cx - 5, cy - 3, cx + 5, cy - 3, 2, INK);
  }
}
function delegate(cx: number, skin: number[], hair: number[], suit: number[], style: number, glasses: boolean) {
  const cy = 415, r = 32;
  ellipse(cx, 482, 56, 42, suit); // shoulders behind table
  disc(cx - 31, cy + 2, 6, skin); disc(cx + 31, cy + 2, 6, skin); // ears
  disc(cx, cy, r, skin); // head
  if (style === 0) {
    // short dark hair, uneven fringe (clearly hair, not a hat)
    const pts: number[][] = [];
    for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; pts.push([cx + Math.cos(a) * r, cy - 2 + Math.sin(a) * (r - 1)]); }
    const zig = [cx + 30, cy - 9, cx + 20, cy - 14, cx + 10, cy - 8, cx, cy - 13, cx - 10, cy - 8, cx - 20, cy - 14, cx - 30, cy - 9];
    for (let i = 0; i < zig.length; i += 2) pts.push([zig[i], zig[i + 1]]);
    poly(pts, hair);
    seg(cx - 8, cy - 20, cx - 2, cy - 14, 2, [60, 40, 25]); seg(cx + 6, cy - 22, cx + 12, cy - 15, 2, [60, 40, 25]);
  } else if (style === 1) {
    // grey curls: bumpy ring of curls + texture dots
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      disc(cx + Math.cos(a) * (r - 3), cy - 2 + Math.sin(a) * (r - 3), 10, hair);
    }
    disc(cx - 18, cy - 22, 3, [90, 90, 90]); disc(cx + 4, cy - 28, 3, [90, 90, 90]); disc(cx + 20, cy - 18, 3, [90, 90, 90]);
  } else if (style === 2) {
    // long hair framing the face, down to the shoulders
    const pts: number[][] = [];
    for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; pts.push([cx + Math.cos(a) * r, cy - 2 + Math.sin(a) * (r - 1)]); }
    pts.push([cx + 31, cy + 62], [cx + 24, cy + 62], [cx + 26, cy - 6]);
    pts.push([cx - 26, cy - 6], [cx - 24, cy + 62], [cx - 31, cy + 62]);
    poly(pts, hair);
    seg(cx - 20, cy - 18, cx - 16, cy + 10, 2, [40, 22, 12]); seg(cx + 20, cy - 18, cx + 16, cy + 10, 2, [40, 22, 12]);
  } else {
    // swept wavy fringe, one strand falling on the forehead
    const pts: number[][] = [];
    for (let i = 0; i <= 14; i++) { const a = Math.PI + (i / 14) * Math.PI; pts.push([cx + Math.cos(a) * r, cy - 2 + Math.sin(a) * (r - 1)]); }
    pts.push([cx + 30, cy - 8], [cx + 14, cy - 16], [cx - 2, cy - 10], [cx - 16, cy - 17], [cx - 30, cy - 8]);
    poly(pts, hair);
    arc(cx - 8, cy - 12, 10, Math.PI * 1.1, Math.PI * 1.9, 2, [120, 70, 20]);
    seg(cx + 18, cy - 20, cx + 22, cy - 8, 2, [120, 70, 20]);
  }
  face(cx, cy, skin, glasses);
}

// ---------- page ----------
fill(PAPER);

// Masthead
drawText(512, 22, "THE WORLD", 60, INK, true, "center");
rect(34, 94, 956, 3, INK);
drawText(512, 104, "IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026", 18, INK, true, "center");
rect(34, 130, 956, 2, INK);

// Headline band
drawText(512, 136, "CLIMATE SUMMIT • ANTALYA, TURKIYE", 14, TEAL, true, "center");
drawText(512, 162, "COP31 TALKS RUN", 44, INK, true, "center");
drawText(512, 212, "INTO OVERTIME", 44, INK, true, "center");

// ---- Lead scene: COP31 hall ----
const SX = 34, SY = 268, SW = 956, SH = 280;
rect(SX, SY, SW, SH, WALL);
rect(SX, SY + 262, SW, 18, FLOOR);
// Arched windows with sunset bands; sun high, buildings low.
const wins = [70, 392, 714];
for (const wx of wins) {
  const pts = archPts(wx, 296, 240, 174);
  poly(pts, SKY1, 296, 336); poly(pts, SKY2, 336, 376); poly(pts, SKY3, 376, 416); poly(pts, SKY4, 416, 470);
  // low building silhouettes (bottom of window only)
  const bx = wx + 12;
  rect(bx, 448, 46, 22, BLDG); rect(bx + 54, 436, 34, 34, BLDG); rect(bx + 96, 452, 52, 18, BLDG); rect(bx + 156, 440, 40, 30, BLDG); rect(bx + 204, 454, 26, 16, BLDG);
  // window frame
  const fr = archPts(wx - 4, 292, 248, 178);
  for (let i = 0; i + 1 < fr.length; i++) seg(fr[i][0], fr[i][1], fr[i + 1][0], fr[i + 1][1], 3, WOOD_D);
}
// Sun: whole, high in the middle window, clear of buildings.
ring(512, 332, 31, 3, [247, 183, 51]);
disc(512, 332, 25, [255, 223, 107]); disc(512, 332, 17, [255, 233, 138]);
// Bunting: 16 flags strung across the hall.
{
  const cols = [RED, TEAL, GOLD, GREEN, BLUE];
  for (let i = 0; i < 16; i++) {
    const x0 = 44 + i * 59, x1 = x0 + 59;
    const y0 = 274 + Math.sin((i / 15) * Math.PI) * 10, y1 = 274 + Math.sin(((i + 1) / 15) * Math.PI) * 10;
    seg(x0, y0, x1, y1, 1.6, INK);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    poly([[x0 + 4, y0 + 1], [x1 - 4, y1 + 1], [mx, my + 17]], cols[i % 5]);
  }
}
// Wall clock near midnight + OVERTIME (gap between left and middle windows).
disc(351, 330, 27, WHITE); ring(351, 330, 27, 3, INK);
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * 2 * Math.PI;
  seg(351 + Math.cos(a) * 22, 330 + Math.sin(a) * 22, 351 + Math.cos(a) * 25, 330 + Math.sin(a) * 25, 2, INK);
}
seg(351, 330, 351 + Math.cos(-Math.PI / 2 - 0.087) * 18, 330 + Math.sin(-Math.PI / 2 - 0.087) * 18, 3, INK); // minute hand 11:57
seg(351, 330, 351 + Math.cos(-Math.PI / 2 - 0.21) * 12, 330 + Math.sin(-Math.PI / 2 - 0.21) * 12, 4, INK); // hour hand
disc(351, 330, 2.6, INK);
drawText(351, 362, "OVERTIME", 13, RED, true, "center");
// COP31 wall plaque (gap between middle and right windows).
rect(648, 306, 52, 46, WHITE); rect(648, 306, 52, 46, INK);
rect(651, 309, 46, 40, WHITE);
drawText(674, 316, "COP31", 13, TEAL, true, "center");
drawText(674, 334, "ANTALYA", 8, INK, true, "center");

// Delegates behind the round table.
delegate(330, [232, 185, 138], [42, 30, 20], [31, 58, 96], 0, false);
delegate(450, [201, 141, 95], [150, 150, 150], [96, 32, 40], 1, false);
delegate(575, [138, 90, 59], [28, 18, 12], [13, 85, 96], 2, false);
delegate(700, [240, 200, 160], [176, 120, 40], [52, 52, 52], 3, true);
// Round table.
ellipse(512, 552, 306, 10, [217, 203, 166]);
ellipse(512, 502, 310, 46, WOOD_D); ellipse(512, 498, 304, 42, WOOD);
// DRAFT document on the table: FOSSIL FUELS struck with one straight red line.
rect(428, 476, 170, 54, [220, 205, 180]); rect(430, 478, 166, 50, WHITE);
drawText(513, 479, "DRAFT", 12, GREY, true, "center");
drawText(513, 494, "FOSSIL FUELS", 14, INK, true, "center");
seg(436, 503, 590, 503, 3.4, RED); // one clean straight strike
drawText(513, 512, "$120bn / YEAR", 11, TEAL, true, "center");
// Side table (right) with globe.
rect(848, 500, 108, 8, WOOD_D); rect(858, 508, 8, 38, WOOD_D); rect(938, 508, 8, 38, WOOD_D);
disc(902, 462, 31, [58, 130, 190]);
ellipse(892, 456, 12, 7, GREEN); ellipse(912, 470, 9, 6, GREEN); ellipse(898, 476, 6, 4, GREEN);
ring(902, 462, 31, 2.4, [30, 70, 120]);
rect(898, 492, 8, 6, GOLD); rect(884, 498, 36, 5, GOLD);

// Lead factual lines.
drawText(512, 560, "Deadline missed on Friday as ~200 nations haggle in Antalya.", 17, INK, true, "center");
drawText(512, 583, "New draft drops any mention of fossil fuels,", 17, INK, true, "center");
drawText(512, 606, "and of $120bn a year for adaptation.", 17, INK, true, "center");

rect(34, 636, 956, 2, INK);

// ---- Secondary stories ----
const cols = [
  { x: 34, head: "RUSSIAN MISSILE FALLS IN POLAND", body: "Kh-101 down at Nowy Lipowiec. NATO calls it a grave violation. No casualties reported." },
  { x: 362, head: "KYIV HIT BY 84 MISSILES, 404 DRONES", body: "84 missiles, 404 drones. Three Dnipro bridges hit. Power, heat, water cut." },
  { x: 690, head: "WALL ST SLIDES AS AI RALLY STALLS", body: "S&P 500 down 3.7%, in correction. Nasdaq down 5.3%. Nvidia down 14%." },
];
// Thumbnail 1: Poland, night sky, missile streak, burst.
rect(34, 646, 300, 100, NIGHT);
seg(120, 664, 168, 686, 3, WHITE); disc(168, 686, 4, WHITE);
{
  const cx = 190, cy = 692, star: number[][] = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI - Math.PI / 2, r = i % 2 ? 10 : 26; star.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  poly(star, [245, 154, 46]); disc(cx, cy, 10, [255, 223, 107]);
}
rect(34, 726, 300, 20, [46, 42, 36]);
drawText(44, 656, "POLAND", 13, WHITE, true, "left");
// Thumbnail 2: Kyiv, bridge over the Dnipro, broken span, smoke.
rect(362, 646, 300, 100, [216, 160, 106]);
rect(362, 716, 300, 30, [63, 109, 138]);
seg(372, 700, 496, 700, 6, [52, 46, 44]); seg(528, 700, 652, 700, 6, [52, 46, 44]);
seg(496, 700, 512, 714, 5, [52, 46, 44]);
disc(500, 682, 10, [150, 140, 128]); disc(514, 672, 12, [170, 160, 148]); disc(488, 670, 8, [150, 140, 128]);
disc(512, 694, 7, [245, 154, 46]);
drawText(372, 656, "KYIV", 13, INK, true, "left");
// Thumbnail 3: markets, falling chart; S&P label kept far from the line.
rect(690, 646, 300, 100, [253, 251, 245]);
seg(700, 736, 700, 656, 2, INK); seg(700, 736, 980, 736, 2, INK);
{
  const pts: [number, number][] = [[712, 668], [762, 684], [812, 676], [862, 700], [912, 716], [968, 734]];
  for (let i = 0; i + 1 < pts.length; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 4, RED);
  for (const p of pts) disc(p[0], p[1], 4, RED);
}
drawText(980, 654, "S&P -3.7%", 15, RED, true, "right");

for (const col of cols) {
  const lines = wrap(col.head, 18, 300);
  lines.forEach((ln, i) => drawText(col.x + 150, 754 + i * 22, ln, 18, INK, true, "center"));
  const blines = wrap(col.body, 15, 300);
  blines.slice(0, 4).forEach((ln, i) => drawText(col.x, 806 + i * 18, ln, 15, INK, false, "left"));
}

// ---- IN BRIEF footer ----
rect(34, 890, 956, 2, INK);
drawText(34, 898, "IN BRIEF", 16, INK, true, "left");
const briefs: { t: string; b: boolean }[][] = [
  [{ t: "CYCLONE", b: true }, { t: "AKVAN", b: true }, { t: "—", b: true }, { t: "370,000", b: false }, { t: "flee", b: false }, { t: "Odisha;", b: false }, { t: "no", b: false }, { t: "deaths.", b: false }],
  [{ t: "WORLD", b: true }, { t: "COURT", b: true }, { t: "—", b: true }, { t: "Action", b: false }, { t: "follows", b: false }, { t: "the", b: false }, { t: "Myanmar", b: false }, { t: "ruling.", b: false }],
  [{ t: "FRANCE", b: true }, { t: "—", b: true }, { t: "Seeks", b: false }, { t: "a", b: false }, { t: "UN", b: false }, { t: "Security", b: false }, { t: "Council", b: false }, { t: "session", b: false }, { t: "on", b: false }, { t: "Kyiv.", b: false }],
  [{ t: "ESTONIA", b: true }, { t: "—", b: true }, { t: "To", b: false }, { t: "close", b: false }, { t: "its", b: false }, { t: "Russia", b: false }, { t: "border", b: false }, { t: "from", b: false }, { t: "1", b: false }, { t: "December.", b: false }],
];
briefs.forEach((words, i) => {
  const x = 34 + i * 244;
  const lines = wrapRich(words, 15, 222);
  lines.slice(0, 3).forEach((ln, j) => drawRichLine(x, 922 + j * 18, ln, 15, INK));
});
drawText(512, 992, "THE WORLD — IN ONE IMAGE", 11, GREY, true, "center");

// ---------- output ----------
function copyDir(src: string, dst: string) {
  if (!existsSync(src)) return;
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src)) {
    const s = join(src, e), d = join(dst, e);
    if (statSync(s).isDirectory()) copyDir(s, d); else copyFileSync(s, d);
  }
}
mkdirSync(OUT, { recursive: true });
copyDir("app", join(OUT, "app"));
copyDir("screenshots", join(OUT, "screenshots"));
writeFileSync(join(OUT, "entry.png"), encodePNG());
const dossier = {
  title: "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026",
  competition: "news-image-20261121",
  version: 5,
  size: [1024, 1024],
  facts: [
    "COP31 Antalya overtime: Friday deadline missed; draft drops fossil-fuel mention and $120bn/year adaptation; ~200 nations; new draft due Saturday.",
    "Russian Kh-101 missile down in Nowy Lipowiec, Poland; NATO calls it a grave violation; no casualties.",
    "Kyiv barrage: 84 cruise missiles and 404 drones; three Dnipro bridges damaged; power, heat and water cut.",
    "Wall Street AI sell-off: S&P 500 -3.7% (correction), Nasdaq -5.3%, Nvidia -14%.",
    "Cyclone Akvan: 370,000 flee Odisha; no deaths reported.",
    "World Court action follows Myanmar ruling; France seeks UN Security Council session on Kyiv; Estonia to close Russia border from 1 December.",
  ],
};
writeFileSync(join(OUT, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
console.log("wrote", join(OUT, "entry.png"));
