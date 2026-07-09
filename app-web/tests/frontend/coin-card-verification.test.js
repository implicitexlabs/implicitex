const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const verificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-verification.js');
const cardPath = path.join(repoRoot, 'app-web/frontend/public/card/card.js');
const verificationSource = fs.readFileSync(verificationPath, 'utf8');
const cardSource = fs.readFileSync(cardPath, 'utf8');

const REQUIRED_ASSET_BODIES = {
  'card/coin-card-verification.js': 'coin-card-verification asset body',
  'card/card.js': 'card runtime asset body',
  'card/card.css': 'card stylesheet asset body',
  'js/ix-execution.js': 'ix execution asset body',
};

function sha256Hex(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function makeIntegrityManifest(overrides = {}) {
  const assets = (overrides.assets || Object.keys(REQUIRED_ASSET_BODIES).map((assetPath) => ({
    path: assetPath,
    sha256: sha256Hex(REQUIRED_ASSET_BODIES[assetPath]),
    bytes: Buffer.byteLength(REQUIRED_ASSET_BODIES[assetPath]),
  }))).map((asset) => ({ ...asset }));

  return {
    schemaVersion: 'coin-card-manifest.v1',
    cardId: 'cc_demo_implicitex',
    coinCardVersion: 'coin-card.v1',
    recipient: '0x0000000000000000000000000000000000000000',
    network: 'polygon-mainnet',
    registryStatus: 'active',
    layoutVersion: 'coin-card-layout.v1',
    buildVersion: 'dev',
    assets,
    signature: {
      mode: 'unsigned-dev',
      algorithm: null,
      value: null,
    },
    manifestHash: 'sha256:' + '11'.repeat(32),
    ...overrides,
  };
}

function makeDigest() {
  return {
    digest(algorithm, bytes) {
      assert.equal(algorithm, 'SHA-256');
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const digest = createHash('sha256').update(buffer).digest();
      return Promise.resolve(digest.buffer.slice(digest.byteOffset, digest.byteOffset + digest.byteLength));
    },
  };
}

function loadVerification(options = {}) {
  const context = {
    Object,
    Promise,
    String,
    Uint8Array,
    TextEncoder,
    window: {},
  };
  context.globalThis = context;
  if (options.crypto) {
    context.window.crypto = options.crypto;
  } else if (!options.cryptoUnavailable) {
    context.window.crypto = { subtle: makeDigest() };
  }
  context.window.TextEncoder = options.TextEncoder || TextEncoder;
  context.TextEncoder = options.TextEncoder || TextEncoder;
  if (options.trustedPublicKeys) {
    context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = options.trustedPublicKeys;
  }
  if (typeof options.atob === 'function') {
    context.atob = options.atob;
    context.window.atob = options.atob;
  }
  if (typeof options.btoa === 'function') {
    context.btoa = options.btoa;
    context.window.btoa = options.btoa;
  }
  vm.runInNewContext(verificationSource, context, { filename: verificationPath });
  return context.window.IX_COIN_CARD_VERIFICATION;
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function toBase64(value) {
  return Buffer.from(value).toString('base64');
}

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return toBase64(value);
}

function validIntegrityManifest(overrides = {}) {
  return makeIntegrityManifest(overrides);
}

const expectedStateCopy = {
  VERIFIED: {
    statusLabel: 'Verified',
    primaryMessage: 'This Coin Card matches the issued ImplicitEx package.',
    actionLabel: 'Continue',
  },
  ASSET_HASHES_PASSED: {
    statusLabel: 'Integrity checks passed',
    primaryMessage: 'This Coin Card matches the issued Integrity Manifest assets.',
    actionLabel: 'Transfers disabled',
  },
  INTEGRITY_FAILED: {
    statusLabel: 'Integrity check failed',
    primaryMessage: 'This Coin Card does not match the issued ImplicitEx package.',
    actionLabel: 'Transfers disabled',
  },
  CARD_REVOKED: {
    statusLabel: 'Revoked',
    primaryMessage: 'This Coin Card is no longer operationally valid.',
    actionLabel: 'Transfers disabled',
  },
  VERIFICATION_UNAVAILABLE: {
    statusLabel: 'Verification unavailable',
    primaryMessage: 'This Coin Card cannot currently be verified.',
    actionLabel: 'Transfers disabled',
  },
};
const requiredAssetPaths = [
  'card/coin-card-verification.js',
  'card/card.js',
  'card/card.css',
  'js/ix-execution.js',
];

function makeElement(id) {
  const attributes = new Map();
  const listeners = new Map();
  const classListState = new Set();
  return {
    id,
    dataset: {},
    className: '',
    disabled: false,
    href: '',
    style: {},
    textContent: '',
    title: '',
    value: '',
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    dispatch(type) {
      const handler = listeners.get(type);
      if (handler) handler({ target: this });
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    classList: {
      toggle(name, enabled) {
        if (enabled) classListState.add(name);
        else classListState.delete(name);
      },
    },
  };
}

function loadCoinCard(options = {}) {
  const elements = new Map();
  const ids = [
    'ccFrame', 'ccChip', 'ccAmountInput', 'ccAmountField', 'ccTxLabel',
    'ccFeeValue', 'ccTotalValue', 'ccCardName', 'ccReviewName', 'ccExecName',
    'ccConfirmedName', 'ccErrorName', 'ccCardRecipient', 'ccReviewRecipient',
    'ccExecRecipient', 'ccConfirmedRecipient', 'ccErrorRecipient',
    'ccCardNetwork', 'ccAmountToken', 'ccFeePctLabel', 'ccReviewFeePct',
    'ccCardStatus', 'ccStatusDot', 'ccStatusLabel', 'ccErrorMessage',
    'ccErrorSub', 'ccSelfSendWarn', 'ccExecLabel', 'ccExecAmount',
    'ccReviewAmount', 'ccReviewFee', 'ccReviewTotal', 'ccErrorStateLabel',
    'ccCardError', 'ccTxHash', 'ccConfirmedAmount',
  ];
  ids.forEach((id) => elements.set(id, makeElement(id)));
  const frame = elements.get('ccFrame');
  if (options.integrityManifestPointer !== null) {
    frame.setAttribute('data-ix-manifest', options.integrityManifestPointer || 'coin-card-manifest.json');
  }

  const executionCalls = [];
  const verification = loadVerification();
  const verificationCalls = [];
  const wrappedVerification = Object.assign({}, verification, {
    readIntegrityManifestPointer(root) {
      verificationCalls.push({ type: 'readIntegrityManifestPointer', root });
      if (!root.getAttribute('data-ix-manifest')) {
        return {
          state: verification.STATES.VERIFICATION_UNAVAILABLE,
          integrityManifestUrl: null,
          manifestUrl: null,
          error: 'integrity-manifest-pointer-missing',
        };
      }
      return {
        state: null,
        integrityManifestUrl: 'coin-card-manifest.json',
        manifestUrl: 'coin-card-manifest.json',
        error: null,
      };
    },
    loadIntegrityManifest(pointer, fetchImpl) {
      verificationCalls.push({ type: 'loadIntegrityManifest', pointer });
      if (typeof options.loadIntegrityManifest === 'function') {
        return options.loadIntegrityManifest(pointer, fetchImpl);
      }
      if (options.integrityManifestResult) {
        return Promise.resolve(options.integrityManifestResult);
      }
      return Promise.resolve({
        state: verification.STATES.ASSET_HASHES_PASSED,
        integrityManifest: validIntegrityManifest(),
        metadata: {
          ...validIntegrityManifest(),
          assetIntegrityStatus: 'passed',
          assetPaths: requiredAssetPaths,
        },
        error: null,
        requiredAssetPaths,
        assetPaths: requiredAssetPaths,
      });
    },
    canExecuteTransfer(state) {
      verificationCalls.push({ type: 'canExecuteTransfer', state });
      return options.canExecuteTransfer !== false && verification.canExecuteTransfer(state);
    },
  });

  const context = {
    console,
    Date,
    Error,
    Math,
    Number,
    Promise,
    String,
    encodeURIComponent,
    isFinite,
    parseFloat,
    setTimeout,
    document: {
      readyState: 'complete',
      getElementById(id) {
        return elements.get(id) || null;
      },
      addEventListener() {},
    },
    window: {
      IX_COIN_CARD_VERIFICATION: wrappedVerification,
      IX_EXECUTION: {
        toRawUsdc(amount) {
          return BigInt(Math.round(Number(amount) * 1000000));
        },
        calculateFee(rawAmount) {
          return {
            fee: rawAmount / 100n,
            total: rawAmount + rawAmount / 100n,
          };
        },
        executeTransfer(request) {
          executionCalls.push(request);
          if (request.action === 'prepare') {
            return Promise.resolve({
              status: 'ready-to-send',
              sender: '0x1111111111111111111111111111111111111111',
            });
          }
          if (request.action === 'execute') {
            return Promise.resolve({
              status: 'confirmed',
              receipt: {
                txHash: '0x' + 'aa'.repeat(32),
                explorerUrl: 'https://polygonscan.com/tx/' + '0x' + 'aa'.repeat(32),
              },
            });
          }
          return Promise.resolve({ status: 'failed' });
        },
      },
      crypto: { subtle: makeDigest() },
      location: {
        pathname: '/card/demo-card',
      },
      parent: null,
      addEventListener() {},
    },
    fetch(url) {
      if (url === '/registry/coincards/demo-card.json') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            schema: 'implicitex.coincard.v1',
            cardId: 'demo-card',
            status: options.registryRecordStatus || 'active',
            recipient: '0x2222222222222222222222222222222222222222',
            chainId: 137,
            token: 'USDC',
            displayName: 'Demo Recipient',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    },
  };
  context.globalThis = context;
  context.window.window = context.window;
  context.window.parent = context.window;
  context.window.fetch = context.fetch;

  vm.runInNewContext(cardSource, context, { filename: cardPath });

  return { elements, executionCalls, verificationCalls };
}

async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function waitFor(predicate, options = {}) {
  const attempts = options.attempts || 20;
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return;
    await settle();
  }
  assert.fail(options.message || 'Timed out waiting for condition');
}

test('VERIFIED allows execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.VERIFIED), true);
});

