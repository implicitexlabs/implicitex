/* coin-card-verification.js — Coin Card Integrity Manifest verification state scaffold
 *
 * This is not browser-side cryptographic verification. It defines the runtime
 * state model and execution gate that future Integrity Manifest verification must satisfy.
 */

(function () {
  'use strict';

  var STATES = Object.freeze({
    VERIFIED: 'VERIFIED',
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

  var STATE_SET = Object.freeze({
    VERIFIED: true,
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
    readIntegrityManifestPointer: readIntegrityManifestPointer,
    readManifestPointer: readIntegrityManifestPointer,
    loadIntegrityManifest: loadIntegrityManifest,
    requireExecutable: requireExecutable,
  });
})();
