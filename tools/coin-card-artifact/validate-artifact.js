'use strict';

/**
 * validate-artifact.js
 *
 * Two-layer validator for CoinCardArtifact V1.
 *
 * Layer 1 — Structural: JSON Schema Draft-07 via AJV.
 *   Catches wrong types, missing fields, additional properties, enum violations,
 *   ULID pattern mismatches, route count constraints, etc.
 *
 * Layer 2 — Semantic: Coin Card invariants not expressible in Draft-07.
 *   Catches timestamp inconsistency, hash integrity, EIP-55 checksum,
 *   amount_mode / route field consistency, capability / lifecycle consistency,
 *   and unsigned-dev in execution contexts.
 *
 * All errors return a stable machine-readable code from ERROR_CODES.
 *
 * API:
 *   validateArtifact(artifact, options?)
 *     → { ok: true }
 *     → { ok: false, code, message }
 *
 *   validateArtifactStructure(artifact)
 *   validateArtifactSemantics(artifact, options?)
 *   ERROR_CODES
 */

const path = require('node:path');
const Ajv  = require(path.resolve(__dirname, '../../app-web/node_modules/ajv'));
const { ethers } = require(path.resolve(__dirname, '../../app-web/node_modules/ethers'));
const schema = require(path.resolve(__dirname, '../../docs/product/coin-card/coin-card.artifact.schema.v1.json'));
const { computeArtifactHash } = require('./canonicalize.js');

// ---------------------------------------------------------------------------
// Error codes — stable, machine-readable, enumerated at top for easy reference.
// ---------------------------------------------------------------------------
const ERROR_CODES = Object.freeze({
  SCHEMA_INVALID:            'SCHEMA_INVALID',
  ARTIFACT_HASH_MISMATCH:    'ARTIFACT_HASH_MISMATCH',
  TIMESTAMP_INCONSISTENT:    'TIMESTAMP_INCONSISTENT',
  ADDRESS_INVALID:           'ADDRESS_INVALID',
  CAPABILITY_INCONSISTENT:   'CAPABILITY_INCONSISTENT',
  ROUTE_CONSTRAINT_VIOLATED: 'ROUTE_CONSTRAINT_VIOLATED',
  UNSIGNED_DEV_FORBIDDEN:    'UNSIGNED_DEV_FORBIDDEN',
});

// ---------------------------------------------------------------------------
// Layer 1: Structural validation (JSON Schema)
// ---------------------------------------------------------------------------
const ajv = new Ajv({ strict: false, allErrors: false });
const schemaValidator = ajv.compile(schema);

function validateArtifactStructure(artifact) {
  const valid = schemaValidator(artifact);
  if (valid) return { ok: true };
  const err = schemaValidator.errors[0];
  return fail(
    ERROR_CODES.SCHEMA_INVALID,
    'Structural validation failed at ' + (err.instancePath || '/') + ': ' + err.message,
  );
}

// ---------------------------------------------------------------------------
// Layer 2: Semantic validation
// ---------------------------------------------------------------------------

/**
 * Validate a structurally-valid artifact against Coin Card semantic invariants.
 *
 * Options:
 *   allowUnsignedDev {boolean} default false — set true only in development/test contexts.
 *
 * Precondition: artifact has already passed validateArtifactStructure().
 */
