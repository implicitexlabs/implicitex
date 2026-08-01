# Coin Card Lifecycle Resolution Contract v1

Status: implemented lifecycle-resolution foundation

Canonical source: `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_RESOLUTION_CONTRACT_V1.md`.

Implementation note: the protected runtime module
`card/coin-card-lifecycle-resolution.js` interprets one genuine selected-
evidence result from `card/coin-card-lifecycle-record-selection.js`. It does
not re-authenticate records, select evidence, authorize presentation, or
authorize execution.