test('INTEGRITY_FAILED blocks execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.INTEGRITY_FAILED), false);
});

test('CARD_REVOKED blocks execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.CARD_REVOKED), false);
});

test('VERIFICATION_UNAVAILABLE blocks execution', () => {
  const verification = loadVerification();
  assert.equal(verification.canExecuteTransfer(verification.STATES.VERIFICATION_UNAVAILABLE), false);
});

test('missing Integrity Manifest pointer becomes VERIFICATION_UNAVAILABLE', () => {
  const verification = loadVerification();
  const result = verification.readIntegrityManifestPointer({
    getAttribute() {
      return null;
    },
  });

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.integrityManifestUrl, null);
  assert.equal(result.manifestUrl, null);
  assert.equal(result.error, 'integrity-manifest-pointer-missing');
});

test('every known verification state returns controlled copy', () => {
  const verification = loadVerification();

  for (const state of Object.values(verification.STATES)) {
    const copy = verification.getStateCopy(state);
    assert.equal(copy.statusLabel, expectedStateCopy[state].statusLabel, state);
    assert.equal(copy.primaryMessage, expectedStateCopy[state].primaryMessage, state);
    assert.equal(copy.actionLabel, expectedStateCopy[state].actionLabel, state);
  }
});

test('unknown verification state copy normalizes to VERIFICATION_UNAVAILABLE', () => {
  const verification = loadVerification();

  assert.equal(verification.normalizeState('BROKEN'), verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(
    verification.getStateCopy('BROKEN').primaryMessage,
    expectedStateCopy.VERIFICATION_UNAVAILABLE.primaryMessage,
  );
});

test('loadIntegrityManifest exposes metadata without approving execution', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => ({
    ok: true,
    url,
    json: async () => validIntegrityManifest(),
    arrayBuffer: async () => Buffer.from(REQUIRED_ASSET_BODIES[url] || '', 'utf8'),
  }));

  assert.equal(result.state, verification.STATES.ASSET_HASHES_PASSED);
  assert.equal(verification.canExecuteTransfer(result.state), false);
  assert.equal(result.error, null);
  assert.equal(result.metadata.cardId, 'cc_demo_implicitex');
  assert.equal(result.metadata.schemaVersion, 'coin-card-manifest.v1');
  assert.equal(result.metadata.signatureMode, 'unsigned-dev');
  assert.equal(result.metadata.assetIntegrityStatus, 'passed');
  assert.deepEqual(result.metadata.assetPaths, requiredAssetPaths);
});

