# Coin Card Architecture Index

**Purpose:** Entry point for the Coin Card document set. Answers which document
owns each class of decision, what the dependency graph is, and which documents
are normative vs. informative.

**Not design.** This document contains no original decisions. When this document
and any document it references conflict, the referenced document governs.

---

## Conflict resolution rule

When two documents disagree:

1. The higher layer governs.
2. Within the same layer, the more specific document governs.
3. If ambiguity remains, `COIN_CARD_COMMERCIAL_SPEC_V1.md` is the final authority
   for commercial questions; `COIN_CARD_TRUST_MODEL.md` is the final authority for
   trust and verification questions.

---

## Decision hierarchy

Every decision in the system has a home layer. Higher layers govern lower layers.
If a lower-layer document appears to conflict with a higher-layer document, update
the lower-layer document — not the higher one.

```
Mission
  └──► Business Decisions
         └──► Commercial Specification   ← Layer 1 (commercial root)
                │
                ├──► Legal Documents     ← Layer 2
                │
                └──► Architecture        ← Layer 3
                       │
                       └──► Engineering Rules   ← Layer 4
                              │
                              └──► Implementation
                                     │
                                     └──► Tests

COIN_CARD_TRUST_MODEL.md               ← Layer 5 (trust root, parallel to Layer 1)
  └──► Signing + Lifecycle Contracts
         └──► Registry Publisher        ← convergence point
                │
                ├── commercial stack: WHEN to publish
                └── trust stack: WHAT FORMAT to publish

Evidence / Spikes                      ← Layer 6
  └──► prove claims made in Layers 3–5; do not define new design

Informative / Historical               ← Layer 7
  └──► do not implement from this layer
```

**The key principle:** each layer derives authority from the layer above it.
A lower layer cannot override a higher layer by containing more detail or more
recent edits. More detail at a lower layer must be consistent with the layer above.

---

## Authority layers

```
Layer 1 — Commercial (governs everything)
    COIN_CARD_COMMERCIAL_SPEC_V1.md

Layer 2 — Legal (derives from Layer 1; governs customer commitments)
    Legal documents (Refund Policy, Purchase Terms, ToS updates, Privacy updates)

Layer 3 — Architecture (derives from Layer 1)
    ├── COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md  (purchase/provisioning)
    └── COIN_CARD_BACKEND_ARCHITECTURE_V1.md               (runtime topology)

Layer 4 — Engineering Rules (derives from Layer 3)
    COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md

Layer 5 — Trust and Cryptographic Contracts (parallel to Layer 1; governs verification)
    COIN_CARD_TRUST_MODEL.md  (root; V1 frozen 2026-07-04)
        └── Contract documents (signing, lifecycle, execution authorization)

Layer 6 — Evidence (proves specific claims made in Layer 3+)
    KMS compatibility spike

Layer 7 — Informative (historical; do not amend other layers based on these)
    Checkpoint notes, superseded proposals, publisher MVP
```

The commercial stack (Layers 1–4) and the trust stack (Layer 5) are parallel roots
that converge at the Registry Publisher: the commercial stack defines *when* to publish
a registry record; the trust stack defines *what format* that record must take and *how*
verifiers authenticate it.

---

## Layer 1 — Commercial

### `COIN_CARD_COMMERCIAL_SPEC_V1.md`

**Status:** LOCKED 2026-07-21 (amended same day)
**Authority:** Governs all commercial decisions. All other documents derive from this
or must not contradict it.

Owns:
- Product definition, price, ownership, guarantee
- Purchase Provisioning State Machine (9 states, event table, per-state rules)
- 16-row Event Table — every permitted state transition
- 19 Commercial Invariants (identity, lifecycle, payment, idempotency, registry, legal)
- 5 Failure Guarantees
- 10-row Authority Matrix + conflict resolution rule
- Registry lifecycle: AVAILABLE → ACTIVE → REFUNDED → HELD → AVAILABLE
- `HANDLE_RECOVERY_PERIOD = 90 days`
- Deployment gate: no paid checkout until attorney review and full consistency
- Single customer contact: `support@implicitex.com`
- Documents derived from this spec (normative list)

Update this document first when the commercial model changes. Then propagate to
legal documents and architecture documents in that order.

---

## Layer 2 — Legal

