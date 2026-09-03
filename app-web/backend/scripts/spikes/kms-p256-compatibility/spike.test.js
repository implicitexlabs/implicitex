/**
 * KMS P-256 Compatibility Spike — Test Suite
 *
 * Proves that DER-encoded signatures produced by Cloud KMS (EC_SIGN_P256_SHA256)
 * can be converted to IEEE P1363 format and accepted by the existing
 * coin-card-lifecycle-record-verification.js verifier without modification.
 *
 * Node.js crypto.createSign() returns DER-encoded ECDSA signatures, matching
 * the format Cloud KMS returns. This test uses Node.js crypto to simulate KMS
 * signing behavior. The mathematical operations are identical; only the key
 * custody differs (HSM in KMS, in-process here).
 *
 * MUST REMAIN UNCHANGED:
 *   coin-card-lifecycle-record-verification.js
 *   coin-card-lifecycle-registry.js
 *   coin-card-trusted-key-resolution.js
 *   coin-card-trusted-keys.js
 *   MANIFEST_SCHEMA.md
 *   Any registry JSON file
 *   Any frontend file
 *   Any Firebase configuration
 *
 * Run: node backend/scripts/spikes/kms-p256-compatibility/spike.test.js
 */

'use strict';

const assert = require('node:assert/strict');
const { createSign, createHash, webcrypto, generateKeyPairSync } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// ─── Paths to browser modules (unmodified) ────────────────────────────────────

const repoRoot = path.resolve(__dirname, '../../../../..');
const trustedKeyResolutionPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-trusted-key-resolution.js');
const lifecycleRegistryPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-registry.js');
const lifecycleRecordVerificationPath = path.join(repoRoot, 'app-web/frontend/public/card/coin-card-lifecycle-record-verification.js');

const trustedKeyResolutionSource = fs.readFileSync(trustedKeyResolutionPath, 'utf8');
const lifecycleRegistrySource = fs.readFileSync(lifecycleRegistryPath, 'utf8');
const lifecycleRecordVerificationSource = fs.readFileSync(lifecycleRecordVerificationPath, 'utf8');

// ─── DER → P1363 conversion ───────────────────────────────────────────────────
//
// Cloud KMS returns an ASN.1 DER-encoded ECDSA signature:
//   SEQUENCE { INTEGER r, INTEGER s }
//
// The browser verifier expects IEEE P1363 format:
//   r (32 bytes, big-endian, zero-padded) || s (32 bytes, big-endian, zero-padded)
//   = exactly 64 bytes
//   = base64url-unpadded (86 characters when encoded)
//
// DER INTEGERs prepend a 0x00 byte when the high bit of the first value byte
// is set (to indicate a positive value). P1363 uses fixed-width 32-byte fields;
// leading zeros and the 0x00 DER pad are both stripped before re-padding.
//
// This function is the only new code the backend needs to bridge KMS output
// to the verifier's expected format.

function derToP1363(derBytes) {
  const buf = Buffer.isBuffer(derBytes) ? derBytes : Buffer.from(derBytes);

  if (buf[0] !== 0x30) {
    throw new Error(`derToP1363: expected SEQUENCE tag 0x30, got 0x${buf[0].toString(16)}`);
  }

  // Parse sequence length (short form only; P-256 DER is always < 128 content bytes)
  let offset = 1;
  const seqLenByte = buf[offset++];
  if (seqLenByte & 0x80) {
    // Long-form length: skip the additional length bytes
    const extraLenBytes = seqLenByte & 0x7f;
    offset += extraLenBytes;
  }

  // Parse r INTEGER
  if (buf[offset++] !== 0x02) {
    throw new Error(`derToP1363: expected INTEGER tag 0x02 for r at offset ${offset - 1}`);
  }
  const rLen = buf[offset++];
  const rBytes = buf.subarray(offset, offset + rLen);
  offset += rLen;

  // Parse s INTEGER
  if (buf[offset++] !== 0x02) {
    throw new Error(`derToP1363: expected INTEGER tag 0x02 for s at offset ${offset - 1}`);
  }
  const sLen = buf[offset++];
  const sBytes = buf.subarray(offset, offset + sLen);

  return Buffer.concat([padTo32(rBytes), padTo32(sBytes)]);
}

function padTo32(integerBytes) {
  // Strip DER leading 0x00 pad byte (and any other leading zeros beyond 32 bytes)
  let start = 0;
  while (start < integerBytes.length - 32 && integerBytes[start] === 0x00) start++;
  const stripped = integerBytes.subarray(start);
  if (stripped.length > 32) {
    throw new Error(`padTo32: integer value too large for P-256 (${stripped.length} bytes after stripping)`);
  }
  const padded = Buffer.alloc(32, 0);
  stripped.copy(padded, 32 - stripped.length);
  return padded;
}

