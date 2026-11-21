// news-image-20261121 v10 — "THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026"
// Fresh procedural front page, 1024x1024, Node stdlib only (no network, no assets).
// Own software rasteriser + 5x7 bitmap font + pure PNG encoder (zlib from stdlib).
// Writes /output/entry.png (or $MAKEFUN_OUTPUT_DIR) + dossier.json. Deterministic.
//
// Facts (verified live, v1-v9): COP31 Antalya overtime Sat 21 Nov — Friday deadline
// missed, draft drops fossil-fuel mention + $120bn/yr adaptation, ~200 nations, new
// draft due Saturday. Kh-101 fell in Nowy Lipowiec, Poland (NATO "grave violation",
// no casualties). Kyiv: 84 cruise missiles + 404 drones, 3 Dnipro bridges damaged,
// power/heat/water cut. US AI sell-off: S&P -3.7% (correction), Nasdaq -5.3%,
// NVIDIA -14%. IN BRIEF: Cyclone Akvan (370,000 flee Odisha, no deaths); World Court
// acts after Myanmar ruling; France seeks UN Security Council session on Kyiv;
// Estonia to shut Russia border from 1 Dec.
//
// v10 fixes vs v9: (a) second Kyiv smoke puff is anchored — a visible flame burns at
// the bridge break point and a smoke column rises from it into the puff; (b) the sun
// sits in the far-left window, well away from every delegate's head (no halo);
// (c) the Poland missile is redrawn as a real missile — pointed nose, body, swept
// wings, tail fins, nose-down into the crater; (d) markets body reads "NVIDIA -14%".

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

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

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

function encodePNG(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- rasteriser
const W = 1024;
const H = 1024;
const px = Buffer.alloc(W * H * 4);

type RGB = [number, number, number];
const C = (hex: string): RGB => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const PAPER = C('#f6f1e3');
const INK = C('#1b1b1b');
const RED = C('#b3261e');
const BLUE = C('#1f4e79');
const GOLD = C('#c9a227');
const WALL = C('#ddd0b4');
const FLOOR = C('#b08d63');

for (let i = 0; i < W * H; i++) {
  px[i * 4] = PAPER[0]; px[i * 4 + 1] = PAPER[1]; px[i * 4 + 2] = PAPER[2]; px[i * 4 + 3] = 255;
}

function setPx(x: number, y: number, c: RGB, a = 1): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= W || yi >= H) return;
  const o = (yi * W + xi) * 4;
  if (a >= 1) { px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255; return; }
  px[o] = Math.round(px[o] * (1 - a) + c[0] * a);
  px[o + 1] = Math.round(px[o + 1] * (1 - a) + c[1] * a);
  px[o + 2] = Math.round(px[o + 2] * (1 - a) + c[2] * a);
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB, a = 1): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c, a);
}

function circle(cx: number, cy: number, r: number, c: RGB, a = 1): void {
  const r2 = r * r;
  for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
    for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = xx - cx;
      const dy = yy - cy;
      if (dx * dx + dy * dy <= r2) setPx(xx, yy, c, a);
    }
  }
}

function ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1): void {
  for (let yy = Math.floor(cy - ry); yy <= Math.ceil(cy + ry); yy++) {
    for (let xx = Math.floor(cx - rx); xx <= Math.ceil(cx + rx); xx++) {
      const dx = (xx - cx) / rx;
      const dy = (yy - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(xx, yy, c, a);
    }
  }
}

function poly(pts: [number, number][], c: RGB, a = 1): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) setPx(x, y, c, a);
    }
  }
}

function line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    circle(x0 + (dx * i) / steps, y0 + (dy * i) / steps, w / 2, c, a);
  }
}

function polyOutline(pts: [number, number][], w: number, c: RGB): void {
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    line(x0, y0, x1, y1, w, c);
  }
}

function rrect(x: number, y: number, w: number, h: number, r: number, c: RGB, a = 1): void {
  fillRect(x + r, y, w - 2 * r, h, c, a);
  fillRect(x, y + r, w, h - 2 * r, c, a);
  circle(x + r, y + r, r, c, a);
  circle(x + w - r, y + r, r, c, a);
  circle(x + r, y + h - r, r, c, a);
  circle(x + w - r, y + h - r, r, c, a);
}

