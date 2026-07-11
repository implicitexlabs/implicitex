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
const lifecycleBundleVerificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-bundle-verification.js');
const lifecycleSelectionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-selection.js');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerificationSource = fs.readFileSync(lifecycleRecordVerificationPath, 'utf8');
const lifecycleBundleVerificationSource = fs.readFileSync(lifecycleBundleVerificationPath, 'utf8');
const lifecycleSelectionSource = fs.readFileSync(lifecycleSelectionPath, 'utf8');

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

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function makeFixedDateClass(isoString) {
  const RealDate = Date;
  const fixedTime = RealDate.parse(isoString);

  return class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(isoString);
      } else {
        super(...args);
      }
    }

    static now() {
      return fixedTime;
    }

    static parse(value) {
      return RealDate.parse(value);
    }

    static UTC(...args) {
      return RealDate.UTC(...args);
    }
  };
}

function realmClone(context, value) {
  return vm.runInNewContext(`(${JSON.stringify(value)})`, context);
}

function realmDeepFrozenClone(context, value) {
  context.__frozenCloneJson = JSON.stringify(value);
  return vm.runInNewContext(`(() => {
    function deepFreeze(item) {
      if (!item || typeof item !== 'object' || Object.isFrozen(item)) {
        return item;
      }

      Object.getOwnPropertyNames(item).forEach((key) => {
        deepFreeze(item[key]);
      });

      return Object.freeze(item);
    }

    return deepFreeze(JSON.parse(__frozenCloneJson));
  })()`, context);
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

function makeRecord(definition) {
  return {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production',
    registryVersion: definition.registryVersion,
    recordId: definition.recordId,
    publishedAt: definition.publishedAt,
    cardId: definition.cardId,
    manifestId: definition.manifestId,
    revision: definition.revision,
    previousManifestId: definition.previousManifestId,
    cardStatus: definition.cardStatus,
    manifestStatus: definition.manifestStatus,
    effectiveFrom: definition.effectiveFrom,
    effectiveUntil: definition.effectiveUntil,
    supersededByManifestId: definition.supersededByManifestId,
    reasonCode: null,
    authorityId: 'implicitex-registry',
    administrationEvidenceHash: definition.administrationEvidenceHash || null,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: 'registry-publication-test-key',
      authorityId: 'implicitex-registry',
      signedAt: definition.publishedAt,
      value: '',
    },
  };
}

function signedPayloadBytes(runtime, record) {
  const payload = clone(record);
  delete payload.signature.value;
  const canonical = runtime.registry.canonicalizeJson(realmClone(runtime.context, payload));
  return Buffer.concat([
    Buffer.from(runtime.recordVerifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonical, 'utf8'),
  ]);
}

async function signRecord(runtime, keyPair, record) {
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    signedPayloadBytes(runtime, record),
  );
  record.signature.value = toBase64Url(signature);
  return record;
}

