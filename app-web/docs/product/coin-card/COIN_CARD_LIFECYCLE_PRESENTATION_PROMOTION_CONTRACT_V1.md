# Coin Card Lifecycle Presentation-Promotion Contract v1

This is a pointer file. The canonical contract lives at:

```text
docs/product/coin-card/COIN_CARD_LIFECYCLE_PRESENTATION_PROMOTION_CONTRACT_V1.md
```

See that file for the full authority definition.

## Summary

The presentation-promotion policy (`coin-card-lifecycle-presentation.js`) is
the only authority that may set `presentationEligible: true`. It consumes a
genuine resolved lifecycle result from `IX_COIN_CARD_LIFECYCLE_RESOLUTION`
and returns a frozen promotion result.

Exactly one resolved outcome earns positive promotion:

```text
resolvedFact === 'RESOLVED'  AND  resolvedOutcome === 'LIFECYCLE_ACTIVE'
    → presentationEligible: true
```

All other outcomes produce `presentationEligible: false`. `executionEligible`
is always `false` — this module never opens execution authority.

`PRESENTATION_BLOCKED_UNAVAILABLE` does not exist in V1.

Implementation: `app-web/frontend/public/card/coin-card-lifecycle-presentation.js`
