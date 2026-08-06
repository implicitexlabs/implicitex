# Coin Card Data Model V1

**Status:** Ratified and closed — implementation defers to this document  
**Governing entitlement specification:** `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `b3bdc08`  
**Amended:** 2026-08-02 — eight corrections; two internal-consistency corrections; `cancellation` publication type added; `reactivation` publication type added; entitlement ref updated to `b3bdc08`; see amendment log  
**Amended:** 2026-08-02 — four new records added (PurchaseAttempt, PaymentRefund, PaymentDispute, ExternalEventReceipt); payment-provider identifier mapping and purchase-flow audit support; meta-section numbering corrected to avoid collision with record sections; see amendment log
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
| 5 | Payment | `pay` | Permanent (financial record; operational retention policy applies — see §13) |
| 6 | Lifecycle Event | `evt` | Permanent and immutable (append-only audit log) |
| 7 | Evidence Publication | `pub` | Permanent (cryptographic artifact chain) |
| 8 | Suspension/Review Case | `case` | Permanent (suspension is auditable) |
| 9 | Purchase Attempt | `attempt` | Permanent (purchase-flow audit; idempotency anchor) |
| 10 | Payment Refund | `refund` | Permanent (financial record; retention policy applies — see §13) |
| 11 | Payment Dispute | `dispute` | Permanent (provider dispute record; retention policy applies — see §13) |
| 12 | External Event Receipt | `receipt` | Permanent (webhook idempotency and audit) |

No record in this model is ever hard-deleted in production. Soft-delete via
tombstone status is the maximum permitted operation. See §13 (Retention).

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
| `pending_activation` | `cancelled` | Any of: customer request; provisioning SLA breach; post-payment operator decline; post-payment predicate failure; customer provisioning failure | `entitlement_cancelled` (no cancellation EvidencePublication — see §EvidencePublication boundary) |
| `active` | `expired` | `NOW() >= expires_at` | `entitlement_expired` |
| `active` | `revoked` | Operator action following suspension resolution | `entitlement_revoked` |
| `active` | `cancelled` | Customer cancellation request; `cancellation_reason = 'customer_requested'` | `entitlement_cancelled`; EvidencePublication type `cancellation` |
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
| `provider_payment_id` | string | ✓ | ✓ | External reference: Stripe PaymentIntent ID for `stripe_usd`; transaction hash or receipt ID for `polygon_usdc` |
| `status` | enum | — | — | `pending`, `confirmed`, `refunded`, `failed` |
| `created_at` | timestamp | ✓ | — | Payment record created |
| `confirmed_at` | timestamp\|null | — | — | Set on payment confirmation; starts provisioning clock |
| `failed_at` | timestamp\|null | — | — | Null until `Payment.status` reaches `failed`; set exactly once on `pending → failed`; immutable once set; not used for refund failure (`PaymentRefund.failed_at` is separate) |
| `refunded_at` | timestamp\|null | — | — | Set when cumulative succeeded PaymentRefund amounts equal `amount_atomic` |

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
- Each refund operation records its initiation in `PaymentRefund.initiated_at`. The corresponding `refund_initiated` LifecycleEvent is the immutable evidence that ImplicitEx discharged its proactive obligation for that operation.

### Invariants

- A Payment is never deleted.
- `confirmed_at` is set exactly once.
- `failed_at` is set exactly once when `Payment.status` transitions to `failed`.
  It is immutable once set.
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
| `entitlement_cancelled` | Entitlement transitions to `cancelled` | `cancellation_reason`, `payment_refund_id` |
| `route_changed` | New WalletRoute activated | `route_id`, `route_sequence`, `recipient_address` |
| `suspended` | SuspensionCase opened | `case_id`, `reason`, `deadline` |
| `suspension_extended` | SuspensionCase extended | `case_id`, `extension_deadline`, `extension_reason` |
| `suspension_deadline_breached` | Effective deadline passed without resolution | `case_id`, `deadline_breached_at`, `process_failure_code` |
| `restored` | SuspensionCase resolved: restoration | `case_id` |
| `publication_abandoned` | EvidencePublication abandoned before activation | `publication_id`, `publication_stage_at_abandonment`, `reason` |
| `grace_period_started` | 30-day grace begins after expiration | `grace_period_ends_at` |
| `grace_period_ended` | 30-day grace expires | — |
| `payment_confirmed` | Payment.confirmed_at set | `payment_id`, `confirmed_at` |
| `refund_initiated` | ImplicitEx initiates refund | `payment_id`, `payment_refund_id`, `refund_reason` — copied from `PaymentRefund.reason_code` for the PaymentRefund identified by `payment_refund_id`; immutable snapshot of that operation's ground |
| `refund_confirmed` | Payment provider confirms refund (one per succeeded PaymentRefund) | `payment_id`, `payment_refund_id`, `refunded_at` |
| `renewal_notice_sent` | 30-day renewal notice delivered | `expires_at`, `notice_channel` |
| `customer_notice_sent` | Customer notified of suspension | `case_id`, `notice_channel` |
| `cancellation_requested` | Customer requests deactivation | — |

### Invariants

- LifecycleEvent records are never updated or deleted.
- Coin Card lifecycle mutations — state changes on CoinCard, Entitlement,
  WalletRoute, and SuspensionCase — must produce a LifecycleEvent in the same
  transaction as the change. (Event-first: write the event, then the state
  change, atomically.)
- Payment produces `payment_confirmed` on confirmation. PaymentRefund produces
  `refund_initiated` when ImplicitEx initiates a refund and `refund_confirmed`
  exactly once when that refund succeeds. Intermediate provider status updates
  on PaymentRefund (e.g., `pending` → `requires_action`) do not produce
  additional LifecycleEvents.
- PurchaseAttempt, PaymentDispute, and ExternalEventReceipt are operational
  audit records. Their own immutable identifiers, timestamps, and provider
  references preserve their history. They do not produce LifecycleEvents except
  where a Coin Card lifecycle event (e.g., `payment_confirmed`, `refund_initiated`,
  `entitlement_activated`) is independently required.
- `occurred_at` is the authoritative record of when a Coin Card lifecycle event
  happened. Application timestamps are secondary.

### `entitlement_cancelled` payload specification

`cancellation_reason` is required; its value must come from the Entitlement-cancellation reason catalog below.

`payment_refund_id` is a nullable FK to the specific PaymentRefund associated with this cancellation.

**Nullability rule:** `payment_refund_id` is null only when the governing cancellation operation determines that **no refund is due** for this cancellation. It is not null because a refund has not yet been initiated, because the provider has not yet confirmed, or because operator action is pending. The immutable `entitlement_cancelled` event must carry the final value at write time; no backfill or mutation is permitted.

When a refund is required by the governing cancellation ground:

- The PaymentRefund must be created before or atomically with the `entitlement_cancelled` LifecycleEvent.
- `payment_refund_id` must reference that specific PaymentRefund at event creation.
- The corresponding `refund_initiated` LifecycleEvent must already exist or be committed atomically in the same cancellation operation.
- Provider submission and provider confirmation are not prerequisites for populating this field. Creation of the canonical PaymentRefund is the prerequisite.

When non-null:
- The referenced PaymentRefund must belong to the Payment associated with this Entitlement.
- Its `reason_code` must be compatible with the cancellation ground (see compatibility table below).

The following are **not** valid null cases: refund is due but awaiting operator action; refund is expected later; provider submission has not occurred; provider confirmation is pending.

The explicit V1 null case: customer-requested cancellation (`cancellation_reason = 'customer_requested'`) that occurs outside the applicable refund window — no refund is due, so `payment_refund_id = null`.

Do not add a replacement boolean such as `has_refund`, `refund_required`, or `refund_pending`. The nullable canonical FK expresses the relationship.

**Refund-link requirement by cancellation ground:**

This table governs the Entitlement-cancellation operation only. It does not mean that every occurrence of a similarly named business failure necessarily has an Entitlement to cancel.

| `cancellation_reason` | `payment_refund_id` in V1 |
|---|---|
| `customer_requested` | Non-null when the applicable refund policy grants a refund; null when no refund is due (e.g., cancellation outside the 30-day refund window) |
| `provisioning_sla_breach` | Required, non-null |
| `post_payment_operator_decline` | Required, non-null |
| `post_payment_predicate_failure` | Required, non-null when a paid operation created an Entitlement that is being cancelled |
| `customer_provisioning_failure` | Required, non-null |

**No-placeholder-Entitlement invariant:**

`entitlement_cancelled` is written only when an Entitlement record already exists and actually transitions from `pending_activation` or `active` to `cancelled`. A post-payment failure detected before an Entitlement is created follows its refund and reconciliation path without creating a placeholder Entitlement. The system must never create a `pending_activation` Entitlement solely to transition it immediately to `cancelled` or to produce the `entitlement_cancelled` event. The five pending-activation grounds in the state-transition table describe allowed causes of that transition when a `pending_activation` Entitlement already exists; they do not require Entitlement creation.

`entitlement_cancelled` is **not** written for:
- Natural expiration — uses `entitlement_expired`
- Revocation for cause — uses `entitlement_revoked`
- Duplicate-payment refund where the valid Entitlement is unaffected
- Payment confirmed after an already-expired PurchaseAttempt where no Entitlement was created
- Post-payment failure detected before an Entitlement was created in provisioning Phase 4
- Provider refund success by itself

### Entitlement-cancellation reason catalog

`cancellation_reason` must be a value from this ratified catalog. These values are distinct from `PaymentRefund.reason_code`; do not copy values between catalogs.

| `cancellation_reason` | Governing ground |
|---|---|
| `customer_requested` | The customer requested cancellation of an active or pending-activation Entitlement |
| `provisioning_sla_breach` | The provisioning deadline elapsed without successful activation |
| `post_payment_operator_decline` | An authorized post-payment AUP or operator decision declined the purchase or provisioning operation |
| `post_payment_predicate_failure` | A required post-payment purchase or provisioning predicate failed |
| `customer_provisioning_failure` | The customer did not provide a required valid provisioning prerequisite within the governing window |

### Entitlement-cancellation reason and PaymentRefund compatibility

These catalogs are related but not identical. The Entitlement cancellation reason describes why the Entitlement was cancelled. The PaymentRefund reason describes why that financial operation exists. `PaymentRefund.initiated_by` identifies the system or operator that created the PaymentRefund.

| `entitlement_cancelled.cancellation_reason` | Compatible `PaymentRefund.reason_code` |
|---|---|
| `customer_requested` | `customer_request` |
| `provisioning_sla_breach` | `provisioning_sla_breach` |
| `post_payment_operator_decline` | `operator_initiated` |
| `post_payment_predicate_failure` | `post_payment_predicate_failure` |
| `customer_provisioning_failure` | `customer_provisioning_failure` |

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
| Customer-requested cancellation of an **active** Entitlement | `cancellation` |
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

**EvidencePublication boundary — cancellation:**

- **Active customer cancellation** (`active → cancelled`): Create and activate `EvidencePublication.publication_type = 'cancellation'`. Signing fields: `cancellation_reason = 'customer_requested'`; `cancellation_effective_at = Entitlement.cancelled_at`. This signed publication rule is independent of whether a refund was issued.

- **Pending-activation cancellation** (`pending_activation → cancelled`): Do not create or activate a cancellation EvidencePublication. The Entitlement never reached active public status; no authoritative signed state change exists for the card. Any existing `PREPARED` or `SIGNED` but unactivated EvidencePublication follows the existing `abandoned` audit rules. Operational cancellation is preserved by `Entitlement.status = 'cancelled'` and the `entitlement_cancelled` LifecycleEvent only. `EvidencePublication.cancellation_reason = 'customer_requested'` remains its sole V1 signed value and is not broadened to cover operational grounds.

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

## 9. Purchase Attempt

**Purpose:** Records the full lifecycle of a customer's attempt to acquire a
Coin Card entitlement, from eligibility screening through checkout completion.
PurchaseAttempt is the authoritative purchase-flow audit record. It reserves the
requested handle for the duration of the checkout window and serves as the
idempotency anchor for the checkout-to-payment pipeline.

### Fields

| Field | Type | Immutable | Sensitive | Notes |
|---|---|---|---|---|
| `purchase_attempt_id` | UUID | ✓ | — | Primary key |
| `account_id` | UUID | ✓ | — | FK → Account |
| `card_id` | UUID\|null | — | — | FK → CoinCard; write-once: null for initial purchases until provisioning creates and sets the CoinCard; must be non-null at creation for renewal and reactivation; immutable once set |
| `prior_entitlement_id` | UUID\|null | ✓ | — | FK → Entitlement; null for initial purchases; identifies the prior entitlement for renewal and reactivation |
| `purchase_type` | enum | ✓ | — | `initial_activation`, `active_term_renewal`, `grace_period_renewal`, `post_grace_reactivation` |
| `payment_rail` | enum | ✓ | — | `stripe_usd`, `polygon_usdc`; governs checkout flow |
| `quoted_asset` | enum | ✓ | — | `USD` or `USDC`; must equal the eventual `Payment.payment_asset` |
| `quoted_amount_atomic` | integer | ✓ | — | Quoted price in asset base units; must equal the eventual `Payment.amount_atomic` |
| `quoted_asset_decimals` | integer | ✓ | — | Must equal the eventual `Payment.asset_decimals` |
| `handle` | string | ✓ | — | The requested handle; immutable once set; for initial purchases the CoinCard does not yet exist when this is set |
| `status` | enum | — | — | `screening`, `eligible`, `checkout_created`, `payment_pending`, `payment_confirmed`, `expired`, `cancelled`, `declined`, `completed` |
| `reserved_at` | timestamp\|null | — | — | Server-authoritative timestamp when the handle reservation was established |
| `reserved_until` | timestamp\|null | — | — | Server-authoritative handle reservation expiry; set when checkout is created; not controlled by webhook delivery |
| `checkout_session_id` | string\|null | — | ✓ | Payment provider checkout session ID; set at most once; immutable once set; one PurchaseAttempt owns at most one checkout session; a replacement session requires a new PurchaseAttempt; null for `polygon_usdc` |
| `expected_sender_address` | string\|null | ✓ | ✓ | Null for `stripe_usd`; required before `checkout_created` for `polygon_usdc`; the Polygon wallet address (EIP-55) authorized as the expected source of the purchase transfer; server-authoritative; must be compared using canonical normalized-address rules; must not be inferred from transient browser or wallet session state |
| `expected_recipient_address` | string\|null | ✓ | — | Null for `stripe_usd`; required before `checkout_created` for `polygon_usdc`; immutable snapshot of the ImplicitEx payment-collection address (EIP-55) presented for this attempt; a later system payment-address rotation does not change an existing attempt; must not refer to `WalletRoute.recipient_address` |
| `expected_token_address` | string\|null | ✓ | — | Null for `stripe_usd`; required before `checkout_created` for `polygon_usdc`; immutable snapshot of the exact Polygon-native USDC token contract address (EIP-55) accepted for this attempt; `quoted_asset = 'USDC'` does not replace verification of this exact contract address; bridged or otherwise noncanonical USDC token contracts do not satisfy the attempt |
| `payment_id` | UUID\|null | — | — | FK → Payment; set when the Payment record is created; not updated thereafter |
| `livemode` | boolean | ✓ | — | True for production provider sessions; false for test mode |
| `created_at` | timestamp | ✓ | — | Attempt record created |
| `completed_at` | timestamp\|null | — | — | Set when the entitlement is provisioned and activated; PurchaseAttempt observes the provisioning result |
| `expired_at` | timestamp\|null | — | — | Set when `reserved_until` elapses without payment confirmation |
| `cancelled_at` | timestamp\|null | — | — | Set when attempt is cancelled |
| `failure_code` | string\|null | — | — | Machine-readable reason when status is `declined` or `expired` with a notable condition; see failure codes below |

### Status definitions

| Status | Meaning |
|---|---|
| `screening` | Eligibility check in progress |
| `eligible` | Screening passed; customer may proceed to checkout |
| `checkout_created` | Checkout session created; handle reserved until `reserved_until` |
| `payment_pending` | Payment being processed by provider |
| `payment_confirmed` | Payment confirmed; provisioning underway |
| `expired` | Reservation window elapsed; handle released from active reservation |
| `cancelled` | Customer abandoned checkout or operator cancelled |
| `declined` | Eligibility screening failed; entitlement denied; immutable administration evidence |
| `completed` | Provisioning complete; PurchaseAttempt observes the final activated state |

### State-transition table

| From | To | Trigger | Creates Coin Card LifecycleEvent |
|---|---|---|---|
| `screening` | `eligible` | Eligibility check passes | — |
| `screening` | `declined` | Eligibility screening fails | — |
| `eligible` | `checkout_created` | Checkout session created | — |
| `eligible` | `cancelled` | Customer abandons or operator cancels | — |
| `checkout_created` | `payment_pending` | Provider acknowledges payment intent | — |
| `checkout_created` | `expired` | `NOW() > reserved_until` | — |
| `checkout_created` | `cancelled` | Customer abandons or operator cancels | — |
| `payment_pending` | `checkout_created` | Provider payment attempt fails; Checkout Session and reservation remain active | — |
| `payment_pending` | `payment_confirmed` | Provider confirms payment | `payment_confirmed` |
| `payment_pending` | `expired` | `NOW() > reserved_until` | — |
| `payment_confirmed` | `completed` | Provisioning pipeline completes; see provisioning events below | — |

A pre-payment eligibility decline is immutable administration evidence recorded
in PurchaseAttempt. It is not a Coin Card LifecycleEvent. PurchaseAttempt
expiration is recorded by PurchaseAttempt field state; it is not a Coin Card
LifecycleEvent.

**Payment failure within an active session:** A provider payment failure event
(e.g., `payment_intent.payment_failed`) within an active checkout session is not
a terminal failure for the PurchaseAttempt. The attempt transitions from
`payment_pending` back to `checkout_created`. The Checkout Session and handle
reservation remain active and the customer may provide another payment method
or retry. The attempt moves to `expired` only when `reserved_until` elapses.
This transition produces no Coin Card LifecycleEvent.

**Provisioning events (written by provisioning pipeline, not by PurchaseAttempt):**
Provisioning writes the appropriate existing Coin Card LifecycleEvent:

| purchase_type | Provisioning LifecycleEvent |
|---|---|
| `initial_activation` | `entitlement_activated` |
| `active_term_renewal` | `entitlement_activated` |
| `grace_period_renewal` | `entitlement_activated` |
| `post_grace_reactivation` | `entitlement_reactivated` |

PurchaseAttempt observes the completed provisioning result and then transitions
to `completed`. PurchaseAttempt completion does not itself emit a LifecycleEvent.

### Polygon-USDC checkout anchor

For `payment_rail = 'polygon_usdc'`:

- `checkout_session_id` remains null. No provider-managed checkout session is
  created. The PurchaseAttempt itself is the checkout intent and reservation
  anchor.
- No transaction hash is stored on the PurchaseAttempt. The hash is stored on
  Payment at submission time.
- The state-transition table entry "Provider acknowledges payment intent"
  (`checkout_created → payment_pending`) applies to `stripe_usd`. For
  `polygon_usdc`, the equivalent trigger is the customer submitting a transaction
  hash. The server resolves the submission through exactly one of the following
  two branches:

  **Branch 1 — `PurchaseAttempt.payment_id` is non-null:**

  1. Load the Payment referenced by `PurchaseAttempt.payment_id`.
  2. If the submitted `network_tx_hash` and `network_chain_id` exactly match
     that linked Payment, return the linked Payment idempotently. Do not create
     or mutate any record. Do not repeat the transition to `payment_pending`.
  3. If the submitted hash or chain differs from the linked Payment: do not
     create another standard fulfillment Payment; do not replace
     `PurchaseAttempt.payment_id`; do not overwrite either Payment identifier.
     Route the submission to reconciliation as a possible duplicate or unrelated
     payment. Do not confirm the PurchaseAttempt automatically.

  **Branch 2 — `PurchaseAttempt.payment_id` is null:**

  1. The pair `(Payment.network_tx_hash, Payment.network_chain_id)` is a
     concurrency-safe unique constraint enforced at the canonical storage level.
     It is not an application read-then-check. The storage layer permits at most
     one Payment record for any given non-null `(network_tx_hash,
     network_chain_id)` pair; a concurrent attempt to create a second Payment
     with the same key fails at the storage level regardless of application
     timing.
  2. If a Payment already exists for that key, or if the storage-level
     uniqueness constraint rejects a concurrent creation attempt: do not bind
     that existing Payment to this PurchaseAttempt; do not create another
     Payment; route the collision to reconciliation; do not transition this
     PurchaseAttempt to `payment_pending`.
  3. If no Payment exists for that key and the storage constraint is
     satisfied: create exactly one pending Payment, setting
     `Payment.account_id = PurchaseAttempt.account_id`, `network_tx_hash`,
     `provider_payment_id`, `network_chain_id`, `payment_rail`, and all other
     required canonical Payment fields. Set `PurchaseAttempt.payment_id` to the
     new Payment. Transition the PurchaseAttempt to `payment_pending`.

  The uniqueness check, Payment creation, `payment_id` assignment, and status
  transition in Branch 2 step 3 must execute as one atomic operation. No partial
  binding state is permitted. Only a newly created Payment may be assigned to a
  PurchaseAttempt whose `payment_id` is null.

- The "Payment failure within an active session" note above describes Stripe
  `payment_intent.payment_failed` behavior, in which the attempt reverts to
  `checkout_created`. For `polygon_usdc`, a terminal payment failure transitions
  `Payment.status` to `failed` and sets `Payment.failed_at`; the PurchaseAttempt
  does not revert to `checkout_created`. See "Dropped or replaced transaction"
  below.

### Payment confirmed after reservation expiry

If a payment confirmation arrives after `reserved_until` has elapsed:

- The attempt remains `expired`. The reservation is not silently recreated.
- `failure_code` is set to `PAYMENT_CONFIRMED_AFTER_EXPIRY`.
- The payment is linked to the expired attempt via `payment_id`.
- Provisioning does not proceed automatically.
- The late-payment handler must place the Payment into the established reconciliation and refund path. The ratified PaymentRefund reason code for this ground is `payment_confirmed_after_expiry` (see PaymentRefund `### Reason-code catalog`).