function makeSelectionContext(options = {}) {
  const fixedDate = options.fixedNow ? makeFixedDateClass(options.fixedNow) : null;
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
  if (fixedDate) {
    context.Date = fixedDate;
    context.window.Date = fixedDate;
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

  if (options.includeRecordVerifier !== false) {
    vm.runInNewContext(lifecycleRecordVerificationSource, context, { filename: lifecycleRecordVerificationPath });
  }

  if (options.includeBundleVerifier) {
    vm.runInNewContext(lifecycleBundleVerificationSource, context, { filename: lifecycleBundleVerificationPath });
  }

  if (options.bundleApiStub) {
    Object.defineProperty(context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
      value: options.bundleApiStub,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  vm.runInNewContext(lifecycleSelectionSource, context, { filename: lifecycleSelectionPath });

  return {
    context,
    registry: context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
  };
}

async function makeSignedSelectionRuntime(recordDefinitions, bundleOverrides = {}, keyOverrides = {}, options = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const trustedPublicKeys = {
    'registry-publication-test-key': trustedKeyRecord('registry-publication-test-key', publicKey, keyOverrides),
  };
  const runtime = makeSelectionContext({
    trustedPublicKeys,
    includeRecordVerifier: true,
    includeBundleVerifier: true,
    fixedNow: options.fixedNow || '2026-07-10T08:05:00.000Z',
  });

  const records = recordDefinitions.map((definition) => makeRecord(definition));
  for (const record of records) {
    await signRecord(runtime, keyPair, record);
  }

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: bundleOverrides.registryVersion || Math.max(...records.map((record) => record.registryVersion)),
    generatedAt: bundleOverrides.generatedAt || '2026-07-10T08:05:00.000Z',
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

function makeFakeBundleApi(proof) {
  return Object.freeze({
    OUTCOMES: Object.freeze({
      LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED: 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED',
    }),
    isAuthenticatedBundleResult(value) {
      return value === proof;
    },
  });
}

function makeFakeSelectionRuntime(fixedNow = '2026-07-10T08:05:00.000Z') {
  return makeSelectionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    fixedNow,
  });
}

function makeFakeProof(recordDefinitions, overrides = {}) {
  const records = recordDefinitions.map((definition) => (definition && definition.signature ? definition : makeRecord(definition)));
  const bundleRegistryVersion = overrides.registryVersion || Math.max(...records.map((record) => record.registryVersion));
  const bundleGeneratedAt = overrides.generatedAt || '2026-07-10T08:05:00.000Z';
  const bundle = {
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: bundleRegistryVersion,
    generatedAt: bundleGeneratedAt,
    entries: records,
  };

  const entries = records.map((record) => ({
    outcome: 'LIFECYCLE_RECORD_AUTHENTICATED',
    authenticated: true,
    recordId: record.recordId,
    registryId: record.registryId,
    registryVersion: record.registryVersion,
    authorityId: record.authorityId,
    keyId: record.signature.keyId,
    record,
    keyResolution: {
      outcome: 'TRUSTED_KEY_ACTIVE',
    },
  }));

  return deepFreeze({
    outcome: 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED',
    authenticated: true,
    sourceValidated: true,
    recordsAuthenticated: true,
    bundleIntegrityAuthenticated: false,
    rollbackProtected: false,
    bundleSignature: BUNDLE_SIGNATURE,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: bundleRegistryVersion,
    generatedAt: bundleGeneratedAt,
    entryCount: records.length,
    bundle,
    entries,
  });
}

function makeLineageDefinitions(options = {}) {
  const cardId = options.cardId || 'card_test_001';
  return [
    {
      recordId: options.recordId1 || 'registry-record-002',
      cardId,
      manifestId: options.manifestId1 || 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: options.manifestId2 || 'manifest_test_002',
      cardStatus: options.cardStatus1 || 'CARD_ACTIVE',
      manifestStatus: options.manifestStatus1 || 'MANIFEST_SUPERSEDED',
    },
    {
      recordId: options.recordId2 || 'registry-record-001',
      cardId,
      manifestId: options.manifestId2 || 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: options.manifestId1 || 'manifest_test_001',
      supersededByManifestId: options.manifestId3 || 'manifest_test_003',
      cardStatus: options.cardStatus2 || 'CARD_ACTIVE',
      manifestStatus: options.manifestStatus2 || 'MANIFEST_SUPERSEDED',
    },
    {
      recordId: options.recordId3 || 'registry-record-003',
      cardId,
      manifestId: options.manifestId3 || 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: options.manifestId2 || 'manifest_test_002',
      supersededByManifestId: null,
      cardStatus: options.cardStatus3 || 'CARD_ACTIVE',
      manifestStatus: options.manifestStatus3 || 'MANIFEST_CURRENT',
    },
  ];
}

function makeRegistryOrderedLineageDefinitions(options = {}) {
  const cardId = options.cardId || 'card_test_001';
  return [
    {
      recordId: options.recordId2 || 'registry-record-002',
      cardId,
      manifestId: options.manifestId2 || 'manifest_test_002',
      revision: 2,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: options.manifestId1 || 'manifest_test_001',
      supersededByManifestId: options.manifestId3 || 'manifest_test_003',
      cardStatus: options.cardStatus2 || 'CARD_ACTIVE',
      manifestStatus: options.manifestStatus2 || 'MANIFEST_SUPERSEDED',
    },
    {
      recordId: options.recordId1 || 'registry-record-001',
      cardId,
      manifestId: options.manifestId1 || 'manifest_test_001',
      revision: 1,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: options.manifestId2 || 'manifest_test_002',
      cardStatus: options.cardStatus1 || 'CARD_ACTIVE',
      manifestStatus: options.manifestStatus1 || 'MANIFEST_SUPERSEDED',
    },
    {
      recordId: options.recordId3 || 'registry-record-003',
      cardId,
      manifestId: options.manifestId3 || 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: options.manifestId2 || 'manifest_test_002',
      supersededByManifestId: null,
      cardStatus: options.cardStatus3 || 'CARD_ACTIVE',
      manifestStatus: options.manifestStatus3 || 'MANIFEST_CURRENT',
    },
  ];
}

function mutateProofForScenario(proof, mutate) {
  const cloned = realmClone({
    window: {},
    globalThis: null,
  }, clone(proof));
  mutate(cloned);
  return deepFreeze(cloned);
}

function assertFrozenDeep(value) {
  assert.equal(Object.isFrozen(value), true);
  if (value && typeof value === 'object') {
    Object.getOwnPropertyNames(value).forEach((key) => {
      assertFrozenDeep(value[key]);
    });
  }
}

test('bundle proof gate accepts genuine success and rejects lookalikes', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const cloneProof = deepFreeze(clone(proof));
  const shallowCopy = Object.freeze({ ...proof });

  assert.equal(runtime.bundleVerifier.isAuthenticatedBundleResult(proof), true);
  assert.equal(runtime.bundleVerifier.isAuthenticatedBundleResult(cloneProof), false);
  assert.equal(runtime.bundleVerifier.isAuthenticatedBundleResult(shallowCopy), false);
  assert.equal(runtime.bundleVerifier.isAuthenticatedBundleResult({}), false);
  assert.equal(runtime.bundleVerifier.isAuthenticatedBundleResult('nope'), false);
});

test('selector selects coherent lineage and preserves registry ordering', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const result = runtime.selector.selectLifecycleEvidence(proof, {
    cardId: 'card_test_001',
  });

  assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_SELECTED);
  assert.equal(result.selected, true);
  assert.equal(result.selectedRecordCount, 3);
  assert.equal(result.requestedManifestId, null);
  assert.deepEqual(Array.from(result.lineageOrderedRecords, (record) => record.manifestId), ['manifest_test_001', 'manifest_test_002', 'manifest_test_003']);
  assert.deepEqual(Array.from(result.registryOrderedRecords, (record) => record.manifestId), ['manifest_test_002', 'manifest_test_001', 'manifest_test_003']);
  assert.equal(result.lineage.rootManifestId, 'manifest_test_001');
  assert.equal(result.lineage.tipManifestId, 'manifest_test_003');
  assert.equal(result.lineage.highestRevision, 3);
  assert.equal(result.operationallyResolved, false);
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
  assertFrozenDeep(result);
});

