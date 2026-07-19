/**
 * gen-github.js — GitHub organization asset generator
 *
 * Outputs:
 *   components/images/github-avatar.png          (460×460 — org avatar, rounded square)
 *   components/images/github-social-preview.png  (1280×640 — repo link preview)
 *
 * Usage:
 *   node scripts/gen-github.js
 */

'use strict';

const sharp     = require('sharp');
const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');

const OUT_DIR = path.resolve(__dirname, '../frontend/public/components/images');

const BRANDMARK_PATH = 'M19.6,21.48L3.84,5.73l.43-.43,15.76,15.76s1.3,1.3,2.79-.19.21-2.77.21-2.77L7.25,2.32l.43-.43,4.07,4.07,1.38,1.38,1.28-1.28,4.28-4.28.43.43-5.56,5.56,2.98,2.98,5.56-5.56.43.43-5.56,5.56,1.28,1.28,5.56-5.56s1.28-1.28-.21-2.77-2.79-.19-2.79-.19l-4.26,4.26-.43-.43,4.26-4.26s1.3-1.3-.19-2.79-2.77-.21-2.77-.21l-4.28,4.28L8.95.62s-1.28-1.28-2.77.21-.19,2.79-.19,2.79l15.76,15.76-.43.43L5.57,4.05s-1.3-1.3-2.79.19-.11,2.87-.11,2.87l15.68,15.68-.43.43-5.56-5.56-5.54,5.54-.43-.43,5.54-5.54-2.98-2.98-5.54,5.54-.43-.43,5.54-5.54-1.28-1.28-5.54,5.54s-1.28,1.28.21,2.77,2.79.19,2.79.19l4.23-4.23.43.43-4.23,4.23s-1.3,1.3.19,2.79,2.77.21,2.77.21l4.26-4.26,4.28,4.28s1.28,1.28,2.77-.21.19-2.79.19-2.79Z';

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_SVG = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 29 29">` +
  `<rect x="-2" y="-2" width="29" height="29" fill="#0a0a0a"/>` +
  `<path fill="#f2f2f0" d="${BRANDMARK_PATH}"/>` +
  `</svg>`
);

// ── Wordmark helper ───────────────────────────────────────────────────────────
function wordmarkSvg(w, h) {
  return `<svg width="${w}" height="${h}" viewBox="29.95 0 171.61 25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="29.95" y="7" width="2.29" height="11.07" fill="#f2f2f0"/>
      <polygon points="41.39 18.07 43.68 18.07 43.68 9.26 48.38 9.26 48.38 18.07 50.67 18.07 50.67 9.26 55.37 9.26 55.37 18.07 57.65 18.07 57.65 7 41.39 7 41.39 18.07" fill="#f2f2f0"/>
      <polygon points="66.8 18.07 69.09 18.07 69.09 13.67 77.98 13.67 77.98 7 66.8 7 66.8 9.26 75.69 9.26 75.69 11.41 66.8 11.41" fill="#f2f2f0"/>
      <polygon points="89.42 7 87.13 7 87.13 18.07 98.31 18.07 98.31 15.8 89.42 15.8 89.42 7" fill="#f2f2f0"/>
      <rect x="106.19" y="7" width="2.29" height="11.07" fill="#f2f2f0"/>
      <polygon points="117.62 18.07 128.8 18.07 128.8 15.8 119.91 15.8 119.91 9.26 128.8 9.26 128.8 7 117.62 7 117.62 18.07" fill="#f2f2f0"/>
      <rect x="136.68" y="7" width="2.29" height="11.07" fill="#f2f2f0"/>
      <polygon points="148.12 9.26 152.56 9.26 152.56 18.07 154.84 18.07 154.84 9.26 159.3 9.26 159.3 7 148.12 7 148.12 9.26" fill="#f2f2f0"/>
      <polygon points="168.44 18.07 179.63 18.07 179.63 15.8 170.73 15.8 170.73 13.67 179.63 13.67 179.63 11.41 170.73 11.41 170.73 9.26 179.63 9.26 179.63 7 168.44 7 168.44 18.07" fill="#f2f2f0"/>
      <polygon points="187.16 7 190.38 7 201.56 18.07 198.34 18.07" fill="#f2f2f0"/>
      <polygon points="198.34 7 201.56 7 190.38 18.07 187.16 18.07" fill="#f2f2f0"/>
    </svg>`;
}

// ── Social preview HTML (1280×640) ────────────────────────────────────────────
// Stacked layout. Scale: mark=72px → 2.88px/unit;
// wordmark width = 171.61 × 2.88 = 494px.
function buildPreviewHtml() {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 1280px;
    height: 640px;
    overflow: hidden;
    background: #0a0a0a;
    font-family: 'IBM Plex Mono', 'Courier New', monospace;
  }

  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .stack {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stack svg { display: block; }

  .mark     { margin-bottom: 22px; }
  .wordmark { margin-bottom: 28px; }

  .tagline {
    font-size: 18px;
    font-weight: 400;
    letter-spacing: 0.12em;
    color: #f2f2f0;
    text-align: center;
    line-height: 1;
    margin-bottom: 16px;
  }

  .descriptor {
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: #666;
    text-align: center;
    text-transform: uppercase;
  }

  .url {
    position: absolute;
    bottom: 36px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    color: #f2f2f0;
    text-transform: uppercase;
  }
</style>
</head>
<body>
  <div class="stack">
    <svg class="mark" width="72" height="72" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#f2f2f0" d="${BRANDMARK_PATH}"/>
    </svg>
    <div class="wordmark">${wordmarkSvg(494, 72)}</div>
    <div class="tagline">WALLET-TO-WALLET. PERSON-TO-PERSON.</div>
    <div class="descriptor">Non-custodial USDC transfers on Polygon.</div>
  </div>
  <div class="url">implicitex.com</div>
</body>
</html>`;
}

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  process.stdout.write('Generating github-avatar.png ... ');
  await sharp(AVATAR_SVG)
    .resize(460, 460)
    .png()
    .toFile(path.join(OUT_DIR, 'github-avatar.png'));
  console.log('done');

  process.stdout.write('Generating github-social-preview.png ... ');
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 640 });
  const tmp = path.join(os.tmpdir(), 'github-social-preview.html');
  fs.writeFileSync(tmp, buildPreviewHtml(), 'utf8');
  await page.goto('file://' + tmp, { waitUntil: 'networkidle0' });
  await page.screenshot({
    path: path.join(OUT_DIR, 'github-social-preview.png'),
    type: 'png',
  });
  await browser.close();
  console.log('done');

  console.log('\nDone.');
  console.log('  → components/images/github-avatar.png         (460×460)');
  console.log('  → components/images/github-social-preview.png (1280×640)');
}

generate().catch(err => { console.error(err); process.exit(1); });
