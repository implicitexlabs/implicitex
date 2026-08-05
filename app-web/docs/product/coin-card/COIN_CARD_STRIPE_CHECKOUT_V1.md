# Coin Card Stripe Checkout V1

**Status:** Governing checkout specification — ratified for implementation; GD-1 through GD-4 remain required before live Stripe payments
**Governing documents:**
- `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `b3bdc08`
- `COIN_CARD_DATA_MODEL_V1.md` at `f93bc04`
- `COIN_CARD_CUSTOMER_WORKFLOWS_V1.md` at `7a9032c`
- `COIN_CARD_BUSINESS_OPERATIONS_V1.md` at `4352081`

**External authority:** Stripe API. Minimum required version:
`2024-10-28.acacia` (beginning with that release, `refund.created`,
`refund.updated`, and `refund.failed` apply to all refund types, including
refunds associated with a Charge; no earlier version may be used). The
production version is selected from the installed `stripe-node` release and
verified against Stripe's official versioning and changelog documentation
during implementation. This specification does not freeze a latest-version
claim. See § API version pinning. No behavior not stated in this document or
the Stripe reference documentation for the selected version may be assumed.

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

#### Reservation authority

Each eligible PurchaseAttempt receives one server-authoritative reservation
window. A PurchaseAttempt may already exist in `screening` or `eligible`
status before a handle reservation is acquired. After eligibility passes,
the active reservation is acquired during the checkout-creation operation.
The normalized-handle uniqueness claim and the writes to `reserved_at` and
`reserved_until` must occur in one concurrency-safe local transaction on the
existing PurchaseAttempt. The reservation is not part of initial
PurchaseAttempt creation.

- `PurchaseAttempt.reserved_at` records when the active handle reservation
  begins.
- `PurchaseAttempt.reserved_until` equals `reserved_at + 30 minutes`. This
  internal timestamp is the authoritative expiration deadline.
- The normalized handle must be reserved using a concurrency-safe uniqueness
  operation. Only one nonterminal PurchaseAttempt may hold the reservation
  for a normalized handle at a time.
- For renewal and reactivation attempts, the uniqueness constraint must also
  prevent conflicting active attempts for the same `card_id`.
- Stripe is not the authority over handle availability. The internal
  `reserved_until` timestamp governs even if a Stripe webhook is delayed,
  missing, duplicated, or delivered out of order.

#### Checkout Session ownership

- One PurchaseAttempt may own at most one Stripe Checkout Session.
- `PurchaseAttempt.checkout_session_id` is write-once; it must not be
  overwritten once set.
- The Checkout Session `expires_at` should be configured to match the
  internal `reserved_until` deadline so the two windows are aligned.
- If a Session-creation request is retried due to ambiguous response, use a
  stable idempotency key tied to the `purchase_attempt_id` so the retry
  resolves to the same Session rather than creating a new one.
- Creating an intentional replacement Session requires a new PurchaseAttempt
  and a new reservation decision. Do not overwrite `checkout_session_id` on
  an existing PurchaseAttempt.

#### Expiration behavior

At or after `reserved_until`, if payment has not already been confirmed:

- `PurchaseAttempt.status` transitions to `'expired'`.
- `PurchaseAttempt.expired_at` is set.
- The handle is released from the active-reservation constraint; a new
  purchase attempt may reserve it subject to availability and eligibility.
- The expired attempt does not reopen.
- No `payment_confirmed` LifecycleEvent is written.
- No entitlement is created or advanced.
- A `checkout.session.expired` webhook may trigger or corroborate local
  expiration processing. It must never cause the PurchaseAttempt or
  reservation to expire before `reserved_until`. At or after `reserved_until`,
  it may cause the server to finalize an expiration that is already due.
  Missing webhook delivery does not extend the reservation.
- A reconciliation job may detect and finalize elapsed reservations that have
  not yet been explicitly transitioned.

Session expiration is distinct from payment failure and must not be described
as a declined charge in any customer-facing communication.

#### Payment confirmed after expiration

A payment may be confirmed by Stripe after the PurchaseAttempt has already
expired locally — for example, when webhook delivery is significantly delayed.

- The incoming `checkout.session.completed` event is still processed through
  the full idempotency and signature-verification path.
- The confirmed Payment is linked to the PurchaseAttempt via `payment_id`.
- The PurchaseAttempt remains in `'expired'` status.
- `PurchaseAttempt.failure_code` is set to `'PAYMENT_CONFIRMED_AFTER_EXPIRY'`.
- The reservation is not recreated.
- Provisioning is not triggered automatically.
- The confirmed Payment is held for the separately specified
  reconciliation and refund process. That process is not defined in this
  section.

---

## Stripe identifier mapping

### Canonical identifier table

The following table is authoritative. Each Stripe object has exactly one
canonical storage location in the Data Model (`f93bc04`). No Stripe
identifier may be stored in any other field or record without a ratified
data model amendment.

| Stripe object | Stripe ID prefix | Canonical field | Notes |
|---|---|---|---|
| Checkout Session | `cs_live_...` / `cs_test_...` | `PurchaseAttempt.checkout_session_id` | Session lifecycle and metadata lookup |
| PaymentIntent | `pi_...` | `Payment.provider_payment_id` | Authoritative payment object; used for refunds and reconciliation |
| Refund | `re_...` | `PaymentRefund.provider_refund_id` | Write-once; null until provider acknowledges |
| Dispute | `dp_...` | `PaymentDispute.provider_dispute_id` | Set at dispute creation |
| Event | `evt_...` | `ExternalEventReceipt.provider_event_id` | Idempotency key for webhook processing |

**Charge ID (`ch_...` / `py_...`):** The Charge is a sub-object of the
PaymentIntent, retrievable via `PaymentIntent.latest_charge`. The Charge ID
is not a canonical payment identity and is not stored on the `Payment`
record. It is stored only on `PaymentDispute.provider_charge_id` because
disputes are issued against a Charge, not a PaymentIntent.

### Mapping rules

1. **Session → Attempt, not Payment.** `PurchaseAttempt.checkout_session_id`
   is the entry point for webhook lookup. The webhook handler resolves the
   `purchase_attempt_id` from Session metadata, then resolves `payment_id`
   from the attempt record.

2. **PaymentIntent → Payment.provider_payment_id.** This is the sole
   provider identifier on the `Payment` record. `payment_intent_id` is not
   a separate field; it is `provider_payment_id` when `payment_rail = 'stripe_usd'`.

3. **No Stripe-specific fields on Payment.** Fields such as
   `checkout_session_id`, `charge_id`, `stripe_customer_id`,
   `stripe_refund_id`, or `stripe_refund_status` do not exist on the
   `Payment` record and must not be added without a data model amendment.

4. **Refunds use PaymentRefund, not Payment.** Each refund creates one
   `PaymentRefund` record. The `PaymentRefund.provider_refund_id` field is
   write-once, null until Stripe assigns the `re_...` ID.

5. **Disputes use PaymentDispute.** Each dispute creates one
   `PaymentDispute` record. `provider_charge_id` is stored there because
   Stripe disputes are keyed to charges.

6. **Events use ExternalEventReceipt.** The `(provider, provider_event_id)`
   pair is unique. Processing a Stripe event means inserting an
   `ExternalEventReceipt` row with `provider = 'stripe'` and
   `provider_event_id = event.id`. Duplicate delivery of an event returns
   the existing receipt without mutation; it does not insert a new row.

7. **Stripe Customers.** This specification does not create Stripe Customer
   objects during the pilot. If Customer objects are introduced in a future
   amendment, the storage field must be ratified in the data model at that time.

8. **All identifiers are treated as opaque strings.** The `livemode` flag
   on `ExternalEventReceipt` and on `Payment` is the authoritative
   environment discriminator; identifier prefixes (`cs_live_` vs `cs_test_`)
   are not used as environment checks.

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

Before production, the following must be explicitly known, recorded, and
tested together:

| Configuration point | Required treatment |
|---|---|
| Installed `stripe-node` version | Record exact package version |
| SDK-associated API version | Record as normal request version |
| Explicit request override | Normally absent; document and test type compatibility if used |
| Webhook endpoint API version | Explicitly pin to handler's expected event shape |
| Account default API version | Record as fallback configuration |

**Version selection rule:** For `stripe-node` v12 or later, prefer the API
version natively associated with that SDK release. Runtime responses and
TypeScript definitions are aligned to that version; overriding to a
different version without verifying type compatibility can cause silent
mismatches. Do not use a per-request or constructor override merely to force
a different version from the installed SDK.

**SDK/webhook compatibility:** The SDK-associated request version and the
webhook endpoint's declared version must be explicitly known and tested
together. Stripe signs events according to the version configured on the
endpoint; an endpoint version that differs from the SDK request version
produces event objects in a different shape than the SDK types expect. Both
must be chosen deliberately and validated.

**Account default:** The Stripe account default governs any request or
endpoint that is not explicitly pinned. It must be recorded. No production
behavior may silently depend on an unknown account default.

**Minimum version:** `2024-10-28.acacia`. Beginning with that release,
`refund.created`, `refund.updated`, and `refund.failed` apply to all refund
types, including refunds associated with a Charge. Earlier versions require
different event handling (such as `charge.refunded`) for charge-associated
refunds. This specification uses `2024-10-28.acacia` or later so one
consistent Refund-object event model applies. No earlier version may be used.

**Version change rule:** Any change to the webhook endpoint version or the
SDK installation requires a smoke-test pass covering the full checkout and
refund event paths before production deploy.

**Incoming-event version verification:** `ExternalEventReceipt.api_version`
records the `api_version` declared in each incoming Stripe event. On every
received event, compare this value against the API version the webhook
endpoint is explicitly pinned to. On mismatch:

- Preserve the receipt and payload hash.
- Do not apply any domain effects: no PurchaseAttempt transitions, no
  Payment transitions, no PaymentRefund transitions, no PaymentDispute
  transitions, no Entitlement or CoinCard transitions, no LifecycleEvent
  creation, no provisioning, and no customer-notice effects.
- Set `ExternalEventReceipt.processing_status = 'failed'`.
- Set `ExternalEventReceipt.last_error_code = 'VERSION_MISMATCH'`.
- Alert for operator review.

Do not silently process an event whose declared version does not match the
endpoint's expected version.

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

### Authoritative confirmation path

The browser redirect and success page never confirm payment. Payment
confirmation begins only after a signature-verified and version-accepted
`checkout.session.completed` webhook. The handler:

1. **Verifies the Stripe-Signature header** using `constructEvent`. Fails
   closed on any verification error.

2. **Checks `event.livemode`** against the expected environment. Rejects if
   mismatched.

3. **Checks `ExternalEventReceipt`** for `(provider = 'stripe', provider_event_id = event.id)`.
   If a row exists with `processing_status = 'processed'`, returns HTTP 200
   immediately without re-executing subsequent steps.

4. **Resolves the PurchaseAttempt** using `session.id` matched against
   `PurchaseAttempt.checkout_session_id`, then re-verifies all metadata
   server-side. Metadata is a lookup key only; it is not authoritative.

5. **Retrieves the current Checkout Session and PaymentIntent** from Stripe:
   ```
   stripe.checkout.sessions.retrieve(event.data.object.id, {
     expand: ['payment_intent']
   })
   ```
   Does not trust the event payload snapshot for `payment_status` or
   `payment_intent.status`. Acts on the retrieved object's current state.

6. **Applies the verification gate** (see below). If any check fails,
   preserves the `ExternalEventReceipt`, applies no payment or entitlement
   transition, records a machine-readable mismatch code, and alerts for
   reconciliation.

7. **Checks the PurchaseAttempt expiration state** before writing internal
   records (see Expired attempt below).

8. **Writes atomically** for a valid, timely payment (see Valid timely
   payment below).

9. **Enqueues provisioning job** (asynchronous; see BO1 Phase 4).

10. **Returns HTTP 200** after durable acceptance.

### Verification gate

All of the following must be simultaneously true before any payment or
entitlement transition is applied.

#### Checkout Session checks

| Check | Required value |
|---|---|
| Event signature | Valid |
| `event.livemode` | Matches PurchaseAttempt environment |
| Session belongs to ImplicitEx Stripe account | Confirmed by API key used for retrieval |
| `session.id` | Equals `PurchaseAttempt.checkout_session_id` |
| `session.mode` | `'payment'` |
| `session.payment_status` | `'paid'` |
| `session.currency` | `'usd'` |
| `session.amount_total` | `1000` |
| `session.metadata.purchase_attempt_id` | Resolves to existing `PurchaseAttempt` |
| `PurchaseAttempt.account_id` | Matches session metadata `account_id` |
| `session.metadata.purchase_type` | Exactly equals `PurchaseAttempt.purchase_type`; still valid |
| `session.metadata.card_id` vs `PurchaseAttempt.card_id` | For `initial_activation`: `PurchaseAttempt.card_id` is null; session metadata must not supply a conflicting pre-existing card ID. For `active_term_renewal`, `grace_period_renewal`, `post_grace_reactivation`: session metadata `card_id` must equal the non-null `PurchaseAttempt.card_id`. |

#### PaymentIntent checks

| Check | Required value |
|---|---|
| PaymentIntent exists | Yes; its ID becomes `Payment.provider_payment_id` |
| `payment_intent.status` | `'succeeded'` |
| `payment_intent.currency` | `'usd'` |
| `payment_intent.amount_received` | `1000` |
| `payment_intent.livemode` | Matches Checkout Session and PurchaseAttempt |
| `payment_intent.metadata.purchase_attempt_id` | Equals resolved `PurchaseAttempt.purchase_attempt_id` |
| `payment_intent.metadata.account_id` | Equals `PurchaseAttempt.account_id` |
| `payment_intent.metadata.purchase_type` | Equals `PurchaseAttempt.purchase_type` |
| `payment_intent.metadata.card_id` vs `PurchaseAttempt.card_id` | For renewal or reactivation: must equal the non-null `PurchaseAttempt.card_id`. For initial activation: must not contain a conflicting pre-existing card ID. |
| PaymentIntent metadata consistency | Must agree with Checkout Session metadata on all shared keys; metadata is a correlation check only — internal records and retrieved Stripe object state are authoritative. |

#### Internal quote checks

| Check | Required value |
|---|---|
| `PurchaseAttempt.quoted_asset` | `'USD'` |
| `PurchaseAttempt.quoted_amount_atomic` | `1000` |
| `PurchaseAttempt.quoted_asset_decimals` | `2` |
| Payment record for this attempt | Not already confirmed |
| No prior `payment_confirmed` event for this attempt | True |

### Valid timely payment

If the verification gate passes and the PurchaseAttempt has **not** already
expired (`reserved_until` has not elapsed and `PurchaseAttempt.status` is
`payment_pending` or `checkout_created`), write atomically in a single
transaction:

- Create or resolve the canonical Payment idempotently.
- `Payment.provider_payment_id` set from `payment_intent.id`.
- `Payment.status → 'confirmed'`.
- `Payment.amount_atomic = 1000`, `Payment.payment_asset = 'USD'`,
  `Payment.asset_decimals = 2`.
- `Payment.confirmed_at` set.
- `PurchaseAttempt.payment_id` set (write-once link to Payment).
- `PurchaseAttempt.status → 'payment_confirmed'`.
- `[evt]` `payment_confirmed` written exactly once, carrying `payment_id`
  and `confirmed_at`.

Do not define provisioning completion in this section.

### Expired attempt

If the verification gate passes but the PurchaseAttempt is already in
`expired` status, apply the `PAYMENT_CONFIRMED_AFTER_EXPIRY` path. Before
beginning the atomic transaction, validate the write-once Payment identifier:

- If creating a new Payment: set `Payment.provider_payment_id` from
  `payment_intent.id`.
- If resolving an existing Payment: its write-once `provider_payment_id`
  must already equal `payment_intent.id`. Any mismatch fails closed before
  the atomic transaction — preserve the ExternalEventReceipt, apply no
  domain effects, record a machine-readable conflict code, and alert for
  reconciliation.

If the identifier check passes, write atomically in a single transaction:

- `Payment.status → 'confirmed'`.
- `Payment.amount_atomic = 1000`, `Payment.payment_asset = 'USD'`,
  `Payment.asset_decimals = 2`.
- `Payment.confirmed_at` set.
- `PurchaseAttempt.payment_id` set (write-once link to confirmed Payment).
- `PurchaseAttempt.failure_code = 'PAYMENT_CONFIRMED_AFTER_EXPIRY'`.
- `PurchaseAttempt.status` remains `'expired'`; do not transition it.
- `[evt]` `payment_confirmed` written exactly once, carrying `payment_id`
  and `confirmed_at`.
- Do not recreate the reservation.
- Do not invoke provisioning.
- Do not write `purchase_attempt_expired`, `activated`, or `reactivated`.
- Hold the confirmed Payment for the separately specified reconciliation and
  refund process.

### Exactly-once guarantee

Two separate idempotency layers govern this handler.

**Layer 1 — Delivery idempotency (ExternalEventReceipt):**
A repeated delivery with the same `event.id` is detected at step 3 and
returns HTTP 200 immediately without re-executing steps 4–10. Note: Stripe
retries delivery of the same Event using the same Event ID; ordinary retries
do not produce a different `event.id`.

**Layer 2 — Domain-state idempotency (Payment and PurchaseAttempt):**
Separate Stripe Events — potentially of different event types — may refer to
the same Checkout Session or PaymentIntent and describe the same
already-applied domain state. Event-ID deduplication alone is therefore
insufficient. After resolving the PurchaseAttempt and the incoming
PaymentIntent, apply these branches in order for every payment-confirmation
event:

1. **Incoming PaymentIntent already linked elsewhere.** Query
   `Payment.provider_payment_id` using the incoming `payment_intent.id`.
   PurchaseAttempt does not store a PaymentIntent identifier; this check is
   on the Payment table only.

   - If no Payment record has that `provider_payment_id`, continue to the
     remaining branches.
   - If a Payment record has that `provider_payment_id`, resolve its
     relationship to the current PurchaseAttempt:
     - If that Payment belongs to the **current** PurchaseAttempt (via
       `PurchaseAttempt.payment_id`), this is not an "elsewhere" conflict;
       continue to branch 3 or 4 as appropriate.
     - If that Payment belongs to a **different** PurchaseAttempt, or if the
       current PurchaseAttempt's `payment_id` points to a different Payment
       or a different `provider_payment_id`: fail closed — set
       `ExternalEventReceipt.processing_status = 'failed'` and
       `ExternalEventReceipt.last_error_code = 'LINKAGE_CONFLICT'`, apply no
       domain effects, and alert for operator reconciliation.

2. **Current PurchaseAttempt has no `payment_id`.** If the incoming
   PaymentIntent is not linked elsewhere: proceed through the verification
   gate, create or resolve the canonical Payment, and perform the appropriate
   timely-payment or expired-payment atomic transaction.

3. **Current PurchaseAttempt is linked to the same PaymentIntent and
   `Payment.status = 'confirmed'` (successful idempotent no-op).** Mark
   `ExternalEventReceipt.processing_status = 'processed'` and set
   `ExternalEventReceipt.processed_at`. Return HTTP 200. Do not create
   another Payment, rewrite `PurchaseAttempt.payment_id`, write another
   `payment_confirmed` LifecycleEvent, or invoke provisioning again.

4. **Current PurchaseAttempt is linked to the same PaymentIntent but
   `Payment.status` is not yet `'confirmed'`.** Proceed through the
   verification gate and complete the appropriate atomic confirmation
   transaction. Do not create another Payment or rewrite the write-once
   `PurchaseAttempt.payment_id` linkage.

5. **Current PurchaseAttempt is linked to a different PaymentIntent.**
   Fail closed — preserve the ExternalEventReceipt, apply no domain effects,
   set `last_error_code = 'LINKAGE_CONFLICT'`, `processing_status = 'failed'`,
   and alert for reconciliation.

### Excluded events

Because delayed payment methods are excluded from the V1 pilot:

- `checkout.session.async_payment_succeeded` must not appear in normal
  processing. Receiving it indicates configuration drift and triggers a
  reconciliation case and `OPR` alert.
- `checkout.session.async_payment_failed` must not appear in normal
  processing. Same response.

### Success page

The success page is a display-only surface governed by these rules:

- It queries internal server status using the Checkout Session reference
  passed in the return URL.
- It may display `processing` or `checking` while webhook confirmation is
  pending.
- It must not create or confirm Payment, activate an entitlement, reserve a
  handle, or invoke provisioning.
- Refreshing or revisiting the success page must have no transactional side
  effects.
- The `session_id` URL parameter is a display key only. It must never be
  used as the sole basis for confirming payment or advancing entitlement
  state.

---

## Failure and abandonment paths

Each failure class is distinct. The system must not conflate them.

### Payment failure and retry

`payment_intent.payment_failed` does not by itself terminate the
PurchaseAttempt. While the Checkout Session remains usable and
`reserved_until` has not elapsed, the payment failure is nonterminal:

- `PurchaseAttempt.status` transitions from `payment_pending` back to
  `checkout_created`.
- The existing Checkout Session remains associated with the attempt.
- The handle reservation remains active.
- The customer may retry or provide another payment method through the same
  Session.
- Do not create a replacement Checkout Session.
- Do not create a new PurchaseAttempt.
- Do not release the handle.
- Do not write `payment_confirmed`.
- Do not provision an entitlement.
- Do not create a Coin Card LifecycleEvent for the failed payment attempt.

**Failure evidence:** The Stripe Event is recorded through
`ExternalEventReceipt`. Provider failure codes and customer-safe decline
messaging may be used operationally. Do not add a Stripe-specific failure
field to `Payment` or `PurchaseAttempt` unless it already exists in Data
Model `f93bc04`. Do not treat a customer-correctable card decline as a
permanent eligibility decline.

**Retry stops when one of the following occurs:**

1. Payment is successfully confirmed.
2. `reserved_until` elapses and the PurchaseAttempt becomes `expired`.
3. The PurchaseAttempt or Checkout Session is explicitly cancelled.
4. Stripe reports a verified terminal provider state that makes the existing
   Session unusable.

### Path summary

| Path | Stripe signal | Customer description | Payment record | Entitlement |
|---|---|---|---|---|
| Customer clicks Cancel | None / cancel URL hit | "Your purchase was cancelled" | `status = 'pending'`; updated to `'cancelled'` on cancel URL or timeout | None |
| Browser closed / abandoned | None until expiry | — | Remains `pending` until session expiry or timeout cleanup | None |
| Session expires (30 min) | `checkout.session.expired` | "Your checkout session has expired. Start a new purchase." | `status → 'expired'` | None |
| Payment attempt fails within active Session | `payment_intent.payment_failed` while the Checkout Session remains usable and `reserved_until` has not elapsed | Decline reason; customer may retry with same or different payment method | `PurchaseAttempt.status → 'checkout_created'`; Payment record unchanged; handle and Session remain active; event recorded in `ExternalEventReceipt` | None |
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
| Payment succeeds after reservation released | Session completed but `PurchaseAttempt.status = 'expired'` | Alert `OPR`; hold for separately authorized reconciliation and refund process | Payment confirmed and linked; PurchaseAttempt remains expired with `PAYMENT_CONFIRMED_AFTER_EXPIRY`; no PaymentRefund created by webhook handler | None |

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

The following conditions are mapped to the authority governing any resulting
PaymentRefund operation. Listing a condition here does not itself authorize
automatic PaymentRefund creation:

| Trigger | Governing rule |
|---|---|
| SLA breach (24h, no extension) | BO1 N-1 |
| Post-payment operator refusal | BO1 N-2 |
| Post-payment predicate failure (eligibility) | BO1 step 13 |
| Duplicate successful payment | BO1 reconciliation |
| Customer-caused provisioning failure (where policy permits) | Entitlement Spec §8 |
| Payment confirmed after PurchaseAttempt expiry (`PAYMENT_CONFIRMED_AFTER_EXPIRY`) | Expired-attempt procedure; webhook handler creates no PaymentRefund or Entitlement and routes the confirmed Payment to a separately authorized reconciliation/refund process; if a PaymentRefund is later authorized, `PaymentRefund.reason_code = 'payment_confirmed_after_expiry'` |
| Manual operator refund | `OPR` authority |

### Refund initiation

#### Canonical refund operation

Every refund operation begins by creating one canonical `PaymentRefund`
record using the fields and enums from Data Model `f93bc04`. Do not add
Stripe-specific fields to `Payment` or invent fields outside the Data Model.

**Pre-submission checks — all must pass before creating a PaymentRefund:**

- The Payment must exist with `status = 'confirmed'`.
- `Payment.payment_rail` must be `'stripe_usd'`.
- `Payment.provider_payment_id` must be non-null (contains the Stripe
  PaymentIntent ID).
- The requested refund `amount_atomic` must be positive.
- Refund capacity must be allocated in the same concurrency-safe local
  transaction that creates the PaymentRefund. Calculate committed refund
  exposure as the sum of `amount_atomic` across all PaymentRefund records
  for the parent Payment whose `status` is `requested`, `pending`,
  `requires_action`, or `succeeded`. Exclude `failed` and `cancelled`
  records — those are terminal and no longer consume refund capacity.
  The new amount may be accepted only when:
  `committed exposure + new amount_atomic <= Payment.amount_atomic`
- Creating the PaymentRefund and claiming that capacity must be serialized
  per Payment so two concurrent refund requests cannot both reserve the same
  remaining amount. A `failed` or `cancelled` transition releases that
  operation's capacity for a later, newly created PaymentRefund.
- This is a derived concurrency calculation; do not add a new stored field
  to Payment or PaymentRefund.

#### Local creation

Before calling Stripe, create the `PaymentRefund` record:

| Field | Value at creation |
|---|---|
| `payment_id` | FK → the confirmed Payment |
| `provider` | `'stripe'` |
| `provider_refund_id` | `null` (write-once; set only after provider acknowledges) |
| `amount_atomic` | Requested refund amount |
| `asset` | `'USD'` |
| `asset_decimals` | `2` |
| `reason_code` | Governing reason (e.g., `provisioning_sla_breach`, `customer_request`, `operator_initiated`) |
| `status` | `'requested'` |
| `initiated_at` | Current timestamp |
| `initiated_by` | Actual initiator: `'system'` for automatic triggers; operator ID for manual refunds |
| `idempotency_key` | Stable key derived from `payment_refund_id`; unique within provider/operation boundary |
| `livemode` | Matches parent Payment |

`PaymentRefund.initiated_by` must contain either `'system'` when an
automatic ImplicitEx process initiates the refund, or the operator ID of the
person who initiates it. A customer ID is not stored in `initiated_by` under
Data Model `f93bc04`. When a customer asks for a refund, `reason_code` is
set to `'customer_request'` and `initiated_by` records the operator who
actually performs the initiation. Do not equate the refund reason with the
initiator; they are separate fields with separate values.

Write `[evt]` `refund_initiated` carrying `payment_id`, `payment_refund_id`,
and `refund_reason` in the same local transaction as PaymentRefund creation.

Do not create a second PaymentRefund merely because the Stripe API response
is delayed or ambiguous.

#### Stripe submission

Submit against `Payment.provider_payment_id` (the Stripe PaymentIntent ID):

```
stripe.refunds.create({
  payment_intent: Payment.provider_payment_id,
  amount: PaymentRefund.amount_atomic,   // omit only if proven safe for full remaining refund
  metadata: {
    payment_refund_id: "<payment_refund_id>",
    payment_id:        "<payment_id>",
    purchase_attempt_id: "<purchase_attempt_id>",
    account_id:        "<account_id>",
    reason_code:       "<reason_code>"
  }
}, {
  idempotencyKey: PaymentRefund.idempotency_key
})
```

Do not refund via `stripe.charges.createRefund(charge_id)`. Always use the
PaymentIntent reference. For partial refunds, always include the explicit
`amount`. For a full refund, include the exact remaining refundable amount
unless the implementation can prove Stripe will refund precisely that amount
when the field is omitted.

#### Provider response

When Stripe returns a Refund object, apply the following atomically:

**Timestamps and identifier (all returned statuses):**

- `PaymentRefund.provider_refund_id` ← `refund.id` (write-once; do not
  overwrite a non-null value)
- `PaymentRefund.provider_created_at` ← provider creation timestamp from
  the returned Refund object
- `PaymentRefund.updated_at` ← local reconciliation timestamp

**Status mapping:**

| Stripe `refund.status` | `PaymentRefund.status` | Additional effects |
|---|---|---|
| `'pending'` | `'pending'` | None |
| `'requires_action'` | `'requires_action'` | None |
| `'canceled'` | `'cancelled'` | None |
| `'failed'` | `'failed'` | Set `failed_at`; set `failure_code` from provider failure reason |
| `'succeeded'` | `'succeeded'` | Apply full succeeded effects (see below) |

A newly created Stripe Refund may already have `status = 'succeeded'`; do
not force it through `'pending'` before applying succeeded effects.

**Immediate succeeded effects** — when the API response already reports
`'succeeded'`, the same atomic transaction must:

- Set `PaymentRefund.status = 'succeeded'`.
- Set `PaymentRefund.confirmed_at`.
- Write `[evt]` `refund_confirmed` exactly once for this PaymentRefund,
  carrying `payment_id`, `payment_refund_id`, and
  `refunded_at = PaymentRefund.confirmed_at`. The LifecycleEvent payload key
  is `refunded_at` per the ratified event catalog; do not substitute
  `confirmed_at` as the payload key.
- Calculate cumulative succeeded `PaymentRefund.amount_atomic` values for
  the parent Payment.
- If cumulative succeeded amount is less than `Payment.amount_atomic`:
  keep `Payment.status = 'confirmed'`.
- If cumulative succeeded amount equals `Payment.amount_atomic`:
  set `Payment.status = 'refunded'`.
- If cumulative succeeded amount exceeds `Payment.amount_atomic`: the
  concurrency-safe capacity allocation must make this impossible during normal
  operation. Once an authenticated Stripe response reports `succeeded`, do
  not falsify or suppress that provider result. Treat overage as a critical
  integrity breach: preserve the provider result, record the PaymentRefund as
  `succeeded` with `confirmed_at`, write its exactly-once `refund_confirmed`
  event, do not issue any further refunds for that Payment, do not perform an
  ordinary automatic `Payment.status` transition, and alert immediately for
  operator reconciliation.

Do not wait for a later webhook before applying these effects when the
authenticated Stripe API response already reports `succeeded`. A later
`refund.updated` or `refund.created` webhook must reconcile idempotently
and must not write a second `refund_confirmed` event.

#### Ambiguous and failed submissions

- If the Stripe API response is ambiguous (network error, timeout), retry
  using the same `PaymentRefund` record and the same `idempotency_key`. Do
  not create a new PaymentRefund for a retry.
- Do not overwrite a non-null `provider_refund_id`.
- If Stripe explicitly rejects the refund and no successful provider
  operation exists, transition `PaymentRefund.status → 'failed'` and set
  `failed_at` and `failure_code`. This is terminal for that record.
- Retrying after a terminal `failed` PaymentRefund requires a new
  `PaymentRefund` record with a new `idempotency_key`. Do not silently reuse
  a failed PaymentRefund as a new refund operation.

### Stripe refund events

#### Accepted event types

Three event types are handled by the refund-reconciliation handler:

| Event type | Description |
|---|---|
| `refund.created` | Stripe has created the Refund object |
| `refund.updated` | The Refund's status or attributes have changed |
| `refund.failed` | Stripe signals a refund failure |

All three event types enter the same handler. The event type is a routing
signal only; it must not determine the internal PaymentRefund status by
itself. In particular:

- `refund.created` must not automatically map to `pending`.
- `refund.failed` does not eliminate the need to retrieve and validate the
  current Refund object; the retrieved object's `status` is passed to the
  status reducer.
- The authenticated Refund object's current `status` is the canonical
  provider state for all transitions.

Do not rely solely on `charge.refunded`. Use `refund.created`,
`refund.updated`, and `refund.failed` as the authoritative refund events.

#### Event intake

On receiving any of the three event types:

1. Verify the webhook signature using `constructEvent`.
2. Apply the established API-version check against
   `ExternalEventReceipt.api_version`.
3. Create or resolve the `ExternalEventReceipt` using
   `(provider = 'stripe', provider_event_id = event.id)`. Do not insert a
   second receipt for the same `(provider, provider_event_id)`. For an
   existing receipt:
   - `processing_status = 'processed'` or `'skipped'`: return the prior
     durable outcome without reapplying domain effects.
   - `processing_status = 'processing'`: do not start a competing handler;
     return or defer according to the established in-flight-delivery policy.
   - `processing_status = 'failed'`: may re-enter `processing` only through
     the controlled retry transition defined by the Data Model; set
     `processing_started_at` and increment `attempt_count` on that
     transition.
4. Require `event.data.object.object = 'refund'`.
5. Retrieve the current Refund object server-side using `refund.id`. Treat
   the retrieved Refund object — not the event snapshot or event type — as
   the current provider state.

Do not mark the ExternalEventReceipt `processed` until the later
status-reducer transaction has completed durably.

#### Resolve the canonical PaymentRefund

Resolve in this order:

1. Query `PaymentRefund.provider_refund_id` using the retrieved `refund.id`.
2. If no record is found by provider ID, use
   `refund.metadata.payment_refund_id` to resolve the locally created
   PaymentRefund.
3. The metadata-resolved PaymentRefund must already exist. Do not create a
   new PaymentRefund from an unmatched webhook.
4. If the resolved PaymentRefund's `provider_refund_id` is null, it will be
   set from `refund.id` as part of the eventual reconciliation transaction.
5. If the resolved PaymentRefund's `provider_refund_id` is already non-null,
   it must equal `refund.id`.
6. The same Stripe Refund ID must never belong to two PaymentRefund records.

#### Required correlation checks

Before passing the Refund to the status reducer, verify all of the
following. Any conflict fails the intake (see Failure behavior):

| Check | Required value |
|---|---|
| `PaymentRefund.provider` | `'stripe'` |
| `event.livemode` | Equals `PaymentRefund.livemode` and parent `Payment.livemode`; Stripe API credentials used for retrieval must match this environment. Do not read `refund.livemode` — the Refund object does not expose a `livemode` field. Identifier prefixes are not environment evidence. |
| `refund.amount` | Equals `PaymentRefund.amount_atomic` |
| `refund.currency` | `'usd'` |
| `PaymentRefund.asset` | `'USD'` |
| `PaymentRefund.asset_decimals` | `2` |
| `refund.payment_intent` | Equals `Payment.provider_payment_id` |
| `PaymentRefund.payment_id` | Resolves to that Payment |
| `refund.metadata.payment_refund_id` | Equals `PaymentRefund.payment_refund_id` |
| `refund.metadata.payment_id` | Equals `PaymentRefund.payment_id` |
| `refund.metadata.purchase_attempt_id` | Resolves to the PurchaseAttempt associated with the Payment |
| `refund.metadata.account_id` | Resolves to the Account associated with that PurchaseAttempt |
| `refund.metadata.reason_code` | Equals `PaymentRefund.reason_code` |

Metadata is a correlation check only. Internal records and the retrieved
Stripe Refund object remain authoritative.

#### Failure behavior

If the Refund cannot be correlated uniquely, or any immutable amount,
currency, environment, PaymentIntent, Payment, PurchaseAttempt, Account,
reason-code, or provider-ID value conflicts:

- Preserve the ExternalEventReceipt and payload hash.
- Set `ExternalEventReceipt.processing_status = 'failed'`.
- Set a machine-readable `last_error_code`:

  | Condition | `last_error_code` |
  |---|---|
  | Refund not found by provider ID or metadata | `REFUND_NOT_FOUND` |
  | Provider ID conflicts with existing PaymentRefund | `REFUND_LINKAGE_CONFLICT` |
  | `refund.amount` ≠ `PaymentRefund.amount_atomic` | `REFUND_AMOUNT_MISMATCH` |
  | `event.livemode` disagrees with `PaymentRefund.livemode`, `Payment.livemode`, or retrieval-account environment | `REFUND_ENVIRONMENT_MISMATCH` |
  | Any metadata value conflicts | `REFUND_METADATA_MISMATCH` |

- Apply no PaymentRefund, Payment, entitlement, or LifecycleEvent
  transition.
- Alert for operator reconciliation.

### Refund lifecycle

#### Reducer input

The refund status reducer receives:

- A signature-verified and version-accepted Stripe Event.
- Its ExternalEventReceipt in `processing` status.
- The freshly retrieved Stripe Refund object (server-side; not the event snapshot).
- The uniquely correlated PaymentRefund, parent Payment, associated
  PurchaseAttempt and Account — all passing the intake correlation checks.

The retrieved `refund.status` determines the requested internal transition:

| `refund.status` | Target `PaymentRefund.status` |
|---|---|
| `pending` | `pending` |
| `requires_action` | `requires_action` |
| `succeeded` | `succeeded` |
| `failed` | `failed` |
| `canceled` | `cancelled` |

Do not add a `provider_status` field. The mapping above is the complete
translation layer.

#### Allowed transitions

Per Data Model `f93bc04`:

| From | May transition to |
|---|---|
| `requested` | `pending`, `requires_action`, `succeeded`, `failed`, `cancelled` |
| `pending` | `succeeded`, `failed`, `cancelled` |
| `requires_action` | `pending`, `succeeded`, `failed`, `cancelled` |
| `succeeded` | — (terminal) |
| `failed` | — (terminal) |
| `cancelled` | — (terminal) |

Receiving the same effective status again is an idempotent no-op, not an
invalid transition. A terminal record must not reopen or move to another
terminal state.

**Disallowed transition:** If the requested transition is not in the table
above and is not an idempotent same-state delivery:

- Preserve the ExternalEventReceipt and payload hash.
- Set `ExternalEventReceipt.processing_status = 'failed'`.
- Set `ExternalEventReceipt.last_error_code = 'REFUND_STATUS_TRANSITION_CONFLICT'`.
- Apply no PaymentRefund, Payment, entitlement, or LifecycleEvent mutation.
- Alert for reconciliation.

#### Common atomic writes

For every valid transition or same-state no-op, the durable reconciliation
transaction must apply all of the following:

- `PaymentRefund.provider_refund_id`: set from `refund.id` only if currently
  null; if already non-null, require exact equality before proceeding.
- `PaymentRefund.provider_created_at`: set if not already set.
- `PaymentRefund.updated_at`: set to the reconciliation timestamp.
- The mapped `PaymentRefund.status` and any status-specific timestamps
  (see below).
- `ExternalEventReceipt.processing_status = 'processed'`.
- `ExternalEventReceipt.processed_at`.
- Clear `ExternalEventReceipt.last_error_code` after a successful controlled
  retry.

Do not overwrite immutable PaymentRefund fields.

#### `pending`

- Set `PaymentRefund.status = 'pending'`.
- Do not write a LifecycleEvent.
- Do not change `Payment.status`.
- Refund capacity remains committed.

#### `requires_action`

- Set `PaymentRefund.status = 'requires_action'`.
- Do not write a LifecycleEvent.
- Do not change `Payment.status`.
- Refund capacity remains committed.
- Operator handling may occur separately; do not define it here.

#### `failed`

- Set `PaymentRefund.status = 'failed'`.
- Set `PaymentRefund.failed_at`.
- Set `PaymentRefund.failure_code` from the authenticated Refund failure
  reason or a stable normalized provider failure code.
- Do not write `refund_confirmed`.
- Do not change `Payment.status`.
- `failed` is terminal; this PaymentRefund no longer consumes derived refund
  capacity. A retry requires a new PaymentRefund operation.

#### `cancelled`

- Map Stripe `canceled` to internal `PaymentRefund.status = 'cancelled'`.
- Do not write `refund_confirmed`.
- Do not change `Payment.status`.
- `cancelled` is terminal; this PaymentRefund no longer consumes derived
  refund capacity.

#### `succeeded`

In the same atomic transaction:

- Set `PaymentRefund.status = 'succeeded'`.
- Set `PaymentRefund.confirmed_at` if not already set.
- Write `[evt]` `refund_confirmed` exactly once for this PaymentRefund,
  carrying `payment_id`, `payment_refund_id`, and
  `refunded_at = PaymentRefund.confirmed_at`.
- Calculate cumulative succeeded `PaymentRefund.amount_atomic` for the
  parent Payment.
- Cumulative < `Payment.amount_atomic`: keep `Payment.status = 'confirmed'`.
- Cumulative = `Payment.amount_atomic`: set `Payment.status = 'refunded'`.
- Cumulative > `Payment.amount_atomic`: apply the critical-integrity-breach
  treatment already specified in the Refund initiation section.
- Do not activate, expire, suspend, revoke, or otherwise change the Coin
  Card or Entitlement merely because a refund succeeded.

#### Same-state idempotency

If the PaymentRefund already has the mapped status, treat the delivery as
successfully reconciled:

- Do not rewrite terminal timestamps.
- Do not create another LifecycleEvent.
- Do not repeat a Payment status transition.
- Mark the ExternalEventReceipt processed.

For an already-`succeeded` PaymentRefund, verify that the exactly-once
`refund_confirmed` event and the correct parent Payment status already
exist. Missing or contradictory domain state is an integrity conflict, not
permission to duplicate effects.

### Refund failure

#### Provider failure versus processing failure

A provider-reported failed refund and a webhook-processing failure are
distinct conditions. When the authenticated, retrieved Stripe Refund maps
validly to `PaymentRefund.status = 'failed'`, the refund lifecycle reducer
has **successfully processed** the provider event. Therefore:

- `PaymentRefund.status = 'failed'`
- `PaymentRefund.failed_at` set
- `PaymentRefund.failure_code` set from the authenticated Refund failure
  reason or a stable normalized provider failure code
- `ExternalEventReceipt.processing_status = 'processed'`
- `ExternalEventReceipt.processed_at` set

Do not set `ExternalEventReceipt.processing_status = 'failed'` merely
because the refund itself failed. Receipt status `'failed'` is reserved for
failures to verify, correlate, or safely apply the domain transition.

#### Terminal operation

A failed PaymentRefund is terminal. It must not:

- Transition back to `requested`, `pending`, or `requires_action`.
- Be resubmitted to Stripe as though it were the same operation.
- Receive a new `provider_refund_id`.
- Write `refund_confirmed`.
- Change `Payment.status`.
- Activate, expire, revoke, suspend, or otherwise alter the Coin Card or
  Entitlement.

Because `failed` is terminal, that PaymentRefund no longer consumes derived
refund capacity.

#### Retrying the business action

If ImplicitEx still intends to refund the customer:

- Create a new `PaymentRefund` record with a new `payment_refund_id`.
- Derive a new provider idempotency key from that new record.
- Re-run all refund eligibility, remaining-capacity, amount, Payment, rail,
  environment, reason, and initiator checks.
- Preserve the failed PaymentRefund permanently as its own audit record. Do
  not mutate or erase the failed operation.
- Do not invent a `retry_of` field unless separately ratified in the Data
  Model.
- Do not automatically create the replacement operation merely because a
  `refund.failed` webhook arrived; a new refund requires separately
  authorized system or operator initiation.

#### Operational handling

- Alert the operator with the PaymentRefund ID, Payment ID, stable failure
  code, amount, and environment.
- Do not include sensitive payment details in logs or notices.
- Customer-notice policy is defined separately; do not specify notice timing
  or copy here.

### Refund pending beyond threshold

#### Internal threshold

Five business days is the V1 internal operational escalation threshold for a
PaymentRefund that remains in `PaymentRefund.status = 'pending'`. This is an
internal monitoring threshold — not a promise that Stripe, a bank, or a card
issuer will complete the refund within five business days, and not a
customer-facing service guarantee.

#### Measuring elapsed time

`PaymentRefund` has no stored `pending_at` field. Calculate elapsed time
without inventing one:

- Use `PaymentRefund.provider_created_at` as the beginning of provider
  processing when available; otherwise use `PaymentRefund.initiated_at`.
- Repeated same-state `pending` webhook deliveries and updates to
  `PaymentRefund.updated_at` must not restart the five-business-day clock.
- Business-day calculation must use the operational calendar and timezone
  established for ImplicitEx operations.
- Do not add a stored deadline or `pending_since` field unless separately
  ratified in the Data Model.

#### Threshold evaluation

When the derived age reaches five business days and the PaymentRefund is
still locally `pending`:

1. Retrieve the current Stripe Refund object server-side using
   `PaymentRefund.provider_refund_id`.
2. Verify the same provider, environment, amount, currency, PaymentIntent,
   Payment, and PaymentRefund linkage required by the refund-event
   correlation gate.
3. Pass the retrieved current status through the existing refund status
   reducer.

The scheduled monitor uses the same canonical status mapping, allowed-transition
table, terminal-state protections, and status-specific domain effects defined
by `### Refund lifecycle`. It is a separate scheduled-reconciliation entry
path — it does not require or create a Stripe Event, and it does not require
or create an ExternalEventReceipt. It must not execute the reducer's
ExternalEventReceipt-specific writes. It must apply the same correlation,
environment, amount, currency, PaymentIntent, Payment, and PaymentRefund
checks before applying any domain transition.

