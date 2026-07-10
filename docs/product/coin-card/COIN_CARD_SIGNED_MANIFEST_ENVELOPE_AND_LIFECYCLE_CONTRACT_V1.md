# Coin Card Signed Manifest Envelope and Lifecycle Contract v1

Status: contract proposal

Purpose: define the canonical signed Coin Card manifest claim and the separate
card lifecycle resolution states. This contract builds on trusted-key resolution;
it does not replace it.

## Authority Order

Coin Card verification must preserve this order:

```text
Was the issuer key authorized?
Was the manifest authentically signed?
Is this specific card manifest currently operational?
Can its verified facts enter presentation?
Can those facts be projected toward execution?
```

`VERIFIED` authenticates the payment instruction. It does not, by itself, make a
transfer executable.

## Signed Manifest Envelope

The signed envelope must provide one canonical claim:

```text
schemaVersion
manifestId
cardId
issuerId
keyId
environment
signedAt
validFrom
validUntil
recipient
network
asset
payloadHash
previousManifestId
```

V1 timestamps must use the same strict UTC millisecond format required by the
trusted-key record contract:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

`payloadHash` binds the envelope to the protected manifest payload. A verifier
must not accept envelope fields from an unsigned location when making lifecycle
or trust decisions.

## Signature-Time Evidence

`signedAt` is an issuer assertion covered by the signature. It is not objective
third-party timestamp evidence. A future publication registry, transparency log,
receipt, blockchain anchor, or timestamping authority may add stronger timing
evidence, but V1 does not assume it.

Compromise response must account for this limitation. Suspected key compromise
should use key revocation policy `INVALIDATE_ALL_SIGNATURES`.

## Lifecycle Outcomes

Lifecycle resolution must return one deterministic internal outcome:

```text
CARD_ACTIVE
CARD_SUSPENDED
CARD_REVOKED
CARD_SUPERSEDED
CARD_EXPIRED
CARD_UNKNOWN
CARD_RECORD_INVALID
```

Only `CARD_ACTIVE` may allow the verified manifest facts to advance to the
presentation projection.

## Lifecycle Semantics

- `CARD_ACTIVE`: the card manifest is current and operational.
- `CARD_SUSPENDED`: the card is temporarily not operational.
- `CARD_REVOKED`: the card is permanently invalid.
- `CARD_SUPERSEDED`: a successor manifest replaces this manifest.
- `CARD_EXPIRED`: the manifest is outside its operational validity interval.
- `CARD_UNKNOWN`: no governed lifecycle record recognizes the manifest/card.
- `CARD_RECORD_INVALID`: lifecycle evidence is malformed or contradictory.

## Boundary

This contract governs the signed payment-instruction claim and its lifecycle.
IX execution remains separate and must independently enforce wallet, network,
amount, recipient, balance, approval, fee, and transaction-state requirements.
