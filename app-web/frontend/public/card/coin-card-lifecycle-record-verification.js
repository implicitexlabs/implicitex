/* coin-card-lifecycle-record-verification.js — Coin Card lifecycle record authentication
 *
 * This module authenticates individual lifecycle registry records. It does not
 * resolve card lifecycle status, promote presentation state, or authorize
 * execution.
 */

(function () {
  'use strict';

  var LIFECYCLE_RECORD_SCHEMA_VERSION = 'coin-card-lifecycle-registry-record.v1';
  var LIFECYCLE_RECORD_SIGNATURE_DOMAIN = 'ImplicitEx Coin Card Lifecycle Registry Record v1';
  var TRUSTED_KEY_USAGE_REGISTRY_PUBLICATION = 'coin-card-registry-publication';
  var BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
  var STRICT_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var SHA256_BASE64URL_LENGTH = 43;
  var P256_P1363_BASE64URL_LENGTH = 86;
  var LIFECYCLE_RECORD_CLOCK_SKEW_MS = 5 * 60 * 1000;
  var LIFECYCLE_RECORD_FIELDS = Object.freeze([
    'administrationEvidenceHash',
    'authorityId',
    'cardId',
    'cardStatus',
    'effectiveFrom',
    'effectiveUntil',
    'environment',
    'manifestId',
    'manifestStatus',
    'previousManifestId',
    'publishedAt',
    'reasonCode',
    'recordId',
    'registryId',
    'registrySchemaVersion',
    'registryVersion',
    'revision',
    'signature',
    'supersededByManifestId',
  ]);
  var SIGNATURE_FIELDS = Object.freeze([
    'algorithm',
    'authorityId',
    'keyId',
    'mode',
    'signatureEncoding',
    'signatureLengthBytes',
    'signatureValueEncoding',
    'signedAt',
    'value',
  ]);
  var CARD_STATUSES = Object.freeze({
    CARD_ACTIVE: true,
    CARD_SUSPENDED: true,
    CARD_REVOKED: true,
  });
  var MANIFEST_STATUSES = Object.freeze({
    MANIFEST_CURRENT: true,
    MANIFEST_SUPERSEDED: true,
    MANIFEST_EXPIRED: true,
    MANIFEST_REVOKED: true,
  });
  var OUTCOMES = Object.freeze({
    LIFECYCLE_RECORD_AUTHENTICATED: 'LIFECYCLE_RECORD_AUTHENTICATED',
    LIFECYCLE_RECORD_SCHEMA_INVALID: 'LIFECYCLE_RECORD_SCHEMA_INVALID',
    LIFECYCLE_RECORD_CANONICALIZATION_INVALID: 'LIFECYCLE_RECORD_CANONICALIZATION_INVALID',
    LIFECYCLE_RECORD_SIGNATURE_METADATA_INVALID: 'LIFECYCLE_RECORD_SIGNATURE_METADATA_INVALID',
    LIFECYCLE_RECORD_SIGNATURE_ENCODING_INVALID: 'LIFECYCLE_RECORD_SIGNATURE_ENCODING_INVALID',
    LIFECYCLE_PUBLICATION_KEY_IMPORT_INVALID: 'LIFECYCLE_PUBLICATION_KEY_IMPORT_INVALID',
    LIFECYCLE_PUBLICATION_KEY_SOURCE_UNAVAILABLE: 'LIFECYCLE_PUBLICATION_KEY_SOURCE_UNAVAILABLE',
    LIFECYCLE_PUBLICATION_KEY_UNKNOWN: 'LIFECYCLE_PUBLICATION_KEY_UNKNOWN',
    LIFECYCLE_PUBLICATION_KEY_USAGE_DENIED: 'LIFECYCLE_PUBLICATION_KEY_USAGE_DENIED',
    LIFECYCLE_PUBLICATION_KEY_ENVIRONMENT_MISMATCH: 'LIFECYCLE_PUBLICATION_KEY_ENVIRONMENT_MISMATCH',
    LIFECYCLE_PUBLICATION_KEY_AUTHORITY_MISMATCH: 'LIFECYCLE_PUBLICATION_KEY_AUTHORITY_MISMATCH',
    LIFECYCLE_PUBLICATION_KEY_NOT_YET_ACTIVE: 'LIFECYCLE_PUBLICATION_KEY_NOT_YET_ACTIVE',
    LIFECYCLE_PUBLICATION_KEY_EXPIRED: 'LIFECYCLE_PUBLICATION_KEY_EXPIRED',
    LIFECYCLE_PUBLICATION_KEY_REVOKED: 'LIFECYCLE_PUBLICATION_KEY_REVOKED',
    LIFECYCLE_PUBLICATION_KEY_TIMING_INVALID: 'LIFECYCLE_PUBLICATION_KEY_TIMING_INVALID',
    LIFECYCLE_VERIFICATION_TIME_INVALID: 'LIFECYCLE_VERIFICATION_TIME_INVALID',
    LIFECYCLE_RECORD_PUBLICATION_TIME_INVALID: 'LIFECYCLE_RECORD_PUBLICATION_TIME_INVALID',
    LIFECYCLE_RECORD_SIGNATURE_INVALID: 'LIFECYCLE_RECORD_SIGNATURE_INVALID',
    LIFECYCLE_CRYPTO_UNAVAILABLE: 'LIFECYCLE_CRYPTO_UNAVAILABLE',
  });

  function hasOwnTrue(map, value) {
    return typeof value === 'string'
      && Object.prototype.hasOwnProperty.call(map, value)
      && map[value] === true;
  }

  function getOwnDataPropertyNames(value) {
    if (!value || typeof value !== 'object') return null;
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return null;

    var names = Object.getOwnPropertyNames(value);
    for (var i = 0; i < names.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
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

  function isPlainDataContainer(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
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

  function hasExactFields(value, fields) {
    return sameStringSet(getOwnDataPropertyNames(value), fields);
  }

  function snapshotPlainData(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
      return value;
    }
    if (
      typeof value === 'undefined'
      || typeof value === 'function'
      || typeof value === 'symbol'
      || !value
      || typeof value !== 'object'
      || Array.isArray(value)
      || !isPlainDataContainer(value)
    ) {
      return undefined;
    }

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return undefined;
    visited.push(value);

    var keys = getOwnDataPropertyNames(value);
    if (!keys) return undefined;

    var snapshot = {};
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      var descriptor = Object.getOwnPropertyDescriptor(value, key);
      var fieldValue = snapshotPlainData(descriptor.value, visited);
      if (fieldValue === undefined) return undefined;
      snapshot[key] = fieldValue;
    }
    return Object.freeze(snapshot);
  }

  function readOwnEnumerableDataProperty(value, name) {
    if (!value || typeof value !== 'object') return null;
    var descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (
      !descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true
    ) {
      return null;
    }
    return descriptor.value;
  }

  function decodeCanonicalBase64Url(value, expectedEncodedLength, expectedDecodedLength) {
    if (
      !isNonemptyString(value)
      || value.length !== expectedEncodedLength
      || !BASE64URL_RE.test(value)
      || value.indexOf('=') !== -1
    ) {
      return null;
    }

    var decoded = decodeBase64Url(value, expectedEncodedLength);
    if (!decoded || decoded.length !== expectedDecodedLength || encodeBase64Url(decoded) !== value) {
      return null;
    }
    return decoded;
  }

  function parseStrictUtcTimestamp(value) {
    if (typeof value !== 'string' || !STRICT_UTC_TIMESTAMP_RE.test(value)) return null;
    var milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    if (new Date(milliseconds).toISOString() !== value) return null;
    return milliseconds;
  }

  function isNonemptyString(value) {
    return typeof value === 'string' && value.length > 0;
  }

  function isNullOrNonemptyString(value) {
    return value === null || isNonemptyString(value);
  }

  function isNullOrStrictTimestamp(value) {
    return value === null || parseStrictUtcTimestamp(value) !== null;
  }

  function isNullOrSha256Base64Url(value) {
    return value === null || decodeCanonicalBase64Url(value, SHA256_BASE64URL_LENGTH, 32) !== null;
  }

  function isSafePositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0);
  }

  function getRegistryApi() {
    return window.IX_COIN_CARD_LIFECYCLE_REGISTRY || null;
  }

  function getTrustedKeyApi() {
    return window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION || null;
  }

  function getCryptoSubtle() {
    return window.crypto && window.crypto.subtle
      && typeof window.crypto.subtle.importKey === 'function'
      && typeof window.crypto.subtle.verify === 'function'
      ? window.crypto.subtle
      : null;
  }

  function freezeKeyResolutionSnapshot(keyResolution) {
    if (!keyResolution || typeof keyResolution !== 'object' || Array.isArray(keyResolution)) return null;
    var keys = getOwnDataPropertyNames(keyResolution);
    if (!keys) return null;

    var snapshot = {};
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      snapshot[key] = keyResolution[key];
    }
    return Object.freeze(snapshot);
  }

  function failure(outcome, extra) {
    var result = {
      outcome: outcome,
      authenticated: false,
      record: null,
      publicKey: null,
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = key === 'keyResolution'
          ? freezeKeyResolutionSnapshot(extra[key])
          : extra[key];
      });
    }
    return Object.freeze(result);
  }

  function success(record, keyResolution) {
    return Object.freeze({
      outcome: OUTCOMES.LIFECYCLE_RECORD_AUTHENTICATED,
      authenticated: true,
      recordId: record.recordId,
      registryId: record.registryId,
      registryVersion: record.registryVersion,
      authorityId: record.authorityId,
      keyId: record.signature.keyId,
      record: record,
      keyResolution: freezeKeyResolutionSnapshot(keyResolution),
    });
  }

  function validateSignatureMetadata(signature, record) {
    if (!signature || typeof signature !== 'object' || Array.isArray(signature)) return false;
    if (!hasExactFields(signature, SIGNATURE_FIELDS)) return false;
    if (signature.mode !== 'signed-p256-v1') return false;
    if (signature.algorithm !== 'ECDSA_P256_SHA256') return false;
    if (signature.signatureEncoding !== 'ieee-p1363') return false;
    if (signature.signatureLengthBytes !== 64) return false;
    if (signature.signatureValueEncoding !== 'base64url-unpadded') return false;
    if (!isNonemptyString(signature.keyId)) return false;
    if (signature.authorityId !== record.authorityId) return false;
    if (parseStrictUtcTimestamp(signature.signedAt) === null) return false;
    if (!isNonemptyString(signature.value) || !BASE64URL_RE.test(signature.value) || signature.value.indexOf('=') !== -1) return false;
    return true;
  }

  function validateLifecycleRecordSchema(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
    if (!hasExactFields(record, LIFECYCLE_RECORD_FIELDS)) return false;
    if (record.registrySchemaVersion !== LIFECYCLE_RECORD_SCHEMA_VERSION) return false;
    if (!isNonemptyString(record.registryId)) return false;
    if (!isNonemptyString(record.environment)) return false;
    if (!isSafePositiveInteger(record.registryVersion)) return false;
    if (!isNonemptyString(record.recordId)) return false;
    if (parseStrictUtcTimestamp(record.publishedAt) === null) return false;
    if (!isNonemptyString(record.cardId)) return false;
    if (!isNonemptyString(record.manifestId)) return false;
    if (!isSafePositiveInteger(record.revision)) return false;
    if (!isNullOrNonemptyString(record.previousManifestId)) return false;
    if (!hasOwnTrue(CARD_STATUSES, record.cardStatus)) return false;
    if (!hasOwnTrue(MANIFEST_STATUSES, record.manifestStatus)) return false;
    if (parseStrictUtcTimestamp(record.effectiveFrom) === null) return false;
    if (!isNullOrStrictTimestamp(record.effectiveUntil)) return false;
    if (!isNullOrNonemptyString(record.supersededByManifestId)) return false;
    if (!isNullOrNonemptyString(record.reasonCode)) return false;
    if (!isNonemptyString(record.authorityId)) return false;
    if (!isNullOrSha256Base64Url(record.administrationEvidenceHash)) return false;
    if (record.revision === 1 && record.previousManifestId !== null) return false;
    if (record.revision > 1 && !isNonemptyString(record.previousManifestId)) return false;
    if (record.manifestStatus === 'MANIFEST_SUPERSEDED' && !isNonemptyString(record.supersededByManifestId)) return false;
    if (record.manifestStatus !== 'MANIFEST_SUPERSEDED' && record.supersededByManifestId !== null) return false;
    if (record.effectiveUntil !== null && parseStrictUtcTimestamp(record.effectiveUntil) <= parseStrictUtcTimestamp(record.effectiveFrom)) return false;
    return true;
  }

  function buildSignaturePayload(record) {
    var signaturePayload = {};
    var signatureKeys = getOwnDataPropertyNames(record.signature);
    if (!signatureKeys) return null;
    for (var i = 0; i < signatureKeys.length; i++) {
      var signatureKey = signatureKeys[i];
      if (signatureKey !== 'value') {
        signaturePayload[signatureKey] = record.signature[signatureKey];
      }
    }

    var payload = {};
    var keys = getOwnDataPropertyNames(record);
    if (!keys) return null;
    for (var j = 0; j < keys.length; j++) {
      var key = keys[j];
      payload[key] = key === 'signature' ? signaturePayload : record[key];
    }
    return payload;
  }

  function decodeBase64Url(value, expectedLength) {
    if (!isNonemptyString(value) || value.length !== expectedLength || !BASE64URL_RE.test(value) || value.indexOf('=') !== -1) return null;
    var base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';

    var atobImpl = (window && typeof window.atob === 'function')
      ? window.atob
      : (typeof atob === 'function' ? atob : null);
    var binary = null;
    if (atobImpl) {
      try {
        binary = atobImpl(base64);
      } catch (err) {
        return null;
      }
    } else if (typeof Buffer !== 'undefined') {
      binary = Buffer.from(base64, 'base64').toString('binary');
    }
    if (binary === null) return null;

    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function encodeBase64Url(bytes) {
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
    return encoded ? encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') : null;
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

  function buildSignedPayloadBytes(canonicalPayload) {
    var domainBytes = encodeUtf8(LIFECYCLE_RECORD_SIGNATURE_DOMAIN);
    var payloadBytes = encodeUtf8(canonicalPayload);
    if (!domainBytes || !payloadBytes) return null;
    return concatBytes(domainBytes, new Uint8Array([0]), payloadBytes);
  }

  function mapTrustedKeyOutcome(keyResolution) {
    var trustedOutcomes = getTrustedKeyApi() && getTrustedKeyApi().TRUSTED_KEY_OUTCOMES || {};
    if (!keyResolution || !keyResolution.outcome) return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_SOURCE_UNAVAILABLE;
    if (keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_SOURCE_UNAVAILABLE) return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_SOURCE_UNAVAILABLE;
    if (keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_UNKNOWN) return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_UNKNOWN;
    if (keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_USAGE_DENIED) {
      return keyResolution.reason === 'trusted-key-issuer-mismatch'
        ? OUTCOMES.LIFECYCLE_PUBLICATION_KEY_AUTHORITY_MISMATCH
        : OUTCOMES.LIFECYCLE_PUBLICATION_KEY_USAGE_DENIED;
    }
    if (keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_ENVIRONMENT_MISMATCH) return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_ENVIRONMENT_MISMATCH;
    if (keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_NOT_YET_ACTIVE) return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_NOT_YET_ACTIVE;
    if (keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_EXPIRED) return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_EXPIRED;
    if (keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_REVOKED) return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_REVOKED;
    if (
      keyResolution.outcome === trustedOutcomes.TRUSTED_KEY_RECORD_INVALID
      && (
        keyResolution.reason === 'trusted-key-signature-time-in-future'
        || keyResolution.reason === 'trusted-key-timing-evidence-invalid'
        || keyResolution.reason === 'trusted-key-resolution-context-invalid'
      )
    ) {
      return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_TIMING_INVALID;
    }
    return OUTCOMES.LIFECYCLE_PUBLICATION_KEY_SOURCE_UNAVAILABLE;
  }

  function authenticateLifecycleRecord(record, options) {
    var verificationTime = new Date().toISOString();
    if (
      options
      && typeof options === 'object'
      && !Array.isArray(options)
      && Object.prototype.hasOwnProperty.call(options, 'verificationTime')
      && Object.getOwnPropertyDescriptor(options, 'verificationTime')
      && Object.getOwnPropertyDescriptor(options, 'verificationTime').enumerable === true
    ) {
      verificationTime = readOwnEnumerableDataProperty(options, 'verificationTime');
    }
    var verificationTimeMs = parseStrictUtcTimestamp(verificationTime);
    var registryApi = getRegistryApi();
    var trustedKeyApi = getTrustedKeyApi();
    var subtle = getCryptoSubtle();

    if (!registryApi || typeof registryApi.canonicalizeJson !== 'function') {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_RECORD_CANONICALIZATION_INVALID, {
        reason: 'lifecycle-registry-canonicalizer-unavailable',
      }));
    }
    if (!trustedKeyApi || typeof trustedKeyApi.resolveTrustedKeyRecord !== 'function') {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_PUBLICATION_KEY_SOURCE_UNAVAILABLE, {
        reason: 'trusted-key-resolution-unavailable',
      }));
    }
    if (!subtle) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_CRYPTO_UNAVAILABLE));
    }
    if (verificationTimeMs === null) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_VERIFICATION_TIME_INVALID, {
        reason: 'lifecycle-verification-time-invalid',
      }));
    }
    var snapshot = snapshotPlainData(record, []);
    if (!snapshot || !validateLifecycleRecordSchema(snapshot)) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_RECORD_SCHEMA_INVALID));
    }
    if (!validateSignatureMetadata(snapshot.signature, snapshot)) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_METADATA_INVALID));
    }

    var publishedAtMs = parseStrictUtcTimestamp(snapshot.publishedAt);
    var signedAtMs = parseStrictUtcTimestamp(snapshot.signature.signedAt);
    if (signedAtMs === null || publishedAtMs === null || signedAtMs > publishedAtMs) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_RECORD_PUBLICATION_TIME_INVALID, {
        reason: 'lifecycle-record-signature-time-order-invalid',
      }));
    }
    if (publishedAtMs > verificationTimeMs + LIFECYCLE_RECORD_CLOCK_SKEW_MS) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_RECORD_PUBLICATION_TIME_INVALID, {
        reason: 'lifecycle-record-publication-time-in-future',
      }));
    }

    var payload = buildSignaturePayload(snapshot);
    var canonicalPayload = payload ? registryApi.canonicalizeJson(payload) : null;
    var payloadBytes = canonicalPayload ? buildSignedPayloadBytes(canonicalPayload) : null;
    if (!canonicalPayload || !payloadBytes) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_RECORD_CANONICALIZATION_INVALID));
    }

    var signatureBytes = decodeBase64Url(snapshot.signature.value, P256_P1363_BASE64URL_LENGTH);
    if (!signatureBytes || signatureBytes.length !== 64 || encodeBase64Url(signatureBytes) !== snapshot.signature.value) {
      return Promise.resolve(failure(OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_ENCODING_INVALID));
    }

    var keyResolution = trustedKeyApi.resolveTrustedKeyRecord(snapshot.signature.keyId, {
      usage: TRUSTED_KEY_USAGE_REGISTRY_PUBLICATION,
      environment: snapshot.environment,
      issuerId: snapshot.authorityId,
      signatureTime: snapshot.signature.signedAt,
      verificationTime: verificationTime,
      signatureMode: snapshot.signature.mode,
    });
    if (!keyResolution || keyResolution.outcome !== trustedKeyApi.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE || !keyResolution.publicKey) {
      return Promise.resolve(failure(mapTrustedKeyOutcome(keyResolution), {
        keyId: snapshot.signature.keyId,
        keyResolution: keyResolution || null,
      }));
    }

    return subtle.importKey(
      'jwk',
      keyResolution.publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    ).then(function (publicKey) {
      return subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        publicKey,
        signatureBytes,
        payloadBytes
      ).then(function (valid) {
        return valid
          ? success(snapshot, keyResolution)
          : failure(OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_INVALID, {
            keyId: snapshot.signature.keyId,
            keyResolution: keyResolution,
          });
      }, function () {
        return failure(OUTCOMES.LIFECYCLE_RECORD_SIGNATURE_INVALID, {
          keyId: snapshot.signature.keyId,
          keyResolution: keyResolution,
        });
      });
    }, function () {
      return failure(OUTCOMES.LIFECYCLE_PUBLICATION_KEY_IMPORT_INVALID, {
        keyId: snapshot.signature.keyId,
        keyResolution: keyResolution,
      });
    });
  }

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_RECORD_VERIFICATION', {
    value: Object.freeze({
      LIFECYCLE_RECORD_SCHEMA_VERSION: LIFECYCLE_RECORD_SCHEMA_VERSION,
      LIFECYCLE_RECORD_SIGNATURE_DOMAIN: LIFECYCLE_RECORD_SIGNATURE_DOMAIN,
      OUTCOMES: OUTCOMES,
      authenticateLifecycleRecord: authenticateLifecycleRecord,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
