/* coin-card-public-username-registry-snapshot-source.js
 *
 * Loads one immutable public username registry snapshot by the exact artifact
 * identity named by an authenticated Current Head. Returned data remains
 * untrusted until the username registry authenticates and hashes it.
 */

(function () {
  'use strict';

  var SNAPSHOT_BASE_URL = 'https://coincard.click/.well-known/coin-card-public-username-registry-snapshots/sha256/';
  var SNAPSHOT_HASH_RE = /^sha256:[0-9a-f]{64}$/;
  var TRANSPORT_FAILURES = new WeakMap();
  var FAILURE_CLASSES = Object.freeze({
    TRANSPORT_UNAVAILABLE: 'TRANSPORT_UNAVAILABLE',
    TRANSPORT_CONTRACT_VIOLATED: 'TRANSPORT_CONTRACT_VIOLATED',
  });

  function transportFailure(code, failureClass) {
    var error = new Error(code);
    TRANSPORT_FAILURES.set(error, Object.freeze({ code: code, failureClass: failureClass }));
    return error;
  }

  function classifyTransportFailure(error) {
    try { return TRANSPORT_FAILURES.get(error) || null; } catch (ignored) { return null; }
  }

  function snapshotUrlForHash(snapshotHash) {
    if (typeof snapshotHash !== 'string' || !SNAPSHOT_HASH_RE.test(snapshotHash)) {
      throw transportFailure(
        'username-registry-snapshot-artifact-identity-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    return SNAPSHOT_BASE_URL + snapshotHash.slice(7) + '.json';
  }

  function readHeader(response, name) {
    if (!response.headers || typeof response.headers.get !== 'function') return null;
    try {
      var value = response.headers.get(name);
      return typeof value === 'string' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function isJsonContentType(value) {
    return typeof value === 'string'
      && value.split(';')[0].trim().toLowerCase() === 'application/json';
  }

  function hasCacheDirective(value, directive) {
    if (typeof value !== 'string') return false;
    var directives = value.toLowerCase().split(',');
    for (var i = 0; i < directives.length; i++) {
      if (directives[i].trim() === directive) return true;
    }
    return false;
  }

  function hasPositiveMaxAge(value) {
    if (typeof value !== 'string') return false;
    var match = /(?:^|,)\s*max-age\s*=\s*(\d+)\s*(?:,|$)/i.exec(value);
    return !!(match && Number(match[1]) > 0);
  }

  async function loadSnapshotByHash(snapshotHash) {
    var snapshotUrl = snapshotUrlForHash(snapshotHash);
    var fetchImpl = window && typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) {
      throw transportFailure(
        'username-registry-snapshot-fetch-unavailable',
        FAILURE_CLASSES.TRANSPORT_UNAVAILABLE
      );
    }

    var response;
    try {
      response = await fetchImpl(snapshotUrl, {
        method: 'GET',
        cache: 'force-cache',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: Object.freeze({ Accept: 'application/json' }),
      });
    } catch (error) {
      throw transportFailure(
        'username-registry-snapshot-fetch-failed',
        FAILURE_CLASSES.TRANSPORT_UNAVAILABLE
      );
    }
    if (!response || response.ok !== true || response.status !== 200) {
      throw transportFailure(
        'username-registry-snapshot-response-unavailable',
        FAILURE_CLASSES.TRANSPORT_UNAVAILABLE
      );
    }
    if (
      response.redirected !== false
      || response.url !== snapshotUrl
      || response.type === 'opaque'
    ) {
      throw transportFailure(
        'username-registry-snapshot-response-identity-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    if (!isJsonContentType(readHeader(response, 'Content-Type'))) {
      throw transportFailure(
        'username-registry-snapshot-content-type-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    var cacheControl = readHeader(response, 'Cache-Control');
    if (
      !hasCacheDirective(cacheControl, 'public')
      || !hasCacheDirective(cacheControl, 'immutable')
      || !hasPositiveMaxAge(cacheControl)
    ) {
      throw transportFailure(
        'username-registry-snapshot-cache-policy-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    if (typeof response.json !== 'function') {
      throw transportFailure(
        'username-registry-snapshot-response-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw transportFailure(
        'username-registry-snapshot-json-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
  }

  Object.defineProperty(window, 'IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE', {
    value: Object.freeze({
      SNAPSHOT_BASE_URL: SNAPSHOT_BASE_URL,
      FAILURE_CLASSES: FAILURE_CLASSES,
      snapshotUrlForHash: snapshotUrlForHash,
      loadSnapshotByHash: loadSnapshotByHash,
      classifyTransportFailure: classifyTransportFailure,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
