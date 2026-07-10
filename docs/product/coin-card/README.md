# Coin Card Contract Root

This is the canonical Coin Card contract directory.

It owns the current product contract stack:

- invariant prose
- state matrix
- geometry tokens
- artifact graph
- structure contract
- state contract
- deterministic fixture definitions

Implementation-local checkpoint notes may exist under `app-web/docs/product/coin-card/`, but they do not redefine this contract root. Validators and build tooling should consume this directory directly.

## Document Map

- `coin-card-spec-v1.md` — product-level Coin Card specification.
- `COIN_CARD_INVARIANT_CONTRACT.md` — non-negotiable product and architecture invariants.
- `COIN_CARD_STATE_MATRIX.md` — allowed state transitions and user-visible state behavior.
- `coin-card.state.v1.json` — machine-readable state contract.
- `coin-card.artifact.json` — artifact graph for generated and validated Coin Card outputs.
- `coin-card.tokens.json` — canonical design token values.
- `coin-card.tokens.schema.json` — schema for Coin Card token data.
- `coin-card.fixtures.v1.json` — deterministic fixtures for validation and review.
- `COIN_CARD_CRYPTOGRAPHIC_INTEGRITY_ARCHITECTURE.md` — conceptual integrity architecture for making issued Coin Cards authentic or invalid.
- `COIN_CARD_MANIFEST_SCHEMA_V1.md` — manifest fields, protected asset entries, canonical hashing, and proof-tooling format.
- `COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md` — runtime manifest placement, verification states, and the rule that only `VERIFIED` cards may call `IX_EXECUTION.executeTransfer(...)`.
- `COIN_CARD_SIGNATURE_POLICY_V1.md` — signature policy for when asset-hash consistency can become trusted execution.
- `COIN_CARD_SIGNATURE_VERIFIER_DESIGN_V1.md` — verifier algorithm, canonical payload, key ID, and failure mapping.
- `COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md` — trusted public key source, immutability, and key rotation boundary.
- `COIN_CARD_TRUSTED_PUBLIC_KEY_POPULATION_CONTRACT_V1.md` — how approved public keys enter the protected trust source.
- `COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md` — trusted key record shape and deterministic key resolution outcomes.
- `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md` — canonical signed manifest envelope, payment facts, amount policy, payload binding, and revision chaining.
- `COIN_CARD_LIFECYCLE_REGISTRY_AUTHORITY_CONTRACT_V1.md` — lifecycle administration authority, registry publication authority, and lifecycle record authentication.
- `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md` — canonical JSON, lifecycle record signatures, operational outcome composition, registry bundle rollback limits, and administration evidence hashes.
- `COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md` — non-empty bundle wrapper validation, atomic record-collection authentication, and bundle-level coherence rules.
- `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md` — lifecycle registry authority, publication evidence, card status, manifest status, supersession, and rollback rules.
- `COIN_CARD_VERIFICATION_STATE_COPY_V1.md` — user-facing copy contract for manifest verification states.
- `../../../tools/coin-card-integrity/README.md` — proof tooling usage for generating, verifying, and tamper-checking Coin Card manifests.

Implementation-local checkpoint:

- `../../../app-web/docs/product/coin-card/CURRENT_STATE_2026-07-06.md` — implementation checkpoint for the Coin Card build state on July 6, 2026.

## Manifest Integrity Stack

The manifest integrity docs are intentionally split by responsibility:

- Architecture: `COIN_CARD_CRYPTOGRAPHIC_INTEGRITY_ARCHITECTURE.md`
- Manifest data shape: `COIN_CARD_MANIFEST_SCHEMA_V1.md`
- Runtime execution policy: `COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md`
- Signature policy: `COIN_CARD_SIGNATURE_POLICY_V1.md`
- Signature verifier design: `COIN_CARD_SIGNATURE_VERIFIER_DESIGN_V1.md`
- Trusted key source: `COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`
- Trusted key population: `COIN_CARD_TRUSTED_PUBLIC_KEY_POPULATION_CONTRACT_V1.md`
- Trusted key record resolution: `COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md`
- Signed manifest envelope: `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`
- Lifecycle registry authority: `COIN_CARD_LIFECYCLE_REGISTRY_AUTHORITY_CONTRACT_V1.md`
- Lifecycle record authentication and canonicalization: `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`
- Lifecycle registry: `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`
- Verification state copy: `COIN_CARD_VERIFICATION_STATE_COPY_V1.md`
- Proof tooling: `../../../tools/coin-card-integrity/README.md`

The boundary is:

```text
Python integrity tooling proves package integrity.
Coin Card runtime gates execution on verification state.
IX_EXECUTION performs wallet and transaction execution.
```

Terminology:

```text
Integrity Manifest: coin-card-manifest.json package integrity evidence.
Registry Record: /registry/coincards/<id>.json runtime card configuration.
```
