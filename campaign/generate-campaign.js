#!/usr/bin/env node
'use strict';
/**
 * generate-campaign.js
 * ImplicitEx Twitter/X Static Brand Campaign — Series A
 * Produces 10 SVG campaign images (1600×900) to campaign/svg/
 *
 * Fonts:  Orbitron (display), Oxanium (UI), IBM Plex Mono (technical)
 * Colors: strict monochrome — #000 bg, #fff primary, #8A8A8A secondary
 * Assets: lettermark (25×25 vb), wordmark (201.89×14.7 vb)
 */

const fs   = require('fs');
const path = require('path');

// ─── BRAND ASSETS ────────────────────────────────────────────────────────────

const LM_PATH = `M19.6,21.48L3.84,5.73l.43-.43,15.76,15.76s1.3,1.3,2.79-.19.21-2.77.21-2.77L7.25,2.32l.43-.43,4.07,4.07,1.38,1.38,1.28-1.28,4.28-4.28.43.43-5.56,5.56,2.98,2.98,5.56-5.56.43.43-5.56,5.56,1.28,1.28,5.56-5.56s1.28-1.28-.21-2.77-2.79-.19-2.79-.19l-4.26,4.26-.43-.43,4.26-4.26s1.3-1.3-.19-2.79-2.77-.21-2.77-.21l-4.28,4.28L8.95.62s-1.28-1.28-2.77.21-.19,2.79-.19,2.79l15.76,15.76-.43.43L5.57,4.05s-1.3-1.3-2.79.19-.11,2.87-.11,2.87l15.68,15.68-.43.43-5.56-5.56-5.54,5.54-.43-.43,5.54-5.54-2.98-2.98-5.54,5.54-.43-.43,5.54-5.54-1.28-1.28-5.54,5.54s-1.28,1.28.21,2.77,2.79.19,2.79.19l4.23-4.23.43.43-4.23,4.23s-1.3,1.3.19,2.79,2.77.21,2.77.21l4.26-4.26,4.28,4.28s1.28,1.28,2.77-.21.19-2.79.19-2.79Z`;

// Wordmark inner elements — viewBox 0 0 201.89 14.7
const WM_INNER = `<rect y=".84" width="2.69" height="13.02" fill="#FFF"/>
<polygon points="13.46 13.86 16.15 13.86 16.15 3.5 21.68 3.5 21.68 13.86 24.37 13.86 24.37 3.5 29.9 3.5 29.9 13.86 32.59 13.86 32.59 .84 13.46 .84 13.46 13.86" fill="#FFF"/>
<polygon points="43.35 13.86 46.04 13.86 46.04 8.69 56.5 8.69 56.5 .84 43.35 .84 43.35 3.5 53.81 3.5 53.81 6.03 43.35 6.03" fill="#FFF"/>
<polygon points="69.96 .84 67.27 .84 67.27 13.86 80.42 13.86 80.42 11.2 69.96 11.2 69.96 .84" fill="#FFF"/>
<rect x="89.69" y=".84" width="2.69" height="13.02" fill="#FFF"/>
<polygon points="103.14 13.86 116.3 13.86 116.3 11.2 105.83 11.2 105.83 3.5 116.3 3.5 116.3 .84 103.14 .84 103.14 13.86" fill="#FFF"/>
<rect x="125.56" y=".84" width="2.69" height="13.02" fill="#FFF"/>
<polygon points="139.02 3.5 144.24 3.5 144.24 13.86 146.93 13.86 146.93 3.5 152.17 3.5 152.17 .84 139.02 .84 139.02 3.5" fill="#FFF"/>
<polygon points="162.93 13.86 176.09 13.86 176.09 11.2 165.62 11.2 165.62 8.69 176.09 8.69 176.09 6.03 165.62 6.03 165.62 3.5 176.09 3.5 176.09 .84 162.93 .84 162.93 13.86" fill="#FFF"/>
<polygon points="184.96 .84 188.74 .84 201.89 13.86 198.11 13.86" fill="#FFF"/>
<polygon points="198.11 .84 201.89 .84 188.74 13.86 184.96 13.86" fill="#FFF"/>`;

// ─── WORLD MAP ENGINE (exact port of canvas.js) ───────────────────────────────

const COLS = 88, ROWS = 44, LAND_T = 0.045;

