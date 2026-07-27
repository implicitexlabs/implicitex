'use strict';

/*
  check_portal_accent.js — Static regression guard for portal accent token integrity.

  Fails if portal-index.html:
    1. Redeclares --accent with a new value (the canonical value must come from main.css).
    2. Contains legacy teal hex literals that predate the Tourmaline migration.
    3. Declares --ix-teal or --ix-teal-strong as independent hex values rather than
       var(--accent) aliases.

  Run: node scripts/check_portal_accent.js
  Exit 0 = PASS, exit 1 = FAIL.
*/

const fs   = require('node:fs');
const path = require('node:path');

const FILE = path.resolve(__dirname, '../frontend/public/portal-index.html');
const src  = fs.readFileSync(FILE, 'utf8');

let failures = 0;

function fail(msg) {
  console.error('FAIL:', msg);
  failures++;
}

// ── 1. No --accent redeclaration ─────────────────────────────────────────────
// A CSS property declaration has the form: --accent: <value>;
// Match lines that set --accent to something (not just consume it with var(--accent)).
// We exclude comment lines (starting with *) and var() consumers.
const accentRedecl = /--accent\s*:/g;
let m;
while ((m = accentRedecl.exec(src)) !== null) {
  // Get the full declaration context (up to the next semicolon)
  const slice = src.slice(m.index, m.index + 120);
  // Exclude cases that are just var(--accent) inside another declaration
  // A true redeclaration has the form: --accent: <anything-other-than-end-of-comment>
  fail(`--accent redeclared at offset ${m.index}: ${slice.split('\n')[0].trim()}`);
}

// ── 2. No legacy teal hex literals ───────────────────────────────────────────
const LEGACY = [
  '#5f9892',  // old --ix-teal light
  '#467b76',  // old --ix-teal-strong light
  '#6ca7a1',  // old --ix-teal dark
  '#86bbb6',  // old --ix-teal-strong dark
  '#7ab5b1',  // pre-migration accent dark
  '#2d5c58',  // pre-migration accent light
];

const srcLower = src.toLowerCase();
for (const hex of LEGACY) {
  if (srcLower.includes(hex.toLowerCase())) {
    // Find line number
    const idx = srcLower.indexOf(hex.toLowerCase());
    const lineNum = src.slice(0, idx).split('\n').length;
    fail(`Legacy teal literal ${hex} found at line ${lineNum}.`);
  }
}

// ── 3. --ix-teal / --ix-teal-strong must not be independent hex values ────────
// They are allowed only as var(--accent) aliases or must not appear at all.
const PORTAL_TOKEN_DECL = /--ix-teal(?:-strong)?\s*:\s*([^;]+);/g;
while ((m = PORTAL_TOKEN_DECL.exec(src)) !== null) {
  const value = m[1].trim();
  if (!value.startsWith('var(--accent)')) {
    const lineNum = src.slice(0, m.index).split('\n').length;
    fail(`--ix-teal or --ix-teal-strong declared as independent value at line ${lineNum}: "${value}"`);
  }
}

if (failures === 0) {
  console.log('Portal accent check: PASS');
  console.log('  No --accent redeclarations.');
  console.log('  No legacy teal hex literals.');
  console.log('  --ix-teal / --ix-teal-strong are canonical aliases or absent.');
  process.exit(0);
} else {
  console.error(`\nPortal accent check: FAIL (${failures} violation${failures > 1 ? 's' : ''})`);
  process.exit(1);
}
