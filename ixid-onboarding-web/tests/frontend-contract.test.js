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
const holder = read('public/holder-api-client.js');
const config = read('public/config.js');
const actionHtml = read('public/action.html');
const action = read('public/action.js');

const actionSandbox = { module: { exports: {} }, URL: URL };
vm.runInNewContext(action, actionSandbox);
const actionApi = actionSandbox.module.exports;

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

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

  set textContent(value) {
    this._textContent = String(value);
    this.events.push({ type: 'render', id: this.id });
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  dispatch(type) {
    const event = { currentTarget: this, preventDefault: function preventDefault() {} };
    (this.listeners[type] || []).forEach(function invoke(listener) { listener(event); });
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }

  getAttribute(name) { return this.attributes[name]; }

  reportValidity() { return this.valid; }

  focus() {
    this.focused = true;
    this.events.push({ type: 'focus', id: this.id });
  }
}

function createAdapter(events, overrides) {
  const custom = overrides || {};
  return {
    applyActionCode: custom.applyActionCode || (async function applyActionCode() {
      events.push({ type: 'adapter', method: 'applyActionCode' });
    }),
    verifyPasswordResetCode: custom.verifyPasswordResetCode
      || (async function verifyPasswordResetCode() {
        events.push({ type: 'adapter', method: 'verifyPasswordResetCode' });
      }),
    confirmPasswordReset: custom.confirmPasswordReset
      || (async function confirmPasswordReset() {
        events.push({ type: 'adapter', method: 'confirmPasswordReset' });
      }),
  };
}

function createActionEnvironment(url, adapter, configOverride) {
  const events = [];
  const elementIds = [
    'action-heading', 'action-status', 'action-error', 'reset-password-form',
    'reset-password', 'reset-submit', 'reset-cancel',
  ];
  const elements = {};
  elementIds.forEach(function makeElement(id) { elements[id] = new FakeElement(id, events); });
  elements['reset-password-form'].hidden = true;
  const rootListeners = {};
  const pageRoot = {
    requestAnimationFrame: function requestAnimationFrame(callback) { callback(); },
    addEventListener: function addEventListener(type, listener) {
      if (!rootListeners[type]) rootListeners[type] = [];
      rootListeners[type].push(listener);
    },
  };
  const location = {
    href: url,
    assign: function assign(destination) { events.push({ type: 'navigate', destination: destination }); },
  };
  const history = {
    replaceState: function replaceState(_state, _title, destination) {
      events.push({ type: 'history', destination: destination });
    },
  };
  const trustedConfig = configOverride || {
    actionContinueUrl: actionApi.ALLOWED_CONTINUE_URL,
    firebase: { options: { apiKey: 'trusted-local-key' } },
  };
  return {
    adapter: adapter || createAdapter(events),
    elements: elements,
    events: events,
    rootListeners: rootListeners,
    settings: {
      root: pageRoot,
      document: { getElementById: function getElementById(id) { return elements[id] || null; } },
      location: location,
      history: history,
      config: trustedConfig,
      adapter: adapter || createAdapter(events),
    },
  };
}

function actionUrl(mode, changes) {
  const values = Object.assign({
    mode: mode,
    oobCode: 'sample-action-code',
    continueUrl: actionApi.ALLOWED_CONTINUE_URL,
  }, changes || {});
  const params = new URLSearchParams();
  Object.keys(values).forEach(function addValue(key) {
    const value = values[key];
    if (value === null) return;
    if (Array.isArray(value)) value.forEach(function addItem(item) { params.append(key, item); });
    else params.set(key, value);
  });
  return 'https://onboarding.ixid.me/auth/action?' + params.toString() + '#discarded';
}

function adapterEvents(environment) {
  return environment.events.filter(function isAdapter(event) { return event.type === 'adapter'; });
}

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

