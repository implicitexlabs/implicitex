/* coin-card-lifecycle-bundle.js — signed lifecycle registry publication
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 *
 * GeneratedAt:      2026-08-01T18:41:19.556Z
 * RegistryVersion:  2
 * ActiveCards:      antoine, cc_demo_implicitex
 * ManifestId:       sha256:37c2fe0456434d728dcb9580d27a8c96aba6b7ef1304f57947c48e2da93c5c52
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
    "generatedAt": "2026-08-01T18:41:19.556Z",
    "entries": [
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 1,
        "recordId": "implicitex-production-r1-antoine",
        "publishedAt": "2026-08-01T18:41:19.556Z",
        "cardId": "antoine",
        "manifestId": "sha256:37c2fe0456434d728dcb9580d27a8c96aba6b7ef1304f57947c48e2da93c5c52",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-08-01T18:41:19.556Z",
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
          "signedAt": "2026-08-01T18:41:19.556Z",
          "value": "gOeDdu36sbojPaWV_1MSlTREGtZFXinefrguc_WKW-kPb3888LvhITTZ1owYmJ4QbgNwObbDKKTjQs3ZcuD15g"
        }
      },
      {
        "registryId": "implicitex-production",
        "registrySchemaVersion": "coin-card-lifecycle-registry-record.v1",
        "environment": "production",
        "registryVersion": 2,
        "recordId": "implicitex-production-r1-cc_demo_implicitex",
        "publishedAt": "2026-08-01T18:41:19.556Z",
        "cardId": "cc_demo_implicitex",
        "manifestId": "sha256:37c2fe0456434d728dcb9580d27a8c96aba6b7ef1304f57947c48e2da93c5c52",
        "revision": 1,
        "previousManifestId": null,
        "cardStatus": "CARD_ACTIVE",
        "manifestStatus": "MANIFEST_CURRENT",
        "effectiveFrom": "2026-08-01T18:41:19.556Z",
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
          "signedAt": "2026-08-01T18:41:19.556Z",
          "value": "I76IGKWPn4fQ-FbTUYjlFaeDLXFvex46QcPtayH9t7uskIlvyNU8-hgR4p11T69rvY9nM0vfhDlr1LgAyb5M7w"
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
