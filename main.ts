// news-image-20261121 v13 — fresh procedural front page.
// Node 22 stdlib only, no network. 1024x1024, rendered at 2x supersampling,
// encoded as RGB PNG. Facts are the verified v1-v12 facts; no numbers changed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const SS = 2, W = 1024, H = 1024, SW = W * SS, SH = H * SS;
const fb = new Uint8Array(SW * SH * 3);

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const PAPER = hex('#f7f1e3'), INK = hex('#1b1813'), SOFT = hex('#4a4436');
const RED = hex('#a92c1e'), BLUE = hex('#1d4e89'), GOLD = hex('#c9972e');
const GREEN = hex('#2f6b33'), WALL = hex('#e7dabf'), WOOD = hex('#7a5230');
const WOOD2 = hex('#8a5f38'), BRONZE = hex('#6b4f2a'), SKYT = hex('#bcd8e8'), SKYB = hex('#f2d9a4');

function setPx(x, y, c) {
  if (x < 0 || y < 0 || x >= SW || y >= SH) return;
  const i = (y * SW + x) * 3; fb[i] = c[0]; fb[i + 1] = c[1]; fb[i + 2] = c[2];
}
const X = (v) => Math.round(v * SS);
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, X(x)), y0 = Math.max(0, X(y));
  const x1 = Math.min(SW, X(x + w)), y1 = Math.min(SH, X(y + h));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
}
function hline(x0, x1, y, w, c) { fillRect(x0, y - w / 2, x1 - x0, w, c); }
function vline(x, y0, y1, w, c) { fillRect(x - w / 2, y0, w, y1 - y0, c); }
function circle(cx, cy, r, c) {
  const rr = X(r), ccx = X(cx), ccy = X(cy);
  for (let dy = -rr; dy <= rr; dy++) {
    const dx = Math.floor(Math.sqrt(rr * rr - dy * dy));
    for (let xx = ccx - dx; xx <= ccx + dx; xx++) setPx(xx, ccy + dy, c);
  }
}
function ellipse(cx, cy, rx, ry, c) {
  const RX = X(rx), RY = X(ry), ccx = X(cx), ccy = X(cy);
  for (let dy = -RY; dy <= RY; dy++) {
    const dx = Math.floor(RX * Math.sqrt(1 - (dy * dy) / (RY * RY)));
    for (let xx = ccx - dx; xx <= ccx + dx; xx++) setPx(xx, ccy + dy, c);
  }
}
function poly(pts, c) {
  const P = pts.map(([x, y]) => [X(x), X(y)]);
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of P) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) xs.push(x0 + (y - y0) * (x1 - x0) / (y1 - y0));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k])), x1 = Math.min(SW - 1, Math.floor(xs[k + 1]));
      for (let x = x0; x <= x1; x++) setPx(x, y, c);
    }
  }
}
function line(x0, y0, x1, y1, w, c) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  if (len < 0.01) { circle(x0, y0, w / 2, c); return; }
  const nx = -dy / len * w / 2, ny = dx / len * w / 2;
  poly([[x0 + nx, y0 + ny], [x1 + nx, y1 + ny], [x1 - nx, y1 - ny], [x0 - nx, y0 - ny]], c);
  circle(x0, y0, w / 2, c); circle(x1, y1, w / 2, c);
}
// Smooth continuous arc stroke (no dots): many short segments, round joins.
function arcStroke(cx, cy, r, a0, a1, w, c) {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 90)));
  let px = cx + r * Math.cos(a0), py = cy + r * Math.sin(a0);
  for (let i = 1; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    const qx = cx + r * Math.cos(a), qy = cy + r * Math.sin(a);
    line(px, py, qx, qy, w, c); px = qx; py = qy;
  }
}
function ring(cx, cy, r, w, c) { arcStroke(cx, cy, r, 0, Math.PI * 2, w, c); }

