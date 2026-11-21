// news-image-20261121 v15 — "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// Fresh procedural front page, 1024x1024. Node 22 stdlib only (fs, zlib).
// Renders at 2x supersampling then downsamples for smooth edges; fully
// deterministic (no Date, no Math.random) so two runs are byte-identical.
import * as fs from "node:fs";
import * as zlib from "node:zlib";

// ------------------------------------------------------------------ framebuffer
const SS = 2; // supersample factor
const W = 1024;
const H = 1024;
const DW = W * SS;
const DH = H * SS;
const img = new Uint8ClampedArray(DW * DH * 4);

type RGB = [number, number, number];
const PAPER: RGB = [247, 242, 228];
const INK: RGB = [26, 26, 26];
const RED: RGB = [179, 38, 30];
const WALL: RGB = [233, 220, 189];
const SKY: RGB = [188, 217, 234];
const WOOD: RGB = [90, 70, 50];
const TABLE_WOOD: RGB = [122, 82, 48];

function setPx(dx: number, dy: number, c: RGB, a = 1): void {
  if (dx < 0 || dy < 0 || dx >= DW || dy >= DH) return;
  const i = (dy * DW + dx) * 4;
  if (a >= 1) {
    img[i] = c[0];
    img[i + 1] = c[1];
    img[i + 2] = c[2];
    img[i + 3] = 255;
  } else {
    img[i] = Math.round(img[i] * (1 - a) + c[0] * a);
    img[i + 1] = Math.round(img[i + 1] * (1 - a) + c[1] * a);
    img[i + 2] = Math.round(img[i + 2] * (1 - a) + c[2] * a);
  }
}
function fillRectD(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(DW, Math.round(x + w));
  const y1 = Math.min(DH, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++)
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c, a);
}
// logical coords (1024 space) -> device
const d = (v: number): number => v * SS;
function rect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  fillRectD(d(x), d(y), d(w), d(h), c, a);
}
function circleD(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(DW - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(DH - 1, Math.ceil(cy + r));
  for (let yy = y0; yy <= y1; yy++)
    for (let xx = x0; xx <= x1; xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) setPx(xx, yy, c, a);
    }
}
function circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  circleD(d(cx), d(cy), d(r), c, a);
}
function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  const X = d(cx);
  const Y = d(cy);
  const RX = d(rx);
  const RY = d(ry);
  const x0 = Math.max(0, Math.floor(X - RX));
  const x1 = Math.min(DW - 1, Math.ceil(X + RX));
  const y0 = Math.max(0, Math.floor(Y - RY));
  const y1 = Math.min(DH - 1, Math.ceil(Y + RY));
  for (let yy = y0; yy <= y1; yy++)
    for (let xx = x0; xx <= x1; xx++) {
      const nx = (xx - X) / RX;
      const ny = (yy - Y) / RY;
      if (nx * nx + ny * ny <= 1) setPx(xx, yy, c, a);
    }
}
// thick line by stamping circles along it (device space)
function lineD(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, a = 1): void {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(len / 0.7));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    circleD(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, w / 2, c, a);
  }
}
function line(x1: number, y1: number, x2: number, y2: number, w: number, c: RGB, a = 1): void {
  lineD(d(x1), d(y1), d(x2), d(y2), d(w), c, a);
}
function polyD(pts: [number, number][], c: RGB, a = 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k]));
      const x1 = Math.min(DW - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c, a);
    }
  }
}
function poly(pts: [number, number][], c: RGB, a = 1): void {
  polyD(
    pts.map(([x, y]): [number, number] => [d(x), d(y)]),
    c,
    a,
  );
}
// arc stroke (angles in degrees, 0 = +x, 90 = +y/down)
function arcStroke(cx: number, cy: number, r: number, a0: number, a1: number, w: number, c: RGB, a = 1): void {
  const steps = Math.max(4, Math.ceil(Math.abs(a1 - a0) / 2));
  let px = 0;
  let py = 0;
  for (let i = 0; i <= steps; i++) {
    const t = (a0 + ((a1 - a0) * i) / steps) * (Math.PI / 180);
    const x = d(cx) + d(r) * Math.cos(t);
    const y = d(cy) + d(r) * Math.sin(t);
    if (i > 0) lineD(px, py, x, y, d(w), c, a);
    px = x;
    py = y;
  }
}
function strokeRect(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}

