const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const trustedKeyResolutionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const canonicalJsonPath = lifecycleRegistryPath.replace('coin-card-lifecycle-registry.js', 'coin-card-canonical-json-v1.js');
const lifecycleRecordVerificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-verification.js');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const canonicalJsonSource = fs.readFileSync(canonicalJsonPath, 'utf8');
const lifecycleRecordVerificationSource = fs.readFileSync(lifecycleRecordVerificationPath, 'utf8');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => {
    deepFreeze(value[key]);
  });
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64');
}

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function trustedKeyRecord(keyId, publicKey, overrides = {}) {
  return deepFreeze({
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey,
    issuerId: 'implicitex-registry',
    usage: ['coin-card-registry-publication'],
    status: 'ACTIVE',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    revokedAt: null,
    revocationReason: null,
    revocationPolicy: null,
    successorKeyId: null,
    environment: 'production',
    ...overrides,
  });
}

function lifecycleRecord(overrides = {}) {
  const record = {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production',
    registryVersion: 1,
    recordId: 'registry-record-test-001',
    publishedAt: '2026-07-10T08:00:00.000Z',
    cardId: 'card_test_001',
    manifestId: 'manifest_test_001',
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-07-10T08:00:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
    reasonCode: null,
    authorityId: 'implicitex-registry',
    administrationEvidenceHash: null,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: 'registry-publication-test-key',
      authorityId: 'implicitex-registry',
      signedAt: '2026-07-10T08:00:00.000Z',
      value: '',
    },
  };
  return {
    ...record,
    ...overrides,
    signature: {
      ...record.signature,
      ...(overrides.signature || {}),
    },
  };
}

function signaturePayload(record) {
  const payload = clone(record);
  delete payload.signature.value;
  return payload;
}

function signedPayloadBytes(runtime, record) {
  const canonical = runtime.registry.canonicalizeJson(realmClone(runtime.context, signaturePayload(record)));
  return Buffer.concat([
    Buffer.from(runtime.verifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
}

function realmClone(context, value) {
  return vm.runInNewContext(`(${JSON.stringify(value)})`, context);
}

function realmEvaluate(context, source) {
  return vm.runInNewContext(source, context);
}

function loadLifecycleRecordVerification(options = {}) {
  const context = {
    TextEncoder,
    window: {},
    atob: nodeAtob,
    btoa: nodeBtoa,
  };
  context.globalThis = context;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  if (!options.cryptoUnavailable) {
    context.window.crypto = options.crypto || webcrypto;
  }
  if (options.trustedPublicKeys) {
    context.__trustedPublicKeysJson = JSON.stringify(options.trustedPublicKeys);
    vm.runInNewContext(`(() => {
      function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
        return Object.freeze(value);
      }
      window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = deepFreeze(JSON.parse(__trustedPublicKeysJson));
    })()`, context);
  }

  vm.runInNewContext(trustedKeyResolutionSource, context, { filename: trustedKeyResolutionPath });
  vm.runInNewContext(canonicalJsonSource, context, { filename: canonicalJsonPath });
  vm.runInNewContext(lifecycleRegistrySource, context, { filename: lifecycleRegistryPath });
  vm.runInNewContext(lifecycleRecordVerificationSource, context, { filename: lifecycleRecordVerificationPath });
  return {
    context,
    trustedKeyResolution: context.window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION,
    registry: context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    verifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
  };
}

async function makeSignedRuntime(recordOverrides = {}, keyOverrides = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const record = lifecycleRecord(recordOverrides);
  const trustedPublicKeys = {
    [record.signature.keyId]: trustedKeyRecord(record.signature.keyId, publicKey, keyOverrides),
  };
  const runtime = loadLifecycleRecordVerification({ trustedPublicKeys, crypto: webcrypto });
  const signedBytes = signedPayloadBytes(runtime, record);
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    signedBytes,
  );

  assert.equal(signature.byteLength, 64);
  record.signature.value = toBase64Url(signature);
  return { ...runtime, record: realmClone(runtime.context, record), keyPair, trustedPublicKeys };
}

async function authenticate(runtime, record) {
  return runtime.verifier.authenticateLifecycleRecord(record, {
    verificationTime: '2026-07-10T08:01:00.000Z',
  });
}

test('valid synthetic lifecycle record authenticates without manifest verifier', async () => {
  const runtime = await makeSignedRuntime();
  const result = await authenticate(runtime, runtime.record);

  assert.equal(runtime.context.window.IX_COIN_CARD_VERIFICATION, undefined);
  assert.equal(lifecycleRecordVerificationSource.includes('IX_COIN_CARD_VERIFICATION'), false);
  assert.equal(lifecycleRecordVerificationSource.includes('IX_EXECUTION'), false);
  assert.equal(lifecycleRecordVerificationSource.includes('ccFrame'), false);
  assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED);
  assert.equal(result.authenticated, true);
  assert.equal(result.recordId, 'registry-record-test-001');
  assert.equal(result.registryId, 'implicitex-production');
  assert.equal(result.registryVersion, 1);
  assert.equal(result.authorityId, 'implicitex-registry');
  assert.equal(result.keyId, 'registry-publication-test-key');
  assert.equal(runtime.verifier.LIFECYCLE_RECORD_SCHEMA_VERSION, 'coin-card-lifecycle-registry-record.v1');
  assert.equal(runtime.verifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'ImplicitEx Coin Card Lifecycle Registry Record v1');
  assert.equal(
    createHash('sha256').update(signedPayloadBytes(runtime, runtime.record)).digest('hex'),
    'd1a44a87ba5a6c20bcde94c1b2ef75e4f70a52bace479cffbf17db0989d58e14',
  );
});

test('lifecycle record verifier rejects DER and non-64-byte signature encodings', async () => {
  const runtime = await makeSignedRuntime();
  const signatureBytes = fromBase64Url(runtime.record.signature.value);

  for (const value of [
    'MEYCIQDspL8uDERencodedFixtureValueNotP1363',
    toBase64Url(signatureBytes.subarray(0, 63)),
    toBase64Url(Buffer.concat([signatureBytes, Buffer.from([0])])),
  ]) {
    const record = clone(runtime.record);
    record.signature.value = value;
    const result = await authenticate(runtime, realmClone(runtime.context, record));
    assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_ENCODING_INVALID);
    assert.equal(result.authenticated, false);
    assert.equal(result.record, null);
  }
});