// ---------------------------------------------------------------- 5x7 font
// Rows are 5 bits wide, top to bottom. Lowercase included for mixed-case body text.
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
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111'],
  b: ['10000', '10000', '11110', '10001', '10001', '10001', '11110'],
  c: ['00000', '00000', '01110', '10000', '10000', '10001', '01110'],
  d: ['00001', '00001', '01111', '10001', '10001', '10001', '01111'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  f: ['00110', '01001', '01000', '11110', '01000', '01000', '01000'],
  g: ['00000', '01111', '10001', '10001', '01111', '00001', '01110'],
  h: ['10000', '10000', '11110', '10001', '10001', '10001', '10001'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  j: ['00010', '00000', '00110', '00010', '00010', '10010', '01100'],
  k: ['10000', '10000', '10010', '10100', '11000', '10100', '10010'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  n: ['00000', '00000', '11110', '10001', '10001', '10001', '10001'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  p: ['00000', '00000', '11110', '10001', '11110', '10000', '10000'],
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
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ',': ['00000', '00000', '00000', '00000', '01100', '00100', '01000'],
  '!': ['00100', '00100', '00100', '00100', '00100', '00000', '00100'],
  '?': ['01110', '10001', '00001', '00110', '00100', '00000', '00100'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  '"': ['01010', '01010', '01010', '00000', '00000', '00000', '00000'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '–': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  '—': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '%': ['11001', '11010', '00010', '00100', '01000', '01011', '10011'],
  '&': ['01100', '10010', '10100', '01000', '10101', '10010', '01101'],
  $: ['00100', '01111', '10100', '01110', '00101', '11110', '00100'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '=': ['00000', '00000', '11111', '00000', '11111', '00000', '00000'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  ';': ['00000', '01100', '01100', '00000', '01100', '00100', '01000'],
  '•': ['00000', '00000', '01100', '01100', '01100', '00000', '00000'],
  '~': ['00000', '00000', '01001', '10110', '00000', '00000', '00000'],
};

function textWidth(s: string, scale: number, tracking = 0): number {
  if (s.length === 0) return 0;
  return s.length * (6 * scale + tracking) - tracking;
}

function drawText(
  s: string,
  x: number,
  y: number,
  scale: number,
  c: RGB,
  opts: { bold?: boolean; align?: 'left' | 'center' | 'right'; tracking?: number } = {},
): void {
  const tracking = opts.tracking ?? 0;
  const w = textWidth(s, scale, tracking);
  let cx = x;
  if (opts.align === 'center') cx = x - w / 2;
  if (opts.align === 'right') cx = x - w;
  const boldDx = opts.bold ? (scale >= 5 ? 2 : 1) : 0;
  for (let i = 0; i < s.length; i++) {
    const g = FONT[s[i]];
    if (!g) continue;
    const gx = cx + i * (6 * scale + tracking);
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === '1') {
          fillRect(gx + col * scale, y + r * scale, scale, scale, c);
          if (boldDx) fillRect(gx + col * scale + boldDx, y + r * scale, scale, scale, c);
        }
      }
    }
  }
}

function wrapText(s: string, maxPx: number, scale: number, tracking = 0): string[] {
  const words = s.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, scale, tracking) <= maxPx || !cur) cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- scene bits
function flame(cx: number, baseY: number, s: number): void {
  // Teardrop flame: orange outer, yellow core, red glow underneath.
  circle(cx, baseY - 2, 11 * s, C('#e8641c'), 0.35);
  poly(
    [
      [cx - 7 * s, baseY],
      [cx - 9 * s, baseY - 9 * s],
      [cx - 3 * s, baseY - 16 * s],
      [cx + 2 * s, baseY - 20 * s],
      [cx + 6 * s, baseY - 10 * s],
      [cx + 7 * s, baseY],
    ],
    C('#e8641c'),
  );
  poly(
    [
      [cx - 3.5 * s, baseY],
      [cx - 4 * s, baseY - 6 * s],
      [cx, baseY - 11 * s],
      [cx + 3.5 * s, baseY - 5 * s],
      [cx + 3 * s, baseY],
    ],
    C('#f5c542'),
  );
}

function smokePuff(cx: number, cy: number, s: number, c: RGB, a: number): void {
  // Organic cluster of overlapping circles, uneven edges.
  circle(cx, cy, 13 * s, c, a);
  circle(cx - 11 * s, cy + 3 * s, 10 * s, c, a);
  circle(cx + 11 * s, cy + 4 * s, 9 * s, c, a);
  circle(cx - 4 * s, cy - 9 * s, 9 * s, c, a);
  circle(cx + 6 * s, cy - 8 * s, 8 * s, c, a);
  circle(cx - 15 * s, cy - 4 * s, 6 * s, c, a);
  circle(cx + 16 * s, cy - 3 * s, 6 * s, c, a);
}

function delegate(
  cx: number,
  headY: number,
  skin: RGB,
  hair: RGB,
  suit: RGB,
  tie: RGB,
  style: 'textured' | 'glasses' | 'bun' | 'beard' | 'grey',
): void {
  // Body (table will cover the lower part).
  poly(
    [
      [cx - 52, headY + 62],
      [cx - 40, headY + 24],
      [cx + 40, headY + 24],
      [cx + 52, headY + 62],
    ],
    suit,
  );
  // Shirt + tie.
  poly([[cx - 12, headY + 26], [cx + 12, headY + 26], [cx, headY + 58]], C('#f2ede0'));
  poly(
    [[cx - 4, headY + 28], [cx + 4, headY + 28], [cx + 6, headY + 46], [cx, headY + 56], [cx - 6, headY + 46]],
    tie,
  );
  // Ears.
  circle(cx - 25, headY, 5, skin);
  circle(cx + 25, headY, 5, skin);
  // Head.
  circle(cx, headY, 25, skin);
  // Hair cap.
  if (style === 'bun') {
    circle(cx, headY - 24, 9, hair);
    poly([[cx - 25, headY - 2], [cx - 24, headY - 18], [cx - 12, headY - 25], [cx + 12, headY - 25], [cx + 24, headY - 18], [cx + 25, headY - 2]], hair);
  } else if (style === 'grey') {
    poly([[cx - 25, headY - 2], [cx - 24, headY - 16], [cx - 12, headY - 24], [cx + 12, headY - 24], [cx + 24, headY - 16], [cx + 25, headY - 2]], hair);
  } else {
    poly([[cx - 25, headY - 4], [cx - 25, headY - 14], [cx - 14, headY - 25], [cx + 14, headY - 25], [cx + 25, headY - 14], [cx + 25, headY - 4]], hair);
  }
  if (style === 'textured') {
    // Textured hair: darker stipple dots + short strokes on the cap.
    const dk = C('#1a1a1a');
    circle(cx - 14, headY - 18, 2, dk);
    circle(cx - 4, headY - 22, 2, dk);
    circle(cx + 8, headY - 20, 2, dk);
    circle(cx + 16, headY - 14, 2, dk);
    circle(cx - 19, headY - 10, 2, dk);
    line(cx - 10, headY - 12, cx - 2, headY - 16, 2, dk);
    line(cx + 2, headY - 14, cx + 12, headY - 18, 2, dk);
  }
  if (style === 'beard') {
    // Beard along the jaw.
    ellipse(cx, headY + 14, 17, 12, hair);
    circle(cx, headY + 6, 17, skin);
  }
  // Brows, eyes, nose, mouth.
  line(cx - 13, headY - 8, cx - 5, headY - 9, 2, INK);
  line(cx + 5, headY - 9, cx + 13, headY - 8, 2, INK);
  circle(cx - 9, headY - 2, 2, INK);
  circle(cx + 9, headY - 2, 2, INK);
  line(cx, headY + 2, cx - 1, headY + 9, 2, C('#a06a45'));
  line(cx - 6, headY + 14, cx + 6, headY + 14, 2, C('#7a3b2e'));
  if (style === 'glasses') {
    circle(cx - 9, headY - 2, 6, INK, 0.9);
    circle(cx - 9, headY - 2, 4, skin);
    circle(cx - 9, headY - 2, 2, INK);
    circle(cx + 9, headY - 2, 6, INK, 0.9);
    circle(cx + 9, headY - 2, 4, skin);
    circle(cx + 9, headY - 2, 2, INK);
    line(cx - 3, headY - 2, cx + 3, headY - 2, 2, INK);
    line(cx - 15, headY - 2, cx - 24, headY - 4, 2, INK);
    line(cx + 15, headY - 2, cx + 24, headY - 4, 2, INK);
  }
}

// ---------------------------------------------------------------- lead scene
function drawLead(): void {
  // Wall + floor.
  fillRect(16, 150, 992, 342, WALL);
  fillRect(16, 440, 992, 52, FLOOR);
  line(16, 440, 1008, 440, 2, C('#8a6f4d'));
  // Border.
  polyOutline([[16, 150], [1008, 150], [1008, 492], [16, 492]], 2, INK);

  // Bunting: 16 flags across the top.
  line(20, 158, 1004, 158, 2, INK);
  const flagCols = [RED, C('#f2ede0'), BLUE, GOLD, C('#2e6b34')];
  for (let i = 0; i < 16; i++) {
    const cx = 32 + i * 62;
    poly([[cx - 17, 158], [cx + 17, 158], [cx, 182]], flagCols[i % 5]);
    line(cx - 17, 158, cx + 17, 158, 1, INK);
  }

  // Three arched windows.
  const winCx = [200, 512, 824];
  const winSky = [C('#f6b95e'), C('#e8a35c'), C('#f2c078')];
  for (let k = 0; k < 3; k++) {
    const cx = winCx[k];
    // Frame arch.
    circle(cx, 265, 80, C('#6b4f2e'));
    fillRect(cx - 80, 265, 160, 120, C('#6b4f2e'));
    // Sky arch.
    circle(cx, 265, 72, winSky[k]);
    fillRect(cx - 72, 265, 144, 120, winSky[k]);
    if (k === 1) {
      // Distant skyline in the middle window.
      fillRect(cx - 72, 330, 144, 55, C('#7a5a3a'));
      fillRect(cx - 60, 312, 22, 73, C('#5d4630'));
      fillRect(cx - 28, 322, 18, 63, C('#5d4630'));
      fillRect(cx + 2, 306, 24, 79, C('#5d4630'));
      fillRect(cx + 36, 320, 20, 65, C('#5d4630'));
    }
    if (k === 2) {
      // Clouds + birds in the right window.
      ellipse(cx - 28, 240, 26, 10, C('#fdf6e3'), 0.9);
      ellipse(cx + 24, 300, 30, 11, C('#fdf6e3'), 0.9);
      line(cx - 40, 220, cx - 34, 216, 2, INK);
      line(cx - 34, 216, cx - 28, 220, 2, INK);
      line(cx + 30, 250, cx + 36, 246, 2, INK);
      line(cx + 36, 246, cx + 42, 250, 2, INK);
    }
    // Mullions + sill.
    line(cx, 193, cx, 385, 4, C('#6b4f2e'));
    line(cx - 72, 300, cx + 72, 300, 4, C('#6b4f2e'));
    fillRect(cx - 84, 385, 168, 10, C('#6b4f2e'));
  }

  // (b) Sun — WHOLE circle, in the FAR-LEFT window, low and left, far from
  // every delegate head (nearest head is ~160 px away). No halo impression.
  circle(200, 262, 40, C('#f5a623'), 0.25);
  circle(200, 262, 30, C('#e07b28'));
  circle(196, 258, 8, C('#f5c542'), 0.8);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    line(
      200 + Math.cos(a) * 36, 262 + Math.sin(a) * 36,
      200 + Math.cos(a) * 44, 262 + Math.sin(a) * 44,
      3, C('#e07b28'),
    );
  }
  // Mullion over the sun (sun stays whole: mullion is a thin bar across it).
  line(200, 193, 200, 385, 4, C('#6b4f2e'));

  // Wall clock, hands at 11:58 — nearly midnight.
  circle(356, 240, 26, C('#fdfcf8'));
  circle(356, 240, 26, INK, 0.0);
  polyOutline(
    [
      [356 + 24, 240], [356 + 17, 240 + 17], [356, 240 + 24], [356 - 17, 240 + 17],
      [356 - 24, 240], [356 - 17, 240 - 17], [356, 240 - 24], [356 + 17, 240 - 17],
    ],
    2, INK,
  );
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    line(
      356 + Math.cos(a) * 21, 240 + Math.sin(a) * 21,
      356 + Math.cos(a) * 24, 240 + Math.sin(a) * 24,
      2, INK,
    );
  }
  // Hour hand ~11:58 (just left of 12), minute hand at 58 min.
  line(356, 240, 356 - 3, 240 - 13, 3, INK);
  line(356, 240, 356 - 5, 240 - 20, 2, INK);
  circle(356, 240, 3, INK);

  // OVERTIME badge — full label, clear of windows and bunting.
  rrect(598, 222, 140, 32, 6, RED);
  drawText('OVERTIME', 668, 230, 2, C('#ffffff'), { bold: true, align: 'center' });

  // Five delegates behind the round table.
  delegate(250, 388, C('#8a5a3b'), C('#141414'), C('#1f2a44'), RED, 'textured');
  delegate(380, 388, C('#e8b98d'), C('#3a2a1a'), C('#333333'), GOLD, 'glasses');
  delegate(512, 388, C('#f0c8a0'), C('#241a12'), C('#14524a'), C('#c9a227'), 'bun');
  delegate(644, 388, C('#c98d5f'), C('#1a1a1a'), C('#5d2430'), C('#e8e0cc'), 'beard');
  delegate(774, 388, C('#d9a06f'), C('#b8b0a4'), C('#243d24'), BLUE, 'grey');

  // Round table.
  ellipse(512, 458, 340, 46, C('#6e4a2c'));
  ellipse(512, 452, 340, 46, C('#8a5f3a'));
  line(172, 452, 852, 452, 2, C('#5d3d22'));
  // Papers + microphones on the table.
  fillRect(300, 440, 62, 16, C('#fdfcf8'));
  fillRect(700, 440, 62, 16, C('#fdfcf8'));
  line(360, 440, 360, 416, 3, INK);
  circle(360, 412, 6, INK);
  line(664, 440, 664, 416, 3, INK);
  circle(664, 412, 6, INK);

  // DRAFT document on the table: "FOSSIL FUELS" struck by ONE clean red line.
  fillRect(430, 442, 172, 44, C('#fdfcf8'));
  polyOutline([[430, 442], [602, 442], [602, 486], [430, 486]], 2, INK);
  drawText('DRAFT', 440, 446, 2, INK, { bold: true });
  drawText('FOSSIL FUELS', 440, 464, 2, INK, { bold: true });
  line(438, 471, 588, 471, 3, RED);

  // Globe on the side table, right.
  fillRect(905, 450, 100, 10, C('#6e4a2c'));
  fillRect(950, 460, 8, 24, C('#6e4a2c'));
  circle(955, 421, 28, C('#4a7fb5'));
  poly([[946, 408], [958, 402], [966, 412], [958, 420], [948, 418]], C('#3f7a3a'));
  poly([[944, 432], [956, 426], [968, 434], [962, 442], [950, 440]], C('#3f7a3a'));
  line(932, 421, 978, 421, 2, C('#2e5d8a'));
  line(955, 393, 955, 449, 2, C('#2e5d8a'));
  ellipse(955, 450, 16, 5, C('#8a6f4d'));
}

// ---------------------------------------------------------------- thumbnails
function drawPoland(): void {
  const x0 = 8;
  const x1 = 338;
  fillRect(x0, 656, 330, 60, C('#cfe0ea'));
  circle(306, 672, 10, C('#f5e6a8'));
  ellipse(60, 672, 24, 8, C('#f4f8fa'), 0.9);
  ellipse(150, 682, 28, 8, C('#f4f8fa'), 0.9);
  // Field.
  fillRect(x0, 716, 330, 56, C('#5d8a3c'));
  line(x0, 728, x1, 728, 2, C('#4a7030'));
  line(x0, 742, x1, 742, 2, C('#4a7030'));
  line(x0, 756, x1, 756, 2, C('#4a7030'));
  // House, left.
  fillRect(30, 692, 44, 24, C('#f5f0e0'));
  poly([[26, 692], [78, 692], [52, 676]], C('#8a4a2a'));
  fillRect(48, 704, 10, 12, C('#6b4a2f'));
  fillRect(36, 698, 8, 8, C('#7fb2d9'));
  // Pines.
  const pine = (tx: number): void => {
    fillRect(tx - 2, 706, 4, 10, C('#5d3d22'));
    poly([[tx - 10, 708], [tx + 10, 708], [tx, 690]], C('#2e5d2a'));
    poly([[tx - 8, 696], [tx + 8, 696], [tx, 682]], C('#356b31'));
  };
  pine(98);
  pine(126);
  pine(312);
  // Polish flag on a pole.
  line(285, 716, 285, 672, 3, INK);
  fillRect(285, 672, 26, 9, C('#ffffff'));
  fillRect(285, 681, 26, 9, C('#dc143c'));
  // Crater.
  ellipse(190, 748, 36, 11, C('#3a2a1c'));
  ellipse(190, 748, 26, 7, C('#241a10'));
  ellipse(190, 744, 30, 6, C('#5d4630'), 0.6);

  // (c) Real missile, nose-down into the crater — pointed nose, cylindrical
  // body, swept wings, tail fins. Never a straight grey pipe.
  // Tip T in the crater, tail up-right. d = tip->tail unit, p = perpendicular.
  const T: [number, number] = [190, 754];
  const d: [number, number] = [0.55, -0.835];
  const p: [number, number] = [0.835, 0.55];
  const at = (s: number, q: number): [number, number] => [T[0] + d[0] * s + p[0] * q, T[1] + d[1] * s + p[1] * q];
  // Outline pass (dark, slightly larger), then body.
  const body: [number, number][] = [at(26, 6), at(76, 6), at(76, -6), at(26, -6)];
  const nose: [number, number][] = [T, at(26, 6), at(26, -6)];
  const bodyBig: [number, number][] = [at(24, 8), at(78, 8), at(78, -8), at(24, -8)];
  poly([T, at(24, 8), at(24, -8)], C('#333a40'));
  poly(bodyBig, C('#333a40'));
  poly(nose, C('#c3ccd4'));
  poly(body, C('#c3ccd4'));
  // Red band near the nose + dark nose tip.
  poly([at(30, 6), at(36, 6), at(36, -6), at(30, -6)], RED);
  poly([[T[0], T[1]], at(10, 3), at(10, -3)], C('#5d6a75'));
  // Swept wings, mid-body, sweeping back toward the tail.
  const M = 46;
  poly([at(M, 5), at(M - 14, 5), at(M - 18, 20), at(M - 2, 20)], C('#9aa7b1'));
  poly([at(M, -5), at(M - 14, -5), at(M - 18, -20), at(M - 2, -20)], C('#9aa7b1'));
  polyOutline([at(M, 5), at(M - 14, 5), at(M - 18, 20), at(M - 2, 20)], 1, C('#333a40'));
  polyOutline([at(M, -5), at(M - 14, -5), at(M - 18, -20), at(M - 2, -20)], 1, C('#333a40'));
  // Tail fins at the tail end.
  poly([at(72, 6), at(64, 6), at(60, 15), at(68, 15)], C('#8b98a3'));
  poly([at(72, -6), at(64, -6), at(60, -15), at(68, -15)], C('#8b98a3'));
  polyOutline([at(72, 6), at(64, 6), at(60, 15), at(68, 15)], 1, C('#333a40'));
  polyOutline([at(72, -6), at(64, -6), at(60, -15), at(68, -15)], 1, C('#333a40'));
  // Tail nozzle.
  poly([at(76, 5), at(80, 5), at(80, -5), at(76, -5)], C('#5d6a75'));

  // Ragged smoke: sparse, loose puffs drifting right from the crater.
  const smoke = C('#9aa0a3');
  circle(222, 722, 9, smoke, 0.8);
  circle(246, 708, 12, smoke, 0.8);
  circle(272, 700, 8, smoke, 0.8);
  circle(296, 708, 10, smoke, 0.8);
  circle(318, 718, 7, smoke, 0.8);
  // Debris.
  circle(160, 740, 2, INK);
  circle(226, 742, 2, INK);
  circle(150, 752, 2, INK);
}

function drawKyiv(): void {
  const x0 = 346;
  fillRect(x0, 656, 330, 74, C('#eec27f'));
  fillRect(x0, 656, 330, 18, C('#f4d49a'));
  // Far bank + river.
  fillRect(x0, 722, 330, 10, C('#6b5a44'));
  fillRect(x0, 732, 330, 40, C('#5b7fa6'));
  line(x0 + 10, 744, x0 + 120, 744, 2, C('#7fa3c8'));
  line(x0 + 200, 756, x0 + 320, 756, 2, C('#7fa3c8'));
  line(x0 + 60, 764, x0 + 180, 764, 2, C('#7fa3c8'));
  // Golden-domed church on the far bank, right.
  fillRect(622, 726, 36, 8, C('#d8c9a8'));
  circle(640, 714, 15, GOLD);
  circle(636, 710, 5, C('#f0d060'), 0.9);
  line(640, 700, 640, 692, 3, GOLD);
  line(634, 696, 646, 696, 3, GOLD);
  // Bridge deck with a V break in the middle.
  line(352, 738, 492, 738, 5, C('#4a3f35'));
  line(492, 738, 508, 754, 5, C('#4a3f35'));
  line(540, 752, 556, 738, 5, C('#4a3f35'));
  line(556, 738, 670, 738, 5, C('#4a3f35'));
  // Leaning pylon + cables.
  line(470, 738, 448, 686, 7, C('#3f3630'));
  line(440, 692, 458, 692, 4, C('#3f3630'));
  line(448, 688, 400, 738, 1, C('#3f3630'));
  line(448, 688, 500, 738, 1, C('#3f3630'));
  // Small fire on the left deck.
  flame(400, 736, 0.7);
  // (a) ANCHORED second puff: a flame burns at the break point and a smoke
  // column rises from it straight into the puff — the puff has a visible
  // source of fire below it, it does not float free.
  flame(522, 752, 1.0);
  circle(522, 740, 6, C('#8f9599'), 0.85);
  circle(524, 730, 8, C('#8f9599'), 0.85);
  circle(520, 718, 10, C('#8f9599'), 0.85);
  circle(524, 706, 11, C('#8f9599'), 0.85);
  smokePuff(526, 692, 1.0, C('#8f9599'), 0.85);
  // First puff, rising from the left-deck fire.
  circle(398, 726, 7, C('#8f9599'), 0.85);
  circle(396, 714, 9, C('#8f9599'), 0.85);
  circle(398, 702, 10, C('#8f9599'), 0.85);
  smokePuff(400, 688, 0.9, C('#8f9599'), 0.85);
}

function drawMarkets(): void {
  const x0 = 684;
  fillRect(x0, 656, 330, 116, C('#fdfcf8'));
  polyOutline([[x0, 656], [1014, 656], [1014, 772], [x0, 772]], 2, INK);
  // Grid.
  for (let gx = x0 + 33; gx < 1014; gx += 33) line(gx, 656, gx, 772, 1, C('#e0ddd2'));
  for (const gy of [680, 704, 728, 752]) line(x0, gy, 1014, gy, 1, C('#e0ddd2'));
  // Falling chart line, red.
  const pts: [number, number][] = [
    [694, 672], [748, 688], [800, 698], [852, 722], [904, 738], [956, 756], [1004, 766],
  ];
  for (let i = 0; i + 1 < pts.length; i++) line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 4, RED);
  for (const p of pts) circle(p[0], p[1], 4, RED);
  // Labels kept FAR from the line: S&P bottom-left (line is high there),
  // NASDAQ top-right (line is low there).
  drawText('S&P -3.7%', 692, 754, 2, RED, { bold: true });
  drawText('NASDAQ -5.3%', 860, 662, 2, RED, { bold: true });
}

