'use strict';

const { createHash, createPublicKey, verify } = require('node:crypto');
const canonicalJsonApi = require('../../frontend/public/card/coin-card-canonical-json-v1.js');
const { ROLES, assertRoleBoundSigner } = require('./authority-roles');
const { USAGES, validateTrustedKeyRecord } = require('./trusted-key-records');
const { DOMAINS, hashArtifact } = require('./authority-artifacts');

const AUTHORITY_DOMAIN = 'ImplicitEx.CoinCard.TransactionEvidence.v2';
const EVIDENCE_DOMAIN = 'ImplicitEx.CoinCard.TransactionEvidence';
const EVIDENCE_SCHEMA = 'transaction-evidence.v2';
const SIGNATURE_ALGORITHM = 'ECDSA_P256_SHA256_P1363';
const AUTHORITY_FIELDS = Object.freeze([
  'cardId', 'chainId', 'coinCardRegistryId', 'coinCardRegistryRecordHash',
  'coinCardRegistryRecordId', 'coinCardRegistryRecordRevision',
  'coinCardRegistrySchemaVersion', 'environment', 'evidenceDomain',
  'evidenceSchemaVersion', 'executionContractAddress', 'executionContractInterfaceId',
  'executionInterfaceDescriptorHash', 'feePolicy', 'issuerId', 'lifecycleRecordHash',
  'lifecycleRecordId', 'lifecycleRecordRevision', 'lifecycleRegistryId',
  'lifecycleRegistrySchemaVersion', 'recipientAddress', 'runtimeManifestId',
  'signedAt', 'signingKeyId', 'tokenContractAddress',
]);
const ENVELOPE_FIELDS = Object.freeze(['authority', 'authorityHash', 'keyId', 'signature', 'signatureAlgorithm']);
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function canonical(value) {
  const result = canonicalJsonApi.canonicalizeJson(value);
  if (result === null) throw new Error('Transaction Evidence is not canonical JSON');
  return result;
}

function clone(value) { return JSON.parse(canonical(value)); }
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.keys(value).forEach((key) => freeze(value[key]));
  return Object.freeze(value);
}
function exactFields(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  return actual.length === wanted.length && actual.every((item, index) => item === wanted[index]);
}
function bytesForAuthority(authority) {
  return Buffer.concat([Buffer.from(AUTHORITY_DOMAIN), Buffer.from([0]), Buffer.from(canonical(authority))]);
}
function hashAuthority(authority) {
  return `sha256:${createHash('sha256').update(bytesForAuthority(authority)).digest('hex')}`;
}
function atomic(value, label) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} invalid`);
    return String(value);
  }
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} invalid`);
  return value;
}
function canonicalTime(value, label) {
  const parsed = Date.parse(value);
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)
    || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) throw new Error(`${label} invalid`);
  return parsed;
}
function requireHash(value, label) {
  if (typeof value !== 'string' || !HASH_RE.test(value)) throw new Error(`${label} invalid`);
  return value;
}

function deriveAuthority({ issuerId, environment, signedAt, signerKeyId, runtimeManifestId,
  lifecycleRecord, lifecycleRecordHash, executableRecord, executableRecordHash }) {
  const lifecycle = clone(lifecycleRecord);
  const executable = clone(executableRecord);
  canonicalTime(signedAt, 'Transaction Evidence signedAt');
  requireHash(runtimeManifestId, 'runtime manifest ID');
  requireHash(lifecycleRecordHash, 'lifecycle record hash');
  requireHash(executableRecordHash, 'executable record hash');
  if (hashArtifact(DOMAINS.lifecycleRecordArtifact, lifecycle) !== lifecycleRecordHash) {
    throw new Error('lifecycle record hash mismatch');
  }
  if (hashArtifact(DOMAINS.executableRecordArtifact, executable) !== executableRecordHash) {
    throw new Error('executable record hash mismatch');
  }
  if (lifecycle.manifestId !== runtimeManifestId) throw new Error('lifecycle manifest binding mismatch');
  if (lifecycle.cardId !== executable.cardId) throw new Error('lifecycle/executable card mismatch');
  if (lifecycle.environment !== environment || executable.environment !== environment) {
    throw new Error('Transaction Evidence environment mismatch');
  }
  return freeze({
    evidenceDomain: EVIDENCE_DOMAIN, evidenceSchemaVersion: EVIDENCE_SCHEMA,
    issuerId, environment, cardId: executable.cardId, runtimeManifestId,
    lifecycleRegistryId: lifecycle.registryId,
    lifecycleRegistrySchemaVersion: lifecycle.registrySchemaVersion,
    lifecycleRecordId: lifecycle.recordId,
    lifecycleRecordRevision: atomic(lifecycle.revision, 'lifecycle revision'),
    lifecycleRecordHash,
    coinCardRegistryId: executable.registryId,
    coinCardRegistrySchemaVersion: executable.registrySchemaVersion,
    coinCardRegistryRecordId: executable.recordId,
    coinCardRegistryRecordRevision: atomic(executable.revision, 'executable revision'),
    coinCardRegistryRecordHash: executableRecordHash,
    recipientAddress: executable.recipientAddress,
    chainId: atomic(executable.chainId, 'chain ID'),
    tokenContractAddress: executable.tokenContractAddress,
    executionContractAddress: executable.executionContractAddress,
    executionContractInterfaceId: executable.executionContractInterfaceId,
    executionInterfaceDescriptorHash: executable.executionInterfaceDescriptorHash,
    feePolicy: clone(executable.feePolicy), signedAt, signingKeyId: signerKeyId,
  });
}

