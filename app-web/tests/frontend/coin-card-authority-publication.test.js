'use strict';

const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const test = require('node:test');

const canonicalJsonApi = require('../../frontend/public/card/coin-card-canonical-json-v1.js');
const { createKmsCompatibleP256Signer, KMS_ALGORITHM } = require('../../scripts/coin-card-authority/kms-compatible-signer');
const { createAuthorityArtifactFactory, hashArtifact, DOMAINS } = require('../../scripts/coin-card-authority/authority-artifacts');
const { createLocalAtomicArtifactStore } = require('../../scripts/coin-card-authority/local-atomic-artifact-store');
const { createAuthorityPublisher } = require('../../scripts/coin-card-authority/authority-publisher');

const KEY_ID = 'non-production-authority-publication-test-key';
const CARD_ID = 'cc_01KZJTH0XZ1QJG9A1K9T5GJAWE';
const ACCOUNT_ID = 'acct_01KZJTH0XZ1QJG9A1K9T5GJAWE';
const ISSUED = '2026-08-11T12:00:00.000Z';
const HEAD_EXPIRES = '2026-08-11T12:10:00.000Z';

function p1363ToDer(value) {
  function integer(bytes) {
    let offset = 0;
    while (offset < bytes.length - 1 && bytes[offset] === 0) offset += 1;
    let magnitude = Buffer.from(bytes.subarray(offset));
    if (magnitude[0] & 0x80) magnitude = Buffer.concat([Buffer.from([0]), magnitude]);
    return Buffer.concat([Buffer.from([0x02, magnitude.length]), magnitude]);
  }
  const signature = Buffer.from(value);
  const r = integer(signature.subarray(0, 32));
  const s = integer(signature.subarray(32));
  const body = Buffer.concat([r, s]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

async function harness() {
  const pair = await webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  );
  const signer = createKmsCompatibleP256Signer({
    keyId: KEY_ID,
    keyVersionName: 'projects/non-production/locations/global/keyRings/test/cryptoKeys/test/cryptoKeyVersions/1',
    kmsAlgorithm: KMS_ALGORITHM,
    asymmetricSign: async ({ digest }) => {
      assert.equal(Buffer.from(digest.sha256).length, 32);
      // This harness mirrors KMS's pre-hashed boundary while WebCrypto performs
      // the equivalent SHA-256 internally over the original message captured below.
      const message = harness.pendingMessage;
      const p1363 = await webcrypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, message
      );
      return { algorithm: KMS_ALGORITHM, signature: p1363ToDer(p1363) };
    },
  });
  const originalSign = signer.signCanonicalPayload;
  const interfaceSigner = Object.freeze({
    keyId: signer.keyId,
    async signCanonicalPayload(domain, canonical) {
      harness.pendingMessage = Buffer.concat([
        Buffer.from(domain, 'utf8'), Buffer.from([0]), Buffer.from(canonical, 'utf8'),
      ]);
      return originalSign(domain, canonical);
    },
  });
  const artifacts = createAuthorityArtifactFactory({ signer: interfaceSigner });

  async function verifySignature(artifact, domain) {
    const payload = JSON.parse(JSON.stringify(artifact));
    const value = payload.signature.value;
    delete payload.signature.value;
    const canonical = canonicalJsonApi.canonicalizeJson(payload);
    const message = Buffer.concat([
      Buffer.from(domain, 'utf8'), Buffer.from([0]), Buffer.from(canonical, 'utf8'),
    ]);
    return webcrypto.subtle.verify(
      { name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.publicKey,
      Buffer.from(value, 'base64url'), message
    );
  }
  return { artifacts, verifySignature };
}

function usernameSnapshotFields(revision = 1) {
  return {
    registrySchemaVersion: 'coin-card-public-username-registry.v1',
    registryId: 'implicitex-public-usernames',
    environment: 'production',
    registryRevision: revision,
    issuedAt: ISSUED,
    expiresAt: '2026-08-12T11:59:00.000Z',
    authorityId: 'implicitex-registry',
    entries: [{ username: 'antoinedennison', status: 'ACTIVE', accountId: ACCOUNT_ID, cardId: CARD_ID }],
  };
}

function usernameHeadFields() {
  return {
    headSchemaVersion: 'coin-card-public-username-registry-head.v1',
    registryId: 'implicitex-public-usernames',
    environment: 'production',
    issuedAt: ISSUED,
    expiresAt: HEAD_EXPIRES,
    authorityId: 'implicitex-registry',
  };
}

function lifecycleFields() {
  return {
    registryId: 'implicitex-production',
    registrySchemaVersion: 'coin-card-lifecycle-registry-record.v1',
    environment: 'production', registryVersion: 1,
    recordId: 'antoine-lifecycle-r1', publishedAt: ISSUED,
    cardId: CARD_ID, manifestId: 'coincard-production-v1', revision: 1,
    previousManifestId: null, cardStatus: 'CARD_ACTIVE', manifestStatus: 'MANIFEST_CURRENT',
    effectiveFrom: ISSUED, effectiveUntil: null, supersededByManifestId: null,
    reasonCode: null, authorityId: 'implicitex-registry', administrationEvidenceHash: null,
  };
}

function executableRecord() {
  return {
    registrySchemaVersion: 'coin-card-registry-record.v2',
    registryId: 'implicitex-executable-production', environment: 'production',
    recordId: 'ccr2-antoine-r1', revision: '1', cardId: CARD_ID,
    recipientAddress: '0x1111111111111111111111111111111111111111', chainId: '1',
    tokenContractAddress: '0x2222222222222222222222222222222222222222',
    executionContractAddress: '0x3333333333333333333333333333333333333333',
    executionContractInterfaceId: 'implicitex-executor-v1',
    executionInterfaceDescriptorHash: `sha256:${'4'.repeat(64)}`,
    feePolicy: {
      policyVersion: 'fee-policy-v1', feeBasisPoints: '100', feeCapAtomic: null,
      minimumTransferAtomic: '1', maximumTransferAtomic: '1000000',
      transferPrecisionAtomic: '1', roundingRule: 'FLOOR_BPS_THEN_CAP',
      feeRecipientAddress: '0x5555555555555555555555555555555555555555',
    },
  };
}

test('publisher writes and independently verifies immutable artifacts before atomically advancing Current Heads', async () => {
  const { artifacts, verifySignature } = await harness();
  const store = createLocalAtomicArtifactStore();
  const verify = {
    usernameSnapshot: async (value, hash) => (await verifySignature(value, DOMAINS.usernameSnapshotSignature))
      && artifacts.hashUsernameSnapshot(value) === hash,
    usernameHead: async (value, hash) => (await verifySignature(value, DOMAINS.usernameHeadSignature))
      && artifacts.hashUsernameHead(value) === hash,
    lifecycleRecord: async (value, hash) => (await verifySignature(value, DOMAINS.lifecycleRecordSignature))
      && artifacts.hashLifecycleRecord(value) === hash,
    lifecycleBundle: async (value, records) => value.entries.length === records.length
      && value.entries.every((entry, index) => canonicalJsonApi.canonicalizeJson(entry)
        === canonicalJsonApi.canonicalizeJson(records[index].artifact)),
    hashLifecycleBundle: (value) => hashArtifact('ImplicitEx.CoinCard.LifecycleRegistryBundleArtifact.v1', value),
    executableRecord: async (value, hash) => value.registrySchemaVersion === 'coin-card-registry-record.v2'
      && (!hash || artifacts.hashExecutableRecord(value) === hash),
    executableHead: async (value, hash) => (await verifySignature(value, DOMAINS.executableHeadSignature))
      && artifacts.hashExecutableHead(value) === hash,
  };
  const publisher = createAuthorityPublisher({ artifacts, store, verify });

  const username = await publisher.publishUsernameAuthority({
    snapshotFields: usernameSnapshotFields(), headFields: usernameHeadFields(),
  });
  assert.equal(username.head.artifact.currentSnapshotHash, username.snapshot.hash);
  assert.equal(username.head.artifact.currentRevision, 1);
  assert.equal(username.current.artifactHash, username.head.hash);

  const lifecycle = await publisher.publishLifecycleBundle({
    recordFields: [lifecycleFields()],
    bundleFields: {
      registrySchemaVersion: 'coin-card-lifecycle-registry-bundle.v1',
      registryId: 'implicitex-production', environment: 'production',
      registryVersion: 1, generatedAt: '2026-08-11T12:01:00.000Z',
    },
  });
  assert.equal(lifecycle.records.length, 1);
  assert.equal(lifecycle.bundle.artifact.entries[0].signature.keyId, KEY_ID);

  const route = executableRecord();
  const executableHeadFields = {
    headSchemaVersion: 'executable-registry-head.v1', headSequence: '1',
    lifecycleRecordHash: lifecycle.records[0].hash,
    transactionEvidenceAuthorityHash: `sha256:${'6'.repeat(64)}`,
    issuedAt: ISSUED, expiresAt: '2026-08-12T12:00:00.000Z',
    authorityId: 'implicitex-executable-registry',
  };
  const executable = await publisher.publishExecutableAuthority({
    record: route,
    headFields: executableHeadFields,
  });
  assert.equal(executable.head.artifact.coinCardRegistryRecordHash, executable.record.hash);
  assert.equal(executable.current.artifactHash, executable.head.hash);
  assert.equal(executable.head.artifact.signature.signatureLengthBytes, undefined);
  assert.deepEqual(Object.keys(executable.head.artifact.signature).sort(), [
    'algorithm', 'authorityId', 'keyId', 'keyUsage', 'mode',
    'signatureEncoding', 'signatureValueEncoding', 'signedAt', 'value',
  ].sort());
  await assert.rejects(publisher.publishExecutableAuthority({
    record: route, headFields: executableHeadFields,
    expectedCurrentHeadHash: executable.head.hash,
  }), /monotonic order rejected/);
  assert.deepEqual(await store.readCurrent(`executable-current-head/${executable.scope}`), executable.current);
});

test('verification failure cannot advance an established Current Head', async () => {
  const { artifacts, verifySignature } = await harness();
  const store = createLocalAtomicArtifactStore();
  let rejectRevisionTwo = false;
  const verify = {
    usernameSnapshot: async (value, hash) => (await verifySignature(value, DOMAINS.usernameSnapshotSignature))
      && artifacts.hashUsernameSnapshot(value) === hash,
    usernameHead: async (value, hash) => !rejectRevisionTwo
      && (await verifySignature(value, DOMAINS.usernameHeadSignature))
      && artifacts.hashUsernameHead(value) === hash,
  };
  const publisher = createAuthorityPublisher({ artifacts, store, verify });
  const first = await publisher.publishUsernameAuthority({
    snapshotFields: usernameSnapshotFields(1), headFields: usernameHeadFields(),
  });
  rejectRevisionTwo = true;
  await assert.rejects(publisher.publishUsernameAuthority({
    snapshotFields: usernameSnapshotFields(2), headFields: usernameHeadFields(),
    expectedCurrentHeadHash: first.head.hash,
  }), /independent verification failed/);
  assert.deepEqual(await store.readCurrent('public-username-current-head'), first.current);
});

test('immutable writes reject conflicting bytes and Current Head compare-and-swap rejects races', async () => {
  const store = createLocalAtomicArtifactStore();
  await store.putImmutable('artifact/one', { value: 'one' });
  await assert.rejects(store.putImmutable('artifact/one', { value: 'two' }), /immutable artifact conflict/);
  await store.compareAndSwapCurrent('scope', null, {
    artifactKey: 'artifact/one', artifactHash: `sha256:${'a'.repeat(64)}`,
  });
  await assert.rejects(store.compareAndSwapCurrent('scope', null, {
    artifactKey: 'artifact/one', artifactHash: `sha256:${'b'.repeat(64)}`,
  }), /compare-and-swap conflict/);
});

test('publisher rejects non-increasing username revisions before replacing Current Head', async () => {
  const { artifacts, verifySignature } = await harness();
  const store = createLocalAtomicArtifactStore();
  const verify = {
    usernameSnapshot: async (value, hash) => (await verifySignature(value, DOMAINS.usernameSnapshotSignature))
      && artifacts.hashUsernameSnapshot(value) === hash,
    usernameHead: async (value, hash) => (await verifySignature(value, DOMAINS.usernameHeadSignature))
      && artifacts.hashUsernameHead(value) === hash,
  };
  const publisher = createAuthorityPublisher({ artifacts, store, verify });
  const first = await publisher.publishUsernameAuthority({
    snapshotFields: usernameSnapshotFields(2), headFields: usernameHeadFields(),
  });
  await assert.rejects(publisher.publishUsernameAuthority({
    snapshotFields: usernameSnapshotFields(1), headFields: usernameHeadFields(),
    expectedCurrentHeadHash: first.head.hash,
  }), /monotonic order rejected/);
  assert.deepEqual(await store.readCurrent('public-username-current-head'), first.current);
});
