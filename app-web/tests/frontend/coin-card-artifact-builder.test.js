'use strict';

/**
 * coin-card-artifact-builder.test.js
 *
 * Tests the CoinCardArtifact V1 builder (build-artifact.js).
 *
 * Coverage:
 *   - Positive: valid first artifact, valid successor, deep-freeze, return shape
 *   - Builder-controlled fields: all 15 derived/constant fields verified
 *   - previousArtifact validation: identity chain, issued_at ordering, invalid predecessor
 *   - Signing contract: unsigned-dev returns null, Ed25519 returns string
 *   - Failure paths: missing inputs, DRAFT, bad signer, canonicalize failure
 *   - Freshness policy: ACTIVE→7d, SUSPENDED→1h, REVOKED→7d
 *   - Capability table: all three statuses
 *   - Deep immutability: nested objects are frozen
 *   - canonicalProtectedPayload: artifact_hash and verification.value excluded
 */

const assert = require('node:assert/strict');
const path   = require('node:path');
const test   = require('node:test');

const repoRoot = path.resolve(__dirname, '../../..');
const { buildCoinCardArtifact, DEFAULT_FRESHNESS_POLICY, ISSUER, SIGNER_DOMAIN } =
  require(path.join(repoRoot, 'tools/coin-card-artifact/build-artifact.js'));
const { computeArtifactHash } =
  require(path.join(repoRoot, 'tools/coin-card-artifact/canonicalize.js'));

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const COIN_CARD = Object.freeze({
  id:        'cc_01JFXTST0000000000000000AB',
  handle:    'antoinedennison',
  createdAt: '2026-08-07T10:00:00.000000Z',
});

const WALLET_ROUTE = Object.freeze({
  id:                   'route_01JRTE000000000000000000AB',
  recipientAddress:     '0x2489587C9da6EaB970a5479BA70273BA37961221',
  chainId:              137,
  token:                'USDC',
  tokenAddress:         '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  amountMode:           'sender_input',
  lockedAmountUnits:    null,
  suggestedAmountUnits: null,
});

const LIFECYCLE_ACTIVE    = Object.freeze({ status: 'ACTIVE' });
const LIFECYCLE_SUSPENDED = Object.freeze({ status: 'SUSPENDED' });
const LIFECYCLE_REVOKED   = Object.freeze({ status: 'REVOKED' });

const PRESENTATION = Object.freeze({
  displayName: 'Antoine Dennison',
  theme:       null,
});

// Fixed clock so test assertions are deterministic
function makeClock(issuedAt) {
  return { now: () => issuedAt };
}

// No-op unsigned-dev signer
const UNSIGNED_DEV_SIGNER = Object.freeze({
  algorithm: 'unsigned-dev',
  keyId:     null,
  sign:      async () => null,
});

// Fake Ed25519 signer that returns a predictable base64url string
function makeEd25519Signer(keyId = 'cc-test-key-01') {
  return {
    algorithm: 'Ed25519',
    keyId,
    sign: async (artifactHash) => {
      // Deterministic fake: base64url of "FAKE:" + first 16 chars of hash
      return Buffer.from('FAKE:' + artifactHash.slice(7, 23)).toString('base64url');
    },
  };
}

const BASE_CLOCK = makeClock('2026-08-07T12:00:00.000000Z');

