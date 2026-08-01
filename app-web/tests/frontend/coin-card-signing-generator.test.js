const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { webcrypto } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const appRoot = path.join(repoRoot, 'app-web');
const generatorPath = path.join(appRoot, 'scripts/generate_signed_coin_card_acceptance.js');
const trustedKeyResolutionPath = path.join(appRoot, 'frontend/public/card/coin-card-trusted-key-resolution.js');
const verificationPath = path.join(appRoot, 'frontend/public/card/coin-card-verification.js');
const lifecycleRegistryPath = path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerificationPath = path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-record-verification.js');
const lifecycleBundleVerificationPath = path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-bundle-verification.js');
const lifecycleSelectionPath = path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-record-selection.js');
const lifecycleResolutionPath = path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-resolution.js');
const lifecyclePresentationPath = path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-presentation.js');
const publicRoot = path.join(appRoot, 'frontend/public');
const generatedArtifactPaths = [
  path.join(appRoot, 'frontend/public/card/coin-card-manifest.json'),
  path.join(appRoot, 'frontend/public/card/coin-card-trusted-keys.js'),
  path.join(appRoot, 'frontend/public/card/coin-card-lifecycle-bundle.js'),
];
const verificationSource = fs.readFileSync(verificationPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerificationSource = fs.readFileSync(lifecycleRecordVerificationPath, 'utf8');
const lifecycleBundleVerificationSource = fs.readFileSync(lifecycleBundleVerificationPath, 'utf8');
const lifecycleSelectionSource = fs.readFileSync(lifecycleSelectionPath, 'utf8');
const lifecycleResolutionSource = fs.readFileSync(lifecycleResolutionPath, 'utf8');
const lifecyclePresentationSource = fs.readFileSync(lifecyclePresentationPath, 'utf8');

function runGenerator(args = [], env = {}) {
  return spawnSync(process.execPath, [generatorPath, ...args], {
    cwd: appRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      COIN_CARD_MANIFEST_PRIVATE_KEY_B64: '',
      COIN_CARD_LIFECYCLE_PRIVATE_KEY_B64: '',
      COIN_CARD_ACCEPTANCE_BUILD_VERSION: '',
      ...env,
    },
  });
}

function outputOf(result) {
  return `${result.stdout || ''}${result.stderr || ''}${result.error ? String(result.error) : ''}`;
}

async function makeKeyFile(dir, name) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const filePath = path.join(dir, `${name}.pkcs8.b64`);
  fs.writeFileSync(filePath, Buffer.from(pkcs8).toString('base64'), 'utf8');
  fs.chmodSync(filePath, 0o600);
  const material = fs.readFileSync(filePath, 'utf8');
  assert.equal((fs.statSync(filePath).mode & 0o777), 0o600);
  return {
    filePath,
    material,
    publicJwk: {
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y,
      key_ops: ['verify'],
      ext: true,
    },
  };
}

function runIsolatedGenerator(dir, options) {
  const manifestOut = options.manifestOutPath || path.join(dir, options.manifestName || 'coin-card-manifest.json');
  const trustedKeysOut = options.trustedKeysOutPath || path.join(dir, options.trustedName || 'coin-card-trusted-keys.js');
  const lifecycleOut = options.lifecycleOutPath || path.join(dir, options.lifecycleName || 'coin-card-lifecycle-bundle.js');
  const args = [
    '--build-version',
    options.buildVersion || 'rotation-test-build',
    '--manifest-key-id',
    options.manifestKeyId,
    '--lifecycle-key-id',
    options.lifecycleKeyId,
    '--manifest-out',
    manifestOut,
    '--trusted-keys-out',
    trustedKeysOut,
    '--lifecycle-bundle-out',
    lifecycleOut,
  ];
  if (options.manifestKeyFile) args.push('--manifest-key-file', options.manifestKeyFile);
  if (options.lifecycleKeyFile) args.push('--lifecycle-key-file', options.lifecycleKeyFile);
  if (options.manifestKeyEnv) args.push('--manifest-key-env', options.manifestKeyEnv);
  if (options.lifecycleKeyEnv) args.push('--lifecycle-key-env', options.lifecycleKeyEnv);
  if (options.preserveTrustedKeysFrom) args.push('--preserve-trusted-keys-from', options.preserveTrustedKeysFrom);
  if (options.initializeNewTrustSet) args.push('--initialize-new-trust-set');
  if (options.testFailPackagePromoteAfter) args.push('--test-fail-package-promote-after', options.testFailPackagePromoteAfter);
  if (options.testFailValidationStage) args.push('--test-fail-validation-stage', options.testFailValidationStage);
  if (options.testMutateSourceBeforePromote) args.push('--test-mutate-source-before-promote', options.testMutateSourceBeforePromote);
  const result = runGenerator(args, options.env || {});
  return { result, manifestOut, trustedKeysOut, lifecycleOut };
}

function loadTrustedKeys(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: filePath });
  return context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
}

function loadLifecycleBundle(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: filePath });
  return context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE;
}

function samePublicJwk(left, right) {
  return left.kty === right.kty && left.crv === right.crv && left.x === right.x && left.y === right.y;
}

function resolveManifestSigner(trustedKeysFile, manifestFile) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const context = { window: {} };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(trustedKeysFile, 'utf8'), context, { filename: trustedKeysFile });
  vm.runInContext(fs.readFileSync(trustedKeyResolutionPath, 'utf8'), context, { filename: trustedKeyResolutionPath });
  return context.window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION.resolveTrustedKeyRecord(manifest.keyId, {
    usage: 'coin-card-manifest-signing',
    environment: manifest.environment,
    issuerId: manifest.issuerId,
    signatureTime: manifest.signedAt,
    verificationTime: manifest.signedAt,
    signatureMode: manifest.signature.mode,
  });
}

function loadBrowserContext(trustedKeysFile) {
  const context = {
    console,
    Promise,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    window: {},
    crypto: webcrypto,
    atob(value) {
      return Buffer.from(value, 'base64').toString('binary');
    },
    btoa(value) {
      return Buffer.from(value, 'binary').toString('base64');
    },
  };
  context.globalThis = context;
  context.window.window = context.window;
  context.window.crypto = webcrypto;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = context.atob;
  context.window.btoa = context.btoa;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(trustedKeysFile, 'utf8'), context, { filename: trustedKeysFile });
  vm.runInContext(fs.readFileSync(trustedKeyResolutionPath, 'utf8'), context, { filename: trustedKeyResolutionPath });
  return context;
}

