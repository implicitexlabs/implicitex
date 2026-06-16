/**
 * gen-cards.js — Social card (OG / Twitter) image generator
 *
 * Generates 1200×628 PNG cards using Puppeteer.
 * Output: frontend/public/components/images/og-*.png
 *
 * Usage:
 *   node scripts/gen-cards.js
 */

'use strict';

const puppeteer = require('puppeteer');
const path      = require('path');
const fs        = require('fs');
const os        = require('os');

const OUT_DIR = path.resolve(__dirname, '../frontend/public/components/images');

// ── Inline SVG from brandmark-wordmark.svg ──────────────────────────────────
// viewBox="0 0 201.56 25" — lettermark (0–25) + wordmark (29.95–201.56)
// At width=420, height=52 — fills a ~403px slot at the card scale.
const LOCKUP_SVG = `<svg width="420" height="52" viewBox="0 0 201.56 25" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <polygon points="41.39 18.07 43.68 18.07 43.68 9.26 48.38 9.26 48.38 18.07 50.67 18.07 50.67 9.26 55.37 9.26 55.37 18.07 57.65 18.07 57.65 7 41.39 7 41.39 18.07" fill="#f2f2f0"/>
  <polygon points="66.8 18.07 69.09 18.07 69.09 13.67 77.98 13.67 77.98 7 66.8 7 66.8 9.26 75.69 9.26 75.69 11.41 66.8 11.41" fill="#f2f2f0"/>
  <polygon points="89.42 7 87.13 7 87.13 18.07 98.31 18.07 98.31 15.8 89.42 15.8 89.42 7" fill="#f2f2f0"/>
  <rect x="106.19" y="7" width="2.29" height="11.07" fill="#f2f2f0"/>
  <polygon points="117.62 18.07 128.8 18.07 128.8 15.8 119.91 15.8 119.91 9.26 128.8 9.26 128.8 7 117.62 7 117.62 18.07" fill="#f2f2f0"/>
  <polygon points="148.12 9.26 152.56 9.26 152.56 18.07 154.84 18.07 154.84 9.26 159.3 9.26 159.3 7 148.12 7 148.12 9.26" fill="#f2f2f0"/>
  <polygon points="168.44 18.07 179.63 18.07 179.63 15.8 170.73 15.8 170.73 13.67 179.63 13.67 179.63 11.41 170.73 11.41 170.73 9.26 179.63 9.26 179.63 7 168.44 7 168.44 18.07" fill="#f2f2f0"/>
  <rect x="136.68" y="7" width="2.29" height="11.07" fill="#f2f2f0"/>
  <rect x="29.95" y="7" width="2.29" height="11.07" fill="#f2f2f0"/>
  <polygon points="187.16 7 190.38 7 201.56 18.07 198.34 18.07" fill="#f2f2f0"/>
  <polygon points="198.34 7 201.56 7 190.38 18.07 187.16 18.07" fill="#f2f2f0"/>
  <path fill="#f2f2f0" d="M18.4,21.48L2.64,5.73l.43-.43,15.76,15.76s1.3,1.3,2.79-.19.21-2.77.21-2.77L6.05,2.32l.43-.43,4.07,4.07,1.38,1.38,1.28-1.28,4.28-4.28.43.43-5.56,5.56,2.98,2.98,5.56-5.56.43.43-5.56,5.56,1.28,1.28,5.56-5.56s1.28-1.28-.21-2.77-2.79-.19-2.79-.19l-4.26,4.26-.43-.43,4.26-4.26s1.3-1.3-.19-2.79-2.77-.21-2.77-.21l-4.28,4.28L7.75.62s-1.28-1.28-2.77.21-.19,2.79-.19,2.79l15.76,15.76-.43.43L4.37,4.05s-1.3-1.3-2.79.19-.11,2.87-.11,2.87l15.68,15.68-.43.43-5.56-5.56-5.54,5.54-.43-.43,5.54-5.54-2.98-2.98-5.54,5.54-.43-.43,5.54-5.54-1.28-1.28L.51,18.08s-1.28,1.28.21,2.77,2.79.19,2.79.19l4.23-4.23.43.43-4.23,4.23s-1.3,1.3.19,2.79,2.77.21,2.77.21l4.26-4.26,4.28,4.28s1.28,1.28,2.77-.21.19-2.79.19-2.79Z"/>
</svg>`;

// ── Card definitions ─────────────────────────────────────────────────────────
const CARDS = [
  {
    name:       'og-primary',
    descriptor: 'Non-custodial USDC transfers on Polygon.',
  },
  {
    name:       'og-learn',
    descriptor: 'Guides for first-time crypto users.',
  },
  {
    name:       'og-proof',
    descriptor: 'Source-verified. On-chain confirmed.',
  },
];

// ── Card HTML template ───────────────────────────────────────────────────────
// Rectangular (1200×628): inline lockup, tagline centered below, descriptor below.
function buildHtml(descriptor) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 1200px;
    height: 628px;
    overflow: hidden;
    background: #0a0a0a;
    font-family: 'IBM Plex Mono', 'Courier New', monospace;
    position: relative;
  }

  body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  /* Inline lockup: lettermark + wordmark side by side (from combined SVG) */
  .lockup {
    display: block;
    margin-bottom: 44px;
  }

  .tagline {
    font-size: 23px;
    font-weight: 500;
    letter-spacing: 0.11em;
    color: #f2f2f0;
    text-align: center;
    line-height: 1;
    margin-bottom: 18px;
  }

  .descriptor {
    font-size: 13px;
    font-weight: 400;
    letter-spacing: 0.1em;
    color: #484848;
    text-align: center;
    text-transform: uppercase;
  }

  /* Ghosted URL — bottom-right corner */
  .url {
    position: absolute;
    bottom: 30px;
    right: 44px;
    font-size: 11px;
    letter-spacing: 0.1em;
    color: #1e1e1e;
  }
</style>
</head>
<body>
  <div class="lockup">${LOCKUP_SVG}</div>
  <div class="tagline">WALLET-TO-WALLET. PERSON-TO-PERSON.</div>
  <div class="descriptor">${descriptor}</div>
  <div class="url">implicitex.com</div>
</body>
</html>`;
}

// ── Generate ─────────────────────────────────────────────────────────────────
async function generate() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const card of CARDS) {
    process.stdout.write(`Generating ${card.name}.png ... `);

    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 628 });

    // Write to a temp file so file:// origin loads Google Fonts cleanly
    const tmp = path.join(os.tmpdir(), `${card.name}.html`);
    fs.writeFileSync(tmp, buildHtml(card.descriptor), 'utf8');
    await page.goto('file://' + tmp, { waitUntil: 'networkidle0' });

    const out = path.join(OUT_DIR, `${card.name}.png`);
    await page.screenshot({ path: out, type: 'png' });
    await page.close();

    console.log(`done → ${out}`);
  }

  await browser.close();
  console.log('\nAll cards generated.');
}

generate().catch(err => { console.error(err); process.exit(1); });
