const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { AbiCoder, Interface, id, keccak256, toUtf8Bytes } = require('ethers');

// Phase 1B specification reference model only. Production runtime must not import this file.
const repoRoot = path.resolve(__dirname, '../../..');
const fixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.execution-interface-descriptor.fixtures.v1.json',
);
const contractPath = path.join(
  repoRoot,
  'docs/product/coin-card/COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md',
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const contractSource = fs.readFileSync(contractPath, 'utf8');

const DESCRIPTOR_KEYS = [
  'descriptorDomain',
  'descriptorSchemaVersion',
  'interfaceId',
  'contractGeneration',
  'abiEncoding',
  'executionModel',
  'deployedRuntimeCodeHashAlgorithm',
  'deployedRuntimeCodeHash',
  'transferFunction',
  'policyCommitment',
  'stateReads',
  'transferEvent',
  'reverts',
];
const TRANSFER_KEYS = [
  'name',
  'canonicalSignature',
  'selector',
  'stateMutability',
  'inputs',
  'outputs',
];
const POLICY_KEYS = ['domainText', 'domainHash', 'hashAlgorithm', 'encoding', 'fields'];
const ABI_INPUT_KEYS = ['name', 'type', 'source'];
const STATE_READ_KEYS = ['name', 'canonicalSignature', 'selector', 'outputs', 'source'];
const EVENT_KEYS = ['name', 'canonicalSignature', 'topic0', 'inputs'];
const EVENT_INPUT_KEYS = ['name', 'type', 'indexed', 'settlementField'];
const REVERT_KEYS = ['name', 'canonicalSignature', 'selector', 'conditionCode'];
const BYTES32_PATTERN = /^0x[0-9a-f]{64}$/;
const SELECTOR_PATTERN = /^0x[0-9a-f]{8}$/;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;
const UINT256_PATTERN = /^(0|[1-9][0-9]*)$/;
const UINT256_MAX = (1n << 256n) - 1n;
const BPS_DENOMINATOR = 10000n;
const abiCoder = AbiCoder.defaultAbiCoder();

const EXPECTED_TRANSFER_INPUTS = [
  { name: 'recipient', type: 'address', source: 'frozenIntent.recipientAddress' },
  { name: 'amountSentAtomic', type: 'uint256', source: 'frozenIntent.amountSentAtomic' },
  { name: 'expectedPolicyCommitment', type: 'bytes32', source: 'reconciledPolicyCommitment' },
];

const EXPECTED_POLICY_FIELDS = [
  { name: 'domainHash', type: 'bytes32', source: 'keccak256(UTF8(policyCommitment.domainText))' },
  { name: 'chainId', type: 'uint256', source: 'authority.chainId' },
  { name: 'executionContractAddress', type: 'address', source: 'authority.executionContractAddress' },
  { name: 'tokenContractAddress', type: 'address', source: 'authority.tokenContractAddress' },
  {
    name: 'policyVersionHash',
    type: 'bytes32',
    source: 'keccak256(UTF8(authority.feePolicy.policyVersion))',
  },
  { name: 'feeBasisPoints', type: 'uint256', source: 'authority.feePolicy.feeBasisPoints' },
  { name: 'feeCapEnabled', type: 'bool', source: 'authority.feePolicy.feeCapAtomic != null' },
  { name: 'feeCapAtomic', type: 'uint256', source: 'authority.feePolicy.feeCapAtomic ?? 0' },
  {
    name: 'minimumTransferAtomic',
    type: 'uint256',
    source: 'authority.feePolicy.minimumTransferAtomic',
  },
  {
    name: 'transferPrecisionAtomic',
    type: 'uint256',
    source: 'authority.feePolicy.transferPrecisionAtomic',
  },
  {
    name: 'roundingRuleHash',
    type: 'bytes32',
    source: 'keccak256(UTF8(authority.feePolicy.roundingRule))',
  },
  {
    name: 'feeRecipientAddress',
    type: 'address',
    source: 'authority.feePolicy.feeRecipientAddress',
  },
];

const EXPECTED_STATE_READS = [
  ['token', 'token()', ['address'], 'observed.tokenContractAddress'],
  ['feeRecipient', 'feeRecipient()', ['address'], 'observed.feePolicy.feeRecipientAddress'],
  ['feeBasisPoints', 'feeBasisPoints()', ['uint256'], 'observed.feePolicy.feeBasisPoints'],
  ['feeCapEnabled', 'feeCapEnabled()', ['bool'], 'observed.feePolicy.feeCapEnabled'],
  ['feeCapAtomic', 'feeCapAtomic()', ['uint256'], 'observed.feePolicy.feeCapAtomic'],
  [
    'minimumTransferAtomic',
    'minimumTransferAtomic()',
    ['uint256'],
    'observed.feePolicy.minimumTransferAtomic',
  ],
  [
    'transferPrecisionAtomic',
    'transferPrecisionAtomic()',
    ['uint256'],
    'observed.feePolicy.transferPrecisionAtomic',
  ],
  ['paused', 'paused()', ['bool'], 'observed.contractPaused'],
  [
    'currentPolicyCommitment',
    'currentPolicyCommitment()',
    ['bytes32'],
    'observed.policyCommitment',
  ],
];

const EXPECTED_EVENT_INPUTS = [
  { name: 'sender', type: 'address', indexed: true, settlementField: 'senderAddress' },
  { name: 'recipient', type: 'address', indexed: true, settlementField: 'recipientAddress' },
  { name: 'token', type: 'address', indexed: true, settlementField: 'tokenContractAddress' },
  { name: 'amountSent', type: 'uint256', indexed: false, settlementField: 'amountSentAtomic' },
  { name: 'feeAmount', type: 'uint256', indexed: false, settlementField: 'feeAmountAtomic' },
  { name: 'totalDebited', type: 'uint256', indexed: false, settlementField: 'totalDebitedAtomic' },
  { name: 'policyCommitment', type: 'bytes32', indexed: false, settlementField: 'policyCommitment' },
];

const EXPECTED_REVERTS = [
  ['PolicyCommitmentMismatch', 'PolicyCommitmentMismatch(bytes32,bytes32)', 'POLICY_COMMITMENT_MISMATCH'],
  ['RecipientZeroAddress', 'RecipientZeroAddress()', 'RECIPIENT_ZERO'],
  ['InvalidRecipient', 'InvalidRecipient(address)', 'RECIPIENT_EXECUTOR_OR_TOKEN'],
  [
    'FeeBasisPointsTooHigh',
    'FeeBasisPointsTooHigh(uint256,uint256)',
    'FEE_BASIS_POINTS_TOO_HIGH',
  ],
  ['AmountBelowMinimum', 'AmountBelowMinimum(uint256,uint256)', 'AMOUNT_BELOW_MINIMUM'],
  [
    'InvalidTransferPrecision',
    'InvalidTransferPrecision(uint256,uint256)',
    'AMOUNT_PRECISION_INVALID',
  ],
  ['TotalDebitOverflow', 'TotalDebitOverflow(uint256,uint256)', 'TOTAL_DEBIT_OVERFLOW'],
  ['EnforcedPause', 'EnforcedPause()', 'CONTRACT_PAUSED'],
  ['ReentrancyGuardReentrantCall', 'ReentrancyGuardReentrantCall()', 'REENTRANT_CALL'],
];

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

function canonicalizeJson(value, seen = new Set()) {
  if (typeof value === 'string') return isCanonicalString(value) ? JSON.stringify(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value === null || typeof value === 'number' || typeof value === 'undefined') return null;
  if (typeof value === 'function' || typeof value === 'symbol') return null;
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
  if (canonical === null) return null;
  return `sha256:${createHash('sha256')
    .update(Buffer.from(domain, 'utf8'))
    .update(Buffer.from([0]))
    .update(Buffer.from(canonical, 'utf8'))
    .digest('hex')}`;
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const expected = [...expectedKeys].sort(compareCodePoints);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function selectorFor(signature) {
  return id(signature).slice(0, 10);
}

function sameJson(left, right) {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function validateDescriptor(descriptor, options = {}) {
  if (descriptor === null || descriptor === undefined) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE';
  }
  const {
    signedHash = domainHash(fixture.domains.descriptor, descriptor),
    signedInterfaceId = 'implicitex-evidence-bound-transfer.v1',
    observedCodeHash = fixture.positive.descriptor.deployedRuntimeCodeHash,
  } = options;
  if (!hasExactKeys(descriptor, DESCRIPTOR_KEYS) || canonicalizeJson(descriptor) === null) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID';
  }
  if (
    descriptor.descriptorDomain !== 'ImplicitEx.CoinCard.ExecutionInterfaceDescriptor'
    || descriptor.descriptorSchemaVersion !== 'execution-interface-descriptor.v1'
    || descriptor.contractGeneration !== 'ImplicitExEvidenceBoundTransferV2'
    || descriptor.abiEncoding !== 'EVM_ABI_V2'
    || descriptor.executionModel !== 'DIRECT_NON_PROXY_NON_DELEGATING'
    || descriptor.deployedRuntimeCodeHashAlgorithm !== 'KECCAK256'
    || !BYTES32_PATTERN.test(descriptor.deployedRuntimeCodeHash)
  ) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID';
  }
  const actualHash = domainHash(fixture.domains.descriptor, descriptor);
  if (!SHA256_PATTERN.test(signedHash) || actualHash !== signedHash) {
    return 'EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH';
  }
  if (descriptor.interfaceId !== signedInterfaceId) return 'EXECUTION_INTERFACE_ID_MISMATCH';
  if (descriptor.deployedRuntimeCodeHash !== observedCodeHash) {
    return 'EXECUTION_CONTRACT_CODE_HASH_MISMATCH';
  }

  const transfer = descriptor.transferFunction;
  if (
    !hasExactKeys(transfer, TRANSFER_KEYS)
    || transfer.name !== 'transferWithEvidence'
    || transfer.canonicalSignature !== 'transferWithEvidence(address,uint256,bytes32)'
    || transfer.stateMutability !== 'nonpayable'
    || !Array.isArray(transfer.outputs)
    || transfer.outputs.length !== 0
  ) {
    return 'EXECUTION_ARGUMENT_LAYOUT_MISMATCH';
  }
  if (!SELECTOR_PATTERN.test(transfer.selector) || transfer.selector !== selectorFor(transfer.canonicalSignature)) {
    return 'EXECUTION_FUNCTION_SELECTOR_MISMATCH';
  }
  if (
    !Array.isArray(transfer.inputs)
    || !transfer.inputs.every((input) => hasExactKeys(input, ABI_INPUT_KEYS))
    || !sameJson(transfer.inputs, EXPECTED_TRANSFER_INPUTS)
  ) {
    return 'EXECUTION_ARGUMENT_LAYOUT_MISMATCH';
  }

  const policy = descriptor.policyCommitment;
  if (
    !hasExactKeys(policy, POLICY_KEYS)
    || policy.domainText !== 'ImplicitExEvidenceBoundTransferV2.PolicyCommitment.v1'
    || policy.hashAlgorithm !== 'KECCAK256'
    || policy.encoding !== 'EVM_ABI_ENCODE'
    || policy.domainHash !== keccak256(toUtf8Bytes(policy.domainText))
  ) {
    return 'EXECUTION_ARGUMENT_LAYOUT_MISMATCH';
  }
  if (
    !Array.isArray(policy.fields)
    || !policy.fields.every((field) => hasExactKeys(field, ABI_INPUT_KEYS))
    || !sameJson(policy.fields, EXPECTED_POLICY_FIELDS)
  ) {
    return 'EXECUTION_ARGUMENT_LAYOUT_MISMATCH';
  }

  if (!Array.isArray(descriptor.stateReads) || descriptor.stateReads.length !== EXPECTED_STATE_READS.length) {
    return 'EXECUTION_ARGUMENT_LAYOUT_MISMATCH';
  }
  for (let index = 0; index < descriptor.stateReads.length; index += 1) {
    const read = descriptor.stateReads[index];
    const [name, signature, outputs, source] = EXPECTED_STATE_READS[index];
    if (
      !hasExactKeys(read, STATE_READ_KEYS)
      || read.name !== name
      || read.canonicalSignature !== signature
      || !sameJson(read.outputs, outputs)
      || read.source !== source
    ) {
      return 'EXECUTION_ARGUMENT_LAYOUT_MISMATCH';
    }
    if (!SELECTOR_PATTERN.test(read.selector) || read.selector !== selectorFor(signature)) {
      return 'EXECUTION_FUNCTION_SELECTOR_MISMATCH';
    }
  }

  const event = descriptor.transferEvent;
  if (
    !hasExactKeys(event, EVENT_KEYS)
    || event.name !== 'TransferExecuted'
    || event.canonicalSignature
      !== 'TransferExecuted(address,address,address,uint256,uint256,uint256,bytes32)'
    || !Array.isArray(event.inputs)
    || !event.inputs.every((input) => hasExactKeys(input, EVENT_INPUT_KEYS))
    || !sameJson(event.inputs, EXPECTED_EVENT_INPUTS)
  ) {
    return 'EXECUTION_EVENT_DECODING_INVALID';
  }
  if (!BYTES32_PATTERN.test(event.topic0) || event.topic0 !== id(event.canonicalSignature)) {
    return 'EXECUTION_EVENT_TOPIC_MISMATCH';
  }

  if (!Array.isArray(descriptor.reverts) || descriptor.reverts.length !== EXPECTED_REVERTS.length) {
    return 'EXECUTION_REVERT_DESCRIPTOR_MISMATCH';
  }
  for (let index = 0; index < descriptor.reverts.length; index += 1) {
    const entry = descriptor.reverts[index];
    const [name, signature, conditionCode] = EXPECTED_REVERTS[index];
    if (
      !hasExactKeys(entry, REVERT_KEYS)
      || entry.name !== name
      || entry.canonicalSignature !== signature
      || entry.conditionCode !== conditionCode
      || !SELECTOR_PATTERN.test(entry.selector)
      || entry.selector !== selectorFor(signature)
    ) {
      return 'EXECUTION_REVERT_DESCRIPTOR_MISMATCH';
    }
  }

  return null;
}

