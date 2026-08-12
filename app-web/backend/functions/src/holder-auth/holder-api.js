/**
 * Framework-neutral, production-shaped Coin Card holder API.
 *
 * This is intentionally not exported from Firebase Functions in this
 * milestone. Tests invoke it in process over a request/response-shaped seam.
 */

'use strict';

const { getAddress } = require('ethers');
const {
  HOLDER_ORIGIN,
  HolderAuthenticationError,
  asControlPlanePrincipal,
  assertExpectedOrigin,
  fail,
} = require('./contract');
const { HolderControlPlaneError } = require('../holder-control-plane/contract');
const { WalletChallengeError } = require('../wallet-challenge/domain');

const MUTATION_PATHS = new Set([
  '/v1/usernames/reserve',
  '/v1/cards/allocate',
  '/v1/presentation',
  '/v1/route-intent',
  '/v1/wallet/challenge',
  '/v1/wallet/verify',
  '/v1/entitlement/assess',
]);

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [name, value] of Object.entries(headers || {})) {
    normalized[String(name).toLowerCase()] = Array.isArray(value) ? value.join(',') : String(value);
  }
  return normalized;
}

function requireBody(request) {
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)
    || Object.getPrototypeOf(request.body) !== Object.prototype) {
    fail('REQUEST_INVALID', 'JSON object request body is required.');
  }
  if (Object.prototype.hasOwnProperty.call(request.body, 'accountId')) {
    fail('CALLER_ACCOUNT_ID_DENIED', 'The authenticated session selects the holder account.');
  }
  return request.body;
}

