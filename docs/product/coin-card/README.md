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
- `COIN_CARD_LIFECYCLE_RECORD_SELECTION_CONTRACT_V1.md` — authenticated evidence selection, lineage coherence, and non-operational record-collection facts.
- `COIN_CARD_LIFECYCLE_RESOLUTION_CONTRACT_V1.md` — selected evidence interpretation, temporal resolution, and non-operational lifecycle facts.
- `COIN_CARD_LIFECYCLE_PRESENTATION_PROMOTION_CONTRACT_V1.md` — presentation-promotion policy: exclusive promotion rule, blocked outcome classification, private proof predicate, and scope boundary.
- `COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md` — Coin Card-specific execution authorization: three-input gate, exclusive authorization rule, execution plan, pinned transaction facts, one-shot consumption doctrine, and TOCTOU guard.
- `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md` — canonical relationship among authenticated card authority, frozen user intent, observed execution facts, strict live-policy reconciliation, settlement evidence, and deterministic rejection rules.
- `coin-card.transaction-evidence.fixtures.v1.json` — deterministic Transaction Evidence authority, intent, observation, settlement, and compatibility vectors.
- `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md` — Sealed authenticated signing-time and signed-key-identity successor profile for Transaction Evidence.
- `COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V2.md` — Sealed trusted-key schema adding the exact `coin-card-transaction-evidence` usage and generic signed-context rules.
- `coin-card.transaction-evidence-signature.fixtures.v2.json` — deterministic public signing-time, trusted-key policy, revocation, signature, and repinned-head vectors.
- `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md` — content-addressed evidence-bound EVM interface, deployed-code identity, atomic policy commitment, calldata, revert, and event-decoding contract.
- `coin-card.execution-interface-descriptor.fixtures.v1.json` — deterministic descriptor, policy-commitment, calldata, replay-binding, and event-decoding vectors.
- `COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md` — Phase 1C lifecycle-record identity, executable Registry V2 schema, extraction equality, and legacy migration boundary.
- `coin-card.lifecycle-and-registry-identity.fixtures.v1.json` — deterministic authenticated lifecycle, executable Registry V2, identity mutation, and migration vectors.
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
- Lifecycle evidence selection: `COIN_CARD_LIFECYCLE_RECORD_SELECTION_CONTRACT_V1.md`
- Lifecycle resolution: `COIN_CARD_LIFECYCLE_RESOLUTION_CONTRACT_V1.md`
- Presentation-promotion policy: `COIN_CARD_LIFECYCLE_PRESENTATION_PROMOTION_CONTRACT_V1.md`
- Execution authorization: `COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`
- Transaction evidence binding: `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`
- Execution interface descriptor: `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md`
- Verification state copy: `COIN_CARD_VERIFICATION_STATE_COPY_V1.md`
- Proof tooling: `../../../tools/coin-card-integrity/README.md`

## Sealed Evidence-Authority Unit

These three normative contracts form one sealed authority unit:

1. `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md`
2. `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md`
3. `COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md`

Their supporting conformance evidence is:

| Contract | Deterministic fixture | Focused test |
|---|---|---|
| Transaction Evidence | `coin-card.transaction-evidence.fixtures.v1.json` | `../../../app-web/tests/frontend/coin-card-transaction-evidence-contract.test.js` |
| Execution descriptor | `coin-card.execution-interface-descriptor.fixtures.v1.json` | `../../../app-web/tests/frontend/coin-card-execution-interface-descriptor-contract.test.js` |
| Lifecycle/Registry identity | `coin-card.lifecycle-and-registry-identity.fixtures.v1.json` | `../../../app-web/tests/frontend/coin-card-lifecycle-and-registry-identity-contract.test.js` |

Fixtures and tests substantiate conformance but are not normative authorities. A later status or version change affecting the shared trust boundary must update the contracts and governance metadata atomically.

## Sealed Transaction Evidence Signing-Time Reconciliation

Sealed `transaction-evidence.v1` remains unchanged and continues to support the
standalone v1 content-validation baseline. It cannot establish signature
authentication because it has no signed signing time or signed key ID.

These two sealed contracts form one authority unit:

1. `COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V2.md`
2. `COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V2.md`

Their shared conformance evidence is
`coin-card.transaction-evidence-signature.fixtures.v2.json` and
`../../../app-web/tests/frontend/coin-card-transaction-evidence-signature-contract.test.js`.
The v2 fixture republishes the public current-head test vector because the head
selects the new v2 authority hash. No production key, runtime resolver, content
verifier, current source, or execution path implements this sealed unit.

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