If the retrieved status is `succeeded`, `failed`, `canceled`, or
`requires_action`: apply the corresponding allowed PaymentRefund transition
and status-specific effects atomically, preserving exactly-once
`refund_confirmed` behavior, partial-versus-full Payment status logic,
terminal-state protections, and capacity-release behavior. Do not create an
ExternalEventReceipt for the polling operation. Record the scheduled
reconciliation result in the existing reconciliation case or operational
audit mechanism; do not invent a new Data Model field.

If retrieval confirms `pending`, apply the behavior below.

#### Still pending after verification

A same-state pending observation is not a domain transition.

- Keep `PaymentRefund.status = 'pending'`.
- Do not update `PaymentRefund.updated_at`. Data Model `f93bc04` defines
  `updated_at` as the last update from a provider event; a scheduled polling
  check is not a provider Event. Record the observation timestamp and
  escalation history in the reconciliation case or operational monitoring
  record instead.
- Keep the refund amount committed against derived refund capacity.
- Do not create another PaymentRefund.
- Do not resubmit the same refund to Stripe.
- Do not change `Payment.status`.
- Do not write `refund_confirmed`.
- Do not activate, expire, revoke, suspend, or otherwise change the Coin
  Card or Entitlement.
- Alert the operator with: PaymentRefund ID, Payment ID, provider Refund ID,
  amount, environment, initiation timestamp, provider creation timestamp, and
  elapsed business-day age.
