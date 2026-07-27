# Coin Card Commercial Specification — V1

**Status:** LOCKED 2026-07-21 — amended 2026-07-21 (state machine + invariants + failure guarantees + event table + authority matrix added)  
**Type:** Internal source of truth — not customer-facing  
**Purpose:** Single authoritative reference that all public documents derive from. Update this first when the commercial model changes; then propagate changes to Refund Policy, Purchase Terms, Terms of Service, and Privacy Policy.

---

## Product

**Coin Card** — a permanent, named payment identity on the ImplicitEx platform.

---

## Price

**$10 USD** — one-time purchase. No subscription. No renewal.

---

## Ownership

Coin Card remains active indefinitely unless:
- deactivated voluntarily by the owner;
- refunded under the 30-Day Satisfaction Guarantee;
- disabled for violations of the Acceptable Use Policy.

---

## 30-Day Satisfaction Guarantee

- Applies to the **first Coin Card purchase** per account.
- The 30-day period begins on the **purchase date**.
- Eligible refunds return the **full amount paid**, including applicable refundable taxes, to the original payment method.
- ImplicitEx absorbs ordinary payment-processing fees. The customer receives back exactly what they paid.
- Do not reference processor names or fee percentages in customer-facing documents. Processor pricing may change; the promise must not.

---

## What Happens After a Refund

**Deactivation sequence — implementation-critical:**

1. Customer submits refund request. Card remains active at this point.
2. ImplicitEx confirms eligibility (within account, within 30-day window, first-purchase rule).
3. Refund is approved and initiated.
4. **Coin Card is deactivated as part of the approved refund transaction** — not on receipt of request. A mistaken or unauthorized request must not disable a card before ownership is verified.
5. `refundedAt` timestamp is written to registry. Card status → REFUNDED.
6. **Handle enters a recovery hold** (`status: HELD`, `heldUntil = refundedAt + HANDLE_RECOVERY_PERIOD`). No other party can claim it.
7. Original purchaser may repurchase the same handle during the recovery period.
8. After `heldUntil`, handle status → AVAILABLE and returns to the public registry.

Customer-facing language uses "limited recovery period" — no specific duration stated — so `HANDLE_RECOVERY_PERIOD` can be adjusted operationally without rewriting policy copy.

---

## Registry Lifecycle

```
AVAILABLE
    ↓  (purchase)
ACTIVE
    ↓  (refund requested and approved)
REFUNDED  ←  card deactivated at this transition
    ↓  (recovery period begins)
HELD
    ↓  (HANDLE_RECOVERY_PERIOD expires)
AVAILABLE
```

Additional lifecycle states (not triggered by refund):
- `SUSPENDED` — policy violation, admin hold
- `VOLUNTARY_CLOSE` — owner-initiated deactivation (future)

### Registry status fields — two distinct objects

The card and the handle are related assets but must not share one overloaded `status` field. Each has an independent lifecycle.

```
cardStatus:   ACTIVE | REFUNDED | REVOKED
handleStatus: RESERVED | HELD | AVAILABLE
```

- Card REFUNDED does not imply handle AVAILABLE — handle moves to HELD, not AVAILABLE.
- A handle can be HELD while the card is REFUNDED.
- Future states (SUSPENDED, VOLUNTARY_CLOSE) affect `cardStatus` without necessarily releasing the handle.

### Registry timestamp fields

| Field | Set when |
|---|---|
| `activatedAt` | Card goes live after purchase |
| `refundedAt` | Refund approved and card deactivated |
| `heldUntil` | `refundedAt + HANDLE_RECOVERY_PERIOD` |
| `releasedAt` | Handle returned to public pool |
| `releaseReason` | `RECOVERY_PERIOD_EXPIRED` \| `ADMIN` \| `LEGAL` \| `VOLUNTARY` |

Every transition is explicit. No state is inferred from absence of a field.

---

## Purchase Provisioning State Machine

This state machine defines the authoritative purchase lifecycle. It is the contract for the payment processor, the registry, and the provisioning service. The detailed implementation rules live in `COIN_CARD_PURCHASE_PROVISIONING_ARCHITECTURE_V1.md`; this section defines the commercial meaning of each state.

