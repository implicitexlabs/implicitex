'use strict';

/**
 * Coin Card manifest construction and JCS canonicalization.
 *
 * Conforms to: Signed-Record Constitution v0.2 (31579af)
 * Acceptance criteria: CC-002 AC-01, AC-02
 *
 * buildManifest(fields)
 *   Validates the input against the v1.0.0 schema and returns a new frozen
 *   manifest object. Does not sign, fetch network data, inspect registry
 *   state, or mutate the caller's object.
 *
 * canonicalizeManifest(manifest)
 *   Applies RFC 8785 JCS canonicalization via the reference implementation
 *   and returns a UTF-8 Buffer. Does not sign or modify the input.
 *
 * Integer-only numerics is an ImplicitEx schema constraint, not a JCS
 * constraint. JCS itself accepts any valid JSON number. We enforce integers
 * at the buildManifest layer.
 */

const canonicalizeJCS = require('canonicalize');

// ---------------------------------------------------------------------------
// Schema constants
// ---------------------------------------------------------------------------

const SCHEMA_VERSION = '1.0.0';
const RECORD_TYPE    = 'implicitex.coin-card.manifest';

const REQUIRED_DOMAIN_FIELDS = new Set([
  'environment',
  'name',
  'recordType',
  'schemaVersion',
  'verificationDomain',
]);

const REQUIRED_MANIFEST_FIELDS = new Set([
  'assetContract',
  'assetDecimals',
  'assetSymbol',
  'cardId',
  'chainId',
  'domain',
  'entitlementType',
  'expiresAt',
  'feePolicyId',
  'handle',
  'issuedAt',
  'manifestVersion',
  'notBefore',
  'recipientAddress',
  'signingKeyId',
  'walletControlVerifiedAt',
]);

const VALID_ENTITLEMENT_TYPES = new Set(['pilot', 'paid', 'internal']);

// ISO 8601 UTC — seconds precision, Z suffix required.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

// 0x-prefixed, exactly 40 hex characters.
const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// cardId must begin with "cc_" followed by at least one alphanumeric/dash/underscore.
const CARD_ID_RE = /^cc_[A-Za-z0-9_-]+$/;

// ---------------------------------------------------------------------------
// ManifestError
// ---------------------------------------------------------------------------

class ManifestError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ManifestError';
  }
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ManifestError(`${field} must be a non-empty string`);
  }
}