// ---------------------------------------------------------------- page
function main(): void {
  // Masthead.
  fillRect(16, 10, 992, 2, INK);
  fillRect(16, 15, 992, 1, INK);
  drawText('THE WORLD', 512, 26, 11, INK, { align: 'center' });
  drawText('SATURDAY, 21 NOVEMBER 2026 — IN ONE IMAGE', 512, 112, 3, INK, { bold: true, align: 'center' });
  fillRect(16, 140, 992, 2, INK);

  // Lead illustration + headline + body.
  drawLead();
  drawText('COP31 TALKS RUN INTO OVERTIME', 512, 510, 5, INK, { bold: true, align: 'center' });
  drawText('DRAFT DROPS FOSSIL-FUEL WORDING', 512, 546, 5, INK, { bold: true, align: 'center' });
  drawText('FRIDAY DEADLINE MISSED IN ANTALYA;', 512, 588, 3, INK, { bold: true, align: 'center' });
  drawText('~200 NATIONS AWAIT A NEW DRAFT ON SATURDAY', 512, 610, 3, INK, { bold: true, align: 'center' });
  drawText('$120BN-A-YEAR ADAPTATION TARGET ALSO CUT', 512, 632, 3, INK, { bold: true, align: 'center' });

  // Secondary row.
  fillRect(16, 654, 992, 2, INK);
  drawPoland();
  drawKyiv();
  drawMarkets();
  const cols = [173, 511, 849];
  const heads: [string, string][] = [
    ['MISSILE FALLS', 'IN POLAND'],
    ['KYIV HIT BY', '84 MISSILES'],
    ['AI SELL-OFF HITS', 'WALL STREET'],
  ];
  const facts: [string, string][] = [
    ['Kh-101 down in Nowy Lipowiec', 'NATO: grave violation; no dead'],
    ['404 drones; 3 bridges hit', 'Power, heat, water cut off'],
    ['S&P -3.7%, into correction', 'Nasdaq -5.3% • NVIDIA -14%'],
  ];
  for (let i = 0; i < 3; i++) {
    drawText(heads[i][0], cols[i], 780, 3, INK, { bold: true, align: 'center' });
    drawText(heads[i][1], cols[i], 802, 3, INK, { bold: true, align: 'center' });
    drawText(facts[i][0], cols[i], 826, 2, INK, { bold: true, align: 'center', tracking: -1 });
    drawText(facts[i][1], cols[i], 843, 2, INK, { bold: true, align: 'center', tracking: -1 });
  }

  // Footer IN BRIEF — roomy 2x2 grid.
  fillRect(16, 868, 992, 2, INK);
  fillRect(16, 878, 12, 12, RED);
  drawText('IN BRIEF', 36, 876, 3, INK, { bold: true });
  const briefs = [
    'Cyclone Akvan: 370,000 flee Odisha; no deaths',
    'World Court acts after Myanmar ruling',
    'France seeks UN Security Council session on Kyiv',
    'Estonia to shut Russia border from 1 Dec',
  ];
  const bx = [16, 524];
  const by = [906, 952];
  for (let i = 0; i < 4; i++) {
    const x = bx[i % 2];
    const y = by[Math.floor(i / 2)];
    const lines = wrapText(briefs[i], 470, 2, -1);
    circle(x + 5, y + 7, 4, RED);
    for (let l = 0; l < lines.length; l++) {
      drawText(lines[l], x + 16, y + l * 17, 2, INK, { bold: true, tracking: -1 });
    }
  }
  fillRect(16, 1006, 992, 2, INK);
  fillRect(16, 1011, 992, 1, INK);

  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG(W, H, px));
  writeFileSync(
    join(outDir, 'dossier.json'),
    JSON.stringify(
      {
        title: 'THE WORLD — IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026',
        competition: 'news-image-20261121',
        version: 10,
        size: [1024, 1024],
        facts: [
          'COP31 Antalya overtime Sat 21 Nov; Friday deadline missed; draft drops fossil-fuel mention + $120bn/yr adaptation; ~200 nations; new draft due Saturday',
          'Russian Kh-101 fell in Nowy Lipowiec, Poland; NATO grave violation; no casualties',
          'Kyiv: 84 cruise missiles + 404 drones; 3 Dnipro bridges damaged; power, heat, water cut',
          'US AI sell-off: S&P -3.7% into correction; Nasdaq -5.3%; NVIDIA -14%',
          'IN BRIEF: Cyclone Akvan 370,000 flee Odisha, no deaths; World Court acts after Myanmar ruling; France seeks UN Security Council session on Kyiv; Estonia to shut Russia border from 1 Dec',
        ],
      },
      null,
      2,
    ) + '\n',
  );
}

main();
