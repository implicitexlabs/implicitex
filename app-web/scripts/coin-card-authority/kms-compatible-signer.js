'use strict';

const { createHash } = require('node:crypto');
const { derP256ToP1363, P1363_SIGNATURE_BYTES } = require('./strict-der-p256');

const KMS_ALGORITHM = 'EC_SIGN_P256_SHA256';
const WIRE_ALGORITHM = 'ECDSA_P256_SHA256';
const WIRE_ENCODING = 'ieee-p1363';
const WIRE_VALUE_ENCODING = 'base64url-unpadded';

function canonicalBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function asMessageBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  throw new TypeError('signing message must be bytes');
}

function validateConfiguration(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('KMS signer options are required');
  }
  const allowed = ['asymmetricSign', 'keyId', 'keyVersionName', 'kmsAlgorithm'];
  for (const key of Object.keys(options)) {
    if (!allowed.includes(key)) throw new Error(`unsupported KMS signer option: ${key}`);
  }
  if (typeof options.asymmetricSign !== 'function') {
    throw new TypeError('asymmetricSign must be a function');
  }
  if (typeof options.keyId !== 'string' || !options.keyId) {
    throw new TypeError('keyId must be a nonempty string');
  }
  if (typeof options.keyVersionName !== 'string' || !options.keyVersionName) {
    throw new TypeError('keyVersionName must be a nonempty string');
  }
  if (options.kmsAlgorithm !== KMS_ALGORITHM) {
    throw new Error(`unsupported KMS algorithm: ${String(options.kmsAlgorithm)}`);
  }
}

function normalizeResponse(raw) {
  const response = Array.isArray(raw) ? raw[0] : raw;
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('KMS asymmetricSign response is invalid');
  }
  if (response.algorithm !== undefined && response.algorithm !== KMS_ALGORITHM) {
    throw new Error(`KMS response algorithm mismatch: ${String(response.algorithm)}`);
  }
  if (response.verifiedDigestCrc32c === false) {
    throw new Error('KMS did not verify the request digest checksum');
  }
  if (response.signatureCrc32cVerified === false) {
    throw new Error('KMS signature checksum verification failed');
  }
  if (!response.signature) throw new Error('KMS response signature is missing');
  return response;
}

function createKmsCompatibleP256Signer(options) {
  validateConfiguration(options);
  const asymmetricSign = options.asymmetricSign;
  const keyId = options.keyId;
  const keyVersionName = options.keyVersionName;

  async function signMessage(message) {
    const messageBytes = asMessageBytes(message);
    const digest = createHash('sha256').update(messageBytes).digest();
    const request = Object.freeze({
      name: keyVersionName,
      digest: Object.freeze({ sha256: Buffer.from(digest) }),
    });
    const rawResponse = await asymmetricSign(request);
    const response = normalizeResponse(rawResponse);
    const p1363 = derP256ToP1363(response.signature);
    if (p1363.length !== P1363_SIGNATURE_BYTES) {
      throw new Error('KMS signature conversion did not produce 64 bytes');
    }
    const value = canonicalBase64Url(p1363);
    if (!/^[A-Za-z0-9_-]{86}$/.test(value)) {
      throw new Error('KMS signature conversion produced noncanonical base64url');
    }
    return Object.freeze({
      mode: 'signed-p256-v1',
      algorithm: WIRE_ALGORITHM,
      signatureEncoding: WIRE_ENCODING,
      signatureLengthBytes: P1363_SIGNATURE_BYTES,
      signatureValueEncoding: WIRE_VALUE_ENCODING,
      keyId,
      value,
    });
  }

  async function signCanonicalPayload(domain, canonicalPayload) {
    if (typeof domain !== 'string' || !domain) throw new TypeError('signature domain is required');
    if (typeof canonicalPayload !== 'string' || !canonicalPayload) {
      throw new TypeError('canonical payload is required');
    }
    return signMessage(Buffer.concat([
      Buffer.from(domain, 'utf8'),
      Buffer.from([0]),
      Buffer.from(canonicalPayload, 'utf8'),
    ]));
  }

  return Object.freeze({
    keyId,
    keyVersionName,
    kmsAlgorithm: KMS_ALGORITHM,
    wireAlgorithm: WIRE_ALGORITHM,
    signMessage,
    signCanonicalPayload,
  });
}

module.exports = Object.freeze({
  KMS_ALGORITHM,
  WIRE_ALGORITHM,
  WIRE_ENCODING,
  WIRE_VALUE_ENCODING,
  createKmsCompatibleP256Signer,
});
