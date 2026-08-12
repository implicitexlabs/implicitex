/**
 * Local/emulator adapter from the durable holder control plane to the frozen
 * holder-management model interfaces.
 *
 * The injected client may be the in-process non-production service used by
 * tests or a later emulator callable client. Public authority remains a
 * separate injected read-only adapter.
 */

'use strict';

const crypto = require('node:crypto');

const ACCOUNT_SOURCE_SCHEMA = 'coin-card-holder-account-source.non-production.v1';

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function brand() {
  const values = new WeakSet();
  return Object.freeze({
    make(value) {
      const result = deepFreeze(value);
      values.add(result);
      return result;
    },
    has(value) {
      try { return values.has(value); } catch (_) { return false; }
    },
  });
}

function defaultOperationId(kind) {
  return `${kind.toLowerCase()}_${crypto.randomUUID().replaceAll('-', '_')}`;
}

function createLocalControlPlaneHolderAdapter(options) {
  if (!options || !options.client || !options.principal) {
    throw new TypeError('control-plane client and holder principal are required');
  }
  const client = options.client;
  const principal = deepFreeze(clone(options.principal));
  const operationIdFactory = options.operationIdFactory || defaultOperationId;
  const walletChallengeTransport = options.walletChallengeTransport;
  const usernameApi = options.usernameApi;
  const readonlyBrowser = options.readonlyBrowser;
  const normalizeWalletAddress = options.normalizeWalletAddress;
  const resultBrands = {
    account: brand(), reservation: brand(), identity: brand(), route: brand(),
    challenge: brand(), evidence: brand(), entitlement: brand(),
  };

  if (!usernameApi || !readonlyBrowser || typeof normalizeWalletAddress !== 'function') {
    throw new TypeError('holder model dependencies are incomplete');
  }

  async function loaded() {
    let value = await client.loadAccount(principal);
    if (!value) value = await client.ensureAccount(principal);
    return value;
  }

  const accountSourceApi = Object.freeze({
    async loadForSession(session) {
      if (!session || session.accountId !== principal.accountId) {
        throw new Error('holder session/account mismatch');
      }
      const value = await loaded();
      return resultBrands.account.make({
        schemaVersion: ACCOUNT_SOURCE_SCHEMA,
        environment: 'NON_PRODUCTION',
        accountId: value.account.accountId,
        username: value.account.username,
        cardId: value.account.cardId,
        originalHolder: value.account.originalHolder,
        entitlementState: value.account.entitlementState,
        route: null,
        controlPlaneDraft: clone(value.controlPlaneDraft),
      });
    },
    isAccountSourceResult: resultBrands.account.has,
  });

  const reservationApi = Object.freeze({
    async reserve(input) {
      const result = await client.reserveUsername(principal, {
        ...clone(input),
        operationId: operationIdFactory('RESERVE_USERNAME', input),
      });
      return resultBrands.reservation.make(result);
    },
    isReservationResult: resultBrands.reservation.has,
  });

  const identityIntentApi = Object.freeze({
    async allocate(input) {
      const result = await client.allocateIdentity(principal, {
        ...clone(input),
        operationId: operationIdFactory('ALLOCATE_IDENTITY', input),
      });
      return resultBrands.identity.make(result);
    },
    isIdentityIntentResult: resultBrands.identity.has,
  });

  const routeIntentApi = Object.freeze({
    async stage(input) {
      const value = await loaded();
      const expectedRevision = value.controlPlaneDraft
        ? value.controlPlaneDraft.routeRevision : 0;
      const result = await client.saveRouteIntent(principal, {
        ...clone(input),
        expectedRevision,
        operationId: operationIdFactory('SAVE_ROUTE_INTENT', { input, expectedRevision }),
      });
      return resultBrands.route.make(result);
    },
    isRouteIntentResult: resultBrands.route.has,
  });

  const walletChallengeApi = Object.freeze({
    async issue(input) {
      if (!walletChallengeTransport || typeof walletChallengeTransport.issue !== 'function'
        || typeof walletChallengeTransport.isChallengeResult !== 'function') {
        throw new Error('wallet challenge transport unavailable');
      }
      const result = await walletChallengeTransport.issue(principal, clone(input));
      if (walletChallengeTransport.isChallengeResult(result) !== true) {
        throw new Error('wallet challenge transport returned untrusted data');
      }
      return resultBrands.challenge.make(result);
    },
    async verify(input) {
      if (!walletChallengeTransport || typeof walletChallengeTransport.verify !== 'function'
        || typeof walletChallengeTransport.isEvidenceResult !== 'function') {
        throw new Error('wallet evidence transport unavailable');
      }
      const evidence = await walletChallengeTransport.verify(principal, clone(input));
      if (walletChallengeTransport.isEvidenceResult(evidence) !== true) {
        throw new Error('wallet evidence transport returned untrusted data');
      }
      const value = await loaded();
      const routeRevision = value.controlPlaneDraft.routeRevision;
      const attached = await client.attachWalletEvidence(principal, {
        accountId: input.accountId,
        username: input.username,
        cardId: input.cardId,
        expectedRouteRevision: routeRevision,
        operationId: operationIdFactory('ATTACH_WALLET_EVIDENCE', {
          proofId: evidence.proofId, routeRevision,
        }),
      }, evidence);
      return resultBrands.evidence.make({
        status: attached.status,
        accountId: attached.accountId,
        username: attached.username,
        cardId: attached.cardId,
        walletAddress: attached.walletAddress,
        chainId: attached.chainId,
        proofId: attached.proofId,
        verifiedAt: attached.verifiedAt,
        expiresAt: attached.expiresAt,
        authoritative: false,
      });
    },
    isChallengeResult: resultBrands.challenge.has,
    isEvidenceResult: resultBrands.evidence.has,
  });

  const entitlementApi = Object.freeze({
    async assess(input) {
      const result = await client.assessEntitlement(principal, {
        ...clone(input),
        username: input.username,
        operationId: operationIdFactory('ASSESS_ENTITLEMENT', input),
      });
      return resultBrands.entitlement.make(result);
    },
    isEntitlementResult: resultBrands.entitlement.has,
  });

  const presentationPersistenceApi = Object.freeze({
    async save(input) {
      const value = await loaded();
      if (!value.controlPlaneDraft) throw new Error('control-plane Coin Card identity required');
      return client.savePresentation(principal, {
        accountId: value.account.accountId,
        username: value.account.username,
        cardId: value.account.cardId,
        presentation: clone(input),
        expectedRevision: value.controlPlaneDraft.presentationRevision,
        operationId: operationIdFactory('SAVE_PRESENTATION', {
          input, expectedRevision: value.controlPlaneDraft.presentationRevision,
        }),
      });
    },
  });

  return deepFreeze({
    dependencies: {
      usernameApi,
      accountSourceApi,
      reservationApi,
      identityIntentApi,
      routeIntentApi,
      walletChallengeApi,
      entitlementApi,
      readonlyBrowser,
      normalizeWalletAddress,
      clock: options.clock,
    },
    presentationPersistenceApi,
    loadPersistedControlPlane: loaded,
    rejectAuthoritativeWrite: client.rejectAuthoritativeWrite,
    rejectExecution: client.rejectExecution,
    persistenceBoundary: 'DURABLE_NON_PRODUCTION_CONTROL_PLANE',
    productionAuthorityClaimed: false,
  });
}

module.exports = Object.freeze({
  createLocalControlPlaneHolderAdapter,
});
