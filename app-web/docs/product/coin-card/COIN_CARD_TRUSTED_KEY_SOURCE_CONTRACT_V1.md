# Coin Card Trusted Key Source Contract v1

Status: contract proposal

Purpose: define where the Coin Card verifier is allowed to obtain trusted public
keys for `signed-p256-v1`. The public key source is part of the trust root. If
the key source is mutable or unprotected, the signature check is not trustworthy.

## Core Rule

A public key is trusted only if the trust source is itself protected.

## Allowed v1 Source

v1 should use a protected runtime allowlist embedded in the Coin Card runtime
bundle, exposed as:

```text
window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS
```

This object must be:

- initialized by protected runtime code
- frozen or treated as read-only
- populated only with approved public keys
- unavailable for user or host mutation after initialization

The browser verifier may read the allowlist. It must not accept public keys from
untrusted runtime input.

## Source Requirements

- No private keys in the repo.
- No public keys from query parameters, postMessage, localStorage, or arbitrary
  runtime input.
- No promotion of a signature to trust if the key source is missing.
- No promotion of a signature to trust if the key source is mutable at runtime.

## Missing or Mutable Source

If `window.IX_COIN_CARD_TRUSTED_PUBLIC_KEYS` is missing, empty, or mutable in a
way that breaks trust, the verifier must treat signature evaluation as
`VERIFICATION_UNAVAILABLE`.

## Key Rotation and Revocation

Key rotation should be handled by replacing the allowlist in a protected runtime
release or by reading from a future signed key registry. That registry must be
explicitly protected before it can become the trust root.

Key revocation must remove the key from the trusted source or invalidate the
source entry in a future signed registry.

## Policy Boundary

The trusted key source answers only this question:

> Which public keys may the verifier trust?

It does not answer:

> Is the signature valid?

That remains the verifier’s job.

## Future Extension

If the trusted key source ever moves to a registry, that registry must itself be
authenticated by a contract at least as strong as this one.
