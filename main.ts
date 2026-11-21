// news-image-20261121 v2 — "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// Fresh build. Node 22+ stdlib only, no network at run time, fully deterministic.
// Writes /output/entry.png (1024x1024, <=1 MiB) + /output/dossier.json.
// Output dir: $MAKEFUN_OUTPUT_DIR or /output. Never deletes /output.
//
// FACTS (verified live by the v1 builder on 21 Nov 2026 from reputable sources;
// reused unchanged here — no number or quote altered without fresh verification):
//   LEAD — COP31 in Antalya, Turkiye, ran into overtime on Sat 21 Nov: the Friday
//     deadline passed with no deal; the draft dropped every mention of fossil fuels
//     and the $120bn/year adaptation figure; ~200 nations; new draft due Saturday.
//     Sources: AP, CNN, Reuters, BBC.
//   SEC 1 — Russian Kh-101 cruise missile came down in Poland near Nowy Lipowiec;
//     NATO called it a "grave violation"; no one hurt. Sources: AP, Reuters, 20 Nov.
//   SEC 2 — Kyiv barrage: 84 cruise missiles + 404 drones in one night; three
//     Dnipro bridges damaged; power, heat and water cut. Sources: Kyiv Independent,
//     AP, BBC.
//   SEC 3 — AI sell-off in US stocks: S&P -3.7% into correction, Nasdaq -5.3%,
//     Nvidia -14%. Sources: AP, CNN, WSJ.
//   IN BRIEF — Cyclone Akvan: 370,000 evacuated in Odisha, no deaths reported (IMD);
//     ICJ / Myanmar genocide ruling: action urged; France seeks UN Security Council
//     meeting over the Kyiv strikes; Estonia to shut its border with Russia from
//     1 Dec; cricket: Jaiswal 85, Rahul 52 not out, Wellington.
//     (Footer keeps 4 briefs, spaced generously, so it stays legible at ~300 px;
//     the cricket brief is dropped for room — breadth is kept across the other four.)
//
// v2 changes vs v1: (a) IN BRIEF gets a real gap after the label and generous
// line spacing — 4 briefs, not 5 crammed; (b) the lead illustration is a full
// COP31 conference-hall scene (arched windows, flag bunting, wall clock,
// delegates at a round table, globe, crossed-out draft document) instead of
// a bare globe + draft box + sun.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import * as crypto from "node:crypto";

// ---------------------------------------------------------------- palette
const W = 1024;
const H = 1024;
const PAPER: RGB = [247, 243, 232]; // off-white paper
const INK: RGB = [26, 24, 22]; // near-black ink
const ACCENT: RGB = [179, 42, 30]; // lead accent: brick red
const RULE = INK;
const WALL: RGB = [227, 221, 210];
const WOOD: RGB = [138, 90, 51];
const WOOD_DARK: RGB = [110, 69, 37];
const WOOD_LIGHT: RGB = [156, 107, 63];
const BLUE: RGB = [46, 111, 176];
const GREEN: RGB = [90, 168, 90];
const SUN: RGB = [232, 122, 26];
const NAVY: RGB = [22, 35, 58];
const GREY_LINE: RGB = [120, 116, 108];
const WHITE: RGB = [255, 255, 255];
const SKIN: RGB = [217, 169, 134];

type RGB = [number, number, number];

// ---------------------------------------------------------------- canvas
const px = new Uint8Array(W * H * 3);
for (let i = 0; i < W * H; i++) {
  px[i * 3] = PAPER[0];
  px[i * 3 + 1] = PAPER[1];
  px[i * 3 + 2] = PAPER[2];
}

function setPix(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(W, x + w);
  const y1 = Math.min(H, y + h);
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPix(xx, yy, c);
  }
}

function hline(x: number, y: number, w: number, c: RGB, t = 1): void {
  rect(x, y, w, t, c);
}

function vline(x: number, y: number, h: number, c: RGB, t = 1): void {
  rect(x, y, t, h, c);
}

