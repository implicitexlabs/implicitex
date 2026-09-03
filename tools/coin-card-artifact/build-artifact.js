'use strict';

/**
 * build-artifact.js — CoinCardArtifact V1 builder
 *
 * Accepts authoritative Coin Card domain state (left argument) and trusted
 * issuer infrastructure (right argument); produces a complete, validated,
 * deep-frozen CoinCardArtifact V1 via a clean pipeline with no placeholder
 * states and no validation circles.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CALLER AUTHORITY BOUNDARY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The caller SUPPLIES (left side / domain state):
 *   coinCard.id, coinCard.handle, coinCard.createdAt
 *   walletRoute.id, .recipientAddress, .chainId, .token, .tokenAddress,
 *               .amountMode, .lockedAmountUnits, .suggestedAmountUnits
 *   lifecycle.status    (ACTIVE | SUSPENDED | REVOKED — not DRAFT)
 *   presentation.displayName, .theme
 *   previousArtifact    (null for first version, validated CoinCardArtifact for successors)
 *
 * The caller SUPPLIES (right side / trusted infrastructure):
 *   signer.algorithm, signer.keyId, signer.sign()
 *   clock.now()
 *   freshnessPolicy.computeRefreshAfter()  (optional — defaults provided)
 *
 * The caller is FORBIDDEN to supply:
 *   schema, artifact_version, issuer, public_url
 *   issued_at, status_as_of, signed_at
 *   refresh_after, capabilities
 *   fingerprint_version, artifact_hash, supersedes
 *   verification.algorithm, verification.key_id,
 *   verification.signer_domain, verification.value
 *
 * Those fields arise from authoritative domain records or trusted issuer
 * infrastructure.  The builder owns the mapping; a caller cannot construct a
 * CoinCardArtifact directly without passing through this trust boundary.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SIGNING CONVENTION — frozen
 * ─────────────────────────────────────────────────────────────────────────
 *
 * For algorithm "Ed25519":
 *   signature_input  = UTF-8 bytes of artifact_hash
 *                    = UTF-8("sha256:" + lowercase_hex_sha256)
 *   verification.value = base64url-unpadded(Ed25519Sign(private_key, signature_input))
 *
 * For algorithm "unsigned-dev":
 *   signer.sign() MUST return null.
 *   verification.value = null.
 *   The resulting artifact is valid but will be rejected by any execution
 *   context (UNSIGNED_DEV_FORBIDDEN).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * BUILD PIPELINE (10 steps)
 * ─────────────────────────────────────────────────────────────────────────
 *
 *  1. Validate domain source inputs.
 *  2. Validate previousArtifact (if present): full two-layer validation,
 *     identity chain match, issued_at ordering.
 *  3. Derive all builder-controlled fields.
 *  4. Construct the protected payload (all fields except artifact_hash and
 *     verification.value).
 *  5. Canonicalize the protected payload.
 *  6. Compute artifact_hash = 'sha256:' + SHA-256(canonical_bytes).
 *  7. Call signer.sign(artifact_hash) → signature value.
 *  8. Construct the complete CoinCardArtifact.
 *  9. Run full structural + semantic validateArtifact() (allowUnsignedDev).
 * 10. Deep-freeze and return the publication object.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RETURN VALUE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * On success:
 *   { ok: true, artifact, artifactHash, canonicalProtectedPayload }
 *
 *   artifact                  — deep-frozen CoinCardArtifact V1
 *   artifactHash              — "sha256:<64-hex>" — for chaining (next supersedes)
 *   canonicalProtectedPayload — canonical JSON string that was hashed (audit log)
 *
 * On failure:
 *   { ok: false, code, message }
 */

const { createHash } = require('node:crypto');
const path = require('node:path');

const { canonicalizeJson } = require(
  path.resolve(__dirname, '../../app-web/frontend/public/card/coin-card-canonical-json-v1.js'),
);
const { validateArtifact } = require('./validate-artifact.js');

