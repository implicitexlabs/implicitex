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
    Object,
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
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
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
  const { registry } = loadLifecycle();
  const payload = {
    cardId: 'card_test_001',
    recipient: {
      address: '0x1111111111111111111111111111111111111111',
    },
    amountPolicy: {
      type: 'FIXED_AMOUNT',
      amountBaseUnits: '50000000',
    },
  };

  const hash = await registry.hashProtectedPayload(payload);

  assert.equal(
    hash.canonicalText,
    '{"amountPolicy":{"amountBaseUnits":"50000000","type":"FIXED_AMOUNT"},"cardId":"card_test_001","recipient":{"address":"0x1111111111111111111111111111111111111111"}}',
  );
  assert.equal(hash.hex, '3ed60d0c409d735bdfe467b96f0af0379b077fdfbc4c8ae9a30882766dfd7eda');
  assert.equal(hash.base64url, 'PtYNDECdc1vf5Ge5bwrwN5sHf9-8TIrpowiCdm39fto');
});

test('canonicalizeJson uses Unicode code point key order', () => {
  const { registry } = loadLifecycle();

  assert.equal(
    registry.canonicalizeJson({
      '😀': 5,
      '𐀀': 4,
      Ω: 3,
      é: 2,
      a: 1,
    }),
    '{"a":1,"é":2,"Ω":3,"𐀀":4,"😀":5}',
  );
});

test('canonicalizeJson pins string escaping', () => {
  const { registry } = loadLifecycle();

  assert.equal(
    registry.canonicalizeJson({
      label: 'Café "A"\n😀/test',
      nul: '\u0000',
      tab: '\t',
      slash: '/',
      backslash: '\\',
    }),
    '{"backslash":"\\\\","label":"Café \\"A\\"\\n😀/test","nul":"\\u0000","slash":"/","tab":"\\t"}',
  );
});

test('canonicalizeJson rejects non-canonical data shapes', () => {
  const { registry } = loadLifecycle();
  const accessor = {};
  Object.defineProperty(accessor, 'value', {
    enumerable: true,
    get() {
      return 'dynamic';
    },
  });
  const cyclic = {};
  cyclic.self = cyclic;

  assert.equal(registry.canonicalizeJson(accessor), null);
  assert.equal(registry.canonicalizeJson(cyclic), null);
  assert.equal(registry.canonicalizeJson({ bad: undefined }), null);
  assert.equal(registry.canonicalizeJson({ bad: Number.NaN }), null);
  assert.equal(registry.canonicalizeJson({ label: 'Cafe\u0301' }), null);
});

test('validateLifecycleRegistryBundle rejects mutable and accessor bundles', () => {
  const { registry } = loadLifecycle();
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

  assert.equal(registry.validateLifecycleRegistryBundle(mutable).ok, false);
  assert.equal(
    registry.validateLifecycleRegistryBundle(deepFreeze({
      ...mutable,
      entries: [{ recordId: 'future-record' }],
    })).error,
    'lifecycle-registry-record-validation-unimplemented',
  );
  assert.equal(registry.validateLifecycleRegistryBundle(accessor).ok, false);
});

test('resolveLifecycle returns deterministic empty unknown outcomes', () => {
  const { registry } = loadLifecycle();
  const result = registry.resolveLifecycle('card_test_001', 'manifest_test_001');

  assert.equal(result.cardOutcome, registry.CARD_OUTCOMES.CARD_UNKNOWN);
  assert.equal(result.manifestOutcome, registry.MANIFEST_OUTCOMES.MANIFEST_UNKNOWN);
  assert.equal(result.operationalOutcome, registry.OPERATIONAL_OUTCOMES.LIFECYCLE_UNKNOWN);
  assert.equal(result.registry.authenticated, true);
  assert.equal(result.registry.rollbackProtected, false);
  assert.equal(result.registry.registryVersion, 0);
  assert.equal(result.registry.generatedAt, null);
});

test('composeOperationalOutcome follows lifecycle precedence', () => {
  const { registry } = loadLifecycle();

  assert.equal(
    registry.composeOperationalOutcome(registry.CARD_OUTCOMES.CARD_ACTIVE, registry.MANIFEST_OUTCOMES.MANIFEST_CURRENT),
    registry.OPERATIONAL_OUTCOMES.LIFECYCLE_OPERATIONAL,
  );
  assert.equal(
    registry.composeOperationalOutcome(registry.CARD_OUTCOMES.CARD_REVOKED, registry.MANIFEST_OUTCOMES.MANIFEST_CURRENT),
    registry.OPERATIONAL_OUTCOMES.LIFECYCLE_BLOCKED,
  );
  assert.equal(
    registry.composeOperationalOutcome(registry.CARD_OUTCOMES.CARD_ACTIVE, registry.MANIFEST_OUTCOMES.MANIFEST_SUPERSEDED),
    registry.OPERATIONAL_OUTCOMES.LIFECYCLE_BLOCKED,
  );
  assert.equal(
    registry.composeOperationalOutcome(registry.CARD_OUTCOMES.CARD_UNKNOWN, registry.MANIFEST_OUTCOMES.MANIFEST_CURRENT),
    registry.OPERATIONAL_OUTCOMES.LIFECYCLE_UNKNOWN,
  );
  assert.equal(
    registry.composeOperationalOutcome(registry.CARD_OUTCOMES.CARD_RECORD_INVALID, registry.MANIFEST_OUTCOMES.MANIFEST_CURRENT),
    registry.OPERATIONAL_OUTCOMES.LIFECYCLE_INVALID,
  );
});
