# Coin Card Trusted Public Key Record Contract v1

Status: contract proposal

Purpose: define the canonical record shape and deterministic resolution behavior
for Coin Card trusted signing keys.

Canonical source: `../../../../docs/product/coin-card/COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md`.

Implementation note: the canonical contract requires exact, acyclic,
shared-reference-free, deeply immutable plain-data key records, recognized
unique V1 usage values, strict nullable fields, strict UTC millisecond
timestamps, a fixed five-minute future-signature skew, public P-256 JWK
validation, signed top-level resolver context, exact duplicate-field matching,
and deterministic key-resolution outcomes including
`TRUSTED_KEY_SOURCE_UNAVAILABLE`.
