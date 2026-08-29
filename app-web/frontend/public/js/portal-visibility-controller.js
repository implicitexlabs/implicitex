/**
 * portal-visibility-controller.js
 *
 * Dormant presentation controller for portal destination visibility.
 * It does not change page presentation on load.
 */

(function () {
  'use strict';

  var INACTIVE_ATTR = 'data-portal-controller-inactive';
  var CONTROLLER_GLOBAL = 'IX_PORTAL_VISIBILITY_CONTROLLER';

  var PRIMARY_DESTINATIONS = ['TRANSFER', 'RECIPIENTS', 'ACTIVITY'];

  var REQUIRED_PRIMARY = {
    TRANSFER: ['ccIntake', 'companion', 'ixidIntake', 'transferMod'],
    RECIPIENTS: ['recipientsMod'],
    ACTIVITY: ['activityMod'],
  };

  var REQUIRED_CONTEXTUAL = {
    VERIFICATION: ['verificationMod'],
    SYSTEM: ['portalFooter', 'telemetry'],
  };

  var REQUIRED_GLOBAL = {
    NETWORK: ['networkMod'],
  };

  var DORMANT_STATUS = createStatus(false, null);
  var status = DORMANT_STATUS;
  var ownedMarkers = Object.create(null);

  function fail(code) {
    var error = new Error(code);
    error.code = code;
    throw error;
  }

  function createStatus(activated, primaryDestination) {
    return Object.freeze({
      activated: activated,
      primaryDestination: primaryDestination,
    });
  }

  function getRegistryApi() {
    var api = window.IX_PORTAL_SURFACE_REGISTRY;

    if (!api || typeof api !== 'object') {
      fail('portal-surface-registry-missing');
    }

    if (
      typeof api.validate !== 'function'
      || typeof api.getPrimarySurfaceRegistrations !== 'function'
      || typeof api.getContextualSurfaceRegistrations !== 'function'
      || typeof api.getGlobalSurfaceRegistrations !== 'function'
    ) {
      fail('portal-surface-registry-malformed');
    }

    return api;
  }

  function freezeList(items) {
    return Object.freeze(items.slice());
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
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

  function getElementByIdOrFail(id, code) {
    var element = document.getElementById(id);

    if (!element || element.id !== id) {
      fail(code);
    }

    return element;
  }

  function compareIds(left, right) {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  function assertExactRegistrationSet(registrations, expectedIds, code) {
    if (!registrations || registrations.length !== expectedIds.length) {
      fail(code);
    }

    var actualIds = registrations.map(function (entry) {
      return entry.id;
    }).sort(compareIds);
    var expected = expectedIds.slice().sort(compareIds);

    for (var i = 0; i < expected.length; i += 1) {
      if (actualIds[i] !== expected[i]) {
        fail(code);
      }
    }
  }

  function resolveRegistrations(registrations, surface, category, expectedIds) {
    assertExactRegistrationSet(registrations, expectedIds, 'portal-visibility-root-missing');

    var resolved = [];

    for (var i = 0; i < registrations.length; i += 1) {
      var registration = registrations[i];

      if (
        !registration
        || typeof registration !== 'object'
        || registration.surface !== surface
        || registration.category !== category
        || registration.selector !== '#' + registration.id
      ) {
        fail('portal-visibility-root-mismatch');
      }

      var element = getElementByIdOrFail(registration.id, 'portal-visibility-root-mismatch');
      if (element !== document.getElementById(registration.id)) {
        fail('portal-visibility-root-mismatch');
      }

      resolved.push(element);
    }

    return resolved;
  }

  function resolveRegistryRoots(registryApi) {
    var roots = Object.create(null);

    roots.TRANSFER = resolveRegistrations(
      registryApi.getPrimarySurfaceRegistrations('TRANSFER'),
      'TRANSFER',
      'primary',
      REQUIRED_PRIMARY.TRANSFER
    );
    roots.RECIPIENTS = resolveRegistrations(
      registryApi.getPrimarySurfaceRegistrations('RECIPIENTS'),
      'RECIPIENTS',
      'primary',
      REQUIRED_PRIMARY.RECIPIENTS
    );
    roots.ACTIVITY = resolveRegistrations(
      registryApi.getPrimarySurfaceRegistrations('ACTIVITY'),
      'ACTIVITY',
      'primary',
      REQUIRED_PRIMARY.ACTIVITY
    );

    roots.VERIFICATION = resolveRegistrations(
      registryApi.getContextualSurfaceRegistrations('VERIFICATION'),
      'VERIFICATION',
      'contextual',
      REQUIRED_CONTEXTUAL.VERIFICATION
    );
    roots.SYSTEM = resolveRegistrations(
      registryApi.getContextualSurfaceRegistrations('SYSTEM'),
      'SYSTEM',
      'contextual',
      REQUIRED_CONTEXTUAL.SYSTEM
    );

    roots.NETWORK = resolveRegistrations(
      registryApi.getGlobalSurfaceRegistrations('NETWORK'),
      'NETWORK',
      'GLOBAL',
      REQUIRED_GLOBAL.NETWORK
    );

    return roots;
  }

  function buildPrimaryRootMap(roots) {
    var map = Object.create(null);
    var surfaces = PRIMARY_DESTINATIONS;

    for (var i = 0; i < surfaces.length; i += 1) {
      var currentRoots = roots[surfaces[i]];

      for (var j = 0; j < currentRoots.length; j += 1) {
        var root = currentRoots[j];
        map[root.id] = root;
      }
    }

    return map;
  }

  function assertNoForeignMarkers(roots, primaryRootMap) {
    var globalAndContextual = roots.NETWORK
      .concat(roots.VERIFICATION, roots.SYSTEM);

    for (var i = 0; i < globalAndContextual.length; i += 1) {
      if (globalAndContextual[i].hasAttribute(INACTIVE_ATTR)) {
        fail('portal-visibility-marker-conflict');
      }
    }

    var ids = Object.keys(primaryRootMap);
    for (var j = 0; j < ids.length; j += 1) {
      var root = primaryRootMap[ids[j]];
      var ownedRoot = hasOwn(ownedMarkers, root.id) ? ownedMarkers[root.id] : null;
      var hasMarker = root.hasAttribute(INACTIVE_ATTR);

      if (hasMarker && ownedRoot !== root) {
        fail('portal-visibility-marker-conflict');
      }

      if (!hasMarker && ownedRoot) {
        fail('portal-visibility-marker-conflict');
      }
    }

    var ownedIds = Object.keys(ownedMarkers);
    for (var k = 0; k < ownedIds.length; k += 1) {
      var ownedRoot = primaryRootMap[ownedIds[k]];

      if (
        !ownedRoot
        || ownedMarkers[ownedIds[k]] !== ownedRoot
        || document.getElementById(ownedIds[k]) !== ownedRoot
        || ownedRoot.id !== ownedIds[k]
        || !ownedRoot.hasAttribute(INACTIVE_ATTR)
      ) {
        fail('portal-visibility-marker-conflict');
      }
    }
  }

  function getDestinationClosingRoots(roots, destination) {
    var closing = [];

    for (var i = 0; i < PRIMARY_DESTINATIONS.length; i += 1) {
      var surface = PRIMARY_DESTINATIONS[i];

      if (surface !== destination) {
        closing = closing.concat(roots[surface]);
      }
    }

    return closing;
  }

  function assertFocusNotInsideRoots(closingRoots) {
    var activeElement = document.activeElement || null;

    if (!activeElement) {
      return;
    }

    for (var i = 0; i < closingRoots.length; i += 1) {
      var root = closingRoots[i];
      if (activeElement === root || isDescendantOf(activeElement, root)) {
        fail('portal-visibility-focus-conflict');
      }
    }
  }

  function buildTransactionRoots(roots, destination) {
    return {
      active: freezeList(roots[destination]),
      inactive: freezeList(getDestinationClosingRoots(roots, destination)),
    };
  }

  function validateViewStateSnapshot(viewStateSnapshot) {
    var names;
    var descriptor;
    var primaryDestination;
    var contextualLayer;
    var i;

    if (
      !viewStateSnapshot
      || typeof viewStateSnapshot !== 'object'
      || Array.isArray(viewStateSnapshot)
    ) {
      fail('portal-visibility-state-invalid');
    }

    if (!Object.isFrozen(viewStateSnapshot)) {
      fail('portal-visibility-state-invalid');
    }

    if (Object.getPrototypeOf(viewStateSnapshot) !== Object.prototype) {
      fail('portal-visibility-state-invalid');
    }

    if (Object.getOwnPropertySymbols(viewStateSnapshot).length !== 0) {
      fail('portal-visibility-state-invalid');
    }

    names = Object.getOwnPropertyNames(viewStateSnapshot);
    if (names.length !== 2) {
      fail('portal-visibility-state-invalid');
    }

    if (!hasOwn(viewStateSnapshot, 'primaryDestination') || !hasOwn(viewStateSnapshot, 'contextualLayer')) {
      fail('portal-visibility-state-invalid');
    }

    descriptor = Object.getOwnPropertyDescriptor(viewStateSnapshot, 'primaryDestination');
    if (!descriptor || descriptor.get || descriptor.set) {
      fail('portal-visibility-state-invalid');
    }

    descriptor = Object.getOwnPropertyDescriptor(viewStateSnapshot, 'contextualLayer');
    if (!descriptor || descriptor.get || descriptor.set) {
      fail('portal-visibility-state-invalid');
    }

    primaryDestination = viewStateSnapshot.primaryDestination;
    contextualLayer = viewStateSnapshot.contextualLayer;

    for (i = 0; i < PRIMARY_DESTINATIONS.length; i += 1) {
      if (PRIMARY_DESTINATIONS[i] === primaryDestination) {
        break;
      }
    }

    if (i === PRIMARY_DESTINATIONS.length) {
      fail('portal-visibility-state-invalid');
    }

    if (
      contextualLayer !== null
      && contextualLayer !== 'VERIFICATION'
      && contextualLayer !== 'SYSTEM'
    ) {
      fail('portal-visibility-state-invalid');
    }

    return viewStateSnapshot;
  }

  function applyMarkerTransaction(plan) {
    var applied = [];
    var nextOwned = Object.create(null);
    var i;

    try {
      for (i = 0; i < plan.inactive.length; i += 1) {
        var inactiveRoot = plan.inactive[i];
        var inactiveOwnedRoot = hasOwn(ownedMarkers, inactiveRoot.id) ? ownedMarkers[inactiveRoot.id] : null;

        if (inactiveRoot.hasAttribute(INACTIVE_ATTR)) {
          if (inactiveOwnedRoot !== inactiveRoot) {
            fail('portal-visibility-marker-conflict');
          }
        } else {
          if (inactiveOwnedRoot) {
            fail('portal-visibility-marker-conflict');
          }
          inactiveRoot.setAttribute(INACTIVE_ATTR, '');
          applied.push({ root: inactiveRoot, action: 'add' });
        }
        nextOwned[inactiveRoot.id] = inactiveRoot;
      }

      for (i = 0; i < plan.active.length; i += 1) {
        var activeRoot = plan.active[i];
        var activeOwnedRoot = hasOwn(ownedMarkers, activeRoot.id) ? ownedMarkers[activeRoot.id] : null;

        if (activeRoot.hasAttribute(INACTIVE_ATTR)) {
          if (activeOwnedRoot !== activeRoot) {
            fail('portal-visibility-marker-conflict');
          }

          activeRoot.removeAttribute(INACTIVE_ATTR);
          applied.push({ root: activeRoot, action: 'remove' });
        } else if (activeOwnedRoot) {
          fail('portal-visibility-marker-conflict');
        }
      }
    } catch (error) {
      for (i = applied.length - 1; i >= 0; i -= 1) {
        if (applied[i].action === 'add') {
          applied[i].root.removeAttribute(INACTIVE_ATTR);
        } else {
          applied[i].root.setAttribute(INACTIVE_ATTR, '');
        }
      }
      throw error;
    }

    for (i = 0; i < plan.active.length; i += 1) {
      if (hasOwn(nextOwned, plan.active[i].id)) {
        delete nextOwned[plan.active[i].id];
      }
    }

    return nextOwned;
  }

  function apply(viewStateSnapshot) {
    var normalizedState = validateViewStateSnapshot(viewStateSnapshot);
    var registryApi = getRegistryApi();
    var registryRoots;
    var primaryRootMap;
    var destination;
    var plan;
    var nextOwned;

    registryApi.validate();
    registryRoots = resolveRegistryRoots(registryApi);
    primaryRootMap = buildPrimaryRootMap(registryRoots);
    destination = normalizedState.primaryDestination;

    if (!hasOwn(registryRoots, destination) || !hasOwn(REQUIRED_PRIMARY, destination)) {
      fail('portal-visibility-state-invalid');
    }

    assertNoForeignMarkers(registryRoots, primaryRootMap);
    plan = buildTransactionRoots(registryRoots, destination);
    assertFocusNotInsideRoots(plan.inactive);

    nextOwned = applyMarkerTransaction(plan);
    ownedMarkers = nextOwned;
    status = createStatus(true, destination);
    return createStatus(status.activated, status.primaryDestination);
  }

  function restore() {
    var ids;
    var removed = [];
    var i;

    if (Object.keys(ownedMarkers).length === 0) {
      status = createStatus(false, null);
      return createStatus(status.activated, status.primaryDestination);
    }

    ids = Object.keys(ownedMarkers).sort(compareIds);
    for (i = 0; i < ids.length; i += 1) {
      var ownedRoot = ownedMarkers[ids[i]];

      if (
        !ownedRoot
        || ownedRoot.id !== ids[i]
        || document.getElementById(ids[i]) !== ownedRoot
        || !ownedRoot.hasAttribute(INACTIVE_ATTR)
      ) {
        fail('portal-visibility-marker-conflict');
      }
    }

    try {
      for (i = 0; i < ids.length; i += 1) {
        var root = ownedMarkers[ids[i]];
        root.removeAttribute(INACTIVE_ATTR);
        removed.push(root);
      }
    } catch (error) {
      for (i = removed.length - 1; i >= 0; i -= 1) {
        removed[i].setAttribute(INACTIVE_ATTR, '');
      }
      throw error;
    }

    ownedMarkers = Object.create(null);
    status = createStatus(false, null);
    return createStatus(status.activated, status.primaryDestination);
  }

  function getStatus() {
    return createStatus(status.activated, status.primaryDestination);
  }

  window[CONTROLLER_GLOBAL] = Object.freeze({
    apply: apply,
    restore: restore,
    getStatus: getStatus,
  });
})();
