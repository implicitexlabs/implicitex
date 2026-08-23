'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const {
  RATE_LIMIT_MESSAGE,
  STATES,
  createOnboardingController,
  validateHandle,
} = require(path.join(__dirname, '../public/onboarding-core.js'));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function response(status, body) { return { status, body: body || {} }; }
function user(verified) {
  return { uid: 'uid-1', email: 'holder@example.com', emailVerified: verified === true };
}

function harness(options) {
  const settings = options || {};
  const events = [];
  const renders = [];
  const ids = (settings.operationIds || ['op-1', 'op-2', 'op-3']).slice();
  const auth = Object.assign({
    subscribe: function subscribe() { return function unsubscribe() {}; },
    signUp: async function signUp(email) {
      events.push(['signUp', email]);
      return settings.user || user(false);
    },
    signIn: async function signIn(email) { events.push(['signIn', email]); },
    signOut: async function signOut() { events.push(['signOut']); },
    sendVerification: async function sendVerification(value) { events.push(['sendVerification', value.uid]); },
    sendPasswordReset: async function sendPasswordReset(email) { events.push(['sendPasswordReset', email]); },
    reload: async function reload(value) { events.push(['reload', value.uid]); },
    getIdToken: async function getIdToken(_value, force) {
      events.push(['token', force]);
      return force ? 'fresh-token' : 'current-token';
    },
    isEmailVerified: function isEmailVerified(value) { return Boolean(value && value.emailVerified === true); },
    getEmail: function getEmail(value) { return value ? value.email : ''; },
  }, settings.auth || {});
  const api = Object.assign({
    getWorkspace: async function getWorkspace(token) {
      events.push(['workspace', token]);
      return response(200, { account_state: 'ACTIVE', ix_ids: [] });
    },
    createAccount: async function createAccount(token, operationId) {
      events.push(['create', token, operationId]);
      return response(201, { account_id: 'account-1', account_state: 'ACTIVE', owned_ix_id: null });
    },
    registerIxId: async function registerIxId(token, operationId, handle) {
      events.push(['register', token, operationId, handle]);
      return response(201, { ix_id: handle, ix_id_state: 'ACTIVE' });
    },
  }, settings.api || {});
  const controller = createOnboardingController({
    auth,
    api,
    render: function render(snapshot) { renders.push(snapshot); },
    makeOperationId: function makeOperationId() {
      if (!ids.length) throw new Error('test operation ID queue exhausted');
      return ids.shift();
    },
    now: settings.now || (() => 100000),
  });
  return { auth, api, controller, events, renders };
}

test('handle validation canonicalizes and enforces the frozen format rules', () => {
  assert.deepEqual(validateHandle('Alice-1'), {
    canonical: 'alice-1', valid: true, code: null, message: '',
  });
  assert.equal(validateHandle('ab').code, 'TOO_SHORT');
  assert.equal(validateHandle('a'.repeat(31)).code, 'TOO_LONG');
  assert.equal(validateHandle('a_b').code, 'INVALID_CHARACTER');
  assert.equal(validateHandle('-abc').code, 'LEADING_HYPHEN');
  assert.equal(validateHandle('abc-').code, 'TRAILING_HYPHEN');
  assert.equal(validateHandle('a--b').code, 'CONSECUTIVE_HYPHENS');
});

test('unverified auth state performs zero Holder Authority calls', async () => {
  const h = harness();
  await h.controller.handleAuthState(user(false));
  assert.equal(h.controller.getSnapshot().state, STATES.EMAIL_UNVERIFIED);
  assert.equal(h.events.some((entry) => ['workspace', 'create', 'register'].includes(entry[0])), false);
  assert.deepEqual(h.events.filter((entry) => ['reload', 'token'].includes(entry[0])), [
    ['reload', 'uid-1'],
    ['token', true],
  ]);
});

test('verification email sends only from explicit signup, not auth-state re-entry', async () => {
  const h = harness();
  await h.controller.signUp('holder@example.com', 'a-secure-password');
  await h.controller.handleAuthState(user(false));
  assert.equal(h.events.filter((entry) => entry[0] === 'sendVerification').length, 1);
});

test('verification-send failure preserves the already-created unverified session', async () => {
  const h = harness({
    auth: {
      sendVerification: async function sendVerification() {
        h.events.push(['sendVerification']);
        throw new Error('mail unavailable');
      },
    },
  });
  await h.controller.signUp('holder@example.com', 'a-secure-password');
  assert.equal(h.controller.getSnapshot().state, STATES.EMAIL_UNVERIFIED);
  assert.match(h.controller.getSnapshot().message, /account was created/);
});

