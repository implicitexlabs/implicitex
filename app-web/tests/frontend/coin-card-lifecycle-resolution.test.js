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
const lifecycleResolutionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-resolution.js');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerificationSource = fs.readFileSync(lifecycleRecordVerificationPath, 'utf8');
const lifecycleBundleVerificationSource = fs.readFileSync(lifecycleBundleVerificationPath, 'utf8');
const lifecycleSelectionSource = fs.readFileSync(lifecycleSelectionPath, 'utf8');
const lifecycleResolutionSource = fs.readFileSync(lifecycleResolutionPath, 'utf8');

const BUNDLE_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
const BUNDLE_SIGNATURE = 'not-applicable-v1';
const DEFAULT_FIXED_NOW = '2026-07-10T08:05:00.000Z';

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

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeCountingDateClass(isoString, tracker) {
  const RealDate = Date;
  const fixedTime = RealDate.parse(isoString);

  return class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        tracker.count += 1;
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

function makeFixedDateClass(isoString) {
  return makeCountingDateClass(isoString, { count: 0 });
}

function realmClone(context, value) {
  return vm.runInNewContext(`(${JSON.stringify(value)})`, context);
}

function realmDeepFrozenClone(context, value) {
  context.__cloneJson = JSON.stringify(value);
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

    return deepFreeze(JSON.parse(__cloneJson));
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

function recordDefinition(spec) {
  return {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production',
    registryVersion: spec.registryVersion,
    recordId: spec.recordId,
    publishedAt: spec.publishedAt,
    cardId: spec.cardId || 'card_test_001',
    manifestId: spec.manifestId,
    revision: spec.revision,
    previousManifestId: spec.previousManifestId,
    cardStatus: spec.cardStatus || 'CARD_ACTIVE',
    manifestStatus: spec.manifestStatus || 'MANIFEST_CURRENT',
    effectiveFrom: spec.effectiveFrom,
    effectiveUntil: spec.effectiveUntil,
    supersededByManifestId: spec.supersededByManifestId,
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
      signedAt: spec.publishedAt,
      value: '',
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

async function signRecord(runtime, keyPair, record) {
  const signature = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    signedPayloadBytes(runtime, record),
  );
  record.signature.value = toBase64Url(signature);
  return record;
}

function makeResolutionContext(options = {}) {
  const tracker = options.clockTracker || { count: 0 };
  const fixedDate = options.fixedNow ? makeCountingDateClass(options.fixedNow, tracker) : null;
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

  if (options.includeBundleVerifier !== false) {
    vm.runInNewContext(lifecycleBundleVerificationSource, context, { filename: lifecycleBundleVerificationPath });
  }

  if (options.selectorApiStub) {
    Object.defineProperty(context.window, 'IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION', {
      value: options.selectorApiStub,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  } else if (options.includeSelection !== false) {
    vm.runInNewContext(lifecycleSelectionSource, context, { filename: lifecycleSelectionPath });
  }

  if (options.includeResolution !== false) {
    vm.runInNewContext(lifecycleResolutionSource, context, { filename: lifecycleResolutionPath });
  }

  return {
    context,
    registry: context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
    resolution: context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
    clockTracker: tracker,
  };
}

async function makeSignedResolutionRuntime(recordSpecs, request, options = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const fixedNow = options.fixedNow || DEFAULT_FIXED_NOW;
  const trustedPublicKeys = {
    'registry-publication-test-key': trustedKeyRecord('registry-publication-test-key', publicKey, options.keyOverrides || {}),
  };
  const runtime = makeResolutionContext({
    trustedPublicKeys,
    fixedNow,
    clockTracker: options.clockTracker,
    includeRecordVerifier: true,
    includeBundleVerifier: true,
    includeSelection: true,
    includeResolution: true,
  });

  const records = recordSpecs.map((spec) => recordDefinition(spec));
  for (const record of records) {
    await signRecord(runtime, keyPair, record);
  }

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: options.bundleVersion || Math.max(...records.map((record) => record.registryVersion)),
    generatedAt: options.generatedAt || fixedNow,
    entries: records,
  });

  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  const selected = runtime.selector.selectLifecycleEvidence(proof, request || { cardId: records[0].cardId });

  return {
    ...runtime,
    keyPair,
    publicKey,
    records: records.map((record) => realmClone(runtime.context, record)),
    bundle: bundleInput,
    proof,
    selected,
  };
}

function makeFakeSelectorApi(proof) {
  return Object.freeze({
    isSelectedLifecycleEvidenceResult(value) {
      return value === proof;
    },
  });
}

function makeFakeSelectedProof(selected, mutator) {
  const fabricated = clone(selected);
  if (typeof mutator === 'function') {
    mutator(fabricated);
  }
  if (
    fabricated
    && Array.isArray(fabricated.selectedRecords)
    && Array.isArray(fabricated.lineageOrderedRecords)
  ) {
    const count = Math.min(
      fabricated.selectedRecords.length,
      fabricated.lineageOrderedRecords.length,
      Array.isArray(fabricated.registryOrderedRecords) ? fabricated.registryOrderedRecords.length : fabricated.lineageOrderedRecords.length,
    );
    for (let i = 0; i < count; i += 1) {
      const shared = fabricated.lineageOrderedRecords[i] || fabricated.selectedRecords[i];
      if (!shared || typeof shared !== 'object') {
        continue;
      }
      fabricated.selectedRecords[i] = shared;
      fabricated.lineageOrderedRecords[i] = shared;
      if (Array.isArray(fabricated.registryOrderedRecords) && fabricated.registryOrderedRecords[i]) {
        fabricated.registryOrderedRecords[i] = shared;
      }
    }
    if (
      fabricated.requestedManifestId !== null
      && Array.isArray(fabricated.lineageOrderedRecords)
    ) {
      const requestedMatch = fabricated.lineageOrderedRecords.find(
        (record) => record && record.manifestId === fabricated.requestedManifestId,
      );
      if (requestedMatch) {
        fabricated.requestedRecord = requestedMatch;
      }
    }
  }
  return deepFreeze(fabricated);
}

function assertFrozenDeep(value) {
  assert.equal(Object.isFrozen(value), true);
  if (value && typeof value === 'object') {
    Object.getOwnPropertyNames(value).forEach((key) => {
      assertFrozenDeep(value[key]);
    });
  }
}

function assertNonOperational(result) {
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
}

function assertUnavailable(result, outcome) {
  assert.equal(result.outcome, outcome);
  assert.equal(result.fact, 'UNAVAILABLE');
  assert.equal(result.operationallyResolved, false);
  assert.equal(result.resolvedRecord, null);
  assertNonOperational(result);
  assertFrozenDeep(result);
  assert.equal(typeof result.reason, 'string');
}

function assertResolved(result, outcome, fact) {
  assert.equal(result.outcome, outcome);
  assert.equal(result.fact, fact);
  assert.equal(result.operationallyResolved, true);
  assertNonOperational(result);
  assertFrozenDeep(result);
  assert.equal(result.reason, null);
  assert.equal(result.supportingLineage && Object.isFrozen(result.supportingLineage), true);
}

test('genuine selected evidence is accepted and resolved', async () => {
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      cardId: 'card_test_001',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-003',
      cardId: 'card_test_001',
      manifestId: 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_002',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001' });

  assert.equal(runtime.selector.isSelectedLifecycleEvidenceResult(runtime.selected), true);
  const resolved = runtime.resolution.resolveLifecycle(runtime.selected);
  assertResolved(resolved, runtime.resolution.OUTCOMES.LIFECYCLE_ACTIVE, 'RESOLVED');
  assert.equal(resolved.resolvedRecordId, 'registry-record-003');
  assert.equal(resolved.resolvedManifestId, 'manifest_test_003');
  assert.equal(resolved.temporalState, 'EFFECTIVE');
  assert.equal(resolved.cardStatus, 'CARD_ACTIVE');
  assert.equal(resolved.manifestStatus, 'MANIFEST_CURRENT');
  assert.equal(resolved.supportingLineage.requestedRecord, null);
  assert.equal(resolved.supportingLineage.selectedRecords.length, 3);
});

test('copied selected result is rejected', async () => {
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      cardId: 'card_test_001',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-003',
      cardId: 'card_test_001',
      manifestId: 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_002',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001' });

  const copied = deepFreeze(clone(runtime.selected));
  assert.equal(runtime.selector.isSelectedLifecycleEvidenceResult(copied), false);
  assertUnavailable(runtime.resolution.resolveLifecycle(copied), runtime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_INPUT_INVALID);
});

