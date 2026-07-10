/* coin-card-verification.js — Coin Card Integrity Manifest verification state and browser-side hash check
 *
 * The browser can verify Integrity Manifest asset hashes, but only VERIFIED may execute.
 * Hash consistency is evidence; signature policy still decides trust.
 */

(function () {
  'use strict';

  var STATES = Object.freeze({
    VERIFIED: 'VERIFIED',
    ASSET_HASHES_PASSED: 'ASSET_HASHES_PASSED',
    INTEGRITY_FAILED: 'INTEGRITY_FAILED',
    CARD_REVOKED: 'CARD_REVOKED',
    VERIFICATION_UNAVAILABLE: 'VERIFICATION_UNAVAILABLE',
  });

  var MANIFEST_SCHEMA_VERSION = 'coin-card-manifest.v1';
  var REQUIRED_MANIFEST_FIELDS = Object.freeze([
    'schemaVersion',
    'cardId',
    'coinCardVersion',
    'recipient',
    'network',
    'registryStatus',
    'layoutVersion',
    'buildVersion',
    'assets',
    'signature',
    'manifestHash',
  ]);
  var REQUIRED_ASSET_PATHS = Object.freeze([
    'js/ix-execution.js',
    'card/coin-card-trusted-keys.js',
    'card/coin-card-verification.js',
    'card/card.js',
    'card/card.css',
  ]);
  var SUPPORTED_SIGNATURE_MODES = Object.freeze({
    'signed-p256-v1': true,
  });
  var TRUSTED_KEY_RECORD_SCHEMA_VERSION = 'coin-card-trusted-key-record.v1';
  var TRUSTED_KEY_USAGE_MANIFEST_SIGNING = 'coin-card-manifest-signing';
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

  var STATE_SET = Object.freeze({
    VERIFIED: true,
    ASSET_HASHES_PASSED: true,
    INTEGRITY_FAILED: true,
    CARD_REVOKED: true,
    VERIFICATION_UNAVAILABLE: true,
  });

  var STATE_COPY = Object.freeze({
    VERIFIED: Object.freeze({
      statusLabel: 'Verified',
      primaryMessage: 'This Coin Card matches the issued ImplicitEx package.',
      secondaryMessage: 'The protected assets and Integrity Manifest evidence are valid for this card.',
      actionLabel: 'Continue',
    }),
    ASSET_HASHES_PASSED: Object.freeze({
      statusLabel: 'Integrity checks passed',
      primaryMessage: 'This Coin Card matches the issued Integrity Manifest assets.',
      secondaryMessage: 'Protected asset hashes match, but execution remains disabled until signature policy is resolved.',
      actionLabel: 'Transfers disabled',
    }),
    INTEGRITY_FAILED: Object.freeze({
      statusLabel: 'Integrity check failed',
      primaryMessage: 'This Coin Card does not match the issued ImplicitEx package.',
      secondaryMessage: 'Protected card files changed after issuance. Transfers are disabled.',
      actionLabel: 'Transfers disabled',
    }),
    CARD_REVOKED: Object.freeze({
      statusLabel: 'Revoked',
      primaryMessage: 'This Coin Card is no longer operationally valid.',
      secondaryMessage: 'The registry marks this card as revoked. Transfers are disabled.',
      actionLabel: 'Transfers disabled',
    }),
    VERIFICATION_UNAVAILABLE: Object.freeze({
      statusLabel: 'Verification unavailable',
      primaryMessage: 'This Coin Card cannot currently be verified.',
      secondaryMessage: 'The Integrity Manifest, registry, protected files, or signature evidence could not be checked. Transfers are disabled.',
      actionLabel: 'Transfers disabled',
    }),
  });

  function normalizeState(state) {
    return STATE_SET[state] ? state : STATES.VERIFICATION_UNAVAILABLE;
  }

  function getStateCopy(state) {
    return STATE_COPY[normalizeState(state)];
  }

  function canExecuteTransfer(state) {
    return normalizeState(state) === STATES.VERIFIED;
  }

  function getRequiredAssetPaths() {
    return REQUIRED_ASSET_PATHS.slice();
  }

  function getAssetPaths(integrityManifest) {
    if (!integrityManifest || !Array.isArray(integrityManifest.assets)) return [];
    return integrityManifest.assets.map(function (asset) {
      return asset && asset.path;
    });
  }

  function hasRequiredAssets(integrityManifest) {
    var assetPaths = getAssetPaths(integrityManifest);
    if (assetPaths.length !== REQUIRED_ASSET_PATHS.length) return false;

    var seen = {};
    for (var i = 0; i < assetPaths.length; i++) {
      var path = assetPaths[i];
      if (!path || seen[path]) return false;
      seen[path] = true;
    }

    for (var j = 0; j < REQUIRED_ASSET_PATHS.length; j++) {
      if (!seen[REQUIRED_ASSET_PATHS[j]]) return false;
    }

    return true;
  }

  function hasRequiredAssetHashes(integrityManifest) {
    if (!hasRequiredAssets(integrityManifest)) return false;

    for (var i = 0; i < integrityManifest.assets.length; i++) {
      var asset = integrityManifest.assets[i];
      if (!asset || typeof asset.sha256 !== 'string' || !asset.sha256.trim()) {
        return false;
      }
    }

    return true;
  }

  function canonicalizeValue(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) {
        return canonicalizeValue(item);
      });
    }
    if (!value || typeof value !== 'object') {
      return value;
    }

    var canonical = {};
    Object.keys(value).sort().forEach(function (key) {
      canonical[key] = canonicalizeValue(value[key]);
    });
    return canonical;
  }

  function canonicalizeIntegrityManifestPayload(integrityManifest) {
    if (!integrityManifest || typeof integrityManifest !== 'object' || Array.isArray(integrityManifest)) {
      return '';
    }

    var payload = {};
    Object.keys(integrityManifest).sort().forEach(function (key) {
      if (key === 'signature' || key === 'manifestHash') return;
      payload[key] = canonicalizeValue(integrityManifest[key]);
    });

    return JSON.stringify(payload);
  }

  function isTrustedKeySourceAvailable() {
    var trustedKeys = window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
    if (!trustedKeys || typeof trustedKeys !== 'object') return false;
    if (typeof Object.isFrozen !== 'function') return false;
    return Object.isFrozen(trustedKeys);
  }

  function getTrustedKeyRecord(keyId) {
    if (!keyId || !isTrustedKeySourceAvailable()) return null;

    var trustedKeys = window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
    if (!Object.prototype.hasOwnProperty.call(trustedKeys, keyId)) return null;
    return trustedKeys[keyId] || null;
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

  function readSignedManifestField(integrityManifest, field) {
    return integrityManifest && integrityManifest[field] || null;
  }

  function readDuplicateSignatureField(signature, field) {
    if (!signature || !Object.prototype.hasOwnProperty.call(signature, field)) {
      return {
        present: false,
        value: undefined,
      };
    }
    return {
      present: true,
      value: signature[field],
    };
  }

  function buildTrustedKeyResolutionContext(integrityManifest, signatureMode) {
    var signature = integrityManifest && integrityManifest.signature;
    var keyId = readSignedManifestField(integrityManifest, 'keyId');
    var issuerId = readSignedManifestField(integrityManifest, 'issuerId');
    var environment = readSignedManifestField(integrityManifest, 'environment');
    var signedAt = readSignedManifestField(integrityManifest, 'signedAt');

    if (!keyId || !issuerId || !environment || !signedAt) {
      return unavailable('integrity-manifest-signature-context-missing');
    }

    var duplicateFields = {
      keyId: keyId,
      issuerId: issuerId,
      environment: environment,
      signedAt: signedAt,
    };
    var fieldNames = Object.keys(duplicateFields);
    for (var i = 0; i < fieldNames.length; i++) {
      var fieldName = fieldNames[i];
      var duplicate = readDuplicateSignatureField(signature, fieldName);
      if (duplicate.present && duplicate.value !== duplicateFields[fieldName]) {
        return unavailable('integrity-manifest-signature-context-mismatch', { field: fieldName });
      }
    }

    return {
      state: null,
      keyId: keyId,
      context: {
        usage: TRUSTED_KEY_USAGE_MANIFEST_SIGNING,
        environment: environment,
        issuerId: issuerId,
        signatureTime: signedAt,
        verificationTime: new Date().toISOString(),
        signatureMode: signatureMode,
      },
    };
  }

  function getCryptoSubtleForVerify() {
    return window.crypto
      && window.crypto.subtle
      && typeof window.crypto.subtle.importKey === 'function'
      && typeof window.crypto.subtle.verify === 'function'
      ? window.crypto.subtle
      : null;
  }

  function base64UrlToBytes(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    var normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4) normalized += '=';

    var atobImpl = (window && typeof window.atob === 'function')
      ? window.atob
      : (typeof atob === 'function' ? atob : null);
    if (atobImpl) {
      var binary = atobImpl(normalized);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(normalized, 'base64'));
    }

    return null;
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

  function getCryptoSubtle() {
    return window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function'
      ? window.crypto.subtle
      : null;
  }

  function bufferToHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = '';
    for (var i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
  }

  function sha256Hex(bytes) {
    var subtle = getCryptoSubtle();
    if (!subtle) {
      return Promise.resolve(null);
    }
    return subtle.digest('SHA-256', bytes).then(function (digest) {
      return 'sha256:' + bufferToHex(digest);
    });
  }

  function fetchArrayBuffer(request, url) {
    return Promise.resolve()
      .then(function () {
        return request(url);
      })
      .then(function (response) {
        if (!response || response.ok === false) {
          return unavailable('integrity-manifest-asset-fetch-failed', { assetPath: url });
        }
        if (typeof response.arrayBuffer !== 'function') {
          return unavailable('integrity-manifest-asset-response-invalid', { assetPath: url });
        }
        return response.arrayBuffer().then(function (buffer) {
          return buffer;
        }, function () {
          return unavailable('integrity-manifest-asset-read-failed', { assetPath: url });
        });
      }, function () {
        return unavailable('integrity-manifest-asset-fetch-failed', { assetPath: url });
      });
  }

  function findAssetByPath(integrityManifest, assetPath) {
    for (var i = 0; i < integrityManifest.assets.length; i++) {
      if (integrityManifest.assets[i] && integrityManifest.assets[i].path === assetPath) {
        return integrityManifest.assets[i];
      }
    }
    return null;
  }

  function verifyIntegrityManifestAssets(preparedResult, request) {
    var subtle = getCryptoSubtle();
    if (!subtle) {
      return Promise.resolve(unavailable('integrity-manifest-crypto-unavailable'));
    }

    var integrityManifest = preparedResult.integrityManifest;
    if (!hasRequiredAssetHashes(integrityManifest)) {
      return Promise.resolve(unavailable('integrity-manifest-asset-hash-missing'));
    }

    var assetPaths = getAssetPaths(integrityManifest);
    var assetVerifications = assetPaths.map(function (assetPath) {
      var declaredAsset = findAssetByPath(integrityManifest, assetPath);

      return fetchArrayBuffer(request, assetPath).then(function (bufferOrResult) {
        if (bufferOrResult && bufferOrResult.state === STATES.VERIFICATION_UNAVAILABLE) {
          return bufferOrResult;
        }
        return sha256Hex(bufferOrResult).then(function (computedSha256) {
          if (computedSha256 !== declaredAsset.sha256) {
            return {
              state: STATES.INTEGRITY_FAILED,
              integrityManifest: null,
              metadata: null,
              error: 'integrity-manifest-asset-hash-mismatch',
              assetPath: assetPath,
              expectedSha256: declaredAsset.sha256,
              computedSha256: computedSha256,
            };
          }
          return {
            assetPath: assetPath,
            sha256: computedSha256,
          };
        });
      });
    });

    return Promise.all(assetVerifications).then(function (results) {
      for (var i = 0; i < results.length; i++) {
        if (results[i] && results[i].state === STATES.VERIFICATION_UNAVAILABLE) {
          return results[i];
        }
        if (results[i] && results[i].state === STATES.INTEGRITY_FAILED) {
          return results[i];
        }
      }

      var metadata = Object.assign({}, preparedResult.metadata, {
        assetIntegrityStatus: 'passed',
      });
      return {
        state: STATES.ASSET_HASHES_PASSED,
        integrityManifest: integrityManifest,
        metadata: metadata,
        error: null,
        requiredAssetPaths: getRequiredAssetPaths(),
        assetPaths: assetPaths,
      };
    });
  }

  function readIntegrityManifestPointer(root) {
    if (!root || typeof root.getAttribute !== 'function') {
      return {
        state: STATES.VERIFICATION_UNAVAILABLE,
        integrityManifestUrl: null,
        manifestUrl: null,
        error: 'integrity-manifest-root-unavailable',
      };
    }

    var raw = root.getAttribute('data-ix-manifest');
    var manifestUrl = raw == null ? '' : String(raw).trim();
    if (!manifestUrl) {
      return {
        state: STATES.VERIFICATION_UNAVAILABLE,
        integrityManifestUrl: null,
        manifestUrl: null,
        error: 'integrity-manifest-pointer-missing',
      };
    }

    return {
      state: null,
      integrityManifestUrl: manifestUrl,
      manifestUrl: manifestUrl,
      error: null,
    };
  }

  function unavailable(error, extra) {
    var result = {
      state: STATES.VERIFICATION_UNAVAILABLE,
      integrityManifest: null,
      metadata: null,
      error: error,
    };
    if (extra) {
      Object.keys(extra).forEach(function (key) {
        result[key] = extra[key];
      });
    }
    return result;
  }

  function buildIntegrityManifestMetadata(integrityManifest) {
    return {
      schemaVersion: integrityManifest.schemaVersion,
      cardId: integrityManifest.cardId,
      coinCardVersion: integrityManifest.coinCardVersion,
      recipient: integrityManifest.recipient,
      network: integrityManifest.network,
      registryStatus: integrityManifest.registryStatus,
      layoutVersion: integrityManifest.layoutVersion,
      buildVersion: integrityManifest.buildVersion,
      manifestHash: integrityManifest.manifestHash,
      signatureMode: integrityManifest.signature && integrityManifest.signature.mode || null,
      assetPaths: Array.isArray(integrityManifest.assets)
        ? integrityManifest.assets.map(function (asset) { return asset && asset.path; })
        : [],
    };
  }

  function normalizeLoadedIntegrityManifest(integrityManifest) {
    if (!integrityManifest || typeof integrityManifest !== 'object' || Array.isArray(integrityManifest)) {
      return unavailable('integrity-manifest-invalid');
    }
    if (integrityManifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      return unavailable('integrity-manifest-schema-unsupported');
    }

    for (var i = 0; i < REQUIRED_MANIFEST_FIELDS.length; i++) {
      var field = REQUIRED_MANIFEST_FIELDS[i];
      if (!integrityManifest[field]) {
        return unavailable('integrity-manifest-missing-required-field', { field: field });
      }
    }
    if (!Array.isArray(integrityManifest.assets) || !integrityManifest.assets.length) {
      return unavailable('integrity-manifest-missing-required-field', { field: 'assets' });
    }
    if (!integrityManifest.signature || typeof integrityManifest.signature !== 'object') {
      return unavailable('integrity-manifest-missing-required-field', { field: 'signature' });
    }
    if (!hasRequiredAssets(integrityManifest)) {
      return unavailable('integrity-manifest-asset-policy-mismatch', {
        requiredAssetPaths: getRequiredAssetPaths(),
        assetPaths: getAssetPaths(integrityManifest),
      });
    }
    if (!hasRequiredAssetHashes(integrityManifest)) {
      return unavailable('integrity-manifest-asset-hash-missing', {
        requiredAssetPaths: getRequiredAssetPaths(),
        assetPaths: getAssetPaths(integrityManifest),
      });
    }

    return {
      state: STATES.VERIFICATION_UNAVAILABLE,
      integrityManifest: integrityManifest,
      metadata: buildIntegrityManifestMetadata(integrityManifest),
      error: null,
    };
  }

  function loadIntegrityManifest(pointer, fetchImpl) {
    var manifestUrl = typeof pointer === 'string'
      ? pointer.trim()
      : pointer && (pointer.integrityManifestUrl || pointer.manifestUrl);
    if (!manifestUrl) {
      return Promise.resolve(unavailable('integrity-manifest-pointer-missing'));
    }

    var request = fetchImpl || window.fetch;
    if (typeof request !== 'function') {
      return Promise.resolve(unavailable('integrity-manifest-fetch-unavailable'));
    }

    return Promise.resolve()
      .then(function () {
        return request(manifestUrl);
      })
      .then(function (response) {
        if (!response || response.ok === false) {
          return unavailable('integrity-manifest-fetch-failed');
        }
        if (typeof response.json !== 'function') {
          return unavailable('integrity-manifest-response-invalid');
        }
        return response.json()
          .then(function (integrityManifest) {
            return normalizeLoadedIntegrityManifest(integrityManifest);
          }, function () {
            return unavailable('integrity-manifest-parse-failed');
          });
      }, function () {
        return unavailable('integrity-manifest-fetch-failed');
      })
      .then(function (preparedResult) {
        if (preparedResult.state === STATES.VERIFICATION_UNAVAILABLE && preparedResult.error) {
          return preparedResult;
        }
        if (!preparedResult.integrityManifest) {
          return preparedResult;
        }
        return verifyIntegrityManifestAssets(preparedResult, request)
          .then(function (assetResult) {
            return evaluateSignaturePolicy(preparedResult.integrityManifest, assetResult);
          });
      });
  }

  function evaluateSignaturePolicy(integrityManifest, assetHashResult) {
    if (!assetHashResult || assetHashResult.state !== STATES.ASSET_HASHES_PASSED) {
      return assetHashResult;
    }

    if (!integrityManifest || !integrityManifest.signature || typeof integrityManifest.signature !== 'object') {
      return unavailable('integrity-manifest-signature-missing');
    }

    var signature = integrityManifest.signature;
    var signatureMode = signature.mode;
    if (!signatureMode) {
      return unavailable('integrity-manifest-signature-missing');
    }

    if (signatureMode === 'unsigned-dev') {
      return assetHashResult;
    }

    if (!SUPPORTED_SIGNATURE_MODES[signatureMode]) {
      return unavailable('integrity-manifest-signature-mode-unsupported', {
        signatureMode: signatureMode,
      });
    }

    if (!signature.keyId) {
      return unavailable('integrity-manifest-key-id-missing', {
        signatureMode: signatureMode,
      });
    }

    var trustedKeyContext = buildTrustedKeyResolutionContext(integrityManifest, signatureMode);
    if (trustedKeyContext.state === STATES.VERIFICATION_UNAVAILABLE) {
      return trustedKeyContext;
    }

    var trustedKeyResolution = resolveTrustedKeyRecord(trustedKeyContext.keyId, trustedKeyContext.context);
    if (trustedKeyResolution.outcome !== TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE) {
      return unavailable('integrity-manifest-public-key-unavailable', {
        signatureMode: signatureMode,
        keyId: trustedKeyContext.keyId,
        trustedKeyOutcome: trustedKeyResolution.outcome,
      });
    }

    return verifyP256Signature(integrityManifest, trustedKeyResolution.publicKey)
      .then(function (result) {
        if (result && result.state === STATES.VERIFIED) {
          return result;
        }
        if (result && result.state === STATES.INTEGRITY_FAILED) {
          return result;
        }
        return unavailable(result && result.error || 'integrity-manifest-signature-verifier-unavailable', {
          signatureMode: signatureMode,
          keyId: signature.keyId,
        });
      });
  }

  function verifyP256Signature(integrityManifest, publicKey) {
    var subtle = getCryptoSubtleForVerify();
    if (!subtle) {
      return Promise.resolve(unavailable('integrity-manifest-signature-verifier-unavailable'));
    }

    if (!integrityManifest || !integrityManifest.signature || typeof integrityManifest.signature !== 'object') {
      return Promise.resolve(unavailable('integrity-manifest-signature-missing'));
    }

    var signature = integrityManifest.signature;
    if (signature.mode !== 'signed-p256-v1') {
      return Promise.resolve(unavailable('integrity-manifest-signature-mode-unsupported', {
        signatureMode: signature.mode || null,
      }));
    }
    if (!signature.value) {
      return Promise.resolve(unavailable('integrity-manifest-signature-missing', {
        signatureMode: signature.mode,
      }));
    }

    var canonicalPayload = canonicalizeIntegrityManifestPayload(integrityManifest);
    if (!canonicalPayload) {
      return Promise.resolve(unavailable('integrity-manifest-canonical-payload-missing'));
    }

    var textEncoder = window.TextEncoder || (typeof TextEncoder === 'function' ? TextEncoder : null);
    if (!textEncoder) {
      return Promise.resolve(unavailable('integrity-manifest-textencoder-unavailable'));
    }

    var signatureBytes = base64UrlToBytes(signature.value);
    if (!signatureBytes) {
      return Promise.resolve(unavailable('integrity-manifest-signature-format-invalid'));
    }

    var payloadBytes = new textEncoder().encode(canonicalPayload);
    var keyPromise;
    if (publicKey && typeof publicKey === 'object' && publicKey.type === 'public' && typeof publicKey.algorithm === 'object') {
      keyPromise = Promise.resolve(publicKey);
    } else {
      var keyMaterial = publicKey;
      if (typeof publicKey === 'string') {
        try {
          keyMaterial = JSON.parse(publicKey);
        } catch (err) {
          return Promise.resolve(unavailable('integrity-manifest-public-key-invalid'));
        }
      }
      if (!keyMaterial || typeof keyMaterial !== 'object') {
        return Promise.resolve(unavailable('integrity-manifest-public-key-invalid'));
      }
      if (!keyMaterial.kty) {
        return Promise.resolve(unavailable('integrity-manifest-public-key-invalid'));
      }
      keyPromise = subtle.importKey(
        'jwk',
        keyMaterial,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
    }

    return Promise.resolve(keyPromise)
      .then(function (key) {
        return subtle.verify(
          { name: 'ECDSA', hash: { name: 'SHA-256' } },
          key,
          signatureBytes,
          payloadBytes
        );
      })
      .then(function (valid) {
        if (!valid) {
          return {
            ok: true,
            valid: false,
            state: STATES.INTEGRITY_FAILED,
            error: 'integrity-manifest-signature-invalid',
            signatureMode: signature.mode,
            keyId: signature.keyId || null,
            canonicalPayload: canonicalPayload,
          };
        }
        return {
          ok: true,
          valid: true,
          state: STATES.VERIFIED,
          error: null,
          signatureMode: signature.mode,
          keyId: signature.keyId || null,
          canonicalPayload: canonicalPayload,
        };
      }, function () {
        return unavailable('integrity-manifest-signature-verifier-unavailable', {
          signatureMode: signature.mode,
          keyId: signature.keyId || null,
        });
      });
  }

  function requireExecutable(state) {
    return canExecuteTransfer(state)
      ? { ok: true, state: STATES.VERIFIED, error: null }
      : { ok: false, state: normalizeState(state), error: 'coin-card-not-verified' };
  }

  window.IX_COIN_CARD_VERIFICATION = Object.freeze({
    STATES: STATES,
    TRUSTED_KEY_OUTCOMES: TRUSTED_KEY_OUTCOMES,
    normalizeState: normalizeState,
    getStateCopy: getStateCopy,
    canExecuteTransfer: canExecuteTransfer,
    getRequiredAssetPaths: getRequiredAssetPaths,
    hasRequiredAssets: hasRequiredAssets,
    canonicalizeIntegrityManifestPayload: canonicalizeIntegrityManifestPayload,
    isTrustedKeySourceAvailable: isTrustedKeySourceAvailable,
    getTrustedKeyRecord: getTrustedKeyRecord,
    resolveTrustedKeyRecord: resolveTrustedKeyRecord,
    buildTrustedKeyResolutionContext: buildTrustedKeyResolutionContext,
    readIntegrityManifestPointer: readIntegrityManifestPointer,
    readManifestPointer: readIntegrityManifestPointer,
    loadIntegrityManifest: loadIntegrityManifest,
    evaluateSignaturePolicy: evaluateSignaturePolicy,
    verifyP256Signature: verifyP256Signature,
    requireExecutable: requireExecutable,
  });
})();
