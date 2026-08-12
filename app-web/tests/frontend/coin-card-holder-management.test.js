'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { getAddress } = require('ethers');

const usernameApi = require('../../frontend/public/card/coin-card-canonical-username.js');
const holderModel = require('../../holder-management/coin-card-holder-model.js');

const ACCOUNT_ID = 'acct_01KZJTH0XZWTSVXNAJ23Z1QYR8';
const CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';
const OTHER_CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWF';
const USERNAME = 'antoinedennison';
const WALLET = '0x2489587c9da6eab970a5479ba70273ba37961221';
const NOW = '2026-08-11T12:02:00.000Z';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function brandedFactory() {
  const results = new WeakSet();
  return {
    make(value) {
      const result = deepFreeze(value);
      results.add(result);
      return result;
    },
    has(value) {
      try { return results.has(value); } catch { return false; }
    },
  };
}

function makeHarness(options = {}) {
  const brands = {
    account: brandedFactory(),
    reservation: brandedFactory(),
    identity: brandedFactory(),
    route: brandedFactory(),
    challenge: brandedFactory(),
    evidence: brandedFactory(),
    entitlement: brandedFactory(),
    view: brandedFactory(),
  };
  const existing = options.existing === true;
  const account = options.account || {
    schemaVersion: holderModel.ACCOUNT_SOURCE_SCHEMA,
    environment: 'NON_PRODUCTION',
    accountId: ACCOUNT_ID,
    username: existing ? USERNAME : null,
    cardId: existing ? CARD_ID : null,
    originalHolder: true,
    entitlementState: existing ? 'NON_PRODUCTION_ELIGIBLE' : 'ENTITLEMENT_REQUIRED',
    route: existing ? {
      recipientAddress: WALLET,
      network: 'Polygon',
      chainId: 137,
      asset: 'USDC',
      tokenContractAddress: holderModel.ROUTE_POLICY.tokenContractAddress,
      revision: '7',
      lastAuthorizedUpdate: NOW,
      walletControlState: 'WALLET_CONTROL_VERIFIED',
    } : null,
  };
  let issuedChallenge = null;
  let publicViewState = options.publicViewState || (existing ? 'ACTIVE' : 'UNKNOWN');
  let publicViewCardId = Object.prototype.hasOwnProperty.call(options, 'publicViewCardId')
    ? options.publicViewCardId
    : (publicViewState === 'ACTIVE' ? CARD_ID : null);

  const dependencies = {
    usernameApi,
    accountSourceApi: {
      async loadForSession() { return brands.account.make(account); },
      isAccountSourceResult: brands.account.has,
    },
    reservationApi: {
      async reserve(input) {
        return brands.reservation.make({
          status: 'RESERVED',
          authoritative: false,
          reservationId: 'reservation-1',
          accountId: input.accountId,
          username: input.username,
          expiresAt: options.reservationExpiresAt || '2026-08-11T12:30:00.000Z',
        });
      },
      isReservationResult: brands.reservation.has,
    },
    identityIntentApi: {
      async allocate(input) {
        return brands.identity.make({
          authoritative: false,
          accountId: input.accountId,
          username: input.username,
          cardId: CARD_ID,
          reservationId: input.reservationId,
        });
      },
      isIdentityIntentResult: brands.identity.has,
    },
    routeIntentApi: {
      async stage(input) {
        return brands.route.make({
          ...input,
          authoritative: false,
          intentId: 'route-intent-1',
          proposedRevision: existing ? '8' : '1',
        });
      },
      isRouteIntentResult: brands.route.has,
    },
    walletChallengeApi: {
      async issue(input) {
        issuedChallenge = brands.challenge.make({
          ...input,
          challengeId: 'challenge-1',
          issuedAt: '2026-08-11T12:00:00.000Z',
          expiresAt: '2026-08-11T12:10:00.000Z',
        });
        return issuedChallenge;
      },
      async verify(input) {
        assert.equal(input.challengeId, issuedChallenge.challengeId);
        if (options.evidenceStatus === 'EXPIRED') {
          return brands.evidence.make({ status: 'EXPIRED' });
        }
        return brands.evidence.make({
          status: 'VERIFIED',
          accountId: options.evidenceAccountId || input.accountId,
          username: options.evidenceUsername || input.username,
          cardId: options.evidenceCardId || input.cardId,
          walletAddress: options.evidenceWallet || input.walletAddress,
          chainId: options.evidenceChainId || input.chainId,
        });
      },
      isChallengeResult: brands.challenge.has,
      isEvidenceResult: brands.evidence.has,
    },
    entitlementApi: {
      async assess(input) {
        return brands.entitlement.make({
          status: options.entitlementStatus || 'NON_PRODUCTION_ELIGIBLE',
          accountId: input.accountId,
          cardId: input.cardId,
        });
      },
      isEntitlementResult: brands.entitlement.has,
    },
    readonlyBrowser: {
      async resolveReadOnlyCard() {
        if (options.previewThrows) throw new Error('source unavailable');
        if (options.unbrandedPreview) return deepFreeze({ viewState: publicViewState });
        return brands.view.make({
          viewState: publicViewState,
          canonicalUsername: USERNAME,
          canonicalUrl: `https://${USERNAME}.coincard.click/`,
          redirectUrl: null,
          cardId: publicViewCardId,
          lifecycleOutcome: publicViewState === 'ACTIVE' ? 'LIFECYCLE_ACTIVE' : null,
          publicResolutionOutcome: `PUBLIC_RESOLUTION_${publicViewState}`,
          routeRecordHash: publicViewState === 'ACTIVE' ? `sha256:${'a'.repeat(64)}` : null,
          routeRevision: publicViewState === 'ACTIVE' ? '7' : null,
          fixtureTrustBoundary: 'NON_PRODUCTION_TEST_FIXTURE',
          presentationEligible: publicViewState === 'ACTIVE',
          executionEligible: false,
          paymentControlEnabled: false,
        });
      },
      isReadOnlyViewResult: brands.view.has,
    },
    normalizeWalletAddress: getAddress,
    clock: () => new Date(NOW),
  };
  const management = holderModel.createHolderManagement(dependencies);
  const session = deepFreeze({
    schemaVersion: holderModel.SESSION_SCHEMA,
    environment: 'NON_PRODUCTION',
    origin: holderModel.HOLDER_ORIGIN,
    audience: holderModel.HOLDER_AUDIENCE,
    sessionBoundary: holderModel.SESSION_BOUNDARY,
    authenticated: true,
    accountId: ACCOUNT_ID,
  });

  return {
    management,
    session,
    setPublicView(viewState, cardId = viewState === 'ACTIVE' ? CARD_ID : null) {
      publicViewState = viewState;
      publicViewCardId = cardId;
    },
  };
}

