# Coin Card Trusted Public Key Record Contract v1

Status: contract proposal

Purpose: define the canonical record shape and deterministic resolution behavior
for Coin Card trusted signing keys. A cryptographically valid signature is
trusted only when its `keyId` resolves to an authorized key record for the
requested use, environment, issuer, and signing time.

## Core Rule

The verifier must not ask only:

```text
Does this public key appear in an array?
```

It must ask:

```text
Does this manifest identify a recognized key record currently authorized for
this exact use, environment, issuer, and verification context?
```

## Record Schema

v1 trusted-key records use:

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

The record property set is exact. Every field listed above must be present as
an own enumerable data property, and no additional record fields are permitted.
Optional semantic values must be represented by explicit `null`, not by omitted
fields, empty strings, `undefined`, or other falsy values.

Required v1 values:

- `schemaVersion`: `coin-card-trusted-key-record.v1`
- `algorithm`: `ECDSA_P256_SHA256`
- `usage`: nonempty dense array of unique recognized V1 usages
- `status`: `ACTIVE`, `REVOKED`, or `EXPIRED`
- `publicKey`: P-256 public JWK
- `environment`: trust domain such as `production` or `staging`

Recognized V1 usages are:

- `coin-card-manifest-signing`
- `coin-card-lifecycle-administration`
- `coin-card-registry-publication`

`keyId` must be stable, explicit, unique within the trusted source, and must not
be derived from untrusted runtime input.

The trusted source, each record, each array field, and the public JWK object must
be deeply immutable plain data at runtime. A mutable nested record is invalid
even if the outer source object is frozen.

Trusted-key records must contain only own data properties. Accessors, setters,
symbol properties, functions, and unexpected prototypes are invalid in the trust
root.

Trusted-key records and nested trusted-key data must be acyclic. Cycles and
shared object references are invalid for V1 trust-root data.

The trusted-key source is atomic. A malformed record shape, hidden property,
accessor, unexpected property, invalid nullability, cycle, mutable nested value,
shared object reference, invalid schema version, unsupported algorithm,
malformed public JWK, malformed issuer, malformed usage array, unknown usage,
duplicate usage, invalid status, invalid record timestamp, malformed
environment, successor self-reference, or non-plain-data entry makes the entire
source unavailable as `TRUSTED_KEY_SOURCE_UNAVAILABLE`.

The public JWK must be a public P-256 verification key:

- `kty`: `EC`
- `crv`: `P-256`
- `x` and `y`: canonical unpadded base64url P-256 coordinate fields
- no private `d` field
- `key_ops`, when present, must be exactly `["verify"]`
- `ext`, when present, must be `true`

## Time Semantics

The resolver distinguishes:

- `signatureTime`: when the manifest was signed.
- `verificationTime`: when the Coin Card is verified.

The key must be active for the signature time. Missing or invalid timing evidence
fails closed as `TRUSTED_KEY_RECORD_INVALID`.

`validUntil` must be either `null` or a strict UTC timestamp. `revokedAt` must be
either `null` or a strict UTC timestamp. Empty strings and omitted fields are
invalid.

V1 timestamps must be strict UTC millisecond timestamps:

```text
YYYY-MM-DDTHH:mm:ss.sssZ
```

`validFrom` is inclusive. `validUntil` is inclusive for signing-time eligibility.
`revokedAt` takes effect at that exact instant.

`signatureTime` must not be later than `verificationTime` plus the verifier's
fixed clock-skew allowance. V1 uses a five-minute verifier-controlled skew.
Future signatures beyond that skew fail as `TRUSTED_KEY_RECORD_INVALID` with
reason `trusted-key-signature-time-in-future`.

## Revocation Semantics

`revocationPolicy` defines how a revoked key affects prior signatures:

- `INVALIDATE_ALL_SIGNATURES`: all signatures using the key fail immediately.
- `INVALIDATE_AFTER_TIMESTAMP`: verification at or after `revokedAt` fails.
- `NO_NEW_SIGNATURES`: signatures before `revokedAt` may remain valid; signatures
  at or after `revokedAt` fail.

Compromised-key revocation should use `INVALIDATE_ALL_SIGNATURES`. Routine
rotation should use `NO_NEW_SIGNATURES` with `successorKeyId` when applicable.

For non-revoked records, `revokedAt`, `revocationReason`, and
`revocationPolicy` must all be `null`. For revoked records, `revokedAt` and
`revocationPolicy` are required. `revocationReason` may be `null` or a nonempty
string. `successorKeyId` may be `null` or a nonempty string, and it must not
equal the record's own `keyId`.

## Resolution Outcomes

The resolver must produce one deterministic internal outcome:

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

Only `TRUSTED_KEY_ACTIVE` may provide public key material to the signature
verifier. All other outcomes must block promotion to `VERIFIED`.

## Boundary

This contract resolves key authority. It does not validate the signature bytes,
prove card lifecycle status, or authorize IX execution by itself.

The resolver context used for `keyId`, `issuerId`, `environment`, and
`signatureTime` must come from signed top-level manifest fields. If duplicate
values appear in `signature`, every present duplicate must match exactly,
including `null`, `undefined`, empty string, and wrong-type values. Mismatches
fail closed before key resolution.
