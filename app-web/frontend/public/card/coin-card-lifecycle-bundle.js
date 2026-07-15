/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_lifecycle_bundle.js.
 *
 * This file pre-defines IX_COIN_CARD_LIFECYCLE_REGISTRY_BUNDLE before
 * coin-card-lifecycle-registry.js loads. The registry module skips
 * redefining the property when it is already present.
 *
 * GeneratedAt:      2026-07-15T19:25:47.597Z
 * RegistryVersion:  1
 * CardId:           cc_demo_implicitex
 * ManifestId:       sha256:f6b5bbd4229cf0d214e5aecb9ffda10bbbbe53550a0ef9b47960731869b116a8
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
    "generatedAt": "2026-07-15T19:25:47.597Z",
    "entries": [
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 1,
        "recordId": "implicitex-production-r1-cc_demo_implicitex",
        "publishedAt": "2026-07-15T19:25:47.597Z",
        "cardId": "cc_demo_implicitex",
        "manifestId": "sha256:f6b5bbd4229cf0d214e5aecb9ffda10bbbbe53550a0ef9b47960731869b116a8",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-07-15T19:25:47.597Z",
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
          "signedAt": "2026-07-15T19:25:47.597Z",
          "value": "ZfKpDR1She6ul5w6b8xvyo0gfj7d8LjNa4AlFX0P4AKRpqGSdNAvFG7x4206i661bTuTVMXyNXEx6xaHGN7vqA"
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
