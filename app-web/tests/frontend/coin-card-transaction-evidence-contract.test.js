const assert = require('node:assert/strict');
const { createHash, createPublicKey, verify } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Phase 1 reference model only. Production runtime code must not import this file.
const repoRoot = path.resolve(__dirname, '../../..');
const fixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.transaction-evidence.fixtures.v1.json',
);
const contractPath = path.join(
  repoRoot,
  'docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md',
);
const descriptorFixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.execution-interface-descriptor.fixtures.v1.json',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const descriptorFixture = JSON.parse(fs.readFileSync(descriptorFixturePath, 'utf8'));
const contractSource = fs.readFileSync(contractPath, 'utf8');

const AUTHORITY_KEYS = [
  'evidenceDomain',
  'evidenceSchemaVersion',
  'issuerId',
  'environment',
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

const OBSERVED_FEE_POLICY_KEYS = [
  'policyVersion',
  'feeBasisPoints',
  'feeCapEnabled',
  'feeCapAtomic',
  'minimumTransferAtomic',
  'transferPrecisionAtomic',
  'roundingRule',
  'feeRecipientAddress',
];

const INTENT_KEYS = [
  'intentSchemaVersion',
  'authorityHash',
  'cardId',
  'runtimeManifestId',
  'senderAddress',
  'recipientAddress',
  'chainId',
  'tokenContractAddress',
  'executionContractAddress',
  'executionContractInterfaceId',
  'executionInterfaceDescriptorHash',
  'amountSentAtomic',
  'feeAmountAtomic',
  'totalDebitedAtomic',
];

const OBSERVATION_KEYS = [
  'observationSchemaVersion',
  'authorityHash',
  'intentHash',
  'observationBlockNumber',
  'observationBlockHash',
  'connectedAccount',
  'chainId',
  'tokenContractAddress',
  'executionContractAddress',
  'executionContractInterfaceId',
  'executionInterfaceDescriptorHash',
  'executionContractCodeHash',
  'contractPaused',
  'feePolicy',
  'senderBalanceAtomic',
  'senderAllowanceAtomic',
];

const LEGACY_COMPATIBILITY_KEYS = [
  'sourceSchemaVersion',
  'manifestId',
  'cardId',
  'issuerId',
  'environment',
  'recipientAddress',
  'chainNamespace',
  'chainId',
  'tokenStandard',
  'tokenContractAddress',
  'amountPolicy',
];

const PAYMENT_FREE_RUNTIME_KEYS = [
  'sourceSchemaVersion',
  'paymentFieldsPresent',
];

const SETTLEMENT_KEYS = [
  'settlementSchemaVersion',
  'authorityHash',
  'intentHash',
  'transactionHash',
  'blockNumber',
  'blockHash',
  'logIndex',
  'eventContractAddress',
  'senderAddress',
  'recipientAddress',
  'tokenContractAddress',
  'amountSentAtomic',
  'feeAmountAtomic',
  'totalDebitedAtomic',
  'policyCommitment',
];

const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const ZERO_ADDRESS = `0x${'0'.repeat(40)}`;
const ATOMIC_INTEGER_PATTERN = /^(0|[1-9][0-9]*)$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
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
  return (
    typeof value === 'string'
    && containsOnlyUnicodeScalars(value)
    && value.normalize('NFC') === value
  );
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalizeJson(value, seen = new Set()) {
  if (value === null) return 'null';
  if (typeof value === 'string') return isCanonicalString(value) ? JSON.stringify(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && !Object.is(value, -0) ? String(value) : null;
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return null;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  if (!Array.isArray(value) && !isPlainObject(value)) return null;
  if (Object.getOwnPropertySymbols(value).length !== 0) return null;

  const names = Object.getOwnPropertyNames(value);
  if (Array.isArray(value)) {
    const dataNames = names.filter((name) => name !== 'length');
    if (dataNames.length !== value.length) return null;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
    }
    seen.add(value);
    const items = value.map((item) => canonicalizeJson(item, seen));
    seen.delete(value);
    return items.some((item) => item === null) ? null : `[${items.join(',')}]`;
  }

  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
    if (!isCanonicalString(name)) return null;
  }

  seen.add(value);
  const properties = [];
  for (const name of names.sort(compareCodePoints)) {
    const serialized = canonicalizeJson(value[name], seen);
    if (serialized === null) {
      seen.delete(value);
      return null;
    }
    properties.push(`${JSON.stringify(name)}:${serialized}`);
  }
  seen.delete(value);
  return `{${properties.join(',')}}`;
}

function domainHash(domain, value) {
  const canonical = canonicalizeJson(value);
  assert.notEqual(canonical, null, 'fixture input must be canonicalizable');
  const digest = createHash('sha256')
    .update(Buffer.from(domain, 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonical, 'utf8'))
    .digest('hex');
  return `sha256:${digest}`;
}

