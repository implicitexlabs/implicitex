'use strict';

const { USAGES } = require('./trusted-key-records');

const ROLES = Object.freeze({
  MANIFEST: 'MANIFEST',
  REGISTRY_PUBLICATION: 'REGISTRY_PUBLICATION',
  EXECUTABLE_CURRENT_HEAD: 'EXECUTABLE_CURRENT_HEAD',
  TRANSACTION_EVIDENCE: 'TRANSACTION_EVIDENCE',
});

const ROLE_PROFILES = Object.freeze({
  [ROLES.MANIFEST]: Object.freeze({
    usage: USAGES.MANIFEST,
    domains: Object.freeze([]),
    rawManifest: true,
  }),
  [ROLES.REGISTRY_PUBLICATION]: Object.freeze({
    usage: USAGES.REGISTRY_PUBLICATION,
    domains: Object.freeze([
      'ImplicitEx.CoinCard.PublicUsernameRegistry.v1',
      'ImplicitEx.CoinCard.PublicUsernameRegistry.v2',
      'ImplicitEx.CoinCard.PublicUsernameRegistryHead.v1',
      'ImplicitEx Coin Card Lifecycle Registry Record v1',
    ]),
    rawManifest: false,
  }),
  [ROLES.EXECUTABLE_CURRENT_HEAD]: Object.freeze({
    usage: USAGES.EXECUTABLE_CURRENT_HEAD,
    domains: Object.freeze(['ImplicitEx.CoinCard.ExecutableRegistryHead.v1']),
    rawManifest: false,
  }),
  [ROLES.TRANSACTION_EVIDENCE]: Object.freeze({
    usage: USAGES.TRANSACTION_EVIDENCE,
    domains: Object.freeze(['ImplicitEx.CoinCard.TransactionEvidence.v2']),
    rawManifest: false,
  }),
});

const ROLE_BOUND = new WeakSet();

function validatePrimitive(signer) {
  if (!signer || typeof signer !== 'object' || Array.isArray(signer)) {
    throw new TypeError('signer primitive is required');
  }
  if (typeof signer.keyId !== 'string' || !signer.keyId) throw new TypeError('signer keyId is required');
  if (typeof signer.signMessage !== 'function' || typeof signer.signCanonicalPayload !== 'function') {
    throw new TypeError('private-material-free signer primitive is required');
  }
}

function compatibleResult(result, keyId) {
  if (!result || result.keyId !== keyId) throw new Error('signer keyId mismatch');
  if (
    result.mode !== 'signed-p256-v1'
    || result.algorithm !== 'ECDSA_P256_SHA256'
    || result.signatureEncoding !== 'ieee-p1363'
    || result.signatureLengthBytes !== 64
    || result.signatureValueEncoding !== 'base64url-unpadded'
    || typeof result.value !== 'string'
    || !/^[A-Za-z0-9_-]{86}$/.test(result.value)
  ) throw new Error('signer returned incompatible P-256 wire metadata');
  return result;
}

function createRoleBoundSigner({ role, signer }) {
  const profile = ROLE_PROFILES[role];
  if (!profile) throw new Error(`unsupported authority role: ${String(role)}`);
  validatePrimitive(signer);
  const keyId = signer.keyId;

  const result = Object.freeze({
    authorityRole: role,
    permittedUsage: profile.usage,
    keyId,
    keyVersionName: signer.keyVersionName || null,
    async signCanonicalPayload(domain, canonicalPayload) {
      if (!profile.domains.includes(domain)) {
        throw new Error(`authority role ${role} cannot sign domain ${String(domain)}`);
      }
      return compatibleResult(await signer.signCanonicalPayload(domain, canonicalPayload), keyId);
    },
    async signManifestPayload(canonicalPayload) {
      if (!profile.rawManifest) throw new Error(`authority role ${role} cannot sign protected manifests`);
      if (typeof canonicalPayload !== 'string' || !canonicalPayload) {
        throw new TypeError('canonical manifest payload is required');
      }
      return compatibleResult(await signer.signMessage(Buffer.from(canonicalPayload, 'utf8')), keyId);
    },
  });
  ROLE_BOUND.add(result);
  return result;
}

function assertRoleBoundSigner(signer, expectedRole) {
  if (!signer || !ROLE_BOUND.has(signer)) throw new TypeError('role-bound signer is required');
  if (signer.authorityRole !== expectedRole) {
    throw new Error(`authority role mismatch: expected ${expectedRole}, got ${signer.authorityRole}`);
  }
  const profile = ROLE_PROFILES[expectedRole];
  if (!profile || signer.permittedUsage !== profile.usage) throw new Error('authority usage mismatch');
  return signer;
}

function createAuthoritySignerSet(primitivesByRole) {
  const roles = Object.values(ROLES);
  if (!primitivesByRole || typeof primitivesByRole !== 'object' || Array.isArray(primitivesByRole)) {
    throw new TypeError('authority signer map is required');
  }
  const actual = Object.keys(primitivesByRole).sort();
  const expected = roles.slice().sort();
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error('authority signer map must contain exactly the governed roles');
  }
  const keyIds = new Set();
  const resources = new Set();
  const result = {};
  roles.forEach((role) => {
    const primitive = primitivesByRole[role];
    validatePrimitive(primitive);
    if (keyIds.has(primitive.keyId)) throw new Error(`ambiguous Coin Card keyId mapping: ${primitive.keyId}`);
    if (typeof primitive.keyVersionName !== 'string' || !primitive.keyVersionName) {
      throw new Error(`KMS resource missing for authority role ${role}`);
    }
    if (resources.has(primitive.keyVersionName)) {
      throw new Error(`KMS resource reused across authority roles: ${primitive.keyVersionName}`);
    }
    keyIds.add(primitive.keyId);
    resources.add(primitive.keyVersionName);
    result[role] = createRoleBoundSigner({ role, signer: primitive });
  });
  return Object.freeze(result);
}

module.exports = Object.freeze({
  ROLES, ROLE_PROFILES, createRoleBoundSigner, assertRoleBoundSigner, createAuthoritySignerSet,
});
