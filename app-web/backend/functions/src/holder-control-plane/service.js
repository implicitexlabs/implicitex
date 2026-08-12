/**
 * Application service for durable non-production Coin Card holder intent.
 */

'use strict';

const crypto = require('node:crypto');
const {
  CONTROL_PLANE_DRAFT_SCHEMA,
  ENTITLEMENT_STATES,
  ENVIRONMENT,
  HolderControlPlaneError,
  RESERVATION_TTL_MS,
  asDate,
  clone,
  deepFreeze,
  fingerprintRequest,
  normalizeCardId,
  normalizeExpectedRevision,
  normalizeOperationId,
  normalizePresentation,
  normalizePrincipal,
  normalizeRoute,
  normalizeUsername,
} = require('./contract');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function fail(code, message, details = null) {
  throw new HolderControlPlaneError(code, message, details);
}

function nowFrom(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('CLOCK_INVALID', 'Control-plane clock is invalid.');
  return date;
}

function randomOpaqueId(prefix, length = 26) {
  const bytes = crypto.randomBytes(length);
  let value = '';
  for (let index = 0; index < length; index += 1) value += CROCKFORD[bytes[index] & 31];
  return `${prefix}${value}`;
}

function normalizeMutationIdentity(principal, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('REQUEST_INVALID', 'Control-plane mutation input must be an object.');
  }
  const username = normalizeUsername(input.username);
  const cardId = normalizeCardId(input.cardId);
  if (input.accountId !== principal.accountId) {
    fail('PRINCIPAL_ACCOUNT_MISMATCH', 'Authenticated holder does not own the target account.');
  }
  return { accountId: principal.accountId, username, cardId };
}

function iso(value, label) {
  return value === null || value === undefined ? null : asDate(value, label).toISOString();
}

function projectLoaded(value) {
  if (!value) return null;
  const { account, card, readiness } = value;
  const route = card && card.routeIntent ? {
    network: card.routeIntent.network,
    chainId: card.routeIntent.chainId,
    asset: card.routeIntent.asset,
    tokenContractAddress: card.routeIntent.tokenContractAddress,
    recipientAddress: card.routeIntent.recipientAddress,
    revision: String(card.routeRevision),
    proposedRevision: String(card.routeRevision),
    lastAuthorizedUpdate: null,
    lastControlPlaneUpdate: iso(card.updatedAt, 'card.updatedAt'),
    walletControlState: readiness.walletControlState,
    authoritative: false,
  } : null;
  const controlPlaneDraft = card ? {
    schemaVersion: CONTROL_PLANE_DRAFT_SCHEMA,
    environment: ENVIRONMENT,
    authorityClaimed: false,
    accountId: account.accountId,
    username: account.username,
    cardId: account.cardId,
    presentation: clone(card.presentationDraft),
    presentationRevision: card.presentationRevision,
    route: clone(route),
    routeRevision: card.routeRevision,
    walletEvidence: card.walletEvidence ? {
      ...clone(card.walletEvidence),
      verifiedAt: iso(card.walletEvidence.verifiedAt, 'walletEvidence.verifiedAt'),
      expiresAt: iso(card.walletEvidence.expiresAt, 'walletEvidence.expiresAt'),
    } : null,
    walletControlState: readiness.walletControlState,
    entitlementState: card.entitlementState,
    activationReadiness: readiness.status,
    authoritativeLifecycleState: null,
    authoritativeStateSource: 'EXTERNAL_READ_ONLY_NOT_STORED',
    executionEligible: false,
    paymentControlEnabled: false,
  } : null;
  return deepFreeze({
    schemaVersion: 'coin-card-holder-control-plane-loaded.v1',
    environment: ENVIRONMENT,
    account: {
      accountId: account.accountId,
      username: account.username,
      cardId: account.cardId,
      originalHolder: account.originalHolder,
      entitlementState: account.entitlementState,
      activationReadiness: readiness.status,
      createdAt: iso(account.createdAt, 'account.createdAt'),
      updatedAt: iso(account.updatedAt, 'account.updatedAt'),
      controlPlaneRevision: account.controlPlaneRevision,
    },
    controlPlaneDraft,
    readiness: clone(readiness),
    authoritativeLifecycleState: null,
    authoritativeStateSource: 'EXTERNAL_READ_ONLY_NOT_STORED',
    authoritativePublicationAdvanced: false,
    executionEligible: false,
    paymentControlEnabled: false,
  });
}

