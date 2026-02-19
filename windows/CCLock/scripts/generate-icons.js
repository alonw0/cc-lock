#!/usr/bin/env node
// Generates tray icons as 32x32 PNG files using only Node.js built-ins.
// Each icon is rendered from an SVG path rasterised manually into a pixel buffer.
// Run: node scripts/generate-icons.js

"use strict";

const { deflateSync } = require("zlib");
const { writeFileSync, mkdirSync } = require("fs");
const { join } = require("path");

// ── PNG encoder ───────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length);
  const payload = Buffer.concat([typeBytes, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(payload));
  return Buffer.concat([lenBuf, payload, crcBuf]);
}

/** Encode an RGBA pixel buffer (Uint8Array, row-major, size×size×4) as PNG. */
function encodePNG(pixels, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type: RGBA
  // compression/filter/interlace = 0

  // Build raw rows: [filter=0] + [R,G,B,A] * size
  const rowSize = 1 + size * 4;
  const raw = Buffer.alloc(size * rowSize);
  for (let y = 0; y < size; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = y * rowSize + 1 + x * 4;
      raw[dst]     = pixels[src];     // R
      raw[dst + 1] = pixels[src + 1]; // G
      raw[dst + 2] = pixels[src + 2]; // B
      raw[dst + 3] = pixels[src + 3]; // A
    }
  }

  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Software rasteriser ───────────────────────────────────────────────────────

const SIZE = 32;

function newCanvas() {
  return new Uint8Array(SIZE * SIZE * 4); // all transparent
}

function setPixel(pixels, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  // Alpha-composite over existing pixel
  const srcA = a / 255;
  const dstA = pixels[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  pixels[i]     = Math.round((r * srcA + pixels[i]     * dstA * (1 - srcA)) / outA);
  pixels[i + 1] = Math.round((g * srcA + pixels[i + 1] * dstA * (1 - srcA)) / outA);
  pixels[i + 2] = Math.round((b * srcA + pixels[i + 2] * dstA * (1 - srcA)) / outA);
  pixels[i + 3] = Math.round(outA * 255);
}

/** Filled circle with anti-aliased edge. */
function fillCircle(pixels, cx, cy, r, R, G, B, A = 255) {
  for (let y = Math.floor(cy - r) - 1; y <= Math.ceil(cy + r) + 1; y++) {
    for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r) + 1; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const alpha = Math.max(0, Math.min(1, r + 0.5 - dist));
      if (alpha > 0) setPixel(pixels, x, y, R, G, B, Math.round(A * alpha));
    }
  }
}

/** Filled axis-aligned rectangle. */
function fillRect(pixels, x0, y0, x1, y1, R, G, B, A = 255) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      setPixel(pixels, x, y, R, G, B, A);
}

/** Stroke a path of [x,y] segments with thickness and AA. */
function strokePath(pixels, points, thick, R, G, B, A = 255) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len; // normal
    const steps = Math.ceil(len * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const mx = x0 + dx * t, my = y0 + dy * t;
      // Sample a disc of radius thick/2 along the midpoint
      const hr = thick / 2;
      for (let oy = -Math.ceil(hr) - 1; oy <= Math.ceil(hr) + 1; oy++) {
        for (let ox = -Math.ceil(hr) - 1; ox <= Math.ceil(hr) + 1; ox++) {
          const dist = Math.sqrt(ox * ox + oy * oy);
          const alpha = Math.max(0, Math.min(1, hr + 0.5 - dist));
          if (alpha > 0)
            setPixel(pixels, Math.round(mx + ox), Math.round(my + oy), R, G, B, Math.round(A * alpha));
        }
      }
    }
  }
}

/** Filled polygon (convex) via scanline. */
function fillPolygon(pixels, pts, R, G, B, A = 255) {
  const minY = Math.floor(Math.min(...pts.map((p) => p[1])));
  const maxY = Math.ceil(Math.max(...pts.map((p) => p[1])));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) {
        xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k < xs.length - 1; k += 2) {
      for (let x = Math.round(xs[k]); x <= Math.round(xs[k + 1]); x++) {
        setPixel(pixels, x, y, R, G, B, A);
      }
    }
  }
}

/** Arc helper — returns array of [x,y] points along an ellipse arc. */
function arcPoints(cx, cy, rx, ry, startDeg, endDeg, steps = 32) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const angle = ((startDeg + (endDeg - startDeg) * (i / steps)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)]);
  }
  return pts;
}

// ── Icon drawers ──────────────────────────────────────────────────────────────