function domainSeparatedBytes(domain, value) {
  const canonical = canonicalizeJson(value);
  assert.notEqual(canonical, null, 'fixture input must be canonicalizable');
  return Buffer.concat([
    Buffer.from(domain, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...expectedKeys].sort(compareCodePoints);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isCanonicalAddress(value) {
  return typeof value === 'string' && ADDRESS_PATTERN.test(value) && value !== ZERO_ADDRESS;
}

function isAtomicInteger(value, maximum = UINT256_MAX) {
  if (typeof value !== 'string' || !ATOMIC_INTEGER_PATTERN.test(value)) return false;
  const parsed = BigInt(value);
  return parsed <= maximum;
}

function isIdentifier(value) {
  return (
    isCanonicalString(value)
    && value.length > 0
    && value.trim() === value
  );
}

function firstInvalidAddress(value, keys) {
  return keys.some((key) => !isCanonicalAddress(value[key]));
}

function firstInvalidInteger(value, keys) {
  return keys.some((key) => !isAtomicInteger(value[key]));
}

function validateFeePolicyShape(policy, observed = false) {
  const expectedKeys = observed ? OBSERVED_FEE_POLICY_KEYS : FEE_POLICY_KEYS;
  if (!hasExactKeys(policy, expectedKeys)) return 'EVIDENCE_CANONICALIZATION_INVALID';
  if (!isIdentifier(policy.policyVersion) || policy.roundingRule !== 'FLOOR_BPS_THEN_CAP') {
    return 'FEE_POLICY_MISMATCH';
  }
  if (!isCanonicalAddress(policy.feeRecipientAddress)) return 'ADDRESS_ENCODING_INVALID';
  const integerKeys = observed
    ? ['feeBasisPoints', 'minimumTransferAtomic', 'transferPrecisionAtomic']
    : ['feeBasisPoints', 'minimumTransferAtomic', 'maximumTransferAtomic', 'transferPrecisionAtomic'];
  if (firstInvalidInteger(policy, integerKeys)) return 'INTEGER_ENCODING_INVALID';
  if (observed && typeof policy.feeCapEnabled !== 'boolean') {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (observed && !isAtomicInteger(policy.feeCapAtomic)) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (!observed && policy.feeCapAtomic !== null && !isAtomicInteger(policy.feeCapAtomic)) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (observed && policy.feeCapEnabled === false && policy.feeCapAtomic !== '0') {
    return 'FEE_POLICY_MISMATCH';
  }
  if (BigInt(policy.feeBasisPoints) > 10000n) return 'FEE_POLICY_MISMATCH';
  if (BigInt(policy.minimumTransferAtomic) === 0n || BigInt(policy.transferPrecisionAtomic) === 0n) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (!observed && BigInt(policy.maximumTransferAtomic) < BigInt(policy.minimumTransferAtomic)) {
    return 'INTEGER_ENCODING_INVALID';
  }
  return null;
}

function validateAuthorityShape(authority) {
  if (!hasExactKeys(authority, AUTHORITY_KEYS)) return 'EVIDENCE_CANONICALIZATION_INVALID';
  if (authority.evidenceDomain !== 'ImplicitEx.CoinCard.TransactionEvidence') {
    return 'EVIDENCE_DOMAIN_MISMATCH';
  }
  if (authority.evidenceSchemaVersion !== 'transaction-evidence.v1') {
    return 'EVIDENCE_SCHEMA_UNSUPPORTED';
  }
  if (
    !isIdentifier(authority.issuerId)
    || !isIdentifier(authority.environment)
    || !isIdentifier(authority.cardId)
    || !isIdentifier(authority.lifecycleRegistryId)
    || !isIdentifier(authority.lifecycleRegistrySchemaVersion)
    || !isIdentifier(authority.lifecycleRecordId)
    || !isIdentifier(authority.coinCardRegistryId)
    || !isIdentifier(authority.coinCardRegistrySchemaVersion)
    || !isIdentifier(authority.coinCardRegistryRecordId)
    || !isIdentifier(authority.executionContractInterfaceId)
  ) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (
    firstInvalidAddress(authority, [
      'recipientAddress',
      'tokenContractAddress',
      'executionContractAddress',
    ])
  ) {
    return 'ADDRESS_ENCODING_INVALID';
  }
  if (firstInvalidInteger(authority, [
    'lifecycleRecordRevision',
    'coinCardRegistryRecordRevision',
    'chainId',
  ])) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (
    !SHA256_PATTERN.test(authority.runtimeManifestId)
    || !SHA256_PATTERN.test(authority.lifecycleRecordHash)
    || !SHA256_PATTERN.test(authority.coinCardRegistryRecordHash)
    || !SHA256_PATTERN.test(authority.executionInterfaceDescriptorHash)
  ) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  return validateFeePolicyShape(authority.feePolicy);
}

function positiveContext() {
  const authority = fixture.positive.authority;
  return {
    issuerId: authority.issuerId,
    environment: authority.environment,
    cardId: authority.cardId,
    runtimeManifestId: authority.runtimeManifestId,
    lifecycleRegistryId: authority.lifecycleRegistryId,
    lifecycleRegistrySchemaVersion: authority.lifecycleRegistrySchemaVersion,
    lifecycleRecordId: authority.lifecycleRecordId,
    lifecycleRecordRevision: authority.lifecycleRecordRevision,
    lifecycleRecordHash: authority.lifecycleRecordHash,
  };
}

function validateAuthority(
  authority,
  registryRecord,
  context = positiveContext(),
  descriptor = descriptorFixture.positive.descriptor,
) {
  const shapeError = validateAuthorityShape(authority);
  if (shapeError) return shapeError;

  if (authority.issuerId !== context.issuerId) return 'ISSUER_ID_MISMATCH';
  if (authority.environment !== context.environment) return 'ENVIRONMENT_MISMATCH';
  if (authority.cardId !== context.cardId) return 'CARD_ID_MISMATCH';
  if (authority.runtimeManifestId !== context.runtimeManifestId) return 'RUNTIME_MANIFEST_MISMATCH';
  if (authority.lifecycleRegistryId !== context.lifecycleRegistryId) {
    return 'LIFECYCLE_REGISTRY_ID_MISMATCH';
  }
  if (authority.lifecycleRegistrySchemaVersion !== context.lifecycleRegistrySchemaVersion) {
    return 'LIFECYCLE_SCHEMA_MISMATCH';
  }
  if (authority.lifecycleRecordId !== context.lifecycleRecordId) {
    return 'LIFECYCLE_RECORD_ID_MISMATCH';
  }
  if (authority.lifecycleRecordRevision !== context.lifecycleRecordRevision) {
    return 'LIFECYCLE_RECORD_REVISION_MISMATCH';
  }
  if (authority.lifecycleRecordHash !== context.lifecycleRecordHash) {
    return 'LIFECYCLE_RECORD_HASH_MISMATCH';
  }

  const recordHash = domainHash(fixture.domains.registryRecord, registryRecord);
  if (registryRecord.registrySchemaVersion !== 'coin-card-registry-record.v2') {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  if (authority.coinCardRegistryId !== registryRecord.registryId) {
    return 'COIN_CARD_REGISTRY_ID_MISMATCH';
  }
  if (authority.coinCardRegistrySchemaVersion !== registryRecord.registrySchemaVersion) {
    return 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED';
  }
  if (authority.coinCardRegistryRecordId !== registryRecord.recordId) {
    return 'COIN_CARD_REGISTRY_RECORD_ID_MISMATCH';
  }
  if (authority.coinCardRegistryRecordRevision !== registryRecord.revision) {
    return 'COIN_CARD_REGISTRY_REVISION_MISMATCH';
  }
  if (authority.coinCardRegistryRecordHash !== recordHash) {
    return 'COIN_CARD_REGISTRY_RECORD_HASH_MISMATCH';
  }
  if (authority.environment !== registryRecord.environment) return 'ENVIRONMENT_MISMATCH';
  if (authority.cardId !== registryRecord.cardId) return 'CARD_ID_MISMATCH';
  if (authority.recipientAddress !== registryRecord.recipientAddress) return 'RECIPIENT_MISMATCH';
  if (authority.chainId !== registryRecord.chainId) return 'CHAIN_ID_MISMATCH';
  if (authority.tokenContractAddress !== registryRecord.tokenContractAddress) {
    return 'TOKEN_CONTRACT_MISMATCH';
  }
  if (authority.executionContractAddress !== registryRecord.executionContractAddress) {
    return 'EXECUTION_CONTRACT_MISMATCH';
  }
  if (authority.executionContractInterfaceId !== registryRecord.executionContractInterfaceId) {
    return 'EXECUTION_CONTRACT_INTERFACE_MISMATCH';
  }
  if (authority.executionInterfaceDescriptorHash !== registryRecord.executionInterfaceDescriptorHash) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH';
  }
  for (const key of FEE_POLICY_KEYS) {
    if (authority.feePolicy[key] !== registryRecord.feePolicy[key]) return 'FEE_POLICY_MISMATCH';
  }
  return validateInterfaceDescriptor(authority, descriptor);
}

function resolveLegacyAmountPolicy(authority, policy) {
  const mismatch = () => ({
    code: 'CROSS_AUTHORITY_AMOUNT_POLICY_MISMATCH',
    effectiveMinimumAtomic: null,
    effectiveMaximumAtomic: null,
  });
  if (!isPlainObject(policy) || typeof policy.type !== 'string') {
    return mismatch();
  }

  const minimum = BigInt(authority.feePolicy.minimumTransferAtomic);
  const maximum = BigInt(authority.feePolicy.maximumTransferAtomic);
  const precision = BigInt(authority.feePolicy.transferPrecisionAtomic);
  const resolved = (effectiveMinimum, effectiveMaximum) => ({
    code: null,
    effectiveMinimumAtomic: effectiveMinimum.toString(),
    effectiveMaximumAtomic: effectiveMaximum.toString(),
  });

  if (policy.type === 'OPEN_AMOUNT') {
    return hasExactKeys(policy, ['type']) ? resolved(minimum, maximum) : mismatch();
  }

  if (policy.type === 'FIXED_AMOUNT') {
    if (!hasExactKeys(policy, ['type', 'amountBaseUnits']) || !isAtomicInteger(policy.amountBaseUnits)) {
      return mismatch();
    }
    const amount = BigInt(policy.amountBaseUnits);
    if (amount < minimum || amount > maximum || amount % precision !== 0n) {
      return mismatch();
    }
    return resolved(amount, amount);
  }

  if (policy.type === 'MINIMUM_AMOUNT') {
    if (
      !hasExactKeys(policy, ['type', 'minAmountBaseUnits'])
      || !isAtomicInteger(policy.minAmountBaseUnits)
    ) {
      return mismatch();
    }
    const legacyMinimum = BigInt(policy.minAmountBaseUnits);
    if (legacyMinimum < minimum || legacyMinimum > maximum || legacyMinimum % precision !== 0n) {
      return mismatch();
    }
    return resolved(legacyMinimum, maximum);
  }

  if (policy.type === 'BOUNDED_AMOUNT') {
    if (
      !hasExactKeys(policy, ['type', 'minAmountBaseUnits', 'maxAmountBaseUnits'])
      || !isAtomicInteger(policy.minAmountBaseUnits)
      || !isAtomicInteger(policy.maxAmountBaseUnits)
    ) {
      return mismatch();
    }
    const legacyMinimum = BigInt(policy.minAmountBaseUnits);
    const legacyMaximum = BigInt(policy.maxAmountBaseUnits);
    if (
      legacyMinimum < minimum
      || legacyMaximum > maximum
      || legacyMinimum > legacyMaximum
      || legacyMinimum % precision !== 0n
      || legacyMaximum % precision !== 0n
    ) {
      return mismatch();
    }
    return resolved(legacyMinimum, legacyMaximum);
  }

  return mismatch();
}

function validateLegacyAmountPolicy(authority, policy, intent = null) {
  const resolution = resolveLegacyAmountPolicy(authority, policy);
  if (resolution.code) return resolution.code;
  if (!intent) return null;
  if (!isAtomicInteger(intent.amountSentAtomic)) return 'AMOUNT_POLICY_VIOLATION';

  const amount = BigInt(intent.amountSentAtomic);
  const precision = BigInt(authority.feePolicy.transferPrecisionAtomic);
  if (
    amount < BigInt(resolution.effectiveMinimumAtomic)
    || amount > BigInt(resolution.effectiveMaximumAtomic)
    || amount % precision !== 0n
  ) {
    return 'AMOUNT_POLICY_VIOLATION';
  }
  return null;
}

function validateLegacyCompatibility(authority, projection, intent = null) {
  if (!authority) return 'TRANSACTION_EVIDENCE_REQUIRED';
  if (hasExactKeys(projection, PAYMENT_FREE_RUNTIME_KEYS)) {
    return (
      projection.sourceSchemaVersion === 'coin-card-runtime-package.v2'
      && projection.paymentFieldsPresent === false
    )
      ? null
      : 'CROSS_AUTHORITY_LEGACY_SCHEMA_UNSUPPORTED';
  }
  if (!hasExactKeys(projection, LEGACY_COMPATIBILITY_KEYS)) {
    return 'CROSS_AUTHORITY_LEGACY_SCHEMA_UNSUPPORTED';
  }
  if (projection.sourceSchemaVersion !== 'coin-card-signed-manifest-envelope.v1') {
    return 'CROSS_AUTHORITY_LEGACY_SCHEMA_UNSUPPORTED';
  }
  if (projection.manifestId !== authority.runtimeManifestId) {
    return 'CROSS_AUTHORITY_RUNTIME_MANIFEST_MISMATCH';
  }
  if (projection.cardId !== authority.cardId) return 'CROSS_AUTHORITY_CARD_ID_MISMATCH';
  if (projection.issuerId !== authority.issuerId) return 'CROSS_AUTHORITY_ISSUER_MISMATCH';
  if (projection.environment !== authority.environment) {
    return 'CROSS_AUTHORITY_ENVIRONMENT_MISMATCH';
  }
  if (projection.recipientAddress !== authority.recipientAddress) {
    return 'CROSS_AUTHORITY_RECIPIENT_MISMATCH';
  }
  if (projection.chainNamespace !== 'eip155' || projection.chainId !== authority.chainId) {
    return 'CROSS_AUTHORITY_CHAIN_MISMATCH';
  }
  if (
    projection.tokenStandard !== 'ERC20'
    || projection.tokenContractAddress !== authority.tokenContractAddress
  ) {
    return 'CROSS_AUTHORITY_TOKEN_MISMATCH';
  }
  return validateLegacyAmountPolicy(authority, projection.amountPolicy, intent);
}

function validateIntentShape(intent) {
  if (!hasExactKeys(intent, INTENT_KEYS)) return 'EVIDENCE_CANONICALIZATION_INVALID';
  if (intent.intentSchemaVersion !== 'frozen-user-intent.v1') return 'EVIDENCE_SCHEMA_UNSUPPORTED';
  if (!isIdentifier(intent.cardId) || !isIdentifier(intent.executionContractInterfaceId)) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (
    firstInvalidAddress(intent, [
      'senderAddress',
      'recipientAddress',
      'tokenContractAddress',
      'executionContractAddress',
    ])
  ) {
    return 'ADDRESS_ENCODING_INVALID';
  }
  if (firstInvalidInteger(intent, ['chainId', 'amountSentAtomic', 'feeAmountAtomic', 'totalDebitedAtomic'])) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (
    !SHA256_PATTERN.test(intent.authorityHash)
    || !SHA256_PATTERN.test(intent.runtimeManifestId)
    || !SHA256_PATTERN.test(intent.executionInterfaceDescriptorHash)
  ) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  return null;
}

function validateObservationShape(observation) {
  if (!hasExactKeys(observation, OBSERVATION_KEYS)) return 'EVIDENCE_CANONICALIZATION_INVALID';
  if (observation.observationSchemaVersion !== 'observed-execution-environment.v1') {
    return 'EVIDENCE_SCHEMA_UNSUPPORTED';
  }
  if (typeof observation.contractPaused !== 'boolean') return 'EVIDENCE_CANONICALIZATION_INVALID';
  if (!isIdentifier(observation.executionContractInterfaceId)) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (
    firstInvalidAddress(observation, [
      'connectedAccount',
      'tokenContractAddress',
      'executionContractAddress',
    ])
  ) {
    return 'ADDRESS_ENCODING_INVALID';
  }
  if (
    firstInvalidInteger(
      observation,
      ['observationBlockNumber', 'chainId', 'senderBalanceAtomic', 'senderAllowanceAtomic'],
    )
  ) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (
    !SHA256_PATTERN.test(observation.authorityHash)
    || !SHA256_PATTERN.test(observation.intentHash)
    || !SHA256_PATTERN.test(observation.executionInterfaceDescriptorHash)
  ) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (!BYTES32_PATTERN.test(observation.observationBlockHash)) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  if (!BYTES32_PATTERN.test(observation.executionContractCodeHash)) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  return validateFeePolicyShape(observation.feePolicy, true);
}

function validateInterfaceDescriptor(authority, descriptor) {
  if (descriptor === null || descriptor === undefined) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE';
  }
  if (
    !isPlainObject(descriptor)
    || descriptor.descriptorDomain !== 'ImplicitEx.CoinCard.ExecutionInterfaceDescriptor'
    || descriptor.descriptorSchemaVersion !== 'execution-interface-descriptor.v1'
  ) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID';
  }
  const descriptorHash = domainHash(descriptorFixture.domains.descriptor, descriptor);
  if (descriptorHash !== authority.executionInterfaceDescriptorHash) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH';
  }
  if (
    descriptor.interfaceId !== authority.executionContractInterfaceId
    || descriptor.executionModel !== 'DIRECT_NON_PROXY_NON_DELEGATING'
    || !BYTES32_PATTERN.test(descriptor.deployedRuntimeCodeHash)
  ) {
    return 'EXECUTION_CONTRACT_INTERFACE_MISMATCH';
  }
  if (
    !isPlainObject(descriptor.transferFunction)
    || descriptor.transferFunction.canonicalSignature
      !== 'transferWithEvidence(address,uint256,bytes32)'
    || !Array.isArray(descriptor.transferFunction.inputs)
    || descriptor.transferFunction.inputs.length !== 3
    || descriptor.transferFunction.inputs[2].name !== 'expectedPolicyCommitment'
  ) {
    return 'EXECUTION_POLICY_GUARD_UNAVAILABLE';
  }
  return null;
}

function calculateFee(amountAtomic, policy) {
  const percentage = (BigInt(amountAtomic) * BigInt(policy.feeBasisPoints)) / 10000n;
  if (policy.feeCapAtomic === null) return percentage;
  const cap = BigInt(policy.feeCapAtomic);
  return percentage > cap ? cap : percentage;
}

function validateIntent(
  authority,
  intent,
  observation,
  interfaceDescriptor = descriptorFixture.positive.descriptor,
) {
  const intentShapeError = validateIntentShape(intent);
  if (intentShapeError) return intentShapeError;
  const observationShapeError = validateObservationShape(observation);
  if (observationShapeError) return observationShapeError;

  const authorityHash = domainHash(fixture.domains.authority, authority);
  const intentHash = domainHash(fixture.domains.frozenIntent, intent);
  if (intent.authorityHash !== authorityHash || observation.authorityHash !== authorityHash) {
    return 'EVIDENCE_HASH_MISMATCH';
  }
  if (observation.intentHash !== intentHash) return 'EVIDENCE_HASH_MISMATCH';
  const interfaceError = validateInterfaceDescriptor(authority, interfaceDescriptor);
  if (interfaceError) return interfaceError;
  if (observation.executionContractCodeHash !== interfaceDescriptor.deployedRuntimeCodeHash) {
    return 'EXECUTION_CONTRACT_CODE_HASH_MISMATCH';
  }
  if (intent.cardId !== authority.cardId) return 'CARD_ID_MISMATCH';
  if (intent.runtimeManifestId !== authority.runtimeManifestId) return 'RUNTIME_MANIFEST_MISMATCH';
  if (intent.recipientAddress !== authority.recipientAddress) return 'RECIPIENT_MISMATCH';
  if (intent.chainId !== authority.chainId || observation.chainId !== authority.chainId) {
    return 'CHAIN_ID_MISMATCH';
  }
  if (
    intent.tokenContractAddress !== authority.tokenContractAddress
    || observation.tokenContractAddress !== authority.tokenContractAddress
  ) {
    return 'TOKEN_CONTRACT_MISMATCH';
  }
  if (
    intent.executionContractAddress !== authority.executionContractAddress
    || observation.executionContractAddress !== authority.executionContractAddress
  ) {
    return 'EXECUTION_CONTRACT_MISMATCH';
  }
  if (
    intent.executionContractInterfaceId !== authority.executionContractInterfaceId
    || observation.executionContractInterfaceId !== authority.executionContractInterfaceId
  ) {
    return 'EXECUTION_CONTRACT_INTERFACE_MISMATCH';
  }
  if (
    intent.executionInterfaceDescriptorHash !== authority.executionInterfaceDescriptorHash
    || observation.executionInterfaceDescriptorHash !== authority.executionInterfaceDescriptorHash
  ) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH';
  }
  if (intent.senderAddress !== observation.connectedAccount) return 'SENDER_ACCOUNT_MISMATCH';
  if (observation.contractPaused) return 'CONTRACT_PAUSED';

  for (const key of OBSERVED_FEE_POLICY_KEYS.filter(
    (candidate) => candidate !== 'feeCapEnabled' && candidate !== 'feeCapAtomic',
  )) {
    if (authority.feePolicy[key] !== observation.feePolicy[key]) return 'FEE_POLICY_MISMATCH';
  }
  const expectedCapEnabled = authority.feePolicy.feeCapAtomic !== null;
  const expectedCapAtomic = authority.feePolicy.feeCapAtomic ?? '0';
  if (
    observation.feePolicy.feeCapEnabled !== expectedCapEnabled
    || observation.feePolicy.feeCapAtomic !== expectedCapAtomic
  ) {
    return 'FEE_POLICY_MISMATCH';
  }

  const amount = BigInt(intent.amountSentAtomic);
  const minimum = BigInt(authority.feePolicy.minimumTransferAtomic);
  const maximum = BigInt(authority.feePolicy.maximumTransferAtomic);
  const precision = BigInt(authority.feePolicy.transferPrecisionAtomic);
  if (amount < minimum || amount > maximum || amount % precision !== 0n) {
    return 'AMOUNT_POLICY_VIOLATION';
  }

  const expectedFee = calculateFee(intent.amountSentAtomic, authority.feePolicy);
  if (BigInt(intent.feeAmountAtomic) !== expectedFee) return 'FEE_CALCULATION_MISMATCH';
  if (BigInt(intent.totalDebitedAtomic) !== amount + expectedFee) return 'TOTAL_DEBIT_MISMATCH';
  if (BigInt(observation.senderBalanceAtomic) < BigInt(intent.totalDebitedAtomic)) {
    return 'INSUFFICIENT_BALANCE';
  }
  if (BigInt(observation.senderAllowanceAtomic) < BigInt(intent.totalDebitedAtomic)) {
    return 'INSUFFICIENT_ALLOWANCE';
  }
  return null;
}

