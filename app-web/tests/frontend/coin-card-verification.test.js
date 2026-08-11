const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const verificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-verification.js');
const trustedKeysPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-keys.js');
const trustedKeyResolutionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const cardPath = path.join(repoRoot, 'app-web/frontend/public/card/card.js');
const verificationSource = fs.readFileSync(verificationPath, 'utf8');
const trustedKeysSource = fs.readFileSync(trustedKeysPath, 'utf8');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const cardSource = fs.readFileSync(cardPath, 'utf8');

const REQUIRED_ASSET_BODIES = {
  'js/ix-execution.js': 'ix execution asset body',
  'js/vendor/qrcode.min.js': 'qrcode vendor asset body',
  'card/coin-card-trusted-keys.js': 'coin-card-trusted-keys asset body',
  'card/coin-card-trusted-key-resolution.js': 'coin-card-trusted-key-resolution asset body',
  'card/coin-card-canonical-json-v1.js': 'coin-card-canonical-json-v1 asset body',
  'card/coin-card-lifecycle-registry.js': 'coin-card-lifecycle-registry asset body',
  'card/coin-card-lifecycle-record-verification.js': 'coin-card-lifecycle-record-verification asset body',
  'card/coin-card-lifecycle-bundle-verification.js': 'coin-card-lifecycle-bundle-verification asset body',
  'card/coin-card-lifecycle-record-selection.js': 'coin-card-lifecycle-record-selection asset body',
  'card/coin-card-lifecycle-resolution.js': 'coin-card-lifecycle-resolution asset body',
  'card/coin-card-lifecycle-presentation.js': 'coin-card-lifecycle-presentation asset body',
  'card/coin-card-execution-authorization.js': 'coin-card-execution-authorization asset body',
  'card/coin-card-review-projection-contract.js': 'coin-card-review-projection-contract asset body',
  'card/coin-card-verification.js': 'coin-card-verification asset body',
  'card/card.js': 'card runtime asset body',
  'card/card.css': 'card stylesheet asset body',
  'card/index.html': 'card document asset body',
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
    scope: 'coin-card-runtime-package',
    coinCardVersion: 'coin-card.v1',
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
  vm.runInNewContext(trustedKeyResolutionSource, context, { filename: trustedKeyResolutionPath });
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

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach((key) => {
    deepFreeze(value[key]);
  });
  return Object.freeze(value);
}

const TEST_PUBLIC_JWK = deepFreeze({
  kty: 'EC',
  crv: 'P-256',
  x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  ext: true,
  key_ops: ['verify'],
});

function trustedKeyRecord(keyId, publicKey, overrides = {}) {
  return deepFreeze({
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey,
    issuerId: 'implicitex',
    usage: ['coin-card-manifest-signing'],
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

function signedManifest(overrides = {}) {
  return validIntegrityManifest({
    keyId: 'coin-card-test-key',
    issuerId: 'implicitex',
    environment: 'production',
    signedAt: '2026-07-01T00:00:00.000Z',
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      value: '',
    },
    ...overrides,
  });
}

async function signManifestWithKeyPair(verification, manifest, keyPair) {
  const canonicalPayload = verification.canonicalizeIntegrityManifestPayload(manifest);
  const payloadBytes = new TextEncoder().encode(canonicalPayload);
  const signatureBytes = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    payloadBytes,
  );
  manifest.signature.value = toBase64Url(signatureBytes);
  return manifest;
}

const expectedStateCopy = {
  VERIFIED: {
    statusLabel: 'Route Verified',
    primaryMessage: 'This Coin Card route matches the issued ImplicitEx package.',
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
  'js/ix-execution.js',
  'js/vendor/qrcode.min.js',
  'card/coin-card-trusted-keys.js',
  'card/coin-card-trusted-key-resolution.js',
  'card/coin-card-canonical-json-v1.js',
  'card/coin-card-lifecycle-registry.js',
  'card/coin-card-lifecycle-record-verification.js',
  'card/coin-card-lifecycle-bundle-verification.js',
  'card/coin-card-lifecycle-record-selection.js',
  'card/coin-card-lifecycle-resolution.js',
  'card/coin-card-lifecycle-presentation.js',
  'card/coin-card-execution-authorization.js',
  'card/coin-card-review-projection-contract.js',
  'card/coin-card-verification.js',
  'card/card.js',
  'card/card.css',
  'card/index.html',
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

test('trusted key source bootstrap initializes a frozen production allowlist', () => {
  const context = {
    Object,
    window: {},
  };
  context.globalThis = context;
  vm.runInNewContext(trustedKeysSource, context, { filename: trustedKeysPath });

  assert.equal(context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS && typeof context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS, 'object');
  assert.equal(Object.isFrozen(context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS), true);
  // Production bootstrap contains v1 and v2 manifest-signing and registry-publication keys.
  assert.deepEqual(
    Object.keys(context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS),
    [
      'ix-coin-card-manifest-v1',
      'ix-coin-card-manifest-v2',
      'ix-lifecycle-pub-v1',
      'ix-lifecycle-pub-v2',
    ],
  );
});

test('trusted key source rejects frozen accessor entries', () => {
  const trustedKeys = {};
  Object.defineProperty(trustedKeys, 'coin-card-test-key', {
    enumerable: true,
    get() {
      return trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK);
    },
  });
  Object.freeze(trustedKeys);

  const verification = loadVerification({ trustedPublicKeys: trustedKeys });
  const result = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(verification.isTrustedKeySourceAvailable(), false);
  assert.equal(result.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
  assert.equal(result.publicKey, null);
});

test('verification API does not expose a direct trusted-public-key bypass', () => {
  const verification = loadVerification();

  assert.equal(verification.getTrustedPublicKey, undefined);
  assert.equal(typeof verification.resolveTrustedKeyRecord, 'function');
});

test('resolveTrustedKeyRecord returns ACTIVE for an authorized record at signature time', () => {
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK),
    }),
  });

  const result = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(result.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE);
  assert.deepEqual(result.publicKey, TEST_PUBLIC_JWK);
});

