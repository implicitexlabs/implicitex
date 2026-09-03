'use strict';

/**
 * validate-lineage.js
 *
 * Lineage validator for an ordered sequence of CoinCardArtifact V1 documents.
 *
 * Precondition: each artifact in the sequence has already passed both layers of
 * validateArtifact(). The lineage validator adds cross-artifact invariants.
 *
 * A valid lineage satisfies:
 *   - card_id, handle, created_at, and issuer are identical across all versions.
 *   - artifact_version is strictly increasing (each version = previous + 1).
 *   - issued_at is strictly increasing (timestamps advance monotonically).
 *   - artifacts[n].integrity.supersedes === artifacts[n-1].integrity.artifact_hash.
 *   - artifacts[0].integrity.supersedes === null.
 *   - No artifact supersedes itself (self-cycle).
 *   - No two artifacts share the same artifact_hash (hash uniqueness).
 *
 * API:
 *   validateLineage(artifacts)
 *     artifacts: Array of CoinCardArtifact objects, ordered from oldest to newest.
 *     → { ok: true }
 *     → { ok: false, code, message }
 *
 *   LINEAGE_ERROR_CODES
 */

const LINEAGE_ERROR_CODES = Object.freeze({
  LINEAGE_IDENTITY_MISMATCH: 'LINEAGE_IDENTITY_MISMATCH',
  SUPERSESSION_MISMATCH:     'SUPERSESSION_MISMATCH',
});

function validateLineage(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return fail(LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH, 'Lineage must be a non-empty array of artifacts');
  }

  // Single-artifact lineage is trivially valid from a lineage perspective.
  if (artifacts.length === 1) {
    if (artifacts[0].integrity.supersedes !== null) {
      return fail(
        LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH,
        'A single-artifact lineage must have supersedes=null',
      );
    }
    return { ok: true };
  }

  // Anchor identity from the first artifact.
  const anchor = artifacts[0];
  const anchorCardId    = anchor.identity.card_id;
  const anchorHandle    = anchor.identity.handle;
  const anchorCreatedAt = anchor.identity.created_at;
  const anchorIssuer    = anchor.identity.issuer;

  // First artifact must have supersedes=null.
  if (anchor.integrity.supersedes !== null) {
    return fail(
      LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH,
      'artifacts[0].integrity.supersedes must be null; got: ' + anchor.integrity.supersedes,
    );
  }

  // Track seen hashes to detect cycles.
  const seenHashes = new Set([anchor.integrity.artifact_hash]);

  for (let i = 1; i < artifacts.length; i++) {
    const prev = artifacts[i - 1];
    const curr = artifacts[i];

    // --- Identity stability ---
    if (curr.identity.card_id !== anchorCardId) {
      return fail(
        LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH,
        'artifacts[' + i + '].identity.card_id changed within lineage. Expected: ' +
        anchorCardId + ' Got: ' + curr.identity.card_id,
      );
    }
    if (curr.identity.handle !== anchorHandle) {
      return fail(
        LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH,
        'artifacts[' + i + '].identity.handle changed within lineage. Expected: ' +
        anchorHandle + ' Got: ' + curr.identity.handle,
      );
    }
    if (curr.identity.created_at !== anchorCreatedAt) {
      return fail(
        LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH,
        'artifacts[' + i + '].identity.created_at changed within lineage. Expected: ' +
        anchorCreatedAt + ' Got: ' + curr.identity.created_at,
      );
    }
    if (curr.identity.issuer !== anchorIssuer) {
      return fail(
        LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH,
        'artifacts[' + i + '].identity.issuer changed within lineage. Expected: ' +
        anchorIssuer + ' Got: ' + curr.identity.issuer,
      );
    }

    // --- artifact_version strictly increasing ---
    if (curr.artifact_version !== prev.artifact_version + 1) {
      return fail(
        LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH,
        'artifacts[' + i + '].artifact_version is not prev + 1. Expected: ' +
        (prev.artifact_version + 1) + ' Got: ' + curr.artifact_version,
      );
    }

    // --- issued_at strictly increasing ---
    if (curr.identity.issued_at <= prev.identity.issued_at) {
      return fail(
        LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH,
        'artifacts[' + i + '].identity.issued_at does not advance. Prev: ' +
        prev.identity.issued_at + ' Curr: ' + curr.identity.issued_at,
      );
    }

    // --- Hash chain: curr.supersedes === prev.artifact_hash ---
    if (curr.integrity.supersedes !== prev.integrity.artifact_hash) {
      return fail(
        LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH,
        'artifacts[' + i + '].integrity.supersedes does not match artifacts[' + (i - 1) +
        '].integrity.artifact_hash. Expected: ' + prev.integrity.artifact_hash +
        ' Got: ' + curr.integrity.supersedes,
      );
    }

    // --- Self-supersession: artifact cannot supersede itself ---
    if (curr.integrity.supersedes === curr.integrity.artifact_hash) {
      return fail(
        LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH,
        'artifacts[' + i + '] supersedes itself (artifact_hash equals supersedes)',
      );
    }

    // --- Hash uniqueness: detect duplicate hashes (cycle indicator) ---
    if (seenHashes.has(curr.integrity.artifact_hash)) {
      return fail(
        LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH,
        'Duplicate artifact_hash detected at index ' + i + ': ' + curr.integrity.artifact_hash +
        '. This indicates a supersession cycle.',
      );
    }
    seenHashes.add(curr.integrity.artifact_hash);
  }

  return { ok: true };
}

function fail(code, message) {
  return { ok: false, code, message };
}

module.exports = { validateLineage, LINEAGE_ERROR_CODES };