async function verifyGeneratedManifest(manifestFile, trustedKeysFile, assetOverrides = {}) {
  const context = loadBrowserContext(trustedKeysFile);
  vm.runInContext(verificationSource, context, { filename: verificationPath });
  const verification = context.window.IX_COIN_CARD_VERIFICATION;
  return verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => {
    if (url === 'coin-card-manifest.json') {
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(fs.readFileSync(manifestFile, 'utf8')),
      };
    }
    const body = Object.prototype.hasOwnProperty.call(assetOverrides, url)
      ? Buffer.from(assetOverrides[url], 'utf8')
      : fs.readFileSync(path.join(publicRoot, url));
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => body,
    };
  });
}

async function verifyGeneratedLifecycle(lifecycleFile, trustedKeysFile) {
  const context = loadBrowserContext(trustedKeysFile);
  vm.runInContext(lifecycleRegistrySource, context, { filename: lifecycleRegistryPath });
  vm.runInContext(lifecycleRecordVerificationSource, context, { filename: lifecycleRecordVerificationPath });
  vm.runInContext(lifecycleBundleVerificationSource, context, { filename: lifecycleBundleVerificationPath });
  context.__bundleJson = JSON.stringify(loadLifecycleBundle(lifecycleFile));
  const bundle = vm.runInContext(`(() => {
    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
      return Object.freeze(value);
    }
    return deepFreeze(JSON.parse(__bundleJson));
  })()`, context);
  return context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION
    .authenticateLifecycleRegistryBundle(bundle);
}

function loadGeneratedLifecycleRuntime(trustedKeysFile) {
  const context = loadBrowserContext(trustedKeysFile);
  vm.runInContext(lifecycleRegistrySource, context, { filename: lifecycleRegistryPath });
  vm.runInContext(lifecycleRecordVerificationSource, context, { filename: lifecycleRecordVerificationPath });
  vm.runInContext(lifecycleBundleVerificationSource, context, { filename: lifecycleBundleVerificationPath });
  vm.runInContext(lifecycleSelectionSource, context, { filename: lifecycleSelectionPath });
  vm.runInContext(lifecycleResolutionSource, context, { filename: lifecycleResolutionPath });
  vm.runInContext(lifecyclePresentationSource, context, { filename: lifecyclePresentationPath });
  return {
    context,
    bundleVerifier: context.window.IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION,
    selector: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION,
    resolution: context.window.IX_COIN_CARD_LIFECYCLE_RESOLUTION,
    presentation: context.window.IX_COIN_CARD_LIFECYCLE_PRESENTATION,
  };
}

async function runGeneratedLifecyclePipeline(lifecycleFile, trustedKeysFile, cardId, manifestId) {
  const runtime = loadGeneratedLifecycleRuntime(trustedKeysFile);
  runtime.context.__bundleJson = JSON.stringify(loadLifecycleBundle(lifecycleFile));
  const bundle = vm.runInContext(`(() => {
    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
      return Object.freeze(value);
    }
    return deepFreeze(JSON.parse(__bundleJson));
  })()`, runtime.context);
  const proof = await runtime.bundleVerifier.authenticateLifecycleRegistryBundle(bundle);
  const selected = runtime.selector.selectLifecycleEvidence(proof, { cardId, manifestId });
  const resolved = runtime.resolution.resolveLifecycle(selected);
  const promoted = runtime.presentation.promotePresentation(resolved);
  return { proof, selected, resolved, promoted };
}

function assertNoPackageTemps(dir) {
  const leftovers = fs.readdirSync(dir).filter((name) => /\.tmp$|\.rollback$/.test(name));
  assert.deepEqual(leftovers, []);
}

function snapshotFiles(paths) {
  return Object.fromEntries(paths.map((filePath) => [
    filePath,
    fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null,
  ]));
}

function assertFilesMatchSnapshot(snapshot) {
  for (const [filePath, contents] of Object.entries(snapshot)) {
    if (contents === null) assert.equal(fs.existsSync(filePath), false, filePath);
    else assert.equal(fs.readFileSync(filePath, 'utf8'), contents, filePath);
  }
}

function trustedSourceWithBody(body) {
  return `(function () {
    'use strict';
    ${body}
  })();`;
}

test('signing generator has no private-key generation or disclosure path', () => {
  const source = fs.readFileSync(generatorPath, 'utf8');

  assert.equal(source.includes('--generate-keys'), false);
  assert.equal(source.includes('generateKeyPair'), false);
  assert.equal(source.includes('privatePkcs8'), false);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*PRIVATE/i);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*process\.env/i);
});

test('signing generator fails safely when signing keys are absent', () => {
  const result = runGenerator(['--build-version', 'acceptance-test']);
  const output = result.stdout + result.stderr;

  assert.notEqual(result.status, 0);
  assert.match(output, /manifest private key missing/);
  assert.doesNotMatch(output, /MIGH|BEGIN PRIVATE|PRIVATE_KEY_B64=.*[A-Za-z0-9+/=]/);
});

test('signing generator rejects placeholder build identity before signing', () => {
  const result = runGenerator(['--build-version', 'commit-i']);
  const output = result.stdout + result.stderr;

  assert.notEqual(result.status, 0);
  assert.match(output, /non-placeholder --build-version/);
  assert.doesNotMatch(output, /MIGH|BEGIN PRIVATE/);
});

test('generated signing artifacts contain no private key material', () => {
  for (const artifactPath of generatedArtifactPaths) {
    const source = fs.readFileSync(artifactPath, 'utf8');
    assert.doesNotMatch(source, /"d"\s*:/, artifactPath);
    assert.doesNotMatch(source, /MIGH|BEGIN PRIVATE|PRIVATE KEY/, artifactPath);
  }
});