function h2(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function eScore(x, y, cx, cy, rx, ry, rot) {
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  const dx = x - cx, dy = y - cy;
  const xr = dx * c + dy * s, yr = -dx * s + dy * c;
  return 1 - (xr * xr / (rx * rx) + yr * yr / (ry * ry));
}

function lScore(x, y) {
  const C = [
    [0.17,0.30,0.115,0.105,-0.18],[0.25,0.36,0.115,0.095,0.18],
    [0.10,0.31,0.080,0.055,-0.25],[0.29,0.48,0.080,0.030,0.36],
    [0.39,0.20,0.050,0.055,-0.30],[0.36,0.60,0.058,0.155,-0.16],
    [0.39,0.72,0.042,0.100,-0.10],[0.49,0.35,0.070,0.055,-0.08],
    [0.53,0.57,0.072,0.155,-0.05],[0.63,0.35,0.155,0.090,0.04],
    [0.72,0.41,0.115,0.075,-0.10],[0.70,0.54,0.070,0.060,0.16],
    [0.78,0.69,0.078,0.050,0.05],[0.84,0.76,0.026,0.018,-0.25],
    [0.74,0.61,0.036,0.020,0.20],
  ];
  const I = [
    [0.45,0.33,0.018,0.018,0],[0.47,0.30,0.014,0.018,0],
    [0.76,0.46,0.016,0.040,-0.25],[0.80,0.52,0.025,0.018,0.15],
    [0.30,0.22,0.022,0.014,0.10],[0.34,0.18,0.014,0.012,-0.15],
    [0.22,0.25,0.016,0.014,0.20],[0.08,0.27,0.020,0.010,-0.30],
    [0.13,0.42,0.010,0.014,0],[0.83,0.40,0.012,0.022,-0.20],
    [0.79,0.48,0.014,0.012,0.10],[0.81,0.58,0.018,0.012,-0.10],
    [0.86,0.56,0.012,0.010,0.15],[0.79,0.77,0.010,0.010,0],
    [0.88,0.66,0.012,0.010,-0.20],
  ];
  const cs = C.reduce((b, s) => Math.max(b, eScore(x, y, ...s)), -Infinity);
  const is = I.reduce((b, s) => Math.max(b, eScore(x, y, ...s)), -Infinity);
  return Math.max(cs, is * 0.9);
}

/**
 * Render the pixel world map.
 * groupOp: overall group opacity (0–1).
 * clip: optional { x, y, w, h } — restrict map to a canvas zone.
 *       Use to concentrate the map's presence in a specific compositional half.
 *       e.g. clip={x:800, w:800} → eastern hemisphere only (Europe/Africa/Asia)
 *            clip={x:0,   w:800} → western hemisphere only (Americas)
 *
 * Cell color: rgba(255,255,255, a) — pure white for maximum crispness.
 * Alpha range:  6%–23% (coastal → interior) before group multiplication.
 * This makes the map feel like an operational substrate, not decoration.
 */
function worldMap(W, H, groupOp = 0.82, clip = null) {
  const cell = Math.max(3, Math.floor(Math.min(W / (COLS + 12), H / (ROWS + 8))));
  const gap  = Math.max(1, Math.floor(cell * 0.24));
  const sz   = Math.max(1, cell - gap);
  const ox   = Math.floor((W - cell * COLS) / 2);
  const oy   = Math.floor((H - cell * ROWS) / 2);

  const rects = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = (c + 0.5) / COLS, y = (r + 0.5) / ROWS;
      const sc = lScore(x, y);
      const coastalDropout = sc < 0.14 && h2(c, r) < 0.28;
      if (sc > LAND_T && !coastalDropout) {
        const depth = Math.min(1, Math.max(0, (sc - LAND_T) / 0.15));
        const base  = 0.06 + depth * 0.05;    // 6%–11% base
        const range = 0.12 - depth * 0.07;    // 5%–12% shimmer
        const a     = base + h2(c + 17, r + 31) * range;
        rects.push(
          `<rect x="${ox + c * cell}" y="${oy + r * cell}" width="${sz}" height="${sz}" fill="rgba(255,255,255,${a.toFixed(3)})"/>`
        );
      }
    }
  }

  if (clip) {
    const cx = clip.x ?? 0, cy = clip.y ?? 0;
    const cw = clip.w ?? W,  ch = clip.h ?? H;
    return `<defs><clipPath id="wm-zone"><rect x="${cx}" y="${cy}" width="${cw}" height="${ch}"/></clipPath></defs>
<g opacity="${groupOp}" clip-path="url(#wm-zone)">${rects.join('')}</g>`;
  }
  return `<g opacity="${groupOp}">${rects.join('')}</g>`;
}

