# Coin Card Data Model V1

**Status:** Ratified and closed — implementation defers to this document  
**Governing entitlement specification:** `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `b3bdc08`  
**Amended:** 2026-08-02 — eight corrections; two internal-consistency corrections; `cancellation` publication type added; `reactivation` publication type added; entitlement ref updated to `b3bdc08`; see amendment log  
**Ratified:** 2026-08-02  
**Scope:** Record definitions, state machines, invariants, field classifications,
retention rules, and entitlement-to-record mapping. Does not cover application
code, migrations, checkout UI, or workflow specifications.

---

## Governing principle

This data model implements the entitlement specification. It does not expand it.
Any field, record, or relationship that has no basis in the entitlement
specification must not appear in V1.

The entitlement specification is the authority. If a field in this document
contradicts the entitlement specification, the entitlement specification wins
and this document must be corrected.

---

## Identifier conventions

| Convention | Format | Example |
|---|---|---|
| Internal record ID | UUID v4 | `acct_01J5…` (prefixed for legibility) |
| Handle (public card slug) | 3–30 chars, `[a-z0-9-]`, no leading/trailing hyphen | `alice` |
| Polygon address | EIP-55 mixed-case checksum (42 chars, `0x`-prefixed) | `0xAbCd…` |
| Timestamps | ISO 8601 UTC, microsecond precision | `2026-08-01T14:00:00.000000Z` |
| Payment amounts | Atomic integer in the asset's base units; see §5 Payment | `1000` = $10.00 USD; `10000000` = 10.00 USDC |
| Signing input serialization | `coin-card-canonical-json.v1` as defined in `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md` | — |

Signing input serialization must use the `coin-card-canonical-json.v1` algorithm
exactly. This specifies UTF-8 encoding, no insignificant whitespace, object keys
sorted by Unicode code point, NFC string normalization, and domain-separated
SHA-256 hashing. An independent "alphabetical key order" convention must not be
introduced; all implementations share the same canonical algorithm.

All internal identifiers are prefixed with a short record-type label separated
by an underscore. The prefix is a human-readability aid, not a type system.
Storage engines treat them as opaque strings.

---

## Record catalog

| # | Record | Abbreviation | Lifetime |
|---|---|---|---|
| 1 | Account | `acct` | Until legal retention period expires |
| 2 | Coin Card | `card` | Permanent (historical identity must be preserved) |
| 3 | Wallet Route | `route` | Permanent (historical routes must be preserved) |
| 4 | Entitlement | `ent` | Permanent (governs term rights; evidence for audits) |
| 5 | Payment | `pay` | Permanent (financial record; legal retention applies) |
| 6 | Lifecycle Event | `evt` | Permanent and immutable (append-only audit log) |
| 7 | Evidence Publication | `pub` | Permanent (cryptographic artifact chain) |
| 8 | Suspension/Review Case | `case` | Permanent (suspension is auditable) |

No record in this model is ever hard-deleted in production. Soft-delete via
tombstone status is the maximum permitted operation. See §8 (Retention).

---

## 1. Account

**Purpose:** Represents the customer. Owns Coin Cards and holds credentials.
The Account is the authorization boundary for all customer-initiated operations.

### Fields

| Field | Type | Immutable | Sensitive | Notes |
|---|---|---|---|---|
| `account_id` | UUID | ✓ | — | Primary key |
| `email` | string | — | ✓ | Registered contact; secondary credential |
| `email_verified_at` | timestamp\|null | — | — | Null until email verified |
| `status` | enum | — | — | `active`, `suspended`, `closed` |
| `created_at` | timestamp | ✓ | — | Account creation time |
| `closed_at` | timestamp\|null | — | — | Set when account is closed |

### Credential stack (child records, not inline fields)

Credentials are stored as child records of Account, not as inline fields, so
the stack can be extended without altering the Account schema.

| Credential type | Record | Field | Notes |
|---|---|---|---|
| Primary (SIWE) | `AccountCredential` | `wallet_address` (EIP-55) | One or more wallet addresses may be registered |
| Secondary | `AccountCredential` | `email` | Mirrors Account.email; verified separately |
| Recovery | `AccountRecoveryCode` | `code_hash` (bcrypt) | 8 codes generated at card activation; one-time use |

Recovery codes are generated per Coin Card activation event, not per Account.
Each code is stored as a salted hash. Plaintext is shown once at generation
and never retrievable. Consumed codes are marked `used_at` rather than deleted.

### Cardinality

- One Account may own multiple Coin Cards historically.
- Pilot constraint: one active entitlement per Account (enforced at application
  layer, not schema). This constraint is pilot-specific and may be relaxed.

### Authorization boundary

An Account may only initiate operations on Coin Cards where
`CoinCard.account_id = account_id`. Administrative operations require an
operator identity distinct from the customer Account.

---

## 2. Coin Card

**Purpose:** Permanent identity record for a card. The handle is the public
identifier. This record exists for as long as historical traceability is
required — it is not deleted when the entitlement expires.

### Fields

| Field | Type | Immutable | Public | Signing input | Notes |
|---|---|---|---|---|---|
| `card_id` | UUID | ✓ | — | ✓ | Primary key |
| `account_id` | UUID | ✓ | — | — | FK → Account; owner; never transferred |
| `handle` | string | ✓ | ✓ | ✓ | Public slug; set at card creation; never changed |
| `public_url` | string | ✓ | ✓ | ✓ | `https://coincard.click/<handle>` |
| `created_at` | timestamp | ✓ | — | ✓ | Card identity created |
| `first_activated_at` | timestamp\|null | — | — | — | Set when first entitlement activates |
| `active_entitlement_id` | UUID\|null | — | — | — | Concurrency guard: FK → active Entitlement; null when no entitlement is active |
| `active_entitlement_version` | integer | — | — | — | Concurrency guard: monotonically incrementing version; used for compare-and-swap on activation |

### What is NOT on this record

- **Status** — derived from Entitlement and SuspensionCase (see §Derived Status)
- **Recipient address** — belongs to WalletRoute
- **Term dates** — belong to Entitlement
- **Payment reference** — belongs to Entitlement → Payment
- **Active entitlement pointer** is a private operational concurrency guard, not a stored status and not a signing input. Derived card status is still computed from Entitlement and SuspensionCase records, not from this pointer.

### Derived status

The card's operational status is computed from related records. It is never
stored on the CoinCard record. Derivation algorithm (evaluated in order):

```
1. If any Entitlement for this card has status = 'revoked':         → REVOKED
2. If an open SuspensionCase exists for this card:                  → SUSPENDED
3. If any Entitlement has status = 'active':                        → ACTIVE
4. If any Entitlement has status = 'expired':                       → EXPIRED
5. If all Entitlements have status = 'cancelled' or none exist:     → NEVER_ACTIVATED
```

The derived status must match the most recently published signed registry
record. A mismatch is a process failure requiring immediate publication of an
updated signed record (see §7 Evidence Publication).

### Execution eligibility (derived; never stored)

Execution eligibility governs whether the card may authorize a payment transfer.
It is derived and never stored on any record:

```
execution_eligible = (Entitlement.status = 'active')
                   AND (no open SuspensionCase for this card)
```

An `EXPIRED` card is **not execution-eligible**, regardless of whether the
30-day grace period is still active. The grace period reserves the card
identifier and configuration for renewal. It does not grant any additional
period of payment execution. A route associated with an expired entitlement
is retained as historical information only and must not be presented as an
active, executable route.

### Concurrency guard: active_entitlement_id and active_entitlement_version

`active_entitlement_id` and `active_entitlement_version` are the canonical
implementation of the exactly-one-active-entitlement invariant (see
Transactional invariants §3).