All four documents derive from `COIN_CARD_COMMERCIAL_SPEC_V1.md`. No legal document
may commit to a customer-facing promise that is not grounded in the spec. If the spec
changes a commercial term, the affected legal document must be updated before the change
is published to customers.

| Document | Status | Customer-facing | Remaining |
|---|---|---|---|
| `legal/REFUND_POLICY.md` | DRAFTED — locked | Yes | Attorney review before deploy |
| `legal/PURCHASE_TERMS.md` | DRAFTED — locked | Yes | Attorney review; live page URL links to add |
| `legal/TERMS_OF_SERVICE_UPDATES.md` | DRAFTED — not yet applied | Changes for `terms.html` | Apply to terms.html; migrate `connect@` → `support@` |
| `PRIVACY_POLICY_UPDATES.md` | APPLIED to `privacy.html` | Yes | Update `[DATE]` on publish; attorney review |

**Email migration action required before publish:** Existing `terms.html` and `privacy.html`
footer use `connect@implicitex.com`. Commercial spec locks `support@implicitex.com` as the
single customer contact. Migrate both pages in one coordinated pass when Coin Card changes
are published.

**Deployment gate:** No paid checkout may be deployed until: (1) attorney review of all
four customer-facing documents is complete; (2) public legal pages, checkout copy, registry
behavior, and implementation tests all agree.

---

## Layer 3 — Architecture

Both architecture documents derive from the Commercial Spec and must not contradict it.
If they conflict with the spec, update them — not the spec.

### `COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md`

**Status:** DRAFT 2026-07-21
**Authority:** Defines purchase flow state machine, data schemas (direction only),
idempotency rules, and failure recovery paths.

Owns:
- Order record schema
- Handle status lifecycle (AVAILABLE → RESERVED → ACTIVE → HELD → AVAILABLE)
- Full purchase flow (5 phases, 23 steps)
- Failure recovery: PROVISION_FAILED requires manual resolution
- Refund flow (4-point eligibility check)
- Schema direction for orders, registry_records, refund_requests
- 14-row Idempotency Rules table

### `COIN_CARD_BACKEND_ARCHITECTURE_V1.md`

**Status:** DRAFT 2026-07-21 — UNDER REVIEW (7 of 8 blocking checklist items
remain unproven; KMS format gate passed 2026-07-21)
**Authority:** Defines the runtime topology — which services exist, what technology
they use, where trust boundaries lie, and what order to build them.

Owns:
- Firebase Functions 2nd gen as runtime boundary (rationale documented)
- Seven logical services and their responsibilities
- Registry Continuity Constraint (Hosting → registryRead Function → Firestore + Storage)
- `payloadHash` and `artifactHash` definitions and how they differ
- PENDING_PUBLICATION protocol (4-step; prevents partial card exposure)
- `registryRead` response behavior by lifecycle state (all 6 states)
- Refund as new signed REVOKED artifact (same 4-step protocol; original artifact unchanged)
- Cloud Storage bucket: private (uniform bucket-level access; public access prevention ON)
- KMS key type: `EC_SIGN_P256_SHA256` (corrected from secp256k1 assumption by spike)
- 14-step implementation sequence (KMS gate now passed; steps 2–14 carry ordinary implementation risk)
- MVP topology

**Blocking checklist (7 remaining):**
- [ ] Hosting → `registryRead` rewrite works while exact static files retain priority
- [ ] Buyer proof is domain-separated, expiring, single-use, and transactionally consumed
- [ ] Storage bucket is private; validated reads cannot be bypassed via direct object URL
- [ ] `payloadHash`, `artifactHash`, and object-path semantics defined and implemented consistently
- [ ] Existing artifact objects are never overwritten
- [ ] `registryRead` response behavior defined and tested for every public lifecycle state
- [ ] Refund produces a new signed REVOKED projection; no unsigned status overlay

These remaining items are proof obligations against the implementation, not open
design questions. The architectural questions are resolved.

---

## Layer 4 — Engineering Rules

### `COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md`

**Status:** DRAFT 2026-07-21
**Authority:** Engineering discipline. Violations are implementation defects.
**Not commercial, not legal.** These rules exist to make the commercial promises
trustable through implementation.