function policyCommitment(descriptor, values) {
  if (values.feeCapEnabled === false && values.feeCapAtomic !== '0') {
    return { code: 'EXECUTION_POLICY_COMMITMENT_MISMATCH', value: null };
  }
  if (
    !UINT256_PATTERN.test(values.chainId)
    || !ADDRESS_PATTERN.test(values.executionContractAddress)
    || !ADDRESS_PATTERN.test(values.tokenContractAddress)
    || !UINT256_PATTERN.test(values.feeBasisPoints)
    || typeof values.feeCapEnabled !== 'boolean'
    || !UINT256_PATTERN.test(values.feeCapAtomic)
    || !UINT256_PATTERN.test(values.minimumTransferAtomic)
    || !UINT256_PATTERN.test(values.transferPrecisionAtomic)
    || !ADDRESS_PATTERN.test(values.feeRecipientAddress)
  ) {
    return { code: 'EXECUTION_POLICY_COMMITMENT_MISMATCH', value: null };
  }

  const types = descriptor.policyCommitment.fields.map((field) => field.type);
  const encodedValues = [
    descriptor.policyCommitment.domainHash,
    BigInt(values.chainId),
    values.executionContractAddress,
    values.tokenContractAddress,
    keccak256(toUtf8Bytes(values.policyVersion)),
    BigInt(values.feeBasisPoints),
    values.feeCapEnabled,
    BigInt(values.feeCapAtomic),
    BigInt(values.minimumTransferAtomic),
    BigInt(values.transferPrecisionAtomic),
    keccak256(toUtf8Bytes(values.roundingRule)),
    values.feeRecipientAddress,
  ];
  return { code: null, value: keccak256(abiCoder.encode(types, encodedValues)) };
}

