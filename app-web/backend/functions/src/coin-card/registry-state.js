'use strict';

/**
 * Coin Card registry-state evaluation.
 *
 * Conforms to: Signed-Record Constitution v0.2 (31579af)
 * Acceptance criteria: CC-002 AC-06 through AC-11, AC-13, AC-14
 *
 * evaluateRegistryState(input)
 *   Combines an already-authenticated manifest with an explicitly supplied
 *   registry snapshot and evaluation time. It does not verify signatures,
 *   read the clock, access the network or filesystem, or mutate caller input.
 *
 * The constitutional state vocabulary is closed. Diagnostic reason codes add
 * forensic detail without creating new externally visible verification states.
 *
 * Reporting precedence:
 *   input/trust failure
 *     -> registry freshness failure
 *     -> explicit registry status
 *     -> manifest-version / handle replacement
 *     -> manifest time state
 *
 * Precedence affects only which state is reported. Every outcome other than
 * VALID_CURRENT or EXPIRING_SOON blocks execution.
 */

// ---------------------------------------------------------------------------
// Constitutional states and diagnostic reasons
// ---------------------------------------------------------------------------

const STATES = Object.freeze({
  VALID_CURRENT:       'VALID_CURRENT',
  EXPIRING_SOON:       'EXPIRING_SOON',
  EXPIRED:             'EXPIRED',
  REVOKED:             'REVOKED',
  REPLACED:            'REPLACED',
  SUSPENDED:           'SUSPENDED',
  REGISTRY_UNAVAILABLE: 'REGISTRY_UNAVAILABLE',
});

const REASONS = Object.freeze({
  INVALID_INPUT:                     'INVALID_INPUT',
  INVALID_CONTEXT:                   'INVALID_CONTEXT',
  INVALID_MANIFEST:                  'INVALID_MANIFEST',
  MISSING_REGISTRY_RECORD:           'MISSING_REGISTRY_RECORD',
  INVALID_REGISTRY_RECORD:           'INVALID_REGISTRY_RECORD',
  INVALID_REGISTRY_FETCH_TIME:       'INVALID_REGISTRY_FETCH_TIME',
  UNKNOWN_STATUS:                    'UNKNOWN_STATUS',
  CONTRADICTORY_RECORD:              'CONTRADICTORY_RECORD',
  FUTURE_EFFECTIVE_STATUS:           'FUTURE_EFFECTIVE_STATUS',
  REGISTRY_FETCHED_IN_FUTURE:        'REGISTRY_FETCHED_IN_FUTURE',
  UNSAFE_REGISTRY_AGE:               'UNSAFE_REGISTRY_AGE',
  STALE_REGISTRY_DATA:               'STALE_REGISTRY_DATA',
  REGISTRY_STATUS_REVOKED:           'REGISTRY_STATUS_REVOKED',
  REGISTRY_STATUS_SUSPENDED:         'REGISTRY_STATUS_SUSPENDED',
  REGISTRY_STATUS_REPLACED:          'REGISTRY_STATUS_REPLACED',
  CURRENT_MANIFEST_VERSION_MISMATCH: 'CURRENT_MANIFEST_VERSION_MISMATCH',
  HANDLE_NOT_AUTHORIZED:             'HANDLE_NOT_AUTHORIZED',
  NOT_YET_VALID:                     'NOT_YET_VALID',
  MANIFEST_EXPIRED:                  'MANIFEST_EXPIRED',
  MANIFEST_EXPIRING_SOON:            'MANIFEST_EXPIRING_SOON',
});

const KNOWN_REGISTRY_STATUSES = Object.freeze([
  'active',
  'revoked',
  'suspended',
  'replaced',
]);
const VALID_CONTEXTS = Object.freeze(['view', 'execute']);

const MINUTE_MS = 60 * 1000;
const VIEW_FRESHNESS_MS = 10 * MINUTE_MS;
const EXECUTE_FRESHNESS_MS = 5 * MINUTE_MS;
const EXPIRING_SOON_MS = 14 * 24 * 60 * MINUTE_MS;

// ISO 8601 UTC, seconds precision, Z suffix required.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const REQUIRED_REGISTRY_FIELDS = Object.freeze([
  'cardId',
  'status',
  'currentManifestVersion',
  'activeHandle',
  'replacementCardId',
  'revocationReasonCode',
  'statusEffectiveAt',
  'updatedAt',
]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(record, field) {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isSafePositiveInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/**
 * Parse the repository's required timestamp representation.
 *
 * Date.parse alone normalizes invalid dates such as February 30. Round-tripping
 * through toISOString ensures the supplied string names a real calendar instant
 * and preserves the exact UTC-seconds representation.
 */
function parseTimestamp(value) {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) {
    return null;
  }

  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds)) {
    return null;
  }

  const roundTripped = new Date(milliseconds).toISOString().replace('.000Z', 'Z');
  return roundTripped === value ? milliseconds : null;
}