test('lifecycle record verifier rejects custom-prototype and array inputs', async () => {
  const runtime = await makeSignedRuntime();
  const prototypeRecord = realmEvaluate(runtime.context, `(() => {
    const prototype = { inheritedPolicy: 'unexpected' };
    const record = Object.create(prototype);
    return Object.assign(record, ${JSON.stringify(runtime.record)});
  })()`);

  const prototypeResult = await authenticate(runtime, prototypeRecord);
  assert.equal(prototypeResult.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_SCHEMA_INVALID);
  assert.equal(prototypeResult.authenticated, false);

  const arrayResult = await authenticate(runtime, realmEvaluate(runtime.context, '([])'));
  assert.equal(arrayResult.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_SCHEMA_INVALID);
  assert.equal(arrayResult.authenticated, false);
});

test('mutating signed lifecycle record fields prevents authentication', async () => {
  const runtime = await makeSignedRuntime();
  const mutations = {
    registryId: 'implicitex-production-mutated',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v2',
    environment: 'staging',
    registryVersion: 2,
    recordId: 'registry-record-test-002',
    publishedAt: '2026-07-10T08:00:01.000Z',
    cardId: 'card_test_002',
    manifestId: 'manifest_test_002',
    revision: 2,
    previousManifestId: 'manifest_previous',
    cardStatus: 'CARD_SUSPENDED',
    manifestStatus: 'MANIFEST_REVOKED',
    effectiveFrom: '2026-07-10T08:00:01.000Z',
    effectiveUntil: '2026-07-11T08:00:00.000Z',
    supersededByManifestId: 'manifest_test_003',
    reasonCode: 'TEST_REASON',
    authorityId: 'other-registry',
    administrationEvidenceHash: toBase64Url(Buffer.alloc(32, 1)),
  };

  for (const [field, value] of Object.entries(mutations)) {
    const record = clone(runtime.record);
    record[field] = value;
    const result = await authenticate(runtime, realmClone(runtime.context, record));
    assert.notEqual(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED, field);
    assert.equal(result.authenticated, false, field);
    assert.equal(result.record, null, field);
  }

  for (const [field, value] of Object.entries({
    mode: 'signed-p256-v2',
    algorithm: 'ECDSA',
    signatureEncoding: 'der',
    signatureLengthBytes: 65,
    signatureValueEncoding: 'base64',
    keyId: 'other-key',
    authorityId: 'other-registry',
    signedAt: '2026-07-10T08:00:01.000Z',
  })) {
    const record = clone(runtime.record);
    record.signature[field] = value;
    const result = await authenticate(runtime, realmClone(runtime.context, record));
    assert.notEqual(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED, `signature.${field}`);
    assert.equal(result.authenticated, false, `signature.${field}`);
    assert.equal(result.record, null, `signature.${field}`);
  }
});

