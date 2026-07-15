/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 *
 * GeneratedAt:      2026-07-15T21:16:25.142Z
 * RegistryVersion:  1
 * CardId:           cc_demo_implicitex
 * ManifestId:       sha256:4492795bd896c2fdf13dad6b307669731e41fc1da3571d48a7d1635808c53efb
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
    "generatedAt": "2026-07-15T21:16:25.142Z",
    "entries": [
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 1,
        "recordId": "implicitex-production-r1-cc_demo_implicitex",
        "publishedAt": "2026-07-15T21:16:25.142Z",
        "cardId": "cc_demo_implicitex",
        "manifestId": "sha256:4492795bd896c2fdf13dad6b307669731e41fc1da3571d48a7d1635808c53efb",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-07-15T21:16:25.142Z",
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
          "signedAt": "2026-07-15T21:16:25.142Z",
          "value": "YYE2gKF9r3QR2g5csvCGRIRveCH0oP8gvEvJAD8ka1w5GxXQYjow0gw6_nlIUK8H2ax984ZYoKi2P6xxUFfa8g"
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
