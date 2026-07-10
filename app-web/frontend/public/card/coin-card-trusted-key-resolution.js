/* coin-card-trusted-key-resolution.js — shared Coin Card trusted-key authority
 *
 * This module owns trusted-key source validation and policy-aware key
 * resolution. Manifest verification and lifecycle record verification should
 * depend on this authority rather than on each other.
 */

(function () {
  'use strict';

  var TRUSTED_KEY_RECORD_SCHEMA_VERSION = 'coin-card-trusted-key-record.v1';
  var TRUSTED_KEY_ALGORITHM_P256 = 'ECDSA_P256_SHA256';
  var TRUSTED_KEY_OUTCOMES = Object.freeze({
    TRUSTED_KEY_ACTIVE: 'TRUSTED_KEY_ACTIVE',
    TRUSTED_KEY_NOT_YET_ACTIVE: 'TRUSTED_KEY_NOT_YET_ACTIVE',
    TRUSTED_KEY_EXPIRED: 'TRUSTED_KEY_EXPIRED',
    TRUSTED_KEY_REVOKED: 'TRUSTED_KEY_REVOKED',
    TRUSTED_KEY_USAGE_DENIED: 'TRUSTED_KEY_USAGE_DENIED',
    TRUSTED_KEY_ENVIRONMENT_MISMATCH: 'TRUSTED_KEY_ENVIRONMENT_MISMATCH',
    TRUSTED_KEY_SOURCE_UNAVAILABLE: 'TRUSTED_KEY_SOURCE_UNAVAILABLE',
    TRUSTED_KEY_UNKNOWN: 'TRUSTED_KEY_UNKNOWN',
    TRUSTED_KEY_RECORD_INVALID: 'TRUSTED_KEY_RECORD_INVALID',
  });
  var STRICT_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var BASE64URL_FIELD_RE = /^[A-Za-z0-9_-]+$/;
  var TRUSTED_KEY_CLOCK_SKEW_MS = 5 * 60 * 1000;
  var TRUSTED_KEY_RECORD_FIELDS = Object.freeze([
    'algorithm',
    'environment',
    'issuerId',
    'keyId',
    'publicKey',
    'revocationPolicy',
    'revocationReason',
    'revokedAt',
    'schemaVersion',
    'status',
    'successorKeyId',
    'usage',
    'validFrom',
    'validUntil',
  ]);
  var TRUSTED_KEY_REVOCATION_POLICIES = Object.freeze({
    INVALIDATE_ALL_SIGNATURES: true,
    INVALIDATE_AFTER_TIMESTAMP: true,
    NO_NEW_SIGNATURES: true,
  });
  var TRUSTED_KEY_USAGES = Object.freeze({
    'coin-card-manifest-signing': true,
    'coin-card-lifecycle-administration': true,
    'coin-card-registry-publication': true,
  });
  var TRUSTED_KEY_STATUSES = Object.freeze({
    ACTIVE: true,
    REVOKED: true,
    EXPIRED: true,
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
    if (visited.indexOf(value) !== -1) return false;
    visited.push(value);

    for (var i = 0; i < keys.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[i]);
      if (!isDeepFrozenPlainData(descriptor.value, visited)) return false;
    }
    return true;
  }

  function isTrustedKeySourceAvailable() {
    var trustedKeys = window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
    if (!trustedKeys || typeof trustedKeys !== 'object' || Array.isArray(trustedKeys)) return false;
    if (typeof Object.isFrozen !== 'function') return false;
    if (!isDeepFrozenPlainData(trustedKeys)) return false;

    var keyIds = getOwnDataPropertyNames(trustedKeys);
    if (!keyIds) return false;
    for (var i = 0; i < keyIds.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(trustedKeys, keyIds[i]);
      if (!isTrustedKeyRecordStaticShape(descriptor.value, keyIds[i])) return false;
    }
    return true;
  }

  function getTrustedKeyRecord(keyId) {
    if (!keyId || !isTrustedKeySourceAvailable()) return null;

    var trustedKeys = window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
    var descriptor = Object.getOwnPropertyDescriptor(trustedKeys, keyId);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return null;
    return descriptor.value || null;
  }

  function parseStrictUtcTimestamp(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return null;
    if (!STRICT_UTC_TIMESTAMP_RE.test(value)) return null;

    var milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    if (new Date(milliseconds).toISOString() !== value) return null;
    return milliseconds;
  }

  function isValidPublicP256Jwk(publicKey) {
    if (!publicKey || typeof publicKey !== 'object' || Array.isArray(publicKey)) return false;
    if (!hasOnlyAllowedOwnProperties(publicKey, ['crv', 'ext', 'key_ops', 'kty', 'x', 'y'])) return false;
    if (publicKey.kty !== 'EC' || publicKey.crv !== 'P-256') return false;
    if (typeof publicKey.x !== 'string' || typeof publicKey.y !== 'string') return false;
    if (publicKey.x.length !== 43 || publicKey.y.length !== 43) return false;
    if (!BASE64URL_FIELD_RE.test(publicKey.x) || !BASE64URL_FIELD_RE.test(publicKey.y)) return false;
    if (Object.prototype.hasOwnProperty.call(publicKey, 'd')) return false;
    if (publicKey.key_ops && (!Array.isArray(publicKey.key_ops) || publicKey.key_ops.length !== 1 || publicKey.key_ops[0] !== 'verify')) {
      return false;
    }
    if (publicKey.ext !== undefined && publicKey.ext !== true) return false;
    return true;
  }

  function sameStringSet(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    var actualSorted = actual.slice().sort();
    var expectedSorted = expected.slice().sort();
    for (var i = 0; i < expectedSorted.length; i++) {
      if (actualSorted[i] !== expectedSorted[i]) return false;
    }
    return true;
  }

  function hasOnlyAllowedOwnProperties(value, allowedFields) {
    var names = getOwnDataPropertyNames(value);
    if (!names) return false;
    for (var i = 0; i < names.length; i++) {
      if (allowedFields.indexOf(names[i]) === -1) return false;
    }
    return true;
  }

  function hasExactTrustedKeyRecordSchema(record) {
    return sameStringSet(getOwnDataPropertyNames(record), TRUSTED_KEY_RECORD_FIELDS);
  }

  function isNullOrStrictUtcTimestamp(value) {
    return value === null || parseStrictUtcTimestamp(value) !== null;
  }

  function isNullOrNonemptyString(value) {
    return value === null || (typeof value === 'string' && value.length > 0);
  }

  function hasValidNullableRecordFields(record) {
    if (!isNullOrStrictUtcTimestamp(record.validUntil)) return false;
    if (!isNullOrStrictUtcTimestamp(record.revokedAt)) return false;
    if (!isNullOrNonemptyString(record.revocationReason)) return false;
    if (!(record.revocationPolicy === null || TRUSTED_KEY_REVOCATION_POLICIES[record.revocationPolicy])) return false;
    if (!isNullOrNonemptyString(record.successorKeyId)) return false;

    if (record.status === 'REVOKED') {
      return record.revokedAt !== null && record.revocationPolicy !== null;
    }
    return record.revokedAt === null && record.revocationReason === null && record.revocationPolicy === null;
  }

  function isTrustedKeyRecordStaticShape(record, keyId) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    if (!isDeepFrozenPlainData(record)) return false;
    if (!hasExactTrustedKeyRecordSchema(record)) return false;
    if (record.keyId !== keyId) return false;
    if (record.schemaVersion !== TRUSTED_KEY_RECORD_SCHEMA_VERSION) return false;
    if (record.algorithm !== TRUSTED_KEY_ALGORITHM_P256) return false;
    if (!isValidPublicP256Jwk(record.publicKey)) return false;
    if (typeof record.issuerId !== 'string' || !record.issuerId) return false;
    if (!isValidTrustedKeyUsageArray(record.usage)) return false;
    if (!TRUSTED_KEY_STATUSES[record.status]) return false;
    if (parseStrictUtcTimestamp(record.validFrom) === null) return false;
    if (!isNullOrStrictUtcTimestamp(record.validUntil)) return false;
    if (typeof record.environment !== 'string' || !record.environment) return false;
    if (!hasValidNullableRecordFields(record)) return false;
    if (record.successorKeyId !== null && record.successorKeyId === record.keyId) return false;
    return true;
  }

  function isAllowedStringArray(value, allowedValue) {
    if (!isValidTrustedKeyUsageArray(value)) return false;
    return value.indexOf(allowedValue) !== -1;
  }

  function isValidTrustedKeyUsageArray(value) {
    if (!Array.isArray(value) || !Object.isFrozen(value) || value.length < 1) return false;

    var seen = Object.create(null);
    for (var i = 0; i < value.length; i++) {
      var usage = value[i];
      if (typeof usage !== 'string' || !TRUSTED_KEY_USAGES[usage] || seen[usage]) return false;
      seen[usage] = true;
    }
    return true;
  }

  function invalidTrustedKeyRecord(keyId, extra) {
    var result = {
      outcome: TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_RECORD_INVALID,
      keyId: keyId || null,
      record: null,
      publicKey: null,
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = extra[key];
      });
    }
    return result;
  }

  function buildTrustedKeyResolution(outcome, record, extra) {
    var result = {
      outcome: outcome,
      keyId: record && record.keyId || null,
      record: outcome === TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE ? record : null,
      publicKey: outcome === TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE ? record.publicKey : null,
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = extra[key];
      });
    }
    return result;
  }

  function normalizeTrustedKeyResolutionContext(context) {
    var normalized = context && typeof context === 'object' ? context : {};
    return {
      usage: normalized.usage || null,
      environment: normalized.environment || null,
      issuerId: normalized.issuerId || null,
      signatureTime: normalized.signatureTime || null,
      verificationTime: normalized.verificationTime || new Date().toISOString(),
      signatureMode: normalized.signatureMode || null,
    };
  }

  function resolveTrustedKeyRecord(keyId, context) {
    if (!keyId) {
      return invalidTrustedKeyRecord(keyId, { reason: 'key-id-missing' });
    }
    if (!isTrustedKeySourceAvailable()) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE, { keyId: keyId }, {
        reason: 'trusted-key-source-unavailable',
      });
    }

    var record = getTrustedKeyRecord(keyId);
    if (!record) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_UNKNOWN, { keyId: keyId });
    }

    var resolutionContext = normalizeTrustedKeyResolutionContext(context);
    if (
      !resolutionContext.usage
      || !resolutionContext.environment
      || !resolutionContext.issuerId
    ) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-resolution-context-invalid' });
    }
    if (!isAllowedStringArray(record.usage, resolutionContext.usage)) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_USAGE_DENIED, record);
    }
    if (typeof record.environment !== 'string' || record.environment !== resolutionContext.environment) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ENVIRONMENT_MISMATCH, record);
    }
    if (resolutionContext.signatureMode && resolutionContext.signatureMode !== 'signed-p256-v1') {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-signature-mode-incompatible' });
    }
    if (resolutionContext.issuerId && record.issuerId !== resolutionContext.issuerId) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_USAGE_DENIED, record, {
        reason: 'trusted-key-issuer-mismatch',
      });
    }

    var validFrom = parseStrictUtcTimestamp(record.validFrom);
    var validUntil = parseStrictUtcTimestamp(record.validUntil);
    var signatureTime = parseStrictUtcTimestamp(resolutionContext.signatureTime);
    var verificationTime = parseStrictUtcTimestamp(resolutionContext.verificationTime);
    if (signatureTime === null || verificationTime === null) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-timing-evidence-invalid' });
    }
    if (signatureTime > verificationTime + TRUSTED_KEY_CLOCK_SKEW_MS) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-signature-time-in-future' });
    }
    if (signatureTime < validFrom) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_NOT_YET_ACTIVE, record);
    }
    if (validUntil !== null && signatureTime > validUntil) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_EXPIRED, record);
    }

    if (record.status === 'ACTIVE') {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE, record);
    }

    if (record.status === 'REVOKED') {
      var revokedAt = parseStrictUtcTimestamp(record.revokedAt);
      if (revokedAt === null || !record.revocationPolicy) {
        return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-revocation-evidence-invalid' });
      }
      if (record.revocationPolicy === 'INVALIDATE_ALL_SIGNATURES') {
        return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_REVOKED, record);
      }
      if (record.revocationPolicy === 'INVALIDATE_AFTER_TIMESTAMP') {
        return verificationTime >= revokedAt
          ? buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_REVOKED, record)
          : buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE, record);
      }
      if (record.revocationPolicy === 'NO_NEW_SIGNATURES') {
        return signatureTime >= revokedAt
          ? buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_REVOKED, record)
          : buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE, record);
      }
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-revocation-policy-invalid' });
    }

    if (record.status === 'EXPIRED') {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_EXPIRED, record);
    }

    return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-status-invalid' });
  }

  Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_KEY_RESOLUTION', {
    value: Object.freeze({
      TRUSTED_KEY_OUTCOMES: TRUSTED_KEY_OUTCOMES,
      isTrustedKeySourceAvailable: isTrustedKeySourceAvailable,
      getTrustedKeyRecord: getTrustedKeyRecord,
      resolveTrustedKeyRecord: resolveTrustedKeyRecord,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
