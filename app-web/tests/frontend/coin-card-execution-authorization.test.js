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
const executionAuthorizationPath   = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-execution-authorization.js');

const trustedKeyResolutionSource   = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource      = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerifSource   = fs.readFileSync(lifecycleRecordVerifPath, 'utf8');
const lifecycleBundleVerifSource   = fs.readFileSync(lifecycleBundleVerifPath, 'utf8');
const lifecycleSelectionSource     = fs.readFileSync(lifecycleSelectionPath, 'utf8');
const lifecycleResolutionSource    = fs.readFileSync(lifecycleResolutionPath, 'utf8');
const lifecyclePresentationSource  = fs.readFileSync(lifecyclePresentationPath, 'utf8');
const executionAuthorizationSource = fs.readFileSync(executionAuthorizationPath, 'utf8');

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
    cardId: spec.cardId || 'card_exec_test',
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
      keyId: 'exec-test-key',
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

function makeExecutionContext(options = {}) {
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

  if (options.presentationApiStub !== undefined) {
    if (options.presentationApiStub !== null) {
      Object.defineProperty(context.window, 'IX_COIN_CARD_LIFECYCLE_PRESENTATION', {
        value: options.presentationApiStub,
        writable: false, enumerable: true, configurable: false,
      });
    }
    // if null, do not install presentation — execution module will see it absent
  } else {
    vm.runInNewContext(lifecyclePresentationSource, context, { filename: lifecyclePresentationPath });
  }

  vm.runInNewContext(executionAuthorizationSource, context, { filename: executionAuthorizationPath });

  return {
    context,
    registry:     context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    recordVerifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector:     context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
    resolution:   context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
    presentation: context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
    authorization: context.window.IX_COIN_CARD_EXECUTION_AUTHORIZATION,
  };
}

async function makeSignedExecutionRuntime(recordSpecs, request, options = {}) {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  );
  const publicKey = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));
  const fixedNow = options.fixedNow || DEFAULT_FIXED_NOW;

  const trustedPublicKeys = {
    'exec-test-key': trustedKeyRecord('exec-test-key', publicKey),
  };
  const runtime = makeExecutionContext({ trustedPublicKeys, fixedNow, ...options });

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
  const promoted = runtime.presentation.promotePresentation(resolved);

  return { ...runtime, keyPair, publicKey, proof, selected, resolved, promoted };
}

/* A minimal active record spec for execution tests. */
function activeRecordSpec() {
  return {
    registryVersion: 1,
    recordId: 'rec-exec-active-001',
    publishedAt: '2026-01-01T00:00:00.000Z',
    cardId: 'card_exec_test',
    manifestId: 'manifest-exec-001',
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
  };
}

function makeTransferIntent(overrides) {
  return deepFreeze(Object.assign({
    cardId: 'card_exec_test',
    manifestId: 'manifest-exec-001',
    tokenAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    executionContractAddress: '0x3333333333333333333333333333333333333333',
    chainId: 80002,
    recipient: '0x1111111111111111111111111111111111111111',
    recipientAmountAtomic: '10000000',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
  }, overrides || {}));
}

function makeWalletSnapshot(overrides) {
  return deepFreeze(Object.assign({
    account: '0x2222222222222222222222222222222222222222',
    chainId: 80002,
    balanceAtomic: '100000000',
    allowanceAtomic: '10100000',
    providerReady: true,
  }, overrides || {}));
}

/* ================================================================
 * Tests
 * ================================================================ */

/* ----------------------------------------------------------------
 * Module surface
 * ---------------------------------------------------------------- */
test('IX_COIN_CARD_EXECUTION_AUTHORIZATION is exposed on window and frozen', () => {
  const runtime = makeExecutionContext();
  const api = runtime.authorization;
  assert.ok(api, 'IX_COIN_CARD_EXECUTION_AUTHORIZATION must be defined');
  assert.ok(Object.isFrozen(api), 'API object must be frozen');
  assert.equal(typeof api.authorizeExecution, 'function');
  assert.equal(typeof api.isExecutionAuthorizedResult, 'function');
  assert.ok(api.TOP_LEVEL_FACTS, 'TOP_LEVEL_FACTS must be exposed');
  assert.ok(api.OUTCOMES, 'OUTCOMES must be exposed');
  assert.ok(api.EXECUTION_PLANS, 'EXECUTION_PLANS must be exposed');
});