### Dropped or replaced transaction

If a submitted Polygon transaction is dropped, replaced, permanently reverted,
or otherwise reaches a terminal failure:

- Its pending Payment transitions to `failed` and `Payment.failed_at` is set.
- The PurchaseAttempt does not accept a replacement transaction hash.
  `PurchaseAttempt.payment_id`, `Payment.network_tx_hash`, and
  `Payment.provider_payment_id` are immutable once set.
- A replacement payment attempt requires a new PurchaseAttempt, which creates a
  new handle reservation subject to availability.
- A transaction from the failed attempt that later confirms is handled through
  the existing late-payment/reconciliation path (`failure_code =
  'PAYMENT_CONFIRMED_AFTER_EXPIRY'` if the attempt has expired; operator
  reconciliation otherwise). It does not reactivate or rewrite the failed attempt
  automatically.

### Cardinality

- `card_id` is null for `purchase_type = 'initial_activation'` until the
  CoinCard is created by provisioning.
- For renewal and reactivation, `card_id` and `prior_entitlement_id` must be
  non-null and must identify the existing card and prior entitlement.
- At most one non-terminal PurchaseAttempt may reserve the same handle at any
  time. This includes attempts where `card_id` is null. Concurrency safety is
  enforced by a normalized handle uniqueness constraint on active reservations.
