'use strict';

const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const test = require('node:test');

const canonicalJson = require('../../frontend/public/card/coin-card-canonical-json-v1.js');
const { ROLES, createRoleBoundSigner } = require('../../scripts/coin-card-authority/authority-roles');
const { DOMAINS, hashArtifact } = require('../../scripts/coin-card-authority/authority-artifacts');
const { signProtectedManifest, verifyProtectedManifest } = require('../../scripts/coin-card-authority/protected-manifest-authority');
const {
  createTransactionEvidenceFactory, verifyTransactionEvidence, assertTransactionEvidence, evidenceArtifactHash,
} = require('../../scripts/coin-card-authority/transaction-evidence-authority');
const { SCHEMA_V3, USAGES, createTrustedKeyRecord } = require('../../scripts/coin-card-authority/trusted-key-records');
const { createAuthorityPublisher } = require('../../scripts/coin-card-authority/authority-publisher');
const { createAuthorityArtifactFactory } = require('../../scripts/coin-card-authority/authority-artifacts');
const { createLocalAtomicArtifactStore } = require('../../scripts/coin-card-authority/local-atomic-artifact-store');

const NOW = '2026-08-11T12:00:00.000Z';
const MANIFEST = `sha256:${'1'.repeat(64)}`;
const CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';

function primitive(keyId) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  function result(message) {
    const value = sign('sha256', message, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return Object.freeze({
      mode: 'signed-p256-v1', algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363', signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded', keyId, value,
    });
  }
  return {
    pair,
    signer: Object.freeze({
      keyId, keyVersionName: `projects/test/locations/global/keyRings/test/cryptoKeys/${keyId}/cryptoKeyVersions/1`,
      async signMessage(message) { return result(Buffer.from(message)); },
      async signCanonicalPayload(domain, payload) {
        return result(Buffer.concat([Buffer.from(domain), Buffer.from([0]), Buffer.from(payload)]));
      },
    }),
  };
}

function publicJwk(pair) {
  const value = pair.publicKey.export({ format: 'jwk' });
  return { kty: 'EC', crv: 'P-256', x: value.x, y: value.y, key_ops: ['verify'], ext: true };
}

function lifecycle() {
  return {
    registryId: 'implicitex-production', registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production', registryVersion: 1, recordId: 'lifecycle-r7', publishedAt: NOW,
    cardId: CARD_ID, manifestId: MANIFEST, revision: 7, previousManifestId: null,
    cardStatus: 'CARD_ACTIVE', manifestStatus: 'MANIFEST_CURRENT', effectiveFrom: NOW,
    effectiveUntil: null, supersededByManifestId: null, reasonCode: null,
    authorityId: 'implicitex-registry', administrationEvidenceHash: null,
    signature: { value: 'fixture-signature-not-authoritative-in-this-test' },
  };
}

function executable() {
  return {
    registrySchemaVersion: 'coin-card-registry-record.v2', registryId: 'implicitex-executable-production',
    environment: 'production', recordId: 'route-r7', revision: '7', cardId: CARD_ID,
    recipientAddress: '0x1111111111111111111111111111111111111111', chainId: '137',
    tokenContractAddress: '0x2222222222222222222222222222222222222222',
    executionContractAddress: '0x3333333333333333333333333333333333333333',
    executionContractInterfaceId: 'implicitex-evidence-bound-transfer.v1',
    executionInterfaceDescriptorHash: `sha256:${'4'.repeat(64)}`,
    feePolicy: {
      policyVersion: 'implicitex-fee-policy.v2', feeBasisPoints: '100', feeCapAtomic: '10000000',
      minimumTransferAtomic: '1000000', maximumTransferAtomic: '250000000',
      transferPrecisionAtomic: '10000', roundingRule: 'FLOOR_BPS_THEN_CAP',
      feeRecipientAddress: '0x4444444444444444444444444444444444444444',
    },
  };
}