test('TOP_LEVEL_FACTS vocabulary is complete and frozen', () => {
  const runtime = makeExecutionContext();
  const { TOP_LEVEL_FACTS } = runtime.authorization;
  assert.ok(Object.isFrozen(TOP_LEVEL_FACTS));
  assert.equal(TOP_LEVEL_FACTS.EXECUTION_AUTHORIZED,  'EXECUTION_AUTHORIZED');
  assert.equal(TOP_LEVEL_FACTS.EXECUTION_BLOCKED,     'EXECUTION_BLOCKED');
  assert.equal(TOP_LEVEL_FACTS.EXECUTION_UNAVAILABLE, 'EXECUTION_UNAVAILABLE');
  assert.equal(Object.keys(TOP_LEVEL_FACTS).length, 3);
});

test('OUTCOMES vocabulary is complete and frozen', () => {
  const runtime = makeExecutionContext();
  const { OUTCOMES } = runtime.authorization;
  assert.ok(Object.isFrozen(OUTCOMES));
  assert.equal(OUTCOMES.EXECUTION_AUTHORIZED,               'EXECUTION_AUTHORIZED');
  assert.equal(OUTCOMES.EXECUTION_PRESENTATION_PROOF_INVALID, 'EXECUTION_PRESENTATION_PROOF_INVALID');
  assert.equal(OUTCOMES.EXECUTION_INTENT_INVALID,           'EXECUTION_INTENT_INVALID');
  assert.equal(OUTCOMES.EXECUTION_WALLET_UNAVAILABLE,       'EXECUTION_WALLET_UNAVAILABLE');
  assert.equal(OUTCOMES.EXECUTION_ACCOUNT_INVALID,          'EXECUTION_ACCOUNT_INVALID');
  assert.equal(OUTCOMES.EXECUTION_NETWORK_MISMATCH,         'EXECUTION_NETWORK_MISMATCH');
  assert.equal(OUTCOMES.EXECUTION_RECIPIENT_INVALID,        'EXECUTION_RECIPIENT_INVALID');
  assert.equal(OUTCOMES.EXECUTION_SELF_SEND_BLOCKED,        'EXECUTION_SELF_SEND_BLOCKED');
  assert.equal(OUTCOMES.EXECUTION_AMOUNT_INVALID,           'EXECUTION_AMOUNT_INVALID');
  assert.equal(OUTCOMES.EXECUTION_AMOUNT_OUT_OF_RANGE,      'EXECUTION_AMOUNT_OUT_OF_RANGE');
  assert.equal(OUTCOMES.EXECUTION_TOTAL_MISMATCH,           'EXECUTION_TOTAL_MISMATCH');
  assert.equal(OUTCOMES.EXECUTION_FUNDS_INSUFFICIENT,       'EXECUTION_FUNDS_INSUFFICIENT');
  assert.equal(OUTCOMES.EXECUTION_POLICY_UNAVAILABLE,       'EXECUTION_POLICY_UNAVAILABLE');
  assert.equal(Object.keys(OUTCOMES).length, 13);
});

test('EXECUTION_PLANS vocabulary is complete and frozen', () => {
  const runtime = makeExecutionContext();
  const { EXECUTION_PLANS } = runtime.authorization;
  assert.ok(Object.isFrozen(EXECUTION_PLANS));
  assert.equal(EXECUTION_PLANS.TRANSFER_ONLY,         'TRANSFER_ONLY');
  assert.equal(EXECUTION_PLANS.APPROVE_THEN_TRANSFER, 'APPROVE_THEN_TRANSFER');
  assert.equal(Object.keys(EXECUTION_PLANS).length, 2);
});

/* ----------------------------------------------------------------
 * Presentation authority gate
 * ---------------------------------------------------------------- */