- For renewal and reactivation, at most one non-terminal PurchaseAttempt may
  exist per `card_id` at any time.
- Multiple historical (terminal) attempts per card are preserved.
- A PurchaseAttempt has at most one standard fulfillment Payment. `payment_id`
  is write-once; once non-null it may not be replaced.
- Re-submission of the same transaction hash after `payment_id` is set returns
  the existing Payment idempotently without mutation.
- A different transaction hash submitted after `payment_id` is already non-null
  must not create a second Payment or overwrite `payment_id`. It is routed to
  reconciliation as a possible duplicate or unrelated payment and must not
  confirm the attempt automatically.
- A Payment already bound to another PurchaseAttempt must never be rebound. A
  transaction hash already consumed by an existing Payment record cannot satisfy
  a second PurchaseAttempt; it is routed to reconciliation.

### Invariants

- PurchaseAttempt records are never deleted.
- `handle`, `purchase_type`, `payment_rail`, `quoted_asset`,
  `quoted_amount_atomic`, `quoted_asset_decimals`, `livemode`, and `created_at`
  are immutable once set.
- `card_id` is immutable once set. For initial purchases, it remains null until
  set by provisioning; once set, it does not change.
- `checkout_session_id` is immutable once set. A replacement session requires a
  new PurchaseAttempt.
- `reserved_at` and `reserved_until` are server-authoritative; both are immutable
  once set.
- `payment_id` is set once and not updated.
- Non-null `PurchaseAttempt.payment_id` is unique across all PurchaseAttempt
  records. A Payment may be referenced by at most one PurchaseAttempt. This
  uniqueness is enforced at the canonical storage level.
- Quoted asset fields must equal the corresponding fields on the eventual Payment.
- `failure_code` is set once.
- `expected_sender_address`, `expected_recipient_address`, and
  `expected_token_address` are immutable once set. For `polygon_usdc`, all three
  must be non-null before the attempt transitions to `checkout_created`. For
  `stripe_usd`, all three must be null.

---

## 10. Payment Refund

**Purpose:** Records each refund operation against a confirmed Payment. A single
Payment may produce multiple PaymentRefund records (partial refunds are possible).
PaymentRefund is the canonical record for tracking provider refund status.
`Payment.status` transitions to `'refunded'` only when the cumulative succeeded
refund amount equals the full `Payment.amount_atomic`.

### Fields