test('fabricated selected result is rejected', async () => {
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-003',
      manifestId: 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_002',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001' });

  const fabricated = deepFreeze({
    ...clone(runtime.selected),
    selectedRecordCount: 1,
    selectedRecords: deepFreeze([clone(runtime.selected.selectedRecords[0])]),
    lineageOrderedRecords: deepFreeze([clone(runtime.selected.lineageOrderedRecords[0])]),
    registryOrderedRecords: deepFreeze([clone(runtime.selected.registryOrderedRecords[0])]),
    predecessorRecords: deepFreeze([]),
    successorRecords: deepFreeze([]),
    lineage: deepFreeze(clone(runtime.selected.lineage)),
  });

  assert.equal(runtime.selector.isSelectedLifecycleEvidenceResult(fabricated), false);
  assertUnavailable(runtime.resolution.resolveLifecycle(fabricated), runtime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_INPUT_INVALID);
});

test('selected result from another selector instance is rejected', async () => {
  const runtimeA = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001' });

  const runtimeB = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: true,
    includeResolution: true,
    fixedNow: DEFAULT_FIXED_NOW,
  });
  const copied = realmDeepFrozenClone(runtimeB.context, runtimeA.selected);

  assert.equal(runtimeB.selector.isSelectedLifecycleEvidenceResult(copied), false);
  assertUnavailable(runtimeB.resolution.resolveLifecycle(copied), runtimeB.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_INPUT_INVALID);
});