test('resolveTrustedKeyRecord rejects nested mutable record material', () => {
  const mutablePublicKey = {
    kty: 'EC',
    crv: 'P-256',
    x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    ext: true,
    key_ops: ['verify'],
  };
  const mutableRecord = {
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId: 'coin-card-test-key',
    algorithm: 'ECDSA_P256_SHA256',
    publicKey: mutablePublicKey,
    issuerId: 'implicitex',
    usage: ['coin-card-manifest-signing'],
    status: 'ACTIVE',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
    revokedAt: null,
    revocationReason: null,
    revocationPolicy: null,
    successorKeyId: null,
    environment: 'production',
  };
  Object.freeze(mutableRecord);
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': mutableRecord,
    }),
  });

  mutableRecord.publicKey.x = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
  const result = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(result.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
  assert.equal(result.reason, 'trusted-key-source-unavailable');
});

test('resolveTrustedKeyRecord rejects frozen accessor records', () => {
  const record = {};
  Object.defineProperty(record, 'schemaVersion', { value: 'coin-card-trusted-key-record.v1', enumerable: true });
  Object.defineProperty(record, 'keyId', { value: 'coin-card-test-key', enumerable: true });
  Object.defineProperty(record, 'algorithm', { value: 'ECDSA_P256_SHA256', enumerable: true });
  Object.defineProperty(record, 'publicKey', {
    enumerable: true,
    get() {
      return TEST_PUBLIC_JWK;
    },
  });
  Object.defineProperty(record, 'issuerId', { value: 'implicitex', enumerable: true });
  Object.defineProperty(record, 'usage', { value: deepFreeze(['coin-card-manifest-signing']), enumerable: true });
  Object.defineProperty(record, 'status', { value: 'ACTIVE', enumerable: true });
  Object.defineProperty(record, 'validFrom', { value: '2026-01-01T00:00:00.000Z', enumerable: true });
  Object.defineProperty(record, 'validUntil', { value: null, enumerable: true });
  Object.defineProperty(record, 'revokedAt', { value: null, enumerable: true });
  Object.defineProperty(record, 'revocationReason', { value: null, enumerable: true });
  Object.defineProperty(record, 'revocationPolicy', { value: null, enumerable: true });
  Object.defineProperty(record, 'successorKeyId', { value: null, enumerable: true });
  Object.defineProperty(record, 'environment', { value: 'production', enumerable: true });
  Object.freeze(record);

  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': record,
    }),
  });
  const result = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(result.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
  assert.equal(result.reason, 'trusted-key-source-unavailable');
});

