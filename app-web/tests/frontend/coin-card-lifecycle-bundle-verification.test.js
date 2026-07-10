const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const trustedKeyResolutionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-verification.js');
const lifecycleBundleVerificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-bundle-verification.js');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerificationSource = fs.readFileSync(lifecycleRecordVerificationPath, 'utf8');
const lifecycleBundleVerificationSource = fs.readFileSync(lifecycleBundleVerificationPath, 'utf8');
const BUNDLE_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
const BUNDLE_SIGNATURE = 'not-applicable-v1';

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

function realmClone(context, value) {
  return vm.runInNewContext(`(${JSON.stringify(value)})`, context);
}

function realmEvaluate(context, source) {
  return vm.runInNewContext(source, context);
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

function lifecycleRecord(index, overrides = {}) {
  const publishedAt = `2026-07-09T09:0${index}:00.000Z`;
  const manifestId = `manifest_test_00${index}`;
  const record = {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production',
    registryVersion: index,
    recordId: `registry-record-00${index}`,
    publishedAt,
    cardId: 'card_test_001',
    manifestId,
    revision: index,
    previousManifestId: index === 1 ? null : `manifest_test_00${index - 1}`,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: index === 3 ? 'MANIFEST_CURRENT' : 'MANIFEST_SUPERSEDED',
    effectiveFrom: publishedAt,
    effectiveUntil: null,
    supersededByManifestId: index === 3 ? null : `manifest_test_00${index + 1}`,
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
      signedAt: publishedAt,
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
    Buffer.from(runtime.recordVerifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
}

function loadBundleRuntime(options = {}) {
  const context = {
    TextEncoder,
    Promise,
    window: {},
    atob: nodeAtob,
    btoa: nodeBtoa,
  };
  context.globalThis = context;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = options.crypto || webcrypto;

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
  if (typeof options.recordVerifierApiFactory === 'function') {
    context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION = options.recordVerifierApiFactory(
      context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    );
  }
  vm.runInNewContext(lifecycleBundleVerificationSource, context, { filename: lifecycleBundleVerificationPath });
  return {
    context,
    trustedKeyResolution: context.window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION,
    registry: context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
  };
}

async function makeSignedBundleRuntime(recordOverrides = [], bundleOverrides = {}, keyOverrides = {}, options = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const runtime = loadBundleRuntime({
    trustedPublicKeys: {
      'registry-publication-test-key': trustedKeyRecord('registry-publication-test-key', publicKey, keyOverrides),
    },
    recordVerifierApiFactory: options.recordVerifierApiFactory,
  });

  const records = [1, 2, 3].map((index, position) => lifecycleRecord(index, recordOverrides[position] || {}));
  for (const record of records) {
    const signature = await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair.privateKey,
      signedPayloadBytes(runtime, record),
    );
    record.signature.value = toBase64Url(signature);
  }

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 3,
    generatedAt: '2026-07-09T09:05:00.000Z',
    entries: records,
    ...bundleOverrides,
  });

  return {
    ...runtime,
    keyPair,
    bundle: realmClone(runtime.context, bundle),
    records: records.map((record) => realmClone(runtime.context, record)),
  };
}

test('valid synthetic lifecycle bundle authenticates atomically without lifecycle resolution', async () => {
  const runtime = await makeSignedBundleRuntime();
  const result = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);

  assert.equal(lifecycleBundleVerificationSource.includes('resolveLifecycle'), false);
  assert.equal(lifecycleBundleVerificationSource.includes('IX_COIN_CARD_VERIFICATION'), false);
  assert.equal(lifecycleBundleVerificationSource.includes('IX_EXECUTION'), false);
  assert.equal(runtime.bundleVerifier.BUNDLE_SCHEMA_VERSION, BUNDLE_SCHEMA_VERSION);
  assert.equal(runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED, 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED');
  assert.equal(result.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED);
  assert.equal(result.authenticated, true);
  assert.equal(result.sourceValidated, true);
  assert.equal(result.recordsAuthenticated, true);
  assert.equal(result.bundleIntegrityAuthenticated, false);
  assert.equal(result.rollbackProtected, false);
  assert.equal(result.bundleSignature, BUNDLE_SIGNATURE);
  assert.equal(result.registryId, 'implicitex-production');
  assert.equal(result.environment, 'production');
  assert.equal(result.registryVersion, 3);
  assert.equal(result.generatedAt, '2026-07-09T09:05:00.000Z');
  assert.equal(result.entryCount, 3);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.bundle), true);
  assert.equal(Object.isFrozen(result.bundle.entries), true);
  assert.equal(Object.isFrozen(result.bundle.entries[0]), true);
  assert.equal(Object.isFrozen(result.bundle.entries[0].signature), true);
  assert.equal(Object.isFrozen(result.entries), true);
  assert.equal(Object.isFrozen(result.entries[0]), true);
  assert.equal(Object.isFrozen(result.entries[0].record), true);
  assert.equal(Object.isFrozen(result.entries[0].keyResolution), true);
  assert.equal(Object.isFrozen(result.entries[0].keyResolution.record), true);
  assert.equal(Object.isFrozen(result.entries[0].keyResolution.publicKey), true);
  assert.equal(result.entries[0].authenticated, true);
  assert.equal(result.entries[0].record.registryVersion, 1);

  result.entries[0].record.cardStatus = 'CARD_REVOKED';
  assert.equal(result.entries[0].record.cardStatus, 'CARD_ACTIVE');
});

