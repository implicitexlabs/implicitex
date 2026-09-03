'use strict';

/**
 * coin-card-artifact-validation.test.js
 *
 * Validates CoinCardArtifact V1 against all three validation layers:
 *
 *   Layer 1 — Structural  (JSON Schema Draft-07)
 *   Layer 2 — Semantic    (Coin Card invariants)
 *   Layer 3 — Lineage     (cross-artifact chain invariants)
 *
 * Positive corpus: coin-card.artifact.fixtures.v1.json (three-artifact lineage)
 * Negative corpus: coin-card.artifact.negative-corpus.v1.json
 *
 * All tests use stable machine-readable error codes. Expected codes are derived
 * from the negative corpus; the test must not depend on human-readable messages.
 */

const assert = require('node:assert/strict');
const test   = require('node:test');
const path   = require('node:path');

const repoRoot = path.resolve(__dirname, '../../..');

const { validateArtifact, validateArtifactStructure, validateArtifactSemantics, ERROR_CODES } =
  require(path.join(repoRoot, 'tools/coin-card-artifact/validate-artifact.js'));
const { validateLineage, LINEAGE_ERROR_CODES } =
  require(path.join(repoRoot, 'tools/coin-card-artifact/validate-lineage.js'));
const { computeArtifactHash } =
  require(path.join(repoRoot, 'tools/coin-card-artifact/canonicalize.js'));