test('selector authority absent and selector predicate absent fail closed', async () => {
  const absentRuntime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    fixedNow: DEFAULT_FIXED_NOW,
  });
  const predicateAbsentRuntime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    selectorApiStub: Object.freeze({}),
    fixedNow: DEFAULT_FIXED_NOW,
  });

  assertUnavailable(
    absentRuntime.resolution.resolveLifecycle(Object.freeze({})),
    absentRuntime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_AUTHORITY_UNAVAILABLE
  );
  assertUnavailable(
    predicateAbsentRuntime.resolution.resolveLifecycle(Object.freeze({})),
    predicateAbsentRuntime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_AUTHORITY_UNAVAILABLE
  );
});

test('selector predicate throwing an exception fails closed', async () => {
  const runtime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    selectorApiStub: Object.freeze({
      isSelectedLifecycleEvidenceResult() {
        throw new Error('selector rejected');
      },
    }),
    fixedNow: DEFAULT_FIXED_NOW,
  });

  assertUnavailable(
    runtime.resolution.resolveLifecycle(Object.freeze({})),
    runtime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_AUTHORITY_UNAVAILABLE
  );
});

test('resolver-owned time is captured once and caller-supplied extra args have no effect', async () => {
  const clockTracker = { count: 0 };
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-003',
      manifestId: 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_002',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001' }, { fixedNow: DEFAULT_FIXED_NOW, clockTracker });

  const before = clockTracker.count;
  const result = runtime.resolution.resolveLifecycle(runtime.selected);
  const after = clockTracker.count;
  const extraArgsResult = runtime.resolution.resolveLifecycle(runtime.selected, {
    verificationTime: '1970-01-01T00:00:00.000Z',
  }, 'ignored');

  assert.equal(after - before, 1);
  assert.deepEqual(result, extraArgsResult);
  assertResolved(result, runtime.resolution.OUTCOMES.LIFECYCLE_ACTIVE, 'RESOLVED');
});