// ─── BACKGROUND TEXTURES ─────────────────────────────────────────────────────

function grid(W, H, op, step = 80) {
  const ls = [];
  for (let x = 0; x <= W; x += step)
    ls.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#fff" stroke-width="0.5"/>`);
  for (let y = 0; y <= H; y += step)
    ls.push(`<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="#fff" stroke-width="0.5"/>`);
  return `<g opacity="${op}">${ls.join('')}</g>`;
}

function topo(W, H, op) {
  const lines = [];
  const numLines = 22;
  for (let i = 0; i < numLines; i++) {
    const yb = (i + 0.5) * H / numLines;
    const seg = 10, sw = W / seg;
    let d = `M0 ${yb.toFixed(1)}`;
    for (let s = 0; s < seg; s++) {
      const amp = 6 + h2(i * 7 + s, i * 3) * 20;
      const y1  = yb + (h2(i + s * 0.7,       i * 2)     - 0.5) * amp;
      const y2  = yb + (h2(i + s * 0.9 + 1,   i * 2 + 3) - 0.5) * amp;
      const y3  = yb + (h2(i + s + 2,          i * 3 + 1) - 0.5) * amp * 0.5;
      d += ` C${(s * sw + sw * 0.3).toFixed(1)} ${y1.toFixed(1)},${(s * sw + sw * 0.7).toFixed(1)} ${y2.toFixed(1)},${((s + 1) * sw).toFixed(1)} ${y3.toFixed(1)}`;
    }
    lines.push(`<path d="${d}" fill="none" stroke="#fff" stroke-width="0.65"/>`);
  }
  return `<g opacity="${op}">${lines.join('')}</g>`;
}

// ─── ELEMENT HELPERS ─────────────────────────────────────────────────────────

/** Lettermark centered at (cx, cy), rendered at `size`×`size` pixels. */
function lm(cx, cy, size) {
  const s = size / 25;
  const tx = cx - size / 2, ty = cy - size / 2;
  return `<g transform="translate(${tx},${ty}) scale(${s.toFixed(4)})"><path fill="#FFF" d="${LM_PATH}"/></g>`;
}

/**
 * Wordmark at pixel width `width`.
 * anchor: 'left' | 'center' | 'right'  (x is the anchor point)
 * y: top-left y of the wordmark
 */
function wm(x, y, width, anchor = 'left') {
  const s  = width / 201.89;
  const h  = 14.7 * s;
  const tx = anchor === 'center' ? x - width / 2
           : anchor === 'right'  ? x - width
           : x;
  return `<g transform="translate(${tx.toFixed(1)},${y}) scale(${s.toFixed(4)})">${WM_INNER}</g>`;
}

/** Subtle structural rule line */
function rule(x1, y1, x2, y2) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.14)" stroke-width="1"/>`;
}

/**
 * Wordmark + institutional sub-attribution line.
 * Renders IMPLICITEX wordmark and a small "USDC · POLYGON · NON-CUSTODIAL" label below it.
 * x/y/anchor work identically to wm().
 */
function attribution(x, y, width, anchor = 'left') {
  const s     = width / 201.89;
  const wmH   = Math.ceil(14.7 * s);   // rendered height of wordmark
  const subY  = y + wmH + 10;
  const tAnchor = anchor === 'center' ? 'middle' : anchor === 'right' ? 'end' : 'start';
  const subFill = 'rgba(255,255,255,0.26)';
  return [
    wm(x, y, width, anchor),
    tx(x, subY, 'USDC  ·  POLYGON  ·  NON-CUSTODIAL',
      { font: 'Oxanium', size: 13, weight: 500, fill: subFill, anchor: tAnchor, ls: 4 }),
  ].join('\n');
}

/**
 * SVG text element.
 * opts: { font, size, weight, fill, anchor, ls }
 */
function tx(x, y, text, opts = {}) {
  const {
    font   = 'Orbitron',
    size   = 72,
    weight = 700,
    fill   = '#FFFFFF',
    anchor = 'start',
    ls     = 0,
  } = opts;
  return `<text x="${x}" y="${y}" font-family="'${font}',sans-serif" font-weight="${weight}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}">${text}</text>`;
}

// ─── SVG DOCUMENT WRAPPER ────────────────────────────────────────────────────

