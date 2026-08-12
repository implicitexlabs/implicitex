'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { Wallet, getAddress } = require('ethers');

const holderModel = require('../../../holder-management/coin-card-holder-model');
const usernameApi = require('../src/shared/coin-card-canonical-username');
const {
  createAuthenticatedControlPlaneHolderAdapter,
  createLocalHolderApiClient,
} = require('../../../holder-management/authenticated-control-plane-adapter');
const {
  ENTITLEMENT_STATES,
  ROUTE_POLICY,
} = require('../src/holder-control-plane/contract');
const { createFirestoreHolderControlPlaneStore } = require('../src/holder-control-plane/firestore-store');
const { createHolderControlPlaneService } = require('../src/holder-control-plane/service');
const { createHolderWalletEvidenceAuthority } = require('../src/holder-control-plane/wallet-evidence-authority');
const { createFirestoreWalletChallengeStore } = require('../src/wallet-challenge/firestore-store');
const { createWalletChallengeService } = require('../src/wallet-challenge/service');
const {
  HOLDER_ORIGIN,
  SESSION_TTL_MS,
} = require('../src/holder-auth/contract');
const { createFirestoreHolderAuthStore, COLLECTIONS: AUTH_COLLECTIONS } = require('../src/holder-auth/firestore-auth-store');
const { createHolderSessionService } = require('../src/holder-auth/session-service');
const { createHolderApi } = require('../src/holder-auth/holder-api');
const {
  TEST_AUTH_AUDIENCE,
  TEST_ISSUER,
  createLocalAuthenticationHarness,
  createLocalStepUpHarness,
} = require('../src/holder-auth/local-authenticator');

const ACCOUNT_IDS = [
  'acct_01KZJTH0XZWTSVXNAJ23Z1QYR8',
  'acct_01KZJTH0XZWTSVXNAJ23Z1QYR9',
  'acct_01KZJTH0XZWTSVXNAJ23Z1QYRA',
  'acct_01KZJTH0XZWTSVXNAJ23Z1QYRB',
];
const CARD_IDS = [
  'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE',
  'cc_01KZJTH0XZ1QJG9A1K9T5GJAWF',
];
const WALLET = Wallet.createRandom();
const OTHER_WALLET = getAddress('0x1111111111111111111111111111111111111111');
const START = Date.parse('2026-08-11T12:00:00.000Z');

function clone(value) { return value === undefined || value === null ? value : structuredClone(value); }

class FakeDocumentReference {
  constructor(db, path) { this.db = db; this.path = path; }
  async get() {
    const value = this.db.documents.get(this.path);
    return { exists: value !== undefined, data: () => clone(value) };
  }
}

class FakeCollectionReference {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new FakeDocumentReference(this.db, `${this.path}/${id}`); }
}

class FakeTransaction {
  constructor(db) { this.db = db; this.writes = []; }
  async get(ref) {
    const value = this.db.documents.get(ref.path);
    return { exists: value !== undefined, data: () => clone(value) };
  }
  create(ref, data) {
    if (this.db.documents.has(ref.path) || this.writes.some((write) => write.path === ref.path)) {
      throw new Error(`already exists: ${ref.path}`);
    }
    this.writes.push({ kind: 'create', path: ref.path, data: clone(data) });
  }
  set(ref, data) { this.writes.push({ kind: 'set', path: ref.path, data: clone(data) }); }
  update(ref, changes) {
    const existing = this.db.documents.get(ref.path);
    if (!existing) throw new Error(`missing document: ${ref.path}`);
    this.writes.push({ kind: 'set', path: ref.path, data: { ...clone(existing), ...clone(changes) } });
  }
  commit() {
    for (const write of this.writes) this.db.documents.set(write.path, clone(write.data));
  }
}

class FakeFirestore {
  constructor() { this.documents = new Map(); this.transactionTail = Promise.resolve(); }
  collection(name) { return new FakeCollectionReference(this, name); }
  runTransaction(callback) {
    const run = this.transactionTail.then(async () => {
      const transaction = new FakeTransaction(this);
      const result = await callback(transaction);
      transaction.commit();
      return result;
    });
    this.transactionTail = run.catch(() => {});
    return run;
  }
  seed(path, value) { this.documents.set(path, clone(value)); }
  list(collection) {
    return [...this.documents.entries()]
      .filter(([path]) => path.startsWith(`${collection}/`))
      .map(([path, value]) => ({ id: path.slice(collection.length + 1), ...clone(value) }));
  }
}