// ------------------------------------------------------------------ bitmap font
// 5x7 glyphs, rows as 5-bit numbers (bit 4 = leftmost pixel).
const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  a: [0, 0, 14, 1, 15, 17, 15], b: [16, 16, 30, 17, 17, 17, 30],
  c: [0, 0, 14, 16, 16, 17, 14], d: [1, 1, 15, 17, 17, 17, 15],
  e: [0, 0, 14, 17, 31, 16, 14], f: [6, 9, 8, 30, 8, 8, 8],
  g: [0, 14, 17, 17, 15, 1, 14], h: [16, 16, 30, 17, 17, 17, 17],
  i: [4, 0, 12, 4, 4, 4, 14], j: [2, 0, 6, 2, 2, 18, 12],
  k: [16, 16, 18, 20, 24, 20, 18], l: [12, 4, 4, 4, 4, 4, 14],
  m: [0, 0, 26, 21, 21, 21, 21], n: [0, 0, 30, 17, 17, 17, 17],
  o: [0, 0, 14, 17, 17, 17, 14], p: [0, 0, 30, 17, 17, 30, 16],
  q: [0, 0, 15, 17, 17, 15, 1], r: [0, 0, 22, 25, 16, 16, 16],
  s: [0, 0, 15, 16, 14, 1, 30], t: [8, 8, 28, 8, 8, 8, 6],
  u: [0, 0, 17, 17, 17, 19, 13], v: [0, 0, 17, 17, 17, 10, 4],
  w: [0, 0, 17, 21, 21, 21, 10], x: [0, 0, 17, 10, 4, 10, 17],
  y: [0, 0, 17, 17, 15, 1, 14], z: [0, 0, 31, 2, 4, 8, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 6, 8, 16, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  " ": [0, 0, 0, 0, 0, 0, 0], ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8], ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8], "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 6, 4, 0, 4], "-": [0, 0, 0, 14, 0, 0, 0],
  "—": [0, 0, 0, 31, 0, 0, 0], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0], "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8], "%": [25, 26, 2, 4, 8, 11, 19],
  $: [4, 15, 20, 14, 5, 30, 4], "&": [12, 18, 20, 8, 21, 18, 13],
  "/": [1, 2, 2, 4, 8, 8, 16], "+": [0, 4, 4, 31, 4, 4, 0],
  "•": [0, 0, 12, 12, 0, 0, 0], "[": [14, 8, 8, 8, 8, 8, 14],
  "]": [14, 2, 2, 2, 2, 2, 14],
};
function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}
function drawGlyph(ch: string, x: number, y: number, scale: number, c: RGB): void {
  const g = FONT[ch] ?? FONT["?"];
  const u = d(scale); // device px per font pixel
  const ox = d(x);
  const oy = d(y);
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    for (let col = 0; col < 5; col++) {
      if (row & (1 << (4 - col))) {
        fillRectD(ox + col * u, oy + r * u, u + 0.6, u + 0.6, c);
      }
    }
  }
}
interface TextOpts {
  bold?: boolean;
  align?: "left" | "center" | "right";
}
function text(s: string, x: number, y: number, scale: number, c: RGB, o: TextOpts = {}): void {
  const w = textWidth(s, scale);
  let sx = x;
  if (o.align === "center") sx = x - w / 2;
  else if (o.align === "right") sx = x - w;
  const boldDx = o.bold ? Math.max(0.7, scale * 0.22) : 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    drawGlyph(ch, sx + i * 6 * scale, y, scale, c);
    if (boldDx > 0) drawGlyph(ch, sx + i * 6 * scale + boldDx, y, scale, c);
  }
}
function wrapText(s: string, maxW: number, scale: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur === "" ? w : cur + " " + w;
    if (textWidth(trial, scale) <= maxW || cur === "") cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}
function paragraph(s: string, x: number, y: number, maxW: number, scale: number, c: RGB, lh: number): number {
  const lines = wrapText(s, maxW, scale);
  for (let i = 0; i < lines.length; i++) text(lines[i], x, y + i * lh, scale, c);
  return y + lines.length * lh;
}

