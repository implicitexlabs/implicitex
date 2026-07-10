# Coin Card Lifecycle Bundle Verification Contract v1

Status: implemented authentication foundation

Canonical source: `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md`.

Implementation note: non-empty bundle verification is implemented in the
protected runtime module `card/coin-card-lifecycle-bundle-verification.js` and
covered by synthetic authentication tests. The verifier authenticates an atomic
collection of individually authenticated lifecycle records. It does not
resolve card lifecycle state, promote presentation, or authorize execution.
The V1 result makes the absence of bundle signing explicit with
`bundleSignature: 'not-applicable-v1'`.
The public API does not accept caller-supplied verifier objects or
verification times. Tests inject controlled globals through the VM harness
before the bundle verifier loads.