const positiveFixtures = require(
  path.join(repoRoot, 'docs/product/coin-card/coin-card.artifact.fixtures.v1.json')
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

/** Build a structurally valid ACTIVE artifact with a freshly computed hash. */
function makeValidActive(overrides = {}) {
  const base = clone(positiveFixtures.fixtures[0].artifact);  // V1 ACTIVE
  // Apply overrides at the top level.
  Object.assign(base, overrides);
  // Recompute hash after any override (caller responsible for overriding
  // deeper fields before calling this, then recomputing themselves if needed).
  base.integrity.artifact_hash = computeArtifactHash(base);
  return base;
}

/** Build a structurally valid SUSPENDED artifact (V2) with a freshly computed hash. */
function makeValidSuspended() {
  const base = clone(positiveFixtures.fixtures[1].artifact);  // V2 SUSPENDED
  return base;  // already has correct hash from generator
}

/** Build a structurally valid REVOKED artifact (V3) with a freshly computed hash. */
function makeValidRevoked() {
  const base = clone(positiveFixtures.fixtures[2].artifact);  // V3 REVOKED
  return base;
}

// ---------------------------------------------------------------------------
// POSITIVE: Structural validation — all three fixtures must pass Layer 1
// ---------------------------------------------------------------------------

test('structural: V1 ACTIVE passes schema validation', () => {
  const result = validateArtifactStructure(positiveFixtures.fixtures[0].artifact);
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

test('structural: V2 SUSPENDED passes schema validation', () => {
  const result = validateArtifactStructure(positiveFixtures.fixtures[1].artifact);
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

test('structural: V3 REVOKED passes schema validation', () => {
  const result = validateArtifactStructure(positiveFixtures.fixtures[2].artifact);
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

// ---------------------------------------------------------------------------
// POSITIVE: Semantic validation — all three fixtures pass Layer 2
// ---------------------------------------------------------------------------

test('semantic: V1 ACTIVE passes all semantic checks (unsigned-dev allowed)', () => {
  const result = validateArtifactSemantics(positiveFixtures.fixtures[0].artifact, { allowUnsignedDev: true });
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

test('semantic: V2 SUSPENDED passes all semantic checks (unsigned-dev allowed)', () => {
  const result = validateArtifactSemantics(positiveFixtures.fixtures[1].artifact, { allowUnsignedDev: true });
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

test('semantic: V3 REVOKED passes all semantic checks (unsigned-dev allowed)', () => {
  const result = validateArtifactSemantics(positiveFixtures.fixtures[2].artifact, { allowUnsignedDev: true });
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

// ---------------------------------------------------------------------------
// POSITIVE: Lineage validation — the three-artifact chain must pass Layer 3
// ---------------------------------------------------------------------------

test('lineage: ACTIVE → SUSPENDED → REVOKED lineage passes', () => {
  const artifacts = positiveFixtures.fixtures.map(f => f.artifact);
  const result = validateLineage(artifacts);
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

test('lineage: single-artifact lineage with supersedes=null passes', () => {
  const result = validateLineage([positiveFixtures.fixtures[0].artifact]);
  assert.equal(result.ok, true, 'Expected ok:true, got: ' + JSON.stringify(result));
});

// ---------------------------------------------------------------------------
// POSITIVE: Hash reproducibility — regenerate and compare
// ---------------------------------------------------------------------------

test('hash: V1 artifact_hash is reproducible', () => {
  const a = positiveFixtures.fixtures[0].artifact;
  assert.equal(computeArtifactHash(a), a.integrity.artifact_hash);
});

test('hash: V2 artifact_hash is reproducible', () => {
  const a = positiveFixtures.fixtures[1].artifact;
  assert.equal(computeArtifactHash(a), a.integrity.artifact_hash);
});

test('hash: V3 artifact_hash is reproducible', () => {
  const a = positiveFixtures.fixtures[2].artifact;
  assert.equal(computeArtifactHash(a), a.integrity.artifact_hash);
});

// ---------------------------------------------------------------------------
// POSITIVE: Chain integrity — verify supersedes pointer values
// ---------------------------------------------------------------------------

test('chain: V1.supersedes is null', () => {
  assert.equal(positiveFixtures.fixtures[0].artifact.integrity.supersedes, null);
});

test('chain: V2.supersedes equals V1.artifact_hash', () => {
  const v1hash = positiveFixtures.fixtures[0].artifact.integrity.artifact_hash;
  const v2supersedes = positiveFixtures.fixtures[1].artifact.integrity.supersedes;
  assert.equal(v2supersedes, v1hash);
});

test('chain: V3.supersedes equals V2.artifact_hash', () => {
  const v2hash = positiveFixtures.fixtures[1].artifact.integrity.artifact_hash;
  const v3supersedes = positiveFixtures.fixtures[2].artifact.integrity.supersedes;
  assert.equal(v3supersedes, v2hash);
});

// ---------------------------------------------------------------------------
// POSITIVE: Identity stability across lineage
// ---------------------------------------------------------------------------

test('lineage: card_id is identical across all three versions', () => {
  const ids = positiveFixtures.fixtures.map(f => f.artifact.identity.card_id);
  assert.equal(ids[0], ids[1]);
  assert.equal(ids[1], ids[2]);
});

test('lineage: created_at is identical across all three versions', () => {
  const ts = positiveFixtures.fixtures.map(f => f.artifact.identity.created_at);
  assert.equal(ts[0], ts[1]);
  assert.equal(ts[1], ts[2]);
});

test('lineage: route_id is identical across all three versions', () => {
  const rids = positiveFixtures.fixtures.map(f => f.artifact.routes[0].route_id);
  assert.equal(rids[0], rids[1]);
  assert.equal(rids[1], rids[2]);
});

test('lineage: artifact_version increases strictly', () => {
  const versions = positiveFixtures.fixtures.map(f => f.artifact.artifact_version);
  assert.equal(versions[0], 1);
  assert.equal(versions[1], 2);
  assert.equal(versions[2], 3);
});

// ---------------------------------------------------------------------------
// NEGATIVE: Structural failures (Layer 1)
// ---------------------------------------------------------------------------

test('structural[neg]: wrong card_id prefix "card_" → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.identity.card_id = 'card_01JFXTST0000000000000000AB';
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: wrong route_id prefix "r_" → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.routes[0].route_id = 'r_01JRTE00000000000000000AB';
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: card_id contains excluded ULID character "I" → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.identity.card_id = 'cc_01IFXTST0000000000000000AB';
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: card_id contains excluded ULID character "O" → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.identity.card_id = 'cc_01OFXTST0000000000000000AB';
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: missing identity block → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  delete a.identity;
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: unknown top-level property → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.metadata = { source: 'injected' };
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: zero routes → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.routes = [];
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: two routes in V1 → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.routes.push(clone(a.routes[0]));
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: invalid lifecycle enum "INACTIVE" → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.lifecycle_snapshot.card_status_at_issue = 'INACTIVE';
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: negative artifact_version → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.artifact_version = -1;
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

test('structural[neg]: artifact_version as string "1" → SCHEMA_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.artifact_version = '1';
  const result = validateArtifactStructure(a);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.SCHEMA_INVALID);
});

// ---------------------------------------------------------------------------
// NEGATIVE: Semantic failures (Layer 2)
// ---------------------------------------------------------------------------

test('semantic[neg]: issued_at != status_as_of → TIMESTAMP_INCONSISTENT', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.lifecycle_snapshot.status_as_of = '2026-08-07T13:00:00.000000Z';
  // Recompute hash so the artifact is structurally + hash valid; only timestamp check should fail.
  a.integrity.artifact_hash = computeArtifactHash(a);
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.TIMESTAMP_INCONSISTENT);
});

test('semantic[neg]: issued_at != signed_at → TIMESTAMP_INCONSISTENT', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.verification.signed_at = '2026-08-07T11:59:00.000000Z';
  a.integrity.artifact_hash = computeArtifactHash(a);
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.TIMESTAMP_INCONSISTENT);
});

test('semantic[neg]: stale artifact_hash (all-zero) → ARTIFACT_HASH_MISMATCH', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.integrity.artifact_hash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ARTIFACT_HASH_MISMATCH);
});

test('semantic[neg]: schema tampered after hash → ARTIFACT_HASH_MISMATCH', () => {
  // Use the V1 fixture hash but alter the schema field to simulate tampering.
  const a = clone(positiveFixtures.fixtures[0].artifact);
  // Deliberately keep the original hash (stale) while changing the schema.
  const originalHash = a.integrity.artifact_hash;
  a.schema = 'implicitex.coincard.artifact.v99';
  // Do NOT recompute hash — that's the tampered state.
  assert.equal(a.integrity.artifact_hash, originalHash);  // paranoia: hash was not changed
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ARTIFACT_HASH_MISMATCH);
});

test('semantic[neg]: artifact_version tampered after hash → ARTIFACT_HASH_MISMATCH', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.artifact_version = 99;
  // Hash not recomputed — tampered state.
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ARTIFACT_HASH_MISMATCH);
});

test('semantic[neg]: recipient_address tampered after hash → ARTIFACT_HASH_MISMATCH', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  // Different valid EIP-55 address, but hash not updated.
  a.routes[0].recipient_address = '0x5466B7cBBf59fFac0a9BEA2d2Dc88A9e3b7bc49';
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ARTIFACT_HASH_MISMATCH);
});

test('semantic[neg]: verification.algorithm tampered after hash → ARTIFACT_HASH_MISMATCH', () => {
  // algorithm is integrity-protected (part of hash input).
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.verification.algorithm = 'Ed25519';
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ARTIFACT_HASH_MISMATCH);
});

test('semantic[neg]: verification.signer_domain tampered after hash → ARTIFACT_HASH_MISMATCH', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.verification.signer_domain = 'attacker.example';
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ARTIFACT_HASH_MISMATCH);
});

