/* coin-card-canonical-json-v1.js
 *
 * coin-card-canonical-json.v1 — the canonical JSON serialization algorithm for
 * CoinCard protocol artifacts.
 *
 * This is a PROTOCOL PRIMITIVE.  It has no browser dependencies, no crypto
 * dependencies, no DOM, and no window requirement.  It does one thing:
 *
 *   canonicalizeJson(value) → string | null
 *
 * Returns null if the value contains any non-canonical data (non-safe integer,
 * negative zero, non-NFC string, lone surrogate, unsupported type, accessor
 * property, symbol property, circular reference, non-plain-object prototype).
 *
 * Canonical rules (coin-card-canonical-json.v1):
 *   - Output encoded as UTF-8.
 *   - No insignificant whitespace.
 *   - Object keys sorted by Unicode scalar value (code point order).
 *   - String values must be NFC-normalized and contain only Unicode scalar values.
 *   - Booleans → `true` / `false`.
 *   - null → `null`.
 *   - Numbers: safe integers only, no decimal point, no exponent, no leading
 *     zeros, no plus sign, no negative zero.
 *   - Arrays preserve element order.
 *
 * Load order (browser): this file must be loaded before any script that reads
 * window.IX_COIN_CARD_CANONICAL_JSON_V1.
 *
 * Node.js: require() this file directly — no vm sandbox required.
 */

(function (factory) {
  'use strict';
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = factory();
  } else {
    window.IX_COIN_CARD_CANONICAL_JSON_V1 = factory();
  }
}(function () {
  'use strict';

  var CANONICAL_JSON_VERSION = 'coin-card-canonical-json.v1';

  // ---------------------------------------------------------------------------
  // Unicode helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // String escaping
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Number serialization
  // ---------------------------------------------------------------------------

  function canonicalizeNumber(value) {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) return null;
    return String(value);
  }

  // ---------------------------------------------------------------------------
  // Plain-object and property helpers
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Core canonicalization
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  return Object.freeze({
    CANONICAL_JSON_VERSION: CANONICAL_JSON_VERSION,
    canonicalizeJson: canonicalizeJson,
  });
}));