function calculateFee({
  amountSentAtomic,
  feeBasisPoints,
  feeCapEnabled,
  feeCapAtomic,
}) {
  if (
    !UINT256_PATTERN.test(amountSentAtomic)
    || !UINT256_PATTERN.test(feeBasisPoints)
    || typeof feeCapEnabled !== 'boolean'
    || !UINT256_PATTERN.test(feeCapAtomic)
  ) {
    return { code: 'FEE_POLICY_MISMATCH' };
  }

  const amount = BigInt(amountSentAtomic);
  const basisPoints = BigInt(feeBasisPoints);
  const cap = BigInt(feeCapAtomic);
  if (
    amount > UINT256_MAX
    || basisPoints > BPS_DENOMINATOR
    || cap > UINT256_MAX
    || (!feeCapEnabled && cap !== 0n)
  ) {
    return { code: 'FEE_POLICY_MISMATCH' };
  }

  // BigInt models the required full-precision intermediate product.
  const rawFee = (amount * basisPoints) / BPS_DENOMINATOR;
  const feeAmount = feeCapEnabled && cap < rawFee ? cap : rawFee;
  if (amount > UINT256_MAX - feeAmount) return { code: 'TOTAL_DEBIT_OVERFLOW' };

  return {
    code: null,
    rawFeeAtomic: rawFee.toString(),
    feeAmountAtomic: feeAmount.toString(),
    totalDebitedAtomic: (amount + feeAmount).toString(),
  };
}

