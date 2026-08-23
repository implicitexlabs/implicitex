'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const firebaseAdapter = require(path.join(__dirname, '../public/firebase-auth-adapter.js'));
const { createHolderApiClient } = require(path.join(__dirname, '../public/holder-api-client.js'));
const { STATES, createOnboardingController } = require(
  path.join(__dirname, '../public/onboarding-core.js'),
);

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function enabledConfig() {
  return {
    enabled: true,
    actionContinueUrl: 'https://app.ixid.me/register',
    firebase: {
      sdkVersion: '12.17.1',
      options: {
        apiKey: 'public-api-key',
        authDomain: 'example.firebaseapp.com',
        projectId: 'example',
        appId: 'app-id',
      },
    },
  };
}

test('disabled or incomplete Firebase configuration fails before importing SDK modules', async () => {
  let imports = 0;
  await assert.rejects(
    firebaseAdapter.createFirebaseAuthAdapter({ enabled: false }, async () => { imports += 1; }),
    /not enabled/,
  );
  assert.equal(imports, 0);
});

test('Firebase adapter pins module URLs and establishes memory-only persistence', async () => {
  const imported = [];
  const calls = [];
  const fakeAuth = { name: 'auth' };
  const appModule = {
    initializeApp: function initializeApp(options) { calls.push(['initializeApp', options]); return {}; },
  };
  const authModule = {
    inMemoryPersistence: { name: 'memory' },
    getAuth: function getAuth() { return fakeAuth; },
    setPersistence: async function setPersistence(auth, persistence) {
      calls.push(['setPersistence', auth, persistence]);
    },
    onAuthStateChanged: function onAuthStateChanged() {},
    createUserWithEmailAndPassword: async function createUser() {},
    signInWithEmailAndPassword: async function signIn() {},
    signOut: async function signOut() {},
    sendEmailVerification: async function sendVerification() {},
    sendPasswordResetEmail: async function reset() {},
    reload: async function reload() {},
    getIdToken: async function getToken() {},
  };
  const adapter = await firebaseAdapter.createFirebaseAuthAdapter(
    enabledConfig(),
    async function importer(url) {
      imported.push(url);
      return url.endsWith('firebase-app.js') ? appModule : authModule;
    },
  );
  assert.deepEqual(imported, [
    'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js',
  ]);
  assert.equal(calls[1][0], 'setPersistence');
  assert.equal(calls[1][1], fakeAuth);
  assert.equal(calls[1][2], authModule.inMemoryPersistence);
  assert.equal(typeof adapter.getIdToken, 'function');
});

test('Holder API client uses same-origin paths and never sends cookies', async () => {
  const calls = [];
  const client = createHolderApiClient({
    baseUrl: '/api/holder/v0.1',
    fetchImpl: async function fetchImpl(url, init) {
      calls.push({ url, init });
      return { status: 201, json: async () => ({ account_id: 'a1' }) };
    },
  });
  const result = await client.createAccount('token-value', 'operation-1');
  assert.equal(result.status, 201);
  assert.equal(calls[0].url, '/api/holder/v0.1/account');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-value');
  assert.deepEqual(JSON.parse(calls[0].init.body), { operation_id: 'operation-1' });
});

test('controller and real API adapter repeat GET after first 401 without POSTing account creation', async () => {
  const requests = [];
  const tokens = [];
  const replies = [
    { status: 401, body: { error: 'UNAUTHENTICATED' } },
    { status: 200, body: { account_state: 'ACTIVE', ix_ids: [{ ix_id: 'alice' }] } },
  ];
  const api = createHolderApiClient({
    baseUrl: '/api/holder/v0.1',
    fetchImpl: async function fetchImpl(url, init) {
      requests.push({ url, method: init.method, authorization: init.headers.Authorization });
      const reply = replies.shift();
      if (!reply) throw new Error('unexpected third request');
      return { status: reply.status, json: async () => reply.body };
    },
  });
  const testUser = { uid: 'uid-1', email: 'holder@example.com', emailVerified: true };
  const controller = createOnboardingController({
    auth: {
      subscribe: () => () => {},
      signOut: async () => {},
      getIdToken: async function getIdToken(_user, forceRefresh) {
        tokens.push(forceRefresh);
        return forceRefresh ? 'fresh-token' : 'current-token';
      },
      isEmailVerified: (value) => value.emailVerified,
      getEmail: (value) => value.email,
    },
    api,
    render: () => {},
    makeOperationId: () => { throw new Error('first 401 must not create an operation'); },
  });

  await controller.handleAuthState(testUser);

  assert.deepEqual(tokens, [false, true]);
  assert.deepEqual(requests, [
    {
      url: '/api/holder/v0.1/workspace',
      method: 'GET',
      authorization: 'Bearer current-token',
    },
    {
      url: '/api/holder/v0.1/workspace',
      method: 'GET',
      authorization: 'Bearer fresh-token',
    },
  ]);
  assert.equal(requests.some((request) => request.method === 'POST'), false);
  assert.equal(controller.getSnapshot().state, STATES.ACTIVE);
});

test('Holder API client rejects cross-origin base URLs', () => {
  assert.throws(() => createHolderApiClient({
    baseUrl: 'https://attacker.example/api',
    fetchImpl: async () => {},
  }), /same-origin/);
  assert.throws(() => createHolderApiClient({
    baseUrl: '//attacker.example/api',
    fetchImpl: async () => {},
  }), /same-origin/);
  assert.throws(() => createHolderApiClient({
    baseUrl: '/\\attacker.example/api',
    fetchImpl: async () => {},
  }), /same-origin/);
});

(async function run() {
  let passed = 0;
  const failures = [];
  for (const entry of tests) {
    try { await entry.fn(); passed += 1; } catch (error) { failures.push({ name: entry.name, error }); }
  }
  failures.forEach((failure) => {
    process.stderr.write('\nFAIL: ' + failure.name + '\n' + failure.error.stack + '\n');
  });
  process.stdout.write('\n' + passed + ' tests: ' + passed + ' passed, ' + failures.length + ' failed\n');
  if (failures.length) process.exitCode = 1;
}());
