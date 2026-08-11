'use strict';

const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, verify } = require('node:crypto');
const test = require('node:test');

const canonicalJson = require('../../frontend/public/card/coin-card-canonical-json-v1.js');
const {
  ROLES, createRoleBoundSigner, createAuthoritySignerSet,
} = require('../../scripts/coin-card-authority/authority-roles');
const { DOMAINS, createAuthorityArtifactFactory } = require('../../scripts/coin-card-authority/authority-artifacts');
const { signProtectedManifest, verifyProtectedManifest } = require('../../scripts/coin-card-authority/protected-manifest-authority');
const {
  SCHEMA_V1, SCHEMA_V3, USAGES, createTrustedKeyRecord, mergeTrustedKeyRecords,
} = require('../../scripts/coin-card-authority/trusted-key-records');
const {
  createTransactionEvidenceFactory, verifyTransactionEvidence,
} = require('../../scripts/coin-card-authority/transaction-evidence-authority');

const NOW = '2026-08-11T12:00:00.000Z';
const CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';

function authorityKey(keyId, usage) {
  const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  function signed(message) {
    const value = sign('sha256', message, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    return Object.freeze({
      mode: 'signed-p256-v1', algorithm: 'ECDSA_P256_SHA256',
      signatureEncoding: 'ieee-p1363', signatureLengthBytes: 64,
      signatureValueEncoding: 'base64url-unpadded', keyId, value,
    });
  }
  const primitive = Object.freeze({
    keyId,
    keyVersionName: `projects/test/locations/global/keyRings/transition/cryptoKeys/${keyId}/cryptoKeyVersions/1`,
    async signMessage(message) { return signed(Buffer.from(message)); },
    async signCanonicalPayload(domain, payload) {
      return signed(Buffer.concat([Buffer.from(domain), Buffer.from([0]), Buffer.from(payload)]));
    },
  });
  const exported = pair.publicKey.export({ format: 'jwk' });
  const publicJwk = {
    kty: 'EC', crv: 'P-256', x: exported.x, y: exported.y, key_ops: ['verify'], ext: true,
  };
  return { keyId, usage, pair, primitive, publicJwk };
}

function trustRecord(key, schemaVersion, issuerId) {
  return createTrustedKeyRecord({
    schemaVersion, keyId: key.keyId, publicKey: key.publicJwk, issuerId,
    usage: [key.usage], validFrom: '2026-01-01T00:00:00.000Z', environment: 'production',
  });
}

function verifySignedArtifact(artifact, domain, pair) {
  const payload = JSON.parse(JSON.stringify(artifact));
  const signature = Buffer.from(payload.signature.value, 'base64url');
  delete payload.signature.value;
  const message = Buffer.concat([
    Buffer.from(domain), Buffer.from([0]), Buffer.from(canonicalJson.canonicalizeJson(payload)),
  ]);
  return verify('sha256', message, { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, signature);
}

function lifecycleFields(manifestId) {
  return {
    registryId: 'implicitex-production', registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production', registryVersion: 1, recordId: 'transition-lifecycle-r1',
    publishedAt: NOW, cardId: CARD_ID, manifestId, revision: 1, previousManifestId: null,
    cardStatus: 'CARD_ACTIVE', manifestStatus: 'MANIFEST_CURRENT', effectiveFrom: NOW,
    effectiveUntil: null, supersededByManifestId: null, reasonCode: null,
    authorityId: 'implicitex-registry', administrationEvidenceHash: null,
  };
}

function executableRecord() {
  return {
    registrySchemaVersion: 'coin-card-registry-record.v2', registryId: 'implicitex-executable-production',
    environment: 'production', recordId: 'transition-route-r1', revision: '1', cardId: CARD_ID,
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

test('two-release bridge and KMS activation preserve overlap and prove the complete authority conjunction', async () => {
  const oldManifest = authorityKey('legacy-manifest', USAGES.MANIFEST);
  const oldRegistry = authorityKey('legacy-registry', USAGES.REGISTRY_PUBLICATION);
  const kmsManifest = authorityKey('kms-manifest', USAGES.MANIFEST);
  const kmsRegistry = authorityKey('kms-registry', USAGES.REGISTRY_PUBLICATION);
  const kmsExecutable = authorityKey('kms-executable-head', USAGES.EXECUTABLE_CURRENT_HEAD);
  const kmsEvidence = authorityKey('kms-transaction-evidence', USAGES.TRANSACTION_EVIDENCE);
  const trust = mergeTrustedKeyRecords(
    trustRecord(oldManifest, SCHEMA_V1, 'implicitex'),
    trustRecord(oldRegistry, SCHEMA_V1, 'implicitex-registry'),
    trustRecord(kmsManifest, SCHEMA_V3, 'implicitex'),
    trustRecord(kmsRegistry, SCHEMA_V3, 'implicitex-registry'),
    trustRecord(kmsExecutable, SCHEMA_V3, 'implicitex-executable-registry'),
    trustRecord(kmsEvidence, SCHEMA_V3, 'implicitex-transaction-evidence'),
  );
  assert.equal(trust.length, 6);
  assert.equal(new Set(trust.map((record) => record.keyId)).size, 6);

  const bridgeManifestSigner = createRoleBoundSigner({ role: ROLES.MANIFEST, signer: oldManifest.primitive });
  const bridgeArtifacts = createAuthorityArtifactFactory({
    registryPublicationSigner: createRoleBoundSigner({ role: ROLES.REGISTRY_PUBLICATION, signer: oldRegistry.primitive }),
    executableCurrentHeadSigner: createRoleBoundSigner({ role: ROLES.EXECUTABLE_CURRENT_HEAD, signer: kmsExecutable.primitive }),
  });
  const bridgeManifest = await signProtectedManifest({
    schemaVersion: 'coin-card-manifest.v1', issuerId: 'implicitex', environment: 'production',
    signedAt: NOW, buildVersion: 'BRIDGE', scope: 'coin-card-runtime-package',
    assets: [{ path: 'card/coin-card-trusted-keys.js', bytes: 1, sha256: `sha256:${'a'.repeat(64)}` }],
  }, bridgeManifestSigner);
  const bridgeLifecycle = await bridgeArtifacts.signLifecycleRecord(lifecycleFields(bridgeManifest.manifestHash));
  assert.equal(verifyProtectedManifest(bridgeManifest, oldManifest.publicJwk), true);
  assert.equal(verifySignedArtifact(bridgeLifecycle, DOMAINS.lifecycleRecordSignature, oldRegistry.pair), true);
  assert.equal(bridgeLifecycle.signature.keyId, oldRegistry.keyId);
  assert.equal(trust.some((record) => record.keyId === kmsEvidence.keyId), true);

  const signerSet = createAuthoritySignerSet({
    [ROLES.MANIFEST]: kmsManifest.primitive,
    [ROLES.REGISTRY_PUBLICATION]: kmsRegistry.primitive,
    [ROLES.EXECUTABLE_CURRENT_HEAD]: kmsExecutable.primitive,
    [ROLES.TRANSACTION_EVIDENCE]: kmsEvidence.primitive,
  });
  const activationArtifacts = createAuthorityArtifactFactory({
    registryPublicationSigner: signerSet[ROLES.REGISTRY_PUBLICATION],
    executableCurrentHeadSigner: signerSet[ROLES.EXECUTABLE_CURRENT_HEAD],
  });
  const activationManifest = await signProtectedManifest({
    schemaVersion: 'coin-card-manifest.v1', issuerId: 'implicitex', environment: 'production',
    signedAt: NOW, buildVersion: 'ACTIVATION', scope: 'coin-card-runtime-package', assets: [],
  }, signerSet[ROLES.MANIFEST]);
  const lifecycle = await activationArtifacts.signLifecycleRecord(lifecycleFields(activationManifest.manifestHash));
  const snapshot = await activationArtifacts.signUsernameSnapshot({
    registrySchemaVersion: 'coin-card-public-username-registry.v2', registryId: 'implicitex-public-usernames',
    environment: 'production', registryRevision: 1, issuedAt: NOW,
    expiresAt: '2026-08-12T11:59:00.000Z', authorityId: 'implicitex-registry',
    entries: [{ username: 'antoinedennison', status: 'ACTIVE', accountId: 'acct_transition', cardId: CARD_ID }],
  });
  const snapshotHash = activationArtifacts.hashUsernameSnapshot(snapshot);
  const usernameHead = await activationArtifacts.signUsernameHead({
    headSchemaVersion: 'coin-card-public-username-registry-head.v1', registryId: 'implicitex-public-usernames',
    environment: 'production', currentRevision: 1, currentSnapshotHash: snapshotHash,
    issuedAt: NOW, expiresAt: '2026-08-11T12:10:00.000Z', authorityId: 'implicitex-registry',
  });
  const route = executableRecord();
  const lifecycleHash = activationArtifacts.hashLifecycleRecord(lifecycle);
  const routeHash = activationArtifacts.hashExecutableRecord(route);
  const evidenceInputs = {
    issuerId: 'implicitex-transaction-evidence', environment: 'production', signedAt: NOW,
    runtimeManifestId: activationManifest.manifestHash,
    lifecycleRecord: lifecycle, lifecycleRecordHash: lifecycleHash,
    executableRecord: route, executableRecordHash: routeHash,
  };
  const evidence = await createTransactionEvidenceFactory({
    signer: signerSet[ROLES.TRANSACTION_EVIDENCE], verifyInputs: async () => true,
  }).sign(evidenceInputs);
  const executableHead = await activationArtifacts.signExecutableHead({
    headSchemaVersion: 'executable-registry-head.v1', registryId: route.registryId,
    environment: route.environment, cardId: route.cardId,
    coinCardRegistryRecordId: route.recordId, coinCardRegistryRecordRevision: route.revision,
    coinCardRegistryRecordHash: routeHash, headSequence: '1', lifecycleRecordHash: lifecycleHash,
    transactionEvidenceAuthorityHash: evidence.authorityHash,
    issuedAt: NOW, expiresAt: '2026-08-12T12:00:00.000Z', authorityId: 'implicitex-executable-registry',
  });

  assert.equal(verifyProtectedManifest(activationManifest, kmsManifest.publicJwk), true);
  assert.equal(verifySignedArtifact(lifecycle, DOMAINS.lifecycleRecordSignature, kmsRegistry.pair), true);
  assert.equal(verifySignedArtifact(snapshot, DOMAINS.usernameSnapshotSignature, kmsRegistry.pair), true);
  assert.equal(verifySignedArtifact(usernameHead, DOMAINS.usernameHeadSignature, kmsRegistry.pair), true);
  assert.equal(verifySignedArtifact(executableHead, DOMAINS.executableHeadSignature, kmsExecutable.pair), true);
  assert.equal(verifyTransactionEvidence(evidence, {
    ...evidenceInputs, trustedKeyRecord: trust.find((record) => record.keyId === kmsEvidence.keyId),
    verificationTime: NOW, headIssuedAt: executableHead.issuedAt,
  }), true);
  assert.equal(executableHead.lifecycleRecordHash, lifecycleHash);
  assert.equal(executableHead.coinCardRegistryRecordHash, routeHash);
  assert.equal(executableHead.transactionEvidenceAuthorityHash, evidence.authorityHash);
  assert.equal(trust.some((record) => record.keyId === oldManifest.keyId), true);
  assert.equal(trust.some((record) => record.keyId === oldRegistry.keyId), true);
  assert.equal(typeof globalThis.IX_EXECUTION, 'undefined');
});

test('governed signer set rejects ambiguous keyId and CryptoKeyVersion mappings', () => {
  const keys = Object.fromEntries(Object.values(ROLES).map((role) => [role, authorityKey(`key-${role}`, 'unused').primitive]));
  assert.equal(Object.keys(createAuthoritySignerSet(keys)).length, 4);
  const sameId = { ...keys, [ROLES.TRANSACTION_EVIDENCE]: { ...keys[ROLES.TRANSACTION_EVIDENCE], keyId: keys[ROLES.MANIFEST].keyId } };
  assert.throws(() => createAuthoritySignerSet(sameId), /ambiguous Coin Card keyId mapping/);
  const sameResource = {
    ...keys,
    [ROLES.TRANSACTION_EVIDENCE]: {
      ...keys[ROLES.TRANSACTION_EVIDENCE], keyVersionName: keys[ROLES.MANIFEST].keyVersionName,
    },
  };
  assert.throws(() => createAuthoritySignerSet(sameResource), /resource reused/);
});
