'use strict';

const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const {
  P256_ORDER,
  derP256ToP1363,
} = require('../../scripts/coin-card-authority/strict-der-p256');
const {
  KMS_ALGORITHM,
  createKmsCompatibleP256Signer,
} = require('../../scripts/coin-card-authority/kms-compatible-signer');
const canonicalJson = require('../../frontend/public/card/coin-card-canonical-json-v1.js');

const repoRoot = path.resolve(__dirname, '../../..');
const cardRoot = path.join(repoRoot, 'app-web/frontend/public/card');
const KEY_ID = 'non-production-kms-compatible-test-key';
const AUTHORITY_ID = 'implicitex-registry';
const FIXED_NOW = '2026-08-11T12:00:00.000Z';

function trimMagnitude(value) {
  const bytes = Buffer.from(value);
  let offset = 0;
  while (offset < bytes.length - 1 && bytes[offset] === 0) offset += 1;
  return bytes.subarray(offset);
}

function derInteger(value) {
  let magnitude = trimMagnitude(value);
  if ((magnitude[0] & 0x80) !== 0) magnitude = Buffer.concat([Buffer.from([0]), magnitude]);
  return Buffer.concat([Buffer.from([0x02, magnitude.length]), magnitude]);
}

function p1363ToDer(value) {
  const signature = Buffer.from(value);
  assert.equal(signature.length, 64);
  const r = derInteger(signature.subarray(0, 32));
  const s = derInteger(signature.subarray(32));
  const body = Buffer.concat([r, s]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

function scalarBytes(value) {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function nodeAtob(value) { return Buffer.from(value, 'base64').toString('binary'); }
function nodeBtoa(value) { return Buffer.from(value, 'binary').toString('base64'); }

function makeFixedDateClass(isoString) {
  const RealDate = Date;
  return class FixedDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [isoString])); }
    static now() { return RealDate.parse(isoString); }
    static parse(value) { return RealDate.parse(value); }
    static UTC(...args) { return RealDate.UTC(...args); }
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function trustedKeyRecord(publicJwk) {
  return deepFreeze({
    schemaVersion: 'coin-card-trusted-key-record.v1',
    keyId: KEY_ID,
    algorithm: 'ECDSA_P256_SHA256',
    publicKey: {
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y,
      key_ops: ['verify'],
      ext: true,
    },
    issuerId: AUTHORITY_ID,
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

function lifecycleRecord() {
  return {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production',
    registryVersion: 1,
    recordId: 'kms-compatible-test-r1',
    publishedAt: '2026-08-11T11:58:00.000Z',
    cardId: 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE',
    manifestId: 'kms-compatible-test-manifest-v1',
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-08-11T11:58:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
    reasonCode: null,
    authorityId: AUTHORITY_ID,
    administrationEvidenceHash: null,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId: KEY_ID,
      authorityId: AUTHORITY_ID,
      signedAt: '2026-08-11T11:58:00.000Z',
      value: '',
    },
  };
}

function signaturePayload(record) {
  const payload = JSON.parse(JSON.stringify(record));
  delete payload.signature.value;
  return payload;
}

function signedMessage(domain, canonicalPayload) {
  return Buffer.concat([
    Buffer.from(domain, 'utf8'),
    Buffer.from([0]),
    Buffer.from(canonicalPayload, 'utf8'),
  ]);
}

function loadLifecycleVerifier(publicJwk) {
  const FixedDate = makeFixedDateClass(FIXED_NOW);
  const context = {
    Date: FixedDate,
    Promise,
    TextEncoder,
    Uint8Array,
    atob: nodeAtob,
    btoa: nodeBtoa,
    window: {},
  };
  context.globalThis = context;
  context.window.window = context.window;
  context.window.Date = FixedDate;
  context.window.TextEncoder = TextEncoder;
  context.window.Uint8Array = Uint8Array;
  context.window.crypto = webcrypto;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.__trustedKeysJson = JSON.stringify({
    [KEY_ID]: trustedKeyRecord(publicJwk),
  });
  vm.createContext(context);
  vm.runInContext(`(() => {
    function freeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach((key) => freeze(value[key]));
      return Object.freeze(value);
    }
    window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = freeze(JSON.parse(__trustedKeysJson));
  })()`, context);
  for (const filename of [
    'coin-card-trusted-key-resolution.js',
    'coin-card-canonical-json-v1.js',
    'coin-card-lifecycle-registry.js',
    'coin-card-lifecycle-record-verification.js',
  ]) {
    vm.runInContext(fs.readFileSync(path.join(cardRoot, filename), 'utf8'), context, {
      filename,
      timeout: 2000,
    });
  }
  return {
    context,
    verifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
  };
}

function realmClone(runtime, value) {
  runtime.context.__coinCardValueJson = JSON.stringify(value);
  return vm.runInContext('JSON.parse(__coinCardValueJson)', runtime.context);
}

test('strict DER conversion accepts canonical leading-zero and maximum P-256 scalars', () => {
  const simple = Buffer.concat([Buffer.alloc(31), Buffer.from([1]), Buffer.alloc(31), Buffer.from([2])]);
  assert.deepEqual(derP256ToP1363(p1363ToDer(simple)), simple);

  const leadingZero = Buffer.concat([
    Buffer.alloc(31), Buffer.from([0x80]),
    Buffer.alloc(31), Buffer.from([0x81]),
  ]);
  const leadingZeroDer = p1363ToDer(leadingZero);
  assert.equal(leadingZeroDer.includes(Buffer.from([0x02, 0x02, 0x00, 0x80])), true);
  assert.deepEqual(derP256ToP1363(leadingZeroDer), leadingZero);

  const maximum = Buffer.concat([
    scalarBytes(P256_ORDER - 1n),
    scalarBytes(P256_ORDER - 1n),
  ]);
  assert.deepEqual(derP256ToP1363(p1363ToDer(maximum)), maximum);
});

test('strict DER conversion rejects malformed, negative, oversized, zero, ambiguous, and trailing encodings', () => {
  const valid = p1363ToDer(Buffer.concat([
    Buffer.alloc(31), Buffer.from([1]),
    Buffer.alloc(31), Buffer.from([2]),
  ]));
  const oversizedR = Buffer.concat([
    Buffer.from([0x30, 0x26, 0x02, 0x21, 0x01]),
    Buffer.alloc(32, 0x01),
    Buffer.from([0x02, 0x01, 0x01]),
  ]);
  const order = scalarBytes(P256_ORDER);

  const vectors = [
    Buffer.alloc(0),
    Buffer.from([0x31, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]),
    Buffer.from([0x30, 0x80, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]),
    Buffer.from([0x30, 0x07, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01]),
    Buffer.from([0x30, 0x06, 0x03, 0x01, 0x01, 0x02, 0x01, 0x01]),
    Buffer.from([0x30, 0x06, 0x02, 0x01, 0x80, 0x02, 0x01, 0x01]),
    oversizedR,
    Buffer.from([0x30, 0x06, 0x02, 0x01, 0x00, 0x02, 0x01, 0x01]),
    Buffer.from([0x30, 0x05, 0x02, 0x00, 0x02, 0x01, 0x01]),
    Buffer.from([0x30, 0x07, 0x02, 0x02, 0x00, 0x01, 0x02, 0x01, 0x01]),
    Buffer.concat([valid, Buffer.from([0x00])]),
    p1363ToDer(Buffer.concat([order, Buffer.alloc(31), Buffer.from([1])])),
    Buffer.alloc(64, 0x01),
  ];
  for (const vector of vectors) {
    assert.throws(() => derP256ToP1363(vector));
  }
});

test('KMS adapter hashes the message, requires the P-256 KMS algorithm, and rejects bad responses', async () => {
  assert.throws(() => createKmsCompatibleP256Signer({
    keyId: KEY_ID,
    keyVersionName: 'test/key/1',
    kmsAlgorithm: 'EC_SIGN_P384_SHA384',
    asymmetricSign: async () => ({}),
  }), /unsupported KMS algorithm/);
  assert.throws(() => createKmsCompatibleP256Signer({
    keyId: KEY_ID,
    keyVersionName: 'test/key/1',
    kmsAlgorithm: KMS_ALGORITHM,
    asymmetricSign: async () => ({}),
    privateKey: 'forbidden',
  }), /unsupported KMS signer option/);

  const message = Buffer.from('kms-compatible-message', 'utf8');
  const expectedDigest = createHash('sha256').update(message).digest();
  let observedRequest = null;
  const signer = createKmsCompatibleP256Signer({
    keyId: KEY_ID,
    keyVersionName: 'projects/test/locations/global/keyRings/test/cryptoKeys/test/cryptoKeyVersions/1',
    kmsAlgorithm: KMS_ALGORITHM,
    asymmetricSign: async (request) => {
      observedRequest = request;
      return { algorithm: KMS_ALGORITHM, signature: Buffer.alloc(64, 1) };
    },
  });
  await assert.rejects(signer.signMessage(message), /DER signature/);
  assert.deepEqual(observedRequest.digest.sha256, expectedDigest);
  assert.deepEqual(Object.keys(observedRequest).sort(), ['digest', 'name']);

  for (const response of [
    { algorithm: 'EC_SIGN_P384_SHA384', signature: Buffer.from([1]) },
    { algorithm: KMS_ALGORITHM, signature: null },
    { algorithm: KMS_ALGORITHM, signature: Buffer.from([0x30, 0x00]) },
    { algorithm: KMS_ALGORITHM, verifiedDigestCrc32c: false, signature: validDerSignature() },
  ]) {
    const badSigner = createKmsCompatibleP256Signer({
      keyId: KEY_ID,
      keyVersionName: 'test/key/1',
      kmsAlgorithm: KMS_ALGORITHM,
      asymmetricSign: async () => response,
    });
    await assert.rejects(badSigner.signMessage(message));
  }
});

function validDerSignature() {
  return p1363ToDer(Buffer.concat([
    Buffer.alloc(31), Buffer.from([1]),
    Buffer.alloc(31), Buffer.from([2]),
  ]));
}

test('KMS-compatible DER output verifies through the existing lifecycle verifier and tampering fails', async () => {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const record = lifecycleRecord();
  const canonical = canonicalJson.canonicalizeJson(signaturePayload(record));
  const message = signedMessage('ImplicitEx Coin Card Lifecycle Registry Record v1', canonical);
  const expectedDigest = createHash('sha256').update(message).digest();

  const signer = createKmsCompatibleP256Signer({
    keyId: KEY_ID,
    keyVersionName: 'projects/non-production/locations/global/keyRings/test/cryptoKeys/test/cryptoKeyVersions/1',
    kmsAlgorithm: KMS_ALGORITHM,
    asymmetricSign: async (request) => {
      assert.deepEqual(request.digest.sha256, expectedDigest);
      const p1363 = await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        pair.privateKey,
        message,
      );
      return {
        algorithm: KMS_ALGORITHM,
        verifiedDigestCrc32c: true,
        signatureCrc32cVerified: true,
        signature: p1363ToDer(p1363),
      };
    },
  });
  const wireSignature = await signer.signCanonicalPayload(
    'ImplicitEx Coin Card Lifecycle Registry Record v1',
    canonical,
  );
  assert.equal(wireSignature.signatureEncoding, 'ieee-p1363');
  assert.equal(wireSignature.signatureLengthBytes, 64);
  assert.match(wireSignature.value, /^[A-Za-z0-9_-]{86}$/);
  record.signature.value = wireSignature.value;

  const runtime = loadLifecycleVerifier(publicJwk);
  const verified = await runtime.verifier.authenticateLifecycleRecord(
    realmClone(runtime, record),
    realmClone(runtime, { verificationTime: FIXED_NOW }),
  );
  assert.equal(verified.outcome, 'LIFECYCLE_RECORD_AUTHENTICATED');
  assert.equal(verified.authenticated, true);

  const tampered = JSON.parse(JSON.stringify(record));
  tampered.signature.value = (tampered.signature.value[0] === 'A' ? 'B' : 'A')
    + tampered.signature.value.slice(1);
  const rejected = await runtime.verifier.authenticateLifecycleRecord(
    realmClone(runtime, tampered),
    realmClone(runtime, { verificationTime: FIXED_NOW }),
  );
  assert.notEqual(rejected.outcome, 'LIFECYCLE_RECORD_AUTHENTICATED');
  assert.equal(rejected.authenticated, false);
  assert.equal(toBase64Url(Buffer.from(wireSignature.value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), wireSignature.value);
});
