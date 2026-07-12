const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const trustedKeyResolutionPath     = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath        = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerifPath     = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-verification.js');
const lifecycleBundleVerifPath     = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-bundle-verification.js');
const lifecycleSelectionPath       = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-selection.js');
const lifecycleResolutionPath      = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-resolution.js');
const lifecyclePresentationPath    = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-presentation.js');

const trustedKeyResolutionSource  = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource     = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerifSource  = fs.readFileSync(lifecycleRecordVerifPath, 'utf8');
const lifecycleBundleVerifSource  = fs.readFileSync(lifecycleBundleVerifPath, 'utf8');
const lifecycleSelectionSource    = fs.readFileSync(lifecycleSelectionPath, 'utf8');
const lifecycleResolutionSource   = fs.readFileSync(lifecycleResolutionPath, 'utf8');
const lifecyclePresentationSource = fs.readFileSync(lifecyclePresentationPath, 'utf8');

const BUNDLE_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
const DEFAULT_FIXED_NOW     = '2026-07-10T08:05:00.000Z';

/* ----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => { deepFreeze(value[key]); });
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nodeAtob(value) { return Buffer.from(value, 'base64').toString('binary'); }
function nodeBtoa(value) { return Buffer.from(value, 'binary').toString('base64'); }

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function makeFixedDateClass(isoString) {
  const RealDate = Date;
  const fixedTime = RealDate.parse(isoString);
  return class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) { super(isoString); } else { super(...args); }
    }
    static now() { return fixedTime; }
    static parse(v) { return RealDate.parse(v); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
}

function realmClone(context, value) {
  return vm.runInNewContext(`(${JSON.stringify(value)})`, context);
}

function trustedKeyRecord(keyId, publicKey) {
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
    cardId: spec.cardId || 'card_presentation_test',
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
      keyId: 'presentation-test-key',
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

async function signRecord(runtime, keyPair, record) {
  const canonical = runtime.registry.canonicalizeJson(realmClone(runtime.context, signaturePayload(record)));
  const domainBytes = Buffer.from(runtime.recordVerifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8');
  const payloadBytes = Buffer.from(canonical, 'utf8');
  const combined = Buffer.concat([domainBytes, Buffer.from([0]), payloadBytes]);
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, keyPair.privateKey, combined);
  record.signature.value = toBase64Url(sig);
  return record;
}

function makePresentationContext(options = {}) {
  const context = {
    TextEncoder, Promise,
    window: {},
    atob: nodeAtob,
    btoa: nodeBtoa,
  };
  context.globalThis = context;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = options.crypto || webcrypto;

  if (options.fixedNow) {
    const fixedDate = makeFixedDateClass(options.fixedNow);
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
  vm.runInNewContext(lifecycleRecordVerifSource, context, { filename: lifecycleRecordVerifPath });
  vm.runInNewContext(lifecycleBundleVerifSource, context, { filename: lifecycleBundleVerifPath });
  vm.runInNewContext(lifecycleSelectionSource, context, { filename: lifecycleSelectionPath });

  if (options.resolutionApiStub !== undefined) {
    if (options.resolutionApiStub !== null) {
      Object.defineProperty(context.window, 'IX_COIN_CARD_LIFECYCLE_RESOLUTION', {
        value: options.resolutionApiStub,
        writable: false, enumerable: true, configurable: false,
      });
    }
  } else {
    vm.runInNewContext(lifecycleResolutionSource, context, { filename: lifecycleResolutionPath });
  }

  vm.runInNewContext(lifecyclePresentationSource, context, { filename: lifecyclePresentationPath });

  return {
    context,
    registry:     context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector:     context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
    resolution:   context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
    presentation: context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
  };
}

async function makeSignedPresentationRuntime(recordSpecs, request, options = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const fixedNow = options.fixedNow || DEFAULT_FIXED_NOW;

  const trustedPublicKeys = {
    'presentation-test-key': trustedKeyRecord('presentation-test-key', publicKey),
  };
  const runtime = makePresentationContext({ trustedPublicKeys, fixedNow });

  const records = recordSpecs.map((spec) => recordDefinition(spec));
  for (const record of records) {
    await signRecord(runtime, keyPair, record);
  }

  const generatedAt = options.generatedAt || fixedNow;

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: Math.max(...records.map((r) => r.registryVersion)),
    generatedAt,
    entries: records,
  });

  const bundleInput = realmClone(runtime.context, bundle);
  const proof    = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  const selected = runtime.selector.selectLifecycleEvidence(proof, request || { cardId: records[0].cardId });
  const resolved = runtime.resolution.resolveLifecycle(selected);

  return { ...runtime, keyPair, publicKey, proof, selected, resolved };
}

/* A minimal active record spec: CARD_ACTIVE + MANIFEST_CURRENT, effective now. */
function activeRecordSpec() {
  return {
    registryVersion: 1,
    recordId: 'rec-presentation-active-001',
    publishedAt: '2026-01-01T00:00:00.000Z',
    manifestId: 'manifest-presentation-001',
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
  };
}