function reconcileSettlementArithmetic(settlement, policy) {
  const calculated = calculateFee({
    amountSentAtomic: settlement.amountSentAtomic,
    feeBasisPoints: policy.feeBasisPoints,
    feeCapEnabled: policy.feeCapEnabled,
    feeCapAtomic: policy.feeCapAtomic,
  });
  if (calculated.code) return calculated.code;
  if (settlement.feeAmountAtomic !== calculated.feeAmountAtomic) {
    return 'FEE_CALCULATION_MISMATCH';
  }
  if (settlement.totalDebitedAtomic !== calculated.totalDebitedAtomic) {
    return 'TOTAL_DEBIT_MISMATCH';
  }
  return null;
}

function setPath(object, pathExpression, replacement) {
  const parts = pathExpression.split('.');
  let target = object;
  for (const part of parts.slice(0, -1)) target = target[part];
  target[parts.at(-1)] = replacement;
}

function mutateDescriptor(vector) {
  const descriptor = clone(fixture.positive.descriptor);
  if (vector.path) setPath(descriptor, vector.path, vector.replacement);
  if (vector.arrayPath) {
    const parts = vector.arrayPath.split('.');
    let target = descriptor;
    for (const part of parts) target = target[part];
    const [left, right] = vector.swap;
    [target[left], target[right]] = [target[right], target[left]];
  }
  return descriptor;
}