- Open or update one reconciliation case for this PaymentRefund; repeated
  monitoring runs must not create duplicate cases or duplicate alerts at
  every execution.

#### Monitoring idempotency

- Repeated pending observations may update the reconciliation case or
  operational monitoring record. They do not mutate `PaymentRefund` to prove
  that polling occurred.
- Monitoring does not create an ExternalEventReceipt.
- A later actual Stripe Event is still processed normally through the webhook
  intake and refund status reducer. Domain-state idempotency prevents that
  later Event from duplicating any transition already applied through
  scheduled reconciliation.
- Operator-alert deduplication must use the PaymentRefund ID and escalation
  condition. Define any repeated-alert cadence separately; do not invent a
  fixed hourly or daily repeated-alert schedule here.

#### Customer communication boundary

- Customer-notice timing and wording remain governed by the separate notice
  policy.
- Do not promise a processor completion date.
- Do not claim the refund failed merely because it remains pending beyond
  the internal threshold.

### Per-trigger behavior

| Trigger | `Payment.status` before operation | `PaymentRefund.reason_code` | Creation authority / `initiated_by` | PaymentRefund at trigger handling | Existing `pending_activation` Entitlement | Customer notice at initiation |
|---|---|---|---|---|---|---|
| SLA breach | `confirmed` | `provisioning_sla_breach` | `AUTO`; `initiated_by = 'system'` | Create one PaymentRefund with `status = 'requested'`; write `refund_initiated` | If one exists, cancel it with `cancellation_reason = 'provisioning_sla_breach'` and the same non-null `payment_refund_id`; no placeholder | "Provisioning was not completed in time; a refund has been initiated." |
| Post-payment operator refusal | `confirmed` | `operator_initiated` | `AUTO` with `initiated_by = 'system'`, or authorized `PSO` / `FDR` with the actual operator ID | Create one PaymentRefund with `status = 'requested'`; write `refund_initiated` | If one exists, cancel it with `cancellation_reason = 'post_payment_operator_decline'` and the same non-null `payment_refund_id`; no placeholder | "Your purchase could not be completed; a refund has been initiated." |
| Post-payment predicate failure | `confirmed` | `post_payment_predicate_failure` | `AUTO`; `initiated_by = 'system'` | Create one PaymentRefund with `status = 'requested'`; write `refund_initiated` | If one exists, cancel it with `cancellation_reason = 'post_payment_predicate_failure'` and the same non-null `payment_refund_id`; no placeholder | "Your purchase could not be completed; a refund has been initiated." |
| Customer-caused provisioning failure (policy permits) | `confirmed` | `customer_provisioning_failure` | Authorized `OPR`; `initiated_by` is the actual operator ID | Create one PaymentRefund with `status = 'requested'`; write `refund_initiated` | If one exists, cancel it with `cancellation_reason = 'customer_provisioning_failure'` and the same non-null `payment_refund_id`; no placeholder | "Provisioning could not be completed; a refund has been initiated under the governing policy." |
| Customer-requested active cancellation with refund due under Customer Workflows §5.6 | `confirmed` with refundable capacity remaining | `customer_request` | Authorized system or operator under Customer Workflows §5.6; `initiated_by` identifies the actual creator and is never the customer ID merely because the customer requested cancellation | Create one PaymentRefund with `status = 'requested'`; write `refund_initiated` | Not a `pending_activation` path: Customer Workflows §5.6 cancels the existing active Entitlement with `cancellation_reason = 'customer_requested'` and the same non-null `payment_refund_id`; no placeholder | "Your cancellation is complete; a refund has been initiated." |
| Duplicate payment | Duplicate Payment is `confirmed` | `duplicate_payment` | As authorized by the governing reconciliation operation; `initiated_by` identifies the actual authorized creator | Create one PaymentRefund with `status = 'requested'` only when authorized; write `refund_initiated` | No Entitlement cancellation is established by this row; never create a placeholder Entitlement | "A duplicate payment was detected; a refund has been initiated." |
| Manual operator refund | `confirmed` with refundable capacity remaining | Per authorized financial ground | Actual authorized operator ID | Create one PaymentRefund with `status = 'requested'`; write `refund_initiated` | Cancellation depends on the authorized ground and an existing `pending_activation` Entitlement; never create a placeholder | Per-case initiation notice from `OPR` |
| Payment confirmed after PurchaseAttempt expiry | `confirmed` and held; PurchaseAttempt remains `expired` with `PAYMENT_CONFIRMED_AFTER_EXPIRY` | `payment_confirmed_after_expiry` only if a later refund is separately authorized | Not determined by the webhook handler; later authority supplies the creator and `initiated_by` | Webhook handler creates no PaymentRefund and writes no `refund_initiated`; route to reconciliation and the separately authorized refund process | None created or cancelled; no placeholder | Alert `OPR`; customer notice is governed by the separately authorized process |

