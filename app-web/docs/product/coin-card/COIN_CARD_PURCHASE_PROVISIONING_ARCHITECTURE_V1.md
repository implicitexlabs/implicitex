# Coin Card Purchase and Provisioning Architecture — V1

**Status:** DRAFT 2026-07-21
**Type:** Internal architecture document — not customer-facing
**Authority chain:**

```text
COIN_CARD_COMMERCIAL_SPEC_V1.md
    -> this document
    -> implementation
```

**Derived from:** COIN_CARD_COMMERCIAL_SPEC_V1.md, REGISTRY_MODEL.md, MANIFEST_SCHEMA.md
**Do not implement Stripe wiring until attorney review is complete and the deployment gate in COIN_CARD_COMMERCIAL_SPEC_V1.md is satisfied.**

---

## Purpose

This document defines the states, authoritative records, idempotency rules, and failure recovery model for the Coin Card purchase and provisioning flow. It does not specify UI or Stripe API calls — those follow from this contract.

---

## Scope

- Handle reservation and lifecycle from checkout initiation through activation
- The order record as the durable anchor for all payment and provisioning state
- Provisioning steps that write to the existing registry model
- Failure window between payment success and provisioning completion
- Refund flow, including the two-step commercial-to-registry state translation
- Reconciliation job responsibilities

## Non-Scope

- Stripe API request shapes
- Frontend checkout UX
- Email template content
- The publisher MVP flow (self-sovereign, free tier) — different authority chain
- Multi-handle purchases — not in V1

---

## The Two Registry Vocabularies

The commercial spec and the registry model use overlapping terms with different meanings. These must not be conflated.

**Internal commercial states** (live inside the order and registry records, never directly shown to external verifiers):

```
cardStatus:   ACTIVE | REFUNDED | REVOKED
handleStatus: RESERVED | HELD | AVAILABLE
```

**External registry status** (what `REGISTRY_MODEL.md` defines; what verifiers and the embed see):

```
ACTIVE | PAUSED | REVOKED | SUPERSEDED | EXPIRED | UNKNOWN
```

**Translation rule:**
- `cardStatus: ACTIVE` → registry record `status: ACTIVE`
- `cardStatus: REFUNDED` → registry record `status: REVOKED`
- `cardStatus: REVOKED` (AUP violation) → registry record `status: REVOKED`

`REFUNDED` is an internal accounting state. Externally, a refunded card is revoked — the handle no longer routes payments. The registry does not expose refund history to verifiers.

---

## The Order Record

The order record is the authoritative anchor for all purchase and provisioning state. Payment is authoritative for payment events (Stripe). The order record is authoritative for product state.

Every other record — registry entry, refund request, email log — references the order by `order_id`.

### Order status lifecycle

```
PENDING
  |
  ├─ [checkout abandoned / payment failed / TTL expired]
  ↓
FAILED
  
PENDING
  |
  ├─ [payment_intent.succeeded webhook received]
  ↓
PAID
  |
  ├─ [provisioning starts]
  ↓
PROVISIONING
  |
  ├─ [manifest generated, registry record written, activation timestamps set]
  ↓
COMPLETE
  |
  ├─ [refund approved]
  ↓
REFUNDED
```

`PROVISIONING` is a transient state that survives process death — if the service restarts, the reconciliation job finds orders stuck in `PROVISIONING` and re-enters the provisioning step.

### Order record fields

```
id                   UUID, primary key
account_id           FK to accounts
handle               The reserved handle (e.g. "alice")
wallet_address       Buyer-provided recipient wallet
buyer_signature      The wallet signature collected during checkout
payment_intent_id    Stripe PaymentIntent ID, unique
stripe_customer_id   Stripe Customer ID
amount_cents         Always 1000 at V1
currency             "usd"
status               PENDING | PAID | PROVISIONING | COMPLETE | FAILED | REFUNDED
created_at
paid_at
provisioning_started_at
completed_at
failed_at
refunded_at
```

The `buyer_signature` field stores the EIP-191 signature collected during checkout — the buyer signs a message binding their chosen handle to their wallet address. This signature is used during provisioning to construct the manifest. It is collected before payment so provisioning can complete asynchronously without requiring the buyer's wallet connection.

