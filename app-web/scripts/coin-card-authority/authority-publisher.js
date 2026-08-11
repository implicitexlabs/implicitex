'use strict';

function requireVerified(result, label) {
  if (result !== true) throw new Error(`${label} independent verification failed`);
}

function immutableKey(kind, hash) {
  if (typeof hash !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(hash)) {
    throw new TypeError(`${kind} hash is invalid`);
  }
  return `${kind}/sha256/${hash.slice(7)}.json`;
}

function createAuthorityPublisher({ artifacts, store, verify }) {
  if (!artifacts || !store || !verify) throw new TypeError('artifacts, store, and verifiers are required');
  const requiredStoreMethods = [
    'putImmutable', 'readImmutable', 'compareAndSwapCurrent',
    'readCurrent', 'readCurrentArtifact',
  ];
  requiredStoreMethods.forEach((method) => {
    if (typeof store[method] !== 'function') throw new TypeError(`store.${method} is required`);
  });

  async function persistAndVerify(kind, artifact, hash, verifier) {
    const key = immutableKey(kind, hash);
    await store.putImmutable(key, artifact);
    const readBack = await store.readImmutable(key);
    requireVerified(await verifier(readBack, hash), kind);
    return Object.freeze({ key, hash, artifact: readBack });
  }

  async function advance(scope, expectedHash, persisted, order) {
    const priorPointer = await store.readCurrent(scope);
    const priorHash = priorPointer && priorPointer.artifactHash || null;
    if (priorHash !== expectedHash) throw new Error('current pointer compare-and-swap conflict');
    const priorArtifact = priorPointer ? await store.readCurrentArtifact(scope) : null;
    if (priorPointer && !priorArtifact) throw new Error('current pointer references missing artifact');
    if (typeof order === 'function' && !order(priorArtifact, persisted.artifact)) {
      throw new Error('current pointer monotonic order rejected');
    }
    const pointer = Object.freeze({
      artifactKey: persisted.key,
      artifactHash: persisted.hash,
    });
    await store.compareAndSwapCurrent(scope, expectedHash, pointer);
    const readBack = await store.readCurrent(scope);
    if (
      !readBack
      || readBack.artifactKey !== pointer.artifactKey
      || readBack.artifactHash !== pointer.artifactHash
    ) throw new Error('current pointer read-back verification failed');
    return readBack;
  }

  return Object.freeze({
    async publishUsernameAuthority({ snapshotFields, headFields, expectedCurrentHeadHash = null }) {
      const snapshot = await artifacts.signUsernameSnapshot(snapshotFields);
      const snapshotHash = artifacts.hashUsernameSnapshot(snapshot);
      const storedSnapshot = await persistAndVerify(
        'public-username-snapshots', snapshot, snapshotHash, verify.usernameSnapshot
      );
      if (Object.prototype.hasOwnProperty.call(headFields, 'currentSnapshotHash')
        || Object.prototype.hasOwnProperty.call(headFields, 'currentRevision')) {
        throw new Error('username head snapshot identity is publisher-derived');
      }
      const head = await artifacts.signUsernameHead({
        ...headFields,
        currentRevision: snapshot.registryRevision,
        currentSnapshotHash: snapshotHash,
      });
      const headHash = artifacts.hashUsernameHead(head);
      const storedHead = await persistAndVerify(
        'public-username-heads', head, headHash, verify.usernameHead
      );
      const current = await advance(
        'public-username-current-head', expectedCurrentHeadHash, storedHead,
        (prior, next) => prior === null || next.currentRevision > prior.currentRevision
      );
      return Object.freeze({ snapshot: storedSnapshot, head: storedHead, current });
    },

    async publishLifecycleBundle({ recordFields, bundleFields }) {
      const records = [];
      for (const fields of recordFields) {
        const record = await artifacts.signLifecycleRecord(fields);
        const hash = artifacts.hashLifecycleRecord(record);
        records.push(await persistAndVerify('lifecycle-records', record, hash, verify.lifecycleRecord));
      }
      const bundle = artifacts.buildLifecycleBundle({
        ...bundleFields,
        entries: records.map((entry) => entry.artifact),
      });
      requireVerified(await verify.lifecycleBundle(bundle, records), 'lifecycle bundle');
      const bundleHash = verify.hashLifecycleBundle(bundle);
      const storedBundle = await persistAndVerify(
        'lifecycle-bundles', bundle, bundleHash,
        async (value) => verify.lifecycleBundle(value, records)
      );
      return Object.freeze({ records: Object.freeze(records), bundle: storedBundle });
    },

    async publishExecutableAuthority({
      record,
      headFields,
      expectedCurrentHeadHash = null,
    }) {
      requireVerified(await verify.executableRecord(record), 'executable record');
      const recordHash = artifacts.hashExecutableRecord(record);
      const storedRecord = await persistAndVerify(
        'executable-records', record, recordHash, verify.executableRecord
      );
      const derivedFields = [
        'registryId', 'environment', 'cardId', 'coinCardRegistryRecordId',
        'coinCardRegistryRecordRevision', 'coinCardRegistryRecordHash',
      ];
      derivedFields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(headFields, field)) {
          throw new Error(`executable head ${field} is publisher-derived`);
        }
      });
      const head = await artifacts.signExecutableHead({
        ...headFields,
        registryId: record.registryId,
        environment: record.environment,
        cardId: record.cardId,
        coinCardRegistryRecordId: record.recordId,
        coinCardRegistryRecordRevision: record.revision,
        coinCardRegistryRecordHash: recordHash,
      });
      const headHash = artifacts.hashExecutableHead(head);
      const storedHead = await persistAndVerify(
        'executable-heads', head, headHash, verify.executableHead
      );
      const scope = JSON.stringify([head.registryId, head.environment, head.cardId]);
      const current = await advance(
        `executable-current-head/${scope}`, expectedCurrentHeadHash, storedHead,
        (prior, next) => prior === null || BigInt(next.headSequence) > BigInt(prior.headSequence)
      );
      return Object.freeze({ record: storedRecord, head: storedHead, current, scope });
    },
  });
}

module.exports = Object.freeze({ createAuthorityPublisher, immutableKey });
