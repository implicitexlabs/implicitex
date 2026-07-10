# Coin Card Trusted Key Source Contract v1

Status: contract proposal

Purpose: define where the Coin Card verifier is allowed to obtain trusted public
key records for `signed-p256-v1`. The key source is part of the trust root. If
the key source is mutable or unprotected, the signature check is not trustworthy.

## Core Rule

A public key record is trusted only if the trust source is itself protected.

## Allowed v1 Source

v1 should use a protected runtime allowlist embedded in the Coin Card runtime
bundle, exposed as:

```text
window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS
```

This object must be:

- initialized by protected runtime code
- deeply frozen or treated as read-only at every nested record level
- plain-data only, without getters, setters, symbol properties, functions, or
  unexpected prototypes
- populated only with approved public key records
- unavailable for user or host mutation after initialization

The browser verifier may read the allowlist. It must not accept public keys or
key records from untrusted runtime input.

## Atomic Source Semantics

The trusted-key population is atomic. If the source object or any entry violates
the protected plain-data contract, the entire source is unavailable.

The verifier must not salvage valid-looking entries from a malformed source. It
must fail closed with internal outcome `TRUSTED_KEY_SOURCE_UNAVAILABLE`, even
when the requested key record would have passed validation in isolation.

This makes the protected source a single trust root rather than a partially
recoverable data cache.

How approved keys enter this allowlist is defined separately in
`COIN_CARD_TRUSTED_PUBLIC_KEY_POPULATION_CONTRACT_V1.md`.

The canonical trusted-key record shape and resolution outcomes are defined in
`COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md`.

Runtime validation and policy resolution are owned by the protected shared
resolver module `card/coin-card-trusted-key-resolution.js`. Manifest
verification and lifecycle record verification must call that shared authority
instead of implementing independent trusted-key policy.

## Source Requirements

- No private keys in the repo.
- No public keys or key records from query parameters, postMessage,
  localStorage, or arbitrary runtime input.
- No promotion of a signature to trust if the key source is missing.
- No promotion of a signature to trust if the key source is mutable at runtime.

## Missing or Mutable Source

If `window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS` is missing, empty, or mutable in a
way that breaks trust, the verifier must treat signature evaluation as
`VERIFICATION_UNAVAILABLE`.

A missing or mutable trusted-key source must resolve internally as
`TRUSTED_KEY_SOURCE_UNAVAILABLE`, not as `TRUSTED_KEY_UNKNOWN`.

## Key Rotation and Revocation

Key rotation should be handled by replacing the allowlist in a protected runtime
release or by reading from a future signed key registry. That registry must be
explicitly protected before it can become the trust root.

Key revocation must remove the key from the trusted source or invalidate the
source entry in a future signed registry.

## Policy Boundary

The trusted key source answers only this question:

> Which public key records may the verifier trust?

The trusted key resolver answers:

> Is this recognized key record authorized for this usage, environment,
> authority, and signing time?

It does not answer:

> Is the signature valid?

That remains the verifier’s job.

## Future Extension

If the trusted key source ever moves to a registry, that registry must itself be
authenticated by a contract at least as strong as this one.