### State diagram

```
PAYMENT_INITIATED
        │
        ▼
PAYMENT_AUTHORIZED
        │
        ▼
PAYMENT_CAPTURED ─────────────────────────────────────┐
        │                                             │
        ▼                                             │ (charge.refunded
PROVISIONING_STARTED                                  │  webhook received
        │                                             │  after ACTIVE)
        ├──────────────────┐                          │
        ▼                  ▼                          │
  PROVISIONED        PROVISION_FAILED                 │
        │                  │                          │
        ▼                  ▼                          │
     ACTIVE          MANUAL_REVIEW                    │
        │                                             │
        ◄─────────────────────────────────────────────┘
        │
        ├─ [refund approved]
        ▼
    REFUNDED ──► handle HELD ──► handle AVAILABLE
                               (after HANDLE_RECOVERY_PERIOD)
```

### State definitions

| State | Commercial meaning | Authoritative record | Customer-visible |
|---|---|---|---|
| `PAYMENT_INITIATED` | PaymentIntent created; checkout in progress | Order: PENDING; Stripe PaymentIntent | No |
| `PAYMENT_AUTHORIZED` | Funds reserved by card issuer; not yet settled | Stripe PaymentIntent status | No |
| `PAYMENT_CAPTURED` | Payment settled; money received | Order: PAID; Stripe event | No |
| `PROVISIONING_STARTED` | Registry record being written | Order: PROVISIONING | No |
| `PROVISIONED` | Manifest written; registry record created | Order: COMPLETE; registry record | Transition to ACTIVE |
| `ACTIVE` | Card live; handle routes payments | Registry record: cardStatus ACTIVE | Yes — card is usable |
| `PROVISION_FAILED` | Provisioning failed after all retries | Order: PROVISIONING_FAILED | No — escalate to ops |
| `MANUAL_REVIEW` | Operator intervention required | Order + internal flag | No |
| `REFUNDED` | Refund settled; card deactivated | Order: REFUNDED; registry: cardStatus REFUNDED | Yes — card deactivated |

### Per-state rules

**PAYMENT_INITIATED**
- Idempotent: yes — same PaymentIntent returned for same order_id
- Retryable: yes — customer may reattempt payment
- Immutable fields: handle, wallet_address, amount, account_id
- Rollback: handle reservation expires after TTL if payment is not completed

**PAYMENT_AUTHORIZED**
- Authoritative record: Stripe (ImplicitEx does not write state during authorization)
- Idempotent: Stripe handles
- Human intervention: not required; authorization lapses automatically if not captured

**PAYMENT_CAPTURED**
- Trigger: `payment_intent.succeeded` webhook
- Idempotent: yes — webhook handler is a no-op if order is already PAID or later
- Immutable after this point: amount_cents, currency, stripe_customer_id, paid_at
- The order must reach COMPLETE before the commercial promise is satisfied. PAYMENT_CAPTURED alone is not fulfillment.

**PROVISIONING_STARTED → PROVISIONED**
- Idempotent: yes — provisioning keyed on order_id; existing ACTIVE registry record → no-op
- Retryable: yes — reconciliation job re-enters on failure
- Immutable after PROVISIONED: manifest_hash, card_id, activated_at, wallet_address bound to card
- Rollback: not permitted after payment is captured; provisioning failure requires recovery, not reversal

**PROVISION_FAILED → MANUAL_REVIEW**
- Trigger: provisioning retry count exceeds threshold
- Human intervention required: operator must investigate and either re-provision or initiate a full refund
- Do not automatically refund on provisioning failure — this is an operational incident, not a customer request
- The handle remains RESERVED while manual review is active

**ACTIVE**
- Card is commercially live. All registry evidence is valid.
- Immutable: card_id, handle, activated_at, original wallet_address (V1)
- Mutable: future versions may allow wallet address updates as a separate operation