test('resolveTrustedKeyRecord reports deterministic non-active outcomes', () => {
  const cases = [
    {
      name: 'source unavailable',
      records: null,
      keyId: 'missing-key',
      expected: 'TRUSTED_KEY_SOURCE_UNAVAILABLE',
    },
    {
      name: 'unknown',
      records: {},
      keyId: 'missing-key',
      expected: 'TRUSTED_KEY_UNKNOWN',
    },
    {
      name: 'usage denied',
      records: {
        'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, { usage: deepFreeze(['coin-card-registry-publication']) }),
      },
      expected: 'TRUSTED_KEY_USAGE_DENIED',
    },
    {
      name: 'environment mismatch',
      records: {
        'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, { environment: 'staging' }),
      },
      expected: 'TRUSTED_KEY_ENVIRONMENT_MISMATCH',
    },
    {
      name: 'not yet active',
      records: {
        'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, { validFrom: '2026-08-01T00:00:00.000Z' }),
      },
      expected: 'TRUSTED_KEY_NOT_YET_ACTIVE',
    },
    {
      name: 'expired',
      records: {
        'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, { validUntil: '2026-06-01T00:00:00.000Z' }),
      },
      expected: 'TRUSTED_KEY_EXPIRED',
    },
    {
      name: 'revoked',
      records: {
        'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, {
          status: 'REVOKED',
          revokedAt: '2026-06-01T00:00:00.000Z',
          revocationReason: 'compromise',
          revocationPolicy: 'INVALIDATE_ALL_SIGNATURES',
        }),
      },
      expected: 'TRUSTED_KEY_REVOKED',
    },
    {
      name: 'invalid',
      records: {
        'coin-card-test-key': deepFreeze({ keyId: 'coin-card-test-key' }),
      },
      expected: 'TRUSTED_KEY_SOURCE_UNAVAILABLE',
    },
  ];

  for (const scenario of cases) {
    const verification = loadVerification({
      trustedPublicKeys: scenario.records && Object.freeze(scenario.records),
    });
    const result = verification.resolveTrustedKeyRecord(scenario.keyId || 'coin-card-test-key', {
      usage: 'coin-card-manifest-signing',
      environment: 'production',
      issuerId: 'implicitex',
      signatureTime: '2026-07-01T00:00:00.000Z',
      verificationTime: '2026-07-10T00:00:00.000Z',
      signatureMode: 'signed-p256-v1',
    });

    assert.equal(result.outcome, verification.TRUSTED_KEY_OUTCOMES[scenario.expected], scenario.name);
    assert.equal(result.publicKey, null, scenario.name);
  }
});

test('resolveTrustedKeyRecord allows routine rotation only for signatures before revocation timestamp', () => {
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, {
        status: 'REVOKED',
        revokedAt: '2026-07-05T00:00:00.000Z',
        revocationReason: 'routine-rotation',
        revocationPolicy: 'NO_NEW_SIGNATURES',
        successorKeyId: 'coin-card-successor-key',
      }),
    }),
  });

  const before = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });
  const after = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-06T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(before.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE);
  assert.deepEqual(before.publicKey, TEST_PUBLIC_JWK);
  assert.equal(after.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_REVOKED);
  assert.equal(after.publicKey, null);
});

test('resolveTrustedKeyRecord honors timestamp equality boundaries', () => {
  const activeVerification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, {
        validFrom: '2026-07-01T00:00:00.000Z',
        validUntil: '2026-07-31T00:00:00.000Z',
      }),
    }),
  });
  const atValidFrom = activeVerification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });
  const atValidUntil = activeVerification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-31T00:00:00.000Z',
    verificationTime: '2026-08-01T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });
  const revokedVerification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, {
        status: 'REVOKED',
        revokedAt: '2026-07-05T00:00:00.000Z',
        revocationReason: 'boundary-test',
        revocationPolicy: 'NO_NEW_SIGNATURES',
      }),
    }),
  });
  const signatureAtRevokedAt = revokedVerification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-05T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });
  const invalidateAfterVerification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, {
        status: 'REVOKED',
        revokedAt: '2026-07-05T00:00:00.000Z',
        revocationReason: 'boundary-test',
        revocationPolicy: 'INVALIDATE_AFTER_TIMESTAMP',
      }),
    }),
  }).resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-05T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(atValidFrom.outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(atValidUntil.outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(signatureAtRevokedAt.outcome, 'TRUSTED_KEY_REVOKED');
  assert.equal(invalidateAfterVerification.outcome, 'TRUSTED_KEY_REVOKED');
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
  assert.equal(result.metadata.scope, 'coin-card-runtime-package');
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
  reorderedManifest.coinCardVersion = baseManifest.coinCardVersion;
  reorderedManifest.scope = baseManifest.scope;
  reorderedManifest.schemaVersion = baseManifest.schemaVersion;

  const basePayload = verification.canonicalizeIntegrityManifestPayload(baseManifest);
  const reorderedPayload = verification.canonicalizeIntegrityManifestPayload(reorderedManifest);

  assert.equal(basePayload, reorderedPayload);
  assert(!basePayload.includes('signature'));
  assert(!basePayload.includes('manifestHash'));
});

