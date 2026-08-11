/* coin-card-executable-registry-head-verification.js
 *
 * Authenticates one closed executable-registry Current Head and establishes its
 * exact artifact hash. A valid detached head is not current: authenticated
 * source binding and protected monotonic acceptance are separate requirements.
 */

(function () {
  'use strict';

  var HEAD_SCHEMA_VERSION = 'executable-registry-head.v1';
  var HEAD_SIGNATURE_DOMAIN = 'ImplicitEx.CoinCard.ExecutableRegistryHead.v1';
  var HEAD_ARTIFACT_HASH_DOMAIN = 'ImplicitEx.CoinCard.ExecutableRegistryHeadArtifact.v1';
  var TRUSTED_KEY_USAGE = 'coin-card-executable-registry-head';
  var CLOCK_SKEW_MS = 5 * 60 * 1000;
  var MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
  var UINT256_MAX = (BigInt(1) << BigInt(256)) - BigInt(1);

  var CARD_ID_RE = /^cc_[0-9A-HJKMNP-TV-Z]{26}$/;
  var ATOMIC_RE = /^[1-9][0-9]*$/;
  var SHA256_RE = /^sha256:[0-9a-f]{64}$/;
  var BASE64URL_RE = /^[A-Za-z0-9_-]{86}$/;
  var TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  var HEAD_FIELDS = Object.freeze([
    'authorityId', 'cardId', 'coinCardRegistryRecordHash',
    'coinCardRegistryRecordId', 'coinCardRegistryRecordRevision',
    'environment', 'expiresAt', 'headSchemaVersion', 'headSequence',
    'issuedAt', 'lifecycleRecordHash', 'registryId', 'signature',
    'transactionEvidenceAuthorityHash',
  ]);
  var SIGNATURE_FIELDS = Object.freeze([
    'algorithm', 'authorityId', 'keyId', 'keyUsage', 'mode',
    'signatureEncoding', 'signatureValueEncoding', 'signedAt', 'value',
  ]);
  var OUTCOMES = Object.freeze({
    EXECUTABLE_REGISTRY_HEAD_AUTHENTICATED: 'EXECUTABLE_REGISTRY_HEAD_AUTHENTICATED',
    EXECUTABLE_REGISTRY_HEAD_INVALID: 'EXECUTABLE_REGISTRY_HEAD_INVALID',
    EXECUTABLE_REGISTRY_HEAD_AUTHORITY_UNAVAILABLE: 'EXECUTABLE_REGISTRY_HEAD_AUTHORITY_UNAVAILABLE',
  });
  var AUTHENTICATED = new WeakSet();

  function names(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return null;
    if (Object.getOwnPropertySymbols && Object.getOwnPropertySymbols(value).length) return null;
    var result = Object.getOwnPropertyNames(value);
    for (var i = 0; i < result.length; i++) {
      var descriptor = Object.getOwnPropertyDescriptor(value, result[i]);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        || descriptor.enumerable !== true || typeof descriptor.value === 'function') return null;
    }
    return result;
  }

  function exact(value, fields) {
    var actual = names(value);
    if (!actual || actual.length !== fields.length) return false;
    actual.sort();
    var expected = fields.slice().sort();
    for (var i = 0; i < expected.length; i++) if (actual[i] !== expected[i]) return false;
    return true;
  }

  function snapshot(value, seen) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    var visited = seen || [];
    if (visited.indexOf(value) !== -1) return undefined;
    visited.push(value);
    var keys = names(value);
    if (!keys) return undefined;
    var copy = {};
    for (var i = 0; i < keys.length; i++) {
      var child = snapshot(Object.getOwnPropertyDescriptor(value, keys[i]).value, visited);
      if (child === undefined) return undefined;
      copy[keys[i]] = child;
    }
    visited.pop();
    return Object.freeze(copy);
  }

  function parseTime(value) {
    if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return null;
    var time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
  }

  function isAtomic(value) {
    if (typeof value !== 'string' || !ATOMIC_RE.test(value)) return false;
    try { return BigInt(value) <= UINT256_MAX; } catch (error) { return false; }
  }

  function isIdentifier(value) {
    if (typeof value !== 'string' || !value || value.trim() !== value
      || typeof value.normalize !== 'function' || value.normalize('NFC') !== value) return false;
    for (var i = 0; i < value.length; i++) {
      var code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (i + 1 >= value.length) return false;
        var next = value.charCodeAt(i + 1);
        if (next < 0xdc00 || next > 0xdfff) return false;
        i += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) return false;
    }
    return true;
  }

  function validate(head, nowMs) {
    if (!exact(head, HEAD_FIELDS) || head.headSchemaVersion !== HEAD_SCHEMA_VERSION) return 'head-schema-invalid';
    var identifiers = ['registryId', 'environment', 'coinCardRegistryRecordId', 'authorityId'];
    for (var i = 0; i < identifiers.length; i++) {
      if (!isIdentifier(head[identifiers[i]])) {
        return 'head-identifier-invalid';
      }
    }
    if (!CARD_ID_RE.test(head.cardId)) return 'head-card-id-invalid';
    if (!isAtomic(head.headSequence) || !isAtomic(head.coinCardRegistryRecordRevision)) return 'head-atomic-invalid';
    var hashes = ['lifecycleRecordHash', 'coinCardRegistryRecordHash', 'transactionEvidenceAuthorityHash'];
    for (var j = 0; j < hashes.length; j++) if (!SHA256_RE.test(head[hashes[j]])) return 'head-hash-invalid';
    var issued = parseTime(head.issuedAt);
    var expires = parseTime(head.expiresAt);
    if (issued === null || expires === null || issued >= expires || expires - issued > MAX_LIFETIME_MS) {
      return 'head-time-window-invalid';
    }
    if (issued - CLOCK_SKEW_MS > nowMs || nowMs >= expires + CLOCK_SKEW_MS) return 'head-not-time-valid';
    var signature = head.signature;
    if (!exact(signature, SIGNATURE_FIELDS)
      || signature.mode !== 'signed-p256-v1'
      || signature.algorithm !== 'ECDSA_P256_SHA256'
      || signature.signatureEncoding !== 'ieee-p1363'
      || signature.signatureValueEncoding !== 'base64url-unpadded'
      || signature.keyUsage !== TRUSTED_KEY_USAGE
      || signature.authorityId !== head.authorityId
      || signature.signedAt !== head.issuedAt
      || typeof signature.keyId !== 'string' || !signature.keyId
      || typeof signature.value !== 'string' || !BASE64URL_RE.test(signature.value)) {
      return 'head-signature-metadata-invalid';
    }
    return null;
  }

  function canonicalizer() {
    var api = window.IX_COIN_CARD_CANONICAL_JSON_V1;
    return api && typeof api.canonicalizeJson === 'function' ? api.canonicalizeJson : null;
  }

  function bytes(value) {
    var Encoder = window.TextEncoder || (typeof TextEncoder === 'function' ? TextEncoder : null);
    try { return Encoder ? new Encoder().encode(value) : null; } catch (error) { return null; }
  }

  function domainBytes(domain, canonical) {
    var left = bytes(domain);
    var right = bytes(canonical);
    if (!left || !right) return null;
    var result = new Uint8Array(left.length + 1 + right.length);
    result.set(left, 0); result[left.length] = 0; result.set(right, left.length + 1);
    return result;
  }

  function decodeSignature(value) {
    var atobImpl = window && typeof window.atob === 'function' ? window.atob : null;
    if (!atobImpl) return null;
    var input = value.replace(/-/g, '+').replace(/_/g, '/');
    while (input.length % 4) input += '=';
    try {
      var binary = atobImpl(input);
      var result = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
      return result.length === 64 ? result : null;
    } catch (error) { return null; }
  }

  function digestHash(buffer) {
    var data = new Uint8Array(buffer);
    if (data.length !== 32) return null;
    var hex = '';
    for (var i = 0; i < data.length; i++) hex += data[i].toString(16).padStart(2, '0');
    return 'sha256:' + hex;
  }

  function failure(outcome, reason) {
    return Object.freeze({
      outcome: outcome, reason: reason, authenticated: false, current: false,
      rollbackProtected: false, executionEligible: false, head: null, headHash: null,
    });
  }

  async function authenticateHead(input, options) {
    var canonicalize = canonicalizer();
    var trust = window.IX_COIN_CARD_TRUSTED_KEY_RESOLUTION;
    var subtle = window.crypto && window.crypto.subtle;
    if (!canonicalize || !trust || typeof trust.resolveTrustedKeyRecord !== 'function' || !subtle) {
      return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_AUTHORITY_UNAVAILABLE, 'head-verification-dependency-unavailable');
    }
    var verificationTime = options && options.verificationTime || new Date().toISOString();
    var nowMs = parseTime(verificationTime);
    if (nowMs === null) return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_INVALID, 'verification-time-invalid');
    var head = snapshot(input, []);
    var reason = head ? validate(head, nowMs) : 'head-schema-invalid';
    if (reason) return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_INVALID, reason);

    var signature = {};
    Object.keys(head.signature).forEach(function (key) {
      if (key !== 'value') signature[key] = head.signature[key];
    });
    var payload = {};
    Object.keys(head).forEach(function (key) { payload[key] = key === 'signature' ? signature : head[key]; });
    var canonicalPayload = canonicalize(payload);
    var signatureBytes = decodeSignature(head.signature.value);
    var signedBytes = canonicalPayload && domainBytes(HEAD_SIGNATURE_DOMAIN, canonicalPayload);
    if (!canonicalPayload || !signatureBytes || !signedBytes) {
      return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_INVALID, 'head-signature-encoding-invalid');
    }

    var keyResult;
    try {
      keyResult = trust.resolveTrustedKeyRecord(head.signature.keyId, {
        usage: TRUSTED_KEY_USAGE, environment: head.environment, issuerId: head.authorityId,
        signatureTime: head.signature.signedAt, verificationTime: verificationTime,
        signatureMode: head.signature.mode,
      });
    } catch (error) {
      return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_AUTHORITY_UNAVAILABLE, 'head-key-resolution-unavailable');
    }
    if (!keyResult || !trust.TRUSTED_KEY_OUTCOMES
      || keyResult.outcome !== trust.TRUSTED_KEY_OUTCOMES.TRUSTED_KEY_ACTIVE || !keyResult.publicKey) {
      return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_INVALID, 'head-key-not-active-for-usage');
    }
    try {
      var publicKey = await subtle.importKey('jwk', keyResult.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      var valid = await subtle.verify({ name: 'ECDSA', hash: { name: 'SHA-256' } }, publicKey, signatureBytes, signedBytes);
      if (valid !== true) return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_INVALID, 'head-signature-invalid');
      var exactCanonical = canonicalize(head);
      var hashInput = exactCanonical && domainBytes(HEAD_ARTIFACT_HASH_DOMAIN, exactCanonical);
      var hash = hashInput ? digestHash(await subtle.digest('SHA-256', hashInput)) : null;
      if (!hash) return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_AUTHORITY_UNAVAILABLE, 'head-hash-unavailable');
      var result = Object.freeze({
        outcome: OUTCOMES.EXECUTABLE_REGISTRY_HEAD_AUTHENTICATED,
        reason: null, authenticated: true, current: false, rollbackProtected: false,
        executionEligible: false, head: head, headHash: hash,
      });
      AUTHENTICATED.add(result);
      return result;
    } catch (error) {
      return failure(OUTCOMES.EXECUTABLE_REGISTRY_HEAD_INVALID, 'head-cryptographic-verification-failed');
    }
  }

  function isAuthenticatedHeadResult(value) {
    try { return AUTHENTICATED.has(value); } catch (error) { return false; }
  }

  Object.defineProperty(window, 'IX_COIN_CARD_EXECUTABLE_REGISTRY_HEAD_VERIFICATION', {
    value: Object.freeze({
      HEAD_SCHEMA_VERSION: HEAD_SCHEMA_VERSION,
      HEAD_SIGNATURE_DOMAIN: HEAD_SIGNATURE_DOMAIN,
      HEAD_ARTIFACT_HASH_DOMAIN: HEAD_ARTIFACT_HASH_DOMAIN,
      OUTCOMES: OUTCOMES,
      authenticateHead: authenticateHead,
      isAuthenticatedHeadResult: isAuthenticatedHeadResult,
    }),
    writable: false, enumerable: true, configurable: false,
  });
})();
