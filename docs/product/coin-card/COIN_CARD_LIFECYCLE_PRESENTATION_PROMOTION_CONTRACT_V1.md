# Coin Card Lifecycle Presentation-Promotion Contract v1

Status: sealed presentation-promotion authority

Purpose: define how the presentation-promotion policy consumes one genuine
resolved lifecycle result and decides whether the Coin Card transfer surface
may be activated for a sender.

## Core Rule

The presentation-promotion policy consumes only one proof object:

> a genuine frozen resolved lifecycle result produced by
> `IX_COIN_CARD_LIFECYCLE_RESOLUTION`

It does not authenticate records, validate bundles, select evidence, or
interpret lifecycle status. It does not authorize execution, wallet access,
or fund movement.

The policy must preserve the non-operational stop at all times:

```javascript
{
  executionEligible: false
}
```

## Accepted Input Authority

The policy must first require:

- `resolutionApi` (`window.IX_COIN_CARD_LIFECYCLE_RESOLUTION`) exists
- `resolutionApi.isResolvedLifecycleResult` is a function
- `resolutionApi.isResolvedLifecycleResult(input) === true`

If the authority is absent, or if the predicate is missing or throws, the
policy returns `PRESENTATION_AUTHORITY_UNAVAILABLE` before inspecting the
input. If the predicate returns any value other than `true`, the policy
returns `PRESENTATION_INPUT_INVALID`.

The resolver's private WeakSet does not brand `UNAVAILABLE` results.
Therefore no genuine resolver output can satisfy both
`isResolvedLifecycleResult(result) === true` and `result.fact === 'UNAVAILABLE'`
at the same time. There is no `PRESENTATION_BLOCKED_UNAVAILABLE` outcome in
V1. Any input not recognized by `isResolvedLifecycleResult()` — including
genuine resolver UNAVAILABLE outputs — produces `PRESENTATION_INPUT_INVALID`.

## Public Function

```javascript
IX_COIN_CARD_LIFECYCLE_PRESENTATION.promotePresentation(resolvedResult)
```

Accepts a genuine resolved lifecycle result. Returns a frozen
presentation-promotion result. Never throws.

## Exclusive Promotion Rule

Exactly one resolved outcome earns `presentationEligible: true`:

```text
resolvedFact === 'RESOLVED'  AND  resolvedOutcome === 'LIFECYCLE_ACTIVE'
    → PRESENTATION_PROMOTED
    → presentationEligible: true
    → result branded in private WeakSet
```

All other genuine resolved results produce `presentationEligible: false`.

## Blocked Outcome Classification

| resolvedFact       | resolvedOutcome              | outcome                         |
|--------------------|------------------------------|---------------------------------|
| `RESOLVED`         | `LIFECYCLE_CARD_SUSPENDED`   | `PRESENTATION_BLOCKED_SUSPENDED` |
| `TERMINAL`         | any                          | `PRESENTATION_BLOCKED_TERMINAL` |
| `NOT_EFFECTIVE`    | any                          | `PRESENTATION_BLOCKED_NOT_EFFECTIVE` |
| unrecognized       | any                          | `PRESENTATION_INPUT_INVALID`    |

`TERMINAL` covers: `LIFECYCLE_CARD_REVOKED`, `LIFECYCLE_MANIFEST_REVOKED`,
`LIFECYCLE_MANIFEST_SUPERSEDED`, `LIFECYCLE_EXPIRED`.

`NOT_EFFECTIVE` covers: `LIFECYCLE_NOT_YET_EFFECTIVE`, `LIFECYCLE_TEMPORAL_GAP`.

## Failure Paths

| condition                                       | outcome                              |
|-------------------------------------------------|--------------------------------------|
| resolution authority absent                     | `PRESENTATION_AUTHORITY_UNAVAILABLE` |
| `isResolvedLifecycleResult` missing or throws   | `PRESENTATION_AUTHORITY_UNAVAILABLE` |
| input not recognized as genuine resolved result | `PRESENTATION_INPUT_INVALID`         |
| input recognized; fact unclassified             | `PRESENTATION_INPUT_INVALID`         |

## Result Shape

All results are deeply frozen objects with the following fields:

```javascript
{
  fact: 'PRESENTATION_ELIGIBLE' | 'PRESENTATION_BLOCKED',
  outcome: <one of OUTCOMES>,
  presentationEligible: boolean,
  executionEligible: false,   // always false — this module never opens execution
  resolvedFact: string | null,
  resolvedOutcome: string | null,
}
```

`resolvedFact` and `resolvedOutcome` carry the input resolver fact and
outcome when the input passed `isResolvedLifecycleResult()`. They are `null`
for `PRESENTATION_AUTHORITY_UNAVAILABLE` and `PRESENTATION_INPUT_INVALID`
results that failed before inspection.

## Private Proof Predicate

```javascript
IX_COIN_CARD_LIFECYCLE_PRESENTATION.isPromotedPresentationResult(value)
```

Returns `true` only for results that carry `presentationEligible: true` and
were produced by this authority instance. Returns `false` for:

- any blocked result (even one produced by this authority)
- any result produced by a different VM context instance
- any fabricated or shape-alike object
- `null`, `undefined`, or any non-object

Only positively promoted results enter the private WeakSet. Blocked results
are diagnostic outputs, not authority proofs.

## Scope Boundary

This module:

- is the **only authority** that may set `presentationEligible: true`
- does **not** set `executionEligible: true` — that is a separate gate
- does **not** require `presentationEligible: true` for generic status-shell
  rendering (suspended notice, error state) — the application layer controls
  non-transfer rendering independently

## V1 Outcomes Vocabulary

```text
PRESENTATION_PROMOTED
PRESENTATION_BLOCKED_SUSPENDED
PRESENTATION_BLOCKED_TERMINAL
PRESENTATION_BLOCKED_NOT_EFFECTIVE
PRESENTATION_AUTHORITY_UNAVAILABLE
PRESENTATION_INPUT_INVALID
```

`PRESENTATION_BLOCKED_UNAVAILABLE` does not exist in V1.

## Authority Chain Position

```text
authenticated records
        ↓  (coin-card-lifecycle-record-verification.js)
authenticated bundle
        ↓  (coin-card-lifecycle-bundle-verification.js)
selected coherent evidence
        ↓  (coin-card-lifecycle-record-selection.js)
resolved lifecycle fact
        ↓  (coin-card-lifecycle-resolution.js)
presentation-promotion policy          ← this module
        ↓
LIFECYCLE_ACTIVE only
        ↓
genuine promoted-presentation proof
        ↓
executionEligible: false
```

## Implementation

`app-web/frontend/public/card/coin-card-lifecycle-presentation.js`

Exposes `window.IX_COIN_CARD_LIFECYCLE_PRESENTATION`. Loaded after
`coin-card-lifecycle-resolution.js` and before `coin-card-verification.js`
in the protected runtime load order.
