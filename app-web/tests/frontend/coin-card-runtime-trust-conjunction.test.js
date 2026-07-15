const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const publicRoot = path.join(repoRoot, 'app-web/frontend/public');
const manifestPath = path.join(publicRoot, 'card/coin-card-manifest.json');
const trustedKeysPath = path.join(publicRoot, 'card/coin-card-trusted-keys.js');
const trustedKeyResolutionPath = path.join(publicRoot, 'card/coin-card-trusted-key-resolution.js');
const verificationPath = path.join(publicRoot, 'card/coin-card-verification.js');
const lifecycleBundlePath = path.join(publicRoot, 'card/coin-card-lifecycle-bundle.js');
const lifecycleRegistryPath = path.join(publicRoot, 'card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerificationPath = path.join(publicRoot, 'card/coin-card-lifecycle-record-verification.js');
const lifecycleBundleVerificationPath = path.join(publicRoot, 'card/coin-card-lifecycle-bundle-verification.js');
const lifecycleSelectionPath = path.join(publicRoot, 'card/coin-card-lifecycle-record-selection.js');
const lifecycleResolutionPath = path.join(publicRoot, 'card/coin-card-lifecycle-resolution.js');
const lifecyclePresentationPath = path.join(publicRoot, 'card/coin-card-lifecycle-presentation.js');
const authorizationPath = path.join(publicRoot, 'card/coin-card-execution-authorization.js');

const trustedKeysSource = fs.readFileSync(trustedKeysPath, 'utf8');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const verificationSource = fs.readFileSync(verificationPath, 'utf8');
const lifecycleBundleSource = fs.readFileSync(lifecycleBundlePath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerificationSource = fs.readFileSync(lifecycleRecordVerificationPath, 'utf8');
const lifecycleBundleVerificationSource = fs.readFileSync(lifecycleBundleVerificationPath, 'utf8');
const lifecycleSelectionSource = fs.readFileSync(lifecycleSelectionPath, 'utf8');
const lifecycleResolutionSource = fs.readFileSync(lifecycleResolutionPath, 'utf8');
const lifecyclePresentationSource = fs.readFileSync(lifecyclePresentationPath, 'utf8');
const authorizationSource = fs.readFileSync(authorizationPath, 'utf8');

const CARD_ID = 'cc_demo_implicitex';

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function makeFixedDateClass(isoString) {
  const RealDate = Date;
  const fixedTime = RealDate.parse(isoString);
  return class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [isoString]));
    }
    static now() { return fixedTime; }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
}

function makeContext(options = {}) {
  const FixedDate = makeFixedDateClass(options.now || '2026-07-16T00:00:00.000Z');
  const context = {
    Buffer,
    Date: FixedDate,
    Object,
    Promise,
    String,
    TextEncoder,
    Uint8Array,
    atob: nodeAtob,
    btoa: nodeBtoa,
    window: {},
  };
  context.globalThis = context;
  context.window.Date = FixedDate;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = webcrypto;
  vm.runInNewContext(options.trustedKeysSource || trustedKeysSource, context, { filename: trustedKeysPath });
  vm.runInNewContext(trustedKeyResolutionSource, context, { filename: trustedKeyResolutionPath });
  vm.runInNewContext(verificationSource, context, { filename: verificationPath });
  vm.runInNewContext(options.lifecycleBundleSource || lifecycleBundleSource, context, { filename: lifecycleBundlePath });
  vm.runInNewContext(lifecycleRegistrySource, context, { filename: lifecycleRegistryPath });
  vm.runInNewContext(lifecycleRecordVerificationSource, context, { filename: lifecycleRecordVerificationPath });
  vm.runInNewContext(lifecycleBundleVerificationSource, context, { filename: lifecycleBundleVerificationPath });
  vm.runInNewContext(lifecycleSelectionSource, context, { filename: lifecycleSelectionPath });
  vm.runInNewContext(lifecycleResolutionSource, context, { filename: lifecycleResolutionPath });
  vm.runInNewContext(lifecyclePresentationSource, context, { filename: lifecyclePresentationPath });
  vm.runInNewContext(authorizationSource, context, { filename: authorizationPath });
  return context;
}