function validateSettlementShape(settlement) {
  if (!hasExactKeys(settlement, SETTLEMENT_KEYS)) return 'EVIDENCE_CANONICALIZATION_INVALID';
  if (settlement.settlementSchemaVersion !== 'observed-settlement.v1') {
    return 'EVIDENCE_SCHEMA_UNSUPPORTED';
  }
  if (
    firstInvalidAddress(settlement, [
      'eventContractAddress',
      'senderAddress',
      'recipientAddress',
      'tokenContractAddress',
    ])
  ) {
    return 'ADDRESS_ENCODING_INVALID';
  }
  if (
    firstInvalidInteger(settlement, [
      'blockNumber',
      'logIndex',
      'amountSentAtomic',
      'feeAmountAtomic',
      'totalDebitedAtomic',
    ])
  ) {
    return 'INTEGER_ENCODING_INVALID';
  }
  if (
    !SHA256_PATTERN.test(settlement.authorityHash)
    || !SHA256_PATTERN.test(settlement.intentHash)
    || !BYTES32_PATTERN.test(settlement.transactionHash)
    || !BYTES32_PATTERN.test(settlement.blockHash)
    || !BYTES32_PATTERN.test(settlement.policyCommitment)
  ) {
    return 'EVIDENCE_CANONICALIZATION_INVALID';
  }
  return null;
}

