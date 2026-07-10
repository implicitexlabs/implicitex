/* coin-card-trusted-keys.js — protected bootstrap for trusted Coin Card key records
 *
 * This module creates the runtime allowlist used by the Coin Card verifier.
 * The allowlist is intentionally empty in the proof lane. It is frozen and
 * exposed as a read-only runtime contract so later releases can populate it with
 * trusted key records through protected, reviewable updates.
 */

(function () {
  'use strict';

  var trustedPublicKeys = Object.freeze(Object.create(null));

  Object.defineProperty(window, 'IX_COIN_CARD_TRUSTED_PUBLIC_KEYS', {
    value: trustedPublicKeys,
    writable: false,
    enumerable: true,
    configurable: false,
  });
})();