// ─────────────────────────────────────────────────────────────────────────────
// Builder-controlled constants (V1)
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA               = 'implicitex.coincard.artifact.v1';
const ISSUER               = 'coincard.click';
const SIGNER_DOMAIN        = 'coincard.click';
const FINGERPRINT_VERSION  = 1;
const PRESENTATION_VERSION = 1;
const ROUTE_SEQUENCE_V1    = 1; // V1 always has exactly one route

// ─────────────────────────────────────────────────────────────────────────────
// Capability derivation table (caller cannot override)
// ─────────────────────────────────────────────────────────────────────────────

const CAPABILITY_TABLE = Object.freeze({
  ACTIVE:    Object.freeze({ can_receive_transfers: true,  can_be_embedded: true, can_display_route: true  }),
  SUSPENDED: Object.freeze({ can_receive_transfers: false, can_be_embedded: true, can_display_route: false }),
  REVOKED:   Object.freeze({ can_receive_transfers: false, can_be_embedded: true, can_display_route: false }),
});

// ─────────────────────────────────────────────────────────────────────────────
// Default freshness policy
//
// Issuer policy — not lifecycle truth.
// ACTIVE    → re-verify within 7 days  (stable card, low-urgency refresh)
// SUSPENDED → re-verify within 1 hour  (blocked card, fast resolution check)
// REVOKED   → re-verify within 7 days  (terminal state, safe to cache long)
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FRESHNESS_POLICY = Object.freeze({
  computeRefreshAfter({ issuedAt, status }) {
    const d = new Date(issuedAt.replace('.000000Z', 'Z'));
    if (status === 'SUSPENDED') {
      d.setUTCHours(d.getUTCHours() + 1);
    } else {
      d.setUTCDate(d.getUTCDate() + 7);
    }
    return d.toISOString().replace(/\.(\d{3})Z$/, '.000000Z');
  },
});

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
// Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {object} domainState
 *   @param {object} coinCard
 *     @param {string} coinCard.id         — cc_[ULID], permanent identity
 *     @param {string} coinCard.handle     — 3-30 chars, [a-z0-9-]
 *     @param {string} coinCard.createdAt  — ISO 8601 microseconds
 *   @param {object} walletRoute
 *     @param {string}      walletRoute.id
 *     @param {string}      walletRoute.recipientAddress   — EIP-55 checksummed
 *     @param {number}      walletRoute.chainId            — 137 | 80002
 *     @param {string}      walletRoute.token              — e.g. 'USDC'
 *     @param {string}      walletRoute.tokenAddress       — EIP-55 checksummed
 *     @param {string}      walletRoute.amountMode         — 'sender_input' | 'locked'
 *     @param {string|null} walletRoute.lockedAmountUnits
 *     @param {string|null} walletRoute.suggestedAmountUnits
 *   @param {object} lifecycle
 *     @param {string} lifecycle.status — 'ACTIVE' | 'SUSPENDED' | 'REVOKED'
 *   @param {object} presentation
 *     @param {string}      presentation.displayName
 *     @param {string|null} presentation.theme
 *   @param {object|null} [previousArtifact=null]
 *
 * @param {object} issuerInfrastructure
 *   @param {object} signer
 *     @param {string}   signer.algorithm — 'Ed25519' | 'unsigned-dev'
 *     @param {string|null} signer.keyId
 *     @param {Function} signer.sign — async (artifactHashString: string) => string|null
 *       Must return base64url-unpadded signature, or null for unsigned-dev.
 *   @param {object} clock
 *     @param {Function} clock.now — () => string (ISO 8601 with microsecond precision)
 *   @param {object} [freshnessPolicy=DEFAULT_FRESHNESS_POLICY]
 *     @param {Function} freshnessPolicy.computeRefreshAfter
 *
 * @returns {Promise<
 *   | { ok: true, artifact: object, artifactHash: string, canonicalProtectedPayload: string }
 *   | { ok: false, code: string, message: string }
 * >}
 */
