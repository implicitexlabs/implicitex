/** Opaque, server-stored, host-only Coin Card session boundary. */

'use strict';

const crypto = require('node:crypto');
const {
  AUTHENTICATED_PRINCIPAL_SCHEMA,
  AUTH_IDENTITY_SCHEMA,
  ENVIRONMENT,
  HOLDER_AUDIENCE,
  HOLDER_ORIGIN,
  SESSION_BOUNDARY,
  SESSION_TTL_MS,
  asDate,
  cookieHeader,
  fail,
  parseSessionCookie,
  tokenHash,
} = require('./contract');

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomAccountId() {
  const bytes = crypto.randomBytes(26);
  let value = '';
  for (let index = 0; index < 26; index += 1) value += CROCKFORD[bytes[index] & 31];
  return `acct_${value}`;
}

function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function randomSessionId() {
  return `session_${crypto.randomBytes(24).toString('base64url')}`;
}

function timingSafeHashMatch(expected, token, label) {
  const actual = tokenHash(token, label);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createHolderSessionService(options) {
  if (!options || !options.store || !options.authenticationVerifier
    || typeof options.authenticationVerifier.verifyAuthentication !== 'function'
    || typeof options.authenticationVerifier.isVerifiedIdentity !== 'function'
    || !options.controlPlaneService || typeof options.controlPlaneService.ensureAccount !== 'function') {
    throw new TypeError('auth store, verifier, and holder control plane are required');
  }
  const store = options.store;
  const verifier = options.authenticationVerifier;
  const controlPlaneService = options.controlPlaneService;
  const clock = options.clock || (() => new Date());
  const accountIdFactory = options.accountIdFactory || randomAccountId;
  const sessionIdFactory = options.sessionIdFactory || randomSessionId;
  const tokenFactory = options.tokenFactory || randomToken;
  const csrfFactory = options.csrfFactory || randomToken;
  const principals = new WeakSet();

  function now() {
    const value = new Date(clock());
    if (!Number.isFinite(value.getTime())) fail('CLOCK_INVALID', 'Session clock is invalid.');
    return value;
  }

  function internalControlPrincipal(accountId) {
    return Object.freeze({
      schemaVersion: 'coin-card-holder-principal.non-production.v1',
      environment: ENVIRONMENT,
      authenticated: true,
      accountId,
      origin: HOLDER_ORIGIN,
      audience: HOLDER_AUDIENCE,
      sessionBoundary: SESSION_BOUNDARY,
    });
  }

  async function issueSession(authenticationEvidence) {
    const identity = await verifier.verifyAuthentication(authenticationEvidence);
    if (!verifier.isVerifiedIdentity(identity) || identity.schemaVersion !== AUTH_IDENTITY_SCHEMA
      || identity.holderAudience !== HOLDER_AUDIENCE || identity.emailVerified !== true) {
      fail('AUTH_EVIDENCE_UNTRUSTED', 'Verified authentication evidence is required.');
    }
    const issuedAt = now();
    if (asDate(identity.expiresAt, 'identity.expiresAt').getTime() <= issuedAt.getTime()) {
      fail('AUTH_TOKEN_EXPIRED', 'Authentication evidence is expired.');
    }
    const mapping = await store.resolveOrCreateMapping({
      subject: identity.subject,
      issuer: identity.issuer,
      provider: identity.provider,
      candidateAccountId: accountIdFactory(),
      now: issuedAt,
    });
    await controlPlaneService.ensureAccount(internalControlPrincipal(mapping.accountId));
    const sessionToken = tokenFactory();
    const csrfToken = csrfFactory();
    const sessionId = sessionIdFactory();
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS);
    const sessionTokenHash = tokenHash(sessionToken);
    const sessionDocumentId = sessionTokenHash.slice('sha256:'.length);
    const stored = await store.createSession({
      sessionId,
      sessionDocumentId,
      sessionTokenHash,
      csrfTokenHash: tokenHash(csrfToken, 'CSRF token'),
      subject: identity.subject,
      issuer: identity.issuer,
      provider: identity.provider,
      authenticationAudience: identity.authenticationAudience,
      holderAudience: HOLDER_AUDIENCE,
      accountId: mapping.accountId,
      sessionVersion: mapping.sessionVersion,
      emailVerified: identity.emailVerified,
      authenticationTime: asDate(identity.authenticationTime, 'authenticationTime'),
      assuranceMethods: identity.assuranceMethods,
      issuedAt,
      expiresAt,
    });
    return Object.freeze({
      sessionId: stored.sessionId,
      accountId: stored.accountId,
      expiresAt: expiresAt.toISOString(),
      csrfToken,
      setCookie: cookieHeader(sessionToken, Math.floor(SESSION_TTL_MS / 1000)),
      cookieReadableByJavaScript: false,
      productionAuthentication: identity.testOnly !== true,
    });
  }

  async function verifySession(cookieValue) {
    const token = parseSessionCookie(cookieValue);
    const sessionTokenHash = tokenHash(token);
    const stored = await store.loadSession({
      sessionTokenHash,
      sessionDocumentId: sessionTokenHash.slice('sha256:'.length),
    });
    if (!stored || stored.status !== 'ACTIVE' || stored.revokedAt !== null
      || stored.holderAudience !== HOLDER_AUDIENCE || stored.emailVerified !== true
      || asDate(stored.expiresAt, 'session.expiresAt').getTime() <= now().getTime()) {
      fail(stored ? 'SESSION_EXPIRED_OR_REVOKED' : 'SESSION_REQUIRED', 'Holder session is unavailable.');
    }
    const principal = Object.freeze({
      schemaVersion: AUTHENTICATED_PRINCIPAL_SCHEMA,
      environment: ENVIRONMENT,
      authenticated: true,
      authenticationSubject: stored.subject,
      authenticationIssuer: stored.issuer,
      authenticationProvider: stored.provider,
      authenticationAudience: stored.authenticationAudience,
      audience: HOLDER_AUDIENCE,
      accountId: stored.accountId,
      emailVerified: true,
      authenticationTime: asDate(stored.authenticationTime, 'authenticationTime').toISOString(),
      sessionId: stored.sessionId,
      sessionVersion: stored.sessionVersion,
      sessionIssuedAt: asDate(stored.issuedAt, 'session.issuedAt').toISOString(),
      sessionExpiresAt: asDate(stored.expiresAt, 'session.expiresAt').toISOString(),
      assuranceMethods: Object.freeze([...(stored.assuranceMethods || [])]),
      stepUpState: 'NOT_ESTABLISHED',
      origin: HOLDER_ORIGIN,
      sessionBoundary: SESSION_BOUNDARY,
    });
    principals.add(principal);
    return principal;
  }

  function requireVerifiedPrincipal(value) {
    if (!principals.has(value)) fail('SESSION_PRINCIPAL_UNTRUSTED', 'Verified holder session is required.');
    return value;
  }

  async function verifyCsrf(principal, suppliedToken, cookieValue) {
    requireVerifiedPrincipal(principal);
    if (typeof suppliedToken !== 'string') fail('CSRF_REQUIRED', 'CSRF token is required.');
    const sessionToken = parseSessionCookie(cookieValue);
    const sessionTokenHash = tokenHash(sessionToken);
    const stored = await store.loadSession({
      sessionTokenHash,
      sessionDocumentId: sessionTokenHash.slice('sha256:'.length),
    });
    let tokenMatches = false;
    try {
      tokenMatches = !!stored
        && timingSafeHashMatch(stored.csrfTokenHash, suppliedToken, 'CSRF token');
    } catch (_) {
      tokenMatches = false;
    }
    if (!stored || stored.sessionId !== principal.sessionId || !tokenMatches) {
      fail('CSRF_INVALID', 'CSRF token does not bind this holder session.');
    }
    return true;
  }

  return Object.freeze({
    issueSession,
    verifySession,
    verifyCsrf,
    requireVerifiedPrincipal,
    internalControlPrincipal,
    authenticationMode: verifier.mode,
  });
}

module.exports = Object.freeze({ createHolderSessionService });