test('manifest-specific selection preserves full relevant lineage', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const result = runtime.selector.selectLifecycleEvidence(proof, {
    cardId: 'card_test_001',
    manifestId: 'manifest_test_002',
  });

  assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_SELECTED);
  assert.equal(result.requestedManifestId, 'manifest_test_002');
  assert.equal(result.requestedRecord.manifestId, 'manifest_test_002');
  assert.deepEqual(Array.from(result.predecessorRecords, (record) => record.manifestId), ['manifest_test_001']);
  assert.deepEqual(Array.from(result.successorRecords, (record) => record.manifestId), ['manifest_test_003']);
  assert.deepEqual(Array.from(result.lineageOrderedRecords, (record) => record.manifestId), ['manifest_test_001', 'manifest_test_002', 'manifest_test_003']);
});

test('selector rejects proof gate lookalikes and malformed inputs', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const failureBundle = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(mutateProofForScenario(runtime.bundle, (bundle) => {
    bundle.generatedAt = '2026-07-10T08:11:00.000Z';
  }));
  const fabricated = Object.freeze({ ...proof });
  const mutableProof = clone(proof);
  const mutableNestedProof = Object.freeze({
    ...clone(proof),
    entries: clone(proof.entries),
  });

  assert.equal(runtime.selector.selectLifecycleEvidence(runtime.bundle, { cardId: 'card_test_001' }).outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
  assert.equal(runtime.selector.selectLifecycleEvidence(failureBundle, { cardId: 'card_test_001' }).outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
  assert.equal(runtime.selector.selectLifecycleEvidence(fabricated, { cardId: 'card_test_001' }).outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
  assert.equal(runtime.selector.selectLifecycleEvidence(mutableProof, { cardId: 'card_test_001' }).outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
  assert.equal(runtime.selector.selectLifecycleEvidence(mutableNestedProof, { cardId: 'card_test_001' }).outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
});

test('selector rejects malformed request shapes', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const requests = [
    { name: 'missing cardId', value: {} },
    { name: 'empty cardId', value: { cardId: '' } },
    { name: 'empty manifestId', value: { cardId: 'card_test_001', manifestId: '' } },
    { name: 'extra field', value: { cardId: 'card_test_001', extra: true } },
    { name: 'array request', value: [] },
    { name: 'custom prototype', value: Object.assign(Object.create({ inherited: true }), { cardId: 'card_test_001' }) },
    {
      name: 'hidden field',
      value: (() => {
        const request = { cardId: 'card_test_001' };
        Object.defineProperty(request, 'manifestId', {
          value: 'manifest_test_001',
          enumerable: false,
        });
        return request;
      })(),
    },
    {
      name: 'accessor field',
      value: (() => {
        const request = { cardId: 'card_test_001' };
        Object.defineProperty(request, 'manifestId', {
          get() {
            return 'manifest_test_001';
          },
          enumerable: true,
        });
        return request;
      })(),
    },
    {
      name: 'symbol field',
      value: (() => {
        const request = { cardId: 'card_test_001' };
        Object.defineProperty(request, Symbol('request'), {
          value: true,
          enumerable: true,
        });
        return request;
      })(),
    },
  ];

  for (const { value } of requests) {
    const result = runtime.selector.selectLifecycleEvidence(proof, value);
    assert.equal(result.fact, runtime.selector.TOP_LEVEL_FACTS.CONFLICT);
    assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
    assert.equal(result.reason, 'selection-request-invalid');
    assertFrozenDeep(result);
  }
});

test('selector fails closed on hostile proxy request objects', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const traps = [
    {
      name: 'getPrototypeOf',
      proxy: new Proxy({ cardId: 'card_test_001' }, {
        getPrototypeOf() {
          throw new Error('trap');
        },
      }),
    },
    {
      name: 'ownKeys',
      proxy: new Proxy({ cardId: 'card_test_001' }, {
        ownKeys() {
          throw new Error('trap');
        },
      }),
    },
    {
      name: 'getOwnPropertyDescriptor',
      proxy: new Proxy({ cardId: 'card_test_001' }, {
        getOwnPropertyDescriptor() {
          throw new Error('trap');
        },
      }),
    },
  ];

  for (const { proxy } of traps) {
    const result = runtime.selector.selectLifecycleEvidence(proof, proxy);
    assert.equal(result.fact, runtime.selector.TOP_LEVEL_FACTS.CONFLICT);
    assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
    assert.equal(result.reason, 'selection-request-invalid');
    assertFrozenDeep(result);
  }
});

test('selector fails closed when the bundle proof authority is unavailable', async () => {
  const runtime = makeSelectionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    fixedNow: '2026-07-10T08:05:00.000Z',
  });
  const proof = realmDeepFrozenClone(runtime.context, makeFakeProof(makeRegistryOrderedLineageDefinitions()));
  const result = runtime.selector.selectLifecycleEvidence(proof, { cardId: 'card_test_001' });

  assert.equal(result.fact, runtime.selector.TOP_LEVEL_FACTS.CONFLICT);
  assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
  assert.equal(result.reason, 'selection-bundle-proof-unavailable');
  assertFrozenDeep(result);
});