function evidenceContext(pair, keyId, lifecycleRecord, executableRecord) {
  const lifecycleRecordHash = hashArtifact(DOMAINS.lifecycleRecordArtifact, lifecycleRecord);
  const executableRecordHash = hashArtifact(DOMAINS.executableRecordArtifact, executableRecord);
  const inputs = {
    issuerId: 'implicitex-transaction-evidence', environment: 'production', signedAt: NOW,
    runtimeManifestId: MANIFEST, lifecycleRecord, lifecycleRecordHash,
    executableRecord, executableRecordHash,
  };
  const trustedKeyRecord = createTrustedKeyRecord({
    schemaVersion: SCHEMA_V3, keyId, publicKey: publicJwk(pair),
    issuerId: inputs.issuerId, usage: [USAGES.TRANSACTION_EVIDENCE],
    validFrom: '2026-01-01T00:00:00.000Z', environment: 'production',
  });
  return { ...inputs, inputs, trustedKeyRecord, verificationTime: NOW, headIssuedAt: NOW };
}

test('role-bound signers reject every cross-authority domain and raw-manifest confusion', async () => {
  const { signer } = primitive('role-isolation');
  const manifest = createRoleBoundSigner({ role: ROLES.MANIFEST, signer });
  const registry = createRoleBoundSigner({ role: ROLES.REGISTRY_PUBLICATION, signer });
  const executableHead = createRoleBoundSigner({ role: ROLES.EXECUTABLE_CURRENT_HEAD, signer });
  const evidence = createRoleBoundSigner({ role: ROLES.TRANSACTION_EVIDENCE, signer });
  await assert.rejects(manifest.signCanonicalPayload(DOMAINS.lifecycleRecordSignature, '{}'), /cannot sign domain/);
  await assert.rejects(registry.signCanonicalPayload(DOMAINS.executableHeadSignature, '{}'), /cannot sign domain/);
  await assert.rejects(executableHead.signCanonicalPayload('ImplicitEx.CoinCard.TransactionEvidence.v2', '{}'), /cannot sign domain/);
  await assert.rejects(evidence.signCanonicalPayload(DOMAINS.usernameHeadSignature, '{}'), /cannot sign domain/);
  await assert.rejects(registry.signManifestPayload('{}'), /cannot sign protected manifests/);
});

test('role-bound manifest signer produces the frozen wire contract and rejects wrong roles', async () => {
  const key = primitive('manifest-kms-test');
  const manifestSigner = createRoleBoundSigner({ role: ROLES.MANIFEST, signer: key.signer });
  const value = await signProtectedManifest({
    schemaVersion: 'coin-card-manifest.v1', issuerId: 'implicitex', environment: 'production',
    signedAt: NOW, buildVersion: 'bridge-test', assets: [], scope: 'coin-card-runtime-package',
  }, manifestSigner);
  assert.equal(verifyProtectedManifest(value, publicJwk(key.pair)), true);
  const registrySigner = createRoleBoundSigner({ role: ROLES.REGISTRY_PUBLICATION, signer: key.signer });
  await assert.rejects(signProtectedManifest({ schemaVersion: 'coin-card-manifest.v1' }, registrySigner), /role mismatch/);
});

test('Transaction Evidence signs, independently verifies, and atomically publishes exact state bindings', async () => {
  const key = primitive('evidence-kms-test');
  const roleSigner = createRoleBoundSigner({ role: ROLES.TRANSACTION_EVIDENCE, signer: key.signer });
  const life = lifecycle();
  const route = executable();
  const context = evidenceContext(key.pair, key.signer.keyId, life, route);
  const factory = createTransactionEvidenceFactory({ signer: roleSigner, verifyInputs: async () => true });
  const envelope = await factory.sign(context.inputs);
  assert.doesNotThrow(() => assertTransactionEvidence(envelope, context));
  assert.equal(verifyTransactionEvidence(envelope, context), true);

  const inert = primitive('publisher-inert');
  const artifacts = createAuthorityArtifactFactory({
    registryPublicationSigner: createRoleBoundSigner({ role: ROLES.REGISTRY_PUBLICATION, signer: inert.signer }),
    executableCurrentHeadSigner: createRoleBoundSigner({ role: ROLES.EXECUTABLE_CURRENT_HEAD, signer: inert.signer }),
  });
  const publisher = createAuthorityPublisher({
    artifacts, transactionEvidence: factory, store: createLocalAtomicArtifactStore(),
    verify: { transactionEvidence: async (value) => verifyTransactionEvidence(value, context) },
  });
  const published = await publisher.publishTransactionEvidence({ inputs: context.inputs });
  assert.equal(published.hash, evidenceArtifactHash(published.artifact));
  assert.equal(published.key.startsWith('transaction-evidence/sha256/'), true);
});