**Activation transaction sequence:**

1. Read the CoinCard; capture `active_entitlement_version` as `expected_version`.
2. Verify `active_entitlement_id` is null or references an Entitlement in a
   terminal status (`expired`, `revoked`, `cancelled`).
3. Activate the new Entitlement (set `status = 'active'`, `activated_at`).
4. Set `CoinCard.active_entitlement_id` to the new entitlement's ID.
5. Increment `CoinCard.active_entitlement_version` (expected_version + 1).
6. Advance the corresponding EvidencePublication to `activated`.
7. Write the `entitlement_activated` LifecycleEvent.
8. Commit atomically. If `active_entitlement_version` does not match
   `expected_version` at commit time, the transaction must fail and roll back.
   A concurrent activation will have already incremented the version; the
   second attempt detects the mismatch and fails cleanly.

**Termination transaction** (expiration, revocation, cancellation):

1. Clear `active_entitlement_id` to null.
2. Increment `active_entitlement_version`.
3. Set the Entitlement to its terminal status.
4. Write the corresponding LifecycleEvent and EvidencePublication in the
   same atomic commit.

**Renewal:**

The termination sequence for the expiring Entitlement and the activation
sequence for the renewing Entitlement may be chained, but must both complete
atomically. The Coin Card identity (`card_id`, `handle`) does not change.
`active_entitlement_version` is incremented at least once for the termination
and once for the activation (or twice in a combined transaction — the exact
increment count is an implementation detail; monotonic increase is the invariant).

**Scope:**

`active_entitlement_id` and `active_entitlement_version` are private operational
fields. They are not public, not signing inputs, and not part of the derived
card status. If the pointer is inconsistent with the authoritative Entitlement
records, the Entitlement records govern.

### Invariants

- `handle` is set once at creation. It is never updated, transferred, or
  reassigned to a different `card_id`.
- `account_id` is set once. Ownership does not transfer.
- A CoinCard record is never deleted. After expiration or revocation, it
  transitions to a non-executable state but remains historically identifiable.
- `active_entitlement_id`, when non-null, must reference an Entitlement
  belonging to the same Coin Card with `status = 'active'`. A non-null pointer
  to a non-active Entitlement is a data integrity violation.
- `active_entitlement_version` starts at 0 and increments only; it is never
  decremented or reset.

---

## 3. Wallet Route

**Purpose:** Records the customer's designated Polygon USDC recipient address.
A route change supersedes the current route and creates a new record. The
Coin Card identity does not change on a route change.

### Fields

| Field | Type | Immutable | Public | Signing input | Notes |
|---|---|---|---|---|---|
| `route_id` | UUID | ✓ | — | ✓ | Primary key |
| `card_id` | UUID | ✓ | — | ✓ | FK → CoinCard |
| `entitlement_id` | UUID | ✓ | — | ✓ | FK → Entitlement; which term authorized this route |
| `recipient_address` | string | ✓ | ✓ | ✓ | EIP-55 Polygon USDC address |
| `route_sequence` | integer | ✓ | — | ✓ | 1-based within the entitlement; max 4 |
| `status` | enum | — | — | — | `active`, `superseded` |
| `created_at` | timestamp | ✓ | — | ✓ | Route created |
| `activated_at` | timestamp\|null | — | — | — | Route became the active route |
| `superseded_at` | timestamp\|null | — | — | — | Set when a newer route is activated |

### Cardinality

- Exactly one WalletRoute per card has `status = 'active'` at any moment
  when the card has an active entitlement.