Owns 15 rules:
1. Event Table is law — no undocumented transitions
2. Every webhook handler is idempotent
3. Every external call carries a correlation ID (`order_id`)
4. Every state transition is logged with from/to/timestamp/triggered_by
5. Provisioning is keyed on `order_id` (inside transaction; not check-then-write)
6. Retries use exponential backoff with jitter
7. Reconciliation passes are replay-safe
8. Immutable fields are enforced at the database level
9. `PROVISION_FAILED` must alert (ops silence interval: zero)
10. Tests must cover every invariant and every event table row
11. No authority substitution (Stripe ≠ order state; registry ≠ payment fact)
12. Stripe idempotency keys are mandatory on all write operations
13. No silent failures — every catch block must log
14. No state machine bypass — no direct DB writes to status fields
15. Every tool that can modify persistent state must fail closed on unverified environment
    — allowlist-based environment guard required; guard executes before service initialization;
    applies to all ImplicitEx tooling, not only Coin Card

---

## Layer 5 — Trust and Cryptographic Contracts

This layer predates the commercial stack and governs *how* Coin Card identity
records are cryptographically authenticated. It operates independently of payment
and provisioning. The two branches converge at the Registry Publisher: the
commercial stack triggers registry publication; the trust stack defines the format
and verification rules for what gets published.

**Root:** `COIN_CARD_TRUST_MODEL.md` — V1 frozen 2026-07-04. Implementation may
refine mechanics but must not reopen or weaken trust boundaries.

### Terminology (from trust stack)

| Term | Meaning |
|---|---|
| Integrity Manifest | `coin-card-manifest.json` — proves the runtime asset bundle is intact; P-256 signed |
| Registry Record | `/registry/coincards/<handle>.json` — card lifecycle configuration; served by `registryRead` |
| Lifecycle Record | The signed internal form of a registry record (schema: `coin-card-lifecycle-registry-record.v1`) |

### Trust stack documents

**Signing and key management:**

| Document | Owns |
|---|---|
| `COIN_CARD_SIGNATURE_POLICY_V1.md` | When signature evidence may change verification state |
| `COIN_CARD_SIGNATURE_VERIFIER_DESIGN_V1.md` | Verifier algorithm, canonical payload, key ID, failure mapping |
| `COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md` | Where the verifier may obtain trusted public keys; immutability |
| `COIN_CARD_TRUSTED_PUBLIC_KEY_POPULATION_CONTRACT_V1.md` | How approved keys enter the protected trust source |
| `COIN_CARD_TRUSTED_PUBLIC_KEY_RECORD_CONTRACT_V1.md` | Trusted key record shape; deterministic key resolution outcomes |

**Lifecycle and registry:**

| Document | Owns |
|---|---|
| `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md` | Registry authority, publication evidence, card/manifest status |
| `COIN_CARD_LIFECYCLE_REGISTRY_AUTHORITY_CONTRACT_V1.md` | Administration authority, publication authority, record authentication |
| `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md` | Signing contract — canonical JSON, domain separator, signature format, P-256/SHA-256 |
| `COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md` | Bundle wrapper validation; atomic record-collection authentication |
| `COIN_CARD_LIFECYCLE_RECORD_SELECTION_CONTRACT_V1.md` | Evidence selection, lineage coherence |
| `COIN_CARD_LIFECYCLE_RESOLUTION_CONTRACT_V1.md` | Evidence interpretation, temporal resolution |
| `COIN_CARD_LIFECYCLE_PRESENTATION_PROMOTION_CONTRACT_V1.md` | Presentation-promotion policy; exclusive promotion rule |

**Execution and envelope:**

| Document | Owns |
|---|---|
| `COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md` | Three-input execution gate; one-shot consumption; TOCTOU guard |
| `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md` | Signed manifest envelope format, payment facts, revision chaining |
| `COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md` | Runtime manifest placement; only `VERIFIED` state may call `IX_EXECUTION` |

**Evidence-bound payment authority — sealed authority unit:**

These three contracts are one inseparable sealed authority unit. Fixtures and tests are supporting conformance evidence rather than normative authority.

| Repository document | Owns |
|---|---|
| `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md` | Card-specific payment authority, frozen intent, observed execution, and settlement conjunction |
| `docs/product/coin-card/COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md` | Content-addressed executor ABI, code identity, policy guard, fee arithmetic, and event semantics |
| `docs/product/coin-card/COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md` | Lifecycle identity, Registry V2 identity, payment-epoch currentness, and anti-rollback head |

