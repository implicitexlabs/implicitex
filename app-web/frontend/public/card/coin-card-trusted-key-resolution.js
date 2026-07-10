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

  function isPlainDataContainer(value) {
    if (Array.isArray(value)) return true;

    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isDeepFrozenPlainData(value, seen) {
    if (!value || typeof value !== 'object') return true;
    if (!Object.isFrozen(value)) return false;
    if (!isPlainDataContainer(value)) return false;
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return false;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return true;
    visited.push(value);

    var keys = Object.keys(value);
    for (var i = 0; i < keys.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, keys[i]);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) return false;
      if (typeof descriptor.value === 'function') return false;
      if (!isDeepFrozenPlainData(descriptor.value, visited)) return false;
    }
    return true;
  }

  function isTrustedKeySourceAvailable() {
    var trustedKeys = window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
    if (!trustedKeys || typeof trustedKeys !== 'object') return false;
    if (typeof Object.isFrozen !== 'function') return false;
    return isDeepFrozenPlainData(trustedKeys);
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

  function isAllowedStringArray(value, allowedValue) {
    if (!Array.isArray(value) || !Object.isFrozen(value) || value.length < 1) return false;
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string' || !value[i]) return false;
    }
    return value.indexOf(allowedValue) !== -1;
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
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-record-not-object' });
    }

    var resolutionContext = normalizeTrustedKeyResolutionContext(context);
    if (!isDeepFrozenPlainData(record)) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-record-not-deep-frozen-plain-data' });
    }
    if (
      record.schemaVersion !== TRUSTED_KEY_RECORD_SCHEMA_VERSION
      || record.keyId !== keyId
      || record.algorithm !== TRUSTED_KEY_ALGORITHM_P256
      || !record.publicKey
      || !record.issuerId
      || !record.usage
      || !record.status
      || !record.validFrom
      || !record.environment
      || !resolutionContext.usage
      || !resolutionContext.environment
      || !resolutionContext.issuerId
    ) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-record-required-field-invalid' });
    }
    if (!isValidPublicP256Jwk(record.publicKey)) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-public-jwk-invalid' });
    }
    if (!isAllowedStringArray(record.usage, resolutionContext.usage)) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_USAGE_DENIED, record);
    }
    if (typeof record.environment !== 'string' || record.environment !== resolutionContext.environment) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ENVIRONMENT_MISMATCH, record);
    }
    if (record.successorKeyId && record.successorKeyId === record.keyId) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-successor-self-reference' });
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
    if (validFrom === null || signatureTime === null || verificationTime === null || (record.validUntil && validUntil === null)) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-timing-evidence-invalid' });
    }
    if (signatureTime > verificationTime + TRUSTED_KEY_CLOCK_SKEW_MS) {
      return invalidTrustedKeyRecord(keyId, { reason: 'trusted-key-signature-time-in-future' });
    }
    if (signatureTime < validFrom) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_NOT_YET_ACTIVE, record);
    }
    if (validUntil && signatureTime > validUntil) {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_EXPIRED, record);
    }

    if (record.status === 'ACTIVE') {
      return buildTrustedKeyResolution(TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE, record);
    }

    if (record.status === 'REVOKED') {
      var revokedAt = parseStrictUtcTimestamp(record.revokedAt);
      if (!revokedAt || !record.revocationPolicy) {
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
