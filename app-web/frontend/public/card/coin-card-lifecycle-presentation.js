/* coin-card-lifecycle-presentation.js — Coin Card presentation-promotion policy
 *
 * This module decides whether a genuine resolved lifecycle result may be
 * presented to a sender. It does not authenticate records, validate bundles,
 * select evidence, interpret lifecycle status, or authorize execution.
 *
 * Exactly one resolved outcome earns presentation eligibility:
 *
 *   LIFECYCLE_ACTIVE (fact RESOLVED) → presentationEligible: true
 *
 * All other outcomes — including LIFECYCLE_CARD_SUSPENDED, all TERMINAL
 * outcomes, all NOT_EFFECTIVE outcomes, and all UNAVAILABLE outcomes —
 * produce presentationEligible: false.
 *
 * executionEligible is never set by this module. Execution authority is a
 * separate gate that this module does not open.
 */

(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * Facts and outcomes
   * ---------------------------------------------------------------- */
  var TOP_LEVEL_FACTS = Object.freeze({
    PRESENTATION_ELIGIBLE: 'PRESENTATION_ELIGIBLE',
    PRESENTATION_BLOCKED: 'PRESENTATION_BLOCKED',
  });

  var OUTCOMES = Object.freeze({
    PRESENTATION_PROMOTED:               'PRESENTATION_PROMOTED',
    PRESENTATION_BLOCKED_SUSPENDED:      'PRESENTATION_BLOCKED_SUSPENDED',
    PRESENTATION_BLOCKED_TERMINAL:       'PRESENTATION_BLOCKED_TERMINAL',
    PRESENTATION_BLOCKED_NOT_EFFECTIVE:  'PRESENTATION_BLOCKED_NOT_EFFECTIVE',
    PRESENTATION_BLOCKED_UNAVAILABLE:    'PRESENTATION_BLOCKED_UNAVAILABLE',
    PRESENTATION_AUTHORITY_UNAVAILABLE:  'PRESENTATION_AUTHORITY_UNAVAILABLE',
    PRESENTATION_INPUT_INVALID:          'PRESENTATION_INPUT_INVALID',
  });

  /* ----------------------------------------------------------------
   * Private branded result identity
   * ---------------------------------------------------------------- */
  var PROMOTION_RESULTS = new WeakSet();

  function isPresentationResult(value) {
    try {
      return PROMOTION_RESULTS.has(value);
    } catch (error) {
      return false;
    }
  }

  /* ----------------------------------------------------------------
   * Resolution authority access
   * ---------------------------------------------------------------- */
  function getResolutionApi() {
    return window.IX_COIN_CARD_LIFECYCLE_RESOLUTION || null;
  }

  /* ----------------------------------------------------------------
   * Resolved outcome classification
   * ---------------------------------------------------------------- */
  var RESOLVED_FACT = 'RESOLVED';
  var TERMINAL_FACT = 'TERMINAL';
  var NOT_EFFECTIVE_FACT = 'NOT_EFFECTIVE';
  var UNAVAILABLE_FACT = 'UNAVAILABLE';
  var ACTIVE_OUTCOME = 'LIFECYCLE_ACTIVE';
  var SUSPENDED_OUTCOME = 'LIFECYCLE_CARD_SUSPENDED';

  /* ----------------------------------------------------------------
   * Result construction
   * ---------------------------------------------------------------- */
  function makeResult(fact, outcome, resolvedFact, resolvedOutcome, presentationEligible) {
    var result = Object.freeze({
      fact: fact,
      outcome: outcome,
      presentationEligible: presentationEligible,
      executionEligible: false,
      resolvedFact: resolvedFact,
      resolvedOutcome: resolvedOutcome,
    });
    if (presentationEligible) {
      PROMOTION_RESULTS.add(result);
    }
    return result;
  }

  function makeBlocked(outcome, resolvedFact, resolvedOutcome) {
    return makeResult(
      TOP_LEVEL_FACTS.PRESENTATION_BLOCKED,
      outcome,
      resolvedFact,
      resolvedOutcome,
      false
    );
  }

  function makePromoted(resolvedFact, resolvedOutcome) {
    return makeResult(
      TOP_LEVEL_FACTS.PRESENTATION_ELIGIBLE,
      OUTCOMES.PRESENTATION_PROMOTED,
      resolvedFact,
      resolvedOutcome,
      true
    );
  }

  /* ----------------------------------------------------------------
   * Public: promotePresentation(resolvedLifecycleResult)
   *
   * Accepts only a genuine frozen result from IX_COIN_CARD_LIFECYCLE_RESOLUTION.
   * Returns a frozen presentation-promotion result.
   * ---------------------------------------------------------------- */
  function promotePresentation(resolvedResult) {
    var resolutionApi = getResolutionApi();

    if (
      !resolutionApi
      || typeof resolutionApi.isResolvedLifecycleResult !== 'function'
    ) {
      return makeBlocked(OUTCOMES.PRESENTATION_AUTHORITY_UNAVAILABLE, null, null);
    }

    var isGenuine;
    try {
      isGenuine = resolutionApi.isResolvedLifecycleResult(resolvedResult);
    } catch (error) {
      return makeBlocked(OUTCOMES.PRESENTATION_AUTHORITY_UNAVAILABLE, null, null);
    }

    if (isGenuine !== true) {
      return makeBlocked(OUTCOMES.PRESENTATION_INPUT_INVALID, null, null);
    }

    var resolvedFact = resolvedResult.fact;
    var resolvedOutcome = resolvedResult.outcome;

    /* The only outcome that earns presentation eligibility. */
    if (resolvedFact === RESOLVED_FACT && resolvedOutcome === ACTIVE_OUTCOME) {
      return makePromoted(resolvedFact, resolvedOutcome);
    }

    /* Suspended: card exists but is not operational for new transfers. */
    if (resolvedFact === RESOLVED_FACT && resolvedOutcome === SUSPENDED_OUTCOME) {
      return makeBlocked(OUTCOMES.PRESENTATION_BLOCKED_SUSPENDED, resolvedFact, resolvedOutcome);
    }

    /* Terminal outcomes (REVOKED, MANIFEST_REVOKED, MANIFEST_SUPERSEDED, EXPIRED). */
    if (resolvedFact === TERMINAL_FACT) {
      return makeBlocked(OUTCOMES.PRESENTATION_BLOCKED_TERMINAL, resolvedFact, resolvedOutcome);
    }

    /* Not-effective outcomes (NOT_YET_EFFECTIVE, TEMPORAL_GAP). */
    if (resolvedFact === NOT_EFFECTIVE_FACT) {
      return makeBlocked(OUTCOMES.PRESENTATION_BLOCKED_NOT_EFFECTIVE, resolvedFact, resolvedOutcome);
    }

    /* Unavailable outcomes (resolution failures). */
    if (resolvedFact === UNAVAILABLE_FACT) {
      return makeBlocked(OUTCOMES.PRESENTATION_BLOCKED_UNAVAILABLE, resolvedFact, resolvedOutcome);
    }

    /* Unrecognized fact — reject rather than promote. */
    return makeBlocked(OUTCOMES.PRESENTATION_INPUT_INVALID, resolvedFact, resolvedOutcome);
  }

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_PRESENTATION', {
    value: Object.freeze({
      TOP_LEVEL_FACTS: TOP_LEVEL_FACTS,
      OUTCOMES: OUTCOMES,
      promotePresentation: promotePresentation,
      isPresentationResult: isPresentationResult,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
