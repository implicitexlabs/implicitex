/* coin-card-lifecycle-registry.js — protected empty lifecycle registry foundation
 *
 * This module establishes the static, integrity-protected lifecycle registry
 * source and deterministic empty outcomes. It does not promote presentation or
 * execution state.
 */

(function () {
  'use strict';

  var REGISTRY_SCHEMA_VERSION = 'coin-card-lifecycle-registry.v1';
  var CANONICAL_JSON_VERSION = 'coin-card-canonical-json.v1';
  var PROTECTED_PAYLOAD_DOMAIN = 'ImplicitEx Coin Card Protected Payload v1';

  var CARD_OUTCOMES = Object.freeze({
    CARD_ACTIVE: 'CARD_ACTIVE',
    CARD_SUSPENDED: 'CARD_SUSPENDED',
    CARD_REVOKED: 'CARD_REVOKED',
    CARD_UNKNOWN: 'CARD_UNKNOWN',
    CARD_RECORD_INVALID: 'CARD_RECORD_INVALID',
  });

  var MANIFEST_OUTCOMES = Object.freeze({
    MANIFEST_CURRENT: 'MANIFEST_CURRENT',
    MANIFEST_SUPERSEDED: 'MANIFEST_SUPERSEDED',
    MANIFEST_EXPIRED: 'MANIFEST_EXPIRED',
    MANIFEST_REVOKED: 'MANIFEST_REVOKED',
    MANIFEST_UNKNOWN: 'MANIFEST_UNKNOWN',
    MANIFEST_RECORD_INVALID: 'MANIFEST_RECORD_INVALID',
  });

  var OPERATIONAL_OUTCOMES = Object.freeze({
    LIFECYCLE_OPERATIONAL: 'LIFECYCLE_OPERATIONAL',
    LIFECYCLE_BLOCKED: 'LIFECYCLE_BLOCKED',
    LIFECYCLE_UNKNOWN: 'LIFECYCLE_UNKNOWN',
    LIFECYCLE_INVALID: 'LIFECYCLE_INVALID',
  });

  var emptyEntries = Object.freeze([]);
  var lifecycleRegistryBundle = Object.freeze({
    registrySchemaVersion: REGISTRY_SCHEMA_VERSION,
    registryId: 'implicitex-production',
    environment: 'production',
    registryVersion: 0,
    generatedAt: null,
    entries: emptyEntries,
  });

  function isPlainDataContainer(value) {
    if (Array.isArray(value)) return true;

    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isArrayIndexName(name, length) {
    if (!/^(0|[1-9]\d*)$/.test(name)) return false;
    var index = Number(name);
    return Number.isSafeInteger(index) && index >= 0 && index < length && String(index) === name;
  }

  function getOwnDataPropertyNames(value) {
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return null;

    var names = Object.getOwnPropertyNames(value);
    if (Array.isArray(value)) {
      var lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')) return null;

      var indexNames = [];
      for (var i = 0; i < names.length; i++) {
        var arrayName = names[i];
        if (arrayName === 'length') continue;
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, arrayName);
        if (
          !arrayDescriptor
          || !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value')
          || arrayDescriptor.enumerable !== true
          || !isArrayIndexName(arrayName, value.length)
          || typeof arrayDescriptor.value === 'function'
        ) {
          return null;
        }
        indexNames.push(arrayName);
      }
      if (indexNames.length !== value.length) return null;
      return indexNames.sort(function (left, right) { return Number(left) - Number(right); });
    }

    for (var j = 0; j < names.length; j++) {
      var name = names[j];
      var descriptor = Object.getOwnPropertyDescriptor(value, name);
      if (
        !descriptor
        || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || descriptor.enumerable !== true
        || typeof descriptor.value === 'function'
      ) {
        return null;
      }
    }
    return names;
  }

  function isDeepFrozenPlainData(value, seen) {
    if (!value || typeof value !== 'object') return true;
    if (!Object.isFrozen(value)) return false;
    if (!isPlainDataContainer(value)) return false;
    var keys = getOwnDataPropertyNames(value);
    if (!keys) return false;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return true;
    visited.push(value);

    for (var i = 0; i < keys.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[i]);
      if (!isDeepFrozenPlainData(descriptor.value, visited)) return false;
    }
    return true;
  }

  function compareCodePoints(left, right) {
    var leftPoints = Array.from(left);
    var rightPoints = Array.from(right);
    var length = Math.min(leftPoints.length, rightPoints.length);
    for (var i = 0; i < length; i++) {
      var leftCodePoint = leftPoints[i].codePointAt(0);
      var rightCodePoint = rightPoints[i].codePointAt(0);
      if (leftCodePoint !== rightCodePoint) {
        return leftCodePoint - rightCodePoint;
      }
    }
    return leftPoints.length - rightPoints.length;
  }

  function isNormalizedNfc(value) {
    return typeof value.normalize === 'function' && value.normalize('NFC') === value;
  }

  function containsOnlyUnicodeScalars(value) {
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (i + 1 >= value.length) return false;
        var next = value.charCodeAt(i + 1);
        if (next < 0xdc00 || next > 0xdfff) return false;
        i += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        return false;
      }
    }
    return true;
  }

  function isCanonicalString(value) {
    return containsOnlyUnicodeScalars(value) && isNormalizedNfc(value);
  }

  function escapeCanonicalString(value) {
    var result = '"';
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code === 0x22) {
        result += '\\"';
      } else if (code === 0x5c) {
        result += '\\\\';
      } else if (code === 0x08) {
        result += '\\b';
      } else if (code === 0x09) {
        result += '\\t';
      } else if (code === 0x0a) {
        result += '\\n';
      } else if (code === 0x0c) {
        result += '\\f';
      } else if (code === 0x0d) {
        result += '\\r';
      } else if (code >= 0 && code <= 0x1f) {
        result += '\\u00' + code.toString(16).padStart(2, '0');
      } else {
        result += value.charAt(i);
      }
    }
    return result + '"';
  }

  function canonicalizeNumber(value) {
    if (!Number.isSafeInteger(value)) return null;
    return String(value);
  }

  function canonicalizeJsonValue(value, seen) {
    if (value === null) return 'null';
    if (typeof value === 'string') {
      return isCanonicalString(value) ? escapeCanonicalString(value) : null;
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return canonicalizeNumber(value);
    if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return null;
    if (!value || typeof value !== 'object') return null;
    if (!isPlainDataContainer(value)) return null;
    var ownPropertyNames = getOwnDataPropertyNames(value);
    if (!ownPropertyNames) return null;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return null;
    visited.push(value);

    if (Array.isArray(value)) {
      var items = [];
      for (var i = 0; i < value.length; i++) {
        var item = canonicalizeJsonValue(value[i], visited);
        if (item === null) return null;
        items.push(item);
      }
      visited.pop();
      return '[' + items.join(',') + ']';
    }

    var keys = ownPropertyNames.sort(compareCodePoints);
    var properties = [];
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      if (!isCanonicalString(key)) return null;
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      var serialized = canonicalizeJsonValue(descriptor.value, visited);
      if (serialized === null) return null;
      properties.push(escapeCanonicalString(key) + ':' + serialized);
    }
    visited.pop();
    return '{' + properties.join(',') + '}';
  }

  function canonicalizeJson(value) {
    return canonicalizeJsonValue(value, []);
  }

  function getCryptoSubtle() {
    return window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function'
      ? window.crypto.subtle
      : null;
  }

  function bytesToBase64Url(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    var btoaImpl = (window && typeof window.btoa === 'function')
      ? window.btoa
      : (typeof btoa === 'function' ? btoa : null);
    var encoded = btoaImpl
      ? btoaImpl(binary)
      : (typeof Buffer !== 'undefined' ? Buffer.from(bytes).toString('base64') : null);

    if (!encoded) return null;
    return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function bufferToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function encodeUtf8(value) {
    var textEncoder = window.TextEncoder || (typeof TextEncoder === 'function' ? TextEncoder : null);
    return textEncoder ? new textEncoder().encode(value) : null;
  }

  function concatBytes(left, middle, right) {
    var bytes = new Uint8Array(left.length + middle.length + right.length);
    bytes.set(left, 0);
    bytes.set(middle, left.length);
    bytes.set(right, left.length + middle.length);
    return bytes;
  }

  function hashCanonicalPayload(domain, value) {
    var canonical = canonicalizeJson(value);
    var subtle = getCryptoSubtle();
    if (!canonical || !subtle) {
      return Promise.resolve({
        ok: false,
        canonicalText: canonical,
        hex: null,
        base64url: null,
        error: canonical ? 'lifecycle-crypto-unavailable' : 'lifecycle-canonical-json-invalid',
      });
    }

    var domainBytes = encodeUtf8(domain);
    var canonicalBytes = encodeUtf8(canonical);
    if (!domainBytes || !canonicalBytes) {
      return Promise.resolve({
        ok: false,
        canonicalText: canonical,
        hex: null,
        base64url: null,
        error: 'lifecycle-textencoder-unavailable',
      });
    }

    return subtle.digest('SHA-256', concatBytes(domainBytes, new Uint8Array([0]), canonicalBytes))
      .then(function (digest) {
        return {
          ok: true,
          canonicalText: canonical,
          hex: bufferToHex(digest),
          base64url: bytesToBase64Url(new Uint8Array(digest)),
          error: null,
        };
      });
  }

  function hashProtectedPayload(value) {
    return hashCanonicalPayload(PROTECTED_PAYLOAD_DOMAIN, value);
  }

  function isLifecycleRegistrySourceAvailable() {
    var bundle = window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE;
    if (!bundle || typeof bundle !== 'object') return false;
    if (typeof Object.isFrozen !== 'function') return false;
    return isDeepFrozenPlainData(bundle);
  }

  function validateLifecycleRegistryBundle(bundle) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
      return {
        ok: false,
        error: 'lifecycle-registry-bundle-invalid',
      };
    }
    if (!isDeepFrozenPlainData(bundle)) {
      return {
        ok: false,
        error: 'lifecycle-registry-bundle-not-deep-frozen-plain-data',
      };
    }
    var keys = getOwnDataPropertyNames(bundle);
    var expectedKeys = [
      'entries',
      'environment',
      'generatedAt',
      'registryId',
      'registrySchemaVersion',
      'registryVersion',
    ];
    if (!keys || keys.slice().sort(compareCodePoints).join('\n') !== expectedKeys.join('\n')) {
      return {
        ok: false,
        error: 'lifecycle-registry-empty-bundle-schema-invalid',
      };
    }
    if (
      bundle.registrySchemaVersion !== REGISTRY_SCHEMA_VERSION
      || typeof bundle.registryId !== 'string'
      || !bundle.registryId
      || typeof bundle.environment !== 'string'
      || !bundle.environment
      || bundle.registryVersion !== 0
      || bundle.generatedAt !== null
      || !Array.isArray(bundle.entries)
      || bundle.entries.length !== 0
    ) {
      return {
        ok: false,
        error: 'lifecycle-registry-empty-bundle-required-field-invalid',
      };
    }
    return {
      ok: true,
      error: null,
      sourceValidated: true,
      bundleIntegrityAuthenticated: false,
      recordAuthentication: 'not-applicable-empty',
      rollbackProtected: false,
      registryId: bundle.registryId,
      environment: bundle.environment,
      registryVersion: bundle.registryVersion,
      generatedAt: bundle.generatedAt,
      entryCount: bundle.entries.length,
    };
  }

  function composeOperationalOutcome(cardOutcome, manifestOutcome) {
    if (cardOutcome === CARD_OUTCOMES.CARD_RECORD_INVALID || manifestOutcome === MANIFEST_OUTCOMES.MANIFEST_RECORD_INVALID) {
      return OPERATIONAL_OUTCOMES.LIFECYCLE_INVALID;
    }
    if (cardOutcome === CARD_OUTCOMES.CARD_SUSPENDED || cardOutcome === CARD_OUTCOMES.CARD_REVOKED) {
      return OPERATIONAL_OUTCOMES.LIFECYCLE_BLOCKED;
    }
    if (cardOutcome === CARD_OUTCOMES.CARD_UNKNOWN) {
      return OPERATIONAL_OUTCOMES.LIFECYCLE_UNKNOWN;
    }
    if (cardOutcome === CARD_OUTCOMES.CARD_ACTIVE && manifestOutcome === MANIFEST_OUTCOMES.MANIFEST_UNKNOWN) {
      return OPERATIONAL_OUTCOMES.LIFECYCLE_UNKNOWN;
    }
    if (cardOutcome === CARD_OUTCOMES.CARD_ACTIVE && manifestOutcome === MANIFEST_OUTCOMES.MANIFEST_CURRENT) {
      return OPERATIONAL_OUTCOMES.LIFECYCLE_OPERATIONAL;
    }
    if (cardOutcome === CARD_OUTCOMES.CARD_ACTIVE) {
      return OPERATIONAL_OUTCOMES.LIFECYCLE_BLOCKED;
    }
    return OPERATIONAL_OUTCOMES.LIFECYCLE_INVALID;
  }

  function resolveLifecycle(cardId, manifestId) {
    var bundle = window.IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE;
    var validation = validateLifecycleRegistryBundle(bundle);
    if (!validation.ok) {
      return {
        cardId: cardId || null,
        manifestId: manifestId || null,
        cardOutcome: CARD_OUTCOMES.CARD_RECORD_INVALID,
        manifestOutcome: MANIFEST_OUTCOMES.MANIFEST_RECORD_INVALID,
        operationalOutcome: OPERATIONAL_OUTCOMES.LIFECYCLE_INVALID,
        registry: validation,
      };
    }

    var cardOutcome = CARD_OUTCOMES.CARD_UNKNOWN;
    var manifestOutcome = MANIFEST_OUTCOMES.MANIFEST_UNKNOWN;
    return {
      cardId: cardId || null,
      manifestId: manifestId || null,
      cardOutcome: cardOutcome,
      manifestOutcome: manifestOutcome,
      operationalOutcome: composeOperationalOutcome(cardOutcome, manifestOutcome),
      registry: validation,
    };
  }

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE', {
    value: lifecycleRegistryBundle,
    writable: false,
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_REGISTRY', {
    value: Object.freeze({
      REGISTRY_SCHEMA_VERSION: REGISTRY_SCHEMA_VERSION,
      CANONICAL_JSON_VERSION: CANONICAL_JSON_VERSION,
      CARD_OUTCOMES: CARD_OUTCOMES,
      MANIFEST_OUTCOMES: MANIFEST_OUTCOMES,
      OPERATIONAL_OUTCOMES: OPERATIONAL_OUTCOMES,
      canonicalizeJson: canonicalizeJson,
      hashProtectedPayload: hashProtectedPayload,
      isLifecycleRegistrySourceAvailable: isLifecycleRegistrySourceAvailable,
      validateLifecycleRegistryBundle: validateLifecycleRegistryBundle,
      composeOperationalOutcome: composeOperationalOutcome,
      resolveLifecycle: resolveLifecycle,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
