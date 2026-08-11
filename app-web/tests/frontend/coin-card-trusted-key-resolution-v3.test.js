'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { generateKeyPairSync } = require('node:crypto');

const {
  SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, USAGES,
  createTrustedKeyRecord, mergeTrustedKeyRecords, validateTrustedKeyRecord,
} = require('../../scripts/coin-card-authority/trusted-key-records');

const cardRoot = path.resolve(__dirname, '../../frontend/public/card');
const fixturePath = path.resolve(
  __dirname, '../../../docs/product/coin-card/coin-card.trusted-key-record.fixtures.v3.json'
);
const resolverSource = fs.readFileSync(path.join(cardRoot, 'coin-card-trusted-key-resolution-v3.js'), 'utf8');
const checkedInSource = fs.readFileSync(path.join(cardRoot, 'coin-card-trusted-keys.js'), 'utf8');
const publicJwk = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });
const normalizedJwk = Object.freeze({
  kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y,
  key_ops: Object.freeze(['verify']), ext: true,
});
const NOW = '2026-08-11T12:00:00.000Z';

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((name) => freeze(value[name]));
  return Object.freeze(value);
}

function record(schemaVersion, keyId, usage, extra = {}) {
  return createTrustedKeyRecord({
    schemaVersion, keyId, publicKey: normalizedJwk,
    issuerId: extra.issuerId || 'implicitex-test-authority', usage,
    validFrom: '2026-01-01T00:00:00.000Z', environment: 'production',
    ...extra,
  });
}

function runtime(records) {
  const context = { window: {}, Date, __records: JSON.stringify(records) };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(`(function () {
    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach(function (name) { deepFreeze(value[name]); });
      return Object.freeze(value);
    }
    var source = Object.create(null);
    JSON.parse(__records).forEach(function (record) { source[record.keyId] = record; });
    window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = deepFreeze(source);
  })();`, context);
  vm.runInContext(resolverSource, context, { filename: 'coin-card-trusted-key-resolution-v3.js' });
  return context.window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION;
}

function resolve(api, keyId, usage, issuerId = 'implicitex-test-authority', signatureTime = NOW) {
  return api.resolveTrustedKeyRecord(keyId, {
    usage, issuerId, environment: 'production', signatureTime,
    verificationTime: NOW, signatureMode: 'signed-p256-v1',
  });
}

test('promoted resolver preserves the current v1 trusted source without rebinding', () => {
  const context = { window: {}, Date };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(checkedInSource, context, { filename: 'coin-card-trusted-keys.js' });
  vm.runInContext(resolverSource, context, { filename: 'coin-card-trusted-key-resolution-v3.js' });
  const api = context.window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION;
  assert.equal(api.isTrustedKeySourceAvailable(), true);
  for (const keyId of ['ix-coin-card-manifest-v2', 'ix-lifecycle-pub-v2']) {
    assert.equal(api.getTrustedKeyRecord(keyId).schemaVersion, SCHEMA_V1);
  }
});

test('v1, v2, and v3 retain schema-specific closed usage vocabularies', () => {
  assert.throws(() => record(SCHEMA_V1, 'old-exec', [USAGES.EXECUTABLE_CURRENT_HEAD]), /usage invalid/);
  assert.throws(() => record(SCHEMA_V2, 'v2-exec', [USAGES.EXECUTABLE_CURRENT_HEAD]), /usage invalid/);
  const records = [
    record(SCHEMA_V1, 'legacy-registry', [USAGES.REGISTRY_PUBLICATION]),
    record(SCHEMA_V2, 'v2-evidence', [USAGES.TRANSACTION_EVIDENCE]),
    record(SCHEMA_V3, 'v3-executable', [USAGES.EXECUTABLE_CURRENT_HEAD]),
    record(SCHEMA_V3, 'v3-evidence', [USAGES.TRANSACTION_EVIDENCE]),
  ];
  const api = runtime(records);
  assert.equal(resolve(api, 'legacy-registry', USAGES.REGISTRY_PUBLICATION).outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolve(api, 'legacy-registry', USAGES.EXECUTABLE_CURRENT_HEAD).outcome, 'TRUSTED_KEY_USAGE_DENIED');
  assert.equal(resolve(api, 'v2-evidence', USAGES.TRANSACTION_EVIDENCE).outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolve(api, 'v3-executable', USAGES.EXECUTABLE_CURRENT_HEAD).outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolve(api, 'v3-evidence', USAGES.TRANSACTION_EVIDENCE).outcome, 'TRUSTED_KEY_ACTIVE');
});

test('governed v3 fixtures accept mixed schemas and reject closed-enum violations', () => {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  assert.equal(fixture.schemaVersion, 'coin-card-trusted-key-record-fixtures.v3');
  fixture.positiveRecords.forEach((value) => {
    assert.doesNotThrow(() => validateTrustedKeyRecord(value));
  });
  fixture.negativeUsageVectors.forEach((vector) => {
    const source = fixture.positiveRecords[vector.sourceRecordIndex];
    assert.throws(
      () => validateTrustedKeyRecord({ ...source, usage: vector.replacementUsage }),
      /usage invalid/,
      vector.id,
    );
  });
});

test('overlap, independent revocation, successor metadata, and keyId immutability are preserved', () => {
  const legacy = record(SCHEMA_V1, 'legacy', [USAGES.REGISTRY_PUBLICATION]);
  const successor = record(SCHEMA_V3, 'kms-successor', [USAGES.REGISTRY_PUBLICATION]);
  const noNew = record(SCHEMA_V3, 'retired', [USAGES.REGISTRY_PUBLICATION], {
    status: 'REVOKED', revokedAt: '2026-08-11T11:00:00.000Z',
    revocationReason: 'transition', revocationPolicy: 'NO_NEW_SIGNATURES',
    successorKeyId: successor.keyId,
  });
  const invalidated = record(SCHEMA_V3, 'compromised', [USAGES.REGISTRY_PUBLICATION], {
    status: 'REVOKED', revokedAt: '2026-08-11T11:00:00.000Z',
    revocationReason: 'compromise', revocationPolicy: 'INVALIDATE_ALL_SIGNATURES',
    successorKeyId: successor.keyId,
  });
  const api = runtime([legacy, successor, noNew, invalidated]);
  assert.equal(resolve(api, legacy.keyId, USAGES.REGISTRY_PUBLICATION).outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolve(api, successor.keyId, USAGES.REGISTRY_PUBLICATION).outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolve(api, noNew.keyId, USAGES.REGISTRY_PUBLICATION,
    undefined, '2026-08-11T10:59:59.000Z').outcome, 'TRUSTED_KEY_ACTIVE');
  assert.equal(resolve(api, noNew.keyId, USAGES.REGISTRY_PUBLICATION).outcome, 'TRUSTED_KEY_REVOKED');
  assert.equal(resolve(api, invalidated.keyId, USAGES.REGISTRY_PUBLICATION,
    undefined, '2026-08-11T10:00:00.000Z').outcome, 'TRUSTED_KEY_REVOKED');
  assert.throws(() => mergeTrustedKeyRecords(legacy, { ...legacy, issuerId: 'rebound' }), /rebind denied/);
});
