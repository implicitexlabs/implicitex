# Coin Card Artifact V1

**Status:** Governing — Sprint 01 canonical product object definition  
**Date:** 2026-08-07  
**Authored by:** Antoine Dennison  
**Authority layer:** Layer 0 — product object definition; governs all lower layers  

---

## Sprint 01 invariant

> **A Coin Card is a product object, not a URL, webpage, account, wallet, or
> payment transaction. URLs and interfaces locate, render, manage, verify, or
> interact with Coin Cards.**

This sentence is the first invariant of the system. Every database field,
contract, lifecycle state, API shape, and customer-facing screen is subordinate
to it.

---

## Authority

This document derives from:

```text
ImplicitEx Constitution
  → Coin Card Constitution
      → COIN_CARD_TRUST_MODEL.md        (trust root)
      → COIN_CARD_COMMERCIAL_SPEC_V1.md (commercial root)
      → COIN_CARD_ARTIFACT_V1.md        ← this document (product object root)
            ↓
      COIN_CARD_MANIFEST_SCHEMA_V1.md   (integrity manifest)
      COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md (signed envelope)
      REGISTRY_MODEL.md                 (registry record)
      REVOCATION_MODEL.md               (revocation lifecycle)
      COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md (lifecycle outcomes)
      COIN_CARD_DESIGN_PRINCIPLES.md    (presentation)
      COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md (commercial entitlement)
```

When this document and any document it references conflict on the definition
of what a Coin Card *is*, this document governs. When they conflict on how a
specific layer (registry, signing, presentation, entitlement) operates
internally, the document governing that layer wins within its scope.

---

## Purpose

This document answers one question:

> What is a Coin Card, as a software object?

It defines the canonical `CoinCardArtifact V1` schema: every section,
every field, types, normalization rules, required vs optional, immutability,
what gets signed, and what must never appear.

It does not define how a Coin Card is rendered, stored, transferred, or
purchased. Those responsibilities belong to the documents that derive from this
one.

---

## The four separations

Before the field-by-field definition, four conceptual boundaries must be
established and never collapsed.

### 1. Coin Card identity

The permanent identity of a Coin Card product instance:

```text
card_id   — the canonical, stable, permanent identifier
handle    — a human-readable alias pointing to card_id
```

`card_id` is the thing. `handle` is a name for the thing.

**A handle may change; `card_id` never changes.** A card whose holder
eventually renames their handle is still the same Coin Card with the same
`card_id`. A handle that is reassigned is not the same Coin Card — it has
a new `card_id`.

`card_id` is the identity. `coincard.click/alice` is a resolver URL.
Those must never be conflated in any data model, API, or communication.

### 2. Coin Card artifact

The versioned, signed, portable, immutable issued object. When material
properties change, a new artifact version is created:

```text
card_id: cc_7f3a...
  ├── artifact version 1  (issued 2026-08-07, immutable)
  ├── artifact version 2  (issued 2026-09-01, immutable)
  └── artifact version 3  (issued 2026-10-15, immutable, current)
```

**An issued artifact is never mutated.** Route changes, verification level
upgrades, and presentation version updates all produce a new artifact version.
The registry points to which version is current.

This is not a constraint imposed by implementation convenience. It is the
cryptographic and auditing model: each version is a signed claim at a point in
time. Mutating a version would rewrite history.

### 3. Coin Card registry

The mutable index that answers:

```text
Does this card_id exist?
Which artifact version is current?
What is the current card status?
Where is the current artifact?
When was it last updated?
```

The registry does not define what the Coin Card is. It points to the current
artifact and reports current status. The artifact is authoritative for its
own signed fields. The registry is authoritative only for operational status
and current-version resolution.

### 4. coincard.click

Not the Coin Card. The Coin Card system's:

```text
issuer
account system
management console
registry interface
resolver
distribution surface
public viewer / renderer
discovery mechanism
upgrade and billing surface
```

`coincard.click/alice` is a resolver URL for Alice's Coin Card. It is not
Alice's Coin Card. Alice's Coin Card exists as a signed artifact with a stable
`card_id`. `coincard.click/alice` is one interface to it. A third-party embed
is another. An offline verifier reading the artifact JSON is another. All three
interact with the same Coin Card object.

---

## CoinCardArtifact V1 — canonical object model

A `CoinCardArtifact` is a structured, versioned, signed document. It has eight
top-level sections. Together they define exactly one issued version of one Coin Card.

```text
CoinCardArtifact
├── §1  identity
├── §2  presentation
├── §3  payment_routes
├── §4  verification
├── §5  capabilities
├── §6  lifecycle_reference
├── §7  integrity
└── §8  provenance
```

