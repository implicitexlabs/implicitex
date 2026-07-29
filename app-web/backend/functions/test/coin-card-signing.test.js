'use strict';

/**
 * CC-002.2 — Ed25519 JWS envelope construction and independent verification.
 *
 * Acceptance criteria covered: AC-03, AC-04, AC-05.
 *
 * Tests confirm:
 *  1.  Exact canonical bytes from CC-002.1 are used as the JWS payload.
 *  2.  `alg` in the protected header is fixed to "EdDSA".
 *  3.  `kid` is required and present in the protected header.
 *  4.  Algorithm substitution is rejected by the verifier.
 *  5.  Missing or empty kid is rejected by the verifier.
 *  6.  The local signer produces a valid Ed25519 signature verifiable by verifyJws.
 *  7.  verifyJws validates using public-key material only (no signer needed).
 *  8.  One-bit mutation of the payload fails verification.
 *  9.  One-bit mutation of the protected header fails verification.
 * 10.  One-bit mutation of the signature fails verification.
 * 11.  Signature encoding is base64url without padding (no = characters).
 * 12.  The private key never appears in the JWS output.
 * 13.  Repeated signing of identical bytes produces identical signatures.
 * 14.  The committed JWS fixture verifies against the committed public key.
 */

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const test   = require('node:test');

const { buildManifest, canonicalizeManifest } = require('../src/coin-card/manifest');
const { buildJws, verifyJws, JwsError }       = require('../src/coin-card/signing');
const {
  createLocalEd25519Signer,
  generateEd25519KeyPair,
  publicKeyJwkFromPem,
} = require('../src/coin-card/signers/local-ed25519-signer');

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const FIXTURES = path.join(__dirname, 'fixtures');

const REFERENCE_INPUT     = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'manifest-v1.input.json'), 'utf8'));
const REFERENCE_CANONICAL = fs.readFileSync(path.join(FIXTURES, 'manifest-v1.canonical.json'));
const COMMITTED_JWS       = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'manifest-v1.jws.json'), 'utf8'));
const COMMITTED_PUBLIC_KEY = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'manifest-v1.public-key.json'), 'utf8'));

const TEST_KEY_ID = 'ix-signing-2026-01';

// Generate a fresh key pair for unit tests. The private key is in process
// memory only and is never written to any file or log.
const { privateKeyPem: TEST_PRIVATE_KEY_PEM, publicKeyJwk: TEST_PUBLIC_KEY_JWK }
  = generateEd25519KeyPair();

const testSigner = createLocalEd25519Signer(TEST_PRIVATE_KEY_PEM, TEST_KEY_ID);

function buildReferenceManifestBytes() {
  return canonicalizeManifest(buildManifest(REFERENCE_INPUT));
}

// Flip the LSB of the first byte in a base64url string.
function flipBitInB64url(b64url) {
  const padded = b64url + '='.repeat((4 - (b64url.length % 4)) % 4);
  const bytes = Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  bytes[0] ^= 0x01;
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ---------------------------------------------------------------------------
// 1. Payload field is base64url of the canonical bytes (AC-03)
// ---------------------------------------------------------------------------

test('AC-03: JWS payload field is the base64url encoding of the canonical manifest bytes', async () => {
  const canonicalBytes = buildReferenceManifestBytes();
  const jws = await buildJws(canonicalBytes, testSigner);

  const decodedPayload = Buffer.from(
    jws.payload.replace(/-/g, '+').replace(/_/g, '/') + '==',
    'base64',
  );
  assert.ok(
    decodedPayload.equals(REFERENCE_CANONICAL),
    'JWS payload must decode to the committed canonical bytes from CC-002.1',
  );
});

// ---------------------------------------------------------------------------
// 2. Protected header contains alg: EdDSA (AC-04)
// ---------------------------------------------------------------------------

test('AC-04: protected header contains alg: "EdDSA"', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const header = JSON.parse(Buffer.from(jws.protected.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64').toString('utf8'));
  assert.equal(header.alg, 'EdDSA');
});

// ---------------------------------------------------------------------------
// 3. Protected header contains kid matching the signer's keyId (AC-04)
// ---------------------------------------------------------------------------

test('AC-04: protected header contains kid matching signer keyId', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const header = JSON.parse(Buffer.from(jws.protected.replace(/-/g, '+').replace(/_/g, '/') + '==', 'base64').toString('utf8'));
  assert.equal(header.kid, TEST_KEY_ID);
});

// ---------------------------------------------------------------------------
// 4. Signature is base64url without padding (AC-04)
// ---------------------------------------------------------------------------

test('AC-04: signature field is base64url without padding characters', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  assert.ok(!jws.protected.includes('='), 'protected must not have = padding');
  assert.ok(!jws.payload.includes('='),   'payload must not have = padding');
  assert.ok(!jws.signature.includes('='), 'signature must not have = padding');
});

