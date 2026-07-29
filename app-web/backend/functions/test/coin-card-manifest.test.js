'use strict';

/**
 * CC-002.1 — Deterministic manifest construction and JCS canonicalization.
 *
 * Acceptance criteria covered: AC-01 (schema conformance), AC-02 (canonicalization).
 *
 * Tests confirm:
 *  1. Identical logical input produces byte-identical output across repeated calls.
 *  2. Reversed property insertion order produces identical bytes.
 *  3. Nested domain property reordering produces identical bytes.
 *  4. Whitespace in parsed input JSON does not affect output.
 *  5. Required fields missing one at a time are rejected.
 *  6. Unknown fields are rejected.
 *  7. Non-integer numeric fields are rejected by ImplicitEx schema validation
 *     (integer-only is an ImplicitEx constraint, not a JCS constraint).
 *  8. Unsafe integers are rejected.
 *  9. Malformed timestamps are rejected.
 * 10. Invalid manifestVersion, chainId, and assetDecimals ranges are rejected.
 * 11. Input object remains unchanged after buildManifest.
 * 12. Fixture canonical bytes and SHA-256 match the committed reference fixtures.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildManifest, canonicalizeManifest, ManifestError } = require('../src/coin-card/manifest');

// ---------------------------------------------------------------------------
// Reference fixture
// ---------------------------------------------------------------------------

const FIXTURES = path.join(__dirname, 'fixtures');

const REFERENCE_INPUT = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, 'manifest-v1.input.json'), 'utf8'),
);
const REFERENCE_CANONICAL = fs.readFileSync(path.join(FIXTURES, 'manifest-v1.canonical.json'));
const REFERENCE_SHA256 = fs.readFileSync(
  path.join(FIXTURES, 'manifest-v1.sha256'), 'utf8',
).trim();

function buildReference() {
  return buildManifest(REFERENCE_INPUT);
}

// Return a shallow-reversed copy of the top-level keys of an object.
function reverseKeys(obj) {
  const out = {};
  for (const key of Object.keys(obj).reverse()) {
    out[key] = obj[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// AC-02.1 — Cross-run byte equality
// ---------------------------------------------------------------------------

test('AC-02.1: identical logical input produces byte-identical output across repeated calls', () => {
  const a = canonicalizeManifest(buildReference());
  const b = canonicalizeManifest(buildReference());
  assert.ok(a.equals(b), 'canonical bytes must be identical across repeated calls');
});

// ---------------------------------------------------------------------------
// AC-02.2 — Top-level property reordering
// ---------------------------------------------------------------------------

test('AC-02.2: reversed top-level property insertion order produces identical bytes', () => {
  const reversed = reverseKeys(REFERENCE_INPUT);
  // domain sub-object also reversed
  reversed.domain = reverseKeys(REFERENCE_INPUT.domain);

  const a = canonicalizeManifest(buildManifest(REFERENCE_INPUT));
  const b = canonicalizeManifest(buildManifest(reversed));
  assert.ok(a.equals(b), 'property insertion order must not affect canonical bytes');
});

// ---------------------------------------------------------------------------
// AC-02.3 — Nested domain property reordering
// ---------------------------------------------------------------------------

test('AC-02.3: nested domain property reordering produces identical bytes', () => {
  const domainReversed = {
    ...REFERENCE_INPUT,
    domain: reverseKeys(REFERENCE_INPUT.domain),
  };

  const a = canonicalizeManifest(buildManifest(REFERENCE_INPUT));
  const b = canonicalizeManifest(buildManifest(domainReversed));
  assert.ok(a.equals(b), 'domain property order must not affect canonical bytes');
});

// ---------------------------------------------------------------------------
// AC-02.4 — Whitespace invariance (parse round-trip)
// ---------------------------------------------------------------------------

test('AC-02.4: input parsed from pretty-printed JSON produces identical bytes', () => {
  // Round-trip through JSON to simulate input arriving from a parsed source.
  const prettyPrinted = JSON.stringify(REFERENCE_INPUT, null, 4);
  const parsed = JSON.parse(prettyPrinted);

  const a = canonicalizeManifest(buildManifest(REFERENCE_INPUT));
  const b = canonicalizeManifest(buildManifest(parsed));
  assert.ok(a.equals(b), 'whitespace in parsed input must not affect canonical bytes');
});

// ---------------------------------------------------------------------------
// AC-01 — Schema conformance: required fields
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = [
  'domain', 'cardId', 'manifestVersion', 'handle', 'recipientAddress',
  'chainId', 'assetContract', 'assetSymbol', 'assetDecimals', 'feePolicyId',
  'entitlementType', 'walletControlVerifiedAt', 'issuedAt', 'notBefore',
  'expiresAt', 'signingKeyId',
];

for (const field of REQUIRED_FIELDS) {
  test(`AC-01: missing required field "${field}" is rejected`, () => {
    const { [field]: _omitted, ...rest } = REFERENCE_INPUT;
    assert.throws(
      () => buildManifest(rest),
      (err) => err instanceof ManifestError && err.message.includes(field),
      `expected ManifestError mentioning "${field}"`,
    );
  });
}

// domain sub-fields
const REQUIRED_DOMAIN_FIELDS = [
  'name', 'recordType', 'schemaVersion', 'environment', 'verificationDomain',
];

for (const field of REQUIRED_DOMAIN_FIELDS) {
  test(`AC-01: missing required domain field "domain.${field}" is rejected`, () => {
    const { [field]: _omitted, ...domainRest } = REFERENCE_INPUT.domain;
    const input = { ...REFERENCE_INPUT, domain: domainRest };
    assert.throws(
      () => buildManifest(input),
      (err) => err instanceof ManifestError && err.message.includes(field),
      `expected ManifestError mentioning "domain.${field}"`,
    );
  });
}

// ---------------------------------------------------------------------------
// AC-01 — Unknown fields are rejected
// ---------------------------------------------------------------------------

test('AC-01: unknown top-level field is rejected', () => {
  const input = { ...REFERENCE_INPUT, unknownField: 'should not be here' };
  assert.throws(
    () => buildManifest(input),
    (err) => err instanceof ManifestError && err.message.includes('unknownField'),
  );
});

test('AC-01: unknown domain field is rejected', () => {
  const input = {
    ...REFERENCE_INPUT,
    domain: { ...REFERENCE_INPUT.domain, unknownDomainField: 'bad' },
  };
  assert.throws(
    () => buildManifest(input),
    (err) => err instanceof ManifestError && err.message.includes('unknownDomainField'),
  );
});

// ---------------------------------------------------------------------------
// AC-01 — Non-integer numerics rejected (ImplicitEx constraint, not JCS)
// ---------------------------------------------------------------------------

test('AC-01: manifestVersion as float is rejected by ImplicitEx schema', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, manifestVersion: 1.5 }),
    (err) => err instanceof ManifestError && /integer/i.test(err.message),
  );
});

test('AC-01: chainId as float is rejected by ImplicitEx schema', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, chainId: 137.9 }),
    (err) => err instanceof ManifestError && /integer/i.test(err.message),
  );
});

test('AC-01: assetDecimals as float is rejected by ImplicitEx schema', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, assetDecimals: 6.5 }),
    (err) => err instanceof ManifestError && /integer/i.test(err.message),
  );
});

// ---------------------------------------------------------------------------
// AC-01 — Unsafe integers rejected
// ---------------------------------------------------------------------------

test('AC-01: manifestVersion as unsafe integer is rejected', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, manifestVersion: Number.MAX_SAFE_INTEGER + 1 }),
    (err) => err instanceof ManifestError,
  );
});

test('AC-01: chainId as unsafe integer is rejected', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, chainId: Number.MAX_SAFE_INTEGER + 1 }),
    (err) => err instanceof ManifestError,
  );
});

// ---------------------------------------------------------------------------
// AC-01 — Malformed timestamps rejected
// ---------------------------------------------------------------------------

const BAD_TIMESTAMPS = [
  '2026-07-29',           // date only
  '2026-07-29T18:00:00',  // no Z suffix
  '2026-07-29T18:00:00+00:00', // offset instead of Z
  'not-a-date',
  '',
  '2026-13-01T00:00:00Z', // invalid month
];

const TIMESTAMP_FIELDS = ['issuedAt', 'notBefore', 'expiresAt', 'walletControlVerifiedAt'];

for (const field of TIMESTAMP_FIELDS) {
  for (const bad of BAD_TIMESTAMPS) {
    test(`AC-01: malformed timestamp "${bad}" rejected for ${field}`, () => {
      assert.throws(
        () => buildManifest({ ...REFERENCE_INPUT, [field]: bad }),
        (err) => err instanceof ManifestError,
      );
    });
  }
}

// ---------------------------------------------------------------------------
// AC-01 — Range validations
// ---------------------------------------------------------------------------

test('AC-01: manifestVersion of 0 is rejected', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, manifestVersion: 0 }),
    (err) => err instanceof ManifestError,
  );
});

test('AC-01: manifestVersion of -1 is rejected', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, manifestVersion: -1 }),
    (err) => err instanceof ManifestError,
  );
});

test('AC-01: chainId of 0 is rejected', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, chainId: 0 }),
    (err) => err instanceof ManifestError,
  );
});

test('AC-01: assetDecimals of -1 is rejected', () => {
  assert.throws(
    () => buildManifest({ ...REFERENCE_INPUT, assetDecimals: -1 }),
    (err) => err instanceof ManifestError,
  );
});

test('AC-01: assetDecimals of 0 is accepted (zero-decimal assets are valid)', () => {
  assert.doesNotThrow(() => buildManifest({ ...REFERENCE_INPUT, assetDecimals: 0 }));
});

// ---------------------------------------------------------------------------
// AC-01 — Input object is not mutated
// ---------------------------------------------------------------------------

test('AC-01: buildManifest does not mutate the caller input object', () => {
  const input = JSON.parse(JSON.stringify(REFERENCE_INPUT));
  const inputBefore = JSON.stringify(input);
  buildManifest(input);
  assert.equal(JSON.stringify(input), inputBefore, 'input object must not be mutated');
});

test('AC-01: buildManifest does not mutate the caller domain sub-object', () => {
  const domain = { ...REFERENCE_INPUT.domain };
  const domainBefore = JSON.stringify(domain);
  buildManifest({ ...REFERENCE_INPUT, domain });
  assert.equal(JSON.stringify(domain), domainBefore, 'domain sub-object must not be mutated');
});

// ---------------------------------------------------------------------------
// AC-02.5 + AC-14 fixture: canonical bytes and SHA-256 match reference fixtures
// ---------------------------------------------------------------------------

test('AC-02.5 / AC-14: canonical bytes match committed reference fixture', () => {
  const canonical = canonicalizeManifest(buildReference());
  assert.ok(
    canonical.equals(REFERENCE_CANONICAL),
    `canonical bytes do not match test/fixtures/manifest-v1.canonical.json\n` +
    `  got:      ${canonical.toString('utf8').slice(0, 120)}...\n` +
    `  expected: ${REFERENCE_CANONICAL.toString('utf8').slice(0, 120)}...`,
  );
});

test('AC-02.5 / AC-14: SHA-256 of canonical bytes matches committed hash fixture', () => {
  const canonical = canonicalizeManifest(buildReference());
  const hash = crypto.createHash('sha256').update(canonical).digest('hex');
  assert.equal(
    hash,
    REFERENCE_SHA256,
    `SHA-256 does not match test/fixtures/manifest-v1.sha256\n` +
    `  got:      ${hash}\n` +
    `  expected: ${REFERENCE_SHA256}`,
  );
});