/* ================================================================
 * Tests
 * ================================================================ */

/* ----------------------------------------------------------------
 * Module surface
 * ---------------------------------------------------------------- */
test('IX_COIN_CARD_LIFECYCLE_PRESENTATION is exposed on window and frozen', () => {
  const runtime = makePresentationContext();
  const api = runtime.presentation;
  assert.ok(api, 'IX_COIN_CARD_LIFECYCLE_PRESENTATION must be defined');
  assert.ok(Object.isFrozen(api), 'API object must be frozen');
  assert.equal(typeof api.promotePresentation, 'function');
  assert.equal(typeof api.isPromotedPresentationResult, 'function');
  assert.ok(api.TOP_LEVEL_FACTS, 'TOP_LEVEL_FACTS must be exposed');
  assert.ok(api.OUTCOMES, 'OUTCOMES must be exposed');
});

test('TOP_LEVEL_FACTS vocabulary is complete and frozen', () => {
  const runtime = makePresentationContext();
  const { TOP_LEVEL_FACTS } = runtime.presentation;
  assert.ok(Object.isFrozen(TOP_LEVEL_FACTS));
  assert.equal(TOP_LEVEL_FACTS.PRESENTATION_ELIGIBLE, 'PRESENTATION_ELIGIBLE');
  assert.equal(TOP_LEVEL_FACTS.PRESENTATION_BLOCKED, 'PRESENTATION_BLOCKED');
  assert.equal(Object.keys(TOP_LEVEL_FACTS).length, 2);
});

test('OUTCOMES vocabulary is complete and frozen', () => {
  const runtime = makePresentationContext();
  const { OUTCOMES } = runtime.presentation;
  assert.ok(Object.isFrozen(OUTCOMES));
  assert.equal(OUTCOMES.PRESENTATION_PROMOTED,              'PRESENTATION_PROMOTED');
  assert.equal(OUTCOMES.PRESENTATION_BLOCKED_SUSPENDED,     'PRESENTATION_BLOCKED_SUSPENDED');
  assert.equal(OUTCOMES.PRESENTATION_BLOCKED_TERMINAL,      'PRESENTATION_BLOCKED_TERMINAL');
  assert.equal(OUTCOMES.PRESENTATION_BLOCKED_NOT_EFFECTIVE, 'PRESENTATION_BLOCKED_NOT_EFFECTIVE');
  assert.equal(OUTCOMES.PRESENTATION_BLOCKED_UNAVAILABLE,   'PRESENTATION_BLOCKED_UNAVAILABLE');
  assert.equal(OUTCOMES.PRESENTATION_AUTHORITY_UNAVAILABLE, 'PRESENTATION_AUTHORITY_UNAVAILABLE');
  assert.equal(OUTCOMES.PRESENTATION_INPUT_INVALID,         'PRESENTATION_INPUT_INVALID');
  assert.equal(Object.keys(OUTCOMES).length, 7);
});

/* ----------------------------------------------------------------
 * Authority gate — resolution API absent
 * ---------------------------------------------------------------- */
test('promotePresentation blocks when IX_COIN_CARD_LIFECYCLE_RESOLUTION is absent', () => {
  const runtime = makePresentationContext({ resolutionApiStub: null });
  const result = runtime.presentation.promotePresentation(null);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_AUTHORITY_UNAVAILABLE');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
});

test('promotePresentation blocks when resolution API has no isResolvedLifecycleResult', () => {
  const runtime = makePresentationContext({ resolutionApiStub: Object.freeze({ resolveLifecycle: () => {} }) });
  const result = runtime.presentation.promotePresentation(null);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_AUTHORITY_UNAVAILABLE');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
});

test('promotePresentation blocks when resolution API isResolvedLifecycleResult throws', () => {
  const stub = Object.freeze({
    isResolvedLifecycleResult() { throw new Error('deliberately throws'); },
  });
  const runtime = makePresentationContext({ resolutionApiStub: stub });
  const result = runtime.presentation.promotePresentation({});
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_AUTHORITY_UNAVAILABLE');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
});

