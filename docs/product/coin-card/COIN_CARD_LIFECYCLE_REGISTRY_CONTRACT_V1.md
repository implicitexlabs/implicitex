# Coin Card Lifecycle Registry Contract v1

Status: contract proposal

Purpose: define how Coin Card card and manifest lifecycle state is governed
after a signed manifest envelope has been authenticated.

## Authority Order

Coin Card verification must preserve this order:

```text
Was the issuer key authorized?
Was the manifest authentically signed?
Is this specific card manifest currently operational?
Can its verified facts enter presentation?
Can those facts be projected toward execution?
```

The lifecycle registry answers the third question only.

## Separate Authorities

V1 must keep these authorities conceptually separate:

- Manifest signing key: signs a manifest envelope claim.
- Lifecycle administration key: authorizes suspension, revocation, and
  supersession decisions.
- Registry publication authority: accepts lifecycle records, assigns registry
  ordering, and publishes registry evidence.

A compromised manifest-signing key must not automatically control card
revocation, supersession, or registry history.

## Publication Evidence

Lifecycle records must distinguish:

```text
signedAt
publishedAt
verificationTime
```

- `signedAt`: issuer assertion from the signed manifest envelope.
- `publishedAt`: registry assertion that a lifecycle record was accepted and
  published.
- `verificationTime`: verifier-local time when the card is checked.

`publishedAt` is registry evidence, not issuer-provided manifest metadata.

## Registry Record Fields

A lifecycle registry record should define:

```text
registrySchemaVersion
registryVersion
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
```

`registryVersion` must be monotonic within the registry publication authority.
Lifecycle runtime work must not begin until the publication authority and record
authentication mechanism are explicitly selected.

## Card Lifecycle Outcomes

Card lifecycle resolution must return one deterministic internal outcome:

```text
CARD_ACTIVE
CARD_SUSPENDED
CARD_REVOKED
CARD_UNKNOWN
CARD_RECORD_INVALID
```

Card status applies to the enduring `cardId`, not only one manifest revision.

## Manifest Lifecycle Outcomes

Manifest lifecycle resolution must return one deterministic internal outcome:

```text
MANIFEST_CURRENT
MANIFEST_SUPERSEDED
MANIFEST_EXPIRED
MANIFEST_REVOKED
MANIFEST_UNKNOWN
MANIFEST_RECORD_INVALID
```

Manifest status applies to a specific `manifestId` and revision.

Only `CARD_ACTIVE` plus `MANIFEST_CURRENT` may allow verified facts to advance
to presentation projection.

## Supersession and Rollback Rules

The registry must prevent ambiguous manifest forks:

- A successor manifest must have `revision` exactly one greater than the
  registry-current manifest for the same `cardId`.
- `previousManifestId` must match the registry-current predecessor at acceptance
  time.
- Duplicate revisions are invalid.
- Rollback to an earlier revision is forbidden.
- Contradictory registry records must resolve as invalid rather than selecting
  a convenient winner.

The registry may publish a supersession only through lifecycle administration
authority and registry publication authority.

## Effective Time Semantics

- `effectiveFrom` is inclusive.
- `effectiveUntil` is inclusive when present.
- Revocation takes effect at the exact revocation timestamp.
- Suspension takes effect at the exact suspension timestamp.
- Registry publication time is independent of issuer `signedAt`.

## Empty Protected Registry

The first implementation should use a frozen empty protected registry. An empty
registry must not treat any card as active. It should produce deterministic
unknown outcomes until governed lifecycle records exist.

This preserves the secure-empty-first pattern used by trusted keys:

```text
Empty protected source
Canonical record contract
Deterministic resolver
Failure-state tests
First governed production record
```

## Boundary

The lifecycle registry governs whether an authenticated payment instruction is
operational for presentation. It does not make the instruction executable.

IX execution remains separate and must independently enforce wallet, network,
amount, recipient, balance, approval, fee, and transaction-state requirements.