test('canonical administration evidence hash authenticates and noncanonical values fail', async () => {
  const canonicalEvidence = toBase64Url(Buffer.alloc(32, 1));
  const runtime = await makeSignedRuntime({
    administrationEvidenceHash: canonicalEvidence,
  });
  const result = await authenticate(runtime, runtime.record);

  assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED);
  assert.equal(result.authenticated, true);

  const badEvidence = clone(runtime.record);
  badEvidence.administrationEvidenceHash = `${canonicalEvidence.slice(0, -1)}B`;
  const badEvidenceResult = await authenticate(runtime, realmClone(runtime.context, badEvidence));
  assert.equal(badEvidenceResult.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_SCHEMA_INVALID);
  assert.equal(badEvidenceResult.authenticated, false);
});

test('authenticated lifecycle record is an immutable pre-verification snapshot', async () => {
  const runtime = await makeSignedRuntime();
  const callerRecord = runtime.record;
  const pending = authenticate(runtime, callerRecord);

  callerRecord.cardStatus = 'CARD_REVOKED';
  callerRecord.manifestId = 'different-manifest';

  const result = await pending;

  assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED);
  assert.equal(result.record.cardStatus, 'CARD_ACTIVE');
  assert.equal(result.record.manifestId, 'manifest_test_001');
  assert.equal(Object.isFrozen(result.record), true);
  assert.equal(Object.isFrozen(result.record.signature), true);
  assert.equal(Object.isFrozen(result.keyResolution), true);
  assert.equal(Object.isFrozen(result.keyResolution.record), true);
  assert.equal(Object.isFrozen(result.keyResolution.publicKey), true);
  assert.equal(result.keyResolution.outcome, runtime.trustedKeyResolution.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE);

  result.record.cardStatus = 'CARD_REVOKED';
  result.record.signature.keyId = 'different-key';
  result.keyResolution.outcome = 'TRUSTED_KEY_REVOKED';

  assert.equal(result.record.cardStatus, 'CARD_ACTIVE');
  assert.equal(result.record.signature.keyId, 'registry-publication-test-key');
  assert.equal(result.keyResolution.outcome, runtime.trustedKeyResolution.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE);
});

test('lifecycle record schema rejects contradictory lifecycle semantics', async () => {
  const cases = [
    { revision: 1, previousManifestId: 'manifest_previous' },
    { revision: 2, previousManifestId: null },
    { manifestStatus: 'MANIFEST_SUPERSEDED', supersededByManifestId: null },
    { manifestStatus: 'MANIFEST_CURRENT', supersededByManifestId: 'manifest_next' },
    { effectiveUntil: '2026-07-10T08:00:00.000Z' },
    { effectiveUntil: '2026-07-10T07:59:59.999Z' },
    { administrationEvidenceHash: 'evidence-hash-test' },
  ];

  for (const overrides of cases) {
    const runtime = await makeSignedRuntime(overrides);
    const result = await authenticate(runtime, runtime.record);
    assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_SCHEMA_INVALID, JSON.stringify(overrides));
    assert.equal(result.authenticated, false);
    assert.equal(result.record, null);
  }
});

test('duplicate signature metadata must match canonical lifecycle values', async () => {
  const runtime = await makeSignedRuntime();
  const record = clone(runtime.record);
  record.signature.authorityId = null;

  const result = await authenticate(runtime, realmClone(runtime.context, record));

  assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_METADATA_INVALID);
  assert.equal(result.authenticated, false);
  assert.equal(Object.isFrozen(result), true);
});

test('publication key import failures are distinct from signature verification failures', async () => {
  const invalidJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(Buffer.alloc(32, 0)),
    y: toBase64Url(Buffer.alloc(32, 0)),
    ext: true,
    key_ops: ['verify'],
  };
  const runtime = await makeSignedRuntime({}, { publicKey: invalidJwk });
  const result = await authenticate(runtime, runtime.record);

  assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_PUBLICATION_KEY_IMPORT_INVALID);
  assert.equal(result.authenticated, false);
  assert.equal(Object.isFrozen(result), true);
});

