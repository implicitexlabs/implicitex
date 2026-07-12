/**
 * portal-surface-registry.js
 *
 * Read-only registry for canonical portal surface ownership.
 *
 * Surface registration records the canonical information-architecture ownership
 * of an existing DOM island. It does not enumerate every surface where the
 * island's facts may later be projected. Secondary or contextual fact projection
 * remains governed by the committed presentation projection contract.
 *
 * It reads explicit registration metadata only and does not control visibility,
 * navigation, storage, or execution.
 */

(function () {
  'use strict';

  var PRIMARY_ATTR = 'data-portal-primary-surface';
  var CONTEXTUAL_ATTR = 'data-portal-contextual-surface';
  var GLOBAL_ATTR = 'data-portal-global-surface';

  var PRIMARY_SURFACES = Object.freeze({
    TRANSFER: 'TRANSFER',
    RECIPIENTS: 'RECIPIENTS',
    ACTIVITY: 'ACTIVITY',
  });

  var CONTEXTUAL_SURFACES = Object.freeze({
    VERIFICATION: 'VERIFICATION',
    SYSTEM: 'SYSTEM',
  });

  var GLOBAL_SURFACES = Object.freeze({
    NETWORK: 'NETWORK',
  });

  function fail(reason) {
    var error = new Error(reason);
    error.code = reason;
    throw error;
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function isPrimarySurface(value) {
    return value === PRIMARY_SURFACES.TRANSFER
      || value === PRIMARY_SURFACES.RECIPIENTS
      || value === PRIMARY_SURFACES.ACTIVITY;
  }

  function isContextualSurface(value) {
    return value === CONTEXTUAL_SURFACES.VERIFICATION
      || value === CONTEXTUAL_SURFACES.SYSTEM;
  }

  function isGlobalSurface(value) {
    return value === GLOBAL_SURFACES.NETWORK;
  }

  function createEmptyBuckets(surfaces) {
    var result = {};
    var keys = Object.keys(surfaces);

    for (var i = 0; i < keys.length; i += 1) {
      result[surfaces[keys[i]]] = [];
    }

    return result;
  }

  function compareBySelector(left, right) {
    if (left.selector < right.selector) return -1;
    if (left.selector > right.selector) return 1;
    return 0;
  }

  function freezeBuckets(buckets) {
    var result = {};
    var names = Object.keys(buckets);

    for (var i = 0; i < names.length; i += 1) {
      result[names[i]] = Object.freeze(buckets[names[i]].slice().sort(compareBySelector));
    }

    return Object.freeze(result);
  }

  function createRegistration(element, surface, category) {
    return Object.freeze({
      id: element.id,
      selector: '#' + element.id,
      surface: surface,
      category: category,
    });
  }

  function readSurfaceAttribute(element, name) {
    var value = element.getAttribute(name);

    if (value === '') {
      fail('portal-surface-registration-malformed');
    }

    return value;
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

  function validateStableIdentity(element, selectors) {
    if (!element.id || typeof element.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(element.id)) {
      fail('portal-surface-registration-unstable');
    }

    var selector = '#' + element.id;
    if (hasOwn(selectors, selector)) {
      fail('portal-surface-registration-duplicate');
    }

    if (document.getElementById(element.id) !== element) {
      fail('portal-surface-registration-unstable');
    }

    selectors[selector] = true;
  }

  function validateGlobalPlacement(element) {
    var modulesRoot = document.getElementById('modules');

    if (!modulesRoot || !isDescendantOf(element, modulesRoot)) {
      fail('portal-global-surface-outside-region');
    }

    var current = element.parentNode || null;

    while (current) {
      if (current.hasAttribute && (
        current.hasAttribute(PRIMARY_ATTR) || current.hasAttribute(CONTEXTUAL_ATTR)
      )) {
        fail('portal-global-surface-nested');
      }

      current = current.parentNode || null;
    }
  }

  function buildRegistry() {
    var primaryBuckets = createEmptyBuckets(PRIMARY_SURFACES);
    var contextualBuckets = createEmptyBuckets(CONTEXTUAL_SURFACES);
    var globalBuckets = createEmptyBuckets(GLOBAL_SURFACES);
    var selectors = {};
    var seen = [];
    var nodes = document.querySelectorAll(
      '[' + PRIMARY_ATTR + '], [' + CONTEXTUAL_ATTR + '], [' + GLOBAL_ATTR + ']'
    );

    for (var i = 0; i < nodes.length; i += 1) {
      var element = nodes[i];
      if (seen.indexOf(element) !== -1) {
        fail('portal-surface-registration-duplicate');
      }

      seen.push(element);

      var hasPrimaryAttr = element.hasAttribute(PRIMARY_ATTR);
      var hasContextualAttr = element.hasAttribute(CONTEXTUAL_ATTR);
      var hasGlobalAttr = element.hasAttribute(GLOBAL_ATTR);
      var categoryCount = (hasPrimaryAttr ? 1 : 0) + (hasContextualAttr ? 1 : 0) + (hasGlobalAttr ? 1 : 0);

      if (categoryCount > 1) {
        fail('portal-surface-registration-dual-role');
      }

      if (categoryCount === 0) {
        fail('portal-surface-registration-malformed');
      }

      validateStableIdentity(element, selectors);

      if (hasPrimaryAttr) {
        var primaryValue = readSurfaceAttribute(element, PRIMARY_ATTR);
        if (!isPrimarySurface(primaryValue)) {
          fail('portal-primary-surface-invalid');
        }

        primaryBuckets[primaryValue].push(createRegistration(element, primaryValue, 'primary'));
      } else if (hasContextualAttr) {
        var contextualValue = readSurfaceAttribute(element, CONTEXTUAL_ATTR);
        if (!isContextualSurface(contextualValue)) {
          fail('portal-contextual-surface-invalid');
        }

        contextualBuckets[contextualValue].push(createRegistration(element, contextualValue, 'contextual'));
      } else {
        var globalValue = readSurfaceAttribute(element, GLOBAL_ATTR);

        if (!isGlobalSurface(globalValue)) {
          fail('portal-global-surface-invalid');
        }

        validateGlobalPlacement(element);
        globalBuckets[globalValue].push(createRegistration(element, globalValue, 'GLOBAL'));
      }
    }

    if (primaryBuckets[PRIMARY_SURFACES.TRANSFER].length === 0) {
      fail('portal-transfer-surface-missing');
    }

    if (globalBuckets[GLOBAL_SURFACES.NETWORK].length === 0) {
      fail('portal-global-surface-missing');
    }

    if (globalBuckets[GLOBAL_SURFACES.NETWORK].length > 1) {
      fail('portal-global-surface-duplicate');
    }

    return Object.freeze({
      primary: freezeBuckets(primaryBuckets),
      contextual: freezeBuckets(contextualBuckets),
      global: freezeBuckets(globalBuckets),
    });
  }

  var registry = buildRegistry();

  function requirePrimarySurface(surface) {
    if (!isPrimarySurface(surface)) {
      fail('portal-primary-surface-invalid');
    }
  }

  function requireContextualSurface(surface) {
    if (!isContextualSurface(surface)) {
      fail('portal-contextual-surface-invalid');
    }
  }

  function requireGlobalSurface(surface) {
    if (!isGlobalSurface(surface)) {
      fail('portal-global-surface-invalid');
    }
  }

  function cloneRegistrations(registrations) {
    return Object.freeze(registrations.slice());
  }

  function getPrimarySurfaceRegistrations(surface) {
    requirePrimarySurface(surface);
    return cloneRegistrations(registry.primary[surface]);
  }

  function getContextualSurfaceRegistrations(surface) {
    requireContextualSurface(surface);
    return cloneRegistrations(registry.contextual[surface]);
  }

  function getGlobalSurfaceRegistrations(surface) {
    requireGlobalSurface(surface);
    return cloneRegistrations(registry.global[surface]);
  }

  function cloneBuckets(buckets) {
    var result = {};
    var names = Object.keys(buckets);

    for (var i = 0; i < names.length; i += 1) {
      result[names[i]] = cloneRegistrations(buckets[names[i]]);
    }

    return Object.freeze(result);
  }

  function getRegistrationSnapshot() {
    return Object.freeze({
      primary: cloneBuckets(registry.primary),
      contextual: cloneBuckets(registry.contextual),
      global: cloneBuckets(registry.global),
    });
  }

  function validate() {
    buildRegistry();
    return true;
  }

  window.IX_PORTAL_SURFACE_REGISTRY = Object.freeze({
    PRIMARY_SURFACES: PRIMARY_SURFACES,
    CONTEXTUAL_SURFACES: CONTEXTUAL_SURFACES,
    GLOBAL_SURFACES: GLOBAL_SURFACES,
    ATTRIBUTES: Object.freeze({
      PRIMARY_SURFACE: PRIMARY_ATTR,
      CONTEXTUAL_SURFACE: CONTEXTUAL_ATTR,
      GLOBAL_SURFACE: GLOBAL_ATTR,
    }),
    getPrimarySurfaceRegistrations: getPrimarySurfaceRegistrations,
    getContextualSurfaceRegistrations: getContextualSurfaceRegistrations,
    getGlobalSurfaceRegistrations: getGlobalSurfaceRegistrations,
    getRegistrationSnapshot: getRegistrationSnapshot,
    validate: validate,
  });
})();
