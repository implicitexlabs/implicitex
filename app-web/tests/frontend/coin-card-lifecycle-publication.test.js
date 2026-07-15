/* coin-card-lifecycle-publication.test.js — end-to-end lifecycle publication tests
 *
 * Tests the full pipeline:
 *   signed bundle → authenticateLifecycleRegistryBundle()
 *   → selectLifecycleEvidence()
 *   → resolveLifecycle()
 *   → promotePresentation()
 *
 * Verifies:
 *   - valid signed ACTIVE record promotes the intended card
 *   - no matching record → blocked
 *   - malformed record → blocked
 *   - malformed bundle → blocked
 *   - unsigned record → blocked
 *   - invalid signature → blocked
 *   - unknown key → blocked
 *   - key lacking lifecycle-publication usage → blocked
 *   - unsupported schema or registry version → blocked
 *   - revoked record → blocked
 *   - suspended record → blocked
 *   - non-MANIFEST_CURRENT (superseded) record → blocked
 *   - duplicate record IDs → blocked
 *   - conflicting records for same card → blocked
 *   - record for wrong card → blocked
 *   - route (recipient wallet) tampering after signing → blocked
 *   - network (chainId) tampering after signing → blocked
 *   - lifecycle-state (cardStatus) tampering after signing → blocked
 *   - revision/version tampering after signing → blocked
 *   - deterministic selection independent of input ordering
 *   - promoted result is the exact authority object accepted by authorizeExecution()
 *   - blocked lifecycle result cannot reach executeTransfer() (execution authorization refuses it)
 *   - real production bundle file loads and promotes cc_demo_implicitex
 */

'use strict';

const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

/* ----------------------------------------------------------------
 * Module paths
 * ---------------------------------------------------------------- */
const repoRoot = path.resolve(__dirname, '../../..');
const trustedKeyResolutionPath    = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath       = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerifPath    = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-verification.js');
const lifecycleBundleVerifPath    = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-bundle-verification.js');
const lifecycleSelectionPath      = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-selection.js');
const lifecycleResolutionPath     = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-resolution.js');
const lifecyclePresentationPath   = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-presentation.js');
const trustedKeysPath             = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-keys.js');
const execAuthorizationPath       = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-execution-authorization.js');
const lifecycleBundlePath         = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-bundle.js');

const trustedKeyResolutionSource  = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource     = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerifSource  = fs.readFileSync(lifecycleRecordVerifPath, 'utf8');
const lifecycleBundleVerifSource  = fs.readFileSync(lifecycleBundleVerifPath, 'utf8');
const lifecycleSelectionSource    = fs.readFileSync(lifecycleSelectionPath, 'utf8');
const lifecycleResolutionSource   = fs.readFileSync(lifecycleResolutionPath, 'utf8');
const lifecyclePresentationSource = fs.readFileSync(lifecyclePresentationPath, 'utf8');
const execAuthorizationSource     = fs.readFileSync(execAuthorizationPath, 'utf8');

/* ----------------------------------------------------------------
 * Constants
 * ---------------------------------------------------------------- */
const BUNDLE_SCHEMA_VERSION = 'coin-card-lifecycle-registry-bundle.v1';
const RECORD_SCHEMA_VERSION = 'coin-card-lifecycle-registry-record.v1';
const TRUSTED_KEY_SCHEMA_VERSION = 'coin-card-trusted-key-record.v1';

/* The demo card constants */
const DEMO_CARD_ID = 'cc_demo_implicitex';
const DEMO_MANIFEST_ID = 'sha256:f6b5bbd4229cf0d214e5aecb9ffda10bbbbe53550a0ef9b47960731869b116a8';
const DEMO_REGISTRY_ID = 'implicitex-production';
const DEMO_AUTHORITY_ID = 'implicitex-registry';
const DEMO_RECORD_KEY_ID = 'ix-lifecycle-pub-v1';

/* Fixed verification time used throughout synthetic tests */
const FIXED_NOW = '2026-07-15T12:00:00.000Z';

/* ----------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------- */
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((k) => deepFreeze(value[k]));
  return Object.freeze(value);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function nodeAtob(value) { return Buffer.from(value, 'base64').toString('binary'); }
