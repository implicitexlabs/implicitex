/**
 * portal-view-projection.js
 *
 * Non-destructive projection harness for portal presentation state.
 * Projects Portal View State V1 onto the portal root as document metadata only.
 */

(function () {
  'use strict';

  var MARKER_PRIMARY = 'data-portal-primary-destination';
  var MARKER_LAYER = 'data-portal-contextual-layer';
  var root = null;
  var currentState = null;

  function fail(reason) {
    var error = new Error(reason);
    error.code = reason;
    throw error;
  }

  function requireViewStateApi() {
    var api = window.IX_PORTAL_VIEW_STATE;

    if (!api || typeof api !== 'object') {
      fail('portal-view-state-authority-missing');
    }

    if (
      typeof api.createDefaultState !== 'function'
      || typeof api.normalizeState !== 'function'
      || typeof api.setPrimaryDestination !== 'function'
      || typeof api.openContextualLayer !== 'function'
      || typeof api.closeContextualLayer !== 'function'
    ) {
      fail('portal-view-state-authority-malformed');
    }

    return api;
  }

  function getPortalRoot() {
    var candidate = document.getElementById('modules');
    return candidate || document.documentElement;
  }

  function contextualLayerValue(state) {
    return state.contextualLayer === null ? 'NONE' : state.contextualLayer;
  }

  function projectState(state) {
    var nextPrimary = state.primaryDestination;
    var nextLayer = contextualLayerValue(state);

    if (root.getAttribute(MARKER_PRIMARY) !== nextPrimary) {
      root.setAttribute(MARKER_PRIMARY, nextPrimary);
    }

    if (root.getAttribute(MARKER_LAYER) !== nextLayer) {
      root.setAttribute(MARKER_LAYER, nextLayer);
    }
  }

  var viewStateApi = requireViewStateApi();
  currentState = viewStateApi.normalizeState(viewStateApi.createDefaultState());
  root = getPortalRoot();
  projectState(currentState);

  function getState() {
    return viewStateApi.normalizeState(currentState);
  }

  function setPrimaryDestination(primaryDestination) {
    currentState = viewStateApi.setPrimaryDestination(currentState, primaryDestination);
    projectState(currentState);
    return getState();
  }

  function openContextualLayer(contextualLayer) {
    currentState = viewStateApi.openContextualLayer(currentState, contextualLayer);
    projectState(currentState);
    return getState();
  }

  function closeContextualLayer() {
    currentState = viewStateApi.closeContextualLayer(currentState);
    projectState(currentState);
    return getState();
  }

  function projectCurrentState() {
    currentState = viewStateApi.normalizeState(currentState);
    projectState(currentState);
    return getState();
  }

  window.IX_PORTAL_VIEW_PROJECTION = Object.freeze({
    MARKERS: Object.freeze({
      PRIMARY_DESTINATION: MARKER_PRIMARY,
      CONTEXTUAL_LAYER: MARKER_LAYER,
      CONTEXTUAL_LAYER_NONE: 'NONE',
    }),
    getState: getState,
    setPrimaryDestination: setPrimaryDestination,
    openContextualLayer: openContextualLayer,
    closeContextualLayer: closeContextualLayer,
    projectCurrentState: projectCurrentState,
  });
})();