test('publication key failures map to deterministic lifecycle outcomes', async () => {
  const cases = [
    {
      name: 'wrong usage',
      keyOverrides: { usage: ['coin-card-manifest-signing'] },
      expected: 'LIFECYCLE_PUBLICATION_KEY_USAGE_DENIED',
    },
    {
      name: 'wrong environment',
      keyOverrides: { environment: 'staging' },
      expected: 'LIFECYCLE_PUBLICATION_KEY_ENVIRONMENT_MISMATCH',
    },
    {
      name: 'wrong authority',
      keyOverrides: { issuerId: 'other-registry' },
      expected: 'LIFECYCLE_PUBLICATION_KEY_AUTHORITY_MISMATCH',
    },
    {
      name: 'revoked',
      keyOverrides: {
        status: 'REVOKED',
        revokedAt: '2026-07-10T08:00:00.000Z',
        revocationReason: 'test',
        revocationPolicy: 'INVALIDATE_ALL_SIGNATURES',
      },
      expected: 'LIFECYCLE_PUBLICATION_KEY_REVOKED',
    },
    {
      name: 'expired',
      keyOverrides: { validUntil: '2026-07-10T07:59:59.000Z' },
      expected: 'LIFECYCLE_PUBLICATION_KEY_EXPIRED',
    },
    {
      name: 'signed after published',
      recordOverrides: {
        publishedAt: '2026-07-10T07:59:59.000Z',
      },
      expected: 'LIFECYCLE_RECORD_PUBLICATION_TIME_INVALID',
    },
    {
      name: 'published far in the future',
      recordOverrides: {
        publishedAt: '2026-07-10T09:10:00.000Z',
      },
      expected: 'LIFECYCLE_RECORD_PUBLICATION_TIME_INVALID',
    },
  ];

  for (const scenario of cases) {
    const runtime = await makeSignedRuntime(scenario.recordOverrides || {}, scenario.keyOverrides || {});
    const result = await authenticate(runtime, runtime.record);
    assert.equal(result.outcome, runtime.verifier.OUTCOMES[scenario.expected], scenario.name);
    assert.equal(result.authenticated, false, scenario.name);
    assert.equal(Object.isFrozen(result), true, scenario.name);
  }

  const runtime = await makeSignedRuntime();
  const invalidVerifierTime = await runtime.verifier.authenticateLifecycleRecord(runtime.record, {
    verificationTime: 'not-a-timestamp',
  });
  assert.equal(invalidVerifierTime.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_VERIFICATION_TIME_INVALID);
  assert.equal(invalidVerifierTime.authenticated, false);
  assert.equal(Object.isFrozen(invalidVerifierTime), true);

  for (const verificationTime of ['', null, 0]) {
    const result = await runtime.verifier.authenticateLifecycleRecord(runtime.record, {
      verificationTime,
    });
    assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_VERIFICATION_TIME_INVALID);
    assert.equal(result.authenticated, false);
    assert.equal(Object.isFrozen(result), true);
  }

  const accessorOptions = {};
  Object.defineProperty(accessorOptions, 'verificationTime', {
    enumerable: false,
    value: '2026-07-10T08:01:00.000Z',
  });
  const nonEnumerableResult = await runtime.verifier.authenticateLifecycleRecord(runtime.record, accessorOptions);
  assert.equal(nonEnumerableResult.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_VERIFICATION_TIME_INVALID);
  assert.equal(nonEnumerableResult.authenticated, false);
  assert.equal(Object.isFrozen(nonEnumerableResult), true);

  const accessorOptionsWithGetter = {};
  Object.defineProperty(accessorOptionsWithGetter, 'verificationTime', {
    enumerable: true,
    get() {
      return '2026-07-10T08:01:00.000Z';
    },
  });
  const accessorResult = await runtime.verifier.authenticateLifecycleRecord(runtime.record, accessorOptionsWithGetter);
  assert.equal(accessorResult.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_VERIFICATION_TIME_INVALID);
  assert.equal(accessorResult.authenticated, false);
  assert.equal(Object.isFrozen(accessorResult), true);
});

test('missing crypto fails closed and production lifecycle source remains empty', async () => {
  const runtime = await makeSignedRuntime();
  const unavailableRuntime = loadLifecycleRecordVerification({
    trustedPublicKeys: runtime.trustedPublicKeys,
    cryptoUnavailable: true,
  });

  const result = await authenticate(unavailableRuntime, runtime.record);
  const lifecycle = unavailableRuntime.registry.resolveLifecycle('card_test_001', 'manifest_test_001');

  assert.equal(result.outcome, unavailableRuntime.verifier.OUTCOMES.LIFECYCLE_CRYPTO_UNAVAILABLE);
  assert.equal(result.authenticated, false);
  assert.equal(lifecycle.registry.registryVersion, 0);
  assert.equal(lifecycle.registry.generatedAt, null);
  assert.equal(lifecycle.registry.entryCount, 0);
  assert.equal(lifecycle.cardOutcome, unavailableRuntime.registry.CARD_OUTCOMES.CARD_UNKNOWN);
  assert.equal(lifecycle.manifestOutcome, unavailableRuntime.registry.MANIFEST_OUTCOMES.MANIFEST_UNKNOWN);
  assert.equal(lifecycle.operationalOutcome, unavailableRuntime.registry.OPERATIONAL_OUTCOMES.LIFECYCLE_UNKNOWN);
});