// ---------------------------------------------------------------------------
// 5. Signature is 86 base64url characters (64 raw bytes) (AC-04)
// ---------------------------------------------------------------------------

test('AC-04: Ed25519 signature encodes to 86 base64url characters (64 raw bytes)', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  assert.equal(jws.signature.length, 86, 'Ed25519 produces 64 bytes → 86 base64url chars without padding');
});

// ---------------------------------------------------------------------------
// 6. Local signer produces a verifiable signature (AC-05)
// ---------------------------------------------------------------------------

test('AC-05: local signer produces a valid Ed25519 signature verifiable by verifyJws', async () => {
  const canonicalBytes = buildReferenceManifestBytes();
  const jws = await buildJws(canonicalBytes, testSigner);
  const result = verifyJws(jws, TEST_PUBLIC_KEY_JWK);
  assert.equal(result.valid, true);
});

// ---------------------------------------------------------------------------
// 7. verifyJws uses public-key material only (AC-05)
// ---------------------------------------------------------------------------

test('AC-05: verifyJws requires only the public key — no signer, no network', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  // publicKeyJwkFromPem derives the public key from the private key PEM.
  // In production, the public key is fetched from the key registry.
  const pubKeyJwk = publicKeyJwkFromPem(TEST_PRIVATE_KEY_PEM);
  const result = verifyJws(jws, pubKeyJwk);
  assert.equal(result.valid, true);
  assert.equal(result.keyId, TEST_KEY_ID);
});

// ---------------------------------------------------------------------------
// 8. One-bit mutation of payload fails verification
// ---------------------------------------------------------------------------

test('one-bit mutation of payload bytes causes verification failure', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const tampered = { ...jws, payload: flipBitInB64url(jws.payload) };
  assert.throws(
    () => verifyJws(tampered, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError,
    'tampered payload must throw JwsError',
  );
});

// ---------------------------------------------------------------------------
// 9. One-bit mutation of protected header fails verification
// ---------------------------------------------------------------------------

test('one-bit mutation of protected header causes verification failure', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const tampered = { ...jws, protected: flipBitInB64url(jws.protected) };
  assert.throws(
    () => verifyJws(tampered, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError,
    'tampered protected header must throw JwsError',
  );
});

// ---------------------------------------------------------------------------
// 10. One-bit mutation of signature fails verification
// ---------------------------------------------------------------------------

test('one-bit mutation of signature bytes causes verification failure', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const tampered = { ...jws, signature: flipBitInB64url(jws.signature) };
  assert.throws(
    () => verifyJws(tampered, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError,
    'tampered signature must throw JwsError',
  );
});

// ---------------------------------------------------------------------------
// 11. Algorithm substitution is rejected
// ---------------------------------------------------------------------------

