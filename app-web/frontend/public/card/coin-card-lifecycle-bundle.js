/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 *
 * GeneratedAt:      2026-08-10T23:44:53.000Z
 * RegistryVersion:  2
 * ActiveCards:      antoine, cc_demo_implicitex
 * ManifestId:       sha256:fc4d5bbfe85ae197ef3f1a2c85c10d82df0b1d4f1c09e317bd28ccb78fb29da8
 * Signer:           ix-lifecycle-pub-v2
 */

(function () {
  'use strict';

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (k) { deepFreeze(value[k]); });
    return Object.freeze(value);
  }

  var bundle = deepFreeze({
    "registrySchemaVersion": "coin-card-lifecycle-registry-bundle.v1",
    "registryId": "implicitex-production",
    "environment": "production",
    "registryVersion": 2,
    "generatedAt": "2026-08-10T23:44:53.000Z",
    "entries": [
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 1,
        "recordId": "implicitex-production-r1-antoine",
        "publishedAt": "2026-08-10T23:44:53.000Z",
        "cardId": "antoine",
        "manifestId": "sha256:fc4d5bbfe85ae197ef3f1a2c85c10d82df0b1d4f1c09e317bd28ccb78fb29da8",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-08-10T23:44:53.000Z",
        "effectiveUntil": null,
        "supersededByManifestId": null,
        "reasonCode": null,
        "authorityId": "implicitex-registry",
        "administrationEvidenceHash": null,
        "signature": {
          "mode": "signed-p256-v1",
          "algorithm": "ECDSA_P256_SHA256",
          "signatureEncoding": "ieee-p1363",
          "signatureLengthBytes": 64,
          "signatureValueEncoding": "base64url-unpadded",
          "keyId": "ix-lifecycle-pub-v2",
          "authorityId": "implicitex-registry",
          "signedAt": "2026-08-10T23:44:53.000Z",
          "value": "C2LZ7Y-4qVHVRsYpgBNx_oV8Yoo8PIyqwGoGmstohz78R0ElUql02JzipYxgLrIhZ4O3kl7WUKHW8dFiWJtBlA"
        }
      },
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 2,
        "recordId": "implicitex-production-r1-cc_demo_implicitex",
        "publishedAt": "2026-08-10T23:44:53.000Z",
        "cardId": "cc_demo_implicitex",
        "manifestId": "sha256:fc4d5bbfe85ae197ef3f1a2c85c10d82df0b1d4f1c09e317bd28ccb78fb29da8",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-08-10T23:44:53.000Z",
        "effectiveUntil": null,
        "supersededByManifestId": null,
        "reasonCode": null,
        "authorityId": "implicitex-registry",
        "administrationEvidenceHash": null,
        "signature": {
          "mode": "signed-p256-v1",
          "algorithm": "ECDSA_P256_SHA256",
          "signatureEncoding": "ieee-p1363",
          "signatureLengthBytes": 64,
          "signatureValueEncoding": "base64url-unpadded",
          "keyId": "ix-lifecycle-pub-v2",
          "authorityId": "implicitex-registry",
          "signedAt": "2026-08-10T23:44:53.000Z",
          "value": "tYn_-g5CdmuEOdlqUJpB3eJyTh7bPflrQmy5lYnnG4Kn4iM47RmVM3Ollj2ktg8XmeM6_p68d1tR35EQeSuMOA"
        }
      }
    ]
  });

  Object.defineProperty(window, 'IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE', {
    value: bundle,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
