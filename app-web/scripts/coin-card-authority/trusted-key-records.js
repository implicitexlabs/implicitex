'use strict';

const { createHash } = require('node:crypto');

const SCHEMA_V1 = 'coin-card-trusted-key-record.v1';
const SCHEMA_V2 = 'coin-card-trusted-key-record.v2';
const SCHEMA_V3 = 'coin-card-trusted-key-record.v3';

const USAGES = Object.freeze({
  MANIFEST: 'coin-card-manifest-signing',
  LIFECYCLE_ADMINISTRATION: 'coin-card-lifecycle-administration',
  REGISTRY_PUBLICATION: 'coin-card-registry-publication',
  EXECUTABLE_CURRENT_HEAD: 'coin-card-executable-registry-head',
  TRANSACTION_EVIDENCE: 'coin-card-transaction-evidence',
});

const USAGES_BY_SCHEMA = Object.freeze({
  [SCHEMA_V1]: Object.freeze([
    USAGES.MANIFEST,
    USAGES.LIFECYCLE_ADMINISTRATION,
    USAGES.REGISTRY_PUBLICATION,
  ]),
  [SCHEMA_V2]: Object.freeze([
    USAGES.MANIFEST,
    USAGES.LIFECYCLE_ADMINISTRATION,
    USAGES.REGISTRY_PUBLICATION,
    USAGES.TRANSACTION_EVIDENCE,
  ]),
  [SCHEMA_V3]: Object.freeze([
    USAGES.MANIFEST,
    USAGES.LIFECYCLE_ADMINISTRATION,
    USAGES.REGISTRY_PUBLICATION,
    USAGES.EXECUTABLE_CURRENT_HEAD,
    USAGES.TRANSACTION_EVIDENCE,
  ]),
});

const RECORD_FIELDS = Object.freeze([
  'algorithm', 'environment', 'issuerId', 'keyId', 'publicKey',
  'revocationPolicy', 'revocationReason', 'revokedAt', 'schemaVersion',
  'status', 'successorKeyId', 'usage', 'validFrom', 'validUntil',
]);
const REVOCATION_POLICIES = Object.freeze([
  'INVALIDATE_ALL_SIGNATURES', 'INVALIDATE_AFTER_TIMESTAMP', 'NO_NEW_SIGNATURES',
]);
const STATUSES = Object.freeze(['ACTIVE', 'REVOKED', 'EXPIRED']);
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const COORDINATE_RE = /^[A-Za-z0-9_-]{43}$/;

function canonicalClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function exactFields(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && actual.every((item, index) => item === wanted[index]);
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function validPublicJwk(value) {
  return exactFields(value, ['crv', 'ext', 'key_ops', 'kty', 'x', 'y'])
    && value.kty === 'EC'
    && value.crv === 'P-256'
    && COORDINATE_RE.test(value.x)
    && COORDINATE_RE.test(value.y)
    && value.ext === true
    && Array.isArray(value.key_ops)
    && value.key_ops.length === 1
    && value.key_ops[0] === 'verify';
}

function validateTrustedKeyRecord(record) {
  if (!exactFields(record, RECORD_FIELDS)) throw new Error('trusted key record fields invalid');
  const allowedUsages = USAGES_BY_SCHEMA[record.schemaVersion];
  if (!allowedUsages) throw new Error('trusted key record schema unsupported');
  if (record.algorithm !== 'ECDSA_P256_SHA256') throw new Error('trusted key algorithm unsupported');
  if (typeof record.keyId !== 'string' || !record.keyId) throw new Error('trusted key ID invalid');
  if (typeof record.issuerId !== 'string' || !record.issuerId) throw new Error('trusted key issuer invalid');
  if (typeof record.environment !== 'string' || !record.environment) throw new Error('trusted key environment invalid');
  if (!validPublicJwk(record.publicKey)) throw new Error('trusted public JWK invalid');
  if (!Array.isArray(record.usage) || record.usage.length < 1) throw new Error('trusted key usage invalid');
  const seen = new Set();
  record.usage.forEach((usage) => {
    if (!allowedUsages.includes(usage) || seen.has(usage)) throw new Error('trusted key usage invalid for schema');
    seen.add(usage);
  });
  if (!STATUSES.includes(record.status)) throw new Error('trusted key status invalid');
  if (!canonicalTimestamp(record.validFrom)) throw new Error('trusted key validFrom invalid');
  if (record.validUntil !== null && !canonicalTimestamp(record.validUntil)) throw new Error('trusted key validUntil invalid');
  if (record.revokedAt !== null && !canonicalTimestamp(record.revokedAt)) throw new Error('trusted key revokedAt invalid');
  if (!(record.revocationReason === null || (typeof record.revocationReason === 'string' && record.revocationReason))) {
    throw new Error('trusted key revocationReason invalid');
  }
  if (!(record.revocationPolicy === null || REVOCATION_POLICIES.includes(record.revocationPolicy))) {
    throw new Error('trusted key revocationPolicy invalid');
  }
  if (!(record.successorKeyId === null || (typeof record.successorKeyId === 'string' && record.successorKeyId))) {
    throw new Error('trusted key successor invalid');
  }
  if (record.successorKeyId === record.keyId) throw new Error('trusted key cannot succeed itself');
  if (record.status === 'REVOKED') {
    if (record.revokedAt === null || record.revocationPolicy === null) throw new Error('revoked key evidence missing');
  } else if (record.revokedAt !== null || record.revocationReason !== null || record.revocationPolicy !== null) {
    throw new Error('non-revoked key contains revocation evidence');
  }
  return deepFreeze(canonicalClone(record));
}

function createTrustedKeyRecord(fields) {
  return validateTrustedKeyRecord({
    schemaVersion: fields.schemaVersion || SCHEMA_V3,
    keyId: fields.keyId,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey: canonicalClone(fields.publicKey),
    issuerId: fields.issuerId,
    usage: fields.usage.slice(),
    status: fields.status || 'ACTIVE',
    validFrom: fields.validFrom,
    validUntil: fields.validUntil === undefined ? null : fields.validUntil,
    revokedAt: fields.revokedAt === undefined ? null : fields.revokedAt,
    revocationReason: fields.revocationReason === undefined ? null : fields.revocationReason,
    revocationPolicy: fields.revocationPolicy === undefined ? null : fields.revocationPolicy,
    successorKeyId: fields.successorKeyId === undefined ? null : fields.successorKeyId,
    environment: fields.environment,
  });
}

function publicKeyFingerprint(publicKey) {
  if (!validPublicJwk(publicKey)) throw new Error('trusted public JWK invalid');
  return createHash('sha256').update(JSON.stringify({
    crv: publicKey.crv, kty: publicKey.kty, x: publicKey.x, y: publicKey.y,
  })).digest('base64url');
}

function mergeTrustedKeyRecords(...sets) {
  const byId = new Map();
  sets.flat().forEach((candidate) => {
    const record = validateTrustedKeyRecord(candidate);
    const prior = byId.get(record.keyId);
    if (!prior) {
      byId.set(record.keyId, record);
      return;
    }
    if (JSON.stringify(prior) !== JSON.stringify(record)) {
      throw new Error(`trusted keyId rebind denied: ${record.keyId}`);
    }
  });
  return deepFreeze(Array.from(byId.values()).sort((left, right) => (
    left.keyId < right.keyId ? -1 : left.keyId > right.keyId ? 1 : 0
  )));
}

module.exports = Object.freeze({
  SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, USAGES, USAGES_BY_SCHEMA,
  RECORD_FIELDS, REVOCATION_POLICIES, STATUSES,
  createTrustedKeyRecord, validateTrustedKeyRecord, publicKeyFingerprint, mergeTrustedKeyRecords,
});
