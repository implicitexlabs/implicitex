# Coin Card Stripe Checkout V1

**Status:** Governing checkout specification — draft for ratification  
**Governing documents:**
- `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `b3bdc08`
- `COIN_CARD_DATA_MODEL_V1.md` at `193dcfa`
- `COIN_CARD_CUSTOMER_WORKFLOWS_V1.md` at `39ecd95`
- `COIN_CARD_BUSINESS_OPERATIONS_V1.md` at `ae0d4aa`

**External authority:** Stripe API version `2024-06-20`. The implementor must
verify the current stable Stripe API version and update this document before
implementation begins. No behavior not stated in this document or the linked
Stripe reference may be assumed.

**Issued:** 2026-08-02

**Scope:** Stripe-hosted Checkout for the Coin Card pilot. Covers Session
creation, webhook fulfillment, Payment confirmation, refund lifecycle,
dispute intake, reconciliation, and testing gates. Does not cover the
native-USDC payment rail, route changes, or any other operation not explicitly
listed. Does not deploy, create Stripe objects, or change production
configuration.

---

## Pilot decisions

The Coin Card V1 Stripe checkout is:

| Decision | Value |
|---|---|
| Checkout mode | `mode = 'payment'` — one-time charge |
| Amount | $10.00 USD |
| `Payment.payment_asset` | `'USD'` |
| `Payment.amount_atomic` | `1000` |
| `Payment.asset_decimals` | `2` |
| `Payment.payment_rail` | `'stripe_usd'` |
| Payment methods | Card only (`payment_method_types: ['card']`) |
| Subscription | None |
| Automatic renewal | None |
| Saved payment method promise | None |
| Session and handle-reservation window | 30 minutes |

**Eligible purchase types:**

1. Initial activation
2. Active-term renewal
3. Grace-period renewal (card `EXPIRED`, within `ent.grace_period_ends_at`)
4. Post-grace reactivation (card `EXPIRED`, beyond `ent.grace_period_ends_at`)

The checkout never purchases a route change, transfer, scheduled payment,
batch payment, invoice, insurance, or any future feature not listed above.

---

## Customer and operational sequence

```
1.  Customer is authenticated (primary SIWE credential).
2.  Purchase type is determined (initial / renewal / reactivation).
3.  Handle, card ownership, entitlement state and route requirements
    are validated server-side.
4.  Eligibility and acceptable-use screening completes before Stripe
    Checkout is opened whenever reasonably possible (see BO1 Phase 1).
5.  Server creates a PurchaseAttempt record (see §Canonical records).
6.  Server creates a pending Payment record.
7.  Server creates a Stripe Checkout Session (server-only API call).
8.  Session ID and checkout URL are returned to the client.
    Handle reservation is activated (30-minute window).
9.  Client redirects the customer to the Stripe-hosted checkout page.
10. Outcome — one of:
    a. Customer completes payment → Stripe fires checkout.session.completed.
    b. Customer cancels → returns to cancel URL.
    c. Browser closed / abandoned → session expires at 30-minute mark.
    d. Card declined → customer remains on Stripe page; may retry.
    e. Session expires → checkout.session.expired fired; no charge.
11. Stripe fires verified webhook to the server endpoint.
12. Server verifies webhook signature and retrieves current Stripe objects.
13. Exactly one payment_confirmed LifecycleEvent is written if confirmed.
14. Payment.confirmed_at is set; 24-hour provisioning clock begins.
15. Purchase enters the ratified provisioning operation (BO1 Phase 4).
16. Customer return page (success URL) displays current status but does
    NOT confirm payment, activate an entitlement, or start provisioning.