/* ----------------------------------------------------------------
 * Input validity gate — not a genuine resolved result
 * ---------------------------------------------------------------- */
test('promotePresentation blocks null input', () => {
  const runtime = makePresentationContext();
  const result = runtime.presentation.promotePresentation(null);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_INPUT_INVALID');
  assert.equal(result.presentationEligible, false);
});

test('promotePresentation blocks undefined input', () => {
  const runtime = makePresentationContext();
  const result = runtime.presentation.promotePresentation(undefined);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_INPUT_INVALID');
  assert.equal(result.presentationEligible, false);
});

test('promotePresentation blocks fabricated object that mimics resolved shape', () => {
  const runtime = makePresentationContext();
  /* A shape-alike object that was never produced by resolveLifecycle() */
  const fabricated = Object.freeze({
    fact: 'RESOLVED',
    outcome: 'LIFECYCLE_ACTIVE',
    operationallyResolved: true,
    presentationEligible: false,
    executionEligible: false,
    resolutionTime: DEFAULT_FIXED_NOW,
    registryId: 'implicitex-production',
    registryVersion: 1,
    cardId: 'card_presentation_test',
    requestedManifestId: null,
    resolvedRecord: null,
    resolvedRecordId: null,
    resolvedManifestId: null,
    resolvedRevision: null,
    temporalState: 'EFFECTIVE',
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    supportingLineage: null,
    reason: null,
  });
  const result = runtime.presentation.promotePresentation(fabricated);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_INPUT_INVALID');
  assert.equal(result.presentationEligible, false);
});

/* ----------------------------------------------------------------
 * LIFECYCLE_ACTIVE → the only promoted outcome
 * ---------------------------------------------------------------- */
test('LIFECYCLE_ACTIVE resolves to presentationEligible: true', async () => {
  const runtime = await makeSignedPresentationRuntime([activeRecordSpec()]);
  assert.equal(runtime.resolved.outcome, 'LIFECYCLE_ACTIVE', 'precondition: resolved to LIFECYCLE_ACTIVE');

  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_ELIGIBLE');
  assert.equal(result.outcome, 'PRESENTATION_PROMOTED');
  assert.equal(result.presentationEligible, true);
  assert.equal(result.executionEligible, false);
  assert.equal(result.resolvedFact, 'RESOLVED');
  assert.equal(result.resolvedOutcome, 'LIFECYCLE_ACTIVE');
});

test('promoted result is frozen', async () => {
  const runtime = await makeSignedPresentationRuntime([activeRecordSpec()]);
  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.ok(Object.isFrozen(result));
});

test('promoted result is a genuine isPromotedPresentationResult', async () => {
  const runtime = await makeSignedPresentationRuntime([activeRecordSpec()]);
  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(runtime.presentation.isPromotedPresentationResult(result), true);
});

test('blocked result is NOT a genuine isPromotedPresentationResult', async () => {
  const runtime = await makeSignedPresentationRuntime([activeRecordSpec()]);
  /* fabricated input → blocked result */
  const blocked = runtime.presentation.promotePresentation(null);
  assert.equal(runtime.presentation.isPromotedPresentationResult(blocked), false);
});

test('executionEligible is always false — even for LIFECYCLE_ACTIVE', async () => {
  const runtime = await makeSignedPresentationRuntime([activeRecordSpec()]);
  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.presentationEligible, true);
  assert.equal(result.executionEligible, false);
});

/* ----------------------------------------------------------------
 * LIFECYCLE_CARD_SUSPENDED → blocked, not promoted
 * ---------------------------------------------------------------- */
test('LIFECYCLE_CARD_SUSPENDED produces PRESENTATION_BLOCKED_SUSPENDED', async () => {
  const spec = {
    ...activeRecordSpec(),
    cardStatus: 'CARD_SUSPENDED',
    manifestStatus: 'MANIFEST_CURRENT',
    recordId: 'rec-suspended-001',
    manifestId: 'manifest-suspended-001',
  };
  const runtime = await makeSignedPresentationRuntime([spec]);
  assert.equal(runtime.resolved.outcome, 'LIFECYCLE_CARD_SUSPENDED', 'precondition');

  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_BLOCKED_SUSPENDED');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
  assert.equal(result.resolvedOutcome, 'LIFECYCLE_CARD_SUSPENDED');
});

/* ----------------------------------------------------------------
 * TERMINAL outcomes → blocked
 * ---------------------------------------------------------------- */