test('rotation generator preserves v1 records and appends distinct v2 signer IDs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-'));
  try {
    const v1Manifest = await makeKeyFile(dir, 'manifest-v1');
    const v1Lifecycle = await makeKeyFile(dir, 'lifecycle-v1');
    const v2Manifest = await makeKeyFile(dir, 'manifest-v2');
    const v2Lifecycle = await makeKeyFile(dir, 'lifecycle-v2');

    const v1 = runIsolatedGenerator(dir, {
      manifestKeyFile: v1Manifest.filePath,
      lifecycleKeyFile: v1Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-v1-test',
      lifecycleKeyId: 'ix-lifecycle-pub-v1-test',
      buildVersion: 'rotation-v1',
      manifestName: 'v1-manifest.json',
      trustedName: 'v1-trusted.js',
      lifecycleName: 'v1-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(v1.result.status, 0, v1.result.stderr);

    const v2 = runIsolatedGenerator(dir, {
      manifestKeyFile: v2Manifest.filePath,
      lifecycleKeyFile: v2Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-v2-test',
      lifecycleKeyId: 'ix-lifecycle-pub-v2-test',
      preserveTrustedKeysFrom: v1.trustedKeysOut,
      buildVersion: 'rotation-v2',
      manifestName: 'v2-manifest.json',
      trustedName: 'transition-trusted.js',
      lifecycleName: 'v2-lifecycle.js',
    });
    assert.equal(v2.result.status, 0, v2.result.stderr);

    const trusted = loadTrustedKeys(v2.trustedKeysOut);
    assert.deepEqual(Object.keys(trusted), [
    'ix-coin-card-manifest-v1-test',
    'ix-coin-card-manifest-v2-test',
    'ix-lifecycle-pub-v1-test',
    'ix-lifecycle-pub-v2-test',
  ]);
  assert(samePublicJwk(trusted['ix-coin-card-manifest-v1-test'].publicKey, v1Manifest.publicJwk));
  assert(samePublicJwk(trusted['ix-coin-card-manifest-v2-test'].publicKey, v2Manifest.publicJwk));
  assert.equal(trusted['ix-coin-card-manifest-v1-test'].status, 'ACTIVE');
  assert.equal(trusted['ix-lifecycle-pub-v1-test'].status, 'ACTIVE');

  const manifest = JSON.parse(fs.readFileSync(v2.manifestOut, 'utf8'));
  const bundle = loadLifecycleBundle(v2.lifecycleOut);
  assert.equal(manifest.keyId, 'ix-coin-card-manifest-v2-test');
  assert.equal(manifest.signature.keyId, 'ix-coin-card-manifest-v2-test');
  assert.equal(bundle.entries[0].signature.keyId, 'ix-lifecycle-pub-v2-test');
  assert.equal(bundle.entries[0].manifestId, manifest.manifestHash);
  assert.doesNotMatch(v2.result.stdout + v2.result.stderr, /BEGIN PRIVATE|PRIVATE_KEY_B64|MIGH/);

  assert.equal(resolveManifestSigner(v1.trustedKeysOut, v1.manifestOut).outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolveManifestSigner(v1.trustedKeysOut, v2.manifestOut).outcome, 'TRUSTED_KEY_UNKNOWN');
  assert.equal(resolveManifestSigner(v2.trustedKeysOut, v1.manifestOut).outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolveManifestSigner(v2.trustedKeysOut, v2.manifestOut).outcome, 'TRUSTED_KEY_ACTIVE');

  const v2Only = runIsolatedGenerator(dir, {
    manifestKeyFile: v2Manifest.filePath,
    lifecycleKeyFile: v2Lifecycle.filePath,
    manifestKeyId: 'ix-coin-card-manifest-v2-test',
    lifecycleKeyId: 'ix-lifecycle-pub-v2-test',
    buildVersion: 'rotation-v2-only',
    manifestName: 'v2-only-manifest.json',
    trustedName: 'v2-only-trusted.js',
    lifecycleName: 'v2-only-lifecycle.js',
    initializeNewTrustSet: true,
  });
  assert.equal(v2Only.result.status, 0, v2Only.result.stderr);
    assert.equal(resolveManifestSigner(v2Only.trustedKeysOut, v1.manifestOut).outcome, 'TRUSTED_KEY_UNKNOWN');
    assert.equal(resolveManifestSigner(v2.trustedKeysOut, v1.manifestOut).outcome, 'TRUSTED_KEY_ACTIVE');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator rejects key ID rebinding duplicate IDs and usage exchange', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-reject-'));
  try {
    const v1Manifest = await makeKeyFile(dir, 'manifest-v1');
    const v1Lifecycle = await makeKeyFile(dir, 'lifecycle-v1');
    const otherManifest = await makeKeyFile(dir, 'manifest-other');
    const otherLifecycle = await makeKeyFile(dir, 'lifecycle-other');

    const v1 = runIsolatedGenerator(dir, {
    manifestKeyFile: v1Manifest.filePath,
    lifecycleKeyFile: v1Lifecycle.filePath,
    manifestKeyId: 'ix-coin-card-manifest-v1-test',
    lifecycleKeyId: 'ix-lifecycle-pub-v1-test',
    buildVersion: 'rotation-v1',
    manifestName: 'v1-manifest.json',
    trustedName: 'v1-trusted.js',
      lifecycleName: 'v1-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(v1.result.status, 0, v1.result.stderr);

  const rebind = runIsolatedGenerator(dir, {
    manifestKeyFile: otherManifest.filePath,
    lifecycleKeyFile: otherLifecycle.filePath,
    manifestKeyId: 'ix-coin-card-manifest-v1-test',
    lifecycleKeyId: 'ix-lifecycle-pub-v2-test',
    preserveTrustedKeysFrom: v1.trustedKeysOut,
    buildVersion: 'rotation-rebind',
    manifestName: 'rebind-manifest.json',
    trustedName: 'rebind-trusted.js',
    lifecycleName: 'rebind-lifecycle.js',
  });
  assert.notEqual(rebind.result.status, 0);
  assert.match(outputOf(rebind.result), /already bound to a different public key/);

  const duplicateIds = runIsolatedGenerator(dir, {
    manifestKeyFile: otherManifest.filePath,
    lifecycleKeyFile: otherLifecycle.filePath,
    manifestKeyId: 'same-id',
    lifecycleKeyId: 'same-id',
    buildVersion: 'rotation-duplicate',
    manifestName: 'dup-manifest.json',
    trustedName: 'dup-trusted.js',
    lifecycleName: 'dup-lifecycle.js',
  });
  assert.notEqual(duplicateIds.result.status, 0);
  assert.match(outputOf(duplicateIds.result), /must be distinct/);

  const usageExchange = runIsolatedGenerator(dir, {
    manifestKeyFile: v1Lifecycle.filePath,
    lifecycleKeyFile: v1Manifest.filePath,
    manifestKeyId: 'ix-lifecycle-pub-v1-test',
    lifecycleKeyId: 'ix-coin-card-manifest-v1-test',
    preserveTrustedKeysFrom: v1.trustedKeysOut,
    buildVersion: 'rotation-usage',
    manifestName: 'usage-manifest.json',
    trustedName: 'usage-trusted.js',
    lifecycleName: 'usage-lifecycle.js',
  });
  assert.notEqual(usageExchange.result.status, 0);
    assert.match(outputOf(usageExchange.result), /different usage|different issuer\/environment/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator defaults preserve existing outputs and requires explicit fresh initialization', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-defaults-'));
  try {
    const v1Manifest = await makeKeyFile(dir, 'manifest-v1');
    const v1Lifecycle = await makeKeyFile(dir, 'lifecycle-v1');
    const v2Manifest = await makeKeyFile(dir, 'manifest-v2');
    const v2Lifecycle = await makeKeyFile(dir, 'lifecycle-v2');

    const absent = runIsolatedGenerator(dir, {
      manifestKeyFile: v1Manifest.filePath,
      lifecycleKeyFile: v1Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-fresh-test',
      lifecycleKeyId: 'ix-lifecycle-pub-fresh-test',
      manifestName: 'absent-manifest.json',
      trustedName: 'absent-trusted.js',
      lifecycleName: 'absent-lifecycle.js',
    });
    assert.notEqual(absent.result.status, 0);
    assert.match(outputOf(absent.result), /existing trusted-key source missing/);

    const initialized = runIsolatedGenerator(dir, {
      manifestKeyFile: v1Manifest.filePath,
      lifecycleKeyFile: v1Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-v1-test',
      lifecycleKeyId: 'ix-lifecycle-pub-v1-test',
      manifestName: 'package-manifest.json',
      trustedName: 'package-trusted.js',
      lifecycleName: 'package-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(initialized.result.status, 0, initialized.result.stderr);

    const transition = runIsolatedGenerator(dir, {
      manifestKeyFile: v2Manifest.filePath,
      lifecycleKeyFile: v2Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-v2-test',
      lifecycleKeyId: 'ix-lifecycle-pub-v2-test',
      manifestName: 'package-manifest.json',
      trustedName: 'package-trusted.js',
      lifecycleName: 'package-lifecycle.js',
    });
    assert.equal(transition.result.status, 0, transition.result.stderr);
    const trusted = loadTrustedKeys(transition.trustedKeysOut);
    assert.deepEqual(Object.keys(trusted), [
      'ix-coin-card-manifest-v1-test',
      'ix-coin-card-manifest-v2-test',
      'ix-lifecycle-pub-v1-test',
      'ix-lifecycle-pub-v2-test',
    ]);

    const reservedInit = runIsolatedGenerator(dir, {
      manifestKeyFile: v2Manifest.filePath,
      lifecycleKeyFile: v2Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-v1',
      lifecycleKeyId: 'ix-lifecycle-pub-v1',
      manifestName: 'reserved-manifest.json',
      trustedName: 'reserved-trusted.js',
      lifecycleName: 'reserved-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.notEqual(reservedInit.result.status, 0);
    assert.match(outputOf(reservedInit.result), /reserved production key ID cannot initialize/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator rejects conflicting preservation sources and malformed trusted key records', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-source-'));
  try {
    const manifestA = await makeKeyFile(dir, 'manifest-a');
    const lifecycleA = await makeKeyFile(dir, 'lifecycle-a');
    const manifestB = await makeKeyFile(dir, 'manifest-b');
    const lifecycleB = await makeKeyFile(dir, 'lifecycle-b');

    const sourceA = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestA.filePath,
      lifecycleKeyFile: lifecycleA.filePath,
      manifestKeyId: 'conflict-manifest',
      lifecycleKeyId: 'conflict-lifecycle',
      manifestName: 'a-manifest.json',
      trustedName: 'trusted-output.js',
      lifecycleName: 'a-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(sourceA.result.status, 0, sourceA.result.stderr);
    const sourceB = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestB.filePath,
      lifecycleKeyFile: lifecycleB.filePath,
      manifestKeyId: 'conflict-manifest',
      lifecycleKeyId: 'other-lifecycle',
      manifestName: 'b-manifest.json',
      trustedName: 'trusted-preserve.js',
      lifecycleName: 'b-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(sourceB.result.status, 0, sourceB.result.stderr);

    const conflict = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestA.filePath,
      lifecycleKeyFile: lifecycleA.filePath,
      manifestKeyId: 'new-manifest',
      lifecycleKeyId: 'new-lifecycle',
      manifestName: 'conflict-manifest.json',
      trustedName: 'trusted-output.js',
      lifecycleName: 'conflict-lifecycle.js',
      preserveTrustedKeysFrom: sourceB.trustedKeysOut,
    });
    assert.notEqual(conflict.result.status, 0);
    assert.match(outputOf(conflict.result), /different public key/);

    const malformedSource = path.join(dir, 'malformed-trusted.js');
    fs.writeFileSync(malformedSource, `
      Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_PUBLIC_KEYS', {
        value: {
          bad: {
            schemaVersion: 'coin-card-trusted-key-record.v1',
            keyId: 'bad',
            algorithm: 'ECDSA_P256_SHA256',
            publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'private' },
            issuerId: 'implicitex',
            usage: ['coin-card-manifest-signing'],
            status: 'ACTIVE',
            validFrom: '2026-07-15T00:00:00.000Z',
            validUntil: null,
            revokedAt: null,
            revocationReason: null,
            revocationPolicy: null,
            successorKeyId: null,
            environment: 'production'
          }
        }
      });
    `);
    const malformed = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestA.filePath,
      lifecycleKeyFile: lifecycleA.filePath,
      manifestKeyId: 'malformed-manifest',
      lifecycleKeyId: 'malformed-lifecycle',
      manifestName: 'malformed-manifest.json',
      trustedName: 'malformed-output.js',
      lifecycleName: 'malformed-lifecycle.js',
      preserveTrustedKeysFrom: malformedSource,
    });
    assert.notEqual(malformed.result.status, 0);
    assert.match(outputOf(malformed.result), /public key invalid/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator writes package outputs transactionally', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-transaction-'));
  try {
    const manifestKey = await makeKeyFile(dir, 'manifest');
    const lifecycleKey = await makeKeyFile(dir, 'lifecycle');
    const nextManifestKey = await makeKeyFile(dir, 'manifest-next');
    const nextLifecycleKey = await makeKeyFile(dir, 'lifecycle-next');
    const initialManifest = path.join(dir, 'package-manifest.json');
    const initialTrusted = path.join(dir, 'package-trusted.js');
    const initialLifecycle = path.join(dir, 'package-lifecycle.js');

    const baseline = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'ix-coin-card-manifest-transaction-test',
      lifecycleKeyId: 'ix-lifecycle-pub-transaction-test',
      manifestName: 'package-manifest.json',
      trustedName: 'package-trusted.js',
      lifecycleName: 'package-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(baseline.result.status, 0, baseline.result.stderr);
    const beforeManifest = fs.readFileSync(initialManifest, 'utf8');
    const beforeTrusted = fs.readFileSync(initialTrusted, 'utf8');
    const beforeLifecycle = fs.readFileSync(initialLifecycle, 'utf8');

    const failed = runIsolatedGenerator(dir, {
      manifestKeyFile: nextManifestKey.filePath,
      lifecycleKeyFile: nextLifecycleKey.filePath,
      manifestKeyId: 'ix-coin-card-manifest-transaction-next-test',
      lifecycleKeyId: 'ix-lifecycle-pub-transaction-next-test',
      manifestName: 'package-manifest.json',
      trustedName: 'package-trusted.js',
      lifecycleName: 'package-lifecycle.js',
      testFailPackagePromoteAfter: 'manifest',
      env: { COIN_CARD_GENERATOR_TEST_FAULTS: '1' },
    });
    assert.notEqual(failed.result.status, 0);
    assert.match(outputOf(failed.result), /simulated package promotion failure/);
    assert.equal(fs.readFileSync(initialManifest, 'utf8'), beforeManifest);
    assert.equal(fs.readFileSync(initialTrusted, 'utf8'), beforeTrusted);
    assert.equal(fs.readFileSync(initialLifecycle, 'utf8'), beforeLifecycle);
    assertNoPackageTemps(dir);

    const succeeded = runIsolatedGenerator(dir, {
      manifestKeyFile: nextManifestKey.filePath,
      lifecycleKeyFile: nextLifecycleKey.filePath,
      manifestKeyId: 'ix-coin-card-manifest-transaction-next-test',
      lifecycleKeyId: 'ix-lifecycle-pub-transaction-next-test',
      manifestName: 'package-manifest.json',
      trustedName: 'package-trusted.js',
      lifecycleName: 'package-lifecycle.js',
    });
    assert.equal(succeeded.result.status, 0, succeeded.result.stderr);
    assert.notEqual(fs.readFileSync(initialManifest, 'utf8'), beforeManifest);
    assert.notEqual(fs.readFileSync(initialTrusted, 'utf8'), beforeTrusted);
    assert.notEqual(fs.readFileSync(initialLifecycle, 'utf8'), beforeLifecycle);
    assertNoPackageTemps(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('generated manifest and lifecycle signatures verify through actual modules', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-verify-'));
  try {
    const v1Manifest = await makeKeyFile(dir, 'manifest-v1');
    const v1Lifecycle = await makeKeyFile(dir, 'lifecycle-v1');
    const v2Manifest = await makeKeyFile(dir, 'manifest-v2');
    const v2Lifecycle = await makeKeyFile(dir, 'lifecycle-v2');

    const v1 = runIsolatedGenerator(dir, {
      manifestKeyFile: v1Manifest.filePath,
      lifecycleKeyFile: v1Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-v1-test',
      lifecycleKeyId: 'ix-lifecycle-pub-v1-test',
      buildVersion: 'verify-v1',
      manifestName: 'v1-manifest.json',
      trustedName: 'v1-trusted.js',
      lifecycleName: 'v1-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(v1.result.status, 0, v1.result.stderr);

    const transition = runIsolatedGenerator(dir, {
      manifestKeyFile: v2Manifest.filePath,
      lifecycleKeyFile: v2Lifecycle.filePath,
      manifestKeyId: 'ix-coin-card-manifest-v2-test',
      lifecycleKeyId: 'ix-lifecycle-pub-v2-test',
      buildVersion: 'verify-v2',
      manifestName: 'v2-manifest.json',
      trustedName: 'transition-trusted.js',
      lifecycleName: 'v2-lifecycle.js',
      preserveTrustedKeysFrom: v1.trustedKeysOut,
    });
    assert.equal(transition.result.status, 0, transition.result.stderr);

    const v1Integrity = await verifyGeneratedManifest(v1.manifestOut, v1.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(v1.trustedKeysOut, 'utf8'),
    });
    assert.equal(v1Integrity.state, 'VERIFIED');

    const v2Integrity = await verifyGeneratedManifest(transition.manifestOut, transition.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(transition.trustedKeysOut, 'utf8'),
    });
    assert.equal(v2Integrity.state, 'VERIFIED');

    const staleV1WithV2Manifest = await verifyGeneratedManifest(transition.manifestOut, v1.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(transition.trustedKeysOut, 'utf8'),
    });
    assert.notEqual(staleV1WithV2Manifest.state, 'VERIFIED');

    const tamperedManifest = path.join(dir, 'tampered-v2-manifest.json');
    const tampered = JSON.parse(fs.readFileSync(transition.manifestOut, 'utf8'));
    tampered.buildVersion = 'tampered-build';
    fs.writeFileSync(tamperedManifest, JSON.stringify(tampered, null, 2), 'utf8');
    const tamperedResult = await verifyGeneratedManifest(tamperedManifest, transition.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(transition.trustedKeysOut, 'utf8'),
    });
    assert.notEqual(tamperedResult.state, 'VERIFIED');

    const trustedTamper = await verifyGeneratedManifest(transition.manifestOut, transition.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(transition.trustedKeysOut, 'utf8') + '\n// tampered\n',
    });
    assert.notEqual(trustedTamper.state, 'VERIFIED');

    const v1Bundle = await verifyGeneratedLifecycle(v1.lifecycleOut, v1.trustedKeysOut);
    assert.equal(v1Bundle.authenticated, true);
    const v2Bundle = await verifyGeneratedLifecycle(transition.lifecycleOut, transition.trustedKeysOut);
    assert.equal(v2Bundle.authenticated, true);
    const v2ManifestJson = JSON.parse(fs.readFileSync(transition.manifestOut, 'utf8'));
    assert.equal(v2Bundle.entries[0].record.manifestId, v2ManifestJson.manifestHash);

    const badBundlePath = path.join(dir, 'bad-lifecycle.js');
    const badBundle = JSON.parse(JSON.stringify(loadLifecycleBundle(transition.lifecycleOut)));
    badBundle.entries[0].manifestId = 'sha256:' + '00'.repeat(32);
    fs.writeFileSync(badBundlePath, `window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE = ${JSON.stringify(badBundle)};`, 'utf8');
    const badBundleResult = await verifyGeneratedLifecycle(badBundlePath, transition.trustedKeysOut);
    assert.equal(badBundleResult.authenticated, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator requires separate manifest and lifecycle signer keypairs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-separate-'));
  try {
    const shared = await makeKeyFile(dir, 'shared');
    const copyPath = path.join(dir, 'shared-copy.pkcs8.b64');
    fs.writeFileSync(copyPath, shared.material, 'utf8');
    fs.chmodSync(copyPath, 0o600);
    const other = await makeKeyFile(dir, 'other');

    const sameFile = runIsolatedGenerator(dir, {
      manifestKeyFile: shared.filePath,
      lifecycleKeyFile: shared.filePath,
      manifestKeyId: 'manifest-same-file',
      lifecycleKeyId: 'lifecycle-same-file',
      manifestName: 'same-file-manifest.json',
      trustedName: 'same-file-trusted.js',
      lifecycleName: 'same-file-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.notEqual(sameFile.result.status, 0);
    assert.match(outputOf(sameFile.result), /private-key files must be distinct|path collides/);

    const duplicateMaterial = runIsolatedGenerator(dir, {
      manifestKeyFile: shared.filePath,
      lifecycleKeyFile: copyPath,
      manifestKeyId: 'manifest-duplicate-material',
      lifecycleKeyId: 'lifecycle-duplicate-material',
      manifestName: 'duplicate-material-manifest.json',
      trustedName: 'duplicate-material-trusted.js',
      lifecycleName: 'duplicate-material-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.notEqual(duplicateMaterial.result.status, 0);
    assert.match(outputOf(duplicateMaterial.result), /signer keypairs must be distinct/);

    const envDuplicate = runIsolatedGenerator(dir, {
      manifestKeyEnv: 'TEST_DUPLICATE_SIGNER_KEY',
      lifecycleKeyEnv: 'TEST_DUPLICATE_SIGNER_KEY',
      manifestKeyId: 'manifest-env-duplicate',
      lifecycleKeyId: 'lifecycle-env-duplicate',
      manifestName: 'env-duplicate-manifest.json',
      trustedName: 'env-duplicate-trusted.js',
      lifecycleName: 'env-duplicate-lifecycle.js',
      initializeNewTrustSet: true,
      env: { TEST_DUPLICATE_SIGNER_KEY: shared.material },
    });
    assert.notEqual(envDuplicate.result.status, 0);
    assert.match(outputOf(envDuplicate.result), /signer keypairs must be distinct/);

    const success = runIsolatedGenerator(dir, {
      manifestKeyFile: shared.filePath,
      lifecycleKeyFile: other.filePath,
      manifestKeyId: 'manifest-distinct',
      lifecycleKeyId: 'lifecycle-distinct',
      manifestName: 'distinct-manifest.json',
      trustedName: 'distinct-trusted.js',
      lifecycleName: 'distinct-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(success.result.status, 0, success.result.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator rejects output key and preservation path aliases before writes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-paths-'));
  try {
    const manifestKey = await makeKeyFile(dir, 'manifest');
    const lifecycleKey = await makeKeyFile(dir, 'lifecycle');
    const output = path.join(dir, 'same-output.js');
    fs.writeFileSync(output, 'old-output', 'utf8');

    const sameOutput = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'path-manifest',
      lifecycleKeyId: 'path-lifecycle',
      manifestOutPath: output,
      trustedKeysOutPath: output,
      lifecycleOutPath: path.join(dir, 'lifecycle.js'),
      initializeNewTrustSet: true,
    });
    assert.notEqual(sameOutput.result.status, 0);
    assert.match(outputOf(sameOutput.result), /path collides/);
    assert.equal(fs.readFileSync(output, 'utf8'), 'old-output');

    const symlink = path.join(dir, 'same-output-link.js');
    fs.symlinkSync(output, symlink);
    const symlinkOutput = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'path-manifest-link',
      lifecycleKeyId: 'path-lifecycle-link',
      manifestOutPath: output,
      trustedKeysOutPath: symlink,
      lifecycleOutPath: path.join(dir, 'lifecycle-link.js'),
      initializeNewTrustSet: true,
    });
    assert.notEqual(symlinkOutput.result.status, 0);
    assert.match(outputOf(symlinkOutput.result), /path collides/);

    const outputKeyCollision = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'path-manifest-key',
      lifecycleKeyId: 'path-lifecycle-key',
      manifestOutPath: manifestKey.filePath,
      trustedKeysOutPath: path.join(dir, 'trusted-key-collision.js'),
      lifecycleOutPath: path.join(dir, 'lifecycle-key-collision.js'),
      initializeNewTrustSet: true,
    });
    assert.notEqual(outputKeyCollision.result.status, 0);
    assert.match(outputOf(outputKeyCollision.result), /path collides/);

    const preserveCollision = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'path-manifest-preserve',
      lifecycleKeyId: 'path-lifecycle-preserve',
      manifestOutPath: path.join(dir, 'manifest-preserve.json'),
      trustedKeysOutPath: path.join(dir, 'trusted-preserve.js'),
      lifecycleOutPath: path.join(dir, 'lifecycle-preserve.js'),
      preserveTrustedKeysFrom: manifestKey.filePath,
      initializeNewTrustSet: true,
    });
    assert.notEqual(preserveCollision.result.status, 0);
    assert.match(outputOf(preserveCollision.result), /path collides/);

    const realRoot = path.join(dir, 'real-root');
    const linkRoot = path.join(dir, 'link-root');
    fs.mkdirSync(realRoot);
    fs.symlinkSync(realRoot, linkRoot);
    const symlinkAncestor = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'path-manifest-ancestor',
      lifecycleKeyId: 'path-lifecycle-ancestor',
      manifestOutPath: path.join(linkRoot, 'missing', 'deeper', 'manifest.json'),
      trustedKeysOutPath: path.join(realRoot, 'missing', 'deeper', 'manifest.json'),
      lifecycleOutPath: path.join(dir, 'lifecycle-ancestor.js'),
      initializeNewTrustSet: true,
    });
    assert.notEqual(symlinkAncestor.result.status, 0);
    assert.match(outputOf(symlinkAncestor.result), /path collides/);

    const dotAlias = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'path-manifest-dot',
      lifecycleKeyId: 'path-lifecycle-dot',
      manifestOutPath: path.join(dir, '.', 'dot-output.json'),
      trustedKeysOutPath: path.join(dir, 'nested', '..', 'dot-output.json'),
      lifecycleOutPath: path.join(dir, 'lifecycle-dot.js'),
      initializeNewTrustSet: true,
    });
    assert.notEqual(dotAlias.result.status, 0);
    assert.match(outputOf(dotAlias.result), /path collides/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator rejects non-data trusted-key sources', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-data-only-'));
  try {
    const manifestKey = await makeKeyFile(dir, 'manifest');
    const lifecycleKey = await makeKeyFile(dir, 'lifecycle');
    const badSources = {
      'symbol-key': `var s = Symbol('x'); var r = {}; r[s] = true; window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = r;`,
      'symbol-to-string-tag': `var r = {}; Object.defineProperty(r, Symbol.toStringTag, { get: function () { return 'Object'; } }); window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = r;`,
      getter: `var r = {}; Object.defineProperty(r, 'bad', { get: function () { return {}; } }); window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = r;`,
      setter: `var r = {}; Object.defineProperty(r, 'bad', { set: function (_) {} }); window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = r;`,
      function: `window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = { bad: function () {} };`,
      prototype: `function C() {} C.prototype.x = 1; window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = new C();`,
      sparse: `var a = []; a[2] = 'x'; window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = { bad: { schemaVersion: a } };`,
      customArray: `var a = []; a.extra = true; window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = { bad: { schemaVersion: a } };`,
      cycle: `var r = {}; r.self = r; window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = r;`,
      depth: `var r = {}; var c = r; for (var i = 0; i < 40; i++) { c.next = {}; c = c.next; } window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = r;`,
      count: `var r = {}; for (var i = 0; i < 1100; i++) { r['k' + i] = {}; } window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = r;`,
      privateJwk: `window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = { bad: {
        schemaVersion: 'coin-card-trusted-key-record.v1',
        keyId: 'bad',
        algorithm: 'ECDSA_P256_SHA256',
        publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y', d: 'private' },
        issuerId: 'implicitex',
        usage: ['coin-card-manifest-signing'],
        status: 'ACTIVE',
        validFrom: '2026-07-15T00:00:00.000Z',
        validUntil: null,
        revokedAt: null,
        revocationReason: null,
        revocationPolicy: null,
        successorKeyId: null,
        environment: 'production'
      } };`,
    };

    for (const [name, body] of Object.entries(badSources)) {
      const sourcePath = path.join(dir, `${name}.js`);
      fs.writeFileSync(sourcePath, trustedSourceWithBody(body), 'utf8');
      const result = runIsolatedGenerator(dir, {
        manifestKeyFile: manifestKey.filePath,
        lifecycleKeyFile: lifecycleKey.filePath,
        manifestKeyId: `data-manifest-${name}`,
        lifecycleKeyId: `data-lifecycle-${name}`,
        manifestName: `${name}-manifest.json`,
        trustedName: `${name}-trusted.js`,
        lifecycleName: `${name}-lifecycle.js`,
        preserveTrustedKeysFrom: sourcePath,
      });
      assert.notEqual(result.result.status, 0, name);
    }

    const valid = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'data-manifest-valid',
      lifecycleKeyId: 'data-lifecycle-valid',
      manifestName: 'valid-manifest.json',
      trustedName: 'valid-trusted.js',
      lifecycleName: 'valid-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(valid.result.status, 0, valid.result.stderr);
    const transition = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'data-manifest-valid',
      lifecycleKeyId: 'data-lifecycle-valid',
      manifestName: 'valid-2-manifest.json',
      trustedName: 'valid-2-trusted.js',
      lifecycleName: 'valid-2-lifecycle.js',
      preserveTrustedKeysFrom: valid.trustedKeysOut,
    });
    assert.equal(transition.result.status, 0, transition.result.stderr);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation generator internal validation failures and stale source changes write no package', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-validation-'));
  try {
    const manifestKey = await makeKeyFile(dir, 'manifest');
    const lifecycleKey = await makeKeyFile(dir, 'lifecycle');
    const nextManifest = await makeKeyFile(dir, 'manifest-next');
    const nextLifecycle = await makeKeyFile(dir, 'lifecycle-next');

    const baseline = runIsolatedGenerator(dir, {
      manifestKeyFile: manifestKey.filePath,
      lifecycleKeyFile: lifecycleKey.filePath,
      manifestKeyId: 'validation-manifest',
      lifecycleKeyId: 'validation-lifecycle',
      manifestName: 'package-manifest.json',
      trustedName: 'package-trusted.js',
      lifecycleName: 'package-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(baseline.result.status, 0, baseline.result.stderr);
    const outputs = [baseline.manifestOut, baseline.trustedKeysOut, baseline.lifecycleOut];
    const before = snapshotFiles(outputs);

    for (const stage of ['trusted-keys', 'manifest', 'lifecycle']) {
      const failed = runIsolatedGenerator(dir, {
        manifestKeyFile: nextManifest.filePath,
        lifecycleKeyFile: nextLifecycle.filePath,
        manifestKeyId: `validation-manifest-${stage}`,
        lifecycleKeyId: `validation-lifecycle-${stage}`,
        manifestName: 'package-manifest.json',
        trustedName: 'package-trusted.js',
        lifecycleName: 'package-lifecycle.js',
        testFailValidationStage: stage,
        env: { COIN_CARD_GENERATOR_TEST_FAULTS: '1' },
      });
      assert.notEqual(failed.result.status, 0);
      assert.match(outputOf(failed.result), new RegExp(`simulated ${stage === 'trusted-keys' ? 'trusted-key' : stage} validation failure`));
      assertFilesMatchSnapshot(before);
      assertNoPackageTemps(dir);
    }

    for (const mutation of ['trusted-keys-output', 'manifest-output', 'lifecycle-output', 'delete-manifest-output']) {
      const stale = runIsolatedGenerator(dir, {
        manifestKeyFile: nextManifest.filePath,
        lifecycleKeyFile: nextLifecycle.filePath,
        manifestKeyId: `validation-manifest-${mutation}`,
        lifecycleKeyId: `validation-lifecycle-${mutation}`,
        manifestName: 'package-manifest.json',
        trustedName: 'package-trusted.js',
        lifecycleName: 'package-lifecycle.js',
        testMutateSourceBeforePromote: mutation,
        env: { COIN_CARD_GENERATOR_TEST_FAULTS: '1' },
      });
      assert.notEqual(stale.result.status, 0, mutation);
      assert.match(outputOf(stale.result), /source changed before package promotion/);
      if (mutation === 'trusted-keys-output') {
        assert.notEqual(fs.readFileSync(baseline.trustedKeysOut, 'utf8'), before[baseline.trustedKeysOut]);
        assert.equal(fs.readFileSync(baseline.manifestOut, 'utf8'), before[baseline.manifestOut]);
        assert.equal(fs.readFileSync(baseline.lifecycleOut, 'utf8'), before[baseline.lifecycleOut]);
        fs.writeFileSync(baseline.trustedKeysOut, before[baseline.trustedKeysOut], 'utf8');
      } else if (mutation === 'manifest-output') {
        assert.notEqual(fs.readFileSync(baseline.manifestOut, 'utf8'), before[baseline.manifestOut]);
        assert.equal(fs.readFileSync(baseline.trustedKeysOut, 'utf8'), before[baseline.trustedKeysOut]);
        assert.equal(fs.readFileSync(baseline.lifecycleOut, 'utf8'), before[baseline.lifecycleOut]);
        fs.writeFileSync(baseline.manifestOut, before[baseline.manifestOut], 'utf8');
      } else if (mutation === 'lifecycle-output') {
        assert.notEqual(fs.readFileSync(baseline.lifecycleOut, 'utf8'), before[baseline.lifecycleOut]);
        assert.equal(fs.readFileSync(baseline.trustedKeysOut, 'utf8'), before[baseline.trustedKeysOut]);
        assert.equal(fs.readFileSync(baseline.manifestOut, 'utf8'), before[baseline.manifestOut]);
        fs.writeFileSync(baseline.lifecycleOut, before[baseline.lifecycleOut], 'utf8');
      } else {
        assert.equal(fs.existsSync(baseline.manifestOut), false);
        assert.equal(fs.readFileSync(baseline.trustedKeysOut, 'utf8'), before[baseline.trustedKeysOut]);
        assert.equal(fs.readFileSync(baseline.lifecycleOut, 'utf8'), before[baseline.lifecycleOut]);
        fs.writeFileSync(baseline.manifestOut, before[baseline.manifestOut], 'utf8');
      }
    }

    const absentManifest = path.join(dir, 'absent-manifest.json');
    const createStale = runIsolatedGenerator(dir, {
      manifestKeyFile: nextManifest.filePath,
      lifecycleKeyFile: nextLifecycle.filePath,
      manifestKeyId: 'validation-manifest-create',
      lifecycleKeyId: 'validation-lifecycle-create',
      manifestOutPath: absentManifest,
      trustedName: 'package-trusted.js',
      lifecycleName: 'package-lifecycle.js',
      testMutateSourceBeforePromote: 'create-manifest-output',
      env: { COIN_CARD_GENERATOR_TEST_FAULTS: '1' },
    });
    assert.notEqual(createStale.result.status, 0);
    assert.match(outputOf(createStale.result), /source changed before package promotion/);
    assert.equal(fs.readFileSync(absentManifest, 'utf8'), 'simulated concurrent creation');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('rotation packages verify as complete conjunctions and reject mixed package relationships', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-rotation-conjunction-'));
  try {
    const aManifest = await makeKeyFile(dir, 'manifest-a');
    const aLifecycle = await makeKeyFile(dir, 'lifecycle-a');
    const bManifest = await makeKeyFile(dir, 'manifest-b');
    const bLifecycle = await makeKeyFile(dir, 'lifecycle-b');

    const pkgA = runIsolatedGenerator(dir, {
      manifestKeyFile: aManifest.filePath,
      lifecycleKeyFile: aLifecycle.filePath,
      manifestKeyId: 'conjunction-manifest-v1',
      lifecycleKeyId: 'conjunction-lifecycle-v1',
      manifestName: 'a-manifest.json',
      trustedName: 'a-trusted.js',
      lifecycleName: 'a-lifecycle.js',
      initializeNewTrustSet: true,
    });
    assert.equal(pkgA.result.status, 0, pkgA.result.stderr);
    const pkgB = runIsolatedGenerator(dir, {
      manifestKeyFile: bManifest.filePath,
      lifecycleKeyFile: bLifecycle.filePath,
      manifestKeyId: 'conjunction-manifest-v2',
      lifecycleKeyId: 'conjunction-lifecycle-v2',
      manifestName: 'b-manifest.json',
      trustedName: 'transition-trusted.js',
      lifecycleName: 'b-lifecycle.js',
      preserveTrustedKeysFrom: pkgA.trustedKeysOut,
    });
    assert.equal(pkgB.result.status, 0, pkgB.result.stderr);

    assert.equal((await verifyGeneratedManifest(pkgA.manifestOut, pkgA.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(pkgA.trustedKeysOut, 'utf8'),
    })).state, 'VERIFIED');
    assert.equal((await verifyGeneratedManifest(pkgB.manifestOut, pkgB.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(pkgB.trustedKeysOut, 'utf8'),
    })).state, 'VERIFIED');
    assert.equal((await verifyGeneratedLifecycle(pkgA.lifecycleOut, pkgA.trustedKeysOut)).authenticated, true);
    assert.equal((await verifyGeneratedLifecycle(pkgB.lifecycleOut, pkgB.trustedKeysOut)).authenticated, true);

    const manifestA = JSON.parse(fs.readFileSync(pkgA.manifestOut, 'utf8'));
    const manifestB = JSON.parse(fs.readFileSync(pkgB.manifestOut, 'utf8'));
    const cardId = loadLifecycleBundle(pkgA.lifecycleOut).entries[0].cardId;
    const aPipeline = await runGeneratedLifecyclePipeline(pkgA.lifecycleOut, pkgB.trustedKeysOut, cardId, manifestA.manifestHash);
    assert.equal(aPipeline.promoted.outcome, 'PRESENTATION_PROMOTED');
    const mixedPipeline = await runGeneratedLifecyclePipeline(pkgB.lifecycleOut, pkgB.trustedKeysOut, cardId, manifestA.manifestHash);
    assert.notEqual(mixedPipeline.promoted.outcome, 'PRESENTATION_PROMOTED');
    const bPipeline = await runGeneratedLifecyclePipeline(pkgB.lifecycleOut, pkgB.trustedKeysOut, cardId, manifestB.manifestHash);
    assert.equal(bPipeline.promoted.outcome, 'PRESENTATION_PROMOTED');

    const staleBootstrap = await verifyGeneratedManifest(pkgB.manifestOut, pkgA.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(pkgB.trustedKeysOut, 'utf8'),
    });
    assert.notEqual(staleBootstrap.state, 'VERIFIED');
    const mixedAssets = await verifyGeneratedManifest(pkgA.manifestOut, pkgB.trustedKeysOut, {
      'card/coin-card-trusted-keys.js': fs.readFileSync(pkgB.trustedKeysOut, 'utf8'),
    });
    assert.notEqual(mixedAssets.state, 'VERIFIED');
    const missingOutputPath = path.join(dir, 'missing-lifecycle.js');
    assert.equal(fs.existsSync(missingOutputPath), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(fs.existsSync(dir), false);
  }
});

