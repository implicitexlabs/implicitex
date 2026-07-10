# Coin Card Lifecycle Record Authentication and Canonicalization Contract v1

Status: canonical pointer

Canonical source: `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`.

Implementation note: individual lifecycle-record authentication is implemented
in the protected runtime module
`card/coin-card-lifecycle-record-verification.js` and covered by synthetic
authentication tests. The runtime also enforces immutable pre-verification
snapshots, the record schema discriminator, signature domain separation,
canonical base64url signature and evidence-hash checks, and strict publication
time ordering. Caller-supplied verification time is a separate verification
context input; invalid values fail as verification-context errors, not signed
record contradictions. Populated lifecycle registry entries, registry record
selection, lifecycle state resolution from authenticated entries, presentation
promotion, and execution eligibility are not implemented here.
