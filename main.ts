// news-image-20261121 v7 — fresh procedural front page, Node 22 stdlib only.
// 1024x1024, pure software rasterizer + stroke vector font + PNG encoder.
// No network, no Date, no randomness: two runs are byte-identical.
//
// FACTS (verified live in v1-v6, unchanged):
// LEAD: COP31 Antalya overtime Sat 21 Nov — Friday deadline missed, draft drops
//   fossil-fuel mentions + $120bn/yr adaptation, ~200 nations, new draft due Sat.
// SECONDARY: Russian Kh-101 missile down in Poland (Nowy Lipowiec, NATO "grave
//   violation", no one hurt); Kyiv barrage (84 cruise missiles + 404 drones,
//   3 Dnipro bridges damaged, power/heat/water cut); US AI sell-off (S&P -3.7%
//   into correction, Nasdaq -5.3%, Nvidia -14%).
// IN BRIEF: Cyclone Akvan (370,000 fled Odisha, no deaths); World Court action
//   after Myanmar ruling; France seeks UNSC meeting on Kyiv; Estonia to shut
//   its Russia border from 1 Dec.
// v7 FIXES vs v6: (a) small & redrawn as two bold distinct parts (loop + sweep
//   tail) with extra-thick stroke so it never reads as a knot; (b) delegate
//   faces with pupil+highlight eyes, shaped brows, clear nose line, delegate 1
//   hair drawn as visible strands/texture (never a cap); (c) Kyiv fire/smoke
//   simplified to 2 smoke columns + 2 clean flames, V-collapsed bridge kept.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const W = 1024, H = 1024;
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// ---------- colour helpers ----------
function rgb(hex) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
const PAPER = rgb('#f6f1e4');
const INK = rgb('#1a1712');
const RED = rgb('#b3261e');
const WALL = rgb('#e7dbc0');
const WOOD = rgb('#7a4a2b');
const WOOD_D = rgb('#5f3820');
const WOOD_L = rgb('#96683f');

