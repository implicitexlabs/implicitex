'use strict';

/**
 * Local Ed25519 signer for deterministic testing and fixture generation.
 *
 * Uses Node.js built-in crypto — no network calls, no KMS dependency.
 * Not for production use. The private key exists only in process memory.
 *
 * Conforms to the signer interface required by buildJws():
 *   { keyId: string, algorithm: 'EdDSA', sign(Buffer): Promise<Buffer> }
 */

const crypto = require('node:crypto');

/**
 * Create a signer backed by a PKCS#8 PEM-encoded Ed25519 private key.
 *
 * @param {string} privateKeyPem  - PKCS#8 PEM Ed25519 private key. Test-only.
 * @param {string} keyId          - Key identifier matching signingKeyId in the manifest.
 * @returns {Readonly<object>}    Signer conforming to the buildJws signer interface.
 */
function createLocalEd25519Signer(privateKeyPem, keyId) {
  if (typeof privateKeyPem !== 'string' || !privateKeyPem.includes('PRIVATE KEY')) {
    throw new TypeError('privateKeyPem must be a PEM-encoded private key string');
  }
  if (typeof keyId !== 'string' || keyId.length === 0) {
    throw new TypeError('keyId must be a non-empty string');
  }

  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
    type: 'pkcs8',
  });

  return Object.freeze({
    keyId,
    algorithm: 'EdDSA',

    /**
     * Sign the JWS signing input bytes with the Ed25519 private key.
     *
     * Ed25519 is deterministic: identical input + key → identical signature.
     *
     * @param {Buffer} signingInput
     * @returns {Promise<Buffer>}  64-byte raw Ed25519 signature.
     */
    async sign(signingInput) {
      return crypto.sign(null, signingInput, privateKey);
    },
  });
}

/**
 * Generate a fresh Ed25519 key pair.
 *
 * Returns the private key as PKCS#8 PEM (for createLocalEd25519Signer) and
 * the public key as an OKP JWK (for verifyJws and fixture files).
 *
 * The private key must never be written to committed files or logs.
 *
 * @returns {{ privateKeyPem: string, publicKeyJwk: object }}
 */
function generateEd25519KeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');

  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicKeyJwk:  publicKey.export({ format: 'jwk' }),
  };
}

/**
 * Derive the public key JWK from a PKCS#8 PEM private key.
 *
 * Useful in tests that already hold a private key and need to pass the
 * corresponding public key to verifyJws.
 *
 * @param {string} privateKeyPem
 * @returns {object}  OKP JWK containing only public key material.
 */
function publicKeyJwkFromPem(privateKeyPem) {
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
    type: 'pkcs8',
  });
  const publicKey = crypto.createPublicKey(privateKey);
  return publicKey.export({ format: 'jwk' });
}

module.exports = Object.freeze({
  createLocalEd25519Signer,
  generateEd25519KeyPair,
  publicKeyJwkFromPem,
});
