'use strict';

/**
 * publish-artifact.js — CoinCard artifact CAS publication
 *
 * Wraps a validated CoinCardArtifact in an EvidencePublication record and
 * commits it to the store via compare-and-swap semantics.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FUNCTION DOES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Publication is NOT part of the build pipeline.  The builder produces a
 * signed, frozen artifact.  Publication is a separate transaction that
 * associates that artifact with a monotone chain of record for a card.
 *
 * Three distinct states:
 *   SIGNED    — builder returned ok: true; artifact has a hash and signature
 *   PUBLISHED — publishArtifact() returned ok: true; record is in the store
 *   CURRENT   — the published record is the current head for its card_id
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CAS INVARIANTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * First publication (no previous):
 *   artifact.artifact_version === 1
 *   artifact.integrity.supersedes === null
 *
 * Successor publication:
 *   artifact.integrity.supersedes === store.getCurrentHead(card_id).artifact_hash
 *   artifact.artifact_version === head.artifact_version + 1
 *
 * Uniqueness constraints (enforced by store):
 *   artifact_hash                       UNIQUE globally
 *   (card_id, artifact_version)         UNIQUE per card
 *   (card_id, supersedes_hash)          UNIQUE per card (chain not DAG)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IDEMPOTENCY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * publication_fingerprint === artifact_hash
 *
 * The artifact_hash is derived from the protected payload, which does not
 * include the signature value — only the algorithm, key_id, signer_domain,
 * and signed_at.  Same protected content always produces the same hash.
 * Presenting the same artifact again returns the existing EvidencePublication
 * with { idempotent: true }.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   publishArtifact(artifact, { store, clock, allowUnsignedDev? })
 *
 *   artifact          — validated, frozen CoinCardArtifact V1
 *   store                — InMemoryPublicationStore (or production equivalent)
 *   clock                — { now: () => string }  ISO 8601 microseconds
 *   allowUnsignedDev     — default false; pass true only in test environments
 *   operationFingerprint — optional "sha256:..." from computePublicationOperationFingerprint;
 *                          stored in the record to enable operation-level idempotency
 *
 * Returns:
 *   { ok: true,  publication, idempotent: false }  fresh commit
 *   { ok: true,  publication, idempotent: true  }  idempotent retry
 *   { ok: false, code, message }                   validation or CAS failure
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EvidencePublication record shape
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   publication_id:          string   "pub_<UUID>"  — opaque record identity;
 *                                     assigned by publishArtifact, not derived
 *                                     from content.  In production this would
 *                                     be a ULID or DB-generated surrogate key.
 *   card_id:                 string
 *   artifact_version:        number
 *   artifact_hash:           string   "sha256:..."  — cryptographic artifact identity
 *   supersedes_hash:         string | null
 *   artifact_payload:        object   deep-frozen copy of the artifact
 *   published_at:            string   ISO 8601 microseconds (from clock)
 *   signing_key_id:          string | null
 *   publication_fingerprint: string   === artifact_hash  (artifact-level dedup key)
 *   operation_fingerprint:   string | undefined  "sha256:..."  (operation idempotency key)
 */

const { randomUUID } = require('node:crypto');
const path = require('node:path');
const { validateArtifact } = require('./validate-artifact.js');

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function fail(code, message) {
  return { ok: false, code, message };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// publishArtifact
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} artifact           — CoinCardArtifact V1 (from buildCoinCardArtifact)
 * @param {object} options
 *   @param {object}  options.store          — publication store (commitPublication + getCurrentHead)
 *   @param {object}  options.clock          — { now: () => string }
 *   @param {boolean} [options.allowUnsignedDev=false]
 *   @param {object}  [options.testFaultOptions={}]  — passed through to store for fault injection
 *
 * @returns {Promise<
 *   | { ok: true, publication: object, idempotent: boolean }
 *   | { ok: false, code: string, message: string }
 * >}
 */
async function publishArtifact(artifact, {
  store,
  clock,
  allowUnsignedDev = false,
  operationFingerprint = undefined,
  testFaultOptions = {},
} = {}) {

  // ─── Validate inputs ────────────────────────────────────────────────────────

  if (!store || typeof store.commitPublication !== 'function') {
    return fail('PUBLISH_STORE_INVALID', 'store must implement commitPublication()');
  }
  if (!clock || typeof clock.now !== 'function') {
    return fail('PUBLISH_CLOCK_INVALID', 'clock.now must be a function');
  }

  // ─── Step 1: Validate the artifact ─────────────────────────────────────────

  const validation = validateArtifact(artifact, { allowUnsignedDev });
  if (!validation.ok) {
    return fail(
      'PUBLISH_ARTIFACT_INVALID',
      'Artifact failed validation [' + validation.code + ']: ' + validation.message,
    );
  }

  // ─── Step 2: Extract fields from the validated artifact ─────────────────────

  const artifactHash     = artifact.integrity.artifact_hash;
  const cardId           = artifact.identity.card_id;
  const artifactVersion  = artifact.artifact_version;
  const supersedesHash   = artifact.integrity.supersedes;    // null for first
  const signingKeyId     = artifact.verification.key_id;     // null for unsigned-dev

  // ─── Step 3: Build the EvidencePublication record ───────────────────────────
  //
  // publication_id: "pub_" + random UUID
  //   Opaque record identifier — not derived from content.  Separates record
  //   identity from cryptographic artifact identity (artifact_hash).  In a
  //   production database this would be a ULID or DB-generated surrogate key.
  //
  // publication_fingerprint === artifact_hash  (artifact-level dedup key)
  // operation_fingerprint                      (operation-level idempotency key, optional)

  const publishedAt = clock.now();
  if (typeof publishedAt !== 'string' || !publishedAt) {
    return fail('PUBLISH_CLOCK_INVALID', 'clock.now() must return a non-empty string');
  }

  const recordFields = {
    publication_id:          'pub_' + randomUUID(),
    card_id:                 cardId,
    artifact_version:        artifactVersion,
    artifact_hash:           artifactHash,
    supersedes_hash:         supersedesHash,
    artifact_payload:        deepFreeze(JSON.parse(JSON.stringify(artifact))),
    published_at:            publishedAt,
    signing_key_id:          signingKeyId,
    publication_fingerprint: artifactHash,
  };
  if (operationFingerprint !== undefined) {
    recordFields.operation_fingerprint = operationFingerprint;
  }
  const record = deepFreeze(recordFields);

  // ─── Step 4: CAS commit ─────────────────────────────────────────────────────

  return store.commitPublication(record, testFaultOptions);
}

module.exports = { publishArtifact };
