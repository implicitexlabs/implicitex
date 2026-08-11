# Coin Card Trusted Public Key Record Contract v3

Date: 2026-08-11

**Governed production-authority vocabulary promotion. Repository-ready; not yet activated in the protected production runtime.**

## 1. Decision and compatibility boundary

This contract promotes the trusted-key record vocabulary so the protected Coin
Card runtime can authenticate every already-governed authority class. It adds
the executable-registry Current Head usage omitted from v2. It does not edit or
silently widen either prior schema.

Resolvers implementing this promotion MUST preserve all v1 and v2 validation,
timing, status, revocation, issuer, environment, and resolution semantics. A
record is validated against the closed vocabulary for its own `schemaVersion`:

- v1 remains the original three-usage schema;
- v2 remains the four-usage Transaction Evidence promotion;
- v3 is the complete five-usage production-authority schema below.

Existing key IDs, public coordinates, issuers, environments, and usages MUST
not be rebound during promotion. Existing v1 records remain v1 records.

## 2. Exact v3 record shape

The schema version is exactly:

```text
coin-card-trusted-key-record.v3
```

Every record has exactly the same own enumerable fields defined by v1 and v2:

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

All deep immutability, plain-data, atomic-source, exact P-256 public JWK,
timestamp, status, and revocation requirements from v2 remain normative.
Private JWK coordinates are forbidden.

## 3. Closed v3 usage vocabulary

The complete v3 enum is exactly:

- `coin-card-manifest-signing`
- `coin-card-lifecycle-administration`
- `coin-card-registry-publication`
- `coin-card-executable-registry-head`
- `coin-card-transaction-evidence`

No other usage is recognized. Each verifier requests one exact usage; possession
of one usage never implies another.

Under the current architecture, lifecycle records and public username registry
artifacts both use `coin-card-registry-publication`. A separate physical
lifecycle key would not create meaningful isolation until a separately governed
contract splits that usage. This v3 promotion does not make that speculative
split.

## 4. Mixed-version source and transition

An atomic trusted source MAY contain v1, v2, and v3 records concurrently. Every
record is validated using its own schema's closed enum before any lookup.

The production transition uses two releases:

1. A bridge release, signed by the existing manifest authority, retains the
   existing v1 records and adds future KMS public records as v3.
2. An activation release uses the KMS authorities while retaining legacy public
   records for governed rollback and historical verification.

Overlap does not permit key-ID rebinding. The same `keyId` cannot change schema,
algorithm, public coordinates, issuer, environment, or usage. Rotation uses a
new key ID.

The existing revocation policies remain exact:

- `NO_NEW_SIGNATURES` preserves signatures strictly before `revokedAt`;
- `INVALIDATE_AFTER_TIMESTAMP` follows verifier time at the boundary;
- `INVALIDATE_ALL_SIGNATURES` invalidates all signatures immediately.

`successorKeyId` identifies a distinct successor and never changes the old
record's cryptographic identity.

## 5. Activation boundary

The repository contains a v3-capable resolver and conformance tests, but the
currently signed runtime continues to load its protected v1 resolver. Adding
the promoted resolver to the protected asset set, changing the trusted source,
and re-signing the manifest/lifecycle package are one governed bridge-release
operation. This document does not authorize that release, create KMS keys, or
publish production artifacts.

The public conformance corpus is
`coin-card.trusted-key-record.fixtures.v3.json`. It contains public keys only.