test('loadIntegrityManifest hashes required assets in browser', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();
  const assetBodies = Object.fromEntries(
    Object.entries(REQUIRED_ASSET_BODIES).map(([assetPath, body]) => [assetPath, body]),
  );

  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => {
    if (url === 'coin-card-manifest.json') {
      return {
        ok: true,
        status: 200,
        json: async () => manifest,
      };
    }

    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(assetBodies[url], 'utf8'),
    };
  });

  assert.equal(result.state, verification.STATES.ASSET_HASHES_PASSED);
  assert.equal(result.metadata.assetIntegrityStatus, 'passed');
  assert.deepEqual(Array.from(result.requiredAssetPaths), requiredAssetPaths);
  assert.deepEqual(result.assetPaths, requiredAssetPaths);
});

test('canonicalizeIntegrityManifestPayload ignores top-level field order', () => {
  const verification = loadVerification();
  const baseManifest = validIntegrityManifest();
  const reorderedManifest = {};
  reorderedManifest.signature = baseManifest.signature;
  reorderedManifest.manifestHash = baseManifest.manifestHash;
  reorderedManifest.assets = baseManifest.assets.map((asset) => ({
    sha256: asset.sha256,
    bytes: asset.bytes,
    path: asset.path,
  }));
  reorderedManifest.buildVersion = baseManifest.buildVersion;
  reorderedManifest.layoutVersion = baseManifest.layoutVersion;
  reorderedManifest.registryStatus = baseManifest.registryStatus;
  reorderedManifest.network = baseManifest.network;
  reorderedManifest.recipient = baseManifest.recipient;
  reorderedManifest.coinCardVersion = baseManifest.coinCardVersion;
  reorderedManifest.cardId = baseManifest.cardId;
  reorderedManifest.schemaVersion = baseManifest.schemaVersion;

  const basePayload = verification.canonicalizeIntegrityManifestPayload(baseManifest);
  const reorderedPayload = verification.canonicalizeIntegrityManifestPayload(reorderedManifest);

  assert.equal(basePayload, reorderedPayload);
  assert(!basePayload.includes('signature'));
  assert(!basePayload.includes('manifestHash'));
});

