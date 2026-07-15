/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 *
 * GeneratedAt:      2026-07-15T21:36:43.556Z
 * RegistryVersion:  1
 * CardId:           cc_demo_implicitex
 * ManifestId:       sha256:a3308b11d516817c221d006c29ec139db1ae79e5e987247c1f2bee7fa0d89285
 * RecordId:         implicitex-production-r1-cc_demo_implicitex
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
    "registryVersion": 1,
    "generatedAt": "2026-07-15T21:36:43.556Z",
    "entries": [
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 1,
        "recordId": "implicitex-production-r1-cc_demo_implicitex",
        "publishedAt": "2026-07-15T21:36:43.556Z",
        "cardId": "cc_demo_implicitex",
        "manifestId": "sha256:a3308b11d516817c221d006c29ec139db1ae79e5e987247c1f2bee7fa0d89285",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-07-15T21:36:43.556Z",
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
          "signedAt": "2026-07-15T21:36:43.556Z",
          "value": "eXrYswppE8z00oKZbN9vyhB2j7if786_Yx9RaSSz55qdAEbeH1ZkvxfAskoK0Mda-UD_GWuRmr3u4qrseEMyuQ"
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
