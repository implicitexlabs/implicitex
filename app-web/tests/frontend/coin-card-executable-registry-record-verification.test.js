const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const registryRuntimePath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-lifecycle-registry.js',
);
const canonicalJsonRuntimePath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-canonical-json-v1.js',
);
const verifierRuntimePath = path.join(
  repoRoot,
  'app-web/frontend/public/card/coin-card-executable-registry-record-verification.js',
);
const fixturePath = path.join(
  repoRoot,
  'docs/product/coin-card/coin-card.lifecycle-and-registry-identity.fixtures.v1.json',
);

const registryRuntimeSource = fs.readFileSync(registryRuntimePath, 'utf8');
const canonicalJsonRuntimeSource = fs.readFileSync(canonicalJsonRuntimePath, 'utf8');
const verifierRuntimeSource = fs.readFileSync(verifierRuntimePath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function digestImplementation(options = {}) {
  return {
    digest(algorithm, bytes) {
      assert.equal(algorithm, 'SHA-256');
      if (options.throwDigest) throw new Error('digest threw');
      if (options.rejectDigest) return Promise.reject(new Error('digest unavailable'));
      if (options.shortDigest) return Promise.resolve(new Uint8Array(31).buffer);
      const input = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const digest = createHash('sha256').update(input).digest();
      return Promise.resolve(digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength));
    },
  };
}

function loadRuntime(options = {}) {
  const context = {
    Promise,
    String,
    Uint8Array,
    window: {},
  };
  context.globalThis = context;
  if (!options.textEncoderUnavailable) {
    let RuntimeTextEncoder = TextEncoder;
    if (options.textEncoderThrows === 'constructor') {
      RuntimeTextEncoder = class {
        constructor() {
          throw new Error('encoder constructor threw');
        }
      };
    } else if (options.textEncoderThrows === 'encode') {
      RuntimeTextEncoder = class {
        encode() {
          throw new Error('encoder encode threw');
        }
      };
    } else if (options.textEncoderReturnsObject) {
      RuntimeTextEncoder = class {
        encode() {
          return { bytes: 'not-a-Uint8Array' };
        }
      };
    }
    context.TextEncoder = RuntimeTextEncoder;
    context.window.TextEncoder = RuntimeTextEncoder;
  }
  if (!options.cryptoUnavailable) {
    context.window.crypto = { subtle: digestImplementation(options) };
  }
  if (Object.prototype.hasOwnProperty.call(options, 'canonicalizerResult')) {
    context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY = Object.freeze({
      canonicalizeJson() {
        return options.canonicalizerResult;
      },
    });
  } else if (options.canonicalizerThrows) {
    context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY = Object.freeze({
      canonicalizeJson() {
        throw new Error('canonicalizer threw');
      },
    });
  } else if (!options.canonicalizerUnavailable) {
    vm.runInNewContext(canonicalJsonRuntimeSource, context, { filename: canonicalJsonRuntimePath });
    vm.runInNewContext(registryRuntimeSource, context, { filename: registryRuntimePath });
  }
  vm.runInNewContext(verifierRuntimeSource, context, { filename: verifierRuntimePath });
  return {
    api: context.window.IX_COIN_CARD_EXECUTABLE_REGISTRY_RECORD_VERIFICATION,
    context,
  };
}

function realmValue(context, value) {
  context.__recordJson = JSON.stringify(value);
  return vm.runInNewContext('JSON.parse(__recordJson)', context);
}

function positiveRecord(context) {
  return realmValue(context, fixture.positive.executableRegistryRecord);
}

function clone(value) {
  return structuredClone(value);
}

async function outcomeFor(value, options = {}) {
  const runtime = loadRuntime(options);
  return (await runtime.api.validateAndHashRecord(realmValue(runtime.context, value))).outcome;
}

function assertFailureResult(api, result, expectedOutcome, id) {
  assert.equal(result.outcome, expectedOutcome, id);
  assert.equal(result.contentValidated, false, id);
  assert.equal(result.contentHashEstablished, false, id);
  assert.equal(result.authenticated, false, id);
  assert.equal(result.current, false, id);
  assert.equal(result.executionEligible, false, id);
  assert.equal(result.record, null, id);
  assert.equal(result.canonicalJson, null, id);
  assert.equal(result.recordHash, null, id);
  assert.equal(Object.isFrozen(result), true, id);
  assert.equal(api.isValidatedRecordResult(result), false, id);
}

test('runtime API is frozen and exposes content validation without authentication authority', async () => {
  const { api, context } = loadRuntime();
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.OUTCOMES), true);
  assert.equal(api.RECORD_SCHEMA_VERSION, 'coin-card-registry-record.v2');
  assert.equal(api.RECORD_HASH_DOMAIN, fixture.domains.executableRegistryRecordHash);

  const result = await api.validateAndHashRecord(positiveRecord(context));
  assert.equal(result.outcome, 'EXECUTABLE_REGISTRY_RECORD_VALIDATED');
  assert.equal(result.contentValidated, true);
  assert.equal(result.contentHashEstablished, true);
  assert.equal(result.authenticated, false);
  assert.equal(result.current, false);
  assert.equal(result.executionEligible, false);
  assert.equal(api.isValidatedRecordResult(result), true);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.record), true);
  assert.equal(Object.isFrozen(result.record.feePolicy), true);
});