### §1 — identity

The permanent identity of the Coin Card. Identity fields are **immutable across
all artifact versions of the same card_id.**

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `card_id` | string | ✓ | — | Permanent, globally unique Coin Card identifier. Assigned at issuance; never changes for the lifetime of this Coin Card. Format: `cc_` prefix followed by 16 lowercase alphanumeric characters. Does not encode handle, owner, or network. Not guessable. |
| `issuer_id` | string | ✓ | — | Identifier of the issuing authority. V1 value: `implicitex`. Must match `issuerId` in the signed manifest envelope. |
| `issuer_name` | string | ✓ | — | Human-readable issuer name. V1 value: `ImplicitEx`. |
| `environment` | string | ✓ | — | Trust domain. One of: `production`, `test`. All V1 production Coin Cards must have `production`. |
| `handle` | string | ✓ | ✓ | Human-readable alias at issuance time. 3–30 characters; lowercase alphanumeric and hyphen; no leading or trailing hyphen. Aliased to `card_id` in the registry. Recorded in the artifact at issuance but does not define identity; a handle change produces a new artifact version with the updated handle. |
| `schema_version` | string | ✓ | — | Version of this artifact schema. V1 value: `coin-card-artifact.v1`. Governs how all other fields are interpreted. A schema version change requires a new major artifact revision. |
| `artifact_version` | integer | ✓ | — | Monotonically increasing version number for this `card_id`. Starts at `1`. Incremented by exactly 1 for each new artifact version. No gaps, no rollback. |
| `created_at` | string | ✓ | — | UTC timestamp when `card_id` was first issued, in `YYYY-MM-DDTHH:mm:ss.sssZ` format. Identical across all artifact versions of the same `card_id`. Records the origin of the identity, not the origin of this version. |

**Identity invariants:**

- `card_id` is assigned once and never changes.
- `issuer_id` and `environment` are assigned once and never change within a
  `card_id` sequence.
- `schema_version` may change only through a formally documented schema
  revision; it does not change across routine route or verification updates.
- `artifact_version` must be exactly one greater than the `artifact_version` of
  the predecessor artifact for this `card_id`. Version 1 has no predecessor.
- `created_at` must be identical across all artifact versions of the same
  `card_id`. It is not the timestamp of this version; that is in `provenance`.
- `handle` is the only identity field that may change. A handle change must
  produce a new artifact version.

---

### §2 — presentation

The presentation section records which presentation specification governs the
rendering of this artifact version. It does not contain CSS, layout
coordinates, or rendering instructions. It points to the versioned contract
that governs those things.

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `presentation_version` | string | ✓ | ✓ | Version of the presentation specification that governs visual rendering of this artifact. V1 value: `coin-card-presentation.v1`. A rendering surface must implement this version or explicitly declare an upgrade. Governed by `COIN_CARD_DESIGN_PRINCIPLES.md`. |
| `layout_id` | string | ✓ | ✓ | Canonical layout identifier within the presentation version. V1 value: `standard`. Additional layouts (e.g., `compact`, `vertical`) must be defined in the presentation spec before use in an artifact. |
| `theme` | object\|null | — | ✓ | Permitted variable theme tokens for this artifact. Null uses presentation default theme. If non-null, must conform to the permitted-token set defined by the presentation specification. No token outside the permitted set may appear. |

**Presentation invariants:**

- `presentation_version` governs what `layout_id` and `theme` values are
  permitted. An artifact must not specify a `layout_id` not defined in the
  stated `presentation_version`.
- Fixed geometry (aspect ratio, edge geometry, internal grid, typography
  families, type hierarchy, safe areas, identity zones, route zones,
  verification zones, action zones) is not variable and does not appear in the
  artifact. It is defined entirely by the presentation specification contract.
- An artifact does not contain CSS, DOM instructions, class names, or any
  rendering implementation detail. The renderer implements the presentation
  spec; the artifact identifies which spec to use.
- A future Coin Card that changes visual language must increment
  `presentation_version`, not store layout overrides in the artifact.

---

### §3 — payment_routes

The payment routes section defines the authorized payment destinations for this
artifact version. V1 Coin Cards have exactly one active payment route. The
schema permits an array to support future multi-route capabilities without
requiring a schema change.

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `payment_routes` | array | ✓ | ✓ | Ordered list of payment route objects. V1: exactly one entry. Must not be empty. |

