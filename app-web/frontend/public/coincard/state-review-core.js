(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoinCardReviewCore = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ACTIVE_EXECUTION = [
    'APPROVAL_REQUESTED',
    'APPROVAL_PENDING',
    'APPROVAL_CONFIRMED',
    'TRANSFER_REQUESTED',
    'TRANSFER_PENDING',
  ];
  var TERMINAL_EXECUTION = ['CONFIRMED', 'FAILED', 'INTERRUPTED'];
  var PENDING_EXECUTION = ['APPROVAL_PENDING', 'TRANSFER_PENDING'];
  var REQUESTED_EXECUTION = ['APPROVAL_REQUESTED', 'TRANSFER_REQUESTED'];
  var RULE_HANDLERS = {
    'axis-values-must-be-declared': ruleAxisValues,
    'route-availability-validity-consistency': ruleRouteConsistency,
    'amount-text-validity-consistency': ruleAmountConsistency,
    'above-maximum-requires-configured-maximum': ruleAboveMaximum,
    'fixture-amount-input-consistency': ruleFixtureAmountInput,
    'allowance-execution-consistency': ruleAllowanceExecution,
    'funding-wallet-consistency': ruleFundingWalletConsistency,
    'unsupported-network-token-cannot-be-execution-ready': ruleUnsupportedExecutionReady,
    'preview-ready-requires-valid-route-and-amount': rulePreviewReady,
    'execution-ready-requires-funding-and-sender': ruleExecutionReady,
    'active-execution-requires-intent': ruleActiveExecutionIntent,
    'approval-pending-requires-hash': ruleApprovalPendingHash,
    'approval-confirmed-requires-successful-approval': ruleApprovalConfirmed,
    'receipt-outcome-canonical': ruleReceiptOutcomeCanonical,
    'transfer-pending-requires-hash': ruleTransferPendingHash,
    'confirmed-requires-final-receipt': ruleConfirmedReceipt,
    'receipt-finality-consistency': ruleReceiptFinality,
    'error-axis-consistency': ruleErrorAxis,
    'retryability-consistency': ruleRetryability,
    'fixture-math-consistency': ruleFixtureMath,
  };
  var TRANSITION_HANDLERS = {
    'expanded-view': guardExpandedView,
    'no-active-wallet-request': guardNoActiveWalletRequest,
    'connected-wrong-network': guardConnectedWrongNetwork,
    'valid-preview': guardValidPreview,
    'connected-ready-wallet': guardConnectedReadyWallet,
    'sufficient-funding': guardSufficientFunding,
    'approval-required': guardApprovalRequired,
    'allowance-sufficient': guardAllowanceSufficient,
    'active-intent': guardActiveIntent,
    'new-intent': guardNewIntent,
    'preserve-view': guardPass,
    'preserve-route': guardPass,
    'clear-amounts': guardPass,
    'reset-preflight': guardPass,
    'view-collapsed': guardViewCollapsed,
    'view-expanded': guardViewExpanded,
    'retryable-error': guardRetryableError,
    'same-intent-not-finalized': guardSameIntentNotFinalized,
  };
  var STATUS_RULES = [
    'CONFIRMED',
    'RECONCILING',
    'ACTIVE_EXECUTION',
    'EXECUTION_FAILURE',
    'ROUTE_FAILURE',
    'WALLET_NETWORK_BLOCKER',
    'FUNDING_BLOCKER',
    'AMOUNT_VALIDATION',
    'IDLE_OR_READY',
  ];
  var CTA_RULES = [
    'COLLAPSED_EXPAND_ONLY',
    'CONFIRMED_NO_FUND_MOVING_ACTION',
    'PENDING_DISABLED',
    'RETRYABLE_FAILURE',
    'ROUTE_BLOCKER_DISABLED',
    'AMOUNT_BLOCKER_DISABLED',
    'NETWORK_TOKEN_BLOCKER_DISABLED',
    'CONNECT',
    'SWITCH_NETWORK',
    'FUNDING_BLOCKER_DISABLED',
    'APPROVE_OR_TRANSFER',
  ];
  var BODY_RULES = [
    'CONFIRMED_RESULT',
    'RECONCILIATION_FACTS',
    'ACTIVE_EXECUTION_FACTS',
    'FAILURE_FACTS',
    'FORM_VALIDATION_ERROR',
    'ROUTE_ERROR',
    'EDITABLE_FORM',
  ];
  var BODY_ROW_IDS = [
    'recipient',
    'route',
    'destination',
    'amount',
    'fee',
    'total',
    'validationTitle',
    'validationExplanation',
    'approvalHash',
    'transferHash',
    'result',
    'errorCode',
    'errorMessage',
    'receipt',
  ];
  var POSTCONDITION_RULES = [
    'preserve-view',
    'preserve-locked-route',
    'archive-evidence',
    'clear-amounts',
    'preserve-transaction-facts',
    'reset-preflight',
    'change-intent-id',
    'change-attempt-id',
    'invalidate-old-events',
  ];

  function valuesOf(contract, axis) {
    return (contract.state.axes && contract.state.axes[axis]) || [];
  }

  function hasValue(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function isStateFixture(fixture) {
    return fixture && fixture.state && !fixture.event;
  }

  function expectedGeometry(contract, state) {
    var view = state && state.view === 'COLLAPSED' ? 'collapsed' : 'expanded';
    return contract.state.geometry[view].outer;
  }

  function scaleFor(contract) {
    var decimals = BigInt(contract.state.amountPolicy.decimals);
    var scale = 1n;
    while (decimals > 0n) {
      scale *= 10n;
      decimals -= 1n;
    }
    return scale;
  }

  function isPreviewCapable(s) {
    return s.routeAvailability === 'AVAILABLE' &&
      s.routeValidity === 'VALID' &&
      s.networkSupport === 'SUPPORTED' &&
      s.tokenSupport === 'SUPPORTED' &&
      s.amountText === 'SYNTACTICALLY_COMPLETE' &&
      s.amountValidity === 'VALID';
  }

  function isPostInitiation(execution) {
    return ACTIVE_EXECUTION.indexOf(execution) !== -1 ||
      TERMINAL_EXECUTION.indexOf(execution) !== -1 ||
      execution === 'RECONCILING';
  }

  function evaluateState(contract, fixture) {
    if (!fixture || !fixture.state) return { legal: false, errors: ['missing state'] };
    var context = {
      contract: contract,
      fixture: fixture,
      state: fixture.state,
      values: fixture.values || {},
      errors: [],
    };

    (contract.state.legalInvariants || []).forEach(function (rule) {
      var id = typeof rule === 'string' ? rule : rule.id;
      var handler = RULE_HANDLERS[id];
      if (!handler) {
        context.errors.push('unknown invariant rule: ' + id);
        return;
      }
      handler(context);
    });

    return { legal: context.errors.length === 0, errors: context.errors };
  }

  function validateContract(contract) {
    var errors = [];
    (contract.state.legalInvariants || []).forEach(function (rule) {
      var id = typeof rule === 'string' ? rule : rule.id;
      if (!RULE_HANDLERS[id]) errors.push('unknown invariant rule: ' + id);
    });
    Object.entries(contract.state.transitionGuards || {}).forEach(function (entry) {
      entry[1].forEach(function (guardId) {
        if (!TRANSITION_HANDLERS[guardId]) errors.push('unknown transition guard: ' + guardId);
      });
    });
    (contract.state.renderPrecedence.primaryStatus || []).forEach(function (id) {
      if (STATUS_RULES.indexOf(id) === -1) errors.push('unknown status rule: ' + id);
    });
    (contract.state.renderPrecedence.cta || []).forEach(function (id) {
      if (CTA_RULES.indexOf(id) === -1) errors.push('unknown CTA rule: ' + id);
    });
    (contract.state.renderPrecedence.body || []).forEach(function (id) {
      if (BODY_RULES.indexOf(id) === -1) errors.push('unknown body rule: ' + id);
    });
    var canonicalBodyOrder = ['CONFIRMED_RESULT', 'RECONCILIATION_FACTS', 'ACTIVE_EXECUTION_FACTS', 'FAILURE_FACTS', 'ROUTE_ERROR', 'FORM_VALIDATION_ERROR', 'EDITABLE_FORM'];
    if ((contract.state.renderPrecedence.body || []).join('|') !== canonicalBodyOrder.join('|')) {
      errors.push('body precedence must match canonical contract order');
    }
    Object.values(contract.state.bodySchemas || {}).forEach(function (rowIds) {
      if (rowIds.length !== 6) errors.push('body schema must define exactly six rows');
      if (new Set(rowIds).size !== rowIds.length) errors.push('body schema rows must be unique');
      rowIds.forEach(function (rowId) {
        if (BODY_ROW_IDS.indexOf(rowId) === -1) errors.push('unknown body schema row id: ' + rowId);
      });
    });
    Object.values(contract.state.transitionPostconditions || {}).forEach(function (ruleIds) {
      ruleIds.forEach(function (ruleId) {
        if (POSTCONDITION_RULES.indexOf(ruleId) === -1) errors.push('unknown postcondition rule: ' + ruleId);
      });
    });
    return { valid: errors.length === 0, errors: errors };
  }

  function addError(context, message) {
    context.errors.push(message);
  }

  function ruleAxisValues(context) {
    Object.keys(context.contract.state.axes || {}).forEach(function (axis) {
      if (valuesOf(context.contract, axis).indexOf(context.state[axis]) === -1) {
        addError(context, 'invalid ' + axis + ': ' + context.state[axis]);
      }
    });
  }

  function ruleRouteConsistency(context) {
    var s = context.state;
    if (s.routeAvailability === 'UNAVAILABLE' && s.routeValidity !== 'UNKNOWN') {
      addError(context, 'unavailable route requires UNKNOWN validity');
    }
    if (s.routeValidity === 'INVALID' && s.routeAvailability !== 'AVAILABLE') {
      addError(context, 'invalid route requires AVAILABLE route source');
    }
  }

  function ruleAmountConsistency(context) {
    var s = context.state;
    if (s.amountText === 'EMPTY' && s.amountValidity !== 'UNKNOWN') addError(context, 'empty amount requires UNKNOWN amount validity');
    if (s.amountText === 'TEMPORARY_INCOMPLETE' && s.amountValidity !== 'UNKNOWN') addError(context, 'temporary amount requires UNKNOWN amount validity');
    if (s.amountText === 'SYNTAX_INVALID' && (s.amountValidity === 'VALID' || s.amountValidity === 'UNKNOWN')) {
      addError(context, 'syntax-invalid amount requires a concrete invalid amount state');
    }
  }

  function ruleAboveMaximum(context) {
    if (context.state.amountValidity === 'ABOVE_MAXIMUM' && context.contract.state.amountPolicy.maximumAmountUnits === null) {
      addError(context, 'ABOVE_MAXIMUM requires configured maximumAmountUnits');
    }
  }

  function ruleFixtureAmountInput(context) {
    var v = context.values;
    if (!hasOwn(v, 'amountInput')) return;
    var parsed = parseAmountUnits(context.contract, v.amountInput);
    if (context.state.amountText !== parsed.amountText) addError(context, 'declared amountText does not match parsed amount input');
    if (context.state.amountValidity !== parsed.amountValidity) addError(context, 'declared amountValidity does not match parsed amount input');
    if (parsed.units !== null && hasValue(v.amountUnits) && BigInt(v.amountUnits) !== parsed.units) {
      addError(context, 'declared amountUnits does not match parsed amount input');
    }
  }

  function ruleAllowanceExecution(context) {
    var s = context.state;
    if (s.execution === 'EXECUTION_READY' && s.allowance !== 'APPROVAL_REQUIRED' && s.allowance !== 'ALLOWANCE_SUFFICIENT') {
      addError(context, 'EXECUTION_READY requires known allowance state');
    }
    if (s.execution === 'TRANSFER_REQUESTED' && s.allowance !== 'ALLOWANCE_SUFFICIENT') {
      addError(context, 'TRANSFER_REQUESTED requires sufficient allowance snapshot');
    }
  }

  function ruleReceiptOutcomeCanonical(context) {
    if (hasOwn(context.values, 'receiptOutcome')) addError(context, 'receiptOutcome must live on state only');
    if (hasOwn(context.values, 'receiptStatus')) addError(context, 'receiptStatus is legacy and not allowed');
  }

  function ruleFundingWalletConsistency(context) {
    var s = context.state;
    if (isPostInitiation(s.execution)) return;
    if (s.wallet === 'DISCONNECTED' && s.funding !== 'UNKNOWN') addError(context, 'disconnected wallet cannot claim funding sufficiency');
    if ((s.funding === 'SUFFICIENT' || s.funding === 'INSUFFICIENT_USDC' || s.funding === 'INSUFFICIENT_GAS') &&
        s.wallet !== 'CONNECTED_READY') {
      addError(context, 'known funding requires connected ready sender before execution begins');
    }
  }

  function ruleUnsupportedExecutionReady(context) {
    var s = context.state;
    if (s.execution !== 'EXECUTION_READY') return;
    if (s.networkSupport === 'UNSUPPORTED') addError(context, 'unsupported network cannot be execution ready');
    if (s.tokenSupport === 'UNSUPPORTED') addError(context, 'unsupported token cannot be execution ready');
  }

  function rulePreviewReady(context) {
    if (context.state.execution === 'PREVIEW_READY' && !isPreviewCapable(context.state)) {
      addError(context, 'PREVIEW_READY requires valid route, supported network/token, and valid amount');
    }
  }

  function ruleExecutionReady(context) {
    var s = context.state;
    if (s.execution !== 'EXECUTION_READY') return;
    if (!isPreviewCapable(s)) addError(context, 'EXECUTION_READY requires preview-capable state');
    if (s.wallet !== 'CONNECTED_READY') addError(context, 'EXECUTION_READY requires connected ready wallet');
    if (s.funding !== 'SUFFICIENT') addError(context, 'EXECUTION_READY requires sufficient funding');
    if (s.allowance !== 'APPROVAL_REQUIRED' && s.allowance !== 'ALLOWANCE_SUFFICIENT') addError(context, 'EXECUTION_READY requires known allowance');
    if (!hasValue(s.activeIntentId)) addError(context, 'EXECUTION_READY requires activeIntentId');
  }

  function ruleActiveExecutionIntent(context) {
    var s = context.state;
    if (isPostInitiation(s.execution) && !hasValue(s.activeIntentId)) addError(context, s.execution + ' requires activeIntentId');
  }

  function ruleApprovalPendingHash(context) {
    if (context.state.execution === 'APPROVAL_PENDING' && !hasValue(context.values.approvalHash)) {
      addError(context, 'APPROVAL_PENDING requires approvalHash');
    }
  }

  function ruleApprovalConfirmed(context) {
    if (context.state.execution === 'APPROVAL_CONFIRMED' &&
        (!hasValue(context.values.approvalHash) || context.values.approvalReceiptStatus !== 'success')) {
      addError(context, 'APPROVAL_CONFIRMED requires successful approval receipt');
    }
  }

  function ruleTransferPendingHash(context) {
    if (context.state.execution === 'TRANSFER_PENDING' && !hasValue(context.values.transferHash)) {
      addError(context, 'TRANSFER_PENDING requires transferHash');
    }
  }

  function isConclusiveOutcome(outcome) {
    return outcome === 'success' || outcome === 'reverted' || outcome === 'not_broadcast' || outcome === 'no_execution_found';
  }

  function ruleReceiptMatrix(context) {
    var s = context.state;
    var outcome = s.receiptOutcome;
    if (s.receipt === 'NONE' && outcome !== 'NONE') addError(context, 'NONE receipt requires NONE outcome');
    if (s.receipt === 'LOCAL_READY' && isConclusiveOutcome(outcome)) addError(context, 'LOCAL_READY cannot have conclusive receipt outcome');
    if (s.receipt === 'SUBMITTED' && outcome !== 'NONE' && outcome !== 'unknown') addError(context, 'SUBMITTED cannot have conclusive receipt outcome');
    if (s.receipt === 'FINAL' && (outcome === 'NONE' || outcome === 'unknown')) addError(context, 'FINAL requires conclusive receipt outcome');
    if (s.receipt === 'FINAL' && s.execution !== 'CONFIRMED' && s.execution !== 'FAILED' && s.execution !== 'INTERRUPTED') {
      addError(context, 'FINAL receipt requires a terminal execution state');
    }
    if (s.execution === 'FAILED' && s.receipt !== 'FINAL' && outcome !== 'NONE' && outcome !== 'unknown') {
      addError(context, 'FAILED nonfinal receipt must not carry conclusive outcome');
    }
    if (s.execution === 'INTERRUPTED' && s.receipt !== 'FINAL' && outcome !== 'NONE' && outcome !== 'unknown') {
      addError(context, 'INTERRUPTED nonfinal receipt must not carry conclusive outcome');
    }
    if (s.execution === 'CONFIRMED' && (s.receipt !== 'FINAL' || outcome !== 'success' || !hasValue(context.values.transferHash))) {
      addError(context, 'CONFIRMED requires FINAL success receipt and transferHash');
    }
    if (s.execution === 'FAILED') {
      if (s.receipt === 'FINAL' && outcome !== 'reverted') addError(context, 'FAILED requires reverted final evidence');
      if (s.receipt !== 'FINAL' && outcome !== 'NONE' && outcome !== 'unknown') addError(context, 'FAILED nonfinal receipt must not carry conclusive outcome');
    }
    if (s.execution === 'INTERRUPTED') {
      if (s.receipt === 'FINAL' && outcome !== 'not_broadcast' && outcome !== 'no_execution_found') addError(context, 'INTERRUPTED requires conclusive interruption evidence');
      if (s.receipt !== 'FINAL' && outcome !== 'NONE' && outcome !== 'unknown') addError(context, 'INTERRUPTED nonfinal receipt must not carry conclusive outcome');
    }
    if (s.execution === 'RECONCILING' && isConclusiveOutcome(outcome)) {
      addError(context, 'RECONCILING cannot have conclusive receipt outcome');
    }
    if (s.execution !== 'CONFIRMED' && s.execution !== 'FAILED' && s.execution !== 'INTERRUPTED' && outcome === 'success' && s.receipt !== 'FINAL') {
      addError(context, 'nonterminal execution cannot carry success outcome');
    }
  }

  function ruleConfirmedReceipt(context) {
    return ruleReceiptMatrix(context);
  }

  function ruleReceiptFinality(context) {
    return ruleReceiptMatrix(context);
  }

  function ruleErrorAxis(context) {
    var s = context.state;
    if (s.error === 'NONE' && (s.execution === 'FAILED' || s.execution === 'INTERRUPTED' || s.execution === 'RECONCILING')) {
      addError(context, s.execution + ' requires a concrete error axis');
    }
    if (s.error !== 'NONE' && s.execution !== 'FAILED' && s.execution !== 'INTERRUPTED' &&
        s.routeAvailability !== 'UNAVAILABLE' && s.routeValidity !== 'INVALID' && s.wallet !== 'CONNECTION_FAILED' &&
        s.networkSupport !== 'UNSUPPORTED' && s.tokenSupport !== 'UNSUPPORTED' &&
        s.funding !== 'INSUFFICIENT_USDC' && s.funding !== 'INSUFFICIENT_GAS' &&
        s.amountValidity !== 'INVALID_CHARACTER' && s.amountValidity !== 'EXCESS_PRECISION' &&
        s.amountValidity !== 'BELOW_MINIMUM' && s.amountValidity !== 'ABOVE_MAXIMUM' &&
        s.amountValidity !== 'PRECISION_MISMATCH' && s.execution !== 'RECONCILING') {
      addError(context, 'error axis has no matching blocker');
    }
  }

  function ruleRetryability(context) {
    var s = context.state;
    var failureState = s.execution === 'FAILED' || s.execution === 'INTERRUPTED';
    if (failureState && s.retryability === 'UNKNOWN') addError(context, s.execution + ' requires explicit retryability');
    if (!failureState && s.retryability !== 'UNKNOWN') addError(context, 'non-failure execution must have UNKNOWN retryability');
    if (failureState && s.receipt === 'FINAL' && s.retryability !== 'NON_RETRYABLE') {
      addError(context, 'finalized failure requires NON_RETRYABLE retryability');
    }
    if (s.retryability === 'RETRYABLE' && !(s.execution === 'FAILED' || s.execution === 'INTERRUPTED')) {
      addError(context, 'RETRYABLE requires failed or interrupted execution');
    }
  }

  function ruleFixtureMath(context) {
    var v = context.values;
    var amountUnits = hasValue(v.amountInput) ? parseAmountUnits(context.contract, v.amountInput).units : (hasValue(v.amountUnits) ? BigInt(v.amountUnits) : null);
    if (amountUnits === null || context.state.amountValidity !== 'VALID') return;
    var fee = calculateFeeUnits(context.contract, amountUnits);
    var total = calculateTotalUnits(amountUnits, fee);
    if (hasValue(v.amountUnits) && BigInt(v.amountUnits) !== amountUnits) addError(context, 'amountUnits does not match canonical amount input');
    if (hasValue(v.feeUnits) && BigInt(v.feeUnits) !== fee) addError(context, 'feeUnits does not match canonical calculation');
    if (hasValue(v.totalUnits) && BigInt(v.totalUnits) !== total) addError(context, 'totalUnits does not match canonical calculation');
  }

  function evaluateTransition(contract, action, state, values, payload) {
    var guardIds = (contract.state.transitionGuards || {})[action];
    if (!Array.isArray(guardIds)) {
      return { allowed: false, errors: ['unknown transition action: ' + action] };
    }
    var errors = [];
    guardIds.forEach(function (guardId) {
      var handler = TRANSITION_HANDLERS[guardId];
      if (!handler) {
        errors.push('unknown transition guard: ' + guardId);
        return;
      }
      errors = errors.concat(handler(contract, state, values || {}, payload || {}));
    });
    return { allowed: errors.length === 0, errors: errors };
  }

  function guardPass() { return []; }
  function guardExpandedView(_contract, state) { return state.view === 'EXPANDED' ? [] : ['requires expanded view']; }
  function guardNoActiveWalletRequest(_contract, state) { return state.wallet === 'DISCONNECTED' || state.wallet === 'CONNECTION_FAILED' ? [] : ['requires disconnected or failed wallet']; }
  function guardConnectedWrongNetwork(_contract, state) { return state.wallet === 'CONNECTED_WRONG_NETWORK' ? [] : ['requires wrong-network wallet']; }
  function guardValidPreview(_contract, state) { return isPreviewCapable(state) ? [] : ['requires preview-capable state']; }
  function guardConnectedReadyWallet(_contract, state) { return state.wallet === 'CONNECTED_READY' ? [] : ['requires connected ready wallet']; }
  function guardSufficientFunding(_contract, state) { return state.funding === 'SUFFICIENT' ? [] : ['requires sufficient funding']; }
  function guardApprovalRequired(_contract, state) { return state.allowance === 'APPROVAL_REQUIRED' ? [] : ['requires approval-required allowance state']; }
  function guardAllowanceSufficient(_contract, state) { return state.allowance === 'ALLOWANCE_SUFFICIENT' ? [] : ['requires sufficient allowance']; }
  function guardActiveIntent(_contract, state) { return hasValue(state.activeIntentId) ? [] : ['requires activeIntentId']; }
  function guardNewIntent(_contract, state, _values, payload) { return hasValue(payload.newIntentId) && payload.newIntentId !== state.activeIntentId ? [] : ['requires new intent id different from previous']; }
  function guardViewCollapsed(_contract, state) { return state.view === 'COLLAPSED' ? [] : ['requires collapsed view']; }
  function guardViewExpanded(_contract, state) { return state.view === 'EXPANDED' ? [] : ['requires expanded view']; }
  function guardRetryableError(_contract, state) { return state.retryability === 'RETRYABLE' ? [] : ['requires retryable failure']; }
  function guardSameIntentNotFinalized(_contract, state, values, payload) {
    if (!hasValue(payload.intentId)) return ['requires intentId payload'];
    if (payload.intentId !== state.activeIntentId) return ['requires current intent id'];
    if (state.execution === 'CONFIRMED' || state.receipt === 'FINAL') return ['cannot retry finalized execution'];
    return [];
  }

  function postconditionPass() { return []; }
  function postconditionPreserveView(context) { return context.afterState.view === context.beforeState.view ? [] : ['view must be preserved']; }
  function postconditionPreserveLockedRoute(context) {
    var before = context.beforeState;
    var after = context.afterState;
    if (before.routeAvailability !== after.routeAvailability ||
        before.routeValidity !== after.routeValidity ||
        before.routeMutability !== after.routeMutability ||
        before.networkSupport !== after.networkSupport ||
        before.tokenSupport !== after.tokenSupport) {
      return ['locked route facts must be preserved'];
    }
    return [];
  }
  function postconditionArchiveEvidence(context) {
    if (!hasValue(context.beforeState.receipt) || context.beforeState.receipt === 'NONE') return [];
    if (!context.archivedEvidence.length) return ['archived evidence required'];
    return [];
  }
  function postconditionClearAmounts(context) {
    if (context.afterState.amountText !== 'EMPTY' || context.afterState.amountValidity !== 'UNKNOWN') return ['amount state must be cleared'];
    if (context.afterValues.amountUnits !== null || context.afterValues.feeUnits !== null || context.afterValues.totalUnits !== null) return ['calculated amounts must be cleared'];
    return [];
  }
  function postconditionPreserveTransactionFacts(context) {
    var before = context.beforeValues || {};
    var after = context.afterValues || {};
    var keys = ['recipient', 'route', 'destination', 'amountUnits', 'feeUnits', 'totalUnits'];
    for (var i = 0; i < keys.length; i += 1) {
      var key = keys[i];
      if (hasOwn(before, key) && String(before[key]) !== String(after[key])) return ['transaction facts must be preserved'];
    }
    if (hasOwn(after, 'transferHash') || hasOwn(after, 'approvalHash')) return ['attempt artifacts must be cleared'];
    return [];
  }
  function postconditionResetPreflight(context) {
    if (context.afterState.funding !== 'UNKNOWN' || context.afterState.allowance !== 'UNKNOWN') return ['preflight state must be reset'];
    if (!Array.isArray(context.afterValues.recheckRequired)) return ['preflight refresh list required'];
    return [];
  }
  function postconditionChangeIntentId(context) {
    if (!hasValue(context.afterState.activeIntentId) || context.afterState.activeIntentId === context.beforeState.activeIntentId) return ['intent id must change'];
    return [];
  }
  function postconditionChangeAttemptId(context) {
    if (!hasValue(context.afterState.activeAttemptId) || context.afterState.activeAttemptId === context.beforeState.activeAttemptId) return ['attempt id must change'];
    return [];
  }
  function postconditionInvalidateOldEvents(context) {
    if (!hasValue(context.beforeState.activeIntentId)) return [];
    if (context.afterValues.invalidatedEventIntentId !== (context.beforeState.activeIntentId || null)) return ['old active events must be invalidated'];
    if (context.afterValues.invalidatedEventAttemptId !== (context.beforeState.activeAttemptId || null)) return ['old active attempt events must be invalidated'];
    return [];
  }

  var POSTCONDITION_HANDLERS = {
    'preserve-view': postconditionPreserveView,
    'preserve-locked-route': postconditionPreserveLockedRoute,
    'archive-evidence': postconditionArchiveEvidence,
    'clear-amounts': postconditionClearAmounts,
    'preserve-transaction-facts': postconditionPreserveTransactionFacts,
    'reset-preflight': postconditionResetPreflight,
    'change-intent-id': postconditionChangeIntentId,
    'change-attempt-id': postconditionChangeAttemptId,
    'invalidate-old-events': postconditionInvalidateOldEvents,
  };

  function eventRequiresAttemptId(type) {
    return /APPROVAL|TRANSFER|RECEIPT|RECONCIL|RETRY/i.test(String(type || ''));
  }

  function archivedEventMatches(event) {
    if (!hasValue(event.archiveReceiptIntentId)) return false;
    if (event.intentId !== event.archiveReceiptIntentId) return false;
    if (hasValue(event.archiveReceiptAttemptId) && event.attemptId !== event.archiveReceiptAttemptId) return false;
    if (hasValue(event.archiveReceiptHash) && event.transactionHash !== event.archiveReceiptHash) return false;
    return true;
  }

  function evaluateEvent(fixture) {
    if (!fixture || !fixture.event) return { accepted: true, rejectedReason: null };
    var event = fixture.event;
    if (!hasValue(event.intentId)) return { accepted: false, rejectedReason: 'missing intentId' };
    var attemptBound = eventRequiresAttemptId(event.type);
    if (attemptBound && !hasValue(event.attemptId)) return { accepted: false, rejectedReason: 'missing attemptId' };

    if (archivedEventMatches(event)) {
      return { accepted: true, archived: true, rejectedReason: null };
    }

    if (hasValue(event.archiveReceiptIntentId)) {
      if (event.intentId !== event.archiveReceiptIntentId) return { accepted: false, archived: false, rejectedReason: 'stale intent' };
      if (hasValue(event.archiveReceiptAttemptId) && event.attemptId !== event.archiveReceiptAttemptId) {
        return { accepted: false, archived: false, rejectedReason: 'archived attempt mismatch' };
      }
      if (hasValue(event.archiveReceiptHash) && event.transactionHash !== event.archiveReceiptHash) {
        return { accepted: false, archived: false, rejectedReason: 'archived hash mismatch' };
      }
      return { accepted: true, archived: true, rejectedReason: null };
    }

    if (hasValue(event.activeIntentId) && event.intentId !== event.activeIntentId) {
      return { accepted: false, archived: false, rejectedReason: 'stale intent' };
    }
    if (attemptBound && hasValue(event.activeAttemptId) && event.attemptId !== event.activeAttemptId) {
      return { accepted: false, archived: false, rejectedReason: 'stale attempt' };
    }
    return { accepted: true, archived: false, rejectedReason: null };
  }

  function normalizeAmountText(text) {
    return String(text == null ? '' : text).trim();
  }

  function classifyAmountText(contract, input) {
    var text = normalizeAmountText(input);
    var maxLength = contract.state.amountPolicy.maximumTextLength && contract.state.amountPolicy.maximumTextLength.enabled && contract.state.amountPolicy.maximumTextLength.value;
    if (maxLength && text.length > maxLength) return { amountText: 'SYNTAX_INVALID', amountValidity: 'INVALID_CHARACTER', normalized: text };
    if (text === '') return { amountText: 'EMPTY', amountValidity: 'UNKNOWN', normalized: text };
    if (contract.state.amountPolicy.temporaryInputs.indexOf(text) !== -1) {
      return { amountText: 'TEMPORARY_INCOMPLETE', amountValidity: 'UNKNOWN', normalized: text };
    }
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
      return { amountText: 'SYNTAX_INVALID', amountValidity: 'INVALID_CHARACTER', normalized: text };
    }
    var fractional = text.indexOf('.') === -1 ? '' : text.slice(text.indexOf('.') + 1);
    if (fractional.length > contract.state.amountPolicy.decimals) {
      return { amountText: 'SYNTAX_INVALID', amountValidity: 'EXCESS_PRECISION', normalized: text };
    }
    return { amountText: 'SYNTACTICALLY_COMPLETE', amountValidity: 'VALID', normalized: text };
  }

  function parseAmountUnits(contract, input) {
    var classified = classifyAmountText(contract, input);
    if (classified.amountText !== 'SYNTACTICALLY_COMPLETE') return Object.assign({ units: null }, classified);
    var text = classified.normalized;
    var parts = text.split('.');
    var whole = parts[0] === '' ? '0' : parts[0];
    var frac = (parts[1] || '').padEnd(contract.state.amountPolicy.decimals, '0');
    var units = BigInt(whole) * scaleFor(contract) + BigInt(frac || '0');
    return Object.assign({ units: units }, validateAmountUnits(contract, units, classified));
  }

  function validateAmountUnits(contract, units, classified) {
    var next = Object.assign({}, classified || { amountText: 'SYNTACTICALLY_COMPLETE', amountValidity: 'VALID' });
    if (units < BigInt(contract.state.amountPolicy.minimumAmountUnits || '0')) next.amountValidity = 'BELOW_MINIMUM';
    var max = contract.state.amountPolicy.maximumAmountUnits;
    if (max !== null && units > BigInt(max)) next.amountValidity = 'ABOVE_MAXIMUM';
    var precision = BigInt(contract.state.amountPolicy.transferPrecisionUnits || '1');
    if (next.amountValidity === 'VALID' && units % precision !== 0n) next.amountValidity = 'PRECISION_MISMATCH';
    return next;
  }

  function validateTransferPrecision(contract, units) {
    return BigInt(units) % BigInt(contract.state.amountPolicy.transferPrecisionUnits || '1') === 0n ? 'VALID' : 'PRECISION_MISMATCH';
  }

  function calculateFeeUnits(contract, amountUnits) {
    return BigInt(amountUnits) * BigInt(contract.state.amountPolicy.feeBasisPoints) / 10000n;
  }

  function calculateTotalUnits(amountUnits, feeUnits) {
    return BigInt(amountUnits) + BigInt(feeUnits);
  }

  function formatUnits(contract, value) {
    if (value === null || value === undefined || value === '') return contract.state.amountPolicy.unavailableDisplay || '—';
    var scale = scaleFor(contract);
    var raw = BigInt(value);
    var sign = raw < 0n ? '-' : '';
    var abs = raw < 0n ? -raw : raw;
    var whole = abs / scale;
    var frac = (abs % scale).toString().padStart(contract.state.amountPolicy.decimals, '0');
    var trimmed = frac.replace(/0+$/, '');
    if (trimmed.length < 2) trimmed = frac.slice(0, 2);
    return sign + whole.toString() + '.' + trimmed + ' USDC';
  }

  function middleTruncate(value, head, tail) {
    if (!value) return '—';
    var text = String(value);
    if (text.length <= head + tail + 3) return text;
    return text.slice(0, head) + '...' + text.slice(-tail);
  }

  function primaryStatus(contract, state) {
    var labels = contract.state.selectorLabels.status;
    var rules = contract.state.renderPrecedence.primaryStatus || [];
    for (var i = 0; i < rules.length; i += 1) {
      var label = statusForRule(labels, rules[i], state);
      if (label) return label;
    }
    return labels.IDLE;
  }

  function statusForRule(labels, rule, state) {
    if (rule === 'CONFIRMED' && state.execution === 'CONFIRMED') return labels.CONFIRMED;
    if (rule === 'RECONCILING' && state.execution === 'RECONCILING') return labels.RECONCILING;
    if (rule === 'ACTIVE_EXECUTION') {
      if (state.execution === 'TRANSFER_PENDING') return labels.TRANSFER_PENDING;
      if (state.execution === 'TRANSFER_REQUESTED') return labels.TRANSFER_REQUESTED;
      if (state.execution === 'APPROVAL_CONFIRMED') return labels.APPROVAL_CONFIRMED;
      if (state.execution === 'APPROVAL_PENDING') return labels.APPROVAL_PENDING;
      if (state.execution === 'APPROVAL_REQUESTED') return labels.APPROVAL_REQUESTED;
    }
    if (rule === 'EXECUTION_FAILURE') {
      if (state.execution === 'FAILED') return labels.FAILED;
      if (state.execution === 'INTERRUPTED') return labels.INTERRUPTED;
    }
    if (rule === 'ROUTE_FAILURE') {
      if (state.routeAvailability === 'UNAVAILABLE') return labels.ROUTE_UNAVAILABLE;
      if (state.routeValidity === 'INVALID') return labels.ROUTE_INVALID;
    }
    if (rule === 'WALLET_NETWORK_BLOCKER') {
      if (state.networkSupport === 'UNSUPPORTED') return labels.UNSUPPORTED_NETWORK;
      if (state.tokenSupport === 'UNSUPPORTED') return labels.UNSUPPORTED_TOKEN;
      if (state.wallet === 'CONNECTION_FAILED') return labels.CONNECTION_FAILED;
      if (state.wallet === 'CONNECTED_WRONG_NETWORK') return labels.WRONG_NETWORK;
    }
    if (rule === 'FUNDING_BLOCKER') {
      if (state.funding === 'INSUFFICIENT_USDC') return labels.INSUFFICIENT_USDC;
      if (state.funding === 'INSUFFICIENT_GAS') return labels.INSUFFICIENT_GAS;
    }
    if (rule === 'AMOUNT_VALIDATION') {
      if (state.amountValidity === 'INVALID_CHARACTER') return labels.INVALID_AMOUNT;
      if (state.amountValidity === 'EXCESS_PRECISION') return labels.EXCESS_PRECISION;
      if (state.amountValidity === 'BELOW_MINIMUM') return labels.BELOW_MINIMUM;
      if (state.amountValidity === 'ABOVE_MAXIMUM') return labels.ABOVE_MAXIMUM;
      if (state.amountValidity === 'PRECISION_MISMATCH') return labels.PRECISION_MISMATCH;
      if (state.amountText === 'TEMPORARY_INCOMPLETE') return labels.TEMPORARY_AMOUNT;
    }
    if (rule === 'IDLE_OR_READY') {
      if (state.execution === 'EXECUTION_READY') return labels.EXECUTION_READY;
      if (state.execution === 'PREVIEW_READY') return labels.PREVIEW_READY;
      if (state.wallet === 'CONNECTING') return labels.CONNECTING;
      return labels.IDLE;
    }
    return null;
  }

  function cta(contract, state) {
    var labels = contract.state.selectorLabels.cta;
    var rules = contract.state.renderPrecedence.cta || [];
    for (var i = 0; i < rules.length; i += 1) {
      var result = ctaForRule(labels, rules[i], state);
      if (result) return result;
    }
    return { label: labels.INSPECT, enabled: false, action: 'NONE' };
  }

  function ctaForRule(labels, rule, state) {
    if (rule === 'COLLAPSED_EXPAND_ONLY' && state.view === 'COLLAPSED') return { label: labels.EXPAND, enabled: true, action: 'EXPAND' };
    if (rule === 'CONFIRMED_NO_FUND_MOVING_ACTION' && state.execution === 'CONFIRMED') return { label: labels.RECEIPT, enabled: false, action: 'NONE' };
    if (rule === 'PENDING_DISABLED' && (PENDING_EXECUTION.indexOf(state.execution) !== -1 || REQUESTED_EXECUTION.indexOf(state.execution) !== -1 || state.execution === 'APPROVAL_CONFIRMED' || state.execution === 'RECONCILING')) return { label: labels.PENDING, enabled: false, action: 'NONE' };
    if (rule === 'RETRYABLE_FAILURE' && (state.execution === 'FAILED' || state.execution === 'INTERRUPTED')) {
      if (state.retryability === 'RETRYABLE') return { label: labels.RETRY, enabled: true, action: 'RETRY' };
      if (state.retryability === 'NON_RETRYABLE') return { label: labels.REVIEW_ERROR, enabled: false, action: 'NONE' };
      return { label: labels.REVIEW_ERROR, enabled: false, action: 'NONE' };
    }
    if (rule === 'ROUTE_BLOCKER_DISABLED') {
      if (state.routeAvailability === 'UNAVAILABLE') return { label: labels.ROUTE_UNAVAILABLE, enabled: false, action: 'NONE' };
      if (state.routeValidity !== 'VALID') return { label: labels.ROUTE_INVALID, enabled: false, action: 'NONE' };
    }
    if (rule === 'AMOUNT_BLOCKER_DISABLED') {
      if (state.amountText === 'EMPTY') return { label: labels.ENTER_AMOUNT, enabled: false, action: 'NONE' };
      if (state.amountText !== 'SYNTACTICALLY_COMPLETE' || state.amountValidity !== 'VALID') return { label: labels.FIX_AMOUNT, enabled: false, action: 'NONE' };
    }
    if (rule === 'NETWORK_TOKEN_BLOCKER_DISABLED' && (state.networkSupport === 'UNSUPPORTED' || state.tokenSupport === 'UNSUPPORTED')) return { label: labels.UNSUPPORTED, enabled: false, action: 'NONE' };
    if (rule === 'CONNECT') {
      if (state.wallet === 'CONNECTION_FAILED') return { label: labels.RECONNECT, enabled: true, action: 'CONNECT' };
      if (state.wallet === 'DISCONNECTED') return { label: labels.CONNECT, enabled: true, action: 'CONNECT' };
      if (state.wallet === 'CONNECTING') return { label: labels.CONNECTING, enabled: false, action: 'NONE' };
    }
    if (rule === 'SWITCH_NETWORK' && state.wallet === 'CONNECTED_WRONG_NETWORK') return { label: labels.SWITCH_NETWORK, enabled: true, action: 'SWITCH_NETWORK' };
    if (rule === 'FUNDING_BLOCKER_DISABLED') {
      if (state.funding === 'INSUFFICIENT_USDC') return { label: labels.INSUFFICIENT_USDC, enabled: false, action: 'NONE' };
      if (state.funding === 'INSUFFICIENT_GAS') return { label: labels.INSUFFICIENT_GAS, enabled: false, action: 'NONE' };
      if (state.funding !== 'SUFFICIENT') return { label: labels.CHECKING_FUNDS, enabled: false, action: 'NONE' };
    }
    if (rule === 'APPROVE_OR_TRANSFER' && state.execution === 'EXECUTION_READY' && state.allowance === 'APPROVAL_REQUIRED') return { label: labels.APPROVE, enabled: true, action: 'APPROVE' };
    if (rule === 'APPROVE_OR_TRANSFER' && state.execution === 'EXECUTION_READY' && state.allowance === 'ALLOWANCE_SUFFICIENT') return { label: labels.SEND, enabled: true, action: 'EXECUTE' };
    return null;
  }

  var BODY_RULE_HANDLERS = {
    'CONFIRMED_RESULT': function (state) { return state.execution === 'CONFIRMED' ? 'CONFIRMED_RESULT' : null; },
    'RECONCILIATION_FACTS': function (state) { return state.execution === 'RECONCILING' ? 'RECONCILIATION_FACTS' : null; },
    'ACTIVE_EXECUTION_FACTS': function (state) {
      if (state.execution === 'APPROVAL_REQUESTED' || state.execution === 'APPROVAL_PENDING' || state.execution === 'APPROVAL_CONFIRMED' ||
          state.execution === 'TRANSFER_REQUESTED' || state.execution === 'TRANSFER_PENDING') return state.execution;
      return null;
    },
    'FAILURE_FACTS': function (state) {
      if (state.execution === 'FAILED' || state.execution === 'INTERRUPTED') return state.execution;
      return null;
    },
    'ROUTE_ERROR': function (state) {
      if (state.routeAvailability === 'UNAVAILABLE' || state.routeValidity === 'INVALID' || state.networkSupport === 'UNSUPPORTED' || state.tokenSupport === 'UNSUPPORTED' || state.wallet === 'CONNECTION_FAILED' || state.wallet === 'CONNECTED_WRONG_NETWORK') {
        return 'ROUTE_ERROR';
      }
      return null;
    },
    'FORM_VALIDATION_ERROR': function (state) {
      if (state.amountValidity === 'INVALID_CHARACTER' || state.amountValidity === 'EXCESS_PRECISION' || state.amountValidity === 'BELOW_MINIMUM' || state.amountValidity === 'ABOVE_MAXIMUM' || state.amountValidity === 'PRECISION_MISMATCH') {
        return 'FORM_VALIDATION_ERROR';
      }
      return null;
    },
    'EDITABLE_FORM': function () { return 'EDITABLE_FORM'; },
  };

  function selectors(contract, state, values) {
    return {
      primaryStatus: primaryStatus(contract, state),
      cta: cta(contract, state),
      body: bodyModel(contract, state, values || {}),
    };
  }

  function bodyModel(contract, state, values) {
    var mode = 'EDITABLE_FORM';
    var rules = (contract.state.renderPrecedence.body || []);
    for (var i = 0; i < rules.length; i += 1) {
      var handler = BODY_RULE_HANDLERS[rules[i]];
      if (!handler) continue;
      var selected = handler(state, values || {});
      if (selected) {
        mode = selected;
        break;
      }
    }
    return buildBodyModel(contract, mode, state, values);
  }

  function buildBodyModel(contract, mode, state, values) {
    var schema = (contract.state.bodySchemas && contract.state.bodySchemas[mode]) || contract.state.bodySchemas.EDITABLE_FORM || [];
    var rows = [];
    var i;
    for (i = 0; i < schema.length; i += 1) {
      rows.push(rowModelFor(contract, mode, schema[i], state, values));
    }
    return { mode: mode, rows: rows, result: bodyModeLabel(mode, state), receiptProof: state.receiptOutcome };
  }

  function rowModelFor(contract, mode, rowId, state, values) {
    var row = {
      id: rowId,
      label: labelForRowId(rowId),
      display: rowDisplayFor(contract, mode, rowId, state, values),
      accessible: rowAccessibleFor(contract, mode, rowId, state, values),
    };
    if (mode === 'FORM_VALIDATION_ERROR' && rowId === 'amount') {
      row.describedBy = 'cc-review-row-value-validationExplanation';
    }
    return row;
  }

  function labelForRowId(rowId) {
    if (rowId === 'recipient') return 'Recipient';
    if (rowId === 'route') return 'Route';
    if (rowId === 'destination') return 'Destination';
    if (rowId === 'amount') return 'Amount';
    if (rowId === 'fee') return 'Fee';
    if (rowId === 'total') return 'Total';
    if (rowId === 'validationTitle') return 'Status';
    if (rowId === 'validationExplanation') return 'Explanation';
    if (rowId === 'approvalHash') return 'Approval hash';
    if (rowId === 'transferHash') return 'Transfer hash';
    if (rowId === 'result') return 'Result';
    if (rowId === 'errorCode') return 'Error code';
    if (rowId === 'errorMessage') return 'Error message';
    if (rowId === 'receipt') return 'Receipt';
    return rowId;
  }

  function rowDisplayFor(contract, mode, rowId, state, values) {
    var recipient = values.recipient || '—';
    var amount = formatUnits(contract, values.amountUnits);
    var fee = formatUnits(contract, values.feeUnits);
    var total = formatUnits(contract, values.totalUnits);
    var transferHash = values.transferHash || '—';
    var approvalHash = values.approvalHash || '—';
    if (rowId === 'recipient') return recipient;
    if (rowId === 'route') return values.route || 'Route valid';
    if (rowId === 'destination') return values.destination || 'Polygon USDC';
    if (rowId === 'amount') return amount;
    if (rowId === 'fee') return fee;
    if (rowId === 'total') return total;
    if (rowId === 'validationTitle') return validationTitleFor(state);
    if (rowId === 'validationExplanation') return errorMessageFor(state);
    if (rowId === 'approvalHash') return middleTruncate(approvalHash, 8, 6);
    if (rowId === 'transferHash') return middleTruncate(transferHash, 8, 6);
    if (rowId === 'result') return bodyResultFor(mode, state);
    if (rowId === 'errorCode') return state.error || '—';
    if (rowId === 'errorMessage') return errorMessageFor(state);
    if (rowId === 'receipt') return state.receipt;
    return '—';
  }

  function rowAccessibleFor(contract, mode, rowId, state, values) {
    if (mode === 'FORM_VALIDATION_ERROR' && rowId === 'amount') {
      return validationTitleFor(state) + '. ' + errorMessageFor(state);
    }
    if (rowId === 'receipt') {
      return state.receipt + (state.receiptOutcome && state.receiptOutcome !== 'NONE' ? ' / ' + state.receiptOutcome : '');
    }
    return rowDisplayFor(contract, mode, rowId, state, values);
  }

  function validationTitleFor(state) {
    if (state.amountValidity === 'PRECISION_MISMATCH') return 'Whole USDC required';
    if (state.amountValidity === 'INVALID_CHARACTER') return 'Invalid amount';
    if (state.amountValidity === 'EXCESS_PRECISION') return 'Too many decimals';
    if (state.amountValidity === 'BELOW_MINIMUM') return 'Below minimum';
    if (state.amountValidity === 'ABOVE_MAXIMUM') return 'Above maximum';
    return 'Fix amount';
  }

  function bodyResultFor(mode, state) {
    if (mode === 'CONFIRMED_RESULT') return 'Confirmed';
    if (mode === 'RECONCILIATION_FACTS') return state.receiptOutcome === 'unknown' ? 'Reconciling' : 'Reconciled';
    if (mode === 'APPROVAL_REQUESTED') return 'Approval requested';
    if (mode === 'APPROVAL_PENDING') return 'Approval pending';
    if (mode === 'APPROVAL_CONFIRMED') return 'Approval confirmed';
    if (mode === 'TRANSFER_REQUESTED') return 'Transfer requested';
    if (mode === 'TRANSFER_PENDING') return 'Transfer pending';
    if (mode === 'FAILED') return 'Failed';
    if (mode === 'INTERRUPTED') return 'Interrupted';
    if (mode === 'ROUTE_ERROR') return 'Route error';
    if (mode === 'FORM_VALIDATION_ERROR') return validationTitleFor(state);
    return 'Editable form';
  }

  function bodyModeLabel(mode, state) {
    if (mode === 'CONFIRMED_RESULT') return 'Confirmed';
    if (mode === 'RECONCILIATION_FACTS') return 'Reconciling';
    if (mode === 'APPROVAL_REQUESTED') return 'Approval requested';
    if (mode === 'APPROVAL_PENDING') return 'Approval pending';
    if (mode === 'APPROVAL_CONFIRMED') return 'Approval confirmed';
    if (mode === 'TRANSFER_REQUESTED') return 'Transfer requested';
    if (mode === 'TRANSFER_PENDING') return 'Transfer pending';
    if (mode === 'FAILED') return 'Failed';
    if (mode === 'INTERRUPTED') return 'Interrupted';
    if (mode === 'ROUTE_ERROR') return 'Route error';
    if (mode === 'FORM_VALIDATION_ERROR') return validationTitleFor(state);
    return 'Editable form';
  }

  function errorMessageFor(state) {
    if (state.amountValidity === 'PRECISION_MISMATCH') return 'Enter an amount in whole USDC increments.';
    if (state.amountValidity === 'INVALID_CHARACTER') return 'Digits and one decimal point only.';
    if (state.amountValidity === 'BELOW_MINIMUM') return 'Amount is below the minimum transfer size.';
    if (state.execution === 'RECONCILING') return 'Waiting for final chain evidence.';
    if (state.error === 'ROUTE_ERROR') return 'Route data is unavailable or invalid.';
    if (state.error === 'FUNDING_ERROR') return 'Balance or gas readiness is insufficient.';
    if (state.error === 'WALLET_ERROR') return 'Wallet state is blocking execution.';
    if (state.error === 'EXECUTION_ERROR' && state.retryability === 'RETRYABLE') return 'Execution can be retried with a new request.';
    if (state.error === 'EXECUTION_ERROR' && state.retryability === 'NON_RETRYABLE') return 'Execution is finalized and not retryable.';
    return '—';
  }

  function transitionView(fixture, view) {
    var next = JSON.parse(JSON.stringify(fixture));
    if (next.state) next.state.view = view;
    return next;
  }

  function archiveEvidenceRecord(state, values) {
    var finalized = state.receipt === 'FINAL' && state.receiptOutcome !== 'NONE' && state.receiptOutcome !== 'unknown';
    return {
      intentId: state.activeIntentId || null,
      attemptId: state.activeAttemptId || null,
      receipt: state.receipt,
      receiptOutcome: state.receiptOutcome,
      finalized: finalized,
      transferHash: hasOwn(values, 'transferHash') ? values.transferHash : null,
      evidence: values.receiptEvidence || null,
    };
  }

  function clearAmountFields(state, values) {
    state.amountText = 'EMPTY';
    state.amountValidity = 'UNKNOWN';
    delete values.amountInput;
    values.amountUnits = null;
    values.feeUnits = null;
    values.totalUnits = null;
  }

  function clearAttemptArtifacts(values) {
    delete values.approvalHash;
    delete values.transferHash;
    delete values.receiptEvidence;
    delete values.reconciliationEvidence;
  }

  function resetTransactionState(fixture, options) {
    var next = JSON.parse(JSON.stringify(fixture));
    var state = next.state;
    var values = next.values || {};
    var archivedEvidence = [];
    var preserveTransactionFacts = options && options.preserveTransactionFacts === true;
    var preserveView = options && options.preserveView !== false;
    var preserveRoute = options && options.preserveRoute !== false;
    var nextIntentId = options && options.nextIntentId;
    var nextAttemptId = options && options.nextAttemptId;

    if (state.receipt !== 'NONE' || state.receiptOutcome !== 'NONE') {
      archivedEvidence.push(archiveEvidenceRecord(state, values));
    }

    if (hasValue(nextIntentId)) state.activeIntentId = nextIntentId;
    if (hasValue(nextAttemptId)) state.activeAttemptId = nextAttemptId;

    if (!preserveTransactionFacts) {
      clearAmountFields(state, values);
    }
    if (options && options.clearAttemptArtifacts) clearAttemptArtifacts(values);

    state.execution = options && options.execution ? options.execution : 'IDLE';
    state.receipt = options && options.receipt ? options.receipt : 'NONE';
    state.receiptOutcome = options && options.receiptOutcome ? options.receiptOutcome : 'NONE';
    state.error = 'NONE';
    state.funding = 'UNKNOWN';
    state.allowance = 'UNKNOWN';
    state.retryability = 'UNKNOWN';
    if (state.wallet !== 'CONNECTED_READY' && state.wallet !== 'CONNECTED_WRONG_NETWORK') state.wallet = 'DISCONNECTED';
    if (!preserveView && state.view) state.view = 'EXPANDED';
    if (!preserveRoute) {
      state.routeAvailability = 'AVAILABLE';
      state.routeValidity = 'VALID';
      state.routeMutability = 'LOCKED';
    }
    values.recheckRequired = ['allowance', 'balance', 'gasReadiness', 'network'];
    values.invalidatedEventIntentId = fixture.state.activeIntentId || null;
    values.invalidatedEventAttemptId = fixture.state.activeAttemptId || null;
    values.archivedEvidence = (values.archivedEvidence || []).concat(archivedEvidence);
    next.values = values;
    return next;
  }

  function evaluatePostconditions(contract, action, beforeState, beforeValues, afterState, afterValues, archivedEvidence, payload) {
    var ruleIds = (contract.state.transitionPostconditions || {})[action] || [];
    var errors = [];
    var context = {
      beforeState: beforeState,
      beforeValues: beforeValues || {},
      afterState: afterState,
      afterValues: afterValues || {},
      archivedEvidence: archivedEvidence || [],
      payload: payload || {},
      action: action,
    };
    ruleIds.forEach(function (ruleId) {
      var handler = POSTCONDITION_HANDLERS[ruleId];
      if (!handler) {
        errors.push('unknown postcondition rule: ' + ruleId);
        return;
      }
      errors = errors.concat(handler(context));
    });
    return { allowed: errors.length === 0, errors: errors };
  }

  function applyTransition(contract, action, state, values, payload) {
    var transition = evaluateTransition(contract, action, state, values, payload);
    if (!transition.allowed) {
      return {
        allowed: false,
        errors: transition.errors,
        nextState: state,
        nextValues: values,
        archivedEvidence: [],
        postconditionErrors: [],
      };
    }

    var nextState = JSON.parse(JSON.stringify(state));
    var nextValues = JSON.parse(JSON.stringify(values || {}));
    var archivedEvidence = [];
    var postconditionErrors = [];
    var newIntentId = payload && payload.newIntentId;
    var newAttemptId = payload && payload.newAttemptId;

    if (action === 'EXPAND') {
      nextState.view = 'EXPANDED';
    } else if (action === 'COLLAPSE') {
      nextState.view = 'COLLAPSED';
    } else if (action === 'RESET') {
      var reset = resetTransactionState({ state: nextState, values: nextValues }, {
        nextIntentId: newIntentId,
        preserveView: true,
        preserveRoute: true,
        clearAttemptArtifacts: true,
        execution: 'IDLE',
        receipt: 'NONE',
        receiptOutcome: 'NONE',
      });
      nextState = reset.state;
      nextValues = reset.values;
      archivedEvidence = nextValues.archivedEvidence || [];
    } else if (action === 'NEW_TRANSACTION') {
      var blank = resetTransactionState({ state: nextState, values: nextValues }, {
        nextIntentId: newIntentId || String(state.activeIntentId || 'intent') + '-new',
        preserveView: true,
        preserveRoute: true,
        clearAttemptArtifacts: true,
        execution: 'IDLE',
        receipt: 'NONE',
        receiptOutcome: 'NONE',
      });
      nextState = blank.state;
      nextValues = blank.values;
      archivedEvidence = nextValues.archivedEvidence || [];
    } else if (action === 'RETRY') {
      var retry = resetTransactionState({ state: nextState, values: nextValues }, {
        nextIntentId: state.activeIntentId,
        nextAttemptId: newAttemptId || String(state.activeAttemptId || state.activeIntentId || 'attempt') + '-retry',
        preserveTransactionFacts: true,
        preserveView: true,
        preserveRoute: true,
        clearAttemptArtifacts: true,
        execution: 'PREVIEW_READY',
        receipt: 'NONE',
        receiptOutcome: 'NONE',
      });
      nextState = retry.state;
      nextValues = retry.values;
      archivedEvidence = nextValues.archivedEvidence || [];
      nextState.funding = 'UNKNOWN';
      nextState.allowance = 'UNKNOWN';
      nextState.retryability = 'UNKNOWN';
      nextValues.recheckRequired = ['allowance', 'balance', 'gasReadiness', 'network'];
    } else if (action === 'CONNECT') {
      nextState.wallet = 'CONNECTING';
    } else if (action === 'SWITCH_NETWORK') {
      nextState.wallet = 'CONNECTED_READY';
      nextState.networkSupport = 'SUPPORTED';
      nextState.tokenSupport = 'SUPPORTED';
    } else if (action === 'REQUEST_APPROVAL') {
      nextState.execution = 'APPROVAL_REQUESTED';
      nextState.retryability = 'UNKNOWN';
    } else if (action === 'REQUEST_TRANSFER') {
      nextState.execution = 'TRANSFER_REQUESTED';
      nextState.retryability = 'UNKNOWN';
    } else {
      return {
        allowed: false,
        errors: ['unhandled transition action: ' + action],
        nextState: state,
        nextValues: values,
        archivedEvidence: [],
        postconditionErrors: [],
      };
    }

    var post = evaluatePostconditions(contract, action, state, values || {}, nextState, nextValues, archivedEvidence, payload || {});
    if (!post.allowed) postconditionErrors = post.errors.slice();
    return {
      allowed: transition.allowed && postconditionErrors.length === 0,
      errors: transition.errors,
      nextState: nextState,
      nextValues: nextValues,
      archivedEvidence: archivedEvidence,
      postconditionErrors: postconditionErrors,
    };
  }

  return {
    calculateFeeUnits: calculateFeeUnits,
    calculateTotalUnits: calculateTotalUnits,
    classifyAmountText: classifyAmountText,
    evaluateEvent: evaluateEvent,
    evaluateState: evaluateState,
    evaluateTransition: evaluateTransition,
    applyTransition: applyTransition,
    expectedGeometry: expectedGeometry,
    formatUnits: formatUnits,
    hasValue: hasValue,
    isStateFixture: isStateFixture,
    middleTruncate: middleTruncate,
    normalizeAmountText: normalizeAmountText,
    parseAmountUnits: parseAmountUnits,
    resetFixture: resetTransactionState,
    scaleFor: scaleFor,
    selectors: selectors,
    bodyModel: bodyModel,
    transitionView: transitionView,
    validateContract: validateContract,
    validateAmountUnits: validateAmountUnits,
    validateTransferPrecision: validateTransferPrecision,
  };
});