test('canonicalizeIntegrityManifestPayload changes when buildVersion changes', () => {
  const verification = loadVerification();
  const baseManifest = validIntegrityManifest();
  const mutatedManifest = validIntegrityManifest({
    buildVersion: 'commit-different',
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

test('canonicalizeIntegrityManifestPayload covers signed authorization context', () => {
  const verification = loadVerification();
  const baseManifest = signedManifest();

  for (const field of ['keyId', 'issuerId', 'environment', 'signedAt']) {
    const mutatedManifest = signedManifest({
      [field]: field === 'signedAt' ? '2026-07-02T00:00:00.000Z' : `changed-${field}`,
    });

    assert.notEqual(
      verification.canonicalizeIntegrityManifestPayload(baseManifest),
      verification.canonicalizeIntegrityManifestPayload(mutatedManifest),
      field,
    );
  }
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
  const manifest = signedManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      issuerId: 'implicitex',
      environment: 'production',
      signedAt: '2026-07-01T00:00:00.000Z',
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
  const manifest = signedManifest({
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
  manifest.buildVersion = 'tampered-build-version';

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

test('evaluateSignaturePolicy rejects conflicting duplicate authorization context', () => {
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK),
    }),
  });
  const manifest = signedManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      issuerId: 'attacker',
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
  assert.equal(result.error, 'integrity-manifest-signature-context-mismatch');
  assert.equal(result.field, 'issuerId');
});

test('evaluateSignaturePolicy rejects present duplicate authorization fields unless exactly equal', async () => {
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK),
    }),
  });
  const cases = [
    { label: 'null', duplicate: null, mismatch: true },
    { label: 'undefined', duplicate: undefined, mismatch: true },
    { label: 'empty', duplicate: '', mismatch: true },
    { label: 'wrong type', duplicate: 7, mismatch: true },
    { label: 'correct', duplicate: 'implicitex', mismatch: false },
    { label: 'absent', duplicate: undefined, absent: true, mismatch: false },
  ];

  for (const scenario of cases) {
    const signature = {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      value: 'signed',
    };
    if (!scenario.absent) {
      signature.issuerId = scenario.duplicate;
    }
    const manifest = signedManifest({ signature });
    const result = await Promise.resolve(verification.evaluateSignaturePolicy(manifest, {
      state: verification.STATES.ASSET_HASHES_PASSED,
      integrityManifest: manifest,
      metadata: { assetIntegrityStatus: 'passed' },
      error: null,
    }));

    if (scenario.mismatch) {
      assert.equal(result.error, 'integrity-manifest-signature-context-mismatch', scenario.label);
      assert.equal(result.field, 'issuerId', scenario.label);
    } else {
      assert.notEqual(result.error, 'integrity-manifest-signature-context-mismatch', scenario.label);
    }
  }
});

test('resolveTrustedKeyRecord rejects non-canonical timestamps', () => {
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK),
    }),
  });

  const result = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(result.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_RECORD_INVALID);
  assert.equal(result.reason, 'trusted-key-timing-evidence-invalid');
});

test('resolveTrustedKeyRecord rejects signature times beyond verifier clock skew', () => {
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK),
    }),
  });

  const withinSkew = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-10T00:05:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });
  const beyondSkew = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-10T00:05:00.001Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(withinSkew.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE);
  assert.equal(beyondSkew.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_RECORD_INVALID);
  assert.equal(beyondSkew.reason, 'trusted-key-signature-time-in-future');
});

test('resolveTrustedKeyRecord rejects malformed P-256 JWK records', () => {
  const malformedJwk = deepFreeze({
    kty: 'EC',
    crv: 'P-256',
    x: 'short',
    y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    d: 'private-material',
  });
  const verification = loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', malformedJwk),
    }),
  });

  const result = verification.resolveTrustedKeyRecord('coin-card-test-key', {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  });

  assert.equal(result.outcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
  assert.equal(result.reason, 'trusted-key-source-unavailable');
});

