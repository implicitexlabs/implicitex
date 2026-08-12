/**
 * Local/emulator API adapter for the production-shaped holder boundary.
 *
 * Browser code never selects accountId. This test transport simulates the
 * browser cookie jar; a deployed implementation would use credentialed fetch
 * with the HttpOnly __Host- cookie managed by the browser.
 */

'use strict';

const crypto = require('node:crypto');

const ACCOUNT_SOURCE_SCHEMA = 'coin-card-holder-account-source.non-production.v1';
const HOLDER_ORIGIN = 'https://app.coincard.click';

function clone(value) {
  return value === undefined || value === null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function brand() {
  const values = new WeakSet();
  return Object.freeze({
    make(value) { const result = deepFreeze(value); values.add(result); return result; },
    has(value) { try { return values.has(value); } catch (_) { return false; } },
  });
}

function operationId(kind) {
  return `${kind.toLowerCase()}_${crypto.randomUUID().replaceAll('-', '_')}`;
}

function createLocalHolderApiClient(options) {
  if (!options || !options.api || typeof options.api.handle !== 'function') {
    throw new TypeError('local holder API transport is required');
  }
  const api = options.api;
  const origin = options.origin || HOLDER_ORIGIN;
  let cookie = options.restoredSession && options.restoredSession.cookie || null;
  let csrfToken = options.restoredSession && options.restoredSession.csrfToken || null;
  let descriptor = options.restoredSession && clone(options.restoredSession.descriptor) || null;

  async function call(method, path, body, mutation = false) {
    const headers = { Origin: origin };
    if (cookie) headers.Cookie = cookie;
    if (mutation && csrfToken) headers['X-Coincard-CSRF'] = csrfToken;
    const response = await api.handle({ method, path, headers, body });
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(response.body && response.body.message || 'Holder API request failed.');
      error.code = response.body && response.body.error || 'HOLDER_API_FAILED';
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function signIn(authenticationEvidence) {
    const response = await call('POST', '/v1/session', { authenticationEvidence });
    const setCookie = response.headers['Set-Cookie'];
    if (typeof setCookie !== 'string' || !setCookie.startsWith('__Host-coincard_session=')) {
      throw new Error('Host-only Coin Card session cookie was not issued.');
    }
    cookie = setCookie.split(';', 1)[0];
    csrfToken = response.body.csrfToken;
    descriptor = {
      sessionId: response.body.sessionId,
      accountId: response.body.accountId,
      expiresAt: response.body.expiresAt,
      productionAuthentication: response.body.productionAuthentication,
    };
    return deepFreeze(clone(descriptor));
  }

  return Object.freeze({
    signIn,
    get: async (path) => (await call('GET', path)).body,
    mutate: async (path, body) => (await call('POST', path, clone(body), true)).body,
    sessionDescriptor() { return deepFreeze(clone(descriptor)); },
    exportLocalTestCookieJar() {
      return deepFreeze({ cookie, csrfToken, descriptor: clone(descriptor), testOnly: true });
    },
    securityContract: Object.freeze({
      intendedCookie: '__Host-coincard_session',
      httpOnly: true,
      secure: true,
      path: '/',
      domainAttribute: null,
      sameSite: 'Strict',
      origin,
    }),
  });
}

function createAuthenticatedControlPlaneHolderAdapter(options) {
  if (!options || !options.apiClient || !options.usernameApi || !options.readonlyBrowser
    || typeof options.normalizeWalletAddress !== 'function') {
    throw new TypeError('authenticated API client and holder model dependencies are required');
  }
  const client = options.apiClient;
  const usernameApi = options.usernameApi;
  const readonlyBrowser = options.readonlyBrowser;
  const normalizeWalletAddress = options.normalizeWalletAddress;
  const operationIdFactory = options.operationIdFactory || operationId;
  const stepUpTransport = options.stepUpTransport || null;
  const resultBrands = {
    account: brand(), reservation: brand(), identity: brand(), route: brand(),
    challenge: brand(), evidence: brand(), entitlement: brand(),
  };
  const challenges = new Map();

  async function loaded() {
    return (await client.get('/v1/holder')).holder;
  }

  const accountSourceApi = Object.freeze({
    async loadForSession(session) {
      const response = await client.get('/v1/holder');
      if (!session || session.accountId !== response.principal.accountId) {
        throw new Error('authenticated holder session/account mismatch');
      }
      const value = response.holder;
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
      return resultBrands.reservation.make(await client.mutate('/v1/usernames/reserve', {
        username: input.username,
        operationId: operationIdFactory('RESERVE_USERNAME', input),
      }));
    },
    isReservationResult: resultBrands.reservation.has,
  });

  const identityIntentApi = Object.freeze({
    async allocate(input) {
      return resultBrands.identity.make(await client.mutate('/v1/cards/allocate', {
        username: input.username,
        reservationId: input.reservationId,
        operationId: operationIdFactory('ALLOCATE_IDENTITY', input),
      }));
    },
    isIdentityIntentResult: resultBrands.identity.has,
  });

  const routeIntentApi = Object.freeze({
    async stage(input) {
      const value = await loaded();
      const currentRoute = value.controlPlaneDraft && value.controlPlaneDraft.route;
      let stepUpToken;
      if (currentRoute && normalizeWalletAddress(currentRoute.recipientAddress)
        !== normalizeWalletAddress(input.recipientAddress)) {
        if (!stepUpTransport || typeof stepUpTransport.obtain !== 'function') {
          throw new Error('recipient-wallet change requires step-up transport');
        }
        const descriptor = client.sessionDescriptor();
        stepUpToken = await stepUpTransport.obtain({
          subject: (await client.get('/v1/holder')).principal.authenticationSubject,
          accountId: descriptor.accountId,
          sessionId: descriptor.sessionId,
          action: 'CHANGE_RECIPIENT_WALLET',
        });
      }
      const result = await client.mutate('/v1/route-intent', {
        chainId: input.chainId,
        asset: input.asset,
        tokenContractAddress: input.tokenContractAddress,
        recipientAddress: input.recipientAddress,
        expectedRevision: value.controlPlaneDraft ? value.controlPlaneDraft.routeRevision : 0,
        operationId: operationIdFactory('SAVE_ROUTE_INTENT', input),
        ...(stepUpToken ? { stepUpToken } : {}),
      });
      return resultBrands.route.make(result);
    },
    isRouteIntentResult: resultBrands.route.has,
  });

  const walletChallengeApi = Object.freeze({
    async issue() {
      const result = await client.mutate('/v1/wallet/challenge', {});
      challenges.set(result.challengeId, clone(result));
      return resultBrands.challenge.make(result);
    },
    async verify(input) {
      const challenge = challenges.get(input.challengeId);
      if (!challenge) throw new Error('wallet challenge context unavailable');
      const result = await client.mutate('/v1/wallet/verify', {
        challengeId: challenge.challengeId,
        requestId: challenge.requestId,
        signature: input.signature,
        operationId: operationIdFactory('ATTACH_WALLET_EVIDENCE', {
          challengeId: challenge.challengeId,
        }),
      });
      return resultBrands.evidence.make(result);
    },
    isChallengeResult: resultBrands.challenge.has,
    isEvidenceResult: resultBrands.evidence.has,
  });

  const entitlementApi = Object.freeze({
    async assess(input) {
      return resultBrands.entitlement.make(await client.mutate('/v1/entitlement/assess', {
        operationId: operationIdFactory('ASSESS_ENTITLEMENT', input),
      }));
    },
    isEntitlementResult: resultBrands.entitlement.has,
  });

  const presentationPersistenceApi = Object.freeze({
    async save(presentation) {
      const value = await loaded();
      if (!value.controlPlaneDraft) throw new Error('control-plane identity required');
      return client.mutate('/v1/presentation', {
        presentation: clone(presentation),
        expectedRevision: value.controlPlaneDraft.presentationRevision,
        operationId: operationIdFactory('SAVE_PRESENTATION', presentation),
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
    rejectAuthoritativeWrite: () => Object.freeze({
      outcome: 'AUTHORITATIVE_WRITE_NOT_AVAILABLE', executionEligible: false,
    }),
    rejectExecution: () => Object.freeze({
      outcome: 'HOLDER_EXECUTION_UNAVAILABLE', executionEligible: false,
      paymentControlEnabled: false,
    }),
    persistenceBoundary: 'AUTHENTICATED_API_DURABLE_NON_PRODUCTION_CONTROL_PLANE',
    productionAuthorityClaimed: false,
  });
}

module.exports = Object.freeze({
  createLocalHolderApiClient,
  createAuthenticatedControlPlaneHolderAdapter,
});
