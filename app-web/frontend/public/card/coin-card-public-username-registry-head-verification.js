/* coin-card-public-username-registry-head-verification.js
 *
 * Authenticates the small Current Head artifact that names the one username
 * registry snapshot Coin Card recognizes now. It contains no username, account,
 * card, wallet, route, presentation, or execution facts.
 */

(function () {
  'use strict';

  var HEAD_SCHEMA_VERSION = 'coin-card-public-username-registry-head.v1';
  var REGISTRY_ID = 'implicitex-public-usernames';
  var REGISTRY_ENVIRONMENT = 'production';
  var REGISTRY_AUTHORITY_ID = 'implicitex-registry';
  var HEAD_SIGNATURE_DOMAIN = 'ImplicitEx.CoinCard.PublicUsernameRegistryHead.v1';
  var HEAD_ARTIFACT_HASH_DOMAIN = 'ImplicitEx.CoinCard.PublicUsernameRegistryHeadArtifact.v1';
  var TRUSTED_KEY_USAGE = 'coin-card-registry-publication';
  var CLOCK_SKEW_MS = 5 * 60 * 1000;
  var MAX_HEAD_VALIDITY_MS = 15 * 60 * 1000;

  var SHA256_RE = /^sha256:[0-9a-f]{64}$/;
  var IDENTIFIER_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
  var BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
  var STRICT_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var HEAD_FIELDS = Object.freeze([
    'authorityId',
    'currentRevision',
    'currentSnapshotHash',
    'environment',
    'expiresAt',
    'headSchemaVersion',
    'issuedAt',
    'registryId',
    'signature',
  ]);
  var SIGNATURE_FIELDS = Object.freeze([
    'algorithm',
    'authorityId',
    'keyId',
    'keyUsage',
    'mode',
    'signatureEncoding',
    'signatureLengthBytes',
    'signatureValueEncoding',
    'signedAt',
    'value',
  ]);
  var OUTCOMES = Object.freeze({
    USERNAME_REGISTRY_CURRENT_HEAD_AUTHENTICATED:
      'USERNAME_REGISTRY_CURRENT_HEAD_AUTHENTICATED',
    USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE:
      'USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE',
    USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED:
      'USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED',
  });

  var AUTHENTICATED_RESULTS = new WeakSet();
  var UNAVAILABLE_RESULTS = new WeakSet();
  var highestAcceptedRevision = 0;
  var highestAcceptedSnapshotHash = null;

  function getOwnDataPropertyNames(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return null;
    var names;
    try {
      names = Object.getOwnPropertyNames(value);
    } catch (error) {
      return null;
    }
    for (var i = 0; i < names.length; i++) {
      var descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(value, names[i]);
      } catch (error) {
        return null;
      }
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

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function snapshotPlainData(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'number') return value;
    if (!isPlainObject(value)) return undefined;
    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return undefined;
    visited.push(value);
    var names = getOwnDataPropertyNames(value);
    if (!names) return undefined;
    var snapshot = {};
    for (var i = 0; i < names.length; i++) {
      var fieldValue = snapshotPlainData(
        Object.getOwnPropertyDescriptor(value, names[i]).value,
        visited
      );
      if (fieldValue === undefined) return undefined;
      snapshot[names[i]] = fieldValue;
    }
    visited.pop();
    return Object.freeze(snapshot);
  }

  function sameStringSet(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    var left = actual.slice().sort();
    var right = expected.slice().sort();
    for (var i = 0; i < right.length; i++) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }

  function hasExactFields(value, fields) {
    return sameStringSet(getOwnDataPropertyNames(value), fields);
  }

  function parseStrictUtcTimestamp(value) {
    if (typeof value !== 'string' || !STRICT_UTC_TIMESTAMP_RE.test(value)) return null;
    var milliseconds = Date.parse(value);
    if (!Number.isFinite(milliseconds)) return null;
    return new Date(milliseconds).toISOString() === value ? milliseconds : null;
  }

  function isSafePositiveInteger(value) {
    return Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0);
  }

  function validateSignature(signature, head) {
    return !!(
      signature
      && isPlainObject(signature)
      && hasExactFields(signature, SIGNATURE_FIELDS)
      && signature.mode === 'signed-p256-v1'
      && signature.algorithm === 'ECDSA_P256_SHA256'
      && signature.signatureEncoding === 'ieee-p1363'
      && signature.signatureLengthBytes === 64
      && signature.signatureValueEncoding === 'base64url-unpadded'
      && typeof signature.keyId === 'string'
      && signature.keyId.length > 0
      && signature.keyUsage === TRUSTED_KEY_USAGE
      && signature.authorityId === head.authorityId
      && signature.signedAt === head.issuedAt
      && typeof signature.value === 'string'
      && signature.value.length === 86
      && BASE64URL_RE.test(signature.value)
      && signature.value.indexOf('=') === -1
    );
  }

  function validateHead(head) {
    if (!head || !isPlainObject(head) || !hasExactFields(head, HEAD_FIELDS)) {
      return 'current-head-schema-invalid';
    }
    if (head.headSchemaVersion !== HEAD_SCHEMA_VERSION) return 'current-head-schema-invalid';
    if (!IDENTIFIER_RE.test(head.registryId) || head.registryId !== REGISTRY_ID) {
      return 'current-head-registry-id-invalid';
    }
    if (!IDENTIFIER_RE.test(head.environment) || head.environment !== REGISTRY_ENVIRONMENT) {
      return 'current-head-environment-invalid';
    }
    if (!IDENTIFIER_RE.test(head.authorityId) || head.authorityId !== REGISTRY_AUTHORITY_ID) {
      return 'current-head-authority-invalid';
    }
    if (!isSafePositiveInteger(head.currentRevision)) return 'current-head-revision-invalid';
    if (!SHA256_RE.test(head.currentSnapshotHash)) return 'current-head-snapshot-hash-invalid';
    var issuedAtMs = parseStrictUtcTimestamp(head.issuedAt);
    var expiresAtMs = parseStrictUtcTimestamp(head.expiresAt);
    if (
      issuedAtMs === null
      || expiresAtMs === null
      || expiresAtMs <= issuedAtMs
      || expiresAtMs - issuedAtMs > MAX_HEAD_VALIDITY_MS
    ) {
      return 'current-head-validity-window-invalid';
    }
    if (!validateSignature(head.signature, head)) return 'current-head-signature-metadata-invalid';
    return null;
  }

  function currentnessFailure(head, verificationTimeMs) {
    var issuedAtMs = parseStrictUtcTimestamp(head.issuedAt);
    var expiresAtMs = parseStrictUtcTimestamp(head.expiresAt);
    if (issuedAtMs === null || expiresAtMs === null) return 'current-head-currentness-invalid';
    if (issuedAtMs > verificationTimeMs + CLOCK_SKEW_MS) return 'current-head-issued-in-future';
    if (verificationTimeMs >= expiresAtMs) return 'current-head-expired';
    return null;
  }

  function failure(outcome, reason, transportDiagnostic) {
    var diagnostic = transportDiagnostic || null;
    var result = Object.freeze({
      outcome: outcome,
      reason: reason || null,
      transportFailureClass: diagnostic && diagnostic.failureClass || null,
      transportFailureCode: diagnostic && diagnostic.code || null,
      authenticated: false,
      current: false,
      rollbackProtected: false,
      presentationEligible: false,
      executionEligible: false,
    });
    if (outcome === OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE) {
      UNAVAILABLE_RESULTS.add(result);
    }
    return result;
  }

  function getCanonicalizer() {
    var api = window.IX_COIN_CARD_CANONICAL_JSON_V1;
    return api && typeof api.canonicalizeJson === 'function' ? api.canonicalizeJson : null;
  }

  function getTrustedKeyApi() {
    return window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION || null;
  }

  function getCryptoSubtle() {
    return window.crypto && window.crypto.subtle
      && typeof window.crypto.subtle.importKey === 'function'
      && typeof window.crypto.subtle.verify === 'function'
      && typeof window.crypto.subtle.digest === 'function'
      ? window.crypto.subtle
      : null;
  }

  function encodeUtf8(value) {
    var Encoder = window.TextEncoder || (typeof TextEncoder === 'function' ? TextEncoder : null);
    if (!Encoder) return null;
    try { return new Encoder().encode(value); } catch (error) { return null; }
  }

  function concatDomainPayload(domain, payload) {
    var domainBytes = encodeUtf8(domain);
    var payloadBytes = encodeUtf8(payload);
    if (!domainBytes || !payloadBytes) return null;
    var bytes = new Uint8Array(domainBytes.length + 1 + payloadBytes.length);
    bytes.set(domainBytes, 0);
    bytes[domainBytes.length] = 0;
    bytes.set(payloadBytes, domainBytes.length + 1);
    return bytes;
  }

  function encodeBase64Url(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    var btoaImpl = window && typeof window.btoa === 'function'
      ? window.btoa
      : (typeof btoa === 'function' ? btoa : null);
    if (!btoaImpl) return null;
    try {
      return btoaImpl(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    } catch (error) {
      return null;
    }
  }

  function decodeBase64Url(value) {
    if (typeof value !== 'string' || value.length !== 86 || !BASE64URL_RE.test(value)) return null;
    var base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var atobImpl = window && typeof window.atob === 'function'
      ? window.atob
      : (typeof atob === 'function' ? atob : null);
    if (!atobImpl) return null;
    var binary;
    try { binary = atobImpl(base64); } catch (error) { return null; }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.length === 64 && encodeBase64Url(bytes) === value ? bytes : null;
  }

  function buildSignaturePayload(head) {
    var signature = {};
    var signatureNames = getOwnDataPropertyNames(head.signature);
    if (!signatureNames) return null;
    for (var i = 0; i < signatureNames.length; i++) {
      if (signatureNames[i] !== 'value') {
        signature[signatureNames[i]] = head.signature[signatureNames[i]];
      }
    }
    var payload = {};
    var names = getOwnDataPropertyNames(head);
    if (!names) return null;
    for (var j = 0; j < names.length; j++) {
      payload[names[j]] = names[j] === 'signature' ? signature : head[names[j]];
    }
    return payload;
  }

  function digestToHash(value) {
    var bytes = new Uint8Array(value);
    if (bytes.length !== 32) return null;
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return 'sha256:' + hex;
  }

  async function authenticateCurrentHead() {
    var verificationTime = new Date().toISOString();
    var verificationTimeMs = parseStrictUtcTimestamp(verificationTime);
    if (verificationTimeMs === null) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE,
        'current-head-verification-time-unavailable'
      );
    }

    var sourceApi;
    try { sourceApi = window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE; } catch (error) { sourceApi = null; }
    if (!sourceApi || typeof sourceApi.loadCurrentHead !== 'function') {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE,
        'current-head-source-unavailable'
      );
    }

    var source;
    try { source = await sourceApi.loadCurrentHead(); } catch (error) {
      var transportDiagnostic = null;
      try {
        transportDiagnostic = typeof sourceApi.classifyTransportFailure === 'function'
          ? sourceApi.classifyTransportFailure(error)
          : null;
      } catch (ignored) {
        transportDiagnostic = null;
      }
      if (
        transportDiagnostic
        && transportDiagnostic.failureClass === 'TRANSPORT_CONTRACT_VIOLATED'
      ) {
        return failure(
          OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED,
          'current-head-transport-contract-violated',
          transportDiagnostic
        );
      }
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE,
        'current-head-transport-unavailable',
        transportDiagnostic
      );
    }

    var canonicalize = getCanonicalizer();
    var trustedKeyApi = getTrustedKeyApi();
    var subtle = getCryptoSubtle();
    if (!canonicalize || !trustedKeyApi || typeof trustedKeyApi.resolveTrustedKeyRecord !== 'function') {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE,
        'current-head-trust-authority-unavailable'
      );
    }
    if (!subtle) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE,
        'current-head-crypto-unavailable'
      );
    }

    var head;
    try { head = snapshotPlainData(source, []); } catch (error) { head = undefined; }
    var shapeReason = head ? validateHead(head) : 'current-head-schema-invalid';
    if (shapeReason) {
      return failure(OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED, shapeReason);
    }
    var currentnessReason = currentnessFailure(head, verificationTimeMs);
    if (currentnessReason) {
      return failure(OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED, currentnessReason);
    }

    var payload = buildSignaturePayload(head);
    var canonicalPayload = payload ? canonicalize(payload) : null;
    var signedBytes = canonicalPayload ? concatDomainPayload(HEAD_SIGNATURE_DOMAIN, canonicalPayload) : null;
    var signatureBytes = decodeBase64Url(head.signature.value);
    if (!canonicalPayload || !signedBytes || !signatureBytes) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED,
        'current-head-canonicalization-or-signature-invalid'
      );
    }

    var keyResolution;
    try {
      keyResolution = trustedKeyApi.resolveTrustedKeyRecord(head.signature.keyId, {
        usage: TRUSTED_KEY_USAGE,
        environment: head.environment,
        issuerId: head.authorityId,
        signatureTime: head.signature.signedAt,
        verificationTime: verificationTime,
        signatureMode: head.signature.mode,
      });
    } catch (error) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE,
        'current-head-key-resolution-unavailable'
      );
    }
    if (
      !keyResolution
      || keyResolution.outcome !== trustedKeyApi.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE
      || !keyResolution.publicKey
    ) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED,
        'current-head-key-not-active'
      );
    }

    try {
      var publicKey = await subtle.importKey(
        'jwk',
        keyResolution.publicKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      var signatureValid = await subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        publicKey,
        signatureBytes,
        signedBytes
      );
      if (signatureValid !== true) {
        return failure(
          OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED,
          'current-head-signature-invalid'
        );
      }
    } catch (error) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED,
        'current-head-signature-verification-failed'
      );
    }

    var exactCanonical = canonicalize(head);
    var hashBytes = exactCanonical ? concatDomainPayload(HEAD_ARTIFACT_HASH_DOMAIN, exactCanonical) : null;
    var digest;
    try { digest = hashBytes ? await subtle.digest('SHA-256', hashBytes) : null; } catch (error) { digest = null; }
    var headHash = digest ? digestToHash(digest) : null;
    if (!headHash) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHORITY_UNAVAILABLE,
        'current-head-hash-unavailable'
      );
    }

    if (head.currentRevision < highestAcceptedRevision) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED,
        'current-head-rollback-detected'
      );
    }
    if (
      head.currentRevision === highestAcceptedRevision
      && highestAcceptedSnapshotHash !== null
      && head.currentSnapshotHash !== highestAcceptedSnapshotHash
    ) {
      return failure(
        OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_VERIFICATION_FAILED,
        'current-head-revision-conflict'
      );
    }

    if (head.currentRevision > highestAcceptedRevision) {
      highestAcceptedRevision = head.currentRevision;
      highestAcceptedSnapshotHash = head.currentSnapshotHash;
    }
    var result = Object.freeze({
      outcome: OUTCOMES.USERNAME_REGISTRY_CURRENT_HEAD_AUTHENTICATED,
      reason: null,
      authenticated: true,
      current: true,
      rollbackProtected: true,
      registryId: head.registryId,
      environment: head.environment,
      currentRevision: head.currentRevision,
      currentSnapshotHash: head.currentSnapshotHash,
      issuedAt: head.issuedAt,
      expiresAt: head.expiresAt,
      headHash: headHash,
      head: head,
      presentationEligible: false,
      executionEligible: false,
    });
    AUTHENTICATED_RESULTS.add(result);
    return result;
  }

  function isAuthenticatedCurrentHeadResult(value) {
    try { return AUTHENTICATED_RESULTS.has(value); } catch (error) { return false; }
  }

  function isAuthorityUnavailableResult(value) {
    try { return UNAVAILABLE_RESULTS.has(value); } catch (error) { return false; }
  }

  Object.defineProperty(window, 'IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_VERIFICATION', {
    value: Object.freeze({
      HEAD_SCHEMA_VERSION: HEAD_SCHEMA_VERSION,
      REGISTRY_ID: REGISTRY_ID,
      REGISTRY_ENVIRONMENT: REGISTRY_ENVIRONMENT,
      REGISTRY_AUTHORITY_ID: REGISTRY_AUTHORITY_ID,
      HEAD_SIGNATURE_DOMAIN: HEAD_SIGNATURE_DOMAIN,
      HEAD_ARTIFACT_HASH_DOMAIN: HEAD_ARTIFACT_HASH_DOMAIN,
      OUTCOMES: OUTCOMES,
      authenticateCurrentHead: authenticateCurrentHead,
      isAuthenticatedCurrentHeadResult: isAuthenticatedCurrentHeadResult,
      isAuthorityUnavailableResult: isAuthorityUnavailableResult,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