test('LIFECYCLE_CARD_REVOKED produces PRESENTATION_BLOCKED_TERMINAL', async () => {
  const spec = {
    ...activeRecordSpec(),
    cardStatus: 'CARD_REVOKED',
    manifestStatus: 'MANIFEST_CURRENT',
    recordId: 'rec-revoked-001',
    manifestId: 'manifest-revoked-001',
  };
  const runtime = await makeSignedPresentationRuntime([spec]);
  assert.equal(runtime.resolved.outcome, 'LIFECYCLE_CARD_REVOKED', 'precondition');

  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_BLOCKED_TERMINAL');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.resolvedOutcome, 'LIFECYCLE_CARD_REVOKED');
});

test('LIFECYCLE_MANIFEST_REVOKED produces PRESENTATION_BLOCKED_TERMINAL', async () => {
  const spec = {
    ...activeRecordSpec(),
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_REVOKED',
    recordId: 'rec-mrevoked-001',
    manifestId: 'manifest-mrevoked-001',
  };
  const runtime = await makeSignedPresentationRuntime([spec]);
  assert.equal(runtime.resolved.outcome, 'LIFECYCLE_MANIFEST_REVOKED', 'precondition');

  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_BLOCKED_TERMINAL');
  assert.equal(result.presentationEligible, false);
});

test('LIFECYCLE_MANIFEST_SUPERSEDED produces PRESENTATION_BLOCKED_TERMINAL', async () => {
  /* MANIFEST_SUPERSEDED requires a two-record chain requested by manifest ID.
   * The superseded record's effective window must contain the resolution time,
   * AND the bundle's generatedAt must be after all records' publishedAt. */
  const fixedNow    = '2026-07-10T08:05:00.000Z';
  const generatedAt = '2026-07-10T08:08:00.000Z'; // after both records' publishedAt
  const specA = {
    registryVersion: 1,
    recordId: 'rec-superseded-A',
    publishedAt: '2026-07-10T08:05:00.000Z',
    manifestId: 'manifest-superseded-A',
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_SUPERSEDED',
    effectiveFrom: '2026-07-10T08:05:00.000Z',
    effectiveUntil: '2026-07-10T08:06:00.000Z',
    supersededByManifestId: 'manifest-superseded-B',
  };
  const specB = {
    registryVersion: 2,
    recordId: 'rec-superseded-B',
    publishedAt: '2026-07-10T08:06:00.000Z',
    manifestId: 'manifest-superseded-B',
    revision: 2,
    previousManifestId: 'manifest-superseded-A',
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-07-10T08:06:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
  };
  const request = { cardId: 'card_presentation_test', manifestId: 'manifest-superseded-A' };
  const runtime = await makeSignedPresentationRuntime([specA, specB], request, { fixedNow, generatedAt });
  assert.equal(runtime.resolved.outcome, 'LIFECYCLE_MANIFEST_SUPERSEDED', 'precondition');

  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_BLOCKED_TERMINAL');
  assert.equal(result.presentationEligible, false);
});

test('LIFECYCLE_EXPIRED produces PRESENTATION_BLOCKED_TERMINAL', async () => {
  /* The record's window ended in the past relative to the fixed clock. */
  const spec = {
    ...activeRecordSpec(),
    effectiveFrom: '2025-01-01T00:00:00.000Z',
    effectiveUntil: '2025-06-01T00:00:00.000Z',
    recordId: 'rec-expired-001',
    manifestId: 'manifest-expired-001',
  };
  const runtime = await makeSignedPresentationRuntime([spec]);
  assert.equal(runtime.resolved.outcome, 'LIFECYCLE_EXPIRED', 'precondition');

  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_BLOCKED_TERMINAL');
  assert.equal(result.presentationEligible, false);
});

/* ----------------------------------------------------------------
 * NOT_EFFECTIVE outcomes → blocked
 * ---------------------------------------------------------------- */
test('LIFECYCLE_NOT_YET_EFFECTIVE produces PRESENTATION_BLOCKED_NOT_EFFECTIVE', async () => {
  const spec = {
    ...activeRecordSpec(),
    effectiveFrom: '2027-01-01T00:00:00.000Z',
    effectiveUntil: null,
    recordId: 'rec-future-001',
    manifestId: 'manifest-future-001',
  };
  const runtime = await makeSignedPresentationRuntime([spec]);
  assert.equal(runtime.resolved.outcome, 'LIFECYCLE_NOT_YET_EFFECTIVE', 'precondition');

  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_BLOCKED_NOT_EFFECTIVE');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.resolvedOutcome, 'LIFECYCLE_NOT_YET_EFFECTIVE');
});

/* ----------------------------------------------------------------
 * UNAVAILABLE outcomes → blocked
 * ---------------------------------------------------------------- */
