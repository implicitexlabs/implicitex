'use strict';
/**
 * IX ID Identity Page — structural tests for static pages, nginx config,
 * and profile block HTML invariants.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const publicDir = path.join(__dirname, '../public');
const nginxConf = path.join(__dirname, '../nginx.conf');
const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// Static page existence
// ---------------------------------------------------------------------------

test('about.html exists', () => {
  assert.ok(fs.existsSync(path.join(publicDir, 'about.html')), 'about.html must exist');
});

test('help.html exists', () => {
  assert.ok(fs.existsSync(path.join(publicDir, 'help.html')), 'help.html must exist');
});

test('privacy.html exists', () => {
  assert.ok(fs.existsSync(path.join(publicDir, 'privacy.html')), 'privacy.html must exist');
});

test('terms.html exists', () => {
  assert.ok(fs.existsSync(path.join(publicDir, 'terms.html')), 'terms.html must exist');
});

// ---------------------------------------------------------------------------
// Static page title invariants
// ---------------------------------------------------------------------------

test('about.html has a <title> element', () => {
  const content = fs.readFileSync(path.join(publicDir, 'about.html'), 'utf8');
  assert.match(content, /<title>/i);
});

test('help.html has a <title> element', () => {
  const content = fs.readFileSync(path.join(publicDir, 'help.html'), 'utf8');
  assert.match(content, /<title>/i);
});

test('privacy.html has a <title> element', () => {
  const content = fs.readFileSync(path.join(publicDir, 'privacy.html'), 'utf8');
  assert.match(content, /<title>/i);
});

test('terms.html has a <title> element', () => {
  const content = fs.readFileSync(path.join(publicDir, 'terms.html'), 'utf8');
  assert.match(content, /<title>/i);
});

// ---------------------------------------------------------------------------
// Back link to ixid.me
// ---------------------------------------------------------------------------

test('about.html links back to https://ixid.me', () => {
  const content = fs.readFileSync(path.join(publicDir, 'about.html'), 'utf8');
  assert.match(content, /href="https:\/\/ixid\.me"/);
});

test('help.html links back to https://ixid.me', () => {
  const content = fs.readFileSync(path.join(publicDir, 'help.html'), 'utf8');
  assert.match(content, /href="https:\/\/ixid\.me"/);
});

test('privacy.html links back to https://ixid.me', () => {
  const content = fs.readFileSync(path.join(publicDir, 'privacy.html'), 'utf8');
  assert.match(content, /href="https:\/\/ixid\.me"/);
});

test('terms.html links back to https://ixid.me', () => {
  const content = fs.readFileSync(path.join(publicDir, 'terms.html'), 'utf8');
  assert.match(content, /href="https:\/\/ixid\.me"/);
});

// ---------------------------------------------------------------------------
// about.html content invariants
// ---------------------------------------------------------------------------

test('about.html contains identity-is-permanent / wallet-is-replaceable distinction', () => {
  const content = fs.readFileSync(path.join(publicDir, 'about.html'), 'utf8');
  // The page must articulate that the identity (handle) is permanent and the
  // wallet is replaceable — core product thesis. Test structural presence only.
  const lc = content.toLowerCase();
  assert.ok(
    lc.includes('wallet') && (lc.includes('replac') || lc.includes('change') || lc.includes('permanent') || lc.includes('identit')),
    'about.html must reference wallet replaceability or identity permanence'
  );
});

// ---------------------------------------------------------------------------
// help.html content invariants
// ---------------------------------------------------------------------------

test('help.html contains a development or coming-soon indicator for advanced features', () => {
  const content = fs.readFileSync(path.join(publicDir, 'help.html'), 'utf8');
  const lc = content.toLowerCase();
  assert.ok(
    lc.includes('development') || lc.includes('coming soon') || lc.includes('coming-soon') || lc.includes('in progress'),
    'help.html must indicate features under development'
  );
});

// ---------------------------------------------------------------------------
// Nginx config — extensionless URL routing
// ---------------------------------------------------------------------------

test('nginx.conf exists', () => {
  assert.ok(fs.existsSync(nginxConf), 'nginx.conf must exist');
});

test('nginx.conf contains $uri.html in try_files directive (extensionless URL routing)', () => {
  const content = fs.readFileSync(nginxConf, 'utf8');
  assert.match(content, /\$uri\.html/);
});

// ---------------------------------------------------------------------------
// index.html profile block invariant
// ---------------------------------------------------------------------------

test('index.html has data-ix-block="profile" element (profile block present in identity card HTML)', () => {
  assert.match(indexHtml, /data-ix-block="profile"/);
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
  }
}

if (failures.length) {
  for (const { name, err } of failures) {
    console.error('\nFAIL: ' + name);
    console.error('  ' + err.message);
  }
}

console.log('\n' + (passed + failed) + ' tests: ' + passed + ' passed, ' + failed + ' failed');

if (failed > 0) {
  process.exit(1);
}