function validateSettlement(authority, intent, settlement) {
  const shapeError = validateSettlementShape(settlement);
  if (shapeError) return shapeError;
  const authorityHash = domainHash(fixture.domains.authority, authority);
  const intentHash = domainHash(fixture.domains.frozenIntent, intent);
  if (settlement.authorityHash !== authorityHash || settlement.intentHash !== intentHash) {
    return 'EVIDENCE_HASH_MISMATCH';
  }
  if (settlement.eventContractAddress !== intent.executionContractAddress) {
    return 'EXECUTION_CONTRACT_MISMATCH';
  }
  if (settlement.senderAddress !== intent.senderAddress) return 'SENDER_ACCOUNT_MISMATCH';
  if (settlement.recipientAddress !== intent.recipientAddress) return 'RECIPIENT_MISMATCH';
  if (settlement.tokenContractAddress !== intent.tokenContractAddress) {
    return 'TOKEN_CONTRACT_MISMATCH';
  }
  if (settlement.amountSentAtomic !== intent.amountSentAtomic) return 'EXECUTION_EVENT_MISMATCH';
  if (settlement.feeAmountAtomic !== intent.feeAmountAtomic) return 'FEE_CALCULATION_MISMATCH';
  if (settlement.totalDebitedAtomic !== intent.totalDebitedAtomic) return 'TOTAL_DEBIT_MISMATCH';
  if (settlement.policyCommitment !== descriptorFixture.positive.expectedPolicyCommitment) {
    return 'EXECUTION_POLICY_COMMITMENT_MISMATCH';
  }
  return null;
}