// ─── Test utilities ───────────────────────────────────────────────────────────

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value) {
  let base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64');
}

function nodeAtob(value) {
  return Buffer.from(value, 'base64').toString('binary');
}

function nodeBtoa(value) {
  return Buffer.from(value, 'binary').toString('base64');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Load the browser verifier modules into a vm context, exactly as the
// existing tests do. The verifier code is not modified.
function loadVerifierRuntime(trustedPublicKeys) {
  const context = {
    TextEncoder,
    window: {},
    atob: nodeAtob,
    btoa: nodeBtoa,
  };
  context.globalThis = context;
  context.window.TextEncoder = TextEncoder;
  context.window.atob = nodeAtob;
  context.window.btoa = nodeBtoa;
  context.window.crypto = webcrypto;

  context.__trustedPublicKeysJson = JSON.stringify(trustedPublicKeys);
  vm.runInNewContext(`(() => {
    function deepFreeze(value) {
      if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
      Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
      return Object.freeze(value);
    }
    window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS = deepFreeze(JSON.parse(__trustedPublicKeysJson));
  })()`, context);

  vm.runInNewContext(trustedKeyResolutionSource, context, { filename: trustedKeyResolutionPath });
  vm.runInNewContext(lifecycleRegistrySource, context, { filename: lifecycleRegistryPath });
  vm.runInNewContext(lifecycleRecordVerificationSource, context, { filename: lifecycleRecordVerificationPath });

  return {
    context,
    registry: context.window.IX_COIN_CARD_LIFECYCLE_REGISTRY,
    verifier: context.window.IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION,
  };
}

// Construct a minimal valid lifecycle record for testing. All field names and
// value constraints are enforced by the verifier's validateLifecycleRecordSchema().
function makeTestRecord(keyId, signedAt, overrides = {}) {
  const record = {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production',
    registryVersion: 1,
    recordId: 'kms-spike-test-record-001',
    publishedAt: '2026-07-21T12:00:00.000Z',
    cardId: 'coincard:spike:kms-test-handle',
    manifestId: 'manifest-kms-spike-001',
    revision: 1,
    previousManifestId: null,
    cardStatus: 'CARD_ACTIVE',
    manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: '2026-07-21T12:00:00.000Z',
    effectiveUntil: null,
    supersededByManifestId: null,
    reasonCode: null,
    authorityId: 'implicitex-registry',
    administrationEvidenceHash: null,
    signature: {
      mode: 'signed-p256-v1',
      algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363',
      signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded',
      keyId,
      authorityId: 'implicitex-registry',
      signedAt,
      value: '',   // Filled by caller after signing
    },
    ...overrides,
  };
  if (overrides.signature) {
    record.signature = { ...record.signature, ...overrides.signature };
  }
  return record;
}

// Build the signed payload bytes exactly as the verifier does:
//   buildSignaturePayload removes signature.value from the record
//   canonicalizeJson produces the canonical form
//   buildSignedPayloadBytes prepends the domain separator + 0x00
function buildSignedPayloadBytes(runtime, record) {
  const payload = clone(record);
  delete payload.signature.value;
  const canonical = runtime.registry.canonicalizeJson(
    vm.runInNewContext(`(${JSON.stringify(payload)})`, runtime.context)
  );
  return Buffer.concat([
    Buffer.from(runtime.verifier.LIFECYCLE_RECORD_SIGNATURE_DOMAIN, 'utf8'),
    Buffer.from([0x00]),
    Buffer.from(canonical, 'utf8'),
  ]);
}

async function authenticate(runtime, record) {
  const vmRecord = vm.runInNewContext(`(${JSON.stringify(record)})`, runtime.context);
  return runtime.verifier.authenticateLifecycleRecord(vmRecord, {
    verificationTime: '2026-07-21T12:01:00.000Z',
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('derToP1363 — converts minimal DER SEQUENCE (no 0x00 pads) to 64-byte P1363', () => {
  // Construct a minimal DER signature where r and s are exactly 32 bytes each
  // and have no leading high bit (no 0x00 DER pad required).
  const r = Buffer.alloc(32, 0);
  const s = Buffer.alloc(32, 0);
  r[0] = 0x01; // ensure no high bit — no DER pad needed
  s[0] = 0x02;

  const der = Buffer.concat([
    Buffer.from([0x30, 0x44]),        // SEQUENCE, 68 bytes
    Buffer.from([0x02, 0x20]),        // INTEGER r, 32 bytes
    r,
    Buffer.from([0x02, 0x20]),        // INTEGER s, 32 bytes
    s,
  ]);

  const p1363 = derToP1363(der);
  assert.equal(p1363.length, 64);
  assert.deepEqual(p1363.subarray(0, 32), r);
  assert.deepEqual(p1363.subarray(32), s);
});

test('derToP1363 — strips DER 0x00 padding byte from r and s when high bit is set', () => {
  // DER prepends 0x00 when the high bit of the first byte is set (to mark positive).
  // padTo32 must strip this byte before re-padding to 32 bytes.
  const r = Buffer.alloc(32, 0);
  const s = Buffer.alloc(32, 0);
  r[0] = 0x80; // high bit set → DER pads with 0x00
  s[0] = 0xff; // high bit set → DER pads with 0x00

  const rDer = Buffer.concat([Buffer.from([0x00]), r]); // 33 bytes with DER pad
  const sDer = Buffer.concat([Buffer.from([0x00]), s]); // 33 bytes with DER pad

  const der = Buffer.concat([
    Buffer.from([0x30, 0x46]),        // SEQUENCE, 70 bytes
    Buffer.from([0x02, 0x21]),        // INTEGER r, 33 bytes
    rDer,
    Buffer.from([0x02, 0x21]),        // INTEGER s, 33 bytes
    sDer,
  ]);

  const p1363 = derToP1363(der);
  assert.equal(p1363.length, 64);
  assert.deepEqual(p1363.subarray(0, 32), r, 'r: DER 0x00 pad removed and value preserved');
  assert.deepEqual(p1363.subarray(32), s, 's: DER 0x00 pad removed and value preserved');
});

test('derToP1363 — left-pads short integer values to 32 bytes', () => {
  // An r or s value shorter than 32 bytes (unlikely in practice for P-256 but
  // technically valid in DER) must be left-padded with zeros to reach 32 bytes.
  const r = Buffer.from([0x01]); // 1-byte value
  const s = Buffer.from([0x02]); // 1-byte value

  const der = Buffer.concat([
    Buffer.from([0x30, 0x06]),
    Buffer.from([0x02, 0x01]), r,
    Buffer.from([0x02, 0x01]), s,
  ]);

  const p1363 = derToP1363(der);
  assert.equal(p1363.length, 64);

  const expectedR = Buffer.alloc(32, 0);
  expectedR[31] = 0x01;
  const expectedS = Buffer.alloc(32, 0);
  expectedS[31] = 0x02;

  assert.deepEqual(p1363.subarray(0, 32), expectedR);
  assert.deepEqual(p1363.subarray(32), expectedS);
});

test('derToP1363 — rejects input that does not start with SEQUENCE tag 0x30', () => {
  assert.throws(() => derToP1363(Buffer.from([0x04, 0x40, ...Buffer.alloc(64)])), /SEQUENCE/);
});

test('derToP1363 — rejects missing INTEGER tag for r', () => {
  const der = Buffer.concat([
    Buffer.from([0x30, 0x44]),
    Buffer.from([0x04, 0x20]),  // 0x04 = OCTET STRING, not INTEGER
    Buffer.alloc(32),
    Buffer.from([0x02, 0x20]),
    Buffer.alloc(32),
  ]);
  assert.throws(() => derToP1363(der), /INTEGER/);
});

test('Node.js crypto.createSign (DER output) → derToP1363 → verifier: LIFECYCLE_RECORD_AUTHENTICATED', async () => {
  // Generate a P-256 key pair. Node.js crypto.createSign returns DER encoding,
  // matching Cloud KMS EC_SIGN_P256_SHA256 behavior.
  const { privateKey, publicKey: publicKeyObj } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });

  // Export public key as JWK for the trusted key record
  const publicKeyJwk = deepFreeze(
    await webcrypto.subtle.importKey(
      'spki',
      publicKeyObj,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    ).then((k) => webcrypto.subtle.exportKey('jwk', k))
  );

  const keyId = 'kms-spike-test-key';
  const trustedPublicKeys = {
    [keyId]: deepFreeze({
      schemaVersion: 'coin-card-trusted-key-record.v1',
      keyId,
      algorithm: 'ECDSA_P256_SHA256',
      publicKey: publicKeyJwk,
      issuerId: 'implicitex-registry',
      usage: ['coin-card-registry-publication'],
      status: 'ACTIVE',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      revokedAt: null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId: null,
      environment: 'production',
    }),
  };

  const runtime = loadVerifierRuntime(trustedPublicKeys);
  const signedAt = '2026-07-21T12:00:00.000Z';
  const record = makeTestRecord(keyId, signedAt);
  const payloadBytes = buildSignedPayloadBytes(runtime, record);

  // Sign using Node.js crypto.createSign, which returns DER encoding.
  // This is the format Cloud KMS EC_SIGN_P256_SHA256 returns.
  const derSignature = createSign('SHA256').update(payloadBytes).sign(privateKey);
  assert.ok(derSignature[0] === 0x30, 'Node.js crypto.createSign returned DER SEQUENCE');

  // Convert DER → P1363
  const p1363Signature = derToP1363(derSignature);
  assert.equal(p1363Signature.length, 64, 'P1363 output is exactly 64 bytes');

  const base64urlValue = toBase64Url(p1363Signature);
  assert.equal(base64urlValue.length, 86, 'base64url-encoded P1363 is exactly 86 characters');
  assert.ok(!/[+/=]/.test(base64urlValue), 'base64url value uses - and _ with no padding');

  record.signature.value = base64urlValue;
  const result = await authenticate(runtime, record);

  assert.equal(
    result.outcome,
    runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED,
    `verifier rejected DER-derived signature: ${result.outcome}`,
  );
  assert.equal(result.authenticated, true);

  // Record evidence values for KMS_COMPATIBILITY_EVIDENCE.md
  console.log('\n--- Evidence: run 1 ---');
  console.log('payload SHA-256:', createHash('sha256').update(payloadBytes).digest('hex'));
  console.log('DER signature (hex):', derSignature.toString('hex'));
  console.log('P1363 signature (hex):', p1363Signature.toString('hex'));
  console.log('P1363 base64url:', base64urlValue);
  console.log('verifier outcome:', result.outcome);
});

test('Two independent DER signatures on the same payload both verify (ECDSA non-determinism)', async () => {
  // ECDSA is non-deterministic: two signing operations on the same payload produce
  // different (r, s) values. Both must independently verify.
  const { privateKey, publicKey: publicKeyObj } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });

  const publicKeyJwk = deepFreeze(
    await webcrypto.subtle.importKey(
      'spki',
      publicKeyObj,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    ).then((k) => webcrypto.subtle.exportKey('jwk', k))
  );

  const keyId = 'kms-spike-nondeterminism-key';
  const trustedPublicKeys = {
    [keyId]: deepFreeze({
      schemaVersion: 'coin-card-trusted-key-record.v1',
      keyId,
      algorithm: 'ECDSA_P256_SHA256',
      publicKey: publicKeyJwk,
      issuerId: 'implicitex-registry',
      usage: ['coin-card-registry-publication'],
      status: 'ACTIVE',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      revokedAt: null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId: null,
      environment: 'production',
    }),
  };

  const runtime = loadVerifierRuntime(trustedPublicKeys);
  const signedAt = '2026-07-21T12:00:00.000Z';
  const record = makeTestRecord(keyId, signedAt);
  const payloadBytes = buildSignedPayloadBytes(runtime, record);

  // Sign twice — ECDSA produces different r and s values each time
  const der1 = createSign('SHA256').update(payloadBytes).sign(privateKey);
  const der2 = createSign('SHA256').update(payloadBytes).sign(privateKey);
  const p1363_1 = derToP1363(der1);
  const p1363_2 = derToP1363(der2);

  // The signatures themselves will differ (non-deterministic)
  // Note: in rare cases two signatures could coincidentally match, but probability is negligible
  const sig1Value = toBase64Url(p1363_1);
  const sig2Value = toBase64Url(p1363_2);

  // Verify first signature
  const record1 = clone(record);
  record1.signature.value = sig1Value;
  const result1 = await authenticate(runtime, record1);
  assert.equal(result1.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED, 'signature 1 not authenticated');

  // Verify second signature
  const record2 = clone(record);
  record2.signature.value = sig2Value;
  const result2 = await authenticate(runtime, record2);
  assert.equal(result2.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED, 'signature 2 not authenticated');

  console.log('\n--- Evidence: run 2 (non-determinism) ---');
  console.log('P1363 signature 1 (hex):', p1363_1.toString('hex'));
  console.log('P1363 signature 2 (hex):', p1363_2.toString('hex'));
  console.log('signatures differ:', sig1Value !== sig2Value ? 'YES (expected)' : 'SAME (extremely unlikely but valid)');
  console.log('both authenticated:', result1.authenticated && result2.authenticated);
});

