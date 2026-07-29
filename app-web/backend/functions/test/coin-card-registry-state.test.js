'use strict';

/**
 * CC-002.3 — Deterministic registry-state evaluation.
 *
 * Acceptance criteria covered: AC-06 through AC-11, AC-13, AC-14.
 *
 * These tests treat signature authenticity as an already-established input.
 * Signature verification remains isolated in CC-002.2.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  evaluateRegistryState,
  REGISTRY_STATE_REASONS,
} = require('../src/coin-card/registry-state');

// ---------------------------------------------------------------------------
// Static fixtures and helpers
// ---------------------------------------------------------------------------

const FIXTURES = path.join(__dirname, 'fixtures');
const REFERENCE_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(FIXTURES, 'manifest-v1.input.json'), 'utf8'),
);
const REGISTRY_CASES = JSON.parse(
  fs.readFileSync(
    path.join(FIXTURES, 'registry', 'registry-state-cases.json'),
    'utf8',
  ),
);

const NOW = '2026-08-01T12:00:00Z';
const FRESH_FETCH = '2026-08-01T11:59:18Z';
const ACTIVE_RECORD = REGISTRY_CASES.activeCurrent.record;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function input(overrides = {}) {
  return {
    manifest: REFERENCE_MANIFEST,
    registryRecord: ACTIVE_RECORD,
    registryFetchedAt: FRESH_FETCH,
    now: NOW,
    context: 'execute',
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    ...ACTIVE_RECORD,
    ...overrides,
  };
}

function evaluateAt(now, overrides = {}) {
  return evaluateRegistryState(input({
    now,
    registryFetchedAt: now,
    ...overrides,
  }));
}

function assertUnavailable(result, reason) {
  assert.equal(result.state, 'REGISTRY_UNAVAILABLE');
  assert.equal(result.executable, false);
  assert.deepEqual(result.reasons, [reason]);
}

// ---------------------------------------------------------------------------
// AC-06 / AC-14 — Static registry-state fixtures
// ---------------------------------------------------------------------------

for (const [name, fixture] of Object.entries(REGISTRY_CASES)) {
  test(`AC-06 / AC-14 fixture: ${name} returns ${fixture.expectedState}`, () => {
    const result = evaluateRegistryState(input({ registryRecord: fixture.record }));
    assert.equal(result.state, fixture.expectedState);
    assert.equal(
      result.executable,
      fixture.expectedState === 'VALID_CURRENT',
      `${fixture.expectedState} execution permission must follow AC-13`,
    );
  });
}

test('AC-06: active, current, authorized and fresh returns the complete immutable result', () => {
  const result = evaluateRegistryState(input());

  assert.deepEqual(result, {
    state: 'VALID_CURRENT',
    executable: true,
    reasons: [],
    statusEffectiveAt: '2026-07-29T18:05:00Z',
    registryAgeMs: 42_000,
  });
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.reasons));
});

test('AC-06: a lower registry currentManifestVersion also returns REPLACED', () => {
  const manifest = { ...REFERENCE_MANIFEST, manifestVersion: 2 };
  const result = evaluateRegistryState(input({ manifest }));

  assert.equal(result.state, 'REPLACED');
  assert.deepEqual(
    result.reasons,
    [REGISTRY_STATE_REASONS.CURRENT_MANIFEST_VERSION_MISMATCH],
  );
  assert.equal(result.executable, false);
});

test('AC-11: handle divergence preserves the historical manifest input unchanged', () => {
  const manifest = clone(REFERENCE_MANIFEST);
  const before = JSON.stringify(manifest);
  const result = evaluateRegistryState(input({
    manifest,
    registryRecord: REGISTRY_CASES.handleDivergence.record,
  }));

  assert.equal(result.state, 'REPLACED');
  assert.deepEqual(result.reasons, [REGISTRY_STATE_REASONS.HANDLE_NOT_AUTHORIZED]);
  assert.equal(JSON.stringify(manifest), before);
  assert.equal(manifest.handle, 'antoine');
});

// ---------------------------------------------------------------------------
// AC-07 — Registry freshness boundaries
// ---------------------------------------------------------------------------

test('AC-07: execute context accepts registry data exactly 5 minutes old', () => {
  const result = evaluateRegistryState(input({
    registryFetchedAt: '2026-08-01T11:55:00Z',
  }));

  assert.equal(result.state, 'VALID_CURRENT');
  assert.equal(result.registryAgeMs, 5 * 60 * 1000);
  assert.equal(result.executable, true);
});

test('AC-07: execute context rejects registry data 5 minutes 1 second old', () => {
  const result = evaluateRegistryState(input({
    registryFetchedAt: '2026-08-01T11:54:59Z',
  }));

  assertUnavailable(result, REGISTRY_STATE_REASONS.STALE_REGISTRY_DATA);
  assert.equal(result.registryAgeMs, (5 * 60 * 1000) + 1000);
});

test('AC-07: view context accepts registry data exactly 10 minutes old', () => {
  const result = evaluateRegistryState(input({
    context: 'view',
    registryFetchedAt: '2026-08-01T11:50:00Z',
  }));

  assert.equal(result.state, 'VALID_CURRENT');
  assert.equal(result.registryAgeMs, 10 * 60 * 1000);
  assert.equal(result.executable, false, '10-minute-old view data is not execution-fresh');
});

test('AC-07: view context rejects registry data 10 minutes 1 second old', () => {
  const result = evaluateRegistryState(input({
    context: 'view',
    registryFetchedAt: '2026-08-01T11:49:59Z',
  }));

  assertUnavailable(result, REGISTRY_STATE_REASONS.STALE_REGISTRY_DATA);
});

test('AC-07: view-fresh data over 5 minutes old cannot authorize execution', () => {
  const result = evaluateRegistryState(input({
    context: 'view',
    registryFetchedAt: '2026-08-01T11:53:00Z',
  }));

  assert.equal(result.state, 'VALID_CURRENT');
  assert.equal(result.registryAgeMs, 7 * 60 * 1000);
  assert.equal(result.executable, false);
});

test('AC-07: view data exactly 5 minutes old remains execution-fresh at that instant', () => {
  const result = evaluateRegistryState(input({
    context: 'view',
    registryFetchedAt: '2026-08-01T11:55:00Z',
  }));

  assert.equal(result.state, 'VALID_CURRENT');
  assert.equal(result.executable, true);
});

test('AC-07: old updatedAt does not make a freshly fetched unchanged record stale', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ updatedAt: '2026-07-29T18:05:00Z' }),
    registryFetchedAt: '2026-08-01T11:59:59Z',
  }));

  assert.equal(result.state, 'VALID_CURRENT');
  assert.equal(result.registryAgeMs, 1000);
});

test('AC-07: registry data fetched in the future fails closed', () => {
  const result = evaluateRegistryState(input({
    registryFetchedAt: '2026-08-01T12:00:01Z',
  }));

  assertUnavailable(result, REGISTRY_STATE_REASONS.REGISTRY_FETCHED_IN_FUTURE);
  assert.equal(result.registryAgeMs, -1000);
});

// ---------------------------------------------------------------------------
// AC-08 — Manifest time boundaries
// ---------------------------------------------------------------------------

test('AC-08: one second before T-14 is VALID_CURRENT', () => {
  const result = evaluateAt('2026-10-13T18:04:59Z');
  assert.equal(result.state, 'VALID_CURRENT');
  assert.equal(result.executable, true);
});

test('AC-08: exactly T-14 is EXPIRING_SOON', () => {
  const result = evaluateAt('2026-10-13T18:05:00Z');
  assert.equal(result.state, 'EXPIRING_SOON');
  assert.equal(result.executable, true);
});

test('AC-08: 13 days before expiry is EXPIRING_SOON', () => {
  const result = evaluateAt('2026-10-14T18:05:00Z');
  assert.equal(result.state, 'EXPIRING_SOON');
  assert.equal(result.executable, true);
});

test('AC-08: one second before expiresAt is EXPIRING_SOON', () => {
  const result = evaluateAt('2026-10-27T18:04:59Z');
  assert.equal(result.state, 'EXPIRING_SOON');
  assert.equal(result.executable, true);
});

test('AC-08: exactly expiresAt is EXPIRED and cannot execute', () => {
  const result = evaluateAt('2026-10-27T18:05:00Z');
  assert.equal(result.state, 'EXPIRED');
  assert.equal(result.executable, false);
});

test('AC-08: one second after expiresAt is EXPIRED and cannot execute', () => {
  const result = evaluateAt('2026-10-27T18:05:01Z');
  assert.equal(result.state, 'EXPIRED');
  assert.equal(result.executable, false);
});

test('manifest is valid exactly at notBefore', () => {
  const result = evaluateAt('2026-07-29T18:05:00Z');
  assert.equal(result.state, 'VALID_CURRENT');
});

test('future notBefore fails closed with a distinct diagnostic reason', () => {
  const preActivationRecord = record({
    statusEffectiveAt: '2026-07-29T18:00:00Z',
    updatedAt: '2026-07-29T18:00:00Z',
  });
  const result = evaluateAt('2026-07-29T18:04:59Z', {
    registryRecord: preActivationRecord,
  });

  assertUnavailable(result, REGISTRY_STATE_REASONS.NOT_YET_VALID);
});

// ---------------------------------------------------------------------------
// AC-09 / AC-10 — Status effectiveness and reporting precedence
// ---------------------------------------------------------------------------

test('AC-09: revoked status effective exactly at now returns REVOKED', () => {
  const revoked = {
    ...REGISTRY_CASES.revoked.record,
    statusEffectiveAt: NOW,
    updatedAt: NOW,
  };
  const result = evaluateRegistryState(input({
    registryRecord: revoked,
    registryFetchedAt: NOW,
  }));

  assert.equal(result.state, 'REVOKED');
  assert.equal(result.statusEffectiveAt, NOW);
  assert.equal(result.executable, false);
});

test('future-effective registry status is not treated as already effective', () => {
  const futureRevocation = {
    ...REGISTRY_CASES.revoked.record,
    statusEffectiveAt: '2026-08-01T12:00:01Z',
    updatedAt: '2026-08-01T11:59:00Z',
  };
  const result = evaluateRegistryState(input({
    registryRecord: futureRevocation,
  }));

  assertUnavailable(result, REGISTRY_STATE_REASONS.FUTURE_EFFECTIVE_STATUS);
  assert.equal(result.statusEffectiveAt, '2026-08-01T12:00:01Z');
});

test('reporting precedence: input/trust failure precedes freshness failure', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ status: 'unexpected-status' }),
    registryFetchedAt: '2026-08-01T10:00:00Z',
  }));

  assertUnavailable(result, REGISTRY_STATE_REASONS.UNKNOWN_STATUS);
});

test('reporting precedence: freshness failure precedes revoked status', () => {
  const staleRevocation = {
    ...REGISTRY_CASES.revoked.record,
    statusEffectiveAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-01T09:00:00Z',
  };
  const result = evaluateRegistryState(input({
    registryRecord: staleRevocation,
    registryFetchedAt: '2026-08-01T10:00:00Z',
  }));

  assertUnavailable(result, REGISTRY_STATE_REASONS.STALE_REGISTRY_DATA);
});

test('reporting precedence: revoked status precedes version mismatch and expiration', () => {
  const revokedAndMismatched = {
    ...REGISTRY_CASES.revoked.record,
    currentManifestVersion: 2,
    statusEffectiveAt: '2026-10-27T17:00:00Z',
    updatedAt: '2026-10-27T17:00:00Z',
  };
  const result = evaluateAt('2026-10-27T18:05:01Z', {
    registryRecord: revokedAndMismatched,
  });

  assert.equal(result.state, 'REVOKED');
  assert.equal(result.executable, false);
});

test('reporting precedence: version mismatch precedes expiration', () => {
  const result = evaluateAt('2026-10-27T18:05:01Z', {
    registryRecord: record({ currentManifestVersion: 2 }),
  });

  assert.equal(result.state, 'REPLACED');
  assert.deepEqual(
    result.reasons,
    [REGISTRY_STATE_REASONS.CURRENT_MANIFEST_VERSION_MISMATCH],
  );
  assert.equal(result.executable, false);
});

test('reporting precedence changes only the reported state, never fail-closed execution', () => {
  const results = [
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.revoked.record })),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.suspended.record })),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.replacedStatus.record })),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.versionMismatch.record })),
    evaluateAt('2026-10-27T18:05:00Z'),
  ];

  for (const result of results) {
    assert.equal(result.executable, false, `${result.state} must fail closed`);
  }
});

// ---------------------------------------------------------------------------
// Missing, malformed, unknown and contradictory registry data
// ---------------------------------------------------------------------------

test('missing registryRecord property fails closed', () => {
  const args = input();
  delete args.registryRecord;
  assertUnavailable(
    evaluateRegistryState(args),
    REGISTRY_STATE_REASONS.MISSING_REGISTRY_RECORD,
  );
});

for (const unavailableRecord of [null, undefined]) {
  test(`registryRecord ${String(unavailableRecord)} fails closed`, () => {
    const result = evaluateRegistryState(input({ registryRecord: unavailableRecord }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.MISSING_REGISTRY_RECORD);
  });
}

test('unknown registry status fails closed with UNKNOWN_STATUS', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ status: 'reinstated' }),
  }));

  assertUnavailable(result, REGISTRY_STATE_REASONS.UNKNOWN_STATUS);
});

for (const invalidContext of ['VIEW', 'payment', '', null, undefined, 1]) {
  test(`invalid context ${JSON.stringify(invalidContext)} fails closed`, () => {
    const result = evaluateRegistryState(input({ context: invalidContext }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_CONTEXT);
  });
}

for (const invalidInput of [null, undefined, [], 'input']) {
  test(`invalid top-level input ${JSON.stringify(invalidInput)} fails closed`, () => {
    const result = evaluateRegistryState(invalidInput);
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_INPUT);
  });
}

for (const field of [
  'cardId',
  'status',
  'currentManifestVersion',
  'activeHandle',
  'replacementCardId',
  'revocationReasonCode',
  'statusEffectiveAt',
  'updatedAt',
]) {
  test(`missing registry field ${field} fails closed as INVALID_REGISTRY_RECORD`, () => {
    const registryRecord = record();
    delete registryRecord[field];
    const result = evaluateRegistryState(input({ registryRecord }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_REGISTRY_RECORD);
  });
}

test('registry cardId mismatch is a contradictory record', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ cardId: 'cc_a_different_card' }),
  }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.CONTRADICTORY_RECORD);
});

test('active status with a replacementCardId is a contradictory record', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ replacementCardId: 'cc_replacement' }),
  }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.CONTRADICTORY_RECORD);
});

test('active status with a revocationReasonCode is a contradictory record', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ revocationReasonCode: 'wallet-compromise' }),
  }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.CONTRADICTORY_RECORD);
});

test('replacementCardId equal to cardId is a contradictory record', () => {
  const result = evaluateRegistryState(input({
    registryRecord: {
      ...REGISTRY_CASES.replacedStatus.record,
      replacementCardId: REFERENCE_MANIFEST.cardId,
    },
  }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.CONTRADICTORY_RECORD);
});

test('active status with null activeHandle is a contradictory record', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ activeHandle: null }),
  }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.CONTRADICTORY_RECORD);
});

test('updatedAt after snapshot-materialization registryFetchedAt is contradictory', () => {
  const result = evaluateRegistryState(input({
    registryRecord: record({ updatedAt: '2026-08-01T12:00:00Z' }),
  }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.CONTRADICTORY_RECORD);
});

test('inactive status may retain no activeHandle without becoming active', () => {
  const result = evaluateRegistryState(input({
    registryRecord: {
      ...REGISTRY_CASES.revoked.record,
      activeHandle: null,
    },
  }));
  assert.equal(result.state, 'REVOKED');
  assert.equal(result.executable, false);
});

// ---------------------------------------------------------------------------
// Malformed timestamps and unsafe numeric values
// ---------------------------------------------------------------------------

const BAD_TIMESTAMPS = [
  '2026-08-01',
  '2026-08-01T12:00:00',
  '2026-08-01T12:00:00+00:00',
  '2026-02-30T12:00:00Z',
  'not-a-date',
  '',
  null,
];

for (const badTimestamp of BAD_TIMESTAMPS) {
  test(`malformed evaluation time ${JSON.stringify(badTimestamp)} fails closed`, () => {
    const result = evaluateRegistryState(input({ now: badTimestamp }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_INPUT);
  });

  test(`malformed registry fetch time ${JSON.stringify(badTimestamp)} fails closed`, () => {
    const result = evaluateRegistryState(input({ registryFetchedAt: badTimestamp }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_REGISTRY_FETCH_TIME);
  });
}

for (const field of [
  'walletControlVerifiedAt',
  'issuedAt',
  'notBefore',
  'expiresAt',
]) {
  test(`malformed manifest timestamp ${field} fails closed`, () => {
    const manifest = { ...REFERENCE_MANIFEST, [field]: '2026-02-30T12:00:00Z' };
    const result = evaluateRegistryState(input({ manifest }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_MANIFEST);
  });
}

for (const field of ['statusEffectiveAt', 'updatedAt']) {
  test(`malformed registry timestamp ${field} fails closed`, () => {
    const result = evaluateRegistryState(input({
      registryRecord: record({ [field]: '2026-02-30T12:00:00Z' }),
    }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_REGISTRY_RECORD);
  });
}

for (const manifestVersion of [
  0,
  -1,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
  '1',
]) {
  test(`unsafe manifestVersion ${JSON.stringify(manifestVersion)} fails closed`, () => {
    const manifest = { ...REFERENCE_MANIFEST, manifestVersion };
    const result = evaluateRegistryState(input({ manifest }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_MANIFEST);
  });
}

for (const currentManifestVersion of [
  0,
  -1,
  1.5,
  Number.MAX_SAFE_INTEGER + 1,
  '1',
]) {
  test(`unsafe currentManifestVersion ${JSON.stringify(currentManifestVersion)} fails closed`, () => {
    const result = evaluateRegistryState(input({
      registryRecord: record({ currentManifestVersion }),
    }));
    assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_REGISTRY_RECORD);
  });
}

test('contradictory manifest validity interval fails closed', () => {
  const manifest = {
    ...REFERENCE_MANIFEST,
    notBefore: REFERENCE_MANIFEST.expiresAt,
  };
  const result = evaluateRegistryState(input({ manifest }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_MANIFEST);
});

// ---------------------------------------------------------------------------
// Purity, determinism, immutability and fail-closed matrix
// ---------------------------------------------------------------------------

test('evaluator does not mutate any caller input', () => {
  const args = clone(input());
  const before = JSON.stringify(args);
  evaluateRegistryState(args);
  assert.equal(JSON.stringify(args), before);
});

test('repeated evaluation of identical explicit inputs is deterministic', () => {
  const args = input();
  const first = evaluateRegistryState(args);
  const second = evaluateRegistryState(args);
  assert.deepEqual(first, second);
});

test('result and diagnostic reasons cannot be mutated', () => {
  const result = evaluateRegistryState(input({
    registryRecord: REGISTRY_CASES.revoked.record,
  }));

  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.reasons));
  assert.throws(() => {
    result.state = 'VALID_CURRENT';
  }, TypeError);
  assert.throws(() => {
    result.reasons.push('FORGED_REASON');
  }, TypeError);
});

test('exported reason-code vocabulary is frozen', () => {
  assert.ok(Object.isFrozen(REGISTRY_STATE_REASONS));
  assert.throws(() => {
    REGISTRY_STATE_REASONS.UNKNOWN_STATUS = 'FORGED';
  }, TypeError);
});

test('missing manifest and malformed manifest object fail closed', () => {
  assertUnavailable(
    evaluateRegistryState(input({ manifest: undefined })),
    REGISTRY_STATE_REASONS.INVALID_MANIFEST,
  );
  assertUnavailable(
    evaluateRegistryState(input({ manifest: [] })),
    REGISTRY_STATE_REASONS.INVALID_MANIFEST,
  );
});

test('malformed registry object fails closed', () => {
  const result = evaluateRegistryState(input({ registryRecord: [] }));
  assertUnavailable(result, REGISTRY_STATE_REASONS.INVALID_REGISTRY_RECORD);
});

test('AC-13: only execution-fresh VALID_CURRENT and EXPIRING_SOON are executable', () => {
  const results = [
    evaluateRegistryState(input()),
    evaluateAt('2026-10-13T18:05:00Z'),
    evaluateAt('2026-10-27T18:05:00Z'),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.revoked.record })),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.suspended.record })),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.replacedStatus.record })),
    evaluateRegistryState(input({ registryRecord: null })),
  ];

  for (const result of results) {
    const shouldExecute = result.state === 'VALID_CURRENT'
      || result.state === 'EXPIRING_SOON';
    assert.equal(
      result.executable,
      shouldExecute,
      `${result.state} execution permission differs from AC-13`,
    );
  }
});

test('AC-13 property: every non-permitted evaluator state is non-executable', () => {
  const results = [
    evaluateAt('2026-10-27T18:05:00Z'),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.revoked.record })),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.suspended.record })),
    evaluateRegistryState(input({ registryRecord: REGISTRY_CASES.replacedStatus.record })),
    evaluateRegistryState(input({ registryRecord: null })),
  ];
  const observedStates = [...new Set(results.map((result) => result.state))].sort();

  assert.deepEqual(observedStates, [
    'EXPIRED',
    'REGISTRY_UNAVAILABLE',
    'REPLACED',
    'REVOKED',
    'SUSPENDED',
  ]);

  for (const result of results) {
    assert.ok(
      result.state !== 'VALID_CURRENT' && result.state !== 'EXPIRING_SOON',
      `test setup accidentally included permitted state ${result.state}`,
    );
    assert.equal(result.executable, false, `${result.state} must never be executable`);
  }
});

test('AC-13: stale view result cannot become an execution path', () => {
  const result = evaluateRegistryState(input({
    context: 'view',
    registryFetchedAt: '2026-08-01T11:53:00Z',
  }));

  assert.equal(result.state, 'VALID_CURRENT');
  assert.equal(result.executable, false);
});