function readManifest(overrides = {}) {
  return Object.assign(clone(JSON.parse(fs.readFileSync(manifestPath, 'utf8'))), overrides);
}

async function runVerification(context, manifest) {
  const verification = context.window.IX_COIN_CARD_VERIFICATION;
  return verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => {
    if (url === 'coin-card-manifest.json') {
      return { ok: true, json: async () => manifest };
    }
    const assetPath = path.join(publicRoot, url);
    return {
      ok: fs.existsSync(assetPath),
      arrayBuffer: async () => {
        const bytes = fs.readFileSync(assetPath);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      },
    };
  });
}

async function runLifecycle(context, manifestId, lifecycleBundle) {
  const bundle = lifecycleBundle || context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE;
  const proof = await context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION
    .authenticateLifecycleRegistryBundle(bundle);
  const selected = context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION
    .selectLifecycleEvidence(proof, { cardId: CARD_ID, manifestId });
  const resolved = context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION.resolveLifecycle(selected);
  const promoted = context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION.promotePresentation(resolved);
  return { proof, selected, resolved, promoted };
}

function makeIntent(manifestId) {
  return deepFreeze({
    cardId: CARD_ID,
    manifestId,
    tokenAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    executionContractAddress: '0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0',
    chainId: 137,
    recipient: '0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919',
    recipientAmountAtomic: '1000000',
    platformFeeAtomic: '10000',
    totalDebitAtomic: '1010000',
  });
}

function makeSnapshot(overrides = {}) {
  return deepFreeze({
    account: '0x1111111111111111111111111111111111111111',
    chainId: 137,
    balanceAtomic: '5000000',
    allowanceAtomic: '0',
    providerReady: true,
    ...overrides,
  });
}

function authorize(context, promoted, manifestId) {
  return context.window.IX_COIN_CARD_EXECUTION_AUTHORIZATION.authorizeExecution(
    promoted,
    makeIntent(manifestId),
    makeSnapshot(),
  );
}

function mutateLifecycleBundle(context, mutateRecord) {
  const bundle = clone(context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE);
  mutateRecord(bundle.entries[0]);
  return deepFreeze(bundle);
}

test('actual committed manifest verifies, lifecycle promotes, and authorization reaches EXECUTION_AUTHORIZED', async () => {
  const context = makeContext();
  const manifest = readManifest();
  const verification = await runVerification(context, manifest);
  assert.equal(verification.state, 'VERIFIED');
  assert.equal(verification.signatureMode, 'signed-p256-v1');
  assert.equal(verification.keyId, 'ix-coin-card-manifest-v1');

  const lifecycle = await runLifecycle(context, manifest.manifestHash);
  assert.equal(lifecycle.proof.authenticated, true);
  assert.equal(lifecycle.resolved.outcome, 'LIFECYCLE_ACTIVE');
  assert.equal(lifecycle.promoted.outcome, 'PRESENTATION_PROMOTED');

  const authorization = authorize(context, lifecycle.promoted, manifest.manifestHash);
  assert.equal(authorization.outcome, 'EXECUTION_AUTHORIZED');
});