async function buildCoinCardArtifact(
  { coinCard, walletRoute, lifecycle, presentation, previousArtifact = null },
  { signer, clock, freshnessPolicy = DEFAULT_FRESHNESS_POLICY },
) {
  // ─── Step 1: Validate domain source inputs ────────────────────────────────

  if (!coinCard || typeof coinCard !== 'object') {
    return fail('BUILD_INPUT_INVALID', 'coinCard is required');
  }
  if (typeof coinCard.id !== 'string' || !coinCard.id) {
    return fail('BUILD_INPUT_INVALID', 'coinCard.id is required');
  }
  if (typeof coinCard.handle !== 'string' || !coinCard.handle) {
    return fail('BUILD_INPUT_INVALID', 'coinCard.handle is required');
  }
  if (typeof coinCard.createdAt !== 'string' || !coinCard.createdAt) {
    return fail('BUILD_INPUT_INVALID', 'coinCard.createdAt is required');
  }

  if (!walletRoute || typeof walletRoute !== 'object') {
    return fail('BUILD_INPUT_INVALID', 'walletRoute is required');
  }
  if (typeof walletRoute.id !== 'string' || !walletRoute.id) {
    return fail('BUILD_INPUT_INVALID', 'walletRoute.id is required');
  }
  if (typeof walletRoute.recipientAddress !== 'string') {
    return fail('BUILD_INPUT_INVALID', 'walletRoute.recipientAddress is required');
  }
  if (typeof walletRoute.chainId !== 'number') {
    return fail('BUILD_INPUT_INVALID', 'walletRoute.chainId must be a number');
  }
  if (typeof walletRoute.token !== 'string' || !walletRoute.token) {
    return fail('BUILD_INPUT_INVALID', 'walletRoute.token is required');
  }
  if (typeof walletRoute.tokenAddress !== 'string') {
    return fail('BUILD_INPUT_INVALID', 'walletRoute.tokenAddress is required');
  }
  if (typeof walletRoute.amountMode !== 'string') {
    return fail('BUILD_INPUT_INVALID', 'walletRoute.amountMode is required');
  }

  if (!lifecycle || typeof lifecycle !== 'object') {
    return fail('BUILD_INPUT_INVALID', 'lifecycle is required');
  }
  if (lifecycle.status === 'DRAFT') {
    return fail('BUILD_INPUT_INVALID', 'DRAFT artifacts cannot be published — lifecycle.status must be ACTIVE, SUSPENDED, or REVOKED');
  }
  if (!Object.prototype.hasOwnProperty.call(CAPABILITY_TABLE, lifecycle.status)) {
    return fail('BUILD_INPUT_INVALID',
      'lifecycle.status must be ACTIVE, SUSPENDED, or REVOKED. Got: ' + lifecycle.status);
  }

  if (!presentation || typeof presentation !== 'object') {
    return fail('BUILD_INPUT_INVALID', 'presentation is required');
  }
  if (typeof presentation.displayName !== 'string' || !presentation.displayName) {
    return fail('BUILD_INPUT_INVALID', 'presentation.displayName is required');
  }

  if (!signer || typeof signer !== 'object') {
    return fail('BUILD_INPUT_INVALID', 'signer is required');
  }
  if (signer.algorithm !== 'Ed25519' && signer.algorithm !== 'unsigned-dev') {
    return fail('BUILD_INPUT_INVALID',
      'signer.algorithm must be "Ed25519" or "unsigned-dev". Got: ' + signer.algorithm);
  }
  if (typeof signer.sign !== 'function') {
    return fail('BUILD_INPUT_INVALID', 'signer.sign must be a function');
  }

  if (!clock || typeof clock.now !== 'function') {
    return fail('BUILD_INPUT_INVALID', 'clock.now must be a function');
  }

  // ─── Step 2: Validate previousArtifact ────────────────────────────────────

  if (previousArtifact !== null) {
    if (typeof previousArtifact !== 'object') {
      return fail('PREVIOUS_ARTIFACT_INVALID', 'previousArtifact must be an object or null');
    }

    const prevValidation = validateArtifact(previousArtifact, { allowUnsignedDev: true });
    if (!prevValidation.ok) {
      return fail('PREVIOUS_ARTIFACT_INVALID',
        'previousArtifact failed validation [' + prevValidation.code + ']: ' + prevValidation.message);
    }

    if (previousArtifact.identity.card_id !== coinCard.id) {
      return fail('PREVIOUS_ARTIFACT_INVALID',
        'previousArtifact.identity.card_id (' + previousArtifact.identity.card_id +
        ') does not match coinCard.id (' + coinCard.id + ')');
    }
    if (previousArtifact.identity.handle !== coinCard.handle) {
      return fail('PREVIOUS_ARTIFACT_INVALID',
        'previousArtifact.identity.handle (' + previousArtifact.identity.handle +
        ') does not match coinCard.handle (' + coinCard.handle + ')');
    }
    if (previousArtifact.identity.created_at !== coinCard.createdAt) {
      return fail('PREVIOUS_ARTIFACT_INVALID',
        'previousArtifact.identity.created_at (' + previousArtifact.identity.created_at +
        ') does not match coinCard.createdAt (' + coinCard.createdAt + ')');
    }
  }

  // ─── Step 3: Derive all builder-controlled fields ─────────────────────────

  const issuedAt = clock.now();

  if (typeof issuedAt !== 'string' || !issuedAt) {
    return fail('BUILD_CLOCK_INVALID', 'clock.now() must return a non-empty string');
  }

  if (previousArtifact !== null && issuedAt <= previousArtifact.identity.issued_at) {
    return fail('BUILD_CLOCK_INVALID',
      'clock.now() (' + issuedAt + ') does not advance beyond previousArtifact.identity.issued_at (' +
      previousArtifact.identity.issued_at + ')');
  }

  const artifactVersion = previousArtifact === null
    ? 1
    : previousArtifact.artifact_version + 1;

  const supersedes = previousArtifact === null
    ? null
    : previousArtifact.integrity.artifact_hash;

  const refreshAfter = freshnessPolicy.computeRefreshAfter({
    issuedAt,
    status: lifecycle.status,
  });

  if (typeof refreshAfter !== 'string' || !refreshAfter) {
    return fail('BUILD_INPUT_INVALID', 'freshnessPolicy.computeRefreshAfter() must return a non-empty string');
  }

  const capabilities = {
    can_receive_transfers: CAPABILITY_TABLE[lifecycle.status].can_receive_transfers,
    can_be_embedded:       CAPABILITY_TABLE[lifecycle.status].can_be_embedded,
    can_display_route:     CAPABILITY_TABLE[lifecycle.status].can_display_route,
  };

  // ─── Step 4: Construct protected payload ──────────────────────────────────
  // All artifact fields except integrity.artifact_hash and verification.value.
  // These two are excluded from the hash input per the schema signing rule.

  const protectedPayload = {
    schema:           SCHEMA,
    artifact_version: artifactVersion,
    identity: {
      card_id:    coinCard.id,
      handle:     coinCard.handle,
      issuer:     ISSUER,
      public_url: 'https://' + coinCard.handle + '.' + ISSUER + '/',
      created_at: coinCard.createdAt,
      issued_at:  issuedAt,
    },
    routes: [{
      route_id:               walletRoute.id,
      route_sequence:         ROUTE_SEQUENCE_V1,
      recipient_address:      walletRoute.recipientAddress,
      chain_id:               walletRoute.chainId,
      token:                  walletRoute.token,
      token_address:          walletRoute.tokenAddress,
      amount_mode:            walletRoute.amountMode,
      locked_amount_units:    walletRoute.lockedAmountUnits    != null ? walletRoute.lockedAmountUnits    : null,
      suggested_amount_units: walletRoute.suggestedAmountUnits != null ? walletRoute.suggestedAmountUnits : null,
    }],
    lifecycle_snapshot: {
      card_status_at_issue: lifecycle.status,
      status_as_of:         issuedAt,
      refresh_after:        refreshAfter,
    },
    presentation: {
      presentation_version: PRESENTATION_VERSION,
      display_name:         presentation.displayName,
      theme:                presentation.theme != null ? presentation.theme : null,
    },
    capabilities,
    integrity: {
      fingerprint_version: FINGERPRINT_VERSION,
      supersedes,
      // artifact_hash OMITTED — added after hashing
    },
    verification: {
      algorithm:     signer.algorithm,
      key_id:        signer.keyId != null ? signer.keyId : null,
      signer_domain: SIGNER_DOMAIN,
      signed_at:     issuedAt,
      // value OMITTED — added after signing
    },
  };

  // ─── Step 5: Canonicalize protected payload ───────────────────────────────

  const canonicalProtectedPayload = canonicalizeJson(protectedPayload);
  if (canonicalProtectedPayload === null) {
    return fail('BUILD_CANONICALIZE_FAILED',
      'Protected payload canonicalization returned null — payload contains non-canonical data');
  }

  // ─── Step 6: Compute artifact_hash ────────────────────────────────────────

  const artifactHash = 'sha256:' +
    createHash('sha256').update(canonicalProtectedPayload, 'utf8').digest('hex');

  // ─── Step 7: Sign artifact_hash ───────────────────────────────────────────
  //
  // Signing convention (frozen):
  //   signature_input = UTF-8(artifact_hash)   e.g. UTF-8("sha256:abcdef...")
  //   verification.value = base64url-unpadded(Ed25519Sign(key, signature_input))
  //
  // The signer receives the artifact_hash string and is responsible for:
  //   1. Encoding it as UTF-8
  //   2. Signing with its private key
  //   3. Returning the base64url-unpadded signature
  //
  // For unsigned-dev: signer.sign() must return null.

  let signatureValue;
  try {
    signatureValue = await signer.sign(artifactHash);
  } catch (err) {
    return fail('BUILD_SIGNING_FAILED', 'signer.sign() threw: ' + String(err));
  }

  if (signer.algorithm === 'unsigned-dev') {
    if (signatureValue !== null) {
      return fail('BUILD_SIGNING_FAILED',
        'unsigned-dev signer.sign() must return null; got: ' + typeof signatureValue);
    }
  } else {
    if (typeof signatureValue !== 'string' || !signatureValue) {
      return fail('BUILD_SIGNING_FAILED',
        'signer.sign() must return a non-empty base64url string for algorithm "' +
        signer.algorithm + '"');
    }
  }

  // ─── Step 8: Construct the complete artifact ──────────────────────────────

  const artifact = JSON.parse(JSON.stringify(protectedPayload));
  artifact.integrity.artifact_hash = artifactHash;
  artifact.verification.value = signatureValue;

  // ─── Step 9: Full structural + semantic validation ────────────────────────
  // allowUnsignedDev: the builder is not an execution context. The execution
  // context (authorization layer) enforces unsigned-dev rejection at runtime.

  const validation = validateArtifact(artifact, { allowUnsignedDev: true });
  if (!validation.ok) {
    return fail('BUILD_VALIDATION_FAILED',
      'Constructed artifact failed validation [' + validation.code + ']: ' + validation.message);
  }

  // ─── Step 10: Deep-freeze and return ──────────────────────────────────────

  return {
    ok: true,
    artifact: deepFreeze(JSON.parse(JSON.stringify(artifact))),
    artifactHash,
    canonicalProtectedPayload,
  };
}

module.exports = {
  buildCoinCardArtifact,
  DEFAULT_FRESHNESS_POLICY,
  ISSUER,
  SIGNER_DOMAIN,
};
