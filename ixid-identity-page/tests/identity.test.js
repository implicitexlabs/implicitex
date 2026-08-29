'use strict';
/**
 * IX ID Public Identity Page — v0.1 tests
 *
 * Key invariant under test:
 *   buildDisplayModel() drives display values from API response fields.
 *   It must not re-derive status labels, expiry judgements, or domain
 *   selection logic from status codes or lifecycle constants in this file.
 *
 * Proof technique: sentinel values.
 *   Each test supplies an API response with a unique, non-production label
 *   (e.g., "SENTINEL_LABEL_VERIFIED"). If the display model carries that
 *   sentinel, the rendering is driven by the API. If it substitutes a
 *   hardcoded string, the test fails — exposing a violation of the invariant.
 */

const assert = require('node:assert/strict');
const path = require('node:path');

const { parseIxId, buildDisplayModel, formatVerifiedSince } =
  require(path.join(__dirname, '../public/identity.js'));

// ---------------------------------------------------------------------------
// Test runner (no external framework required)
// ---------------------------------------------------------------------------

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiOk(domainOverrides) {
  return {
    ix_id: 'alice',
    evaluated_at: '2026-08-18T12:00:00Z',
    policy_version: 'v1',
    snapshot_id: null,
    domain: Object.assign({
      status: 'VERIFIED',
      label: 'Official Website Verified',
      subject: 'alice.example.com',
      verified_since: '2026-01-01T00:00:00Z',
    }, domainOverrides),
  };
}

// ---------------------------------------------------------------------------
// parseIxId
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// parseIxId — hostname authority (security-critical cases)
// ---------------------------------------------------------------------------
//
// The browser address bar is part of the trust surface for an identity system.
// The IX ID shown on the page must be derived from the hostname only when a
// production *.ixid.me hostname is present. Query parameters must never
// override or shadow the hostname-derived IX ID.

test('parseIxId: extracts IX ID from production hostname', () => {
  assert.equal(parseIxId('mariastacos.ixid.me'), 'mariastacos');
});

test('parseIxId: query string does not override production hostname', () => {
  // The address bar shows mariastacos.ixid.me; the identity must be mariastacos,
  // not whatever ?ix_id= contains. Failing this test = spoofable identity URL.
  assert.equal(parseIxId('mariastacos.ixid.me', '?ix_id=attacker'), 'mariastacos');
});

test('parseIxId: query string with empty ix_id does not override hostname', () => {
  assert.equal(parseIxId('mariastacos.ixid.me', '?ix_id='), 'mariastacos');
});

test('parseIxId: rejects bare ixid.me (no subdomain — not an IX ID address)', () => {
  assert.equal(parseIxId('ixid.me'), null);
});

test('parseIxId: rejects multi-level subdomain (v0.1 supports exactly one label)', () => {
  // foo.bar.ixid.me is not a valid v0.1 IX ID address.
  assert.equal(parseIxId('foo.bar.ixid.me'), null);
});

test('parseIxId: rejects non-ixid.me hostname', () => {
  assert.equal(parseIxId('implicitex.com'), null);
});

test('parseIxId: non-ixid.me hostname does not activate dev override', () => {
  // An attacker who controls example.com cannot use ?ix_id= to render an IX ID.
  assert.equal(parseIxId('example.com', '?ix_id=alice'), null);
});

test('parseIxId: staging/preview hosts do not activate dev override', () => {
  // Only localhost and 127.0.0.1 are recognized dev hosts.
  assert.equal(parseIxId('preview.ixid-web.run.app', '?ix_id=alice'), null);
});

// ---------------------------------------------------------------------------
// parseIxId — dev fallback (localhost only)
// ---------------------------------------------------------------------------

test('parseIxId: dev override via ?ix_id= on localhost', () => {
  assert.equal(parseIxId('localhost', '?ix_id=alice'), 'alice');
});

test('parseIxId: dev override on 127.0.0.1', () => {
  assert.equal(parseIxId('127.0.0.1', '?ix_id=alice'), 'alice');
});

test('parseIxId: dev override with other params present', () => {
  assert.equal(parseIxId('localhost', '?debug=true&ix_id=bob'), 'bob');
});

test('parseIxId: empty ix_id param on localhost returns null', () => {
  assert.equal(parseIxId('localhost', '?ix_id='), null);
});