test('manifest-specific selection respects effective-from and effective-until boundaries', async () => {
  const notYetRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:06:00.000Z',
      effectiveUntil: '2026-07-10T08:07:00.000Z',
      previousManifestId: null,
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001', manifestId: 'manifest_test_001' }, { fixedNow: '2026-07-10T08:05:00.000Z' });
  const effectiveRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: '2026-07-10T08:06:00.000Z',
      previousManifestId: null,
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001', manifestId: 'manifest_test_001' }, { fixedNow: '2026-07-10T08:05:00.000Z' });
  const expiredRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:04:00.000Z',
      effectiveFrom: '2026-07-10T08:04:00.000Z',
      effectiveUntil: '2026-07-10T08:05:00.000Z',
      previousManifestId: null,
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001', manifestId: 'manifest_test_001' }, { fixedNow: '2026-07-10T08:05:00.000Z' });

  const notYet = notYetRuntime.resolution.resolveLifecycle(notYetRuntime.selected);
  const effective = effectiveRuntime.resolution.resolveLifecycle(effectiveRuntime.selected);
  const expired = expiredRuntime.resolution.resolveLifecycle(expiredRuntime.selected);

  assertResolved(notYet, notYetRuntime.resolution.OUTCOMES.LIFECYCLE_NOT_YET_EFFECTIVE, 'NOT_EFFECTIVE');
  assertResolved(effective, effectiveRuntime.resolution.OUTCOMES.LIFECYCLE_ACTIVE, 'RESOLVED');
  assertResolved(expired, expiredRuntime.resolution.OUTCOMES.LIFECYCLE_EXPIRED, 'TERMINAL');

  assert.equal(notYet.resolvedRecordId, 'registry-record-001');
  assert.equal(effective.resolvedRecordId, 'registry-record-001');
  assert.equal(expired.resolvedRecordId, 'registry-record-001');
  assert.equal(notYet.temporalState, 'NOT_YET_EFFECTIVE');
  assert.equal(effective.temporalState, 'EFFECTIVE');
  assert.equal(expired.temporalState, 'EXPIRED');
  assert.equal(notYet.resolvedRecord.manifestId, 'manifest_test_001');
  assert.equal(expired.resolvedRecord.manifestId, 'manifest_test_001');
});

test('card-only selection resolves unique effective record and detects future, past, and gap states', async () => {
  const activeRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-003',
      manifestId: 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_002',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });

  const futureRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-101',
      cardId: 'card_test_future',
      manifestId: 'manifest_test_101',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:06:00.000Z',
      effectiveFrom: '2026-07-10T08:06:00.000Z',
      effectiveUntil: '2026-07-10T08:07:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_102',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-102',
      cardId: 'card_test_future',
      manifestId: 'manifest_test_102',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:07:00.000Z',
      effectiveFrom: '2026-07-10T08:07:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_101',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_future' }, { fixedNow: DEFAULT_FIXED_NOW, generatedAt: '2026-07-10T08:08:00.000Z' });

  const pastRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-201',
      cardId: 'card_test_past',
      manifestId: 'manifest_test_201',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T07:58:00.000Z',
      effectiveFrom: '2026-07-10T07:58:00.000Z',
      effectiveUntil: '2026-07-10T07:59:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_202',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-202',
      cardId: 'card_test_past',
      manifestId: 'manifest_test_202',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T07:59:00.000Z',
      effectiveFrom: '2026-07-10T07:59:00.000Z',
      effectiveUntil: '2026-07-10T08:00:00.000Z',
      previousManifestId: 'manifest_test_201',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_past' }, { fixedNow: DEFAULT_FIXED_NOW });

  const gapRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-301',
      cardId: 'card_test_gap',
      manifestId: 'manifest_test_301',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:00:00.000Z',
      effectiveFrom: '2026-07-10T08:00:00.000Z',
      effectiveUntil: '2026-07-10T08:01:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_302',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-302',
      cardId: 'card_test_gap',
      manifestId: 'manifest_test_302',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:06:00.000Z',
      effectiveFrom: '2026-07-10T08:06:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_301',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_gap' }, { fixedNow: DEFAULT_FIXED_NOW, generatedAt: '2026-07-10T08:08:00.000Z' });

  const active = activeRuntime.resolution.resolveLifecycle(activeRuntime.selected);
  const future = futureRuntime.resolution.resolveLifecycle(futureRuntime.selected);
  const past = pastRuntime.resolution.resolveLifecycle(pastRuntime.selected);
  const gap = gapRuntime.resolution.resolveLifecycle(gapRuntime.selected);
  assertResolved(active, activeRuntime.resolution.OUTCOMES.LIFECYCLE_ACTIVE, 'RESOLVED');
  assertResolved(future, futureRuntime.resolution.OUTCOMES.LIFECYCLE_NOT_YET_EFFECTIVE, 'NOT_EFFECTIVE');
  assertResolved(past, pastRuntime.resolution.OUTCOMES.LIFECYCLE_EXPIRED, 'TERMINAL');
  assertResolved(gap, gapRuntime.resolution.OUTCOMES.LIFECYCLE_TEMPORAL_GAP, 'NOT_EFFECTIVE');

  assert.equal(active.resolvedRecordId, 'registry-record-003');
  assert.equal(future.resolvedRecord, null);
  assert.equal(past.resolvedRecord, null);
  assert.equal(gap.resolvedRecord, null);
});

