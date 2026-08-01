# Coin Card Lifecycle Resolution Contract v1

Status: implemented lifecycle-resolution foundation

Purpose: define how Coin Card interprets one genuine selected-evidence result
from the protected lifecycle evidence selector, without reopening evidence
authentication, bundle validation, or lifecycle evidence selection.

## Core Rule

The resolver consumes only one proof object:

> a genuine frozen `LIFECYCLE_EVIDENCE_SELECTED` result produced by
> `IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION`

It does not accept raw lifecycle records, raw bundles, raw registry entries, or
arbitrary evidence arrays. It does not re-authenticate records, select
evidence, or authorize presentation, wallet interaction, or execution.

The resolver must preserve the non-operational stop:

```javascript
{
  presentationEligible: false,
  executionEligible: false
}
```

## Accepted Input Authority

The resolver must first require:

- `selectorApi` exists
- `selectorApi.isSelectedLifecycleEvidenceResult` is a function
- `selectorApi.isSelectedLifecycleEvidenceResult(input) === true`

Then it must independently validate the selected-result envelope:

- `fact === SELECTED`
- `outcome === LIFECYCLE_EVIDENCE_SELECTED`
- `selected === true`
- `operationallyResolved === false`
- `presentationEligible === false`
- `executionEligible === false`
- `registryId === 'implicitex-production'`
- `registryVersion` is a safe positive integer
- `cardId` is a nonempty string
- `requestedManifestId` is `null` or a nonempty string
- `selectedRecordCount` is a safe positive integer
- `selectedRecords` is a deeply frozen dense array
- `lineageOrderedRecords` is a deeply frozen dense array
- `registryOrderedRecords` is a deeply frozen dense array
- `predecessorRecords` is a deeply frozen dense array
- `successorRecords` is a deeply frozen dense array
- `lineage` is deeply frozen

The selected evidence must be rejected if any copied, fabricated, partially
mutable, or cross-instance proof envelope merely imitates those fields.

## Public Function

The public API is:

```javascript
resolveLifecycle(selectedEvidence)
```

It does not accept options, clocks, policy objects, comparators, selector
overrides, or verification-time input from callers.

The resolver captures one local instant:

```javascript
var resolutionTime = new Date().toISOString();
```

and uses that exact instant for every temporal comparison in the resolution.

## Top-Level Facts

The resolver exposes exactly:

```text
RESOLVED
NOT_EFFECTIVE
TERMINAL
UNAVAILABLE
```

## Detailed Outcomes

The V1 outcome vocabulary is:

- `LIFECYCLE_ACTIVE`
- `LIFECYCLE_CARD_SUSPENDED`
- `LIFECYCLE_NOT_YET_EFFECTIVE`
- `LIFECYCLE_EXPIRED`
- `LIFECYCLE_TEMPORAL_GAP`
- `LIFECYCLE_CARD_REVOKED`
- `LIFECYCLE_MANIFEST_REVOKED`
- `LIFECYCLE_MANIFEST_SUPERSEDED`
- `LIFECYCLE_RESOLUTION_INPUT_INVALID`
- `LIFECYCLE_RESOLUTION_AUTHORITY_UNAVAILABLE`
- `LIFECYCLE_RESOLUTION_TIME_INVALID`
- `LIFECYCLE_RESOLUTION_AMBIGUOUS`
- `LIFECYCLE_RESOLUTION_STATUS_INVALID`

## Deterministic Precedence

After input authority validation, the resolver must evaluate outcomes in this
order:

```text
1. resolver authority unavailable
2. selected-evidence input invalid
3. resolver time invalid
4. temporal ambiguity
5. not yet effective
6. expired
7. temporal gap
8. card revoked
9. card suspended
10. manifest revoked
11. manifest superseded
12. active
13. unsupported status combination
```

Temporal outcomes always precede status interpretation.

## Temporal Semantics

Intervals are half-open:

```text
[effectiveFrom, effectiveUntil)
```

where `effectiveUntil: null` means no declared upper bound.

For a manifest-specific request:

- time before `effectiveFrom` -> `LIFECYCLE_NOT_YET_EFFECTIVE`
- time at or after non-null `effectiveUntil` -> `LIFECYCLE_EXPIRED`
- time inside the interval -> interpret status

For a card-only request:

- exactly one interval contains the resolver time -> interpret status
- all records begin in the future -> `LIFECYCLE_NOT_YET_EFFECTIVE`
- all records ended in the past -> `LIFECYCLE_EXPIRED`
- resolver time falls into a gap between coherent intervals ->
  `LIFECYCLE_TEMPORAL_GAP`
- more than one interval contains the time -> `LIFECYCLE_RESOLUTION_AMBIGUOUS`

## Status Interpretation

For an effective focal record:

- revoked card status -> `TERMINAL / LIFECYCLE_CARD_REVOKED`
- suspended card status -> `RESOLVED / LIFECYCLE_CARD_SUSPENDED`
- revoked manifest status -> `TERMINAL / LIFECYCLE_MANIFEST_REVOKED`
- superseded manifest status -> `TERMINAL / LIFECYCLE_MANIFEST_SUPERSEDED`
- active card plus current manifest -> `RESOLVED / LIFECYCLE_ACTIVE`
- unsupported or contradictory effective combination ->
  `UNAVAILABLE / LIFECYCLE_RESOLUTION_STATUS_INVALID`

The resolver does not infer that a suspended card is executable.
The resolver does not infer that an active lifecycle result is presentable or
executable.

## Result Boundary

Every result must be deeply frozen and contain:

```text
presentationEligible: false
executionEligible: false
```

Successful interpretation may set:

```text
operationallyResolved: true
```

This means lifecycle interpretation completed. It does not mean presentation or
execution is authorized.

For unavailable input or authority failures:

- `operationallyResolved: false`
- `resolvedRecord: null`

For not-effective and terminal outcomes, lifecycle interpretation may still be
complete:

- `operationallyResolved: true`
- `presentationEligible: false`
- `executionEligible: false`

## Private Result Identity

The resolver must use a private `WeakSet` for genuine successful resolution
outputs from the beginning.

Only results where lifecycle interpretation completed successfully may enter
the private registry, including:

- active
- suspended
- not yet effective
- expired
- temporal gap
- revoked
- superseded

The predicate must return false for shallow copies, deep copies, fabricated
objects, results from another resolver instance, unavailable or invalid
outputs, primitives, and hostile inputs.

## Dependency Boundary

The resolver may depend only on:

- `IX_COIN_CARD_LIFECYCLE_RECORD_SELECTION`

It must not depend on lifecycle record verification, lifecycle bundle
verification, raw lifecycle registry data, manifest verification, presentation,
wallet state, IX execution, or browser UI selectors.