test('parseIxId: localhost without search param returns null', () => {
  assert.equal(parseIxId('localhost', ''), null);
});

// ---------------------------------------------------------------------------
// formatVerifiedSince
// ---------------------------------------------------------------------------

test('formatVerifiedSince: formats ISO date to human string', () => {
  const result = formatVerifiedSince('2026-01-15T00:00:00Z');
  assert.ok(typeof result === 'string');
  assert.ok(result.includes('2026'));
  assert.ok(result.includes('January') || result.includes('Jan'));
});

test('formatVerifiedSince: returns null for null input', () => {
  assert.equal(formatVerifiedSince(null), null);
});

test('formatVerifiedSince: returns null for undefined', () => {
  assert.equal(formatVerifiedSince(undefined), null);
});

test('formatVerifiedSince: returns null for empty string', () => {
  assert.equal(formatVerifiedSince(''), null);
});

// ---------------------------------------------------------------------------
// buildDisplayModel — state field
// ---------------------------------------------------------------------------

test('buildDisplayModel: 200 with ix_id → state FOUND', () => {
  const m = buildDisplayModel(apiOk(), 200);
  assert.equal(m.state, 'FOUND');
});

test('buildDisplayModel: 404 → state NOT_FOUND', () => {
  const m = buildDisplayModel({ error: "IX ID not found: 'alice'" }, 404);
  assert.equal(m.state, 'NOT_FOUND');
});

test('buildDisplayModel: null response → state ERROR', () => {
  const m = buildDisplayModel(null, 503);
  assert.equal(m.state, 'ERROR');
});

test('buildDisplayModel: response without ix_id → state ERROR', () => {
  const m = buildDisplayModel({ error: 'server error' }, 500);
  assert.equal(m.state, 'ERROR');
});

// ---------------------------------------------------------------------------
// buildDisplayModel — sentinel value tests (the load-bearing invariant)
//
// Each test passes a unique sentinel as the API label and verifies the
// display model carries that sentinel through. This proves the rendering
// is driven by the API response, not by hardcoded strings in this file.
// ---------------------------------------------------------------------------

test('buildDisplayModel VERIFIED: label comes from API, not hardcoded', () => {
  const sentinel = 'SENTINEL_LABEL_VERIFIED_8f3a';
  const m = buildDisplayModel(apiOk({ status: 'VERIFIED', label: sentinel }), 200);
  assert.equal(m.domainLabel, sentinel,
    'domainLabel must equal the API label, not any hardcoded string');
});

test('buildDisplayModel RECHECK_PENDING: label comes from API', () => {
  const sentinel = 'SENTINEL_LABEL_RECHECK_2d7b';
  const m = buildDisplayModel(
    apiOk({ status: 'RECHECK_PENDING', label: sentinel }),
    200,
  );
  assert.equal(m.domainLabel, sentinel);
});

test('buildDisplayModel EXPIRED: label comes from API', () => {
  const sentinel = 'SENTINEL_LABEL_EXPIRED_9c1e';
  const m = buildDisplayModel(
    apiOk({ status: 'EXPIRED', label: sentinel, verified_since: null }),
    200,
  );
  assert.equal(m.domainLabel, sentinel);
});

test('buildDisplayModel NOT_CURRENT: label comes from API', () => {
  const sentinel = 'SENTINEL_LABEL_NOT_CURRENT_4a2f';
  const m = buildDisplayModel(
    apiOk({ status: 'NOT_CURRENT', label: sentinel, verified_since: null }),
    200,
  );
  assert.equal(m.domainLabel, sentinel);
});

test('buildDisplayModel NONE: null label from API is null in model', () => {
  const m = buildDisplayModel(
    apiOk({ status: 'NONE', label: null, subject: null, verified_since: null }),
    200,
  );
  assert.equal(m.domainLabel, null);
});

test('buildDisplayModel: domainStatus comes from API status field', () => {
  // Verify status passthrough with a non-standard value
  const m = buildDisplayModel(apiOk({ status: 'RECHECK_PENDING' }), 200);
  assert.equal(m.domainStatus, 'RECHECK_PENDING');
});

test('buildDisplayModel: domainSubject comes from API subject field', () => {
  const sentinel = 'sentinel-subject.example.com';
  const m = buildDisplayModel(apiOk({ subject: sentinel }), 200);
  assert.equal(m.domainSubject, sentinel);
});