**REFUNDED**
- Only reachable via the charge.refunded webhook following an approved refund_request
- A refund_request in PENDING_REVIEW or APPROVED state does not move the card to REFUNDED
- Immutable after this point: refundedAt, heldUntil
- Handle: transitions to HELD, not AVAILABLE (see Registry Lifecycle above)

### What is never permitted

- Provisioning without a preceding PAYMENT_CAPTURED event
- Deactivating a card on receipt of a refund request (deactivation requires approval + settlement)
- Releasing a handle directly from ACTIVE to AVAILABLE (handle must pass through HELD)
- Inferring any state from absence of a field — every transition is explicit

### Event table

The complete set of legal state transitions. Any transition not listed here is not permitted. When writing a switch statement, event handler, or reconciliation branch, this table is the authority.

| Event | From state | To state | Idempotent | Notes |
|---|---|---|---|---|
| `checkout_initiated` | AVAILABLE | PAYMENT_INITIATED | No | Creates order + reserves handle |
| `payment_intent.succeeded` | PAYMENT_INITIATED | PAYMENT_CAPTURED | Yes | Stripe webhook; no-op if already CAPTURED or later |
| `payment_intent.payment_failed` | PAYMENT_INITIATED | PAYMENT_INITIATED | Yes | Customer may retry; handle reservation TTL continues |
| `checkout_abandoned` | PAYMENT_INITIATED | FAILED | Yes | TTL expired, no CAPTURED event |
| `provisioning_started` | PAYMENT_CAPTURED | PROVISIONING_STARTED | Yes | Internal trigger after webhook |
| `provisioning_complete` | PROVISIONING_STARTED | ACTIVE | Yes | Manifest written; registry record ACTIVE |
| `provisioning_failed` | PROVISIONING_STARTED | PROVISION_FAILED | Yes | Retry count exhausted |
| `reconciliation_retry` | PROVISION_FAILED | PROVISIONING_STARTED | Yes | Reconciliation job re-enters provisioning |
| `manual_re_provision` | MANUAL_REVIEW | PROVISIONING_STARTED | Yes | Operator forces retry after investigation |
| `manual_refund_decision` | MANUAL_REVIEW | (triggers refund path) | No | Operator decides recovery is not possible |
| `refund_request_received` | ACTIVE | ACTIVE | No | Creates refund_request; card status unchanged |
| `refund_request_denied` | ACTIVE | ACTIVE | Yes | refund_request marked DENIED; card unchanged |
| `refund_approved` | ACTIVE | ACTIVE (pending Stripe) | No | Initiates Stripe refund; card still ACTIVE until settled |
| `charge.refunded` | ACTIVE | REFUNDED | Yes | Stripe webhook; card REFUNDED, handle HELD |
| `handle_ttl_expired` | RESERVED | AVAILABLE | Yes | Reconciliation job; no CAPTURED order found |
| `held_until_reached` | HELD | AVAILABLE | Yes | Reconciliation job; HANDLE_RECOVERY_PERIOD elapsed |

**Reading the table:**
- "From state" refers to the purchase provisioning state (left column of the state definitions table above).
- Events marked idempotent: receiving the same event twice produces no additional state change.
- Events marked not idempotent: the first occurrence has side effects (creates a record, initiates a Stripe call) that must not be repeated. Guards must prevent duplicate processing.
- `charge.refunded` is the only event that moves a card from ACTIVE to REFUNDED. No other event may cause that transition.

---

## Commercial Invariants

These must hold at every point in the system, forever. They are not implementation guidelines — they are commercial commitments that the implementation must preserve. A violation of any invariant is a bug that must be corrected before any customer-facing behavior continues.

**Identity invariants**
1. One handle is owned by at most one active card at any time.
2. One purchase creates at most one Coin Card.
3. One payment cannot provision two cards.
4. A card belongs to exactly one account and cannot be transferred.

**Lifecycle invariants**
5. A REFUNDED card is never ACTIVE.
6. A HELD handle is never AVAILABLE.
7. A card reaches REFUNDED status only via the charge.refunded webhook following an approved refund_request. Receipt of a refund request alone does not change card status.
8. A handle transitions from ACTIVE to HELD on refund, not from ACTIVE to AVAILABLE.
9. Every state transition is recorded with an explicit timestamp. No state is inferred from absence of a field.

