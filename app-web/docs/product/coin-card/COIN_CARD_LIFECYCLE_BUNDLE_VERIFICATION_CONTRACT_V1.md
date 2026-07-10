# Coin Card Lifecycle Bundle Verification Contract v1

Status: canonical pointer

Canonical source: `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md`.

Implementation note: non-empty bundle verification is implemented in the
protected runtime module `card/coin-card-lifecycle-bundle-verification.js` and
covered by synthetic authentication tests. The verifier authenticates an atomic
collection of individually authenticated lifecycle records. It does not
resolve card lifecycle state, promote presentation, or authorize execution.