test('Transaction Evidence fails closed on authority, key, lifecycle, route, binding, and signature substitution', async () => {
  const key = primitive('evidence-negative-test');
  const roleSigner = createRoleBoundSigner({ role: ROLES.TRANSACTION_EVIDENCE, signer: key.signer });
  const life = lifecycle();
  const route = executable();
  const context = evidenceContext(key.pair, key.signer.keyId, life, route);
  const envelope = await createTransactionEvidenceFactory({ signer: roleSigner, verifyInputs: async () => true })
    .sign(context.inputs);

  const vectors = [
    { ...context, trustedKeyRecord: { ...context.trustedKeyRecord, keyId: 'wrong-key' } },
    { ...context, trustedKeyRecord: { ...context.trustedKeyRecord, issuerId: 'wrong-authority' } },
    { ...context, lifecycleRecord: { ...life, cardId: 'cc_wrong' } },
    { ...context, executableRecord: { ...route, revision: '8' } },
    { ...context, lifecycleRecordHash: `sha256:${'a'.repeat(64)}` },
    { ...context, executableRecordHash: `sha256:${'b'.repeat(64)}` },
  ];
  vectors.forEach((candidate) => assert.equal(verifyTransactionEvidence(envelope, candidate), false));
  const malformed = JSON.parse(JSON.stringify(envelope));
  malformed.signature = 'A'.repeat(86);
  assert.equal(verifyTransactionEvidence(malformed, context), false);
  const substituted = JSON.parse(JSON.stringify(envelope));
  substituted.authority.recipientAddress = '0x9999999999999999999999999999999999999999';
  assert.equal(verifyTransactionEvidence(substituted, context), false);

  const wrongUsageKey = createTrustedKeyRecord({
    schemaVersion: SCHEMA_V3, keyId: key.signer.keyId, publicKey: publicJwk(key.pair),
    issuerId: context.inputs.issuerId, usage: [USAGES.EXECUTABLE_CURRENT_HEAD],
    validFrom: '2026-01-01T00:00:00.000Z', environment: 'production',
  });
  assert.equal(verifyTransactionEvidence(envelope, { ...context, trustedKeyRecord: wrongUsageKey }), false);
  assert.throws(() => createTransactionEvidenceFactory({
    signer: createRoleBoundSigner({ role: ROLES.EXECUTABLE_CURRENT_HEAD, signer: key.signer }),
    verifyInputs: async () => true,
  }), /role mismatch/);
});

test('Transaction Evidence publisher refuses unverified source inputs', async () => {
  const key = primitive('evidence-input-rejection');
  const roleSigner = createRoleBoundSigner({ role: ROLES.TRANSACTION_EVIDENCE, signer: key.signer });
  const context = evidenceContext(key.pair, key.signer.keyId, lifecycle(), executable());
  const factory = createTransactionEvidenceFactory({ signer: roleSigner, verifyInputs: async () => false });
  await assert.rejects(factory.sign(context.inputs), /failed independent verification/);
  const wrongHash = { ...context.inputs, executableRecordHash: `sha256:${'c'.repeat(64)}` };
  const permissive = createTransactionEvidenceFactory({ signer: roleSigner, verifyInputs: async () => true });
  await assert.rejects(permissive.sign(wrongHash), /executable record hash mismatch/);
  assert.notEqual(canonicalJson.canonicalizeJson(context.inputs.executableRecord), null);
});