// ---------- 5x7 bitmap font (rows are 5-bit values, bit 4 = left column) ----------
const FONT = {
  'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30],
  'C': [14, 17, 16, 16, 16, 17, 14], 'D': [30, 17, 17, 17, 17, 17, 30],
  'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
  'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17],
  'I': [14, 4, 4, 4, 4, 4, 14], 'J': [7, 2, 2, 2, 2, 18, 12],
  'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
  'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 25, 21, 19, 17, 17, 17],
  'O': [14, 17, 17, 17, 17, 17, 14], 'P': [30, 17, 17, 30, 16, 16, 16],
  'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
  'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4],
  'U': [17, 17, 17, 17, 17, 17, 14], 'V': [17, 17, 17, 17, 17, 10, 4],
  'W': [17, 17, 17, 21, 21, 27, 17], 'X': [17, 17, 10, 4, 10, 17, 17],
  'Y': [17, 17, 10, 4, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
  'a': [0, 14, 1, 15, 17, 17, 15], 'b': [16, 16, 30, 17, 17, 17, 30],
  'c': [0, 14, 17, 16, 16, 17, 14], 'd': [1, 1, 15, 17, 17, 17, 15],
  'e': [0, 14, 17, 31, 16, 17, 14], 'f': [6, 8, 8, 30, 8, 8, 8],
  'g': [0, 15, 17, 17, 15, 1, 14], 'h': [16, 16, 30, 17, 17, 17, 17],
  'i': [4, 0, 12, 4, 4, 4, 14], 'j': [2, 0, 6, 2, 2, 18, 12],
  'k': [16, 16, 18, 20, 24, 20, 18], 'l': [12, 4, 4, 4, 4, 4, 14],
  'm': [0, 26, 21, 21, 21, 21, 21], 'n': [0, 30, 17, 17, 17, 17, 17],
  'o': [0, 14, 17, 17, 17, 17, 14], 'p': [0, 30, 17, 17, 30, 16, 16],
  'q': [0, 15, 17, 17, 15, 1, 1], 'r': [0, 22, 25, 16, 16, 16, 16],
  's': [0, 15, 16, 14, 1, 1, 30], 't': [8, 8, 30, 8, 8, 9, 6],
  'u': [0, 17, 17, 17, 17, 19, 13], 'v': [0, 17, 17, 17, 17, 10, 4],
  'w': [0, 17, 17, 21, 21, 27, 17], 'x': [0, 17, 17, 10, 4, 10, 17],
  'y': [0, 17, 17, 17, 15, 1, 14], 'z': [0, 31, 1, 2, 4, 8, 31],
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8], '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 2, 4, 0, 4], "'": [4, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '-': [0, 0, 0, 31, 0, 0, 0],
  '/': [1, 1, 2, 4, 8, 16, 16], '%': [24, 24, 2, 4, 8, 3, 3],
  '$': [4, 15, 20, 14, 5, 30, 4], '&': [12, 18, 20, 8, 21, 18, 13],
  '+': [0, 4, 4, 31, 4, 4, 0], '=': [0, 0, 31, 0, 31, 0, 0],
  '*': [0, 4, 21, 14, 21, 4, 0], '#': [10, 10, 31, 10, 31, 10, 10],
  '@': [14, 17, 23, 21, 22, 16, 14], '°': [14, 17, 17, 14, 0, 0, 0],
  '•': [0, 0, 14, 17, 17, 14, 0], '~': [0, 0, 10, 21, 0, 0, 0],
  '[': [14, 8, 8, 8, 8, 8, 14], ']': [14, 2, 2, 2, 2, 2, 14],
  '_': [0, 0, 0, 0, 0, 0, 31], '<': [2, 4, 8, 16, 8, 4, 2],
  '>': [8, 4, 2, 1, 2, 4, 8], '\\': [16, 16, 8, 4, 2, 1, 1],
  '|': [4, 4, 4, 4, 4, 4, 4],
};
const NORM = { '’': "'", '‘': "'", '“': '"', '”': '"', '−': '-', '–': '-', '—': '-', '…': '...', '≈': '~' };
function norm(s) { return s.split('').map(ch => NORM[ch] ?? ch).join(''); }
function textW(s, scale, tr = 0) { return norm(s).length * (6 * scale + tr) - tr; }
function drawText(s, x, y, scale, c, o = {}) {
  const str = norm(s), tr = o.tracking ?? 0, bold = !!o.bold;
  let cx = x;
  if (o.align === 'center') cx = x - textW(str, scale, tr) / 2;
  if (o.align === 'right') cx = x - textW(str, scale, tr);
  const u = Math.max(1, Math.round(scale * SS)); // buffer px per font pixel — MUST be integer
  for (const ch of str) {
    const g = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) for (let col = 0; col < 5; col++) {
      if (g[r] & (16 >> col)) {
        const px = X(cx) + col * u, py = X(y) + r * u;
        for (let yy = py; yy < py + u; yy++) for (let xx = px; xx < px + u; xx++) setPx(xx, yy, c);
        if (bold) for (let yy = py; yy < py + u; yy++) for (let xx = px + SS; xx < px + SS + u; xx++) setPx(xx, yy, c);
      }
    }
    cx += 6 * scale + tr;
  }
}

