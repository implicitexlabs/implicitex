/**
 * Coin Card holder control-plane storage contract.
 *
 * This contract governs mutable holder intent and prerequisite tracking only.
 * It has no lifecycle, registry publication, Transaction Evidence, or
 * execution authority.
 */

'use strict';

const crypto = require('node:crypto');
const { getAddress } = require('ethers');
const canonicalUsername = require('../shared/coin-card-canonical-username');

const ACCOUNT_SCHEMA = 'coin-card-holder-control-plane-account.v1';
const RESERVATION_SCHEMA = 'coin-card-holder-control-plane-reservation.v1';
const CARD_SCHEMA = 'coin-card-holder-control-plane-card.v1';
const OPERATION_SCHEMA = 'coin-card-holder-control-plane-operation.v1';
const PRINCIPAL_SCHEMA = 'coin-card-holder-principal.non-production.v1';
const CONTROL_PLANE_DRAFT_SCHEMA = 'coin-card-holder-control-plane-draft.v1';
const ENVIRONMENT = 'NON_PRODUCTION';
const HOLDER_ORIGIN = 'https://app.coincard.click';
const HOLDER_AUDIENCE = 'coin-card-holder';
const SESSION_BOUNDARY = 'HOST_ONLY_APP_COINCARD_CLICK';
const RESERVATION_TTL_MS = 30 * 60 * 1000;
const ACCOUNT_ID_RE = /^acct_[0-9A-HJKMNP-TV-Z]{26}$/;
const CARD_ID_RE = /^cc_[0-9A-HJKMNP-TV-Z]{26}$/;
const OPAQUE_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const HTTPS_URL_RE = /^https:\/\/[^\s]+$/;

const PRESENTATION_POLICY = Object.freeze({
  avatarUrlMaxLength: 2048,
  bannerUrlMaxLength: 2048,
  bioMaxLength: 160,
  externalUrlMaxLength: 2048,
});

const ROUTE_POLICY = Object.freeze({
  network: 'Polygon',
  chainId: 137,
  asset: 'USDC',
  tokenContractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
  assetDecimals: 6,
});

const ENTITLEMENT_STATES = Object.freeze({
  REQUIRED: 'ENTITLEMENT_REQUIRED',
  NON_PRODUCTION_ELIGIBLE: 'NON_PRODUCTION_ELIGIBLE',
});

const WALLET_CONTROL_STATES = Object.freeze({
  WALLET_NOT_CONFIGURED: 'WALLET_NOT_CONFIGURED',
  WALLET_CONTROL_UNVERIFIED: 'WALLET_CONTROL_UNVERIFIED',
  WALLET_CONTROL_VERIFIED: 'WALLET_CONTROL_VERIFIED',
  EVIDENCE_EXPIRED: 'EVIDENCE_EXPIRED',
  ROUTE_UPDATE_REQUIRES_EVIDENCE: 'ROUTE_UPDATE_REQUIRES_EVIDENCE',
});

class HolderControlPlaneError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'HolderControlPlaneError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new HolderControlPlaneError(code, message, details);
}

function clone(value) {
  return value === null || value === undefined ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function requirePlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail('REQUEST_INVALID', `${label} must be a plain object.`);
  }
  return value;
}

function normalizePrincipal(value) {
  requirePlainObject(value, 'holder principal');
  if (
    value.schemaVersion !== PRINCIPAL_SCHEMA
    || value.environment !== ENVIRONMENT
    || value.authenticated !== true
    || value.origin !== HOLDER_ORIGIN
    || value.audience !== HOLDER_AUDIENCE
    || value.sessionBoundary !== SESSION_BOUNDARY
    || !ACCOUNT_ID_RE.test(value.accountId)
  ) fail('PRINCIPAL_INVALID', 'Coin Card holder principal is invalid.');
  return deepFreeze({
    schemaVersion: PRINCIPAL_SCHEMA,
    environment: ENVIRONMENT,
    authenticated: true,
    accountId: value.accountId,
    origin: HOLDER_ORIGIN,
    audience: HOLDER_AUDIENCE,
    sessionBoundary: SESSION_BOUNDARY,
  });
}

