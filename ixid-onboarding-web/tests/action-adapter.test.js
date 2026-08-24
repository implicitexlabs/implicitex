'use strict';

// action-adapter.test.js — adapter boundary tests for Slice G
//
// Covers all cases in the lane required_test_matrix:
//   1.  applyActionCode success
//   2.  applyActionCode Firebase rejection
//   3.  verifyPasswordResetCode success
//   4.  verifyPasswordResetCode Firebase rejection (security gate — form must not appear)
//   5.  confirmPasswordReset success
//   6.  confirmPasswordReset Firebase rejection
//   7.  invalid mode (pre-adapter check — adapter never called)
//   8.  missing oobCode (pre-adapter check — adapter never called)
//   9.  invalid oobCode / whitespace (pre-adapter check — adapter never called)
//  10.  missing continueUrl (pre-adapter check — adapter never called)
//  11.  mismatched continueUrl (pre-adapter check — adapter never called)
//  12.  no secret leakage (source audit + runtime error content check)
//
// All tests use mocked fetch. Zero real network calls are made.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const adapterSource = read('public/action-adapter.js');
const actionSource = read('public/action.js');

// Load action-adapter.js factory into an isolated sandbox.
// module.exports receives createIxIdActionAdapter(config, fetchFn).
const adapterSandbox = { module: { exports: {} } };
vm.runInNewContext(adapterSource, adapterSandbox);
const createIxIdActionAdapter = adapterSandbox.module.exports;

// Load action.js API into a separate isolated sandbox.
const actionSandbox = { module: { exports: {} }, URL: URL };
vm.runInNewContext(actionSource, actionSandbox);
const actionApi = actionSandbox.module.exports;

// Test configuration with a recognizable sentinel key.
const TEST_CONFIG = Object.freeze({
  actionContinueUrl: actionApi.ALLOWED_CONTINUE_URL,
  firebase: Object.freeze({ options: Object.freeze({ apiKey: 'test-sentinel-api-key' }) }),
});

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ─── Fetch mock helpers ───────────────────────────────────────────────────────

// Creates a fetch mock from a sequence of response descriptors.
// { ok: true }  → HTTP 200 response
// { ok: false } → HTTP 400 response (triggers adapter error throw)
// { throws: true } → network-level failure (fetch() itself throws)
function makeFetch(responses) {
  const queue = responses.slice();
  const calls = [];
  function mockFetch(url, init) {
    const descriptor = queue.shift() || { ok: true };
    calls.push({ url: url, body: init && init.body });
    if (descriptor.throws) return Promise.reject(new Error('simulated-network-failure'));
    return Promise.resolve({ ok: descriptor.ok !== false });
  }
  mockFetch.calls = calls;
  return mockFetch;
}

// A fetch that fails loudly if called — used to prove adapter is never invoked.
function neverFetch(url) {
  throw new Error('fetch must not be called, but was called with: ' + url);
}

// ─── DOM / environment helpers ────────────────────────────────────────────────

class FakeElement {
  constructor(id, events) {
    this.id = id;
    this.events = events;
    this.hidden = false;
    this.value = '';
    this.disabled = false;
    this.valid = true;
    this.focused = false;
    this.attributes = {};
    this.listeners = {};
    this._textContent = '';
  }

  get textContent() { return this._textContent; }
  set textContent(v) { this._textContent = String(v); this.events.push({ type: 'render', id: this.id }); }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }
  dispatch(type, extraEvent) {
    const event = Object.assign({ currentTarget: this, preventDefault: function() {} }, extraEvent || {});
    (this.listeners[type] || []).forEach(function invoke(listener) { listener(event); });
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  reportValidity() { return this.valid; }
  focus() { this.focused = true; this.events.push({ type: 'focus', id: this.id }); }
}