| Field | Type | Immutable | Sensitive | Notes |
|---|---|---|---|---|
| `payment_refund_id` | UUID | ✓ | — | Primary key |
| `payment_id` | UUID | ✓ | — | FK → Payment; the payment being refunded |
| `provider` | enum | ✓ | — | `stripe`, `polygon_usdc`; must match parent Payment's rail |
| `provider_refund_id` | string\|null | — | ✓ | External refund identifier; null until the provider acknowledges and assigns an ID; immutable once set |
| `amount_atomic` | integer | ✓ | — | Refund amount in same units as `Payment.amount_atomic`; must be positive |
| `asset` | enum | ✓ | — | Must match parent `Payment.payment_asset` |
| `asset_decimals` | integer | ✓ | — | Must match parent `Payment.asset_decimals` |
| `reason_code` | string | ✓ | — | Substantive ground for this refund; must be a value from the ratified reason-code catalog (see `### Reason-code catalog` below) |
| `status` | enum | — | — | `requested`, `pending`, `requires_action`, `succeeded`, `failed`, `cancelled` |
| `initiated_at` | timestamp | ✓ | — | When ImplicitEx initiated or first recorded the refund |
| `provider_created_at` | timestamp\|null | — | — | Timestamp from the provider when the refund object was created; set on provider acknowledgement |
| `updated_at` | timestamp\|null | — | — | Last time this record was updated from a provider event |
| `confirmed_at` | timestamp\|null | — | — | Set when `status` transitions to `succeeded` |
| `failed_at` | timestamp\|null | — | — | Set when `status` transitions to `failed` |
| `failure_code` | string\|null | — | — | Provider failure code when `status = 'failed'` |
| `initiated_by` | string | ✓ | — | `system`, or operator ID; documents who initiated the refund |
| `idempotency_key` | string | ✓ | — | Unique within the provider/refund operation boundary; prevents duplicate refund submissions |
| `livemode` | boolean | ✓ | — | True for production provider sessions; false for test mode |

### Status definitions

| Status | Meaning |
|---|---|
| `requested` | ImplicitEx has initiated the refund; provider acknowledgement not yet received |
| `pending` | Provider acknowledged; funds not yet returned to customer |
| `requires_action` | Provider requires additional action to proceed |
| `succeeded` | Provider confirms funds returned; `confirmed_at` set |
| `failed` | Provider declined this refund operation; terminal for this record |
| `cancelled` | Refund cancelled before processing |

### State-transition table

| From | To |
|---|---|
| `requested` | `pending`, `requires_action`, `succeeded`, `failed`, `cancelled` |
| `pending` | `succeeded`, `failed`, `cancelled` |
| `requires_action` | `pending`, `succeeded`, `failed`, `cancelled` |

`succeeded`, `failed`, and `cancelled` are terminal. A failed refund is terminal
for that PaymentRefund record. A retry creates a new PaymentRefund operation
rather than rewriting the failed record.

### Cardinality

One-to-many with Payment. A Payment may have multiple PaymentRefund records
(partial or sequential refunds, or a retry after failure). `provider + provider_refund_id`
is unique when `provider_refund_id` is non-null.

### Reason-code catalog

`reason_code` is a required immutable string. Its value must come from this
ratified catalog. Arbitrary strings are not permitted; grounds not represented
here require a Data Model amendment before implementation.

| `reason_code` | Governing ground |
|---|---|
| `provisioning_sla_breach` | The provisioning deadline elapsed without successful activation and the governing SLA requires a refund |
| `customer_request` | The customer requested a refund or cancellation under an applicable refund policy |
| `operator_initiated` | An authorized operator exercised discretion to initiate a refund for a documented ground not represented by another specific catalog value |
| `duplicate_payment` | A duplicate successful customer payment requires reversal |
| `post_payment_predicate_failure` | After payment confirmation, a required purchase or provisioning predicate failed, including account-state change, handle race, price discrepancy, invalid purchase type, or compare-and-swap conflict |
| `customer_provisioning_failure` | The customer did not supply a valid required provisioning prerequisite within the governing window and policy requires or permits cancellation and refund |
| `payment_confirmed_after_expiry` | The payment provider confirmed customer funds after the associated PurchaseAttempt had irreversibly expired, the reservation had been released, and automatic provisioning was no longer permitted |

#### `post_payment_predicate_failure`

- Applies to system-detected or operationally verified predicate failures after payment confirmation.
- Covers BO1 steps 12a–12d, R-6, and N-3: account-state change, handle race, price discrepancy, invalid purchase type, and compare-and-swap conflict.
- The specific failed predicate must be preserved in the operational or reconciliation evidence for the order.
- `initiated_by = 'system'` when the automatic process creates the PaymentRefund.
- If an operator performs the authorized creation after reconciliation, `initiated_by` is that operator's ID.
- Do not change the code to `operator_initiated` merely because an operator executed the operation; the substantive ground is the failed predicate, not the operator's discretion.
- Post-payment AUP refusal supported by `APPLICATION_DECLINED` administration evidence uses `operator_initiated`, not this code.

#### `customer_provisioning_failure`

- Applies to BO1 R-4: the customer did not provide a valid required provisioning prerequisite within the allowed window.
- Distinct from `customer_request`: failure to complete provisioning is not itself a refund request.
- Distinct from `provisioning_sla_breach`: the cause is an unmet customer prerequisite, not ImplicitEx missing its provisioning deadline.
- Distinct from `operator_initiated`: operator execution does not change the substantive ground.
- `initiated_by` records the actual authorized operator ID unless a separately ratified automatic process initiates the PaymentRefund.
- The refund must satisfy the governing policy and the BO1 prohibition against using refunds as a substitute for completing provisioning prematurely.

#### `payment_confirmed_after_expiry`

- Applies only when the associated PurchaseAttempt is already `expired` under the server-authoritative reservation deadline before payment confirmation is durably processed.
- The PurchaseAttempt remains `expired`. Its reservation is not restored. It must not reopen, become `payment_confirmed`, or proceed to `completed`.
- The Payment is recorded canonically as confirmed provider truth. `PurchaseAttempt.payment_id` is linked write-once to that Payment. `PurchaseAttempt.failure_code = 'PAYMENT_CONFIRMED_AFTER_EXPIRY'` (uppercase; the PurchaseAttempt operational field, distinct from this `reason_code`).
- No entitlement, Coin Card, WalletRoute, or provisioning operation is created or activated from that expired attempt.
- The refund ground for returning that Payment is `PaymentRefund.reason_code = 'payment_confirmed_after_expiry'`.
- The late-payment handler must place the Payment into the established reconciliation and refund path. Creation of the PaymentRefund must occur through an authorized system or operator action under the governing operations policy. If an automatic operation initiates it, `initiated_by = 'system'`; if an operator creates it after reconciliation, `initiated_by` is that operator's ID. The reason remains `payment_confirmed_after_expiry` regardless of who executes the action.
- The same confirmed Payment must not be retained indefinitely without either provisioning under a separately valid operation or an authorized refund resolution.
- The PaymentRefund follows the normal canonical refund lifecycle and exactly-once event rules. A PaymentRefund created for this ground writes `refund_initiated.refund_reason = 'payment_confirmed_after_expiry'`, copied from `PaymentRefund.reason_code`.
- `Payment.status` remains `confirmed` at refund initiation and becomes `refunded` only after cumulative succeeded refunds equal the full `Payment.amount_atomic`.

### Invariants

- PaymentRefund records are never deleted.
- `payment_id`, `provider`, `amount_atomic`, `asset`, `asset_decimals`,
  `reason_code`, `initiated_at`, `initiated_by`, `idempotency_key`, and
  `livemode` are immutable once set.
- `provider_refund_id` is null until the provider acknowledges; immutable once set.
- `idempotency_key` is unique within the provider and operation boundary.
- `amount_atomic` must be positive. Cumulative succeeded refunds must not exceed
  `Payment.amount_atomic`.
- Partial successful refunds leave `Payment.status = 'confirmed'`.
  `Payment.status` becomes `'refunded'` only when cumulative succeeded refund
  amounts equal `Payment.amount_atomic` in full.
- `refund_confirmed` LifecycleEvent is written exactly once per PaymentRefund
  that reaches `succeeded`.

---

## 11. Payment Dispute

**Purpose:** Records a payment dispute (chargeback) filed by the customer with
their payment provider. A dispute is a provider-level event; it does not
automatically trigger an ImplicitEx refund and does not rewrite the confirmed
Payment record. A provider chargeback is not an ImplicitEx refund — the two are
independent operations. Each dispute against a Payment produces a separate
PaymentDispute record.

### Fields