function decodeIndexedAddress(topic) {
  if (!/^0x0{24}[0-9a-f]{40}$/.test(topic)) return null;
  return `0x${topic.slice(-40)}`;
}

function decodeTransferLog(descriptor, log, expectedContractAddress) {
  if (log.removed || log.address !== expectedContractAddress) {
    return { code: 'EXECUTION_EVENT_MISMATCH', settlement: null };
  }
  if (!Array.isArray(log.topics) || log.topics.length !== 4) {
    return { code: 'EXECUTION_EVENT_DECODING_INVALID', settlement: null };
  }
  if (log.topics[0] !== descriptor.transferEvent.topic0) {
    return { code: 'EXECUTION_EVENT_TOPIC_MISMATCH', settlement: null };
  }
  const senderAddress = decodeIndexedAddress(log.topics[1]);
  const recipientAddress = decodeIndexedAddress(log.topics[2]);
  const tokenContractAddress = decodeIndexedAddress(log.topics[3]);
  if (!senderAddress || !recipientAddress || !tokenContractAddress) {
    return { code: 'EXECUTION_EVENT_DECODING_INVALID', settlement: null };
  }
  if (!/^0x[0-9a-f]{256}$/.test(log.data)) {
    return { code: 'EXECUTION_EVENT_DECODING_INVALID', settlement: null };
  }
  let decoded;
  try {
    decoded = abiCoder.decode(['uint256', 'uint256', 'uint256', 'bytes32'], log.data);
  } catch {
    return { code: 'EXECUTION_EVENT_DECODING_INVALID', settlement: null };
  }
  return {
    code: null,
    settlement: {
      senderAddress,
      recipientAddress,
      tokenContractAddress,
      amountSentAtomic: decoded[0].toString(),
      feeAmountAtomic: decoded[1].toString(),
      totalDebitedAtomic: decoded[2].toString(),
      policyCommitment: decoded[3],
    },
  };
}

function selectSingleSettlementLog(logs) {
  return Array.isArray(logs) && logs.length === 1
    ? { code: null, log: logs[0] }
    : { code: 'EXECUTION_EVENT_MISMATCH', log: null };
}

function reconcileSettlement(actual, expected) {
  return sameJson(actual, expected) ? null : 'EXECUTION_EVENT_MISMATCH';
}

test('canonical descriptor JSON and domain-separated SHA-256 hash are pinned', () => {
  const descriptor = fixture.positive.descriptor;
  assert.equal(canonicalizeJson(descriptor), fixture.positive.expectedDescriptorCanonicalJson);
  assert.equal(
    domainHash(fixture.domains.descriptor, descriptor),
    fixture.positive.expectedDescriptorHash,
  );
  assert.equal(validateDescriptor(descriptor, { signedHash: fixture.positive.expectedDescriptorHash }), null);
});