test('INVALIDATE_AFTER_TIMESTAMP uses verification time unlike NO_NEW_SIGNATURES', () => {
  const makeVerification = (revocationPolicy) => loadVerification({
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', TEST_PUBLIC_JWK, {
        status: 'REVOKED',
        revokedAt: '2026-07-05T00:00:00.000Z',
        revocationReason: 'policy-test',
        revocationPolicy,
      }),
    }),
  });
  const context = {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
  };

  const noNew = makeVerification('NO_NEW_SIGNATURES').resolveTrustedKeyRecord('coin-card-test-key', context);
  const invalidateAfter = makeVerification('INVALIDATE_AFTER_TIMESTAMP').resolveTrustedKeyRecord('coin-card-test-key', context);

  assert.equal(noNew.outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(invalidateAfter.outcome, 'TRUSTED_KEY_REVOKED');
});

test('evaluateSignaturePolicy fails when signed authorization context is mutated after signing', async () => {
  const verification = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
    trustedPublicKeys: Object.freeze({}),
  });
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const verifyingRuntime = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', publicKey),
    }),
  });
  const validManifest = await signManifestWithKeyPair(verification, signedManifest(), keyPair);
  const validResult = await verifyingRuntime.evaluateSignaturePolicy(validManifest, {
    state: verifyingRuntime.STATES.ASSET_HASHES_PASSED,
    integrityManifest: validManifest,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  assert.equal(validResult.state, verifyingRuntime.STATES.VERIFIED);

  for (const field of ['keyId', 'issuerId', 'environment', 'signedAt']) {
    const mutatedManifest = JSON.parse(JSON.stringify(validManifest));
    mutatedManifest[field] = field === 'signedAt' ? '2026-07-02T00:00:00.000Z' : `changed-${field}`;
    if (field === 'keyId') {
      mutatedManifest.signature.keyId = mutatedManifest.keyId;
    }

    const mutatedRecord = trustedKeyRecord(mutatedManifest.keyId, publicKey, {
      keyId: mutatedManifest.keyId,
      issuerId: mutatedManifest.issuerId,
      environment: mutatedManifest.environment,
    });
    const mutatedRuntime = loadVerification({
      crypto: webcrypto,
      atob: nodeAtob,
      btoa: nodeBtoa,
      trustedPublicKeys: Object.freeze({
        [mutatedManifest.keyId]: mutatedRecord,
      }),
    });
    const result = await mutatedRuntime.evaluateSignaturePolicy(mutatedManifest, {
      state: mutatedRuntime.STATES.ASSET_HASHES_PASSED,
      integrityManifest: mutatedManifest,
      metadata: { assetIntegrityStatus: 'passed' },
      error: null,
    });

    assert.equal(result.state, mutatedRuntime.STATES.INTEGRITY_FAILED, field);
    assert.equal(result.error, 'integrity-manifest-signature-invalid', field);
  }
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
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', publicKey),
    }),
  });
  assert.equal(verification.isTrustedKeySourceAvailable(), true);
  const manifest = signedManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      issuerId: 'implicitex',
      environment: 'production',
      signedAt: '2026-07-01T00:00:00.000Z',
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
    metadata: { assetIntegrityStatus: 'passed', manifestHash: manifest.manifestHash },
    error: null,
  });

  assert.equal(result.state, verification.STATES.INTEGRITY_FAILED);
  assert.equal(result.error, 'integrity-manifest-signature-invalid');
  assert.equal(result.signatureMode, 'signed-p256-v1');
});

test('evaluateSignaturePolicy supported valid signature with unknown key remains unavailable', () => {
  const verification = loadVerification();
  const manifest = signedManifest({
    keyId: 'missing-key',
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
  assert.equal(result.trustedKeyOutcome, verification.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
});

test('evaluateSignaturePolicy mutable trusted key source stays unavailable', async () => {
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
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', publicKey),
    },
  });
  const manifest = signedManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      issuerId: 'implicitex',
      environment: 'production',
      signedAt: '2026-07-01T00:00:00.000Z',
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
    metadata: { assetIntegrityStatus: 'passed', manifestHash: manifest.manifestHash },
    error: null,
  });

  assert.equal(verification.isTrustedKeySourceAvailable(), false);
  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-public-key-unavailable');
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
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', publicKey),
    }),
  });
  assert.equal(verification.isTrustedKeySourceAvailable(), true);
  const manifest = signedManifest({
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA',
      keyId: 'coin-card-test-key',
      issuerId: 'implicitex',
      environment: 'production',
      signedAt: '2026-07-01T00:00:00.000Z',
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
    metadata: { assetIntegrityStatus: 'passed', manifestHash: manifest.manifestHash },
    error: null,
  });

  assert.equal(result.state, verification.STATES.VERIFIED);
  assert.equal(result.valid, true);
  assert.equal(result.signatureMode, 'signed-p256-v1');
  assert.equal(result.keyId, 'coin-card-test-key');
  assert.equal(result.integrityManifest, manifest);
  assert.equal(result.metadata.assetIntegrityStatus, 'passed');
  assert.equal(result.metadata.manifestHash, manifest.manifestHash);
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

