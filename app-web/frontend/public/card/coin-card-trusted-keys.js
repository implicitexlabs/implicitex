/* coin-card-trusted-keys.js — protected bootstrap for trusted Coin Card key records
 *
 * GENERATED FILE — do not edit by hand. Run scripts/generate_signed_coin_card_acceptance.js.
 */

(function () {
  'use strict';

  var trustedPublicKeys = Object.freeze(Object.assign(Object.create(null), {
    "ix-coin-card-manifest-v1": Object.freeze(Object.assign(Object.create(Object.prototype), {
      schemaVersion:    "coin-card-trusted-key-record.v1",
      keyId:            "ix-coin-card-manifest-v1",
      algorithm:        "ECDSA_P256_SHA256",
      publicKey:        Object.freeze(Object.assign(Object.create(Object.prototype), {
        kty:     "EC",
        crv:     "P-256",
        x:       "vBu_HYcJYHb1R8ED0cixUxefS06vbL9_HmLIm4gisKo",
        y:       "F7d-p9odLxJ4dXmM3iM_CHpK9Ce2mxsb8-IDcjqW5wk",
        key_ops: Object.freeze(["verify"]),
        ext:     true,
      })),
      issuerId:         "implicitex",
      usage:            Object.freeze(["coin-card-manifest-signing"]),
      status:           "ACTIVE",
      validFrom:        "2026-07-15T00:00:00.000Z",
      validUntil:       null,
      revokedAt:        null,
      revocationReason: null,
      revocationPolicy: null,
      successorKeyId:   null,
      environment:      "production",
    })),
    "ix-lifecycle-pub-v1": Object.freeze(Object.assign(Object.create(Object.prototype), {
      schemaVersion:    "coin-card-trusted-key-record.v1",
      keyId:            "ix-lifecycle-pub-v1",
      algorithm:        "ECDSA_P256_SHA256",
      publicKey:        Object.freeze(Object.assign(Object.create(Object.prototype), {
        kty:     "EC",
        crv:     "P-256",
        x:       "V6m6D9g83f90_JYgKXKgL2muizX1traoYk3abaj_O0w",
        y:       "aq9YrHM9U5P26U4ZVzueRi1BF56dBM7C52-cSstTnGw",
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
