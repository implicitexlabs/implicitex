# Coin Card Public Username Registry Contract V2

Status: implemented for local and non-production authority sources; production
snapshot publication is not authorized.

## Purpose

V2 promotes the current Coin Card username policy without reinterpreting V1
signatures or hashes. Except for the schema identifier, signature/hash domains,
and username grammar below, the closed snapshot shape, trusted-key usage,
Current Head conjunction, uniqueness rules, failure behavior, and execution
boundary remain those defined by
`COIN_CARD_PUBLIC_USERNAME_REGISTRY_CONTRACT_V1.md`.

## Current canonical username policy

A username accepted for current reservation, wallet-control evidence, or V2
publication contains:

- 4 through 32 characters inclusive;
- lowercase ASCII letters `a` through `z`;
- ASCII digits `0` through `9`; and
- internal hyphens.

A username cannot begin or end with a hyphen. Consecutive internal hyphens
remain valid because V1 allowed them and they are valid DNS label content.
Underscores, whitespace, non-ASCII text, periods, and all other punctuation are
invalid. Current issuance inputs are already-canonical values: issuance does
not trim or lowercase them.

Every accepted username can be represented directly as:

```text
https://<username>.coincard.click/
```

The equivalent path route `https://coincard.click/<username>` is an alias for
that exact identity and never creates another account, username, or Coin Card.
Public URL parsing retains the already-governed URL normalization behavior:
ASCII case in a hostname or path route is canonicalized to lowercase before the
current username predicate is applied. Registration and wallet-evidence inputs
are stricter and reject uppercase instead of changing identity-bearing input.

## V2 snapshot and domains

The snapshot schema identifier is:

```text
coin-card-public-username-registry.v2
```

The signature input is:

```text
UTF8("ImplicitEx.CoinCard.PublicUsernameRegistry.v2")
|| 0x00
|| UTF8(coinCardCanonicalJson(signaturePayload))
```

The authenticated artifact hash is:

```text
SHA256(
  UTF8("ImplicitEx.CoinCard.PublicUsernameRegistryArtifact.v2")
  || 0x00
  || UTF8(coinCardCanonicalJson(exactSnapshotIncludingSignatureValue))
)
```

The existing `coin-card-public-username-registry-head.v1` Current Head remains
valid because it binds only the exact snapshot revision and content hash. It
does not reinterpret the schema or username grammar inside the snapshot.

## Historical V1 compatibility

V1 remains authenticated with its original schema, 3–30 grammar, signature
domain, and artifact-hash domain. A valid V1 artifact remains historical
cryptographic evidence. V1 acceptance does not make a 3-character username
eligible for new registration, wallet evidence, V2 publication, or a current
canonical public route.

This distinction is mandatory:

```text
historical verification != current registration eligibility
```

No existing signed V1 bytes, public-key coordinates, key IDs, or hashes are
changed by this promotion.

## Shared implementation authority

The canonical implementation source is:

```text
app-web/shared/coin-card-canonical-username.js
```

Checked generated copies are packaged for the public browser and Firebase
Functions runtimes. `app-web/scripts/sync_coin_card_username_contract.js
--check` fails if either runtime copy drifts from the single source.

Current publishers reject every username that fails the 4–32 policy before
signing or advancing a Current Head. The lower-level signing primitive may
still sign a schema-valid V1 artifact for governed historical/transition
operations, but such an artifact cannot pass current publication policy solely
because its V1 signature is valid.

## Non-actions

This contract promotion does not publish a snapshot or Current Head, alter a
production signature, change DNS, enable execution, or authorize a holder flow.