test('first workspace 401 refreshes and repeats GET but can never create an account', async () => {
  const replies = [
    response(401, { error: 'UNAUTHENTICATED' }),
    response(200, { account_state: 'ACTIVE', ix_ids: [{ ix_id: 'alice' }] }),
  ];
  const h = harness({
    api: {
      getWorkspace: async function getWorkspace(token) {
        h.events.push(['workspace', token]);
        return replies.shift();
      },
      createAccount: async function forbiddenCreate() {
        h.events.push(['create']);
        throw new Error('first 401 must not create');
      },
    },
  });
  await h.controller.handleAuthState(user(true));
  assert.deepEqual(h.events.filter((entry) => ['token', 'workspace', 'create'].includes(entry[0])), [
    ['token', false],
    ['workspace', 'current-token'],
    ['token', true],
    ['workspace', 'fresh-token'],
  ]);
  assert.equal(h.controller.getSnapshot().state, STATES.ACTIVE);
});

test('only a second workspace 401 permits guarded CREATE_ACCOUNT resolution', async () => {
  const replies = [response(401), response(401)];
  const h = harness({
    api: {
      getWorkspace: async function getWorkspace(token) {
        h.events.push(['workspace', token]);
        return replies.shift();
      },
      createAccount: async function createAccount(token, operationId) {
        h.events.push(['create', token, operationId]);
        return response(201, { account_id: 'a1', account_state: 'ACTIVE', owned_ix_id: null });
      },
    },
  });
  await h.controller.handleAuthState(user(true));
  assert.deepEqual(h.events.filter((entry) => ['workspace', 'create'].includes(entry[0])), [
    ['workspace', 'current-token'],
    ['workspace', 'fresh-token'],
    ['create', 'fresh-token', 'op-1'],
  ]);
  assert.equal(h.controller.getSnapshot().state, STATES.HANDLE_SELECTION);
});

test('second account-creation 401 clears the in-memory Firebase session', async () => {
  const h = harness({
    api: {
      getWorkspace: async function getWorkspace(token) {
        h.events.push(['workspace', token]);
        return response(401);
      },
      createAccount: async function createAccount(token, operationId) {
        h.events.push(['create', token, operationId]);
        return response(401);
      },
    },
  });
  await h.controller.handleAuthState(user(true));
  assert.deepEqual(h.events.filter((entry) => entry[0] === 'create'), [
    ['create', 'fresh-token', 'op-1'],
    ['create', 'fresh-token', 'op-1'],
  ]);
  assert.equal(h.controller.getSnapshot().state, STATES.UNAUTHENTICATED);
  assert.equal(h.events.filter((entry) => entry[0] === 'signOut').length, 1);
  await h.controller.retry();
  assert.equal(h.events.filter((entry) => entry[0] === 'create').length, 2);
});

test('returning active account bypasses handle selection', async () => {
  const h = harness({
    api: {
      getWorkspace: async () => response(200, {
        account_state: 'ACTIVE', ix_ids: [{ ix_id: 'alice' }],
      }),
    },
  });
  await h.controller.handleAuthState(user(true));
  assert.equal(h.controller.getSnapshot().state, STATES.ACTIVE);
  assert.equal(h.controller.getSnapshot().workspace.ix_ids[0].ix_id, 'alice');
});

test('SUSPENDED account renders read-only and never registers', async () => {
  const h = harness({
    api: {
      getWorkspace: async () => response(200, { account_state: 'SUSPENDED', ix_ids: [] }),
      registerIxId: async function forbiddenRegister() { throw new Error('must not register'); },
    },
  });
  await h.controller.handleAuthState(user(true));
  assert.equal(h.controller.getSnapshot().state, STATES.ACTIVE);
  assert.equal(h.controller.getSnapshot().suspended, true);
  assert.equal(h.events.some((entry) => entry[0] === 'register'), false);
});

test('403 workspace denial reaches ACCESS_DENIED_ERROR', async () => {
  const h = harness({ api: { getWorkspace: async () => response(403, { error: 'ACCESS_DENIED' }) } });
  await h.controller.handleAuthState(user(true));
  assert.equal(h.controller.getSnapshot().state, STATES.ACCESS_DENIED_ERROR);
});

test('409 and 422 remain distinct without a preflight availability call', async () => {
  const replies = [
    response(409, { error: 'HANDLE_UNAVAILABLE' }),
    response(422, { error: 'HANDLE_RESERVED' }),
  ];
  const h = harness({
    operationIds: ['op-a', 'op-b'],
    api: {
      getWorkspace: async () => response(200, { account_state: 'ACTIVE', ix_ids: [] }),
      registerIxId: async function registerIxId(token, operationId, handle) {
        h.events.push(['register', token, operationId, handle]);
        return replies.shift();
      },
    },
  });
  await h.controller.handleAuthState(user(true));
  await h.controller.submitHandle('taken');
  assert.match(h.controller.getSnapshot().handleError, /not available/);
  await h.controller.submitHandle('reserved');
  assert.match(h.controller.getSnapshot().handleError, /reserved/);
  assert.equal(Object.hasOwn(h.api, 'checkAvailability'), false);
});

