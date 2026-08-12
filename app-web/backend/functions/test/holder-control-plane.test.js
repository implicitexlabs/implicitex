'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { getAddress } = require('ethers');

const usernameApi = require('../src/shared/coin-card-canonical-username');
const holderModel = require('../../../holder-management/coin-card-holder-model');
const { createLocalControlPlaneHolderAdapter } = require('../../../holder-management/local-control-plane-adapter');
const {
  ENTITLEMENT_STATES,
  HOLDER_AUDIENCE,
  HOLDER_ORIGIN,
  PRINCIPAL_SCHEMA,
  RESERVATION_TTL_MS,
  ROUTE_POLICY,
  SESSION_BOUNDARY,
  HolderControlPlaneError,
} = require('../src/holder-control-plane/contract');
const {
  COLLECTIONS,
  createFirestoreHolderControlPlaneStore,
} = require('../src/holder-control-plane/firestore-store');
const { createHolderControlPlaneService } = require('../src/holder-control-plane/service');
const {
  createHolderWalletEvidenceAuthority,
} = require('../src/holder-control-plane/wallet-evidence-authority');

const ACCOUNT_A = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR8';
const ACCOUNT_B = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR9';
const CARD_A = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';
const CARD_B = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWF';
const USERNAME = 'antoinedennison';
const OTHER_USERNAME = 'another-holder';
const WALLET = '0x2489587c9da6eab970a5479ba70273ba37961221';
const OTHER_WALLET = '0x1111111111111111111111111111111111111111';
const START = Date.parse('2026-08-11T12:00:00.000Z');

function clone(value) { return structuredClone(value); }

class FakeDocumentReference {
  constructor(db, documentPath) { this.db = db; this.path = documentPath; }
  async get() {
    const data = this.db.documents.get(this.path);
    return { exists: data !== undefined, data: () => clone(data) };
  }
}

class FakeCollectionReference {
  constructor(db, collectionPath) { this.db = db; this.path = collectionPath; }
  doc(id) { return new FakeDocumentReference(this.db, `${this.path}/${id}`); }
}

class FakeTransaction {
  constructor(db) { this.db = db; this.writes = []; }
  async get(ref) {
    const data = this.db.documents.get(ref.path);
    return { exists: data !== undefined, data: () => clone(data) };
  }
  create(ref, data) {
    if (this.db.documents.has(ref.path) || this.writes.some((write) => write.path === ref.path)) {
      throw new Error(`already exists: ${ref.path}`);
    }
    this.writes.push({ kind: 'create', path: ref.path, data: clone(data) });
  }
  set(ref, data) { this.writes.push({ kind: 'set', path: ref.path, data: clone(data) }); }
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
  read(documentPath) {
    const value = this.documents.get(documentPath);
    return value === undefined ? null : clone(value);
  }
  seed(documentPath, value) { this.documents.set(documentPath, clone(value)); }
  list(collection) {
    const prefix = `${collection}/`;
    return [...this.documents.entries()]
      .filter(([documentPath]) => documentPath.startsWith(prefix))
      .map(([, value]) => clone(value));
  }
}

function makeBrand() {
  const values = new WeakSet();
  return {
    make(value) { const result = Object.freeze(value); values.add(result); return result; },
    has(value) { try { return values.has(value); } catch { return false; } },
  };
}

function principal(accountId = ACCOUNT_A) {
  return Object.freeze({
    schemaVersion: PRINCIPAL_SCHEMA,
    environment: 'NON_PRODUCTION',
    authenticated: true,
    accountId,
    origin: HOLDER_ORIGIN,
    audience: HOLDER_AUDIENCE,
    sessionBoundary: SESSION_BOUNDARY,
  });
}