```

**Critical constraint:** The success URL is a display-only surface.
Fulfillment is driven exclusively by verified server-side webhook events.
A customer who navigates to the success URL without a confirmed webhook
receives a "processing" or "checking" status page, not a completed activation.

---

## Checkout Session creation

### Server-only

Checkout Sessions must be created by the server using the Stripe secret key.
The client receives only the Session URL to redirect to. The client supplies no
price, purchase type, account identity, or entitlement reference.

### Session parameters

| Parameter | Value |
|---|---|
| `mode` | `'payment'` |
| `payment_method_types` | `['card']` |
| `line_items[0].price_data.currency` | `'usd'` |
| `line_items[0].price_data.unit_amount` | `1000` (cents) |
| `line_items[0].price_data.product_data.name` | Product name (e.g., `'Coin Card — Annual'`) |
| `line_items[0].quantity` | `1` |
| `success_url` | Server-defined return URL (see §Success URL) |
| `cancel_url` | Server-defined cancel URL |
| `expires_at` | `now + 1800` seconds (30 minutes) |

### Metadata (opaque identifiers only)

```json
{
  "purchase_attempt_id": "<internal UUID>",
  "acct_id": "<internal UUID>",
  "card_id": "<internal UUID or null>",
  "ent_id": "<prior entitlement UUID or null>",
  "purchase_type": "initial_activation | renewal | reactivation",
  "environment": "production | test"
}
```

Metadata must not contain wallet addresses, recovery codes, authentication
tokens, private evidence, abuse-detection signals, handle strings, or
unnecessary personal information. Metadata values are opaque internal
references that allow the webhook handler to look up the purchase context
without trusting the event payload itself.

The server must independently re-verify all session metadata when the webhook
arrives; metadata is not authoritative — it is a lookup key only.

### Success URL

```
https://<domain>/checkout/return?session_id={CHECKOUT_SESSION_ID}
```

The `{CHECKOUT_SESSION_ID}` template is expanded by Stripe. The return page
uses the session ID to display status only. The server must never use a return
URL parameter as the sole basis for confirming payment or advancing entitlement
state.

### Cancel URL

```
https://<domain>/checkout/cancel
```

Cancel returns the customer to the purchase flow without any state change to
the Payment record.

### Handle reservation

The handle reservation is created atomically with the PurchaseAttempt record.
The reservation window is **30 minutes**, synchronized with `Session.expires_at`.
If the Session expires without a confirmed payment:
- The handle reservation is released.
- No entitlement is activated.
- No `payment_confirmed` event is written.
- `PurchaseAttempt.status → 'expired'`.
- The customer may begin a new purchase attempt for the same handle,
  subject to availability and a new eligibility check.

Session expiration is distinct from payment failure and must not be described
as a declined charge in any customer-facing communication.

---

## Stripe identifier mapping and data model requirements

### Stripe object identifiers

| Stripe object | ID prefix | Role |
|---|---|---|
| Checkout Session | `cs_live_...` / `cs_test_...` | Session lifecycle and metadata lookup |
| PaymentIntent | `pi_...` | Authoritative payment object; used for refunds |
| Charge | `ch_...` or `py_...` | Sub-object of PaymentIntent; present after payment |
| Stripe Customer | `cus_...` | Optional; created if Stripe Customer is created |
| Refund | `re_...` | Created when a refund is initiated |
| Stripe Event | `evt_...` | Used for idempotent webhook processing |

### Current Payment record coverage

The ratified `Payment` record (Data Model V1 `193dcfa`) has:
- `provider_payment_id` — a single opaque provider reference
- `network_tx_hash` / `network_chain_id` — Polygon-specific; not used here

**`provider_payment_id` maps to the PaymentIntent ID.** The PaymentIntent is
the most canonical Stripe object for refunds, reconciliation, and audit.

The Payment record cannot currently represent the Checkout Session ID, Charge
ID, Stripe Customer ID, or Stripe Refund ID as distinct queryable fields.

### Data model amendment requirements

The following fields must be added to the ratified `Payment` record before
this checkout can be implemented. **Do not amend the data model in this
commit.** Record the requirements here.

**DMA-1 — Payment record: additional Stripe identifiers**

| Field | Type | Required | Notes |
|---|---|---|---|
| `checkout_session_id` | string | Yes | Stripe `cs_...` ID; idempotency key for webhook lookup |
| `payment_intent_id` | string \| null | At confirmation | Stripe `pi_...` ID; equals `provider_payment_id` |
| `charge_id` | string \| null | When available | Stripe `ch_...` or `py_...`; present after successful charge |
| `stripe_customer_id` | string \| null | If created | Stripe `cus_...`; required if Customer objects are used |
| `stripe_refund_id` | string \| null | On refund | Stripe `re_...`; set when refund is initiated |
| `stripe_refund_status` | string \| null | On refund | Tracks `pending`, `succeeded`, `failed`, `canceled` |

### Canonical record requirements

The following records are required by this checkout and do not exist in
Data Model V1. They must be added as canonical records in a data model
amendment before implementation.

**DMA-2 — PurchaseAttempt**

One `PurchaseAttempt` record per checkout initiation. Links the customer,
purchase context, and Stripe Session before a Payment is confirmed.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `acct_id` | UUID | FK → Account |
| `card_id` | UUID \| null | FK → CoinCard (null for initial) |
| `ent_id` | UUID \| null | FK → prior Entitlement (null for initial) |
| `purchase_type` | enum | `initial_activation`, `renewal`, `reactivation` |
| `handle` | string | Requested handle |
| `checkout_session_id` | string | Stripe Session ID |
| `payment_id` | UUID \| null | FK → Payment (null until Payment created) |
| `status` | enum | `open`, `completed`, `expired`, `cancelled`, `declined` |
| `handle_reserved_at` | timestamp | |
| `handle_reservation_expires_at` | timestamp | `= handle_reserved_at + 30 min` |
| `eligibility_screened_at` | timestamp \| null | When pre-payment screening completed |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

**DMA-3 — StripeWebhookEvent**

One record per processed Stripe Event ID. Used for idempotent event
processing. Processing a Stripe Event must check this table first.

| Field | Type | Notes |
|---|---|---|
| `stripe_event_id` | string | PK; Stripe `evt_...` ID |
| `event_type` | string | e.g., `checkout.session.completed` |
| `livemode` | boolean | From the Stripe event object |
| `received_at` | timestamp | When the webhook arrived |
| `processed_at` | timestamp \| null | When processing completed successfully |
| `processing_result` | string | `accepted`, `duplicate`, `rejected`, `error` |
| `purchase_attempt_id` | UUID \| null | Resolved from event metadata |
| `payment_id` | UUID \| null | Resolved from event metadata |

---

## Webhook authority and security

### Endpoint requirements

- The webhook endpoint must be a server-side handler only. It must not be
  a Firebase-hosted static asset or a client-side function.
- The raw request body must be used for signature verification.
  Parsing the body before signature verification invalidates the signature.
- Signature verification must use `stripe.webhooks.constructEvent(rawBody, sig, secret)`.
  Any exception thrown by `constructEvent` means the payload is unverifiable
  and must be rejected with HTTP 400.
- The endpoint secret (`whsec_...`) is server-only. It must never appear in
  frontend code, Firebase-hosted files, browser storage, logs, or
  customer-visible error output.

### Test/live-mode separation

- Stripe provides separate webhook signing secrets for test-mode and live-mode
  endpoints.
- The server must verify that `event.livemode` matches the expected environment.
  A test-mode event arriving at the live-mode handler (or vice versa) must be
  rejected, logged, and escalated to `OPR`.
- Test-mode objects (`cs_test_...`, `pi_test_...`) must never trigger
  production provisioning.

### API version pinning

The webhook endpoint must declare its expected Stripe API version. Stripe
signs events according to the version configured on the endpoint in the Stripe
dashboard. Verify that the pinned API version matches the version used in
server-side API calls. Document both in the server configuration.

### Event ID idempotency

Before processing any Stripe Event:
1. Check the `StripeWebhookEvent` table for `stripe_event_id`.
2. If a record exists with `processing_result = 'accepted'`, return HTTP 200
   immediately without re-processing.
3. If a record exists with `processing_result = 'error'` or processing is
   in-flight, log and investigate before retrying.
4. If no record exists, insert a `StripeWebhookEvent` record with
   `processing_result = null` (in-flight), then process.
5. On completion, update `processing_result = 'accepted'` or `'error'`.

This guarantees that duplicate Stripe deliveries (Stripe retries on non-2xx)
do not create duplicate Payments, Entitlements, or provisioning jobs.

### Freshness and out-of-order handling

Stripe events may arrive out of order. Do not rely solely on the event
payload's snapshot of object state. When the event type indicates a
significant state change:

- Call `stripe.checkout.sessions.retrieve(session_id)` to get current Session state.
- Call `stripe.paymentIntents.retrieve(pi_id)` when processing PaymentIntent events.

Act on the retrieved object's current state, not on the payload snapshot.

### Response timing

Return HTTP 200 as soon as the event has been durably accepted (written to
`StripeWebhookEvent` with `processing_result = null`). Long-running provisioning
must be enqueued asynchronously. Do not hold the webhook connection open for
the duration of provisioning.

### Secret handling

The following must never appear in logs, error messages, or frontend payloads:
- Stripe secret key (`sk_live_...` / `sk_test_...`)
- Stripe webhook signing secret (`whsec_...`)
- Complete card details (PAN, CVC, expiry)
- Raw webhook request body beyond what is needed for debugging

---

## Payment confirmation

### Authoritative webhook event

`checkout.session.completed` is the authoritative fulfillment trigger for the
immediate-payment (card-only) pilot. On receiving this event, the handler must:

1. **Verify the Stripe-Signature header** using `constructEvent`. Fail
   closed on any verification error.

2. **Check `event.livemode`** matches the expected environment. Reject if
   mismatched.

3. **Check StripeWebhookEvent table** for `event.id`. If already accepted,
   return 200 immediately.

4. **Retrieve the current Checkout Session** from Stripe:
   ```
   stripe.checkout.sessions.retrieve(event.data.object.id, {
     expand: ['payment_intent', 'payment_intent.latest_charge']
   })
   ```
   Do not trust the event payload's snapshot for `payment_status` or
   `payment_intent.status`. Retrieve current object state.

5. **Verify the payment confirmation predicate** — all of the following must
   be simultaneously true before `Payment.status` is set to `'confirmed'`:

   | Check | Required value |
   |---|---|
   | Event signature | Valid |
   | `event.livemode` | Matches environment |
   | Session belongs to ImplicitEx Stripe account | Confirmed by API key used for retrieval |
   | `session.metadata.purchase_attempt_id` | Resolves to existing `PurchaseAttempt` |
   | `PurchaseAttempt.acct_id` | Matches session metadata `acct_id` |
   | `PurchaseAttempt.card_id` | Matches session metadata `card_id` |
   | `PurchaseAttempt.purchase_type` | Matches session metadata `purchase_type`; still valid |
   | `session.amount_total` | `1000` |
   | `session.currency` | `'usd'` |
   | Quantity | `1` |
   | `session.payment_status` | `'paid'` |
   | `session.payment_intent.status` | `'succeeded'` |
   | `PurchaseAttempt.checkout_session_id` | Matches `session.id` |
   | `PurchaseAttempt.status` | `'open'` |
   | Payment record for this attempt | Not already confirmed |
   | No prior `payment_confirmed` event for this attempt | True |

6. **Write atomically** in a single transaction:
   - `Payment.status → 'confirmed'`
   - `Payment.confirmed_at` set
   - `Payment.payment_intent_id` set from `session.payment_intent.id`
   - `Payment.charge_id` set from `session.payment_intent.latest_charge.id`
     (if present)
   - `PurchaseAttempt.status → 'completed'`
   - `[evt]` `payment_confirmed`

7. **Enqueue provisioning job** (asynchronous; see BO1 Phase 4).

8. **Return HTTP 200** after durable acceptance.

### Exactly-once guarantee

A repeated delivery of `checkout.session.completed` with the same `event.id`
must be detected at step 3 and return 200 without re-executing steps 4–7.
A second delivery with a different `event.id` (Stripe re-delivery uses the
same `event.id`) cannot occur by design; if it does, the predicate at step 5
will detect the already-confirmed Payment and reject cleanly.

### Excluded events

Because delayed payment methods are excluded from the V1 pilot:

- `checkout.session.async_payment_succeeded` must not appear in normal
  processing. Receiving it indicates configuration drift and triggers a
  reconciliation case and `OPR` alert.
- `checkout.session.async_payment_failed` must not appear in normal
  processing. Same response.

---

## Failure and abandonment paths

Each failure class is distinct. The system must not conflate them.

| Path | Stripe signal | Customer description | Payment record | Entitlement |
|---|---|---|---|---|
| Customer clicks Cancel | None / cancel URL hit | "Your purchase was cancelled" | `status = 'pending'`; updated to `'cancelled'` on cancel URL or timeout | None |
| Browser closed / abandoned | None until expiry | — | Remains `pending` until session expiry or timeout cleanup | None |
| Session expires (30 min) | `checkout.session.expired` | "Your checkout session has expired. Start a new purchase." | `status → 'expired'` | None |
| Card declined | `payment_intent.payment_failed` | "Your card was declined. Please try a different payment method." | Stripe retries on the Stripe page; Payment `pending` if customer retries | None |
| Authentication not completed | `payment_intent.payment_failed` with `last_payment_error.code = 'authentication_required'` | "Authentication was required but not completed." | Same as card declined | None |
| Stripe reports payment failure | `payment_intent.payment_failed` | "Payment could not be processed" | `Payment.status → 'failed'`; `failed_at` set | None |
| Webhook delayed | None for the delay | Success page shows "processing" | Remains `pending`; SLA monitor fires as normal | None pending webhook |
| Webhook signature fails | — (server rejects) | No customer-visible change | No Payment mutation | None |
| Duplicate event arrives | `checkout.session.completed` with same `event.id` | None | Idempotency gate; no duplicate | None |
| Events out of order | Multiple events | — | Retrieve current object; act on current state | None |
| Success redirect before webhook | Return URL hit | "Processing your payment" | No confirmation until webhook | None |
| Webhook arrives, customer never returns | `checkout.session.completed` | Activation notice sent | Confirmed; provisioning proceeds | Activated normally |
| Amount / currency mismatch | `checkout.session.completed` but amounts differ | Internal alert | Predicate fails; Payment not confirmed | None; reconciliation case |
| Metadata mismatch | Event or retrieved session | Internal alert | Predicate fails; reconciliation case | None |
| Eligibility changes while Checkout open | Session completed but purchase_type invalid | Internal alert | Predicate fails; refund initiated | None |
| Two sessions for one purchase attempt | Concurrent sessions | — | Idempotency: first to complete wins; second is cancelled or rejected | None for second |
| Payment succeeds after reservation released | Session completed but `PurchaseAttempt.status = 'expired'` | Alert `OPR`; automatic refund | Predicate fails on expired attempt; refund initiated | None |

### Customer cancellation is not a failed charge

Customer cancellation, browser abandonment, and Session expiration must not
appear as declined charges in customer communication or internal records.
Use distinct status values and reason codes for each class.

### No active entitlement without confirmed payment

No failure path may create an `Entitlement` with `status = 'active'` or
advance `pub.publication_stage` beyond `PREPARED` without a confirmed Payment
and a successful provisioning sequence.

---

## Refunds

### Mapping to ratified refund rules

Business Operations V1 defines the following automatic-refund triggers:

| Trigger | Governing rule |
|---|---|
| SLA breach (24h, no extension) | BO1 N-1 |
| Post-payment operator refusal | BO1 N-2 |
| Post-payment predicate failure (eligibility) | BO1 step 13 |
| Duplicate successful payment | BO1 reconciliation |
| Customer-caused provisioning failure (where policy permits) | Entitlement Spec §8 |
| Manual operator refund | `OPR` authority |

### Refund initiation

All refunds use `stripe.refunds.create({ payment_intent: payment_intent_id })`.

Do not refund via `stripe.charges.createRefund(charge_id)`. Always use the
PaymentIntent reference for consistency and idempotency.

Idempotency key for refund initiation:
```
refund_<payment_id>_<reason_code>
```

Pass this as the `idempotencyKey` option to Stripe. A retry of the same
refund initiation must not create two Stripe refunds.

**Before calling `stripe.refunds.create`:**
- Verify `Payment.stripe_refund_id` is null. If a Stripe Refund already
  exists for this Payment, do not initiate a second.
- Write `[evt]` `refund_initiated` in the same transaction as the Stripe API
  call (or immediately after a successful call, before returning).

### Stripe refund events

| Event | Meaning | Action |
|---|---|---|
| `refund.created` | Refund created by Stripe | Verify `re_id` matches `Payment.stripe_refund_id`; update `stripe_refund_status → 'pending'` |
| `refund.updated` | Refund status changed | Update `Payment.stripe_refund_status`; if `succeeded`, write `[evt]` `refund_confirmed` |
| `refund.failed` | Refund could not be processed | Alert `OPR`; reconciliation case; do not silently drop |

Do not rely solely on `charge.refunded` for tracking refund state. Use
refund-specific events (`refund.created`, `refund.updated`, `refund.failed`)
as the authoritative refund record.

### Refund lifecycle

```
refund_initiated [evt]
  → stripe.refunds.create
    → Payment.stripe_refund_id set
      → refund.created webhook
        → stripe_refund_status = 'pending'
          → refund.updated (status: succeeded)
            → Payment.status → 'refunded'
            → Payment.refunded_at set
            → refund_confirmed [evt]
            → Customer refund-confirmed notice
