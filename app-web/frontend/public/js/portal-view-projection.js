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
  var MARKER_NONE = 'NONE';
  var PROJECTION_TARGET_ID = 'modules';

  var currentState = null;
  var viewStateApi = null;

  function fail(code, cause) {
    var error = new Error(code);
    error.code = code;

    if (typeof cause !== 'undefined') {
      try {
        error.cause = cause;
      } catch (assignmentError) {
        // Ignore environments that do not permit assigning cause.
      }
    }

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

  function getProjectionTarget() {
    var candidate = document.getElementById(PROJECTION_TARGET_ID);
    return candidate || document.documentElement;
  }

  function contextualLayerValue(state) {
    return state.contextualLayer === null ? MARKER_NONE : state.contextualLayer;
  }

  function captureMarkerSnapshot(target, name, desiredValue) {
    var existed = target.hasAttribute(name);
    var priorValue = existed ? target.getAttribute(name) : null;

    return {
      name: name,
      existed: existed,
      priorValue: priorValue,
      desiredValue: desiredValue,
      needsWrite: !existed || priorValue !== desiredValue,
    };
  }

  function buildProjectionPlan(target, nextState) {
    return [
      captureMarkerSnapshot(target, MARKER_PRIMARY, nextState.primaryDestination),
      captureMarkerSnapshot(target, MARKER_LAYER, contextualLayerValue(nextState)),
    ];
  }

  function didWriteApply(target, snapshot) {
    return target.hasAttribute(snapshot.name) && target.getAttribute(snapshot.name) === snapshot.desiredValue;
  }

  function restoreMarkerSnapshot(target, snapshot) {
    if (snapshot.existed) {
      target.setAttribute(snapshot.name, snapshot.priorValue);
      return;
    }

    target.removeAttribute(snapshot.name);
  }

  function rollbackProjectionPlan(target, applied) {
    var rollbackError = null;
    var i;

    for (i = applied.length - 1; i >= 0; i -= 1) {
      try {
        restoreMarkerSnapshot(target, applied[i]);
      } catch (error) {
        if (!rollbackError) {
          rollbackError = error;
        }
      }
    }

    return rollbackError;
  }

  function applyProjectionTransaction(target, plan) {
    var applied = [];
    var i;

    try {
      for (i = 0; i < plan.length; i += 1) {
        if (!plan[i].needsWrite) {
          continue;
        }

        try {
          target.setAttribute(plan[i].name, plan[i].desiredValue);
        } catch (error) {
          if (!didWriteApply(target, plan[i])) {
            throw error;
          }

          applied.push(plan[i]);
          throw error;
        }

        applied.push(plan[i]);
      }
    } catch (forwardError) {
      var rollbackError = rollbackProjectionPlan(target, applied);

      if (rollbackError) {
        var rollbackFailure = new Error('portal-view-projection-rollback-failed');
        rollbackFailure.code = 'portal-view-projection-rollback-failed';
        rollbackFailure.cause = rollbackError;
        rollbackFailure.forwardCause = forwardError;
        throw rollbackFailure;
      }

      var transactionFailure = new Error('portal-view-projection-transaction-failed');
      transactionFailure.code = 'portal-view-projection-transaction-failed';
      transactionFailure.cause = forwardError;
      throw transactionFailure;
    }
  }

  function getState() {
    return viewStateApi.normalizeState(currentState);
  }

  function commitProjectionTransition(nextState, commitState) {
    var target = getProjectionTarget();
    var plan = buildProjectionPlan(target, nextState);

    applyProjectionTransaction(target, plan);

    if (commitState) {
      currentState = nextState;
    }

    return getState();
  }

  function setPrimaryDestination(primaryDestination) {
    var nextState = viewStateApi.setPrimaryDestination(currentState, primaryDestination);
    return commitProjectionTransition(nextState, true);
  }

  function openContextualLayer(contextualLayer) {
    var nextState = viewStateApi.openContextualLayer(currentState, contextualLayer);
    return commitProjectionTransition(nextState, true);
  }

  function closeContextualLayer() {
    var nextState = viewStateApi.closeContextualLayer(currentState);
    return commitProjectionTransition(nextState, true);
  }

  function projectCurrentState() {
    return commitProjectionTransition(currentState, false);
  }

  viewStateApi = requireViewStateApi();
  currentState = null;
  (function initializeProjection() {
    var initialState = viewStateApi.normalizeState(viewStateApi.createDefaultState());
    var target = getProjectionTarget();
    var plan = buildProjectionPlan(target, initialState);

    applyProjectionTransaction(target, plan);
    currentState = initialState;
  })();

  window.IX_PORTAL_VIEW_PROJECTION = Object.freeze({
    MARKERS: Object.freeze({
      PRIMARY_DESTINATION: MARKER_PRIMARY,
      CONTEXTUAL_LAYER: MARKER_LAYER,
      CONTEXTUAL_LAYER_NONE: MARKER_NONE,
    }),
    getState: getState,
    setPrimaryDestination: setPrimaryDestination,
    openContextualLayer: openContextualLayer,
    closeContextualLayer: closeContextualLayer,
    projectCurrentState: projectCurrentState,
  });
})();