function doc(W, H, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<defs>
<style><![CDATA[
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800&family=Oxanium:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap');
]]></style>
</defs>
<rect width="${W}" height="${H}" fill="#000000"/>
${body}
</svg>`;
}

// ─── CANVAS CONSTANTS ────────────────────────────────────────────────────────

const W = 1600, H = 900;
const PX = 120, PY = 100;   // safe-area padding
const MID_X = W / 2;

const DIM = '#8A8A8A';      // secondary / receding copy

// ─── DESIGN THESIS — Series A v3 ─────────────────────────────────────────────
//
// Three primary visual languages:
//   1. Orbitron ALL CAPS — instrumentation labels, not advertising copy
//   2. Lettermark — institutional seal, certifies the statement; never decorates
//   3. Pixel world map — operational substrate; concentrated in zones, not diffused
//
// Compositional law:
//   STATEMENT → RULE → SEAL    (seal certifies; it does not introduce)
//   Reading order: left-to-right, top-to-bottom — seal always arrives last.
//
// Geometry law:
//   Asymmetrical. No centered monuments. No logo-text-logo.
//   Think: engineering drawings, airport diagrams, financial terminal layouts.
//
// World map law:
//   Zone-clip the map to specific halves where it supports the composition.
//   Eastern hemisphere (x>800): Europe, Africa, Asia, Australia.
//   Full canvas: continents appear where they naturally fall.
//
// ─────────────────────────────────────────────────────────────────────────────

const cards = [

  // ── A1 ─────────────────────────────────────────────────────────────────────
  // "USDC FOR WORK, NOT SPECULATION."
  // Layout: COPY top-left (claim) ─── partial rule ─── SEAL bottom-right (certification)
  // Diagonal reading path: upper-left → lower-right. Seal is the final destination.
  // Map: full canvas — continents beneath both zones
  {
    id: 'a1',
    fn: () => doc(W, H, [
      worldMap(W, H, 0.82),
      // Claim — large, left-aligned, upper zone
      tx(PX, 272, 'USDC FOR WORK,',   { size: 86, ls: 1 }),
      tx(PX, 368, 'NOT SPECULATION.', { size: 86, ls: 1, fill: DIM }),
      // Partial rule — terminates the claim zone, does not extend to seal side
      rule(PX, 420, 900, 420),
      // Certification seal — lower-right quadrant (reader arrives here last)
      lm(1280, 600, 250),
      // Attribution — bottom-left
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A2 ─────────────────────────────────────────────────────────────────────
  // "SEND DOLLARS. ANYWHERE."
  // Layout: COPY left (very large, claim) │ VERTICAL RULE │ SEAL right-lower (certification)
  // Seal sits in the lower half of the right column — not symmetrical to copy.
  // Map: eastern hemisphere clipped to right — shows where the dollars go.
  {
    id: 'a2',
    fn: () => doc(W, H, [
      // Ghost of full map for context
      worldMap(W, H, 0.40),
      // Eastern hemisphere concentrated in right column (behind seal zone)
      worldMap(W, H, 0.65, { x: 820, w: W - 820 }),
      // Claim — stacked, maximum weight, no letter-spacing tightening
      tx(PX, 296, 'SEND',      { size: 114, weight: 800 }),
      tx(PX, 422, 'DOLLARS.',  { size: 114, weight: 800 }),
      tx(PX, 548, 'ANYWHERE.', { size: 114, weight: 800, fill: DIM }),
      // Vertical divider
      rule(818, PY + 20, 818, 796),
      // Certification seal — lower half of right column
      lm(1148, 572, 240),
      // Attribution — bottom-left
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A3 ─────────────────────────────────────────────────────────────────────
  // "PAY FREELANCERS IN MINUTES."
  // Layout: COPY upper-left (claim) ─── FULL RULE ─── SEAL lower-right (certification)
  // Grid background — operational context, no geography
  // Most negative space of the series. The large black field between claim and seal.
  {
    id: 'a3',
    fn: () => doc(W, H, [
      grid(W, H, 0.028),
      // Claim — upper left
      tx(PX, 262, 'PAY FREELANCERS', { size: 84, ls: 1 }),
      tx(PX, 358, 'IN MINUTES.',     { size: 84, ls: 1, fill: DIM }),
      // Full-width structural rule — separates claim from certification zone
      rule(PX, 414, W - PX, 414),
      // Certification seal — lower right (maximum diagonal distance from claim)
      lm(1290, 596, 248),
      // Attribution — bottom-left (counterbalances seal)
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A4 ─────────────────────────────────────────────────────────────────────
  // "ONE WALLET. ONE PAYMENT. ONE RECEIPT."
  // Layout: COPY left (anaphora stack) │ VERTICAL RULE │ SEAL right-lower
  // Three-line anaphora = structural argument. Seal = certified outcome.
  // Map: eastern hemisphere behind seal zone (global settlement reach)
  {
    id: 'a4',
    fn: () => doc(W, H, [
      worldMap(W, H, 0.38),                            // ghost map, full canvas
      worldMap(W, H, 0.72, { x: 772, w: W - 772 }),   // east hemisphere, right column
      // Three-line argument — left column, stepped down
      tx(PX, 306, 'ONE WALLET.',  { size: 82, ls: 1 }),
      tx(PX, 402, 'ONE PAYMENT.', { size: 82, ls: 1 }),
      tx(PX, 498, 'ONE RECEIPT.', { size: 82, ls: 1, fill: DIM }),
      // Vertical divider — argument | certification
      rule(772, PY + 20, 772, 796),
      // Seal — lower half of right column, not symmetrical to copy midpoint
      lm(1120, 582, 254),
      // Attribution
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A5 ─────────────────────────────────────────────────────────────────────
  // "KEEP PROJECT BUDGETS SEPARATE."
  // Layout: COPY (two lines) ─── RULE ─── "SEPARATE." ─── RULE ─── SEAL
  // The word "SEPARATE." lives between two rules — it IS the separation.
  // Seal arrives last, certifying the principle.
  {
    id: 'a5',
    fn: () => doc(W, H, [
      topo(W, H, 0.038),
      // Claim — above first rule
      tx(PX, 242, 'KEEP PROJECT', { size: 82, ls: 1 }),
      tx(PX, 334, 'BUDGETS',      { size: 82, ls: 1 }),
      // First rule
      rule(PX, 382, W - PX, 382),
      // "SEPARATE." — the rule makes it literal
      tx(PX, 466, 'SEPARATE.', { size: 82, ls: 1, fill: DIM }),
      // Second rule — closes the separation zone
      rule(PX, 514, W - PX, 514),
      // Certification seal — below both rules, right-offset (not centered)
      lm(1240, 634, 224),
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A6 ─────────────────────────────────────────────────────────────────────
  // "RECEIVE PAYMENT. VERIFY ON-CHAIN."
  // Layout: COPY left (two tiers: Orbitron + Oxanium) ─── RULE ─── SEAL lower-right
  // Two type registers: Orbitron (the act), Oxanium (the proof mechanism).
  {
    id: 'a6',
    fn: () => doc(W, H, [
      topo(W, H, 0.036),
      // Primary act — Orbitron, large
      tx(PX, 268, 'RECEIVE',  { size: 84, ls: 2 }),
      tx(PX, 362, 'PAYMENT.', { size: 84, ls: 2 }),
      // Proof mechanism — Oxanium, technical register
      tx(PX, 448, 'VERIFY ON-CHAIN.', { font: 'Oxanium', size: 34, weight: 500, fill: DIM, ls: 10 }),
      // Rule terminating the copy block
      rule(PX, 494, W - PX, 494),
      // Certification seal — below rule, right-offset
      lm(1276, 624, 234),
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A7 ─────────────────────────────────────────────────────────────────────
  // "PROFESSIONAL USDC PAYMENTS."
  // Layout: COPY left (full width, three lines) ─── RULE ─── SEAL below rule, right
  // No left-right split here. Copy takes the full width, seal drops below.
  // Map: full canvas. The world is the backdrop for professional infrastructure.
  {
    id: 'a7',
    fn: () => doc(W, H, [
      worldMap(W, H, 0.80),
      // Claim — left-aligned, three lines, large
      tx(PX, 258, 'PROFESSIONAL', { size: 82, ls: 2 }),
      tx(PX, 350, 'USDC',         { size: 82, weight: 800, ls: 2 }),
      tx(PX, 442, 'PAYMENTS.',    { size: 82, weight: 800, ls: 2, fill: DIM }),
      // Full-width rule
      rule(PX, 498, W - PX, 498),
      // Seal — below rule, right-offset (asymmetric: copy is left-anchored, seal right-offset)
      lm(1240, 638, 230),
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A8 ─────────────────────────────────────────────────────────────────────
  // "YOUR WALLET. YOUR FUNDS. YOUR TRANSFER."
  // Layout: COPY (centered anaphora) ─── RULE ─── SEAL (centered, below)
  // The one composition where centered works: the anaphora IS the claim,
  // the rule IS the boundary of ownership, the seal IS the verification.
  // Centered reads as a formal declaration, not a poster.
  {
    id: 'a8',
    fn: () => doc(W, H, [
      topo(W, H, 0.040),
      // Ownership declaration — centered, deliberate repetition
      tx(MID_X, 280, 'YOUR WALLET.',   { anchor: 'middle', size: 82, ls: 2 }),
      tx(MID_X, 376, 'YOUR FUNDS.',    { anchor: 'middle', size: 82, ls: 2 }),
      tx(MID_X, 472, 'YOUR TRANSFER.', { anchor: 'middle', size: 82, ls: 2, fill: DIM }),
      // Rule — ownership boundary
      rule(PX, 524, W - PX, 524),
      // Seal — centered, below boundary. Formal certification.
      lm(MID_X, 638, 192),
      attribution(MID_X, 748, 220, 'center'),
    ].join('\n')),
  },

  // ── A9 ─────────────────────────────────────────────────────────────────────
  // "NO CUSTODIAL ACCOUNT REQUIRED."
  // Layout: COPY left (claim) │ VERTICAL RULE │ SEAL right-center
  // Unlike A2/A4 where seal is lower, here seal is mid-height — it sits at the
  // level of "ACCOUNT", the central word. The map fills the right column
  // where a traditional custodian would be. The seal replaces the bank.
  // Map: western hemisphere clipped LEFT (shows Americas — established financial world)
  //      eastern hemisphere clipped RIGHT (behind seal — where ImplicitEx operates)
  {
    id: 'a9',
    fn: () => doc(W, H, [
      worldMap(W, H, 0.50),                            // ghost full map
      worldMap(W, H, 0.68, { x: 820, w: W - 820 }),   // eastern hemisphere, right column
      // Claim — three lines, left column
      tx(PX, 308, 'NO CUSTODIAL', { size: 82, ls: 1 }),
      tx(PX, 404, 'ACCOUNT',      { size: 82, ls: 1 }),
      tx(PX, 500, 'REQUIRED.',    { size: 82, ls: 1, fill: DIM }),
      // Vertical divider
      rule(818, PY + 20, 818, 796),
      // Seal — right column, mid-height (at level of "ACCOUNT")
      lm(1148, 440, 270),
      attribution(PX, 748, 210),
    ].join('\n')),
  },

  // ── A10 ────────────────────────────────────────────────────────────────────
  // "SIMPLE TRANSACTION FLOW. INDEPENDENTLY VERIFIABLE."
  // Layout: RULE ─── SEAL (bracketed, large) ─── RULE ─── COPY (technical spec)
  // Deliberately breaks "seal concludes" — this is a DIAGRAM, not a narrative.
  // The seal is the SUBJECT of the diagram. The copy below are technical specifications.
  // Think: schematic. Operating manual page. Aviation instrument legend.
  {
    id: 'a10',
    fn: () => doc(W, H, [
      grid(W, H, 0.025, 56),
      // Top bracket rule
      rule(PX, 186, W - PX, 186),
      // Subject — large central seal, the diagram's object
      lm(MID_X, 360, 244),
      // Bottom bracket rule
      rule(PX, 534, W - PX, 534),
      // Technical specifications — Oxanium, wide tracking, below diagram
      tx(MID_X, 600, 'SIMPLE TRANSACTION FLOW.',   { font: 'Oxanium', size: 32, weight: 500, anchor: 'middle', ls: 10 }),
      tx(MID_X, 645, 'INDEPENDENTLY VERIFIABLE.',  { font: 'Oxanium', size: 32, weight: 500, anchor: 'middle', fill: DIM, ls: 10 }),
      attribution(MID_X, 748, 220, 'center'),
    ].join('\n')),
  },

];

// ─── OUTPUT ──────────────────────────────────────────────────────────────────

const outDir = path.join(__dirname, 'svg');
fs.mkdirSync(outDir, { recursive: true });

let count = 0;
for (const card of cards) {
  const svg = card.fn();
  const fp  = path.join(outDir, `${card.id}.svg`);
  fs.writeFileSync(fp, svg, 'utf8');
  const kb = (svg.length / 1024).toFixed(1);
  console.log(`  ✓  ${card.id}.svg  (${kb} KB)`);
  count++;
}

console.log(`\n  ${count} campaign images written to ${outDir}/\n`);
console.log('  View in browser (requires internet for Google Fonts):');
console.log(`  file://${outDir}/a1.svg\n`);
