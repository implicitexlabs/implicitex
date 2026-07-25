/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 *
 * GeneratedAt:      2026-07-25T22:34:25.315Z
 * RegistryVersion:  2
 * ActiveCards:      antoine, cc_demo_implicitex
 * ManifestId:       sha256:3c3354bc3112a89b4db6d18dbbd4fd0a1117eed537572d6e85052210a019afc3
 * Signer:           ix-lifecycle-pub-v1
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
    "generatedAt": "2026-07-25T22:34:25.315Z",
    "entries": [
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 1,
        "recordId": "implicitex-production-r1-antoine",
        "publishedAt": "2026-07-25T22:34:25.315Z",
        "cardId": "antoine",
        "manifestId": "sha256:3c3354bc3112a89b4db6d18dbbd4fd0a1117eed537572d6e85052210a019afc3",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-07-25T22:34:25.315Z",
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
          "keyId": "ix-lifecycle-pub-v1",
          "authorityId": "implicitex-registry",
          "signedAt": "2026-07-25T22:34:25.315Z",
          "value": "insEnE19zDd1SKLoMDb0BWV7iuzU2zTEseMRa91CXkGmw4wJERVRfWOw_XwRq9iWRoxAE3lUYtHM6OQv1ADD-A"
        }
      },
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 2,
        "recordId": "implicitex-production-r1-cc_demo_implicitex",
        "publishedAt": "2026-07-25T22:34:25.315Z",
        "cardId": "cc_demo_implicitex",
        "manifestId": "sha256:3c3354bc3112a89b4db6d18dbbd4fd0a1117eed537572d6e85052210a019afc3",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-07-25T22:34:25.315Z",
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
          "keyId": "ix-lifecycle-pub-v1",
          "authorityId": "implicitex-registry",
          "signedAt": "2026-07-25T22:34:25.315Z",
          "value": "EcWlM451lfirn60NiRTvwwFHTrP9JVJGhs_uQlow-WlXgS8EVhEvojybubzjEPPP0AdnKGBTZeIJ15KzTtYVzw"
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
