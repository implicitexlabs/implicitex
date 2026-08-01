# Coin Card Trusted Public Key Record Contract v2

Date: 2026-07-22

**Sealed — Transaction Evidence key-usage reconciliation. Not implemented or production-populated.**

## 1. Purpose and version boundary

This contract defines the trusted-key record required by
`transaction-evidence.v2`. The v1 record schema has a closed usage enum that
does not recognize Transaction Evidence signing. V2 adds that usage without
changing the meaning of sealed or deployed v1 records.

Except where this contract explicitly replaces the schema version, recognized
usage enum, and generic signing-context language, all shape, immutability, JWK,
source-atomicity, resolution-outcome, timing, and revocation rules from
`COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md` remain normative.

This contract and `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md` are one
sealed promotion unit and MUST be reviewed and versioned atomically.

## 2. Exact record schema

The record `schemaVersion` is exactly:

```text
coin-card-trusted-key-record.v2
```

Every v2 record MUST contain exactly these own enumerable data properties:

```text
schemaVersion
keyId
algorithm
publicKey
issuerId
usage
status
validFrom
validUntil
revokedAt
revocationReason
revocationPolicy
successorKeyId
environment
```

No field may be omitted. Optional semantic values use explicit `null`. Unknown,
hidden, inherited, accessor-backed, function-valued, symbol, cyclic, shared,
mutable, or non-plain data makes the atomic trusted source unavailable.

The trusted source is a deeply immutable plain-data object keyed by `keyId`.
Every own source property name MUST be a canonical identifier and MUST exactly
equal its contained record's `keyId`. Every record is validated before any
lookup; one malformed or aliased record makes the entire source unavailable.
After atomic validation, resolution looks up only the signed context `keyId`.
An absent own record returns `TRUSTED_KEY_UNKNOWN`; a caller-selected or
injected record is not a valid resolution input.

Required algorithm and public-key rules remain:

```text
algorithm = ECDSA_P256_SHA256
publicKey = public P-256 JWK with no private d field
```

`key_ops`, when present, MUST be exactly `["verify"]`; `ext`, when present,
MUST be `true`.

## 3. Recognized v2 usages

The closed v2 usage enum is:

- `coin-card-manifest-signing`
- `coin-card-lifecycle-administration`
- `coin-card-registry-publication`
- `coin-card-transaction-evidence`

`usage` is a nonempty dense array of unique recognized values. Transaction
Evidence authentication MUST request exact usage
`coin-card-transaction-evidence`; another recognized usage does not imply it.

## 4. Resolution context

The resolver context is:

```text
keyId
usage
issuerId
environment
signatureTime
verificationTime
```

For Transaction Evidence v2, all authority inputs come from signed content:

```text
keyId         = authority.signingKeyId
issuerId      = authority.issuerId
environment   = authority.environment
signatureTime = authority.signedAt
usage         = "coin-card-transaction-evidence" (fixed by verifier profile)
```

`verificationTime` is verifier-controlled. Unsigned wrapper `keyId` MUST first
equal signed `authority.signingKeyId`; lifecycle time, head time, and
verification time are not substitutes for signature time.

V2 timestamps are strict UTC millisecond values:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

`validFrom` is inclusive. `validUntil` is inclusive for signing-time
eligibility. Missing or invalid timing evidence fails as
`TRUSTED_KEY_RECORD_INVALID`. Signature time later than verification time plus
the fixed five-minute verifier skew also fails as
`TRUSTED_KEY_RECORD_INVALID`.

## 5. Deterministic resolution order

After atomic source and record validation, resolution MUST evaluate:

1. key existence;
2. requested usage membership;
3. environment equality;
4. issuer equality;
5. canonical `signatureTime` and `verificationTime`;
6. future-skew limit;
7. inclusive `validFrom` and `validUntil` eligibility;
8. record status and revocation policy.

The stable outcomes remain:

```text
TRUSTED_KEY_ACTIVE
TRUSTED_KEY_NOT_YET_ACTIVE
TRUSTED_KEY_EXPIRED
TRUSTED_KEY_REVOKED
TRUSTED_KEY_USAGE_DENIED
TRUSTED_KEY_ENVIRONMENT_MISMATCH
TRUSTED_KEY_SOURCE_UNAVAILABLE
TRUSTED_KEY_UNKNOWN
TRUSTED_KEY_RECORD_INVALID
```

Issuer disagreement returns `TRUSTED_KEY_USAGE_DENIED` with internal reason
`trusted-key-issuer-mismatch`. Only `TRUSTED_KEY_ACTIVE` may expose public-key
material to a signature verifier.

## 6. Status and revocation semantics

For `ACTIVE`, `revokedAt`, `revocationReason`, and `revocationPolicy` MUST all
be `null`. Once activation and validity-window checks pass, the result is
`TRUSTED_KEY_ACTIVE`.

For `EXPIRED`, the result is `TRUSTED_KEY_EXPIRED`. `validUntil` independently
tests whether the key was eligible at the signed time; it is not replaced by
verification time.

For `REVOKED`, `revokedAt` and `revocationPolicy` are required:

- `INVALIDATE_ALL_SIGNATURES`: every signature fails immediately as
  `TRUSTED_KEY_REVOKED`, regardless of signing time.
- `INVALIDATE_AFTER_TIMESTAMP`: verification before `revokedAt` may resolve
  active; verification at or after `revokedAt` resolves
  `TRUSTED_KEY_REVOKED`, regardless of signing time.
- `NO_NEW_SIGNATURES`: a signature strictly before `revokedAt` may resolve
  active; a signature at or after `revokedAt` resolves
  `TRUSTED_KEY_REVOKED`.

`revokedAt` takes effect at its exact millisecond. Compromise SHOULD use
`INVALIDATE_ALL_SIGNATURES`; routine rotation SHOULD use
`NO_NEW_SIGNATURES` and MAY identify a distinct `successorKeyId`.

Key-policy success does not authenticate any object. The caller must still
verify the signature over the profile's exact domain-separated bytes.

## 7. Population and implementation boundary

This contract does not add a production Transaction Evidence public key and
does not authorize changing the checked-in runtime resolver or trust source.
The production source MUST remain secure-empty for this usage until governed
key generation, custody, publication, rotation, and incident procedures are
separately approved.

The deterministic v2 key records in
`coin-card.transaction-evidence-signature.fixtures.v2.json` are public test
keys only.