test('canonicalizeIntegrityManifestPayload changes when recipient changes', () => {
  const verification = loadVerification();
  const baseManifest = validIntegrityManifest();
  const mutatedManifest = validIntegrityManifest({
    recipient: '0x1111111111111111111111111111111111111111',
  });

  assert.notEqual(
    verification.canonicalizeIntegrityManifestPayload(baseManifest),
    verification.canonicalizeIntegrityManifestPayload(mutatedManifest),
  );
});

test('canonicalizeIntegrityManifestPayload changes when protected assets change', () => {
  const verification = loadVerification();
  const baseManifest = validIntegrityManifest();
  const mutatedManifest = validIntegrityManifest({
    assets: baseManifest.assets.map((asset) => (
      asset.path === 'card/card.css'
        ? { path: asset.path, sha256: asset.sha256, bytes: asset.bytes + 1 }
        : asset
    )),
  });

  assert.notEqual(
    verification.canonicalizeIntegrityManifestPayload(baseManifest),
    verification.canonicalizeIntegrityManifestPayload(mutatedManifest),
  );
});

test('verifyP256Signature validates a signed-p256-v1 manifest with Web Crypto', async () => {
  const verification = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
  });
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const manifest = validIntegrityManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      value: '',
    },
  });
  const canonicalPayload = verification.canonicalizeIntegrityManifestPayload(manifest);
  const payloadBytes = new TextEncoder().encode(canonicalPayload);
  const signatureBytes = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    payloadBytes,
  );
  manifest.signature.value = toBase64Url(signatureBytes);

  const result = await verification.verifyP256Signature(manifest, publicKey);
  assert.equal(result.ok, true);
  assert.equal(result.valid, true);
  assert.equal(result.state, verification.STATES.VERIFIED);
  assert.equal(result.signatureMode, 'signed-p256-v1');
  assert.equal(result.keyId, 'coin-card-test-key');
});