async function signTransactionEvidence(inputs, signer) {
  assertRoleBoundSigner(signer, ROLES.TRANSACTION_EVIDENCE);
  const authority = deriveAuthority({ ...inputs, signerKeyId: signer.keyId });
  const signed = await signer.signCanonicalPayload(AUTHORITY_DOMAIN, canonical(authority));
  return freeze({
    authority, authorityHash: hashAuthority(authority), keyId: signer.keyId,
    signature: signed.value, signatureAlgorithm: SIGNATURE_ALGORITHM,
  });
}

function assertTransactionEvidence(envelope, context) {
    if (!exactFields(envelope, ENVELOPE_FIELDS) || !exactFields(envelope.authority, AUTHORITY_FIELDS)) throw new Error('Transaction Evidence fields invalid');
    if (envelope.signatureAlgorithm !== SIGNATURE_ALGORITHM
      || !/^[A-Za-z0-9_-]{86}$/.test(envelope.signature)) throw new Error('Transaction Evidence signature metadata invalid');
    if (envelope.keyId !== envelope.authority.signingKeyId) throw new Error('Transaction Evidence key binding invalid');
    if (envelope.authorityHash !== hashAuthority(envelope.authority)) throw new Error('Transaction Evidence authority hash invalid');
    const record = validateTrustedKeyRecord(context.trustedKeyRecord);
    if (record.keyId !== envelope.authority.signingKeyId
      || !record.usage.includes(USAGES.TRANSACTION_EVIDENCE)
      || record.issuerId !== envelope.authority.issuerId
      || record.environment !== envelope.authority.environment
      || record.status !== 'ACTIVE') throw new Error('Transaction Evidence trusted key denied');
    const verificationMs = canonicalTime(context.verificationTime, 'verification time');
    const signedMs = canonicalTime(envelope.authority.signedAt, 'evidence signedAt');
    if (signedMs > verificationMs + 300000) throw new Error('Transaction Evidence signing time is in the future');
    if (signedMs < Date.parse(record.validFrom)
      || (record.validUntil !== null && signedMs > Date.parse(record.validUntil))) throw new Error('Transaction Evidence signing time outside key validity');
    if (context.headIssuedAt !== undefined && signedMs > canonicalTime(context.headIssuedAt, 'head issuedAt')) throw new Error('Transaction Evidence postdates Current Head');
    const expected = deriveAuthority({
      issuerId: envelope.authority.issuerId, environment: envelope.authority.environment,
      signedAt: envelope.authority.signedAt, signerKeyId: envelope.authority.signingKeyId,
      runtimeManifestId: context.runtimeManifestId, lifecycleRecord: context.lifecycleRecord,
      lifecycleRecordHash: context.lifecycleRecordHash, executableRecord: context.executableRecord,
      executableRecordHash: context.executableRecordHash,
    });
    if (canonical(expected) !== canonical(envelope.authority)) throw new Error('Transaction Evidence state binding mismatch');
    const publicKey = createPublicKey({ key: record.publicKey, format: 'jwk' });
    if (!verify('sha256', bytesForAuthority(envelope.authority),
      { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(envelope.signature, 'base64url'))
    ) throw new Error('Transaction Evidence signature invalid');
    return true;
}

function verifyTransactionEvidence(envelope, context) {
  try {
    return assertTransactionEvidence(envelope, context);
  } catch (error) {
    return false;
  }
}

function evidenceArtifactHash(envelope) {
  return `sha256:${createHash('sha256').update(Buffer.concat([
    Buffer.from('ImplicitEx.CoinCard.TransactionEvidenceArtifact.v2'), Buffer.from([0]), Buffer.from(canonical(envelope)),
  ])).digest('hex')}`;
}

function createTransactionEvidenceFactory({ signer, verifyInputs }) {
  assertRoleBoundSigner(signer, ROLES.TRANSACTION_EVIDENCE);
  if (typeof verifyInputs !== 'function') throw new TypeError('Transaction Evidence input verifier is required');
  return Object.freeze({
    async sign(inputs) {
      if (await verifyInputs(inputs) !== true) throw new Error('Transaction Evidence inputs failed independent verification');
      return signTransactionEvidence(inputs, signer);
    },
    hash: evidenceArtifactHash,
  });
}

module.exports = Object.freeze({
  AUTHORITY_DOMAIN, EVIDENCE_DOMAIN, EVIDENCE_SCHEMA, SIGNATURE_ALGORITHM,
  deriveAuthority, hashAuthority,
  verifyTransactionEvidence, assertTransactionEvidence, evidenceArtifactHash, createTransactionEvidenceFactory,
});
