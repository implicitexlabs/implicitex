const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '../../..');
const lifecyclePath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

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

function loadLifecycle(options = {}) {
  const context = {
    Promise,
    String,
    Uint8Array,
    TextEncoder,
    window: {},
    btoa(value) {
      return Buffer.from(value, 'binary').toString('base64');
    },
  };
  context.globalThis = context;
  context.window.TextEncoder = TextEncoder;
  context.window.btoa = context.btoa;
  if (!options.cryptoUnavailable) {
    context.window.crypto = { subtle: makeDigest() };
  }
  if (options.bundle) {
    context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE = options.bundle;
  }
  vm.runInNewContext(lifecycleSource, context, { filename: lifecyclePath });
  return {
    registry: context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    bundle: context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE,
    context,
  };
}

function realmValue(context, source) {
  return vm.runInNewContext(`(${source})`, context);
}

test('lifecycle registry bootstrap initializes a frozen empty bundle', () => {
  const { registry, bundle } = loadLifecycle();

  assert.equal(registry.REGISTRY_SCHEMA_VERSION, 'coin-card-lifecycle-registry.v1');
  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(Object.isFrozen(bundle.entries), true);
  assert.deepEqual(JSON.parse(JSON.stringify(bundle)), {
    registrySchemaVersion: 'coin-card-lifecycle-registry.v1',
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 0,
    generatedAt: null,
    entries: [],
  });
  assert.equal(registry.isLifecycleRegistrySourceAvailable(), true);
});

test('canonicalizeJson matches payload hash golden vector', async () => {
  const { registry, context } = loadLifecycle();
  const payload = realmValue(context, `{
    cardId: 'card_test_001',
    recipient: {
      address: '0x1111111111111111111111111111111111111111',
    },
    amountPolicy: {
      type: 'FIXED_AMOUNT',
      amountBaseUnits: '50000000',
    },
  }`);

  const hash = await registry.hashProtectedPayload(payload);

  assert.equal(
    hash.canonicalText,
    '{"amountPolicy":{"amountBaseUnits":"50000000","type":"FIXED_AMOUNT"},"cardId":"card_test_001","recipient":{"address":"0x1111111111111111111111111111111111111111"}}',
  );
  assert.equal(hash.hex, '3ed60d0c409d735bdfe467b96f0af0379b077fdfbc4c8ae9a30882766dfd7eda');
  assert.equal(hash.base64url, 'PtYNDECdc1vf5Ge5bwrwN5sHf9-8TIrpowiCdm39fto');
});

test('canonicalizeJson uses Unicode code point key order', () => {
  const { registry, context } = loadLifecycle();

  assert.equal(
    registry.canonicalizeJson(realmValue(context, `{
      '😀': 5,
      '𐀀': 4,
      Ω: 3,
      é: 2,
      a: 1,
    }`)),
    '{"a":1,"é":2,"Ω":3,"𐀀":4,"😀":5}',
  );
});

test('canonicalizeJson pins string escaping', () => {
  const { registry, context } = loadLifecycle();

  assert.equal(
    registry.canonicalizeJson(realmValue(context, String.raw`{
      label: 'Café "A"\n😀/test',
      nul: '\u0000',
      tab: '\t',
      slash: '/',
      backslash: '\\',
    }`)),
    '{"backslash":"\\\\","label":"Café \\"A\\"\\n😀/test","nul":"\\u0000","slash":"/","tab":"\\t"}',
  );
});

test('canonicalizeJson rejects non-canonical data shapes', () => {
  const { registry, context } = loadLifecycle();
  const accessor = realmValue(context, `(() => {
    const value = {};
    Object.defineProperty(value, 'field', {
      enumerable: true,
      get() {
        return 'dynamic';
      },
    });
    return value;
  })()`);
  const hidden = realmValue(context, `(() => {
    const value = { visible: 'ok' };
    Object.defineProperty(value, 'hidden', {
      enumerable: false,
      value: 'hidden',
    });
    return value;
  })()`);
  const cyclic = realmValue(context, `(() => {
    const value = {};
    value.self = value;
    return value;
  })()`);

  assert.equal(registry.canonicalizeJson(accessor), null);
  assert.equal(registry.canonicalizeJson(hidden), null);
  assert.equal(registry.canonicalizeJson(cyclic), null);
  assert.equal(registry.canonicalizeJson(realmValue(context, `{ bad: undefined }`)), null);
  assert.equal(registry.canonicalizeJson(realmValue(context, `{ bad: Number.NaN }`)), null);
  assert.equal(registry.canonicalizeJson(realmValue(context, `{ label: 'Cafe\\u0301' }`)), null);
  assert.equal(registry.canonicalizeJson(realmValue(context, `(() => ({ label: String.fromCharCode(0xd800) }))()`)), null);
  assert.equal(registry.canonicalizeJson(realmValue(context, `(() => {
    const key = String.fromCharCode(0xd800);
    return { [key]: 'bad' };
  })()`)), null);
});

