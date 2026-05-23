(function (root, factory) {
  'use strict';

  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IX = root.IX || {};
    root.IX.transferStatus = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const IX_TRANSFER_STATES = Object.freeze({
    DRAFT: 'draft',
    READY: 'ready',
    AUTHORIZING: 'authorizing',
    AUTHORIZED: 'authorized',
    SUBMITTING: 'submitting',
    SUBMITTED: 'submitted',
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    REJECTED: 'rejected',
    FAILED: 'failed',
    INTERRUPTED: 'interrupted',
    UNCLEAR: 'unclear',
    OUTCOME_UNKNOWN: 'outcome_unknown',
    REPLACED: 'replaced',
    EXPIRED: 'expired',
  });

  // Legacy records and older docs used uppercase state names. Normalize them at
  // the boundary, but keep new stored values lowercase.
  const LEGACY_STATE_ALIASES = Object.freeze(Object.keys(IX_TRANSFER_STATES).reduce(function (aliases, key) {
    aliases[key] = IX_TRANSFER_STATES[key];
    return aliases;
  }, {}));

  const TERMINAL_STATES = Object.freeze([
    IX_TRANSFER_STATES.CONFIRMED,
    IX_TRANSFER_STATES.FAILED,
    IX_TRANSFER_STATES.REJECTED,
    IX_TRANSFER_STATES.REPLACED,
    IX_TRANSFER_STATES.EXPIRED,
  ]);

  // No chain query is useful for these states unless a transfer hash is present.
  const PRE_BROADCAST_STATES = Object.freeze([
    IX_TRANSFER_STATES.DRAFT,
    IX_TRANSFER_STATES.READY,
    IX_TRANSFER_STATES.AUTHORIZING,
    IX_TRANSFER_STATES.AUTHORIZED,
    IX_TRANSFER_STATES.SUBMITTING,
    IX_TRANSFER_STATES.INTERRUPTED,
  ]);

  // Machine behavior is authoritative here. Product docs explain this map, and
  // tests enforce the invariants that should not drift.
  const ALLOWED_TRANSITIONS = Object.freeze({
    [IX_TRANSFER_STATES.DRAFT]: Object.freeze([IX_TRANSFER_STATES.READY, IX_TRANSFER_STATES.EXPIRED]),
    [IX_TRANSFER_STATES.READY]: Object.freeze([IX_TRANSFER_STATES.AUTHORIZING, IX_TRANSFER_STATES.EXPIRED]),
    [IX_TRANSFER_STATES.AUTHORIZING]: Object.freeze([
      IX_TRANSFER_STATES.AUTHORIZED,
      IX_TRANSFER_STATES.REJECTED,
      IX_TRANSFER_STATES.INTERRUPTED,
      IX_TRANSFER_STATES.OUTCOME_UNKNOWN,
    ]),
    [IX_TRANSFER_STATES.AUTHORIZED]: Object.freeze([
      IX_TRANSFER_STATES.SUBMITTING,
      IX_TRANSFER_STATES.INTERRUPTED,
      IX_TRANSFER_STATES.OUTCOME_UNKNOWN,
    ]),
    [IX_TRANSFER_STATES.SUBMITTING]: Object.freeze([
      IX_TRANSFER_STATES.SUBMITTED,
      IX_TRANSFER_STATES.REJECTED,
      IX_TRANSFER_STATES.INTERRUPTED,
      IX_TRANSFER_STATES.OUTCOME_UNKNOWN,
    ]),
    [IX_TRANSFER_STATES.SUBMITTED]: Object.freeze([
      IX_TRANSFER_STATES.PENDING,
      IX_TRANSFER_STATES.CONFIRMED,
      IX_TRANSFER_STATES.FAILED,
      IX_TRANSFER_STATES.REPLACED,
      IX_TRANSFER_STATES.OUTCOME_UNKNOWN,
    ]),
    [IX_TRANSFER_STATES.PENDING]: Object.freeze([
      IX_TRANSFER_STATES.CONFIRMED,
      IX_TRANSFER_STATES.FAILED,
      IX_TRANSFER_STATES.REPLACED,
      IX_TRANSFER_STATES.EXPIRED,
      IX_TRANSFER_STATES.OUTCOME_UNKNOWN,
    ]),
    [IX_TRANSFER_STATES.OUTCOME_UNKNOWN]: Object.freeze([
      IX_TRANSFER_STATES.PENDING,
      IX_TRANSFER_STATES.CONFIRMED,
      IX_TRANSFER_STATES.FAILED,
      IX_TRANSFER_STATES.REPLACED,
    ]),
    [IX_TRANSFER_STATES.UNCLEAR]: Object.freeze([
      IX_TRANSFER_STATES.PENDING,
      IX_TRANSFER_STATES.CONFIRMED,
      IX_TRANSFER_STATES.FAILED,
      IX_TRANSFER_STATES.OUTCOME_UNKNOWN,
    ]),
    [IX_TRANSFER_STATES.CONFIRMED]: Object.freeze([]),
    [IX_TRANSFER_STATES.FAILED]: Object.freeze([]),
    [IX_TRANSFER_STATES.REJECTED]: Object.freeze([]),
    [IX_TRANSFER_STATES.REPLACED]: Object.freeze([]),
    [IX_TRANSFER_STATES.EXPIRED]: Object.freeze([]),
    [IX_TRANSFER_STATES.INTERRUPTED]: Object.freeze([IX_TRANSFER_STATES.OUTCOME_UNKNOWN]),
  });

  function normalizeState(state) {
    if (!state || typeof state !== 'string') return null;
    if (Object.values(IX_TRANSFER_STATES).includes(state)) return state;
    return LEGACY_STATE_ALIASES[state] || null;
  }

  function isTerminalState(state) {
    return TERMINAL_STATES.includes(normalizeState(state));
  }

  function canTransition(fromState, toState) {
    const from = normalizeState(fromState);
    const to = normalizeState(toState);
    if (!from || !to) return false;
    if (from === to) return true;
    return (ALLOWED_TRANSITIONS[from] || []).includes(to);
  }

  function assertCanTransition(fromState, toState) {
    if (!canTransition(fromState, toState)) {
      throw new Error('INVALID_TRANSFER_STATE_TRANSITION');
    }
    return true;
  }

  return Object.freeze({
    IX_TRANSFER_STATES,
    ALLOWED_TRANSITIONS,
    TERMINAL_STATES,
    PRE_BROADCAST_STATES,
    normalizeState,
    isTerminalState,
    canTransition,
    assertCanTransition,
  });
});