// Bresenham line with square brush of size t.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const half = Math.floor(t / 2);
  for (;;) {
    rect(x - half, y - half, t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function circle(cx: number, cy: number, r: number, c: RGB): void {
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy));
    rect(cx - hw, cy + dy, hw * 2 + 1, 1, c);
  }
}

function ring(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let a = 0; a < 360; a += 1) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      setPix(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let dy = -ry; dy <= ry; dy++) {
    const f = 1 - (dy * dy) / (ry * ry);
    const hw = Math.floor(rx * Math.sqrt(Math.max(0, f)));
    rect(cx - hw, cy + dy, hw * 2 + 1, 1, c);
  }
}

// Scanline fill for a simple polygon (convex or concave, non self-intersecting).
function poly(points: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of points) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      rect(Math.ceil(xs[k]), y, Math.floor(xs[k + 1]) - Math.ceil(xs[k]) + 1, 1, c);
    }
  }
}

// ---------------------------------------------------------------- 5x7 font
// Each glyph: 7 rows, 5 bits (bit 4 = leftmost column). Uppercase + digits +
// punctuation only — every string in the image is set in capitals.
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  "-": [0, 0, 0, 14, 0, 0, 0],
  "'": [4, 4, 8, 0, 0, 0, 0],
  "%": [25, 26, 2, 4, 8, 11, 19],
  ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "/": [1, 2, 2, 4, 8, 8, 16],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 6, 4, 0, 4],
  '"': [10, 10, 0, 0, 0, 0, 0],
  "*": [0, 21, 14, 31, 14, 21, 0],
  $: [4, 15, 20, 14, 5, 30, 4],
  "#": [10, 10, 31, 10, 31, 10, 10],
};

const GLYPH_ADV = 6; // 5 columns + 1 spacing, in font units

function textWidth(s: string, sc: number): number {
  return s.length * GLYPH_ADV * sc - sc; // no trailing spacing on last glyph
}

function drawText(x: number, y: number, s: string, sc: number, c: RGB): void {
  let cx = x;
  for (const ch of s) {
    const g = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      const bits = g[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (16 >> col)) {
          rect(cx + col * sc, y + row * sc, sc, sc, c);
        }
      }
    }
    cx += GLYPH_ADV * sc;
  }
}

function drawTextCenter(cx: number, y: number, s: string, sc: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(s, sc) / 2), y, s, sc, c);
}

// ---------------------------------------------------------------- PNG encode
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
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- layout
const MX = 28; // content left
const CW = W - 2 * MX; // 968 content width
const FRAME = 12;