test('defensive overlapping-interval ambiguity is rejected', async () => {
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:01:00.000Z',
      effectiveFrom: '2026-07-10T08:01:00.000Z',
      effectiveUntil: '2026-07-10T08:02:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:02:00.000Z',
      effectiveFrom: '2026-07-10T08:02:00.000Z',
      effectiveUntil: '2026-07-10T08:03:00.000Z',
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: 'manifest_test_003',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-003',
      manifestId: 'manifest_test_003',
      revision: 3,
      registryVersion: 3,
      publishedAt: '2026-07-10T08:03:00.000Z',
      effectiveFrom: '2026-07-10T08:03:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_002',
      supersededByManifestId: null,
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });

  const fabricated = makeFakeSelectedProof(runtime.selected, (proof) => {
    proof.selectedRecords[1].effectiveFrom = '2026-07-10T08:04:00.000Z';
    proof.selectedRecords[1].effectiveUntil = '2026-07-10T08:06:00.000Z';
    proof.lineageOrderedRecords[1].effectiveFrom = '2026-07-10T08:04:00.000Z';
    proof.lineageOrderedRecords[1].effectiveUntil = '2026-07-10T08:06:00.000Z';
    proof.registryOrderedRecords[1].effectiveFrom = '2026-07-10T08:04:00.000Z';
    proof.registryOrderedRecords[1].effectiveUntil = '2026-07-10T08:06:00.000Z';
  });
  const fakeSelector = makeFakeSelectorApi(fabricated);
  const overlapRuntime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    selectorApiStub: fakeSelector,
    fixedNow: DEFAULT_FIXED_NOW,
  });

  assert.equal(overlapRuntime.resolution.isResolvedLifecycleResult(fabricated), false);
  assertUnavailable(overlapRuntime.resolution.resolveLifecycle(fabricated), overlapRuntime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_AMBIGUOUS);
});

