/* coin-card-execution-authorization.js — Coin Card execution authorization gate
 *
 * This module is Coin Card-specific. The Transfer Portal gets its own
 * execution-authorization module; this one must not be shared.
 *
 * Authorization is a capability for one exact transfer attempt, not continuing
 * permission to execute equivalent transfers. Each call to authorizeExecution()
 * produces a new, independent result for that exact combination of inputs.
 *
 * Three inputs are required:
 *   1. promoted-presentation proof  — genuine result from IX_COIN_CARD_LIFECYCLE_PRESENTATION
 *   2. frozen transfer-intent snapshot — the exact facts the sender has reviewed
 *   3. frozen wallet-readiness snapshot — current account, chain, balance, allowance
 *
 * This module is a synchronous pure policy function. It makes no wallet calls,
 * no DOM reads, and no async operations. All inputs must be provided by the caller.
 *
 * Only EXECUTION_AUTHORIZED results enter the private WeakSet. Blocked results
 * do not enter the WeakSet and cannot be used to satisfy isExecutionAuthorizedResult().
 *
 * IX_EXECUTION must validate with isExecutionAuthorizedResult() and mark the result
 * consumed before any wallet interaction (approval or transfer call).
 */

(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * Facts and outcomes
   * ---------------------------------------------------------------- */
  var TOP_LEVEL_FACTS = Object.freeze({
    EXECUTION_AUTHORIZED:   'EXECUTION_AUTHORIZED',
    EXECUTION_BLOCKED:      'EXECUTION_BLOCKED',
    EXECUTION_UNAVAILABLE:  'EXECUTION_UNAVAILABLE',
  });

  var OUTCOMES = Object.freeze({
    EXECUTION_AUTHORIZED:              'EXECUTION_AUTHORIZED',
    EXECUTION_PRESENTATION_PROOF_INVALID: 'EXECUTION_PRESENTATION_PROOF_INVALID',
    EXECUTION_INTENT_INVALID:          'EXECUTION_INTENT_INVALID',
    EXECUTION_WALLET_UNAVAILABLE:      'EXECUTION_WALLET_UNAVAILABLE',
    EXECUTION_ACCOUNT_INVALID:         'EXECUTION_ACCOUNT_INVALID',
    EXECUTION_NETWORK_MISMATCH:        'EXECUTION_NETWORK_MISMATCH',
    EXECUTION_RECIPIENT_INVALID:       'EXECUTION_RECIPIENT_INVALID',
    EXECUTION_SELF_SEND_BLOCKED:       'EXECUTION_SELF_SEND_BLOCKED',
    EXECUTION_AMOUNT_INVALID:          'EXECUTION_AMOUNT_INVALID',
    EXECUTION_AMOUNT_OUT_OF_RANGE:     'EXECUTION_AMOUNT_OUT_OF_RANGE',
    EXECUTION_TOTAL_MISMATCH:          'EXECUTION_TOTAL_MISMATCH',
    EXECUTION_FUNDS_INSUFFICIENT:      'EXECUTION_FUNDS_INSUFFICIENT',
    EXECUTION_POLICY_UNAVAILABLE:      'EXECUTION_POLICY_UNAVAILABLE',
  });

  /* ----------------------------------------------------------------
   * Execution plans
   * ---------------------------------------------------------------- */
  var EXECUTION_PLANS = Object.freeze({
    TRANSFER_ONLY:          'TRANSFER_ONLY',
    APPROVE_THEN_TRANSFER:  'APPROVE_THEN_TRANSFER',
  });

  /* ----------------------------------------------------------------
   * Private branded result identity
   *
   * Only EXECUTION_AUTHORIZED results are branded. Blocked and unavailable
   * results are not. isExecutionAuthorizedResult() returns false for any
   * non-authorized result, any result from a different VM context, and any
   * non-result.
   * ---------------------------------------------------------------- */
  var AUTHORIZED_RESULTS = new WeakSet();

  function isExecutionAuthorizedResult(value) {
    try {
      return AUTHORIZED_RESULTS.has(value);
    } catch (error) {
      return false;
    }
  }

  /* ----------------------------------------------------------------
   * Amount policy constants (atomic units, BigInt)
   * ---------------------------------------------------------------- */
  var COIN_CARD_MIN_RECIPIENT_ATOMIC = BigInt('1');
  var COIN_CARD_MAX_RECIPIENT_ATOMIC = BigInt('1000000000000000000');

  /* ----------------------------------------------------------------
   * Input validation helpers
   * ---------------------------------------------------------------- */
  var ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

  function isValidAddress(value) {
    return typeof value === 'string' && ETH_ADDRESS_RE.test(value);
  }

  var ATOMIC_INT_RE = /^(0|[1-9][0-9]*)$/;

  function isValidAtomicString(value) {
    return typeof value === 'string' && ATOMIC_INT_RE.test(value);
  }

  function isSafePositiveInteger(value) {
    return (
      typeof value === 'number'
      && Number.isInteger(value)
      && value > 0
      && value <= Number.MAX_SAFE_INTEGER
    );
  }

  /* ----------------------------------------------------------------
   * Transfer intent shape validation
   *
   * Returns null if valid, diagnostic string if not.
   * ---------------------------------------------------------------- */
  var REQUIRED_INTENT_FIELDS = [
    'cardId',
    'manifestId',
    'tokenAddress',
    'executionContractAddress',
    'chainId',
    'recipient',
    'recipientAmountAtomic',
    'platformFeeAtomic',
    'totalDebitAtomic',
  ];

  function validateTransferIntent(intent) {
    if (!intent || typeof intent !== 'object') {
      return 'transferIntent must be an object';
    }
    if (!Object.isFrozen(intent)) {
      return 'transferIntent must be frozen';
    }
    for (var i = 0; i < REQUIRED_INTENT_FIELDS.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(intent, REQUIRED_INTENT_FIELDS[i])) {
        return 'transferIntent missing required field: ' + REQUIRED_INTENT_FIELDS[i];
      }
    }
    if (typeof intent.cardId !== 'string' || intent.cardId === '') {
      return 'transferIntent.cardId must be a nonempty string';
    }
    if (typeof intent.manifestId !== 'string' || intent.manifestId === '') {
      return 'transferIntent.manifestId must be a nonempty string';
    }
    if (!isValidAddress(intent.tokenAddress)) {
      return 'transferIntent.tokenAddress must be a valid Ethereum address';
    }
    if (!isValidAddress(intent.executionContractAddress)) {
      return 'transferIntent.executionContractAddress must be a valid Ethereum address';
    }
    if (!isSafePositiveInteger(intent.chainId)) {
      return 'transferIntent.chainId must be a safe positive integer';
    }
    if (typeof intent.recipient !== 'string') {
      return 'transferIntent.recipient must be a string';
    }
    if (!isValidAtomicString(intent.recipientAmountAtomic)) {
      return 'transferIntent.recipientAmountAtomic must be a valid atomic integer string';
    }
    if (!isValidAtomicString(intent.platformFeeAtomic)) {
      return 'transferIntent.platformFeeAtomic must be a valid atomic integer string';
    }
    if (!isValidAtomicString(intent.totalDebitAtomic)) {
      return 'transferIntent.totalDebitAtomic must be a valid atomic integer string';
    }
    return null;
  }

  /* ----------------------------------------------------------------
   * Wallet snapshot shape validation
   *
   * Returns null if valid, diagnostic string if not.
   * ---------------------------------------------------------------- */
  var REQUIRED_SNAPSHOT_FIELDS = [
    'account',
    'chainId',
    'balanceAtomic',
    'allowanceAtomic',
    'providerReady',
  ];

  function validateWalletSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return 'walletSnapshot must be an object';
    }
    if (!Object.isFrozen(snapshot)) {
      return 'walletSnapshot must be frozen';
    }
    for (var i = 0; i < REQUIRED_SNAPSHOT_FIELDS.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, REQUIRED_SNAPSHOT_FIELDS[i])) {
        return 'walletSnapshot missing required field: ' + REQUIRED_SNAPSHOT_FIELDS[i];
      }
    }
    if (typeof snapshot.providerReady !== 'boolean') {
      return 'walletSnapshot.providerReady must be a boolean';
    }
    if (typeof snapshot.account !== 'string') {
      return 'walletSnapshot.account must be a string';
    }
    if (!isSafePositiveInteger(snapshot.chainId)) {
      return 'walletSnapshot.chainId must be a safe positive integer';
    }
    if (!isValidAtomicString(snapshot.balanceAtomic)) {
      return 'walletSnapshot.balanceAtomic must be a valid atomic integer string';
    }
    if (!isValidAtomicString(snapshot.allowanceAtomic)) {
      return 'walletSnapshot.allowanceAtomic must be a valid atomic integer string';
    }
    return null;
  }

  /* ----------------------------------------------------------------
   * Result construction
   * ---------------------------------------------------------------- */
  function makeAuthorized(intent, snapshot, executionPlan) {
    var result = Object.freeze({
      fact:                      TOP_LEVEL_FACTS.EXECUTION_AUTHORIZED,
      outcome:                   OUTCOMES.EXECUTION_AUTHORIZED,
      presentationEligible:      true,
      executionEligible:         true,
      executionPlan:             executionPlan,
      sender:                    snapshot.account,
      recipient:                 intent.recipient,
      chainId:                   intent.chainId,
      tokenAddress:              intent.tokenAddress,
      executionContractAddress:  intent.executionContractAddress,
      recipientAmountAtomic:     intent.recipientAmountAtomic,
      platformFeeAtomic:         intent.platformFeeAtomic,
      totalDebitAtomic:          intent.totalDebitAtomic,
      allowanceAtomic:           snapshot.allowanceAtomic,
      balanceAtomic:             snapshot.balanceAtomic,
      cardId:                    intent.cardId,
      manifestId:                intent.manifestId,
    });
    AUTHORIZED_RESULTS.add(result);
    return result;
  }

  function makeBlocked(outcome, presentationEligible) {
    return Object.freeze({
      fact:                 TOP_LEVEL_FACTS.EXECUTION_BLOCKED,
      outcome:              outcome,
      presentationEligible: presentationEligible,
      executionEligible:    false,
    });
  }

  function makeUnavailable(outcome) {
    return Object.freeze({
      fact:                 TOP_LEVEL_FACTS.EXECUTION_UNAVAILABLE,
      outcome:              outcome,
      presentationEligible: false,
      executionEligible:    false,
    });
  }

  /* ----------------------------------------------------------------
   * Public: authorizeExecution(promotedPresentation, transferIntent, walletSnapshot)
   *
   * Ordered gate checks. Returns a frozen execution-authorization result.
   * Never throws.
   * ---------------------------------------------------------------- */
  function authorizeExecution(promotedPresentation, transferIntent, walletSnapshot) {
    /* Step 1-3: Verify presentation proof via presentation authority */
    var presentationApi = window.IX_COIN_CARD_LIFECYCLE_PRESENTATION || null;

    if (
      !presentationApi
      || typeof presentationApi.isPromotedPresentationResult !== 'function'
    ) {
      return makeUnavailable(OUTCOMES.EXECUTION_POLICY_UNAVAILABLE);
    }

    var isGenuineProof;
    try {
      isGenuineProof = presentationApi.isPromotedPresentationResult(promotedPresentation);
    } catch (error) {
      return makeUnavailable(OUTCOMES.EXECUTION_POLICY_UNAVAILABLE);
    }

    if (isGenuineProof !== true) {
      return makeBlocked(OUTCOMES.EXECUTION_PRESENTATION_PROOF_INVALID, false);
    }

    /* Step 4: Validate transfer intent shape */
    var intentDiagnostic = validateTransferIntent(transferIntent);
    if (intentDiagnostic !== null) {
      return makeBlocked(OUTCOMES.EXECUTION_INTENT_INVALID, true);
    }

    /* Step 5: Validate wallet snapshot shape */
    var snapshotDiagnostic = validateWalletSnapshot(walletSnapshot);
    if (snapshotDiagnostic !== null) {
      return makeBlocked(OUTCOMES.EXECUTION_WALLET_UNAVAILABLE, true);
    }

    /* Step 6: Provider readiness */
    if (!walletSnapshot.providerReady) {
      return makeBlocked(OUTCOMES.EXECUTION_WALLET_UNAVAILABLE, true);
    }

    /* Step 7: Account address format */
    if (!isValidAddress(walletSnapshot.account)) {
      return makeBlocked(OUTCOMES.EXECUTION_ACCOUNT_INVALID, true);
    }

    /* Step 8: Chain match */
    if (transferIntent.chainId !== walletSnapshot.chainId) {
      return makeBlocked(OUTCOMES.EXECUTION_NETWORK_MISMATCH, true);
    }

    /* Step 9: Recipient address format */
    if (!isValidAddress(transferIntent.recipient)) {
      return makeBlocked(OUTCOMES.EXECUTION_RECIPIENT_INVALID, true);
    }

    /* Step 10: Self-send check */
    if (transferIntent.recipient.toLowerCase() === walletSnapshot.account.toLowerCase()) {
      return makeBlocked(OUTCOMES.EXECUTION_SELF_SEND_BLOCKED, true);
    }

    /* Step 11: BigInt conversion */
    var recipientAmt, platformFee, totalDebit, balance, allowance;
    try {
      recipientAmt = BigInt(transferIntent.recipientAmountAtomic);
      platformFee  = BigInt(transferIntent.platformFeeAtomic);
      totalDebit   = BigInt(transferIntent.totalDebitAtomic);
      balance      = BigInt(walletSnapshot.balanceAtomic);
      allowance    = BigInt(walletSnapshot.allowanceAtomic);
    } catch (error) {
      return makeBlocked(OUTCOMES.EXECUTION_INTENT_INVALID, true);
    }

    /* Step 12: Amount positive check */
    if (recipientAmt <= BigInt(0)) {
      return makeBlocked(OUTCOMES.EXECUTION_AMOUNT_INVALID, true);
    }

    /* Step 13: Amount range check */
    if (
      recipientAmt < COIN_CARD_MIN_RECIPIENT_ATOMIC
      || recipientAmt > COIN_CARD_MAX_RECIPIENT_ATOMIC
    ) {
      return makeBlocked(OUTCOMES.EXECUTION_AMOUNT_OUT_OF_RANGE, true);
    }

    /* Step 14: Total integrity check */
    if (recipientAmt + platformFee !== totalDebit) {
      return makeBlocked(OUTCOMES.EXECUTION_TOTAL_MISMATCH, true);
    }

    /* Step 15: Funds sufficiency */
    if (balance < totalDebit) {
      return makeBlocked(OUTCOMES.EXECUTION_FUNDS_INSUFFICIENT, true);
    }

    /* Step 16: Execution plan — allowance determines approve-then-transfer vs transfer-only */
    var executionPlan = (allowance >= totalDebit)
      ? EXECUTION_PLANS.TRANSFER_ONLY
      : EXECUTION_PLANS.APPROVE_THEN_TRANSFER;

    return makeAuthorized(transferIntent, walletSnapshot, executionPlan);
  }

  Object.defineProperty(window, 'IX_COIN_CARD_EXECUTION_AUTHORIZATION', {
    value: Object.freeze({
      TOP_LEVEL_FACTS:             TOP_LEVEL_FACTS,
      OUTCOMES:                    OUTCOMES,
      EXECUTION_PLANS:             EXECUTION_PLANS,
      authorizeExecution:          authorizeExecution,
      isExecutionAuthorizedResult: isExecutionAuthorizedResult,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
