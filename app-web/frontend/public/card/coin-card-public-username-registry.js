/* coin-card-public-username-registry.js — authenticated public username authority
 *
 * The public API retains the established IX_COIN_CARD_PUBLIC_HANDLE_REGISTRY
 * name for integration compatibility. In this module, "handle" means exactly
 * one normalized public username; aliases and fuzzy lookup do not exist.
 *
 * This module requires a separately authenticated Current Head, authenticates
 * its exact signed snapshot, and returns privately branded lookup results only
 * when revision and artifact hash both match. It does not load lifecycle evidence,
 * establish payment-route facts, promote presentation, or authorize execution.
 */

(function () {
  'use strict';

  var REGISTRY_SCHEMA_VERSION = 'coin-card-public-username-registry.v1';
  var REGISTRY_ID = 'implicitex-public-usernames';
  var REGISTRY_ENVIRONMENT = 'production';
  var REGISTRY_AUTHORITY_ID = 'implicitex-registry';
  var REGISTRY_SIGNATURE_DOMAIN = 'ImplicitEx.CoinCard.PublicUsernameRegistry.v1';
  var REGISTRY_ARTIFACT_HASH_DOMAIN = 'ImplicitEx.CoinCard.PublicUsernameRegistryArtifact.v1';
  var TRUSTED_KEY_USAGE = 'coin-card-registry-publication';
  var CLOCK_SKEW_MS = 5 * 60 * 1000;
  var MAX_VALIDITY_MS = 24 * 60 * 60 * 1000;

  var USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;
  var ACCOUNT_ID_RE = /^acct_[0-9A-HJKMNP-TV-Z]{26}$/;
  var CARD_ID_RE = /^cc_[0-9A-HJKMNP-TV-Z]{26}$/;
  var IDENTIFIER_RE = /^[a-z0-9][a-z0-9-]{2,79}$/;
  var BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
  var STRICT_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  var SNAPSHOT_FIELDS = Object.freeze([
    'authorityId',
    'entries',
    'environment',
    'expiresAt',
    'issuedAt',
    'registryId',
    'registryRevision',
    'registrySchemaVersion',
    'signature',
  ]);
  var ENTRY_FIELDS = Object.freeze([
    'accountId',
    'cardId',
    'status',
    'username',
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
  var USERNAME_STATUSES = Object.freeze({
    ACTIVE: 'ACTIVE',
    GRACE: 'GRACE',
    EXPIRED: 'EXPIRED',
    TOMBSTONED: 'TOMBSTONED',
    RESERVED: 'RESERVED',
    SYSTEM: 'SYSTEM',
  });
  var OUTCOMES = Object.freeze({
    USERNAME_REGISTRY_RECORD_AUTHENTICATED: 'USERNAME_REGISTRY_RECORD_AUTHENTICATED',
    USERNAME_REGISTRY_USERNAME_NOT_FOUND: 'USERNAME_REGISTRY_USERNAME_NOT_FOUND',
    USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE: 'USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE',
    USERNAME_REGISTRY_VERIFICATION_FAILED: 'USERNAME_REGISTRY_VERIFICATION_FAILED',
  });

  var AUTHORITATIVE_RESULTS = new WeakSet();
  var NOT_FOUND_RESULTS = new WeakSet();
  var UNAVAILABLE_RESULTS = new WeakSet();
  var acceptedSnapshotState = null;
  var highestAcceptedRevision = 0;
  var highestAcceptedHash = null;

  function getOwnDataPropertyNames(value) {
    if (!value || typeof value !== 'object') return null;
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return null;

    var names;
    try {
      names = Object.getOwnPropertyNames(value);
    } catch (error) {
      return null;
    }

    if (Array.isArray(value)) {
      var lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (!lengthDescriptor || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')) return null;
      var indexNames = [];
      for (var i = 0; i < names.length; i++) {
        if (names[i] === 'length') continue;
        var arrayDescriptor = Object.getOwnPropertyDescriptor(value, names[i]);
        var index = Number(names[i]);
        if (
          !arrayDescriptor
          || !Object.prototype.hasOwnProperty.call(arrayDescriptor, 'value')
          || arrayDescriptor.enumerable !== true
          || !Number.isSafeInteger(index)
          || index < 0
          || index >= value.length
          || String(index) !== names[i]
          || typeof arrayDescriptor.value === 'function'
        ) {
          return null;
        }
        indexNames.push(names[i]);
      }
      return indexNames.length === value.length
        ? indexNames.sort(function (left, right) { return Number(left) - Number(right); })
        : null;
    }

    for (var j = 0; j < names.length; j++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, names[j]);
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
    if (Array.isArray(value)) return true;
    var prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function snapshotPlainData(value, seen) {
    if (value === null || typeof value === 'string' || typeof value === 'number') return value;
    if (!value || typeof value !== 'object' || !isPlainDataContainer(value)) return undefined;

    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return undefined;
    visited.push(value);
    var names = getOwnDataPropertyNames(value);
    if (!names) return undefined;

    if (Array.isArray(value)) {
      var array = [];
      for (var i = 0; i < names.length; i++) {
        var item = snapshotPlainData(Object.getOwnPropertyDescriptor(value, names[i]).value, visited);
        if (item === undefined) return undefined;
        array.push(item);
      }
      visited.pop();
      return Object.freeze(array);
    }

    var snapshot = {};
    for (var j = 0; j < names.length; j++) {
      var fieldValue = snapshotPlainData(
        Object.getOwnPropertyDescriptor(value, names[j]).value,
        visited
      );
      if (fieldValue === undefined) return undefined;
      snapshot[names[j]] = fieldValue;
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

  function validateSignature(signature, snapshot) {
    return !!(
      signature
      && typeof signature === 'object'
      && !Array.isArray(signature)
      && hasExactFields(signature, SIGNATURE_FIELDS)
      && signature.mode === 'signed-p256-v1'
      && signature.algorithm === 'ECDSA_P256_SHA256'
      && signature.signatureEncoding === 'ieee-p1363'
      && signature.signatureLengthBytes === 64
      && signature.signatureValueEncoding === 'base64url-unpadded'
      && typeof signature.keyId === 'string'
      && signature.keyId.length > 0
      && signature.keyUsage === TRUSTED_KEY_USAGE
      && signature.authorityId === snapshot.authorityId
      && signature.signedAt === snapshot.issuedAt
      && typeof signature.value === 'string'
      && signature.value.length === 86
      && BASE64URL_RE.test(signature.value)
      && signature.value.indexOf('=') === -1
    );
  }

  function validateEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    if (!hasExactFields(entry, ENTRY_FIELDS)) return false;
    if (!USERNAME_RE.test(entry.username)) return false;
    if (!Object.prototype.hasOwnProperty.call(USERNAME_STATUSES, entry.status)) return false;

    var accountIdValid = entry.accountId === null
      || (typeof entry.accountId === 'string' && ACCOUNT_ID_RE.test(entry.accountId));
    var cardIdValid = entry.cardId === null
      || (typeof entry.cardId === 'string' && CARD_ID_RE.test(entry.cardId));
    if (!accountIdValid || !cardIdValid) return false;

    if (entry.status === USERNAME_STATUSES.RESERVED || entry.status === USERNAME_STATUSES.SYSTEM) {
      return entry.accountId === null && entry.cardId === null;
    }
    return typeof entry.accountId === 'string' && typeof entry.cardId === 'string';
  }

  function validateSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return 'snapshot-schema-invalid';
    if (!hasExactFields(snapshot, SNAPSHOT_FIELDS)) return 'snapshot-schema-invalid';
    if (snapshot.registrySchemaVersion !== REGISTRY_SCHEMA_VERSION) return 'snapshot-schema-invalid';
    if (!IDENTIFIER_RE.test(snapshot.registryId) || snapshot.registryId !== REGISTRY_ID) {
      return 'snapshot-registry-id-invalid';
    }
    if (!IDENTIFIER_RE.test(snapshot.environment) || snapshot.environment !== REGISTRY_ENVIRONMENT) {
      return 'snapshot-environment-invalid';
    }
    if (!IDENTIFIER_RE.test(snapshot.authorityId) || snapshot.authorityId !== REGISTRY_AUTHORITY_ID) {
      return 'snapshot-authority-invalid';
    }
    if (!isSafePositiveInteger(snapshot.registryRevision)) return 'snapshot-revision-invalid';

    var issuedAtMs = parseStrictUtcTimestamp(snapshot.issuedAt);
    var expiresAtMs = parseStrictUtcTimestamp(snapshot.expiresAt);
    if (
      issuedAtMs === null
      || expiresAtMs === null
      || expiresAtMs <= issuedAtMs
      || expiresAtMs - issuedAtMs > MAX_VALIDITY_MS
    ) {
      return 'snapshot-validity-window-invalid';
    }
    if (!Array.isArray(snapshot.entries)) return 'snapshot-entries-invalid';
    if (!validateSignature(snapshot.signature, snapshot)) return 'snapshot-signature-metadata-invalid';

    var usernames = Object.create(null);
    var accountIds = Object.create(null);
    var cardIds = Object.create(null);
    var previousUsername = null;
    for (var i = 0; i < snapshot.entries.length; i++) {
      var entry = snapshot.entries[i];
      if (!validateEntry(entry)) return 'snapshot-entry-invalid';
      if (previousUsername !== null && entry.username <= previousUsername) {
        return 'snapshot-entry-order-or-username-conflict';
      }
      previousUsername = entry.username;
      if (usernames[entry.username]) return 'snapshot-username-conflict';
      usernames[entry.username] = true;
      if (entry.accountId !== null) {
        if (accountIds[entry.accountId]) return 'snapshot-account-username-conflict';
        accountIds[entry.accountId] = true;
      }
      if (entry.cardId !== null) {
        if (cardIds[entry.cardId]) return 'snapshot-card-username-conflict';
        cardIds[entry.cardId] = true;
      }
    }
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
    if (outcome === OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE) {
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

  function getCurrentHeadApi() {
    return window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_VERIFICATION || null;
  }

  function getSnapshotSourceApi() {
    return window.IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE || null;
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
    try {
      return new Encoder().encode(value);
    } catch (error) {
      return null;
    }
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

  function decodeBase64Url(value) {
    if (typeof value !== 'string' || value.length !== 86 || !BASE64URL_RE.test(value)) return null;
    var base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var atobImpl = window && typeof window.atob === 'function'
      ? window.atob
      : (typeof atob === 'function' ? atob : null);
    if (!atobImpl) return null;
    var binary;
    try {
      binary = atobImpl(base64);
    } catch (error) {
      return null;
    }
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.length === 64 && encodeBase64Url(bytes) === value ? bytes : null;
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

  function buildSignaturePayload(snapshot) {
    var signature = {};
    var signatureNames = getOwnDataPropertyNames(snapshot.signature);
    if (!signatureNames) return null;
    for (var i = 0; i < signatureNames.length; i++) {
      if (signatureNames[i] !== 'value') {
        signature[signatureNames[i]] = snapshot.signature[signatureNames[i]];
      }
    }

    var payload = {};
    var names = getOwnDataPropertyNames(snapshot);
    if (!names) return null;
    for (var j = 0; j < names.length; j++) {
      payload[names[j]] = names[j] === 'signature' ? signature : snapshot[names[j]];
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

  function currentnessFailure(snapshot, verificationTimeMs) {
    var issuedAtMs = parseStrictUtcTimestamp(snapshot.issuedAt);
    var expiresAtMs = parseStrictUtcTimestamp(snapshot.expiresAt);
    if (issuedAtMs === null || expiresAtMs === null) return 'snapshot-currentness-invalid';
    if (issuedAtMs > verificationTimeMs + CLOCK_SKEW_MS) return 'snapshot-issued-in-future';
    if (verificationTimeMs >= expiresAtMs) return 'snapshot-expired';
    return null;
  }

  function acceptedState(snapshot, snapshotHash, currentHead) {
    var entriesByUsername = Object.create(null);
    for (var i = 0; i < snapshot.entries.length; i++) {
      entriesByUsername[snapshot.entries[i].username] = snapshot.entries[i];
    }
    return Object.freeze({
      entriesByUsername: Object.freeze(entriesByUsername),
      snapshot: snapshot,
      snapshotHash: snapshotHash,
      currentHead: currentHead,
    });
  }

  async function authenticateCurrentSource() {
    var verificationTime = new Date().toISOString();
    var verificationTimeMs = parseStrictUtcTimestamp(verificationTime);
    if (verificationTimeMs === null) {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'verification-time-unavailable');
    }

    var headApi = getCurrentHeadApi();
    if (
      !headApi
      || typeof headApi.authenticateCurrentHead !== 'function'
      || typeof headApi.isAuthenticatedCurrentHeadResult !== 'function'
      || typeof headApi.isAuthorityUnavailableResult !== 'function'
    ) {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'current-head-authority-unavailable');
    }

    var currentHead;
    try {
      currentHead = await headApi.authenticateCurrentHead();
    } catch (error) {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'current-head-verification-unavailable');
    }
    try {
      if (headApi.isAuthorityUnavailableResult(currentHead) === true) {
        return failure(
          OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE,
          currentHead.reason || 'current-head-unavailable',
          {
            failureClass: currentHead.transportFailureClass,
            code: currentHead.transportFailureCode,
          }
        );
      }
      if (headApi.isAuthenticatedCurrentHeadResult(currentHead) !== true) {
        return failure(
          OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED,
          currentHead && currentHead.reason || 'current-head-invalid',
          currentHead && currentHead.transportFailureClass
            ? {
              failureClass: currentHead.transportFailureClass,
              code: currentHead.transportFailureCode,
            }
            : null
        );
      }
    } catch (error) {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'current-head-proof-unavailable');
    }

    if (acceptedSnapshotState) {
      var cachedCurrentnessReason = currentnessFailure(
        acceptedSnapshotState.snapshot,
        verificationTimeMs
      );
      if (cachedCurrentnessReason) {
        return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, cachedCurrentnessReason);
      }
      if (
        acceptedSnapshotState.snapshot.registryRevision === currentHead.currentRevision
        && acceptedSnapshotState.snapshotHash === currentHead.currentSnapshotHash
      ) {
        return acceptedState(
          acceptedSnapshotState.snapshot,
          acceptedSnapshotState.snapshotHash,
          currentHead
        );
      }
    }

    var snapshotSourceApi = getSnapshotSourceApi();
    if (!snapshotSourceApi || typeof snapshotSourceApi.loadSnapshotByHash !== 'function') {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'username-registry-snapshot-source-unavailable');
    }

    var source;
    try {
      source = await snapshotSourceApi.loadSnapshotByHash(currentHead.currentSnapshotHash);
    } catch (error) {
      var transportDiagnostic = null;
      try {
        transportDiagnostic = typeof snapshotSourceApi.classifyTransportFailure === 'function'
          ? snapshotSourceApi.classifyTransportFailure(error)
          : null;
      } catch (ignored) {
        transportDiagnostic = null;
      }
      if (
        transportDiagnostic
        && transportDiagnostic.failureClass === 'TRANSPORT_CONTRACT_VIOLATED'
      ) {
        return failure(
          OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED,
          'username-registry-snapshot-transport-contract-violated',
          transportDiagnostic
        );
      }
      return failure(
        OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE,
        'username-registry-snapshot-transport-unavailable',
        transportDiagnostic
      );
    }
    if (!source || typeof source !== 'object') {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'username-registry-snapshot-unavailable');
    }

    var canonicalize = getCanonicalizer();
    var trustedKeyApi = getTrustedKeyApi();
    var subtle = getCryptoSubtle();
    if (!canonicalize || !trustedKeyApi || typeof trustedKeyApi.resolveTrustedKeyRecord !== 'function') {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'username-registry-trust-authority-unavailable');
    }
    if (!subtle) {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'username-registry-crypto-unavailable');
    }

    var snapshot;
    try {
      snapshot = snapshotPlainData(source, []);
    } catch (error) {
      snapshot = undefined;
    }
    var shapeReason = snapshot ? validateSnapshot(snapshot) : 'snapshot-schema-invalid';
    if (shapeReason) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, shapeReason);
    }
    var currentnessReason = currentnessFailure(snapshot, verificationTimeMs);
    if (currentnessReason) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, currentnessReason);
    }

    var payload = buildSignaturePayload(snapshot);
    var canonicalPayload = payload ? canonicalize(payload) : null;
    var signedBytes = canonicalPayload
      ? concatDomainPayload(REGISTRY_SIGNATURE_DOMAIN, canonicalPayload)
      : null;
    var signatureBytes = decodeBase64Url(snapshot.signature.value);
    if (!canonicalPayload || !signedBytes || !signatureBytes) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'snapshot-canonicalization-or-signature-invalid');
    }

    var keyResolution;
    try {
      keyResolution = trustedKeyApi.resolveTrustedKeyRecord(snapshot.signature.keyId, {
        usage: TRUSTED_KEY_USAGE,
        environment: snapshot.environment,
        issuerId: snapshot.authorityId,
        signatureTime: snapshot.signature.signedAt,
        verificationTime: verificationTime,
        signatureMode: snapshot.signature.mode,
      });
    } catch (error) {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'trusted-key-resolution-unavailable');
    }
    if (
      !keyResolution
      || keyResolution.outcome !== trustedKeyApi.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE
      || !keyResolution.publicKey
    ) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'username-registry-key-not-active');
    }

    var publicKey;
    var signatureValid;
    try {
      publicKey = await subtle.importKey(
        'jwk',
        keyResolution.publicKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );
      signatureValid = await subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        publicKey,
        signatureBytes,
        signedBytes
      );
    } catch (error) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'username-registry-signature-verification-failed');
    }
    if (signatureValid !== true) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'username-registry-signature-invalid');
    }

    var exactCanonical = canonicalize(snapshot);
    var hashBytes = exactCanonical
      ? concatDomainPayload(REGISTRY_ARTIFACT_HASH_DOMAIN, exactCanonical)
      : null;
    var hashValue;
    try {
      hashValue = hashBytes ? await subtle.digest('SHA-256', hashBytes) : null;
    } catch (error) {
      hashValue = null;
    }
    var snapshotHash = hashValue ? digestToHash(hashValue) : null;
    if (!snapshotHash) {
      return failure(OUTCOMES.USERNAME_REGISTRY_AUTHORITY_UNAVAILABLE, 'username-registry-hash-unavailable');
    }

    if (snapshot.registryRevision !== currentHead.currentRevision) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'current-head-revision-mismatch');
    }
    if (snapshotHash !== currentHead.currentSnapshotHash) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'current-head-snapshot-hash-mismatch');
    }

    if (snapshot.registryRevision < highestAcceptedRevision) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'username-registry-rollback-detected');
    }
    if (
      snapshot.registryRevision === highestAcceptedRevision
      && highestAcceptedHash !== null
      && snapshotHash !== highestAcceptedHash
    ) {
      return failure(OUTCOMES.USERNAME_REGISTRY_VERIFICATION_FAILED, 'username-registry-revision-conflict');
    }

    if (snapshot.registryRevision > highestAcceptedRevision) {
      highestAcceptedRevision = snapshot.registryRevision;
      highestAcceptedHash = snapshotHash;
    }
    acceptedSnapshotState = acceptedState(snapshot, snapshotHash, currentHead);
    return acceptedSnapshotState;
  }

  function lookupMetadata(state) {
    return {
      registryId: state.snapshot.registryId,
      registryRevision: state.snapshot.registryRevision,
      issuedAt: state.snapshot.issuedAt,
      expiresAt: state.snapshot.expiresAt,
      snapshotHash: state.snapshotHash,
      currentHeadHash: state.currentHead.headHash,
      currentHeadIssuedAt: state.currentHead.issuedAt,
      currentHeadExpiresAt: state.currentHead.expiresAt,
      currentHeadAuthenticated: true,
    };
  }

  function copyMetadata(target, state) {
    var metadata = lookupMetadata(state);
    Object.keys(metadata).forEach(function (key) { target[key] = metadata[key]; });
    return target;
  }

  async function lookupHandle(username) {
    var state = await authenticateCurrentSource();
    if (!state || !state.snapshot) return state;

    var entry = typeof username === 'string' && USERNAME_RE.test(username)
      ? state.entriesByUsername[username] || null
      : null;
    if (!entry) {
      var notFound = copyMetadata({
        outcome: OUTCOMES.USERNAME_REGISTRY_USERNAME_NOT_FOUND,
        username: typeof username === 'string' ? username : null,
        status: null,
        accountId: null,
        cardId: null,
        authenticated: true,
        current: true,
        rollbackProtected: true,
        presentationEligible: false,
        executionEligible: false,
      }, state);
      var frozenNotFound = Object.freeze(notFound);
      NOT_FOUND_RESULTS.add(frozenNotFound);
      return frozenNotFound;
    }

    var authoritative = copyMetadata({
      outcome: OUTCOMES.USERNAME_REGISTRY_RECORD_AUTHENTICATED,
      username: entry.username,
      status: entry.status,
      accountId: entry.accountId,
      cardId: entry.cardId,
      authenticated: true,
      current: true,
      rollbackProtected: true,
      presentationEligible: false,
      executionEligible: false,
    }, state);
    var frozenAuthoritative = Object.freeze(authoritative);
    AUTHORITATIVE_RESULTS.add(frozenAuthoritative);
    return frozenAuthoritative;
  }

  function isAuthoritativeHandleResult(value) {
    try { return AUTHORITATIVE_RESULTS.has(value); } catch (error) { return false; }
  }

  function isHandleNotFoundResult(value) {
    try { return NOT_FOUND_RESULTS.has(value); } catch (error) { return false; }
  }

  function isAuthorityUnavailableResult(value) {
    try { return UNAVAILABLE_RESULTS.has(value); } catch (error) { return false; }
  }

  Object.defineProperty(window, 'IX_COIN_CARD_PUBLIC_HANDLE_REGISTRY', {
    value: Object.freeze({
      REGISTRY_SCHEMA_VERSION: REGISTRY_SCHEMA_VERSION,
      REGISTRY_ID: REGISTRY_ID,
      REGISTRY_ENVIRONMENT: REGISTRY_ENVIRONMENT,
      REGISTRY_AUTHORITY_ID: REGISTRY_AUTHORITY_ID,
      REGISTRY_SIGNATURE_DOMAIN: REGISTRY_SIGNATURE_DOMAIN,
      REGISTRY_ARTIFACT_HASH_DOMAIN: REGISTRY_ARTIFACT_HASH_DOMAIN,
      USERNAME_STATUSES: USERNAME_STATUSES,
      OUTCOMES: OUTCOMES,
      lookupHandle: lookupHandle,
      isAuthoritativeHandleResult: isAuthoritativeHandleResult,
      isHandleNotFoundResult: isHandleNotFoundResult,
      isAuthorityUnavailableResult: isAuthorityUnavailableResult,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
