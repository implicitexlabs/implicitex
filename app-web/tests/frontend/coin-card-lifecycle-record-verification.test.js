const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const trustedKeyResolutionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-verification.js');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
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

function realmClone(context, value) {
  return vm.runInNewContext(`(${JSON.stringify(value)})`, context);
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
  const canonical = runtime.registry.canonicalizeJson(realmClone(runtime.context, signaturePayload(record)));
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    new TextEncoder().encode(canonical),
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

test('mutating signed lifecycle record fields prevents authentication', async () => {
  const runtime = await makeSignedRuntime();
  const mutations = {
    registryId: 'implicitex-production-mutated',
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
    administrationEvidenceHash: 'evidence-hash-test',
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

test('duplicate signature metadata must match canonical lifecycle values', async () => {
  const runtime = await makeSignedRuntime();
  const record = clone(runtime.record);
  record.signature.authorityId = null;

  const result = await authenticate(runtime, realmClone(runtime.context, record));

  assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_METADATA_INVALID);
  assert.equal(result.authenticated, false);
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
      name: 'future signing time',
      recordOverrides: {
        signature: { signedAt: '2026-07-10T08:10:00.001Z' },
      },
      expected: 'LIFECYCLE_PUBLICATION_KEY_SOURCE_UNAVAILABLE',
    },
  ];

  for (const scenario of cases) {
    const runtime = await makeSignedRuntime(scenario.recordOverrides || {}, scenario.keyOverrides || {});
    const result = await authenticate(runtime, runtime.record);
    assert.equal(result.outcome, runtime.verifier.OUTCOMES[scenario.expected], scenario.name);
    assert.equal(result.authenticated, false, scenario.name);
  }
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
