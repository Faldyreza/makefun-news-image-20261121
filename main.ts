// news-image-20261121 v11 — fresh build. Front page: "THE WORLD — IN ONE IMAGE —
// SATURDAY, 21 NOVEMBER 2026". Procedural 1024x1024 render, Node 22 stdlib only,
// no network. Deterministic: fixed constants, seeded LCG only, no Date/random.
//
// v11 fixes over v10:
//  (a) centre delegate's suit + tie fully visible — delegates raised, table top
//      lowered to y=600 so torsos (suit, shirt, tie) show above the table.
//  (b) Kyiv left-deck fire bigger, smoke column thicker and anchored to the fire.
//  (c) Poland missile bigger, with thick fins, readable at thumbnail size.
//  (d) Footer brief 1 reworded + balanced wrap so no word sits alone on a line.
//  (e) Sun rays drawn BEFORE the window mullions, so rays never cut a mullion.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const fb = new Uint8Array(W * H * 4);

// ---------- palette ----------
const PAPER = [245, 239, 224];
const INK = [25, 23, 19];
const RED = [178, 39, 30];
const NAVY = [31, 58, 95];
const GOLD = [201, 162, 39];
const WALL = [233, 221, 190];
const WOOD = [92, 64, 40];
const WOOD_DK = [122, 78, 45];
const WOOD_LT = [156, 107, 63];
const SKY = [191, 216, 230];
const SUN = [242, 193, 78];
const RAY = [232, 169, 60];

// ---------- deterministic rng ----------
let seed = 20261121;
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// ---------- pixels & shapes ----------
function px(x: number, y: number, c: number[]): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = (yi * W + xi) * 4;
  fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2]; fb[o + 3] = 255;
}
function fillRect(x: number, y: number, w: number, h: number, c: number[]): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let o = (yy * W + x0) * 4;
    for (let xx = x0; xx < x1; xx++) {
      fb[o] = c[0]; fb[o + 1] = c[1]; fb[o + 2] = c[2]; fb[o + 3] = 255;
      o += 4;
    }
  }
}
function hline(x0: number, x1: number, y: number, c: number[]): void {
  if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
  fillRect(x0, y, x1 - x0 + 1, 1, c);
}
function disc(cx: number, cy: number, r: number, c: number[]): void {
  const rr = Math.max(0.5, r);
  const ri = Math.ceil(rr);
  for (let dy = -ri; dy <= ri; dy++) {
    const dx = Math.sqrt(Math.max(0, rr * rr - dy * dy));
    hline(Math.round(cx - dx), Math.round(cx + dx), Math.round(cy + dy), c);
  }
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: number[]): void {
  const ri = Math.ceil(ry);
  for (let dy = -ri; dy <= ri; dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t < 0) continue;
    const dx = rx * Math.sqrt(t);
    hline(Math.round(cx - dx), Math.round(cx + dx), Math.round(cy + dy), c);
  }
}
function circleOutline(cx: number, cy: number, r: number, c: number[]): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    px(cx + r * Math.cos(rad), cy + r * Math.sin(rad), c);
  }
}
function line(x0: number, y0: number, x1: number, y1: number, w: number, c: number[]): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.max(0.6, w / 2), c);
  }
}
// scanline-filled polygon; pts = flat [x,y,...]
function poly(pts: number[], c: number[]): void {
  let minY = H, maxY = 0;
  for (let i = 1; i < pts.length; i += 2) {
    minY = Math.min(minY, pts[i]);
    maxY = Math.max(maxY, pts[i]);
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(H - 1, Math.ceil(maxY));
  const n = pts.length / 2;
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = pts[i * 2], y0 = pts[i * 2 + 1];
      const j = (i + 1) % n;
      const x1 = pts[j * 2], y1 = pts[j * 2 + 1];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      hline(Math.round(xs[k]), Math.round(xs[k + 1]), y, c);
    }
  }
}
// half-ellipse arch (top) + rect below, filled as one window shape
function windowShape(x0: number, w: number, archTopY: number, rectTopY: number, bottomY: number, c: number[]): void {
  const cx = x0 + w / 2;
  const rx = w / 2;
  const ry = rectTopY - archTopY;
  const pts: number[] = [];
  for (let a = 180; a <= 360; a += 4) {
    const rad = (a * Math.PI) / 180;
    pts.push(cx + rx * Math.cos(rad), rectTopY + ry * Math.sin(rad));
  }
  pts.push(x0 + w, bottomY, x0, bottomY);
  poly(pts, c);
}