function requireSafeNonNegativeInteger(value, field) {
  // Reject floats, unsafe integers, and negatives. The float check must come
  // before the isInteger check because non-numeric types also fail isInteger.
  if (typeof value !== 'number') {
    throw new ManifestError(`${field} must be a number`);
  }
  if (!Number.isInteger(value)) {
    throw new ManifestError(`${field} must be an integer, not a floating-point value`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new ManifestError(`${field} must be a safe integer (≤ 2^53 − 1)`);
  }
  if (value < 0) {
    throw new ManifestError(`${field} must be non-negative`);
  }
}

function requireSafePositiveInteger(value, field) {
  requireSafeNonNegativeInteger(value, field);
  if (value < 1) {
    throw new ManifestError(`${field} must be a positive integer`);
  }
}

function requireTimestamp(value, field) {
  requireNonEmptyString(value, field);
  if (!TIMESTAMP_RE.test(value)) {
    throw new ManifestError(
      `${field} must be a UTC timestamp in ISO 8601 format YYYY-MM-DDTHH:MM:SSZ`,
    );
  }
  if (Number.isNaN(Date.parse(value))) {
    throw new ManifestError(`${field} is not a valid calendar date: ${value}`);
  }
}

function requireEvmAddress(value, field) {
  if (typeof value !== 'string' || !EVM_ADDRESS_RE.test(value)) {
    throw new ManifestError(
      `${field} must be a 0x-prefixed 40-hex-character EVM address`,
    );
  }
}

// ---------------------------------------------------------------------------
// Domain validation
// ---------------------------------------------------------------------------

function validateDomain(domain) {
  if (domain === null || typeof domain !== 'object' || Array.isArray(domain)) {
    throw new ManifestError('domain must be a plain object');
  }

  for (const key of Object.keys(domain)) {
    if (!REQUIRED_DOMAIN_FIELDS.has(key)) {
      throw new ManifestError(`unknown field in domain: "${key}"`);
    }
  }
  for (const key of REQUIRED_DOMAIN_FIELDS) {
    if (!(key in domain)) {
      throw new ManifestError(`domain.${key} is required`);
    }
  }

  requireNonEmptyString(domain.name, 'domain.name');
  requireNonEmptyString(domain.recordType, 'domain.recordType');
  requireNonEmptyString(domain.schemaVersion, 'domain.schemaVersion');
  requireNonEmptyString(domain.environment, 'domain.environment');
  requireNonEmptyString(domain.verificationDomain, 'domain.verificationDomain');

  if (domain.recordType !== RECORD_TYPE) {
    throw new ManifestError(
      `domain.recordType must be "${RECORD_TYPE}", got "${domain.recordType}"`,
    );
  }
  if (domain.schemaVersion !== SCHEMA_VERSION) {
    throw new ManifestError(
      `domain.schemaVersion must be "${SCHEMA_VERSION}", got "${domain.schemaVersion}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// buildManifest
// ---------------------------------------------------------------------------

/**
 * Validate fields and return a new frozen manifest object.
 *
 * @param {object} fields  - All required manifest fields.
 * @returns {Readonly<object>}  Frozen manifest, safe to pass to canonicalizeManifest.
 * @throws {ManifestError}      On any validation failure.
 */
function buildManifest(fields) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new ManifestError('fields must be a plain object');
  }

  // Reject unknown top-level fields. Silent dropping would allow callers to
  // believe a value was signed when it was not.
  for (const key of Object.keys(fields)) {
    if (!REQUIRED_MANIFEST_FIELDS.has(key)) {
      throw new ManifestError(`unknown field: "${key}"`);
    }
  }

  // Require all fields.
  for (const key of REQUIRED_MANIFEST_FIELDS) {
    if (!(key in fields)) {
      throw new ManifestError(`${key} is required`);
    }
  }

  // domain — must be inside the payload per Constitution Section 4.
  validateDomain(fields.domain);

  // cardId
  if (typeof fields.cardId !== 'string' || !CARD_ID_RE.test(fields.cardId)) {
    throw new ManifestError('cardId must be a string matching cc_<alphanumeric-dash-underscore>');
  }

  // manifestVersion: positive safe integer ≥ 1.
  requireSafePositiveInteger(fields.manifestVersion, 'manifestVersion');

  // handle
  requireNonEmptyString(fields.handle, 'handle');

  // recipientAddress: EVM address (as supplied — no normalization here; the
  // caller is responsible for supplying the address in its canonical form).
  requireEvmAddress(fields.recipientAddress, 'recipientAddress');

  // chainId: positive safe integer.
  requireSafePositiveInteger(fields.chainId, 'chainId');

  // assetContract: EVM address.
  requireEvmAddress(fields.assetContract, 'assetContract');

  // assetSymbol
  requireNonEmptyString(fields.assetSymbol, 'assetSymbol');

  // assetDecimals: non-negative safe integer.
  requireSafeNonNegativeInteger(fields.assetDecimals, 'assetDecimals');

  // feePolicyId
  requireNonEmptyString(fields.feePolicyId, 'feePolicyId');

  // entitlementType: must be one of the three permitted values.
  if (!VALID_ENTITLEMENT_TYPES.has(fields.entitlementType)) {
    throw new ManifestError(
      `entitlementType must be one of: ${[...VALID_ENTITLEMENT_TYPES].join(', ')}`,
    );
  }

  // Timestamps
  requireTimestamp(fields.walletControlVerifiedAt, 'walletControlVerifiedAt');
  requireTimestamp(fields.issuedAt, 'issuedAt');
  requireTimestamp(fields.notBefore, 'notBefore');
  requireTimestamp(fields.expiresAt, 'expiresAt');

  // signingKeyId
  requireNonEmptyString(fields.signingKeyId, 'signingKeyId');

  // Return a new object — never mutate the caller's input.
  return Object.freeze({
    domain: Object.freeze({ ...fields.domain }),
    cardId:                   fields.cardId,
    manifestVersion:          fields.manifestVersion,
    handle:                   fields.handle,
    recipientAddress:         fields.recipientAddress,
    chainId:                  fields.chainId,
    assetContract:            fields.assetContract,
    assetSymbol:              fields.assetSymbol,
    assetDecimals:            fields.assetDecimals,
    feePolicyId:              fields.feePolicyId,
    entitlementType:          fields.entitlementType,
    walletControlVerifiedAt:  fields.walletControlVerifiedAt,
    issuedAt:                 fields.issuedAt,
    notBefore:                fields.notBefore,
    expiresAt:                fields.expiresAt,
    signingKeyId:             fields.signingKeyId,
  });
}

// ---------------------------------------------------------------------------
// canonicalizeManifest
// ---------------------------------------------------------------------------

/**
 * Apply RFC 8785 JCS canonicalization and return UTF-8 bytes.
 *
 * The integer-only constraint is enforced at buildManifest time. JCS itself
 * accepts any JSON number; this function simply delegates to the reference
 * implementation.
 *
 * @param {object} manifest  - A manifest object (typically from buildManifest).
 * @returns {Buffer}  UTF-8 encoded JCS-canonical JSON, no trailing newline.
 */
function canonicalizeManifest(manifest) {
  const canonical = canonicalizeJCS(manifest);
  return Buffer.from(canonical, 'utf8');
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = Object.freeze({ buildManifest, canonicalizeManifest, ManifestError });