test('loadIntegrityManifest missing scope becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();
  delete manifest.scope;
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => manifest,
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-scope-invalid');
});

test('loadIntegrityManifest wrong scope becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({ scope: 'coin-card-instance.v1' }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-scope-invalid');
});

test('loadIntegrityManifest rejects manifest with cardId (card-instance field)', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({ cardId: 'cc_demo_implicitex' }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-card-instance-field-present');
  assert.equal(result.field, 'cardId');
});

test('loadIntegrityManifest rejects manifest with recipient (card-instance field)', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({ recipient: '0x0000000000000000000000000000000000000000' }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-card-instance-field-present');
  assert.equal(result.field, 'recipient');
});

test('loadIntegrityManifest rejects manifest with network (card-instance field)', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({ network: 'polygon-mainnet' }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-card-instance-field-present');
  assert.equal(result.field, 'network');
});

test('loadIntegrityManifest rejects manifest with registryStatus (card-instance field)', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({ registryStatus: 'active' }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-card-instance-field-present');
  assert.equal(result.field, 'registryStatus');
});

test('package manifest has no authority over card identity — metadata exposes scope not cardId', async () => {
  const verification = loadVerification();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => ({
    ok: true,
    json: async () => validIntegrityManifest(),
    arrayBuffer: async () => Buffer.from(REQUIRED_ASSET_BODIES[url] || '', 'utf8'),
  }));

  assert.equal(result.state, verification.STATES.ASSET_HASHES_PASSED);
  assert.equal(result.metadata.scope, 'coin-card-runtime-package');
  assert.equal(result.metadata.cardId, undefined);
  assert.equal(result.metadata.recipient, undefined);
  assert.equal(result.metadata.network, undefined);
  assert.equal(result.metadata.registryStatus, undefined);
});

test('package manifest governs multiple card routes — registry identity change does not affect manifest hash', async () => {
  // The manifest covers JS/CSS assets only. Two distinct registry records
  // (cc_demo_implicitex and antoine) share the same runtime package.
  // Changing which card serves the route does not change the manifest hash.
  const verification = loadVerification();
  const manifest = validIntegrityManifest();

  const payloadA = verification.canonicalizeIntegrityManifestPayload(manifest);
  // Simulate a different registry record being loaded for a different route
  // by confirming the manifest payload is unchanged (no per-card fields present).
  const payloadB = verification.canonicalizeIntegrityManifestPayload(manifest);

  assert.equal(payloadA, payloadB);
  assert(!payloadA.includes('cardId'));
  assert(!payloadA.includes('recipient'));
  assert(!payloadA.includes('network'));
  assert(!payloadA.includes('registryStatus'));
});

test('loadIntegrityManifest missing required protected asset becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => validIntegrityManifest({
      assets: manifest.assets.filter((asset) => asset.path !== 'card/coin-card-trusted-keys.js'),
    }),
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.integrityManifest, null);
  assert.equal(result.error, 'integrity-manifest-asset-policy-mismatch');
  assert.deepEqual(Array.from(result.requiredAssetPaths), requiredAssetPaths);
  assert(!result.assetPaths.includes('card/coin-card-trusted-keys.js'));
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

/* ----------------------------------------------------------------
 * QR library protected-asset governance tests
 *
 * qrcode.min.js is a third-party executable in the protected asset
 * set. These tests verify that:
 *   - its path is in REQUIRED_ASSET_PATHS (omission is detected)
 *   - hash mutation is detected as INTEGRITY_FAILED
 *   - stale hash (fetched bytes differ from manifest) is detected
 *   - path substitution is detected as VERIFICATION_UNAVAILABLE
 *   - the VERIFIED result passes verifiedAssets for QR injection
 * ---------------------------------------------------------------- */