**Payment invariants**
10. Provisioning never begins without a confirmed PAYMENT_CAPTURED event.
11. A customer is never charged twice for the same order.
12. A customer who has paid is never left without a card and without a refund. PROVISION_FAILED requires manual resolution, not silent abandonment.

**Idempotency invariants**
13. Provisioning is idempotent on order_id. Running it twice produces the same end state as running it once.
14. Webhook handlers are idempotent on event type + entity ID. A duplicate webhook produces no additional state change.

**Registry invariants**
15. The registry record is the authoritative source of truth for card and handle status. Stripe is authoritative for payment events. Neither substitutes for the other.
16. The registry signature is regenerated whenever registry_status, card_status, handle_status, or manifest_hash changes. A stale signature is not valid.

**Legal invariants**
17. The 30-Day Satisfaction Guarantee covers the first Coin Card purchase per account only.
18. An account receives at most one guarantee refund.
19. The commercial promise (price, guarantee scope, refund amount, handle behavior) is set by this specification. Implementation must not narrow or expand the promise without updating this document first.

---

## Failure Guarantees

These are observable promises about system behavior under failure conditions. They are not implementation notes — they are commercial commitments. A customer or auditor inspecting behavior after a failure should find these guarantees satisfied.

**A payment failure never provisions a card.**
Provisioning requires a PAYMENT_CAPTURED event. A failed or abandoned payment produces no PAYMENT_CAPTURED event. No card is created, no handle is permanently affected. The handle reservation expires after TTL and returns to AVAILABLE.

**A provisioning failure never charges twice.**
Payment is captured before provisioning begins. If provisioning fails, the payment has already been taken once. Recovery re-attempts provisioning against the same order; it does not create a new PaymentIntent. The customer is never charged again for the same order.

**A duplicate webhook never creates a duplicate card.**
Webhook handlers guard on event type and entity ID. If a `payment_intent.succeeded` event arrives a second time for an order already at PAYMENT_CAPTURED or later, it is a no-op. If provisioning is triggered twice for the same order_id, the second run finds an existing ACTIVE registry record and exits without writing. One payment, one card, always.

**A timeout never changes customer ownership.**
Every state transition requires an explicit event. If a request times out, crashes, or is abandoned mid-flight, the state machine remains in its last committed state. No implicit transition occurs. The reconciliation job identifies stalled states and re-enters them explicitly.

**Every order has exactly one terminal state.**

| Terminal state | Meaning |
|---|---|
| `COMPLETE` | Card delivered; customer has product |
| `REFUNDED` | Money returned; card deactivated |
| `FAILED` | Checkout abandoned; no charge; no card |

`PROVISION_FAILED` and `MANUAL_REVIEW` are not terminal — they are recovery states that resolve to `COMPLETE` (re-provisioned) or `REFUNDED` (operator decision). An order that cannot reach `COMPLETE` must reach `REFUNDED`. There is no fourth outcome.

---

## Authority Matrix

When two records or systems report conflicting facts, this table determines which one governs. The lower authority must be corrected to match the higher authority — never the reverse.