test('public configuration is enabled and contains required Firebase options', () => {
  const sandbox = {};
  vm.runInNewContext(config, sandbox);
  assert.equal(sandbox.IXID_ONBOARDING_CONFIG.enabled, true);
  assert.equal(sandbox.IXID_ONBOARDING_CONFIG.holderApiBase, '/api/holder/v0.1');
  const opts = sandbox.IXID_ONBOARDING_CONFIG.firebase.options;
  assert.ok(opts, 'firebase.options must be populated');
  assert.ok(opts.apiKey, 'apiKey required');
  assert.ok(opts.authDomain, 'authDomain required');
  assert.ok(opts.projectId, 'projectId required');
  assert.ok(opts.appId, 'appId required');
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
  const source = [register, core, holder].join('\n');
  assert.doesNotMatch(source, /checkAvailability|availability(?:\/|\?)/i);
});

test('CSP permits only same-origin application code plus pinned Firebase module origin', () => {
  assert.match(html, /script-src 'self' https:\/\/www\.gstatic\.com/);
  assert.match(html, /connect-src 'self' https:\/\/identitytoolkit\.googleapis\.com https:\/\/securetoken\.googleapis\.com/);
  assert.doesNotMatch(html, /unsafe-inline/);
});

test('action page preserves CSP, privacy, same-origin assets, and accessible reset controls', () => {
  assert.match(actionHtml, /<meta name="referrer" content="no-referrer">/);
  assert.match(actionHtml, /script-src 'self';/);
  assert.match(actionHtml, /<script src="config\.js"><\/script>/);
  assert.match(actionHtml, /<script src="action\.js"><\/script>/);
  assert.doesNotMatch(actionHtml, /firebase-auth-adapter\.js/);
  assert.doesNotMatch(actionHtml, /<script[^>]+src="https?:/);
  assert.match(actionHtml, /<form id="reset-password-form" hidden novalidate>/);
  assert.match(actionHtml, /<label for="reset-password">/);
  assert.match(actionHtml, /id="action-status" role="status" aria-live="polite"/);
  assert.match(actionHtml, /id="action-error" role="alert" aria-live="assertive"/);
  assert.match(actionHtml, /id="action-heading" tabindex="-1"/);
});

test('history is cleaned synchronously before validation, rendering, adapter work, or navigation', async () => {
  const environment = createActionEnvironment(actionUrl('verifyEmail'));
  const pending = actionApi.startActionPage(environment.settings);
  assert.deepEqual(environment.events, [{ type: 'history', destination: '/auth/action' }]);
  const result = await pending;
  assert.equal(result.status, 'success');
  assert.equal(environment.events[0].type, 'history');
  assert.doesNotMatch(environment.events[0].destination, /[?#]/);
  const adapterIndex = environment.events.findIndex(function find(event) { return event.type === 'adapter'; });
  const renderIndex = environment.events.findIndex(function find(event) { return event.type === 'render'; });
  assert.ok(adapterIndex > 0);
  assert.ok(renderIndex > 0);
});

test('invalid, missing, malformed, and differently cased modes or codes make zero adapter calls', async () => {
  const urls = [
    actionUrl(null),
    actionUrl(''),
    actionUrl('VerifyEmail'),
    actionUrl('verifyemail'),
    actionUrl('recoverEmail'),
    actionUrl(['verifyEmail', 'resetPassword']),
    actionUrl('verifyEmail', { oobCode: null }),
    actionUrl('verifyEmail', { oobCode: '' }),
    actionUrl('verifyEmail', { oobCode: '   ' }),
    actionUrl('verifyEmail', { oobCode: 'code with whitespace' }),
    actionUrl('verifyEmail', { oobCode: ['one', 'two'] }),
  ];
  for (const url of urls) {
    const environment = createActionEnvironment(url);
    const result = await actionApi.startActionPage(environment.settings);
    assert.equal(result.status, 'rejected');
    assert.equal(adapterEvents(environment).length, 0);
    assert.equal(environment.elements['reset-password-form'].hidden, true);
    assert.equal(environment.elements['action-error'].textContent,
      'This action link is invalid or has expired.');
  }
});

test('caller apiKey mismatch fails before adapter invocation and a matching key is not backend selection', async () => {
  const rejected = createActionEnvironment(actionUrl('verifyEmail', { apiKey: 'caller-key' }));
  const rejectedResult = await actionApi.startActionPage(rejected.settings);
  assert.equal(rejectedResult.status, 'rejected');
  assert.equal(adapterEvents(rejected).length, 0);

  const accepted = createActionEnvironment(actionUrl('verifyEmail', { apiKey: 'trusted-local-key' }));
  const acceptedAdapter = accepted.settings.adapter;
  const acceptedResult = await actionApi.startActionPage(accepted.settings);
  assert.equal(acceptedResult.status, 'success');
  assert.equal(accepted.settings.adapter, acceptedAdapter);
  assert.deepEqual(adapterEvents(accepted).map(function method(event) { return event.method; }),
    ['applyActionCode']);
});

test('any continueUrl parameter is ignored — action proceeds and navigates only to ALLOWED_CONTINUE_URL', async () => {
  // The continueUrl URL parameter is silently ignored. Absent, mismatched, or
  // attacker-controlled values do not block the action. Navigation is always to
  // ALLOWED_CONTINUE_URL, so no open redirect is possible.
  const destinations = [
    'http://app.ixid.me/register',
    'https://evil.example/register',
    'https://app.ixid.me:443/register',
    'https://app.ixid.me/register/',
    'https://app.ixid.me/register?next=elsewhere',
    'https://app.ixid.me/register#fragment',
    'https://user@app.ixid.me/register',
    'https://app.ixid.me.evil.example/register',
    'https://app.ixid.me/%72egister',
  ];
  for (const destination of destinations) {
    const environment = createActionEnvironment(actionUrl('verifyEmail', { continueUrl: destination }));
    const result = await actionApi.startActionPage(environment.settings);
    assert.equal(result.status, 'success', 'action proceeds regardless of continueUrl value');
    assert.equal(adapterEvents(environment).length, 1, 'adapter was invoked');
    const navigations = environment.events.filter(function navigated(event) { return event.type === 'navigate'; });
    assert.equal(navigations.length, 1, 'exactly one navigation');
    assert.equal(navigations[0].destination, actionApi.ALLOWED_CONTINUE_URL,
      'navigation is always to ALLOWED_CONTINUE_URL, never to: ' + destination);
  }
});

test('email verification succeeds only through the injected adapter and navigates to the exact allowlist', async () => {
  const events = [];
  const adapter = createAdapter(events, {
    applyActionCode: async function applyActionCode() {
      events.push({ type: 'adapter', method: 'applyActionCode' });
    },
  });
  const environment = createActionEnvironment(actionUrl('verifyEmail'), adapter);
  adapter.applyActionCode = async function applyActionCode() {
    environment.events.push({ type: 'adapter', method: 'applyActionCode' });
  };
  const result = await actionApi.startActionPage(environment.settings);
  assert.equal(result.status, 'success');
  assert.deepEqual(adapterEvents(environment).map(function method(event) { return event.method; }),
    ['applyActionCode']);
  const navigation = environment.events.find(function find(event) { return event.type === 'navigate'; });
  assert.equal(navigation.destination, actionApi.ALLOWED_CONTINUE_URL);
});

test('email verification failure exposes only a generic safe error', async () => {
  const environment = createActionEnvironment(actionUrl('verifyEmail'));
  environment.settings.adapter.applyActionCode = async function applyActionCode() {
    environment.events.push({ type: 'adapter', method: 'applyActionCode' });
    throw new Error('raw-provider-detail');
  };
  const result = await actionApi.startActionPage(environment.settings);
  assert.equal(result.status, 'failed');
  assert.equal(environment.elements['action-error'].textContent,
    'This action link is invalid or has expired.');
  assert.doesNotMatch(environment.elements['action-error'].textContent, /provider|detail/i);
  assert.equal(environment.events.some(function navigated(event) { return event.type === 'navigate'; }), false);
});

test('reset code is preverified before form exposure and valid confirmation clears the password', async () => {
  const environment = createActionEnvironment(actionUrl('resetPassword'));
  const result = await actionApi.startActionPage(environment.settings);
  assert.equal(result.status, 'awaiting-reset');
  assert.deepEqual(adapterEvents(environment).map(function method(event) { return event.method; }),
    ['verifyPasswordResetCode']);
  assert.equal(environment.elements['reset-password-form'].hidden, false);
  assert.equal(environment.elements['reset-password'].focused, true);

  environment.elements['reset-password'].value = 'short';
  const invalidResult = await result.flow.submit();
  assert.equal(invalidResult.status, 'invalid-password');
  assert.equal(adapterEvents(environment).some(function confirmed(event) {
    return event.method === 'confirmPasswordReset';
  }), false);

  environment.elements['reset-password'].value = 'synthetic-long-password';
  const confirmation = await result.flow.submit();
  assert.equal(confirmation.status, 'success');
  assert.equal(environment.elements['reset-password'].value, '');
  assert.deepEqual(adapterEvents(environment).map(function method(event) { return event.method; }),
    ['verifyPasswordResetCode', 'confirmPasswordReset']);
  const navigation = environment.events.find(function find(event) { return event.type === 'navigate'; });
  assert.equal(navigation.destination, actionApi.ALLOWED_CONTINUE_URL);
});

test('failed reset preverification never exposes the password form or confirms a password', async () => {
  const environment = createActionEnvironment(actionUrl('resetPassword'));
  environment.settings.adapter.verifyPasswordResetCode = async function verifyPasswordResetCode() {
    environment.events.push({ type: 'adapter', method: 'verifyPasswordResetCode' });
    throw new Error('raw-reset-detail');
  };
  const result = await actionApi.startActionPage(environment.settings);
  assert.equal(result.status, 'failed');
  assert.equal(environment.elements['reset-password-form'].hidden, true);
  assert.deepEqual(adapterEvents(environment).map(function method(event) { return event.method; }),
    ['verifyPasswordResetCode']);
  assert.equal(environment.elements['action-error'].textContent,
    'This action link is invalid or has expired.');
});

test('failed reset confirmation clears password material and exposes no raw error', async () => {
  const environment = createActionEnvironment(actionUrl('resetPassword'));
  environment.settings.adapter.confirmPasswordReset = async function confirmPasswordReset() {
    environment.events.push({ type: 'adapter', method: 'confirmPasswordReset' });
    throw new Error('raw-confirmation-detail');
  };
  const result = await actionApi.startActionPage(environment.settings);
  environment.elements['reset-password'].value = 'synthetic-long-password';
  const confirmation = await result.flow.submit();
  assert.equal(confirmation.status, 'failed');
  assert.equal(environment.elements['reset-password'].value, '');
  assert.equal(environment.elements['action-error'].textContent,
    'The password could not be reset. Request a new link and try again.');
  assert.doesNotMatch(environment.elements['action-error'].textContent, /confirmation|detail/i);
  assert.equal(environment.events.some(function navigated(event) { return event.type === 'navigate'; }), false);
});

test('cancel, reset, and page abandonment clear password values and prevent later confirmation', async () => {
  for (const abandonment of ['cancel', 'reset', 'pagehide']) {
    const environment = createActionEnvironment(actionUrl('resetPassword'));
    const result = await actionApi.startActionPage(environment.settings);
    environment.elements['reset-password'].value = 'synthetic-long-password';
    if (abandonment === 'cancel') environment.elements['reset-cancel'].dispatch('click');
    else if (abandonment === 'reset') environment.elements['reset-password-form'].dispatch('reset');
    else environment.rootListeners.pagehide[0]();
    assert.equal(environment.elements['reset-password'].value, '');
    assert.equal(environment.elements['reset-password-form'].hidden, true);
    const afterAbandonment = await result.flow.submit();
    assert.equal(afterAbandonment.status, 'unavailable');
    assert.deepEqual(adapterEvents(environment).map(function method(event) { return event.method; }),
      ['verifyPasswordResetCode']);
  }
});

test('in-flight abandonment clears the DOM value and suppresses navigation after settlement', async () => {
  let settleConfirmation;
  const environment = createActionEnvironment(actionUrl('resetPassword'));
  environment.settings.adapter.confirmPasswordReset = function confirmPasswordReset() {
    environment.events.push({ type: 'adapter', method: 'confirmPasswordReset' });
    return new Promise(function pending(resolve) { settleConfirmation = resolve; });
  };
  const result = await actionApi.startActionPage(environment.settings);
  environment.elements['reset-password'].value = 'synthetic-long-password';
  const pending = result.flow.submit();
  result.flow.abandon(false);
  assert.equal(environment.elements['reset-password'].value, '');
  settleConfirmation();
  const settled = await pending;
  assert.equal(settled.status, 'abandoned');
  assert.equal(environment.events.some(function navigated(event) { return event.type === 'navigate'; }), false);
});

test('workspace panel has IX ID display block, view link, and wallet address elements', () => {
  assert.match(html, /id="ix-id-block"/);
  assert.match(html, /id="workspace-identity"/);
  assert.match(html, /id="view-ix-id"/);
  assert.match(html, /id="workspace-no-id"/);
  assert.match(html, /id="wallet-address"/);
  // View link opens in new tab safely
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
  // Wallet address has accessible label
  assert.match(html, /aria-label="Connected wallet address on Polygon"/);
});

test('site footer links to ixid.me for legal/help docs and to implicitex.com', () => {
  // Legal and help pages live at ixid.me, not app.ixid.me.
  // app.ixid.me is the authenticated workspace only.
  assert.match(html, /class="site-footer"/);
  assert.match(html, /href="https:\/\/ixid\.me\/help"/);
  assert.match(html, /href="https:\/\/ixid\.me\/privacy"/);
  assert.match(html, /href="https:\/\/ixid\.me\/terms"/);
  assert.match(html, /href="https:\/\/implicitex\.com"/);
  // Legal files must not be served from the app.ixid.me origin
  assert.ok(!fs.existsSync(path.join(root, 'public/help.html')), 'help.html must not exist in onboarding public');
  assert.ok(!fs.existsSync(path.join(root, 'public/privacy.html')), 'privacy.html must not exist in onboarding public');
  assert.ok(!fs.existsSync(path.join(root, 'public/terms.html')), 'terms.html must not exist in onboarding public');
});

test('action implementation does not log or access persistent browser storage', async () => {
  assert.doesNotMatch(action, /console\s*\./);
  assert.doesNotMatch(action, /localStorage|sessionStorage|indexedDB|\bcaches\b|document\.cookie/);
  const environment = createActionEnvironment(actionUrl('verifyEmail'));
  let storageAccesses = 0;
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'caches']) {
    Object.defineProperty(environment.settings.root, name, {
      get: function getStorage() { storageAccesses += 1; return null; },
    });
  }
  await actionApi.startActionPage(environment.settings);
  assert.equal(storageAccesses, 0);
});

(async function runTests() {
  let passed = 0;
  const failures = [];
  for (const entry of tests) {
    try { await entry.fn(); passed += 1; } catch (error) { failures.push({ name: entry.name, error: error }); }
  }
  failures.forEach((failure) => {
    process.stderr.write('\nFAIL: ' + failure.name + '\n' + failure.error.stack + '\n');
  });
  process.stdout.write('\n' + passed + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) process.exitCode = 1;
}());