function createHolderControlPlaneService(options) {
  if (!options || !options.store) throw new TypeError('holder control-plane store is required');
  const store = options.store;
  const clock = options.clock || (() => new Date());
  const reservationIdFactory = options.reservationIdFactory
    || (() => randomOpaqueId('reservation_', 24));
  const cardIdFactory = options.cardIdFactory || (() => randomOpaqueId('cc_', 26));
  const walletEvidenceAuthority = options.walletEvidenceAuthority || null;
  const entitlementAuthority = options.entitlementAuthority || null;

  async function ensureAccount(principalInput) {
    const principal = normalizePrincipal(principalInput);
    await store.ensureAccount({ accountId: principal.accountId, now: nowFrom(clock) });
    return loadAccount(principal);
  }

  async function loadAccount(principalInput) {
    const principal = normalizePrincipal(principalInput);
    const value = await store.loadAccount({ accountId: principal.accountId, now: nowFrom(clock) });
    return projectLoaded(value);
  }

  async function reserveUsername(principalInput, request) {
    const principal = normalizePrincipal(principalInput);
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      fail('REQUEST_INVALID', 'Username reservation request is invalid.');
    }
    if (request.accountId !== principal.accountId) {
      fail('PRINCIPAL_ACCOUNT_MISMATCH', 'Authenticated holder does not own the target account.');
    }
    const username = normalizeUsername(request.username);
    const operationId = normalizeOperationId(request.operationId);
    const canonicalRequest = { username, intendedOperation: 'ALLOCATE_COIN_CARD_IDENTITY' };
    const now = nowFrom(clock);
    const result = await store.reserveUsername({
      accountId: principal.accountId,
      username,
      operationId,
      operationType: 'RESERVE_USERNAME',
      requestFingerprint: fingerprintRequest('RESERVE_USERNAME', principal.accountId, canonicalRequest),
      reservationId: reservationIdFactory(),
      now,
      expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
    });
    return deepFreeze({
      ...clone(result),
      createdAt: iso(result.createdAt, 'reservation.createdAt'),
      expiresAt: iso(result.expiresAt, 'reservation.expiresAt'),
    });
  }

  async function allocateIdentity(principalInput, request) {
    const principal = normalizePrincipal(principalInput);
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      fail('REQUEST_INVALID', 'Identity allocation request is invalid.');
    }
    if (request.accountId !== principal.accountId) {
      fail('PRINCIPAL_ACCOUNT_MISMATCH', 'Authenticated holder does not own the target account.');
    }
    const username = normalizeUsername(request.username);
    const operationId = normalizeOperationId(request.operationId);
    const reservationId = normalizeOperationId(request.reservationId);
    const canonicalRequest = { username, reservationId };
    const result = await store.allocateIdentity({
      accountId: principal.accountId,
      username,
      reservationId,
      cardId: normalizeCardId(cardIdFactory()),
      operationId,
      operationType: 'ALLOCATE_IDENTITY',
      requestFingerprint: fingerprintRequest('ALLOCATE_IDENTITY', principal.accountId, canonicalRequest),
      now: nowFrom(clock),
    });
    return deepFreeze(result);
  }

  async function savePresentation(principalInput, request) {
    const principal = normalizePrincipal(principalInput);
    const identity = normalizeMutationIdentity(principal, request);
    const presentation = normalizePresentation(request.presentation);
    const expectedRevision = normalizeExpectedRevision(request.expectedRevision);
    const operationId = normalizeOperationId(request.operationId);
    const canonicalRequest = { ...identity, presentation, expectedRevision };
    return deepFreeze(await store.savePresentation({
      ...identity,
      presentation,
      expectedRevision,
      operationId,
      operationType: 'SAVE_PRESENTATION',
      requestFingerprint: fingerprintRequest('SAVE_PRESENTATION', identity.accountId, canonicalRequest),
      now: nowFrom(clock),
    }));
  }

  async function saveRouteIntent(principalInput, request) {
    const principal = normalizePrincipal(principalInput);
    const identity = normalizeMutationIdentity(principal, request);
    const route = normalizeRoute(request);
    const expectedRevision = normalizeExpectedRevision(request.expectedRevision);
    const operationId = normalizeOperationId(request.operationId);
    const canonicalRequest = { ...identity, route, expectedRevision };
    return deepFreeze(await store.saveRouteIntent({
      ...identity,
      route,
      expectedRevision,
      operationId,
      operationType: 'SAVE_ROUTE_INTENT',
      requestFingerprint: fingerprintRequest('SAVE_ROUTE_INTENT', identity.accountId, canonicalRequest),
      now: nowFrom(clock),
    }));
  }

  async function attachWalletEvidence(principalInput, request, evidence) {
    const principal = normalizePrincipal(principalInput);
    const identity = normalizeMutationIdentity(principal, request);
    const expectedRouteRevision = normalizeExpectedRevision(
      request.expectedRouteRevision, 'expectedRouteRevision',
    );
    const operationId = normalizeOperationId(request.operationId);
    if (!walletEvidenceAuthority
      || typeof walletEvidenceAuthority.bindVerifiedProof !== 'function'
      || typeof walletEvidenceAuthority.isVerifiedEvidence !== 'function') {
      fail('WALLET_EVIDENCE_AUTHORITY_UNAVAILABLE', 'Wallet evidence authority is unavailable.');
    }
    const loaded = await store.loadAccount({ accountId: identity.accountId, now: nowFrom(clock) });
    if (!loaded || !loaded.card || !loaded.card.routeIntent
      || loaded.card.routeRevision !== expectedRouteRevision
      || loaded.account.username !== identity.username
      || loaded.account.cardId !== identity.cardId) {
      fail('STALE_EVIDENCE_ROUTE_REVISION', 'Current holder route context does not match.');
    }
    const boundEvidence = walletEvidenceAuthority.bindVerifiedProof(evidence, {
      ...identity,
      route: clone(loaded.card.routeIntent),
      routeRevision: loaded.card.routeRevision,
    });
    let genuine = false;
    try { genuine = walletEvidenceAuthority.isVerifiedEvidence(boundEvidence) === true; } catch (_) {
      genuine = false;
    }
    if (!genuine) fail('WALLET_EVIDENCE_UNTRUSTED', 'Genuine wallet-verifier evidence is required.');
    const publicEvidence = {
      status: boundEvidence.status,
      proofId: boundEvidence.proofId,
      accountId: boundEvidence.accountId,
      username: boundEvidence.username,
      cardId: boundEvidence.cardId,
      walletAddress: boundEvidence.walletAddress,
      chainId: boundEvidence.chainId,
      tokenContractAddress: boundEvidence.tokenContractAddress,
      routeRevision: boundEvidence.routeRevision,
      verifiedAt: iso(boundEvidence.verifiedAt, 'evidence.verifiedAt'),
      expiresAt: iso(boundEvidence.expiresAt, 'evidence.expiresAt'),
    };
    const canonicalRequest = { ...identity, expectedRouteRevision, evidence: publicEvidence };
    return deepFreeze(await store.attachWalletEvidence({
      ...identity,
      expectedRouteRevision,
      evidence: publicEvidence,
      operationId,
      operationType: 'ATTACH_WALLET_EVIDENCE',
      requestFingerprint: fingerprintRequest(
        'ATTACH_WALLET_EVIDENCE', identity.accountId, canonicalRequest,
      ),
      now: nowFrom(clock),
    }));
  }

  async function assessEntitlement(principalInput, request) {
    const principal = normalizePrincipal(principalInput);
    const identity = normalizeMutationIdentity(principal, request);
    const operationId = normalizeOperationId(request.operationId);
    if (!entitlementAuthority || typeof entitlementAuthority.assess !== 'function'
      || typeof entitlementAuthority.isEntitlementResult !== 'function') {
      fail('ENTITLEMENT_AUTHORITY_UNAVAILABLE', 'Entitlement authority is unavailable.');
    }
    const result = await entitlementAuthority.assess(principal, identity);
    let genuine = false;
    try { genuine = entitlementAuthority.isEntitlementResult(result) === true; } catch (_) { genuine = false; }
    if (!genuine
      || result.accountId !== identity.accountId
      || result.cardId !== identity.cardId
      || !Object.values(ENTITLEMENT_STATES).includes(result.status)) {
      fail('ENTITLEMENT_RESULT_INVALID', 'Entitlement authority result is invalid.');
    }
    const canonicalRequest = { ...identity, entitlementStatus: result.status };
    return deepFreeze(await store.persistEntitlement({
      ...identity,
      entitlement: { status: result.status },
      operationId,
      operationType: 'ASSESS_ENTITLEMENT',
      requestFingerprint: fingerprintRequest(
        'ASSESS_ENTITLEMENT', identity.accountId, canonicalRequest,
      ),
      now: nowFrom(clock),
    }));
  }

  function rejectAuthoritativeWrite() {
    return deepFreeze({
      outcome: 'AUTHORITATIVE_WRITE_NOT_AVAILABLE',
      authoritativePublicationAdvanced: false,
      executionEligible: false,
    });
  }

  function rejectExecution() {
    return deepFreeze({
      outcome: 'HOLDER_EXECUTION_UNAVAILABLE',
      executionEligible: false,
      paymentControlEnabled: false,
    });
  }

  return Object.freeze({
    ensureAccount,
    loadAccount,
    reserveUsername,
    allocateIdentity,
    savePresentation,
    saveRouteIntent,
    attachWalletEvidence,
    assessEntitlement,
    rejectAuthoritativeWrite,
    rejectExecution,
  });
}

module.exports = Object.freeze({
  createHolderControlPlaneService,
  projectLoaded,
});