function createEnv(urlString, adapter) {
  const events = [];
  const elementIds = [
    'action-heading', 'action-status', 'action-error',
    'reset-password-form', 'reset-password', 'reset-submit', 'reset-cancel',
  ];
  const elements = {};
  elementIds.forEach(function(id) { elements[id] = new FakeElement(id, events); });
  elements['reset-password-form'].hidden = true;

  const rootListeners = {};
  const pageRoot = {
    requestAnimationFrame: function(cb) { cb(); },
    addEventListener: function(type, listener) {
      if (!rootListeners[type]) rootListeners[type] = [];
      rootListeners[type].push(listener);
    },
  };

  return {
    elements: elements,
    events: events,
    rootListeners: rootListeners,
    settings: {
      root: pageRoot,
      document: { getElementById: function(id) { return elements[id] || null; } },
      location: { href: urlString, assign: function(dest) { events.push({ type: 'navigate', destination: dest }); } },
      history: { replaceState: function(_s, _t, dest) { events.push({ type: 'history', destination: dest }); } },
      config: TEST_CONFIG,
      adapter: adapter,
    },
  };
}

function actionUrl(mode, changes) {
  const values = Object.assign({ mode: mode, oobCode: 'sample-code', continueUrl: actionApi.ALLOWED_CONTINUE_URL }, changes || {});
  const params = new URLSearchParams();
  Object.keys(values).forEach(function(key) {
    const v = values[key];
    if (v === null) return;
    if (Array.isArray(v)) v.forEach(function(item) { params.append(key, item); });
    else params.set(key, v);
  });
  return 'https://app.ixid.me/auth/action?' + params.toString();
}