// ------------------------------------------------------------------ scene
function drawWindow(cx: number, sun: boolean): void {
  const x0 = cx - 85;
  const x1 = cx + 85;
  const springY = 335;
  const bottomY = 440;
  // sky inside arch
  const pts: [number, number][] = [[x0, bottomY], [x0, springY]];
  for (let a = 180; a <= 360; a += 4) {
    const t = (a * Math.PI) / 180;
    pts.push([cx + 85 * Math.cos(t), springY + 85 * Math.sin(t)]);
  }
  pts.push([x1, bottomY]);
  poly(pts, SKY);
  if (sun) {
    // sun rays first (behind mullions)
    for (let k = 0; k < 12; k++) {
      const t = (k * Math.PI) / 6;
      line(
        cx + 31 * Math.cos(t), 300 + 31 * Math.sin(t),
        cx + 45 * Math.cos(t), 300 + 45 * Math.sin(t),
        3, [232, 185, 60],
      );
    }
    circle(cx, 300, 26, [242, 197, 49]);
    circle(cx, 300, 20, [247, 210, 90]);
  }
  // mullions over the rays
  rect(cx - 3, 252, 6, bottomY - 252, WOOD);
  rect(x0, springY - 3, 170, 6, WOOD);
  // frame: arch outline + sides + sill
  arcStroke(cx, springY, 85, 180, 360, 5, WOOD);
  line(x0, springY, x0, bottomY, 5, WOOD);
  line(x1, springY, x1, bottomY, 5, WOOD);
  rect(x0 - 6, bottomY, 182, 8, WOOD);
}

function drawDelegate(
  cx: number,
  skin: RGB,
  hair: RGB,
  suit: RGB,
  tie: RGB,
  style: "short" | "long" | "gray" | "blond" | "beard",
): void {
  const headY = 470;
  const headR = 27;
  // long hair behind head
  if (style === "long") {
    ellipse(cx, headY + 16, headR + 7, headR + 24, hair);
    ellipse(cx - headR + 2, headY + 18, 7, 20, hair);
    ellipse(cx + headR - 2, headY + 18, 7, 20, hair);
  }
  // neck
  rect(cx - 9, 492, 18, 16, skin);
  // torso (jacket)
  poly(
    [[cx - 16, 505], [cx + 16, 505], [cx + 50, 522], [cx + 54, 600], [cx - 54, 600], [cx - 50, 522]],
    suit,
  );
  // shirt + tie
  poly([[cx - 14, 505], [cx + 14, 505], [cx, 548]], [245, 245, 240]);
  poly([[cx - 4, 508], [cx + 4, 508], [cx + 5, 540], [cx, 556], [cx - 5, 540]], tie);
  // lapels
  poly([[cx - 16, 505], [cx - 2, 512], [cx - 10, 546]], [0, 0, 0], 0.18);
  poly([[cx + 16, 505], [cx + 2, 512], [cx + 10, 546]], [0, 0, 0], 0.18);
  // buttons
  circle(cx, 570, 2, [0, 0, 0], 0.5);
  circle(cx, 586, 2, [0, 0, 0], 0.5);
  // ears
  circle(cx - headR, headY + 2, 5, skin);
  circle(cx + headR, headY + 2, 5, skin);
  // face
  circle(cx, headY, headR, skin);
  // hair: soft crescent cap hugging the head (never side boxes).
  // A slightly larger, slightly higher circle is covered by the face
  // circle, leaving a smooth cap on top with thin blended sides.
  if (style === "gray") {
    // v15 fix (a): soft blended grey hair. Cap circle sits higher so the
    // sides stay thin; a lighter highlight arc follows the head curve.
    circle(cx, headY - 9, headR + 4, [154, 154, 154]);
    circle(cx, headY, headR, skin);
    arcStroke(cx, headY, headR + 1, 195, 345, 5, [201, 201, 201]);
    arcStroke(cx, headY, headR - 5, 210, 330, 2, [178, 178, 178]);
  } else if (style === "long") {
    circle(cx, headY - 7, headR + 3, hair);
    circle(cx, headY, headR, skin);
  } else if (style === "beard") {
    circle(cx, headY - 7, headR + 3, hair);
    circle(cx, headY, headR, skin);
    // beard follows the jaw curve
    arcStroke(cx, headY + 2, headR - 4, 25, 155, 6, [58, 42, 26]);
  } else {
    circle(cx, headY - 7, headR + 3, hair);
    circle(cx, headY, headR, skin);
  }
  // eyes: small dark slits + thin brows, no big white sclera
  const eyeC: RGB = [30, 22, 18];
  rect(cx - 12, headY - 2, 6, 2.5, eyeC);
  rect(cx + 6, headY - 2, 6, 2.5, eyeC);
  line(cx - 13, headY - 9, cx - 5, headY - 10, 1.6, [60, 45, 35]);
  line(cx + 5, headY - 10, cx + 13, headY - 9, 1.6, [60, 45, 35]);
  // nose + mouth
  line(cx, headY + 3, cx, headY + 9, 1.6, [0, 0, 0], 0.35);
  line(cx - 4, headY + 15, cx + 4, headY + 15, 1.6, [120, 70, 60]);
}

