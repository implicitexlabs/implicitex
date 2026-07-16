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
const MANIFEST_KEY_ID = 'ix-coin-card-manifest-v2';
const LIFECYCLE_KEY_ID = 'ix-lifecycle-pub-v2';
const LEGACY_MANIFEST_KEY_ID = 'ix-coin-card-manifest-v1';
const LEGACY_LIFECYCLE_KEY_ID = 'ix-lifecycle-pub-v1';
const OLD_TRANSCRIPT_EXPOSED_MANIFEST_PUBLIC_X = 'vBu_HYcJYHb1R8ED0cixUxefS06vbL9_HmLIm4gisKo';
const OLD_TRANSCRIPT_EXPOSED_MANIFEST_PUBLIC_Y = 'F7d-p9odLxJ4dXmM3iM_CHpK9Ce2mxsb8-IDcjqW5wk';
const OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_PUBLIC_X = 'V6m6D9g83f90_JYgKXKgL2muizX1traoYk3abaj_O0w';
const OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_PUBLIC_Y = 'aq9YrHM9U5P26U4ZVzueRi1BF56dBM7C52-cSstTnGw';
const OLD_TRANSCRIPT_EXPOSED_MANIFEST_SIGNATURE = 'x9AWnVP02wIW_rk681zruR_crsJfbExeWIO2hDVOlDl1Yd28dPu5AWowMQwIDz6Suo1JGnpTu5aKrVfp37BBPg';
const OLD_TRANSCRIPT_EXPOSED_MANIFEST_CANONICAL = '{"assets":[{"bytes":17755,"path":"card/card.css","sha256":"sha256:b80d627301b80c247a9473325f7fc151fecd3d6add4079ae2e4a7b4a1aa8f86d"},{"bytes":47141,"path":"card/card.js","sha256":"sha256:25414f5f62ea464011f9420d4d390d6ea02bd509afbe2928ce3ef6286ead1ea6"},{"bytes":14575,"path":"card/coin-card-execution-authorization.js","sha256":"sha256:1deae2f9cd6baf683e2daa0296fd374d5c12454a9a5d22b26ae224b7e05ea347"},{"bytes":17152,"path":"card/coin-card-lifecycle-bundle-verification.js","sha256":"sha256:b5c2be2dd38af28be878102ccbbad4bb0aff6556ecc47da2284768edc54df6b3"},{"bytes":7760,"path":"card/coin-card-lifecycle-presentation.js","sha256":"sha256:34b9278fb5c1396309dc72a59038ad3397f7a0e831f4fa4707cedb9cea438d54"},{"bytes":42723,"path":"card/coin-card-lifecycle-record-selection.js","sha256":"sha256:5bfbd90a061c6816c21398e77a4b091eca77b0034560b095527e10787029d1e4"},{"bytes":22347,"path":"card/coin-card-lifecycle-record-verification.js","sha256":"sha256:932332ad0bcd817c1afca8d7bb2bb99794bc11f81f983f97b08e5636bbfe82c0"},{"bytes":15831,"path":"card/coin-card-lifecycle-registry.js","sha256":"sha256:d891a0286b29dd5422302c2a27aa945cbc5df67b65dd338c8864384d9528d8a9"},{"bytes":29496,"path":"card/coin-card-lifecycle-resolution.js","sha256":"sha256:e35875433ade1bb36e9f382ec2eb0a565d45b939d69da3cd41bdbdbc8ef9d8e7"},{"bytes":16420,"path":"card/coin-card-trusted-key-resolution.js","sha256":"sha256:821f8d1490931ed219d7fe53acae0f99376fc8e4a2e3872f71440363a45cedb6"},{"bytes":2461,"path":"card/coin-card-trusted-keys.js","sha256":"sha256:449ff171cf6c3694fc2a2062e966e4fca406da74b8f0d8f64f8c28a2b661ce92"},{"bytes":30353,"path":"card/coin-card-verification.js","sha256":"sha256:e4622e4715174ec4a2468a6373c72a2f4a7ca0807ab7fc67a21fee2818f4409f"},{"bytes":37305,"path":"js/ix-execution.js","sha256":"sha256:b5292d82286defff34ba4ff693da21243cbaf77cb4d203cc5eef389e5ece36b4"},{"bytes":24303,"path":"js/vendor/qrcode.min.js","sha256":"sha256:d59af15f40bc321f78871fe9d892d1dbbf05e35e20ad22aa51203c68185b58b6"}],"buildVersion":"commit-i","coinCardVersion":"coin-card.v1","environment":"production","issuerId":"implicitex","keyId":"ix-coin-card-manifest-v1","layoutVersion":"coin-card-layout.v1","schemaVersion":"coin-card-manifest.v1","scope":"coin-card-runtime-package","signedAt":"2026-07-15T21:04:54.876Z"}';
const OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_SIGNATURE = '8XPhNIWfDPhHR2aE25Zury2T7V9fCGWlHvrwHBzSisNnOX4hHlE93ywKbR6y4Gk8BGMpxXmql6EX9qXtjfaY7A';
const OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_CANONICAL = '{"administrationEvidenceHash":null,"authorityId":"implicitex-registry","cardId":"cc_demo_implicitex","cardStatus":"CARD_ACTIVE","effectiveFrom":"2026-07-15T21:04:54.879Z","effectiveUntil":null,"environment":"production","manifestId":"sha256:f6e3ba5946c48d0fe6bd3fb866d64f3a2adff828cdf6e26975023cc60d4b6e04","manifestStatus":"MANIFEST_CURRENT","previousManifestId":null,"publishedAt":"2026-07-15T21:04:54.879Z","reasonCode":null,"recordId":"implicitex-production-r1-cc_demo_implicitex","registryId":"implicitex-production","registrySchemaVersion":"coin-card-lifecycle-registry-record.v1","registryVersion":1,"revision":1,"signature":{"algorithm":"ECDSA_P256_SHA256","authorityId":"implicitex-registry","keyId":"ix-lifecycle-pub-v1","mode":"signed-p256-v1","signatureEncoding":"ieee-p1363","signatureLengthBytes":64,"signatureValueEncoding":"base64url-unpadded","signedAt":"2026-07-15T21:04:54.879Z"},"supersededByManifestId":null}';

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function fromBase64Url(value) {
  let b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
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
  const FixedDate = makeFixedDateClass(options.now || '2026-07-16T23:59:00.000Z');
  const context = {
    Buffer,
    Date: FixedDate,
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

async function verifyP256WithTrustedKey(context, keyId, usage, issuerId, signatureTime, signatureValue, payloadBytes) {
  const resolution = context.window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION.resolveTrustedKeyRecord(keyId, {
    usage,
    environment: 'production',
    issuerId,
    signatureTime,
    verificationTime: '2026-07-16T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });
  assert.equal(resolution.outcome, 'TRUSTED_KEY_ACTIVE');
  const key = await webcrypto.subtle.importKey(
    'jwk',
    resolution.publicKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );
  return webcrypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    fromBase64Url(signatureValue),
    payloadBytes,
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
  assert.equal(verification.keyId, MANIFEST_KEY_ID);

  const lifecycle = await runLifecycle(context, manifest.manifestHash);
  assert.equal(lifecycle.proof.authenticated, true);
  assert.equal(lifecycle.resolved.outcome, 'LIFECYCLE_ACTIVE');
  assert.equal(lifecycle.promoted.outcome, 'PRESENTATION_PROMOTED');

  const authorization = authorize(context, lifecycle.promoted, manifest.manifestHash);
  assert.equal(authorization.outcome, 'EXECUTION_AUTHORIZED');
});

test('transcript-exposed old manifest signer is no longer trusted', async () => {
  const trustedKeys = makeContext().window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
  const manifestRecord = trustedKeys[LEGACY_MANIFEST_KEY_ID];
  assert.notEqual(manifestRecord.publicKey.x, OLD_TRANSCRIPT_EXPOSED_MANIFEST_PUBLIC_X);
  assert.notEqual(manifestRecord.publicKey.y, OLD_TRANSCRIPT_EXPOSED_MANIFEST_PUBLIC_Y);

  const valid = await verifyP256WithTrustedKey(
    makeContext(),
    LEGACY_MANIFEST_KEY_ID,
    'coin-card-manifest-signing',
    'implicitex',
    '2026-07-15T21:04:54.876Z',
    OLD_TRANSCRIPT_EXPOSED_MANIFEST_SIGNATURE,
    Buffer.from(OLD_TRANSCRIPT_EXPOSED_MANIFEST_CANONICAL, 'utf8'),
  );
  assert.equal(valid, false);
});

test('transcript-exposed old lifecycle signer is no longer trusted', async () => {
  const trustedKeys = makeContext().window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
  const lifecycleRecord = trustedKeys[LEGACY_LIFECYCLE_KEY_ID];
  assert.notEqual(lifecycleRecord.publicKey.x, OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_PUBLIC_X);
  assert.notEqual(lifecycleRecord.publicKey.y, OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_PUBLIC_Y);

  const lifecycleBytes = Buffer.concat([
    Buffer.from('ImplicitEx Coin Card Lifecycle Registry Record v1', 'utf8'),
    Buffer.from([0]),
    Buffer.from(OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_CANONICAL, 'utf8'),
  ]);
  const valid = await verifyP256WithTrustedKey(
    makeContext(),
    LEGACY_LIFECYCLE_KEY_ID,
    'coin-card-registry-publication',
    'implicitex-registry',
    '2026-07-15T21:04:54.879Z',
    OLD_TRANSCRIPT_EXPOSED_LIFECYCLE_SIGNATURE,
    lifecycleBytes,
  );
  assert.equal(valid, false);
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
  const firstManifestUsage = trustedKeysSource.indexOf('Object.freeze(["coin-card-manifest-signing"])');
  const secondManifestUsage = trustedKeysSource.indexOf('Object.freeze(["coin-card-manifest-signing"])', firstManifestUsage + 1);
  assert.notEqual(secondManifestUsage, -1, 'transition trust set must contain a v2 manifest-signing usage');
  const source = trustedKeysSource.slice(0, secondManifestUsage)
    + 'Object.freeze(["coin-card-registry-publication"])'
    + trustedKeysSource.slice(secondManifestUsage + 'Object.freeze(["coin-card-manifest-signing"])'.length);
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