// ---------- 5x7 bitmap font (rows as 5-char strings) ----------
const FONT: Record<string, string[]> = {
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
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '–': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '−': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '—': ['00000', '00000', '00000', '11111', '11111', '00000', '00000'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '’': ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '00000', '00000', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '$': ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  '•': ['00000', '01100', '01100', '00000', '00000', '00000', '00000'],
  '~': ['00000', '00000', '00000', '01010', '10101', '00000', '00000'],
  '<': ['00010', '00100', '01000', '10000', '01000', '00100', '00010'],
  '>': ['01000', '00100', '00010', '00001', '00010', '00100', '01000'],
  '*': ['00000', '00100', '10101', '01110', '10101', '00100', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '#': ['01010', '01010', '11111', '01010', '11111', '01010', '01010'],
};
function glyph(ch: string): string[] {
  return FONT[ch] ?? FONT[' '];
}
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, c: number[], bold = false): void {
  const up = s.toUpperCase();
  const bo = bold ? Math.max(1, Math.floor(scale / 2)) : 0;
  for (let i = 0; i < up.length; i++) {
    const g = glyph(up[i]);
    const gx = x + i * 6 * scale;
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      for (let col = 0; col < 5; col++) {
        if (row[col] === '1') {
          fillRect(gx + col * scale, y + r * scale, scale, scale, c);
          if (bo) fillRect(gx + col * scale + bo, y + r * scale, scale, scale, c);
        }
      }
    }
  }
}
function drawTextCentered(cx: number, y: number, s: string, scale: number, c: number[], bold = false): void {
  drawText(Math.round(cx - textWidth(s, scale) / 2), y, s, scale, c, bold);
}
// greedy wrap with no single-word last line (fix d)
function wrapText(s: string, maxChars: number): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if (cur.length + 1 + w.length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > 1) {
    const last = lines[lines.length - 1];
    if (!last.includes(' ') && lines.length >= 2) {
      const prev = lines[lines.length - 2];
      const pi = prev.lastIndexOf(' ');
      if (pi > 0) {
        const moved = prev.slice(pi + 1);
        lines[lines.length - 2] = prev.slice(0, pi);
        lines[lines.length - 1] = moved + ' ' + last;
      }
    }
  }
  return lines;
}

