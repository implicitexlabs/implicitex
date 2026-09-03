'use strict';

/**
 * publication-operation-fingerprint.js — operation-level idempotency key
 *
 * Computes a deterministic SHA-256 fingerprint that identifies the logical
 * intent of a Coin Card publication operation independently of when it runs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO DISTINCT IDEMPOTENCY CONCEPTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   operation_fingerprint — idempotency of intent
 *     Same business state + same predecessor → same fingerprint, always.
 *     Survives lost HTTP responses and clock-shifted retries.
 *
 *   artifact_hash         — identity of artifact
 *     Same protected payload → same hash.  Depends on issued_at; a retry
 *     that runs the builder again at a different clock produces a different
 *     artifact_hash even though it is the same logical operation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THE FINGERPRINT CAPTURES
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   INCLUDED  (describes the logical operation):
 *     fingerprint_version   protocol version — change this to invalidate all
 *                           cached fingerprints when the algorithm changes
 *     card_id               which card
 *     predecessor_hash      position in the chain (null = first publication)
 *     wallet_route_id       which wallet route was active
 *     lifecycle_status      what lifecycle state was published
 *     display_name          presentation display name at publish time
 *     theme                 presentation theme at publish time
 *
 *   EXCLUDED  (describes this execution of the operation, not its intent):
 *     issued_at, signed_at  time-varying — differ across retries
 *     artifact_hash         derived from issued_at — also time-varying
 *     signature             depends on artifact_hash
 *     published_at          clock at store commit time
 *
 * A future extension could include a caller-supplied idempotency token
 * (e.g., a UUID from the event that triggered the publication) as an
 * additional component.  That is not modeled here; the fingerprint is
 * entirely derived from authoritative domain state.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * API
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   computePublicationOperationFingerprint(fields)
 *
 *   fields.cardId                    string   — coinCard.id
 *   fields.predecessorArtifactHash   string | null  — null for first publication
 *   fields.walletRouteId             string   — walletRoute.id
 *   fields.lifecycleStatus           string   — 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
 *   fields.displayName               string   — presentation.displayName
 *   fields.theme                     string | null
 *
 *   Returns: "sha256:<64-hex>"
 *   Throws on non-canonical payload (should not happen with well-typed inputs).
 */

const { createHash } = require('node:crypto');
const path = require('node:path');

const { canonicalizeJson } = require(
  path.resolve(__dirname, '../../app-web/frontend/public/card/coin-card-canonical-json-v1.js'),
);

const OPERATION_FINGERPRINT_VERSION = 1;

function computePublicationOperationFingerprint({
  cardId,
  predecessorArtifactHash,
  walletRouteId,
  lifecycleStatus,
  displayName,
  theme,
}) {
  // Keys sorted alphabetically — canonicalizeJson enforces this too, but
  // listing them in order here makes the schema self-documenting.
  const payload = {
    card_id:             cardId,
    display_name:        displayName,
    fingerprint_version: OPERATION_FINGERPRINT_VERSION,
    lifecycle_status:    lifecycleStatus,
    predecessor_hash:    predecessorArtifactHash,
    theme:               theme,
    wallet_route_id:     walletRouteId,
  };

  const canonical = canonicalizeJson(payload);
  if (canonical === null) {
    throw new Error(
      'computePublicationOperationFingerprint: canonicalization returned null — ' +
      'check that all field values are canonical (no undefined, no non-NFC strings)',
    );
  }

  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

module.exports = { computePublicationOperationFingerprint, OPERATION_FINGERPRINT_VERSION };