Each **payment route object**:

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `route_id` | string | ✓ | — | Stable identifier for this route record. Format: `route_` prefix followed by 12 lowercase alphanumeric characters. Assigned at route creation; does not change if route content changes — a route content change produces a new artifact version with a new `route_id`. |
| `route_version` | string | ✓ | — | Version of the route schema governing this entry. V1 value: `coin-card-route.v1`. |
| `status` | string | ✓ | ✓ | Current status of this route. One of: `ACTIVE`, `SUSPENDED`, `RETIRED`. Only `ACTIVE` routes are executable. A route does not become `REVOKED`; card-level revocation is in `lifecycle_reference`. |
| `network` | object | ✓ | ✓ | Network facts. See sub-fields below. |
| `asset` | object | ✓ | ✓ | Asset facts. See sub-fields below. |
| `recipient_address` | string | ✓ | ✓ | Canonical payment recipient address in the format required by the network. For EVM networks: EIP-55 mixed-case checksum address. Immutable within a route record; a new address requires a new artifact version with a new `route_id`. Not derivable from handle, account, or any other field — verified explicitly. |
| `amount_policy` | object | ✓ | ✓ | Amount semantics. One of four policy shapes defined in `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`: `OPEN_AMOUNT`, `FIXED_AMOUNT`, `MINIMUM_AMOUNT`, `BOUNDED_AMOUNT`. Amount values are canonical non-negative integer strings in asset base units. |
| `verified_at` | string\|null | — | ✓ | UTC timestamp of last route verification, or null if not yet verified. Does not imply recipient identity verification. |
| `verification_note` | string\|null | — | ✓ | Human-readable note on what was verified and by what method, for display and audit. |

**network** sub-fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `chain_namespace` | string | ✓ | Network namespace. V1: `eip155`. |
| `chain_id` | integer | ✓ | EIP-155 chain ID. Polygon mainnet: `137`. Polygon Amoy testnet: `80002`. |
| `name` | string | ✓ | Human-readable network name. E.g., `Polygon`. |

**asset** sub-fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `standard` | string | ✓ | Token standard. V1: `ERC-20`. |
| `contract_address` | string\|null | ✓ | Token contract address (EIP-55) for ERC-20 tokens. Null only when `standard` explicitly permits a native asset. V1 USDC on Polygon mainnet: `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359`. |
| `symbol` | string | ✓ | Token symbol. V1: `USDC`. |
| `decimals` | integer | ✓ | Token decimal places. V1 USDC: `6`. |

**Route invariants:**

- `recipient_address` must be verified against `asset.contract_address` at
  artifact issuance. `quoted_asset = 'USDC'` does not replace verification
  of the exact contract address. Bridged or non-canonical token contracts
  are not valid.
- A route change (new recipient address, network, or asset) produces a new
  artifact version and a new `route_id`. The old route record is retained in
  historical artifact versions.
- V1 enforces exactly one `ACTIVE` route per artifact. An artifact with zero
  active routes is not executable. An artifact with two active routes requires
  a V2 route schema.
- `amount_policy` is signed and cannot be changed without producing a new
  artifact version.

---

### §4 — verification

The verification section records the current evidence state for this artifact
version. Verification state may improve over time (additional evidence added)
without necessarily producing a new artifact version if the signed fields are
unchanged — but a material change to what evidence is asserted in the signed
envelope always produces a new version.

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `verification_version` | string | ✓ | — | Version of the verification model governing this section. V1 value: `coin-card-verification.v1`. Governed by `COIN_CARD_TRUST_MODEL.md`. |
| `trust_level` | string | ✓ | ✓ | Current maximum trust level assertable for this artifact. One of: `ROUTE_VERIFIED`, `IDENTITY_PENDING`, `IDENTITY_VERIFIED`. Governed strictly by `COIN_CARD_TRUST_MODEL.md`. Raising trust level requires new evidence blocks and produces a new artifact version. |
| `evidence_blocks` | array | ✓ | ✓ | Ordered list of evidence block objects. Empty array is valid for `ROUTE_VERIFIED`. |

Each **evidence block**:

| Field | Type | Required | Description |
|---|---|---|---|
| `block_id` | string | ✓ | Stable block identifier. Format: `evb_` prefix. |
| `block_type` | string | ✓ | Evidence block type. Governed by Identity Evidence Architecture. E.g., `WALLET_CONTROL`, `EMAIL_DOMAIN`, `REGISTRY_RECORD`. |
| `block_status` | string | ✓ | One of: `PENDING`, `VERIFIED`, `FAILED`, `EXPIRED`. |
| `verified_at` | string\|null | — | UTC timestamp of last successful verification. |
| `expires_at` | string\|null | — | UTC timestamp after which this block is no longer valid evidence. |
| `evidence_hash` | string\|null | — | `sha256:`-prefixed digest of the canonical evidence record. Present when the block has associated signed evidence. |

**Verification invariants:**