test('selector fails closed when the bundle proof predicate is unavailable', async () => {
  const runtime = makeSelectionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    fixedNow: '2026-07-10T08:05:00.000Z',
  });
  Object.defineProperty(runtime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: Object.freeze({
      OUTCOMES: Object.freeze({
        LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED: 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED',
      }),
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });

  const proof = realmDeepFrozenClone(runtime.context, makeFakeProof(makeRegistryOrderedLineageDefinitions()));
  const result = runtime.selector.selectLifecycleEvidence(proof, { cardId: 'card_test_001' });

  assert.equal(result.fact, runtime.selector.TOP_LEVEL_FACTS.CONFLICT);
  assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INPUT_INVALID);
  assert.equal(result.reason, 'selection-bundle-proof-unavailable');
  assertFrozenDeep(result);
});

test('selector returns deterministic not-found outcomes and frozen envelopes', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const cardMissing = runtime.selector.selectLifecycleEvidence(proof, { cardId: 'card_missing' });
  const manifestMissing = runtime.selector.selectLifecycleEvidence(proof, {
    cardId: 'card_test_001',
    manifestId: 'manifest_missing',
  });

  assert.equal(cardMissing.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_CARD_NOT_FOUND);
  assert.equal(manifestMissing.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_MANIFEST_NOT_FOUND);
  assert.equal(cardMissing.selectedRecords, null);
  assert.equal(manifestMissing.selectedRecords, null);
  assertFrozenDeep(cardMissing);
  assertFrozenDeep(manifestMissing);
});