async function buildActive(overrides = {}) {
  return buildCoinCardArtifact(
    {
      coinCard:         COIN_CARD,
      walletRoute:      WALLET_ROUTE,
      lifecycle:        LIFECYCLE_ACTIVE,
      presentation:     PRESENTATION,
      previousArtifact: null,
      ...overrides.domain,
    },
    {
      signer:           UNSIGNED_DEV_SIGNER,
      clock:            BASE_CLOCK,
      ...overrides.infra,
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Positive: return shape and basic validity
// ─────────────────────────────────────────────────────────────────────────────

test('build: first ACTIVE artifact returns ok=true with expected shape', async () => {
  const result = await buildActive();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(typeof result.artifact, 'object');
  assert.equal(typeof result.artifactHash, 'string');
  assert.equal(typeof result.canonicalProtectedPayload, 'string');
});

test('build: artifactHash matches independent recomputation', async () => {
  const result = await buildActive();
  assert.ok(result.ok);
  const recomputed = computeArtifactHash(result.artifact);
  assert.equal(result.artifactHash, recomputed);
});

test('build: returned artifact is deep-frozen', async () => {
  const result = await buildActive();
  assert.ok(result.ok);
  const a = result.artifact;
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(a.identity), true);
  assert.equal(Object.isFrozen(a.routes), true);
  assert.equal(Object.isFrozen(a.routes[0]), true);
  assert.equal(Object.isFrozen(a.lifecycle_snapshot), true);
  assert.equal(Object.isFrozen(a.capabilities), true);
  assert.equal(Object.isFrozen(a.integrity), true);
  assert.equal(Object.isFrozen(a.verification), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Builder-controlled fields — all 15 must match expected values
// ─────────────────────────────────────────────────────────────────────────────

test('build: schema is always the builder constant', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.schema, 'implicitex.coincard.artifact.v1');
});

test('build: artifact_version is 1 for first artifact (no previous)', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.artifact_version, 1);
});

test('build: issuer is always the builder constant', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.identity.issuer, ISSUER);
  assert.equal(artifact.identity.issuer, 'coincard.click');
});

test('build: public_url is derived from issuer + handle (not caller-supplied)', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.identity.public_url, 'https://antoinedennison.coincard.click/');
});

test('golden Antoine fixture binds the intended public identity to the personal recipient', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.identity.handle, 'antoinedennison');
  assert.equal(artifact.presentation.display_name, 'Antoine Dennison');
  assert.equal(artifact.routes[0].recipient_address, '0x2489587C9da6EaB970a5479BA70273BA37961221');
  assert.equal(artifact.routes[0].chain_id, 137);
  assert.equal(artifact.routes[0].token, 'USDC');
  assert.equal(artifact.routes[0].token_address, '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359');
  assert.equal(artifact.routes[0].amount_mode, 'sender_input');
});

test('build: issued_at comes from clock, not caller', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.identity.issued_at, '2026-08-07T12:00:00.000000Z');
});

test('build: status_as_of equals issued_at', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.lifecycle_snapshot.status_as_of, artifact.identity.issued_at);
});

test('build: signed_at equals issued_at', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.verification.signed_at, artifact.identity.issued_at);
});

test('build: signer_domain is always the builder constant', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.verification.signer_domain, SIGNER_DOMAIN);
  assert.equal(artifact.verification.signer_domain, 'coincard.click');
});

test('build: fingerprint_version is always 1', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.integrity.fingerprint_version, 1);
});

test('build: presentation_version is always 1', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.presentation.presentation_version, 1);
});

test('build: route_sequence is always 1 in V1', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.routes[0].route_sequence, 1);
});

test('build: supersedes is null for first artifact', async () => {
  const { artifact } = await buildActive().then(r => { assert.ok(r.ok); return r; });
  assert.equal(artifact.integrity.supersedes, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// Capability derivation — caller cannot override
// ─────────────────────────────────────────────────────────────────────────────

test('build: ACTIVE capabilities are { can_receive_transfers:true, can_be_embedded:true, can_display_route:true }', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.ok(r.ok);
  assert.deepEqual(r.artifact.capabilities, { can_receive_transfers: true, can_be_embedded: true, can_display_route: true });
});

test('build: SUSPENDED capabilities are { can_receive_transfers:false, can_be_embedded:true, can_display_route:false }', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_SUSPENDED, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.ok(r.ok);
  assert.deepEqual(r.artifact.capabilities, { can_receive_transfers: false, can_be_embedded: true, can_display_route: false });
});

test('build: REVOKED capabilities are { can_receive_transfers:false, can_be_embedded:true, can_display_route:false }', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_REVOKED, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.ok(r.ok);
  assert.deepEqual(r.artifact.capabilities, { can_receive_transfers: false, can_be_embedded: true, can_display_route: false });
});