---

## Handle Reservation

A handle cannot be in two orders simultaneously. The registry enforces a unique constraint on handle across `RESERVED` and `ACTIVE` states.

### Handle status lifecycle

```
AVAILABLE
    |
    ├─ [checkout initiated, TTL set]
    ↓
RESERVED  ←── has reservedUntil timestamp
    |
    ├─ [order FAILED or TTL expired with no PAID order]
    ↓
AVAILABLE

RESERVED
    |
    ├─ [order reaches COMPLETE]
    ↓
ACTIVE
    |
    ├─ [refund approved]
    ↓
HELD  ←── has heldUntil timestamp
    |
    ├─ [heldUntil reached]
    ↓
AVAILABLE
```

### Reservation TTL

A `RESERVED` handle with no corresponding `PAID` or later order is released to `AVAILABLE` after the TTL expires. The TTL must be long enough to cover normal checkout completion (including Stripe's 3DS flow) but short enough that abandoned checkouts do not lock handles indefinitely.

```js
HANDLE_RESERVATION_TTL = 30  // minutes — sufficient for checkout; adjust operationally
```

The reconciliation job enforces TTL expiry. The handle is never auto-released by the checkout session itself.

---

## Full Purchase Flow

### Phase 1 — Pre-checkout (before payment intent is created)

```
1. Availability check
   Input: requested handle
   Action: query registry for handleStatus
   Gate: handleStatus must be AVAILABLE; any other status → reject with "handle not available"
   Note: availability is checked again at reservation time; this check is informational

2. Account resolution
   Input: email address
   Action: create account if new; if existing, verify email is already confirmed
   Gate: email must be verified before proceeding to payment

3. Wallet verification
   Input: wallet address
   Action: present a sign-in message binding the handle to the wallet address
   Gate: valid EIP-191 signature required; server verifies ecrecover matches wallet_address
   Note: this signature becomes the buyer_signature stored on the order record and used
         during manifest generation. Collecting it here means provisioning does not
         require the buyer's wallet connection to be live after payment.
```

### Phase 2 — Checkout initiation (order and payment intent created)

```
4. Handle reservation
   Action: write registry record with handleStatus: RESERVED, reservedUntil: now + TTL
   Note: this write must be atomic with the unique constraint check; two concurrent
         requests for the same handle must result in exactly one RESERVED record

5. Order creation
   Action: write order record with status: PENDING, all collected fields
   Idempotency: one PENDING order per (account_id, handle) at a time;
                concurrent requests return the existing order

6. PaymentIntent creation
   Action: create Stripe PaymentIntent
   Idempotency key: order_id
   Metadata: { order_id, handle, account_id, wallet_address }
   Note: Stripe is authoritative for payment events; metadata is for webhook routing only

7. Return client_secret to frontend
```

### Phase 3 — Payment (Stripe-side)

```
8. Frontend confirms payment
   (Stripe handles 3DS, card validation, etc.)

9. Stripe fires payment_intent.succeeded webhook
```

### Phase 4 — Webhook handling

```
10. Receive webhook, verify Stripe signature
11. Look up order by payment_intent_id
    Guard: if order not found → log and alert; do not proceed
    Guard: if order.status is already PAID, PROVISIONING, COMPLETE, or REFUNDED → no-op (idempotent)
12. Set order.status = PAID, order.paid_at = now
13. Enqueue provisioning job
```

Webhook handling is intentionally minimal. It writes one status transition and hands off. Provisioning is a separate step so a webhook timeout does not leave the system in an inconsistent state.

### Phase 5 — Provisioning

Provisioning is idempotent. Running it twice on the same order_id must produce the same outcome as running it once. Before writing anything, the provisioning job checks whether a registry record for this order already exists in `ACTIVE` state.

```
14. Load order record; verify status is PAID or PROVISIONING
15. Set order.status = PROVISIONING, order.provisioning_started_at = now
16. Check: does an ACTIVE registry record already exist for this handle bound to this order_id?
    If yes → provisioning already completed; jump to step 22 (mark COMPLETE)

17. Verify handle is still RESERVED for this order
    Guard: if handle has been released (TTL expired, taken by another order) → escalate;
           this state should not be reachable if TTL and ordering constraints are correct

18. Generate canonical manifest payload
    Inputs: handle, wallet_address, buyer_signature, network, asset, created_at
    Output: canonical JSON payload per MANIFEST_SCHEMA.md

19. Sign manifest with ImplicitEx registry key
    The registry key is the issuer wallet. This establishes ImplicitEx as the identity claim authority.
    Output: signed manifest with registry_signature

20. Write manifest to registry store
    Path: registry/coincards/<handle>.json

21. Write registry record
    Fields:
      card_id:        coincard:implicitex:<handle>
      handle:         <handle>
      order_id:       <order_id>
      account_id:     <account_id>
      wallet_address: <wallet_address>
      card_status:    ACTIVE
      handle_status:  ACTIVE  (transitions from RESERVED)
      manifest_uri:   <resolved public URI>
      manifest_hash:  sha256 of canonical manifest bytes
      registry_status: ACTIVE  (external verifier view)
      activated_at:   now
      reserved_until: null  (cleared on activation)

22. Mark order.status = COMPLETE, order.completed_at = now
23. Send activation confirmation email to account email address
```

---

## Failure Recovery

### Payment fails (normal path)

The Stripe webhook fires `payment_intent.payment_failed`. The order is marked `FAILED`. The handle reservation TTL is left to expire naturally — the reconciliation job will release it. No immediate handle release is needed.

### Payment succeeds; provisioning fails

This is the critical failure window. Payment has been taken; product has not been delivered.

**Invariant: never charge twice, never leave a paid customer with no card.**

Recovery path:
1. The order remains in `PAID` or `PROVISIONING` status.
2. The reconciliation job finds orders that have been in `PAID` status for more than N minutes without reaching `COMPLETE`.
3. The reconciliation job re-enters the provisioning step. Because provisioning is idempotent on `order_id`, this is safe to run multiple times.
4. If provisioning continues to fail after M retries, escalate to manual review. The order status transitions to a `PROVISIONING_FAILED` hold state. Do not refund automatically — this is an operational failure, not a customer refund request.
5. The handle remains `RESERVED` while reconciliation is active. It is not released until either: (a) provisioning succeeds, or (b) an operator makes a manual decision.

```js
PROVISIONING_RETRY_DELAY_MINUTES = 5   // reconciliation job interval
PROVISIONING_MAX_RETRIES         = 6   // 30 minutes before manual escalation
```

### Webhook fires twice

The webhook handler guards on order status. If the order is already `PAID` or later, the handler is a no-op. The provisioning idempotency check on step 16 handles the case where provisioning was triggered twice concurrently.

### Checkout session abandoned (no payment)

The order stays `PENDING`. The handle stays `RESERVED` until the TTL expires. The reconciliation job checks for handles whose `reservedUntil` is past and whose corresponding order has no `PAID` or later status, then transitions the handle to `AVAILABLE` and the order to `FAILED`.

---

## Refund Flow

Refund flow requires a manual or automated eligibility check before any state changes. A refund request alone does not deactivate the card. This is an invariant from the commercial spec.

```
1. Receive refund request (via support@implicitex.com or future self-service form)
2. Write refund_request record: status PENDING_REVIEW
3. Eligibility check:
   a. Is there a COMPLETE order for this account_id? → identifies the order
   b. Is this the account's first Coin Card purchase? → first-purchase rule
   c. Is paid_at within 30 days of now? → 30-day window
   d. Has this account already received a guarantee refund? → one-refund-per-account rule
   Gate: all four must pass. If any fail, deny and record reason in refund_request.
4. If eligible:
   a. Mark refund_request.status = APPROVED, refund_request.approved_at = now
   b. Initiate Stripe refund (idempotency key: refund_request_id)
   c. Stripe fires charge.refunded webhook
5. On charge.refunded webhook:
   a. Set order.status = REFUNDED, order.refunded_at = now
   b. Set card_status = REFUNDED
   c. Set handle_status = HELD
   d. Set registry record: card_status = REFUNDED, handle_status = HELD
   e. Set registry record: registry_status = REVOKED (external verifier view)
   f. Set refundedAt = now
   g. Set heldUntil = refundedAt + HANDLE_RECOVERY_PERIOD (90 days)
   h. Write updated registry record with new registry_signature
   i. Send refund confirmation email
```

The `charge.refunded` webhook is the trigger for deactivation — not the refund approval. Approval creates the Stripe refund; the webhook confirms it was processed. If the webhook does not arrive, the order stays `COMPLETE` and the card stays `ACTIVE`. The reconciliation job should check for orders in an approved-refund-pending state that have not received a `charge.refunded` event within a reasonable window, and alert for manual review.

---

## Handle Recovery → Release

The reconciliation job is also responsible for the handle recovery-to-release transition.

```
Find registry records where:
  handle_status = HELD
  heldUntil <= now

For each:
  Set handle_status = AVAILABLE
  Set registry_status = REVOKED  (already set at refund time; verify)
  Set releasedAt = now
  Set releaseReason = RECOVERY_PERIOD_EXPIRED
  Write updated registry record with new registry_signature
```

This transition does not send a notification. The original buyer was notified at refund time that the handle would return to the public pool after the recovery period.

---

## Reconciliation Job — Responsibility Summary

The reconciliation job is the only process that drives time-based state transitions. All other transitions are event-driven.

| Condition | Action |
|---|---|
| Order in PAID for > N minutes, not COMPLETE | Re-trigger provisioning |
| Order in PROVISIONING for > M retries | Escalate to manual review |
| RESERVED handle with expired TTL, order not PAID or later | Release handle to AVAILABLE; mark order FAILED |
| HELD handle with heldUntil in the past | Release handle to AVAILABLE; set releasedAt + releaseReason |
| Approved refund with no charge.refunded webhook in > N minutes | Alert for manual review |

---

## Refund Abuse Detection

The compound abuse identity is `{stripe_customer_id, verified_email, wallet_address}`. The Stripe customer ID is the most stable anchor because wallets and email addresses can be varied.

At eligibility check time:

```
Flag if:
  - Any other order shares the same stripe_customer_id and has been refunded
  - Any other order shares the same verified_email and has been refunded
  - Any other order shares the same wallet_address and has been refunded

Flagged orders: do not automatically deny; require manual review before approval.
```

Do not permanently ban wallet addresses. A wallet address is not the customer relationship — the account is. Future purchases from flagged accounts require operator review before a second card is issued.

---

## Schema Direction

These are the tables and fields the provisioning architecture requires. Schema migration and ORM mapping are implementation decisions.

### `orders`

```
id                        uuid, pk
account_id                fk → accounts
handle                    text, not null
wallet_address            text, not null
buyer_signature           text, not null  -- EIP-191 signature from checkout
payment_intent_id         text, unique, not null
stripe_customer_id        text, not null
amount_cents              integer, default 1000
currency                  text, default 'usd'
status                    enum: PENDING|PAID|PROVISIONING|COMPLETE|FAILED|REFUNDED|PROVISIONING_FAILED
provisioning_retry_count  integer, default 0
created_at                timestamptz
paid_at                   timestamptz
provisioning_started_at   timestamptz
completed_at              timestamptz
failed_at                 timestamptz
refunded_at               timestamptz
```

Unique constraint: one non-FAILED order per handle at a time (enforced at application layer before reservation; rely on handle_status uniqueness in registry as the hard constraint).

### `registry_records`

```
handle                text, pk
card_id               text, not null  -- coincard:implicitex:<handle>
order_id              uuid, fk → orders
account_id            fk → accounts
wallet_address        text, not null
card_status           enum: ACTIVE|REFUNDED|REVOKED
handle_status         enum: RESERVED|HELD|AVAILABLE
registry_status       enum: ACTIVE|PAUSED|REVOKED|SUPERSEDED|EXPIRED|UNKNOWN
manifest_uri          text
manifest_hash         text  -- sha256:<hex>
reserved_until        timestamptz  -- null after activation
activated_at          timestamptz
refunded_at           timestamptz
held_until            timestamptz
released_at           timestamptz
release_reason        enum: RECOVERY_PERIOD_EXPIRED|ADMIN|LEGAL|VOLUNTARY
registry_signature    text  -- the registry record signature per REGISTRY_MODEL.md
updated_at            timestamptz
```

`card_status` and `handle_status` are the internal commercial states. `registry_status` is the external verifier-facing value. They are separate columns on the same record.

### `refund_requests`

```
id                    uuid, pk
order_id              uuid, fk → orders, unique
account_id            fk → accounts
requested_at          timestamptz
reviewed_at           timestamptz
approved_at           timestamptz
denied_at             timestamptz
stripe_refund_id      text
status                enum: PENDING_REVIEW|APPROVED|DENIED
eligibility_flags     jsonb  -- abuse flag detail; stored for audit trail
denial_reason         text
notes                 text  -- internal operator notes
```

One refund_request per order. Duplicate refund requests reference the same record.

---

## Idempotency Rules

| Operation | Idempotency key | Behavior on duplicate |
|---|---|---|
| Handle reservation | handle | Second write rejected by unique constraint; caller receives existing reservation |
| Order creation | (account_id, handle) for non-FAILED orders | Return existing order; do not create second |
| PaymentIntent creation | order_id (Stripe idempotency key) | Stripe returns same PaymentIntent |
| Provisioning | order_id | Check for existing ACTIVE registry record; no-op if found |
| Webhook: payment_intent.succeeded | payment_intent_id | Guard on order status; no-op if already PAID or later |
| Webhook: charge.refunded | stripe_refund_id | Guard on order status; no-op if already REFUNDED |
| Stripe refund initiation | refund_request_id (Stripe idempotency key) | Stripe returns same refund |

---

## Invariants

These must hold at every point in the system. Violations are bugs.

1. **One active handle per name.** No two registry records share a handle in RESERVED or ACTIVE handle_status simultaneously.

2. **Payment precedes provisioning.** An order must reach PAID status (confirmed by webhook) before provisioning begins. Provisioning is never triggered by the client.

3. **Deactivation requires approval.** A card reaches REFUNDED status only via the `charge.refunded` webhook path, which requires a prior approved refund_request. A PENDING_REVIEW refund_request does not change card or handle status.

4. **Handle is HELD before AVAILABLE after refund.** A refunded card's handle transitions from ACTIVE → HELD, not ACTIVE → AVAILABLE. It becomes AVAILABLE only after heldUntil is past.

5. **The order record is the source of truth for product state.** Stripe is the source of truth for payment events. Never infer order status from Stripe events alone; always write it explicitly.

6. **Registry signature is regenerated on every status change.** Whenever registry_status, card_status, handle_status, or manifest_hash changes, the registry_signature field must be recomputed and stored. Stale signatures are rejected by verifiers.

7. **Provisioning is idempotent.** Running provisioning twice on the same order_id must produce the same end state as running it once. No field may be set to a value that depends on how many times provisioning has run.

---

## What Comes Next

This document defines the contract. Implementation follows:

1. **Schema migration** — create orders, registry_records, refund_requests tables
2. **Handle reservation service** — atomic check-and-reserve with TTL
3. **Checkout API** — account resolution, wallet verification, reservation, PaymentIntent creation
4. **Webhook handler** — payment_intent.succeeded, charge.refunded
5. **Provisioning service** — manifest generation, registry signing, activation
6. **Reconciliation job** — retry loop, TTL expiry, HELD → AVAILABLE release
7. **Refund eligibility service** — four-point eligibility check, abuse flagging
8. **Tests** — every idempotency rule and every invariant must have a test case

The deployment gate in COIN_CARD_COMMERCIAL_SPEC_V1.md applies to steps 2–8. Steps 1 and schema design may proceed before attorney review is complete; no live payment traffic may be accepted until the gate is satisfied.

---

*This document derives from COIN_CARD_COMMERCIAL_SPEC_V1.md. If a decision in this document conflicts with the spec, the spec governs — update this document, not the spec, unless the commercial model itself has changed.*
