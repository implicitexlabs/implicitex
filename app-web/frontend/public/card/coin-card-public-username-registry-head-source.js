/* coin-card-public-username-registry-head-source.js
 *
 * Loads the public username registry Current Head from one fixed HTTPS
 * authority endpoint. Returned data is untrusted until authenticated by the
 * dedicated Current Head verifier.
 */

(function () {
  'use strict';

  var CURRENT_HEAD_URL = 'https://coincard.click/.well-known/coin-card-public-username-registry-head.v1.json';
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

  async function loadCurrentHead() {
    var fetchImpl = window && typeof window.fetch === 'function'
      ? window.fetch.bind(window)
      : (typeof fetch === 'function' ? fetch : null);
    if (!fetchImpl) {
      throw transportFailure(
        'username-registry-current-head-fetch-unavailable',
        FAILURE_CLASSES.TRANSPORT_UNAVAILABLE
      );
    }

    var response;
    try {
      response = await fetchImpl(CURRENT_HEAD_URL, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: Object.freeze({ Accept: 'application/json' }),
      });
    } catch (error) {
      throw transportFailure(
        'username-registry-current-head-fetch-failed',
        FAILURE_CLASSES.TRANSPORT_UNAVAILABLE
      );
    }
    if (!response || response.ok !== true || response.status !== 200) {
      throw transportFailure(
        'username-registry-current-head-response-unavailable',
        FAILURE_CLASSES.TRANSPORT_UNAVAILABLE
      );
    }
    if (
      response.redirected !== false
      || response.url !== CURRENT_HEAD_URL
      || response.type === 'opaque'
    ) {
      throw transportFailure(
        'username-registry-current-head-response-identity-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    if (!isJsonContentType(readHeader(response, 'Content-Type'))) {
      throw transportFailure(
        'username-registry-current-head-content-type-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    if (!hasCacheDirective(readHeader(response, 'Cache-Control'), 'no-store')) {
      throw transportFailure(
        'username-registry-current-head-cache-policy-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    if (typeof response.json !== 'function') {
      throw transportFailure(
        'username-registry-current-head-response-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
    try {
      return await response.json();
    } catch (error) {
      throw transportFailure(
        'username-registry-current-head-json-invalid',
        FAILURE_CLASSES.TRANSPORT_CONTRACT_VIOLATED
      );
    }
  }

  Object.defineProperty(window, 'IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE', {
    value: Object.freeze({
      CURRENT_HEAD_URL: CURRENT_HEAD_URL,
      FAILURE_CLASSES: FAILURE_CLASSES,
      loadCurrentHead: loadCurrentHead,
      classifyTransportFailure: classifyTransportFailure,
    }),
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
