# Coin Card Public Username Registry Current Head Contract V1

Status: implemented with synthetic signed fixtures and a locally conformant HTTP
source boundary; production endpoint object, production head, and production
identities are not published.

## 1. Authority split

Username-registry authenticity and currentness are separate facts:

```text
snapshot signature  -> ImplicitEx issued this immutable registry snapshot
Current Head        -> this is the snapshot the current source recognizes now
```

Public username routing requires both facts. An authentic historical snapshot
is not current merely because its signature and expiry remain valid.

The browser order is:

```text
fixed HTTPS no-store Current Head source
        -> authenticated Current Head
        -> signed username-registry snapshot
        -> require exact revision equality
        -> require exact snapshot-hash equality
        -> exact username lookup
```

The Current Head contains no usernames, account IDs, card IDs, wallet addresses,
payment routes, lifecycle states, presentation facts, or execution authority.

## 2. Current Head source

The only browser source is
`IX_COIN_CARD_PUBLIC_USERNAME_REGISTRY_HEAD_SOURCE.loadCurrentHead()`. Its fixed
endpoint is:

```text
https://coincard.click/.well-known/coin-card-public-username-registry-head.v1.json
```

The request uses HTTPS `GET`, `cache: no-store`, omitted credentials, rejected
redirects, no referrer, and an `application/json` accept header. Browser inputs,
the requested username, query strings, fragments, storage, messages, and embed
attributes cannot select or replace the endpoint.

Data returned by the source remains untrusted until the Current Head verifier
authenticates it. Source outage, non-200 response, parsing failure, or missing
source authority fails closed.

The exact response, CORS, cache, CSP, CDN, and service-worker obligations are
owned by `COIN_CARD_PUBLIC_REGISTRY_SOURCE_CONTRACT_V1.md`.

## 3. Closed schema

The Current Head contains exactly:

| Field | Requirement |
|---|---|
| `headSchemaVersion` | Exact `coin-card-public-username-registry-head.v1`. |
| `registryId` | Exact `implicitex-public-usernames`. |
| `environment` | Exact `production`. |
| `currentRevision` | Positive safe integer. |
| `currentSnapshotHash` | Lowercase `sha256:` hash of the exact signed snapshot artifact. |
| `issuedAt` | Canonical UTC millisecond timestamp. |
| `expiresAt` | Canonical UTC timestamp after `issuedAt`, at most 15 minutes later. |
| `authorityId` | Exact `implicitex-registry`. |
| `signature` | Exact P-256 signature envelope below. |

The signature envelope contains exactly:

```text
mode                    signed-p256-v1
algorithm               ECDSA_P256_SHA256
signatureEncoding       ieee-p1363
signatureLengthBytes    64
signatureValueEncoding  base64url-unpadded
keyUsage                coin-card-registry-publication
keyId                   <trusted key ID>
authorityId             implicitex-registry
signedAt                 <equal to issuedAt>
value                    <canonical 64-byte P1363 signature>
```

Unknown, additional, accessor, cyclic, non-plain, malformed, noncanonical, or
incorrectly timed data is invalid.

## 4. Signature and artifact hash

The signature payload is the exact head with only `signature.value` omitted:

```text
UTF8("ImplicitEx.CoinCard.PublicUsernameRegistryHead.v1")
|| 0x00
|| UTF8(coinCardCanonicalJson(signaturePayload))
```

The key must resolve through the existing trusted-key authority for exact
environment, authority, signing time, verification time, signature mode, and
`coin-card-registry-publication` usage.

After verification, the exact head artifact hash is:

```text
SHA256(
  UTF8("ImplicitEx.CoinCard.PublicUsernameRegistryHeadArtifact.v1")
  || 0x00
  || UTF8(coinCardCanonicalJson(exactHeadIncludingSignatureValue))
)
```

Copied or fabricated result objects do not satisfy the verifier's private
authenticated-head predicate.

## 5. Snapshot conjunction

After independently authenticating the snapshot, the username registry requires:

```text
snapshot.registryRevision == head.currentRevision
snapshotArtifactHash      == head.currentSnapshotHash
snapshot.registryId       == head.registryId
snapshot.environment      == head.environment
```

The registry and head schemas independently pin the same registry and environment
constants. Revision mismatch or snapshot-hash mismatch is a verification failure,
not a not-found result and not a fallback opportunity.

Every successful username result records an authenticated Current Head and reports
`rollbackProtected: true`. Presentation and execution remain false.

## 6. Publication and rollback rules

Publishing revision `N+1` requires this order at the authority boundary:

1. build and sign immutable snapshot `N+1`;
2. make snapshot `N+1` retrievable by its exact artifact identity;
3. build and sign a head binding revision `N+1` and its exact snapshot hash;
4. atomically replace the sole object returned by the fixed Current Head endpoint;
5. retain older snapshots and heads only as historical evidence, never as the
   object returned by the current endpoint.

The verifier also remembers the highest accepted head revision within its runtime
realm. A lower revision fails as rollback; the same revision bound to another
snapshot hash fails as a conflict. Local storage and IndexedDB are not authority.

The signature proves that ImplicitEx issued a head. Operational currentness also
depends on the fixed HTTPS current source returning its sole current object. An old
head replayed while still within its 15-minute validity cannot be distinguished by
signature alone; `no-store`, atomic endpoint replacement, and short expiry bound
that transport risk. A future challenge-response or independently witnessed head
may strengthen this boundary without changing snapshot identity.

## 7. Failure rules

Public routing fails closed for:

- head source unavailable;
- head schema, namespace, environment, authority, time, key, or signature invalid;
- head expired or issued too far in the future;
- head revision rollback or same-revision hash conflict;
- snapshot unavailable, invalid, expired, or unauthenticated;
- snapshot revision different from `currentRevision`; or
- snapshot artifact hash different from `currentSnapshotHash`.

No failure path searches for a nearby username, falls back to an older snapshot,
or authorizes execution.

## 8. Production boundary

The implementation uses ephemeral test signing keys and synthetic opaque account
and card IDs. It does not publish the endpoint object, allocate production IDs,
modify the historical `antoine` lifecycle identity, update protected HTML, sign an
integrity manifest, deploy, or authorize a payment.