- `trust_level` must be derivable from `evidence_blocks`. If no blocks are
  present or all blocks are `PENDING`, `trust_level` must be `ROUTE_VERIFIED`.
- `trust_level` is the system's assertion to the verifier. It must not be
  more favorable than the evidence supports.
- Evidence blocks are additive within a trust tier. Removing an evidence block
  requires a new artifact version.
- `verification_version` does not change across evidence additions within V1.

---

### §5 — capabilities

The capabilities section records what this artifact version is authorized to do.
Capabilities are derived from entitlement state, trust level, and platform
policy. They are recorded in the artifact so an offline verifier can understand
what the artifact authorizes without querying the platform.

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `execution_rail` | string | ✓ | — | The execution surface authorized for payment execution. V1 value: `implicitex_v1`. Governs which `IX_EXECUTION` contract may fulfill this artifact. |
| `can_receive_payments` | boolean | ✓ | ✓ | Whether this artifact is currently authorized to receive payments. Derived from card status and entitlement state. `false` when card is SUSPENDED, REVOKED, or EXPIRED. |
| `can_be_embedded` | boolean | ✓ | ✓ | Whether this artifact may be embedded in third-party surfaces. Always `true` for issued V1 artifacts unless revoked. |
| `can_be_shared` | boolean | ✓ | ✓ | Whether the public URL and QR code may be shared. Always `true` for issued V1 artifacts unless revoked. |
| `route_changes_remaining` | integer\|null | — | ✓ | Number of route changes remaining in the current entitlement term. Null when uncapped. V1 Paid: 4 per 12-month term. Null for free tier. |
| `fingerprint_version` | string | ✓ | — | Version of the deterministic fingerprinting algorithm used for this artifact. V1 value: `coin-card-fingerprint.v1`. Governs the canonical serialization and digest method. A change to fingerprinting requires a new artifact version. |

**Capabilities invariants:**

- `can_receive_payments` is `false` whenever `lifecycle_reference.card_status`
  is not `ACTIVE`. It is not separately settable to `true` when card status
  is non-active.
- `execution_rail` is immutable within a `card_id` sequence. Moving to a
  different execution rail requires a new `card_id`.
- `fingerprint_version` is immutable within an artifact version.

---

### §6 — lifecycle_reference

The lifecycle reference section connects this artifact version to the registry
and records the artifact's current operational status. The registry is the
mutable authority for current status; this section captures the status at
artifact issuance time and defines the two independent status axes.

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `registry_id` | string | ✓ | — | Identifier of the governing registry. V1 value: `implicitex-registry-v1`. |
| `manifest_id` | string | ✓ | — | Stable identifier of the signed manifest envelope that corresponds to this artifact version. Maps to `manifestId` in `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`. |
| `revision` | integer | ✓ | — | Registry-tracked revision number for this `card_id`. Starts at `1`. Must match `artifact_version` in §1 and `revision` in the signed manifest envelope. |
| `previous_manifest_id` | string\|null | ✓ | — | `manifest_id` of the immediately preceding artifact version. Null for revision 1. Must match `previousManifestId` in the signed manifest envelope. |
| `card_status` | string | ✓ | ✓ | Current cryptographic and identity status of the Coin Card as an object. Entirely independent of commercial entitlement status. One of: `DRAFT`, `ACTIVE`, `SUSPENDED`, `REVOKED`. See Card status semantics below. |
| `entitlement_status` | string | ✓ | ✓ | Current commercial entitlement status. Entirely independent of card status. One of: `NONE`, `ACTIVE`, `PAST_DUE`, `EXPIRED`, `CANCELLED`. See Commercial entitlement semantics below. |
| `card_status_updated_at` | string | ✓ | ✓ | UTC timestamp of last `card_status` change. |
| `entitlement_status_updated_at` | string | ✓ | ✓ | UTC timestamp of last `entitlement_status` change. |

**Card status semantics:**

| Status | Meaning | Executable | Revocable |
|---|---|---|---|
| `DRAFT` | Artifact has been created but not yet published to the registry | No | Yes |
| `ACTIVE` | Published, operational, cryptographically valid | Yes | Yes |
| `SUSPENDED` | Temporarily non-operational; operator-initiated review | No | Yes |
| `REVOKED` | Permanently invalidated; identity is compromised, invalid, or holder-requested | No | — |

`REVOKED` is an identity-level event. It means this Coin Card as an object is
no longer valid. It is not a billing event. It is not a payment failure.
`REVOKED` should carry the weight of: security compromise, fraudulent issuance,
or deliberate destruction by the holder.

**Commercial entitlement semantics:**