test('authorizeExecution blocks when IX_COIN_CARD_LIFECYCLE_PRESENTATION is absent', () => {
  const runtime = makeExecutionContext({ presentationApiStub: null });
  const result = runtime.authorization.authorizeExecution(null, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_UNAVAILABLE');
  assert.equal(result.outcome, 'EXECUTION_POLICY_UNAVAILABLE');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
});

test('authorizeExecution blocks when presentation API has no isPromotedPresentationResult', () => {
  const stub = Object.freeze({ promotePresentation: () => {} });
  const runtime = makeExecutionContext({ presentationApiStub: stub });
  const result = runtime.authorization.authorizeExecution(null, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_UNAVAILABLE');
  assert.equal(result.outcome, 'EXECUTION_POLICY_UNAVAILABLE');
  assert.equal(result.executionEligible, false);
});

test('authorizeExecution blocks when isPromotedPresentationResult throws', () => {
  const stub = Object.freeze({
    isPromotedPresentationResult() { throw new Error('deliberately throws'); },
  });
  const runtime = makeExecutionContext({ presentationApiStub: stub });
  const result = runtime.authorization.authorizeExecution({}, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_UNAVAILABLE');
  assert.equal(result.outcome, 'EXECUTION_POLICY_UNAVAILABLE');
  assert.equal(result.executionEligible, false);
});

/* ----------------------------------------------------------------
 * Presentation proof validity gate
 * ---------------------------------------------------------------- */
test('authorizeExecution blocks null presentation proof', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(null, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
  assert.equal(result.presentationEligible, false);
  assert.equal(result.executionEligible, false);
});

test('authorizeExecution blocks fabricated shape-alike presentation object', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const fabricated = Object.freeze({
    fact: 'PRESENTATION_ELIGIBLE',
    outcome: 'PRESENTATION_PROMOTED',
    presentationEligible: true,
    executionEligible: false,
    resolvedFact: 'RESOLVED',
    resolvedOutcome: 'LIFECYCLE_ACTIVE',
  });
  const result = runtime.authorization.authorizeExecution(fabricated, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
  assert.equal(result.presentationEligible, false);
});

test('authorizeExecution blocks a blocked (not promoted) presentation result', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  /* A blocked presentation result — not in PROMOTION_RESULTS WeakSet */
  const blocked = runtime.presentation.promotePresentation(null);
  assert.equal(blocked.outcome, 'PRESENTATION_INPUT_INVALID', 'precondition');
  const result = runtime.authorization.authorizeExecution(blocked, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
  assert.equal(result.presentationEligible, false);
});

/* ----------------------------------------------------------------
 * Transfer intent validation
 * ---------------------------------------------------------------- */
test('authorizeExecution blocks null transfer intent', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(runtime.promoted, null, makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_INTENT_INVALID');
  assert.equal(result.presentationEligible, true);
  assert.equal(result.executionEligible, false);
});

test('authorizeExecution blocks non-frozen transfer intent', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const nonFrozen = {
    cardId: 'card_exec_test',
    manifestId: 'manifest-exec-001',
    tokenAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    executionContractAddress: '0x3333333333333333333333333333333333333333',
    chainId: 80002,
    recipient: '0x1111111111111111111111111111111111111111',
    recipientAmountAtomic: '10000000',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
  };
  const result = runtime.authorization.authorizeExecution(runtime.promoted, nonFrozen, makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_INTENT_INVALID');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks intent missing required field (recipientAmountAtomic)', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const intent = deepFreeze({
    cardId: 'card_exec_test',
    manifestId: 'manifest-exec-001',
    tokenAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    executionContractAddress: '0x3333333333333333333333333333333333333333',
    chainId: 80002,
    recipient: '0x1111111111111111111111111111111111111111',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
    // recipientAmountAtomic intentionally omitted
  });
  const result = runtime.authorization.authorizeExecution(runtime.promoted, intent, makeWalletSnapshot());
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_INTENT_INVALID');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks intent with invalid tokenAddress', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent({ tokenAddress: 'not-an-address' }),
    makeWalletSnapshot(),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_INTENT_INVALID');
  assert.equal(result.presentationEligible, true);
});

/* ----------------------------------------------------------------
 * Wallet snapshot validation
 * ---------------------------------------------------------------- */
test('authorizeExecution blocks null wallet snapshot', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(runtime.promoted, makeTransferIntent(), null);
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_WALLET_UNAVAILABLE');
  assert.equal(result.presentationEligible, true);
  assert.equal(result.executionEligible, false);
});

test('authorizeExecution blocks non-frozen wallet snapshot', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const nonFrozen = {
    account: '0x2222222222222222222222222222222222222222',
    chainId: 80002,
    balanceAtomic: '100000000',
    allowanceAtomic: '10100000',
    providerReady: true,
  };
  const result = runtime.authorization.authorizeExecution(runtime.promoted, makeTransferIntent(), nonFrozen);
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_WALLET_UNAVAILABLE');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks wallet snapshot missing required field', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const snapshot = deepFreeze({
    account: '0x2222222222222222222222222222222222222222',
    chainId: 80002,
    balanceAtomic: '100000000',
    // allowanceAtomic intentionally omitted
    providerReady: true,
  });
  const result = runtime.authorization.authorizeExecution(runtime.promoted, makeTransferIntent(), snapshot);
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_WALLET_UNAVAILABLE');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks when providerReady is false', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent(),
    makeWalletSnapshot({ providerReady: false }),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_WALLET_UNAVAILABLE');
  assert.equal(result.presentationEligible, true);
});

/* ----------------------------------------------------------------
 * Account, network, recipient checks
 * ---------------------------------------------------------------- */
test('authorizeExecution blocks invalid account address', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent(),
    makeWalletSnapshot({ account: 'not-an-address' }),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_ACCOUNT_INVALID');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks when wallet chainId does not match intent chainId', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent({ chainId: 80002 }),
    makeWalletSnapshot({ chainId: 1 }),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_NETWORK_MISMATCH');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks invalid recipient address', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent({ recipient: 'not-an-address' }),
    makeWalletSnapshot(),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_RECIPIENT_INVALID');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks self-send', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const sameAddress = '0x2222222222222222222222222222222222222222';
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent({ recipient: sameAddress }),
    makeWalletSnapshot({ account: sameAddress }),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_SELF_SEND_BLOCKED');
  assert.equal(result.presentationEligible, true);
});

