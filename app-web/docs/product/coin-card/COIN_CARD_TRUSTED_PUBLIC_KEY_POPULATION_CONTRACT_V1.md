# Coin Card Trusted Public Key Population Contract v1

Status: contract proposal

Purpose: define how approved public key records may enter the protected Coin
Card trusted-key bootstrap. Public keys are not secrets, but they are still
trust-root material. They must enter the runtime only through protected,
reviewable channels.

## Core Rule

A public key record is not trusted because the key is public; it is trusted
because its source is protected.

## Key Type

v1 accepts only `coin-card-trusted-key-record.v1` records containing P-256
public JWKs. The canonical record contract is
`COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md`.

Private keys must never appear in:

- the repo
- the browser bundle
- the manifest
- the registry record
- runtime input

## Allowed Population Paths

Trusted public key records may be populated only through:

- a reviewed protected source change in the runtime bootstrap
- a future signed key registry that is itself protected by contract

## Forbidden Runtime Paths

The runtime must not populate trusted keys from:

- query parameters
- `postMessage`
- `localStorage`
- arbitrary host page state
- registry record fields
- unreviewed runtime injection

## Key Identity

Each key record must use an explicit, stable `keyId`. Key IDs must not be
derived from user input.

## Empty Allowlist

An empty trusted-key allowlist means no production `VERIFIED` result is possible.
The verifier may still report `ASSET_HASHES_PASSED` in unsigned development mode,
but empty trust material does not authorize execution.

## Rotation and Revocation

Rotation means adding, removing, or replacing keys through the protected source
path or a future signed registry.

Revocation means updating the protected key record with governed revocation
status and policy, removing the key from the protected source, or marking the
corresponding signed-registry entry unavailable in a future trusted registry.

## Verification Boundary

Population alone does not verify anything. It only determines which public key
records the verifier may consider trusted.

## Relationship to the Trusted Key Source Contract

The trusted key source contract defines where keys may be read from at runtime.
This population contract defines how approved keys get into that source without
opening a runtime injection path.
