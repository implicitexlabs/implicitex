/* coin-card-trusted-keys.js — protected bootstrap for trusted Coin Card key records
 *
 * This module creates the runtime allowlist used by the Coin Card verifier.
 * GENERATED FILE — do not edit by hand. Run scripts/generate_lifecycle_bundle.js.
 *
 * Key:     ix-lifecycle-pub-v1
 * Usage:   coin-card-registry-publication
 * ValidFrom: 2026-07-15T00:00:00.000Z
 */

(function () {
  'use strict';

  var trustedPublicKeys = Object.freeze(Object.assign(Object.create(null), {
    "ix-lifecycle-pub-v1": Object.freeze(Object.assign(Object.create(Object.prototype), {
      schemaVersion:    "coin-card-trusted-key-record.v1",
      keyId:            "ix-lifecycle-pub-v1",
      algorithm:        "ECDSA_P256_SHA256",
      publicKey:        Object.freeze(Object.assign(Object.create(Object.prototype), {
        kty:     "EC",
        crv:     "P-256",
        x:       "rP__P2nUpYDUUVHgLHlWvZFOz_sYafMMyZqrXELdQSw",
        y:       "J4F09ciEIv-lqdCCBnLvGUcZnFAZ9oShMw08uPWW2MM",
        key_ops: Object.freeze(["verify"]),
        ext:     true,
      })),
      issuerId:         "implicitex-registry",
      usage:            Object.freeze(["coin-card-registry-publication"]),
      status:           "ACTIVE",
      validFrom:        "2026-07-15T00:00:00.000Z",
      validUntil:       null,
      revokedAt:        null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId:   null,
      environment:      "production",
    })),
  }));

  Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_PUBLIC_KEYS', {
    value: trustedPublicKeys,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