test('object property order is irrelevant while declared array order is semantic', () => {
  const descriptor = fixture.positive.descriptor;
  const reordered = Object.fromEntries(Object.entries(descriptor).reverse());
  assert.equal(canonicalizeJson(reordered), fixture.positive.expectedDescriptorCanonicalJson);
  assert.equal(
    domainHash(fixture.domains.descriptor, reordered),
    fixture.positive.expectedDescriptorHash,
  );

  const arrayReordered = clone(descriptor);
  [arrayReordered.policyCommitment.fields[1], arrayReordered.policyCommitment.fields[2]] = [
    arrayReordered.policyCommitment.fields[2],
    arrayReordered.policyCommitment.fields[1],
  ];
  assert.notEqual(canonicalizeJson(arrayReordered), fixture.positive.expectedDescriptorCanonicalJson);
  assert.equal(
    validateDescriptor(arrayReordered),
    'EXECUTION_ARGUMENT_LAYOUT_MISMATCH',
  );
});

test('signed descriptor hash and friendly interface ID are independent mandatory checks', () => {
  const descriptor = fixture.positive.descriptor;
  assert.equal(
    validateDescriptor(descriptor, { signedHash: `sha256:${'0'.repeat(64)}` }),
    'EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH',
  );
  assert.equal(
    validateDescriptor(descriptor, { signedInterfaceId: 'implicitex-evidence-bound-transfer.v0' }),
    'EXECUTION_INTERFACE_ID_MISMATCH',
  );
});

test('descriptor resolution fails closed when exact content is unavailable', () => {
  for (const vector of fixture.resolutionVectors) {
    assert.equal(validateDescriptor(vector.resolvedDescriptor), vector.expectedCode, vector.id);
  }
});

test('descriptor canonicalization rejects unknown fields, native numbers, and non-scalar strings', () => {
  const extraField = clone(fixture.positive.descriptor);
  extraField.chainName = 'Polygon';
  assert.equal(validateDescriptor(extraField), 'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID');

  const nativeNumber = clone(fixture.positive.descriptor);
  nativeNumber.deployedRuntimeCodeHash = 1;
  assert.equal(validateDescriptor(nativeNumber), 'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID');

  const invalidUnicode = clone(fixture.positive.descriptor);
  invalidUnicode.interfaceId = 'invalid\ud800';
  assert.equal(validateDescriptor(invalidUnicode), 'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID');
});

test('all transfer, getter, error, and event identifiers derive from canonical signatures', () => {
  const descriptor = fixture.positive.descriptor;
  assert.equal(descriptor.transferFunction.selector, selectorFor(descriptor.transferFunction.canonicalSignature));
  for (const read of descriptor.stateReads) {
    assert.equal(read.selector, selectorFor(read.canonicalSignature), read.name);
  }
  for (const entry of descriptor.reverts) {
    assert.equal(entry.selector, selectorFor(entry.canonicalSignature), entry.name);
  }
  assert.equal(descriptor.transferEvent.topic0, id(descriptor.transferEvent.canonicalSignature));
});

test('deployed runtime-code identity uses EVM Keccak-256 over exact nonempty bytes', () => {
  const vector = fixture.runtimeCodeHashVector;
  assert.match(vector.runtimeCode, /^0x(?:[0-9a-f]{2})+$/);
  assert.equal(keccak256(vector.runtimeCode), vector.expectedKeccak256);
  assert.notEqual(
    `0x${createHash('sha3-256').update(Buffer.from(vector.runtimeCode.slice(2), 'hex')).digest('hex')}`,
    vector.expectedKeccak256,
    'NIST SHA3-256 must not substitute for EVM Keccak-256',
  );
});

test('descriptor requires direct non-proxy, non-delegating executor identity', () => {
  assert.equal(fixture.positive.descriptor.executionModel, 'DIRECT_NON_PROXY_NON_DELEGATING');
  for (const requiredText of [
    'MUST be a direct, non-proxy, non-delegating executor',
    'MUST NOT use `DELEGATECALL` or `CALLCODE`',
    'new execution-contract address, new deployed runtime-code hash, new descriptor hash, and new Transaction Evidence authority',
  ]) {
    assert.equal(contractSource.includes(requiredText), true, requiredText);
  }
});