// ---------- PNG encode ----------
const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    for (let x = 0; x < W; x++) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < SS; dy++) for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * SW + x * SS + dx) * 3; r += fb[i]; g += fb[i + 1]; b += fb[i + 2];
      }
      const o = y * (1 + W * 3) + 1 + x * 3;
      raw[o] = (r / 4) | 0; raw[o + 1] = (g / 4) | 0; raw[o + 2] = (b / 4) | 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- helpers ----------
const WHITE = hex('#ffffff'), CREAM2 = hex('#efe6cf');
function panel(x, y, w, h, border = INK, bw = 2) {
  fillRect(x, y, w, h, PAPER);
  fillRect(x, y, w, bw, border); fillRect(x, y + h - bw, w, bw, border);
  fillRect(x, y, bw, h, border); fillRect(x + w - bw, y, bw, h, border);
}
function vband(x, y, w, h, cTop, cBot, n = 8) {
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const c = [0, 1, 2].map(k => Math.round(cTop[k] + (cBot[k] - cTop[k]) * t));
    fillRect(x, y + h * i / n, w, h / n + 1, c);
  }
}
function flame(cx, baseY, w, h, c1, c2) {
  // teardrop flame: outer + inner
  poly([[cx - w / 2, baseY], [cx - w * 0.42, baseY - h * 0.55], [cx - w * 0.12, baseY - h * 0.8], [cx, baseY - h], [cx + w * 0.14, baseY - h * 0.72], [cx + w * 0.4, baseY - h * 0.5], [cx + w / 2, baseY]], c1);
  poly([[cx - w * 0.26, baseY], [cx - w * 0.2, baseY - h * 0.4], [cx, baseY - h * 0.62], [cx + w * 0.2, baseY - h * 0.38], [cx + w * 0.26, baseY]], c2);
}
function smokePuff(cx, cy, r, c) { circle(cx, cy, r, c); circle(cx - r * 0.5, cy + r * 0.25, r * 0.72, c); circle(cx + r * 0.5, cy + r * 0.2, r * 0.75, c); }
function pine(cx, baseY, h, c) {
  poly([[cx - h * 0.32, baseY], [cx, baseY - h], [cx + h * 0.32, baseY]], c);
  poly([[cx - h * 0.26, baseY - h * 0.32], [cx, baseY - h * 1.18], [cx + h * 0.26, baseY - h * 0.32]], c);
  fillRect(cx - 2, baseY - 4, 4, 6, hex('#5a3d22'));
}

// ================= COMPOSITION =================
fillRect(0, 0, W, H, PAPER);
// outer frame
fillRect(8, 8, W - 16, 3, INK); fillRect(8, H - 11, W - 16, 3, INK);
fillRect(8, 8, 3, H - 16, INK); fillRect(W - 11, 8, 3, H - 16, INK);

// ---------- MASTHEAD ----------
drawText('THE WORLD', 512, 18, 9, INK, { align: 'center', bold: true });
hline(120, 200, 96, 2, INK); hline(824, 904, 96, 2, INK);
drawText('IN ONE IMAGE — SATURDAY, 21 NOVEMBER 2026', 512, 92, 2.4, INK, { align: 'center', bold: true });
hline(24, 1000, 116, 2, INK); hline(24, 1000, 120, 1, INK);