test('dry-run publication covers every active registry card without writing artifacts', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'coin-card-signing-test-'));
  const manifestKeyPath = path.join(tempRoot, 'manifest.pkcs8.b64');
  const lifecycleKeyPath = path.join(tempRoot, 'lifecycle.pkcs8.b64');
  const before = generatedArtifactPaths.map((artifactPath) => fs.readFileSync(artifactPath));

  try {
    for (const keyPath of [manifestKeyPath, lifecycleKeyPath]) {
      const keyPair = await webcrypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify'],
      );
      const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      fs.writeFileSync(keyPath, Buffer.from(pkcs8).toString('base64'), { mode: 0o600 });
    }

    const result = runGenerator([
      '--dry-run',
      '--build-version',
      'coin-card-signing-test',
      '--manifest-key-id',
      'ix-coin-card-manifest-test-dry-run',
      '--lifecycle-key-id',
      'ix-lifecycle-pub-test-dry-run',
      '--manifest-key-file',
      manifestKeyPath,
      '--lifecycle-key-file',
      lifecycleKeyPath,
    ]);
    const output = result.stdout + result.stderr;

    assert.equal(result.status, 0, output);
    assert.match(output, /lifecycle records: 2/);
    assert.match(output, /cardIds: antoine, cc_demo_implicitex/);
    assert.doesNotMatch(output, /MIGH|BEGIN PRIVATE|PRIVATE KEY/);
    generatedArtifactPaths.forEach((artifactPath, index) => {
      assert.deepEqual(fs.readFileSync(artifactPath), before[index], artifactPath);
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