test('buildDisplayModel: verifiedSince is formatted from API verified_since', () => {
  // Supply a known date; verify the result is a formatted string containing the year
  const m = buildDisplayModel(apiOk({ verified_since: '2025-03-15T00:00:00Z' }), 200);
  assert.ok(typeof m.verifiedSince === 'string');
  assert.ok(m.verifiedSince.includes('2025'),
    'verifiedSince must be derived from API verified_since');
});

test('buildDisplayModel: verifiedSince is null when API verified_since is null', () => {
  const m = buildDisplayModel(apiOk({ verified_since: null }), 200);
  assert.equal(m.verifiedSince, null);
});

test('buildDisplayModel: ixId comes from API ix_id field', () => {
  const resp = apiOk({});
  resp.ix_id = 'sentinel_ix_id_7e3c';
  const m = buildDisplayModel(resp, 200);
  assert.equal(m.ixId, 'sentinel_ix_id_7e3c');
});

test('buildDisplayModel: NOT_FOUND has null domainLabel', () => {
  const m = buildDisplayModel({ error: 'IX ID not found' }, 404);
  assert.equal(m.domainLabel, null);
  assert.equal(m.domainStatus, null);
  assert.equal(m.domainSubject, null);
});

// ---------------------------------------------------------------------------
// buildDisplayModel — all five canonical DOMAIN states exist
// ---------------------------------------------------------------------------

for (const status of ['VERIFIED', 'RECHECK_PENDING', 'EXPIRED', 'NOT_CURRENT', 'NONE']) {
  test(`buildDisplayModel: state FOUND for API status ${status}`, () => {
    const m = buildDisplayModel(
      apiOk({ status, label: `label_for_${status}`, subject: status === 'NONE' ? null : 'x.com', verified_since: status === 'NONE' ? null : '2026-01-01T00:00:00Z' }),
      200,
    );
    assert.equal(m.state, 'FOUND');
    assert.equal(m.domainStatus, status);
    // Each status label is what the API provided, not a hardcoded string
    if (status !== 'NONE') {
      assert.equal(m.domainLabel, `label_for_${status}`);
    }
  });
}

// ---------------------------------------------------------------------------
// buildDisplayModel — profile fields
// ---------------------------------------------------------------------------

test('buildDisplayModel with profile fields — FOUND state carries profile', () => {
  const resp = apiOk({});
  resp.profile = { display_name: 'Alice', bio: 'Short bio.', website_url: 'https://alice.example.com' };
  const m = buildDisplayModel(resp, 200);
  assert.equal(m.state, 'FOUND');
  assert.equal(m.profileDisplayName, 'Alice');
  assert.equal(m.profileBio, 'Short bio.');
  assert.equal(m.profileWebsiteUrl, 'https://alice.example.com');
});

test('buildDisplayModel with absent profile — FOUND state has null profile fields', () => {
  const resp = apiOk({});
  // No profile key on response
  const m = buildDisplayModel(resp, 200);
  assert.equal(m.state, 'FOUND');
  assert.equal(m.profileDisplayName, null);
  assert.equal(m.profileBio, null);
  assert.equal(m.profileWebsiteUrl, null);
});

test('buildDisplayModel NOT_FOUND — profile fields are null', () => {
  const m = buildDisplayModel({ error: 'IX ID not found' }, 404);
  assert.equal(m.state, 'NOT_FOUND');
  assert.equal(m.profileDisplayName, null);
  assert.equal(m.profileBio, null);
  assert.equal(m.profileWebsiteUrl, null);
});

test('buildDisplayModel ERROR — profile fields are null', () => {
  const m = buildDisplayModel(null, 503);
  assert.equal(m.state, 'ERROR');
  assert.equal(m.profileDisplayName, null);
  assert.equal(m.profileBio, null);
  assert.equal(m.profileWebsiteUrl, null);
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures = [];

for (const { name, fn } of tests) {
  try {
    fn();
    passed += 1;
  } catch (err) {
    failed += 1;
    failures.push({ name, err });
  }
}

if (failures.length) {
  for (const { name, err } of failures) {
    console.error(`\nFAIL: ${name}`);
    console.error(`  ${err.message}`);
  }
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
