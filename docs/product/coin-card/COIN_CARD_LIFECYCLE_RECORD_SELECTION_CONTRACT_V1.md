# Coin Card Lifecycle Record Selection Contract v1

Status: implemented evidence-analysis foundation

Purpose: define how Coin Card selects coherent authenticated lifecycle
evidence from a protected bundle-verification result without resolving
operational lifecycle state.

## Core Rule

The selector consumes only one proof object:

> a successful, frozen lifecycle bundle-verification result

It does not accept raw registry bundles, raw registry entries, or arbitrary
record arrays. It does not re-authenticate records, choose card status, or
decide whether a card is currently operational.

The selector must preserve the non-operational stop:

```javascript
{
  operationallyResolved: false,
  presentationEligible: false,
  executionEligible: false
}
```

## Accepted Bundle Proof

The selector must accept only a result that satisfies all of the following:

- `outcome === LIFECYCLE_BUNDLE_RECORDS_AUTHENTICATED`
- `authenticated === true`
- `sourceValidated === true`
- `recordsAuthenticated === true`
- `bundleSignature === 'not-applicable-v1'`
- `bundleIntegrityAuthenticated === false`
- `rollbackProtected === false`
- the result envelope is frozen
- `bundle` is deeply frozen plain data
- `entries` is a deeply frozen dense array
- every entry result is frozen
- every entry result reports successful record authentication
- every authenticated record is frozen
- `entryCount` matches the number of entry results
- the bundle identity and version facts agree with the result envelope

The accepted proof is the only normal public input to selection. The selector
must fail closed on copied, reconstructed, partially mutable, raw, or
fabricated approximations.

## Selection Request

The request is an exact plain-data object with:

```text
cardId
manifestId
```

`cardId` is required and must be a nonempty string.

`manifestId` is optional and must be either a nonempty string or `null`.

Reject extra properties, hidden properties, accessors, symbols, arrays, custom
prototypes, functions, and empty identifiers.

## Top-Level Facts

The selector exposes exactly:

```text
SELECTED
NOT_FOUND
CONFLICT
```

The detailed outcomes are:

- `LIFECYCLE_EVIDENCE_SELECTED`
- `LIFECYCLE_EVIDENCE_CARD_NOT_FOUND`
- `LIFECYCLE_EVIDENCE_MANIFEST_NOT_FOUND`
- `LIFECYCLE_EVIDENCE_INPUT_INVALID`
- `LIFECYCLE_EVIDENCE_DUPLICATE_POSITION`
- `LIFECYCLE_EVIDENCE_LINEAGE_INVALID`
- `LIFECYCLE_EVIDENCE_INTERVAL_CONFLICT`
- `LIFECYCLE_EVIDENCE_STATUS_CONFLICT`
- `LIFECYCLE_EVIDENCE_AMBIGUOUS`

Conflict and failure results must include a stable `reason` value so tests and
telemetry can prove the exact branch taken.

## Precedence

Selection must evaluate in this order:

```text
1. input invalid
2. card not found
3. requested manifest not found
4. duplicate evidence position
5. lineage invalid
6. interval conflict
7. status conflict
8. residual ambiguity
9. selected
```

Iteration order must not change the result.

## Canonical Identities

Use the lifecycle registry canonicalizer and canonical JSON tuples. Do not
construct internal identity keys with delimiters.

Required identities:

```text
record position: [cardId, manifestId, revision]
manifest identity: [cardId, manifestId]
registry position: [registryId, registryVersion]
```

## Selection Semantics

For a request with only `cardId`:

- select all authenticated records for that card;
- preserve registry-version ordering;
- construct the complete coherent manifest lineage;
- identify evidence positions and relationships;
- do not decide operational currentness.

For a request with `cardId` plus `manifestId`:

- identify the directly requested manifest evidence;
- retain predecessor and successor records needed to interpret its lineage;
- expose the directly requested record separately from supporting evidence;
- do not return an isolated record when lineage is required for interpretation.

The selector consumes authenticated records from the bundle proof’s authenticated
entry results, not directly from `bundle.entries`.

## Lineage Validation

At minimum, the selector must validate:

- revision 1 has no `previousManifestId`;
- later revisions identify a predecessor;
- predecessor references resolve coherently;
- `supersededByManifestId` references resolve coherently;
- no circular predecessor chain;
- no circular supersession chain;
- no duplicate `[cardId, manifestId, revision]` position;
- no impossible revision ordering;
- no disconnected lineage falsely presented as one chain;
- no record belongs to a different registry or environment than the accepted
  bundle proof.

The selector should not require contiguous registry versions unless the
publication contract explicitly requires them.

## Interval and Status Analysis

Intervals are half-open:

```text
[effectiveFrom, effectiveUntil)
```

The selector may report interval facts, observed card statuses, and observed
manifest statuses, but it must not decide which status is operationally current.

The selector must still detect:

- overlapping or contradictory intervals;
- contradictory authenticated status claims for the same evidence position or
  inseparable interval.

## Result Envelopes

Every success and failure result must be deeply frozen.

Every result must contain:

```text
operationallyResolved: false
presentationEligible: false
executionEligible: false
```

A selected result may include:

```javascript
{
  fact: 'SELECTED',
  outcome: 'LIFECYCLE_EVIDENCE_SELECTED',
  selected: true,
  operationallyResolved: false,
  presentationEligible: false,
  executionEligible: false,
  registryId,
  registryVersion,
  cardId,
  requestedManifestId,
  selectedRecordCount,
  requestedRecord,
  selectedRecords,
  predecessorRecords,
  successorRecords,
  lineage
}
```

A not-found result must expose no selected records.

A conflict result may expose narrow conflict diagnostics, but it must not
expose a partially accepted evidence set as selected.

## Boundary

The selector may depend only on:

- `IX_COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION`
- `IX_COIN_CARD_LIFECYCLE_REGISTRY`

It must not depend on or reference:

- `IX_COIN_CARD_VERIFICATION`
- manifest verification
- presentation projection
- wallet state
- `IX_EXECUTION`
- `resolveLifecycle`
- transaction state
- browser UI selectors
