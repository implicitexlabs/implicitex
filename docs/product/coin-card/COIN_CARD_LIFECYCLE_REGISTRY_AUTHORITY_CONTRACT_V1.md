# Coin Card Lifecycle Registry Authority Contract v1

Status: contract proposal

Purpose: define who may administer and publish Coin Card lifecycle registry
records, and how those records are authenticated before any lifecycle resolver
trusts them.

## Authority Layers

Lifecycle governance must keep these authorities separate:

```text
Manifest signing authority
Lifecycle administration authority
Registry publication authority
```

- Manifest signing authority may sign a payment-instruction envelope.
- Lifecycle administration authority may request suspension, revocation, or
  supersession.
- Registry publication authority may accept, order, sign, and publish lifecycle
  registry records.

A valid manifest-signing key is not automatically a valid lifecycle
administration key or registry publication key.

## Trusted-Key Usage Values

Lifecycle authority should reuse the trusted-key record and resolver machinery
instead of introducing a second unrelated trust-root implementation.

V1 key records may use these usage values:

```text
coin-card-manifest-signing
coin-card-lifecycle-administration
coin-card-registry-publication
```

The resolver must evaluate issuer or authority identity, environment, usage,
activation, expiration, revocation, and replacement policy before exposing a
public key for any of these uses.

## Lifecycle Administration Authority

A lifecycle administration authority may request:

```text
CARD_SUSPENDED
CARD_REVOKED
MANIFEST_REVOKED
MANIFEST_SUPERSEDED
```

Administration requests are policy input. They are not registry publication
evidence by themselves.

## Registry Publication Authority

The registry publication authority decides whether a lifecycle administration
request is accepted into the registry and then publishes an authenticated record.

Publication authority must assign:

```text
registryId
environment
registryVersion
recordId
publishedAt
```

`registryVersion` is monotonic within `registryId` and `environment`.

## Lifecycle Record Signature

An authenticated lifecycle registry record must be signed by a trusted key with
usage `coin-card-registry-publication`.

The signature object shape, canonical payload, duplicated-field rules, and
publication key bindings are defined in
`COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`.

The signed registry record payload must cover:

```text
registrySchemaVersion
registryId
environment
registryVersion
recordId
publishedAt
cardId
manifestId
revision
previousManifestId
cardStatus
manifestStatus
effectiveFrom
effectiveUntil
supersededByManifestId
reasonCode
authorityId
administrationEvidenceHash
```

The signature must not cover runtime verification output, transport metadata, or
cached resolver decisions.

## Administration Evidence

When a registry record is based on a lifecycle administration request, the
registry record should include `administrationEvidenceHash` rather than embedding
large or private administration artifacts directly.

The administration evidence hash algorithm, encoding, canonicalization, domain
separator, and nullability rules are defined in
`COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`.

The publication authority remains responsible for accepting only administration
evidence authorized for the same `cardId`, `manifestId`, `environment`, and
lifecycle action.

## Empty Source Rule

Until authenticated registry records exist, the lifecycle registry must be
treated as empty. An empty lifecycle registry must not mark any card or manifest
as operational.