| Question | Authority | What it establishes |
|---|---|---|
| Did payment actually occur? | Stripe | Stripe is the payment processor of record. Payment facts are not inferred from order state. |
| Where is this purchase in the fulfillment lifecycle? | Order Record | The order record is the source of truth for purchase state from PENDING through COMPLETE or REFUNDED. |
| Is this Coin Card valid and active? | Registry Record | The registry record is the source of truth for card and handle status visible to verifiers and the embed. |
| What handle status is publicly visible? | Registry Record | `registry_status` in the registry record is what external parties see. Internal `cardStatus` and `handleStatus` are not exposed directly. |
| Which state transitions are legal? | Event Table (this document, § Purchase Provisioning State Machine) | Any transition not in the event table is not permitted. Implementation must not invent transitions. |
| What are the commercial rules? | This document | Price, guarantee scope, refund amount, handle behavior, terminal states. If implementation conflicts with this document, implementation is wrong. |
| What are the legal commitments? | Published legal documents | Refund Policy, Purchase Terms, Terms of Service, Privacy Policy. These derive from this spec. If they conflict with this spec, update this spec first, then update the legal documents. |
| Who submitted the refund request and when? | Refund Request Record | The refund_request record is the authoritative log of refund eligibility review. |
| Who is the customer relationship? | Account Record | Abuse detection and guarantee eligibility are account-scoped. Wallet addresses and emails are corroborating signals, not primary identity. |
| What is the single customer contact address? | `support@implicitex.com` | All customer-facing documents and all site pages. `connect@implicitex.com` is a legacy address; migrate on publication of Coin Card legal pages. |

**Conflict resolution rule:** If Stripe and the Order Record disagree on payment status, Stripe governs; reconcile the order. If the Order Record and the Registry disagree on card status, the Order Record governs; reconcile the registry. If any implementation state disagrees with this document, this document governs; update implementation, not the spec.

---

## Data Retention After Deactivation

Records are retained for:
- accounting and tax compliance;
- fraud prevention and refund abuse detection;
- legal compliance.

The Privacy Policy must disclose what is collected and why.

---

## Refund Abuse

- Compound identity: `{stripe_customer_id, verified_email, wallet_address}`. The Stripe customer ID is the most stable anchor.
- Flag — do not automatically ban — any account where the email or wallet has prior refund history.
- At MVP scale, flagged accounts require manual review before a second card is issued.
- Repeated or manipulative refund requests may result in future purchases being declined.
- Do not permanently ban wallet addresses. Wallets are cheap; accounts are the customer relationship.

---

## Subscriptions

**Deferred post-MVP.** Do not build subscription infrastructure before the one-time purchase flow is live and validated. Subscriptions require dunning policy, grace periods, and deactivation logic that add non-trivial complexity before recurring value has been demonstrated.

---

## Documents Derived From This Specification

| Document | Derives | Audience |
|---|---|---|
| Refund Policy | Guarantee, after-refund behavior, abuse clause | Customer |
| Coin Card Purchase Terms | Price, ownership, deactivation, refund reference | Customer at checkout |
| Terms of Service | Incorporates Purchase Terms by reference; platform-wide | Customer |
| Privacy Policy | Data collection, retention after deactivation | Customer |
| Acceptable Use Policy | Misuse of Coin Card identity, grounds for disablement | Customer |
| Purchase and Provisioning Architecture V1 | States, order record, idempotency, failure recovery, refund flow | Engineering |
| Engineering Implementation Rules V1 | How the system must be built; idempotency, logging, testing, authority discipline | Engineering |
| Backend Architecture V1 | Runtime topology, trust boundaries, atomicity, failure paths, implementation sequence | Engineering |

**Coin Card Purchase Terms** is a short product-specific agreement incorporated into the main Terms of Service by reference — not a second, independent ToS. The customer must see one consistent commercial promise across all surfaces.

---

## Implementation Constants

```js
HANDLE_RECOVERY_PERIOD = 90  // days — adjust without rewriting policy copy
```

---

## Deployment Gate

**Purchase-flow architecture and internal implementation may begin now. No paid checkout may be deployed or accepted until:**

1. Attorney review of all four customer-facing legal documents is complete.
2. Public legal pages (Refund Policy, Purchase Terms, Privacy Policy, Terms of Service), checkout copy, registry behavior, and implementation tests all agree.

Development does not wait on legal review. The gate is deployment, not implementation start.

---

## Contact Address

`support@implicitex.com` is the single customer contact address for all Coin Card matters. All customer-facing documents must use this address. The existing site pages that reference `connect@implicitex.com` must be updated to `support@implicitex.com` when Coin Card legal changes are published.

---

*This document is the source of truth. All public documents must agree with it. If a public document contradicts this spec, the spec governs — update the public document, not the spec, unless the commercial model itself has changed.*