function brand() {
  const values = new WeakSet();
  return {
    make(value) { const result = Object.freeze(value); values.add(result); return result; },
    has(value) { return values.has(value); },
  };
}

function makeEnvironment() {
  let nowMs = START;
  let accountIndex = 0;
  let cardIndex = 0;
  let reservationIndex = 0;
  const db = new FakeFirestore();
  const entitlementBrand = brand();
  const viewBrand = brand();
  const authHarness = createLocalAuthenticationHarness({ clock: () => new Date(nowMs) });
  const stepUpHarness = createLocalStepUpHarness({ clock: () => new Date(nowMs) });
  const walletService = createWalletChallengeService({
    store: createFirestoreWalletChallengeStore(db),
    clock: () => new Date(nowMs),
  });
  const entitlementAuthority = Object.freeze({
    async assess(principal, identity) {
      return entitlementBrand.make({
        status: ENTITLEMENT_STATES.NON_PRODUCTION_ELIGIBLE,
        accountId: principal.accountId,
        cardId: identity.cardId,
      });
    },
    isEntitlementResult: entitlementBrand.has,
  });
  const control = createHolderControlPlaneService({
    store: createFirestoreHolderControlPlaneStore(db),
    clock: () => new Date(nowMs),
    reservationIdFactory: () => `reservation_auth_${String(++reservationIndex).padStart(4, '0')}`,
    cardIdFactory: () => CARD_IDS[cardIndex++] || `cc_${'A'.repeat(26)}`,
    walletEvidenceAuthority: createHolderWalletEvidenceAuthority({ walletChallengeService: walletService }),
    entitlementAuthority,
  });
  const authStore = createFirestoreHolderAuthStore(db);
  const sessions = createHolderSessionService({
    store: authStore,
    authenticationVerifier: authHarness.verifier,
    controlPlaneService: control,
    clock: () => new Date(nowMs),
    accountIdFactory: () => ACCOUNT_IDS[accountIndex++] || `acct_${'A'.repeat(26)}`,
  });
  const api = createHolderApi({
    sessionService: sessions,
    controlPlaneService: control,
    walletChallengeService: walletService,
    stepUpVerifier: stepUpHarness.verifier,
  });
  const readonlyBrowser = Object.freeze({
    async resolveReadOnlyCard() {
      return viewBrand.make(Object.freeze({
        viewState: 'UNKNOWN', canonicalUsername: 'antoinedennison',
        canonicalUrl: 'https://antoinedennison.coincard.click/', redirectUrl: null,
        cardId: null, lifecycleOutcome: null,
        publicResolutionOutcome: 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND',
        routeRecordHash: null, routeRevision: null, fixtureTrustBoundary: null,
        presentationEligible: false, executionEligible: false, paymentControlEnabled: false,
      }));
    },
    isReadOnlyViewResult: viewBrand.has,
  });
  return {
    db, control, authStore, sessions, api, authHarness, stepUpHarness, readonlyBrowser,
    now: () => new Date(nowMs),
    advance(ms) { nowMs += ms; },
  };
}

async function signIn(env, subject = 'firebase-subject-antoinedennison', tokenOptions = {}) {
  const client = createLocalHolderApiClient({ api: env.api });
  const token = env.authHarness.issueToken({ subject, ...tokenOptions });
  const descriptor = await client.signIn(token);
  return { client, descriptor, token };
}

function holderSession(descriptor) {
  return Object.freeze({
    schemaVersion: holderModel.SESSION_SCHEMA,
    environment: 'NON_PRODUCTION',
    origin: holderModel.HOLDER_ORIGIN,
    audience: holderModel.HOLDER_AUDIENCE,
    sessionBoundary: holderModel.SESSION_BOUNDARY,
    authenticated: true,
    accountId: descriptor.accountId,
  });
}

async function provision(client, username = 'antoinedennison') {
  const reservation = await client.mutate('/v1/usernames/reserve', {
    username, operationId: `reserve_${username}`,
  });
  const allocation = await client.mutate('/v1/cards/allocate', {
    username, reservationId: reservation.reservationId, operationId: `allocate_${username}`,
  });
  await client.mutate('/v1/presentation', {
    presentation: {
      avatarUrl: 'https://example.test/avatar.png', bannerUrl: null,
      bio: 'Authenticated holder control plane.', externalUrl: 'https://example.com/',
    },
    expectedRevision: 0,
    operationId: `presentation_${username}`,
  });
  await client.mutate('/v1/route-intent', {
    chainId: 137,
    asset: 'USDC',
    tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET.address,
    expectedRevision: 0,
    operationId: `route_${username}`,
  });
  return { reservation, allocation };
}