- The most recently active WalletRoute remains `status = 'active'` after
  entitlement expiration. The `active` status reflects designation ("this was
  the last-configured route"), not execution eligibility. Execution eligibility
  is governed by the entitlement, not the route status. A route associated
  with an expired or revoked entitlement must not be treated as executable.
- Multiple WalletRoutes may exist per card (historical record of all routes).
- A route is created for the initial activation and for each subsequent
  route change.

### Route-change counter

`route_sequence` starts at 1 for the initial activation route. Each route
change within the same entitlement increments the sequence. The application
enforces `route_sequence ≤ Entitlement.route_changes_allowed` (4). The schema
records the sequence; the limit is enforced at the application layer.

### Invariants

- A WalletRoute is never deleted.
- `recipient_address` is immutable once set. A correction requires creating a
  new WalletRoute and superseding the incorrect one; the incorrect route is
  retained for audit.
- `superseded_at` is set exactly once, when a newer route is activated.
- A route cannot be reactivated after supersession.

---

## 4. Entitlement

**Purpose:** Governs the customer's operational rights for a specific term.
An Entitlement has a start (activation), an end (expiration date), and a
lifecycle that can be interrupted by revocation or cancellation. Renewal
creates a new Entitlement record; it does not update an existing one.

### Fields

| Field | Type | Immutable | Notes |
|---|---|---|---|
| `entitlement_id` | UUID | ✓ | Primary key |
| `card_id` | UUID | ✓ | FK → CoinCard |
| `account_id` | UUID | ✓ | FK → Account; denormalized for query efficiency |
| `payment_id` | UUID | ✓ | FK → Payment; what authorized this entitlement |
| `status` | enum | — | `pending_activation`, `active`, `expired`, `revoked`, `cancelled` |
| `term_months` | integer | ✓ | 12 in V1; immutable once set |
| `route_changes_allowed` | integer | ✓ | 4 in V1; immutable once set |
| `route_changes_used` | integer | — | Incremented on each route change; never decremented |
| `created_at` | timestamp | ✓ | Entitlement record created |
| `activated_at` | timestamp\|null | — | Set when provisioning completes; term begins here |
| `expires_at` | timestamp\|null | — | `activated_at + term_months`; set at activation |
| `grace_period_ends_at` | timestamp\|null | — | `expires_at + 30 days`; set at expiration |
| `cancelled_at` | timestamp\|null | — | Set if customer cancels or refunded |
| `revoked_at` | timestamp\|null | — | Set if operator revokes |
| `provisioning_deadline` | timestamp | ✓ | `Payment.confirmed_at + 24h`; set at entitlement creation |
| `provisioning_extension_agreed_at` | timestamp\|null | — | Set if customer explicitly agrees to extension |

### State-transition table

| From | To | Trigger | Creates lifecycle event |
|---|---|---|---|
| `pending_activation` | `active` | Provisioning complete (first signed package published) | `entitlement_activated` |
| `pending_activation` | `cancelled` | Refund initiated (SLA breach or customer request within 30 days) | `entitlement_cancelled` |
| `active` | `expired` | `NOW() >= expires_at` | `entitlement_expired` |
| `active` | `revoked` | Operator action following suspension resolution | `entitlement_revoked` |
| `active` | `cancelled` | Customer cancellation request | `entitlement_cancelled`; EvidencePublication type `cancellation` |
| `expired` | `active` | Renewal (new Entitlement; NOT a transition on this record) | — |

Note: Suspension does not change Entitlement status. Suspension is represented
by an open SuspensionCase. The Entitlement remains `active` during suspension;
only the derived card status becomes `SUSPENDED`.

### Provisioning SLA enforcement

The `provisioning_deadline` field is the actionable field for the 24-hour SLA.
A system process evaluates `NOW() > provisioning_deadline` for all
`pending_activation` entitlements without a `provisioning_extension_agreed_at`.
When the deadline passes without activation:

1. A `provisioning_sla_breach` lifecycle event is written.
2. ImplicitEx must either record a `provisioning_extension_agreed_at` (from
   explicit customer agreement) or initiate a refund (transition to `cancelled`).

### Invariants

- An Entitlement in `pending_activation` without `provisioning_extension_agreed_at`
  must be resolved (activated or cancelled) within 24 hours of
  `Payment.confirmed_at`.
- `activated_at` is set exactly once.
- `expires_at` is set at activation and is not modified by route changes.
- `route_changes_used` is never decremented; if it reaches
  `route_changes_allowed`, no further route changes are permitted for this term.
- Only one Entitlement per card may have `status = 'active'` at any time.
  (Pilot: enforced at application layer.)
- Renewal creates a new Entitlement record. The prior Entitlement retains its
  terminal status (`expired`).

---

## 5. Payment

**Purpose:** Records the financial transaction that authorized an Entitlement.
Payment evidence is not entitlement status — a confirmed payment is a
prerequisite for activation, not synonymous with it.

### Fields

| Field | Type | Immutable | Sensitive | Notes |
|---|---|---|---|---|
| `payment_id` | UUID | ✓ | — | Primary key |
| `account_id` | UUID | ✓ | — | FK → Account |
| `entitlement_id` | UUID\|null | — | — | FK → Entitlement; set when entitlement is created |
| `payment_asset` | enum | ✓ | — | `USD` or `USDC`; governs interpretation of `amount_atomic` |
| `amount_atomic` | integer | ✓ | — | Amount in asset base units; 1000 for $10.00 USD; 10000000 for 10.00 USDC |
| `asset_decimals` | integer | ✓ | — | 2 for USD; 6 for USDC |
| `payment_rail` | enum | ✓ | — | `stripe_usd`, `polygon_usdc`; governs what `provider_payment_id` means |
| `network_chain_id` | integer\|null | ✓ | — | Null for `stripe_usd`; 137 for Polygon mainnet; 80002 for Amoy testnet |
| `network_tx_hash` | string\|null | ✓ | — | Null for `stripe_usd`; on-chain transaction hash for `polygon_usdc` |
| `provider_payment_id` | string | ✓ | ✓ | External reference: Stripe charge ID for `stripe_usd`; transaction hash or receipt ID for `polygon_usdc` |
| `status` | enum | — | — | `pending`, `confirmed`, `refunded`, `failed` |
| `created_at` | timestamp | ✓ | — | Payment record created |
| `confirmed_at` | timestamp\|null | — | — | Set on payment confirmation; starts provisioning clock |
| `refunded_at` | timestamp\|null | — | — | Set when refund is confirmed |
| `refund_reason` | enum\|null | — | — | `provisioning_sla_breach`, `customer_request`, `operator_initiated` |
| `refund_initiated_at` | timestamp\|null | — | — | When ImplicitEx initiated the refund process |

### Amount representation

The `payment_asset` + `amount_atomic` + `asset_decimals` triplet represents the
payment amount exactly without conflating wire formats:

| payment_asset | amount_atomic | asset_decimals | Human value |
|---|---|---|---|
| `USD` | 1000 | 2 | $10.00 USD |
| `USDC` | 10000000 | 6 | 10.000000 USDC |

Both represent the expected $10 pilot price. `amount_atomic` is always a safe
integer. Floating-point representations are prohibited. The `asset_decimals`
field is recorded at payment time and must not be derived later from the asset
name alone, because future asset versions may differ.

### State-transition table

| From | To | Trigger |
|---|---|---|
| `pending` | `confirmed` | Payment provider confirms receipt |
| `pending` | `failed` | Payment provider rejects or times out |
| `confirmed` | `refunded` | Refund confirmed by payment provider |

### Relationship to Entitlement

- One Payment produces at most one Entitlement. A failed payment produces no
  Entitlement.
- `Payment.confirmed_at` is the reference point for the 24-hour provisioning
  SLA. `Entitlement.provisioning_deadline = Payment.confirmed_at + 24h`.
- `refund_initiated_at` is recorded when ImplicitEx acts — before the refund
  is confirmed by the payment provider. This documents that ImplicitEx
  discharged its proactive obligation.

### Invariants

- A Payment is never deleted.
- `confirmed_at` is set exactly once.
- `payment_asset`, `amount_atomic`, `asset_decimals`, `payment_rail`, and
  `network_chain_id` are immutable once set. Corrections require creating a new
  Payment record linked by a lifecycle event, not mutating the existing record.
- A Payment with `status = 'confirmed'` and no associated Entitlement within
  24 hours of `confirmed_at` is an SLA breach requiring operator action.

---

## 6. Lifecycle Event

**Purpose:** Immutable, append-only audit log of every state-changing operation.
Every status transition on any record produces a LifecycleEvent. LifecycleEvents
are never updated or deleted.

### Fields

| Field | Type | Immutable | Notes |
|---|---|---|---|
| `event_id` | UUID | ✓ | Primary key |
| `card_id` | UUID | ✓ | FK → CoinCard; always present |
| `entitlement_id` | UUID\|null | ✓ | FK → Entitlement; null for pre-entitlement events |
| `event_type` | enum | ✓ | See event type table below |
| `occurred_at` | timestamp | ✓ | Wall-clock time of the event |
| `actor_type` | enum | ✓ | `customer`, `operator`, `system` |
| `actor_id` | string\|null | ✓ | Account ID, operator ID, or `system` |
| `metadata` | JSON | ✓ | Event-specific structured data; schema per event_type |

### Event type catalog

| Event type | Trigger | Required metadata fields |
|---|---|---|
| `card_created` | CoinCard record created | `handle`, `account_id` |
| `entitlement_created` | Entitlement record created | `entitlement_id`, `payment_id` |
| `provisioning_started` | Provisioning pipeline begins | `provisioning_deadline` |
| `provisioning_completed` | First signed package published | `publication_id`, `activated_at` |
| `provisioning_sla_breach` | Deadline passed without activation | `provisioning_deadline`, `elapsed_seconds` |
| `provisioning_extension_agreed` | Customer explicitly agrees to extension | `new_deadline` |
| `entitlement_activated` | Entitlement transitions to `active` (renewal or initial) | `activated_at`, `expires_at` |
| `entitlement_reactivated` | Post-grace reactivation activates | `activated_at`, `expires_at`, `prior_entitlement_id`, `prior_publication_id` |
| `entitlement_expired` | Entitlement transitions to `expired` | `expired_at`, `grace_period_ends_at` |
| `entitlement_revoked` | Entitlement transitions to `revoked` | `case_id`, `reason` |
| `entitlement_cancelled` | Entitlement transitions to `cancelled` | `cancellation_reason`, `refund_initiated` |
| `route_changed` | New WalletRoute activated | `route_id`, `route_sequence`, `recipient_address` |
| `suspended` | SuspensionCase opened | `case_id`, `reason`, `deadline` |
| `suspension_extended` | SuspensionCase extended | `case_id`, `extension_deadline`, `extension_reason` |
| `suspension_deadline_breached` | Effective deadline passed without resolution | `case_id`, `deadline_breached_at`, `process_failure_code` |
| `restored` | SuspensionCase resolved: restoration | `case_id` |
| `publication_abandoned` | EvidencePublication abandoned before activation | `publication_id`, `publication_stage_at_abandonment`, `reason` |
| `grace_period_started` | 30-day grace begins after expiration | `grace_period_ends_at` |
| `grace_period_ended` | 30-day grace expires | — |
| `payment_confirmed` | Payment.confirmed_at set | `payment_id`, `confirmed_at` |
| `refund_initiated` | ImplicitEx initiates refund | `payment_id`, `refund_reason` |
| `refund_confirmed` | Payment provider confirms refund | `payment_id`, `refunded_at` |
| `renewal_notice_sent` | 30-day renewal notice delivered | `expires_at`, `notice_channel` |
| `customer_notice_sent` | Customer notified of suspension | `case_id`, `notice_channel` |
| `cancellation_requested` | Customer requests deactivation | — |

### Invariants

- LifecycleEvent records are never updated or deleted.
- Every state change on Account, CoinCard, Entitlement, Payment, WalletRoute,
  and SuspensionCase must produce a LifecycleEvent before the change is committed.
  (Event-first: write the event, then the state change, in the same transaction.)
- `occurred_at` is the authoritative record of when something happened.
  Application timestamps are secondary.

---

## 7. Evidence Publication

**Purpose:** Records each signing and publication event that produces a
cryptographically verifiable card artifact. The chain of Evidence Publications
is the signed audit trail required by §9 of the entitlement specification.

### Publication state sequence

Each EvidencePublication progresses through four stages before it becomes
authoritative. The stage is tracked in `publication_stage`:

```
PREPARED → SIGNED → PUBLISHED → ACTIVATED
```

| Stage | Meaning | External compensation required | Internal audit trace required |
|---|---|---|---|
| `prepared` | Signing input set assembled; not yet signed | No — artifact not externally delivered | Yes — record retained; `publication_abandoned` event written |
| `signed` | Signature computed; artifact not yet externally published | No — signed bytes not publicly delivered | Yes — record retained; `publication_abandoned` event written |
| `published` | Artifact delivered to public storage; not yet activating state change | Yes — compensating public publication required | Yes |
| `activated` | Corresponding state change committed; this publication is authoritative | No | — |
| `abandoned` | Transitioned from `prepared` or `signed` before publication | No external compensation | Yes — EvidencePublication record retained permanently; `publication_abandoned` lifecycle event records publication ID, stage at abandonment, timestamp, and reason |

A `prepared` or `signed` publication may transition to `abandoned` without
issuing a compensating public publication, because no artifact was externally
delivered and no external party can have retrieved it. However, the
EvidencePublication record is not deleted and a `publication_abandoned`
lifecycle event is required in both cases. The absence of external compensation
does not mean the absence of an internal audit record.

A `published` artifact that fails to activate (e.g., state change commit fails
after the artifact has been delivered to public storage) must be treated
differently: external parties may have already retrieved it. The activation
must be retried. If retry is not possible, a compensating public publication
explicitly marking the prior artifact as non-authoritative must be issued
before any other state transition proceeds. The abandoned record is retained.

### Fields

| Field | Type | Immutable | Public | Signing input | Notes |
|---|---|---|---|---|---|
| `publication_id` | UUID | ✓ | — | — | Primary key |
| `card_id` | UUID | ✓ | — | ✓ | FK → CoinCard |
| `entitlement_id` | UUID | ✓ | — | ✓ | FK → Entitlement |
| `route_id` | UUID | ✓ | — | ✓ | FK → WalletRoute; route in effect at publication |
| `publication_type` | enum | ✓ | — | ✓ | `initial_activation`, `route_change`, `renewal`, `reactivation`, `expiration`, `cancellation`, `suspension`, `restoration`, `revocation` |
| `publication_stage` | enum | — | — | — | `prepared`, `signed`, `published`, `activated`, `abandoned`; not in signing input |
| `published_at` | timestamp\|null | — | ✓ | ✓ | Set when stage reaches `published`; in signing input once set |
| `activated_at` | timestamp\|null | — | — | — | Set when stage reaches `activated`; operational metadata |
| `manifest_version` | string | ✓ | ✓ | ✓ | Version of the signing schema used |
| `signing_key_id` | string | ✓ | ✓ | — | Identifies the public key used; not the key itself |
| `asset_hashes` | JSON | ✓ | ✓ | ✓ | SHA-256 hashes of each signed asset file |
| `lifecycle_bundle_hash` | string | ✓ | ✓ | ✓ | Hash of the published lifecycle bundle |
| `registry_record_hash` | string | ✓ | ✓ | ✓ | Hash of the published registry record |
| `card_status_at_publication` | enum | ✓ | ✓ | ✓ | Derived card status at the moment of signing |
| `cancellation_reason` | enum\|null | ✓ | ✓ | ✓ | `customer_requested` when `publication_type = 'cancellation'`; null otherwise |
| `cancellation_effective_at` | timestamp\|null | ✓ | ✓ | ✓ | Set when `publication_type = 'cancellation'`; null otherwise |
| `reactivation_prior_entitlement_id` | UUID\|null | ✓ | ✓ | ✓ | FK → prior expired Entitlement; set when `publication_type = 'reactivation'`; null otherwise |
| `reactivation_effective_at` | timestamp\|null | ✓ | ✓ | ✓ | Set when `publication_type = 'reactivation'`; null otherwise |
| `reactivation_prior_publication_id` | UUID\|null | ✓ | ✓ | ✓ | FK → last activated EvidencePublication of the prior term; set when `publication_type = 'reactivation'`; null otherwise |
| `signature` | string | ✓ | ✓ | — | Signature over the canonical signing input set |
| `prior_publication_id` | UUID\|null | ✓ | ✓ | ✓ | FK → prior EvidencePublication; forms a chain |

### Signing input set

The fields marked `Signing input = ✓` above are serialized using
`coin-card-canonical-json.v1` (see Identifier conventions) and signed. The
signature covers the complete serialized object. Any field not in the signing
input set is operational metadata only and does not affect verifiability.
`publication_stage` and `activated_at` are operational metadata and are
not part of the signing input.

### Publication triggers

A new EvidencePublication must be created whenever the card's authoritative
signed state changes:

| Trigger | publication_type |
|---|---|
| First provisioning complete | `initial_activation` |
| Route change activated | `route_change` |
| Entitlement renewal activates (active term or grace period) | `renewal` |
| Post-grace reactivation activates | `reactivation` |
| Entitlement expires (natural) | `expiration` |
| Customer-requested cancellation | `cancellation` |
| Suspension case opened | `suspension` |
| Suspension resolved (restored) | `restoration` |
| Entitlement revoked | `revocation` |

**`reactivation` vs `renewal`:** Post-grace reactivation is explicitly
distinct from renewal in the signed evidence chain. A verifier must be able to
distinguish renewal (active term or grace) from reactivation (after grace)
without relying on unsigned operational metadata. The `reactivation` publication
type carries three additional signing inputs: `reactivation_prior_entitlement_id`,
`reactivation_effective_at`, and `reactivation_prior_publication_id`. These
fields provide a cryptographically verifiable link between the new term and the
prior evidence chain.

**`cancellation` vs `expiration`:** A customer-requested cancellation must use
`publication_type = 'cancellation'`, not `expiration`, even though the resulting
`card_status_at_publication` is `EXPIRED` in both cases. This preserves cause
distinguishability in the signed evidence chain. The signing input set includes
the `publication_type` field; a verifier can distinguish cancellation from
natural expiration without any runtime dependency on ImplicitEx.

The `cancellation` publication's signing input set must also include:
- `cancellation_reason`: `customer_requested` (the only valid value in V1)
- `cancellation_effective_at`: the timestamp the cancellation took effect

### Invariants

- EvidencePublication records are never updated or deleted. Once written, only
  `publication_stage`, `published_at`, and `activated_at` may advance (forward
  only); all other fields are immutable.
- `prior_publication_id` creates a linked chain. The first publication for a
  card has `prior_publication_id = null`. Every subsequent publication chains
  to the immediately prior one.
- The most recent EvidencePublication with `publication_stage = 'activated'` is
  the authoritative signed state. The derived card status must match
  `card_status_at_publication` of that record. A mismatch triggers immediate
  re-publication.
- A state change that requires a new EvidencePublication (see §Transactional
  invariants) may not commit until that publication has reached the `published`
  stage. The state change is committed when, and only when, the publication
  reaches `activated`.
- An `abandoned` publication must have a lifecycle event recording the
  abandonment reason.

---

## 8. Suspension/Review Case

**Purpose:** Represents a single open or resolved suspension investigation.
Every suspension event corresponds to exactly one SuspensionCase. The Case
records the reason, deadline, customer notices, and resolution.

### Fields

| Field | Type | Immutable | Notes |
|---|---|---|---|
| `case_id` | UUID | ✓ | Primary key |
| `card_id` | UUID | ✓ | FK → CoinCard |
| `entitlement_id` | UUID | ✓ | FK → Entitlement active at time of suspension |
| `status` | enum | — | `open`, `resolved_restored`, `resolved_revoked`, `resolved_expired`, `resolved_extended` |
| `initiated_at` | timestamp | ✓ | Suspension begins |
| `initiated_by` | string | ✓ | Operator ID |
| `reason` | string | ✓ | Stated reason for suspension |
| `deadline` | timestamp | ✓ | `initiated_at + 7 calendar days` |
| `customer_notice_sent_at` | timestamp\|null | — | Set when notice is delivered to customer |
| `customer_notice_channel` | string\|null | — | How the customer was notified |
| `extension_deadline` | timestamp\|null | — | `deadline + 7 calendar days`; null until extended |
| `extension_reason` | string\|null | — | Required if extended |
| `extension_notice_sent_at` | timestamp\|null | — | Set when extension notice is delivered |
| `deadline_breached_at` | timestamp\|null | — | Set when effective deadline passes with no resolution; the card remains suspended |
| `escalated_at` | timestamp\|null | — | Set when the breach is recorded as an escalation requiring immediate operator action |
| `process_failure_code` | string\|null | — | Machine-readable code written at escalation (e.g., `deadline_7d_no_action`, `deadline_14d_no_action`) |
| `resolution` | enum\|null | — | `restored`, `revoked`, `expired` |
| `resolved_at` | timestamp\|null | — | Set when case receives a valid customer disposition |
| `resolved_by` | string\|null | — | Operator ID |
| `resolution_notes` | string\|null | — | Operator notes on resolution decision |

### State-transition table

| From | To | Trigger | Constraint |
|---|---|---|---|
| `open` | `resolved_restored` | Operator restores card | `resolved_at` may be after deadline; escalation fields record the breach |
| `open` | `resolved_revoked` | Operator revokes card | `resolved_at` may be after deadline; escalation fields record the breach |
| `open` | `resolved_expired` | Entitlement expires during suspension | Entitlement.expired_at occurs while case is open |
| `open` | `resolved_extended` | Extension recorded | `extension_deadline` set; notice sent to customer; at most once |
| `resolved_extended` | `resolved_restored` | Operator restores after extension | `resolved_at` may be after extension_deadline; escalation fields record any breach |
| `resolved_extended` | `resolved_revoked` | Operator revokes after extension | As above |
| `resolved_extended` | `resolved_expired` | Entitlement expires during extended suspension | Entitlement.expired_at occurs while case is resolved_extended |

A case that has passed its effective deadline (`deadline` if not extended;
`extension_deadline` if extended) without resolution does **not** transition to a
new status. The case retains its current unresolved status (`open` or
`resolved_extended`). The breach is recorded by setting `deadline_breached_at`,
`escalated_at`, and `process_failure_code` — and by writing a
`suspension_deadline_breached` lifecycle event — without changing the case status.
The card remains `SUSPENDED`. The case must ultimately receive a valid customer
disposition: restoration, revocation, or expiration.

### Cardinality

- At most one SuspensionCase with `status = 'open'` or `status = 'resolved_extended'`
  per card at any time.
- Historical cases (resolved) accumulate; multiple cases per card are expected
  across the card's lifetime.

### Fourteen-day absolute ceiling

A monitoring process detects when a case has passed its effective deadline
(the later of `deadline` or `extension_deadline`) without a valid resolution.
When detected, the monitor:

1. Sets `deadline_breached_at` and `escalated_at`.
2. Sets `process_failure_code` (e.g., `deadline_7d_no_action`, `deadline_14d_no_action`).
3. Writes a `suspension_deadline_breached` lifecycle event.

The case status does **not** change. The card remains `SUSPENDED`. This is an
operational escalation condition requiring immediate operator action, not a
valid disposition of the customer's card. The case must still receive one of the
valid terminal resolutions (`resolved_restored`, `resolved_revoked`,
`resolved_expired`). The breach record is evidence that the process failed; it
does not substitute for the missing resolution.

### Invariants

- A SuspensionCase record is never deleted.
- `deadline = initiated_at + 7 calendar days` (exact); immutable.
- `extension_deadline = deadline + 7 calendar days` (exact) when set; immutable.
- `extension_reason` must be non-null and non-empty before `extension_deadline`
  is set. Extension is permitted at most once.
- `customer_notice_sent_at` must be set within the same transaction that
  opens the case. A suspension without customer notice is incomplete.
- `resolution_notes` is required for `resolved_revoked`; recommended for all
  resolutions.
- `deadline_breached_at` and `escalated_at` may be set on an unresolved case
  without changing its status.
- `resolution` values are `restored`, `revoked`, `expired` only. `extended` is
  a case status, not a terminal resolution.

---

## State-transition summary

### Entitlement status

```
pending_activation ──(provisioning complete)──► active ──(NOW >= expires_at)──► expired
       │                                           │
       │(SLA breach + refund initiated)            │(operator revokes)
       ▼                                           ▼
   cancelled                                   revoked
       ▲
       │(customer cancels within 30 days)
    active ──────────────────────────────────────────────────────────► cancelled
```

### Derived card status (precedence order)

```
Entitlement.status = 'revoked'            → REVOKED   (permanent)
Open SuspensionCase exists                → SUSPENDED  (temporary)
Entitlement.status = 'active'             → ACTIVE
Entitlement.status = 'expired'            → EXPIRED
No Entitlement or all cancelled           → NEVER_ACTIVATED
```

### WalletRoute status

```
active ──(new route activated on same card)──► superseded
```

A route can only be superseded, never reactivated.

### Derived card status during grace period

```
Entitlement.status = 'expired' AND NOW() ≤ grace_period_ends_at  → EXPIRED (non-executable)
Entitlement.status = 'expired' AND NOW() > grace_period_ends_at  → EXPIRED (non-executable)
```

The grace period does not change the derived status or restore execution.
`EXPIRED` is `EXPIRED` throughout and after the grace period. Execution requires
`Entitlement.status = 'active'`.

### SuspensionCase status (see §8 for full table)

```
open ──(7 days, resolved)──► resolved_restored | resolved_revoked | resolved_expired
open ──(extension recorded)──► resolved_extended ──(7 more days, resolved)──► resolved_restored | resolved_revoked | resolved_expired
open or resolved_extended ──(deadline passed, unresolved)──► [same status; deadline_breached_at + escalated_at set; escalation event written]
```

A breach does not produce a new status. The case remains `open` or `resolved_extended`
until a valid terminal resolution is recorded.

---

## Field classifications

### Immutable fields

Set once at record creation. Never updated. Any apparent correction requires
creating a new record (with an audit trail linking to the prior one) rather
than mutating the existing field.

`account_id`, `card_id`, `handle`, `public_url`, `card.created_at`,
`route_id`, `route.recipient_address`, `route.route_sequence`, `route.card_id`,
`route.entitlement_id`, `entitlement_id`, `entitlement.card_id`,
`entitlement.account_id`, `entitlement.payment_id`, `entitlement.term_months`,
`entitlement.route_changes_allowed`, `entitlement.provisioning_deadline`,
`payment_id`, `payment.payment_asset`, `payment.amount_atomic`,
`payment.asset_decimals`, `payment.payment_rail`, `payment.network_chain_id`,
`payment.network_tx_hash`, `payment.provider_payment_id`,
`payment.confirmed_at`, `event_id`, all LifecycleEvent fields,
`publication_id`, `publication.card_id`, `publication.entitlement_id`,
`publication.route_id`, `publication.publication_type`,
`publication.manifest_version`, `publication.signing_key_id`,
`publication.asset_hashes`, `publication.lifecycle_bundle_hash`,
`publication.registry_record_hash`, `publication.card_status_at_publication`,
`publication.cancellation_reason`, `publication.cancellation_effective_at`,
`publication.reactivation_prior_entitlement_id`, `publication.reactivation_effective_at`,
`publication.reactivation_prior_publication_id`,
`publication.signature`, `publication.prior_publication_id`,
`case_id`, `case.initiated_at`, `case.initiated_by`, `case.reason`,
`case.deadline`

### Mutable fields

| Field | Permitted mutations |
|---|---|
| `card.active_entitlement_id` | Set to entitlement ID on activation; cleared to null on termination |
| `card.active_entitlement_version` | Increment only; never decremented |
| `entitlement.status` | Forward state transitions only (no rollback) |
| `entitlement.route_changes_used` | Increment only |
| `entitlement.activated_at` | Set once (null → timestamp) |
| `entitlement.expires_at` | Set once at activation |
| `entitlement.grace_period_ends_at` | Set once at expiration |
| `entitlement.cancelled_at` | Set once |
| `entitlement.revoked_at` | Set once |
| `entitlement.provisioning_extension_agreed_at` | Set once |
| `payment.status` | Forward state transitions only |
| `payment.refunded_at` | Set once |
| `payment.refund_reason` | Set once |
| `payment.refund_initiated_at` | Set once |
| `route.status` | `active` → `superseded` only |
| `route.superseded_at` | Set once |
| `case.status` | Forward state transitions only |
| `case.customer_notice_sent_at` | Set once |
| `case.extension_deadline` | Set once |
| `case.extension_reason` | Set once |
| `case.extension_notice_sent_at` | Set once |
| `case.resolution` | Set once |
| `case.resolved_at` | Set once |
| `case.resolved_by` | Set once |
| `case.resolution_notes` | Set once |
| `case.deadline_breached_at` | Set once; set when deadline passes without resolution |
| `case.escalated_at` | Set once |
| `case.process_failure_code` | Set once |
| `publication.publication_stage` | Forward only: prepared → signed → published → activated (or abandoned) |
| `publication.published_at` | Set once when stage reaches `published` |
| `publication.activated_at` | Set once when stage reaches `activated` |
| `account.status` | Operator-controlled |
| `account.email_verified_at` | Set once |

### Derived fields (never stored on primary records)

- Derived card status (computed from Entitlement + SuspensionCase)
- Execution eligibility: `Entitlement.status = 'active'` AND no open SuspensionCase
- Provisioning SLA breach flag (`NOW() > entitlement.provisioning_deadline` without activation)
- Grace period active flag (`entitlement.expires_at ≤ NOW() ≤ entitlement.grace_period_ends_at`); grace period activity does not affect execution eligibility
- Renewal notice due flag (`NOW() ≥ entitlement.expires_at - 30 days` and notice not yet sent)
- Suspension deadline breach flag (`NOW() > effective case deadline` with no resolution and `deadline_breached_at` not yet set)
- `route_changes_remaining = route_changes_allowed - route_changes_used`

### Sensitive fields (access-controlled; not logged in plaintext)

`account.email`, `AccountCredential.wallet_address` (pseudonymous but linked to
identity), `AccountRecoveryCode.code_hash`, `case.resolution_notes` (may contain
security investigation details), `Payment.provider_payment_id` (external reference
that enables financial lookups)

### Public fields (accessible without authentication)

`card.handle`, `card.public_url`, `route.recipient_address` (active route only),
`EvidencePublication.published_at`, `EvidencePublication.manifest_version`,
`EvidencePublication.asset_hashes`, `EvidencePublication.signature`,
`EvidencePublication.signing_key_id`, `EvidencePublication.card_status_at_publication`,
derived card status

### Signing inputs

All fields on EvidencePublication marked `Signing input = ✓` in §7.

---

## Transactional invariants

The following invariants must hold atomically. A partial write that violates
any invariant must be rolled back.

1. **Event-first:** A LifecycleEvent record must be written in the same
   transaction as the state change it records. No state change without an event.

2. **Exactly-one-active-route:** At most one WalletRoute per card may have
   `status = 'active'`. Activating a new route and superseding the prior route
   are a single atomic operation.

3. **Exactly-one-active-entitlement:** At most one Entitlement per card may
   have `status = 'active'` at any time. This invariant is enforced by the
   `CoinCard.active_entitlement_version` compare-and-swap (see §2 Coin Card,
   Concurrency guard). Activation reads the current version, proceeds only if
   it matches the expected value, and increments the version in the same atomic
   commit. Two concurrent activation attempts using the same expected version
   will produce exactly one successful commit; the other will detect a version
   mismatch and roll back.

4. **Provisioning-before-activation:** `Entitlement.activated_at` may not be
   set unless the corresponding EvidencePublication of type `initial_activation`
   has reached `publication_stage = 'published'` first.

5. **Publication-stage-before-state-change:** A state change that requires a
   new EvidencePublication (see §7) may not be committed until the publication
   has reached `publication_stage = 'published'`. The state change and the
   `publication_stage` advance to `activated` are a single atomic commit.
   Failure modes:
   - Signing fails (`prepared` → `signed` fails): transition publication to
     `abandoned`; write `publication_abandoned` event; state change does not
     proceed; no public compensation required; retry from `prepared`.
   - Publication fails (`signed` → `published` fails): signed bytes not yet
     externally delivered; transition publication to `abandoned`; write
     `publication_abandoned` event; no public compensation required; retry
     from `prepared`.
   - Activation commit fails after publication (`published` → `activated` fails
     or state change commit fails): artifact is externally visible and may have
     been retrieved. Retry the activation commit. If retry is not possible,
     issue a compensating public publication marking the prior artifact as
     non-authoritative, then write `publication_abandoned` event, before any
     other state transition proceeds.

6. **Suspension-with-notice:** A SuspensionCase cannot be created without
   simultaneously recording `customer_notice_sent_at`. Notice and suspension
   are atomic.

7. **No-rollback-on-status:** State machines advance only. An Entitlement that
   has reached `active` cannot return to `pending_activation`. A route that is
   `superseded` cannot return to `active`.

8. **Route-change-within-term:** A WalletRoute may only be created against an
   Entitlement with `status = 'active'` and `route_changes_used < route_changes_allowed`.

9. **Payment-before-entitlement:** An Entitlement may not be created without a
   corresponding Payment with `status = 'confirmed'`.

10. **Non-custody assertion:** No field in V1 may store a private key, wallet
    seed, or any value that would give ImplicitEx control over a customer's funds.
    This is a schema-level constraint enforced at review time.

---

## Failure and rollback behavior

| Failure | Expected behavior |
|---|---|
| Payment provider confirms payment but entitlement creation fails | Payment record exists with `status = 'confirmed'`; retry creates entitlement; idempotency on `provider_payment_id` |
| Provisioning pipeline fails after entitlement created | `pending_activation` remains; SLA clock runs; operator retries or initiates refund before deadline |
| EvidencePublication signing fails during route change (`prepared`→`signed`) | Transition record to `abandoned`; write `publication_abandoned` event; route change rolls back; prior route remains active; `route_changes_used` not incremented; no public compensation required |
| EvidencePublication publish fails during route change (`signed`→`published`) | Signed bytes not yet externally delivered; transition record to `abandoned`; write `publication_abandoned` event; no public compensation required; retry from `prepared` |
| EvidencePublication activation commit fails after publication (`published`→`activated`) | Artifact is externally visible; retry activation commit; if retry impossible, write `publication_abandoned` event and issue compensating publication |
| SuspensionCase creation fails after card marked suspended in UI | Suspension is not complete; rollback UI state; no customer notice sent; retry cleanly |
| Process monitors fail to fire deadline checks | Manual operator sweep is the fallback; deadlines are stored in records and queryable independently of monitors |

---

## 8. Retention and tombstone rules

No record in V1 is hard-deleted. The following rules apply:

| Record | Tombstone mechanism | Retention category |
|---|---|---|
| Account | `status = 'closed'`; sensitive fields subject to policy redaction | See retention policy note below |
| CoinCard | No deletion; `handle`, `card_id`, `public_url`, `created_at` are permanent | Permanent (identity fields); operational fields subject to policy |
| WalletRoute | No deletion; `superseded` routes are historical evidence | Permanent (addresses and sequences as cryptographic evidence) |
| Entitlement | No deletion; terminal status is the tombstone | Permanent (governs term rights and audit) |
| Payment | No deletion; financial record | Subject to retention policy (see note) |
| LifecycleEvent | No deletion, no mutation | Permanent (event type, timestamps, and non-sensitive metadata are permanent evidence) |
| EvidencePublication | No deletion; `publication_stage`, `published_at`, `activated_at` may advance | Permanent (all signing inputs and hashes are permanent evidence) |
| SuspensionCase | No deletion; case ID, timestamps, and resolution are permanent | Permanent (identifiers, deadlines, breach timestamps, and resolution); sensitive notes subject to policy |

### What "permanent" means

"Permanent" applies to immutable cryptographic artifacts, lifecycle identifiers,
state-change timestamps, hashes, signatures, publication references, and other
evidence required to preserve historical truth and verify signed artifacts.
These may never be deleted or redacted.

"Permanent" does not automatically extend to every field on every record.
Sensitive operational content — including email addresses, support correspondence,
notice bodies, and resolution notes — may be redacted or deleted under a
policy-governed retention schedule, provided the non-sensitive audit markers
(IDs, timestamps, event types, hashes) are preserved.

### Retention policy note

Specific retention periods for Account sensitive fields and Payment records
(e.g., a 7-year financial record minimum) require separate founder ratification
and a documented policy basis reflecting applicable jurisdiction. This data model
establishes the structural categories; it does not ratify specific minimum
periods. Until ratification, the operating default is: retain all records
without deletion; do not zero sensitive fields without explicit policy
authorization.

"Zeroing" sensitive fields on account closure means replacing their values with
a structured null marker (`[REDACTED_AT: <timestamp>]`) rather than SQL NULL,
so the field's prior existence is preserved for audit without retaining personal
data beyond an approved retention period.

---

## 9. Public-record versus private operational-data boundaries

### Public (no authentication required)

The following are accessible by any party given the card's public URL or handle:

- `CoinCard.handle`, `CoinCard.public_url`
- `WalletRoute.recipient_address` (only when card is `ACTIVE`; historical address shown as non-executable when card is `EXPIRED` or `SUSPENDED`; not presented when card is `REVOKED`)
- Derived card status (`ACTIVE`, `EXPIRED`, `REVOKED`, `SUSPENDED`)
- `EvidencePublication`: `published_at`, `manifest_version`, `asset_hashes`,
  `signature`, `signing_key_id`, `card_status_at_publication`

### Customer-accessible (authentication required)

- All public fields for the customer's own card
- `Entitlement`: `status`, `activated_at`, `expires_at`, `route_changes_used`,
  `route_changes_allowed`, `grace_period_ends_at`
- `Payment`: `payment_asset`, `amount_atomic`, `asset_decimals`, `payment_rail`, `status`, `confirmed_at`
- Historical WalletRoute records for the customer's own card
- LifecycleEvents for the customer's own card (excluding operator metadata)
- `SuspensionCase`: `reason`, `deadline`, `status`, `resolution` (for the
  customer's own card)

### Operator-accessible only

- All fields on all records
- Sensitive fields (email, wallet addresses of other customers)
- `case.resolution_notes`
- `case.initiated_by`, `case.resolved_by`
- Internal monitoring and process-failure records

---

## 10. Entitlement specification to record mapping

| Entitlement requirement | Implementing record(s) and fields |
|---|---|
| $10 for the first year (USD) | `Payment.payment_asset = 'USD'`, `Payment.amount_atomic = 1000`, `Payment.asset_decimals = 2`, `Payment.payment_rail = 'stripe_usd'` |
| $10 equivalent via USDC | `Payment.payment_asset = 'USDC'`, `Payment.amount_atomic = 10000000`, `Payment.asset_decimals = 6`, `Payment.payment_rail = 'polygon_usdc'` |
| One card per customer (pilot) | Application constraint: one `active` Entitlement per Account |
| Unique handle | `CoinCard.handle`; uniqueness constraint at storage layer |
| Public URL | `CoinCard.public_url` = `https://coincard.click/{handle}` |
| One active Polygon USDC route | `WalletRoute` with `status = 'active'` |
| Registry-backed status | Derived card status; published in `EvidencePublication.card_status_at_publication` |
| Signed lifecycle evidence | `EvidencePublication`; full chain via `prior_publication_id` |
| Integrity evidence | `EvidencePublication.asset_hashes`, `signature` |
| Customer-controlled route updates | `WalletRoute` (new record per change); authenticated by Account credentials |
| 4 route changes per term | `Entitlement.route_changes_allowed = 4`, `route_changes_used` incremented; `WalletRoute.route_sequence ≤ 4` |
| Term begins at activation | `Entitlement.activated_at`; set only when provisioning complete |
| 24-hour provisioning SLA | `Entitlement.provisioning_deadline = Payment.confirmed_at + 24h`; `provisioning_sla_breach` lifecycle event; `refund_initiated_at` on Payment |
| Non-transferable | `CoinCard.account_id` immutable |
| No custody | Schema non-custody assertion (invariant 10) |
| 30-day refund window | `Payment.confirmed_at + 30 days`; `refund_reason = 'customer_request'` |
| Proactive refund on SLA breach | `Payment.refund_initiated_at` set by system; customer not required to request |
| Provisioning extension with customer agreement | `Entitlement.provisioning_extension_agreed_at`; `provisioning_extension_agreed` lifecycle event |
| Renewal notice 30 days before expiration | `renewal_notice_sent` lifecycle event; `Entitlement.expires_at - 30 days` derivation |
| No automatic renewal (pilot) | No auto-renewal field or trigger exists in V1 schema |
| 30-day grace period after expiration | `Entitlement.grace_period_ends_at = expires_at + 30 days`; `grace_period_started` and `grace_period_ended` lifecycle events; card remains `EXPIRED` and non-executable; grace reserves the identifier for renewal |
| Post-grace reactivation | New `Entitlement` + new `WalletRoute` + `EvidencePublication.publication_type = 'reactivation'` with `reactivation_prior_entitlement_id`, `reactivation_effective_at`, `reactivation_prior_publication_id` as signing inputs; `entitlement_reactivated` lifecycle event; card identity (handle, card_id) preserved |
| Customer-requested cancellation | `Entitlement.status = 'cancelled'`; `EvidencePublication.publication_type = 'cancellation'`; `cancellation_reason = 'customer_requested'`; `cancellation_effective_at` in signing input; distinct from natural expiration in signed evidence |
| Slug not immediately reassigned | `CoinCard.handle` is immutable and bound to `card_id` permanently; no reassignment mechanism in V1 |
| 7-day suspension review | `SuspensionCase.deadline = initiated_at + 7 days` |
| Single 7-day extension maximum | `SuspensionCase.extension_deadline = deadline + 7 days`; set at most once |
| 14-day absolute suspension ceiling | `SuspensionCase.deadline_breached_at`, `escalated_at`, `process_failure_code`; `suspension_deadline_breached` lifecycle event; case status does not change; card remains `SUSPENDED`; breach is an escalation condition requiring operator action, not a valid customer disposition |
| Customer notice on suspension | `SuspensionCase.customer_notice_sent_at`; atomic with case creation |
| Extension notice to customer | `SuspensionCase.extension_notice_sent_at` |
| Suspension publicly visible | Derived card status = `SUSPENDED` when open SuspensionCase exists; included in signed registry record |
| Revocation distinguishable from expiration | `Entitlement.status = 'revoked'` vs `'expired'`; distinct `entitlement_revoked` vs `entitlement_expired` lifecycle events |
| Every state change creates an event | Transactional invariant 1 (event-first) |
| SIWE + email + 8 recovery codes | `AccountCredential` records (wallet, email); `AccountRecoveryCode` (8 records per activation) |
| Pilot success criteria — customer notices | `renewal_notice_sent`, `customer_notice_sent` lifecycle events; auditable |
| Evidence independent of ImplicitEx availability | `EvidencePublication.signature` + `asset_hashes` verifiable with public key; no ImplicitEx runtime dependency |

---

## Amendment log

### 2026-08-02 — Eight corrections applied

**A1 — Expiration grace correction (material policy)**
The original document incorrectly stated that routes continue to resolve as
active executable routes during the 30-day grace period. Corrected to match the
governing entitlement specification: execution is disabled at expiration; the
grace period reserves the card identifier and configuration for renewal only. A
new `execution_eligible` derived field documents the rule explicitly. WalletRoute
cardinality note updated to distinguish designation from execution eligibility.
Public boundary updated to reflect non-executable historical display during grace.
Mapping table corrected.

**A2 — Payment amount model generalized (two rails)**
Replaced `amount_cents` (USD-only integer cents) and `currency` with a five-field
asset representation: `payment_asset`, `amount_atomic`, `asset_decimals`,
`payment_rail`, `network_chain_id`, `network_tx_hash`. Supports both Stripe USD
(`stripe_usd`) and native USDC (`polygon_usdc`) without conflating wire formats.
Mapping table updated with both rail representations.

**A3 — Active entitlement invariant strengthened (concurrency)**
Invariant 3 (exactly-one-active-entitlement) previously said "pilot enforcement"
without specifying mechanism. Strengthened to require transactional enforcement
via a canonical active-entitlement guard record or compare-and-swap. Two
concurrent activation attempts must not succeed.

**A4 — Publication state sequence added**
Added explicit `PREPARED → SIGNED → PUBLISHED → ACTIVATED` stage model to
EvidencePublication. Added `publication_stage`, `published_at`, and `activated_at`
fields. Invariant 5 rewritten to distinguish the three failure modes: signing
failure (safe to abandon), publish failure (safe to abandon before delivery),
and activation failure after public delivery (requires retry or compensating
publication). `publication_abandoned` lifecycle event added.

**A5 — process_failure removed as terminal case status**
`process_failure` removed from the SuspensionCase `status` enum. A deadline
breach is an operational escalation condition, not a valid customer disposition.
Added `deadline_breached_at`, `escalated_at`, and `process_failure_code` fields
to record the breach without changing the case status. `suspension_deadline_breached`
lifecycle event added. The case must still receive a valid resolution.
Mapping table corrected.

**A6 — Retention scope narrowed**
"Permanent" is now defined to cover immutable cryptographic evidence, identifiers,
timestamps, hashes, and signatures. Sensitive operational content (email, notice
bodies, support notes) is permitted to be policy-governed with selective redaction,
provided non-sensitive audit markers are preserved. Specific retention periods
(e.g., 7-year financial minimum) removed — these require separate founder
ratification and documented policy basis. Operating default: retain without
deletion until policy is ratified.

**A7 — Signing primitive references canonical algorithm**
The identifier convention for signing input serialization now references
`coin-card-canonical-json.v1` as defined in
`COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`.
The informal "alphabetical key order, no trailing whitespace" description is
replaced with the complete canonical algorithm specification. EvidencePublication
signing input section updated to match.

**A8 — Documentation path confirmed**
Both the entitlement specification and the data model are in
`app-web/docs/product/coin-card/`. The `docs/product/coin-card/` tree contains
implementation contracts (lifecycle, signing, verification) but not the
governing product specifications. The two trees are structurally distinct and
no duplication exists. Both governing documents are in the same canonical
location.

### 2026-08-02 — Two internal-consistency corrections (ratification commit)

**A9 — Canonical active-entitlement guard defined on CoinCard**
Invariant 3 previously named the mechanism ("dedicated lock record or
compare-and-swap") without identifying a concrete data-model element. Added
`active_entitlement_id` (UUID|null) and `active_entitlement_version` (integer)
as mutable operational fields on CoinCard. Added full activation, termination,
and renewal transaction sequences. Added CoinCard invariants for the guard.
Updated transactional invariant 3 to reference these fields by name. Updated
the mutable field classification. These are private operational fields: not
public, not signing inputs, not part of derived card status.

**A12 — `reactivation` publication type added; governing entitlement ref updated**
Post-grace reactivation is explicitly distinct from renewal in the signed
evidence chain per the governing entitlement specification. Added `reactivation`
to `EvidencePublication.publication_type` enum. Added three signing input fields:
`reactivation_prior_entitlement_id`, `reactivation_effective_at`,
`reactivation_prior_publication_id`. Added `entitlement_reactivated` lifecycle
event. Updated: field table, publication trigger table (with distinguishability
rationale), lifecycle-event catalog, immutable field list, mapping table.
Governing entitlement specification reference updated from `67f4755` to
`b3bdc08` (current ratified state). Resolves evidence-consistency gap in
`COIN_CARD_CUSTOMER_WORKFLOWS_V1.md` §5.5a.

**A11 — `cancellation` publication type added**
Customer-requested cancellation must not masquerade as natural expiration in
the signed evidence chain. Added `cancellation` to `EvidencePublication.publication_type`
enum. A cancellation publication produces `card_status_at_publication = EXPIRED`
but carries `cancellation_reason = 'customer_requested'` and
`cancellation_effective_at` as signing inputs. These fields are null for all
other publication types. Updated: field table, signing input notes, publication
trigger table (with distinguishability rationale), entitlement state-transition
table, immutable field list, and entitlement-to-record mapping. Resolves GD-2
from `COIN_CARD_CUSTOMER_WORKFLOWS_V1.md`.

**A10 — "Abandon without trace" corrected**
The publication stage table incorrectly stated that a `prepared` publication
could be abandoned "without trace." Corrected: `prepared` and `signed`
publications may be abandoned without a compensating *public* publication
(no external artifact was delivered), but they require an internal audit trace:
the EvidencePublication record is retained permanently and a
`publication_abandoned` lifecycle event is written in both cases. Updated the
stage table, surrounding prose, transactional invariant 5 failure modes, and
the failure-and-rollback behavior table to state the distinction consistently.