// ---------- HEADLINE ----------
drawText('COP31 TALKS RUN INTO OVERTIME', 512, 128, 5, INK, { align: 'center', bold: true });
drawText('ANTALYA DRAFT DROPS FOSSIL-FUEL MENTIONS AND $120BN-A-YEAR', 512, 168, 2.2, SOFT, { align: 'center', bold: true });
drawText('ADAPTATION FUNDS — NEARLY 200 NATIONS AWAIT A NEW TEXT SATURDAY', 512, 186, 2.2, SOFT, { align: 'center', bold: true });

// ---------- MAIN SCENE: COP31 hall ----------
panel(24, 204, 976, 408, INK, 2);
// wall
fillRect(26, 206, 972, 404, WALL);
// COP31 plaque, left wall
fillRect(46, 222, 150, 52, INK);
drawText('COP31', 121, 230, 2.6, WHITE, { align: 'center', bold: true });
drawText('ANTALYA', 121, 254, 1.8, GOLD, { align: 'center', bold: true });
// OVERTIME badge, right wall — fully inside the panel
fillRect(756, 216, 224, 34, RED);
drawText('OVERTIME', 868, 224, 2.6, WHITE, { align: 'center', bold: true });

// arched window: glass + sun + rays, then mullions, then one continuous frame stroke
const WX0 = 320, WX1 = 704, WSPR = 400, WR = 192, WCX = 512;
// glass bands (clipped by drawing inside the arch bounding box, frame covers edges)
vband(WX0, 208, WX1 - WX0, WSPR - 208 + 160, SKYT, SKYB, 10);
fillRect(WX0, WSPR, WX1 - WX0, 160, hex('#e9cf9a'));
// mask the sky out of the arch's top corners — wall shows there, not sky
const leftArc = []; // y-down: 3PI/2 = arch top, PI = left spring — trace top -> left
for (let a = Math.PI * 1.5; a >= Math.PI; a -= 0.05) leftArc.push([WCX + WR * Math.cos(a), WSPR + WR * Math.sin(a)]);
poly([[WX0, 208], [WCX, 208], ...leftArc], WALL);
const rightArc = []; // 0 = right spring, -PI/2 = arch top — trace right -> top
for (let a = 0; a >= -Math.PI / 2; a -= 0.05) rightArc.push([WCX + WR * Math.cos(a), WSPR + WR * Math.sin(a)]);
poly([[WCX, 208], [WX1, 208], [WX1, WSPR], ...rightArc], WALL);
// sun — whole, clear of every delegate head, between the mullions at 512 and 608
const SUN = { x: 560, y: 285, r: 30 };
for (let i = 0; i < 12; i++) { // rays first: they sit BEHIND the mullions
  const a = i * Math.PI / 6, w2 = 0.055, L = 36;
  poly([[SUN.x + (SUN.r + 4) * Math.cos(a - w2), SUN.y + (SUN.r + 4) * Math.sin(a - w2)],
        [SUN.x + (SUN.r + L) * Math.cos(a), SUN.y + (SUN.r + L) * Math.sin(a)],
        [SUN.x + (SUN.r + 4) * Math.cos(a + w2), SUN.y + (SUN.r + 4) * Math.sin(a + w2)]], hex('#e8b23a'));
}
circle(SUN.x, SUN.y, SUN.r, hex('#f2c14e'));
ring(SUN.x, SUN.y, SUN.r, 3, hex('#d9a441'));
// mullions over the rays — verticals start on the arch curve, never above it
vline(416, 234, 560, 8, BRONZE); vline(512, 208, 560, 8, BRONZE); vline(608, 234, 560, 8, BRONZE);
hline(WX0, WX1, WSPR, 8, BRONZE);
// ONE continuous smooth arch frame stroke (sides + semicircle), never dotted
line(WX0, 560, WX0, WSPR, 6, BRONZE);
line(WX1, 560, WX1, WSPR, 6, BRONZE);
arcStroke(WCX, WSPR, WR, Math.PI, Math.PI * 2, 6, BRONZE); // y-down: PI..2PI is the TOP semicircle
hline(WX0, WX1, 560, 6, BRONZE);
// wall panel lines beside the window
vline(120, 220, 560, 2, hex('#cbb98f')); vline(904, 220, 560, 2, hex('#cbb98f'));

