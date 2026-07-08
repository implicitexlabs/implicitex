/* coincard-free-manifest.js — Coin Card Free route-evidence primitives
 *
 * This module validates, canonicalizes, and fingerprints host-controlled
 * Free Coin Card manifests. It verifies the payment route, not recipient
 * identity or wallet ownership.
 */
(function (root, factory) {
  'use strict';

  var api = factory(root);

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.IX = root.IX || {};
    root.IX.coincardFreeManifest = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  var FREE_SCHEMA = 'implicitex.coincard.free.v1';
  var FREE_VERSION = 1;
  var HASH_PREFIX = 'sha256:';
  var EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
  var RFC3339_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  var FORBIDDEN_TEXT_RE = /<[^>]*>|javascript:|data:text\/html|on[a-z]+\s*=/i;

  var ALLOWED_FIELDS = Object.freeze({
    schema: true,
    version: true,
    created: true,
    updated: true,
    name: true,
    recipientAddress: true,
    network: true,
    token: true,
    status: true,
  });

  var SUPPORTED_NETWORKS = Object.freeze({
    polygon: Object.freeze({
      chainId: 137,
      name: 'polygon',
    }),
  });

  var SUPPORTED_TOKENS = Object.freeze({
    USDC: Object.freeze({
      symbol: 'USDC',
      contract: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
      decimals: 6,
    }),
  });

  var SUPPORTED_STATUSES = Object.freeze({
    active: true,
    paused: true,
  });

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function assertPlainObject(value, path) {
    if (!isPlainObject(value)) throw new Error(path + ' must be an object');
  }

  function assertKnownFields(value, path) {
    Object.keys(value).forEach(function (key) {
      if (!ALLOWED_FIELDS[key]) throw new Error(path + '.' + key + ' is not permitted');
    });
  }

  function assertNoArrays(value, path) {
    if (Array.isArray(value)) throw new Error(path + ' arrays are not permitted');
    if (isPlainObject(value)) {
      Object.keys(value).forEach(function (key) {
        assertNoArrays(value[key], path + '.' + key);
      });
    }
  }

  function assertString(value, path) {
    if (typeof value !== 'string') throw new Error(path + ' must be a string');
    if (value.trim() !== value) throw new Error(path + ' must not contain surrounding whitespace');
    if (!value) throw new Error(path + ' must not be empty');
    if (FORBIDDEN_TEXT_RE.test(value)) throw new Error(path + ' contains executable or presentation content');
  }

  function assertTimestamp(value, path) {
    assertString(value, path);
    if (!RFC3339_UTC_RE.test(value)) throw new Error(path + ' must be an RFC 3339 UTC timestamp');
    if (Number.isNaN(new Date(value).getTime())) throw new Error(path + ' must be a valid timestamp');
  }

  function assertManifestShape(manifest) {
    assertPlainObject(manifest, 'manifest');
    assertKnownFields(manifest, 'manifest');
    assertNoArrays(manifest, 'manifest');

    [
      'schema',
      'created',
      'updated',
      'name',
      'recipientAddress',
      'network',
      'token',
      'status',
    ].forEach(function (key) {
      assertString(manifest[key], 'manifest.' + key);
    });

    if (manifest.version !== FREE_VERSION) throw new Error('manifest.version is unsupported');
    if (manifest.schema !== FREE_SCHEMA) throw new Error('manifest.schema is unsupported');
    assertTimestamp(manifest.created, 'manifest.created');
    assertTimestamp(manifest.updated, 'manifest.updated');
    if (new Date(manifest.updated).getTime() < new Date(manifest.created).getTime()) {
      throw new Error('manifest.updated must not be earlier than manifest.created');
    }
    if (!EVM_ADDRESS_RE.test(manifest.recipientAddress)) {
      throw new Error('manifest.recipientAddress must be a valid EVM address');
    }
    if (!SUPPORTED_NETWORKS[manifest.network]) throw new Error('manifest.network is unsupported');
    if (!SUPPORTED_TOKENS[manifest.token]) throw new Error('manifest.token is unsupported');
    if (!SUPPORTED_STATUSES[manifest.status]) throw new Error('manifest.status is unsupported');
  }

  function normalizeManifest(manifest) {
    assertManifestShape(manifest);
    return {
      schema: manifest.schema,
      version: manifest.version,
      created: manifest.created,
      updated: manifest.updated,
      name: manifest.name,
      recipientAddress: manifest.recipientAddress,
      network: manifest.network,
      token: manifest.token,
      status: manifest.status,
    };
  }

  function validateCoinCardManifest(manifest) {
    var normalized = normalizeManifest(manifest);
    return {
      ok: true,
      routeValidation: 'valid',
      recipientSource: 'host-manifest',
      manifest: normalized,
      route: {
        network: SUPPORTED_NETWORKS[normalized.network],
        token: SUPPORTED_TOKENS[normalized.token],
      },
    };
  }

  function canonicalize(value) {
    if (value === null || value === undefined) {
      throw new Error('null and undefined are not canonical manifest values');
    }
    if (Array.isArray(value)) throw new Error('arrays are not permitted in V1 manifests');
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') {
      if (!Number.isInteger(value)) throw new Error('only integer numbers are permitted');
      return String(value);
    }
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (isPlainObject(value)) {
      return '{' + Object.keys(value).sort().map(function (key) {
        return JSON.stringify(key) + ':' + canonicalize(value[key]);
      }).join(',') + '}';
    }
    throw new Error('unsupported canonical manifest value');
  }

  function canonicalizeManifest(manifest) {
    return canonicalize(normalizeManifest(manifest));
  }

  function utf8Bytes(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text);
    if (typeof Buffer !== 'undefined') return Buffer.from(text, 'utf8');
    throw new Error('UTF-8 encoder unavailable');
  }

  function toHex(buffer) {
    return Array.prototype.map.call(new Uint8Array(buffer), function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function sha256Hex(text) {
    if (root.crypto && root.crypto.subtle) {
      return root.crypto.subtle.digest('SHA-256', utf8Bytes(text)).then(toHex);
    }
    if (typeof require === 'function') {
      var nodeCrypto = require('node:crypto');
      return Promise.resolve(nodeCrypto.createHash('sha256').update(text, 'utf8').digest('hex'));
    }
    return Promise.reject(new Error('SHA-256 unavailable'));
  }

  function hashManifest(manifest) {
    var canonical = canonicalizeManifest(manifest);
    return sha256Hex(canonical).then(function (hash) {
      return {
        canonical: canonical,
        hash: HASH_PREFIX + hash,
      };
    });
  }

  function buildReceiptCoinCardContext(options) {
    options = options || {};
    var validation = validateCoinCardManifest(options.manifest);
    return hashManifest(validation.manifest).then(function (result) {
      return {
        schema: validation.manifest.schema,
        version: validation.manifest.version,
        manifestUrl: options.manifestUrl || null,
        manifestHash: result.hash,
        manifestCreated: validation.manifest.created,
        manifestUpdated: validation.manifest.updated,
        name: validation.manifest.name,
        status: validation.manifest.status,
        routeValidation: validation.routeValidation,
        recipientSource: validation.recipientSource,
      };
    });
  }

  return Object.freeze({
    FREE_SCHEMA: FREE_SCHEMA,
    FREE_VERSION: FREE_VERSION,
    SUPPORTED_NETWORKS: SUPPORTED_NETWORKS,
    SUPPORTED_TOKENS: SUPPORTED_TOKENS,
    validateCoinCardManifest: validateCoinCardManifest,
    canonicalizeManifest: canonicalizeManifest,
    hashManifest: hashManifest,
    buildReceiptCoinCardContext: buildReceiptCoinCardContext,
  });
});