async function buildIdentity(harness) {
  let state = await harness.management.start(harness.session);
  state = harness.management.selectUsername(state, USERNAME);
  state = await harness.management.reserveUsername(state);
  state = await harness.management.establishCardIdentity(state);
  return state;
}

async function stageCompleteDraft(harness) {
  let state = await buildIdentity(harness);
  state = harness.management.updatePresentation(state, {
    avatarUrl: 'https://example.test/avatar.png',
    bannerUrl: 'https://example.test/banner.png',
    bio: 'A bounded profile.',
    externalUrl: 'https://example.com/',
  });
  state = await harness.management.configureRoute(state, {
    chainId: 137,
    asset: 'USDC',
    tokenContractAddress: holderModel.ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET,
  });
  return state;
}

test('new holder flow reaches ACTIVATION_READY without advancing authority or execution', async () => {
  const harness = makeHarness();
  let state = await harness.management.start(harness.session);
  assert.equal(state.workflowState, 'ACCOUNT_READY');
  state = harness.management.selectUsername(state, USERNAME);
  assert.equal(state.workflowState, 'USERNAME_SELECTED');
  state = await harness.management.reserveUsername(state);
  assert.equal(state.workflowState, 'USERNAME_RESERVED');
  state = await harness.management.establishCardIdentity(state);
  assert.equal(state.workflowState, 'PRESENTATION_REQUIRED');
  state = harness.management.updatePresentation(state, {
    avatarUrl: 'https://example.test/avatar.png',
    bannerUrl: null,
    bio: 'Antoine',
    externalUrl: 'https://example.com/',
  });
  assert.equal(state.workflowState, 'ROUTING_REQUIRED');
  state = await harness.management.configureRoute(state, {
    chainId: 137,
    asset: 'USDC',
    tokenContractAddress: holderModel.ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET,
  });
  assert.equal(state.walletControlState, 'WALLET_CONTROL_UNVERIFIED');
  state = await harness.management.requestWalletChallenge(state);
  assert.equal(state.walletControlState, 'CHALLENGE_REQUIRED');
  state = await harness.management.verifyWalletChallenge(state, 'fixture-signature');
  assert.equal(state.walletControlState, 'WALLET_CONTROL_VERIFIED');
  state = await harness.management.assessEntitlement(state);
  assert.equal(state.workflowState, 'REVIEW_REQUIRED');
  state = harness.management.reviewActivation(state);

  assert.equal(state.workflowState, 'ACTIVATION_READY');
  assert.equal(state.lifecycleState, 'UNKNOWN');
  assert.equal(state.executionEligible, false);
  assert.equal(state.paymentControlEnabled, false);
  assert.equal(state.authoritativePublicationAdvanced, false);
  assert.equal(state.writeDisposition, 'LOCAL_NON_PRODUCTION_DRAFT');
  assert.equal(state.canonicalUrl, 'https://antoinedennison.coincard.click/');
  assert.ok(Object.isFrozen(state));
  assert.equal(harness.management.isHolderState(state), true);
});

