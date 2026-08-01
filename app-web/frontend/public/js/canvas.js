/**
 * canvas.js — ImplicitEx pixel world map background
 * Renders a symbolic pixel-art world map with random opacity shimmer.
 * Strict monochrome: grey values only.
 */
(function () {
  'use strict';
  const COLS = 88;
  const ROWS = 44;
  const LAND_THRESHOLD = 0.045;
  const LAND_RGB = '126,126,122';
  const canvas = document.getElementById('worldCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let map = [];
  let alphas = [];
  function hash2(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }
  function ellipseScore(x, y, cx, cy, rx, ry, rotate) {
    const cos = Math.cos(rotate || 0);
    const sin = Math.sin(rotate || 0);
    const dx = x - cx;
    const dy = y - cy;
    const xr = dx * cos + dy * sin;
    const yr = -dx * sin + dy * cos;
    return 1 - ((xr * xr) / (rx * rx) + (yr * yr) / (ry * ry));
  }
  function maxScore(x, y, shapes) {
    return shapes.reduce((best, shape) => {
      return Math.max(best, ellipseScore(x, y, ...shape));
    }, -Infinity);
  }
  function landScore(x, y) {
    const continents = [
      // North America and Greenland
      [0.17, 0.30, 0.115, 0.105, -0.18],
      [0.25, 0.36, 0.115, 0.095, 0.18],
      [0.10, 0.31, 0.080, 0.055, -0.25],
      [0.29, 0.48, 0.080, 0.030, 0.36],
      [0.39, 0.20, 0.050, 0.055, -0.30],
      // South America
      [0.36, 0.60, 0.058, 0.155, -0.16],
      [0.39, 0.72, 0.042, 0.100, -0.10],
      // Europe, Africa, Asia
      [0.49, 0.35, 0.070, 0.055, -0.08],
      [0.53, 0.57, 0.072, 0.155, -0.05],
      [0.63, 0.35, 0.155, 0.090, 0.04],
      [0.72, 0.41, 0.115, 0.075, -0.10],
      [0.70, 0.54, 0.070, 0.060, 0.16],
      // Australia and nearby islands
      [0.78, 0.69, 0.078, 0.050, 0.05],
      [0.84, 0.76, 0.026, 0.018, -0.25],
      [0.74, 0.61, 0.036, 0.020, 0.20],
    ];
   const islands = [
  [0.45, 0.33, 0.018, 0.018, 0],
  [0.47, 0.30, 0.014, 0.018, 0],
  [0.76, 0.46, 0.016, 0.040, -0.25],
  [0.80, 0.52, 0.025, 0.018, 0.15],
  // Canadian Arctic archipelago / Greenland periphery
  [0.30, 0.22, 0.022, 0.014, 0.10],
  [0.34, 0.18, 0.014, 0.012, -0.15],
  [0.22, 0.25, 0.016, 0.014, 0.20],
  // North America — Aleutians / west coast islands
  [0.08, 0.27, 0.020, 0.010, -0.30],
  [0.13, 0.42, 0.010, 0.014, 0],
  // Asia — Japan, Philippines, Indonesia scatter
  [0.83, 0.40, 0.012, 0.022, -0.20],
  [0.79, 0.48, 0.014, 0.012, 0.10],
  [0.81, 0.58, 0.018, 0.012, -0.10],
  [0.86, 0.56, 0.012, 0.010, 0.15],
  // Australia — Tasmania / nearby Pacific
  [0.79, 0.77, 0.010, 0.010, 0],
  [0.88, 0.66, 0.012, 0.010, -0.20],
];
    return Math.max(maxScore(x, y, continents), maxScore(x, y, islands) * 0.9);
  }
  function buildMap() {
    map = [];
    alphas = [];
    for (let r = 0; r < ROWS; r++) {
      const mapRow = [];
      const alphaRow = [];
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) / COLS;
        const y = (r + 0.5) / ROWS;
        const score = landScore(x, y);
        const coastalDropout = score < 0.14 && hash2(c, r) < 0.28;
        const land = score > LAND_THRESHOLD && !coastalDropout;
        mapRow.push(land ? 1 : 0);
        if (land) {
          // Depth factor: 0 at threshold (coastal), approaches 1 toward continent interior.
          // Clamp avoids runaway values for very high scores (e.g. ellipse centers).
          const depth = Math.min(1, Math.max(0, (score - LAND_THRESHOLD) / 0.15));
          const base = 0.055 + depth * 0.05;   // interior cells start brighter
          const range = 0.125 - depth * 0.06;  // interior cells shimmer less
          alphaRow.push(base + hash2(c + 17, r + 31) * range);
        } else {
          alphaRow.push(0);
        }
      }
      map.push(mapRow);
      alphas.push(alphaRow);
    }
  }
  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cell = Math.max(3, Math.floor(Math.min(W / (COLS + 12), H / (ROWS + 8))));
    const gap = Math.max(1, Math.floor(cell * 0.24));
    const size = Math.max(1, cell - gap);
    const mapW = cell * COLS;
    const mapH = cell * ROWS;
    const ox = Math.floor((W - mapW) / 2);
    const oy = Math.floor((H - mapH) / 2);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!map[r][c]) continue;
        ctx.fillStyle = `rgba(${LAND_RGB},${alphas[r][c].toFixed(3)})`;
        ctx.fillRect(ox + c * cell, oy + r * cell, size, size);
      }
    }
  }
  function tick() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (map[r][c] && Math.random() < 0.004) {
          alphas[r][c] = 0.045 + Math.random() * 0.155;
        }
      }
    }
    draw();
    requestAnimationFrame(tick);
  }
  function resize() {
    // Derive height from the same ratio as the CSS aspect-ratio (100/52).
    // Using offsetHeight would let layout reflows diverge from the pixel buffer,
    // causing the cells to appear stretched or squeezed on narrow/tall viewports.
    canvas.width = canvas.offsetWidth;
    canvas.height = Math.round(canvas.offsetWidth * (ROWS + 8) / (COLS + 12));
    draw();
  }
  buildMap();
  resize();
  window.addEventListener('resize', resize);
  tick();
})();