| Field | Type | Immutable | Sensitive | Notes |
|---|---|---|---|---|
| `payment_dispute_id` | UUID | ✓ | — | Primary key |
| `payment_id` | UUID | ✓ | — | FK → Payment; the disputed payment |
| `provider` | enum | ✓ | — | `stripe`, `polygon_usdc`; must match parent Payment's rail |
| `provider_dispute_id` | string | ✓ | ✓ | External dispute identifier (e.g., Stripe dispute ID); unique within `provider` |
| `provider_charge_id` | string\|null | ✓ | ✓ | Provider charge identifier associated with the dispute; provider-specific |
| `amount_atomic` | integer | ✓ | — | Disputed amount in same units as `Payment.amount_atomic` |
| `asset` | enum | ✓ | — | Must match parent `Payment.payment_asset` |
| `reason` | string\|null | ✓ | — | Provider-supplied dispute reason code |
| `status` | enum | — | — | `open`, `under_review`, `closed` |
| `provider_status` | string\|null | — | — | Raw status string from the payment provider; copied verbatim at each update |
| `outcome` | enum\|null | — | — | Terminal result: `won`, `lost`, `accepted`; null while `status` is not `closed` |
| `evidence_due_at` | timestamp\|null | ✓ | — | Provider deadline for submitting dispute evidence; null if not applicable |
| `livemode` | boolean | ✓ | — | True for production provider sessions; false for test mode |
| `created_at` | timestamp | ✓ | — | When ImplicitEx first recorded the dispute |
| `updated_at` | timestamp\|null | — | — | Last time this record was updated from a provider event |
| `closed_at` | timestamp\|null | — | — | Set when `status` transitions to `closed` |
| `suspension_case_id` | UUID\|null | — | — | FK → SuspensionCase; set only if an independent AUP ground leads to suspension; null otherwise |
| `operator_notes` | string\|null | — | ✓ | Operator notes on the dispute; sensitive; operator-only |

### Status and outcome

Internal status tracks the lifecycle of the dispute record:

| Status | Meaning |
|---|---|
| `open` | Dispute received and recorded; initial operator review |
| `under_review` | Submitted to provider's formal dispute resolution process |
| `closed` | Dispute resolved; `outcome` records the terminal result |

`outcome` is set when `status` transitions to `closed`:

| Outcome | Meaning |
|---|---|
| `won` | ImplicitEx prevailed; no funds returned via chargeback |
| `lost` | Customer prevailed; funds returned via chargeback mechanism |
| `accepted` | ImplicitEx accepted the dispute without contesting |

Internal status and provider outcome are separate fields. `provider_status`
records the raw provider state verbatim; `outcome` records the final ImplicitEx
classification.

### Cardinality

One-to-many with Payment. A Payment may have multiple PaymentDispute records.
`provider + provider_dispute_id` is unique.

### Constraints

- A dispute does **not** automatically trigger suspension, revocation, or any
  status change on the Coin Card, Entitlement, or Account. These require an
  independent AUP ground established and ratified separately from the dispute.
- A provider chargeback does **not** create a PaymentRefund. A PaymentRefund is
  created only if ImplicitEx independently decides to issue one. An independent
  refund and a provider chargeback must remain distinguishable in the record model.
- The confirmed Payment record is **not** rewritten when a dispute is received.
  The dispute is recorded in PaymentDispute; the Payment remains `confirmed`.
- `suspension_case_id` may only be set after an independently supported and
  ratified protection ground is established. The dispute event itself is not
  a sufficient ground.
- A dispute does not create a Coin Card LifecycleEvent unless an independent
  ratified suspension, restoration, revocation, or expiration operation occurs
  as a consequence.

### Invariants

- PaymentDispute records are never deleted.
- `payment_dispute_id`, `payment_id`, `provider`, `provider_dispute_id`,
  `amount_atomic`, `asset`, `livemode`, and `created_at` are immutable once set.
- `provider_charge_id`, `reason`, `evidence_due_at` are immutable once set.
- `provider_status` is updated each time the provider reports a status change;
  it is not immutable.
- `outcome` is set once when `status` transitions to `closed`.
- A `closed` dispute does not reopen.

---

## 12. External Event Receipt

**Purpose:** Records each webhook event received from an external payment
provider. ExternalEventReceipt provides first-layer idempotency for webhook
processing: an event that has already been received is identified by its unique
`(provider, provider_event_id)` before domain transitions are attempted. This
is the first of two idempotency layers; the second is domain-transition
idempotency on Payment, PaymentRefund, and PaymentDispute records.

### Fields

| Field | Type | Immutable | Sensitive | Notes |
|---|---|---|---|---|
| `external_event_receipt_id` | UUID | ✓ | — | Primary key |
| `provider` | enum | ✓ | — | `stripe`, `polygon_usdc`; identifies the event source |
| `provider_event_id` | string | ✓ | ✓ | Provider's unique event identifier (e.g., Stripe Event ID `evt_…`); unique within `provider` |
| `event_type` | string | ✓ | — | Provider's event type string (e.g., `checkout.session.completed`) |
| `provider_object_id` | string\|null | ✓ | — | ID of the provider object the event describes (e.g., a Session ID or PaymentIntent ID); aids correlation |
| `api_version` | string | ✓ | — | Provider API version in effect when this event was generated |
| `livemode` | boolean | ✓ | — | True for production provider events; false for test mode |
| `received_at` | timestamp | ✓ | — | When ImplicitEx received the webhook |
| `payload_hash` | string | ✓ | — | SHA-256 hash of the raw webhook payload; used for integrity verification without retaining the full payload |
| `processing_status` | enum | — | — | `received`, `processing`, `processed`, `failed`, `skipped` |
| `processing_started_at` | timestamp\|null | — | — | Set when `processing_status` transitions to `processing` |
| `processed_at` | timestamp\|null | — | — | Set when `processing_status` reaches `processed` or `skipped` |
| `attempt_count` | integer | — | — | Count of processing attempts; initial value 0; incremented atomically on every valid transition into `processing`, including the first attempt; therefore the first processing attempt sets it to 1; duplicate delivery does not increment it; acknowledgement without processing does not increment it |
| `last_error_code` | string\|null | — | — | Machine-readable error code from the most recent failed attempt; cleared on success |

### Processing status definitions

| Status | Meaning |
|---|---|
| `received` | Event received and stored; not yet processed |
| `processing` | Processing underway; domain transitions in progress |
| `processed` | Domain transitions completed successfully |
| `failed` | Most recent processing attempt failed; eligible for retry |
| `skipped` | Event was deliberately non-actionable (e.g., event type not handled); no domain transitions performed |

### Idempotency design

**Layer 1 — ExternalEventReceipt deduplication by provider event identity:**
Before processing any provider event, the server attempts to insert an
ExternalEventReceipt row using the unique `(provider, provider_event_id)` pair.
If a row with that pair already exists, the incoming delivery is a duplicate.
The server returns the existing receipt's processing result to the provider.
The original receipt record is **not** modified; its status is not changed to
`skipped`. `skipped` is reserved for a newly accepted but deliberately
non-actionable event (e.g., an unhandled event type), not for duplicate delivery.

**Layer 2 — Domain-transition idempotency:**
Even if a duplicate event reaches domain logic (e.g., due to a race between
two concurrent webhook deliveries of the same Event ID), domain transitions are
independently idempotent. A record that has already reached the target state
will not be transitioned again. Two distinct provider Event IDs that describe
the same logical provider-object state are each deduplicated independently;
domain transitions must tolerate this case without double-applying effects.

Both layers must be operative. Layer 1 alone is insufficient because webhook
delivery may race with in-progress processing of the same event.

**No single linked record:** One webhook may update PurchaseAttempt, Payment,
LifecycleEvent, and customer-notice state in the same operation. A single
`linked_record_id` cannot reliably represent the full processing result.
Correlation is achieved via `provider_object_id` and domain record timestamps.

### Retry behavior

A `failed` ExternalEventReceipt is not terminal. On a controlled retry, the
following occur atomically:

1. `processing_status` transitions from `failed` back to `processing`.
2. `attempt_count` is incremented (same mechanism as the first attempt).
3. `processing_started_at` is updated to the retry start time.
4. Domain transitions are retried. Layer 2 idempotency ensures they are safe.
5. On success, `processing_status` transitions to `processed`.

### V1 scope boundary

Application-initiated Polygon RPC reads, receipt polling, and finalized-block
verification do not create `ExternalEventReceipt` records in V1. The record is
a receipt for externally delivered provider events, not for server-initiated
chain queries.

The inclusion of `polygon_usdc` in the `provider` enum does not authorize
inventing values for `provider_event_id`, `event_type`, or `api_version` for
blockchain polling operations. No such conventions are defined in V1.

Polygon payment confirmation idempotency for the first cohort is grounded in:

- Unique `Payment.network_tx_hash` combined with `Payment.network_chain_id`
- Atomic PurchaseAttempt-to-Payment binding (see §9 Polygon-USDC checkout anchor)
- Idempotent Payment state transitions

Any future provider-pushed Polygon event or chain-indexer webhook that arrives
as an external delivery requires a separately ratified convention for
`provider_event_id`, `event_type`, and `api_version` before
`ExternalEventReceipt` may be used for that purpose.

### Invariants

- ExternalEventReceipt records are never deleted.
- `(provider, provider_event_id)` is unique. Duplicate event deliveries are
  identified by this constraint and handled without modifying the original record.