/* ----------------------------------------------------------------
 * Amount checks
 * ---------------------------------------------------------------- */
test('authorizeExecution blocks zero amount', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent({ recipientAmountAtomic: '0', platformFeeAtomic: '0', totalDebitAtomic: '0' }),
    makeWalletSnapshot(),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_AMOUNT_INVALID');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks when fee + recipient does not equal total', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent({
      recipientAmountAtomic: '10000000',
      platformFeeAtomic: '100000',
      totalDebitAtomic: '9999999', // wrong — should be 10100000
    }),
    makeWalletSnapshot({ balanceAtomic: '100000000', allowanceAtomic: '9999999' }),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_TOTAL_MISMATCH');
  assert.equal(result.presentationEligible, true);
});

test('authorizeExecution blocks when balance is insufficient', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent(),
    makeWalletSnapshot({ balanceAtomic: '1000', allowanceAtomic: '10100000' }),
  );
  assert.equal(result.fact, 'EXECUTION_BLOCKED');
  assert.equal(result.outcome, 'EXECUTION_FUNDS_INSUFFICIENT');
  assert.equal(result.presentationEligible, true);
});

/* ----------------------------------------------------------------
 * Authorized result
 * ---------------------------------------------------------------- */
test('authorizeExecution produces EXECUTION_AUTHORIZED for valid TRANSFER_ONLY case', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted, makeTransferIntent(), makeWalletSnapshot(),
  );
  assert.equal(result.fact, 'EXECUTION_AUTHORIZED');
  assert.equal(result.outcome, 'EXECUTION_AUTHORIZED');
  assert.equal(result.executionEligible, true);
  assert.equal(result.presentationEligible, true);
});

test('authorized result is frozen', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted, makeTransferIntent(), makeWalletSnapshot(),
  );
  assert.ok(Object.isFrozen(result));
});

test('TRANSFER_ONLY: executionPlan is TRANSFER_ONLY when allowance >= total', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  /* allowanceAtomic === totalDebitAtomic by default */
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent(),
    makeWalletSnapshot({ allowanceAtomic: '10100000' }),
  );
  assert.equal(result.fact, 'EXECUTION_AUTHORIZED');
  assert.equal(result.executionPlan, 'TRANSFER_ONLY');
});

test('APPROVE_THEN_TRANSFER: executionPlan is APPROVE_THEN_TRANSFER when allowance < total', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted,
    makeTransferIntent(),
    makeWalletSnapshot({ allowanceAtomic: '0' }),
  );
  assert.equal(result.fact, 'EXECUTION_AUTHORIZED');
  assert.equal(result.executionPlan, 'APPROVE_THEN_TRANSFER');
});

test('authorized result pins all required transaction facts', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const intent = makeTransferIntent();
  const snapshot = makeWalletSnapshot();
  const result = runtime.authorization.authorizeExecution(runtime.promoted, intent, snapshot);
  assert.equal(result.fact, 'EXECUTION_AUTHORIZED');
  assert.equal(result.sender, snapshot.account);
  assert.equal(result.recipient, intent.recipient);
  assert.equal(result.chainId, intent.chainId);
  assert.equal(result.tokenAddress, intent.tokenAddress);
  assert.equal(result.executionContractAddress, intent.executionContractAddress);
  assert.equal(result.recipientAmountAtomic, intent.recipientAmountAtomic);
  assert.equal(result.platformFeeAtomic, intent.platformFeeAtomic);
  assert.equal(result.totalDebitAtomic, intent.totalDebitAtomic);
  assert.equal(result.allowanceAtomic, snapshot.allowanceAtomic);
  assert.equal(result.balanceAtomic, snapshot.balanceAtomic);
  assert.equal(result.cardId, intent.cardId);
  assert.equal(result.manifestId, intent.manifestId);
});

