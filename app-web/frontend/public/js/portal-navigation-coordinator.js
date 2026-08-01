/**
 * portal-navigation-coordinator.js
 *
 * Portal primary-destination navigation coordinator.
 * Presentation only: selected state, focus, and cross-authority compensation.
 */

(function () {
  'use strict';

  var MODULES_ID = 'modules';
  var NAV_ID = 'portalPrimaryNav';
  var STATUS_ID = 'portalPrimaryNavStatus';
  var NAV_LABEL = 'Portal destinations';

  var DESTINATIONS = ['TRANSFER', 'RECIPIENTS', 'ACTIVITY'];
  var DESTINATION_BUTTON_IDS = {
    TRANSFER: 'portalNavTransfer',
    RECIPIENTS: 'portalNavRecipients',
    ACTIVITY: 'portalNavActivity',
  };
  var DESTINATION_LABELS = {
    TRANSFER: 'Transfer',
    RECIPIENTS: 'Recipients',
    ACTIVITY: 'Activity',
  };

  var ERROR_CODES = {
    AUTHORITY_MISSING: 'portal-navigation-authority-missing',
    AUTHORITY_MALFORMED: 'portal-navigation-authority-malformed',
    STRUCTURE_INVALID: 'portal-navigation-structure-invalid',
    STATE_CONFLICT: 'portal-navigation-state-conflict',
    INITIALIZATION_FAILED: 'portal-navigation-initialization-failed',
    DESTINATION_INVALID: 'portal-navigation-destination-invalid',
    UNAVAILABLE: 'portal-navigation-unavailable',
    TRANSITION_IN_PROGRESS: 'portal-navigation-transition-in-progress',
    SELECTED_STATE_FAILED: 'portal-navigation-selected-state-failed',
    TRANSITION_FAILED: 'portal-navigation-transition-failed',
    COMPENSATION_FAILED: 'portal-navigation-compensation-failed',
  };

  var NAV_STATUS_RECOVERABLE = 'Couldn’t switch views. Your previous view remains active.';
  var NAV_STATUS_COMPENSATION = 'Couldn’t confirm the active view. Navigation has been disabled.';

  var available = false;
  var transitioning = false;
  var lastErrorCode = null;
  var initializationAttempted = false;

  var projectionApi = null;
  var registryApi = null;
  var controllerApi = null;

  var navigationRefs = null;
  var handlersAttached = false;

  function createError(code, cause) {
    var error = new Error(code);
    error.code = code;

    if (typeof cause !== 'undefined') {
      try {
        error.cause = cause;
      } catch (assignmentError) {
        // Ignore environments that do not permit writing cause.
      }
    }

    return error;
  }

  function fail(code, cause) {
    throw createError(code, cause);
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function getByIdOrFail(id, code) {
    var element = document.getElementById(id);

    if (!element || element.id !== id) {
      fail(code);
    }

    return element;
  }

  function getChildren(element) {
    if (!element) return [];

    if (element.children && typeof element.children.length === 'number') {
      return Array.prototype.slice.call(element.children);
    }

    if (element.childNodes && typeof element.childNodes.length === 'number') {
      return Array.prototype.slice.call(element.childNodes).filter(function (node) {
        return node && node.nodeType === 1;
      });
    }

    return [];
  }

  function isDescendantOf(element, ancestor) {
    var current = element;

    while (current) {
      if (current === ancestor) {
        return true;
      }

      current = current.parentNode || null;
    }

    return false;
  }

  function requireFrozenApi(api, methodNames, code) {
    if (!api || typeof api !== 'object' || !Object.isFrozen(api)) {
      fail(code);
    }

    for (var i = 0; i < methodNames.length; i += 1) {
      if (typeof api[methodNames[i]] !== 'function') {
        fail(code);
      }
    }
  }

  function requireProjectionApi() {
    var api = window.IX_PORTAL_VIEW_PROJECTION;

    requireFrozenApi(api, [
      'getState',
      'setPrimaryDestination',
      'openContextualLayer',
      'closeContextualLayer',
      'projectCurrentState',
    ], ERROR_CODES.AUTHORITY_MALFORMED);

    if (!api.MARKERS || !Object.isFrozen(api.MARKERS)) {
      fail(ERROR_CODES.AUTHORITY_MALFORMED);
    }

    return api;
  }

  function requireRegistryApi() {
    var api = window.IX_PORTAL_SURFACE_REGISTRY;

    requireFrozenApi(api, [
      'validate',
      'getPrimarySurfaceRegistrations',
      'getContextualSurfaceRegistrations',
      'getGlobalSurfaceRegistrations',
      'getRegistrationSnapshot',
    ], ERROR_CODES.AUTHORITY_MALFORMED);

    return api;
  }

  function requireControllerApi() {
    var api = window.IX_PORTAL_VISIBILITY_CONTROLLER;

    requireFrozenApi(api, ['apply', 'restore', 'getStatus'], ERROR_CODES.AUTHORITY_MALFORMED);

    return api;
  }

  function readProjectedDestinationSafely() {
    if (!projectionApi) return null;

    try {
      var state = projectionApi.getState();
      return state && typeof state === 'object' ? state.primaryDestination : null;
    } catch (error) {
      return null;
    }
  }

  function getNavigationRefs(options) {
    var requireInitialPresentation = !options || options.requireInitialPresentation !== false;
    var modules = getByIdOrFail(MODULES_ID, ERROR_CODES.STRUCTURE_INVALID);
    var nav = getByIdOrFail(NAV_ID, ERROR_CODES.STRUCTURE_INVALID);
    var status = getByIdOrFail(STATUS_ID, ERROR_CODES.STRUCTURE_INVALID);
    var projectedDestination = readProjectedDestinationSafely();
    var buttons = [];
    var currentCurrentCount = 0;
    var currentCurrentButton = null;

    if ((nav.tagName || nav.nodeName || '').toUpperCase() !== 'NAV') {
      fail(ERROR_CODES.STRUCTURE_INVALID);
    }

    if ((status.tagName || status.nodeName || '').toUpperCase() !== 'P') {
      fail(ERROR_CODES.STRUCTURE_INVALID);
    }

    if (nav.getAttribute('aria-label') !== NAV_LABEL) {
      fail(ERROR_CODES.STRUCTURE_INVALID);
    }

    if (requireInitialPresentation) {
      if (!nav.hasAttribute('hidden') || !status.hasAttribute('hidden')) {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      if (status.textContent !== '') {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }
    }

    if (status.getAttribute('role') !== 'status' || status.getAttribute('aria-live') !== 'polite') {
      fail(ERROR_CODES.STRUCTURE_INVALID);
    }

    if (
      nav.hasAttribute('data-portal-primary-surface')
      || nav.hasAttribute('data-portal-contextual-surface')
      || nav.hasAttribute('data-portal-global-surface')
      || status.hasAttribute('data-portal-primary-surface')
      || status.hasAttribute('data-portal-contextual-surface')
      || status.hasAttribute('data-portal-global-surface')
    ) {
      fail(ERROR_CODES.STRUCTURE_INVALID);
    }

    for (var i = 0; i < DESTINATIONS.length; i += 1) {
      var destination = DESTINATIONS[i];
      var buttonId = DESTINATION_BUTTON_IDS[destination];
      var button = getByIdOrFail(buttonId, ERROR_CODES.STRUCTURE_INVALID);

      if (button.parentNode !== nav) {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      if ((button.tagName || button.nodeName || '').toUpperCase() !== 'BUTTON') {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      if (button.getAttribute('type') !== 'button') {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      if (button.getAttribute('data-portal-navigation-destination') !== destination) {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      if (button.textContent !== DESTINATION_LABELS[destination]) {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      if (
        button.hasAttribute('data-portal-primary-surface')
        || button.hasAttribute('data-portal-contextual-surface')
        || button.hasAttribute('data-portal-global-surface')
      ) {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      if (button.getAttribute('aria-current') === 'page') {
        currentCurrentCount += 1;
        currentCurrentButton = button;
      } else if (button.hasAttribute('aria-current')) {
        fail(ERROR_CODES.STRUCTURE_INVALID);
      }

      buttons.push(button);
    }

    if (nav.children.length !== 3 || buttons.length !== 3) {
      fail(ERROR_CODES.STRUCTURE_INVALID);
    }

    if (currentCurrentCount !== 1) {
      fail(ERROR_CODES.STRUCTURE_INVALID);
    }

    if (!projectedDestination || currentCurrentButton.getAttribute('data-portal-navigation-destination') !== projectedDestination) {
      fail(ERROR_CODES.STATE_CONFLICT);
    }

    navigationRefs = {
      modules: modules,
      nav: nav,
      status: status,
      buttons: buttons,
    };

    return navigationRefs;
  }

  function attachHandlers(buttons) {
    if (handlersAttached) {
      return;
    }

    for (var i = 0; i < buttons.length; i += 1) {
      (function (button) {
        var destination = button.getAttribute('data-portal-navigation-destination');
        button.addEventListener('click', function (event) {
          if (event && typeof event.preventDefault === 'function') {
            event.preventDefault();
          }

          try {
            selectPrimaryDestination(destination);
          } catch (error) {
            // The coordinator already records status and lifecycle failure.
          }
        });
      }(buttons[i]));
    }

    handlersAttached = true;
  }

  function showStatus(region, text) {
    region.textContent = text;
    region.hidden = false;
    region.removeAttribute('hidden');
  }

  function hideStatus(region) {
    region.textContent = '';
    region.hidden = true;
    region.setAttribute('hidden', '');
  }

  function hideNavigation(nav) {
    nav.hidden = true;
    nav.setAttribute('hidden', '');
  }

  function showNavigation(nav) {
    nav.hidden = false;
    nav.removeAttribute('hidden');
  }

  function getButtonForDestination(buttons, destination) {
    for (var i = 0; i < buttons.length; i += 1) {
      if (buttons[i].getAttribute('data-portal-navigation-destination') === destination) {
        return buttons[i];
      }
    }

    return null;
  }

  function captureSelectedState(buttons) {
    var snapshot = [];

    for (var i = 0; i < buttons.length; i += 1) {
      var button = buttons[i];
      var existed = button.hasAttribute('aria-current');

      snapshot.push({
        button: button,
        existed: existed,
        priorValue: existed ? button.getAttribute('aria-current') : null,
      });
    }

    return snapshot;
  }

  function restoreSelectedState(snapshot) {
    var rollbackError = null;

    for (var i = snapshot.length - 1; i >= 0; i -= 1) {
      try {
        if (snapshot[i].existed) {
          snapshot[i].button.setAttribute('aria-current', snapshot[i].priorValue);
        } else {
          snapshot[i].button.removeAttribute('aria-current');
        }
      } catch (error) {
        if (!rollbackError) {
          rollbackError = error;
        }
      }
    }

    return rollbackError;
  }

  function applySelectedState(buttons, destination) {
    var plan = [];
    var applied = [];

    for (var i = 0; i < buttons.length; i += 1) {
      var button = buttons[i];
      var selected = button.getAttribute('data-portal-navigation-destination') === destination;
      var existed = button.hasAttribute('aria-current');
      var priorValue = existed ? button.getAttribute('aria-current') : null;
      var desiredValue = selected ? 'page' : null;
      var needsWrite = selected ? priorValue !== 'page' : existed;

      plan.push({
        button: button,
        existed: existed,
        priorValue: priorValue,
        desiredValue: desiredValue,
        needsWrite: needsWrite,
      });
    }

    try {
      for (i = 0; i < plan.length; i += 1) {
        if (!plan[i].needsWrite) {
          continue;
        }

        if (plan[i].desiredValue === 'page') {
          plan[i].button.setAttribute('aria-current', 'page');
        } else {
          plan[i].button.removeAttribute('aria-current');
        }

        applied.push(plan[i]);
      }
    } catch (forwardError) {
      var rollbackError = restoreSelectedState(applied);

      if (rollbackError) {
        throw createError(ERROR_CODES.COMPENSATION_FAILED, rollbackError);
      }

      throw createError(ERROR_CODES.SELECTED_STATE_FAILED, forwardError);
    }
  }

  function restoreProjection(snapshot) {
    return projectionApi.setPrimaryDestination(snapshot.primaryDestination);
  }

  function restoreController(statusSnapshot, projectionSnapshot) {
    if (!statusSnapshot || statusSnapshot.activated === false) {
      return controllerApi.restore();
    }

    return controllerApi.apply(projectionSnapshot);
  }

  function setInitializationFailureState(refs, code, showCompensation) {
    available = false;
    transitioning = false;
    lastErrorCode = code;

    if (refs && refs.nav) {
      hideNavigation(refs.nav);
    }

    if (refs && refs.status) {
      if (showCompensation) {
        showStatus(refs.status, NAV_STATUS_COMPENSATION);
      } else {
        hideStatus(refs.status);
      }
    }
  }

  function initializeCoordinator() {
    if (initializationAttempted) {
      return;
    }

    initializationAttempted = true;

    var refs = null;
    var initialProjectionSnapshot = null;
    var initialControllerStatus = null;
    var initError = null;
    var initFailureCode = ERROR_CODES.INITIALIZATION_FAILED;
    var showCompensationStatus = false;

    try {
      projectionApi = requireProjectionApi();
      registryApi = requireRegistryApi();
      controllerApi = requireControllerApi();

      registryApi.validate();
      refs = getNavigationRefs({ requireInitialPresentation: true });
      attachHandlers(refs.buttons);

      initialProjectionSnapshot = projectionApi.getState();
      initialControllerStatus = controllerApi.getStatus();

      if (!initialProjectionSnapshot || !initialProjectionSnapshot.primaryDestination) {
        fail(ERROR_CODES.STATE_CONFLICT);
      }

      if (getButtonForDestination(refs.buttons, initialProjectionSnapshot.primaryDestination).getAttribute('aria-current') !== 'page') {
        fail(ERROR_CODES.STATE_CONFLICT);
      }

      controllerApi.apply(initialProjectionSnapshot);

      hideStatus(refs.status);
      showNavigation(refs.nav);
      available = true;
      transitioning = false;
      lastErrorCode = null;
    } catch (error) {
      initError = error;

      try {
        if (controllerApi && initialControllerStatus) {
          restoreController(initialControllerStatus, initialProjectionSnapshot);
        }
      } catch (restoreError) {
        showCompensationStatus = true;
        initError = restoreError;
        initFailureCode = ERROR_CODES.COMPENSATION_FAILED;
      }

      setInitializationFailureState(refs, initFailureCode, showCompensationStatus);

      if (initFailureCode === ERROR_CODES.COMPENSATION_FAILED) {
        lastErrorCode = ERROR_CODES.COMPENSATION_FAILED;
      } else {
        lastErrorCode = ERROR_CODES.INITIALIZATION_FAILED;
      }

      if (initError && initError.code === ERROR_CODES.COMPENSATION_FAILED) {
        lastErrorCode = ERROR_CODES.COMPENSATION_FAILED;
      }
    }
  }

  function getStatus() {
    return Object.freeze({
      available: available,
      transitioning: transitioning,
      primaryDestination: readProjectedDestinationSafely(),
      lastErrorCode: lastErrorCode,
    });
  }

  function completeRecoverableFailure(refs, priorProjectionSnapshot, priorControllerStatus, priorSelectedState, forwardError) {
    var compensationErrors = [];
    var compensationError = null;

    if (priorProjectionSnapshot) {
      try {
        restoreProjection(priorProjectionSnapshot);
      } catch (projectionError) {
        compensationErrors.push(projectionError);
      }
    }

    try {
      restoreController(priorControllerStatus, priorProjectionSnapshot);
    } catch (controllerError) {
      compensationErrors.push(controllerError);
    }

    try {
      compensationError = restoreSelectedState(priorSelectedState);
    } catch (selectedStateRestoreError) {
      compensationError = selectedStateRestoreError;
    }

    if (compensationError) {
      compensationErrors.push(compensationError);
    }

    if (compensationErrors.length > 0) {
      available = false;
      lastErrorCode = ERROR_CODES.COMPENSATION_FAILED;
      hideNavigation(refs.nav);
      showStatus(refs.status, NAV_STATUS_COMPENSATION);
      throw createError(ERROR_CODES.COMPENSATION_FAILED, compensationErrors[0] || forwardError);
    }

    available = true;
    lastErrorCode = ERROR_CODES.TRANSITION_FAILED;
    showStatus(refs.status, NAV_STATUS_RECOVERABLE);
    throw createError(ERROR_CODES.TRANSITION_FAILED, forwardError);
  }

  function selectPrimaryDestination(destination) {
    var refs;
    var priorProjectionSnapshot;
    var priorControllerStatus;
    var priorSelectedState;
    var currentDestination;
    var currentButton;
    var nextSnapshot;
    var error;
    var succeeded = false;

    if (!hasOwn(DESTINATION_BUTTON_IDS, destination)) {
      lastErrorCode = ERROR_CODES.DESTINATION_INVALID;
      fail(ERROR_CODES.DESTINATION_INVALID);
    }

    if (!available) {
      fail(ERROR_CODES.UNAVAILABLE);
    }

    if (transitioning) {
      fail(ERROR_CODES.TRANSITION_IN_PROGRESS);
    }

    refs = getNavigationRefs({ requireInitialPresentation: false });
    priorProjectionSnapshot = projectionApi.getState();
    priorControllerStatus = controllerApi.getStatus();
    currentDestination = priorProjectionSnapshot.primaryDestination;
    currentButton = getButtonForDestination(refs.buttons, destination);

    if (!currentButton) {
      lastErrorCode = ERROR_CODES.STATE_CONFLICT;
      fail(ERROR_CODES.STATE_CONFLICT);
    }

    if (destination === currentDestination) {
      var currentCurrentButtons = refs.buttons.filter(function (button) {
        return button.getAttribute('aria-current') === 'page';
      });

      if (
        currentCurrentButtons.length !== 1
        || currentCurrentButtons[0] !== currentButton
        || priorControllerStatus.activated !== true
        || priorControllerStatus.primaryDestination !== destination
      ) {
        lastErrorCode = ERROR_CODES.STATE_CONFLICT;
        fail(ERROR_CODES.STATE_CONFLICT);
      }

      currentButton.focus();
      hideStatus(refs.status);
      lastErrorCode = null;
      return getStatus();
    }

    transitioning = true;
    priorSelectedState = captureSelectedState(refs.buttons);

    try {
      currentButton.focus();
      nextSnapshot = projectionApi.setPrimaryDestination(destination);
      controllerApi.apply(nextSnapshot);
      applySelectedState(refs.buttons, destination);
      hideStatus(refs.status);
      lastErrorCode = null;
      succeeded = true;
    } catch (forwardError) {
      error = forwardError;

      if (
        error.code === ERROR_CODES.DESTINATION_INVALID
        || error.code === ERROR_CODES.UNAVAILABLE
        || error.code === ERROR_CODES.TRANSITION_IN_PROGRESS
        || error.code === ERROR_CODES.STATE_CONFLICT
      ) {
        if (error.code === ERROR_CODES.DESTINATION_INVALID) {
          lastErrorCode = ERROR_CODES.DESTINATION_INVALID;
        }

        throw error;
      }

      if (error.code === ERROR_CODES.COMPENSATION_FAILED) {
        available = false;
        lastErrorCode = ERROR_CODES.COMPENSATION_FAILED;
        hideNavigation(refs.nav);
        showStatus(refs.status, NAV_STATUS_COMPENSATION);
        throw error;
      }

      try {
        completeRecoverableFailure(refs, priorProjectionSnapshot, priorControllerStatus, priorSelectedState, forwardError);
      } catch (compensationOutcome) {
        throw compensationOutcome;
      }
    } finally {
      transitioning = false;
    }

    if (succeeded) {
      return getStatus();
    }
  }

  function attachEventHandlersAndInitialize() {
    var refs;

    try {
      initializeCoordinator();
    } catch (error) {
      // Contain automatic initialization failure.
      available = false;
      transitioning = false;
      if (!lastErrorCode) {
        lastErrorCode = ERROR_CODES.INITIALIZATION_FAILED;
      }
      return;
    }

    refs = navigationRefs;

    if (refs && !handlersAttached) {
      attachHandlers(refs.buttons);
    }
  }

  window.IX_PORTAL_NAVIGATION_COORDINATOR = Object.freeze({
    selectPrimaryDestination: selectPrimaryDestination,
    getStatus: getStatus,
  });

  attachEventHandlersAndInitialize();
})();