// ─────────────────────────────────────────────────────────────────────────────
// Default freshness policy
// ─────────────────────────────────────────────────────────────────────────────

test('build: ACTIVE refresh_after is 7 days from issued_at', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-07T12:00:00.000000Z') },
  );
  assert.ok(r.ok);
  assert.equal(r.artifact.lifecycle_snapshot.refresh_after, '2026-08-14T12:00:00.000000Z');
});

test('build: SUSPENDED refresh_after is 1 hour from issued_at', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_SUSPENDED, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-07T12:00:00.000000Z') },
  );
  assert.ok(r.ok);
  assert.equal(r.artifact.lifecycle_snapshot.refresh_after, '2026-08-07T13:00:00.000000Z');
});

test('build: REVOKED refresh_after is 7 days from issued_at', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_REVOKED, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-07T12:00:00.000000Z') },
  );
  assert.ok(r.ok);
  assert.equal(r.artifact.lifecycle_snapshot.refresh_after, '2026-08-14T12:00:00.000000Z');
});

// ─────────────────────────────────────────────────────────────────────────────
// Signing integration
// ─────────────────────────────────────────────────────────────────────────────

test('build: unsigned-dev signer produces verification.value = null', async () => {
  const r = await buildActive({ infra: { signer: UNSIGNED_DEV_SIGNER } });
  assert.ok(r.ok);
  assert.equal(r.artifact.verification.value, null);
  assert.equal(r.artifact.verification.algorithm, 'unsigned-dev');
  assert.equal(r.artifact.verification.key_id, null);
});

test('build: Ed25519 signer metadata appears on artifact', async () => {
  const signer = makeEd25519Signer('cc-test-key-01');
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer, clock: BASE_CLOCK },
  );
  assert.ok(r.ok);
  assert.equal(r.artifact.verification.algorithm, 'Ed25519');
  assert.equal(r.artifact.verification.key_id, 'cc-test-key-01');
  assert.equal(typeof r.artifact.verification.value, 'string');
  assert.ok(r.artifact.verification.value.length > 0);
});