test('status interpretation covers active, suspended, revoked, and superseded combinations', async () => {
  const activeRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_active',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_active', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });
  const suspendedRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_suspended',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_SUSPENDED',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_suspended', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });
  const revokedCardRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_revoked',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_REVOKED',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_revoked', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });
  const revokedManifestRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_manifest_revoked',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_REVOKED',
    }),
  ], { cardId: 'card_test_manifest_revoked', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });
  const supersededManifestRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_manifest_superseded',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: '2026-07-10T08:06:00.000Z',
      previousManifestId: null,
      supersededByManifestId: 'manifest_test_002',
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_SUPERSEDED',
    }),
    recordDefinition({
      recordId: 'registry-record-002',
      cardId: 'card_test_manifest_superseded',
      manifestId: 'manifest_test_002',
      revision: 2,
      registryVersion: 2,
      publishedAt: '2026-07-10T08:06:00.000Z',
      effectiveFrom: '2026-07-10T08:06:00.000Z',
      effectiveUntil: null,
      previousManifestId: 'manifest_test_001',
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_manifest_superseded', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW, generatedAt: '2026-07-10T08:08:00.000Z' });

  assertResolved(activeRuntime.resolution.resolveLifecycle(activeRuntime.selected), activeRuntime.resolution.OUTCOMES.LIFECYCLE_ACTIVE, 'RESOLVED');
  assertResolved(suspendedRuntime.resolution.resolveLifecycle(suspendedRuntime.selected), suspendedRuntime.resolution.OUTCOMES.LIFECYCLE_CARD_SUSPENDED, 'RESOLVED');
  assertResolved(revokedCardRuntime.resolution.resolveLifecycle(revokedCardRuntime.selected), revokedCardRuntime.resolution.OUTCOMES.LIFECYCLE_CARD_REVOKED, 'TERMINAL');
  assertResolved(revokedManifestRuntime.resolution.resolveLifecycle(revokedManifestRuntime.selected), revokedManifestRuntime.resolution.OUTCOMES.LIFECYCLE_MANIFEST_REVOKED, 'TERMINAL');
  assertResolved(supersededManifestRuntime.resolution.resolveLifecycle(supersededManifestRuntime.selected), supersededManifestRuntime.resolution.OUTCOMES.LIFECYCLE_MANIFEST_SUPERSEDED, 'TERMINAL');
});

test('unsupported status combinations are unavailable', async () => {
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_unsupported',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_unsupported', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });

  const fabricated = makeFakeSelectedProof(runtime.selected, (proof) => {
    proof.selectedRecords[0].manifestStatus = 'MANIFEST_EXPIRED';
    proof.lineageOrderedRecords[0].manifestStatus = 'MANIFEST_EXPIRED';
    proof.registryOrderedRecords[0].manifestStatus = 'MANIFEST_EXPIRED';
  });
  const fakeSelector = makeFakeSelectorApi(fabricated);
  const fakeRuntime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    selectorApiStub: fakeSelector,
    fixedNow: DEFAULT_FIXED_NOW,
  });

  assertUnavailable(fakeRuntime.resolution.resolveLifecycle(fabricated), fakeRuntime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_STATUS_INVALID);
});

test('partially invalid status pairs are unavailable', async () => {
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_partial_invalid',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_partial_invalid', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });

  const cases = [
    ['CARD_REVOKED', 'MANIFEST_GARBAGE'],
    ['CARD_SUSPENDED', 'MANIFEST_GARBAGE'],
    ['CARD_GARBAGE', 'MANIFEST_REVOKED'],
    ['CARD_GARBAGE', 'MANIFEST_SUPERSEDED'],
  ];

  for (const [cardStatus, manifestStatus] of cases) {
    const fabricated = makeFakeSelectedProof(runtime.selected, (proof) => {
      proof.selectedRecords[0].cardStatus = cardStatus;
      proof.selectedRecords[0].manifestStatus = manifestStatus;
      proof.lineageOrderedRecords[0].cardStatus = cardStatus;
      proof.lineageOrderedRecords[0].manifestStatus = manifestStatus;
      proof.registryOrderedRecords[0].cardStatus = cardStatus;
      proof.registryOrderedRecords[0].manifestStatus = manifestStatus;
    });
    const fakeSelector = makeFakeSelectorApi(fabricated);
    const fakeRuntime = makeResolutionContext({
      includeRecordVerifier: false,
      includeBundleVerifier: false,
      includeSelection: false,
      includeResolution: true,
      selectorApiStub: fakeSelector,
      fixedNow: DEFAULT_FIXED_NOW,
    });

    assertUnavailable(
      fakeRuntime.resolution.resolveLifecycle(fabricated),
      fakeRuntime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_STATUS_INVALID,
    );
  }
});