function setPath(object, pathExpression, replacement) {
  const pathParts = pathExpression.split('.');
  let target = object;
  for (const part of pathParts.slice(0, -1)) target = target[part];
  target[pathParts.at(-1)] = replacement;
}

function getPath(object, pathExpression) {
  return pathExpression.split('.').reduce((value, part) => value[part], object);
}

function resolvedPositive() {
  return {
    authority: clone(fixture.positive.authority),
    registryRecord: clone(fixture.positive.registryRecord),
    intent: clone(fixture.positive.frozenIntent),
    observation: clone(fixture.positive.observedExecution),
    settlement: clone(fixture.positive.settlement),
  };
}

test('positive evidence vectors pin canonical JSON and domain-separated SHA-256 hashes', () => {
  const { authority, registryRecord, intent } = resolvedPositive();

  assert.equal(canonicalizeJson(registryRecord), fixture.positive.expectedRegistryCanonicalJson);
  assert.equal(
    domainHash(fixture.domains.registryRecord, registryRecord),
    fixture.positive.expectedRegistryRecordHash,
  );
  assert.equal(canonicalizeJson(authority), fixture.positive.expectedAuthorityCanonicalJson);
  assert.equal(domainHash(fixture.domains.authority, authority), fixture.positive.expectedAuthorityHash);
  assert.equal(canonicalizeJson(intent), fixture.positive.expectedIntentCanonicalJson);
  assert.equal(domainHash(fixture.domains.frozenIntent, intent), fixture.positive.expectedIntentHash);
  assert.equal(validateAuthority(authority, registryRecord), null);
});

