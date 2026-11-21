// news-image-20261121 v3 — "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// Procedural Canvas-2D front page, Node 22 stdlib only, no network.
// Renders at 2x and downsamples for smooth (anti-aliased) curves and letters.
// Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR/entry.png), deterministic.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;
const SS = 2; // supersample factor
const PW = W * SS;
const PH = H * SS;

const img = new Uint8ClampedArray(PW * PH * 4);

// ---------- colour helpers ----------
type RGB = [number, number, number];
function hex(h: string): RGB {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ---------- low-level raster ----------
function setPx(sx: number, sy: number, c: RGB): void {
  if (sx < 0 || sy < 0 || sx >= PW || sy >= PH) return;
  const i = (sy * PW + sx) * 4;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
}
function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x * SS));
  const y0 = Math.max(0, Math.round(y * SS));
  const x1 = Math.min(PW, Math.round((x + w) * SS));
  const y1 = Math.min(PH, Math.round((y + h) * SS));
  for (let sy = y0; sy < y1; sy++) {
    let i = (sy * PW + x0) * 4;
    for (let sx = x0; sx < x1; sx++) {
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
      i += 4;
    }
  }
}
function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const rc = Math.round(r * SS);
  const ccx = Math.round(cx * SS);
  const ccy = Math.round(cy * SS);
  for (let dy = -rc; dy <= rc; dy++) {
    const hw = Math.floor(Math.sqrt(rc * rc - dy * dy));
    const sy = ccy + dy;
    if (sy < 0 || sy >= PH) continue;
    let i = (sy * PW + Math.max(0, ccx - hw)) * 4;
    const end = Math.min(PW - 1, ccx + hw);
    for (let sx = Math.max(0, ccx - hw); sx <= end; sx++) {
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
      i += 4;
    }
  }
}
function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  const rxS = rx * SS, ryS = ry * SS;
  const ccx = Math.round(cx * SS), ccy = Math.round(cy * SS);
  const rxi = Math.ceil(rxS), ryi = Math.ceil(ryS);
  for (let dy = -ryi; dy <= ryi; dy++) {
    const t = dy / ryS;
    if (t < -1 || t > 1) continue;
    const hw = Math.floor(rxS * Math.sqrt(1 - t * t));
    const sy = ccy + dy;
    if (sy < 0 || sy >= PH) continue;
    let i = (sy * PW + Math.max(0, ccx - hw)) * 4;
    const end = Math.min(PW - 1, ccx + hw);
    for (let sx = Math.max(0, ccx - hw); sx <= end; sx++) {
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
      i += 4;
    }
  }
}
// Scanline polygon fill. fill is a colour, or a function of the logical y (for gradients).
function fillPoly(pts: [number, number][], fill: RGB | ((y: number) => RGB)): void {
  const P = pts.map(([x, y]) => [x * SS, y * SS] as [number, number]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of P) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const y0 = Math.max(0, Math.ceil(minY));
  const y1 = Math.min(PH - 1, Math.floor(maxY));
  for (let sy = y0; sy <= y1; sy++) {
    const yc = sy + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < P.length; i++) {
      const [x1, y1p] = P[i];
      const [x2, y2p] = P[(i + 1) % P.length];
      if ((y1p <= yc && y2p > yc) || (y2p <= yc && y1p > yc)) {
        xs.push(x1 + (yc - y1p) * (x2 - x1) / (y2p - y1p));
      }
    }
    xs.sort((a, b) => a - b);
    const c = typeof fill === "function" ? fill(sy / SS) : fill;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const sx0 = Math.max(0, Math.ceil(xs[k]));
      const sx1 = Math.min(PW - 1, Math.floor(xs[k + 1]));
      let i = (sy * PW + sx0) * 4;
      for (let sx = sx0; sx <= sx1; sx++) {
        img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; img[i + 3] = 255;
        i += 4;
      }
    }
  }
}
// Thick line with round caps, drawn by stamping circles along the segment.
function line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  const bx0 = x0 * SS, by0 = y0 * SS, bx1 = x1 * SS, by1 = y1 * SS;
  const dx = bx1 - bx0, dy = by1 - by0;
  const len = Math.hypot(dx, dy);
  const r = Math.max(0.6, (w * SS) / 2);
  const step = Math.max(0.7, r * 0.8);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    fillCircle((bx0 + dx * t) / SS, (by0 + dy * t) / SS, r / SS, c);
  }
}
function polyline(pts: [number, number][], w: number, c: RGB, closed = false): void {
  for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
  if (closed && pts.length > 2) line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], w, c);
}
function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

