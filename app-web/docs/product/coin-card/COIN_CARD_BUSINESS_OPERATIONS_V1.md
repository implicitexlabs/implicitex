# Coin Card Business Operations V1

**Status:** Governing — operator-facing  
**Governing documents:**
- `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `b3bdc08` (ratified)
- `COIN_CARD_DATA_MODEL_V1.md` at `193dcfa` (ratified and closed)
- `COIN_CARD_CUSTOMER_WORKFLOWS_V1.md` at `39ecd95` (ratified and closed)

**Issued:** 2026-08-02

**Scope:** Two operator-facing business-operation workflows. Defines operator
responsibilities, authority, evidence requirements, deadline monitoring,
reconciliation, and exception handling for the Coin Card pilot. Does not govern
checkout screens, customer-facing UI, application code architecture, database
migrations, or marketing policy.

**Implementation contracts referenced (do not reinvent):**
- `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md`
  — canonical JSON, administration evidence hash scheme
- `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md` — publication authority
- `COIN_CARD_LIFECYCLE_REGISTRY_AUTHORITY_CONTRACT_V1.md` — authority model
- `COIN_CARD_SIGNATURE_POLICY_V1.md` — signing policy
- `COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md` — manifest runtime

---

## Shared conventions

### Attribution requirement

Every operator action — routine or privileged — must record the acting
`operator_id` and an `action_timestamp` in the operational log before the
action commits. An action without operator attribution is a process failure.

### Administration evidence

Privileged actions (suspension, restoration, revocation, refund initiation,
signing-key distrust, deadline extension) must create an administration
evidence record before the action takes effect. The evidence record is
canonicalized using `coin-card-canonical-json.v1` and its domain-separated
SHA-256 hash is stored in the lifecycle registry record referencing that
action (see Canonicalization Contract §Administration Evidence Hash).

Administration evidence fields follow the canonical schema (Canonicalization
Contract §Administration Evidence Action Schema):
`evidenceSchemaVersion`, `action`, `cardId`, `manifestId`, `environment`,
`requestedAt`, `effectiveFrom`, `reasonCode`, `authorityId`, `nonce`.

### Append-only history

Records and lifecycle events are append-only. No historical entry may be
modified or deleted by any operator. Correction of an erroneous record
requires a compensating operation with its own administration evidence.

### Event-first rule (inherited)

Every state change must write the corresponding `LifecycleEvent` in the same
atomic transaction before the state change commits. See Customer Workflows V1
shared conventions.

### Evidence publication requirement (inherited)

State changes requiring a new signed public record must advance the
corresponding `EvidencePublication` to `activated` in the same atomic commit.
See Customer Workflows V1 shared conventions.

### Notation

```
→  state change (record field or status)
←  verification or read
[pub]  EvidencePublication created or activated
[evt]  LifecycleEvent written
[aud]  administration evidence record created
[sla]  SLA deadline set or checked
```

Record abbreviations follow Data Model V1 record catalog:
`acct`, `card`, `route`, `ent`, `pay`, `evt`, `pub`, `case`.

---

## Operator roles

The pilot may initially have one person serving multiple roles. Roles are
distinguished by authority and required audit evidence, not by employee count.
A role assignment must be on record before any privileged action is taken.

| Role | Abbreviation | Description |
|---|---|---|
| Automated system | `AUTO` | Provisioning pipeline, payment webhook consumer, SLA monitor, reconciliation scanner |
| Routine operator | `OPR` | Handles first-line provisioning support, refund initiation, customer notice delivery |
| Privileged security operator | `PSO` | Handles suspension cases, restoration, evidence review |
| Founder / designated final reviewer | `FDR` | Revocation, signing-key distrust and rotation, AUP criteria ownership |
| Customer only | `CST` | Actions no operator may perform on the customer's behalf |

---

## Responsibility matrix

| Action | AUTO | OPR | PSO | FDR | CST |
|---|---|---|---|---|---|
| Accept payment / confirm payment | ✓ | — | — | — | — |
| Initiate refund (automated SLA) | ✓ | — | — | — | — |
| Initiate refund (manual) | — | ✓ | ✓ | ✓ | — |
| Decline application before payment | — | — | ✓ | ✓ | — |
| Decline reactivation after payment | — | — | ✓ | ✓ | — |
| Create entitlement / provisioning | ✓ | — | — | — | — |
| Generate recovery codes | ✓ | — | — | — | — |
| Deliver recovery codes (one-time) | ✓ | — | — | — | — |
| Suspend card | — | — | ✓ | ✓ | — |
| Extend suspension deadline | — | — | ✓ | ✓ | — |
| Restore card | — | — | ✓ | ✓ | — |
| Revoke card | — | — | — | ✓ | — |
| Change recipient route | — | — | — | — | ✓ |
| Sign publication artifact | ✓ | — | — | — | — |
| Distrust or rotate signing key | — | — | — | ✓ | — |
| View customer recovery codes | — | — | — | — | ✓ |
| Regenerate recovery codes for customer | — | — | — | — | — |
| Escalate SLA breach | ✓ | ✓ | ✓ | ✓ | — |
| Escalate suspension breach | ✓ | ✓ | ✓ | ✓ | — |
| Define / amend AUP criteria | — | — | — | ✓ | — |

`—` means prohibited. No operator of any level may perform an action marked
`—` for their role. Violations must be treated as security incidents.

---

## Business Operation 1 — Purchase and Provisioning

### Operational objective

Accept a Coin Card purchase order, screen it for eligibility and acceptable
use, confirm payment, provision the signed card identity, activate the
entitlement, and deliver the activated card to the customer — or refund
payment and close the order without activating an entitlement.

### Trigger

A customer submits a Coin Card purchase request (initial activation, renewal,
or post-grace reactivation). The trigger may arrive as a checkout form
submission, a payment-provider webhook, or an on-chain transaction observation
depending on payment rail.

### Entry conditions

- A purchase request is received for a specific handle and a specific customer.
- Customer is authenticated at primary level (SIWE wallet signature) or the
  purchase flow has verified identity through the current authenticated session.
- No active entitlement exists for this customer unless the request is a
  renewal or reactivation.

### Responsible roles

`AUTO` for automated steps. `OPR` for first-line exception handling. `PSO`
or `FDR` for AUP decline decisions.

### Required operator authority

| Action | Minimum authority |
|---|---|
| Pre-payment AUP decline | `PSO` |
| Post-payment AUP decline + refund trigger | `PSO` |
| Manual refund initiation | `OPR` |
| Provisioning SLA extension (with customer agreement) | `OPR` |
| Confirm signing-key health before publish | `AUTO` (automated check) |

### Records and evidence read

- `acct` — customer account existence and status
- `card` — existing card identity for the requested handle
- `ent` — current and prior entitlements for the customer
- `pay` — prior payments to detect duplicates
- `pub` — most recent activated publication (renewal/reactivation only)
- `route` — prior route records (reactivation: prior routes are on record but
  not restored)

---

### Normal operation

#### Phase 1 — Pre-payment eligibility screening

1. Receive purchase request: customer, requested handle, purchase type
   (initial_activation / renewal / reactivation), and payment rail selection.

2. Validate handle availability:
   - **Initial activation:** handle must not be reserved, active, expired, or
     revoked for any other customer. Handle format must satisfy the 3–30
     character alphanumeric-plus-hyphen lowercase constraint.
   - **Renewal:** handle must already be owned by this customer with status
     `active` or `expired` (within grace period).
   - **Post-grace reactivation:** handle must be permanently reserved for
     this customer (`card` record exists with this customer as owner, status
     `expired`, and `NOW() > ent.grace_period_ends_at`).

3. Validate product scope:
   - One active card per customer during the V1 pilot.
   - A customer with an `active` entitlement may not open a second initial
     activation for any other handle.
   - Renewal and reactivation are scoped to the customer's own card.

4. Perform acceptable-use review (`[aud]` if a decision record is created):
   - Review occurs before payment whenever reasonably possible. In the pilot,
     "reasonably possible" means: at the time the purchase request is received
     and before the checkout flow presents payment collection to the customer.
   - For post-grace reactivation, the review also considers the card's prior
     suspension or revocation history (Entitlement Specification §8).
   - If the review concludes the request should be declined:
     - No payment is collected.
     - No entitlement is created.
     - `[aud]` Administration evidence record created with
       `action = DECLINE_APPLICATION`, `reasonCode`, `authorityId`, `nonce`.
     - The customer is notified that the application was not accepted. The
       notice states the reason at the level of detail the operator is
       authorized to disclose; internal AUP criteria are not exposed.
     - Record the minimum operational evidence necessary to explain the
       decision. Do not record internal abuse-detection signals in a customer-
       accessible field.
     - AUP decline authority: `PSO` or `FDR`.
   - If the review concludes the request is eligible, proceed to Phase 2.
   - If the review cannot be completed before payment (insufficient signal,
     system unavailability), a post-payment review is scheduled (Phase 3).

5. Reserve handle (initial activation only):
   - Set handle status to `RESERVED` for this customer.
   - Reservation expires if payment is not confirmed within the checkout
     session window. Expiry releases the reservation without compensation.

#### Phase 2 — Payment initiation and confirmation

6. Present pricing at then-current price:
   - Initial activation: $10 USD pilot price (Entitlement Specification §1).
   - Renewal and reactivation: price in effect at the time of the request,
     disclosed before payment collection.

7. Receive payment submission. Create `pay` record with status `pending`.
   Record:
   - `payment_rail` (`stripe_usd` or `polygon_usdc`)
   - `payment_asset` (`USD` or `USDC`)
   - `amount_atomic` and `asset_decimals`
   - `provider_payment_id` (Stripe payment intent ID or on-chain `network_tx_hash`)
   - `network_chain_id` (Polygon for `polygon_usdc`; null for `stripe_usd`)
   - `created_at`

8. Idempotency gate (before writing or mutating any record):
   - **Stripe:** check whether a `pay` record already exists with the same
     `provider_payment_id`. If yes, return the existing record and do not
     create a duplicate. Repeated webhook delivery must not create a second
     `pay` record or second `ent`.
   - **Polygon USDC:** check whether a `pay` record already exists with the
     same `network_tx_hash` and `network_chain_id`. If yes, return the
     existing record.
   - Idempotency applies at every step: initiation, confirmation, activation.
     A duplicate signal at any phase must not advance state that has already
     been advanced.

9. Await payment confirmation:
   - **stripe_usd:** payment confirmed when Stripe reports `payment_intent.succeeded`
     (or equivalent settled status) and funds are not in dispute.
   - **polygon_usdc:** payment confirmed when the on-chain USDC transfer
     transaction reaches the required block confirmation threshold (threshold
     is an operational parameter; see GD-4). `pay.confirmed_at` is set at
     confirmation, not at submission.
   - `[sla]` Set provisioning deadline: `pay.confirmed_at + 24h`.

10. On payment failure:
    - `pay.status → 'failed'`, `pay.failed_at` set.
    - Handle reservation released.
    - No entitlement created.
    - Customer notified of payment failure.

11. On payment duplication (duplicate signal for a payment already confirmed):
    - Idempotency gate prevents a second `pay` record.
    - Log the duplicate signal with the existing `pay.id` for audit.
    - No further action.

#### Phase 3 — Post-payment checks

12. On payment confirmation, re-verify before provisioning begins:

    a. Re-confirm customer identity and account status. If the account was
       suspended or closed between payment initiation and confirmation,
       automatic full refund initiation is required (`OPR` or `AUTO`).

    b. Re-confirm handle availability and ownership. If the handle was claimed
       by another party between payment initiation and confirmation (race
       condition), the situation is an unrecoverable provisioning failure:
       automatic full refund required. Do not provision on the wrong handle.

    c. Re-confirm that the price charged matches the price in effect.
       If a price discrepancy exists, automatic full refund required.

    d. Re-confirm that the purchase type is still valid (e.g., renewal
       confirmed while entitlement is still active; reactivation confirmed
       while card is still `expired`).

    e. Repeat acceptable-use review when new information has arrived since
       Phase 1 (new report, prior undisclosed suspension history, or Phase 1
       was deferred). "New information" means a material signal that was not
       available or considered at Phase 1.

13. If any Phase 3 re-verification fails due to an operator decision to decline:
    - Automatic full refund initiation. The customer is not required to request
      the refund.
    - `[aud]` Administration evidence: `action = DECLINE_POST_PAYMENT`,
      `reasonCode`, `authorityId`, `nonce`, `paymentId`.
    - No entitlement created.
    - Customer notified: purchase declined, full refund initiated, timeline.
    - Distinguish operator-caused refund from customer-caused provisioning
      failure in the audit record. These are not the same event.

14. If Phase 3 re-verification passes, proceed to Phase 4.

#### Phase 4 — Provisioning

15. Account existence or creation:
    - If no `acct` exists for this customer, create it with `status = active`.
    - If `acct` exists, verify it is not closed or suspended.

16. Card identity:
    - **Initial activation:** create `card` record with `handle`, `card_id`,
      `public_url`, `owner_customer_id`, `status = pending_activation`.
    - **Renewal:** reuse existing `card` record; do not create a new one.
    - **Post-grace reactivation:** reuse existing `card` record; verify `card_id`,
      handle, public URL, and full signed evidence chain are preserved.

17. Entitlement creation:
    - Create `ent` record with `status = pending_activation`, linked to `card`
      and `pay`.
    - Do not set `card.active_entitlement_id` yet.

18. WalletRoute validation and creation:
    - **Initial activation and reactivation:** customer must supply a current,
      valid Polygon USDC address. Validate address format. Create `route` record.
    - **Renewal:** reuse the current active `route` unless the customer has
      supplied a new address (route change at renewal is permitted).
    - A route record from a prior `superseded` term is not automatically
      restored. Historical routes remain on record.

19. Recovery-code generation (initial activation only):
    - Generate 8 one-time recovery codes.
    - Store bcrypt-hashed values in the `acct` record.
    - Plain-text codes are delivered to the customer exactly once after
      activation (see step 28). They are not stored in plain text.
    - Operators may not view or regenerate recovery codes. `CST` only.

20. Canonical artifact assembly:
    - Assemble the card payload in `coin-card-canonical-json.v1` format
      (Canonicalization Contract §Canonical JSON):
      - UTF-8, no insignificant whitespace, keys sorted by Unicode code point,
        NFC-normalized strings.
    - Compute domain-separated SHA-256 payload hash
      (Canonicalization Contract §Payload Hash Vector).
    - EvidencePublication created: `pub.stage = PREPARED`.

21. Signing:
    - Resolve the active `coin-card-registry-publication` signing key
      (`TRUSTED_KEY_ACTIVE` status required; import failure fails closed).
    - Sign the canonical lifecycle registry record per the lifecycle record
      signature schema (Canonicalization Contract §Lifecycle Record Signature
      Schema). IEEE P1363 ECDSA encoding; 86 unpadded base64url characters.
    - `pub.stage → SIGNED`.

22. Publication:
    - Publish signed card package to the registry.
    - Card page becomes accessible at `coincard.click/<handle>`.
    - `pub.stage → PUBLISHED`.
    - `pub.published_at` set.
    - This step must succeed before entitlement activation. If publication
      fails after SIGNED, retry before activating. Do not activate on an
      unpublished package.

23. Atomic entitlement activation (compare-and-swap):
    - In a single atomic transaction:
      a. Read `card.active_entitlement_version` (current value: `v`).
      b. Set `ent.status → active`, `ent.activated_at`, `ent.expires_at`
         (12 calendar months from `ent.activated_at`), `ent.grace_period_ends_at`
         (`ent.expires_at + 30 days`), `ent.route_changes_remaining = 4`.
      c. Set `card.active_entitlement_id = ent.id`,
         `card.active_entitlement_version = v + 1`.
      d. Write `pub.stage → ACTIVATED`, `pub.activated_at`.
      e. Write `[evt]`:
         - Initial activation: `entitlement_activated`
           with `activated_at`, `expires_at`.
         - Renewal: `entitlement_renewed`
           with `activated_at`, `expires_at`, `prior_entitlement_id`.
         - Post-grace reactivation: `entitlement_reactivated`
           with `activated_at`, `expires_at`, `prior_entitlement_id`,
           `prior_publication_id`.
      f. If the compare-and-swap fails (another process changed
         `active_entitlement_version` between read and write), abort and
         create a reconciliation case. Do not activate.
    - `[sla]` Provisioning SLA satisfied if `pub.published_at ≤ pay.confirmed_at + 24h`.

24. Card status update:
    - `card.status → active`.

25. Activation publication fields for reactivation:
    - `pub.publication_type = 'reactivation'`
    - Signing inputs include:
      `reactivation_prior_entitlement_id`, `reactivation_prior_publication_id`,
      `reactivation_effective_at`.
    - See Data Model V1 EvidencePublication table.

26. Customer activation notice:
    - Deliver activation confirmation including:
      - Handle and public URL
      - Activation date and expiration date
      - Route-change allowance
      - Recovery-code delivery (initial activation: one-time plain-text
        delivery with instruction to store securely)
      - Renewal-notice schedule (first notice 30 days before expiration)

#### Phase 5 — SLA monitoring

27. Before 18 hours from `pay.confirmed_at`:
    - `AUTO` checks whether `pub.stage` has reached `PUBLISHED`.
    - If not, alert `OPR` and `PSO`.

28. Before 22 hours from `pay.confirmed_at`:
    - If `pub.stage` has not reached `PUBLISHED`, escalate to `FDR`.
    - Operator must determine whether to obtain the customer's explicit
      agreement to an extension or to initiate an automatic refund.

29. At `pay.confirmed_at + 24h` (SLA deadline):
    - If `pub.stage` has not reached `PUBLISHED`:
      - `[evt]` Write `provisioning_sla_breach` evidence record with
        `deadline`, `breach_detected_at`, `operator_id`.
      - Automatic refund initiation begins (see Recoverable Exception R-1).
      - Escalate to `FDR` immediately.
      - The customer is not required to request the refund.

---

### Records created or mutated

| Record | When | Fields set |
|---|---|---|
| `pay` | Phase 2 | `status`, `payment_rail`, `payment_asset`, `amount_atomic`, `asset_decimals`, `provider_payment_id`, `network_chain_id`, `network_tx_hash`, `created_at`, `confirmed_at` or `failed_at` |
| `acct` | Phase 4 | Created or verified |
| `card` | Phase 4 | Created (initial) or mutated (`status`, `active_entitlement_id`, `active_entitlement_version`) |
| `route` | Phase 4 | Created |
| `ent` | Phase 4 | Created; `status → pending_activation → active`; `activated_at`, `expires_at`, `grace_period_ends_at`, `route_changes_remaining` |
| `pub` | Phase 4 | `stage: PREPARED → SIGNED → PUBLISHED → ACTIVATED`; all stage timestamps |

### Lifecycle events written

| Event | Trigger |
|---|---|
| `entitlement_activated` | Initial activation |
| `entitlement_renewed` | Renewal |
| `entitlement_reactivated` | Post-grace reactivation |
| `provisioning_sla_breach` | 24-hour deadline missed (see GD-2) |
| `payment_failed` | Step 10 |
| `application_declined` | Phase 1 or Phase 3 decline (see GD-3) |
| `publication_abandoned` | Any publication abandoned after PREPARED; internal audit only |

### Evidence publications created

| Type | Trigger |
|---|---|
| `initial_activation` | Initial activation |
| `renewal` | Renewal |
| `reactivation` | Post-grace reactivation |

### Customer notices

| Notice | Timing | Required content |
|---|---|---|
| Eligibility decline (pre-payment) | Phase 1 | Decision and reason at permitted disclosure level |
| Payment failure | Phase 2, step 10 | Failure reason; no charge |
| Post-payment decline | Phase 3, step 13 | Decision, refund initiated, timeline |
| Activation confirmation | Phase 4, step 26 | Handle, URL, dates, route allowance, recovery codes (initial only) |
| Renewal notice | 30 days before `ent.expires_at` | Upcoming expiration, renewal instructions, pricing |
| Provisioning SLA extension request | Before 24h deadline if extending | Extension request, new deadline, explicit agreement required |
| SLA breach refund initiation | At or immediately after breach | Breach, automatic refund initiated, timeline |

### Internal deadlines

| Deadline | Window | Consequence if missed |
|---|---|---|
| Provisioning SLA | `pay.confirmed_at + 24h` | Automatic refund; `provisioning_sla_breach` event; `FDR` escalation |
| Handle reservation expiry | Checkout session window (operational parameter) | Handle released to pool |
| Refund initiation | Immediately on trigger | Reconciliation case opened |
| Refund confirmation | Provider-dependent; daily check | Reconciliation alert if unresolved |

### Queue and escalation behavior

- Active provisioning orders are tracked in the operator queue.
- Any order not at `pub.stage = ACTIVATED` 18 hours after `pay.confirmed_at`
  generates an alert to `OPR` and `PSO`.
- Any order not at `pub.stage = ACTIVATED` 22 hours after `pay.confirmed_at`
  escalates to `FDR`.
- Refund orders not confirmed by the payment provider within 24 hours of
  initiation generate a reconciliation alert.

### Idempotency and duplicate prevention

- Stripe webhook: `provider_payment_id` (payment intent ID) is the idempotency
  key. Repeated delivery at any webhook state must not create a second `pay`
  record or advance an already-completed state.
- Polygon USDC: `network_tx_hash` + `network_chain_id` is the on-chain
  identity. Repeated observation (chain reorganization, monitoring retry)
  must not create a second `pay` record.
- Entitlement activation: `card.active_entitlement_version` compare-and-swap
  prevents double-activation. A failed compare-and-swap opens a reconciliation
  case; it does not silently succeed.
- Publication stages are monotonically advancing. A publication already at
  `ACTIVATED` must not be re-processed.

### Reconciliation procedure

Daily reconciliation compares:

| Source | Expected match |
|---|---|
| Payment provider / on-chain evidence | `pay` records with matching status |
| `pay` records | Corresponding `ent` records |
| `ent` records with `status = active` | `card.active_entitlement_id` pointing to this `ent` |
| `pub` records at `ACTIVATED` | `ent.status = active` with this publication |
| Refund initiations | Provider refund confirmations |

**Orphan states requiring corrective action:**

| Orphan state | Corrective action |
|---|---|
| Confirmed payment (`pay.status = confirmed`) with no `ent` record | Create reconciliation case; escalate to `OPR`; do not provision without operator review |
| `ent` record with `status = active` but no corresponding confirmed `pay` | Immediate escalation to `PSO`; treat as integrity failure until explained |
| `pub.stage = PUBLISHED` but no `pub.stage = ACTIVATED` (>2h) | Escalate to `OPR`; retry activation or issue compensating publication |
| `card.active_entitlement_id` set but corresponding `ent.status ≠ active` | Immediate escalation to `PSO`; pointer mismatch is an integrity failure |
| Refund initiated but no provider confirmation (>24h) | Alert `OPR`; follow up with provider; do not re-initiate without confirming non-duplication |
| Two `pay` records sharing `provider_payment_id` or `network_tx_hash` | Immediate escalation; idempotency failure; one record must be marked `duplicate` with explanation |
| `card.active_entitlement_version` gap (non-sequential) | Escalate to `PSO`; audit the gap |

Corrective action must not rewrite historical records. Corrections must be
compensating operations with administration evidence and operator attribution.

### Recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| R-1: Provisioning failure before deadline | `pub.stage < PUBLISHED` and time < `pay.confirmed_at + 24h` | Retry provisioning; keep order active; alert `OPR` per SLA schedule |
| R-2: Signing unavailable | Signing key not importable or service unavailable | Halt provisioning; alert `OPR`; do not sign with unverified key; retry when key is available |
| R-3: Publication delivery failure | Registry unavailable during PUBLISHED step | Retry publication; do not activate on unconfirmed publication |
| R-4: Customer-caused provisioning failure | Customer cannot supply a valid recipient address within the provisioning window | Cancel provisioning; apply refund rules per Entitlement Specification §8; no operator penalty |
| R-5: Payment provider webhook delay | Stripe or on-chain confirmation delayed | Wait; do not activate on pending payment; alert if delay exceeds operational threshold |
| R-6: Handle race condition | Handle claimed by another order between reservation and activation | Refund the losing order automatically; preserve handle for winner |

### Non-recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| N-1: SLA breach without extension agreement | `pay.confirmed_at + 24h` reached without `pub.stage = PUBLISHED` and no customer extension agreement | Automatic full refund; `provisioning_sla_breach` event; no residual obligation to provision |
| N-2: Post-payment AUP decline | Operator declines after confirmed payment | Automatic full refund; `application_declined` evidence; no entitlement |
| N-3: Compare-and-swap race (unresolved) | Two concurrent activations both attempted on the same card | Reconciliation case; one activation wins; the other is refunded; no double-entitlement |
| N-4: Signing-key integrity failure | Trusted key cannot be imported or is distrust-listed | Halt all provisioning; escalate to `FDR`; do not proceed until resolution |

### Audit evidence

Every completed purchase-and-provisioning operation must preserve:

1. Purchase request record with timestamp and operator attribution.
2. AUP review decision record (Phase 1 and Phase 3) with `[aud]`.
3. `pay` record with all payment fields.
4. `ent` record with all lifecycle fields.
5. `pub` record with all stage timestamps.
6. `[evt]` for all lifecycle events written.
7. Customer notice delivery records.
8. Any refund initiation and confirmation records.

### Completion conditions

**Successful completion:** `pub.stage = ACTIVATED`, `ent.status = active`,
`card.active_entitlement_id = ent.id`, `card.status = active`, customer
activation notice delivered, and (for initial activation) recovery codes
delivered exactly once.

**Refund completion:** `pay.status = refunded`, `pay.refunded_at` set,
provider refund confirmed, no `ent` in `active` status, customer notified.

### Daily and periodic control checks

| Check | Frequency | Responsible |
|---|---|---|
| Provisioning SLA queue — any order > 18h since `pay.confirmed_at` without `ACTIVATED` | Every 4 hours | `AUTO` → alert `OPR` |
| Pending `pay` records with no confirmation > 24h | Daily | `AUTO` → alert `OPR` |
| `pub.stage = PUBLISHED` without `ACTIVATED` > 2h | Daily | `AUTO` → alert `OPR` |
| Orphan state reconciliation | Daily | `AUTO` report → `OPR` review |
| Pending refunds unconfirmed > 24h | Daily | `OPR` |
| Failed customer notice delivery | Daily | `OPR` |
| Recovery-code delivery confirmation (initial activations) | Per activation | `AUTO` |

### Explicitly prohibited operator actions

- Activating an entitlement on a payment that has not been confirmed.
- Creating a `pay` record without a provider payment identity.
- Signing a card package with a key that is not `TRUSTED_KEY_ACTIVE`.
- Activating a second entitlement for a customer who already has an `active`
  entitlement (pilot limit).
- Restoring a handle reservation after a different customer has reserved it.
- Delivering recovery codes more than once or storing them in plain text.
- Regenerating recovery codes on a customer's behalf.
- Retaining payment after refusing to provide the entitlement.
- Modifying or deleting any historical `pay`, `ent`, `pub`, or `evt` record.
- Initiating a refund as a substitute for completing provisioning without
  first triggering the SLA deadline or receiving a customer request.

---

## Business Operation 2 — Protection and Recovery

### Operational objective

Detect and respond to security threats, credential compromises, integrity
failures, and acceptable-use concerns affecting Coin Cards, while preserving
card identity continuity, customer access to self-managed credentials, and
the non-custodial boundary. Assist with account recovery without overriding
customer authority or taking custody.

### Trigger

A security signal is received. Sources include: customer report, automated
integrity check failure, suspicious route-change attempt, credential compromise
report, signing-key or publication-integrity incident, provider-continuity
failure, or acceptable-use concern.

### Entry conditions

- A security signal of any classification has arrived.
- The signal is attributed to a specific card, account, or publication range
  (or flagged as unknown scope pending intake).

### Responsible roles

`OPR` for intake and triage. `PSO` for containment, suspension, and restoration.
`FDR` for revocation, signing-key actions, and any incident with a scope
affecting more than one customer.

### Required operator authority

| Action | Minimum authority |
|---|---|
| Intake and classification | `OPR` |
| Block pending management operation | `PSO` |
| Suspend card | `PSO` |
| Extend suspension deadline (documented) | `PSO` |
| Restore card | `PSO` with evidence |
| Revoke card | `FDR` |
| Distrust signing key | `FDR` |
| Compensating publication | `FDR` |
| Communicate recovery process to customer | `OPR` |

### Records and evidence read

- `acct` — account and credential status
- `card` — card status, `active_entitlement_id`, current publication
- `ent` — entitlement status and term
- `pub` — publication chain for integrity verification
- `case` — open SuspensionCases
- `evt` — lifecycle event history
- `route` — route history for suspicious-change review
- Signing-key registry

---

### Normal operation

#### Sub-operation 2.1 — Security report intake

1. Receive signal. Record:
   - Source (customer / automated / internal / external)
   - Signal type (see taxonomy below)
   - Affected `card_id`, `acct_id`, or publication range
   - Evidence confidence level (confirmed / suspected / unknown)
   - Immediate customer risk classification (funds at risk / access at risk /
     reputational risk / no immediate risk)
   - Receiving operator ID and timestamp

   **Signal taxonomy:**

   | Type | Examples |
   |---|---|
   | `credential_compromise` | Customer reports wallet or email compromised |
   | `suspicious_route_change` | Route change that customer did not authorize |
   | `integrity_failure` | Manifest verification failed; signature mismatch |
   | `publication_tampering` | Card package contents inconsistent with signed record |
   | `signing_key_incident` | Publication key exposed or suspected exposed |
   | `execution_boundary_failure` | Execution eligibility returned wrong result |
   | `acceptable_use_concern` | Reported misuse or fraudulent use pattern |
   | `provider_continuity_failure` | Payment or execution provider incident |
   | `unknown` | Signal received without sufficient classification |

2. Classify severity:
   - **Critical:** funds at immediate risk, signing key integrity in question,
     or multi-card scope. Escalate to `PSO` and `FDR` immediately.
   - **High:** active card at risk of unauthorized route change or credential
     hijacking. Escalate to `PSO` within 1 hour.
   - **Medium:** suspicious signal without confirmed impact. `OPR` triages;
     `PSO` notified.
   - **Low:** informational or historical signal without current risk.
     `OPR` logs and monitors.

3. Create incident record with signal type, severity, affected scope, evidence
   basis, and initial operator attribution.

4. Proceed to Sub-operation 2.2 for containment assessment.

---

#### Sub-operation 2.2 — Immediate containment

5. Assess whether immediate containment is required:

   - **Block pending management operation:** If a route-change, cancellation,
     or renewal request is in flight and the associated credential appears
     compromised, `PSO` may block the pending operation before it commits.
     `[aud]` Administration evidence: `action = BLOCK_PENDING_OPERATION`.

   - **Invalidate unused authorization proof:** If a recently issued
     authorization proof (e.g., SIWE nonce, route-change challenge) is
     suspected of being stolen, `PSO` may invalidate it before use.
     `[aud]` Administration evidence: `action = INVALIDATE_AUTHORIZATION`.

   - **Suspend card (see Sub-operation 2.3):** If the card itself must be
     taken non-executable while a review proceeds.

   - **Disable payment execution through lifecycle status:** Suspension
     already achieves this for the card. For execution-layer failures,
     `FDR` may direct the execution boundary to refuse execution on
     specific cards without issuing a suspension publication.

   - **Distrust signing key (see Sub-operation 2.7):** If the publication
     key is suspected compromised.

6. Containment must not:
   - Move customer funds.
   - Revoke wallet permissions on the customer's behalf.
   - Change the recipient route without valid customer authority
     (primary SIWE credential and route-change allowance).
   - Sign anything as the customer.
   - Reveal or regenerate recovery codes.
   - Treat a report as proven before recording its evidence basis.

7. After containment (or if no containment required), proceed to the
   appropriate sub-operation:
   - Suspension needed → Sub-operation 2.3
   - Restoration only → Sub-operation 2.4
   - Revocation → Sub-operation 2.5
   - Account recovery assistance → Sub-operation 2.6
   - Signing-key incident → Sub-operation 2.7

---

#### Sub-operation 2.3 — Suspension review

8. Suspension initiation:
   - Authority: `PSO` or `FDR`.
   - `[aud]` Administration evidence: `action = SUSPEND_CARD`, `reasonCode`,
     `authorityId`, `cardId`, `effectiveFrom`, `nonce`.
   - `[pub]` EvidencePublication: `publication_type = 'suspension'`,
     `pub.stage → PREPARED → SIGNED → PUBLISHED → ACTIVATED`.
   - `[evt]` `entitlement_suspended`: `suspended_at`, `reason`, `operator_id`.
   - `card.status → suspended`. `ent.status → suspended`.
   - Card is non-executable. Card page shows `SUSPENDED` status publicly.
   - `[sla]` Set `case.review_deadline = suspension_initiated_at + 7 calendar days`.
   - Create `case` record: `case_id`, `card_id`, `ent_id`, `opened_at`,
     `reason`, `status = open`, `operator_id`, `review_deadline`.
   - **Customer notice:** delivered at the time of suspension. Must include:
     stated reason at permitted disclosure level; the existence of the
     review process; contact information for the operator.

9. Suspension review period:
   - `PSO` or `FDR` collects evidence. All operator notes and evidence
     references are recorded in the `case` record with timestamps and
     operator IDs.
   - The case must resolve within 7 calendar days of initiation.

10. Suspension deadline extension (if required):
    - A single extension of up to 7 calendar days is permitted.
    - Authority: `PSO` or `FDR`.
    - `[aud]` Administration evidence: `action = EXTEND_SUSPENSION`,
      `reasonCode`, `authorityId`, `cardId`, `nonce`.
    - `case.extension_reason` recorded.
    - `case.extended_at` set.
    - `case.extension_deadline = case.review_deadline + N days` (≤ 7).
    - **Customer notice:** reason for extension and new deadline.
    - One extension only. A second extension is not permitted.

11. Suspension deadline breach (14-calendar-day absolute ceiling):
    - If the case is unresolved at `case.extension_deadline`
      (or at `case.review_deadline` if no extension was granted):
      - `case.deadline_breached_at` set.
      - `case.escalated_at` set.
      - `case.process_failure_code` recorded.
      - Escalate immediately to `FDR`.
      - Breach is an operational escalation, not a customer disposition.
        The card remains `suspended` until a valid disposition is reached.
    - A suspension that passes 14 calendar days without a recorded resolution
      or documented extension must be escalated and resolved immediately.

12. Suspension case resolution — three valid dispositions:
    - **Restoration:** review concluded without grounds for action. Proceed
      to Sub-operation 2.4.
    - **Revocation:** review confirmed a violation. Proceed to Sub-operation 2.5.
    - **Expiration during suspension:** entitlement term ended during the
      suspension period. `ent.status → expired`. Card non-executable by
      expiration rather than suspension. Suspension case is closed with
      `disposition = expired`. `[pub]` expiration publication if not
      already published. `[evt]` `entitlement_expired`.

---

#### Sub-operation 2.4 — Restoration

13. Restoration preconditions:
    - Review concluded without grounds for action, or
    - Underlying integrity issue has been resolved.
    - If the restoration follows a suspension, the suspension case must be
      in the review phase (not expired, not already revoked).
    - Verify that `ent.status` is not `expired` or `revoked`. If the
      entitlement expired during suspension, execution is not restored
      (card remains non-executable due to expiration, not suspension).

14. Restoration execution:
    - Authority: `PSO` with evidence (for suspension-originated restoration).
    - `[aud]` Administration evidence: `action = RESTORE_CARD`, `reasonCode`,
      `authorityId`, `cardId`, `effectiveFrom`, `nonce`.
    - `[pub]` EvidencePublication: `publication_type = 'restoration'`,
      `pub.stage → PREPARED → SIGNED → PUBLISHED → ACTIVATED`.
    - `[evt]` `entitlement_restored`: `restored_at`, `operator_id`,
      `resolution_summary` (at permitted disclosure level).
    - `ent.status → active`. `card.status → active`.
    - Verify that `card.active_entitlement_id` still points to `ent.id`.
    - Card returns to executable status only if `ent.status = active`.
      If the entitlement expired during suspension, the card does not
      return to executable status.
    - If a SuspensionCase is open: `case.status → closed`,
      `case.resolved_at`, `case.resolution = restored`.
    - **Customer notice:** restoration confirmed; card is executable;
      reason for original suspension at permitted disclosure level.

---

#### Sub-operation 2.5 — Revocation

15. Revocation preconditions:
    - Confirmed grounds: acceptable-use violation, fraud, court order, or
      other documented grounds per Entitlement Specification §6.
    - Authority: `FDR` only. Revocation requires final review authority.
    - Evidence basis must be recorded before the revocation action.

16. Revocation execution:
    - `[aud]` Administration evidence: `action = REVOKE_CARD`, `reasonCode`,
      `authorityId`, `cardId`, `effectiveFrom`, `nonce`, `evidenceSummaryHash`.
    - `[pub]` EvidencePublication: `publication_type = 'revocation'`,
      `pub.stage → PREPARED → SIGNED → PUBLISHED → ACTIVATED`.
    - `[evt]` `entitlement_revoked`: `revoked_at`, `operator_id`,
      `grounds_code`.
    - `ent.status → revoked`. `card.status → revoked`.
    - Card is permanently non-executable. Card page shows `REVOKED` status
      publicly.
    - If a SuspensionCase is open: `case.status → closed`,
      `case.resolved_at`, `case.resolution = revoked`.
    - **Customer notice:** revocation confirmed; reason at permitted disclosure
      level; no refund for the remaining term when revocation is for cause
      (Entitlement Specification §6).
    - Historical evidence is preserved. All prior signed publications remain
      on the record.
    - Coin Card identity (handle, `card_id`, public URL) is NOT reassigned.
      Handle enters a post-revocation hold. No reassignment policy exists
      without an independent security review.

---

#### Sub-operation 2.6 — Account-access recovery support

17. Operator scope:
    - Operators may communicate the recovery process to the customer.
    - Operators may verify whether a recovery code has been used (used or
      unused; not the code value).
    - Operators may confirm whether a primary or secondary credential
      is on record.
    - Operators must not view, disclose, or generate recovery codes.
    - Operators must not initiate or facilitate account closure, route
      changes, cancellation, renewal, or reactivation as part of a recovery
      session.

18. Recovery initiation (customer-initiated):
    - Customer presents an unused recovery code and completes the verified-
      email challenge (see Customer Workflows V1 §1.4).
    - The recovery session may only restore a primary credential.
    - Recovery code is marked used immediately upon session initiation.
    - Operator may support by confirming process steps; may not perform
      the recovery action on the customer's behalf.

19. Post-recovery fresh session requirement:
    - After credential restoration, the recovery session is terminated.
    - Management operations (route changes, cancellation, renewal,
      reactivation) require a fresh primary-authenticated session.
    - A recovery session may not proceed directly to management operations.

20. Operator refusals — operators must refuse:
    - Providing the value of any recovery code.
    - Providing a replacement or additional recovery code.
    - Performing a route change, cancellation, renewal, or reactivation
      during or as a result of a recovery request.
    - Changing the customer's registered email address during a recovery
      session.
    - Closing the account during a recovery session.

21. Permanent credential loss:
    - If the customer has no accessible primary credential, no accessible
      secondary credential, and no unused recovery codes, account access
      cannot be restored by operator action.
    - The customer's funds are not affected: the recipient address on-chain
      is not controlled by ImplicitEx.
    - `OPR` must communicate this boundary clearly and without implication
      that further operator action is pending.

---

#### Sub-operation 2.7 — Signing-key or publication-integrity incident

22. Detection:
    - Sources: automated key-import failure, signature verification failure,
      manifest integrity mismatch, external disclosure, or `FDR` judgment.
    - `FDR` must be notified immediately for any suspected signing-key incident.

23. Affected publication range:
    - Identify the first publication that may have used the affected key.
    - All publications from that point are potentially affected until the
      key is confirmed as not used (or the incident is bounded).
    - The affected range is an input to customer notification threshold.

24. Key distrust:
    - Authority: `FDR` only.
    - `[aud]` Administration evidence: `action = DISTRUST_KEY`, `keyId`,
      `reasonCode`, `authorityId`, `effectiveFrom`, `nonce`.
    - Distrusted key is removed from `TRUSTED_KEY_ACTIVE` status immediately.
    - Verification using the distrusted key must fail closed from this point.

25. Key rotation:
    - Authority: `FDR` only.
    - Generate and import a new signing key per the trusted-key population
      contract (Canonicalization Contract §Registry Publication Key Binding).
    - Trusted-key population must be validated before any new key is used.
    - `[aud]` Administration evidence: `action = ROTATE_KEY`, `newKeyId`,
      `reasonCode`, `authorityId`, `effectiveFrom`, `nonce`.

26. Compensating publications:
    - If any card's publication chain integrity is in question, a compensating
      publication must be issued with the new, trusted key.
    - Compensating publications must reference the prior publication they
      supersede via `prior_publication_id`.
    - Authority for compensating publication: `FDR`.
    - `[pub]` EvidencePublication with appropriate `publication_type`.

27. Customer notification threshold:
    - If any customer's card was potentially affected (signed artifact
      authenticity in question), the customer must be notified.
    - Notification threshold: any card in the affected publication range
      that is or was `active` during the incident window.
    - Notification content: that a signing infrastructure event occurred;
      the card's current status; what action (if any) the customer should take.

28. Fail-closed behavior:
    - While the incident is unresolved, all new publications halt until
      a trusted key is confirmed available.
    - Existing card verifications using the distrusted key must return an
      integrity failure, not a cached positive result.

29. Restoration criteria:
    - New key confirmed importable and `TRUSTED_KEY_ACTIVE`.
    - Affected publication range bounded and compensating publications issued.
    - Evidence preservation confirmed for all affected records.

30. Evidence preservation:
    - All pre-incident publications, signatures, and manifest records are
      preserved in full. Historical evidence must not be deleted.
    - The evidence chain is append-only; compensating publications extend
      the chain rather than replacing prior entries.

---

#### Sub-operation 2.8 — Periodic controls

31. The following checks are required at minimum during the pilot:

| Check | Frequency | Responsible | Escalation |
|---|---|---|---|
| Open SuspensionCases — deadline proximity | Daily | `AUTO` → `PSO` | 24h before deadline: alert `PSO`; breach: immediate `FDR` |
| SuspensionCase deadline breach monitoring | Every 4 hours | `AUTO` | Breach: immediate `FDR` escalation |
| Published-but-not-activated artifacts | Daily | `AUTO` → `OPR` | > 2h: alert `OPR` |
| Active-entitlement pointer consistency | Daily | `AUTO` → `PSO` | Mismatch: immediate `PSO` escalation |
| Pending refunds unconfirmed | Daily | `OPR` | > 24h: escalate to `PSO` |
| Failed customer notices | Daily | `OPR` | Retry; if still failed: escalate |
| Signing-key status (`TRUSTED_KEY_ACTIVE`) | Weekly | `FDR` | Any distrust: immediate incident |
| Evidence-chain continuity | Weekly | `PSO` | Break detected: immediate `FDR` |
| Outcome-unknown operational incidents | Daily | `OPR` → `PSO` | Unresolved > 48h: `FDR` |
| Provisioning SLA queue | Every 4 hours | `AUTO` → `OPR` | See BO1 SLA schedule |

---

### Records created or mutated

| Record | When | Fields set |
|---|---|---|
| Incident record | Intake | `signal_type`, `severity`, `scope`, `evidence_confidence`, `operator_id`, `created_at` |
| `case` | Suspension | All `SuspensionCase` fields; `deadline_breached_at` / `escalated_at` if applicable |
| `ent` | Suspension / restoration / revocation | `status` transition |
| `card` | Suspension / restoration / revocation | `status` transition |
| `pub` | Suspension, restoration, revocation, compensating publication | `publication_type`, all stage timestamps |
| Administration evidence | Every privileged action | Per canonicalization contract |

### Lifecycle events written

| Event | Sub-operation |
|---|---|
| `entitlement_suspended` | 2.3 |
| `entitlement_restored` | 2.4 |
| `entitlement_revoked` | 2.5 |
| `entitlement_expired` (if during suspension) | 2.3 |
| `recovery_code_used` | 2.6 |

### Evidence publications created

| Type | Sub-operation |
|---|---|
| `suspension` | 2.3 |
| `restoration` | 2.4 |
| `revocation` | 2.5 |
| Compensating `initial_activation` / `renewal` / `reactivation` | 2.7 |

### Customer notices

| Notice | Required content |
|---|---|
| Suspension notice | Stated reason; review period; contact |
| Suspension extension | Reason; new deadline |
| Restoration notice | Restoration confirmed; card executable |
| Revocation notice | Permanent; reason at permitted level; refund status |
| Recovery-scope communication | What operator can and cannot do |
| Signing-key incident (if threshold reached) | Event occurred; card status; next steps |

### Internal deadlines

| Deadline | Window | Consequence |
|---|---|---|
| Suspension initial review | 7 calendar days from `case.opened_at` | Escalate to `FDR`; must resolve |
| Suspension extension | ≤ 7 calendar days from extension | Breach; immediate `FDR` escalation |
| Suspension absolute ceiling | 14 calendar days from `case.opened_at` | Process failure; immediate `FDR` escalation |
| Signing-key incident response | No fixed window; fail-closed until resolved | Publications halted; affected customers notified |

### Queue and escalation behavior

- All open `SuspensionCase` records are in the operator queue.
- `AUTO` checks case deadlines every 4 hours.
- 24 hours before `case.review_deadline`: alert `PSO`.
- At or after breach: immediate `FDR` escalation with `case.deadline_breached_at`.
- Signing-key incidents bypass queue; notify `FDR` immediately.

### Idempotency and duplicate prevention

- A card may have at most one open `SuspensionCase` at a time.
- Initiating a second suspension while one case is open is not permitted.
- Administration evidence records carry a `nonce` to prevent replay.
- Compensating publications carry `prior_publication_id`; re-processing the
  same compensating event must not create a second publication.

### Reconciliation procedure

| Check | Expected state | Action if mismatch |
|---|---|---|
| `card.status = suspended` | Open `case` exists | Escalate to `PSO`; do not restore without case review |
| `ent.status = suspended` | Corresponding `pub` with `suspension` type | Create compensating publication if pub missing |
| `case.status = closed` | `card.status` is `active` or `revoked` | Reconcile; pointer inconsistency is integrity failure |
| No open `case` | No card with `status = suspended` | Alert `PSO` if suspended card has no case |

### Recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| R-1: Signing unavailable during suspension | Key not importable | Halt suspension publication; containment via execution block; escalate to `FDR` |
| R-2: Customer report with insufficient evidence | Signal received, evidence insufficient for action | Log; monitor; request additional information; no suspension without evidence basis |
| R-3: Case deadline approaching with review incomplete | < 24h to deadline | Alert `PSO`; accelerate review; extension if genuinely required |

### Non-recoverable exceptions

| Exception | Condition | Response |
|---|---|---|
| N-1: Suspension deadline breach | 14 calendar days without resolution | Immediate `FDR` escalation; process failure |
| N-2: Signing-key exposure confirmed | Key material externally disclosed | Distrust immediately; compensating publications for all affected cards |
| N-3: Evidence chain break | Historical records found modified or deleted | Security incident; `FDR` involvement; forensic preservation |
| N-4: Irrecoverable credential loss | No primary, secondary, or recovery codes | Cannot restore access by operator action; communicate to customer clearly |

### Audit evidence

Every protection-and-recovery operation must preserve:

1. Incident record with intake classification, operator attribution, timestamp.
2. `[aud]` Administration evidence for every privileged action.
3. `case` record with complete timeline (opened, extended, resolved).
4. All `[pub]` records with stage timestamps.
5. All `[evt]` lifecycle events.
6. Customer notice delivery records.
7. Signing-key status records at time of incident and at resolution.

### Completion conditions

**Suspension restored:** `case.status = closed`, `case.resolution = restored`,
`ent.status = active`, `card.status = active`, restoration publication `ACTIVATED`,
customer notified.

**Suspension revoked:** `case.status = closed`, `case.resolution = revoked`,
`ent.status = revoked`, `card.status = revoked`, revocation publication `ACTIVATED`,
customer notified.

**Suspension expired:** `case.status = closed`, `case.resolution = expired`,
`ent.status = expired`, expiration publication `ACTIVATED`.

**Recovery support:** customer has been informed of all available options and
all operator-prohibited actions. No management operation has been performed
on the customer's behalf.

**Signing-key incident:** new trusted key is `TRUSTED_KEY_ACTIVE`, affected
publications range is bounded, compensating publications issued where required,
evidence preserved.

### Explicitly prohibited operator actions

- Suspending a card without creating a `SuspensionCase` and administration evidence.
- Revoking a card without `FDR` authority and documented grounds.
- Restoring a card without evidence that the underlying issue is resolved.
- Moving, redirecting, or intercepting customer funds for any purpose.
- Changing a recipient route without valid customer authority (primary SIWE
  credential with remaining route-change allowance).
- Signing any artifact as the customer or on the customer's behalf.
- Viewing, generating, or delivering recovery codes on behalf of any customer.
- Extending a suspension deadline more than once or beyond 7 additional days.
- Allowing a suspension to remain open beyond 14 calendar days without an
  escalated and active `FDR` resolution process.
- Deleting, overwriting, or modifying any historical `pub`, `evt`, `case`,
  or administration evidence record.
- Reassigning a revoked card's handle without an independent security review.
- Signing any new card package while a signing-key incident is unresolved.

---

## Boundaries

These boundaries are non-negotiable and must not be compromised by any
operator action, system configuration, or exceptional circumstance:

| Boundary | Rule |
|---|---|
| Non-custody | ImplicitEx never holds, controls, or accesses customer funds. Transfers are non-custodial. |
| Least privilege | No operator action exceeds the authority defined in the responsibility matrix. |
| Immutable lifecycle history | No record, event, or publication is modified or deleted after creation. Corrections are compensating operations. |
| Fail-closed verification | An ambiguous, failed, or unresolvable verification returns failure. A cached positive result must not be used when the verification state is unknown. |
| No automatic renewal | The pilot does not auto-renew. No operator or automated system initiates renewal without an explicit customer action. |
| No insurance or reimbursement | ImplicitEx provides no insurance and no reimbursement for misdirected or lost on-chain transfers. |
| No operator-created customer signatures | No operator may sign anything as or on behalf of a customer. |
| No silent route changes | Recipient routes change only on explicit customer authority. No background migration, consolidation, or "correction" of routes. |
| No retained payment | ImplicitEx may not retain payment after refusing to provide the entitlement, for any reason. |
| No indefinite suspension | Suspension may not exceed 14 calendar days without an escalated resolution process. |

---

## Operation crosswalk

| Operation | Customer workflow | Records | Lifecycle events | Publication types | Customer notice | Deadline | Authority |
|---|---|---|---|---|---|---|---|
| Initial activation | W2 §2.1–2.6 | `pay`, `ent`, `card`, `route`, `pub` | `entitlement_activated` | `initial_activation` | Activation confirmation | 24h from `pay.confirmed_at` | `AUTO` |
| Renewal | W5 §5.5 | `pay`, `ent`, `pub` | `entitlement_renewed` | `renewal` | Activation confirmation | 24h from `pay.confirmed_at` | `AUTO` |
| Post-grace reactivation | W5 §5.5a | `pay`, `ent`, `card`, `route`, `pub` | `entitlement_reactivated` | `reactivation` | Activation confirmation | 24h from `pay.confirmed_at` | `AUTO` |
| Pre-payment AUP decline | (not in customer workflows; BO1 only) | Application record | `application_declined` | — | Decline notice | Before payment collection | `PSO` / `FDR` |
| Post-payment AUP decline + refund | W5 §5.5a | `pay` (refunded) | `application_declined` | — | Decline + refund notice | Immediate | `PSO` / `FDR` |
| Provisioning SLA breach | (BO1 only) | `evt` | `provisioning_sla_breach` | — | Refund initiated | At 24h | `AUTO` + `FDR` escalation |
| Suspension | W4 §4.x (operator side) | `case`, `ent`, `card`, `pub` | `entitlement_suspended` | `suspension` | Suspension notice | 7-day review | `PSO` |
| Restoration | W4 §4.x (operator side) | `case`, `ent`, `card`, `pub` | `entitlement_restored` | `restoration` | Restoration notice | At resolution (≤ 14 days) | `PSO` |
| Revocation | W4 §4.x (operator side) | `case`, `ent`, `card`, `pub` | `entitlement_revoked` | `revocation` | Revocation notice | At decision | `FDR` |
| Recovery support | W1 §1.4 | `acct` (read) | `recovery_code_used` | — | Process communication | None (customer-driven) | `OPR` (communication only) |
| Signing-key incident | (BO2 only) | Key registry, `pub` | — | Compensating pubs | If threshold reached | None fixed; fail-closed | `FDR` |

---

## Governance decisions

The following decisions were surfaced during specification. All are genuine
gaps not derivable from the governing documents.

**GD-1 — Acceptable-use review criteria are not defined**

The Entitlement Specification (§6, §8) states that acceptable-use review
exists and may decline applications, renewals, and reactivations. It does
not define what constitutes a violation or what criteria the review applies.

*Required before pilot:* `FDR` must define and document the AUP criteria
against which applications are reviewed. The criteria must be on record
before any application is declined on AUP grounds. The criteria themselves
need not be publicly disclosed, but the existence of a review and the
reason code for a decline must be attributable.

**GD-2 — `provisioning_sla_breach` is not in Data Model V1**

This operation prescribes `provisioning_sla_breach` as an operational
evidence record. Data Model V1 at `193dcfa` does not include this event.
A data model amendment is required before implementation. The event schema
must include `deadline`, `breach_detected_at`, `pay_id`, `ent_id` (if
created), and `operator_id`.

**GD-3 — `application_declined` is not in Data Model V1**

This operation prescribes `application_declined` as an operational evidence
event for both pre-payment and post-payment declines. Data Model V1 does not
include this event. A data model amendment is required. The event schema must
include `decline_phase` (`pre_payment` / `post_payment`), `reason_code`,
`authority_id`, `pay_id` (null if pre-payment), and `operator_id`.

**GD-4 — Block confirmation threshold for Polygon USDC is not defined**

The Payment model supports `polygon_usdc` as a payment rail. Confirmed
payment means the on-chain transaction has reached finality, but the number
of block confirmations required before `pay.confirmed_at` is set is not
specified in any governing document. This threshold must be defined and
documented before the Polygon USDC payment rail accepts customer payments.
The threshold must balance fraud risk (chain reorganization) against
provisioning latency.

---

## Amendment log

### 2026-08-02 — Initial issue

Business Operations V1 issued as governing operator-facing specification.
Two workflows: Purchase and Provisioning (BO1, six sub-operations) and
Protection and Recovery (BO2, eight sub-operations). Four governance decisions
surfaced: GD-1 (AUP criteria), GD-2 (provisioning_sla_breach event),
GD-3 (application_declined event), GD-4 (block confirmation threshold).