- `external_event_receipt_id`, `provider`, `provider_event_id`, `event_type`,
  `provider_object_id`, `api_version`, `livemode`, `received_at`, and
  `payload_hash` are immutable once set.
- `processing_status` may transition `failed → processing` on retry.
  Once `processed` or `skipped`, no further transitions.
- `attempt_count` is monotonically non-decreasing.

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

### PurchaseAttempt status

```
screening ──(pass)──► eligible ──(checkout)──► checkout_created ──(intent)──► payment_pending
    │                    │               │                                           │     │
    │(fail)              │(cancel)       │(cancel / expired)               (failed) │     │(confirmed)
    ▼                    ▼               ▼                                           ▼     ▼
 declined            cancelled        expired                          checkout_created  payment_confirmed
                                                                                              │
                                                                             (provisioned)    │
                                                                                              ▼
                                                                                         completed
```

`declined`, `cancelled`, `expired`, and `completed` are terminal.
`payment_pending → checkout_created` is the recoverable payment-failure transition;
the reservation and Checkout Session remain active. `payment_id` is linked on a
late payment confirmation even when the attempt has already transitioned to `expired`.

### SuspensionCase status (see §8 SuspensionCase for full table)

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
`case.deadline`,
`attempt.purchase_attempt_id`, `attempt.account_id`, `attempt.prior_entitlement_id`,
`attempt.purchase_type`, `attempt.payment_rail`, `attempt.quoted_asset`,
`attempt.quoted_amount_atomic`, `attempt.quoted_asset_decimals`,
`attempt.handle`, `attempt.livemode`, `attempt.created_at`,
`refund.payment_refund_id`, `refund.payment_id`, `refund.provider`,
`refund.amount_atomic`, `refund.asset`, `refund.asset_decimals`,
`refund.reason_code`, `refund.initiated_at`, `refund.initiated_by`,
`refund.idempotency_key`, `refund.livemode`,
`dispute.payment_dispute_id`, `dispute.payment_id`, `dispute.provider`,
`dispute.provider_dispute_id`, `dispute.provider_charge_id`,
`dispute.amount_atomic`, `dispute.asset`, `dispute.reason`,
`dispute.evidence_due_at`, `dispute.livemode`, `dispute.created_at`,
`receipt.external_event_receipt_id`, `receipt.provider`,
`receipt.provider_event_id`, `receipt.event_type`, `receipt.provider_object_id`,
`receipt.api_version`, `receipt.livemode`, `receipt.received_at`,
`receipt.payload_hash`

### Write-once fields

Fields that begin null and may be populated with exactly one value after record
creation. Once set, these fields are immutable. They must not appear in the
Immutable list above because they are not non-null at record creation.

| Field | Populated when |
|---|---|
| `attempt.card_id` | Provisioning creates the CoinCard (initial_activation only); or set at attempt creation for renewal and reactivation |
| `attempt.checkout_session_id` | Checkout session is created |
| `attempt.reserved_at` | Checkout session is created |
| `attempt.reserved_until` | Checkout session is created |
| `attempt.payment_id` | Payment record is created |
| `attempt.completed_at` | Provisioning confirms activation; PurchaseAttempt observes the result |
| `attempt.expired_at` | `reserved_until` elapses |
| `attempt.cancelled_at` | Attempt is cancelled |
| `attempt.failure_code` | Attempt reaches `declined` or `expired` with a notable condition |
| `refund.provider_refund_id` | Provider acknowledges the refund and assigns an ID |
| `refund.provider_created_at` | Provider acknowledges the refund |
| `refund.confirmed_at` | Refund status reaches `succeeded` |
| `refund.failed_at` | Refund status reaches `failed` |
| `refund.failure_code` | Refund status reaches `failed` |
| `dispute.suspension_case_id` | An independently ratified AUP ground leads to suspension |
| `dispute.outcome` | Dispute status transitions to `closed` |
| `dispute.closed_at` | Dispute status transitions to `closed` |
| `receipt.processed_at` | Processing status reaches `processed` or `skipped` |

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
| `attempt.status` | Forward state transitions; `payment_pending → checkout_created` allowed for recoverable payment failure |
| `refund.status` | Forward state transitions; `succeeded`, `failed`, `cancelled` are terminal |
| `refund.updated_at` | Updated on each provider event |
| `dispute.status` | Forward state transitions: `open → under_review → closed` |
| `dispute.provider_status` | Updated verbatim on each provider event; not forward-only |
| `dispute.updated_at` | Updated on each provider event |
| `dispute.operator_notes` | Set or updated by operator; sensitive |
| `receipt.processing_status` | `received → processing`; processing → `processed`, `failed`, or `skipped`; `failed → processing` on controlled retry |
| `receipt.processing_started_at` | Set and updated on every transition to `processing`, including retries |
| `receipt.attempt_count` | Incremented on every transition to `processing`; monotonically non-decreasing |
| `receipt.last_error_code` | Set on failure; cleared on successful retry |

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
that enables financial lookups), `PurchaseAttempt.checkout_session_id` (provider
session reference), `PaymentRefund.provider_refund_id` (enables financial lookups),
`PaymentDispute.provider_dispute_id` (enables financial lookups),
`PaymentDispute.operator_notes` (may contain security or legal details),
`ExternalEventReceipt.provider_event_id` (provider-system reference)

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
   transaction as the Coin Card lifecycle state change it records (see §6
   LifecycleEvent invariants for the full scope). Operational audit records
   (PurchaseAttempt, PaymentDispute, ExternalEventReceipt) are exempt from
   this invariant; their own field-level audit properties govern.

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

## 13. Retention and tombstone rules

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
| PurchaseAttempt | No deletion; `purchase_attempt_id`, `handle`, `status`, `reserved_until`, `checkout_session_id`, `payment_id` retained | Core identifiers, amounts, and timestamps are permanent; `checkout_session_id` is sensitive; see sensitive fields |
| PaymentRefund | No deletion; `payment_refund_id`, `payment_id`, `provider`, `provider_refund_id`, `amount_atomic`, `asset`, `reason_code`, `status`, `initiated_at`, `confirmed_at` retained | Core financial identifiers, amounts, provider references, and statuses retained under operational retention policy; `provider_refund_id` is sensitive; see retention policy note |
| PaymentDispute | No deletion; `payment_dispute_id`, `payment_id`, `provider`, `provider_dispute_id`, `amount_atomic`, `status`, `outcome`, `created_at` retained | Core identifiers, amounts, provider references, and outcomes retained under operational retention policy; `provider_dispute_id` and `operator_notes` are sensitive; sensitive notes subject to policy-governed redaction |
| ExternalEventReceipt | No deletion; `external_event_receipt_id`, `provider`, `provider_event_id`, `event_type`, `payload_hash`, `processing_status`, `received_at` retained | Idempotency and audit identifiers are permanent; raw payload is not retained — `payload_hash` is retained; `provider_event_id` is sensitive |

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