// ---------- stroke font (single-line vector glyphs, smooth at any size) ----------
// Glyph space: 12 units tall (cap height), width per glyph. Strokes are polylines.
// Format: "w:stroke1;stroke2" where a stroke is "x,y x,y ...".
const FONT_SRC: Record<string, string> = {
  A: "10:1,12 5,0 9,12;3,8 7,8",
  B: "10:1,0 1,12;1,0 6,0 8,2 8,4 6,6 1,6;1,6 6,6 8,8 8,10 6,12 1,12",
  C: "10:9,2 7,0 3,0 1,2 1,10 3,12 7,12 9,10",
  D: "10:1,0 1,12;1,0 7,0 9,2 9,10 7,12 1,12",
  E: "10:9,0 1,0 1,12 9,12;1,6 6,6",
  F: "10:9,0 1,0 1,12;1,6 7,6",
  G: "10:9,2 7,0 3,0 1,2 1,10 3,12 7,12 9,10 9,6 6,6",
  H: "10:1,0 1,12;9,0 9,12;1,6 9,6",
  I: "5:0,0 4,0;2,0 2,12;0,12 4,12",
  J: "10:4,0 9,0;7,0 7,10 5,12 2,12 1,10",
  K: "10:1,0 1,12;9,0 1,6 9,12",
  L: "10:1,0 1,12 9,12",
  M: "12:1,12 1,0 6,7 11,0 11,12",
  N: "11:1,12 1,0 10,12 10,0",
  O: "11:5,0 8,0 10,2 10,10 8,12 5,12 2,12 0,10 0,2 2,0 5,0",
  P: "10:1,12 1,0;1,0 7,0 9,2 9,4 7,6 1,6",
  Q: "11:5,0 8,0 10,2 10,10 8,12 5,12 2,12 0,10 0,2 2,0 5,0;6,9 10,13",
  R: "10:1,12 1,0;1,0 7,0 9,2 9,4 7,6 1,6;5,6 9,12",
  S: "10:9,1 7,0 3,0 1,2 1,5 3,6 7,6 9,7 9,10 7,12 3,12 1,11",
  T: "10:0,0 10,0;5,0 5,12",
  U: "10:1,0 1,10 3,12 7,12 9,10 9,0",
  V: "11:0,0 5,12 10,0",
  W: "13:0,0 3,12 6,5 9,12 12,0",
  X: "10:1,0 9,12;9,0 1,12",
  Y: "10:0,0 5,6 10,0;5,6 5,12",
  Z: "10:1,0 9,0 1,12 9,12",
  "0": "11:5,0 8,0 10,2 10,10 8,12 5,12 2,12 0,10 0,2 2,0 5,0",
  "1": "6:1,2 4,0;4,0 4,12;1,12 6,12",
  "2": "10:1,2 3,0 7,0 9,2 9,5 1,12 9,12",
  "3": "10:1,1 3,0 7,0 9,2 9,5 7,6;7,6 9,8 9,10 7,12 3,12 1,11",
  "4": "10:8,0 1,8 8,8;6,0 6,12",
  "5": "10:9,0 1,0 1,6 7,6 9,8 9,10 7,12 1,12",
  "6": "10:9,1 7,0 3,0 1,2 1,10 3,12 7,12 9,10 9,7 6,6 3,6 1,8",
  "7": "10:1,0 9,0 4,12",
  "8": "10:3,0 7,0 9,2 9,5 7,6 3,6 1,5 1,2 3,0;3,6 7,6 9,8 9,10 7,12 3,12 1,10 1,8 3,6",
  "9": "10:1,11 3,12 7,12 9,10 9,2 7,0 3,0 1,2 1,5 3,6 7,6 9,4",
  " ": "6:",
  ".": "5:2,11 2,12",
  ",": "5:2,11 2,12;2,12 1,14",
  ":": "5:2,4 2,5;2,10 2,11",
  ";": "5:2,4 2,5;2,10 2,11;2,11 1,14",
  "'": "4:2,0 1,3",
  "\u2019": "4:2,0 1,3",
  '"': "7:1,0 0,3;5,0 4,3",
  "-": "7:0,6 7,6",
  "\u2212": "7:0,6 7,6",
  "\u2013": "10:0,6 10,6",
  "\u2014": "12:0,6 12,6",
  "(": "5:4,0 2,2 2,10 4,12",
  ")": "5:1,0 3,2 3,10 1,12",
  "/": "7:6,0 1,12",
  "%": "11:9,0 1,12;1,1 3,1 3,3 1,3;7,9 9,9 9,11 7,11",
  $: "10:5,0 5,12;9,1 7,0 3,0 1,2 1,5 3,6 7,6 9,7 9,10 7,12 3,12 1,11",
  "&": "10:8,0 6,0 3,2 3,5 6,7 9,11 10,12;6,7 3,8 2,10 4,12 7,12 9,10",
  "+": "9:4,2 4,10;0,6 9,6",
  "=": "9:0,4 9,4;0,8 9,8",
  "!": "5:2,0 2,8;2,11 2,12",
  "?": "10:2,2 4,0 7,0 9,2 9,4 7,6 5,6;5,11 5,12",
  "*": "9:4,2 4,10;1,4 8,8;8,4 1,8",
  "\u2022": "5:DOT",
};
type Glyph = { w: number; strokes: [number, number][][]; dot: boolean };
const FONT = new Map<string, Glyph>();
for (const [ch, src] of Object.entries(FONT_SRC)) {
  const [wStr, body] = src.split(/:(.*)/s).filter((_, i) => i < 2);
  const w = parseInt(wStr, 10);
  if (body === "DOT") { FONT.set(ch, { w, strokes: [], dot: true }); continue; }
  const strokes: [number, number][][] = [];
  if (body) {
    for (const st of body.split(";")) {
      strokes.push(st.trim().split(/\s+/).map((p) => {
        const [x, y] = p.split(",").map(Number);
        return [x, y] as [number, number];
      }));
    }
  }
  FONT.set(ch, { w, strokes, dot: false });
}
function glyphOf(ch: string): Glyph {
  return FONT.get(ch) ?? FONT.get(" ")!;
}
function textWidth(s: string, size: number, spacing = 0): number {
  const sc = size / 12;
  let w = 0;
  for (const ch of s) w += glyphOf(ch).w * sc + spacing;
  return w - spacing;
}
function drawText(s: string, x: number, y: number, size: number, c: RGB,
  opts: { align?: "left" | "center" | "right"; weight?: number; spacing?: number } = {}): void {
  const align = opts.align ?? "left";
  const weight = opts.weight ?? 1;
  const spacing = opts.spacing ?? 0;
  const sc = size / 12;
  const lw = Math.max(1.1, size * 0.095 * weight);
  let cx = x;
  const tw = textWidth(s, size, spacing);
  if (align === "center") cx = x - tw / 2;
  else if (align === "right") cx = x - tw;
  for (const ch of s) {
    const g = glyphOf(ch);
    if (g.dot) {
      fillCircle(cx + (g.w * sc) / 2, y + size * 0.48, size * 0.11, c);
    } else {
      for (const st of g.strokes) {
        const pts: [number, number][] = st.map(([gx, gy]) => [cx + gx * sc, y + gy * sc]);
        polyline(pts, lw, c);
      }
    }
    cx += g.w * sc + spacing;
  }
}
function wrapText(s: string, size: number, maxW: number, spacing = 0): string[] {
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const wd of words) {
    const trial = cur ? cur + " " + wd : wd;
    if (textWidth(trial, size, spacing) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function fitSize(s: string, maxSize: number, maxW: number): number {
  let size = maxSize;
  while (size > 20 && textWidth(s, size) > maxW) size -= 1;
  return size;
}

// ---------- PNG encode ----------
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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
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
function encodePng(): Buffer {
  // downsample 2x2 -> 1024x1024 RGB
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const rowOff = y * (1 + W * 3);
    raw[rowOff] = 0;
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = (((y * 2 + dy) * PW + (x * 2 + dx)) * 4);
          r += img[i]; g += img[i + 1]; b += img[i + 2];
        }
      }
      const o = rowOff + 1 + x * 3;
      raw[o] = Math.round(r / 4); raw[o + 1] = Math.round(g / 4); raw[o + 2] = Math.round(b / 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- palette ----------
const PAPER = hex("#f6f1e2");
const INK = hex("#1b1712");
const INK_SOFT = hex("#4a4238");
const RED = hex("#b3261e");
const BLUE = hex("#1f4e79");
const GOLD = hex("#a8821e");
const WALL = hex("#e6d3a8");
const WAINSCOT = hex("#c9ab72");
const WOOD = hex("#7a5230");
const WOOD_DARK = hex("#5d3d22");
const WOOD_LITE = hex("#9c6f42");
const FRAME = hex("#f2ead6");

// ---------- scene helpers ----------
function archPath(cx: number, topY: number, springY: number, bottomY: number, hw: number): [number, number][] {
  const pts: [number, number][] = [[cx - hw, bottomY], [cx - hw, springY]];
  pts.push(...arcPts(cx, springY, hw, Math.PI, 2 * Math.PI, 40));
  pts.push([cx + hw, bottomY]);
  return pts;
}
function drawWindow(cx: number, topY: number, springY: number, bottomY: number, hw: number, withSun: boolean): void {
  const outer = archPath(cx, topY, springY, bottomY, hw);
  fillPoly(outer, FRAME);
  // inner arch, inset 7
  const inner = archPath(cx, topY + 7, springY, bottomY - 4, hw - 7);
  const skyTop = hex("#e0703a"), skyMid = hex("#f6a93b"), skyLow = hex("#ffd76e"), skyHor = hex("#ffe9a8");
  fillPoly(inner, (y) => {
    if (y < springY) return mix(skyTop, skyMid, (y - topY) / Math.max(1, springY - topY));
    if (y < bottomY - 45) return mix(skyMid, skyLow, (y - springY) / Math.max(1, bottomY - 45 - springY));
    return mix(skyLow, skyHor, (y - (bottomY - 45)) / 45);
  });
  if (withSun) {
    fillCircle(cx, bottomY - 62, 40, hex("#ffd76e"));
    fillCircle(cx, bottomY - 62, 30, hex("#fff2b8"));
  }
  // skyline silhouette at the foot of the window
  const base = bottomY - 4;
  const skyline: [number, number][] = [[cx - hw + 7, base]];
  const bw = (hw * 2 - 14) / 6;
  for (let i = 0; i < 6; i++) {
    const bx = cx - hw + 7 + i * bw;
    const bh = 18 + ((i * 37) % 26);
    skyline.push([bx, base - bh], [bx + bw * 0.62, base - bh]);
    if (i % 2 === 0) skyline.push([bx + bw * 0.62, base - bh - 8], [bx + bw * 0.8, base - bh - 8]);
  }
  skyline.push([cx + hw - 7, base]);
  fillPoly(skyline, hex("#5a3d28"));
  // lit windows in the silhouette
  for (let i = 0; i < 6; i++) {
    const bx = cx - hw + 14 + i * bw;
    fillRect(bx, base - 14 - ((i * 29) % 18), 4, 5, hex("#ffe9a8"));
  }
  // mullions: vertical bar + horizontal bar
  fillRect(cx - 2, topY + 8, 4, bottomY - topY - 12, FRAME);
  fillRect(cx - hw + 7, springY + 34, hw * 2 - 14, 4, FRAME);
  // smooth arch outline (thin dark line along the curve)
  const outline = arcPts(cx, springY, hw - 1, Math.PI, 2 * Math.PI, 48);
  polyline(outline, 1.6, hex("#8a6d3f"));
  line(cx - hw, springY, cx - hw, bottomY, 1.6, hex("#8a6d3f"));
  line(cx + hw, springY, cx + hw, bottomY, 1.6, hex("#8a6d3f"));
}
function drawDelegate(x: number, headY: number, skin: RGB, hair: "short" | "grey" | "scarf" | "bald",
  hairCol: RGB, suit: RGB, tie: RGB | null): void {
  // torso
  fillPoly([[x - 50, 548], [x - 44, headY + 40], [x + 44, headY + 40], [x + 50, 548]], suit);
  // shirt + tie / scarf band
  fillPoly([[x - 12, headY + 42], [x + 12, headY + 42], [x, headY + 74]], hex("#f7f3e8"));
  if (tie) {
    fillPoly([[x - 5, headY + 44], [x + 5, headY + 44], [x + 4, headY + 66], [x, headY + 76], [x - 4, headY + 66]], tie);
  } else {
    fillRect(x - 13, headY + 42, 26, 8, hex("#e8dcc0"));
  }
  // neck + head
  fillRect(x - 8, headY + 18, 16, 18, skin);
  if (hair === "scarf") {
    fillCircle(x, headY - 2, 31, hairCol); // scarf framing the face
    fillPoly([[x - 31, headY + 4], [x - 27, headY + 52], [x - 15, headY + 52], [x - 19, headY + 6]], hairCol);
    fillPoly([[x + 31, headY + 4], [x + 27, headY + 52], [x + 15, headY + 52], [x + 19, headY + 6]], hairCol);
  }
  if (hair === "short" || hair === "grey") {
    fillCircle(x, headY - 7, 27, hairCol); // hair cap above the face
  }
  fillCircle(x, headY + 2, 26, skin);
  if (hair === "grey") {
    fillRect(x - 9, headY + 11, 18, 5, hex("#cfc8bd")); // moustache
  }
  // face: brows, eyes, mouth
  const dark = hex("#241d16");
  line(x - 15, headY - 11, x - 6, headY - 12, 2, dark);
  line(x + 6, headY - 12, x + 15, headY - 11, 2, dark);
  fillCircle(x - 10, headY - 4, 2.6, dark);
  fillCircle(x + 10, headY - 4, 2.6, dark);
  if (hair === "bald") {
    // glasses: two rings + bridge
    for (const gx of [x - 11, x + 11]) {
      fillCircle(gx, headY - 4, 8, dark);
      fillCircle(gx, headY - 4, 6.2, skin);
      fillCircle(gx, headY - 4, 2.4, dark);
    }
    line(x - 3, headY - 5, x + 3, headY - 5, 1.8, dark);
    line(x - 19, headY - 5, x - 26, headY - 3, 1.8, dark);
    line(x + 19, headY - 5, x + 26, headY - 3, 1.8, dark);
  }
  polyline([[x - 6, headY + 11], [x, headY + 14], [x + 6, headY + 11]], 2, dark);
}
function drawGlobe(cx: number, cy: number, r: number): void {
  fillCircle(cx, cy, r, hex("#2e6da4"));
  // land blobs
  fillEllipse(cx - 10, cy - 8, 12, 8, hex("#5da24a"));
  fillEllipse(cx + 12, cy + 6, 10, 7, hex("#5da24a"));
  fillEllipse(cx - 2, cy + 16, 9, 6, hex("#7ab648"));
  fillEllipse(cx + 14, cy - 14, 7, 5, hex("#7ab648"));
  // polar cap
  fillEllipse(cx, cy - r + 4, 12, 5, hex("#eef4f8"));
  // meridian + equator (smooth thin curves)
  polyline(arcPts(cx, cy, r * 0.55, -Math.PI / 2, Math.PI / 2, 24).map(([px, py]) => [px, py] as [number, number]), 1.4, hex("#bcd6ea"));
  line(cx - r + 2, cy, cx + r - 2, cy, 1.4, hex("#bcd6ea"));
  // outline
  polyline(arcPts(cx, cy, r, 0, 2 * Math.PI, 48), 1.8, hex("#1c4a70"), true);
}

// ---------- main ----------
function main(): void {
  fillRect(0, 0, W, H, PAPER);

  // ===== masthead =====
  line(36, 16, 988, 16, 1.4, INK);
  const mastSize = fitSize("THE WORLD", 66, 620);
  drawText("THE WORLD", 512, 26, mastSize, INK, { align: "center", weight: 1.25, spacing: 2 });
  drawText("SATURDAY, 21 NOVEMBER 2026", 36, 100, 16, INK, { weight: 1.1 });
  drawText("IN ONE IMAGE", 988, 100, 16, INK, { align: "right", weight: 1.1 });
  fillRect(36, 122, 952, 4, INK);
  line(36, 131, 988, 131, 1.2, INK);

  // ===== headline band =====
  const head = "COP31 TALKS RUN INTO OVERTIME";
  const hSize = fitSize(head, 47, 940);
  drawText(head, 512, 146, hSize, INK, { align: "center", weight: 1.15 });
  const dek = wrapText(
    "ANTALYA \u2014 WITH FRIDAY'S DEADLINE MISSED, NEARLY 200 NATIONS RACE TO PRODUCE A NEW DRAFT THAT DROPS EVERY MENTION OF FOSSIL FUELS \u2014 AND THE $120BN-A-YEAR ADAPTATION FIGURE.",
    18, 920);
  let dy = 200;
  for (const ln of dek) {
    drawText(ln, 512, dy, 18, INK_SOFT, { align: "center" });
    dy += 24;
  }
  line(36, 282, 988, 282, 1.2, INK);

  // ===== lead illustration: COP31 hall =====
  const SX0 = 36, SX1 = 988, SY0 = 290, SY1 = 600;
  fillRect(SX0, SY0, SX1 - SX0, SY1 - SY0, WALL);
  fillRect(SX0, 505, SX1 - SX0, SY1 - 505, WAINSCOT);
  line(SX0, 505, SX1, 505, 2, hex("#a8874f"));
  // three arched windows, sunset in the middle one
  drawWindow(300, 312, 384, 505, 84, false);
  drawWindow(512, 312, 384, 505, 84, true);
  drawWindow(724, 312, 384, 505, 84, false);
  // bunting of 16 flags across the top
  const flagCols = ["#b3261e", "#1f4e79", "#2e7d32", "#e8a020", "#6a3d9a", "#c25e00", "#0e7c86", "#a01e5e"];
  for (let i = 0; i < 16; i++) {
    const t = i / 15;
    const fx = 56 + t * (968 - 56);
    const fy = 300 + 24 * Math.sin(Math.PI * t);
    line(fx - 7, fy, fx + 7, fy, 1.6, INK_SOFT);
    fillPoly([[fx - 8, fy + 1], [fx + 8, fy + 1], [fx, fy + 19]], hex(flagCols[i % 8]));
  }
  // wall plaque, left
  drawText("COP31", 66, 330, 24, BLUE, { weight: 1.2 });
  drawText("ANTALYA", 66, 360, 13, INK_SOFT, { weight: 1.1 });
  // wall clock, right — nearly midnight: overtime
  fillCircle(892, 352, 31, hex("#fbf7ec"));
  polyline(arcPts(892, 352, 31, 0, 2 * Math.PI, 48), 2.4, INK, true);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    const r1 = 26, r2 = i % 3 === 0 ? 21 : 24;
    line(892 + r1 * Math.sin(a), 352 - r1 * Math.cos(a), 892 + r2 * Math.sin(a), 352 - r2 * Math.cos(a), i % 3 === 0 ? 2 : 1.2, INK);
  }
  // 11:55 — hour hand just short of 12, minute hand on 11
  line(892, 352, 892 - 3, 352 - 15, 3, INK);
  line(892, 352, 892 - 13, 352 - 21, 2.4, INK);
  fillCircle(892, 352, 3, INK);
  drawText("OVERTIME", 892, 390, 12, RED, { align: "center", weight: 1.2 });
  // four delegates behind the round table — faces visible, globe clear of them
  drawDelegate(330, 452, hex("#e8b98a"), "short", hex("#2b2b2b"), hex("#2b3a55"), hex("#b3261e"));
  drawDelegate(452, 452, hex("#d9a06f"), "grey", hex("#cfc8bd"), hex("#3a3a3a"), hex("#1f4e79"));
  drawDelegate(574, 452, hex("#c98d5f"), "scarf", hex("#0e7c86"), hex("#17606b"), null);
  drawDelegate(696, 452, hex("#f0c49a"), "bald", hex("#e8e2d4"), hex("#6b2d2d"), hex("#a8821e"));
  // round wooden table
  fillEllipse(512, 568, 400, 40, WOOD);
  fillEllipse(512, 566, 400, 38, WOOD_LITE);
  const frontEdge: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI;
    frontEdge.push([512 + 400 * Math.cos(a), 566 + 38 * Math.sin(a)]);
  }
  polyline(frontEdge, 1.6, WOOD_DARK);
  // DRAFT document on the table: FOSSIL FUELS struck through in red
  fillRect(230, 542, 150, 50, hex("#fdfcf6"));
  line(230, 542, 380, 542, 1, hex("#b9b09a"));
  drawText("DRAFT", 240, 547, 12, RED, { weight: 1.2 });
  fillRect(240, 563, 130, 2, hex("#c9c2ae"));
  drawText("FOSSIL FUELS", 240, 568, 10, INK, { weight: 1.1 });
  line(238, 574, 330, 574, 2.4, RED);
  fillRect(240, 580, 90, 2, hex("#c9c2ae"));
  // papers + microphones on the table
  fillRect(470, 556, 62, 22, hex("#fdfcf6"));
  line(476, 562, 526, 562, 1.4, hex("#c9c2ae"));
  line(476, 568, 520, 568, 1.4, hex("#c9c2ae"));
  fillRect(652, 558, 56, 20, hex("#fdfcf6"));
  line(658, 564, 700, 564, 1.4, hex("#c9c2ae"));
  for (const mx of [420, 610]) {
    line(mx, 560, mx, 542, 2, INK);
    fillCircle(mx, 538, 5.5, INK);
    fillEllipse(mx, 561, 9, 3, INK);
  }
  // globe on its own side table at the far right — clear of the middle delegate
  fillEllipse(905, 552, 48, 9, WOOD_DARK);
  fillRect(901, 552, 8, 38, WOOD_DARK);
  fillEllipse(905, 592, 30, 6, WOOD_DARK);
  line(905, 541, 905, 552, 3, hex("#3a2c1c"));
  drawGlobe(905, 508, 33);
  line(36, 612, 988, 612, 1.2, INK);

  // ===== three secondary stories =====
  const cols = [
    { x: 36, kicker: "POLAND", kcol: RED,
      head: "RUSSIAN MISSILE FALLS IN POLAND",
      body: "KH-101 COMES DOWN AT NOWY LIPOWIEC. NATO: A \u2018GRAVE VIOLATION\u2019. NO CASUALTIES." },
    { x: 358, kicker: "UKRAINE", kcol: BLUE,
      head: "KYIV HIT BY MISSILES AND DRONES",
      body: "84 CRUISE MISSILES AND 404 DRONES. THREE DNIPRO BRIDGES DAMAGED. POWER, HEAT, WATER CUT." },
    { x: 680, kicker: "MARKETS", kcol: GOLD,
      head: "AI SELL-OFF DRAGS US STOCKS DOWN",
      body: "S&P 500 DOWN 3.7%, ENTERING CORRECTION. NASDAQ DOWN 5.3%. NVIDIA FALLS 14%." },
  ];
  for (const col of cols) {
    const cw = 308;
    drawText(col.kicker, col.x, 622, 14, col.kcol, { weight: 1.3, spacing: 1 });
    const ty = 642, th = 106;
    // thumbnail background
    fillRect(col.x, ty, cw, th, hex("#22303c"));
    if (col.kicker === "POLAND") {
      // night sky, missile streak, impact burst over rooftops
      fillRect(col.x, ty, cw, th, hex("#1d2733"));
      fillCircle(col.x + 250, ty + 26, 14, hex("#f4ead2"));
      line(col.x + 60, ty + 78, col.x + 250, ty + 22, 2, hex("#f0c060"));
      for (let i = 0; i < 5; i++) fillCircle(col.x + 80 + i * 34, ty + 72 - i * 11, 3, hex("#f0c060"));
      fillPoly([[col.x + 236, ty + 14], [col.x + 252, ty + 20], [col.x + 258, ty + 30], [col.x + 244, ty + 32]], hex("#c8ccd2"));
      fillPoly([[col.x + 252, ty + 20], [col.x + 262, ty + 16], [col.x + 266, ty + 24]], hex("#e8b13c"));
      fillCircle(col.x + 92, ty + 84, 13, hex("#ff7a1a"));
      fillCircle(col.x + 92, ty + 84, 7, hex("#ffd76e"));
      fillPoly([[col.x, ty + 96], [col.x + 40, ty + 96], [col.x + 40, ty + 82], [col.x + 70, ty + 82], [col.x + 70, ty + 96], [col.x + 150, ty + 96], [col.x + 150, ty + 84], [col.x + 185, ty + 84], [col.x + 185, ty + 96], [col.x + cw, ty + 96], [col.x + cw, ty + th], [col.x, ty + th]], hex("#0f141b"));
      drawText("NOWY LIPOWIEC", col.x + 8, ty + th - 16, 10, hex("#f4ead2"));
    } else if (col.kicker === "UKRAINE") {
      // dusk river, three bridges, blasts over the skyline
      fillRect(col.x, ty, cw, th, hex("#2c2118"));
      fillRect(col.x, ty + 62, cw, th - 62, hex("#3a5a78"));
      fillRect(col.x, ty + 40, cw, 22, hex("#241a12"));
      for (let i = 0; i < 8; i++) fillRect(col.x + 14 + i * 38, ty + 26, 18, 16, hex("#1a130c"));
      for (const bx of [30, 140, 240]) {
        polyline(arcPts(col.x + bx + 24, ty + 84, 24, Math.PI, 2 * Math.PI, 20), 3, hex("#14100b"));
        line(col.x + bx, ty + 84, col.x + bx + 48, ty + 84, 3, hex("#14100b"));
      }
      fillCircle(col.x + 90, ty + 34, 12, hex("#ff7a1a"));
      fillCircle(col.x + 90, ty + 34, 6, hex("#ffd76e"));
      fillCircle(col.x + 210, ty + 22, 10, hex("#ff7a1a"));
      fillCircle(col.x + 210, ty + 22, 5, hex("#ffd76e"));
      drawText("KYIV", col.x + 8, ty + th - 16, 10, hex("#f4ead2"));
    } else {
      // falling market chart
      fillRect(col.x, ty, cw, th, hex("#fbf8ef"));
      for (let i = 1; i < 4; i++) line(col.x, ty + i * 26, col.x + cw, ty + i * 26, 1, hex("#e3dcc8"));
      for (let i = 1; i < 6; i++) line(col.x + i * 51, ty, col.x + i * 51, ty + th, 1, hex("#e3dcc8"));
      const pts: [number, number][] = [];
      for (let i = 0; i <= 10; i++) {
        const px = col.x + 12 + i * 28;
        const py = ty + 14 + i * 7.5 + (i % 3 === 0 ? -4 : 3);
        pts.push([px, py]);
      }
      polyline(pts, 3, RED);
      const [lx, ly] = pts[pts.length - 1];
      fillPoly([[lx - 2, ly - 2], [lx + 16, ly - 2], [lx + 2, ly + 12]], RED);
      drawText("S&P \u22123.7%", col.x + 10, ty + 8, 15, RED, { weight: 1.2 });
      drawText("NASDAQ \u22125.3%", col.x + 10, ty + th - 20, 12, INK_SOFT, { weight: 1.1 });
    }
    // headline + body
    const hLines = wrapText(col.head, 19, cw);
    let hy = 754;
    for (const ln of hLines) { drawText(ln, col.x, hy, 19, INK, { weight: 1.1 }); hy += 23; }
    const bLines = wrapText(col.body, 13.5, cw);
    let by = 804;
    for (const ln of bLines) { drawText(ln, col.x, by, 13.5, INK_SOFT); by += 18; }
  }
  line(36, 874, 988, 874, 1.2, INK);

  // ===== IN BRIEF footer — roomy =====
  drawText("IN BRIEF", 36, 888, 18, INK, { weight: 1.3, spacing: 1 });
  line(150, 897, 988, 897, 1, INK_SOFT);
  const briefs = [
    "CYCLONE AKVAN \u2014 370,000 EVACUATED IN ODISHA. NO DEATHS REPORTED.",
    "WORLD COURT \u2014 STATES ACT AFTER THE MYANMAR RULING.",
    "FRANCE SEEKS A UN SECURITY COUNCIL MEETING ON THE KYIV STRIKES.",
    "ESTONIA TO CLOSE ITS BORDER WITH RUSSIA FROM 1 DECEMBER.",
  ];
  const bw = 226, bgap = 16;
  for (let i = 0; i < briefs.length; i++) {
    const bx = 36 + i * (bw + bgap);
    const lines = wrapText("\u2022  " + briefs[i], 14, bw);
    let by = 918;
    for (const ln of lines) { drawText(ln, bx, by, 14, INK_SOFT); by += 21; }
  }
  line(36, 1006, 988, 1006, 1, INK_SOFT);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePng();
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
  console.log(`wrote ${path.join(outDir, "entry.png")} (${png.length} bytes)`);
}

main();