test('Web Crypto P1363 signature (no conversion needed) also verifies — establishes baseline', async () => {
  // Web Crypto subtle.sign on P-256 returns P1363 natively (no DER conversion needed).
  // This test establishes the baseline: what the verifier already accepts.
  // It confirms that our derToP1363-derived signatures land in the same valid space.
  const keyPair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKeyJwk = deepFreeze(await webcrypto.subtle.exportKey('jwk', keyPair.publicKey));

  const keyId = 'kms-spike-baseline-key';
  const trustedPublicKeys = {
    [keyId]: deepFreeze({
      schemaVersion: 'coin-card-trusted-key-record.v1',
      keyId,
      algorithm: 'ECDSA_P256_SHA256',
      publicKey: publicKeyJwk,
      issuerId: 'implicitex-registry',
      usage: ['coin-card-registry-publication'],
      status: 'ACTIVE',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      revokedAt: null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId: null,
      environment: 'production',
    }),
  };

  const runtime = loadVerifierRuntime(trustedPublicKeys);
  const signedAt = '2026-07-21T12:00:00.000Z';
  const record = makeTestRecord(keyId, signedAt);
  const payloadBytes = buildSignedPayloadBytes(runtime, record);

  // Web Crypto returns P1363 natively — 64 bytes, no conversion needed
  const webcryptoSig = await webcrypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    payloadBytes,
  );
  assert.equal(webcryptoSig.byteLength, 64, 'Web Crypto P-256 sign returns exactly 64 bytes (P1363 native)');

  record.signature.value = toBase64Url(webcryptoSig);
  const result = await authenticate(runtime, record);
  assert.equal(result.outcome, runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED);
  assert.equal(result.authenticated, true);
});