test('positive Registry V2 fixture pins canonical JSON and domain-separated record hash', async () => {
  const { api, context } = loadRuntime();
  const result = await api.validateAndHashRecord(positiveRecord(context));

  assert.equal(result.canonicalJson, fixture.positive.expectedExecutableRegistryCanonicalJson);
  assert.equal(result.recordHash, fixture.positive.expectedExecutableRegistryRecordHash);
});

test('record property order is irrelevant while array order cannot enter the closed schema', async () => {
  const { api, context } = loadRuntime();
  const reordered = Object.fromEntries(
    Object.entries(fixture.positive.executableRegistryRecord).reverse(),
  );
  reordered.feePolicy = Object.fromEntries(Object.entries(reordered.feePolicy).reverse());

  const result = await api.validateAndHashRecord(realmValue(context, reordered));
  assert.equal(result.outcome, 'EXECUTABLE_REGISTRY_RECORD_VALIDATED');
  assert.equal(result.canonicalJson, fixture.positive.expectedExecutableRegistryCanonicalJson);
  assert.equal(result.recordHash, fixture.positive.expectedExecutableRegistryRecordHash);

  const arrayRecord = clone(fixture.positive.executableRegistryRecord);
  arrayRecord.feePolicy = [arrayRecord.feePolicy];
  assert.equal(
    await outcomeFor(arrayRecord),
    'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
  );
});

