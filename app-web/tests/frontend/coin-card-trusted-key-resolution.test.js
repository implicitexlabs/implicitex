const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const trustedKeysPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-keys.js');
const trustedKeyResolutionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const trustedKeysSource = fs.readFileSync(trustedKeysPath, 'utf8');
const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => {
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

function makePublicJwk(overrides = {}) {
  return deepFreeze({
    kty: 'EC',
    crv: 'P-256',
    x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    ext: true,
    key_ops: ['verify'],
    ...overrides,
  });
}

function trustedKeyRecord(keyId, overrides = {}) {
  return deepFreeze({
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey: TEST_PUBLIC_JWK,
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

function loadTrustedKeyResolution(options = {}) {
  const context = {
    Object,
    Number,
    String,
    Date,
    window: {},
  };
  context.globalThis = context;
  if (options.bootstrap) {
    vm.runInNewContext(trustedKeysSource, context, { filename: trustedKeysPath });
  } else if (options.trustedPublicKeys) {
    context.window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = options.trustedPublicKeys;
  }
  vm.runInNewContext(trustedKeyResolutionSource, context, { filename: trustedKeyResolutionPath });
  return {
    context,
    resolver: context.window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION,
  };
}

function resolve(resolver, keyId = 'coin-card-test-key', overrides = {}) {
  return resolver.resolveTrustedKeyRecord(keyId, {
    usage: 'coin-card-manifest-signing',
    environment: 'production',
    issuerId: 'implicitex',
    signatureTime: '2026-07-01T00:00:00.000Z',
    verificationTime: '2026-07-10T00:00:00.000Z',
    signatureMode: 'signed-p256-v1',
    ...overrides,
  });
}

test('trusted key resolver loads without verifier module', () => {
  const { context, resolver } = loadTrustedKeyResolution({ bootstrap: true });

  assert.equal(typeof resolver.resolveTrustedKeyRecord, 'function');
  assert.equal(context.window.IX_COIN_CARD_VERIFICATION, undefined);
  assert.equal(resolver.isTrustedKeySourceAvailable(), true);
  assert.equal(resolve(resolver).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_UNKNOWN);
});

test('trusted key resolver authorizes manifest and registry publication usages', () => {
  const trustedPublicKeys = Object.freeze({
    'coin-card-test-key': trustedKeyRecord('coin-card-test-key', {
      usage: ['coin-card-manifest-signing', 'coin-card-registry-publication'],
    }),
  });
  const { resolver } = loadTrustedKeyResolution({ trustedPublicKeys });

  assert.equal(resolve(resolver).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE);
  assert.equal(resolve(resolver, 'coin-card-test-key', {
    usage: 'coin-card-registry-publication',
  }).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE);
  assert.equal(resolve(resolver, 'coin-card-test-key', {
    usage: 'coin-card-lifecycle-administration',
  }).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_USAGE_DENIED);
});

test('trusted key resolver rejects hidden properties accessors and cyclic records atomically', () => {
  const hiddenPublicKey = {
    kty: 'EC',
    crv: 'P-256',
    x: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    y: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    ext: true,
    key_ops: ['verify'],
  };
  Object.defineProperty(hiddenPublicKey, 'hidden', {
    value: 'unexpected',
    enumerable: false,
  });
  const hiddenRecord = trustedKeyRecord('hidden-key', {
    publicKey: deepFreeze(hiddenPublicKey),
  });

  const accessorRecord = {};
  Object.defineProperty(accessorRecord, 'schemaVersion', { value: 'coin-card-trusted-key-record.v1', enumerable: true });
  Object.defineProperty(accessorRecord, 'keyId', { value: 'accessor-key', enumerable: true });
  Object.defineProperty(accessorRecord, 'algorithm', { value: 'ECDSA_P256_SHA256', enumerable: true });
  Object.defineProperty(accessorRecord, 'publicKey', {
    enumerable: false,
    get() {
      return TEST_PUBLIC_JWK;
    },
  });
  Object.freeze(accessorRecord);

  const cyclicRecord = {
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId: 'cyclic-key',
    algorithm: 'ECDSA_P256_SHA256',
    publicKey: TEST_PUBLIC_JWK,
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
  cyclicRecord.self = cyclicRecord;
  Object.freeze(cyclicRecord.usage);
  Object.freeze(cyclicRecord);

  [
    Object.freeze({ 'hidden-key': hiddenRecord }),
    Object.freeze({ 'accessor-key': accessorRecord }),
    Object.freeze({ 'cyclic-key': cyclicRecord }),
  ].forEach((trustedPublicKeys) => {
    const { resolver } = loadTrustedKeyResolution({ trustedPublicKeys });
    assert.equal(resolver.isTrustedKeySourceAvailable(), false);
    assert.equal(resolve(resolver, Object.keys(trustedPublicKeys)[0]).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
  });
});

test('trusted key resolver enforces exact record schema and nullable fields', () => {
  [
    trustedKeyRecord('extra-key', { extra: 'unexpected' }),
    trustedKeyRecord('missing-null-key', { validUntil: undefined }),
    trustedKeyRecord('empty-valid-until-key', { validUntil: '' }),
    trustedKeyRecord('empty-successor-key', { successorKeyId: '' }),
    trustedKeyRecord('active-revoked-key', { revokedAt: '2026-01-01T00:00:00.000Z' }),
  ].forEach((record) => {
    const trustedPublicKeys = Object.freeze({ [record.keyId]: record });
    const { resolver } = loadTrustedKeyResolution({ trustedPublicKeys });
    assert.equal(resolver.isTrustedKeySourceAvailable(), false);
    assert.equal(resolve(resolver, record.keyId).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
  });
});

test('trusted key resolver makes malformed unrelated records atomically unavailable', () => {
  const inheritedNames = ['toString', 'constructor', 'valueOf', '__proto__'];
  const cases = [
    trustedKeyRecord('bad-jwk-key', {
      publicKey: makePublicJwk({ x: 'short' }),
    }),
    trustedKeyRecord('bad-algorithm-key', {
      algorithm: 'ECDSA_P384_SHA384',
    }),
    trustedKeyRecord('bad-timestamp-key', {
      validFrom: '2026-01-01',
    }),
    trustedKeyRecord('bad-status-key', {
      status: 'DISABLED',
    }),
    trustedKeyRecord('bad-usage-key', {
      usage: ['coin-card-registry-publicaton'],
    }),
    trustedKeyRecord('duplicate-usage-key', {
      usage: ['coin-card-manifest-signing', 'coin-card-manifest-signing'],
    }),
    trustedKeyRecord('successor-self-key', {
      successorKeyId: 'successor-self-key',
    }),
  ].concat(
    inheritedNames.map((name) => trustedKeyRecord(`bad-usage-${name}`, {
      usage: [name],
    })),
    inheritedNames.map((name) => trustedKeyRecord(`bad-status-${name}`, {
      status: name,
    })),
    inheritedNames.map((name) => trustedKeyRecord(`bad-policy-${name}`, {
      status: 'REVOKED',
      revokedAt: '2026-07-05T00:00:00.000Z',
      revocationReason: 'prototype-membership-regression',
      revocationPolicy: name,
    })),
  );

  cases.forEach((badRecord) => {
    const trustedPublicKeys = Object.freeze({
      'coin-card-test-key': trustedKeyRecord('coin-card-test-key', {
        publicKey: makePublicJwk(),
      }),
      [badRecord.keyId]: badRecord,
    });
    const { resolver } = loadTrustedKeyResolution({ trustedPublicKeys });

    assert.equal(resolver.isTrustedKeySourceAvailable(), false, badRecord.keyId);
    assert.equal(resolve(resolver).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE, badRecord.keyId);
  });
});

test('trusted key resolver rejects shared object references in the source tree', () => {
  const sharedPublicKey = makePublicJwk();
  const trustedPublicKeys = Object.freeze({
    'coin-card-test-key': trustedKeyRecord('coin-card-test-key', {
      publicKey: sharedPublicKey,
    }),
    'coin-card-second-key': trustedKeyRecord('coin-card-second-key', {
      publicKey: sharedPublicKey,
    }),
  });
  const { resolver } = loadTrustedKeyResolution({ trustedPublicKeys });

  assert.equal(resolver.isTrustedKeySourceAvailable(), false);
  assert.equal(resolve(resolver).outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE);
});

test('trusted key resolver accepts revoked epoch timestamp evidence', () => {
  const record = trustedKeyRecord('revoked-epoch-key', {
    status: 'REVOKED',
    validFrom: '1970-01-01T00:00:00.000Z',
    revokedAt: '1970-01-01T00:00:00.000Z',
    revocationReason: 'test-fixture',
    revocationPolicy: 'NO_NEW_SIGNATURES',
  });
  const trustedPublicKeys = Object.freeze({ 'revoked-epoch-key': record });
  const { resolver } = loadTrustedKeyResolution({ trustedPublicKeys });

  const result = resolve(resolver, 'revoked-epoch-key', {
    signatureTime: '1970-01-01T00:00:00.000Z',
    verificationTime: '1970-01-01T00:00:00.000Z',
  });

  assert.equal(result.outcome, resolver.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_REVOKED);
});

test('lifecycle registry and shared resolver do not depend on verifier globals', () => {
  assert.equal(trustedKeyResolutionSource.includes('IX_COIN_CARD_VERIFICATION'), false);
  assert.equal(trustedKeyResolutionSource.includes('IX_COIN_CARD_LIFECYCLE_REGISTRY'), false);
  assert.equal(lifecycleRegistrySource.includes('IX_COIN_CARD_VERIFICATION'), false);
});