function validateArtifactSemantics(artifact, options = {}) {
  const allowUnsignedDev = options.allowUnsignedDev === true;

  // --- Timestamp consistency ---
  // identity.issued_at == lifecycle_snapshot.status_as_of == verification.signed_at
  const issuedAt   = artifact.identity.issued_at;
  const statusAsOf = artifact.lifecycle_snapshot.status_as_of;
  const signedAt   = artifact.verification.signed_at;

  if (issuedAt !== statusAsOf) {
    return fail(
      ERROR_CODES.TIMESTAMP_INCONSISTENT,
      'identity.issued_at (' + issuedAt + ') must equal lifecycle_snapshot.status_as_of (' + statusAsOf + ')',
    );
  }
  if (issuedAt !== signedAt) {
    return fail(
      ERROR_CODES.TIMESTAMP_INCONSISTENT,
      'identity.issued_at (' + issuedAt + ') must equal verification.signed_at (' + signedAt + ')',
    );
  }

  // --- Artifact hash integrity ---
  // Every semantic field except integrity.artifact_hash and verification.value must be covered.
  const recomputed = computeArtifactHash(artifact);
  if (recomputed !== artifact.integrity.artifact_hash) {
    return fail(
      ERROR_CODES.ARTIFACT_HASH_MISMATCH,
      'artifact_hash does not match recomputed hash. Stored: ' + artifact.integrity.artifact_hash +
      ' Recomputed: ' + recomputed,
    );
  }

  // --- EIP-55 address checksum ---
  const route = artifact.routes[0];
  try {
    const checksummed = ethers.getAddress(route.recipient_address);
    if (checksummed !== route.recipient_address) {
      return fail(
        ERROR_CODES.ADDRESS_INVALID,
        'routes[0].recipient_address fails EIP-55 checksum. Expected: ' + checksummed +
        ' Got: ' + route.recipient_address,
      );
    }
  } catch (e) {
    return fail(ERROR_CODES.ADDRESS_INVALID, 'routes[0].recipient_address is not a valid EVM address: ' + e.message);
  }

  // --- Route field consistency: amount_mode vs locked/suggested amounts ---
  if (route.amount_mode === 'locked') {
    if (route.locked_amount_units === null || route.locked_amount_units === undefined) {
      return fail(
        ERROR_CODES.ROUTE_CONSTRAINT_VIOLATED,
        'amount_mode is "locked" but locked_amount_units is null',
      );
    }
    if (route.suggested_amount_units !== null) {
      return fail(
        ERROR_CODES.ROUTE_CONSTRAINT_VIOLATED,
        'amount_mode is "locked" but suggested_amount_units is set (must be null)',
      );
    }
  }
  if (route.amount_mode === 'sender_input') {
    if (route.locked_amount_units !== null) {
      return fail(
        ERROR_CODES.ROUTE_CONSTRAINT_VIOLATED,
        'amount_mode is "sender_input" but locked_amount_units is set (must be null)',
      );
    }
    if (route.suggested_amount_units !== null) {
      return fail(
        ERROR_CODES.ROUTE_CONSTRAINT_VIOLATED,
        'amount_mode is "sender_input" but suggested_amount_units is set (must be null)',
      );
    }
  }
  if (route.amount_mode === 'suggested') {
    if (route.locked_amount_units !== null) {
      return fail(
        ERROR_CODES.ROUTE_CONSTRAINT_VIOLATED,
        'amount_mode is "suggested" but locked_amount_units is set (must be null)',
      );
    }
  }

  // --- Capability / lifecycle consistency ---
  const status = artifact.lifecycle_snapshot.card_status_at_issue;
  const caps   = artifact.capabilities;

  if (status === 'REVOKED' && caps.can_receive_transfers === true) {
    return fail(
      ERROR_CODES.CAPABILITY_INCONSISTENT,
      'REVOKED card cannot have can_receive_transfers=true',
    );
  }
  if (status === 'SUSPENDED' && caps.can_receive_transfers === true) {
    return fail(
      ERROR_CODES.CAPABILITY_INCONSISTENT,
      'SUSPENDED card cannot have can_receive_transfers=true',
    );
  }
  if (status === 'DRAFT' && caps.can_receive_transfers === true) {
    return fail(
      ERROR_CODES.CAPABILITY_INCONSISTENT,
      'DRAFT card cannot have can_receive_transfers=true',
    );
  }
  if (status === 'REVOKED' && caps.can_display_route === true) {
    return fail(
      ERROR_CODES.CAPABILITY_INCONSISTENT,
      'REVOKED card cannot have can_display_route=true',
    );
  }
  if (status === 'SUSPENDED' && caps.can_display_route === true) {
    return fail(
      ERROR_CODES.CAPABILITY_INCONSISTENT,
      'SUSPENDED card cannot have can_display_route=true',
    );
  }

  // --- unsigned-dev is forbidden in execution contexts ---
  if (!allowUnsignedDev && artifact.verification.algorithm === 'unsigned-dev') {
    return fail(
      ERROR_CODES.UNSIGNED_DEV_FORBIDDEN,
      'algorithm "unsigned-dev" is not permitted in this context. ' +
      'Pass options.allowUnsignedDev=true only in development/test environments.',
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Combined entry point
// ---------------------------------------------------------------------------

/**
 * Run both validation layers in sequence.
 * Layer 2 is skipped if Layer 1 fails.
 */
function validateArtifact(artifact, options = {}) {
  const structural = validateArtifactStructure(artifact);
  if (!structural.ok) return structural;
  return validateArtifactSemantics(artifact, options);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fail(code, message) {
  return { ok: false, code, message };
}

module.exports = {
  validateArtifact,
  validateArtifactStructure,
  validateArtifactSemantics,
  ERROR_CODES,
};