test('bundle authentication snapshots caller-owned data before async entry verification', async () => {
  const runtime = await makeSignedBundleRuntime();
  const callerBundle = runtime.bundle;
  const pending = runtime.bundleVerifier.authenticateLifecycleRegistryBundle(callerBundle);

  callerBundle.generatedAt = '2026-07-09T10:00:00.000Z';
  callerBundle.entries[1].manifestId = 'manifest_test_mutated';
  callerBundle.entries[2].registryVersion = 99;

  const result = await pending;

  assert.equal(result.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED);
  assert.equal(result.bundle.generatedAt, '2026-07-09T09:05:00.000Z');
  assert.equal(result.entries[1].record.manifestId, 'manifest_test_002');
  assert.equal(result.entries[2].record.registryVersion, 3);
});

test('bundle authentication uses one verification instant for every entry', async () => {
  const calls = [];
  const runtime = await makeSignedBundleRuntime();
  const recordVerifier = runtime.recordVerifier;
  const wrappedRecordVerifier = Object.freeze({
    ...recordVerifier,
    authenticateLifecycleRecord(record, options) {
      calls.push({
        recordId: record && record.recordId || null,
        verificationTime: options && options.verificationTime || null,
      });
      return recordVerifier.authenticateLifecycleRecord(record, options);
    },
  });

  const result = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle, {
    verificationTime: '2026-07-09T09:05:00.000Z',
    recordVerifierApi: wrappedRecordVerifier,
  });

  assert.equal(result.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((call) => call.verificationTime), [
    calls[0].verificationTime,
    calls[0].verificationTime,
    calls[0].verificationTime,
  ]);
  assert.equal(typeof calls[0].verificationTime, 'string');
});

test('bundle verifier rejects invalid verificationTime options', async () => {
  const runtime = await makeSignedBundleRuntime();
  const invalidResult = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle, {
    verificationTime: 'not-a-timestamp',
  });
  assert.equal(invalidResult.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_TIME_INVALID);
  assert.equal(invalidResult.authenticated, false);
  assert.equal(Object.isFrozen(invalidResult), true);

  const accessorOptions = {};
  Object.defineProperty(accessorOptions, 'verificationTime', {
    enumerable: false,
    value: '2026-07-09T09:05:00.000Z',
  });
  const accessorResult = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle, accessorOptions);
  assert.equal(accessorResult.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_TIME_INVALID);
  assert.equal(accessorResult.authenticated, false);
  assert.equal(Object.isFrozen(accessorResult), true);
});

test('bundle verifier rejects structural defects atomically', async () => {
  const runtime = await makeSignedBundleRuntime([
    {},
    {},
    {
      registryVersion: 2,
    },
  ], {
    registryVersion: 2,
  });

  const duplicateVersionResult = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  assert.equal(duplicateVersionResult.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID);
  assert.equal(duplicateVersionResult.authenticated, false);
  assert.equal(duplicateVersionResult.entries, null);
  assert.equal(Object.isFrozen(duplicateVersionResult), true);

  const hiddenAccessor = realmClone(runtime.context, {
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 3,
    generatedAt: '2026-07-10T09:05:00.000Z',
    entries: runtime.records,
  });
  Object.defineProperty(hiddenAccessor, 'hidden', {
    enumerable: false,
    get() {
      return 'dynamic';
    },
  });

  const hiddenAccessorResult = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(hiddenAccessor);
  assert.equal(hiddenAccessorResult.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID);
  assert.equal(hiddenAccessorResult.authenticated, false);
});

