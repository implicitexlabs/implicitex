/**
 * Production-shaped Coin Card holder authentication contracts.
 *
 * Authentication proves a provider subject. A separate transactional mapping
 * selects the opaque Coin Card account. Neither username nor wallet is login
 * identity or account authority.
 */

'use strict';

const crypto = require('node:crypto');
const { HolderControlPlaneError, deepFreeze } = require('../holder-control-plane/contract');

const AUTH_IDENTITY_SCHEMA = 'coin-card-holder-authenticated-identity.v1';
const ACCOUNT_MAPPING_SCHEMA = 'coin-card-holder-auth-subject-mapping.v1';
const ACCOUNT_BINDING_SCHEMA = 'coin-card-holder-account-auth-binding.v1';
const SESSION_SCHEMA = 'coin-card-holder-server-session.v1';
const AUTHENTICATED_PRINCIPAL_SCHEMA = 'coin-card-holder-authenticated-principal.v1';
const ENVIRONMENT = 'NON_PRODUCTION';
const HOLDER_ORIGIN = 'https://app.coincard.click';
const HOLDER_AUDIENCE = 'coin-card-holder';
const SESSION_BOUNDARY = 'HOST_ONLY_APP_COINCARD_CLICK';
const SESSION_COOKIE_NAME = '__Host-coincard_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const STEP_UP_MAX_AGE_MS = 5 * 60 * 1000;
const SUBJECT_RE = /^[\x21-\x7e]{1,256}$/;
const ISSUER_RE = /^https:\/\/[^\s]{1,240}$/;
const PROVIDER_RE = /^[a-z0-9._-]{2,64}$/;
const ACCOUNT_ID_RE = /^acct_[0-9A-HJKMNP-TV-Z]{26}$/;
const SESSION_ID_RE = /^session_[A-Za-z0-9_-]{24,96}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

class HolderAuthenticationError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'HolderAuthenticationError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new HolderAuthenticationError(code, message, details);
}

function asDate(value, label) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('TIMESTAMP_INVALID', `${label} is invalid.`);
  return date;
}

function normalizeSubject(value) {
  if (typeof value !== 'string' || !SUBJECT_RE.test(value) || value.trim() !== value) {
    fail('AUTH_SUBJECT_INVALID', 'Authentication subject is invalid.');
  }
  return value;
}

function normalizeIssuer(value) {
  if (typeof value !== 'string' || !ISSUER_RE.test(value)) {
    fail('AUTH_ISSUER_INVALID', 'Authentication issuer is invalid.');
  }
  return value;
}

function normalizeProvider(value) {
  if (typeof value !== 'string' || !PROVIDER_RE.test(value)) {
    fail('AUTH_PROVIDER_INVALID', 'Authentication provider is invalid.');
  }
  return value;
}

function normalizeAccountId(value) {
  if (typeof value !== 'string' || !ACCOUNT_ID_RE.test(value)) {
    fail('ACCOUNT_ID_INVALID', 'Opaque Coin Card account ID is invalid.');
  }
  return value;
}

function normalizeSessionId(value) {
  if (typeof value !== 'string' || !SESSION_ID_RE.test(value)) {
    fail('SESSION_ID_INVALID', 'Holder session ID is invalid.');
  }
  return value;
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function subjectDocumentId(issuer, subject) {
  return sha256(Buffer.from(`${issuer}\0${subject}`, 'utf8')).slice('sha256:'.length);
}

function tokenHash(token, label = 'session token') {
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) fail('TOKEN_INVALID', `${label} is invalid.`);
  return sha256(Buffer.from(token, 'utf8'));
}

function cookieHeader(token, maxAgeSeconds) {
  tokenHash(token);
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    fail('SESSION_DURATION_INVALID', 'Session cookie duration is invalid.');
  }
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAgeSeconds}; Secure; HttpOnly; SameSite=Strict`;
}

function parseSessionCookie(header) {
  if (typeof header !== 'string' || header.length === 0 || header.length > 8192) {
    fail('SESSION_REQUIRED', 'Host-only Coin Card session is required.');
  }
  const matches = header.split(';').map((part) => part.trim()).filter((part) => (
    part.startsWith(`${SESSION_COOKIE_NAME}=`)
  ));
  if (matches.length !== 1) fail('SESSION_INVALID', 'Exactly one Coin Card session cookie is required.');
  const token = matches[0].slice(SESSION_COOKIE_NAME.length + 1);
  tokenHash(token);
  return token;
}

function assertExpectedOrigin(value) {
  if (value !== HOLDER_ORIGIN) {
    fail('ORIGIN_DENIED', 'Request origin is not the Coin Card holder application.');
  }
  return value;
}

function asControlPlanePrincipal(principal) {
  if (!principal || principal.schemaVersion !== AUTHENTICATED_PRINCIPAL_SCHEMA
    || principal.environment !== ENVIRONMENT || principal.authenticated !== true
    || principal.audience !== HOLDER_AUDIENCE || principal.origin !== HOLDER_ORIGIN
    || principal.sessionBoundary !== SESSION_BOUNDARY) {
    fail('SESSION_PRINCIPAL_INVALID', 'Verified holder principal is invalid.');
  }
  return deepFreeze({
    schemaVersion: 'coin-card-holder-principal.non-production.v1',
    environment: ENVIRONMENT,
    authenticated: true,
    accountId: normalizeAccountId(principal.accountId),
    origin: HOLDER_ORIGIN,
    audience: HOLDER_AUDIENCE,
    sessionBoundary: SESSION_BOUNDARY,
  });
}

function authenticationErrorFromControlPlane(error) {
  if (error instanceof HolderAuthenticationError) return error;
  if (error instanceof HolderControlPlaneError) return error;
  return new HolderAuthenticationError('INTERNAL_FAILURE', 'Holder authentication boundary failed.');
}

module.exports = Object.freeze({
  AUTH_IDENTITY_SCHEMA,
  ACCOUNT_MAPPING_SCHEMA,
  ACCOUNT_BINDING_SCHEMA,
  SESSION_SCHEMA,
  AUTHENTICATED_PRINCIPAL_SCHEMA,
  ENVIRONMENT,
  HOLDER_ORIGIN,
  HOLDER_AUDIENCE,
  SESSION_BOUNDARY,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  STEP_UP_MAX_AGE_MS,
  HolderAuthenticationError,
  fail,
  asDate,
  normalizeSubject,
  normalizeIssuer,
  normalizeProvider,
  normalizeAccountId,
  normalizeSessionId,
  subjectDocumentId,
  tokenHash,
  cookieHeader,
  parseSessionCookie,
  assertExpectedOrigin,
  asControlPlanePrincipal,
  authenticationErrorFromControlPlane,
});