// ---------- delegates ----------
// headCy: centre of head; shoulderY: top of torso; torso runs to table top y=600,
// so suit + shirt + tie stay visible above the table (fix a).
function drawDelegate(cx: number, headCy: number, shoulderY: number, suit: number[], skin: number[],
  hair: number[], tie: number[], opts: { glasses?: boolean; beard?: boolean } = {}): void {
  const tableTop = 600;
  // torso: shoulders + jacket down to the table
  fillRect(cx - 56, shoulderY, 112, tableTop - shoulderY, suit);
  disc(cx - 56, shoulderY + 12, 12, suit);
  disc(cx + 56, shoulderY + 12, 12, suit);
  // arms
  fillRect(cx - 66, shoulderY + 8, 16, tableTop - shoulderY - 8, suit);
  fillRect(cx + 50, shoulderY + 8, 16, tableTop - shoulderY - 8, suit);
  // shirt V
  poly([cx - 15, shoulderY + 2, cx + 15, shoulderY + 2, cx, shoulderY + 48], [250, 248, 240]);
  // lapels
  poly([cx - 15, shoulderY + 2, cx - 2, shoulderY + 6, cx - 14, shoulderY + 52, cx - 30, shoulderY + 10], [Math.max(0, suit[0] - 25), Math.max(0, suit[1] - 25), Math.max(0, suit[2] - 25)]);
  poly([cx + 15, shoulderY + 2, cx + 2, shoulderY + 6, cx + 14, shoulderY + 52, cx + 30, shoulderY + 10], [Math.max(0, suit[0] - 25), Math.max(0, suit[1] - 25), Math.max(0, suit[2] - 25)]);
  // tie: knot + blade, clearly visible on the chest
  poly([cx - 7, shoulderY + 8, cx + 7, shoulderY + 8, cx + 9, shoulderY + 66, cx, shoulderY + 82, cx - 9, shoulderY + 66], tie);
  disc(cx, shoulderY + 8, 6, tie);
  // neck + head
  fillRect(cx - 10, headCy + 14, 20, shoulderY - headCy - 10, skin);
  disc(cx, headCy, 26, skin);
  // hair cap
  disc(cx, headCy - 7, 27, hair);
  disc(cx, headCy + 4, 24, skin);
  fillRect(cx - 27, headCy - 8, 8, 22, hair);
  fillRect(cx + 19, headCy - 8, 8, 22, hair);
  // face
  disc(cx - 10, headCy - 2, 2, INK);
  disc(cx + 10, headCy - 2, 2, INK);
  line(cx - 13, headCy - 8, cx - 7, headCy - 8, 2, hair);
  line(cx + 7, headCy - 8, cx + 13, headCy - 8, 2, hair);
  line(cx - 1, headCy + 2, cx + 1, headCy + 8, 2, [150, 110, 80]);
  line(cx - 6, headCy + 14, cx + 6, headCy + 14, 2, [120, 70, 50]);
  if (opts.beard) {
    disc(cx, headCy + 12, 22, hair);
    disc(cx, headCy + 5, 19, skin);
    line(cx - 6, headCy + 14, cx + 6, headCy + 14, 2, [120, 70, 50]);
  }
  if (opts.glasses) {
    circleOutline(cx - 10, headCy - 2, 8, INK);
    circleOutline(cx + 10, headCy - 2, 8, INK);
    line(cx - 2, headCy - 2, cx + 2, headCy - 2, 2, INK);
  }
}
function flame(cx: number, baseY: number, w: number, h: number, c: number[]): void {
  poly([
    cx - w / 2, baseY,
    cx - w * 0.32, baseY - h * 0.45,
    cx - w * 0.1, baseY - h * 0.8,
    cx, baseY - h,
    cx + w * 0.12, baseY - h * 0.72,
    cx + w * 0.3, baseY - h * 0.4,
    cx + w / 2, baseY,
  ], c);
}