test('contract prose and fixture pin the same domains, algorithm, and rejection codes', () => {
  for (const domain of Object.values(fixture.domains)) {
    assert.match(contractSource, new RegExp(domain.replaceAll('.', '\\.')));
  }
  assert.match(contractSource, /coin-card-canonical-json\.v1/);
  assert.match(contractSource, /ECDSA P-256 with SHA-256/);
  assert.match(contractSource, /IEEE P1363/);

  const vectorGroups = [
    fixture.authorityMutations,
    fixture.registryMutations,
    fixture.invalidEncodings,
    fixture.intentMutations,
    fixture.observationMutations,
    fixture.settlementMutations,
    [fixture.staleFeePolicy],
    fixture.observedFeeCapMutations,
    [fixture.unsupportedPolicyGuard],
    fixture.legacyCompatibility.conflicts,
    [fixture.legacyCompatibility.missingTransactionEvidence],
    fixture.legacyCompatibility.incompatibleAmountPolicies,
    fixture.legacyCompatibility.frozenIntentAmountViolations,
    fixture.phase1DConformance.authorizationVectors,
    fixture.phase1DConformance.matrix,
  ];
  const expectedCodes = new Set(vectorGroups.flat().map((vector) => vector.expectedCode));
  expectedCodes.add('PROVIDER_CONTINUITY_MISMATCH');
  for (const code of expectedCodes) {
    assert.equal(contractSource.includes('`' + code + '`'), true, code);
  }
});

test('positive signature vector pins P-256 SHA-256 P1363 verification', () => {
  const vector = fixture.positive.signatureVector;
  const publicKey = createPublicKey({ key: vector.publicKeyJwk, format: 'jwk' });
  const signature = Buffer.from(vector.signature, 'base64url');

  assert.equal(vector.signatureAlgorithm, 'ECDSA_P256_SHA256_P1363');
  assert.equal(signature.length, 64, 'P1363 P-256 signature must be fixed-width r || s');
  assert.equal(
    verify(
      'sha256',
      domainSeparatedBytes(fixture.domains.authority, fixture.positive.authority),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signature,
    ),
    true,
  );

  const tamperedSignature = Buffer.from(signature);
  tamperedSignature[tamperedSignature.length - 1] ^= 0x01;
  assert.equal(
    verify(
      'sha256',
      domainSeparatedBytes(fixture.domains.authority, fixture.positive.authority),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      tamperedSignature,
    ),
    false,
  );

  const tamperedAuthority = clone(fixture.positive.authority);
  tamperedAuthority.cardId = 'cc_merchant_000';
  assert.equal(
    verify(
      'sha256',
      domainSeparatedBytes(fixture.domains.authority, tamperedAuthority),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      signature,
    ),
    false,
  );
});

test('property insertion order does not change canonical authority bytes or hash', () => {
  const canonicalAuthority = fixture.positive.authority;
  const reorderedAuthority = fixture.positive.authorityPropertyOrderVariant;

  assert.notDeepEqual(Object.keys(canonicalAuthority), Object.keys(reorderedAuthority));
  assert.equal(canonicalizeJson(reorderedAuthority), canonicalizeJson(canonicalAuthority));
  assert.equal(
    domainHash(fixture.domains.authority, reorderedAuthority),
    fixture.positive.expectedAuthorityHash,
  );
});

test('matching legacy payment fields are veto-only compatibility constraints', () => {
  const authority = clone(fixture.positive.authority);
  const intent = clone(fixture.positive.frozenIntent);
  const projection = clone(fixture.legacyCompatibility.matchingProjection);

  assert.equal(validateLegacyCompatibility(authority, projection, intent), null);
  assert.equal(
    validateLegacyCompatibility(null, projection, intent),
    fixture.legacyCompatibility.missingTransactionEvidence.expectedCode,
    'legacy authority cannot substitute for Transaction Evidence',
  );
});

test('a compatible payment-free runtime manifest adds no legacy payment authority', () => {
  const authority = clone(fixture.positive.authority);
  const runtimeManifest = clone(fixture.legacyCompatibility.paymentFreeRuntimeManifest);

  assert.equal(runtimeManifest.sourceSchemaVersion, 'coin-card-runtime-package.v2');
  assert.equal(runtimeManifest.paymentFieldsPresent, false);
  assert.equal(validateLegacyCompatibility(authority, runtimeManifest), null);
  assert.equal(
    validateLegacyCompatibility(authority, null),
    'CROSS_AUTHORITY_LEGACY_SCHEMA_UNSUPPORTED',
    'missing legacy fields cannot be silently treated as a payment-free manifest',
  );
});

