/* coin-card-verification.js — Coin Card manifest verification state scaffold
 *
 * This is not browser-side cryptographic verification. It defines the runtime
 * state model and execution gate that future manifest verification must satisfy.
 */

(function () {
  'use strict';

  var STATES = Object.freeze({
    VERIFIED: 'VERIFIED',
    INTEGRITY_FAILED: 'INTEGRITY_FAILED',
    CARD_REVOKED: 'CARD_REVOKED',
    VERIFICATION_UNAVAILABLE: 'VERIFICATION_UNAVAILABLE',
  });

  var STATE_SET = Object.freeze({
    VERIFIED: true,
    INTEGRITY_FAILED: true,
    CARD_REVOKED: true,
    VERIFICATION_UNAVAILABLE: true,
  });

  function normalizeState(state) {
    return STATE_SET[state] ? state : STATES.VERIFICATION_UNAVAILABLE;
  }

  function canExecuteTransfer(state) {
    return normalizeState(state) === STATES.VERIFIED;
  }

  function readManifestPointer(root) {
    if (!root || typeof root.getAttribute !== 'function') {
      return {
        state: STATES.VERIFICATION_UNAVAILABLE,
        manifestUrl: null,
        error: 'manifest-root-unavailable',
      };
    }

    var raw = root.getAttribute('data-ix-manifest');
    var manifestUrl = raw == null ? '' : String(raw).trim();
    if (!manifestUrl) {
      return {
        state: STATES.VERIFICATION_UNAVAILABLE,
        manifestUrl: null,
        error: 'manifest-pointer-missing',
      };
    }

    return {
      state: null,
      manifestUrl: manifestUrl,
      error: null,
    };
  }

  function requireExecutable(state) {
    return canExecuteTransfer(state)
      ? { ok: true, state: STATES.VERIFIED, error: null }
      : { ok: false, state: normalizeState(state), error: 'coin-card-not-verified' };
  }

  window.IX_COIN_CARD_VERIFICATION = Object.freeze({
    STATES: STATES,
    normalizeState: normalizeState,
    canExecuteTransfer: canExecuteTransfer,
    readManifestPointer: readManifestPointer,
    requireExecutable: requireExecutable,
  });
})();