// ---- five delegates, torsos visible, seated behind the table (table top y=600) ----
const DEL = [
  { x: 150, skin: hex('#e8b98d'), hair: hex('#3a2e22'), suit: hex('#27406b'), style: 'side' },
  { x: 300, skin: hex('#d9a06f'), hair: hex('#8a8a8a'), suit: hex('#3c3c40'), style: 'grey' },
  { x: 512, skin: hex('#c98d5f'), hair: hex('#1a1a1a'), suit: hex('#1d4e89'), style: 'bald' },
  { x: 700, skin: hex('#eec39f'), hair: hex('#c9a227'), suit: hex('#5a2e35'), style: 'blonde' },
  { x: 850, skin: hex('#b97f52'), hair: hex('#241a12'), suit: hex('#33502e'), style: 'curly' },
];
for (const d of DEL) {
  // torso (trapezoid, shoulders to table)
  poly([[d.x - 58, 600], [d.x - 52, 512], [d.x - 38, 490], [d.x + 38, 490], [d.x + 52, 512], [d.x + 58, 600]], d.suit);
  // shirt V + tie (centre delegate)
  poly([[d.x - 14, 492], [d.x + 14, 492], [d.x, 548]], WHITE);
  if (d.x === 512) poly([[d.x - 5, 500], [d.x + 5, 500], [d.x + 4, 556], [d.x, 564], [d.x - 4, 556]], RED);
  // lapels
  line(d.x - 14, 492, d.x - 34, 540, 3, hex('#00000022'.slice(0, 7)));
  // neck + head
  fillRect(d.x - 9, 478, 18, 16, d.skin);
  circle(d.x, 448, 33, d.skin);
  // hair
  if (d.style === 'side') { arcStroke(d.x, 446, 33, Math.PI * 1.05, Math.PI * 1.95, 12, d.hair); fillRect(d.x - 33, 420, 20, 10, d.hair); }
  if (d.style === 'grey') { arcStroke(d.x, 446, 33, Math.PI, Math.PI * 2, 10, d.hair); }
  if (d.style === 'bald') { arcStroke(d.x, 444, 32, Math.PI * 1.15, Math.PI * 1.85, 5, hex('#888888')); }
  if (d.style === 'blonde') { arcStroke(d.x, 446, 33, Math.PI * 1.02, Math.PI * 1.98, 11, d.hair); }
  if (d.style === 'curly') { for (let i = 0; i < 5; i++) circle(d.x - 24 + i * 12, 424 + (i % 2) * 4, 9, d.hair); }
  // face — natural small eyes (dark slits, no big white sclera, no googly pupils)
  line(d.x - 17, 438, d.x - 7, 438, 2, hex('#2a2018'));
  line(d.x + 7, 438, d.x + 17, 438, 2, hex('#2a2018'));
  ellipse(d.x - 12, 444, 3, 1.6, hex('#241a12'));
  ellipse(d.x + 12, 444, 3, 1.6, hex('#241a12'));
  line(d.x, 448, d.x - 1, 456, 2, hex('#a97a52'));
  line(d.x - 6, 464, d.x + 6, 464, 2, hex('#7a4a34'));
}
// microphones between delegates
for (const mx of [225, 412, 612, 776]) { line(mx, 600, mx, 552, 3, INK); circle(mx, 549, 5, INK); }
// water glasses
for (const gx of [120, 250, 660]) { fillRect(gx, 576, 14, 22, hex('#cfe0ea')); fillRect(gx, 576, 14, 3, WHITE); }