function validateManifest(manifest) {
  if (!isRecord(manifest)) {
    return null;
  }

  if (
    !isNonEmptyString(manifest.cardId)
    || !isSafePositiveInteger(manifest.manifestVersion)
    || !isNonEmptyString(manifest.handle)
  ) {
    return null;
  }

  const timestampFields = [
    'walletControlVerifiedAt',
    'issuedAt',
    'notBefore',
    'expiresAt',
  ];
  const timestamps = {};

  for (const field of timestampFields) {
    const parsed = parseTimestamp(manifest[field]);
    if (parsed === null) {
      return null;
    }
    timestamps[field] = parsed;
  }

  if (timestamps.notBefore >= timestamps.expiresAt) {
    return null;
  }

  return Object.freeze(timestamps);
}

function validateRegistryRecord(registryRecord) {
  if (!isRecord(registryRecord)) {
    return null;
  }

  for (const field of REQUIRED_REGISTRY_FIELDS) {
    if (!hasOwn(registryRecord, field)) {
      return null;
    }
  }

  if (
    !isNonEmptyString(registryRecord.cardId)
    || !isNonEmptyString(registryRecord.status)
    || !isSafePositiveInteger(registryRecord.currentManifestVersion)
  ) {
    return null;
  }

  if (
    registryRecord.activeHandle !== null
    && !isNonEmptyString(registryRecord.activeHandle)
  ) {
    return null;
  }

  if (
    registryRecord.replacementCardId !== null
    && !isNonEmptyString(registryRecord.replacementCardId)
  ) {
    return null;
  }

  if (
    registryRecord.revocationReasonCode !== null
    && !isNonEmptyString(registryRecord.revocationReasonCode)
  ) {
    return null;
  }

  const statusEffectiveAtMs = parseTimestamp(registryRecord.statusEffectiveAt);
  const updatedAtMs = parseTimestamp(registryRecord.updatedAt);
  if (statusEffectiveAtMs === null || updatedAtMs === null) {
    return null;
  }

  return Object.freeze({ statusEffectiveAtMs, updatedAtMs });
}

// ---------------------------------------------------------------------------
// Result construction
// ---------------------------------------------------------------------------

function makeResult({
  state,
  reasons = [],
  statusEffectiveAt = null,
  registryAgeMs = null,
}) {
  const executionFresh = Number.isSafeInteger(registryAgeMs)
    && registryAgeMs >= 0
    && registryAgeMs <= EXECUTE_FRESHNESS_MS;
  const statePermitsExecution = state === STATES.VALID_CURRENT
    || state === STATES.EXPIRING_SOON;

  return Object.freeze({
    state,
    executable: statePermitsExecution && executionFresh,
    reasons: Object.freeze([...reasons]),
    statusEffectiveAt,
    registryAgeMs,
  });
}

function unavailable(reason, {
  statusEffectiveAt = null,
  registryAgeMs = null,
} = {}) {
  // REGISTRY_UNAVAILABLE means that current registry authorization cannot be
  // established. It is not limited to transport failure. The diagnostic reason
  // distinguishes unreachable/stale evidence from reachable but unusable data.
  return makeResult({
    state: STATES.REGISTRY_UNAVAILABLE,
    reasons: [reason],
    statusEffectiveAt,
    registryAgeMs,
  });
}

// ---------------------------------------------------------------------------
// evaluateRegistryState
// ---------------------------------------------------------------------------

/**
 * Determine current authorization from an authentic manifest and registry data.
 *
 * @param {object} input
 * @param {object} input.manifest
 * @param {object|null} input.registryRecord
 * @param {string} input.registryFetchedAt - UTC time when the complete registry
 *   snapshot was received/materialized. This is not the request-start time.
 * @param {string} input.now               - Explicit UTC evaluation timestamp.
 * @param {'view'|'execute'} input.context
 * @returns {Readonly<{
 *   state: string,
 *   executable: boolean,
 *   reasons: ReadonlyArray<string>,
 *   statusEffectiveAt: string|null,
 *   registryAgeMs: number|null
 * }>}
 */
