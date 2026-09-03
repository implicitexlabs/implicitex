'use strict';

/**
 * in-memory-publication-store.js — CoinCard artifact publication store
 *
 * Provides an in-memory implementation of the artifact publication store for
 * testing the CAS publication semantics.  The production implementation would
 * replace this with a real transactional database.
 *
 * Uniqueness constraints enforced:
 *   artifact_hash                         UNIQUE   (globally)
 *   operation_fingerprint                 UNIQUE   (globally, when provided)
 *   (card_id, artifact_version)           UNIQUE   (per card, no version gaps or duplicates)
 *   (card_id, supersedes_hash)            UNIQUE   (one successor per predecessor, chain not DAG)
 *
 * CAS semantics:
 *   commitPublication() is synchronous in its critical section.  In
 *   single-threaded Node.js this makes the read-check-write sequence atomic
 *   with respect to other synchronous code.  Two publication requests that
 *   start before either resolves will execute in arrival order; the first
 *   commits, the second sees the committed state and fails.
 *
 * Idempotency (two layers):
 *
 *   Artifact-level (artifact_hash):
 *     Same artifact presented again → return existing publication with
 *     { idempotent: true }.  Guards against exact-same-artifact replay.
 *
 *   Operation-level (operation_fingerprint):
 *     Same logical operation (same domain state + same predecessor) presented
 *     again → return existing publication with { idempotent: true }.
 *     Guards against lost-response retries where the retry clock differs and
 *     a re-run of the builder would produce a different issued_at and therefore
 *     a different artifact_hash.
 *     Provided via record.operation_fingerprint; optional for raw store callers.
 *
 * Failure injection (testing):
 *   Pass { testFaultAfterInsert: true } as the second argument to
 *   commitPublication() to simulate a crash after the publication row is
 *   written but before the head pointer is updated.  The store rolls back
 *   the insertion.
 *
 * Test helpers:
 *   _testForceInsertPredecessorEntry(cardId, supersedesHash, record)
 *     Injects a record directly into _byPredecessor without touching any other
 *     index or advancing the head pointer.  Used to establish the exact
 *     precondition needed to prove that the predecessor uniqueness index
 *     independently blocks DAG branching, independent of the head-pointer CAS.
 *     Test-only; never call from production code.
 */

const PUBLICATION_ERROR_CODES = Object.freeze({
  PUBLICATION_PREDECESSOR_REQUIRED:  'PUBLICATION_PREDECESSOR_REQUIRED',
  PUBLICATION_PREDECESSOR_MISMATCH:  'PUBLICATION_PREDECESSOR_MISMATCH',
  PUBLICATION_VERSION_MISMATCH:      'PUBLICATION_VERSION_MISMATCH',
  PUBLICATION_IDENTITY_MISMATCH:     'PUBLICATION_IDENTITY_MISMATCH',
  PUBLICATION_HASH_DUPLICATE:        'PUBLICATION_HASH_DUPLICATE',
  PUBLICATION_CONCURRENT_UPDATE:     'PUBLICATION_CONCURRENT_UPDATE',
  PUBLICATION_PERSIST_FAILED:        'PUBLICATION_PERSIST_FAILED',
});

function fail(code, message) {
  return { ok: false, code, message };
}

class InMemoryPublicationStore {
  constructor() {
    // EvidencePublication records keyed by artifact_hash
    this._byHash = new Map();

    // EvidencePublication records keyed by operation_fingerprint
    this._byOperationFingerprint = new Map();

    // EvidencePublication records keyed by "card_id:artifact_version"
    this._byVersion = new Map();

    // Uniqueness index for "card_id:supersedes_hash" → prevents DAG branching
    this._byPredecessor = new Map();

    // Current publication head per card_id
    this._heads = new Map();
  }

