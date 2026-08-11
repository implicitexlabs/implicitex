'use strict';

const { createHash, createPublicKey, verify } = require('node:crypto');
const { ROLES, assertRoleBoundSigner } = require('./authority-roles');

function sortCanonical(value) {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.keys(value).sort().forEach((key) => { result[key] = sortCanonical(value[key]); });
  return result;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function canonicalizeManifestPayload(manifest) {
  const payload = {};
  Object.keys(manifest).sort().forEach((key) => {
    if (key !== 'signature' && key !== 'manifestHash') payload[key] = manifest[key];
  });
  return JSON.stringify(sortCanonical(payload));
}

function manifestHash(manifest) {
  const value = clone(manifest);
  delete value.manifestHash;
  return `sha256:${createHash('sha256').update(JSON.stringify(sortCanonical(value))).digest('hex')}`;
}

async function signProtectedManifest(fields, signer) {
  assertRoleBoundSigner(signer, ROLES.MANIFEST);
  const manifest = clone(fields);
  if (Object.prototype.hasOwnProperty.call(manifest, 'signature')
    || Object.prototype.hasOwnProperty.call(manifest, 'manifestHash')) {
    throw new Error('manifest signer constructs signature and manifestHash');
  }
  if (manifest.schemaVersion !== 'coin-card-manifest.v1') throw new Error('manifest schema unsupported');
  if (typeof manifest.issuerId !== 'string' || !manifest.issuerId) throw new Error('manifest issuer invalid');
  if (typeof manifest.environment !== 'string' || !manifest.environment) throw new Error('manifest environment invalid');
  if (typeof manifest.signedAt !== 'string' || !manifest.signedAt) throw new Error('manifest signedAt invalid');
  if (Object.prototype.hasOwnProperty.call(manifest, 'keyId') && manifest.keyId !== signer.keyId) {
    throw new Error('manifest keyId cannot be caller-rebound');
  }
  manifest.keyId = signer.keyId;
  const signed = await signer.signManifestPayload(canonicalizeManifestPayload(manifest));
  manifest.signature = {
    mode: 'signed-p256-v1', algorithm: 'ECDSA_P256_SHA256', keyId: signer.keyId,
    issuerId: manifest.issuerId, environment: manifest.environment, signedAt: manifest.signedAt,
    signatureEncoding: 'ieee-p1363', signatureLengthBytes: 64,
    signatureValueEncoding: 'base64url-unpadded', value: signed.value,
  };
  manifest.manifestHash = manifestHash(manifest);
  return deepFreeze(manifest);
}

function verifyProtectedManifest(manifest, publicJwk) {
  try {
    if (!manifest || manifest.manifestHash !== manifestHash(manifest)) return false;
    if (!manifest.signature || manifest.signature.keyId !== manifest.keyId) return false;
    if (manifest.signature.issuerId !== manifest.issuerId
      || manifest.signature.environment !== manifest.environment
      || manifest.signature.signedAt !== manifest.signedAt) return false;
    const publicKey = createPublicKey({ key: publicJwk, format: 'jwk' });
    return verify(
      'sha256', Buffer.from(canonicalizeManifestPayload(manifest), 'utf8'),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(manifest.signature.value, 'base64url'),
    );
  } catch (error) {
    return false;
  }
}

module.exports = Object.freeze({
  canonicalizeManifestPayload, manifestHash, signProtectedManifest, verifyProtectedManifest,
});