test('verifyP256Signature rejects a tampered signed-p256-v1 manifest', async () => {
  const verification = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
  });
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const manifest = validIntegrityManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      value: '',
    },
  });
  const canonicalPayload = verification.canonicalizeIntegrityManifestPayload(manifest);
  const payloadBytes = new TextEncoder().encode(canonicalPayload);
  const signatureBytes = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    payloadBytes,
  );
  manifest.signature.value = toBase64Url(signatureBytes);
  manifest.recipient = '0x2222222222222222222222222222222222222222';

  const result = await verification.verifyP256Signature(manifest, publicKey);
  assert.equal(result.ok, true);
  assert.equal(result.valid, false);
  assert.equal(result.state, verification.STATES.INTEGRITY_FAILED);
  assert.equal(result.error, 'integrity-manifest-signature-invalid');
});

test('evaluateSignaturePolicy keeps unsigned-dev at ASSET_HASHES_PASSED', () => {
  const verification = loadVerification();
  const assetHashResult = {
    state: verification.STATES.ASSET_HASHES_PASSED,
    integrityManifest: validIntegrityManifest(),
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  };

  const result = verification.evaluateSignaturePolicy(validIntegrityManifest(), assetHashResult);
  assert.equal(result.state, verification.STATES.ASSET_HASHES_PASSED);
});

test('evaluateSignaturePolicy missing signature becomes VERIFICATION_UNAVAILABLE', () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();
  delete manifest.signature;

  const result = verification.evaluateSignaturePolicy(manifest, {
    state: verification.STATES.ASSET_HASHES_PASSED,
    integrityManifest: manifest,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-signature-missing');
});

test('evaluateSignaturePolicy unsupported signature mode becomes VERIFICATION_UNAVAILABLE', () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest({
    signature: {
      mode: 'signed-v2',
      algorithm: 'rsa-pss',
      value: 'signed',
    },
  });

  const result = verification.evaluateSignaturePolicy(manifest, {
    state: verification.STATES.ASSET_HASHES_PASSED,
    integrityManifest: manifest,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-signature-mode-unsupported');
  assert.equal(result.signatureMode, 'signed-v2');
});

test('evaluateSignaturePolicy invalid supported signature becomes INTEGRITY_FAILED', async () => {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const verification = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
    trustedPublicKeys: {
      'coin-card-test-key': publicKey,
    },
  });
  const manifest = validIntegrityManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      value: '',
    },
  });
  const canonicalPayload = verification.canonicalizeIntegrityManifestPayload(manifest);
  const payloadBytes = new TextEncoder().encode(canonicalPayload);
  const signatureBytes = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    payloadBytes,
  );
  manifest.signature.value = toBase64Url(signatureBytes);
  manifest.recipient = '0x2222222222222222222222222222222222222222';

  const result = await verification.evaluateSignaturePolicy(manifest, {
    state: verification.STATES.ASSET_HASHES_PASSED,
    integrityManifest: manifest,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  assert.equal(result.state, verification.STATES.INTEGRITY_FAILED);
  assert.equal(result.error, 'integrity-manifest-signature-invalid');
  assert.equal(result.signatureMode, 'signed-p256-v1');
});

test('evaluateSignaturePolicy supported valid signature with unknown key remains unavailable', () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'missing-key',
      value: 'signed',
    },
  });

  const result = verification.evaluateSignaturePolicy(manifest, {
    state: verification.STATES.ASSET_HASHES_PASSED,
    integrityManifest: manifest,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-public-key-unavailable');
  assert.equal(result.keyId, 'missing-key');
});

