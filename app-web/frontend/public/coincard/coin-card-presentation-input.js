(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.CoinCardPresentationInput = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SCHEMA = 'implicitex.coin-card.presentation-input.v1';

  var VIEW_MODES = ['BADGE', 'INSPECT', 'TRANSACT', 'SETTLE'];
  var ROUTE_STATES = ['UNKNOWN', 'VERIFIED', 'REVOKED', 'UNAVAILABLE'];
  var PROVIDER_STATES = ['AVAILABLE', 'UNAVAILABLE'];
  var WALLET_STATES = ['DISCONNECTED', 'CONNECTING', 'CONNECTED'];
  var NETWORK_STATES = ['UNKNOWN', 'EXPECTED', 'WRONG'];
  var AMOUNT_STATES = ['EMPTY', 'PRESENT'];
  var FUNDS_STATES = ['UNKNOWN', 'SUFFICIENT', 'INSUFFICIENT'];
  var CREDENTIAL_STATES = ['OK', 'CHANGED', 'UNAVAILABLE'];
  var EXECUTION_PHASES = [
    'IDLE',
    'APPROVAL_PENDING',
    'APPROVAL_CONFIRMING',
    'APPROVAL_REJECTED',
    'TRANSFER_PENDING',
    'TRANSFER_SUBMITTED',
    'TRANSFER_REJECTED',
    'TRANSFER_FAILED',
    'CONFIRMED',
  ];

  var EXECUTION_PRESENTATION_PHASES = [
    'APPROVAL_PENDING',
    'APPROVAL_CONFIRMING',
    'APPROVAL_REJECTED',
    'TRANSFER_PENDING',
    'TRANSFER_SUBMITTED',
    'TRANSFER_REJECTED',
    'TRANSFER_FAILED',
  ];

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
  }

  function valueIn(value, values) {
    return values.indexOf(value) !== -1;
  }

  function requiredEnum(input, key, values) {
    if (!hasOwn(input, key)) {
      throw new Error('Missing Lane A presentation observation: ' + key);
    }
    var value = input[key];
    if (!valueIn(value, values)) {
      throw new Error('Unknown Lane A presentation ' + key + ': ' + value);
    }
    return value;
  }

  function preflightFrom(providerState, walletState, networkState, amountState, fundsState) {
    if (providerState === 'UNAVAILABLE') return 'NO_PROVIDER';
    if (walletState === 'CONNECTING') return 'WALLET_CONNECTING';
    if (walletState === 'DISCONNECTED') return 'WALLET_DISCONNECTED';
    if (networkState === 'UNKNOWN') return 'NETWORK_UNKNOWN';
    if (networkState === 'WRONG') return 'WRONG_NETWORK';
    if (amountState === 'EMPTY') return 'AMOUNT_EMPTY';
    if (fundsState === 'UNKNOWN') return 'FUNDS_UNKNOWN';
    if (fundsState === 'INSUFFICIENT') return 'FUNDS_INSUFFICIENT';
    return 'READY';
  }

  function executionPresentationState(executionPhase) {
    if (executionPhase === 'APPROVAL_PENDING') return 'APPROVAL_PENDING';
    if (executionPhase === 'APPROVAL_CONFIRMING') return 'APPROVAL_CONFIRMING';
    if (executionPhase === 'APPROVAL_REJECTED') return 'APPROVAL_REJECTED';
    if (executionPhase === 'TRANSFER_PENDING') return 'TRANSFER_PENDING';
    if (executionPhase === 'TRANSFER_SUBMITTED') return 'TRANSFER_SUBMITTED';
    if (executionPhase === 'TRANSFER_REJECTED') return 'TRANSFER_REJECTED';
    if (executionPhase === 'TRANSFER_FAILED') return 'TRANSFER_FAILED';
    return null;
  }

  function credentialPresentationState(credentialState) {
    if (credentialState === 'CHANGED') return 'CREDENTIAL_CHANGED';
    if (credentialState === 'UNAVAILABLE') return 'CREDENTIAL_UNAVAILABLE';
    return null;
  }

  function ambiguityFor(routeState, credentialState, providerState, walletState, executionPhase, viewMode, preflightState) {
    var ambiguity = [];
    if (providerState === 'UNAVAILABLE' && walletState === 'CONNECTED') {
      ambiguity.push('PROVIDER_UNAVAILABLE_WITH_CONNECTED_WALLET');
    }
    if (viewMode === 'SETTLE' && executionPhase !== 'CONFIRMED') {
      ambiguity.push('SETTLE_VIEW_WITHOUT_CONFIRMED_EXECUTION');
    }
    if (viewMode === 'SETTLE' && executionPhase === 'CONFIRMED' && preflightState !== 'READY') {
      ambiguity.push('SETTLED_VIEW_WITH_STALE_PREFLIGHT_FACTS');
    }
    if (viewMode !== 'SETTLE' && executionPhase === 'CONFIRMED') {
      ambiguity.push('CONFIRMED_EXECUTION_OUTSIDE_SETTLE_VIEW');
    }
    if (routeState !== 'VERIFIED' && EXECUTION_PRESENTATION_PHASES.indexOf(executionPhase) !== -1) {
      ambiguity.push('ROUTE_DEGRADED_DURING_EXECUTION');
    }
    if (credentialState !== 'OK' && EXECUTION_PRESENTATION_PHASES.indexOf(executionPhase) !== -1) {
      ambiguity.push('CREDENTIAL_ISSUE_DURING_EXECUTION');
    }
    if ((executionPhase === 'APPROVAL_REJECTED' || executionPhase === 'TRANSFER_REJECTED' || executionPhase === 'TRANSFER_FAILED') &&
        preflightState !== 'READY') {
      ambiguity.push('EXECUTION_FAILURE_WITH_CHANGED_PREFLIGHT_FACTS');
    }
    return ambiguity;
  }

  // Projection only: this function classifies facts that Lane A already knows.
  // It must not be used as an execution guard or a replacement for SEND_ENABLED_STATES.
  function normalizeLaneAPresentationInput(observation) {
    var input = observation || {};
    var viewMode = requiredEnum(input, 'viewMode', VIEW_MODES);
    var routeState = requiredEnum(input, 'routeState', ROUTE_STATES);
    var providerState = requiredEnum(input, 'providerState', PROVIDER_STATES);
    var walletState = requiredEnum(input, 'walletState', WALLET_STATES);
    var networkState = requiredEnum(input, 'networkState', NETWORK_STATES);
    var amountState = requiredEnum(input, 'amountState', AMOUNT_STATES);
    var fundsState = requiredEnum(input, 'fundsState', FUNDS_STATES);
    var credentialState = requiredEnum(input, 'credentialState', CREDENTIAL_STATES);
    var executionPhase = requiredEnum(input, 'executionPhase', EXECUTION_PHASES);
    var preflightState = preflightFrom(providerState, walletState, networkState, amountState, fundsState);
    var presentationFocus = 'PREFLIGHT';
    var presentationState = preflightState;
    var executionState = executionPresentationState(executionPhase);
    var credentialStateForPresentation = credentialPresentationState(credentialState);

    if (viewMode === 'SETTLE' && executionPhase === 'CONFIRMED') {
      presentationFocus = 'SETTLE';
      presentationState = 'CONFIRMED';
    } else if (viewMode === 'SETTLE') {
      presentationFocus = 'SETTLE';
      presentationState = 'SETTLE_VIEW';
    } else if (executionPhase === 'CONFIRMED') {
      presentationFocus = 'EXECUTION';
      presentationState = 'CONFIRMED';
    } else if (executionState) {
      presentationFocus = 'EXECUTION';
      presentationState = executionState;
    } else if (credentialStateForPresentation) {
      presentationFocus = 'CREDENTIAL';
      presentationState = credentialStateForPresentation;
    } else if (routeState === 'UNKNOWN' || routeState === 'REVOKED' || routeState === 'UNAVAILABLE') {
      presentationFocus = 'ROUTE';
      presentationState = routeState;
    }

    return {
      schema: SCHEMA,
      viewMode: viewMode,
      routeState: routeState,
      providerState: providerState,
      walletState: walletState,
      networkState: networkState,
      amountState: amountState,
      fundsState: fundsState,
      credentialState: credentialState,
      executionPhase: executionPhase,
      preflightState: preflightState,
      presentationFocus: presentationFocus,
      presentationState: presentationState,
      ambiguity: ambiguityFor(routeState, credentialState, providerState, walletState, executionPhase, viewMode, preflightState),
    };
  }

  return {
    normalizeLaneAPresentationInput: normalizeLaneAPresentationInput,
  };
});