function makeEnvironment() {
  let nowMs = START;
  let reservationSequence = 0;
  let cardSequence = 0;
  const db = new FakeFirestore();
  const evidenceBrand = makeBrand();
  const entitlementBrand = makeBrand();
  const entitlementAuthority = Object.freeze({
    async assess(holderPrincipal, identity) {
      return entitlementBrand.make({
        status: ENTITLEMENT_STATES.NON_PRODUCTION_ELIGIBLE,
        accountId: holderPrincipal.accountId,
        cardId: identity.cardId,
      });
    },
    isEntitlementResult: entitlementBrand.has,
  });
  const store = createFirestoreHolderControlPlaneStore(db);
  const walletChallengeService = Object.freeze({
    isVerifiedWalletProofResult: evidenceBrand.has,
  });
  const service = createHolderControlPlaneService({
    store,
    clock: () => new Date(nowMs),
    reservationIdFactory: () => `reservation_test_${String(++reservationSequence).padStart(4, '0')}`,
    cardIdFactory: () => [CARD_A, CARD_B][cardSequence++] || `cc_${'A'.repeat(26)}`,
    walletEvidenceAuthority: createHolderWalletEvidenceAuthority({ walletChallengeService }),
    entitlementAuthority,
  });
  return {
    db, store, service, evidenceBrand, entitlementBrand,
    now: () => new Date(nowMs),
    advance(ms) { nowMs += ms; },
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => (
    error instanceof HolderControlPlaneError && error.code === code
  ));
}

async function initialize(env, accountId = ACCOUNT_A) {
  return env.service.ensureAccount(principal(accountId));
}

async function reserve(env, accountId, username, operationId) {
  return env.service.reserveUsername(principal(accountId), {
    accountId, username, operationId,
  });
}

async function allocate(env, accountId, reservation, operationId) {
  return env.service.allocateIdentity(principal(accountId), {
    accountId,
    username: reservation.username,
    reservationId: reservation.reservationId,
    operationId,
  });
}

async function provisionDraft(env, accountId = ACCOUNT_A, username = USERNAME) {
  await initialize(env, accountId);
  const reservation = await reserve(env, accountId, username, `reserve_${accountId.slice(-4)}`);
  const allocation = await allocate(env, accountId, reservation, `allocate_${accountId.slice(-4)}`);
  return { reservation, allocation };
}

function presentation(overrides = {}) {
  return {
    avatarUrl: 'https://example.test/avatar.png',
    bannerUrl: 'https://example.test/banner.png',
    bio: 'A bounded Coin Card profile.',
    externalUrl: 'https://example.com/',
    ...overrides,
  };
}

function route(overrides = {}) {
  return {
    chainId: 137,
    asset: 'USDC',
    tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET,
    ...overrides,
  };
}

async function savePresentation(env, allocation, expectedRevision = 0, operationId = 'present_0001') {
  return env.service.savePresentation(principal(allocation.accountId), {
    accountId: allocation.accountId,
    username: allocation.username,
    cardId: allocation.cardId,
    presentation: presentation(),
    expectedRevision,
    operationId,
  });
}

async function saveRoute(env, allocation, expectedRevision = 0, operationId = 'route_0001', overrides = {}) {
  return env.service.saveRouteIntent(principal(allocation.accountId), {
    accountId: allocation.accountId,
    username: allocation.username,
    cardId: allocation.cardId,
    expectedRevision,
    operationId,
    ...route(overrides),
  });
}

