/* coin-card-verification.js — Coin Card manifest verification state scaffold
 *
 * This is not browser-side cryptographic verification. It defines the runtime
 * state model and execution gate that future manifest verification must satisfy.
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
      secondaryMessage: 'The protected assets and manifest evidence are valid for this card.',
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
      secondaryMessage: 'The manifest, registry, protected files, or signature evidence could not be checked. Transfers are disabled.',
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

  function readManifestPointer(root) {
    if (!root || typeof root.getAttribute !== 'function') {
      return {
        state: STATES.VERIFICATION_UNAVAILABLE,
        manifestUrl: null,
        error: 'manifest-root-unavailable',
      };
    }

    var raw = root.getAttribute('data-ix-manifest');
    var manifestUrl = raw == null ? '' : String(raw).trim();
    if (!manifestUrl) {
      return {
        state: STATES.VERIFICATION_UNAVAILABLE,
        manifestUrl: null,
        error: 'manifest-pointer-missing',
      };
    }

    return {
      state: null,
      manifestUrl: manifestUrl,
      error: null,
    };
  }

  function unavailable(error, extra) {
    var result = {
      state: STATES.VERIFICATION_UNAVAILABLE,
      manifest: null,
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

  function buildManifestMetadata(manifest) {
    return {
      schemaVersion: manifest.schemaVersion,
      cardId: manifest.cardId,
      coinCardVersion: manifest.coinCardVersion,
      recipient: manifest.recipient,
      network: manifest.network,
      registryStatus: manifest.registryStatus,
      layoutVersion: manifest.layoutVersion,
      buildVersion: manifest.buildVersion,
      manifestHash: manifest.manifestHash,
      signatureMode: manifest.signature && manifest.signature.mode || null,
      assetPaths: Array.isArray(manifest.assets)
        ? manifest.assets.map(function (asset) { return asset && asset.path; })
        : [],
    };
  }

  function normalizeLoadedManifest(manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return unavailable('manifest-invalid');
    }
    if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
      return unavailable('manifest-schema-unsupported');
    }

    for (var i = 0; i < REQUIRED_MANIFEST_FIELDS.length; i++) {
      var field = REQUIRED_MANIFEST_FIELDS[i];
      if (!manifest[field]) {
        return unavailable('manifest-missing-required-field', { field: field });
      }
    }
    if (!Array.isArray(manifest.assets) || !manifest.assets.length) {
      return unavailable('manifest-missing-required-field', { field: 'assets' });
    }
    if (!manifest.signature || typeof manifest.signature !== 'object') {
      return unavailable('manifest-missing-required-field', { field: 'signature' });
    }

    return {
      state: STATES.VERIFICATION_UNAVAILABLE,
      manifest: manifest,
      metadata: buildManifestMetadata(manifest),
      error: null,
    };
  }

  function loadManifest(pointer, fetchImpl) {
    var manifestUrl = typeof pointer === 'string'
      ? pointer.trim()
      : pointer && pointer.manifestUrl;
    if (!manifestUrl) {
      return Promise.resolve(unavailable('manifest-pointer-missing'));
    }

    var request = fetchImpl || window.fetch;
    if (typeof request !== 'function') {
      return Promise.resolve(unavailable('manifest-fetch-unavailable'));
    }

    return Promise.resolve()
      .then(function () {
        return request(manifestUrl);
      })
      .then(function (response) {
        if (!response || response.ok === false) {
          return unavailable('manifest-fetch-failed');
        }
        if (typeof response.json !== 'function') {
          return unavailable('manifest-response-invalid');
        }
        return response.json()
          .then(function (manifest) {
            return normalizeLoadedManifest(manifest);
          }, function () {
            return unavailable('manifest-parse-failed');
          });
      }, function () {
        return unavailable('manifest-fetch-failed');
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
    readManifestPointer: readManifestPointer,
    loadManifest: loadManifest,
    requireExecutable: requireExecutable,
  });
})();