test('bundle verifier rejects all documented wrapper and collection invariants', async () => {
  const runtime = await makeSignedBundleRuntime();
  const scenarios = [
    {
      name: 'wrong schema',
      mutate(bundle) {
        bundle.registrySchemaVersion = 'coin-card-lifecycle-registry-bundle.v2';
      },
    },
    {
      name: 'wrong registry',
      mutate(bundle) {
        bundle.registryId = 'implicitex-staging';
      },
    },
    {
      name: 'wrong environment',
      mutate(bundle) {
        bundle.environment = 'staging';
      },
    },
    {
      name: 'empty entries',
      mutate(bundle) {
        bundle.entries = [];
      },
    },
    {
      name: 'duplicate recordId',
      mutate(bundle) {
        bundle.entries[1].recordId = bundle.entries[0].recordId;
      },
    },
    {
      name: 'duplicate registryVersion',
      mutate(bundle) {
        bundle.entries[1].registryVersion = bundle.entries[0].registryVersion;
      },
    },
    {
      name: 'out of order versions',
      mutate(bundle) {
        bundle.entries[1].registryVersion = 4;
        bundle.entries[2].registryVersion = 2;
      },
    },
    {
      name: 'highest version mismatch',
      mutate(bundle) {
        bundle.registryVersion = 4;
      },
    },
    {
      name: 'duplicate publication identity',
      mutate(bundle) {
        bundle.entries[1].cardId = bundle.entries[0].cardId;
        bundle.entries[1].manifestId = bundle.entries[0].manifestId;
        bundle.entries[1].revision = bundle.entries[0].revision;
      },
    },
    {
      name: 'record registry mismatch',
      mutate(bundle) {
        bundle.entries[1].registryId = 'implicitex-staging';
      },
    },
    {
      name: 'record environment mismatch',
      mutate(bundle) {
        bundle.entries[1].environment = 'staging';
      },
    },
    {
      name: 'record published after generatedAt',
      mutate(bundle) {
        bundle.entries[1].publishedAt = '2026-07-09T09:06:00.000Z';
      },
    },
    {
      name: 'generatedAt beyond clock skew',
      mutate(bundle) {
        bundle.generatedAt = '2026-07-10T09:10:00.000Z';
      },
      options: {
        verificationTime: '2026-07-10T09:00:00.000Z',
      },
    },
  ];

  for (const scenario of scenarios) {
    const bundle = clone(runtime.bundle);
    const mutated = scenario.mutate(bundle);
    const candidate = scenario.replace ? mutated : bundle;
    const result = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(
      realmClone(runtime.context, candidate),
      scenario.options,
    );
    assert.equal(result.authenticated, false, scenario.name);
    assert.notEqual(result.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED, scenario.name);
    assert.equal(Object.isFrozen(result), true, scenario.name);
  }
});

test('bundle verifier rejects custom prototypes, symbols, cycles, and shared references', async () => {
  const runtime = await makeSignedBundleRuntime();
  const cases = [
    {
      name: 'custom prototype',
      value: realmEvaluate(runtime.context, `(() => {
        const prototype = { hidden: 'value' };
        const bundle = Object.create(prototype);
        bundle.registrySchemaVersion = 'coin-card-lifecycle-registry-bundle.v1';
        bundle.registryId = 'implicitex-production';
        bundle.environment = 'production';
        bundle.registryVersion = 3;
        bundle.generatedAt = '2026-07-09T09:05:00.000Z';
        bundle.entries = ${JSON.stringify(runtime.records)};
        return bundle;
      })()`),
    },
    {
      name: 'symbol property',
      value: realmEvaluate(runtime.context, `(() => {
        const bundle = ${JSON.stringify(runtime.bundle)};
        const symbol = Symbol('hidden');
        bundle[symbol] = 'value';
        return bundle;
      })()`),
    },
    {
      name: 'cycle',
      value: realmEvaluate(runtime.context, `(() => {
        const bundle = ${JSON.stringify(runtime.bundle)};
        bundle.self = bundle;
        return bundle;
      })()`),
    },
    {
      name: 'shared reference',
      value: realmEvaluate(runtime.context, `(() => {
        const bundle = ${JSON.stringify(runtime.bundle)};
        const shared = bundle.entries[0];
        bundle.entries = [shared, shared, bundle.entries[2]];
        return bundle;
      })()`),
    },
    {
      name: 'sparse entries',
      value: realmEvaluate(runtime.context, `(() => {
        const bundle = ${JSON.stringify(runtime.bundle)};
        bundle.entries = [bundle.entries[0], , bundle.entries[2]];
        return bundle;
      })()`),
    },
  ];

  for (const scenario of cases) {
    const result = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(scenario.value);
    assert.equal(result.authenticated, false, scenario.name);
    assert.equal(result.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_STRUCTURE_INVALID, scenario.name);
  }
});

test('bundle verifier returns unavailable when entry verification rejects unexpectedly', async () => {
  const runtime = await makeSignedBundleRuntime();
  const result = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle, {
    verificationTime: '2026-07-09T09:05:00.000Z',
    recordVerifierApi: Object.freeze({
      ...runtime.recordVerifier,
      authenticateLifecycleRecord() {
        throw new Error('unexpected verifier failure');
      },
    }),
  });
  assert.equal(result.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_VERIFICATION_UNAVAILABLE);
  assert.equal(result.authenticated, false);
  assert.equal(result.reason, 'lifecycle-record-verifier-rejected');
  assert.equal(result.failedEntryIndex, 0);
  assert.equal(result.failedRecordId, 'registry-record-001');
  assert.equal(Object.isFrozen(result), true);
});

test('bundle verifier fails closed when one entry fails authentication', async () => {
  const runtime = await makeSignedBundleRuntime();
  runtime.bundle.entries[1].signature.value = 'MEYCIQDspL8uDERencodedFixtureValueNotP1363';

  const result = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);

  assert.equal(result.outcome, runtime.bundleVerifier.OUTCOMES.LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED);
  assert.equal(result.authenticated, false);
  assert.equal(result.entries, null);
  assert.equal(result.failedEntryIndex, 1);
  assert.equal(result.failedRecordId, 'registry-record-002');
  assert.equal(result.entryOutcome, runtime.recordVerifier.OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_ENCODING_INVALID);
  assert.equal(Object.isFrozen(result), true);
});