test('js/vendor/qrcode.min.js is a required protected asset', () => {
  const verification = loadVerification();
  const paths = verification.getRequiredAssetPaths();
  assert.ok(paths.includes('js/vendor/qrcode.min.js'),
    'qrcode.min.js must be in REQUIRED_ASSET_PATHS');
});

test('card/index.html is a required protected asset', () => {
  const verification = loadVerification();
  const paths = verification.getRequiredAssetPaths();
  assert.ok(paths.includes('card/index.html'),
    'card/index.html must be in REQUIRED_ASSET_PATHS');
});

test('card/coin-card-canonical-json-v1.js is a required protected asset', () => {
  const verification = loadVerification();
  const paths = verification.getRequiredAssetPaths();
  assert.ok(paths.includes('card/coin-card-canonical-json-v1.js'),
    'coin-card-canonical-json-v1.js must be in REQUIRED_ASSET_PATHS');
});

test('omitting qrcode.min.js from manifest becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest({
    assets: validIntegrityManifest().assets.filter(
      (asset) => asset.path !== 'js/vendor/qrcode.min.js'
    ),
  });
  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => manifest,
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-asset-policy-mismatch');
  assert(!result.assetPaths.includes('js/vendor/qrcode.min.js'));
});

test('corrupted qrcode.min.js hash in manifest becomes INTEGRITY_FAILED', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest({
    assets: validIntegrityManifest().assets.map((asset) =>
      asset.path === 'js/vendor/qrcode.min.js'
        ? { ...asset, sha256: 'sha256:' + 'ff'.repeat(32) }
        : asset
    ),
  });

  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => {
    if (url === 'coin-card-manifest.json') {
      return { ok: true, status: 200, json: async () => manifest };
    }
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(REQUIRED_ASSET_BODIES[url], 'utf8'),
    };
  });

  assert.equal(result.state, verification.STATES.INTEGRITY_FAILED);
  assert.equal(result.error, 'integrity-manifest-asset-hash-mismatch');
  assert.equal(result.assetPath, 'js/vendor/qrcode.min.js');
});

test('stale qrcode.min.js bytes that do not match the manifest hash become INTEGRITY_FAILED', async () => {
  const verification = loadVerification();
  const manifest = validIntegrityManifest();   // hash for 'qrcode vendor asset body'
  const alteredBody = 'qrcode-vendor-bytes-ALTERED';  // bytes differ from hash

  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async (url) => {
    if (url === 'coin-card-manifest.json') {
      return { ok: true, status: 200, json: async () => manifest };
    }
    const body = url === 'js/vendor/qrcode.min.js' ? alteredBody : REQUIRED_ASSET_BODIES[url];
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from(body, 'utf8'),
    };
  });

  assert.equal(result.state, verification.STATES.INTEGRITY_FAILED);
  assert.equal(result.error, 'integrity-manifest-asset-hash-mismatch');
  assert.equal(result.assetPath, 'js/vendor/qrcode.min.js');
});

test('path substitution — replacing qrcode with a different vendor path becomes VERIFICATION_UNAVAILABLE', async () => {
  const verification = loadVerification();
  const substitutedBody = { ...REQUIRED_ASSET_BODIES, 'js/vendor/qrcode-patched.min.js': 'patched-vendor-body' };
  delete substitutedBody['js/vendor/qrcode.min.js'];
  const substitutedAssets = validIntegrityManifest().assets.map((asset) =>
    asset.path === 'js/vendor/qrcode.min.js'
      ? { ...asset, path: 'js/vendor/qrcode-patched.min.js',
          sha256: sha256Hex('patched-vendor-body') }
      : asset
  );
  const manifest = validIntegrityManifest({ assets: substitutedAssets });

  const result = await verification.loadIntegrityManifest('coin-card-manifest.json', async () => ({
    ok: true,
    json: async () => manifest,
  }));

  assert.equal(result.state, verification.STATES.VERIFICATION_UNAVAILABLE);
  assert.equal(result.error, 'integrity-manifest-asset-policy-mismatch');
});