// ---------------------------------------------------------------- lead scene
// COP31 conference hall. Scene box: (sx, sy) size sw x sh.
function drawLeadScene(sx: number, sy: number, sw: number, sh: number): void {
  const frame: RGB = [90, 84, 74];
  // Back wall
  rect(sx, sy, sw, sh, WALL);
  // Floor band at the bottom
  rect(sx, sy + sh - 14, sw, 14, [74, 58, 44]);

  // --- flag bunting across the top (small pennants on a string)
  const flagCols: RGB[] = [
    [179, 42, 30],
    [46, 111, 176],
    [90, 168, 90],
    [232, 178, 26],
    [120, 70, 140],
    [30, 120, 110],
    [200, 90, 40],
    [60, 60, 120],
  ];
  line(sx + 8, sy + 6, sx + sw - 8, sy + 6, INK, 2);
  const nFlags = 16;
  for (let i = 0; i < nFlags; i++) {
    const fx = sx + 14 + i * ((sw - 28) / nFlags);
    const fw = 26;
    const fh = 16;
    const c = flagCols[i % flagCols.length];
    poly(
      [
        [Math.round(fx), sy + 7],
        [Math.round(fx + fw), sy + 7],
        [Math.round(fx + fw / 2), sy + 7 + fh],
      ],
      c,
    );
  }

  // --- three arched windows on the back wall, dusk sky inside
  const winY = sy + 30;
  const winH = 76;
  const winW = 200;
  const winXs = [sx + 40, sx + sw / 2 - winW / 2, sx + sw - 40 - winW];
  for (let i = 0; i < 3; i++) {
    const wx = winXs[i];
    // glass
    rect(wx, winY + 14, winW, winH - 14, [184, 208, 221]);
    ellipse(wx + winW / 2, winY + 14, winW / 2, 14, [184, 208, 221]);
    // frame: outline + mullions
    rect(wx - 3, winY + 14, 3, winH - 14, frame);
    rect(wx + winW, winY + 14, 3, winH - 14, frame);
    rect(wx - 3, winY + winH - 3, winW + 6, 3, frame);
    vline(wx + winW / 2 - 1, winY + 14, winH - 14, frame, 3);
    hline(wx, winY + winH / 2, winW, frame, 3);
    // arch outline (approximated by short segments)
    for (let a = 180; a <= 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      const pxp = Math.round(wx + winW / 2 + (winW / 2) * Math.cos(rad));
      const pyp = Math.round(winY + 14 + 14 * Math.sin(rad));
      rect(pxp - 1, pyp - 1, 3, 3, frame);
    }
  }
  // Sun low in the middle window + small clouds
  const sunCx = winXs[1] + winW / 2;
  const sunCy = winY + winH - 22;
  circle(sunCx, sunCy, 16, SUN);
  for (let a = 0; a < 8; a++) {
    const rad = (a * Math.PI) / 4;
    line(
      Math.round(sunCx + 20 * Math.cos(rad)),
      Math.round(sunCy + 20 * Math.sin(rad)),
      Math.round(sunCx + 27 * Math.cos(rad)),
      Math.round(sunCy + 27 * Math.sin(rad)),
      SUN,
      2,
    );
  }
  ellipse(winXs[0] + 60, winY + 34, 26, 7, WHITE);
  ellipse(winXs[0] + 84, winY + 30, 20, 6, WHITE);
  ellipse(winXs[2] + 130, winY + 40, 24, 7, WHITE);

  // --- wall clock (overtime: hands near midnight) between windows 2 and 3
  const ckx = sx + sw - 40 - winW - 58;
  const cky = winY + 26;
  circle(ckx, cky, 22, WHITE);
  ring(ckx, cky, 22, INK, 3);
  circle(ckx, cky, 2, INK);
  line(ckx, cky, ckx - 1, cky - 15, INK, 3); // minute hand, near 12
  line(ckx, cky, ckx + 8, cky - 11, INK, 3); // hour hand, near 12
  for (let a = 0; a < 12; a++) {
    const rad = (a * Math.PI) / 6;
    setPix(Math.round(ckx + 18 * Math.cos(rad)), Math.round(cky + 18 * Math.sin(rad)), INK);
    setPix(Math.round(ckx + 18 * Math.cos(rad)) + 1, Math.round(cky + 18 * Math.sin(rad)), INK);
  }

  // --- delegates seated behind the table (4 figures, muted suits).
  // Heads sit fully above the table edge so they read as people, not blobs.
  const suitCols: RGB[] = [
    [52, 68, 110],
    [96, 96, 96],
    [40, 110, 100],
    [130, 60, 55],
  ];
  const headsX = [140, 320, 484, 660];
  const headY = sy + 102;
  for (let i = 0; i < 4; i++) {
    const ax = headsX[i];
    // shoulders / torso (trapezoid)
    poly(
      [
        [ax - 34, sy + sh - 30],
        [ax + 34, sy + sh - 30],
        [ax + 22, headY + 12],
        [ax - 22, headY + 12],
      ],
      suitCols[i],
    );
    // head + hair
    circle(ax, headY, 13, SKIN);
    ellipse(ax, headY - 8, 13, 7, INK);
  }

  // --- round table (big ellipse, wood) across the lower scene
  const tcx = sx + sw / 2;
  const tcy = sy + sh - 26;
  ellipse(tcx, tcy, 452, 26, WOOD_LIGHT);
  ellipse(tcx, tcy - 3, 452, 24, WOOD);
  // table front apron
  rect(sx + 40, tcy + 12, sw - 80, 10, WOOD_DARK);

  // --- papers scattered on the table (left)
  const paperSpots: Array<[number, number]> = [
    [sx + 96, tcy - 22],
    [sx + 150, tcy - 18],
    [sx + 560, tcy - 20],
  ];
  for (const [px0, py0] of paperSpots) {
    rect(px0, py0, 56, 20, WHITE);
    rect(px0, py0, 56, 1, GREY_LINE);
    hline(px0 + 6, py0 + 6, 44, GREY_LINE, 1);
    hline(px0 + 6, py0 + 11, 36, GREY_LINE, 1);
    hline(px0 + 6, py0 + 16, 44, GREY_LINE, 1);
  }

  // --- globe on the table, between the 2nd and 3rd delegates
  const gx = sx + 400;
  const gy = tcy - 34;
  const gr = 30;
  // stand
  rect(gx - 3, gy + gr - 2, 6, 12, WOOD_DARK);
  ellipse(gx, gy + gr + 10, 22, 5, WOOD_DARK);
  // sphere
  circle(gx, gy, gr, BLUE);
  // landmasses (simple blobs)
  ellipse(gx - 10, gy - 8, 12, 8, GREEN);
  ellipse(gx + 10, gy + 6, 10, 7, GREEN);
  ellipse(gx + 2, gy - 16, 7, 5, GREEN);
  ellipse(gx - 16, gy + 12, 6, 4, GREEN);
  // latitude lines (clipped chords)
  for (const dy of [-14, 0, 14]) {
    const hw = Math.floor(Math.sqrt(gr * gr - dy * dy));
    hline(gx - hw, gy + dy, hw * 2, [200, 225, 240], 1);
  }
  // meridian (vertical chord through the centre, stays inside the sphere)
  vline(gx, gy - 28, 56, [200, 225, 240], 1);

  // --- the draft document on the table, right side: DRAFT + FOSSIL FUELS crossed out
  const dx = sx + sw - 300;
  const dy = tcy - 52;
  const dw = 240;
  const dh = 52;
  rect(dx, dy, dw, dh, WHITE);
  rect(dx, dy, dw, 2, INK);
  rect(dx, dy + dh - 2, dw, 2, INK);
  rect(dx, dy, 2, dh, INK);
  rect(dx + dw - 2, dy, 2, dh, INK);
  drawText(dx + 12, dy + 6, "DRAFT", 3, ACCENT);
  hline(dx + 12, dy + 30, dw - 24, GREY_LINE, 1);
  drawText(dx + 12, dy + 34, "FOSSIL FUELS", 3, ACCENT);
  // red strike through FOSSIL FUELS
  const strikeY = dy + 34 + 10;
  line(dx + 10, strikeY, dx + dw - 10, strikeY - 2, ACCENT, 3);

  // --- microphone at the centre of the table
  const micX = tcx + 60;
  line(micX, tcy - 8, micX, tcy - 26, INK, 3);
  circle(micX, tcy - 30, 6, INK);
  ellipse(micX, tcy - 6, 14, 4, WOOD_DARK);

  // --- chair backs in the foreground corners
  rect(sx + 18, sy + sh - 26, 64, 26, WOOD_DARK);
  rect(sx + sw - 82, sy + sh - 26, 64, 26, WOOD_DARK);

  // scene border
  rect(sx, sy, sw, 2, INK);
  rect(sx, sy + sh - 2, sw, 2, INK);
  rect(sx, sy, 2, sh, INK);
  rect(sx + sw - 2, sy, 2, sh, INK);
}