test('semantic[neg]: all-lowercase recipient_address fails EIP-55 checksum → ADDRESS_INVALID', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  // Replace with lowercase version of the same address, then recompute hash.
  a.routes[0].recipient_address = '0xa7ce4232811021d2dd01f4f0f264df2427ab3919';
  a.integrity.artifact_hash = computeArtifactHash(a);  // fresh hash for this artifact
  // timestamps must match for timestamp check to pass
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ADDRESS_INVALID, 'Lowercase address should fail EIP-55 check');
});

test('semantic[neg]: amount_mode=locked with locked_amount_units=null → ROUTE_CONSTRAINT_VIOLATED', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.routes[0].amount_mode = 'locked';
  a.routes[0].locked_amount_units = null;
  a.routes[0].suggested_amount_units = null;
  a.integrity.artifact_hash = computeArtifactHash(a);
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ROUTE_CONSTRAINT_VIOLATED);
});

test('semantic[neg]: amount_mode=sender_input with locked_amount_units set → ROUTE_CONSTRAINT_VIOLATED', () => {
  const a = clone(positiveFixtures.fixtures[0].artifact);
  a.routes[0].amount_mode = 'sender_input';
  a.routes[0].locked_amount_units = 1000000;
  a.integrity.artifact_hash = computeArtifactHash(a);
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.ROUTE_CONSTRAINT_VIOLATED);
});

test('semantic[neg]: REVOKED + can_receive_transfers=true → CAPABILITY_INCONSISTENT', () => {
  const a = clone(positiveFixtures.fixtures[2].artifact);  // V3 REVOKED
  a.capabilities.can_receive_transfers = true;
  a.integrity.artifact_hash = computeArtifactHash(a);
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.CAPABILITY_INCONSISTENT);
});

