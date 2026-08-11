'use strict';

const { createHash } = require('node:crypto');
const canonicalJsonApi = require('../../frontend/public/card/coin-card-canonical-json-v1.js');

const DOMAINS = Object.freeze({
  usernameSnapshotSignature: 'ImplicitEx.CoinCard.PublicUsernameRegistry.v1',
  usernameSnapshotArtifact: 'ImplicitEx.CoinCard.PublicUsernameRegistryArtifact.v1',
  usernameHeadSignature: 'ImplicitEx.CoinCard.PublicUsernameRegistryHead.v1',
  usernameHeadArtifact: 'ImplicitEx.CoinCard.PublicUsernameRegistryHeadArtifact.v1',
  lifecycleRecordSignature: 'ImplicitEx Coin Card Lifecycle Registry Record v1',
  lifecycleRecordArtifact: 'ImplicitEx.CoinCard.AuthenticatedLifecycleRecord.v1',
  executableRecordArtifact: 'ImplicitEx.CoinCard.ExecutableRegistryRecord.v2',
  executableHeadSignature: 'ImplicitEx.CoinCard.ExecutableRegistryHead.v1',
  executableHeadArtifact: 'ImplicitEx.CoinCard.ExecutableRegistryHeadArtifact.v1',
});

const ENVELOPE_KINDS = Object.freeze({
  USERNAME: 'USERNAME',
  LIFECYCLE: 'LIFECYCLE',
  EXECUTABLE_HEAD: 'EXECUTABLE_HEAD',
});

function clonePlain(value) {
  const canonical = canonicalJsonApi.canonicalizeJson(value);
  if (canonical === null) throw new TypeError('artifact must be canonical plain JSON data');
  return JSON.parse(canonical);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

function domainSeparatedBytes(domain, canonical) {
  if (typeof domain !== 'string' || !domain) throw new TypeError('domain is required');
  if (typeof canonical !== 'string' || !canonical) throw new TypeError('canonical payload is required');
  return Buffer.concat([Buffer.from(domain, 'utf8'), Buffer.from([0]), Buffer.from(canonical, 'utf8')]);
}

function hashArtifact(domain, artifact) {
  const canonical = canonicalJsonApi.canonicalizeJson(artifact);
  if (canonical === null) throw new TypeError('artifact is not canonicalizable');
  return `sha256:${createHash('sha256').update(domainSeparatedBytes(domain, canonical)).digest('hex')}`;
}

function signatureMetadata(kind, fields, signer) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new TypeError('artifact fields are required');
  }
  const signedAt = kind === ENVELOPE_KINDS.LIFECYCLE ? fields.publishedAt : fields.issuedAt;
  if (typeof fields.authorityId !== 'string' || !fields.authorityId) {
    throw new TypeError('authorityId is required');
  }
  if (typeof signedAt !== 'string' || !signedAt) throw new TypeError('signing time is required');
  const metadata = {
    mode: 'signed-p256-v1',
    algorithm: 'ECDSA_P256_SHA256',
    signatureEncoding: 'ieee-p1363',
  };
  if (kind !== ENVELOPE_KINDS.EXECUTABLE_HEAD) metadata.signatureLengthBytes = 64;
  metadata.signatureValueEncoding = 'base64url-unpadded';
  metadata.keyId = signer.keyId;
  if (kind === ENVELOPE_KINDS.USERNAME) metadata.keyUsage = 'coin-card-registry-publication';
  if (kind === ENVELOPE_KINDS.EXECUTABLE_HEAD) {
    metadata.keyUsage = 'coin-card-executable-registry-head';
  }
  metadata.authorityId = fields.authorityId;
  metadata.signedAt = signedAt;
  return metadata;
}

async function signArtifact({ fields, signer, signatureDomain, envelopeKind }) {
  if (!signer || typeof signer.signCanonicalPayload !== 'function' || !signer.keyId) {
    throw new TypeError('private-material-free signer interface is required');
  }
  const facts = clonePlain(fields);
  if (Object.prototype.hasOwnProperty.call(facts, 'signature')) {
    throw new TypeError('publisher constructs the signature envelope');
  }
  const signature = signatureMetadata(envelopeKind, facts, signer);
  const payload = { ...facts, signature };
  const canonicalPayload = canonicalJsonApi.canonicalizeJson(payload);
  if (canonicalPayload === null) throw new TypeError('signature payload is not canonicalizable');
  const signed = await signer.signCanonicalPayload(signatureDomain, canonicalPayload);
  if (
    !signed
    || signed.keyId !== signer.keyId
    || signed.mode !== signature.mode
    || signed.algorithm !== signature.algorithm
    || signed.signatureEncoding !== signature.signatureEncoding
    || signed.signatureValueEncoding !== signature.signatureValueEncoding
    || typeof signed.value !== 'string'
    || !/^[A-Za-z0-9_-]{86}$/.test(signed.value)
  ) throw new Error('signer returned incompatible wire metadata');
  return deepFreeze({ ...facts, signature: { ...signature, value: signed.value } });
}

function createAuthorityArtifactFactory({ signer }) {
  if (!signer || typeof signer.signCanonicalPayload !== 'function') {
    throw new TypeError('signer is required');
  }
  return Object.freeze({
    signUsernameSnapshot(fields) {
      return signArtifact({
        fields,
        signer,
        signatureDomain: DOMAINS.usernameSnapshotSignature,
        envelopeKind: ENVELOPE_KINDS.USERNAME,
      });
    },
    signUsernameHead(fields) {
      return signArtifact({
        fields,
        signer,
        signatureDomain: DOMAINS.usernameHeadSignature,
        envelopeKind: ENVELOPE_KINDS.USERNAME,
      });
    },
    signLifecycleRecord(fields) {
      return signArtifact({
        fields,
        signer,
        signatureDomain: DOMAINS.lifecycleRecordSignature,
        envelopeKind: ENVELOPE_KINDS.LIFECYCLE,
      });
    },
    signExecutableHead(fields) {
      return signArtifact({
        fields,
        signer,
        signatureDomain: DOMAINS.executableHeadSignature,
        envelopeKind: ENVELOPE_KINDS.EXECUTABLE_HEAD,
      });
    },
    buildLifecycleBundle(fields) {
      return deepFreeze(clonePlain(fields));
    },
    hashUsernameSnapshot(value) { return hashArtifact(DOMAINS.usernameSnapshotArtifact, value); },
    hashUsernameHead(value) { return hashArtifact(DOMAINS.usernameHeadArtifact, value); },
    hashLifecycleRecord(value) { return hashArtifact(DOMAINS.lifecycleRecordArtifact, value); },
    hashExecutableRecord(value) { return hashArtifact(DOMAINS.executableRecordArtifact, value); },
    hashExecutableHead(value) { return hashArtifact(DOMAINS.executableHeadArtifact, value); },
  });
}

module.exports = Object.freeze({
  DOMAINS,
  ENVELOPE_KINDS,
  createAuthorityArtifactFactory,
  hashArtifact,
});
