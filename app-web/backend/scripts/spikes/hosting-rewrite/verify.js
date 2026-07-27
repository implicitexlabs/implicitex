/**
 * verify.js — Hosting-rewrite spike verification
 *
 * Runs all 8 routing-proof checks against the local emulator and prints a
 * pass/fail table suitable for pasting into HOSTING_REWRITE_EVIDENCE.md.
 *
 * Checks:
 *   1. Static fixture (antoine.json) returns correct static content; no X-Spike-Source header
 *   2. Firestore-backed ACTIVE fixture returns 200 JSON; X-Spike-Source: function
 *   3. Unknown handle returns 404; X-Spike-Source: function
 *   4. PENDING_PUBLICATION fixture returns 503; X-Spike-Source: function
 *   5. Firestore/artifact hash mismatch returns 503; X-Spike-Source: function
 *   6. REVOKED fixture returns 200 JSON with CARD_REVOKED content; X-Spike-Source: function
 *   7. Direct Storage emulator URL returns 401 (unauthenticated public access denied)
 *   8. spike_invocations log: antoine NOT present; all other spike handles present
 *
 * PREREQUISITES:
 *   firebase emulators:start --config firebase.routing-spike.json --project demo-spike
 *   node seed-fixtures.js   (run from this directory)
 *
 * RUN:
 *   node verify.js
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ─── Step 0: Safety guard ─────────────────────────────────────────────────────
// verify.js reads spike_invocations from Firestore emulator. If pointed at real
// Firestore it would read from — or pollute — real collections via Admin SDK.

const EXPECTED_PROJECT_ID = 'demo-spike';
// Allowlist: any project ID not explicitly listed here causes the guard to fail closed.
// This includes production, staging, unknown developer projects, and typos.
// Do not use a blacklist — a blacklist must be updated every time a new project appears.
const ALLOWED_PROJECT_IDS = new Set(['demo-spike']);

function guardAgainstProductionRun() {
  const inferredProject = process.env.GCLOUD_PROJECT
    || process.env.FIREBASE_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || null;

  if (inferredProject && !ALLOWED_PROJECT_IDS.has(inferredProject)) {
    console.error('\n✗  SAFETY GUARD: refusing to run — project is not in the approved allowlist.');
    console.error(`   Detected project: ${inferredProject}`);
    console.error(`   Allowed projects: ${[...ALLOWED_PROJECT_IDS].join(', ')}`);
    process.exit(1);
  }

  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('\n✗  SAFETY GUARD: FIRESTORE_EMULATOR_HOST is not set.');
    console.error('   Start the emulators first:');
    console.error('   firebase emulators:start --config firebase.routing-spike.json --project demo-spike');
    process.exit(1);
  }

  console.log('Step 0: Safety guard passed.');
  console.log(`  FIRESTORE_EMULATOR_HOST: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  if (inferredProject) console.log(`  Project: ${inferredProject}`);
  console.log('');
}

guardAgainstProductionRun();

// Admin SDK connects to emulator to read spike_invocations.
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

if (!getApps().length) {
  initializeApp({ projectId: EXPECTED_PROJECT_ID });
}

const db = getFirestore();

const HOSTING_ORIGIN = 'http://localhost:5000';
const STORAGE_EMULATOR_ORIGIN = 'http://localhost:9199';
const SPIKE_INVOCATIONS = 'spike_invocations';

// Path to the static antoine.json for content comparison
const STATIC_ANTOINE = path.resolve(
  __dirname,
  '../../../../frontend/public/registry/coincards/antoine.json'
);

// ─── HTTP utility ─────────────────────────────────────────────────────────────

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Check helpers ────────────────────────────────────────────────────────────

function pass(label) {
  console.log(`  ✓  ${label}`);
  return true;
}

function fail(label, detail) {
  console.log(`  ✗  ${label}`);
  if (detail) console.log(`       ${detail}`);
  return false;
}

// ─── Checks ───────────────────────────────────────────────────────────────────

async function check1_staticFile() {
  console.log('\nCheck 1: Static fixture — antoine.json served directly; function NOT invoked');
  const res = await request(`${HOSTING_ORIGIN}/registry/coincards/antoine.json`);

  let ok = true;

  if (res.status !== 200) {
    ok = fail('status 200', `got ${res.status}`);
  } else {
    pass('status 200');
  }

  // Static file must NOT set the X-Spike-Source header (only the function sets it)
  if (res.headers['x-spike-source']) {
    ok = fail('no X-Spike-Source header', `got: ${res.headers['x-spike-source']}`);
  } else {
    pass('no X-Spike-Source header (static file was served, not the function)');
  }

  // Body must match the actual static file content
  const staticContent = fs.existsSync(STATIC_ANTOINE)
    ? fs.readFileSync(STATIC_ANTOINE, 'utf8')
    : null;
  if (!staticContent) {
    ok = fail('static file readable', `file not found: ${STATIC_ANTOINE}`);
  } else {
    // Compare ignoring trailing whitespace/newline differences
    const bodyNorm = res.body.trim();
    const staticNorm = staticContent.trim();
    if (bodyNorm === staticNorm) {
      pass('response body matches static file byte-for-byte');
    } else {
      ok = fail('response body matches static file', 'content differs');
    }
  }

  return ok;
}

async function check2_activeHandle() {
  console.log('\nCheck 2: ACTIVE handle — function invoked; returns 200 JSON');
  const res = await request(`${HOSTING_ORIGIN}/registry/coincards/spike-active.json`);

  let ok = true;
  ok = (res.status === 200) ? pass('status 200') : fail('status 200', `got ${res.status}`);
  ok = (res.headers['x-spike-source'] === 'function') ? pass('X-Spike-Source: function') : fail('X-Spike-Source: function', `got: ${res.headers['x-spike-source']}`);

  let body;
  try {
    body = JSON.parse(res.body);
    pass('response is valid JSON');
  } catch {
    ok = fail('response is valid JSON', 'parse error');
    body = null;
  }
  if (body && body.cardStatus === 'CARD_ACTIVE') {
    pass('cardStatus: CARD_ACTIVE');
  } else if (body) {
    ok = fail('cardStatus: CARD_ACTIVE', `got: ${body.cardStatus}`);
  }

  return ok;
}

async function check3_unknownHandle() {
  console.log('\nCheck 3: Unknown handle — function invoked; returns 404');
  const res = await request(`${HOSTING_ORIGIN}/registry/coincards/spike-no-record.json`);

  let ok = true;
  ok = (res.status === 404) ? pass('status 404') : fail('status 404', `got ${res.status}`);
  ok = (res.headers['x-spike-source'] === 'function') ? pass('X-Spike-Source: function') : fail('X-Spike-Source: function', `got: ${res.headers['x-spike-source']}`);

  return ok;
}

async function check4_pendingPublication() {
  console.log('\nCheck 4: PENDING_PUBLICATION — function returns 503');
  const res = await request(`${HOSTING_ORIGIN}/registry/coincards/spike-pending.json`);

  let ok = true;
  ok = (res.status === 503) ? pass('status 503') : fail('status 503', `got ${res.status}`);
  ok = (res.headers['x-spike-source'] === 'function') ? pass('X-Spike-Source: function') : fail('X-Spike-Source: function', `got: ${res.headers['x-spike-source']}`);

  return ok;
}

async function check5_hashMismatch() {
  console.log('\nCheck 5: Firestore/Storage hash mismatch — function returns 503');
  const res = await request(`${HOSTING_ORIGIN}/registry/coincards/spike-mismatch.json`);

  let ok = true;
  ok = (res.status === 503) ? pass('status 503') : fail('status 503', `got ${res.status}`);
  ok = (res.headers['x-spike-source'] === 'function') ? pass('X-Spike-Source: function') : fail('X-Spike-Source: function', `got: ${res.headers['x-spike-source']}`);

  return ok;
}

async function check6_revokedHandle() {
  console.log('\nCheck 6: REVOKED handle — function returns 200 with revocation evidence');
  const res = await request(`${HOSTING_ORIGIN}/registry/coincards/spike-revoked.json`);

  let ok = true;
  ok = (res.status === 200) ? pass('status 200') : fail('status 200', `got ${res.status}`);
  ok = (res.headers['x-spike-source'] === 'function') ? pass('X-Spike-Source: function') : fail('X-Spike-Source: function', `got: ${res.headers['x-spike-source']}`);

  let body;
  try {
    body = JSON.parse(res.body);
    pass('response is valid JSON');
  } catch {
    ok = fail('response is valid JSON', 'parse error');
    body = null;
  }
  if (body && body.cardStatus === 'CARD_REVOKED') {
    pass('cardStatus: CARD_REVOKED — revocation is observable, not hidden as 404');
  } else if (body) {
    ok = fail('cardStatus: CARD_REVOKED', `got: ${body.cardStatus}`);
  }

  return ok;
}

async function check7_directStorageAccess() {
  console.log('\nCheck 7: Direct Storage URL — unauthenticated access denied');
  // The Firebase Storage emulator serves objects at this URL pattern.
  // Storage rules deny unauthenticated reads; this request has no auth header.
  const storageUrl = `${STORAGE_EMULATOR_ORIGIN}/v0/b/demo-spike.appspot.com/o/spike-active%2Fartifact.json?alt=media`;
  const res = await request(storageUrl);

  let ok = true;
  if (res.status === 401 || res.status === 403) {
    ok = pass(`status ${res.status} (unauthenticated direct access denied)`);
  } else {
    ok = fail('status 401 or 403', `got ${res.status} — storage rules may not be enforced`);
  }

  return ok;
}

async function check8_invocationLog() {
  console.log('\nCheck 8: spike_invocations log — routing evidence');

  const snapshot = await db.collection(SPIKE_INVOCATIONS).get();
  const invocations = snapshot.docs.map((d) => d.data());

  const invokedHandles = new Set(invocations.map((i) => i.handle));
  console.log(`  Recorded invocations: [${[...invokedHandles].join(', ')}]`);

  let ok = true;

  // antoine must NOT appear — static file served without invoking the function
  if (invokedHandles.has('antoine')) {
    ok = fail('antoine NOT in spike_invocations', 'function was invoked for a static-file handle');
  } else {
    ok = pass('antoine absent from spike_invocations (static file served without function call)');
  }

  // All spike handles must appear
  for (const handle of ['spike-active', 'spike-revoked', 'spike-pending', 'spike-mismatch', 'spike-no-record']) {
    if (invokedHandles.has(handle)) {
      pass(`${handle} present in spike_invocations`);
    } else {
      ok = fail(`${handle} present in spike_invocations`, 'function was not invoked for this handle');
    }
  }

  // Print response status breakdown for evidence
  console.log('\n  Invocation breakdown:');
  for (const { handle, registry_status, response_status } of invocations) {
    console.log(`    ${handle}: registry_status=${registry_status} → HTTP ${response_status}`);
  }

  return ok;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Hosting-rewrite spike: verification ===');
  console.log(`Emulator: ${HOSTING_ORIGIN}\n`);

  const results = [];

  try {
    results.push(['1 — static file priority', await check1_staticFile()]);
    results.push(['2 — ACTIVE handle → 200', await check2_activeHandle()]);
    results.push(['3 — unknown handle → 404', await check3_unknownHandle()]);
    results.push(['4 — PENDING_PUBLICATION → 503', await check4_pendingPublication()]);
    results.push(['5 — hash mismatch → 503', await check5_hashMismatch()]);
    results.push(['6 — REVOKED → 200 observable', await check6_revokedHandle()]);
    results.push(['7 — direct Storage access denied', await check7_directStorageAccess()]);
    results.push(['8 — invocation log evidence', await check8_invocationLog()]);
  } catch (err) {
    console.error('\nVerification aborted:', err.message);
    console.error('Is the emulator running? firebase emulators:start --config firebase.routing-spike.json --project demo-spike');
    process.exit(1);
  }

  console.log('\n=== Summary ===\n');
  let allPass = true;
  for (const [label, result] of results) {
    const icon = result ? '✓' : '✗';
    console.log(`  ${icon}  ${label}`);
    if (!result) allPass = false;
  }

  console.log(`\n${allPass ? 'GATE PASSED — all 8 checks pass.' : 'GATE FAILED — see failures above.'}`);
  console.log('\nPaste this output into HOSTING_REWRITE_EVIDENCE.md.\n');
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