// ---------------------------------------------------------------- thumbnails
function thumbMissile(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, NAVY);
  // ground
  rect(x, y + h - 12, w, 12, [40, 52, 74]);
  hline(x, y + h - 12, w, [120, 130, 150], 2);
  // trajectory arc (parabola from lower left to upper right)
  let px0 = x + 6;
  let py0 = y + h - 14;
  for (let t = 1; t <= 20; t++) {
    const fx = x + 6 + (t / 20) * (w - 18);
    const fy = y + h - 14 - Math.sin((t / 20) * Math.PI * 0.52) * (h - 22);
    line(Math.round(px0), Math.round(py0), Math.round(fx), Math.round(fy), WHITE, 2);
    px0 = fx;
    py0 = fy;
  }
  // impact flash at the arc end
  circle(x + w - 12, y + 12, 5, SUN);
  // red star bursts on the ground (explosions)
  for (const bx of [x + 26, x + 58, x + 88]) {
    const by = y + h - 16;
    line(bx - 7, by, bx + 7, by, ACCENT, 3);
    line(bx, by - 7, bx, by + 7, ACCENT, 3);
    line(bx - 5, by - 5, bx + 5, by + 5, ACCENT, 2);
    line(bx - 5, by + 5, bx + 5, by - 5, ACCENT, 2);
  }
  rect(x, y, w, 2, INK);
  rect(x, y + h - 2, w, 2, INK);
  rect(x, y, 2, h, INK);
  rect(x + w - 2, y, 2, h, INK);
}

