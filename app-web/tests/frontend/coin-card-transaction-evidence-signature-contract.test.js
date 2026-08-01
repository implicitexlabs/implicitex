const assert = require('node:assert/strict');
const {
  createHash,
  createPublicKey,
  verify,
} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Sealed v2 specification reference model only. Production runtime must not import this file.
const repoRoot = path.resolve(__dirname, '../../..');
const fixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.transaction-evidence-signature.fixtures.v2.json',
);
const v1FixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.transaction-evidence.fixtures.v1.json',
);
const identityFixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.lifecycle-and-registry-identity.fixtures.v1.json',
);
const evidenceContractPath = path.join(
  repoRoot,
  'docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md',
);
const keyContractPath = path.join(
  repoRoot,
  'docs/product/coin-card/COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V2.md',
);

const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const v1Fixture = JSON.parse(fs.readFileSync(v1FixturePath, 'utf8'));
const identityFixture = JSON.parse(fs.readFileSync(identityFixturePath, 'utf8'));
const evidenceContract = fs.readFileSync(evidenceContractPath, 'utf8');
const keyContract = fs.readFileSync(keyContractPath, 'utf8');

const ENVELOPE_KEYS = [
  'authority',
  'authorityHash',
  'keyId',
  'signature',
  'signatureAlgorithm',
];
const AUTHORITY_KEYS = [
  'evidenceDomain',
  'evidenceSchemaVersion',
  'issuerId',
  'environment',
  'signedAt',
  'signingKeyId',
  'cardId',
  'runtimeManifestId',
  'lifecycleRegistryId',
  'lifecycleRegistrySchemaVersion',
  'lifecycleRecordId',
  'lifecycleRecordRevision',
  'lifecycleRecordHash',
  'coinCardRegistryId',
  'coinCardRegistrySchemaVersion',
  'coinCardRegistryRecordId',
  'coinCardRegistryRecordRevision',
  'coinCardRegistryRecordHash',
  'recipientAddress',
  'chainId',
  'tokenContractAddress',
  'executionContractAddress',
  'executionContractInterfaceId',
  'executionInterfaceDescriptorHash',
  'feePolicy',
];
const FEE_POLICY_KEYS = [
  'policyVersion',
  'feeBasisPoints',
  'feeCapAtomic',
  'minimumTransferAtomic',
  'maximumTransferAtomic',
  'transferPrecisionAtomic',
  'roundingRule',
  'feeRecipientAddress',
];
const KEY_RECORD_KEYS = [
  'schemaVersion',
  'keyId',
  'algorithm',
  'publicKey',
  'issuerId',
  'usage',
  'status',
  'validFrom',
  'validUntil',
  'revokedAt',
  'revocationReason',
  'revocationPolicy',
  'successorKeyId',
  'environment',
];
const RECOGNIZED_USAGES = new Set([
  'coin-card-manifest-signing',
  'coin-card-lifecycle-administration',
  'coin-card-registry-publication',
  'coin-card-transaction-evidence',
]);
const STRICT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ADDRESS = /^0x[0-9a-f]{40}$/;
const ZERO_ADDRESS = /^0x0{40}$/;
const ATOMIC_INTEGER = /^(0|[1-9][0-9]*)$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const P1363_BASE64URL = /^[A-Za-z0-9_-]{86}$/;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
const UINT256_MAX = (1n << 256n) - 1n;

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const name of Object.getOwnPropertyNames(value)) {
    if (name === 'length' && Array.isArray(value)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (descriptor && 'value' in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function buildTrustedKeySource(record = fixture.positive.trustedKeyRecord, sourceKeyId = record.keyId) {
  return deepFreeze({ [sourceKeyId]: clone(record) });
}

function positiveKeyContext(overrides = {}) {
  const authority = fixture.positive.authority;
  return Object.assign({
    keyId: authority.signingKeyId,
    usage: 'coin-card-transaction-evidence',
    issuerId: authority.issuerId,
    environment: authority.environment,
    signatureTime: authority.signedAt,
    verificationTime: fixture.positive.verificationTime,
  }, overrides);
}

function buildDataVectorSource(vector) {
  if (vector.sourceMode === 'empty') return deepFreeze({});
  const record = Object.assign(clone(fixture.positive.trustedKeyRecord), vector.recordOverrides || {});
  if (vector.publicKeyOverrides) {
    record.publicKey = Object.assign(record.publicKey, vector.publicKeyOverrides);
  }
  const sourceKeyId = vector.sourceKeyId || fixture.positive.authority.signingKeyId;
  return deepFreeze({ [sourceKeyId]: record });
}

function buildStructuralVectorSource(construction) {
  const keyId = fixture.positive.authority.signingKeyId;
  const record = clone(fixture.positive.trustedKeyRecord);

  if (construction === 'hidden-record-property') {
    Object.defineProperty(record, 'hidden', { value: 'forbidden', enumerable: false });
    return deepFreeze({ [keyId]: record });
  }
  if (construction === 'accessor-record-property') {
    Object.defineProperty(record, 'issuerId', {
      get() { return 'implicitex-production'; },
      enumerable: true,
      configurable: true,
    });
    return deepFreeze({ [keyId]: record });
  }
  if (construction === 'cyclic-record') {
    record.self = record;
    return deepFreeze({ [keyId]: record });
  }
  if (construction === 'cyclic-jwk') {
    record.publicKey.self = record.publicKey;
    return deepFreeze({ [keyId]: record });
  }
  if (construction === 'shared-jwk') {
    const sharedPublicKey = record.publicKey;
    const other = clone(fixture.positive.trustedKeyRecord);
    other.keyId = 'fixture-unrelated-transaction-evidence-key-v2';
    other.publicKey = sharedPublicKey;
    return deepFreeze({
      [keyId]: record,
      [other.keyId]: other,
    });
  }
  if (construction === 'mutable-source') {
    deepFreeze(record);
    return { [keyId]: record };
  }
  if (construction === 'mutable-record') {
    deepFreeze(record.publicKey);
    deepFreeze(record.usage);
    return Object.freeze({ [keyId]: record });
  }
  if (construction === 'mutable-jwk') {
    deepFreeze(record.usage);
    Object.freeze(record);
    return Object.freeze({ [keyId]: record });
  }
  if (construction === 'nonplain-source') {
    const source = Object.create({ inherited: true });
    source[keyId] = record;
    return deepFreeze(source);
  }
  if (construction === 'nonplain-record') {
    const nonplain = Object.create({ inherited: true });
    Object.assign(nonplain, record);
    return deepFreeze({ [keyId]: nonplain });
  }
  if (construction === 'hidden-jwk-property') {
    Object.defineProperty(record.publicKey, 'hidden', { value: 'forbidden', enumerable: false });
    return deepFreeze({ [keyId]: record });
  }
  if (construction === 'accessor-jwk-property') {
    const coordinate = record.publicKey.x;
    Object.defineProperty(record.publicKey, 'x', {
      get() { return coordinate; },
      enumerable: true,
      configurable: true,
    });
    return deepFreeze({ [keyId]: record });
  }
  if (construction === 'malformed-unrelated-record') {
    const other = clone(fixture.positive.trustedKeyRecord);
    other.keyId = 'fixture-unrelated-transaction-evidence-key-v2';
    other.algorithm = 'ECDSA_P384_SHA384';
    return deepFreeze({
      [keyId]: record,
      [other.keyId]: other,
    });
  }
  throw new Error(`unknown structural vector construction: ${construction}`);
}

function compareCodePoints(left, right) {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index].codePointAt(0) - rightPoints[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function containsOnlyUnicodeScalars(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isCanonicalString(value) {
  return typeof value === 'string'
    && containsOnlyUnicodeScalars(value)
    && value.normalize('NFC') === value;
}

function isCanonicalIdentifier(value) {
  return isCanonicalString(value) && value.length > 0 && value.trim() === value;
}

function canonicalizeJson(value, seen = new Set()) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return isCanonicalString(value) ? JSON.stringify(value) : null;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && !Object.is(value, -0) ? String(value) : null;
  }
  if (!isPlainObject(value) && !Array.isArray(value)) return null;
  if (seen.has(value) || Object.getOwnPropertySymbols(value).length !== 0) return null;

  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value)) {
    if (names.filter((name) => name !== 'length').length !== value.length) return null;
    seen.add(value);
    const items = value.map((item) => canonicalizeJson(item, seen));
    seen.delete(value);
    return items.some((item) => item === null) ? null : `[${items.join(',')}]`;
  }

  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (
      !descriptor
      || !('value' in descriptor)
      || !descriptor.enumerable
      || !isCanonicalString(name)
    ) return null;
  }
  seen.add(value);
  const fields = [];
  for (const name of names.sort(compareCodePoints)) {
    const encoded = canonicalizeJson(value[name], seen);
    if (encoded === null) {
      seen.delete(value);
      return null;
    }
    fields.push(`${JSON.stringify(name)}:${encoded}`);
  }
  seen.delete(value);
  return `{${fields.join(',')}}`;
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const sortedExpected = [...expected].sort(compareCodePoints);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function domainSeparatedBytes(domain, value) {
  const canonical = canonicalizeJson(value);
  assert.notEqual(canonical, null, 'reference input must canonicalize');
  return Buffer.concat([
    Buffer.from(domain, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
}

function domainHash(domain, value) {
  return `sha256:${createHash('sha256').update(domainSeparatedBytes(domain, value)).digest('hex')}`;
}

function parseStrictTimestamp(value) {
  if (typeof value !== 'string' || !STRICT_TIMESTAMP.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function isCanonicalAddress(value) {
  return typeof value === 'string' && ADDRESS.test(value) && !ZERO_ADDRESS.test(value);
}

function isAtomicInteger(value) {
  return typeof value === 'string'
    && ATOMIC_INTEGER.test(value)
    && BigInt(value) <= UINT256_MAX;
}

function validateFeePolicy(policy) {
  if (!hasExactKeys(policy, FEE_POLICY_KEYS) || canonicalizeJson(policy) === null) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (!isCanonicalIdentifier(policy.policyVersion) || policy.roundingRule !== 'FLOOR_BPS_THEN_CAP') {
    return 'FEE_POLICY_MISMATCH';
  }
  if (!isCanonicalAddress(policy.feeRecipientAddress)) return 'ADDRESS_ENCODING_INVALID';
  for (const field of [
    'feeBasisPoints',
    'minimumTransferAtomic',
    'maximumTransferAtomic',
    'transferPrecisionAtomic',
  ]) {
    if (!isAtomicInteger(policy[field])) return 'INTEGER_ENCODING_INVALID';
  }
  if (policy.feeCapAtomic !== null && !isAtomicInteger(policy.feeCapAtomic)) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (BigInt(policy.feeBasisPoints) > 10000n) return 'FEE_POLICY_MISMATCH';
  if (BigInt(policy.minimumTransferAtomic) === 0n || BigInt(policy.transferPrecisionAtomic) === 0n) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (BigInt(policy.maximumTransferAtomic) < BigInt(policy.minimumTransferAtomic)) {
    return 'INTEGER_ENCODING_INVALID';
  }
  return null;
}

function buildEnvelope(authority = fixture.positive.authority) {
  return {
    authority: clone(authority),
    authorityHash: fixture.positive.wrapper.authorityHash,
    keyId: fixture.positive.wrapper.keyId,
    signature: fixture.positive.wrapper.signature,
    signatureAlgorithm: fixture.positive.wrapper.signatureAlgorithm,
  };
}

function setPath(object, pathExpression, replacement) {
  const parts = pathExpression.split('.');
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = replacement;
}

function deletePath(object, pathExpression) {
  const parts = pathExpression.split('.');
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part];
  delete target[parts.at(-1)];
}

function resolveInheritedAuthorityVector(vector) {
  if (!vector.sourceGroup) return vector;
  const sourceVector = v1Fixture[vector.sourceGroup].find(
    (candidate) => candidate.id === vector.sourceVectorId,
  );
  assert.ok(sourceVector, `missing sealed v1 source vector ${vector.sourceVectorId}`);
  return {
    ...vector,
    path: sourceVector.path,
    replacement: sourceVector.replacement,
  };
}

function validateAuthorityProfile(authority) {
  if (!isPlainObject(authority)) return 'EVIDENCE_CANONICALIZATION_INVALID';
  if (authority.evidenceSchemaVersion !== 'transaction-evidence.v2') {
    return 'TRANSACTION_EVIDENCE_SIGNATURE_PROFILE_REQUIRED';
  }
  if (!Object.hasOwn(authority, 'signedAt') || parseStrictTimestamp(authority.signedAt) === null) {
    return 'EVIDENCE_SIGNING_TIME_INVALID';
  }
  if (!hasExactKeys(authority, AUTHORITY_KEYS) || canonicalizeJson(authority) === null) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (authority.evidenceDomain !== 'ImplicitEx.CoinCard.TransactionEvidence') {
    return 'EVIDENCE_DOMAIN_MISMATCH';
  }
  for (const field of [
    'issuerId',
    'environment',
    'signingKeyId',
    'cardId',
    'lifecycleRegistryId',
    'lifecycleRegistrySchemaVersion',
    'lifecycleRecordId',
    'coinCardRegistryId',
    'coinCardRegistrySchemaVersion',
    'coinCardRegistryRecordId',
    'executionContractInterfaceId',
  ]) {
    if (!isCanonicalIdentifier(authority[field])) return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (authority.lifecycleRegistrySchemaVersion !== 'coin-card-lifecycle-registry-record.v1') {
    return 'LIFECYCLE_SCHEMA_MISMATCH';
  }
  if (authority.coinCardRegistrySchemaVersion !== 'coin-card-registry-record.v2') {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  for (const field of [
    'recipientAddress',
    'tokenContractAddress',
    'executionContractAddress',
  ]) {
    if (!isCanonicalAddress(authority[field])) return 'ADDRESS_ENCODING_INVALID';
  }
  for (const field of [
    'lifecycleRecordRevision',
    'coinCardRegistryRecordRevision',
    'chainId',
  ]) {
    if (!isAtomicInteger(authority[field])) return 'INTEGER_ENCODING_INVALID';
  }
  for (const field of [
    'runtimeManifestId',
    'lifecycleRecordHash',
    'coinCardRegistryRecordHash',
    'executionInterfaceDescriptorHash',
  ]) {
    if (typeof authority[field] !== 'string' || !SHA256.test(authority[field])) {
      return 'EVIDENCE_CANONICALIZATION_INVALID';
    }
  }
  return validateFeePolicy(authority.feePolicy);
}

function getOwnDataPropertyNames(value) {
  if (!value || typeof value !== 'object') return null;
  if (Object.getOwnPropertySymbols(value).length !== 0) return null;
  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value)) {
    const indexNames = names.filter((name) => name !== 'length');
    if (indexNames.length !== value.length) return null;
    for (let index = 0; index < value.length; index += 1) {
      const name = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
      if (!indexNames.includes(name)) return null;
    }
    return indexNames;
  }
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
  }
  return names;
}

function isPlainDataContainer(value) {
  if (Array.isArray(value)) return true;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDeepFrozenPlainData(value, seen = new Set()) {
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return true;
  if (!value || typeof value !== 'object') return false;
  if (!Object.isFrozen(value) || !isPlainDataContainer(value)) return false;
  const names = getOwnDataPropertyNames(value);
  if (!names || seen.has(value)) return false;
  seen.add(value);
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!isDeepFrozenPlainData(descriptor.value, seen)) return false;
  }
  return true;
}

function isCanonicalP256Coordinate(value) {
  if (typeof value !== 'string' || value.length !== 43 || !BASE64URL.test(value)) return false;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === 32 && decoded.toString('base64url') === value;
}

function isValidPublicP256Jwk(publicKey) {
  const names = getOwnDataPropertyNames(publicKey);
  if (!names) return false;
  const allowed = new Set(['crv', 'ext', 'key_ops', 'kty', 'x', 'y']);
  if (names.some((name) => !allowed.has(name))) return false;
  if (
    publicKey.kty !== 'EC'
    || publicKey.crv !== 'P-256'
    || !isCanonicalP256Coordinate(publicKey.x)
    || !isCanonicalP256Coordinate(publicKey.y)
    || Object.hasOwn(publicKey, 'd')
  ) {
    return false;
  }
  if (
    Object.hasOwn(publicKey, 'key_ops')
    && (!Array.isArray(publicKey.key_ops)
      || publicKey.key_ops.length !== 1
      || publicKey.key_ops[0] !== 'verify')
  ) {
    return false;
  }
  if (Object.hasOwn(publicKey, 'ext') && publicKey.ext !== true) return false;
  return true;
}

function isValidUsageArray(usage) {
  if (!Array.isArray(usage) || usage.length === 0) return false;
  const seen = new Set();
  for (const value of usage) {
    if (!isCanonicalIdentifier(value) || !RECOGNIZED_USAGES.has(value) || seen.has(value)) {
      return false;
    }
    seen.add(value);
  }
  return true;
}

function isNullOrCanonicalNonemptyString(value) {
  return value === null || (isCanonicalString(value) && value.length > 0);
}

function validateTrustedKeyRecord(record, sourceKeyId) {
  if (!hasExactKeys(record, KEY_RECORD_KEYS)) return false;
  if (
    record.schemaVersion !== 'coin-card-trusted-key-record.v2'
    || record.keyId !== sourceKeyId
    || !isCanonicalIdentifier(record.keyId)
    || record.algorithm !== 'ECDSA_P256_SHA256'
    || !isValidPublicP256Jwk(record.publicKey)
    || !isCanonicalIdentifier(record.issuerId)
    || !isValidUsageArray(record.usage)
    || !['ACTIVE', 'REVOKED', 'EXPIRED'].includes(record.status)
    || parseStrictTimestamp(record.validFrom) === null
    || (record.validUntil !== null && parseStrictTimestamp(record.validUntil) === null)
    || !isCanonicalIdentifier(record.environment)
    || (record.revokedAt !== null && parseStrictTimestamp(record.revokedAt) === null)
    || !isNullOrCanonicalNonemptyString(record.revocationReason)
    || !isNullOrCanonicalNonemptyString(record.successorKeyId)
    || record.successorKeyId === record.keyId
  ) {
    return false;
  }
  const knownPolicies = [
    'INVALIDATE_ALL_SIGNATURES',
    'INVALIDATE_AFTER_TIMESTAMP',
    'NO_NEW_SIGNATURES',
  ];
  if (!(record.revocationPolicy === null || knownPolicies.includes(record.revocationPolicy))) {
    return false;
  }
  if (record.status === 'REVOKED') {
    return record.revokedAt !== null && record.revocationPolicy !== null;
  }
  return record.revokedAt === null
    && record.revocationReason === null
    && record.revocationPolicy === null;
}

function validateTrustedKeySource(source) {
  if (!isPlainObject(source) || !isDeepFrozenPlainData(source)) return false;
  const sourceKeys = getOwnDataPropertyNames(source);
  if (!sourceKeys) return false;
  for (const sourceKeyId of sourceKeys) {
    if (!isCanonicalIdentifier(sourceKeyId)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(source, sourceKeyId);
    if (!validateTrustedKeyRecord(descriptor.value, sourceKeyId)) return false;
  }
  return true;
}

function buildKeyResolution(outcome, record = null) {
  const active = outcome === 'TRUSTED_KEY_ACTIVE';
  return {
    outcome,
    record: active ? record : null,
    publicKey: active ? record.publicKey : null,
  };
}

function resolveTrustedKey(source, context) {
  if (!validateTrustedKeySource(source)) return buildKeyResolution('TRUSTED_KEY_SOURCE_UNAVAILABLE');
  if (
    !isCanonicalIdentifier(context.keyId)
    || !isCanonicalIdentifier(context.usage)
    || !isCanonicalIdentifier(context.environment)
    || !isCanonicalIdentifier(context.issuerId)
  ) {
    return buildKeyResolution('TRUSTED_KEY_RECORD_INVALID');
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, context.keyId);
  if (!descriptor || !('value' in descriptor)) return buildKeyResolution('TRUSTED_KEY_UNKNOWN');
  const record = descriptor.value;
  assert.equal(record.keyId, context.keyId, 'validated source key must equal record keyId');

  if (!record.usage.includes(context.usage)) return buildKeyResolution('TRUSTED_KEY_USAGE_DENIED');
  if (record.environment !== context.environment) {
    return buildKeyResolution('TRUSTED_KEY_ENVIRONMENT_MISMATCH');
  }
  if (record.issuerId !== context.issuerId) return buildKeyResolution('TRUSTED_KEY_USAGE_DENIED');

  const signatureTime = parseStrictTimestamp(context.signatureTime);
  const verificationTime = parseStrictTimestamp(context.verificationTime);
  if (signatureTime === null || verificationTime === null) {
    return buildKeyResolution('TRUSTED_KEY_RECORD_INVALID');
  }
  if (signatureTime > verificationTime + CLOCK_SKEW_MS) {
    return buildKeyResolution('TRUSTED_KEY_RECORD_INVALID');
  }
  if (signatureTime < parseStrictTimestamp(record.validFrom)) {
    return buildKeyResolution('TRUSTED_KEY_NOT_YET_ACTIVE');
  }
  if (record.validUntil !== null && signatureTime > parseStrictTimestamp(record.validUntil)) {
    return buildKeyResolution('TRUSTED_KEY_EXPIRED');
  }
  if (record.status === 'ACTIVE') return buildKeyResolution('TRUSTED_KEY_ACTIVE', record);
  if (record.status === 'EXPIRED') return buildKeyResolution('TRUSTED_KEY_EXPIRED');

  const revokedAt = parseStrictTimestamp(record.revokedAt);
  if (record.revocationPolicy === 'INVALIDATE_ALL_SIGNATURES') {
    return buildKeyResolution('TRUSTED_KEY_REVOKED');
  }
  if (record.revocationPolicy === 'INVALIDATE_AFTER_TIMESTAMP') {
    return verificationTime >= revokedAt
      ? buildKeyResolution('TRUSTED_KEY_REVOKED')
      : buildKeyResolution('TRUSTED_KEY_ACTIVE', record);
  }
  if (record.revocationPolicy === 'NO_NEW_SIGNATURES') {
    return signatureTime >= revokedAt
      ? buildKeyResolution('TRUSTED_KEY_REVOKED')
      : buildKeyResolution('TRUSTED_KEY_ACTIVE', record);
  }
  return buildKeyResolution('TRUSTED_KEY_RECORD_INVALID');
}

function authenticateEvidence(envelope, trustedKeySource, options = {}) {
  if (!hasExactKeys(envelope, ENVELOPE_KEYS)) return 'EVIDENCE_CANONICALIZATION_INVALID';
  const profileError = validateAuthorityProfile(envelope.authority);
  if (profileError) return profileError;
  const signatureBytes = typeof envelope.signature === 'string'
    ? Buffer.from(envelope.signature, 'base64url')
    : null;
  if (
    envelope.signatureAlgorithm !== 'ECDSA_P256_SHA256_P1363'
    || typeof envelope.signature !== 'string'
    || !P1363_BASE64URL.test(envelope.signature)
    || signatureBytes.length !== 64
    || signatureBytes.toString('base64url') !== envelope.signature
  ) {
    return 'EVIDENCE_SIGNATURE_INVALID';
  }

  const authorityHash = domainHash(fixture.domains.authority, envelope.authority);
  if (!SHA256.test(envelope.authorityHash) || envelope.authorityHash !== authorityHash) {
    return 'EVIDENCE_HASH_MISMATCH';
  }
  if (envelope.keyId !== envelope.authority.signingKeyId) {
    return 'EVIDENCE_SIGNING_KEY_ID_MISMATCH';
  }

  const keyResolution = resolveTrustedKey(trustedKeySource, {
    keyId: envelope.authority.signingKeyId,
    usage: 'coin-card-transaction-evidence',
    issuerId: envelope.authority.issuerId,
    environment: envelope.authority.environment,
    signatureTime: envelope.authority.signedAt,
    verificationTime: options.verificationTime || fixture.positive.verificationTime,
  });
  if (keyResolution.outcome !== 'TRUSTED_KEY_ACTIVE') return 'EVIDENCE_SIGNATURE_INVALID';

  let publicKey;
  try {
    publicKey = createPublicKey({ key: keyResolution.publicKey, format: 'jwk' });
  } catch (error) {
    return 'EVIDENCE_SIGNATURE_INVALID';
  }
  const signature = signatureBytes;
  if (!verify(
    'sha256',
    domainSeparatedBytes(fixture.domains.authority, envelope.authority),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    signature,
  )) {
    return 'EVIDENCE_SIGNATURE_INVALID';
  }

  const headIssuedAt = parseStrictTimestamp(
    options.headIssuedAt || fixture.positive.currentHeadIssuedAt,
  );
  if (
    headIssuedAt === null
    || parseStrictTimestamp(envelope.authority.signedAt) > headIssuedAt
  ) {
    return 'EVIDENCE_SIGNING_TIME_AFTER_HEAD';
  }
  return 'TRANSACTION_EVIDENCE_SIGNATURE_AUTHENTICATED';
}

test('Sealed v2 contracts pin signed time, signed key identity, usage, and revocation rules', () => {
  assert.match(evidenceContract, /\*\*Sealed/);
  assert.match(keyContract, /\*\*Sealed/);
  for (const value of [
    'transaction-evidence.v2',
    'ImplicitEx.CoinCard.TransactionEvidence.v2',
    'authority.signedAt',
    'authority.signingKeyId',
    'coin-card-transaction-evidence',
    'EVIDENCE_SIGNING_TIME_AFTER_HEAD',
  ]) {
    assert.equal(evidenceContract.includes(value), true, value);
  }
  for (const value of [
    'coin-card-trusted-key-record.v2',
    'coin-card-transaction-evidence',
    'INVALIDATE_ALL_SIGNATURES',
    'INVALIDATE_AFTER_TIMESTAMP',
    'NO_NEW_SIGNATURES',
  ]) {
    assert.equal(keyContract.includes(value), true, value);
  }
});

test('v2 changes only signature authority fields relative to the sealed v1 route and policy', () => {
  const projected = clone(fixture.positive.authority);
  delete projected.signedAt;
  delete projected.signingKeyId;
  projected.evidenceSchemaVersion = 'transaction-evidence.v1';
  assert.deepEqual(projected, v1Fixture.positive.authority);
});

test('positive v2 authority pins canonical bytes, hash, trusted key, and P1363 signature', () => {
  const authority = fixture.positive.authority;
  const envelope = buildEnvelope();
  const source = buildTrustedKeySource();
  assert.equal(canonicalizeJson(authority), fixture.positive.expectedAuthorityCanonicalJson);
  assert.equal(domainHash(fixture.domains.authority, authority), fixture.positive.expectedAuthorityHash);
  const resolution = resolveTrustedKey(source, {
    keyId: authority.signingKeyId,
    usage: 'coin-card-transaction-evidence',
    issuerId: authority.issuerId,
    environment: authority.environment,
    signatureTime: authority.signedAt,
    verificationTime: fixture.positive.verificationTime,
  });
  assert.equal(resolution.outcome, fixture.positive.expectedKeyOutcome);
  assert.equal(resolution.record.keyId, authority.signingKeyId);
  assert.deepEqual(resolution.publicKey, fixture.positive.trustedKeyRecord.publicKey);
  assert.equal(
    authenticateEvidence(envelope, source),
    fixture.positive.expectedAuthenticationOutcome,
  );
});

test('canonical property ordering is invariant for the signed v2 authority', () => {
  const reordered = Object.fromEntries(Object.entries(fixture.positive.authority).reverse());
  assert.notDeepEqual(Object.keys(reordered), Object.keys(fixture.positive.authority));
  assert.equal(canonicalizeJson(reordered), fixture.positive.expectedAuthorityCanonicalJson);
  assert.equal(domainHash(fixture.domains.authority, reordered), fixture.positive.expectedAuthorityHash);
});

test('v2 authentication composes inherited sealed v1 content predicates before signature success', () => {
  for (const source of fixture.inheritedAuthorityVectors) {
    const vector = resolveInheritedAuthorityVector(source);
    const envelope = buildEnvelope();
    setPath(envelope.authority, vector.path, vector.replacement);
    envelope.authorityHash = domainHash(fixture.domains.authority, envelope.authority);
    assert.equal(validateAuthorityProfile(envelope.authority), vector.expectedCode, vector.id);
    assert.equal(
      authenticateEvidence(envelope, buildTrustedKeySource()),
      vector.expectedCode,
      `${vector.id} must fail independently of the recomputed v2 hash`,
    );
  }
});

test('signing-time and signed-key mutations invalidate the original signature after rehashing', () => {
  for (const [field, replacement] of [
    ['signedAt', '2026-07-20T12:04:00.001Z'],
    ['signingKeyId', 'fixture-other-transaction-evidence-key'],
  ]) {
    const envelope = buildEnvelope();
    envelope.authority[field] = replacement;
    envelope.authorityHash = domainHash(fixture.domains.authority, envelope.authority);
    if (field === 'signingKeyId') envelope.keyId = replacement;
    const record = clone(fixture.positive.trustedKeyRecord);
    if (field === 'signingKeyId') record.keyId = replacement;
    assert.equal(
      authenticateEvidence(envelope, buildTrustedKeySource(record)),
      'EVIDENCE_SIGNATURE_INVALID',
      field,
    );
  }
});

test('authentication mutations have deterministic fail-closed precedence', () => {
  for (const vector of fixture.authenticationMutations) {
    const envelope = buildEnvelope();
    if (vector.remove) deletePath(envelope, vector.path);
    else setPath(envelope, vector.path, vector.replacement);
    assert.equal(
      authenticateEvidence(envelope, buildTrustedKeySource()),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('trusted-key v2 vectors cover activation, expiry, usage, identity, skew, and revocation boundaries', () => {
  const authority = fixture.positive.authority;
  for (const vector of fixture.keyPolicyVectors) {
    const record = Object.assign(clone(fixture.positive.trustedKeyRecord), vector.recordOverrides || {});
    const context = Object.assign({
      keyId: authority.signingKeyId,
      usage: 'coin-card-transaction-evidence',
      issuerId: authority.issuerId,
      environment: authority.environment,
      signatureTime: authority.signedAt,
      verificationTime: fixture.positive.verificationTime,
    }, vector.contextOverrides || {});
    const resolution = resolveTrustedKey(buildTrustedKeySource(record), context);
    assert.equal(resolution.outcome, vector.expectedKeyOutcome, vector.id);
    assert.equal(resolution.record === null, vector.expectedKeyOutcome !== 'TRUSTED_KEY_ACTIVE', vector.id);
    assert.equal(resolution.publicKey === null, vector.expectedKeyOutcome !== 'TRUSTED_KEY_ACTIVE', vector.id);
  }
});

test('trusted-key resolution uses the signed key ID against an atomic keyed source', () => {
  for (const vector of fixture.trustedSourceDataVectors) {
    const source = buildDataVectorSource(vector);
    const resolution = resolveTrustedKey(source, positiveKeyContext());
    assert.equal(resolution.outcome, vector.expectedKeyOutcome, vector.id);
    assert.equal(resolution.record, null, `${vector.id} must expose no record`);
    assert.equal(resolution.publicKey, null, `${vector.id} must expose no public key`);
    assert.equal(
      authenticateEvidence(buildEnvelope(), source),
      vector.expectedAuthenticationCode,
      vector.id,
    );
  }
});

test('hidden, accessor, cyclic, shared, mutable, nonplain, and unrelated malformed key data fail atomically', () => {
  const expected = fixture.trustedSourceStructuralExpected;
  for (const vector of fixture.trustedSourceStructuralVectors) {
    const source = buildStructuralVectorSource(vector.construction);
    const resolution = resolveTrustedKey(source, positiveKeyContext());
    assert.equal(resolution.outcome, expected.keyOutcome, vector.id);
    assert.equal(resolution.record, null, `${vector.id} must expose no record`);
    assert.equal(resolution.publicKey, null, `${vector.id} must expose no public key`);
    assert.equal(
      authenticateEvidence(buildEnvelope(), source),
      expected.authenticationCode,
      vector.id,
    );
  }
});

test('a valid signature later than the selecting head issue time fails currentness conjunction', () => {
  const vector = fixture.afterHeadVector;
  const envelope = buildEnvelope();
  envelope.authority.signedAt = vector.signedAt;
  envelope.authorityHash = vector.authorityHash;
  envelope.signature = vector.signature;
  assert.equal(
    authenticateEvidence(envelope, buildTrustedKeySource(), {
      headIssuedAt: vector.headIssuedAt,
    }),
    vector.expectedCode,
  );
});

test('frozen intent, observation, and settlement references repin to the v2 authority hash', () => {
  const repin = fixture.dependentEvidenceRepin;
  const intent = clone(v1Fixture.positive.frozenIntent);
  const observation = clone(v1Fixture.positive.observedExecution);
  const settlement = clone(v1Fixture.positive.settlement);

  intent.authorityHash = repin.authorityHash;
  const intentHash = domainHash(v1Fixture.domains.frozenIntent, intent);
  observation.authorityHash = repin.authorityHash;
  observation.intentHash = intentHash;
  settlement.authorityHash = repin.authorityHash;
  settlement.intentHash = intentHash;

  assert.equal(canonicalizeJson(intent), repin.expectedIntentCanonicalJson);
  assert.equal(intentHash, repin.expectedIntentHash);
  assert.equal(observation.authorityHash, repin.observationAuthorityHash);
  assert.equal(observation.intentHash, repin.observationIntentHash);
  assert.equal(settlement.authorityHash, repin.settlementAuthorityHash);
  assert.equal(settlement.intentHash, repin.settlementIntentHash);
});

test('identity fixture is repinned to the v2 authority hash and authenticated head artifact', () => {
  const headFixture = identityFixture.currentness.executableRegistryHead;
  const head = headFixture.head;
  const signedPayload = clone(head);
  delete signedPayload.signature.value;
  const repin = fixture.repinnedHead;

  assert.equal(head.transactionEvidenceAuthorityHash, repin.transactionEvidenceAuthorityHash);
  assert.equal(head.signature.keyId, repin.signatureKeyId);
  assert.equal(head.signature.value, repin.signature);
  assert.deepEqual(headFixture.publicKeyJwk, repin.publicKeyJwk);
  assert.equal(canonicalizeJson(signedPayload), repin.expectedSignedPayloadCanonicalJson);
  assert.equal(canonicalizeJson(head), repin.expectedHeadCanonicalJson);
  assert.equal(
    domainHash(identityFixture.domains.executableRegistryHeadArtifactHash, head),
    repin.expectedHeadHash,
  );
  assert.equal(headFixture.expectedHeadHash, repin.expectedHeadHash);
  assert.equal(headFixture.currentSource.boundHeadHash, repin.expectedHeadHash);

  const publicKey = createPublicKey({ key: repin.publicKeyJwk, format: 'jwk' });
  assert.equal(verify(
    'sha256',
    domainSeparatedBytes(identityFixture.domains.executableRegistryHeadSignature, signedPayload),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(head.signature.value, 'base64url'),
  ), true);
});