function navigateEvents(env) {
  return env.events.filter(function(e) { return e.type === 'navigate'; });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

// 1. applyActionCode success
test('applyActionCode: verifyEmail action completes and navigates to ALLOWED_CONTINUE_URL', async () => {
  const fetchMock = makeFetch([{ ok: true }]);
  const adapter = createIxIdActionAdapter(TEST_CONFIG, fetchMock);
  const env = createEnv(actionUrl('verifyEmail'), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'success');
  assert.equal(fetchMock.calls.length, 1, 'fetch called exactly once');
  assert.ok(fetchMock.calls[0].url.includes('/accounts:update'), 'correct endpoint');
  assert.ok(fetchMock.calls[0].url.includes('test-sentinel-api-key'), 'apiKey in query string');
  assert.ok(fetchMock.calls[0].body.includes('"oobCode"'), 'oobCode in request body');
  assert.ok(!fetchMock.calls[0].url.includes('sample-code'), 'oobCode not in URL');
  assert.equal(navigateEvents(env).length, 1, 'one navigation');
  assert.equal(navigateEvents(env)[0].destination, actionApi.ALLOWED_CONTINUE_URL);
});

// 2. applyActionCode Firebase rejection
test('applyActionCode: Firebase rejection → fail closed, no redirect, generic error shown', async () => {
  const fetchMock = makeFetch([{ ok: false }]);
  const adapter = createIxIdActionAdapter(TEST_CONFIG, fetchMock);
  const env = createEnv(actionUrl('verifyEmail'), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'failed');
  assert.equal(fetchMock.calls.length, 1, 'fetch called once');
  assert.equal(navigateEvents(env).length, 0, 'no navigation on failure');
  assert.ok(env.elements['action-error'].textContent.length > 0, 'error message shown');
  assert.doesNotMatch(env.elements['action-error'].textContent, /sample-code|firebase|raw/i,
    'error message contains no raw code or backend detail');
});

// 3. verifyPasswordResetCode success (pre-verification gate passes → form shown)
test('verifyPasswordResetCode: pre-verification passes, password form becomes visible', async () => {
  // verifyPasswordResetCode is called first; confirmPasswordReset will be called after form submit.
  const fetchMock = makeFetch([{ ok: true }, { ok: true }]);
  const adapter = createIxIdActionAdapter(TEST_CONFIG, fetchMock);
  const env = createEnv(actionUrl('resetPassword'), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'awaiting-reset', 'page waits for password entry after pre-verification');
  assert.equal(env.elements['reset-password-form'].hidden, false, 'password form is visible');
  assert.equal(fetchMock.calls.length, 1, 'only verifyPasswordResetCode called so far');
  assert.ok(fetchMock.calls[0].url.includes('/accounts:resetPassword'), 'correct endpoint');
  assert.ok(fetchMock.calls[0].body.includes('"oobCode"'), 'oobCode in body');
  assert.ok(!Object.prototype.hasOwnProperty.call(JSON.parse(fetchMock.calls[0].body), 'newPassword'),
    'newPassword not sent during pre-verification');
});

// 4. verifyPasswordResetCode Firebase rejection — SECURITY GATE
// This is the critical case: a failed pre-verification must prevent the form
// from appearing and must never invoke confirmPasswordReset.
test('verifyPasswordResetCode: Firebase rejection → password form never shown, no confirmPasswordReset call', async () => {
  const fetchMock = makeFetch([{ ok: false }]);
  const adapter = createIxIdActionAdapter(TEST_CONFIG, fetchMock);
  const env = createEnv(actionUrl('resetPassword'), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'failed');
  assert.equal(env.elements['reset-password-form'].hidden, true, 'password form must stay hidden');
  assert.equal(fetchMock.calls.length, 1, 'only the verification call was made');
  assert.ok(fetchMock.calls[0].url.includes('/accounts:resetPassword'), 'correct endpoint');
  // No second call (confirmPasswordReset) should occur
  assert.equal(fetchMock.calls.length, 1, 'confirmPasswordReset was not called');
  assert.ok(env.elements['action-error'].textContent.length > 0, 'error message shown');
  assert.doesNotMatch(env.elements['action-error'].textContent, /sample-code|firebase|raw/i,
    'error contains no raw code or backend detail');
  assert.equal(navigateEvents(env).length, 0, 'no navigation');
});

// 5. confirmPasswordReset success
test('confirmPasswordReset: password reset completes and navigates to ALLOWED_CONTINUE_URL', async () => {
  const fetchMock = makeFetch([{ ok: true }, { ok: true }]);
  const adapter = createIxIdActionAdapter(TEST_CONFIG, fetchMock);
  const env = createEnv(actionUrl('resetPassword'), adapter);

  const result = await actionApi.startActionPage(env.settings);
  assert.equal(result.status, 'awaiting-reset');

  env.elements['reset-password'].value = 'new-password-long-enough';
  const confirmation = await result.flow.submit();

  assert.equal(confirmation.status, 'success');
  assert.equal(fetchMock.calls.length, 2, 'verify + confirm calls');
  const confirmCall = fetchMock.calls[1];
  assert.ok(confirmCall.url.includes('/accounts:resetPassword'), 'correct endpoint');
  const confirmBody = JSON.parse(confirmCall.body);
  assert.ok(Object.prototype.hasOwnProperty.call(confirmBody, 'oobCode'), 'oobCode sent');
  assert.ok(Object.prototype.hasOwnProperty.call(confirmBody, 'newPassword'), 'newPassword sent');
  assert.ok(!confirmCall.url.includes('new-password'), 'newPassword not in URL');
  assert.equal(env.elements['reset-password'].value, '', 'password field cleared after submit');
  assert.equal(navigateEvents(env).length, 1, 'navigated after success');
  assert.equal(navigateEvents(env)[0].destination, actionApi.ALLOWED_CONTINUE_URL);
});

// 6. confirmPasswordReset Firebase rejection
test('confirmPasswordReset: Firebase rejection → fail closed, error shown, no redirect, password cleared', async () => {
  const fetchMock = makeFetch([{ ok: true }, { ok: false }]);
  const adapter = createIxIdActionAdapter(TEST_CONFIG, fetchMock);
  const env = createEnv(actionUrl('resetPassword'), adapter);

  const result = await actionApi.startActionPage(env.settings);
  assert.equal(result.status, 'awaiting-reset');

  env.elements['reset-password'].value = 'new-password-long-enough';
  const confirmation = await result.flow.submit();

  assert.equal(confirmation.status, 'failed');
  assert.equal(env.elements['reset-password'].value, '', 'password field cleared on failure');
  assert.equal(navigateEvents(env).length, 0, 'no navigation on failure');
  assert.ok(env.elements['action-error'].textContent.length > 0, 'error shown');
  assert.doesNotMatch(env.elements['action-error'].textContent, /sample-code|firebase|raw/i,
    'error contains no raw code or backend detail');
});

// 7. Invalid mode — adapter never called
test('invalid mode: action fails closed before adapter is invoked', async () => {
  const adapter = createIxIdActionAdapter(TEST_CONFIG, neverFetch);
  const env = createEnv(actionUrl('recoverEmail'), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'rejected');
  assert.equal(navigateEvents(env).length, 0);
});

// 8. Missing oobCode — adapter never called
test('missing oobCode: action fails closed before adapter is invoked', async () => {
  const adapter = createIxIdActionAdapter(TEST_CONFIG, neverFetch);
  const env = createEnv(actionUrl('verifyEmail', { oobCode: null }), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'rejected');
  assert.equal(navigateEvents(env).length, 0);
});

// 9. Invalid oobCode (whitespace) — adapter never called
test('oobCode with whitespace: action fails closed before adapter is invoked', async () => {
  const adapter = createIxIdActionAdapter(TEST_CONFIG, neverFetch);
  const env = createEnv(actionUrl('verifyEmail', { oobCode: 'code with spaces' }), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'rejected');
  assert.equal(navigateEvents(env).length, 0);
});

// 10. Missing continueUrl — adapter never called
test('missing continueUrl: action fails closed before adapter is invoked', async () => {
  const adapter = createIxIdActionAdapter(TEST_CONFIG, neverFetch);
  const env = createEnv(actionUrl('verifyEmail', { continueUrl: null }), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'rejected');
  assert.equal(navigateEvents(env).length, 0);
});

// 11. Mismatched continueUrl — adapter never called
test('mismatched continueUrl: action fails closed before adapter is invoked', async () => {
  const adapter = createIxIdActionAdapter(TEST_CONFIG, neverFetch);
  const env = createEnv(actionUrl('verifyEmail', { continueUrl: 'https://attacker.example.com' }), adapter);

  const result = await actionApi.startActionPage(env.settings);

  assert.equal(result.status, 'rejected');
  assert.equal(navigateEvents(env).length, 0);
});

// 12. No secret leakage — source audit and runtime error content
test('no secret leakage: adapter source contains no console calls; errors expose no oobCode or passwords', async () => {
  // Source audit: no console.log / console.error / console.warn in adapter
  assert.doesNotMatch(adapterSource, /console\s*\./,
    'adapter source must contain no console calls');

  // The oobCode must not appear in the URL (only in request body)
  const fetchMock = makeFetch([{ ok: true }]);
  const adapter = createIxIdActionAdapter(TEST_CONFIG, fetchMock);
  const env = createEnv(actionUrl('verifyEmail', { oobCode: 'SENTINEL-CODE-12345' }), adapter);

  await actionApi.startActionPage(env.settings);

  assert.ok(fetchMock.calls.length === 1);
  assert.ok(!fetchMock.calls[0].url.includes('SENTINEL-CODE-12345'),
    'oobCode must not appear in fetch URL');
  assert.ok(fetchMock.calls[0].body.includes('SENTINEL-CODE-12345'),
    'oobCode travels in request body only');

  // Runtime error on rejection must not contain the sentinel code
  const failFetch = makeFetch([{ ok: false }]);
  const failAdapter = createIxIdActionAdapter(TEST_CONFIG, failFetch);
  const failEnv = createEnv(actionUrl('verifyEmail', { oobCode: 'SENTINEL-CODE-12345' }), failAdapter);

  await actionApi.startActionPage(failEnv.settings);

  assert.doesNotMatch(failEnv.elements['action-error'].textContent, /SENTINEL-CODE-12345/,
    'oobCode must not appear in user-visible error content');

  // Password must not appear in the URL during confirmPasswordReset
  const pwFetch = makeFetch([{ ok: true }, { ok: true }]);
  const pwAdapter = createIxIdActionAdapter(TEST_CONFIG, pwFetch);
  const pwEnv = createEnv(actionUrl('resetPassword'), pwAdapter);
  const pwResult = await actionApi.startActionPage(pwEnv.settings);
  pwEnv.elements['reset-password'].value = 'SENTINEL-PASSWORD-XYZ99';
  await pwResult.flow.submit();
  assert.ok(!pwFetch.calls[1].url.includes('SENTINEL-PASSWORD-XYZ99'),
    'newPassword must not appear in fetch URL');
});

// ─── Runner ───────────────────────────────────────────────────────────────────

(async function runTests() {
  let passed = 0;
  const failures = [];
  for (const entry of tests) {
    try { await entry.fn(); passed += 1; } catch (error) { failures.push({ name: entry.name, error: error }); }
  }
  failures.forEach((failure) => {
    process.stderr.write('\nFAIL: ' + failure.name + '\n' + failure.error.stack + '\n');
  });
  process.stdout.write('\n' + tests.length + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) process.exitCode = 1;
}());