function thumbBridge(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, [207, 224, 234]);
  // river
  rect(x, y + h - 18, w, 18, [127, 168, 201]);
  hline(x, y + h - 18, w, [90, 130, 170], 2);
  // bridge towers
  rect(x + 14, y + 10, 8, h - 26, [90, 90, 90]);
  rect(x + w - 22, y + 10, 8, h - 26, [90, 90, 90]);
  // deck with a broken gap in the middle
  rect(x + 6, y + 26, 40, 5, [70, 70, 70]);
  rect(x + w - 46, y + 26, 40, 5, [70, 70, 70]);
  // tilted fallen segment
  poly(
    [
      [x + 46, y + 28],
      [x + 64, y + 28],
      [x + 60, y + 44],
      [x + 44, y + 42],
    ],
    [70, 70, 70],
  );
  // smoke puffs above the gap
  circle(x + 52, y + 16, 7, [150, 150, 150]);
  circle(x + 60, y + 10, 5, [170, 170, 170]);
  circle(x + 46, y + 9, 4, [190, 190, 190]);
  // small flame in the gap
  circle(x + 55, y + 30, 4, SUN);
  rect(x, y, w, 2, INK);
  rect(x, y + h - 2, w, 2, INK);
  rect(x, y, 2, h, INK);
  rect(x + w - 2, y, 2, h, INK);
}

function thumbChart(x: number, y: number, w: number, h: number): void {
  rect(x, y, w, h, WHITE);
  // grid
  for (let gy = y + 12; gy < y + h - 6; gy += 12) hline(x + 4, gy, w - 8, [220, 220, 220], 1);
  for (let gx = x + 14; gx < x + w - 4; gx += 16) vline(gx, y + 6, h - 12, [220, 220, 220], 1);
  // descending red line with arrowhead (the -3.7% figure is in the text
  // beside the thumbnail, so the chart stays clean)
  const pts: Array<[number, number]> = [
    [x + 8, y + 10],
    [x + 30, y + 16],
    [x + 48, y + 14],
    [x + 66, y + 30],
    [x + 84, y + 38],
    [x + w - 8, y + 52],
  ];
  for (let i = 0; i + 1 < pts.length; i++) {
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], ACCENT, 3);
  }
  const [ax, ay] = pts[pts.length - 1];
  poly(
    [
      [ax, ay],
      [ax - 10, ay - 7],
      [ax - 10, ay + 3],
    ],
    ACCENT,
  );
  rect(x, y, w, 2, INK);
  rect(x, y + h - 2, w, 2, INK);
  rect(x, y, 2, h, INK);
  rect(x + w - 2, y, 2, h, INK);
}