// ---- DRAFT paper on the table, in front of the centre delegate ----
// (a) roomy paper: clear space between DRAFT and the struck "fossil fuels" line
fillRect(440, 500, 156, 100, hex('#00000033'));
fillRect(436, 496, 156, 100, WHITE);
fillRect(436, 496, 156, 2, INK); fillRect(436, 594, 156, 2, INK);
fillRect(436, 496, 2, 100, INK); fillRect(590, 496, 2, 100, INK);
drawText('DRAFT', 514, 502, 3, RED, { align: 'center', bold: true });
hline(452, 576, 530, 2, INK);
drawText('fossil fuels', 514, 544, 2, INK, { align: 'center', bold: true });
line(444, 551, 584, 551, 3, RED); // one clean strike, not a scribble
drawText('adaptation', 514, 566, 1.7, INK, { align: 'center', bold: true });
line(461, 572, 567, 572, 3, RED);
drawText('$120bn/yr', 514, 582, 1.7, INK, { align: 'center', bold: true });
line(466, 588, 562, 588, 3, RED);
// globe on the main table, far right — clear of delegate 5
circle(945, 560, 26, hex('#3a6ea8'));
ellipse(936, 554, 8, 5, GREEN); ellipse(954, 570, 9, 5, GREEN); ellipse(948, 548, 5, 3, GREEN);
ring(945, 560, 26, 2, hex('#2a4a6b'));
line(945, 586, 945, 592, 3, hex('#2a4a6b')); fillRect(932, 592, 26, 5, hex('#2a4a6b'));
// carafe, far left of the table
poly([[66, 598], [70, 566], [82, 566], [86, 598]], hex('#cfe0ea'));
fillRect(72, 560, 8, 7, hex('#cfe0ea'));
// table top line y=600 + front face
hline(26, 998, 600, 4, WOOD);
fillRect(26, 600, 972, 12, WOOD2);
hline(26, 998, 600, 2, hex('#5a3a1e'));

// ---------- THUMBNAILS ----------
function thumbTitle(x, y, w, txt) {
  fillRect(x, y, w, 26, INK);
  drawText(txt, x + 10, y + 6, 2.4, WHITE, { bold: true });
}
// KYIV — left
panel(24, 622, 476, 178, INK, 2);
thumbTitle(24, 622, 476, 'KYIV UNDER FIRE');
vband(26, 648, 472, 100, hex('#2e2a4a'), hex('#d97a3d'), 8);
fillRect(26, 726, 472, 22, hex('#274b63')); // Dnipro
hline(40, 480, 734, 2, hex('#7fa3c0')); hline(60, 460, 742, 2, hex('#7fa3c0'));
// golden dome on the left bank — clear of the fire at x 97-143
circle(80, 700, 11, GOLD); poly([[69, 700], [80, 685], [91, 700]], GOLD);
fillRect(72, 700, 16, 16, hex('#e8e0cc'));
// bridge: shallow V deck, banks high, centre pier low
line(40, 712, 262, 738, 6, hex('#20242c'));
line(484, 712, 262, 738, 6, hex('#20242c'));
line(262, 738, 262, 748, 5, hex('#20242c'));
// leaning pylon (right span), cables to the deck
line(350, 712, 392, 656, 5, hex('#20242c'));
line(392, 656, 330, 718, 1.5, hex('#5a6068'));
line(392, 656, 420, 712, 1.5, hex('#5a6068'));
line(392, 656, 470, 712, 1.5, hex('#5a6068'));
// big fires: left bank + centre pier, fully visible
circle(120, 712, 26, hex('#ff9a2a55'.slice(0, 7)));
flame(120, 716, 46, 44, hex('#e85d04'), hex('#ffd23e'));
flame(262, 738, 34, 30, hex('#e85d04'), hex('#ffd23e'));
// anchored smoke: column rising from the left fire, kept BELOW the title bar (top edge y=652)
smokePuff(120, 700, 12, hex('#8a8a92'));
smokePuff(112, 684, 15, hex('#9a9aa2'));
smokePuff(124, 668, 16, hex('#a8a8b0'));
smokePuff(262, 712, 11, hex('#8a8a92'));
// thick missile-trail smoke across the upper sky (wavy, not a flat bar)
line(60, 672, 200, 658, 9, hex('#c9c9cf'));
line(200, 658, 330, 670, 9, hex('#c9c9cf'));
line(330, 670, 452, 656, 9, hex('#c9c9cf'));
poly([[438, 652], [466, 650], [472, 658], [444, 662]], hex('#3a3f46')); // missile silhouette
drawText('84 MISSILES, 404 DRONES', 262, 752, 1.8, INK, { align: 'center', bold: true });
drawText('3 DNIPRO BRIDGES HIT', 262, 767, 1.8, INK, { align: 'center', bold: true });
drawText('POWER, HEAT, WATER CUT', 262, 782, 1.8, INK, { align: 'center', bold: true });