async function expectClientCode(promise, code) {
  await assert.rejects(promise, (error) => error && error.code === code);
}

test('local authentication uses signed ephemeral P-256 evidence and rejects claim/signature drift', async () => {
  const env = makeEnvironment();
  const valid = env.authHarness.issueToken({ subject: 'firebase-subject-valid' });
  const identity = await env.authHarness.verifier.verifyAuthentication(valid);
  assert.equal(identity.subject, 'firebase-subject-valid');
  assert.equal(env.authHarness.verifier.isVerifiedIdentity(identity), true);
  assert.equal(env.authHarness.verifier.isVerifiedIdentity({ ...identity }), false);

  const tampered = `${valid.slice(0, -1)}${valid.endsWith('A') ? 'B' : 'A'}`;
  await assert.rejects(env.authHarness.verifier.verifyAuthentication(tampered));
  await assert.rejects(env.authHarness.verifier.verifyAuthentication(
    env.authHarness.issueToken({ subject: 'wrong-aud', audience: 'implicitex-transfer-portal' }),
  ), (error) => error.code === 'AUTH_TOKEN_CLAIMS_INVALID');
  await assert.rejects(env.authHarness.verifier.verifyAuthentication(
    env.authHarness.issueToken({ subject: 'wrong-issuer', issuer: 'https://evil.example' }),
  ), (error) => error.code === 'AUTH_TOKEN_CLAIMS_INVALID');
  await assert.rejects(env.authHarness.verifier.verifyAuthentication(
    env.authHarness.issueToken({ subject: 'wrong-provider', provider: 'implicitex-auth' }),
  ), (error) => error.code === 'AUTH_TOKEN_CLAIMS_INVALID');
});

test('subject mapping is transactional, idempotent, opaque, and one-to-one', async () => {
  const env = makeEnvironment();
  const [a, b] = await Promise.all([
    signIn(env, 'same-auth-subject'),
    signIn(env, 'same-auth-subject'),
  ]);
  assert.equal(a.descriptor.accountId, b.descriptor.accountId);
  assert.match(a.descriptor.accountId, /^acct_/);
  assert.equal(env.db.list(AUTH_COLLECTIONS.subjects).length, 1);
  assert.equal(env.db.list(AUTH_COLLECTIONS.accounts).length, 1);
  const record = env.db.list(AUTH_COLLECTIONS.subjects)[0];
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'email'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'username'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(record, 'wallet'), false);

  await assert.rejects(env.authStore.resolveOrCreateMapping({
    subject: 'different-auth-subject',
    issuer: TEST_ISSUER,
    provider: 'local-p256-test-authenticator',
    candidateAccountId: a.descriptor.accountId,
    now: env.now(),
  }), (error) => error.code === 'ACCOUNT_MAPPING_CONFLICT');
});

