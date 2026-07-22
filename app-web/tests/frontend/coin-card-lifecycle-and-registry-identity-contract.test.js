const assert = require('node:assert/strict');
const { createHash, createPublicKey, verify } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Phase 1C specification reference model only. Production runtime must not import this file.
const repoRoot = path.resolve(__dirname, '../../..');
const fixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.lifecycle-and-registry-identity.fixtures.v1.json',
);
const contractPath = path.join(
  repoRoot,
  'docs/product/coin-card/COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md',
);
const transactionEvidenceFixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.transaction-evidence.fixtures.v1.json',
);
const transactionEvidenceContractPath = path.join(
  repoRoot,
  'docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md',
);
const lifecycleSelectorPath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-lifecycle-record-selection.js',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const contractSource = fs.readFileSync(contractPath, 'utf8');
const transactionEvidenceContractSource = fs.readFileSync(transactionEvidenceContractPath, 'utf8');
const lifecycleSelectorSource = fs.readFileSync(lifecycleSelectorPath, 'utf8');
const transactionEvidenceFixture = JSON.parse(
  fs.readFileSync(transactionEvidenceFixturePath, 'utf8'),
);

const REGISTRY_KEYS = [
  'registrySchemaVersion',
  'registryId',
  'environment',
  'recordId',
  'revision',
  'cardId',
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
const HEAD_KEYS = [
  'headSchemaVersion',
  'registryId',
  'environment',
  'cardId',
  'headSequence',
  'lifecycleRecordHash',
  'coinCardRegistryRecordId',
  'coinCardRegistryRecordRevision',
  'coinCardRegistryRecordHash',
  'transactionEvidenceAuthorityHash',
  'issuedAt',
  'expiresAt',
  'authorityId',
  'signature',
];
const HEAD_SIGNATURE_KEYS = [
  'mode',
  'algorithm',
  'signatureEncoding',
  'signatureValueEncoding',
  'keyId',
  'keyUsage',
  'authorityId',
  'signedAt',
  'value',
];
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ATOMIC_PATTERN = /^(0|[1-9][0-9]*)$/;
const STRICT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const BASE64URL_UNPADDED_PATTERN = /^[A-Za-z0-9_-]+$/;
const UINT256_MAX = (1n << 256n) - 1n;

function clone(value) {
  return structuredClone(value);
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

function canonicalizeJson(value, seen = new Set()) {
  if (value === null) return 'null';
  if (typeof value === 'string') {
    return value.normalize('NFC') === value ? JSON.stringify(value) : null;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && !Object.is(value, -0) ? String(value) : null;
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return null;
  }
  if (!isPlainObject(value) && !Array.isArray(value)) return null;
  if (seen.has(value) || Object.getOwnPropertySymbols(value).length !== 0) return null;

  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value)) {
    const dataNames = names.filter((name) => name !== 'length');
    if (dataNames.length !== value.length) return null;
    seen.add(value);
    const items = value.map((item) => canonicalizeJson(item, seen));
    seen.delete(value);
    return items.some((item) => item === null) ? null : `[${items.join(',')}]`;
  }

  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
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

function domainSeparatedBytes(domain, value) {
  const canonical = canonicalizeJson(value);
  assert.notEqual(canonical, null);
  return Buffer.concat([Buffer.from(domain, 'utf8'), Buffer.from([0]), Buffer.from(canonical)]);
}

function domainHash(domain, value) {
  return `sha256:${createHash('sha256').update(domainSeparatedBytes(domain, value)).digest('hex')}`;
}

function hasExactKeys(value, expected) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const sortedExpected = [...expected].sort(compareCodePoints);
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function isIdentifier(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isAtomic(value) {
  return typeof value === 'string'
    && ATOMIC_PATTERN.test(value)
    && BigInt(value) <= UINT256_MAX;
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

function hasPath(object, pathExpression) {
  const parts = pathExpression.split('.');
  let target = object;
  for (const part of parts) {
    if (!target || typeof target !== 'object' || !Object.hasOwn(target, part)) return false;
    target = target[part];
  }
  return true;
}

function lifecycleSignaturePayload(record) {
  const payload = clone(record);
  delete payload.signature.value;
  return payload;
}

function authenticateLifecycleRecord(record) {
  const publicKey = createPublicKey({
    key: fixture.positive.lifecyclePublicKeyJwk,
    format: 'jwk',
  });
  const signature = Buffer.from(record.signature.value, 'base64url');
  return signature.length === 64 && verify(
    'sha256',
    domainSeparatedBytes(fixture.domains.lifecycleSignature, lifecycleSignaturePayload(record)),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    signature,
  );
}

function validateLifecycleIdentity(authority, record, { authenticated = true, executable = true } = {}) {
  if (!authenticated) return 'LIFECYCLE_RECORD_UNAUTHENTICATED';
  if (!executable) return 'LIFECYCLE_OUTCOME_NOT_EXECUTABLE';
  if (authority.lifecycleRegistryId !== record.registryId) {
    return 'LIFECYCLE_REGISTRY_ID_MISMATCH';
  }
  if (authority.lifecycleRegistrySchemaVersion !== record.registrySchemaVersion) {
    return 'LIFECYCLE_SCHEMA_MISMATCH';
  }
  if (authority.lifecycleRecordId !== record.recordId) return 'LIFECYCLE_RECORD_ID_MISMATCH';
  if (authority.lifecycleRecordRevision !== String(record.revision)) {
    return 'LIFECYCLE_RECORD_REVISION_MISMATCH';
  }
  if (
    authority.lifecycleRecordHash
      !== domainHash(fixture.domains.lifecycleRecordHash, record)
  ) {
    return 'LIFECYCLE_RECORD_HASH_MISMATCH';
  }
  if (
    authority.environment !== record.environment
  ) return 'ENVIRONMENT_MISMATCH';
  if (authority.cardId !== record.cardId) return 'CARD_ID_MISMATCH';
  if (authority.runtimeManifestId !== record.manifestId) return 'RUNTIME_MANIFEST_MISMATCH';
  return null;
}

function validateAuthorizationEpoch(authority, selection) {
  if (!selection.authenticated) return 'LIFECYCLE_RECORD_UNAUTHENTICATED';
  if (
    selection.selectionRequest.manifestId !== null
    || selection.selectionRequest.cardId !== authority.cardId
    || !selection.selectedCurrent
    || selection.operationalOutcome !== 'LIFECYCLE_ACTIVE'
    || selection.cardStatus !== 'CARD_ACTIVE'
    || selection.manifestStatus !== 'MANIFEST_CURRENT'
    || selection.superseded
  ) {
    return 'LIFECYCLE_OUTCOME_NOT_EXECUTABLE';
  }
  if (selection.environment !== authority.environment) return 'ENVIRONMENT_MISMATCH';
  if (selection.cardId !== authority.cardId) return 'CARD_ID_MISMATCH';
  if (selection.manifestId !== authority.runtimeManifestId) return 'RUNTIME_MANIFEST_MISMATCH';
  for (const key of [
    'lifecycleRegistryId',
    'lifecycleRegistrySchemaVersion',
    'lifecycleRecordId',
    'lifecycleRecordRevision',
    'lifecycleRecordHash',
  ]) {
    if (selection[key] !== authority[key]) return 'LIFECYCLE_AUTHORIZATION_EPOCH_MISMATCH';
  }
  return null;
}

function parseStrictTimestamp(value) {
  if (typeof value !== 'string' || !STRICT_TIMESTAMP_PATTERN.test(value)) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) return null;
  return milliseconds;
}

function headSignaturePayload(head) {
  const payload = clone(head);
  delete payload.signature.value;
  return payload;
}

function validateHeadShape(head) {
  if (
    !hasExactKeys(head, HEAD_KEYS)
    || !hasExactKeys(head.signature, HEAD_SIGNATURE_KEYS)
    || containsNativeNumberOrArray(head)
    || canonicalizeJson(head) === null
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  for (const key of [
    'registryId',
    'environment',
    'cardId',
    'coinCardRegistryRecordId',
    'authorityId',
  ]) {
    if (!isIdentifier(head[key])) return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  if (
    head.headSchemaVersion !== 'executable-registry-head.v1'
    || !isAtomic(head.headSequence)
    || BigInt(head.headSequence) === 0n
    || !isAtomic(head.coinCardRegistryRecordRevision)
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  for (const key of [
    'lifecycleRecordHash',
    'coinCardRegistryRecordHash',
    'transactionEvidenceAuthorityHash',
  ]) {
    if (!HASH_PATTERN.test(head[key])) return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  const issuedAt = parseStrictTimestamp(head.issuedAt);
  const expiresAt = parseStrictTimestamp(head.expiresAt);
  const maximumLifetimeMs = Number(fixture.currentness.executableRegistryHead.maximumLifetimeSeconds) * 1000;
  if (
    issuedAt === null
    || expiresAt === null
    || issuedAt >= expiresAt
    || expiresAt - issuedAt > maximumLifetimeMs
    || head.signature.signedAt !== head.issuedAt
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  for (const key of ['keyId', 'authorityId']) {
    if (!isIdentifier(head.signature[key])) return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  if (Object.values(head.signature).some((value) => typeof value !== 'string')) {
    return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  if (
    typeof head.signature.value !== 'string'
    || !BASE64URL_UNPADDED_PATTERN.test(head.signature.value)
    || Buffer.from(head.signature.value, 'base64url').length !== 64
    || Buffer.from(head.signature.value, 'base64url').toString('base64url') !== head.signature.value
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID';
  }
  return null;
}

function authenticateExecutableRegistryHead(
  head,
  {
    domain = fixture.domains.executableRegistryHeadSignature,
    publicKeyJwk = fixture.currentness.executableRegistryHead.publicKeyJwk,
    trustedKeyUsage = 'coin-card-executable-registry-head',
    trustedAuthorityId = 'implicitex-executable-registry',
  } = {},
) {
  const shapeError = validateHeadShape(head);
  if (shapeError) return shapeError;
  if (
    head.signature.keyUsage !== 'coin-card-executable-registry-head'
    || trustedKeyUsage !== 'coin-card-executable-registry-head'
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_KEY_USAGE_INVALID';
  }
  if (
    head.signature.mode !== 'signed-p256-v1'
    || head.signature.algorithm !== 'ECDSA_P256_SHA256'
    || head.signature.signatureEncoding !== 'ieee-p1363'
    || head.signature.signatureValueEncoding !== 'base64url-unpadded'
    || head.authorityId !== trustedAuthorityId
    || head.signature.authorityId !== trustedAuthorityId
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID';
  }
  try {
    const publicKey = createPublicKey({ key: publicKeyJwk, format: 'jwk' });
    const signature = Buffer.from(head.signature.value, 'base64url');
    return verify(
      'sha256',
      domainSeparatedBytes(domain, headSignaturePayload(head)),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signature,
    ) ? null : 'EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID';
  } catch (error) {
    return 'EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID';
  }
}

function validateHeadTime(head, now) {
  const nowMs = parseStrictTimestamp(now);
  const issuedAt = parseStrictTimestamp(head.issuedAt);
  const expiresAt = parseStrictTimestamp(head.expiresAt);
  const skewMs = Number(fixture.currentness.executableRegistryHead.allowedClockSkewSeconds) * 1000;
  if (
    nowMs === null
    || issuedAt === null
    || expiresAt === null
    || nowMs < issuedAt - skewMs
    || nowMs >= expiresAt + skewMs
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_TIME_INVALID';
  }
  return null;
}

function validateHeadSource(head, source) {
  const headHash = domainHash(fixture.domains.executableRegistryHeadArtifactHash, head);
  if (!source || source.authenticated !== true || source.boundHeadHash !== headHash) {
    return 'EXECUTABLE_REGISTRY_HEAD_SOURCE_CURRENTNESS_UNAVAILABLE';
  }
  if (!isAtomic(source.highestSeenSequence) || !HASH_PATTERN.test(source.highestSeenHeadHash)) {
    return 'EXECUTABLE_REGISTRY_HEAD_SOURCE_CURRENTNESS_UNAVAILABLE';
  }
  const sequence = BigInt(head.headSequence);
  const highestSeen = BigInt(source.highestSeenSequence);
  if (sequence < highestSeen) return 'EXECUTABLE_REGISTRY_HEAD_SEQUENCE_ROLLBACK';
  if (sequence === highestSeen && source.highestSeenHeadHash !== headHash) {
    return 'EXECUTABLE_REGISTRY_HEAD_SEQUENCE_EQUIVOCATION';
  }
  return null;
}

function validateHeadConjunction(head, authority, record, selection, authorityHash) {
  if (
    head.registryId !== authority.coinCardRegistryId
    || head.registryId !== record.registryId
    || head.environment !== authority.environment
    || head.environment !== record.environment
    || head.cardId !== authority.cardId
    || head.cardId !== record.cardId
    || head.lifecycleRecordHash !== authority.lifecycleRecordHash
    || head.lifecycleRecordHash !== selection.lifecycleRecordHash
    || head.coinCardRegistryRecordId !== authority.coinCardRegistryRecordId
    || head.coinCardRegistryRecordId !== record.recordId
    || head.coinCardRegistryRecordRevision !== authority.coinCardRegistryRecordRevision
    || head.coinCardRegistryRecordRevision !== record.revision
    || head.coinCardRegistryRecordHash !== authority.coinCardRegistryRecordHash
    || head.coinCardRegistryRecordHash
      !== domainHash(fixture.domains.executableRegistryRecordHash, record)
    || head.transactionEvidenceAuthorityHash !== authorityHash
  ) {
    return 'EXECUTABLE_REGISTRY_HEAD_MISMATCH';
  }
  return null;
}

function validatePaymentRouteTransition(previousAuthority, nextAuthority, previousHead, nextHead) {
  const executionCriticalKeys = [
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
  const changed = executionCriticalKeys.some(
    (key) => canonicalizeJson(previousAuthority[key]) !== canonicalizeJson(nextAuthority[key]),
  );
  if (!changed) return null;
  if (
    previousAuthority.authorityHash === nextAuthority.authorityHash
    || previousAuthority.coinCardRegistryRecordId === nextAuthority.coinCardRegistryRecordId
    || previousAuthority.coinCardRegistryRecordHash === nextAuthority.coinCardRegistryRecordHash
    || BigInt(nextAuthority.coinCardRegistryRecordRevision)
      <= BigInt(previousAuthority.coinCardRegistryRecordRevision)
    || BigInt(nextHead.headSequence) <= BigInt(previousHead.headSequence)
    || nextHead.transactionEvidenceAuthorityHash !== nextAuthority.authorityHash
    || nextHead.coinCardRegistryRecordRevision !== nextAuthority.coinCardRegistryRecordRevision
    || nextHead.coinCardRegistryRecordHash !== nextAuthority.coinCardRegistryRecordHash
    || nextHead.lifecycleRecordHash !== nextAuthority.lifecycleRecordHash
  ) {
    return 'PAYMENT_AUTHORIZATION_EPOCH_REUSE';
  }
  return null;
}

function validateRuntimeLifecycleTransition(previousAuthority, nextAuthority) {
  if (previousAuthority.runtimeManifestId === nextAuthority.runtimeManifestId) return null;
  for (const key of [
    'lifecycleRecordId',
    'lifecycleRecordRevision',
    'lifecycleRecordHash',
  ]) {
    if (previousAuthority[key] === nextAuthority[key]) {
      return 'LIFECYCLE_AUTHORIZATION_EPOCH_REUSE';
    }
  }
  return null;
}

function containsNativeNumberOrArray(value) {
  if (typeof value === 'number' || Array.isArray(value)) return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some(containsNativeNumberOrArray);
}

function validateExecutableRegistryShape(record) {
  if (record && record.schema === 'implicitex.coincard.v1') {
    return 'LEGACY_REGISTRY_NOT_EXECUTABLE';
  }
  if (record && record.registrySchemaVersion === 'coin-card-registry-record.v1') {
    return 'LEGACY_REGISTRY_NOT_EXECUTABLE';
  }
  if (!record || record.registrySchemaVersion !== 'coin-card-registry-record.v2') {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  if (
    !hasExactKeys(record, REGISTRY_KEYS)
    || !hasExactKeys(record.feePolicy, FEE_POLICY_KEYS)
    || containsNativeNumberOrArray(record)
    || canonicalizeJson(record) === null
  ) {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  for (const key of ['registryId', 'environment', 'recordId', 'cardId', 'executionContractInterfaceId']) {
    if (!isIdentifier(record[key])) return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  for (const key of ['revision', 'chainId']) {
    if (!isAtomic(record[key])) return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  for (const key of ['recipientAddress', 'tokenContractAddress', 'executionContractAddress']) {
    if (!ADDRESS_PATTERN.test(record[key]) || /^0x0{40}$/.test(record[key])) {
      return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
    }
  }
  if (!HASH_PATTERN.test(record.executionInterfaceDescriptorHash)) {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  for (const key of [
    'feeBasisPoints',
    'minimumTransferAtomic',
    'maximumTransferAtomic',
    'transferPrecisionAtomic',
  ]) {
    if (!isAtomic(record.feePolicy[key])) return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  if (record.feePolicy.feeCapAtomic !== null && !isAtomic(record.feePolicy.feeCapAtomic)) {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  if (
    BigInt(record.feePolicy.feeBasisPoints) > 10000n
    || record.feePolicy.roundingRule !== 'FLOOR_BPS_THEN_CAP'
    || !ADDRESS_PATTERN.test(record.feePolicy.feeRecipientAddress)
  ) {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  return null;
}

function validateMigrationCandidate(record) {
  if (fixture.migrationRequiredFacts.some((fieldPath) => !hasPath(record, fieldPath))) {
    return 'REGISTRY_MIGRATION_FACT_MISSING';
  }
  return validateExecutableRegistryShape(record);
}

function executionAuthority() {
  const record = fixture.positive.executableRegistryRecord;
  return {
    ...clone(fixture.positive.authorityIdentity),
    recipientAddress: record.recipientAddress,
    chainId: record.chainId,
    tokenContractAddress: record.tokenContractAddress,
    executionContractAddress: record.executionContractAddress,
    executionContractInterfaceId: record.executionContractInterfaceId,
    executionInterfaceDescriptorHash: record.executionInterfaceDescriptorHash,
    feePolicy: clone(record.feePolicy),
  };
}

function validateExecutableRegistryIdentity(authority, record) {
  const shapeError = validateExecutableRegistryShape(record);
  if (shapeError) return shapeError;
  if (authority.coinCardRegistryId !== record.registryId) {
    return 'COIN_CARD_REGISTRY_ID_MISMATCH';
  }
  if (authority.coinCardRegistrySchemaVersion !== record.registrySchemaVersion) {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  if (authority.coinCardRegistryRecordId !== record.recordId) {
    return 'COIN_CARD_REGISTRY_RECORD_ID_MISMATCH';
  }
  if (authority.coinCardRegistryRecordRevision !== record.revision) {
    return 'COIN_CARD_REGISTRY_REVISION_MISMATCH';
  }
  if (
    authority.coinCardRegistryRecordHash
      !== domainHash(fixture.domains.executableRegistryRecordHash, record)
  ) {
    return 'COIN_CARD_REGISTRY_RECORD_HASH_MISMATCH';
  }
  for (const key of [
    'environment',
    'cardId',
    'recipientAddress',
    'chainId',
    'tokenContractAddress',
    'executionContractAddress',
    'executionContractInterfaceId',
    'executionInterfaceDescriptorHash',
  ]) {
    if (authority[key] !== record[key]) return 'COIN_CARD_REGISTRY_EXECUTION_FIELD_MISMATCH';
  }
  if (canonicalizeJson(authority.feePolicy) !== canonicalizeJson(record.feePolicy)) {
    return 'COIN_CARD_REGISTRY_EXECUTION_FIELD_MISMATCH';
  }
  return null;
}

test('positive lifecycle fixture authenticates and pins exact record hash', () => {
  const record = fixture.positive.lifecycleRecord;
  assert.equal(authenticateLifecycleRecord(record), true);
  assert.equal(canonicalizeJson(record), fixture.positive.expectedLifecycleCanonicalJson);
  assert.equal(
    domainHash(fixture.domains.lifecycleRecordHash, record),
    fixture.positive.expectedLifecycleRecordHash,
  );
});

test('lifecycle signature value is part of exact record identity', () => {
  const record = clone(fixture.positive.lifecycleRecord);
  const originalHash = domainHash(fixture.domains.lifecycleRecordHash, record);
  const signature = Buffer.from(record.signature.value, 'base64url');
  signature[0] ^= 0x01;
  record.signature.value = signature.toString('base64url');
  assert.notEqual(domainHash(fixture.domains.lifecycleRecordHash, record), originalHash);
  assert.equal(authenticateLifecycleRecord(record), false);
});

test('one-field lifecycle record mutations invalidate authentication and exact identity', () => {
  const originalHash = fixture.positive.expectedLifecycleRecordHash;
  for (const vector of fixture.lifecycleRecordMutations) {
    const record = clone(fixture.positive.lifecycleRecord);
    setPath(record, vector.path, vector.replacement);
    assert.equal(authenticateLifecycleRecord(record), false, vector.id);
    assert.notEqual(
      domainHash(fixture.domains.lifecycleRecordHash, record),
      originalHash,
      vector.id,
    );
  }
});

test('lifecycle identity binds registry, schema, record, revision, hash, card, and manifest', () => {
  const authority = fixture.positive.authorityIdentity;
  const record = fixture.positive.lifecycleRecord;
  assert.equal(validateLifecycleIdentity(authority, record), null);
  assert.equal(record.registryVersion, 19);
  assert.equal(record.revision, 7);
  assert.equal(authority.lifecycleRecordRevision, '7');
  assert.notEqual(authority.lifecycleRecordRevision, String(record.registryVersion));
});

test('lifecycle identity mutations fail without version-field substitution', () => {
  for (const vector of fixture.lifecycleIdentityMutations) {
    const authority = clone(fixture.positive.authorityIdentity);
    setPath(authority, vector.path, vector.replacement);
    assert.equal(
      validateLifecycleIdentity(authority, fixture.positive.lifecycleRecord),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('lifecycle semantic disagreements do not masquerade as record-hash failures', () => {
  for (const vector of fixture.lifecycleSemanticMutations) {
    const authority = clone(fixture.positive.authorityIdentity);
    setPath(authority, vector.path, vector.replacement);
    assert.equal(
      validateLifecycleIdentity(authority, fixture.positive.lifecycleRecord),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('lifecycle authentication and executable outcome are independent prerequisites', () => {
  const authority = fixture.positive.authorityIdentity;
  const record = fixture.positive.lifecycleRecord;
  assert.equal(
    validateLifecycleIdentity(authority, record, { authenticated: false }),
    'LIFECYCLE_RECORD_UNAUTHENTICATED',
  );
  assert.equal(
    validateLifecycleIdentity(authority, record, { authenticated: true, executable: false }),
    'LIFECYCLE_OUTCOME_NOT_EXECUTABLE',
  );
});

test('fresh card-only lifecycle selection establishes exact operational runtime identity', () => {
  assert.equal(
    validateAuthorizationEpoch(
      fixture.positive.authorityIdentity,
      fixture.currentness.positiveSelection,
    ),
    null,
  );
  assert.equal(fixture.currentness.positiveSelection.selectionRequest.manifestId, null);
  assert.equal(fixture.currentness.positiveSelection.sourceCurrentnessAuthenticated, false);
});

test('stale and superseded lifecycle evidence fails closed while an absent head leaves currentness unavailable', () => {
  const staleAuthority = clone(fixture.positive.authorityIdentity);
  setPath(
    staleAuthority,
    fixture.currentness.staleAuthority.path,
    fixture.currentness.staleAuthority.replacement,
  );
  assert.equal(
    validateAuthorizationEpoch(staleAuthority, fixture.currentness.positiveSelection),
    fixture.currentness.staleAuthority.expectedCode,
  );

  assert.equal(fixture.currentness.positiveSelection.sourceCurrentnessAuthenticated, false);
  assert.equal(fixture.currentness.currentnessUnavailable.head, null);
  assert.equal(
    fixture.currentness.currentnessUnavailable.expectedCode,
    'LIFECYCLE_CURRENTNESS_UNAVAILABLE',
  );

  const superseded = {
    ...clone(fixture.currentness.positiveSelection),
    ...clone(fixture.currentness.supersededSelection),
  };
  delete superseded.expectedCode;
  assert.equal(
    validateAuthorizationEpoch(fixture.positive.authorityIdentity, superseded),
    fixture.currentness.supersededSelection.expectedCode,
  );
});

test('existing lifecycle lineage cannot publish a same-manifest successor', () => {
  const capabilities = fixture.currentness.lifecycleModelCapabilities;
  assert.equal(capabilities.sameManifestSuccessorSupported, false);
  assert.equal(capabilities.paymentRouteEpochMechanism, 'EXECUTABLE_REGISTRY_HEAD');
  assert.equal(lifecycleSelectorSource.includes('if (recordMap[manifestKey])'), true);
  assert.equal(lifecycleSelectorSource.includes('reason: REASONS.AMBIGUOUS'), true);
  assert.equal(contractSource.includes('payment-only administration MUST NOT fabricate'), true);
});

test('positive executable-registry head pins closed canonical bytes, P-256 signature, and artifact hash', () => {
  const vector = fixture.currentness.executableRegistryHead;
  const head = vector.head;
  assert.equal(validateHeadShape(head), null);
  assert.equal(canonicalizeJson(headSignaturePayload(head)), vector.expectedSignedPayloadCanonicalJson);
  assert.equal(canonicalizeJson(head), vector.expectedHeadCanonicalJson);
  assert.equal(authenticateExecutableRegistryHead(head), null);
  assert.equal(
    domainHash(fixture.domains.executableRegistryHeadArtifactHash, head),
    vector.expectedHeadHash,
  );
  for (const domain of [
    fixture.domains.executableRegistryHeadSignature,
    fixture.domains.executableRegistryHeadArtifactHash,
  ]) {
    assert.equal(contractSource.includes(domain), true, domain);
    assert.equal(transactionEvidenceContractSource.includes(domain), true, domain);
  }
  assert.equal(validateHeadTime(head, vector.fixedNow), null);
  assert.equal(validateHeadSource(head, vector.currentSource), null);
  assert.equal(
    validateHeadConjunction(
      head,
      transactionEvidenceFixture.positive.authority,
      fixture.positive.executableRegistryRecord,
      fixture.currentness.positiveSelection,
      transactionEvidenceFixture.positive.expectedAuthorityHash,
    ),
    null,
  );
});

test('head property order is irrelevant while signed one-field mutations invalidate authentication', () => {
  const head = fixture.currentness.executableRegistryHead.head;
  const reordered = Object.fromEntries(Object.entries(head).reverse());
  reordered.signature = Object.fromEntries(Object.entries(head.signature).reverse());
  assert.equal(authenticateExecutableRegistryHead(reordered), null);
  assert.equal(
    domainHash(fixture.domains.executableRegistryHeadArtifactHash, reordered),
    fixture.currentness.executableRegistryHead.expectedHeadHash,
  );

  const expectedMutationPaths = HEAD_KEYS
    .filter((key) => key !== 'signature')
    .concat(
      HEAD_SIGNATURE_KEYS
        .filter((key) => key !== 'value')
        .map((key) => `signature.${key}`),
    )
    .sort(compareCodePoints);
  assert.deepEqual(
    fixture.currentness.headSignedFieldMutations
      .map((vector) => vector.path)
      .sort(compareCodePoints),
    expectedMutationPaths,
  );

  for (const vector of fixture.currentness.headSignedFieldMutations) {
    const mutated = clone(head);
    setPath(mutated, vector.path, vector.replacement);
    assert.equal(
      verify(
        'sha256',
        domainSeparatedBytes(
          fixture.domains.executableRegistryHeadSignature,
          headSignaturePayload(mutated),
        ),
        {
          key: createPublicKey({
            key: fixture.currentness.executableRegistryHead.publicKeyJwk,
            format: 'jwk',
          }),
          dsaEncoding: 'ieee-p1363',
        },
        Buffer.from(mutated.signature.value, 'base64url'),
      ),
      false,
      vector.id,
    );
  }
});

test('head rejects signature mutation, wrong domain, wrong key, and wrong trusted-key usage', () => {
  const head = fixture.currentness.executableRegistryHead.head;
  const signatureMutation = clone(head);
  const bytes = Buffer.from(signatureMutation.signature.value, 'base64url');
  bytes[0] ^= 0x01;
  signatureMutation.signature.value = bytes.toString('base64url');
  assert.equal(
    authenticateExecutableRegistryHead(signatureMutation),
    'EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID',
  );
  assert.equal(
    authenticateExecutableRegistryHead(head, { domain: 'ImplicitEx.CoinCard.WrongHead.v1' }),
    'EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID',
  );
  assert.equal(
    authenticateExecutableRegistryHead(head, {
      publicKeyJwk: fixture.positive.lifecyclePublicKeyJwk,
    }),
    'EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID',
  );
  const wrongUsage = clone(head);
  wrongUsage.signature.keyUsage = 'coin-card-transaction-evidence';
  assert.equal(
    authenticateExecutableRegistryHead(wrongUsage),
    'EXECUTABLE_REGISTRY_HEAD_KEY_USAGE_INVALID',
  );
  assert.equal(
    authenticateExecutableRegistryHead(head, {
      trustedKeyUsage: 'coin-card-transaction-evidence',
    }),
    'EXECUTABLE_REGISTRY_HEAD_KEY_USAGE_INVALID',
  );
});

test('head closed schema rejects malformed scalars, unknown fields, and invalid intervals', () => {
  const head = fixture.currentness.executableRegistryHead.head;
  for (const vector of fixture.currentness.headShapeMutations) {
    const mutated = clone(head);
    setPath(mutated, vector.path, vector.replacement);
    assert.equal(validateHeadShape(mutated), 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID', vector.id);
  }
  const unknown = clone(head);
  unknown.displayLabel = 'current';
  assert.equal(validateHeadShape(unknown), 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID');

  const reversed = clone(head);
  reversed.expiresAt = reversed.issuedAt;
  assert.equal(validateHeadShape(reversed), 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID');

  const overlong = clone(head);
  overlong.expiresAt = '2026-07-21T12:05:00.001Z';
  assert.equal(validateHeadShape(overlong), 'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID');
});

test('head time validation pins inclusive issue skew and exclusive expiry skew', () => {
  const vector = fixture.currentness.executableRegistryHead;
  assert.equal(validateHeadTime(vector.head, '2026-07-20T12:00:00.000Z'), null);
  assert.equal(validateHeadTime(vector.head, '2026-07-21T12:09:59.999Z'), null);
  for (const timeVector of fixture.currentness.headTimeVectors) {
    assert.equal(
      validateHeadTime(vector.head, timeVector.now),
      timeVector.expectedCode,
      timeVector.id,
    );
  }
});

test('authenticated head source enforces exact artifact binding, rollback, and equivocation rules', () => {
  const vector = fixture.currentness.executableRegistryHead;
  for (const sourceVector of fixture.currentness.headSourceVectors) {
    const source = clone(vector.currentSource);
    setPath(source, sourceVector.path, sourceVector.replacement);
    if (sourceVector.secondaryPath) {
      setPath(source, sourceVector.secondaryPath, sourceVector.secondaryReplacement);
    }
    assert.equal(
      validateHeadSource(vector.head, source),
      sourceVector.expectedCode,
      sourceVector.id,
    );
  }

  const equalReplay = clone(vector.currentSource);
  equalReplay.highestSeenSequence = vector.head.headSequence;
  equalReplay.highestSeenHeadHash = vector.expectedHeadHash;
  assert.equal(validateHeadSource(vector.head, equalReplay), null);
});

test('every head identity field must equal lifecycle, Registry V2, and Transaction Evidence', () => {
  const head = fixture.currentness.executableRegistryHead.head;
  for (const vector of fixture.currentness.headEqualityMutations) {
    const mutated = clone(head);
    setPath(mutated, vector.path, vector.replacement);
    assert.equal(
      validateHeadConjunction(
        mutated,
        transactionEvidenceFixture.positive.authority,
        fixture.positive.executableRegistryRecord,
        fixture.currentness.positiveSelection,
        transactionEvidenceFixture.positive.expectedAuthorityHash,
      ),
      'EXECUTABLE_REGISTRY_HEAD_MISMATCH',
      vector.id,
    );
  }
});

test('payment-route epoch advances independently while unchanged runtime identity is retained', () => {
  const vector = fixture.currentness.paymentRouteTransition;
  assert.equal(
    validatePaymentRouteTransition(
      vector.previousAuthority,
      vector.nextAuthority,
      vector.previousHead,
      vector.nextHead,
    ),
    null,
  );
  assert.equal(vector.expectedSameManifestAllowed, true);
  assert.equal(vector.expectedRevisionGapAllowed, true);
  assert.equal(vector.nextAuthority.runtimeManifestId, vector.previousAuthority.runtimeManifestId);
  assert.equal(vector.nextAuthority.lifecycleRecordHash, vector.previousAuthority.lifecycleRecordHash);
  assert.equal(
    BigInt(vector.nextAuthority.coinCardRegistryRecordRevision)
      > BigInt(vector.previousAuthority.coinCardRegistryRecordRevision) + 1n,
    true,
    'a valid successor may skip unpublished or abandoned revision values',
  );

  for (const invalid of vector.nonIncreasingRevisionVectors) {
    const nextAuthority = clone(vector.nextAuthority);
    const nextHead = clone(vector.nextHead);
    nextAuthority.coinCardRegistryRecordRevision = invalid.revision;
    nextHead.coinCardRegistryRecordRevision = invalid.revision;
    assert.equal(
      validatePaymentRouteTransition(
        vector.previousAuthority,
        nextAuthority,
        vector.previousHead,
        nextHead,
      ),
      invalid.expectedCode,
      invalid.id,
    );
  }

  assert.equal(
    validatePaymentRouteTransition(
      vector.previousAuthority,
      vector.nextAuthority,
      vector.previousHead,
      vector.previousHead,
    ),
    vector.missingHeadAdvanceCode,
  );

  const changedRuntime = clone(vector.previousAuthority);
  changedRuntime.runtimeManifestId = `sha256:${'f'.repeat(64)}`;
  assert.equal(
    validateRuntimeLifecycleTransition(vector.previousAuthority, changedRuntime),
    'LIFECYCLE_AUTHORIZATION_EPOCH_REUSE',
  );
});

test('positive executable V2 record pins canonical JSON, hash, and extracted equality', () => {
  const record = fixture.positive.executableRegistryRecord;
  assert.equal(validateExecutableRegistryShape(record), null);
  assert.equal(canonicalizeJson(record), fixture.positive.expectedExecutableRegistryCanonicalJson);
  assert.equal(
    domainHash(fixture.domains.executableRegistryRecordHash, record),
    fixture.positive.expectedExecutableRegistryRecordHash,
  );
  assert.equal(validateExecutableRegistryIdentity(executionAuthority(), record), null);
});

test('executable-registry record ID identifies one revision-specific publication artifact', () => {
  const semantics = fixture.executableRegistryRecordIdSemantics;
  assert.equal(semantics.meaning, 'REVISION_SPECIFIC_PUBLICATION_ARTIFACT');
  assert.equal(semantics.recordId, fixture.positive.executableRegistryRecord.recordId);
  assert.equal(semantics.revision, fixture.positive.executableRegistryRecord.revision);
  assert.notEqual(semantics.successorRecordId, semantics.recordId);
  assert.equal(BigInt(semantics.successorRevision) > BigInt(semantics.revision), true);
  assert.notEqual(
    BigInt(semantics.successorRevision),
    BigInt(semantics.revision) + 1n,
    'successor vector proves that revision contiguity is not required',
  );
  assert.equal(contractSource.includes('a new revision MUST use a new record ID'), true);
});

test('Transaction Evidence fixture binds the exact Phase 1C lifecycle and registry identities', () => {
  const authority = transactionEvidenceFixture.positive.authority;
  assert.deepEqual(
    transactionEvidenceFixture.positive.registryRecord,
    fixture.positive.executableRegistryRecord,
  );
  for (const key of Object.keys(fixture.positive.authorityIdentity)) {
    assert.equal(authority[key], fixture.positive.authorityIdentity[key], key);
  }
  assert.equal(
    transactionEvidenceFixture.domains.lifecycleRecord,
    fixture.domains.lifecycleRecordHash,
  );
  assert.equal(
    transactionEvidenceFixture.domains.registryRecord,
    fixture.domains.executableRegistryRecordHash,
  );
});

test('V2 property order is irrelevant but unknown fields and native numbers are invalid', () => {
  const record = fixture.positive.executableRegistryRecord;
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(canonicalizeJson(reordered), fixture.positive.expectedExecutableRegistryCanonicalJson);
  assert.equal(
    domainHash(fixture.domains.executableRegistryRecordHash, reordered),
    fixture.positive.expectedExecutableRegistryRecordHash,
  );

  const unknown = clone(record);
  unknown.tokenSymbol = 'USDC';
  assert.equal(validateExecutableRegistryShape(unknown), 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED');

  const nativeNumber = clone(record);
  nativeNumber.chainId = 137;
  assert.equal(validateExecutableRegistryShape(nativeNumber), 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED');
});

test('executable-registry identity mutations fail deterministically', () => {
  for (const vector of fixture.executableRegistryIdentityMutations) {
    const authority = executionAuthority();
    setPath(authority, vector.path, vector.replacement);
    assert.equal(
      validateExecutableRegistryIdentity(authority, fixture.positive.executableRegistryRecord),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('every extracted V2 execution field must equal the same signed authority', () => {
  for (const fieldPath of fixture.executionFieldMutations) {
    const authority = executionAuthority();
    const current = fieldPath.split('.').reduce((value, key) => value[key], authority);
    setPath(authority, fieldPath, typeof current === 'string' ? `${current}-mutated` : null);
    assert.equal(
      validateExecutableRegistryIdentity(authority, fixture.positive.executableRegistryRecord),
      'COIN_CARD_REGISTRY_EXECUTION_FIELD_MISMATCH',
      fieldPath,
    );
  }
});

test('legacy presentation and Phase 1B scaffold records are never executable V2 authority', () => {
  for (const vector of fixture.legacyRecords) {
    assert.equal(validateExecutableRegistryShape(vector.record), vector.expectedCode, vector.id);
  }
});

test('migration requires explicit input for every missing legacy execution fact', () => {
  const expectedLeafPaths = REGISTRY_KEYS
    .filter((key) => key !== 'feePolicy')
    .concat(FEE_POLICY_KEYS.map((key) => `feePolicy.${key}`))
    .sort(compareCodePoints);
  assert.deepEqual(
    [...fixture.migrationRequiredFacts].sort(compareCodePoints),
    expectedLeafPaths,
    'migration coverage must include every required V2 leaf',
  );
  for (const fieldPath of fixture.migrationRequiredFacts) {
    const candidate = clone(fixture.positive.executableRegistryRecord);
    deletePath(candidate, fieldPath);
    assert.equal(validateMigrationCandidate(candidate), 'REGISTRY_MIGRATION_FACT_MISSING', fieldPath);
  }
  assert.equal(contractSource.includes('Migration MUST NOT infer these values'), true);
  assert.equal(contractSource.includes('`REGISTRY_MIGRATION_FACT_MISSING`'), true);
});

test('legacy generic identity aliases are explicitly rejected by the contract', () => {
  for (const name of [
    'lifecycleSchemaVersion',
    'lifecycleVersion',
    'registryRecordHash',
    'registryRecordRevision',
  ]) {
    assert.equal(contractSource.includes(`\`${name}\``), true, name);
  }
  assert.equal(contractSource.includes('MUST NOT be accepted as aliases'), true);
});

test('Phase 1C taxonomy is closed over every focused rejection result', () => {
  const codes = new Set([
    'LIFECYCLE_RECORD_UNAUTHENTICATED',
    'LIFECYCLE_OUTCOME_NOT_EXECUTABLE',
    'LIFECYCLE_AUTHORIZATION_EPOCH_REUSE',
    fixture.currentness.staleAuthority.expectedCode,
    fixture.currentness.currentnessUnavailable.expectedCode,
    fixture.currentness.paymentRouteTransition.missingHeadAdvanceCode,
    'TRANSACTION_EVIDENCE_AUTHORITY_CONFLICT',
    'EXECUTABLE_REGISTRY_HEAD_SCHEMA_INVALID',
    'EXECUTABLE_REGISTRY_HEAD_SIGNATURE_INVALID',
    'EXECUTABLE_REGISTRY_HEAD_KEY_USAGE_INVALID',
    'EXECUTABLE_REGISTRY_HEAD_MISMATCH',
    ...fixture.currentness.headTimeVectors.map((vector) => vector.expectedCode),
    ...fixture.currentness.headSourceVectors.map((vector) => vector.expectedCode),
    ...fixture.lifecycleIdentityMutations.map((vector) => vector.expectedCode),
    ...fixture.lifecycleSemanticMutations.map((vector) => vector.expectedCode),
    ...fixture.executableRegistryIdentityMutations.map((vector) => vector.expectedCode),
    'COIN_CARD_REGISTRY_EXECUTION_FIELD_MISMATCH',
    'LEGACY_REGISTRY_NOT_EXECUTABLE',
    'REGISTRY_MIGRATION_FACT_MISSING',
  ]);
  for (const code of codes) {
    assert.equal(contractSource.includes(`\`${code}\``), true, code);
    assert.equal(
      transactionEvidenceContractSource.includes(`\`${code}\``),
      true,
      `Transaction Evidence taxonomy: ${code}`,
    );
  }
});