| Supporting fixture | Focused conformance test |
|---|---|
| `docs/product/coin-card/coin-card.transaction-evidence.fixtures.v1.json` | `app-web/tests/frontend/coin-card-transaction-evidence-contract.test.js` |
| `docs/product/coin-card/coin-card.execution-interface-descriptor.fixtures.v1.json` | `app-web/tests/frontend/coin-card-execution-interface-descriptor-contract.test.js` |
| `docs/product/coin-card/coin-card.lifecycle-and-registry-identity.fixtures.v1.json` | `app-web/tests/frontend/coin-card-lifecycle-and-registry-identity-contract.test.js` |

**Schema (integrity manifest, not registry record):**

| Document | Owns |
|---|---|
| `MANIFEST_SCHEMA.md` | Normative Coin Card manifest schema (issuer wallet, EIP-191, recipient) |
| `COIN_CARD_MANIFEST_SCHEMA_V1.md` | Integrity Manifest format (asset hashing, proof tooling format) |

**Supporting models:**

| Document | Owns |
|---|---|
| `REVOCATION_MODEL.md` | Normative revocation model |
| `REGISTRY_MODEL.md` | Normative registry model |
| `COIN_CARD_DESIGN_PRINCIPLES.md` | Normative design constitution |
| `COIN_CARD_VERIFICATION_STATE_COPY_V1.md` | User-facing copy contract for verification states |

### Signing contract summary (from `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`)

Confirmed by KMS spike:

```
key type:     EC_SIGN_P256_SHA256  (P-256 curve, SHA-256)
signed bytes: UTF8("ImplicitEx Coin Card Lifecycle Registry Record v1")
              + 0x00
              + UTF8(canonicalizeJson(record_without_signature_value))
KMS output:   ASN.1 DER
target format: IEEE P1363 — r(32) || s(32) = 64 bytes; base64url-unpadded (86 chars)
conversion:   derToP1363() — see KMS_COMPATIBILITY_EVIDENCE.md
```

---

## Layer 6 — Evidence

Evidence documents prove specific claims. They do not define new design.

| Document | What it proves |
|---|---|
| `backend/scripts/spikes/kms-p256-compatibility/KMS_COMPATIBILITY_EVIDENCE.md` | Cloud KMS `EC_SIGN_P256_SHA256` DER output converts to P1363 and authenticates through the unmodified lifecycle record verifier; 9/9 tests pass; ECDSA non-determinism confirmed harmless; REVOKED lifecycle works |
| `backend/scripts/spikes/hosting-rewrite/HOSTING_REWRITE_EVIDENCE.md` | Firebase Hosting exact static-file precedence and fallback routing to `spikeRegistryRead`; 8 verification checks; confirms `antoine.json` served without function invocation |

---

## Layer 7 — Informative

These documents are useful historical context but must not be used to override decisions
in Layers 1–5. Do not amend other layers based on these.

> **Do not implement from any document in this layer.**
> Retained for historical context only. If a document here appears to define
> something relevant, find the normative source in Layers 1–5 instead.

| Document | What it records |
|---|---|
| `CURRENT_STATE_2026-07-06.md` | Implementation checkpoint |
| `COIN_CARD_PUBLISHER_MVP.md` | Publisher MVP implementation planning artifact |
| `STATELESS_EMBED_AUDIT_2026-07-07.md` | Embed audit at that date |
| `COIN_CARD_CRYPTOGRAPHIC_INTEGRITY_ARCHITECTURE.md` | Concept proposal — post-MVP only; not current scope |
| `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_AND_LIFECYCLE_CONTRACT_V1.md` | **Superseded.** Split into `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md` and the lifecycle contracts. Do not implement from this file. |
| `PUBLISHER_SPEC.md` | Early publisher specification |
| `COIN_CARD_VERIFICATION_LANGUAGE.md` | Verification language notes |

---

## Planned documents (not yet created)

| Document | Purpose | Trigger |
|---|---|---|
| Operations Runbook | Operator procedures — log queries, manual overrides, incident recovery | After backend is implemented and runtime logging is observable |
| Subscription Terms | Subscription commercial model | Post-MVP |

---

## Dependency graph

