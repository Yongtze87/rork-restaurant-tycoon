/**
 * Cuts a generated sprite sheet (objects on a flat chroma-key background) into separate transparent PNGs.
 *
 *   bun tools/slice-sheet.ts <sheet.jpg|png> <out-dir> <name1,name2,...>
 *
 * Objects are found by their outline, so they only need clear gaps between them, not an exact grid.
 * They are named in reading order: top row first, left to right. Tiny marks (such as a generator's
 * corner logo) are ignored. A preview of every piece on a checkerboard is written to <out-dir>/_preview.png.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const [sheetPath, outDir, nameList] = process.argv.slice(2);
if (!sheetPath || !outDir || !nameList) { console.error('Usage: bun tools/slice-sheet.ts <sheet> <out-dir> <name1,name2,...>'); process.exit(1); }
const names = nameList.split(',').map(n => n.trim()).filter(Boolean);

const { data, info } = await sharp(sheetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info, px = W * H;

// Key colour: the median of the border pixels, which are always background on a valid sheet.
const border: number[][] = [];
for (let x = 0; x < W; x += 4) border.push(rgb(x, 0), rgb(x, H - 1));
for (let y = 0; y < H; y += 4) border.push(rgb(0, y), rgb(W - 1, y));
const key = [0, 1, 2].map(c => border.map(p => p[c]).sort((a, b) => a - b)[border.length >> 1]);
// "Spill" measures how strongly a pixel leans toward the key colour: high on background, low on art.
const keyHigh = key.map(v => v > 128), mode = keyHigh.join();
const spill = (r: number, g: number, b: number): number => {
  const c = [r, g, b], hi = c.filter((_, i) => keyHigh[i]), lo = c.filter((_, i) => !keyHigh[i]);
  return Math.min(...hi) - Math.max(...lo);
};
if (!['false,true,false', 'true,false,true', 'false,false,true'].includes(mode)) { console.error(`Background ${key} is not pure green, magenta or blue.`); process.exit(1); }
const backgroundSpill = spill(key[0], key[1], key[2]);
const OPAQUE = 70, CLEAR = Math.max(OPAQUE + 40, backgroundSpill - 45);

const out = Buffer.from(data);
for (let i = 0; i < px; i++) {
  const o = i * 4, r = data[o], g = data[o + 1], b = data[o + 2], s = spill(r, g, b);
  const alpha = Math.max(0, Math.min(1, (CLEAR - s) / (CLEAR - OPAQUE)));
  out[o + 3] = Math.round(alpha * 255);
  if (s > 0) { // remove the key colour's tint from edges and glows
    const c = [r, g, b], floor = Math.max(...c.filter((_, k) => !keyHigh[k])), cap = Math.min(...c.filter((_, k) => keyHigh[k]));
    for (let k = 0; k < 3; k++) if (keyHigh[k]) out[o + k] = Math.min(c[k], floor + (c[k] - cap));
  }
}

// Label solid regions on a 4× smaller grid, then measure each region at full size.
const S = 4, gw = Math.ceil(W / S), gh = Math.ceil(H / S), solid = new Uint8Array(gw * gh), label = new Int32Array(gw * gh);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (out[(y * W + x) * 4 + 3] > 128) solid[Math.floor(y / S) * gw + Math.floor(x / S)] = 1;
const regions: { x0: number; y0: number; x1: number; y1: number; area: number }[] = [];
for (let start = 0; start < solid.length; start++) {
  if (!solid[start] || label[start]) continue;
  const id = regions.length + 1, stack = [start], r = { x0: gw, y0: gh, x1: 0, y1: 0, area: 0 }; label[start] = id;
  while (stack.length) {
    const cell = stack.pop()!, cx = cell % gw, cy = (cell - cx) / gw;
    r.area++; r.x0 = Math.min(r.x0, cx); r.x1 = Math.max(r.x1, cx); r.y0 = Math.min(r.y0, cy); r.y1 = Math.max(r.y1, cy);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, n = ny * gw + nx;
      if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && solid[n] && !label[n]) { label[n] = id; stack.push(n); }
    }
  }
  regions.push(r);
}
const minArea = solid.length * .004;
const pieces = regions.filter(r => r.area >= minArea).map(r => ({ x0: r.x0 * S, y0: r.y0 * S, x1: Math.min(W, (r.x1 + 1) * S), y1: Math.min(H, (r.y1 + 1) * S) }));
// Reading order: a piece starts a new row when it begins below the middle of the current row.
pieces.sort((a, b) => a.y0 - b.y0);
const rows: typeof pieces[] = [];
for (const p of pieces) { const row = rows[rows.length - 1]; if (row && p.y0 < (row[0].y0 + row[0].y1) / 2) row.push(p); else rows.push([p]); }
const ordered = rows.flatMap(row => row.sort((a, b) => a.x0 - b.x0));
if (ordered.length !== names.length) { console.error(`Found ${ordered.length} objects but ${names.length} names were given. Objects may be touching, or a name is missing.`); process.exit(1); }

mkdirSync(outDir, { recursive: true });
const PAD = 40, cut: { name: string; file: string; width: number; height: number }[] = [];
for (const [i, p] of ordered.entries()) {
  // Widen the box so soft glows survive, then trim to everything that is even slightly visible.
  const left = Math.max(0, p.x0 - PAD), top = Math.max(0, p.y0 - PAD), w = Math.min(W, p.x1 + PAD) - left, h = Math.min(H, p.y1 + PAD) - top;
  const piece = await sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract({ left, top, width: w, height: h }).png().toBuffer();
  const file = join(outDir, `${names[i]}.png`);
  const result = await sharp(piece).trim({ threshold: 4 }).png({ compressionLevel: 9, palette: false }).toFile(file);
  cut.push({ name: names[i], file, width: result.width, height: result.height });
}

// Preview: every piece on a checkerboard, with its name, so transparency problems are easy to spot.
const cellW = Math.max(...cut.map(c => c.width)) + 40, cellH = Math.max(...cut.map(c => c.height)) + 80;
const sheetW = cellW * cut.length, check = `<pattern id="c" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#d9d4ec"/><rect width="16" height="16" fill="#f4f2fb"/><rect x="16" y="16" width="16" height="16" fill="#f4f2fb"/></pattern>`;
const labels = cut.map((c, i) => `<text x="${i * cellW + cellW / 2}" y="${cellH - 24}" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#120F2E">${c.name} · ${c.width}×${c.height}</text>`).join('');
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${cellH}"><defs>${check}</defs><rect width="100%" height="100%" fill="url(#c)"/>${labels}</svg>`))
  .composite(cut.map((c, i) => ({ input: c.file, left: Math.round(i * cellW + (cellW - c.width) / 2), top: 20 })))
  .png().toFile(join(outDir, '_preview.png'));
console.log(JSON.stringify(cut.map(({ name, width, height }) => ({ name, width, height }))));

function rgb(x: number, y: number): number[] { const o = (y * W + x) * 4; return [data[o], data[o + 1], data[o + 2]]; }