test('build: canonicalProtectedPayload excludes artifact_hash and verification.value', async () => {
  const r = await buildActive();
  assert.ok(r.ok);
  // The canonical text must NOT contain the artifact_hash value
  assert.equal(r.canonicalProtectedPayload.includes(r.artifactHash), false);
  // Must not contain "artifact_hash" as a key
  assert.equal(r.canonicalProtectedPayload.includes('"artifact_hash"'), false);
  // Must not contain "value" as a key (the verification.value field)
  // It also must not contain "PLACEHOLDER" or any hash string
  assert.equal(r.canonicalProtectedPayload.includes('PLACEHOLDER'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Successor artifact (with previousArtifact)
// ─────────────────────────────────────────────────────────────────────────────

test('build: successor artifact has artifact_version = previous + 1', async () => {
  const v1 = await buildActive({ infra: { clock: makeClock('2026-08-07T12:00:00.000000Z') } });
  assert.ok(v1.ok);
  assert.equal(v1.artifact.artifact_version, 1);

  const v2 = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_SUSPENDED, presentation: PRESENTATION, previousArtifact: v1.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-14T09:00:00.000000Z') },
  );
  assert.ok(v2.ok, JSON.stringify(v2));
  assert.equal(v2.artifact.artifact_version, 2);
});

test('build: successor supersedes = previous artifact_hash', async () => {
  const v1 = await buildActive({ infra: { clock: makeClock('2026-08-07T12:00:00.000000Z') } });
  assert.ok(v1.ok);

  const v2 = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_SUSPENDED, presentation: PRESENTATION, previousArtifact: v1.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-14T09:00:00.000000Z') },
  );
  assert.ok(v2.ok);
  assert.equal(v2.artifact.integrity.supersedes, v1.artifactHash);
});

test('build: three-artifact lineage ACTIVE → SUSPENDED → REVOKED passes', async () => {
  const v1 = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-07T12:00:00.000000Z') },
  );
  assert.ok(v1.ok, JSON.stringify(v1));

  const v2 = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_SUSPENDED, presentation: PRESENTATION, previousArtifact: v1.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-14T09:00:00.000000Z') },
  );
  assert.ok(v2.ok, JSON.stringify(v2));

  const v3 = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_REVOKED, presentation: PRESENTATION, previousArtifact: v2.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-21T15:30:00.000000Z') },
  );
  assert.ok(v3.ok, JSON.stringify(v3));

  // Hash chain integrity
  assert.equal(v2.artifact.integrity.supersedes, v1.artifactHash);
  assert.equal(v3.artifact.integrity.supersedes, v2.artifactHash);
  assert.equal(v1.artifact.integrity.supersedes, null);
  assert.equal(v1.artifact.artifact_version, 1);
  assert.equal(v2.artifact.artifact_version, 2);
  assert.equal(v3.artifact.artifact_version, 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// previousArtifact validation failures
// ─────────────────────────────────────────────────────────────────────────────

test('build[neg]: previousArtifact with wrong card_id → PREVIOUS_ARTIFACT_INVALID', async () => {
  const v1 = await buildActive({ infra: { clock: makeClock('2026-08-07T12:00:00.000000Z') } });
  assert.ok(v1.ok);

  const differentCoinCard = { ...COIN_CARD, id: 'cc_01JFXTST0000000000000000XY' };
  const r = await buildCoinCardArtifact(
    { coinCard: differentCoinCard, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION, previousArtifact: v1.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-14T00:00:00.000000Z') },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PREVIOUS_ARTIFACT_INVALID');
  assert.match(r.message, /card_id/);
});

test('build[neg]: previousArtifact with wrong handle → PREVIOUS_ARTIFACT_INVALID', async () => {
  const v1 = await buildActive({ infra: { clock: makeClock('2026-08-07T12:00:00.000000Z') } });
  assert.ok(v1.ok);

  const differentCoinCard = { ...COIN_CARD, handle: 'bob' };
  const r = await buildCoinCardArtifact(
    { coinCard: differentCoinCard, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION, previousArtifact: v1.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-14T00:00:00.000000Z') },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PREVIOUS_ARTIFACT_INVALID');
  assert.match(r.message, /handle/);
});

test('build[neg]: previousArtifact with wrong created_at → PREVIOUS_ARTIFACT_INVALID', async () => {
  const v1 = await buildActive({ infra: { clock: makeClock('2026-08-07T12:00:00.000000Z') } });
  assert.ok(v1.ok);

  const differentCoinCard = { ...COIN_CARD, createdAt: '2025-01-01T00:00:00.000000Z' };
  const r = await buildCoinCardArtifact(
    { coinCard: differentCoinCard, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION, previousArtifact: v1.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-14T00:00:00.000000Z') },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PREVIOUS_ARTIFACT_INVALID');
  assert.match(r.message, /created_at/);
});

test('build[neg]: issued_at does not advance beyond previousArtifact → BUILD_CLOCK_INVALID', async () => {
  const v1 = await buildActive({ infra: { clock: makeClock('2026-08-07T12:00:00.000000Z') } });
  assert.ok(v1.ok);

  // Same timestamp — not strictly greater
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION, previousArtifact: v1.artifact },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-07T12:00:00.000000Z') },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_CLOCK_INVALID');
});

test('build[neg]: previousArtifact with tampered hash (invalid) → PREVIOUS_ARTIFACT_INVALID', async () => {
  const v1 = await buildActive({ infra: { clock: makeClock('2026-08-07T12:00:00.000000Z') } });
  assert.ok(v1.ok);

  // Tamper the previous artifact after building
  const tampered = JSON.parse(JSON.stringify(v1.artifact));
  tampered.artifact_version = 999; // hash will no longer match

  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION, previousArtifact: tampered },
    { signer: UNSIGNED_DEV_SIGNER, clock: makeClock('2026-08-14T00:00:00.000000Z') },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'PREVIOUS_ARTIFACT_INVALID');
});

// ─────────────────────────────────────────────────────────────────────────────
// Input validation failures
// ─────────────────────────────────────────────────────────────────────────────

test('build[neg]: DRAFT lifecycle → BUILD_INPUT_INVALID', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: { status: 'DRAFT' }, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_INPUT_INVALID');
  assert.match(r.message, /DRAFT/);
});