// ---------- pixel buffer ----------
const buf = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) {
  buf[i * 4] = PAPER[0]; buf[i * 4 + 1] = PAPER[1]; buf[i * 4 + 2] = PAPER[2]; buf[i * 4 + 3] = 255;
}
function setPx(x, y, c) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
}
function fillCircle(cx, cy, r, c) {
  const r2 = r * r;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
    const dx = Math.sqrt(Math.max(0, r2 - dy * dy));
    for (let x = Math.ceil(cx - dx); x <= Math.floor(cx + dx); x++) setPx(x, cy + dy, c);
  }
}
function fillEllipse(cx, cy, rx, ry, c) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
    const t = 1 - (dy * dy) / (ry * ry);
    if (t < 0) continue;
    const dx = rx * Math.sqrt(t);
    for (let x = Math.ceil(cx - dx); x <= Math.floor(cx + dx); x++) setPx(x, cy + dy, c);
  }
}
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
}
function fillPoly(pts, c) {
  let ymin = Infinity, ymax = -Infinity;
  for (const p of pts) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
  for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) setPx(x, y, c);
    }
  }
}
function line(x0, y0, x1, y1, w, c) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(dist));
  const r = w / 2;
  for (let i = 0; i <= steps; i++) {
    fillCircle(x0 + dx * i / steps, y0 + dy * i / steps, r, c);
  }
}
function polyline(pts, w, c) {
  for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w, c);
}
function arcPts(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

// ---------- stroke vector font (grid 0..8 wide, 0..10 tall, baseline 10) ----------
const GLYPHS = {
  'A': ['0,10 4,0 8,10', '2,6.5 6,6.5'],
  'B': ['0,0 0,10', '0,0 5,0 7,1.5 7,3.5 5,5 0,5', '0,5 5,5 7,6.5 7,8.5 5,10 0,10'],
  'C': ['7,2 5,0 2,0 0,2 0,8 2,10 5,10 7,8'],
  'D': ['0,0 0,10 5,10 7,8 7,2 5,0 0,0'],
  'E': ['7,0 0,0 0,10 7,10', '0,5 5,5'],
  'F': ['7,0 0,0 0,10', '0,5 5,5'],
  'G': ['7,2 5,0 2,0 0,2 0,8 2,10 5,10 7,8 7,5 4,5'],
  'H': ['0,0 0,10', '8,0 8,10', '0,5 8,5'],
  'I': ['4,0 4,10', '1.5,0 6.5,0', '1.5,10 6.5,10'],
  'J': ['7,0 7,8 5,10 2,10 0,8'],
  'K': ['0,0 0,10', '7,0 1,5 7,10'],
  'L': ['0,0 0,10 7,10'],
  'M': ['0,10 0,0 4,6 8,0 8,10'],
  'N': ['0,10 0,0 8,10 8,0'],
  'O': ['2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2 2,0'],
  'P': ['0,10 0,0 5,0 7,2 7,4 5,6 0,6'],
  'Q': ['2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2 2,0', '5,7 8,10'],
  'R': ['0,10 0,0 5,0 7,2 7,4 5,6 0,6', '4,6 8,10'],
  'S': ['7,2 6,0 2,0 0,2 0,4.5 2,5.5 6,5.5 8,6.5 8,8 6,10 2,10 1,8.5'],
  'T': ['0,0 8,0', '4,0 4,10'],
  'U': ['0,0 0,8 2,10 6,10 8,8 8,0'],
  'V': ['0,0 4,10 8,0'],
  'W': ['0,0 2,10 4,5 6,10 8,0'],
  'X': ['0,0 8,10', '8,0 0,10'],
  'Y': ['0,0 4,5 8,0', '4,5 4,10'],
  'Z': ['0,0 8,0 0,10 8,10'],
  '0': ['2,0 6,0 8,2 8,8 6,10 2,10 0,8 0,2 2,0'],
  '1': ['2,2 4,0 4,10', '1,10 7,10'],
  '2': ['1,2 2,0 6,0 7,2 7,4.5 0,10 8,10'],
  '3': ['1,0 6,0 7,2 6,4 4,5 6,6 7,8 6,10 1,10'],
  '4': ['5,0 5,10', '0,7 7,7', '0,7 5,0'],
  '5': ['7,0 0,0 0,4.5 5,4.5 7,6 7,8 5,10 0,10'],
  '6': ['7,1 5,0 2,0 0,2 0,8 2,10 5,10 7,8 7,6 5,4.5 2,4.5 0,6.5'],
  '7': ['0,0 8,0 4,10'],
  '8': ['2,0 6,0 7,2 6,4 2,4 1,2 2,0', '2,5 6,5 7,7 6,9.5 2,9.5 1,7 2,5'],
  '9': ['2,0 6,0 8,2 8,5 6,6.5 2,6.5 0,4.5 0,2 2,0', '8,5 8,8 6,10 4,10'],
  '.': ['3.6,9.2 4.4,9.2', '3.6,9.9 4.4,9.9'],
  ',': ['4,8.5 4,10', '4,10 2.5,12'],
  ':': ['3.6,3 4.4,3', '3.6,8 4.4,8'],
  ';': ['3.6,3 4.4,3', '4,8 4,10', '4,10 2.5,12'],
  "'": ['4.8,0 3.2,3'],
  '"': ['3,0 3,2.5', '6,0 6,2.5'],
  '-': ['1,5 7,5'],
  '–': ['0.5,5 7.5,5'],
  '—': ['0,5 8,5'],
  '−': ['1,5 7,5'],
  '(': ['5,0 3,2 3,8 5,10'],
  ')': ['3,0 5,2 5,8 3,10'],
  '/': ['7,0 1,10'],
  '+': ['4,2 4,8', '1,5 7,5'],
  '=': ['1,3.5 7,3.5', '1,6.5 7,6.5'],
  '!': ['4,0 4,7', '3.6,9.2 4.4,9.2'],
  '?': ['2,2 2,0.5 6,0.5 7,2 7,3.5 5,5 4,6 4,7', '3.6,9.2 4.4,9.2'],
  '$': ['4,-0.5 4,10.5', '7,2 6,0 2,0 0,2 0,4 2,5 6,5 8,6 8,8 6,10 2,10 1,9'],
  '•': ['3.2,4.5 4.8,4.5'],
  '~': ['0.5,6 2,4.5 4,6 6,4.5 7.5,6'],
};
// Special glyph: % — two small circles + bold diagonal, always crisp.
function drawPercent(x, yTop, size, c, weight) {
  const u = size / 10, w = Math.max(size * weight, size * 0.16);
  polyline(arcPts(x + 2 * u, yTop + 2.6 * u, 1.9 * u, 0, Math.PI * 2, 18), w, c);
  polyline(arcPts(x + 6 * u, yTop + 7.4 * u, 1.9 * u, 0, Math.PI * 2, 18), w, c);
  line(x + 7.2 * u, yTop + 0.6 * u, x + 0.8 * u, yTop + 9.4 * u, w, c);
}
// Special glyph: & — SIMPLIFIED small-size ampersand, two bold distinct parts:
// (1) a closed loop on top, (2) one sweeping stroke that dives from the loop's
// top-right down to the baseline and hooks right. Extra-thick stroke so the
// shape never collapses into a knot at thumbnail size.
function drawAmp(x, yTop, size, c, weight) {
  const u = size / 10;
  const w = size <= 20 ? size * 0.26 : size * Math.max(weight, 0.18);
  polyline(arcPts(x + 4.1 * u, yTop + 3.4 * u, 2.35 * u, 0, Math.PI * 2, 20), w, c);
  polyline([
    [x + 7.1 * u, yTop + 1.0 * u], [x + 5.2 * u, yTop + 3.6 * u],
    [x + 3.2 * u, yTop + 6.4 * u], [x + 1.7 * u, yTop + 9.2 * u],
    [x + 3.6 * u, yTop + 10.4 * u], [x + 6.6 * u, yTop + 9.5 * u],
  ], w, c);
}
function charAdvance(ch, size, tracking) {
  const u = size / 10;
  const base = ch === ' ' ? 5.5 * u : 9 * u;
  return base + size * tracking;
}
function textWidth(s, size, tracking) {
  let w = 0;
  for (const ch of s) w += charAdvance(ch, size, tracking);
  return w;
}
function drawChar(ch, x, yTop, size, c, weight, tracking) {
  const u = size / 10;
  if (ch === '%') { drawPercent(x, yTop, size, c, weight); return; }
  if (ch === '&') { drawAmp(x, yTop, size, c, weight); return; }
  const strokes = GLYPHS[ch];
  if (!strokes) return;
  const w = Math.max(size * weight, 1.2);
  for (const s of strokes) {
    const pts = s.split(' ').map((pair) => {
      const [px, py] = pair.split(',').map(Number);
      return [x + px * u, yTop + py * u];
    });
    polyline(pts, w, c);
  }
}
function drawText(s, x, yTop, size, o) {
  const color = o.color || INK;
  const weight = o.weight !== undefined ? o.weight : 0.17;
  const tracking = o.tracking || 0;
  const align = o.align || 'left';
  const w = textWidth(s, size, tracking);
  let cx = x;
  if (align === 'center') cx = x - w / 2;
  if (align === 'right') cx = x - w;
  for (const ch of s) {
    if (ch !== ' ') drawChar(ch, cx, yTop, size, color, weight, tracking);
    cx += charAdvance(ch, size, tracking);
  }
  return w;
}
function wrapText(s, size, maxW, tracking) {
  const words = s.split(' ');
  const lines = [];
  let cur = '';
  for (const word of words) {
    const trial = cur ? cur + ' ' + word : word;
    if (textWidth(trial, size, tracking) <= maxW || !cur) cur = trial;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}
function drawLines(lines, x, yTop, size, lh, o) {
  let y = yTop;
  for (const ln of lines) { drawText(ln, x, y, size, o); y += lh; }
  return y;
}

// ---------- scene helpers ----------
function flame(cx, y, s, cOut, cIn) {
  // Clean teardrop flame: one smooth outer shape, one inner tongue.
  fillPoly([
    [cx, y - 1.15 * s], [cx + 0.62 * s, y - 0.25 * s], [cx + 0.58 * s, y + 0.55 * s],
    [cx + 0.28 * s, y + 0.85 * s], [cx - 0.28 * s, y + 0.85 * s],
    [cx - 0.58 * s, y + 0.55 * s], [cx - 0.62 * s, y - 0.25 * s],
  ], cOut);
  fillPoly([
    [cx, y - 0.45 * s], [cx + 0.34 * s, y + 0.1 * s], [cx + 0.3 * s, y + 0.6 * s],
    [cx - 0.3 * s, y + 0.6 * s], [cx - 0.34 * s, y + 0.1 * s],
  ], cIn);
}

// ---------- MASTHEAD ----------
drawText('THE WORLD', 512, 22, 82, { align: 'center', weight: 0.11, tracking: 0.06 });
drawText('IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026', 512, 116, 20, { align: 'center', weight: 0.2 });
fillRect(34, 144, 956, 3, INK);
fillRect(34, 150, 956, 1, INK);

// ---------- LEAD SCENE: COP31 hall, Antalya ----------
const SX0 = 34, SY0 = 160, SX1 = 990, SY1 = 494;
fillRect(SX0, SY0, SX1 - SX0, SY1 - SY0, WALL);
// arched windows with sunset bands + full sun high in the middle window
const WIN_Y0 = 178, WIN_Y1 = 330;
const winCenters = [190, 512, 824];
const winW = 190, winR = winW / 2;
const bands = [
  [178, 214, '#f7b733'], [214, 250, '#f4845f'], [250, 286, '#e86a7a'], [286, 330, '#d95f6e'],
];
for (const cx of winCenters) {
  for (const [y0, y1, hex] of bands) {
    const col = rgb(hex);
    for (let y = y0; y < y1; y++) {
      let half = winR;
      const archCy = WIN_Y0 + winR;
      if (y < archCy) half = Math.sqrt(Math.max(0, winR * winR - (y - archCy) * (y - archCy)));
      for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) setPx(x, y, col);
    }
  }
  // low skyline silhouette inside each window
  fillRect(cx - winR, 306, winW, 24, rgb('#7a4a52'));
  fillRect(cx - 62, 292, 26, 38, rgb('#7a4a52'));
  fillRect(cx + 18, 298, 34, 32, rgb('#7a4a52'));
  fillRect(cx + 66, 288, 18, 42, rgb('#7a4a52'));
}
// full sun, high in the middle window
fillCircle(512, 224, 38, rgb('#ffedb0'));
fillCircle(512, 224, 30, rgb('#ffe066'));
// window frames: arch outline + mullions
for (const cx of winCenters) {
  polyline(arcPts(cx, WIN_Y0 + winR, winR, Math.PI, Math.PI * 2, 28), 5, rgb('#5f3820'));
  line(cx - winR, WIN_Y0 + winR, cx - winR, WIN_Y1, 5, rgb('#5f3820'));
  line(cx + winR, WIN_Y0 + winR, cx + winR, WIN_Y1, 5, rgb('#5f3820'));
  line(cx - winR, WIN_Y1, cx + winR, WIN_Y1, 5, rgb('#5f3820'));
  line(cx, WIN_Y0 + 4, cx, WIN_Y1, 4, rgb('#5f3820'));
  line(cx - winR, 258, cx + winR, 258, 4, rgb('#5f3820'));
}
// bunting: 16 flags across the hall
const flagCols = ['#b3261e', '#1f4e79', '#2e7d32', '#c9a227'].map(rgb);
line(50, 340, 974, 340, 2, INK);
for (let i = 0; i < 16; i++) {
  const fx = 50 + i * 57.7;
  fillPoly([[fx, 340], [fx + 26, 340], [fx + 13, 362]], flagCols[i % 4]);
}
// wall clock near midnight + OVERTIME (right wall, above the side table)
fillCircle(940, 378, 21, rgb('#fdfaf2'));
polyline(arcPts(940, 378, 21, 0, Math.PI * 2, 28), 3, INK);
for (let k = 0; k < 12; k++) {
  const a = k * Math.PI / 6;
  line(940 + 16 * Math.sin(a), 378 - 16 * Math.cos(a), 940 + 19 * Math.sin(a), 378 - 19 * Math.cos(a), 1.6, INK);
}
// 11:58 — minute hand almost straight up, hour hand just short of 12
line(940, 378, 940 - 2, 378 - 16, 2.4, INK);
line(940, 378, 941.5, 378 - 10, 2.8, INK);
fillCircle(940, 378, 2, INK);
drawText('OVERTIME', 940, 404, 13, { align: 'center', color: RED, weight: 0.24 });
// table top
fillRect(SX0, 436, SX1 - SX0, 16, WOOD_L);

// ---------- delegates (5, seated behind the table) ----------
function delegate(cx, skin, suit, hair, style, browTilt) {
  const headCy = 392;
  // shoulders + shirt + tie
  fillPoly([[cx - 56, 452], [cx - 44, 418], [cx + 44, 418], [cx + 56, 452]], suit);
  fillPoly([[cx - 13, 418], [cx + 13, 418], [cx, 450]], rgb('#f4efe2'));
  fillPoly([[cx - 4, 420], [cx + 4, 420], [cx + 6, 438], [cx, 448], [cx - 6, 438]], RED);
  // neck
  fillRect(cx - 9, 400, 18, 18, rgb('#c98d5f'));
  // long side hair goes behind the head
  if (style === 'long') {
    fillPoly([[cx - 30, 368], [cx - 38, 402], [cx - 34, 436], [cx - 22, 436], [cx - 24, 396]], hair);
    fillPoly([[cx + 30, 368], [cx + 38, 402], [cx + 34, 436], [cx + 22, 436], [cx + 24, 396]], hair);
  }
  // head + ears
  fillEllipse(cx, headCy, 29, 32, skin);
  fillCircle(cx - 29, 394, 5, skin);
  fillCircle(cx + 29, 394, 5, skin);
  // hair cap over the top of the head (hairline shows)
  const cap = [
    [cx - 29, 398], [cx - 30, 378], [cx - 24, 362], [cx - 12, 354], [cx, 352],
    [cx + 12, 354], [cx + 24, 362], [cx + 30, 378], [cx + 29, 398],
    [cx + 18, 372], [cx + 6, 366], [cx - 6, 368], [cx - 18, 374],
  ];
  fillPoly(cap, hair);
  // style details
  if (style === 'strands') {
    // Delegate 1: hair as visible strands and texture — never a solid cap.
    const strandCol = rgb('#6b4a33');
    const part = [cx - 4, 356];
    const ends = [[cx - 24, 372], [cx - 18, 378], [cx - 10, 374], [cx + 2, 370], [cx + 12, 372], [cx + 20, 378], [cx + 25, 372]];
    for (const e of ends) {
      polyline([part, [(part[0] + e[0]) / 2, (part[1] + e[1]) / 2 - 3], e], 2.2, strandCol);
    }
    // short loose strands crossing the hairline onto the forehead
    for (const sx of [cx - 16, cx - 6, cx + 4, cx + 14]) {
      polyline([[sx, 367], [sx + 1.5, 373], [sx - 1, 379]], 2, strandCol);
    }
    // side strands falling past the ears
    polyline([[cx - 28, 380], [cx - 30, 392], [cx - 28, 404]], 2.4, strandCol);
    polyline([[cx + 28, 380], [cx + 30, 392], [cx + 28, 404]], 2.4, strandCol);
    // hairline texture ticks
    for (const tx of [cx - 22, cx - 12, cx + 8, cx + 18]) {
      line(tx, 366, tx + 1, 371, 1.8, strandCol);
    }
  } else if (style === 'curls') {
    const curlCol = rgb('#9a9a9a');
    for (const [ox, oy] of [[-22, 372], [-12, 367], [-2, 365], [8, 367], [18, 371], [25, 377]]) {
      fillCircle(cx + ox, oy, 5.5, curlCol);
    }
  } else if (style === 'fringe') {
    fillRect(cx - 27, 366, 54, 6, hair); // straight fringe edge
    line(cx - 2, 354, cx + 8, 366, 2, rgb('#2a2a2a')); // sweep line
  } else if (style === 'part') {
    polyline([[cx - 2, 354], [cx + 6, 364], [cx + 10, 372]], 2, rgb('#111111'));
  } else if (style === 'long') {
    const strandCol = rgb('#a08c5a');
    for (const s of [-1, 1]) {
      polyline([[cx + s * 30, 372], [cx + s * 33, 400], [cx + s * 30, 428]], 2, strandCol);
      polyline([[cx + s * 25, 380], [cx + s * 28, 406], [cx + s * 25, 432]], 2, strandCol);
    }
  }
  // FACE — detailed: shaped brows, eyes with pupil + highlight, clear nose line
  const eyeY = 390, ex = 11.5;
  for (const s of [-1, 1]) {
    // shaped eyebrow: angled arch, thicker toward the inner end
    polyline([
      [cx + s * 17, 381 + browTilt], [cx + s * 11.5, 378 - browTilt * 0.5], [cx + s * 6, 380.5 + browTilt],
    ], 2.8, rgb('#241a12'));
    // eye: white, dark pupil, white highlight dot
    fillEllipse(cx + s * ex, eyeY, 4.8, 3.4, rgb('#ffffff'));
    fillCircle(cx + s * ex, eyeY, 2.1, rgb('#14100c'));
    fillCircle(cx + s * ex - 1.1, eyeY - 1.1, 0.9, rgb('#ffffff'));
    // upper lash line
    line(cx + s * (ex - 4.5), eyeY - 2.6, cx + s * (ex + 4.5), eyeY - 2.6, 1.4, rgb('#241a12'));
  }
  // nose: one clear L-shaped line
  polyline([[cx, 394], [cx - 1, 403], [cx + 2.5, 404]], 2, rgb('#8a5a34'));
  // mouth: small firm arc
  polyline([[cx - 6, 412], [cx, 414.5], [cx + 6, 412]], 2, rgb('#7a3a28'));
}
delegate(170, rgb('#e8b98d'), rgb('#274435'), rgb('#3a2a1e'), 'strands', 1);
delegate(330, rgb('#d9a06f'), rgb('#2e3a52'), rgb('#8a8a8a'), 'curls', -0.5);
delegate(512, rgb('#eec39e'), rgb('#333333'), rgb('#1e1e1e'), 'fringe', 0.5);
delegate(690, rgb('#c98d5f'), rgb('#4a2a2a'), rgb('#1e1e1e'), 'part', -1);
delegate(860, rgb('#e8b98d'), rgb('#3d2f4a'), rgb('#c9b489'), 'long', 0.5);
// glasses for delegate 3 (fringe), drawn over the eyes
for (const s of [-1, 1]) {
  polyline(arcPts(512 + s * 11.5, 390, 7.5, 0, Math.PI * 2, 18), 2, INK);
}
line(512 - 4, 390, 512 + 4, 390, 2, INK);
line(512 - 19, 390, 512 - 28, 392, 2, INK);
line(512 + 19, 390, 512 + 28, 392, 2, INK);
// table front panel
fillRect(SX0, 452, SX1 - SX0, SY1 - 452, WOOD);
fillRect(SX0, 452, SX1 - SX0, 3, WOOD_D);
for (let px = 120; px < SX1; px += 120) line(px, 456, px, SY1, 2, WOOD_D);
// DRAFT document on the table: "FOSSIL FUELS" with ONE clean red strike
fillRect(440, 448, 160, 44, rgb('#fdfaf2'));
polyline([[440, 448], [600, 448], [600, 492], [440, 492], [440, 448]], 2, INK);
drawText('DRAFT', 520, 451, 11, { align: 'center', weight: 0.24, color: RED });
fillRect(452, 464, 136, 2, rgb('#9a938a'));
fillRect(452, 470, 110, 2, rgb('#9a938a'));
drawText('FOSSIL FUELS', 520, 476, 12, { align: 'center', weight: 0.22 });
line(448, 482, 592, 482, 2.6, RED); // single clean strikethrough
// globe on the small side table, far right
fillRect(908, 458, 74, 6, WOOD_L);
fillRect(912, 464, 5, 30, WOOD_D);
fillRect(973, 464, 5, 30, WOOD_D);
fillCircle(945, 436, 21, rgb('#7fb3d5'));
fillPoly([[936, 428], [944, 422], [950, 428], [946, 436], [938, 436]], rgb('#5a9e4b'));
fillPoly([[950, 440], [958, 444], [954, 450], [946, 448]], rgb('#5a9e4b'));
polyline(arcPts(945, 436, 21, 0, Math.PI * 2, 24), 2, INK);
fillEllipse(945, 436, 8, 21, rgb('#7fb3d5')); // re-centre ocean over the seam
polyline(arcPts(945, 436, 8, 0, Math.PI * 2, 16), 1.6, rgb('#4a7ba6'));
fillPoly([[939, 456], [951, 456], [954, 462], [936, 462]], rgb('#8a6a3f'));
drawText('COP31 HALL, ANTALYA', 46, 476, 13, { color: rgb('#f6f1e4'), weight: 0.22 });
// scene border
polyline([[SX0, SY0], [SX1, SY0], [SX1, SY1], [SX0, SY1], [SX0, SY0]], 2, INK);

// ---------- HEADLINE + DECK ----------
drawText('COP31 TALKS RUN INTO OVERTIME', 512, 504, 33, { align: 'center', weight: 0.15 });
drawText('AS DRAFT DROPS FOSSIL FUELS', 512, 542, 33, { align: 'center', weight: 0.15 });
const deck = wrapText('FRIDAY DEADLINE MISSED IN ANTALYA. ABOUT 200 NATIONS STILL NEGOTIATING; A NEW DRAFT IS DUE SATURDAY.', 17, 956, 0);
drawLines(deck, 512, 580, 17, 21, { align: 'center', weight: 0.19 });
drawText('$120BN A YEAR IN ADAPTATION MONEY IS ALSO CUT FROM THE TEXT.', 512, 580 + deck.length * 21, 17, { align: 'center', weight: 0.19 });
fillRect(34, 648, 956, 2, INK);

// ---------- SECONDARY ROW ----------
const cols = [
  { x: 34, w: 310, kick: 'POLAND', head: 'RUSSIAN MISSILE FALLS IN POLAND',
    body: 'KH-101 DOWN AT NOWY LIPOWIEC; NATO: A GRAVE VIOLATION. NO ONE HURT.' },
  { x: 358, w: 310, kick: 'KYIV', head: '84 MISSILES, 404 DRONES HIT KYIV',
    body: 'THREE DNIPRO BRIDGES DAMAGED; POWER, HEAT AND WATER CUT.' },
  { x: 682, w: 308, kick: 'MARKETS', head: 'AI SELL-OFF DRAGS US STOCKS DOWN',
    body: 'S&P 500 DOWN 3.7% INTO CORRECTION; NASDAQ 5.3%; NVIDIA 14%.' },
];
for (const col of cols) {
  fillRect(col.x, 663, 9, 9, RED);
  drawText(col.kick, col.x + 15, 660, 14, { weight: 0.24 });
  polyline([[col.x, 684], [col.x + col.w, 684], [col.x + col.w, 772], [col.x, 772], [col.x, 684]], 1.6, INK);
  const hLines = wrapText(col.head, 17, col.w, 0);
  drawLines(hLines, col.x, 780, 17, 20, { weight: 0.2 });
  const bLines = wrapText(col.body, 14.5, col.w, 0);
  drawLines(bLines, col.x, 780 + hLines.length * 20 + 8, 14.5, 18, { weight: 0.19 });
}
// — Poland thumbnail: dusk field, crashed Kh-101, Polish flag —
{
  const x0 = 34, w = 310, y0 = 684, y1 = 772;
  fillRect(x0, y0, w, 56, rgb('#8fa3b8'));
  fillRect(x0, y0 + 56, w, 32, rgb('#5a6b3f'));
  fillRect(x0, y0 + 56, w, 4, rgb('#4a5a35'));
  fillEllipse(x0 + 150, y0 + 66, 36, 8, rgb('#3a2f26'));
  // missile tube, nose to the right, fins at the tail
  line(x0 + 118, y0 + 64, x0 + 186, y0 + 46, 10, rgb('#9aa0a6'));
  fillPoly([[x0 + 186, y0 + 46], [x0 + 202, y0 + 40], [x0 + 194, y0 + 54]], rgb('#7d838a'));
  fillPoly([[x0 + 118, y0 + 64], [x0 + 108, y0 + 56], [x0 + 114, y0 + 70]], rgb('#7d838a'));
  // one thin smoke wisp only
  polyline([[x0 + 160, y0 + 52], [x0 + 166, y0 + 38], [x0 + 160, y0 + 24]], 3, rgb('#cfd4d8'));
  // Polish flag on a pole
  line(x0 + 268, y0 + 14, x0 + 268, y0 + 62, 2.5, rgb('#6b5a44'));
  fillRect(x0 + 268, y0 + 16, 24, 6, rgb('#ffffff'));
  fillRect(x0 + 268, y0 + 22, 24, 6, rgb('#dc143c'));
  // fence posts
  for (const fx of [x0 + 40, x0 + 70, x0 + 230]) line(fx, y0 + 62, fx, y0 + 78, 2.5, rgb('#4a3a28'));
}
// — Kyiv thumbnail: SIMPLIFIED fire + smoke, V-collapsed bridge kept —
{
  const x0 = 358, w = 310, y0 = 684, y1 = 772;
  const sky = [[684, 706, '#3d2b52'], [706, 726, '#6b3a5e'], [726, 742, '#c65f4a'], [742, 748, '#e8895a']];
  for (const [a, b, hex] of sky) fillRect(x0, a, w, b - a, rgb(hex));
  // skyline with one golden dome
  fillRect(x0 + 8, 728, 40, 20, rgb('#2c2138'));
  fillRect(x0 + 60, 734, 30, 14, rgb('#2c2138'));
  fillRect(x0 + 250, 730, 44, 18, rgb('#2c2138'));
  fillCircle(x0 + 272, 726, 9, rgb('#e8b64c'));
  line(x0 + 272, 726, x0 + 272, 712, 2, rgb('#e8b64c'));
  // river
  fillRect(x0, 748, w, 24, rgb('#2c4a6b'));
  line(x0 + 20, 756, x0 + 120, 756, 1.6, rgb('#5a7ba0'));
  line(x0 + 190, 764, x0 + 290, 764, 1.6, rgb('#5a7ba0'));
  // bridge deck: bright, thick — left span, V-collapse, right span
  const deck = rgb('#ddd3bd'), deckEdge = rgb('#8a7f68');
  line(x0 + 6, 716, x0 + 140, 716, 7, deck);
  line(x0 + 140, 716, x0 + 155, 748, 7, deck);
  line(x0 + 155, 748, x0 + 170, 716, 7, deck);
  line(x0 + 170, 716, x0 + 304, 716, 7, deck);
  line(x0 + 6, 719.5, x0 + 304, 719.5, 1.6, deckEdge);
  // leaning pylon + two slack cables
  line(x0 + 118, 716, x0 + 110, 690, 4.5, rgb('#b8ab96'));
  polyline([[x0 + 110, 690], [x0 + 96, 704], [x0 + 80, 716]], 1.6, rgb('#8a7f68'));
  polyline([[x0 + 110, 690], [x0 + 128, 704], [x0 + 140, 716]], 1.6, rgb('#8a7f68'));
  // TWO smoke columns only, soft and simple
  polyline([[x0 + 148, 742], [x0 + 142, 722], [x0 + 146, 702]], 9, rgb('#8f8a96'));
  polyline([[x0 + 166, 744], [x0 + 172, 724], [x0 + 168, 706]], 7, rgb('#8f8a96'));
  // TWO clean flames at the break
  flame(x0 + 152, 736, 11, rgb('#f2701d'), rgb('#ffd23e'));
  flame(x0 + 164, 740, 8, rgb('#f2701d'), rgb('#ffd23e'));
}
// — Markets thumbnail: falling line, label far clear of it —
{
  const x0 = 682, w = 308, y0 = 684, y1 = 772;
  fillRect(x0, y0, w, y1 - y0, rgb('#fffdf6'));
  for (const gy of [706, 728, 750]) line(x0 + 14, gy, x0 + w - 8, gy, 1, rgb('#e8e2d2'));
  line(x0 + 14, y0 + 12, x0 + 14, y1 - 12, 2, INK);
  line(x0 + 14, y1 - 12, x0 + w - 8, y1 - 12, 2, INK);
  polyline([
    [x0 + 30, y0 + 22], [x0 + 90, y0 + 34], [x0 + 150, y0 + 44],
    [x0 + 210, y0 + 60], [x0 + 268, y0 + 70],
  ], 3.5, RED);
  fillPoly([[x0 + 268, y0 + 70], [x0 + 258, y0 + 64], [x0 + 258, y0 + 76]], RED);
  drawText('S&P −3.7%', x0 + w - 6, y0 + 4, 16, { align: 'right', color: RED, weight: 0.24 });
}

// ---------- FOOTER: IN BRIEF ----------
drawText('IN BRIEF', 34, 896, 19, { weight: 0.22 });
fillRect(34, 918, 956, 2, INK);
const briefs = [
  ['CYCLONE AKVAN: 370,000 FLEE ODISHA; NO DEATHS REPORTED.', 34],
  ['WORLD COURT: ACTION FOLLOWS THE MYANMAR RULING.', 524],
  ['FRANCE: SEEKS A UN SECURITY COUNCIL MEETING ON KYIV.', 34],
  ['ESTONIA: TO SHUT ITS RUSSIA BORDER FROM 1 DECEMBER.', 524],
];
const briefRows = [926, 962];
for (let i = 0; i < briefs.length; i++) {
  const [text, bx] = briefs[i];
  const by = briefRows[Math.floor(i / 2)];
  fillRect(bx, by + 4, 8, 8, RED);
  const lines = wrapText(text, 14.5, 446, 0);
  drawLines(lines, bx + 14, by, 14.5, 17, { weight: 0.19 });
}

// ---------- PNG encode ----------
function crc32(data) {
  let table = crc32.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    crc32.table = table;
  }
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = table[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const raw = Buffer.alloc(H * (1 + W * 4));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 4)] = 0;
  raw.set(buf.subarray(y * W * 4, (y + 1) * W * 4), y * (1 + W * 4) + 1);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'entry.png'), png);
writeFileSync(join(OUT, 'dossier.json'), JSON.stringify({
  competition: 'news-image-20261121', version: 7, width: W, height: H,
  title: 'THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026',
}, null, 2) + '\n');