function evaluateRegistryState(input) {
  if (!isRecord(input)) {
    return unavailable(REASONS.INVALID_INPUT);
  }

  const {
    manifest,
    registryRecord,
    registryFetchedAt,
    now,
    context,
  } = input;

  if (!VALID_CONTEXTS.includes(context)) {
    return unavailable(REASONS.INVALID_CONTEXT);
  }

  const manifestTimes = validateManifest(manifest);
  if (manifestTimes === null) {
    return unavailable(REASONS.INVALID_MANIFEST);
  }

  const nowMs = parseTimestamp(now);
  if (nowMs === null) {
    return unavailable(REASONS.INVALID_INPUT);
  }

  if (registryRecord === null || registryRecord === undefined) {
    return unavailable(REASONS.MISSING_REGISTRY_RECORD);
  }

  const registryTimes = validateRegistryRecord(registryRecord);
  if (registryTimes === null) {
    return unavailable(REASONS.INVALID_REGISTRY_RECORD);
  }

  const statusEffectiveAt = registryRecord.statusEffectiveAt;
  const registryFetchedAtMs = parseTimestamp(registryFetchedAt);
  if (registryFetchedAtMs === null) {
    return unavailable(REASONS.INVALID_REGISTRY_FETCH_TIME, { statusEffectiveAt });
  }

  const registryAgeMs = nowMs - registryFetchedAtMs;
  if (!Number.isSafeInteger(registryAgeMs)) {
    return unavailable(REASONS.UNSAFE_REGISTRY_AGE, { statusEffectiveAt });
  }

  const diagnostics = { statusEffectiveAt, registryAgeMs };

  // Input/trust failures precede freshness and semantic state reporting.
  if (!KNOWN_REGISTRY_STATUSES.includes(registryRecord.status)) {
    return unavailable(REASONS.UNKNOWN_STATUS, diagnostics);
  }

  if (registryAgeMs < 0) {
    return unavailable(REASONS.REGISTRY_FETCHED_IN_FUTURE, diagnostics);
  }

  // Under the registryFetchedAt contract above, a materialized snapshot cannot
  // contain an update written after that snapshot was received. An adapter
  // holding only request-start time must capture completion time before calling.
  const updatedAfterSnapshot = registryTimes.updatedAtMs > registryFetchedAtMs;

  if (
    registryRecord.cardId !== manifest.cardId
    || updatedAfterSnapshot
    || (
      registryRecord.replacementCardId !== null
      && registryRecord.replacementCardId === registryRecord.cardId
    )
    || (
      registryRecord.status === 'active'
      && (
        registryRecord.activeHandle === null
        || registryRecord.replacementCardId !== null
        || registryRecord.revocationReasonCode !== null
      )
    )
  ) {
    return unavailable(REASONS.CONTRADICTORY_RECORD, diagnostics);
  }

  if (registryTimes.statusEffectiveAtMs > nowMs) {
    // The v1 public record supplies only its declared status, not the previously
    // authoritative status. A reachable future-effective record therefore cannot
    // establish current authorization. The reason code prevents operations from
    // misclassifying this as registry transport failure.
    return unavailable(REASONS.FUTURE_EFFECTIVE_STATUS, diagnostics);
  }

  // The constitutional cache boundaries are inclusive: exactly 10 minutes is
  // view-fresh and exactly 5 minutes is execution-fresh.
  const freshnessToleranceMs = context === 'view'
    ? VIEW_FRESHNESS_MS
    : EXECUTE_FRESHNESS_MS;

  if (registryAgeMs > freshnessToleranceMs) {
    return unavailable(REASONS.STALE_REGISTRY_DATA, diagnostics);
  }

  // Explicit effective registry status has reporting precedence over manifest
  // replacement and time state. This precedence never changes execution safety.
  if (registryRecord.status === 'revoked') {
    return makeResult({
      state: STATES.REVOKED,
      reasons: [REASONS.REGISTRY_STATUS_REVOKED],
      ...diagnostics,
    });
  }

  if (registryRecord.status === 'suspended') {
    return makeResult({
      state: STATES.SUSPENDED,
      reasons: [REASONS.REGISTRY_STATUS_SUSPENDED],
      ...diagnostics,
    });
  }

  if (registryRecord.status === 'replaced') {
    return makeResult({
      state: STATES.REPLACED,
      reasons: [REASONS.REGISTRY_STATUS_REPLACED],
      ...diagnostics,
    });
  }

  if (registryRecord.currentManifestVersion !== manifest.manifestVersion) {
    return makeResult({
      state: STATES.REPLACED,
      reasons: [REASONS.CURRENT_MANIFEST_VERSION_MISMATCH],
      ...diagnostics,
    });
  }

  if (registryRecord.activeHandle !== manifest.handle) {
    return makeResult({
      state: STATES.REPLACED,
      reasons: [REASONS.HANDLE_NOT_AUTHORIZED],
      ...diagnostics,
    });
  }

  if (nowMs < manifestTimes.notBefore) {
    return unavailable(REASONS.NOT_YET_VALID, diagnostics);
  }

  if (nowMs >= manifestTimes.expiresAt) {
    return makeResult({
      state: STATES.EXPIRED,
      reasons: [REASONS.MANIFEST_EXPIRED],
      ...diagnostics,
    });
  }

  if (nowMs >= manifestTimes.expiresAt - EXPIRING_SOON_MS) {
    return makeResult({
      state: STATES.EXPIRING_SOON,
      reasons: [REASONS.MANIFEST_EXPIRING_SOON],
      ...diagnostics,
    });
  }

  return makeResult({
    state: STATES.VALID_CURRENT,
    ...diagnostics,
  });
}

module.exports = Object.freeze({
  evaluateRegistryState,
  REGISTRY_STATE_REASONS: REASONS,
});