test('UNAVAILABLE lifecycle result produces PRESENTATION_BLOCKED_UNAVAILABLE', () => {
  /* Inject a resolution API stub that returns a fake "genuine" UNAVAILABLE result. */
  const fakeUnavailableResult = Object.freeze({
    fact: 'UNAVAILABLE',
    outcome: 'LIFECYCLE_RESOLUTION_INPUT_INVALID',
  });
  const stub = Object.freeze({
    isResolvedLifecycleResult(value) { return value === fakeUnavailableResult; },
  });
  const runtime = makePresentationContext({ resolutionApiStub: stub });

  const result = runtime.presentation.promotePresentation(fakeUnavailableResult);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.outcome, 'PRESENTATION_BLOCKED_UNAVAILABLE');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.resolvedFact, 'UNAVAILABLE');
  assert.equal(result.resolvedOutcome, 'LIFECYCLE_RESOLUTION_INPUT_INVALID');
});

/* ----------------------------------------------------------------
 * isPromotedPresentationResult brand checks
 * ---------------------------------------------------------------- */
test('isPromotedPresentationResult returns false for null', () => {
  const runtime = makePresentationContext();
  assert.equal(runtime.presentation.isPromotedPresentationResult(null), false);
});

test('isPromotedPresentationResult returns false for plain objects', () => {
  const runtime = makePresentationContext();
  assert.equal(runtime.presentation.isPromotedPresentationResult({}), false);
  assert.equal(runtime.presentation.isPromotedPresentationResult({ presentationEligible: true }), false);
});

test('isPromotedPresentationResult returns false for blocked results', () => {
  const runtime = makePresentationContext();
  const blocked = runtime.presentation.promotePresentation(null);
  assert.equal(runtime.presentation.isPromotedPresentationResult(blocked), false);
});

test('isPromotedPresentationResult from different VM context cannot be forged', async () => {
  /* Two separate VM contexts each have their own PROMOTION_RESULTS WeakSet. */
  const runtimeA = await makeSignedPresentationRuntime([activeRecordSpec()]);
  const runtimeB = await makeSignedPresentationRuntime([{
    ...activeRecordSpec(),
    cardId: 'card_b',
    recordId: 'rec-b-001',
    manifestId: 'manifest-b-001',
  }], { cardId: 'card_b' });

  const promotedA = runtimeA.presentation.promotePresentation(runtimeA.resolved);
  assert.equal(runtimeA.presentation.isPromotedPresentationResult(promotedA), true);
  /* Context B cannot recognize a result from context A. */
  assert.equal(runtimeB.presentation.isPromotedPresentationResult(promotedA), false);
});

/* ----------------------------------------------------------------
 * Result shape invariants
 * ---------------------------------------------------------------- */
test('all blocked results carry executionEligible: false', () => {
  const runtime = makePresentationContext();
  const cases = [null, undefined, {}, Object.freeze({ fact: 'RESOLVED', outcome: 'LIFECYCLE_ACTIVE' })];
  for (const input of cases) {
    const result = runtime.presentation.promotePresentation(input);
    assert.equal(result.executionEligible, false, `executionEligible must be false for input: ${JSON.stringify(input)}`);
  }
});

test('all results are frozen objects', () => {
  const runtime = makePresentationContext();
  const cases = [null, undefined, {}];
  for (const input of cases) {
    const result = runtime.presentation.promotePresentation(input);
    assert.ok(typeof result === 'object' && result !== null);
    assert.ok(Object.isFrozen(result));
  }
});

test('promoted result exposes resolvedFact and resolvedOutcome from the lifecycle result', async () => {
  const runtime = await makeSignedPresentationRuntime([activeRecordSpec()]);
  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.resolvedFact, 'RESOLVED');
  assert.equal(result.resolvedOutcome, 'LIFECYCLE_ACTIVE');
});

test('blocked results preserve resolvedFact and resolvedOutcome when available', async () => {
  const spec = {
    ...activeRecordSpec(),
    cardStatus: 'CARD_REVOKED',
    recordId: 'rec-revoked-shape-001',
    manifestId: 'manifest-revoked-shape-001',
  };
  const runtime = await makeSignedPresentationRuntime([spec]);
  const result = runtime.presentation.promotePresentation(runtime.resolved);
  assert.equal(result.fact, 'PRESENTATION_BLOCKED');
  assert.equal(result.resolvedFact, 'TERMINAL');
  assert.equal(result.resolvedOutcome, 'LIFECYCLE_CARD_REVOKED');
});