// ------------------------------------------------------------------ draw page
function drawPage(): void {
  // paper
  for (let i = 0; i < DW * DH; i++) {
    img[i * 4] = PAPER[0];
    img[i * 4 + 1] = PAPER[1];
    img[i * 4 + 2] = PAPER[2];
    img[i * 4 + 3] = 255;
  }
  // double border
  strokeRect(10, 10, 1004, 1004, 3, INK);
  strokeRect(17, 17, 990, 990, 1, INK);

  // ---- masthead
  text("THE WORLD", 512, 22, 11, INK, { bold: true, align: "center" });
  line(24, 108, 1000, 108, 2, INK);
  text("SATURDAY, 21 NOVEMBER 2026", 24, 116, 2, INK, { bold: true });
  text("— IN ONE IMAGE —", 512, 116, 2, INK, { bold: true, align: "center" });
  text("ANTALYA • WARSAW • KYIV • NEW YORK", 1000, 117, 1.8, INK, { bold: true, align: "right" });
  line(24, 138, 1000, 138, 1, INK);

  // ---- headline + standfirst
  const hl1 = "COP31 DRAGS INTO ";
  const hl2 = "OVERTIME";
  const hlW = textWidth(hl1, 5) + textWidth(hl2, 5);
  const hlX = 512 - hlW / 2;
  text(hl1, hlX, 150, 5, INK, { bold: true });
  text(hl2, hlX + textWidth(hl1, 5), 150, 5, RED, { bold: true });
  text("Talks pass their Friday deadline as the latest draft drops any mention", 512, 194, 2, INK, { align: "center" });
  text("of fossil fuels — and leaves out a $120bn-a-year adaptation pledge.", 512, 212, 2, INK, { align: "center" });

  // ---- main scene: COP31 hall (x 24–656, y 238–640)
  rect(24, 238, 632, 402, WALL);
  drawWindow(125, false);
  drawWindow(331, true); // sun whole, far above heads, rays behind mullions
  drawWindow(537, false);
  // dado line behind delegates
  line(24, 545, 656, 545, 2, [190, 172, 138]);
  // OVERTIME stamp, fully inside the frame
  rect(34, 246, 116, 24, RED);
  text("OVERTIME", 92, 251, 2, [255, 255, 255], { bold: true, align: "center" });
  // five delegates, torsos visible
  drawDelegate(95, [232, 184, 141], [74, 52, 36], [34, 53, 94], [150, 40, 40], "short");
  drawDelegate(205, [240, 200, 160], [40, 30, 24], [20, 85, 90], [200, 160, 60], "long");
  drawDelegate(340, [228, 178, 132], [154, 154, 154], [30, 42, 70], [179, 38, 30], "gray");
  drawDelegate(475, [200, 150, 105], [150, 115, 70], [80, 60, 60], [40, 70, 120], "blond");
  drawDelegate(590, [210, 165, 120], [52, 38, 28], [70, 84, 96], [90, 40, 40], "beard");
  // table at y=600
  rect(24, 600, 632, 40, TABLE_WOOD);
  line(24, 600, 656, 600, 3, [60, 40, 22]);
  line(180, 602, 180, 640, 1.5, [90, 60, 36]);
  line(500, 602, 500, 640, 1.5, [90, 60, 36]);
  // name plates
  const plates: [number, string][] = [
    [95, "EU"], [205, "G77"], [340, "CHAIR"], [475, "USA"], [590, "CHINA"],
  ];
  for (const [cx, label] of plates) {
    rect(cx - 27, 606, 54, 14, [250, 248, 240]);
    text(label, cx, 608.5, 1.2, INK, { bold: true, align: "center" });
  }
  // DRAFT paper, roomy, on the table
  rect(258, 532, 164, 96, [255, 255, 255]);
  strokeRect(258, 532, 164, 96, 1, [200, 195, 180]);
  text("DRAFT", 340, 542, 2.2, INK, { bold: true, align: "center" });
  text("fossil fuels", 340, 570, 1.8, INK, { align: "center" });
  // red strikethrough ONLY on the "fossil fuels" line
  const ffW = textWidth("fossil fuels", 1.8);
  line(340 - ffW / 2 - 4, 577.5, 340 + ffW / 2 + 4, 577.5, 3, RED);
  text("adaptation", 340, 590, 1.8, INK, { align: "center" });
  text("$120bn/yr", 340, 610, 1.8, INK, { align: "center" });
  // globe on the table, far left corner
  line(58, 590, 58, 598, 2, [90, 70, 50]);
  rect(46, 598, 24, 3, [90, 70, 50]);
  circle(58, 572, 18, [74, 144, 194]);
  ellipse(52, 566, 6, 4, [90, 160, 90]);
  ellipse(64, 578, 5, 4, [90, 160, 90]);
  ellipse(60, 564, 3, 2.5, [90, 160, 90]);
  arcStroke(58, 572, 13, 200, 320, 1.5, [255, 255, 255], 0.7);
  // scene frame
  strokeRect(24, 238, 632, 402, 3, INK);

  // ---- right rail: Poland thumbnail (y 238–378)
  rect(676, 238, 324, 140, [168, 200, 222]);
  rect(676, 300, 324, 48, [122, 166, 83]); // field
  rect(880, 300, 120, 48, [150, 130, 70], 0.5); // wheat patch
  // house + flag clear of the roof
  rect(704, 312, 52, 34, [232, 220, 200]);
  poly([[700, 312], [760, 312], [730, 292]], [138, 74, 58]);
  rect(726, 326, 12, 20, [90, 70, 50]);
  rect(712, 320, 10, 10, [180, 210, 230]);
  line(730, 292, 730, 262, 2, [60, 50, 40]);
  rect(730, 262, 26, 5, [255, 255, 255]);
  rect(730, 267, 26, 4, [200, 16, 46]);
  // pines
  for (const px of [795, 825, 855]) {
    poly([[px - 11, 346], [px + 11, 346], [px, 312]], [46, 93, 51]);
    rect(px - 2, 346, 4, 4, [90, 70, 50]);
  }
  // crater
  ellipse(905, 336, 36, 11, [74, 56, 38]);
  ellipse(905, 337, 26, 7, [42, 30, 18]);
  // missile diving to the crater, ~113 px, nose pointed
  {
    const tx = 972;
    const ty = 252; // tail
    const nx = 890;
    const ny = 330; // nose
    const dxn = nx - tx;
    const dyn = ny - ty;
    const len = Math.hypot(dxn, dyn);
    const cos = dxn / len;
    const sin = dyn / len;
    const P = (lx: number, ly: number): [number, number] => [
      d(tx + lx * cos - ly * sin),
      d(ty + lx * sin + ly * cos),
    ];
    const rot = (pts: [number, number][]): [number, number][] => pts.map(([lx, ly]) => P(lx, ly));
    // body (dark underlay + light core)
    polyD(rot([[0, -6], [100, -6], [113, 0], [100, 6], [0, 6]]), [90, 95, 102]);
    polyD(rot([[2, -4.5], [98, -4.5], [111, 0], [98, 4.5], [2, 4.5]]), [215, 218, 222]);
    // red band near the nose
    polyD(rot([[86, -5], [91, -5], [91, 5], [86, 5]]), RED);
    // v15 fix (b): swept wings, top and bottom EXACTLY the same size
    polyD(rot([[45, 4], [58, 30], [72, 30], [66, 4]]), [150, 155, 162]);
    polyD(rot([[45, -4], [58, -30], [72, -30], [66, -4]]), [150, 155, 162]);
    // tail fins, also balanced
    polyD(rot([[2, 4], [14, 17], [24, 17], [18, 4]]), [150, 155, 162]);
    polyD(rot([[2, -4], [14, -17], [24, -17], [18, -4]]), [150, 155, 162]);
    // sparse smoke behind the tail
    circle(982, 242, 5, [200, 200, 200], 0.4);
    circle(990, 234, 4, [200, 200, 200], 0.35);
    circle(996, 228, 3, [200, 200, 200], 0.3);
  }
  text("MISSILE FALLS IN POLAND", 686, 350, 1.8, INK, { bold: true });
  text("NATO: 'grave violation' — no deaths", 686, 364, 1.4, INK);
  strokeRect(676, 238, 324, 140, 2, INK);

  // ---- right rail: Kyiv thumbnail (y 390–530)
  rect(676, 390, 324, 80, [58, 58, 94]); // dusk sky
  rect(676, 430, 324, 30, [176, 106, 58]);
  rect(676, 460, 324, 10, [232, 160, 74]); // horizon glow
  rect(676, 470, 324, 28, [74, 106, 138]); // river
  line(700, 484, 780, 484, 2, [160, 190, 215], 0.7);
  line(860, 488, 960, 488, 2, [160, 190, 215], 0.7);
  // golden-domed church, left bank
  rect(702, 448, 34, 22, [232, 220, 200]);
  circle(719, 446, 12, [217, 165, 33]);
  line(719, 434, 719, 426, 2, [217, 165, 33]);
  line(715, 429, 723, 429, 2, [217, 165, 33]);
  // bridge deck as a shallow V
  line(690, 462, 838, 478, 5, [42, 42, 42]);
  line(838, 478, 990, 462, 5, [42, 42, 42]);
  // tilted pylon + cables
  line(838, 478, 812, 420, 6, [51, 51, 51]);
  line(812, 420, 760, 470, 1.5, [120, 120, 120]);
  line(812, 420, 838, 478, 1.5, [120, 120, 120]);
  line(812, 420, 920, 470, 1.5, [120, 120, 120]);
  // big fire at the bridge centre
  ellipse(838, 462, 14, 18, [232, 106, 26]);
  ellipse(838, 466, 9, 13, [242, 197, 49]);
  ellipse(838, 470, 5, 8, [255, 242, 168]);
  ellipse(815, 472, 7, 9, [232, 106, 26]);
  ellipse(862, 472, 7, 9, [242, 150, 40]);
  // smoke: anchored column above the fire
  const smoke: RGB = [90, 90, 90];
  circle(838, 440, 12, smoke, 0.75);
  circle(834, 424, 13, smoke, 0.7);
  circle(842, 408, 12, smoke, 0.65);
  circle(836, 394, 10, smoke, 0.6);
  // v15 fix (c): smoke trail — puffs a bit larger and denser than v14,
  // overlapping into a continuous textured trail at 480 px
  const trail: [number, number, number, number][] = [
    [860, 452, 9, 0.8], [874, 445, 10, 0.75], [888, 439, 10, 0.8], [902, 434, 10, 0.7],
    [916, 430, 9, 0.8], [930, 427, 10, 0.75], [944, 424, 9, 0.8], [958, 422, 9, 0.7],
    [972, 420, 8, 0.75], [984, 419, 8, 0.7],
    [867, 442, 5, 0.6], [895, 430, 5, 0.55], [923, 422, 5, 0.6], [951, 416, 5, 0.55],
    [881, 452, 4, 0.5], [909, 441, 4, 0.5], [937, 432, 4, 0.5], [965, 427, 4, 0.5],
  ];
  for (const [sx, sy, sr, sa] of trail) circle(sx, sy, sr, smoke, sa);
  text("KYIV UNDER FIRE", 686, 502, 1.8, INK, { bold: true });
  text("84 missiles, 404 drones — 3 bridges", 686, 516, 1.4, INK);
  strokeRect(676, 390, 324, 140, 2, INK);

  // ---- right rail: markets chart (y 542–640)
  rect(676, 542, 324, 98, [250, 247, 238]);
  text("WALL ST: AI SELL-OFF", 686, 548, 1.8, INK, { bold: true });
  text("S&P -3.7%   Nasdaq -5.3%", 686, 566, 1.6, INK);
  line(700, 580, 700, 630, 1.5, INK);
  line(700, 630, 992, 630, 1.5, INK);
  line(700, 596, 992, 596, 1, [216, 210, 192]);
  line(700, 612, 992, 612, 1, [216, 210, 192]);
  const chartPts: [number, number][] = [
    [706, 582], [760, 589], [812, 597], [862, 607], [912, 615], [968, 624],
  ];
  for (let i = 0; i + 1 < chartPts.length; i++) {
    line(chartPts[i][0], chartPts[i][1], chartPts[i + 1][0], chartPts[i + 1][1], 3, RED);
  }
  for (const [px, py] of chartPts) circle(px, py, 2.5, RED);
  poly([[968, 624], [956, 620], [960, 628]], RED);
  // NVIDIA label sits in the clear bottom-left corner, far from the line
  text("NVIDIA -14%", 706, 612, 2, RED, { bold: true });
  strokeRect(676, 542, 324, 98, 2, INK);

  // ---- middle band: the lead + by the numbers (y 655–845)
  text("THE LEAD", 24, 658, 2.5, INK, { bold: true });
  line(24, 678, 656, 678, 1.5, INK);
  let py = 688;
  py = paragraph(
    "ANTALYA — Talks ran past their Friday deadline into Saturday, with nearly 200 countries still haggling over a final text.",
    24, py, 632, 1.8, INK, 16.5,
  );
  py += 7;
  py = paragraph(
    "WARSAW — A Russian Kh-101 missile came down in Nowy Lipowiec. NATO called it a grave violation. No casualties were reported.",
    24, py, 632, 1.8, INK, 16.5,
  );
  py += 7;
  paragraph(
    "KYIV — Russia fired 84 missiles and 404 drones overnight, damaging three bridges over the Dnipro.",
    24, py, 632, 1.8, INK, 16.5,
  );
  // by the numbers box
  rect(676, 655, 324, 190, [250, 247, 238]);
  strokeRect(676, 655, 324, 190, 2, INK);
  text("BY THE NUMBERS", 690, 666, 2, INK, { bold: true });
  const stats: [string, string][] = [
    ["200", "countries at COP31 in Antalya"],
    ["$120bn", "adaptation pledge dropped"],
    ["84 + 404", "missiles, drones fired at Kyiv"],
    ["370,000", "evacuated from Cyclone Akvan"],
  ];
  let sy = 692;
  for (const [num, label] of stats) {
    text(num, 690, sy, 2.2, RED, { bold: true });
    text(label, 690, sy + 17, 1.6, INK);
    sy += 38;
  }

  // ---- footer: IN BRIEF (y 860–1005)
  text("IN BRIEF", 24, 862, 2.5, INK, { bold: true });
  line(24, 886, 1000, 886, 1.5, INK);
  const briefs: [string, string][] = [
    ["CYCLONE AKVAN", "370,000 people evacuated as the storm made landfall; no deaths reported."],
    ["ICJ — MYANMAR", "Judges in The Hague continue hearings in the case."],
    ["FRANCE", "Paris calls for an urgent UN Security Council session."],
    ["ESTONIA", "The government will close its border from 1 December."],
  ];
  const colX = [24, 272, 520, 768];
  for (let i = 0; i < 4; i++) {
    const [title, body] = briefs[i];
    text(title, colX[i], 896, 1.8, INK, { bold: true });
    paragraph(body, colX[i], 914, 232, 1.8, INK, 15);
  }
  line(24, 978, 1000, 978, 1, INK);
  text("Page 1 • Saturday, 21 November 2026", 512, 986, 1.5, INK, { align: "center" });
}

// ------------------------------------------------------------------ PNG output
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function pngEncode(w: number, h: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (1 + w * 4) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function downsample(src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

// ------------------------------------------------------------------ main
drawPage();
const out = process.argv[2] ?? "/tmp/out-v15.png";
const full = downsample(img, DW, DH, 1024, 1024);
fs.writeFileSync(out, pngEncode(1024, 1024, full));
const small = downsample(img, DW, DH, 480, 480);
fs.writeFileSync(out.replace(/\.png$/, "-480.png"), pngEncode(480, 480, small));
console.log("wrote " + out);
