# Coin Card App-Web Notes

This directory is implementation-local and historical unless a file explicitly says it is generated from the canonical Coin Card contract root.

Canonical Coin Card contracts now live in:

```text
docs/product/coin-card/
```

Architecture validation and token tooling should consume the canonical root directly. Checkpoint notes in this directory remain useful historical evidence, but they must not redefine artifact, structure, state, geometry, or token authority.

## Document Map

Canonical docs:

- `../../../../docs/product/coin-card/COIN_CARD_CRYPTOGRAPHIC_INTEGRITY_ARCHITECTURE.md` — conceptual integrity architecture for making issued Coin Cards authentic or invalid.
- `../../../../docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md` — manifest fields, protected asset entries, canonical hashing, and proof-tooling format.
- `../../../../docs/product/coin-card/COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md` — runtime manifest placement, verification states, and the rule that only `VERIFIED` cards may call `IX_EXECUTION.executeTransfer(...)`.
- `../../../../docs/product/coin-card/COIN_CARD_SIGNATURE_POLICY_V1.md` — signature policy for when asset-hash consistency can become trusted execution.
- `../../../../docs/product/coin-card/COIN_CARD_SIGNATURE_VERIFIER_DESIGN_V1.md` — verifier algorithm, canonical payload, key ID, and failure mapping.
- `../../../../docs/product/coin-card/COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md` — trusted public key source, immutability, and key rotation boundary.
- `../../../../docs/product/coin-card/COIN_CARD_TRUSTED_PUBLIC_KEY_POPULATION_CONTRACT_V1.md` — how approved public keys enter the protected trust source.
- `../../../../docs/product/coin-card/COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md` — trusted key record shape and deterministic key resolution outcomes.
- `../../../../docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md` — canonical signed manifest envelope, payment facts, amount policy, payload binding, and revision chaining.
- `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_AUTHORITY_CONTRACT_V1.md` — lifecycle administration authority, registry publication authority, and lifecycle record authentication.
- `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md` — canonical JSON, lifecycle record signatures, operational outcome composition, registry bundle rollback limits, and administration evidence hashes.
- `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md` — non-empty bundle wrapper validation, atomic record-collection authentication, and bundle-level coherence rules.
- `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_RECORD_SELECTION_CONTRACT_V1.md` — authenticated evidence selection, lineage coherence, and non-operational record-collection facts.
- `../../../../docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md` — lifecycle registry authority, publication evidence, card status, manifest status, supersession, and rollback rules.
- `../../../../docs/product/coin-card/COIN_CARD_VERIFICATION_STATE_COPY_V1.md` — user-facing copy contract for manifest verification states.
- `../../../../tools/coin-card-integrity/README.md` — proof tooling usage for generating, verifying, and tamper-checking Coin Card manifests.

Implementation-local checkpoint:

- `CURRENT_STATE_2026-07-06.md` — implementation checkpoint for the Coin Card build state on July 6, 2026.

Mirrored files in this directory:

- `COIN_CARD_CRYPTOGRAPHIC_INTEGRITY_ARCHITECTURE.md`
- `COIN_CARD_MANIFEST_SCHEMA_V1.md`
- `COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md`
- `COIN_CARD_VERIFICATION_STATE_COPY_V1.md`

Those mirrored files are convenience copies for app-web readers. The canonical versions live under `docs/product/coin-card/`.

## Manifest Integrity Stack

The manifest integrity docs are intentionally split by responsibility:

- Architecture: `docs/product/coin-card/COIN_CARD_CRYPTOGRAPHIC_INTEGRITY_ARCHITECTURE.md`
- Manifest data shape: `docs/product/coin-card/COIN_CARD_MANIFEST_SCHEMA_V1.md`
- Runtime execution policy: `docs/product/coin-card/COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md`
- Signature policy: `docs/product/coin-card/COIN_CARD_SIGNATURE_POLICY_V1.md`
- Signature verifier design: `docs/product/coin-card/COIN_CARD_SIGNATURE_VERIFIER_DESIGN_V1.md`
- Trusted key source: `docs/product/coin-card/COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`
- Trusted key population: `docs/product/coin-card/COIN_CARD_TRUSTED_PUBLIC_KEY_POPULATION_CONTRACT_V1.md`
- Trusted key record resolution: `docs/product/coin-card/COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md`
- Signed manifest envelope: `docs/product/coin-card/COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`
- Lifecycle registry authority: `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_AUTHORITY_CONTRACT_V1.md`
- Lifecycle record authentication and canonicalization: `docs/product/coin-card/COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`
- Lifecycle registry: `docs/product/coin-card/COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`
- Lifecycle evidence selection: `docs/product/coin-card/COIN_CARD_LIFECYCLE_RECORD_SELECTION_CONTRACT_V1.md`
- Verification state copy: `docs/product/coin-card/COIN_CARD_VERIFICATION_STATE_COPY_V1.md`
- Proof tooling: `tools/coin-card-integrity/README.md`

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
