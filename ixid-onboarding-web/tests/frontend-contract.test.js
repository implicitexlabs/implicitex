'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('public/index.html');
const css = read('public/register.css');
const register = read('public/register.js');
const core = read('public/onboarding-core.js');
const firebase = read('public/firebase-auth-adapter.js');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('functional UI contains semantic forms, labels, live errors, and focus targets', () => {
  for (const id of ['signup-form', 'signin-form', 'reset-form', 'handle-form']) {
    assert.match(html, new RegExp('<form id="' + id + '"'));
  }
  for (const target of ['signup-email', 'signup-password', 'signin-email', 'signin-password', 'handle-input']) {
    assert.match(html, new RegExp('<label for="' + target + '"'));
  }
  assert.match(html, /role="alert" aria-live="polite"/);
  assert.match(html, /tabindex="-1"/);
  assert.match(register, /requestAnimationFrame/);
});

test('320px responsive and minimum touch-target requirements are encoded', () => {
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /min-width:\s*44px/);
  assert.match(css, /@media \(max-width: 620px\)/);
});

test('public configuration is disabled and contains no production Firebase values', () => {
  const sandbox = {};
  vm.runInNewContext(read('public/config.js'), sandbox);
  assert.equal(sandbox.IXID_ONBOARDING_CONFIG.enabled, false);
  assert.equal(sandbox.IXID_ONBOARDING_CONFIG.firebase.options, null);
  assert.equal(sandbox.IXID_ONBOARDING_CONFIG.holderApiBase, '/api/holder/v0.1');
});

test('auth material is not written to browser storage by application code', () => {
  const source = [register, core, firebase].join('\n');
  assert.doesNotMatch(source, /(?:window|root|globalThis)\.localStorage/);
  assert.doesNotMatch(source, /(?:window|root|globalThis)\.sessionStorage/);
  assert.doesNotMatch(source, /(?:window|root|globalThis)\.indexedDB/);
  assert.match(firebase, /inMemoryPersistence/);
});

test('Slice E does not implement Slice F action-code behavior', () => {
  const source = [register, core, firebase].join('\n');
  assert.doesNotMatch(source, /applyActionCode|verifyPasswordResetCode|confirmPasswordReset/);
});

test('no handle availability probe exists in client or API adapter', () => {
  const source = [register, core, read('public/holder-api-client.js')].join('\n');
  assert.doesNotMatch(source, /checkAvailability|availability(?:\/|\?)/i);
});

test('CSP permits only same-origin application code plus pinned Firebase module origin', () => {
  assert.match(html, /script-src 'self' https:\/\/www\.gstatic\.com/);
  assert.match(html, /connect-src 'self' https:\/\/identitytoolkit\.googleapis\.com https:\/\/securetoken\.googleapis\.com/);
  assert.doesNotMatch(html, /unsafe-inline/);
});

let passed = 0;
const failures = [];
for (const entry of tests) {
  try { entry.fn(); passed += 1; } catch (error) { failures.push({ name: entry.name, error }); }
}
failures.forEach((failure) => {
  process.stderr.write('\nFAIL: ' + failure.name + '\n' + failure.error.stack + '\n');
});
process.stdout.write('\n' + passed + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n');
if (failures.length) process.exitCode = 1;
