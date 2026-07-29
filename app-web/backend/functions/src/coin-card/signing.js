'use strict';

/**
 * Coin Card JWS envelope construction and verification.
 *
 * Conforms to: Signed-Record Constitution v0.2 (31579af)
 * Acceptance criteria: CC-002 AC-03, AC-04, AC-05
 *
 * buildJws(canonicalBytes, signer)
 *   Takes the RFC 8785 canonical manifest bytes from canonicalizeManifest()
 *   and an abstract signer, and produces a JWS Flattened JSON Serialization
 *   envelope per RFC 7515 using EdDSA (RFC 8037).
 *
 * verifyJws(jws, publicKeyJwk)
 *   Verifies a JWS envelope using only the supplied public key material.
 *   Does not contact any server, registry, or signing service.
 *   Rejects any algorithm other than EdDSA.
 *
 * Signer interface (implemented by local-ed25519-signer and gcp-kms-ed25519-signer):
 *   {
 *     keyId:     string          — matches signingKeyId in the manifest
 *     algorithm: 'EdDSA'        — must be exactly this string
 *     sign(signingInput: Buffer): Promise<Buffer>  — returns 64-byte raw signature
 *   }
 */

const crypto = require('node:crypto');

// ---------------------------------------------------------------------------
// JwsError
// ---------------------------------------------------------------------------

class JwsError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JwsError';
  }
}

// ---------------------------------------------------------------------------
// Base64url helpers (RFC 4648 §5, no padding)
// ---------------------------------------------------------------------------

function b64urlEncode(buf) {
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function b64urlDecode(str) {
  if (/=/.test(str)) {
    throw new JwsError('base64url value must not contain padding (=)');
  }
  // Restore standard base64 padding before decoding.
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ---------------------------------------------------------------------------
// buildJws
// ---------------------------------------------------------------------------

/**
 * Produce a JWS Flattened JSON Serialization envelope.
 *
 * The signing input is constructed exactly as specified in RFC 7515 §7.2.2:
 *   ASCII(BASE64URL(UTF8(Protected Header)) || '.' || BASE64URL(Payload))
 *
 * @param {Buffer} canonicalBytes  - JCS-canonical manifest bytes (from canonicalizeManifest).
 * @param {object} signer          - Abstract signer conforming to the signer interface.
 * @returns {Promise<Readonly<object>>}  JWS Flattened JSON: { protected, payload, signature }.
 * @throws {JwsError}  On invalid inputs or signer contract violations.
 */
async function buildJws(canonicalBytes, signer) {
  if (!Buffer.isBuffer(canonicalBytes) || canonicalBytes.length === 0) {
    throw new JwsError('canonicalBytes must be a non-empty Buffer');
  }

  // Enforce the signer interface contract.
  if (
    signer === null || typeof signer !== 'object'
    || typeof signer.sign !== 'function'
    || typeof signer.keyId !== 'string' || signer.keyId.length === 0
    || signer.algorithm !== 'EdDSA'
  ) {
    throw new JwsError(
      'signer must provide: sign(Buffer): Promise<Buffer>, keyId: string, algorithm: "EdDSA"',
    );
  }

  // Protected header: algorithm and key ID are the only fields.
  const headerJson = JSON.stringify({ alg: 'EdDSA', kid: signer.keyId });
  const protectedHeader = b64urlEncode(Buffer.from(headerJson, 'utf8'));
  const payload         = b64urlEncode(canonicalBytes);

  // RFC 7515 §7.2.2: signing input is ASCII bytes of the two b64url strings
  // separated by a '.'.
  const signingInput  = Buffer.from(`${protectedHeader}.${payload}`, 'ascii');
  const signatureBytes = await signer.sign(signingInput);

  if (!Buffer.isBuffer(signatureBytes) || signatureBytes.length !== 64) {
    throw new JwsError(
      `signer must return a 64-byte Buffer; got ${Buffer.isBuffer(signatureBytes) ? signatureBytes.length : typeof signatureBytes} bytes`,
    );
  }

  const signature = b64urlEncode(signatureBytes);

  return Object.freeze({
    protected: protectedHeader,
    payload,
    signature,
  });
}

// ---------------------------------------------------------------------------
// verifyJws
// ---------------------------------------------------------------------------

/**
 * Verify a JWS Flattened JSON envelope using only the supplied public key.
 *
 * The verifier is independent of the issuance server: it needs only the JWS
 * envelope and the public key JWK, not a live registry or signing service.
 *
 * @param {object} jws           - JWS Flattened JSON: { protected, payload, signature }.
 * @param {object} publicKeyJwk  - OKP/Ed25519 JWK: { kty: 'OKP', crv: 'Ed25519', x: '...' }.
 * @returns {Readonly<{valid: true, payloadBytes: Buffer, keyId: string}>}
 * @throws {JwsError}  On any structural, algorithm, encoding, or signature failure.
 */
function verifyJws(jws, publicKeyJwk) {
  // Structural check.
  if (
    jws === null || typeof jws !== 'object'
    || typeof jws.protected  !== 'string'
    || typeof jws.payload    !== 'string'
    || typeof jws.signature  !== 'string'
  ) {
    throw new JwsError('jws must have protected, payload, and signature string fields');
  }

  // All three fields must be padding-free base64url per RFC 7515.
  if (/=/.test(jws.protected)) {
    throw new JwsError('protected header must not contain base64url padding (=)');
  }
  if (/=/.test(jws.payload)) {
    throw new JwsError('payload must not contain base64url padding (=)');
  }
  if (/=/.test(jws.signature)) {
    throw new JwsError('signature must not contain base64url padding (=)');
  }

  // Decode and validate protected header.
  let header;
  try {
    const headerBytes = b64urlDecode(jws.protected);
    header = JSON.parse(headerBytes.toString('utf8'));
  } catch (err) {
    throw new JwsError(`protected header is not valid base64url-encoded JSON: ${err.message}`);
  }

  if (header.alg !== 'EdDSA') {
    throw new JwsError(
      `algorithm substitution rejected: expected EdDSA, got "${header.alg}"`,
    );
  }
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new JwsError('protected header must contain a non-empty kid field');
  }

  // Decode signature.
  let signatureBytes;
  try {
    signatureBytes = b64urlDecode(jws.signature);
  } catch (err) {
    throw new JwsError(`signature is not valid base64url: ${err.message}`);
  }

  // Import public key from JWK. createPublicKey throws on bad input.
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' });
  } catch (err) {
    throw new JwsError(`failed to import public key from JWK: ${err.message}`);
  }

  // Reconstruct the signing input and verify.
  const signingInput = Buffer.from(`${jws.protected}.${jws.payload}`, 'ascii');
  const valid = crypto.verify(null, signingInput, publicKey, signatureBytes);

  if (!valid) {
    throw new JwsError('Ed25519 signature verification failed');
  }

  // Decode payload bytes for caller use.
  const payloadBytes = b64urlDecode(jws.payload);

  return Object.freeze({ valid: true, payloadBytes, keyId: header.kid });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = Object.freeze({ buildJws, verifyJws, JwsError });