## 14. Public-record versus private operational-data boundaries

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
- `PurchaseAttempt`: `status`, `handle`, `reserved_until`, `created_at`,
  `completed_at`, `expired_at` (for the customer's own attempts; `checkout_session_id` excluded)
- `PaymentRefund`: `status`, `amount_atomic`, `reason_code`, `confirmed_at` (for the customer's own payments)
- `PaymentDispute`: `status`, `dispute_amount_atomic`, `received_at` (for the customer's own payments; `operator_notes` excluded)

### Operator-accessible only

- All fields on all records
- Sensitive fields (email, wallet addresses of other customers)
- `case.resolution_notes`
- `case.initiated_by`, `case.resolved_by`
- Internal monitoring and process-failure records

---

## 15. Entitlement specification to record mapping

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
| 24-hour provisioning SLA | `Entitlement.provisioning_deadline = Payment.confirmed_at + 24h`; `provisioning_sla_breach` lifecycle event; `PaymentRefund` created with `PaymentRefund.initiated_at`; `refund_initiated` lifecycle event |
| Non-transferable | `CoinCard.account_id` immutable |
| No custody | Schema non-custody assertion (invariant 10) |
| 30-day refund window | `Payment.confirmed_at + 30 days`; `PaymentRefund.reason_code = 'customer_request'` |
| Proactive refund on SLA breach | `PaymentRefund` created by system with `reason_code = 'provisioning_sla_breach'`; `refund_initiated` lifecycle event written; customer not required to request |
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
| Purchase screening and eligibility evidence | `PurchaseAttempt.status` (`screening` → `eligible` or `declined`); `failure_code` for AUP Category 1 reason codes; immutable administration evidence not part of the signed Coin Card chain |
| Handle reservation | `PurchaseAttempt.handle`, `reserved_at`, `reserved_until`; server-authoritative; concurrency-safe uniqueness constraint on active reservations by normalized handle; reservation independent of webhook delivery timing |
| Quoted payment terms | `PurchaseAttempt.quoted_asset`, `quoted_amount_atomic`, `quoted_asset_decimals`; immutable at attempt creation; must equal the eventual Payment fields |
| Checkout-to-Payment correlation | `PurchaseAttempt.checkout_session_id` (write-once; one session per attempt), `payment_id` (write-once; set when Payment is created); `purchase_type` distinguishes initial, renewal, and reactivation flows |
| Provisioning handoff | `PurchaseAttempt.status = 'payment_confirmed'` signals provisioning start; provisioning pipeline writes the appropriate LifecycleEvent (`entitlement_activated` or `entitlement_reactivated`); `PurchaseAttempt.status` transitions to `completed` after observing the activated result |
| Late-payment-after-expiry reconciliation | `PurchaseAttempt.payment_id` linked even when `status = 'expired'`; `failure_code = 'PAYMENT_CONFIRMED_AFTER_EXPIRY'`; provisioning does not proceed; refund ground is `PaymentRefund.reason_code = 'payment_confirmed_after_expiry'`; PaymentRefund created through authorized system or operator action |
| Automatic refund initiation | `PaymentRefund` created for each automatic-refund ground (provisioning SLA breach, post-payment operator refusal, duplicate successful payment, or other ratified automatic ground); `initiated_by` records the system or operator that initiates the operation; customer-requested refunds (`reason_code = 'customer_request'`) are not automatic and remain distinguishable; `refund_initiated` lifecycle event written with `payment_refund_id` |
| Provider refund tracking | `PaymentRefund.status` tracks provider acknowledgement through to `succeeded` or `failed`; write-once `provider_refund_id` set on provider acknowledgement; `idempotency_key` prevents duplicate submissions |
| Partial and cumulative refund accounting | One-to-many PaymentRefund per Payment; partial succeeded refunds leave `Payment.status = 'confirmed'`; `Payment.status` becomes `'refunded'` only when cumulative succeeded refund amounts equal `Payment.amount_atomic`; cumulative succeeded refunds cannot exceed the payment amount |
| Refund lifecycle events | `refund_initiated` written when ImplicitEx initiates a refund; `refund_confirmed` written exactly once per PaymentRefund that reaches `succeeded`; both carry `payment_id` and `payment_refund_id` |
| Provider dispute and chargeback tracking | `PaymentDispute` created on provider dispute event; `provider_dispute_id` unique within provider; internal `status` (`open`, `under_review`, `closed`) and `outcome` (`won`, `lost`, `accepted`) are separate from raw `provider_status` |
| Historically confirmed Payment preserved | A provider chargeback does not rewrite the confirmed Payment record; the Payment remains `confirmed`; the dispute is recorded in PaymentDispute only |
| Disputes separated from refunds | A chargeback does not create a PaymentRefund; an independently decided ImplicitEx refund and a provider chargeback remain distinguishable in the record model |
| Optional link to independently justified SuspensionCase | `PaymentDispute.suspension_case_id` may be set only after an independently ratified AUP ground is established; the dispute event itself is not a sufficient ground; no automatic entitlement action |
| Provider-webhook acceptance and Event-ID deduplication | Every inbound provider webhook is resolved to an `ExternalEventReceipt`; the server attempts insertion using `(provider, provider_event_id)`; a new receipt is created only for a previously unseen Event ID; duplicate delivery returns the existing receipt without creating or mutating another record |
| Webhook processing retries | `ExternalEventReceipt.processing_status` supports `failed → processing` transition; `attempt_count` incremented on every transition to `processing`; `last_error_code` updated on failure and cleared on success |
| Payload-integrity hash | `ExternalEventReceipt.payload_hash` (SHA-256 of raw payload) retained; complete raw payload is not required to be stored indefinitely |
| Domain-transition idempotency support | `ExternalEventReceipt` deduplication is layer 1; domain records (Payment, PaymentRefund, PaymentDispute) apply independent state-transition idempotency as layer 2; both layers must be operative |

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

### 2026-08-03 — Four new operational records added (purchase-flow and provider-event support)

**A13 — PurchaseAttempt, PaymentRefund, PaymentDispute, ExternalEventReceipt added**

Added four new operational records to support the purchase pipeline, provider
payment events, and webhook idempotency. These are private operational records.
They are not part of the public signed Coin Card evidence chain.

*PurchaseAttempt (§9):* Records the full lifecycle of a purchase attempt from
eligibility screening through provisioning handoff. Reserves the requested handle
server-authoritatively via `reserved_at` / `reserved_until`, independent of
webhook delivery. Supports four `purchase_type` values (`initial_activation`,
`active_term_renewal`, `grace_period_renewal`, `post_grace_reactivation`).
`card_id` is write-once: null for initial purchases until provisioning creates
the CoinCard. A failed payment attempt within an active session transitions
`payment_pending → checkout_created` without expiring the attempt. A late
confirmed payment after `reserved_until` is linked via `payment_id` and held for
reconciliation with `failure_code = 'PAYMENT_CONFIRMED_AFTER_EXPIRY'`; provisioning
does not proceed automatically.

*PaymentRefund (§10):* Records each refund operation against a confirmed Payment.
One-to-many with Payment, supporting partial and sequential refunds. `provider_refund_id`
is write-once: null until the provider acknowledges and assigns an ID. `idempotency_key`
prevents duplicate refund submissions. Partial succeeded refunds leave
`Payment.status = 'confirmed'`; `Payment.status` becomes `'refunded'` only when
cumulative succeeded refund amounts equal `Payment.amount_atomic`. A failed refund
is terminal for that record; a retry creates a new PaymentRefund. `refund_initiated`
and `refund_confirmed` lifecycle events updated to carry `payment_refund_id`.

*PaymentDispute (§11):* Records provider dispute (chargeback) events. A provider
chargeback does not rewrite the historically confirmed Payment, does not create a
PaymentRefund, and does not automatically trigger any entitlement action. Internal
`status` (`open`, `under_review`, `closed`) and terminal `outcome` (`won`, `lost`,
`accepted`) are separate from raw `provider_status`. `suspension_case_id` is
write-once and may only be set after an independently ratified AUP ground is
established.

*ExternalEventReceipt (§12):* Records every inbound provider webhook event.
`(provider, provider_event_id)` is unique; duplicate delivery returns the existing
receipt without mutating it. `skipped` is reserved for a newly accepted but
deliberately non-actionable event — not for duplicate delivery. `failed → processing`
is permitted on controlled retry; `attempt_count` increments on every transition
into `processing` including the first, so the first processing attempt sets it
to `1`. Complete raw payload is not stored; `payload_hash` is retained.

*Write-once field classification (§ Field classifications):* Added a new
Write-once subsection covering 18 fields across the four new records. Write-once
fields begin null and may be populated exactly once; they are immutable thereafter
but must not be listed as immutable from record creation.

*Lifecycle-event scope clarified:* Pre-payment eligibility declines, PurchaseAttempt
expirations, and provider dispute events are operational-record transitions that
do not produce Coin Card LifecycleEvents. `refund_initiated` and `refund_confirmed`
produce LifecycleEvents as before, now carrying `payment_refund_id`.
Transactional invariant 1 (event-first) scoped explicitly to Coin Card lifecycle
mutations.

*Retention-section numbering corrected:* Retention (§8), Public boundary (§9),
and Mapping (§10) were renumbered to §13, §14, §15 to avoid collision with the
record sections 1–12. A stale retention cross-reference was corrected to §13.
Retention language for the new records uses operational retention policy language;
no statutory duration is asserted.

*Payment.provider_payment_id note corrected:* Updated from "Stripe charge ID" to
"Stripe PaymentIntent ID" to match the actual identifier used for fulfillment.

**This amendment does not change:**

- The $10 entitlement price
- Entitlement duration (12 months)
- Renewal or reactivation policy or grace period
- Route-change allowance (4 per term)
- Customer workflows or business-operation deadlines (24h provisioning SLA; 7/14-day suspension rules)
- Public signed Coin Card evidence semantics (EvidencePublication, signing inputs, registry record, lifecycle bundle)

---

### Amendment 2026-08-03 — Remove Payment.refund_reason; canonicalize refund ground to PaymentRefund.reason_code

**Problem:** `Payment.refund_reason` was a single enum field on the Payment record. A Payment may have multiple PaymentRefund records with different substantive grounds (e.g., a partial SLA-breach refund followed by a customer-request cancellation refund). A single Payment-level reason field cannot truthfully represent the ground for each of potentially several refund operations.

**Changes:**

- `Payment.refund_reason` removed from the Payment fields table (§5). The field is eliminated; it is not replaced by another Payment-level reason field.
- `payment.refund_reason | Set once` removed from the write-once field classification table (§Field classifications). `payment.refunded_at` remains.
- `Payment.refund_initiated_at` removed for the same one-Payment-to-many-PaymentRefund cardinality reason: a Payment may have multiple PaymentRefund records, each with its own `PaymentRefund.initiated_at`. A single Payment-level initiation timestamp cannot represent multiple operations. `payment.refund_initiated_at | Set once` removed from the write-once field classification table. The Payment fields table, Relationship-to-Entitlement prose, and design-decision rows updated accordingly.
- `PaymentRefund.initiated_at` is the canonical per-operation initiation timestamp (§10, immutable).
- `refund_initiated` LifecycleEvent is the immutable lifecycle evidence of each initiated refund operation; it is not a field on Payment.
- Customer-accessible field list (§14): stale reference `PaymentRefund.succeeded_at` corrected to `PaymentRefund.confirmed_at`, which is the canonical successful-refund timestamp defined in §10.
- `PaymentRefund.reason_code` remains the sole canonical field for the substantive ground of each refund operation. It is immutable once set (§10 invariants unchanged).
- `refund_initiated` LifecycleEvent catalog row (§6): `refund_reason` payload field retained. Clarified that its value is copied from `PaymentRefund.reason_code` for the PaymentRefund identified by `payment_refund_id`. The event payload is an immutable snapshot of that operation's ground; it is not a field stored on Payment.
- Customer-accessible field list (§14): `PaymentRefund` entry corrected from `refund_reason` to `reason_code`.
- Design-decision table (§15): `30-day refund window` row corrected from `refund_reason = 'customer_request'` to `PaymentRefund.reason_code = 'customer_request'`.
- `Payment.status` semantics are unchanged: `confirmed` while cumulative succeeded refunds are below the full amount; `refunded` when cumulative succeeded refunds equal `Payment.amount_atomic`.

**Reason-code gaps resolved in this amendment:**

- `post_payment_predicate_failure` ratified: covers system-detected or operationally verified post-payment predicate failures (BO1 steps 12a–12d, R-6, N-3). Previously marked `DATA_MODEL_REASON_CODE_GAP`.
- `customer_provisioning_failure` ratified: covers BO1 R-4 refunds where the customer did not supply a valid required provisioning prerequisite. Previously marked `DATA_MODEL_REASON_CODE_GAP`.
- `Payment.refund_reason` previously had three values; `duplicate_payment` was absent. With `Payment.refund_reason` removed, this asymmetry is resolved: `PaymentRefund.reason_code = 'duplicate_payment'` is already ratified.
- Full reason-code catalog (`### Reason-code catalog`) added to §10; `PaymentRefund.reason_code` field note updated to reference the catalog; open-ended "other documented grounds" wording removed.

- `payment_confirmed_after_expiry` ratified: covers the ground where a payment provider confirms customer funds after the associated PurchaseAttempt has irreversibly expired. The PurchaseAttempt operational field `failure_code = 'PAYMENT_CONFIRMED_AFTER_EXPIRY'` (uppercase) remains distinct from this lowercase `reason_code`. The existing late-payment section in PurchaseAttempt (§9) updated to reference the ratified code. Design-decision row corrected to remove the delegation to the Stripe Checkout specification and state the canonical refund ground. Previously marked as deferred.

- `entitlement_cancelled` LifecycleEvent gap closed: five-value Entitlement-cancellation reason catalog ratified (`customer_requested`, `provisioning_sla_breach`, `post_payment_operator_decline`, `post_payment_predicate_failure`, `customer_provisioning_failure`). The ambiguous `refund_initiated` boolean payload field replaced with nullable `payment_refund_id` (FK to the specific PaymentRefund for this cancellation; null when no refund was created). `pending_activation → cancelled` state-machine trigger description expanded to cover all five operational grounds. Cancellation EvidencePublication limited to `active → cancelled` (customer-requested cancellation of an active Entitlement only); operational `pending_activation → cancelled` produces no public EvidencePublication. `EvidencePublication.cancellation_reason = 'customer_requested'` remains its sole V1 signed value. Previously marked as deferred.

**No refund/cancellation gaps from this amendment group remain deferred.**

- `payment_refund_id` nullability tightened: null means no refund is due, not that a refund has not yet been initiated. The immutable `entitlement_cancelled` event must carry the final value at write time; no backfill is permitted. When any cancellation ground requires a refund, the PaymentRefund must be created before or atomically with the event, and `payment_refund_id` must reference it at event creation. Provider submission and provider confirmation are not prerequisites. The following are not valid null cases: refund awaiting operator action; refund expected later; provider submission not yet submitted; provider confirmation pending. Explicit V1 null case: `customer_requested` cancellation outside the applicable refund window.
- Refund-link requirement table added to `### entitlement_cancelled payload specification`: enumerates `payment_refund_id` nullability obligation for each of the five `cancellation_reason` values. All grounds except `customer_requested` require non-null; `customer_requested` is conditional on whether refund policy grants a refund.
- No-placeholder-Entitlement invariant added: `entitlement_cancelled` is written only when an Entitlement record already exists and transitions. The system must never create a `pending_activation` Entitlement solely to cancel it or to produce this event. Post-payment failure detected before Entitlement creation follows the refund/reconciliation path without manufacturing a placeholder Entitlement.

**Follow-up document alignment required (separate passes):**

- Business Operations V1 §Lifecycle events written (step 28): `entitlement_cancelled` is missing from the SLA breach event sequence. Requires BO1 correction.
- Customer Workflows V1 §5.6: References stale `pay.refund_initiated_at` and `pay.refund_reason` fields removed from Payment in this amendment group. Requires CW1 correction.

---

### 2026-08-05 — Gate 6 Data Model amendment: Polygon-USDC checkout canonical records

**A14 — PurchaseAttempt polygon_usdc fields and Payment.failed_at; ExternalEventReceipt V1 scope boundary**

Added three immutable Polygon-USDC fields to PurchaseAttempt:
`expected_sender_address` (sensitive; the EIP-55 Polygon wallet address authorized
as the expected source of the purchase transfer), `expected_recipient_address`
(the EIP-55 ImplicitEx payment-collection address snapshot for this attempt; must
not refer to `WalletRoute.recipient_address`), and `expected_token_address` (the
EIP-55 Polygon-native USDC token contract address snapshot; `quoted_asset = 'USDC'`
does not replace verification of this exact address). All three are required before
a `polygon_usdc` PurchaseAttempt transitions to `checkout_created`; all three must
be null for `stripe_usd`. All three are server-authoritative and immutable once set.

Established atomic transaction-hash-to-Payment binding: when a customer submits
a transaction hash on the `polygon_usdc` rail, Payment creation, hash uniqueness
check, `PurchaseAttempt.payment_id` assignment, and `payment_pending` status
transition execute as one atomic operation. `checkout_session_id` remains null
for `polygon_usdc`; no provider-managed checkout session is created.

Limited to one standard fulfillment Payment per PurchaseAttempt: `payment_id`
is write-once; a second submitted transaction hash after `payment_id` is non-null
is routed to reconciliation and must not replace `payment_id` or confirm the
attempt automatically. Re-submission of the same hash returns the existing Payment
idempotently.

Required a new PurchaseAttempt after a terminal dropped, replaced, or reverted
`polygon_usdc` transaction: `payment_id`, `Payment.network_tx_hash`, and
`Payment.provider_payment_id` are immutable once set; no replacement hash is
accepted on an existing attempt. A transaction from the failed attempt that later
confirms follows the late-payment/reconciliation path.

Added `Payment.failed_at` (timestamp; set exactly once on `pending → failed`;
immutable once set; separate from `PaymentRefund.failed_at`), resolving a
discrepancy where BO1 step 10 referenced this field but it was absent from the
Payment field table.

Excluded application-initiated Polygon RPC polling, receipt queries, and
finalized-block verification from `ExternalEventReceipt` V1 semantics: these
are server-initiated chain reads, not externally delivered provider events.
The `polygon_usdc` provider enum value is retained; its use requires a separately
ratified convention for `provider_event_id`, `event_type`, and `api_version`
before `ExternalEventReceipt` may be used for any Polygon event.

**This amendment does not change:**

- Stripe checkout semantics or any existing Stripe field
- Entitlement price, duration, renewal policy, or grace period
- Route-change allowance or WalletRoute semantics
- The public signed Coin Card evidence chain
- Customer workflows or business-operation deadlines
- Any existing PaymentRefund, PaymentDispute, or ExternalEventReceipt behavior

**Follow-up alignment required (separate passes):**

- Business Operations V1: amend step 9 `polygon_usdc` condition 4 to specify
  `expected_sender_address`, `expected_recipient_address`, and
  `expected_token_address` as the canonical sources for the sender, recipient,
  and token contract checks. Resolve atomic binding sequence and dropped-tx
  recovery in the BO1 workflow.
- Customer Workflows V1: ratify the `polygon_usdc` Coin Card purchase flow,
  including the transaction-submission step and the replacement-PurchaseAttempt
  path.
