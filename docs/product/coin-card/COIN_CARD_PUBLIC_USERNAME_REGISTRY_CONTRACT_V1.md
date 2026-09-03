# Coin Card Public Username Registry Contract V1

Status: implemented with synthetic signed fixtures; production source and
production identity publication are not authorized.

## 1. Purpose and boundary

The Public Username Registry is the sole browser authority for exact resolution
of one normalized public username to one opaque Coin Card identity. It owns:

```text
normalized username
        -> account_id
        -> card_id
        -> username status
        -> signed snapshot revision and validity evidence
```

It does not own payment recipient, chain, token, issuer, lifecycle resolution,
presentation promotion, or execution authorization. Every registry result has
`presentationEligible: false` and `executionEligible: false`.

The browser integration name remains
`IX_COIN_CARD_PUBLIC_HANDLE_REGISTRY` for V1 compatibility. Within that API,
"handle" means the normalized username. It is not an alias namespace.

## 2. Exact-match rule

The resolver canonicalizes both direct URL representations to one normalized
username:

```text
https://antoinedennison.coincard.click/
https://coincard.click/antoinedennison
```

The registry performs an exact lookup of `antoinedennison`. It never performs
prefix, substring, phonetic, display-name, or fuzzy matching. Consequently,
`antoine` is a lookup for the exact username `antoine` and does not resolve
`antoinedennison`.

Search is a separate discovery system. A search result must be deliberately
selected and navigated to its exact username route before Public Resolution.

## 3. Signed snapshot source and schema

After Current Head authentication, the registry passes its exact
`currentSnapshotHash` to
`IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_SNAPSHOT_SOURCE.loadSnapshotByHash()`.
That fixed-origin loader derives the sole content-addressed artifact URL under
`COIN_CARD_PUBLIC_REGISTRY_SOURCE_CONTRACT_V1.md`. Browser input cannot select
the snapshot. The loaded untrusted artifact contains exactly:

| Field | Requirement |
|---|---|
| `registrySchemaVersion` | Exact `coin-card-public-username-registry.v1`. |
| `registryId` | Exact `implicitex-public-usernames`. |
| `environment` | Exact `production`; must also match trusted-key environment. |
| `registryRevision` | Positive safe integer; monotonically increasing. |
| `issuedAt` | Canonical UTC millisecond timestamp. |
| `expiresAt` | Canonical UTC millisecond timestamp, after `issuedAt` and no more than 24 hours later. |
| `authorityId` | Exact `implicitex-registry`; must also match trusted-key issuer. |
| `entries` | Username-sorted array of closed-schema entries. |
| `signature` | P-256 signature envelope defined below. |

Each entry contains exactly:

| Field | Requirement |
|---|---|
| `username` | Normalized 3–30 character lowercase username. |
| `accountId` | `acct_<ULID>`, except `RESERVED`/`SYSTEM`, which require `null`. |
| `cardId` | `cc_<ULID>`, except `RESERVED`/`SYSTEM`, which require `null`. |
| `status` | `ACTIVE`, `GRACE`, `EXPIRED`, `TOMBSTONED`, `RESERVED`, or `SYSTEM`. |

`AVAILABLE` is represented by absence, not by a stored record. Within one signed
snapshot, usernames, non-null account IDs, and non-null card IDs must each be
unique. Entries must be strictly sorted by username. Those rules enforce one
username per account and prevent a card from gaining an alternate public route.

Unknown, additional, accessor, cyclic, non-plain, noncanonical, or incorrectly
ordered data is invalid. A readable card ID such as `antoine` is invalid even if
the enclosing snapshot carries a valid signature.

## 4. Authentication

The signature envelope contains exactly:

```text
mode                    signed-p256-v1
algorithm               ECDSA_P256_SHA256
signatureEncoding       ieee-p1363
signatureLengthBytes    64
signatureValueEncoding  base64url-unpadded
keyUsage                coin-card-registry-publication
keyId                   <trusted key ID>
authorityId             <same as snapshot.authorityId>
signedAt                 <same as snapshot.issuedAt>
value                    <86-character canonical base64url signature>
```

The signed payload is the exact snapshot with only `signature.value` omitted:

```text
UTF8("ImplicitEx.CoinCard.PublicUsernameRegistry.v1")
|| 0x00
|| UTF8(coinCardCanonicalJson(signaturePayload))
```

The key must resolve through the existing trusted-key authority for the exact
environment, authority, signature time, verification time, signature mode, and
`coin-card-registry-publication` usage. Self-supplied keys are forbidden.

After signature verification, the exact authenticated snapshot hash is:

```text
SHA256(
  UTF8("ImplicitEx.CoinCard.PublicUsernameRegistryArtifact.v1")
  || 0x00
  || UTF8(coinCardCanonicalJson(exactSnapshotIncludingSignatureValue))
)
```

## 5. Currentness and rollback boundary

Snapshot authentication is necessary but insufficient. The registry must first
obtain a privately branded authenticated Current Head under
`COIN_CARD_PUBLIC_USERNAME_REGISTRY_CURRENT_HEAD_CONTRACT_V1.md`, then require:

```text
snapshot.registryRevision == head.currentRevision
snapshotArtifactHash      == head.currentSnapshotHash
```

A mismatch is a verification failure even when both artifacts are authentic.
This makes old snapshots historical evidence rather than current routing
authority. The existing in-realm monotonic revision check remains
defense-in-depth. Successful results report `rollbackProtected: true` only after
the Current Head and snapshot conjunction succeeds.

An authentic current username mapping still cannot authorize payment: Public
Resolution must next authenticate and select the current lifecycle identity for
the mapped opaque card ID, and the later execution gate remains the only
execution authority.

## 6. Result branding and failure mapping

The registry owns private predicates for three result classes:

- genuine authenticated username record;
- genuine authenticated exact not-found result; and
- genuine authority-unavailable result.

Copied or fabricated objects do not satisfy any predicate. Public Resolution
maps authority-unavailable results to
`PUBLIC_RESOLUTION_AUTHORITY_UNAVAILABLE`, authenticated absence to
`PUBLIC_RESOLUTION_HANDLE_NOT_FOUND`, and every other untrusted or failed result
to `PUBLIC_RESOLUTION_VERIFICATION_FAILED`.

## 7. Production migration boundary

This implementation uses synthetic opaque IDs and ephemeral test signing keys.
It does not allocate Antoine Dennison's production account or card ID, publish a
production username snapshot, edit the historical signed `antoine` lifecycle
identity, regenerate the protected integrity manifest, or authorize execution.

Production activation follows
`COIN_CARD_PUBLIC_IDENTITY_AND_LEGACY_MIGRATION_V1.md` as an explicit governed
signing and publication operation.