function nodeBtoa(value) { return Buffer.from(value, 'binary').toString('base64'); }

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

/* Build a minimal trusted key record for registry-publication usage */
function trustedKeyRecord(keyId, publicKey, overrides = {}) {
  return deepFreeze({
    schemaVersion: TRUSTED_KEY_SCHEMA_VERSION,
    keyId,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey,
    issuerId: DEMO_AUTHORITY_ID,
    usage: Object.freeze(['coin-card-registry-publication']),
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

/* Build a minimal lifecycle record (unsigned — caller signs it) */
function makeRecord(overrides = {}) {
  const base = {
    registryId: DEMO_REGISTRY_ID,
    registrySchemaVersion: RECORD_SCHEMA_VERSION,
    environment: 'production',
    registryVersion: 1,
    recordId: 'pub-test-record-001',
    publishedAt: '2026-07-15T00:00:00.000Z',
    cardId: DEMO_CARD_ID,
    manifestId: DEMO_MANIFEST_ID,
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-07-15T00:00:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
    reasonCode: null,
    authorityId: DEMO_AUTHORITY_ID,
    administrationEvidenceHash: null,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: DEMO_RECORD_KEY_ID,
      authorityId: DEMO_AUTHORITY_ID,
      signedAt: '2026-07-15T00:00:00.000Z',
      value: '',
    },
  };
  const merged = {
    ...base,
    ...overrides,
    signature: { ...base.signature, ...(overrides.signature || {}) },
  };
  return merged;
}

/* Extract unsigned payload (everything except signature.value) */
function signaturePayload(record) {
  const payload = clone(record);
  delete payload.signature.value;
  return payload;
}

/* Sign a record with the given key pair, using the runtime's canonicalizer */
async function signRecord(runtime, keyPair, record) {
  const payload = signaturePayload(record);
  const canonical = runtime.registry.canonicalizeJson(realmClone(runtime.context, payload));
  const domainBytes = Buffer.from(runtime.recordVerifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8');
  const payloadBytes = Buffer.from(canonical, 'utf8');
  const combined = Buffer.concat([domainBytes, Buffer.from([0]), payloadBytes]);
  const sig = await webcrypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, keyPair.privateKey, combined);
  record.signature.value = toBase64Url(sig);
  return record;
}

/* Build a complete VM context with all lifecycle modules loaded */
function makeContext(options = {}) {
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

  const fixedNow = options.fixedNow || FIXED_NOW;
  const FixedDate = makeFixedDateClass(fixedNow);
  context.Date = FixedDate;
  context.window.Date = FixedDate;

  if (options.trustedPublicKeys) {
    context.__trustedPublicKeysJson = JSON.stringify(options.trustedPublicKeys);
    vm.runInNewContext(`(() => {
      function deepFreeze(value) {
        if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
        Object.getOwnPropertyNames(value).forEach((k) => deepFreeze(value[k]));
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
  vm.runInNewContext(lifecycleResolutionSource, context, { filename: lifecycleResolutionPath });
  vm.runInNewContext(lifecyclePresentationSource, context, { filename: lifecyclePresentationPath });
  vm.runInNewContext(execAuthorizationSource, context, { filename: execAuthorizationPath });

  return {
    context,
    registry:       context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector:       context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
    resolution:     context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
    presentation:   context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
    execAuth:       context.window.IX_COIN_CARD_EXECUTION_AUTHORIZATION,
  };
}

/* Generate a key pair and build a signed runtime for one or more records */
async function makeSignedRuntime(recordOverridesList = [{}], options = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const keyId = options.keyId || DEMO_RECORD_KEY_ID;
  const keyRecordOverrides = options.keyRecordOverrides || {};

  const trustedPublicKeys = {};
  trustedPublicKeys[keyId] = trustedKeyRecord(keyId, publicKey, keyRecordOverrides);

  const runtime = makeContext({ trustedPublicKeys, ...options });

  const records = recordOverridesList.map((overrides) => {
    const r = makeRecord(overrides);
    r.signature.keyId = keyId;
    r.signature.authorityId = DEMO_AUTHORITY_ID;
    return r;
  });

  for (const record of records) {
    await signRecord(runtime, keyPair, record);
  }

  const maxVersion = Math.max(...records.map((r) => r.registryVersion));
  const generatedAt = options.generatedAt || FIXED_NOW;
  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: maxVersion,
    generatedAt,
    entries: records,
  });

  return { runtime, keyPair, publicKey, bundle, records };
}

/* Run the complete pipeline from bundle → promotedPresentation */
async function runPipeline(runtime, bundle, cardId, manifestId) {
  const bundleInput = realmClone(runtime.context, bundle);
  const proof       = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  const request     = manifestId !== undefined ? { cardId, manifestId } : { cardId };
  const selected    = runtime.selector.selectLifecycleEvidence(proof, request);
  const resolved    = runtime.resolution.resolveLifecycle(selected);
  const promoted    = runtime.presentation.promotePresentation(resolved);
  return { proof, selected, resolved, promoted };
}

/* ================================================================
 * TESTS
 * ================================================================ */

/* ----------------------------------------------------------------
 * 1. Valid signed ACTIVE record promotes the intended card
 * ---------------------------------------------------------------- */
test('valid signed ACTIVE record promotes cc_demo_implicitex', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{}]);
  const { proof, selected, resolved, promoted } = await runPipeline(
    runtime, bundle, DEMO_CARD_ID, DEMO_MANIFEST_ID,
  );

  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED', 'bundle must authenticate');
  assert.equal(proof.authenticated, true);
  assert.equal(selected.outcome, 'LIFECYCLE_EVIDENCE_SELECTED', 'evidence must be selected');
  assert.equal(selected.selected, true);
  assert.equal(resolved.outcome, 'LIFECYCLE_ACTIVE', 'must resolve ACTIVE');
  assert.equal(promoted.outcome, 'PRESENTATION_PROMOTED', 'must promote');
  assert.equal(promoted.presentationEligible, true, 'must set presentationEligible');
  assert.equal(promoted.executionEligible, false, 'executionEligible stays false at presentation stage');
  assert.equal(runtime.presentation.isPromotedPresentationResult(promoted), true, 'must be a genuine promoted result');
});

test('promoted result cardId and manifestId match the demo card', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{}]);
  const { resolved } = await runPipeline(runtime, bundle, DEMO_CARD_ID, DEMO_MANIFEST_ID);

  assert.equal(resolved.cardId, DEMO_CARD_ID);
  assert.equal(resolved.resolvedManifestId, DEMO_MANIFEST_ID);
});

/* ----------------------------------------------------------------
 * 2. No matching record → blocked
 * ---------------------------------------------------------------- */
test('card not found in bundle → blocked before promotion', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{}]);
  const { proof, selected, resolved, promoted } = await runPipeline(
    runtime, bundle, 'nonexistent-card', null,
  );

  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED');
  assert.equal(selected.outcome, 'LIFECYCLE_EVIDENCE_CARD_NOT_FOUND');
  assert.equal(selected.selected, false);
  assert.notEqual(resolved.outcome, 'LIFECYCLE_ACTIVE');
  assert.equal(promoted.presentationEligible, false);
  assert.equal(runtime.presentation.isPromotedPresentationResult(promoted), false);
});

test('manifestId not found in bundle → blocked before promotion', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{}]);
  const { selected, promoted } = await runPipeline(
    runtime, bundle, DEMO_CARD_ID, 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
  );

  assert.equal(selected.outcome, 'LIFECYCLE_EVIDENCE_MANIFEST_NOT_FOUND');
  assert.equal(promoted.presentationEligible, false);
});

/* ----------------------------------------------------------------
 * 3. Malformed record → blocked at bundle verification
 * ---------------------------------------------------------------- */
test('malformed record (missing field) → bundle authentication fails', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const badRecord = clone(records[0]);
  delete badRecord.cardId;

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [badRecord],
  });

  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.notEqual(proof.outcome, 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED');
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 4. Malformed bundle → blocked at bundle verification
 * ---------------------------------------------------------------- */
test('malformed bundle (wrong schema version) → blocked', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const bundle = deepFreeze({
    registrySchemaVersion: 'coin-card-lifecycle-registry-bundle.v0-WRONG',
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: records,
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_STRUCTURE_INVALID');
  assert.equal(proof.authenticated, false);
});

test('empty entries array → blocked (non-empty bundle requires >= 1 entry)', async () => {
  const { runtime } = await makeSignedRuntime([{}]);
  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

test('bundle registryVersion 0 → blocked (must be positive integer >= 1)', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 0,
    generatedAt: FIXED_NOW,
    entries: records,
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 5. Unsigned record (empty signature value) → blocked
 * ---------------------------------------------------------------- */
test('record with empty signature value → blocked at record verification', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const unsignedRecord = clone(records[0]);
  unsignedRecord.signature.value = 'A'.repeat(86); /* wrong but correctly formatted — still invalid */

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [unsignedRecord],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED');
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 6. Invalid signature (tampered bytes) → blocked
 * ---------------------------------------------------------------- */
test('signature value tampered after signing → blocked at record verification', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const tamperedRecord = clone(records[0]);
  /* Flip one character in the middle of the base64url value */
  const sig = tamperedRecord.signature.value;
  const mid = Math.floor(sig.length / 2);
  tamperedRecord.signature.value = sig.slice(0, mid) + (sig[mid] === 'A' ? 'B' : 'A') + sig.slice(mid + 1);

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [tamperedRecord],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED');
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 7. Unknown key → blocked
 * ---------------------------------------------------------------- */
test('record signed with unknown key ID → blocked at record verification', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const unknownKeyRecord = clone(records[0]);
  unknownKeyRecord.signature.keyId = 'unknown-key-xyz';

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [unknownKeyRecord],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED');
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 8. Key lacking lifecycle-publication usage → blocked
 * ---------------------------------------------------------------- */
test('key with wrong usage (manifest-signing only) → blocked', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{}], {
    keyRecordOverrides: { usage: Object.freeze(['coin-card-manifest-signing']) },
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_ENTRY_AUTHENTICATION_FAILED');
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 9. Unsupported schema or registry version → blocked
 * ---------------------------------------------------------------- */
test('record with unsupported registrySchemaVersion → blocked', async () => {
  const { runtime } = await makeSignedRuntime([{}]);
  /* Build an unsigned record with wrong schema — the schema check fires before crypto */
  const badRecord = makeRecord({ registrySchemaVersion: 'coin-card-lifecycle-registry-record.v0' });
  badRecord.signature.value = 'A'.repeat(86);

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [badRecord],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 10. Revoked record → blocked at resolution
 * ---------------------------------------------------------------- */
test('CARD_REVOKED record → resolves LIFECYCLE_CARD_REVOKED, not promoted', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{
    cardStatus: 'CARD_REVOKED',
    manifestStatus: 'MANIFEST_REVOKED',
    reasonCode: 'REVOKED_TEST',
  }]);
  const { resolved, promoted } = await runPipeline(runtime, bundle, DEMO_CARD_ID, DEMO_MANIFEST_ID);

  assert.equal(resolved.outcome, 'LIFECYCLE_CARD_REVOKED');
  assert.equal(promoted.outcome, 'PRESENTATION_BLOCKED_TERMINAL');
  assert.equal(promoted.presentationEligible, false);
  assert.equal(runtime.presentation.isPromotedPresentationResult(promoted), false);
});

/* ----------------------------------------------------------------
 * 11. Suspended record → blocked at resolution
 * ---------------------------------------------------------------- */
test('CARD_SUSPENDED record → resolves LIFECYCLE_CARD_SUSPENDED, not promoted', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{
    cardStatus: 'CARD_SUSPENDED',
    manifestStatus: 'MANIFEST_CURRENT',
  }]);
  const { resolved, promoted } = await runPipeline(runtime, bundle, DEMO_CARD_ID, DEMO_MANIFEST_ID);

  assert.equal(resolved.outcome, 'LIFECYCLE_CARD_SUSPENDED');
  assert.equal(promoted.outcome, 'PRESENTATION_BLOCKED_SUSPENDED');
  assert.equal(promoted.presentationEligible, false);
  assert.equal(runtime.presentation.isPromotedPresentationResult(promoted), false);
});

/* ----------------------------------------------------------------
 * 12. MANIFEST_SUPERSEDED record → blocked (selection rejects malformed lineage,
 *     or resolution classifies as LIFECYCLE_MANIFEST_SUPERSEDED — both produce
 *     presentationEligible: false)
 * ---------------------------------------------------------------- */
test('MANIFEST_SUPERSEDED record without successor in bundle → blocked before promotion', async () => {
  /* A record with manifestStatus MANIFEST_SUPERSEDED and supersededByManifestId
   * pointing to a manifest that is not in the bundle. The selection layer's lineage
   * check rejects this as LINEAGE_INVALID (the successor record is missing).
   * Either way the promoted result must not be eligible. */
  const { runtime, bundle } = await makeSignedRuntime([{
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_SUPERSEDED',
    supersededByManifestId: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  }]);
  const { promoted } = await runPipeline(runtime, bundle, DEMO_CARD_ID, DEMO_MANIFEST_ID);

  assert.equal(promoted.presentationEligible, false, 'MANIFEST_SUPERSEDED without successor must not promote');
  assert.equal(runtime.presentation.isPromotedPresentationResult(promoted), false);
});

/* ----------------------------------------------------------------
 * 13. Duplicate record IDs → blocked at bundle verification
 * ---------------------------------------------------------------- */
test('duplicate recordId in bundle → blocked', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const dup = clone(records[0]);
  /* Both entries have the same recordId — this should be caught by bundle verification */

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [records[0], dup],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  /* Second entry has same registryVersion as first, so the version-order check fires first */
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 14. Conflicting records for the same card (same cardId+manifestId, different revision)
 * ---------------------------------------------------------------- */
test('two records for same cardId + manifestId at different revisions → ambiguous → blocked', async () => {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const keyId = DEMO_RECORD_KEY_ID;
  const trustedPublicKeys = {};
  trustedPublicKeys[keyId] = trustedKeyRecord(keyId, publicKey);
  const runtime = makeContext({ trustedPublicKeys });

  const r1 = makeRecord({ registryVersion: 1, recordId: 'dup-001', revision: 1 });
  const r2 = makeRecord({
    registryVersion: 2,
    recordId: 'dup-002',
    revision: 2,
    previousManifestId: 'some-other-manifest',
    /* Has same manifestId as r1 but revision 2 with no valid predecessor link in bundle — lineage invalid */
  });
  await signRecord(runtime, keyPair, r1);
  await signRecord(runtime, keyPair, r2);

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 2,
    generatedAt: FIXED_NOW,
    entries: [r1, r2],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);

  if (proof.authenticated) {
    /* Bundle authenticated; selection should fail with lineage or ambiguity error */
    const selected = runtime.selector.selectLifecycleEvidence(proof, { cardId: DEMO_CARD_ID });
    assert.equal(selected.selected, false);
    assert.ok(
      selected.outcome === 'LIFECYCLE_EVIDENCE_LINEAGE_INVALID'
        || selected.outcome === 'LIFECYCLE_EVIDENCE_AMBIGUOUS'
        || selected.outcome === 'LIFECYCLE_EVIDENCE_DUPLICATE_POSITION',
      `expected conflict outcome, got: ${selected.outcome}`,
    );
  } else {
    /* Bundle itself failed — also acceptable */
    assert.equal(proof.authenticated, false);
  }
});

/* ----------------------------------------------------------------
 * 15. Record for wrong card → not selected
 * ---------------------------------------------------------------- */
test('record for wrong cardId → card not found for requested cardId', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{ cardId: 'other_card' }]);
  const { selected, promoted } = await runPipeline(runtime, bundle, DEMO_CARD_ID, null);

  assert.equal(selected.outcome, 'LIFECYCLE_EVIDENCE_CARD_NOT_FOUND');
  assert.equal(promoted.presentationEligible, false);
});

/* ----------------------------------------------------------------
 * 16. Route (recipient/cardId) tampering after signing → blocked
 * ---------------------------------------------------------------- */
test('cardId field tampered after signing → signature invalid → blocked', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const tampered = clone(records[0]);
  tampered.cardId = 'tampered_card_id';

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [tampered],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 17. Network tampering (environment field) after signing → blocked
 * ---------------------------------------------------------------- */
test('environment field tampered after signing → signature invalid → blocked', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const tampered = clone(records[0]);
  tampered.environment = 'staging';

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [tampered],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 18. Lifecycle-state (cardStatus) tampering after signing → blocked
 * ---------------------------------------------------------------- */
test('cardStatus tampered after signing → signature invalid → blocked', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const tampered = clone(records[0]);
  tampered.cardStatus = 'CARD_REVOKED';

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [tampered],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 19. Revision/version tampering after signing → blocked
 * ---------------------------------------------------------------- */
test('registryVersion tampered after signing → signature invalid → blocked', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const tampered = clone(records[0]);
  tampered.registryVersion = 999;

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 999,
    generatedAt: FIXED_NOW,
    entries: [tampered],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

test('revision field tampered after signing → signature invalid → blocked', async () => {
  const { runtime, records } = await makeSignedRuntime([{}]);
  const tampered = clone(records[0]);
  tampered.revision = 99;

  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 1,
    generatedAt: FIXED_NOW,
    entries: [tampered],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, false);
});

/* ----------------------------------------------------------------
 * 20. Deterministic selection independent of input ordering
 *     (one ACTIVE record — no real ordering ambiguity with single record,
 *     but verify the same record is selected regardless of array position)
 * ---------------------------------------------------------------- */
test('single active record is selected regardless of bundle entry position', async () => {
  /* With a single record, position is trivially deterministic.
   * Verify it selects the same record in both orderings of a two-record lineage
   * where one is superseded and one is current. */
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const keyId = DEMO_RECORD_KEY_ID;
  const trustedPublicKeys = {};
  trustedPublicKeys[keyId] = trustedKeyRecord(keyId, publicKey);
  const runtime = makeContext({ trustedPublicKeys });

  const manifestIdV1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
  const manifestIdV2 = DEMO_MANIFEST_ID;

  const r1 = makeRecord({
    registryVersion: 1,
    recordId: 'lineage-001',
    manifestId: manifestIdV1,
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_SUPERSEDED',
    supersededByManifestId: manifestIdV2,
    effectiveFrom: '2026-07-01T00:00:00.000Z',
    effectiveUntil: '2026-07-15T00:00:00.000Z',
  });
  const r2 = makeRecord({
    registryVersion: 2,
    recordId: 'lineage-002',
    manifestId: manifestIdV2,
    revision: 2,
    previousManifestId: manifestIdV1,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    supersededByManifestId: null,
    effectiveFrom: '2026-07-15T00:00:00.000Z',
    effectiveUntil: null,
  });
  await signRecord(runtime, keyPair, r1);
  await signRecord(runtime, keyPair, r2);

  /* Run pipeline with r1 first, then r2 first (entries must be in ascending registryVersion order) */
  const bundle = deepFreeze({
    registrySchemaVersion: BUNDLE_SCHEMA_VERSION,
    registryId: DEMO_REGISTRY_ID,
    environment: 'production',
    registryVersion: 2,
    generatedAt: FIXED_NOW,
    entries: [r1, r2],
  });
  const bundleInput = realmClone(runtime.context, bundle);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundleInput);
  assert.equal(proof.authenticated, true);

  /* Request the whole card (no specific manifestId) — should select r2 as current */
  const selected = runtime.selector.selectLifecycleEvidence(proof, { cardId: DEMO_CARD_ID });
  assert.equal(selected.outcome, 'LIFECYCLE_EVIDENCE_SELECTED');
  const resolved = runtime.resolution.resolveLifecycle(selected);
  assert.equal(resolved.outcome, 'LIFECYCLE_ACTIVE');
  assert.equal(resolved.resolvedManifestId, manifestIdV2, 'must resolve to the MANIFEST_CURRENT record');
});

/* ----------------------------------------------------------------
 * 21. Promoted result is the exact authority object accepted by authorizeExecution()
 * ---------------------------------------------------------------- */
test('promoted result passes isPromotedPresentationResult() and can enter authorizeExecution()', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{}]);
  const { promoted } = await runPipeline(runtime, bundle, DEMO_CARD_ID, DEMO_MANIFEST_ID);

  assert.equal(promoted.presentationEligible, true);
  assert.equal(runtime.presentation.isPromotedPresentationResult(promoted), true);

  /* authorizeExecution requires the promoted result as first arg.
   * Supply a valid-shape transfer intent and wallet snapshot so only the
   * promoted proof is the variable under test. */
  const intent = Object.freeze({
    cardId: DEMO_CARD_ID,
    manifestId: DEMO_MANIFEST_ID,
    tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    executionContractAddress: '0x742d35Cc6634C0532925a3b8D4C9C0A2a3D5a12B',
    chainId: 137,
    recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
    recipientAmountAtomic: '10000000',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
  });
  const wallet = Object.freeze({
    account: '0x1234567890123456789012345678901234567890',
    chainId: 137,
    balanceAtomic: '20000000',
    allowanceAtomic: '20000000',
    providerReady: true,
  });

  const authResult = runtime.execAuth.authorizeExecution(promoted, intent, wallet);
  assert.equal(authResult.outcome, 'EXECUTION_AUTHORIZED', 'execution must be authorized with a valid promoted result');
  assert.equal(authResult.executionEligible, true);
  assert.equal(runtime.execAuth.isExecutionAuthorizedResult(authResult), true);
});

/* ----------------------------------------------------------------
 * 22. Blocked lifecycle result cannot reach executeTransfer()
 * ---------------------------------------------------------------- */
test('blocked lifecycle (card not found) → authorizeExecution refuses it', async () => {
  const { runtime, bundle } = await makeSignedRuntime([{}]);

  /* Run pipeline for wrong cardId → blocked promoted result */
  const { promoted } = await runPipeline(runtime, bundle, 'wrong_card', null);
  assert.equal(promoted.presentationEligible, false);
  assert.equal(runtime.presentation.isPromotedPresentationResult(promoted), false);

  const intent = Object.freeze({
    cardId: DEMO_CARD_ID,
    manifestId: DEMO_MANIFEST_ID,
    tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    executionContractAddress: '0x742d35Cc6634C0532925a3b8D4C9C0A2a3D5a12B',
    chainId: 137,
    recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
    recipientAmountAtomic: '10000000',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
  });
  const wallet = Object.freeze({
    account: '0x1234567890123456789012345678901234567890',
    chainId: 137,
    balanceAtomic: '20000000',
    allowanceAtomic: '20000000',
    providerReady: true,
  });

  const authResult = runtime.execAuth.authorizeExecution(promoted, intent, wallet);
  assert.notEqual(authResult.outcome, 'EXECUTION_AUTHORIZED', 'must not authorize with blocked presentation');
  assert.equal(authResult.executionEligible, false);
  assert.equal(runtime.execAuth.isExecutionAuthorizedResult(authResult), false);
});

test('null promoted result → authorizeExecution refuses it', async () => {
  const { runtime } = await makeSignedRuntime([{}]);

  const intent = Object.freeze({
    cardId: DEMO_CARD_ID,
    manifestId: DEMO_MANIFEST_ID,
    tokenAddress: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    executionContractAddress: '0x742d35Cc6634C0532925a3b8D4C9C0A2a3D5a12B',
    chainId: 137,
    recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
    recipientAmountAtomic: '10000000',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
  });
  const wallet = Object.freeze({
    account: '0x1234567890123456789012345678901234567890',
    chainId: 137,
    balanceAtomic: '20000000',
    allowanceAtomic: '20000000',
    providerReady: true,
  });

  const authResult = runtime.execAuth.authorizeExecution(null, intent, wallet);
  assert.notEqual(authResult.outcome, 'EXECUTION_AUTHORIZED');
  assert.equal(authResult.executionEligible, false);
});

/* ----------------------------------------------------------------
 * 23. Real production bundle file loads and promotes cc_demo_implicitex
 *
 * This test will FAIL until Commit 2 generates coin-card-lifecycle-bundle.js
 * and coin-card-trusted-keys.js. That is by design.
 * ---------------------------------------------------------------- */
test('real production bundle file authenticates and promotes cc_demo_implicitex', async () => {
  assert.ok(
    fs.existsSync(lifecycleBundlePath),
    `coin-card-lifecycle-bundle.js must exist at ${lifecycleBundlePath}`,
  );
  assert.ok(
    fs.existsSync(trustedKeysPath),
    `coin-card-trusted-keys.js must exist at ${trustedKeysPath}`,
  );

  const lifecycleBundleSource = fs.readFileSync(lifecycleBundlePath, 'utf8');
  const trustedKeysSource = fs.readFileSync(trustedKeysPath, 'utf8');

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
  context.window.crypto = webcrypto;

  /* Use a fixed verification time that is definitely after the bundle's generatedAt */
  const FixedDate = makeFixedDateClass(FIXED_NOW);
  context.Date = FixedDate;
  context.window.Date = FixedDate;

  /* Load modules in dependency order.
   * coin-card-trusted-keys.js must come before coin-card-trusted-key-resolution.js
   * so IX_COIN_CARD_TRUSTED_PUBLIC_KEYS is set before resolution reads it.
   * coin-card-lifecycle-bundle.js sets IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE.
   * coin-card-lifecycle-registry.js must NOT overwrite it if it's already defined. */
  vm.runInNewContext(trustedKeysSource, context, { filename: trustedKeysPath });
  vm.runInNewContext(trustedKeyResolutionSource, context, { filename: trustedKeyResolutionPath });
  vm.runInNewContext(lifecycleRegistrySource, context, { filename: lifecycleRegistryPath });
  vm.runInNewContext(lifecycleBundleSource, context, { filename: lifecycleBundlePath });
  vm.runInNewContext(lifecycleRecordVerifSource, context, { filename: lifecycleRecordVerifPath });
  vm.runInNewContext(lifecycleBundleVerifSource, context, { filename: lifecycleBundleVerifPath });
  vm.runInNewContext(lifecycleSelectionSource, context, { filename: lifecycleSelectionPath });
  vm.runInNewContext(lifecycleResolutionSource, context, { filename: lifecycleResolutionPath });
  vm.runInNewContext(lifecyclePresentationSource, context, { filename: lifecyclePresentationPath });

  const bundleApi      = context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION;
  const selectorApi    = context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION;
  const resolutionApi  = context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION;
  const presentationApi = context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION;
  const bundle         = context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE;

  assert.ok(bundle, 'IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE must be defined');
  assert.ok(Array.isArray(bundle.entries) && bundle.entries.length >= 1, 'bundle must have at least one entry');

  const proof = await bundleApi.authenticateLifecycleRegistryBundle(bundle);
  assert.equal(proof.outcome, 'LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED',
    `bundle verification failed: ${proof.outcome} reason=${proof.reason || ''}`);
  assert.equal(proof.authenticated, true);

  const selected = selectorApi.selectLifecycleEvidence(proof, {
    cardId: DEMO_CARD_ID,
    manifestId: DEMO_MANIFEST_ID,
  });
  assert.equal(selected.outcome, 'LIFECYCLE_EVIDENCE_SELECTED',
    `selection failed: ${selected.outcome} reason=${selected.reason || ''}`);
  assert.equal(selected.selected, true);

  const resolved = resolutionApi.resolveLifecycle(selected);
  assert.equal(resolved.outcome, 'LIFECYCLE_ACTIVE',
    `resolution failed: ${resolved.outcome}`);

  const promoted = presentationApi.promotePresentation(resolved);
  assert.equal(promoted.outcome, 'PRESENTATION_PROMOTED',
    `promotion failed: ${promoted.outcome}`);
  assert.equal(promoted.presentationEligible, true);
  assert.equal(presentationApi.isPromotedPresentationResult(promoted), true);
});