// ---------------------------------------------------------------- page
function drawPage(): void {
  // outer frame
  rect(FRAME, FRAME, W - 2 * FRAME, 2, INK);
  rect(FRAME, H - FRAME - 2, W - 2 * FRAME, 2, INK);
  rect(FRAME, FRAME, 2, H - 2 * FRAME, INK);
  rect(W - FRAME - 2, FRAME, 2, H - 2 * FRAME, INK);

  let y = 26;

  // masthead
  drawTextCenter(W / 2, y, "THE WORLD", 12, INK);
  y += 12 * 7 + 10; // cap height 84 + gap
  // dateline
  drawTextCenter(W / 2, y, "SATURDAY, 21 NOVEMBER 2026 - IN ONE IMAGE", 3, INK);
  y += 21 + 8;
  // double rule
  hline(MX, y, CW, RULE, 3);
  y += 7;
  hline(MX, y, CW, RULE, 1);
  y += 10;

  // kicker
  drawText(MX, y, "CLIMATE - ANTALYA, TURKEY", 3, ACCENT);
  y += 21 + 8;

  // headline, own band, two lines
  drawText(MX, y, "CLIMATE TALKS RUN PAST", 6, INK);
  y += 52;
  drawText(MX, y, "DEADLINE - STILL NO DEAL", 6, INK);
  y += 42 + 10;

  // lead illustration: COP31 hall scene
  const sceneH = 178;
  drawLeadScene(MX, y, CW, sceneH);
  y += sceneH + 12;

  // lead body: 4 short factual lines
  const leadLines = [
    "NEARLY 200 NATIONS MISS THE FRIDAY DEADLINE",
    "IN ANTALYA. DRAFT DROPS FOSSIL FUELS AND CUTS",
    "ADAPTATION CASH OF $120BN A YEAR. NEW TEXT DUE",
    "SATURDAY.",
  ];
  for (const ln of leadLines) {
    drawText(MX, y, ln, 3, INK);
    y += 27;
  }
  y += 4;

  // divider
  hline(MX, y, CW, RULE, 2);
  y += 10;

  // secondary stories
  const ROW_H = 78;
  const THUMB_W = 110;
  const THUMB_H = 64;
  const TX = MX + THUMB_W + 14;
  const rows: Array<{
    thumb: (x: number, y: number, w: number, h: number) => void;
    head: string;
    body: string[];
  }> = [
    {
      thumb: thumbMissile,
      head: "RUSSIAN MISSILES LAND IN POLAND",
      body: [
        "KH-101 MISSILE DOWN NEAR NOWY LIPOWIEC.",
        "NATO CALLS IT A GRAVE VIOLATION. NO ONE HURT.",
      ],
    },
    {
      thumb: thumbBridge,
      head: "KYIV BRIDGES HIT IN MASS BARRAGE",
      body: [
        "84 MISSILES AND 404 DRONES IN ONE NIGHT.",
        "THREE DNIPRO BRIDGES DAMAGED. POWER, HEAT CUT.",
      ],
    },
    {
      thumb: thumbChart,
      head: "AI SELL-OFF SINKS US STOCKS",
      body: [
        "S&P FALLS 3.7% INTO CORRECTION AS AI SLIDES.",
        "NASDAQ DROPS 5.3%. NVIDIA SINKS 14%.",
      ],
    },
  ];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    r.thumb(MX, y + 4, THUMB_W, THUMB_H);
    drawText(TX, y, r.head, 3, INK);
    drawText(TX, y + 26, r.body[0], 3, INK);
    drawText(TX, y + 52, r.body[1], 3, INK);
    y += ROW_H;
    if (i < rows.length - 1) {
      hline(MX, y - 6, CW, [200, 194, 182], 1);
    }
  }

  // footer rule
  hline(MX, y, CW, RULE, 2);
  y += 12;

  // IN BRIEF — label, then a real gap, then 4 roomy lines
  drawText(MX, y, "IN BRIEF", 3, ACCENT);
  y += 21 + 16; // generous gap after the label (v1 fix)
  const briefs = [
    "CYCLONE AKVAN: 370,000 FLEE IN ODISHA. NO DEATHS.",
    "WORLD COURT: ACTION URGED AFTER MYANMAR RULING.",
    "FRANCE SEEKS UN SECURITY COUNCIL MEETING ON KYIV.",
    "ESTONIA TO SHUT ITS BORDER WITH RUSSIA FROM 1 DEC.",
  ];
  for (const b of briefs) {
    rect(MX, y + 6, 10, 10, ACCENT); // square bullet
    drawText(MX + 22, y, b, 3, INK);
    y += 32; // generous line spacing (v1 fix)
  }
}