```
COIN_CARD_COMMERCIAL_SPEC_V1.md  ──────────────────────────────────────────────────┐
    │                                                                               │
    ├──► legal/REFUND_POLICY.md                                                    │
    ├──► legal/PURCHASE_TERMS.md                                                   │ governs
    ├──► legal/TERMS_OF_SERVICE_UPDATES.md                                         │ commercial
    ├──► PRIVACY_POLICY_UPDATES.md                                                 │ decisions
    │                                                                               │
    ├──► COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md                        │
    │        │                                                                      │
    │        └──► COIN_CARD_BACKEND_ARCHITECTURE_V1.md ◄──────────────────────────┘
    │                  │
    │                  └──► COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md
    │                             │
    │                             └──► implementation
    │                                       │
    │                                       └──► tests
    │
    │
COIN_CARD_TRUST_MODEL.md (V1 frozen) ──────────────────────────────────────────────┐
    │                                                                               │
    ├──► Signing contracts (signature policy, verifier design, key contracts)      │
    ├──► Lifecycle contracts (registry, bundle, record selection/resolution)       │ governs
    ├──► Execution contract                                                        │ verification
    ├──► Sealed evidence-authority unit                                            │
    │      ├──► Transaction Evidence ──depends-on──► Execution Descriptor          │
    │      └──► Transaction Evidence ──depends-on──► Lifecycle/Registry Identity   │
    ├──► Manifest contracts (schema, runtime contract, envelope)                   │
    └──► Registry Publisher  ◄──── convergence point ────────────────────────────►┘
              │
              ├── commercial stack tells it WHEN to publish
              └── trust stack tells it WHAT FORMAT to publish in


KMS_COMPATIBILITY_EVIDENCE.md ──────────────────────────────────────────────────────
    └──► proves that COIN_CARD_BACKEND_ARCHITECTURE_V1.md (KMS gate) is satisfiable
```

---

## Quick reference: "which document do I open?"

| Question | Document |
|---|---|
| What is the commercial promise to customers? | `COIN_CARD_COMMERCIAL_SPEC_V1.md` |
| What does the refund policy say? | `legal/REFUND_POLICY.md` |
| What are the purchase terms? | `legal/PURCHASE_TERMS.md` |
| What state can an order be in? | `COIN_CARD_COMMERCIAL_SPEC_V1.md` § Purchase Provisioning State Machine |
| What state can a handle be in? | `COIN_CARD_COMMERCIAL_SPEC_V1.md` § Registry Lifecycle |
| What events are permitted? | `COIN_CARD_COMMERCIAL_SPEC_V1.md` § Event Table |
| Which invariants must hold? | `COIN_CARD_COMMERCIAL_SPEC_V1.md` § Commercial Invariants |
| What services exist at runtime? | `COIN_CARD_BACKEND_ARCHITECTURE_V1.md` |
| Who is the authority for payment facts? | `COIN_CARD_COMMERCIAL_SPEC_V1.md` § Authority Matrix → Stripe |
| Who is the authority for card status? | `COIN_CARD_COMMERCIAL_SPEC_V1.md` § Authority Matrix → Registry Record |
| What format is a lifecycle record? | `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md` |
| How is a lifecycle record signed? | `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md` |
| What KMS key type and format? | `COIN_CARD_BACKEND_ARCHITECTURE_V1.md` § KMS gate + `KMS_COMPATIBILITY_EVIDENCE.md` |
| How does the verifier authenticate a record? | `coin-card-lifecycle-record-verification.js` |
| What does the verifier accept as trusted keys? | `coin-card-trusted-keys.js` |
| What authenticates a Coin Card payment route and policy? | `docs/product/coin-card/COIN_CARD_TRANSACTION_EVIDENCE_CONTRACT_V1.md` — Sealed |
| What fixes executor ABI, code, guard, and event semantics? | `docs/product/coin-card/COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md` — Sealed |
| What establishes Registry V2 identity and payment currentness? | `docs/product/coin-card/COIN_CARD_LIFECYCLE_AND_EXECUTABLE_REGISTRY_IDENTITY_CONTRACT_V1.md` — Sealed |
| What rule governs engineering implementation? | `COIN_CARD_ENGINEERING_IMPLEMENTATION_RULES_V1.md` |
| What is the implementation build order? | `COIN_CARD_BACKEND_ARCHITECTURE_V1.md` § Implementation Sequence |
| Is the KMS signing format proven? | `KMS_COMPATIBILITY_EVIDENCE.md` — yes, 2026-07-21 |
| What happens if the commercial spec and architecture disagree? | Commercial spec governs; update architecture |
| What happens if the trust model and a contract disagree? | Trust model governs |
