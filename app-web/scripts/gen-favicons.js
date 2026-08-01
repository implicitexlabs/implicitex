/**
 * gen-favicons.js — Favicon generator
 *
 * Renders the ImplicitEx brandmark at all required icon sizes
 * and writes them to frontend/public/assets/icons/.
 *
 * Outputs:
 *   favicon.ico          (multi-size: 16, 32)
 *   favicon-16x16.png
 *   favicon-32x32.png
 *   apple-touch-icon.png (180×180)
 *   icon-192.png
 *   icon-512.png
 *
 * Usage:
 *   node scripts/gen-favicons.js
 */

'use strict';

const sharp     = require('sharp');
const pngToIco = require('png-to-ico').default;
const path      = require('path');
const fs        = require('fs');

const OUT_DIR = path.resolve(__dirname, '../frontend/public/assets/icons');

// ── Source SVG ───────────────────────────────────────────────────────────────
// Brandmark on dark square background.
// viewBox padded by 2 units on each side (8% inset) so the mark
// doesn't clip and sits cleanly at every size.
const BRANDMARK_PATH = 'M19.6,21.48L3.84,5.73l.43-.43,15.76,15.76s1.3,1.3,2.79-.19.21-2.77.21-2.77L7.25,2.32l.43-.43,4.07,4.07,1.38,1.38,1.28-1.28,4.28-4.28.43.43-5.56,5.56,2.98,2.98,5.56-5.56.43.43-5.56,5.56,1.28,1.28,5.56-5.56s1.28-1.28-.21-2.77-2.79-.19-2.79-.19l-4.26,4.26-.43-.43,4.26-4.26s1.3-1.3-.19-2.79-2.77-.21-2.77-.21l-4.28,4.28L8.95.62s-1.28-1.28-2.77.21-.19,2.79-.19,2.79l15.76,15.76-.43.43L5.57,4.05s-1.3-1.3-2.79.19-.11,2.87-.11,2.87l15.68,15.68-.43.43-5.56-5.56-5.54,5.54-.43-.43,5.54-5.54-2.98-2.98-5.54,5.54-.43-.43,5.54-5.54-1.28-1.28-5.54,5.54s-1.28,1.28.21,2.77,2.79.19,2.79.19l4.23-4.23.43.43-4.23,4.23s-1.3,1.3.19,2.79,2.77.21,2.77.21l4.26-4.26,4.28,4.28s1.28,1.28,2.77-.21.19-2.79.19-2.79Z';

// Padded viewBox: mark sits in 25×25, we expose -2 to 27 on each axis
const SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 29 29">` +
  `<rect x="-2" y="-2" width="29" height="29" fill="#0a0a0a"/>` +
  `<path fill="#f2f2f0" d="${BRANDMARK_PATH}"/>` +
  `</svg>`
);

// ── Sizes ────────────────────────────────────────────────────────────────────
const PNGS = [
  { file: 'favicon-16x16.png',    size: 16  },
  { file: 'favicon-32x32.png',    size: 32  },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'icon-192.png',         size: 192 },
  { file: 'icon-512.png',         size: 512 },
];

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  const pngPaths = {};

  for (const { file, size } of PNGS) {
    const out = path.join(OUT_DIR, file);
    await sharp(SVG)
      .resize(size, size)
      .png()
      .toFile(out);
    pngPaths[size] = out;
    console.log(`  ${size}×${size} → ${file}`);
  }

  // ICO: embed 16 and 32 sizes
  const ico = await pngToIco([pngPaths[16], pngPaths[32]]);
  const icoOut = path.join(OUT_DIR, 'favicon.ico');
  fs.writeFileSync(icoOut, ico);
  console.log(`  16+32 → favicon.ico`);

  console.log('\nDone.');
}

generate().catch(err => { console.error(err); process.exit(1); });