test('executionEligible is true only for EXECUTION_AUTHORIZED', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  /* authorized case */
  const authorized = runtime.authorization.authorizeExecution(
    runtime.promoted, makeTransferIntent(), makeWalletSnapshot(),
  );
  assert.equal(authorized.executionEligible, true);
  /* blocked case */
  const blocked = runtime.authorization.authorizeExecution(null, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(blocked.executionEligible, false);
});

/* ----------------------------------------------------------------
 * isExecutionAuthorizedResult brand checks
 * ---------------------------------------------------------------- */
test('authorized result passes isExecutionAuthorizedResult', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted, makeTransferIntent(), makeWalletSnapshot(),
  );
  assert.equal(runtime.authorization.isExecutionAuthorizedResult(result), true);
});

test('blocked result does not pass isExecutionAuthorizedResult', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const blocked = runtime.authorization.authorizeExecution(null, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(runtime.authorization.isExecutionAuthorizedResult(blocked), false);
});

test('fabricated frozen object does not pass isExecutionAuthorizedResult', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const fabricated = Object.freeze({
    fact: 'EXECUTION_AUTHORIZED',
    outcome: 'EXECUTION_AUTHORIZED',
    presentationEligible: true,
    executionEligible: true,
    executionPlan: 'TRANSFER_ONLY',
    sender: '0x2222222222222222222222222222222222222222',
    recipient: '0x1111111111111111111111111111111111111111',
    chainId: 80002,
    tokenAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    executionContractAddress: '0x3333333333333333333333333333333333333333',
    recipientAmountAtomic: '10000000',
    platformFeeAtomic: '100000',
    totalDebitAtomic: '10100000',
    allowanceAtomic: '10100000',
    balanceAtomic: '100000000',
    cardId: 'card_exec_test',
    manifestId: 'manifest-exec-001',
  });
  assert.equal(runtime.authorization.isExecutionAuthorizedResult(fabricated), false);
});

test('isExecutionAuthorizedResult returns false for null', () => {
  const runtime = makeExecutionContext();
  assert.equal(runtime.authorization.isExecutionAuthorizedResult(null), false);
});

test('result from different VM context does not pass isExecutionAuthorizedResult', async () => {
  /* Two separate VM contexts each have their own AUTHORIZED_RESULTS WeakSet. */
  const runtimeA = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const runtimeB = await makeSignedExecutionRuntime([{
    ...activeRecordSpec(),
    cardId: 'card_exec_test',
    recordId: 'rec-exec-b-001',
    manifestId: 'manifest-exec-b-001',
  }], { cardId: 'card_exec_test' });

  const authorizedA = runtimeA.authorization.authorizeExecution(
    runtimeA.promoted, makeTransferIntent(), makeWalletSnapshot(),
  );
  assert.equal(runtimeA.authorization.isExecutionAuthorizedResult(authorizedA), true);
  /* Context B cannot recognize a result from context A. */
  assert.equal(runtimeB.authorization.isExecutionAuthorizedResult(authorizedA), false);
});

/* ----------------------------------------------------------------
 * presentationEligible semantics
 * ---------------------------------------------------------------- */
test('blocked results carry presentationEligible: true when proof was valid', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  /* A valid proof but an intent problem → presentationEligible: true */
  const result = runtime.authorization.authorizeExecution(
    runtime.promoted, null, makeWalletSnapshot(),
  );
  assert.equal(result.outcome, 'EXECUTION_INTENT_INVALID');
  assert.equal(result.presentationEligible, true);
});

test('EXECUTION_PRESENTATION_PROOF_INVALID carries presentationEligible: false', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const result = runtime.authorization.authorizeExecution(null, makeTransferIntent(), makeWalletSnapshot());
  assert.equal(result.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
  assert.equal(result.presentationEligible, false);
});

/* ----------------------------------------------------------------
 * Result freezing
 * ---------------------------------------------------------------- */
test('all results are frozen', async () => {
  const runtime = await makeSignedExecutionRuntime([activeRecordSpec()]);
  const cases = [
    runtime.authorization.authorizeExecution(null, makeTransferIntent(), makeWalletSnapshot()),
    runtime.authorization.authorizeExecution(runtime.promoted, null, makeWalletSnapshot()),
    runtime.authorization.authorizeExecution(runtime.promoted, makeTransferIntent(), null),
    runtime.authorization.authorizeExecution(runtime.promoted, makeTransferIntent(), makeWalletSnapshot()),
  ];
  for (const result of cases) {
    assert.ok(typeof result === 'object' && result !== null);
    assert.ok(Object.isFrozen(result), `result must be frozen: ${result.outcome}`);
  }
});
