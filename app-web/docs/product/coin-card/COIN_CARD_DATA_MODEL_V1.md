# Coin Card Data Model V1

**Status:** Governing — implementation defers to this document  
**Governing entitlement specification:** `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `67f4755`  
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
| Monetary amounts | Integer cents (USD) | `1000` = $10.00 |
| Signing input serialization | Canonical JSON, alphabetical key order, no trailing whitespace | — |

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

### What is NOT on this record

- **Status** — derived from Entitlement and SuspensionCase (see §Derived Status)
- **Recipient address** — belongs to WalletRoute
- **Term dates** — belong to Entitlement
- **Payment reference** — belongs to Entitlement → Payment

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

### Invariants

- `handle` is set once at creation. It is never updated, transferred, or
  reassigned to a different `card_id`.
- `account_id` is set once. Ownership does not transfer.
- A CoinCard record is never deleted. After expiration or revocation, it
  transitions to a non-executable state but remains historically identifiable.

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
| `active` | `cancelled` | Customer cancellation request | `entitlement_cancelled` |
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
| `amount_cents` | integer | ✓ | — | 1000 for $10.00 |
| `currency` | string | ✓ | — | `USD` in V1 |
| `provider` | enum | ✓ | — | `stripe` (V1); extensible |
| `provider_payment_id` | string | ✓ | — | External reference (Stripe charge ID, etc.) |
| `status` | enum | — | — | `pending`, `confirmed`, `refunded`, `failed` |
| `created_at` | timestamp | ✓ | — | Payment record created |
| `confirmed_at` | timestamp\|null | — | — | Set on payment confirmation; starts provisioning clock |
| `refunded_at` | timestamp\|null | — | — | Set when refund is confirmed |
| `refund_reason` | enum\|null | — | — | `provisioning_sla_breach`, `customer_request`, `operator_initiated` |
| `refund_initiated_at` | timestamp\|null | — | — | When ImplicitEx initiated the refund process |

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
| `entitlement_activated` | Entitlement transitions to `active` | `activated_at`, `expires_at` |
| `entitlement_expired` | Entitlement transitions to `expired` | `expired_at`, `grace_period_ends_at` |
| `entitlement_revoked` | Entitlement transitions to `revoked` | `case_id`, `reason` |
| `entitlement_cancelled` | Entitlement transitions to `cancelled` | `cancellation_reason`, `refund_initiated` |
| `route_changed` | New WalletRoute activated | `route_id`, `route_sequence`, `recipient_address` |
| `suspended` | SuspensionCase opened | `case_id`, `reason`, `deadline` |
| `suspension_extended` | SuspensionCase extended | `case_id`, `extension_deadline`, `extension_reason` |
| `restored` | SuspensionCase resolved: restoration | `case_id` |
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

### Fields

| Field | Type | Immutable | Public | Signing input | Notes |
|---|---|---|---|---|---|
| `publication_id` | UUID | ✓ | — | — | Primary key |
| `card_id` | UUID | ✓ | — | ✓ | FK → CoinCard |
| `entitlement_id` | UUID | ✓ | — | ✓ | FK → Entitlement |
| `route_id` | UUID | ✓ | — | ✓ | FK → WalletRoute; route in effect at publication |
| `publication_type` | enum | ✓ | — | ✓ | `initial_activation`, `route_change`, `renewal`, `expiration`, `suspension`, `restoration`, `revocation` |
| `published_at` | timestamp | ✓ | ✓ | ✓ | When the signed package was published |
| `manifest_version` | string | ✓ | ✓ | ✓ | Version of the signing schema used |
| `signing_key_id` | string | ✓ | ✓ | — | Identifies the public key used; not the key itself |
| `asset_hashes` | JSON | ✓ | ✓ | ✓ | SHA-256 hashes of each signed asset file |
| `lifecycle_bundle_hash` | string | ✓ | ✓ | ✓ | Hash of the published lifecycle bundle |
| `registry_record_hash` | string | ✓ | ✓ | ✓ | Hash of the published registry record |
| `card_status_at_publication` | enum | ✓ | ✓ | ✓ | Derived card status at the moment of signing |
| `signature` | string | ✓ | ✓ | — | Signature over the canonical signing input set |
| `prior_publication_id` | UUID\|null | ✓ | ✓ | ✓ | FK → prior EvidencePublication; forms a chain |

### Signing input set

The fields marked `Signing input = ✓` above are serialized as canonical JSON
(alphabetical key order, no trailing whitespace) and signed. The signature
covers the complete serialized object. Any field not in the signing input set
is operational metadata only and does not affect verifiability.

### Publication triggers

A new EvidencePublication must be created whenever the card's authoritative
signed state changes:

| Trigger | publication_type |
|---|---|
| First provisioning complete | `initial_activation` |
| Route change activated | `route_change` |
| Entitlement renewal activates | `renewal` |
| Entitlement expires | `expiration` |
| Suspension case opened | `suspension` |
| Suspension resolved (restored) | `restoration` |
| Entitlement revoked | `revocation` |

### Invariants

- EvidencePublication records are never updated or deleted.
- `prior_publication_id` creates a linked chain. The first publication for a
  card has `prior_publication_id = null`. Every subsequent publication chains
  to the immediately prior one.
- The most recent EvidencePublication is the authoritative signed state. The
  derived card status must match `card_status_at_publication` of the most
  recent publication. A mismatch triggers immediate re-publication.
- Publication must complete before the corresponding LifecycleEvent is written.
  If publication fails, the state transition does not proceed.

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
| `status` | enum | — | `open`, `resolved_restored`, `resolved_revoked`, `resolved_expired`, `resolved_extended`, `process_failure` |
| `initiated_at` | timestamp | ✓ | Suspension begins |
| `initiated_by` | string | ✓ | Operator ID |
| `reason` | string | ✓ | Stated reason for suspension |
| `deadline` | timestamp | ✓ | `initiated_at + 7 calendar days` |
| `customer_notice_sent_at` | timestamp\|null | — | Set when notice is delivered to customer |
| `customer_notice_channel` | string\|null | — | How the customer was notified |
| `extension_deadline` | timestamp\|null | — | `deadline + 7 calendar days`; null until extended |
| `extension_reason` | string\|null | — | Required if extended |
| `extension_notice_sent_at` | timestamp\|null | — | Set when extension notice is delivered |
| `resolution` | enum\|null | — | `restored`, `revoked`, `expired`, `extended` |
| `resolved_at` | timestamp\|null | — | Set when case is closed |
| `resolved_by` | string\|null | — | Operator ID |
| `resolution_notes` | string\|null | — | Operator notes on resolution decision |

### State-transition table

| From | To | Trigger | Constraint |
|---|---|---|---|
| `open` | `resolved_restored` | Operator restores card | `resolved_at ≤ deadline` or `resolved_at ≤ extension_deadline` |
| `open` | `resolved_revoked` | Operator revokes card | `resolved_at ≤ deadline` or `resolved_at ≤ extension_deadline` |
| `open` | `resolved_expired` | Entitlement expires during suspension | Entitlement.expired_at occurs while case is open |
| `open` | `resolved_extended` | Extension recorded | `NOW() < deadline`; extension_deadline set; notice sent to customer |
| `resolved_extended` | `resolved_restored` | Operator restores after extension | `resolved_at ≤ extension_deadline` |
| `resolved_extended` | `resolved_revoked` | Operator revokes after extension | `resolved_at ≤ extension_deadline` |
| `open` or `resolved_extended` | `process_failure` | `NOW() > extension_deadline` (or `deadline` if not extended) with no resolution | Process failure requiring escalation |

### Cardinality

- At most one SuspensionCase with `status = 'open'` or `status = 'resolved_extended'`
  per card at any time.
- Historical cases (resolved) accumulate; multiple cases per card are expected
  across the card's lifetime.

### Fourteen-day absolute ceiling

The `process_failure` transition is automatic: when a monitoring process
detects that a case has passed its resolution deadline (the later of `deadline`
or `extension_deadline`) without resolution, it transitions the case to
`process_failure` and writes a `suspension_process_failure` lifecycle event.
This state does not automatically restore or revoke the card — it signals
that operator intervention is required. The card remains `SUSPENDED` until
an operator resolves the underlying case.

### Invariants

- A SuspensionCase record is never deleted.
- `deadline = initiated_at + 7 calendar days` (exact); immutable.
- `extension_deadline = deadline + 7 calendar days` (exact) when set; immutable.
- `extension_reason` must be non-null and non-empty before `extension_deadline`
  is set.
- `customer_notice_sent_at` must be set within the same transaction that
  opens the case. A suspension without customer notice is incomplete.
- `resolution_notes` is required for `resolved_revoked`; recommended for all
  resolutions.

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

### SuspensionCase status (see §8 for full table)

```
open ──(7 days, resolved)──► resolved_restored | resolved_revoked | resolved_expired
open ──(extension recorded)──► resolved_extended ──(7 more days, resolved)──► ...
open or resolved_extended ──(deadline passed, unresolved)──► process_failure
```

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
`payment_id`, `payment.amount_cents`, `payment.currency`, `payment.provider`,
`payment.provider_payment_id`, `payment.confirmed_at`, `event_id`, all
LifecycleEvent fields, `publication_id`, all EvidencePublication fields,
`case_id`, `case.initiated_at`, `case.initiated_by`, `case.reason`,
`case.deadline`

### Mutable fields

| Field | Permitted mutations |
|---|---|
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
| `account.status` | Operator-controlled |
| `account.email_verified_at` | Set once |

### Derived fields (never stored on primary records)

- Derived card status (computed from Entitlement + SuspensionCase)
- Provisioning SLA breach flag (`NOW() > entitlement.provisioning_deadline` without activation)
- Grace period active flag (`entitlement.expires_at ≤ NOW() ≤ entitlement.grace_period_ends_at`)
- Renewal notice due flag (`NOW() ≥ entitlement.expires_at - 30 days` and notice not yet sent)
- Suspension process failure flag (`NOW() > effective case deadline` with no resolution)
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
   have `status = 'active'`. (Pilot enforcement.)

4. **Provisioning-before-activation:** `Entitlement.activated_at` may not be
   set unless the corresponding EvidencePublication of type `initial_activation`
   has been successfully written first.

5. **Publication-before-transition:** A state change that requires a new
   EvidencePublication (see §7) must complete the publication before committing
   the state change. If publication fails, the state change is not committed.

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
| EvidencePublication signing fails during route change | Route change rolls back; prior route remains active; `route_changes_used` not incremented; lifecycle event not written |
| SuspensionCase creation fails after card marked suspended in UI | Suspension is not complete; rollback UI state; no customer notice sent; retry cleanly |
| Process monitors fail to fire deadline checks | Manual operator sweep is the fallback; deadlines are stored in records and queryable independently of monitors |

---

## 8. Retention and tombstone rules

No record in V1 is hard-deleted. The following rules apply:

| Record | Tombstone mechanism | Minimum retention |
|---|---|---|
| Account | `status = 'closed'`; sensitive fields zeroed after legal period | Legal minimum (jurisdiction-dependent; at least 7 years for financial records) |
| CoinCard | No deletion; post-expiration records remain for historical traceability | Permanent |
| WalletRoute | No deletion; `superseded` routes are historical evidence | Permanent |
| Entitlement | No deletion; terminal status is the tombstone | Permanent |
| Payment | No deletion; financial record | At least 7 years (legal minimum) |
| LifecycleEvent | No deletion, no mutation | Permanent |
| EvidencePublication | No deletion | Permanent |
| SuspensionCase | No deletion; `process_failure` is a system-generated tombstone status | Permanent |

"Zeroing" sensitive fields on account closure means replacing their values with
a structured null marker (`[REDACTED_AT: <timestamp>]`) rather than SQL NULL,
so the field's prior existence is preserved for audit without retaining personal
data beyond the legal period.

---

## 9. Public-record versus private operational-data boundaries

### Public (no authentication required)

The following are accessible by any party given the card's public URL or handle:

- `CoinCard.handle`, `CoinCard.public_url`
- `WalletRoute.recipient_address` (active route only)
- Derived card status (`ACTIVE`, `EXPIRED`, `REVOKED`, `SUSPENDED`)
- `EvidencePublication`: `published_at`, `manifest_version`, `asset_hashes`,
  `signature`, `signing_key_id`, `card_status_at_publication`

### Customer-accessible (authentication required)

- All public fields for the customer's own card
- `Entitlement`: `status`, `activated_at`, `expires_at`, `route_changes_used`,
  `route_changes_allowed`, `grace_period_ends_at`
- `Payment`: `amount_cents`, `currency`, `status`, `confirmed_at`
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
| $10 for the first year | `Payment.amount_cents = 1000`, `Payment.currency = 'USD'` |
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
| 30-day grace period after expiration | `Entitlement.grace_period_ends_at = expires_at + 30 days`; `grace_period_started` and `grace_period_ended` lifecycle events |
| Slug not immediately reassigned | `CoinCard.handle` is immutable and bound to `card_id` permanently; no reassignment mechanism in V1 |
| 7-day suspension review | `SuspensionCase.deadline = initiated_at + 7 days` |
| Single 7-day extension maximum | `SuspensionCase.extension_deadline = deadline + 7 days`; set at most once |
| 14-day absolute suspension ceiling | `process_failure` status when `NOW() > extension_deadline` (or deadline if no extension) without resolution |
| Customer notice on suspension | `SuspensionCase.customer_notice_sent_at`; atomic with case creation |
| Extension notice to customer | `SuspensionCase.extension_notice_sent_at` |
| Suspension publicly visible | Derived card status = `SUSPENDED` when open SuspensionCase exists; included in signed registry record |
| Revocation distinguishable from expiration | `Entitlement.status = 'revoked'` vs `'expired'`; distinct `entitlement_revoked` vs `entitlement_expired` lifecycle events |
| Every state change creates an event | Transactional invariant 1 (event-first) |
| SIWE + email + 8 recovery codes | `AccountCredential` records (wallet, email); `AccountRecoveryCode` (8 records per activation) |
| Pilot success criteria — customer notices | `renewal_notice_sent`, `customer_notice_sent` lifecycle events; auditable |
| Evidence independent of ImplicitEx availability | `EvidencePublication.signature` + `asset_hashes` verifiable with public key; no ImplicitEx runtime dependency |