| Status | Meaning | Effect on card |
|---|---|---|
| `NONE` | No active entitlement; free tier or pre-purchase | Card may exist; execution subject to tier limits |
| `ACTIVE` | Valid paid entitlement within term | Paid capabilities enabled |
| `PAST_DUE` | Payment failed; grace period in effect | Paid capabilities may be restricted; card identity preserved |
| `EXPIRED` | Entitlement term ended; grace period elapsed | Premium capabilities removed; card identity preserved |
| `CANCELLED` | Holder cancelled entitlement | Paid capabilities removed; card identity preserved |

**The critical separation:**

A `PAST_DUE` or `EXPIRED` entitlement must not set `card_status` to `REVOKED`
or `SUSPENDED`. These are independent axes. A Coin Card embedded on 75 websites
must not show `REVOKED` because a customer's payment method failed.

A commercial entitlement failure may:
- Disable execution (prevent new transfers)
- Remove premium features
- Show an expired-entitlement notice on the card page
- Prevent route changes

It must not:
- Change `card_status` to `REVOKED`
- Invalidate the cryptographic identity of the artifact
- Rewrite or erase the signed history
- Prevent historical artifact inspection

`card_status` changes are governed by security and identity events.
`entitlement_status` changes are governed by commercial and billing events.
These two axes may never collapse into one.

**Lifecycle invariants:**

- `card_status = 'REVOKED'` is terminal. No transition returns a revoked card
  to `ACTIVE`, `SUSPENDED`, or `DRAFT`.
- `revision` must be consistent with `artifact_version` in §1. A mismatch is
  an artifact integrity failure.
- `previous_manifest_id` for revision N must equal the `manifest_id` of
  revision N−1. The registry must reject any artifact that breaks this chain.

---

### §7 — integrity

The integrity section binds the artifact to its cryptographic evidence. These
fields are the ground truth for verification.

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `fingerprint_algorithm` | string | ✓ | — | Canonical serialization and hashing algorithm. V1 value: `sha256-canonical-json-v1`. Governed by `fingerprint_version` in §5. |
| `artifact_hash` | string | ✓ | — | `sha256:`-prefixed digest of the canonical serialization of this entire artifact object, excluding `artifact_hash` itself. Computed after all other fields are set. |
| `payload_hash` | string | ✓ | — | `sha256:`-prefixed digest of the protected payload, as defined in `COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md`. This hash is what the signature covers. |
| `signed_fields` | array | ✓ | — | Ordered list of top-level field paths included in the signed payload. Any field not listed here is outside the cryptographic boundary. |
| `signature` | object | ✓ | — | Signature over the protected payload. See sub-fields below. |

**signature** sub-fields:

| Field | Type | Required | Description |
|---|---|---|---|
| `algorithm` | string\|null | ✓ | Signature algorithm. V1 production: `ed25519`. V1 dev/test: `unsigned-dev` (null `value`). |
| `key_id` | string\|null | ✓ | Trusted key record identifier used for signing. Maps to `keyId` in the signed manifest envelope. Null only when `algorithm` is `unsigned-dev`. |
| `value` | string\|null | ✓ | Canonical signature value. Null when `algorithm` is `unsigned-dev`. |
| `signed_at` | string | ✓ | UTC timestamp of signing in `YYYY-MM-DDTHH:mm:ss.sssZ` format. Issuer assertion; not third-party timestamp evidence. |

**Integrity invariants:**

- `artifact_hash` is recomputed and verified by every verifier before any
  other check. An artifact whose `artifact_hash` does not match its canonical
  serialization is invalid regardless of signature state.
- `payload_hash` must be consistent with the `payloadHash` field in the
  corresponding signed manifest envelope.
- `signed_fields` is itself included in the signed payload. A verifier must
  reject any artifact where a field is asserted as signed but is absent from
  `signed_fields`.
- `signature.algorithm` may not be `unsigned-dev` in any `environment:
  production` artifact.
- No integrity field is mutable. An artifact with a changed integrity field is
  a different artifact, not an updated one.

---

### §8 — provenance

The provenance section records the issuance chain of this artifact version: when
it was produced, by what process, and for how long it declares itself valid.

| Field | Type | Required | Mutable | Description |
|---|---|---|---|---|
| `issued_at` | string | ✓ | — | UTC timestamp when this artifact version was produced, in `YYYY-MM-DDTHH:mm:ss.sssZ` format. Distinct from `created_at` in §1. |
| `issued_by` | string | ✓ | — | Issuer identifier. V1 value: `implicitex`. |
| `generation_workflow` | string | ✓ | — | Version of the issuance workflow that produced this artifact. Allows future debugging and auditing of how an artifact was generated. E.g., `coin-card-issuance-workflow.v1`. |
| `valid_from` | string | ✓ | — | UTC timestamp from which this artifact declares itself valid. May equal `issued_at`. Maps to `validFrom` in the signed manifest envelope. |
| `valid_until` | string\|null | ✓ | — | UTC timestamp after which the issuer declares this artifact expired, or null when the issuer does not declare an expiry. Maps to `validUntil` in the signed manifest envelope. Registry lifecycle may independently expire the card before this date. |
| `predecessor_artifact_hash` | string\|null | ✓ | — | `artifact_hash` of the immediately preceding artifact version, or null for version 1. Allows verifiers to walk the version history without querying the registry. |