test('current username boundaries are enforced before holder identity creation', async () => {
  async function fresh() {
    const harness = makeHarness();
    return { harness, state: await harness.management.start(harness.session) };
  }
  for (const invalid of ['abc', 'a_bcd', 'Abcd', '-abcd', 'abcd-', 'ab cd', 'ábcd']) {
    const { harness, state } = await fresh();
    assert.throws(() => harness.management.selectUsername(state, invalid), /username invalid/, invalid);
  }
  for (const valid of ['abcd', 'a'.repeat(30), 'a'.repeat(31), 'a'.repeat(32), 'ab--cd']) {
    const { harness, state } = await fresh();
    const selected = harness.management.selectUsername(state, valid);
    assert.equal(selected.draft.username, valid);
  }
  const { harness, state } = await fresh();
  assert.throws(
    () => harness.management.selectUsername(state, 'https://coincard.click/antoinedennison'),
    /username invalid/,
    'path alias is not a second username',
  );
});

test('one-account/one-card consistency and strict session isolation fail closed', async () => {
  const existing = makeHarness({ existing: true });
  const state = await existing.management.start(existing.session);
  assert.throws(() => existing.management.selectUsername(state, 'anothername'), /already has/);
  await assert.rejects(() => existing.management.establishCardIdentity(state), /already has/);

  const disagreement = makeHarness({
    account: {
      schemaVersion: holderModel.ACCOUNT_SOURCE_SCHEMA,
      environment: 'NON_PRODUCTION', accountId: ACCOUNT_ID,
      username: USERNAME, cardId: null, originalHolder: true, route: null,
    },
  });
  await assert.rejects(() => disagreement.management.start(disagreement.session), /identity disagreement/);

  const wrongAudience = { ...existing.session, audience: 'implicitex-transfer-portal' };
  await assert.rejects(() => existing.management.start(wrongAudience), /session boundary invalid/);
});

test('presentation policy is bounded and cannot mutate route authority', async () => {
  const harness = makeHarness();
  let state = await stageCompleteDraft(harness);
  const routeBefore = state.draft.route;
  const authoritativeBefore = state.authoritative;
  state = harness.management.updatePresentation(state, {
    avatarUrl: 'https://example.test/new.png',
    bannerUrl: '', bio: 'Changed profile only', externalUrl: '',
  });
  assert.deepEqual(state.draft.route, routeBefore);
  assert.deepEqual(state.authoritative, authoritativeBefore);
  assert.equal(state.draft.presentation.policyClassification, 'LOCAL_PRODUCT_POLICY_NOT_CRYPTOGRAPHIC_AUTHORITY');
  assert.throws(() => harness.management.updatePresentation(state, {
    avatarUrl: 'javascript:alert(1)', bio: '', bannerUrl: '', externalUrl: '',
  }), /bounded HTTPS URL/);
  assert.throws(() => harness.management.updatePresentation(state, {
    avatarUrl: '', bannerUrl: '', bio: 'a'.repeat(161), externalUrl: '',
  }), /bio exceeds/);
});

test('route editor permits only native Polygon USDC and canonical EVM wallets', async () => {
  const harness = makeHarness();
  const state = await buildIdentity(harness);
  const base = {
    chainId: 137, asset: 'USDC',
    tokenContractAddress: holderModel.ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET,
  };
  await assert.rejects(() => harness.management.configureRoute(state, { ...base, chainId: 1 }), /unsupported/);
  await assert.rejects(() => harness.management.configureRoute(state, { ...base, asset: 'USDT' }), /unsupported/);
  await assert.rejects(() => harness.management.configureRoute(state, {
    ...base, tokenContractAddress: '0x1111111111111111111111111111111111111111',
  }), /unsupported/);
  await assert.rejects(() => harness.management.configureRoute(state, {
    ...base, recipientAddress: 'not-a-wallet',
  }), /wallet invalid/);
  const configured = await harness.management.configureRoute(state, base);
  assert.equal(configured.draft.route.chainId, 137);
  assert.equal(configured.draft.route.asset, 'USDC');
  assert.equal(configured.draft.route.recipientAddress, getAddress(WALLET));
  assert.equal(configured.draft.route.authoritative, false);
});