test('uncertain REGISTER waits for explicit retry and preserves the same operation ID', async () => {
  let calls = 0;
  const h = harness({
    operationIds: ['stable-op'],
    api: {
      getWorkspace: async () => response(200, { account_state: 'ACTIVE', ix_ids: [] }),
      registerIxId: async function registerIxId(token, operationId, handle) {
        h.events.push(['register', token, operationId, handle]);
        calls += 1;
        if (calls === 1) throw new Error('uncertain network result');
        return response(200, { ix_id: handle, ix_id_state: 'ACTIVE' });
      },
    },
  });
  await h.controller.handleAuthState(user(true));
  await h.controller.submitHandle('alice');
  assert.equal(h.controller.getSnapshot().retryAvailable, true);
  assert.equal(h.events.filter((entry) => entry[0] === 'register').length, 1);
  await h.controller.retry();
  assert.deepEqual(h.events.filter((entry) => entry[0] === 'register').map((entry) => entry[2]), [
    'stable-op', 'stable-op',
  ]);
  assert.equal(h.controller.getSnapshot().state, STATES.ACTIVE);
});

test('uncertain CREATE_ACCOUNT waits for explicit retry and preserves the same operation ID', async () => {
  let workspaceCalls = 0;
  let createCalls = 0;
  const h = harness({
    operationIds: ['stable-create-op'],
    api: {
      getWorkspace: async function getWorkspace(token) {
        h.events.push(['workspace', token]);
        workspaceCalls += 1;
        return response(401);
      },
      createAccount: async function createAccount(token, operationId) {
        h.events.push(['create', token, operationId]);
        createCalls += 1;
        if (createCalls === 1) throw new Error('uncertain network result');
        return response(200, { account_id: 'a1', account_state: 'ACTIVE', owned_ix_id: null });
      },
    },
  });
  await h.controller.handleAuthState(user(true));
  assert.equal(workspaceCalls, 2);
  assert.equal(h.controller.getSnapshot().retryAvailable, true);
  assert.equal(h.events.filter((entry) => entry[0] === 'create').length, 1);
  await h.controller.retry();
  assert.deepEqual(h.events.filter((entry) => entry[0] === 'create').map((entry) => entry[2]), [
    'stable-create-op', 'stable-create-op',
  ]);
  assert.equal(h.controller.getSnapshot().state, STATES.HANDLE_SELECTION);
});

test('changing handle after uncertainty creates a new logical operation ID', async () => {
  let calls = 0;
  const h = harness({
    operationIds: ['first-op', 'second-op'],
    api: {
      getWorkspace: async () => response(200, { account_state: 'ACTIVE', ix_ids: [] }),
      registerIxId: async function registerIxId(token, operationId, handle) {
        h.events.push(['register', token, operationId, handle]);
        calls += 1;
        if (calls === 1) throw new Error('uncertain network result');
        return response(201, { ix_id: handle, ix_id_state: 'ACTIVE' });
      },
    },
  });
  await h.controller.handleAuthState(user(true));
  await h.controller.submitHandle('alice');
  h.controller.setHandleInput('bob');
  await h.controller.submitHandle('bob');
  assert.deepEqual(h.events.filter((entry) => entry[0] === 'register').map((entry) => entry[2]), [
    'first-op', 'second-op',
  ]);
});

test('429 presents the frozen rate-limit message and remains retryable', async () => {
  const h = harness({
    api: { getWorkspace: async () => response(429, { error: 'RATE_LIMITED' }) },
  });
  await h.controller.handleAuthState(user(true));
  assert.equal(h.controller.getSnapshot().message, RATE_LIMIT_MESSAGE);
  assert.equal(h.controller.getSnapshot().retryAvailable, true);
});

test('password reset response does not enumerate account existence', async () => {
  const h = harness({
    auth: { sendPasswordReset: async function failReset() { throw new Error('unknown account'); } },
  });
  await h.controller.requestPasswordReset('missing@example.com');
  assert.match(h.controller.getSnapshot().message, /If an account exists/);
});

(async function run() {
  let passed = 0;
  const failures = [];
  for (const entry of tests) {
    try {
      await entry.fn();
      passed += 1;
    } catch (error) {
      failures.push({ name: entry.name, error });
    }
  }
  failures.forEach((failure) => {
    process.stderr.write('\nFAIL: ' + failure.name + '\n' + failure.error.stack + '\n');
  });
  process.stdout.write('\n' + passed + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) process.exitCode = 1;
}());