test('validateLifecycleRegistryBundle rejects mutable accessor and non-empty bundles', () => {
  const { registry, context } = loadLifecycle();
  const mutable = {
    registrySchemaVersion: 'coin-card-lifecycle-registry.v1',
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 0,
    generatedAt: null,
    entries: [],
  };
  const accessor = {};
  Object.defineProperty(accessor, 'registrySchemaVersion', {
    enumerable: true,
    get() {
      return 'coin-card-lifecycle-registry.v1';
    },
  });
  Object.freeze(accessor);
  const hiddenAccessor = realmValue(context, `(() => {
    const bundle = {
      registrySchemaVersion: 'coin-card-lifecycle-registry.v1',
      registryId: 'implicitex-production',
      environment: 'production',
      registryVersion: 0,
      generatedAt: null,
      entries: Object.freeze([]),
    };
    Object.defineProperty(bundle, 'hidden', {
      enumerable: false,
      get() {
        return 'dynamic';
      },
    });
    return Object.freeze(bundle);
  })()`);
  const nonEmpty = realmValue(context, `(() => Object.freeze({
    registrySchemaVersion: 'coin-card-lifecycle-registry.v1',
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 0,
    generatedAt: null,
    entries: Object.freeze([Object.freeze({ recordId: 'future-record' })]),
  }))()`);
  const wrongVersion = realmValue(context, `(() => Object.freeze({
    registrySchemaVersion: 'coin-card-lifecycle-registry.v1',
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 1,
    generatedAt: null,
    entries: Object.freeze([]),
  }))()`);

  assert.equal(registry.validateLifecycleRegistryBundle(mutable).ok, false);
  assert.equal(registry.validateLifecycleRegistryBundle(accessor).ok, false);
  assert.equal(registry.validateLifecycleRegistryBundle(hiddenAccessor).error, 'lifecycle-registry-bundle-not-deep-frozen-plain-data');
  assert.equal(registry.validateLifecycleRegistryBundle(nonEmpty).error, 'lifecycle-registry-empty-bundle-required-field-invalid');
  assert.equal(registry.validateLifecycleRegistryBundle(wrongVersion).error, 'lifecycle-registry-empty-bundle-required-field-invalid');
});

test('resolveLifecycle returns deterministic empty unknown outcomes', () => {
  const { registry } = loadLifecycle();
  const result = registry.resolveLifecycle('card_test_001', 'manifest_test_001');

  assert.equal(result.cardOutcome, registry.CARD_OUTCOMES.CARD_UNKNOWN);
  assert.equal(result.manifestOutcome, registry.MANIFEST_OUTCOMES.MANIFEST_UNKNOWN);
  assert.equal(result.operationalOutcome, registry.OPERATIONAL_OUTCOMES.LIFECYCLE_UNKNOWN);
  assert.equal(result.registry.sourceValidated, true);
  assert.equal(result.registry.bundleIntegrityAuthenticated, false);
  assert.equal(result.registry.recordAuthentication, 'not-applicable-empty');
  assert.equal(result.registry.rollbackProtected, false);
  assert.equal(result.registry.registryVersion, 0);
  assert.equal(result.registry.generatedAt, null);
});

test('composeOperationalOutcome follows the full lifecycle precedence matrix', () => {
  const { registry } = loadLifecycle();
  const cardOutcomes = Object.values(registry.CARD_OUTCOMES);
  const manifestOutcomes = Object.values(registry.MANIFEST_OUTCOMES);

  for (const cardOutcome of cardOutcomes) {
    for (const manifestOutcome of manifestOutcomes) {
      let expected = registry.OPERATIONAL_OUTCOMES.LIFECYCLE_INVALID;

      if (
        cardOutcome !== registry.CARD_OUTCOMES.CARD_RECORD_INVALID
        && manifestOutcome !== registry.MANIFEST_OUTCOMES.MANIFEST_RECORD_INVALID
      ) {
        if (
          cardOutcome === registry.CARD_OUTCOMES.CARD_REVOKED
          || cardOutcome === registry.CARD_OUTCOMES.CARD_SUSPENDED
        ) {
          expected = registry.OPERATIONAL_OUTCOMES.LIFECYCLE_BLOCKED;
        } else if (
          cardOutcome === registry.CARD_OUTCOMES.CARD_UNKNOWN
          || manifestOutcome === registry.MANIFEST_OUTCOMES.MANIFEST_UNKNOWN
        ) {
          expected = registry.OPERATIONAL_OUTCOMES.LIFECYCLE_UNKNOWN;
        } else if (
          cardOutcome === registry.CARD_OUTCOMES.CARD_ACTIVE
          && manifestOutcome === registry.MANIFEST_OUTCOMES.MANIFEST_CURRENT
        ) {
          expected = registry.OPERATIONAL_OUTCOMES.LIFECYCLE_OPERATIONAL;
        } else if (cardOutcome === registry.CARD_OUTCOMES.CARD_ACTIVE) {
          expected = registry.OPERATIONAL_OUTCOMES.LIFECYCLE_BLOCKED;
        }
      }

      assert.equal(
        registry.composeOperationalOutcome(cardOutcome, manifestOutcome),
        expected,
        `${cardOutcome} + ${manifestOutcome}`,
      );
    }
  }
});