test('wallet-control evidence states bind username, card, chain, and route', async () => {
  const expiredHarness = makeHarness({ evidenceStatus: 'EXPIRED' });
  let expired = await stageCompleteDraft(expiredHarness);
  expired = await expiredHarness.management.requestWalletChallenge(expired);
  expired = await expiredHarness.management.verifyWalletChallenge(expired, 'fixture');
  assert.equal(expired.walletControlState, 'EVIDENCE_EXPIRED');
  assert.equal(expired.workflowState, 'WALLET_EVIDENCE_REQUIRED');

  const mismatchedHarness = makeHarness({ evidenceCardId: OTHER_CARD_ID });
  let mismatched = await stageCompleteDraft(mismatchedHarness);
  mismatched = await mismatchedHarness.management.requestWalletChallenge(mismatched);
  await assert.rejects(
    () => mismatchedHarness.management.verifyWalletChallenge(mismatched, 'fixture'),
    /binding mismatch/,
  );

  const updateHarness = makeHarness({ existing: true });
  let update = await updateHarness.management.start(updateHarness.session);
  update = await updateHarness.management.configureRoute(update, {
    chainId: 137, asset: 'USDC',
    tokenContractAddress: holderModel.ROUTE_POLICY.tokenContractAddress,
    recipientAddress: WALLET,
  });
  assert.equal(update.walletControlState, 'ROUTE_UPDATE_REQUIRES_EVIDENCE');
  assert.equal(update.workflowState, 'ROUTE_UPDATE_REQUIRES_EVIDENCE');
});

test('holder lifecycle always comes from branded public adapter results and remains non-executable', async () => {
  for (const lifecycle of Object.values(holderModel.LIFECYCLE_STATES)) {
    const harness = makeHarness({
      existing: true,
      publicViewState: lifecycle,
      publicViewCardId: lifecycle === 'ACTIVE' ? CARD_ID : null,
    });
    let state = await harness.management.start(harness.session);
    state = await harness.management.refreshPublicPreview(state);
    assert.equal(state.lifecycleState, lifecycle, lifecycle);
    assert.equal(state.executionEligible, false, lifecycle);
    assert.equal(state.paymentControlEnabled, false, lifecycle);
    if (lifecycle === 'ACTIVE') assert.equal(state.workflowState, 'ACTIVE_MANAGEMENT');
    if (lifecycle === 'TOMBSTONED') {
      assert.equal(state.holderAction, 'ORIGINAL_HOLDER_RESTORATION_ONLY');
    }
  }

  const mismatch = makeHarness({ existing: true, publicViewState: 'ACTIVE', publicViewCardId: OTHER_CARD_ID });
  let state = await mismatch.management.start(mismatch.session);
  state = await mismatch.management.refreshPublicPreview(state);
  assert.equal(state.lifecycleState, 'INVALID');

  const staleOrMalformed = makeHarness({ existing: true, unbrandedPreview: true });
  state = await staleOrMalformed.management.start(staleOrMalformed.session);
  state = await staleOrMalformed.management.refreshPublicPreview(state);
  assert.equal(state.lifecycleState, 'INVALID');

  const unavailable = makeHarness({ existing: true, previewThrows: true });
  state = await unavailable.management.start(unavailable.session);
  state = await unavailable.management.refreshPublicPreview(state);
  assert.equal(state.lifecycleState, 'AUTHORITY_UNAVAILABLE');
});

test('authoritative writes and payment execution are explicit immutable denials', async () => {
  const harness = makeHarness({ existing: true });
  const state = await harness.management.start(harness.session);
  const write = harness.management.rejectAuthoritativeWrite(state);
  const execution = harness.management.rejectExecution(state);
  assert.deepEqual(write, {
    outcome: 'AUTHORITATIVE_WRITE_NOT_AVAILABLE',
    stateUnchanged: true,
    authoritativePublicationAdvanced: false,
    executionEligible: false,
  });
  assert.deepEqual(execution, {
    outcome: 'HOLDER_EXECUTION_UNAVAILABLE',
    stateUnchanged: true,
    executionEligible: false,
    paymentControlEnabled: false,
  });
  assert.ok(Object.isFrozen(write));
  assert.ok(Object.isFrozen(execution));
});