test('every legacy cross-authority conflict fails instead of choosing precedence', () => {
  const authority = clone(fixture.positive.authority);
  const positiveProjection = fixture.legacyCompatibility.matchingProjection;

  for (const vector of fixture.legacyCompatibility.conflicts) {
    const projection = clone(positiveProjection);
    setPath(projection, vector.path, vector.replacement);
    assert.equal(
      validateLegacyCompatibility(authority, projection),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('legacy amount policies resolve to explicit subsets of Transaction Evidence authority', () => {
  const authority = clone(fixture.positive.authority);
  const positiveProjection = fixture.legacyCompatibility.matchingProjection;
  const intent = clone(fixture.positive.frozenIntent);

  for (const vector of fixture.legacyCompatibility.compatibleAmountPolicies) {
    const projection = clone(positiveProjection);
    projection.amountPolicy = clone(vector.policy);
    assert.equal(validateLegacyCompatibility(authority, projection, intent), null, vector.id);
    assert.deepEqual(
      resolveLegacyAmountPolicy(authority, vector.policy),
      {
        code: null,
        effectiveMinimumAtomic: vector.expectedEffectiveMinimumAtomic,
        effectiveMaximumAtomic: vector.expectedEffectiveMaximumAtomic,
      },
      vector.id,
    );
  }
});

test('legacy amount policies reject enlargement, invalid precision, and empty ranges', () => {
  const authority = clone(fixture.positive.authority);
  const positiveProjection = fixture.legacyCompatibility.matchingProjection;

  for (const vector of fixture.legacyCompatibility.incompatibleAmountPolicies) {
    const projection = clone(positiveProjection);
    projection.amountPolicy = clone(vector.policy);
    assert.equal(
      validateLegacyCompatibility(authority, projection),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('frozen intent must belong to the effective legacy-authority intersection', () => {
  const authority = clone(fixture.positive.authority);
  const positiveProjection = fixture.legacyCompatibility.matchingProjection;

  for (const vector of fixture.legacyCompatibility.frozenIntentAmountViolations) {
    const projection = clone(positiveProjection);
    const intent = clone(fixture.positive.frozenIntent);
    projection.amountPolicy = clone(vector.policy);
    intent.amountSentAtomic = vector.amountSentAtomic;
    assert.equal(
      validateLegacyCompatibility(authority, projection, intent),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('every critical authority-field mutation is rejected deterministically', () => {
  const { authority: positiveAuthority, registryRecord } = resolvedPositive();

  const expectedMutationPaths = AUTHORITY_KEYS
    .filter((key) => key !== 'feePolicy')
    .concat(FEE_POLICY_KEYS.map((key) => `feePolicy.${key}`))
    .sort(compareCodePoints);
  assert.deepEqual(
    fixture.authorityMutations.map((vector) => vector.path).sort(compareCodePoints),
    expectedMutationPaths,
    'every critical authority leaf must have exactly one mutation vector',
  );

  for (const vector of fixture.authorityMutations) {
    const authority = clone(positiveAuthority);
    setPath(authority, vector.path, vector.replacement);
    assert.equal(
      validateAuthority(authority, registryRecord),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('registry hash and extracted execution fields are independent mandatory checks', () => {
  const { authority: positiveAuthority, registryRecord: positiveRecord } = resolvedPositive();

  for (const vector of fixture.registryMutations) {
    const authority = clone(positiveAuthority);
    const registryRecord = clone(positiveRecord);
    setPath(registryRecord, vector.path, vector.replacement);
    if (vector.refreshAuthorityRegistryHash) {
      authority.coinCardRegistryRecordHash = domainHash(fixture.domains.registryRecord, registryRecord);
    }
    assert.equal(
      validateAuthority(authority, registryRecord),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('invalid address and integer encodings are rejected before semantic comparison', () => {
  const { authority: positiveAuthority, registryRecord } = resolvedPositive();

  for (const vector of fixture.invalidEncodings) {
    const authority = clone(positiveAuthority);
    setPath(authority, vector.path, vector.replacement);
    assert.equal(
      validateAuthority(authority, registryRecord),
      vector.expectedCode,
      vector.id,
    );
  }

  const nativeNumber = clone(positiveAuthority);
  nativeNumber.chainId = 137;
  assert.equal(validateAuthority(nativeNumber, registryRecord), 'INTEGER_ENCODING_INVALID');

  const extraField = clone(positiveAuthority);
  extraField.chainName = 'Polygon';
  assert.equal(validateAuthority(extraField, registryRecord), 'EVIDENCE_CANONICALIZATION_INVALID');
});

test('unsupported evidence versions fail closed rather than using v1 interpretation', () => {
  const { authority, registryRecord } = resolvedPositive();
  authority.evidenceSchemaVersion = 'transaction-evidence.v2';
  assert.equal(validateAuthority(authority, registryRecord), 'EVIDENCE_SCHEMA_UNSUPPORTED');
});

test('strict policy reconciliation rejects a stale signed fee snapshot', () => {
  const { authority, intent, observation } = resolvedPositive();
  const vector = fixture.staleFeePolicy;
  assert.equal(authority.feePolicy[vector.path], vector.signedValue);
  observation.feePolicy[vector.path] = vector.observedValue;

  assert.equal(validateIntent(authority, intent, observation), vector.expectedCode);
});

test('observed fee-cap enablement has one canonical live representation', () => {
  const positive = resolvedPositive();
  for (const vector of fixture.observedFeeCapMutations) {
    const observation = clone(positive.observation);
    observation.feePolicy.feeCapEnabled = vector.feeCapEnabled;
    observation.feePolicy.feeCapAtomic = vector.feeCapAtomic;
    assert.equal(
      validateIntent(positive.authority, positive.intent, observation),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('client-only policy preflight is not an atomic execution-time guard', () => {
  const { authority, intent, observation } = resolvedPositive();
  const descriptor = clone(descriptorFixture.positive.descriptor);
  descriptor.transferFunction.canonicalSignature = fixture.unsupportedPolicyGuard.replacement;
  const descriptorHash = domainHash(descriptorFixture.domains.descriptor, descriptor);
  authority.executionInterfaceDescriptorHash = descriptorHash;
  intent.executionInterfaceDescriptorHash = descriptorHash;
  observation.executionInterfaceDescriptorHash = descriptorHash;
  intent.authorityHash = domainHash(fixture.domains.authority, authority);
  observation.authorityHash = intent.authorityHash;
  observation.intentHash = domainHash(fixture.domains.frozenIntent, intent);

  assert.equal(
    validateIntent(authority, intent, observation, descriptor),
    fixture.unsupportedPolicyGuard.expectedCode,
  );
});

test('positive frozen intent is permitted only after exact observed reconciliation', () => {
  const { authority, intent, observation } = resolvedPositive();
  assert.equal(validateIntent(authority, intent, observation), null);
});

test('route, sender, amount, fee, and total mutations invalidate frozen intent', () => {
  const positive = resolvedPositive();

  for (const vector of fixture.intentMutations) {
    const intent = clone(positive.intent);
    const observation = clone(positive.observation);
    setPath(intent, vector.path, vector.replacement);
    observation.intentHash = domainHash(fixture.domains.frozenIntent, intent);
    assert.equal(
      validateIntent(positive.authority, intent, observation),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('descriptor and deployed-code observation mutations fail before authorization', () => {
  const positive = resolvedPositive();
  for (const vector of fixture.observationMutations) {
    const observation = clone(positive.observation);
    setPath(observation, vector.path, vector.replacement);
    assert.equal(
      validateIntent(positive.authority, positive.intent, observation),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('Phase 1D readiness predicates reject paused, underfunded, and underapproved execution', () => {
  const positive = resolvedPositive();
  for (const vector of fixture.phase1DConformance.authorizationVectors) {
    const observation = clone(positive.observation);
    setPath(observation, vector.path, vector.replacement);
    assert.equal(
      validateIntent(positive.authority, positive.intent, observation),
      vector.expectedCode,
      vector.id,
    );
  }

  const exactBoundary = clone(positive.observation);
  exactBoundary.senderBalanceAtomic = positive.intent.totalDebitedAtomic;
  exactBoundary.senderAllowanceAtomic = positive.intent.totalDebitedAtomic;
  assert.equal(validateIntent(positive.authority, positive.intent, exactBoundary), null);
});

test('descriptor resolution and schema failures precede authenticated hash checks', () => {
  const positive = resolvedPositive();
  assert.equal(
    validateIntent(positive.authority, positive.intent, positive.observation, null),
    'EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE',
  );

  const unsupportedDescriptor = clone(descriptorFixture.positive.descriptor);
  unsupportedDescriptor.descriptorSchemaVersion = 'execution-interface-descriptor.v2';
  assert.equal(
    validateIntent(positive.authority, positive.intent, positive.observation, unsupportedDescriptor),
    'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID',
  );
});

test('Phase 1D rejection order does not let readiness errors mask trust failures', () => {
  const positive = resolvedPositive();
  const observation = clone(positive.observation);
  observation.contractPaused = true;
  observation.feePolicy.feeBasisPoints = '101';
  observation.senderBalanceAtomic = '0';
  observation.senderAllowanceAtomic = '0';

  assert.equal(
    validateIntent(positive.authority, positive.intent, observation, null),
    'EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE',
  );
  assert.equal(
    validateIntent(positive.authority, positive.intent, observation),
    'CONTRACT_PAUSED',
  );

  observation.contractPaused = false;
  assert.equal(validateIntent(positive.authority, positive.intent, observation), 'FEE_POLICY_MISMATCH');
  observation.feePolicy.feeBasisPoints = positive.observation.feePolicy.feeBasisPoints;
  assert.equal(validateIntent(positive.authority, positive.intent, observation), 'INSUFFICIENT_BALANCE');
  observation.senderBalanceAtomic = positive.intent.totalDebitedAtomic;
  assert.equal(validateIntent(positive.authority, positive.intent, observation), 'INSUFFICIENT_ALLOWANCE');
});

test('Phase 1D conformance matrix closes every named predicate with a deterministic vector', () => {
  const expectedIds = [
    'cross-authority-conflict',
    'descriptor-hash-mismatch',
    'descriptor-schema-unsupported',
    'descriptor-unavailable',
    'event-topic-mismatch',
    'insufficient-allowance',
    'insufficient-balance',
    'paused-contract',
    'runtime-code-hash-mismatch',
    'selector-derivation-mismatch',
    'unsupported-executable-registry-schema',
    'unsupported-lifecycle-schema',
  ];
  assert.deepEqual(
    fixture.phase1DConformance.matrix.map((entry) => entry.id).sort(compareCodePoints),
    expectedIds,
  );

  for (const entry of fixture.phase1DConformance.matrix) {
    const sourceRoot = entry.sourceFixture === 'transaction-evidence' ? fixture : descriptorFixture;
    const collection = getPath(sourceRoot, entry.sourceCollection);
    const vector = collection.find((candidate) => candidate.id === entry.sourceVectorId);
    assert.ok(vector, `${entry.id}: source vector exists`);
    assert.equal(vector.expectedCode, entry.expectedCode, entry.id);
  }
});

test('provider continuity is identity-bound and rejects late provider substitution', () => {
  const selectedProvider = Object.freeze({ request() {} });
  const substitutedProvider = Object.freeze({ request() {} });
  const providerResult = (preflight, submit, receipt) => (
    preflight === submit && submit === receipt ? null : 'PROVIDER_CONTINUITY_MISMATCH'
  );

  assert.equal(providerResult(selectedProvider, selectedProvider, selectedProvider), null);
  assert.equal(
    providerResult(selectedProvider, substitutedProvider, substitutedProvider),
    'PROVIDER_CONTINUITY_MISMATCH',
  );
});

test('confirmed settlement must match decoded TransferExecuted facts', () => {
  const positive = resolvedPositive();
  assert.equal(validateSettlement(positive.authority, positive.intent, positive.settlement), null);

  for (const vector of fixture.settlementMutations) {
    const settlement = clone(positive.settlement);
    setPath(settlement, vector.path, vector.replacement);
    assert.equal(
      validateSettlement(positive.authority, positive.intent, settlement),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('canonical schemas reject omitted, null, array, and noncanonical Unicode values', () => {
  const { authority, registryRecord } = resolvedPositive();

  delete authority.cardId;
  assert.equal(validateAuthority(authority, registryRecord), 'EVIDENCE_CANONICALIZATION_INVALID');

  const unexpectedNull = clone(fixture.positive.authority);
  unexpectedNull.chainId = null;
  assert.equal(validateAuthority(unexpectedNull, registryRecord), 'INTEGER_ENCODING_INVALID');

  const arrayValue = clone(fixture.positive.authority);
  arrayValue.feePolicy = [];
  assert.equal(validateAuthority(arrayValue, registryRecord), 'EVIDENCE_CANONICALIZATION_INVALID');

  const decomposedUnicode = clone(fixture.positive.authority);
  decomposedUnicode.cardId = 'Cafe\u0301';
  assert.equal(validateAuthority(decomposedUnicode, registryRecord), 'EVIDENCE_CANONICALIZATION_INVALID');
});
