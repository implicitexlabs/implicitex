/**
 * portal-view-state.js
 *
 * Presentation-only view state for the transfer portal.
 * It does not read, derive, persist, or mutate transaction, wallet,
 * Coin Card, receipt, storage, URL, or execution state.
 */

(function () {
  'use strict';

  var PRIMARY_DESTINATIONS = Object.freeze({
    TRANSFER: 'TRANSFER',
    RECIPIENTS: 'RECIPIENTS',
    ACTIVITY: 'ACTIVITY',
  });

  var CONTEXTUAL_LAYERS = Object.freeze({
    VERIFICATION: 'VERIFICATION',
    SYSTEM: 'SYSTEM',
  });

  var DEFAULT_STATE = freezeState({
    primaryDestination: PRIMARY_DESTINATIONS.TRANSFER,
    contextualLayer: null,
  });

  function fail(reason) {
    var error = new Error(reason);
    error.code = reason;
    throw error;
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function getOwnDataPropertyNames(value) {
    var names = Object.getOwnPropertyNames(value);
    var result = [];

    for (var i = 0; i < names.length; i += 1) {
      var descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
      if (!descriptor || descriptor.get || descriptor.set) {
        fail('portal-view-state-invalid');
      }

      result.push(names[i]);
    }

    return result.sort();
  }

  function isPrimaryDestination(value) {
    return value === PRIMARY_DESTINATIONS.TRANSFER
      || value === PRIMARY_DESTINATIONS.RECIPIENTS
      || value === PRIMARY_DESTINATIONS.ACTIVITY;
  }

  function isContextualLayer(value) {
    return value === CONTEXTUAL_LAYERS.VERIFICATION
      || value === CONTEXTUAL_LAYERS.SYSTEM;
  }

  function freezeState(state) {
    return Object.freeze({
      primaryDestination: state.primaryDestination,
      contextualLayer: state.contextualLayer,
    });
  }

  function normalizeState(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      fail('portal-view-state-invalid');
    }

    if (Object.getPrototypeOf(state) !== Object.prototype) {
      fail('portal-view-state-invalid');
    }

    if (Object.getOwnPropertySymbols(state).length !== 0) {
      fail('portal-view-state-invalid');
    }

    var names = getOwnDataPropertyNames(state);
    if (
      names.length !== 2
      || names[0] !== 'contextualLayer'
      || names[1] !== 'primaryDestination'
      || !hasOwn(state, 'primaryDestination')
      || !hasOwn(state, 'contextualLayer')
    ) {
      fail('portal-view-state-invalid');
    }

    if (!isPrimaryDestination(state.primaryDestination)) {
      fail('portal-view-state-invalid');
    }

    if (state.contextualLayer !== null && !isContextualLayer(state.contextualLayer)) {
      fail('portal-view-state-invalid');
    }

    return freezeState(state);
  }

  function createDefaultState() {
    return freezeState(DEFAULT_STATE);
  }

  function setPrimaryDestination(state, primaryDestination) {
    var normalized = normalizeState(state);

    if (!isPrimaryDestination(primaryDestination)) {
      fail('portal-primary-destination-invalid');
    }

    return freezeState({
      primaryDestination: primaryDestination,
      contextualLayer: normalized.contextualLayer,
    });
  }

  function openContextualLayer(state, contextualLayer) {
    var normalized = normalizeState(state);

    if (!isContextualLayer(contextualLayer)) {
      fail('portal-contextual-layer-invalid');
    }

    return freezeState({
      primaryDestination: normalized.primaryDestination,
      contextualLayer: contextualLayer,
    });
  }

  function closeContextualLayer(state) {
    var normalized = normalizeState(state);

    return freezeState({
      primaryDestination: normalized.primaryDestination,
      contextualLayer: null,
    });
  }

  window.IX_PORTAL_VIEW_STATE = Object.freeze({
    PRIMARY_DESTINATIONS: PRIMARY_DESTINATIONS,
    CONTEXTUAL_LAYERS: CONTEXTUAL_LAYERS,
    DEFAULT_STATE: DEFAULT_STATE,
    createDefaultState: createDefaultState,
    normalizeState: normalizeState,
    setPrimaryDestination: setPrimaryDestination,
    openContextualLayer: openContextualLayer,
    closeContextualLayer: closeContextualLayer,
  });
})();