test('every output remains deeply frozen and keeps presentation and execution false', async () => {
  const activeRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_output', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });
  const futureRuntime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-101',
      cardId: 'card_test_future_output',
      manifestId: 'manifest_test_101',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:06:00.000Z',
      effectiveFrom: '2026-07-10T08:06:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_future_output', manifestId: 'manifest_test_101' }, { fixedNow: DEFAULT_FIXED_NOW, generatedAt: '2026-07-10T08:08:00.000Z' });
  const failureRuntime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    fixedNow: DEFAULT_FIXED_NOW,
  });

  const outputs = [
    activeRuntime.resolution.resolveLifecycle(activeRuntime.selected),
    futureRuntime.resolution.resolveLifecycle(futureRuntime.selected),
    failureRuntime.resolution.resolveLifecycle(Object.freeze({})),
  ];

  outputs.forEach((result) => {
    assert.equal(result.presentationEligible, false);
    assert.equal(result.executionEligible, false);
    assertFrozenDeep(result);
  });
});

test('resolved-result predicate recognizes genuine successes only', async () => {
  const runtime = await makeSignedResolutionRuntime([
    recordDefinition({
      recordId: 'registry-record-001',
      cardId: 'card_test_predicate',
      manifestId: 'manifest_test_001',
      revision: 1,
      registryVersion: 1,
      publishedAt: '2026-07-10T08:05:00.000Z',
      effectiveFrom: '2026-07-10T08:05:00.000Z',
      effectiveUntil: null,
      previousManifestId: null,
      supersededByManifestId: null,
      cardStatus: 'CARD_ACTIVE',
      manifestStatus: 'MANIFEST_CURRENT',
    }),
  ], { cardId: 'card_test_predicate', manifestId: 'manifest_test_001' }, { fixedNow: DEFAULT_FIXED_NOW });

  const resolved = runtime.resolution.resolveLifecycle(runtime.selected);
  const copied = deepFreeze(clone(resolved));
  const fabricated = deepFreeze({ ...resolved });
  const otherRuntime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    fixedNow: DEFAULT_FIXED_NOW,
  });

  assert.equal(runtime.resolution.isResolvedLifecycleResult(resolved), true);
  assert.equal(runtime.resolution.isResolvedLifecycleResult(copied), false);
  assert.equal(runtime.resolution.isResolvedLifecycleResult(fabricated), false);
  assert.equal(otherRuntime.resolution.isResolvedLifecycleResult(realmDeepFrozenClone(otherRuntime.context, resolved)), false);
});

test('forbidden dependency strings are absent from the resolution source', () => {
  for (const forbidden of [
    'IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION',
    'IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION',
    'IX_COIN_CARD_VERIFICATION',
    'IX_EXECUTION',
    'IX_COIN_CARD_PRESENTATION',
    'IX_COIN_CARD_WALLET',
    'IX_COIN_CARD_MANIFEST_VERIFICATION',
  ]) {
    assert.equal(lifecycleResolutionSource.includes(forbidden), false, forbidden);
  }
});

test('hostile input does not throw', async () => {
  const runtime = makeResolutionContext({
    includeRecordVerifier: false,
    includeBundleVerifier: false,
    includeSelection: false,
    includeResolution: true,
    selectorApiStub: Object.freeze({
      isSelectedLifecycleEvidenceResult() {
        return true;
      },
    }),
    fixedNow: DEFAULT_FIXED_NOW,
  });

  const hostile = new Proxy({}, {
    getPrototypeOf() {
      throw new Error('getPrototypeOf trap');
    },
    ownKeys() {
      throw new Error('ownKeys trap');
    },
    getOwnPropertyDescriptor() {
      throw new Error('getOwnPropertyDescriptor trap');
    },
  });

  const result = runtime.resolution.resolveLifecycle(hostile);
  assertUnavailable(result, runtime.resolution.OUTCOMES.LIFECYCLE_RESOLUTION_INPUT_INVALID);
});