**Provenance invariants:**

- `issued_at` and `valid_from` are immutable once the artifact is signed.
- `predecessor_artifact_hash` must match the `artifact_hash` recorded in the
  preceding artifact version. A chain gap is an integrity failure.
- `generation_workflow` must be documented. An artifact produced by an
  undocumented workflow is not a valid issuance.

---

## Immutable vs mutable properties

The following table summarizes mutability across the eight sections. All
properties marked immutable are covered by the signature or the artifact hash.
Any change to an immutable property requires a new artifact version.

### Immutable (never change within an artifact version, and never change across versions when marked §identity-immutable)

| Property | Scope |
|---|---|
| `identity.card_id` | All versions of this card |
| `identity.issuer_id` | All versions of this card |
| `identity.environment` | All versions of this card |
| `identity.schema_version` | All versions with the same schema |
| `identity.created_at` | All versions of this card |
| `identity.artifact_version` | This version only; increments for next version |
| `presentation.presentation_version` | This version only |
| `payment_routes[n].route_id` | This version only |
| `payment_routes[n].route_version` | This version only |
| `payment_routes[n].recipient_address` | This version only |
| `capabilities.execution_rail` | All versions of this card |
| `capabilities.fingerprint_version` | This version only |
| `lifecycle_reference.registry_id` | All versions of this card |
| `lifecycle_reference.manifest_id` | This version only |
| `lifecycle_reference.revision` | This version only |
| `lifecycle_reference.previous_manifest_id` | This version only |
| `integrity.*` | This version only |
| `provenance.*` | This version only |

### Mutable (may change; changes produce a new artifact version)

| Property | Trigger |
|---|---|
| `identity.handle` | Holder requests handle change |
| `presentation.layout_id` | Presentation upgrade |
| `presentation.theme` | Theme customization |
| `payment_routes[n].status` | Route activation, suspension, retirement |
| `payment_routes[n].recipient_address` | Route change (4/yr V1 cap) |
| `payment_routes[n].amount_policy` | Policy change |
| `payment_routes[n].verified_at` | Re-verification |
| `verification.trust_level` | Evidence upgrade |
| `verification.evidence_blocks` | Evidence addition |
| `capabilities.can_receive_payments` | Card status change |
| `capabilities.can_be_embedded` | Policy change |
| `capabilities.route_changes_remaining` | Route change consumed |
| `lifecycle_reference.card_status` | Security or identity event |
| `lifecycle_reference.entitlement_status` | Commercial event |
| `lifecycle_reference.card_status_updated_at` | Any card status change |
| `lifecycle_reference.entitlement_status_updated_at` | Any entitlement status change |

---

## What gets signed

The signed payload covers the fields that define the payment instruction and
identity claim. These are the fields a verifier must trust without querying
any live system.

**Signed:**

```text
identity.card_id
identity.issuer_id
identity.environment
identity.schema_version
identity.artifact_version
identity.handle
identity.created_at
payment_routes (complete array)
capabilities.execution_rail
capabilities.fingerprint_version
lifecycle_reference.manifest_id
lifecycle_reference.revision
lifecycle_reference.previous_manifest_id
integrity.payload_hash
integrity.signed_fields
integrity.signature.algorithm
integrity.signature.key_id
integrity.signature.signed_at
provenance.issued_at
provenance.issued_by
provenance.generation_workflow
provenance.valid_from
provenance.valid_until
provenance.predecessor_artifact_hash
```

**Not signed (operationally current; queried from registry at verification time):**

```text
lifecycle_reference.card_status
lifecycle_reference.entitlement_status
lifecycle_reference.card_status_updated_at
lifecycle_reference.entitlement_status_updated_at
verification.trust_level
verification.evidence_blocks
capabilities.can_receive_payments
capabilities.can_be_embedded
capabilities.route_changes_remaining
```

**Rationale:** Operational state (card active? entitlement current? evidence
verified?) must be live-queryable because it changes without reissuing the
artifact. The payment instruction and identity claim (who this is, where funds
go, what network) must be signed because they are the facts a sender relies on
at execution time.

---