test('evaluateSignaturePolicy supported valid signature with known key can verify', async () => {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const verification = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
    trustedPublicKeys: {
      'coin-card-test-key': publicKey,
    },
  });
  const manifest = validIntegrityManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      value: '',
    },
  });
  const canonicalPayload = verification.canonicalizeIntegrityManifestPayload(manifest);
  const payloadBytes = new TextEncoder().encode(canonicalPayload);
  const signatureBytes = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    payloadBytes,
  );
  manifest.signature.value = toBase64Url(signatureBytes);

  const result = await verification.evaluateSignaturePolicy(manifest, {
    state: verification.STATES.ASSET_HASHES_PASSED,
    integrityManifest: manifest,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  assert.equal(result.state, verification.STATES.VERIFIED);
  assert.equal(result.valid, true);
  assert.equal(result.signatureMode, 'signed-p256-v1');
  assert.equal(result.keyId, 'coin-card-test-key');
});

test('loadIntegrityManifest hash mismatch becomes INTEGRITY_FAILED', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest({
    assets: validIntegrityManifest().assets.map((asset) => (
      asset.path === 'card/card.css'
        ? { ...asset, sha256: 'sha256:' + 'ff'.repeat(32) }
        : asset
    )),
  });

  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => {
    if (url === 'coin-card-manifest.json') {
      return {
        ok: true,
        status: 200,
        json: async () => manifest,
      };
    }

    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(REQUIRED_ASSET_BODIES[url], 'utf8'),
    };
  });

  assert.equal(result.state, verification.STATES.INTEGRITY_FAILED);
  assert.equal(result.error, 'integrity-manifest-asset-hash-mismatch');
  assert.equal(result.assetPath, 'card/card.css');
});

test('loadIntegrityManifest fetch failure becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => {
    if (url === 'coin-card-manifest.json') {
      return {
        ok: true,
        status: 200,
        json: async () => validIntegrityManifest(),
      };
    }

    if (url === 'card/card.css') {
      return Promise.reject(new Error('offline'));
    }

    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(REQUIRED_ASSET_BODIES[url], 'utf8'),
    };
  });

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-asset-fetch-failed');
});

test('loadIntegrityManifest crypto unavailable becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification({ cryptoUnavailable: true });
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    status: 200,
    json: async () => validIntegrityManifest(),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-crypto-unavailable');
});

test('required Integrity Manifest asset policy is exact for v1', () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();

  assert.deepEqual(Array.from(verification.getRequiredAssetPaths()), requiredAssetPaths);
  assert.equal(verification.hasRequiredAssets(manifest), true);
  assert.equal(
    verification.hasRequiredAssets(validIntegrityManifest({
      assets: manifest.assets.filter((asset) => asset.path !== 'js/ix-execution.js'),
    })),
    false,
  );
  assert.equal(
    verification.hasRequiredAssets(validIntegrityManifest({
      assets: manifest.assets.concat([{ path: 'extra.js', sha256: 'sha256:test', bytes: 1 }]),
    })),
    false,
  );
});

test('loadIntegrityManifest parse failure becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => {
      throw new Error('bad json');
    },
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.integrityManifest, null);
  assert.equal(result.metadata, null);
  assert.equal(result.error, 'integrity-manifest-parse-failed');
});

test('loadIntegrityManifest missing required field becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const integrityManifest = validIntegrityManifest();
  delete integrityManifest.manifestHash;

  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => integrityManifest,
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-missing-required-field');
  assert.equal(result.field, 'manifestHash');
});

test('loadIntegrityManifest unsupported schema becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({ schemaVersion: 'coin-card-manifest.v2' }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.integrityManifest, null);
  assert.equal(result.metadata, null);
  assert.equal(result.error, 'integrity-manifest-schema-unsupported');
});

test('loadIntegrityManifest missing required protected asset becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({
      assets: manifest.assets.filter((asset) => asset.path !== 'card/card.js'),
    }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.integrityManifest, null);
  assert.equal(result.error, 'integrity-manifest-asset-policy-mismatch');
  assert.deepEqual(Array.from(result.requiredAssetPaths), requiredAssetPaths);
  assert(!result.assetPaths.includes('card/card.js'));
});