```

### Refund failure

If `stripe_refund_status → 'failed'`:
- `OPR` alert immediately.
- Reconciliation case opened.
- Customer notice: "Your refund was initiated but could not be processed. We
  are investigating and will contact you."
- Do not mark the Payment as `refunded`.
- Do not attempt a second refund without confirming the failure reason with
  Stripe.

### Refund pending beyond threshold

If `stripe_refund_status = 'pending'` for more than 5 business days:
- `OPR` alert.
- Retrieve refund via Stripe API to check current status.
- Escalate to `FDR` if unresolved after 7 business days.

### Per-trigger behavior

| Trigger | `Payment.status` before refund | Post-refund state | Customer notice |
|---|---|---|---|
| SLA breach | `confirmed` | `refunded` | "Your payment has been refunded; provisioning was not completed in time." |
| Post-payment operator refusal | `confirmed` | `refunded` | "Your purchase could not be completed; a full refund has been initiated." |
| Post-payment predicate failure | `confirmed` | `refunded` | Same as operator refusal |
| Customer-caused provisioning failure (policy permits) | `confirmed` | `refunded` | "Provisioning could not be completed; a refund has been initiated per our policy." |
| Duplicate payment | Second `pay.status` → `refunded` | Second `pay.status = refunded` | "A duplicate payment was detected; it has been refunded." |
| Manual operator refund | Any terminal | `refunded` | Per-case notice from `OPR` |

---

## Disputes and chargebacks

### Dispute intake

A dispute is opened when a cardholder files a chargeback with their bank.
Stripe signals this with `charge.dispute.created`.

**On `charge.dispute.created`:**
1. Retrieve the Dispute object from Stripe.
2. Correlate `dispute.charge` → `Payment.charge_id` to identify the
   affected Payment, Entitlement, and CoinCard.
3. Create an incident record (see BO2 Sub-operation 2.1).
4. Classify: funds at risk (`FDR` escalation), or informational (`OPR`).
5. Preserve all available evidence: Payment record, Entitlement, signed
   publications, `StripeWebhookEvent` records, customer notice records.
6. Do not automatically route-change or move customer funds.
7. Alert `FDR` immediately.

**On `charge.dispute.updated` and `charge.dispute.closed`:**
- Update the dispute record with current `status` and `reason`.
- If `charge.dispute.closed` with `status = 'lost'`: see governance decisions.
- If `charge.dispute.closed` with `status = 'won'`: close the incident.
  Card status is not affected.

### Evidence preservation

All of the following must be preserved and retrievable for dispute response:

- Signed EvidencePublication records for the card
- LifecycleEvent chain from activation
- Customer activation notice delivery record
- Payment and Checkout Session confirmation
- IP address and session data if retained (subject to privacy policy)
- Account credential registration record (without revealing credentials)

Evidence submitted to Stripe in a dispute response is a governance decision
(see §GD-3).

### Prohibitions

Operators must not:

- Automatically suspend or revoke a CoinCard solely because a dispute was
  opened.
- Change the recipient route as part of a dispute response.
- Move or intercept customer funds.
- Assume the dispute represents fraud without independent evidence that
  satisfies a ratified suspension ground (see BO1 §GD-1 Category 2).

### Governance decisions (disputes)

These decisions are not derivable from the governing documents and must be
resolved before live Stripe payments begin. See §Governance decisions section.

---

## Receipts and customer notices

Distinguish the following. They are not interchangeable.

| Notice | Source | Timing | Trigger |
|---|---|---|---|
| Stripe payment receipt | Stripe (automatic) | On charge | Stripe sends to customer email; controlled by Stripe settings |
| ImplicitEx payment-confirmed notice | ImplicitEx | On `payment_confirmed` event | Confirms payment received; provisioning in progress |
| Coin Card activation notice | ImplicitEx | After `pub.publication_stage = ACTIVATED` and `ent.status = active` | Confirmed activation; includes handle, URL, dates, recovery codes (initial only) |
| Provisioning-extension request | ImplicitEx | Before 24h SLA, if extending | Requires explicit customer agreement |
| Automatic-refund notice | ImplicitEx | On `refund_initiated` | Automatic refund; includes reason and timeline |
| Refund-confirmed notice | ImplicitEx | On `refund_confirmed` | Confirms refund processed; includes Stripe reference |
| Payment-failure notice | ImplicitEx | On payment failure webhook | Failure reason; no charge; may retry |

**A Stripe payment receipt proves payment activity.** It does not prove Coin
Card activation. The activation notice must not be sent until signed publication
and entitlement activation are complete.

**The success URL page must not present itself as an activation confirmation.**
It must present a processing state and poll for or link to current card status.

---

## Reconciliation

### Scope

Daily reconciliation compares Stripe objects against internal records.

### Stripe-to-internal comparisons

| Stripe source | Expected internal state | Action if mismatch |
|---|---|---|
| Paid Checkout Session (`payment_status = 'paid'`) | Confirmed `pay` record with matching `checkout_session_id` | Escalate to `OPR`; paid session without confirmed Payment is integrity failure |
| Confirmed `pay` record (`status = confirmed`) | Stripe Session retrievable and `payment_status = 'paid'` | Escalate to `PSO`; Payment confirmed without Stripe backing |
| PaymentIntent `succeeded` but Session unresolved | Matching `pay` record not confirmed | Create reconciliation case; do not double-confirm |
| Duplicate Session for one `PurchaseAttempt` | Exactly one `checkout_session_id` per `PurchaseAttempt` | Escalate; cancel or refund the second session |
| Duplicate PaymentIntent or Charge reference | No two `pay` records share `payment_intent_id` or `charge_id` | Escalate; idempotency failure |
| Processed `StripeWebhookEvent` without state transition | Event marked `accepted` but Payment status not advanced | Escalate; silent processing failure |
| `payment_confirmed` event written twice for same `payment_id` | Exactly one `payment_confirmed` per `payment_id` | Immediate `PSO` escalation; integrity failure |
| `payment_confirmed` but no provisioning job queued | Provisioning deadline < NOW | `provisioning_sla_breach` risk; escalate to `OPR` immediately |
| Stripe Refund exists but `refund_initiated` absent | `stripe_refund_id` set but no `refund_initiated` event | Reconciliation case; manually write event with explanation |
| Internal refund initiated but no Stripe Refund | `refund_initiated` event but `stripe_refund_id` null | `OPR` must call Stripe API to verify and initiate if missing |
| Stripe Refund `status = 'failed'` | `stripe_refund_status = 'failed'` | Alert `OPR`; customer notice |
| Test-mode object in live processing | `event.livemode = false` in live handler | Reject; alert `OPR`; audit webhook configuration |
| Amount or currency mismatch | `session.amount_total ≠ 1000` or `session.currency ≠ 'usd'` | Reject confirmation; refund; escalate to `FDR` |
| Success redirect with no verified payment | Return URL hit but `pay.status ≠ 'confirmed'` | Show processing state; no provisioning; log for audit |
| Session completed after reservation expiration | `PurchaseAttempt.status = 'expired'` but session paid | Refund automatically; alert `OPR` |
| `StripeWebhookEvent` with `processing_result = 'error'` | Requires investigation | `OPR` review; determine if retry is safe |

### Corrective actions

Corrections must preserve historical records. No `pay`, `evt`, `pub`, or
`StripeWebhookEvent` record may be deleted. Corrections are compensating
records with operator attribution.

---

## Testing gates

No production checkout may be enabled until all test cases below pass in
Stripe test mode. Production configuration must be reviewed separately
without executing a real customer charge.

### Purchase type coverage

| Test case | Expected outcome |
|---|---|
| Initial activation — complete payment | `payment_confirmed`, provisioning enqueued |
| Active-term renewal — complete payment | `payment_confirmed`, renewal provisioning |
| Grace-period renewal — complete payment | `payment_confirmed`, renewal provisioning |
| Post-grace reactivation — complete payment | `payment_confirmed`, reactivation provisioning |
| Pre-payment eligibility decline | No Session created; admin evidence; customer notice |

### Payment outcomes

| Test case | Expected outcome |
|---|---|
| Successful card payment | `payment_confirmed` written once; provisioning started |
| Card declined at Stripe | No `payment_confirmed`; `Payment.status = 'failed'`; customer notice |
| Customer clicks Cancel | `PurchaseAttempt.status → 'cancelled'`; no Payment confirmed |
| Session expiration (30 min) | `checkout.session.expired`; `PurchaseAttempt.status → 'expired'`; handle released |
| Missing success redirect (webhook arrives, no redirect) | Provisioning proceeds normally; customer eventually notified |

### Webhook scenarios

| Test case | Expected outcome |
|---|---|
| Webhook delivered before redirect | `payment_confirmed` written; redirect shows processing then success |
| Webhook delayed > 5 min | Return page shows processing; SLA clock running; webhook confirms later |
| Duplicate webhook (same `event.id`) | Idempotency gate fires; second delivery returns 200; no double-confirm |
| Concurrent duplicate webhook | Exactly one confirmation; second rejected by idempotency or predicate |
| Out-of-order events | Object retrieved fresh; state consistent with Stripe's current record |
| Invalid Stripe-Signature | HTTP 400; no Payment mutation; `OPR` alert if persistent |
| Wrong endpoint secret | HTTP 400; same as invalid signature |
| Test/live-mode mismatch | Rejected; `OPR` alert; no state change |

### Security and integrity

| Test case | Expected outcome |
|---|---|
| Metadata tampering (wrong `purchase_attempt_id`) | Predicate fails; no confirmation; reconciliation case |
| Amount mismatch (`session.amount_total ≠ 1000`) | Predicate fails; no confirmation; refund initiated |
| Currency mismatch (`session.currency ≠ 'usd'`) | Predicate fails; no confirmation; refund initiated |
| Duplicate Checkout Sessions for same attempt | First to confirm wins; second rejected by predicate |
| Duplicate PaymentIntent reference | Idempotency gate detects; escalated |
| `async_payment_succeeded` event received | Configuration-drift alert; no provisioning; `OPR` notified |

### Refund scenarios

| Test case | Expected outcome |
|---|---|
| Automatic refund — SLA breach | `refund_initiated`; Stripe refund created; `refund_confirmed` on Stripe event |
| Automatic refund — operator refusal | Same lifecycle; customer notice |
| Duplicate refund request | Idempotency key prevents second Stripe refund |
| Stripe refund failure | `stripe_refund_status = 'failed'`; `OPR` alert; customer notice |
| Refund pending > 5 business days | `OPR` alert; Stripe API check; escalation if needed |

### Provisioning integration

| Test case | Expected outcome |
|---|---|
| Provisioning SLA breach after successful payment | `provisioning_sla_breach` event; automatic refund initiated |
| Provisioning completes within SLA | Activation notice sent; signed publication at `ACTIVATED` |

---

## Boundaries

These constraints must not be violated under any circumstance:

| Boundary | Rule |
|---|---|
| No custody | ImplicitEx does not hold, process, or route customer funds. Stripe handles card processing. |
| No automatic renewal | No Stripe Subscription object is created. No recurring charge. |
| No Stripe Subscription | `mode = 'payment'` only. Any Subscription object is configuration error. |
| No client-authoritative pricing | Amount, currency, and purchase type are set server-side only. |
| No fulfillment from redirects | Success URL is display-only. Fulfillment requires verified webhook. |
| No card-data storage | ImplicitEx never receives or stores raw card numbers, CVVs, or mag-stripe data. |
| No secret in frontend | Stripe secret keys and webhook secrets must not appear in any client-side code or asset. |
| No confirmation without verified evidence | `payment_confirmed` requires all predicate checks to pass. |
| No duplicate entitlement from duplicate webhook | Idempotency at event ID and Payment level. |
| No retained payment after refusal | Automatic refund on any post-payment operator decline. |
| No native-USDC checkout | This document covers Stripe USD only. |
| No deployment in this task | This document governs specification only; no code, Stripe configuration, or production change is made here. |

---

## Governance decisions

**GD-1 — Does a dispute automatically trigger suspension review?**

*Not derivable from governing documents.* The governing documents define
suspension grounds (BO1 §GD-1 Category 2) but do not address disputes.

*Decision required:* Must a `charge.dispute.created` event trigger a
SuspensionCase under BO2 Sub-operation 2.3, or is a dispute an intake
signal that is evaluated before any suspension action is taken?

*Consequence:* If a dispute automatically opens a suspension case, the 7-day
review clock begins immediately. If it is evaluated first, the delay creates
a window where an active card may continue to operate during dispute review.

**GD-2 — Does a lost dispute terminate an active entitlement?**

*Not derivable from governing documents.* The Entitlement Specification defines
revocation for cause but does not mention chargebacks.

*Decision required:* If Stripe closes a dispute as `lost` (chargeback upheld),
must the Entitlement be revoked, terminated, or remain active? Does a lost
chargeback constitute a refund under the governing refund policy?

**GD-3 — What evidence does ImplicitEx submit to Stripe in a dispute response?**

*Not derivable from governing documents.* Dispute response content is not
defined in any governing document.

*Decision required:* What evidence may ImplicitEx include in a Stripe
dispute response? Signed publications and lifecycle records are strong
evidence of service delivery but may reveal internal operational details.
This decision must be made before the first dispute response is required.

**GD-4 — Refund or service treatment after a lost chargeback**

*Not derivable from governing documents.* If the chargeback succeeds (Stripe
returns funds to the cardholder), the customer has received a refund from the
bank. The governing entitlement-refund rules address Stripe-initiated refunds,
not bank-enforced chargebacks.

*Decision required:* After a lost chargeback, is the entitlement treated as
refunded (service discontinued) or does it remain in effect? Must ImplicitEx
initiate an additional remediation step?

---

## Amendment log

### 2026-08-02 — Initial issue

Stripe Checkout V1 specification drafted. Stripe API version `2024-06-20`
declared as baseline (implementor must verify at implementation time).
Checkout Session architecture with 30-minute expiration and handle-reservation
synchronization. Payment confirmation requires 14-point predicate. Webhook
idempotency via `StripeWebhookEvent` table. Refund lifecycle via
`refund.created` / `refund.updated` / `refund.failed` events. Four dispute-
policy governance decisions surfaced (GD-1 through GD-4). Two canonical record
requirements (DMA-2 PurchaseAttempt, DMA-3 StripeWebhookEvent) and one Payment
record amendment requirement (DMA-1) identified. Status: draft for ratification.