## What must never appear in the artifact

The following must not appear in any field of a `CoinCardArtifact`:

| Prohibited | Reason |
|---|---|
| Private keys of any kind | Catastrophic: would expose full signing authority |
| Recovery codes | Belong to account management, not the artifact |
| Internal account IDs (e.g., `account_id`, `customer_id`) | Artifact is a portable object; internal platform identifiers leak system topology and are not portable |
| Payment transaction hashes or receipts | Receipts are independent evidence artifacts, not properties of the card |
| Purchase attempt or payment record identifiers | Commercial records are internal to the payment system |
| Stripe payment IDs, PayPal order IDs, or any PSP identifiers | Equivalent: commercial records not portable artifact content |
| `coincard.click` URLs as identity | URLs locate the card; they are not the card |
| Any field encoding the issuer's database primary key | Same reason as internal account IDs |
| Session tokens, JWTs, or any credential scoped to a session | These are ephemeral; the artifact is durable |
| Deprecated field aliases from prior schemas | Dead fields create attack surface; define migrations instead |
| Fields encoding entitlement pricing | Price may change at renewal; artifact must not encode a fee promise that outlives the entitlement term |
| Any field inferring `recipient_address` from `handle` | The address is explicit and verified; inference is a security failure |

---

## Versioning model

The Coin Card system uses four independent version axes. None rolls up into a
single "version number."

| Version field | Governs | When incremented |
|---|---|---|
| `identity.schema_version` | The artifact schema itself | When the artifact schema changes in a backward-incompatible way |
| `presentation.presentation_version` | Visual rendering rules, layout, geometry, theme tokens | When design system changes require renderer updates |
| `capabilities.fingerprint_version` | Canonical serialization and digest algorithm | When hashing or canonicalization changes |
| `payment_routes[n].route_version` | Route record schema | When route record fields change in a backward-incompatible way |
| `verification.verification_version` | Evidence block schema and trust-level derivation rules | When verification model changes |

`identity.artifact_version` is not a schema version. It is the ordinal of this
specific artifact instance within the `card_id` sequence.

**Rendering compatibility rule:** A renderer that implements `presentation_version:
coin-card-presentation.v1` must be able to render any artifact whose
`presentation_version` is `coin-card-presentation.v1`, regardless of
`artifact_version` or the date of issuance. Versioned rendering is the
mechanism that allows a 2026 Coin Card to display correctly when retrieved in
2036.

---

## Presentation specification as contract

The presentation specification (governed by `COIN_CARD_DESIGN_PRINCIPLES.md`)
has two categories of properties:

**Fixed — defined by the specification, not variable per-artifact:**

```text
aspect ratio
edge geometry (border radius, border treatment)
internal grid (columns, rows, safe areas, gutter)
typography families (Oxanium, IBM Plex Mono)
type hierarchy (display, UI, technical)
zone definitions (authority zone, activity zone)
state model (BADGE, INSPECT, TRANSACT, SETTLE)
color semantics (structure, state-amber, critical-red)
interaction signaling rules
information geography rules
```

**Variable — permitted to differ per-artifact, within bounds defined by the spec:**

```text
holder data (handle, recipient address truncation)
approved imagery (within defined zones)
permitted theme tokens (from COIN_CARD_ARTIFACT_V1 §2)
status indicator (ACTIVE, SUSPENDED, REVOKED, EXPIRED)
verification level badge
available actions (which buttons render)
```

A Coin Card renderer that accepts a `CoinCardArtifact V1` must implement all
fixed properties. It may accept `theme` tokens for variable properties. It must
not accept or apply any rendering instruction that overrides a fixed property.

This is the difference between a widget and a product. Apple did not allow
every website to redesign an iPod. A Coin Card renderer does not allow every
context to redesign a Coin Card.

---

## Mapping to existing canonical documents

This table shows how `CoinCardArtifact V1` fields map to fields in existing
contracts. Where a field already has a canonical definition, this document
inherits that definition.