test('maximum transfer remains issuer-runtime authority outside the atomic contract guard', () => {
  const descriptor = fixture.positive.descriptor;
  assert.equal(
    descriptor.policyCommitment.fields.some((field) => field.name === 'maximumTransferAtomic'),
    false,
  );
  assert.equal(
    descriptor.transferFunction.inputs.some((input) => input.name === 'maximumTransferAtomic'),
    false,
  );
  for (const requiredText of [
    'does not receive or enforce it',
    "a direct caller that does not use an authenticated Coin Card runtime can exceed a card's signed maximum",
    'atomic commitment guards contract-backed policy only',
  ]) {
    assert.equal(contractSource.includes(requiredText), true, requiredText);
  }
});

test('policy commitment pins exact ABI encoding and cap semantics', () => {
  const descriptor = fixture.positive.descriptor;
  const values = fixture.positive.policyValues;
  assert.equal(descriptor.policyCommitment.domainHash, keccak256(toUtf8Bytes(descriptor.policyCommitment.domainText)));
  assert.equal(values.policyVersionHash, keccak256(toUtf8Bytes(values.policyVersion)));
  assert.equal(values.roundingRuleHash, keccak256(toUtf8Bytes(values.roundingRule)));
  assert.deepEqual(policyCommitment(descriptor, values), {
    code: null,
    value: fixture.positive.expectedPolicyCommitment,
  });

  const invalidUncapped = clone(values);
  invalidUncapped.feeCapEnabled = false;
  assert.equal(policyCommitment(descriptor, invalidUncapped).code, 'EXECUTION_POLICY_COMMITMENT_MISMATCH');
  invalidUncapped.feeCapAtomic = '0';
  assert.equal(policyCommitment(descriptor, invalidUncapped).code, null);
});

test('chain ID and execution-contract address prevent policy-commitment replay', () => {
  const descriptor = fixture.positive.descriptor;
  for (const vector of fixture.replayMutations) {
    const values = clone(fixture.positive.policyValues);
    setPath(values, vector.path, vector.replacement);
    const mutation = policyCommitment(descriptor, values);
    assert.equal(mutation.code, null, vector.id);
    assert.notEqual(mutation.value, fixture.positive.expectedPolicyCommitment, vector.id);
  }
});

test('FLOOR_BPS_THEN_CAP boundary vectors pin full-precision arithmetic and cap order', () => {
  for (const vector of fixture.feeFormulaVectors) {
    assert.deepEqual(
      calculateFee(vector),
      {
        code: null,
        rawFeeAtomic: vector.expectedRawFeeAtomic,
        feeAmountAtomic: vector.expectedFeeAmountAtomic,
        totalDebitedAtomic: vector.expectedTotalDebitedAtomic,
      },
      vector.id,
    );
  }
});

test('invalid fee policy and total-debit overflow reject before movement', () => {
  for (const vector of fixture.invalidFeeFormulaVectors) {
    assert.equal(calculateFee(vector).code, vector.expectedCode, vector.id);
  }
});

test('transfer calldata pins selector, argument types, order, and values', () => {
  const descriptor = fixture.positive.descriptor;
  const transferInterface = new Interface([
    `function ${descriptor.transferFunction.canonicalSignature}`,
  ]);
  const calldata = transferInterface.encodeFunctionData(descriptor.transferFunction.name, [
    fixture.positive.call.recipientAddress,
    BigInt(fixture.positive.call.amountSentAtomic),
    fixture.positive.expectedPolicyCommitment,
  ]);
  assert.equal(calldata, fixture.positive.call.expectedCalldata);
  assert.equal(calldata.slice(0, 10), descriptor.transferFunction.selector);

  const decoded = transferInterface.decodeFunctionData(descriptor.transferFunction.name, calldata);
  assert.equal(decoded[0].toLowerCase(), fixture.positive.call.recipientAddress);
  assert.equal(decoded[1].toString(), fixture.positive.call.amountSentAtomic);
  assert.equal(decoded[2], fixture.positive.expectedPolicyCommitment);
});