At PaymentRefund creation, `PaymentRefund.status = 'requested'`,
`refund_initiated` is written with `payment_id`, `payment_refund_id`, and
`refund_reason`, and `Payment.status` remains `confirmed`. Provider submission,
acknowledgement, and confirmation occur later.

When a PaymentRefund reaches provider-confirmed `succeeded`,
`PaymentRefund.confirmed_at` is set and `refund_confirmed` is written exactly
once. A partial cumulative succeeded refund leaves `Payment.status =
'confirmed'`; `Payment.status → 'refunded'` and `Payment.refunded_at` occur only
when cumulative succeeded PaymentRefund amounts equal the full Payment amount.
Failed or cancelled outcomes do not write `refund_confirmed`.

For rows that cancel an existing `pending_activation` Entitlement,
`entitlement_cancelled.payment_refund_id` references the PaymentRefund created
for that operation. Provider submission or success is not a prerequisite for
cancellation. These cancellations create no cancellation EvidencePublication
and never create a placeholder Entitlement.

For the `customer_request` row, Customer Workflows §5.6 remains the governing
authority. When a refund is due, `entitlement_cancelled.payment_refund_id`
references the PaymentRefund represented in this table. When no refund is due,
no PaymentRefund or refund event is created and
`entitlement_cancelled.payment_refund_id = null`. The active-Entitlement
cancellation EvidencePublication is required and is independent of provider
submission or refund success. This Stripe specification does not alter the
30-day refund policy.

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
| Stripe Refund exists but internal `refund_initiated` is absent | Matching `PaymentRefund` exists with `provider_refund_id` equal to the Stripe Refund ID and a corresponding `refund_initiated` LifecycleEvent | Open an integrity-reconciliation case; verify the PaymentRefund creation transaction and event history; do not create a second PaymentRefund or casually synthesize the missing immutable event |
| Internal `refund_initiated` exists but no Stripe Refund is found during provider verification | `PaymentRefund` exists in a non-terminal submission state; `provider_refund_id` may remain null until Stripe acknowledgement | `OPR` verifies the idempotency key and Stripe API state; submit or retry only when the governing operation permits and no provider Refund already exists; never create a second PaymentRefund |
| Stripe Refund raw `status = 'failed'` | `PaymentRefund.status = 'failed'` after canonical provider-state reduction; `failed_at` and any applicable `failure_code` recorded | Alert `OPR`; preserve provider evidence; send the governing customer notice; enter reconciliation when required |
| Test-mode object in live processing | `event.livemode = false` in live handler | Reject; alert `OPR`; audit webhook configuration |
| Amount or currency mismatch | `session.amount_total ≠ 1000` or `session.currency ≠ 'usd'` | Reject confirmation; refund; escalate to `FDR` |
| Success redirect with no verified payment | Return URL hit but `pay.status ≠ 'confirmed'` | Show processing state; no provisioning; log for audit |
| Session completed after reservation expiration | `PurchaseAttempt.status = 'expired'` but session paid | Alert `OPR`; verify `PurchaseAttempt.failure_code = 'PAYMENT_CONFIRMED_AFTER_EXPIRY'`; open or preserve the reconciliation case; refund only through the separately authorized refund process |
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
| Automatic refund — SLA breach | Create one `PaymentRefund` with `status = 'requested'` and write `refund_initiated`; provider acknowledgement may populate `provider_refund_id`; canonical provider-state reduction maps the operation to `status = 'succeeded'` and sets `confirmed_at`; write `refund_confirmed` exactly once on that succeeded transition. `Payment.status` remains `confirmed` until cumulative succeeded PaymentRefund amounts equal `Payment.amount_atomic`. |
| Automatic refund — operator refusal | Same lifecycle; customer notice |
| Duplicate refund request | Idempotency key prevents second Stripe refund |
| Stripe refund failure | Canonical provider-state reduction sets `PaymentRefund.status = 'failed'`, sets `failed_at`, and records any applicable `failure_code`; do not write `refund_confirmed`. This failed PaymentRefund does not itself set `Payment.status = 'refunded'`; aggregate Payment status remains governed by cumulative succeeded PaymentRefund amounts. Preserve provider evidence, alert `OPR`, send the governing customer notice, and enter reconciliation when required. Preserve the existing PaymentRefund and do not create a second PaymentRefund. Do not reverse, recreate, or create a placeholder Entitlement. |
| Refund pending > 5 business days | `PaymentRefund.status = 'pending'` has reached the five-business-day internal operational threshold, measured from `provider_created_at` when available and otherwise from `initiated_at`; repeated same-state pending observations and `updated_at` changes do not restart this clock; retrieve the current Stripe Refund server-side through `PaymentRefund.provider_refund_id`, verify the full correlation gate, and pass the retrieved raw status through the canonical refund status reducer. If it maps to `succeeded`, `failed`, `cancelled`, or `requires_action`, apply the allowed transition and its status-specific effects atomically. If provider verification confirms it is still pending, preserve the existing PaymentRefund at `status = 'pending'`; do not update `updated_at`, resubmit the refund, create another PaymentRefund, write `refund_confirmed`, or change `Payment.status`, the Coin Card, or the Entitlement, and do not create a placeholder Entitlement. Keep the amount committed against refund capacity; alert `OPR` with the required identifiers, timestamps, environment, amount, and elapsed age; open or update one reconciliation case without duplicate cases or repeated alerts on every monitor run. Customer communication follows the separate notice policy: do not promise a provider completion date or claim failure merely because the refund remains pending. |

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