// ---------- page ----------
function draw(): void {
  fillRect(0, 0, W, H, PAPER);
  // double border
  fillRect(10, 10, W - 20, 3, INK);
  fillRect(10, H - 13, W - 20, 3, INK);
  fillRect(10, 10, 3, H - 20, INK);
  fillRect(W - 13, 10, 3, H - 20, INK);
  fillRect(18, 18, W - 36, 1, INK);
  fillRect(18, H - 19, W - 36, 1, INK);
  fillRect(18, 18, 1, H - 36, INK);
  fillRect(W - 19, 18, 1, H - 36, INK);

  // ----- masthead -----
  drawTextCentered(512, 30, 'THE WORLD', 8, INK, true);
  hline(60, 964, 96, INK);
  hline(60, 964, 99, INK);
  drawTextCentered(512, 106, '— IN ONE IMAGE —', 2, INK, true);
  drawTextCentered(512, 130, 'SATURDAY, 21 NOVEMBER 2026', 3, INK, true);
  fillRect(60, 162, 904, 3, INK);
  hline(60, 964, 168, INK);

  // ----- headline -----
  drawTextCentered(512, 184, 'COP31 RUNS INTO OVERTIME', 5, INK, true);
  drawTextCentered(512, 230, 'ANTALYA DRAFT DROPS FOSSIL-FUEL MENTION; $120BN-A-YEAR ADAPTATION ASK UNMET', 2, INK, true);
  drawTextCentered(512, 252, 'NEARLY 200 NATIONS AWAIT A NEW TEXT ON SATURDAY', 2, INK, true);

  // ----- main scene: COP31 assembly hall -----
  fillRect(24, 278, 976, 370, WALL);
  // wall panel lines
  for (const lx of [352, 664]) line(lx, 278, lx, 448, 2, [210, 196, 160]);

  // arched windows (wood frame behind, sky inside)
  const winX = [70, 382, 694];
  for (const x0 of winX) {
    windowShape(x0 - 6, 272, 302, 340, 446, WOOD);
    windowShape(x0, 260, 308, 346, 440, SKY);
    // distant hills at the window foot
    poly([x0, 440, x0 + 60, 412, x0 + 120, 440], [150, 170, 190]);
    poly([x0 + 110, 440, x0 + 190, 406, x0 + 260, 440], [140, 162, 182]);
  }
  // sun in the RIGHT window, far from every delegate head (fix e):
  // rays FIRST, then the mullions on top, so no ray ever cuts a mullion.
  const sunCx = 824, sunCy = 352;
  for (let a = 0; a < 360; a += 45) {
    const rad = (a * Math.PI) / 180;
    line(sunCx + 30 * Math.cos(rad), sunCy + 30 * Math.sin(rad),
      sunCx + 48 * Math.cos(rad), sunCy + 48 * Math.sin(rad), 4, RAY);
  }
  disc(sunCx, sunCy, 22, SUN);
  circleOutline(sunCx, sunCy, 22, [214, 158, 44]);
  disc(sunCx - 7, sunCy - 6, 4, [250, 214, 120]);
  // mullions over the rays
  for (const x0 of winX) {
    const third = 260 / 3;
    fillRect(Math.round(x0 + third) - 3, 308, 6, 132, WOOD);
    fillRect(Math.round(x0 + 2 * third) - 3, 308, 6, 132, WOOD);
    fillRect(x0, 392, 260, 6, WOOD);
  }
  // OVERTIME badge, whole and clear of the arches
  fillRect(412, 278, 200, 28, RED);
  fillRect(414, 280, 196, 24, RED);
  drawTextCentered(512, 285, 'OVERTIME', 2, [255, 255, 255], true);

  // ----- delegates (fix a: raised, table low, suits + ties visible) -----
  // centre delegate sits higher on a riser; all torsos show above y=600.
  drawDelegate(150, 478, 506, [44, 62, 110], [232, 185, 138], [40, 40, 40], [178, 39, 30]);
  drawDelegate(320, 478, 506, [90, 90, 96], [201, 141, 95], [210, 210, 210], [31, 58, 95], { glasses: true });
  drawDelegate(512, 460, 490, NAVY, [240, 200, 160], [70, 45, 25], [178, 39, 30]);
  drawDelegate(704, 478, 506, [15, 118, 110], [138, 90, 59], [25, 25, 25], [201, 162, 39], { beard: true });
  drawDelegate(874, 478, 506, [110, 40, 48], [224, 170, 128], [60, 38, 20], [31, 58, 95]);
  // microphones in front of delegates 1, 3, 5
  for (const mx of [110, 472, 834]) {
    line(mx, 600, mx, 556, 3, INK);
    disc(mx, 552, 5, INK);
  }
  // DRAFT document standing on the table, clean red strike through DRAFT
  fillRect(52, 554, 66, 46, [250, 248, 240]);
  fillRect(52, 554, 66, 2, [180, 175, 160]);
  fillRect(52, 554, 2, 46, [180, 175, 160]);
  fillRect(116, 554, 2, 46, [180, 175, 160]);
  drawText(57, 566, 'DRAFT', 2, RED, true);
  line(54, 570, 116, 588, 3, RED);
  // flags on the table: Turkiye (left) and EU (right)
  line(140, 600, 140, 548, 3, INK);
  fillRect(140, 548, 38, 22, [227, 10, 23]);
  disc(152, 559, 6, [255, 255, 255]);
  disc(154, 559, 5, [227, 10, 23]);
  line(860, 600, 860, 548, 3, INK);
  fillRect(860, 548, 38, 22, [0, 51, 153]);
  for (const [dx, dy] of [[8, 5], [22, 5], [30, 11], [8, 17], [22, 17]] as const) {
    disc(860 + dx, 548 + dy, 1.6, [255, 209, 0]);
  }
  // globe on the table, right end
  line(950, 600, 950, 582, 3, [120, 90, 40]);
  disc(950, 568, 14, [46, 111, 176]);
  disc(944, 564, 4, [90, 160, 90]);
  disc(956, 572, 5, [90, 160, 90]);
  disc(950, 576, 3, [90, 160, 90]);
  circleOutline(950, 568, 14, [30, 70, 110]);

  // ----- the table (low top at y=600, front face below) -----
  fillRect(40, 600, 944, 48, WOOD_DK);
  hline(40, 984, 600, WOOD_LT);
  hline(40, 984, 602, WOOD_LT);
  for (let tx = 158; tx < 984; tx += 118) line(tx, 604, tx, 648, 1, [100, 62, 36]);
  hline(40, 984, 624, [100, 62, 36]);
  // nameplates on the table front
  const plates: [number, string][] = [[150, 'TURKIYE'], [320, 'EU'], [512, 'PRESIDENCY'], [704, 'CHINA'], [874, 'INDIA']];
  for (const [cxp, label] of plates) {
    fillRect(cxp - 36, 608, 72, 18, [250, 248, 240]);
    drawTextCentered(cxp, 612, label, 1, INK, true);
  }

  // scene caption
  drawTextCentered(512, 656, 'THE ASSEMBLY HALL IN ANTALYA — TALKS PAST THE FRIDAY DEADLINE', 2, INK, true);

  // ----- thumbnails -----
  // KYIV (left): dusk sky, river, bridge with V cables + leaning pylon, gold dome,
  // big fire on the left deck + thick smoke column anchored to the fire (fix b).
  const kx0 = 24, ky0 = 682, kw = 470, kh = 130;
  fillRect(kx0, ky0, kw, 62, [217, 138, 78]);
  fillRect(kx0, ky0 + 62, kw, 46, [201, 123, 74]);
  fillRect(kx0, ky0 + 108, kw, 22, [62, 107, 138]);
  // buildings
  fillRect(kx0 + 16, ky0 + 64, 52, 44, [74, 50, 38]);
  fillRect(kx0 + 150, ky0 + 56, 44, 52, [74, 50, 38]);
  fillRect(kx0 + 330, ky0 + 60, 46, 48, [74, 50, 38]);
  for (const [wx, wy] of [[36, 764], [52, 780], [164, 752], [180, 772], [344, 760], [360, 778]] as const) {
    fillRect(kx0 + wx, wy, 4, 6, [255, 214, 120]);
  }
  // gold dome church
  fillRect(kx0 + 412, ky0 + 84, 52, 24, [74, 50, 38]);
  disc(kx0 + 438, ky0 + 82, 13, GOLD);
  line(kx0 + 438, ky0 + 82, kx0 + 438, ky0 + 62, 2, GOLD);
  line(kx0 + 432, ky0 + 68, kx0 + 444, ky0 + 68, 2, GOLD);
  // bridge deck + leaning pylon + V cables
  line(kx0 + 16, ky0 + 100, kx0 + 454, ky0 + 100, 5, [58, 42, 30]);
  poly([kx0 + 272, ky0 + 100, kx0 + 282, ky0 + 100, kx0 + 268, ky0 + 34, kx0 + 258, ky0 + 34], [58, 42, 30]);
  for (const dx of [196, 236, 316, 356] as const) {
    line(kx0 + 263, ky0 + 36, kx0 + dx, ky0 + 100, 2, [220, 210, 190]);
  }
  // BIG fire on the left deck (fix b): tall layered flames, wide base
  flame(kx0 + 96, ky0 + 100, 58, 40, [214, 69, 20]);
  flame(kx0 + 96, ky0 + 100, 40, 30, [242, 140, 20]);
  flame(kx0 + 96, ky0 + 100, 22, 20, [250, 210, 60]);
  flame(kx0 + 128, ky0 + 100, 30, 22, [242, 140, 20]);
  flame(kx0 + 66, ky0 + 100, 26, 18, [214, 69, 20]);
  // THICK smoke column anchored to the fire (fix b): wide stacked puffs
  const smokeCols = [[110, 90], [100, 70], [106, 50], [116, 30], [104, 12]];
  const smokeGreys: number[][] = [[110, 110, 110], [143, 143, 143], [102, 102, 102], [138, 138, 138], [120, 120, 120]];
  for (let i = 0; i < smokeCols.length; i++) {
    const [sx, sy] = smokeCols[i];
    disc(kx0 + sx, ky0 + sy, 19, smokeGreys[i]);
    disc(kx0 + sx - 8, ky0 + sy + 4, 10, [90, 90, 90]);
    disc(kx0 + sx + 9, ky0 + sy - 3, 8, [160, 160, 160]);
  }
  disc(kx0 + 96, ky0 + 96, 12, [110, 110, 110]);
  // river streaks
  hline(kx0 + 30, kx0 + 200, ky0 + 116, [127, 168, 196]);
  hline(kx0 + 260, kx0 + 440, ky0 + 120, [127, 168, 196]);
  // chip
  fillRect(kx0 + 8, ky0 + 6, 196, 16, [255, 255, 255]);
  drawText(kx0 + 12, ky0 + 9, '84 MISSILES • 404 DRONES', 1, INK, true);
  drawTextCentered(kx0 + kw / 2, 820, 'KYIV UNDER FIRE — 3 BRIDGES HIT', 2, INK, true);

  // POLAND (right): field, farmhouse, pines, flag, crater, BIG missile with
  // thick fins (fix c), loose trailing smoke.
  const px0 = 530, py0 = 682, pw = 470, ph = 130;
  fillRect(px0, py0, pw, 58, [220, 232, 240]);
  fillRect(px0, py0 + 58, pw, 72, [122, 154, 78]);
  for (let fx = px0 + 10; fx < px0 + pw; fx += 26) line(fx, py0 + 66, fx + 14, py0 + 128, 1, [104, 134, 64]);
  // farmhouse
  fillRect(px0 + 60, py0 + 66, 70, 34, [242, 237, 224]);
  poly([px0 + 54, py0 + 66, px0 + 136, py0 + 66, px0 + 95, py0 + 44], [163, 59, 46]);
  fillRect(px0 + 88, py0 + 82, 14, 18, [60, 45, 30]);
  fillRect(px0 + 68, py0 + 74, 12, 10, [60, 45, 30]);
  // pines
  for (const tx of [340, 380, 424] as const) {
    poly([px0 + tx, py0 + 58, px0 + tx - 16, py0 + 104, px0 + tx + 16, py0 + 104], [34, 90, 50]);
    fillRect(px0 + tx - 3, py0 + 104, 6, 10, [70, 50, 30]);
  }
  // Polish flag, clear of the missile and its smoke trail
  line(px0 + 28, py0 + 18, px0 + 28, py0 + 108, 3, INK);
  fillRect(px0 + 28, py0 + 18, 40, 13, [255, 255, 255]);
  fillRect(px0 + 28, py0 + 31, 40, 12, [211, 47, 47]);
  // crater
  ellipse(px0 + 250, py0 + 114, 34, 10, [46, 36, 24]);
  ellipse(px0 + 250, py0 + 112, 26, 7, [28, 22, 14]);
  disc(px0 + 222, py0 + 104, 3, [70, 58, 40]);
  disc(px0 + 282, py0 + 106, 3, [70, 58, 40]);
  disc(px0 + 250, py0 + 100, 2, [70, 58, 40]);
  // LOOSE trailing smoke first (behind the missile)
  const trail: [number, number, number][] = [[146, 34, 12], [122, 18, 11], [98, 10, 10], [74, 2, 9]];
  for (const [tx, ty, tr] of trail) disc(px0 + tx, py0 + ty, tr, [154, 160, 163]);
  // BIG missile (fix c): long body, thick fins, red nose, diving at the crater
  const mx0 = px0 + 170, my0 = py0 + 46; // tail
  const mx1 = px0 + 272, my1 = py0 + 94; // nose
  const dx = mx1 - mx0, dy = my1 - my0;
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux; // perpendicular
  const bw = 9; // half body width
  // thick fins at the tail (wide triangles, clearly visible at ~300px)
  poly([
    mx0 + nx * bw, my0 + ny * bw,
    mx0 - ux * 26 + nx * 26, my0 - uy * 26 + ny * 26,
    mx0 - ux * 26 - nx * 4, my0 - uy * 26 - ny * 4,
  ], [150, 40, 30]);
  poly([
    mx0 - nx * bw, my0 - ny * bw,
    mx0 - ux * 26 - nx * 26, my0 - uy * 26 - ny * 26,
    mx0 - ux * 26 + nx * 4, my0 - uy * 26 + ny * 4,
  ], [150, 40, 30]);
  // mid fins
  const midx = mx0 + ux * len * 0.55, midy = my0 + uy * len * 0.55;
  poly([midx + nx * bw, midy + ny * bw, midx + nx * 20, midy + ny * 20, midx - ux * 12 + nx * bw, midy - uy * 12 + ny * bw], [120, 120, 120]);
  poly([midx - nx * bw, midy - ny * bw, midx - nx * 20, midy - ny * 20, midx - ux * 12 - nx * bw, midy - uy * 12 - ny * bw], [120, 120, 120]);
  // body
  poly([
    mx0 + nx * bw, my0 + ny * bw,
    mx1 + nx * bw, my1 + ny * bw,
    mx1 - nx * bw, my1 - ny * bw,
    mx0 - nx * bw, my0 - ny * bw,
  ], [226, 228, 230]);
  // red nose cone
  poly([
    mx1 + nx * bw, my1 + ny * bw,
    mx1 + ux * 16, my1 + uy * 16,
    mx1 - nx * bw, my1 - ny * bw,
  ], [178, 39, 30]);
  // dark band + rivet dots on the body
  line(mx0 + ux * len * 0.72 + nx * bw, my0 + uy * len * 0.72 + ny * bw,
    mx0 + ux * len * 0.72 - nx * bw, my0 + uy * len * 0.72 - ny * bw, 3, [90, 90, 90]);
  // chip
  fillRect(px0 + 8, py0 + 6, 168, 16, [255, 255, 255]);
  drawText(px0 + 12, py0 + 9, 'KH-101 • NO CASUALTIES', 1, INK, true);
  drawTextCentered(px0 + pw / 2, 820, 'RUSSIAN MISSILE DOWN IN POLAND', 2, INK, true);

  // ----- markets strip -----
  hline(24, 1000, 838, INK);
  drawText(24, 862, 'MARKETS', 2, INK, true);
  // falling chart, label kept clear of the line
  const chart: [number, number][] = [[150, 852], [200, 856], [250, 868], [300, 862], [350, 874], [400, 880], [450, 872], [500, 886], [520, 888]];
  for (const gy of [856, 870, 884]) {
    for (let gx = 150; gx <= 520; gx += 8) fillRect(gx, gy, 4, 1, [216, 205, 178]);
  }
  line(150, 848, 150, 892, 1, INK);
  line(150, 892, 524, 892, 1, INK);
  for (let i = 0; i + 1 < chart.length; i++) {
    line(chart[i][0], chart[i][1], chart[i + 1][0], chart[i + 1][1], 3, RED);
  }
  for (const [cxp, cyp] of chart) disc(cxp, cyp, 2.5, RED);
  drawText(560, 862, 'S&P -3.7% NASDAQ -5.3% ', 2, INK, true);
  drawText(560 + textWidth('S&P -3.7% NASDAQ -5.3% ', 2), 862, 'NVIDIA -14%', 2, RED, true);
  hline(24, 1000, 896, INK);

  // ----- footer: IN BRIEF (fix d: balanced wrap, no orphan word) -----
  drawText(24, 910, 'IN BRIEF', 2, INK, true);
  hline(24, 1000, 930, INK);
  const briefs = [
    'CYCLONE AKVAN: 370,000 FLEE ODISHA — NO DEATHS',
    'WORLD COURT ACTS ON MYANMAR RULING',
    'FRANCE SEEKS UN SECURITY COUNCIL SESSION ON KYIV',
    'ESTONIA SHUTS RUSSIA BORDER FROM 1 DEC',
  ];
  const colX = [24, 264, 504, 744];
  const colW = 232;
  const maxChars = Math.floor((colW - 14) / 12);
  for (let i = 0; i < briefs.length; i++) {
    const x = colX[i];
    fillRect(x, 942, 8, 8, RED);
    const lines = wrapText(briefs[i], maxChars);
    for (let li = 0; li < lines.length; li++) {
      drawText(x + 14, 938 + li * 15, lines[li], 2, INK, true);
    }
  }
}

// ---------- PNG encode (deterministic: no ancillary chunks) ----------
function crc32(buf: Buffer): number {
  let table = (crc32 as unknown as { t?: Int32Array }).t;
  if (!table) {
    table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as unknown as { t: Int32Array }).t = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    for (let x = 0; x < W; x++) {
      const si = (y * W + x) * 4;
      const di = y * (1 + W * 3) + 1 + x * 3;
      raw[di] = fb[si]; raw[di + 1] = fb[si + 1]; raw[di + 2] = fb[si + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

draw();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG());