test('descriptor mutations fail with deterministic semantic codes', () => {
  for (const vector of fixture.mutations) {
    const descriptor = mutateDescriptor(vector);
    assert.equal(
      validateDescriptor(descriptor, {
        signedHash: domainHash(fixture.domains.descriptor, descriptor),
      }),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('positive event log decodes authoritative settlement fields', () => {
  const decoded = decodeTransferLog(
    fixture.positive.descriptor,
    fixture.positive.eventLog,
    fixture.positive.policyValues.executionContractAddress,
  );
  assert.equal(decoded.code, null);
  assert.deepEqual(decoded.settlement, fixture.positive.expectedSettlement);
  assert.equal(reconcileSettlement(decoded.settlement, fixture.positive.expectedSettlement), null);
  assert.equal(
    reconcileSettlementArithmetic(decoded.settlement, fixture.positive.policyValues),
    null,
  );
});

test('settlement fee and total debit must match independent formula reconstruction', () => {
  for (const vector of fixture.settlementArithmeticMutations) {
    const settlement = clone(fixture.positive.expectedSettlement);
    setPath(settlement, vector.path, vector.replacement);
    assert.equal(
      reconcileSettlementArithmetic(settlement, fixture.positive.policyValues),
      vector.expectedCode,
      vector.id,
    );
  }
});

test('malformed, removed, wrong-emitter, missing, and duplicate event evidence fails closed', () => {
  const descriptor = fixture.positive.descriptor;
  const expectedContract = fixture.positive.policyValues.executionContractAddress;
  for (const vector of fixture.eventMutations) {
    const log = clone(fixture.positive.eventLog);
    setPath(log, vector.path, vector.replacement);
    assert.equal(decodeTransferLog(descriptor, log, expectedContract).code, vector.expectedCode, vector.id);
  }

  assert.equal(selectSingleSettlementLog([]).code, 'EXECUTION_EVENT_MISMATCH');
  const duplicateLogs = [clone(fixture.positive.eventLog), clone(fixture.positive.eventLog)];
  assert.equal(selectSingleSettlementLog(duplicateLogs).code, 'EXECUTION_EVENT_MISMATCH');

  const mismatchedData = clone(fixture.positive.eventLog);
  mismatchedData.data = abiCoder.encode(
    ['uint256', 'uint256', 'uint256', 'bytes32'],
    [50010000n, 500000n, 50500000n, fixture.positive.expectedPolicyCommitment],
  );
  const decoded = decodeTransferLog(descriptor, mismatchedData, expectedContract);
  assert.equal(decoded.code, null);
  assert.equal(
    reconcileSettlement(decoded.settlement, fixture.positive.expectedSettlement),
    'EXECUTION_EVENT_MISMATCH',
  );
});

test('legacy transferWithFee interface is explicitly noncompliant with the atomic guard', () => {
  assert.equal(fixture.legacyInterface.canonicalSignature, 'transferWithFee(address,uint256)');
  assert.equal(fixture.legacyInterface.hasExpectedPolicyCommitment, false);
  assert.equal(fixture.legacyInterface.expectedCode, 'EXECUTION_POLICY_GUARD_UNAVAILABLE');
  assert.equal(
    contractSource.includes('An interface such as `transferWithFee(address,uint256)` is legacy'),
    true,
  );
});

test('specification and fixtures pin every Phase 1B rejection code', () => {
  const expectedCodes = new Set([
    'EXECUTION_INTERFACE_DESCRIPTOR_UNAVAILABLE',
    'EXECUTION_INTERFACE_DESCRIPTOR_SCHEMA_INVALID',
    'EXECUTION_INTERFACE_DESCRIPTOR_HASH_MISMATCH',
    'EXECUTION_INTERFACE_ID_MISMATCH',
    'EXECUTION_CONTRACT_CODE_HASH_MISMATCH',
    'EXECUTION_FUNCTION_SELECTOR_MISMATCH',
    'EXECUTION_ARGUMENT_LAYOUT_MISMATCH',
    'EXECUTION_POLICY_COMMITMENT_MISMATCH',
    'EXECUTION_POLICY_GUARD_UNAVAILABLE',
    'FEE_POLICY_MISMATCH',
    'FEE_CALCULATION_MISMATCH',
    'TOTAL_DEBIT_MISMATCH',
    'EXECUTION_REVERT_DESCRIPTOR_MISMATCH',
    'EXECUTION_EVENT_TOPIC_MISMATCH',
    'EXECUTION_EVENT_DECODING_INVALID',
    'EXECUTION_EVENT_MISMATCH',
  ]);
  for (const code of expectedCodes) {
    assert.equal(contractSource.includes('`' + code + '`'), true, code);
  }
});