// ---------------------------------------------------------------- main
function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  fs.mkdirSync(outDir, { recursive: true });
  drawPage();
  const png = encodePNG();
  const pngPath = path.join(outDir, "entry.png");
  fs.writeFileSync(pngPath, png);
  const sha = crypto.createHash("sha256").update(png).digest("hex");
  const dossier = {
    competition: "news-image-20261121",
    version: 2,
    title: "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026",
    date: "2026-11-21",
    size: [W, H],
    entry_png_bytes: png.length,
    entry_png_sha256: sha,
    lead: {
      headline: "CLIMATE TALKS RUN PAST DEADLINE — STILL NO DEAL",
      facts: [
        "COP31 in Antalya ran past its Friday deadline with no deal; new draft due Saturday.",
        "Draft dropped every mention of fossil fuels.",
        "Draft dropped the $120bn/year adaptation finance figure.",
        "Nearly 200 nations taking part.",
      ],
      sources: ["AP", "CNN", "Reuters", "BBC"],
    },
    secondary: [
      {
        headline: "RUSSIAN MISSILES LAND IN POLAND",
        facts: [
          "Kh-101 cruise missile down near Nowy Lipowiec, Poland.",
          "NATO called it a grave violation.",
          "No one hurt.",
        ],
        sources: ["AP", "Reuters"],
      },
      {
        headline: "KYIV BRIDGES HIT IN MASS BARRAGE",
        facts: [
          "84 cruise missiles and 404 drones in one night.",
          "Three Dnipro bridges damaged.",
          "Power, heat and water cut.",
        ],
        sources: ["Kyiv Independent", "AP", "BBC"],
      },
      {
        headline: "AI SELL-OFF SINKS US STOCKS",
        facts: ["S&P -3.7%, into correction.", "Nasdaq -5.3%.", "Nvidia -14%."],
        sources: ["AP", "CNN", "WSJ"],
      },
    ],
    in_brief: [
      { text: "Cyclone Akvan: 370,000 evacuated in Odisha, no deaths reported.", source: "IMD" },
      { text: "World Court: action urged after Myanmar genocide ruling.", source: "ICJ reporting" },
      { text: "France seeks UN Security Council meeting over Kyiv strikes.", source: "wire reporting" },
      { text: "Estonia to shut its border with Russia from 1 Dec.", source: "wire reporting" },
    ],
    changes_vs_v1: [
      "Footer IN BRIEF: gap after the label and 32 px line spacing; 4 briefs instead of 5 crammed.",
      "Lead illustration: full COP31 hall scene (windows, flag bunting, wall clock, five delegates at a round table, globe, crossed-out draft) instead of globe + draft box + sun.",
    ],
  };
  fs.writeFileSync(path.join(outDir, "dossier.json"), JSON.stringify(dossier, null, 2) + "\n");
  console.log(`entry.png ${png.length} bytes sha256 ${sha}`);
}

main();