test('semantic[neg]: SUSPENDED + can_display_route=true → CAPABILITY_INCONSISTENT', () => {
  const a = clone(positiveFixtures.fixtures[1].artifact);  // V2 SUSPENDED
  a.capabilities.can_display_route = true;
  a.integrity.artifact_hash = computeArtifactHash(a);
  const result = validateArtifactSemantics(a, { allowUnsignedDev: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.CAPABILITY_INCONSISTENT);
});

test('semantic[neg]: unsigned-dev in execution context (default options) → UNSIGNED_DEV_FORBIDDEN', () => {
  // Pass the canonical V1 ACTIVE artifact — structurally and semantically valid —
  // but through validateArtifact() without allowUnsignedDev:true (the default).
  const result = validateArtifact(positiveFixtures.fixtures[0].artifact);  // no options
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.UNSIGNED_DEV_FORBIDDEN);
});

test('semantic[neg]: unsigned-dev rejected even for ACTIVE card with valid hash', () => {
  // Confirm the execution-context check is unconditional, not conditional on status.
  const a = clone(positiveFixtures.fixtures[0].artifact);
  // Hash is already valid.
  const structural = validateArtifactStructure(a);
  assert.equal(structural.ok, true);  // structurally valid
  const result = validateArtifactSemantics(a /* default options — no allowUnsignedDev */);
  assert.equal(result.ok, false);
  assert.equal(result.code, ERROR_CODES.UNSIGNED_DEV_FORBIDDEN);
});

// ---------------------------------------------------------------------------
// NEGATIVE: Lineage failures (Layer 3)
// ---------------------------------------------------------------------------

test('lineage[neg]: V2.supersedes != V1.artifact_hash → SUPERSESSION_MISMATCH', () => {
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  const v2 = clone(positiveFixtures.fixtures[1].artifact);
  v2.integrity.supersedes = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const result = validateLineage([v1, v2]);
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH);
});

test('lineage[neg]: artifact_version does not increase → LINEAGE_IDENTITY_MISMATCH', () => {
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  const v2 = clone(positiveFixtures.fixtures[1].artifact);
  v2.artifact_version = 1;  // same as v1 — no increment
  const result = validateLineage([v1, v2]);
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH);
});

test('lineage[neg]: issued_at moves backward → LINEAGE_IDENTITY_MISMATCH', () => {
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  const v2 = clone(positiveFixtures.fixtures[1].artifact);
  v2.identity.issued_at = '2026-08-06T00:00:00.000000Z';  // before V1
  v2.lifecycle_snapshot.status_as_of = '2026-08-06T00:00:00.000000Z';
  v2.verification.signed_at = '2026-08-06T00:00:00.000000Z';
  const result = validateLineage([v1, v2]);
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH);
});

test('lineage[neg]: created_at changes between versions → LINEAGE_IDENTITY_MISMATCH', () => {
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  const v2 = clone(positiveFixtures.fixtures[1].artifact);
  v2.identity.created_at = '2025-01-01T00:00:00.000000Z';  // different
  const result = validateLineage([v1, v2]);
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH);
});

test('lineage[neg]: card_id changes within lineage → LINEAGE_IDENTITY_MISMATCH', () => {
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  const v2 = clone(positiveFixtures.fixtures[1].artifact);
  v2.identity.card_id = 'cc_01JFXTST0000000000000000CD';
  const result = validateLineage([v1, v2]);
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH);
});

test('lineage[neg]: handle changes within lineage → LINEAGE_IDENTITY_MISMATCH', () => {
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  const v2 = clone(positiveFixtures.fixtures[1].artifact);
  v2.identity.handle = 'differenthandle';
  const result = validateLineage([v1, v2]);
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.LINEAGE_IDENTITY_MISMATCH);
});

test('lineage[neg]: artifact claims to supersede itself → SUPERSESSION_MISMATCH', () => {
  // Construct an artifact that lists its own hash as supersedes.
  // We can test this by making a single-artifact lineage where supersedes != null.
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  v1.integrity.supersedes = v1.integrity.artifact_hash;  // self-reference
  const result = validateLineage([v1]);
  // Single-artifact lineage with non-null supersedes triggers SUPERSESSION_MISMATCH.
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH);
});

test('lineage[neg]: first artifact has supersedes != null → SUPERSESSION_MISMATCH', () => {
  const v1 = clone(positiveFixtures.fixtures[0].artifact);
  v1.integrity.supersedes = 'sha256:abcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcdabcd';
  const result = validateLineage([v1]);
  assert.equal(result.ok, false);
  assert.equal(result.code, LINEAGE_ERROR_CODES.SUPERSESSION_MISMATCH);
});