test('VERIFIED result carries frozen qrLibraryAttestation — not raw manifest assets', async () => {
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const verifyingRuntime = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', publicKey),
    }),
  });
  const validManifest = await signManifestWithKeyPair(verifyingRuntime, signedManifest(), keyPair);
  const result = await verifyingRuntime.evaluateSignaturePolicy(validManifest, {
    state: verifyingRuntime.STATES.ASSET_HASHES_PASSED,
    integrityManifest: validManifest,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  assert.equal(result.state, verifyingRuntime.STATES.VERIFIED);

  /* The attestation must be present and frozen. */
  assert.ok(result.qrLibraryAttestation, 'VERIFIED result must include qrLibraryAttestation');
  assert.ok(Object.isFrozen(result.qrLibraryAttestation), 'qrLibraryAttestation must be frozen');

  /* Attestation must have exactly the expected path and a validated sha256. */
  assert.equal(result.qrLibraryAttestation.path, 'js/vendor/qrcode.min.js',
    'attestation path must be exactly js/vendor/qrcode.min.js');
  assert.match(result.qrLibraryAttestation.sha256, /^sha256:[0-9a-f]{64}$/,
    'attestation sha256 must be sha256:HEX format with 64-char lowercase hex');

  /* Caller cannot mutate the attestation path or hash. */
  result.qrLibraryAttestation.path = 'evil';
  result.qrLibraryAttestation.sha256 = 'sha256:' + 'ff'.repeat(32);
  assert.equal(result.qrLibraryAttestation.path, 'js/vendor/qrcode.min.js',
    'attestation path must be immutable');
  assert.match(result.qrLibraryAttestation.sha256, /^sha256:[0-9a-f]{64}$/,
    'attestation sha256 must be immutable');

  /* The raw manifest assets array must not be exposed. */
  assert.ok(!('verifiedAssets' in result), 'raw verifiedAssets must not appear on VERIFIED result');

  /* isQrLibraryAttestation() must recognise the issued attestation. */
  assert.ok(
    verifyingRuntime.isQrLibraryAttestation(result.qrLibraryAttestation),
    'isQrLibraryAttestation() must return true for verifier-issued attestation',
  );

  /* A shape-alike object created externally must not pass the predicate. */
  const fakeAttestation = {
    path: 'js/vendor/qrcode.min.js',
    sha256: result.qrLibraryAttestation.sha256,
  };
  assert.equal(
    verifyingRuntime.isQrLibraryAttestation(fakeAttestation),
    false,
    'isQrLibraryAttestation() must return false for shape-alike forgeries',
  );

  /* Primitive and null inputs must not throw. */
  assert.equal(verifyingRuntime.isQrLibraryAttestation(null), false);
  assert.equal(verifyingRuntime.isQrLibraryAttestation(undefined), false);
  assert.equal(verifyingRuntime.isQrLibraryAttestation('js/vendor/qrcode.min.js'), false);
});

test('malformed qrcode sha256 in manifest produces INTEGRITY_FAILED — not VERIFIED with null attestation', async () => {
  /* Invariant: the verifier must never return VERIFIED with qrLibraryAttestation: null.
   * If the qrcode.min.js asset has a malformed sha256, attestation issuance fails
   * and the result is downgraded to INTEGRITY_FAILED. */
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKey = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
  const verifyingRuntime = loadVerification({
    crypto: webcrypto,
    atob: nodeAtob,
    btoa: nodeBtoa,
    trustedPublicKeys: Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', publicKey),
    }),
  });
  const corruptManifest = signedManifest({
    assets: signedManifest().assets.map((a) =>
      a.path === 'js/vendor/qrcode.min.js'
        ? { ...a, sha256: 'not-a-valid-sha256-format' }
        : a
    ),
  });
  const signed = await signManifestWithKeyPair(verifyingRuntime, corruptManifest, keyPair);
  const result = await verifyingRuntime.evaluateSignaturePolicy(signed, {
    state: verifyingRuntime.STATES.ASSET_HASHES_PASSED,
    integrityManifest: signed,
    metadata: { assetIntegrityStatus: 'passed' },
    error: null,
  });

  /* INTEGRITY_FAILED — not VERIFIED with a null attestation. */
  assert.equal(result.state, verifyingRuntime.STATES.INTEGRITY_FAILED,
    'malformed qrcode sha256 must produce INTEGRITY_FAILED — VERIFIED + null is not permitted');
  assert.equal(result.error, 'integrity-manifest-qr-attestation-missing',
    'error must identify the missing attestation as the cause');
  assert.equal(result.qrLibraryAttestation, null,
    'qrLibraryAttestation is null on INTEGRITY_FAILED result');

  /* The forged state must not fool isQrLibraryAttestation(). */
  assert.equal(
    verifyingRuntime.isQrLibraryAttestation({ path: 'js/vendor/qrcode.min.js', sha256: 'sha256:' + 'aa'.repeat(32) }),
    false,
    'manually crafted attestation-shaped object must not pass isQrLibraryAttestation()',
  );
});
