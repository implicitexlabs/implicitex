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
        x:       "cou_3PIzr9qKAexjZA1I7DlJfv9YbKlAAyhc37HWei8",
        y:       "8SS2shxDV2LgSCanO7vNhn4_zPAu4KXebcsnK4-YCbc",
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
        x:       "Mwab07cytYUbpfiYKgaXdxGie_yvvQcwTsgwhUXgEA8",
        y:       "6UrRJewADZeCmL6r4I5FkCFtusI65izk-Sniyk0-peM",
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