test('session cookie is host-only and principal keeps auth identity separate from account', async () => {
  const env = makeEnvironment();
  const client = createLocalHolderApiClient({ api: env.api });
  const response = await env.api.handle({
    method: 'POST', path: '/v1/session', headers: { Origin: HOLDER_ORIGIN },
    body: { authenticationEvidence: env.authHarness.issueToken({ subject: 'cookie-subject' }) },
  });
  assert.equal(response.status, 201);
  assert.match(response.headers['Set-Cookie'], /^__Host-coincard_session=/);
  assert.match(response.headers['Set-Cookie'], /; Path=\//);
  assert.match(response.headers['Set-Cookie'], /; Secure/);
  assert.match(response.headers['Set-Cookie'], /; HttpOnly/);
  assert.match(response.headers['Set-Cookie'], /; SameSite=Strict/);
  assert.doesNotMatch(response.headers['Set-Cookie'], /; Domain=/i);
  await client.signIn(env.authHarness.issueToken({ subject: 'principal-subject' }));
  const loaded = await client.get('/v1/holder');
  assert.equal(loaded.principal.authenticationSubject, 'principal-subject');
  assert.notEqual(loaded.principal.authenticationSubject, loaded.principal.accountId);
  assert.equal(loaded.principal.audience, 'coin-card-holder');
  assert.equal(loaded.principal.sessionBoundary, 'HOST_ONLY_APP_COINCARD_CLICK');
  assert.equal(loaded.principal.stepUpState, 'NOT_ESTABLISHED');
});

test('API requires authentication, exact origin, independent CSRF, and no caller account selection', async () => {
  const env = makeEnvironment();
  const unauthenticated = await env.api.handle({
    method: 'GET', path: '/v1/holder', headers: { Origin: HOLDER_ORIGIN },
  });
  assert.equal(unauthenticated.status, 401);
  const { client } = await signIn(env);
  const jar = client.exportLocalTestCookieJar();

  for (const origin of [
    'https://coincard.click',
    'https://antoinedennison.coincard.click',
    'https://app.implicitex.com',
    'https://evil.example',
    undefined,
  ]) {
    const response = await env.api.handle({
      method: 'GET', path: '/v1/holder',
      headers: { ...(origin ? { Origin: origin } : {}), Cookie: jar.cookie },
    });
    assert.equal(response.status, 403, String(origin));
    assert.notEqual(response.headers['Access-Control-Allow-Origin'], '*');
  }

  const noCsrf = await env.api.handle({
    method: 'POST', path: '/v1/usernames/reserve',
    headers: { Origin: HOLDER_ORIGIN, Cookie: jar.cookie },
    body: { username: 'antoinedennison', operationId: 'missing_csrf_001' },
  });
  assert.equal(noCsrf.status, 403);
  assert.equal(noCsrf.body.error, 'CSRF_REQUIRED');
  const wrongCsrf = await env.api.handle({
    method: 'POST', path: '/v1/usernames/reserve',
    headers: { Origin: HOLDER_ORIGIN, Cookie: jar.cookie, 'X-Coincard-CSRF': 'A'.repeat(43) },
    body: { username: 'antoinedennison', operationId: 'wrong_csrf_001' },
  });
  assert.equal(wrongCsrf.status, 403);
  assert.equal(wrongCsrf.body.error, 'CSRF_INVALID');
  const malformedCsrf = await env.api.handle({
    method: 'POST', path: '/v1/usernames/reserve',
    headers: { Origin: HOLDER_ORIGIN, Cookie: jar.cookie, 'X-Coincard-CSRF': 'malformed' },
    body: { username: 'antoinedennison', operationId: 'malformed_csrf_001' },
  });
  assert.equal(malformedCsrf.status, 403);
  assert.equal(malformedCsrf.body.error, 'CSRF_INVALID');
  await expectClientCode(client.mutate('/v1/usernames/reserve', {
    accountId: ACCOUNT_IDS[1], username: 'antoinedennison', operationId: 'foreign_account_001',
  }), 'CALLER_ACCOUNT_ID_DENIED');
});

test('CSRF token from another valid session does not bind the first cookie', async () => {
  const env = makeEnvironment();
  const first = await signIn(env, 'csrf-subject-one');
  const second = await signIn(env, 'csrf-subject-two');
  const a = first.client.exportLocalTestCookieJar();
  const b = second.client.exportLocalTestCookieJar();
  const response = await env.api.handle({
    method: 'POST', path: '/v1/usernames/reserve',
    headers: { Origin: HOLDER_ORIGIN, Cookie: a.cookie, 'X-Coincard-CSRF': b.csrfToken },
    body: { username: 'antoinedennison', operationId: 'cross_session_csrf' },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error, 'CSRF_INVALID');
});

test('expired session and another-product authentication fail closed', async () => {
  const env = makeEnvironment();
  const signedIn = await signIn(env, 'expiring-session');
  env.advance(SESSION_TTL_MS);
  await expectClientCode(signedIn.client.get('/v1/holder'), 'SESSION_EXPIRED_OR_REVOKED');

  const foreignClient = createLocalHolderApiClient({ api: env.api });
  await expectClientCode(foreignClient.signIn(env.authHarness.issueToken({
    subject: 'implicitex-user', audience: 'implicitex-transfer-portal',
  })), 'AUTH_TOKEN_CLAIMS_INVALID');
});

test('authenticated API enforces revisions, operation fingerprints, and account isolation', async () => {
  const env = makeEnvironment();
  const first = await signIn(env, 'holder-one');
  const second = await signIn(env, 'holder-two');
  const reservation = await first.client.mutate('/v1/usernames/reserve', {
    username: 'antoinedennison', operationId: 'reserve_api_replay',
  });
  const replay = await first.client.mutate('/v1/usernames/reserve', {
    username: 'antoinedennison', operationId: 'reserve_api_replay',
  });
  assert.deepEqual(replay, reservation);
  await expectClientCode(first.client.mutate('/v1/usernames/reserve', {
    username: 'another-holder', operationId: 'reserve_api_replay',
  }), 'IDEMPOTENCY_CONFLICT');
  await first.client.mutate('/v1/cards/allocate', {
    username: 'antoinedennison', reservationId: reservation.reservationId,
    operationId: 'allocate_api_isolation',
  });
  await first.client.mutate('/v1/presentation', {
    presentation: { avatarUrl: null, bannerUrl: null, bio: 'one', externalUrl: null },
    expectedRevision: 0, operationId: 'presentation_api_one',
  });
  await expectClientCode(first.client.mutate('/v1/presentation', {
    presentation: { avatarUrl: null, bannerUrl: null, bio: 'stale', externalUrl: null },
    expectedRevision: 0, operationId: 'presentation_api_stale',
  }), 'STALE_PRESENTATION_REVISION');
  const secondState = await second.client.get('/v1/holder');
  assert.equal(secondState.holder.account.username, null);
  assert.equal(secondState.holder.account.cardId, null);
});

test('changing an existing recipient wallet requires recent action-bound step-up', async () => {
  const env = makeEnvironment();
  const signedIn = await signIn(env);
  await provision(signedIn.client);
  await expectClientCode(signedIn.client.mutate('/v1/route-intent', {
    chainId: 137, asset: 'USDC', tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
    recipientAddress: OTHER_WALLET, expectedRevision: 1, operationId: 'route_no_step_up',
  }), 'STEP_UP_REQUIRED');
  const principal = (await signedIn.client.get('/v1/holder')).principal;
  const validStepUp = env.stepUpHarness.issueToken({
    subject: principal.authenticationSubject,
    accountId: principal.accountId,
    sessionId: principal.sessionId,
    action: 'CHANGE_RECIPIENT_WALLET',
  });
  const changed = await signedIn.client.mutate('/v1/route-intent', {
    chainId: 137, asset: 'USDC', tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
    recipientAddress: OTHER_WALLET, expectedRevision: 1,
    operationId: 'route_with_step_up', stepUpToken: validStepUp,
  });
  assert.equal(changed.recipientAddress, OTHER_WALLET);
  assert.equal(changed.walletEvidenceInvalidated, false);

  const wrongAction = env.stepUpHarness.issueToken({
    subject: principal.authenticationSubject,
    accountId: principal.accountId,
    sessionId: principal.sessionId,
    action: 'RESTORE_CARD',
  });
  await expectClientCode(signedIn.client.mutate('/v1/route-intent', {
    chainId: 137, asset: 'USDC', tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET.address, expectedRevision: 2,
    operationId: 'route_wrong_step_up', stepUpToken: wrongAction,
  }), 'STEP_UP_INVALID');
});

test('wallet proof travels verifier to exact route binding and entitlement only reaches readiness', async () => {
  const env = makeEnvironment();
  const { client } = await signIn(env);
  await provision(client);
  const challenge = await client.mutate('/v1/wallet/challenge', {});
  const signature = await WALLET.signMessage(challenge.message);
  const evidence = await client.mutate('/v1/wallet/verify', {
    challengeId: challenge.challengeId,
    requestId: challenge.requestId,
    signature,
    operationId: 'attach_authenticated_wallet_proof',
  });
  assert.equal(evidence.status, 'VERIFIED');
  const entitlement = await client.mutate('/v1/entitlement/assess', {
    operationId: 'assess_authenticated_entitlement',
  });
  assert.equal(entitlement.status, 'NON_PRODUCTION_ELIGIBLE');
  const loaded = await client.get('/v1/holder');
  assert.equal(loaded.holder.readiness.status, 'ACTIVATION_READY');
  assert.equal(loaded.holder.authoritativeLifecycleState, null);
  assert.equal(loaded.holder.executionEligible, false);
  assert.equal(loaded.holder.paymentControlEnabled, false);
});

test('API-backed holder adapter survives client reload and public authority remains independent', async () => {
  const env = makeEnvironment();
  const signedIn = await signIn(env);
  let sequence = 0;
  const makeAdapter = (client) => createAuthenticatedControlPlaneHolderAdapter({
    apiClient: client,
    usernameApi,
    readonlyBrowser: env.readonlyBrowser,
    normalizeWalletAddress: getAddress,
    clock: () => env.now(),
    operationIdFactory: (kind) => `${kind.toLowerCase()}_${String(++sequence).padStart(4, '0')}`,
    stepUpTransport: {
      obtain: async (context) => env.stepUpHarness.issueToken(context),
    },
  });
  let adapter = makeAdapter(signedIn.client);
  let management = holderModel.createHolderManagement(adapter.dependencies);
  const session = holderSession(signedIn.descriptor);
  let state = await management.start(session);
  state = management.selectUsername(state, 'antoinedennison');
  state = await management.reserveUsername(state);
  state = await management.establishCardIdentity(state);
  const presentation = {
    avatarUrl: 'https://example.test/avatar.png', bannerUrl: null,
    bio: 'API-backed holder.', externalUrl: 'https://example.com/',
  };
  await adapter.presentationPersistenceApi.save(presentation);
  state = management.updatePresentation(state, presentation);
  state = await management.configureRoute(state, {
    chainId: 137, asset: 'USDC', tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET.address,
  });
  state = await management.requestWalletChallenge(state);
  state = await management.verifyWalletChallenge(state, await WALLET.signMessage(state.draft.walletChallenge.message));
  state = await management.assessEntitlement(state);
  state = management.reviewActivation(state);
  assert.equal(state.workflowState, 'ACTIVATION_READY');
  assert.equal(state.executionEligible, false);

  const restoredClient = createLocalHolderApiClient({
    api: env.api,
    restoredSession: signedIn.client.exportLocalTestCookieJar(),
  });
  adapter = makeAdapter(restoredClient);
  management = holderModel.createHolderManagement(adapter.dependencies);
  let restored = await management.start(session);
  assert.equal(restored.workflowState, 'ACTIVATION_READY');
  restored = await management.refreshPublicPreview(restored);
  assert.equal(restored.authoritative.preview.viewState, 'UNKNOWN');
  assert.equal(restored.workflowState, 'ACTIVATION_READY');
  assert.equal(restored.executionEligible, false);
});

test('holder API has no lifecycle, signing, publication, evidence-authority, or execution routes', async () => {
  const env = makeEnvironment();
  const { client } = await signIn(env);
  const prohibited = [
    '/v1/lifecycle/active', '/v1/sign', '/v1/current-head/publish',
    '/v1/transaction-evidence', '/v1/execution', '/v1/kms',
  ];
  for (const path of prohibited) {
    await expectClientCode(client.mutate(path, {
      lifecycleState: 'ACTIVE', executionEligible: true, operationId: 'prohibited_0001',
    }), 'ROUTE_NOT_FOUND');
  }
  assert.equal(env.api.deploymentState, 'LOCAL_UNEXPORTED_ONLY');
  const functionsIndex = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'index.js'), 'utf8',
  );
  assert.doesNotMatch(functionsIndex, /holder-auth|createHolderApi|coinCardHolderApi/);
});

test('Firebase verifier adapter requires explicit project, revoked-token check, and allowed provider', async () => {
  const { createFirebaseAuthenticationVerifier } = require('../src/holder-auth/firebase-authentication-verifier');
  let checkRevoked = null;
  const verifier = createFirebaseAuthenticationVerifier({
    projectId: 'coincard-prod',
    firebaseAuth: {
      async verifyIdToken(_token, value) {
        checkRevoked = value;
        return {
          aud: 'coincard-prod', iss: 'https://securetoken.google.com/coincard-prod',
          sub: 'firebase-production-subject', email_verified: true,
          auth_time: 1786453200, iat: 1786453200, exp: 1786456800,
          firebase: { sign_in_provider: 'google.com' }, amr: ['pwd'],
        };
      },
    },
  });
  const identity = await verifier.verifyAuthentication('production-shaped-firebase-token');
  assert.equal(checkRevoked, true);
  assert.equal(identity.subject, 'firebase-production-subject');
  assert.equal(identity.authenticationAudience, 'coincard-prod');
  assert.equal(verifier.isVerifiedIdentity(identity), true);
});