function normalizeUsername(value) {
  const result = canonicalUsername.validateCurrentUsername(value);
  if (result.valid !== true) {
    fail('USERNAME_INVALID', 'Username is not eligible under the current V2 Coin Card policy.', {
      usernameValidationCode: result.code,
    });
  }
  return result.username;
}

function normalizeCardId(value) {
  if (!CARD_ID_RE.test(value)) fail('CARD_ID_INVALID', 'Opaque Coin Card ID is invalid.');
  return value;
}

function normalizeOperationId(value) {
  if (typeof value !== 'string' || !OPAQUE_ID_RE.test(value)) {
    fail('OPERATION_ID_INVALID', 'Operation ID is invalid.');
  }
  return value;
}

function normalizeExpectedRevision(value, field = 'expectedRevision') {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('REVISION_INVALID', `${field} must be a non-negative safe integer.`);
  }
  return value;
}

function asDate(value, label) {
  const date = value && typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('TIMESTAMP_INVALID', `${label} is invalid.`);
  return date;
}

function normalizeOptionalHttpsUrl(value, maximum, label) {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maximum || !HTTPS_URL_RE.test(value)) {
    fail('PRESENTATION_INVALID', `${label} must be a bounded HTTPS URL.`);
  }
  return value;
}

function normalizePresentation(value) {
  requirePlainObject(value, 'presentation');
  const bio = value.bio === undefined || value.bio === null ? '' : value.bio;
  if (typeof bio !== 'string' || bio.length > PRESENTATION_POLICY.bioMaxLength) {
    fail('PRESENTATION_INVALID', 'Bio exceeds the local product-policy limit.');
  }
  return deepFreeze({
    avatarUrl: normalizeOptionalHttpsUrl(
      value.avatarUrl || null, PRESENTATION_POLICY.avatarUrlMaxLength, 'Avatar URL',
    ),
    bannerUrl: normalizeOptionalHttpsUrl(
      value.bannerUrl || null, PRESENTATION_POLICY.bannerUrlMaxLength, 'Banner URL',
    ),
    bio,
    externalUrl: normalizeOptionalHttpsUrl(
      value.externalUrl || null, PRESENTATION_POLICY.externalUrlMaxLength, 'External link',
    ),
    policyClassification: 'LOCAL_PRODUCT_POLICY_NOT_CRYPTOGRAPHIC_AUTHORITY',
  });
}

function normalizeWallet(value) {
  if (typeof value !== 'string') fail('WALLET_INVALID', 'Recipient wallet is invalid.');
  try { return getAddress(value.trim()); } catch (_) {
    fail('WALLET_INVALID', 'Recipient wallet is invalid.');
  }
}

function normalizeRoute(value) {
  requirePlainObject(value, 'route intent');
  if (
    value.chainId !== ROUTE_POLICY.chainId
    || value.asset !== ROUTE_POLICY.asset
    || typeof value.tokenContractAddress !== 'string'
    || value.tokenContractAddress.toLowerCase() !== ROUTE_POLICY.tokenContractAddress
  ) fail('ROUTE_UNSUPPORTED', 'Only the frozen Polygon USDC V1 route is supported.');
  return deepFreeze({
    network: ROUTE_POLICY.network,
    chainId: ROUTE_POLICY.chainId,
    asset: ROUTE_POLICY.asset,
    tokenContractAddress: ROUTE_POLICY.tokenContractAddress,
    assetDecimals: ROUTE_POLICY.assetDecimals,
    recipientAddress: normalizeWallet(value.recipientAddress),
  });
}