test('loadIntegrityManifest extra protected asset becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({
      assets: manifest.assets.concat([{ path: 'card/extra.js', sha256: 'sha256:test', bytes: 1 }]),
    }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-asset-policy-mismatch');
  assert(result.assetPaths.includes('card/extra.js'));
});

test('loadIntegrityManifest duplicate protected asset becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({
      assets: manifest.assets.slice(0, -1).concat([manifest.assets[0]]),
    }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-asset-policy-mismatch');
});

test('ASSET_HASHES_PASSED renders the correct disabled copy', async () => {
  const runtime = loadCoinCard();

  await waitFor(
    () => runtime.elements.get('ccCardError').textContent === expectedStateCopy.ASSET_HASHES_PASSED.primaryMessage,
    {
      message: JSON.stringify({
        errorMessage: runtime.elements.get('ccErrorMessage').textContent,
        cardError: runtime.elements.get('ccCardError').textContent,
        statusLabel: runtime.elements.get('ccErrorStateLabel').textContent,
        chipDisabled: runtime.elements.get('ccChip').disabled,
        verificationCalls: runtime.verificationCalls,
      }),
    },
  );

  assert.equal(runtime.elements.get('ccCardError').textContent, expectedStateCopy.ASSET_HASHES_PASSED.primaryMessage);
  assert.equal(runtime.elements.get('ccErrorStateLabel').textContent, expectedStateCopy.ASSET_HASHES_PASSED.statusLabel);
  assert.equal(runtime.elements.get('ccChip').disabled, true);
  assert(runtime.verificationCalls.some((call) => call.type === 'canExecuteTransfer' && call.state === 'ASSET_HASHES_PASSED'));
  assert.deepEqual(runtime.executionCalls, []);
});

test('blocked verification states still render the correct disabled copy', async () => {
  for (const blockedState of ['INTEGRITY_FAILED', 'CARD_REVOKED', 'VERIFICATION_UNAVAILABLE']) {
    const runtime = blockedState === 'CARD_REVOKED'
      ? loadCoinCard({ registryRecordStatus: 'revoked' })
      : blockedState === 'INTEGRITY_FAILED'
        ? loadCoinCard({
          integrityManifestResult: {
            state: 'INTEGRITY_FAILED',
            integrityManifest: null,
            metadata: null,
            error: 'integrity-manifest-asset-hash-mismatch',
            assetPath: 'card/card.css',
          },
        })
        : loadCoinCard({
          integrityManifestResult: {
            state: 'VERIFICATION_UNAVAILABLE',
            integrityManifest: null,
            metadata: null,
            error: 'integrity-manifest-asset-fetch-failed',
          },
        });

    await waitFor(
      () => runtime.elements.get('ccCardError').textContent === expectedStateCopy[blockedState].primaryMessage,
      {
        message: JSON.stringify({
          blockedState,
          errorMessage: runtime.elements.get('ccErrorMessage').textContent,
          cardError: runtime.elements.get('ccCardError').textContent,
          statusLabel: runtime.elements.get('ccErrorStateLabel').textContent,
          chipDisabled: runtime.elements.get('ccChip').disabled,
          verificationCalls: runtime.verificationCalls,
        }),
      },
    );
    const chip = runtime.elements.get('ccChip');

    chip.dispatch('click');
    await settle();

    assert.deepEqual(runtime.executionCalls, [], blockedState);
    assert.equal(runtime.elements.get('ccErrorStateLabel').textContent, expectedStateCopy[blockedState].statusLabel, blockedState);
    assert.equal(runtime.elements.get('ccCardError').textContent, expectedStateCopy[blockedState].primaryMessage, blockedState);
    assert.equal(runtime.elements.get('ccChip').disabled, true, blockedState);
    if (blockedState === 'CARD_REVOKED') {
      assert(!runtime.verificationCalls.some((call) => call.type === 'canExecuteTransfer'), blockedState);
    } else {
      assert(runtime.verificationCalls.some((call) => call.type === 'canExecuteTransfer' && call.state === blockedState), blockedState);
    }
  }
});