### 2026-08-05 — Refund and reconciliation canonicalization

Governing references advanced to Data Model `f93bc04`, Customer Workflows
`7a9032c`, and Business Operations `4352081`. The minimum Stripe API version was
corrected to `2024-10-28.acacia`.

Refund handling was aligned to the canonical `PaymentRefund` record and status
machine. A refund operation begins with one PaymentRefund at `status =
'requested'` and writes `refund_initiated`; provider acknowledgement is distinct
from provider success, and `refund_confirmed` is written exactly once only when
the PaymentRefund reaches `succeeded`. Aggregate `Payment.status` remains
`confirmed` until cumulative succeeded PaymentRefund amounts equal the full
Payment amount.

Refund-linked Entitlement cancellations now carry the same non-null
`payment_refund_id`, prohibit placeholder Entitlements, and distinguish
`pending_activation` failures from active customer cancellation under Customer
Workflows §5.6. The `payment_confirmed_after_expiry` path now preserves the
expired PurchaseAttempt, creates no PaymentRefund or Entitlement in the webhook
handler, and routes the confirmed Payment to a separately authorized
reconciliation and refund process.

The five-business-day monitor now applies specifically to
`PaymentRefund.status = 'pending'`, uses `provider_created_at` with
`initiated_at` as fallback, preserves the clock across repeated same-state
observations, and performs correlation-gated provider retrieval through the
canonical reducer. Stripe-to-internal reconciliation terminology and the
refund-scenarios testing table were aligned to canonical internal fields and
lifecycle boundaries. Nine governing-document commit citations were refreshed.

### 2026-08-05 — Ratified for implementation

Stripe Checkout V1 is ratified against Entitlement Specification `b3bdc08`,
Data Model `f93bc04`, Customer Workflows `7a9032c`, Business Operations
`4352081`, and minimum Stripe API version `2024-10-28.acacia`.

This ratification authorizes implementation and testing within the stated Coin
Card pilot scope. It does not authorize live Stripe payments until GD-1 through
GD-4 are resolved and their decisions are recorded. Native-USDC checkout,
future Stripe Customer objects, optional unratified Data Model fields, and all
other explicitly excluded operations remain outside this specification.
