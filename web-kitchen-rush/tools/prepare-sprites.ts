/**
 * Turns cut-out PNGs into game-ready sprites and prints their slot sizes for src/management/iso/sprites.ts.
 *
 *   bun tools/prepare-sprites.ts <in-dir> <out-dir> <art-width> <name1,name2,...>
 *
 * <art-width> is how wide the widest solid object in the group should be, in art pixels (one floor tile
 * is 64 wide). The whole group shares one scale, so tiers of the same item keep their relative size.
 * Soft glows don't count toward the width. Images are stored at 3× art size as WebP.
 */
import sharp from 'sharp';
import { join } from 'node:path';

const [inDir, outDir, artWidth, nameList] = process.argv.slice(2);
if (!inDir || !outDir || !Number(artWidth) || !nameList) { console.error('Usage: bun tools/prepare-sprites.ts <in-dir> <out-dir> <art-width> <name1,name2,...>'); process.exit(1); }
const STORE = 3, names = nameList.split(',').map(n => n.trim()).filter(Boolean);

const measured = await Promise.all(names.map(async name => {
  const { data, info } = await sharp(join(inDir, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, right = 0, bottom = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 200) { left = Math.min(left, x); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  return { name, width: info.width, height: info.height, left, right, bottom };
}));
const scale = Number(artWidth) / Math.max(...measured.map(m => m.right - m.left + 1));
const round = (n: number) => Math.round(n * 10) / 10;
for (const m of measured) {
  const w = m.width * scale, h = m.height * scale;
  await sharp(join(inDir, `${m.name}.png`)).resize(Math.round(w * STORE)).webp({ quality: 90, alphaQuality: 100 }).toFile(join(outDir, `${m.name}.webp`));
  // Anchor: horizontally centred on the solid body; vertically a little above its lowest solid pixel,
  // which is the middle of the object's base on the floor.
  console.log(`${m.name}: { w: ${round(w)}, h: ${round(h)}, ax: ${round((m.left + m.right) / 2 * scale)}, ay: ${round(m.bottom * scale - 3)} }`);
}