test('unsigned-dev manifest with ACTIVE lifecycle does not authorize', async () => {
  const context = makeContext();
  const manifest = readManifest({
    signature: { mode: 'unsigned-dev', algorithm: null, value: null },
  });
  const verification = await runVerification(context, manifest);
  assert.equal(verification.state, 'ASSET_HASHES_PASSED');

  const lifecycle = await runLifecycle(context, readManifest().manifestHash);
  assert.equal(lifecycle.resolved.outcome, 'LIFECYCLE_ACTIVE');

  const authorization = authorize(context, null, readManifest().manifestHash);
  assert.equal(authorization.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
});

test('invalid signature with ACTIVE lifecycle does not authorize', async () => {
  const context = makeContext();
  const manifest = readManifest();
  manifest.signature.value = manifest.signature.value.replace(/.$/, manifest.signature.value.endsWith('A') ? 'B' : 'A');

  const verification = await runVerification(context, manifest);
  assert.equal(verification.state, 'INTEGRITY_FAILED');
  assert.equal(verification.error, 'integrity-manifest-signature-invalid');

  const authorization = authorize(context, null, readManifest().manifestHash);
  assert.equal(authorization.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
});

test('unknown manifest signing key with ACTIVE lifecycle does not authorize', async () => {
  const context = makeContext();
  const manifest = readManifest({ keyId: 'unknown-manifest-key' });
  manifest.signature.keyId = 'unknown-manifest-key';
  const verification = await runVerification(context, manifest);
  assert.equal(verification.state, 'VERIFICATION_UNAVAILABLE');
  assert.equal(verification.error, 'integrity-manifest-public-key-unavailable');

  const authorization = authorize(context, null, readManifest().manifestHash);
  assert.equal(authorization.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
});

test('trusted key without manifest-signing usage blocks manifest verification', async () => {
  const source = trustedKeysSource.replace(
    'Object.freeze(["coin-card-manifest-signing"])',
    'Object.freeze(["coin-card-registry-publication"])',
  );
  const context = makeContext({ trustedKeysSource: source });
  const verification = await runVerification(context, readManifest());
  assert.equal(verification.state, 'VERIFICATION_UNAVAILABLE');
  assert.equal(verification.trustedKeyOutcome, 'TRUSTED_KEY_USAGE_DENIED');
});

test('manifest mutations after signing fail before authorization', async () => {
  const cases = [
    ['buildVersion', (manifest) => { manifest.buildVersion = 'tampered-build'; }],
    ['route/provider asset hash', (manifest) => {
      const asset = manifest.assets.find((entry) => entry.path === 'js/ix-execution.js');
      asset.sha256 = 'sha256:' + '0'.repeat(64);
    }],
    ['card runtime asset hash', (manifest) => {
      const asset = manifest.assets.find((entry) => entry.path === 'card/card.js');
      asset.bytes += 1;
    }],
    ['signer context', (manifest) => { manifest.issuerId = 'attacker'; }],
  ];

  for (const [label, mutate] of cases) {
    const context = makeContext();
    const manifest = readManifest();
    mutate(manifest);
    const verification = await runVerification(context, manifest);
    assert.notEqual(verification.state, 'VERIFIED', label);
    const authorization = authorize(context, null, readManifest().manifestHash);
    assert.equal(authorization.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID', label);
  }
});

test('verified manifest with revoked lifecycle does not authorize', async () => {
  const context = makeContext();
  const manifest = readManifest();
  const verification = await runVerification(context, manifest);
  assert.equal(verification.state, 'VERIFIED');

  const revokedBundle = mutateLifecycleBundle(context, (record) => {
    record.cardStatus = 'CARD_REVOKED';
    record.manifestStatus = 'MANIFEST_REVOKED';
  });
  const lifecycle = await runLifecycle(context, manifest.manifestHash, revokedBundle);
  assert.equal(lifecycle.proof.authenticated, false);
  assert.equal(lifecycle.promoted.presentationEligible, false);

  const authorization = authorize(context, lifecycle.promoted, manifest.manifestHash);
  assert.equal(authorization.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
});

test('verified manifest with no matching lifecycle record does not authorize', async () => {
  const context = makeContext();
  const manifest = readManifest();
  const verification = await runVerification(context, manifest);
  assert.equal(verification.state, 'VERIFIED');

  const lifecycle = await runLifecycle(context, 'sha256:' + '0'.repeat(64));
  assert.equal(lifecycle.selected.selected, false);
  assert.equal(lifecycle.promoted.presentationEligible, false);

  const authorization = authorize(context, lifecycle.promoted, manifest.manifestHash);
  assert.equal(authorization.outcome, 'EXECUTION_PRESENTATION_PROOF_INVALID');
});