test('selector detects structural conflicts on authentically shaped proofs', async () => {
  const baseRecords = makeLineageDefinitions();
  const duplicatePositionRecords = [
    {
      ...baseRecords[0],
      recordId: 'registry-record-010',
      registryVersion: 1,
    },
    {
      ...baseRecords[0],
      recordId: 'registry-record-011',
      registryVersion: 2,
    },
  ];

  const duplicatePositionRuntime = makeFakeSelectionRuntime();
  const duplicatePositionProof = realmDeepFrozenClone(duplicatePositionRuntime.context, makeFakeProof(duplicatePositionRecords));
  Object.defineProperty(duplicatePositionRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(duplicatePositionProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  const duplicatePositionResult = duplicatePositionRuntime.selector.selectLifecycleEvidence(duplicatePositionProof, {
    cardId: 'card_test_001',
  });

  assert.equal(duplicatePositionResult.outcome, duplicatePositionRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_DUPLICATE_POSITION);
  assert.equal(duplicatePositionResult.reason, 'selection-duplicate-position');

  const brokenPredecessorRecords = makeLineageDefinitions();
  brokenPredecessorRecords[1] = {
    ...brokenPredecessorRecords[1],
    previousManifestId: 'manifest_missing',
  };
  const brokenPredecessorRuntime = makeFakeSelectionRuntime();
  const brokenPredecessorProof = realmDeepFrozenClone(brokenPredecessorRuntime.context, makeFakeProof(brokenPredecessorRecords));
  Object.defineProperty(brokenPredecessorRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(brokenPredecessorProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  const brokenPredecessorResult = brokenPredecessorRuntime.selector.selectLifecycleEvidence(brokenPredecessorProof, {
    cardId: 'card_test_001',
  });

  assert.equal(brokenPredecessorResult.outcome, brokenPredecessorRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_LINEAGE_INVALID);

  const absentSupersessionRecords = makeLineageDefinitions();
  absentSupersessionRecords[1] = {
    ...absentSupersessionRecords[1],
    supersededByManifestId: 'manifest_missing',
  };
  const absentSupersessionRuntime = makeFakeSelectionRuntime();
  const absentSupersessionProof = realmDeepFrozenClone(absentSupersessionRuntime.context, makeFakeProof(absentSupersessionRecords));
  Object.defineProperty(absentSupersessionRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(absentSupersessionProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  const absentSupersessionResult = absentSupersessionRuntime.selector.selectLifecycleEvidence(absentSupersessionProof, {
    cardId: 'card_test_001',
  });

  assert.equal(absentSupersessionResult.outcome, absentSupersessionRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_LINEAGE_INVALID);
});

test('selector rejects broken lineage, disconnected lineages, and interval/status conflicts', async () => {
  const predecessorCycleRecords = [
    {
      ...makeLineageDefinitions()[0],
      previousManifestId: 'manifest_test_002',
      supersededByManifestId: 'manifest_test_002',
    },
    {
      ...makeLineageDefinitions()[1],
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_001',
    },
  ];
  const predecessorCycleRuntime = makeFakeSelectionRuntime();
  const predecessorCycleProof = realmDeepFrozenClone(predecessorCycleRuntime.context, makeFakeProof(predecessorCycleRecords));
  Object.defineProperty(predecessorCycleRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(predecessorCycleProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  assert.equal(
    predecessorCycleRuntime.selector.selectLifecycleEvidence(predecessorCycleProof, { cardId: 'card_test_001' }).outcome,
    predecessorCycleRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_LINEAGE_INVALID,
  );

  const disconnectedRecords = [
    {
      ...makeLineageDefinitions()[0],
      supersededByManifestId: 'manifest_test_002',
    },
    {
      ...makeLineageDefinitions()[1],
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    },
    {
      ...makeLineageDefinitions()[2],
      cardId: 'card_test_001',
      manifestId: 'manifest_test_099',
      recordId: 'registry-record-099',
      revision: 1,
      registryVersion: 3,
      previousManifestId: null,
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
      effectiveFrom: '2026-07-10T08:04:00.000Z',
      effectiveUntil: null,
    },
  ];
  const disconnectedRuntime = makeFakeSelectionRuntime();
  const disconnectedProof = realmDeepFrozenClone(disconnectedRuntime.context, makeFakeProof(disconnectedRecords));
  Object.defineProperty(disconnectedRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(disconnectedProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  assert.equal(
    disconnectedRuntime.selector.selectLifecycleEvidence(disconnectedProof, { cardId: 'card_test_001' }).outcome,
    disconnectedRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_AMBIGUOUS,
  );

  const intervalConflictRecords = [
    {
      ...makeLineageDefinitions()[0],
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      supersededByManifestId: 'manifest_test_002',
    },
    {
      ...makeLineageDefinitions()[1],
      effectiveFrom: '2026-07-10T08:02:30.000Z',
      effectiveUntil: '2026-07-10T08:04:00.000Z',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
    },
    makeLineageDefinitions()[2],
  ];
  const intervalConflictRuntime = makeFakeSelectionRuntime();
  const intervalConflictProof = realmDeepFrozenClone(intervalConflictRuntime.context, makeFakeProof(intervalConflictRecords));
  Object.defineProperty(intervalConflictRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(intervalConflictProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  assert.equal(
    intervalConflictRuntime.selector.selectLifecycleEvidence(intervalConflictProof, { cardId: 'card_test_001' }).outcome,
    intervalConflictRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_INTERVAL_CONFLICT,
  );

  const statusConflictRecords = [
    {
      ...makeLineageDefinitions()[0],
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      manifestStatus: 'MANIFEST_SUPERSEDED',
      supersededByManifestId: 'manifest_test_002',
    },
    {
      ...makeLineageDefinitions()[1],
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      manifestStatus: 'MANIFEST_CURRENT',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
    },
    makeLineageDefinitions()[2],
  ];
  const statusConflictRuntime = makeFakeSelectionRuntime();
  const statusConflictProof = realmDeepFrozenClone(statusConflictRuntime.context, makeFakeProof(statusConflictRecords));
  Object.defineProperty(statusConflictRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(statusConflictProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  assert.equal(
    statusConflictRuntime.selector.selectLifecycleEvidence(statusConflictProof, { cardId: 'card_test_001' }).outcome,
    statusConflictRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_STATUS_CONFLICT,
  );

  const cardStatusConflictRecords = [
    {
      ...makeLineageDefinitions()[0],
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      cardStatus: 'CARD_ACTIVE',
      supersededByManifestId: 'manifest_test_002',
    },
    {
      ...makeLineageDefinitions()[1],
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      cardStatus: 'CARD_REVOKED',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
    },
    makeLineageDefinitions()[2],
  ];
  const cardStatusConflictRuntime = makeFakeSelectionRuntime();
  const cardStatusConflictProof = realmDeepFrozenClone(cardStatusConflictRuntime.context, makeFakeProof(cardStatusConflictRecords));
  Object.defineProperty(cardStatusConflictRuntime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(cardStatusConflictProof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  assert.equal(
    cardStatusConflictRuntime.selector.selectLifecycleEvidence(cardStatusConflictProof, { cardId: 'card_test_001' }).outcome,
    cardStatusConflictRuntime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_STATUS_CONFLICT,
  );
});

test('selector applies manifest-not-found precedence before later conflicts', async () => {
  const records = makeLineageDefinitions();
  records.push({
    ...records[0],
    recordId: 'registry-record-999',
    manifestId: 'manifest_test_999',
    registryVersion: 4,
  });
  const runtime = makeFakeSelectionRuntime();
  const proof = realmDeepFrozenClone(runtime.context, makeFakeProof(records));
  Object.defineProperty(runtime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(proof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  const result = runtime.selector.selectLifecycleEvidence(proof, {
    cardId: 'card_test_001',
    manifestId: 'manifest_missing',
  });

  assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_MANIFEST_NOT_FOUND);
  assert.equal(result.reason, 'selection-manifest-not-found');
});

test('selector prefers duplicate position over manifest ambiguity when the requested manifest exists', async () => {
  const records = [
    {
      ...makeLineageDefinitions()[0],
      recordId: 'registry-record-010',
      registryVersion: 1,
    },
    {
      ...makeLineageDefinitions()[0],
      recordId: 'registry-record-011',
      registryVersion: 2,
    },
  ];
  const runtime = makeFakeSelectionRuntime();
  const proof = realmDeepFrozenClone(runtime.context, makeFakeProof(records));
  Object.defineProperty(runtime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(proof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  const result = runtime.selector.selectLifecycleEvidence(proof, {
    cardId: 'card_test_001',
    manifestId: 'manifest_test_001',
  });

  assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_DUPLICATE_POSITION);
  assert.equal(result.reason, 'selection-duplicate-position');
});

test('selector tolerates delimiter-bearing canonical tuple values', async () => {
  const records = [
    {
      ...makeLineageDefinitions()[0],
      cardId: 'card\u0000test',
      manifestId: 'manifest\u0000one',
      recordId: 'registry-record-delim-1',
      supersededByManifestId: 'manifest\u0000two',
    },
    {
      ...makeLineageDefinitions()[1],
      cardId: 'card\u0000test',
      manifestId: 'manifest\u0000two',
      previousManifestId: 'manifest\u0000one',
      recordId: 'registry-record-delim-2',
      supersededByManifestId: 'manifest\u0000three',
    },
    {
      ...makeLineageDefinitions()[2],
      cardId: 'card\u0000test',
      manifestId: 'manifest\u0000three',
      previousManifestId: 'manifest\u0000two',
      recordId: 'registry-record-delim-3',
      supersededByManifestId: null,
    },
  ];
  const runtime = makeFakeSelectionRuntime();
  const proof = realmDeepFrozenClone(runtime.context, makeFakeProof(records));
  Object.defineProperty(runtime.context.window, 'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION', {
    value: makeFakeBundleApi(proof),
    writable: false,
    enumerable: true,
    configurable: false,
  });
  const result = runtime.selector.selectLifecycleEvidence(proof, {
    cardId: 'card\u0000test',
    manifestId: 'manifest\u0000two',
  });

  assert.equal(result.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_SELECTED);
  assert.deepEqual(Array.from(result.lineageOrderedRecords, (record) => record.manifestId), ['manifest\u0000one', 'manifest\u0000two', 'manifest\u0000three']);
});

test('selector keeps success and failure envelopes deeply frozen and operationally narrow', async () => {
  const runtime = await makeSignedSelectionRuntime(makeRegistryOrderedLineageDefinitions(), {});
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(runtime.bundle);
  const success = runtime.selector.selectLifecycleEvidence(proof, { cardId: 'card_test_001' });
  const notFound = runtime.selector.selectLifecycleEvidence(proof, { cardId: 'card_missing' });

  assert.equal(success.operationallyResolved, false);
  assert.equal(success.presentationEligible, false);
  assert.equal(success.executionEligible, false);
  assert.equal(success.outcome, runtime.selector.OUTCOMES.LIFECYCLE_EVIDENCE_SELECTED);
  assert.equal(notFound.selectedRecords, null);
  assert.equal(notFound.operationallyResolved, false);
  assert.equal(notFound.presentationEligible, false);
  assert.equal(notFound.executionEligible, false);
  assertFrozenDeep(success);
  assertFrozenDeep(notFound);
});

test('selector source omits forbidden dependencies', () => {
  assert.equal(lifecycleSelectionSource.includes('IX_COIN_CARD_VERIFICATION'), false);
  assert.equal(lifecycleSelectionSource.includes('IX_EXECUTION'), false);
  assert.equal(lifecycleSelectionSource.includes('resolveLifecycle('), false);
  assert.equal(lifecycleSelectionSource.includes('window.IX_COIN_CARD_WALLET'), false);
  assert.equal(lifecycleSelectionSource.includes('window.IX_COIN_CARD_PRESENTATION'), false);
});