test('REVOKED record with DER-derived signature verifies — refund lifecycle works', async () => {
  // The refund flow produces a signed REVOKED artifact. The verifier must accept
  // CARD_REVOKED + MANIFEST_REVOKED status in an authenticated record.
  const { privateKey, publicKey: publicKeyObj } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
    publicKeyEncoding: { type: 'spki', format: 'der' },
  });

  const publicKeyJwk = deepFreeze(
    await webcrypto.subtle.importKey(
      'spki',
      publicKeyObj,
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['verify'],
    ).then((k) => webcrypto.subtle.exportKey('jwk', k))
  );

  const keyId = 'kms-spike-revoked-key';
  const trustedPublicKeys = {
    [keyId]: deepFreeze({
      schemaVersion: 'coin-card-trusted-key-record.v1',
      keyId,
      algorithm: 'ECDSA_P256_SHA256',
      publicKey: publicKeyJwk,
      issuerId: 'implicitex-registry',
      usage: ['coin-card-registry-publication'],
      status: 'ACTIVE',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: null,
      revokedAt: null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId: null,
      environment: 'production',
    }),
  };

  const runtime = loadVerifierRuntime(trustedPublicKeys);
  const signedAt = '2026-07-21T14:00:00.000Z';
  // Revoked record: revision 2, previous manifest linked, status REVOKED
  const record = makeTestRecord(keyId, signedAt, {
    publishedAt: '2026-07-21T14:00:00.000Z',
    recordId: 'kms-spike-revoked-record-001',
    manifestId: 'manifest-kms-spike-002',
    revision: 2,
    previousManifestId: 'manifest-kms-spike-001',
    cardStatus: 'CARD_REVOKED',
    manifestStatus: 'MANIFEST_REVOKED',
    effectiveFrom: '2026-07-21T14:00:00.000Z',
    reasonCode: 'REFUND_APPROVED',
  });
  const payloadBytes = buildSignedPayloadBytes(runtime, record);

  const derSignature = createSign('SHA256').update(payloadBytes).sign(privateKey);
  const p1363Signature = derToP1363(derSignature);
  record.signature.value = toBase64Url(p1363Signature);

  // verificationTime must be after publishedAt (14:00); use 14:01
  const vmRecord = vm.runInNewContext(`(${JSON.stringify(record)})`, runtime.context);
  const result = await runtime.verifier.authenticateLifecycleRecord(vmRecord, {
    verificationTime: '2026-07-21T14:01:00.000Z',
  });

  assert.equal(
    result.outcome,
    runtime.verifier.OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED,
    `REVOKED record should authenticate; got: ${result.outcome}`,
  );
  assert.equal(result.authenticated, true);
  assert.equal(result.record.cardStatus, 'CARD_REVOKED');
  assert.equal(result.record.manifestStatus, 'MANIFEST_REVOKED');
});