  // ─── commitPublication ──────────────────────────────────────────────────────
  //
  // Atomically validates CAS conditions and commits a new publication.
  //
  // record shape (required):
  //   publication_id:          string
  //   card_id:                 string
  //   artifact_version:        number
  //   artifact_hash:           string   "sha256:..."
  //   supersedes_hash:         string | null
  //   artifact_payload:        object   (deep-frozen)
  //   published_at:            string   ISO 8601 microseconds
  //   signing_key_id:          string | null
  //   publication_fingerprint: string   == artifact_hash  (artifact dedup key)
  //
  // record shape (optional):
  //   operation_fingerprint:   string   "sha256:..."  (operation idempotency key)
  //     When provided, checked before CAS.  Enables a retry that rebuilt the
  //     artifact (different issued_at → different artifact_hash) to still be
  //     recognized as a duplicate of an already-committed operation.
  //
  // options:
  //   testFaultAfterInsert: boolean — simulate crash between insert + head update
  //
  // Returns:
  //   { ok: true, publication, idempotent: false }  on fresh commit
  //   { ok: true, publication, idempotent: true  }  on idempotent retry
  //   { ok: false, code, message }                  on failure

  commitPublication(record, options = {}) {
    const {
      card_id,
      artifact_version,
      artifact_hash,
      supersedes_hash,
      operation_fingerprint,
    } = record;

    // ── Idempotency check 1: artifact-level ──────────────────────────────────
    // The caller is retrying a previously successful publication with the
    // exact same artifact (same protected payload + issued_at).
    if (this._byHash.has(artifact_hash)) {
      const existing = this._byHash.get(artifact_hash);
      return Promise.resolve({ ok: true, publication: existing, idempotent: true });
    }

    // ── Idempotency check 2: operation-level ─────────────────────────────────
    // The caller rebuilt the artifact (different issued_at → different
    // artifact_hash) but the logical operation is the same.  Return the
    // previously committed publication without re-running the CAS.
    if (operation_fingerprint && this._byOperationFingerprint.has(operation_fingerprint)) {
      const existing = this._byOperationFingerprint.get(operation_fingerprint);
      return Promise.resolve({ ok: true, publication: existing, idempotent: true });
    }

    const currentHead = this._heads.get(card_id) || null;

    // ── First publication ─────────────────────────────────────────────────────
    if (currentHead === null) {
      if (artifact_version !== 1) {
        return Promise.resolve(fail(
          PUBLICATION_ERROR_CODES.PUBLICATION_VERSION_MISMATCH,
          'First publication must have artifact_version=1. Got: ' + artifact_version,
        ));
      }
      if (supersedes_hash !== null) {
        return Promise.resolve(fail(
          PUBLICATION_ERROR_CODES.PUBLICATION_PREDECESSOR_REQUIRED,
          'First publication must have supersedes_hash=null. Got: ' + supersedes_hash,
        ));
      }
    } else {
      // ── Successor publication ───────────────────────────────────────────────

      // Identity check
      if (currentHead.card_id !== card_id) {
        return Promise.resolve(fail(
          PUBLICATION_ERROR_CODES.PUBLICATION_IDENTITY_MISMATCH,
          'card_id does not match head. Expected: ' + currentHead.card_id +
          ' Got: ' + card_id,
        ));
      }

      // CAS: supersedes must point to current head
      if (supersedes_hash !== currentHead.artifact_hash) {
        return Promise.resolve(fail(
          PUBLICATION_ERROR_CODES.PUBLICATION_PREDECESSOR_MISMATCH,
          'supersedes_hash does not match current head artifact_hash. ' +
          'Expected: ' + currentHead.artifact_hash + ' Got: ' + supersedes_hash,
        ));
      }

      // Version must be exactly head + 1
      if (artifact_version !== currentHead.artifact_version + 1) {
        return Promise.resolve(fail(
          PUBLICATION_ERROR_CODES.PUBLICATION_VERSION_MISMATCH,
          'artifact_version must be head.artifact_version + 1. ' +
          'Expected: ' + (currentHead.artifact_version + 1) + ' Got: ' + artifact_version,
        ));
      }
    }

    // ── Uniqueness: (card_id, artifact_version) ───────────────────────────────
    const versionKey = card_id + ':' + artifact_version;
    if (this._byVersion.has(versionKey)) {
      return Promise.resolve(fail(
        PUBLICATION_ERROR_CODES.PUBLICATION_HASH_DUPLICATE,
        'Version ' + artifact_version + ' for card ' + card_id + ' is already published',
      ));
    }

    // ── Uniqueness: (card_id, supersedes_hash) — chain not DAG ───────────────
    const predecessorKey = card_id + ':' + supersedes_hash;
    if (this._byPredecessor.has(predecessorKey)) {
      return Promise.resolve(fail(
        PUBLICATION_ERROR_CODES.PUBLICATION_CONCURRENT_UPDATE,
        'A successor for artifact_hash ' + supersedes_hash +
        ' already exists. Only one successor per predecessor is permitted.',
      ));
    }

    // ── All checks passed: commit ─────────────────────────────────────────────
    // Insert publication record into all indexes.
    this._byHash.set(artifact_hash, record);
    this._byVersion.set(versionKey, record);
    this._byPredecessor.set(predecessorKey, record);
    if (operation_fingerprint) {
      this._byOperationFingerprint.set(operation_fingerprint, record);
    }

    // Simulate crash after insert but before head update (for atomicity testing).
    // On fault: roll back the insertion and return an error.
    if (options.testFaultAfterInsert) {
      this._byHash.delete(artifact_hash);
      this._byVersion.delete(versionKey);
      this._byPredecessor.delete(predecessorKey);
      if (operation_fingerprint) {
        this._byOperationFingerprint.delete(operation_fingerprint);
      }
      return Promise.resolve(fail(
        PUBLICATION_ERROR_CODES.PUBLICATION_PERSIST_FAILED,
        'simulated fault after publication insert — rolled back',
      ));
    }

    // Update current head.
    this._heads.set(card_id, record);

    return Promise.resolve({ ok: true, publication: record, idempotent: false });
  }