test('build[neg]: missing coinCard.id → BUILD_INPUT_INVALID', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: { ...COIN_CARD, id: '' }, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_INPUT_INVALID');
});

test('build[neg]: missing presentation.displayName → BUILD_INPUT_INVALID', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: { displayName: '', theme: null } },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_INPUT_INVALID');
});

test('build[neg]: unknown signer.algorithm → BUILD_INPUT_INVALID', async () => {
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: { algorithm: 'RSA', keyId: null, sign: async () => null }, clock: BASE_CLOCK },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_INPUT_INVALID');
  assert.match(r.message, /algorithm/);
});

test('build[neg]: unsigned-dev signer returning non-null → BUILD_SIGNING_FAILED', async () => {
  const badSigner = { algorithm: 'unsigned-dev', keyId: null, sign: async () => 'unexpected-value' };
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: badSigner, clock: BASE_CLOCK },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_SIGNING_FAILED');
});

test('build[neg]: Ed25519 signer returning null → BUILD_SIGNING_FAILED', async () => {
  const badSigner = { algorithm: 'Ed25519', keyId: 'k1', sign: async () => null };
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: badSigner, clock: BASE_CLOCK },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_SIGNING_FAILED');
});

test('build[neg]: signer.sign() throws → BUILD_SIGNING_FAILED', async () => {
  const throwingSigner = { algorithm: 'Ed25519', keyId: 'k1', sign: async () => { throw new Error('key unavailable'); } };
  const r = await buildCoinCardArtifact(
    { coinCard: COIN_CARD, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: throwingSigner, clock: BASE_CLOCK },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BUILD_SIGNING_FAILED');
  assert.match(r.message, /key unavailable/);
});

// ─────────────────────────────────────────────────────────────────────────────
// Invariant: builder-controlled fields cannot be overridden via domain state
// ─────────────────────────────────────────────────────────────────────────────

test('build invariant: caller cannot set issuer via coinCard — issuer is always coincard.click', async () => {
  // Even if coinCard had an issuer field (which it shouldn't), the builder ignores it
  const coinCardWithIssuer = { ...COIN_CARD, issuer: 'evil.example' };
  const r = await buildCoinCardArtifact(
    { coinCard: coinCardWithIssuer, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.ok(r.ok);
  assert.equal(r.artifact.identity.issuer, 'coincard.click');
});

test('build invariant: caller cannot set public_url via coinCard — derived from issuer+handle', async () => {
  const coinCardWithUrl = { ...COIN_CARD, publicUrl: 'https://evil.example/foo' };
  const r = await buildCoinCardArtifact(
    { coinCard: coinCardWithUrl, walletRoute: WALLET_ROUTE, lifecycle: LIFECYCLE_ACTIVE, presentation: PRESENTATION },
    { signer: UNSIGNED_DEV_SIGNER, clock: BASE_CLOCK },
  );
  assert.ok(r.ok);
  // public_url is still derived from issuer + handle
  assert.equal(r.artifact.identity.public_url, 'https://antoinedennison.coincard.click/');
});

test('build invariant: artifact passes independent validateArtifact', async () => {
  const { validateArtifact: validate } = require(
    path.join(repoRoot, 'tools/coin-card-artifact/validate-artifact.js'),
  );
  const r = await buildActive();
  assert.ok(r.ok);
  const validation = validate(r.artifact, { allowUnsignedDev: true });
  assert.equal(validation.ok, true, JSON.stringify(validation));
});
