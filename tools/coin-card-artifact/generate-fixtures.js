#!/usr/bin/env node
'use strict';

/**
 * generate-fixtures.js
 *
 * Generates coin-card.artifact.fixtures.v1.json — the canonical three-artifact
 * ACTIVE → SUSPENDED → REVOKED lineage with real computed SHA-256 hashes.
 *
 * Output: docs/product/coin-card/coin-card.artifact.fixtures.v1.json
 *
 * Hash algorithm: SHA-256(coin-card-canonical-json.v1(artifact excluding
 *   integrity.artifact_hash and verification.value))
 *
 * Run: node tools/coin-card-artifact/generate-fixtures.js
 * Verify output matches what is committed — if hashes differ, the artifact
 * definition or the canonicalization algorithm has drifted.
 */

const fs   = require('node:fs');
const path = require('node:path');
const { computeArtifactHash } = require('./canonicalize.js');

const repoRoot  = path.resolve(__dirname, '../..');
const outputPath = path.join(repoRoot, 'docs/product/coin-card/coin-card.artifact.fixtures.v1.json');

// ---------------------------------------------------------------------------
// Shared identity (immutable across all three artifact versions)
// ---------------------------------------------------------------------------
const CARD_ID    = 'cc_01JFXTST0000000000000000AB';
const HANDLE     = 'antoinedennison';
const ISSUER     = 'coincard.click';
const PUBLIC_URL = 'https://antoinedennison.coincard.click/';
const CREATED_AT = '2026-08-07T10:00:00.000000Z';

// ---------------------------------------------------------------------------
// Shared route (unchanged — lifecycle fixtures, not route-change fixtures)
// ---------------------------------------------------------------------------
const route = {
  route_id:               'route_01JRTE000000000000000000AB',
  route_sequence:         1,
  recipient_address:      '0x2489587C9da6EaB970a5479BA70273BA37961221',
  chain_id:               137,
  token:                  'USDC',
  token_address:          '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  amount_mode:            'sender_input',
  locked_amount_units:    null,
  suggested_amount_units: null,
};

function makeArtifact(version, issuedAt, status, capabilities, supersedes) {
  const a = {
    schema:           'implicitex.coincard.artifact.v1',
    artifact_version: version,
    identity: {
      card_id:    CARD_ID,
      handle:     HANDLE,
      issuer:     ISSUER,
      public_url: PUBLIC_URL,
      created_at: CREATED_AT,
      issued_at:  issuedAt,
    },
    routes: [route],
    lifecycle_snapshot: {
      card_status_at_issue: status,
      status_as_of:         issuedAt,
      refresh_after:        addDays(issuedAt, 7),
    },
    presentation: {
      presentation_version: 1,
      display_name:         'Antoine Dennison',
      theme:                null,
    },
    capabilities,
    integrity: {
      fingerprint_version: 1,
      artifact_hash:       'PLACEHOLDER',
      supersedes,
    },
    verification: {
      algorithm:     'unsigned-dev',
      key_id:        null,
      signer_domain: 'coincard.click',
      signed_at:     issuedAt,
      value:         null,
    },
  };
  a.integrity.artifact_hash = computeArtifactHash(a);
  return a;
}

function addDays(isoTimestamp, days) {
  const d = new Date(isoTimestamp.replace('.000000Z', 'Z'));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().replace(/\.(\d{3})Z$/, '.000000Z');
}

// ---------------------------------------------------------------------------
// Build the three-artifact lineage
// ---------------------------------------------------------------------------
const v1 = makeArtifact(
  1,
  '2026-08-07T12:00:00.000000Z',
  'ACTIVE',
  { can_receive_transfers: true,  can_be_embedded: true, can_display_route: true  },
  null,
);

const v2 = makeArtifact(
  2,
  '2026-08-14T09:00:00.000000Z',
  'SUSPENDED',
  { can_receive_transfers: false, can_be_embedded: true, can_display_route: false },
  v1.integrity.artifact_hash,
);

const v3 = makeArtifact(
  3,
  '2026-08-21T15:30:00.000000Z',
  'REVOKED',
  // can_be_embedded remains true: revoked cards render a revoked state, not silence.
  { can_receive_transfers: false, can_be_embedded: true, can_display_route: false },
  v2.integrity.artifact_hash,
);