/**
 * Padlock body + shackle. open=true draws an open shackle.
 * Colors: body fill, shackle stroke.
 */
function drawPadlock(pixels, open, bodyR, bodyG, bodyB, shackleR, shackleG, shackleB) {
  // Body: rounded rectangle, centre of canvas
  const bx0 = 8, bx1 = 23, by0 = 16, by1 = 28;
  const cr = 2; // corner radius
  fillRect(pixels, bx0 + cr, by0, bx1 - cr, by1, bodyR, bodyG, bodyB);
  fillRect(pixels, bx0, by0 + cr, bx1, by1 - cr, bodyR, bodyG, bodyB);
  fillCircle(pixels, bx0 + cr, by0 + cr, cr, bodyR, bodyG, bodyB);
  fillCircle(pixels, bx1 - cr, by0 + cr, cr, bodyR, bodyG, bodyB);
  fillCircle(pixels, bx0 + cr, by1 - cr, cr, bodyR, bodyG, bodyB);
  fillCircle(pixels, bx1 - cr, by1 - cr, cr, bodyR, bodyG, bodyB);

  // Keyhole: small circle + rectangle cutout (darker shade)
  const [kR, kG, kB] = darken(bodyR, bodyG, bodyB, 0.45);
  fillCircle(pixels, 15.5, 21, 2, kR, kG, kB);
  fillRect(pixels, 14, 22, 16, 25, kR, kG, kB);

  // Shackle (arch)
  const thick = 3;
  if (open) {
    // Open: right side lifted, left side in body slot
    strokePath(pixels,
      [[9, 17], [9, 11], ...arcPoints(15.5, 11, 6.5, 6.5, 180, 270)],
      thick, shackleR, shackleG, shackleB);
  } else {
    // Closed: symmetric arch sitting in body
    strokePath(pixels,
      [[9, 17], [9, 11], ...arcPoints(15.5, 11, 6.5, 6.5, 180, 360), [22, 11], [22, 17]],
      thick, shackleR, shackleG, shackleB);
  }
}

function darken(r, g, b, factor) {
  return [Math.round(r * factor), Math.round(g * factor), Math.round(b * factor)];
}

/** Grace icon: padlock with a shield outline overlay. */
function drawGrace(pixels) {
  // Draw a closed padlock in yellow, smaller
  drawPadlock(pixels, false, 234, 179, 8, 180, 130, 5);

  // Shield outline in gold over the padlock (bottom-right quadrant)
  strokePath(pixels, [
    [20, 14], [27, 14], [27, 22], [23.5, 28], [20, 22], [20, 14],
  ], 1.5, 200, 150, 10);
}

/** Disconnected icon: gray circle with a diagonal slash. */
function drawDisconnected(pixels) {
  const cx = 15.5, cy = 15.5, r = 12;
  const [fR, fG, fB] = [156, 163, 175]; // gray-400

  // Circle outline
  strokePath(pixels, arcPoints(cx, cy, r, r, 0, 360, 64), 2.5, fR, fG, fB);

  // Slash (top-right to bottom-left)
  strokePath(pixels, [[22.5, 6.5], [8.5, 24.5]], 2.5, fR, fG, fB);
}

// ── Assemble icons ────────────────────────────────────────────────────────────

function makeUnlocked() {
  const p = newCanvas();
  drawPadlock(p, true, 34, 197, 94, 22, 160, 80);   // green
  return p;
}

function makeLocked() {
  const p = newCanvas();
  drawPadlock(p, false, 239, 68, 68, 185, 40, 40);   // red
  return p;
}

function makeGrace() {
  const p = newCanvas();
  drawGrace(p);                                        // yellow
  return p;
}

function makeDisconnected() {
  const p = newCanvas();
  drawDisconnected(p);                                 // gray
  return p;
}

// ── Write files ───────────────────────────────────────────────────────────────

const assetsDir = join(__dirname, "..", "assets");
mkdirSync(assetsDir, { recursive: true });

const icons = [
  { name: "icon-unlocked.png",     pixels: makeUnlocked() },
  { name: "icon-locked.png",       pixels: makeLocked() },
  { name: "icon-grace.png",        pixels: makeGrace() },
  { name: "icon-disconnected.png", pixels: makeDisconnected() },
];

for (const { name, pixels } of icons) {
  const png = encodePNG(pixels, SIZE);
  writeFileSync(join(assetsDir, name), png);
  console.log(`  created ${name}`);
}

console.log("\nIcons written to assets/");
