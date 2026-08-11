/* coin-card-trusted-key-resolution-v3.js — promoted Coin Card trust authority
 *
 * This bridge-ready resolver preserves v1/v2 record semantics and adds the
 * governed v3 closed vocabulary. It is intentionally not part of the current
 * protected runtime until a separately authorized bridge release signs it.
 */

(function () {
  'use strict';

  var SCHEMAS = Object.freeze({
    'coin-card-trusted-key-record.v1': Object.freeze({
      'coin-card-manifest-signing': true,
      'coin-card-lifecycle-administration': true,
      'coin-card-registry-publication': true,
    }),
    'coin-card-trusted-key-record.v2': Object.freeze({
      'coin-card-manifest-signing': true,
      'coin-card-lifecycle-administration': true,
      'coin-card-registry-publication': true,
      'coin-card-transaction-evidence': true,
    }),
    'coin-card-trusted-key-record.v3': Object.freeze({
      'coin-card-manifest-signing': true,
      'coin-card-lifecycle-administration': true,
      'coin-card-registry-publication': true,
      'coin-card-executable-registry-head': true,
      'coin-card-transaction-evidence': true,
    }),
  });
  var OUTCOMES = Object.freeze({
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
  var RECORD_FIELDS = Object.freeze([
    'algorithm', 'environment', 'issuerId', 'keyId', 'publicKey',
    'revocationPolicy', 'revocationReason', 'revokedAt', 'schemaVersion',
    'status', 'successorKeyId', 'usage', 'validFrom', 'validUntil',
  ]);
  var STATUSES = Object.freeze({ ACTIVE: true, REVOKED: true, EXPIRED: true });
  var POLICIES = Object.freeze({
    INVALIDATE_ALL_SIGNATURES: true,
    INVALIDATE_AFTER_TIMESTAMP: true,
    NO_NEW_SIGNATURES: true,
  });
  var TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var COORDINATE = /^[A-Za-z0-9_-]{43}$/;
  var CLOCK_SKEW_MS = 5 * 60 * 1000;

  function ownDataNames(value) {
    if (!value || typeof value !== 'object') return null;
    if (Object.getOwnPropertySymbols(value).length) return null;
    var names = Object.getOwnPropertyNames(value);
    for (var i = 0; i < names.length; i++) {
      if (Array.isArray(value) && names[i] === 'length') continue;
      var descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || descriptor.enumerable !== true || typeof descriptor.value === 'function') return null;
    }
    if (Array.isArray(value)) {
      var indexes = names.filter(function (name) { return name !== 'length'; });
      if (indexes.length !== value.length) return null;
      for (var j = 0; j < indexes.length; j++) {
        if (indexes[j] !== String(j)) return null;
      }
      return indexes;
    }
    return names;
  }

  function frozenPlain(value, seen) {
    if (!value || typeof value !== 'object') return true;
    if (!Object.isFrozen(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return false;
    var names = ownDataNames(value);
    if (!names) return false;
    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return false;
    visited.push(value);
    for (var i = 0; i < names.length; i++) {
      if (!frozenPlain(Object.getOwnPropertyDescriptor(value, names[i]).value, visited)) return false;
    }
    return true;
  }

  function sameFields(value, fields) {
    var names = ownDataNames(value);
    if (!names || names.length !== fields.length) return false;
    var actual = names.slice().sort();
    var wanted = fields.slice().sort();
    for (var i = 0; i < wanted.length; i++) if (actual[i] !== wanted[i]) return false;
    return true;
  }

  function timestamp(value) {
    if (typeof value !== 'string' || !TIMESTAMP.test(value)) return null;
    var milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value
      ? milliseconds : null;
  }

  function validJwk(value) {
    return frozenPlain(value)
      && sameFields(value, ['crv', 'ext', 'key_ops', 'kty', 'x', 'y'])
      && value.kty === 'EC' && value.crv === 'P-256'
      && COORDINATE.test(value.x) && COORDINATE.test(value.y)
      && value.ext === true && Array.isArray(value.key_ops)
      && value.key_ops.length === 1 && value.key_ops[0] === 'verify';
  }

  function validUsage(record) {
    var allowed = SCHEMAS[record.schemaVersion];
    if (!allowed || !Array.isArray(record.usage) || !Object.isFrozen(record.usage)
      || record.usage.length < 1) return false;
    var seen = Object.create(null);
    for (var i = 0; i < record.usage.length; i++) {
      var usage = record.usage[i];
      if (allowed[usage] !== true || seen[usage]) return false;
      seen[usage] = true;
    }
    return true;
  }

  function validRecord(record, keyId) {
    if (!frozenPlain(record) || !sameFields(record, RECORD_FIELDS)) return false;
    if (record.keyId !== keyId || !SCHEMAS[record.schemaVersion]
      || record.algorithm !== 'ECDSA_P256_SHA256' || !validJwk(record.publicKey)) return false;
    if (typeof record.issuerId !== 'string' || !record.issuerId || !validUsage(record)
      || STATUSES[record.status] !== true || timestamp(record.validFrom) === null
      || typeof record.environment !== 'string' || !record.environment) return false;
    if (record.validUntil !== null && timestamp(record.validUntil) === null) return false;
    if (record.revokedAt !== null && timestamp(record.revokedAt) === null) return false;
    if (!(record.revocationReason === null
      || (typeof record.revocationReason === 'string' && record.revocationReason))) return false;
    if (!(record.revocationPolicy === null || POLICIES[record.revocationPolicy] === true)) return false;
    if (!(record.successorKeyId === null
      || (typeof record.successorKeyId === 'string' && record.successorKeyId
        && record.successorKeyId !== record.keyId))) return false;
    if (record.status === 'REVOKED') return record.revokedAt !== null && record.revocationPolicy !== null;
    return record.revokedAt === null && record.revocationReason === null && record.revocationPolicy === null;
  }

  function sourceAvailable() {
    var source = window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
    if (!frozenPlain(source) || Array.isArray(source)) return false;
    var ids = ownDataNames(source);
    if (!ids) return false;
    for (var i = 0; i < ids.length; i++) {
      if (!validRecord(Object.getOwnPropertyDescriptor(source, ids[i]).value, ids[i])) return false;
    }
    return true;
  }

  function getRecord(keyId) {
    if (!keyId || !sourceAvailable()) return null;
    var descriptor = Object.getOwnPropertyDescriptor(window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS, keyId);
    return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : null;
  }

  function result(outcome, record, extra) {
    var active = outcome === OUTCOMES.TRUSTED_KEY_ACTIVE;
    var value = {
      outcome: outcome, keyId: record && record.keyId || null,
      record: active ? record : null, publicKey: active ? record.publicKey : null,
    };
    if (extra) Object.keys(extra).forEach(function (key) { value[key] = extra[key]; });
    return value;
  }

  function invalid(keyId, reason) {
    return result(OUTCOMES.TRUSTED_KEY_RECORD_INVALID, { keyId: keyId || null }, { reason: reason });
  }

  function resolve(keyId, context) {
    if (!keyId) return invalid(keyId, 'key-id-missing');
    if (!sourceAvailable()) return result(OUTCOMES.TRUSTED_KEY_SOURCE_UNAVAILABLE, { keyId: keyId }, {
      reason: 'trusted-key-source-unavailable',
    });
    var record = getRecord(keyId);
    if (!record) return result(OUTCOMES.TRUSTED_KEY_UNKNOWN, { keyId: keyId });
    var value = context && typeof context === 'object' ? context : {};
    if (!value.usage || !value.environment || !value.issuerId) {
      return invalid(keyId, 'trusted-key-resolution-context-invalid');
    }
    if (record.usage.indexOf(value.usage) === -1) return result(OUTCOMES.TRUSTED_KEY_USAGE_DENIED, record);
    if (record.environment !== value.environment) return result(OUTCOMES.TRUSTED_KEY_ENVIRONMENT_MISMATCH, record);
    if (value.signatureMode && value.signatureMode !== 'signed-p256-v1') {
      return invalid(keyId, 'trusted-key-signature-mode-incompatible');
    }
    if (record.issuerId !== value.issuerId) {
      return result(OUTCOMES.TRUSTED_KEY_USAGE_DENIED, record, { reason: 'trusted-key-issuer-mismatch' });
    }
    var signed = timestamp(value.signatureTime);
    var verified = timestamp(value.verificationTime || new Date().toISOString());
    var validFrom = timestamp(record.validFrom);
    var validUntil = record.validUntil === null ? null : timestamp(record.validUntil);
    if (signed === null || verified === null) return invalid(keyId, 'trusted-key-timing-evidence-invalid');
    if (signed > verified + CLOCK_SKEW_MS) return invalid(keyId, 'trusted-key-signature-time-in-future');
    if (signed < validFrom) return result(OUTCOMES.TRUSTED_KEY_NOT_YET_ACTIVE, record);
    if (validUntil !== null && signed > validUntil) return result(OUTCOMES.TRUSTED_KEY_EXPIRED, record);
    if (record.status === 'ACTIVE') return result(OUTCOMES.TRUSTED_KEY_ACTIVE, record);
    if (record.status === 'EXPIRED') return result(OUTCOMES.TRUSTED_KEY_EXPIRED, record);
    var revoked = timestamp(record.revokedAt);
    if (record.revocationPolicy === 'INVALIDATE_ALL_SIGNATURES') return result(OUTCOMES.TRUSTED_KEY_REVOKED, record);
    if (record.revocationPolicy === 'INVALIDATE_AFTER_TIMESTAMP') {
      return verified >= revoked ? result(OUTCOMES.TRUSTED_KEY_REVOKED, record)
        : result(OUTCOMES.TRUSTED_KEY_ACTIVE, record);
    }
    if (record.revocationPolicy === 'NO_NEW_SIGNATURES') {
      return signed >= revoked ? result(OUTCOMES.TRUSTED_KEY_REVOKED, record)
        : result(OUTCOMES.TRUSTED_KEY_ACTIVE, record);
    }
    return invalid(keyId, 'trusted-key-revocation-policy-invalid');
  }

  Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_KEY_RESOLUTION', {
    value: Object.freeze({
      TRUSTED_KEY_OUTCOMES: OUTCOMES,
      TRUSTED_KEY_SCHEMA_USAGES: SCHEMAS,
      isTrustedKeySourceAvailable: sourceAvailable,
      getTrustedKeyRecord: getRecord,
      resolveTrustedKeyRecord: resolve,
    }),
    writable: false, enumerable: true, configurable: false,
  });
})();