function verifiedEvidence(env, allocation, routeRevision, overrides = {}) {
  return env.evidenceBrand.make(Object.freeze({
    schemaVersion: 'implicitex.coincard.wallet-proof.v1',
    verified: true,
    proofId: `proof_${routeRevision}_verified`,
    accountId: allocation.accountId,
    handle: allocation.username,
    walletAddress: getAddress(WALLET),
    chainId: 137,
    verifiedAt: env.now().toISOString(),
    expiresAt: new Date(env.now().getTime() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  }));
}

async function attachEvidence(env, allocation, evidence, revision = 1, operationId = 'evidence_0001') {
  return env.service.attachWalletEvidence(principal(allocation.accountId), {
    accountId: allocation.accountId,
    username: allocation.username,
    cardId: allocation.cardId,
    expectedRouteRevision: revision,
    operationId,
  }, evidence);
}

test('control-plane account is opaque, non-authoritative, and backend mediated', async () => {
  const env = makeEnvironment();
  const loaded = await initialize(env);
  assert.equal(loaded.account.accountId, ACCOUNT_A);
  assert.equal(loaded.account.username, null);
  assert.equal(loaded.account.cardId, null);
  assert.equal(loaded.readiness.status, 'PREREQUISITES_MISSING');
  assert.equal(loaded.authoritativeLifecycleState, null);
  assert.equal(loaded.authoritativeStateSource, 'EXTERNAL_READ_ONLY_NOT_STORED');
  assert.equal(loaded.executionEligible, false);
  assert.equal(env.db.list(COLLECTIONS.accounts).length, 1);
});

test('transactional reservation has one winner and same-account live retry is idempotent', async () => {
  const env = makeEnvironment();
  await Promise.all([initialize(env, ACCOUNT_A), initialize(env, ACCOUNT_B)]);
  const settled = await Promise.allSettled([
    reserve(env, ACCOUNT_A, USERNAME, 'reserve_race_a'),
    reserve(env, ACCOUNT_B, USERNAME, 'reserve_race_b'),
  ]);
  assert.equal(settled.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal(settled.filter((value) => value.status === 'rejected').length, 1);
  const winnerIndex = settled.findIndex((value) => value.status === 'fulfilled');
  const winnerAccount = winnerIndex === 0 ? ACCOUNT_A : ACCOUNT_B;
  const first = settled[winnerIndex].value;
  const again = await reserve(env, winnerAccount, USERNAME, 'reserve_retry_same');
  assert.equal(again.reservationId, first.reservationId);
  assert.equal(again.idempotent, true);
  assert.equal(env.db.list(COLLECTIONS.reservations).length, 1);
});

test('reservation policy is 30 minutes with an exclusive expiration boundary', async () => {
  assert.equal(RESERVATION_TTL_MS, 30 * 60 * 1000);
  const env = makeEnvironment();
  await Promise.all([initialize(env, ACCOUNT_A), initialize(env, ACCOUNT_B)]);
  const first = await reserve(env, ACCOUNT_A, USERNAME, 'reserve_thirty_minute_boundary');
  assert.equal(Date.parse(first.expiresAt) - START, RESERVATION_TTL_MS);

  env.advance(RESERVATION_TTL_MS - 1);
  const retry = await reserve(env, ACCOUNT_A, USERNAME, 'reserve_before_boundary_retry');
  assert.equal(retry.reservationId, first.reservationId);
  assert.equal(retry.idempotent, true);
  await expectCode(
    reserve(env, ACCOUNT_B, USERNAME, 'reserve_before_boundary_other'),
    'USERNAME_RESERVED',
  );

  env.advance(1);
  const acquired = await reserve(env, ACCOUNT_B, USERNAME, 'reserve_at_boundary_other');
  assert.equal(acquired.accountId, ACCOUNT_B);
  assert.notEqual(acquired.reservationId, first.reservationId);
  assert.equal(env.db.list(COLLECTIONS.reservations).length, 2);
});

test('reservation expiry releases only unallocated names; tombstoned names remain unavailable', async () => {
  const env = makeEnvironment();
  await Promise.all([initialize(env, ACCOUNT_A), initialize(env, ACCOUNT_B)]);
  await reserve(env, ACCOUNT_A, USERNAME, 'reserve_expiring_a');
  env.advance(RESERVATION_TTL_MS + 1);
  const acquired = await reserve(env, ACCOUNT_B, USERNAME, 'reserve_after_expiry_b');
  assert.equal(acquired.accountId, ACCOUNT_B);

  const tombstoneEnv = makeEnvironment();
  await initialize(tombstoneEnv, ACCOUNT_B);
  tombstoneEnv.db.seed(`${COLLECTIONS.usernameClaims}/permanent-holder`, {
    status: 'TOMBSTONED', username: 'permanent-holder', accountId: ACCOUNT_A,
  });
  await expectCode(
    reserve(tombstoneEnv, ACCOUNT_B, 'permanent-holder', 'reserve_tombstone_b'),
    'USERNAME_PERMANENTLY_UNAVAILABLE',
  );
});

test('operation id replay is canonical and rejects changed input', async () => {
  const env = makeEnvironment();
  await initialize(env);
  const first = await reserve(env, ACCOUNT_A, USERNAME, 'reserve_idempotent');
  const replay = await reserve(env, ACCOUNT_A, USERNAME, 'reserve_idempotent');
  assert.deepEqual(replay, first);
  await expectCode(
    reserve(env, ACCOUNT_A, OTHER_USERNAME, 'reserve_idempotent'),
    'IDEMPOTENCY_CONFLICT',
  );
});

test('current V2 username grammar is enforced at the durable reservation boundary', async () => {
  for (const invalid of ['abc', 'a_bcd', 'Abcd', '-abcd', 'abcd-', 'a'.repeat(33)]) {
    const env = makeEnvironment();
    await initialize(env);
    await expectCode(
      reserve(env, ACCOUNT_A, invalid, `reserve_invalid_${invalid.length}_${invalid.charCodeAt(0)}`),
      'USERNAME_INVALID',
    );
  }
  for (const valid of ['abcd', 'a'.repeat(31), 'a'.repeat(32), 'ab--cd']) {
    const env = makeEnvironment();
    await initialize(env);
    const result = await reserve(
      env, ACCOUNT_A, valid, `reserve_valid_${valid.length}_${valid.slice(0, 2)}`,
    );
    assert.equal(result.username, valid);
  }
});

test('identity allocation is transactional, idempotent, and rejects expired ownership', async () => {
  const env = makeEnvironment();
  await Promise.all([initialize(env, ACCOUNT_A), initialize(env, ACCOUNT_B)]);
  const reservation = await reserve(env, ACCOUNT_A, USERNAME, 'reserve_identity_a');
  const first = await allocate(env, ACCOUNT_A, reservation, 'allocate_identity_a');
  const replay = await allocate(env, ACCOUNT_A, reservation, 'allocate_identity_a');
  assert.deepEqual(replay, first);
  const semanticRetry = await allocate(env, ACCOUNT_A, reservation, 'allocate_identity_retry');
  assert.equal(semanticRetry.cardId, first.cardId);
  assert.equal(semanticRetry.idempotent, true);
  assert.equal(env.db.list(COLLECTIONS.cards).length, 1);
  await expectCode(
    reserve(env, ACCOUNT_A, OTHER_USERNAME, 'reserve_second_username'),
    'ACCOUNT_ALREADY_ASSIGNED',
  );
  await expectCode(
    reserve(env, ACCOUNT_B, USERNAME, 'reserve_allocated_username'),
    'USERNAME_PERMANENTLY_UNAVAILABLE',
  );

  const expiring = makeEnvironment();
  await initialize(expiring);
  const expiredReservation = await reserve(
    expiring, ACCOUNT_A, USERNAME, 'reserve_expired_allocation',
  );
  expiring.advance(RESERVATION_TTL_MS + 1);
  await expectCode(
    allocate(expiring, ACCOUNT_A, expiredReservation, 'allocate_after_expiry'),
    'RESERVATION_EXPIRED',
  );
});

test('parallel identity allocation commits one opaque card transition', async () => {
  const env = makeEnvironment();
  await initialize(env);
  const reservation = await reserve(env, ACCOUNT_A, USERNAME, 'reserve_parallel_identity');
  const settled = await Promise.allSettled([
    allocate(env, ACCOUNT_A, reservation, 'allocate_parallel_a'),
    allocate(env, ACCOUNT_A, reservation, 'allocate_parallel_b'),
  ]);
  assert.equal(settled.filter((value) => value.status === 'fulfilled').length, 2);
  assert.deepEqual(
    settled.map((value) => value.value.cardId),
    [CARD_A, CARD_A],
    'parallel callers observe the one committed opaque card identity',
  );
  assert.equal(settled.filter((value) => value.value.idempotent === false).length, 1);
  assert.equal(settled.filter((value) => value.value.idempotent === true).length, 1);
  assert.equal(env.db.list(COLLECTIONS.cards).length, 1);
  const loaded = await env.service.loadAccount(principal());
  assert.equal(loaded.account.cardId, env.db.list(COLLECTIONS.cards)[0].cardId);
});

test('presentation uses optimistic concurrency and preserves route/evidence fields', async () => {
  const env = makeEnvironment();
  const { allocation } = await provisionDraft(env);
  const first = await savePresentation(env, allocation);
  assert.equal(first.presentationRevision, 1);
  const replay = await savePresentation(env, allocation);
  assert.deepEqual(replay, first);
  await expectCode(
    env.service.savePresentation(principal(), {
      accountId: ACCOUNT_A, username: USERNAME, cardId: CARD_A,
      presentation: presentation({ bio: 'stale' }), expectedRevision: 0,
      operationId: 'present_stale_2',
    }),
    'STALE_PRESENTATION_REVISION',
  );
  const before = await env.service.loadAccount(principal());
  const second = await env.service.savePresentation(principal(), {
    accountId: ACCOUNT_A, username: USERNAME, cardId: CARD_A,
    presentation: presentation({ bio: 'new revision' }), expectedRevision: 1,
    operationId: 'present_revision_2',
  });
  const after = await env.service.loadAccount(principal());
  assert.equal(second.presentationRevision, 2);
  assert.deepEqual(after.controlPlaneDraft.route, before.controlPlaneDraft.route);
  assert.deepEqual(after.controlPlaneDraft.walletEvidence, before.controlPlaneDraft.walletEvidence);
});

test('route intent enforces fixed policy, optimistic concurrency, and evidence invalidation', async () => {
  const env = makeEnvironment();
  const { allocation } = await provisionDraft(env);
  await expectCode(saveRoute(env, allocation, 0, 'route_wrong_chain', { chainId: 1 }), 'ROUTE_UNSUPPORTED');
  await expectCode(saveRoute(env, allocation, 0, 'route_wrong_token', {
    tokenContractAddress: OTHER_WALLET,
  }), 'ROUTE_UNSUPPORTED');
  await expectCode(saveRoute(env, allocation, 0, 'route_bad_wallet', {
    recipientAddress: 'not-a-wallet',
  }), 'WALLET_INVALID');
  const first = await saveRoute(env, allocation);
  assert.equal(first.proposedRevision, '1');
  await expectCode(saveRoute(env, allocation, 0, 'route_stale_2'), 'STALE_ROUTE_REVISION');
  const evidence = verifiedEvidence(env, allocation, 1);
  await attachEvidence(env, allocation, evidence);
  let loaded = await env.service.loadAccount(principal());
  assert.equal(loaded.controlPlaneDraft.walletControlState, 'WALLET_CONTROL_VERIFIED');
  const changed = await saveRoute(env, allocation, 1, 'route_revision_2', {
    recipientAddress: OTHER_WALLET,
  });
  assert.equal(changed.proposedRevision, '2');
  assert.equal(changed.walletEvidenceInvalidated, true);
  loaded = await env.service.loadAccount(principal());
  assert.equal(loaded.controlPlaneDraft.walletEvidence, null);
  assert.equal(loaded.controlPlaneDraft.walletControlState, 'ROUTE_UPDATE_REQUIRES_EVIDENCE');
});

test('only branded, exact, current wallet-verifier evidence can attach', async () => {
  const env = makeEnvironment();
  const { allocation } = await provisionDraft(env);
  await saveRoute(env, allocation);
  const genuine = verifiedEvidence(env, allocation, 1);
  await expectCode(
    attachEvidence(env, allocation, { ...genuine }, 1, 'evidence_unbranded'),
    'WALLET_EVIDENCE_UNTRUSTED',
  );
  for (const [name, overrides] of [
    ['account', { accountId: ACCOUNT_B }],
    ['username', { handle: OTHER_USERNAME }],
    ['wallet', { walletAddress: getAddress(OTHER_WALLET) }],
    ['chain', { chainId: 1 }],
  ]) {
    await expectCode(
      attachEvidence(
        env, allocation, verifiedEvidence(env, allocation, 1, overrides), 1,
        `evidence_wrong_${name.replace('-', '_')}`,
      ),
      'WALLET_EVIDENCE_BINDING_MISMATCH',
    );
  }
  const expired = verifiedEvidence(env, allocation, 1, {
    expiresAt: new Date(env.now().getTime() - 1).toISOString(),
  });
  await expectCode(
    attachEvidence(env, allocation, expired, 1, 'evidence_expired'),
    'WALLET_EVIDENCE_EXPIRED',
  );
  const attached = await attachEvidence(env, allocation, genuine);
  assert.equal(attached.status, 'VERIFIED');
  assert.equal(attached.authoritative, false);

  await saveRoute(env, allocation, 1, 'route_after_evidence', { recipientAddress: OTHER_WALLET });
  await expectCode(
    attachEvidence(env, allocation, genuine, 2, 'evidence_prior_route'),
    'WALLET_EVIDENCE_BINDING_MISMATCH',
  );

  const replayEnv = makeEnvironment();
  const replayDraft = await provisionDraft(replayEnv);
  await saveRoute(replayEnv, replayDraft.allocation);
  const usedProof = verifiedEvidence(replayEnv, replayDraft.allocation, 1);
  await attachEvidence(replayEnv, replayDraft.allocation, usedProof);
  await saveRoute(replayEnv, replayDraft.allocation, 1, 'route_same_wallet_revision_2');
  await expectCode(
    attachEvidence(replayEnv, replayDraft.allocation, usedProof, 2, 'evidence_replayed_route_2'),
    'WALLET_EVIDENCE_REPLAYED',
  );
});

test('attached evidence expires on server-derived reload and cross-account attachment is rejected', async () => {
  const env = makeEnvironment();
  const { allocation } = await provisionDraft(env);
  await saveRoute(env, allocation);
  const evidence = verifiedEvidence(env, allocation, 1);
  await attachEvidence(env, allocation, evidence);
  env.advance(10 * 60 * 1000 + 1);
  const loaded = await env.service.loadAccount(principal());
  assert.equal(loaded.controlPlaneDraft.walletControlState, 'EVIDENCE_EXPIRED');
  assert.notEqual(loaded.readiness.status, 'ACTIVATION_READY');

  await initialize(env, ACCOUNT_B);
  await expectCode(
    env.service.attachWalletEvidence(principal(ACCOUNT_B), {
      accountId: ACCOUNT_A, username: USERNAME, cardId: CARD_A,
      expectedRouteRevision: 1, operationId: 'evidence_cross_account',
    }, evidence),
    'PRINCIPAL_ACCOUNT_MISMATCH',
  );
});

test('entitlement is authority-derived and readiness stops at ACTIVATION_READY, never ACTIVE', async () => {
  const env = makeEnvironment();
  const { allocation } = await provisionDraft(env);
  await savePresentation(env, allocation);
  await saveRoute(env, allocation);
  await attachEvidence(env, allocation, verifiedEvidence(env, allocation, 1));
  let loaded = await env.service.loadAccount(principal());
  assert.equal(loaded.readiness.status, 'PREREQUISITES_MISSING');
  assert.ok(loaded.readiness.missing.includes('COMMERCIAL_ENTITLEMENT'));
  const entitlement = await env.service.assessEntitlement(principal(), {
    accountId: ACCOUNT_A, username: USERNAME, cardId: CARD_A,
    operationId: 'entitlement_eligible',
  });
  assert.equal(entitlement.status, 'NON_PRODUCTION_ELIGIBLE');
  loaded = await env.service.loadAccount(principal());
  assert.equal(loaded.readiness.status, 'ACTIVATION_READY');
  assert.equal(loaded.controlPlaneDraft.activationReadiness, 'ACTIVATION_READY');
  assert.equal(loaded.controlPlaneDraft.authoritativeLifecycleState, null);
  assert.equal(loaded.controlPlaneDraft.executionEligible, false);
  assert.notEqual(loaded.controlPlaneDraft.activationReadiness, 'ACTIVE');
});

test('cross-account and wrong identity conjunctions fail before mutation', async () => {
  const env = makeEnvironment();
  const { allocation } = await provisionDraft(env);
  await initialize(env, ACCOUNT_B);
  await expectCode(
    env.service.savePresentation(principal(ACCOUNT_B), {
      accountId: ACCOUNT_A, username: USERNAME, cardId: CARD_A,
      presentation: presentation(), expectedRevision: 0, operationId: 'cross_present_b',
    }),
    'PRINCIPAL_ACCOUNT_MISMATCH',
  );
  await expectCode(
    env.service.saveRouteIntent(principal(), {
      accountId: ACCOUNT_A, username: OTHER_USERNAME, cardId: allocation.cardId,
      expectedRevision: 0, operationId: 'wrong_username_route', ...route(),
    }),
    'ACCOUNT_CARD_CONJUNCTION_INVALID',
  );
  const wrongAudience = { ...principal(), audience: 'implicitex-transfer-portal' };
  await expectCode(env.service.loadAccount(wrongAudience), 'PRINCIPAL_INVALID');
});

test('service explicitly denies authority publication and execution', () => {
  const env = makeEnvironment();
  assert.deepEqual(env.service.rejectAuthoritativeWrite(), {
    outcome: 'AUTHORITATIVE_WRITE_NOT_AVAILABLE',
    authoritativePublicationAdvanced: false,
    executionEligible: false,
  });
  assert.deepEqual(env.service.rejectExecution(), {
    outcome: 'HOLDER_EXECUTION_UNAVAILABLE',
    executionEligible: false,
    paymentControlEnabled: false,
  });
});

test('local holder adapter survives client recreation and public authority remains independent', async () => {
  const env = makeEnvironment();
  const challengeBrand = makeBrand();
  const viewBrand = makeBrand();
  let publicAdapterCalls = 0;
  let operationSequence = 0;
  let lastChallenge = null;
  const readonlyBrowser = Object.freeze({
    async resolveReadOnlyCard() {
      publicAdapterCalls += 1;
      return viewBrand.make(Object.freeze({
        viewState: 'UNKNOWN', canonicalUsername: USERNAME,
        canonicalUrl: `https://${USERNAME}.coincard.click/`, redirectUrl: null,
        cardId: null, lifecycleOutcome: null,
        publicResolutionOutcome: 'PUBLIC_RESOLUTION_HANDLE_NOT_FOUND',
        routeRecordHash: null, routeRevision: null, fixtureTrustBoundary: null,
        presentationEligible: false, executionEligible: false,
        paymentControlEnabled: false,
      }));
    },
    isReadOnlyViewResult: viewBrand.has,
  });
  const walletChallengeTransport = Object.freeze({
    async issue(_principal, input) {
      lastChallenge = challengeBrand.make(Object.freeze({
        ...input, challengeId: 'challenge_adapter_0001',
        issuedAt: env.now().toISOString(),
        expiresAt: new Date(env.now().getTime() + 10 * 60 * 1000).toISOString(),
      }));
      return lastChallenge;
    },
    async verify(_principal, input) {
      assert.equal(input.challengeId, lastChallenge.challengeId);
      return env.evidenceBrand.make(Object.freeze({
        schemaVersion: 'implicitex.coincard.wallet-proof.v1',
        verified: true, proofId: 'proof_adapter_0001',
        accountId: input.accountId, handle: input.username,
        walletAddress: input.walletAddress, chainId: input.chainId,
        verifiedAt: env.now().toISOString(),
        expiresAt: new Date(env.now().getTime() + 10 * 60 * 1000).toISOString(),
      }));
    },
    isChallengeResult: challengeBrand.has,
    isEvidenceResult: env.evidenceBrand.has,
  });
  const makeAdapter = () => createLocalControlPlaneHolderAdapter({
    client: env.service,
    principal: principal(),
    usernameApi,
    readonlyBrowser,
    walletChallengeTransport,
    normalizeWalletAddress: getAddress,
    clock: () => env.now(),
    operationIdFactory: (kind) => `${kind.toLowerCase()}_${String(++operationSequence).padStart(4, '0')}`,
  });
  const session = Object.freeze({
    schemaVersion: holderModel.SESSION_SCHEMA,
    environment: 'NON_PRODUCTION', origin: holderModel.HOLDER_ORIGIN,
    audience: holderModel.HOLDER_AUDIENCE,
    sessionBoundary: holderModel.SESSION_BOUNDARY,
    authenticated: true, accountId: ACCOUNT_A,
  });

  const adapter = makeAdapter();
  const management = holderModel.createHolderManagement(adapter.dependencies);
  let state = await management.start(session);
  state = management.selectUsername(state, USERNAME);
  state = await management.reserveUsername(state);
  state = await management.establishCardIdentity(state);
  const profile = presentation();
  await adapter.presentationPersistenceApi.save(profile);
  state = management.updatePresentation(state, profile);
  state = await management.configureRoute(state, route());
  state = await management.requestWalletChallenge(state);
  state = await management.verifyWalletChallenge(state, 'fixture-signature');
  state = await management.assessEntitlement(state);
  state = management.reviewActivation(state);
  assert.equal(state.workflowState, 'ACTIVATION_READY');
  assert.equal(publicAdapterCalls, 0, 'control-plane writes do not synthesize public authority');

  const reloadedAdapter = makeAdapter();
  const reloadedManagement = holderModel.createHolderManagement(reloadedAdapter.dependencies);
  let reloaded = await reloadedManagement.start(session);
  assert.equal(reloaded.workflowState, 'ACTIVATION_READY');
  assert.equal(reloaded.account.identityAuthority, 'DURABLE_CONTROL_PLANE_DRAFT');
  assert.equal(reloaded.writeDisposition, 'DURABLE_NON_PRODUCTION_CONTROL_PLANE_DRAFT');
  assert.equal(reloaded.executionEligible, false);
  reloaded = await reloadedManagement.refreshPublicPreview(reloaded);
  assert.equal(reloaded.lifecycleState, 'UNKNOWN');
  assert.equal(reloaded.workflowState, 'ACTIVATION_READY');
  assert.equal(publicAdapterCalls, 1);
  assert.equal(reloaded.authoritative.preview.viewState, 'UNKNOWN');
  assert.equal(reloaded.executionEligible, false);
});