function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      fail('REQUEST_FINGERPRINT_INVALID', 'Request contains a non-canonical number.');
    }
    return String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  requirePlainObject(value, 'fingerprinted request');
  const keys = Object.keys(value).sort();
  if (keys.some((key) => value[key] === undefined)) {
    fail('REQUEST_FINGERPRINT_INVALID', 'Request contains undefined data.');
  }
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function fingerprintRequest(operationType, accountId, request) {
  const canonical = canonicalize({ operationType, accountId, request: clone(request) });
  return `sha256:${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function evidenceStatus(card, nowInput) {
  if (!card.routeIntent) return WALLET_CONTROL_STATES.WALLET_NOT_CONFIGURED;
  const evidence = card.walletEvidence;
  if (!evidence) return card.routeRevision > 1
    ? WALLET_CONTROL_STATES.ROUTE_UPDATE_REQUIRES_EVIDENCE
    : WALLET_CONTROL_STATES.WALLET_CONTROL_UNVERIFIED;
  const now = asDate(nowInput, 'readiness time');
  if (asDate(evidence.expiresAt, 'evidence.expiresAt').getTime() <= now.getTime()) {
    return WALLET_CONTROL_STATES.EVIDENCE_EXPIRED;
  }
  const route = card.routeIntent;
  const exact = evidence.status === 'VERIFIED'
    && evidence.accountId === card.accountId
    && evidence.username === card.username
    && evidence.cardId === card.cardId
    && evidence.walletAddress === route.recipientAddress
    && evidence.chainId === route.chainId
    && evidence.tokenContractAddress === route.tokenContractAddress
    && evidence.routeRevision === card.routeRevision;
  return exact
    ? WALLET_CONTROL_STATES.WALLET_CONTROL_VERIFIED
    : WALLET_CONTROL_STATES.ROUTE_UPDATE_REQUIRES_EVIDENCE;
}

function deriveActivationReadiness(account, card, now) {
  const missing = [];
  if (!account || !account.username) missing.push('CANONICAL_USERNAME');
  if (!account || !account.cardId || !card) missing.push('OPAQUE_CARD_IDENTITY');
  if (!card || !card.presentationDraft) missing.push('PRESENTATION');
  if (!card || !card.routeIntent) missing.push('ROUTE_INTENT');
  const walletState = card
    ? evidenceStatus(card, now)
    : WALLET_CONTROL_STATES.WALLET_NOT_CONFIGURED;
  if (walletState !== WALLET_CONTROL_STATES.WALLET_CONTROL_VERIFIED) {
    missing.push('CURRENT_WALLET_CONTROL_EVIDENCE');
  }
  if (!card || card.entitlementState !== ENTITLEMENT_STATES.NON_PRODUCTION_ELIGIBLE) {
    missing.push('COMMERCIAL_ENTITLEMENT');
  }
  return deepFreeze({
    status: missing.length === 0 ? 'ACTIVATION_READY' : 'PREREQUISITES_MISSING',
    missing,
    walletControlState: walletState,
    authoritativeLifecycleState: null,
    authoritativeStateSource: 'EXTERNAL_READ_ONLY_NOT_STORED',
    executionEligible: false,
    paymentControlEnabled: false,
  });
}

module.exports = Object.freeze({
  ACCOUNT_SCHEMA,
  RESERVATION_SCHEMA,
  CARD_SCHEMA,
  OPERATION_SCHEMA,
  PRINCIPAL_SCHEMA,
  CONTROL_PLANE_DRAFT_SCHEMA,
  ENVIRONMENT,
  HOLDER_ORIGIN,
  HOLDER_AUDIENCE,
  SESSION_BOUNDARY,
  RESERVATION_TTL_MS,
  ACCOUNT_ID_RE,
  CARD_ID_RE,
  PRESENTATION_POLICY,
  ROUTE_POLICY,
  ENTITLEMENT_STATES,
  WALLET_CONTROL_STATES,
  HolderControlPlaneError,
  clone,
  deepFreeze,
  fail,
  normalizePrincipal,
  normalizeUsername,
  normalizeCardId,
  normalizeOperationId,
  normalizeExpectedRevision,
  normalizePresentation,
  normalizeRoute,
  normalizeWallet,
  asDate,
  fingerprintRequest,
  deriveActivationReadiness,
  evidenceStatus,
});