// POLAND — right
panel(524, 622, 476, 178, INK, 2);
thumbTitle(524, 622, 476, 'MISSILE DOWN IN POLAND');
vband(526, 648, 472, 60, hex('#a8c8e0'), hex('#e8e2c8'), 5);
fillRect(526, 708, 472, 40, hex('#5a8a3c')); // field
fillRect(526, 708, 472, 6, hex('#6da344'));
for (let i = 0; i < 6; i++) line(540 + i * 76, 748, 560 + i * 76, 712, 2, hex('#4a7a30'));
// farmhouse
fillRect(640, 690, 100, 34, hex('#f2ead8'));
poly([[632, 692], [690, 664], [748, 692]], hex('#a83a28'));
fillRect(676, 700, 14, 24, hex('#5a3a22'));
fillRect(712, 700, 12, 12, hex('#7fb2d9'));
// pines (right edge, clear of the flag)
pine(962, 724, 32, hex('#1e4d24')); pine(986, 724, 36, hex('#27592c'));
// flag pole + Polish flag, far right — clear of the title text, clearly ABOVE the roof peak (roof peak y=664, flag bottom y=660)
line(900, 724, 900, 632, 3, hex('#5a4a30'));
fillRect(900, 636, 46, 12, WHITE); fillRect(900, 648, 46, 12, hex('#dc143c'));
// crater in the foreground field
ellipse(830, 736, 34, 10, hex('#2a2018'));
ellipse(830, 734, 26, 7, hex('#4a3423'));
// missile descending in the sky + loose, spaced smoke puffs (shifted left, clear of the flag pole)
poly([[840, 646], [870, 658], [864, 666], [834, 654]], hex('#3a3f46'));
poly([[870, 658], [880, 654], [878, 664], [868, 664]], hex('#3a3f46'));
circle(818, 656, 8, hex('#c9c9cf')); circle(794, 664, 7, hex('#c9c9cf')); circle(772, 672, 6, hex('#c9c9cf'));
drawText("KH-101 DOWN IN NOWY LIPOWIEC", 762, 752, 1.8, INK, { align: 'center', bold: true });
drawText("NATO: 'GRAVE VIOLATION';", 762, 767, 1.8, INK, { align: 'center', bold: true });
drawText('NO CASUALTIES', 762, 782, 1.8, INK, { align: 'center', bold: true });

// ---------- MARKET STRIP ----------
panel(24, 808, 976, 64, INK, 2);
drawText('AI SELL-OFF', 40, 818, 3, RED, { bold: true });
drawText('HITS WALL STREET', 40, 846, 2, INK, { bold: true });
// falling chart, middle — kept clear of the numbers at right
const CH = [[380, 822], [420, 830], [450, 826], [490, 842], [530, 838], [570, 856], [610, 852], [640, 864]];
poly([...CH, [640, 866], [380, 866]], hex('#e8b4ac'));
for (let i = 0; i + 1 < CH.length; i++) line(CH[i][0], CH[i][1], CH[i + 1][0], CH[i + 1][1], 3, RED);
hline(380, 640, 866, 2, INK); vline(380, 818, 866, 2, INK);
drawText('S&P 500  -3.7%', 680, 818, 2.4, INK, { bold: true });
drawText('NASDAQ  -5.3%', 680, 838, 2.4, INK, { bold: true });
drawText('NVIDIA  -14%', 680, 858, 2.4, RED, { bold: true });

// ---------- FOOTER: IN BRIEF ----------
drawText('IN BRIEF', 24, 886, 3, INK, { bold: true });
hline(150, 1000, 898, 2, INK);
const BRIEFS = [
  ['CYCLONE AKVAN:', '370,000 FLED ODISHA;', 'NO DEATHS REPORTED'],
  ['WORLD COURT', 'ACTS AFTER', 'MYANMAR RULING'],
  ['FRANCE SEEKS UN', 'SECURITY COUNCIL', 'MEETING ON KYIV'],
  ['ESTONIA TO SHUT', 'RUSSIA BORDER', 'FROM 1 DECEMBER'],
];
BRIEFS.forEach((lines, i) => {
  const bx = 24 + i * 246;
  fillRect(bx, 926, 8, 8, RED);
  lines.forEach((ln, j) => drawText(ln, bx + 16, 922 + j * 18, 1.9, INK, { bold: true }));
});

// ---------- write ----------
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), encodePNG());
console.log('wrote entry.png');