function corsHeaders() {
  return Object.freeze({
    'Access-Control-Allow-Origin': HOLDER_ORIGIN,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, X-Coincard-CSRF',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  });
}

function errorStatus(error) {
  const code = error && error.code;
  if (['SESSION_REQUIRED', 'SESSION_EXPIRED_OR_REVOKED', 'AUTH_TOKEN_INVALID',
    'AUTH_TOKEN_SIGNATURE_INVALID', 'AUTH_TOKEN_CLAIMS_INVALID'].includes(code)) return 401;
  if (['ORIGIN_DENIED', 'CSRF_REQUIRED', 'CSRF_INVALID', 'STEP_UP_REQUIRED',
    'STEP_UP_INVALID', 'CALLER_ACCOUNT_ID_DENIED', 'PRINCIPAL_ACCOUNT_MISMATCH',
    'ACCOUNT_MAPPING_CONFLICT'].includes(code)) return 403;
  if (['STALE_PRESENTATION_REVISION', 'STALE_ROUTE_REVISION', 'IDEMPOTENCY_CONFLICT',
    'USERNAME_RESERVED', 'ACCOUNT_ALREADY_ASSIGNED', 'WALLET_EVIDENCE_REPLAYED'].includes(code)) return 409;
  if (code === 'ROUTE_NOT_FOUND') return 404;
  if (error instanceof HolderAuthenticationError || error instanceof HolderControlPlaneError
    || error instanceof WalletChallengeError) return 400;
  return 500;
}

function publicError(error) {
  const known = error instanceof HolderAuthenticationError
    || error instanceof HolderControlPlaneError || error instanceof WalletChallengeError;
  return Object.freeze({
    error: known ? error.code : 'INTERNAL_FAILURE',
    message: known ? error.message : 'Holder API failed closed.',
  });
}

function createHolderApi(options) {
  if (!options || !options.sessionService || !options.controlPlaneService
    || !options.walletChallengeService || !options.stepUpVerifier) {
    throw new TypeError('session, control-plane, wallet, and step-up services are required');
  }
  const sessionService = options.sessionService;
  const control = options.controlPlaneService;
  const wallet = options.walletChallengeService;
  const stepUp = options.stepUpVerifier;

  async function authenticate(request, headers, csrfRequired) {
    const principal = await sessionService.verifySession(headers.cookie);
    sessionService.requireVerifiedPrincipal(principal);
    if (csrfRequired) {
      await sessionService.verifyCsrf(principal, headers['x-coincard-csrf'], headers.cookie);
    }
    return principal;
  }

  function identityFromLoaded(principal, loaded) {
    if (!loaded || !loaded.account || loaded.account.accountId !== principal.accountId
      || !loaded.account.username || !loaded.account.cardId) {
      fail('ACCOUNT_CARD_CONTEXT_REQUIRED', 'Mapped holder account has no Coin Card identity.');
    }
    return {
      accountId: principal.accountId,
      username: loaded.account.username,
      cardId: loaded.account.cardId,
    };
  }

  async function routeRequest(principal, body) {
    const controlPrincipal = asControlPlanePrincipal(principal);
    const loaded = await control.loadAccount(controlPrincipal);
    const identity = identityFromLoaded(principal, loaded);
    const currentRoute = loaded.controlPlaneDraft && loaded.controlPlaneDraft.route;
    let requestedWallet;
    try { requestedWallet = getAddress(body.recipientAddress); } catch (_) { requestedWallet = null; }
    const changesWallet = currentRoute && requestedWallet
      && currentRoute.recipientAddress !== requestedWallet;
    if (changesWallet) {
      if (typeof body.stepUpToken !== 'string') {
        fail('STEP_UP_REQUIRED', 'Changing recipient wallet requires recent step-up assurance.');
      }
      const verified = await stepUp.verifyStepUp(body.stepUpToken, {
        subject: principal.authenticationSubject,
        accountId: principal.accountId,
        sessionId: principal.sessionId,
        action: 'CHANGE_RECIPIENT_WALLET',
      });
      if (!stepUp.isVerifiedStepUp(verified)) {
        fail('STEP_UP_INVALID', 'Step-up assurance is invalid.');
      }
    }
    return control.saveRouteIntent(controlPrincipal, {
      ...identity,
      chainId: body.chainId,
      asset: body.asset,
      tokenContractAddress: body.tokenContractAddress,
      recipientAddress: body.recipientAddress,
      expectedRevision: body.expectedRevision,
      operationId: body.operationId,
    });
  }

  async function dispatch(request, headers) {
    assertExpectedOrigin(headers.origin);
    if (request.method === 'OPTIONS') return { status: 204, body: null };
    if (request.path === '/v1/session' && request.method === 'POST') {
      const body = requireBody(request);
      const issued = await sessionService.issueSession(body.authenticationEvidence);
      return {
        status: 201,
        setCookie: issued.setCookie,
        body: {
          sessionId: issued.sessionId,
          accountId: issued.accountId,
          expiresAt: issued.expiresAt,
          csrfToken: issued.csrfToken,
          productionAuthentication: issued.productionAuthentication,
        },
      };
    }

    const csrfRequired = MUTATION_PATHS.has(request.path);
    const principal = await authenticate(request, headers, csrfRequired);
    const controlPrincipal = asControlPlanePrincipal(principal);

    if (request.path === '/v1/holder' && request.method === 'GET') {
      const loaded = await control.loadAccount(controlPrincipal);
      return { status: 200, body: { principal, holder: loaded } };
    }

    if (!csrfRequired || request.method !== 'POST') {
      fail('ROUTE_NOT_FOUND', 'Holder API route does not exist.');
    }
    const body = requireBody(request);

    if (request.path === '/v1/usernames/reserve') {
      return { status: 200, body: await control.reserveUsername(controlPrincipal, {
        accountId: principal.accountId,
        username: body.username,
        operationId: body.operationId,
      }) };
    }
    if (request.path === '/v1/cards/allocate') {
      return { status: 200, body: await control.allocateIdentity(controlPrincipal, {
        accountId: principal.accountId,
        username: body.username,
        reservationId: body.reservationId,
        operationId: body.operationId,
      }) };
    }
    if (request.path === '/v1/presentation') {
      const loaded = await control.loadAccount(controlPrincipal);
      const identity = identityFromLoaded(principal, loaded);
      return { status: 200, body: await control.savePresentation(controlPrincipal, {
        ...identity,
        presentation: body.presentation,
        expectedRevision: body.expectedRevision,
        operationId: body.operationId,
      }) };
    }
    if (request.path === '/v1/route-intent') {
      return { status: 200, body: await routeRequest(principal, body) };
    }
    if (request.path === '/v1/wallet/challenge') {
      const loaded = await control.loadAccount(controlPrincipal);
      const identity = identityFromLoaded(principal, loaded);
      const route = loaded.controlPlaneDraft && loaded.controlPlaneDraft.route;
      if (!route) fail('ROUTE_CONTEXT_REQUIRED', 'Route intent is required before wallet challenge.');
      const challenge = await wallet.issueChallenge({ uid: principal.accountId, emailVerified: true }, {
        handle: identity.username,
        walletAddress: route.recipientAddress,
        chainId: route.chainId,
        purpose: 'claim_coin_card',
      });
      return { status: 200, body: {
        ...challenge,
        accountId: principal.accountId,
        username: identity.username,
        cardId: identity.cardId,
        walletAddress: route.recipientAddress,
        chainId: route.chainId,
      } };
    }
    if (request.path === '/v1/wallet/verify') {
      const loaded = await control.loadAccount(controlPrincipal);
      const identity = identityFromLoaded(principal, loaded);
      const route = loaded.controlPlaneDraft && loaded.controlPlaneDraft.route;
      if (!route) fail('ROUTE_CONTEXT_REQUIRED', 'Route intent is required before wallet verification.');
      const proof = await wallet.verifyChallenge({ uid: principal.accountId, emailVerified: true }, {
        challengeId: body.challengeId,
        requestId: body.requestId,
        signature: body.signature,
        handle: identity.username,
        walletAddress: route.recipientAddress,
        chainId: route.chainId,
        purpose: 'claim_coin_card',
      });
      const attached = await control.attachWalletEvidence(controlPrincipal, {
        ...identity,
        expectedRouteRevision: loaded.controlPlaneDraft.routeRevision,
        operationId: body.operationId,
      }, proof);
      return { status: 200, body: attached };
    }
    if (request.path === '/v1/entitlement/assess') {
      const loaded = await control.loadAccount(controlPrincipal);
      const identity = identityFromLoaded(principal, loaded);
      return { status: 200, body: await control.assessEntitlement(controlPrincipal, {
        ...identity,
        operationId: body.operationId,
      }) };
    }
    fail('ROUTE_NOT_FOUND', 'Holder API route does not exist.');
  }

  async function handle(input) {
    const request = {
      method: String(input && input.method || '').toUpperCase(),
      path: String(input && input.path || ''),
      headers: normalizeHeaders(input && input.headers),
      body: input && input.body,
    };
    try {
      const result = await dispatch(request, request.headers);
      return Object.freeze({
        status: result.status,
        headers: Object.freeze({ ...corsHeaders(), ...(result.setCookie ? { 'Set-Cookie': result.setCookie } : {}) }),
        body: result.body === null ? null : Object.freeze(result.body),
      });
    } catch (error) {
      return Object.freeze({
        status: errorStatus(error),
        headers: corsHeaders(),
        body: publicError(error),
      });
    }
  }

  return Object.freeze({ handle, deploymentState: 'LOCAL_UNEXPORTED_ONLY' });
}

module.exports = Object.freeze({ MUTATION_PATHS, createHolderApi });