  // ─── Query methods ──────────────────────────────────────────────────────────

  getCurrentHead(cardId) {
    return this._heads.get(cardId) || null;
  }

  getPublicationByHash(artifactHash) {
    return this._byHash.get(artifactHash) || null;
  }

  getPublicationByOperationFingerprint(fingerprint) {
    return this._byOperationFingerprint.get(fingerprint) || null;
  }

  getPublicationByVersion(cardId, artifactVersion) {
    return this._byVersion.get(cardId + ':' + artifactVersion) || null;
  }

  /**
   * Walk the full publication chain for a card, oldest → newest.
   * Returns an array of EvidencePublication records.
   */
  walkChain(cardId) {
    const chain = [];
    let current = this.getPublicationByVersion(cardId, 1);
    while (current) {
      chain.push(current);
      const nextVersion = current.artifact_version + 1;
      current = this.getPublicationByVersion(cardId, nextVersion);
    }
    return chain;
  }

  // ─── Test helpers ───────────────────────────────────────────────────────────

  /**
   * _testForceInsertPredecessorEntry
   *
   * TEST-ONLY.  Directly inserts an entry into _byPredecessor without touching
   * any other index (_byHash, _byVersion, _byOperationFingerprint) or advancing
   * the head pointer.
   *
   * Purpose: establish the exact precondition needed to prove that the
   * predecessor uniqueness constraint independently blocks DAG branching,
   * separately from the head-pointer CAS check.
   *
   * Without this hook, reaching the _byPredecessor check requires the head
   * pointer to already match the incoming record's supersedes_hash — which
   * means the head-pointer CAS fires first and rejects the record before the
   * predecessor index is consulted.
   *
   * Scenario enabled by this hook:
   *   1. Card has head = V3.
   *   2. Force-insert predecessor entry: V3.card_id:V3.artifact_hash → phantom_V4a.
   *   3. Attempt to commit V4b with supersedes = V3.artifact_hash.
   *   4. Head check passes (head is still V3, V4b.supersedes = V3 ✓).
   *   5. Version check passes (version 4 = 3+1 ✓).
   *   6. (card_id, artifact_version) check passes (no real V4 in _byVersion ✓).
   *   7. _byPredecessor check FIRES → PUBLICATION_CONCURRENT_UPDATE.
   *
   * @param {string} cardId
   * @param {string} supersedesHash
   * @param {object} record   — arbitrary placeholder, typically the V4a record
   */
  _testForceInsertPredecessorEntry(cardId, supersedesHash, record) {
    this._byPredecessor.set(cardId + ':' + supersedesHash, record);
  }
}

module.exports = { InMemoryPublicationStore, PUBLICATION_ERROR_CODES };