test('legacy and unsupported registry records fail with stable sealed-contract outcomes', async () => {
  assert.equal(
    await outcomeFor({ schema: 'implicitex.coincard.v1', cardId: 'cc_legacy' }),
    'LEGACY_REGISTRY_NOT_EXECUTABLE',
  );
  assert.equal(
    await outcomeFor({ registrySchemaVersion: 'coin-card-registry-record.v1', cardId: 'cc_legacy' }),
    'LEGACY_REGISTRY_NOT_EXECUTABLE',
  );
  assert.equal(await outcomeFor(null), 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED');
  assert.equal(
    await outcomeFor({ registrySchemaVersion: 'coin-card-registry-record.v3' }),
    'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
  );
});

test('closed schema rejects unknown, missing, hidden, accessor, and native-number data', async () => {
  const unknown = clone(fixture.positive.executableRegistryRecord);
  unknown.tokenSymbol = 'USDC';
  assert.equal(await outcomeFor(unknown), 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED');

  const missing = clone(fixture.positive.executableRegistryRecord);
  delete missing.executionContractAddress;
  assert.equal(await outcomeFor(missing), 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED');

  const nativeNumber = clone(fixture.positive.executableRegistryRecord);
  nativeNumber.chainId = 137;
  assert.equal(await outcomeFor(nativeNumber), 'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED');

  const { api, context } = loadRuntime();
  context.__positiveJson = JSON.stringify(fixture.positive.executableRegistryRecord);
  const hidden = vm.runInNewContext(`(() => {
    const value = JSON.parse(__positiveJson);
    Object.defineProperty(value, 'hidden', { value: 'x', enumerable: false });
    return value;
  })()`, context);
  assert.equal(
    (await api.validateAndHashRecord(hidden)).outcome,
    'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
  );

  context.__getterRead = false;
  const accessor = vm.runInNewContext(`(() => {
    const value = JSON.parse(__positiveJson);
    Object.defineProperty(value, 'registrySchemaVersion', {
      enumerable: true,
      get() { __getterRead = true; return 'coin-card-registry-record.v2'; },
    });
    return value;
  })()`, context);
  assert.equal(
    (await api.validateAndHashRecord(accessor)).outcome,
    'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
  );
  assert.equal(context.__getterRead, false, 'accessor must be rejected without invocation');
});

test('canonical address, hash, identifier, and uint256 encodings are enforced', async () => {
  const vectors = [
    ['recipientAddress', '0x0000000000000000000000000000000000000000'],
    ['tokenContractAddress', '0x222222222222222222222222222222222222222A'],
    ['executionContractAddress', '0x3333'],
    ['executionInterfaceDescriptorHash', `sha256:${'A'.repeat(64)}`],
    ['revision', '07'],
    ['chainId', '-1'],
    ['chainId', (1n << 256n).toString()],
    ['recordId', ' cc_merchant_001-r7'],
  ];

  for (const [field, replacement] of vectors) {
    const record = clone(fixture.positive.executableRegistryRecord);
    record[field] = replacement;
    assert.equal(
      await outcomeFor(record),
      'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
      field,
    );
  }
});

test('sealed fee-policy bounds and canonical encodings are enforced', async () => {
  const vectors = [
    ['feeBasisPoints', '10001'],
    ['feeCapAtomic', '-1'],
    ['minimumTransferAtomic', '0'],
    ['maximumTransferAtomic', '999999'],
    ['transferPrecisionAtomic', '0'],
    ['roundingRule', 'ROUND_HALF_UP'],
    ['policyVersion', ' implicitex-fee-policy.v2'],
    ['feeRecipientAddress', '0x0000000000000000000000000000000000000000'],
  ];

  for (const [field, replacement] of vectors) {
    const record = clone(fixture.positive.executableRegistryRecord);
    record.feePolicy[field] = replacement;
    assert.equal(
      await outcomeFor(record),
      'COIN_CARD_REGISTRY_SCHEMA_UNSUPPORTED',
      field,
    );
  }

  const uncapped = clone(fixture.positive.executableRegistryRecord);
  uncapped.feePolicy.feeCapAtomic = null;
  assert.equal(await outcomeFor(uncapped), 'EXECUTABLE_REGISTRY_RECORD_VALIDATED');
});

test('non-string canonicalizer results and canonicalizer exceptions cannot produce branded success', async () => {
  const thenable = { then() { throw new Error('thenable must not be assimilated'); } };
  const vectors = [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['plain object', { canonical: 'not text' }],
    ['Promise', Promise.resolve(fixture.positive.expectedExecutableRegistryCanonicalJson)],
    ['thenable', thenable],
  ];

  for (const [id, canonicalizerResult] of vectors) {
    const { api, context } = loadRuntime({ canonicalizerResult });
    const result = await api.validateAndHashRecord(positiveRecord(context));
    assertFailureResult(
      api,
      result,
      'EXECUTABLE_REGISTRY_RECORD_CANONICALIZER_UNAVAILABLE',
      id,
    );
  }

  const throwing = loadRuntime({ canonicalizerThrows: true });
  assertFailureResult(
    throwing.api,
    await throwing.api.validateAndHashRecord(positiveRecord(throwing.context)),
    'EXECUTABLE_REGISTRY_RECORD_CANONICALIZER_UNAVAILABLE',
  );
});

test('missing or throwing encoding and hashing dependencies return complete unbranded failures', async () => {
  const vectors = [
    ['canonicalizer unavailable', { canonicalizerUnavailable: true }, 'EXECUTABLE_REGISTRY_RECORD_CANONICALIZER_UNAVAILABLE'],
    ['crypto unavailable', { cryptoUnavailable: true }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
    ['encoder unavailable', { textEncoderUnavailable: true }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
    ['encoder constructor throws', { textEncoderThrows: 'constructor' }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
    ['encoder encode throws', { textEncoderThrows: 'encode' }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
    ['encoder returns object', { textEncoderReturnsObject: true }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
    ['digest throws', { throwDigest: true }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
    ['digest rejects', { rejectDigest: true }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
    ['digest is short', { shortDigest: true }, 'EXECUTABLE_REGISTRY_RECORD_HASH_UNAVAILABLE'],
  ];

  for (const [id, options, expectedOutcome] of vectors) {
    const { api, context } = loadRuntime(options);
    const result = await api.validateAndHashRecord(positiveRecord(context));
    assertFailureResult(api, result, expectedOutcome, id);
  }
});

test('validation snapshots mutable input before asynchronous hashing', async () => {
  const { api, context } = loadRuntime();
  const record = positiveRecord(context);
  const promise = api.validateAndHashRecord(record);
  record.recipientAddress = '0x9999999999999999999999999999999999999999';
  record.feePolicy.feeBasisPoints = '9999';
  const result = await promise;

  assert.equal(result.outcome, 'EXECUTABLE_REGISTRY_RECORD_VALIDATED');
  assert.equal(result.recordHash, fixture.positive.expectedExecutableRegistryRecordHash);
  assert.equal(result.record.recipientAddress, fixture.positive.executableRegistryRecord.recipientAddress);
  assert.equal(result.record.feePolicy.feeBasisPoints, '100');
});

test('only genuine successful results satisfy the private validation brand', async () => {
  const { api, context } = loadRuntime();
  const result = await api.validateAndHashRecord(positiveRecord(context));
  const failure = await api.validateAndHashRecord(null);
  const fabricated = Object.freeze({
    outcome: 'EXECUTABLE_REGISTRY_RECORD_VALIDATED',
    contentValidated: true,
    contentHashEstablished: true,
    authenticated: false,
    current: false,
    executionEligible: false,
    recordHash: fixture.positive.expectedExecutableRegistryRecordHash,
  });

  assert.equal(api.isValidatedRecordResult(result), true);
  assert.equal(api.isValidatedRecordResult(failure), false);
  assert.equal(api.isValidatedRecordResult(fabricated), false);
  assert.equal(api.isValidatedRecordResult(null), false);
});