| Artifact field | Corresponding canonical field | Source document |
|---|---|---|
| `identity.card_id` | `cardId` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `identity.issuer_id` | `issuerId` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `identity.environment` | `environment` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `identity.schema_version` | `schemaVersion` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `lifecycle_reference.manifest_id` | `manifestId` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `lifecycle_reference.revision` | `revision` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `lifecycle_reference.previous_manifest_id` | `previousManifestId` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `integrity.signature.key_id` | `keyId` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `integrity.signature.signed_at` | `signedAt` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `provenance.valid_from` | `validFrom` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `provenance.valid_until` | `validUntil` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `integrity.payload_hash` | `payloadHash` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `payment_routes[n].network` | `network` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `payment_routes[n].asset` | `asset` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `payment_routes[n].amount_policy` | `amountPolicy` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `payment_routes[n].recipient_address` | `recipient.address` | COIN_CARD_SIGNED_MANIFEST_ENVELOPE_CONTRACT_V1.md |
| `lifecycle_reference.card_status` | `cardStatus` (CARD_ACTIVE→ACTIVE etc.) | COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md |
| `lifecycle_reference.registry_id` | `registryId` | REGISTRY_MODEL.md |
| `presentation.presentation_version` | `layoutVersion` | COIN_CARD_MANIFEST_SCHEMA_V1.md |
| `integrity.artifact_hash` | `manifestHash` | COIN_CARD_MANIFEST_SCHEMA_V1.md |

**Terminology normalization:** Where the signed manifest envelope uses camelCase
(`cardId`, `manifestId`) and this document uses snake_case (`card_id`,
`manifest_id`), the canonical meaning is identical. JSON serialization of the
artifact uses camelCase to match the existing signed envelope contract.
This document uses snake_case for prose readability.

---

## V1 canonical fixture annotation

The following annotates the reference fixture at
`app-web/docs/product/coin-card/coin-card.artifact.json`. That file is the
ownership graph artifact contract (architectural graph, not product object).
The V1 product object fixture is defined below as a skeleton. A full working
fixture will be produced in the next sprint step.

```json
{
  "identity": {
    "card_id": "cc_7f3a1b2c3d4e5f6a",
    "issuer_id": "implicitex",
    "issuer_name": "ImplicitEx",
    "environment": "production",
    "handle": "alice",
    "schema_version": "coin-card-artifact.v1",
    "artifact_version": 1,
    "created_at": "2026-08-07T00:00:00.000Z"
  },
  "presentation": {
    "presentation_version": "coin-card-presentation.v1",
    "layout_id": "standard",
    "theme": null
  },
  "payment_routes": [
    {
      "route_id": "route_a1b2c3d4e5f6",
      "route_version": "coin-card-route.v1",
      "status": "ACTIVE",
      "network": {
        "chain_namespace": "eip155",
        "chain_id": 137,
        "name": "Polygon"
      },
      "asset": {
        "standard": "ERC-20",
        "contract_address": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
        "symbol": "USDC",
        "decimals": 6
      },
      "recipient_address": "0x...",
      "amount_policy": { "type": "OPEN_AMOUNT" },
      "verified_at": null,
      "verification_note": null
    }
  ],
  "verification": {
    "verification_version": "coin-card-verification.v1",
    "trust_level": "ROUTE_VERIFIED",
    "evidence_blocks": []
  },
  "capabilities": {
    "execution_rail": "implicitex_v1",
    "can_receive_payments": true,
    "can_be_embedded": true,
    "can_be_shared": true,
    "route_changes_remaining": 4,
    "fingerprint_version": "coin-card-fingerprint.v1"
  },
  "lifecycle_reference": {
    "registry_id": "implicitex-registry-v1",
    "manifest_id": "mfst_...",
    "revision": 1,
    "previous_manifest_id": null,
    "card_status": "ACTIVE",
    "entitlement_status": "ACTIVE",
    "card_status_updated_at": "2026-08-07T00:00:00.000Z",
    "entitlement_status_updated_at": "2026-08-07T00:00:00.000Z"
  },
  "integrity": {
    "fingerprint_algorithm": "sha256-canonical-json-v1",
    "artifact_hash": "sha256:...",
    "payload_hash": "sha256:...",
    "signed_fields": ["identity", "payment_routes", "capabilities.execution_rail", "capabilities.fingerprint_version", "lifecycle_reference.manifest_id", "lifecycle_reference.revision", "lifecycle_reference.previous_manifest_id", "integrity.payload_hash", "integrity.signed_fields", "integrity.signature", "provenance"],
    "signature": {
      "algorithm": "unsigned-dev",
      "key_id": null,
      "value": null,
      "signed_at": "2026-08-07T00:00:00.000Z"
    }
  },
  "provenance": {
    "issued_at": "2026-08-07T00:00:00.000Z",
    "issued_by": "implicitex",
    "generation_workflow": "coin-card-issuance-workflow.v1",
    "valid_from": "2026-08-07T00:00:00.000Z",
    "valid_until": null,
    "predecessor_artifact_hash": null
  }
}
```

---

## Amendment log

| Amendment | Date | Scope |
|---|---|---|
| V1 initial definition | 2026-08-07 | Full document: Sprint 01 invariant; four separations; eight artifact sections; immutable/mutable table; signed fields; prohibited fields; versioning; presentation contract; canonical document mapping; fixture skeleton |
