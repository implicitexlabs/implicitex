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
    'card/coin-card-verification.js',
    'card/card.js',
    'card/card.css',
    'js/ix-execution.js',
  ]);
  var SUPPORTED_SIGNATURE_MODES = Object.freeze({
    'signed-p256-v1': true,
  });

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

  function getTrustedPublicKey(keyId) {
    if (!keyId) return null;

    var trustedKeys = window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS;
    if (!trustedKeys || typeof trustedKeys !== 'object') return null;

    if (!Object.prototype.hasOwnProperty.call(trustedKeys, keyId)) return null;
    return trustedKeys[keyId] || null;
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

    var trustedPublicKey = getTrustedPublicKey(signature.keyId);
    if (!trustedPublicKey) {
      return unavailable('integrity-manifest-public-key-unavailable', {
        signatureMode: signatureMode,
        keyId: signature.keyId,
      });
    }

    return verifyP256Signature(integrityManifest, trustedPublicKey)
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
    normalizeState: normalizeState,
    getStateCopy: getStateCopy,
    canExecuteTransfer: canExecuteTransfer,
    getRequiredAssetPaths: getRequiredAssetPaths,
    hasRequiredAssets: hasRequiredAssets,
    canonicalizeIntegrityManifestPayload: canonicalizeIntegrityManifestPayload,
    getTrustedPublicKey: getTrustedPublicKey,
    readIntegrityManifestPointer: readIntegrityManifestPointer,
    readManifestPointer: readIntegrityManifestPointer,
    loadIntegrityManifest: loadIntegrityManifest,
    evaluateSignaturePolicy: evaluateSignaturePolicy,
    verifyP256Signature: verifyP256Signature,
    requireExecutable: requireExecutable,
  });
})();