test('algorithm substitution: forged header with alg RS256 is rejected', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);

  // Replace the protected header with one that claims RS256.
  const forgedHeader = Buffer.from(JSON.stringify({ alg: 'RS256', kid: TEST_KEY_ID }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  const forged = { ...jws, protected: forgedHeader };

  assert.throws(
    () => verifyJws(forged, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError && /EdDSA/i.test(err.message),
    'RS256 must be rejected with an EdDSA-mentioning JwsError',
  );
});

test('algorithm substitution: alg: null in header is rejected', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const forgedHeader = Buffer.from(JSON.stringify({ alg: null, kid: TEST_KEY_ID }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  assert.throws(
    () => verifyJws({ ...jws, protected: forgedHeader }, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError,
  );
});

// ---------------------------------------------------------------------------
// 12. Missing or empty kid is rejected
// ---------------------------------------------------------------------------

test('missing kid in protected header is rejected', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const noKidHeader = Buffer.from(JSON.stringify({ alg: 'EdDSA' }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  assert.throws(
    () => verifyJws({ ...jws, protected: noKidHeader }, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError && /kid/i.test(err.message),
  );
});

test('empty string kid in protected header is rejected', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const emptyKidHeader = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: '' }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  assert.throws(
    () => verifyJws({ ...jws, protected: emptyKidHeader }, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError && /kid/i.test(err.message),
  );
});

// ---------------------------------------------------------------------------
// 13. Padding in signature is rejected
// ---------------------------------------------------------------------------

test('signature with base64 padding (=) is rejected', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const paddedSig = jws.signature + '==';
  assert.throws(
    () => verifyJws({ ...jws, signature: paddedSig }, TEST_PUBLIC_KEY_JWK),
    (err) => err instanceof JwsError && /padding/i.test(err.message),
  );
});

// ---------------------------------------------------------------------------
// 14. Wrong public key fails verification
// ---------------------------------------------------------------------------

test('wrong public key causes verification failure', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const { publicKeyJwk: wrongKey } = generateEd25519KeyPair();
  assert.throws(
    () => verifyJws(jws, wrongKey),
    (err) => err instanceof JwsError,
    'wrong public key must throw JwsError',
  );
});

// ---------------------------------------------------------------------------
// 15. Ed25519 determinism: repeated signing of identical bytes → identical signature
// ---------------------------------------------------------------------------

test('Ed25519 is deterministic: repeated signing produces identical signatures', async () => {
  const canonicalBytes = buildReferenceManifestBytes();
  const a = await buildJws(canonicalBytes, testSigner);
  const b = await buildJws(canonicalBytes, testSigner);
  assert.equal(a.signature, b.signature, 'Ed25519 must produce identical signatures for identical inputs');
  assert.equal(a.protected, b.protected);
  assert.equal(a.payload, b.payload);
});

// ---------------------------------------------------------------------------
// 16. Private key does not appear in JWS envelope output
// ---------------------------------------------------------------------------

test('private key material does not appear in the JWS envelope', async () => {
  const jws = await buildJws(buildReferenceManifestBytes(), testSigner);
  const jwsStr = JSON.stringify(jws);

  // The private key PEM contains 'PRIVATE KEY'; ensure no trace appears.
  assert.ok(
    !jwsStr.includes('PRIVATE KEY'),
    'JWS output must not contain private key marker',
  );
  // The JWK 'd' parameter holds Ed25519 private key material.
  assert.ok(
    !jwsStr.includes('"d"'),
    'JWS output must not contain the JWK private key parameter',
  );
});

// ---------------------------------------------------------------------------
// 17. buildJws rejects invalid inputs
// ---------------------------------------------------------------------------

test('buildJws rejects non-Buffer canonicalBytes', async () => {
  await assert.rejects(
    () => buildJws('not a buffer', testSigner),
    (err) => err instanceof JwsError,
  );
});

test('buildJws rejects empty Buffer', async () => {
  await assert.rejects(
    () => buildJws(Buffer.alloc(0), testSigner),
    (err) => err instanceof JwsError,
  );
});

test('buildJws rejects signer with wrong algorithm', async () => {
  const badSigner = { ...testSigner, algorithm: 'RS256' };
  await assert.rejects(
    () => buildJws(buildReferenceManifestBytes(), badSigner),
    (err) => err instanceof JwsError,
  );
});

// ---------------------------------------------------------------------------
// 18. Committed fixture: JWS verifies against committed public key (AC-14)
// ---------------------------------------------------------------------------

test('AC-14 fixture: committed JWS envelope verifies against committed public key', () => {
  const result = verifyJws(COMMITTED_JWS, COMMITTED_PUBLIC_KEY);
  assert.equal(result.valid, true);
  assert.equal(result.keyId, TEST_KEY_ID);
});

test('AC-14 fixture: committed JWS payload decodes to committed canonical bytes', () => {
  const result = verifyJws(COMMITTED_JWS, COMMITTED_PUBLIC_KEY);
  assert.ok(
    result.payloadBytes.equals(REFERENCE_CANONICAL),
    'JWS fixture payload must decode to the committed canonical bytes from CC-002.1',
  );
});