// ---------------------------------------------------------------------------
// Self-verify before writing
// ---------------------------------------------------------------------------
function verify(artifact, label) {
  const recomputed = computeArtifactHash(artifact);
  if (recomputed !== artifact.integrity.artifact_hash) {
    process.stderr.write(label + ': HASH MISMATCH — aborting\n');
    process.stderr.write('  stored:     ' + artifact.integrity.artifact_hash + '\n');
    process.stderr.write('  recomputed: ' + recomputed + '\n');
    process.exit(1);
  }
  process.stderr.write(label + ': ' + artifact.integrity.artifact_hash + '  OK\n');
}

verify(v1, 'V1 ACTIVE   ');
verify(v2, 'V2 SUSPENDED');
verify(v3, 'V3 REVOKED  ');

if (v2.integrity.supersedes !== v1.integrity.artifact_hash) {
  process.stderr.write('Chain error: V2.supersedes != V1.hash\n'); process.exit(1);
}
if (v3.integrity.supersedes !== v2.integrity.artifact_hash) {
  process.stderr.write('Chain error: V3.supersedes != V2.hash\n'); process.exit(1);
}

// ---------------------------------------------------------------------------
// Emit fixture file
// ---------------------------------------------------------------------------
const fixtures = {
  schema:            'implicitex.coin-card.artifact.fixtures.v1',
  status:            'canonical',
  date:              '2026-08-07',
  artifactSchema:    'docs/product/coin-card/coin-card.artifact.schema.v1.json',
  description:       'Three-artifact lineage for card ' + CARD_ID + '. ACTIVE → SUSPENDED → REVOKED. Same card_id, handle, created_at, and route across all three. Demonstrates immutable identity, historical lifecycle snapshots, monotonically increasing artifact_version, and hash-chain supersession.',
  hashAlgorithm:     'SHA-256(coin-card-canonical-json.v1(artifact excluding integrity.artifact_hash and verification.value))',
  fingerprintVersion: 1,
  fixtures: [
    {
      id:               'lineage-v1-active',
      artifact_version: 1,
      description:      'Version 1. Card is ACTIVE. No prior version; supersedes is null.',
      assert: [
        'schema=implicitex.coincard.artifact.v1',
        'artifact_version=1',
        'card_status_at_issue=ACTIVE',
        'can_receive_transfers=true',
        'can_display_route=true',
        'supersedes=null',
        'artifact_hash_verifiable',
      ],
      artifact: v1,
    },
    {
      id:               'lineage-v2-suspended',
      artifact_version: 2,
      description:      'Version 2. Card is SUSPENDED. Same card_id, handle, route as V1. supersedes points to V1 artifact_hash. All capabilities non-interactive.',
      assert: [
        'card_status_at_issue=SUSPENDED',
        'can_receive_transfers=false',
        'can_display_route=false',
        'can_be_embedded=true',
        'supersedes=v1.artifact_hash',
        'artifact_hash_verifiable',
        'identity.card_id=v1.identity.card_id',
        'identity.handle=v1.identity.handle',
        'identity.created_at=v1.identity.created_at',
        'routes[0].route_id=v1.routes[0].route_id',
      ],
      artifact: v2,
    },
    {
      id:               'lineage-v3-revoked',
      artifact_version: 3,
      description:      'Version 3. Card is REVOKED. Terminal state. supersedes points to V2 artifact_hash. can_be_embedded remains true: revoked cards must render a revoked state, not silently disappear.',
      assert: [
        'card_status_at_issue=REVOKED',
        'can_receive_transfers=false',
        'can_display_route=false',
        'can_be_embedded=true',
        'supersedes=v2.artifact_hash',
        'artifact_hash_verifiable',
        'identity.card_id=v1.identity.card_id',
        'identity.handle=v1.identity.handle',
        'identity.created_at=v1.identity.created_at',
        'routes[0].route_id=v1.routes[0].route_id',
      ],
      artifact: v3,
    },
  ],
};

fs.writeFileSync(outputPath, JSON.stringify(fixtures, null, 2) + '\n', 'utf8');
process.stderr.write('\nWrote: ' + outputPath + '\n');
